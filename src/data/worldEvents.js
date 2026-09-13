/**
 * 世界天象数据表（V4.0「轮回」§5.6）。
 *
 * ⚠ 本文件是纯数据，不含任何逻辑，也不得出现 DOM / state 依赖。
 *
 * ─────────────────────────── 单机形态的前提 ───────────────────────────
 * 这是单机游戏，**没有真正的全服**。所以这里做的是「按现实时间轮换的全局天象」：
 * 同一时刻所有玩家遇到同样的天象，各自独立结算，互不影响。
 * 这样既有「世界在动」的感觉，又不需要任何服务端。
 *
 * ─────────────────────────── 字段契约 ───────────────────────────
 *   id          天象 id，we_ 前缀
 *   name        天象名号（有修仙味，不要占位符）
 *   kind        buff 增益 | battle 战事 | explore 探索 | loot 机缘 | risk 天险 | special 异象
 *   durationMin 持续时间（分钟）。轮换日程由 systems/worldEvent.js 按现实时间确定性推算
 *   weight      权重：越大在轮换日程里出现得越频繁（不参与运行时随机）
 *   color       展示主色（十六进制，UI 直接用）
 *   desc        一句话机制说明（给玩家看"这东西干什么用"）
 *   lore        志异体小传，纯风味
 *   effect      { kind, value } —— 天象的主效果，由 systems/worldEvent.js 汇总
 *   bonus       { kind, value } —— 可选。**负面天象必须带正面补偿**，
 *               否则玩家只会觉得被惩罚。见 we_yazhi / we_yaochi 等。
 *
 * ───────────────────── effect.kind 语义（供 cultivation / combat / encounter 调用）──
 *   cultPct            修炼速率加成（小数，0.25 = +25%）
 *   warContribution    宗门战贡献倍率加成（小数）
 *   beastTameRate      灵兽捕捉 / 孵化成功率加成（小数）
 *   dropRate           战斗 / 探索掉落率加成（小数）
 *   tribulationDiff    天劫难度加成（小数，正值 = 更难 = 负面）
 *   breakReward        突破 / 渡劫奖励加成（小数，正值 = 更好）
 *   enemyPower         敌人强度加成（小数，正值 = 更难 = 负面）
 *   breakChanceAdd     突破成功率绝对加成（小数）
 *   spiritSenseAdd     神识绝对加成（数值）
 *   encounterGoodBias  奇遇善缘倾向绝对加成（小数）
 *   stonesGain         灵石获取加成（小数）
 *   daoBaseGainMult    道基点获取加成（小数）
 */

export const EVENT_KINDS = {
  buff:    '增益',
  battle:  '战事',
  explore: '探索',
  loot:    '机缘',
  risk:    '天险',
  special: '异象',
};

export const WORLD_EVENTS = [
  // ==================================================================
  // 增益 —— 鼓励上线挂机，天象最好的一面
  // ==================================================================
  {
    id: 'we_lingqi', name: '灵气潮汐', kind: 'buff',
    durationMin: 180, weight: 30, color: '#3fa9a0',
    effect: { kind: 'cultPct', value: 0.25 },
    desc: '天地灵气如潮汐涌动，全玩家修炼速率 +25%',
    lore: '灵气本无形，唯潮汐起时，连凡人都能觉出空气里那股清冽的甜。修士说，那是大道在呼吸。',
  },
  {
    id: 'we_wudao', name: '悟道天时', kind: 'buff',
    durationMin: 200, weight: 12, color: '#7c6fce',
    effect: { kind: 'breakChanceAdd', value: 0.08 },
    desc: '天机澄澈，冲关时不易走火，突破成功率 +8%',
    lore: '每隔数十年，天地间会有一段"无风无雨、无悲无喜"的时辰。老修士称它作"道的破绽"，参得进的人，一步便是一境。',
  },
  {
    id: 'we_xingchen', name: '星辰垂照', kind: 'buff',
    durationMin: 160, weight: 10, color: '#4a7fd4',
    effect: { kind: 'spiritSenseAdd', value: 5 },
    desc: '星辉洗练神识，探查与寻宝的感知大幅提升（神识 +5）',
    lore: '星辰垂照之夜，山野会浮起一层极淡的银光。据说那不是月光，是上古陨落仙人的目光，仍在替后来者指路。',
  },

  // ==================================================================
  // 战事 —— 限时的高难战斗窗口
  // ==================================================================
  {
    id: 'we_modao', name: '魔道入侵', kind: 'battle',
    durationMin: 120, weight: 20, color: '#b23030',
    effect: { kind: 'warContribution', value: 2 },
    desc: '魔道大举来犯，击退者宗门贡献翻倍',
    lore: '烽烟自北境起，一夜之间烧红了半边天。宗门钟声连响九下——那是召集所有能提剑的人。',
  },
  {
    id: 'we_yaochao', name: '妖潮涌动', kind: 'battle',
    durationMin: 120, weight: 12, color: '#8a5a2b',
    effect: { kind: 'enemyPower', value: 0.20 },
    bonus: { kind: 'dropRate', value: 0.25 },
    desc: '妖兽暴动，敌人强度 +20%，但战利掉落 +25%',
    lore: '月圆之夜，深山里的兽吼此起彼伏，一声比一声近。猎户关了门，而修士推开了门。',
  },

  // ==================================================================
  // 探索 / 机缘 —— 稀有资源的投放窗口
  // ==================================================================
  {
    id: 'we_mijing', name: '秘境开启', kind: 'explore',
    durationMin: 150, weight: 16, color: '#3f8f5f',
    effect: { kind: 'beastTameRate', value: 0.30 },
    desc: '上古秘境洞开，灵兽捕捉与孵化成功率 +30%',
    lore: '秘境的门不是被推开的，是它自己认得时辰。时辰一到，崖壁上便裂开一道幽光，里面传出的风带着另一个季节的味道。',
  },
  {
    id: 'we_yibao', name: '天降异宝', kind: 'loot',
    durationMin: 90, weight: 14, color: '#c9a227',
    effect: { kind: 'dropRate', value: 0.40 },
    desc: '天外流火散落四方，掉落率 +40%，是难得的收成窗口',
    lore: '夜半有火自天外坠下，落地无声，只留一坑星砂。拾得的人说，那东西握在手里，是温的。',
  },
  {
    id: 'we_guyi', name: '古修遗府', kind: 'explore',
    durationMin: 180, weight: 10, color: '#5d8aa8',
    effect: { kind: 'encounterGoodBias', value: 0.10 },
    bonus: { kind: 'dropRate', value: 0.15 },
    desc: '上古洞府现世，善缘奇遇概率提升，探索掉落 +15%',
    lore: '有樵夫见山腹夜里透出灯光，走近却只有一片藤蔓。第二夜再去，藤蔓后多了一扇门。',
  },

  // ==================================================================
  // 天险 —— 负面天象。规则：必须同时带正面补偿，
  //          让玩家面对的是"取舍"，而不是"惩罚"。
  // ==================================================================
  {
    id: 'we_yazhi', name: '大道压制', kind: 'risk',
    durationMin: 240, weight: 12, color: '#6b5b95',
    effect: { kind: 'tribulationDiff', value: 0.25 },
    bonus: { kind: 'breakReward', value: 1.0 },
    desc: '大道高悬、天劫难度 +25%，然劫后所得翻倍——险中求道者，此时最宜冲关',
    lore: '天压得极低，云像铅一样沉。有人缩在洞府里等它过去，也有人在这时候，走进了雷里。',
  },
  {
    id: 'we_jieyun', name: '劫云四合', kind: 'risk',
    durationMin: 180, weight: 8, color: '#5a4a7a',
    effect: { kind: 'tribulationDiff', value: 0.35 },
    bonus: { kind: 'breakReward', value: 1.5 },
    desc: '劫云自四方合围，天劫难度 +35%，但突破奖励 +150%',
    lore: '劫云合围时没有风，连飞鸟都落在地上不动。那不是死寂，是天地在屏息，等一个敢抬头的人。',
  },
  {
    id: 'we_miedu', name: '灵脉枯竭', kind: 'risk',
    durationMin: 150, weight: 8, color: '#7a6a55',
    effect: { kind: 'cultPct', value: -0.15 },
    bonus: { kind: 'stonesGain', value: 0.50 },
    desc: '地脉灵气滞涩，修炼速率 -15%，但灵石产出 +50%',
    lore: '灵脉就像人身上的旧伤，阴天时会疼。老修士懂得在疼的时候去挖矿——灵气不来了，石头还在。',
  },
  {
    id: 'we_lundao', name: '轮回之隙', kind: 'special',
    durationMin: 120, weight: 6, color: '#a88bd4',
    effect: { kind: 'daoBaseGainMult', value: 0.50 },
    desc: '生死界限朦胧，道基点获取 +50%，是轮回者最看重的时辰',
    lore: '有人说见过这样的天：一半晴，一半雨，中间界线笔直如刀裁。走过那条线的人，会短暂地记起前世的事。',
  },
];

/** 按 id 取天象（找不到返回 null） */
export function eventById(id) {
  return WORLD_EVENTS.find((e) => e.id === id) || null;
}

/** 天象的主色（找不到时给一个中性色） */
export function eventColor(id) {
  return eventById(id)?.color || 'var(--text-muted)';
}
