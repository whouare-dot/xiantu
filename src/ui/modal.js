/**
 * 弹窗系统。
 *
 * 奇遇、天劫演出、离线结算、确认框都走这里。
 * 关键约定：只要有弹窗开着，奇遇冷却就不会倒计时（见 encounter.js 的调用方），
 * 避免"玩家正在读剧情，背后又弹一个新事件"的打断感。
 */

import { el, esc, clear } from './dom.js';

let seq = 0;
const open = new Set();

/** 是否有弹窗开着 */
export function isModalOpen() {
  return open.size > 0;
}

/**
 * @param {object} opts
 * @param {string} opts.title        标题
 * @param {string} [opts.desc]       描述段落（走古卷引文样式）
 * @param {string|Node} [opts.body]  HTML 字符串或节点
 * @param {Array} [opts.choices]     选项 [{text, hint, disabled, reason, cls, onClick}]
 * @param {Array} [opts.actions]     底部按钮 [{text, cls, onClick, keepOpen}]
 * @param {string} [opts.art]        SVG 字符串
 * @param {boolean} [opts.wide]      宽版
 * @param {string} [opts.cls]        追加到 .modal-box 上的类（特殊演出用，如结局）
 * @param {boolean} [opts.dismissible] 点遮罩/按 Esc 可关（选择类弹窗应设 false，迫使玩家做决定）
 * @param {Function} [opts.onClose]
 * @returns {{id:number, close:Function, box:HTMLElement}}
 */
export function openModal(opts) {
  const {
    title = '', desc = '', body = null, choices = null, actions = null,
    art = '', wide = false, cls = '', dismissible = false, onClose = null,
  } = opts || {};

  const id = ++seq;
  const root = document.getElementById('modalRoot');

  const mask = el('div', { class: 'modal-mask', dataset: { modal: String(id) } });
  const box = el('div', { class: 'modal-box' + (wide ? ' wide' : '') + (cls ? ' ' + cls : '') });

  if (art) box.appendChild(el('div', { class: 'modal-art', html: art }));
  if (title) box.appendChild(el('div', { class: 'modal-title', text: title }));
  if (desc) box.appendChild(el('div', { class: 'modal-desc', text: desc }));

  if (body) {
    const bodyWrap = el('div', { class: 'modal-body' });
    if (typeof body === 'string') bodyWrap.innerHTML = body;
    else bodyWrap.appendChild(body);
    box.appendChild(bodyWrap);
  }

  const handle = {
    id,
    box,
    close: () => closeModal(handle),
  };

  if (choices && choices.length) {
    const wrap = el('div', { class: 'modal-choices' });
    for (const c of choices) {
      const btn = el('button', {
        class: 'btn btn-block ' + (c.cls || (c.disabled ? '' : 'btn-jade')),
        disabled: c.disabled ? '' : null,
        type: 'button',
      });
      btn.innerHTML = esc(c.text) +
        (c.hint ? `<span class="choice-hint">${esc(c.hint)}</span>` : '') +
        (c.disabled && c.reason ? `<span class="choice-hint">${esc(c.reason)}</span>` : '');
      if (c.disabled) btn.disabled = true;
      btn.addEventListener('click', () => {
        if (c.disabled) return;
        closeModal(handle);
        if (c.onClick) c.onClick();
      });
      wrap.appendChild(btn);
    }
    box.appendChild(wrap);
  }

  if (actions && actions.length) {
    const wrap = el('div', { class: 'modal-actions' });
    for (const a of actions) {
      const btn = el('button', { class: 'btn ' + (a.cls || ''), type: 'button', text: a.text });
      btn.addEventListener('click', () => {
        if (!a.keepOpen) closeModal(handle);
        if (a.onClick) a.onClick();
      });
      wrap.appendChild(btn);
    }
    box.appendChild(wrap);
  }

  if (dismissible) {
    mask.addEventListener('click', (e) => {
      if (e.target === mask) closeModal(handle);
    });
  }

  mask.appendChild(box);
  root.appendChild(mask);
  open.add(handle);

  return handle;
}

export function closeModal(handle) {
  if (!handle || !open.has(handle)) return;
  open.delete(handle);
  const mask = handle.box.parentElement;
  if (mask && mask.parentElement) mask.parentElement.removeChild(mask);
  if (handle.onClose) {
    try { handle.onClose(); } catch (e) { console.error(e); }
  }
}

export function closeAllModals() {
  for (const h of Array.from(open)) closeModal(h);
}

/** 确认框，返回 Promise<boolean> */
export function confirmModal(title, message, { danger = false, okText = '确定', cancelText = '取消' } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    const h = openModal({
      title,
      desc: message,
      actions: [
        { text: cancelText, onClick: () => done(false) },
        {
          text: okText,
          cls: danger ? 'btn-primary' : 'btn-gold',
          onClick: () => done(true),
        },
      ],
      onClose: () => done(false),
    });
  });
}

/** 单按钮提示框 */
export function alertModal(title, message, { art = '', okText = '知道了' } = {}) {
  return new Promise((resolve) => {
    openModal({
      title, desc: message, art,
      actions: [{ text: okText, cls: 'btn-gold', onClick: () => resolve(true) }],
      onClose: () => resolve(true),
    });
  });
}

// Esc 关闭可关闭的弹窗
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const all = Array.from(open);
  if (all.length === 0) return;
  const top = all[all.length - 1];
  // 只有带「关闭」按钮语义的弹窗才响应 Esc，选择类弹窗必须由玩家点选项
  if (top.box.querySelector('.modal-actions')) closeModal(top);
});
