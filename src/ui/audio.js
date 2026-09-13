/**
 * 背景音乐。
 *
 * 三条设计约束，都是踩过的坑，改之前先读：
 *
 * 1. **设置不进存档，存在独立的 localStorage key。**
 *    音乐开关是"这台设备上的偏好"，不是"这一世的进度"。塞进存档有两个恶果：
 *    玩家每飞升一次就要重设一次音量；导出给朋友的存档码会把你的音量一并带过去。
 *    `wipeSlots()`（重开此世）只删 `xiantu_v2_slot*`，所以这个 key 能安然度过重开。
 *
 * 2. **不用 core/rng.js。**
 *    那是游戏逻辑的随机源，是要被复现的——世界事件的轮换、奇遇选项的打乱都依赖它。
 *    播放顺序是纯表现层的事，消耗它只会让游戏内的随机序列平白偏移。
 *    所以这里自带一个 Math.random 的 Fisher–Yates，并刻意不 import rng.js。
 *
 * 3. **必须等一次用户手势。**
 *    浏览器一律拦截无交互的自动播放，`play()` 会返回一个 rejected promise。
 *    "默认开启"不等于"进页面就出声"——第一次点击或按键才真正起播。
 *    抢在用户操作前 play() 只会拿到一条控制台报错，一秒音乐也提前不了。
 *
 * 本文件只碰 Audio 与 localStorage：不读写 state，不进主循环，不做 DOM。
 */

const KEY = 'xiantu_audio';

/** 默认开着，但音量留一半——挂机游戏常被切到后台，太吵会被直接关掉 */
const DEFAULTS = { enabled: true, volume: 0.5 };

/**
 * 曲目表。
 *
 * 浏览器里没有"列目录"这回事，静态站只能把文件名写死。
 * ⚠ 改动 `src/music/` 下的文件名后必须同步这里，否则那一首会被静默跳过
 * （error 监听会把它跳过去，玩家只会觉得少了一首，不会有任何报错）。
 */
const TRACKS = [
  '古风仙侠玄幻 游戏、短剧场景配乐 古风修仙 武林武侠 休闲时_爱给网_aigei_com.mp3',
  '柳青瑶 - 不谓侠_H.ogg',
  '柳青瑶 - 唐宫夜宴_H.ogg',
  '柳青瑶 - 故梦 (琵琶版)_L.ogg',
  '柳青瑶 - 百舞惊鸿_H.ogg',
  '柳青瑶 - 离骚_L.ogg',
  '柳青瑶 - 醉太平_H.ogg',
  '柳青瑶 - 锦瑟 (国乐纯享版)_H.ogg',
  '柳青瑶 - 雨碎江南 (琵琶版)_L.ogg',
  '柳青瑶 - 霜雪千年 (琵琶版)_L.ogg',
  '詹昊晁 Zhan_H_C - 禅茶_H.ogg',
  '詹昊晁 Zhan_H_C - 茶韵_H.ogg',
];

// ==================== 状态 ====================

let cfg = readCfg();
let el = null;            // HTMLAudioElement，惰性创建
let seq = [];             // 打乱后的曲目下标排列
let seqPos = 0;
let errorStreak = 0;      // 连续加载失败次数，用于"整个目录都读不到"时收手
let armed = false;        // 是否已挂上"等一次用户手势"的监听

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

function readCfg() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return {
      enabled: raw.enabled !== false,
      volume: clamp01(Number.isFinite(raw.volume) ? raw.volume : DEFAULTS.volume),
    };
  } catch {
    // 存档被手改坏 / localStorage 被禁用：退回默认值，不要把整个 UI 拖垮
    return { ...DEFAULTS };
  }
}

function writeCfg() {
  try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch { /* 存不下不该影响播放 */ }
}

/** Fisher–Yates。刻意用 Math.random，见文件头约束 2。 */
function shuffled(n) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 文件名的绝对 URL。
 * 用 import.meta.url 而不是相对文档的路径：这样无论页面从哪个层级加载都能定位到
 * `src/music/`（相对 index.html 的写法在 serve.py 之外的环境里会失效）。
 * encodeURIComponent 是必须的——曲名里有空格、中文和括号。
 */
function trackUrl(name) {
  return new URL('../music/' + encodeURIComponent(name), import.meta.url).href;
}

/** 去掉扩展名与素材站的冗余后缀，用于界面上显示 */
function displayName(file) {
  return file
    .replace(/\.(mp3|ogg|m4a|wav)$/i, '')
    .replace(/_爱给网_aigei_com$/, '')
    .replace(/_[HL]$/, '');
}

// ==================== 播放内核 ====================

function ensureEl() {
  if (el || typeof Audio === 'undefined') return el;
  el = new Audio();
  el.preload = 'auto';
  el.volume = cfg.volume;

  el.addEventListener('ended', () => next());

  // 单曲坏掉/缺失不该让整条列表停摆，跳下一首。
  // 但不能无限跳——整个目录都读不到时会空转刷屏，所以连续失败到上限就收手。
  el.addEventListener('error', () => {
    if (errorStreak >= TRACKS.length) return;
    errorStreak += 1;
    next();
  });

  // 真正出声了才把失败计数清零，这样"连续失败"的语义才准确
  el.addEventListener('playing', () => { errorStreak = 0; });

  return el;
}

function playCurrent() {
  const a = ensureEl();
  if (!a || seq.length === 0) return;
  a.src = trackUrl(TRACKS[seq[seqPos]]);
  a.volume = cfg.volume;
  const p = a.play();
  // 无手势 / 被策略拦截时 play() 返回 rejected promise。这是预期内的情况，静默即可——
  // 挂上手势监听后我们会再试一次。
  if (p && typeof p.catch === 'function') p.catch(() => {});
}

function next() {
  if (seq.length === 0) seq = shuffled(TRACKS.length);
  seqPos += 1;
  if (seqPos >= seq.length) {
    // 一轮播完：重新洗牌，而不是原序重来——同一个顺序听第二遍就开始腻了
    seq = shuffled(TRACKS.length);
    seqPos = 0;
  }
  playCurrent();
}

function begin() {
  if (seq.length === 0) seq = shuffled(TRACKS.length);
  playCurrent();
}

function stop() {
  if (el) el.pause();
}

/**
 * 挂上"等用户第一次交互"的监听。
 * pointerdown + keydown 都要挂、且都要在触发后解绑：
 * 只挂 pointerdown 会漏掉纯键盘玩家；而只用 { once: true } 的话，
 * 两个监听里只会失效被触发的那个，另一个会一直挂着。
 */
function armGesture() {
  if (armed || typeof document === 'undefined') return;
  armed = true;
  const kick = () => {
    document.removeEventListener('pointerdown', kick);
    document.removeEventListener('keydown', kick);
    armed = false;
    if (cfg.enabled) begin();
  };
  document.addEventListener('pointerdown', kick);
  document.addEventListener('keydown', kick);
}

// ==================== 对外接口 ====================

/** 当前曲目名（无曲目时为空串） */
export function currentTrackName() {
  if (!el || seq.length === 0) return '';
  return displayName(TRACKS[seq[seqPos]] || '');
}

/** 供设置面板读取 */
export function audioConfig() {
  return { enabled: cfg.enabled, volume: cfg.volume, track: currentTrackName(), total: TRACKS.length };
}

export function setAudioEnabled(on) {
  cfg.enabled = !!on;
  writeCfg();
  if (cfg.enabled) {
    // 这次调用本身就是一次用户手势（点击复选框），可以直接起播
    if (el) playCurrent(); else begin();
  } else {
    stop();
  }
}

export function setAudioVolume(v) {
  cfg.volume = clamp01(Number(v));
  writeCfg();
  if (el) el.volume = cfg.volume;
}

/** 手动切下一曲 */
export function nextTrack() {
  if (!cfg.enabled) return;
  if (!el) begin(); else next();
}

/**
 * 启动时调用一次。
 * 什么都不播——只是决定"要不要等用户手势"。真正的播放由手势或设置面板触发。
 */
export function initAudio() {
  if (typeof Audio === 'undefined') return;
  if (cfg.enabled) armGesture();
}
