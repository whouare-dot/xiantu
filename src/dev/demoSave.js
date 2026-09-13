/**
 * 演示存档（临时脚手架）。
 *
 * ============================================================
 * 这是什么
 * ============================================================
 *
 * 一份「什么都有、但还没玩完」的第一世存档：境界停在大乘期，
 * 17 个页签全部解锁且都有内容，为录展示视频准备。
 *
 * 三条口径，改之前先想清楚：
 *
 *   1. **丰富但不毕业**。洞府 6/9 级、试炼 34/40 层、功法最高 6 重、
 *      修为差一段才满……刻意留出「还差一点」的位置——录视频时点下去
 *      有进度条在动、有东西可升，而不是满屏的「已满级 / 不可点」。
 *
 *   2. **能交给游戏自己算的，绝不手写**。成就靠 `checkAll()` 扫出来、
 *      功课进度靠 `tickDuty()` 从 state 拉、灵兽/宗门/道侣/图鉴统统走
 *      各自的 systems 函数。手写这些字段会在下次改契约时静默失效，
 *      而且失败方式很难看（面板空、判定对不上）。
 *
 *   3. **必须手写的只有"没法演算出来的东西"**：装备品阶与词条、灵兽星级、
 *      羁绊值、已收集的图鉴条目——这些是玩家行为的结果，没有纯函数能倒推。
 *
 * ============================================================
 * 怎么删
 * ============================================================
 *
 * 录完视频：删掉整个 `src/dev/` 目录，再把 `src/ui/settings.js` 里
 * 三处标注了「演示档」的代码删掉（import、buildBody 的 section、
 * bindBody 的绑定）。游戏其它部分零改动、零依赖。
 */

import { state, setState, createInitialState, realmAt } from '../core/state.js';
import { slotKey, save, setActiveSlot } from '../core/save.js';
import { TECHNIQUES } from '../data/techniques.js';
import { EQUIPMENTS } from '../data/equipments.js';
import { PILLS } from '../data/pills.js';
import { MATERIALS } from '../data/materials.js';
import { BEASTS } from '../data/beasts.js';
import { COMPANIONS } from '../data/companions.js';
import { ALCHEMY_RECIPES, FORGE_RECIPES } from '../data/recipes.js';
import { ENEMIES } from '../data/enemies.js';
import { ENCOUNTERS } from '../data/encounters.js';
import { SECTS } from '../data/sects.js';
import { WORLD_EVENTS } from '../data/worldEvents.js';
import { GUIDE_TIPS } from '../data/guides.js';
import * as cultivation from '../systems/cultivation.js';
import * as inventory from '../systems/inventory.js';
import * as beastSys from '../systems/beast.js';
import * as companionSys from '../systems/companion.js';
import * as sectSys from '../systems/sect.js';
import * as codexSys from '../systems/codex.js';
import * as talentSys from '../systems/talent.js';
import { assignDuties, snapshotBaselines, tickDuty } from '../systems/duty.js';
import { checkAll } from '../systems/achievement.js';

// ==================== 可调参数 ====================

/** 演示档写进哪个槽位。选 3 是为了不碰玩家常用的 1 / 2 */
export const DEMO_SLOT = 3;

/** 演示角色名 */
const DEMO_NAME = '云中君';

/** 演示档停在哪个境界：23 = 大乘期（0~25，25 是飞升成仙） */
const DEMO_REALM = 23;

/**
 * 「轻度越界」开关：预置多少道基点。
 *
 * 这份档按**第一世**（reincarnation.count = 0）来造，但道基点在规则上
 * 只在轮回结算时发放——严格算，第一世不该有。
 * 预置一点是为了让「天赋」页不是一片灰：能看见已点的等级、也能当场再点一级。
 * 觉得穿帮就改成 0，其余内容一律不受影响。
 */
const DEMO_DAO_BASE = 20;

/**
 * 修为留多少给玩家自己填满（秒）。
 *
 * 录视频时「修为条在动」是放置游戏最核心的画面，所以这里不留满——
 * 按当前修炼速率倒推，让进度条大约这么久走到头，然后「突破」亮起来。
 * 设成 0 就是直接给满、点一下立刻冲关。
 */
const DEMO_FILL_SECONDS = 120;

/** 是否把引导提示标记为全部读过。false = 保留首次引导（更真实的初见感） */
const DEMO_SKIP_GUIDES = false;

// ==================== 小工具 ====================

/** 取表里前 n 条（用于按比例收集图鉴） */
function take(arr, n) {
  return (arr || []).slice(0, n);
}

// ==================== 槽位备份 ====================

/**
 * 演示档要占用的槽位如果本来有档，先把原始文本挪到旁边存着。
 *
 * 为什么要备份：演示档是**临时**的，而玩家很可能正好在槽 3 有一份舍不得丢的档。
 * 「临时」这个词只有在能一键还原的时候才成立。
 *
 * 直接用 localStorage 读写原文而不是走 save.js：这里要的是"原样搬运"，
 * 一旦经过 deserialize 再 serialize，迁移逻辑会顺手改写内容，
 * 还原出来就不是原来那份档了。
 */
const DEMO_BACKUP_KEY = `xiantu_v2_slot${DEMO_SLOT}_demo_backup`;

export function backupDemoSlot() {
  const raw = localStorage.getItem(slotKey(DEMO_SLOT));
  if (!raw) return false;
  localStorage.setItem(DEMO_BACKUP_KEY, raw);
  return true;
}

export function hasDemoBackup() {
  return !!localStorage.getItem(DEMO_BACKUP_KEY);
}

/** 把备份写回槽位。返回是否真的还原了 */
export function restoreDemoSlot() {
  const raw = localStorage.getItem(DEMO_BACKUP_KEY);
  if (!raw) return false;
  localStorage.setItem(slotKey(DEMO_SLOT), raw);
  localStorage.removeItem(DEMO_BACKUP_KEY);
  return true;
}

/**
 * 一键安装演示档：备份 → 切激活槽 → 造档 → 存盘。
 *
 * ⚠ **必须在造档之前先把激活槽切到 DEMO_SLOT**。
 * main.js 注册了无条件的 `beforeunload → save()`（见 core/save.js 的注释），
 * 而 buildDemoState 会把全局 state 整个换掉。万一中途抛异常，留在内存里的
 * 就是一份半成品——此时若激活槽还指着玩家自己的档，任何一次刷新都会
 * 把半成品写进去。先切槽，风险就全落在演示槽上，玩家原有的存档碰不到。
 *
 * @returns {object} 自检摘要
 */
export function installDemoSave() {
  backupDemoSlot();
  setActiveSlot(DEMO_SLOT);
  const { report } = buildDemoState();
  save(DEMO_SLOT);
  return report;
}

// ==================== 主入口 ====================

/**
 * 造出演示档并**装载进全局 state**。
 *
 * 注意：它会直接 `setState()`，所以调用方要么马上存档 + 刷新，
 * 要么自己承担"当前进度被替换"的后果。
 *
 * @returns {{state: object, report: object}} report 是自检摘要，供按钮 toast 用
 */
export function buildDemoState() {
  // ---------- 0) 从干净的第一世开始 ----------
  setState(createInitialState(DEMO_NAME));
  const s = state;
  const rc = s.reincarnation;

  s.meta.createdAt = Date.now() - 41 * 86400 * 1000;
  s.meta.totalPlaytime = 41 * 86400 - 3600;
  s.meta.autoBreakthrough = false;
  s.meta.autoBreakThreshold = 0.55;
  s.meta.battleReport = true;

  // 轮回基线必须在**收集任何东西之前**打——它记的是"这一世开始时已有多少"。
  // 顺序反了的话，功课里的「集录 40 种」「立名 12 项」会被自己刚塞进去的
  // 收藏直接判为已完成，而玩家实际一件没做。
  rc.count = 0;
  rc.dutyMode = 'full';
  rc.fate = null;
  rc.history = [];
  rc.clues = [];
  rc.endingSeen = false;
  rc.freeMode = false;
  rc.memoryBonus = 1;
  rc.daoBase = DEMO_DAO_BASE;
  snapshotBaselines();          // → codexBaseline / achBaseline 归零
  assignDuties(1);              // → 八幕主线 20 门 + 余课 8 门

  // ---------- 1) 境界与属性 ----------
  const p = s.player;
  p.realmIndex = DEMO_REALM;
  p.alive = true;
  p.breakFails = 0;
  p.attributes = {
    comprehension: 6, daoHeart: 8, spiritSense: 5, luck: 4, lifespan: 0,
  };
  // 寿元是**绝对值**：一路突破累积下来就是当前境界的基础值
  // （每次突破加的是"新旧境界之差"）。createInitialState 给的 100 是炼气期的数，
  // 不覆盖的话大乘期的角色会显示成"寿元 100 载"。
  p.lifespan = realmAt(DEMO_REALM).lifespan;
  p.base.luck = Math.max(p.base.luck, 72);
  p.stance = 'sanxiu';          // 拜入宗门时会自动转正道（走 setStance）

  // ---------- 2) 功法 ----------
  // 等级刻意不齐：最高 6 重（「通玄」要求 5 重，已完成），
  // 另有 2 重的垫底，让「参悟」页有梯度可看。
  s.techniques.known = {
    tech_tuna: { level: 5, exp: 40 },
    tech_wuxing: { level: 4, exp: 15 },
    tech_qingfeng: { level: 6, exp: 62 },
    tech_taixu: { level: 3, exp: 8 },
    tech_duanti: { level: 2, exp: 30 },
  };
  // 大乘期可用 4 个主修槽（techSlotsFor: realmIndex >= 18）
  s.techniques.equipped = ['tech_qingfeng', 'tech_tuna', 'tech_wuxing', 'tech_duanti'];

  // ---------- 3) 装备 ----------
  // 主力一身仙品，另留一件神品在身——「神物在手」成就靠它解锁。
  // 背包里再压一批没穿的，让「背包」页有得看、有得换。
  const worn = [
    ['eq_zhuxian_sword', 'xian', 6],
    ['eq_xingchen_armor', 'xian', 6],
    ['eq_xingchen_pagoda', 'shen', 4],
  ];
  for (const [baseId, quality, level] of worn) {
    const inst = inventory.addEquipment(baseId, { quality, level });
    if (inst) inventory.equipItem(inst.uid);
  }
  const spare = [
    ['eq_hundun_axe', 'ling', 3],
    ['eq_zixiao_sword', 'ling', 4],
    ['eq_longlin_scale', 'xian', 2],
    ['eq_chiyan_armor', 'ling', 5],
    ['eq_hanjing_robe', 'fan', 7],
    ['eq_yinyang_mirror', 'ling', 3],
    ['eq_jiuyou_flag', 'ling', 4],
    ['eq_neidan_seal', 'xian', 2],
    ['eq_yaodan_orb', 'fan', 6],
    ['eq_liuyun_sword', 'ling', 3],
    ['eq_chiyan_blade', 'fan', 8],
    ['eq_qingmu_shield', 'ling', 2],
  ];
  for (const [baseId, quality, level] of spare) {
    inventory.addEquipment(baseId, { quality, level });
  }

  // ---------- 4) 丹药与灵材 ----------
  // 丹药按 id 显式列出，不按表顺序取——「突破」需要的那几味必须真的在包里
  // （大乘期冲出关要「悟道丹」，见 breakthroughPillFor(23)）。
  s.consumables = {
    pill_juqi: 14, pill_huiqi: 22, pill_liaoshang: 17, pill_jingxin: 9,
    pill_ningqi: 7, pill_yunling: 6, pill_zifu: 4, pill_xisui: 5,
    pill_tianji: 3, pill_zhuji: 2, pill_jiejin: 2, pill_ningying: 1,
    pill_huashen: 1, pill_powang: 2, pill_tiangang: 2,
    pill_wudao: 3,   // ← 大乘期突破的引子
    pill_dujie: 1,
  };
  s.resources.materials = {
    mat_lingzhi: 86, mat_xueshen: 54, mat_ziyulan: 41, mat_jiuyelian: 27,
    mat_longdanhua: 14, mat_taisuizhi: 6,
    mat_xuantie: 73, mat_hanjing: 38, mat_chiyan: 25, mat_xingchen: 12,
    mat_longlin: 5, mat_hundun: 2,
    mat_shougu: 64, mat_yaoxue: 33, mat_yaodan: 18, mat_neidan: 7,
  };
  s.resources.stones = { low: 0, mid: 0, high: 0 };
  // 折成 8,246,530 下品：够在坊市里大方地买，又不至于看起来像改出来的数字
  s.resources.stones.low = 6530;
  s.resources.stones.mid = 24;
  s.resources.stones.high = 8;

  // ---------- 5) 洞府 ----------
  // 洞府本体 6 级（「洞天」要 7 级 → 差一步，正好留个目标），
  // 聚灵阵 7 级（「安身」要 5 级，已完成），建筑等级之和 26（「磨砺」要 30）。
  s.cave.level = 6;
  s.cave.upgradeEndsAt = null;
  s.cave.buildings = {
    bld_spirit: { level: 7, upgradeEndsAt: null },
    bld_herb: { level: 5, upgradeEndsAt: null },
    bld_alchemy: { level: 5, upgradeEndsAt: null },
    bld_forge: { level: 4, upgradeEndsAt: null },
    bld_library: { level: 3, upgradeEndsAt: null },
    bld_ward: { level: 2, upgradeEndsAt: null },
  };
  s.cave.yieldAcc = { herbMs: 0 };

  // ---------- 6) 丹方 / 器图 ----------
  s.alchemy.knownRecipes = take(ALCHEMY_RECIPES, 13).map((r) => r.id);
  s.forging.knownRecipes = take(FORGE_RECIPES, 11).map((r) => r.id);
  s.alchemy.auto = false;
  s.forging.auto = false;

  // ---------- 7) 宗门 ----------
  // 全部走 sect.js 自己的入口：拜入会顺手把立场转正道、晋升会连升并结算月俸。
  // 直接写 state.sect.rank 会漏掉这些副作用，面板上就会对不上。
  const sectRes = sectSys.joinSect(SECTS[0].id);
  if (sectRes.ok) {
    sectSys.addContribution(1500, '演示');
    sectSys.promote();                       // 1500 → 真传弟子（rank 2）
    // 三场往季宗门战：走真正的结算函数，战报结构与奖励都由系统生成
    sectSys.resolveWar({ force: 'win', season: '2026-W34' });
    sectSys.resolveWar({ force: 'win', season: '2026-W35' });
    sectSys.resolveWar({ force: 'win', season: '2026-W36' });

    const sc = s.sect;
    sc.buildings = {
      bld_arena: { level: 4, upgradeEndsAt: null },
      bld_pagoda: { level: 3, upgradeEndsAt: null },
      bld_pavilion: { level: 4, upgradeEndsAt: null },
      bld_beastgarden: { level: 2, upgradeEndsAt: null },
    };
    // 今日宗门任务：拿真实的轮换结果，标 3 条已做（留 2 条给玩家点）
    sc.questDate = sectSys.todayStr();
    sc.questsDone = take(sectSys.dailyQuestIds(), 3);
    sc.warSeason = sectSys.seasonOf();
    sc.warScore = 300;
    sc.affinity = { tianjian: 68, baicao: 12, panyue: 0 };
    sc.betrayCount = 0;
  }

  // ---------- 8) 灵兽 ----------
  // 四只：火系一只已进化（幽炎狐，stage 1 → 「化形」完成），
  // 水/风各一只凑齐「御灵」的四只，另留一枚蛋在孵。
  const fox = beastSys.addBeast('bst_chiyanhu', { star: 4, level: 24, intimacy: 58 });
  const you = beastSys.addBeast('bst_youyanhu', { star: 4, level: 31, intimacy: 47 });
  beastSys.addBeast('bst_xuanshuigui', { star: 3, level: 19, intimacy: 34 });
  beastSys.addBeast('bst_lingxique', { star: 5, level: 16, intimacy: 52 });
  if (you) beastSys.setActive(you.uid);
  // 一枚蛋：孵化走绝对时间戳，录视频时进度条自己在走
  beastSys.layEgg('bst_heilinjiao', 5400);
  // 血脉记忆（唯一跨世的灵兽字段）：写两条，让「血脉」区有内容
  s.beasts.bloodlines = {
    bst_chiyanhu: {
      baseId: 'bst_chiyanhu', bestStar: fox?.star || 4, stage: 1, gens: 2, awakened: false,
    },
    bst_youyanhu: {
      baseId: 'bst_youyanhu', bestStar: you?.star || 4, stage: 1, gens: 1, awakened: false,
    },
  };

  // ---------- 9) 道侣 ----------
  // meet 自己会去加 stats.companionMeets（「同行」功课的进度源），别手动再加一遍。
  companionSys.meet('cmp_qingwu', { silent: true });
  companionSys.meet('cmp_luoqi', { silent: true });
  companionSys.meet('cmp_yunmian', { silent: true });
  companionSys.addBond('cmp_qingwu', 71);
  companionSys.addBond('cmp_luoqi', 39);
  companionSys.addBond('cmp_yunmian', 18);
  // 剧情节点 id 是共用的 st_1..st_5，按羁绊门槛递增（各人一套，存在 stories[id] 下）。
  // 门槛：st_1@0 · st_2@25 · st_3@55 · st_4@85 · st_5@100，
  // 所以上面必须先加够羁绊，否则 readStory 会以"羁绊不足"被拒。
  for (const [id, stories] of [
    ['cmp_qingwu', ['st_1', 'st_2', 'st_3']],
    ['cmp_luoqi', ['st_1']],
  ]) {
    for (const st of stories) companionSys.readStory(id, st);   // 未达标即跳过，不抛
  }
  companionSys.setActive('cmp_qingwu');

  // ---------- 10) 图鉴 ----------
  // 按各表比例收，总体落在六成上下——够看出"收集过半"，
  // 又留出明显的未收集格（图鉴页的灰格子是它的看点）。
  const codexPlan = [
    ['techniques', TECHNIQUES, 9],
    ['equipped', EQUIPMENTS, 22],
    ['pills', PILLS, 14],
    ['materials', MATERIALS, 13],
    ['beasts', BEASTS, 12],
    ['enemies', ENEMIES, 15],
    ['encounters', ENCOUNTERS, 40],
  ];
  for (const [kind, table, n] of codexPlan) {
    for (const e of take(table, n)) codexSys.record(kind, e.id);
  }
  // 已经在手上的东西，图鉴不该还是灰的——按真实持有补齐
  for (const techId of Object.keys(s.techniques.known)) codexSys.record('techniques', techId);
  for (const inst of s.equipment.owned) codexSys.record('equipped', inst.baseId);
  for (const b of s.beasts.owned) codexSys.record('beasts', b.baseId);

  // ---------- 11) 战绩与统计 ----------
  s.combat.towerFloor = 34;      // 「登塔 20」已完成；「登高 40」差 6 层
  s.combat.towerBest = 41;
  s.combat.winStreak = 14;

  s.stats.breakthroughs = 27;
  s.stats.deaths = 6;
  s.stats.kills = 428;
  s.stats.pillsMade = 91;
  s.stats.itemsForged = 34;
  s.stats.encounters = 103;
  s.stats.tribulationsPassed = 6;
  s.stats.totalCultGained = 3.1e8;
  s.stats.equipOps = 11;
  // kinds 只记长度，但 id 也要是真的——假 id 一旦被别处引用就是隐雷
  s.stats.kinds = {
    slain: take(ENEMIES, 8).map((e) => e.id),
    encounters: take(ENCOUNTERS, 6).map((e) => e.id),
    pills: ['pill_juqi', 'pill_huiqi', 'pill_liaoshang', 'pill_jingxin', 'pill_ningqi', 'pill_yunling'],
    forged: take(FORGE_RECIPES, 4).map((r) => r.id),
    shopBuy: ['pill_juqi', 'mat_lingzhi', 'mat_xuantie', 'pill_liaoshang'],
  };

  // ---------- 12) 天赋 ----------
  // 花掉 12 点（修行 2 重 5 点 + 战伐 2 重 5 点 + 机缘 1 重 2 点），
  // 余 8 点留着手点——录视频时"再点一级"是有反馈的。
  for (const [id, times] of [
    ['tal_cultivate_tuna', 2], ['tal_combat_lianqi', 2], ['tal_fortune_fuyuan', 1],
  ]) {
    for (let i = 0; i < times; i++) talentSys.learn(id);   // 点不动就跳过，不抛
  }

  // ---------- 13) 天象已亲历 / 引导 ----------
  // 「已亲历」只是给天象页加个标记，留两种没见过也很有意思——
  // 面板上会显示"尚未亲历"，等于留了个悬念。
  s.flags.worldSeen = take(WORLD_EVENTS, 10).map((e) => e.id);
  s.guide.seen = DEMO_SKIP_GUIDES ? Object.keys(GUIDE_TIPS) : [];

  // ---------- 14) 成就 ----------
  // 不手写 unlocked —— 直接跑游戏自己的扫描，满足什么就解锁什么，
  // 奖励（属性 / 称号 / 灵石）也由它按正规路径发放。
  // 注意它必须排在最后：前面所有 stats / 装备 / 洞府都是它的判定输入。
  try { checkAll(); } catch (e) { console.warn('[demo] 成就扫描失败', e); }

  // ---------- 15) 收口：把派生值算准 ----------
  // 到这里加成（宗门、天赋、成就、灵兽、道侣、血脉）才全部到位，
  // 气血 / 灵力 / 寿元必须**在这之后**算，否则面板上第一眼就是错的。
  p.maxHp = Math.round(cultivation.calcMaxHp());
  p.hp = p.maxHp;
  p.maxMp = Math.round(cultivation.calcMaxMp());
  p.mp = p.maxMp;
  p.lifespan = Math.round(cultivation.calcLifespan());

  // 修为留一段：按当前速率倒推，让进度条约 DEMO_FILL_SECONDS 秒走满
  const need = realmAt(DEMO_REALM).needCult || 0;
  const speed = Math.max(1, cultivation.calcCultSpeed());
  p.cult = Math.max(0, Math.floor(need - speed * DEMO_FILL_SECONDS));

  // 限时增益（左栏「状态」面板的内容）：用 addBuff 走正规入口。
  // 时长刻意取整小时以上，录视频期间不会中途消失。
  cultivation.addBuff({
    id: 'demo_buff_spirit', name: '灵气潮汐', stat: 'cult',
    mult: 1.25, add: 0, duration: 3 * 3600,
  });
  cultivation.addBuff({
    id: 'demo_buff_daoxin', name: '静心丹力', stat: 'breakthrough',
    mult: 1, add: 0.08, duration: 2 * 3600,
  });

  // ---------- 16) 功课判定 ----------
  // 功课的进度与了结状态是**拉取**出来的——assignDuties 只建骨架，
  // 真正的数字由 tickDuty 从 state 重算。漏掉这一下，28 门功课会
  // 全部显示成 0/N，明明做完了也是灰的。
  tickDuty();

  // ---------- 17) 修行日志 ----------
  // 覆盖掉前面构造过程产生的那一堆（"获得 ×××"刷屏），换成一段像样的履历。
  seedLog();

  return { state: s, report: selfCheck() };
}

// ==================== 日志 ====================

/**
 * 写一批像样的履历。
 *
 * 构造过程本身会发几十条日志（每件装备、每只灵兽各一条），
 * 那串东西留在面板里像调试输出，所以最后统一覆盖掉。
 */
function seedLog() {
  const now = Date.now();
  const min = 60 * 1000;
  const entries = [
    [340, '【宗门】宗门大比，【磐岳宗】上门挑战 —— 胜。记功 380，赏灵石 12000。', 'event-good', 'system'],
    [312, '【天象】天地换象 ——「星辰垂照」秘境概率与产出提升。', 'event-special', 'system'],
    [286, '本世之业已了：【铸器】。', 'event-breakthrough', 'system'],
    [255, '【道侣】沈青芜：你第一次见她写字，是在药庐的炭火上。', 'event-good', 'system'],
    [233, '试炼塔第 34 层，守关者【上古剑灵】——你退了半步，又站住了。', 'event-special', 'battle'],
    [211, '─── 破 关 ───', 'event-breakthrough', 'cultivate'],
    [210, `自【合体期】踏入【大乘期】。${realmAt(23).desc || ''}`, 'event-breakthrough', 'cultivate'],
    [209, '破关奖励：灵石 +18900，气运 +2。', 'event-good', 'cultivate'],
    [180, '【灵兽】幽炎狐尾火转青，褪去赤色，化形为二尾。', 'event-special', 'system'],
    [152, '【成就】与道合真 —— 合体成真，神通无量', 'event-good', 'system'],
    [128, '丹成：九转金丹诀第七转，炉中紫气三日不散。', 'event-good', 'cultivate'],
    [96, '【奇遇】古井无波：井底照出的不是你的脸。', 'event-special', 'system'],
    [64, '本世之业已了：【登塔】。', 'event-breakthrough', 'system'],
    [31, '【宗门】今日功课已毕两门，余三门待做。', 'event-good', 'system'],
    [4, '天象轮转，灵气渐浓。你盘膝坐下，继续参悟。', '', 'cultivate'],
  ];
  state.log = entries.map(([agoMin, text, cls, channel]) => ({
    t: now - agoMin * min, text, cls, channel,
  })).reverse();   // state.log 是旧的在前
}

// ==================== 自检 ====================

/**
 * 造完立刻核对一遍关键数字。
 *
 * 存在的意义：这份档是"手写 + 系统混算"的产物，最容易出的错不是崩，
 * 而是**某个页签悄悄空了**。自检把这些数字捞出来摆到眼前，
 * 按钮点完的 toast 里就能看见，不必逐个页签翻。
 */
function selfCheck() {
  const s = state;
  const codexGot = ['techniques', 'equipped', 'pills', 'materials', 'beasts', 'enemies', 'encounters']
    .reduce((n, k) => n + (s.codex[k] || []).length, 0);
  return {
    realm: realmAt(s.player.realmIndex).name,
    cultSpeed: Math.round(cultivation.calcCultSpeed()),
    cultPct: (s.player.cult / (realmAt(s.player.realmIndex).needCult || 1) * 100).toFixed(1),
    techniques: Object.keys(s.techniques.known).length,
    equipment: s.equipment.owned.length,
    pillKinds: Object.keys(s.consumables).length,
    caveLevel: s.cave.level,
    sect: s.sect.id ? `${SECTS.find((x) => x.id === s.sect.id)?.name} · 职位 ${s.sect.rank}` : '未入',
    beasts: s.beasts.owned.length,
    companions: s.companions.met.length,
    codex: codexGot,
    achievements: (s.achievements.unlocked || []).length,
    dutiesDone: dutyDoneText(),
    talentPoints: s.reincarnation.daoBase,
  };
}

/** 「已完成 / 全部」——八幕主线共 28 门 */
function dutyDoneText() {
  const ds = state.reincarnation.duties || [];
  return `${ds.filter((d) => d.done).length}/${ds.length}`;
}
