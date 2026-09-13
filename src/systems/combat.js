/**
 * 回合制战斗系统。
 *
 * 设计目标：与 UI 解耦 —— `simulateBattle` 是纯逻辑，只吃两个战斗单位、吐一份完整战报；
 * UI 拿战报逐条播放即可，不需要在渲染层重算规则。
 *
 * ⚠ 战斗没有"手动/自动"两种玩法：玩家唯一的决策是**迎战还是避战**（体现在奇遇选项
 * 与是否点探险上）。一旦开打，结算一律由 autoResolve 这条唯一咽喉完成。
 * 玩家侧的 meta.battleReport 只决定"打完之后弹不弹战报"，与结算无关。
 * UI 层拿到 autoResolve / applyChoice 已经产出的战报去播即可，**绝不可重跑战斗**。
 *
 * ────────────────────────── 战斗规则（本文件即契约） ──────────────────────────
 * 1. 回合制，按 spd 决定出手顺序（同速玩家先手）；每回合双方各行动一次。
 * 2. 玩家行动：灵力足够（≥ 20% 上限，最低 8 点）时优先放灵力技（倍率 1.6），否则普攻（倍率 1.0）。
 * 3. 敌方按 skills 随机（等权）出一个招式，支持 damage / heal / buff / debuff / drain 五种 kind。
 * 4. 伤害 = max(1, atk × 倍率 × mp_power 加成 − def × 0.6) × 随机浮动[0.92, 1.08]；暴击再 × critDmg。
 * 5. 结算顺序（一次攻击内）：闪避 → 暴击 → 伤害 → 反伤(reflect) → 吸血(lifesteal) → 溅射(aoe)。
 *    - 闪避率由双方速度差推得：clamp(0.03 + (守方spd − 攻方spd) × 0.004, 0.02, 0.25)，无随机以外的来源。
 *    - 反伤：受击方的 reflect 词条，按所受伤害比例回敬攻击方。
 *    - 吸血：攻击方的 lifesteal 词条，按造成伤害比例回血。
 *    - 溅射：单挑没有第二目标，aoe 转译为对同一目标的余波追加伤害（比例如词条）。
 *    - extra_strike：玩家行动后有概率（词条值）追加一次 0.7 倍率的攻击，每回合至多一次。
 *    - mp_regen：玩家每回合恢复固定灵力。
 * 6. 回合上限 50：到顶仍不分胜负判玩家败，杜绝死循环。
 * 7. 玩家气血低于 20% 且有回血类丹药时，自动服用一次（每场限一次）。
 *
 * 词条来自 cultivation.aggregate().affixes，kind 语义见 data/techniques.js 顶部注释。
 *
 * 注意：本文件禁止出现任何 DOM 操作；随机一律走 core/rng.js。
 */

import {
  state, noteKind, addStones, addMaterial, pillCount, consumePill,
} from '../core/state.js';
import { activeBeastBattleSide, grantBattleExp } from './beast.js';
import { record as codexRecord, codexBonusAll } from './codex.js';
import { eventBonus } from './worldEvent.js';
import { emit, EV } from '../core/bus.js';
import { randFloat, chance, pick, rollAmount } from '../core/rng.js';
import { fmt } from '../core/format.js';
import {
  calcAtk, calcDef, calcSpd, calcMaxHp, calcMaxMp,
  calcCrit, calcCritDmg, aggregate, gainCult, calcCultSpeed,
} from './cultivation.js';
import { enemyById, enemiesByRealm } from '../data/enemies.js';
import { PILLS } from '../data/pills.js';

// ==================== 常量与工具 ====================

/** 回合上限，超过判玩家败（防死循环） */
export const ROUND_CAP = 50;

/** 玩家灵力技：消耗 = max(8, 20% 灵力上限)，伤害倍率 1.6 */
const MP_SKILL_POWER = 1.6;
function mpSkillCost(maxMp) {
  return Math.max(8, Math.floor(maxMp * 0.2));
}

/** 三档灵石折下品比率（与 state.stonesToLow 一致：1 中品 = 100 下品，1 上品 = 10000 下品） */
const STONE_LOW = { low: 1, mid: 100, high: 10000 };

/** economy.json 的收入基线（下品灵石/分钟），下标即 realmIndex 0..25。与 tools/out/economy.json 同步。 */
export const INCOME_PER_MIN = [
  10, 10, 10, 11, 11, 12, 12, 13, 14,          // 炼气
  33, 40, 48,                                    // 筑基
  140, 160, 200,                                 // 金丹
  600, 720, 860,                                 // 元婴
  2500, 2900, 3500,                              // 化神
  9000,                                          // 炼虚
  25000,                                         // 合体
  69000,                                         // 大乘
  180000, 180000,                                // 渡劫 / 飞升
];

/** 当前境界的每分钟收入基线 */
export function incomePerMin(realmIndex = state.player.realmIndex) {
  return INCOME_PER_MIN[Math.max(0, Math.min(realmIndex, INCOME_PER_MIN.length - 1))] ?? 10;
}

/** 收入缩放系数：以炼气期收入为 1 倍。用于战斗掉落、探险收益的跨境界保值。 */
export function incomeScale(realmIndex = state.player.realmIndex) {
  return incomePerMin(realmIndex) / INCOME_PER_MIN[0];
}

/** 境界索引 → 大致 tier（1~5），用于挑选同档材料 */
export function realmTier(realmIndex = state.player.realmIndex) {
  if (realmIndex <= 8) return 1;
  if (realmIndex <= 14) return 2;
  if (realmIndex <= 17) return 3;
  if (realmIndex <= 20) return 4;
  return 5;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function normAffix(af) {
  if (!af) return null;
  return { kind: af.kind ?? af.stat, value: af.value ?? 0, name: af.name || '' };
}

/** 参战词条白名单（其余如 hp_up/break_aid 已在 cultivation 里结算，战斗层不重复处理） */
const COMBAT_AFFIX = new Set(['crit_up', 'extra_strike', 'lifesteal', 'reflect', 'mp_regen', 'mp_power', 'aoe']);

function affixValue(side, kind) {
  let sum = 0;
  for (const af of side.affixes || []) {
    if (af.kind === kind) sum += af.value || 0;
  }
  return sum;
}

// ==================== 战斗单位构建 ====================

/**
 * 战斗相关的百分比加成汇总：图鉴的 combatPct + 天象里与战斗有关的部分。
 * 修为/气血这类通用属性走 cultivation 的乘区，只有"仅影响战斗"的加成在这里收口。
 */
function combatMultAll() {
  let m = 1;
  try {
    const cb = codexBonusAll();
    if (cb.combatPct) m *= 1 + cb.combatPct;
  } catch { /* 图鉴异常不应影响战斗 */ }
  try {
    const e = eventBonus('combatPct');
    if (e) m *= 1 + e;
  } catch { /* 天象异常不应影响战斗 */ }
  return m;
}

/** 构建玩家战斗单位（读写 state 的当前气血/灵力，不改状态） */
export function buildPlayerSide() {
  const maxHp = calcMaxHp();
  const maxMp = calcMaxMp();
  const affixes = (aggregate().affixes || [])
    .map(normAffix)
    .filter((af) => af && COMBAT_AFFIX.has(af.kind));
  return {
    name: state.player.name,
    side: 'player',
    hp: clamp(state.player.hp, 0, maxHp),
    maxHp,
    mp: clamp(state.player.mp, 0, maxMp),
    maxMp,
    atk: Math.round(calcAtk() * combatMultAll()),
    def: Math.round(calcDef() * combatMultAll()),
    spd: calcSpd(),
    crit: calcCrit(),
    critDmg: calcCritDmg(),
    affixes,
  };
}

/**
 * 构建敌方战斗单位。
 * @param enemyId data/enemies.js 的 id
 * @param opts   { hpMult, atkMult, defMult, power }
 *   - hpMult/atkMult/defMult：塔层或奇遇的线性缩放。
 *   - power：奇遇 DSL 的绝对难度标量（18~140）。给了 power 时，敌方数值改为
 *     "以玩家当前战力为锚的相对值"，保证任何境界下难度都有意义（否则早期遭遇必败）。
 */
export function buildEnemySide(enemyId, opts = {}) {
  const edef = enemyById(enemyId);
  if (!edef) return null;
  let base = { ...(edef.base || {}) };

  if (opts.power != null) {
    // 以玩家为锚合成对手：k=0 时约 0.7 倍血 / 0.55 倍攻，k=1 时约 2.3 倍血 / 1.5 倍攻
    const k = clamp(opts.power / 140, 0, 1);
    const pMaxHp = calcMaxHp() || 1;
    const pAtk = calcAtk() || 1;
    const pDef = calcDef() || 0;
    const pSpd = calcSpd() || 1;
    base = {
      hp: Math.round(pMaxHp * (0.7 + 1.6 * k)),
      atk: Math.round(pAtk * (0.55 + 0.95 * k)),
      def: Math.round(pDef * (0.4 + 0.9 * k)),
      spd: Math.round(pSpd * (0.6 + 0.6 * k)),
      crit: 0.05 + 0.1 * k,
    };
  }

  const hpMult = opts.hpMult ?? 1;
  const atkMult = opts.atkMult ?? 1;
  const defMult = opts.defMult ?? 1;
  const hp = Math.max(1, Math.round((base.hp || 1) * hpMult));
  return {
    id: edef.id,
    // opts.name 是叙事称呼覆盖：奇遇文案写"白毛野物"，敌人表里只有"苍狼"，
    // 战报若照搬 edef.name，玩家就会看到"你与苍狼一场恶战"，与剧情对不上。
    name: opts.name || edef.name,
    side: 'enemy',
    hp,
    maxHp: hp,
    mp: 0,
    maxMp: 0,
    atk: Math.max(1, Math.round((base.atk || 1) * atkMult)),
    def: Math.max(0, Math.round((base.def || 0) * defMult)),
    spd: Math.max(1, Math.round(base.spd || 1)),
    crit: base.crit ?? 0.05,
    critDmg: 1.5,
    affixes: [],
    skills: edef.skills || [],
    template: edef, // 原始敌人定义，掉落发放时用（字段名不能叫 def，避免与防御值冲突）
  };
}

// ==================== 战斗模拟（纯逻辑） ====================

function cloneSide(s) {
  return {
    ...s,
    affixes: (s.affixes || []).map((a) => ({ ...a })),
    skills: (s.skills || []).map((k) => ({ ...k })),
  };
}

/** 闪避率：速度差越大越容易闪 */
function dodgeChance(atkSide, defSide) {
  return clamp(0.03 + (defSide.spd - atkSide.spd) * 0.004, 0.02, 0.25);
}

/**
 * 结算一次攻击（含闪避 / 暴击 / 反伤 / 吸血 / 溅射），就地修改双方血线，并写入战报。
 * @returns {number} 实际造成的伤害（用于吸血计算已内含，这里返回供上层参考）
 */
function resolveAttack(atkSide, defSide, power, roundNo, rounds, label) {
  const atkName = atkSide.side === 'player' ? '你' : atkSide.name;
  const defName = defSide.side === 'player' ? '你' : defSide.name;

  // ① 闪避
  if (chance(dodgeChance(atkSide, defSide))) {
    rounds.push({
      round: roundNo, actor: atkSide.side, kind: 'dodge',
      text: `${defName}身形一晃，避开了${atkName === '你' ? '你' : atkName}的${label}。`,
    });
    return 0;
  }

  // ② 暴击 + ③ 伤害
  const mpPow = affixValue(atkSide, 'mp_power');
  const mpMul = (mpPow && atkSide.maxMp > 0) ? 1 + mpPow * (atkSide.mp / atkSide.maxMp) : 1;
  const raw = Math.max(1, atkSide.atk * power * mpMul - defSide.def * 0.6);
  const variance = randFloat(0.92, 1.08);
  let dmg = Math.max(1, raw * variance);
  // 功法 crit_up 词条由战斗层叠加到暴击率（cultivation.aggregate 只负责收集，不折算）
  const effCrit = clamp((atkSide.crit || 0) + affixValue(atkSide, 'crit_up'), 0, 1);
  const crit = chance(effCrit);
  if (crit) dmg *= atkSide.critDmg;
  dmg = Math.round(dmg);
  defSide.hp = Math.max(0, defSide.hp - dmg);

  rounds.push({
    round: roundNo, actor: atkSide.side, kind: crit ? 'crit' : 'damage',
    damage: dmg, crit,
    text: `${atkName}${label}${crit ? '，正中要害' : ''}，对${defName}造成 ${fmt(dmg)} 点伤害。`,
  });

  // ④ 反伤：受击方的 reflect 回敬攻击方
  const reflect = affixValue(defSide, 'reflect');
  if (reflect > 0 && dmg > 0) {
    const back = Math.max(1, Math.round(dmg * reflect));
    atkSide.hp = Math.max(0, atkSide.hp - back);
    rounds.push({
      round: roundNo, actor: defSide.side, kind: 'reflect', damage: back,
      text: `${defName}护体真元反震，${atkName === '你' ? '你' : atkName}受到 ${fmt(back)} 点反噬。`,
    });
  }

  // ⑤ 吸血：攻击方按伤害比例回血（基于基础伤害，不含溅射）
  const steal = affixValue(atkSide, 'lifesteal');
  if (steal > 0 && dmg > 0) {
    const heal = Math.min(atkSide.maxHp - atkSide.hp, Math.round(dmg * steal));
    if (heal > 0) {
      atkSide.hp += heal;
      rounds.push({
        round: roundNo, actor: atkSide.side, kind: 'lifesteal', heal,
        text: `${atkName}汲取生机，回复 ${fmt(heal)} 点气血。`,
      });
    }
  }

  // ⑥ 溅射：单挑无第二目标，转译为同一目标的余波追加伤害
  const aoe = affixValue(atkSide, 'aoe');
  if (aoe > 0 && dmg > 0 && defSide.hp > 0) {
    const splash = Math.max(1, Math.round(dmg * aoe));
    defSide.hp = Math.max(0, defSide.hp - splash);
    rounds.push({
      round: roundNo, actor: atkSide.side, kind: 'aoe', damage: splash,
      text: `劲力余波荡开，${defName}再受 ${fmt(splash)} 点溅射。`,
    });
  }

  return dmg;
}

/** 玩家行动一次（含 extra_strike / mp_regen / 自动服丹） */
function playerTurn(P, E, roundNo, rounds, ctx) {
  const cost = mpSkillCost(P.maxMp);
  const useSkill = P.maxMp > 0 && P.mp >= cost;
  let power = 1.0;
  let label = '普通攻击';
  if (useSkill) {
    P.mp -= cost;
    power = MP_SKILL_POWER;
    label = '施展灵力技';
  }

  resolveAttack(P, E, power, roundNo, rounds, label);

  // extra_strike：每回合至多一次，追加 0.7 倍率
  const extra = affixValue(P, 'extra_strike');
  if (extra > 0 && E.hp > 0 && chance(extra)) {
    resolveAttack(P, E, 0.7, roundNo, rounds, '追击');
  }

  // mp_regen
  const regen = affixValue(P, 'mp_regen');
  if (regen > 0 && P.mp < P.maxMp) {
    P.mp = Math.min(P.maxMp, P.mp + regen);
  }

  // 自动服丹：气血 < 20% 且有回血丹，每场限一次。
  // 这里只记录"打算服用"，真正扣丹由 autoResolve 执行，保证 simulateBattle 无副作用。
  if (!ctx.pillUsed && P.maxHp > 0 && P.hp > 0 && P.hp < P.maxHp * 0.2) {
    const healPill = PILLS.find((p) => p.effect?.kind === 'restoreHp' && pillCount(p.id) > 0);
    if (healPill) {
      const pct = healPill.effect.pct ?? 0.45;
      const before = P.hp;
      P.hp = Math.min(P.maxHp, P.hp + Math.round(P.maxHp * pct));
      ctx.pillUsed = true;
      ctx.pillsUsed.push({ id: healPill.id, name: healPill.name });
      rounds.push({
        round: roundNo, actor: 'player', kind: 'pill', heal: P.hp - before,
        text: `危急关头你服下一枚${healPill.name}，回复 ${fmt(P.hp - before)} 点气血。`,
      });
    }
  }
}

/** 敌方行动一次，按其 skills 等权随机 */
function enemyTurn(E, P, roundNo, rounds) {
  if (!E.skills || E.skills.length === 0) {
    resolveAttack(E, P, 1.0, roundNo, rounds, '挥击');
    return;
  }
  const sk = pick(E.skills);
  const label = `施展「${sk.name}」`;
  switch (sk.kind) {
    case 'heal': {
      const heal = Math.min(E.maxHp - E.hp, Math.round(E.maxHp * (sk.power || 0.15)));
      E.hp += heal;
      rounds.push({
        round: roundNo, actor: 'enemy', kind: 'heal', heal,
        text: `${E.name}${label}，回复 ${fmt(heal)} 点气血。`,
      });
      break;
    }
    case 'buff': {
      // 有限叠加（最多 3 层），避免无限滚雪球
      E._buffStacks = E._buffStacks || {};
      E._buffStacks[sk.id] = E._buffStacks[sk.id] || 0;
      if (E._buffStacks[sk.id] < 3) {
        E._buffStacks[sk.id]++;
        E.atk = Math.round(E.atk * (1 + (sk.power || 0.15)));
        E.def = Math.round(E.def * (1 + (sk.power || 0.15)));
      }
      rounds.push({
        round: roundNo, actor: 'enemy', kind: 'buff',
        text: `${E.name}${label}，气焰暴涨。`,
      });
      break;
    }
    case 'debuff': {
      // 削弱必须封顶，否则长回合战斗会滚雪球式崩盘。
      // 旧实现直接在当前值上连乘且无层数上限：0.3 的削弱每三轮叠一次，
      // 20 回合后玩家攻击力只剩 0.7^7 ≈ 8%，必败且毫无还手余地。
      // 现在改为：以战斗开始时的数值为基数，最多 3 层，总削弱上限 50%。
      const p = clamp(sk.power || 0.2, 0, 0.3);
      if (P._baseAtk == null) {
        P._baseAtk = P.atk;
        P._baseDef = P.def;
      }
      P._debuffStacks = Math.min(3, (P._debuffStacks || 0) + 1);
      const total = Math.min(0.5, p * P._debuffStacks);
      P.atk = Math.max(1, Math.round(P._baseAtk * (1 - total)));
      P.def = Math.max(0, Math.round(P._baseDef * (1 - total)));
      rounds.push({
        round: roundNo, actor: 'enemy', kind: 'debuff',
        text: `${E.name}${label}，你气机一滞，攻势受挫（-${Math.round(total * 100)}%）。`,
      });
      break;
    }
    case 'drain': {
      const before = P.hp;
      resolveAttack(E, P, sk.power || 1.0, roundNo, rounds, label);
      const dealt = before - P.hp;
      if (dealt > 0) {
        const heal = Math.min(E.maxHp - E.hp, Math.round(dealt * 0.5));
        if (heal > 0) {
          E.hp += heal;
          rounds.push({
            round: roundNo, actor: 'enemy', kind: 'lifesteal', heal,
            text: `${E.name}掠夺生机，回复 ${fmt(heal)} 点气血。`,
          });
        }
      }
      break;
    }
    case 'damage':
    default:
      resolveAttack(E, P, sk.power || 1.0, roundNo, rounds, label);
      break;
  }
}

/**
 * 模拟一场战斗。纯函数：不读写 state，不改传入的两个单位。
 * @returns {{winner:'player'|'enemy', rounds:Array, playerLeft:{hp,mp}, enemyLeft:{hp}, capped:boolean}}
 */
export function simulateBattle(player, enemy, opts = {}) {
  const P = cloneSide(player);
  const E = cloneSide(enemy);
  // 灵兽是**独立的第三行动单位**，不是玩家的数值挂件。
  // 它有自己的行动条（按自己的 spd 在回合内排序），会真实出手并被写入战报。
  const B = opts.beast ? cloneSide(opts.beast) : null;
  const rounds = [];
  const ctx = {
    pillUsed: false, pillsUsed: [],
    guardReady: !!(B && (B.skills || []).some((s) => s.kind === 'guard')), // 护主待命
    guardUsed: false,
    beastFainted: false,
  };
  let roundNo = 0;
  let capped = false;

  while (P.hp > 0 && E.hp > 0 && roundNo < ROUND_CAP) {
    roundNo++;
    // 按速度决定出手顺序，同速玩家先手
    const actors = [['player', P, E], ['enemy', E, P]];
    if (B && B.hp > 0) actors.push(['beast', B, E]);
    actors.sort((a, b) => {
      if (b[1].spd !== a[1].spd) return b[1].spd - a[1].spd;
      return a[0] === 'player' ? -1 : 1;   // 同速时玩家优先，与旧行为一致
    });

    for (const [who, a, b] of actors) {
      if (P.hp <= 0 || E.hp <= 0) break;
      if (who === 'player') playerTurn(P, E, roundNo, rounds, ctx);
      else if (who === 'beast') {
        if (B.hp > 0) beastTurn(B, P, E, roundNo, rounds, ctx);
      } else {
        enemyTurn(E, P, roundNo, rounds);
        // 护主：敌人这一击若把玩家打死，灵兽替他挨下来（整场一次）。
        if (P.hp <= 0 && B && B.hp > 0 && ctx.guardReady && !ctx.guardUsed) {
          ctx.guardUsed = true;
          ctx.guardReady = false;
          const saved = Math.round(B.maxHp * 0.5);
          B.hp = Math.max(0, B.hp - saved);
          P.hp = 1;
          rounds.push({
            round: roundNo, actor: 'beast', kind: 'guard', damage: saved,
            text: `【${B.name}】扑身上前，替你挡下了那致命一击（自身 -${fmt(saved)}）。`,
          });
          if (B.hp <= 0) {
            ctx.beastFainted = true;
            rounds.push({
              round: roundNo, actor: 'beast', kind: 'faint',
              text: `【${B.name}】力竭退去，暂不能再战。`,
            });
          }
        }
      }
    }
  }

  let winner;
  if (E.hp <= 0 && P.hp > 0) winner = 'player';
  else if (P.hp <= 0) winner = 'enemy';
  else { winner = 'enemy'; capped = true; } // 打满 50 回合判负

  return {
    winner,
    rounds,
    capped,
    pillsUsed: ctx.pillsUsed, // 供调用方真正扣丹，simulateBattle 本身不改 state
    playerLeft: { hp: Math.max(0, Math.round(P.hp)), mp: Math.max(0, Math.round(P.mp)) },
    enemyLeft: { hp: Math.max(0, Math.round(E.hp)) },
    beast: B ? {
      name: B.name,
      hp: Math.max(0, Math.round(B.hp)),
      maxHp: B.maxHp,
      fainted: B.hp <= 0,
      guarded: ctx.guardUsed,
    } : null,
  };
}

/**
 * 灵兽行动一次。
 *
 * 与敌人行动的区别：灵兽是会**照看主人**的。
 *   damage  打敌人
 *   heal    治自己或玩家（谁伤得重治谁）——战斗层原本没有"治疗队友"的概念，这里补上
 *   guard   进入护主待命（拦截逻辑在回合循环里）
 *   buff/debuff  同类效果转译
 */
function beastTurn(B, P, E, roundNo, rounds, ctx) {
  const skills = B.skills || [];
  if (skills.length === 0) {
    resolveAttack(B, E, 1.0, roundNo, rounds, '扑击');
    return;
  }
  const sk = pick(skills);
  const label = `施展「${sk.name}」`;

  switch (sk.kind) {
    case 'heal': {
      // 谁伤得重治谁：灵兽自己血少就自愈，主人血少就护主
      const selfRatio = B.hp / Math.max(1, B.maxHp);
      const playerRatio = P.hp / Math.max(1, P.maxHp);
      const target = selfRatio <= playerRatio ? B : P;
      const amount = Math.round(Math.max(1, target.maxHp * (sk.power || 0.15)));
      const before = target.hp;
      target.hp = Math.min(target.maxHp, target.hp + amount);
      const healed = Math.round(target.hp - before);
      rounds.push({
        round: roundNo, actor: 'beast', kind: 'heal', heal: healed,
        text: target === P
          ? `【${B.name}】${label}，为你回复 ${fmt(healed)} 点气血。`
          : `【${B.name}】${label}，自身回复 ${fmt(healed)} 点气血。`,
      });
      break;
    }
    case 'guard': {
      ctx.guardReady = true;
      rounds.push({
        round: roundNo, actor: 'beast', kind: 'guard',
        text: `【${B.name}】${label}，守在你身前，蓄势待发。`,
      });
      break;
    }
    case 'buff': {
      B.atk = Math.round(B.atk * (1 + (sk.power || 0.15)));
      rounds.push({
        round: roundNo, actor: 'beast', kind: 'buff',
        text: `【${B.name}】${label}，气势大涨。`,
      });
      break;
    }
    case 'debuff': {
      const p = clamp(sk.power || 0.2, 0, 0.3);
      if (E._baseAtk == null) { E._baseAtk = E.atk; E._baseDef = E.def; }
      E._debuffStacks = Math.min(3, (E._debuffStacks || 0) + 1);
      const total = Math.min(0.5, p * E._debuffStacks);
      E.atk = Math.max(1, Math.round(E._baseAtk * (1 - total)));
      E.def = Math.max(0, Math.round(E._baseDef * (1 - total)));
      rounds.push({
        round: roundNo, actor: 'beast', kind: 'debuff',
        text: `【${B.name}】${label}，${E.name}气机受挫（-${Math.round(total * 100)}%）。`,
      });
      break;
    }
    case 'damage':
    default:
      resolveAttack(B, E, sk.power || 1.0, roundNo, rounds, label);
      break;
  }
}

// ==================== 战斗状态锁（供奇遇/探险判断"是否战斗进行中"） ====================

let _inBattle = false;
/** 是否有战斗正在进行（自动结算瞬间 / UI 手动播放期间） */
export function isInBattle() { return _inBattle; }
/** UI 在手动播放战报时置 true / 播完置 false */
export function setBattleActive(v) { _inBattle = !!v; }

// ==================== 奖励发放 ====================

function log(text, cls, channel = 'battle') {
  emit(EV.LOG, { text, cls, channel });
}

/**
 * 发放战斗掉落。战败不发任何掉落（自测脚本会验证这一点）。
 * @param side   玩家侧战斗单位（当前未使用，保留给"幸运加成"等扩展）
 * @param enemy  敌方战斗单位（需带 .def）或敌人 id 字符串
 * @param win    是否胜利
 * @returns {{stones:number, materials:Object, pills:Object, lines:string[]}}
 */
export function grantBattleRewards(side, enemy, win) {
  const rewards = { stones: 0, materials: {}, pills: {}, lines: [] };
  if (!win) return rewards;

  const edef = enemy?.template || enemyById(typeof enemy === 'string' ? enemy : enemy?.id);
  if (!edef) return rewards;

  // ⚠ 这里**不能**再乘 incomeScale()。
  // enemies.js 的 stones.low 本身已经是绝对阶梯（tier1 的 8~40 → tier5 的 3 万~15 万），
  // 数值上已与本境界的 INCOME_PER_MIN 对齐；而 enemiesByRealm 又保证你打的总是同档敌人。
  // 再乘一次收入倍率等于平方级放大：渡劫期战斗收入会跑到基线的 ~4000 倍，灵石彻底失去意义。
  // incomeScale 仍然由 explore.js 的**扁平**基数使用（那里的 40~120 才是真的需要缩放）。
  for (const drop of edef.loot || []) {
    if (!chance(drop.chance ?? 1)) continue;
    if (drop.material) {
      const n = Math.max(0, rollAmount(drop.amount));
      if (n > 0) {
        addMaterial(drop.material, n);
        rewards.materials[drop.material] = (rewards.materials[drop.material] || 0) + n;
        rewards.lines.push(`获得材料 ×${n}`);
        emit(EV.ITEM_GAIN, { kind: 'material', id: drop.material, count: n });
      }
    }
    if (drop.stones?.low) {
      const low = Math.round(Math.max(0, rollAmount(drop.stones.low)));
      if (low > 0) {
        addStones(low);
        rewards.stones += low;
        rewards.lines.push(`获得灵石 ${fmt(low)}（下品）`);
        emit(EV.ITEM_GAIN, { kind: 'stones', amount: low });
      }
    }
  }
  return rewards;
}

/**
 * 把一场战斗的战利拼成一行摘要。
 *
 * 调用方用 silent 把逐条战报挡在日志外之后，靠这一行交代"这一战拿到了什么"，
 * 避免要么刷屏、要么什么都不说。一无所获时返回 null，调用方据此跳过这行。
 */
export function battleSpoils(rewards) {
  if (!rewards) return null;
  const parts = [];
  if (rewards.stones > 0) parts.push(`灵石 ${fmt(rewards.stones)}`);
  const mats = Object.values(rewards.materials || {}).reduce((a, b) => a + (b || 0), 0);
  if (mats > 0) parts.push(`材料 ×${mats}`);
  if (rewards.cult > 0) parts.push(`修为 ${fmt(rewards.cult)}`);
  return parts.length ? `战利：${parts.join('、')}。` : null;
}

/**
 * 单场战斗胜利的修为奖励，单位是“多少秒的挂机产出”。
 *
 * 为什么锚定 calcCultSpeed() 而不是 needCult 的百分比：
 * 与奇遇 cult 奖励踩的是同一个坑 —— 百分比锚定会让事件贡献随境界时长一起膨胀
 * （境界时长 ∝ needCult），越到后期战斗越反客为主，最后把挂机这条主线压垮。
 * 锚定速度后，战斗对总进度的贡献是一个恒定的比例，与境界无关。
 *
 * 为什么是 15 秒：探险冷却 EXPLORE_CD = 30 秒、战斗分支占 40%，
 * 即持续探险的玩家平均 75 秒打一场。故单场 15 秒 ≈ 把修为速度抬高二成上限，
 * 是"主动玩法有回报、但不至于让刷战斗取代挂机"的量级。
 * 参照物：一次奇遇 cult 奖励约合 17 秒产出（68 秒冷却 × 25%），两者同量级。
 *
 * 战败不发（与掉落同口径）；试炼塔不发（challengeTower 传 noCult）。
 */
const BATTLE_CULT_SECONDS = 15;

/**
 * 发放战斗胜利的修为。返回实际入账的量 —— 修为在境界内封顶，
 * 临近突破时可能被截断到 0，这是有意为之（与修为的其它来源一致）。
 */
export function grantBattleCult() {
  const speed = calcCultSpeed();
  return speed > 0 ? gainCult(speed * BATTLE_CULT_SECONDS, '战斗') : 0;
}

// ==================== 自动结算 ====================

/**
 * 构建双方并直接结算，胜利则发放掉落。
 * @param enemyId 敌人 id
 * @param opts    { hpMult, atkMult, defMult, power, silent, name, noCult }
 *                name —— 显示名覆盖。奇遇里"打的是谁"由剧情决定，
 *                而敌人表只提供一副数值/招式骨架，两边对不上时用这个名字校正。
 *                只影响文案，不影响数值、掉落与图鉴归属（图鉴仍记 enemyId）。
 * @returns {{win:boolean, log:Array<{text,cls}>, rewards:Object, rounds:Array, enemyName:string}}
 */
export function autoResolve(enemyId, opts = {}) {
  const P = buildPlayerSide();
  const E = buildEnemySide(enemyId, opts);
  if (!E) {
    return { win: false, log: [{ text: '敌人不存在。', cls: 'event-bad' }], rewards: { stones: 0, materials: {}, pills: {}, lines: [] }, rounds: [], enemyName: '' };
  }

  _inBattle = true;
  // 带上出战灵兽。它有自己的行动条，会真实出手并被写入战报。
  const beast = activeBeastBattleSide();
  const res = simulateBattle(P, E, beast ? { beast } : {});
  const win = res.winner === 'player';

  // simulateBattle 只记录"本场服用了哪些丹药"，这里才真正扣除，保证模拟层无副作用
  for (const p of res.pillsUsed || []) {
    consumePill(p.id, 1);
    emit(EV.ITEM_USE, { id: p.id, count: 1 });
  }

  // 回写气血/灵力。战败不倒毙：至少留 1 点气血，由修炼系统慢慢恢复。
  state.player.hp = Math.max(1, res.playerLeft.hp);
  state.player.mp = Math.max(0, res.playerLeft.mp);

  const rewards = grantBattleRewards(P, E, win);

  // 出战灵兽随主人一战，也长一分道行。与掉落同口径：只在胜利时结算。
  // 升级文案由 gainExp 自己走 bus 播报，这里不再重复 push 一行。
  if (win) {
    const be = grantBattleExp();
    if (be) rewards.beastExp = be;
    // 战斗胜利也长一分修为。走 rewards.lines，与掉落一起在下方统一播报。
    // 试炼塔靠 opts.noCult 显式排除 —— 它是纯排名玩法，奖励只有层数纪录。
    const cult = opts.noCult ? 0 : grantBattleCult();
    if (cult > 0) {
      rewards.cult = cult;
      rewards.lines.push(`修为增长 ${fmt(cult)}。`);
    }
  }

  if (win) {
    state.stats.kills = (state.stats.kills || 0) + 1;
    state.combat.winStreak = (state.combat.winStreak || 0) + 1;
    // V6.0 功课：**击败过**的敌人种类。
    // ⚠ 必须待在 win 分支里——下方那句 codexRecord('enemies') 是"交过手就记"，
    // 拿图鉴当进度源会把败仗也算成击败。
    noteKind('slain', E.id);
  } else {
    state.stats.deaths = (state.stats.deaths || 0) + 1;
    state.combat.winStreak = 0;
  }

  const logs = [];
  if (win) {
    logs.push({ text: `你击败了${E.name}！${res.capped ? '' : `（${res.rounds.length} 条战报）`}`, cls: 'event-good' });
    if (rewards.stones > 0) logs.push({ text: `战利：灵石 ${fmt(rewards.stones)}（下品）`, cls: 'event-good' });
  } else {
    logs.push({
      text: res.capped ? `鏖战五十回合，你力竭退走，败于${E.name}之手。` : `你败于${E.name}之手，狼狈退走。`,
      cls: 'event-bad',
    });
  }
  logs.push(...rewards.lines.map((t) => ({ text: t, cls: 'event-good' })));

  if (!opts.silent) {
    for (const l of logs) log(l.text, l.cls, 'battle');
    log(`—— 与${E.name}一战 ${win ? '胜' : '负'} ——`, win ? 'event-good' : 'event-bad', 'battle');
  }

  // 图鉴留痕：这个敌人你见过了。
  // 敌人与奇遇没法像物品那样"自动补录"——state 里没有"打过谁"的持有列表，
  // 必须在结算的这一刻主动记一笔。
  try { codexRecord('enemies', E.id); } catch { /* 图鉴异常不影响战斗结算 */ }

  emit(EV.COMBAT_END, { enemyId: E.id, enemyName: E.name, win, rounds: res.rounds.length, opts });
  _inBattle = false;

  return { win, log: logs, rewards, rounds: res.rounds, enemyName: E.name, enemyId: E.id };
}

// ==================== 试炼塔 ====================

/**
 * 该层应战的敌人与缩放。
 * 只用 enemiesByRealm（境界适配的最近三档）作为池子，按层数在池内轮转并逐层加压，
 * 避免直接依赖 enemies.js 的全表导出。
 */
export function towerEnemyFor(floor) {
  const f = Math.max(1, Math.floor(floor || 1));
  const pool = enemiesByRealm(state.player.realmIndex);
  const list = pool.length ? pool : [];
  if (list.length === 0) return null;
  const sorted = [...list].sort((a, b) => a.power - b.power);
  const def = sorted[(f - 1) % sorted.length];
  const tier = realmTier();
  return {
    enemyId: def.id,
    floor: f,
    tier,
    hpMult: 1 + (f - 1) * 0.22,
    atkMult: 1 + (f - 1) * 0.14,
    power: Math.round(def.power * (1 + (f - 1) * 0.22)),
  };
}

/**
 * 塔层首通奖励的参数。
 *
 * 为什么是"首通"而不是"可重复刷"：塔是攀爬目标，不是资源点。若能重刷，它就会变成
 * 挂机的替代品，与"挂机为主线、主动玩法只做锦上添花"的定位相抵。所以奖励只在
 * towerFloor 首次推进时发放。
 *
 * 为什么必须随层数递增：塔的敌人按层加压（气血 ×(1+0.22×(层-1))、攻击 ×(1+0.14×(层-1))），
 * 旧版本每层只发该敌人的普通掉落——难度线性涨、奖励纹丝不动，越往上爬越亏，
 * 玩家爬到成就线（10/30/50/100 层）之外就没有理由再往上走。
 *
 * 修为锚定 calcCultSpeed() 的秒数而非 needCult 的百分比，与战斗/奇遇奖励同口径
 * （理由见 grantBattleCult 上方注释）：锚百分比会让塔的贡献随境界时长一起膨胀。
 * 灵石锚定 incomePerMin()，同理。
 */
const TOWER_CULT_BASE_SECONDS = 60;      // 首层基础产出秒数
const TOWER_CULT_PER_FLOOR = 6;          // 每层追加
const TOWER_CULT_PER_TEN_FLOORS = 60;    // 每满 10 层再追加一档
const TOWER_STONE_BASE_MINUTES = 2;      // 首层基础（折合多少分钟的灵石产出）
const TOWER_STONE_PER_FLOOR = 0.4;
const TOWER_STONE_PER_TEN_FLOORS = 2;

/** 某层首通应发的奖励额度（修为秒数 / 灵石分钟数），线性递增，无指数爆炸 */
export function towerRewardFor(floor) {
  const f = Math.max(1, Math.floor(floor || 1));
  const tens = Math.floor(f / 10);
  return {
    cultSeconds: TOWER_CULT_BASE_SECONDS + TOWER_CULT_PER_FLOOR * f + TOWER_CULT_PER_TEN_FLOORS * tens,
    stoneMinutes: TOWER_STONE_BASE_MINUTES + TOWER_STONE_PER_FLOOR * f + TOWER_STONE_PER_TEN_FLOORS * tens,
  };
}

/**
 * 挑战试炼塔某层：按层缩放敌人并结算，胜利后刷新最高层并发放首通奖励。
 */
export function challengeTower(floor) {
  const info = towerEnemyFor(floor);
  if (!info) {
    return { win: false, floor, log: [{ text: '当前境界没有可挑战的对手。', cls: 'event-bad' }], rewards: { stones: 0, materials: {}, pills: {}, lines: [] }, rounds: [] };
  }
  const res = autoResolve(info.enemyId, {
    hpMult: info.hpMult,
    atkMult: info.atkMult,
    // 这里早先传过一个 label，但 autoResolve 从来没读过它（死参数，已删）。
    // 塔层的显示名走的是面板自己的 UI，不需要污染敌人名。
    noCult: true,   // 不领"普通战斗"那 15 秒修为；塔的修为走下面的首通奖励，额度由层数决定
    // 战报由塔面板的 showReport 弹窗展示，这里不再往日志灌一遍逐条流水。
    // 破层里程碑仍由下方那句 log 单独记录，日志里不会完全没痕迹。
    silent: true,
  });
  if (res.win) {
    const prev = state.combat.towerFloor || 0;
    state.combat.towerFloor = Math.max(prev, info.floor);
    state.combat.towerBest = Math.max(state.combat.towerBest || 0, info.floor);

    // 首通才发塔层奖励。当前 UI 只会挑战 towerFloor+1，所以每次胜利都是首通；
    // 这里仍然显式判一次，把"可重刷"这条路在状态层堵死。
    if (info.floor > prev) {
      const tr = towerRewardFor(info.floor);
      const cult = gainCult(calcCultSpeed() * tr.cultSeconds, '塔');
      if (cult > 0) {
        res.rewards.cult = (res.rewards.cult || 0) + cult;
        res.rewards.lines.push(`塔层首通 · 修为 ${fmt(cult)}。（合 ${tr.cultSeconds} 息吐纳）`);
      }
      const stones = Math.round(incomePerMin() * tr.stoneMinutes);
      if (stones > 0) {
        addStones(stones);
        res.rewards.stones += stones;
        res.rewards.lines.push(`塔层首通 · 灵石 ${fmt(stones)}（下品）`);
        emit(EV.ITEM_GAIN, { kind: 'stones', amount: stones });
      }
    }

    log(`试炼塔第 ${info.floor} 层告破。`, 'event-special', 'battle');
  }
  return { ...res, floor: info.floor, tier: info.tier };
}
