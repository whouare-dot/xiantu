/**
 * 飞升演出（V5.0「世业」）。
 *
 * ============ 与结局演出的关系 ============
 *
 * 结构上是 `endingScene.js` 的简化版：同样复用 `ui/modal.js`（白拿
 * `isModalOpen()` 的奇遇屏蔽）、同样用 CSS `animation-delay` 逐行淡入
 * （不用定时器，因为挂机游戏常被切到后台，定时器会被节流）。
 *
 * 差别在于**节奏**：结局演出一幕一幕翻，飞升演出**只有一场**——
 * 它每世都要播，玩家一生要看 5 次以上。所以：
 *   - 不设翻页，一次把话说完
 *   - 按钮立刻可用（结局演出要等洗完字，因为那是唯一一次，值得等；飞升不值得）
 *   - 内容随世数变化，避免重复感
 *
 * ============ 数据从哪来 ============
 *
 * 飞升会**整体重建 state**，所以演出的数据必须在轮回之前抓下来，
 * 由 breakthrough.js 抓好后随事件传进来。这里**不读 state**——
 * 读的话会读到已经重置成"炼气一层"的新档，演出一片错乱。
 */

import { el, esc } from './dom.js';
import { openModal } from './modal.js';
import { svg, ICON_TRIBULATION } from '../assets/svg.js';
import {
  ASCENSION_TITLE, ASCENSION_FIELDS, stageForGen,
} from '../data/ascensionText.js';

const LINE_STEP = 0.45;   // 比结局演出快一倍——这场戏是重复观看的

/**
 * 播放飞升演出。
 * @param {object} summary 由 breakthrough.js 在轮回前抓好的本世结算数据
 * @param {Function} [onDone]
 */
export function playAscension(summary = {}, onDone = null) {
  const gen = summary.gen || 1;
  const stage = stageForGen(gen);

  const root = el('div', { class: 'ascension-wrap' });

  const art = el('div', { class: 'ascension-art', html: svg(ICON_TRIBULATION, 40) });
  const title = el('div', { class: 'ascension-title', text: ASCENSION_TITLE });
  const note = el('div', { class: 'ascension-note', text: stage.note });
  const stageEl = el('div', { class: 'ascension-stage' });

  let i = 0;
  const line = (text, cls = '') => {
    const d = el('div', { class: 'ascension-line ' + cls });
    d.textContent = text;
    d.style.animationDelay = (i++ * LINE_STEP).toFixed(2) + 's';
    return d;
  };

  const open = el('div', { class: 'ascension-lines' });
  for (const l of stage.opening) open.appendChild(line(l.t, l.cls));

  const rows = el('div', { class: 'ascension-stats' });
  rows.style.animationDelay = (i * LINE_STEP).toFixed(2) + 's';
  i += 1;
  for (const f of ASCENSION_FIELDS) {
    const v = summary[f.key];
    if (v == null || v === '') continue;
    const row = el('div', { class: 'ascension-stat' });
    row.appendChild(el('span', { class: 'k', text: f.label }));
    row.appendChild(el('span', { class: 'v', text: String(v) }));
    rows.appendChild(row);
  }

  const close = el('div', { class: 'ascension-lines' });
  for (const l of stage.closing) close.appendChild(line(l.t, l.cls));

  stageEl.appendChild(open);
  stageEl.appendChild(rows);
  stageEl.appendChild(close);

  root.appendChild(art);
  root.appendChild(title);
  root.appendChild(note);
  root.appendChild(stageEl);

  const handle = openModal({
    title: '',
    cls: 'modal-ascension',
    body: root,
    dismissible: false,
    actions: [{
      text: '入 下 一 世',
      cls: 'btn-gold',
      onClick: () => { if (onDone) onDone(); },
    }],
  });

  return handle;
}
