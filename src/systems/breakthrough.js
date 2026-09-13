/**
 * 突破与天劫。
 *
 * 设计原则（来自 tools/balance_report.md 的结论）：
 *   "投入换确定性"，而不是"赌脸卡死"。
 *
 *   模拟显示：若突破失败清空修为，白板玩家总时长会从 8.08 天膨胀到 26.36 天，
 *   后期会从"挂机变强"退化成"反复赌概率"。因此本模块做了三件事：
 *     1. 失败只损失 25% 修为，不清零。
 *     2. 连续失败累积保底（每次 +8%，上限 +40%）。
 *     3. 悟性与道心都能实打实提高成功率，玩家有明确的"变强就能过"的路径。
 *
 * 天劫：大境界关口（筑基/金丹/元婴/化神/炼虚/合体/大乘/渡劫）触发三轮判定，
 *   失败不跌落境界（对休闲向游戏太残酷），而是"重伤"——气血大损 + 修为损失 + 限时修炼减速。
 */

import {
  state, realm, realmAt, nextRealm, isMaxRealm, needsTribulation, segmentName,
  addStones, spendStones, pillCount, consumePill, addPill,
} from '../core/state.js';
import {
  calcCultSpeed, calcDef, calcMaxHp, calcMaxMp, calcDaoHeart, calcComprehension,
  calcLuck, buffBonus, addBuff, buildingLevel,
} from './cultivation.js';
import { breakthroughPillFor } from '../data/pills.js';
import { tribulationDiffMult } from './stance.js';
import { executeReincarnation, inFreeMode, memoryBonus, calcDaoBase } from './reincarnation.js';
import { dutySatisfied, dutySummary } from './duty.js';
import { talentBonus } from './talent.js';
import { rand, chance } from '../core/rng.js';
import { emit, EV } from '../core/bus.js';
import { fmt, fmtPct } from '../core/format.js';
// 修为扣减不走 gainCult，这里是显式的诊断埋点（见 core/telemetry.js 的说明）
import { noteCultLoss, noteBreak, noteTrib } from '../core/telemetry.js';

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// 天劫三轮
const TRIBULATION_ROUNDS = [
  { id: 'thunder', name: '雷劫',  desc: '乌云压顶，紫电裂空而下，天地之威直落头顶' },
  { id: 'fire',    name: '火劫',  desc: '业火自丹田而起，焚身灼骨，直烧神魂' },
  { id: 'demon',   name: '心魔劫', desc: '心魔化形而出，是你此生最不愿面对的那张脸' },
];

export const TRIBULATION_ROUND_COUNT = TRIBULATION_ROUNDS.length;

// ==================== 成功率 ====================

/**
 * 突破成功率明细。
 * 最终 = 境界基础 + 丹药 + 悟性 + 道心 + 保底 + 临时buff，夹在 5%~100%。
 *
 * 注意上限是 100% 而不是 95%：境界表里 breakChance 为 1.0 的是"必定成功"
 * （炼气期教学段），若按 95% 截断会让新手第一次突破就有 5% 概率失败，
 * 与数据表的意图直接矛盾。投入足够的玩家也应当能真正做到稳过。
 */
export function breakChanceBreakdown() {
  const r = realm();
  const base = r.breakChance ?? 1;

  // 必定成功的境界直接短路：不再叠加任何修正，界面也不必展示无意义的加项
  if (base >= 1) {
    return { total: 1, parts: [{ label: '境界基础', value: 1, kind: 'base' }] };
  }

  const parts = [];
  let total = base;
  parts.push({ label: '境界基础', value: base, kind: 'base' });

  // 突破丹药（该境界必需）
  const bp = breakthroughPillFor(state.player.realmIndex);
  let pillBonus = 0;
  if (bp) {
    pillBonus = bp.effect.bonus || 0;
    parts.push({ label: bp.name, value: pillBonus, kind: 'pill' });
  }

  // 悟性：每点超过 10 的部分 +0.4%，上限 +15%
  const comp = calcComprehension();
  const compBonus = clamp((comp - 10) * 0.004, 0, 0.15);
  if (compBonus > 0) parts.push({ label: '悟性 ' + fmt(comp), value: compBonus, kind: 'attr' });

  // 道心：每点超过 10 的部分 +0.5%，上限 +15%
  const dao = calcDaoHeart();
  const daoBonus = clamp((dao - 10) * 0.005, 0, 0.15);
  if (daoBonus > 0) parts.push({ label: '道心 ' + fmt(dao), value: daoBonus, kind: 'attr' });

  // 气运：轻微影响
  const luckBonus = clamp((calcLuck() - 50) * 0.0008, -0.04, 0.04);
  if (luckBonus !== 0) parts.push({ label: '气运 ' + fmt(calcLuck()), value: luckBonus, kind: 'attr' });

  // 连败保底
  const fails = state.player.breakFails || 0;
  const pity = Math.min(fails * 0.08, 0.40);
  if (pity > 0) parts.push({ label: `连续失败 ${fails} 次·保底`, value: pity, kind: 'pity' });

  // 临时 buff（静心丹等）
  // 天赋的突破加成（「大道功成」这类主线也在这里体现）
  const tal = talentBonus('breakAdd');
  if (tal) parts.push({ label: '天赋 · 道途', value: tal, kind: 'talent' });

  const buff = buffBonus('breakthrough');
  if (buff) parts.push({ label: '丹药·静心', value: buff, kind: 'buff' });

  total = total + pillBonus + compBonus + daoBonus + luckBonus + pity + buff + (talentBonus('breakAdd') || 0);
  return { total: clamp(total, 0.05, 1), parts };
}

export function calcBreakChance() {
  return breakChanceBreakdown().total;
}

// ==================== 前置检查 ====================

export function canBreakthrough() {
  const r = realm();
  if (isMaxRealm() || r.needCult == null) {
    return { ok: false, reason: '已至巅峰，再无路可进' };
  }
  if (state.player.cult < r.needCult) {
    return { ok: false, reason: `修为不足，还需 ${fmt(r.needCult - state.player.cult)}` };
  }
  const bp = breakthroughPillFor(state.player.realmIndex);
  if (bp && pillCount(bp.id) <= 0) {
    return { ok: false, reason: `缺少${bp.name}，无法引动天地之机` };
  }
  return { ok: true, reason: '' };
}

// ==================== 突破尝试 ====================

/**
 * 尝试突破。若该境界是"大境界关口"，不直接判定成败，
 * 而是转入天劫流程（返回 { tribulation: true }）。
 */
export function attemptBreakthrough() {
  const check = canBreakthrough();
  if (!check.ok) {
    log(check.reason, 'event-bad');
    return { ok: false, reason: check.reason };
  }

  const r = realm();
  const bp = breakthroughPillFor(state.player.realmIndex);
  if (bp) consumePill(bp.id, 1);

  // 大境界关口 → 天劫
  if (needsTribulation(state.player.realmIndex)) {
    return startTribulation();
  }

  return resolveBreakthroughRoll();
}

/** 普通境界的突破判定 */
function resolveBreakthroughRoll() {
  const r = realm();
  const p = calcBreakChance();
  const roll = rand();

  if (roll < p) {
    const prevFails = state.player.breakFails || 0;
    applyBreakthroughSuccess();
    noteBreak({ success: true, chance: p, failStreak: prevFails });
    return { ok: true, success: true, chance: p };
  }
  applyBreakthroughFailure();
  noteBreak({ success: false, chance: p, failStreak: state.player.breakFails || 0 });
  return { ok: true, success: false, chance: p };
}

/** 突破时把境界带来的寿元增量加到 player.lifespan 上（绝对值的单一数据源） */
function grantLifespanGain(fromRealm, toRealm) {
  const gain = Math.max(0, (toRealm.lifespan || 0) - (fromRealm.lifespan || 0));
  if (gain <= 0) return;
  const cur = state.player.lifespan ?? fromRealm.lifespan;
  state.player.lifespan = cur + gain;
  log(`寿元增加 ${fmt(gain)} 载。`, 'event-good', 'cultivate');
}


/**
 * 飞升检查 —— V4.0 的核心机制：**飞升即强制轮回**。
 *
 * 玩家不能赖在仙界，必须把这一世的成果转化为下一世的资本。
 * 唯一例外是已达成真结局后的自由模式：那时轮回变成可选。
 *
 * 必须在所有奖励结算完成之后、且作为函数最后一步调用——
 * executeReincarnation 会 setState 整体替换状态对象，
 * 之后再碰任何旧引用都是在改一个已经被丢弃的对象。
 */
function checkAscension() {
  if (!isMaxRealm()) return false;
  if (inFreeMode()) {
    log('你已看破这一重天。如今是去是留，由你自己定。', 'event-special', 'cultivate');
    return false;
  }

  // V6.0 功课：本世功课未全部了结，不可飞升。
  // 这道门槛是"每一世成为独立一章"的支点——没有它，功课就只是个可选任务。
  if (!dutySatisfied()) {
    const sum = dutySummary();
    const names = sum.blocked;
    const head = names.slice(0, 4).join('、');
    const more = names.length > 4 ? ` 等 ${names.length} 项` : '';
    log(
      `天门不开。本世功课未了——尚差${head}${more}。详列于「轮回」页。`,
      'event-bad', 'cultivate',
    );
    return false;
  }

  log('═══ 白 日 飞 升 ═══', 'event-breakthrough', 'cultivate');
  log('云海裂开，天门洞开。你踏出最后一步——然后发现，门后仍是天。', 'event-special', 'cultivate');

  // 演出的数据必须在 executeReincarnation **之前**抓——
  // 那一步会整体重建 state，之后再读就只剩"炼气一层"的新档了。
  const summary = captureAscensionSummary();

  const r = executeReincarnation();

  // 事件放在轮回之后再发：此时 state 已是新的一世，
  // 而演出用的是刚抓下来的快照，两边互不干扰。
  if (r && r.ok) emit(EV.ASCEND, { summary });
  return true;
}

/** 抓一份"刚结束的这一世"的结算快照，供飞升演出展示 */
function captureAscensionSummary() {
  const rc = state.reincarnation || {};
  const gen = (rc.count || 0) + 1;   // 尚未自增，故 +1
  const sum = dutySummary();

  // 本世时长 = 现在 − 上一次轮回的时刻。
  // ⚠ 不能用 meta.totalPlaytime——那是**整个存档的累计在线时长**，跨世不清，
  // 拿它当"在世多久"会越到后面越离谱（第 5 世会显示成五世总和）。
  const history = rc.history || [];
  const startedAt = history.length
    ? history[history.length - 1].at
    : (state.meta?.createdAt || null);
  const livedSeconds = startedAt ? Math.max(0, (Date.now() - startedAt) / 1000) : 0;

  return {
    gen,
    realmName: realm().name,
    dutyName: sum.mode === 'full'
      ? `八幕 ${sum.mainTotal} 门功课`
      : (sum.flat.map((x) => x.name).join('、') || '无'),
    // 用 calcDaoBase() 而不是另算一遍：executeReincarnation 内部调的就是它，
    // 同一个出处才不会出现"演出说 +40、实际到账 +38"这种对不上的事。
    daoGained: '+' + calcDaoBase().total,
    days: livedSeconds > 60 ? fmtDays(livedSeconds) : null,
  };
}

/** 秒 → "N 天" / "N 时辰"，只用于展示，不参与计算 */
function fmtDays(seconds) {
  const days = seconds / 86400;
  if (days >= 1) return days.toFixed(1) + ' 天';
  const hours = seconds / 3600;
  if (hours >= 1) return hours.toFixed(1) + ' 时辰';
  return Math.max(1, Math.round(seconds / 60)) + ' 分';
}

/**
 * 广播一次破关（V5.0 突破分层）。
 *
 * 三个层级各有各的呈现，判断在这里做完再交给 UI——
 * 让 UI 自己拿境界数据去比 segment，等于把业务规则写进了渲染层。
 *   - 小境界（同大境内进阶）：轻提示
 *   - 大境界（跨大境）：一段短演出
 *   - 天劫关口：另有一整套天劫流程，这里只标出来
 */
function emitRealmBreak() {
  const idx = state.player.realmIndex;
  const major = idx > 0 && realmAt(idx).segment !== realmAt(idx - 1).segment;
  emit(EV.REALM_BREAK, {
    realmIndex: idx,
    major,
    tribulation: needsTribulation(idx),
    segmentName: segmentName(idx),
  });
}

function applyBreakthroughSuccess() {
  const r = realm();
  const fromName = r.name;

  noteCultLoss('突破消耗', Math.min(state.player.cult, r.needCult));
  state.player.cult = Math.max(0, state.player.cult - r.needCult);
  state.player.realmIndex++;
  state.player.breakFails = 0;
  state.stats.breakthroughs = (state.stats.breakthroughs || 0) + 1;
  grantLifespanGain(r, realm());

  // 气血灵力回满
  state.player.maxHp = calcMaxHp();
  state.player.hp = state.player.maxHp;
  state.player.maxMp = calcMaxMp();
  state.player.mp = state.player.maxMp;

  const nr = realm();
  log(`─── 破 关 ───`, 'event-breakthrough', 'cultivate');
  log(`自【${fromName}】踏入【${nr.name}】。${nr.desc}`, 'event-breakthrough', 'cultivate');

  // 气运小幅增长 + 突破奖励
  state.player.base.luck = clamp(state.player.base.luck + 2, 1, 100);
  const reward = Math.floor(realmAt(state.player.realmIndex).baseSpeed * 90);
  addStones(reward);
  log(`破关奖励：灵石 +${fmt(reward)}，气运 +2。`, 'event-good', 'cultivate');

  emitRealmBreak();

  // 飞升是最后一步：轮回会替换整个状态，之后再无本世可言
  if (checkAscension()) return;
}

function applyBreakthroughFailure() {
  const r = realm();
  // 只损失 25%，不清零 —— 这是配平报告明确要求的设计
  const loss = Math.floor(r.needCult * 0.25);
  noteCultLoss('突破失败', Math.min(state.player.cult, loss));
  state.player.cult = Math.max(0, state.player.cult - loss);
  state.player.breakFails = (state.player.breakFails || 0) + 1;

  log('─── 冲关失败 ───', 'event-bad', 'cultivate');
  log(
    `气机溃散，修为损失 ${fmt(loss)}（${fmtPct(0.25)}）。` +
    `道心未损，下次成功率 +${Math.min(state.player.breakFails * 8, 40)}%。`,
    'event-bad', 'cultivate',
  );

  emit(EV.REALM_FAIL, { loss, fails: state.player.breakFails });
}

// ==================== 天劫 ====================

/**
 * 三劫各有侧重，不是同一道题考三遍。
 * 这样玩家在渡劫前才有真正的取舍：堆防御过得了雷劫，却未必扛得住心魔劫。
 */
const ROUND_WEIGHTS = {
  thunder: { dao: 0.5, def: 1.0, hp: 0.5, name: '护体' },   // 雷劫：外劫，看护体与法宝
  fire:    { dao: 0.6, def: 0.4, hp: 1.0, name: '气血' },   // 火劫：内劫，看气血底蕴
  demon:   { dao: 1.5, def: 0.2, hp: 0.4, name: '道心' },   // 心魔劫：心劫，只看道心
};

/**
 * 玩家的抗劫值。
 * @param {string|null} roundId 传三劫之一的 id 时按该劫的侧重加权；不传则用均衡权重
 */
export function resilience(roundId = null) {
  const w = ROUND_WEIGHTS[roundId] || { dao: 1, def: 1, hp: 1 };
  const dao = calcDaoHeart();
  const def = calcDef();
  const maxHp = calcMaxHp();
  const ward = buildingLevel('bld_ward');
  const buff = buffBonus('tribulation');

  const vDao = dao * w.dao;
  const vDef = Math.floor(def / 10) * w.def;
  const vHp = Math.floor(maxHp / 200) * w.hp;
  const vWard = ward * 5;

  const value = Math.round(vDao + vDef + vHp + vWard + buff);
  return {
    value,
    round: roundId,
    focus: w.name || '均衡',
    parts: [
      { label: `道心 ×${w.dao}`, value: Math.round(vDao) },
      { label: `护体 ×${w.def}`, value: Math.round(vDef) },
      { label: `气血 ×${w.hp}`, value: Math.round(vHp) },
      { label: '护山大阵', value: vWard },
      ...(buff ? [{ label: '丹药护持', value: buff }] : []),
    ],
  };
}

/**
 * 本境界天劫难度。
 * 邪道在此额外受罚 —— 这是它最主要的代价：
 * 修炼与战斗的即时收益，要用"渡劫更难"这个延迟风险来换。
 */
export function tribulationDifficulty() {
  const base = 10 + Math.max(0, state.player.realmIndex - 9) * 7;
  // 天赋的「天劫抗性」直接降低威压（「大道功成」的代价会给负值）
  const resist = talentBonus('tribulationResist') || 0;
  return Math.round(base * tribulationDiffMult() * (1 - resist));
}

/**
 * 单轮通过率。
 * @param {string|null} roundId 三劫之一的 id；不传则按均衡抗劫值估算（用于开劫前的预估展示）
 */
export function roundPassChance(roundId = null) {
  const res = resilience(roundId).value;
  const diff = tribulationDifficulty();
  return clamp(0.5 + (res - diff) * 0.015, 0.15, 0.95);
}

/** 三劫各自通过率，供 UI 提前示警"你哪一劫最危险" */
export function roundChances() {
  return TRIBULATION_ROUNDS.map((r) => ({
    id: r.id,
    name: r.name,
    chance: roundPassChance(r.id),
    focus: ROUND_WEIGHTS[r.id]?.name || '',
  }));
}

export function startTribulation() {
  const rounds = TRIBULATION_ROUNDS.map((r) => ({
    id: r.id, name: r.name, desc: r.desc, resolved: false, passed: null, damage: 0,
  }));
  state.tribulation = {
    targetRealm: state.player.realmIndex + 1,
    rounds,
    current: 0,
    hpStart: state.player.hp,
    passedCount: 0,
    failed: false,
  };
  const chances = roundChances();
  const weakest = chances.reduce((a, b) => (b.chance < a.chance ? b : a));
  log('═══ 天 劫 将 至 ═══', 'event-tribulation', 'cultivate');
  log(
    `三劫轮转，生死一线。天劫威压 ${tribulationDifficulty()}。` +
    `雷劫 ${fmtPct(chances[0].chance)} · 火劫 ${fmtPct(chances[1].chance)} · 心魔劫 ${fmtPct(chances[2].chance)}。`,
    'event-tribulation', 'cultivate',
  );
  if (weakest.chance < 0.5) {
    log(`你最薄弱的是【${weakest.name}】——它考校的是${weakest.focus}。`, 'event-bad', 'cultivate');
  }
  emit(EV.TRIBULATION_START, { chances });
  return { ok: true, tribulation: true, chance: chances[2].chance, chances };
}

/**
 * 结算一轮天劫。
 * @param {boolean} useHealPill 是否在开轮前服用疗伤丹
 */
export function resolveTribulationRound(useHealPill = false) {
  const t = state.tribulation;
  if (!t || t.failed || t.current >= t.rounds.length) {
    return { done: true, failed: t?.failed ?? false };
  }

  // 开轮前服药
  if (useHealPill) {
    if (consumePill('pill_liaoshang', 1)) {
      const maxHp = calcMaxHp();
      const heal = Math.floor(maxHp * 0.45);
      state.player.hp = Math.min(maxHp, state.player.hp + heal);
      log(`服下疗伤丹，气血回复 ${fmt(heal)}。`, 'event-good', 'cultivate');
    } else if (consumePill('pill_huiqi', 1)) {
      const maxHp = calcMaxHp();
      const heal = Math.floor(maxHp * 0.2);
      state.player.hp = Math.min(maxHp, state.player.hp + heal);
      log(`仓促服下回气丹，气血回复 ${fmt(heal)}。`, 'event-good', 'cultivate');
    }
  }

  const round = t.rounds[t.current];
  const p = roundPassChance(round.id);
  const ok = chance(p);
  const maxHp = calcMaxHp();

  round.resolved = true;
  round.passed = ok;

  if (ok) {
    t.passedCount++;
    log(`【${round.name}】${round.desc}——你稳住了。`, 'event-tribulation', 'cultivate');
  } else {
    const dmg = Math.floor(maxHp * (0.18 + rand() * 0.14));
    state.player.hp = Math.max(0, state.player.hp - dmg);
    round.damage = dmg;
    log(`【${round.name}】天威加身，气血 -${fmt(dmg)}。`, 'event-tribulation', 'cultivate');
  }

  t.current++;

  // 气血耗尽 → 天劫失败
  if (state.player.hp <= 0) {
    t.failed = true;
    return finishTribulation(false);
  }
  if (t.current >= t.rounds.length) {
    return finishTribulation(true);
  }
  return { done: false, round: { ...round }, chance: p, hp: state.player.hp };
}

function finishTribulation(passed) {
  const t = state.tribulation;
  const r = realm();

  // 放在最前面：成功分支后面会把 state.tribulation 置空，那时就读不到轮次了
  noteTrib({
    passed,
    roundsTotal: t?.rounds?.length ?? null,
    roundsReached: t?.current ?? null,
  });

  if (passed) {
    state.stats.tribulationsPassed = (state.stats.tribulationsPassed || 0) + 1;
    t.failed = false;
    log('═══ 天 劫 已 渡 ═══', 'event-tribulation', 'cultivate');
    // 渡劫成功即突破
    noteCultLoss('突破消耗', Math.min(state.player.cult, r.needCult));
    state.player.cult = Math.max(0, state.player.cult - r.needCult);
    state.player.realmIndex++;
    state.player.breakFails = 0;
    state.stats.breakthroughs = (state.stats.breakthroughs || 0) + 1;
    grantLifespanGain(r, realm());

    state.player.maxHp = calcMaxHp();
    state.player.hp = state.player.maxHp;
    state.player.maxMp = calcMaxMp();
    state.player.mp = state.player.maxMp;

    const nr = realm();
    log(`劫云散尽，你已踏入【${nr.name}】。${nr.desc}`, 'event-breakthrough', 'cultivate');
    state.player.base.luck = clamp(state.player.base.luck + 4, 1, 100);
    const reward = Math.floor(nr.baseSpeed * 240);
    addStones(reward);
    log(`渡劫之赏：灵石 +${fmt(reward)}，气运 +4。`, 'event-good', 'cultivate');

    state.tribulation = null;
    emit(EV.TRIBULATION_END, { passed: true, realmIndex: state.player.realmIndex });
    emitRealmBreak();
    if (checkAscension()) return { done: true, passed: true, reincarnated: true };
    return { done: true, failed: false, passed: true };
  }

  // 失败：重伤，但不跌落境界（对休闲向游戏太残酷）
  state.player.hp = Math.max(1, Math.floor(calcMaxHp() * 0.2));
  const loss = Math.floor(state.player.cult * 0.3);
  noteCultLoss('天劫失败', loss);
  state.player.cult = Math.max(0, state.player.cult - loss);
  state.player.base.daoHeart = Math.max(1, state.player.base.daoHeart - 2);
  state.player.breakFails = (state.player.breakFails || 0) + 1;

  // 重伤：限时修炼减速
  addBuff({
    id: 'buff_injured', name: '重伤', stat: 'cult', mult: 0.7, duration: 600,
  });

  log('═══ 天 劫 未 渡 ═══', 'event-tribulation', 'cultivate');
  log(
    `你被天威击落，气血仅存 ${fmtPct(0.2)}，修为损失 ${fmt(loss)}，道心 -2。` +
    `接下来 10 分钟修炼速度降低 30%。`,
    'event-bad', 'cultivate',
  );
  log(`所幸道基未毁，修养之后仍可再来。连败保底已累积。`, 'event-special', 'cultivate');

  state.tribulation = null;
  emit(EV.TRIBULATION_END, { passed: false });
  emit(EV.REALM_FAIL, { loss, fails: state.player.breakFails });
  return { done: true, failed: true, passed: false };
}

/** 一次性跑完天劫（UI 想直接看结果时用） */
export function runTribulation({ autoHeal = true } = {}) {
  const results = [];
  let guard = 0;
  while (state.tribulation && !state.tribulation.failed && guard++ < 10) {
    const t = state.tribulation;
    const needHeal = autoHeal && state.player.hp < calcMaxHp() * 0.4;
    const r = resolveTribulationRound(needHeal);
    results.push(r);
    if (r.done) break;
  }
  return results;
}

/** 天劫是否正在进行 */
export function inTribulation() {
  return !!state.tribulation;
}

// ==================== 自动突破 ====================

/**
 * 自动突破。修复了 demo 版的两个致命问题：
 *   1. demo 的条件写死 `breakChance >= 0.95`，而 12 级后没有任何境界满足，功能永不触发。
 *   2. demo 的 while 循环里 realm 引用未更新，跨境界时修为扣减错误。
 * 这里改为：每 tick 检查一次，达标就突破一次，然后重新取 realm。
 */
export function shouldAutoBreakthrough() {
  if (!state.meta.autoBreakthrough) return false;
  if (isMaxRealm()) return false;
  const r = realm();
  if (r.needCult == null) return false;
  if (state.player.cult < r.needCult) return false;

  // 需要突破丹时，必须手里有
  const bp = breakthroughPillFor(state.player.realmIndex);
  if (bp && pillCount(bp.id) <= 0) return false;

  // 成功率太低时不动手，等保底或等丹药（阈值可调）
  const threshold = state.meta.autoBreakThreshold ?? 0.55;
  if (calcBreakChance() < threshold) return false;

  // 天劫进行中不自动
  if (inTribulation()) return false;

  return true;
}

export function setAutoBreakthrough(on) {
  state.meta.autoBreakthrough = !!on;
  log(on ? '已开启自动突破。' : '已关闭自动突破。', 'event-special', 'cultivate');
}

export function setAutoBreakThreshold(v) {
  state.meta.autoBreakThreshold = clamp(v, 0.05, 0.95);
}

/** 主循环调用 */
export function tick(dt) {
  // 世业补口：已在最高境、但当年被劫数拦下的玩家，了结之后必须能自动飞升。
  //
  // 没有这一段就会**永久卡在最高境**：突破到 25 时 checkAscension 被劫数拦下，
  // 而 25 已是最高境，此后再没有"下一次突破"去触发飞升检查——
  // 玩家做完了劫数也走不掉。这不是理论风险，是本项目 test_duty 实测抓出来的。
  //
  // 只在 satisfied 时才调 checkAscension，所以不会每帧刷"天门不开"的日志。
  if (isMaxRealm() && !inFreeMode() && dutySatisfied()) {
    return checkAscension();
  }

  if (!shouldAutoBreakthrough()) return false;
  const check = canBreakthrough();
  if (!check.ok) return false;

  // 天劫关口不自动闯，交给玩家手动（这是情绪峰值，不该被跳过的）
  if (needsTribulation(state.player.realmIndex)) {
    if (!state.flags.tribulationNotified) {
      state.flags.tribulationNotified = true;
      log('修为已足，天劫将至。此事需你亲自应对。', 'event-tribulation', 'cultivate');
    }
    return false;
  }
  state.flags.tribulationNotified = false;
  attemptBreakthrough();
  return true;
}

function log(text, cls, channel = 'cultivate') {
  emit(EV.LOG, { text, cls, channel });
}
