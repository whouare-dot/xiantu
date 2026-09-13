/**
 * 宗门系统（V3.0「问宗」）。
 *
 * 职责：
 *   - 拜入 / 叛出宗门（校验境界、立场、冷却、好感）
 *   - 贡献获取与职位晋升
 *   - 宗门宝库兑换（按职位分层）
 *   - 宗门建筑升级（绝对时间戳，离线照常推进）
 *   - 每日任务的轮换、进度与结算
 *   - 周制宗门战（异步与 AI 对战，文字战报）
 *
 * 纯逻辑，禁止任何 DOM 操作。
 *
 * ======================== 贡献稀缺性核算（写死在这里，改数据请重算） ========================
 *
 * 每日任务池共 15 条，每日轮换 5 条。取贡献最高的 5 条：
 *   60 + 60 + 60 + 55 + 55 = 290（贪心上限；随机一轮的平均 ≈ 5 × 41.7 ≈ 208）
 * 宗门战每周可结算一次，胜方 +300 贡献，折算每日 300 / 7 ≈ 43。
 *   => 一天正常玩法的贡献上限 ≈ 290 + 43 = 333，典型值 ≈ 208 + 43 ≈ 251。
 *
 * 宝库第一层（tier 1，6 件）换空需要：
 *   400 + 450 + 500 + 520 + 600 + 680 = 3150
 *
 * 结论：一天的上限（333）也只够第一层的 10.6%，换空第一层最少需要
 *   3150 / 333 ≈ 9.5 天（按典型收益约 12.5 天）。
 * 第二层 8000、第三层 11400，四五层的宗门专属更在 26000~40000。
 * 贡献必须花在刀刃上——"全都要"在可预见的时间内不可能，这就是稀缺。
 * （tools/test_sect.mjs 里有对应断言，防止后续改数据时把稀缺性改没了。）
 * ====================================================================================
 */

import {
  state, spendStones, addStones, addMaterial, addPill,
  materialCount, pillCount, realmAt, stonesToLow,
} from '../core/state.js';
import { emit, EV } from '../core/bus.js';
import { fmt, fmtDuration } from '../core/format.js';
import {
  SECTS, SECT_RANKS, SECT_BUILDINGS, SECT_VAULT, SECT_QUESTS, RANK_SALARY_MATERIALS,
  sectById, rankOf, vaultById, sectBuildingById, sectQuestById,
} from '../data/sects.js';
import { materialById } from '../data/materials.js';
import { beastById } from '../data/beasts.js';
import { pillById } from '../data/pills.js';
import { equipById } from '../data/equipments.js';
import { alchemyRecipeById, forgeRecipeById } from '../data/recipes.js';
import { techById } from '../data/techniques.js';
import { enemyById } from '../data/enemies.js';
import { calcAtk, calcDef, calcMaxHp } from './cultivation.js';
import { setStance } from './stance.js';
import { addEquipment } from './inventory.js';

// ==================== 参数 ====================

/** 拜入宗门的最低境界：筑基期（realmIndex ≥ 9） */
export const JOIN_REALM = 9;
/** 叛宗后的立场冷却（毫秒）：30 分钟 */
export const BETRAY_COOLDOWN_MS = 30 * 60 * 1000;
/** 每日轮换的任务条数 */
export const DAILY_QUEST_COUNT = 5;
/** 灵兽蛋的离线孵化时长（毫秒） */
export const EGG_HATCH_MS = 2 * 3600 * 1000;
/** 宗门战参数 */
const WAR = {
  winContribution: 300,     // 胜方基础贡献
  loseContribution: 120,    // 败方基础损失（护宗大阵可减免）
  winScore: 100,
  loseScore: 30,
  rankContribution: 40,     // 每高一级职位，胜方多拿的贡献
  stonesPerRank: 4000,      // 胜方灵石 = stonesPerRank × (rank + 1)
  logCap: 6,                // warLog 最多保留几条
};
/** 宗门战胜方按职位发放的灵材 */
const WAR_REWARD_MATERIALS = [
  [{ id: 'mat_lingzhi', count: 20 }],
  [{ id: 'mat_xueshen', count: 15 }],
  [{ id: 'mat_jiuyelian', count: 10 }],
  [{ id: 'mat_longdanhua', count: 6 }],
  [{ id: 'mat_taisuizhi', count: 4 }],
];

// ==================== 通用小工具 ====================

function log(text, cls = 'event-special', channel = 'system') {
  emit(EV.LOG, { text, cls, channel });
}

function pad2(n) { return String(n).padStart(2, '0'); }

/** 本地日期串 YYYY-MM-DD */
export function todayStr(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 本地日序（自 epoch 起的天数），用于每日任务轮换 */
function dayIndex(d = new Date()) {
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.floor(local.getTime() / 86400000);
}

/**
 * 赛季标识：ISO 周，形如 2026-W37。周一为一周之始。
 * 这里不用 core/rng 的随机——它是确定性的日历计算，不消耗随机流，
 * 也不会因为读档重掷（这是"周期"而非"随机"）。
 */
export function seasonOf(d = new Date()) {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (t.getDay() + 6) % 7;          // 0 = 周一
  t.setDate(t.getDate() - day + 3);           // 移到本周四，其所在年即 ISO 年
  const isoYear = t.getFullYear();
  const jan4 = new Date(isoYear, 0, 4);
  const jan4Day = (jan4.getDay() + 6) % 7;
  const week1Mon = new Date(isoYear, 0, 4 - jan4Day);
  const week = Math.floor((t - week1Mon) / 86400000 / 7) + 1;
  return `${isoYear}-W${pad2(week)}`;
}

/** 下次结算时刻：下周一 00:00（本地）的时间戳 */
export function nextSettleTimestamp(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = (d.getDay() + 6) % 7;           // 0 = 周一
  d.setDate(d.getDate() + (7 - day));
  return d.getTime();
}

/** 字符串哈希（FNV-1a），用于生成确定性的 AI 战力 */
function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ==================== 懒初始化（兼容旧存档） ====================

function ensureSect() {
  const s = state.sect;
  if (!s) return;
  s.id = s.id ?? null;
  s.rank = s.rank ?? 0;
  s.contribution = s.contribution ?? 0;
  s.buildings = s.buildings || {};
  s.questDate = s.questDate || '';
  s.questsDone = Array.isArray(s.questsDone) ? s.questsDone : [];
  s.warSeason = s.warSeason || '';
  s.warScore = s.warScore ?? 0;
  s.warLog = Array.isArray(s.warLog) ? s.warLog : [];
  s.betrayCount = s.betrayCount ?? 0;
  s.affinity = s.affinity || {};
  for (const b of Object.values(s.buildings)) {
    if (!b) continue;
    b.level = b.level ?? 0;
    if (b.upgradeEndsAt === undefined) b.upgradeEndsAt = null;
  }
  if (state.player.stanceCooldownUntil === undefined || state.player.stanceCooldownUntil === null) {
    state.player.stanceCooldownUntil = 0;
  }
}

// ==================== 拜入 / 叛出 ====================

/** 是否可拜入某宗门，返回 {ok, reason} */
export function canJoin(sectId) {
  ensureSect();
  const sect = sectById(sectId);
  if (!sect) return { ok: false, reason: '查无此宗' };
  if (state.sect.id) {
    const cur = sectById(state.sect.id);
    return { ok: false, reason: `已拜入${cur?.name || '宗门'}门下` };
  }
  if (state.player.stance === 'xiedao') return { ok: false, reason: '邪道之身，正道宗门不纳' };
  if (state.player.realmIndex < JOIN_REALM) {
    return { ok: false, reason: `需筑基期方可拜师（当前 ${realmAt(state.player.realmIndex).name}）` };
  }
  const now = Date.now();
  const cd = state.player.stanceCooldownUntil || 0;
  if (now < cd) {
    return { ok: false, reason: `立场冷却中（剩 ${fmtDuration(Math.ceil((cd - now) / 1000))}）` };
  }
  if ((state.sect.affinity[sectId] || 0) <= -60) {
    return { ok: false, reason: '此宗对你已生嫌隙，暂不接纳' };
  }
  return { ok: true };
}

/** 拜入宗门。写入 state.sect，并把立场转为正道。 */
export function joinSect(sectId) {
  ensureSect();
  const check = canJoin(sectId);
  if (!check.ok) return check;
  const sect = sectById(sectId);
  const s = state.sect;

  s.id = sectId;
  s.rank = 0;
  s.contribution = 0;
  s.buildings = {};
  s.questDate = todayStr();
  s.questsDone = [];
  s.warSeason = seasonOf();
  s.warScore = 0;
  s.warLog = [];
  s.affinity[sectId] = Math.max(s.affinity[sectId] || 0, 50);

  // 拜入正道宗门即成为正道修士（邪道在 canJoin 已被拒）。
  // 走 setStance 而不是直接赋值：日志、事件广播、冷却判定都在立场系统里统一处理，
  // 直接改字段会绕过它们，导致「立场变了但没有任何反馈」。
  if (state.player.stance === 'sanxiu') setStance('zhengdao', { silent: true });

  log(`拜入【${sect.name}】，自此以${sect.path === 'sword' ? '剑' : sect.path === 'body' ? '身' : '丹'}入道，位列外门`, 'event-special');
  return { ok: true, sect };
}

/**
 * 叛出宗门：贡献清零、该宗好感下降、进入立场冷却，回到散修。
 * 不返还任何已兑换内容（已解锁的功法/丹药/装备保留）。
 */
export function betraySect() {
  ensureSect();
  const s = state.sect;
  if (!s.id) return { ok: false, reason: '本就无宗可叛' };
  const old = sectById(s.id);
  const oldId = s.id;

  s.affinity[oldId] = (s.affinity[oldId] || 0) - 25;
  s.betrayCount = (s.betrayCount || 0) + 1;
  s.id = null;
  s.rank = 0;
  s.contribution = 0;
  s.buildings = {};
  s.questDate = '';
  s.questsDone = [];
  s.warSeason = '';
  s.warScore = 0;
  s.warLog = [];

  setStance('sanxiu', { silent: true, cooldown: true });

  log(`叛出【${old?.name || oldId}】，贡献尽散，重为散修。三十日内难再拜师`, 'event-bad');
  return { ok: true, sect: oldId, cooldownUntil: state.player.stanceCooldownUntil };
}

// ==================== 贡献与晋升 ====================

/**
 * 增加（或减少）宗门贡献，返回新的贡献值；未入宗门返回 null。
 * 贡献不会被扣成负数。
 */
export function addContribution(n, reason = '') {
  ensureSect();
  if (!state.sect.id) return null;
  const delta = Math.floor(Number(n) || 0);
  if (delta === 0) return state.sect.contribution;
  state.sect.contribution = Math.max(0, state.sect.contribution + delta);
  if (delta > 0 && reason) {
    log(`获得 ${delta} 宗门贡献（${reason}）`, 'event-good');
  }
  return state.sect.contribution;
}

/** 当前职位信息，含下一级还差多少贡献 */
export function rankInfo() {
  ensureSect();
  const rank = state.sect.rank || 0;
  const cur = rankOf(rank);
  const next = SECT_RANKS[rank + 1] || null;
  const contribution = state.sect.contribution || 0;
  return {
    rank,
    name: cur.name,
    salary: cur.salary,
    vaultTier: cur.vaultTier,
    buildingSlots: cur.buildingSlots,
    contribution,
    next: next
      ? {
        rank: next.rank,
        name: next.name,
        needContribution: next.needContribution,
        remain: Math.max(0, next.needContribution - contribution),
      }
      : null,
    canPromote: !!next && contribution >= next.needContribution,
  };
}

/** 贡献达标则晋升（可能一次连升数级），返回新职位 */
export function promote() {
  ensureSect();
  if (!state.sect.id) return { ok: false, reason: '尚未拜入宗门' };
  let promoted = false;
  while (SECT_RANKS[state.sect.rank + 1]
    && state.sect.contribution >= SECT_RANKS[state.sect.rank + 1].needContribution) {
    state.sect.rank += 1;
    promoted = true;
  }
  if (!promoted) {
    const next = SECT_RANKS[state.sect.rank + 1];
    const need = next ? next.needContribution - state.sect.contribution : 0;
    return { ok: false, reason: next ? `贡献不足（还差 ${need}）` : '已至宗主之位' };
  }
  const rk = rankOf(state.sect.rank);
  log(`宗门擢升，位列【${rk.name}】。月俸灵石 ${fmt(rk.salary.stones)}`, 'event-special');
  return {
    ok: true,
    rank: state.sect.rank,
    name: rk.name,
    salary: rk.salary,
    vaultTier: rk.vaultTier,
    buildingSlots: rk.buildingSlots,
  };
}

// ==================== 宝库 ====================

/** 一次性货是否已在身（丹药/材料/灵石/装备可重复兑换） */
function vaultOwned(def) {
  switch (def.kind) {
    case 'recipe':
      if (String(def.ref).startsWith('fr_')) {
        return (state.forging.knownRecipes || []).includes(def.ref);
      }
      return (state.alchemy.knownRecipes || []).includes(def.ref);
    case 'technique':
      return !!state.techniques.known?.[def.ref];
    case 'title':
      return !!state.flags?.[`sect_title_${def.ref}`];
    default:
      return false;
  }
}

/** 当前职位可见的宝库（含能否兑换） */
export function vaultList() {
  ensureSect();
  if (!state.sect.id) return [];
  const tier = rankOf(state.sect.rank).vaultTier;
  const contribution = state.sect.contribution || 0;
  return SECT_VAULT
    .filter((v) => (!v.sect || v.sect === state.sect.id) && v.tier <= tier)
    .map((v) => {
      const cost = v.cost || 0;
      const owned = vaultOwned(v);
      const enough = contribution >= cost;
      let reason = '';
      if (owned) reason = '已然在身';
      else if (!enough) reason = `贡献不足（差 ${cost - contribution}）`;
      return { ...v, owned, canExchange: !owned && enough, reason };
    });
}

/** 兑换。扣除贡献并发货，返回 {ok, entry, granted} */
export function exchange(vaultId) {
  ensureSect();
  if (!state.sect.id) return { ok: false, reason: '尚未拜入宗门' };
  const def = vaultById(vaultId);
  if (!def) return { ok: false, reason: '查无此物' };
  if (def.sect && def.sect !== state.sect.id) return { ok: false, reason: '非本门之物' };

  const tier = rankOf(state.sect.rank).vaultTier;
  if (def.tier > tier) {
    const need = SECT_RANKS.find((r) => r.vaultTier >= def.tier);
    return { ok: false, reason: `职位不足（需 ${need ? need.name : '更高职位'}）` };
  }
  // 灵兽蛋的 ref 必须命中 data/beasts.js 的真实物种。历史上这里写过两个不存在的 id
  // （beast_liehuo / beast_bixi），贡献照扣、蛋照发，孵化时 createBeast 查不到物种
  // 返回 null，蛋被静默丢弃 —— 玩家白花 2600 贡献，连条日志都没有。
  // 宁可在这里拒绝，也不能再让扣费跑在发货之前。
  if (def.kind === 'beast_egg' && !beastById(def.ref)) {
    console.error(`[sect] 宝库灵兽蛋 ${def.id} 的 ref「${def.ref}」不存在于 data/beasts.js`);
    return { ok: false, reason: '此卵有异，尚不可换' };
  }
  if (vaultOwned(def)) return { ok: false, reason: '已然在身' };
  if ((state.sect.contribution || 0) < def.cost) {
    return { ok: false, reason: `贡献不足（需 ${def.cost}）` };
  }

  state.sect.contribution -= def.cost;
  const granted = grantVault(def);
  log(`以 ${def.cost} 宗门贡献兑换【${def.name}】`, 'event-good');
  return { ok: true, entry: def, granted, contribution: state.sect.contribution };
}

/** 按 kind 发放宝库货品，返回可读的发放说明 */
function grantVault(def) {
  const amt = def.amount || 1;
  switch (def.kind) {
    case 'pill':
      addPill(def.ref, amt);
      return `${pillById(def.ref)?.name || def.ref} ×${amt}`;
    case 'material':
      addMaterial(def.ref, amt);
      return `${materialById(def.ref)?.name || def.ref} ×${amt}`;
    case 'stones':
      addStones(amt);
      return `下品灵石 ×${amt}`;
    case 'equip': {
      const inst = addEquipment(def.ref);
      return inst ? `${equipById(def.ref)?.name || def.ref}` : def.ref;
    }
    case 'recipe': {
      const isForge = String(def.ref).startsWith('fr_');
      if (isForge) {
        state.forging.knownRecipes = state.forging.knownRecipes || [];
        if (!state.forging.knownRecipes.includes(def.ref)) state.forging.knownRecipes.push(def.ref);
        return `器图【${forgeRecipeById(def.ref)?.name || def.ref}】`;
      }
      state.alchemy.knownRecipes = state.alchemy.knownRecipes || [];
      if (!state.alchemy.knownRecipes.includes(def.ref)) state.alchemy.knownRecipes.push(def.ref);
      return `丹方【${alchemyRecipeById(def.ref)?.name || def.ref}】`;
    }
    case 'technique': {
      state.techniques.known = state.techniques.known || {};
      if (!state.techniques.known[def.ref]) {
        state.techniques.known[def.ref] = { level: 1, exp: 0, mastered: false };
      }
      return `功法【${techById(def.ref)?.name || def.ref}】`;
    }
    case 'beast_egg': {
      // data/beasts.js 与灵兽系统由并行的另一个 Agent 编写，这里做兜底，
      // 即使 state.beasts 尚未初始化也能安全入蛋。
      const b = state.beasts || (state.beasts = { owned: [], active: null, eggs: [], nextUid: 1 });
      b.eggs = Array.isArray(b.eggs) ? b.eggs : [];
      if (b.nextUid == null) b.nextUid = 1;
      b.eggs.push({ uid: b.nextUid++, baseId: def.ref, hatchAt: Date.now() + EGG_HATCH_MS });
      return `灵兽蛋（约 ${fmtDuration(EGG_HATCH_MS / 1000)}后孵化）`;
    }
    case 'title': {
      state.flags = state.flags || {};
      state.flags[`sect_title_${def.ref}`] = true;
      return `称号「${def.name.replace(/^称号[「『]?/, '').replace(/[」』]$/, '')}」`;
    }
    default:
      return def.name;
  }
}

// ==================== 宗门建筑 ====================

/** 某建筑当前等级（未建造为 0） */
export function sectBuildingLevel(id) {
  ensureSect();
  return state.sect.buildings?.[id]?.level || 0;
}

/** 已建成的建筑数量（用于建筑位限制） */
function builtCount() {
  return Object.values(state.sect.buildings || {}).filter((b) => (b?.level || 0) > 0).length;
}

export function buildingUpgradeCost(def, level) {
  if (!def || level >= def.maxLevel) return null;
  return Math.floor(def.cost.base * Math.pow(def.cost.growth, level));
}

export function buildingUpgradeSeconds(def, level) {
  if (!def || level >= def.maxLevel) return null;
  return Math.floor(def.seconds.base * Math.pow(def.seconds.growth, level));
}

function precheckBuilding(def, b) {
  if (!def) return { ok: false, reason: '查无此建筑' };
  if (!state.sect.id) return { ok: false, reason: '尚未拜入宗门' };
  if (def.reqRank > (state.sect.rank || 0)) {
    return { ok: false, reason: `需职位 ${rankOf(def.reqRank).name}` };
  }
  if (b.upgradeEndsAt) return { ok: false, reason: '正在修建中' };
  if ((b.level || 0) >= def.maxLevel) return { ok: false, reason: '已至最高等级' };
  if ((b.level || 0) === 0) {
    const slots = rankOf(state.sect.rank).buildingSlots;
    if (builtCount() >= slots) return { ok: false, reason: `建筑位已满（${builtCount()}/${slots}）` };
  }
  return { ok: true };
}

function hasEnough(cost) {
  const s = state.resources.stones;
  return (s.low || 0) + (s.mid || 0) * 100 + (s.high || 0) * 10000 >= cost;
}

/** 建筑状态，供 UI 渲染 */
export function buildingStatus(id) {
  ensureSect();
  const def = sectBuildingById(id);
  const b = state.sect.buildings[id] || { level: 0, upgradeEndsAt: null };
  const level = b.level || 0;
  const upgrading = !!b.upgradeEndsAt;
  const now = Date.now();
  const remaining = upgrading ? Math.max(0, Math.ceil((b.upgradeEndsAt - now) / 1000)) : 0;

  const base = {
    id, level, upgrading, remaining,
    maxLevel: def?.maxLevel ?? 9,
    effect: def?.effect || null,
    reqRank: def?.reqRank ?? 0,
    cost: null, seconds: null, canUpgrade: false, reason: '',
  };
  if (!def) { base.reason = '查无此建筑'; return base; }

  if (upgrading) { base.reason = '正在修建中'; return base; }
  base.cost = buildingUpgradeCost(def, level);
  base.seconds = buildingUpgradeSeconds(def, level);
  const pre = precheckBuilding(def, b);
  if (!pre.ok) { base.reason = pre.reason; return base; }
  if (base.cost == null) { base.reason = '已至最高等级'; return base; }
  if (!hasEnough(base.cost)) { base.reason = `灵石不足（需 ${fmt(base.cost)}）`; return base; }
  base.canUpgrade = true;
  return base;
}

/** 升级（或首次建造）宗门建筑：扣灵石 → 开始计时（绝对时间戳，离线推进） */
export function upgradeSectBuilding(id) {
  ensureSect();
  const def = sectBuildingById(id);
  if (!def) return { ok: false, reason: '查无此建筑' };
  const b = state.sect.buildings[id]
    || (state.sect.buildings[id] = { level: 0, upgradeEndsAt: null });

  const pre = precheckBuilding(def, b);
  if (!pre.ok) return pre;

  const cost = buildingUpgradeCost(def, b.level || 0);
  if (cost == null) return { ok: false, reason: '已至最高等级' };
  if (!spendStones(cost)) return { ok: false, reason: `灵石不足（需 ${fmt(cost)}）` };

  const seconds = buildingUpgradeSeconds(def, b.level || 0);
  b.upgradeEndsAt = Date.now() + seconds * 1000;
  log(`宗门动工【${def.name}】至 ${(b.level || 0) + 1} 级，耗灵石 ${fmt(cost)}，约需 ${fmtDuration(seconds)}`, 'event-special');
  return { ok: true, cost, seconds, endsAt: b.upgradeEndsAt, level: b.level || 0 };
}

function completeBuilding(id, atMs) {
  const def = sectBuildingById(id);
  const b = state.sect.buildings[id];
  if (!b || !b.upgradeEndsAt) return null;
  b.level = (b.level || 0) + 1;
  b.upgradeEndsAt = null;
  const entry = { id, name: def?.name || id, level: b.level, at: atMs };
  log(`宗门【${def?.name || id}】落成，已达 ${b.level} 级`, 'event-good');
  return entry;
}

// ==================== 每日任务 ====================

/** 今日轮换到的任务 id（按本地日序确定性轮换，不消耗随机流） */
/**
 * 与池长互质、且尽量接近"池长 ÷ 每日条数"的取样步长。
 *
 * 为什么要互质：步长若与池长有公因数，就会永远只命中池中的一个子集。
 * 例如池长 15、步长 3，虽然每天看着不一样，但 15 条里永远只有 5 条会出现。
 * 互质才能保证长期把所有条目轮完（test_sect 有断言守着这条）。
 */
function questStride(len, n) {
  const ideal = Math.max(1, Math.round(len / Math.max(1, n)));
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  // 从理想步长向两侧找第一个互质的
  for (let d = 0; d < len; d++) {
    for (const s of [ideal + d, ideal - d]) {
      if (s >= 1 && s < len && gcd(s, len) === 1) return s;
    }
  }
  return 1;
}

/**
 * 今日任务。
 *
 * ⚠ 取样必须**跨步**，不能取连续窗口。
 * 原来的写法是 `pool[start + i]`，而任务池是**按类别聚簇排列**的
 * （连续 7 条缴材料、接着连续 5 条缴丹药……），于是某些日子 5 条全是缴丹药、
 * 一条缴材料都没有——玩家连续几天做的都是同一件事。
 * 这不是边角情况，是 test_sect 实测撞上的：测试里的
 * `find(q => q.kind === 'donate_material')` 昨天还能找到，今天返回 undefined。
 *
 * 换成与前一日不同的跨步取样后，每天的 5 条会散落在整个池子里。
 * 仍然保持**确定性**：同一天多次调用必得同一结果（刷新页面不会重掷）。
 */
export function dailyQuestIds() {
  const pool = SECT_QUESTS;
  const n = Math.min(DAILY_QUEST_COUNT, pool.length);
  const len = pool.length;
  const stride = questStride(len, n);
  const start = ((dayIndex() % len) + len) % len;
  const ids = [];
  for (let i = 0; i < n; i++) ids.push(pool[(start + i * stride) % len].id);
  return ids;
}

function questProgress(def) {
  if (def.kind === 'donate_material') {
    return { have: materialCount(def.target), need: def.need };
  }
  if (def.kind === 'donate_pill') {
    return { have: pillCount(def.target), need: def.need };
  }
  // 试炼以成败计
  const done = (state.sect.questsDone || []).includes(def.id);
  return { have: done ? 1 : 0, need: 1 };
}

/** 今日任务（含进度与可否完成） */
export function dailyQuests() {
  ensureSect();
  const done = new Set(state.sect.questsDone || []);
  return dailyQuestIds().map((id) => {
    const def = sectQuestById(id);
    const p = questProgress(def);
    const isDone = done.has(id);
    const can = isDone ? { ok: false, reason: '今日已完成' } : canFinishQuest(id);
    return {
      ...def,
      progress: p.have,
      needCount: p.need,
      done: isDone,
      canFinish: can.ok,
      reason: isDone ? '今日已完成' : (can.reason || ''),
    };
  });
}

/** 某任务当前能否完成，返回 {ok, reason, def} */
export function canFinishQuest(id) {
  ensureSect();
  if (!state.sect.id) return { ok: false, reason: '尚未拜入宗门' };
  const def = sectQuestById(id);
  if (!def) return { ok: false, reason: '查无此任务' };
  if (!dailyQuestIds().includes(id)) return { ok: false, reason: '非今日任务' };
  if ((state.sect.questsDone || []).includes(id)) return { ok: false, reason: '今日已完成' };
  if (def.kind === 'donate_material') {
    const have = materialCount(def.target);
    if (have < def.need) {
      return { ok: false, reason: `${materialById(def.target)?.name || def.target}不足（${have}/${def.need}）` };
    }
  }
  if (def.kind === 'donate_pill') {
    const have = pillCount(def.target);
    if (have < def.need) {
      return { ok: false, reason: `${pillById(def.target)?.name || def.target}不足（${have}/${def.need}）` };
    }
  }
  return { ok: true, def };
}

/** 试炼判定：个人战力需压过敌人战力。返回 {ok, reason} */
function trialCheck(def) {
  const en = enemyById(def.target);
  if (!en) return { ok: true, reason: '' };       // 敌人表缺失时兜底放行
  if (state.player.realmIndex < (en.minRealm || 0)) {
    return { ok: false, reason: `境界不足，${en.name}非你所能敌（需 ${realmAt(en.minRealm).name}）` };
  }
  const required = (en.power || 0) * 1.2;
  if (personalPower() < required) {
    return { ok: false, reason: `战力不足，难敌${en.name}（需 ${fmt(required)} 战力）` };
  }
  return { ok: true, reason: en.name };
}

/** 完成任务，发放贡献。返回 {ok, contribution} */
export function finishQuest(id) {
  const check = canFinishQuest(id);
  if (!check.ok) return check;
  const def = check.def;

  if (def.kind === 'donate_material') {
    addMaterial(def.target, -def.need);
  } else if (def.kind === 'donate_pill') {
    addPill(def.target, -def.need);
  } else if (def.kind === 'trial_battle') {
    const trial = trialCheck(def);
    if (!trial.ok) {
      log(`宗门试炼未过：${trial.reason}`, 'event-bad');
      return { ok: false, reason: trial.reason };
    }
  }

  addContribution(def.contribution, `任务·${def.name}`);
  state.sect.questsDone.push(id);
  log(`完成宗门任务【${def.name}】，得贡献 ${def.contribution}`, 'event-good');
  return { ok: true, contribution: def.contribution, quest: def };
}

// ==================== 宗门战 ====================

/** 个人战斗属性汇总（职位权重之外的部分） */
function combatBody() {
  return calcAtk() * 1.0 + calcDef() * 1.4 + calcMaxHp() * 0.30;
}

/**
 * 个人战力 = 职位权重 + 演武场等级加成 + 个人战斗属性（atk/def/maxHp）。
 * 演武场是纯乘区，投入越多宗门战越强。
 */
export function personalPower() {
  ensureSect();
  if (!state.sect.id) return 0;
  const rank = state.sect.rank || 0;
  const arena = sectBuildingLevel('bld_arena');
  const arenaPct = arena * (sectBuildingById('bld_arena')?.effect?.perLevel || 0);
  const rankWeight = 120 + rank * 160;
  return Math.floor((combatBody() + rankWeight) * (1 + arenaPct));
}

/** 对手 AI 战力（确定性；不随玩家演武场成长，所以投资演武场能实打实提高胜率） */
function aiPower(sectId, season) {
  const h = hashStr(`${sectId}|${season}`);
  const rankWeight = 120 + (state.sect.rank || 0) * 100;
  const factor = 0.85 + (h % 50) / 100;   // 0.85 ~ 1.34
  return Math.floor((combatBody() * 0.85 + rankWeight) * factor);
}

function opponentsFor(season) {
  const me = state.sect.id;
  return SECTS
    .filter((s) => s.id !== me)
    .map((s) => ({ id: s.id, name: s.name, color: s.color, power: aiPower(s.id, season) }));
}

function resolvedThisSeason(season) {
  return (state.sect.warLog || []).some((e) => e && e.season === season);
}

/** 宗门战状态，供 UI 渲染 */
export function warStatus() {
  ensureSect();
  const season = seasonOf();
  const joined = !!state.sect.id;
  const nextAt = nextSettleTimestamp();
  const power = joined ? personalPower() : 0;
  return {
    joined,
    season,
    score: state.sect.warScore || 0,
    power,
    opponents: joined ? opponentsFor(season) : [],
    nextSettleAt: nextAt,
    settleCountdown: Math.max(0, Math.ceil((nextAt - Date.now()) / 1000)),
    canResolve: joined && !resolvedThisSeason(season),
    resolved: resolvedThisSeason(season),
    recent: (state.sect.warLog || []).slice(0, WAR.logCap),
  };
}

/**
 * 结算本赛季宗门战，返回含逐条文字战报的报告。
 * opts.force = 'win' | 'lose' 可强制胜负（自测用，正常玩法不传）。
 * opts.season 指定结算的赛季（周切换时结算上一季用）。
 * opts.auto 标记为自动结算（日志措辞不同）。
 *
 * 重要：败方只损失部分贡献（护宗大阵可减免），绝不掉境界、职位或已解锁内容。
 */
export function resolveWar(opts = {}) {
  ensureSect();
  if (!state.sect.id) return { ok: false, reason: '尚未拜入宗门' };
  const season = opts.season || seasonOf();
  if (!opts.force && resolvedThisSeason(season)) {
    return { ok: false, reason: '本赛季已结算，静待下轮' };
  }

  const s = state.sect;
  const rank = s.rank || 0;
  const rk = rankOf(rank);
  const power = personalPower();
  const opps = opponentsFor(season);
  const target = opps.reduce((a, b) => (b.power > a.power ? b : a), opps[0])
    || { id: 'unknown', name: '无名宗', power: power };
  const win = opts.force ? opts.force === 'win' : power >= target.power;

  let gain = 0;
  let loss = 0;
  const lines = [];

  lines.push({ text: `${season} 宗门大比，【${target.name}】上门挑战`, cls: 'event-special' });
  lines.push({ text: `我方阵前主将：${rk.name} · 个人战力 ${fmt(power)}`, cls: '' });
  lines.push({ text: `敌方战力 ${fmt(target.power)}`, cls: '' });

  if (win) {
    gain = WAR.winContribution + rank * WAR.rankContribution;
    const stones = WAR.stonesPerRank * (rank + 1);
    const mats = WAR_REWARD_MATERIALS[rank] || [];
    addContribution(gain, '宗门战');
    addStones(stones);
    for (const m of mats) addMaterial(m.id, m.count);
    s.warScore = (s.warScore || 0) + WAR.winScore;
    lines.push({ text: '演武场士气如虹，你一式破开对方护体真元，敌阵溃散！', cls: 'event-good' });
    const matText = mats.map((m) => `${materialById(m.id)?.name || m.id}×${m.count}`).join('、');
    lines.push({ text: `宗门记功 ${gain}，赏灵石 ${fmt(stones)}${matText ? '、' + matText : ''}`, cls: 'event-good' });
  } else {
    const wardLv = sectBuildingLevel('bld_ward');
    const wardPct = Math.min(0.75, wardLv * (sectBuildingById('bld_ward')?.effect?.perLevel || 0));
    loss = Math.floor(WAR.loseContribution * (1 - wardPct));
    loss = Math.min(loss, s.contribution || 0);
    s.contribution = Math.max(0, (s.contribution || 0) - loss);
    s.warScore = (s.warScore || 0) + WAR.loseScore;
    lines.push({ text: '对方长老一掌拍落，你气血翻涌，力有不逮……', cls: 'event-bad' });
    if (wardLv > 0) {
      lines.push({ text: `护宗大阵嗡鸣，替你卸去 ${Math.round(wardPct * 100)}% 冲击，损失减至 ${loss} 贡献`, cls: '' });
    } else {
      lines.push({ text: `阵前失手，损贡献 ${loss}`, cls: 'event-bad' });
    }
    lines.push({ text: '胜败乃兵家常事。境界、职位与已得之物，分毫未动', cls: '' });
  }

  const report = {
    season,
    at: Date.now(),
    auto: !!opts.auto,
    win,
    power,
    opponent: { id: target.id, name: target.name, power: target.power },
    contributionGain: gain,
    contributionLoss: loss,
    score: s.warScore,
    lines,
  };

  s.warLog = [report, ...(s.warLog || [])].slice(0, WAR.logCap);
  s.warSeason = seasonOf();
  log(`宗门战结算：${win ? '胜' : '败'}于【${target.name}】${win ? `，得贡献 ${gain}` : `，损贡献 ${loss}`}`, win ? 'event-good' : 'event-bad');
  return { ok: true, report };
}

/** 周切换：自动结算上一赛季，并重置本赛季战功 */
export function tickWar() {
  ensureSect();
  if (!state.sect.id) return null;
  const cur = seasonOf();
  if (!state.sect.warSeason) { state.sect.warSeason = cur; return null; }
  if (state.sect.warSeason !== cur) {
    const prev = state.sect.warSeason;
    state.sect.warSeason = cur;
    state.sect.warScore = 0;
    const r = resolveWar({ season: prev, auto: true });
    return r.ok ? r.report : null;
  }
  return null;
}

// ==================== 每帧 / 离线推进 ====================

/**
 * 主循环每秒调用：
 *   - 完成到期的宗门建筑（绝对时间戳，离线照常推进）
 *   - 跨天时重置每日任务并发放俸禄
 *   - 推进宗门战赛季
 * 返回 {completed, salary} 供 UI 提示。
 */
export function tickSect(dt) {
  ensureSect();
  const completed = [];
  const now = Date.now();
  for (const [id, b] of Object.entries(state.sect.buildings || {})) {
    if (b?.upgradeEndsAt && now >= b.upgradeEndsAt) {
      const c = completeBuilding(id, now);
      if (c) completed.push(c);
    }
  }

  let salary = null;
  if (state.sect.id) {
    const today = todayStr();
    if (state.sect.questDate !== today) {
      const hadDate = !!state.sect.questDate;
      state.sect.questDate = today;
      state.sect.questsDone = [];
      if (hadDate) salary = paySalary();
    }
  }

  tickWar();
  return { completed, salary };
}

/** 发放当日俸禄（灵石 + 稀有材料），返回明细 */
function paySalary() {
  const rank = state.sect.rank || 0;
  const rk = rankOf(rank);
  const stones = rk.salary?.stones || 0;
  const mats = RANK_SALARY_MATERIALS[rank] || [];
  if (stones > 0) addStones(stones);
  for (const m of mats) addMaterial(m.id, m.count);
  const matText = mats.map((m) => `${materialById(m.id)?.name || m.id}×${m.count}`).join('、');
  log(`宗门发放月俸：灵石 ${fmt(stones)}${matText ? '、' + matText : ''}`, 'event-good');
  return { stones, materials: mats.map((m) => ({ ...m })) };
}

// ==================== 常驻加成（供 cultivation.js 接入） ====================

/**
 * 给 cultivation.js 用的常驻加成。未入宗门时全部为 0。
 * 键的含义：
 *   atkPct/defPct/hpPct  攻击/防御/气血上限的乘区增额（0.12 = +12%）
 *   critAdd              暴击率加值（0.05 = +5%）
 *   comprehensionAdd     悟性加值
 *   alchemyPct           炼丹成功率/产量乘区增额
 *   cultPct              功法参悟速度乘区增额
 *   beastPct             灵兽养成速度乘区增额
 *   warPowerPct          宗门战战力乘区增额（演武场）
 *   warDefPct            宗门战战败损失减免（护宗大阵）
 */
export function sectBonus() {
  ensureSect();
  const zero = {
    atkPct: 0, defPct: 0, hpPct: 0, critAdd: 0, comprehensionAdd: 0,
    alchemyPct: 0, cultPct: 0, beastPct: 0, warPowerPct: 0, warDefPct: 0,
  };
  if (!state.sect.id) return zero;
  const sect = sectById(state.sect.id);
  const out = { ...zero, ...(sect?.bonus || {}) };

  for (const def of SECT_BUILDINGS) {
    const lv = sectBuildingLevel(def.id);
    if (lv <= 0) continue;
    const v = (def.effect?.perLevel || 0) * lv;
    switch (def.effect?.kind) {
      case 'alchemy': out.alchemyPct += v; break;
      case 'cultivate': out.cultPct += v; break;
      case 'beast': out.beastPct += v; break;
      case 'war_power': out.warPowerPct += v; break;
      case 'war_defense': out.warDefPct += v; break;
      default: break;
    }
  }
  return out;
}

// ==================== UI 汇总 ====================

/** 宗门面板一次取全所需数据（结构信息与数值分开，供 createPanel 使用） */
export function sectSummary() {
  ensureSect();
  const s = state.sect;
  const joined = !!s.id;
  const sect = joined ? sectById(s.id) : null;
  const ri = joined ? rankInfo() : null;
  return {
    joined,
    sect,
    rank: ri,
    contribution: s.contribution || 0,
    affinity: s.affinity || {},
    stanceCooldownUntil: state.player.stanceCooldownUntil || 0,
    canJoin: SECTS.map((x) => ({ id: x.id, ...canJoin(x.id) })),
    buildings: SECT_BUILDINGS.map((def) => ({
      id: def.id, name: def.name, desc: def.desc, effect: def.effect, reqRank: def.reqRank,
      ...buildingStatus(def.id),
    })),
    vault: joined ? vaultList() : [],
    quests: joined ? dailyQuests() : [],
    war: warStatus(),
  };
}

/** 便捷：某物是否已在身（UI 着色用） */
export function isVaultOwned(vaultId) {
  const def = vaultById(vaultId);
  return def ? vaultOwned(def) : false;
}

/** 某材料是否足够（UI 用） */
export function materialEnough(id, n) {
  return materialCount(id) >= n;
}

/** 是否足够灵石（UI 用） */
export function stonesEnough(n) {
  return stonesToLow() >= n;
}
