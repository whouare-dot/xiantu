/**
 * 战斗 / 奇遇 自测脚本（Node 直接运行，零依赖）
 *
 *   node tools/test_combat.mjs
 *
 * 覆盖：
 *  1. 同种子下 simulateBattle 结果可复现
 *  2. 玩家战败不发放任何掉落
 *  3. applyEffects 对负数 amount 正确扣减（灵石 / 属性 / 气血）
 *  4. 奇遇 req 门槛判定正确（attr / item / realm）
 *  5. battle 与奖励混排：战败则后续奖励不发，消耗仍生效
 *  6. 1000 场随机战斗无异常、无死循环（回合数 ≤ 上限）
 *  7. 三个 systems 文件不含 DOM 操作
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { state, setState, createInitialState, addPill, materialCount, pillCount, stonesToLow } from '../src/core/state.js';
import { setSeed } from '../src/core/rng.js';
import { buildPlayerSide, buildEnemySide, simulateBattle, autoResolve, ROUND_CAP, incomeScale } from '../src/systems/combat.js';
import { applyEffects, isChoiceAvailable, presentEncounter, rollEncounter, cultRewardScale, stoneRewardScale } from '../src/systems/encounter.js';
import { explore, canExplore, exploreCost } from '../src/systems/explore.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let pass = 0;
let fail = 0;
const failures = [];

function ok(cond, name, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; failures.push(name); console.log(`  ✗ ${name}${detail ? '  → ' + detail : ''}`); }
}
function section(t) { console.log(`\n[${t}]`); }
function reset(seed = 1) {
  setSeed(seed);
  setState(createInitialState('测试者'));
  setSeed(seed);
}

// ============================================================
section('1. 同种子战斗可复现');

reset(20240911);
const p1 = buildPlayerSide();
const e1 = buildEnemySide('en_yezhu', {});
setSeed(555);
const r1 = simulateBattle(p1, e1);
setSeed(555);
const r2 = simulateBattle(p1, e1);

ok(r1.winner === r2.winner, '胜者一致', `${r1.winner} vs ${r2.winner}`);
ok(r1.rounds.length === r2.rounds.length, '战报条数一致', `${r1.rounds.length} vs ${r2.rounds.length}`);
ok(JSON.stringify(r1.playerLeft) === JSON.stringify(r2.playerLeft), '玩家余血一致', JSON.stringify(r1.playerLeft));
ok(JSON.stringify(r1.enemyLeft) === JSON.stringify(r2.enemyLeft), '敌方余血一致', JSON.stringify(r1.enemyLeft));
ok(jsonEq(r1.rounds, r2.rounds), '逐条战报文本一致');

function jsonEq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

// 不同种子应产生不同结果（至少不是永远一样）
setSeed(1);
const a1 = simulateBattle(buildPlayerSide(), buildEnemySide('en_yezhu', {}));
setSeed(2);
const a2 = simulateBattle(buildPlayerSide(), buildEnemySide('en_yezhu', {}));
ok(JSON.stringify(a1.rounds) !== JSON.stringify(a2.rounds), '不同种子结果不同');

// ============================================================
section('2. 玩家战败不发放掉落');

reset(7);
// 造一个必败局：1 点血打强化 50 倍的强敌
state.player.hp = 1;
const matBefore = materialCount('mat_shougu');
const stonesBefore = stonesToLow();
const loss = autoResolve('en_heifengxiong', { hpMult: 1, atkMult: 50, silent: true });
ok(!loss.win, '确实战败', `winner=${loss.win}`);
ok(loss.rewards.stones === 0, '战败无灵石掉落', `stones=${loss.rewards.stones}`);
ok(Object.keys(loss.rewards.materials).length === 0, '战败无材料掉落');
ok(Object.keys(loss.rewards.pills || {}).length === 0, '战败无丹药掉落');
ok(materialCount('mat_shougu') === matBefore, '兽骨数量未变');
ok(stonesToLow() === stonesBefore, '灵石数量未变');
ok(state.stats.kills === 0, '击杀数未增加');
ok(state.player.hp >= 1, '战败留 1 点血不死');

// 胜利时确实会掉落（否则上面的"无掉落"可能只是掉落系统坏了）
reset(7);
let winSeen = false;
for (let i = 0; i < 50 && !winSeen; i++) {
  setSeed(i * 31 + 1);
  state.player.hp = state.player.maxHp;
  // 削弱到必能打赢，专门验证掉落路径
  const w = autoResolve('en_yezhu', { hpMult: 0.05, atkMult: 0.05, silent: true });
  if (w.win && w.rewards.stones > 0) winSeen = true;
}
ok(winSeen, '胜利时灵石掉落正常发放');

// ============================================================
section('3. applyEffects 负数 amount 正确扣减');

reset(3);
state.player.realmIndex = 0;
state.resources.stones = { low: 1000, mid: 0, high: 0 };
const beforeStones = stonesToLow();
const rNeg = applyEffects([{ type: 'stones', quality: 'low', amount: [-100, -100] }], { minRealm: 0 });
ok(stonesToLow() === beforeStones - 100, '灵石 -100 生效', `now=${stonesToLow()}（折下品，含进位）`);
ok(rNeg.rewards.stones === -100, 'rewards 记录负数灵石');
ok(rNeg.logs.some((l) => l.cls === 'event-bad'), '日志归类为 event-bad');

state.player.base.daoHeart = 10;
state.player.attributes.daoHeart = 5;
applyEffects([{ type: 'attr', attr: 'daoHeart', amount: [-3, -3] }], { minRealm: 0 });
ok(state.player.attributes.daoHeart === 2, '道心 -3 生效（5→2）', `now=${state.player.attributes.daoHeart}`);

// 属性不会被压到派生值为负
state.player.attributes.daoHeart = 1;
applyEffects([{ type: 'attr', attr: 'daoHeart', amount: [-999, -999] }], { minRealm: 0 });
ok(state.player.attributes.daoHeart === -state.player.base.daoHeart, '属性有下限但保留负值', `now=${state.player.attributes.daoHeart}`);

reset(3);
state.player.hp = 100;
state.player.maxHp = 100;
applyEffects([{ type: 'hp', amount: [-25, -25] }], { minRealm: 0 });
ok(state.player.hp === 75, '气血 -25 生效', `hp=${state.player.hp}`);

// 灵石不足时不应变负、不应抛异常
reset(3);
state.resources.stones = { low: 5, mid: 0, high: 0 };
const rPoor = applyEffects([{ type: 'stones', quality: 'low', amount: [-500, -500] }], { minRealm: 0 });
ok(state.resources.stones.low === 5, '灵石不足时不扣成负数', `low=${state.resources.stones.low}`);
ok(rPoor.logs.length > 0, '灵石不足有提示日志');

// ============================================================
section('4. 奇遇 req 门槛判定');

reset(4);
const attrChoice = { req: { attr: 'comprehension', min: 50 }, outcomes: [] };
let avail = isChoiceAvailable(attrChoice);
ok(!avail.ok, '悟性不足时判定不可选', avail.reason);
ok(avail.reason.includes('50'), '原因包含门槛值', avail.reason);

state.player.attributes.comprehension = 45; // base 10 + 45 = 55
avail = isChoiceAvailable(attrChoice);
ok(avail.ok, '悟性达标后可選');

const realmChoice = { req: { realm: 12 }, outcomes: [] };
ok(!isChoiceAvailable(realmChoice).ok, '境界不足时不可选');
state.player.realmIndex = 12;
ok(isChoiceAvailable(realmChoice).ok, '境界达标后可選');

const itemChoice = { req: { item: 'pill_powang', count: 1 }, outcomes: [] };
ok(!isChoiceAvailable(itemChoice).ok, '缺丹药时不可选');
addPill('pill_powang', 1);
ok(isChoiceAvailable(itemChoice).ok, '有丹药后可選');
ok(isChoiceAvailable({ req: null, outcomes: [] }).ok, '无 req 恒可选');

// presentEncounter 的 disabled / reason
const view = presentEncounter({
  id: 'x', title: 'T', desc: 'D', tier: 'good',
  choices: [{ text: 'A', hint: 'h', req: { attr: 'daoHeart', min: 999 }, outcomes: [] }, { text: 'B', hint: '', req: null, outcomes: [] }],
});
ok(view.choices[0].disabled === true && view.choices[0].reason.length > 0, 'presentEncounter 标记 disabled + reason');
ok(view.choices[1].disabled === false, '可选选项不标 disabled');

// ============================================================
section('5. battle 与奖励混排（战败不发后续奖励）');

reset(5);
state.player.hp = 1; // 必败
state.player.maxHp = 100;
state.player.realmIndex = 0;
const matB = materialCount('mat_lingzhi');
state.resources.stones = { low: 500, mid: 0, high: 0 };
const mixed = applyEffects([
  { type: 'battle', power: 140 },
  { type: 'material', id: 'mat_lingzhi', amount: [5, 5] },
  { type: 'stones', quality: 'low', amount: [-30, -30] },
], { minRealm: 0 });
ok(mixed.battle && mixed.battle.result && mixed.battle.result.win === false, 'battle 已结算且战败');
ok(materialCount('mat_lingzhi') === matB, '战败后正向材料奖励未发放');
ok(stonesToLow() === 470, '战败后负数消耗仍生效（500→470）', `low=${stonesToLow()}`);
ok(mixed.logs.some((l) => l.text.includes('未能到手')), '日志说明了奖励被截断');

// ============================================================
section('5b. simulateBattle 无副作用（自动服丹由 autoResolve 扣）');

reset(11);
addPill('pill_liaoshang', 1);
state.player.hp = 10; // 低于 20%，触发自动服丹
state.player.maxHp = 100;
setSeed(77);
const simOnly = simulateBattle(buildPlayerSide(), buildEnemySide('en_yezhu', { hpMult: 0.2, atkMult: 0.2 }));
ok(simOnly.pillsUsed && simOnly.pillsUsed.length === 1, '战报记录了拟服用的丹药');
ok(pillCount('pill_liaoshang') === 1, 'simulateBattle 不真的扣丹', `count=${pillCount('pill_liaoshang')}`);

reset(11);
addPill('pill_liaoshang', 1);
state.player.hp = 10;
state.player.maxHp = 100;
setSeed(77);
autoResolve('en_yezhu', { hpMult: 0.2, atkMult: 0.2, silent: true });
ok(pillCount('pill_liaoshang') === 0, 'autoResolve 真正扣除丹药', `count=${pillCount('pill_liaoshang')}`);

// ============================================================
section('6. 1000 场随机战斗压力测试');

reset(6);
let errors = 0;
let overCap = 0;
let maxRounds = 0;
let wins = 0;
let capped = 0;
const t0 = Date.now();
for (let i = 0; i < 1000; i++) {
  try {
    setSeed(i * 7919 + 3);
    const P = buildPlayerSide();
    // 混合难度：既有必败的强敌，也有削弱到可胜的，覆盖胜负两条路径
    const id = i % 3 === 0 ? 'en_yezhu' : i % 3 === 1 ? 'en_xueyaolang' : 'en_xunshan_yaojiang';
    const mult = i % 4 === 0 ? 0.05 : 1 + (i % 5) * 0.1;
    const E = buildEnemySide(id, { hpMult: mult, atkMult: mult });
    if (!P || !E) throw new Error('单位构建失败');
    const res = simulateBattle(P, E);
    if (!['player', 'enemy'].includes(res.winner)) throw new Error('非法胜者 ' + res.winner);
    if (!Number.isFinite(res.playerLeft.hp) || !Number.isFinite(res.enemyLeft.hp)) throw new Error('血量出现 NaN');
    if (res.rounds.length > ROUND_CAP * 4) overCap++;
    if (res.capped) capped++;
    maxRounds = Math.max(maxRounds, res.rounds.length);
    if (res.winner === 'player') wins++;
  } catch (err) {
    errors++;
    if (errors <= 3) console.log('    异常:', err.message);
  }
}
ok(errors === 0, '1000 场无异常', `errors=${errors}`);
ok(overCap === 0, `无死循环（单场战报条数 ≤ ${ROUND_CAP * 4}，实际最多 ${maxRounds}）`);
ok(maxRounds > 0 && maxRounds <= ROUND_CAP * 4, '战报条数在合理范围');
ok(capped >= 0 && capped <= 1000, `打满 ${ROUND_CAP} 回合的僵局场次数=${capped}`);
console.log(`    （用时 ${Date.now() - t0}ms，玩家胜率 ${(wins / 10).toFixed(1)}%）`);

// ============================================================
section('7. systems 层无 DOM 操作');

for (const f of ['combat.js', 'encounter.js', 'explore.js']) {
  const src = readFileSync(resolve(__dirname, '../src/systems', f), 'utf8');
  const hasDom = /\bdocument\s*\./.test(src) || /\bwindow\s*\./.test(src) || /\bquerySelector\b/.test(src);
  ok(!hasDom, `${f} 不含 DOM 操作`);
}

// ============================================================
section('附：境界缩放抽查');

reset(8);
console.log(`    炼气 baseSpeed/10 系数=${cultRewardScale().toFixed(2)}，灵石基线=${stoneRewardScale(0).toFixed(2)}x`);
state.player.realmIndex = 18;
console.log(`    化神 baseSpeed/10 系数=${cultRewardScale().toFixed(2)}，灵石相对炼气=${stoneRewardScale(0).toFixed(1)}x`);
ok(cultRewardScale() > 1, '高境界修为奖励有缩放');
ok(incomeScale(9) > incomeScale(0), '收入缩放随境界递增');

// ============================================================
console.log('\n========================================');
console.log(`通过 ${pass} 项，失败 ${fail} 项`);
if (fail > 0) {
  console.log('失败项：');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('全部通过。');
