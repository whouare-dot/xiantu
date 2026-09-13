/**
 * 功法页。
 * 功法是"长期投资"的载体：参悟要花修为，层数越高倍率越高，且带流派特效。
 */

import { state, realm, techSlotsFor, spendStones } from '../../core/state.js';
import { TECHNIQUES, PATHS, techById, techStatsAt, techUpgradeCost } from '../../data/techniques.js';
import { qualityOf } from '../../data/qualities.js';
import { fmt, fmtMult, fmtPct } from '../../core/format.js';
import { esc } from '../dom.js';
import { toast } from '../toast.js';
import { forceRender } from '../../core/loop.js';
import { emit, EV } from '../../core/bus.js';

function log(text, cls) { emit(EV.LOG, { text, cls, channel: 'cultivate' }); }

let lastSig = '';

export function renderTechniquePanel(host) {
  const known = state.techniques.known || {};
  const ids = Object.keys(known);
  const slots = techSlotsFor(state.player.realmIndex);

  const sig = [
    state.player.realmIndex, slots,
    ids.map((id) => `${id}:${known[id].level}`).join(','),
    (state.techniques.equipped || []).join(','),
    Math.floor(state.player.cult),
  ].join('|');
  if (sig === lastSig) return;
  lastSig = sig;

  if (ids.length === 0) {
    host.innerHTML = `
      <div class="panel-title">功 法</div>
      <div class="list-empty">
        尚未习得任何功法。<br>
        可去<span class="tag tag-gold">坊市</span>求取，或在奇遇中偶得。
      </div>`;
    return;
  }

  const equipped = state.techniques.equipped || [];
  const cards = ids.map((id) => techCard(id, known[id], equipped.includes(id), slots)).join('');

  host.innerHTML = `
    <div class="panel-title">功 法<span class="pt-extra">主修 ${equipped.length}/${slots}</span></div>
    <div class="small muted mb-2">主修功法决定修炼速率与战斗流派。槽位随境界提升而增加。</div>
    <div class="col-stack">${cards}</div>
  `;

  host.querySelectorAll('[data-study]').forEach((b) => {
    b.addEventListener('click', () => study(b.dataset.study));
  });
  host.querySelectorAll('[data-equip]').forEach((b) => {
    b.addEventListener('click', () => toggleEquip(b.dataset.equip));
  });
}

function techCard(id, known, isEquipped, slots) {
  const tech = techById(id);
  if (!tech) return '';
  const st = techStatsAt(tech, known.level);
  const q = qualityOf(tech.quality);
  const path = PATHS[tech.path] || { name: '', color: 'var(--text-muted)' };
  const maxed = known.level >= tech.maxLevel;
  const cost = techUpgradeCost(tech, known.level);
  const canStudy = !maxed && state.player.cult >= cost;

  const attrs = Object.entries(st.attrs || {})
    .filter(([, v]) => v)
    .map(([k, v]) => `${attrName(k)} +${fmt(v)}`)
    .join(' · ');

  const equippedCount = (state.techniques.equipped || []).length;
  const canEquip = isEquipped || equippedCount < slots;

  return `
    <div class="list-item ${isEquipped ? 'equipped' : ''}" style="align-items:flex-start;">
      <div class="li-main">
        <div class="li-name">
          ${esc(tech.name)}
          <span class="q quality-${q.id}">${q.name}</span>
          <span class="tag" style="color:${path.color};border-color:${path.color};">${path.name}</span>
          <span class="tag tag-gold">第 ${known.level} 重</span>
          ${isEquipped ? '<span class="tag tag-jade">主修</span>' : ''}
        </div>
        <div class="li-desc">${esc(tech.desc)}</div>
        <div class="li-desc num">
          修炼 ${fmtMult(st.cultMult)}${attrs ? ' · ' + esc(attrs) : ''}
        </div>
        ${st.affix ? `<div class="li-desc" style="color:var(--gold);">
          【${esc(st.affix.name)}】${esc(st.affix.desc)}</div>` : ''}
        <div class="li-desc muted" style="font-style:italic;">${esc(tech.lore || '')}</div>
      </div>
      <div class="li-actions" style="flex-direction:column;">
        <button class="btn btn-sm ${canEquip ? (isEquipped ? 'btn-danger' : 'btn-jade') : ''}"
          data-equip="${id}" type="button" ${canEquip ? '' : 'disabled'}>
          ${isEquipped ? '收功' : '主修'}
        </button>
        <button class="btn btn-sm ${canStudy ? 'btn-gold' : ''}" data-study="${id}" type="button"
          ${canStudy ? '' : 'disabled'}>
          ${maxed ? '已圆满' : '参悟'}
        </button>
        ${!maxed ? `<span class="small muted center num">${fmt(cost)}</span>` : ''}
      </div>
    </div>`;
}

function attrName(k) {
  return {
    atk: '攻击', def: '防御', hp: '气血', mp: '灵力', spd: '身法',
    crit: '暴击', comprehension: '悟性', daoHeart: '道心', spiritSense: '神识',
  }[k] || k;
}

function study(id) {
  const tech = techById(id);
  const known = state.techniques.known[id];
  if (!tech || !known) return;
  if (known.level >= tech.maxLevel) { toast('此功已圆满', 'bad'); return; }
  const cost = techUpgradeCost(tech, known.level);
  if (state.player.cult < cost) { toast('修为不足', 'bad'); return; }

  state.player.cult -= cost;
  known.level++;
  log(`参悟《${tech.name}》至第 ${known.level} 重。`, 'event-good');
  toast(`${tech.name} · 第 ${known.level} 重`, 'special');
  lastSig = '';
  forceRender();
}

function toggleEquip(id) {
  const list = state.techniques.equipped || (state.techniques.equipped = []);
  const idx = list.indexOf(id);
  const tech = techById(id);

  if (idx >= 0) {
    list.splice(idx, 1);
    log(`收功：《${tech?.name ?? id}》不再主修。`, 'event-special');
  } else {
    const slots = techSlotsFor(state.player.realmIndex);
    if (list.length >= slots) { toast(`主修槽位已满（${slots}）`, 'bad'); return; }
    list.push(id);
    log(`开始主修《${tech?.name ?? id}》。`, 'event-good');
  }
  lastSig = '';
  forceRender();
}

export function resetTechniquePanel() {
  lastSig = '';
}
