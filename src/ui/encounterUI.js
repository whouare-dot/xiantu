/**
 * 奇遇与探险的 UI 接线。
 *
 * systems/encounter.js 只负责"掷出事件"并 emit 一个总线事件，
 * 由这里接管弹窗与战斗播放。这样系统层完全不依赖 DOM。
 *
 * 流程：奇遇弹窗 → 玩家选选项 → 结算 → （若触发战斗）战报弹窗 → 收尾
 */

import { on } from '../core/bus.js';
import { state } from '../core/state.js';
import {
  presentEncounter, resolveEncounter, pauseEncounters, currentOrder,
} from '../systems/encounter.js';
import { XIEDAO_MODS } from '../systems/stance.js';
import { openModal, closeModal, isModalOpen } from './modal.js';
import { forceRender } from '../core/loop.js';
import { toast } from './toast.js';
import * as svg from '../assets/svg.js';
import { esc } from './dom.js';

let handle = null;
let busy = false;

/** 奇遇/探险触发时的统一入口 */
function onEncounter({ enc, view }) {
  if (!enc) return;
  // 已有弹窗在处理：直接忽略，事件本身已经写进日志了，不要叠加打断
  if (busy || isModalOpen()) return;
  busy = true;
  pauseEncounters(true);
  showEncounterModal(enc, view || presentEncounter(enc));
}

function showEncounterModal(enc, view) {
  const art = artFor(enc.tier);

  // 注意用 c.index（原始下标）而不是遍历序号 i：
  // 选项的显示顺序已被打乱，只有 c.index 能正确指回原始选项。
  // 另外刻意不传 hint —— 让玩家读文字判断，而不是看提示点按钮。
  const choices = view.choices.map((c) => ({
    text: c.text,
    disabled: c.disabled,
    reason: c.reason,
    // 不可逆的重大抉择（如堕入魔道）用更具警示性的样式，并在点击后二次确认
    cls: c.disabled ? '' : (c.major ? 'btn-primary' : tierBtnClass(enc.tier)),
    onClick: () => (c.major ? confirmMajor(enc, c) : choose(enc, c.index)),
  }));

  handle = openModal({
    title: `【${view.title}】`,
    desc: view.desc,
    art,
    choices,
    dismissible: false,
    onClose: () => { /* 结果由 choose() / finish() 收尾 */ },
  });
}

function tierBtnClass(tier) {
  if (tier === 'bad') return 'btn-primary';
  if (tier === 'good') return 'btn-jade';
  if (tier === 'rare') return 'btn-gold';
  return 'btn-gold';
}

function artFor(tier) {
  if (tier === 'rare') return svg.SCENE_BREAKTHROUGH || '';
  if (tier === 'bad') return svg.SCENE_TRIBULATION || '';
  return '';
}

/**
 * 重大抉择的二次确认。
 * 堕入魔道是不可逆的，玩家必须明确知道自己在放弃什么。
 * 代价数字直接从 stance.js 取，不在这里硬编码——否则调整平衡时两处会漂移。
 */
function confirmMajor(enc, choice) {
  if (handle) closeModal(handle);
  const m = XIEDAO_MODS;
  const pct = (v) => Math.round((v - 1) * 100);

  handle = openModal({
    title: '此 路 一 去',
    desc: '这一步踏出，便再无回头路。',
    body: `<div class="modal-desc" style="border-left-color:var(--accent);">
      「${esc(choice.text)}」——此选择不可撤销。<br><br>
      <b>你将失去：</b>天劫难度 +${pct(m.tribulationDiff)}%、坊市物价 +${pct(m.shopPrice)}%、正道宗门永不收你。<br>
      <b>你将得到：</b>修炼速率 +${pct(m.cultSpeed)}%、战斗属性 +${pct(m.combatPower)}%、奇遇收益 +20%。
    </div>`,
    dismissible: false,
    actions: [
      {
        text: '再想想',
        cls: 'btn-gold',
        onClick: () => {
          handle = null;
          showEncounterModal(enc, presentEncounter(enc, currentOrder()));
        },
      },
      { text: '我已决意', cls: 'btn-danger', onClick: () => choose(enc, choice.index) },
    ],
  });
}

function choose(enc, index) {
  let result;
  try {
    result = resolveEncounter(index);
  } catch (e) {
    console.error('[encounterUI] 结算选项失败:', e);
    toast('结算出错，已跳过本次奇遇', 'bad');
    finish();
    return;
  }

  if (!result) { finish(); return; }

  // 触发战斗 → 按玩家的「战报播放」开关决定是否弹窗。
  // 关掉弹窗时什么都不用做：胜负与战利已由系统层写进日志。
  if (result.battle) {
    if (state.meta.battleReport === false) { finish(); return; }
    playBattle(result.battle);
    return;
  }

  finish();
}

/**
 * 播放战报。
 *
 * ⚠ 这里只播**已经结算过**的那一场，绝不能再跑一次战斗。
 * encounter.js 的 applyChoice 在返回前已经调用 autoResolve 完成真实结算
 * （发掉落、发修为、扣丹药、回写气血、判胜负），battle.result 就是那份战报。
 * 早先这里会重跑一次 autoResolve 或 simulateBattle，后果是：
 *   1. 开启重跑 autoResolve → 奖励/扣丹/气血全部结算两遍；
 *   2. 重跑时玩家是上一场打完的残血，几乎必败 → 屏幕上显示"败"，
 *      而真实结算是"胜"，胜负对不上；血量被二次压到 1，deaths 与连败还被记一笔。
 * 所以战报只有一个来源：battle.result。
 */
function playBattle(battleSpec) {
  const report = battleSpec.result;
  if (!report) { finish(); return; }

  const win = !!report.win;
  const lines = (report.rounds || []).slice(0, 22)
    .map((r) => `<div class="log-entry ${r.actor === 'player' ? 'event-good' : 'event-bad'}">${esc(r.text)}</div>`)
    .join('');
  const more = (report.rounds || []).length > 22
    ? `<div class="small muted center mt-1">……（共 ${report.rounds.length} 回合，此处略去后面 ${report.rounds.length - 22} 条）</div>`
    : '';

  const body = `
    <div class="log-scroll" style="max-height:300px;min-height:0;">${lines}${more}</div>
    <div class="center mt-2 ${win ? 'event-good' : 'event-bad'}" style="letter-spacing:2px;font-weight:bold;">
      ${win ? '胜' : '败'}
    </div>`;

  // 关掉奇遇弹窗，换战报
  if (handle) { closeModal(handle); handle = null; }

  handle = openModal({
    title: '战 报',
    art: win ? '' : (svg.SCENE_DEATH || ''),
    body,
    dismissible: false,
    actions: [{ text: '继续', cls: win ? 'btn-jade' : 'btn-gold', onClick: () => finish() }],
    onClose: () => finish(),
  });
}

function finish() {
  if (handle) { closeModal(handle); handle = null; }
  busy = false;
  pauseEncounters(false);
  forceRender();
}

export function initEncounterUI() {
  on('encounter:trigger', onEncounter);
  on('explore:encounter', onEncounter);
}
