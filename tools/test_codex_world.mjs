/**
 * 图鉴 + 世界天象 自测（V4.0）。
 *
 * 用法: node tools/test_codex_world.mjs
 *
 * 覆盖：
 *   A. 图鉴
 *     - record / has / progress / overallProgress 正确
 *     - 未收集条目返回 ??? 语义（displayName / unseenOf）
 *     - 自动补录能把初始行囊等已有物品收进图鉴
 *     - 收集加成汇总正确且量级克制（满图鉴只有几个百分点）
 *   B. 世界天象
 *     - 轮换确定性：同一时间戳两次结果相同
 *     - 跨过轮换点后天象/时段改变
 *     - timeLeft 递减正确、永不为负
 *     - 负面天象确实带正面补偿
 *     - eventBonus 汇总正确
 */

import { setState, createInitialState } from '../src/core/state.js';
import { CODEX_KINDS } from '../src/systems/codex.js';
import * as codex from '../src/systems/codex.js';
import { WORLD_EVENTS, eventById } from '../src/data/worldEvents.js';
import * as we from '../src/systems/worldEvent.js';

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
  codex.resetCodexTick();
  we.resetWorldEvent();
}
const allIds = (kind) => CODEX_KINDS.find((k) => k.id === kind).table.map((e) => e.id);
const fill = (kind) => { for (const id of allIds(kind)) codex.record(kind, id); };

// ============================================================
section('A1. 图鉴：记录 / 查询 / 进度');
reset();
check('record 首次收录返回 true', codex.record('techniques', 'tech_qingfeng') === true);
check('重复 record 返回 false', codex.record('techniques', 'tech_qingfeng') === false);
check('has 能查到已收录条目', codex.has('techniques', 'tech_qingfeng') === true);
check('record 拒绝不存在的 id', codex.record('techniques', 'tech_不存在') === false);
check('record 拒绝未知分类', codex.record('nope', 'x') === false);

const p0 = codex.progress('techniques');
check('progress.total 与数据表一致', p0.total === allIds('techniques').length,
  `${p0.got}/${p0.total}`);
check('progress.pct = got/total', Math.abs(p0.pct - p0.got / p0.total) < 1e-9);
for (const k of CODEX_KINDS) {
  check(`分类 ${k.name}(${k.id}) 的总数 > 0`, codex.progress(k.id).total === k.table.length,
    String(k.table.length));
}

// ============================================================
section('A2. 图鉴：未收集显示 ??? 语义');
reset();
check('未收集 displayName 返回 ???', codex.displayName('pills', 'pill_juqi') === '???',
  codex.displayName('pills', 'pill_juqi'));
check('已收集 displayName 返回真名',
  (codex.record('pills', 'pill_juqi'), codex.displayName('pills', 'pill_juqi') === '聚气丹'));
const unseen = codex.unseenOf('pills');
check('unseenOf 不含已收集条目', unseen.every((e) => e.id !== 'pill_juqi'));
check('unseenOf 数量 = total - got', unseen.length === codex.progress('pills').total - 1);
check('未收集也有获取线索', codex.clueFor('pills', 'pill_zhuji').length > 0,
  codex.clueFor('pills', 'pill_zhuji'));
check('未收集的 summary 为空（未收录的真名为 ???）',
  codex.summaryFor('pills', 'pill_ningqi') === '' &&
  codex.displayName('pills', 'pill_ningqi') === '???');

// ============================================================
section('A3. 图鉴：自动补录已有物品');
reset();
const before = codex.overallProgress().got;
const gained = codex.autoRecord();          // 新档自带旧剑 / 道袍 / 吐纳术
check('autoRecord 有新增', gained > 0, `新增 ${gained} 条`);
check('初始功法 吐纳术 已补录', codex.has('techniques', 'tech_tuna'));
check('初始装备 青纹铁剑 已补录', codex.has('equipped', 'eq_qingwen_sword'));
check('初始道袍 已补录', codex.has('equipped', 'eq_cloth_robe'));
check('补录后总数 = 旧数 + 新增', codex.overallProgress().got === before + gained);
check('二次 autoRecord 无新增（幂等）', codex.autoRecord() === 0);

// 节流：tickCodex 累积到 3 秒才扫描
reset();
codex.autoRecord();                          // 先把初始物品收掉
check('tickCodex(1) 未到节流阈值不扫描', codex.tickCodex(1) === 0);
check('tickCodex(3) 越过阈值触发扫描', typeof codex.tickCodex(3) === 'number');

// ============================================================
section('A4. 图鉴：收集加成量级克制');
reset();
const r0 = codex.codexReward();
check('0% 时无里程碑奖励',
  r0.comprehension === 0 && r0.daoHeart === 0 && r0.spiritSense === 0 && r0.luck === 0);
check('0% 时分类加成为 0', Object.values(codex.codexBonus('techniques')).every((v) => v === 0));

// 只填功法一栏，看满收集时的加成
reset();
fill('techniques');
const bFull = codex.codexBonus('techniques');
check('功法满收集 cultPct = 2%', Math.abs(bFull.cultPct - 0.02) < 1e-9,
  JSON.stringify(bFull));
check('单个分类加成 <= 5%', Object.values(bFull).every((v) => v <= 0.05), JSON.stringify(bFull));

// 填满全部图鉴
reset();
for (const k of CODEX_KINDS) fill(k.id);
const overall = codex.overallProgress();
check('满图鉴 got === total', overall.got === overall.total, `${overall.got}/${overall.total}`);
const rFull = codex.codexReward();
check('满图鉴里程碑 = 悟性2/道心2/神识2/气运5',
  rFull.comprehension === 2 && rFull.daoHeart === 2 && rFull.spiritSense === 2 && rFull.luck === 5,
  JSON.stringify(rFull));
const totalReward = rFull.comprehension + rFull.daoHeart + rFull.spiritSense + rFull.luck;
check('满图鉴永久属性总量 <= 11 点（克制）', totalReward <= 11, `${totalReward} 点`);
const bonusAll = codex.codexBonusAll();
const pctSum = Object.entries(bonusAll)
  .filter(([k]) => k.endsWith('Pct') || k === 'combatPct')
  .reduce((s, [, v]) => s + v, 0);
check('满图鉴全部百分比通道合计 <= 10%', pctSum <= 0.10, `合计 ${(pctSum * 100).toFixed(1)}%`);
console.log('  满图鉴分类加成:', JSON.stringify(bonusAll));

// ============================================================
section('B1. 天象：数据表结构');
check('天象数量 >= 8', WORLD_EVENTS.length >= 8, `${WORLD_EVENTS.length} 种`);
check('id 唯一', new Set(WORLD_EVENTS.map((e) => e.id)).size === WORLD_EVENTS.length);
check('每条都有 id/name/kind/desc/lore/effect/durationMin',
  WORLD_EVENTS.every((e) => e.id && e.name && e.kind && e.desc && e.lore && e.effect && e.durationMin > 0));
check('eventById 可查', eventById('we_lingqi')?.name === '灵气潮汐');

// ============================================================
section('B2. 天象：轮换确定性');
const T = Date.now();
const a1 = we.currentEvent(T);
const a2 = we.currentEvent(T);
check('同一时间戳两次 currentEvent 相同', a1.id === a2.id, `${a1.id} vs ${a2.id}`);
check('phaseAt 同一时间戳给出同一时段',
  we.phaseAt(T).index === we.phaseAt(T).index && we.phaseAt(T).start === we.phaseAt(T).start);
check('相隔 5 秒（未跨点）天象不变',
  we.currentEvent(T).id === we.currentEvent(T + 5000).id);

const boundary = we.nextEventAt(T);
const atBefore = we.phaseAt(boundary - 1);
const atAfter = we.phaseAt(boundary);
check('跨过轮换点后时段索引改变', atBefore.index !== atAfter.index,
  `${atBefore.index} -> ${atAfter.index}`);
check('跨点前该时段已结束', atBefore.end === boundary, `${atBefore.end} vs ${boundary}`);
check('跨点后开始新时段', atAfter.start === boundary, `${atAfter.start} vs ${boundary}`);

// 在整张轮换表里确认"确实存在天象 id 改变的轮换点"
let foundChange = false;
let probe = boundary;
for (let i = 0; i < 200 && !foundChange; i++) {
  const e = we.phaseAt(probe).end;
  if (we.currentEvent(e - 1).id !== we.currentEvent(e).id) foundChange = true;
  probe = e + 1;
}
check('存在天象 id 改变的轮换点（世界真的会变）', foundChange);

// ============================================================
section('B3. 天象：timeLeft 递减且不为负');
const slot = we.phaseAt(T);
const t1 = we.timeLeft(slot.start + 1000);
const t2 = we.timeLeft(slot.start + 2000);
check('timeLeft 随时间递减', t2 < t1, `${t1.toFixed(1)} -> ${t2.toFixed(1)}`);
check('timeLeft 与时段终点一致',
  Math.abs(t1 - (slot.end - (slot.start + 1000)) / 1000) < 1e-9);
let neg = false;
for (let i = 0; i < 500; i++) {
  if (we.timeLeft(T + i * 97000) < 0) neg = true;
}
check('500 个采样点 timeLeft 均不为负', !neg);
check('恰在轮换点 timeLeft = 新时段全长',
  Math.abs(we.timeLeft(boundary) - (we.nextEventAt(boundary) - boundary) / 1000) < 1e-6,
  we.timeLeft(boundary).toFixed(0) + 's');
check('轮换点剩余时间为新时段时长 > 0', we.timeLeft(boundary) > 0);

// ============================================================
section('B4. 天象：负面必有正面补偿');
const BAD_POSITIVE = new Set(['tribulationDiff', 'enemyPower']);
const negatives = WORLD_EVENTS.filter((e) =>
  (e.effect.value || 0) < 0 || BAD_POSITIVE.has(e.effect.kind));
check('存在负面天象', negatives.length > 0, `${negatives.length} 种`);
for (const e of negatives) {
  const hasComp = e.bonus && Number.isFinite(e.bonus.value) && e.bonus.value > 0;
  check(`负面「${e.name}」带有正面补偿`, hasComp,
    e.bonus ? `${e.bonus.kind} +${e.bonus.value}` : '无');
}

// ============================================================
section('B5. 天象：eventBonus 汇总正确');
// 找一个 we_lingqi（修炼 +25%）正在生效的时间点
let lingqiAt = null;
for (let k = 0; k < 2000 && !lingqiAt; k++) {
  const ts = T + k * 60000;
  if (we.currentEvent(ts).id === 'we_lingqi') lingqiAt = ts;
}
check('找到灵气潮汐生效的时间点', lingqiAt !== null);
if (lingqiAt !== null) {
  check('灵气潮汐时 cultPct = 0.25', Math.abs(we.eventBonus('cultPct', lingqiAt) - 0.25) < 1e-9,
    String(we.eventBonus('cultPct', lingqiAt)));
  check('无关通道为 0', we.eventBonus('dropRate', lingqiAt) === 0);
}
// 找一个大道压制（天劫 +25% / 突破奖励 +100%）的时间点
let yazhiAt = null;
for (let k = 0; k < 4000 && !yazhiAt; k++) {
  const ts = T + k * 60000;
  if (we.currentEvent(ts).id === 'we_yazhi') yazhiAt = ts;
}
check('找到大道压制生效的时间点', yazhiAt !== null);
if (yazhiAt !== null) {
  check('大道压制 tribulationDiff = +0.25', Math.abs(we.eventBonus('tribulationDiff', yazhiAt) - 0.25) < 1e-9);
  check('大道压制 breakReward = +1.0（补偿）', Math.abs(we.eventBonus('breakReward', yazhiAt) - 1.0) < 1e-9);
  check('isActive 判定正确', we.isActive('we_yazhi', yazhiAt) === true);
}

// ============================================================
section('B6. 天象：轮换记录 / 播报');
reset();
const log = we.eventLog(8, T);
check('eventLog 返回 8 条', log.length === 8, String(log.length));
check('最新一条 active', log[0].active === true);
check('记录按时间倒序', log.every((h, i) => i === 0 || h.end <= log[i - 1].at + 1));
check('历史记录不含未来', log[0].at <= T);
const ev = we.currentEvent(T);
check('tickWorldEvent 首次播报返回 true', we.tickWorldEvent() === true);
check('播报后已亲历集合包含当前天象', we.seenIds().includes(ev.id), ev.id);
check('同一时段再次 tick 不重复播报', we.tickWorldEvent() === false);

// ============================================================
console.log('\n' + '='.repeat(66));
console.log(`图鉴 7 栏条目数：` +
  CODEX_KINDS.map((k) => `${k.name} ${k.table.length}`).join(' / ') +
  `  （合计 ${CODEX_KINDS.reduce((s, k) => s + k.table.length, 0)}）`);
console.log(`天象 ${WORLD_EVENTS.length} 种：` +
  WORLD_EVENTS.map((e) => `${e.name}(${e.effect.kind}${e.effect.value >= 0 ? '+' : ''}${e.effect.value}${e.bonus ? ' /补偿:' + e.bonus.kind + '+' + e.bonus.value : ''})`).join(' / '));
if (failures === 0) console.log('\n全部通过 ✓');
else console.log(`\n有 ${failures} 项失败 ✗`);
process.exit(failures === 0 ? 0 : 1);
