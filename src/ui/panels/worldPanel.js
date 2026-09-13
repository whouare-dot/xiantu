/**
 * 天象页（V4.0「轮回」§5.6）。
 *
 * createPanel 模式（结构 / 数值分离）：
 *   structure —— 当前天象 id + 已亲历集合 + 轮换记录 id 序列 → 变了才重建
 *   refresh   —— 只更新倒计时文字与进度条宽度（**倒计时绝不进结构指纹**）
 *
 * 页面组成：
 *   当前天象卡（名称 / 描述 / 小传 / 剩余时间 / 进度）
 *   加成明细（正面绿色、负面红色，补偿单独标注）
 *   下次轮换（绝对时间 + 倒计时）
 *   历史轮换记录（纯推算，刷新后依然稳定）
 *   全部天象图鉴（已亲历的高亮）
 */

import { esc } from '../dom.js';
import { WORLD_EVENTS, EVENT_KINDS } from '../../data/worldEvents.js';
import {
  currentEvent, nextEventAt, timeLeft, eventProgress,
  eventLog, currentEventDetail, seenIds,
} from '../../systems/worldEvent.js';
import { createPanel, setText, setWidth, countdownText } from '../panel.js';
import { signature } from '../render.js';
import { fmtTime } from '../../core/format.js';

/** 这些通道数值为正也代表"更难"，展示时应归为负面 */
const BAD_POSITIVE = new Set(['tribulationDiff', 'enemyPower']);

/** 通道 -> 展示名与格式 */
const EFFECT_LABELS = {
  cultPct: { name: '修炼速率', pct: true },
  warContribution: { name: '宗门贡献', pct: false },
  beastTameRate: { name: '灵兽捕捉', pct: true },
  dropRate: { name: '掉落率', pct: true },
  tribulationDiff: { name: '天劫难度', pct: true },
  breakReward: { name: '突破奖励', pct: true },
  enemyPower: { name: '敌人强度', pct: true },
  breakChanceAdd: { name: '突破成功率', pct: true },
  spiritSenseAdd: { name: '神识', pct: false },
  encounterGoodBias: { name: '善缘奇遇', pct: true },
  stonesGain: { name: '灵石产出', pct: true },
  daoBaseGainMult: { name: '道基点获取', pct: true },
};

function isBad(e) {
  return (e.value || 0) < 0 || BAD_POSITIVE.has(e.kind);
}

function effectText(e) {
  const meta = EFFECT_LABELS[e.kind] || { name: e.kind, pct: false };
  const v = e.value || 0;
  if (meta.pct) {
    const pct = Math.round(Math.abs(v) * 100);
    return `${meta.name} ${v < 0 ? '-' : '+'}${pct}%`;
  }
  return `${meta.name} ${v > 0 ? '+' : ''}${v}`;
}

export const worldPanel = createPanel({
  id: 'world',

  structure() {
    const cur = currentEvent();
    const seen = seenIds().sort().join(',');
    const hist = eventLog(8).map((h) => h.id).join(',');
    return signature(cur?.id || 'none', seen, hist);
  },

  build(host) {
    const { event: cur, lines } = currentEventDetail();
    if (!cur) {
      host.innerHTML = '<div class="panel-title"><span>天 象</span></div><div class="list-empty">天机晦暗，暂不可测</div>';
      return;
    }

    const seen = new Set(seenIds());
    const kindName = EVENT_KINDS[cur.kind] || cur.kind;
    const bonusRows = lines.map((l) => {
      const bad = isBad(l);
      const comp = l.main ? '' : '<span class="tag tag-gold">补偿</span>';
      return `<div class="li-desc num" style="color:${bad ? 'var(--accent)' : 'var(--jade)'};">
        ${bad ? '▼' : '▲'} ${esc(effectText(l))} ${comp}
      </div>`;
    }).join('');

    const history = eventLog(8).map((h) => `
      <div class="list-item ${h.active ? '' : 'locked'}">
        <div class="li-main">
          <div class="li-name">${esc(h.name)}
            ${h.active ? '<span class="tag tag-jade">进行中</span>' : ''}
          </div>
          <div class="li-desc muted num">${esc(fmtTime(h.at))} ~ ${esc(fmtTime(h.end))}</div>
        </div>
      </div>`).join('');

    const all = WORLD_EVENTS.map((e) => {
      const got = seen.has(e.id);
      const isNow = e.id === cur.id;
      return `
        <div class="list-item ${got || isNow ? '' : 'locked'}">
          <div class="li-main">
            <div class="li-name" style="color:${got || isNow ? e.color : ''};">
              ${esc(e.name)}
              ${isNow ? '<span class="tag tag-gold">正当时</span>' : (got ? '<span class="tag tag-jade">已亲历</span>' : '<span class="tag">未亲历</span>')}
            </div>
            <div class="li-desc">${esc(e.desc)}</div>
            <div class="li-desc muted">${esc(e.lore)}</div>
          </div>
        </div>`;
    }).join('');

    host.innerHTML = `
      <div class="panel-title">
        <span>天 象</span>
        <span class="pt-extra">${esc(kindName)}</span>
      </div>

      <div class="list-item" style="border-left:3px solid ${esc(cur.color)};">
        <div class="li-main">
          <div class="li-name" style="color:${esc(cur.color)};">${esc(cur.name)}</div>
          <div class="li-desc">${esc(cur.desc)}</div>
          <div class="li-desc muted">${esc(cur.lore)}</div>
          <div class="li-desc num">剩余 <span data-we-left>--</span> · 下次轮换 <span data-we-next>--</span>（<span data-we-next-at>--</span>）</div>
        </div>
      </div>
      <div class="bar mb-2"><div class="bar-fill full" data-we-bar style="width:0%"></div></div>

      <div class="panel-title" style="font-size:1em;"><span>加成明细</span></div>
      <div class="mb-2">${bonusRows || '<div class="small muted">此天象无直接加成</div>'}</div>

      <div class="panel-title" style="font-size:1em;"><span>最近轮换</span></div>
      <div class="list mb-2">${history}</div>

      <div class="panel-title" style="font-size:1em;"><span>天象图鉴</span></div>
      <div class="list">${all}</div>
    `;
  },

  refresh(host) {
    setText(host, '[data-we-left]', countdownText(timeLeft()));
    setText(host, '[data-we-next]', countdownText(timeLeft()));
    setText(host, '[data-we-next-at]', fmtTime(nextEventAt()));
    setWidth(host, '[data-we-bar]', eventProgress() * 100);
  },
});

export function renderWorldPanel(host) {
  worldPanel.render(host);
}

export function resetWorldPanel() {
  worldPanel.reset();
}
