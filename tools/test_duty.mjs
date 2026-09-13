/**
 * 本世功课自测（V6.0「功课」，前身是 V5.0 的「世业」自测）。
 *
 * 功课有一条其它系统没有的风险：**它是飞升的门禁**。
 * 判定出错不是"少个功能"，而是玩家**永久卡在渡劫期飞升不了**——
 * 而且不报错、不留痕，玩家只会觉得游戏坏了。
 *
 * 所以这里测的重点依次是：
 *   1. 数据表本身合法（含"宗门只能待在余课池"这条硬约束）
 *   2. 进度拉取对每一种 kind 都真的读到了正确的 state 字段（读错字段 = 永远 0 = 永久卡关）
 *   3. 立场准入：邪道做不了宗门功课，但**不影响他通关**
 *   4. 飞升门禁：主线未了不能飞升；余课要够数
 *   5. 改派这条"逃生通道"真的能用（不允许存在"这一世废了"）
 *   6. 跨世：第一世全览、后世抽样、旧档可迁移
 *
 * 用法: node tools/test_duty.mjs
 */

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const S = await import('../src/core/state.js');
const D = await import('../src/systems/duty.js');
const RC = await import('../src/systems/reincarnation.js');
const { dutyById, DUTIES, ACTS, mainDuties, sideDuties, samplingPool } = await import('../src/data/duties.js');
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

/** 造一门指定功课，直接塞进 state（用 sampled 模式，单独验进度拉取最省事） */
function force(id) {
  const def = dutyById(id);
  S.state.reincarnation.duties = [{
    id: def.id, kind: def.kind, target: def.target ?? null, need: def.need,
    progress: 0, done: false, rerolls: 1, assignedGen: 1, act: def.act ?? 1,
  }];
  S.state.reincarnation.dutyMode = 'sampled';
  return def;
}

function reset() {
  S.setState(S.createInitialState('功课测试'));
  S.state.reincarnation.count = 0;
  S.state.reincarnation.duties = [];
  S.state.reincarnation.dutyMode = 'full';
}

const one = () => D.currentDuties()[0];
const prog = (id) => { force(id); return D.computeProgress(one()); };
const setRealm = (i) => { S.state.player.realmIndex = i; };

// ============ 1. 数据表本身 ============
section('1. 功课数据表');
{
  check('功课总数 = 28（20 主线 + 8 余课）', DUTIES.length === 28, `${DUTIES.length} 门`);
  check('主线 20 门', mainDuties().length === 20, `${mainDuties().length} 门`);
  check('余课 8 门', sideDuties().length === 8, `${sideDuties().length} 门`);

  const ids = DUTIES.map((d) => d.id);
  check('id 不重复', new Set(ids).size === ids.length);

  check('每条都有名称', DUTIES.every((d) => typeof d.name === 'string' && d.name.trim()));
  check('每条都有题面', DUTIES.every((d) => typeof d.desc === 'string' && d.desc.trim()));
  check('每条都有指路', DUTIES.every((d) => typeof d.hint === 'string' && d.hint.trim()));
  check('need 都为正整数', DUTIES.every((d) => Number.isInteger(d.need) && d.need > 0));
  check('act 都在 0~8', DUTIES.every((d) => Number.isInteger(d.act) && d.act >= 0 && d.act <= 8));

  // 八幕每一幕都要有功课，否则那一幕在 UI 上是空的
  for (const a of ACTS) {
    const n = DUTIES.filter((d) => d.act === a.act).length;
    check(`第 ${a.act} 幕「${a.name}」有功课`, n >= 2, `${n} 门`);
  }
  // 幕的境界门槛必须递增，否则解锁顺序会乱
  const realms = ACTS.map((a) => a.minRealm);
  check('幕的境界门槛递增', realms.every((v, i) => i === 0 || v > realms[i - 1]), realms.join('<'));

  // kind 与数据表登记的一致（写错 kind = computeProgress 走 default = 永远 0 = 永久卡关）
  const { DUTY_KINDS } = await import('../src/data/duties.js');
  const unknown = DUTIES.filter((d) => !DUTY_KINDS.includes(d.kind));
  check('★ 所有 kind 都已登记', unknown.length === 0,
    unknown.map((d) => `${d.id}:${d.kind}`).join(',') || '干净');

  // ★ 硬约束：宗门功课只能在余课池
  // 一旦进主线，邪道玩家（canJoin 硬拒）就**永久无法飞升**
  const sectInMain = mainDuties().filter((d) => d.needsStance);
  check('★ 宗门功课不得进必做主线（邪道会永久卡关）', sectInMain.length === 0,
    sectInMain.map((d) => d.id).join(',') || '干净');
  const sectInSide = sideDuties().filter((d) => d.needsStance);
  check('宗门功课确实在余课池里', sectInSide.length === 2, `${sectInSide.length} 门`);

  // 余课池至少要够选：邪道要跳过 2 门，仍得凑够 SIDE_REQUIRED
  const avail = sideDuties().filter((d) => !d.needsStance).length;
  check('余课池够选（邪道跳过宗门后仍有余量）', avail >= D.SIDE_REQUIRED + 2, `可选 ${avail} 门`);

  // 抽样池剔除 firstOnly
  const pool = samplingPool();
  check('抽样池剔除 firstOnly', pool.every((d) => !d.firstOnly), `${pool.length} 门`);
  check('抽样池仍 ≥ 20', pool.length >= 20, `${pool.length} 门`);
}

// ============ 2. 进度拉取（读错字段 = 永久卡关） ============
section('2. ★ 进度拉取：每种 kind 都必须读到真实字段');
{
  reset();

  S.state.stats.breakthroughs = 4;
  check('breakthrough 读 stats.breakthroughs', prog('duty_break_pojing') === 4, String(prog('duty_break_pojing')));

  // 旧档口径（V5.0 的 combat / explore）仍要能算——
  // 老玩家迁移过来后，他原来那条劫数就是这两个 kind 之一，
  // 算不出来就是进度恒为 0、永久卡关。
  S.state.stats.kills = 7;
  S.state.reincarnation.duties = [{
    id: 'legacy_combat', kind: 'combat', target: null, need: 5,
    progress: 0, done: false, rerolls: 1, assignedGen: 1, act: 1,
  }];
  check('combat（旧档口径）读 stats.kills', D.computeProgress(one()) === 7, String(D.computeProgress(one())));

  S.state.stats.encounters = 9;
  S.state.reincarnation.duties = [{
    id: 'legacy_explore', kind: 'explore', target: null, need: 6,
    progress: 0, done: false, rerolls: 1, assignedGen: 1, act: 1,
  }];
  check('explore（旧档口径）读 stats.encounters', D.computeProgress(one()) === 9, String(D.computeProgress(one())));

  // --- 种类型：全部读 stats.kinds.* ---
  S.state.stats.kinds.slain = ['e1', 'e2', 'e3'];
  check('slayKinds 读 stats.kinds.slain（长度）', prog('duty_slay_liuzhong') === 3, String(prog('duty_slay_liuzhong')));

  S.state.stats.kinds.encounters = ['x1', 'x2'];
  check('encounterKinds 读 stats.kinds.encounters', prog('duty_explore_bajian') === 2, String(prog('duty_explore_bajian')));

  S.state.stats.kinds.pills = ['rc_a', 'rc_b', 'rc_c', 'rc_d'];
  check('pillKinds 读 stats.kinds.pills', prog('duty_pill_sanzhong') === 4, String(prog('duty_pill_sanzhong')));

  S.state.stats.kinds.forged = ['fr_a'];
  check('forgeKinds 读 stats.kinds.forged', prog('duty_forge_sanzhong') === 1, String(prog('duty_forge_sanzhong')));

  S.state.stats.kinds.shopBuy = ['pill:p1', 'material:m1'];
  check('shopKinds 读 stats.kinds.shopBuy', prog('duty_shop_hangshang') === 2, String(prog('duty_shop_hangshang')));

  // --- 其余新口径 ---
  S.state.combat.towerFloor = 23;
  check('tower 读 combat.towerFloor', prog('duty_tower_ershi') === 23, String(prog('duty_tower_ershi')));

  S.state.combat.winStreak = 6;
  check('streak 读 combat.winStreak', prog('duty_streak_lianjie') === 6, String(prog('duty_streak_lianjie')));

  S.state.stats.equipOps = 2;
  check('equipOps 读 stats.equipOps', prog('duty_equip_zhaojia') === 2, String(prog('duty_equip_zhaojia')));

  S.state.stats.companionMeets = 1;
  check('companionMeets 读 stats.companionMeets', prog('duty_comp_tongxing') === 1, String(prog('duty_comp_tongxing')));

  // 装备品阶：灵品是第 2 阶
  S.state.equipment.owned = [{ uid: 1, baseId: 'b', quality: 'fan' }];
  check('equipQuality 凡品不满灵品要求', prog('duty_equip_lingpin') === 0, String(prog('duty_equip_lingpin')));
  S.state.equipment.owned = [{ uid: 1, baseId: 'b', quality: 'ling' }];
  check('equipQuality 灵品达标', prog('duty_equip_lingpin') === 1, String(prog('duty_equip_lingpin')));
  S.state.equipment.owned = [{ uid: 1, baseId: 'b', quality: 'shen' }];
  check('equipQuality 神品也满仙品要求', prog('duty_equip_xianpin') === 1, String(prog('duty_equip_xianpin')));

  // 宗门
  S.state.sect.id = null;
  check('sectJoin 未入宗为 0', prog('duty_sect_baishan') === 0, String(prog('duty_sect_baishan')));
  S.state.sect.id = 'tianjian';
  check('sectJoin 入宗为 1', prog('duty_sect_baishan') === 1, String(prog('duty_sect_baishan')));
  S.state.sect.rank = 2;
  check('sectRank 读 sect.rank', prog('duty_sect_jinzhen') === 2, String(prog('duty_sect_jinzhen')));

  // 配方参悟
  S.state.alchemy.knownRecipes = ['a', 'b', 'c', 'd', 'e', 'f'];
  check('recipeCount/alchemy 读 knownRecipes', prog('duty_recipe_guangji') === 6, String(prog('duty_recipe_guangji')));
  S.state.forging.knownRecipes = ['a', 'b'];
  check('recipeCount/forge 读 forging.knownRecipes', prog('duty_recipe_cangfeng') === 2, String(prog('duty_recipe_cangfeng')));

  // 本世增量：图鉴 / 成就
  S.state.codex.pills = ['p1', 'p2', 'p3'];
  S.state.reincarnation.codexBaseline = 1;
  check('codexDelta = 当前 − 基线', prog('duty_codex_sishi') === 2, String(prog('duty_codex_sishi')));
  S.state.achievements.unlocked = ['a1', 'a2', 'a3', 'a4'];
  S.state.reincarnation.achBaseline = 1;
  check('achDelta = 当前 − 基线', prog('duty_ach_shier') === 3, String(prog('duty_ach_shier')));
  // 基线大于当前（手改档）不能出负数，否则进度条会画歪
  S.state.reincarnation.codexBaseline = 999;
  check('codexDelta 不为负', prog('duty_codex_sishi') === 0, String(prog('duty_codex_sishi')));
}

// ============ 3. 立场准入 ============
section('3. ★ 立场准入：邪道做不了宗门，但必须能通关');
{
  reset();
  const sect = sideDuties().find((d) => d.needsStance);

  S.state.player.stance = 'sanxiu';
  check('散修可做宗门功课', D.canDo({ id: sect.id }).ok === true);
  S.state.player.stance = 'xiedao';
  const gate = D.canDo({ id: sect.id });
  check('★ 邪道被宗门功课拦下', gate.ok === false);
  check('拦截理由指出去路（渡心魔劫）', /心魔劫/.test(gate.reason || ''), gate.reason || '');
  check('非宗门功课不受影响', D.canDo({ id: 'duty_tower_ershi' }).ok === true);

  // 洗白后自动解除——判定必须是动态的，不能抽签时定死
  S.state.player.stance = 'sanxiu';
  check('★ 洗白后自动解除灰显', D.canDo({ id: sect.id }).ok === true);
}

// ============ 4. 飞升门禁 ============
section('4. ★ 飞升门禁：功课未了则天门不开');
{
  reset();
  D.assignDuties(1);
  const all = D.currentDuties();
  check('第一世指派了 28 门', all.length === 28, `${all.length} 门`);
  check('第一世是 full 模式', D.currentMode() === 'full');

  check('开局全部未完成 → 不满足', D.dutySatisfied() === false);

  // 主线全清、余课 0 项 → 仍不满足
  for (const d of S.state.reincarnation.duties) if (d.act > 0) d.done = true;
  check('主线清空但余课为 0 → 仍不满足', D.dutySatisfied() === false);

  // 余课做满 2 项 → 满足
  let n = 0;
  for (const d of S.state.reincarnation.duties) {
    if (d.act === 0 && n < D.SIDE_REQUIRED) { d.done = true; n++; }
  }
  check('★ 主线全清 + 余课满 2 项 → 可飞升', D.dutySatisfied() === true);

  // 漏一门主线 → 又被拦下
  const firstMain = S.state.reincarnation.duties.find((d) => d.act > 0);
  firstMain.done = false;
  check('★ 漏一门主线 → 又不可飞升', D.dutySatisfied() === false);
  firstMain.done = true;

  // 旧档（无功课）必须放行，不能把老玩家卡在门外
  S.state.reincarnation.duties = [];
  check('★ 旧档无功课 → 放行', D.dutySatisfied() === true);
}

// ============ 5. 改派 ============
section('5. 改派：不允许"这一世废了"');
{
  reset();
  setSeed(20260913);
  D.assignDuties(2);                       // 抽签模式才有改派可言
  const before = D.currentDuties()[0].id;

  const r = D.rerollDuty(before);
  check('改派成功', r.ok === true, r.reason || '');
  check('改派后换了一门', r.duty && r.duty.id !== before, `${before} → ${r.duty?.id}`);
  check('改派消耗一次机会', r.duty && r.duty.rerolls === 0, String(r.duty?.rerolls));

  // ★ 列表里同时有多门功课时，改派很容易换出一门已在列表中的。
  // 一旦如此，按 id 反查会把另一条改掉，数组里就出现两条同 id：
  // UI 重复显示、必修计数虚高。这条断言专门钉这个 bug。
  const ids = S.state.reincarnation.duties.map((d) => d.id);
  check('★ 改派后列表无重复 id', new Set(ids).size === ids.length,
    `${ids.length} 门 / ${new Set(ids).size} 唯一`);
  check('改派后总数不变（是替换不是新增）', ids.length === D.SAMPLED_COUNT, `${ids.length} 门`);

  const again = D.rerollDuty(r.duty.id);
  check('机会用尽后不能再改', again.ok === false, again.reason || '');

  // 第一世是全览：28 门全在列表里，池外没有候选。改派该被**明确**拒绝，
  // 而不是返回一句让人困惑的"无课可换"。
  reset();
  D.assignDuties(1);
  const full = D.rerollDuty(D.currentDuties()[0].id);
  check('第一世不开改派（全览模式无池外候选）',
    full.ok === false && /第一世/.test(full.reason || ''), full.reason || '');
}

// ============ 6. 跨世 ============
section('6. 跨世：第一世全览 / 后世抽样 / 旧档迁移');
{
  reset();
  setSeed(20260913);

  // 第 2 世起抽 3 门
  const picked = D.assignDuties(2);
  check('第 2 世抽 3 门', picked.length === D.SAMPLED_COUNT, `${picked.length} 门`);
  check('第 2 世是 sampled 模式', D.currentMode() === 'sampled');

  const kinds = picked.map((d) => d.kind);
  check('★ 三门横跨不同类别（不出现三门同类）', new Set(kinds).size === kinds.length, kinds.join(','));

  const poolIds = new Set(samplingPool().map((d) => d.id));
  check('抽到的都在抽样池里', picked.every((d) => poolIds.has(d.id)), picked.map((d) => d.id).join(','));

  // firstOnly 永远不该被抽到
  let leaked = false;
  for (let i = 0; i < 300; i++) {
    const p = D.sampleDuties(3, []);
    if (p.some((d) => dutyById(d.id)?.firstOnly)) { leaked = true; break; }
  }
  check('★ 连抽 300 次不泄漏 firstOnly（老兵做不动的功课）', leaked === false);

  // 排除上一世
  const prevIds = picked.map((d) => d.id);
  let repeat = false;
  for (let i = 0; i < 200; i++) {
    const p = D.sampleDuties(3, prevIds);
    if (p.some((d) => prevIds.includes(d.id))) { repeat = true; break; }
  }
  check('★ 排除上一世做过的', repeat === false);

  // 旧档迁移：单条 duty → 数组
  const legacy = { duty: { id: 'duty_tower_ershi', kind: 'tower', need: 20, progress: 5, done: false, rerolls: 1 }, count: 3 };
  D.migrateDutyState(legacy);
  check('★ 旧档单条 duty 迁成数组', Array.isArray(legacy.duties) && legacy.duties.length === 1);
  check('旧档迁移后 duty 字段被清掉', legacy.duty === undefined);
  check('★ 老玩家落 sampled 模式（不被塞一份第一世主线）', legacy.dutyMode === 'sampled');
  check('迁移保留原进度', legacy.duties[0].progress === 5);

  // 幂等
  D.migrateDutyState(legacy);
  check('迁移幂等（重复调用不炸）', legacy.duties.length === 1);

  // 无 duty 的旧档
  const empty = { count: 0 };
  D.migrateDutyState(empty);
  check('无 duty 的旧档迁成空数组', Array.isArray(empty.duties) && empty.duties.length === 0);
}

// ============ 7. 不回退 ============
section('7. ★ 已了结的功课不回退');
{
  reset();
  force('duty_streak_lianjie');   // 连续取胜 10 场，need=10
  S.state.combat.winStreak = 10;
  const r1 = D.tickDuty();
  check('连胜 10 场即了结', one().done === true, JSON.stringify(r1.justDone));

  // 输一场，连胜清零 —— 但功课不能退回未完成
  S.state.combat.winStreak = 0;
  D.tickDuty();
  check('★ 败仗清零连胜后，功课仍算完成', one().done === true);
  check('进度不回落到 need 以下', one().progress >= 10, String(one().progress));
}

// ============ 8. missing（"还差什么"） ============
section('8. "还差什么"必须说得出来');
{
  reset();
  S.state.stats.kinds.slain = [];
  force('duty_slay_liuzhong');
  const m1 = D.dutyMissing(one());
  check('击败类给出缺失清单', m1.length > 0, `${m1.length} 种`);
  check('清单项带名字', m1.every((x) => x.id && x.name), JSON.stringify(m1[0]));

  const { ENEMIES } = await import('../src/data/enemies.js');
  S.state.stats.kinds.slain = [ENEMIES[0].id];
  const m2 = D.dutyMissing(one());
  check('缺失数 = 全集 − 已有', m2.length === ENEMIES.length - 1, `${m2.length} / ${ENEMIES.length}`);

  // 没有固定全集的 kind 不该硬凑清单
  force('duty_shop_hangshang');
  check('坊市类不硬凑缺失清单', D.dutyMissing(one()).length === 0);
}

// ============ 汇总 ============
console.log('\n' + '='.repeat(64));
if (failures) {
  console.log(`✗ ${failures} 项未通过`);
  process.exit(1);
} else {
  console.log('✓ 全部通过');
}
