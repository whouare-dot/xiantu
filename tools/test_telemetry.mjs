/**
 * 数值诊断采集自测（core/telemetry.js）。
 *
 * 采集器本身不影响玩法，但它有个别处没有的风险：**它可能悄悄采错**。
 * 采错的诊断数据比没有数据更糟——会拿它去改真实数值。
 * 所以这里测的重点依次是：
 *   1. 修为来源拆分的和**精确等于** stats.totalCultGained 的增量（自检的核心）
 *   2. 漏标来源会被显式记为「未知」，不会静默混进「修炼」
 *   3. 境界变化能被轮询捕获，停留时长的口径是"在线游戏秒"
 *   4. 修为扣减（不走 gainCult 的那几条路径）确实被记上
 *   5. 环境没有 localStorage / document 时不得抛错（node 下就是这种情况）
 *   6. 换档（重开此世）后基线重置，不会把两局的数据混在一起
 *
 * 用法: node tools/test_telemetry.mjs
 */

// localStorage 垫片：本模块在 node 下必须优雅降级，这里提供一个可控的假实现
const mem = new Map();
let storageOk = true;
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => {
    if (!storageOk) throw new Error('QuotaExceededError');
    mem.set(k, String(v));
  },
  removeItem: (k) => mem.delete(k),
};

const S = await import('../src/core/state.js');
const C = await import('../src/systems/cultivation.js');
const T = await import('../src/core/telemetry.js');

let failures = 0;
function check(name, cond, detail = '') {
  const ok = !!cond;
  if (!ok) failures++;
  console.log(`  ${ok ? '[OK]  ' : '[FAIL]'} ${name}${detail ? '  —— ' + detail : ''}`);
  return ok;
}
function section(t) {
  console.log('\n' + t);
  console.log('-'.repeat(64));
}

/** 换一局：重建 state 并重新初始化采集器 */
function freshRun() {
  S.setState(S.createInitialState());
  mem.clear();
  T.resetTelemetry();
  T.initTelemetry({ getBreakdown: () => C.cultSpeedBreakdown() });
}

/** 从导出结果里取事件数组 */
function events() {
  return JSON.parse(T.exportTelemetry()).events;
}
function summary() {
  return JSON.parse(T.exportTelemetry()).summary;
}
function selfCheck() {
  return JSON.parse(T.exportTelemetry()).selfCheck;
}

// ============================================================
section('1. 来源拆分之和 必须精确等于 修为总增量（自检核心）');

freshRun();
// 注意：炼气一层的 needCult 只有 900，这里四笔必须都塞得下，
// 否则后面的会被境界封顶截成 0——那是另一条用例（见 1b）。
C.tick(10);                                   // 走 cultivation.tick → 标「修炼」
C.gainCult(200, '战斗');
C.gainCult(300, '奇遇');
C.gainCult(100, '丹药');

const sc1 = selfCheck();
const sum1 = summary();
check('自检通过', sc1.ok, `按来源合计 ${sc1.sumBySource} vs 实际增量 ${sc1.actual}`);
check('「修炼」来源被记录', (sum1.cult['修炼'] || 0) > 0, `修炼 = ${sum1.cult['修炼']}`);
check('「战斗」来源被记录', sum1.cult['战斗'] === 200, `战斗 = ${sum1.cult['战斗']}`);
check('「奇遇」来源被记录', sum1.cult['奇遇'] === 300, `奇遇 = ${sum1.cult['奇遇']}`);
check('「丹药」来源被记录', sum1.cult['丹药'] === 100, `丹药 = ${sum1.cult['丹药']}`);
check('四个来源互不串味', Object.keys(sum1.cult).length === 4,
  Object.keys(sum1.cult).join(','));
check('来源里没有「未知」', !('未知' in sum1.cult), '未标注的发奖点会落到「未知」');

// ============================================================
section('1b. 撞到境界封顶时，记的是实际入账而不是请求值');

freshRun();
const cap = S.realm().needCult;
const cultBefore = S.state.player.cult;
const got = C.gainCult(cap * 3, '奇遇');
check('返回值被截断到境界上限', got === cap - cultBefore, `got = ${got}（上限 ${cap}）`);
const capped = summary().cult['奇遇'];
check('摘要记的是截断后的值', capped === cap - cultBefore, `奇遇 = ${capped}`);
check('没有按请求值记账', capped !== cap * 3, `请求值 ${cap * 3}`);

// ============================================================
section('2. 漏标来源会被显式记为「未知」，不混进「修炼」');

freshRun();
C.gainCult(777);                               // 故意不传 source
const sum2 = summary();
check('落到「未知」', sum2.cult['未知'] === 777, `未知 = ${sum2.cult['未知']}`);
check('没有混进「修炼」', !('修炼' in sum2.cult));
check('自检仍然通过', selfCheck().ok);

// ============================================================
section('3. 境界变化：轮询捕获 + 停留时长口径为在线游戏秒');

freshRun();
C.tick(60);                                    // 在线 60 秒
T.tickTelemetry(60);                           // 采集器推进同样多
const beforeRealm = S.state.player.realmIndex;
S.state.player.realmIndex = beforeRealm + 1;   // 模拟一次突破
T.tickTelemetry(1);

const realmEvs = events().filter((e) => e.ev === 'realm');
check('捕到一次境界变化', realmEvs.length === 1, `实际 ${realmEvs.length} 条`);
if (realmEvs.length) {
  const e = realmEvs[0];
  check('from / to 正确', e.from === beforeRealm && e.to === beforeRealm + 1,
    `${e.from} → ${e.to}`);
  check('stayPlay 是累计在线游戏秒（约 61s）', e.stayPlay >= 60 && e.stayPlay <= 62,
    `stayPlay = ${e.stayPlay}`);
  check('带上了离开时的倍率明细', !!e.multOut && !!e.multOut.sustained,
    JSON.stringify(e.multOut));
}

// ============================================================
section('4. 修为扣减（不走 gainCult 的路径）被记录');

freshRun();
C.tick(60);
const beforeLoss = S.state.player.cult;
C.gainCult(Math.floor(S.realm().needCult * 0.5), '修炼');
const mid = S.state.player.cult;
T.noteCultLoss('突破失败', 100);                // 直接调，模拟 breakthrough 的埋点
const l = summary().cultLoss;
check('扣减被归类到「突破失败」', l['突破失败'] === 100, JSON.stringify(l));
check('扣减不影响增量自检', selfCheck().ok,
  `扣减前 ${beforeLoss} / 中途 ${mid}`);

// ============================================================
section('5. 恶劣环境：localStorage 抛错 / 没有 document，都不得抛异常');

freshRun();
storageOk = false;                              // 让 setItem 一律抛配额错
let threw = null;
try {
  C.tick(5);
  T.tickTelemetry(5);
  T.noteCultGain('修炼', 1);
  T.exportTelemetry();
  T.telemetrySummary();
  T.initClickTracking();                        // node 下没有 document，应静默返回
} catch (e) { threw = e; }
check('localStorage 写失败 + 无 document 时不抛错', threw === null, threw ? String(threw) : '');
storageOk = true;

// ============================================================
section('6. 换档（重开此世）后基线重置，不混两局数据');

freshRun();
C.tick(30);
C.gainCult(1000, '战斗');
check('第一局自检通过', selfCheck().ok);

// 模拟「重开此世」：state 重建，但 localStorage 里还留着旧数据。
// createdAt 是存档身份，显式改掉以保证确定性（同毫秒内 createInitialState
// 可能产生相同的 createdAt，那样就测不出守卫了）。
S.setState(S.createInitialState());
S.state.meta.createdAt = (S.state.meta.createdAt || 0) + 1;
T.initTelemetry({ getBreakdown: () => C.cultSpeedBreakdown() });
const sc6 = selfCheck();
check('换档后旧数据被丢弃、基线重置', sc6.ok,
  `按来源 ${sc6.sumBySource} vs 实际 ${sc6.actual}`);
const sum6 = summary();
check('换档后不带上一局的来源累计',
  !Object.keys(sum6.cult).some((k) => sum6.cult[k] >= 1000),
  JSON.stringify(sum6.cult));

// ============================================================
section('7. 导出产物是合法 JSON 且结构完整');

freshRun();
C.tick(3);
const raw = T.exportTelemetry();
let parsed = null, ok7 = true;
try { parsed = JSON.parse(raw); } catch { ok7 = false; }
check('是合法 JSON', ok7);
check('有 meta / summary / selfCheck / events', !!(parsed?.meta && parsed?.summary
  && parsed?.selfCheck && parsed?.events), Object.keys(parsed || {}).join(','));
check('摘要文本可生成', typeof T.telemetrySummary() === 'string'
  && T.telemetrySummary().includes('修为来源构成'));

// ============================================================
section('8. 摘要与自检必须读同一份数据');

// 曾经的 bug：telemetrySummary 直接读 buf.events（不含尚未落盘的本小时），
// 而 selfCheck 走 collectEvents（含本小时）——于是摘要显示「无数据」，
// 自检却说「通过」，自相矛盾。实机验收时撞出来的。
// 注意：本段只能先调 telemetrySummary()，任何一次 export 都会先 flush，掩盖问题。
freshRun();
C.tick(20);
C.gainCult(150, '战斗');
const text = T.telemetrySummary();
check('摘要不是「无数据」', !text.includes('（无数据）'), text.split('\n')[5]);
check('摘要里出现「修炼」来源', text.includes('修炼'));
check('摘要里出现「战斗」来源', text.includes('战斗'));
check('摘要带上了当前所在境界', text.includes('当前所在'));

// ============================================================
section('9. 跨会话刷新：缺口折进基线，自检仍严格且缺口可见');

// 实机撞到的情形：游戏自动存档 30s 一次、采集落盘 60s 一次，两个节拍不同。
// 刷新页面会丢掉"采集最后落盘"到"存档最后写入"之间的尾段（实测一次 47 秒）。
// 这段不是漏采，必须折进基线，否则每次刷新自检都红；但也不能悄悄吃掉。
freshRun();
C.tick(20);
C.gainCult(200, '战斗');
T.exportTelemetry();                            // 模拟"采集已落盘"
S.state.stats.totalCultGained += 5000;          // 模拟"存档比采集多走了一段"
T.initTelemetry({ getBreakdown: () => C.cultSpeedBreakdown() });   // 模拟刷新

const sc9 = selfCheck();
const sum9 = summary();
check('刷新后自检仍然通过', sc9.ok, `按来源 ${sc9.sumBySource} vs 实际 ${sc9.actual}`);
check('缺口被计入 crossSessionDrift', sc9.crossSessionDrift === 5000,
  `drift = ${sc9.crossSessionDrift}`);
check('刷新前的来源累计没丢', (sum9.cult['战斗'] || 0) === 200
  && (sum9.cult['修炼'] || 0) > 0, JSON.stringify(sum9.cult));
check('缺口在摘要里显式列出', T.telemetrySummary().includes('跨会话缺口'));

// ============================================================
section('10. 突破与天劫事件被记录');

freshRun();
T.noteBreak({ success: false, chance: 0.44, failStreak: 1 });
T.noteBreak({ success: true, chance: 0.52, failStreak: 1 });
T.noteTrib({ passed: false, roundsTotal: 3, roundsReached: 1 });

const evs10 = events();
const brk = evs10.filter((e) => e.ev === 'break');
const tri = evs10.filter((e) => e.ev === 'trib');
check('突破事件记了 2 条', brk.length === 2, `实际 ${brk.length}`);
check('成功与失败都带成功率、连败数',
  brk.length === 2 && brk.every((e) => typeof e.chance === 'number' && typeof e.failStreak === 'number'),
  JSON.stringify(brk.map((e) => ({ s: e.success, c: e.chance, f: e.failStreak }))));
check('突破事件会跟着境界变化走', brk.length === 2 && brk.every((e) => typeof e.to === 'number'));
check('天劫事件带了轮次进度',
  tri.length === 1 && tri[0].roundsTotal === 3 && tri[0].roundsReached === 1,
  JSON.stringify(tri[0] || {}));

// ============================================================
console.log('\n' + '='.repeat(64));
if (failures === 0) {
  console.log('全部通过。');
  process.exit(0);
} else {
  console.log(`${failures} 项失败。`);
  process.exit(1);
}
