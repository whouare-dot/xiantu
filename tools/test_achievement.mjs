/**
 * 成就系统自测。
 *
 * 覆盖任务要求的验收点：
 *   1. 新档初始解锁数合理（0~2 条）
 *   2. 境界设到 9 后 scan，能解锁对应成就
 *   3. 隐藏成就在未达成时不出现在「可见列表」
 *   4. 奖励不重复发放
 *   5. 旧存档（无 achievements 字段）能被 mergeDefaults 补齐并正常工作
 * 另外验证：事件计量器（连败后成功 / 残血翻盘 / 一回合取胜）、称号加成接入派生属性。
 *
 * 用法: node tools/test_achievement.mjs
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
const ach = await import('../src/systems/achievement.js');
const data = await import('../src/data/achievements.js');
const cultivation = await import('../src/systems/cultivation.js');
const saveMod = await import('../src/core/save.js');
const { emit, EV } = await import('../src/core/bus.js');
const { setSeed } = await import('../src/core/rng.js');

const { setState, createInitialState, stonesToLow } = S;
const { ACHIEVEMENTS, ACH_CATEGORIES } = data;

setSeed(20260911);

let failures = 0;
function check(name, cond, detail = '') {
  const ok = !!cond;
  if (!ok) failures++;
  console.log(`  ${ok ? '[OK]  ' : '[FAIL]'} ${name}${detail ? '  —— ' + detail : ''}`);
}
function section(t) {
  console.log('\n' + t);
  console.log('-'.repeat(66));
}
function reset(name = '测试散修') {
  setState(createInitialState(name));
  return S.state;
}
const ids = (arr) => arr.map((a) => a.id);

// ============ 1. 定义表结构 ============
section('1. 成就定义表结构');
const total = ACHIEVEMENTS.length;
check('成就总数 >= 60', total >= 60, `${total} 条`);
check('id 唯一', new Set(ACHIEVEMENTS.map((a) => a.id)).size === total);
check('全部有 name/desc/category/check',
  ACHIEVEMENTS.every((a) => a.name && a.desc && a.category && typeof a.check === 'function'));
const catCount = {};
for (const c of ACH_CATEGORIES) catCount[c.id] = data.achievementsByCategory(c.id).length;
console.log('  分类分布: ' + ACH_CATEGORIES.map((c) => `${c.name}=${catCount[c.id]}`).join(' , '));
check('修行 >= 14', catCount.cultivate >= 14, String(catCount.cultivate));
check('战斗 >= 12', catCount.combat >= 12, String(catCount.combat));
check('经营 >= 12', catCount.manage >= 12, String(catCount.manage));
check('际遇 >= 10', catCount.fortune >= 10, String(catCount.fortune));
check('隐秘 >= 8 且全部 hidden',
  catCount.secret >= 8 && data.achievementsByCategory('secret').every((a) => a.hidden === true),
  String(catCount.secret));
check('非隐秘分类无 hidden 泄漏',
  data.achievementsByCategory('cultivate').every((a) => !a.hidden) &&
  data.achievementsByCategory('combat').every((a) => !a.hidden) &&
  data.achievementsByCategory('manage').every((a) => !a.hidden) &&
  data.achievementsByCategory('fortune').every((a) => !a.hidden));

// ============ 2. 新档初始解锁数 ============
section('2. 新档初始解锁数（应 0~2）');
reset();
const freshNew = ach.checkAll();
const freshCount = ach.unlocked().length;
check('新档解锁数在 0~2 之间', freshCount >= 0 && freshCount <= 2, `实际 ${freshCount} 条`);
check('progress 总数与定义表一致', ach.progress().total === total,
  `${ach.progress().unlocked} / ${ach.progress().total}`);

// ============ 3. 境界里程碑 ============
section('3. 境界设到 9：解锁对应成就');
reset();
S.state.player.realmIndex = 9;
const at9 = ach.checkAll();
check('解锁了「道基初筑」', ach.isUnlocked('ach_cult_build'), ids(at9).join(','));
check('同时补上低境界里程碑', ach.isUnlocked('ach_cult_realm1') && ach.isUnlocked('ach_cult_realm9'));

// ============ 4. 隐藏成就不出现在可见列表 ============
section('4. 隐藏成就未达成时不可见');
reset();
const hiddenIds = data.achievementsByCategory('secret').map((a) => a.id);
const visIds = ach.visibleAchievements().map((a) => a.id);
check('可见列表不含任何未解锁隐藏成就',
  hiddenIds.every((id) => !visIds.includes(id)),
  `隐藏 ${hiddenIds.length} 条，可见列表 ${visIds.length} 条`);
check('可见列表 = 非隐藏 + 已解锁',
  ach.visibleAchievements().length === ACHIEVEMENTS.filter((a) => !a.hidden).length);
// 达成一条隐藏成就后即可见
reset();
S.state.player.base.luck = 100;
ach.checkAll();
check('达成后隐藏成就进入可见列表',
  ach.isUnlocked('ach_secret_luck100') && ach.visibleAchievements().some((a) => a.id === 'ach_secret_luck100'));

// ============ 5. 奖励不重复 ============
section('5. 奖励只发一次');
reset();
S.state.player.realmIndex = 9;
ach.checkAll();
const bal1 = stonesToLow();
const unlocked1 = ach.unlocked().length;
const again = ach.checkAll();
check('二次扫描不产生新解锁', again.length === 0, `newly=${again.length}`);
check('解锁数不变', ach.unlocked().length === unlocked1, `${unlocked1} → ${ach.unlocked().length}`);
check('灵石奖励未重复发放', stonesToLow() === bal1, `余额 ${bal1} → ${stonesToLow()}`);
// 手动重复调用 grantReward 也不能再发
ach.grantReward(data.achievementById('ach_cult_build'));
check('手动重发 grantReward 被幂等拦截', stonesToLow() === bal1, `余额 ${stonesToLow()}`);

// 属性型奖励同理
reset();
S.state.player.realmIndex = 12;
ach.checkAll();
const dao1 = S.state.player.attributes.daoHeart || 0;
check('属性奖励已发放（金丹成就 daoHeart +2）', dao1 === 2, `daoHeart=${dao1}`);
ach.grantReward(data.achievementById('ach_cult_jindan'));
check('属性奖励不重复', (S.state.player.attributes.daoHeart || 0) === dao1);

// ============ 6. 旧存档补齐 ============
section('6. 旧存档（无 achievements 字段）迁移');
reset('旧档');
const old = JSON.parse(JSON.stringify(S.state));
delete old.achievements;                      // 模拟 V2.0 旧档
old.meta.version = '2.0.0';
const merged = saveMod.deserialize(JSON.stringify(old));
check('mergeDefaults 补齐了 achievements 字段', !!merged?.achievements);
check('unlocked 为数组且初始为空', Array.isArray(merged?.achievements?.unlocked) && merged.achievements.unlocked.length === 0);
check('title 默认为 null', merged?.achievements?.title === null);
check('meters 计量器已补齐', typeof merged?.achievements?.meters?.brokeSec === 'number');
// 装载后能正常工作
setState(merged);
const afterLoad = ach.checkAll();
check('补齐后的旧档可正常扫描', Array.isArray(afterLoad) && ach.progress().total === total);
// 已有解锁记录不应被覆盖
const keep = JSON.parse(JSON.stringify(S.state));
keep.achievements.unlocked = ['ach_cult_realm1'];
keep.achievements.rewarded = ['ach_cult_realm1'];
const kept = saveMod.deserialize(JSON.stringify(keep));
check('旧档已有的解锁记录被保留',
  kept.achievements.unlocked.includes('ach_cult_realm1'), kept.achievements.unlocked.join(','));

// ============ 7. 事件计量器 ============
section('7. 事件计量器（隐藏成就）');
reset();
// 连败 5 次后突破成功
for (let i = 1; i <= 5; i++) emit(EV.REALM_FAIL, { loss: 0, fails: i });
emit(EV.REALM_BREAK, { realmIndex: 1 });
ach.checkAll();
check('枯木逢春：连败 5 次后突破成功', ach.isUnlocked('ach_secret_zenith'));

// 残血翻盘 + 一回合取胜
reset();
S.state.player.hp = Math.max(1, Math.floor(cultivation.calcMaxHp() * 0.03));
emit(EV.COMBAT_END, { enemyId: 'e1', enemyName: '试刀石', win: true, rounds: 1, opts: {} });
ach.checkAll();
check('一线生机：气血低于 5% 反败为胜', ach.isUnlocked('ach_secret_lastbreath'),
  `hp=${S.state.player.hp}/${cultivation.calcMaxHp()}`);
check('惊鸿一剑：一回合取胜', ach.isUnlocked('ach_secret_oneblow'));

// 赤贫满一小时
reset();
S.state.resources.stones = { low: 0, mid: 0, high: 0 };
ach.tickAchievements(3600);
check('两袖清风：0 灵石持续一小时', ach.isUnlocked('ach_secret_penny'),
  `brokeSec=${S.state.achievements.meters.brokeSec}`);

// ============ 8. 称号加成接入派生属性 ============
section('8. 称号加成');
reset();
S.state.player.base.daoHeart = 10;
S.state.stats.tribulationsPassed = 8;
ach.checkAll();
check('渡劫称号已解锁', ach.isUnlocked('ach_cult_trib8'));
const before = cultivation.calcDaoHeart();
const er = ach.equipTitle('ach_cult_trib8');
check('可佩戴称号', er.ok === true, er.title);
const afterT = cultivation.calcDaoHeart();
check('佩戴后道心 +8', afterT - before === 8, `${before} → ${afterT}`);
check('equippedTitle 返回称号', ach.equippedTitle()?.reward?.title === '九劫真人');
check('佩戴非称号成就被拒绝', ach.equipTitle('ach_cult_realm1').ok === false);
ach.equipTitle(null);
check('摘下后加成消失', cultivation.calcDaoHeart() === before, String(cultivation.calcDaoHeart()));

// ============ 结果 ============
console.log('\n' + '='.repeat(66));
console.log(`成就总数 ${total} 条；分类：` +
  ACH_CATEGORIES.map((c) => `${c.name} ${catCount[c.id]}`).join(' / '));
if (failures === 0) console.log('全部通过 ✓');
else console.log(`有 ${failures} 项失败 ✗`);
process.exit(failures === 0 ? 0 : 1);
