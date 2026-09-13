/**
 * 本世功课（V6.0「功课」，V5.0 的「本世劫数」扩展而来）。
 *
 * ============ 一句话 ============
 *
 * 第一世走固定主线（八幕 20 门必做 + 余课任选 2 项），把玩法挨个推到玩家面前；
 * 第 2 世起每世抽 3 门，保留"每世不同"。**未全部完成不可飞升。**
 *
 * ============ 谁说了算 ============
 *
 * 功课的**生成、推进、判定、改派、立场准入**，独占在本文件
 * （见 docs/架构规范.md §2.1）。
 * 其它模块不得自行判定完成，也**不需要上报进度**——进度一律由 tickDuty
 * 从 state 里拉取重算。
 *
 * 为什么坚持全拉取、不留任何上报路径：
 * 上报要求每个可能产生进度的地方都记得调一次，漏一处就是**静默的永久卡关**——
 * 玩家做完了却判定没完成，而且不报错、不留痕。拉取则天然正确，
 * 读档、离线、跨世全都不用额外处理。
 *
 * 纯逻辑，禁止任何 DOM 操作；随机一律走 core/rng.js。
 */

import { state } from '../core/state.js';
import { emit, EV } from '../core/bus.js';
import { weightedPick } from '../core/rng.js';
import { QUALITIES } from '../data/qualities.js';
import { ENEMIES } from '../data/enemies.js';
import { ENCOUNTERS } from '../data/encounters.js';
import { ALCHEMY_RECIPES, FORGE_RECIPES } from '../data/recipes.js';
import { CODEX_KINDS } from './codex.js';
import {
  DUTIES, dutyById, mainDuties, sideDuties, samplingPool,
  actForRealm, ACTS, DUTY_KIND_NAMES,
} from '../data/duties.js';

/** 每门功课给的改派次数。不允许存在"这一世废了" */
export const DEFAULT_REROLLS = 1;

/** 余课需要完成几项 */
export const SIDE_REQUIRED = 2;

/** 第 2 世起每世抽几门 */
export const SAMPLED_COUNT = 3;

function log(text, cls = 'event-special') {
  emit(EV.LOG, { text, cls, channel: 'system' });
}

// ==================== 契约兜底 ====================

/** 补齐字段。旧档/手改档的 duty 可能缺字段，任何读取都先过这里 */
function ensureDutyShape(d) {
  if (!d || typeof d !== 'object') return null;
  return {
    id: d.id ?? null,
    kind: d.kind ?? '',
    target: d.target ?? null,
    need: Math.max(1, Math.floor(d.need ?? 1)),
    progress: Math.max(0, Math.floor(d.progress ?? 0)),
    done: !!d.done,
    rerolls: Math.max(0, Math.floor(d.rerolls ?? 0)),
    assignedGen: Math.max(0, Math.floor(d.assignedGen ?? 0)),
    // 旧档的单条 duty 没有 act：从数据表反查，查不到按主线（1）算，
    // 让它继续参与"必做"判定，不会因为缺字段而被跳过
    act: Math.max(0, Math.floor(d.act ?? dutyById(d.id)?.act ?? 1)),
  };
}

/** 本世全部功课（已做形状兜底）；无则空数组 */
export function currentDuties() {
  const rc = state.reincarnation;
  if (!rc || !Array.isArray(rc.duties)) return [];
  return rc.duties.map(ensureDutyShape).filter(Boolean);
}

/** 当前的功课模式：'full'（第一世八幕主线）| 'sampled'（其后每世抽签） */
export function currentMode() {
  return state.reincarnation?.dutyMode === 'sampled' ? 'sampled' : 'full';
}

/**
 * 旧档迁移：V5.0 的单条 `reincarnation.duty` → V6.0 的 `duties` 数组。
 *
 * 由 save.js 在反序列化后调用。**必须幂等**，读一次档迁移一次也无妨。
 *
 * 老玩家一律落到 `'sampled'` 模式：他已经在半途上（可能第三世了），
 * 不该被塞一份"第一世教学主线"重走一遍——那会把他的存档变成必须
 * 重做 20 门功课才能飞升，等于毁档。
 */
export function migrateDutyState(rc) {
  if (!rc || typeof rc !== 'object') return;
  if (Array.isArray(rc.duties)) { delete rc.duty; return; }

  if (rc.duty && typeof rc.duty === 'object' && rc.duty.id) {
    rc.duties = [rc.duty];
    rc.dutyMode = 'sampled';
  } else {
    rc.duties = [];
    rc.dutyMode = 'sampled';
  }
  delete rc.duty;
}

// ==================== 立场准入 ====================

/**
 * 这门功课当前能不能做。
 *
 * **必须与"做完没有"的判定同住本文件**——散到 UI 层就是"一件事两个裁判"。
 * 判定是**动态**的：邪道渡过心魔劫洗白后，宗门功课会自动解除灰显。
 */
export function canDo(duty) {
  const def = dutyById(duty?.id);
  if (!def?.needsStance) return { ok: true, reason: '' };
  if ((state.player?.stance || 'sanxiu') === 'xiedao') {
    return {
      ok: false,
      reason: '邪修之身，正道宗门不纳。渡心魔劫洗去魔性后，方可拜入。',
    };
  }
  return { ok: true, reason: '' };
}

// ==================== 进度拉取 ====================

/** 装备里最高的品阶 order（凡1 灵2 仙3 神4 圣5） */
function maxQualityOrder() {
  const owned = state.equipment?.owned || [];
  let best = 0;
  for (const it of owned) {
    const q = QUALITIES[it?.quality];
    if (q && q.order > best) best = q.order;
  }
  return best;
}

/** 图鉴总收录条数（七栏合计） */
function codexTotal() {
  const c = state.codex;
  if (!c) return 0;
  let n = 0;
  for (const k of CODEX_KINDS) n += (c[k.id] || []).length;
  return n;
}

/**
 * 记录"本世增量"的基线——由 reincarnation.js 在**建好新档之后**调用。
 *
 * 图鉴与成就是跨世保留的，`codexDelta` / `achDelta` 两个 kind 靠"当前 − 基线"算增量。
 * 基线必须落在 `state.reincarnation`（跨世保留）里，放 `stats` 会被每世清成 0，
 * "本世新增"就退化成"总收录"了。这里**不自行清空 codex/achievements**——
 * 保留与清空的决策权只在 reincarnation.js。
 */
export function snapshotBaselines() {
  const rc = state.reincarnation;
  if (!rc) return;
  rc.codexBaseline = codexTotal();
  rc.achBaseline = state.achievements?.unlocked?.length || 0;
}

/**
 * 按 kind 从 state 里算出当前进度。
 * **这里是唯一的进度真相来源**——tickDuty 与 UI 都走这个函数。
 */
export function computeProgress(duty) {
  const d = duty;
  if (!d) return 0;
  const kinds = state.stats?.kinds || {};

  switch (d.kind) {
    // ---- V5.0 遗留口径（旧档迁移后仍要能算）----
    case 'combat':
      return Math.floor(state.stats?.kills || 0);

    case 'explore':
      return Math.floor(state.stats?.encounters || 0);

    // ---- V6.0 新增 ----
    case 'breakthrough':
      return Math.floor(state.stats?.breakthroughs || 0);

    // "种类"型：返回去重集合的长度
    case 'slayKinds':
      return (kinds.slain || []).length;
    case 'encounterKinds':
      return (kinds.encounters || []).length;
    case 'pillKinds':
      return (kinds.pills || []).length;
    case 'forgeKinds':
      return (kinds.forged || []).length;
    case 'shopKinds':
      return (kinds.shopBuy || []).length;

    case 'tower':
      return Math.floor(state.combat?.towerFloor || 0);

    case 'streak':
      return Math.floor(state.combat?.winStreak || 0);

    case 'equipQuality': {
      const want = QUALITIES[d.target]?.order || 1;
      return maxQualityOrder() >= want ? 1 : 0;
    }

    case 'equipOps':
      return Math.floor(state.stats?.equipOps || 0);

    case 'companionMeets':
      return Math.floor(state.stats?.companionMeets || 0);

    // 本世增量：跨世保留的集合 − 轮回那刻的基线
    case 'codexDelta':
      return Math.max(0, codexTotal() - Math.floor(state.reincarnation?.codexBaseline || 0));

    case 'achDelta':
      return Math.max(0,
        (state.achievements?.unlocked?.length || 0)
        - Math.floor(state.reincarnation?.achBaseline || 0));

    case 'sectJoin':
      return state.sect?.id ? 1 : 0;

    case 'sectRank':
      return Math.floor(state.sect?.rank || 0);

    case 'recipeCount':
      return d.target === 'forge'
        ? (state.forging?.knownRecipes || []).length
        : (state.alchemy?.knownRecipes || []).length;

    // ---- 需要 target 细分的老口径 ----
    case 'beast': {
      const owned = state.beasts?.owned || [];
      if (d.target === 'count') return owned.length;
      if (d.target === 'stage') {
        return owned.reduce((m, b) => Math.max(m, b.stage || 0), 0);
      }
      if (d.target === 'level') {
        return owned.reduce((m, b) => Math.max(m, b.level || 1), 0);
      }
      return owned.length;
    }

    case 'cave': {
      const cave = state.cave || {};
      const buildings = cave.buildings || {};
      if (d.target === 'cave') return Math.max(0, cave.level || 0);
      if (d.target === 'any') {
        return Object.values(buildings).reduce((m, b) => Math.max(m, b?.level || 0), 0);
      }
      if (d.target === 'sum') {
        return Object.values(buildings).reduce((n, b) => n + (b?.level || 0), 0);
      }
      return Math.max(0, cave.level || 0);
    }

    case 'cultivate': {
      const known = state.techniques?.known || {};
      const levels = Object.values(known).map((k) => k?.level || 0);
      if (d.target === 'level') return levels.length ? Math.max(...levels) : 0;
      if (d.target === 'count') return levels.length;
      return levels.length;
    }

    default:
      return 0;
  }
}

/** 进度比例 0..1 */
export function dutyRatio(d) {
  const duty = d;
  if (!duty || duty.need <= 0) return 0;
  return Math.max(0, Math.min(1, duty.progress / duty.need));
}

// ==================== "还差什么" ====================

/**
 * "种类"型功课还缺哪几种，返回 `{ id, name }[]`。
 *
 * 只有**有固定全集**的 kind 才给——"坊市买入 N 种"没有全集可言
 * （什么都能买），硬凑一份清单只会误导玩家，所以它返回空。
 */
export function dutyMissing(duty) {
  if (!duty) return [];
  const kinds = state.stats?.kinds || {};
  const diff = (table, have, nameOf) =>
    table.filter((e) => !have.includes(e.id)).map((e) => ({ id: e.id, name: nameOf(e) }));

  switch (duty.kind) {
    case 'slayKinds':
      return diff(ENEMIES, kinds.slain || [], (e) => e.name);
    case 'encounterKinds':
      return diff(ENCOUNTERS, kinds.encounters || [], (e) => e.title);
    case 'pillKinds':
      return diff(ALCHEMY_RECIPES, kinds.pills || [], (e) => e.name);
    case 'forgeKinds':
      return diff(FORGE_RECIPES, kinds.forged || [], (e) => e.name);
    default:
      return [];
  }
}

// ==================== 指派 ====================

function makeDuty(def, gen) {
  return {
    id: def.id,
    kind: def.kind,
    target: def.target ?? null,
    need: Math.max(1, Math.floor(def.need ?? 1)),
    progress: 0,
    done: false,
    rerolls: DEFAULT_REROLLS,
    assignedGen: Math.max(1, gen | 0),
    act: Math.max(0, Math.floor(def.act ?? 0)),
  };
}

/** 抽一门功课（供第 2 世起的抽样用） */
export function rollDuty(gen, excludeIds = []) {
  const pool = DUTIES.filter((d) => !excludeIds.includes(d.id));
  const picked = weightedPick(pool, (d) => d.weight ?? 1) || pool[0] || DUTIES[0];
  return makeDuty(picked, gen);
}

/**
 * 第 2 世起：每世抽 SAMPLED_COUNT 门，**强制横跨不同类别**。
 * 不这么做就会出现"三门都是斩敌"，等于这一世只需要做一件事。
 */
export function sampleDuties(gen, excludeIds = []) {
  // 邪道不抽宗门——`canJoin` 硬拒他，抽给他等于抽了一门做不了的。
  // 但立场可能在抽完之后才变，所以这只是第一道防线，改派是第二道。
  const xiedao = (state.player?.stance || 'sanxiu') === 'xiedao';
  const pool = samplingPool().filter((d) =>
    !excludeIds.includes(d.id) && !(xiedao && d.needsStance));
  const byKind = new Map();
  for (const d of pool) {
    if (!byKind.has(d.kind)) byKind.set(d.kind, []);
    byKind.get(d.kind).push(d);
  }

  const picked = [];
  const used = new Set();
  const kinds = [...byKind.keys()];
  while (picked.length < SAMPLED_COUNT && used.size < kinds.length) {
    const avail = kinds.filter((k) => !used.has(k));
    if (!avail.length) break;
    const k = weightedPick(avail, () => 1) || avail[0];
    used.add(k);
    const bucket = byKind.get(k) || [];
    const def = weightedPick(bucket, (d) => d.weight ?? 1) || bucket[0];
    if (def) picked.push(def);
  }
  // 池子被改坏时的最后兜底：宁可重复，也不能给空——空数组等于白送一世
  if (picked.length === 0) return [makeDuty(DUTIES[0], gen)];
  return picked.map((def) => makeDuty(def, gen));
}

/**
 * 为当前这一世指派功课（由 reincarnation.js 在轮回时调用）。
 *
 * 第 1 世：八幕主线 20 门 + 余课池 8 门（余课任选 SIDE_REQUIRED 项）。
 * 第 2 世起：抽 SAMPLED_COUNT 门，排除上一世做过的。
 */
export function assignDuties(gen, prevIds = []) {
  const rc = state.reincarnation;
  const g = Math.max(1, gen | 0);

  if (g <= 1) {
    rc.dutyMode = 'full';
    rc.duties = [...mainDuties(), ...sideDuties()].map((def) => makeDuty(def, g));
  } else {
    rc.dutyMode = 'sampled';
    rc.duties = sampleDuties(g, prevIds);
  }
  return rc.duties;
}

/**
 * 改派：换一门同类的功课，消耗一次机会。
 *
 * ⚠ 两处必须小心：
 *   1. **按索引替换**，不能按 id 反查——第一世有 28 门同时在列表里，
 *      换出一门已在列表中的功课时，`findIndex(id)` 会命中**另一条**，
 *      结果数组里出现两条同 id：UI 重复显示、计数全错。
 *   2. **候选必须排除所有已在列表里的 id**。同理。
 */
export function rerollDuty(dutyId) {
  const rc = state.reincarnation;
  if (!rc || !Array.isArray(rc.duties)) return { ok: false, reason: '本世无功课' };

  const idx = rc.duties.findIndex((d) => d.id === dutyId);
  if (idx < 0) return { ok: false, reason: '未找到该门功课' };

  const cur = ensureDutyShape(rc.duties[idx]);
  if (cur.done) return { ok: false, reason: '功课已了结' };
  if (cur.rerolls <= 0) return { ok: false, reason: '本世已无改派机会' };
  // 第一世是"全览"——28 门全在列表里，池子外没有任何候选可换。
  // 而且这一世本来就不存在"废了"的情况（每门都能做，余课还任选），
  // 所以改派在这里没有意义，直接说清楚而不是返回一句让人困惑的"无课可换"。
  if (currentMode() !== 'sampled') {
    return { ok: false, reason: '第一世功课全在，无需改派' };
  }

  const def = dutyById(cur.id);
  const taken = new Set(rc.duties.map((d) => d.id));
  const stanceOk = (d) => !d.needsStance || (state.player?.stance || 'sanxiu') !== 'xiedao';

  // 余课在同池内换，主线在同幕内换；再退一步用全池兜底。
  // 换给玩家一门他做不了的（邪道换到宗门）等于没换，所以两边都要过立场筛。
  const scope = cur.act === 0 ? sideDuties() : DUTIES.filter((d) => d.act === cur.act);
  let pool = scope.filter((d) => !taken.has(d.id) && stanceOk(d));
  if (!pool.length) pool = DUTIES.filter((d) => !taken.has(d.id) && stanceOk(d));
  if (!pool.length) return { ok: false, reason: '已无其他功课可换' };

  const next = weightedPick(pool, (d) => d.weight ?? 1) || pool[0];
  const replaced = makeDuty(next, cur.assignedGen || 1);
  replaced.rerolls = cur.rerolls - 1;
  rc.duties[idx] = replaced;

  log(`功课改派：【${def?.name || cur.id}】改为【${next.name || next.id}】。`, 'event-special');
  emit(EV.DUTY_CHANGE, { from: dutyId, to: next.id, rerolled: true });
  return { ok: true, duty: replaced, def: next };
}

// ==================== 推进与判定 ====================

/**
 * 每帧调用：拉取进度 → 判定是否了结。
 *
 * 幂等且廉价（只是读几个字段做比较），可以在主循环里放心每秒调。
 * @returns {{changed:boolean, justDone:string[]}|null}
 */
export function tickDuty() {
  const rc = state.reincarnation;
  if (!rc || !Array.isArray(rc.duties)) return null;

  let changed = false;
  const justDone = [];

  for (const raw of rc.duties) {
    const d = ensureDutyShape(raw);
    if (!d) continue;

    const progress = computeProgress(d);
    if (progress !== d.progress) changed = true;
    d.progress = progress;

    if (!d.done && d.need > 0 && progress >= d.need) {
      d.done = true;
      justDone.push(d.id);
    }
    // 已了结的功课进度不再回落（例如连胜被败仗清零、灵兽被放生），
    // 否则会出现"完成过又被判回未完成"这种让玩家莫名其妙的抖动
    if (d.done) d.progress = Math.max(d.progress, d.need);

    raw.id = d.id; raw.kind = d.kind; raw.target = d.target;
    raw.need = d.need; raw.progress = d.progress; raw.done = d.done;
    raw.rerolls = d.rerolls; raw.assignedGen = d.assignedGen; raw.act = d.act;
  }

  for (const id of justDone) {
    const def = dutyById(id);
    log(`本世之业已了：【${def?.name || id}】。`, 'event-breakthrough');
    emit(EV.DUTY_DONE, { id, kind: def?.kind || '' });
  }

  return { changed, justDone };
}

/**
 * 本世功课是否已全部了结。
 * 旧档无功课时视为已了结（不能把老玩家卡在门外）。
 */
export function dutySatisfied() {
  const ds = currentDuties();
  if (!ds.length) return true;

  if (currentMode() === 'sampled') return ds.every((d) => d.done);

  const main = ds.filter((d) => d.act > 0);
  const side = ds.filter((d) => d.act === 0);
  const mainOk = main.every((d) => d.done);
  const sideOk = side.length === 0 || side.filter((d) => d.done).length >= SIDE_REQUIRED;
  return mainOk && sideOk;
}

// ==================== 展示 ====================

function viewOf(d) {
  const def = dutyById(d.id);
  const gate = canDo(d);
  return {
    ...d,
    name: def?.name || d.id,
    desc: def?.desc || '',
    hint: def?.hint || '',
    kindName: DUTY_KIND_NAMES[d.kind] || d.kind,
    ratio: dutyRatio(d),
    remain: Math.max(0, d.need - d.progress),
    satisfied: !!d.done,
    canDo: gate.ok,
    blockedReason: gate.reason,
    // 改派只在抽签模式有意义：第一世是"全览"，28 门全在列表里，
    // 池子外没有候选可换，UI 不该给一个必然失败的按钮
    canReroll: !d.done && gate.ok && d.rerolls > 0 && currentMode() === 'sampled',
    missing: d.done ? [] : dutyMissing(d),
  };
}

/**
 * 功课的总览数据，供 UI 直接渲染。
 *
 * 结构：
 *   mode        'full' | 'sampled'
 *   acts        [{ act, name, minRealm, unlocked, duties: [...] }]   第一世的八幕
 *   side        [...]                                                余课池（第一世）
 *   flat        [...]                                                sampled 模式下的平铺列表
 *   mainDone / mainTotal / sideDone / sideRequired / satisfied
 */
export function dutySummary() {
  const ds = currentDuties();
  const mode = currentMode();
  const realmIndex = state.player?.realmIndex || 0;
  const unlockedAct = actForRealm(realmIndex);

  const views = ds.map(viewOf);
  const main = views.filter((d) => d.act > 0);
  const side = views.filter((d) => d.act === 0);

  const acts = ACTS.map((a) => ({
    act: a.act,
    name: a.name,
    desc: a.desc,
    minRealm: a.minRealm,
    unlocked: realmIndex >= a.minRealm,
    duties: main.filter((d) => d.act === a.act),
  }));

  return {
    mode,
    acts,
    side,
    flat: mode === 'sampled' ? views : [],
    unlockedAct,
    mainDone: main.filter((d) => d.done).length,
    mainTotal: main.length,
    sideDone: side.filter((d) => d.done).length,
    sideRequired: SIDE_REQUIRED,
    satisfied: dutySatisfied(),
    // 飞升被拦时，UI 要能一句话说清差在哪
    blocked: mode === 'full'
      ? [
          ...main.filter((d) => !d.done).map((d) => d.name),
          ...(side.filter((d) => d.done).length >= SIDE_REQUIRED
            ? []
            : [`余课尚差 ${SIDE_REQUIRED - side.filter((d) => d.done).length} 项`]),
        ]
      : views.filter((d) => !d.done).map((d) => d.name),
  };
}

/** 单门功课的展示数据（兼容旧调用） */
export function dutyView(dutyId) {
  const d = currentDuties().find((x) => x.id === dutyId);
  return d ? viewOf(d) : null;
}

export { DUTY_KIND_NAMES };
