/**
 * V5.0 修炼曲线建模分析（只读分析，不改 src / tools 根目录）
 * ==========================================================
 * 复刻 tools/balance_sim.py 的 build_realms + validate 逻辑，
 * 用「零加成真实耗时 = needCult / baseSpeed / 60」量化每境时间占比，
 * 并验证 2~3 个候选调整方案。
 *
 * 运行： node tools/out/curve_analysis.mjs
 */

// ---------- 与 balance_sim.py 完全一致的策划输入 ----------
const REALM_NAMES = [
  '炼气一层','炼气二层','炼气三层','炼气四层','炼气五层','炼气六层','炼气七层','炼气八层','炼气九层',
  '筑基初期','筑基中期','筑基后期',
  '金丹初期','金丹中期','金丹后期',
  '元婴初期','元婴中期','元婴后期',
  '化神初期','化神中期','化神后期',
  '炼虚期','合体期','大乘期','渡劫期','飞升成仙',
];
const BASE_SPEED = [
  10,10,10,11,11,12,12,13,14,
  15,18,22,
  27,33,40,
  50,60,72,
  88,105,125,
  150,180,210,250,260,
];
const TARGET_MINUTES = [
  1.5,2,3,4,5,6.5,8,10,13,
  20,28,38,
  55,75,100,
  150,200,270,
  380,500,660,
  1000,1600,2500,4000,
  null,
];
// 大境界段边界（用于报告分组）：index 21..24 是「尾部墙」
const TAIL_FROM = 21;   // 最后 4 境：炼虚/合体/大乘/渡劫
const TUTORIAL_END = 8; // 0..8 炼气（教学期）

// ---------- 复刻 Python round_nice（含 banker's rounding）----------
function pyRound(x) { // Python 3 round()：四舍六入五取偶
  const f = Math.floor(x);
  const d = x - f;
  if (d < 0.5) return f;
  if (d > 0.5) return f + 1;
  return (f % 2 === 0) ? f : f + 1;
}
function roundNice(value, sig = 2) {
  if (value == null || value === 0) return 0;
  const exp = Math.floor(Math.log10(Math.abs(value)));
  const step = Math.pow(10, exp - (sig - 1));
  return Math.trunc(pyRound(value / step) * step);
}
function roundNiceMonotonic(values) {
  const out = []; let prev = null;
  for (const v of values) {
    if (v == null) { out.push(null); continue; }
    let r = roundNice(v);
    if (prev != null && r <= prev) {
      const exp = Math.floor(Math.log10(Math.abs(prev)));
      const step = Math.pow(10, exp - 1);
      r = prev + step;
    }
    out.push(r); prev = r;
  }
  return out;
}

// ---------- 复刻 build_realms ----------
function buildRealms(targets) {
  const rawNeed = targets.map((t, i) => (t == null ? null : BASE_SPEED[i] * t * 60));
  const need = roundNiceMonotonic(rawNeed);
  return need.map((nc, i) => {
    const t = targets[i], base = BASE_SPEED[i];
    let actual = null, err = null;
    if (t != null) { actual = nc / (base * 60); err = Math.abs(actual - t) / t * 100; }
    return { i, name: REALM_NAMES[i], baseSpeed: base, targetMinutes: t, needCult: nc, actualMinutes: actual, roundErrorPct: err };
  });
}

// ---------- 校验（复刻 balance_sim.validate 的关键项）----------
function validate(realms) {
  const errors = [];
  const c = (cond, msg) => { if (!cond) errors.push(msg); };
  const vals = realms.filter(r => r.needCult != null).map(r => r.needCult);
  for (let k = 1; k < vals.length; k++) c(vals[k] > vals[k-1], `needCult 非严格递增 @${k}: ${vals[k-1]}->${vals[k]}`);
  const acts = realms.filter(r => r.actualMinutes != null);
  for (let k = 1; k < acts.length; k++) c(acts[k].actualMinutes > acts[k-1].actualMinutes, `时长倒挂 @${k}`);
  for (const r of realms) if (r.roundErrorPct != null) c(r.roundErrorPct < 15, `${r.name} 圆整误差 ${r.roundErrorPct.toFixed(2)}%`);
  c(acts[0].actualMinutes <= 2.0, `教学期首境 ${acts[0].actualMinutes.toFixed(2)} 分 > 2 分（原守卫）`);
  c(acts[acts.length-1].actualMinutes >= 3000, `渡劫期 ${Math.round(acts[acts.length-1].actualMinutes)} 分 < 3000 分（原守卫）`);
  return errors;
}

// ---------- 指标 ----------
function metrics(realms) {
  const open = realms.filter(r => r.actualMinutes != null);
  const total = open.reduce((a, r) => a + r.actualMinutes, 0);
  const totalN = open.reduce((a, r) => a + r.needCult, 0);
  const share = (from, to) => open.filter(r => r.i >= from && r.i <= to).reduce((a, r) => a + r.actualMinutes, 0) / total;
  const needShare = (from, to) => open.filter(r => r.i >= from && r.i <= to).reduce((a, r) => a + r.needCult, 0) / totalN;
  const maxR = open.reduce((a, r) => (r.actualMinutes > a.actualMinutes ? r : a), open[0]);
  // 相邻跳变（墙指标）：含 教学期→筑基 那道
  let maxJump = 0, maxJumpAt = '';
  for (let k = 1; k < open.length; k++) {
    const j = open[k].actualMinutes / open[k-1].actualMinutes;
    if (j > maxJump) { maxJump = j; maxJumpAt = `${open[k-1].name}→${open[k].name}`; }
  }
  return {
    totalMinutes: total, totalDays: total / 1440,
    maxRealm: maxR.name, maxShare: maxR.actualMinutes / total,
    tail4Share: share(TAIL_FROM, 24),
    head22Share: share(0, 20), // 「前22境」= index 0..21，但 21 属尾部墙；另列 0..20
    headTo21: share(0, 21),
    tail5: share(21, 24),
    maxJump, maxJumpAt,
    tutorialJump: open[9].actualMinutes / open[8].actualMinutes, // 炼气九层→筑基初期
    shares: open.map(r => ({ i: r.i, name: r.name, t: r.actualMinutes, share: r.actualMinutes / total })),
  };
}

function fmt(m) { return m < 60 ? m.toFixed(1) + '分' : m < 1440 ? (m/60).toFixed(2) + '时' : (m/1440).toFixed(2) + '天'; }

function printTable(title, realms, note = '') {
  const M = metrics(realms);
  console.log('\n' + '='.repeat(84));
  console.log(title);
  if (note) console.log(note);
  console.log('='.repeat(84));
  console.log(`总时长 ${M.totalMinutes.toFixed(0)} 分 = ${(M.totalMinutes/60).toFixed(1)} 时 = ${M.totalDays.toFixed(2)} 天 ` +
    `| 单项最大 ${M.maxRealm} ${(M.maxShare*100).toFixed(1)}% | 尾4(21-24) ${(M.tail4Share*100).toFixed(1)}% | 前22(0-21) ${(M.headTo21*100).toFixed(1)}%`);
  console.log('-'.repeat(84));
  console.log(' #  境界        needCult     base  目标分    实际分    占比');
  for (const r of realms) {
    if (r.actualMinutes == null) { console.log(` ${String(r.i).padStart(2)}  ${r.name.padEnd(8)} ${'—'.padStart(11)}   ${String(r.baseSpeed).padStart(3)}   —（终点）`); continue; }
    console.log(` ${String(r.i).padStart(2)}  ${r.name.padEnd(8)} ${String(r.needCult).padStart(11)}   ${String(r.baseSpeed).padStart(3)}  ${r.targetMinutes.toFixed(1).padStart(7)}  ${r.actualMinutes.toFixed(1).padStart(8)}  ${(r.actualMinutes/ M.totalMinutes*100).toFixed(2).padStart(5)}%`);
  }
  const errs = validate(realms);
  console.log('-'.repeat(84));
  console.log(errs.length ? '校验：有告警 →\n  - ' + errs.join('\n  - ') : '校验：通过（严格递增 / 圆整<15% / 原两条守卫）');
  return M;
}

// =======================================================================
// 基线
// =======================================================================
console.log('《仙途》修炼曲线建模 — 零加成纯在线基准');
console.log('模型：needCult = roundNice2(baseSpeed × targetMinutes × 60)，真实耗时 = needCult/baseSpeed/60');
const base = buildRealms(TARGET_MINUTES);
const Mb = printTable('【基线】现有曲线（realms.js / realms.json）', base,
  `需求修为占比 vs 真实耗时占比——两者不同，因为速率随境界增长`);

// 需求 vs 时间占比对照（专门回答"45.7% 是需求占比，不是时间占比"）
{
  const open = base.filter(r => r.actualMinutes != null);
  const tn = open.reduce((a,r)=>a+r.needCult,0), tt = open.reduce((a,r)=>a+r.actualMinutes,0);
  console.log('\n[分位对照] 需求占比 ≠ 耗时占比');
  console.log('  渡劫期(index24)   needCult 占比 ' + (open[24].needCult/tn*100).toFixed(2) + '%   真实耗时占比 ' + (open[24].actualMinutes/tt*100).toFixed(2) + '%');
  console.log('  尾4境(index21-24) needCult 占比 ' + (open.filter(r=>r.i>=21).reduce((a,r)=>a+r.needCult,0)/tn*100).toFixed(2) + '%   真实耗时占比 ' + (open.filter(r=>r.i>=21).reduce((a,r)=>a+r.actualMinutes,0)/tt*100).toFixed(2) + '%');
  console.log('  前22境(index0-21) needCult 占比 ' + (open.filter(r=>r.i<=21).reduce((a,r)=>a+r.needCult,0)/tn*100).toFixed(2) + '%   真实耗时占比 ' + (open.filter(r=>r.i<=21).reduce((a,r)=>a+r.actualMinutes,0)/tt*100).toFixed(2) + '%');
}

// =======================================================================
// 方案甲：尾段等比压缩 + 中段等比抬升（总时长不变，只重分配）
//   i=21..24: t_i = t_20 * g^(i-20), g=1.35
//   i=9..20 : t_i *= u，u 由"总时长保持基线"解出
// =======================================================================
function planA(g = 1.30) {
  // 先解出中段抬升 u，再令尾部以「抬升后的 t20」为锚做等比，保证严格递增、无倒挂
  const qiSum = TARGET_MINUTES.slice(0, 9).reduce((a, b) => a + b, 0);
  const midSum = TARGET_MINUTES.slice(9, 21).reduce((a, b) => a + b, 0);
  const baseTotal = TARGET_MINUTES.filter(x => x != null).reduce((a, b) => a + b, 0);
  const gSum = g + g*g + g*g*g + g*g*g*g;             // g^1..g^4
  const u = (baseTotal - qiSum) / (midSum + TARGET_MINUTES[20] * gSum);
  const t = TARGET_MINUTES.slice();
  for (let i = 9; i <= 20; i++) t[i] = TARGET_MINUTES[i] * u;
  for (let i = 21; i <= 24; i++) t[i] = TARGET_MINUTES[20] * u * Math.pow(g, i - 20);
  return { t, params: `中段 index9-20 等比 u=${u.toFixed(3)} 抬升；尾段以抬升后 t20 为锚等比 g=${g}；总时长=基线` };
}

// =======================================================================
// 方案乙（推荐）：全曲线"相对幂律压缩" + 适度加长
//   i<=8 保持教学期不变；i>=9: t'_i = t_8 * (t_i/t_8)^β * S
//   β<1 压缩曲线动态范围（削平尾墙），S 由目标总时长解出（中前段整体抬升）
// =======================================================================
function planB(beta, targetMult) {
  const t = TARGET_MINUTES.slice();
  const t8 = TARGET_MINUTES[8];
  const scale = i => t8 * Math.pow(TARGET_MINUTES[i] / t8, beta);
  const scaled = [];
  for (let i = 9; i <= 24; i++) scaled.push(scale(i));
  const qiSum = TARGET_MINUTES.slice(0, 9).reduce((a, b) => a + b, 0);
  const openBaseTotal = TARGET_MINUTES.filter(x => x != null).reduce((a, b) => a + b, 0);
  const S = (targetMult * openBaseTotal - qiSum) / scaled.reduce((a, b) => a + b, 0);
  for (let i = 9; i <= 24; i++) t[i] = scale(i) * S;
  return { t, params: `β=${beta}（相对 t8=13 的幂律压缩），S=${S.toFixed(3)}（总时长 ×${targetMult}）` };
}

// =======================================================================
// 方案乙-平滑版：把加长因子 S 从 index0 起用 ρ 次曲线渐入，
//   消除「炼气九层→筑基初期」那道硬跳变（t0 仍=1.5，教学首境守卫不破）
//   i<=8 : t_i = T_i * (1+(S-1)*(i/8)^ρ)
//   i>=9 : t_i = (13*S) * (T_i/13)^β
// =======================================================================
function planB2(beta, targetMult, rho = 2) {
  const t = TARGET_MINUTES.slice();
  const openBaseTotal = TARGET_MINUTES.filter(x => x != null).reduce((a, b) => a + b, 0);
  const target = targetMult * openBaseTotal;
  const anchor = TARGET_MINUTES[8]; // 13
  // 先固定 β、把 S 作未知数：tutorialSum(S) + postSum(S) = target  =>  A*S + B*S... 线性
  // tutorial 项含 (1+(S-1)*w_i) = (1-w_i) + w_i*S；post 项含 S
  let linTut = 0, constTut = 0;
  for (let i = 0; i <= 8; i++) {
    const w = Math.pow(i / 8, rho);
    constTut += TARGET_MINUTES[i] * (1 - w);
    linTut += TARGET_MINUTES[i] * w;
  }
  let postUnit = 0; // 每单位 S 的 post 贡献
  for (let i = 9; i <= 24; i++) postUnit += anchor * Math.pow(TARGET_MINUTES[i] / anchor, beta);
  const S = (target - constTut) / (linTut + postUnit);
  for (let i = 0; i <= 8; i++) t[i] = TARGET_MINUTES[i] * (1 + (S - 1) * Math.pow(i / 8, rho));
  for (let i = 9; i <= 24; i++) t[i] = anchor * S * Math.pow(TARGET_MINUTES[i] / anchor, beta);
  return { t, params: `β=${beta}, 加长因子 S=${S.toFixed(3)}（总时长 ×${targetMult}），教学期渐入 ρ=${rho}，消除 8→9 硬跳变` };
}

// 同族极端：β 更小、更长
function planC(beta, targetMult) { return planB2(beta, targetMult, 2); }

// 输出候选
function show(name, res, note) {
  const realms = buildRealms(res.t);
  printTable(name, realms, note + ' | ' + res.params);
  console.log('  TARGET_MINUTES = ' + JSON.stringify(res.t.map(x => x == null ? null : Math.round(x * 10) / 10)));
  return realms;
}
const A = show('【方案甲】尾段等比压缩 + 中段抬升（总时长不缩短）', planA(1.30),
  '只重分配，不加长：把尾墙的时间搬给中段');
const B = show('【方案乙·推荐】全曲线相对幂律压缩 β=0.60，总时长 ×1.50（教学期渐入 ρ=2）', planB2(0.60, 1.50, 2),
  '教学期用 ρ=2 渐入加长，9 境起整条曲线按幂律压平，消除教学期→筑基硬跳变');
const C = show('【方案丙】更激进压平 β=0.50，总时长 ×1.60', planC(0.50, 1.60),
  '尾墙最平（渡劫期不再一家独大），代价是筑基后单境时长整体更厚、总时长最长');

// =======================================================================
// 汇总对比
// =======================================================================
const rows = [['基线', base], ['方案甲', A], ['方案乙(推荐)', B], ['方案丙', C]].map(([n, r]) => [n, metrics(r)]);
console.log('\n' + '='.repeat(84));
console.log('汇总对比（零加成基准；原守卫：教学首境 ≤2 分、渡劫期 ≥3000 分）');
console.log('='.repeat(84));
console.log('方案          总天数  单项最大(境/占比)    尾4(21-24) 前22(0-21) 最大相邻跳变  渡劫期');
for (const [n, m] of rows) {
  console.log(`${n.padEnd(13)} ${m.totalDays.toFixed(2).padStart(5)}  ${(m.maxRealm + ' ' + (m.maxShare*100).toFixed(1) + '%').padEnd(18)} ${(m.tail4Share*100).toFixed(1).padStart(7)}% ${(m.headTo21*100).toFixed(1).padStart(8)}%  ${(m.maxJump.toFixed(2) + 'x ' + m.maxJumpAt).padEnd(16)} ${(m.shares[24].t/1440).toFixed(2)}天`);
}

// β / 倍数 敏感性扫描：给"更平 vs 总时长"的取舍标尺
console.log('\n' + '='.repeat(84));
console.log('β 扫描（方案乙族，总时长倍数固定时，β 越小越平；教学期渐入 ρ=2）');
console.log('='.repeat(84));
console.log('  β    倍数   总天数   单项最大   尾4占比   前22占比  教学首境  渡劫期');
for (const mult of [1.30, 1.50]) {
  for (const beta of [0.85, 0.75, 0.68, 0.60, 0.52]) {
    const r = buildRealms(planB2(beta, mult, 2).t);
    const m = metrics(r);
    const errs = validate(r).length;
    console.log(`  ${beta.toFixed(2)}  ×${mult.toFixed(2)}  ${m.totalDays.toFixed(2).padStart(6)}  ${(m.maxShare*100).toFixed(1).padStart(7)}%  ${(m.tail4Share*100).toFixed(1).padStart(7)}%  ${(m.headTo21*100).toFixed(1).padStart(8)}%  ${m.shares[0].t.toFixed(2).padStart(7)}分  ${(m.shares[24].t/1440).toFixed(2).padStart(6)}天  ${errs ? '⚠' + errs : ''}`);
  }
}
console.log('\n注：实测通关基线为「零加成 8.08 天 → 地灵根×1.8 半优化 2天1小时」，实测与基准近似同比例；');
console.log('    本报告的基准总时长用 needCult 反算（8.10 天），与 balance_sim.py 用 targetMinutes 求和（8.08 天）差在圆整。');
