/**
 * 飘字提示。
 * 挂机游戏最缺的就是"反馈感"——数字在涨、东西在到手，但玩家看不见。
 * 这里给关键收益一个短促的浮出动画。
 */

import { $ } from './dom.js';

const MAX_TOASTS = 5;

/**
 * @param {string} text
 * @param {'good'|'bad'|'special'|'reward'} kind
 */
export function toast(text, kind = 'good') {
  const root = $('#toastRoot');
  if (!root) return;

  const node = document.createElement('div');
  node.className = 'toast ' + kind;
  node.textContent = text;
  root.appendChild(node);

  // 限制同屏数量，避免刷屏
  while (root.children.length > MAX_TOASTS) {
    root.removeChild(root.firstChild);
  }
  node.addEventListener('animationend', () => node.remove(), { once: true });
}

/** 收益类飘字（更醒目） */
export function reward(text) {
  toast(text, 'reward');
}

export function warn(text) {
  toast(text, 'bad');
}

export function note(text) {
  toast(text, 'special');
}
