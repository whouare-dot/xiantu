/**
 * 轻量引导。
 *
 * 放在 UI 层而不是 systems/：它管的是"哪些提示已经读过了"，
 * 这是界面状态，不是游戏规则。为三十行逻辑单开一个系统模块是过度设计。
 *
 * 三条设计约束：
 *   1. **不阻塞**。提示条出现在标签内容区上方，玩家可以直接无视它继续操作。
 *   2. **只出现一次**。已读记录存在 state.guide，**跨轮回保留**——
 *      第五世的玩家不需要重看第一世看过的东西。
 *   3. **一句话**。讲"这东西干什么用"，不讲"怎么点按钮"。
 */

import { state } from '../core/state.js';
import { GUIDE_TIPS } from '../data/guides.js';
import { currentTab } from './tabs.js';
import { esc } from './dom.js';

/**
 * 把文案里的 **强调** 渲染成 <b>。
 *
 * ⚠ **必须先转义再替换**。顺序反过来（先替换再转义）就等于把数据里的
 * `<b>` 一起转义掉，或者更糟——留着没转义的内容当 HTML 插进页面。
 * 转义在前，正则只可能匹配到已转义的文本，注入面为零。
 *
 * 之前这里是 `esc(tip.text)` 直出，而 data/guides.js 里有 4 条用了
 * Markdown 粗体，玩家看到的就是字面的 `**真的和你一起打**`。
 */
function richText(s) {
  return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
}

function seen() {
  if (!state.guide) state.guide = { seen: [] };
  if (!Array.isArray(state.guide.seen)) state.guide.seen = [];
  return state.guide.seen;
}

export function isSeen(tabId) {
  return seen().includes(tabId);
}

export function markSeen(tabId) {
  const s = seen();
  if (!s.includes(tabId)) {
    s.push(tabId);
    if (s.length > 200) s.splice(0, s.length - 200);
  }
}

/** 当前标签是否有未读提示 */
export function pendingTip() {
  const tab = currentTab();
  const tip = GUIDE_TIPS[tab];
  if (!tip || isSeen(tab)) return null;
  return { tab, ...tip };
}

/**
 * 渲染提示条。由 render.js 在每次重绘时调用。
 * 内容没变则不碰 DOM——与面板同一套约定。
 */
let lastRendered = null;

export function renderGuide() {
  const bar = document.getElementById('guideBar');
  if (!bar) return;

  const tip = pendingTip();
  const key = tip ? tip.tab : '';

  if (key === lastRendered) return;
  lastRendered = key;

  if (!tip) {
    bar.hidden = true;
    bar.innerHTML = '';
    return;
  }

  bar.hidden = false;
  bar.innerHTML = `
    <div class="guide-tip">
      <span class="guide-mark">❖</span>
      <span class="guide-body">
        <b>${esc(tip.title)}</b>　${richText(tip.text)}
      </span>
      <button class="btn btn-sm guide-close" type="button" data-guide-close="${esc(tip.tab)}">知道了</button>
    </div>
  `;
  bar.querySelector('[data-guide-close]')?.addEventListener('click', (e) => {
    markSeen(e.currentTarget.dataset.guideClose);
    lastRendered = null;
    renderGuide();
  });
}

export function initGuide() {
  lastRendered = null;
  renderGuide();
}

/** 重开档 / 读档后强制重绘 */
export function resetGuide() {
  lastRendered = null;
}
