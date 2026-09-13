/**
 * 修炼页 —— 主交互枢纽。
 * 突破、探险、打坐都在这儿，是玩家停留时间最长的一屏。
 */

import { state, realm, isMaxRealm, spendStones, addStones } from '../../core/state.js';
import {
  calcCultSpeed, cultSpeedBreakdown, etaToBreakthrough, calcMaxHp,
  buffMultiplier, buildingLevel,
} from '../../systems/cultivation.js';
import {
  canBreakthrough, calcBreakChance, breakChanceBreakdown, attemptBreakthrough,
  inTribulation, resilience, tribulationDifficulty, roundPassChance,
} from '../../systems/breakthrough.js';
import * as exploreSys from '../../systems/explore.js';
import { fmt, fmtPct, fmtDuration, fmtMult, fmtStones } from '../../core/format.js';
import { esc } from '../dom.js';
import { toast } from '../toast.js';
import { openTribulationModal } from '../tribulation.js';
import { forceRender } from '../../core/loop.js';
import { emit, EV } from '../../core/bus.js';

let lastSig = '';

function log(text, cls) { emit(EV.LOG, { text, cls, channel: 'cultivate' }); }

export function renderCultivatePanel(host) {
  const r = realm();
  const maxed = isMaxRealm();
  const check = maxed ? { ok: false, reason: '道途已尽' } : canBreakthrough();
  const chance = maxed ? 0 : calcBreakChance();
  const inTj = inTribulation();

  // 指纹：只在"会影响显示的决策状态"变化时重建
  const sig = [
    state.player.realmIndex, check.ok, maxed, inTj,
    Math.floor(chance * 100),
    (state.player.cult / (r.needCult || 1)) >= 1,
    exploreSys.canExplore?.()?.ok,
    buffMultiplier('cult') !== 1,
    buildingLevel('bld_spirit'),
  ].join('|');

  // 签名没变时不能直接 return：倒计时类的文字（探险冷却、突破 ETA）
  // 必须每帧刷新，否则会停在旧值上不再走动。
  if (sig === lastSig) {
    updateCooldown(host);
    updateEta(host);
    return;
  }
  lastSig = sig;

  host.innerHTML = `
    ${inTj ? tribulationBanner() : ''}
    <div class="panel-title">修 炼<span class="pt-extra">${esc(r.name)}</span></div>

    <button class="btn btn-primary btn-block" id="btnBreak" type="button" ${check.ok ? '' : 'disabled'}>
      ${maxed ? '道途已尽' : (inTj ? '天劫临身 · 应劫' : '冲 击 境 界')}
    </button>
    <div class="small center mt-1 ${check.ok ? '' : 'muted'}" id="breakHint">
      ${esc(check.ok ? `成功率 ${fmtPct(chance)} · ${r.needPill ? '需备好突破丹药' : '修为已足'}` : check.reason)}
    </div>

    <div class="row mt-2" style="gap:6px;">
      <button class="btn btn-gold" id="btnExplore" type="button" style="flex:1;">外出探险</button>
      <button class="btn btn-jade" id="btnMeditate" type="button" style="flex:1;">打坐调息</button>
    </div>
    <div class="small muted center mt-1" id="exploreHint"></div>

    <hr class="divider">
    <div class="sub-title">突破成功率明细</div>
    <div id="breakDetail"></div>

    <hr class="divider">
    <div class="sub-title">修炼速率明细</div>
    <div id="speedDetail"></div>
  `;

  host.querySelector('#btnBreak')?.addEventListener('click', () => {
    if (inTribulation()) {
      openTribulationModal(() => { lastSig = ''; forceRender(); });
      return;
    }
    const res = attemptBreakthrough();
    if (res && res.tribulation) {
      lastSig = '';
      openTribulationModal(() => { lastSig = ''; forceRender(); });
    } else if (res && res.ok) {
      toast(res.success ? '突破成功' : '冲关失败', res.success ? 'good' : 'bad');
    }
    lastSig = '';
    forceRender();
  });

  host.querySelector('#btnExplore')?.addEventListener('click', () => {
    const res = exploreSys.explore?.();
    if (res && res.ok === false) toast(res.reason || '此时不宜出行', 'bad');
    lastSig = '';
    forceRender();
  });

  host.querySelector('#btnMeditate')?.addEventListener('click', doMeditate);

  renderDetails(host);
  updateCooldown(host);
  updateEta(host);
}

function tribulationBanner() {
  const res = resilience();
  return `<div class="panel" style="border-color:var(--violet);background:rgba(107,93,139,0.08);margin-bottom:10px;">
    <div class="small" style="color:var(--violet);font-weight:bold;letter-spacing:2px;">
      天劫临身 · 三劫未渡
    </div>
    <div class="small muted mt-1">
      抗劫 ${res.value} · 威压 ${tribulationDifficulty()} · 每轮 ${fmtPct(roundPassChance())}
    </div>
  </div>`;
}

function renderDetails(host) {
  const bd = host.querySelector('#breakDetail');
  if (bd) {
    if (isMaxRealm()) {
      bd.innerHTML = '<div class="small muted center">已证大道，再无桎梏</div>';
    } else {
      const b = breakChanceBreakdown();
      bd.innerHTML = b.parts.map((p) => `
        <div class="info-row">
          <span class="label">${esc(p.label)}</span>
          <span class="value ${p.value >= 0 ? 'jade' : ''} num">${p.value >= 0 ? '+' : ''}${(p.value * 100).toFixed(1)}%</span>
        </div>`).join('') + `
        <div class="info-row" style="border-top:1px solid var(--border-light);margin-top:3px;padding-top:5px;">
          <span class="label"><b>合计</b></span>
          <span class="value highlight num"><b>${fmtPct(b.total, 1)}</b></span>
        </div>`;
    }
  }

  const sd = host.querySelector('#speedDetail');
  if (sd) {
    if (isMaxRealm()) {
      sd.innerHTML = '<div class="small muted center">已无需修炼</div>';
    } else {
      const s = cultSpeedBreakdown();
      const rows = s.parts.map((p) => {
        const v = p.mult != null ? fmtMult(p.mult) : fmt(p.value) + '/息';
        return `<div class="info-row"><span class="label">${esc(p.label)}</span>
          <span class="value num">${v}</span></div>`;
      }).join('');
      const capNote = s.capped
        ? `<div class="small muted mt-1">加持已近极限，额外投入收益递减（当前 ${fmtMult(s.rawSustained)} → 实际 ${fmtMult(s.sustained)}）</div>`
        : '';
      sd.innerHTML = rows + `
        <div class="info-row" style="border-top:1px solid var(--border-light);margin-top:3px;padding-top:5px;">
          <span class="label"><b>当前速率</b></span>
          <span class="value highlight num"><b>${fmt(s.value)}/息</b></span>
        </div>
        <div class="small muted center mt-1" id="cultEta"></div>
        ${capNote}`;
    }
  }
}

/** 突破倒计时。单独抽出来，保证每帧都刷新而不是只在签名变化时算一次 */
function updateEta(host) {
  const el = host.querySelector('#cultEta');
  if (!el) return;
  if (isMaxRealm()) { el.textContent = ''; return; }
  const eta = etaToBreakthrough();
  const text = eta > 0 && Number.isFinite(eta) ? `距圆满约 ${fmtDuration(eta)}` : '';
  if (el.textContent !== text) el.textContent = text;
}

function updateCooldown(host) {
  const hint = host.querySelector('#exploreHint');
  const btn = host.querySelector('#btnExplore');
  if (!hint || !btn) return;

  const st = exploreSys.canExplore?.() ?? { ok: true };
  btn.disabled = !st.ok;
  if (st.ok) {
    const cost = exploreSys.exploreCost?.();
    hint.textContent = cost && cost.text
      ? `外出游历，或遇机缘，或逢凶险（耗${cost.text}）`
      : '外出游历，或遇机缘，或逢凶险';
  } else {
    hint.textContent = st.reason || `需等待 ${fmtDuration(st.remaining || 0)}`;
  }
}

function doMeditate() {
  const maxHp = calcMaxHp();
  if (state.player.hp >= maxHp) { toast('气血已满，无需调息', 'bad'); return; }
  const cost = 30;
  if (!spendStones(cost)) { toast('灵石不足 30', 'bad'); return; }
  const heal = Math.floor(maxHp * 0.35);
  state.player.hp = Math.min(maxHp, state.player.hp + heal);
  log(`打坐调息，耗灵石 ${cost}，气血回复 ${fmt(heal)}。`, 'event-good');
  toast(`气血 +${fmt(heal)}`, 'good');
  lastSig = '';
  forceRender();
}

export function resetCultivatePanel() {
  lastSig = '';
}
