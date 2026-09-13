/**
 * 演示档自检（临时脚手架，与 src/dev/demoSave.js 一起删）。
 *
 * 为什么需要它：演示档是"手写字段 + 系统演算"混出来的，
 * 最坏的情况不是抛异常，而是某个页签悄悄空了——打开游戏才发现。
 * 这个脚本把每个页签的"有没有内容"翻译成断言，改完立刻能验。
 *
 * 跑法：node tools/test_demo_save.mjs
 */

import { state, realmAt } from '../src/core/state.js';
import { buildDemoState } from '../src/dev/demoSave.js';
import { dutySummary } from '../src/systems/duty.js';
import { activeBuffs } from '../src/systems/cultivation.js';
import { canBreakthrough, attemptBreakthrough } from '../src/systems/breakthrough.js';

let pass = 0, fail = 0;
const bad = [];

function ok(cond, label, detail = '') {
  if (cond) { pass++; return; }
  fail++;
  bad.push(`${label}${detail ? ' —— ' + detail : ''}`);
}

const { report } = buildDemoState();
const s = state;

console.log('=== 演示档自检 ===\n');
for (const [k, v] of Object.entries(report)) console.log(`  ${k.padEnd(14)} ${v}`);

console.log('\n--- 各页签内容 ---');
const sum = dutySummary();
const codexTotal = ['techniques', 'equipped', 'pills', 'materials', 'beasts', 'enemies', 'encounters']
  .reduce((n, k) => n + (s.codex[k] || []).length, 0);
const tabs = {
  cultivate: s.player.cult > 0,
  technique: Object.keys(s.techniques.known).length,
  talent: Object.values(s.reincarnation.talents).reduce((a, b) => a + b, 0),
  cave: Object.keys(s.cave.buildings).length,
  sect: s.sect.id || '未入',
  beast: s.beasts.owned.length,
  companion: s.companions.met.length,
  alchemy: s.alchemy.knownRecipes.length,
  forge: s.forging.knownRecipes.length,
  inventory: s.equipment.owned.length,
  achievement: (s.achievements.unlocked || []).length,
  codex: codexTotal,
  world: (s.flags.worldSeen || []).length,
  shop: '按境界自动出货',
  tower: s.combat.towerFloor,
  reincarnation: `${sum.mainDone}/${sum.mainTotal} 主线`,
  info: Object.keys(s.stats).length,
};
for (const [k, v] of Object.entries(tabs)) console.log(`  ${k.padEnd(14)} ${v}`);

console.log('\n--- 功课逐门 ---');
for (const a of sum.acts) {
  console.log(`  第${a.act}幕「${a.name}」${a.unlocked ? '' : '（未解锁，需 ' + a.minRealm + '）'}`);
  for (const d of a.duties) {
    const mark = d.satisfied ? '✔' : '·';
    console.log(`    ${mark} ${d.name.padEnd(6)} ${String(d.progress).padStart(3)}/${d.need}`);
  }
}
console.log(`  余课（需 ${sum.sideRequired} 项，已成 ${sum.sideDone}）`);
for (const d of sum.side) {
  console.log(`    ${d.satisfied ? '✔' : '·'} ${d.name.padEnd(6)} ${String(d.progress).padStart(3)}/${d.need}`);
}

console.log('\n--- 断言 ---');

// 境界与解锁：17 个页签里唯一有门禁的是这些
ok(s.player.realmIndex === 23, '停在大乘期', `realmIndex=${s.player.realmIndex}`);
ok(s.player.realmIndex >= 9, '宗门/道侣页已解锁');
ok(s.player.realmIndex >= 6, '炼器页已解锁');
ok(s.player.realmIndex >= 5, '试炼页已解锁');
ok(s.player.realmIndex >= 3, '炼丹页已解锁');

// 每个页签都要有东西（不是"能打开"而是"打开有内容"）
ok(Object.keys(s.techniques.known).length >= 4, '功法页有已学功法');
ok(Object.values(s.reincarnation.talents).reduce((a, b) => a + b, 0) > 0, '天赋页有已点等级');
ok(s.reincarnation.daoBase > 0, '天赋页有点数可花（当场能再点一级）');
ok(s.cave.level >= 5 && Object.keys(s.cave.buildings).length >= 4, '洞府页有等级有建筑');
ok(!!s.sect.id && s.sect.rank >= 2, '宗门页已拜入且职位≥真传');
ok((s.sect.warLog || []).length >= 3, '宗门战有战报记录', `warLog=${(s.sect.warLog || []).length}`);
ok((s.sect.questsDone || []).length > 0, '宗门任务有已完成记录');
ok(s.beasts.owned.length >= 4, '灵兽页有四只以上');
ok(s.beasts.active != null, '灵兽有出战单位');
ok((s.beasts.eggs || []).length > 0, '灵兽页有在孵的蛋');
ok(Object.keys(s.beasts.bloodlines).length >= 2, '灵兽页有血脉记忆');
ok(s.companions.met.length >= 3, '道侣页结识了三位');
ok(!!s.companions.active, '道侣已立同行者');
ok(Object.values(s.companions.stories || {}).some((a) => (a || []).length > 0), '道侣有已读剧情');
ok(s.alchemy.knownRecipes.length >= 6, '炼丹页有已悟丹方');
ok(s.forging.knownRecipes.length >= 6, '炼器页有已悟器图');
ok(s.equipment.owned.length >= 12, '背包页装备足够多');
ok(Object.keys(s.consumables).length >= 12, '背包页丹药种类足够多');
ok(Object.keys(s.resources.materials).length >= 12, '背包页灵材足够多');
ok((s.achievements.unlocked || []).length >= 20, '成就页解锁了足够多');
ok(codexTotal >= 100, '图鉴页收集过百', `codex=${codexTotal}`);
ok(s.combat.towerFloor >= 20, '试炼页层数够高');
ok(activeBuffs().length >= 2, '左栏状态面板有增益');
ok((s.log || []).length >= 10, '修行日志有内容');
ok(!!s.achievements.title || (s.achievements.unlocked || []).length > 0, '成就页可佩称号');

// 突破链路：录视频要能一按就渡天劫
ok(s.player.cult < (s.player.cult + 1), '修为值有效');
ok((s.consumables.pill_wudao || 0) > 0, '包里有大乘期突破所需的悟道丹');
ok(s.combat.winStreak >= 10, '有连胜记录（斗法功课）');

// 功课：主线大部分完成、留几门在途，才有"进度条在走"的画面
ok(sum.mainDone >= 12, '主线已完成过半', `${sum.mainDone}/${sum.mainTotal}`);
ok(sum.mainDone < sum.mainTotal, '主线没全做完（要留目标）');
ok(sum.sideDone >= sum.sideRequired, '余课已达飞升要求');
const inFlight = [...sum.acts.flatMap((a) => a.duties), ...sum.side]
  .filter((d) => !d.satisfied && d.progress > 0);
ok(inFlight.length >= 3, '至少三门功课"做到一半"', `在途=${inFlight.length}`);

// 轮回页
ok(s.reincarnation.count === 0, '第一世（count=0）');
ok(sum.mode === 'full', '走八幕主线模式');
ok(sum.mainTotal === 20 && sum.side.length === 8, '功课数量为 20 + 8');
ok(s.reincarnation.codexBaseline === 0 && s.reincarnation.achBaseline === 0,
  '本世增量基线为 0（否则功课会被自己的收藏秒过）');

// 派生值必须自洽——面板第一眼就看这些
ok(s.player.hp === s.player.maxHp && s.player.hp > 1000, '气血已按加成算满');
ok(s.player.mp === s.player.maxMp, '灵力已按加成算满');
ok(s.player.lifespan >= 45000, '寿元与大乘期相称', `${s.player.lifespan}`);
ok(s.resources.stones.high > 0 && s.resources.stones.mid < 100, '灵石已进位规范');

// ---- 突破链路：放在最后，因为它会推进状态 ----
// 大乘期一按就该进天劫——这是这份演示档最核心的那一下，不能只是"看着像"。
s.player.cult = realmAt(23).needCult;
const can = canBreakthrough();
ok(can.ok, '修为圆满后「突破」可用', can.reason);
const br = attemptBreakthrough();
ok(br.tribulation === true, '大乘期突破转入天劫流程', JSON.stringify(br).slice(0, 80));
ok(s.tribulation?.targetRealm === 24, '天劫目标为渡劫期', `target=${s.tribulation?.targetRealm}`);
ok((s.tribulation?.rounds || []).length === 3, '三劫轮转齐备');
ok((br.chances || []).every((c) => c.chance > 0.15 && c.chance <= 0.95), '三劫通过率在合理区间',
  (br.chances || []).map((c) => `${c.name}${Math.round(c.chance * 100)}%`).join(' '));

console.log(`\n${fail === 0 ? '✔ 全部通过' : '✘ 有失败项'}：${pass} 通过 / ${fail} 失败`);
if (fail) {
  console.log('\n失败项：');
  for (const b of bad) console.log('  - ' + b);
  process.exit(1);
}
