/**
 * 道侣系统自测（Node 直接运行，零依赖）
 *
 *   node tools/test_companion.mjs
 *
 * 覆盖：
 *  1. 未结识时 isMet 为假、不可读剧情
 *  2. 结识的境界门槛
 *  3. 羁绊达标才能解锁对应剧情节点；不达标时拒绝并说明差多少
 *  4. 羁绊上限 100 生效
 *  5. companionBonus 汇总正确（含同 kind 多档相加；未立道侣时为 0）
 *  6. echo 在轮回次数不足时不返回、达标后返回；读完不再返回
 *  7. 旧存档（无 companions 字段）经 mergeDefaults 可补齐；残缺字段递归补齐
 *  8. tickCompanions 的自然增长与奇遇 flag 同步
 *  9. 数据表结构自检（剧情段数 / 文案长度 / 加成 kind 合法）
 */

import { state, setState, createInitialState, realmAt } from '../src/core/state.js';
import { setSeed } from '../src/core/rng.js';
import { deserialize, mergeDefaults } from '../src/core/save.js';
import { COMPANIONS, companionById, companionsByRealm } from '../src/data/companions.js';
import {
  meet, isMet, bondOf, addBond, setActive, activeCompanion,
  availableStory, readStory, echoFor, companionBonus, companionsSummary,
  tickCompanions, BOND_MAX, BOND_INIT,
} from '../src/systems/companion.js';

let pass = 0;
let fail = 0;
const failures = [];

function ok(cond, name, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; failures.push(name); console.log(`  ✗ ${name}${detail ? '  → ' + detail : ''}`); }
}
function section(t) { console.log(`\n[${t}]`); }
function reset(seed = 7) {
  setSeed(seed);
  setState(createInitialState('测试者'));
  setSeed(seed);
}

const QW = 'cmp_qingwu';   // 沈青芜，metAt.realm 9
const LQ = 'cmp_luoqi';    // 洛七，metAt.realm 12
const YM = 'cmp_yunmian';  // 顾云眠，echo.minGen 3

// ============================================================
section('1. 未结识：isMet 为假、不可读剧情');
reset();
ok(!isMet(QW), '初始 isMet 为假');
ok(bondOf(QW) === 0, '初始羁绊为 0');
ok(availableStory(QW) === null, '未结识时 availableStory 返回 null');
const r1 = readStory(QW, 'st_1');
ok(!r1.ok && /尚未/.test(r1.reason), '未结识时读剧情被拒绝并说明原因', r1.reason);

// ============================================================
section('2. 结识的境界门槛');
reset();
const m0 = meet(QW);
ok(!m0.ok && /筑基初期/.test(m0.reason), '炼气期结识筑基道侣被拒绝并给出境界', m0.reason);
state.player.realmIndex = 9;
const m1 = meet(QW);
ok(m1.ok && isMet(QW), '达到境界后结识成功');
ok(bondOf(QW) === BOND_INIT, `结识赠送 ${BOND_INIT} 点羁绊`, String(bondOf(QW)));
ok(meet(QW).already === true, '重复结识是幂等的');

// ============================================================
section('3. 剧情羁绊门槛');
reset();
state.player.realmIndex = 9;
meet(QW);
const av1 = availableStory(QW);
ok(av1 && av1.id === 'st_1' && av1.unlocked, 'st_1（门槛 0）立即可读');
const rr1 = readStory(QW, 'st_1');
ok(rr1.ok && bondOf(QW) === BOND_INIT + 6, '读完 st_1 发放羁绊 +6', String(bondOf(QW)));
const rr1b = readStory(QW, 'st_1');
ok(!rr1b.ok && /已经记下/.test(rr1b.reason), '已读节点不可重复读', rr1b.reason);

const av2 = availableStory(QW);
ok(av2 && av2.id === 'st_2' && !av2.unlocked && av2.need === 25 - bondOf(QW),
  `st_2 未达标并算出还差 ${25 - bondOf(QW)} 点`);
const rr2 = readStory(QW, 'st_2');
ok(!rr2.ok && /还差 \d+ 点/.test(rr2.reason), '不达标时拒绝并说明差多少', rr2.reason);
addBond(QW, 25 - bondOf(QW));
const rr2b = readStory(QW, 'st_2');
ok(rr2b.ok, '羁绊达标后 st_2 可读');

// 顺序推进到最后一节
addBond(QW, 100);
for (const id of ['st_3', 'st_4', 'st_5']) {
  const r = readStory(QW, id);
  ok(r.ok, `羁绊满后 ${id} 可读`, r.reason || '');
}
ok(availableStory(QW) === null, '全部读完后 availableStory 返回 null');

// ============================================================
section('4. 羁绊上限 100');
reset();
state.player.realmIndex = 9;
meet(QW);
ok(addBond(QW, 9999) === BOND_MAX, 'addBond 超量被夹到 100', String(bondOf(QW)));
ok(addBond(QW, 50) === BOND_MAX, '已满时再加仍为 100');
ok(addBond(QW, -9999) === 0, '下溢夹到 0');
addBond(QW, 60);

// ============================================================
section('5. companionBonus 汇总');
reset();
ok(companionBonus('cultPct') === 0, '未立道侣时加成为 0');
state.player.realmIndex = 9;
meet(QW);
setActive(QW);
ok(activeCompanion()?.id === QW, 'activeCompanion 返回当前道侣');
addBond(QW, 100);
ok(companionBonus('cultPct') === 0.05, '沈青芜 cultPct=0.05', String(companionBonus('cultPct')));
ok(companionBonus('hpPct') === 0.08, '沈青芜 hpPct=0.08', String(companionBonus('hpPct')));
ok(companionBonus('luckAdd') === 6, '沈青芜 luckAdd=6', String(companionBonus('luckAdd')));
ok(companionBonus('atkPct') === 0, '未定义的 kind 返回 0');

// 同 kind 多档相加：洛七的 comprehensionAdd 在 20 与 100 各一档
meet(LQ, { force: true });
setActive(LQ);
addBond(LQ, 100);
ok(companionBonus('comprehensionAdd') === 3 + 5, '同 kind 多档相加 = 8', String(companionBonus('comprehensionAdd')));
addBond(LQ, -9999);
addBond(LQ, 20);
ok(companionBonus('comprehensionAdd') === 3, '仅统计已达成档位（20 时只 +3）');

// ============================================================
section('6. echo 跨世重逢门槛');
reset();
state.player.realmIndex = 9;
meet(QW);
state.reincarnation.count = 1;
ok(echoFor(QW) === null, '轮回 1 世（需 2 世）时不返回');
state.reincarnation.count = 2;
const e = echoFor(QW);
ok(e && e.id === 'echo' && e.unlocked, '轮回达 2 世后返回可触发的重逢');
const er = readStory(QW, 'echo');
ok(er.ok && er.echo === true, '跨世重逢可读');
ok(echoFor(QW) === null, '读完后不再返回');
ok(bondOf(QW) === BOND_INIT + e.gain, `重逢发放羁绊 +${e.gain}`, String(bondOf(QW)));

// 顾云眠需要 3 世
meet(YM, { force: true });
state.reincarnation.count = 2;
ok(echoFor(YM) === null, '顾云眠 2 世时仍不返回');
state.reincarnation.count = 3;
ok(!!echoFor(YM), '顾云眠 3 世时返回');

// ============================================================
section('7. 旧存档补齐');
const oldState = createInitialState('旧档');
delete oldState.companions;                    // 模拟 V3.x 存档：没有该字段
const restored = deserialize(JSON.stringify(oldState));
ok(!!restored.companions, 'mergeDefaults 补出 companions 字段');
ok(Array.isArray(restored.companions.met) && restored.companions.met.length === 0, 'met 默认空数组');
ok(restored.companions.active === null, 'active 默认 null');
ok(typeof restored.companions.bond === 'object', 'bond 默认对象');
ok(typeof restored.companions.stories === 'object', 'stories 默认对象');

// 残缺 companions（只有 met）走递归补齐
const partial = { companions: { met: [QW] } };
mergeDefaults(partial, createInitialState());
ok(Array.isArray(partial.companions.met) && partial.companions.met[0] === QW, '已有 met 不被覆盖');
ok(partial.companions.active === null && typeof partial.companions.bond === 'object', '缺失子字段被递归补齐');

// ============================================================
section('8. tickCompanions：自然增长与奇遇 flag 同步');
reset();
state.player.realmIndex = 9;
meet(QW);
setActive(QW);
const before = bondOf(QW);
const g = tickCompanions(600);          // 600 秒：立为道侣者 1/120 秒 → +5
ok(g === 5 && bondOf(QW) === before + 5, '立为道侣者 600 秒自然 +5', `gained=${g} bond=${bondOf(QW)}`);
addBond(QW, 100);
ok(tickCompanions(600) === 0, '已满羁绊不再增长');

// 未立的已结识者增长更慢
reset();
state.player.realmIndex = 9;
meet(QW);
ok(tickCompanions(900) === 1, '未立道侣者 900 秒自然 +1');

// 专属奇遇 flag → 自动结识
reset();
state.flags['cmp_met_cmp_baiqiao'] = true;
tickCompanions(1);
ok(isMet('cmp_baiqiao'), '奇遇 flag 经 tick 同步为已结识');
ok(state.companions.met.includes('cmp_baiqiao'), 'met 数组已写入');

// ============================================================
section('9. 数据表自检');
const KINDS = new Set(['cultPct', 'atkPct', 'defPct', 'hpPct', 'comprehensionAdd', 'luckAdd', 'daoHeartAdd']);
ok(COMPANIONS.length >= 4 && COMPANIONS.length <= 6, `道侣 ${COMPANIONS.length} 位（要求 4~6）`);
for (const c of COMPANIONS) {
  const badKind = (c.bondBonus || []).filter((t) => !KINDS.has(t.kind));
  ok(badKind.length === 0, `${c.name} bondBonus kind 合法`);
  ok((c.story || []).length >= 4 && (c.story || []).length <= 6, `${c.name} 剧情 ${c.story.length} 段（4~6）`);
  const short = (c.story || []).filter((s) => s.text.length < 200 || s.text.length > 400);
  ok(short.length === 0, `${c.name} 剧情文案均在 200~400 字`, short.map((s) => `${s.id}:${s.text.length}`).join(','));
  ok(!!c.echo && c.echo.text.length >= 150, `${c.name} 有跨世重逢段落（${c.echo?.text.length} 字）`);
  ok(c.metAt && Number.isFinite(c.metAt.realm), `${c.name} metAt 合法`);
}
ok(companionsByRealm(0).length === 0, '境界 0 时无可结识道侣');
ok(companionsByRealm(9).length === 2, '境界 9 时 2 位可结识');
ok(companionsByRealm(15).length === COMPANIONS.length, '境界 15 时全部可结识');
ok(companionById('nope') === null, 'companionById 未知 id 返回 null');

// 奇遇数据同构性：效果全部是已有 DSL 的 type
const DSL_TYPES = new Set(['cult', 'stones', 'material', 'pill', 'technique', 'equip', 'hp',
  'attr', 'buff', 'battle', 'lifespan', 'flag', 'stance']);
let encBad = 0;
for (const c of COMPANIONS) {
  for (const ch of c.encounter?.choices || []) {
    for (const o of ch.outcomes || []) {
      for (const ef of o.effects || []) if (!DSL_TYPES.has(ef.type)) encBad++;
    }
  }
}
ok(encBad === 0, '专属奇遇效果全部使用已有 DSL type');

// UI 汇总
const sum = companionsSummary();
ok(sum.list.length === COMPANIONS.length && Array.isArray(sum.list), 'companionsSummary 返回全部条目');
addBond(QW, 0);

// ============================================================
console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
if (failures.length) console.log('失败项：\n  - ' + failures.join('\n  - '));
process.exit(fail ? 1 : 0);
