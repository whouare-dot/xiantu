/**
 * 存档：序列化、读档、版本迁移、导入导出、多存档槽。
 *
 * 迁移策略：
 *  1. 旧版（demo 的 1.x）存档结构差异极大，走 migrateFromV1 显式转换。
 *  2. 同大版本内的字段增减，走 mergeDefaults 自动补齐默认值。
 *  3. 关键教训：旧代码用 `save.x || 默认值`，导致 0 被当成缺失值。
 *     本文件一律用 `??`，绝不把合法的 0 当成 falsy 丢掉。
 */

import {
  state, setState, createInitialState, SAVE_VERSION,
} from './state.js';
import { SPIRIT_ROOTS, rootByName } from '../data/spiritRoots.js';
import { pillByName } from '../data/pills.js';
import { techByName } from '../data/techniques.js';
import { equipByName, equipById } from '../data/equipments.js';
import { emit, EV } from './bus.js';

export const SLOT_COUNT = 3;
const KEY_PREFIX = 'xiantu_v2_slot';
const KEY_ACTIVE = 'xiantu_v2_active';
const LEGACY_KEY = 'xiantu_save';

export function slotKey(slot) {
  return `${KEY_PREFIX}${slot}`;
}

export function getActiveSlot() {
  const s = parseInt(localStorage.getItem(KEY_ACTIVE), 10);
  return Number.isInteger(s) && s >= 1 && s <= SLOT_COUNT ? s : 1;
}

export function setActiveSlot(slot) {
  localStorage.setItem(KEY_ACTIVE, String(slot));
}

// ==================== 默认值合并 ====================

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * 用 defaults 补齐 target 缺失的字段（就地进行）。
 * 数组与原始值以 target 为准；target 里是 undefined 的才用默认值。
 */
export function mergeDefaults(target, defaults) {
  for (const [k, dv] of Object.entries(defaults)) {
    const tv = target[k];
    if (tv === undefined || tv === null) {
      target[k] = isPlainObject(dv) ? structuredClone(dv) : Array.isArray(dv) ? [...dv] : dv;
    } else if (isPlainObject(tv) && isPlainObject(dv)) {
      mergeDefaults(tv, dv);
    }
  }
  return target;
}

// ==================== 旧版迁移 ====================

/** 旧版灵石是单个数字，新体系是上/中/下品。给 10 倍补偿，避免老玩家资产缩水。 */
function migrateStones(rawStones) {
  const s = { low: Math.max(0, Math.floor((rawStones ?? 50) * 10)), mid: 0, high: 0 };
  carryStones(s);
  return s;
}

/** 灵石进位：100 下品 = 1 中品，100 中品 = 1 上品 */
function carryStones(s) {
  if (s.low >= 100) { s.mid += Math.floor(s.low / 100); s.low %= 100; }
  if (s.mid >= 100) { s.high += Math.floor(s.mid / 100); s.mid %= 100; }
}

/**
 * 旧版装备名 → 新装备表 id 的映射。
 *
 * 新版重做了整套装备（36 件，全新命名），旧版的「紫电剑」「玄武甲」等
 * 在新表里根本不存在。如果不做这层映射，老玩家的装备会在迁移时被静默丢弃——
 * 这是最伤人的那种 bug，所以这里显式对齐，按槽位与强度档位一一对应。
 */
const LEGACY_EQUIP_MAP = {
  // 兵器
  青锋剑: 'eq_qingwen_sword',   // atk 8
  精钢剑: 'eq_taomu_blade',     // atk 7 + spd
  紫电剑: 'eq_hanxing_dagger',  // atk 16 + spd
  太乙剑: 'eq_liuyun_sword',    // atk 150 + spd
  诛仙剑: 'eq_zhuxian_sword',   // 同名对应
  轩辕剑: 'eq_taichu_sword',    // 顶级仙剑
  // 护甲
  布衣: 'eq_cloth_robe',
  道袍: 'eq_beast_leather',
  金丝甲: 'eq_qingmu_shield',
  玄武甲: 'eq_xuantie_armor',
  太极道袍: 'eq_ziyu_robe',
  // 法宝
  护心镜: 'eq_tongling_fu',
  乾坤袋: 'eq_huoyun_bead',
  混天绫: 'eq_hanjing_bead',
  九龙神火罩: 'eq_yaodan_orb',
};

/** 旧版功法 id → 旧名字 */
const LEGACY_TECH_ID_TO_NAME = {
  f1: '吐纳术', f2: '五行诀', f3: '太虚剑诀', f4: '九转金丹诀', f5: '混沌无极功',
};

/** 旧版 equipped 里存的 id（w1/a1/t1 这种）→ 旧名字 */
const LEGACY_ID_TO_NAME = {
  w1: '青锋剑', w2: '精钢剑', w3: '紫电剑', w4: '太乙剑', w5: '诛仙剑', w6: '轩辕剑',
  a1: '布衣', a2: '道袍', a3: '金丝甲', a4: '玄武甲', a5: '太极道袍',
  t1: '护心镜', t2: '乾坤袋', t3: '混天绫', t4: '九龙神火罩',
};

/** 按旧名解析出新版装备定义；名字直接命中新表时优先用新表 */
function resolveLegacyEquip(name) {
  return equipByName(name) || equipById(LEGACY_EQUIP_MAP[name] ?? '') || null;
}

/** 把旧版 inventory 的 {type,name} 转成新结构 */
function migrateInventory(rawInv, next) {
  const inv = { consumables: {}, equipment: [], techniques: [] };
  if (!Array.isArray(rawInv)) return inv;

  for (const it of rawInv) {
    if (!it || !it.name) continue;

    if (it.type === 'pill') {
      const pill = pillByName(it.name);
      if (pill) inv.consumables[pill.id] = (inv.consumables[pill.id] || 0) + 1;
      continue;
    }

    if (it.type === 'technique') {
      const tech = techByName(it.name);
      if (tech && !inv.techniques.includes(tech.id)) inv.techniques.push(tech.id);
      continue;
    }

    const eq = resolveLegacyEquip(it.name);
    if (eq && !inv.equipment.some((e) => e.baseId === eq.id)) {
      inv.equipment.push({
        uid: next.uid++,
        baseId: eq.id,
        quality: eq.quality,
        level: 1,
        affixes: [],
      });
    }
  }
  return inv;
}

/** 把旧版 equipped 按名字映射到新装备实例 */
function migrateEquipped(rawEquipped, equipmentList, next) {
  const result = { weapon: null, armor: null, treasure: null };
  if (!rawEquipped) return result;

  for (const slot of ['weapon', 'armor', 'treasure']) {
    const legacyId = rawEquipped[slot];
    if (!legacyId) continue;
    const legacyName = LEGACY_ID_TO_NAME[legacyId] || legacyId;
    const base = resolveLegacyEquip(legacyName);
    if (!base) continue;

    // 优先复用背包里已有的同名装备，否则补发一件
    let inst = equipmentList.find((e) => e.baseId === base.id);
    if (!inst) {
      inst = { uid: next.uid++, baseId: base.id, quality: base.quality, level: 1, affixes: [] };
      equipmentList.push(inst);
    }
    result[slot] = inst.uid;
  }
  return result;
}

/**
 * 从 demo 的 1.x 存档迁移。返回新结构（未注册到 state）。
 */
export function migrateFromV1(old) {
  const fresh = createInitialState(old.playerName ?? '无名散修');

  fresh.player.name = old.playerName ?? '无名散修';
  fresh.player.realmIndex = Number.isFinite(old.realmIndex) ? old.realmIndex : 0;
  fresh.player.cult = Number.isFinite(old.cult) ? old.cult : 0;
  fresh.player.maxHp = Number.isFinite(old.maxHp) && old.maxHp > 0 ? old.maxHp : 100;
  fresh.player.hp = Number.isFinite(old.hp) ? Math.min(old.hp, fresh.player.maxHp) : fresh.player.maxHp;

  const root = rootByName(old.spiritRoot?.name);
  if (root) fresh.player.spiritRoot = root;

  if (Number.isFinite(old.baseAtk)) fresh.player.base.atk = old.baseAtk;
  if (Number.isFinite(old.baseDef)) fresh.player.base.def = old.baseDef;
  if (Number.isFinite(old.luck)) fresh.player.base.luck = old.luck;

  fresh.resources.stones = migrateStones(old.stones);

  const next = { uid: 1 };
  const inv = migrateInventory(old.inventory, next);

  fresh.consumables = inv.consumables;
  fresh.equipment.owned = inv.equipment;
  fresh.equipment.nextUid = next.uid;
  fresh.equipment.equipped = migrateEquipped(old.equipped, inv.equipment, next);

  // 功法：旧版按名字映射到新功法表，统一从第 1 重开始（旧版没有层数概念）。
  // 先清空初始行囊带的那本吐纳术——装备那边已经用同样方式替换过了，
  // 迁移的语义应当是"精确还原玩家原有的东西"，而不是"原有 + 新手礼包"。
  fresh.techniques.known = {};
  fresh.techniques.equipped = [];
  for (const tid of inv.techniques) {
    fresh.techniques.known[tid] = { level: 1, exp: 0 };
  }
  // 旧版主修功法（equipped.technique 存的是 'f3' 这种 id）
  const legacyTechName = LEGACY_TECH_ID_TO_NAME[old.equipped?.technique];
  if (legacyTechName) {
    const tech = techByName(legacyTechName);
    if (tech) {
      if (!fresh.techniques.known[tech.id]) fresh.techniques.known[tech.id] = { level: 1, exp: 0 };
      fresh.techniques.equipped = [tech.id];
    }
  }

  if (old.autoBreakthroughEnabled) fresh.meta.autoBreakthrough = true;

  // 旧日志转新格式
  if (Array.isArray(old.logEntries)) {
    fresh.log = old.logEntries.slice(-50).map((e) => ({
      t: Date.now(),
      text: String(e.text ?? ''),
      cls: e.cls ?? '',
      channel: 'system',
    }));
  }

  fresh.meta.migratedFrom = old.version ?? '1.x';
  return fresh;
}

// ==================== 读写 ====================

export function serialize(s = state) {
  return JSON.stringify(s);
}

/** 反序列化 + 迁移 + 补默认值。返回可用状态，失败返回 null。 */
export function deserialize(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isPlainObject(raw)) return null;

  // 旧版：没有 meta.version 或者还是 1.x
  const version = raw.meta?.version ?? raw.version;
  let next;
  if (!version || version.startsWith('1.')) {
    next = migrateFromV1(raw);
  } else {
    next = raw;
    mergeDefaults(next, createInitialState());
  }

  next.meta.version = SAVE_VERSION;
  if (next.resources?.stones) {
    const s = next.resources.stones;
    s.low = Math.max(0, Math.floor(s.low ?? 0));
    s.mid = Math.max(0, Math.floor(s.mid ?? 0));
    s.high = Math.max(0, Math.floor(s.high ?? 0));
    carryStones(s);
  }
  return next;
}

/** 保存到指定槽位（默认当前激活槽） */
/**
 * 重开档闸门。
 *
 * ⚠ 这个标志不是可有可无的保险，它修的是一个**真实存在且用户可见的 bug**：
 * 「重开此世」的做法是「删掉 localStorage → location.reload()」，
 * 而 `location.reload()` 会触发 `beforeunload`，main.js 在那里无条件存了一次档
 * ——**刚被删掉的存档立刻又被写了回去**，重开按钮等于没按。
 *
 * 实测复现：删档 → 导航 → 存档依然在，世数依然是原来那一世。
 *
 * 所以重开必须走 `wipeSlots()`，由它把闸门关上，之后所有 save() 一律空转，
 * 直到 reload 后重新加载模块。
 */
let wipeInProgress = false;

/** 重开档：清空全部槽位与旧版存档，并封住写入（见上方说明） */
export function wipeSlots(slots = [1, 2, 3]) {
  wipeInProgress = true;
  for (const s of slots) {
    try { localStorage.removeItem(slotKey(s)); } catch { /* 忽略：清不掉也不该中断重开 */ }
  }
  try { localStorage.removeItem(LEGACY_KEY); } catch { /* 同上 */ }
  return true;
}

export function save(slot = getActiveSlot()) {
  // 重开档进行中：绝不能再把档写回去
  if (wipeInProgress) return false;
  try {
    state.meta.lastTick = Date.now();
    localStorage.setItem(slotKey(slot), serialize());
    return true;
  } catch (e) {
    console.warn('[save] 存档失败:', e);
    return false;
  }
}

/** 从槽位读取并装载到全局 state */
export function load(slot = getActiveSlot()) {
  const text = localStorage.getItem(slotKey(slot));
  if (!text) return false;
  const next = deserialize(text);
  if (!next) return false;
  setState(next);
  return true;
}

/** 首次运行：尝试把 demo 旧存档迁移过来 */
export function tryMigrateLegacy() {
  // 已经有 V2 存档就不迁移
  for (let i = 1; i <= SLOT_COUNT; i++) {
    if (localStorage.getItem(slotKey(i))) return false;
  }
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (!legacy) return false;
  try {
    const old = JSON.parse(legacy);
    const migrated = migrateFromV1(old);
    setState(migrated);
    save(1);
    setActiveSlot(1);
    // 保留旧存档不删，以防迁移有误玩家还能回退
    return true;
  } catch (e) {
    console.warn('[save] 旧存档迁移失败:', e);
    return false;
  }
}

export function hasSave(slot) {
  return !!localStorage.getItem(slotKey(slot));
}

export function slotInfo(slot) {
  const text = localStorage.getItem(slotKey(slot));
  if (!text) return null;
  try {
    const raw = JSON.parse(text);
    const version = raw.meta?.version ?? raw.version ?? '?';
    const realmIndex = raw.player?.realmIndex ?? raw.realmIndex ?? 0;
    return {
      version,
      realmIndex,
      name: raw.player?.name ?? raw.playerName ?? '无名散修',
      lastSave: raw.meta?.lastTick ?? raw.lastSave ?? 0,
    };
  } catch {
    return null;
  }
}

export function deleteSlot(slot) {
  localStorage.removeItem(slotKey(slot));
}

// ==================== 导入导出 ====================

export function exportCode() {
  const json = serialize();
  // 中文占多数，先做 UTF-8 百分号编码再转 base64，避免 btoa 报错
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return 'XT2:' + btoa(bin);
}

export function importCode(code) {
  const trimmed = (code ?? '').trim();
  if (!trimmed.startsWith('XT2:')) return { ok: false, error: '存档码格式不正确' };
  try {
    const bin = atob(trimmed.slice(4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const next = deserialize(json);
    if (!next) return { ok: false, error: '存档内容已损坏' };
    setState(next);
    save();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: '解析失败：' + e.message };
  }
}
