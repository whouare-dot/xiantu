/**
 * 经济与系统自测脚本。
 *
 * 运行： node tools/test_economy.mjs
 *
 * 覆盖：
 *   1. caveOffline 的离线产出与升级完成结算
 *   2. 炼丹失败返还一半材料
 *   3. 炼器产出的装备词条数与品阶匹配
 *   4. 坊市按境界过滤
 *   5. 灵石跨品阶扣费不出错、不为负
 *   6. 买入→卖出不产生无限刷灵石
 */

import { setSeed } from '../src/core/rng.js';
import * as S from '../src/core/state.js';
import * as inv from '../src/systems/inventory.js';
import * as alch from '../src/systems/alchemy.js';
import * as forge from '../src/systems/forging.js';
import * as cave from '../src/systems/cave.js';
import * as shop from '../src/systems/shop.js';
import { qualityOf } from '../src/data/qualities.js';
import { PILLS as PILLS_PLAIN } from '../src/data/pills.js';
import { MATERIALS as MATERIALS_PLAIN } from '../src/data/materials.js';
import { EQUIPMENTS as EQUIPMENTS_PLAIN } from '../src/data/equipments.js';

// ---------------- 迷你测试框架 ----------------

let passed = 0;
let failed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, err });
    console.log(`  ✗ ${name}\n      ${err.message}`);
  }
}

function eq(actual, expected, msg = '') {
  if (actual !== expected) {
    throw new Error(`${msg} 期望 ${expected}，实际 ${actual}`);
  }
}
function ok(cond, msg = '断言失败') {
  if (!cond) throw new Error(msg);
}
function section(title) {
  console.log(`\n== ${title} ==`);
}

let seedCounter = 1000;
/** 重置为干净状态并固定随机种子 */
function fresh(name = '测试者') {
  setSeed(20260911 + seedCounter++);
  const st = S.setState(S.createInitialState(name));
  st.meta.offlineCapHours = 8;
  return st;
}

const LOW = (n) => ({ low: n, mid: 0, high: 0 });

// ==================================================================
section('1. 洞府离线结算 caveOffline(8h)');
// ==================================================================
check('离线完成升级计时 + 灵田产出 + 报告内容', () => {
  const st = fresh();
  st.resources.stones = LOW(1_000_000_000);
  st.player.realmIndex = 0;
  st.cave.level = 4;
  const now = Date.now();
  st.cave.buildings = {
    bld_herb: { level: 3, upgradeEndsAt: null },
    bld_spirit: { level: 2, upgradeEndsAt: now - 5000 },   // 离线期间应完成 → 3
    bld_alchemy: { level: 1, upgradeEndsAt: now + 3600_000 }, // 未到期，保持 1
  };

  const rep = cave.caveOffline(3600 * 8);

  eq(rep.effectiveSeconds, 3600 * 8, '离线有效秒数');
  ok(rep.capped === false, '8 小时未超过封顶');

  eq(st.cave.buildings.bld_spirit.level, 3, 'bld_spirit 离线完成升级');
  eq(st.cave.buildings.bld_spirit.upgradeEndsAt, null, '完成后清空计时');
  eq(st.cave.buildings.bld_alchemy.level, 1, '未到期建筑不升级');
  ok(rep.completed.some((c) => c.id === 'bld_spirit'), '报告应含 bld_spirit 完工');

  const total = Object.values(rep.materials).reduce((a, b) => a + b, 0);
  // level3、interval 600、8h=28800s → 48 批 × 3 = 144
  eq(total, 144, '灵田 8 小时产出总量');
  ok(total > 0, '报告应含灵田产出');
});

check('离线产量受 offlineCapHours 封顶，但不影响升级完成', () => {
  const st = fresh();
  st.meta.offlineCapHours = 2;
  st.cave.level = 2;
  st.cave.buildings = {
    bld_herb: { level: 1, upgradeEndsAt: null },
    bld_spirit: { level: 1, upgradeEndsAt: Date.now() - 1000 },
  };
  const rep = cave.caveOffline(3600 * 8);
  eq(rep.effectiveSeconds, 3600 * 2, '产出封顶 2 小时');
  ok(rep.capped === true, '应标记封顶');
  const total = Object.values(rep.materials).reduce((a, b) => a + b, 0);
  eq(total, 12, '2h=7200s → 12 批 × 1');
  eq(st.cave.buildings.bld_spirit.level, 2, '升级不受产出封顶影响');
});

check('洞府等级扩建可离线完成', () => {
  const st = fresh();
  st.cave.level = 1;
  st.cave.buildings = {};
  st.resources.stones = LOW(1_000_000_000);
  const up = cave.upgradeCave();
  ok(up.ok, '发起洞府扩建');
  st.cave.upgradeEndsAt = Date.now() - 1000; // 假装已到点
  const rep = cave.caveOffline(60);
  eq(st.cave.level, 2, '洞府升至 2 级');
  eq(rep.caveLevelUp, 2, '报告含洞府升级');
});

// ==================================================================
section('2. 炼丹失败返还一半材料');
// ==================================================================
check('失败只扣一半材料（逐次校验）', () => {
  const st = fresh();
  st.resources.stones = LOW(1_000_000_000);
  // 悟性压到负数 → 成功率被夹到下限 0.05，保证能测到失败
  st.player.base.comprehension = -1000;
  st.player.attributes = { comprehension: 0, daoHeart: 0, spiritSense: 0, luck: 0 };

  const recipe = alch.allAlchemyRecipes()[0];
  ok(recipe, '应存在可用丹方');
  st.alchemy.knownRecipes = [recipe.id];
  st.alchemy.active = null;
  for (const m of recipe.materials) S.addMaterial(m.id, 500);

  let fails = 0;
  for (let i = 0; i < 40 && fails < 5; i++) {
    const before = {};
    for (const m of recipe.materials) before[m.id] = S.materialCount(m.id);
    const r = alch.craft(recipe.id);
    for (const m of recipe.materials) {
      const after = S.materialCount(m.id);
      const expect = r.ok
        ? before[m.id] - m.count
        : before[m.id] - m.count + Math.floor(m.count / 2);
      eq(after, expect, `${r.ok ? '成功' : '失败'}时 ${m.id} 数量`);
    }
    if (!r.ok) fails++;
  }
  ok(fails > 0, '应至少出现一次失败以验证返还（实际 0 次）');
});

check('成功扣全部材料并计入 stats.pillsMade', () => {
  const st = fresh();
  st.resources.stones = LOW(1_000_000_000);
  st.player.base.comprehension = 1000; // 成功率夹到上限
  st.player.attributes = { comprehension: 0, daoHeart: 0, spiritSense: 0, luck: 0 };

  const recipe = alch.allAlchemyRecipes()[0];
  st.alchemy.knownRecipes = [recipe.id];
  st.alchemy.active = null;
  for (const m of recipe.materials) S.addMaterial(m.id, 500);

  const madeBefore = st.stats.pillsMade || 0;
  const pillBefore = S.pillCount(recipe.pillId);
  let res = null;
  for (let i = 0; i < 500; i++) {
    const before = {};
    for (const m of recipe.materials) before[m.id] = S.materialCount(m.id);
    res = alch.craft(recipe.id);
    if (res.ok) {
      for (const m of recipe.materials) {
        eq(S.materialCount(m.id), before[m.id] - m.count, `成功时 ${m.id} 应扣全部`);
      }
      break;
    }
  }
  ok(res && res.ok, '500 次内应至少成功一次');
  eq(st.stats.pillsMade, madeBefore + 1, '应计入 stats.pillsMade');
  eq(S.pillCount(recipe.pillId), pillBefore + recipe.output, '应获得产物丹药');
});

check('未学会的丹方不能炼制，突破丹不可直服', () => {
  const st = fresh();
  const recipe = alch.allAlchemyRecipes()[0];
  st.alchemy.knownRecipes = [];
  const r = alch.craft(recipe.id);
  ok(!r.ok, '未学会应失败');

  S.addPill('pill_zhuji', 1);
  const u = inv.usePill('pill_zhuji');
  ok(!u.ok, '突破丹不可直接服用');
  eq(S.pillCount('pill_zhuji'), 1, '被拒绝时不消耗丹药');
});

// ==================================================================
section('3. 炼器产出：词条数与品阶匹配');
// ==================================================================
check('forge 产出的实例 affixes.length === quality.affixCount', () => {
  const st = fresh();
  st.player.base.comprehension = 600; // 提高成功率与升阶概率
  st.player.attributes = { comprehension: 0, daoHeart: 0, spiritSense: 0, luck: 0 };
  st.cave.buildings = { bld_forge: { level: 9, upgradeEndsAt: null } };

  const recipe = forge.allForgeRecipes()[0];
  ok(recipe, '应存在可用器图');
  st.forging.knownRecipes = [recipe.id];
  st.forging.active = null;
  for (const m of recipe.materials) S.addMaterial(m.id, 2000);

  let res = null;
  for (let i = 0; i < 300; i++) {
    res = forge.forge(recipe.id);
    if (res.ok) break;
  }
  ok(res && res.ok, '应至少成功炼出一件');
  ok(res.instance, '成功应返回实例');
  eq(res.instance.affixes.length, qualityOf(res.instance.quality).affixCount, '词条数应等于品阶规定数');
  for (const af of res.instance.affixes) {
    ok(af.stat && typeof af.value === 'number' && af.value > 0, '词条应有 stat 与正值');
  }
  ok(st.stats.itemsForged > 0, '应计入 stats.itemsForged');
});

check('rollAffixes 对凡品返回 0 条，且不出现重复词条', () => {
  const st = fresh();
  eq(inv.rollAffixes('fan', 1).length, 0, '凡品 0 词条');
  const sheng = inv.rollAffixes('sheng', 5);
  eq(sheng.length, 4, '圣品 4 词条');
  const stats = sheng.map((a) => a.stat);
  eq(new Set(stats).size, stats.length, '词条不应重复');
});

// ==================================================================
section('4. 坊市按境界过滤');
// ==================================================================
check('炼气期看不到化神期商品', () => {
  fresh();
  const s0 = shop.shopStock(0);
  ok(s0.pills.every((p) => p.minRealm <= 0), '丹药 minRealm 应 ≤ 0');
  ok(s0.equips.every((e) => e.minRealm <= 0), '装备 minRealm 应 ≤ 0');
  ok(!s0.pills.some((p) => p.id === 'pill_dujie'), '炼气期不应出现渡劫丹');
  ok(!s0.equips.some((e) => (e.tier ?? 1) > 2), '炼气期不应出现 tier>2 装备');

  const s23 = shop.shopStock(23);
  ok(s23.pills.some((p) => p.id === 'pill_dujie'), '渡劫期应能看到渡劫丹');
});

check('buy 越阶商品被拒绝', () => {
  const st = fresh();
  st.player.realmIndex = 0;
  st.resources.stones = LOW(1_000_000_000);
  const r = shop.buy('pill', 'pill_dujie', 1);
  ok(!r.ok, '低境界买高阶丹药应被拒');
});

// ==================================================================
section('5. 灵石跨品阶扣费');
// ==================================================================
check('上/中/下品混合扣费正确且不出负数', () => {
  const st = fresh();
  st.resources.stones = { low: 5, mid: 1, high: 1 }; // = 10105 下品
  const before = S.stonesToLow();
  ok(S.spendStones(150), '应扣费成功');
  eq(S.stonesToLow(), before - 150, '折算总量应精确减少 150');
  const s = st.resources.stones;
  ok(s.low >= 0 && s.mid >= 0 && s.high >= 0, '各品阶不为负');
  ok(Number.isInteger(s.low) && Number.isInteger(s.mid) && Number.isInteger(s.high), '各品阶为整数');
});

check('灵石不足时扣费失败且状态不变', () => {
  const st = fresh();
  st.resources.stones = { low: 3, mid: 0, high: 0 };
  const snap = JSON.stringify(st.resources.stones);
  ok(!S.spendStones(100), '不足应返回 false');
  eq(JSON.stringify(st.resources.stones), snap, '失败不应改动灵石');
  eq(S.stonesToLow(), 3, '总量保持');
});

check('normalizeStones 正确进位', () => {
  const st = fresh();
  st.resources.stones = { low: 250, mid: 0, high: 0 };
  S.normalizeStones();
  eq(st.resources.stones.mid, 2, '250 下品 → 2 中品');
  eq(st.resources.stones.low, 50, '余 50 下品');
});

// ==================================================================
section('6. 买入→卖出不产生无限刷灵石');
// ==================================================================
check('丹药买卖必亏', () => {
  const st = fresh();
  st.resources.stones = LOW(100_000);
  st.player.realmIndex = 0;
  // 聚气丹是修为丹，已从坊市下架（见 data/pills.js），这里改用货架上的回气丹
  const pill = shop.shopStock(0).pills.find((p) => p.id === 'pill_huiqi');
  ok(pill, '应有回气丹');
  const s0 = S.stonesToLow();
  ok(shop.buy('pill', pill.id, 1).ok, '买入应成功');
  const s1 = S.stonesToLow();
  ok(s1 < s0, '买入后应减少');
  ok(shop.sell('pill', pill.id, 1).ok, '卖出应成功');
  const s2 = S.stonesToLow();
  ok(s2 <= s0, `买卖后不应净增（${s2} ≤ ${s0}）`);
  eq(st.resources.stones.low >= 0, true, '灵石不为负');
});

check('材料买卖必亏', () => {
  const st = fresh();
  st.resources.stones = LOW(1_000_000);
  const mat = shop.shopStock(0).materials.find((m) => m.id === 'mat_lingzhi');
  const s0 = S.stonesToLow();
  ok(shop.buy('material', mat.id, 10).ok, '买入材料');
  ok(shop.sell('material', mat.id, 10).ok, '卖出材料');
  const s2 = S.stonesToLow();
  ok(s2 <= s0, `材料买卖不应净增（${s2} ≤ ${s0}）`);
});

check('装备买卖必亏', () => {
  const st = fresh();
  st.resources.stones = LOW(1_000_000);
  st.player.realmIndex = 0;
  const eqp = shop.shopStock(0).equips[0];
  const s0 = S.stonesToLow();
  const b = shop.buy('equip', eqp.id, 1);
  ok(b.ok, '买入装备');
  const uid = b.gained.uid;
  const s1 = S.stonesToLow();
  ok(s1 < s0, '买入后减少');
  const sl = shop.sell('equip', uid);
  ok(sl.ok, '卖出装备');
  const s2 = S.stonesToLow();
  ok(s2 <= s0, `装备买卖不应净增（${s2} ≤ ${s0}）`);
  ok(!S.state.equipment.owned.some((e) => e.uid === uid), '卖出后实例应移除');
});

check('100 次买卖循环灵石单调不增', () => {
  const st = fresh();
  st.resources.stones = LOW(10_000_000);
  st.player.realmIndex = 0;
  const pill = shop.shopStock(0).pills[0];
  const mat = shop.shopStock(0).materials[0];
  let prev = S.stonesToLow();
  for (let i = 0; i < 100; i++) {
    shop.buy('pill', pill.id, 1);
    shop.sell('pill', pill.id, 1);
    shop.buy('material', mat.id, 1);
    shop.sell('material', mat.id, 1);
    const now = S.stonesToLow();
    ok(now <= prev + 1e-6, `第 ${i} 轮出现净增：${prev} → ${now}`);
    prev = now;
  }
  ok(S.stonesToLow() >= 0, '循环后不为负');
});

check('炼制产物出售价 < 材料买入成本（不可刷）', () => {
  fresh();
  // 全部丹方都查，不只第一条：修为丹已从坊市下架（data/pills.js 的 noShop），
  // 查货架会漏掉它们，所以价格一律从价格函数取，与是否上架无关。
  for (const recipe of alch.allAlchemyRecipes()) {
    const pill = PILLS_PLAIN.find((p) => p.id === recipe.pillId);
    ok(pill, `${recipe.id} 的产物 ${recipe.pillId} 应在 pills.js 里`);
    let matCost = 0;
    for (const m of recipe.materials) {
      matCost += shop.materialBuyPrice(MATERIALS_PLAIN.find((x) => x.id === m.id)) * m.count;
    }
    const sell = shop.pillSellPrice(pill);
    ok(sell < matCost, `${pill.name} 出售价(${sell})应小于材料成本(${matCost})`);
  }
});

check('锻造产物出售价 < 材料买入成本（不可刷）', () => {
  fresh();
  // 与丹药同一条铁律：炼器的成功率也会被炼器室与悟性抬到 0.98，
  // 所以"装备价 ÷ 材料买入价"必须低于 1/SELL_RATE ≈ 2.857，否则满成功率能套利。
  for (const r of forge.allForgeRecipes()) {
    const base = EQUIPMENTS_PLAIN.find((e) => e.id === r.equipId);
    ok(base, `${r.id} 的产物 ${r.equipId} 应在 equipments.js 里`);
    let matCost = 0;
    for (const m of r.materials) {
      matCost += shop.materialBuyPrice(MATERIALS_PLAIN.find((x) => x.id === m.id)) * m.count;
    }
    // 保底品阶 = 基础品阶，无词条、1 级 → 估值就等于 price
    const sell = Math.floor(base.price * 0.35);
    ok(sell < matCost, `${base.name} 出售价(${sell})应小于材料成本(${matCost})`);
    ok(base.price > matCost, `${base.name} 售价应高于材料成本（否则买成品比买材料还便宜）`);
  }
});

check('背包分组数据结构可渲染', () => {
  const st = fresh();
  st.resources.stones = LOW(5000);
  // 新档自带初始行囊（青纹铁剑 + 粗布道袍），所以用"增量"断言而非绝对值
  const before = inv.groupInventory().equipment.length;
  const boughtId = shop.shopStock(0).equips[0].id;
  shop.buy('equip', boughtId, 1);
  // 同上：聚气丹已下架，用货架上的回气丹
  shop.buy('pill', 'pill_huiqi', 2);
  const g = inv.groupInventory();
  ok(Array.isArray(g.equipment) && g.equipment.length === before + 1,
    `装备分组（购买前 ${before} 件，购买后应为 ${before + 1} 件，实际 ${g.equipment.length}）`);
  ok(g.equipment.some((e) => e.baseId === boughtId), '购买到的装备出现在分组里');
  ok(Array.isArray(g.materials), '材料分组');
  ok(g.pills.some((p) => p.id === 'pill_huiqi' && p.count === 2), '丹药分组含数量');
  ok(typeof g.stones.totalLow === 'number', '灵石折算');
  ok(inv.inventoryValue() > 0, '估值应大于 0');
});

// ==================================================================
section('7. 后台炼制与自动化门槛');
// ==================================================================
check('startCraft + tickAlchemy 能结算后台炉', () => {
  const st = fresh();
  st.resources.stones = LOW(1_000_000_000);
  st.player.base.comprehension = 1000;
  const recipe = alch.allAlchemyRecipes()[0];
  st.alchemy.knownRecipes = [recipe.id];
  for (const m of recipe.materials) S.addMaterial(m.id, 100);

  const r = alch.startCraft(recipe.id);
  ok(r.ok, '起火应成功');
  ok(st.alchemy.active, '应有进行中的炼丹');
  st.alchemy.active.endsAt = Date.now() - 1; // 假装已到点
  alch.tickAlchemy(1);
  eq(st.alchemy.active, null, 'tick 后应结算并清空');
});

check('startForge + tickForge 能结算后台炉', () => {
  const st = fresh();
  st.player.base.comprehension = 1000;
  st.cave.buildings = { bld_forge: { level: 9, upgradeEndsAt: null } };
  const recipe = forge.allForgeRecipes()[0];
  st.forging.knownRecipes = [recipe.id];
  for (const m of recipe.materials) S.addMaterial(m.id, 100);

  const r = forge.startForge(recipe.id);
  ok(r.ok, '开炉应成功');
  ok(st.forging.active, '应有进行中的炼器');
  st.forging.active.endsAt = Date.now() - 1;
  forge.tickForge(1);
  eq(st.forging.active, null, 'tick 后应结算并清空');
});

check('自动炼丹 / 自动炼器受建筑等级门槛限制', () => {
  const st = fresh();
  st.cave.buildings = {
    bld_alchemy: { level: 2, upgradeEndsAt: null },
    bld_forge: { level: 2, upgradeEndsAt: null },
  };
  st.alchemy.knownRecipes = [alch.allAlchemyRecipes()[0].id];
  st.forging.knownRecipes = [forge.allForgeRecipes()[0].id];

  ok(!alch.setAutoAlchemy(true).ok, '丹房 2 级不应解锁自动炼丹');
  ok(!forge.setAutoForge(true).ok, '炼器室 2 级不应解锁自动炼器');

  st.cave.buildings.bld_alchemy.level = 3;
  st.cave.buildings.bld_forge.level = 3;
  ok(alch.setAutoAlchemy(true).ok, '丹房 3 级应解锁');
  ok(forge.setAutoForge(true).ok, '炼器室 3 级应解锁');
});

// ==================================================================

console.log('\n──────────────────────────────');
console.log(`通过 ${passed} 项，失败 ${failed} 项`);
if (failed > 0) {
  console.log('\n失败详情：');
  for (const f of failures) {
    console.log(`  ✗ ${f.name}\n    ${f.err.stack?.split('\n').slice(0, 3).join('\n    ')}`);
  }
  process.exitCode = 1;
} else {
  console.log('全部通过 ✓');
}
