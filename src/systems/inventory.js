/**
 * 背包与装备系统。
 *
 * 职责：
 *   - 装备实例的生成（词条随机）与增减
 *   - 穿戴 / 卸下
 *   - 丹药服用（解释 pills.js 里出现的全部 effect.kind）
 *   - 材料 / 装备的出售与估值
 *   - 给 UI 用的分组渲染数据
 *
 * 经济铁律（防刷灵石）：
 *   卖出价 = 估值 × SELL_RATE，SELL_RATE 恒小于 1；
 *   材料买入价 = 原价 × BUY_MARKUP（>1）。
 *   因此任何"买入→卖出"的循环都必然亏损。
 *
 * 纯逻辑，禁止任何 DOM 操作。
 */

import {
  state, stonesToLow, addStones, addMaterial, materialCount,
  pillCount, addPill, consumePill,
} from '../core/state.js';
import { QUALITY_ORDER, QUALITIES, qualityOf, QUALITY_MULT } from '../data/qualities.js';
import { equipById } from '../data/equipments.js';
import { materialById, MATERIAL_KIND } from '../data/materials.js';
import { pillById } from '../data/pills.js';
import { SPIRIT_ROOTS } from '../data/spiritRoots.js';
import { randInt, randFloat, chance, weightedPick } from '../core/rng.js';
import { emit, EV } from '../core/bus.js';
import { fmt, fmtStones, fmtPct } from '../core/format.js';
import { gainCult, calcCultSpeed, calcMaxHp, calcMaxMp, addBuff, calcComprehension } from './cultivation.js';

// ==================== 经济常量 ====================

/** 卖出回收比例（永远 < 1，保证买卖必亏） */
export const SELL_RATE = 0.35;
/** 坊市材料买入加价（> 1，保证倒卖材料必亏） */
export const BUY_MARKUP = 2;

// ==================== 通用工具 ====================

function log(text, cls = 'event-special', channel = 'system') {
  emit(EV.LOG, { text, cls, channel });
}

/**
 * 境界索引 → 灵材/装备档次 tier(1~5)。
 * 炼气=1，筑基=2，金丹=3，元婴=4，化神及以上=5。
 */
export function realmTier(realmIndex = state.player.realmIndex) {
  const i = Math.max(0, realmIndex);
  if (i <= 8) return 1;
  if (i <= 11) return 2;
  if (i <= 14) return 3;
  if (i <= 17) return 4;
  return 5;
}

// ==================== 随机词条 ====================

/**
 * 词条池。base 为 tier1 基准值，perTier 为每高一档的增量；
 * 最终数值再乘品阶倍率并加一点随机浮动。
 * decimals 控制取整（暴击率这类小数值保留 3 位）。
 */
const AFFIX_DEFS = [
  { stat: 'atk',           name: '锋锐', base: 4,     perTier: 5,     decimals: 0, desc: (v) => `攻击 +${v}` },
  { stat: 'def',           name: '坚壁', base: 3,     perTier: 4,     decimals: 0, desc: (v) => `防御 +${v}` },
  { stat: 'hp',            name: '生机', base: 26,    perTier: 42,    decimals: 0, desc: (v) => `气血 +${v}` },
  { stat: 'mp',            name: '灵蕴', base: 14,    perTier: 24,    decimals: 0, desc: (v) => `灵力 +${v}` },
  { stat: 'spd',           name: '轻身', base: 1,     perTier: 1,     decimals: 0, desc: (v) => `身法 +${v}` },
  { stat: 'crit',          name: '锐意', base: 0.008, perTier: 0.008, decimals: 3, desc: (v) => `暴击 +${(v * 100).toFixed(1)}%` },
  { stat: 'comprehension', name: '慧根', base: 2,     perTier: 2,     decimals: 0, desc: (v) => `悟性 +${v}` },
  { stat: 'daoHeart',      name: '道心', base: 2,     perTier: 2,     decimals: 0, desc: (v) => `道心 +${v}` },
  { stat: 'spiritSense',   name: '神识', base: 2,     perTier: 2,     decimals: 0, desc: (v) => `神识 +${v}` },
  { stat: 'luck',          name: '福缘', base: 1,     perTier: 1,     decimals: 0, desc: (v) => `气运 +${v}` },
];

function roundBy(v, decimals) {
  const f = Math.pow(10, decimals || 0);
  return Math.round(v * f) / f;
}

/**
 * 按品阶掷随机词条。
 * 词条数量由 qualities.js 的 affixCount 决定（凡品 0 条 … 圣品 4 条）。
 * 数值随 tier 与 quality 双向放大，保证后期装备的追求空间。
 *
 * @returns {Array<{id:string,stat:string,value:number,name:string,desc:string}>}
 */
export function rollAffixes(quality = 'fan', tier = 1) {
  const q = qualityOf(quality);
  const count = q.affixCount || 0;
  if (count <= 0) return [];

  const scale = QUALITY_MULT[quality] || 1;
  const pool = AFFIX_DEFS.slice();
  const out = [];

  for (let i = 0; i < count && pool.length > 0; i++) {
    // 不重复地抽词条，避免同一条属性出现两次
    const idx = randInt(0, pool.length - 1);
    const def = pool.splice(idx, 1)[0];

    const baseVal = (def.base + def.perTier * Math.max(0, tier - 1)) * scale;
    let v = roundBy(baseVal * randFloat(0.85, 1.2), def.decimals);
    // 兜底：四舍五入后可能为 0，给一个最小值
    if (v <= 0) v = roundBy(Math.max(def.decimals > 0 ? 0.001 : 1, baseVal * 0.5), def.decimals);

    out.push({
      id: `af_${def.stat}`,
      stat: def.stat,
      value: v,
      name: def.name,
      desc: def.desc(v),
    });
  }
  return out;
}

// ==================== 装备实例 ====================

/**
 * 装备估值（不含卖出折价）。
 * 以 data/equipments.js 的 price 为锚，按"实例品阶 / 基础品阶"的倍率、
 * 等级与词条数放大。买入价即以此为基准，卖出再乘 SELL_RATE。
 */
export function equipmentValue(inst) {
  if (!inst) return 0;
  const base = equipById(inst.baseId);
  if (!base) return 0;
  const qRatio = (QUALITY_MULT[inst.quality] || 1) / (QUALITY_MULT[base.quality] || 1);
  const lvScale = 1 + Math.max(0, (inst.level || 1) - 1) * 0.12;
  const affixBonus = (inst.affixes?.length || 0) * 0.08;
  return Math.max(1, Math.floor(base.price * qRatio * lvScale * (1 + affixBonus)));
}

/** 出售某件实例可得的灵石（下品） */
export function equipmentSellPrice(inst) {
  return Math.max(1, Math.floor(equipmentValue(inst) * SELL_RATE));
}

/**
 * 生成一件装备实例（默认不入包）。
 * opts: { quality, level, affixes, tier, add }
 *   - add=true 时直接进入背包
 */
export function createEquipment(baseId, opts = {}) {
  const base = equipById(baseId);
  if (!base) return null;

  const quality = opts.quality || base.quality;
  const level = Math.max(1, Math.floor(opts.level || 1));
  const tier = opts.tier || base.tier || 1;
  // 未显式指定词条时，按最终品阶现掷
  const affixes = opts.affixes !== undefined ? opts.affixes : rollAffixes(quality, tier);

  const inst = {
    uid: state.equipment.nextUid++,
    baseId,
    quality,
    level,
    affixes: affixes || [],
  };
  if (opts.add) state.equipment.owned.push(inst);
  return inst;
}

/** 生成并直接入包，返回实例 */
export function addEquipment(baseId, opts = {}) {
  const inst = createEquipment(baseId, { ...opts, add: true });
  if (!inst) return null;
  const base = equipById(baseId);
  emit(EV.ITEM_GAIN, { kind: 'equip', uid: inst.uid, baseId, quality: inst.quality });
  log(`获得 ${qualityOf(inst.quality).name}·${base?.name || baseId}`, 'event-special');
  return inst;
}

/** 按 uid 查找实例（含已穿戴） */
export function findEquipment(uid) {
  return state.equipment.owned.find((e) => e.uid === uid) || null;
}

/** 该实例是否正被穿戴 */
export function isEquipped(uid) {
  return Object.values(state.equipment.equipped).includes(uid);
}

function equippedInSlot(slot) {
  const uid = state.equipment.equipped[slot];
  if (uid == null) return null;
  return findEquipment(uid);
}

// ==================== 穿脱 ====================

/** 装备，自动判定槽位。 */
export function equipItem(uid) {
  const inst = findEquipment(uid);
  if (!inst) return { ok: false, reason: '没有这件装备' };
  const base = equipById(inst.baseId);
  if (!base) return { ok: false, reason: '装备数据缺失' };
  if (state.player.realmIndex < (base.minRealm || 0)) {
    return { ok: false, reason: `境界不足，需第 ${(base.minRealm || 0) + 1} 重境界方可装备` };
  }
  const slot = base.slot;
  const prev = equippedInSlot(slot);
  state.equipment.equipped[slot] = uid;
  // V6.0 功课：更换装备的次数
  state.stats.equipOps = (state.stats.equipOps || 0) + 1;
  emit(EV.ITEM_USE, { kind: 'equip', uid, slot });
  const prevText = prev && prev.uid !== uid ? '，换下 ' + (equipById(prev.baseId)?.name || '旧装备') : '';
  log(`换上 ${qualityOf(inst.quality).name}·${base.name}${prevText}`, 'event-good');
  return { ok: true, slot, replaced: prev && prev.uid !== uid ? prev.uid : null };
}

/** 卸下指定槽位（物品仍留在背包） */
export function unequipSlot(slot) {
  if (!(slot in state.equipment.equipped)) return { ok: false, reason: '槽位不存在' };
  const uid = state.equipment.equipped[slot];
  if (uid == null) return { ok: false, reason: '该槽位本就空着' };
  state.equipment.equipped[slot] = null;
  emit(EV.ITEM_USE, { kind: 'unequip', uid, slot });
  log(`卸下 ${equipById(findEquipment(uid)?.baseId)?.name || '装备'}`, 'event-special');
  return { ok: true, uid };
}

// ==================== 丹药服用 ====================

/**
 * 服用一枚丹药，解释 effect.kind 的全部取值：
 *   cult / restoreHp / restoreMp / breakthrough / buff / attr / rerollRoot / lifespan
 * breakthrough 类不可直接服用（由突破流程消费）。
 */
export function usePill(pillId) {
  const pill = pillById(pillId);
  if (!pill) return { ok: false, reason: '查无此丹' };
  if (pillCount(pillId) <= 0) return { ok: false, reason: '丹药不足' };

  const e = pill.effect || {};
  const kind = e.kind;

  // 突破丹必须在突破时使用，直接服用无效且不消耗
  if (kind === 'breakthrough') {
    return { ok: false, reason: '突破类丹药不可直接服用，请在突破时使用' };
  }

  // 修为丹锚定当前修炼速率，飞升之后速率为 0，服下去只会白扔一枚
  if (kind === 'cult' && calcCultSpeed() <= 0) {
    return { ok: false, reason: '修为已至绝顶，此丹于你无用' };
  }

  let text = '';
  let cls = 'event-good';

  switch (kind) {
    case 'cult': {
      // 修为丹按"当前修炼速率的 seconds 息产出"结算，而不是固定值。
      // 固定值两头都不对：炼气一层一颗顶 2.4 个境界，渡劫期同一颗只值 0.88 息。
      // 锚定速率后，一颗丹相对产能的贡献恒定，与战斗/奇遇奖励同口径。
      // 品阶越高 seconds 越大，见 data/pills.js 的 CULT_SECONDS_BY_QUALITY。
      const secs = e.seconds || 0;
      const want = Math.floor(calcCultSpeed() * secs);
      const got = gainCult(want, '丹药');
      // 修为在境界内封顶（见 cultivation.gainCult），临近突破时会被截断。
      // 这时要说清楚"少了"，否则玩家会以为丹药失效。
      text = got < want
        ? `服下${pill.name}，修为 +${fmt(got)}（本境修为已近圆满，余力散入四肢百骸）`
        : `服下${pill.name}，修为 +${fmt(got)}`;
      break;
    }
    case 'restoreHp': {
      const max = calcMaxHp();
      const before = state.player.hp;
      state.player.hp = Math.min(max, before + max * (e.pct ?? 0.3));
      text = `服下${pill.name}，气血 +${fmt(Math.round(state.player.hp - before))}`;
      break;
    }
    case 'restoreMp': {
      const max = calcMaxMp();
      const before = state.player.mp;
      state.player.mp = Math.min(max, before + max * (e.pct ?? 0.3));
      text = `服下${pill.name}，灵力 +${fmt(Math.round(state.player.mp - before))}`;
      break;
    }
    case 'buff': {
      const b = e.buff || {};
      addBuff({
        id: `pill_${pill.id}`,
        name: pill.name,
        stat: b.stat || 'cult',
        mult: b.mult,
        add: b.add,
        duration: b.duration || 600,
      });
      const parts = [];
      if (b.mult && b.mult !== 1) parts.push(`×${b.mult}`);
      if (b.add) parts.push(`+${fmtPct(b.add)}`);
      text = `服下${pill.name}，${b.stat === 'breakthrough' ? '突破成功率' : '修炼速率'} ${parts.join(' ')}（${Math.round((b.duration || 600) / 60)} 分钟）`;
      break;
    }
    case 'attr': {
      const attr = e.attr || 'luck';
      state.player.attributes = state.player.attributes || {};
      state.player.attributes[attr] = (state.player.attributes[attr] || 0) + (e.value || 0);
      text = `服下${pill.name}，${ATTR_NAMES[attr] || attr} 永久 +${fmt(e.value || 0)}`;
      cls = 'event-special';
      break;
    }
    case 'rerollRoot': {
      const ok = chance(e.chance ?? 0.3);
      if (ok) {
        const root = weightedPick(SPIRIT_ROOTS);
        state.player.spiritRoot = root;
        text = `${pill.name}药力化开，灵根重塑为【${root.name}】！`;
        cls = 'event-special';
      } else {
        text = `${pill.name}药力散尽，灵根纹丝不动。重塑失败`;
        cls = 'event-bad';
      }
      break;
    }
    case 'lifespan': {
      state.player.attributes = state.player.attributes || {};
      const cur = state.player.attributes.lifespan || 0;
      state.player.attributes.lifespan = cur + (e.value || 0);
      text = `服下${pill.name}，寿元 +${fmt(e.value || 0)} 年`;
      cls = 'event-special';
      break;
    }
    default:
      return { ok: false, reason: '未识别的丹效，无法服用' };
  }

  consumePill(pillId, 1);
  emit(EV.ITEM_USE, { kind: 'pill', id: pill.id });
  log(text, cls);
  return { ok: true, text };
}

const ATTR_NAMES = {
  comprehension: '悟性', daoHeart: '道心', spiritSense: '神识', luck: '气运', lifespan: '寿元',
};

// ==================== 出售 ====================

/** 卖出一件装备实例（穿戴中的需先卸下） */
export function sellEquipment(uid) {
  const list = state.equipment.owned;
  const idx = list.findIndex((e) => e.uid === uid);
  if (idx < 0) return { ok: false, reason: '没有这件装备' };
  if (isEquipped(uid)) return { ok: false, reason: '请先卸下该装备再出售' };

  const inst = list[idx];
  const base = equipById(inst.baseId);
  const gain = equipmentSellPrice(inst);
  list.splice(idx, 1);
  addStones(gain);
  log(`卖出 ${qualityOf(inst.quality).name}·${base?.name || inst.baseId}，得 ${fmt(gain)} 灵石`, 'event-good');
  return { ok: true, gain };
}

/** 卖出材料，count 省略时全部卖出 */
export function sellMaterial(id, count) {
  const have = materialCount(id);
  const n = count == null ? have : Math.min(Math.max(0, Math.floor(count)), have);
  if (n <= 0) return { ok: false, reason: '材料不足' };
  const mat = materialById(id);
  const unit = Math.max(1, Math.floor((mat?.price || 1) * SELL_RATE));
  addMaterial(id, -n);
  addStones(unit * n);
  log(`卖出 ${mat?.name || id} ×${n}，得 ${fmt(unit * n)} 灵石`, 'event-good');
  return { ok: true, gain: unit * n, count: n };
}

/** 批量卖出所有低于指定品阶的未穿戴装备。qualityId 用 qualities.js 的 id。 */
export function sellAllBelow(qualityId) {
  const limit = qualityOf(qualityId).order;
  const targets = state.equipment.owned
    .filter((inst) => !isEquipped(inst.uid) && qualityOf(inst.quality).order < limit)
    .map((inst) => inst.uid);
  let stones = 0;
  for (const uid of targets) {
    const r = sellEquipment(uid);
    if (r.ok) stones += r.gain;
  }
  if (targets.length > 0) {
    log(`清理低品阶装备 ${targets.length} 件，共得 ${fmt(stones)} 灵石`, 'event-special');
  }
  return { ok: true, count: targets.length, stones };
}

// ==================== 估值与 UI 分组 ====================

/** 背包（含已穿戴）估值总额 */
export function inventoryValue() {
  return state.equipment.owned.reduce((sum, inst) => sum + equipmentValue(inst), 0);
}

/** 返回 UI 可直接渲染的分组数据 */
export function groupInventory() {
  const equippedUids = new Set(Object.values(state.equipment.equipped).filter((u) => u != null));

  const equipment = state.equipment.owned
    .map((inst) => {
      const base = equipById(inst.baseId);
      const q = qualityOf(inst.quality);
      return {
        kind: 'equip',
        uid: inst.uid,
        baseId: inst.baseId,
        name: base?.name || inst.baseId,
        slot: base?.slot || 'treasure',
        slotName: SLOT_NAMES[base?.slot] || '法宝',
        minRealm: base?.minRealm || 0,
        quality: inst.quality,
        qualityName: q.name,
        qualityCss: q.css,
        level: inst.level,
        affixes: inst.affixes || [],
        equipped: equippedUids.has(inst.uid),
        value: equipmentValue(inst),
        sell: equipmentSellPrice(inst),
      };
    })
    .sort((a, b) => {
      const qd = qualityOf(b.quality).order - qualityOf(a.quality).order;
      if (qd !== 0) return qd;
      return (b.level || 1) - (a.level || 1);
    });

  const materials = Object.entries(state.resources.materials)
    .filter(([, c]) => c > 0)
    .map(([id, count]) => {
      const m = materialById(id);
      return {
        kind: 'material',
        id,
        name: m?.name || id,
        count,
        tier: m?.tier || 1,
        materialKind: m?.kind || 'herb',
        materialKindName: MATERIAL_KIND[m?.kind] || '灵材',
        price: m?.price || 0,
        sell: Math.max(1, Math.floor((m?.price || 1) * SELL_RATE)),
      };
    })
    .sort((a, b) => b.tier - a.tier || a.id.localeCompare(b.id));

  const pills = Object.entries(state.consumables)
    .filter(([, c]) => c > 0)
    .map(([id, count]) => {
      const p = pillById(id);
      const q = qualityOf(p?.quality || 'fan');
      return {
        kind: 'pill',
        id,
        name: p?.name || id,
        count,
        quality: p?.quality || 'fan',
        qualityName: q.name,
        qualityCss: q.css,
        desc: p?.desc || '',
        usable: p?.effect?.kind !== 'breakthrough',
      };
    });

  return {
    equipment,
    materials,
    pills,
    stones: { ...state.resources.stones, totalLow: stonesToLow() },
  };
}

const SLOT_NAMES = { weapon: '武器', armor: '护甲', treasure: '法宝' };
export { SLOT_NAMES };
