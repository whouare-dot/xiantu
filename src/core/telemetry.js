/**
 * 数值诊断采集（telemetry）
 * ============================================================
 * 用途：为"修炼偏慢"这类体感反馈提供**可核算的实测数据**。
 * 它回答数值模型回答不了的问题：玩家实际把时间花在哪、加成什么时候才起来、
 * 慢是"修炼本身慢"还是"旁路贡献太低"。
 *
 * 时长口径定义见 docs/设计文档.md §0。本模块采集的是 P1（纯在线游戏秒）
 * 与 P3（玩家交互时长）的实机版本。
 *
 * 设计约束（与项目既有规矩一致）
 * ------------------------------
 * - **纯逻辑，不碰 DOM**。唯一例外是 initClickTracking() 挂的全局点击监听，
 *   挂载由 main.js 显式调用，用于测 P3。
 * - **不写进主存档**。独立 localStorage key `xiantu_telemetry`，既避免撑大
 *   `xiantu_v2_slot*`，也避免动 createInitialState 的迁移契约。
 * - **只记事件与小时聚合，不记 tick 快照**。一局 100 小时按 1Hz 快照是 36 万条，
 *   没法读；事件日志约 1000 条。
 * - **修为来源用 push，境界与时长用 pull**。只有调用方知道这笔修为从哪来，
 *   所以来源必须上报（gainCult 带 source）；境界变化与停留时长每秒轮询即可，
 *   轮询漏不掉，比在突破处埋点更稳。
 * - **永不抛错**。所有公开入口 try/catch 包住。诊断工具把游戏搞崩比没有更糟。
 *
 * 重要：本模块**不得** import 任何 systems/ 下的模块。
 * cultivation.js 要调用它，若它也反向 import cultivation.js 就成环了。
 * 需要倍率明细时由 main.js 通过 initTelemetry({ getBreakdown }) 注入。
 */

import { state, realm } from './state.js';
import { REALMS } from '../data/realms.js';

const STORE_KEY = 'xiantu_telemetry';
const MAX_EVENTS = 5000;          // 超出丢最早的；一局约 1000 条，够用
const HOUR_MS = 3600 * 1000;
const ACT_GAP_MS = 60 * 1000;     // 点击间隔 < 60s 视为同一段交互
                                  // （用户实测：2 小时 250~300 次，平均 24~29s）
const PERSIST_THROTTLE_MS = 60 * 1000;

let buf = null;                   // 持久化的载荷
let getBreakdown = null;          // 注入：() => cultSpeedBreakdown()
let realmEntry = null;            // 进入当前境界时的快照
let playSeconds = 0;              // 累计**在线**游戏秒（不含离线）
let lastActAt = 0;
let lastPersist = 0;

function now() { return Date.now(); }

function blankHour() {
  return { cult: {}, cultLoss: {}, acts: 0, actMs: 0 };
}

// ==================== 持久化 ====================

function persist(force = false) {
  const t = now();
  if (!force && t - lastPersist < PERSIST_THROTTLE_MS) return;
  lastPersist = t;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(buf));
  } catch { /* 配额满/隐私模式：诊断数据丢就丢了，绝不能因此中断游戏 */ }
}

function pushEvent(ev) {
  if (!buf) return;
  buf.events.push(ev);
  if (buf.events.length > MAX_EVENTS) {
    buf.events.splice(0, buf.events.length - MAX_EVENTS);
  }
  persist(true);
}

// ==================== 生命周期 ====================

/**
 * 初始化。由 main.js 在 boot() 里调用一次。
 * @param {{ getBreakdown?: () => object }} opts 注入倍率明细提供者（避免循环依赖）
 */
export function initTelemetry(opts = {}) {
  try {
    getBreakdown = typeof opts.getBreakdown === 'function' ? opts.getBreakdown : null;

    let loaded = null;
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) loaded = JSON.parse(raw);
    } catch { loaded = null; }

    // 认档：换档 / 重开此世之后，旧的采集数据与新的存档已经不是同一条时间线，
    // 混在一起自检会永远对不上。用 meta.createdAt 作存档身份，对不上就丢弃重来。
    // ⚠ 不能只比 totalCultGained——新档开局它是 0，而旧档的基线也可能是 0，
    //   那种情形下两者相等却完全不是同一局（自测撞过）。
    const saveCreatedAt = state.meta?.createdAt ?? null;
    if (loaded && loaded.meta?.saveCreatedAt !== saveCreatedAt) {
      loaded = null;
    }

    if (loaded && Array.isArray(loaded.events)) {
      buf = loaded;
      buf.hour = buf.hour || blankHour();
      buf.hourStart = buf.hourStart || now();

      // 跨会话缺口：游戏的自动存档是 30s 一次，采集落盘是 60s 一次，两个节拍不同。
      // 刷新页面时会丢掉"采集最后一次落盘"到"存档最后一次写入"之间的那一小段
      // （实机实测一次刷新丢 47 秒的修炼量，与两边节拍差完全吻合）。
      // 这**不是埋点漏了**，是跨会话的固有损耗。处理方式：
      //   ① 折进基线，让自检仍然严格——否则每次刷新都会红；
      //   ② 但把缺口记进 meta，不悄悄吃掉，摘要里会列出来。
      const recorded = sumRecordedCult(buf);
      const drift = (state.stats?.totalCultGained || 0) - (buf.meta.cultBaseline || 0) - recorded;
      if (Math.abs(drift) > 1) {
        buf.meta.crossSessionDrift = (buf.meta.crossSessionDrift || 0) + drift;
        buf.meta.lastDrift = drift;
      }
      buf.meta.cultBaseline = (state.stats?.totalCultGained || 0) - recorded;
    } else {
      buf = {
        meta: {
          version: 1,
          startedAt: now(),
          saveCreatedAt,
          cultBaseline: state.stats?.totalCultGained || 0,
          spiritRoot: state.player?.spiritRoot?.name || null,
          realmIndexAtStart: state.player?.realmIndex ?? 0,
        },
        events: [],
        hour: blankHour(),
        hourStart: now(),
      };
    }

    realmEntry = null;
    snapshotRealmEntry();
    pushEvent({ ev: 'sess', kind: 'online', t: now(), play: playSeconds });
  } catch (e) { console.warn('[telemetry] init 失败，已禁用采集', e); }
}

function snapshotRealmEntry() {
  try {
    const b = getBreakdown ? getBreakdown() : null;
    realmEntry = {
      at: now(),
      atPlay: playSeconds,
      realmIndex: state.player?.realmIndex ?? 0,
      needCult: realm()?.needCult ?? null,
      speed: b?.value ?? null,
      mult: b ? {
        root: round(b.rootMult), tech: round(b.techMult), cave: round(b.caveMult),
        raw: round(b.rawSustained), sustained: round(b.sustained), capped: !!b.capped,
      } : null,
    };
  } catch { realmEntry = null; }
}

function round(v) { return typeof v === 'number' ? Math.round(v * 1000) / 1000 : null; }

/** 主循环每秒调用。推进在线秒数、轮询境界变化、按小时落聚合。 */
export function tickTelemetry(dt) {
  if (!buf) return;
  try {
    if (Number.isFinite(dt) && dt > 0) playSeconds += dt;

    // 境界变化：轮询。比在 breakthrough 里埋点稳——那里有多条路径会改境界。
    const ri = state.player?.realmIndex ?? 0;
    if (realmEntry && ri !== realmEntry.realmIndex) {
      const b = getBreakdown ? getBreakdown() : null;
      pushEvent({
        ev: 'realm',
        t: now(),
        play: playSeconds,
        from: realmEntry.realmIndex,
        to: ri,
        stayPlay: Math.round(playSeconds - realmEntry.atPlay),
        stayReal: Math.round((now() - realmEntry.at) / 1000),
        needCult: realmEntry.needCult,
        speedIn: realmEntry.speed,
        multIn: realmEntry.mult,
        multOut: b ? {
          root: round(b.rootMult), tech: round(b.techMult), cave: round(b.caveMult),
          raw: round(b.rawSustained), sustained: round(b.sustained), capped: !!b.capped,
        } : null,
      });
      snapshotRealmEntry();
    }

    if (now() - buf.hourStart >= HOUR_MS) flushHour();
    persist();   // 内部有节流，实际最多 60s 写一次
  } catch (e) { /* 静默：诊断失败不该影响游戏 */ }
}

/** 把当前小时的聚合落成一条事件，并开新的一小时。仅本模块内部使用。 */
function flushHour() {
  if (!buf) return;
  try {
    const h = buf.hour;
    const hasData = Object.keys(h.cult).length || Object.keys(h.cultLoss).length || h.acts;
    if (hasData) {
      buf.events.push({
        ev: 'hour', t: now(), play: playSeconds,
        cult: h.cult, cultLoss: h.cultLoss,
        acts: h.acts, actSec: Math.round(h.actMs / 1000),
      });
      if (buf.events.length > MAX_EVENTS) buf.events.splice(0, buf.events.length - MAX_EVENTS);
    }
    buf.hour = blankHour();
    buf.hourStart = now();
    persist(true);
  } catch { /* 同上 */ }
}

// ==================== 修为来源（push） ====================

/**
 * 记一笔修为**增量**。由 cultivation.gainCult 调用——它是全部修为增量的唯一出口，
 * 所以只要 gainCult 打了标签，就不可能漏掉任何一个来源。
 * @param {string} source 来源标签（修炼 / 战斗 / 塔 / 奇遇 / 丹药 / 离线 / 未知）
 */
export function noteCultGain(source, amount) {
  if (!buf || !(amount > 0)) return;
  try {
    const k = source || '未知';
    buf.hour.cult[k] = (buf.hour.cult[k] || 0) + amount;
  } catch { /* 同上 */ }
}

/**
 * 记一笔修为**扣减**。修为的扣减是直接改 state.player.cult 的（突破/天劫/洗白/
 * 负面奇遇），不走 gainCult，所以这几处需要显式调用。
 * 自检会核对"Σ增量"是否等于 stats.totalCultGained 的增量，能挡住漏埋的增量；
 * 扣减没有对应计数器，靠 review 保证。
 */
export function noteCultLoss(source, amount) {
  if (!buf || !(amount > 0)) return;
  try {
    const k = source || '未知';
    buf.hour.cultLoss[k] = (buf.hour.cultLoss[k] || 0) + amount;
  } catch { /* 同上 */ }
}

// ==================== 突破 / 天劫 / 会话 ====================

/**
 * 记一次突破判定。埋点在 breakthrough.js 的 resolveBreakthroughRoll ——
 * 那是普通境界唯一的判定点，`chance` 与结果在那里同时可得。
 * @param {{success:boolean, chance:number, failStreak:number}} info
 *   failStreak：成功时是"本次之前的连败数"，失败时是"含本次的连败数"。
 *   用来核对保底机制（连败 ×8%、上限 40%）到底有没有起作用。
 */
export function noteBreak(info = {}) {
  if (!buf) return;
  try {
    pushEvent({
      ev: 'break', t: now(), play: playSeconds,
      to: state.player?.realmIndex ?? 0,
      success: !!info.success,
      chance: typeof info.chance === 'number' ? Math.round(info.chance * 1000) / 1000 : null,
      failStreak: info.failStreak ?? null,
      lost: info.lost ?? 0,
    });
  } catch { /* 同上 */ }
}

/** 记一次天劫结算。埋在 breakthrough.js 的 finishTribulation。 */
export function noteTrib(info = {}) {
  if (!buf) return;
  try {
    pushEvent({
      ev: 'trib', t: now(), play: playSeconds,
      to: state.player?.realmIndex ?? 0,
      passed: !!info.passed,
      roundsTotal: info.roundsTotal ?? null,
      roundsReached: info.roundsReached ?? null,
    });
  } catch { /* 同上 */ }
}

/**
 * 记一次会话切换。
 * @param {string} kind 'online' | 'offline'
 * @param {number} seconds 结算用时长（离线时已按 offlineCapHours 封顶）
 * @param {number} gained  本次获得的修为
 * @param {number} [rawSeconds] 真实离开时长。P2（日历时长）用它，
 *   因为它才是"玩家离开了多久"的事实，而 seconds 可能被 8 小时封顶截断。
 */
export function noteSession(kind, seconds, gained, rawSeconds) {
  if (!buf) return;
  try {
    pushEvent({
      ev: 'sess', kind, t: now(), play: playSeconds,
      seconds: Math.round(seconds || 0),
      rawSeconds: rawSeconds == null ? null : Math.round(rawSeconds),
      gained: Math.round(gained || 0),
    });
  } catch { /* 同上 */ }
}

// ==================== 交互时长（P3） ====================

/**
 * 全局点击监听。由 main.js 在 DOM 就绪后调用一次。
 * 用捕获阶段的 document 级监听，而不是逐个面板埋点——面板会增删，
 * 全局监听不会漏，也不用改任何面板代码。
 * 交互时长 = 相邻点击间隔的累计（间隔 < 60s 才计入），近似玩家"在场操作"的时间。
 */
export function initClickTracking(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc || !buf) return;
  try {
    doc.addEventListener('click', () => {
      if (!buf) return;
      const t = now();
      if (lastActAt && t - lastActAt < ACT_GAP_MS) {
        buf.hour.actMs += t - lastActAt;
      }
      lastActAt = t;
      buf.hour.acts++;
    }, true);
  } catch (e) { console.warn('[telemetry] 点击监听挂载失败', e); }
}

// ==================== 导出与自检 ====================

/** 已记录在案的修为增量之和（含尚未落盘的本小时聚合） */
function sumRecordedCult(b) {
  let s = 0;
  for (const e of b.events || []) {
    if (e.ev !== 'hour') continue;
    for (const v of Object.values(e.cult || {})) s += v;
  }
  for (const v of Object.values(b.hour?.cult || {})) s += v;
  return s;
}

/**
 * 生成一份完整报告：先把未落盘的本小时聚合 flush 掉，再取事件、摘要与自检。
 *
 * ⚠ 导出与摘要**必须走同一个函数**。曾经 telemetrySummary 直接读 buf.events，
 * 而 selfCheck 走的是另一条路径（会补上本小时），两者读的不是同一份数据——
 * 结果摘要显示「无数据」而自检却「通过」，自相矛盾（实机撞到过）。
 */
function buildReport() {
  flushHour();
  const events = buf.events;
  const s = summarize(events);
  s.totalPlay = Math.round(playSeconds);
  // 当前所在境界还没结束，不会产生 realm 事件，单独补一行"进行中"，
  // 否则玩家看不到自己这一境已经待了多久。
  if (realmEntry) {
    s.current = {
      realmIndex: state.player?.realmIndex ?? realmEntry.realmIndex,
      elapsedPlay: Math.round(playSeconds - realmEntry.atPlay),
      mult: realmEntry.mult,
    };
  }
  return { events, summary: s, check: selfCheck() };
}

/**
 * 自检：Σ按来源拆分的增量 应当**精确等于** stats.totalCultGained 的增量。
 * 因为 gainCult 是唯一增量出口，这里不等就说明有并行路径或重复计数。
 */
export function selfCheck() {
  try {
    const sum = sumRecordedCult(buf);
    const actual = (state.stats?.totalCultGained || 0) - (buf?.meta?.cultBaseline || 0);
    return {
      sumBySource: Math.round(sum),
      actual: Math.round(actual),
      ok: Math.abs(sum - actual) < 1,
      crossSessionDrift: Math.round(buf?.meta?.crossSessionDrift || 0),
    };
  } catch {
    return { sumBySource: null, actual: null, ok: false, crossSessionDrift: null };
  }
}

/** 导出为 JSON 字符串（下载动作由 UI 层负责） */
export function exportTelemetry() {
  if (!buf) return '{}';
  try {
    const r = buildReport();
    return JSON.stringify({
      meta: { ...buf.meta, exportedAt: now(), playSeconds: Math.round(playSeconds) },
      selfCheck: r.check,
      summary: r.summary,
      events: r.events,
    }, null, 2);
  } catch (e) {
    return JSON.stringify({ error: String(e) });
  }
}

/** 生成给人看的摘要——直接贴回对话就能用 */
export function telemetrySummary() {
  if (!buf) return '（未启用采集）';
  try {
    const r = buildReport();
    return renderSummary(r.summary, r.check);
  } catch (e) { return `（摘要生成失败：${e}）`; }
}

function realmName(i) {
  return REALMS[i]?.name || `#${i}`;
}

function summarize(events) {
  const cult = {};
  const cultLoss = {};
  const realms = [];
  let acts = 0, actSec = 0, offlineSec = 0, offlineRawSec = 0, offlineGain = 0;

  for (const e of events) {
    if (e.ev === 'hour') {
      for (const [k, v] of Object.entries(e.cult || {})) cult[k] = (cult[k] || 0) + v;
      for (const [k, v] of Object.entries(e.cultLoss || {})) cultLoss[k] = (cultLoss[k] || 0) + v;
      acts += e.acts || 0;
      actSec += e.actSec || 0;
    } else if (e.ev === 'realm') {
      realms.push({ from: e.from, to: e.to, stayPlay: e.stayPlay, stayReal: e.stayReal, multOut: e.multOut });
    } else if (e.ev === 'sess' && e.kind === 'offline') {
      offlineSec += e.seconds || 0;
      offlineRawSec += e.rawSeconds ?? e.seconds ?? 0;
      offlineGain += e.gained || 0;
    }
  }
  const cultTotal = Object.values(cult).reduce((a, b) => a + b, 0);
  let playTotal = 0;
  for (const r of realms) playTotal += r.stayPlay || 0;
  return {
    cult, cultLoss, cultTotal, realms, playTotal, acts, actSec,
    offlineSec, offlineRawSec, offlineGain,
  };
}

function fmtNum(n) {
  if (n == null) return '-';
  if (n >= 1e8) return (n / 1e8).toFixed(2) + '亿';
  if (n >= 1e4) return (n / 1e4).toFixed(2) + '万';
  return String(Math.round(n));
}

function fmtDur(sec) {
  if (sec == null) return '-';
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h} 时 ${m} 分` : `${m} 分`;
}

function renderSummary(s, check) {
  const L = [];
  L.push('===== 仙途 · 数值诊断摘要 =====');
  L.push('');
  // playSeconds 不跨会话持久化（刷新归零），所以这里只在本次会话内有意义
  L.push(`本次会话在线时长：${fmtDur(s.totalPlay)}（不含关屏）`);
  L.push(`已完成境界：${s.realms.length} 个`);
  L.push(`交互时长：${fmtDur(s.actSec)}，点击 ${s.acts} 次`);
  if (s.offlineRawSec > 0) {
    const capH = state.meta?.offlineCapHours ?? 8;
    const capped = s.offlineRawSec - s.offlineSec;
    L.push(`关屏总时长：${fmtDur(s.offlineRawSec)}`
      + (capped > 60 ? `（其中 ${fmtDur(capped)} 超出 ${capH} 小时封顶，未结算）` : '')
      + `，离线修为 ${fmtNum(s.offlineGain)}`);
  }
  L.push('');
  L.push('--- 修为来源构成 ---');
  const keys = Object.keys(s.cult).sort((a, b) => s.cult[b] - s.cult[a]);
  if (!keys.length) L.push('  （无数据）');
  for (const k of keys) {
    const pct = s.cultTotal > 0 ? ((s.cult[k] / s.cultTotal) * 100).toFixed(1) : '0.0';
    L.push(`  ${k.padEnd(6, '　')} ${fmtNum(s.cult[k]).padStart(12)}  ${pct.padStart(5)}%`);
  }
  L.push(`  ${'合计'.padEnd(6, '　')} ${fmtNum(s.cultTotal).padStart(12)}`);
  const lossKeys = Object.keys(s.cultLoss);
  if (lossKeys.length) {
    L.push('');
    L.push('--- 修为扣减 ---');
    for (const k of lossKeys) L.push(`  ${k.padEnd(6, '　')} ${fmtNum(s.cultLoss[k]).padStart(12)}`);
  }
  L.push('');
  L.push('--- 各境界停留时长与离开时倍率 ---');
  L.push('  境界            在线时长    有效倍率  原始倍率  是否压缩');
  for (const r of s.realms) {
    const m = r.multOut || {};
    L.push(`  ${realmName(r.to).padEnd(8, '　')} ${fmtDur(r.stayPlay).padStart(10)}  `
      + `${String(m.sustained ?? '-').padStart(8)}  ${String(m.raw ?? '-').padStart(8)}  ${m.capped ? '是' : '否'}`);
  }
  if (s.current) {
    const m = s.current.mult || {};
    L.push(`  ${realmName(s.current.realmIndex).padEnd(8, '　')} ${fmtDur(s.current.elapsedPlay).padStart(10)}  `
      + `${String(m.sustained ?? '-').padStart(8)}  ${String(m.raw ?? '-').padStart(8)}  `
      + `${m.capped ? '是' : '否'}   ← 当前所在`);
  }
  L.push('');
  L.push('--- 自检 ---');
  L.push(check.ok
    ? `  通过：按来源合计 ${fmtNum(check.sumBySource)} = 修为总增量 ${fmtNum(check.actual)}`
    : `  ⚠ 不一致：按来源合计 ${fmtNum(check.sumBySource)} vs 修为总增量 ${fmtNum(check.actual)}`
      + '（说明有增量走了 gainCult 之外的路径，或有重复计数）');
  if (check.crossSessionDrift) {
    L.push(`  跨会话缺口：${fmtNum(check.crossSessionDrift)}（刷新页面时因存档 30s /`
      + ' 采集 60s 节拍不同而丢掉的尾段，已折进基线，不是埋点漏采）');
  }
  return L.join('\n');
}

/** 清空采集数据并从此刻重新开始（换一轮测试时用，不需要刷新页面） */
export function resetTelemetry() {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch { /* 同上 */ }
  buf = null;
  realmEntry = null;
  playSeconds = 0;
  lastActAt = 0;
  lastPersist = 0;
  initTelemetry({ getBreakdown });
}
