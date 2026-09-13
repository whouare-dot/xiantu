/**
 * 全局状态。
 *
 * 约定：
 *  - 只有一个 state 对象，所有系统直接读写它。
 *  - 新增字段必须在 createInitialState() 里给出默认值，否则存档会缺字段。
 *  - 这里只放"原始数据"，派生属性（攻击力、修炼速率等）一律走 systems/ 的纯函数即时计算。
 */

import { SPIRIT_ROOTS } from '../data/spiritRoots.js';
import { REALMS, SEGMENTS } from '../data/realms.js';
import { equipById } from '../data/equipments.js';
import { achStateDefaults } from '../data/achievements.js';
import { weightedPick, randInt } from './rng.js';

export const SAVE_VERSION = '2.0.0';

/**
 * 初始行囊。
 *
 * 这不是"送福利"，是必需品：敌人表是按"装备齐全的玩家"标定的，
 * 而裸装新手的 atk 只有 5，对最弱的山林野猪（hp130/def5）每回合只造成 2 点伤害，
 * 必然战败。没有这套行囊，新手在战斗力上会被完全锁死。
 */
export const STARTING_KIT = {
  equips: ['eq_qingwen_sword', 'eq_cloth_robe'],   // 师父留下的旧剑与道袍
  techniques: ['tech_tuna'],                        // 入门吐纳术
  stones: 50,
};

/** 主修功法槽位上限，按境界索引返回 */
export function techSlotsFor(realmIndex) {
  if (realmIndex >= 18) return 4;
  if (realmIndex >= 12) return 3;
  if (realmIndex >= 6) return 2;
  return 1;
}

/** 洞府等级上限 */
export const MAX_CAVE_LEVEL = 9;

export function createInitialState(name = '无名散修') {
  const root = weightedPick(SPIRIT_ROOTS) || SPIRIT_ROOTS[3];
  const now = Date.now();

  // 发放初始行囊
  const owned = [];
  const equipped = { weapon: null, armor: null, treasure: null };
  let uid = 1;
  for (const id of STARTING_KIT.equips) {
    const base = equipById(id);
    if (!base) continue;
    const inst = { uid: uid++, baseId: base.id, quality: base.quality, level: 1, affixes: [] };
    owned.push(inst);
    equipped[base.slot] = inst.uid;
  }
  const known = {};
  for (const tid of STARTING_KIT.techniques) known[tid] = { level: 1, exp: 0 };

  return {
    meta: {
      version: SAVE_VERSION,
      createdAt: now,
      lastTick: now,
      totalPlaytime: 0,
      offlineCapHours: 8,
      autoBreakthrough: false,
      autoBreakThreshold: 0.55,   // 自动突破的最低成功率门槛
      battleReport: true,   // 战斗后是否弹窗逐条播放战报；关闭则只在日志留结果。结算不受影响。
    },

    player: {
      name,
      realmIndex: 0,
      cult: 0,
      hp: 100,
      maxHp: 100,
      mp: 50,
      maxMp: 50,
      alive: true,
      // 寿元是"绝对值"而非加成：突破时加上新旧境界的寿元差，事件可直接增减。
      // 单一数据源，避免 realms.js 的 lifespan 与事件效果互相打架。
      lifespan: REALMS[0].lifespan,
      base: {
        atk: 5, def: 3, spd: 10,
        crit: 0.05, critDmg: 1.5,
        comprehension: 10, daoHeart: 10, spiritSense: 10,
        luck: randInt(30, 80),
      },
      spiritRoot: root,
      // 永久加成（丹药/事件）；lifespan 为额外的寿元加成
      attributes: { comprehension: 0, daoHeart: 0, spiritSense: 0, luck: 0, lifespan: 0 },
      breakFails: 0,        // 连续突破失败次数，用于保底加成

      /** 立场：sanxiu 散修 | zhengdao 正道 | xiedao 邪道。见 systems/stance.js */
      stance: 'sanxiu',
      /** 叛宗冷却结束时间戳（毫秒）。冷却期内不能再加入任何宗门 */
      stanceCooldownUntil: 0,
      /** 洗白（渡心魔劫）失败的冷却结束时间戳。邪道回头代价重，失败要等很久才能再试 */
      redemptionCooldownUntil: 0,
      /** 是否已洗白过。洗白是一生一次的事 */
      redeemed: false,
    },

    /** 天劫进行中的临时状态；无天劫时为 null */
    tribulation: null,

    // ==================== V3.0：宗门 / 灵兽 ====================
    // 契约先冻结在这里，三个系统并行开发时共用同一份状态结构。
    // 注意：立场（stance）属于**玩家属性**，定义在上面的 player 里，不在这一层。

    /** 宗门。未入宗门时 id 为 null */
    sect: {
      id: null,                  // 'tianjian' 天剑宗 | 'baicao' 百草谷 | 'panyue' 磐岳宗
      rank: 0,                   // 0 外门 1 内门 2 真传 3 长老 4 宗主
      contribution: 0,           // 宗门贡献（稀缺资源，宝库与晋升都靠它）
      buildings: {},             // { [bldId]: { level, upgradeEndsAt } }
      questDate: '',             // 每日任务的重置日期
      questsDone: [],            // 今日已完成的宗门任务 id
      warSeason: '',             // 当前宗门战赛季标识
      warScore: 0,               // 本赛季个人战功
      warLog: [],                // 最近几次宗门战结果（供 UI 展示）
      betrayCount: 0,            // 叛宗次数，累计影响好感
      affinity: {},              // { [sectId]: 好感度 }，叛宗会扣
    },

    // ==================== V4.0：轮回 / 道侣 / 图鉴 ====================
    // 契约见 docs/版本规划.md §5.9。规则：轮回的保留与清空**只由
    // systems/reincarnation.js 实现**，其它模块不得自行清空或保留字段。

    /** 轮回。飞升后强制进入下一世 */
    reincarnation: {
      count: 0,              // 已轮回次数（第 count+1 世）
      daoBase: 0,            // 道基点：唯一的跨世货币
      talents: {},           // { [talentId]: level } 天赋树
      fate: null,            // 本世天命 { id, name, desc, effects[], bad }
      history: [],           // 历世记录 [{ gen, realmName, daoGained, fateName }]
      memoryBonus: 1,        // 记忆残留加成（保证不会比上一世更慢）
      endingSeen: false,     // 真结局是否已达成
      freeMode: false,       // 达成结局后进入自由模式
      clues: [],             // 已发现的隐藏线索 id
      // 本世功课（V6.0，V5.0 的「劫数」扩展而来）。未全部了结则不可飞升；
      // 形状与所有权规则见 docs/架构规范.md §2.1
      duties: [],            // [{ id, kind, target, need, progress, done, rerolls, assignedGen, act }]
      dutyMode: 'full',      // 'full' = 第一世八幕主线 | 'sampled' = 其后每世抽 3 门
      // 本世增量的基线：图鉴与成就都是**跨世保留**的，
      // 必须记下"这一世开始时已有多少"，才能算出"本世新增"
      codexBaseline: 0,
      achBaseline: 0,
    },

    /** 道侣。羁绊与剧情进度跨世保留——这是轮回题材独有的情感锚点 */
    companions: {
      met: [],               // 已结识的道侣 id
      bond: {},              // { [id]: 羁绊值 }
      active: null,          // 当前道侣 id
      stories: {},           // { [id]: 已完成的剧情节点 }
    },

    /** 轻量引导的已读记录。跨轮回保留——第五世的玩家不必重看第一世看过的提示 */
    guide: { seen: [] },

    /** 图鉴。收集向的长期目标 */
    codex: {
      techniques: [], equipped: [], pills: [], materials: [],
      beasts: [], enemies: [], encounters: [],
    },

    /** 灵兽。beasts.owned 里的每个实例见 systems/beast.js 的契约 */
    beasts: {
      owned: [],                 // { uid, baseId, star, level, exp, intimacy, stage, name }
      active: null,              // 出战灵兽的 uid
      eggs: [],                  // { uid, baseId, hatchAt } 可离线孵化
      nextUid: 1,
      // 血脉记忆：{ [baseId]: { baseId, bestStar, stage, gens, awakened } }
      // 唯一一个**跨世保留**的灵兽字段（本体不保留），见 systems/bloodline.js。
      // 放在这里是为了让"新档也有这个字段"——否则读档与轮回两条路径会各自补一次。
      bloodlines: {},
    },

    resources: {
      stones: { low: STARTING_KIT.stones, mid: 0, high: 0 },
      materials: {},
    },

    techniques: {
      known,                                          // { [techId]: { level, exp } }
      equipped: [...STARTING_KIT.techniques],          // 主修槽位
    },

    equipment: {
      owned,                                             // { uid, baseId, quality, level, affixes }
      equipped,
      nextUid: uid,
    },

    consumables: {},      // { [pillId]: count }

    cave: {
      level: 1,
      buildings: {},      // { [buildingId]: { level, upgradeEndsAt } }
      upgradeEndsAt: null, // 洞府本体扩建完成时间戳
      yieldAcc: {},       // 产出累积器（不足一个产出周期的余量），避免高频 tick 丢产出
    },

    alchemy: { knownRecipes: [], auto: false, active: null },
    forging: { knownRecipes: [], auto: false, active: null },

    combat: { towerFloor: 0, towerBest: 0, winStreak: 0 },

    buffs: [],            // { id, name, stat, mult, add, endsAt }

    quest: { dailyDate: '', dailyDone: 0, points: 0 },

    log: [],
    flags: {},
    stats: {
      breakthroughs: 0, deaths: 0, kills: 0,
      pillsMade: 0, itemsForged: 0, encounters: 0,
      tribulationsPassed: 0, totalCultGained: 0,
      // V6.0 功课：本世"种类"去重集合 + 动作计数。
      // 与其它 stats 一样**随轮回清零**，正合"本世"语义——
      // 跨世保留的绝对值（codex / achievements / companions）绝不能拿来当进度源。
      kinds: { slain: [], encounters: [], pills: [], forged: [], shopBuy: [] },
      equipOps: 0,        // 装备穿脱次数
      companionMeets: 0,  // 本世结识道侣人数
    },

    // 成就：解锁记录、佩戴的称号、防重复发奖名单，以及隐藏成就用的计量器。
    // 统一走 data/achievements.js 的默认结构，保证新旧存档字段一致。
    achievements: achStateDefaults(),
  };
}

/**
 * 记一笔"本世见过 / 做过"的种类（V6.0 功课）。
 *
 * 由各系统在**成功分支**调用——这是**记账**，不是判定：
 * 判定（读）仍独占在 `systems/duty.js` 的 `computeProgress` 里，
 * 与 `stats.kills` 由 combat.js 写是同一个分工。
 *
 * 重复 id 只记一次，这正是"种类优先于数量"要的效果：
 * 同一张方子炼一百炉也只算一种，玩家刷不出进度，只能去解锁新的。
 */
export function noteKind(kind, id) {
  if (!kind || !id) return;
  const st = state.stats || (state.stats = {});
  const k = st.kinds || (st.kinds = {});
  const arr = k[kind] || (k[kind] = []);
  if (!arr.includes(id)) arr.push(id);
}

/** 当前状态。用 setState 整体替换（读档 / 重置）。 */
export let state = createInitialState();

export function setState(next) {
  state = next;
  return state;
}

export function resetState(name) {
  state = createInitialState(name);
  return state;
}

// ==================== 境界访问器 ====================

/**
 * 当前境界。
 *
 * ⚠ **不接受参数**。历史上有过 `realm(realmIndex)` 这种写法，读起来像"按索引取境界"，
 * 实际参数被静默忽略、永远返回当前境界——在突破流程里恰好不出错，所以埋了很久。
 * 要按索引取，用下面的 `realmAt(index)`。
 */
export function realm() {
  return REALMS[Math.min(state.player.realmIndex, REALMS.length - 1)];
}

export function realmAt(index) {
  return REALMS[Math.max(0, Math.min(index, REALMS.length - 1))];
}

export function nextRealm() {
  const i = state.player.realmIndex + 1;
  return i < REALMS.length ? REALMS[i] : null;
}

export function isMaxRealm() {
  return state.player.realmIndex >= REALMS.length - 1;
}

export function segmentName(realmIndex) {
  const r = realmAt(realmIndex);
  return SEGMENTS[r.segment] || r.segment;
}

/** 是否处于大境界关口（需要渡天劫的境界） */
export const TRIBULATION_REALMS = new Set([9, 12, 15, 18, 21, 22, 23, 24]);

export function needsTribulation(realmIndex) {
  return TRIBULATION_REALMS.has(realmIndex);
}

// ==================== 资源便捷访问 ====================

export const STONE_RATE = { low: 100, mid: 100 * 100, high: 100 * 100 * 100 };

/** 把上/中/下品灵石折算为下品总数（用于比较与扣费） */
export function stonesToLow(s = state.resources.stones) {
  return (s.low || 0) + (s.mid || 0) * 100 + (s.high || 0) * 10000;
}

/** 从灵石池中扣除 low 单位的费用，返回是否成功。自动拆分品阶。 */
export function spendStones(amount) {
  const s = state.resources.stones;
  if (stonesToLow(s) < amount) return false;
  // 优先花低品阶
  let remain = amount;
  const lowUse = Math.min(s.low || 0, remain);
  s.low = (s.low || 0) - lowUse;
  remain -= lowUse;
  if (remain > 0) {
    const midUse = Math.min(s.mid || 0, Math.ceil(remain / 100));
    s.mid -= midUse;
    remain -= midUse * 100;
  }
  if (remain > 0) {
    const highUse = Math.min(s.high || 0, Math.ceil(remain / 10000));
    s.high -= highUse;
    remain -= highUse * 10000;
  }
  // 找零回下品
  if (remain < 0) s.low = (s.low || 0) + -remain;
  normalizeStones();
  return true;
}

/** 加入灵石（low 单位），自动向上进位 */
export function addStones(amount) {
  if (amount <= 0) return;
  const s = state.resources.stones;
  s.low = (s.low || 0) + Math.floor(amount);
  normalizeStones();
}

/** 灵石进位规整：100 下品 = 1 中品，100 中品 = 1 上品 */
export function normalizeStones() {
  const s = state.resources.stones;
  s.low = Math.max(0, Math.floor(s.low || 0));
  s.mid = Math.max(0, Math.floor(s.mid || 0));
  s.high = Math.max(0, Math.floor(s.high || 0));
  if (s.low >= 100) {
    s.mid += Math.floor(s.low / 100);
    s.low %= 100;
  }
  if (s.mid >= 100) {
    s.high += Math.floor(s.mid / 100);
    s.mid %= 100;
  }
}

/** 材料数量 */
export function materialCount(id) {
  return state.resources.materials[id] || 0;
}

export function addMaterial(id, n) {
  if (n === 0) return;
  const m = state.resources.materials;
  m[id] = Math.max(0, (m[id] || 0) + n);
  if (m[id] === 0) delete m[id];
}

export function hasMaterials(list) {
  return list.every((req) => materialCount(req.id) >= req.count);
}

export function consumeMaterials(list) {
  if (!hasMaterials(list)) return false;
  for (const req of list) addMaterial(req.id, -req.count);
  return true;
}

/** 丹药数量 */
export function pillCount(id) {
  return state.consumables[id] || 0;
}

export function addPill(id, n = 1) {
  const c = state.consumables;
  c[id] = Math.max(0, (c[id] || 0) + n);
  if (c[id] === 0) delete c[id];
}

export function consumePill(id, n = 1) {
  if (pillCount(id) < n) return false;
  addPill(id, -n);
  return true;
}
