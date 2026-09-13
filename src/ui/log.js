/**
 * 修行日志。
 *
 * systems/ 层通过 bus.emit(EV.LOG, {text, cls, channel}) 发日志，
 * 这里负责收、存、分流渲染。systems/ 不碰 DOM。
 */

import { state } from '../core/state.js';
import { on, EV } from '../core/bus.js';
import { fmtTime } from '../core/format.js';
import { el, clear, esc } from './dom.js';

const MAX_ENTRIES = 200;

const CHANNELS = [
  { id: 'all', name: '全部' },
  { id: 'cultivate', name: '修行' },
  { id: 'battle', name: '战报' },
  { id: 'system', name: '系统' },
];

let filter = 'all';
let dirty = true;
let autoScroll = true;

/** 写入一条日志（同时进 state.log，便于存档） */
export function pushLog({ text, cls = '', channel = 'system' }) {
  if (!text) return;
  const entry = { t: Date.now(), text: String(text), cls, channel };
  state.log.push(entry);
  if (state.log.length > MAX_ENTRIES) state.log.splice(0, state.log.length - MAX_ENTRIES);
  dirty = true;
}

/** 供 UI 强制刷新 */
export function markLogDirty() {
  dirty = true;
}

export function setLogFilter(f) {
  filter = f;
  dirty = true;
  renderLog();
}

export function setAutoScroll(on_) {
  autoScroll = !!on_;
}

export function initLog() {
  // 订阅总线的日志事件
  on(EV.LOG, (payload) => pushLog(payload || {}));

  const host = document.getElementById('panelLog');
  if (host) {
    host.innerHTML = `
      <div class="panel-title">修 行 日 志<span class="pt-extra" id="logCount"></span></div>
      <div class="row row-wrap mb-1" id="logFilters"></div>
      <div class="log-scroll" id="logScroll"></div>
      <div class="row-between mt-1">
        <label class="small muted row" style="cursor:pointer;">
          <input type="checkbox" id="logAutoScroll" checked> 自动滚动
        </label>
        <button class="btn btn-sm" id="btnClearLog" type="button">清空</button>
      </div>
    `;

    const filters = document.getElementById('logFilters');
    for (const c of CHANNELS) {
      const b = el('button', {
        class: 'tag' + (c.id === filter ? ' tag-gold' : ''),
        type: 'button',
        text: c.name,
        dataset: { filter: c.id },
      });
      b.addEventListener('click', () => {
        for (const x of filters.querySelectorAll('[data-filter]')) {
          x.classList.toggle('tag-gold', x.dataset.filter === c.id);
        }
        setLogFilter(c.id);
      });
      filters.appendChild(b);
    }

    document.getElementById('logAutoScroll').addEventListener('change', (e) => {
      setAutoScroll(e.target.checked);
    });
    document.getElementById('btnClearLog').addEventListener('click', () => {
      state.log.length = 0;
      dirty = true;
      renderLog();
    });

    const scroll = document.getElementById('logScroll');
    scroll.addEventListener('scroll', () => {
      // 玩家手动往上翻时暂停自动滚动，翻到底部再恢复
      const atBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 30;
      const box = document.getElementById('logAutoScroll');
      if (autoScroll && !atBottom) { autoScroll = false; if (box) box.checked = false; }
      else if (!autoScroll && atBottom) { autoScroll = true; if (box) box.checked = true; }
    });
  }

  dirty = true;
}

export function renderLog() {
  if (!dirty) return;
  const scroll = document.getElementById('logScroll');
  if (!scroll) return;
  dirty = false;

  const list = filter === 'all'
    ? state.log
    : state.log.filter((e) => e.channel === filter);

  clear(scroll);
  if (list.length === 0) {
    scroll.appendChild(el('div', { class: 'list-empty', text: '尚无记载' }));
    return;
  }

  // 只渲染最近 120 条，避免长期游戏后节点过多
  for (const e of list.slice(-120)) {
    const div = el('div', { class: 'log-entry ' + (e.cls || '') });
    div.innerHTML = `<span class="log-time">[${esc(fmtTime(e.t))}]</span>${esc(e.text)}`;
    scroll.appendChild(div);
  }

  const counter = document.getElementById('logCount');
  if (counter) counter.textContent = `${list.length} 条`;

  if (autoScroll) {
    requestAnimationFrame(() => { scroll.scrollTop = scroll.scrollHeight; });
  }
}

/** 供其它模块在写入后立即刷新 */
export function flushLog() {
  if (dirty) renderLog();
}
