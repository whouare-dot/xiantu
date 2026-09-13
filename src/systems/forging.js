/**
 * 炼器系统。
 *
 * 与炼丹的差别在于"追求"：
 *   - 产出的是实例化装备，词条随机 → 玩家反复炼器追求极品
 *   - 以丹方 minQuality 为基础，有概率升阶；升阶时滚更好的词条
 *   - 失败返还一半材料，不劝退
 *
 * 数据来源：data/recipes.js 的 FORGE_RECIPES / forgeRecipeById。
 * 该文件可能尚未就位，处理方式同 alchemy.js（可选动态导入 + 兜底）。
 *
 * 纯逻辑，禁止任何 DOM 操作。
 */

import {
  state, noteKind, spendStones, materialCount, hasMaterials, consumeMaterials, addMaterial,
} from '../core/state.js';
import { emit, EV } from '../core/bus.js';
import { chance } from '../core/rng.js';
import { fmt, fmtDuration } from '../core/format.js';
import { buildingLevel, caveEffect, calcComprehension } from './cultivation.js';
import { equipById, equipsByTier } from '../data/equipments.js';
import { qualityOf, QUALITY_ORDER } from '../data/qualities.js';
import { createEquipment, rollAffixes } from './inventory.js';

// ==================== 器方数据解析 ====================

const FALLBACK_FORGE = [
  { id: 'frg_qingwen', name: '青纹铁剑图', equipId: 'eq_qingwen_sword', tier: 1, minRealm: 0, minQuality: 'fan',
    materials: [{ id: 'mat_xuantie', count: 4 }, { id: 'mat_shougu', count: 2 }],
    baseSeconds: 30, baseSuccess: 0.75, learnCost: 0 },
  { id: 'frg_taomu', name: '桃木法刃图', equipId: 'eq_taomu_blade', tier: 1, minRealm: 2, minQuality: 'fan',
    materials: [{ id: 'mat_xuantie', count: 3 }, { id: 'mat_shougu', count: 3 }],
    baseSeconds: 35, baseSuccess: 0.72, learnCost: 120 },
  { id: 'frg_qingmu', name: '青木护心镜图', equipId: 'eq_qingmu_shield', tier: 1, minRealm: 5, minQuality: 'ling',
    materials: [{ id: 'mat_xuantie', count: 5 }, { id: 'mat_hanjing', count: 2 }],
    baseSeconds: 60, baseSuccess: 0.65, learnCost: 400 },
];

let RECIPE_MOD = null;
try {
  RECIPE_MOD = await import('../data/recipes.js');
} catch (err) {
  RECIPE_MOD = null;
}

/** tier 兜底品阶：器方没写 minQuality 时按档位推 */
const TIER_QUALITY = { 1: 'fan', 2: 'ling', 3: 'ling', 4: 'xian', 5: 'shen' };

function normalizeForge(r) {
  if (!r || !r.id) return null;
  const rawMats = r.materials || r.mats
    || (Array.isArray(r.cost) ? r.cost : (r.cost && typeof r.cost === 'object' ? (r.cost.materials || r.cost) : []));
  const materials = Array.isArray(rawMats)
    ? rawMats.map((m) => ({ id: m.id, count: m.count ?? m.n ?? 1 })).filter((m) => m.id)
    : Object.entries(rawMats || {}).map(([id, count]) => ({ id, count }));
  const equipId = r.equipId || r.equip || r.baseId || r.outputId || r.resultId || null;
  const tier = r.tier ?? equipById(equipId)?.tier ?? 1;
  return {
    id: r.id,
    name: r.name || (equipById(equipId)?.name ? equipById(equipId).name + '图' : r.id),
    equipId,
    tier,
    minRealm: r.minRealm ?? 0,
    minQuality: r.minQuality || r.quality || TIER_QUALITY[tier] || 'fan',
    materials,
    baseSeconds: r.baseSeconds ?? r.seconds ?? r.time ?? 90,
    baseSuccess: r.baseSuccess ?? r.success ?? r.rate ?? 0.6,
    learnCost: r.learnCost ?? r.unlockCost ?? 0,
  };
}

let _table = null;
function forgeTable() {
  if (_table) return _table;
  const raw = (RECIPE_MOD?.FORGE_RECIPES?.length ? RECIPE_MOD.FORGE_RECIPES : FALLBACK_FORGE);
  _table = raw.map(normalizeForge).filter((r) => r && r.equipId && equipById(r.equipId) && r.materials.length > 0);
  return _table;
}

export function getForgeRecipe(id) {
  if (RECIPE_MOD?.forgeRecipeById) {
    const r = RECIPE_MOD.forgeRecipeById(id);
    if (r) return normalizeForge(r);
  }
  return forgeTable().find((r) => r.id === id) || null;
}

export function allForgeRecipes() {
  return forgeTable().slice();
}

// ==================== 常量 ====================

/** 自动炼器所需炼器室等级（任务约定 3） */
export const AUTO_FORGE_MIN_LEVEL = 3;

function log(text, cls = 'event-special', channel = 'system') {
  emit(EV.LOG, { text, cls, channel });
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ==================== 器方学习 ====================

export function knownForgeRecipes() {
  const ids = state.forging.knownRecipes || [];
  return ids.map(getForgeRecipe).filter(Boolean);
}

export function learnForgeRecipe(recipeId) {
  const recipe = getForgeRecipe(recipeId);
  if (!recipe) return { ok: false, reason: '查无此图' };
  state.forging.knownRecipes = state.forging.knownRecipes || [];
  if (state.forging.knownRecipes.includes(recipeId)) return { ok: false, reason: '此图已然在胸' };
  if (state.player.realmIndex < recipe.minRealm) {
    return { ok: false, reason: '境界不足，难以参悟此图' };
  }
  const cost = Math.max(0, Math.floor(recipe.learnCost || 0));
  if (cost > 0 && !spendStones(cost)) return { ok: false, reason: `灵石不足（需 ${fmt(cost)}）` };
  state.forging.knownRecipes.push(recipeId);
  log(`参悟器图【${recipe.name}】${cost > 0 ? '，耗灵石 ' + fmt(cost) : ''}`, 'event-special');
  return { ok: true, recipe, cost };
}

// ==================== 炼制条件 ====================

function speedMult() {
  return 1 + caveEffect('bld_forge');
}

export function forgeSeconds(recipe) {
  if (!recipe) return 0;
  return Math.max(1, Math.floor(recipe.baseSeconds / speedMult()));
}

export function forgeSuccessRate(recipe) {
  if (!recipe) return 0;
  const bonus = buildingLevel('bld_forge') * 0.02 + calcComprehension() * 0.004;
  return clamp(recipe.baseSuccess + bonus, 0.05, 0.98);
}

export function canForge(recipeId) {
  const recipe = getForgeRecipe(recipeId);
  if (!recipe) return { ok: false, reason: '查无此图' };
  if (!(state.forging.knownRecipes || []).includes(recipeId)) return { ok: false, reason: '尚未悟得此图' };
  if (state.forging.active) return { ok: false, reason: '锻炉正忙' };
  if (!equipById(recipe.equipId)) return { ok: false, reason: '器图对应的装备已失传' };
  if (!hasMaterials(recipe.materials)) return { ok: false, reason: '材料不足' };
  return { ok: true, recipe };
}

// ==================== 品质与产出 ====================

/** 以 minQuality 为起点滚升阶，受悟性与炼器室等级影响 */
export function rollQuality(minQuality, opts = {}) {
  const comp = opts.comprehension ?? calcComprehension();
  const lv = opts.buildingLevel ?? buildingLevel('bld_forge');
  let order = qualityOf(minQuality).order;
  let p = clamp(0.10 + comp * 0.002 + lv * 0.015, 0, 0.6);
  while (order < QUALITY_ORDER.length && chance(p)) {
    order++;
    p *= 0.4; // 越往上越难
  }
  return QUALITY_ORDER[order - 1];
}

function refundHalf(materials) {
  for (const req of materials) {
    const back = Math.floor(req.count / 2);
    if (back > 0) addMaterial(req.id, back);
  }
}

/** 选中器图对应的装备基础 id */
function pickEquipBase(recipe) {
  const direct = equipById(recipe.equipId);
  if (direct) return direct;
  const pool = equipsByTier(recipe.tier);
  if (pool.length === 0) return null;
  return pool[0];
}

/** 结算一次炼器（材料已扣） */
function resolveForge(recipe) {
  const rate = forgeSuccessRate(recipe);
  const ok = chance(rate);
  if (!ok) {
    refundHalf(recipe.materials);
    log(`炼制【${recipe.name}】失败，炉火失控，返还半数材料`, 'event-bad');
    return { ok: false, recipe, rate };
  }

  const base = pickEquipBase(recipe);
  if (!base) {
    refundHalf(recipe.materials);
    return { ok: false, reason: '器图有误，无从下手', recipe, rate };
  }

  const quality = rollQuality(recipe.minQuality);
  // 升阶后重滚词条，品阶越高词条越多越好
  const affixes = rollAffixes(quality, base.tier || recipe.tier);
  const inst = createEquipment(base.id, { quality, level: 1, affixes, tier: base.tier, add: true });
  state.stats.itemsForged = (state.stats.itemsForged || 0) + 1;
  // V6.0 功课：记下"炼成过哪几种器"（按图纸去重）
  noteKind('forged', recipe.id);

  const q = qualityOf(quality);
  const upgraded = q.order > qualityOf(recipe.minQuality).order;
  log(
    `器成！得 ${q.name}·${base.name}（${affixes.length} 条词条）${upgraded ? '，竟越阶而成！' : ''}`,
    upgraded ? 'event-special' : 'event-good',
  );
  emit(EV.ITEM_GAIN, { kind: 'forge', uid: inst?.uid, baseId: base.id, quality });
  return { ok: true, recipe, rate, instance: inst, quality };
}

// ==================== 炼制入口 ====================

/** 立即炼器一次（消耗材料，跳过等待） */
export function forge(recipeId) {
  const chk = canForge(recipeId);
  if (!chk.ok) return chk;
  const recipe = chk.recipe;
  if (!consumeMaterials(recipe.materials)) return { ok: false, reason: '材料不足' };
  return resolveForge(recipe);
}

/** 开始后台炼器（可离线推进） */
export function startForge(recipeId) {
  const chk = canForge(recipeId);
  if (!chk.ok) return chk;
  const recipe = chk.recipe;
  if (!consumeMaterials(recipe.materials)) return { ok: false, reason: '材料不足' };
  const seconds = forgeSeconds(recipe);
  state.forging.active = {
    recipeId,
    startedAt: Date.now(),
    endsAt: Date.now() + seconds * 1000,
    seconds,
  };
  log(`开炉炼器【${recipe.name}】，约需 ${fmtDuration(seconds)}`, 'event-special');
  return { ok: true, recipe, seconds, endsAt: state.forging.active.endsAt };
}

export function tickForge(dt) {
  const active = state.forging.active;
  if (active && Date.now() >= active.endsAt) {
    const recipe = getForgeRecipe(active.recipeId);
    state.forging.active = null;
    if (recipe) resolveForge(recipe);
    else log('锻炉开启，器图却已遗失', 'event-bad');
  }
  if (state.forging.auto) maybeAutoForge();
}

function maybeAutoForge() {
  if (state.forging.active) return null;
  const candidates = knownForgeRecipes()
    .filter((r) => hasMaterials(r.materials))
    .sort((a, b) => (b.tier - a.tier) || ((b.baseSuccess || 0) - (a.baseSuccess || 0)));
  if (candidates.length === 0) return null;
  const r = startForge(candidates[0].id);
  return r.ok ? candidates[0] : null;
}

export function setAutoForge(on) {
  if (on) {
    if (buildingLevel('bld_forge') < AUTO_FORGE_MIN_LEVEL) {
      return { ok: false, reason: `炼器室需达 ${AUTO_FORGE_MIN_LEVEL} 级方可自动炼器` };
    }
    if (knownForgeRecipes().length === 0) return { ok: false, reason: '尚未悟得任何器图' };
  }
  state.forging.auto = !!on;
  log(on ? '开启自动炼器' : '关闭自动炼器', 'event-special');
  return { ok: true, auto: state.forging.auto };
}
