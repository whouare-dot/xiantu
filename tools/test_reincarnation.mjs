/**
 * 轮回系统自测。
 *
 * 轮回是整个游戏里唯一会**整体重建 state** 的地方，
 * 所以这里测的重点不是"功能对不对"，而是：
 *   什么东西**必须消失**（当世资产），什么东西**必须活下来**（跨世积累）。
 * 漏清一个字段只是少清一个；漏保留一个字段，玩家的永久进度会凭空消失——
 * 后者是灾难性的，所以每一条保留项都要有断言。
 *
 * 用法: node tools/test_reincarnation.mjs
 */

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const S = await import('../src/core/state.js');
const RC = await import('../src/systems/reincarnation.js');
const BT = await import('../src/systems/breakthrough.js');
const CV = await import('../src/systems/cultivation.js');
const { REALMS } = await import('../src/data/realms.js');
const { setSeed } = await import('../src/core/rng.js');

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

// ============ 1. 初始状态 ============
section('1. 初始状态');
setSeed(20260911);
S.setState(S.createInitialState('轮回测试'));
check('第 1 世', RC.currentGen() === 1, 'gen=' + RC.currentGen());
check('道基点为 0', S.state.reincarnation.daoBase === 0);
check('记忆加成为 1', RC.memoryBonus() === 1, String(RC.memoryBonus()));
check('未达成结局', !RC.endingSeen() && !RC.inFreeMode());

// ============ 2. 道基点结算 ============
section('2. 道基点结算（飞升时的成就换算）');
{
  const st = S.state;
  st.player.realmIndex = 25;
  st.stats.tribulationsPassed = 8;
  st.stats.breakthroughs = 25;
  st.sect.id = 'tianjian';
  st.sect.rank = 4;
  st.beasts.owned = Array.from({ length: 10 }, (_, i) => ({ uid: i + 1, baseId: 'b1', star: 3 }));
  st.achievements.unlocked = Array.from({ length: 40 }, (_, i) => 'a' + i);
  const calc = RC.calcDaoBase();
  check('道基点 > 0', calc.total > 0, '合计 ' + calc.total);
  check('各项都有上限', calc.parts.every((p) => p.value <= p.cap),
    calc.parts.map((p) => `${p.label} ${p.value}/${p.cap}`).join('  '));
  check('奇遇次数不参与结算（避免可刷项主导）',
    !calc.parts.some((p) => p.label.includes('奇遇')),
    calc.parts.map((p) => p.label).join('/'));
}

// ============ 3. 飞升 → 强制轮回 ============
section('3. 飞升即强制轮回');
{
  // 造一个"即将飞升"的局面：渡劫期，修为已满
  S.setState(S.createInitialState('飞升者'));
  const st = S.state;
  st.player.realmIndex = 24;           // 渡劫期 → 突破即飞升
  st.player.cult = REALMS[24].needCult;
  st.consumables.pill_dujie = 5;
  st.player.base.daoHeart = 500;       // 保证天劫能过
  st.player.base.comprehension = 500;
  st.achievements.unlocked = ['a1', 'a2', 'a3'];
  st.codex.beasts = ['bst_x'];
  st.companions.met = ['cmp_x'];
  st.companions.bond = { cmp_x: 60 };
  st.resources.stones = { low: 999, mid: 99, high: 9 };
  st.equipment.owned = [{ uid: 1, baseId: 'eq_x', quality: 'xian', level: 3, affixes: [] }];

  const beforeDao = st.reincarnation.daoBase;

  // 触发突破：渡劫期在 TRIBULATION_REALMS 里，会走天劫→飞升→轮回
  BT.attemptBreakthrough();
  BT.runTribulation({ autoHeal: true });

  const s2 = S.state;
  check('轮回次数 +1', s2.reincarnation.count === 1, 'count=' + s2.reincarnation.count);
  check('回到第 2 世', RC.currentGen() === 2);
  check('道基点已累加', s2.reincarnation.daoBase > beforeDao,
    `${beforeDao} → ${s2.reincarnation.daoBase}`);
  check('境界重置为炼气一层', s2.player.realmIndex === 0, 'realm=' + s2.player.realmIndex);
}

// ============ 4. 该消失的必须消失 ============
section('4. 当世资产必须清空');
{
  const s = S.state;
  check('修为清零', s.player.cult === 0);
  check('灵石清零（只留初始行囊的 50）', s.resources.stones.low === 50 && s.resources.stones.mid === 0 && s.resources.stones.high === 0,
    JSON.stringify(s.resources.stones));
  check('装备只剩初始行囊', s.equipment.owned.every((e) => e.baseId.startsWith('eq_qingwen') || e.baseId.startsWith('eq_cloth')),
    s.equipment.owned.map((e) => e.baseId).join(','));
  check('宗门已退出', s.sect.id === null && s.sect.rank === 0 && s.sect.contribution === 0);
  check('灵兽本体不保留', (s.beasts.owned || []).length === 0);
  check('材料清空', Object.keys(s.resources.materials || {}).length === 0);
  check('统计清零', (s.stats.breakthroughs || 0) === 0 && (s.stats.tribulationsPassed || 0) === 0);
}

// ============ 5. 该活下来的必须活下来 ============
section('5. 跨世积累必须保留（漏一个都是灾难）');
{
  const s = S.state;
  check('成就保留', (s.achievements.unlocked || []).length === 3,
    (s.achievements.unlocked || []).join(','));
  check('图鉴保留', (s.codex.beasts || []).includes('bst_x'));
  check('道侣羁绊保留', (s.companions.met || []).includes('cmp_x') && s.companions.bond.cmp_x === 60,
    JSON.stringify(s.companions.bond));
  check('历世记录保留', (s.reincarnation.history || []).length === 1,
    JSON.stringify(s.reincarnation.history[0]));
  check('灵兽血脉保留（知识留下、资产不留）',
    s.reincarnation && typeof s.beasts.bloodlines === 'object',
    JSON.stringify(s.beasts.bloodlines || {}));
}

// ============ 6. 天命与记忆残留 ============
section('6. 天命与记忆残留');
{
  const s = S.state;
  check('已掷出本世天命', !!s.reincarnation.fate, s.reincarnation.fate?.name);
  check('记忆残留 > 1', RC.memoryBonus() > 1, '×' + RC.memoryBonus().toFixed(2));
  const withBonus = CV.calcCultSpeed();
  check('轮回加成进入了修炼速率', withBonus > 0, withBonus + '/息');

  // 凶命必须带补偿
  const bad = S.state.reincarnation.fate;
  if (bad && bad.good === false) {
    check('凶命带有补偿项', (bad.effects || []).some((e) => e.value > 0),
      JSON.stringify(bad.effects));
  } else {
    check('本世为吉命（凶命补偿规则另测）', true, bad?.name || '无');
  }

  // 直接验证天命表的规则本身
  const { FATES } = await import('../src/data/fates.js');
  const badFates = FATES.filter((f) => f.good === false);
  const allCompensated = badFates.every((f) => (f.effects || []).some((e) => e.value > 0));
  check('所有凶命都带正面补偿', allCompensated,
    `${badFates.length} 条凶命，${allCompensated ? '全部' : '有'}补偿`);
}

// ============ 7. 真结局条件 ============
section('7. 真结局条件');
{
  const c1 = RC.endingConditions();
  check('未满足时 ok 为假', c1.ok === false);
  check('条件逐条可见（玩家知道往哪走）', c1.items.length === 3,
    c1.items.map((i) => `${i.label}${i.done ? '✓' : '✗'}`).join('  '));

  // 强行满足
  S.state.reincarnation.count = 5;
  // 真结局的第二条判定口径由天赋系统自己定义：三系各把**主线天赋点满**。
  // 这里必须用真实的天赋 id 与真实的满级值，否则测的是一个不存在的情形。
  S.state.reincarnation.talents = {
    tal_cultivate_dadao: 3, tal_combat_wushuang: 3, tal_fortune_duotian: 3,
  };
  RC.addClue('clue1'); RC.addClue('clue2'); RC.addClue('clue3');
  const c2 = RC.endingConditions();
  check('条件齐备后 ok 为真', c2.ok === true,
    c2.items.map((i) => `${i.label}${i.done ? '✓' : '✗'}`).join('  '));

  const r = RC.triggerEnding();
  check('结局可触发', r.ok === true);
  check('进入自由模式', RC.inFreeMode() === true && RC.endingSeen() === true);
}

// ============ 8. 自由模式不再强制轮回 ============
section('8. 自由模式下轮回变为可选');
{
  const s = S.state;
  s.player.realmIndex = 25;
  const daoBefore = s.reincarnation.daoBase;
  const countBefore = s.reincarnation.count;
  // 再次触发飞升检查
  BT.attemptBreakthrough();
  check('自由模式下不再强制轮回',
    S.state.reincarnation.count === countBefore && S.state.reincarnation.daoBase === daoBefore,
    `count=${S.state.reincarnation.count}`);
}

// ============ 9. 旧存档兼容 ============
section('9. 旧存档兼容（V3 存档无 reincarnation 字段）');
{
  const saveMod = await import('../src/core/save.js');
  const old = JSON.parse(saveMod.serialize());
  delete old.reincarnation;
  delete old.companions;
  delete old.codex;
  const restored = saveMod.deserialize(JSON.stringify(old));
  check('补齐 reincarnation', !!restored.reincarnation && restored.reincarnation.count === 0);
  check('补齐 companions', !!restored.companions && Array.isArray(restored.companions.met));
  check('补齐 codex', !!restored.codex && Array.isArray(restored.codex.beasts));
  check('补齐后可正常结算道基点', (() => {
    S.setState(restored);
    return RC.calcDaoBase().total >= 0;
  })());
}

// ============ 结果 ============
console.log('\n' + '='.repeat(64));
console.log(failures === 0 ? '全部通过 ✓' : `有 ${failures} 项失败 ✗`);
process.exit(failures === 0 ? 0 : 1);
