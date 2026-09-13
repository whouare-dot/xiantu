/**
 * 灵兽血脉（V4.0 收官）。
 *
 * ============ 这个系统要解决什么 ============
 *
 * 轮回的规则是"中保留：知识留下，资产不留"。灵兽本体属于资产，必须清空——
 * 但清空之后，玩家在灵兽上投入的几十个小时就真的一笔勾销了，
 * 下一世再抓到同族，体验和第一世完全一样。那"轮回"在灵兽这条线上就只是个删除键。
 *
 * 血脉就是这条线的答案：**你记得怎么养它们。**
 * 同样的物种，第二世再遇时起点更高；养到极致的血脉可以"觉醒"，
 * 成为永久生效的共鸣。本体没了，但你与它的关系还在。
 *
 * ============ 与 reincarnation.js 的分工 ============
 *
 * 「轮回时保留什么」的决策权**只在 systems/reincarnation.js** 一家
 * （见 docs/版本规划.md §5.9 立的规则）。本模块只提供两件事：
 *   - 血脉表的数据形状与读写（extractFrom / installInto）
 *   - 血脉产生的效果（captureBonus / beastMult / levelCapBonus ...）
 * 由 reincarnation.js 决定何时调用它们。这样"保留规则"始终只有一个出处。
 *
 * ============ 数据形状（state.beasts.bloodlines，冻结） ============
 *   {
 *     [baseId]: { baseId, bestStar: 1..5, stage: 0..n, gens: 1..n, awakened: bool }
 *   }
 * 纯逻辑，禁止任何 DOM 操作。
 */

import { state, hasMaterials, consumeMaterials, addMaterial } from '../core/state.js';
import { beastById } from '../data/beasts.js';

// ==================== 常量 ====================

/** 血脉等级：0 未曾相识 / 1 相识 / 2 相知 / 3 共鸣 */
export const BLOOD_LEVELS = [
  { level: 1, name: '相识', desc: '你养过它，记得它的性子。' },
  { level: 2, name: '相知', desc: '你曾将它养到极处，它认得出你的气息。' },
  { level: 3, name: '共鸣', desc: '血脉已醒。纵是转世，它仍会为你而战。' },
];

/** 升到 Lv2 所需的"历史最佳星级" */
export const LEVEL2_STAR = 3;

/** Lv1：捕获该物种的成功率加成 */
export const CAPTURE_BONUS = 0.15;
/** Lv1：该物种灵兽蛋的孵化时长缩减 */
export const HATCH_REDUCE = 0.20;
/** Lv2：再捕获时的初始亲密度加成 */
export const INIT_INTIMACY_BONUS = 15;
/** Lv2：该物种等级上限加成 */
export const LEVEL_CAP_BONUS = 5;
/** Lv3：再捕获时的初始等级 */
export const INIT_LEVEL_BONUS = 10;
/** Lv3：出战该物种时的全属性加成 */
export const AWAKENED_STAT_BONUS = 0.15;
/** 每条 Lv2+ 血脉给**全部**灵兽的属性加成 */
export const RESONANCE_PER_LINE = 0.02;
/** 全局共鸣加成上限 */
export const RESONANCE_CAP = 0.12;

/** 觉醒消耗：按物种阶级递增 */
const AWAKEN_COST = {
  1: [{ id: 'mat_yaodan', count: 3 }],
  2: [{ id: 'mat_yaodan', count: 4 }],
  3: [{ id: 'mat_yaodan', count: 6 }, { id: 'mat_neidan', count: 1 }],
  4: [{ id: 'mat_neidan', count: 3 }],
  5: [{ id: 'mat_neidan', count: 5 }],
};

const MAT_NAMES = {
  mat_shougu: '兽骨', mat_yaoxue: '妖血', mat_yaodan: '妖丹', mat_neidan: '内丹',
};

export function matName(id) { return MAT_NAMES[id] || id; }

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ==================== 读写 ====================

/** 血脉表（跨世保留）。永远是对象，调用方不必判空。 */
export function bloodlines() {
  const b = state.beasts || (state.beasts = {});
  if (!b.bloodlines || typeof b.bloodlines !== 'object') b.bloodlines = {};
  return b.bloodlines;
}

/**
 * 从一批灵兽实例算出血脉表（纯函数，不改任何状态）。
 *
 * 与已有记录**取并集**而不是覆盖：`bestStar` / `stage` 取历史最好值，
 * `gens` 表示"相伴过几世"。取并集是关键——若某世只养了一只 1 星同族，
 * 覆盖会把上一世辛苦养出的 5 星记录抹掉，玩家的永久进度会凭空倒退。
 *
 * @param {Array} owned 灵兽实例数组
 * @param {Object} [prev] 现有的血脉表（默认为当前 state 里的）
 */
export function extractFrom(owned, prev = null) {
  const base = prev || bloodlines();
  const out = {};
  // 先原样带走旧记录（含 awakened —— 觉醒是永久状态，不会因这一世没养就消失）
  for (const [id, rec] of Object.entries(base)) {
    out[id] = { ...rec };
  }
  for (const inst of owned || []) {
    if (!inst?.baseId) continue;
    const cur = out[inst.baseId] || {
      baseId: inst.baseId, bestStar: 0, stage: 0, gens: 0, awakened: false,
    };
    cur.bestStar = Math.max(cur.bestStar || 0, inst.star || 1);
    cur.stage = Math.max(cur.stage || 0, inst.stage || 0);
    // 同一世养多只同族只记一世
    cur.gens = (cur.gens || 0) + (cur._seenThisLife ? 0 : 1);
    cur._seenThisLife = true;
    out[inst.baseId] = cur;
  }
  // 清掉仅用于本次计算的临时标记，别让它写进存档
  for (const rec of Object.values(out)) delete rec._seenThisLife;
  return out;
}

/** 把血脉表装进一份（通常是刚重建的）state。供 reincarnation.js 在轮回时调用 */
export function installInto(targetState, lines) {
  const b = targetState.beasts || (targetState.beasts = {});
  b.bloodlines = lines && typeof lines === 'object' ? lines : {};
  return b.bloodlines;
}

// ==================== 等级与效果 ====================

/** 血脉等级 0~3 */
export function levelOf(baseId) {
  const rec = bloodlines()[baseId];
  if (!rec) return 0;
  if (rec.awakened) return 3;
  return (rec.bestStar || 0) >= LEVEL2_STAR ? 2 : 1;
}

/** 已觉醒的血脉条数 */
export function awakenedCount() {
  return Object.values(bloodlines()).filter((r) => r.awakened).length;
}

/** 全局共鸣：每条 Lv2+ 血脉 → 全部灵兽属性 +2%，封顶 +12% */
export function globalMult() {
  const n = Object.keys(bloodlines()).filter((id) => levelOf(id) >= 2).length;
  return Math.min(RESONANCE_CAP, n * RESONANCE_PER_LINE);
}

/**
 * 某个物种的灵兽属性倍率 = 全局共鸣 × 该物种是否已觉醒。
 * 传入 baseId 而不是实例，是为了让 beast.js 在算属性时不必反查本体。
 */
export function beastMult(baseId) {
  const g = 1 + globalMult();
  const rec = bloodlines()[baseId];
  return g * (rec?.awakened ? 1 + AWAKENED_STAT_BONUS : 1);
}

/** 该物种的等级上限加成（Lv2 起 +5） */
export function levelCapBonus(baseId) {
  return levelOf(baseId) >= 2 ? LEVEL_CAP_BONUS : 0;
}

/** 捕获该物种时的成功率加成 */
export function captureBonus(baseId) {
  return levelOf(baseId) >= 1 ? CAPTURE_BONUS : 0;
}

/** 该物种灵兽蛋的孵化时长倍率 */
export function hatchMult(baseId) {
  return levelOf(baseId) >= 1 ? 1 - HATCH_REDUCE : 1;
}

/** 再捕获该物种时的初始亲密度 */
export function initIntimacy(baseId) {
  return levelOf(baseId) >= 2 ? INIT_INTIMACY_BONUS : 0;
}

/** 再捕获该物种时的初始等级 */
export function initLevel(baseId) {
  return levelOf(baseId) >= 3 ? INIT_LEVEL_BONUS : 1;
}

// ==================== 觉醒 ====================

/** 觉醒消耗（按本体阶级） */
export function awakenCost(baseId) {
  const base = beastById(baseId);
  const tier = clamp(base?.tier || 1, 1, 5);
  return (AWAKEN_COST[tier] || AWAKEN_COST[1]).map((c) => ({ ...c }));
}

/**
 * 是否可觉醒。
 * 条件：曾养过该物种 + 历史最佳 ≥3★ + 曾将其进化过（stage ≥1）+ 材料充足。
 * 「曾进化过」这条是刻意的：觉醒要求你真的把这条血脉养到过深处，
 * 而不是随手抓一只 3 星就点。
 * @returns {{ok:boolean, reason:string, cost:Array, level:number}}
 */
export function canAwaken(baseId) {
  const rec = bloodlines()[baseId];
  const cost = awakenCost(baseId);
  const fail = (reason) => ({ ok: false, reason, cost, level: levelOf(baseId) });
  if (!rec) return fail('未曾养过此兽');
  if (rec.awakened) return fail('血脉已醒');
  if ((rec.bestStar || 0) < LEVEL2_STAR) return fail(`需曾养至 ${LEVEL2_STAR}★ 以上`);
  if ((rec.stage || 0) < 1) return fail('需曾将其培育至进化形态');
  if (!hasMaterials(cost)) {
    return fail('灵材不足：需 ' + cost.map((c) => `${matName(c.id)}×${c.count}`).join('、'));
  }
  return { ok: true, reason: '', cost, level: levelOf(baseId) };
}

/**
 * 觉醒一条血脉：扣材料 → 标记 awakened。
 * 永久生效，跨世不灭；本体不保留，所以这是纯粹押在"下一世"上的投入。
 */
export function awaken(baseId) {
  const r = canAwaken(baseId);
  if (!r.ok) return r;
  if (!consumeMaterials(r.cost)) return { ok: false, reason: '灵材不足', cost: r.cost };
  const rec = bloodlines()[baseId];
  rec.awakened = true;
  const base = beastById(baseId);
  return {
    ok: true,
    baseId,
    name: base?.name || baseId,
    cost: r.cost,
    level: 3,
  };
}

/**
 * 放弃一条血脉（返还少量材料）。
 * 存在的意义是给玩家一个"我后悔了"的出口——但觉醒过的返还更少，
 * 免得觉醒变成可反复套利的免费开关。
 */
export function forget(baseId) {
  const lines = bloodlines();
  const rec = lines[baseId];
  if (!rec) return { ok: false, reason: '未曾养过此兽' };
  const base = beastById(baseId);
  const tier = clamp(base?.tier || 1, 1, 5);
  delete lines[baseId];
  const matId = tier >= 4 ? 'mat_neidan' : tier >= 3 ? 'mat_yaodan' : tier >= 2 ? 'mat_yaoxue' : 'mat_shougu';
  const count = rec.awakened ? 1 : Math.max(1, tier);
  addMaterial(matId, count);
  return { ok: true, baseId, materials: [{ id: matId, count }], wasAwakened: !!rec.awakened };
}

// ==================== UI 汇总 ====================

/**
 * 血脉总览。structure 稳定（血脉条数变化才重建），
 * 但为了简单起见这里一次性把渲染需要的东西都算好，由面板决定怎么用。
 */
export function bloodlineSummary() {
  const lines = bloodlines();
  const list = Object.values(lines).map((rec) => {
    const base = beastById(rec.baseId);
    return {
      baseId: rec.baseId,
      name: base?.name || rec.baseId,
      tier: base?.tier || 1,
      role: base?.role || 'attack',
      bestStar: rec.bestStar || 1,
      stage: rec.stage || 0,
      gens: rec.gens || 1,
      awakened: !!rec.awakened,
      level: levelOf(rec.baseId),
      levelName: BLOOD_LEVELS[levelOf(rec.baseId) - 1]?.name || '',
      canAwaken: canAwaken(rec.baseId),
      effects: effectList(rec.baseId),
      owned: (state.beasts?.owned || []).some((b) => b.baseId === rec.baseId),
    };
  }).sort((a, b) => b.level - a.level || b.bestStar - a.bestStar || a.name.localeCompare(b.name));

  return {
    list,
    total: list.length,
    awakened: list.filter((x) => x.awakened).length,
    resonance: globalMult(),
    resonanceLines: list.filter((x) => x.level >= 2).length,
    nextResonanceAt: Math.min(
      Math.ceil(RESONANCE_CAP / RESONANCE_PER_LINE),
      list.filter((x) => x.level >= 2).length + 1,
    ),
  };
}

/** 某条血脉此刻生效的效果清单（供 UI 摊开写清楚，不给数字黑箱） */
export function effectList(baseId) {
  const lv = levelOf(baseId);
  const out = [];
  if (lv >= 1) {
    out.push({ label: '捕获同族成功率', value: `+${Math.round(CAPTURE_BONUS * 100)}%` });
    out.push({ label: '同族灵兽蛋孵化', value: `−${Math.round(HATCH_REDUCE * 100)}% 时长` });
  }
  if (lv >= 2) {
    out.push({ label: '再捕获初始亲密度', value: `+${INIT_INTIMACY_BONUS}` });
    out.push({ label: '该族等级上限', value: `+${LEVEL_CAP_BONUS}` });
    out.push({ label: '全局共鸣', value: `全部灵兽属性 +${Math.round(RESONANCE_PER_LINE * 100)}%` });
  }
  if (lv >= 3) {
    out.push({ label: '再捕获初始等级', value: `Lv.${INIT_LEVEL_BONUS}` });
    out.push({ label: '出战该族', value: `全属性 +${Math.round(AWAKENED_STAT_BONUS * 100)}%` });
  }
  return out;
}

/** 距下一级还差什么（UI 用，避免玩家瞎猜） */
export function nextLevelHint(baseId) {
  const rec = bloodlines()[baseId];
  if (!rec) return '尚未养过此兽';
  const lv = levelOf(baseId);
  if (lv === 1) return `曾养至 ${LEVEL2_STAR}★ 可进阶「相知」`;
  if (lv === 2) return '觉醒后可至「共鸣」';
  return '血脉已至圆满';
}
