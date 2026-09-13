/**
 * 道侣面板。
 *
 * 严格走 src/ui/panel.js 的 createPanel 模式：
 *   structure() 只放「结构性信息」——哪些人已结识、哪些剧情已读、谁是当前道侣、
 *                echo 是否已到可触发的世数。**羁绊数值绝不进结构指纹**，
 *                否则面板会每秒重建，滚动位置被弹回、hover 每秒闪。
 *   refresh()   每帧只改已有节点的文字 / 宽度 / disabled。
 *
 * 未结识显示 ？？？ 与结识条件，不剧透姓名、性格与背景。
 * 剧情正文用 openModal 展示；每段按空行分段，留白，不一次性糊一大段。
 */

import { state, realmAt } from '../../core/state.js';
import { COMPANIONS, companionById } from '../../data/companions.js';
import {
  isMet, bondOf, meet, setActive, readStory, echoFor,
  companionsSummary, activeBonusText, BOND_MAX,
} from '../../systems/companion.js';
import { esc } from '../dom.js';
import { toast } from '../toast.js';
import { openModal } from '../modal.js';
import { createPanel, setText, setWidth, setDisabled } from '../panel.js';
import { signature } from '../render.js';
import { forceRender } from '../../core/loop.js';

const VIA_TEXT = { encounter: '奇遇结缘', event: '机缘结识' };

/** 已达成的分档 → 「攻击 +6%」 */
const KIND_TEXT = {
  cultPct: (v) => `修炼 +${Math.round(v * 100)}%`,
  atkPct: (v) => `攻击 +${Math.round(v * 100)}%`,
  defPct: (v) => `防御 +${Math.round(v * 100)}%`,
  hpPct: (v) => `气血上限 +${Math.round(v * 100)}%`,
  comprehensionAdd: (v) => `悟性 +${v}`,
  luckAdd: (v) => `气运 +${v}`,
  daoHeartAdd: (v) => `道心 +${v}`,
};

function tierText(t) {
  return KIND_TEXT[t.kind] ? KIND_TEXT[t.kind](t.value) : `${t.kind} +${t.value}`;
}

function reachedText(c, bond) {
  const parts = (c.bondBonus || []).filter((t) => bond >= t.bond).map(tierText);
  return parts.length ? parts.join(' · ') : '尚未有加成';
}

function nextTier(c, bond) {
  return (c.bondBonus || []).find((t) => bond < t.bond) || null;
}

// ==================== 面板 ====================

const companionPanel = createPanel({
  id: 'companion',

  structure() {
    const s = state.companions || {};
    const gen = state.reincarnation?.count ?? 0;
    const parts = COMPANIONS.map((c) => {
      const met = isMet(c.id);
      const done = (s.stories?.[c.id] || []).join('.');
      const echoVis = met && gen >= (c.echo?.minGen ?? 99);
      const canMeet = !met && state.player.realmIndex >= (c.metAt?.realm ?? 0);
      return [c.id, met ? 1 : 0, done, s.active === c.id ? 1 : 0, echoVis ? 1 : 0, canMeet ? 1 : 0].join(':');
    }).join('|');
    return signature('v1', parts);
  },

  build(host) {
    const sum = companionsSummary();
    const head = sum.active
      ? `<div class="panel mb-2" style="border-color:var(--jade);">
           <div class="li-name">当前道侣 · ${esc(sum.active.name)}
             <span class="tag tag-jade">${esc(sum.active.title)}</span></div>
           <div class="small muted">双修加成：<span data-active-bonus></span></div>
         </div>`
      : `<div class="panel mb-2">
           <div class="li-name">尚 未 立 道 侣</div>
           <div class="small muted">同行之人，需先相识。相识之后，可于此处结为道侣。</div>
         </div>`;

    host.innerHTML = `
      <div class="panel-title">
        <span>道 侣</span>
        <span class="pt-extra num" data-total-bond></span>
      </div>
      <div class="small muted center mb-2">
        转世之后，她不记得你；你记得她。羁绊与旧事，跨世不灭。
      </div>
      ${head}
      <div class="col-stack" data-companion-cards></div>
    `;

    const wrap = host.querySelector('[data-companion-cards]');
    wrap.innerHTML = COMPANIONS.map((c) => (isMet(c.id) ? metCard(c) : unmetCard(c))).join('');
    bind(host);
  },

  refresh(host) {
    const sum = companionsSummary();
    setText(host, '[data-total-bond]', `共 ${sum.metCount} 位 · 羁绊 ${sum.totalBond}`);
    const ab = host.querySelector('[data-active-bonus]');
    if (ab) setText(host, ab, activeBonusText() || '尚无可用的羁绊加成');

    for (const c of COMPANIONS) {
      if (!isMet(c.id)) {
        // 未结识：只更新"可否寻访"的按钮状态（境界变化时）
        const btn = host.querySelector(`[data-meet="${c.id}"]`);
        if (btn) setDisabled(host, btn, state.player.realmIndex < (c.metAt?.realm ?? 0));
        continue;
      }
      const bond = bondOf(c.id);
      setText(host, `[data-bond-text="${c.id}"]`, `${Math.floor(bond)} / ${BOND_MAX}`);
      setWidth(host, `[data-bond-bar="${c.id}"]`, bond);
      setText(host, `[data-bonus-text="${c.id}"]`, reachedText(c, bond));

      const nt = nextTier(c, bond);
      setText(host, `[data-next-tier="${c.id}"]`, nt ? `羁绊 ${nt.bond}：${nt.desc}` : '羁绊已圆满');

      // 立为道侣按钮
      const abtn = host.querySelector(`[data-active="${c.id}"]`);
      if (abtn) {
        const isActive = (state.companions?.active === c.id);
        setDisabled(host, abtn, isActive);
        setText(host, abtn, isActive ? '已是道侣' : '立为道侣');
      }

      // 剧情行：已读 / 可读 / 未达标
      for (const node of c.story || []) {
        refreshStoryRow(host, c, node);
      }
      const echo = c.echo;
      if (echo) refreshEchoRow(host, c);
    }
  },
});

// ==================== 卡片：未结识 ====================

function unmetCard(c) {
  const needRealm = c.metAt?.realm ?? 0;
  const canMeet = state.player.realmIndex >= needRealm;
  return `
    <div class="panel mb-2" data-companion-card="${esc(c.id)}" style="opacity:.9;">
      <div class="li-name">
        ？？？
        <span class="tag">未曾相识</span>
      </div>
      <div class="small muted">结识条件：修行至【${esc(realmAt(needRealm).name)}】之后 · ${esc(VIA_TEXT[c.metAt?.via] || '机缘')}</div>
      <div class="row-between mt-2" style="align-items:center;gap:6px;">
        <span class="small muted">${canMeet ? '机缘已至，可循迹寻访。' : '机缘未到。'}</span>
        <button class="btn btn-sm ${canMeet ? 'btn-jade' : ''}" data-meet="${esc(c.id)}"
          type="button" ${canMeet ? '' : 'disabled'}>寻 访</button>
      </div>
    </div>`;
}

// ==================== 卡片：已结识 ====================

function metCard(c) {
  const isActive = state.companions?.active === c.id;
  const stories = (c.story || []).map((node) => storyRow(c, node)).join('');
  const echo = c.echo;
  const gen = state.reincarnation?.count ?? 0;
  const echoVisible = echo && gen >= (echo.minGen ?? 99);

  return `
    <div class="panel mb-2" data-companion-card="${esc(c.id)}" style="border-color:${isActive ? 'var(--jade)' : ''};">
      <div class="li-name" style="font-size:1.05em;">
        ${esc(c.name)}
        <span class="tag tag-jade">${esc(c.title)}</span>
        ${isActive ? '<span class="tag tag-gold">道侣</span>' : ''}
      </div>
      <div class="small">${esc(c.personality)}</div>
      <div class="li-desc mt-1">${esc(c.desc)}</div>
      <div class="small muted" style="line-height:1.6;">${esc(c.lore)}</div>

      <hr class="divider">
      <div class="row-between">
        <span>羁绊</span>
        <span class="small num" data-bond-text="${esc(c.id)}"></span>
      </div>
      <div class="bar mt-1"><div class="bar-fill full" data-bond-bar="${esc(c.id)}" style="width:0%"></div></div>
      <div class="small muted mt-1" data-next-tier="${esc(c.id)}"></div>
      <div class="small mt-1" style="color:var(--gold);">加成：<span data-bonus-text="${esc(c.id)}"></span></div>

      <div class="row mt-2" style="gap:6px;">
        <button class="btn btn-sm" data-active="${esc(c.id)}" type="button"></button>
      </div>

      <hr class="divider">
      <div class="sub-title">专属剧情</div>
      <div class="list">${stories}</div>
      ${echoVisible ? echoBlock(c) : ''}
      ${echo && !echoVisible
        ? `<div class="small muted mt-1">传闻：唯有历经 ${echo.minGen} 世轮回，方能再见到她。</div>`
        : ''}
    </div>`;
}

function storyRow(c, node) {
  return `
    <div class="list-item" data-story-row="${esc(c.id)}|${esc(node.id)}">
      <div class="li-main">
        <div class="li-name">${esc(node.title)}
          <span class="tag">需羁绊 ${node.bond}</span>
          <span class="tag tag-gold" data-story-tag="${esc(c.id)}|${esc(node.id)}" style="display:none;">可读</span>
        </div>
      </div>
      <div class="li-actions" style="flex-direction:column;align-items:flex-end;gap:2px;">
        <button class="btn btn-sm" data-read="${esc(c.id)}|${esc(node.id)}" type="button">阅</button>
        <span class="small muted" data-story-state="${esc(c.id)}|${esc(node.id)}"></span>
      </div>
    </div>`;
}

function echoBlock(c) {
  return `
    <hr class="divider">
    <div class="sub-title" style="color:var(--violet,#a06cc4);">跨世重逢</div>
    <div class="list">
      <div class="list-item" data-story-row="${esc(c.id)}|echo">
        <div class="li-main">
          <div class="li-name">${esc(c.echo.title)}
            <span class="tag tag-violet">第 ${c.echo.minGen} 世起</span>
            <span class="tag tag-gold" data-story-tag="${esc(c.id)}|echo" style="display:none;">可读</span>
          </div>
          <div class="small muted">她已不记得你，而你记得她。</div>
        </div>
        <div class="li-actions" style="flex-direction:column;align-items:flex-end;gap:2px;">
          <button class="btn btn-sm" data-read="${esc(c.id)}|echo" type="button">阅</button>
          <span class="small muted" data-story-state="${esc(c.id)}|echo"></span>
        </div>
      </div>
    </div>`;
}

// ==================== 刷新剧情行 ====================

function refreshStoryRow(host, c, node) {
  const done = (state.companions?.stories?.[c.id] || []).includes(node.id);
  const bond = bondOf(c.id);
  const unlocked = bond >= node.bond;
  const key = `${c.id}|${node.id}`;
  applyRowState(host, key, done, unlocked, done ? '已读' : (unlocked ? '' : `还差 ${node.bond - bond} 点羁绊`), unlocked && !done);
}

function refreshEchoRow(host, c) {
  const key = `${c.id}|echo`;
  const done = (state.companions?.stories?.[c.id] || []).includes('echo');
  // echoFor 返回 null 时可能只是"已读"，结构指纹会在读完后重建，这里只处理可见行
  const ready = !!echoFor(c.id);
  if (!host.querySelector(`[data-read="${cssEsc(key)}"]`)) return;
  applyRowState(host, key, done, !done, done ? '已读' : '', ready && !done);
}

/** 统一的剧情行状态：按钮文案 / disabled / 可读标签 / 原因 */
function applyRowState(host, key, done, unlocked, reason, enabled) {
  const btn = host.querySelector(`[data-read="${cssEsc(key)}"]`);
  if (btn) {
    setText(host, btn, done ? '已读' : '阅');
    setDisabled(host, btn, !enabled);
    btn.classList.toggle('btn-gold', !!enabled && !done);
  }
  const stateEl = host.querySelector(`[data-story-state="${cssEsc(key)}"]`);
  if (stateEl) setText(host, stateEl, reason || '');
  const tag = host.querySelector(`[data-story-tag="${cssEsc(key)}"]`);
  if (tag) tag.style.display = (unlocked && !done) ? '' : 'none';
}

function cssEsc(v) {
  return String(v).replace(/"/g, '\\"');
}

// ==================== 交互 ====================

function bind(host) {
  host.querySelectorAll('[data-meet]').forEach((b) => {
    b.addEventListener('click', () => {
      const r = meet(b.dataset.meet);
      if (!r.ok) { toast(r.reason || '此刻无缘', 'bad'); return; }
      toast(`你结识了 ${r.companion.name}`, 'special');
      forceRender();
    });
  });

  host.querySelectorAll('[data-active]').forEach((b) => {
    b.addEventListener('click', () => {
      const r = setActive(b.dataset.active);
      if (!r.ok) { toast(r.reason || '尚不可结为道侣', 'bad'); return; }
      if (!r.already) toast('此后长路，有人同行', 'reward');
      forceRender();
    });
  });

  host.querySelectorAll('[data-read]').forEach((b) => {
    b.addEventListener('click', () => {
      const [cid, sid] = String(b.dataset.read).split('|');
      const c = companionById(cid);
      const r = readStory(cid, sid);
      if (!r.ok) { toast(r.reason || '此刻还读不到这段', 'bad'); return; }
      openStory(c, r.node, r.echo);
      forceRender();
    });
  });
}

/** 用弹窗展示剧情正文；按空行分段，留白 */
function openStory(c, node, isEcho) {
  const paras = String(node.text || '').split('\n').filter((p) => p.trim() !== '');
  const body = paras.map((p) => `<p class="story-para">${esc(p)}</p>`).join('');
  openModal({
    title: `${c.name} · ${node.title}`,
    desc: isEcho ? `跨世重逢（第 ${(state.reincarnation?.count ?? 0) + 1} 世）` : c.title,
    body,
    actions: [{ text: '合 卷', cls: 'btn-gold' }],
    wide: false,
  });
}

// ==================== 入口 ====================

export function renderCompanionPanel(host) {
  companionPanel.render(host);
}

export function resetCompanionPanel() {
  companionPanel.reset();
}
