/**
 * 设置 · 存档管理。
 * 三个存档槽 + 导出/导入存档码 + 重开。
 */

import {
  SLOT_COUNT, getActiveSlot, setActiveSlot, slotInfo, hasSave,
  save, load, deleteSlot, exportCode, importCode, wipeSlots,
} from '../core/save.js';
import { realm, state } from '../core/state.js';
import { fmt, fmtTime } from '../core/format.js';
import { openModal, closeAllModals, confirmModal, alertModal } from './modal.js';
import { toast } from './toast.js';
import { audioConfig, setAudioEnabled, setAudioVolume, nextTrack } from './audio.js';
import { exportTelemetry, telemetrySummary, resetTelemetry } from '../core/telemetry.js';
// 演示档（临时脚手架）：删掉这行 + buildBody/bindBody 里标注「演示档」的两段
// 即可完全移除。详见 src/dev/demoSave.js 顶部说明。
import {
  DEMO_SLOT, installDemoSave, hasDemoBackup, restoreDemoSlot,
} from '../dev/demoSave.js';

function slotLabel(i) {
  const info = slotInfo(i);
  if (!info) return { text: '空存档', sub: '未开始' };
  const r = info.realmIndex;
  return {
    text: `${info.name}`,
    sub: `境界 ${r} · ${fmtTime(info.lastSave)}`,
  };
}

export function openSettingsModal() {
  closeAllModals();
  const handle = openModal({
    title: '设 置',
    body: buildBody(),
    wide: true,
    dismissible: true,
    actions: [{ text: '关闭', cls: 'btn-gold' }],
  });
  bindBody(handle);
}

function buildBody() {
  const active = getActiveSlot();
  const slots = [];
  for (let i = 1; i <= SLOT_COUNT; i++) {
    const info = slotLabel(i);
    const isActive = i === active;
    slots.push(`
      <div class="list-item ${isActive ? 'equipped' : ''}">
        <div class="li-main">
          <div class="li-name">存档 ${i} ${isActive ? '<span class="tag tag-jade">当前</span>' : ''}</div>
          <div class="li-desc">${escHtml(info.text)} · ${escHtml(info.sub)}</div>
        </div>
        <div class="li-actions">
          <button class="btn btn-sm" data-slot-save="${i}" type="button">存入</button>
          <button class="btn btn-sm btn-gold" data-slot-load="${i}" type="button"
            ${hasSave(i) ? '' : 'disabled'}>读取</button>
          <button class="btn btn-sm btn-danger" data-slot-del="${i}" type="button"
            ${hasSave(i) ? '' : 'disabled'}>删除</button>
        </div>
      </div>`);
  }

  const ac = audioConfig();
  const volPct = Math.round(ac.volume * 100);
  // 三种状态要分清楚，否则"已开启但还没出声"会被玩家当成坏了：
  //   关掉了        → 直说关掉了
  //   开着且已出声   → 报当前曲名
  //   开着但没手势   → 告诉他会在他第一次点击后开始
  const musicState = !ac.enabled
    ? '背景音乐已关闭。'
    : ac.track
      ? `正在播放：${escHtml(ac.track)}`
      : '将在你第一次点击或按键后开始播放。';

  return `
    <div class="sub-title">背景音乐</div>
    <div class="row mb-1" style="align-items:center;gap:12px;flex-wrap:wrap;">
      <label class="small" style="display:flex;align-items:center;gap:6px;cursor:pointer;">
        <input type="checkbox" id="chkMusic" ${ac.enabled ? 'checked' : ''}> 播放背景音乐
      </label>
      <input type="range" id="volMusic" min="0" max="100" step="1" value="${volPct}"
        style="width:140px;" aria-label="音量">
      <span class="small muted num" id="volLabel">${volPct}%</span>
      <button class="btn btn-sm" id="btnNextTrack" type="button"
        ${ac.enabled ? '' : 'disabled'}>下一曲</button>
    </div>
    <div class="small muted mb-2" id="nowPlaying">${musicState}</div>

    <div class="sub-title">存档槽</div>
    <div class="list" style="max-height:none;">${slots.join('')}</div>

    <div class="sub-title">存档码</div>
    <div class="small muted mb-1">导出的存档码可以贴给朋友，或备份到别处。</div>
    <div class="row mb-2">
      <button class="btn btn-sm" id="btnExport" type="button">导出存档码</button>
      <button class="btn btn-sm" id="btnImport" type="button">导入存档码</button>
    </div>
    <textarea id="codeArea" rows="3" style="width:100%;font-family:monospace;font-size:0.75em;
      padding:6px;border:1px solid var(--border-light);border-radius:3px;background:#fcf6e8;"
      placeholder="在此粘贴存档码，然后点「导入存档码」"></textarea>

    <!-- ==================== 演示档（临时） ==================== -->
    <div class="sub-title">演示档</div>
    <div class="small muted mb-1">
      生成一份「什么都有、但还没玩完」的存档：大乘期，17 个页签全部解锁且都有内容，
      功课已完成大半、留了几门在途。写进存档 ${DEMO_SLOT}，会覆盖该槽现有内容
      （覆盖前自动备份，可随时还原）。
    </div>
    <div class="row mb-2">
      <button class="btn btn-sm btn-gold" id="btnDemoSave" type="button">生成演示档并载入</button>
      ${hasDemoBackup() ? `<button class="btn btn-sm" id="btnDemoRestore" type="button">
        还原存档 ${DEMO_SLOT} 备份</button>` : ''}
    </div>
    <!-- ==================== /演示档 ==================== -->

    <div class="sub-title">数值诊断</div>
    <div class="small muted mb-1">
      采集本局的修为来源、各境界停留时长与交互时长，用于标定数值。
      数据只存在本机，不影响存档。
    </div>
    <div class="row mb-2">
      <button class="btn btn-sm" id="btnTelemetry" type="button">导出诊断数据</button>
      <button class="btn btn-sm" id="btnTelemetryText" type="button">复制摘要</button>
      <button class="btn btn-sm btn-danger" id="btnTelemetryReset" type="button">清空</button>
    </div>

    <div class="sub-title">关于</div>
    <div class="small muted mb-1">纯前端文字修仙放置游戏 · 零依赖零构建 · MIT 开源。</div>
    <div class="row mb-2">
      <a class="btn btn-sm" href="https://whouare-dot.github.io/xiantu/video.html"
        target="_blank" rel="noopener">演示视频</a>
      <a class="btn btn-sm" href="https://github.com/whouare-dot/xiantu"
        target="_blank" rel="noopener">GitHub 仓库</a>
    </div>

    <div class="sub-title">重修</div>
    <div class="small muted mb-2">抹去这一世的修行，从头再来。此操作不可撤销。</div>
    <button class="btn btn-sm btn-danger" id="btnResetAll" type="button">重开此世</button>
  `;
}

function bindBody(handle) {
  const box = handle.box;

  // ---- 背景音乐 ----
  const chkMusic = box.querySelector('#chkMusic');
  if (chkMusic) {
    chkMusic.addEventListener('change', () => {
      setAudioEnabled(chkMusic.checked);
      // 重建一次：开关会连带影响"下一曲"按钮的可用态与状态行文案
      refresh();
    });
  }

  const volMusic = box.querySelector('#volMusic');
  if (volMusic) {
    // 拖动过程中**不能** refresh——重建 DOM 会把滑块从玩家手里抢走，
    // 手指还在拖、元素已经换了，滑块立刻失去焦点。只改数字。
    volMusic.addEventListener('input', () => {
      const v = Number(volMusic.value) / 100;
      setAudioVolume(v);
      const lab = box.querySelector('#volLabel');
      if (lab) lab.textContent = `${Math.round(v * 100)}%`;
    });
  }

  const btnNextTrack = box.querySelector('#btnNextTrack');
  if (btnNextTrack) {
    btnNextTrack.addEventListener('click', () => { nextTrack(); refresh(); });
  }

  box.querySelectorAll('[data-slot-save]').forEach((b) => {
    b.addEventListener('click', () => {
      const i = parseInt(b.dataset.slotSave, 10);
      if (save(i)) {
        setActiveSlot(i);
        toast(`已存入存档 ${i}`, 'good');
        refresh();
      }
    });
  });

  box.querySelectorAll('[data-slot-load]').forEach((b) => {
    b.addEventListener('click', async () => {
      const i = parseInt(b.dataset.slotLoad, 10);
      const ok = await confirmModal('读取存档', `确定读取存档 ${i}？当前进度将被覆盖。`);
      if (!ok) return;
      if (load(i)) {
        setActiveSlot(i);
        toast('读档成功', 'good');
        closeAllModals();
        setTimeout(() => location.reload(), 200);
      } else {
        toast('读档失败', 'bad');
      }
    });
  });

  box.querySelectorAll('[data-slot-del]').forEach((b) => {
    b.addEventListener('click', async () => {
      const i = parseInt(b.dataset.slotDel, 10);
      const ok = await confirmModal('删除存档', `确定删除存档 ${i}？`, { danger: true });
      if (!ok) return;
      deleteSlot(i);
      toast('已删除', 'good');
      refresh();
    });
  });

  const exportBtn = box.querySelector('#btnExport');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const code = exportCode();
      const area = box.querySelector('#codeArea');
      area.value = code;
      area.select();
      try {
        navigator.clipboard?.writeText(code);
        toast('存档码已复制到剪贴板', 'good');
      } catch {
        toast('已生成存档码，请手动复制', 'special');
      }
    });
  }

  const importBtn = box.querySelector('#btnImport');
  if (importBtn) {
    importBtn.addEventListener('click', async () => {
      const area = box.querySelector('#codeArea');
      const ok = await confirmModal('导入存档', '确定用存档码覆盖当前进度？');
      if (!ok) return;
      const res = importCode(area.value);
      if (res.ok) {
        toast('导入成功', 'good');
        setTimeout(() => location.reload(), 300);
      } else {
        toast(res.error || '导入失败', 'bad');
      }
    });
  }

  // ---- 演示档（临时） ----
  const demoBtn = box.querySelector('#btnDemoSave');
  if (demoBtn) {
    demoBtn.addEventListener('click', async () => {
      const occupied = hasSave(DEMO_SLOT);
      const ok = await confirmModal(
        '生成演示档',
        occupied
          ? `存档 ${DEMO_SLOT} 已有内容，将被演示档覆盖。原内容会先自动备份，之后可随时还原。继续？`
          : `将在存档 ${DEMO_SLOT} 生成演示档并立即载入。继续？`,
        { okText: '生成并载入' },
      );
      if (!ok) return;
      try {
        const report = installDemoSave();
        console.log('[演示档] 自检摘要', report);
        toast('演示档已生成，正在载入…', 'good');
        setTimeout(() => location.reload(), 500);
      } catch (e) {
        console.error('[演示档] 生成失败', e);
        toast('生成失败：' + (e?.message || e), 'bad');
      }
    });
  }

  const demoRestoreBtn = box.querySelector('#btnDemoRestore');
  if (demoRestoreBtn) {
    demoRestoreBtn.addEventListener('click', async () => {
      const ok = await confirmModal(
        '还原备份',
        `把备份的存档 ${DEMO_SLOT} 写回去？当前的演示档会消失。`,
        { okText: '还原' },
      );
      if (!ok) return;
      if (!restoreDemoSlot()) {
        toast('没有可还原的备份', 'bad');
        refresh();
        return;
      }
      // ⚠ 还原后必须**把备份读进内存**再刷新，不能只写 localStorage。
      // beforeunload 会无条件把内存里的 state 存回激活槽（core/save.js 记过
      // 这个坑）——只写盘的话，紧接着的 reload 会用内存里的演示档
      // 把刚还原的备份原样盖回去，还原按钮等于没按。
      // 读进来之后两边内容一致，它再写一次也无所谓。
      setActiveSlot(DEMO_SLOT);
      load(DEMO_SLOT);
      toast('已还原备份，正在载入…', 'good');
      setTimeout(() => location.reload(), 500);
    });
  }

  // ---- 数值诊断 ----
  // 导出成文件而不是塞进 textarea：诊断数据一局约 1000 条事件，动辄几百 KB。
  const telBtn = box.querySelector('#btnTelemetry');
  if (telBtn) {
    telBtn.addEventListener('click', () => {
      try {
        const json = exportTelemetry();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        // 用本地时间拼时间戳。toISOString 是 UTC，且截断后日期与时间会粘在一起
        // （"2026-09-13112538"），不好认。
        const d = new Date();
        const p2 = (n) => String(n).padStart(2, '0');
        const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}`
          + `-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
        a.href = url;
        a.download = `xiantu-telemetry-${stamp}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast('诊断数据已导出', 'good');
      } catch (e) {
        toast('导出失败：' + e, 'bad');
      }
    });
  }

  const telTextBtn = box.querySelector('#btnTelemetryText');
  if (telTextBtn) {
    telTextBtn.addEventListener('click', () => {
      const text = telemetrySummary();
      try {
        navigator.clipboard?.writeText(text);
        toast('摘要已复制到剪贴板', 'good');
      } catch {
        toast('复制失败，摘要已打到控制台', 'special');
      }
      console.log(text);
    });
  }

  const telResetBtn = box.querySelector('#btnTelemetryReset');
  if (telResetBtn) {
    telResetBtn.addEventListener('click', async () => {
      const ok = await confirmModal('清空诊断数据', '确定丢弃已采集的诊断数据？不影响存档。');
      if (!ok) return;
      resetTelemetry();
      toast('诊断数据已清空，已从此刻重新开始采集', 'good');
    });
  }

  const resetBtn = box.querySelector('#btnResetAll');
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      const ok = await confirmModal(
        '重开此世',
        '确定重新开始吗？这一世的所有进度都会消失。',
        { danger: true, okText: '确定重开' },
      );
      if (!ok) return;
      // 必须走 wipeSlots：它会把写入闸门关上。
      // 直接 removeItem + reload 是不行的——reload 触发的 beforeunload
      // 会把刚删掉的存档原样写回去，重开按钮等于没按（实测过）。
      wipeSlots();
      location.reload();
    });
  }

  function refresh() {
    const body = handle.box.querySelector('.modal-body');
    if (body) {
      body.innerHTML = buildBody();
      bindBody(handle);
    }
  }
}

function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
