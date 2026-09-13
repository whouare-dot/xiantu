/**
 * 成就定义表。
 *
 * 设计原则（见 docs/版本规划.md 3.5）：
 *   - 纯数据 + 纯函数判定，check(state) 只读不写。
 *   - 不需要任何新内容：所有条件都建立在 V2.0 已有的统计字段上
 *     （state.stats / state.combat / state.cave / state.equipment ...）。
 *   - 隐藏成就达成前只留 "???"，给探索留白。
 *
 * 分类：
 *   cultivate 修行 / combat 战斗 / manage 经营 / fortune 际遇 / secret 隐秘
 *
 * reward 约定：
 *   { kind: 'attr',  attr: 'daoHeart', value: 2 }   → state.player.attributes 永久加成
 *   { kind: 'title', title: '剑心通明', attr: 'daoHeart', value: 1 }
 *                                                    → 解锁称号，可佩戴，提供小幅加成
 *   { kind: 'stones', amount: 5000 }                → 下品灵石
 *   null 表示无奖励
 *
 * attr 型奖励只能落在 player.attributes 已有的键上：
 *   comprehension / daoHeart / spiritSense / luck
 * 称号加成则由 systems/cultivation.js 的 aggregate() 统一并入派生属性。
 */

// ==================== 供状态层使用的默认值 ====================

/** state.achievements 的默认结构。state.js 与 systems/achievement.js 共用，保证单一数据源。 */
export function achStateDefaults() {
  return {
    unlocked: [],        // 已解锁成就 id
    title: null,         // 当前佩戴的称号（成就 id）
    rewarded: [],        // 已发过奖励的成就 id（防重复发放）
    meters: {
      brokeSec: 0,              // 连续 0 灵石的秒数
      brokeTimes: 0,            // 灵石归零的次数（一次"归零→回血"算一次）
      wasBroke: false,          // 上一帧是否处于 0 灵石
      bestStreak: 0,            // 历史最长连胜
      pendingFailStreak: 0,     // 当前连续突破失败次数
      failStreakMax: 0,         // 历史最长突破连败
      totalFails: 0,            // 累计突破失败次数
      longBattle: 0,            // 历史最长战斗回合
      brokeAfterManyFails: false, // 连败 5 次后终于突破成功
      lowHpWin: false,          // 气血低于 5% 反败为胜
      oneRoundWin: false,       // 一回合取胜
    },
  };
}

// ==================== 只读小工具 ====================

const stats = (s) => s?.stats || {};
const meters = (s) => s?.achievements?.meters || {};
const attrs = (s) => s?.player?.attributes || {};

/** 灵石折算为下品总数 */
function stonesLow(s) {
  const t = s?.resources?.stones || {};
  return (t.low || 0) + (t.mid || 0) * 100 + (t.high || 0) * 10000;
}

/** 某座洞府建筑等级 */
function bldLv(s, id) {
  return s?.cave?.buildings?.[id]?.level || 0;
}

/** 拥有过的装备种类数（按基础 id 去重，含已穿戴） */
function equipKindCount(s) {
  const set = new Set();
  for (const inst of s?.equipment?.owned || []) set.add(inst.baseId);
  return set.size;
}

/** 是否拥有达到某品阶的装备（order: 1 凡 2 灵 3 仙 4 神 5 圣） */
function hasQualityAtLeast(s, order) {
  const table = { fan: 1, ling: 2, xian: 3, shen: 4, sheng: 5 };
  return (s?.equipment?.owned || []).some((e) => (table[e.quality] || 1) >= order);
}

/** 背包里同种丹药的最大堆叠数 */
function maxPillStack(s) {
  const v = Object.values(s?.consumables || {});
  return v.length ? Math.max(...v) : 0;
}

const knownTechCount = (s) => Object.keys(s?.techniques?.known || {}).length;
const pillKindCount = (s) => Object.keys(s?.consumables || {}).filter((k) => (s.consumables[k] || 0) > 0).length;
const materialKindCount = (s) => Object.keys(s?.resources?.materials || {}).filter((k) => (s.resources.materials[k] || 0) > 0).length;
const alchRecipeCount = (s) => (s?.alchemy?.knownRecipes || []).length;
const forgeRecipeCount = (s) => (s?.forging?.knownRecipes || []).length;
const maxBuildingLevel = (s) => {
  let m = 0;
  for (const b of Object.values(s?.cave?.buildings || {})) m = Math.max(m, b?.level || 0);
  return m;
};
const allBuildingsBuilt = (s) =>
  ['bld_spirit', 'bld_herb', 'bld_alchemy', 'bld_forge', 'bld_library', 'bld_ward'].every((id) => bldLv(s, id) >= 1);
const luckTotal = (s) => (s?.player?.base?.luck || 0) + (attrs(s).luck || 0);
const bestStreak = (s) => Math.max(s?.combat?.winStreak || 0, meters(s).bestStreak || 0);

// ==================== 成就定义 ====================

export const ACHIEVEMENTS = [
  // ============================================================
  // 修行 cultivate（境界 / 突破 / 渡劫）
  // ============================================================
  { id: 'ach_cult_realm1', name: '初窥门径', desc: '踏入炼气二层，气感渐稳', category: 'cultivate',
    check: (s) => (s?.player?.realmIndex || 0) >= 1, reward: { kind: 'stones', amount: 100 } },
  { id: 'ach_cult_realm5', name: '五气朝元', desc: '修至炼气五层，根基渐固', category: 'cultivate',
    check: (s) => (s?.player?.realmIndex || 0) >= 4, reward: null },
  { id: 'ach_cult_realm9', name: '炼气圆满', desc: '九转功成，凡躯已至极限', category: 'cultivate',
    check: (s) => (s?.player?.realmIndex || 0) >= 8, reward: { kind: 'attr', attr: 'comprehension', value: 1 } },
  { id: 'ach_cult_build', name: '道基初筑', desc: '脱胎换骨，踏入筑基期', category: 'cultivate',
    check: (s) => (s?.player?.realmIndex || 0) >= 9, reward: { kind: 'stones', amount: 2000 } },
  { id: 'ach_cult_jindan', name: '金丹大道', desc: '液凝成丹，自此可称真人', category: 'cultivate',
    check: (s) => (s?.player?.realmIndex || 0) >= 12, reward: { kind: 'attr', attr: 'daoHeart', value: 2 } },
  { id: 'ach_cult_yuanying', name: '元婴出窍', desc: '破丹成婴，元神始能离体', category: 'cultivate',
    check: (s) => (s?.player?.realmIndex || 0) >= 15, reward: { kind: 'title', title: '元婴真君', attr: 'spiritSense', value: 3 } },
  { id: 'ach_cult_huashen', name: '化神入虚', desc: '化神入虚，天人交感', category: 'cultivate',
    check: (s) => (s?.player?.realmIndex || 0) >= 18, reward: { kind: 'stones', amount: 50000 } },
  { id: 'ach_cult_lianxu', name: '炼虚合道', desc: '炼虚合道，与天地同寿', category: 'cultivate',
    check: (s) => (s?.player?.realmIndex || 0) >= 21, reward: { kind: 'title', title: '炼虚真人', attr: 'comprehension', value: 3 } },
  { id: 'ach_cult_heti', name: '与道合真', desc: '合体成真，神通无量', category: 'cultivate',
    check: (s) => (s?.player?.realmIndex || 0) >= 22, reward: null },
  { id: 'ach_cult_dacheng', name: '大乘圆满', desc: '大乘圆满，只待天劫', category: 'cultivate',
    check: (s) => (s?.player?.realmIndex || 0) >= 23, reward: { kind: 'stones', amount: 500000 } },
  { id: 'ach_cult_dujie', name: '天劫加身', desc: '踏入渡劫期，生死一线', category: 'cultivate',
    check: (s) => (s?.player?.realmIndex || 0) >= 24, reward: { kind: 'title', title: '渡劫真君', attr: 'daoHeart', value: 5 } },
  { id: 'ach_cult_feisheng', name: '白日飞升', desc: '位列仙班，从此天高海阔', category: 'cultivate',
    check: (s) => (s?.player?.realmIndex || 0) >= 25, reward: { kind: 'title', title: '飞升仙人', attr: 'spiritSense', value: 5 } },

  { id: 'ach_cult_break10', name: '十关通明', desc: '累计突破十次', category: 'cultivate',
    check: (s) => (stats(s).breakthroughs || 0) >= 10, reward: { kind: 'attr', attr: 'luck', value: 2 } },
  { id: 'ach_cult_break30', name: '百尺竿头', desc: '累计突破三十次', category: 'cultivate',
    check: (s) => (stats(s).breakthroughs || 0) >= 30, reward: { kind: 'title', title: '破关客', attr: 'atk', value: 20 } },
  { id: 'ach_cult_trib1', name: '初渡天劫', desc: '渡过生平第一道天劫', category: 'cultivate',
    check: (s) => (stats(s).tribulationsPassed || 0) >= 1, reward: { kind: 'stones', amount: 1000 } },
  { id: 'ach_cult_trib5', name: '五劫不磨', desc: '渡过五道天劫', category: 'cultivate',
    check: (s) => (stats(s).tribulationsPassed || 0) >= 5, reward: { kind: 'attr', attr: 'daoHeart', value: 3 } },
  { id: 'ach_cult_trib8', name: '九劫归一', desc: '八道天劫关口尽数渡过', category: 'cultivate',
    check: (s) => (stats(s).tribulationsPassed || 0) >= 8, reward: { kind: 'title', title: '九劫真人', attr: 'daoHeart', value: 8 } },
  { id: 'ach_cult_cult1e6', name: '积土成山', desc: '累计获取一百万修为', category: 'cultivate',
    check: (s) => (stats(s).totalCultGained || 0) >= 1e6, reward: null },
  { id: 'ach_cult_cult1e9', name: '汪洋恣肆', desc: '累计获取十亿修为', category: 'cultivate',
    check: (s) => (stats(s).totalCultGained || 0) >= 1e9, reward: { kind: 'stones', amount: 100000 } },

  // ============================================================
  // 战斗 combat（胜场 / 连胜 / 爬塔 / 阵亡）
  // ============================================================
  { id: 'ach_combat_kill1', name: '初开杀戒', desc: '击败第一个敌人', category: 'combat',
    check: (s) => (stats(s).kills || 0) >= 1, reward: null },
  { id: 'ach_combat_kill50', name: '百战之身', desc: '累计击败五十名敌人', category: 'combat',
    check: (s) => (stats(s).kills || 0) >= 50, reward: { kind: 'stones', amount: 500 } },
  { id: 'ach_combat_kill300', name: '千锤百炼', desc: '累计击败三百名敌人', category: 'combat',
    check: (s) => (stats(s).kills || 0) >= 300, reward: { kind: 'title', title: '杀伐真人', attr: 'atk', value: 20 } },
  { id: 'ach_combat_streak10', name: '十战十胜', desc: '取得十连胜', category: 'combat',
    check: (s) => bestStreak(s) >= 10, reward: { kind: 'attr', attr: 'luck', value: 1 } },
  { id: 'ach_combat_streak25', name: '廿五连捷', desc: '取得二十五连胜', category: 'combat',
    check: (s) => bestStreak(s) >= 25, reward: { kind: 'title', title: '常胜将军', attr: 'atk', value: 15 } },
  { id: 'ach_combat_streak50', name: '五十连胜', desc: '取得五十连胜，气吞万里', category: 'combat',
    check: (s) => bestStreak(s) >= 50, reward: { kind: 'stones', amount: 20000 } },
  { id: 'ach_combat_tower10', name: '试炼十层', desc: '试炼塔登临第十层', category: 'combat',
    check: (s) => (s?.combat?.towerBest || 0) >= 10, reward: { kind: 'stones', amount: 800 } },
  { id: 'ach_combat_tower30', name: '试炼三十层', desc: '试炼塔登临第三十层', category: 'combat',
    check: (s) => (s?.combat?.towerBest || 0) >= 30, reward: { kind: 'attr', attr: 'atk', value: 10 } },
  { id: 'ach_combat_tower50', name: '试炼五十层', desc: '试炼塔登临第五十层', category: 'combat',
    check: (s) => (s?.combat?.towerBest || 0) >= 50, reward: { kind: 'title', title: '登塔客', attr: 'atk', value: 25 } },
  { id: 'ach_combat_tower100', name: '登峰造极', desc: '试炼塔登临第一百层', category: 'combat',
    check: (s) => (s?.combat?.towerBest || 0) >= 100, reward: { kind: 'title', title: '塔顶之人', attr: 'atk', value: 40 } },
  { id: 'ach_combat_death10', name: '九死一生', desc: '累计战败十次仍不改其志', category: 'combat',
    check: (s) => (stats(s).deaths || 0) >= 10, reward: null },
  { id: 'ach_combat_death50', name: '百死不悔', desc: '累计战败五十次仍未放弃', category: 'combat',
    check: (s) => (stats(s).deaths || 0) >= 50, reward: { kind: 'attr', attr: 'daoHeart', value: 3 } },
  { id: 'ach_combat_explore50', name: '野斗五十场', desc: '探险途中击败五十名敌手', category: 'combat',
    check: (s) => (stats(s).exploreWins || 0) >= 50, reward: { kind: 'stones', amount: 3000 } },
  { id: 'ach_combat_explore200', name: '身经百战', desc: '探险途中击败两百名敌手', category: 'combat',
    check: (s) => (stats(s).exploreWins || 0) >= 200, reward: { kind: 'attr', attr: 'luck', value: 3 } },

  // ============================================================
  // 经营 manage（炼丹 / 炼器 / 洞府 / 积累）
  // ============================================================
  { id: 'ach_mng_pill1', name: '初成丹', desc: '炼成第一炉丹药', category: 'manage',
    check: (s) => (stats(s).pillsMade || 0) >= 1, reward: null },
  { id: 'ach_mng_pill50', name: '丹道小成', desc: '累计炼成五十炉丹药', category: 'manage',
    check: (s) => (stats(s).pillsMade || 0) >= 50, reward: { kind: 'attr', attr: 'comprehension', value: 1 } },
  { id: 'ach_mng_pill200', name: '炉火纯青', desc: '累计炼成两百炉丹药', category: 'manage',
    check: (s) => (stats(s).pillsMade || 0) >= 200, reward: { kind: 'title', title: '丹道宗师', attr: 'comprehension', value: 3 } },
  { id: 'ach_mng_forge1', name: '初锻器', desc: '炼成第一件器物', category: 'manage',
    check: (s) => (stats(s).itemsForged || 0) >= 1, reward: null },
  { id: 'ach_mng_forge30', name: '铸器三十', desc: '累计炼成三十件器物', category: 'manage',
    check: (s) => (stats(s).itemsForged || 0) >= 30, reward: { kind: 'attr', attr: 'spiritSense', value: 1 } },
  { id: 'ach_mng_forge100', name: '百炼成器', desc: '累计炼成一百件器物', category: 'manage',
    check: (s) => (stats(s).itemsForged || 0) >= 100, reward: { kind: 'title', title: '器道宗师', attr: 'daoHeart', value: 3 } },
  { id: 'ach_mng_cave3', name: '洞天初成', desc: '将洞府扩建至三级', category: 'manage',
    check: (s) => (s?.cave?.level || 0) >= 3, reward: { kind: 'stones', amount: 500 } },
  { id: 'ach_mng_cave6', name: '福地洞天', desc: '将洞府扩建至六级', category: 'manage',
    check: (s) => (s?.cave?.level || 0) >= 6, reward: { kind: 'stones', amount: 5000 } },
  { id: 'ach_mng_cave9', name: '洞府圆满', desc: '将洞府扩建至九级', category: 'manage',
    check: (s) => (s?.cave?.level || 0) >= 9, reward: { kind: 'title', title: '洞天之主', attr: 'spiritSense', value: 4 } },
  { id: 'ach_mng_bld9', name: '一府之极', desc: '将任意一座洞府建筑升至满级', category: 'manage',
    check: (s) => maxBuildingLevel(s) >= 9, reward: null },
  { id: 'ach_mng_ward5', name: '固若金汤', desc: '护山大阵升至五级', category: 'manage',
    check: (s) => bldLv(s, 'bld_ward') >= 5, reward: { kind: 'attr', attr: 'daoHeart', value: 2 } },
  { id: 'ach_mng_allbld', name: '六府俱全', desc: '六座洞府建筑尽数落成', category: 'manage',
    check: (s) => allBuildingsBuilt(s), reward: { kind: 'stones', amount: 10000 } },
  { id: 'ach_mng_stone1e4', name: '小有积蓄', desc: '持有灵石折合一万下品', category: 'manage',
    check: (s) => stonesLow(s) >= 10000, reward: null },
  { id: 'ach_mng_stone1e6', name: '富甲一方', desc: '持有灵石折合百万下品', category: 'manage',
    check: (s) => stonesLow(s) >= 1e6, reward: { kind: 'title', title: '陶朱公', attr: 'comprehension', value: 2 } },
  { id: 'ach_mng_stone1e8', name: '富可敌国', desc: '持有灵石折合一亿下品', category: 'manage',
    check: (s) => stonesLow(s) >= 1e8, reward: { kind: 'title', title: '富可敌国', attr: 'comprehension', value: 4 } },
  { id: 'ach_mng_alch10', name: '丹方十悟', desc: '参悟十张丹方', category: 'manage',
    check: (s) => alchRecipeCount(s) >= 10, reward: { kind: 'attr', attr: 'comprehension', value: 1 } },
  { id: 'ach_mng_forge10', name: '器图十参', desc: '参悟十张器图', category: 'manage',
    check: (s) => forgeRecipeCount(s) >= 10, reward: { kind: 'attr', attr: 'spiritSense', value: 1 } },

  // ============================================================
  // 际遇 fortune（奇遇 / 探险 / 收藏）
  // ============================================================
  { id: 'ach_fort_enc1', name: '偶遇仙缘', desc: '经历第一次奇遇', category: 'fortune',
    check: (s) => (stats(s).encounters || 0) >= 1, reward: null },
  { id: 'ach_fort_enc20', name: '奇遇连连', desc: '经历二十次奇遇', category: 'fortune',
    check: (s) => (stats(s).encounters || 0) >= 20, reward: { kind: 'stones', amount: 1000 } },
  { id: 'ach_fort_enc100', name: '机缘深厚', desc: '经历一百次奇遇', category: 'fortune',
    check: (s) => (stats(s).encounters || 0) >= 100, reward: { kind: 'attr', attr: 'luck', value: 2 } },
  { id: 'ach_fort_enc300', name: '气运滔天', desc: '经历三百次奇遇', category: 'fortune',
    check: (s) => (stats(s).encounters || 0) >= 300, reward: { kind: 'title', title: '福缘深厚', attr: 'spiritSense', value: 4 } },
  { id: 'ach_fort_equip10', name: '藏器十件', desc: '拥有过十种不同的装备', category: 'fortune',
    check: (s) => equipKindCount(s) >= 10, reward: null },
  { id: 'ach_fort_equip25', name: '琳琅满目', desc: '拥有过二十五种不同的装备', category: 'fortune',
    check: (s) => equipKindCount(s) >= 25, reward: { kind: 'stones', amount: 8000 } },
  { id: 'ach_fort_equip36', name: '收藏大家', desc: '集齐全部三十六种装备', category: 'fortune',
    check: (s) => equipKindCount(s) >= 36, reward: { kind: 'title', title: '多宝道人', attr: 'spiritSense', value: 3 } },
  { id: 'ach_fort_shen', name: '神物在手', desc: '获得一件神品或以上装备', category: 'fortune',
    check: (s) => hasQualityAtLeast(s, 4), reward: { kind: 'attr', attr: 'spiritSense', value: 1 } },
  { id: 'ach_fort_sheng', name: '圣品临世', desc: '获得一件圣品装备', category: 'fortune',
    check: (s) => hasQualityAtLeast(s, 5), reward: { kind: 'title', title: '鉴宝斋主', attr: 'comprehension', value: 2 } },
  { id: 'ach_fort_pill8', name: '丹药八珍', desc: '同时持有八种不同的丹药', category: 'fortune',
    check: (s) => pillKindCount(s) >= 8, reward: null },
  // id 里的 "17" 是历史遗留：后来补了四味修为丹（蕴灵/紫府/造化/大衍），总数升到 21。
  // 刻意不改 id —— 成就按 id 存档，改名会让老存档重领一次悟性 +2。
  { id: 'ach_fort_pill17', name: '百草入炉', desc: '集齐全部二十一种丹药', category: 'fortune',
    check: (s) => pillKindCount(s) >= 21, reward: { kind: 'attr', attr: 'comprehension', value: 2 } },
  { id: 'ach_fort_mat8', name: '灵材满篓', desc: '同时持有八种不同的灵材', category: 'fortune',
    check: (s) => materialKindCount(s) >= 8, reward: null },
  { id: 'ach_fort_mat16', name: '万物皆备', desc: '集齐全部十六种灵材', category: 'fortune',
    check: (s) => materialKindCount(s) >= 16, reward: { kind: 'title', title: '百草通神', attr: 'comprehension', value: 3 } },
  { id: 'ach_fort_tech5', name: '博采众长', desc: '习得五种功法', category: 'fortune',
    check: (s) => knownTechCount(s) >= 5, reward: null },
  { id: 'ach_fort_tech13', name: '万法归一', desc: '集齐全部十三种功法', category: 'fortune',
    check: (s) => knownTechCount(s) >= 13, reward: { kind: 'title', title: '万法归一', attr: 'daoHeart', value: 4 } },

  // ============================================================
  // 隐秘 secret（全部 hidden，需自己撞出来）
  // ============================================================
  { id: 'ach_secret_zenith', name: '枯木逢春', desc: '连续突破失败五次之后，终于破关成功', category: 'secret', hidden: true,
    check: (s) => meters(s).brokeAfterManyFails === true, reward: { kind: 'attr', attr: 'daoHeart', value: 3 } },
  { id: 'ach_secret_lastbreath', name: '一线生机', desc: '气血低于 5% 时反败为胜', category: 'secret', hidden: true,
    check: (s) => meters(s).lowHpWin === true, reward: { kind: 'attr', attr: 'daoHeart', value: 2 } },
  { id: 'ach_secret_penny', name: '两袖清风', desc: '身无分文，持续整整一个时辰', category: 'secret', hidden: true,
    check: (s) => (meters(s).brokeSec || 0) >= 3600, reward: { kind: 'stones', amount: 1000 } },
  { id: 'ach_secret_oneblow', name: '惊鸿一剑', desc: '一回合之内结束战斗并取胜', category: 'secret', hidden: true,
    check: (s) => meters(s).oneRoundWin === true, reward: { kind: 'attr', attr: 'luck', value: 2 } },
  { id: 'ach_secret_50rounds', name: '五十回合', desc: '单场战斗鏖战五十回合以上', category: 'secret', hidden: true,
    check: (s) => (meters(s).longBattle || 0) >= 50, reward: { kind: 'attr', attr: 'daoHeart', value: 2 } },
  { id: 'ach_secret_fail10', name: '百折不挠', desc: '单轮连续突破失败十次', category: 'secret', hidden: true,
    check: (s) => (meters(s).failStreakMax || 0) >= 10, reward: { kind: 'attr', attr: 'daoHeart', value: 3 } },
  { id: 'ach_secret_deaths20', name: '死地后生', desc: '累计战败二十次，仍未离开此道', category: 'secret', hidden: true,
    check: (s) => (stats(s).deaths || 0) >= 20, reward: { kind: 'title', title: '不死真人', attr: 'daoHeart', value: 4 } },
  { id: 'ach_secret_luck100', name: '天命所归', desc: '气运达到 100，天地皆助', category: 'secret', hidden: true,
    check: (s) => luckTotal(s) >= 100, reward: { kind: 'title', title: '天命之子', attr: 'spiritSense', value: 5 } },
  { id: 'ach_secret_pill99', name: '药石无量', desc: '同一种丹药囤积到九十九枚', category: 'secret', hidden: true,
    check: (s) => maxPillStack(s) >= 99, reward: { kind: 'attr', attr: 'comprehension', value: 2 } },
  { id: 'ach_secret_broke10', name: '家徒四壁', desc: '灵石归零十次，散尽还复来', category: 'secret', hidden: true,
    check: (s) => (meters(s).brokeTimes || 0) >= 10, reward: { kind: 'stones', amount: 5000 } },
];

// ==================== 分类元数据 ====================

export const ACH_CATEGORIES = [
  { id: 'cultivate', name: '修行', desc: '境界、突破与天劫' },
  { id: 'combat', name: '战斗', desc: '胜场、连胜与试炼塔' },
  { id: 'manage', name: '经营', desc: '炼丹、炼器与洞府' },
  { id: 'fortune', name: '际遇', desc: '奇遇、探险与收藏' },
  { id: 'secret', name: '隐秘', desc: '不足为外人道' },
];

// ==================== 查表 ====================

export function achievementById(id) {
  return ACHIEVEMENTS.find((a) => a.id === id) || null;
}

export function achievementsByCategory(cat) {
  return ACHIEVEMENTS.filter((a) => a.category === cat);
}

/**
 * 称号加成查表（供 systems/cultivation.js 使用，避免 systems 之间循环依赖）。
 * @returns {{title:string, attr:string, value:number}|null}
 */
export function titleBonusFor(id) {
  if (!id) return null;
  const ach = achievementById(id);
  if (!ach || ach.reward?.kind !== 'title') return null;
  return { title: ach.reward.title, attr: ach.reward.attr, value: ach.reward.value || 0 };
}
