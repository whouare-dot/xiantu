/**
 * 坊市面板。
 *
 * 分「坊市 / 拍卖行」两栏。坊市按境界过滤商品，分类为 丹药 / 装备 / 灵材 / 丹方图纸；
 * 拍卖行是本轮的限时稀有货。
 *
 * ⚠ 本面板曾是「每秒重建 DOM」的重灾区：拍卖行倒计时被放进了结构指纹里，
 * 导致商品列表每秒被清空重建——玩家滚动会弹回顶部，鼠标悬停按钮会闪。
 * 现在按 src/ui/panel.js 的约定拆开：
 *   结构 = 有哪些商品（含已售/已参悟状态）  → 变了才重建
 *   数值 = 倒计时、余额、可购性、批量总价    → 每帧只改文字与 disabled
 */

import { state, stonesToLow, realmAt } from '../../core/state.js';
import {
  shopStock, buy, auctionStock, auctionSecondsLeft, buyAuction,
} from '../../systems/shop.js';
import { SLOT_NAMES } from '../../systems/inventory.js';
import { materialById } from '../../data/materials.js';
import { fmt, fmtStones } from '../../core/format.js';
import { esc } from '../dom.js';
import { toast } from '../toast.js';
import { createPanel, countdownText } from '../panel.js';
import { signature } from '../render.js';
import { forceRender } from '../../core/loop.js';
import {
  svg, ICON_SHOP, ICON_PILL, ICON_SWORD, ICON_MATERIAL, ICON_SAVE,
} from '../../assets/svg.js';

let shopTab = 'market';       // market | auction
let marketCat = 'pill';       // pill | equip | material | recipe
let qtyMode = 1;              // 1 | 10 | 100 | 'all'

const QTY_OPTIONS = [
  [1, '×1'], [10, '×10'], [100, '×100'], ['all', '全部'],
];
const KIND_LABEL = { pill: '丹药', equip: '装备', material: '灵材' };

// ==================== 批量数量 ====================

/** 单次批量购买的上限。防止"全部"在便宜材料上算出几十万件，把背包和日志撑爆。 */
const MAX_BATCH = 999;

/** 按当前余额算出这次实际能买几个。装备/图纸恒为 1（本身就是一次性）。 */
function effectiveCount(unitPrice, kind) {
  if (kind === 'equip' || kind === 'recipe') return 1;
  if (qtyMode !== 'all') return Math.min(qtyMode, MAX_BATCH);
  const afford = Math.floor(stonesToLow() / Math.max(1, unitPrice));
  return Math.max(1, Math.min(afford, MAX_BATCH));
}

// ==================== 面板 ====================

export const shopPanel = createPanel({
  id: 'shop',

  structure() {
    const auc = auctionStock();
    return signature(
      shopTab, marketCat, state.player.realmIndex,
      auc.bucket,
      (auc.items || []).map((i) => i.id + (i.sold ? '1' : '0')).join(','),
      (state.alchemy.knownRecipes || []).join(','),
      (state.forging.knownRecipes || []).join(','),
    );
  },

  build(host) {
    const stock = shopStock(state.player.realmIndex);
    const auc = auctionStock();

    host.innerHTML = `
      <div class="panel-title">
        <span style="display:inline-flex;align-items:center;gap:6px;">
          ${svg(ICON_SHOP, 18)}坊 市
        </span>
        <span class="pt-extra" data-stones></span>
      </div>

      <div class="row mb-2" style="gap:4px;">
        <button class="btn btn-sm ${shopTab === 'market' ? 'btn-jade' : ''}" data-shop-tab="market"
          type="button">坊 市</button>
        <button class="btn btn-sm ${shopTab === 'auction' ? 'btn-jade' : ''}" data-shop-tab="auction"
          type="button">拍卖行</button>
      </div>

      ${shopTab === 'market' ? marketView(stock) : auctionView(auc)}
    `;

    host.querySelectorAll('[data-shop-tab]').forEach((b) => {
      b.addEventListener('click', () => {
        if (b.dataset.shopTab === shopTab) return;
        shopTab = b.dataset.shopTab;
        forceRender();
      });
    });
    host.querySelectorAll('[data-cat]').forEach((b) => {
      b.addEventListener('click', () => {
        if (b.dataset.cat === marketCat) return;
        marketCat = b.dataset.cat;
        forceRender();
      });
    });
    host.querySelectorAll('[data-qty]').forEach((b) => {
      b.addEventListener('click', () => {
        const raw = b.dataset.qty;
        qtyMode = raw === 'all' ? 'all' : parseInt(raw, 10);
        // 只改按钮高亮与各行文案，不重建整个列表（重建会把滚动位置弹回去）
        host.querySelectorAll('[data-qty]').forEach((x) => {
          x.classList.toggle('btn-gold', x.dataset.qty === raw);
        });
        refreshBuyButtons(host);
        forceRender();
      });
    });
    host.querySelectorAll('[data-buy]').forEach((b) => {
      b.addEventListener('click', () => doBuy(b.dataset.kind, b.dataset.buy));
    });
    host.querySelectorAll('[data-buy-auc]').forEach((b) => {
      b.addEventListener('click', () => doBuyAuction(b.dataset.kind, b.dataset.buyAuc));
    });
  },

  refresh(host) {
    // 余额
    const stoneEl = host.querySelector('[data-stones]');
    if (stoneEl) {
      const text = fmtStones(state.resources.stones);
      if (stoneEl.textContent !== text) stoneEl.textContent = text;
    }
    // 拍卖行倒计时
    const cdEls = host.querySelectorAll('[data-auc-countdown]');
    if (cdEls.length) {
      const text = countdownText(auctionSecondsLeft()) + ' 后轮换';
      for (const el of cdEls) if (el.textContent !== text) el.textContent = text;
    }
    // 可购性与批量总价
    refreshBuyButtons(host);
  },
});

/** 只更新按钮的文案与可用性——不碰 DOM 结构 */
function refreshBuyButtons(host) {
  const balance = stonesToLow();
  for (const btn of host.querySelectorAll('[data-buy]')) {
    const unit = parseInt(btn.dataset.unitPrice, 10) || 0;
    const kind = btn.dataset.kind;
    const n = effectiveCount(unit, kind);
    const total = unit * n;
    const ok = balance >= total && n > 0;
    const label = kind === 'recipe'
      ? (ok ? '参悟' : '灵石不足')
      : (ok ? `买 ×${n}（${fmt(total)}）` : `灵石不足（需 ${fmt(total)}）`);
    if (btn.textContent !== label) btn.textContent = label;
    if (btn.disabled !== !ok) btn.disabled = !ok;
    btn.classList.toggle('btn-gold', ok);
  }
  for (const btn of host.querySelectorAll('[data-buy-auc]')) {
    const price = parseInt(btn.dataset.unitPrice, 10) || 0;
    const ok = balance >= price;
    const label = ok ? '竞得' : '灵石不足';
    if (btn.textContent !== label) btn.textContent = label;
    if (btn.disabled !== !ok) btn.disabled = !ok;
    btn.classList.toggle('btn-violet', ok);
  }
}

/* ------------------------------ 坊市 ------------------------------ */

function marketView(stock) {
  const cats = [
    ['pill', '丹 药', stock.pills.length],
    ['equip', '装 备', stock.equips.length],
    ['material', '灵 材', stock.materials.length],
    ['recipe', '丹方图纸', stock.recipes.length],
  ];
  const catBar = `<div class="row mb-2" style="gap:4px;flex-wrap:wrap;">${cats.map(([id, label, n]) =>
    `<button class="btn btn-sm ${marketCat === id ? 'btn-gold' : ''}" data-cat="${id}"
      type="button">${esc(label)} ${n}</button>`).join('')}</div>`;

  // 批量购买：丹药与灵材可以成批买，装备与图纸本身一次性，选择器对它们无效
  const bulkable = marketCat === 'pill' || marketCat === 'material';
  const qtyBar = `
    <div class="row-between mb-2" style="flex-wrap:wrap;gap:6px;">
      <span class="small muted">购买数量</span>
      <div class="row" style="gap:4px;">
        ${QTY_OPTIONS.map(([v, label]) =>
          `<button class="btn btn-sm ${qtyMode === v ? 'btn-gold' : ''}" data-qty="${v}"
            type="button" ${bulkable ? '' : 'disabled'}>${label}</button>`).join('')}
      </div>
    </div>
    ${bulkable ? '' : '<div class="small muted center mb-2">装备与丹方图纸为一次性交易</div>'}`;

  let rows = '';
  if (marketCat === 'pill') rows = stock.pills.map(pillRow).join('');
  else if (marketCat === 'equip') rows = stock.equips.map(equipRow).join('');
  else if (marketCat === 'material') rows = stock.materials.map(materialRow).join('');
  else rows = stock.recipes.map(recipeRow).join('');

  return `${catBar}${qtyBar}<div class="list">${rows || '<div class="list-empty">此界暂无货品</div>'}</div>`;
}

function buyBtn(kind, id, price) {
  // 文案与 disabled 全部交给 refreshBuyButtons 处理，这里只留数据
  return `<button class="btn btn-sm" data-kind="${esc(kind)}" data-buy="${esc(id)}"
    data-unit-price="${price}" type="button"></button>`;
}

function pillRow(p) {
  return `
    <div class="list-item">
      <div class="li-main">
        <div class="li-name">
          ${svg(ICON_PILL, 15)}${esc(p.name)}
          <span class="q quality-${esc(p.quality)}">${esc(p.qualityName)}</span>
          ${realmTag(p.minRealm)}
        </div>
        <div class="li-desc">${esc(p.desc || '')}</div>
        <div class="li-desc num">单价 ${fmt(p.price)} 灵石</div>
      </div>
      <div class="li-actions">${buyBtn(p.kind, p.id, p.price)}</div>
    </div>`;
}

function equipRow(e) {
  return `
    <div class="list-item">
      <div class="li-main">
        <div class="li-name">
          ${svg(ICON_SWORD, 15)}${esc(e.name)}
          <span class="q quality-${esc(e.quality)}">${esc(e.qualityName)}</span>
          <span class="tag">${esc(SLOT_NAMES[e.slot] || '法宝')}</span>
          ${realmTag(e.minRealm)}
        </div>
        <div class="li-desc">${esc(e.desc || '')}</div>
        <div class="li-desc num">售价 ${fmt(e.price)} 灵石</div>
      </div>
      <div class="li-actions">${buyBtn(e.kind, e.id, e.price)}</div>
    </div>`;
}

function materialRow(m) {
  return `
    <div class="list-item">
      <div class="li-main">
        <div class="li-name">
          ${svg(ICON_MATERIAL, 15)}${esc(m.name)}
          <span class="tag">第 ${m.tier} 品</span>
        </div>
        <div class="li-desc">${esc(m.desc || '')}</div>
        <div class="li-desc num">单价 ${fmt(m.price)} 灵石</div>
      </div>
      <div class="li-actions">${buyBtn(m.kind, m.id, m.price)}</div>
    </div>`;
}

function recipeRow(r) {
  const label = r.type === 'forge' ? '器图' : '丹方';
  const mats = (r.materials || []).map((m) =>
    `${esc(materialById(m.id)?.name || m.id)}×${m.count}`).join('、');
  const action = r.learned
    ? '<span class="tag tag-jade">已参悟</span>'
    : buyBtn(r.kind, r.id, r.price);
  return `
    <div class="list-item ${r.learned ? 'locked' : ''}">
      <div class="li-main">
        <div class="li-name">
          ${svg(ICON_SAVE, 15)}${esc(r.name)}
          <span class="tag tag-gold">${label}</span>
          ${realmTag(r.minRealm)}
        </div>
        <div class="li-desc muted">所需：${mats || '无'}</div>
        <div class="li-desc num">${r.learned ? '已铭刻于心' : `参悟需 ${fmt(r.price)} 灵石`}</div>
      </div>
      <div class="li-actions">${action}</div>
    </div>`;
}

/* ------------------------------ 拍卖行 ------------------------------ */

function auctionView(auc) {
  const items = auc.items || [];
  return `
    <div class="small muted center mb-2">
      限时珍品 · <span data-auc-countdown></span>
    </div>
    <div class="list">${items.length === 0
      ? '<div class="list-empty">本批珍品已被抢空，且待下轮</div>'
      : items.map(auctionRow).join('')}</div>`;
}

function auctionRow(it) {
  const sold = it.sold || it.stock <= 0;
  const quality = it.qualityName
    ? `<span class="q quality-${esc(it.quality)}">${esc(it.qualityName)}</span>` : '';
  const icon = it.kind === 'equip' ? svg(ICON_SWORD, 15)
    : it.kind === 'material' ? svg(ICON_MATERIAL, 15) : svg(ICON_PILL, 15);
  return `
    <div class="list-item ${sold ? 'locked' : ''}">
      <div class="li-main">
        <div class="li-name">
          ${icon}${esc(it.name)}${quality}
          <span class="tag">${esc(KIND_LABEL[it.kind] || '珍品')}</span>
        </div>
        <div class="li-desc">${esc(it.desc || '')}</div>
        <div class="li-desc num">
          拍价 <span style="color:#8a6414;font-weight:bold;">${fmt(it.price)}</span> 灵石
          · 常规价 ${fmt(it.basePrice)}
        </div>
      </div>
      <div class="li-actions" style="flex-direction:column;align-items:flex-end;gap:2px;">
        ${sold
          ? '<span class="tag">已售罄</span>'
          : `<button class="btn btn-sm" data-kind="${esc(it.kind)}" data-buy-auc="${esc(it.id)}"
              data-unit-price="${it.price}" type="button"></button>`}
        <span class="small muted num" data-auc-countdown></span>
      </div>
    </div>`;
}

/* ------------------------------ 交互 ------------------------------ */

function doBuy(kind, id) {
  const btn = document.querySelector(`[data-buy="${CSS.escape(id)}"]`);
  const unit = parseInt(btn?.dataset.unitPrice, 10) || 0;
  const n = effectiveCount(unit, kind);
  const r = buy(kind, id, n);
  if (!r.ok) { toast(r.reason || '无法成交', 'bad'); return; }
  // 丹方/器图的 gained 是 id 而非数量，文案要分开
  toast(kind === 'recipe' ? '已参悟' : `购得 ×${typeof r.gained === 'number' ? r.gained : n}`, 'good');
  forceRender();
}

function doBuyAuction(kind, id) {
  const r = buyAuction(kind, id);
  if (!r.ok) { toast(r.reason || '未能拍得', 'bad'); return; }
  toast(`拍得 ${r.entry?.name || '珍品'}`, 'special');
  forceRender();
}

function realmTag(minRealm) {
  return (minRealm ?? 0) > 0 ? `<span class="tag">${esc(realmAt(minRealm).name)}</span>` : '';
}

/* ------------------------------ 入口 ------------------------------ */

export function renderShopPanel(host) {
  shopPanel.render(host);
}

export function resetShopPanel() {
  shopPanel.reset();
  shopTab = 'market';
  marketCat = 'pill';
  qtyMode = 1;
}
