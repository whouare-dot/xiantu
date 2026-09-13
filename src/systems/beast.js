/**
 * 灵兽系统（V3.0「问宗」）。
 *
 * 设计要点：
 *   - 资质（星级）1~5，随机不可改 —— 这是"无尽追求"的来源。1星55% / 2星25% / 3星13% / 4星5% / 5星2%。
 *     星级影响成长系数（每星 +8%）与等级上限（等级上限 = 10 + 星级×10 + 进化阶数×5）。
 *   - 亲密度（0~100）门控技能与协战：技能带 unlockIntimacy，不够则 beastSkills() 不返回；
 *     达标的灵兽还会获得 role 专属的战斗词条（攻伐=追击 / 镇守=反震 / 辅助=汲取）。
 *   - 进化：改名、属性跃升、解锁新技能、等级上限提升；消耗灵材，材料不足则拒绝。
 *   - 孵化走**绝对时间戳**（照 cave.js 的建筑升级），关掉游戏也照常推进，由 tickBeasts 结算。
 *
 * 状态契约（core/state.js 的 state.beasts，形状已冻结，不得增删字段）：
 *   { owned: [{ uid, baseId, star, level, exp, intimacy, stage, name }], active: uid|null,
 *     eggs: [{ uid, baseId, hatchAt }], nextUid }
 *
 * 纯逻辑，禁止任何 DOM 操作；随机一律走 core/rng.js。
 */

import {
  state, hasMaterials, consumeMaterials, addMaterial,
} from '../core/state.js';
import { emit, EV } from '../core/bus.js';
import { chance, weightedPick } from '../core/rng.js';
import {
  BEASTS, BEAST_SKILLS, beastById, evolutionDepth, ROLE_NAMES,
  hatchableBeasts, hatchCostOf,
} from '../data/beasts.js';
import {
  beastMult, levelCapBonus, captureBonus, hatchMult, initIntimacy, initLevel,
  levelOf, BLOOD_LEVELS,
} from './bloodline.js';
import { eventBonus } from './worldEvent.js';
import { sectBonus } from './sect.js';

// ==================== 常量 ====================

/** 星级概率：1星 55% / 2星 25% / 3星 13% / 4星 5% / 5星 2% */
export const STAR_WEIGHTS = [
  { star: 1, weight: 55 },
  { star: 2, weight: 25 },
  { star: 3, weight: 13 },
  { star: 4, weight: 5 },
  { star: 5, weight: 2 },
];

/** 每高一星，属性成长 +8% */
export const STAR_BONUS = 0.08;

/** 亲密度上限 */
export const MAX_INTIMACY = 100;

/** 亲密度自然增长：出战灵兽每这么多秒 +1 点 */
const INTIMACY_SECONDS_PER_POINT = 600;

/** 各定位的暴击基准（灵兽不走功法流派，暴击由定位决定） */
const ROLE_CRIT = { attack: 0.08, tank: 0.03, support: 0.05 };

/** 放生返还的灵材（按 tier 取），数量 = 星级 */
const RELEASE_MAT = {
  1: 'mat_shougu', 2: 'mat_yaoxue', 3: 'mat_yaodan', 4: 'mat_neidan', 5: 'mat_neidan',
};

/** 捕捉基础成功率：遇敌之后并非必然入册，留出"错过"的遗憾感 */
const TAME_CHANCE = 0.45;

/**
 * 一场战斗给灵兽的经验 = 该灵兽**当前等级**所需经验 × 这个比例。
 *
 * 锚定在 expToNext 而不是给个固定值：expToNext 随等级按 Lv^1.4 增长，
 * 固定值会让后期一级要打几百场。锚定之后每级恒定约 1/0.08 ≈ 12.5 场，
 * 于是"养满一只 5★（60 级）"≈ 740 场战斗 —— 灵兽不跨世保留（见 reincarnation.js），
 * 这个量级刚好让一世之内养得起一只主战灵兽，又不至于随手就满。
 * 宗门灵兽园的 beastPct 在此之上乘算，让那座建筑真的有产出。
 */
export const BEAST_EXP_PER_BATTLE = 0.08;

function log(text, cls = 'event-special', channel = 'system') {
  emit(EV.LOG, { text, cls, channel });
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ==================== 懒初始化 ====================

/**
 * 兼容旧存档：beasts 字段由 state.js 的 createInitialState 提供，
 * 读档时 save.js 的 mergeDefaults 会补齐整个对象；这里只做内部兜底。
 */
function ensureBeasts() {
  const b = state.beasts || (state.beasts = {});
  b.owned = b.owned || [];
  b.eggs = b.eggs || [];
  if (b.active === undefined) b.active = null;
  b.nextUid = b.nextUid || 1;
  for (const inst of b.owned) {
    inst.stage = inst.stage ?? 0;
    inst.intimacy = clamp(inst.intimacy ?? 0, 0, MAX_INTIMACY);
    inst.exp = inst.exp ?? 0;
    inst.level = Math.max(1, inst.level ?? 1);
    inst.star = clamp(inst.star ?? 1, 1, 5);
  }
  return b;
}

// ==================== 星级与实例 ====================

/**
 * 掷星级资质：1~5 星，概率递减。
 * @param {number} [maxStar=5] 该物种的资质上限（starCap.max），超出则重新落到上限内
 */
export function rollStar(maxStar = 5) {
  const cap = clamp(Math.floor(maxStar || 5), 1, 5);
  const pool = STAR_WEIGHTS.filter((s) => s.star <= cap);
  const got = weightedPick(pool) || pool[pool.length - 1];
  return got.star;
}

/**
 * 等级上限 = 10 + 星级×10 + 形态阶数×5 + 血脉加成
 * （1星20级 / 5星60级；进化后阶数提升，上限随之提高；
 *   该物种血脉达「相知」再 +5，见 systems/bloodline.js）
 */
export function levelCap(inst) {
  const star = clamp(inst?.star ?? 1, 1, 5);
  const stage = Math.max(0, inst?.stage ?? 0);
  const blood = inst?.baseId ? levelCapBonus(inst.baseId) : 0;
  return 10 + star * 10 + stage * 5 + blood;
}

/** 升到下一级所需经验（等级越高越慢） */
export function expToNext(level) {
  const lv = Math.max(1, Math.floor(level || 1));
  return Math.floor(30 * Math.pow(lv, 1.4));
}

/**
 * 生成灵兽实例（默认不入册）。
 * opts: { star, level, intimacy, add }
 *   - star 未指定时按该物种的 starCap.max 掷资质
 */
export function createBeast(baseId, opts = {}) {
  ensureBeasts();
  const base = beastById(baseId);
  if (!base) return null;

  const cap = base.starCap?.max ?? 5;
  const star = opts.star != null ? clamp(Math.floor(opts.star), 1, cap) : rollStar(cap);
  // stage = 形态阶数（进化链上的位置）。野生捕获的高阶形态同样按阶数计，
  // 这样"阶"既表示血脉成熟度，也让等级上限随形态自然提升。
  const stage = evolutionDepth(baseId);
  const maxLv = levelCap({ star, stage, baseId });

  // 血脉记忆：该物种前世养到过「相知」/「共鸣」，这一世再遇时起点更高。
  // 必须用 opts 显式覆盖优先——孵化/宝库等调用方若指定了等级，那是它们的决定。
  const bloodLevel = opts.level != null ? null : initLevel(baseId);
  const level = clamp(Math.floor(opts.level ?? bloodLevel ?? 1), 1, maxLv);
  const bloodInti = initIntimacy(baseId);

  const inst = {
    uid: state.beasts.nextUid++,
    baseId,
    star,
    level,
    exp: 0,
    intimacy: clamp(Math.round((opts.intimacy ?? 0) + bloodInti), 0, MAX_INTIMACY),
    stage,
    name: base.name,
  };
  if (opts.add) state.beasts.owned.push(inst);
  return inst;
}

/** 生成并入册，返回实例 */
export function addBeast(baseId, opts = {}) {
  const inst = createBeast(baseId, { ...opts, add: true });
  if (!inst) return null;
  const base = beastById(baseId);
  emit(EV.ITEM_GAIN, { kind: 'beast', uid: inst.uid, baseId, star: inst.star });
  log(`收服【${base.name}】${'★'.repeat(inst.star)}`, 'event-special');
  return inst;
}

/** 取全部已拥有的实例（副本引用，可直接改状态） */
export function ownedBeasts() {
  ensureBeasts();
  return state.beasts.owned;
}

export function findBeast(uid) {
  ensureBeasts();
  return state.beasts.owned.find((b) => b.uid === uid) || null;
}

// ==================== 属性结算 ====================

/**
 * 该实例在当前等级 / 星级 / 进化阶下的完整战斗属性。
 * @returns {{name,role,level,star,stage,hp,maxHp,mp,maxMp,atk,def,spd,crit,critDmg,intimacy,levelCap,expNeed,exp}}
 */
export function beastStats(inst) {
  if (!inst) return null;
  const base = beastById(inst.baseId);
  if (!base) return null;

  const star = clamp(inst.star ?? 1, 1, 5);
  const stage = Math.max(0, inst.stage ?? 0);
  const level = Math.max(1, inst.level ?? 1);
  // 每星 +8%；再乘血脉倍率（全局共鸣 × 该物种是否已觉醒，见 bloodline.js）
  const starPart = 1 + (star - 1) * STAR_BONUS;
  const bloodPart = beastMult(inst.baseId);
  const starMul = starPart * bloodPart;
  const lv = level - 1;
  const g = base.growth || {};
  const bs = base.base || {};

  const maxHp = Math.max(1, Math.round((bs.hp + (g.hp || 0) * lv) * starMul));
  const atk = Math.max(1, Math.round((bs.atk + (g.atk || 0) * lv) * starMul));
  const def = Math.max(0, Math.round((bs.def + (g.def || 0) * lv) * starMul));
  const spd = Math.max(1, Math.round((bs.spd + (g.spd || 0) * lv) * starMul));

  const critBase = ROLE_CRIT[base.role] ?? 0.05;
  const crit = clamp(critBase + (star - 1) * 0.012, 0, 0.5);

  return {
    name: inst.name || base.name,
    role: base.role,
    roleName: ROLE_NAMES[base.role] || '灵兽',
    level, star, stage,
    // 灵兽不吃丹药、不修灵力，mp 恒为 0；保留字段是为了与战斗单位形状对齐
    hp: maxHp, maxHp,
    mp: 0, maxMp: 0,
    atk, def, spd,
    crit, critDmg: 1.5,
    // 加成来源明细：血脉是 V5.0 新增的乘算，玩家看到属性涨了却不知道涨在哪，
    // 所以把这三个因子摊开交给 UI（与修炼速率/突破率同一套做法）
    multParts: {
      star: starPart,          // 资质：每星 +8%
      blood: bloodPart,        // 血脉：全局共鸣 × 觉醒
      total: starMul,
    },
    intimacy: Math.round(inst.intimacy ?? 0),
    levelCap: levelCap(inst),
    exp: Math.floor(inst.exp ?? 0),
    expNeed: expToNext(level),
    tier: base.tier,
  };
}

// ==================== 技能与亲密度门控 ====================

/**
 * 已解锁技能：受亲密度（unlockIntimacy）与进化阶（unlockStage）双重门控。
 * 返回技能定义数组（来自 BEAST_SKILLS，含 unlockStage / unlockIntimacy / desc）。
 */
export function beastSkills(inst) {
  if (!inst) return [];
  const base = beastById(inst.baseId);
  if (!base) return [];
  const intimacy = inst.intimacy ?? 0;
  const stage = Math.max(0, inst.stage ?? 0);
  const out = [];
  for (const sk of base.skills || []) {
    const def = BEAST_SKILLS[sk.id] || sk;
    if ((def.unlockStage ?? 0) > stage) continue;
    if ((def.unlockIntimacy ?? 0) > intimacy) continue;
    out.push(def);
  }
  return out;
}

/** 该实例的全部技能（含未解锁），供详情页展示"未解锁"灰行 */
export function allBeastSkills(inst) {
  if (!inst) return [];
  const base = beastById(inst.baseId);
  if (!base) return [];
  return (base.skills || []).map((sk) => BEAST_SKILLS[sk.id] || sk);
}

// ==================== 出战 ====================

/** 出战（uid 传 null 表示召回） */
export function setActive(uid) {
  ensureBeasts();
  if (uid == null) {
    state.beasts.active = null;
    return { ok: true, active: null };
  }
  const inst = findBeast(uid);
  if (!inst) return { ok: false, reason: '没有这只灵兽' };
  state.beasts.active = uid;
  const base = beastById(inst.baseId);
  log(`【${inst.name || base?.name}】随你同行。`, 'event-good');
  emit(EV.STATE_DIRTY, { kind: 'beast:active', uid });
  return { ok: true, active: uid };
}

/** 当前出战实例（无则 null） */
export function activeBeast() {
  ensureBeasts();
  if (state.beasts.active == null) return null;
  return findBeast(state.beasts.active);
}

// ==================== 养成：经验与亲密度 ====================

/**
 * 增加经验并结算升级（受等级上限约束，超出部分丢弃）。
 * @returns {{ok:boolean, level:number, levelUps:number, capped:boolean, reason?:string}}
 */
export function gainExp(uid, amount) {
  const inst = findBeast(uid);
  if (!inst) return { ok: false, level: 0, levelUps: 0, capped: false, reason: '没有这只灵兽' };
  const amt = Math.max(0, Math.floor(amount || 0));
  if (amt === 0) return { ok: true, level: inst.level, levelUps: 0, capped: false };

  const cap = levelCap(inst);
  inst.exp = Math.max(0, Math.floor(inst.exp ?? 0)) + amt;
  let ups = 0;
  while (inst.level < cap && inst.exp >= expToNext(inst.level)) {
    inst.exp -= expToNext(inst.level);
    inst.level++;
    ups++;
  }
  const capped = inst.level >= cap;
  if (capped) inst.exp = 0;   // 满级不再囤经验，避免"练满后一进化连跳数级"

  if (ups > 0) {
    const base = beastById(inst.baseId);
    log(`【${inst.name || base?.name}】升至 ${inst.level} 级`, 'event-good');
    emit(EV.STATE_DIRTY, { kind: 'beast:levelup', uid, level: inst.level });
  }
  return { ok: true, level: inst.level, levelUps: ups, capped };
}

/**
 * 灵兽养成速度乘区：宗门建筑「灵兽园」每级 +12%（sectBonus().beastPct）。
 * 与修炼速率、突破率同一套做法 —— 把来源摊开算，而不是散在各处乘一遍。
 */
export function beastExpMult() {
  try { return 1 + (sectBonus().beastPct || 0); } catch { return 1; }
}

/**
 * 战斗胜利后给**出战**灵兽发经验。由 combat.js 的 autoResolve 在唯一结算咽喉处调用。
 *
 * 只发出战的那一只：灵兽要跟着你打才长进，这也让"带谁出战"成为一个真实取舍。
 * @returns {{uid:number, amount:number, level:number, levelUps:number, capped:boolean}|null}
 */
export function grantBattleExp() {
  const inst = activeBeast();
  if (!inst) return null;
  const amt = Math.max(1, Math.round(expToNext(inst.level) * BEAST_EXP_PER_BATTLE * beastExpMult()));
  const r = gainExp(inst.uid, amt);
  return { uid: inst.uid, amount: amt, level: r.level, levelUps: r.levelUps, capped: r.capped };
}

/** 亲密度增减，夹取到 0~100 */
export function addIntimacy(uid, n) {
  const inst = findBeast(uid);
  if (!inst) return { ok: false, intimacy: 0, reason: '没有这只灵兽' };
  const before = inst.intimacy ?? 0;
  inst.intimacy = clamp(before + (n || 0), 0, MAX_INTIMACY);
  return { ok: true, before, intimacy: inst.intimacy, changed: inst.intimacy !== before };
}

/** 亲密度文案（供 UI 统一口径） */
export function intimacyText(inst) {
  const v = Math.floor(inst?.intimacy ?? 0);
  if (v >= 90) return '生死相托';
  if (v >= 70) return '形影不离';
  if (v >= 50) return '心意相通';
  if (v >= 30) return '渐生默契';
  if (v >= 10) return '稍稍亲近';
  return '初识';
}

// ==================== 进化 ====================

/**
 * 是否可进化。
 * @returns {{ok:boolean, reason:string, cost:Array|null, to:string|null, toName:string|null, level:number}}
 */
export function canEvolve(uid) {
  const inst = findBeast(uid);
  const fail = (reason, cost = null, to = null, toName = null) => ({
    ok: false, reason, cost, to, toName, level: inst?.level ?? 0,
  });
  if (!inst) return fail('没有这只灵兽');

  const base = beastById(inst.baseId);
  if (!base) return fail('灵兽数据缺失');
  if (!base.evolveTo) return fail('此兽已至最终形态，再无进境');
  if (inst.level < (base.evolveLevel || 0)) {
    return fail(`需培育至 ${base.evolveLevel} 级方可进化`, base.evolveCost || [], base.evolveTo, beastById(base.evolveTo)?.name || null);
  }
  const cost = base.evolveCost || [];
  if (!hasMaterials(cost)) {
    const need = cost.map((c) => `${matName(c.id)}×${c.count}`).join('、');
    return fail(`灵材不足：需 ${need}`, cost, base.evolveTo, beastById(base.evolveTo)?.name || null);
  }
  return { ok: true, reason: '', cost, to: base.evolveTo, toName: beastById(base.evolveTo)?.name || null, level: inst.level };
}

/**
 * 进化：扣材料 → 改名 → 属性跃升（新形态 base 更高）→ 解锁新技能 → 等级上限提升。
 * 星级与亲密度原样继承（资质不可改）。
 */
export function evolve(uid) {
  const r = canEvolve(uid);
  if (!r.ok) return r;

  const inst = findBeast(uid);
  const fromBase = beastById(inst.baseId);
  const toBase = beastById(r.to);
  if (!consumeMaterials(r.cost)) return { ok: false, reason: '灵材不足', cost: r.cost };

  const beforeStats = beastStats(inst);
  const beforeSkills = new Set(beastSkills(inst).map((s) => s.id));

  inst.baseId = toBase.id;
  inst.stage = evolutionDepth(toBase.id);   // 形态阶数随进化提升 → 等级上限随之提高
  inst.name = toBase.name;
  // 等级上限提升后，经验条重新可用（此前满级清零过）
  inst.level = Math.min(inst.level, levelCap(inst));

  const afterStats = beastStats(inst);
  const newSkills = beastSkills(inst).filter((s) => !beforeSkills.has(s.id));

  log(`【${fromBase.name}】蜕变为【${toBase.name}】！`, 'event-special');
  if (newSkills.length) log(`觉醒新神通：${newSkills.map((s) => `「${s.name}」`).join('、')}`, 'event-special');
  emit(EV.STATE_DIRTY, { kind: 'beast:evolve', uid, from: fromBase.id, to: toBase.id });

  return {
    ok: true,
    from: fromBase, to: toBase,
    before: beforeStats, after: afterStats,
    newSkills,
    stage: inst.stage,
  };
}

/** 放生：返还部分灵材，出战中的会一并召回 */
export function releaseBeast(uid) {
  ensureBeasts();
  const idx = state.beasts.owned.findIndex((b) => b.uid === uid);
  if (idx < 0) return { ok: false, reason: '没有这只灵兽' };
  const inst = state.beasts.owned[idx];
  const base = beastById(inst.baseId);
  if (state.beasts.active === uid) state.beasts.active = null;

  state.beasts.owned.splice(idx, 1);

  const matId = RELEASE_MAT[base?.tier || 1] || 'mat_shougu';
  const count = Math.max(1, inst.star || 1);
  addMaterial(matId, count);
  log(`放【${inst.name || base?.name}】归山，得 ${matName(matId)}×${count}`, 'event-special', 'system');

  return { ok: true, materials: [{ id: matId, count }], beast: inst };
}

function matName(id) {
  // 只用于日志文案，不引入 materials.js 以避免无谓耦合
  const NAMES = {
    mat_shougu: '兽骨', mat_yaoxue: '妖血', mat_yaodan: '妖丹', mat_neidan: '内丹',
  };
  return NAMES[id] || id;
}

// ==================== 孵化（绝对时间戳，离线推进） ====================

/**
 * 产下一枚灵兽蛋。计时用绝对时间戳，关掉游戏也照常推进。
 * 材料消耗由调用方负责（宗门宝库 / 探险 / 奇遇），这里只负责计时。
 * @param {string} baseId 孵化出的灵兽 id
 * @param {number} seconds 孵化时长（秒）
 * @returns {{uid:number, baseId:string, hatchAt:number}|null}
 */
export function layEgg(baseId, seconds) {
  ensureBeasts();
  const base = beastById(baseId);
  if (!base) return null;
  // 血脉记忆：养过同族的，蛋也孵得更快（「你知道它需要什么」）
  const sec = Math.max(0, Math.floor((seconds || 0) * hatchMult(baseId)));
  const egg = {
    uid: state.beasts.nextUid++,
    baseId,
    hatchAt: Date.now() + sec * 1000,
  };
  state.beasts.eggs.push(egg);
  log(`得【${base.name}】之蛋一枚，需孵 ${fmtDurationText(sec)}`, 'event-special');
  return egg;
}

function fmtDurationText(sec) {
  const m = Math.round(sec / 60);
  if (m >= 60) return `${Math.floor(m / 60)} 时辰`;
  return `${m} 分`;
}

/** 蛋状态（供 UI 渲染，remaining 每秒变，只走 refresh） */
export function eggStatus() {
  ensureBeasts();
  const now = Date.now();
  return state.beasts.eggs.map((egg) => {
    const base = beastById(egg.baseId);
    return {
      uid: egg.uid,
      baseId: egg.baseId,
      name: base?.name || egg.baseId,
      tier: base?.tier || 1,
      hatchAt: egg.hatchAt,
      remaining: Math.max(0, Math.ceil((egg.hatchAt - now) / 1000)),
      ready: now >= egg.hatchAt,
    };
  });
}

/** 直接孵化一枚蛋（内部使用），返回新实例 */
function hatchEgg(egg) {
  const base = beastById(egg.baseId);
  const inst = createBeast(egg.baseId, { add: true });
  if (!inst) return null;
  emit(EV.ITEM_GAIN, { kind: 'beast', uid: inst.uid, baseId: egg.baseId, star: inst.star, from: 'egg' });
  log(`灵兽蛋孵化，得【${base?.name || egg.baseId}】${'★'.repeat(inst.star)}`, 'event-special');
  return inst;
}

/**
 * 主循环 / 离线结算调用。
 *   - 孵化到期的蛋（绝对时间戳比较，离线也会推进）
 *   - 出战灵兽的亲密度自然增长
 * @returns {{hatched:Array, intimacy:number}}
 */
export function tickBeasts(dt) {
  ensureBeasts();
  const now = Date.now();
  const hatched = [];

  const eggs = state.beasts.eggs;
  for (let i = eggs.length - 1; i >= 0; i--) {
    const egg = eggs[i];
    if (egg.hatchAt <= now) {
      const inst = hatchEgg(egg);
      eggs.splice(i, 1);
      if (inst) hatched.push(inst);
    }
  }

  // 亲密度自然增长：只有出战的灵兽会随陪伴慢慢亲近主人
  let grown = 0;
  const act = activeBeast();
  if (act && dt > 0) {
    const before = act.intimacy ?? 0;
    if (before < MAX_INTIMACY) {
      act.intimacy = clamp(before + dt / INTIMACY_SECONDS_PER_POINT, 0, MAX_INTIMACY);
      grown = act.intimacy - before;
    }
  }

  return { hatched, intimacy: grown };
}

// ==================== 战斗接口（与 combat.js 对齐） ====================

/**
 * 【关键】把灵兽实例转成 combat.js 可用的战斗单位。
 *
 * 返回字段与 combat.js 的 buildPlayerSide() 一一对应（name/side/hp/maxHp/mp/maxMp/
 * atk/def/spd/crit/critDmg/affixes），额外多两个字段：
 *   - id     形如 'bst_<uid>'，供战报区分个体（对齐 buildEnemySide 的 id）
 *   - skills 已解锁技能，供战斗层驱动灵兽行动（buildEnemySide 也有此字段）
 * 与玩家侧唯一刻意的差异是 side='beast'，让战斗层能把灵兽当成独立单位处理。
 *
 * 亲密度达标的协战词条（沿用 combat.js 已有的 affix 语义，无需改动战斗层）：
 *   - 攻伐 · 亲密度 ≥ 60：extra_strike 追击（玩家攻击后补刀）
 *   - 镇守 · 亲密度 ≥ 40：reflect 护体反震
 *   - 辅助 · 亲密度 ≥ 50：lifesteal 汲取生机
 */
export function beastBattleSide(inst) {
  if (!inst) return null;
  const st = beastStats(inst);
  if (!st) return null;

  const affixes = [];
  const inti = st.intimacy;
  if (st.role === 'attack' && inti >= 60) {
    affixes.push({ kind: 'extra_strike', value: 0.15 + (inti - 60) / 400, name: '追击' });
  } else if (st.role === 'tank' && inti >= 40) {
    affixes.push({ kind: 'reflect', value: 0.06 + inti / 1000, name: '护体反震' });
  } else if (st.role === 'support' && inti >= 50) {
    affixes.push({ kind: 'lifesteal', value: 0.1 + inti / 500, name: '汲取生机' });
  }

  return {
    name: st.name,
    side: 'beast',
    hp: st.maxHp,
    maxHp: st.maxHp,
    mp: st.maxMp,
    maxMp: st.maxMp,
    atk: st.atk,
    def: st.def,
    spd: st.spd,
    crit: st.crit,
    critDmg: st.critDmg,
    affixes,
    // ---- 以下为对齐 buildEnemySide 的扩展字段 ----
    id: `bst_${inst.uid}`,
    skills: beastSkills(inst),
  };
}

/** 出战灵兽的战斗单位；无出战返回 null */
export function activeBeastBattleSide() {
  const inst = activeBeast();
  return inst ? beastBattleSide(inst) : null;
}

// ==================== 捕捉 ====================

/** 境界索引 → 灵兽 tier（与 enemies.js 的分档对齐，保证与同档敌人强度可比） */
export function realmTier(realmIndex = state.player.realmIndex) {
  const i = Math.max(0, realmIndex|0);
  if (i <= 8) return 1;
  if (i <= 11) return 2;
  if (i <= 14) return 3;
  if (i <= 17) return 4;
  return 5;
}

/**
 * 在境界适配的灵兽池里抽一只候选（不实际捕捉）。
 * 权重偏向当前档位，偶尔也能遇到低档的。
 * @returns {{id:string, base:Object}|null}
 */
export function rollTameCandidate(realmIndex = state.player.realmIndex) {
  const tier = realmTier(realmIndex);
  const pool = BEASTS.filter((b) => b.tier <= tier && b.minRealm <= realmIndex);
  if (pool.length === 0) return null;
  const got = weightedPick(pool, (b) => {
    const gap = tier - b.tier;
    return gap === 0 ? 6 : gap === 1 ? 3 : 1;
  });
  return got ? { id: got.id, base: got } : null;
}

/**
 * 【关键】随机遇敌时可能捕捉到的灵兽。
 * 不是必然成功：先抽候选，再掷一次入册概率。成功则已入册并返回实例，失败返回 null。
 * 需要区分"没遇到"和"遇到了没抓住"时用 attemptTame。
 * @returns {Object|null} 灵兽实例
 */
export function tameBeast(realmIndex = state.player.realmIndex) {
  return attemptTame(realmIndex).inst;
}

/**
 * 完整的一次收服尝试，把"遇到"与"抓住"两段都交出来。
 *
 * 探险 / 奇遇需要写出"遇见了但没抓住"的文案（那才是捕捉的遗憾感所在），
 * 所以不能只返回成功与否。tameBeast 保留为薄封装以兼容旧调用。
 * @returns {{cand:Object|null, inst:Object|null}}
 */
export function attemptTame(realmIndex = state.player.realmIndex) {
  const cand = rollTameCandidate(realmIndex);
  if (!cand) return { cand: null, inst: null };
  // 血脉记忆：养过同族的，再遇时更容易收服（Lv1 起 +15%）
  // 天象「秘境开启」的 beastTameRate（+30%）也在这里兑现 —— 它此前只被 UI 显示，
  // 没有任何系统消费，等于一条空头承诺。
  const rate = Math.min(0.95, TAME_CHANCE + captureBonus(cand.id) + (eventBonus('beastTameRate') || 0));
  if (!chance(rate)) return { cand, inst: null };
  const inst = addBeast(cand.id);
  if (inst) emit(EV.STATE_DIRTY, { kind: 'beast:tame', uid: inst.uid, baseId: inst.baseId });
  return { cand, inst };
}

// ==================== 灵材孵化（主动消耗灵材，见 data/beasts.js 的 HATCH_COST） ====================

/** 孵化消耗；不可孵化返回 null */
export function hatchCost(baseId) {
  return hatchCostOf(baseId);
}

/** 能否以灵材孵化该物种 @returns {{ok, reason, cost}} */
export function canHatch(baseId) {
  const base = beastById(baseId);
  const cost = hatchCostOf(baseId);
  if (!base || !cost) return { ok: false, reason: '此兽无卵可孵', cost: null };
  if (!hasMaterials([{ id: cost.id, count: cost.count }])) {
    return { ok: false, reason: `灵材不足：需 ${matName(cost.id)}×${cost.count}`, cost };
  }
  return { ok: true, reason: '', cost };
}

/**
 * 以灵材孵一只蛋：扣材料 → 入蛋（绝对时间戳，离线照常孵化）。
 * @returns {{ok:boolean, reason:string, cost:Object|null, egg:Object|null}}
 */
export function hatchByMaterial(baseId) {
  const r = canHatch(baseId);
  if (!r.ok) return { ok: false, reason: r.reason, cost: r.cost, egg: null };
  // 先扣材料再入蛋：材料不足时 consumeMaterials 返回 false，绝不能让蛋凭空出现
  if (!consumeMaterials([{ id: r.cost.id, count: r.cost.count }])) {
    return { ok: false, reason: '灵材不足', cost: r.cost, egg: null };
  }
  const egg = layEgg(baseId, r.cost.seconds);
  return { ok: !!egg, reason: egg ? '' : '此兽无卵可孵', cost: r.cost, egg };
}

/** 孵化页数据：可孵化的物种 + 消耗 + 当前是否够料（按 tier 排序） */
export function hatchableSummary() {
  return hatchableBeasts()
    .slice()
    .sort((a, b) => a.tier - b.tier || a.id.localeCompare(b.id))
    .map((b) => {
      const chk = canHatch(b.id);
      return {
        id: b.id, name: b.name, tier: b.tier,
        role: b.role, roleName: ROLE_NAMES[b.role] || '灵兽',
        desc: b.desc || '',
        cost: chk.cost,
        canHatch: chk.ok,
        reason: chk.reason,
      };
    });
}

// ==================== UI 汇总 ====================

/** 已拥有灵兽的渲染数据（结构稳定，数值走 refresh） */
export function beastSummary() {
  ensureBeasts();
  return state.beasts.owned.map((inst) => {
    const base = beastById(inst.baseId);
    const st = beastStats(inst);
    return {
      uid: inst.uid,
      baseId: inst.baseId,
      name: inst.name || base?.name || inst.baseId,
      tier: base?.tier || 1,
      role: base?.role || 'attack',
      roleName: ROLE_NAMES[base?.role] || '灵兽',
      star: inst.star,
      stage: inst.stage ?? 0,
      level: st?.level ?? 1,
      levelCap: st?.levelCap ?? 20,
      exp: st?.exp ?? 0,
      expNeed: st?.expNeed ?? 1,
      intimacy: Math.floor(inst.intimacy ?? 0),
      intimacyText: intimacyText(inst),
      active: state.beasts.active === inst.uid,
      stats: st,
      skills: beastSkills(inst),
      allSkills: allBeastSkills(inst),
      canEvolve: canEvolve(inst.uid),
      evolveTo: base?.evolveTo ? beastById(base.evolveTo) : null,
      evolveLevel: base?.evolveLevel ?? 0,
      desc: base?.desc || '',
      lore: base?.lore || '',
      // 血脉共鸣等级（0 表示这一族与你尚无因缘）
      bloodLevel: levelOf(inst.baseId),
      bloodName: BLOOD_LEVELS[levelOf(inst.baseId) - 1]?.name || '',
    };
  });
}

/** 图鉴：全部灵兽的收集进度（已拥有 = 已收录） */
export function beastCollection() {
  ensureBeasts();
  // 收录口径：当前拥有的 + 正在孵化的。放生会移出图鉴——口径诚实，不做假收录。
  const got = new Set(state.beasts.owned.map((b) => b.baseId));
  for (const egg of state.beasts.eggs) got.add(egg.baseId);
  const list = BEASTS.map((b) => ({ base: b, got: got.has(b.id) }));
  return {
    list,
    discovered: list.filter((x) => x.got).length,
    total: list.length,
    byTier: [1, 2, 3, 4, 5].map((t) => {
      const arr = list.filter((x) => x.base.tier === t);
      return { tier: t, got: arr.filter((x) => x.got).length, total: arr.length };
    }),
  };
}

/** 是否有可出战的灵兽 */
export function hasBeast() {
  ensureBeasts();
  return state.beasts.owned.length > 0;
}
