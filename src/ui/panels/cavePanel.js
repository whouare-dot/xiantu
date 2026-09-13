/**
 * 洞府面板。
 *
 * 职责：展示洞府总览（等级 / 灵田产出 / 已建成数）与六座建筑列表，
 * 建筑行显示图标、等级、效果（当前 → 下一级）、升级消耗与耗时；
 * 升级中的建筑显示倒计时。所有数值一律取自 systems/cave.js，
 * 本面板只负责展示与把点击转发给系统。
 *
 * ⚠ 旧实现把「洞府/建筑升级剩余秒数」和「灵石够不够」都塞进结构指纹，
 * 于是每分钟（甚至每秒）都在全量重建列表——滚动被弹回、hover 被打断。
 * 现按 src/ui/panel.js 拆开：
 *   结构 = 等级、是否正在升级、解锁/满级状态、灵田等级  → 变了才重建
 *   数值 = 倒计时、灵石消耗、可升级性                  → 每帧只改已有节点
 */

import { state, stonesToLow, realmAt } from '../../core/state.js';
import {
  caveSummary, upgradeBuilding, upgradeCave, buildingStatus,
  caveUpgradeCost, caveUpgradeSeconds,
} from '../../systems/cave.js';
import { fmt, fmtDuration, fmtMult } from '../../core/format.js';
import { esc } from '../dom.js';
import { toast } from '../toast.js';
import { signature } from '../render.js';
import { forceRender } from '../../core/loop.js';
import { createPanel, setText, countdownText, setDisabled, toggleClass } from '../panel.js';
import {
  svg, svg48, ICON_CAVE, ICON_LOCK,
  BLD_SPIRIT_GATHER, BLD_HERB_FIELD, BLD_ALCHEMY_ROOM,
  BLD_FORGE_ROOM, BLD_LIBRARY, BLD_WARD,
} from '../../assets/svg.js';

/** 建筑 art 字段 → SVG 常量 */
const BLD_ART = {
  BLD_SPIRIT_GATHER,
  BLD_HERB_FIELD,
  BLD_ALCHEMY_ROOM,
  BLD_FORGE_ROOM,
  BLD_LIBRARY,
  BLD_WARD,
};

/**
 * 更新已有节点的文本：只改文本节点的 nodeValue，不换节点。
 * 倒计时每秒都在变，若用 textContent 会替换文本节点、产生 childList 变化，
 * 让"静置无重建"的判定被文字刷新误伤；nodeValue 只产生 characterData 变化。
 */
export const cavePanel = createPanel({
  id: 'cave',

  structure() {
    const sum = caveSummary();
    // 升级剩余秒数、灵石消耗、canUpgrade 全部剔除；只留"哪些建筑、几级、是否在修"
    return signature(
      sum.level,
      state.player.realmIndex,
      sum.upgrade.upgrading ? 1 : 0,
      sum.herb.level,
      sum.herb.perHour,
      sum.buildings.map((b) => `${b.id}:${b.level}:${b.upgrading ? 1 : 0}`).join(','),
    );
  },

  build(host) {
    const sum = caveSummary();
    const builtCount = sum.buildings.filter((b) => b.level > 0).length;

    host.innerHTML = `
      <div class="panel-title">
        <span style="display:inline-flex;align-items:center;gap:6px;">
          ${svg(ICON_CAVE, 18)}洞 府
        </span>
        <span class="pt-extra">${sum.level} / ${sum.maxLevel} 级</span>
      </div>

      <div class="grid-2 mb-2">
        <div class="info-row"><span class="label">聚灵阵加持</span>
          <span class="value jade num">${fmtMult(sum.cultMult)}</span></div>
        <div class="info-row"><span class="label">已建成</span>
          <span class="value num">${builtCount} / ${sum.buildings.length} 座</span></div>
        <div class="info-row" style="grid-column:1 / -1;">
          <span class="label">灵田产出</span>
          <span class="value num">${sum.herb.level > 0
            ? `约 ${fmt(sum.herb.perHour)} 份/时 · ${esc(herbTierName(sum.herb.tier))}`
            : '未开垦'}</span>
        </div>
      </div>

      ${caveUpgradeBlock(sum)}

      <hr class="divider">
      <div class="sub-title">洞府建筑</div>
      <div class="col-stack">${sum.buildings.map((b) => buildingCard(b, sum.level)).join('')}</div>
    `;

    host.querySelectorAll('[data-bld]').forEach((btn) => {
      btn.addEventListener('click', () => doUpgradeBuilding(btn.dataset.bld));
    });
    host.querySelector('#btnCaveUpgrade')?.addEventListener('click', doUpgradeCave);
  },

  refresh(host) {
    // ---- 倒计时：洞府扩建 + 各建筑修建 ----
    const now = Date.now();
    for (const el of host.querySelectorAll('[data-countdown]')) {
      const key = el.dataset.countdown;
      const endsAt = key === 'cave'
        ? state.cave.upgradeEndsAt
        : state.cave.buildings[key]?.upgradeEndsAt;
      if (endsAt) setText(host, el, countdownText((endsAt - now) / 1000));
    }

    // ---- 洞府扩建按钮的文案 + 可负担性 ----
    if (host.querySelector('#btnCaveUpgrade')) {
      const cost = caveUpgradeCost(state.cave.level);
      const seconds = caveUpgradeSeconds(state.cave.level);
      const afford = cost != null && stonesToLow() >= cost;
      // ⚠ 按钮文案必须在 refresh 里补上：
      // build 只搭了个空 <button></button> 骨架（下方 cost == null 时整块会被替换掉，
      // 满级与否是结构信息），但这里若忘了写文案，按钮就是个没有字的橙色长条。
      setText(host, '#btnCaveUpgrade', `扩建至 ${state.cave.level + 1} 级`);
      setDisabled(host, '#btnCaveUpgrade', !afford);
      setText(host, '[data-cave-reason]', afford
        ? `耗灵石 ${fmt(cost)} · 约 ${fmtDuration(seconds)}`
        : `灵石不足（需 ${fmt(cost)}）`);
      toggleClass(host, '[data-cave-reason]', 'muted', afford);
    }

    // ---- 建筑行：消耗、可升级性 ----
    for (const row of host.querySelectorAll('[data-bld-row]')) {
      const st = buildingStatus(row.dataset.bldRow);
      setText(row, '[data-bld]', st.level <= 0 ? '建造' : '升级');
      setDisabled(row, '[data-bld]', !st.canUpgrade);
      toggleClass(row, '[data-bld]', 'btn-jade', st.canUpgrade && st.level <= 0);
      toggleClass(row, '[data-bld]', 'btn-gold', st.canUpgrade && st.level > 0);
      setText(row, '[data-bld-cost]',
        st.cost != null ? `灵石 ${fmt(st.cost)} · ${fmtDuration(st.seconds)}` : '');
      toggleClass(row, '[data-bld-cost]', 'muted', !st.canUpgrade);
      setText(row, '[data-bld-reason]', st.canUpgrade ? '' : (st.reason || ''));
    }
  },
});

/* ------------------------------ 洞府本体扩建 ------------------------------ */

function caveUpgradeBlock(sum) {
  const u = sum.upgrade;
  if (u.upgrading) {
    // 剩余时间由 refresh 填，节点本身稳定
    return `
      <div class="panel" style="border-color:var(--gold);background:rgba(196,146,42,0.07);">
        <div class="row-between">
          <span class="small" style="color:#8a6414;">洞府扩建中</span>
          <span class="num" style="color:#8a6414;font-weight:bold;" data-countdown="cave"></span>
        </div>
        <div class="small muted mt-1">扩建期间照常推进，闭关归来即成</div>
      </div>`;
  }
  if (u.cost == null) {
    return `<div class="small muted center">洞府已至最高等级，气象自成</div>`;
  }
  // 文案与 disabled 交给 refresh：灵石余额每帧都可能变
  return `
    <button class="btn btn-gold btn-block" id="btnCaveUpgrade" type="button"></button>
    <div class="small center mt-1" data-cave-reason></div>`;
}

/* ------------------------------ 建筑行 ------------------------------ */

function buildingCard(b, caveLevel) {
  const art = BLD_ART[b.art];
  const artHTML = art ? svg48(art, 34) : svg(ICON_CAVE, 28);
  const locked = state.player.realmIndex < (b.unlockRealm ?? 0);
  const needCave = (b.reqCaveLevel ?? 0) > caveLevel;
  const maxed = b.level >= b.maxLevel;

  const effectNow = effectText(b.effect, b.level);
  const effectNext = b.level < b.maxLevel ? effectText(b.effect, b.level + 1) : null;
  const effectLine = b.level <= 0
    ? `未建造 · 建成后 ${esc(effectNext || '')}`
    : maxed
      ? `${esc(effectNow)} <span class="tag tag-gold">已满级</span>`
      : `${esc(effectNow)} <span class="muted">→</span> <span class="jade">${esc(effectNext)}</span>`;

  const actionable = !b.upgrading && !maxed && !locked;
  let actionHTML;
  if (b.upgrading) {
    actionHTML = `<span class="num" style="color:#8a6414;font-weight:bold;"
        data-countdown="${esc(b.id)}"></span>
      <span class="small muted">修建中</span>`;
  } else if (maxed) {
    actionHTML = `<span class="small muted">已圆满</span>`;
  } else if (locked) {
    const r = realmNameOf(b.unlockRealm);
    actionHTML = `${svg(ICON_LOCK, 14)}<span class="small muted">${esc(r)}解锁</span>`;
  } else {
    // 只搭骨架；按钮文案、消耗、可用性由 refresh 按余额填
    actionHTML = `
      <button class="btn btn-sm" data-bld="${esc(b.id)}" type="button"></button>
      <span class="small num" data-bld-cost></span>
      <span class="small muted" data-bld-reason></span>`;
  }

  return `
    <div class="list-item ${locked ? 'locked' : ''}"
      ${actionable ? `data-bld-row="${esc(b.id)}"` : ''} style="align-items:flex-start;">
      <div style="flex-shrink:0;width:36px;display:flex;justify-content:center;padding-top:2px;opacity:${locked ? 0.5 : 1};">
        ${artHTML}
      </div>
      <div class="li-main">
        <div class="li-name">
          ${esc(b.name)}
          <span class="tag ${b.level > 0 ? 'tag-jade' : ''}">${b.level} / ${b.maxLevel} 级</span>
          ${needCave && !locked ? `<span class="tag tag-accent">需洞府 ${b.reqCaveLevel} 级</span>` : ''}
        </div>
        <div class="li-desc">${esc(b.desc || '')}</div>
        <div class="li-desc"><span class="num">${effectLine}</span></div>
      </div>
      <div class="li-actions" style="flex-direction:column;align-items:flex-end;gap:2px;">
        ${actionHTML}
      </div>
    </div>`;
}

/* ------------------------------ 效果文案 ------------------------------ */

function effectText(effect, level) {
  const e = effect || {};
  const v = (e.perLevel || 0) * level;
  switch (e.kind) {
    case 'cult_mult': return `修炼 +${Math.round(v * 100)}%`;
    case 'material_yield':
      return `每 ${Math.round((e.interval || 600) / 60)} 分产 ${Math.round(v)} 份灵材`;
    case 'alchemy_speed': return `炼丹提速 ${Math.round(v * 100)}%`;
    case 'forge_speed': return `炼器提速 ${Math.round(v * 100)}%`;
    case 'comprehension': return `悟性 +${Math.round(v)}`;
    case 'defense': return `战斗减伤 ${Math.round(v * 100)}%`;
    default: return '';
  }
}

function herbTierName(tier) {
  return { 1: '凡品', 2: '灵品', 3: '仙品', 4: '神品', 5: '圣品' }[tier] || '';
}

function realmNameOf(index) {
  return realmAt(index ?? 0).name;
}

/* ------------------------------ 交互 ------------------------------ */

function doUpgradeBuilding(id) {
  const r = upgradeBuilding(id);
  if (!r.ok) { toast(r.reason || '此刻无法修建', 'bad'); return; }
  toast(`开始修建 · 约 ${fmtDuration(r.seconds)}`, 'special');
  forceRender();
}

function doUpgradeCave() {
  const r = upgradeCave();
  if (!r.ok) { toast(r.reason || '此时不宜扩建', 'bad'); return; }
  toast(`洞府扩建中 · 约 ${fmtDuration(r.seconds)}`, 'special');
  forceRender();
}

/* ------------------------------ 入口 ------------------------------ */

export function renderCavePanel(host) {
  cavePanel.render(host);
}

export function resetCavePanel() {
  cavePanel.reset();
}
