/**
 * 数值与时间格式化。
 * 挂机游戏后期数字很大，统一用中文单位缩写，避免界面被数字撑爆。
 */

const UNITS = [
  { value: 1e16, suffix: '京' },
  { value: 1e12, suffix: '兆' },
  { value: 1e8, suffix: '亿' },
  { value: 1e4, suffix: '万' },
];

/**
 * 大数格式化：12345 -> "1.23万"，123456789 -> "1.23亿"
 * 小于 1 万时保留整数并加千分位。
 */
export function fmt(n) {
  if (n === Infinity || n === null || n === undefined) return '∞';
  if (!Number.isFinite(n)) return '∞';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  for (const { value, suffix } of UNITS) {
    if (abs >= value) {
      const scaled = abs / value;
      const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
      return sign + trimZero(scaled.toFixed(digits)) + suffix;
    }
  }
  return sign + Math.floor(abs).toLocaleString('zh-CN');
}

/** 精确数值，带千分位（用于需要看清具体数字的地方） */
export function fmtExact(n) {
  if (!Number.isFinite(n)) return '∞';
  return Math.floor(n).toLocaleString('zh-CN');
}

/**
 * 去掉无意义的尾零。1.50 -> "1.5"，2.00 -> "2"
 *
 * ⚠ 只在小数点存在时才处理。旧实现直接跑 /\.?0+$/，
 * 会把整数的尾零也吃掉："100" -> "1"、"50" -> "5"。
 * 后果是所有 0 位小数的百分比全错——气血满值显示成 "1%"、
 * 50% 显示成 "5%"。这类 bug 不会抛异常，只会静静地显示错数字。
 */
export function trimZero(s) {
  if (typeof s !== 'string') s = String(s);
  if (!s.includes('.')) return s;
  return s.replace(/\.?0+$/, '');
}

/** 小数保留 n 位 */
export function fmtFloat(n, digits = 1) {
  return trimZero(n.toFixed(digits));
}

/** 百分比：0.753 -> "75%" */
export function fmtPct(v, digits = 0) {
  return trimZero((v * 100).toFixed(digits)) + '%';
}

/** 倍率：1.55 -> "×1.55" */
export function fmtMult(v, digits = 2) {
  return '×' + trimZero(v.toFixed(digits));
}

/** 秒 -> "3小时25分" / "12分30秒" */
export function fmtDuration(sec) {
  sec = Math.max(0, Math.floor(sec));
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (d > 0) return `${d}天${h > 0 ? h + '小时' : ''}`;
  if (h > 0) return `${h}小时${m > 0 ? m + '分' : ''}`;
  if (m > 0) return `${m}分${s > 0 && m < 10 ? s + '秒' : ''}`;
  return `${s}秒`;
}

/** 倒计时简写 "01:23:45" 或 "12:34" */
export function fmtClock(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (v) => String(v).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** 时间戳 -> "14:05" */
export function fmtTime(ts) {
  const d = new Date(ts);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

/** 灵石换算显示：1050 -> "1 中品 50 下品" */
export function fmtStones({ low = 0, mid = 0, high = 0 } = {}) {
  const parts = [];
  if (high > 0) parts.push(high + ' 上品');
  if (mid > 0) parts.push(mid + ' 中品');
  if (low > 0 || parts.length === 0) parts.push(low + ' 下品');
  return parts.join(' ');
}
