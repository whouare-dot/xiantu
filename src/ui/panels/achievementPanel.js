/**
 * 成就页。
 *
 * 用 createPanel 模式（结构 / 数值分离）：
 *   structure —— 当前分类 + 已解锁集合 + 佩戴的称号 → 变了才重建
 *   refresh   —— 每帧只更新顶部进度文字与进度条宽度
 *
 * 隐藏成就（category=secret，全部 hidden）：
 *   未解锁时只显示 "???" 与"尚未揭晓"，不泄露名号与条件。
 */

import { state } from '../../core/state.js';
import {
  ACHIEVEMENTS, ACH_CATEGORIES, achievementsByCategory,
} from '../../data/achievements.js';
import {
  unlocked, isUnlocked, progress, equipTitle, EV_ACH_UNLOCK,
} from '../../systems/achievement.js';
import { esc } from '../dom.js';
import { fmt } from '../../core/format.js';
import { toast } from '../toast.js';
import { createPanel, setText, setWidth } from '../panel.js';
import { signature } from '../render.js';
import { forceRender } from '../../core/loop.js';
import { on } from '../../core/bus.js';

let achCat = 'cultivate';

const ATTR_NAMES = {
  atk: '攻击', def: '防御', hp: '气血', mp: '灵力', spd: '身法',
  crit: '暴击', comprehension: '悟性', daoHeart: '道心', spiritSense: '神识', luck: '气运',
};

/** 奖励的可读文案；无奖励返回空串 */
function rewardText(r) {
  if (!r) return '';
  if (r.kind === 'attr') return `${ATTR_NAMES[r.attr] || r.attr} +${r.value}`;
  if (r.kind === 'stones') return `灵石 +${fmt(r.amount)}`;
  if (r.kind === 'title') {
    const b = r.attr ? `（${ATTR_NAMES[r.attr] || r.attr} +${r.value}）` : '';
    return `称号【${r.title}】${b}`;
  }
  return '';
}

export const achievementPanel = createPanel({
  id: 'achievement',

  structure() {
    // 解锁集合与佩戴称号一变即重建；分类切换也重建
    return signature(achCat, unlocked().join(','), state.achievements?.title || '');
  },

  build(host) {
    const got = new Set(unlocked());
    const list = achievementsByCategory(achCat);

    const tabs = ACH_CATEGORIES.map((c) => {
      const all = achievementsByCategory(c.id);
      const n = all.filter((a) => got.has(a.id)).length;
      return `<button class="btn btn-sm ${achCat === c.id ? 'btn-gold' : ''}"
        data-ach-cat="${c.id}" type="button">${esc(c.name)} ${n}/${all.length}</button>`;
    }).join('');

    const rows = list.map((a) => achRow(a, got.has(a.id), state.achievements?.title === a.id)).join('');
    const catMeta = ACH_CATEGORIES.find((c) => c.id === achCat);

    host.innerHTML = `
      <div class="panel-title">
        <span>成 就</span>
        <span class="pt-extra num" data-ach-progress></span>
      </div>
      <div class="bar mb-2"><div class="bar-fill full" data-ach-bar style="width:0%"></div></div>
      <div class="row mb-2" style="gap:4px;flex-wrap:wrap;">${tabs}</div>
      <div class="small muted mb-2">${esc(catMeta?.desc || '')}</div>
      <div class="list">${rows || '<div class="list-empty">此分类暂无成就</div>'}</div>
    `;

    host.querySelectorAll('[data-ach-cat]').forEach((b) => {
      b.addEventListener('click', () => {
        if (b.dataset.achCat === achCat) return;
        achCat = b.dataset.achCat;
        forceRender();
      });
    });
    host.querySelectorAll('[data-title]').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.dataset.title;
        const r = state.achievements?.title === id ? equipTitle(null) : equipTitle(id);
        if (!r.ok) toast(r.reason || '无法佩戴', 'bad');
        else toast(r.title ? `已佩戴称号【${r.title}】` : '已摘下称号', 'good');
        forceRender();
      });
    });
  },

  refresh(host) {
    const p = progress();
    const pct = p.total > 0 ? (p.unlocked / p.total) * 100 : 0;
    setText(host, '[data-ach-progress]', `${p.unlocked} / ${p.total}`);
    setWidth(host, '[data-ach-bar]', pct);
  },
});

/** 单条成就行 */
function achRow(a, isGot, isEquipped) {
  const hiddenLocked = !!a.hidden && !isGot;
  const name = hiddenLocked ? '???' : a.name;
  const desc = hiddenLocked ? '尚未揭晓' : a.desc;

  const status = isGot
    ? '<span class="tag tag-jade">已达成</span>'
    : '<span class="tag">未达成</span>';
  const rt = rewardText(a.reward);
  const rewardLine = rt && !hiddenLocked
    ? `<div class="li-desc num" style="color:var(--gold);">奖励：${esc(rt)}</div>`
    : '';

  // 称号类成就：解锁后可佩戴
  let action = '';
  if (isGot && a.reward?.kind === 'title') {
    action = `<button class="btn btn-sm ${isEquipped ? 'btn-danger' : 'btn-jade'}"
      data-title="${esc(a.id)}" type="button">${isEquipped ? '摘下' : '佩戴'}</button>`;
  }

  return `
    <div class="list-item ${isGot ? '' : 'locked'}">
      <div class="li-main">
        <div class="li-name">${esc(name)} ${status}</div>
        <div class="li-desc ${hiddenLocked ? 'muted' : ''}">${esc(desc)}</div>
        ${rewardLine}
      </div>
      <div class="li-actions">${action}</div>
    </div>`;
}

/** 解锁播报：订阅成就系统的事件（飘字 + 高亮日志由 achievement.js 负责） */
on(EV_ACH_UNLOCK, (ach) => {
  if (!ach) return;
  const rt = rewardText(ach.reward);
  toast(`成就：${ach.name}${rt ? '（' + rt + '）' : ''}`, 'reward');
});

export function renderAchievementPanel(host) {
  achievementPanel.render(host);
}

export function resetAchievementPanel() {
  achievementPanel.reset();
  achCat = 'cultivate';
}
