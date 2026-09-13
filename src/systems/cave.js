/**
 * 洞府系统 —— 放置（挂机）玩法的核心。
 *
 * 设计要点：
 *   - 建筑升级"消耗灵石 + 占用现实时间"，计时用绝对时间戳 upgradeEndsAt，
 *     因此关掉游戏（离线）也会照常推进并完成
 *   - 灵田按等级自动产出灵材，产出池按当前境界 tier 取（洞府越高级，材料越高级）
 *   - caveOffline(seconds) 在启动时结算离线窗口：完成升级 + 补发灵田产出，
 *     并返回一份"离线报告"供 UI 弹窗
 *
 * 内部附加字段（懒初始化，兼容旧存档）：
 *   state.cave.yieldAcc.herbMs 灵田产出计时器（整数毫秒，避免浮点累积误差丢批）
 *   state.cave.upgradeEndsAt   洞府等级扩建的完成时间戳
 *
 * 纯逻辑，禁止任何 DOM 操作。
 */

import {
  state, MAX_CAVE_LEVEL, spendStones, addMaterial, addStones,
} from '../core/state.js';
import { emit, EV } from '../core/bus.js';
import { pick } from '../core/rng.js';
import { fmt, fmtDuration, fmtPct } from '../core/format.js';
import {
  BUILDINGS, MAX_BUILDING_LEVEL, buildingById, buildingUpgradeCost, buildingUpgradeSeconds,
} from '../data/caveBuildings.js';
import { MATERIALS, materialsByTier } from '../data/materials.js';
import { buildingLevel, caveEffect, caveCultMult } from './cultivation.js';
import { realmTier } from './inventory.js';

// ==================== 洞府扩建参数 ====================

const CAVE_UPGRADE = { baseCost: 1200, growth: 3.4, baseSeconds: 420, growth: 2.05 };

/** 洞府 level → level+1 的花费（下品灵石），满级返回 null */
export function caveUpgradeCost(level = state.cave.level) {
  const lv = Math.max(1, Math.floor(level || 1));
  if (lv >= MAX_CAVE_LEVEL) return null;
  return Math.floor(CAVE_UPGRADE.baseCost * Math.pow(CAVE_UPGRADE.growth, lv - 1));
}

/** 洞府 level → level+1 的耗时（秒），满级返回 null */
export function caveUpgradeSeconds(level = state.cave.level) {
  const lv = Math.max(1, Math.floor(level || 1));
  if (lv >= MAX_CAVE_LEVEL) return null;
  return Math.floor(CAVE_UPGRADE.baseSeconds * Math.pow(CAVE_UPGRADE.growth, lv - 1));
}

function log(text, cls = 'event-special', channel = 'system') {
  emit(EV.LOG, { text, cls, channel });
}

// ==================== 懒初始化 ====================

function ensureCave() {
  const c = state.cave;
  c.level = c.level ?? 1;
  c.buildings = c.buildings || {};
  c.yieldAcc = c.yieldAcc || {};
  if (c.yieldAcc.herbMs == null) c.yieldAcc.herbMs = 0;
  if (c.upgradeEndsAt === undefined) c.upgradeEndsAt = null;
  for (const b of Object.values(c.buildings)) {
    if (b) {
      b.level = b.level ?? 0;
      if (b.upgradeEndsAt === undefined) b.upgradeEndsAt = null;
    }
  }
}

// ==================== 灵田产出 ====================

/** 当前境界对应的灵材档位 */
export function herbTier() {
  return realmTier(state.player.realmIndex);
}

/** 灵田产出池：优先同档草药，没有则退回同档任意灵材 */
export function herbPool(tier = herbTier()) {
  let pool = materialsByTier(tier).filter((m) => m.kind === 'herb');
  if (pool.length === 0) pool = materialsByTier(tier);
  if (pool.length === 0) pool = MATERIALS;
  return pool;
}

/** 每秒灵田产出数量 = level × perLevel / interval */
export function herbPerSecond() {
  const bld = buildingById('bld_herb');
  const lv = buildingLevel('bld_herb');
  if (!bld || lv <= 0) return 0;
  const interval = bld.effect?.interval || 600;
  return (lv * (bld.effect?.perLevel || 1)) / interval;
}

function mergeCounts(target, src) {
  for (const [k, v] of Object.entries(src)) {
    if (v > 0) target[k] = (target[k] || 0) + v;
  }
  return target;
}

/**
 * 推进 seconds 秒的灵田产出（用累积器按 interval 结算），返回 {材料id: 数量}。
 * 不足一个产出周期的余量会留在 yieldAcc 里，避免高频 tick 丢产出。
 */
function produceHerb(seconds) {
  const bld = buildingById('bld_herb');
  const lv = buildingLevel('bld_herb');
  const out = {};
  if (!bld || lv <= 0 || seconds <= 0) return out;

  const intervalMs = (bld.effect?.interval || 600) * 1000;
  const acc = state.cave.yieldAcc;

  // 累积器用「整数毫秒」而不是浮点秒。
  // 离线窗口会被升级完成时间切成若干段（例如 7198.999s + 1.001s），
  // 用浮点秒相加会得到 599.9999999999999 这种值，Math.floor 一取就少算一批灵材。
  // 这是会真实影响玩家的产出损失，不是理论问题。
  acc.herbMs = (acc.herbMs || 0) + Math.round(seconds * 1000);

  const batches = Math.floor(acc.herbMs / intervalMs);
  if (batches <= 0) return out;
  acc.herbMs -= batches * intervalMs;

  const total = batches * lv * (bld.effect?.perLevel || 1);
  const pool = herbPool();
  for (let i = 0; i < total; i++) {
    const m = pick(pool);
    if (!m) break;
    out[m.id] = (out[m.id] || 0) + 1;
  }
  for (const [id, n] of Object.entries(out)) addMaterial(id, n);
  return out;
}

// ==================== 建筑升级 ====================

function completeBuilding(id, atMs) {
  const def = buildingById(id);
  const b = state.cave.buildings[id];
  if (!b || !b.upgradeEndsAt) return null;
  b.level = (b.level || 0) + 1;
  b.upgradeEndsAt = null;
  const entry = { id, name: def?.name || id, level: b.level, at: atMs };
  emit(EV.BUILDING_DONE, entry);
  log(`【${def?.name || id}】建成，已达 ${b.level} 级`, 'event-good');
  return entry;
}

function completeCaveUpgrade(atMs) {
  const c = state.cave;
  if (!c.upgradeEndsAt) return null;
  c.level = Math.min(MAX_CAVE_LEVEL, (c.level || 1) + 1);
  c.upgradeEndsAt = null;
  emit(EV.BUILDING_DONE, { id: 'cave', name: '洞府', level: c.level, at: atMs });
  log(`洞府扩建完成，升为 ${c.level} 级`, 'event-special');
  return c.level;
}

/** 是否满足升级前置（不含灵石） */
function precheckBuilding(def, b) {
  if (!def) return { ok: false, reason: '查无此建筑' };
  if (b.upgradeEndsAt) return { ok: false, reason: '正在修建中' };
  if ((b.level || 0) >= def.maxLevel) return { ok: false, reason: '已至最高等级' };
  if (state.cave.level < def.reqCaveLevel) return { ok: false, reason: `需洞府 ${def.reqCaveLevel} 级` };
  if (state.player.realmIndex < def.unlockRealm) return { ok: false, reason: '境界不足，尚未解锁' };
  return { ok: true };
}

/**
 * 升级（或首次建造）某建筑：校验前置 → 扣灵石 → 开始计时。
 * 计时用绝对时间戳，离线照常推进。
 */
export function upgradeBuilding(buildingId) {
  ensureCave();
  const def = buildingById(buildingId);
  if (!def) return { ok: false, reason: '查无此建筑' };
  const b = state.cave.buildings[buildingId] || (state.cave.buildings[buildingId] = { level: 0, upgradeEndsAt: null });

  const pre = precheckBuilding(def, b);
  if (!pre.ok) return pre;

  const cost = buildingUpgradeCost(def, b.level || 0);
  if (cost == null) return { ok: false, reason: '已至最高等级' };
  if (!spendStones(cost)) return { ok: false, reason: `灵石不足（需 ${fmt(cost)}）` };

  const seconds = buildingUpgradeSeconds(def, b.level || 0);
  b.upgradeEndsAt = Date.now() + seconds * 1000;
  log(`开始修建【${def.name}】至 ${(b.level || 0) + 1} 级，耗灵石 ${fmt(cost)}，约需 ${fmtDuration(seconds)}`, 'event-special');
  return { ok: true, cost, seconds, endsAt: b.upgradeEndsAt, level: b.level || 0 };
}

/** 建筑状态，供 UI 渲染 */
export function buildingStatus(id) {
  ensureCave();
  const def = buildingById(id);
  const b = state.cave.buildings[id] || { level: 0, upgradeEndsAt: null };
  const level = b.level || 0;
  const upgrading = !!b.upgradeEndsAt;
  const now = Date.now();
  const remaining = upgrading ? Math.max(0, Math.ceil((b.upgradeEndsAt - now) / 1000)) : 0;

  const base = {
    id, level, upgrading, remaining,
    maxLevel: def?.maxLevel ?? MAX_BUILDING_LEVEL,
    cost: null, seconds: null, canUpgrade: false, reason: '',
  };
  if (!def) { base.reason = '查无此建筑'; return base; }

  if (upgrading) {
    base.reason = '正在修建中';
    return base;
  }
  base.cost = buildingUpgradeCost(def, level);
  base.seconds = buildingUpgradeSeconds(def, level);
  const pre = precheckBuilding(def, b);
  if (!pre.ok) { base.reason = pre.reason; return base; }
  if (base.cost == null) { base.reason = '已至最高等级'; return base; }
  if (!hasEnough(base.cost)) { base.reason = `灵石不足（需 ${fmt(base.cost)}）`; return base; }
  base.canUpgrade = true;
  return base;
}

function hasEnough(cost) {
  const s = state.resources.stones;
  return (s.low || 0) + (s.mid || 0) * 100 + (s.high || 0) * 10000 >= cost;
}

// ==================== 每帧 / 离线推进 ====================

/** 主循环调用：完成到期升级 + 灵田产出 */
export function tickCave(dt) {
  ensureCave();
  const now = Date.now();
  for (const [id, b] of Object.entries(state.cave.buildings)) {
    if (b?.upgradeEndsAt && now >= b.upgradeEndsAt) completeBuilding(id, now);
  }
  if (state.cave.upgradeEndsAt && now >= state.cave.upgradeEndsAt) completeCaveUpgrade(now);

  const produced = produceHerb(dt);
  if (Object.keys(produced).length > 0) {
    const total = Object.values(produced).reduce((a, b) => a + b, 0);
    log(`灵田收获 ${fmt(total)} 份灵材`, 'event-good');
  }
  return { materials: produced };
}

/**
 * 【关键】离线结算。
 *
 * 做法：把离线窗口 [now-seconds, now] 视为一条时间轴，
 *   - 窗口开始前就该完成、尚未结算的升级：先补结算（升级本身不受离线上限影响）
 *   - 窗口内到期的升级：按到期时刻把窗口切成若干段，逐段用"当时的灵田等级"产出，
 *     使得"升级在离线中途完成"也能正确体现在产出上
 *   - 产出时长受 meta.offlineCapHours 上限保护（升级完成不受该上限影响）
 *
 * @returns {{seconds:number,effectiveSeconds:number,capped:boolean,completed:Array,materials:Object,caveLevelUp:number|null,text:string}}
 */
export function caveOffline(seconds) {
  ensureCave();
  seconds = Math.max(0, Math.floor(seconds || 0));
  const now = Date.now();
  const capSec = Math.max(0, (state.meta.offlineCapHours ?? 8) * 3600);
  const eff = Math.min(seconds, capSec);

  const report = {
    seconds,
    effectiveSeconds: eff,
    capped: seconds > eff,
    completed: [],   // [{id,name,level}]
    caveLevelUp: null,
    materials: {},
    text: '',
  };

  const windowStart = now - eff * 1000;

  // ---- 1) 收集待结算的升级 ----
  const pending = [];
  for (const [id, b] of Object.entries(state.cave.buildings)) {
    if (b?.upgradeEndsAt) pending.push({ id, endsAt: b.upgradeEndsAt });
  }
  pending.sort((a, b) => a.endsAt - b.endsAt);

  const inWindow = [];
  for (const p of pending) {
    if (p.endsAt <= windowStart) {
      // 早于窗口就已完工，补结算（不产出此段，因为窗口已过）
      const c = completeBuilding(p.id, now);
      if (c) { c.beforeWindow = true; report.completed.push(c); }
    } else if (p.endsAt <= now) {
      inWindow.push(p);
    }
  }

  // 洞府本身若早于窗口完成
  if (state.cave.upgradeEndsAt && state.cave.upgradeEndsAt <= windowStart) {
    const lv = completeCaveUpgrade(now);
    if (lv) report.caveLevelUp = lv;
  }

  // ---- 2) 窗口内分段模拟 ----
  const events = inWindow
    .filter((p) => state.cave.buildings[p.id]?.upgradeEndsAt === p.endsAt)
    .sort((a, b) => a.endsAt - b.endsAt);

  let cursor = windowStart;
  let ei = 0;
  while (cursor < now) {
    const ev = events[ei];
    const stop = ev ? Math.min(ev.endsAt, now) : now;
    const dt = (stop - cursor) / 1000;
    if (dt > 0) mergeCounts(report.materials, produceHerb(dt));
    cursor = stop;
    if (ev && ev.endsAt <= now) {
      const c = completeBuilding(ev.id, now);
      if (c) report.completed.push(c);
      ei++;
    } else {
      break;
    }
  }

  // 洞府等级若在窗口内完成
  if (state.cave.upgradeEndsAt && state.cave.upgradeEndsAt <= now) {
    const lv = completeCaveUpgrade(now);
    if (lv) report.caveLevelUp = lv;
  }

  state.meta.lastTick = now;

  report.text = describeReport(report);
  if (report.text) log(report.text, 'event-special');
  emit(EV.OFFLINE_REWARD, report);
  return report;
}

function describeReport(report) {
  const parts = [];
  if (report.caveLevelUp) parts.push(`洞府升至 ${report.caveLevelUp} 级`);
  for (const c of report.completed) parts.push(`【${c.name}】升至 ${c.level} 级`);
  const matEntries = Object.entries(report.materials);
  if (matEntries.length > 0) {
    const total = matEntries.reduce((a, [, n]) => a + n, 0);
    parts.push(`灵田收获 ${fmt(total)} 份灵材`);
  }
  if (parts.length === 0) return '';
  return `离线 ${fmtDuration(report.effectiveSeconds)}：` + parts.join('，') + (report.capped ? '（产出已达离线封顶）' : '');
}

// ==================== 洞府等级 ====================

/** 提升洞府等级，解锁更多建筑（同样消耗灵石 + 时间，离线推进） */
export function upgradeCave() {
  ensureCave();
  const c = state.cave;
  if (c.upgradeEndsAt) return { ok: false, reason: '洞府正在扩建中' };
  if ((c.level || 1) >= MAX_CAVE_LEVEL) return { ok: false, reason: '洞府已至最高等级' };

  const cost = caveUpgradeCost(c.level);
  if (cost == null) return { ok: false, reason: '洞府已至最高等级' };
  if (!spendStones(cost)) return { ok: false, reason: `灵石不足（需 ${fmt(cost)}）` };

  const seconds = caveUpgradeSeconds(c.level);
  c.upgradeEndsAt = Date.now() + seconds * 1000;
  log(`开始扩建洞府至 ${(c.level || 1) + 1} 级，耗灵石 ${fmt(cost)}，约需 ${fmtDuration(seconds)}`, 'event-special');
  return { ok: true, cost, seconds, endsAt: c.upgradeEndsAt };
}

// ==================== UI 汇总 ====================

export function caveSummary() {
  ensureCave();
  const c = state.cave;
  const now = Date.now();
  const caveUpgrading = !!c.upgradeEndsAt;
  const tier = herbTier();
  const pool = herbPool(tier);

  return {
    level: c.level,
    maxLevel: MAX_CAVE_LEVEL,
    upgrade: {
      upgrading: caveUpgrading,
      remaining: caveUpgrading ? Math.max(0, Math.ceil((c.upgradeEndsAt - now) / 1000)) : 0,
      cost: caveUpgrading ? null : caveUpgradeCost(c.level),
      seconds: caveUpgrading ? null : caveUpgradeSeconds(c.level),
      canUpgrade: !caveUpgrading && (c.level || 1) < MAX_CAVE_LEVEL,
    },
    cultMult: caveCultMult(),
    heroTier: tier,
    herb: {
      level: buildingLevel('bld_herb'),
      perHour: Math.round(herbPerSecond() * 3600),
      tier,
      pool: pool.map((m) => ({ id: m.id, name: m.name, tier: m.tier })),
      pendingSeconds: (c.yieldAcc.herbMs || 0) / 1000,
    },
    buildings: BUILDINGS.map((def) => ({
      id: def.id,
      name: def.name,
      art: def.art,
      desc: def.desc,
      effect: def.effect,
      unlockRealm: def.unlockRealm,
      reqCaveLevel: def.reqCaveLevel,
      autoUnlockLevel: def.autoUnlockLevel ?? null,
      ...buildingStatus(def.id),
    })),
  };
}
