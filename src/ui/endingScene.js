/**
 * 真结局演出（V4.0 收官）。
 *
 * ============ 为什么复用 modal.js 而不是自造全屏层 ============
 *
 * 演出期间**必须有东西挡住奇遇**。encounter.js 的调用方用的是
 * `isModalOpen()` 判断，而那个集合由 ui/modal.js 独家维护。
 * 如果这里另起一套全屏层，就得再手写一遍"演出中不要弹奇遇"的逻辑，
 * 而漏掉它的后果是：玩家正读到"轮回是有人把再来一次做成了可以传下去的东西"，
 * 背后突然弹出一只妖兽问你要不要打。
 *
 * 复用 modal 还有个附带好处：Esc、遮罩、层级、滚动条样式全都已经是对的。
 *
 * ============ 为什么不用定时器 ============
 *
 * 逐行淡入靠 CSS `animation-delay`，不靠 setTimeout 链。
 * 挂机游戏常被切到后台放着——定时器在后台会被节流甚至冻结，
 * 切回来时演出会卡在半句上；CSS 动画则由浏览器按时间轴自行推进，不会错位。
 * 而且没有 timer 就没有"演出被中断后谁来清理"这个问题。
 */

import { el, esc } from './dom.js';
import { openModal } from './modal.js';
import { state } from '../core/state.js';
import { svg, ICON_TRIBULATION } from '../assets/svg.js';
import { ENDING_SCRIPT, ENDING_TITLE, FREE_MODE_NOTE } from '../data/endingText.js';
import { bloodlines } from '../systems/bloodline.js';

/** 每行之间的间隔（秒），与 CSS 里的 animation-delay 步长必须一致 */
const LINE_STEP = 0.9;
/** 每行淡入本身的时长（秒） */
const LINE_FADE = 0.7;

/**
 * 播放结局演出。
 * @param {object} [opts]
 * @param {object} [opts.summary] 结算数据（世数、道基点、道侣数…），用于最后一幕的落款
 * @param {Function} [opts.onDone] 演出结束后回调
 * @returns {{close:Function}}
 */
export function playEnding(opts = {}) {
  const { summary = collectSummary(), onDone = null } = opts;

  let scene = 0;
  /** 按钮解禁的定时器。翻页时必须清掉上一个，否则上一幕的定时器会把新一幕的按钮提前解禁 */
  let enableTimer = 0;
  const box = buildBox();
  const handle = openModal({
    title: '',
    cls: 'modal-ending',
    body: box.root,
    dismissible: false,
  });

  function render() {
    const s = ENDING_SCRIPT[scene];
    const last = scene === ENDING_SCRIPT.length - 1;

    box.stage.innerHTML = `
      <div class="ending-scene" data-scene="${esc(s.id)}">
        <div class="ending-scene-title">${esc(s.title)}</div>
        <div class="ending-lines">
          ${s.lines.map((ln, i) => `
            <div class="ending-line ${esc(ln.cls || '')}"
                 style="animation-delay:${(i * LINE_STEP).toFixed(2)}s">${esc(ln.t)}</div>`).join('')}
        </div>
        <div class="ending-sign" style="animation-delay:${(s.lines.length * LINE_STEP + 0.3).toFixed(2)}s">
          —— ${esc(s.sign)}
        </div>
      </div>`;

    // 按钮要等最后一行洗完再出现，否则玩家的眼睛还在读字，手已经点下去了
    const wait = (s.lines.length * LINE_STEP + LINE_FADE + 0.3) * 1000;
    box.next.disabled = true;
    box.next.textContent = last ? '入 自 由 之 境' : '继 续';
    clearTimeout(enableTimer);
    enableTimer = setTimeout(() => {
      if (!box.next.isConnected) return;   // 弹窗已被关掉，别再动它
      box.next.disabled = false;
      box.next.classList.add('ready');
    }, wait);

    // 进度点：让玩家知道这场戏有多长，而不是无穷无尽地翻
    box.progress.innerHTML = ENDING_SCRIPT
      .map((_, i) => `<span class="ending-dot${i === scene ? ' on' : ''}"></span>`).join('');
  }

  function advance() {
    if (box.next.disabled) return;
    if (scene < ENDING_SCRIPT.length - 1) {
      scene++;
      render();
      return;
    }
    finish();
  }

  function finish() {
    clearTimeout(enableTimer);
    // ⚠ 这里只能改 stage，**不能** `box.root.innerHTML = ...`：
    // stage / actions / 按钮都是 root 的子节点，整体重写会把它们一起摘掉，
    // 之后 appendChild 进的是一个已经脱离文档的 actions —— 按钮永远不出现。
    box.stage.innerHTML = `
      <div class="ending-scene" data-scene="finale">
        <div class="ending-scene-title">终 章</div>
        <div class="ending-finale">
          <div class="ending-line reveal" style="animation-delay:0s">${esc(ENDING_TITLE)}</div>
          <div class="ending-stats">${summaryRows(summary)}</div>
          <div class="ending-line" style="animation-delay:0.6s">${esc(FREE_MODE_NOTE)}</div>
        </div>
        <div class="ending-sign" style="animation-delay:1.2s">—— 第 ${summary.gen} 世 · 你已经不必再走了</div>
      </div>`;

    // 落幕：翻页按钮与跳过都退场，只留下"回到人间"
    box.next.style.display = 'none';
    box.skip.style.display = 'none';
    box.progress.innerHTML = ENDING_SCRIPT
      .map(() => '<span class="ending-dot on"></span>').join('');

    const btn = el('button', { class: 'btn btn-gold', type: 'button', text: '回 到 人 间' });
    btn.addEventListener('click', () => {
      handle.close();
      if (onDone) onDone();
    });
    box.actions.appendChild(btn);
  }

  box.next.addEventListener('click', advance);
  box.skip.addEventListener('click', () => { handle.close(); if (onDone) onDone(); });

  render();
  return handle;
}

// ==================== 结构 ====================

function buildBox() {
  const root = el('div', { class: 'ending-wrap' });

  const art = el('div', { class: 'ending-art', html: svg(ICON_TRIBULATION, 46) });
  const progress = el('div', { class: 'ending-progress' });
  const stage = el('div', { class: 'ending-stage' });
  const actions = el('div', { class: 'modal-actions' });

  const next = el('button', { class: 'btn btn-gold ending-next', type: 'button', text: '继 续' });
  const skip = el('button', { class: 'ending-skip', type: 'button', text: '跳过演出' });

  root.appendChild(art);
  root.appendChild(progress);
  root.appendChild(stage);
  root.appendChild(actions);
  root.appendChild(next);
  root.appendChild(skip);

  return { root, stage, progress, actions, next, skip };
}

/**
 * 从当前状态里认领这一局走过的东西——演出的落款必须是玩家真的做过的。
 *
 * ⚠ 走 core/state.js 的 state，不要用 window.__xiantu。
 * 那是个调试后门，随时可能被改掉或删掉；而且它是内存快照语义，
 * 读档/轮回换过 state 之后可能指向旧对象——落款会写上一个不存在的过去。
 */
function collectSummary() {
  const rc = state.reincarnation || {};
  return {
    gen: rc.count || 0,
    daoBase: rc.daoBase || 0,
    companions: Object.keys(state.companions?.bond || {}).length,
    bloodlines: Object.keys(bloodlines()).length,
    achievements: (state.achievements?.unlocked || []).length,
  };
}

function summaryRows(s) {
  const rows = [
    ['历经', `${s.gen} 世`],
    ['道基点', String(s.daoBase)],
    ['道侣羁绊', `${s.companions} 位`],
    ['灵兽血脉', `${s.bloodlines} 条`],
    ['成就', `${s.achievements} 项`],
  ];
  return rows.map(([k, v]) =>
    `<div class="ending-stat"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`).join('');
}
