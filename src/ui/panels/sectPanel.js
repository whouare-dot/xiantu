/**
 * 宗门面板。
 *
 * 四个子标签：宗门 / 任务 / 宝库 / 建筑，另在「宗门」页内嵌宗门战区。
 *
 * 严格按 src/ui/panel.js 的模式写：
 *   structure() 只放结构性信息（当前子标签、宗门 id、职位、今日任务集合、
 *               建筑等级与是否在建、战报条数）——贡献、倒计时、材料进度、
 *               灵石余额这些每秒/每次操作都可能变的量一律不进结构指纹。
 *   refresh()   每帧只改已有节点的文字、宽度、disabled，不重建 DOM。
 * 这样滚动不会弹回顶部，hover 不会闪。
 */

import { state, realmAt } from '../../core/state.js';
import {
  SECTS, rankOf, vaultTierCost,
} from '../../data/sects.js';
import {
  joinSect, betraySect, canJoin, promote, rankInfo, vaultList, exchange,
  buildingStatus, upgradeSectBuilding, dailyQuests, finishQuest,
  warStatus, resolveWar, dailyQuestIds,
} from '../../systems/sect.js';
import { materialById } from '../../data/materials.js';
import { pillById } from '../../data/pills.js';
import { enemyById } from '../../data/enemies.js';
import { fmt, fmtDuration } from '../../core/format.js';
import { esc } from '../dom.js';
import { toast } from '../toast.js';
import { signature } from '../render.js';
import { forceRender } from '../../core/loop.js';
import { createPanel, setText, setWidth, setDisabled, toggleClass, countdownText } from '../panel.js';
import {
  svg, ICON_REALM, ICON_SWORD, ICON_LAW, ICON_BODY, ICON_PILL,
  ICON_MATERIAL, ICON_CAVE, ICON_LOCK, ICON_ARROW_UP,
} from '../../assets/svg.js';

let sectTab = 'sect';     // sect | quest | vault | building
let betrayArmed = false;  // 叛宗二次确认

const PATH_ICON = { sword: ICON_SWORD, body: ICON_BODY, law: ICON_LAW };
const PATH_NAME = { sword: '剑修', body: '体修', law: '丹道' };
const KIND_LABEL = {
  pill: '丹药', material: '灵材', stones: '灵石', equip: '装备',
  recipe: '丹方图纸', beast_egg: '灵兽蛋', technique: '功法', title: '称号',
};
const QUEST_KIND = { donate_material: '捐材料', donate_pill: '交丹药', trial_battle: '试炼' };

// ==================== 加成 / 消耗文案 ====================

const BONUS_TEXT = {
  atkPct: (v) => `攻击 +${Math.round(v * 100)}%`,
  defPct: (v) => `防御 +${Math.round(v * 100)}%`,
  hpPct: (v) => `气血上限 +${Math.round(v * 100)}%`,
  critAdd: (v) => `暴击 +${Math.round(v * 100)}%`,
  comprehensionAdd: (v) => `悟性 +${Math.round(v)}`,
  alchemyPct: (v) => `炼丹 +${Math.round(v * 100)}%`,
};

function bonusLines(bonus) {
  const out = [];
  for (const [k, v] of Object.entries(bonus || {})) {
    const f = BONUS_TEXT[k];
    if (f && v) out.push(f(v));
  }
  return out;
}

const EFFECT_TEXT = {
  war_power: (v) => `宗门战战力 +${Math.round(v * 100)}%`,
  alchemy: (v) => `炼丹成功率/产量 +${Math.round(v * 100)}%`,
  cultivate: (v) => `功法参悟速度 +${Math.round(v * 100)}%`,
  beast: (v) => `灵兽养成速度 +${Math.round(v * 100)}%`,
  war_defense: (v) => `战败损失减免 ${Math.round(v * 100)}%`,
};

function effectText(effect, level) {
  if (!effect) return '';
  const v = (effect.perLevel || 0) * level;
  const f = EFFECT_TEXT[effect.kind];
  return f ? f(v) : '';
}

function questTargetName(q) {
  if (q.kind === 'donate_material') return materialById(q.target)?.name || q.target;
  if (q.kind === 'donate_pill') return pillById(q.target)?.name || q.target;
  return enemyById(q.target)?.name || q.target;
}

// ==================== 面板 ====================

export const sectPanel = createPanel({
  id: 'sect',

  structure() {
    const s = state.sect || {};
    const joined = !!s.id;
    const tab = joined ? sectTab : 'sect';
    return signature(
      tab,
      s.id || '',
      s.rank || 0,
      betrayArmed ? 1 : 0,
      (s.questsDone || []).join(','),
      dailyQuestIds().join(','),
      Object.entries(s.buildings || {})
        .map(([k, b]) => `${k}:${b?.level || 0}:${b?.upgradeEndsAt ? 1 : 0}`)
        .join(','),
      (s.warLog || []).length,
      s.warSeason || '',
    );
  },

  build(host) {
    const s = state.sect || {};
    const joined = !!s.id;
    const tab = joined ? sectTab : 'sect';

    host.innerHTML = `
      <div class="panel-title">
        <span style="display:inline-flex;align-items:center;gap:6px;">
          ${svg(ICON_REALM, 18)}宗 门
        </span>
        <span class="pt-extra num" data-contrib-head></span>
      </div>
      ${joined ? tabBar(tab) : ''}
      <div data-sect-body></div>
    `;

    const body = host.querySelector('[data-sect-body]');
    if (tab === 'sect') body.innerHTML = joined ? sectView() : joinView();
    else if (tab === 'quest') body.innerHTML = questView();
    else if (tab === 'vault') body.innerHTML = vaultView();
    else body.innerHTML = buildingView();

    bind(host);
  },

  refresh(host) {
    const s = state.sect || {};
    if (!s.id) return;

    // 顶部贡献
    setText(host, '[data-contrib-head]', `贡献 ${fmt(s.contribution || 0)}`);
    setText(host, '[data-contrib-body]', `${fmt(s.contribution || 0)} 贡献`);

    // 职位进度条
    const ri = rankInfo();
    if (ri.next) {
      const curNeed = rankOf(ri.rank).needContribution;
      const span = Math.max(1, ri.next.needContribution - curNeed);
      const pct = ((ri.contribution - curNeed) / span) * 100;
      setText(host, '[data-rank-progress]', `${fmt(ri.contribution)} / ${fmt(ri.next.needContribution)}`);
      setWidth(host, '[data-rank-bar]', pct);
      setText(host, '[data-rank-hint]', ri.canPromote ? '贡献已足，可擢升' : `距【${ri.next.name}】还差 ${fmt(ri.next.remain)} 贡献`);
    } else {
      setText(host, '[data-rank-progress]', '已至宗主之位');
      setWidth(host, '[data-rank-bar]', 100);
      setText(host, '[data-rank-hint]', '宗门上下，唯你独尊');
    }
    const promoteBtn = host.querySelector('[data-promote]');
    if (promoteBtn) setDisabled(host, '[data-promote]', !ri.canPromote);

    // 建筑倒计时
    const now = Date.now();
    for (const el of host.querySelectorAll('[data-countdown]')) {
      const id = el.dataset.countdown;
      const endsAt = state.sect.buildings?.[id]?.upgradeEndsAt;
      if (endsAt) setText(host, el, countdownText((endsAt - now) / 1000));
    }

    // 任务行：进度、按钮
    for (const row of host.querySelectorAll('[data-quest-row]')) {
      const id = row.dataset.questRow;
      const q = dailyQuests().find((x) => x.id === id);
      if (!q) continue;
      setText(row, '[data-quest-progress]', q.kind === 'trial_battle'
        ? (q.done ? '已通过' : '待挑战')
        : `${q.progress} / ${q.needCount}`);
      const btn = row.querySelector('[data-quest]');
      if (btn) {
        const label = q.done ? '已完成' : (q.canFinish ? '完成' : '未达成');
        if (btn.textContent !== label) btn.textContent = label;
        btn.disabled = q.done || !q.canFinish;
        btn.classList.toggle('btn-gold', q.canFinish);
      }
      setText(row, '[data-quest-reason]', q.done ? '' : (q.reason || ''));
      toggleClass(row, '.li-name', 'muted', q.done);
    }

    // 宝库行：可兑换性
    const vmap = new Map(vaultList().map((v) => [v.id, v]));
    for (const row of host.querySelectorAll('[data-vault-row]')) {
      const v = vmap.get(row.dataset.vaultRow);
      if (!v) continue;
      const btn = row.querySelector('[data-vault]');
      if (btn) {
        const label = v.owned ? '已在身' : (v.canExchange ? '兑换' : '贡献不足');
        if (btn.textContent !== label) btn.textContent = label;
        btn.disabled = !v.canExchange;
        btn.classList.toggle('btn-gold', v.canExchange);
      }
      setText(row, '[data-vault-reason]', v.reason || '');
    }

    // 建筑行：消耗与可升级性
    for (const row of host.querySelectorAll('[data-bld-row]')) {
      const st = buildingStatus(row.dataset.bldRow);
      setText(row, '[data-bld]', st.level <= 0 ? '建造' : '升级');
      setDisabled(row, '[data-bld]', !st.canUpgrade);
      toggleClass(row, '[data-bld]', 'btn-jade', st.canUpgrade && st.level <= 0);
      toggleClass(row, '[data-bld]', 'btn-gold', st.canUpgrade && st.level > 0);
      setText(row, '[data-bld-cost]', st.cost != null ? `灵石 ${fmt(st.cost)} · ${fmtDuration(st.seconds)}` : '');
      setText(row, '[data-bld-reason]', st.canUpgrade ? '' : (st.reason || ''));
    }

    // 宗门战倒计时
    const ws = warStatus();
    setText(host, '[data-war-countdown]', countdownText(ws.settleCountdown));
    setText(host, '[data-war-score]', `${fmt(ws.score)}`);
    const warBtn = host.querySelector('[data-war-resolve]');
    if (warBtn) {
      const label = ws.canResolve ? '结算本赛季' : '本赛季已结算';
      if (warBtn.textContent !== label) warBtn.textContent = label;
      warBtn.disabled = !ws.canResolve;
    }
  },
});

// ==================== 子标签 ====================

function tabBar(active) {
  const tabs = [
    ['sect', '宗门'],
    ['quest', '任务'],
    ['vault', '宝库'],
    ['building', '建筑'],
  ];
  return `<div class="row mb-2" style="gap:4px;flex-wrap:wrap;">${tabs.map(([id, name]) =>
    `<button class="btn btn-sm ${active === id ? 'btn-gold' : ''}" data-sect-tab="${id}"
      type="button">${esc(name)}</button>`).join('')}</div>`;
}

// ==================== 未入宗门：三宗对比 ====================

function joinView() {
  const cards = SECTS.map((s) => {
    const cj = canJoin(s.id);
    const bonus = bonusLines(s.bonus).map((t) => `<span class="tag tag-gold">${esc(t)}</span>`).join(' ');
    const icon = PATH_ICON[s.path] || ICON_REALM;
    return `
      <div class="panel mb-2" style="border-color:${esc(s.color)};">
        <div class="li-name" style="color:${esc(s.color)};font-size:1.05em;">
          ${svg(icon, 16)}${esc(s.name)}
          <span class="tag">${esc(PATH_NAME[s.path] || s.path)}</span>
          <span class="tag tag-jade">正道</span>
        </div>
        <div class="small" style="color:${esc(s.color)};">${esc(s.desc_short)}</div>
        <div class="li-desc mt-1">${esc(s.desc)}</div>
        <div class="small muted" style="line-height:1.6;">${esc(s.lore)}</div>
        <div class="mt-1">${bonus}</div>
        <div class="small muted mt-1">专属：${esc(s.special)}</div>
        <div class="row-between mt-2" style="gap:6px;align-items:center;">
          <span class="small ${cj.ok ? 'muted' : 'event-bad'}">${esc(cj.ok ? '' : cj.reason)}</span>
          <button class="btn btn-sm ${cj.ok ? 'btn-jade' : ''}" data-join="${esc(s.id)}"
            type="button" ${cj.ok ? '' : 'disabled'}>拜 入</button>
        </div>
      </div>`;
  }).join('');

  const cd = state.stanceCooldownUntil || 0;
  const cdLine = cd > Date.now()
    ? `<div class="small event-bad center mb-2">立场冷却中，暂不可拜师</div>` : '';

  return `
    <div class="small muted center mb-2">
      筑基期（${esc(realmAt(9).name)}）后可拜入宗门。三宗各承一道，入门前请三思。
    </div>
    ${cdLine}
    ${cards}
    <div class="small muted center">叛宗代价：贡献清零、该宗好感下降、立场冷却 30 分钟。已兑换之物不受影响。</div>
  `;
}

// ==================== 宗门页（已入宗） ====================

function sectView() {
  const s = state.sect;
  const sect = SECTS.find((x) => x.id === s.id);
  const ri = rankInfo();
  const contrib = s.contribution || 0;
  const curNeed = rankOf(ri.rank).needContribution;

  return `
    <div class="panel mb-2" style="border-color:${esc(sect?.color || '#8a6414')};">
      <div class="li-name" style="font-size:1.1em;color:${esc(sect?.color || '')};">
        ${svg(PATH_ICON[sect?.path] || ICON_REALM, 18)}${esc(sect?.name || s.id)}
        <span class="tag">${esc(PATH_NAME[sect?.path] || '')}</span>
      </div>
      <div class="small muted">${esc(sect?.lore || '')}</div>

      <hr class="divider">
      <div class="row-between">
        <span>职位</span>
        <span class="value tag tag-gold">${esc(ri.name)}</span>
      </div>
      <div class="row-between mt-1">
        <span>宗门贡献</span>
        <span class="value num" style="color:var(--gold);font-weight:bold;">${fmt(contrib)}</span>
      </div>
      <div class="bar mt-1"><div class="bar-fill full" data-rank-bar style="width:0%"></div></div>
      <div class="row-between mt-1">
        <span class="small muted" data-rank-hint></span>
        <span class="small num" data-rank-progress></span>
      </div>
      <div class="small muted mt-1">月俸：灵石 ${fmt(ri.salary?.stones || 0)} · 宝库 ${ri.vaultTier} 层 · 建筑位 ${ri.buildingSlots}</div>
      <div class="row mt-2" style="gap:6px;">
        <button class="btn btn-gold btn-sm" data-promote type="button">晋 升</button>
        ${betrayArmed
          ? `<button class="btn btn-danger btn-sm" data-betray type="button">确认叛宗</button>
             <button class="btn btn-sm" data-betray-cancel type="button">再想想</button>`
          : `<button class="btn btn-sm" data-betray type="button">叛 宗</button>`}
      </div>
      ${betrayArmed ? '<div class="small event-bad mt-1">叛宗将散尽贡献、跌落外门，且 30 分钟内无法再拜师。确认？</div>' : ''}
    </div>

    ${warBlock()}
  `;
}

function warBlock() {
  const ws = warStatus();
  const opps = ws.opponents.map((o) =>
    `<span class="tag" style="color:${esc(o.color || '')};">${esc(o.name)} ${fmt(o.power)}</span>`).join(' ');
  const recent = (ws.recent || []).map((r) => `
    <div class="small ${r.win ? 'event-good' : 'event-bad'}">
      ${esc(r.season)} · ${r.win ? '胜' : '败'}于【${esc(r.opponent?.name || '?')}】
      ${r.win ? `+${r.contributionGain} 贡献` : `-${r.contributionLoss} 贡献`}
    </div>`).join('');

  return `
    <div class="panel" style="border-color:var(--gold);">
      <div class="row-between">
        <span>宗门战 · 赛季 ${esc(ws.season)}</span>
        <span class="small num">个人战功 <span data-war-score>0</span></span>
      </div>
      <div class="small muted mt-1">下次结算：<span class="num" data-war-countdown></span></div>
      <div class="small mt-1">我方战力 ${fmt(ws.power)} · 对手 ${opps || '—'}</div>
      <div class="small muted mt-1">胜方得贡献与资源；败方只损部分贡献，境界与已解锁内容分毫不动。</div>
      <div class="row mt-2">
        <button class="btn btn-sm btn-violet" data-war-resolve type="button"></button>
      </div>
      ${recent ? `<hr class="divider"><div class="small muted mb-1">近期战报</div>${recent}` : ''}
    </div>`;
}

// ==================== 任务页 ====================

function questView() {
  const list = dailyQuests();
  const rows = list.map(questRow).join('');
  return `
    <div class="small muted center mb-2">每日轮换 5 条宗门任务，完成后得贡献。跨日重置，当日不可重复领取。</div>
    <div class="list">${rows || '<div class="list-empty">今日无事</div>'}</div>
  `;
}

function questRow(q) {
  const target = questTargetName(q);
  const reqText = q.kind === 'trial_battle'
    ? `讨伐 ${esc(target)}`
    : `${esc(target)} ×${q.need}`;
  return `
    <div class="list-item" data-quest-row="${esc(q.id)}">
      <div class="li-main">
        <div class="li-name">
          ${esc(q.name)}
          <span class="tag">${esc(QUEST_KIND[q.kind] || q.kind)}</span>
          ${q.done ? '<span class="tag tag-jade">已完成</span>' : ''}
        </div>
        <div class="li-desc">${esc(q.desc)}</div>
        <div class="li-desc num">需求：${reqText} · 进度 <span data-quest-progress></span></div>
        <div class="li-desc num" style="color:var(--gold);">奖励：贡献 +${q.contribution}</div>
      </div>
      <div class="li-actions" style="flex-direction:column;align-items:flex-end;gap:2px;">
        <button class="btn btn-sm" data-quest="${esc(q.id)}" type="button"></button>
        <span class="small muted" data-quest-reason></span>
      </div>
    </div>`;
}

// ==================== 宝库页 ====================

function vaultView() {
  const list = vaultList();
  const tiers = [...new Set(list.map((v) => v.tier))].sort((a, b) => a - b);
  const ri = rankInfo();

  const groups = tiers.map((t) => {
    const items = list.filter((v) => v.tier === t);
    const total = vaultTierCost(t);
    return `
      <div class="sub-title mt-2">
        第 ${t} 层 · 换空需 ${total} 贡献
        <span class="tag ${ri.vaultTier >= t ? 'tag-jade' : ''}">${ri.vaultTier >= t ? '已解锁' : '未解锁'}</span>
      </div>
      <div class="list">${items.map(vaultRow).join('')}</div>`;
  }).join('');

  return `
    <div class="row-between mb-2">
      <span class="small muted">贡献是稀缺之物，换空一层远非一日之功。</span>
      <span class="num" style="color:var(--gold);font-weight:bold;" data-contrib-body></span>
    </div>
    ${list.length ? groups : '<div class="list-empty">尚未拜入宗门，宝库不启</div>'}
  `;
}

function vaultRow(v) {
  const icon = v.kind === 'pill' ? ICON_PILL
    : v.kind === 'material' ? ICON_MATERIAL
      : v.kind === 'equip' ? ICON_SWORD
        : v.kind === 'beast_egg' ? ICON_CAVE : ICON_REALM;
  return `
    <div class="list-item" data-vault-row="${esc(v.id)}">
      <div class="li-main">
        <div class="li-name">
          ${svg(icon, 15)}${esc(v.name)}
          <span class="tag">${esc(KIND_LABEL[v.kind] || v.kind)}</span>
          ${v.sect ? '<span class="tag tag-accent">宗门专属</span>' : ''}
          ${v.owned ? '<span class="tag tag-jade">已在身</span>' : ''}
        </div>
        <div class="li-desc">${esc(v.desc || '')}</div>
      </div>
      <div class="li-actions" style="flex-direction:column;align-items:flex-end;gap:2px;">
        <span class="num" style="color:var(--gold);font-weight:bold;">${v.cost} 贡献</span>
        <button class="btn btn-sm" data-vault="${esc(v.id)}" type="button"></button>
        <span class="small muted" data-vault-reason></span>
      </div>
    </div>`;
}

// ==================== 建筑页 ====================

function buildingView() {
  const ri = rankInfo();
  const statuses = buildingStatusList();
  const rows = statuses.map((b) => buildingCard(b, ri.buildingSlots)).join('');
  const built = statuses.filter((b) => b.level > 0).length;

  return `
    <div class="grid-2 mb-2">
      <div class="info-row"><span class="label">建筑位</span>
        <span class="value num">${built} / ${ri.buildingSlots}</span></div>
      <div class="info-row"><span class="label">宗门建筑</span>
        <span class="value num">${statuses.length} 座</span></div>
    </div>
    <div class="small muted mb-2">宗门建筑独立于个人洞府，升级消耗灵石与时间；离线照常推进，归来即成。</div>
    <div class="col-stack">${rows}</div>
  `;
}

function buildingStatusList() {
  return [
    'bld_arena', 'bld_pagoda', 'bld_pavilion', 'bld_beastgarden', 'bld_ward',
  ].map((id) => ({ ...buildingStatus(id), name: bldName(id) }));
}

function bldName(id) {
  return {
    bld_arena: '演武场', bld_pagoda: '丹塔', bld_pavilion: '藏剑阁',
    bld_beastgarden: '灵兽园', bld_ward: '护宗大阵',
  }[id] || id;
}

function buildingCard(b, slots) {
  const locked = b.reqRank > (state.sect.rank || 0);
  const maxed = b.level >= b.maxLevel;
  const nowText = effectText(b.effect, b.level);
  const nextText = b.level < b.maxLevel ? effectText(b.effect, b.level + 1) : null;
  const effectLine = b.level <= 0
    ? `未建造 · 建成后 ${esc(nextText || '')}`
    : maxed
      ? `${esc(nowText)} <span class="tag tag-gold">已满级</span>`
      : `${esc(nowText)} <span class="muted">→</span> <span class="jade">${esc(nextText || '')}</span>`;

  let action;
  if (b.upgrading) {
    action = `<span class="num" style="color:#8a6414;font-weight:bold;" data-countdown="${esc(b.id)}"></span>
      <span class="small muted">修建中</span>`;
  } else if (maxed) {
    action = '<span class="small muted">已圆满</span>';
  } else if (locked) {
    action = `${svg(ICON_LOCK, 14)}<span class="small muted">需 ${esc(rankOf(b.reqRank).name)}</span>`;
  } else {
    action = `<button class="btn btn-sm" data-bld="${esc(b.id)}" type="button"></button>
      <span class="small num" data-bld-cost></span>
      <span class="small muted" data-bld-reason></span>`;
  }

  return `
    <div class="list-item ${locked ? 'locked' : ''}"
      ${!locked && !maxed && !b.upgrading ? `data-bld-row="${esc(b.id)}"` : ''}
      style="align-items:flex-start;">
      <div class="li-main">
        <div class="li-name">
          ${esc(b.name)}
          <span class="tag ${b.level > 0 ? 'tag-jade' : ''}">${b.level} / ${b.maxLevel} 级</span>
        </div>
        <div class="li-desc">${esc(b.desc || '')}</div>
        <div class="li-desc"><span class="num">${effectLine}</span></div>
      </div>
      <div class="li-actions" style="flex-direction:column;align-items:flex-end;gap:2px;">
        ${action}
      </div>
    </div>`;
}

// ==================== 交互绑定 ====================

function bind(host) {
  host.querySelectorAll('[data-sect-tab]').forEach((b) => {
    b.addEventListener('click', () => {
      if (b.dataset.sectTab === sectTab) return;
      sectTab = b.dataset.sectTab;
      betrayArmed = false;
      forceRender();
    });
  });

  host.querySelectorAll('[data-join]').forEach((b) => {
    b.addEventListener('click', () => {
      const r = joinSect(b.dataset.join);
      if (!r.ok) { toast(r.reason || '无法拜入', 'bad'); return; }
      toast(`已拜入【${r.sect.name}】`, 'special');
      sectTab = 'sect';
      forceRender();
    });
  });

  host.querySelector('[data-promote]')?.addEventListener('click', () => {
    const r = promote();
    if (!r.ok) { toast(r.reason || '尚不可晋升', 'bad'); return; }
    toast(`擢升【${r.name}】`, 'reward');
    forceRender();
  });

  host.querySelector('[data-betray]')?.addEventListener('click', () => {
    if (!betrayArmed) { betrayArmed = true; forceRender(); return; }
    const r = betraySect();
    betrayArmed = false;
    if (!r.ok) { toast(r.reason || '无法叛宗', 'bad'); return; }
    toast('已叛出宗门，重为散修', 'bad');
    sectTab = 'sect';
    forceRender();
  });
  host.querySelector('[data-betray-cancel]')?.addEventListener('click', () => {
    betrayArmed = false;
    forceRender();
  });

  host.querySelectorAll('[data-quest]').forEach((b) => {
    b.addEventListener('click', () => {
      const r = finishQuest(b.dataset.quest);
      if (!r.ok) { toast(r.reason || '尚不能完成', 'bad'); return; }
      toast(`任务完成，贡献 +${r.contribution}`, 'good');
      forceRender();
    });
  });

  host.querySelectorAll('[data-vault]').forEach((b) => {
    b.addEventListener('click', () => {
      const r = exchange(b.dataset.vault);
      if (!r.ok) { toast(r.reason || '无法兑换', 'bad'); return; }
      toast(`已兑换 ${r.granted || '宝物'}`, 'reward');
      forceRender();
    });
  });

  host.querySelectorAll('[data-bld]').forEach((b) => {
    b.addEventListener('click', () => {
      const r = upgradeSectBuilding(b.dataset.bld);
      if (!r.ok) { toast(r.reason || '此刻无法动工', 'bad'); return; }
      toast(`宗门动工 · 约 ${fmtDuration(r.seconds)}`, 'special');
      forceRender();
    });
  });

  host.querySelector('[data-war-resolve]')?.addEventListener('click', () => {
    const r = resolveWar();
    if (!r.ok) { toast(r.reason || '无法结算', 'bad'); return; }
    const rep = r.report;
    toast(rep.win ? `宗门战告捷，贡献 +${rep.contributionGain}` : `宗门战失利，损贡献 ${rep.contributionLoss}`,
      rep.win ? 'special' : 'bad');
    forceRender();
  });
}

// ==================== 入口 ====================

export function renderSectPanel(host) {
  sectPanel.render(host);
}

export function resetSectPanel() {
  sectPanel.reset();
  sectTab = 'sect';
  betrayArmed = false;
}
