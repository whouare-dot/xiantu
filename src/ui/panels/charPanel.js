/**
 * 左栏 · 道者状态。
 * 骨架只建一次，之后只改进度条宽度与文字，避免每秒重建 DOM。
 */

import { state, realm, nextRealm, isMaxRealm } from '../../core/state.js';
import {
  calcMaxHp, calcMaxMp, calcAtk, calcDef, calcSpd, calcCrit,
  calcComprehension, calcDaoHeart, calcSpiritSense, calcLuck, calcCultSpeed,
  calcLifespan,
} from '../../systems/cultivation.js';
import { fmt, fmtStones, fmtPct } from '../../core/format.js';
import { esc } from '../dom.js';

let built = false;

function row(label, id, cls = '') {
  return `<div class="info-row"><span class="label">${label}</span>` +
    `<span class="value ${cls}" id="${id}">-</span></div>`;
}

function build(host) {
  host.innerHTML = `
    <div class="panel-title">道 者<span class="pt-extra" id="cpRoot">-</span></div>
    <div class="center mb-1">
      <div id="cpName" style="font-family:var(--font-display);font-size:1.28em;font-weight:bold;
           color:var(--accent-dark);letter-spacing:3px;">无名散修</div>
      <span class="realm-badge" id="cpRealm">炼气一层</span>
      <span class="tag tag-gold" id="cpTitle" style="display:none;margin-left:5px;"></span>
    </div>
    <div class="small muted center mb-2" id="cpRealmDesc">-</div>

    ${row('寿元', 'cpLife')}
    ${row('气运', 'cpLuck', 'highlight')}
    ${row('灵石', 'cpStones', 'gold')}

    <hr class="divider">
    <div class="small muted row-between"><span>修为</span><span id="cpCultText" class="num">-</span></div>
    <div class="bar"><div class="bar-fill" id="cpCultBar"></div><div class="bar-text" id="cpCultPct"></div></div>
    <div class="small muted row-between"><span>气血</span><span id="cpHpText" class="num">-</span></div>
    <div class="bar"><div class="bar-fill hp" id="cpHpBar"></div><div class="bar-text" id="cpHpPct"></div></div>
    <div class="small muted row-between"><span>灵力</span><span id="cpMpText" class="num">-</span></div>
    <div class="bar"><div class="bar-fill mp" id="cpMpBar"></div><div class="bar-text" id="cpMpPct"></div></div>

    <hr class="divider">
    ${row('攻击', 'cpAtk')}
    ${row('防御', 'cpDef')}
    ${row('身法', 'cpSpd')}
    ${row('暴击', 'cpCrit')}
    <hr class="divider">
    ${row('悟性', 'cpComp', 'jade')}
    ${row('道心', 'cpDao', 'jade')}
    ${row('神识', 'cpSense', 'jade')}
    <hr class="divider">
    ${row('修炼速率', 'cpSpeed', 'highlight')}
    <div class="small muted center mt-1" id="cpEta"></div>
  `;
  built = true;
}

function setBar(barId, pctId, pct, text) {
  const bar = document.getElementById(barId);
  const label = document.getElementById(pctId);
  if (bar) bar.style.width = Math.max(0, Math.min(100, pct)) + '%';
  if (label) label.textContent = text;
}

function val(id, text) {
  const n = document.getElementById(id);
  if (n && n.textContent !== text) n.textContent = text;
}

export function renderCharPanel(host) {
  if (!built || !host.querySelector('#cpName')) build(host);

  const p = state.player;
  const r = realm();
  const nr = nextRealm();
  const maxHp = calcMaxHp();
  const maxMp = calcMaxMp();

  val('cpName', p.name);
  val('cpRealm', r.name);

  // 佩戴中的称号：成就系统里解锁后可佩戴，带小幅加成，这里给个可见的位置
  const titleId = state.achievements?.title;
  const titleEl = document.getElementById('cpTitle');
  if (titleEl) {
    if (titleId) {
      if (titleEl.textContent !== titleId) titleEl.textContent = titleId;
      if (titleEl.style.display === 'none') titleEl.style.display = '';
    } else if (titleEl.style.display !== 'none') {
      titleEl.style.display = 'none';
    }
  }
  val('cpRealmDesc', r.desc);
  val('cpRoot', `${p.spiritRoot?.name ?? '-'} ×${p.spiritRoot?.mult ?? 1}`);
  val('cpLife', fmt(calcLifespan()) + ' 载');

  const luck = calcLuck();
  val('cpLuck', `${luck} ${luck >= 70 ? '★' : luck >= 50 ? '◆' : '○'}`);
  val('cpStones', fmtStones(state.resources.stones));

  // 修为
  const need = r.needCult;
  if (isMaxRealm() || need == null) {
    val('cpCultText', '圆满');
    setBar('cpCultBar', 'cpCultPct', 100, '已飞升');
    document.getElementById('cpCultBar')?.classList.add('full');
    val('cpEta', '功德圆满，再无桎梏');
  } else {
    const pct = (p.cult / need) * 100;
    val('cpCultText', `${fmt(p.cult)} / ${fmt(need)}`);
    const full = p.cult >= need;
    setBar('cpCultBar', 'cpCultPct', pct, full ? '可突破' : fmtPct(pct / 100, 1));
    document.getElementById('cpCultBar')?.classList.toggle('full', full);
    if (full) {
      val('cpEta', '修为已足，可尝试突破');
    } else {
      const speed = calcCultSpeed();
      const eta = speed > 0 ? (need - p.cult) / speed : Infinity;
      val('cpEta', eta === Infinity ? '' : `约 ${fmtDurationShort(eta)} 后圆满`);
    }
  }

  // 气血 / 灵力
  val('cpHpText', `${fmt(p.hp)} / ${fmt(maxHp)}`);
  setBar('cpHpBar', 'cpHpPct', (p.hp / maxHp) * 100, fmtPct(p.hp / maxHp, 0));
  val('cpMpText', `${fmt(p.mp)} / ${fmt(maxMp)}`);
  setBar('cpMpBar', 'cpMpPct', (p.mp / maxMp) * 100, fmtPct(p.mp / maxMp, 0));

  val('cpAtk', fmt(calcAtk()));
  val('cpDef', fmt(calcDef()));
  val('cpSpd', fmt(calcSpd()));
  val('cpCrit', fmtPct(calcCrit(), 1));

  val('cpComp', fmt(calcComprehension()));
  val('cpDao', fmt(calcDaoHeart()));
  val('cpSense', fmt(calcSpiritSense()));

  val('cpSpeed', isMaxRealm() ? '—' : fmt(calcCultSpeed()) + '/息');
}

function fmtDurationShort(sec) {
  if (sec >= 86400) return Math.floor(sec / 86400) + '天';
  if (sec >= 3600) return Math.floor(sec / 3600) + '时' + Math.floor((sec % 3600) / 60) + '分';
  if (sec >= 60) return Math.floor(sec / 60) + '分';
  return Math.ceil(sec) + '秒';
}

export function resetCharPanel() {
  built = false;
}
