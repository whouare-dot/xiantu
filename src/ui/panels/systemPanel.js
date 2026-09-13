/**
 * 右栏底部 · 自动化开关与存档。
 * 挂机游戏的核心体验是"离线也在变强"，所以自动化开关要显眼、状态要一眼可读。
 */

import { state, isMaxRealm } from '../../core/state.js';
import { setAutoBreakthrough, calcBreakChance, inTribulation } from '../../systems/breakthrough.js';
import { fmtPct } from '../../core/format.js';
import { esc } from '../dom.js';
import { toast } from '../toast.js';
import { openSettingsModal } from '../settings.js';

let built = false;

function build(host) {
  host.innerHTML = `
    <div class="panel-title">道 途 自 动</div>
    <div class="row-between mb-1">
      <span class="small">自动突破</span>
      <button class="btn btn-sm" id="btnAutoBreak" type="button">未开启</button>
    </div>
    <div class="small muted mb-2" id="autoBreakHint"></div>
    <div class="row-between mb-1">
      <span class="small">战报播放</span>
      <button class="btn btn-sm" id="btnBattleReport" type="button">已开启</button>
    </div>
    <div class="small muted mb-2" id="battleReportHint">战斗后弹窗逐条播放战报</div>
    <hr class="divider">
    <button class="btn btn-sm btn-block" id="btnSaveNow" type="button">手动存档</button>
    <button class="btn btn-sm btn-block" id="btnOpenSettings" type="button">设置 · 存档管理</button>
    <div class="small muted center mt-1" id="saveHint">自动存档：每 30 秒</div>
  `;

  document.getElementById('btnAutoBreak').addEventListener('click', () => {
    if (isMaxRealm()) { toast('已至巅峰，无需突破', 'bad'); return; }
    if (!state.meta.autoBreakthrough && calcBreakChance() <= 0.05) {
      toast('成功率过低，先备好丹药再开', 'bad');
      return;
    }
    setAutoBreakthrough(!state.meta.autoBreakthrough);
  });

  document.getElementById('btnBattleReport').addEventListener('click', () => {
    state.meta.battleReport = state.meta.battleReport === false;
  });

  document.getElementById('btnSaveNow').addEventListener('click', () => {
    import('../../core/save.js').then((m) => {
      const ok = m.save();
      toast(ok ? '已存档' : '存档失败', ok ? 'good' : 'bad');
    });
  });

  document.getElementById('btnOpenSettings').addEventListener('click', () => openSettingsModal());

  built = true;
}

export function renderSystemPanel(host) {
  if (!built || !host.querySelector('#btnAutoBreak')) build(host);

  // ---- 自动突破 ----
  const btn = document.getElementById('btnAutoBreak');
  const hint = document.getElementById('autoBreakHint');
  if (!btn || !hint) return;

  if (isMaxRealm()) {
    btn.textContent = '已圆满';
    btn.disabled = true;
    btn.className = 'btn btn-sm';
    hint.textContent = '道途已尽，无需再突破';
  } else {
    btn.disabled = false;
    const on = !!state.meta.autoBreakthrough;
    btn.textContent = on ? '已开启' : '已关闭';
    btn.className = 'btn btn-sm ' + (on ? 'btn-jade' : 'btn-danger');
    if (inTribulation()) {
      hint.textContent = '天劫临身，此事须你亲自应对';
    } else if (on) {
      hint.textContent = `当前成功率 ${fmtPct(calcBreakChance())}，达标即自动破关`;
    } else {
      hint.textContent = `当前成功率 ${fmtPct(calcBreakChance())}，点击开启`;
    }
  }

  // ---- 战报播放 ----
  const cbtn = document.getElementById('btnBattleReport');
  const chint = document.getElementById('battleReportHint');
  if (cbtn) {
    const on = state.meta.battleReport !== false;
    cbtn.textContent = on ? '已开启' : '已关闭';
    cbtn.className = 'btn btn-sm ' + (on ? 'btn-jade' : 'btn-danger');
    if (chint) chint.textContent = on ? '战斗后弹窗逐条播放战报' : '战斗结果只写进日志，不再弹窗';
  }

  // ---- 存档时间 ----
  const sh = document.getElementById('saveHint');
  if (sh && state.meta.lastSaveAt) {
    const d = new Date(state.meta.lastSaveAt);
    sh.textContent = `上次存档：${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}

export function resetSystemPanel() {
  built = false;
}
