/**
 * 整局模拟（跨系统集成测试）。
 *
 * 前面的测试各自只验一个系统。这个脚本把全部系统放进同一个循环里跑，
 * 模拟一个真实玩家"挂机 → 突破 → 炼丹 → 建洞府 → 探险 → 打塔"的完整过程，
 * 用来抓那些只在系统交界处才暴露的问题（资源死锁、状态互相踩踏、异常中断）。
 *
 * 用法: node tools/smoke_session.mjs [模拟天数]
 */

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const S = await import('../src/core/state.js');
const cultivation = await import('../src/systems/cultivation.js');
const breakthrough = await import('../src/systems/breakthrough.js');
const combat = await import('../src/systems/combat.js');
const cave = await import('../src/systems/cave.js');
const alchemy = await import('../src/systems/alchemy.js');
const forging = await import('../src/systems/forging.js');
const shop = await import('../src/systems/shop.js');
const inv = await import('../src/systems/inventory.js');
const explore = await import('../src/systems/explore.js');
const encounter = await import('../src/systems/encounter.js');
const achievement = await import('../src/systems/achievement.js');
const { REALMS } = await import('../src/data/realms.js');
const { setSeed } = await import('../src/core/rng.js');
const { fmt, fmtDuration, fmtStones } = await import('../src/core/format.js');

const DAYS = parseFloat(process.argv[2] || '6');
const totalSeconds = Math.round(DAYS * 86400);

setSeed(20260911);
S.setState(S.createInitialState('模拟者'));
let state = S.state;

// 让模拟玩家有个中等偏上的灵根，接近真实玩家体验
state.player.spiritRoot = { id: 'di', name: '地灵根', mult: 1.8, desc: '' };

const errors = [];
const milestones = [];
const realmReachedAt = new Map();
realmReachedAt.set(0, 0);

let lastRealm = 0;
let ticks = 0;
let lastUpgradeTry = 0;
let lastExploreTry = 0;
let lastShopTry = 0;
let lastForgeTry = 0;
let lastTowerTry = 0;

function guard(label, fn) {
  try {
    return fn();
  } catch (e) {
    errors.push(`[t=${fmtDuration(ticks)} @${state.player.realmIndex}] ${label}: ${e.message}`);
    return null;
  }
}

console.log(`开始模拟 ${DAYS} 天（${totalSeconds} 秒游戏时间）...\n`);

for (let t = 0; t < totalSeconds; t++) {
  ticks = t;

  // ---- 每秒：修炼主循环 ----
  guard('cultivation.tick', () => cultivation.tick(1));

  // ---- 每 10 秒：突破 ----
  if (t % 10 === 0) {
    guard('breakthrough', () => {
      // 模拟玩家会自动买突破丹
      const r = S.realm();
      if (r.needPill && (state.consumables[r.needPill] || 0) < 1) {
        shop.buy('pill', r.needPill, 1);
      }
      // 真实玩家是手动点突破的，这里直接调 attemptBreakthrough，
      // 而不是依赖 meta.autoBreakthrough 开关（那会漏测整条突破链路）
      const chk = breakthrough.canBreakthrough();
      if (!chk.ok) return;
      if (breakthrough.inTribulation()) {
        breakthrough.runTribulation({ autoHeal: true });
        return;
      }
      const res = breakthrough.attemptBreakthrough();
      if (res?.tribulation) breakthrough.runTribulation({ autoHeal: true });
    });

    if (state.player.realmIndex !== lastRealm) {
      lastRealm = state.player.realmIndex;
      if (!realmReachedAt.has(lastRealm)) realmReachedAt.set(lastRealm, t);
      const r = REALMS[lastRealm];
      if (lastRealm % 3 === 0 || lastRealm === 25) {
        milestones.push(`${fmtDuration(t).padStart(9)}  第 ${String(lastRealm).padStart(2)} 境  ${r.name}`);
      }
    }
  }

  // ---- 每 60 秒：洞府升级（有余钱就升） ----
  if (t % 60 === 0 && t - lastUpgradeTry >= 60) {
    lastUpgradeTry = t;
    guard('cave', () => {
      cave.tickCave(60);
      const stones = S.stonesToLow();
      // 优先升洞府本体与聚灵阵
      const caveCost = cave.caveUpgradeCost();
      if (caveCost && stones > caveCost * 3) cave.upgradeCave();
      for (const id of ['bld_spirit', 'bld_herb', 'bld_alchemy', 'bld_forge', 'bld_library', 'bld_ward']) {
        const st = cave.buildingStatus(id);
        if (st.canUpgrade && S.stonesToLow() > (st.cost || 0) * 3) {
          cave.upgradeBuilding(id);
          break;   // 一次只开一个工地
        }
      }
    });
  } else {
    guard('cave.tickCave', () => cave.tickCave(1));
  }

  // ---- 每 120 秒：炼丹 / 炼器 ----
  if (t % 120 === 0) {
    guard('alchemy', () => {
      alchemy.tickAlchemy(120);
      for (const r of alchemy.allAlchemyRecipes()) {
        if (!alchemy.knownRecipes().includes(r.id)) {
          if (S.stonesToLow() > (r.unlockCost || 0) * 4) alchemy.learnRecipe(r.id);
        } else if (alchemy.canCraft(r.id).ok) {
          alchemy.craft(r.id);
          break;
        }
      }
    });
    guard('forging', () => {
      forging.tickForge(120);
      for (const r of forging.allForgeRecipes()) {
        if (!forging.knownForgeRecipes().includes(r.id)) {
          if (S.stonesToLow() > (r.unlockCost || 0) * 6) forging.learnForgeRecipe(r.id);
        } else if (forging.canForge(r.id).ok) {
          forging.forge(r.id);
          break;
        }
      }
    });
  }

  // ---- 每 300 秒：坊市（补丹 + 换装备） ----
  if (t % 300 === 0 && t - lastShopTry >= 300) {
    lastShopTry = t;
    guard('shop', () => {
      const ri = state.player.realmIndex;
      const stock = shop.shopStock(ri);
      // 买得起的高级装备就换上
      for (const e of (stock.equips || []).slice().reverse()) {
        const price = shop.equipBuyPrice?.(e) ?? e.price;
        if (S.stonesToLow() > price * 2) {
          if (shop.buy('equip', e.id, 1).ok) {
            const inst = state.equipment.owned[state.equipment.owned.length - 1];
            if (inst) inv.equipItem(inst.uid);
          }
          break;
        }
      }
      // 补疗伤丹
      if ((state.consumables.pill_liaoshang || 0) < 3 && S.stonesToLow() > 600) {
        shop.buy('pill', 'pill_liaoshang', 3);
      }
    });
  }

  // ---- 每 37 秒：探险（有冷却，canExplore 会拦） ----
  if (t - lastExploreTry >= 37) {
    lastExploreTry = t;
    guard('explore', () => {
      explore.tickExplore(37);
      const c = explore.canExplore();
      if (c.ok) explore.explore();
    });
  }

  // ---- 每 20 分钟：打一次试炼塔（真实玩家不会每 90 秒硬撞一次） ----
  if (t - lastTowerTry >= 1200) {
    lastTowerTry = t;
    guard('tower', () => {
      const floor = (state.combat.towerFloor || 0) + 1;
      combat.challengeTower(floor);
    });
  }

  // ---- 成就（节流：内部自己控制扫描频率，这里每秒喂一次即可） ----
  guard('achievement', () => {
    achievement.tickAchievements?.(1);
  });

  // ---- 奇遇 ----
  guard('encounter', () => {
    encounter.tickEncounter(1);
    // 待处理的奇遇自动选第一个可用选项，模拟玩家随手点。
    // 注意用 c.index（原始下标）：显示顺序已被打乱，遍历序号是错的。
    const cur = encounter.currentEncounter?.();
    if (cur) {
      const view = encounter.presentEncounter(cur, encounter.currentOrder?.());
      const first = view?.choices?.find((c) => !c.disabled);
      if (first) encounter.resolveEncounter(first.index);
    }
  });
}

// ==================== 报告 ====================

console.log('境界里程碑');
console.log('-'.repeat(52));
for (const m of milestones) console.log('  ' + m);

// 每境界实际耗时 vs 零加成基准，用来判断实际倍率是否越过了 24 倍软上限
console.log('\n各境界实际耗时与隐含倍率');
console.log('-'.repeat(66));
console.log('  境界              零加成基准      实测耗时     隐含倍率');
const reached = [...realmReachedAt.entries()].sort((a, b) => a[0] - b[0]);
let overCap = [];
for (let i = 0; i < reached.length; i++) {
  const [ri, at] = reached[i];
  const next = reached[i + 1];
  if (!next || ri >= 25) continue;
  const dwell = next[1] - at;
  const r = REALMS[ri];
  if (!r.needCult) continue;
  const baseSec = r.needCult / r.baseSpeed;
  const mult = baseSec / Math.max(1, dwell);
  const flag = mult > 26 ? '  ← 超出 24 倍上限' : '';
  if (mult > 26) overCap.push(r.name);
  console.log(
    `  ${r.name.padEnd(8)} ${fmtDuration(baseSec).padStart(12)} ${fmtDuration(dwell).padStart(14)}` +
    `${mult.toFixed(1).padStart(11)}×${flag}`,
  );
}
if (overCap.length) {
  console.log(`\n  ⚠ ${overCap.length} 个境界的实际倍率超过软上限，说明有额外修为来源（事件/战斗/探险）。`);
}

console.log('\n最终状态');
console.log('-'.repeat(52));
console.log('  境界      ', REALMS[state.player.realmIndex].name);
console.log('  灵石      ', fmtStones(state.resources.stones));
console.log('  装备件数  ', state.equipment.owned.length);
console.log('  已学功法  ', Object.keys(state.techniques.known).length);
console.log('  已悟丹方  ', state.alchemy.knownRecipes.length);
console.log('  已悟图纸  ', state.forging.knownRecipes.length);
console.log('  试炼塔    ', `第 ${state.combat.towerFloor} 层（最高 ${state.combat.towerBest}）`);
console.log('  灵材种类  ', Object.keys(state.resources.materials).length);
console.log('  统计      ', JSON.stringify(state.stats));
try {
  const pr = achievement.progress?.();
  if (pr) console.log('  成就      ', `${pr.unlocked} / ${pr.total}`);
} catch (e) { console.log('  成就      ', '(读取失败: ' + e.message + ')'); }

console.log('\n系统异常')
console.log('-'.repeat(52));
if (errors.length === 0) {
  console.log('  无');
} else {
  const uniq = [...new Set(errors)];
  console.log(`  共 ${errors.length} 次，去重后 ${uniq.length} 类：`);
  for (const e of uniq.slice(0, 15)) console.log('   · ' + e);
}

// 卡关检测
const stuck = totalSeconds > 3600 && state.player.realmIndex < 5;
console.log('\n结论');
console.log('-'.repeat(52));
if (errors.length === 0 && !stuck) {
  console.log('  通过：全部系统在长时间运行下无异常，境界推进正常。');
} else {
  if (stuck) console.log('  可疑：模拟 ' + DAYS + ' 天后境界仍低于炼气六层，疑似卡关。');
  if (errors.length) console.log('  失败：存在系统异常。');
}
process.exit(errors.length === 0 && !stuck ? 0 : 1);
