/**
 * 随机数工具。
 * 使用可播种的 mulberry32，方便复现 bug 与做数值测试。
 * 游戏内所有随机都必须走这里，禁止直接 Math.random()。
 */

let _seed = (Date.now() >>> 0) ^ 0x9e3779b9;

/** 设置随机种子（调试 / 测试用） */
export function setSeed(seed) {
  _seed = seed >>> 0;
}

/**
 * 在指定种子下同步执行 fn，结束后恢复原有随机流。
 *
 * 用于「预测」这类既要可复现、又绝不能污染真实随机序列的场景：
 * 调用期间的 rand / chance / pick 全走这套临时种子，同一输入必得同一结果，
 * 而战斗、掉落等真实随机一点不受影响。
 * fn 必须是同步的——中途 await 会让别的逻辑串进这段临时种子。
 */
export function withSeed(seed, fn) {
  const saved = _seed;
  _seed = seed >>> 0;
  try {
    return fn();
  } finally {
    _seed = saved;
  }
}

function next() {
  _seed |= 0;
  _seed = (_seed + 0x6d2b79f5) | 0;
  let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** [0, 1) */
export const rand = next;

/** [min, max] 闭区间整数 */
export function randInt(min, max) {
  if (max < min) [min, max] = [max, min];
  return Math.floor(next() * (max - min + 1)) + min;
}

/** [min, max) 浮点 */
export function randFloat(min, max) {
  return next() * (max - min) + min;
}

/** 概率命中，p 为 0..1 */
export function chance(p) {
  return next() < p;
}

/** 从数组随机取一个 */
export function pick(arr) {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(next() * arr.length)];
}

/**
 * 加权随机。items 为数组，weightOf 返回该项权重。
 * 返回被选中的项，权重全为 0 时返回 null。
 */
export function weightedPick(items, weightOf = (it) => it.weight ?? 1) {
  let total = 0;
  for (const it of items) total += Math.max(0, weightOf(it));
  if (total <= 0) return null;
  let roll = next() * total;
  for (const it of items) {
    roll -= Math.max(0, weightOf(it));
    if (roll <= 0) return it;
  }
  return items[items.length - 1];
}

/**
 * 在一个 [min, max] 区间取值。amount 可能是数字或 [min, max] 数组。
 * 这是事件 DSL 的取值入口。
 */
export function rollAmount(amount) {
  if (Array.isArray(amount)) return randInt(amount[0], amount[1]);
  return amount ?? 0;
}

/** 按权重挑选 outcomes 并返回选中的 outcome */
export function rollOutcome(outcomes) {
  if (!outcomes || outcomes.length === 0) return null;
  if (outcomes.length === 1) return outcomes[0];
  return weightedPick(outcomes);
}

/**
 * Fisher-Yates 洗牌，返回新数组（不改原数组）。
 * 用于打乱奇遇选项的显示顺序，避免"永远选第一个"这种可被套路的策略。
 */
export function shuffle(arr) {
  const a = [...(arr || [])];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
