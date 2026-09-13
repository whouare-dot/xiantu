/**
 * 轮回系统 —— V4.0 的核心，也是整个游戏的终局结构。
 *
 * 飞升成仙即**强制**进入下一世，不可拒绝。玩家不能赖在仙界，
 * 必须把这一世的成果转化为下一世的资本。
 *
 * ══════════════════════ 最重要的一条规则 ══════════════════════
 *
 * **本文件独占"轮回时保留什么、清空什么"的全部逻辑。**
 * 其它任何模块都不得自行清空或保留字段。
 *
 * 这条规则是拿血换来的：V3.0 时立场字段被两个模块各自读写，
 * 结果一边写根层、一边读 player 层，冷却显示"30 分钟"看起来完全正常，
 * 实际永远不生效——每个测出来的数字都对，功能是坏的。
 * 跨世的状态迁移比那更容易出错，所以这次先把所有权立死。
 *
 * ══════════════════════ 保留 / 清空的切分 ══════════════════════
 *
 * 保留（"知识与羁绊"）        不保留（"资产"）
 *   道基点、天赋树              境界、修为、寿元
 *   图鉴、成就、称号            灵石、丹药、材料
 *   道侣羁绊与剧情进度          灵兽本体与等级
 *   灵兽血脉                    装备、洞府等级
 *   轮回次数与历世记录          宗门职位与贡献
 *
 * 每一世都要重新经营，但**经营得更快**——这才是有意义的轮回。
 *
 * 纯逻辑，禁止 DOM。
 */

import { state, setState, createInitialState, realm } from '../core/state.js';
import { emit, EV } from '../core/bus.js';
import { weightedPick } from '../core/rng.js';
import { FATES, fatesForGen, isBadFate } from '../data/fates.js';
import { isEndingPathUnlocked, fateRerollCharges } from './talent.js';
import { extractFrom, installInto, bloodlines } from './bloodline.js';
import { assignDuties, snapshotBaselines, dutySummary } from './duty.js';

/** 真结局需要的轮回世数 */
export const ENDING_MIN_GEN = 5;

/** 记忆残留每世提供的起步加成 */
const MEMORY_PER_GEN = 0.15;
const MEMORY_CAP = 2.5;

function log(text, cls = 'event-special') {
  emit(EV.LOG, { text, cls, channel: 'system' });
}

// ==================== 世数与天命 ====================

/** 当前是第几世（第一世 = 1） */
export function currentGen() {
  return (state.reincarnation?.count || 0) + 1;
}

export function memoryBonus() {
  const n = state.reincarnation?.count || 0;
  return Math.min(MEMORY_CAP, 1 + n * MEMORY_PER_GEN);
}

/** 当前世的天命（可能在开局时还没掷） */
export function currentFate() {
  return state.reincarnation?.fate || null;
}

/**
 * 掷天命。
 * @param {boolean} reroll 是否为"夺天造化"重掷（会剔除凶命）
 */
export function rollFate({ reroll = false } = {}) {
  const gen = currentGen();
  let pool = fatesForGen(gen);
  // 夺天造化（天赋）：重掷时至少不会更差，把凶命排除在外。
  // 这是玩家对"随机天命"唯一的主动权，所以重掷不可能是负收益。
  if (reroll) pool = pool.filter((f) => !isBadFate(f));
  if (pool.length === 0) pool = FATES;
  const fate = weightedPick(pool, (f) => f.weight ?? 1) || pool[0];
  state.reincarnation.fate = {
    id: fate.id, name: fate.name, desc: fate.desc,
    effects: fate.effects || [], good: fate.good !== false,
  };
  return state.reincarnation.fate;
}

/** 天命提供的某项加成 */
export function fateBonus(kind) {
  const f = currentFate();
  if (!f?.effects) return 0;
  let sum = 0;
  for (const e of f.effects) if (e.kind === kind) sum += e.value || 0;
  return sum;
}

/**
 * 轮回体系对外提供的统一加成查询入口。
 * 把"记忆残留"与"天命"合并成一个来源，其它系统只认这一个函数，
 * 不必知道加成到底是记忆给的还是天命给的。
 */
export function reincarnationBonus(kind) {
  if (kind === 'cultPct') return memoryBonus() - 1 + fateBonus('cultPct');
  return fateBonus(kind);
}

/**
 * 用「夺天造化」给的机会重掷本世天命。
 * 只有天赋提供了次数时才可用；重掷不会抽到凶命（不会越换越差）。
 */
export function rerollFate() {
  const have = fateRerollCharges();
  if (have <= 0) return { ok: false, reason: '未曾参悟「夺天造化」' };
  const before = currentFate();
  const after = rollFate({ reroll: true });
  log(
    `你以道基强行改易命数——【${before?.name || '无'}】化作【${after.name}】。` +
    `（剩余重掷之数 ${have - 1}）`,
    'event-special',
  );
  emit(EV.REINCARNATE, { kind: 'fateReroll', gen: currentGen() });
  return { ok: true, fate: after, remaining: have - 1 };
}

/** 尚可重掷天命的次数 */
export function fateRerollsLeft() {
  return fateRerollCharges();
}

// ==================== 道基点 ====================

/**
 * 按本世的综合成就换算道基点。
 * 各项都设了上限，避免任何单一维度（尤其是"奇遇次数"这种可以刷的）主导结算。
 */
export function calcDaoBase() {
  const s = state.stats || {};
  const rc = state.reincarnation || {};
  const parts = [
    { label: '境界深度', value: Math.floor((state.player.realmIndex || 0) * 3), cap: 75 },
    { label: '渡过天劫', value: (s.tribulationsPassed || 0) * 8, cap: 64 },
    { label: '突破次数', value: Math.min(s.breakthroughs || 0, 25), cap: 25 },
    { label: '宗门职位', value: (state.sect?.rank || 0) * 10, cap: 40 },
    { label: '灵兽收集', value: Math.min(state.beasts?.owned?.length || 0, 22) * 3, cap: 66 },
    { label: '道侣羁绊', value: Math.floor(totalBond() / 20), cap: 25 },
    { label: '成就解锁', value: Math.floor((state.achievements?.unlocked?.length || 0) * 0.6), cap: 45 },
    { label: '图鉴收集', value: Math.floor(codexPct() * 0.3), cap: 30 },
    { label: '历劫经验', value: rc.count || 0, cap: 20 },
  ];
  for (const p of parts) p.value = Math.min(p.value, p.cap);
  const total = parts.reduce((a, b) => a + b.value, 0);
  return { total, parts };
}

function totalBond() {
  const b = state.companions?.bond || {};
  return Object.values(b).reduce((a, x) => a + (x || 0), 0);
}

function codexPct() {
  const c = state.codex;
  if (!c) return 0;
  let got = 0, total = 0;
  for (const k of ['techniques', 'equipped', 'pills', 'materials', 'beasts', 'enemies', 'encounters']) {
    got += (c[k] || []).length;
    total += 1;   // 各表的总数由 codex 系统负责，这里只做一个粗略的相对量
  }
  return total ? (got / 200) * 100 : 0;   // 200 是全部图鉴条目的大致量级
}

// ==================== 轮回执行 ====================

/**
 * 执行转世。
 *
 * 这是整个游戏里唯一有权重建 state 的地方。
 * 做法是"造一个干净的新档，再把该保留的东西搬过去"——
 * 比"在原对象上逐个清空字段"安全得多：漏清一个字段只是少清一个，
 * 而漏保留一个字段在后者是灾难性的（玩家的永久进度会凭空消失）。
 */
export function executeReincarnation({ silent = false } = {}) {
  const { total: gained, parts } = calcDaoBase();
  const prevGen = currentGen();
  const prevRealm = realm().name;
  const oldName = state.player.name;

  // ---- 1) 结算本世 ----
  const rc = state.reincarnation;
  rc.count = (rc.count || 0) + 1;
  rc.daoBase = (rc.daoBase || 0) + gained;
  rc.history = [...(rc.history || []), {
    gen: prevGen,
    realmName: prevRealm,
    daoGained: gained,
    fateName: rc.fate?.name || '无',
    at: Date.now(),
  }].slice(-20);

  // ---- 2) 抢救出要跨世保留的东西 ----
  const keep = {
    reincarnation: rc,
    companions: state.companions,
    codex: state.codex,
    achievements: state.achievements,
    guide: state.guide,          // 已读的引导提示不必重看
    bloodlines: extractBloodlines(),
  };

  // ---- 3) 造一个干净的新档（这一步保证"不保留"的部分一定被清干净）----
  const fresh = createInitialState(oldName);
  fresh.reincarnation = keep.reincarnation;
  fresh.companions = keep.companions;
  fresh.codex = keep.codex;
  fresh.achievements = keep.achievements;
  fresh.guide = keep.guide || { seen: [] };
  fresh.meta.battleReport = state.meta.battleReport;
  fresh.meta.autoBreakthrough = state.meta.autoBreakthrough;
  fresh.meta.autoBreakThreshold = state.meta.autoBreakThreshold;
  restoreBloodlines(fresh, keep.bloodlines);

  // ---- 4) 掷本世天命 ----
  setState(fresh);
  rollFate();

  // ---- 4.5) 指派本世功课 ----
  // 必须在 setState 之后：assignDuties 写的是 state.reincarnation.duties，
  // 在旧对象上写会被随后的 setState 整个丢掉（这正是"改了没反应"的经典成因）。
  //
  // 第一世走八幕主线（20 门必做 + 余课任选 2 项），其后每世抽 3 门。
  // 排除上一世做过的，避免连着两世做同一件事。
  const prevDutyIds = Array.isArray(rc.duties) ? rc.duties.map((d) => d.id) : [];
  snapshotBaselines();          // 图鉴 / 成就的"本世增量"基线
  assignDuties(currentGen(), prevDutyIds);

  // ---- 5) 把记忆残留落到起步修为上，并播报 ----
  if (!silent) {
    announce(prevGen, gained, parts);
  }
  emit(EV.REINCARNATE, { gen: prevGen, nextGen: currentGen(), daoGained: gained });
  return { ok: true, daoGained: gained, parts, gen: currentGen(), fate: currentFate() };
}

/**
 * 抽出灵兽血脉——保留"你养过哪些血统、觉醒了什么"，但不保留灵兽本体。
 * 这是"中保留"的典型切法：知识留下，资产不留。
 *
 * 数据的形状与效果归 systems/bloodline.js 管；这里只负责**决定轮回时保留它**。
 * 保留规则只该有一个出处，所以本文件不自行拼一份血脉表。
 */
function extractBloodlines() {
  return extractFrom(state.beasts?.owned || []);
}

function restoreBloodlines(fresh, lines) {
  fresh.beasts = fresh.beasts || { owned: [], active: null, eggs: [], nextUid: 1 };
  installInto(fresh, lines || {});
}

function announce(prevGen, gained, parts) {
  log('═══ 轮 回 ═══', 'event-breakthrough');
  log(
    `第 ${prevGen} 世已尽。你散尽这一身的修为、灵石与法宝，` +
    `唯有走过的路留了下来。`,
    'event-special',
  );
  const top = parts.filter((p) => p.value > 0).sort((a, b) => b.value - a.value).slice(0, 4);
  log(
    `道基点 +${gained}（${top.map((p) => `${p.label} ${p.value}`).join('、')}）。`,
    'event-good',
  );
  const f = currentFate();
  if (f) {
    log(`第 ${currentGen()} 世天命：【${f.name}】${f.desc}`, f.good ? 'event-good' : 'event-bad');
  }
  log(`记忆残留：本世起步修炼速度 ×${memoryBonus().toFixed(2)}。`, 'event-special');
  // 功课是这一世的新题目，必须让玩家第一时间看到——否则他会爬到渡劫期才发现飞升不了
  const s = dutySummary();
  if (s.mode === 'full') {
    log(
      `本世功课：八幕共 ${s.mainTotal} 门必修，另有余课任选 ${s.sideRequired} 项，皆列于「轮回」页。`,
      'event-special',
    );
  } else {
    for (const d of s.flat) {
      log(`本世之业：【${d.name}】${d.desc}（${d.hint}）`, 'event-special');
    }
  }
}

// ==================== 真结局 ====================

/**
 * 真结局的条件。
 * 返回 {ok, items:[{label, done, hint}]}，供 UI 逐条展示——
 * 玩家应当知道自己在往哪走，而不是撞大运撞到结局。
 */
export function endingConditions() {
  const rc = state.reincarnation || {};
  const items = [
    {
      label: `历经轮回（${rc.count || 0} / ${ENDING_MIN_GEN} 世）`,
      done: (rc.count || 0) >= ENDING_MIN_GEN,
      hint: '飞升一次，便是一世',
    },
    {
      label: '三条道途各有建树',
      done: endingPathOk(),
      hint: '修行、战伐、机缘，每条路都要走到深处',
    },
    {
      label: `寻得大道残痕（${(rc.clues || []).length} / 3）`,
      done: (rc.clues || []).length >= 3,
      hint: '有些东西，只在转世之后才看得见',
    },
  ];
  return { ok: items.every((i) => i.done), items };
}

/**
 * 三条天赋支线是否各有建树。
 *
 * 判定口径**以天赋系统为准**（每系的主线天赋点满），
 * 而不是在这里另外算一套。曾经这里有个宽松兜底（"每系 ≥8 点"），
 * 结果真结局的第二条会比设计口径松得多——两套口径并存是隐患，
 * 规则只该有一个出处。
 */
function endingPathOk() {
  try {
    return isEndingPathUnlocked();
  } catch {
    return false;
  }
}

/** 记录一条大道残痕（由轮回后的特殊奇遇调用） */
export function addClue(id) {
  const rc = state.reincarnation;
  rc.clues = rc.clues || [];
  if (rc.clues.includes(id)) return { ok: false, reason: '已知' };
  rc.clues.push(id);
  log(`你拾起一片大道残痕（${rc.clues.length} / 3）。它上面写的字，你从未见过。`, 'event-special');
  return { ok: true, count: rc.clues.length };
}

/** 达成真结局 */
export function triggerEnding() {
  const c = endingConditions();
  if (!c.ok) return { ok: false, reason: '条件未足' };
  const rc = state.reincarnation;
  rc.endingSeen = true;
  rc.freeMode = true;
  emit(EV.ENDING, { gen: rc.count });
  return { ok: true };
}

export function inFreeMode() {
  return !!state.reincarnation?.freeMode;
}

export function endingSeen() {
  return !!state.reincarnation?.endingSeen;
}

// ==================== 展示 ====================

export function reincarnationSummary() {
  const rc = state.reincarnation || {};
  const fate = rc.fate;
  return {
    gen: currentGen(),
    count: rc.count || 0,
    daoBase: rc.daoBase || 0,
    memory: memoryBonus(),
    fate,
    history: rc.history || [],
    endingSeen: !!rc.endingSeen,
    freeMode: !!rc.freeMode,
    clues: (rc.clues || []).length,
    daoPreview: calcDaoBase(),
    ending: endingConditions(),
  };
}

/** 主循环：目前只需在自由模式下停掉强制轮回（由 breakthrough 判断） */
export function tickReincarnation() { /* 暂无每帧逻辑 */ }
