/**
 * 核心逻辑冒烟测试。
 *
 * 目的不是覆盖率，而是回答一个具体问题：
 *   "用真实的游戏代码跑一遍，能不能从炼气一层一路挂到飞升？中途会不会卡死？"
 *
 * 这正是配平报告标注为"未验证"的那一环 —— balance_sim.py 验的是公式，
 * 这里验公式在真实代码里的落地结果是否一致。
 *
 * 用法: node tools/smoke_core.mjs
 */

// Node 环境没有 localStorage，save.js 依赖它，这里给个内存实现
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
};

const S = await import('../src/core/state.js');
const cultivation = await import('../src/systems/cultivation.js');
const breakthrough = await import('../src/systems/breakthrough.js');
const saveMod = await import('../src/core/save.js');
const { REALMS } = await import('../src/data/realms.js');
const { setSeed } = await import('../src/core/rng.js');

const { setState, createInitialState, realm } = S;

// 注意：state 会被 setState 整体替换，所以每次重开档后都要重新取引用
let state = S.state;
function reset(name) {
  setState(createInitialState(name));
  state = S.state;
}

let failures = 0;
function check(name, cond, detail = '') {
  const ok = !!cond;
  if (!ok) failures++;
  console.log(`  ${ok ? '[OK]  ' : '[FAIL]'} ${name}${detail ? '  —— ' + detail : ''}`);
  return ok;
}
function section(t) {
  console.log('\n' + t);
  console.log('-'.repeat(66));
}

// ============ 1. 初始状态 ============
section('1. 初始状态');
reset('测试散修');
check('境界为炼气一层', state.player.realmIndex === 0, realm().name);
check('修为从 0 开始', state.player.cult === 0);
check('灵石 50', state.resources.stones.low === 50);
check('灵根存在', !!state.player.spiritRoot, state.player.spiritRoot.name);
check('修炼速率为正', cultivation.calcCultSpeed() > 0, cultivation.calcCultSpeed() + '/息');

// ============ 2. 修为封顶 ============
section('2. 修为封顶（防止挂机溢出）');
reset('测试散修');
for (let i = 0; i < 5000; i++) cultivation.tick(1);
check('修为恰好封顶在需求值', state.player.cult === REALMS[0].needCult,
  `${state.player.cult} / ${REALMS[0].needCult}`);
check('未自动越过境界', state.player.realmIndex === 0, 'index=' + state.player.realmIndex);

// ============ 3. 挂机节奏抽样 ============
section('3. 挂机节奏抽样（真实代码 vs 配平目标）');
reset('测试散修');
state.player.spiritRoot = { id: 'huang', name: '黄灵根', mult: 1.0, desc: '' };
let ticksToFull = 0;
while (state.player.cult < REALMS[0].needCult && ticksToFull < 100000) {
  cultivation.tick(1);
  ticksToFull++;
}
check('炼气一层约 1~3 分钟圆满', ticksToFull >= 30 && ticksToFull <= 200,
  `${ticksToFull} 秒（配平目标 ${REALMS[0].needCult / REALMS[0].baseSpeed / 60} 分）`);

// ============ 4. 完整通关 ============
section('4. 从炼气一层一路突破到飞升');
reset('测试散修');
setSeed(20260911);
let guard = 0;
let successes = 0;
let tribulationRuns = 0;
while (state.player.realmIndex < 25 && guard++ < 600) {
  const r = realm();
  // 直接补满修为：这一步测的是突破链路，不是挂机速度（速度由第 3 节单独验）
  state.player.cult = r.needCult ?? 0;
  if (r.needPill) state.consumables[r.needPill] = (state.consumables[r.needPill] || 0) + 5;
  state.player.base.daoHeart = 300;              // 保证天劫可过，测的是流程不是运气
  state.player.base.comprehension = 300;

  if (breakthrough.inTribulation()) {
    breakthrough.runTribulation({ autoHeal: false });
    continue;
  }
  const res = breakthrough.attemptBreakthrough();
  if (res?.tribulation) { tribulationRuns++; continue; }
  if (res?.success) successes++;
}
check('能一路突破到飞升', state.player.realmIndex === 25,
  `最终境界 ${realm().name}（索引 ${state.player.realmIndex}）`);
check('普通突破次数合理', successes >= 15, successes + ' 次');
check('八道天劫关口全部触发', tribulationRuns === 8, tribulationRuns + ' 次');

// ============ 4. 突破失败惩罚 ============
section('4. 突破失败不清零（配平报告的核心要求）');
reset('测试散修');
setSeed(7);
// 用金丹中期（索引 13）：非天劫关口，成功率 0.85，才能观测到普通失败
const FAIL_REALM = 13;
let sawFail = false;
for (let i = 0; i < 80 && !sawFail; i++) {
  state.player.realmIndex = FAIL_REALM;
  state.player.cult = REALMS[FAIL_REALM].needCult;
  state.player.breakFails = 0;
  const before = state.player.cult;
  const r = breakthrough.attemptBreakthrough();
  if (r?.ok && r.success === false) {
    sawFail = true;
    check('失败后修为保留 75%', Math.abs(state.player.cult - before * 0.75) < before * 0.02,
      `${Math.round(state.player.cult)} ≈ ${Math.round(before * 0.75)}`);
    check('累积连败计数', state.player.breakFails >= 1, 'breakFails=' + state.player.breakFails);
  }
}
check('能观测到失败', sawFail);

// ============ 5. 连败保底 ============
section('5. 连败保底');
reset('测试散修');
state.player.realmIndex = FAIL_REALM;
state.player.breakFails = 0;
const without = breakthrough.calcBreakChance();
state.player.breakFails = 10;
const withPity = breakthrough.calcBreakChance();
check('保底提高成功率', withPity > without,
  `${(without * 100).toFixed(1)}% → ${(withPity * 100).toFixed(1)}%`);
check('成功率上限为 100%（投入足够可稳过）', withPity <= 1.0001, (withPity * 100).toFixed(1) + '%');

// 炼气期必须是"必定成功"：数据表 breakChance = 1.0 的语义不能被 95% 上限改写
reset('测试散修');
state.player.realmIndex = 0;
check('炼气期突破必定成功', breakthrough.calcBreakChance() === 1,
  (breakthrough.calcBreakChance() * 100).toFixed(0) + '%');

// ============ 6. 天劫流程 ============
section('6. 天劫流程');
reset('测试散修');
state.player.realmIndex = 9;
state.player.cult = REALMS[9].needCult;
state.consumables.pill_zhuji = 1;
const started = breakthrough.attemptBreakthrough();
check('大境界关口转入天劫', !!(started && started.tribulation));
check('天劫为三轮', state.tribulation?.rounds?.length === 3,
  state.tribulation?.rounds?.map((x) => x.name).join(' / '));
breakthrough.runTribulation({ autoHeal: false });
check('天劫可结算完成', !breakthrough.inTribulation());
check('结束后状态已清理', state.tribulation === null);

// 天劫失败不跌落境界
reset('测试散修');
state.player.realmIndex = 9;
state.player.cult = REALMS[9].needCult;
state.consumables.pill_zhuji = 1;
state.player.base.daoHeart = -500;             // 必败
state.player.hp = 1;
breakthrough.attemptBreakthrough();
breakthrough.runTribulation({ autoHeal: false });
check('天劫失败不跌落境界', state.player.realmIndex === 9, 'index=' + state.player.realmIndex);
check('天劫失败后仍存活', state.player.hp >= 1, 'hp=' + Math.round(state.player.hp));

// ============ 7. 派生属性 ============
section('7. 派生属性');
reset('测试散修');
const hp0 = cultivation.calcMaxHp();
state.player.realmIndex = 20;
const hp20 = cultivation.calcMaxHp();
check('气血上限随境界增长', hp20 > hp0, `${hp0} → ${hp20}`);
check('攻击为正', cultivation.calcAtk() > 0, String(cultivation.calcAtk()));

// ============ 8. 乘区软上限 ============
section('8. 乘区软上限（配平报告风险点 2）');
reset('测试散修');
state.player.spiritRoot = { id: 'tian', name: '天灵根', mult: 2.5, desc: '' };
state.cave.buildings = { bld_spirit: { level: 9, upgradeEndsAt: null } };
state.techniques.equipped = ['tech_wuji', 'tech_zhuxian', 'tech_hundun', 'tech_jiuzhuan'];
for (const id of state.techniques.equipped) {
  state.techniques.known[id] = { level: 9, exp: 0 };
}
const bd = cultivation.cultSpeedBreakdown();
check('持续倍率被压到上限附近', bd.sustained <= 24.01,
  `原始 ${bd.rawSustained.toFixed(2)}× → 实际 ${bd.sustained.toFixed(2)}×（上限 24）`);
check('确实触发了压缩', bd.capped === true);

// ============ 9. 存档往返 ============
section('9. 存档序列化 / 反序列化');
reset('存档测试');
state.player.realmIndex = 12;
state.player.cult = 12345;
state.resources.stones = { low: 0, mid: 3, high: 1 };   // 关键：low 为 0，测 || 假值陷阱
const restored = saveMod.deserialize(saveMod.serialize());
check('往返后境界一致', restored.player.realmIndex === 12);
check('往返后修为一致', restored.player.cult === 12345);
check('灵石 0 下品不被当成缺失值', restored.resources.stones.low === 0,
  JSON.stringify(restored.resources.stones));
check('中/上品灵石保留', restored.resources.stones.mid === 3 && restored.resources.stones.high === 1);

// ============ 10. 旧存档迁移 ============
section('10. 旧版存档迁移（demo 1.2.0）');
const legacy = {
  version: '1.2.0', playerName: '老玩家', realmIndex: 12, cult: 5000, stones: 3000,
  hp: 400, maxHp: 400, baseAtk: 20, baseDef: 12, luck: 66,
  spiritRoot: { name: '地灵根', mult: 1.8, desc: '上等灵根' },
  inventory: [
    { type: 'pill', name: '聚气丹' },
    { type: 'weapon', name: '紫电剑' },
    { type: 'technique', name: '太虚剑诀' },
  ],
  equipped: { weapon: 'w3', armor: null, treasure: null, technique: 'f3' },
  logEntries: [{ time: '10:00', text: '旧日志', cls: 'event-good' }],
  autoBreakthroughEnabled: true,
};
const migrated = saveMod.deserialize(JSON.stringify(legacy));
check('迁移成功', !!migrated);
check('名字保留', migrated?.player?.name === '老玩家', migrated?.player?.name);
check('境界保留', migrated?.player?.realmIndex === 12);
// 3000 旧灵石 ×10 = 30000 下品 = 300 中品 = 3 上品（进位到顶）
check('灵石折算并全额进位（3000 → 30000 → 3 上品）',
  migrated?.resources?.stones?.high === 3 &&
  migrated?.resources?.stones?.mid === 0 &&
  migrated?.resources?.stones?.low === 0,
  JSON.stringify(migrated?.resources?.stones));
check('灵根按名映射到新表', migrated?.player?.spiritRoot?.id === 'di', migrated?.player?.spiritRoot?.id);
check('背包丹药迁移', (migrated?.consumables?.pill_juqi || 0) === 1);
// 旧存档里只有 1 件装备（紫电剑），太虚剑诀是功法不是装备
check('旧装备不被静默丢弃', (migrated?.equipment?.owned?.length || 0) === 1,
  `已迁移 ${migrated?.equipment?.owned?.length} 件`);
check('旧装备 id 映射到新实例 uid', typeof migrated?.equipment?.equipped?.weapon === 'number',
  'weapon uid = ' + migrated?.equipment?.equipped?.weapon);
check('装备的 uid 能在背包装配中解析到实际物品',
  !!migrated?.equipment?.owned?.find((e) => e.uid === migrated?.equipment?.equipped?.weapon),
  'baseId = ' + migrated?.equipment?.owned?.find((e) => e.uid === migrated?.equipment?.equipped?.weapon)?.baseId);
check('旧功法按名迁移', Object.keys(migrated?.techniques?.known || {}).length > 0,
  Object.keys(migrated?.techniques?.known || {}).join(','));
check('旧主修功法被继承', (migrated?.techniques?.equipped || []).length === 1,
  (migrated?.techniques?.equipped || []).join(','));
check('自动突破开关迁移', migrated?.meta?.autoBreakthrough === true);
check('旧日志迁移', (migrated?.log?.length || 0) === 1);

// ============ 11. 数值格式化回归 ============
section('11. 数值格式化（trimZero 曾吞掉整数尾零）');
const fmtMod = await import('../src/core/format.js');
{
  // 这组用例来自一次真实事故：trimZero 直接跑 /\.?0+$/，
  // 把 "100" 削成 "1"、"50" 削成 "5"，导致所有 0 位小数的百分比静默显示错误。
  const cases = [
    [1, 0, '100%'], [0.5, 0, '50%'], [0.9, 0, '90%'], [0.75, 0, '75%'],
    [0.1, 0, '10%'], [0, 0, '0%'], [1, 1, '100%'], [0.853, 1, '85.3%'],
    [0.07, 1, '7%'], [0.125, 2, '12.5%'],
  ];
  let bad = [];
  for (const [v, d, expected] of cases) {
    const got = fmtMod.fmtPct(v, d);
    if (got !== expected) bad.push(`fmtPct(${v},${d}) = ${got}，期望 ${expected}`);
  }
  check('百分比格式化全部正确', bad.length === 0, bad.join('；'));

  check('fmtMult 去掉多余小数', fmtMod.fmtMult(2.0) === '×2' && fmtMod.fmtMult(1.5) === '×1.5',
    fmtMod.fmtMult(2.0) + ' / ' + fmtMod.fmtMult(1.5));
  check('fmt 大数用中文单位', fmtMod.fmt(12345) === '1.23万' && fmtMod.fmt(900) === '900',
    fmtMod.fmt(12345) + ' / ' + fmtMod.fmt(900));
  check('fmt 不再溢出为 Infinity 文本',
    fmtMod.fmt(Infinity) === '∞' && fmtMod.fmt(0) === '0',
    fmtMod.fmt(Infinity));
}

// ============ 结果 ============
console.log('\n' + '='.repeat(66));
if (failures === 0) {
  console.log('全部通过 ✓');
} else {
  console.log(`有 ${failures} 项失败 ✗`);
}
process.exit(failures === 0 ? 0 : 1);
