/**
 * 图鉴系统（V4.0「轮回」，纯逻辑，禁止 DOM）。
 *
 * 收集向的长期目标：把玩家「见过 / 拥有过」的功法、装备、丹药、灵材、
 * 灵兽、敌人、奇遇逐条记进 state.codex。契约见 docs/版本规划.md §5.9。
 *
 * 设计要点：
 *   1. record() 只做「记录」，不发放物品、不加成，副作用仅限于首次收录时的
 *      里程碑播报。系统之间用它做单向留痕，不互相依赖。
 *   2. tickCodex(dt) 做**节流自动补录**：背包 / 已学功法 / 灵兽等"手上已有的东西"
 *      不必手动调用 record()，扫描时自动补进图鉴。这样老玩家的旧存档一读进来，
 *      已有的积累就会自己出现在图鉴里。
 *   3. 收集度加成走 codexReward() / codexBonus() 两个**纯函数**出口，
 *      由 systems/cultivation.js 的 aggregate() 接线。本模块不写 player.attributes，
 *      避免和丹药、成就等其它来源互相覆盖。
 *   4. 数值必须克制：满图鉴也只是"几个百分点"的量级（见下方两张表）。
 */

import { state, realmAt } from '../core/state.js';
import { emit, EV } from '../core/bus.js';
import { PATHS, TECHNIQUES } from '../data/techniques.js';
import { EQUIPMENTS } from '../data/equipments.js';
import { PILLS } from '../data/pills.js';
import { MATERIALS } from '../data/materials.js';
import { BEASTS } from '../data/beasts.js';
import { ENEMIES } from '../data/enemies.js';
import { ENCOUNTERS } from '../data/encounters.js';

/** 自动补录的扫描间隔（秒）。挂机游戏里图鉴不是每秒都变，3 秒足够灵敏。 */
const SCAN_INTERVAL = 3;

const TIER_NAMES = { 1: '炼气', 2: '筑基', 3: '金丹', 4: '元婴', 5: '化神以上' };
const SLOT_NAMES = { weapon: '兵器', armor: '护具', treasure: '法宝' };

/** 收录未收集条目时显示的占位名 / 描述 */
export const UNKNOWN_NAME = '???';
export const UNKNOWN_DESC = '???';

// ==================== 图鉴分类定义 ====================

/**
 * 七个分类。每类给出：
 *   id       对应 state.codex 的字段名
 *   name     中文名
 *   table    数据表（total 由此得出）
 *   nameOf   条目名（奇遇用 title）
 *   descOf   条目描述
 *   loreOf   条目小传（无则 null）
 *   summaryOf 已收集时展示的关键数值行（可为空串）
 *   clueOf   未收集时给的获取线索
 *
 * 排序即 UI 分栏顺序。
 */
export const CODEX_KINDS = [
  {
    id: 'techniques', name: '功法', table: TECHNIQUES,
    nameOf: (e) => e.name,
    descOf: (e) => e.desc,
    loreOf: (e) => e.lore || '',
    summaryOf: (e) => `${PATHS[e.path]?.name || '未知'} · 修炼 ×${Number(e.baseMult).toFixed(2)}起 · ${e.maxLevel} 层`,
    clueOf: (e) => (e.minRealm > 0 ? `参悟于「${realmAt(e.minRealm).name}」` : '炼气入门即可参悟'),
  },
  {
    id: 'equipped', name: '装备', table: EQUIPMENTS,
    nameOf: (e) => e.name,
    descOf: (e) => e.desc,
    loreOf: () => '',
    summaryOf: (e) => `${SLOT_NAMES[e.slot] || e.slot} · ${qualityName(e.quality)} · 阶 ${e.tier}`,
    clueOf: (e) => `现于${TIER_NAMES[e.tier] || '未知'}一带 · 最低「${realmAt(e.minRealm).name}」`,
  },
  {
    id: 'pills', name: '丹药', table: PILLS,
    nameOf: (e) => e.name,
    descOf: (e) => e.desc,
    loreOf: () => '',
    summaryOf: (e) => `${qualityName(e.quality)}丹 · ${effectName(e.effect)}`,
    clueOf: (e) => `丹方见于「${realmAt(e.minRealm).name}」`,
  },
  {
    id: 'materials', name: '灵材', table: MATERIALS,
    nameOf: (e) => e.name,
    descOf: (e) => e.desc,
    loreOf: () => '',
    summaryOf: (e) => `${kindName(e.kind)} · 阶 ${e.tier}`,
    clueOf: (e) => `采自${TIER_NAMES[e.tier] || '未知'}一带`,
  },
  {
    id: 'beasts', name: '灵兽', table: BEASTS,
    nameOf: (e) => e.name,
    descOf: (e) => e.desc,
    loreOf: (e) => e.lore || '',
    summaryOf: (e) => `资质上限 ${e.starCap?.max ?? '?'} 星 · 最低「${realmAt(e.minRealm).name}」`,
    clueOf: (e) => (e.eggFrom ? `可于${TIER_NAMES[e.tier] || '未知'}一带捕捉 / 孵化` : '行踪成谜，尚未有人捕获'),
  },
  {
    id: 'enemies', name: '敌人', table: ENEMIES,
    nameOf: (e) => e.name,
    descOf: (e) => e.desc,
    loreOf: () => '',
    summaryOf: (e) => `${TIER_NAMES[e.tier] || '未知'} · 战力 ${e.power}`,
    clueOf: (e) => `出没于${TIER_NAMES[e.tier] || '未知'}一带（「${realmAt(e.minRealm).name}」以上）`,
  },
  {
    id: 'encounters', name: '奇遇', table: ENCOUNTERS,
    nameOf: (e) => e.title,
    descOf: (e) => e.desc,
    loreOf: () => '',
    summaryOf: (e) => `${tierLabel(e.tier)} · ${realmAt(e.minRealm).name}~${realmAt(e.maxRealm ?? 25).name}`,
    clueOf: (e) => `游历于「${realmAt(e.minRealm).name}」之后（${tierLabel(e.tier)}）`,
  },
];

const KIND_MAP = new Map(CODEX_KINDS.map((k) => [k.id, k]));

export function kindMeta(kind) {
  return KIND_MAP.get(kind) || null;
}

function qualityName(id) {
  return { fan: '凡', ling: '灵', xian: '仙', shen: '神', sheng: '圣' }[id] || id || '凡';
}

function effectName(effect) {
  const names = {
    cult: '修为', restoreHp: '疗伤', restoreMp: '回灵', breakthrough: '突破',
    buff: '增益', attr: '属性', rerollRoot: '洗髓', lifespan: '续命',
  };
  return names[effect?.kind] || '特殊';
}

function kindName(kind) {
  return { herb: '草药', ore: '矿石', beast: '兽材' }[kind] || '灵材';
}

function tierLabel(tier) {
  return { good: '善缘', bad: '凶险', neutral: '平淡', rare: '奇缘' }[tier] || '际遇';
}

// ==================== 状态兜底 ====================

/**
 * 保证 state.codex 结构完整。
 * 新档由 createInitialState() 给出；旧档由 save.js 补齐；这里再兜一层，
 * 防止手改存档或缺字段导致崩溃。
 */
function ensureCodex() {
  if (!state.codex || typeof state.codex !== 'object') state.codex = {};
  for (const k of CODEX_KINDS) {
    if (!Array.isArray(state.codex[k.id])) state.codex[k.id] = [];
  }
  return state.codex;
}

/** 数据表总条目数 */
export function totalOf(kind) {
  return kindMeta(kind)?.table.length || 0;
}

/** 取某个分类的完整数据表（副本引用，只读用） */
export function entriesOf(kind) {
  return kindMeta(kind)?.table || [];
}

/** 按 id 取条目 */
export function entryOf(kind, id) {
  return entriesOf(kind).find((e) => e.id === id) || null;
}

// ==================== 记录 / 查询 ====================

/**
 * 记录一次「见过 / 拥有过」。
 * @param {string} kind  CODEX_KINDS 的 id
 * @param {string} id    数据条目的 id
 * @returns {boolean} 是否是**首次**收录
 */
export function record(kind, id) {
  const meta = kindMeta(kind);
  if (!meta) return false;
  if (!id || !entryOf(kind, id)) return false;   // 只收录数据表里真实存在的条目
  const arr = ensureCodex()[kind];
  if (arr.includes(id)) return false;
  arr.push(id);
  announceMilestones();
  return true;
}

export function has(kind, id) {
  const c = state.codex?.[kind];
  return Array.isArray(c) && c.includes(id);
}

/** 某个分类的收集进度。pct 为 0..1 的小数。 */
export function progress(kind) {
  const total = totalOf(kind);
  const got = Array.isArray(state.codex?.[kind]) ? state.codex[kind].length : 0;
  return { got, total, pct: total > 0 ? got / total : 0 };
}

/** 全图鉴总进度。pct 为 0..1 的小数。 */
export function overallProgress() {
  let got = 0;
  let total = 0;
  for (const k of CODEX_KINDS) {
    const p = progress(k.id);
    got += p.got;
    total += p.total;
  }
  return { got, total, pct: total > 0 ? got / total : 0 };
}

/** 某个分类里尚未收集的条目（供 UI 显示 ??? 与线索） */
export function unseenOf(kind) {
  return entriesOf(kind).filter((e) => !has(kind, e.id));
}

/** 已收集的条目 */
export function seenOf(kind) {
  const got = new Set(Array.isArray(state.codex?.[kind]) ? state.codex[kind] : []);
  return entriesOf(kind).filter((e) => got.has(e.id));
}

/** 未收集条目的展示名（恒为 ???） */
export function displayName(kind, id) {
  return has(kind, id) ? (kindMeta(kind)?.nameOf(entryOf(kind, id)) ?? id) : UNKNOWN_NAME;
}

/** 未收集条目的获取线索 */
export function clueFor(kind, id) {
  const meta = kindMeta(kind);
  const e = entryOf(kind, id);
  if (!meta || !e) return '';
  return meta.clueOf ? meta.clueOf(e) : '';
}

/** 已收集条目的关键数值行（未收集返回空串） */
export function summaryFor(kind, id) {
  if (!has(kind, id)) return '';
  const meta = kindMeta(kind);
  const e = entryOf(kind, id);
  if (!meta || !e || !meta.summaryOf) return '';
  return meta.summaryOf(e) || '';
}

// ==================== 收集度加成（纯函数出口，接线由 cultivation 负责） ====================

/**
 * 全图鉴里程碑奖励。
 * 每档都是**小的永久属性**，累加后满图鉴也只是十余点属性的量级，绝不喧宾夺主。
 */
export const CODEX_MILESTONES = [
  { pct: 0.25, label: '窥见门径', add: { comprehension: 2 } },
  { pct: 0.50, label: '博闻强识', add: { daoHeart: 2 } },
  { pct: 0.75, label: '洞明万象', add: { spiritSense: 2 } },
  { pct: 1.00, label: '穷极天机', add: { luck: 5 } },
];

/**
 * 收集度带来的永久属性加成。
 * 返回 { comprehension, daoHeart, spiritSense, luck }，未达档位为 0。
 * 满图鉴总量：悟性 +2 / 道心 +2 / 神识 +2 / 气运 +5。
 */
export function codexReward() {
  const out = { comprehension: 0, daoHeart: 0, spiritSense: 0, luck: 0 };
  const p = overallProgress().pct;
  for (const m of CODEX_MILESTONES) {
    if (p < m.pct) continue;
    for (const [k, v] of Object.entries(m.add)) out[k] += v;
  }
  return out;
}

/**
 * 分类满收集时的加成上限。集中在这里，改平衡只改这一处。
 * 满收集时每个通道最多 2%，**整套图鉴加起来也只是几个百分点**。
 */
export const CODEX_KIND_BONUS = {
  techniques: { cultPct: 0.02 },   // 功法满收集：修炼速率 +2%
  equipped:   { atkPct: 0.02 },    // 装备满收集：攻击 +2%
  pills:      { cultPct: 0.01 },   // 丹药满收集：修炼速率 +1%
  materials:  { defPct: 0.01 },    // 灵材满收集：防御 +1%
  beasts:     { hpPct: 0.01 },     // 灵兽满收集：气血 +1%
  enemies:    { combatPct: 0.01 }, // 敌人满收集：战斗属性 +1%
  encounters: { luckAdd: 2 },      // 奇遇满收集：气运 +2
};

/**
 * 按分类汇总收集加成，按当前进度线性缩放。
 * 返回 { cultPct?, atkPct?, ... }，未收集为各通道 0（省略键）。
 */
export function codexBonus(kind) {
  const base = CODEX_KIND_BONUS[kind];
  if (!base) return {};
  const p = progress(kind).pct;
  const out = {};
  for (const [k, v] of Object.entries(base)) out[k] = v * p;
  return out;
}

/** 全部图鉴分类加成合并（供 UI 或 cultivation 一次性取用） */
export function codexBonusAll() {
  const out = {};
  for (const k of CODEX_KINDS) {
    for (const [key, val] of Object.entries(codexBonus(k.id))) {
      out[key] = (out[key] || 0) + val;
    }
  }
  return out;
}

// ==================== 里程碑播报 ====================

function announceMilestones() {
  const p = overallProgress().pct;
  state.flags = state.flags || {};
  const done = Array.isArray(state.flags.codexMilestones) ? state.flags.codexMilestones : [];
  for (const m of CODEX_MILESTONES) {
    if (p >= m.pct && !done.includes(m.pct)) {
      done.push(m.pct);
      emit(EV.LOG, {
        text: `【图鉴】收集度已达 ${Math.round(m.pct * 100)}% —— ${m.label}，永久属性提升。`,
        cls: 'event-special',
        channel: 'system',
      });
    }
  }
  state.flags.codexMilestones = done;
}

// ==================== 自动补录 ====================

/**
 * 扫描当前持有的东西，补录进图鉴。
 * 覆盖：已学功法、背包/已穿戴装备、身上丹药、灵材、灵兽（含灵兽蛋）。
 * 敌人与奇遇没有"持有列表"，只能靠战斗 / 奇遇系统调用 record() 留痕。
 * @returns {number} 本次新收录的条目数
 */
export function autoRecord() {
  let n = 0;
  const take = (kind, ids) => {
    for (const id of ids) if (record(kind, id)) n++;
  };

  take('techniques', Object.keys(state.techniques?.known || {}));
  take('equipped', (state.equipment?.owned || []).map((i) => i.baseId));
  take('pills', Object.entries(state.consumables || {}).filter(([, c]) => c > 0).map(([id]) => id));
  take('materials', Object.entries(state.resources?.materials || {}).filter(([, c]) => c > 0).map(([id]) => id));
  take('beasts', (state.beasts?.owned || []).map((b) => b.baseId));
  take('beasts', (state.beasts?.eggs || []).map((e) => e.baseId));

  return n;
}

let _acc = 0;

/**
 * 主循环每秒调用。节流（默认 3 秒）做一次自动补录，不每秒全量扫描。
 */
export function tickCodex(dt) {
  _acc += Number(dt) || 0;
  if (_acc < SCAN_INTERVAL) return 0;
  _acc = 0;
  return autoRecord();
}

/** 重开档时清掉节流累加器 */
export function resetCodexTick() {
  _acc = 0;
}
