/**
 * DOM 小工具。
 * 全部走原生 API，不引入任何库。
 */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** 转义用户可输入的文本，防止玩家名字里的尖括号破坏结构 */
export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 创建元素 */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

/** HTML 字符串转节点（用于拼装复杂块） */
export function frag(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content;
}

export function clear(node) {
  if (node) node.replaceChildren();
  return node;
}

export function setText(id, text) {
  const n = typeof id === 'string' ? document.getElementById(id) : id;
  if (n && n.textContent !== String(text)) n.textContent = String(text);
  return n;
}

export function setHTML(id, html) {
  const n = typeof id === 'string' ? document.getElementById(id) : id;
  if (n) n.innerHTML = html;
  return n;
}

export function setClass(node, cls, on) {
  const n = typeof node === 'string' ? document.getElementById(node) : node;
  if (n) n.classList.toggle(cls, !!on);
  return n;
}

export function show(node, visible = true) {
  const n = typeof node === 'string' ? document.getElementById(node) : node;
  if (n) n.classList.toggle('hidden', !visible);
  return n;
}

/** 进度条渲染：返回填充与文字的 HTML */
export function barHTML(pct, cls = '', text = '') {
  const p = Math.max(0, Math.min(100, pct));
  return `<div class="bar"><div class="bar-fill ${cls}" style="width:${p}%"></div>` +
    (text ? `<div class="bar-text">${esc(text)}</div>` : '') + `</div>`;
}

/** 品质标签 HTML */
export function qualityTagHTML(qualityId, name) {
  return `<span class="q quality-${esc(qualityId)}">${esc(name)}</span>`;
}
