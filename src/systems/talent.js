/**
 * 轮回天赋树系统（V4.0）。
 *
 * ============ 定位 ============
 *
 * 天赋树是"唯一跨世货币"道基点（state.reincarnation.daoBase）的出口，
 * 也是历世积累转化为永久成长的通道。它横切进修炼 / 战斗 / 机缘各系统，
 * 但**规则只在本文件定义一处**——照抄 systems/stance.js 的模式：
 * 本模块导出纯函数 `talentBonus(kind)`，其它系统 import 取用，
 * 不在各系统里散落魔数。
 *
 * ============ 与 state 的关系 ============
 *
 * 只读写 `state.reincarnation.daoBase` 与 `state.reincarnation.talents`。
 * 这两个字段的**清空 / 保留规则**由 systems/reincarnation.js 独占决定，
 * 本模块不参与轮回，只负责"点天赋、汇总加成"。
 * 老存档可能没有 reincarnation 字段（契约新增于 V4.0），
 * 这里做兜底以确保任何入口都不会因缺字段而崩。
 *
 * 纯逻辑，禁止 DOM。
 */

import { state } from '../core/state.js';
import { emit, EV } from '../core/bus.js';
import { TALENTS, BRANCHES, BRANCH_ORDER, talentById, talentsByBranch, mainTalentOf } from '../data/talents.js';

/** 洗点是否收费。当前为免费：返还全部已投入道基点，不设罚金。 */
export const RESPEC_FEE = 0;

// ==================== state 兜底访问 ====================

/**
 * 取 reincarnation 子树；老存档缺字段时原地补一份最小结构。
 * 这不是"迁移"（迁移由 core/save.js 的 mergeDefaults 负责），
 * 只是防止某个入口拿到 undefined 后整条链崩掉。
 */
function reinc() {
  let r = state.reincarnation;
  if (!r || typeof r !== 'object') {
    r = {};
    state.reincarnation = r;
  }
  if (!r.talents || typeof r.talents !== 'object') r.talents = {};
  if (!Number.isFinite(r.daoBase)) r.daoBase = 0;
  return r;
}

// ==================== 已投入点数 ====================

/** 某天赋当前等级（未学为 0） */
export function talentLevel(id) {
  return reinc().talents[id] || 0;
}

/**
 * 某条支线已投入的点数 = 该系全部天赋的等级之和。
 * 这是"层级解锁"的度量：requires.points 比较的就是它。
 * 注意它统计的是**等级数**，不是消耗的道基点。
 */
export function branchPoints(branch) {
  let n = 0;
  for (const t of talentsByBranch(branch)) n += talentLevel(t.id);
  return n;
}

/** 全树已投入点数（三系之和） */
export function totalPoints() {
  let n = 0;
  for (const t of TALENTS) n += talentLevel(t.id);
  return n;
}

/** 某天赋若从 0 升到当前等级，累计消耗的道基点 */
export function spentOn(id) {
  const def = talentById(id);
  const lv = talentLevel(id);
  if (!def || lv <= 0) return 0;
  let sum = 0;
  for (let i = 0; i < Math.min(lv, def.maxLevel); i++) sum += def.costPerLevel[i] || 0;
  return sum;
}

/** 全树累计消耗的道基点（洗点返还的就是这个数） */
export function totalSpent() {
  let n = 0;
  for (const t of TALENTS) n += spentOn(t.id);
  return n;
}

/** 升到下一级需要多少道基点；已满级或未知返回 null */
export function nextCost(id) {
  const def = talentById(id);
  if (!def) return null;
  const lv = talentLevel(id);
  if (lv >= def.maxLevel) return null;
  return def.costPerLevel[lv] || 0;
}

// ==================== 学习 / 洗点 ====================

/**
 * 能否学习（升一级）某天赋。
 * 判定顺序即体验顺序：先看等级，再看前置，最后看钱。
 * @returns {{ok:boolean, reason?:string, cost:number|null, level:number}}
 */
export function canLearn(id) {
  const def = talentById(id);
  const lv = talentLevel(id);
  if (!def) return { ok: false, reason: '未知天赋', cost: null, level: 0 };
  if (lv >= def.maxLevel) return { ok: false, reason: '已至圆满', cost: null, level: lv };

  const req = def.requires;
  if (req && req.points > 0) {
    const have = branchPoints(req.branch || def.branch);
    if (have < req.points) {
      const bname = BRANCHES[req.branch || def.branch]?.name || '本系';
      return {
        ok: false,
        reason: `需先在【${bname}】投入 ${req.points} 点（当前 ${have}）`,
        cost: nextCost(id), level: lv,
      };
    }
  }

  const cost = nextCost(id);
  const base = reinc().daoBase;
  if (base < cost) {
    return { ok: false, reason: `道基点不足（还差 ${cost - base}）`, cost, level: lv };
  }
  return { ok: true, cost, level: lv };
}

/**
 * 学习（升一级）。成功则扣除道基点并写日志。
 * @returns {{ok:boolean, reason?:string, cost?:number, level?:number}}
 */
export function learn(id) {
  const def = talentById(id);
  const c = canLearn(id);
  if (!c.ok) return c;

  const r = reinc();
  r.daoBase -= c.cost;
  r.talents[id] = c.level + 1;

  // 天赋是永久投资，用 event-special 留痕，方便玩家回看"这一世点了什么"
  log(`【${def.name}】升至 ${c.level + 1} / ${def.maxLevel} 重，耗道基点 ${c.cost}。`, 'event-special');
  if (r.talents[id] >= def.maxLevel) {
    log(`【${def.name}】已臻圆满。${def.main ? '本系主线大成——轮回的尽头，似乎更近了一步。' : ''}`, 'event-special');
  }
  emit(EV.STATE_DIRTY, { source: 'talent', id });

  return { ok: true, cost: c.cost, level: r.talents[id] };
}

/**
 * 洗点：清空全树，返还累计投入的全部道基点（当前免费，不设罚金）。
 * 加成随 talents 清空而即刻归零——因为加成是**按需汇总**的，
 * 不像 buff 那样有残留状态，所以不存在"洗了但加成还在"的可能。
 * @returns {{ok:boolean, refunded:number}}
 */
export function respec() {
  const r = reinc();
  const refunded = totalSpent();
  r.talents = {};
  r.daoBase += refunded;

  if (refunded > 0) {
    log(`洗尽前尘——天赋尽数归还，收回道基点 ${refunded}。`, 'event-special');
    emit(EV.STATE_DIRTY, { source: 'talent', respec: true });
  }
  return { ok: true, refunded };
}

// ==================== 加成汇总（其它系统的唯一入口） ====================

/**
 * 按 kind 汇总天赋加成值。
 *
 * 这是本模块最重要的接口，用法与 stance.js 的修正函数一致：
 * 各系统 import 后直接取用，不自己遍历天赋表。
 *
 * 规则：
 *   - 正向效果 effect.kind 命中 → 加上 perLevel × 等级
 *   - 代价效果 effect.malus.kind 命中 → **减去** perLevel × 等级
 *     （代价与加成共用同一套 kind 通道，所以调用方拿到的就是净值）
 *
 * 例：talentBonus('cultPct') 会同时算上「吐纳精微 +3%/级」
 * 与「大道功成 +12%/级」；而 talentBonus('tribulationResist')
 * 会得到负数（大道功成的代价：天劫抗性下降，等价于天劫更难）。
 *
 * @param {string} kind 见 data/talents.js 的 EFFECT_KIND_META
 * @returns {number}
 */
export function talentBonus(kind) {
  if (!kind) return 0;
  const talents = reinc().talents;
  let sum = 0;
  for (const def of TALENTS) {
    const lv = talents[def.id] || 0;
    if (lv <= 0) continue;
    const e = def.effect;
    if (!e) continue;
    if (e.kind === kind) sum += (e.perLevel || 0) * lv;
    if (e.malus && e.malus.kind === kind) sum -= (e.malus.perLevel || 0) * lv;
  }
  return sum;
}

/**
 * 下一世可用的天命保底重掷次数（由「夺天造化」提供）。
 * systems/reincarnation.js 在掷天命时调用；一次重掷消耗一次（消耗逻辑归它）。
 */
export function fateRerollCharges() {
  return Math.max(0, Math.floor(talentBonus('fateReroll')));
}

// ==================== 真结局条件 ====================

/** 某系主线（tier 3 大招）是否已点满 */
export function branchMainMaxed(branch) {
  const m = mainTalentOf(branch);
  if (!m) return false;
  return talentLevel(m.id) >= m.maxLevel;
}

/**
 * 真结局条件之一：三条支线各点满一条主线。
 * 每系有且仅有一条 main 天赋，故即三系主线均满级。
 * 由 systems/reincarnation.js 在判定真结局时调用。
 */
export function isEndingPathUnlocked() {
  return BRANCH_ORDER.every((b) => branchMainMaxed(b));
}

// ==================== UI 总览 ====================

/**
 * 天赋树总览，供 ui/panels/talentPanel.js 使用。
 * 不含任何 DOM，只吐数据。
 */
export function talentSummary() {
  const r = reinc();
  const branches = BRANCH_ORDER.map((bid) => {
    const meta = BRANCHES[bid];
    const list = talentsByBranch(bid);
    const cap = list.reduce((a, t) => a + t.maxLevel, 0);
    const invested = branchPoints(bid);
    const spent = list.reduce((a, t) => a + spentOn(t.id), 0);
    return {
      id: bid,
      name: meta?.name || bid,
      desc: meta?.desc || '',
      detail: meta?.detail || '',
      color: meta?.color || 'var(--text-muted)',
      invested,          // 已投入等级数（层级解锁用）
      cap,               // 该系满级总等级数
      spent,             // 已投入道基点
      mainMaxed: branchMainMaxed(bid),
    };
  });

  return {
    daoBase: r.daoBase,
    totalSpent: totalSpent(),
    totalPoints: totalPoints(),
    branches,
    fateReroll: fateRerollCharges(),
    endingReady: isEndingPathUnlocked(),
  };
}

// ==================== 内部 ====================

function log(text, cls) {
  emit(EV.LOG, { text, cls, channel: 'system' });
}
