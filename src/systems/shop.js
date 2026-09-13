/**
 * 坊市系统。
 *
 * 三块内容：
 *   1. 常规货架 shopStock —— 严格按 minRealm 过滤，不给新手看买不起的东西
 *   2. 买卖 buy / sell —— 价格全部以灵石（下品）计价
 *   3. 拍卖行 auctionStock —— 按现实时间每 6 小时轮换一批稀有货，
 *      给后期玩家一个灵石去处
 *
 * 防刷灵石约定：
 *   - 买入价 ≥ 原价，卖出价 = 原价 × SELL_RATE(<1)，买卖必亏
 *   - 拍卖价在买入价基础上再加溢价，倒卖只会亏得更多
 *   - 丹方 / 器图一旦学会无法出售
 *
 * 纯逻辑，禁止任何 DOM 操作。
 */

import {
  state, noteKind, stonesToLow, spendStones, addStones, addMaterial, materialCount,
  addPill, pillCount, consumePill,
} from '../core/state.js';
import { emit, EV } from '../core/bus.js';
import { fmt, fmtStones, fmtDuration } from '../core/format.js';
import { PILLS, pillById } from '../data/pills.js';
import { MATERIALS, materialById } from '../data/materials.js';
import { EQUIPMENTS, equipById } from '../data/equipments.js';
import { qualityOf } from '../data/qualities.js';
import { shopPriceMult } from './stance.js';
import {
  SELL_RATE, BUY_MARKUP, realmTier, createEquipment, sellEquipment, sellMaterial,
} from './inventory.js';
import { allAlchemyRecipes, getAlchemyRecipe, learnRecipe } from './alchemy.js';
import { allForgeRecipes, getForgeRecipe, learnForgeRecipe } from './forging.js';

function log(text, cls = 'event-special', channel = 'system') {
  emit(EV.LOG, { text, cls, channel });
}

// ==================== 价格 ====================

export function pillBuyPrice(pill) {
  // 立场会影响坊市物价（正道 9 折 / 邪道 1.3 倍），买入与界面显示共用这一处
  return Math.max(1, Math.floor((pill?.price || 1) * shopPriceMult()));
}
export function pillSellPrice(pill) { return Math.max(1, Math.floor((pill?.price || 1) * SELL_RATE)); }
export function materialBuyPrice(mat) {
  return Math.max(1, Math.ceil((mat?.price || 1) * BUY_MARKUP * shopPriceMult()));
}
export function materialSellPrice(mat) { return Math.max(1, Math.floor((mat?.price || 1) * SELL_RATE)); }
/** 装备买入价 = 数据表 price（与实例估值在基础品阶/1级时一致） */
export function equipBuyPrice(base) {
  return Math.max(1, Math.floor((base?.price || 1) * shopPriceMult()));
}
export function recipeBuyPrice(recipe) {
  return Math.max(0, Math.floor((recipe?.learnCost || 0) * shopPriceMult()));
}

// ==================== 货架 ====================

/**
 * 按境界解锁商品。
 * @param {number} [realmIndex] 不传则用玩家当前境界
 */
export function shopStock(realmIndex) {
  const ri = Math.max(0, realmIndex ?? state.player.realmIndex);
  const maxTier = realmTier(ri) + 1; // 允许看到下一档，但不放更高
  const stones = stonesToLow();

  const pills = PILLS
    // noShop 的丹药（五档修为丹）不上架。理由见 data/pills.js 顶部：
    // 灵石收入的增长（约 18000 倍）远快于修为速度（25 倍），任何静态价都会
    // 在低境界贵得没人买、在高境界便宜得离谱。它们改走奇遇 / 宗门 / 自炼。
    .filter((p) => !p.noShop && (p.minRealm ?? 0) <= ri)
    .map((p) => ({
      kind: 'pill',
      id: p.id,
      name: p.name,
      quality: p.quality,
      qualityName: qualityOf(p.quality).name,
      qualityCss: qualityOf(p.quality).css,
      desc: p.desc,
      minRealm: p.minRealm ?? 0,
      price: pillBuyPrice(p),
      sell: pillSellPrice(p),
      affordable: stones >= pillBuyPrice(p),
    }));

  const equips = EQUIPMENTS
    .filter((e) => (e.minRealm ?? 0) <= ri && (e.tier ?? 1) <= maxTier)
    .map((e) => ({
      kind: 'equip',
      id: e.id,
      name: e.name,
      slot: e.slot,
      tier: e.tier,
      quality: e.quality,
      qualityName: qualityOf(e.quality).name,
      qualityCss: qualityOf(e.quality).css,
      minRealm: e.minRealm ?? 0,
      desc: e.desc,
      price: equipBuyPrice(e),
      affordable: stones >= equipBuyPrice(e),
    }));

  const materials = MATERIALS.map((m) => ({
    kind: 'material',
    id: m.id,
    name: m.name,
    tier: m.tier,
    materialKind: m.kind,
    desc: m.desc,
    price: materialBuyPrice(m),
    sell: materialSellPrice(m),
    affordable: stones >= materialBuyPrice(m),
  }));

  const recipes = [...allAlchemyRecipes(), ...allForgeRecipes()]
    .filter((r) => (r.minRealm ?? 0) <= ri)
    .map((r) => ({
      kind: 'recipe',
      id: r.id,
      name: r.name,
      type: r.pillId ? 'alchemy' : 'forge',
      tier: r.tier,
      minRealm: r.minRealm ?? 0,
      materials: r.materials,
      baseSeconds: r.baseSeconds,
      baseSuccess: r.baseSuccess,
      price: recipeBuyPrice(r),
      learned: (state.alchemy.knownRecipes || []).includes(r.id)
        || (state.forging.knownRecipes || []).includes(r.id),
      affordable: stones >= recipeBuyPrice(r),
    }));

  return { realmIndex: ri, stones: { ...state.resources.stones, totalLow: stones }, pills, equips, materials, recipes };
}

// ==================== 买入 ====================

/**
 * 买入。kind: 'pill' | 'equip' | 'material' | 'recipe'
 * @returns {{ok:boolean, reason?:string, spent?:number, gained?:any}}
 */
export function buy(kind, id, count = 1) {
  const r = doBuy(kind, id, count);
  // V6.0 功课：记下"在坊市买过哪几种东西"。只有成功才记——
  // 灵石不足、境界不够都不该算数。带 kind 前缀是因为丹药与材料可能撞 id。
  if (r?.ok) noteKind('shopBuy', `${kind}:${id}`);
  return r;
}

function doBuy(kind, id, count = 1) {
  count = Math.max(1, Math.floor(count || 1));

  if (kind === 'pill') {
    const p = pillById(id);
    if (!p) return { ok: false, reason: '查无此丹' };
    if (p.noShop) return { ok: false, reason: '此丹坊市不售' };
    if (state.player.realmIndex < (p.minRealm ?? 0)) return { ok: false, reason: '境界不足，此物于你无用' };
    const total = pillBuyPrice(p) * count;
    if (stonesToLow() < total) return { ok: false, reason: `灵石不足（需 ${fmt(total)}）` };
    if (!spendStones(total)) return { ok: false, reason: '灵石不足' };
    addPill(id, count);
    log(`买入【${p.name}】×${count}，耗灵石 ${fmt(total)}`, 'event-special');
    return { ok: true, spent: total, gained: count };
  }

  if (kind === 'material') {
    const m = materialById(id);
    if (!m) return { ok: false, reason: '查无此材' };
    const total = materialBuyPrice(m) * count;
    if (!spendStones(total)) return { ok: false, reason: `灵石不足（需 ${fmt(total)}）` };
    addMaterial(id, count);
    log(`买入【${m.name}】×${count}，耗灵石 ${fmt(total)}`, 'event-special');
    return { ok: true, spent: total, gained: count };
  }

  if (kind === 'equip') {
    const base = equipById(id);
    if (!base) return { ok: false, reason: '查无此器' };
    if (state.player.realmIndex < (base.minRealm ?? 0)) return { ok: false, reason: '境界不足，无法驾驭' };
    const total = equipBuyPrice(base);
    if (!spendStones(total)) return { ok: false, reason: `灵石不足（需 ${fmt(total)}）` };
    const inst = createEquipment(base.id, { add: true });
    log(`买入【${qualityOf(base.quality).name}·${base.name}】，耗灵石 ${fmt(total)}`, 'event-special');
    emit(EV.ITEM_GAIN, { kind: 'equip', uid: inst?.uid, baseId: base.id, quality: base.quality });
    return { ok: true, spent: total, gained: inst };
  }

  if (kind === 'recipe') {
    // 丹方 / 器图的"购买"即参悟，费用走 learnRecipe 内部
    if (getAlchemyRecipe(id)) {
      const r = learnRecipe(id);
      return r.ok ? { ok: true, spent: r.cost, gained: id } : r;
    }
    if (getForgeRecipe(id)) {
      const r = learnForgeRecipe(id);
      return r.ok ? { ok: true, spent: r.cost, gained: id } : r;
    }
    return { ok: false, reason: '查无此方' };
  }

  return { ok: false, reason: '不支持的交易类型' };
}

// ==================== 卖出 ====================

/** 卖出。kind: 'pill' | 'equip' | 'material'。装备的 id 为实例 uid。 */
export function sell(kind, id, count = 1) {
  count = Math.max(1, Math.floor(count || 1));

  if (kind === 'pill') {
    const p = pillById(id);
    if (!p) return { ok: false, reason: '查无此丹' };
    const have = pillCount(id);
    const n = Math.min(count, have);
    if (n <= 0) return { ok: false, reason: '丹药不足' };
    consumePill(id, n);
    const gain = pillSellPrice(p) * n;
    addStones(gain);
    log(`卖出【${p.name}】×${n}，得灵石 ${fmt(gain)}`, 'event-good');
    return { ok: true, gain, count: n };
  }

  if (kind === 'material') {
    return sellMaterial(id, count);
  }

  if (kind === 'equip') {
    return sellEquipment(id);
  }

  if (kind === 'recipe') {
    return { ok: false, reason: '丹方器图已铭刻于心，无法出售' };
  }

  return { ok: false, reason: '不支持的交易类型' };
}

// ==================== 拍卖行 ====================

const AUCTION_PERIOD_SECONDS = 6 * 3600;
const AUCTION_KEYS = ['pill', 'equip', 'material'];

/** 当前拍卖轮次（每 6 小时一批） */
export function auctionBucket(now = Date.now()) {
  return Math.floor(now / (AUCTION_PERIOD_SECONDS * 1000));
}

/** 下一批拍卖的剩余秒数 */
export function auctionSecondsLeft(now = Date.now()) {
  const periodMs = AUCTION_PERIOD_SECONDS * 1000;
  return Math.ceil((periodMs - (now % periodMs)) / 1000);
}

/**
 * 纯整数散列：给拍卖轮换做确定性选货。
 * 这里刻意不用 core/rng.js —— 拍卖轮换是"按时间的排期"，不是玩法随机，
 * 且不应推进/污染全局随机序列。
 */
function bucketHash(bucket, salt) {
  let h = (Math.imul(bucket >>> 0, 2654435761) ^ Math.imul(salt + 1, 40503)) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 3266489917) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * 拍卖行当前货品：3 个槽位（丹药 / 装备 / 灵材各一），按轮次确定性轮换。
 * 价格 = 常规买入价 ×（1.2 ~ 1.7）溢价；库存 1，买走记入 flags，本轮不再刷出。
 */
export function auctionStock(now = Date.now()) {
  const bucket = auctionBucket(now);
  const pools = {
    pill: PILLS.filter((p) => !p.noShop && (p.minRealm ?? 0) >= 9),
    equip: EQUIPMENTS.filter((e) => (e.tier ?? 1) >= 3),
    material: MATERIALS.filter((m) => (m.tier ?? 1) >= 4),
  };

  const out = [];
  let salt = 0;
  for (const key of AUCTION_KEYS) {
    const pool = pools[key];
    if (!pool || pool.length === 0) continue;
    const h = bucketHash(bucket, salt++);
    const item = pool[h % pool.length];

    let basePrice;
    if (key === 'pill') basePrice = pillBuyPrice(item);
    else if (key === 'equip') basePrice = equipBuyPrice(item);
    else basePrice = materialBuyPrice(item);

    const premium = 1.2 + (h % 50) / 100; // 1.20 ~ 1.69
    const price = Math.max(1, Math.floor(basePrice * premium));
    const sold = !!state.flags[`auc_${bucket}_${key}_${item.id}`];

    out.push({
      kind: key,
      id: item.id,
      name: item.name,
      quality: item.quality || null,
      qualityName: item.quality ? qualityOf(item.quality).name : null,
      tier: item.tier ?? null,
      desc: item.desc,
      basePrice,
      price,
      stock: sold ? 0 : 1,
      sold,
    });
  }
  return { bucket, secondsLeft: auctionSecondsLeft(now), items: out };
}

/** 买入拍卖品（按拍卖价，走同一套发奖逻辑） */
export function buyAuction(kind, id) {
  const stock = auctionStock();
  const entry = stock.items.find((it) => it.kind === kind && it.id === id);
  if (!entry) return { ok: false, reason: '本批拍卖无此货' };
  if (entry.stock <= 0) return { ok: false, reason: '已被买走' };
  if (!spendStones(entry.price)) return { ok: false, reason: `灵石不足（需 ${fmt(entry.price)}）` };

  if (kind === 'pill') {
    addPill(id, 1);
  } else if (kind === 'material') {
    addMaterial(id, 1);
  } else if (kind === 'equip') {
    const base = equipById(id);
    if (!base) { addStones(entry.price); return { ok: false, reason: '此器已失传' }; }
    createEquipment(base.id, { add: true });
  }

  state.flags[`auc_${stock.bucket}_${kind}_${id}`] = true;
  noteKind('shopBuy', `${kind}:${id}`);   // V6.0 功课：拍得也算买入
  log(`于拍卖行拍得【${entry.name}】，耗灵石 ${fmt(entry.price)}`, 'event-special');
  return { ok: true, spent: entry.price, entry };
}

/** 手动刷新拍卖（重新读取当前轮次货品，不花钱，用于 UI 刷新按钮） */
export function restockAuction() {
  const bucket = auctionBucket();
  state.flags.shopBucket = bucket;
  emit(EV.STATE_DIRTY);
  return auctionStock();
}

/** 主循环调用：轮次变化时提示换货 */
export function tickShop(dt) {
  const bucket = auctionBucket();
  if (state.flags.shopBucket !== bucket) {
    state.flags.shopBucket = bucket;
    log('拍卖行换了一批新货', 'event-special');
    emit(EV.STATE_DIRTY);
  }
  return bucket;
}
