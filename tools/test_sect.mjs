/**
 * 宗门系统自测（V3.0）。
 *
 * 覆盖任务验收点：
 *   1. 数据表结构：三宗门 / 宝库 ≥24 件且 ref 真实 / 任务 ≥12 条 / 建筑 5 座
 *   2. 未达境界不能拜入；拜入后 state.sect.id 正确
 *   3. 贡献不足不能晋升；贡献达标可晋升且俸禄正确（含每日俸禄发放）
 *   4. 贡献不足不能兑换宝库；兑换后贡献正确扣除
 *   5. 宗门建筑升级走绝对时间戳、离线可完成
 *   6. 每日任务当天不能重复领
 *   7. 宗门战：胜方得贡献；败方损失贡献但境界与已解锁内容不变
 *   8. 贡献稀缺性：一天正常玩法所得「远小于」换空宝库一层所需
 *   9. 叛宗：贡献清零、好感下降、进入冷却
 *
 * 用法: node tools/test_sect.mjs
 */

// Node 环境没有 localStorage，state→save 链路会用到，给个内存实现
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
};

const S = await import('../src/core/state.js');
const sect = await import('../src/systems/sect.js');
const data = await import('../src/data/sects.js');
const { pillById } = await import('../src/data/pills.js');
const { materialById } = await import('../src/data/materials.js');
const { equipById } = await import('../src/data/equipments.js');
const { alchemyRecipeById, forgeRecipeById } = await import('../src/data/recipes.js');
const { techById } = await import('../src/data/techniques.js');
const { beastById, evolutionDepth } = await import('../src/data/beasts.js');
const { tickBeasts } = await import('../src/systems/beast.js');
const { setSeed } = await import('../src/core/rng.js');

const { setState, createInitialState, stonesToLow, materialCount, pillCount, addMaterial } = S;

setSeed(20260911);

let failures = 0;
function check(name, cond, detail = '') {
  const ok = !!cond;
  if (!ok) failures++;
  console.log(`  ${ok ? '[OK]  ' : '[FAIL]'} ${name}${detail ? '  —— ' + detail : ''}`);
}
function section(t) {
  console.log('\n' + t);
  console.log('-'.repeat(70));
}
function reset(name = '测试散修', realmIndex = 9) {
  setState(createInitialState(name));
  S.state.player.realmIndex = realmIndex;
  return S.state;
}

/**
 * 冻结"今天"，让每日任务的轮换可复现。
 *
 * ⚠ 这段是补的，因为有过一次真实教训：每日任务是「按日索引在任务池上取一段连续窗口」，
 * 于是**某些日子整窗口都是缴丹药类、一条缴材料类都没有**。
 * 原来的测试直接 `quests.find(q => q.kind === 'donate_material')`，
 * 昨天跑得过、今天（恰好轮到丹药窗口）就崩在 `undefined.target`。
 * 一行代码没改，测试自己坏了——**依赖真实日历的测试不算测试**。
 */
function withFrozenDay(dateStr, fn) {
  const RealDate = globalThis.Date;
  const stamp = new RealDate(dateStr + 'T12:00:00').getTime();
  class FrozenDate extends RealDate {
    constructor(...args) { super(...(args.length ? args : [stamp])); }
    static now() { return stamp; }
  }
  globalThis.Date = FrozenDate;
  try { return fn(); } finally { globalThis.Date = RealDate; }
}

/** 从今天起往后扫，找第一个"今日任务里含指定类别"的日子（最多扫 60 天） */
function findDayWith(kind) {
  for (let i = 0; i < 60; i++) {
    const d = new Date(2026, 0, 1 + i);
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const hit = withFrozenDay(ds, () => sect.dailyQuestIds()
      .some((id) => data.sectQuestById(id)?.kind === kind));
    if (hit) return ds;
  }
  return null;
}

// ============ 1. 数据表结构 ============
section('1. 数据表结构');
check('宗门数 = 3', data.SECTS.length === 3, data.SECTS.map((s) => s.name).join(' / '));
check('宗门 id 唯一', new Set(data.SECTS.map((s) => s.id)).size === 3);
check('宝库 ≥ 24 件', data.SECT_VAULT.length >= 24, `${data.SECT_VAULT.length} 件`);
check('宝库覆盖 5 个 tier',
  [...new Set(data.SECT_VAULT.map((v) => v.tier))].sort().join(',') === '1,2,3,4,5');
check('任务 ≥ 12 条', data.SECT_QUESTS.length >= 12, `${data.SECT_QUESTS.length} 条`);
const qk = new Set(data.SECT_QUESTS.map((q) => q.kind));
check('任务覆盖 捐材料/交丹药/试炼 三类',
  qk.has('donate_material') && qk.has('donate_pill') && qk.has('trial_battle'),
  [...qk].join(','));
check('建筑 = 5 座', data.SECT_BUILDINGS.length === 5,
  data.SECT_BUILDINGS.map((b) => b.name).join(' / '));

// 宝库 ref 真实性
let badRefs = [];
for (const v of data.SECT_VAULT) {
  if (v.kind === 'pill' && !pillById(v.ref)) badRefs.push(`${v.id}→${v.ref}`);
  else if (v.kind === 'material' && !materialById(v.ref)) badRefs.push(`${v.id}→${v.ref}`);
  else if (v.kind === 'equip' && !equipById(v.ref)) badRefs.push(`${v.id}→${v.ref}`);
  else if (v.kind === 'technique' && !techById(v.ref)) badRefs.push(`${v.id}→${v.ref}`);
  else if (v.kind === 'recipe' && !(alchemyRecipeById(v.ref) || forgeRecipeById(v.ref))) badRefs.push(`${v.id}→${v.ref}`);
  // 灵兽蛋必须校验。这里原本写着"由并行 Agent 提供，不校验"，
  // 结果 beast_liehuo / beast_bixi 两个假 id 上线：贡献照扣，孵化时蛋静默消失。
  else if (v.kind === 'beast_egg' && !beastById(v.ref)) badRefs.push(`${v.id}→${v.ref}`);
}
check('宝库 ref 全部命中真实 id', badRefs.length === 0, badRefs.join(', ') || '');

// ============ 2. 拜入校验 ============
section('2. 拜入校验');
reset('凡人', 0);
check('炼气期不能拜入', sect.canJoin('tianjian').ok === false, sect.canJoin('tianjian').reason);
check('炼气期 joinSect 被拒', sect.joinSect('tianjian').ok === false);
check('state.sect.id 仍为 null', S.state.sect.id === null);

reset('筑基修士', 9);
check('筑基期可拜入', sect.canJoin('tianjian').ok === true);
const jr = sect.joinSect('tianjian');
check('joinSect 成功', jr.ok === true);
check('state.sect.id 正确', S.state.sect.id === 'tianjian', String(S.state.sect.id));
check('初始职位为外门弟子', S.state.sect.rank === 0 && sect.rankInfo().name === '外门弟子');
check('拜入后立场转正道', S.state.player.stance === 'zhengdao', S.state.stance);
check('重复拜入被拒', sect.joinSect('baicao').ok === false, sect.joinSect('baicao').reason);

// ============ 3. 晋升与俸禄 ============
section('3. 职位晋升与俸禄');
reset('晋升者', 9);
sect.joinSect('tianjian');
check('贡献不足不能晋升', sect.promote().ok === false, sect.promote().reason);
sect.addContribution(299, '测试');
check('299 贡献仍不能晋升', sect.promote().ok === false);
const pr = sect.addContribution(901, '测试'); // 累计 1200
check('贡献达标（1200）可连升', sect.promote().ok === true,
  `contribution=${pr}`);
check('升到真传弟子（rank 2）', S.state.sect.rank === 2, String(S.state.sect.rank));
const ri = sect.rankInfo();
check('俸禄与职位表一致（真传 8000）', ri.salary.stones === 8000, String(ri.salary.stones));
check('解锁宝库 3 层 / 建筑位 4', ri.vaultTier === 3 && ri.buildingSlots === 4,
  `tier=${ri.vaultTier} slots=${ri.buildingSlots}`);
check('下一级提示还差贡献', ri.next && ri.next.name === '长老' && ri.next.remain === 2800,
  JSON.stringify(ri.next));

// 每日俸禄发放：把 questDate 拨到昨天，tickSect 应补发
const beforeStones = stonesToLow();
const beforeLingzhi = materialCount('mat_lingzhi');
S.state.sect.questDate = '2000-01-01';
const tick = sect.tickSect(1);
check('tickSect 发放俸禄', !!tick.salary, JSON.stringify(tick.salary));
check('俸禄灵石正确入账（8000）', stonesToLow() - beforeStones === 8000,
  `${beforeStones} → ${stonesToLow()}`);
check('俸禄含稀有材料', tick.salary.materials.length > 0
  && materialCount('mat_jiuyelian') > 0,
  `九叶莲 ${beforeLingzhi} → ${materialCount('mat_jiuyelian')}`);
check('重置后今日任务为空', S.state.sect.questsDone.length === 0);
check('questDate 更新为今日', S.state.sect.questDate === sect.todayStr());

// ============ 4. 宝库兑换 ============
section('4. 宝库兑换');
reset('兑换者', 9);
sect.joinSect('tianjian');
check('外门可见 tier1、不可见 tier2',
  sect.vaultList().length > 0 && sect.vaultList().every((v) => v.tier === 1),
  `${sect.vaultList().length} 件可见`);
check('贡献不足不能兑换', sect.exchange('sv_juqi').ok === false, sect.exchange('sv_juqi').reason);
check('贡献不足兑换不扣贡献', (S.state.sect.contribution || 0) === 0);

sect.addContribution(1000, '测试');
const cBefore = S.state.sect.contribution;
const pillBefore = pillCount('pill_juqi');
const ex = sect.exchange('sv_juqi');
check('兑换成功', ex.ok === true, ex.reason || '');
check('贡献正确扣除 400', S.state.sect.contribution === cBefore - 400,
  `${cBefore} → ${S.state.sect.contribution}`);
check('货品正确入库（聚气丹 +10）', pillCount('pill_juqi') - pillBefore === 10,
  `${pillBefore} → ${pillCount('pill_juqi')}`);

// 职位不足：真传才可见的 tier3 对外门不可见
const tier3 = data.SECT_VAULT.find((v) => v.tier === 3);
check('低职位看不到高 tier 货', !sect.vaultList().some((v) => v.id === tier3.id));

// 一次性功法不在身时可换、换后不可重复换（升到长老可见 tier4）
reset('长老', 9);
sect.joinSect('tianjian');
sect.addContribution(9000, '测试');   // 够晋升长老(4000)，又够换 tier4 功法(8000)
sect.promote();
check('已升长老（rank3）', S.state.sect.rank === 3, String(S.state.sect.rank));
const teBefore = Object.keys(S.state.techniques.known).length;
check('兑换宗门专属功法', sect.exchange('sv_tech_wanjian').ok === true);
check('功法已习得', !!S.state.techniques.known.tech_wanjian);
check('已习得后不可重复兑换', sect.exchange('sv_tech_wanjian').ok === false,
  sect.exchange('sv_tech_wanjian').reason);

// ============ 4.5 灵兽蛋：兑换 → 孵化 → 入册（端到端） ============
// 这一段是补的回归测试：宝库灵兽蛋曾经写死两个不存在的 ref，
// 贡献照扣、蛋照发，孵化时才静默消失。只校验 ref 不够，必须走完全程。
section('4.5 灵兽蛋端到端（兑换 → 孵化 → 入册）');
reset('御兽者', 9);
sect.joinSect('tianjian');
sect.addContribution(300, '测试');
sect.promote();                                     // 内门弟子（rank1），可见 tier2
check('内门弟子即可见灵兽蛋（不必等到真传）',
  sect.vaultList().some((v) => v.kind === 'beast_egg'),
  `${sect.vaultList().filter((v) => v.kind === 'beast_egg').length} 种可见`);

const eggDefs = data.SECT_VAULT.filter((v) => v.kind === 'beast_egg');
check('宝库有灵兽蛋可换', eggDefs.length > 0, `${eggDefs.length} 种`);
check('灵兽蛋只出进化链链首（高阶形态仍须自己养）',
  eggDefs.every((v) => { const b = beastById(v.ref); return b && evolutionDepth(v.ref) === 0; }),
  eggDefs.map((v) => v.ref).join(', '));

sect.addContribution(1200, '测试');
const eggDef = eggDefs[0];
const cBefore2 = S.state.sect.contribution;
const exEgg = sect.exchange(eggDef.id);
check('兑换灵兽蛋成功', exEgg.ok === true, exEgg.reason || '');
check('贡献正确扣除', S.state.sect.contribution === cBefore2 - eggDef.cost,
  `${cBefore2} → ${S.state.sect.contribution}（价 ${eggDef.cost}）`);

const egg = (S.state.beasts?.eggs || []).find((e) => e.baseId === eggDef.ref);
check('蛋已入 state.beasts.eggs', !!egg, JSON.stringify(S.state.beasts?.eggs || []));
check('蛋的 baseId 命中真实物种', !!egg && !!beastById(egg.baseId), eggDef.ref);

// 模拟离线：把破壳时间拨到过去，tickBeasts 应结算
if (egg) egg.hatchAt = Date.now() - 1000;
const hatchRes = tickBeasts(0);
const hatched = (S.state.beasts?.owned || []).find((b) => b.baseId === eggDef.ref);
check('离线后孵化出灵兽（不再是静默消失）', !!hatched,
  `owned = ${(S.state.beasts?.owned || []).map((b) => b.baseId).join(',') || '空'}`);
check('孵化后蛋被移出列表', !(S.state.beasts?.eggs || []).includes(egg));
check('孵化事件可被返回', hatchRes.hatched.length >= 1);
check('新孵化的灵兽资质在 1~5 星', !!hatched && hatched.star >= 1 && hatched.star <= 5,
  hatched ? `${hatched.star}★ Lv${hatched.level}` : '');

// ============ 5. 宗门建筑（时间戳 / 离线） ============
section('5. 宗门建筑：绝对时间戳与离线完成');
reset('建造者', 9);
sect.joinSect('tianjian');
S.state.resources.stones = { low: 0, mid: 0, high: 0 };
check('灵石不足不能动工', sect.upgradeSectBuilding('bld_arena').ok === false,
  sect.upgradeSectBuilding('bld_arena').reason);

S.addStones(100000);
const ur = sect.upgradeSectBuilding('bld_arena');
check('开始修建', ur.ok === true);
check('使用绝对完成时间戳（在未来）',
  typeof S.state.sect.buildings.bld_arena.upgradeEndsAt === 'number'
  && S.state.sect.buildings.bld_arena.upgradeEndsAt > Date.now(),
  String(S.state.sect.buildings.bld_arena.upgradeEndsAt - Date.now()) + 'ms');
check('修建中不可重复动工', sect.upgradeSectBuilding('bld_arena').ok === false,
  sect.upgradeSectBuilding('bld_arena').reason);
const st = sect.buildingStatus('bld_arena');
check('buildingStatus 反映在建与倒计时', st.upgrading === true && st.remaining > 0,
  `remaining=${st.remaining}s`);

// 模拟离线：把完成时间拨到过去，tickSect 应结算
S.state.sect.buildings.bld_arena.upgradeEndsAt = Date.now() - 1000;
const tk = sect.tickSect(0);
check('离线后 tickSect 完成升级', S.state.sect.buildings.bld_arena.level === 1,
  `level=${S.state.sect.buildings.bld_arena.level}`);
check('完成事件可被返回', tk.completed.some((c) => c.id === 'bld_arena'));

// 建筑位限制：外门 2 个位置
S.addStones(1000000);
sect.upgradeSectBuilding('bld_pagoda');           // 第二座（level 0→在建）
S.state.sect.buildings.bld_pagoda.upgradeEndsAt = Date.now() - 1;
sect.tickSect(0);                                  // 建成，第 2 座
const third = sect.upgradeSectBuilding('bld_ward'); // ward reqRank 1，先卡职位
check('职位不足不能建护宗大阵', third.ok === false, third.reason);

// ============ 6. 每日任务不可重复 ============
section('6. 每日任务不可重复领');

// 整节冻结在一个「今日任务含缴材料类」的日子上跑——否则轮到"全缴丹药"的窗口时会崩
const MAT_DAY = findDayWith('donate_material');
check('能找到一个含「缴材料」任务的日子', !!MAT_DAY, MAT_DAY || '扫了 60 天都没有？');

withFrozenDay(MAT_DAY || '2026-01-01', () => {
  reset('任务者', 9);
  sect.joinSect('tianjian');
  const quests = sect.dailyQuests();
  check('每日轮换 5 条', quests.length === 5, quests.map((q) => q.name).join('、'));
  const donate = quests.find((q) => q.kind === 'donate_material');
  check('该日确有缴材料任务', !!donate, quests.map((q) => q.kind).join(','));
  if (!donate) return;

  addMaterial(donate.target, donate.need);
  const f1 = sect.finishQuest(donate.id);
  check('任务可完成', f1.ok === true, f1.reason || '');
  check('完成得贡献', S.state.sect.contribution === donate.contribution,
    `贡献=${S.state.sect.contribution}`);
  const f2 = sect.finishQuest(donate.id);
  check('同日不可重复领', f2.ok === false, f2.reason);
  check('重复领不产生贡献', S.state.sect.contribution === donate.contribution);
  // 材料被正确消耗
  check('材料被扣除', materialCount(donate.target) === 0, String(materialCount(donate.target)));

  // 次日重置后可再接
  S.state.sect.questDate = '2000-01-01';
  sect.tickSect(1);
  check('跨日任务重置', S.state.sect.questsDone.length === 0);

  // 试炼任务：战力不足拒绝
  const trial = sect.dailyQuests().find((q) => q.kind === 'trial_battle');
  if (trial) {
    S.state.player.realmIndex = 9;
    const tr = sect.finishQuest(trial.id);
    check('试炼任务可按战力判定', typeof tr.ok === 'boolean',
      `${trial.target}: ${tr.ok ? '通过' : tr.reason}`);
  }
});

// 补两条：轮换的覆盖性与多样性
{
  const seen = new Set();
  let singleKindDays = 0;
  const DAYS = 60;
  for (let i = 0; i < DAYS; i++) {
    const d = new Date(2026, 0, 1 + i);
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    withFrozenDay(ds, () => {
      const ids = sect.dailyQuestIds();
      for (const id of ids) seen.add(id);
      const kinds = new Set(ids.map((id) => data.sectQuestById(id)?.kind));
      if (kinds.size <= 1) singleKindDays++;
    });
  }
  check('60 天内任务池被完整轮换到', seen.size === data.SECT_QUESTS.length,
    `${seen.size} / ${data.SECT_QUESTS.length}`);

  // ★ 这条是补的：任务池按类别聚簇排列，早先用"连续窗口"取样时
  //   某些日子 5 条全是缴丹药、一条缴材料都没有，玩家连做几天同一件事。
  //   实测撞到过（find(kind==='donate_material') 返回 undefined 导致测试崩溃）。
  check('★ 每天的任务跨多个类别（不是清一色）', singleKindDays === 0,
    `${DAYS} 天里有 ${singleKindDays} 天只有一类`);
}

// ============ 7. 宗门战 ============
section('7. 宗门战结算');
reset('战神', 9);
sect.joinSect('tianjian');
const ws0 = sect.warStatus();
check('战前可结算', ws0.canResolve === true);
check('下次结算倒计时为正', ws0.settleCountdown > 0, `${ws0.settleCountdown}s`);
check('存在两个对手', ws0.opponents.length === 2,
  ws0.opponents.map((o) => `${o.name}:${o.power}`).join(' / '));

// 胜方
const realmBefore = S.state.player.realmIndex;
const techBefore = Object.keys(S.state.techniques.known).sort().join(',');
const equipBefore = S.state.equipment.owned.length;
const recipeBefore = (S.state.alchemy.knownRecipes || []).length;
const stonesBefore = stonesToLow();
const warWin = sect.resolveWar({ force: 'win' });
check('结算返回战报', warWin.ok === true && Array.isArray(warWin.report.lines),
  `${warWin.report?.lines?.length} 行战报`);
check('胜方得贡献', S.state.sect.contribution === warWin.report.contributionGain
  && warWin.report.contributionGain > 0,
  `+${warWin.report.contributionGain}`);
check('胜方得灵石', stonesToLow() > stonesBefore, `${stonesBefore} → ${stonesToLow()}`);
check('战报逐条可展示', warWin.report.lines.every((l) => l.text && typeof l.cls === 'string'));
check('战报入 warLog', S.state.sect.warLog.length === 1);
check('同季不可重复结算', sect.resolveWar().ok === false, sect.resolveWar().reason);

// 败方：损失贡献，但不掉境界 / 职位 / 已解锁内容
const contribBefore = S.state.sect.contribution;
const warLose = sect.resolveWar({ force: 'lose' });
check('败方损失贡献', warLose.ok === true
  && S.state.sect.contribution < contribBefore
  && S.state.sect.contribution >= 0,
  `${contribBefore} → ${S.state.sect.contribution}（损 ${warLose.report.contributionLoss}）`);
check('境界不变', S.state.player.realmIndex === realmBefore, String(S.state.player.realmIndex));
check('职位不变', S.state.sect.rank === 0, String(S.state.sect.rank));
check('已习得功法不变',
  Object.keys(S.state.techniques.known).sort().join(',') === techBefore);
check('装备不变', S.state.equipment.owned.length === equipBefore);
check('已解锁丹方不变', (S.state.alchemy.knownRecipes || []).length === recipeBefore);

// 护宗大阵减免战败损失
reset('阵法师', 9);
sect.joinSect('tianjian');
S.addStones(1000000);
sect.addContribution(5000, '测试');
sect.promote(); // 到内门，可建 ward(reqRank1)
sect.upgradeSectBuilding('bld_ward');
S.state.sect.buildings.bld_ward.upgradeEndsAt = Date.now() - 1;
sect.tickSect(0);
const wardLv = S.state.sect.buildings.bld_ward.level;
const c1 = S.state.sect.contribution;
const lossNoWard = 120;
const r2 = sect.resolveWar({ force: 'lose' });
const actualLoss = c1 - S.state.sect.contribution;
check('护宗大阵减免战败损失', wardLv >= 1 && actualLoss < lossNoWard,
  `ward=${wardLv} 级，实损 ${actualLoss} < 未减免 ${lossNoWard}`);

// 战报文本可读
check('战报含文字行', warLose.report.lines[0].text.length > 0,
  warLose.report.lines.map((l) => l.text).join(' | ').slice(0, 120));

// ============ 8. 贡献稀缺性 ============
section('8. 贡献稀缺性断言');
const top5 = [...data.SECT_QUESTS]
  .map((q) => q.contribution)
  .sort((a, b) => b - a)
  .slice(0, sect.DAILY_QUEST_COUNT === 5 ? 5 : 5)
  .reduce((a, b) => a + b, 0);
const avgQuest = data.SECT_QUESTS.reduce((a, q) => a + q.contribution, 0) / data.SECT_QUESTS.length;
const warWinGain = warWin.report.contributionGain; // 外门胜方实测值
const dailyMax = top5 + warWinGain / 7;
const dailyTypical = avgQuest * 5 + warWinGain / 7;
const tier1Total = data.vaultTierCost(1);
const tier2Total = data.vaultTierCost(2);

console.log(`  每日任务贡献上限（取最高 5 条）：${top5}`);
console.log(`  宗门战胜方贡献 / 7（折日）：${(warWinGain / 7).toFixed(1)}`);
console.log(`  一天正常玩法贡献上限 ≈ ${dailyMax.toFixed(1)}，典型 ≈ ${dailyTypical.toFixed(1)}`);
console.log(`  宝库第一层换空需：${tier1Total}（第二层 ${tier2Total}）`);
check('一天上限远不足换空第一层（×8 仍不够）',
  dailyMax * 8 <= tier1Total,
  `${dailyMax.toFixed(1)} × 8 = ${(dailyMax * 8).toFixed(0)} <= ${tier1Total}`);
check('换空第一层至少需 9 天以上',
  tier1Total / dailyMax >= 9,
  `${(tier1Total / dailyMax).toFixed(1)} 天`);
check('典型收益下换空第一层需 10 天以上',
  tier1Total / dailyTypical >= 10,
  `${(tier1Total / dailyTypical).toFixed(1)} 天`);
check('第二层更贵（分层递增）', tier2Total > tier1Total, `${tier1Total} → ${tier2Total}`);

// ============ 9. 叛宗 ============
section('9. 叛宗代价');
reset('叛徒', 9);
sect.joinSect('tianjian');
sect.addContribution(2000, '测试');
const br = sect.betraySect();
check('叛宗成功', br.ok === true);
check('贡献清零', S.state.sect.contribution === 0);
check('回到散修', S.state.sect.id === null && S.state.player.stance === 'sanxiu');
check('好感下降', (S.state.sect.affinity.tianjian || 0) < 50,
  `好感=${S.state.sect.affinity.tianjian}`);
check('进入立场冷却', S.state.player.stanceCooldownUntil > Date.now(),
  `剩 ${Math.ceil((S.state.player.stanceCooldownUntil - Date.now()) / 1000)}s`);
check('冷却中不能再拜入', sect.canJoin('baicao').ok === false, sect.canJoin('baicao').reason);

// ============ 结果 ============
console.log('\n' + '='.repeat(70));
console.log(`宝库 ${data.SECT_VAULT.length} 件 / 任务 ${data.SECT_QUESTS.length} 条 / 建筑 ${data.SECT_BUILDINGS.length} 座`);
if (failures === 0) console.log('全部通过 ✓');
else console.log(`有 ${failures} 项失败 ✗`);
process.exit(failures === 0 ? 0 : 1);
