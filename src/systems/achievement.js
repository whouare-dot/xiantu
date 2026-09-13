/**
 * 成就系统（纯逻辑，禁止 DOM）。
 *
 * 职责：
 *   - 扫描全部成就定义，判定解锁
 *   - 发放奖励（永久属性 / 称号 / 灵石）并播报
 *   - 维护隐藏成就所需的"计量器"（连败、残血翻盘、赤贫时长……）
 *
 * 设计要点：
 *   1. checkAll() 是纯读：只有真的解锁了新成就才写 state，避免每 5 秒全量写盘。
 *   2. 主循环 tickAchievements(dt) 做节流（默认 5 秒扫一次），不每秒全表扫描。
 *   3. 需要"过程性"条件（如连败后成功、低血翻盘）的成就，靠事件总线在
 *      achievement.js 内部记录计量器，不改动 combat.js / breakthrough.js。
 *   4. 称号加成不走这里，而是由 data/achievements.js 的 titleBonusFor()
 *      提供给 systems/cultivation.js 的 aggregate()，避免 systems 间循环依赖。
 */

import { state, stonesToLow, addStones } from '../core/state.js';
import {
  ACHIEVEMENTS, achievementById, achStateDefaults,
} from '../data/achievements.js';
import { emit, on, EV } from '../core/bus.js';
import { fmt } from '../core/format.js';
import { calcMaxHp } from './cultivation.js';

/** 全表扫描间隔（秒）。挂机游戏里成就不是每秒都变，5 秒足够灵敏且省开销。 */
const SCAN_INTERVAL = 5;

/** 解锁时的事件名，UI 层订阅它做弹窗 / 飘字 */
export const EV_ACH_UNLOCK = 'achievement:unlock';

let _acc = 0;

// ==================== 状态兜底 ====================

/**
 * 保证 state.achievements 结构完整。
 * 新档由 createInitialState() 给出；旧档由 save.js 的 mergeDefaults 补齐；
 * 这里再兜一层，防止手改存档或缺字段导致崩溃。
 */
function ensureAchState() {
  if (!state.achievements || typeof state.achievements !== 'object') {
    state.achievements = achStateDefaults();
    return state.achievements;
  }
  const a = state.achievements;
  if (!Array.isArray(a.unlocked)) a.unlocked = [];
  if (!Array.isArray(a.rewarded)) a.rewarded = [];
  if (a.title === undefined) a.title = null;
  const dm = achStateDefaults().meters;
  if (!a.meters || typeof a.meters !== 'object') {
    a.meters = dm;
  } else {
    for (const [k, v] of Object.entries(dm)) {
      if (a.meters[k] === undefined) a.meters[k] = v;
    }
  }
  return a;
}

// ==================== 查询接口（纯读） ====================

/** 已解锁 id 数组（副本，外部改动不影响存档） */
export function unlocked() {
  return Array.isArray(state.achievements?.unlocked) ? state.achievements.unlocked.slice() : [];
}

export function isUnlocked(id) {
  return unlocked().includes(id);
}

/** { unlocked: n, total: m } */
export function progress() {
  return { unlocked: unlocked().length, total: ACHIEVEMENTS.length };
}

/**
 * 可见列表：未解锁的隐藏成就不在内（其真实名号与条件永不泄露）。
 * UI 的"隐秘"分类会另行把它们渲染成 ??? 占位行。
 */
export function visibleAchievements() {
  const got = new Set(unlocked());
  return ACHIEVEMENTS.filter((a) => !a.hidden || got.has(a.id));
}

/** 当前佩戴的称号（返回成就定义；没戴或数据异常时返回 null） */
export function equippedTitle() {
  const id = state.achievements?.title;
  if (!id) return null;
  const ach = achievementById(id);
  if (!ach || ach.reward?.kind !== 'title') return null;
  if (!isUnlocked(id)) return null;
  return ach;
}

/**
 * 佩戴 / 卸下称号。
 * @param {string|null} id 传 null 表示卸下
 * @returns {{ok:boolean, title?:string|null, reason?:string}}
 */
export function equipTitle(id) {
  const a = ensureAchState();
  if (id == null) {
    a.title = null;
    emit(EV.LOG, { text: '已摘下称号。', cls: 'event-special', channel: 'system' });
    return { ok: true, title: null };
  }
  const ach = achievementById(id);
  if (!ach || ach.reward?.kind !== 'title') return { ok: false, reason: '此成就并无称号' };
  if (!isUnlocked(id)) return { ok: false, reason: '尚未达成，无法佩戴' };
  if (a.title === id) return { ok: true, title: ach.reward.title, unchanged: true };
  a.title = id;
  emit(EV.LOG, {
    text: `佩戴称号【${ach.reward.title}】。`, cls: 'event-special', channel: 'system',
  });
  return { ok: true, title: ach.reward.title };
}

// ==================== 奖励发放 ====================

/**
 * 发放奖励。用 rewarded 名单做幂等保护：
 * 同一成就无论被调用几次，奖励只发一次。
 */
export function grantReward(ach) {
  if (!ach || !ach.id) return;
  const a = ensureAchState();
  if (a.rewarded.includes(ach.id)) return;
  const r = ach.reward;
  // 无奖励也记账，避免每次扫描都重复判断
  a.rewarded.push(ach.id);
  if (!r) return;

  if (r.kind === 'attr') {
    state.player.attributes = state.player.attributes || {};
    const key = r.attr || 'comprehension';
    state.player.attributes[key] = (state.player.attributes[key] || 0) + (r.value || 0);
  } else if (r.kind === 'stones') {
    addStones(Math.max(0, Math.floor(r.amount || 0)));
  }
  // kind === 'title'：解锁即拥有，佩戴由 equipTitle 负责，无需即时数值结算
}

// ==================== 核心扫描 ====================

/**
 * 扫描全部成就，返回本次**新解锁**的成就定义数组。
 * 没有新解锁时对 state 零写入。
 */
export function checkAll() {
  const a = ensureAchState();
  const got = new Set(a.unlocked);
  const newly = [];

  // 先只读地收集，全部判完再写——避免边写边判造成顺序依赖
  for (const def of ACHIEVEMENTS) {
    if (got.has(def.id)) continue;
    let ok = false;
    try {
      ok = !!def.check(state);
    } catch (err) {
      // 单条成就判定出错不应影响其它成就
      console.error(`[achievement] 判定 "${def.id}" 失败:`, err);
    }
    if (ok) newly.push(def);
  }

  if (newly.length === 0) return [];

  // 到这里才写状态：解锁 + 发奖 + 播报
  for (const def of newly) {
    a.unlocked.push(def.id);
    grantReward(def);
    emit(EV.LOG, {
      text: `【成就】${def.name} —— ${def.desc}`,
      cls: def.hidden ? 'event-special' : 'event-good',
      channel: 'system',
    });
    emit(EV_ACH_UNLOCK, def);
  }
  return newly;
}

// ==================== 计量器（过程性条件） ====================

/**
 * 主循环调用。dt 为秒。
 * 计量器逐帧推进；全表扫描按 SCAN_INTERVAL 节流。
 * @returns {Array} 本次新解锁的成就（多数帧返回空数组）
 */
export function tickAchievements(dt) {
  const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
  const m = ensureAchState().meters;

  // 连续赤贫时长 / 归零次数
  const broke = stonesToLow() <= 0;
  if (broke) {
    m.brokeSec += step;
    if (!m.wasBroke) {
      m.wasBroke = true;
      m.brokeTimes += 1;
    }
  } else {
    m.brokeSec = 0;
    m.wasBroke = false;
  }

  _acc += step;
  if (_acc < SCAN_INTERVAL) return [];
  _acc = 0;
  return checkAll();
}

// ==================== 事件计量 ====================

// 战斗结束：连胜记录、低血翻盘、一回合取胜、鏖战回合数
on(EV.COMBAT_END, ({ win, rounds } = {}) => {
  const m = ensureAchState().meters;
  const r = Number.isFinite(rounds) ? rounds : 0;
  if (r > m.longBattle) m.longBattle = r;

  if (win) {
    const cur = state.combat?.winStreak || 0;
    if (cur > m.bestStreak) m.bestStreak = cur;
    if (r > 0 && r <= 1) m.oneRoundWin = true;

    // 战报结算后 player.hp 已写回，低血取胜即"残血翻盘"
    const max = calcMaxHp();
    if (max > 0 && state.player.hp > 0 && state.player.hp / max < 0.05) {
      m.lowHpWin = true;
    }
  }
});

// 突破失败：累计连败，记录历史峰值
on(EV.REALM_FAIL, ({ fails } = {}) => {
  const m = ensureAchState().meters;
  const f = Number.isFinite(fails) ? fails : (state.player.breakFails || 0);
  m.pendingFailStreak = f;
  m.totalFails += 1;
  if (f > m.failStreakMax) m.failStreakMax = f;
});

// 突破成功：若此前连败达 5 次，记下"枯木逢春"，随后清零当前连败
on(EV.REALM_BREAK, () => {
  const m = ensureAchState().meters;
  if (m.pendingFailStreak >= 5) m.brokeAfterManyFails = true;
  m.pendingFailStreak = 0;
});
