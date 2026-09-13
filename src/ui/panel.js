/**
 * 面板基座：把「重建结构」与「刷新数值」彻底分开。
 *
 * ============ 为什么需要这个 ============
 *
 * V2.0 的写法是给每个面板算一个"签名"，签名变了就 clear() + 重建整个 DOM。
 * 问题在于签名里混进了**每秒都在变的数值**（拍卖行倒计时、炉子剩余时间、
 * 气血自然恢复……），于是这些面板实际上在**每秒全量重建**。
 *
 * 后果有两个，都是玩家能直接感知的：
 *   1. 列表滚动位置每秒被重置回顶部——因为节点被换掉了
 *   2. 鼠标悬停在按钮上时 :hover 状态丢失，每秒闪一下
 *
 * 修法不是把倒计时从签名里删掉了事，而是**从模式上分开两件事**：
 *
 *   structure() —— 只返回「结构性信息」：列表里有哪些项、当前子标签、解锁状态。
 *                  这些变了才重建 DOM。
 *   refresh()   —— 每次渲染都调用，只更新已有节点的文字/宽度/样式。
 *                  倒计时、余额、血条全走这里。
 *
 * 这样 DOM 节点是稳定的：滚动位置保持、hover 不丢、也没有每秒重建的开销。
 */

import { clear } from './dom.js';

/**
 * @param {object} spec
 * @param {string}   spec.id         面板标识（报错时用）
 * @param {Function} spec.structure  返回结构指纹字符串；变了才重建
 * @param {Function} spec.build      build(host) —— 重建 DOM，只建骨架
 * @param {Function} [spec.refresh]  refresh(host) —— 每次渲染调用，只改数值
 * @returns {{id:string, render:Function, reset:Function}}
 */
export function createPanel({ id, structure, build, refresh }) {
  let lastSig = null;
  let built = false;

  return {
    id,

    /** 当前结构指纹。调试 / 自检用：连续取两次相同，说明不需要重建。 */
    structure,

    render(host) {
      if (!host) return;
      const sig = typeof structure === 'function' ? String(structure()) : String(structure ?? '');

      if (!built || sig !== lastSig) {
        lastSig = sig;
        built = true;
        // 重建会替换所有节点，滚动位置随之丢失。
        // 结构性变化确实需要重建，但不该顺带把玩家翻到一半的列表弹回顶部，
        // 所以这里记下滚动位置、重建后按路径还原。
        const snaps = captureScroll(host);
        clear(host);
        build(host);
        restoreScroll(host, snaps);
      }
      if (refresh) refresh(host);
    },

    /** 重开档 / 强制重建时调用 */
    reset() {
      built = false;
      lastSig = null;
    },
  };
}

// ==================== 重建时的滚动位置保持 ====================

/**
 * 记录 root 子树里所有「被滚动过」的容器。
 *
 * 用**稳定的 CSS 类 + 同类中的序号**定位，而不是子节点下标路径——
 * 重建往往正是因为某些区块增删（比如炉火从"燃烧中"变成"空闲"），
 * 下标会整体错位，按路径还原必然找错节点甚至找不到。
 */
function captureScroll(root) {
  const snaps = [];
  for (const el of root.querySelectorAll('*')) {
    if (el.scrollTop <= 0) continue;
    const sel = selectorFor(el);
    if (!sel) continue;
    const same = root.querySelectorAll(sel);
    snaps.push({ sel, idx: Array.prototype.indexOf.call(same, el), top: el.scrollTop });
  }
  return snaps;
}

function selectorFor(el) {
  if (el.id) return '#' + CSS.escape(el.id);
  const cls = String(el.className || '').trim();
  if (!cls) return null;
  // className 里可能混入 state 类，取前两个作为定位用的稳定特征
  const parts = cls.split(/\s+/).slice(0, 2).map((c) => '.' + CSS.escape(c));
  return parts.join('');
}

function restoreScroll(root, snaps) {
  if (!snaps.length) return;
  const apply = () => {
    for (const { sel, idx, top } of snaps) {
      const el = root.querySelectorAll(sel)[idx];
      if (!el) continue;
      // 只在容器确实可滚动时才夹取。
      // 布局未完成时 scrollHeight/clientHeight 都是 0，
      // 此时若做 Math.min(top, scrollHeight - clientHeight) 会把位置夹成 0——
      // 那正是"还原"反而把滚动清零的原因。
      const max = el.scrollHeight - el.clientHeight;
      el.scrollTop = max > 0 ? Math.min(top, max) : top;
    }
  };
  apply();
  // 再补一帧：首次 apply 时新节点可能尚未完成布局
  requestAnimationFrame(() => {
    for (const { sel, idx, top } of snaps) {
      const el = root.querySelectorAll(sel)[idx];
      if (el && el.scrollTop === 0 && top > 0) {
        const max = el.scrollHeight - el.clientHeight;
        el.scrollTop = max > 0 ? Math.min(top, max) : top;
      }
    }
  });
}

// ==================== 只改数值的小工具 ====================

/**
 * 3 参形态的节点定位。第二个参数有两种可能，必须靠**类型**区分：
 *     setXxx(host, '[data-f="atk"]', 12)   —— 选择器
 *     setXxx(host, someElement, 12)        —— 调用方已经自己取好了节点
 * 后者在灵兽 / 宗门 / 洞府等列表里很常见（行内先查一次，循环里复用）。
 *
 * ⚠ 两种误判都会炸，方向还相反：
 *   - 只看"第二个参数是不是节点"→ 把选择器当节点用，静默不更新（列表数字全冻住）
 *   - 只看"第一个参数是不是节点"→ 见下面 setText 的注释，会把面板容器当成目标，
 *     一记 textContent 把整页骨架冲掉。**曾经因此 11 个面板集体白屏。**
 */
function locate(host, sel) {
  if (sel && typeof sel === 'object' && sel.nodeType === 1) return sel;
  return query(host, sel);
}

/**
 * 值形式（首参即目标节点）的兜底。
 * 不是元素就返回 null —— **返回 null 只是这次不更新，绝不会误伤别的节点**。
 * 这类工具最坏的失败不是"没生效"，而是"改错了对象"。
 */
function asNode(x) {
  return x && typeof x === 'object' && x.nodeType === 1 ? x : null;
}

function query(host, sel) {
  if (!host || typeof sel !== 'string') return null;
  try {
    return host.querySelector(sel);
  } catch {
    // 非法选择器（例如误把一句中文提示传了进来）：静默跳过，不中断渲染
    console.warn('[panel] 非法的选择器，已跳过：', sel);
    return null;
  }
}

/**
 * 更新文本，内容没变则不动 DOM。
 * 挂机游戏每秒都在刷同样的数字（速率、上限），无脑赋值也会触发样式重算。
 *
 * ⚠ 实现细节很重要：**优先改已有文本节点的 nodeValue，而不是 `textContent`**。
 * `node.textContent = x` 的语义是「删掉所有子节点，再插一个新的文本节点」——
 * 结果是节点身份被换掉，MutationObserver 记成 childList 变更。
 * 对每秒刷新的倒计时来说，这会持续制造 DOM 结构变更。
 */
export function setText(a, b, c) {
  let node, value;
  if (arguments.length === 2) { node = asNode(a); value = b; }
  else { node = locate(a, b); value = c; }
  if (!node) return;

  const text = String(value ?? '');
  if (node.childNodes.length === 1 && node.firstChild.nodeType === Node.TEXT_NODE) {
    if (node.firstChild.nodeValue !== text) node.firstChild.nodeValue = text;
    return;
  }
  if (node.childNodes.length === 0) {
    if (text === '') return;
    node.appendChild(document.createTextNode(text));
    return;
  }
  if (node.textContent !== text) node.textContent = text;
}

/** 更新进度条宽度（pct 为 0~100） */
export function setWidth(a, b, c) {
  let node, pct;
  if (arguments.length === 2) { node = asNode(a); pct = b; } else { node = locate(a, b); pct = c; }
  if (!node) return;
  const next = Math.max(0, Math.min(100, Number(pct) || 0)) + '%';
  if (node.style.width !== next) node.style.width = next;
}

/** 切换 class（只在真正变化时才动） */
export function toggleClass(a, b, c, d) {
  let node, cls, on;
  if (arguments.length === 3) { node = asNode(a); cls = b; on = c; }
  else { node = locate(a, b); cls = c; on = d; }
  if (!node) return;
  if (node.classList.contains(cls) !== !!on) node.classList.toggle(cls, !!on);
}

/** 设置 disabled，只在变化时才写 */
export function setDisabled(a, b, c) {
  let node, disabled;
  if (arguments.length === 2) { node = asNode(a); disabled = b; }
  else { node = locate(a, b); disabled = c; }
  if (!node) return;
  if (node.disabled !== !!disabled) node.disabled = !!disabled;
}

/** 批量更新一组 [选择器, 值] */
export function setTexts(host, pairs) {
  for (const [sel, val] of pairs) setText(host, sel, val);
}

/**
 * 倒计时统一格式化。所有面板的倒计时都走这里，避免各写各的显示风格。
 */
export function countdownText(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  if (s >= 86400) return Math.floor(s / 86400) + '天' + Math.floor((s % 86400) / 3600) + '时';
  if (s >= 3600) return Math.floor(s / 3600) + '时' + Math.floor((s % 3600) / 60) + '分';
  if (s >= 60) return Math.floor(s / 60) + '分' + String(s % 60).padStart(2, '0') + '秒';
  return s + '秒';
}
