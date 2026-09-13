/**
 * 背包面板。
 *
 * 职责：以「装备 / 丹药 / 灵材」三个分栏展示行囊。
 *   - 装备：名称、品阶、槽位、等级、基础属性、随机词条、已装备标记，
 *     可装备 / 卸下 / 卖出（卖出前确认）。
 *   - 丹药：数量与丹效，突破类丹药禁止直接服用并给出提示。
 *   - 灵材：数量、用途与单价，支持一次卖多个。
 * 底部汇总背包估值并提供批量清理凡品。所有估值与结算走 systems/inventory.js。
 */

import { state, realmAt } from '../../core/state.js';
import {
  groupInventory, equipItem, unequipSlot, usePill, sellEquipment,
  sellMaterial, sellAllBelow, inventoryValue,
} from '../../systems/inventory.js';
import { equipById } from '../../data/equipments.js';
import { fmt, fmtStones } from '../../core/format.js';
import { esc } from '../dom.js';
import { toast } from '../toast.js';
import { confirmModal } from '../modal.js';
import { signature } from '../render.js';
import { forceRender } from '../../core/loop.js';
import { svg, ICON_BAG, ICON_SWORD, ICON_PILL, ICON_MATERIAL } from '../../assets/svg.js';

let lastSig = '';
let invTab = 'equip';   // equip | pill | material

const ATTR_NAMES = { atk: '攻击', def: '防御', hp: '气血', mp: '灵力', spd: '身法' };

export function renderInventoryPanel(host) {
  const g = groupInventory();
  const sig = signature(
    invTab,
    state.player.realmIndex,
    JSON.stringify(state.equipment.owned),
    JSON.stringify(state.equipment.equipped),
    JSON.stringify(state.resources.materials),
    JSON.stringify(state.consumables),
    inventoryValue(),
  );
  if (sig === lastSig) return;
  lastSig = sig;

  host.innerHTML = `
    <div class="panel-title">
      <span style="display:inline-flex;align-items:center;gap:6px;">
        ${svg(ICON_BAG, 18)}行 囊
      </span>
      <span class="pt-extra">${g.equipment.length} 器 · ${g.pills.length} 丹 · ${g.materials.length} 材</span>
    </div>

    <div class="row mb-2" style="gap:4px;">
      ${tabBtn('equip', '装 备', g.equipment.length)}
      ${tabBtn('pill', '丹 药', g.pills.length)}
      ${tabBtn('material', '灵 材', g.materials.length)}
    </div>

    <div id="invBody">${renderBody(g)}</div>

    <hr class="divider">
    <div class="row-between mb-1">
      <span class="small muted">囊中灵石</span>
      <span class="value gold num">${esc(fmtStones(state.resources.stones))}</span>
    </div>
    <div class="row-between mb-1">
      <span class="small muted">行囊估值</span>
      <span class="value gold num">${fmt(inventoryValue())} 灵石</span>
    </div>
    <button class="btn btn-sm btn-block" id="btnCleanFan" type="button">批量清理凡品</button>
    <div class="small muted center mt-1">卖出未穿戴的凡品装备，换取灵石</div>
  `;

  host.querySelectorAll('[data-inv-tab]').forEach((b) => {
    b.addEventListener('click', () => {
      const t = b.dataset.invTab;
      if (t === invTab) return;
      invTab = t;
      lastSig = '';
      forceRender();
    });
  });
  host.querySelector('#btnCleanFan')?.addEventListener('click', doCleanFan);
  bindBody(host);
}

function tabBtn(id, label, count) {
  return `<button class="btn btn-sm ${invTab === id ? 'btn-jade' : ''}" data-inv-tab="${id}"
    type="button">${esc(label)} ${count}</button>`;
}

function renderBody(g) {
  if (invTab === 'equip') {
    return g.equipment.length === 0
      ? `<div class="list-empty">行囊空空，尚无称手之器。<br>可去坊市求取，或自行炼器。</div>`
      : `<div class="list">${g.equipment.map(equipRow).join('')}</div>`;
  }
  if (invTab === 'pill') {
    return g.pills.length === 0
      ? `<div class="list-empty">丹匣已空。<br>可自行炼丹，或于坊市购取。</div>`
      : `<div class="list">${g.pills.map(pillRow).join('')}</div>`;
  }
  return g.materials.length === 0
    ? `<div class="list-empty">未收得任何灵材。<br>灵田自会产出，探险亦可拾取。</div>`
    : `<div class="list">${g.materials.map(materialRow).join('')}</div>`;
}

/* ------------------------------ 装备 ------------------------------ */

function equipRow(e) {
  const base = equipById(e.baseId);
  const b = base?.base || {};
  const attrs = Object.entries(ATTR_NAMES)
    .map(([k, name]) => [name, b[k]])
    .filter(([, v]) => v)
    .map(([name, v]) => `${name} +${fmt(v)}`)
    .join(' · ');

  const affixes = (e.affixes || []).length
    ? `<div class="li-desc">${e.affixes.map((a) =>
      `<span class="tag tag-gold">${esc(a.name)} ${esc(a.desc)}</span>`).join(' ')}</div>`
    : `<div class="li-desc muted">无词条</div>`;

  return `
    <div class="list-item ${e.equipped ? 'equipped' : ''}" style="align-items:flex-start;">
      <div class="li-main">
        <div class="li-name">
          ${svg(ICON_SWORD, 15)}${esc(e.name)}
          <span class="q quality-${esc(e.quality)}">${esc(e.qualityName)}</span>
          <span class="tag">${esc(e.slotName)}</span>
          <span class="tag">${e.level} 级</span>
          ${e.equipped ? '<span class="tag tag-jade">已装备</span>' : ''}
        </div>
        ${attrs ? `<div class="li-desc num">${esc(attrs)}</div>` : ''}
        ${affixes}
        <div class="li-desc muted">
          ${realmText(e.minRealm)}可御 · 售价 ${fmt(e.sell)} 灵石
        </div>
      </div>
      <div class="li-actions" style="flex-direction:column;align-items:flex-end;gap:3px;">
        <button class="btn btn-sm ${e.equipped ? '' : 'btn-jade'}" data-equip="${e.uid}"
          type="button">${e.equipped ? '卸下' : '装备'}</button>
        <button class="btn btn-sm" data-sell-equip="${e.uid}" type="button"
          ${e.equipped ? 'disabled' : ''}>卖出</button>
        ${e.equipped ? '<span class="small muted">需先卸下</span>' : ''}
      </div>
    </div>`;
}

/* ------------------------------ 丹药 ------------------------------ */

function pillRow(p) {
  const usable = p.usable !== false;
  return `
    <div class="list-item">
      <div class="li-main">
        <div class="li-name">
          ${svg(ICON_PILL, 15)}${esc(p.name)}
          <span class="q quality-${esc(p.quality)}">${esc(p.qualityName)}</span>
          <span class="tag tag-gold">×${p.count}</span>
        </div>
        <div class="li-desc">${esc(p.desc || '')}</div>
        ${usable ? '' : '<div class="li-desc" style="color:var(--accent);">突破类丹药不可直接服用，请在突破时使用</div>'}
      </div>
      <div class="li-actions">
        <button class="btn btn-sm ${usable ? 'btn-jade' : ''}" data-use-pill="${esc(p.id)}"
          type="button" ${usable ? '' : 'disabled'}>服用</button>
      </div>
    </div>`;
}

/* ------------------------------ 灵材 ------------------------------ */

function materialRow(m) {
  return `
    <div class="list-item">
      <div class="li-main">
        <div class="li-name">
          ${svg(ICON_MATERIAL, 15)}${esc(m.name)}
          <span class="tag">${esc(m.materialKindName)}</span>
          <span class="tag tag-gold">×${m.count}</span>
        </div>
        <div class="li-desc muted">单价 ${fmt(m.sell)} 灵石 · 炼丹炼器之料</div>
      </div>
      <div class="li-actions">
        <button class="btn btn-sm" data-sell-mat="${esc(m.id)}" data-n="1" type="button">卖1</button>
        <button class="btn btn-sm" data-sell-mat="${esc(m.id)}" data-n="10"
          type="button" ${m.count >= 10 ? '' : 'disabled'}>卖10</button>
        <button class="btn btn-sm" data-sell-mat="${esc(m.id)}" data-n="all" type="button">全部</button>
      </div>
    </div>`;
}

/* ------------------------------ 事件 ------------------------------ */

function bindBody(host) {
  host.querySelectorAll('[data-equip]').forEach((b) => {
    b.addEventListener('click', () => {
      const uid = Number(b.dataset.equip);
      const r = equipItem(uid);
      if (!r.ok) { toast(r.reason || '无法装备', 'bad'); return; }
      toast('已装备', 'good');
      lastSig = '';
      forceRender();
    });
  });

  host.querySelectorAll('[data-sell-equip]').forEach((b) => {
    b.addEventListener('click', () => sellEquip(Number(b.dataset.sellEquip)));
  });

  host.querySelectorAll('[data-use-pill]').forEach((b) => {
    b.addEventListener('click', () => {
      const r = usePill(b.dataset.usePill);
      if (!r.ok) { toast(r.reason || '无法服用', 'bad'); return; }
      toast(r.text || '已服用', 'good');
      lastSig = '';
      forceRender();
    });
  });

  host.querySelectorAll('[data-sell-mat]').forEach((b) => {
    b.addEventListener('click', () => sellMat(b.dataset.sellMat, b.dataset.n));
  });
}

function sellEquip(uid) {
  const e = groupInventory().equipment.find((x) => x.uid === uid);
  if (!e) return;
  confirmModal('卖出装备', `确定卖出 ${e.qualityName}·${e.name}？可得灵石 ${fmt(e.sell)}。`,
    { danger: true, okText: '卖出' }).then((ok) => {
    if (!ok) return;
    const r = sellEquipment(uid);
    if (!r.ok) { toast(r.reason || '无法卖出', 'bad'); return; }
    toast(`卖出 · +${fmt(r.gain)} 灵石`, 'good');
    lastSig = '';
    forceRender();
  });
}

function sellMat(id, n) {
  const m = groupInventory().materials.find((x) => x.id === id);
  if (!m) return;
  const count = n === 'all' ? m.count : Math.min(Number(n) || 1, m.count);
  if (count <= 0) { toast('材料不足', 'bad'); return; }
  const gain = m.sell * count;
  confirmModal('卖出灵材', `确定卖出 ${m.name} ×${count}？可得灵石 ${fmt(gain)}。`,
    { danger: true, okText: '卖出' }).then((ok) => {
    if (!ok) return;
    const r = sellMaterial(id, count);
    if (!r.ok) { toast(r.reason || '无法卖出', 'bad'); return; }
    toast(`卖出 · +${fmt(r.gain)} 灵石`, 'good');
    lastSig = '';
    forceRender();
  });
}

function doCleanFan() {
  // 注意：sellAllBelow(q) 卖出的是「品阶 order 小于 q」的装备，
  // 凡品 order=1，故此处的阀值应为 ling（凡品本身即 order<2）。
  confirmModal('批量清理凡品', '将卖出所有未穿戴的凡品装备，换取灵石。是否继续？',
    { danger: true, okText: '清理' }).then((ok) => {
    if (!ok) return;
    const r = sellAllBelow('ling');
    if (!r.ok) { toast(r.reason || '无物可清', 'bad'); return; }
    toast(r.count > 0 ? `清理 ${r.count} 件 · +${fmt(r.stones)} 灵石` : '未穿戴的凡品已清空', r.count > 0 ? 'good' : 'special');
    lastSig = '';
    forceRender();
  });
}

function realmText(minRealm) {
  return (minRealm ?? 0) > 0 ? `${esc(realmAt(minRealm).name)}以上` : '无境界要求';
}

export function resetInventoryPanel() {
  lastSig = '';
  invTab = 'equip';
}
