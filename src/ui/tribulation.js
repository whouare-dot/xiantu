/**
 * 天劫演出。
 *
 * 这是全局情绪峰值，必须给足仪式感：插画 + 三轮递进 + 手动迎劫，
 * 而不是后台静默算完给个结果。所以这里刻意做成"点一次、渡一劫"的节奏。
 */

import { state, pillCount } from '../core/state.js';
import {
  inTribulation, resolveTribulationRound, resilience, tribulationDifficulty,
  roundPassChance, roundChances,
} from '../systems/breakthrough.js';
import { calcMaxHp } from '../systems/cultivation.js';
import { fmt, fmtPct } from '../core/format.js';
import { openModal, closeModal } from './modal.js';
import * as svg from '../assets/svg.js';

let handle = null;

const art = () => (svg.SCENE_TRIBULATION || '');

export function openTribulationModal(onFinish) {
  if (!inTribulation()) return;

  const body = document.createElement('div');
  renderBody(body);

  handle = openModal({
    title: '天 劫',
    art: art(),
    body,
    dismissible: false,
    actions: [
      {
        text: '凝神迎劫',
        cls: 'btn-violet',
        keepOpen: true,
        onClick: () => step(body, onFinish),
      },
    ],
  });

  // 初始状态可能已经变化，刷新一次
  refreshActions(body, onFinish);
}

function renderBody(body) {
  const t = state.tribulation;
  if (!t) return;

  const diff = tribulationDifficulty();
  const chances = roundChances();
  const maxHp = calcMaxHp();
  const weakest = chances.reduce((a, b) => (b.chance < a.chance ? b : a));

  body.innerHTML = `
    <div class="col-stack mb-3">
      <div class="info-row"><span class="label">天劫威压</span>
        <span class="value num" style="color:var(--accent)">${diff}</span></div>
      <div class="info-row"><span class="label">你最薄弱的一劫</span>
        <span class="value ${weakest.chance < 0.5 ? 'highlight' : 'jade'}">
          ${weakest.name} · 考校${weakest.focus}</span></div>
      <div class="info-row"><span class="label">气血</span>
        <span class="value num">${fmt(state.player.hp)} / ${fmt(maxHp)}</span></div>
    </div>
    <div class="sub-title">三劫</div>
    <div class="col-stack" id="tjRounds">
      ${t.rounds.map((r, i) => roundHTML(r, i, t.current, chances)).join('')}
    </div>
  `;
}

function roundHTML(r, i, current, chances) {
  const ch = chances.find((c) => c.id === r.id) || { chance: 0, focus: '' };
  const status = r.resolved
    ? (r.passed ? '<span class="tag tag-jade">已渡</span>' : `<span class="tag tag-accent">受创 -${fmt(r.damage)}</span>`)
    : (i === current ? '<span class="tag tag-gold">当前</span>' : '<span class="tag">未至</span>');
  const danger = ch.chance < 0.5 ? 'style="color:var(--accent);font-weight:bold;"' : '';
  return `<div class="list-item">
    <div class="li-main">
      <div class="li-name">${r.name} ${status}
        <span class="tag" ${danger}>通过 ${fmtPct(ch.chance)}</span>
        <span class="small muted">考校${ch.focus}</span>
      </div>
      <div class="li-desc">${r.desc}</div>
    </div>
  </div>`;
}

function step(body, onFinish) {
  const t = state.tribulation;
  if (!t) return;

  // 气血偏低时自动服药（有丹药才吃）
  const maxHp = calcMaxHp();
  const wantHeal = state.player.hp < maxHp * 0.4;

  const result = resolveTribulationRound(wantHeal);
  renderBody(body);

  if (result.done) {
    finish(result, body, onFinish);
    return;
  }
  refreshActions(body, onFinish);
}

function refreshActions(body, onFinish) {
  const t = state.tribulation;
  if (!t || !handle) return;

  const hasPill = pillCount('pill_liaoshang') > 0 || pillCount('pill_huiqi') > 0;
  const maxHp = calcMaxHp();
  const low = state.player.hp < maxHp * 0.4;

  const hint = document.createElement('div');
  hint.className = 'small muted center mt-2';
  hint.textContent = low
    ? (hasPill ? '气血不足，迎劫时将自动服下疗伤丹' : '气血不足，且无丹药可服——凶多吉少')
    : '点击「凝神迎劫」渡过此轮';

  // 替换掉上一轮的提示
  body.querySelectorAll('.tj-hint').forEach((n) => n.remove());
  hint.classList.add('tj-hint');
  body.appendChild(hint);
}

function finish(result, body, onFinish) {
  const passed = !!result.passed;
  setTimeout(() => {
    if (handle) closeModal(handle);
    handle = null;
    if (onFinish) onFinish(passed);
  }, 900);
}

/** 关闭（重开档时用） */
export function closeTribulation() {
  if (handle) {
    closeModal(handle);
    handle = null;
  }
}
