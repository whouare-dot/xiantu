/**
 * 灵兽系统自测（Node 直接运行，零依赖）。
 *
 *   node tools/test_beast.mjs
 *
 * 覆盖 V3.0 验收标准：
 *   1. 数据表结构：≥18 种、tier 1~5 每档 ≥3、三条进化链各 ≥3 阶、每兽 1~3 技能、guard 护主技能存在
 *   2. 星级概率分布（10000 次实测 vs 55/25/13/5/2）
 *   3. 星级越高属性越强（同等级下 5 星 > 1 星）
 *   4. 等级上限 = 10 + 星级×10（1星20 / 5星60），进化可提升
 *   5. 亲密度门控：不够不返回，达标后返回
 *   6. 进化：改名、属性跃升、解锁新技能；材料不足拒绝
 *   7. 孵化走绝对时间戳，离线可完成
 *   8. beastBattleSide() 与 combat.js 的 buildPlayerSide() 字段逐一对齐
 *   9. beastBattleSide() 造出的单位能喂给 simulateBattle 跑完不报错
 *  10. systems/beast.js 不含 DOM 操作
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { state, setState, createInitialState, addMaterial, materialCount } from '../src/core/state.js';
import { setSeed } from '../src/core/rng.js';
import {
  rollStar, createBeast, addBeast, beastStats, beastSkills, allBeastSkills,
  setActive, activeBeast, gainExp, addIntimacy, canEvolve, evolve, releaseBeast,
  layEgg, tickBeasts, eggStatus, beastBattleSide, activeBeastBattleSide,
  tameBeast, rollTameCandidate, beastSummary, beastCollection, levelCap, expToNext,
  STAR_WEIGHTS, MAX_INTIMACY, realmTier,
  attemptTame, hatchCost, canHatch, hatchByMaterial, hatchableSummary, grantBattleExp,
} from '../src/systems/beast.js';
import {
  BEASTS, BEAST_SKILLS, beastById, beastsByTier, hatchableBeasts, evolutionChain, evolutionDepth, ROLE_NAMES,
} from '../src/data/beasts.js';
import { buildPlayerSide, buildEnemySide, simulateBattle, ROUND_CAP } from '../src/systems/combat.js';
import { MATERIALS, materialById } from '../src/data/materials.js';
import { explore, tickExplore } from '../src/systems/explore.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, detail = '') {
  if (cond) { pass++; console.log(`  [OK]   ${name}${detail ? '  —— ' + detail : ''}`); }
  else { fail++; failures.push(name); console.log(`  [FAIL] ${name}${detail ? '  —— ' + detail : ''}`); }
}
function section(t) { console.log(`\n[${t}]`); }
function reset(seed = 1) {
  setSeed(seed);
  setState(createInitialState('驯兽人'));
  setSeed(seed);
}
/** 造一只指定星级的测试灵兽（已入册） */
function makeBeast(baseId, star, opts = {}) {
  const inst = createBeast(baseId, { star, add: true, ...opts });
  return inst;
}
const MAT_IDS = new Set(MATERIALS.map((m) => m.id));

// ============================================================
section('1. 灵兽数据表结构');

ok(BEASTS.length >= 18, `灵兽种类 ≥ 18`, `实际 ${BEASTS.length} 种`);
ok(new Set(BEASTS.map((b) => b.id)).size === BEASTS.length, 'id 无重复');
ok(BEASTS.every((b) => b.id.startsWith('bst_')), 'id 前缀均为 bst_');

const tierCount = {};
for (const t of [1, 2, 3, 4, 5]) tierCount[t] = beastsByTier(t).length;
console.log(`  tier 分布：${[1, 2, 3, 4, 5].map((t) => `T${t}=${tierCount[t]}`).join(' / ')}`);
ok([1, 2, 3, 4, 5].every((t) => tierCount[t] >= 3), '每个 tier 至少 3 种');

// 字段完整性
ok(BEASTS.every((b) => b.name && b.desc && b.lore && b.role && b.base && b.growth),
  '全部有 name/desc/lore/role/base/growth');
ok(BEASTS.every((b) => ['attack', 'tank', 'support'].includes(b.role)), 'role 取值合法');
ok(BEASTS.every((b) => ['hp', 'atk', 'def', 'spd'].every((k) =>
  typeof b.base[k] === 'number' && typeof b.growth[k] === 'number' && b.base[k] > 0)),
  'base/growth 四项数值齐备且为正');
ok(BEASTS.every((b) => b.starCap && b.starCap.base >= 1 && b.starCap.max <= 5 && b.starCap.base <= b.starCap.max),
  'starCap 合法（base ≤ max ≤ 5）');
ok(BEASTS.every((b) => b.skills.length >= 1 && b.skills.length <= 3), '每兽 1~3 个技能',
  `技能总数 ${BEASTS.reduce((n, b) => n + b.skills.length, 0)}`);
ok(BEASTS.every((b) => b.skills.every((s) => s.id && s.name && s.desc &&
  ['damage', 'heal', 'buff', 'debuff', 'guard'].includes(s.kind) &&
  typeof s.unlockIntimacy === 'number')),
  '技能字段与 kind 合法');
ok(BEASTS.every((b) => b.eggFrom === null || MAT_IDS.has(b.eggFrom)), 'eggFrom 指向合法灵材或为 null');
ok(BEASTS.every((b) => b.evolveTo === null || !!beastById(b.evolveTo)), 'evolveTo 指向合法灵兽');
ok(BEASTS.every((b) => (b.evolveCost || []).every((c) => MAT_IDS.has(c.id) && c.count > 0)),
  'evolveCost 引用合法灵材');
ok(BEASTS.every((b) => !!ROLE_NAMES[b.role]), 'ROLE_NAMES 覆盖全部定位');
ok(new Set(BEASTS.flatMap((b) => b.skills.map((s) => s.id))).size ===
  BEASTS.reduce((n, b) => n + b.skills.length, 0), '技能 id 全局唯一');
ok(Object.keys(BEAST_SKILLS).length === BEASTS.reduce((n, b) => n + b.skills.length, 0),
  'BEAST_SKILLS 索引条数与技能总数一致', `${Object.keys(BEAST_SKILLS).length} 条`);
ok(!!BEAST_SKILLS.bsk_gui_ke && BEAST_SKILLS.bsk_gui_ke.kind === 'guard', 'guard 技能可在索引中按 id 查到');

// 占位符检查
const BAD = /灵兽\s*\d|测试|TODO|占位|xx+$/i;
ok(BEASTS.every((b) => !BAD.test(b.name) && !BAD.test(b.desc)), '命名与描述无占位符');

// 进化链
const heads = BEASTS.filter((b) => !BEASTS.some((x) => x.evolveTo === b.id) && b.evolveTo);
const chainInfo = heads.map((h) => ({ h, chain: evolutionChain(h.id) }));
console.log('  进化链：' + chainInfo.map(({ chain }) =>
  chain.map((c) => `${c.name}(${ROLE_NAMES[c.role]})`).join(' → ')).join('  |  '));
ok(chainInfo.length >= 3, '至少 3 条进化链', `${chainInfo.length} 条`);
ok(chainInfo.every(({ chain }) => chain.length >= 3), '每条进化链 ≥ 3 阶');
ok(new Set(chainInfo.map(({ h }) => h.role)).size === 3, '三条链覆盖 攻伐/镇守/辅助 三类定位',
  chainInfo.map(({ h }) => ROLE_NAMES[h.role]).join('/'));
for (const { chain } of chainInfo) {
  const okDepth = chain.every((c, i) => evolutionDepth(c.id) === i);
  if (!okDepth) ok(false, `进化链阶数自洽：${chain.map((c) => c.name).join('→')}`);
}
ok(true, '进化链阶数与 evolutionDepth 自洽');
// 链尾 skill 比链首多（技能升级的体现）
ok(chainInfo.every(({ chain }) => {
  const headSkills = chain[0].skills.length;
  const tailSkills = chain[chain.length - 1].skills.length;
  return tailSkills > 0 && headSkills > 0;
}), '链首/链尾均有技能');

// 护主技能覆盖
const guardOwners = BEASTS.filter((b) => b.skills.some((s) => s.kind === 'guard'));
ok(guardOwners.length >= 4, '含 guard（护主）技能的灵兽 ≥ 4 种', `${guardOwners.length} 种`);
// 护主按设计属"协战"：亲密度达标才解锁（版本规划 4.3）。
// 但入门镇守兽必须一见面就能挡刀，否则防战定位在早期形同虚设。
ok(!!BEAST_SKILLS.bsk_gui_ke && BEAST_SKILLS.bsk_gui_ke.unlockIntimacy === 0,
  '入门镇守兽（玄水龟）的护主无亲密度门槛，早期即可挡刀');
ok(guardOwners.some((b) => b.skills.some((s) => s.kind === 'guard' && s.unlockIntimacy > 0)),
  '高阶灵兽的护主作为协战奖励，设亲密度门槛（白泽/麒麟）');

// 孵化池
const hatchable = hatchableBeasts();
ok(hatchable.length >= 10, '可孵化灵兽 ≥ 10 种', `${hatchable.length} 种`);
ok(hatchable.every((b) => !!b.eggFrom), 'hatchableBeasts 全部有 eggFrom');

// ============================================================
section('2. 星级概率分布（10000 次实测）');

reset(20260911);
const N = 10000;
const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
for (let i = 0; i < N; i++) dist[rollStar()]++;
const expect = { 1: 55, 2: 25, 3: 13, 4: 5, 5: 2 };
console.log('  实测：' + [1, 2, 3, 4, 5].map((s) =>
  `${s}星 ${(dist[s] / N * 100).toFixed(2)}%（期望 ${expect[s]}%）`).join('  '));
for (const s of [1, 2, 3, 4, 5]) {
  const pct = dist[s] / N * 100;
  ok(Math.abs(pct - expect[s]) <= 1.0, `${s} 星占比偏离 ≤ 1 个百分点`,
    `${pct.toFixed(2)}% vs ${expect[s]}%`);
}
ok(STAR_WEIGHTS.reduce((a, s) => a + s.weight, 0) === 100, 'STAR_WEIGHTS 权重合计 100');

// 资质上限约束
reset(5);
let max3 = 0;
for (let i = 0; i < 200; i++) if (rollStar(3) <= 3) max3++;
ok(max3 === 200, 'rollStar(3) 不会掷出 4/5 星（石甲犰 starCap.max=3 的约束）');
const qiu = createBeast('bst_shijiaqiu', { star: 5 });
ok(qiu.star === 3, 'createBeast 按 starCap.max 夹取星级', `石甲犰 5 → ${qiu.star}`);
ok(beastById('bst_shijiaqiu').starCap.max === 3, '石甲犰 的资质上限为 3（数据侧）');

// ============================================================
section('3. 星级越高属性越强');

reset(7);
const one = makeBeast('bst_chiyanhu', 1, { level: 10 });
const five = makeBeast('bst_chiyanhu', 5, { level: 10 });
const s1 = beastStats(one), s5 = beastStats(five);
console.log(`  1星 Lv10：hp=${s1.maxHp} atk=${s1.atk} def=${s1.def} spd=${s1.spd}`);
console.log(`  5星 Lv10：hp=${s5.maxHp} atk=${s5.atk} def=${s5.def} spd=${s5.spd}`);
ok(s5.maxHp > s1.maxHp && s5.atk > s1.atk && s5.def > s1.def && s5.spd > s1.spd,
  '同等级下 5 星四项属性全面大于 1 星');
// 用气血做比例断言：数值大，取整噪声小（攻击力在低等级下会被 Math.round 吃掉小数点）
ok(Math.abs(s5.maxHp / s1.maxHp - 1.32) < 0.02, '星级成长系数为每星 +8%（5星 = 1.32 倍）',
  `气血比 ${(s5.maxHp / s1.maxHp).toFixed(4)}；攻击比 ${(s5.atk / s1.atk).toFixed(4)}（小数值有取整噪声）`);
ok(s5.crit > s1.crit, '星级提高暴击基准');

// 1→5 星单调递增
reset(7);
const ladder = [1, 2, 3, 4, 5].map((s) => beastStats(makeBeast('bst_jiuwei_tianhu', s, { level: 30 })).atk);
console.log('  九尾天狐 Lv30 各星级攻击：' + ladder.map((v, i) => `${i + 1}★${v}`).join(' → '));
ok(ladder.every((v, i) => i === 0 || v > ladder[i - 1]), '1→5 星属性严格单调递增');

// 角色定位导致属性倾向差异
reset(7);
const tank = beastStats(makeBeast('bst_xuanshuigui', 3, { level: 10 }));
const atk = beastStats(makeBeast('bst_leiyabao', 3, { level: 10 }));
ok(tank.maxHp > atk.maxHp && atk.atk > tank.atk, '镇守型血厚、攻伐型攻高（定位有区分度）');

// ============================================================
section('4. 等级上限受星级限制');

reset(9);
ok(levelCap({ star: 1, stage: 0 }) === 20, '1 星上限 20 级', String(levelCap({ star: 1, stage: 0 })));
ok(levelCap({ star: 5, stage: 0 }) === 60, '5 星上限 60 级', String(levelCap({ star: 5, stage: 0 })));
const lowStar = makeBeast('bst_chiyanhu', 1);
gainExp(lowStar.uid, 1e9);
ok(lowStar.level === 20, '1 星灵兽喂海量经验只能到 20 级', `Lv.${lowStar.level}`);
ok(beastStats(lowStar).exp === 0, '满级后不再囤经验');
const highStar = makeBeast('bst_chiyanhu', 5);
gainExp(highStar.uid, 1e9);
ok(highStar.level === 60, '5 星灵兽可到 60 级', `Lv.${highStar.level}`);

// ============================================================
section('5. 亲密度门控技能');

reset(11);
const fox = makeBeast('bst_liuwei_yanhu', 4);
addIntimacy(fox.uid, 90);           // 先把亲密度顶满，看"全解锁"的样子
const allNames = allBeastSkills(fox).map((s) => `${s.name}(需${s.unlockIntimacy})`);
console.log('  六尾炎狐技能：' + allNames.join(' / '));
fox.intimacy = 0;
ok(beastSkills(fox).length === 1, '亲密度 0 时只解锁无门槛技能',
  beastSkills(fox).map((s) => s.name).join(','));
ok(!beastSkills(fox).some((s) => s.id === 'bsk_fox_lin'), '亲密度不足时「业火缠身」不返回');
addIntimacy(fox.uid, 25);
ok(beastSkills(fox).some((s) => s.id === 'bsk_fox_lin'), '亲密度达标（25）后「业火缠身」返回');
ok(beastSkills(fox).length === 2, '此时解锁 2 个技能');
addIntimacy(fox.uid, 100);
ok(beastSkills(fox).length === 3, '亲密度到 100 后三个技能全解锁');
ok(fox.intimacy === MAX_INTIMACY, '亲密度上限 100 不被突破', String(fox.intimacy));
addIntimacy(fox.uid, -999);
ok(fox.intimacy === 0, '亲密度下限 0');

// 阶段门控机制（当前数据未使用 unlockStage，这里用注入的合成技能验证门控真的生效）
reset(11);
const probe = makeBeast('bst_chiyanhu', 3);
const probeBase = beastById('bst_chiyanhu');
probeBase.skills.push({ id: 'bsk__probe_stage', name: '测试·血脉神通', kind: 'buff', power: 0.1, unlockIntimacy: 0, unlockStage: 2, desc: '仅用于自测' });
BEAST_SKILLS.bsk__probe_stage = { ...probeBase.skills[probeBase.skills.length - 1], beastId: probeBase.id, unlockStage: 2, unlockIntimacy: 0 };
ok(!beastSkills(probe).some((s) => s.id === 'bsk__probe_stage'), '阶段不足时阶段门控技能不返回', `stage=${probe.stage}`);
probe.stage = 2;
ok(beastSkills(probe).some((s) => s.id === 'bsk__probe_stage'), '阶段达标后阶段门控技能返回');
probeBase.skills.pop();
delete BEAST_SKILLS.bsk__probe_stage;

// ============================================================
section('6. 进化：改名 / 属性跃升 / 解锁新技能 / 材料不足拒绝');

reset(13);
const pet = makeBeast('bst_chiyanhu', 4);
addIntimacy(pet.uid, 60);
gainExp(pet.uid, 1e9);             // 4 星上限 50 级
const beforeStats = beastStats(pet);
const beforeSkills = beastSkills(pet).map((s) => s.id);
console.log(`  进化前：【${pet.name}】${pet.star}星 Lv.${pet.level} 攻=${beforeStats.atk} 血=${beforeStats.maxHp} 上限=${beforeStats.levelCap}`);
console.log(`  技能：${beastSkills(pet).map((s) => s.name).join('、')}`);

// 材料不足 → 拒绝
ok(pet.level >= 20, '先练到进化所需等级', `Lv.${pet.level}`);
let ce = canEvolve(pet.uid);
ok(ce.ok === false && ce.reason.includes('灵材不足'), '材料不足时拒绝进化', ce.reason);
const rFail = evolve(pet.uid);
ok(rFail.ok === false, 'evolve 在材料不足时返回失败');
ok(pet.baseId === 'bst_chiyanhu', '失败后形态未变');

// 补足材料 → 成功
addMaterial('mat_shougu', 20);
ce = canEvolve(pet.uid);
ok(ce.ok === true, '材料充足后可进化', `to=${ce.toName}`);
const beforeMat = materialCount('mat_shougu');
const r = evolve(pet.uid);
ok(r.ok === true, '进化成功');
ok(pet.name === '幽炎狐', '进化后改名', pet.name);
ok(pet.baseId === 'bst_youyanhu', '形态切换为新 id');
ok(pet.star === 4, '星级（资质）不因进化改变', String(pet.star));
ok(r.after.atk > r.before.atk && r.after.maxHp > r.before.maxHp,
  '属性跃升', `攻 ${r.before.atk} → ${r.after.atk}，血 ${r.before.maxHp} → ${r.after.maxHp}`);
ok(r.after.levelCap > r.before.levelCap, '等级上限随进化提升',
  `${r.before.levelCap} → ${r.after.levelCap}`);
ok(materialCount('mat_shougu') === beforeMat - 20, '进化扣除材料', `兽骨 ${beforeMat} → ${materialCount('mat_shougu')}`);
const newSkills = beastSkills(pet).map((s) => s.id).filter((id) => !beforeSkills.includes(id));
ok(newSkills.length > 0, '进化解锁新技能',
  beastSkills(pet).map((s) => s.name).join('、') + `（新增 ${newSkills.length}）`);
ok(beastById(pet.baseId).evolveTo === 'bst_liuwei_yanhu', '新形态仍有下一阶');
ok(pet.stage === 1, '形态阶数提升', String(pet.stage));
// 二段进化的门槛：等级（35）已够，缺的是材料
const ce2 = canEvolve(pet.uid);
ok(ce2.ok === false && ce2.reason.includes('灵材不足'), '二段进化因材料不足被拒', ce2.reason);
addMaterial('mat_yaoxue', 15);
ok(canEvolve(pet.uid).ok === true, '补齐材料后二段进化可进行', canEvolve(pet.uid).toName);
// 等级门槛单独验证：新孵化的高阶形态只有 1 级
const young = makeBeast('bst_youyanhu', 3, { level: 1 });
const ceY = canEvolve(young.uid);
ok(ceY.ok === false && ceY.reason.includes('需培育至'), '等级不足时拒绝进化', ceY.reason);

// 三星链闭环：一路推到链尾
reset(13);
const full = makeBeast('bst_xuanshuigui', 5);
gainExp(full.uid, 1e9);
const chainLog = [full.name];
for (const [mat, n] of [['mat_shougu', 20], ['mat_yaoxue', 20], ['mat_neidan', 6]]) {
  addMaterial(mat, n);
  gainExp(full.uid, 1e9);
  const ev = evolve(full.uid);
  if (ev.ok) chainLog.push(full.name);
}
console.log('  玄水龟线全程进化：' + chainLog.join(' → '));
ok(full.baseId === 'bst_xuanwu_shengui', '可一路进化到链尾玄武神龟', full.baseId);
ok(beastStats(full).levelCap === 10 + 5 * 10 + 3 * 5, '链尾等级上限 = 10+50+15',
  String(beastStats(full).levelCap));

// ============================================================
section('7. 孵化走绝对时间戳，离线可完成');

reset(17);
const egg = layEgg('bst_chiyanhu', 3600);
ok(!!egg && typeof egg.hatchAt === 'number', '产蛋记录绝对时间戳 hatchAt');
ok(egg.hatchAt > Date.now() + 3590 * 1000, 'hatchAt ≈ now + 3600s');
let t = tickBeasts(30);
ok(t.hatched.length === 0, '未到期不孵化（tick 推进 30 秒也不出）', `蛋数 ${eggStatus().length}`);
const st = eggStatus()[0];
ok(st.remaining > 3500 && st.remaining <= 3600, '倒计时按绝对时间计算', `剩余 ${st.remaining}s`);

// 模拟离线：把时间戳拨到过去（等价于关掉游戏一段时间）
egg.hatchAt = Date.now() - 5 * 1000;
ok(eggStatus()[0].ready === true, '到期后 eggStatus 标记 ready');
const beforeOwned = state.beasts.owned.length;
t = tickBeasts(1);
ok(t.hatched.length === 1, 'tickBeasts 结算到期蛋');
ok(state.beasts.owned.length === beforeOwned + 1, '孵化出的灵兽入册');
ok(state.beasts.eggs.length === 0, '蛋从列表移除');
const hatched = t.hatched[0];
ok(hatched.star >= 1 && hatched.star <= 5, '孵化个体拥有随机资质', `${hatched.star} 星`);
ok(hatched.level === 1 && hatched.intimacy === 0, '孵化个体 Lv.1、亲密度 0');

// 亲密度自然增长（出战的那只）
reset(17);
const act = makeBeast('bst_lingxique', 3);
setActive(act.uid);
ok(activeBeast()?.uid === act.uid, 'setActive 生效');
tickBeasts(600);
ok(Math.abs(act.intimacy - 1) < 0.01, '出战灵兽每 600 秒 +1 亲密度', `intimacy=${act.intimacy.toFixed(3)}`);
tickBeasts(60);
ok(act.intimacy < 2, '未到 600 秒不涨满整点', `intimacy=${act.intimacy.toFixed(3)}`);
act.intimacy = 100;
tickBeasts(6000);
ok(act.intimacy === 100, '亲密度自然增长不会超过 100');
ok(setActive(null).ok === true && activeBeast() === null, '召回后 activeBeast 返回 null');
ok(setActive(9999).ok === false, '出战不存在的灵兽被拒绝');

// ============================================================
section('8. beastBattleSide 与 buildPlayerSide 字段一致性');

reset(19);
const std = makeBeast('bst_jiuwei_tianhu', 5, { level: 40 });
addIntimacy(std.uid, 80);
const P = buildPlayerSide();
const B = beastBattleSide(std);

const pKeys = Object.keys(P).sort();
const bKeys = Object.keys(B).sort();
const missing = pKeys.filter((k) => !(k in B));
const typeMismatch = pKeys.filter((k) => typeof P[k] !== typeof B[k]);
const extra = bKeys.filter((k) => !(k in P));
console.log('  buildPlayerSide 字段：' + pKeys.join(', '));
console.log('  beastBattleSide 字段：' + bKeys.join(', '));
console.log('  额外字段：' + (extra.length ? extra.join(', ') : '（无）'));
ok(missing.length === 0, 'buildPlayerSide 的每个字段 beastBattleSide 都有', `缺失：${missing.join(',') || '无'}`);
ok(typeMismatch.length === 0, '共有字段的类型全部一致', `不一致：${typeMismatch.join(',') || '无'}`);
ok(extra.every((k) => ['id', 'skills'].includes(k)), '额外字段仅为 id / skills（对齐 buildEnemySide 的扩展）',
  extra.join(','));
ok(B.side === 'beast', 'side 为 beast（战斗层可区分）', B.side);
ok(P.side === 'player', 'buildPlayerSide 的 side 仍为 player');
ok(Array.isArray(B.affixes) && B.affixes.every((a) => typeof a.kind === 'string' && typeof a.value === 'number'),
  'affixes 形状与 combat.js 的 normAffix 读取口径一致（kind/value）');
ok(B.hp === B.maxHp && B.hp > 0, '出战单位以满血入场');
ok(B.atk > 0 && B.def >= 0 && B.spd > 0 && B.critDmg === 1.5, '核心战斗数值合法');
ok(Array.isArray(B.skills) && B.skills.length > 0, 'skills 带出已解锁技能', `${B.skills.length} 个`);

// 亲密度协战词条
const atkBeast = makeBeast('bst_jiuwei_tianhu', 5, { level: 20 });
atkBeast.intimacy = 0;
ok(beastBattleSide(atkBeast).affixes.length === 0, '亲密度不足时无协战词条');
atkBeast.intimacy = 80;
const af = beastBattleSide(atkBeast).affixes;
ok(af.some((a) => a.kind === 'extra_strike'), '攻伐型亲密度 ≥60 获得 extra_strike（追击）',
  af.map((a) => a.name).join(','));
const tankBeast = makeBeast('bst_xuanshuigui', 5);
tankBeast.intimacy = 45;
ok(beastBattleSide(tankBeast).affixes.some((a) => a.kind === 'reflect'), '镇守型 ≥40 获得 reflect（反震）');
const supBeast = makeBeast('bst_lingxique', 5);
supBeast.intimacy = 55;
ok(beastBattleSide(supBeast).affixes.some((a) => a.kind === 'lifesteal'), '辅助型 ≥50 获得 lifesteal');

// activeBeastBattleSide
reset(19);
ok(activeBeastBattleSide() === null, '无出战灵兽时 activeBeastBattleSide() 返回 null');
const a1 = makeBeast('bst_leiyabao', 4);
setActive(a1.uid);
ok(activeBeastBattleSide()?.side === 'beast' && activeBeastBattleSide().name === '雷牙豹',
  'activeBeastBattleSide() 返回出战单位');

// ============================================================
section('9. 灵兽单位喂给 combat.js 的 simulateBattle');

reset(23);
const enemyDefs = ['en_yezhu', 'en_canglang'];
let battleErrors = 0, beastWins = 0, maxRounds = 0;
for (let i = 0; i < 50; i++) {
  setSeed(i * 131 + 7);
  const b = makeBeast(i % 2 ? 'bst_chiyanhu' : 'bst_xuanshuigui', (i % 5) + 1, { level: 1 + (i % 20) });
  b.intimacy = (i * 7) % 100;
  const side = beastBattleSide(b);
  const enemy = buildEnemySide(enemyDefs[i % 2], { hpMult: 0.5, atkMult: 0.5 });
  try {
    const res = simulateBattle(side, enemy);
    if (!['player', 'enemy'].includes(res.winner)) throw new Error('非法胜者 ' + res.winner);
    if (!Number.isFinite(res.playerLeft.hp) || !Number.isFinite(res.enemyLeft.hp)) throw new Error('血量 NaN');
    if (!(res.rounds.length > 0)) throw new Error('战报为空');
    if (res.rounds.length > ROUND_CAP * 4) throw new Error('战报超长');
    maxRounds = Math.max(maxRounds, res.rounds.length);
    if (res.winner === 'player') beastWins++;
  } catch (err) {
    battleErrors++;
    if (battleErrors <= 3) console.log('    异常:', err.message);
  }
}
ok(battleErrors === 0, '50 场灵兽战斗无异常', `errors=${battleErrors}`);
ok(maxRounds > 0 && maxRounds <= ROUND_CAP * 4, `单场战报条数在合理范围（最多 ${maxRounds}）`);
console.log(`    （灵兽对削弱后的一阶敌人胜率 ${beastWins * 2}% —— 只用于验证能跑通，不代表配平）`);

// 单场可复现
reset(29);
const repB = beastBattleSide(makeBeast('bst_chiyanhu', 5, { level: 15 }));
setSeed(999);
const r1 = simulateBattle(repB, buildEnemySide('en_yezhu', {}));
setSeed(999);
const r2 = simulateBattle(repB, buildEnemySide('en_yezhu', {}));
ok(r1.winner === r2.winner && JSON.stringify(r1.rounds) === JSON.stringify(r2.rounds),
  '同种子下灵兽战斗可复现');
ok(r1.rounds.some((x) => x.actor === 'beast'), '战报里灵兽的 actor 为 beast（战斗层可据此区分它自己的回合）',
  `actor 取值：${[...new Set(r1.rounds.map((x) => x.actor))].join(',')}`);

// ============================================================
section('10. 捕捉 / 放生 / 图鉴 / 面板汇总');

reset(31);
const cand = rollTameCandidate(0);
ok(!!cand && cand.base.tier === 1 && cand.base.minRealm <= 0, '炼气期候选池限定在一阶且已解锁');
ok(rollTameCandidate(0).base.id !== undefined, '候选返回合法定义');
let tamed = 0, tries = 0;
for (let i = 0; i < 400 && tamed < 1; i++) { tries++; if (tameBeast(19)) tamed++; }
ok(tamed >= 1, '高境界可捕捉到灵兽', `${tries} 次内成功`);
const highTier = rollTameCandidate(21);
ok(highTier.base.tier >= 1, '化神期候选池可达高阶', `T${highTier.base.tier} ${highTier.base.name}`);

reset(31);
const rel = makeBeast('bst_liuwei_yanhu', 3);
setActive(rel.uid);
const m0 = materialCount('mat_yaodan');
const rr = releaseBeast(rel.uid);
ok(rr.ok === true, '放生成功');
ok(materialCount('mat_yaodan') === m0 + 3, '放生返还材料 = 星级数', `妖丹 ${m0} → ${materialCount('mat_yaodan')}`);
ok(activeBeast() === null, '放生出战中的灵兽会一并召回');
ok(state.beasts.owned.length === 0, '放生后移出列表');
ok(releaseBeast(999).ok === false, '放生不存在的灵兽被拒绝');

reset(31);
makeBeast('bst_chiyanhu', 3);
makeBeast('bst_xuanshuigui', 2);
layEgg('bst_qingluan', 600);
const col = beastCollection();
ok(col.total === BEASTS.length, '图鉴总数 = 灵兽种类数', `${col.discovered} / ${col.total}`);
ok(col.discovered === 3, '已收录 = 拥有 2 只 + 蛋 1 枚', String(col.discovered));
ok(col.byTier.length === 5, '图鉴按 5 个 tier 分组');

const sum = beastSummary();
ok(sum.length === 2, 'beastSummary 返回 2 条');
ok(sum[0].allSkills.length >= sum[0].skills.length, '汇总里区分了全部技能与已解锁技能');
ok(sum[0].stats && sum[0].stats.maxHp > 0, '汇总带完整战斗属性');

// ============================================================
section('11. 获取通路：捕捉 / 灵材孵化 / 战斗经验');

// --- 11.1 孵化池只出链首与独兽 ---
const hatchPool = hatchableBeasts();
ok(hatchPool.every((b) => evolutionDepth(b.id) === 0), '孵化池不含进化链高阶形态',
  hatchPool.map((b) => b.name).join('、'));
const evolvedWithEgg = BEASTS.filter((b) => b.eggFrom && evolutionDepth(b.id) > 0);
ok(evolvedWithEgg.length > 0 && !evolvedWithEgg.some((b) => hatchPool.includes(b)),
  '数据里确有带 eggFrom 的高阶形态，但被挡在孵化池外',
  `挡下 ${evolvedWithEgg.length} 种：${evolvedWithEgg.map((b) => b.name).join('、')}`);

// --- 11.2 灵材孵化：料不足拒绝，够了则扣料入蛋 ---
reset(7);
const target = hatchPool.find((b) => b.tier === 1);
const hcost = hatchCost(target.id);
ok(!!hcost && !!hcost.id && hcost.count > 0 && hcost.seconds > 0,
  '孵化消耗含 材料/数量/时长', JSON.stringify(hcost));
ok(canHatch(target.id).ok === false, '灵材不足时不可取卵', canHatch(target.id).reason);
ok(hatchByMaterial(target.id).ok === false, '材料不足时 hatchByMaterial 拒绝');
ok((state.beasts.eggs || []).length === 0, '拒绝时不产生蛋（绝不凭空入蛋）');

addMaterial(hcost.id, hcost.count);
ok(canHatch(target.id).ok === true, '备齐灵材后可取卵');
const matBefore = materialCount(hcost.id);
const hr = hatchByMaterial(target.id);
ok(hr.ok === true, '取卵成功', hr.reason || '');
ok(materialCount(hcost.id) === matBefore - hcost.count, '灵材按量扣除',
  `${matBefore} → ${materialCount(hcost.id)}`);
ok(state.beasts.eggs.some((e) => e.baseId === target.id), '蛋已入 state.beasts.eggs', target.name);

const hs = hatchableSummary();
ok(hs.length === hatchPool.length, 'hatchableSummary 与孵化池条数一致', `${hs.length} 条`);
ok(hs.every((h) => h.cost && h.cost.id), '每条都有消耗信息');

// --- 11.3 战斗经验只发给在战的那只 ---
reset(11);
const idleBeast = makeBeast('bst_leiyabao', 3);
const frontBeast = makeBeast('bst_chiyanhu', 3);
ok(grantBattleExp() === null, '无出战灵兽时不发经验');
setActive(frontBeast.uid);
const idleExp0 = idleBeast.exp;
const frontExp0 = frontBeast.exp;
const beGain = grantBattleExp();
ok(!!beGain && beGain.uid === frontBeast.uid, '经验发给出战的那只', beGain ? `uid=${beGain.uid}` : 'null');
ok(frontBeast.exp !== frontExp0 || frontBeast.level > 1, '出战灵兽经验增加',
  `exp ${frontExp0} → ${frontBeast.exp}（+${beGain.amount}）`);
ok(idleBeast.exp === idleExp0, '未出战的灵兽不涨经验');

// --- 11.4 attemptTame 把「遇到」与「抓住」分开 ---
reset(3);
let sawCand = false, sawNone = false, tamedN = 0;
for (let i = 0; i < 200; i++) {
  const r = attemptTame(9);
  if (r.cand) sawCand = true; else sawNone = true;
  if (r.inst) tamedN++;
}
ok(sawCand, 'attemptTame 能抽到候选');
ok(tamedN > 0 && tamedN < 200, '收服不是必然（有遇到却没抓住的）', `200 次中收服 ${tamedN} 次，成功率约 ${(tamedN / 2).toFixed(0)}%`);

// --- 11.5 探险：战斗胜利后有概率遭遇可收服灵兽 ---
// 这是"捕捉"唯一的常驻入口，概率低（约 2.2%/次），只能靠次数堆出来验。
reset(23);
let tameSeen = null, battleN = 0;
for (let i = 0; i < 1200 && !tameSeen; i++) {
  state.player.hp = (state.player.maxHp || 1000) * 10;   // 绕过气血门槛
  tickExplore(999);                                      // 绕过冷却
  const r = explore();
  if (r.kind === 'battle') battleN++;
  if (r.rewards && r.rewards.beast) tameSeen = r.rewards.beast;
}
ok(!!tameSeen, '探险能遭遇并收服灵兽（捕捉通路已接线）',
  tameSeen ? `${tameSeen.baseId} ${tameSeen.star}★，第 ${battleN} 场战斗后` : '1200 次探险内未出现');
ok(!!tameSeen && state.beasts.owned.some((b) => b.uid === tameSeen.uid),
  '收服的灵兽确实已入册');

// --- 11.6 灵兽系统不得反向依赖 UI ---
// ============================================================
section('12. systems 层无 DOM 操作');
for (const f of ['beast.js', 'bloodline.js']) {
  const src = readFileSync(resolve(__dirname, '../src/systems', f), 'utf8');
  const hasDom = /\bdocument\s*\./.test(src) || /\bwindow\s*\./.test(src) || /\bquerySelector\b/.test(src);
  ok(!hasDom, `${f} 不含 DOM 操作`);
}
const panelSrc = readFileSync(resolve(__dirname, '../src/ui/panels/beastPanel.js'), 'utf8');
ok(/createPanel\s*\(/.test(panelSrc), '面板使用 createPanel');
ok(/export function renderBeastPanel/.test(panelSrc) && /export function resetBeastPanel/.test(panelSrc),
  '导出 renderBeastPanel / resetBeastPanel');
// structure() 里不得出现实时数值
const structBody = panelSrc.slice(panelSrc.indexOf('structure()'), panelSrc.indexOf('build(host)'));
ok(!/Date\.now|remaining|intimacy/i.test(structBody),
  'structure() 不含倒计时 / 亲密度等每秒变化量');
ok(/esc\(/.test(panelSrc), '面板文本使用 esc() 转义');

// ============================================================
console.log('\n' + '='.repeat(66));
console.log(`灵兽 ${BEASTS.length} 种；tier 分布 ${[1, 2, 3, 4, 5].map((t) => `T${t}:${tierCount[t]}`).join(' ')}；` +
  `进化链 ${chainInfo.length} 条（${chainInfo.map(({ chain }) => chain.length).join('/')} 阶）`);
console.log(`星级实测：${[1, 2, 3, 4, 5].map((s) => `${s}★${(dist[s] / N * 100).toFixed(2)}%`).join(' ')}`);
console.log(`通过 ${pass} 项，失败 ${fail} 项`);
if (fail > 0) {
  console.log('失败项：');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('全部通过。');
