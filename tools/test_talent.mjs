/**
 * 轮回天赋树自测（V4.0）。
 *
 * 覆盖任务验收点：
 *   1. 数据表结构：三支线各 ≥8 条 / 共 ≥24 / id 唯一 / 消耗递增 / 层级前置可达
 *   2. 道基点不足不能学习；学习后正确扣除，成本按 costPerLevel 递进
 *   3. 前置未满足时 canLearn 拒绝（即使道基点充足）
 *   4. 洗点：返还累计投入、加成清零、投入归零
 *   5. talentBonus 汇总正确（正向 + malus 取负，与逐项手算对比）
 *   6. 「夺天造化」提供天命保底重掷；三系主线满级 → 真结局路径条件成立
 *   7. 新档（无 reincarnation 字段）能被 mergeDefaults 补齐且不报错
 *
 * 用法: node tools/test_talent.mjs
 */

// Node 环境没有 localStorage，save.js 会用到
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
};

const S = await import('../src/core/state.js');
const talent = await import('../src/systems/talent.js');
const data = await import('../src/data/talents.js');
const { mergeDefaults, deserialize } = await import('../src/core/save.js');
const { setSeed } = await import('../src/core/rng.js');

const { setState, createInitialState } = S;
setSeed(20260911);

let failures = 0;
function check(name, cond, detail = '') {
  const ok = !!cond;
  if (!ok) failures++;
  console.log(`  ${ok ? '[OK]  ' : '[FAIL]'} ${name}${detail ? '  —— ' + detail : ''}`);
}
function section(t) {
  console.log('\n' + t);
  console.log('-'.repeat(72));
}
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

function reset(name = '天赋测试') {
  setState(createInitialState(name));
  return S.state;
}

// ============ 1. 数据表结构 ============
section('1. 数据表结构');
check('三支线定义齐全', data.BRANCH_ORDER.length === 3
  && data.BRANCH_ORDER.every((b) => data.BRANCHES[b]), data.BRANCH_ORDER.join(' / '));

const perBranch = data.BRANCH_ORDER.map((b) => [b, data.talentsByBranch(b).length]);
for (const [b, n] of perBranch) {
  check(`支线「${data.BRANCHES[b].name}」天赋 ≥ 8`, n >= 8, `${n} 条`);
}
check('天赋总数 ≥ 24', data.TALENTS.length >= 24, `${data.TALENTS.length} 条`);
check('天赋 id 唯一', new Set(data.TALENTS.map((t) => t.id)).size === data.TALENTS.length);

check('每系恰有一条主线（main）',
  data.BRANCH_ORDER.every((b) => data.talentsByBranch(b).filter((t) => t.main).length === 1),
  data.BRANCH_ORDER.map((b) => {
    const m = data.talentsByBranch(b).find((t) => t.main);
    return `${data.BRANCHES[b].name}:${m?.name}`;
  }).join(' / '));

check('costPerLevel 长度 == maxLevel',
  data.TALENTS.every((t) => t.costPerLevel.length === t.maxLevel));
check('每级消耗严格递增（层级递进的成本压力）',
  data.TALENTS.every((t) => t.costPerLevel.every((c, i) => i === 0 || c > t.costPerLevel[i - 1])),
  data.TALENTS.filter((t) => !t.costPerLevel.every((c, i) => i === 0 || c > t.costPerLevel[i - 1]))
    .map((t) => t.id).join(',') || '全部通过');

check('高级天赋有前置（requires.points）',
  data.TALENTS.filter((t) => t.tier >= 1).every((t) => t.requires && t.requires.points > 0));

// 前置点数必须在本系"低级天赋点满"的射程内
const reach = {};
for (const b of data.BRANCH_ORDER) {
  const list = data.talentsByBranch(b);
  const below = (tier) => list.filter((t) => t.tier < tier).reduce((a, t) => a + t.maxLevel, 0);
  reach[b] = data.TALENTS
    .filter((t) => t.branch === b && t.requires)
    .every((t) => t.requires.points <= below(t.tier));
}
check('每系的前置点数要求，都能由更低层天赋点满达到',
  data.BRANCH_ORDER.every((b) => reach[b]),
  data.BRANCH_ORDER.map((b) => `${b}:${reach[b] ? 'OK' : '不可达'}`).join(' '));

// 所有 effect.kind / malus.kind 都要有元信息，否则 UI 会显示成裸 kind
const kindsOk = data.TALENTS.every((t) =>
  data.EFFECT_KIND_META[t.effect.kind]
  && (!t.effect.malus || data.EFFECT_KIND_META[t.effect.malus.kind]));
check('effect / malus 的 kind 都有展示元信息', kindsOk);

check('夺天造化存在且为机缘主线',
  !!data.talentById('tal_fortune_duotian')
  && data.talentById('tal_fortune_duotian').main === true
  && data.talentById('tal_fortune_duotian').effect.kind === 'fateReroll',
  'tal_fortune_duotian');

const malusCount = data.TALENTS.filter((t) => t.effect.malus).length;
check('存在带代价（malus）的天赋，非全是纯加成', malusCount >= 3, `${malusCount} 条有取舍`);

// ============ 2. 道基点不足 ============
section('2. 道基点不足不能学习');
reset();
check('新档道基点 = 0', S.state.reincarnation.daoBase === 0);
const c0 = talent.canLearn('tal_cultivate_tuna');
check('canLearn 被拒', c0.ok === false, c0.reason);
check('理由指出道基点不足', String(c0.reason).includes('道基点不足'), c0.reason);
const l0 = talent.learn('tal_cultivate_tuna');
check('learn 失败', l0.ok === false);
check('失败不写等级', talent.talentLevel('tal_cultivate_tuna') === 0);
check('失败不扣道基点', S.state.reincarnation.daoBase === 0);

// ============ 3. 学习与扣费 / 成本递进 ============
section('3. 学习后正确扣除，成本按表递进');
reset();
S.state.reincarnation.daoBase = 10;
const lvSeq = [];
let prevDao = S.state.reincarnation.daoBase;
let spentActual = 0;
for (let i = 1; i <= 3; i++) {
  const before = S.state.reincarnation.daoBase;
  const r = talent.learn('tal_cultivate_tuna');
  lvSeq.push(r.cost);
  spentActual += before - S.state.reincarnation.daoBase;
  check(`第 ${i} 次学习成功且等级 = ${i}`, r.ok && r.level === i && talent.talentLevel('tal_cultivate_tuna') === i,
    `cost=${r.cost}, dao=${S.state.reincarnation.daoBase}`);
}
check('实扣成本 == 表内前三档 [2,3,5]',
  JSON.stringify(lvSeq) === JSON.stringify([2, 3, 5]), JSON.stringify(lvSeq));
check('累计扣除 10，道基点归零', spentActual === 10 && S.state.reincarnation.daoBase === 0,
  `spent=${spentActual}, dao=${S.state.reincarnation.daoBase}`);
const c1 = talent.canLearn('tal_cultivate_tuna');
check('继续学习因余额不足被拒（下一档 8）', c1.ok === false && c1.cost === 8, c1.reason);
check('spentOn 累计 == 2+3+5', talent.spentOn('tal_cultivate_tuna') === 10);

// ============ 4. 前置未满足 ============
section('4. 前置未满足时 canLearn 拒绝（即使道基点充足）');
reset();
S.state.reincarnation.daoBase = 1000;   // 钱管够，专门验前置
check('修行 0 点，洗髓伐骨（需 6 点）被拒',
  talent.branchPoints('cultivate') === 0
  && talent.canLearn('tal_cultivate_xisui').ok === false
  && String(talent.canLearn('tal_cultivate_xisui').reason).includes('需先在'),
  talent.canLearn('tal_cultivate_xisui').reason);
check('learn 同样被拒', talent.learn('tal_cultivate_xisui').ok === false
  && talent.talentLevel('tal_cultivate_xisui') === 0);
check('机缘 0 点，夺天造化（需 24 点）被拒',
  talent.canLearn('tal_fortune_duotian').ok === false,
  talent.canLearn('tal_fortune_duotian').reason);
check('战伐 0 点，焚天秘法（需 14 点）被拒',
  talent.canLearn('tal_combat_fentian').ok === false,
  talent.canLearn('tal_combat_fentian').reason);

// ============ 5. 加成汇总（与手算逐项对比） ============
section('5. talentBonus 汇总正确（对比手算）');
// 本节从零开始铺：tuna 满 5 级、guben 1 级、xisui 1 级、lianqi 2 级
S.state.reincarnation.daoBase = 300;
for (let i = 0; i < 5; i++) talent.learn('tal_cultivate_tuna');   // 5 级，共 -31
talent.learn('tal_cultivate_guben');  // → 1 级，-2，修行点数 5+1 = 6
check('洗髓伐骨前置满足，可学', talent.canLearn('tal_cultivate_xisui').ok === true,
  `修行点数=${talent.branchPoints('cultivate')}`);
talent.learn('tal_cultivate_xisui');  // → 1 级，-4
talent.learn('tal_combat_lianqi'); // → 1 级，-2
talent.learn('tal_combat_lianqi'); // → 2 级，-3

// 手算：
//   cultPct   = tuna 5×0.03 + xisui 1×0.06 = 0.15 + 0.06 = 0.21
//   breakAdd  = guben 1×0.010 − xisui 1×0.006 = 0.010 − 0.006 = 0.004  （malus 取负）
//   atkPct    = lianqi 2×0.03 = 0.06
//   hpPct     = 0（尚未学焚天）
check('cultPct = 5×3% + 1×6% = 21%', approx(talent.talentBonus('cultPct'), 0.21),
  String(talent.talentBonus('cultPct')));
check('breakAdd = +1% − 0.6%（洗髓代价）= 0.4%', approx(talent.talentBonus('breakAdd'), 0.004),
  String(talent.talentBonus('breakAdd')));
check('atkPct = 2×3% = 6%', approx(talent.talentBonus('atkPct'), 0.06),
  String(talent.talentBonus('atkPct')));
check('未涉及 kind 返回 0（daoHeartAdd）', talent.talentBonus('daoHeartAdd') === 0);

// malus 汇总通道：直接注入焚天秘法 1 级，hpPct 应为 −2%
S.state.reincarnation.talents.tal_combat_fentian = 1;
check('malus 走同一 kind 通道：焚天 1 级 → hpPct = −2%',
  approx(talent.talentBonus('hpPct'), -0.02), String(talent.talentBonus('hpPct')));
delete S.state.reincarnation.talents.tal_combat_fentian;

// 点数 / 消耗
check('branchPoints：修行 7 / 战伐 2 / 机缘 0',
  talent.branchPoints('cultivate') === 7
  && talent.branchPoints('combat') === 2
  && talent.branchPoints('fortune') === 0,
  `${talent.branchPoints('cultivate')}/${talent.branchPoints('combat')}/${talent.branchPoints('fortune')}`);
const handSpent = 31 /* tuna 2+3+5+8+13 */ + 2 /* guben */ + 4 /* xisui */ + 5 /* lianqi 2+3 */;
check(`totalSpent 手算 = ${handSpent}`, talent.totalSpent() === handSpent, String(talent.totalSpent()));

// ============ 6. 洗点 ============
section('6. 洗点：返还正确、加成清零');
const daoBeforeRespec = S.state.reincarnation.daoBase;
const rsp = talent.respec();
check('洗点返回返还额 == 累计投入', rsp.ok && rsp.refunded === handSpent, String(rsp.refunded));
check('道基点 = 洗点前 + 返还', S.state.reincarnation.daoBase === daoBeforeRespec + handSpent,
  `${daoBeforeRespec} + ${handSpent} = ${S.state.reincarnation.daoBase}`);
check('全部等级清零', data.TALENTS.every((t) => talent.talentLevel(t.id) === 0));
check('加成清零：cultPct / breakAdd / atkPct 全为 0',
  talent.talentBonus('cultPct') === 0
  && talent.talentBonus('breakAdd') === 0
  && talent.talentBonus('atkPct') === 0);
check('totalSpent 归零', talent.totalSpent() === 0);
check('各系投入点数归零',
  data.BRANCH_ORDER.every((b) => talent.branchPoints(b) === 0));

// ============ 7. 夺天造化 / 真结局路径 ============
section('7. 夺天造化（天命保底重掷）与真结局路径');
reset();
S.state.reincarnation.daoBase = 1000;
// 机缘系点到 24 点：三个 T0 满级(15 点) + 奇遇良缘满级(5) + 守株待兔 4 级 = 24
for (const id of ['tal_fortune_fuyuan', 'tal_fortune_lingjue', 'tal_fortune_jiancai']) {
  for (let i = 0; i < 5; i++) talent.learn(id);
}
for (let i = 0; i < 5; i++) talent.learn('tal_fortune_qiyu');
for (let i = 0; i < 4; i++) talent.learn('tal_fortune_shouji');
check('机缘点数 = 24', talent.branchPoints('fortune') === 24,
  String(talent.branchPoints('fortune')));
check('夺天造化前置满足', talent.canLearn('tal_fortune_duotian').ok === true,
  talent.canLearn('tal_fortune_duotian').reason);

talent.learn('tal_fortune_duotian');
check('1 级：天命重掷次数 = 1', talent.fateRerollCharges() === 1);
talent.learn('tal_fortune_duotian');
talent.learn('tal_fortune_duotian');
check('3 级：天命重掷次数 = 3', talent.fateRerollCharges() === 3,
  String(talent.fateRerollCharges()));
check('canLearn 在满级后返回「已至圆满」',
  talent.canLearn('tal_fortune_duotian').ok === false
  && talent.canLearn('tal_fortune_duotian').reason === '已至圆满');
check('机缘主线已大成', talent.branchMainMaxed('fortune') === true);
check('真结局路径：仅机缘一条主线 → 未达成', talent.isEndingPathUnlocked() === false);

// 直接注入另外两系主线满级，验证判定逻辑（免去巨额道基点铺路）
S.state.reincarnation.talents.tal_cultivate_dadao = data.talentById('tal_cultivate_dadao').maxLevel;
S.state.reincarnation.talents.tal_combat_wushuang = data.talentById('tal_combat_wushuang').maxLevel;
check('三系主线皆满 → 真结局路径条件成立', talent.isEndingPathUnlocked() === true);
delete S.state.reincarnation.talents.tal_cultivate_dadao;
check('撤下一条主线 → 条件重新为假', talent.isEndingPathUnlocked() === false);

// 主线大招的代价也要叠加：大道功成 3 级 → 天劫抗性 −9%（等价于天劫更难）
S.state.reincarnation.talents.tal_cultivate_dadao = 3;
check('大道功成 3 级 → 天劫抗性 −9%（代价可见）',
  approx(talent.talentBonus('tribulationResist'), -0.09),
  String(talent.talentBonus('tribulationResist')));

// ============ 8. 新档字段补齐 ============
section('8. 新档（无 reincarnation 字段）mergeDefaults 补齐');
const fresh = createInitialState('老档');
delete fresh.reincarnation;                 // 模拟 V3.x 存档
const next = deserialize(JSON.stringify(fresh));
check('deserialize 不报错', !!next);
check('reincarnation 被补齐', !!next.reincarnation);
check('talents 补齐为 {}', next.reincarnation
  && typeof next.reincarnation.talents === 'object'
  && Object.keys(next.reincarnation.talents).length === 0,
  JSON.stringify(next.reincarnation?.talents));
check('daoBase 补齐为 0', next.reincarnation?.daoBase === 0);

// 直接对缺字段对象调 mergeDefaults，并确认天赋系统在其上可运行
const raw = { player: { name: '裸档' } };
mergeDefaults(raw, createInitialState());
check('mergeDefaults 直接补齐 reincarnation', !!raw.reincarnation?.talents);
setState(next);
let threw = null;
try {
  talent.talentLevel('tal_cultivate_tuna');
  talent.canLearn('tal_cultivate_tuna');
  talent.talentSummary();
  talent.isEndingPathUnlocked();
} catch (e) { threw = e; }
check('补齐后的状态上调用天赋系统不抛错', threw === null, threw ? String(threw) : '');
check('talentSummary 返回三条支线', talent.talentSummary().branches.length === 3);

// ============ 结果 ============
console.log('\n' + '='.repeat(72));
console.log(`天赋 ${data.TALENTS.length} 条：`
  + data.BRANCH_ORDER.map((b) => `${data.BRANCHES[b].name} ${data.talentsByBranch(b).length}`).join(' / '));
if (failures === 0) console.log('全部通过 ✓');
else console.log(`有 ${failures} 项失败 ✗`);
process.exit(failures === 0 ? 0 : 1);
