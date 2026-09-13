/**
 * 轮回天赋树 · 数据表（V4.0）
 *
 * 三条支线，全部用道基点（state.reincarnation.daoBase）永久解锁：
 *   修行 cultivate —— 修炼速率 / 突破成功率 / 天劫抗性
 *   战伐 combat    —— 战斗属性 / 灵兽协同 / 宗门战战力
 *   机缘 fortune   —— 气运 / 奇遇品质 / 产出数量 / 悟性
 *
 * ============ 设计原则 ============
 *
 * 1. **层级分明，越深越贵**：tier 0 便宜且无前置；tier 1/2/3 需要先在本系
 *    投入够点数（requires.points）才能解锁，越往上单级成本越高。
 *    这样"这条线点满要走到底"——零散点几个低级的，永远摸不到本系的大招。
 *
 * 2. **有取舍，不全是纯加成**：强力的天赋带 malus（代价），例如
 *    「洗髓伐骨」修炼更快但突破更难，「焚天秘法」攻击暴涨但气血受损。
 *    代价与加成走同一套 kind 汇总通道（talentBonus 里 malus 取负），
 *    所以"这条线的收益"必须连着"它的代价"一起算。
 *
 * 3. **主线（main）**：每系有且只有一条主线天赋（本系的 tier 3 大招）。
 *    真结局条件"三系各点满一条主线"即三系主线天赋均满级，由
 *    systems/talent.js 的 isEndingPathUnlocked() 判定。
 *
 * 4. **夺天造化**（tal_fortune_duotian）：机缘系主线，也是全树唯一一条
 *    "对冲随机性"的天赋——每级给下一世天命一次保底重掷机会。
 *    玩家对"随机出生条件"的抗争手段，就在这一条。
 *
 * 数据结构（供 systems/talent.js 与 ui/panels/talentPanel.js 消费）：
 *   { id, branch, tier, name, desc,
 *     maxLevel, costPerLevel:[每级消耗的道基点（递增）],
 *     effect:{ kind, perLevel, malus?:{ kind, perLevel } },
 *     requires?:{ branch, points },   // 前置：本系已投入点数下限
 *     main?:true }                    // 是否本系主线（真结局判定用）
 */

// ==================== 支线定义 ====================

export const BRANCHES = {
  cultivate: {
    id: 'cultivate', name: '修行', color: 'var(--jade)',
    desc: '洗髓伐骨，直指大道',
    detail: '修炼速率、突破成功率、天劫抗性。走得快，也要走得稳。',
  },
  combat: {
    id: 'combat', name: '战伐', color: 'var(--accent)',
    desc: '以战养道，杀伐果决',
    detail: '战斗属性、灵兽协同、宗门战战力。把每一世的杀伐都刻进神魂。',
  },
  fortune: {
    id: 'fortune', name: '机缘', color: 'var(--gold)',
    desc: '福缘深厚，天道酬勤',
    detail: '气运、奇遇品质、产出数量、悟性。有人苦修百年，你一步遇仙。',
  },
};

/** 支线展示顺序（对象无序，UI 需要稳定顺序） */
export const BRANCH_ORDER = ['cultivate', 'combat', 'fortune'];

// ==================== 效果 kind 元信息（UI 展示用） ====================

/**
 * kind -> { label, unit }
 *   unit: 'pct' 百分比（如 +3%）| 'flat' 绝对值（如 +2）
 * UI 只读这张表，不在面板里散落 if-else。
 */
export const EFFECT_KIND_META = {
  // 修行
  cultPct: { label: '修炼速率', unit: 'pct' },
  breakAdd: { label: '突破成功率', unit: 'pct' },
  tribulationResist: { label: '天劫抗性', unit: 'pct' },
  daoHeartAdd: { label: '道心', unit: 'flat' },
  lifespanAdd: { label: '寿元', unit: 'flat' },
  // 战伐
  atkPct: { label: '攻击', unit: 'pct' },
  defPct: { label: '防御', unit: 'pct' },
  hpPct: { label: '气血', unit: 'pct' },
  critAdd: { label: '暴击', unit: 'pct' },
  beastSynergy: { label: '灵兽协同', unit: 'pct' },
  warPower: { label: '宗门战战力', unit: 'pct' },
  // 机缘
  luckAdd: { label: '气运', unit: 'flat' },
  comprehensionAdd: { label: '悟性', unit: 'flat' },
  encounterQuality: { label: '奇遇品质', unit: 'pct' },
  encounterRate: { label: '奇遇机缘', unit: 'pct' },
  yieldPct: { label: '产出数量', unit: 'pct' },
  fateReroll: { label: '天命重掷', unit: 'flat' },
};

// ==================== 天赋表 ====================

/**
 * id 命名约定：`tal_<branch>_<slug>`。
 * 分支名直接嵌进 id（tal_cultivate_* / tal_combat_* / tal_fortune_*），
 * 一是自解释，二是让任何"按 id 判断所属支线"的调用方都能直接命中——
 * 轮回系统里若用 id 子串粗判支线，也能正确归类，不会把战伐算进修行。
 */
export const TALENTS = [
  // ============================================================
  // 修行 cultivate —— 修炼速率 / 突破成功率 / 天劫抗性
  // ============================================================
  {
    id: 'tal_cultivate_tuna', branch: 'cultivate', tier: 0,
    name: '吐纳精微',
    desc: '吐故纳新，一呼一吸皆合天地节律。修行自此不疾不徐，却日进寸功。',
    maxLevel: 5,
    costPerLevel: [2, 3, 5, 8, 13],
    effect: { kind: 'cultPct', perLevel: 0.03 },
  },
  {
    id: 'tal_cultivate_guben', branch: 'cultivate', tier: 0,
    name: '固本培元',
    desc: '万丈高楼起于平地。根基夯实一分，破关时的天堑便浅一分。',
    maxLevel: 5,
    costPerLevel: [2, 3, 5, 8, 13],
    effect: { kind: 'breakAdd', perLevel: 0.010 },
  },
  {
    id: 'tal_cultivate_daoxin', branch: 'cultivate', tier: 0,
    name: '道心澄明',
    desc: '心若止水，则外魔不侵。历劫之时，凭的从来不是修为，是这一口气。',
    maxLevel: 5,
    costPerLevel: [2, 3, 5, 8, 13],
    effect: { kind: 'daoHeartAdd', perLevel: 2 },
  },
  {
    id: 'tal_cultivate_xisui', branch: 'cultivate', tier: 1,
    name: '洗髓伐骨',
    desc: '以真元冲刷经脉，剔去凡骨浊气。修行一日千里——但根基未稳，破关时反倒更难。',
    maxLevel: 5,
    costPerLevel: [4, 6, 9, 13, 18],
    // 取舍：修炼 +30%/满级，代价是突破成功率 -3%/满级
    effect: { kind: 'cultPct', perLevel: 0.06, malus: { kind: 'breakAdd', perLevel: 0.006 } },
    requires: { branch: 'cultivate', points: 6 },
  },
  {
    id: 'tal_cultivate_leijie', branch: 'cultivate', tier: 1,
    name: '雷劫淬体',
    desc: '引天雷入体，以劫火锻魂。疼是真疼，但从此雷霆加身，如沐春风。',
    maxLevel: 5,
    costPerLevel: [4, 6, 9, 13, 18],
    effect: { kind: 'tribulationResist', perLevel: 0.035 },
    requires: { branch: 'cultivate', points: 6 },
  },
  {
    id: 'tal_cultivate_bigu', branch: 'cultivate', tier: 2,
    name: '辟谷长生',
    desc: '不食五谷，吸风饮露。你渐渐忘了饥饿，也渐渐忘了自己曾是个凡人。',
    maxLevel: 5,
    costPerLevel: [6, 10, 15, 22, 30],
    effect: { kind: 'lifespanAdd', perLevel: 8 },
    requires: { branch: 'cultivate', points: 14 },
  },
  {
    id: 'tal_cultivate_wudao', branch: 'cultivate', tier: 2,
    name: '悟道无涯',
    desc: '一花一叶，皆可入道。多世轮回的见闻凝成一点灵光，参悟万物皆快人一步。',
    maxLevel: 5,
    costPerLevel: [6, 10, 15, 22, 30],
    effect: { kind: 'comprehensionAdd', perLevel: 3 },
    requires: { branch: 'cultivate', points: 14 },
  },
  {
    id: 'tal_cultivate_dadao', branch: 'cultivate', tier: 3,
    name: '大道功成',
    desc: '═══ 修行主线 ═══ 你已看尽大道的尽头。修为奔涌如江河决堤，' +
      '然逆天而行者，天亦不容——每进一步，天劫便重一分。',
    maxLevel: 3,
    costPerLevel: [18, 30, 48],
    // 主线大招：修炼 +36%/满级，代价是天劫抗性 -9%/满级（即天劫更难）
    effect: { kind: 'cultPct', perLevel: 0.12, malus: { kind: 'tribulationResist', perLevel: 0.03 } },
    requires: { branch: 'cultivate', points: 24 },
    main: true,
  },

  // ============================================================
  // 战伐 combat —— 战斗属性 / 灵兽协同 / 宗门战战力
  // ============================================================
  {
    id: 'tal_combat_lianqi', branch: 'combat', tier: 0,
    name: '炼气化力',
    desc: '将一缕真元炼入拳锋。凡人挥拳是挥拳，你挥拳是山崩。',
    maxLevel: 5,
    costPerLevel: [2, 3, 5, 8, 13],
    effect: { kind: 'atkPct', perLevel: 0.03 },
  },
  {
    id: 'tal_combat_hufu', branch: 'combat', tier: 0,
    name: '虎符护身',
    desc: '前世征战的经验化入筋骨，出手之际，护体真气自成一层。',
    maxLevel: 5,
    costPerLevel: [2, 3, 5, 8, 13],
    effect: { kind: 'defPct', perLevel: 0.03 },
  },
  {
    id: 'tal_combat_xueqi', branch: 'combat', tier: 0,
    name: '气血如龙',
    desc: '多世淬炼的肉身如烘炉，血气翻涌间，寻常刀剑难伤分毫。',
    maxLevel: 5,
    costPerLevel: [2, 3, 5, 8, 13],
    effect: { kind: 'hpPct', perLevel: 0.03 },
  },
  {
    id: 'tal_combat_jianxin', branch: 'combat', tier: 1,
    name: '剑心通明',
    desc: '剑不在手，在心。心之所向，便是剑锋所至——要害之处，从不落空。',
    maxLevel: 5,
    costPerLevel: [4, 6, 9, 13, 18],
    effect: { kind: 'critAdd', perLevel: 0.012 },
    requires: { branch: 'combat', points: 6 },
  },
  {
    id: 'tal_combat_yushou', branch: 'combat', tier: 1,
    name: '驭兽同心',
    desc: '你与灵兽之间不必言语。它知你下一步要杀谁，你也知它何时会扑上来。',
    maxLevel: 5,
    costPerLevel: [4, 6, 9, 13, 18],
    effect: { kind: 'beastSynergy', perLevel: 0.05 },
    requires: { branch: 'combat', points: 6 },
  },
  {
    id: 'tal_combat_fentian', branch: 'combat', tier: 2,
    name: '焚天秘法',
    desc: '以寿元为薪，以血肉为柴。这一拳可焚尽山河，代价是燃去自己的一部分。',
    maxLevel: 5,
    costPerLevel: [6, 10, 15, 22, 30],
    // 取舍：攻击 +35%/满级，代价是气血上限 -10%/满级
    effect: { kind: 'atkPct', perLevel: 0.07, malus: { kind: 'hpPct', perLevel: 0.02 } },
    requires: { branch: 'combat', points: 14 },
  },
  {
    id: 'tal_combat_zhenjun', branch: 'combat', tier: 2,
    name: '镇军之威',
    desc: '轮回中你曾为将、为帅、为一方之主。如今再立阵前，万人辟易。',
    maxLevel: 5,
    costPerLevel: [6, 10, 15, 22, 30],
    effect: { kind: 'warPower', perLevel: 0.06 },
    requires: { branch: 'combat', points: 14 },
  },
  {
    id: 'tal_combat_wushuang', branch: 'combat', tier: 3,
    name: '举世无双',
    desc: '═══ 战伐主线 ═══ 你已忘了"守"字怎么写。攻伐之道走到极处，' +
      '天地之间再无一合之敌——只是你的身后，也再没有退路。',
    maxLevel: 3,
    costPerLevel: [18, 30, 48],
    // 主线大招：攻击 +36%/满级，代价是防御 -12%/满级
    effect: { kind: 'atkPct', perLevel: 0.12, malus: { kind: 'defPct', perLevel: 0.04 } },
    requires: { branch: 'combat', points: 24 },
    main: true,
  },

  // ============================================================
  // 机缘 fortune —— 气运 / 奇遇品质 / 产出数量 / 悟性
  // ============================================================
  {
    id: 'tal_fortune_fuyuan', branch: 'fortune', tier: 0,
    name: '福缘深厚',
    desc: '冥冥之中似有气运垂青。走路能捡宝，喝水都塞牙缝——塞的是仙缘。',
    maxLevel: 5,
    costPerLevel: [2, 3, 5, 8, 13],
    effect: { kind: 'luckAdd', perLevel: 2 },
  },
  {
    id: 'tal_fortune_lingjue', branch: 'fortune', tier: 0,
    name: '灵觉敏锐',
    desc: '轮回多世，你的神魂比常人更通透几分。旁人苦思不得的关窍，你一眼便透。',
    maxLevel: 5,
    costPerLevel: [2, 3, 5, 8, 13],
    effect: { kind: 'comprehensionAdd', perLevel: 2 },
  },
  {
    id: 'tal_fortune_jiancai', branch: 'fortune', tier: 0,
    name: '见财起意',
    desc: '活过几辈子的人都懂：机缘来了，手要快。灵田、丹炉、矿脉，出产总比别人多一分。',
    maxLevel: 5,
    costPerLevel: [2, 3, 5, 8, 13],
    effect: { kind: 'yieldPct', perLevel: 0.03 },
  },
  {
    id: 'tal_fortune_qiyu', branch: 'fortune', tier: 1,
    name: '奇遇良缘',
    desc: '同样的山，你走进去遇见的是隐世高人；别人走进去，遇见的是野狗。',
    maxLevel: 5,
    costPerLevel: [4, 6, 9, 13, 18],
    effect: { kind: 'encounterQuality', perLevel: 0.05 },
    requires: { branch: 'fortune', points: 6 },
  },
  {
    id: 'tal_fortune_shouji', branch: 'fortune', tier: 1,
    name: '守株待兔',
    desc: '机缘不是每一次都能抓住，但多世之人的直觉，总能在它路过时抬起头来。',
    maxLevel: 5,
    costPerLevel: [4, 6, 9, 13, 18],
    effect: { kind: 'encounterRate', perLevel: 0.05 },
    requires: { branch: 'fortune', points: 6 },
  },
  {
    id: 'tal_fortune_juxian', branch: 'fortune', tier: 2,
    name: '聚宝之皿',
    desc: '你的储物袋似乎总比别人宽裕。多世积累的不只是财富，还有"会攒钱"这件事本身。',
    maxLevel: 5,
    costPerLevel: [6, 10, 15, 22, 30],
    effect: { kind: 'yieldPct', perLevel: 0.07 },
    requires: { branch: 'fortune', points: 14 },
  },
  {
    id: 'tal_fortune_mingshi', branch: 'fortune', tier: 2,
    name: '明心见性',
    desc: '看破红尘，方能参透大道。只是看得太透，人也就懒了——身外之物，随缘吧。',
    maxLevel: 5,
    costPerLevel: [6, 10, 15, 22, 30],
    // 取舍：悟性 +20/满级，代价是产出 -10%/满级
    effect: { kind: 'comprehensionAdd', perLevel: 4, malus: { kind: 'yieldPct', perLevel: 0.02 } },
    requires: { branch: 'fortune', points: 14 },
  },
  {
    id: 'tal_fortune_duotian', branch: 'fortune', tier: 3,
    name: '夺天造化',
    desc: '═══ 机缘主线 · 夺天造化 ═══ ' +
      '天道给每个人一副牌，你改不了牌面——但你可以重新发牌。' +
      '每级为下一世天命提供一次保底重掷：出生条件不合意时，命运可以再骰一次。',
    maxLevel: 3,
    costPerLevel: [20, 35, 55],
    // 全树唯一的"对冲随机性"机制：每级 +1 次天命保底重掷。
    // 由 systems/reincarnation.js 在转世掷天命时调用 talentBonus('fateReroll') 取用。
    effect: { kind: 'fateReroll', perLevel: 1 },
    requires: { branch: 'fortune', points: 24 },
    main: true,
  },
];

// ==================== 查询（纯查表，无业务逻辑） ====================

const BY_ID = new Map(TALENTS.map((t) => [t.id, t]));

/** 按 id 取天赋定义；不存在返回 null */
export function talentById(id) {
  return BY_ID.get(id) || null;
}

/** 取某条支线的全部天赋，按 tier 升序（同级保持表内声明顺序） */
export function talentsByBranch(branch) {
  return TALENTS
    .filter((t) => t.branch === branch)
    .sort((a, b) => a.tier - b.tier);
}

/** 取某条支线的主线天赋（每系恰好一条） */
export function mainTalentOf(branch) {
  return TALENTS.find((t) => t.branch === branch && t.main) || null;
}
