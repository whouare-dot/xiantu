/**
 * 图鉴页（V4.0「轮回」）。
 *
 * createPanel 模式（结构 / 数值分离）：
 *   structure —— 当前分类 + 七个分类的已收集**数量** → 变了才重建
 *   refresh   —— 每帧只更新顶部与当前分类的进度条宽度、进度文字
 *
 * 关键：签名里绝不出现每秒变化的量（图鉴本身也不含倒计时），
 * 因此本面板静置时不会重建 DOM。
 *
 * 未收集条目：名字与描述都遮成 ???，只给一条"在哪能遇到"的线索；
 * 已收集条目：完整名称、品阶、描述、小传与关键数值全部展开。
 */

import { state } from '../../core/state.js';
import {
  CODEX_KINDS, has, progress, overallProgress, kindMeta,
  UNKNOWN_NAME, UNKNOWN_DESC, clueFor, summaryFor,
} from '../../systems/codex.js';
import { esc, qualityTagHTML } from '../dom.js';
import { createPanel, setText, setWidth } from '../panel.js';
import { signature } from '../render.js';
import { forceRender } from '../../core/loop.js';

/** 分类说明，一句话讲清这一栏收的是什么 */
const KIND_BLURB = {
  techniques: '参悟过的功法。修为的根基',
  equipped: '见过与拥有的兵器、护具、法宝',
  pills: '服用过、炼出过或见过的丹药',
  materials: '采过、掉过、攒过的灵材',
  beasts: '结缘过的灵兽，含尚未孵化的蛋',
  enemies: '交过手的对手，败者亦入册',
  encounters: '游历途中遇见的奇遇',
};

let codexTab = 'techniques';

export const codexPanel = createPanel({
  id: 'codex',

  structure() {
    // 任一分类的收集数量变化即重建；分类切换也重建。
    // 这里只放"结构性信息"，不放任何实时数值。
    const counts = CODEX_KINDS.map((k) => (state.codex?.[k.id]?.length || 0)).join(',');
    return signature(codexTab, counts);
  },

  build(host) {
    const tabs = CODEX_KINDS.map((k) => {
      const p = progress(k.id);
      const on = codexTab === k.id;
      return `<button class="btn btn-sm ${on ? 'btn-gold' : ''}"
        data-codex-tab="${esc(k.id)}" type="button">${esc(k.name)} ${p.got}/${p.total}</button>`;
    }).join('');

    const meta = kindMeta(codexTab);
    const rows = meta ? meta.table.map((e) => codexRow(codexTab, e)).join('') : '';

    host.innerHTML = `
      <div class="panel-title">
        <span>图 鉴</span>
        <span class="pt-extra num" data-codex-overall></span>
      </div>
      <div class="bar mb-2"><div class="bar-fill full" data-codex-overall-bar style="width:0%"></div></div>
      <div class="row mb-2" style="gap:4px;flex-wrap:wrap;">${tabs}</div>
      <div class="small muted mb-2">${esc(KIND_BLURB[codexTab] || '')}</div>
      <div class="bar mb-2"><div class="bar-fill" data-codex-bar style="width:0%"></div></div>
      <div class="small muted mb-2" data-codex-clue></div>
      <div class="list">${rows || '<div class="list-empty">此分类暂无条目</div>'}</div>
    `;

    host.querySelectorAll('[data-codex-tab]').forEach((b) => {
      b.addEventListener('click', () => {
        if (b.dataset.codexTab === codexTab) return;
        codexTab = b.dataset.codexTab;
        forceRender();
      });
    });
  },

  refresh(host) {
    const overall = overallProgress();
    const opct = overall.total > 0 ? (overall.got / overall.total) * 100 : 0;
    setText(host, '[data-codex-overall]', `${overall.got} / ${overall.total}`);
    setWidth(host, '[data-codex-overall-bar]', opct);

    const p = progress(codexTab);
    const pct = p.total > 0 ? (p.got / p.total) * 100 : 0;
    setWidth(host, '[data-codex-bar]', pct);
    setText(host, '[data-codex-clue]', `本栏已收录 ${p.got} / ${p.total}（${Math.round(pct)}%）`);
  },
});

/** 单条图鉴行 */
function codexRow(kind, entry) {
  const got = has(kind, entry.id);
  const meta = kindMeta(kind);

  if (!got) {
    return `
      <div class="list-item locked">
        <div class="li-main">
          <div class="li-name">${esc(UNKNOWN_NAME)} <span class="tag">未收录</span></div>
          <div class="li-desc muted">${esc(UNKNOWN_DESC)}</div>
          <div class="li-desc muted">线索：${esc(clueFor(kind, entry.id))}</div>
        </div>
      </div>`;
  }

  const name = meta.nameOf(entry);
  const desc = meta.descOf(entry);
  const lore = meta.loreOf ? meta.loreOf(entry) : '';
  const summary = summaryFor(kind, entry.id);
  const qTag = entry.quality ? ' ' + qualityTagHTML(entry.quality, qualityLabel(entry.quality)) : '';

  return `
    <div class="list-item">
      <div class="li-main">
        <div class="li-name">${esc(name)}${qTag} <span class="tag tag-jade">已收录</span></div>
        ${summary ? `<div class="li-desc num">${esc(summary)}</div>` : ''}
        <div class="li-desc">${esc(desc)}</div>
        ${lore ? `<div class="li-desc muted">${esc(lore)}</div>` : ''}
      </div>
    </div>`;
}

function qualityLabel(id) {
  return { fan: '凡品', ling: '灵品', xian: '仙品', shen: '神品', sheng: '圣品' }[id] || id;
}

export function renderCodexPanel(host) {
  codexPanel.render(host);
}

export function resetCodexPanel() {
  codexPanel.reset();
  codexTab = 'techniques';
}
