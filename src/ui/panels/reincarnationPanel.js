/**
 * 轮回面板。
 *
 * 这个面板的存在意义是**让玩家理解"飞升即强制轮回"不是惩罚**。
 * 如果玩家在毫不知情的情况下被夺走一切，那叫挫败；
 * 如果玩家提前看到"我这一世攒了多少道基、下一世会更强、还差几步能打破循环"，
 * 那叫目标。两者的机制完全一样，体验天差地别。
 *
 * V6.0 起它同时是**本世功课的主场**：第一世按八幕展出主线，
 * 第 2 世起平铺三门抽签功课。
 */

import { state, realm } from '../../core/state.js';
import {
  reincarnationSummary, currentFate, memoryBonus,
} from '../../systems/reincarnation.js';
import { bloodlines } from '../../systems/bloodline.js';
import { dutySummary, rerollDuty } from '../../systems/duty.js';
import { FREE_MODE_NOTE } from '../../data/endingText.js';
import { stanceSummary, redemptionSummary, canRedeem, attemptRedemption } from '../../systems/stance.js';
import { fmt, fmtPct, fmtDuration } from '../../core/format.js';
import { esc } from '../dom.js';
import { createPanel } from '../panel.js';
import { openModal, confirmModal } from '../modal.js';
import { toast } from '../toast.js';
import { forceRender } from '../../core/loop.js';
import { svg, ICON_TRIBULATION, ICON_REALM } from '../../assets/svg.js';

// ==================== 功课的行渲染 ====================

/**
 * 一门功课。
 *
 * ⚠ 这里的 `data-duty-bar` / `data-duty-text` 是 refresh() 的抓手，
 * 进度**绝不能进 structure 指纹**——否则面板每秒重建，
 * 滚动位置与 hover 状态全丢（V2.1 的老 bug，见架构规范 §8.1）。
 */
function dutyRowHTML(d) {
  const blocked = !d.canDo;
  const missing = missingHTML(d);
  return `
    <div class="list-item ${d.done ? 'equipped' : ''}" style="${blocked ? 'opacity:.45;' : ''}">
      <div class="li-main">
        <div class="li-name">
          ${esc(d.name)}
          ${d.name !== d.kindName
            ? `<span class="tag ${d.done ? 'tag-jade' : 'tag-gold'}">${esc(d.kindName)}</span>`
            : ''}
          ${d.done ? '<span class="tag tag-jade">已了</span>' : ''}
          ${blocked ? '<span class="tag tag-accent">此刻不可为</span>' : ''}
        </div>
        <div class="li-desc">${esc(d.desc)}</div>
        <div class="bar" style="margin:5px 0;">
          <div class="bar-fill ${d.done ? 'full' : ''}" data-duty-bar="${esc(d.id)}" style="width:0%"></div>
          <div class="bar-text" data-duty-text="${esc(d.id)}">${d.progress} / ${d.need}</div>
        </div>
        ${blocked
          ? `<div class="li-desc small" style="color:var(--accent)">${esc(d.blockedReason)}</div>`
          : `<div class="li-desc muted small">${esc(d.hint)}</div>`}
        ${missing}
      </div>
      ${d.canReroll
        ? `<div class="li-actions">
             <button class="btn btn-sm" data-duty-reroll="${esc(d.id)}" type="button">换一门</button>
           </div>`
        : ''}
    </div>`;
}

/**
 * "还差什么"。
 *
 * 这是"种类"型功课的必要交代——玩家盯着 `3/6` 却不知道还该去做什么，
 * 是最让人卡住的一类体验。小池子全列，大池子（敌人 26 种）只列前几个。
 */
function missingHTML(d) {
  const m = d.missing || [];
  if (!m.length) return '';
  const head = m.slice(0, 8).map((x) => esc(x.name)).join('、');
  const more = m.length > 8 ? ' …' : '';
  return `<div class="small muted">尚差 ${m.length} 种：${head}${more}</div>`;
}

/** 第一世：八幕主线 + 余课池 */
function fullModeHTML(sum) {
  const head = `
    <div class="small ${sum.satisfied ? 'muted' : ''} mt-1 mb-2">
      必修 <b>${sum.mainDone} / ${sum.mainTotal}</b>　·　余课 <b>${sum.sideDone} / ${sum.sideRequired}</b><br>
      ${sum.satisfied
        ? '本世功课已了，飞升无碍。'
        : '<b style="color:var(--accent)">本世功课未了，则天门不开。</b>'}
    </div>`;

  const acts = sum.acts.map((a) => {
    if (!a.unlocked) {
      return `<div class="sub-title" style="opacity:.5">${esc(a.name)} · 未启封</div>
        <div class="small muted mb-2">修行至第 ${a.minRealm + 1} 重境界后开启。</div>`;
    }
    const done = a.duties.filter((d) => d.done).length;
    return `<div class="sub-title">${esc(a.name)}
        <span class="muted small" style="font-weight:normal">${done}/${a.duties.length}</span></div>
      <div class="small muted mb-1">${esc(a.desc)}</div>
      ${a.duties.map(dutyRowHTML).join('')}`;
  }).join('');

  return `
    ${head}
    ${acts}
    <div class="sub-title">余 课
      <span class="muted small" style="font-weight:normal">${sum.sideDone}/${sum.sideRequired}</span></div>
    <div class="small muted mb-1">以下任选 ${sum.sideRequired} 项完成即可。</div>
    ${sum.side.map(dutyRowHTML).join('')}`;
}

/** 第 2 世起：平铺三门抽签功课 */
function sampledModeHTML(sum) {
  return `
    <div class="small ${sum.satisfied ? 'muted' : ''} mt-1 mb-2">
      本世 ${sum.flat.length} 门功课，全部了结方可飞升。<br>
      ${sum.satisfied
        ? '已了，飞升无碍。'
        : '<b style="color:var(--accent)">天门不开。</b>'}
    </div>
    ${sum.flat.map(dutyRowHTML).join('')}`;
}

export const reincarnationPanel = createPanel({
  id: 'reincarnation',

  structure() {
    const s = reincarnationSummary();
    const sum = dutySummary();
    // 只放结构性字段。progress 每秒都可能变，放进来会让面板每秒重建。
    // done / rerolls / canDo 变了必须重建（标签、按钮、灰显都要跟着变）。
    const dutySig = [...sum.acts.flatMap((a) => a.duties), ...sum.side, ...sum.flat]
      .map((d) => `${d.id}.${d.done ? 1 : 0}.${d.rerolls}.${d.canDo ? 1 : 0}`)
      .join(',');
    return [
      s.gen, s.daoBase, s.clues, s.endingSeen, s.freeMode,
      s.fate?.id || '',
      s.history.length,
      s.ending.items.map((i) => (i.done ? 1 : 0)).join(''),
      canRedeem().ok ? 1 : 0,
      sum.mode, sum.unlockedAct, dutySig,
    ].join('|');
  },

  build(host) {
    const s = reincarnationSummary();
    const fate = s.fate;
    const stance = stanceSummary();
    const redeem = redemptionSummary();
    const lines = Object.values(bloodlines());

    const fateHTML = fate
      ? `<div class="list-item">
          <div class="li-main">
            <div class="li-name">${esc(fate.name)}
              <span class="tag ${fate.good ? 'tag-jade' : 'tag-accent'}">${fate.good ? '吉' : '凶'}</span>
            </div>
            <div class="li-desc">${esc(fate.desc)}</div>
            ${(fate.effects || []).length ? `<div class="li-desc num">${
              fate.effects.map((e) => `${esc(effectLabel(e.kind))} ${e.value > 0 ? '+' : ''}${fmtEffect(e)}`).join(' · ')
            }</div>` : ''}
          </div>
        </div>`
      : '<div class="small muted center">天命未定</div>';

    const historyHTML = s.history.length
      ? s.history.slice().reverse().map((h) => `
          <div class="info-row">
            <span class="label">第 ${h.gen} 世 · ${esc(h.realmName)}</span>
            <span class="value num">道基 +${h.daoGained}　<span class="muted">${esc(h.fateName || '')}</span></span>
          </div>`).join('')
      : '<div class="small muted center">尚无历世记录</div>';

    const endingHTML = s.ending.items.map((it) => `
      <div class="info-row">
        <span class="label">${it.done ? '✓' : '○'} ${esc(it.label)}</span>
        <span class="value small muted">${esc(it.hint)}</span>
      </div>`).join('');

    const sum = dutySummary();
    const dutyHTML = sum.mode === 'full' ? fullModeHTML(sum) : sampledModeHTML(sum);

    const daoParts = s.daoPreview.parts.filter((p) => p.value > 0)
      .map((p) => `<div class="info-row"><span class="label">${esc(p.label)}</span>
        <span class="value num">${p.value}<span class="muted"> / ${p.cap}</span></span></div>`).join('');

    host.innerHTML = `
      <div class="panel-title">
        <span style="display:inline-flex;align-items:center;gap:6px;">${svg(ICON_REALM, 18)}轮 回</span>
        <span class="pt-extra">第 ${s.gen} 世</span>
      </div>

      <div class="center mb-2">
        <div style="font-family:var(--font-display);font-size:1.2em;letter-spacing:4px;
             color:var(--accent-dark);font-weight:bold;">第 ${s.gen} 世</div>
        <div class="small muted mt-1">
          记忆残留 <b style="color:var(--jade)">×${s.memory.toFixed(2)}</b>
          　·　历世 ${s.count} 次
        </div>
      </div>

      <div class="sub-title">本 世 功 课</div>
      ${dutyHTML}

      <div class="sub-title">本 世 天 命</div>
      ${fateHTML}

      <div class="sub-title">道 基 点</div>
      <div class="info-row"><span class="label">可用</span>
        <span class="value highlight num" style="font-size:1.15em;">${s.daoBase}</span></div>
      <div class="small muted mt-1 mb-2">
        道基点是唯一的跨世货币，轮回时不清零。在「天赋」页消耗它点亮永久天赋。
      </div>
      <div class="small muted">若此刻飞升，本世可再结算：</div>
      <div class="small">${daoParts || '<span class="muted">本世尚无建树</span>'}</div>
      <div class="info-row" style="border-top:1px solid var(--border-light);margin-top:4px;padding-top:5px;">
        <span class="label"><b>本世预计可得</b></span>
        <span class="value highlight num"><b>${s.daoPreview.total}</b></span>
      </div>

      ${lines.length ? `
      <div class="sub-title">血 脉 记 忆</div>
      <div class="small muted mb-1">灵兽本体不随轮回带走，但你记得如何养它们。再遇同族时，起点更高。</div>
      <div class="small num">${lines.map((l) => `${esc(l.baseId)} <span class="muted">最高 ${'★'.repeat(l.bestStar)}</span>`).join('　')}</div>
      ` : ''}

      <div class="sub-title">历 世 记 录</div>
      ${historyHTML}

      <div class="sub-title">打 破 循 环</div>
      <div class="small muted mb-2">
        飞升从来不是终点。你走过 ${s.count} 世，渐渐看清了这件事的全貌。
      </div>
      ${endingHTML}
      ${s.endingSeen
        ? `<div class="center mt-2"><span class="tag tag-jade" style="font-size:1em;padding:4px 12px;">
            已看破循环 · 自由模式</span></div>
           <div class="small muted center mt-1">${esc(FREE_MODE_NOTE)}</div>
           <div class="center mt-2">
             <button class="btn btn-sm" id="btnReplayEnding" type="button">重 看 结 局</button>
           </div>`
        : ''}

      ${renderRedemption(stance, redeem)}
    `;

    host.querySelector('#btnRedeem')?.addEventListener('click', doRedeem);
    host.querySelector('#btnReplayEnding')?.addEventListener('click', doReplayEnding);
    host.querySelectorAll('[data-duty-reroll]').forEach((btn) => {
      btn.addEventListener('click', () => doRerollDuty(btn.dataset.dutyReroll));
    });
  },

  /**
   * 只改数值：功课进度每帧都在变，但**绝不能进 structure**——
   * 否则面板每秒重建，滚动位置与 hover 状态全丢（V2.1 的老 bug）。
   *
   * 一次 querySelectorAll 拿全部进度条，再按 id 查数据；
   * 比每门功课各查一次 DOM 快得多（八幕展开后有三十来条）。
   */
  refresh(host) {
    const sum = dutySummary();
    const byId = new Map(
      [...sum.acts.flatMap((a) => a.duties), ...sum.side, ...sum.flat].map((d) => [d.id, d]),
    );
    for (const bar of host.querySelectorAll('[data-duty-bar]')) {
      const d = byId.get(bar.dataset.dutyBar);
      if (!d) continue;
      const pct = `${Math.round(d.ratio * 100)}%`;
      if (bar.style.width !== pct) bar.style.width = pct;
      const txt = bar.parentElement?.querySelector('[data-duty-text]');
      if (!txt) continue;
      const label = `${d.progress} / ${d.need}`;
      if (txt.textContent !== label) txt.textContent = label;
    }
  },
});

function renderRedemption(stance, redeem) {
  if (stance.id !== 'xiedao') return '';
  const ok = redeem.available.ok;
  return `
    <div class="sub-title">渡 心 魔 劫</div>
    <div class="small muted mb-2">
      你身负魔道之身。若想回头，唯有渡一场心魔劫——
      <b>不能以丹药代劫</b>，成败全看你的道心。
    </div>
    <div class="info-row"><span class="label">道心门槛</span>
      <span class="value num">${redeem.need}</span></div>
    <div class="info-row"><span class="label">通过之数</span>
      <span class="value ${redeem.chance >= 0.5 ? 'jade' : 'highlight'} num">${fmtPct(redeem.chance)}</span></div>
    <div class="info-row"><span class="label">失败代价</span>
      <span class="value small" style="color:var(--accent)">修为减半 · 道心 -3 · 一日不可再试</span></div>
    <button class="btn btn-block mt-2 ${ok ? 'btn-violet' : ''}" id="btnRedeem" type="button"
      ${ok ? '' : 'disabled'}>${ok ? '渡心魔劫' : esc(redeem.available.reason)}</button>
  `;
}

/**
 * 重看结局。
 * 演出只在达成那一刻播一次，但玩家很可能想再看——要么当时在挂机没看清，
 * 要么想把某句话记下来。这种内容"看过了就不给看"没有任何好处。
 */
function doReplayEnding() {
  import('../endingScene.js')
    .then((m) => m.playEnding())
    .catch((e) => {
      console.error('[ending] 重看失败', e);
      toast('演出播放失败', 'bad');
    });
}

/** 换一门功课。这是"不允许这一世废了"的逃生通道，所以确认框语气要轻，别吓退玩家 */
async function doRerollDuty(dutyId) {
  const sum = dutySummary();
  const all = [...sum.acts.flatMap((a) => a.duties), ...sum.side, ...sum.flat];
  const d = all.find((x) => x.id === dutyId);
  if (!d) return;
  const ok = await confirmModal(
    '换 一 门 功 课',
    `确定将【${d.name}】换掉吗？本世只有一次机会，换过之后不能再换。`,
    { okText: '换一门' },
  );
  if (!ok) return;
  const r = rerollDuty(dutyId);
  if (!r.ok) { toast(r.reason || '无法改派', 'bad'); return; }
  toast(`本世之业改为「${r.def?.name || ''}」`, 'special');
  forceRender();
}

async function doRedeem() {
  const ok = await confirmModal(
    '渡心魔劫',
    '此劫不能以丹药代劫，成败只看你的道心。失败将损失一半修为，且一日之内不可再试。确定吗？',
    { danger: true, okText: '我已决意' },
  );
  if (!ok) return;
  const r = attemptRedemption();
  if (!r.ok) { toast(r.reason || '此时不宜', 'bad'); return; }
  if (r.success) {
    toast('心魔散尽 · 重归散修', 'special');
    openModal({
      title: '劫 后 余 生',
      desc: '你睁开眼，天光很淡，但很久没有这么干净过了。',
      body: '<div class="small muted">邪道的天劫劣势与物价惩罚已尽去，道心永久 +10。</div>',
      actions: [{ text: '继续修行', cls: 'btn-jade' }],
    });
  } else {
    toast('心魔未散 · 反噬加身', 'bad');
  }
  forceRender();
}

function effectLabel(kind) {
  return {
    cultPct: '修炼', atkPct: '攻击', defPct: '防御', hpPct: '气血',
    critAdd: '暴击', comprehensionAdd: '悟性', daoHeartAdd: '道心',
    luckAdd: '气运', lifespanAdd: '寿元', breakAdd: '突破率',
    tribulationResist: '天劫抗性', yieldPct: '产出', bondRate: '结缘',
  }[kind] || kind;
}

function fmtEffect(e) {
  if (['critAdd', 'breakAdd', 'tribulationResist', 'bondRate'].includes(e.kind)) {
    return fmtPct(e.value);
  }
  return String(e.value);
}

export function renderReincarnationPanel(host) {
  reincarnationPanel.render(host);
}

export function resetReincarnationPanel() {
  reincarnationPanel.reset();
}
