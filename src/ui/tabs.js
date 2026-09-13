/**
 * 主标签页导航。
 * 桌面端渲染成顶部标签条，窄屏由 CSS 切换成底部固定导航（同一份 DOM）。
 */

import { el, clear } from './dom.js';
import { state } from '../core/state.js';

export const TABS = [
  { id: 'cultivate', name: '修炼', minRealm: 0 },
  { id: 'technique', name: '功法', minRealm: 0 },
  { id: 'talent',    name: '天赋', minRealm: 0 },
  { id: 'cave',      name: '洞府', minRealm: 0 },
  { id: 'sect',      name: '宗门', minRealm: 9 },
  { id: 'beast',     name: '灵兽', minRealm: 0 },
  { id: 'companion', name: '道侣', minRealm: 9 },
  { id: 'alchemy',   name: '炼丹', minRealm: 3 },
  { id: 'forge',     name: '炼器', minRealm: 6 },
  { id: 'inventory', name: '背包', minRealm: 0 },
  { id: 'achievement', name: '成就', minRealm: 0 },
  { id: 'codex',     name: '图鉴', minRealm: 0 },
  { id: 'world',     name: '天象', minRealm: 0 },
  { id: 'shop',      name: '坊市', minRealm: 0 },
  { id: 'tower',     name: '试炼', minRealm: 5 },
  { id: 'reincarnation', name: '轮回', minRealm: 0 },
  { id: 'info',      name: '信息', minRealm: 0 },
];

let active = 'cultivate';
const changeHandlers = [];
const badges = {};   // { [tabId]: boolean } 小红点

export function currentTab() {
  return active;
}

export function onTabChange(fn) {
  changeHandlers.push(fn);
}

/** 给某个标签加/去小红点（如"有可突破"、"有可炼制"） */
export function setBadge(tabId, on) {
  const next = !!on;
  if (badges[tabId] === next) return;
  badges[tabId] = next;
  renderTabs();
}

export function setTab(id) {
  if (!TABS.some((t) => t.id === id) || active === id) return;
  active = id;
  applyActive();
  for (const fn of changeHandlers) {
    try { fn(id); } catch (e) { console.error(e); }
  }
}

function applyActive() {
  for (const t of TABS) {
    const pane = document.getElementById('pane-' + t.id);
    if (pane) pane.classList.toggle('active', t.id === active);
  }
  for (const node of document.querySelectorAll('[data-tab]')) {
    node.classList.toggle('active', node.dataset.tab === active);
  }
}

function tabButton(t) {
  const btn = el('button', {
    class: 'tab',
    type: 'button',
    dataset: { tab: t.id },
    text: t.name,
  });
  btn.addEventListener('click', () => setTab(t.id));
  return btn;
}

/**
 * 重建标签栏。
 *
 * ⚠ 必须做指纹守卫：本函数会被 renderAll() 每帧调用（最高 4 次/秒），
 * 若无条件 clear + 重建，按钮 DOM 会持续被销毁重建——
 * 后果不只是浪费，而是玩家点击时元素正好被移除，点击直接丢失。
 */
let lastTabsSig = '';

export function renderTabs() {
  const realmIndex = state.player.realmIndex;
  const visible = TABS.filter((t) => realmIndex >= t.minRealm);
  const sig = visible.map((t) => t.id + (badges[t.id] ? '*' : '')).join(',');

  if (sig === lastTabsSig) return;
  lastTabsSig = sig;

  const bar = document.getElementById('mainTabs');
  const nav = document.getElementById('mobileNav');

  for (const host of [bar, nav]) {
    if (!host) continue;
    clear(host);
    for (const t of visible) {
      const btn = tabButton(t);
      if (badges[t.id]) {
        btn.appendChild(el('span', { class: 'tab-dot' }));
      }
      host.appendChild(btn);
    }
  }
  applyActive();
}

/** 重开档时清掉指纹，强制下次重建 */
export function resetTabs() {
  lastTabsSig = '';
}

export function initTabs() {
  renderTabs();
  applyActive();
}
