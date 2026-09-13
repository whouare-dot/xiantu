/**
 * 左栏 · 当前加持。
 * 挂机游戏里 buff 是玩家唯一的"短期决策反馈"，必须让它可见、可倒计时。
 */

import { activeBuffs } from '../../systems/cultivation.js';
import { fmtClock, fmtMult } from '../../core/format.js';
import { esc } from '../dom.js';

let built = false;
let lastSig = '';

export function renderBuffsPanel(host) {
  if (!built || !host.querySelector('#buffList')) {
    host.innerHTML = `
      <div class="panel-title">加 持<span class="pt-extra" id="buffCount"></span></div>
      <div id="buffList"></div>
    `;
    built = true;
    lastSig = '';
  }

  const buffs = activeBuffs();
  const now = Date.now();
  // 只按秒变化的指纹，避免每秒重建（其实只更新倒计时文本即可）
  const sig = buffs.map((b) => b.id).join(',') + '|' + buffs.map((b) => Math.ceil((b.endsAt - now) / 1000)).join(',');

  const list = host.querySelector('#buffList');
  const count = host.querySelector('#buffCount');
  if (count) count.textContent = buffs.length ? buffs.length + ' 项' : '';

  if (buffs.length === 0) {
    if (lastSig !== '') {
      list.innerHTML = '<div class="small muted center" style="padding:8px;">身无外物，清净自然</div>';
      lastSig = '';
    }
    return;
  }

  if (sig === lastSig) return;
  lastSig = sig;

  list.innerHTML = buffs.map((b) => {
    const remain = Math.max(0, Math.ceil((b.endsAt - now) / 1000));
    const isDebuff = (b.mult ?? 1) < 1;
    const cls = isDebuff ? 'event-bad' : 'jade';
    const effect = b.mult && b.mult !== 1
      ? fmtMult(b.mult, 2)
      : (b.add ? (b.add > 0 ? '+' : '') + Math.round(b.add * 100) + '%' : '');
    return `<div class="info-row">
      <span class="label">${esc(b.name || b.id)} <span class="small">${esc(effect)}</span></span>
      <span class="value ${cls} num">${fmtClock(remain)}</span>
    </div>`;
  }).join('');
}

export function resetBuffsPanel() {
  built = false;
  lastSig = '';
}
