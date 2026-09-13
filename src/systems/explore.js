/**
 * 主动探险系统。
 *
 * 定位：与"被动奇遇"区分开 —— 探险是玩家主动点击的高收益行为，消耗气血、有冷却。
 * 结果池：战斗 40% / 拾取灵材 35% / 触发一条 higher-tier 奇遇 25%。
 * 所有收益都按境界缩放（灵石走 combat.incomeScale，材料按 realmTier 取档）。
 *
 * 本文件禁止 DOM 操作；随机一律走 core/rng.js。
 */

import { state, addStones, addMaterial } from '../core/state.js';
import { emit, EV } from '../core/bus.js';
import { rand, randInt, pick, chance } from '../core/rng.js';
import { fmt, fmtClock } from '../core/format.js';
import { calcMaxHp } from './cultivation.js';
import { autoResolve, incomeScale, realmTier, battleSpoils } from './combat.js';
import { rollEncounter, queueEncounter } from './encounter.js';
import { enemiesByRealm } from '../data/enemies.js';
import { materialsByTier, materialById } from '../data/materials.js';
import { attemptTame } from './beast.js';

/** 探险冷却（秒） */
export const EXPLORE_CD = 30;

/**
 * 战斗胜利后遭遇可收服灵兽的概率。
 * 与结果池的三档权重不同 —— 这是"打赢之后额外掷的一次"，不改 40/35/25 的分配。
 * 单次探险出兽 ≈ 0.40 × 0.12 × 0.45 ≈ 2.2%，且八成是 1~2★，
 * 靠放生换灵材形成"抓 → 放 → 再抓"的循环。
 */
const TAME_ENCOUNTER = 0.12;

/** 探险气血消耗比例（占上限） */
const HP_COST_PCT = 0.12;

let _cd = 0;

function log(text, cls, channel = 'system') {
  emit(EV.LOG, { text, cls, channel });
}

/** UI 展示用的探险消耗。 */
export function exploreCost() {
  const hp = Math.max(1, Math.round(calcMaxHp() * HP_COST_PCT));
  return { hp, stones: 0, text: `气血 ${fmt(hp)}` };
}

/** 剩余冷却秒数（UI 展示用） */
export function exploreCooldown() { return Math.max(0, _cd); }
export function exploreCooldownTotal() { return EXPLORE_CD; }

/**
 * 是否可探险。
 * @returns {{ok:boolean, reason:string}}
 */
export function canExplore() {
  if (!state.player.alive) return { ok: false, reason: '你已倒下，无力远行' };
  if (_cd > 0) return { ok: false, reason: `休整中 ${fmtClock(_cd)}` };
  const cost = exploreCost();
  if (state.player.hp <= cost.hp) return { ok: false, reason: '气血不足，强行外出恐有性命之忧' };
  return { ok: true, reason: '' };
}

/**
 * 触发一次探险。
 * @returns {{ok:boolean, kind?:string, logs:Array, rewards:Object, battle?:Object, view?:Object, reason?:string}}
 */
export function explore() {
  const ok = canExplore();
  if (!ok.ok) return { ok: false, reason: ok.reason, logs: [], rewards: {} };

  const cost = exploreCost();
  state.player.hp = Math.max(1, state.player.hp - cost.hp);
  _cd = EXPLORE_CD;

  const logs = [];
  const rewards = { stones: 0, materials: {}, cult: 0, hp: -cost.hp };
  const scale = incomeScale();

  const roll = rand();
  let kind;

  if (roll < 0.40) {
    // ---------- 战斗 40% ----------
    kind = 'battle';
    const pool = enemiesByRealm(state.player.realmIndex);
    const def = pool.length ? pick(pool) : null;
    if (!def) {
      logs.push({ text: '你搜寻半日，不见敌踪。', cls: 'event-special' });
    } else {
      log(`你在野外遭遇了${def.name}！`, 'event-battle');
      // silent：逐条战报不进日志 —— 探险是 30 秒一次的高频操作，
      // 一场 20~130 条的流水会把日志面板冲干净。改为下面两行交代胜负与战利。
      // silent 只挡日志，结算（掉落 / 修为 / 扣丹 / 气血）照常。
      const res = autoResolve(def.id, { silent: true });
      logs.push({
        text: res.win ? `你与${res.enemyName}一场恶战，终将其击退。` : `你力战不敌${res.enemyName}，身受重创。`,
        cls: res.win ? 'event-battle' : 'event-bad',
      });
      const spoils = battleSpoils(res.rewards);
      if (spoils) logs.push({ text: spoils, cls: 'event-good' });

      rewards.stones += res.rewards.stones;
      rewards.cult += res.rewards.cult || 0;
      Object.assign(rewards.materials, res.rewards.materials);
      if (res.win) state.stats.exploreWins = (state.stats.exploreWins || 0) + 1;
      // 战后偶遇可收服的灵兽。遇到与抓住分开播报 ——
      // "看见了却追不上"才是捕捉这件事该有的遗憾感，也让 45% 的成功率可被玩家感知。
      if (res.win && chance(TAME_ENCOUNTER)) {
        const t = attemptTame();
        if (t.cand && t.inst) {
          kind = 'tame';
          rewards.beast = { uid: t.inst.uid, baseId: t.inst.baseId, star: t.inst.star };
          logs.push({ text: `烟尘散处，一只${t.cand.base.name}回头望你，终究跟了上来。`, cls: 'event-special' });
        } else if (t.cand) {
          logs.push({ text: `你瞥见一只${t.cand.base.name}掠过草叶，追之不及。`, cls: 'event-special' });
        }
      }
    }
  } else if (roll < 0.75) {
    // ---------- 拾取灵材 35% ----------
    kind = 'material';
    const tier = realmTier();
    const pool = materialsByTier(tier);
    const mat = pool.length ? pick(pool) : null;
    const n = randInt(1, 3);
    if (mat) {
      addMaterial(mat.id, n);
      rewards.materials[mat.id] = (rewards.materials[mat.id] || 0) + n;
      logs.push({ text: `你在山野间寻得${mat.name} ×${n}。`, cls: 'event-good' });
      emit(EV.ITEM_GAIN, { kind: 'material', id: mat.id, count: n });
    }
    const stones = Math.round(randInt(40, 120) * scale);
    addStones(stones);
    rewards.stones += stones;
    logs.push({ text: `你还在石缝里拾到 ${fmt(stones)} 下品灵石。`, cls: 'event-good' });
  } else {
    // ---------- higher-tier 奇遇 25% ----------
    kind = 'encounter';
    const enc = rollEncounter({ tiers: ['good', 'rare'], preferTier: 'rare' });
    if (enc) {
      const view = queueEncounter(enc);
      logs.push({ text: `你误入一处秘境，似有奇遇在等你……`, cls: 'event-special' });
      emit('explore:encounter', { enc, view });
      return { ok: true, kind, logs, rewards, view };
    }
    // 奇遇池抽空时退化为灵材收益
    const tier = realmTier();
    const mat = pick(materialsByTier(tier)) || materialById('mat_lingzhi');
    const n = randInt(1, 2);
    addMaterial(mat.id, n);
    rewards.materials[mat.id] = (rewards.materials[mat.id] || 0) + n;
    logs.push({ text: `你一无所获，只带回${mat.name} ×${n}。`, cls: 'event-special' });
  }

  for (const l of logs) log(l.text, l.cls);
  return { ok: true, kind, logs, rewards };
}

/** 主循环每秒调用：推进探险冷却 */
export function tickExplore(dt) {
  if (_cd > 0) _cd = Math.max(0, _cd - dt);
}
