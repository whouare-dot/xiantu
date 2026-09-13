/**
 * 事件总线。
 * systems/ 层通过它广播，ui/ 层订阅渲染，避免二者互相 import 造成循环依赖。
 */

const listeners = new Map();

/** 订阅。返回取消订阅的函数。 */
export function on(name, fn) {
  if (!listeners.has(name)) listeners.set(name, new Set());
  listeners.get(name).add(fn);
  return () => off(name, fn);
}

/** 只触发一次 */
export function once(name, fn) {
  const dispose = on(name, (payload) => {
    dispose();
    fn(payload);
  });
  return dispose;
}

export function off(name, fn) {
  const set = listeners.get(name);
  if (set) {
    set.delete(fn);
    if (set.size === 0) listeners.delete(name);
  }
}

/**
 * 广播。单个订阅者抛错不应影响其它订阅者，所以逐个 try/catch。
 */
export function emit(name, payload) {
  const set = listeners.get(name);
  if (!set) return;
  for (const fn of Array.from(set)) {
    try {
      fn(payload);
    } catch (err) {
      console.error(`[bus] 事件 "${name}" 的订阅者抛出异常:`, err);
    }
  }
}

/** 清空所有订阅（重置游戏 / 测试用） */
export function clearAll() {
  listeners.clear();
}

// ---- 事件名常量，避免各处手写字符串拼错 ----
export const EV = {
  LOG: 'log',
  CULT_GAIN: 'cult:gain',
  REALM_BREAK: 'realm:break',
  REALM_FAIL: 'realm:fail',
  TRIBULATION_START: 'tribulation:start',
  TRIBULATION_END: 'tribulation:end',
  COMBAT_END: 'combat:end',
  ITEM_GAIN: 'item:gain',
  ITEM_USE: 'item:use',
  STATE_DIRTY: 'state:dirty',
  OFFLINE_REWARD: 'offline:reward',
  BUILDING_DONE: 'cave:buildingDone',
  // V3.0
  STANCE_CHANGE: 'stance:change',
  SECT_JOIN: 'sect:join',
  SECT_BETRAY: 'sect:betray',
  SECT_RANK_UP: 'sect:rankUp',
  SECT_WAR_END: 'sect:warEnd',
  BEAST_GAINED: 'beast:gained',
  BEAST_EVOLVED: 'beast:evolved',
  // V4.0
  REINCARNATE: 'reincarnate',
  ENDING: 'ending',
  // V5.0 世业：劫数改派 / 了结 / 飞升演出
  DUTY_CHANGE: 'duty:change',
  DUTY_DONE: 'duty:done',
  ASCEND: 'ascend',
  COMPANION_MEET: 'companion:meet',
  COMPANION_STORY: 'companion:story',
  WORLD_EVENT: 'worldEvent:change',
  CODEX_GAIN: 'codex:gain',
};
