/**
 * 《仙途》入口。
 *
 * 职责只有三件：装配、调度、兜底。
 * 业务逻辑一律不写在这里 —— 它在 systems/ 与 ui/ 里。
 */

import { state, setState, createInitialState, realmAt, isMaxRealm } from './core/state.js';
import {
  start, onTick, onGap, markDirty, forceRender, resyncClock,
} from './core/loop.js';
import { on, EV } from './core/bus.js';
import {
  save, load, tryMigrateLegacy, getActiveSlot, hasSave, slotInfo, deserialize,
} from './core/save.js';
import { fmt, fmtDuration, fmtStones } from './core/format.js';
import {
  initTelemetry, tickTelemetry, noteSession, initClickTracking,
} from './core/telemetry.js';

// ---- 系统层：命名空间导入，容忍并行开发期的接口差异 ----
import * as cultivation from './systems/cultivation.js';
import * as breakthrough from './systems/breakthrough.js';
import * as encounter from './systems/encounter.js';
import * as exploreSys from './systems/explore.js';
import * as caveSys from './systems/cave.js';
import * as alchemySys from './systems/alchemy.js';
import * as forgeSys from './systems/forging.js';
import * as shopSys from './systems/shop.js';
import * as combatSys from './systems/combat.js';
import * as invSys from './systems/inventory.js';
import * as sectSys from './systems/sect.js';
import * as beastSys from './systems/beast.js';
import * as codexSys from './systems/codex.js';
import * as worldSys from './systems/worldEvent.js';
import * as companionSys from './systems/companion.js';
import { tickDuty, assignDuties, snapshotBaselines, dutySummary, migrateDutyState } from './systems/duty.js';
import { BUILDINGS } from './data/caveBuildings.js';

// ---- UI 层 ----
import { initLog, flushLog } from './ui/log.js';
import { initTabs, renderTabs, setBadge, onTabChange } from './ui/tabs.js';
import { initRender, registerPanel, renderAll } from './ui/render.js';
import { toast, reward, note, warn } from './ui/toast.js';
import { showRealmBanner, clearRealmBanner } from './ui/realmBanner.js';
import { openModal, closeAllModals, isModalOpen, alertModal } from './ui/modal.js';
import { initEncounterUI } from './ui/encounterUI.js';
import { initGuide, resetGuide } from './ui/guide.js';
import { initAudio } from './ui/audio.js';
import { renderCharPanel } from './ui/panels/charPanel.js';
import { renderSystemPanel } from './ui/panels/systemPanel.js';
import { renderBuffsPanel } from './ui/panels/buffsPanel.js';
import { renderCultivatePanel } from './ui/panels/cultivatePanel.js';
import { renderTechniquePanel } from './ui/panels/techniquePanel.js';
import { renderCavePanel } from './ui/panels/cavePanel.js';
import { renderAlchemyPanel } from './ui/panels/alchemyPanel.js';
import { renderForgePanel } from './ui/panels/forgePanel.js';
import { renderInventoryPanel } from './ui/panels/inventoryPanel.js';
import { renderAchievementPanel } from './ui/panels/achievementPanel.js';
import { renderShopPanel } from './ui/panels/shopPanel.js';
import { renderTowerPanel } from './ui/panels/towerPanel.js';
import { renderInfoPanel } from './ui/panels/infoPanel.js';
import { renderSectPanel } from './ui/panels/sectPanel.js';
import { renderBeastPanel } from './ui/panels/beastPanel.js';
import { renderReincarnationPanel } from './ui/panels/reincarnationPanel.js';
import { renderTalentPanel } from './ui/panels/talentPanel.js';
import { renderCodexPanel } from './ui/panels/codexPanel.js';
import { renderWorldPanel } from './ui/panels/worldPanel.js';
import { renderCompanionPanel } from './ui/panels/companionPanel.js';
import { tickAchievements, checkAll } from './systems/achievement.js';

const AUTOSAVE_MS = 30000;
const OFFLINE_EFFICIENCY = 0.6;   // 离线修炼效率（在线为 1.0）

let lastAutosave = 0;

// ==================== 启动 ====================

function boot() {
  initLog();

  // 1) 读档：优先当前槽，其次旧版迁移，最后开新档
  let loaded = false;
  if (hasSave(getActiveSlot())) {
    loaded = load(getActiveSlot());
  }
  if (!loaded) {
    const migrated = tryMigrateLegacy();
    if (migrated) {
      note('旧存档已迁移到新版');
      pushSystemLog('检测到旧版存档，已为你完整迁移。境界、装备、灵石都已保留。', 'event-special');
    }
  }
  if (!loaded && !hasSave(getActiveSlot())) {
    setState(createInitialState());
    // 第 1 世是**教学世**：走八幕主线，把每个玩法都推到玩家面前。
    // 否则玩家要到第 2 世才见得到这套机制，而第 1 世恰恰最需要"告诉你该干什么"。
    try {
      snapshotBaselines();   // 图鉴 / 成就的"本世增量"基线
      assignDuties(1);
    } catch (e) { console.warn('[duty] 开局指派失败', e); }
    newGameIntro();
  }

  // 2) 兜底：确保关键字段存在（防止手改存档或缺字段崩溃）
  ensureStateIntegrity();

  // 2.5) 诊断采集：必须在离线结算**之前**初始化，否则这一段的离线修为
  // 会记在基线之外（自检会显示对不上）。倍率明细用注入，避免与 cultivation 成环。
  initTelemetry({ getBreakdown: () => cultivation.cultSpeedBreakdown?.() ?? null });

  // 3) 离线结算
  const gap = offlineSeconds();
  if (gap > 60) {
    applyOffline(gap);
  } else {
    state.meta.lastTick = Date.now();
  }

  // 3.5) 开局先扫一次成就：老存档里早已满足的条件应当立即补发
  try { checkAll?.(); } catch (e) { console.warn('[achievement] 开局扫描异常', e); }

  // 4) UI
  initTabs();
  initRender();
  initEncounterUI();
  initGuide();
  // 背景音乐：这里只是挂上"等一次用户手势"的监听，不会立刻出声（浏览器不允许）
  initAudio();
  registerPanels();
  bindBusHandlers();
  bindGlobalEvents();
  renderAll();
  // 交互时长（口径 P3）：全局点击监听，只在 DOM 就绪后挂一次
  initClickTracking();

  // 5) 主循环
  onTick(mainTick);
  onGap((seconds) => applyOffline(seconds));
  start();
  resyncClock();
}

function newGameIntro() {
  const s = state.player.spiritRoot;
  pushSystemLog('【启程】你踏上修仙之路，前路茫茫，且行且悟。', 'event-special');
  pushSystemLog(`灵根觉醒：${s.name}（${s.desc}）`, s.mult >= 1.3 ? 'event-good' : 'event-bad');
  pushSystemLog(`初始气运：${state.player.base.luck}`, 'event-good');
  pushSystemLog('赠予新人灵石五十，聊作路资。', 'event-good');
  const sum = dutySummary();
  if (sum.mode === 'full' && sum.mainTotal > 0) {
    pushSystemLog(
      `本世功课：八幕共 ${sum.mainTotal} 门必修，另有余课任选 ${sum.sideRequired} 项。详见「轮回」页。`,
      'event-special',
    );
  }
}

function pushSystemLog(text, cls = '') {
  on(EV.LOG, () => {});
  import('./core/bus.js').then(({ emit }) => emit(EV.LOG, { text, cls, channel: 'system' }));
}

function ensureStateIntegrity() {
  const p = state.player;
  if (!Number.isFinite(p.hp) || p.hp <= 0) p.hp = cultivation.calcMaxHp?.() ?? 100;
  if (!Number.isFinite(p.mp) || p.mp < 0) p.mp = cultivation.calcMaxMp?.() ?? 50;
  if (!Number.isFinite(p.breakFails) || p.breakFails < 0) p.breakFails = 0;
  if (!state.buffs) state.buffs = [];
  if (!state.player.attributes) {
    state.player.attributes = { comprehension: 0, daoHeart: 0, spiritSense: 0, luck: 0 };
  }
  // 气血/灵力夹到上限内
  const maxHp = cultivation.calcMaxHp?.() ?? 100;
  const maxMp = cultivation.calcMaxMp?.() ?? 50;
  p.hp = Math.min(p.hp, maxHp);
  p.mp = Math.min(p.mp, maxMp);

  // V6.0：旧档迁移 + 新字段兜底（老存档 / 手改档都可能缺）
  // 旧档的 `reincarnation.duty`（单条）在这里被塞进 `duties` 数组，
  // 并落到 'sampled' 模式——不能把半途上的老玩家塞一份第一世教学主线重走一遍。
  try {
    migrateDutyState(state.reincarnation);
    const rc = state.reincarnation;
    if (!Array.isArray(rc.duties)) rc.duties = [];
    if (rc.dutyMode !== 'full' && rc.dutyMode !== 'sampled') rc.dutyMode = 'sampled';
    if (!Number.isFinite(rc.codexBaseline)) rc.codexBaseline = 0;
    if (!Number.isFinite(rc.achBaseline)) rc.achBaseline = 0;

    if (!state.stats) state.stats = {};
    const st = state.stats;
    if (!st.kinds || typeof st.kinds !== 'object') st.kinds = {};
    for (const key of ['slain', 'encounters', 'pills', 'forged', 'shopBuy']) {
      if (!Array.isArray(st.kinds[key])) st.kinds[key] = [];
    }
    if (!Number.isFinite(st.equipOps)) st.equipOps = 0;
    if (!Number.isFinite(st.companionMeets)) st.companionMeets = 0;
  } catch (e) { console.warn('[duty] 状态迁移失败', e); }
}

// ==================== 离线结算 ====================

function offlineSeconds() {
  const last = state.meta.lastTick || Date.now();
  return Math.max(0, (Date.now() - last) / 1000);
}

/**
 * 离线收益。
 * 离线的价值不只是"给点修为"——洞府的升级计时、炼丹炼器的炉子都在这段时间推进，
 * 这些才是"离线也在变强"的实感来源。
 */
function applyOffline(rawSeconds) {
  const capHours = state.meta.offlineCapHours ?? 8;
  const seconds = Math.min(rawSeconds, capHours * 3600);
  state.meta.lastTick = Date.now();

  if (seconds < 60) return;

  const before = {
    realmIndex: state.player.realmIndex,
    cult: state.player.cult,
    stones: { ...state.resources.stones },
  };

  // 1) 修为（离线效率打折，但在线时长为 0）
  let cultGained = 0;
  const speed = cultivation.calcCultSpeed?.() ?? 0;
  if (speed > 0 && !isMaxRealm()) {
    const amount = speed * seconds * OFFLINE_EFFICIENCY;
    const before2 = state.player.cult;
    cultivation.gainCult?.(amount, '离线');
    cultGained = state.player.cult - before2;
  }

  // 诊断采集：rawSeconds 是真实离开时长（P2 用它），seconds 是封顶后的结算时长。
  noteSession('offline', seconds, cultGained, rawSeconds);

  // 2) 洞府离线（升级完成 + 灵田产出）
  let caveReport = null;
  try {
    caveReport = caveSys.caveOffline?.(seconds) ?? null;
  } catch (e) { console.warn('[offline] 洞府结算异常', e); }

  // 3) 炼丹 / 炼器炉子推进
  try { alchemySys.tickAlchemy?.(seconds); } catch (e) { console.warn(e); }
  try { forgeSys.tickForge?.(seconds); } catch (e) { console.warn(e); }

  // 4) 气血灵力回满（离线视为休整）
  const maxHp = cultivation.calcMaxHp?.() ?? 100;
  const maxMp = cultivation.calcMaxMp?.() ?? 50;
  state.player.hp = maxHp;
  state.player.mp = maxMp;

  showOfflineReport(seconds, cultGained, caveReport);
  pushSystemLog(
    `离线 ${fmtDuration(seconds)}，获得修为 ${fmt(cultGained)}（离线效率 ${Math.floor(OFFLINE_EFFICIENCY * 100)}%）。`,
    'event-special',
  );
  markDirty();
}

function showOfflineReport(seconds, cultGained, caveReport) {
  const rows = [];
  if (cultGained > 0) {
    rows.push(row('修为', '+' + fmt(cultGained)));
  }
  if (caveReport) {
    if (caveReport.materials && Object.keys(caveReport.materials).length) {
      const total = Object.values(caveReport.materials).reduce((a, b) => a + b, 0);
      rows.push(row('灵田产出', `灵材 ${fmt(total)} 份`));
    }
    // caveOffline() 返回的字段是 completed: [{id, name, level}]，不是 buildingsDone
    if (caveReport.completed?.length) {
      const names = caveReport.completed.map((c) => `${c.name} ${c.level} 级`);
      rows.push(row('洞府', names.join('、') + ' 已成'));
    }
    if (caveReport.caveLevelUp) {
      rows.push(row('洞府扩建', `已达 ${caveReport.caveLevelUp} 级`));
    }
  }
  if (rows.length === 0) rows.push(row('修为', '无变化'));

  const capped = seconds >= (state.meta.offlineCapHours ?? 8) * 3600;
  openModal({
    title: '闭 关 归 来',
    desc: `你这一入定，便是 ${fmtDuration(seconds)}。` +
      (capped ? `（离线收益按 ${state.meta.offlineCapHours} 小时封顶）` : ''),
    body: `<div class="col-stack">${rows.join('')}</div>`,
    actions: [{ text: '继续修行', cls: 'btn-gold' }],
  });
}

function row(label, value) {
  return `<div class="info-row"><span class="label">${label}</span><span class="value highlight">${value}</span></div>`;
}

// ==================== 主循环 ====================

let encounterTicker = 0;

function mainTick(dt) {
  // 1) 修炼、buff、自然恢复
  cultivation.tick?.(dt);

  // 2) 突破（含自动突破；天劫不会自动闯）
  breakthrough.tick?.(dt);

  // 3) 洞府（升级计时、灵田）
  caveSys.tickCave?.(dt);

  // 4) 炼丹 / 炼器
  alchemySys.tickAlchemy?.(dt);
  forgeSys.tickForge?.(dt);

  // 5) 坊市（拍卖行轮换）
  shopSys.tickShop?.(dt);

  // 5.5) V3.0：宗门（建筑计时、每日任务重置、俸禄、宗门战赛季）与灵兽（孵化、亲密度）
  try { sectSys.tickSect?.(dt); } catch (e) { console.error('[sect] tick 异常', e); }
  try { beastSys.tickBeasts?.(dt); } catch (e) { console.error('[beast] tick 异常', e); }
  // 图鉴自动补录（内部 3 秒节流）与天象轮换
  try { codexSys.tickCodex?.(dt); } catch (e) { console.error('[codex] tick 异常', e); }
  try { worldSys.tickWorldEvent?.(dt); } catch (e) { console.error('[worldEvent] tick 异常', e); }
  // 道侣羁绊的自然增长（立为道侣后更快）
  try { companionSys.tickCompanions?.(dt); } catch (e) { console.error('[companion] tick 异常', e); }

  // 5.7) 世业：拉取本世劫数进度并判定（幂等，只是读几个字段做比较）
  try { tickDuty?.(); } catch (e) { console.error('[duty] tick 异常', e); }

  // 6) 奇遇：有弹窗时不触发，避免打断
  encounterTicker += dt;
  if (encounterTicker >= 1) {
    encounterTicker = 0;
    if (!isModalOpen()) {
      try { encounter.tickEncounter?.(1); } catch (e) { console.error(e); }
    }
  }

  // 7) 探险冷却
  exploreSys.tickExplore?.(dt);

  // 8) 成就：推进隐藏成就的计量器，并按 5 秒节流扫描一次
  tickAchievements?.(dt);

  // 9) 标签页小红点
  updateBadges();

  // 9.5) 诊断采集：放在最后，看到的是本 tick 结算完的状态。
  // 它只轮询 realmIndex 与累加修为来源，不改任何状态。
  tickTelemetry(dt);

  // 10) 自动存档
  const now = Date.now();
  if (now - lastAutosave > AUTOSAVE_MS) {
    lastAutosave = now;
    state.meta.lastSaveAt = now;
    save(getActiveSlot());
  }
}

/**
 * 标签页小红点。
 * 只做"有没有可操作的事"的判断，真正的可用性校验仍由各系统负责——
 * 这里全部包在 try 里，任一系统出问题都不应该让整帧渲染崩掉。
 */
function updateBadges() {
  if (isMaxRealm()) {
    setBadge('cultivate', false);
  } else {
    const canBreak = breakthrough.canBreakthrough?.();
    setBadge('cultivate', !!(canBreak && canBreak.ok));
  }

  // 炼丹：有已学会且材料齐备的丹方
  try {
    const known = alchemySys.knownRecipes?.() || [];
    setBadge('alchemy', known.some((id) => alchemySys.canCraft?.(id)?.ok));
  } catch { setBadge('alchemy', false); }

  // 炼器：同上
  try {
    const known = forgeSys.knownForgeRecipes?.() || [];
    setBadge('forge', known.some((id) => forgeSys.canForge?.(id)?.ok));
  } catch { setBadge('forge', false); }

  // 洞府：有任意建筑可升级（含已完工待收的）
  try {
    const any = BUILDINGS.some((b) => {
      const st = caveSys.buildingStatus?.(b.id);
      return st?.canUpgrade || (st?.upgrading && st?.remaining <= 0);
    });
    setBadge('cave', any);
  } catch { setBadge('cave', false); }

  // 轮回：只有一种情况需要小红点——已到最高境却被本世之业拦在门外。
  // 这是玩家唯一可能"不知道该干什么"的时刻（飞升按钮不给点，又没别的事可做），
  // 其余时候轮回页没有非看不可的东西，红点亮着只会变成噪音。
  try {
    const s = dutySummary();
    setBadge('reincarnation', !!(isMaxRealm() && !s.satisfied));
  } catch { setBadge('reincarnation', false); }
}

// ==================== 面板注册 ====================

function registerPanels() {
  registerPanel({ id: 'char', host: 'panelChar', always: true, render: renderCharPanel });
  registerPanel({ id: 'buffs', host: 'panelBuffs', always: true, render: renderBuffsPanel });
  registerPanel({ id: 'system', host: 'panelSystem', always: true, render: renderSystemPanel });

  registerPanel({ id: 'cultivate', pane: 'cultivate', render: renderCultivatePanel });
  registerPanel({ id: 'technique', pane: 'technique', render: renderTechniquePanel });
  registerPanel({ id: 'cave', pane: 'cave', render: renderCavePanel });
  registerPanel({ id: 'alchemy', pane: 'alchemy', render: renderAlchemyPanel });
  registerPanel({ id: 'forge', pane: 'forge', render: renderForgePanel });
  registerPanel({ id: 'inventory', pane: 'inventory', render: renderInventoryPanel });
  registerPanel({ id: 'achievement', pane: 'achievement', render: renderAchievementPanel });
  registerPanel({ id: 'shop', pane: 'shop', render: renderShopPanel });
  registerPanel({ id: 'tower', pane: 'tower', render: renderTowerPanel });
  registerPanel({ id: 'sect', pane: 'sect', render: renderSectPanel });
  registerPanel({ id: 'beast', pane: 'beast', render: renderBeastPanel });
  registerPanel({ id: 'talent', pane: 'talent', render: renderTalentPanel });
  registerPanel({ id: 'codex', pane: 'codex', render: renderCodexPanel });
  registerPanel({ id: 'world', pane: 'world', render: renderWorldPanel });
  registerPanel({ id: 'companion', pane: 'companion', render: renderCompanionPanel });
  registerPanel({ id: 'reincarnation', pane: 'reincarnation', render: renderReincarnationPanel });
  registerPanel({ id: 'info', pane: 'info', render: renderInfoPanel });
}

// ==================== 事件绑定 ====================

function bindBusHandlers() {
  // 突破成功的反馈。分三层呈现（V5.0）：
  //   小境界 —— 只有飘字，安静通过（炼气九层这种每世都要走一遍，不值得大动干戈）
  //   大境界 —— 一段不拦截操作的横幅，点出这一境的名字与意义
  //   天劫关口 —— 横幅 + 全屏闪，真正的仪式感留给玩家必须亲自应对的那道关
  on(EV.REALM_BREAK, ({ realmIndex, major, tribulation, segmentName: seg }) => {
    // 必须用 realmAt(realmIndex) —— `realm()` 是**不接受参数**的，
    // 它永远返回"当前境界"。写成 realm(realmIndex) 读起来像按索引取，
    // 实际参数被静默忽略。实机流程里恰好不出错（触发时 state 已是新境界），
    // 所以这个陷阱一直没被发现，直到用合成事件测试才暴露出来。
    const r = realmAt(realmIndex);
    const app = document.getElementById('app');

    if (major || tribulation) {
      if (app) {
        app.classList.add(tribulation ? 'flash-tribulation' : 'flash-breakthrough');
        setTimeout(() => app.classList.remove('flash-tribulation', 'flash-breakthrough'),
          tribulation ? 3000 : 3200);
      }
      showRealmBanner({
        title: seg || r.name,
        realm: r.name,
        desc: r.desc,
        major: !!major,
      });
      reward(tribulation ? `天劫已渡 · ${r.name}` : `破境 · ${seg || r.name}`);
    } else {
      // 小境界：安静一点。每秒都闪一下的话，大境界的闪就不值钱了
      toast(`${r.name}`, 'good');
    }
    forceRender();
  });

  on(EV.TRIBULATION_START, () => {
    const app = document.getElementById('app');
    if (app) {
      app.classList.add('flash-tribulation');
      setTimeout(() => app.classList.remove('flash-tribulation'), 3000);
    }
    note('天劫已至');
  });

  on(EV.TRIBULATION_END, ({ passed }) => {
    if (passed) reward('天劫已渡');
    else warn('天劫未渡 · 重伤');
    forceRender();
  });

  on(EV.BUILDING_DONE, ({ name }) => {
    reward(`${name} 建成`);
  });

  on(EV.ITEM_GAIN, ({ name, quality }) => {
    if (name) reward(`获得 ${name}`);
  });

  on(EV.COMBAT_END, ({ win }) => {
    if (win) toast('战斗胜利', 'good');
  });

  // 飞升：每一世一次的送别演出。
  // 与结局演出同一套模式（复用 modal，白拿奇遇屏蔽），但更短——
  // 它要被看 5 次以上，长了就成了折磨。
  on(EV.ASCEND, ({ summary }) => {
    import('./ui/ascensionScene.js')
      .then((m) => m.playAscension(summary, () => forceRender()))
      .catch((e) => console.error('[ascension] 演出播放失败', e));
  });

  // 真结局：整局唯一的一场仪式化演出。
  // 放在总线上而不是让轮回面板直接调用，是因为达成路径不止一条
  // （将来可能从奇遇、成就等处触发），演出本身只该被触发一次、由一个地方播。
  on(EV.ENDING, () => {
    import('./ui/endingScene.js')
      .then((m) => m.playEnding({ onDone: () => forceRender() }))
      .catch((e) => console.error('[ending] 演出播放失败', e));
  });

  on(EV.LOG, () => markDirty());
}

function bindGlobalEvents() {
  // 切标签立即重绘：否则要等下一次主循环渲染（最长约 1.25 秒）面板才出现，
  // 点击手感会明显发滞
  onTabChange(() => { resetGuide(); forceRender(); });

  document.getElementById('btnSettings')?.addEventListener('click', () => {
    import('./ui/settings.js').then((m) => m.openSettingsModal());
  });

  // 切回页面：补算离线并重置时钟，避免"切个标签页就被算成离线 5 秒"
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      resyncClock();
      markDirty();
      forceRender();
    }
  });

  window.addEventListener('beforeunload', () => {
    state.meta.lastSaveAt = Date.now();
    save(getActiveSlot());
  });

  // 页面隐藏时也存一次（移动端切后台常常不触发 beforeunload）
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      state.meta.lastSaveAt = Date.now();
      save(getActiveSlot());
    }
  });
}

// ==================== 启动 ====================

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

// 便于调试：控制台可直接访问。
// state 必须用 getter —— 直接写 { state } 会快照当前对象，
// 而 setState(读档/重开) 会整体替换 state，届时快照就指向了旧对象，
// 调试时会看到"改了没反应"的假象。
window.__xiantu = {
  get state() { return state; },
  cultivation, breakthrough, encounter, caveSys,
  alchemySys, forgeSys, shopSys, combatSys, invSys,
};
