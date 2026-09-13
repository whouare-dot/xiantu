/**
 * 世界天象系统（V4.0「轮回」§5.6，纯逻辑，禁止 DOM）。
 *
 * 单机形态：没有真正的全服。天象按**现实时间**在全体玩家间同步轮换——
 * 同一时刻所有玩家看到同一天象，各自独立结算，互不影响。
 *
 * ============ 为什么必须"确定性"而不是随机 ============
 *
 * 如果每次刷新页面都用随机数挑天象，玩家会发现：
 *   "我刚才明明看到灵气潮汐，刷新一下变成大道压制了？"
 * 系统一旦显得不可信，玩家就不会围绕它做任何规划。所以本模块**不调用随机数**，
 * 轮换完全由「现实时间 → 日程位置」的纯函数推出：
 *   同一个时间戳调用两次，结果必然相同；
 *   跨过轮换点，结果必然改变。
 * 权重的差异不靠运行时随机，而是在**构造轮换表**时体现为出现频率
 * （权重越高，在轮换表里出现次数越多），轮换表本身是固定常量。
 */

import { state } from '../core/state.js';
import { emit, EV } from '../core/bus.js';
import { WORLD_EVENTS, EVENT_KINDS } from '../data/worldEvents.js';

export { EVENT_KINDS };

// ==================== 确定性轮换日程 ====================

/**
 * 日程起点：一个固定的本地 0 点。
 * 用固定常量而非"今天的 0 点"，天象便不会在午夜重置时突然跳变，
 * 而是像真实天候一样连续地滚下去。
 * 同一台机器、同一时区下，任意时刻的日程位置都是唯一确定的。
 */
const ANCHOR = new Date(2024, 0, 1, 0, 0, 0, 0).getTime();

const MIN_MS = 60 * 1000;

/** 简单的字符串散列（FNV-1a）。用于把"条目 + 第几次出现"打散成固定键。 */
function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * 构造轮换表。
 * 权重 10 视为出现 1 次，权重 30 出现 3 次……出现次数由权重决定，
 * 顺序则由 id 的固定散列决定（**不含任何运行时随机**），
 * 因此每次加载得到的是同一张表，高权重天象出现得更频繁。
 */
function buildSchedule() {
  const pool = [];
  for (const e of WORLD_EVENTS) {
    const times = Math.max(1, Math.round((e.weight ?? 10) / 10));
    for (let i = 0; i < times; i++) {
      pool.push({ e, key: hashStr(e.id + '#occ' + i) });
    }
  }
  pool.sort((a, b) => (a.key - b.key) || (a.e.id < b.e.id ? -1 : 1));
  return pool.map((p) => p.e);
}

const SCHEDULE = buildSchedule();
const CYCLE_MS = SCHEDULE.reduce((s, e) => s + e.durationMin * MIN_MS, 0);

/** 供调试 / 测试查看的轮换表（只读） */
export function rotationSchedule() {
  return SCHEDULE.slice();
}

/**
 * 给定时间戳，算出它落在轮换表的哪一格。
 * 纯函数：不读 state、不写 state、不用随机。
 * @returns {{ index:number, event:object, start:number, end:number }}
 */
export function phaseAt(now = Date.now()) {
  if (CYCLE_MS <= 0) return { index: 0, event: null, start: now, end: now };
  let phase = ((now - ANCHOR) % CYCLE_MS + CYCLE_MS) % CYCLE_MS;
  let acc = 0;
  for (let i = 0; i < SCHEDULE.length; i++) {
    const dur = SCHEDULE[i].durationMin * MIN_MS;
    if (phase < acc + dur) {
      const start = now - (phase - acc);
      return { index: i, event: SCHEDULE[i], start, end: start + dur };
    }
    acc += dur;
  }
  // 浮点兜底：落在最后一格
  const e = SCHEDULE[SCHEDULE.length - 1];
  const start = now - (CYCLE_MS - (CYCLE_MS - e.durationMin * MIN_MS));
  return { index: SCHEDULE.length - 1, event: e, start, end: start + e.durationMin * MIN_MS };
}

// ==================== 查询接口 ====================

/** 当前天象。now 可传入用于测试；默认取现实时间。 */
export function currentEvent(now = Date.now()) {
  return phaseAt(now).event;
}

/** 下次轮换的时间戳（毫秒）。 */
export function nextEventAt(now = Date.now()) {
  return phaseAt(now).end;
}

/** 当前天象剩余秒数（永不为负）。 */
export function timeLeft(now = Date.now()) {
  return Math.max(0, (nextEventAt(now) - now) / 1000);
}

/** 当前天象已过去的比例 0..1（给进度条用）。 */
export function eventProgress(now = Date.now()) {
  const p = phaseAt(now);
  const dur = p.end - p.start;
  if (dur <= 0) return 1;
  return Math.max(0, Math.min(1, (now - p.start) / dur));
}

/** 某个天象是否正当时。 */
export function isActive(id, now = Date.now()) {
  return currentEvent(now)?.id === id;
}

/**
 * 按 kind 汇总当前天象的加成，供 cultivation / combat / encounter 调用。
 * effect（主效果）与 bonus（补偿）都计入——调用方只关心"这个通道现在加多少"。
 * 返回数值，无该通道时为 0。
 */
export function eventBonus(kind, now = Date.now()) {
  const e = currentEvent(now);
  if (!e) return 0;
  let sum = 0;
  if (e.effect && e.effect.kind === kind) sum += e.effect.value || 0;
  if (e.bonus && e.bonus.kind === kind) sum += e.bonus.value || 0;
  return sum;
}

/** 当前天象的完整加成明细（供 UI 正负分色展示）。 */
export function currentEventDetail(now = Date.now()) {
  const e = currentEvent(now);
  if (!e) return { event: null, lines: [] };
  const lines = [];
  if (e.effect) lines.push({ ...e.effect, main: true });
  if (e.bonus) lines.push({ ...e.bonus, main: false });
  return { event: e, lines };
}

/**
 * 最近的轮换记录（最新在前）。
 * 与 currentEvent 一样是**纯函数推导**，刷新页面后依然稳定，
 * 不需要额外持久化历史。返回 [{ id, name, kind, at, end, active }]。
 */
export function eventLog(count = 8, now = Date.now()) {
  const out = [];
  const cur = phaseAt(now);
  out.push(slotRecord(cur, true));
  let edge = cur.start;
  for (let i = 1; i < count; i++) {
    if (!Number.isFinite(edge)) break;
    const prev = phaseAt(edge - 1);
    out.push(slotRecord(prev, false));
    edge = prev.start;
  }
  return out;
}

function slotRecord(p, active) {
  return {
    id: p.event.id,
    name: p.event.name,
    kind: p.event.kind,
    at: p.start,
    end: p.end,
    active,
  };
}

// ==================== 轮换检测与播报 ====================

let _lastId = null;

/**
 * 主循环每秒调用：检测轮换，并在天象切换时播报。
 * 首次调用会播报当前天象一次，让读档进来的玩家知道"世界现在是什么样"。
 */
export function tickWorldEvent() {
  const cur = currentEvent();
  if (!cur) return false;

  markSeen(cur.id);

  if (cur.id === _lastId) return false;
  const first = _lastId === null;
  _lastId = cur.id;

  // 负面天象用 event-bad，正面用 event-special，让日志一眼能分辨
  const bad = (cur.effect && cur.effect.value < 0) || cur.kind === 'risk';
  emit(EV.LOG, {
    text: first
      ? `【天象】当前为「${cur.name}」——${cur.desc}`
      : `【天象】${bad ? '天有异变' : '天地换象'}——「${cur.name}」${cur.desc}`,
    cls: bad ? 'event-bad' : 'event-special',
    channel: 'system',
  });
  return true;
}

/** 重开档时清掉轮换检测的缓存，让下次 tick 重新播报 */
export function resetWorldEvent() {
  _lastId = null;
}

// ==================== 已亲历记录（供 UI 高亮） ====================

/**
 * 已亲历过的天象 id。
 * 存在通用的 state.flags 里（不新增契约字段），跨存档自然保留。
 */
export function seenIds() {
  const f = state.flags?.worldSeen;
  return Array.isArray(f) ? f.slice() : [];
}

export function isSeen(id) {
  return seenIds().includes(id);
}

function markSeen(id) {
  if (!state.flags) state.flags = {};
  const arr = Array.isArray(state.flags.worldSeen) ? state.flags.worldSeen : (state.flags.worldSeen = []);
  if (!arr.includes(id)) arr.push(id);
}
