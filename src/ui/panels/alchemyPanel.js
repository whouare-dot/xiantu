/**
 * 炼丹面板。
 *
 * 职责：列出**已悟的**丹方，显示丹药名与品阶、材料需求（够/不够）、成功率、耗时，
 * 每行一个「炼制」按钮（起火后台炼制，可离线推进）。顶部提供自动炼丹开关。
 * 材料、成功率、耗时一律由 systems/alchemy.js 计算，本面板只做展示与转发。
 *
 * ⚠ 参悟丹方的入口**只在坊市**（「丹方图纸」一栏，见 systems/shop.js 的 buy('recipe')）。
 * 这里曾经也有一份「参悟丹方」按钮，和坊市是同一件事的两个入口：两边都能花灵石学，
 * 文案与解锁条件各说各话。现在面板退化成纯展示——没悟过的丹方**根本不出现**，
 * 玩家想学就往坊市走，学会之后回到这里炼制。
 *
 * ⚠ 本面板曾把「炉子剩余秒数」放进结构指纹，导致每秒 clear + 重建整个列表：
 * 玩家滚动会弹回顶部，鼠标悬停按钮会每秒闪一下。现在按 src/ui/panel.js 的约定拆开：
 *   结构 = 悟了哪些方、自动开关、炉里有没有活、丹房几级  → 变了才重建
 *   数值 = 倒计时、材料够不够、能不能炼                 → 每帧只改已有节点
 */

import { state, materialCount, realmAt } from '../../core/state.js';
import {
  knownRecipes, canCraft, startCraft, getAlchemyRecipe,
  successRate, craftSeconds, setAutoAlchemy, AUTO_ALCHEMY_MIN_LEVEL,
} from '../../systems/alchemy.js';
import { buildingLevel } from '../../systems/cultivation.js';
import { pillById } from '../../data/pills.js';
import { materialById } from '../../data/materials.js';
import { qualityOf } from '../../data/qualities.js';
import { fmtDuration, fmtPct } from '../../core/format.js';
import { esc } from '../dom.js';
import { toast } from '../toast.js';
import { signature } from '../render.js';
import { forceRender } from '../../core/loop.js';
import { createPanel, setText, countdownText, setDisabled, toggleClass } from '../panel.js';
import { svg, ICON_ALCHEMY, ICON_PILL } from '../../assets/svg.js';

export const alchemyPanel = createPanel({
  id: 'alchemy',

  structure() {
    // 列表内容 = 已悟丹方，所以指纹取 knownRecipes 本身（不再是全表）
    const knownIds = (state.alchemy.knownRecipes || []).slice();
    const active = state.alchemy.active;
    // 只关心「炉里有没有活」而不是「还剩几秒」；炼的是哪张方交给 refresh，避免自动炼丹循环时反复重建
    return signature(
      state.player.realmIndex,
      knownIds.join(','),
      state.alchemy.auto ? 1 : 0,
      active ? 1 : 0,
      buildingLevel('bld_alchemy'),
    );
  },

  build(host) {
    const dataRoom = buildingLevel('bld_alchemy');
    // 按境界门槛排序，id 兜底保证顺序稳定（同门槛下不会因悟方先后而跳动）
    const recipes = knownRecipes()
      .sort((a, b) => (a.minRealm - b.minRealm) || a.id.localeCompare(b.id));

    host.innerHTML = `
      <div class="panel-title">
        <span style="display:inline-flex;align-items:center;gap:6px;">
          ${svg(ICON_ALCHEMY, 18)}炼 丹
        </span>
        <span class="pt-extra">丹房 ${dataRoom} 级</span>
      </div>

      <div class="row-between mb-1">
        <span class="small">自动炼丹</span>
        <button class="btn btn-sm" id="btnAutoAlchemy" type="button"></button>
      </div>
      <div class="small muted mb-2" data-auto-hint></div>

      ${state.alchemy.active ? activeBlock() : ''}

      <hr class="divider">
      <div class="sub-title">丹 方</div>
      ${recipes.length
        ? `<div class="list">${recipes.map(recipeRow).join('')}</div>`
        : emptyBlock()}
    `;

    host.querySelector('#btnAutoAlchemy')?.addEventListener('click', toggleAuto);
    host.querySelectorAll('[data-craft]').forEach((b) => {
      b.addEventListener('click', () => doCraft(b.dataset.craft));
    });
  },

  refresh(host) {
    // ---- 自动炼丹：文案/可点性只改已有按钮 ----
    const dataRoom = buildingLevel('bld_alchemy');
    const knownCount = (state.alchemy.knownRecipes || []).length;
    const ready = dataRoom >= AUTO_ALCHEMY_MIN_LEVEL && knownCount > 0;
    const on = !!state.alchemy.auto;
    setText(host, '#btnAutoAlchemy', on ? '已开启' : '已关闭');
    toggleClass(host, '#btnAutoAlchemy', 'btn-jade', on);
    setDisabled(host, '#btnAutoAlchemy', !ready);
    setText(host, '[data-auto-hint]', dataRoom < AUTO_ALCHEMY_MIN_LEVEL
      ? `丹房需达 ${AUTO_ALCHEMY_MIN_LEVEL} 级方可自动炼丹（当前 ${dataRoom} 级）`
      : (knownCount === 0 ? '尚未悟得任何丹方' : '自动取材料充足、品阶最高的丹方循环起火'));

    // ---- 炉火：名称与剩余时间都是实时值，只改文字 ----
    const active = state.alchemy.active;
    if (active) {
      const recipe = getAlchemyRecipe(active.recipeId);
      setText(host, '[data-active-name]', recipe ? pillName(recipe) : active.recipeId);
      setText(host, '[data-countdown]', countdownText((active.endsAt - Date.now()) / 1000));
    }

    // ---- 丹方行：材料数、可炼性 ----
    refreshRecipeRows(host);
  },
});

/* ------------------------------ 空态 ------------------------------ */

function emptyBlock() {
  return `<div class="list-empty">
    尚未悟得任何丹方。<br>
    丹方需往坊市的「丹方图纸」一栏参悟，参悟之后才会出现在这里。
  </div>`;
}

/* ------------------------------ 炉火状态 ------------------------------ */

// 炉里有没有活属于结构；炼的是哪张方、还剩多久属于数值，都留给 refresh
function activeBlock() {
  return `
    <div class="panel" style="border-color:var(--gold);background:rgba(196,146,42,0.07);">
      <div class="row-between">
        <span class="small" style="color:#8a6414;">炉火正炽 · <span data-active-name></span></span>
        <span class="num" style="color:#8a6414;font-weight:bold;" data-countdown></span>
      </div>
      <div class="small muted mt-1">丹成自取，闭关亦不误火候</div>
    </div>`;
}

/* ------------------------------ 丹方行（只搭骨架） ------------------------------ */

/** 列表标题一律用**丹药名**，不用丹方名——玩家关心炼出来的是什么，不关心它叫什么方 */
function pillName(recipe) {
  return pillById(recipe.pillId)?.name || recipe.pillId;
}

function recipeRow(r) {
  const pill = pillById(r.pillId);
  const q = qualityOf(pill?.quality || 'fan');
  const locked = state.player.realmIndex < (r.minRealm ?? 0);
  const realmTag = r.minRealm > 0
    ? `<span class="tag ${locked ? 'tag-accent' : ''}">${esc(realmAt(r.minRealm).name)}</span>`
    : '';
  const out = (r.output || 1) > 1 ? ` · 每炉得 ${r.output} 枚` : '';
  // 材料标签只留 id/需求数，文案与颜色由 refresh 填
  const materials = (r.materials || []).map((m) =>
    `<span class="tag" data-mat="${esc(m.id)}" data-need="${m.count}"></span>`).join(' ');

  return `
    <div class="list-item" data-recipe="${esc(r.id)}">
      <div class="li-main">
        <div class="li-name">
          ${svg(ICON_PILL, 15)}${esc(pillName(r))}
          <span class="q quality-${esc(q.id)}">${esc(q.name)}</span>
          ${realmTag}
          <span class="tag tag-jade" data-made hidden>本世已成</span>
        </div>
        <div class="li-desc" data-mats>${materials}</div>
        <div class="li-desc num">
          成功率 ${fmtPct(successRate(r), 1)} · 耗时 ${fmtDuration(craftSeconds(r))}${out}
        </div>
      </div>
      <div class="li-actions" style="flex-direction:column;align-items:flex-end;gap:2px;">
        <button class="btn btn-sm" data-craft="${esc(r.id)}" type="button"></button>
        <span class="small muted" data-craft-status></span>
      </div>
    </div>`;
}

/* ------------------------------ 每帧刷数值 ------------------------------ */

function refreshRecipeRows(host) {
  for (const row of host.querySelectorAll('[data-recipe]')) {
    const id = row.dataset.recipe;
    // 材料可能被挂机灵田、离线结算、其它炼制改动，每帧核对一次
    for (const tag of row.querySelectorAll('[data-mat]')) {
      const have = materialCount(tag.dataset.mat);
      const need = parseInt(tag.dataset.need, 10) || 0;
      const name = materialById(tag.dataset.mat)?.name || tag.dataset.mat;
      setText(row, tag, `${name} ${have}/${need}`);
      const ok = have >= need;
      toggleClass(row, tag, 'tag-jade', ok);
      toggleClass(row, tag, 'tag-accent', !ok);
    }
    // V6.0 功课：本世炼成过这一种没有。
    // 用 hidden 切换而不是重建 DOM——炼成一炉就重建面板会让列表滚回顶部。
    const madeTag = row.querySelector('[data-made]');
    if (madeTag) {
      const made = (state.stats?.kinds?.pills || []).includes(id);
      if (madeTag.hidden === made) madeTag.hidden = !made;
    }
    const chk = canCraft(id);
    setText(row, '[data-craft]', '炼制');
    setDisabled(row, '[data-craft]', !chk.ok);
    toggleClass(row, '[data-craft]', 'btn-primary', chk.ok);
    setText(row, '[data-craft-status]', chk.ok ? '' : (chk.reason || ''));
  }
}

/* ------------------------------ 交互 ------------------------------ */

function toggleAuto() {
  const on = !state.alchemy.auto;
  const r = setAutoAlchemy(on);
  if (!r.ok) { toast(r.reason || '此时无法开启', 'bad'); return; }
  toast(on ? '已开自动炼丹' : '已停自动炼丹', on ? 'good' : 'special');
  // 指纹里含 auto 开关，forceRender 后 structure() 自会判断要不要重建
  forceRender();
}

function doCraft(id) {
  const r = startCraft(id);
  if (!r.ok) { toast(r.reason || '无法起火', 'bad'); return; }
  toast(`起火 · 约 ${fmtDuration(r.seconds)}`, 'special');
  forceRender();
}

/* ------------------------------ 入口 ------------------------------ */

export function renderAlchemyPanel(host) {
  alchemyPanel.render(host);
}

export function resetAlchemyPanel() {
  alchemyPanel.reset();
}
