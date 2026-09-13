/**
 * 道侣系统 —— V4.0 的跨世情感锚点。
 *
 * 这个系统存在的理由只有一条：**羁绊跨轮回保留**。
 *   转世之后道侣不记得你，但你记得她；重复结缘会解锁只有多世才能看到的内容。
 *   所以本模块对 state.companions（met / bond / active / stories）**只读写、不清空**，
 *   轮回时的保留与清空规则由 systems/reincarnation.js 独占，这里一概不碰。
 *
 * 设计约束：
 *   - 基调是「同行」，不是「攻略」；本模块不产生任何争宠 / 审判类状态。
 *   - 双修加成走**已有系统的加成通道**（cultPct / atkPct / defPct / hpPct /
 *     comprehensionAdd / luckAdd / daoHeartAdd），不新开一套数值体系。
 *   - 专属剧情的效果走 systems/encounter.js 已有的 DSL，不另写解释器。
 *   - 纯逻辑，禁止 DOM；随机一律走 core/rng.js（本模块目前不掷随机）。
 */

import { state, realmAt } from '../core/state.js';
import { emit, EV } from '../core/bus.js';
import { COMPANIONS, companionById, companionMeetFlag } from '../data/companions.js';
import { applyEffects } from './encounter.js';
import { fmt } from '../core/format.js';

/** 羁绊上限 */
export const BOND_MAX = 100;
/** 初次结识赠送的羁绊 */
export const BOND_INIT = 5;
/** 立为道侣者：每 2 分钟自然 +1（挂机友好） */
export const ACTIVE_BOND_PER_SEC = 1 / 120;
/** 已结识但未立为道侣者：每 15 分钟自然 +1（很慢，只是让羁绊不会停在原地） */
export const MET_BOND_PER_SEC = 1 / 900;
/** 每段剧情读完的基础羁绊（数据里可用 gain 覆盖） */
const STORY_GAIN = 8;
/** echo 段落的节点 id（内部标识） */
const ECHO_ID = 'echo';

/** 自然增长的余数累加器：只把整数写进 state，避免存档里出现 12.3333 这种值 */
const _bondFrac = new Map();

const CHANNEL = 'system';

function log(text, cls) {
  emit(EV.LOG, { text, cls: cls || 'event-special', channel: CHANNEL });
}

/** 兜底：旧存档 / 测试里手工构造的 state 可能缺字段（契约已在 core/state.js 冻结） */
function cs() {
  let c = state.companions;
  if (!c || typeof c !== 'object') {
    c = { met: [], bond: {}, active: null, stories: {} };
    state.companions = c;
  }
  if (!Array.isArray(c.met)) c.met = [];
  if (!c.bond || typeof c.bond !== 'object') c.bond = {};
  if (!c.stories || typeof c.stories !== 'object') c.stories = {};
  if (c.active === undefined) c.active = null;
  return c;
}

function readStories(id) {
  const arr = cs().stories[id];
  return Array.isArray(arr) ? arr : [];
}

function reincarnationCount() {
  return state.reincarnation?.count ?? 0;
}

// ==================== 结识 ====================

/**
 * 结识一位道侣。
 * 专属奇遇结算后，DSL 的 flag 会写入 cmp_met_<id>；tickCompanions 会把它同步进来。
 * @param {string} id
 * @param {{force?:boolean, silent?:boolean}} opts force 跳过境界门槛（测试 / 剧情推进用）
 */
export function meet(id, opts = {}) {
  const c = companionById(id);
  if (!c) return { ok: false, reason: '查无此人' };

  const s = cs();
  // 幂等只看 met 数组，不能看 isMet——isMet 还会认专属奇遇的 flag，
  // 若用 isMet 判断，flag 一旦写入，meet 会直接返回 already，met 永远补不上。
  if (s.met.includes(id)) return { ok: true, already: true, companion: c };

  // 专属奇遇已经发生过（flag 在案）时，跳过境界门槛
  const viaFlag = !!(state.flags && state.flags[companionMeetFlag(id)]);
  const needRealm = c.metAt?.realm ?? 0;
  if (!opts.force && !viaFlag && state.player.realmIndex < needRealm) {
    return { ok: false, reason: `需修行至【${realmAt(needRealm).name}】之后，方可与她相遇` };
  }

  s.met.push(id);
  // V6.0 功课：本世结识道侣人数。
  // ⚠ 只能计数，不能拿 met.length 当进度源——met 跨世保留，老兵会把功课直接秒过。
  state.stats.companionMeets = (state.stats.companionMeets || 0) + 1;
  // 用 ??：0 是合法的羁绊值，不能被当作缺失（架构规范 §6 的同一条教训）
  s.bond[id] = s.bond[id] ?? BOND_INIT;
  s.stories[id] = readStories(id);

  if (!opts.silent) {
    log(`【道侣】你结识了 ${c.name}——${c.title}。${c.personality}`, 'event-special');
  }
  emit('companion:meet', { id });
  return { ok: true, companion: c };
}

/**
 * 是否已结识。
 * 同时认 state.companions.met 与专属奇遇的 flag，保证奇遇一结算就立刻生效。
 */
export function isMet(id) {
  const s = cs();
  if (s.met.includes(id)) return true;
  const flag = companionMeetFlag(id);
  return !!(state.flags && state.flags[flag]);
}

export function bondOf(id) {
  return cs().bond[id] ?? 0;
}

// ==================== 羁绊 ====================

/**
 * 增减羁绊，上限 100，下限 0。
 * @returns {number} 变化后的羁绊值
 */
export function addBond(id, n) {
  if (!Number.isFinite(n) || n === 0) return bondOf(id);
  const s = cs();
  const before = s.bond[id] ?? 0;
  const next = Math.max(0, Math.min(BOND_MAX, before + n));
  s.bond[id] = next;
  return next;
}

// ==================== 立为道侣 ====================

/**
 * 立为当前道侣。传 null 表示暂且独行（不清羁绊、不清剧情）。
 * 双修加成只由**当前道侣**提供——这是"同行"而不是"收集"的数值表达。
 */
export function setActive(id) {
  const s = cs();
  if (id == null) {
    s.active = null;
    return { ok: true, active: null };
  }
  if (!isMet(id)) return { ok: false, reason: '尚未与她相识' };
  if (s.active === id) return { ok: true, already: true };

  s.active = id;
  const c = companionById(id);
  log(`你与 ${c?.name || id} 结为道侣。此后长路，有人同行。`, 'event-special');
  emit('companion:active', { id });
  return { ok: true, active: id };
}

/** 当前道侣定义；未立或数据缺失返回 null */
export function activeCompanion() {
  const id = cs().active;
  if (!id || !isMet(id)) return null;
  return companionById(id);
}

// ==================== 剧情 ====================

/**
 * 当前羁绊下「下一段」可推进的剧情节点。
 * 返回的节点带 unlocked / need，供 UI 显示"还差多少"。
 * 全部读完或尚未结识返回 null。
 */
export function availableStory(id) {
  if (!isMet(id)) return null;
  const c = companionById(id);
  if (!c) return null;

  const done = readStories(id);
  const node = (c.story || []).find((n) => !done.includes(n.id));
  if (!node) return null;

  const bond = bondOf(id);
  return {
    ...node,
    unlocked: bond >= node.bond,
    need: Math.max(0, node.bond - bond),
    gain: node.gain ?? STORY_GAIN,
  };
}

/**
 * 推进一段剧情（发羁绊）。
 *
 * @param {string} id       道侣 id
 * @param {string} storyId  剧情节点 id；跨世重逢固定传 'echo'
 * @returns {{ok:boolean, reason?:string, node?:object, echo?:boolean, bond?:number, logs?:Array}}
 *
 * 说明：不达标的拒绝会明确给出"还差多少"，UI 直接展示即可——
 * 不要写"条件不足"这种让人猜的提示。
 */
export function readStory(id, storyId) {
  const c = companionById(id);
  if (!c) return { ok: false, reason: '查无此人' };
  if (!isMet(id)) return { ok: false, reason: '尚未与她相识' };

  const done = readStories(id);
  if (done.includes(storyId)) return { ok: false, reason: '这段往事，你已经记下了' };

  const isEcho = storyId === ECHO_ID;
  const node = isEcho ? c.echo : (c.story || []).find((n) => n.id === storyId);
  if (!node) return { ok: false, reason: '此处无此段故事' };

  // 跨世重逢：只读 state.reincarnation.count，绝不写轮回状态
  if (isEcho) {
    const need = node.minGen ?? 1;
    const count = reincarnationCount();
    if (count < need) {
      return { ok: false, reason: `需历经 ${need} 世轮回（当前第 ${count + 1} 世）` };
    }
  } else {
    const bond = bondOf(id);
    if (bond < node.bond) {
      return { ok: false, reason: `羁绊不足，还差 ${node.bond - bond} 点` };
    }
  }

  // 剧情附带的奖励走 encounter.js 已有的效果 DSL（attr / pill / material / …），
  // 不在这里新写解释器。
  const logs = [];
  if (Array.isArray(node.effects) && node.effects.length) {
    const eff = applyEffects(node.effects, { minRealm: state.player.realmIndex });
    for (const l of eff.logs || []) {
      log(l.text, l.cls);
      logs.push(l);
    }
  }

  const gain = node.gain ?? (isEcho ? 10 : STORY_GAIN);
  const after = addBond(id, gain);
  cs().stories[id] = [...done, storyId];

  log(`【${c.name}】${node.title}（羁绊 +${gain}）`, isEcho ? 'event-special' : 'event-good');
  emit('companion:story', { id, storyId, echo: isEcho, bond: after });

  return { ok: true, node, echo: isEcho, bond: after, gained: gain, logs };
}

/**
 * 当前轮回世数下可触发的跨世重逢。
 * 条件：已结识 && state.reincarnation.count >= echo.minGen && 尚未读过。
 * 不满足返回 null（轮回次数不足时不返回）。
 */
export function echoFor(id) {
  if (!isMet(id)) return null;
  const c = companionById(id);
  if (!c?.echo) return null;
  if (reincarnationCount() < (c.echo.minGen ?? 1)) return null;
  if (readStories(id).includes(ECHO_ID)) return null;

  return {
    ...c.echo,
    id: ECHO_ID,
    name: c.name,
    bond: c.echo.bond ?? 10,
    gain: c.echo.bond ?? 10,
    unlocked: true,
  };
}

// ==================== 加成汇总 ====================

/**
 * 按 kind 汇总羁绊加成，供其它系统调用。
 *
 * 只统计**当前道侣**已达成的分档：一个 kind 可能出现多档（如洛七的
 * comprehensionAdd 在 20 与 100 各有一档），此处相加。
 * 未立道侣时返回 0——加成是"双修"的，人不在身边就不作数。
 *
 * @param {'cultPct'|'atkPct'|'defPct'|'hpPct'|'comprehensionAdd'|'luckAdd'|'daoHeartAdd'} kind
 * @returns {number}
 */
export function companionBonus(kind) {
  const c = activeCompanion();
  if (!c || !kind) return 0;
  const bond = bondOf(c.id);
  let sum = 0;
  for (const tier of c.bondBonus || []) {
    if (tier.kind === kind && bond >= tier.bond) sum += tier.value;
  }
  return sum;
}

/** 某位道侣当前已达成的全部分档加成（UI 展示用） */
function reachedTiers(c, bond) {
  return (c.bondBonus || []).filter((t) => bond >= t.bond);
}

/** 已经达到、但尚未翻开的分档提示（UI 用来提示"她的心意到了"） */
function pendingTierHint(c, bond) {
  const next = (c.bondBonus || []).find((t) => bond < t.bond);
  return next ? { bond: next.bond, desc: next.desc } : null;
}

// ==================== UI 汇总 ====================

/** 面板用的总览数据（纯数据，不含 DOM） */
export function companionsSummary() {
  const s = cs();
  const list = COMPANIONS.map((c) => {
    const met = isMet(c.id);
    const bond = met ? bondOf(c.id) : 0;
    const done = readStories(c.id);
    return {
      id: c.id,
      name: met ? c.name : '？？？',
      title: met ? c.title : '未曾相识',
      // 未结识不剧透：性格 / 背景一律留空
      personality: met ? c.personality : '',
      desc: met ? c.desc : '',
      lore: met ? c.lore : '',
      met,
      active: s.active === c.id && met,
      bond,
      tiers: met ? reachedTiers(c, bond) : [],
      nextTier: met ? pendingTierHint(c, bond) : null,
      storyDone: done.filter((x) => x !== ECHO_ID).length,
      storyTotal: (c.story || []).length,
      next: met ? availableStory(c.id) : null,
      echoReady: !!echoFor(c.id),
      echoDone: done.includes(ECHO_ID),
      echo: c.echo ? { minGen: c.echo.minGen, title: c.echo.title } : null,
      meetAt: { realm: c.metAt?.realm ?? 0, via: c.metAt?.via ?? 'event' },
      // 未结识时才给结识条件，用于 UI 显示"还差什么"
      meetRealmName: realmAt(c.metAt?.realm ?? 0).name,
      canMeetNow: !met && state.player.realmIndex >= (c.metAt?.realm ?? 0),
    };
  });

  const metList = list.filter((x) => x.met);
  const total = metList.reduce((a, x) => a + x.bond, 0);
  const active = metList.find((x) => x.active) || null;

  return {
    active: active ? { id: active.id, name: active.name, title: active.title, bond: active.bond } : null,
    metCount: metList.length,
    totalBond: total,
    list,
  };
}

// ==================== 主循环 ====================

/**
 * 每秒调用：同步奇遇 flag、推进羁绊的自然增长。
 * @param {number} dt 秒
 * @returns {number} 本次实际新增的羁绊点数（累加）
 */
export function tickCompanions(dt) {
  if (!Number.isFinite(dt) || dt <= 0) return 0;

  // 1) 专属奇遇结算后 flag 落库 → 同步为"已结识"
  for (const c of COMPANIONS) {
    const flag = companionMeetFlag(c.id);
    if (!cs().met.includes(c.id) && state.flags && state.flags[flag]) {
      meet(c.id, { silent: true });
    }
  }

  // 2) 羁绊自然增长（挂机友好：缓慢，但一直在走）
  let gained = 0;
  const s = cs();
  for (const c of COMPANIONS) {
    if (!isMet(c.id)) continue;
    if ((s.bond[c.id] ?? 0) >= BOND_MAX) continue;

    const rate = s.active === c.id ? ACTIVE_BOND_PER_SEC : MET_BOND_PER_SEC;
    const acc = (_bondFrac.get(c.id) || 0) + rate * dt;
    const whole = Math.floor(acc);
    _bondFrac.set(c.id, acc - whole);
    if (whole > 0) {
      addBond(c.id, whole);
      gained += whole;
    }
  }
  return gained;
}

// ==================== 展示小工具 ====================

/** 当前道侣加成的可读摘要，形如「修炼 +5% · 气血上限 +8%」 */
export function activeBonusText() {
  const c = activeCompanion();
  if (!c) return '';
  const bond = bondOf(c.id);
  const parts = [];
  for (const t of c.bondBonus || []) {
    if (bond < t.bond) continue;
    parts.push(KIND_TEXT[t.kind] ? KIND_TEXT[t.kind](t.value) : `${t.kind} ${t.value}`);
  }
  return parts.join(' · ');
}

const KIND_TEXT = {
  cultPct: (v) => `修炼 +${Math.round(v * 100)}%`,
  atkPct: (v) => `攻击 +${Math.round(v * 100)}%`,
  defPct: (v) => `防御 +${Math.round(v * 100)}%`,
  hpPct: (v) => `气血上限 +${Math.round(v * 100)}%`,
  comprehensionAdd: (v) => `悟性 +${fmt(v)}`,
  luckAdd: (v) => `气运 +${fmt(v)}`,
  daoHeartAdd: (v) => `道心 +${fmt(v)}`,
};
