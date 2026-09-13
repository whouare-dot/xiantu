/**
 * 试炼塔面板。
 *
 * 职责：展示当前进度（已破层数 / 历史最高）、下一层守关敌人与预测胜率，
 * 并提供「挑战」按钮。胜率用 simulateBattle 采样 20 次估算。
 *
 * ⚠ 旧实现把 `Math.floor(player.hp/mp)` 放进了结构指纹——气血/灵力每秒自然恢复，
 * 于是整块面板每秒重建，而且每帧都在跑 20 次战斗模拟。现按 src/ui/panel.js 拆开：
 *   结构 = 层数、敌人、玩家战斗属性快照（攻/防/身法/上限/暴击/词条）、丹药、battleEpoch
 *   数值 = 当前气血、胜率条与文案、挑战按钮可用性            → refresh 只改文字
 *
 * 胜率的更新分两路，缺一不可：
 *   1. build（结构变化）时算一次——换层、换敌人、属性变化走这条；
 *   2. refresh 里发现气血/灵力比上次算时变化了足够多，就再算一次。
 * 只做 1 会留下一个玩家可见的 bug：战败掉血后胜率降下来，回血却不回升——
 * 因为回血不改变结构指纹，缓存住的低胜率就一直挂着。2 就是补这个缺口。
 * 成本可控：面板只在塔页激活时渲染（见 src/ui/render.js 的 pane 过滤），
 * 所以「回血期间每秒重算」只落在正看着塔的玩家身上。
 * 预测走固定种子（见 predictWinrate），同一状态下结果可复现，数字不会随机跳动。
 * 胜率口径与实际战斗一致——都带出战灵兽，见 predictWinrate。
 */

import { state } from '../../core/state.js';
import {
  challengeTower, towerEnemyFor, buildPlayerSide, buildEnemySide,
  simulateBattle, isInBattle,
} from '../../systems/combat.js';
import { activeBeastBattleSide } from '../../systems/beast.js';
import { enemyById } from '../../data/enemies.js';
import { materialById } from '../../data/materials.js';
import { fmt, fmtPct } from '../../core/format.js';
import { esc } from '../dom.js';
import { toast } from '../toast.js';
import { openModal } from '../modal.js';
import { signature } from '../render.js';
import { forceRender } from '../../core/loop.js';
import { withSeed } from '../../core/rng.js';
import { createPanel, setText, setWidth, setDisabled } from '../panel.js';
import { svg, ICON_TOWER, ICON_SWORD } from '../../assets/svg.js';

/* 本帧的玩家战斗快照（structure 里取一次，build/refresh 复用） */
let pSnap = null;
/* 本帧的出战灵兽战斗快照；无出战为 null。与 pSnap 同源同寿命 */
let bSnap = null;
/* 缓存的胜率：build 时算一次，refresh 里气血/灵力变化时再算（各 20 次模拟） */
let winRate = 0;
/* 当前结构对应的敌人信息；refresh 用它决定胜率块是否存在 */
let enemyInfo = null;
/* 每场挑战后自增：让结构指纹必变，从而重算胜率（哪怕胜负/连胜都没变） */
let battleEpoch = 0;
/* 上一次算胜率时的气血/灵力：refresh 据此判断回血回蓝后要不要重算 */
let winRateHp = -1;
let winRateMp = -1;

/* 预测用的固定种子基准：同一状态下重复预测必得同一结果，数字不闪 */
const PREDICT_SEED = 0x5eed2026;

/** 更新已有节点的文本：只改 nodeValue，避免 textContent 换节点产生 childList 变化 */
export const towerPanel = createPanel({
  id: 'tower',

  structure() {
    // 取一次玩家 / 灵兽快照。刻意不含当前 hp/mp —— 它们每秒回血，
    // 放进指纹会让整块面板每秒重建；实时性由 refresh 的重算补上（见文件头注释）。
    pSnap = buildPlayerSide();
    bSnap = activeBeastBattleSide();
    const cleared = state.combat.towerFloor || 0;
    return signature(
      cleared + 1,
      state.combat.towerBest || 0,
      state.combat.winStreak || 0,
      state.player.realmIndex,
      isInBattle() ? 1 : 0,
      pSnap.atk, pSnap.def, pSnap.spd, pSnap.maxHp, pSnap.maxMp,
      Math.round(pSnap.crit * 1000), Math.round(pSnap.critDmg * 100),
      (pSnap.affixes || []).map((a) => `${a.kind}:${a.value}`).join(','),
      beastSignature(bSnap),   // 灵兽升级 / 换出战 / 亲密度跨门槛都要触发重算
      JSON.stringify(state.consumables),
      battleEpoch,
    );
  },

  build(host) {
    const player = pSnap || buildPlayerSide();
    const cleared = state.combat.towerFloor || 0;
    const best = state.combat.towerBest || 0;
    const nextFloor = cleared + 1;

    const info = towerEnemyFor(nextFloor);
    const edef = info ? enemyById(info.enemyId) : null;
    const enemy = info
      ? buildEnemySide(info.enemyId, { hpMult: info.hpMult, atkMult: info.atkMult })
      : null;

    enemyInfo = info;
    // 20 次战斗模拟的昂贵估算，结构变化时跑一次
    winRate = info ? predictWinrate(info, player, bSnap) : 0;
    // 记下这个胜率对应的气血/灵力，refresh 靠它判断后续要不要重算
    winRateHp = player.hp;
    winRateMp = player.mp;

    host.innerHTML = `
      <div class="panel-title">
        <span style="display:inline-flex;align-items:center;gap:6px;">
          ${svg(ICON_TOWER, 18)}试 炼 塔
        </span>
        <span class="pt-extra">已破 ${cleared} 层</span>
      </div>

      <div class="grid-2 mb-2">
        <div class="info-row"><span class="label">当前进度</span>
          <span class="value num">第 ${nextFloor} 层</span></div>
        <div class="info-row"><span class="label">历史最高</span>
          <span class="value gold num">${best} 层</span></div>
        <div class="info-row"><span class="label">连胜</span>
          <span class="value num">${state.combat.winStreak || 0}</span></div>
        <div class="info-row"><span class="label">气血</span>
          <span class="value num" data-hp></span></div>
      </div>

      ${enemy ? targetBlock(nextFloor, edef, enemy, player, bSnap) : emptyBlock()}
    `;

    host.querySelector('#btnChallenge')?.addEventListener('click', () => doChallenge(nextFloor));
  },

  refresh(host) {
    const player = pSnap || buildPlayerSide();
    setText(host, '[data-hp]', `${fmt(Math.floor(player.hp))} / ${fmt(player.maxHp)}`);

    if (enemyInfo) {
      // 气血/灵力每秒自然恢复，变了就重算——否则战败掉血算出的低胜率会一直挂着，
      // 回血也不回升。阈值取上限的 0.5%：回血 0.4%/秒，约每秒触发一次；
      // 掉血幅度通常远超阈值，战斗结束后的那一帧就会立刻重算。
      const hpStep = Math.max(player.maxHp * 0.005, 1);
      const mpStep = Math.max(player.maxMp * 0.005, 1);
      if (Math.abs(player.hp - winRateHp) >= hpStep
        || Math.abs(player.mp - winRateMp) >= mpStep) {
        winRate = predictWinrate(enemyInfo, player, bSnap);
        winRateHp = player.hp;
        winRateMp = player.mp;
      }

      const rate = winRate;
      const color = rate >= 0.7 ? 'var(--jade)' : rate >= 0.4 ? 'var(--gold)' : 'var(--accent)';
      setText(host, '[data-winrate-pct]', fmtPct(rate, 1));
      setText(host, '[data-winrate-bar]', fmtPct(rate, 1));
      setWidth(host, '[data-winrate-fill]', Math.round(rate * 100));
      const label = host.querySelector('[data-winrate-pct]');
      if (label && label.style.color !== color) label.style.color = color;
      const fill = host.querySelector('[data-winrate-fill]');
      if (fill && fill.style.background !== color) fill.style.background = color;
    }

    const canFight = !isInBattle();
    setText(host, '#btnChallenge', `挑 战 第 ${(state.combat.towerFloor || 0) + 1} 层`);
    setDisabled(host, '#btnChallenge', !canFight);
    setText(host, '[data-fight-hint]', canFight
      ? '胜则更上一层，败则退走，气血自会缓缓恢复'
      : '战事未歇');
  },
});

/* ------------------------------ 守关敌人 ------------------------------ */

function targetBlock(floor, edef, enemy, player, beast) {
  const skills = (edef?.skills || []).map((s) =>
    `<div class="li-desc"><span class="tag">${esc(s.name)}</span> ${esc(s.desc || '')}</div>`).join('');

  return `
    <div class="panel" style="border-color:var(--border-main);">
      <div class="li-name" style="margin-bottom:3px;">
        ${svg(ICON_SWORD, 15)}${esc(edef?.name || '')}
        <span class="tag tag-accent">第 ${floor} 层</span>
        <span class="tag">战力 ${fmt(edef?.power || 0)}</span>
      </div>
      <div class="li-desc">${esc(edef?.desc || '')}</div>
      ${skills}
      <div class="info-row mt-1"><span class="label">敌方气血</span>
        <span class="value num">${fmt(enemy.maxHp)}</span></div>
      <div class="info-row"><span class="label">敌方攻击 / 防御 / 身法</span>
        <span class="value num">${fmt(enemy.atk)} / ${fmt(enemy.def)} / ${fmt(enemy.spd)}</span></div>
      <div class="info-row"><span class="label">我方攻击 / 防御 / 身法</span>
        <span class="value num">${fmt(player.atk)} / ${fmt(player.def)} / ${fmt(player.spd)}</span></div>
      ${beast ? `<div class="info-row"><span class="label">出战灵兽</span>
        <span class="value">${esc(beast.name)}</span></div>` : ''}
    </div>

    <div class="small muted row-between mt-2"><span>预测胜率（20 次推演）</span>
      <span class="num" style="font-weight:bold;" data-winrate-pct></span></div>
    <div class="bar"><div class="bar-fill" data-winrate-fill></div>
      <div class="bar-text" data-winrate-bar></div></div>

    <button class="btn btn-primary btn-block mt-2" id="btnChallenge" type="button"></button>
    <div class="small muted center mt-1" data-fight-hint></div>`;
}

function emptyBlock() {
  return `<div class="list-empty">此界暂无可用作试炼的对手。<br>再有突破，自有强敌候于塔上。</div>`;
}

/* ------------------------- 胜率估算（结构变化 + 气血变化时调用） ------------------------- */

/**
 * 灵兽的结构指纹。
 * 灵兽没有持久气血——每次都由 beastStats 现算满血（见 beast.js 的 beastBattleSide），
 * 所以这里只需覆盖**属性**：换出战、升级、进化、亲密度跨过技能门槛，都会改变指纹。
 */
function beastSignature(b) {
  if (!b) return '';
  return [
    b.name, b.atk, b.def, b.spd, b.maxHp, Math.round(b.crit * 1000),
    (b.affixes || []).map((a) => `${a.kind}:${a.value}`).join(','),
    (b.skills || []).map((s) => `${s.name}:${s.kind}`).join(','),
  ].join('|');
}

/**
 * 采样 20 次估算胜率。**与实际战斗同口径**：同样带出战灵兽
 * （对照 combat.js 的 autoResolve —— 那里也传 activeBeastBattleSide()）。
 * 少了灵兽，有灵兽的玩家会看到系统性偏低的预测值。
 */
function predictWinrate(info, player, beast) {
  const N = 20;
  let wins = 0;
  for (let i = 0; i < N; i++) {
    const e = buildEnemySide(info.enemyId, { hpMult: info.hpMult, atkMult: info.atkMult });
    if (!e) break;
    // 每次采样换一条固定种子流：20 次之间必须互不相同（否则 20 次模拟完全一样，
    // 胜率只会是 0% 或 100%），但同一状态下重复预测必得同一结果——
    // 数字不闪，只有气血/灵力/灵兽变化才驱动它变化。
    // simulateBattle 只克隆传入的单位，不会污染灵兽本体。
    const won = withSeed((PREDICT_SEED + i * 0x9e3779b9) >>> 0,
      () => simulateBattle(player, e, beast ? { beast } : {}).winner === 'player');
    if (won) wins++;
  }
  return wins / N;
}

/* ------------------------------ 挑战 ------------------------------ */

function doChallenge(floor) {
  if (isInBattle()) { toast('战事未歇，稍候再战', 'bad'); return; }

  const res = challengeTower(floor);
  showReport(res);

  toast(res.win ? `第 ${floor} 层告破` : `惜败于第 ${floor} 层`,
    res.win ? 'good' : 'bad');
  // 结构指纹里含 battleEpoch，自增后下一帧必重建并重算胜率（含战败掉血的情况）
  battleEpoch++;
  forceRender();
}

function showReport(res) {
  const rounds = res.rounds || [];
  const shown = rounds.slice(0, 20);
  const more = rounds.length > shown.length
    ? `<div class="small muted center mt-1">……另有 ${rounds.length - shown.length} 条战报略过</div>`
    : '';

  const body = rounds.length === 0
    ? '<div class="small muted center">未能成战。</div>'
    : `<div class="col-stack">${shown.map((r) =>
      `<div class="li-desc">${esc(r.text)}</div>`).join('')}</div>${more}`;

  const rewards = res.rewards || {};
  const rewardLines = [];
  if (rewards.stones > 0) rewardLines.push(`灵石 ${fmt(rewards.stones)}（下品）`);
  if (rewards.cult > 0) rewardLines.push(`修为 ${fmt(rewards.cult)}`);
  for (const [id, n] of Object.entries(rewards.materials || {})) {
    // 旧实现一律写"灵材 ×n"，玩家看不出拿到的是什么。首通奖励之外，
    // 塔层仍会带出守关敌人的普通掉落，所以这行材料名是有信息量的。
    rewardLines.push(`${materialById(id)?.name || '灵材'} ×${n}`);
  }
  const rewardHTML = rewardLines.length
    ? `<hr class="divider"><div class="small" style="color:var(--jade);">战利：${esc(rewardLines.join('、'))}</div>`
    : '';

  openModal({
    title: `试炼塔 · 第 ${res.floor} 层`,
    desc: res.win
      ? `你破关而上，第 ${res.floor} 层就此告破。`
      : (res.log?.[0]?.text || `你力竭退走，未能破此层。`),
    body: body + rewardHTML,
    actions: [{ text: '知道了', cls: 'btn-gold' }],
    wide: true,
  });
}

/* ------------------------------ 入口 ------------------------------ */

export function renderTowerPanel(host) {
  towerPanel.render(host);
}

export function resetTowerPanel() {
  towerPanel.reset();
  pSnap = null;
  bSnap = null;
  winRate = 0;
  enemyInfo = null;
  battleEpoch = 0;
  winRateHp = -1;
  winRateMp = -1;
}
