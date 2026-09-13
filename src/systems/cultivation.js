/**
 * 修炼系统 —— 全游戏派生属性的唯一出口。
 *
 * 所有"我现在的攻击力是多少"这类问题，都必须调用本模块的函数，
 * 不允许在 UI 或其它系统里另起一套算法，否则数值会不一致。
 *
 * 加成汇总规则（重要）：
 *   - 加法项（攻击、防御、气血上限等）：基础值 + 装备 + 功法
 *   - 乘法项（修炼速率）：各来源用"1 + Σ(倍率-1)"的方式叠加，避免相乘爆炸
 *     例：灵根 ×1.8、功法 ×1.5、洞府 ×1.8 → 1.8 × (1 + 0.5 + 0.8) 而不是 1.8×1.5×1.8
 *   - 临时 buff 之间相乘（它们是限时的，短期爆发可以接受）
 */

import { state, realm, realmAt, isMaxRealm, addPill } from '../core/state.js';
import { BUILDINGS } from '../data/caveBuildings.js';
import { techById, techStatsAt } from '../data/techniques.js';
import { equipById } from '../data/equipments.js';
import { titleBonusFor } from '../data/achievements.js';
import { cultMult as stanceCultMult } from './stance.js';
import { sectBonus } from './sect.js';
import { reincarnationBonus } from './reincarnation.js';
import { talentBonus } from './talent.js';
import { codexBonus, codexReward } from './codex.js';
import { eventBonus } from './worldEvent.js';
import { companionBonus } from './companion.js';
import { emit, EV } from '../core/bus.js';
// 诊断采集：gainCult 是全部修为增量的唯一出口，所以来源标签在这里打一次就够，
// 各发奖点只需传 source，不必各自埋点。见 core/telemetry.js。
import { noteCultGain } from '../core/telemetry.js';
import { qualityOf } from '../data/qualities.js';

/** 图鉴各栏加成的合并。用 try 包住：图鉴系统异常不应拖垮整个派生属性计算。 */
function codexBonusAllSafe() {
  try {
    const out = {};
    for (const k of ['techniques', 'equipped', 'pills', 'materials', 'beasts', 'enemies', 'encounters']) {
      for (const [key, val] of Object.entries(codexBonus(k) || {})) {
        out[key] = (out[key] || 0) + val;
      }
    }
    return out;
  } catch { return {}; }
}

// ==================== 装备 / 功法 加成聚合 ====================

/** 收集所有已装备物品的实例 */
function equippedInstances() {
  const eq = state.equipment;
  const list = [];
  for (const uid of Object.values(eq.equipped)) {
    if (uid == null) continue;
    const inst = eq.owned.find((e) => e.uid === uid);
    if (inst) list.push(inst);
  }
  return list;
}

/**
 * 汇总所有来源的加法属性与乘法加成。
 * 返回 { add: {atk,def,hp,mp,spd,crit,comprehension,...}, mul: {hp, ...}, affixes: [] }
 */
export function aggregate() {
  const add = { atk: 0, def: 0, hp: 0, mp: 0, spd: 0, crit: 0, comprehension: 0, daoHeart: 0, spiritSense: 0 };
  const mul = { hp: 1, atk: 1, def: 1 };
  const affixes = [];
  const lore = []; // 加成来源明细，给 UI 展示用

  // ---- 装备 ----
  let eqAtk = 0, eqDef = 0, eqHp = 0, eqMp = 0, eqSpd = 0;
  for (const inst of equippedInstances()) {
    const base = equipById(inst.baseId);
    if (!base) continue;
    const lvScale = 1 + (inst.level - 1) * 0.12;
    const qScale = qualityMult(inst.quality);
    const b = base.base || {};
    eqAtk += (b.atk || 0) * lvScale * qScale;
    eqDef += (b.def || 0) * lvScale * qScale;
    eqHp += (b.hp || 0) * lvScale * qScale;
    eqMp += (b.mp || 0) * lvScale * qScale;
    eqSpd += (b.spd || 0) * lvScale * qScale;

    for (const af of inst.affixes || []) {
      add[af.stat] = (add[af.stat] || 0) + af.value;
      affixes.push({ ...af, source: base.name });
    }
  }
  add.atk += eqAtk; add.def += eqDef; add.hp += eqHp;
  add.mp += eqMp; add.spd += eqSpd;
  if (eqAtk || eqDef || eqHp) lore.push({ source: '装备', atk: eqAtk, def: eqDef, hp: eqHp });

  // ---- 功法 ----
  let teAtk = 0, teDef = 0, teHp = 0, teMp = 0, teSpd = 0, teCrit = 0;
  let techCultBonus = 0;      // Σ(mult - 1)
  let techBreakBonus = 0;
  const techAffixes = [];

  for (const tid of state.techniques.equipped || []) {
    const tech = techById(tid);
    const known = state.techniques.known?.[tid];
    if (!tech || !known) continue;
    const st = techStatsAt(tech, known.level);
    teAtk += st.attrs.atk || 0;
    teDef += st.attrs.def || 0;
    teHp += st.attrs.hp || 0;
    teMp += st.attrs.mp || 0;
    teSpd += st.attrs.spd || 0;
    teCrit += st.attrs.crit || 0;
    add.comprehension += st.attrs.comprehension || 0;

    techCultBonus += st.cultMult - 1;
    if (st.affix) {
      techAffixes.push({ ...st.affix, source: tech.name });
      if (st.affix.kind === 'break_aid') techBreakBonus += st.affix.value;
      if (st.affix.kind === 'hp_up') mul.hp *= 1 + st.affix.value;
    }
  }
  add.atk += teAtk; add.def += teDef; add.hp += teHp;
  add.mp += teMp; add.spd += teSpd; add.crit += teCrit;
  if (teAtk || teDef || teHp) lore.push({ source: '功法', atk: teAtk, def: teDef, hp: teHp });

  // ---- 永久属性点（丹药 / 事件） ----
  const attr = state.player.attributes || {};
  add.comprehension += attr.comprehension || 0;
  add.daoHeart += attr.daoHeart || 0;
  add.spiritSense += attr.spiritSense || 0;

  // ---- 佩戴称号（成就解锁，小幅加成） ----
  const tb = titleBonusFor(state.achievements?.title);
  if (tb && tb.value) {
    add[tb.attr] = (add[tb.attr] || 0) + tb.value;
    lore.push({ source: '称号 · ' + tb.title, [tb.attr]: tb.value });
  }

  // ---- 宗门（V3.0）----
  // sectBonus() 由 systems/sect.js 提供，未入宗门时全为 0。
  // 与 cultivation.js 构成循环引用，但双方都只在函数体内使用对方，
  // 模块求值阶段不触碰，所以是安全的。
  // ---- 轮回天赋（V4.0）----
  // 与宗门同理：百分比加成，不塞进 lore。
  // 注意 hpPct 可以为负——「焚天秘法」这类天赋的代价就走同一条通道，
  // 玩家拿到的永远是净值。
  // ---- 图鉴收集（V4.0）----
  // 收集度是线性缩放的：收一半给一半，不搞阶段性突变。
  // 量级刻意克制（满收集也就几个百分点），它是"顺手的奖励"而非目标本身。
  const cb = codexBonusAllSafe();
  if (cb.atkPct) mul.atk *= 1 + cb.atkPct;
  if (cb.defPct) mul.def *= 1 + cb.defPct;
  if (cb.hpPct) mul.hp *= 1 + cb.hpPct;
  add.crit += cb.critAdd || 0;
  add.comprehension += cb.comprehensionAdd || 0;
  add.daoHeart += cb.daoHeartAdd || 0;
  // 里程碑给的固定属性点
  const cr = codexReward();
  add.comprehension += cr.comprehension || 0;
  add.daoHeart += cr.daoHeart || 0;
  add.spiritSense += cr.spiritSense || 0;

  // ---- 道侣（V4.0）----
  // 只有**立为道侣**的那一位给加成。五个人全叠会明显超模，
  // 而且"选择一个同行者"本身就是这个系统的核心决策。
  const cmpAtk = companionBonus('atkPct'); if (cmpAtk) mul.atk *= 1 + cmpAtk;
  const cmpDef = companionBonus('defPct'); if (cmpDef) mul.def *= 1 + cmpDef;
  const cmpHp = companionBonus('hpPct'); if (cmpHp) mul.hp *= 1 + cmpHp;
  add.comprehension += companionBonus('comprehensionAdd') || 0;
  add.daoHeart += companionBonus('daoHeartAdd') || 0;

  const talAtk = talentBonus('atkPct'); if (talAtk) mul.atk *= 1 + talAtk;
  const talDef = talentBonus('defPct'); if (talDef) mul.def *= 1 + talDef;
  const talHp = talentBonus('hpPct'); if (talHp) mul.hp *= 1 + talHp;
  add.crit += talentBonus('critAdd');
  add.comprehension += talentBonus('comprehensionAdd');
  add.daoHeart += talentBonus('daoHeartAdd');

  // 宗门加成是**百分比**，与装备/功法的加法项形状不同，
  // 塞进 lore 只会得到一条全是 0 的误导性条目。它在 UI 里由 informPanel
  // 直接读 sectBonus() 单独呈现。
  const sb = sectBonus();
  if (sb) {
    if (sb.atkPct) mul.atk *= 1 + sb.atkPct;
    if (sb.defPct) mul.def *= 1 + sb.defPct;
    if (sb.hpPct) mul.hp *= 1 + sb.hpPct;
    if (sb.critAdd) add.crit += sb.critAdd;
    if (sb.comprehensionAdd) add.comprehension += sb.comprehensionAdd;
  }

  return {
    add, mul, affixes: [...affixes, ...techAffixes], lore,
    techCultBonus, techBreakBonus,
  };
}

function qualityMult(q) {
  const table = { fan: 1, ling: 1.25, xian: 1.6, shen: 2.1, sheng: 2.8 };
  return table[q] ?? 1;
}

// ==================== 基础派生属性 ====================

export function calcMaxHp() {
  const a = aggregate();
  const base = 100 + state.player.realmIndex * 28;
  return Math.floor((base + a.add.hp) * a.mul.hp);
}

export function calcMaxMp() {
  const a = aggregate();
  return Math.floor(50 + state.player.realmIndex * 14 + a.add.mp);
}

export function calcAtk() {
  const a = aggregate();
  const base = state.player.base.atk + state.player.realmIndex * 3;
  return Math.floor((base + a.add.atk) * a.mul.atk);
}

export function calcDef() {
  const a = aggregate();
  const base = state.player.base.def + state.player.realmIndex * 2;
  return Math.floor((base + a.add.def) * a.mul.def);
}

export function calcSpd() {
  const a = aggregate();
  return Math.floor(state.player.base.spd + state.player.realmIndex * 1.5 + a.add.spd);
}

export function calcCrit() {
  const a = aggregate();
  return clamp01(state.player.base.crit + state.player.realmIndex * 0.004 + a.add.crit);
}

export function calcCritDmg() {
  return state.player.base.critDmg;
}

export function calcComprehension() {
  const a = aggregate();
  return state.player.base.comprehension + a.add.comprehension + caveEffect('bld_library') * 10;
}

export function calcDaoHeart() {
  const a = aggregate();
  return state.player.base.daoHeart + a.add.daoHeart;
}

export function calcSpiritSense() {
  const a = aggregate();
  return state.player.base.spiritSense + a.add.spiritSense;
}

export function calcLuck() {
  return clamp(
    state.player.base.luck + (state.player.attributes?.luck || 0)
      + talentBonus('luckAdd') + (codexReward().luck || 0) + (companionBonus('luckAdd') || 0),
    1, 100,
  );
}

/**
 * 当前寿元。
 * player.lifespan 是绝对值（由突破与事件增减），这里做一次兜底：
 * 老存档可能没有该字段，此时用当前境界的基础寿元补上。
 */
export function calcLifespan() {
  const v = state.player.lifespan;
  if (Number.isFinite(v) && v > 0) return v;
  return realm().lifespan;
}

function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ==================== 洞府加成 ====================

/** 取某座建筑当前等级（未建造为 0） */
export function buildingLevel(id) {
  return state.cave.buildings?.[id]?.level || 0;
}

/** 取某座建筑的效果数值 = perLevel × 等级 */
export function caveEffect(id) {
  const bld = BUILDINGS.find((b) => b.id === id);
  if (!bld || !bld.effect) return 0;
  return (bld.effect.perLevel || 0) * buildingLevel(id);
}

/** 洞府整体修炼倍率 */
export function caveCultMult() {
  return 1 + caveEffect('bld_spirit');
}

// ==================== 修炼速率 ====================

/**
 * 乘区软上限。
 *
 * 满配原始倍率：灵根 2.5 × 功法 9.63（4 槽求和）× 洞府 3.52 = **84.7 倍**。
 * ⚠ 功法是**槽位求和**（techSlotsFor 给 1/2/3/4 槽，techCultBonus 累加 mult-1），
 *   4 槽满配 techMult 是 9.63 而非单本的 3.64——早期文档按单本估算，低估 2.6 倍。
 *
 * 这里对**持续倍率**做渐近压缩：低于 60% 上限（14.4）时完全线性不打折，
 * 超过后收益递减，渐近逼近上限。raw → 有效：14.4 → 14.4、30 → 22.1、
 * 60 → 23.9、84.7 → 24.0。**raw 超过约 30 后已基本饱和**
 * （30 → 84.7 多投 2.8 倍资源只换来 +8.5%），后期功法投入边际收益接近零，
 * 这是已知待修项，见 docs/设计文档.md §0.2 与 §0.5。
 */
const SUSTAINED_CAP = 24;

function squashMult(raw, cap) {
  const linear = cap * 0.6;
  if (raw <= linear) return raw;
  const excess = raw - linear;
  const room = cap - linear;
  return linear + room * (1 - Math.exp(-excess / room));
}

/**
 * 计算当前修炼速率（修为 / 秒）。
 * 同时返回明细，供 UI 展示"为什么是这个数"。
 */
export function cultSpeedBreakdown() {
  const r = realm();
  const rootMult = state.player.spiritRoot?.mult ?? 1;
  const a = aggregate();
  const techMult = 1 + a.techCultBonus;
  const caveMult = caveCultMult();

  const rawSustained = rootMult * techMult * caveMult;
  const sustained = squashMult(rawSustained, SUSTAINED_CAP);
  const buffMult = buffMultiplier('cult');
  // 立场修正放在软上限**之外**：它是"路线选择"的固定系数，不是可堆叠的成长资源，
  // 若卷进 squash 里，邪道的 +15% 在高配时会被压没，取舍就不成立了。
  const stanceMult = stanceCultMult();
  // 宗门藏剑阁的修炼加成，同样在软上限之外（它是"归属"的回报，不是可堆叠资源）
  const sectPct = sectBonus()?.cultPct || 0;
  const sectMult = 1 + sectPct;
  // 轮回：记忆残留 + 本世天命，合并成一个来源对外
  const reincPct = reincarnationBonus('cultPct');
  const reincMult = 1 + reincPct;
  // 天赋的修炼加成同样放在软上限之外：它是"多世积累"的回报，不是可堆叠的成长资源
  const talentMult = 1 + talentBonus('cultPct');
  // 天象：按现实时间轮换的全局加成（灵气潮汐等）
  const eventMult = 1 + (eventBonus('cultPct') || 0);
  // 图鉴收集
  const codexMult = 1 + (codexBonusAllSafe().cultPct || 0);
  const companionMult = 1 + (companionBonus('cultPct') || 0);

  const base = r.baseSpeed;
  const value = base * sustained * buffMult * stanceMult * sectMult
                * reincMult * talentMult * eventMult * codexMult * companionMult;

  return {
    value: Math.floor(value),
    base,
    rootMult,
    techMult,
    caveMult,
    sustained,
    rawSustained,
    capped: rawSustained > sustained + 0.01,
    buffMult,
    stanceMult,
    sectMult,
    reincMult,
    talentMult,
    eventMult,
    codexMult,
    companionMult,
    parts: [
      { label: '境界基础', value: base, type: 'base' },
      { label: '灵根 · ' + (state.player.spiritRoot?.name ?? '无'), mult: rootMult },
      { label: '功法', mult: techMult },
      { label: '洞府聚灵阵', mult: caveMult },
      ...(buffMult !== 1 ? [{ label: '丹药/事件', mult: buffMult }] : []),
      ...(stanceMult !== 1 ? [{ label: '立场 · 邪道', mult: stanceMult }] : []),
      ...(sectMult !== 1 ? [{ label: '宗门 · 藏剑阁', mult: sectMult }] : []),
      ...(reincMult !== 1 ? [{ label: '轮回 · 记忆残留', mult: reincMult }] : []),
      ...(talentMult !== 1 ? [{ label: '天赋', mult: talentMult }] : []),
      ...(eventMult !== 1 ? [{ label: '天象', mult: eventMult }] : []),
      ...(codexMult !== 1 ? [{ label: '图鉴', mult: codexMult }] : []),
      ...(companionMult !== 1 ? [{ label: '道侣', mult: companionMult }] : []),
    ],
  };
}

export function calcCultSpeed() {
  if (isMaxRealm()) return 0;
  return cultSpeedBreakdown().value;
}

// ==================== 临时 Buff ====================

/** 某种 buff 的乘法总倍率 */
export function buffMultiplier(stat) {
  let m = 1;
  for (const b of state.buffs || []) {
    if (b.stat === stat && b.mult) m *= b.mult;
  }
  return m;
}

/** 某种 buff 的加法总值（如突破概率 +0.12） */
export function buffBonus(stat) {
  let sum = 0;
  for (const b of state.buffs || []) {
    if (b.stat === stat && b.add) sum += b.add;
  }
  return sum;
}

export function addBuff({ id, name, stat, mult, add, duration }) {
  const existing = (state.buffs || []).find((b) => b.id === id);
  const endsAt = Date.now() + duration * 1000;
  if (existing) {
    existing.endsAt = Math.max(existing.endsAt, endsAt);
    return existing;
  }
  state.buffs = state.buffs || [];
  const buff = { id, name, stat, mult, add, endsAt };
  state.buffs.push(buff);
  return buff;
}

/** 清理过期 buff，返回是否有变化 */
export function tickBuffs() {
  if (!state.buffs || state.buffs.length === 0) return false;
  const now = Date.now();
  const before = state.buffs.length;
  state.buffs = state.buffs.filter((b) => b.endsAt > now);
  return state.buffs.length !== before;
}

export function activeBuffs() {
  const now = Date.now();
  return (state.buffs || []).filter((b) => b.endsAt > now);
}

// ==================== 修为增长 ====================

/**
 * 增加修为。返回实际增加的量（到达上限会截断）。
 * 注意：这里只负责加修为，突破由 breakthrough.js 决策。
 *
 * @param {number} amount 增量
 * @param {string} source 诊断用的来源标签（修炼/战斗/塔/奇遇/丹药/离线）。
 *   不传则记为「未知」——若摘要里出现「未知」，说明有新发奖点漏了标签。
 */
export function gainCult(amount, source = '未知') {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (isMaxRealm()) {
    state.player.cult = 0;
    return 0;
  }
  // 修为在当前境界封顶：这样每个境界的时长就等于 needCult / 速率，
  // 与 balance_sim.py 的模型一致；突破失败的 25% 惩罚也因此才有明确含义。
  const cap = realm().needCult;
  const before = state.player.cult;
  state.player.cult = cap == null ? before + amount : Math.min(cap, before + amount);
  const gained = state.player.cult - before;

  state.stats.totalCultGained = (state.stats.totalCultGained || 0) + gained;
  noteCultGain(source, gained);
  if (gained > 0) emit(EV.CULT_GAIN, { amount: gained });
  return gained;
}

/** 修为是否已满（可突破） */
export function isCultFull() {
  const r = realm();
  if (r.needCult == null) return false;
  return state.player.cult >= r.needCult;
}

/** 距离突破还差多少修为 */
export function cultRemaining() {
  const r = realm();
  if (r.needCult == null) return 0;
  return Math.max(0, r.needCult - state.player.cult);
}

/** 距离突破还需多少秒（按当前速率估算，不含丹药加速） */
export function etaToBreakthrough() {
  const remain = cultRemaining();
  const speed = calcCultSpeed();
  if (remain <= 0) return 0;
  if (speed <= 0) return Infinity;
  return remain / speed;
}

// ==================== 每秒结算 ====================

/** 主循环每秒调用：修炼、回血回蓝、buff 计时 */
export function tick(dt) {
  tickBuffs();

  if (!isMaxRealm()) {
    gainCult(calcCultSpeed() * dt, '修炼');
  }

  // 气血 / 灵力缓慢自然恢复（战斗外的休整）
  const maxHp = calcMaxHp();
  const maxMp = calcMaxMp();
  state.player.hp = Math.min(maxHp, state.player.hp + dt * maxHp * 0.004);
  state.player.mp = Math.min(maxMp, state.player.mp + dt * maxMp * 0.03);

  // 寿元随现实时间流逝？不。寿元只在事件与突破时变动，避免玩家被时间压死。
}
