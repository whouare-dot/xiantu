/**
 * 炼器面板。
 *
 * 职责：列出**已悟的**器图，显示装备名与保底品阶、材料需求（够/不够）、成功率、耗时，
 * 每行一个「炼制」按钮（起火后台锻造，可离线推进）。顶部提供自动炼器开关。
 * 器图领悟、成功率、耗时、材料需求全部取自 systems/forging.js，本面板只做展示与转发。
 *
 * ⚠ 参悟器图的入口**只在坊市**（「丹方图纸」一栏，见 systems/shop.js 的 buy('recipe')）。
 * 与炼丹面板同理：这里曾经也有一份「参悟器图」按钮，和坊市是同一件事的两个入口。
 * 现在面板退化成纯展示——没悟过的器图**根本不出现**。
 *
 * ⚠ 与炼丹同理：旧实现把「锻炉剩余秒数」塞进结构指纹，列表每秒重建，
 * 滚动位置与 hover 都会被打断。现按 src/ui/panel.js 拆成 structure / build / refresh。
 */

import { state, materialCount, realmAt } from '../../core/state.js';
import {
  knownForgeRecipes, getForgeRecipe, canForge, startForge,
  forgeSuccessRate, forgeSeconds, setAutoForge, AUTO_FORGE_MIN_LEVEL,
} from '../../systems/forging.js';
import { buildingLevel } from '../../systems/cultivation.js';
import { equipById } from '../../data/equipments.js';
import { materialById } from '../../data/materials.js';
import { qualityOf } from '../../data/qualities.js';
import { fmtDuration, fmtPct } from '../../core/format.js';
import { esc } from '../dom.js';
import { toast } from '../toast.js';
import { signature } from '../render.js';
import { forceRender } from '../../core/loop.js';
import { createPanel, setText, countdownText, setDisabled, toggleClass } from '../panel.js';
import { svg, ICON_FORGE, ICON_SWORD } from '../../assets/svg.js';

/**
 * 更新已有节点的文本：只改文本节点的 nodeValue，不换节点。
 * 原因同炼丹面板：textContent 在值变化时会替换文本节点，MutationObserver 会看到
 * childList 变化；nodeValue 只产生 characterData 变化，DOM 结构保持稳定。
 */
export const forgePanel = createPanel({
  id: 'forge',

  structure() {
    // 列表内容 = 已悟器图，所以指纹取 knownRecipes 本身（不再是全表）
    const knownIds = (state.forging.knownRecipes || []).slice();
    const active = state.forging.active;
    return signature(
      state.player.realmIndex,
      knownIds.join(','),
      state.forging.auto ? 1 : 0,
      active ? 1 : 0,
      buildingLevel('bld_forge'),
    );
  },

  build(host) {
    const forgeRoom = buildingLevel('bld_forge');
    // 按境界门槛排序，id 兜底保证顺序稳定（同门槛下不会因悟图先后而跳动）
    const recipes = knownForgeRecipes()
      .sort((a, b) => (a.minRealm - b.minRealm) || a.id.localeCompare(b.id));

    host.innerHTML = `
      <div class="panel-title">
        <span style="display:inline-flex;align-items:center;gap:6px;">
          ${svg(ICON_FORGE, 18)}炼 器
        </span>
        <span class="pt-extra">炼器室 ${forgeRoom} 级</span>
      </div>

      <div class="row-between mb-1">
        <span class="small">自动炼器</span>
        <button class="btn btn-sm" id="btnAutoForge" type="button"></button>
      </div>
      <div class="small muted mb-2" data-auto-hint></div>

      ${state.forging.active ? activeBlock() : ''}

      <hr class="divider">
      <div class="sub-title">器 图</div>
      ${recipes.length
        ? `<div class="list">${recipes.map(recipeRow).join('')}</div>`
        : emptyBlock()}
    `;

    host.querySelector('#btnAutoForge')?.addEventListener('click', toggleAuto);
    host.querySelectorAll('[data-forge]').forEach((b) => {
      b.addEventListener('click', () => doForge(b.dataset.forge));
    });
  },

  refresh(host) {
    const forgeRoom = buildingLevel('bld_forge');
    const knownCount = (state.forging.knownRecipes || []).length;
    const ready = forgeRoom >= AUTO_FORGE_MIN_LEVEL && knownCount > 0;
    const on = !!state.forging.auto;
    setText(host, '#btnAutoForge', on ? '已开启' : '已关闭');
    toggleClass(host, '#btnAutoForge', 'btn-jade', on);
    setDisabled(host, '#btnAutoForge', !ready);
    setText(host, '[data-auto-hint]', forgeRoom < AUTO_FORGE_MIN_LEVEL
      ? `炼器室需达 ${AUTO_FORGE_MIN_LEVEL} 级方可自动炼器（当前 ${forgeRoom} 级）`
      : (knownCount === 0 ? '尚未悟得任何器图' : '自动取材料充足、品阶最高的器图循环开炉'));

    const active = state.forging.active;
    if (active) {
      const recipe = getForgeRecipe(active.recipeId);
      setText(host, '[data-active-name]', recipe ? equipName(recipe) : active.recipeId);
      setText(host, '[data-countdown]', countdownText((active.endsAt - Date.now()) / 1000));
    }

    refreshRecipeRows(host);
  },
});

/* ------------------------------ 空态 ------------------------------ */

function emptyBlock() {
  return `<div class="list-empty">
    尚未悟得任何器图。<br>
    器图需往坊市的「丹方图纸」一栏参悟，参悟之后才会出现在这里。
  </div>`;
}

/* ------------------------------ 锻炉状态 ------------------------------ */

function activeBlock() {
  return `
    <div class="panel" style="border-color:var(--gold);background:rgba(196,146,42,0.07);">
      <div class="row-between">
        <span class="small" style="color:#8a6414;">锻炉正旺 · <span data-active-name></span></span>
        <span class="num" style="color:#8a6414;font-weight:bold;" data-countdown></span>
      </div>
      <div class="small muted mt-1">器成自入行囊，闭关亦不误炉火</div>
    </div>`;
}

/* ------------------------------ 器图行（只搭骨架） ------------------------------ */

/** 列表标题一律用**装备名**，不用器图名——玩家关心打出来的是什么，不关心它叫什么图 */
function equipName(recipe) {
  return equipById(recipe.equipId)?.name || recipe.equipId;
}

function recipeRow(r) {
  const equip = equipById(r.equipId);
  const minQ = qualityOf(r.minQuality || 'fan');
  const locked = state.player.realmIndex < (r.minRealm ?? 0);
  const realmTag = r.minRealm > 0
    ? `<span class="tag ${locked ? 'tag-accent' : ''}">${esc(realmAt(r.minRealm).name)}</span>`
    : '';
  const materials = (r.materials || []).map((m) =>
    `<span class="tag" data-mat="${esc(m.id)}" data-need="${m.count}"></span>`).join(' ');

  return `
    <div class="list-item" data-recipe="${esc(r.id)}">
      <div class="li-main">
        <div class="li-name">
          ${svg(ICON_SWORD, 15)}${esc(equipName(r))}
          <span class="q quality-${esc(minQ.id)}">${esc(minQ.name)}</span>
          ${realmTag}
          <span class="tag tag-jade" data-made hidden>本世已成</span>
        </div>
        <div class="li-desc" data-mats>${materials}</div>
        <div class="li-desc num">
          成功率 ${fmtPct(forgeSuccessRate(r), 1)} · 耗时 ${fmtDuration(forgeSeconds(r))}
        </div>
        <div class="li-desc" style="color:#8a6414;">
          词条随机 · 有几率越阶而成，品阶愈高词条愈多愈佳
        </div>
      </div>
      <div class="li-actions" style="flex-direction:column;align-items:flex-end;gap:2px;">
        <button class="btn btn-sm" data-forge="${esc(r.id)}" type="button"></button>
        <span class="small muted" data-forge-status></span>
      </div>
    </div>`;
}

/* ------------------------------ 每帧刷数值 ------------------------------ */

function refreshRecipeRows(host) {
  for (const row of host.querySelectorAll('[data-recipe]')) {
    const id = row.dataset.recipe;
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
    // 用 hidden 切换而不是重建 DOM——炼成一件就重建面板会让列表滚回顶部。
    const madeTag = row.querySelector('[data-made]');
    if (madeTag) {
      const made = (state.stats?.kinds?.forged || []).includes(id);
      if (madeTag.hidden === made) madeTag.hidden = !made;
    }
    const chk = canForge(id);
    setText(row, '[data-forge]', '炼制');
    setDisabled(row, '[data-forge]', !chk.ok);
    toggleClass(row, '[data-forge]', 'btn-primary', chk.ok);
    setText(row, '[data-forge-status]', chk.ok ? '' : (chk.reason || ''));
  }
}

/* ------------------------------ 交互 ------------------------------ */

function toggleAuto() {
  const on = !state.forging.auto;
  const r = setAutoForge(on);
  if (!r.ok) { toast(r.reason || '此时无法开启', 'bad'); return; }
  toast(on ? '已开自动炼器' : '已停自动炼器', on ? 'good' : 'special');
  forceRender();
}

function doForge(id) {
  const r = startForge(id);
  if (!r.ok) { toast(r.reason || '无法开炉', 'bad'); return; }
  toast(`开炉 · 约 ${fmtDuration(r.seconds)}`, 'special');
  forceRender();
}

/* ------------------------------ 入口 ------------------------------ */

export function renderForgePanel(host) {
  forgePanel.render(host);
}

export function resetForgePanel() {
  forgePanel.reset();
}
