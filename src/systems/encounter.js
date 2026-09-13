/**
 * 奇遇系统 —— 触发、门槛判定与效果 DSL 解释器。
 *
 * 奇遇是被动事件：主循环每秒调 tickEncounter(dt)，到点后抽一条 ENCOUNTERS，
 * 通过 bus 通知 UI 弹窗（事件名 'encounter:trigger'，非 EV 常量，避免改 core 契约）。
 * UI 选定选项后调 resolveEncounter(index)，本模块结算并返回 logs / battle。
 *
 * ────────────────────────── 效果 DSL ──────────────────────────
 * 支持 data/encounters.js 实际用到的全部 type：
 *   cult      修为       { amount:[min,max] }           可负
 *   stones    灵石       { quality:'low'|'mid'|'high', amount:[min,max] }  可负
 *   material  灵材       { id, amount:[min,max] }
 *   pill      丹药       { id, amount:[min,max] }
 *   technique 功法       { pool:'fan'|'ling'|'xian'|'shen', amount:1 }
 *   equip     装备       { pool, amount:1 }
 *   hp        气血       { amount:[min,max] }           可负（负为扣血）
 *   attr      永久属性   { attr:'comprehension'|'daoHeart'|'spiritSense'|'luck', amount:[min,max] }  可负
 *   buff      限时增益   { id, duration, mult }
 *   battle    战斗       { power, enemy?, name? }
 *                        power 决定强度（相对玩家属性合成，与敌人表无关）
 *                        enemy 指定"皮"——从 enemies.js 里挑一个招式风味贴近剧情的敌人，
 *                              只贡献技能组与图鉴 id，不改数值；不填则按 power 在境界池里抽
 *                        name  叙事称呼，覆盖皮的本名（如 en_canglang 显示为"白毛野物"）
 *   lifespan  寿元       { amount:[min,max] }           可负
 *   flag      剧情标记   { key, value }
 *
 * 三个作者标红的集成点，本文件的处理方式：
 *   1. 负数生效：stones 负数走 spendStones（不足则跳过并提示），attr 负数直接写回
 *      state.player.attributes（只保证派生属性不为负，不做 Math.max(0,…) 一刀切）。
 *   2. 跨境界保值：
 *      - cult 以 baseSpeed/10 为基准，再乘"当前境界所需修为补正"，否则后期形同虚设；
 *      - stones 以"该奇遇最低境界的收入"为基线，按当前境界 incomePerMin 折算，
 *        在作者标定的境界打是 1 倍，越级后再打按收入增长放大。
 *   3. battle 与奖励混排：遇 battle 立即结算；若战败，其后所有正向奖励效果全部跳过，
 *      但负数消耗效果（扣血/扣灵石/减属性/跌修为）与 flag 照常生效。
 *
 * 本文件禁止 DOM 操作；随机一律走 core/rng.js。
 */

import { state, noteKind, realm, addStones, spendStones, addMaterial, addPill, pillCount, materialCount } from '../core/state.js';
import { emit, EV } from '../core/bus.js';
import { randFloat, weightedPick, rollAmount, rollOutcome, shuffle } from '../core/rng.js';
import { fmt, fmtClock } from '../core/format.js';
import { calcComprehension, calcDaoHeart, calcSpiritSense, calcLuck, calcCultSpeed, addBuff, gainCult } from './cultivation.js';
import { autoResolve, isInBattle, incomePerMin, battleSpoils } from './combat.js';
import { noteCultLoss } from '../core/telemetry.js';
import { record as codexRecord } from './codex.js';
import { encounterGoodBias, encounterRewardMult, fallToDemonic, isXiedao } from './stance.js';
import { ENCOUNTERS } from '../data/encounters.js';
import { TECHNIQUES } from '../data/techniques.js';
import { EQUIPMENTS } from '../data/equipments.js';
import { materialById } from '../data/materials.js';
import { pillById } from '../data/pills.js';
import { enemiesByRealm } from '../data/enemies.js';
import { beastById } from '../data/beasts.js';
import { addBeast, attemptTame } from './beast.js';

const CHANNEL = 'system';

/** tier → 日志样式 */
const TIER_CLS = {
  good: 'event-good',
  bad: 'event-bad',
  neutral: 'event-special',
  rare: 'event-special',
};

/** buff id → 引擎 stat 与中文名 */
const BUFF_META = {
  buff_cult: { stat: 'cult', name: '灵力充盈' },
  buff_daoheart: { stat: 'daoHeart', name: '心境澄明' },
  buff_luck: { stat: 'luck', name: '气运加身' },
  buff_combat: { stat: 'atk', name: '战意高昂' },
};

function pushLog(list, text, cls) {
  list.push({ text, cls: cls || 'event-special' });
}

/**
 * 战斗行单独打 phase 标，供 applyChoice 把它们提到 outcome 文案之前。
 *
 * 为什么必须提前：outcome.log 写的是"这个选择最终带来了什么"，
 * 而战斗是这段因果的开头。若照原序播，玩家会先读到"那畜生低嚎着遁入林子"，
 * 紧接着又看到"你与白毛野物一场恶战"——同一件事先说没发生、再说发生了。
 * 只有标明哪几行是战斗行，才能在播日志前把它们插到正确的位置。
 */
function pushBattleLog(list, text, cls) {
  list.push({ text, cls: cls || 'event-battle', phase: 'battle' });
}

/** 统一出口：所有日志走 bus，channel=system */
function emitLog(text, cls) {
  emit(EV.LOG, { text, cls: cls || 'event-special', channel: CHANNEL });
}


// ==================== 跨境界缩放 ====================

/**
 * 修为奖励缩放。
 * 基准是 brief 指定的 baseSpeed/10；再叠加"当前境界所需修为"补正 ——
 * needCult 从炼气 900 涨到渡劫 6000 万（约 6.6 万倍），只按 baseSpeed/10（最多 26 倍）
 * 后期奖励仍会形同虚设，故加这一层，使奇遇修为大致保持"当前境界的 3%~20%"。
 */
export function cultRewardScale() {
  const r = realm();
  const need = r.needCult ?? 900;
  // 让"一次奇遇的修为"始终锚定在当前境界的百分比上，而不是绝对值。
  // 旧实现是 (baseSpeed/10) × (needCult/20000)：这两项一乘是平方级增长，
  // 渡劫期系数高达 ×75000，一次高 roll 能给 15 亿修为——是整个人境界需求的 25 倍，
  // 抽到一次直接跳一个大境界。现在改为线性锚定 needCult：
  // 文案里典型量级（约 200）对应当前境界的约 2%，配合下面的硬上限使用。
  return Math.max(1, need * 0.0001);
}

/**
 * 灵石奖励缩放：以该奇遇最低境界的收入为基线，按当前境界收入折算。
 * 在作者标定的境界打 = 1 倍（保住原始调参），越级再打按收入增长放大。
 */
export function stoneRewardScale(minRealm) {
  const baseIncome = incomePerMin(minRealm ?? state.player.realmIndex);
  return incomePerMin() / Math.max(1, baseIncome);
}

// ==================== req 门槛 ====================

/** 读取用于 req 判定的当前属性值 */
function attrValue(name) {
  switch (name) {
    case 'comprehension': return calcComprehension();
    case 'daoHeart': return calcDaoHeart();
    case 'spiritSense': return calcSpiritSense();
    case 'luck': return calcLuck();
    default: return state.player.attributes?.[name] ?? 0;
  }
}

/**
 * 检查 choice.req 是否满足。
 * @returns {{ok:boolean, reason:string}} 不满足时给出可直接展示的原因
 */
export function isChoiceAvailable(choice) {
  const req = choice?.req;
  if (!req) return { ok: true, reason: '' };

  if (req.attr != null) {
    const cur = attrValue(req.attr);
    if (cur < req.min) {
      const label = { comprehension: '悟性', daoHeart: '道心', spiritSense: '神识', luck: '气运' }[req.attr] || req.attr;
      return { ok: false, reason: `需${label} ${req.min}（当前 ${Math.floor(cur)}）` };
    }
  }
  if (req.item != null) {
    const need = req.count ?? 1;
    const have = pillCount(req.item) + materialCount(req.item);
    if (have < need) {
      const name = pillById(req.item)?.name || materialById(req.item)?.name || req.item;
      return { ok: false, reason: `需${name} ×${need}（当前 ${have}）` };
    }
  }
  if (req.realm != null) {
    if (state.player.realmIndex < req.realm) {
      return { ok: false, reason: `需更高境界方可应对` };
    }
  }
  return { ok: true, reason: '' };
}

// ==================== 抽取与展示 ====================

/**
 * 按境界 + 气运抽一条奇遇。
 * @param opts { tier, tiers, preferTier, exclude }
 */
export function rollEncounter(opts = {}) {
  const ri = state.player.realmIndex;
  const inRealm = (e) => ri >= (e.minRealm ?? 0) && (e.maxRealm == null || ri <= e.maxRealm);

  let pool = ENCOUNTERS.filter(inRealm);
  if (opts.tier) pool = pool.filter((e) => e.tier === opts.tier);
  if (opts.tiers) pool = pool.filter((e) => opts.tiers.includes(e.tier));
  pool = pool.filter((e) => !(e.once && state.flags[e.id]) && !(opts.exclude || []).includes(e.id));

  if (pool.length === 0) {
    // 兜底：放宽 once（全部做过时至少还能遇到可重复的）
    pool = ENCOUNTERS.filter((e) => inRealm(e) && !e.once);
  }
  if (pool.length === 0) return null;

  const luck = calcLuck();
  const enc = weightedPick(pool, (e) => {
    let w = Math.max(0, e.weight ?? 1);
    if (e.tier === 'rare') w *= 1 + (luck - 50) / 100;
    else if (e.tier === 'good') w *= 1 + (luck - 50) / 200;
    // 立场倾向：正道多善缘，邪道多杀劫。
    // 但邪道并不吃亏——它的收益乘子更高（见 encounterRewardMult），
    // 这是"高风险高收益"而不是"纯惩罚"。
    const bias = encounterGoodBias();
    if (bias !== 0) {
      if (e.tier === 'good' || e.tier === 'rare') w *= 1 + bias * 2;
      else if (e.tier === 'bad') w *= 1 - bias * 2;
    }
    if (opts.preferTier && e.tier === opts.preferTier) w *= 3;
    return w;
  });
  return enc || null;
}

/**
 * 转成 UI 可直接渲染的数据。
 *
 * 两个刻意的设计：
 *
 * 1. **不给 hint**。文案里写了"风险高、收益大"这类提示，等于替玩家做了判断，
 *    奇遇就退化成了"看提示点按钮"。现在只给选项文本本身，让玩家靠文字判断局势。
 *
 * 2. **打乱显示顺序**。实测 61 条奇遇里有 57.4% 是"第一个选项收益最高"
 *    （无偏应为 33.3%），玩家闭眼选第一个就能稳赚。打乱后位置不再携带信息。
 *    注意 `index` 返回的仍是**原始下标**，UI 回传这个值即可，不需要额外映射。
 *
 * @param enc   奇遇对象
 * @param order 显示顺序（真实下标的排列）；不传则按原序
 */
export function presentEncounter(enc, order = null) {
  if (!enc) return null;
  const seq = order || (enc.choices || []).map((_, i) => i);
  return {
    id: enc.id,
    title: enc.title,
    desc: enc.desc,
    tier: enc.tier,
    choices: seq.map((realIdx) => {
      const c = (enc.choices || [])[realIdx];
      if (!c) return null;
      const avail = isChoiceAvailable(c);
      return {
        index: realIdx,          // 原始下标，UI 结算时回传它
        text: c.text,
        disabled: !avail.ok,
        reason: avail.reason,
        // 不可逆的重大抉择要被标出来，由 UI 做二次确认。
        // 玩家的选择应当是"知情后的决定"，而不是手滑点到的。
        major: hasMajorEffect(c),
      };
    }).filter(Boolean),
  };
}

// ==================== 效果 DSL 解释器 ====================

/**
 * 该选项是否包含"不可逆的重大效果"。
 * 目前只有立场变更（堕入魔道）算，UI 会据此弹二次确认。
 */
function hasMajorEffect(choice) {
  for (const o of choice?.outcomes || []) {
    for (const e of o.effects || []) {
      if (e.type === 'stance') return true;
    }
  }
  return false;
}

/** 是否为"纯消耗"类型（战败后仍要生效）。具体判负在运行期按 amount 符号决定。 */
function isNegativeEffect(type, amt) {
  if (type === 'flag') return true; // 剧情标记不因战败而丢失
  return amt < 0;
}

/**
 * 解释并执行 DSL 效果数组。
 * @param effects 效果数组
 * @param ctx     { minRealm }（可选，用于灵石/修为的跨境界缩放基准）
 * @returns {{logs:Array<{text,cls}>, rewards:Object, battle:null|{enemyId,power,result}}}
 */
export function applyEffects(effects, ctx = {}) {
  const logs = [];
  const rewards = { stones: 0, materials: {}, pills: {}, cult: 0, attrs: {}, hp: 0, techniques: [], equips: [], beasts: [], lifespan: 0, flags: {} };
  let battle = null;
  let battleLost = false;
  let skippedByLoss = false;

  const baseRealm = ctx.minRealm ?? state.player.realmIndex;

  for (const t of effects || []) {
    if (!t || !t.type) continue;

    // ---- battle 最先结算，作为后续奖励的闸门 ----
    if (t.type === 'battle') {
      // 对手身份优先取数据里点名的"皮"（enemy），没有才按 power 在境界池里抽。
      // 抽出来的皮与剧情毫无关系——在炼气期打"白毛野物"，抽中的可能是拦路山贼。
      const enemyId = t.enemy || encounterEnemyId(t.power);
      // silent：逐条战报不直接灌进日志，改由 UI 按玩家的「战报播放」开关决定是否弹窗。
      // 不这样做的话，日志会被几十条战报刷屏，弹窗再播一遍就是同一场看两遍。
      // 注意 silent 只挡日志，不挡结算 —— 掉落、修为、扣丹、气血回写照常发生。
      const res = autoResolve(enemyId, { power: t.power, silent: true, name: t.name });
      battle = { enemyId, power: t.power, result: res };
      if (res.win) {
        pushBattleLog(logs, `你与${res.enemyName}一场恶战，终将其击退。`, 'event-battle');
        // 战报被 silent 挡在日志外，补一条战利摘要，
        // 让关掉弹窗的玩家也知道这一战拿到了什么。
        const spoils = battleSpoils(res.rewards);
        if (spoils) pushLog(logs, spoils, 'event-good');
      } else {
        battleLost = true;
        pushBattleLog(logs, `你力战不敌${res.enemyName}，身受重创。`, 'event-bad');
      }
      continue;
    }

    const hasAmt = t.type !== 'buff' && t.type !== 'flag' && t.type !== 'beast';
    const amt = hasAmt ? rollAmount(t.amount) : 0;

    // 战败后：只保留负数消耗与 flag，其余正向奖励跳过
    if (battleLost && !isNegativeEffect(t.type, amt)) {
      skippedByLoss = true;
      continue;
    }

    switch (t.type) {
      // ---------------- 修为（可负） ----------------
      case 'cult': {
        if (amt >= 0) {
          // 硬上限锚定在"挂机产出速度"上，而不是"境界需求"。
          //
          // 这是关键：奇遇约 68 秒触发一次，那么一个境界里会触发
          // (境界时长/68) 次奇遇。若单次奖励是 needCult 的固定百分比，
          // 事件总贡献就是 时长 × 百分比 —— 而时长本身正比于 needCult，
          // 于是贡献量随境界呈**平方级**膨胀：后期事件会反客为主，
          // 把挂机修炼这条主线彻底压垮。
          //
          // 锚定到 calcCultSpeed() 后，单次奇遇 ≈ 一个冷却周期挂机产出的 25%，
          // 无论哪个境界，事件对总进度的贡献都稳定在 1/4 左右。
          const cap = Math.max(calcCultSpeed() * 68 * 0.25, 300);
          const scaled = Math.min(Math.round(amt * cultRewardScale() * encounterRewardMult()), cap);
          const got = gainCult(scaled, '奇遇');
          rewards.cult += got;
          pushLog(logs, `修为增长 ${fmt(got)}。`, 'event-good');
        } else {
          const before = state.player.cult;
          state.player.cult = Math.max(0, before + amt);
          rewards.cult += state.player.cult - before;
          noteCultLoss('奇遇', before - state.player.cult);
          pushLog(logs, `修为倒退 ${fmt(before - state.player.cult)}。`, 'event-bad');
        }
        break;
      }

      // ---------------- 灵石（可负，按境界折算） ----------------
      case 'stones': {
        const q = t.quality || 'low';
        const rate = q === 'high' ? 10000 : q === 'mid' ? 100 : 1;
        const label = q === 'high' ? '上品' : q === 'mid' ? '中品' : '下品';
        const scale = stoneRewardScale(baseRealm);
        const lowValue = Math.round(amt * rate * (amt >= 0 ? scale : 1));
        if (lowValue >= 0) {
          addStones(lowValue);
          rewards.stones += lowValue;
          pushLog(logs, `获得灵石 ${fmt(lowValue)} 下品（${fmt(amt)} ${label}）。`, 'event-good');
        } else {
          const cost = Math.abs(lowValue);
          if (spendStones(cost)) {
            rewards.stones -= cost;
            pushLog(logs, `失去灵石 ${fmt(cost)} 下品。`, 'event-bad');
          } else {
            pushLog(logs, `你囊中羞涩，竟凑不出 ${fmt(cost)} 下品灵石。`, 'event-bad');
          }
        }
        break;
      }

      // ---------------- 灵材（可负） ----------------
      case 'material': {
        const n = Math.round(amt);
        if (n === 0) break;
        addMaterial(t.id, n);
        rewards.materials[t.id] = (rewards.materials[t.id] || 0) + n;
        const name = materialById(t.id)?.name || t.id;
        pushLog(logs, n > 0 ? `获得${name} ×${n}。` : `失去${name} ×${-n}。`, n > 0 ? 'event-good' : 'event-bad');
        if (n > 0) emit(EV.ITEM_GAIN, { kind: 'material', id: t.id, count: n });
        break;
      }

      // ---------------- 丹药（可负） ----------------
      case 'pill': {
        const n = Math.round(amt);
        if (n === 0) break;
        addPill(t.id, n);
        rewards.pills[t.id] = (rewards.pills[t.id] || 0) + n;
        const name = pillById(t.id)?.name || t.id;
        pushLog(logs, n > 0 ? `获得${name} ×${n}。` : `失去${name} ×${-n}。`, n > 0 ? 'event-good' : 'event-bad');
        if (n > 0) emit(EV.ITEM_GAIN, { kind: 'pill', id: t.id, count: n });
        break;
      }

      // ---------------- 功法 ----------------
      case 'technique': {
        const pool = TECHNIQUES.filter((x) => x.quality === t.pool && x.minRealm <= state.player.realmIndex);
        const unknown = pool.filter((x) => !state.techniques.known?.[x.id]);
        const got = unknown.length ? unknown[Math.floor(randFloat(0, unknown.length))] : null;
        if (got) {
          state.techniques.known = state.techniques.known || {};
          state.techniques.known[got.id] = { level: 1, exp: 0, mastered: false };
          rewards.techniques.push(got.id);
          pushLog(logs, `你参悟了功法《${got.name}》。`, 'event-special');
          emit(EV.ITEM_GAIN, { kind: 'technique', id: got.id });
        } else {
          pushLog(logs, '遍寻之下，并无合你根骨的功法。', 'event-special');
        }
        break;
      }

      // ---------------- 装备 ----------------
      case 'equip': {
        const pool = EQUIPMENTS.filter((x) => x.quality === t.pool && x.minRealm <= state.player.realmIndex);
        if (pool.length) {
          const base = pool[Math.floor(randFloat(0, pool.length))];
          const uid = state.equipment.nextUid ?? 1;
          state.equipment.nextUid = uid + 1;
          const inst = { uid, baseId: base.id, quality: t.pool, level: 1, affixes: [] };
          state.equipment.owned.push(inst);
          rewards.equips.push(base.id);
          pushLog(logs, `你得到一件${base.name}。`, 'event-special');
          emit(EV.ITEM_GAIN, { kind: 'equip', id: base.id, uid });
        } else {
          pushLog(logs, '器物虽有，却非你此刻所能驾驭。', 'event-special');
        }
        break;
      }

      // ---------------- 气血（可负） ----------------
      case 'hp': {
        const maxHp = state.player.maxHp || 1;
        if (amt >= 0) {
          const before = state.player.hp;
          state.player.hp = Math.min(maxHp, state.player.hp + amt);
          const got = Math.round(state.player.hp - before);
          rewards.hp += got;
          pushLog(logs, `气血恢复 ${fmt(got)}。`, 'event-good');
        } else {
          const before = state.player.hp;
          // 事件扣血不致死，最低留 1 点，避免挂机时被随机事件直接打空
          state.player.hp = Math.max(1, state.player.hp + amt);
          const lost = Math.round(before - state.player.hp);
          rewards.hp -= lost;
          pushLog(logs, `气血受损 ${fmt(lost)}。`, 'event-bad');
        }
        break;
      }

      // ---------------- 永久属性（可负） ----------------
      case 'attr': {
        const key = t.attr;
        if (!key) break;
        state.player.attributes = state.player.attributes || {};
        const cur = state.player.attributes[key] || 0;
        // 只把"派生属性不为负"作为下限，负数照常生效
        const floor = -(state.player.base?.[key] ?? 0);
        const next = Math.max(floor, cur + amt);
        state.player.attributes[key] = next;
        const delta = next - cur;
        rewards.attrs[key] = (rewards.attrs[key] || 0) + delta;
        const label = { comprehension: '悟性', daoHeart: '道心', spiritSense: '神识', luck: '气运' }[key] || key;
        pushLog(logs, delta >= 0 ? `${label}提升 ${delta}。` : `${label}受损 ${-delta}。`, delta >= 0 ? 'event-good' : 'event-bad');
        break;
      }

      // ---------------- 限时 Buff ----------------
      case 'buff': {
        const meta = BUFF_META[t.id] || { stat: t.id, name: t.id };
        addBuff({
          id: t.id,
          name: meta.name,
          stat: meta.stat,
          mult: t.mult,
          duration: t.duration || 600,
        });
        pushLog(logs, `你只觉${meta.name}，持续 ${fmtClock(t.duration || 600)}。`, 'event-good');
        break;
      }

      // ---------------- 寿元（可负） ----------------
      case 'lifespan': {
        // state.player.lifespan 尚未在 createInitialState 中定义，这里惰性初始化；
        // 建议后续补进 core/state.js 契约（本任务只允许改 3 个系统文件）。
        if (state.player.lifespan == null) state.player.lifespan = realm().lifespan ?? 100;
        state.player.lifespan = Math.max(1, state.player.lifespan + amt);
        rewards.lifespan += amt;
        pushLog(logs, amt >= 0 ? `寿元增加 ${fmt(amt)} 年。` : `寿元折损 ${fmt(-amt)} 年。`, amt >= 0 ? 'event-special' : 'event-bad');
        break;
      }

      // ---------------- 立场变更 ----------------
      case 'stance': {
        // 目前只有"堕入魔道"一个入口。这是不可逆的重大选择，
        // 奇遇文案里必须写清楚代价，UI 层会在选项上做二次确认。
        if (t.value === 'xiedao') {
          const r = fallToDemonic();
          if (!r.ok) pushLog(logs, r.reason || '你已无法回头。', 'event-bad');
        }
        break;
      }

      // ---------------- 灵兽（收服） ----------------
      case 'beast': {
        // { type:'beast' }              → 按境界随机抽一只候选，仍可能错过（45% 基础成功率）
        // { type:'beast', id:'bst_x' }  → 指定物种，必得（用于剧情明确"这只归你"的场合）
        // 注意：本效果不带 amount，已在 hasAmt 里排除；战败时会被跳过（不会败了还收服）。
        if (t.id) {
          const base = beastById(t.id);
          const inst = base ? addBeast(t.id) : null;
          if (inst) {
            rewards.beasts.push({ uid: inst.uid, baseId: inst.baseId, star: inst.star });
            pushLog(logs, `【${base.name}】${'★'.repeat(inst.star)} 从此跟在你身边。`, 'event-special');
          } else {
            pushLog(logs, '那兽终究没能留下。', 'event-special');
          }
          break;
        }
        const tr = attemptTame();
        if (tr.cand && tr.inst) {
          rewards.beasts.push({ uid: tr.inst.uid, baseId: tr.inst.baseId, star: tr.inst.star });
          pushLog(logs, `它不再挣动，【${tr.cand.base.name}】${'★'.repeat(tr.inst.star)} 认了你作主。`, 'event-special');
        } else if (tr.cand) {
          pushLog(logs, `那${tr.cand.base.name}到底野性难驯，一扭头钻进了林子。`, 'event-special');
        }
        break;
      }

      // ---------------- 剧情标记 ----------------
      case 'flag': {
        state.flags[t.key] = t.value ?? true;
        rewards.flags[t.key] = state.flags[t.key];
        break;
      }

      default:
        // 未知 type 静默忽略，避免数据新增字段直接崩掉旧引擎
        break;
    }
  }

  if (battleLost && skippedByLoss) {
    pushLog(logs, '战败之下，后续机缘未能到手。', 'event-bad');
  }

  return { logs, rewards, battle };
}

/** 按奇遇 power 选一个"境界适配"的敌人做皮：power 越大，选取池内越强的敌人 */
function encounterEnemyId(power) {
  const pool = enemiesByRealm(state.player.realmIndex);
  if (!pool || pool.length === 0) return 'en_yezhu';
  const sorted = [...pool].sort((a, b) => a.power - b.power);
  const k = Math.max(0, Math.min(1, (power ?? 30) / 140));
  return sorted[Math.round(k * (sorted.length - 1))].id;
}

// ==================== 选项结算 ====================

/**
 * 结算某选项。
 * @returns {{logs:Array, outcome:string, battle:Object|null, rewards:Object}}
 */
export function applyChoice(enc, index) {
  const choice = enc?.choices?.[index];
  if (!choice) return { logs: [], outcome: null, battle: null, rewards: {} };

  const avail = isChoiceAvailable(choice);
  if (!avail.ok) {
    return { logs: [{ text: `条件不足：${avail.reason}`, cls: 'event-bad' }], outcome: null, battle: null, rewards: {} };
  }

  const outcome = rollOutcome(choice.outcomes);
  const cls = TIER_CLS[enc.tier] || 'event-special';
  const outcomeLog = outcome?.log ? [{ text: outcome.log, cls }] : [];

  const eff = applyEffects(outcome?.effects || [], { minRealm: enc.minRealm });

  // 日志时序：战斗行插到 outcome 文案之前，读起来才是「打起来了 → 打完的结果与收获」。
  // outcome.log 往往写成既成结局（"那妖物低嚎着遁入林子"），若照原序播，
  // 就成了"先说它跑了、再说你与它恶战一场"。
  const battleLines = eff.logs.filter((l) => l.phase === 'battle');
  const restLines = eff.logs.filter((l) => l.phase !== 'battle');

  // 战败时丢掉 outcome.log：它是按"打赢了"写的（"头狼一倒，狼群四散"、"猎户解下皮囊相赠"），
  // 照播就是"你力战不敌头狼"下一行说"头狼一倒"。末尾那句"后续机缘未能到手"
  // 已经把这段的结果交代清楚了，缺的叙事不如不叙。
  const lostBattle = !!(eff.battle && eff.battle.result && !eff.battle.result.win);
  const logs = [...battleLines, ...(lostBattle ? [] : outcomeLog), ...restLines];

  if (enc.once) state.flags[enc.id] = true;
  state.stats.encounters = (state.stats.encounters || 0) + 1;
  // V6.0 功课：经历过的奇遇种类（去重）
  noteKind('encounters', enc.id);
  // 图鉴留痕：这条奇遇你经历过了
  try { codexRecord('encounters', enc.id); } catch { /* 图鉴异常不影响奇遇结算 */ }

  // 统一广播日志（logs 已经把 battle / outcome / 其余效果按展示顺序拼好了）
  for (const l of logs) emitLog(l.text, l.cls);

  return { logs, outcome: enc.tier, battle: eff.battle, rewards: eff.rewards, title: enc.title };
}

// ==================== 冷却与主循环 ====================

const CD_MIN = 45;   // 奇遇冷却下限（秒），比 demo 的 20 更疏，减少打断
const CD_MAX = 90;

let _nextIn = 0;
let _started = false;
let _pending = null;      // 待玩家选择的奇遇
let _pendingOrder = null; // 本次奇遇的选项显示顺序（真实下标排列）
let _paused = false;      // UI 弹窗 / 播放战报时置 true

/** 待处理的奇遇（UI 轮询用） */
export function currentEncounter() { return _pending; }

/** 本次奇遇的选项显示顺序（UI 需要重现同一顺序时用） */
export function currentOrder() { return _pendingOrder; }

/** 直接塞入一条奇遇（探险触发 higher-tier 奇遇时用） */
export function queueEncounter(enc) {
  if (!enc) return null;
  _pending = enc;
  // 每次触发都重新洗牌：同一次奇遇弹出的顺序是固定的（避免刷新重掷），
  // 但下次遇到同一条奇遇时顺序会变，玩家无法靠"记位置"来套路。
  _pendingOrder = shuffle((enc.choices || []).map((_, i) => i));
  const view = presentEncounter(enc, _pendingOrder);
  emit(EV.LOG, { text: `【奇遇】${enc.title}`, cls: 'event-special', channel: CHANNEL });
  emit('encounter:trigger', { enc, view });
  return view;
}

/** UI 选定后调用：结算并清空待处理 */
export function resolveEncounter(index) {
  const enc = _pending;
  _pending = null;
  _pendingOrder = null;
  if (!enc) return { logs: [], outcome: null, battle: null, rewards: {} };
  return applyChoice(enc, index);
}

/** UI 可在弹窗/战报播放期间暂停奇遇触发 */
export function pauseEncounters(v = true) { _paused = !!v; }

/** 距离下次奇遇触发的秒数（UI 展示用） */
export function encounterCooldown() { return Math.max(0, _nextIn); }

/**
 * 主循环每秒调用。
 * 战斗进行中 / 已有待处理奇遇 / UI 明确暂停时，都不触发。
 */
export function tickEncounter(dt) {
  if (_paused || _pending || isInBattle()) return;
  if (!_started) { _started = true; _nextIn = randFloat(CD_MIN, CD_MAX); }
  _nextIn -= dt;
  if (_nextIn > 0) return;

  const enc = rollEncounter();
  _nextIn = randFloat(CD_MIN, CD_MAX);
  if (enc) queueEncounter(enc);
}
