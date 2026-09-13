/**
 * 奇遇选项收益审计。
 * 验证一个具体断言：「选项按收益从高到低排列，每次选第一个几乎最赚」。
 * 做法：给每个选项算期望收益，看「第一个选项」在本次奇遇中的排名分布。
 * 若无偏，排名应均匀分布。用法: node tools/audit_choices.mjs
 */
const { ENCOUNTERS } = await import('../src/data/encounters.js');

// 粗略估值（只为比较相对高低，不追求绝对值精确）
const VAL = { cult: 1, stonesLow: 1, hp: 2, attr: 60, lifespan: 8, buff: 40,
              material: 40, pill: 80, technique: 500, equip: 500, battle: -30, flag: 0 };

function effectValue(e) {
  const avg = (a) => Array.isArray(a) ? (a[0] + a[1]) / 2 : (a ?? 0);
  switch (e.type) {
    case 'cult':     return avg(e.amount) * (e.amount?.[0] < 0 ? 1 : VAL.cult);
    case 'stones': { const r = e.quality === 'high' ? 10000 : e.quality === 'mid' ? 100 : 1;
                     return avg(e.amount) * r; }
    case 'material': return avg(e.amount) * VAL.material;
    case 'pill':     return avg(e.amount) * VAL.pill;
    case 'technique':return VAL.technique;
    case 'equip':    return VAL.equip;
    case 'hp':       return avg(e.amount) * VAL.hp;
    case 'attr':     return avg(e.amount) * VAL.attr;
    case 'lifespan': return avg(e.amount) * VAL.lifespan;
    case 'buff':     return VAL.buff;
    case 'battle':   return VAL.battle;
    default:         return 0;
  }
}

function choiceEV(choice) {
  const outs = choice.outcomes || [];
  const total = outs.reduce((s, o) => s + (o.weight ?? 1), 0) || 1;
  let ev = 0;
  for (const o of outs) {
    const w = (o.weight ?? 1) / total;
    ev += w * (o.effects || []).reduce((s, e) => s + effectValue(e), 0);
  }
  return ev;
}

const rankCount = {};      // 第一个选项的排名分布
let multi = 0, firstIsBest = 0, ties = 0;

// 无偏期望的计算有三个坑，每个都踩过：
//   1. 不能取 1/最大名次——奇遇选项数不统一，2 选项时概率是 1/2 而非 1/3。
//   2. 不能一律取 1/选项数——**存在并列最优时**，显示第一位"恰为最优"的概率是
//      (并列项数 / 选项数)。道侣的 5 条专属奇遇两个选项收益相同，
//      若按 1/2 计就会低估期望，把正常的洗牌误判成"仍有位置偏差"。
//   3. 所以正确做法是：对每条奇遇取 (并列最优数 / 选项数)，再求平均。
let expectSum = 0;

for (const enc of ENCOUNTERS) {
  const cs = (enc.choices || []).filter((c) => !c.req);   // 只比无门槛的选项
  if (cs.length < 2) continue;
  multi++;
  const evs = cs.map(choiceEV);
  const best = Math.max(...evs);
  const nBest = evs.filter((v) => Math.abs(v - best) < 1e-9).length;
  expectSum += nBest / cs.length;
  const rank = evs.filter((v) => v > evs[0] + 1e-9).length + 1;  // 1 = 最高
  rankCount[rank] = (rankCount[rank] || 0) + 1;
  if (evs[0] >= best - 1e-9) { firstIsBest++; if (evs.filter(v => Math.abs(v - evs[0]) < 1e-9).length > 1) ties++; }
}
const UNBIASED = expectSum / Math.max(1, multi) * 100;

console.log(`参与统计的奇遇（≥2 个无门槛选项）：${multi} 条\n`);
console.log('【一】原始数据顺序（文案作者的编写顺序）');
console.log('「第一个选项」在本次奇遇中的收益排名分布：');
const maxRank = Math.max(...Object.keys(rankCount).map(Number));
for (let r = 1; r <= maxRank; r++) {
  const n = rankCount[r] || 0;
  const pct = (n / multi * 100);
  const bar = '█'.repeat(Math.round(pct / 2));
  console.log(`  第 ${r} 名  ${String(n).padStart(3)} 条  ${pct.toFixed(1).padStart(5)}%  ${bar}`);
}
const rawBest = (firstIsBest / multi * 100);
console.log(`\n  第一个选项即最优：${firstIsBest} / ${multi} = ${rawBest.toFixed(1)}%（其中并列 ${ties} 次）`);
console.log(`  无偏期望（各局「并列最优数/选项数」的均值）：${UNBIASED.toFixed(1)}%`);
console.log(`  → 结论：${rawBest > UNBIASED * 1.15 ? '⚠ 存在明显的编写顺序偏差（这正是要修的）' : '无明显偏差'}`);

// ============ 二、打乱之后，位置还能不能泄露信息 ============
// 系统在 queueEncounter 时会对选项做 Fisher-Yates 洗牌，
// 这里用同样的算法模拟多次，验证"显示在第一位的选项"不再系统性地更优。
console.log('\n【二】打乱显示顺序之后（模拟 3000 次）');
{
  const { shuffle, setSeed } = await import('../src/core/rng.js');
  setSeed(20260911);
  let shownBest = 0, shownCount = 0;
  const shownRank = {};

  for (let round = 0; round < 3000; round++) {
    for (const enc of ENCOUNTERS) {
      const cs = (enc.choices || []).filter((c) => !c.req);
      if (cs.length < 2) continue;
      const evs = cs.map(choiceEV);
      const perm = shuffle(cs.map((_, i) => i));
      const firstIdx = perm[0];
      const rank = evs.filter((v) => v > evs[firstIdx] + 1e-9).length + 1;
      shownRank[rank] = (shownRank[rank] || 0) + 1;
      if (rank === 1) shownBest++;
      shownCount++;
    }
  }
  const mr = Math.max(...Object.keys(shownRank).map(Number));
  for (let r = 1; r <= mr; r++) {
    const n = shownRank[r] || 0;
    const pct = (n / shownCount * 100);
    console.log(`  第 ${r} 名  ${pct.toFixed(1).padStart(5)}%  ${'█'.repeat(Math.round(pct / 2))}`);
  }

  const expect = UNBIASED;   // 复用上面算好的无偏期望
  const pctBest = shownBest / shownCount * 100;
  const diff = Math.abs(pctBest - expect);
  console.log(`\n  显示在第一位的选项恰是最优的概率：${pctBest.toFixed(1)}%`);
  console.log(`  理论期望（各局「并列最优数/选项数」的均值）：${expect.toFixed(1)}%`);
  console.log(`  偏差：${diff.toFixed(1)} 个百分点`);
  const ok = diff < 3;
  console.log(`  → 验收：${ok ? '✓ 通过，位置不再携带收益信息' : '✗ 未通过，仍存在位置偏差'}`);
  process.exitCode = ok ? 0 : 1;
}
