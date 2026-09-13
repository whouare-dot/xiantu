/**
 * 轮回天赋页（V4.0）。
 *
 * 用 createPanel 模式（结构 / 数值分离）：
 *   structure —— 当前支线 + 全树等级快照 → 变了才重建
 *                （升级会换掉行内的等级、消耗、按钮文案，属于结构性变化）
 *   refresh   —— 每帧只改：顶部道基点余额、每行「能否学习」的按钮态与原因
 *                （道基点可能被轮回结算改动，而技能等级没变）
 *
 * ⚠ 绝不允许把"实时余额"之类每秒变化的值塞进 structure。
 *   本页面板本身没有每秒倒计时，但余额会在别处变动，所以余额走 refresh。
 */

import { esc } from '../dom.js';
import { fmtPct } from '../../core/format.js';
import { createPanel, setText, setDisabled, toggleClass } from '../panel.js';
import { signature } from '../render.js';
import { forceRender } from '../../core/loop.js';
import { toast } from '../toast.js';
import { confirmModal } from '../modal.js';
import {
  BRANCHES, BRANCH_ORDER, TALENTS, EFFECT_KIND_META, talentsByBranch,
} from '../../data/talents.js';
import {
  branchPoints, talentLevel, nextCost, canLearn, learn, respec,
  talentSummary, totalSpent, branchMainMaxed,
} from '../../systems/talent.js';

/** 层级的中文说法，纯粹是展示口径 */
const TIER_NAMES = ['入门', '精进', '通玄', '大成'];

/** 当前选中的支线（面板局部 UI 状态，不进存档） */
let activeBranch = 'cultivate';

/** 把一条 effect / malus 渲染成可读文本 */
function effectText(effect, malus = false) {
  if (!effect) return '';
  const meta = EFFECT_KIND_META[effect.kind] || { label: effect.kind, unit: 'flat' };
  const v = effect.perLevel || 0;
  const num = meta.unit === 'pct' ? fmtPct(v, 1) : String(v);
  const sign = malus ? '-' : '+';
  return `${sign}${num}`;
}

/** 单个天赋行 */
function talentRow(def) {
  const lv = talentLevel(def.id);
  const maxed = lv >= def.maxLevel;
  const cost = nextCost(def.id);
  const c = canLearn(def.id);
  const tierName = TIER_NAMES[def.tier] || `第 ${def.tier} 层`;
  const can = c.ok;

  const mainTag = def.main ? '<span class="tag tag-gold">主线</span>' : '';
  const maxTag = maxed ? '<span class="tag tag-jade">圆满</span>' : '';

  // 加成与代价都用同一张 kind 表，代价明确标注，不做隐藏
  const bonusLine = `每重 ${effectText(def.effect)} ${esc(EFFECT_KIND_META[def.effect.kind]?.label || def.effect.kind)}`;
  const malusLine = def.effect.malus
    ? `<span style="color:var(--accent);">　代价：每重 ${effectText(def.effect.malus, true)} ` +
      `${esc(EFFECT_KIND_META[def.effect.malus.kind]?.label || def.effect.malus.kind)}</span>`
    : '';

  const reqLine = def.requires && def.requires.points > 0 && !can && !maxed
    ? `<div class="li-desc small" data-reason="${esc(def.id)}" style="color:var(--accent);">${esc(c.reason)}</div>`
    : `<div class="li-desc small muted" data-reason="${esc(def.id)}"></div>`;

  return `
    <div class="list-item ${maxed ? 'equipped' : (can ? '' : 'locked')}" data-row="${esc(def.id)}">
      <div class="li-main">
        <div class="li-name">
          ${esc(def.name)}
          <span class="tag">${esc(tierName)}</span>
          ${mainTag}${maxTag}
        </div>
        <div class="li-desc">${esc(def.desc)}</div>
        <div class="li-desc num small">${bonusLine}${malusLine}</div>
        <div class="li-desc small muted">等级 <span data-lv="${esc(def.id)}">${lv}</span> / ${def.maxLevel}</div>
        ${reqLine}
      </div>
      <div class="li-actions" style="flex-direction:column;">
        <button class="btn btn-sm ${maxed ? '' : 'btn-gold'}" data-learn="${esc(def.id)}"
          type="button" ${can ? '' : 'disabled'}>
          ${maxed ? '已圆满' : (lv > 0 ? '再进一重' : '点 悟')}
        </button>
        <span class="small muted center num" data-cost="${esc(def.id)}">${
          maxed ? '—' : `耗 ${cost} 道基`
        }</span>
      </div>
    </div>`;
}

export const talentPanel = createPanel({
  id: 'talent',

  structure() {
    // 只有"当前支线"与"等级快照"会影响 DOM 结构。
    // 道基点余额刻意排除在外——它由 refresh 处理。
    const lv = TALENTS.map((t) => t.id + ':' + talentLevel(t.id)).join(',');
    return signature(activeBranch, lv);
  },

  build(host) {
    const sum = talentSummary();
    const branch = BRANCHES[activeBranch] || BRANCHES.cultivate;
    const list = talentsByBranch(activeBranch);
    const invested = branchPoints(activeBranch);
    const mainMaxed = branchMainMaxed(activeBranch);

    const tabs = BRANCH_ORDER.map((bid) => {
      const meta = BRANCHES[bid];
      const pts = branchPoints(bid);
      const on = bid === activeBranch;
      return `<button class="btn btn-sm ${on ? 'btn-gold' : ''}" data-branch="${esc(bid)}"
        type="button" style="${on ? '' : `color:${meta.color};`}">${esc(meta.name)} ${pts}</button>`;
    }).join('');

    const rows = list.map(talentRow).join('');

    host.innerHTML = `
      <div class="panel-title">
        <span>天 赋</span>
        <span class="pt-extra">道基点 <span class="num" data-dao-base>0</span></span>
      </div>

      <div class="small muted mb-2">
        天赋以道基点永久解锁，跨世不灭。三条支线各有一条主线，点满三系主线方能触及真结局。
      </div>

      <div class="info-row mb-1">
        <span class="label">可用道基点</span>
        <span class="value gold num" data-dao-base2>0</span>
      </div>
      <div class="info-row mb-1">
        <span class="label">累世总投入</span>
        <span class="value num" data-total-spent>0</span>
      </div>
      <div class="info-row mb-2">
        <span class="label">夺天造化 · 天命重掷</span>
        <span class="value jade num" data-fate-reroll>0</span>
      </div>

      <div class="row mb-2" style="gap:4px;flex-wrap:wrap;">${tabs}</div>

      <div class="small mb-2" style="color:${branch.color};">
        <b>${esc(branch.name)}</b> · ${esc(branch.detail)}
        <span class="muted">（本系已投入 ${invested} 点${mainMaxed ? ' · 主线已大成' : ''}）</span>
      </div>

      <div class="list">${rows || '<div class="list-empty">此支线暂无天赋</div>'}</div>

      <div class="row mt-2" style="justify-content:flex-end;">
        <button class="btn btn-sm btn-danger" data-respec type="button">洗 点</button>
      </div>
      <div class="small muted mt-1">洗点免费，返还全部已投入道基点；天赋加成即刻清零。</div>
    `;

    // 子标签切换
    host.querySelectorAll('[data-branch]').forEach((b) => {
      b.addEventListener('click', () => {
        if (b.dataset.branch === activeBranch) return;
        activeBranch = b.dataset.branch;
        forceRender();
      });
    });

    // 学习
    host.querySelectorAll('[data-learn]').forEach((b) => {
      b.addEventListener('click', () => doLearn(b.dataset.learn));
    });

    // 洗点（二次确认）
    host.querySelector('[data-respec]')?.addEventListener('click', doRespec);
  },

  refresh(host) {
    const sum = talentSummary();
    setText(host, '[data-dao-base]', sum.daoBase);
    setText(host, '[data-dao-base2]', sum.daoBase);
    setText(host, '[data-total-spent]', sum.totalSpent);
    setText(host, '[data-fate-reroll]', sum.fateReroll);

    // 余额可能被别处改动（如轮回结算），这里只更新按钮态与原因，不重建 DOM
    for (const def of talentsByBranch(activeBranch)) {
      const c = canLearn(def.id);
      const btn = host.querySelector(`[data-learn="${def.id}"]`);
      if (!btn) continue;
      const maxed = talentLevel(def.id) >= def.maxLevel;
      setDisabled(host, `[data-learn="${def.id}"]`, maxed || !c.ok);
      const reason = host.querySelector(`[data-reason="${def.id}"]`);
      if (reason) {
        const showReason = !maxed && !c.ok;
        setText(reason, showReason ? c.reason : '');
      }
      toggleClass(host, `[data-row="${def.id}"]`, 'locked', !maxed && !c.ok);
    }

    const resetBtn = host.querySelector('[data-respec]');
    if (resetBtn) resetBtn.disabled = sum.totalSpent <= 0;
  },
});

// ==================== 交互动作 ====================

function doLearn(id) {
  const r = learn(id);
  if (!r.ok) {
    toast(r.reason || '无法点悟', 'bad');
    return;
  }
  toast(`天赋精进 · ${r.level} 重`, 'special');
  forceRender();
}

async function doRespec() {
  const spent = totalSpent();
  if (spent <= 0) {
    toast('尚未投入任何道基点', 'bad');
    return;
  }
  const ok = await confirmModal(
    '洗 点',
    `将清空全部天赋，返还 ${spent} 道基点。天赋带来的加成会立即消失，此操作不可撤销。确定吗？`,
    { danger: true, okText: '洗尽前尘' },
  );
  if (!ok) return;
  const r = respec();
  toast(`已返还 ${r.refunded} 道基点`, 'reward');
  forceRender();
}

export function renderTalentPanel(host) {
  talentPanel.render(host);
}

export function resetTalentPanel() {
  talentPanel.reset();
  activeBranch = 'cultivate';
}
