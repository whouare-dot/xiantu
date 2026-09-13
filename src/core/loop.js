/**
 * 主循环。
 *
 * 设计要点：
 *  - 逻辑按 1 秒固定步长结算，但用真实时间差驱动，避免浏览器节流导致时间"丢失"。
 *  - 渲染与逻辑解耦：逻辑每秒最多 1 次，渲染靠脏标记驱动且最多 4 次/秒。
 *    挂机游戏后期一屏数字每秒都在变，全量重绘会直接烧掉 CPU。
 *  - 单帧时间差超过 MAX_ONLINE_DT 视为"页面被挂起"，交给 gapHandler 处理（走离线结算）。
 */

const LOGIC_STEP_MS = 1000;
const DRIVER_MS = 250;
const RENDER_MIN_MS = 250;
const MAX_ONLINE_DT = 5;

const tickHandlers = [];
const renderHandlers = [];
let gapHandler = null;

let driver = null;
let lastTime = 0;
let accum = 0;
let dirty = true;
let lastRenderAt = 0;
let running = false;

/** 注册每秒逻辑。fn(dt) 的 dt 单位是秒，正常情况下约等于 1。 */
export function onTick(fn) {
  tickHandlers.push(fn);
}

/** 注册渲染。fn() 应只做 DOM 更新，不做业务计算。 */
export function onRender(fn) {
  renderHandlers.push(fn);
}

/** 页面被挂起超过阈值时调用，fn(gapSeconds) */
export function onGap(fn) {
  gapHandler = fn;
}

/** 标记状态已变化，请求重绘 */
export function markDirty() {
  dirty = true;
}

export function isRunning() {
  return running;
}

function step() {
  const now = Date.now();
  let dt = (now - lastTime) / 1000;
  lastTime = now;

  if (dt <= 0) return;

  // 页面被挂起：交给离线结算，不在这里硬补
  if (dt > MAX_ONLINE_DT) {
    accum = 0;
    if (gapHandler) {
      try {
        gapHandler(dt);
      } catch (e) {
        console.error('[loop] 离线结算异常:', e);
      }
    }
    markDirty();
    return;
  }

  accum += dt * 1000;
  let steps = 0;
  while (accum >= LOGIC_STEP_MS && steps < 5) {
    const stepDt = LOGIC_STEP_MS / 1000;
    for (const fn of tickHandlers) {
      try {
        fn(stepDt);
      } catch (e) {
        console.error('[loop] tick 处理异常:', e);
      }
    }
    accum -= LOGIC_STEP_MS;
    steps++;
  }
  if (steps > 0) markDirty();

  maybeRender(now);
}

function maybeRender(now) {
  if (!dirty) return;
  if (now - lastRenderAt < RENDER_MIN_MS) return;
  lastRenderAt = now;
  dirty = false;
  for (const fn of renderHandlers) {
    try {
      fn();
    } catch (e) {
      console.error('[loop] 渲染异常:', e);
    }
  }
}

/** 立即强制渲染一次（用户操作后调用，保证反馈即时） */
export function forceRender() {
  dirty = false;
  lastRenderAt = Date.now();
  for (const fn of renderHandlers) {
    try {
      fn();
    } catch (e) {
      console.error('[loop] 渲染异常:', e);
    }
  }
}

/**
 * 一次性结算一大段时间（离线收益）。
 * fn(seconds) 会被切成若干块调用，避免单次循环过大。
 */
export function runBulk(seconds, fn, chunkSeconds = 60) {
  let remain = Math.floor(seconds);
  while (remain > 0) {
    const chunk = Math.min(remain, chunkSeconds);
    fn(chunk);
    remain -= chunk;
  }
}

export function start() {
  if (running) return;
  running = true;
  lastTime = Date.now();
  accum = 0;
  lastRenderAt = 0;
  dirty = true;
  driver = setInterval(step, DRIVER_MS);
}

export function stop() {
  running = false;
  if (driver) {
    clearInterval(driver);
    driver = null;
  }
}

/** 用于 visibilitychange：重置基准时间，避免把"切回来"算成离线 */
export function resyncClock() {
  lastTime = Date.now();
  accum = 0;
}
