/**
 * 炼丹系统。
 *
 * 玩法要点：
 *   - 丹方需先花灵石"悟方"（learnRecipe）才能炼制
 *   - 炼制有成功率，受丹房等级与悟性加成；失败返还一半材料（不劝退）
 *   - startCraft 起后台炉，tickAlchemy 推进，离线也照常完成
 *   - 丹房等级达到 AUTO_ALCHEMY_MIN_LEVEL 后解锁自动炼丹
 *
 * 数据来源：data/recipes.js 的 ALCHEMY_RECIPES / alchemyRecipeById。
 * 该文件由数据层负责，可能尚未就位；此处在模块加载时做可选动态导入，
 * 缺失时退回内建兜底丹方，保证系统与自测可独立运行。recipes.js 一旦
 * 就位即自动接管，无需改动本文件。
 *
 * 纯逻辑，禁止任何 DOM 操作。
 */

import {
  state, noteKind, spendStones, addMaterial, materialCount, hasMaterials, consumeMaterials, addPill,
} from '../core/state.js';
import { emit, EV } from '../core/bus.js';
import { chance } from '../core/rng.js';
import { fmt, fmtDuration, fmtPct } from '../core/format.js';
import { buildingLevel, caveEffect, calcComprehension } from './cultivation.js';
import { pillById } from '../data/pills.js';

// ==================== 丹方数据解析 ====================

/**
 * 兜底丹方（仅在 data/recipes.js 缺失时启用）。
 * 材料 id 全部取自 materials.js，产物取自 pills.js。
 */
const FALLBACK_ALCHEMY = [
  { id: 'alch_juqi', name: '聚气丹方', pillId: 'pill_juqi', tier: 1, minRealm: 0,
    materials: [{ id: 'mat_lingzhi', count: 3 }, { id: 'mat_shougu', count: 2 }],
    baseSeconds: 20, baseSuccess: 0.8, learnCost: 0 },
  { id: 'alch_huiqi', name: '回气丹方', pillId: 'pill_huiqi', tier: 1, minRealm: 0,
    materials: [{ id: 'mat_lingzhi', count: 2 }, { id: 'mat_xuantie', count: 1 }],
    baseSeconds: 25, baseSuccess: 0.75, learnCost: 80 },
  { id: 'alch_liaoshang', name: '疗伤丹方', pillId: 'pill_liaoshang', tier: 2, minRealm: 2,
    materials: [{ id: 'mat_xueshen', count: 2 }, { id: 'mat_ziyulan', count: 1 }],
    baseSeconds: 40, baseSuccess: 0.7, learnCost: 200 },
  { id: 'alch_ningqi', name: '凝气丹方', pillId: 'pill_ningqi', tier: 2, minRealm: 4,
    materials: [{ id: 'mat_xueshen', count: 3 }, { id: 'mat_yaoxue', count: 2 }],
    baseSeconds: 60, baseSuccess: 0.65, learnCost: 600 },
];

let RECIPE_MOD = null;
try {
  RECIPE_MOD = await import('../data/recipes.js');
} catch (err) {
  // recipes.js 尚未就位属正常情况，静默退回兜底
  RECIPE_MOD = null;
}

/** 把不同写法的丹方字段归一成内部结构 */
function normalizeAlchemy(r) {
  if (!r || !r.id) return null;
  const rawMats = r.materials || r.mats
    || (Array.isArray(r.cost) ? r.cost : (r.cost && typeof r.cost === 'object' ? (r.cost.materials || r.cost) : []));
  const materials = Array.isArray(rawMats)
    ? rawMats.map((m) => ({ id: m.id, count: m.count ?? m.n ?? 1 })).filter((m) => m.id)
    : Object.entries(rawMats || {}).map(([id, count]) => ({ id, count }));
  const pillId = r.pillId || r.pill || r.outputId || r.resultId || null;
  return {
    id: r.id,
    name: r.name || pillById(pillId)?.name || r.id,
    pillId,
    tier: r.tier ?? 1,
    minRealm: r.minRealm ?? 0,
    materials,
    baseSeconds: r.baseSeconds ?? r.seconds ?? r.time ?? 60,
    baseSuccess: r.baseSuccess ?? r.success ?? r.rate ?? 0.7,
    learnCost: r.learnCost ?? r.unlockCost ?? 0,
    output: r.output ?? r.count ?? 1,
  };
}

let _table = null;
function alchemyTable() {
  if (_table) return _table;
  const raw = (RECIPE_MOD?.ALCHEMY_RECIPES?.length ? RECIPE_MOD.ALCHEMY_RECIPES : FALLBACK_ALCHEMY);
  _table = raw.map(normalizeAlchemy).filter((r) => r && r.pillId && r.materials.length > 0);
  return _table;
}

/** 取丹方（优先用 recipes.js 导出的查表函数） */
export function getAlchemyRecipe(id) {
  if (RECIPE_MOD?.alchemyRecipeById) {
    const r = RECIPE_MOD.alchemyRecipeById(id);
    if (r) return normalizeAlchemy(r);
  }
  return alchemyTable().find((r) => r.id === id) || null;
}

/** 全部丹方（供坊市 / UI 使用） */
export function allAlchemyRecipes() {
  return alchemyTable().slice();
}

// ==================== 常量 ====================

/** 自动炼丹所需丹房等级（任务约定 3；data 里 autoUnlockLevel 为 5，如需可改读该字段） */
export const AUTO_ALCHEMY_MIN_LEVEL = 3;

function log(text, cls = 'event-special', channel = 'system') {
  emit(EV.LOG, { text, cls, channel });
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ==================== 丹方学习 ====================

export function knownRecipes() {
  const ids = state.alchemy.knownRecipes || [];
  return ids.map(getAlchemyRecipe).filter(Boolean);
}

/** 消耗灵石悟得丹方 */
export function learnRecipe(recipeId) {
  const recipe = getAlchemyRecipe(recipeId);
  if (!recipe) return { ok: false, reason: '查无此方' };
  state.alchemy.knownRecipes = state.alchemy.knownRecipes || [];
  if (state.alchemy.knownRecipes.includes(recipeId)) return { ok: false, reason: '此方已然在胸' };
  if (state.player.realmIndex < recipe.minRealm) {
    return { ok: false, reason: '境界不足，难以参悟此方' };
  }
  const cost = Math.max(0, Math.floor(recipe.learnCost || 0));
  if (cost > 0 && !spendStones(cost)) return { ok: false, reason: `灵石不足（需 ${fmt(cost)}）` };
  state.alchemy.knownRecipes.push(recipeId);
  log(`参悟丹方【${recipe.name}】${cost > 0 ? '，耗灵石 ' + fmt(cost) : ''}`, 'event-special');
  return { ok: true, recipe, cost };
}

// ==================== 炼制条件 ====================

/** 炼丹速度加成：丹房 effect.kind = alchemy_speed */
function speedMult() {
  return 1 + caveEffect('bld_alchemy');
}

/** 单次炼制耗时（秒），丹房等级越高越快 */
export function craftSeconds(recipe) {
  if (!recipe) return 0;
  return Math.max(1, Math.floor(recipe.baseSeconds / speedMult()));
}

/** 成功率：丹方基础 + 丹房等级 + 悟性，夹在 5%~98% */
export function successRate(recipe) {
  if (!recipe) return 0;
  const bonus = buildingLevel('bld_alchemy') * 0.02 + calcComprehension() * 0.004;
  return clamp(recipe.baseSuccess + bonus, 0.05, 0.98);
}

/** 能否炼制，返回 {ok, reason} */
export function canCraft(recipeId) {
  const recipe = getAlchemyRecipe(recipeId);
  if (!recipe) return { ok: false, reason: '查无此方' };
  if (!(state.alchemy.knownRecipes || []).includes(recipeId)) return { ok: false, reason: '尚未悟得此方' };
  if (state.alchemy.active) return { ok: false, reason: '丹炉正忙' };
  if (!hasMaterials(recipe.materials)) return { ok: false, reason: '材料不足' };
  return { ok: true, recipe };
}

// ==================== 炼制结算 ====================

/** 失败返还一半材料（向下取整，每个材料至少返还 0） */
function refundHalf(materials) {
  for (const req of materials) {
    const back = Math.floor(req.count / 2);
    if (back > 0) addMaterial(req.id, back);
  }
}

/** 结算一次炼制（材料已扣），返回 {ok, recipe} */
function resolveCraft(recipe) {
  const rate = successRate(recipe);
  const ok = chance(rate);
  if (ok) {
    addPill(recipe.pillId, recipe.output);
    state.stats.pillsMade = (state.stats.pillsMade || 0) + 1;
    // V6.0 功课：记下"炼成过哪几种丹"（按配方去重）
    noteKind('pills', recipe.id);
    const pill = pillById(recipe.pillId);
    log(`丹成！得【${pill?.name || recipe.pillId}】×${recipe.output}`, 'event-good');
  } else {
    refundHalf(recipe.materials);
    log(`炼制【${recipe.name}】失败，炉火散乱，返还半数材料`, 'event-bad');
  }
  return { ok, recipe, rate };
}

/**
 * 立即炼制一次（消耗材料，跳过等待时间，供 UI 手动点单炉）。
 */
export function craft(recipeId) {
  const chk = canCraft(recipeId);
  if (!chk.ok) return chk;
  const recipe = chk.recipe;
  if (!consumeMaterials(recipe.materials)) return { ok: false, reason: '材料不足' };
  return resolveCraft(recipe);
}

// ==================== 后台炼制 ====================

/** 开始后台炼制（可离线推进） */
export function startCraft(recipeId) {
  const chk = canCraft(recipeId);
  if (!chk.ok) return chk;
  const recipe = chk.recipe;
  if (!consumeMaterials(recipe.materials)) return { ok: false, reason: '材料不足' };
  const seconds = craftSeconds(recipe);
  state.alchemy.active = {
    recipeId,
    startedAt: Date.now(),
    endsAt: Date.now() + seconds * 1000,
    seconds,
  };
  log(`起火炼丹【${recipe.name}】，约需 ${fmtDuration(seconds)}`, 'event-special');
  return { ok: true, recipe, seconds, endsAt: state.alchemy.active.endsAt };
}

/** 主循环调用，推进炼制进度 */
export function tickAlchemy(dt) {
  const active = state.alchemy.active;
  if (active) {
    if (Date.now() >= active.endsAt) {
      const recipe = getAlchemyRecipe(active.recipeId);
      state.alchemy.active = null;
      if (recipe) resolveCraft(recipe);
      else log('丹炉开启，却发现丹方已失传', 'event-bad');
    }
  }
  if (state.alchemy.auto) maybeAutoAlchemy();
}

/** 自动炼丹：取"材料够且品阶最高"的丹方循环炼制 */
function maybeAutoAlchemy() {
  if (state.alchemy.active) return null;
  const candidates = knownRecipes()
    .filter((r) => hasMaterials(r.materials))
    .sort((a, b) => (b.tier - a.tier) || ((b.baseSuccess || 0) - (a.baseSuccess || 0)));
  if (candidates.length === 0) return null;
  const r = startCraft(candidates[0].id);
  return r.ok ? candidates[0] : null;
}

/** 开关自动炼丹（开启需丹房达标） */
export function setAutoAlchemy(on) {
  if (on) {
    if (buildingLevel('bld_alchemy') < AUTO_ALCHEMY_MIN_LEVEL) {
      return { ok: false, reason: `丹房需达 ${AUTO_ALCHEMY_MIN_LEVEL} 级方可自动炼丹` };
    }
    if (knownRecipes().length === 0) return { ok: false, reason: '尚未悟得任何丹方' };
  }
  state.alchemy.auto = !!on;
  log(on ? '开启自动炼丹' : '关闭自动炼丹', 'event-special');
  return { ok: true, auto: state.alchemy.auto };
}
