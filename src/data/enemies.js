/**
 * 敌人。供战斗塔、探险遭遇与奇遇复用。
 *
 * 字段约定：
 *   tier      1~5，对应炼气 / 筑基 / 金丹 / 元婴 / 化神以上
 *   minRealm  最低出现境界索引（0..25）；enemiesByRealm 取"最近三档"
 *   power     综合战力标量，用于 UI 展示与匹配，公式见下
 *   base      hp / atk / def / spd / crit
 *   skills    1~3 个招式，kind: damage | heal | buff | debuff | drain
 *             power 对 damage/drain 是倍率；对 heal 是最大气血回复比例；
 *             对 buff/debuff 是百分比强度
 *   loot      material 掉落引用 materials.js 白名单 id；stones.low 为下品灵石
 *
 * 战力公式（与 base 自洽）：
 *   power ≈ atk + 0.6*def + 0.08*hp + 0.8*spd
 * 例：tier1 约 35~65，tier2 约 210~310，tier3 约 1500~2500，
 *     tier4 约 8000~14000，tier5 约 5.6万~13万。
 */

export const ENEMIES = [
  // ==================================================================
  // tier 1 —— 野兽 / 山贼 / 散修（炼气期）
  // ==================================================================
  {
    id: 'en_yezhu', name: '山林野猪', tier: 1, minRealm: 0, power: 30,
    base: {hp: 90, atk: 9, def: 3, spd: 8, crit: 0.03},
    skills: [
      { id: 'sk_yezhu_chong', name: '蛮撞', kind: 'damage', power: 1.3, desc: '低头猛冲，以獠牙挑敌' },
    ],
    loot: [
      { material: 'mat_shougu', chance: 0.5, amount: [1, 2] },
      { stones: { low: [8, 40] }, chance: 0.7 },
    ],
    desc: '山间常见的凶悍野猪，皮糙肉厚，獠牙如刀。',
  },
  {
    id: 'en_canglang', name: '苍狼', tier: 1, minRealm: 1, power: 36,
    base: {hp: 110, atk: 11, def: 4, spd: 11, crit: 0.05},
    skills: [
      { id: 'sk_canglang_si', name: '撕咬', kind: 'damage', power: 1.25, desc: '扑击撕咬，伤口难愈' },
      { id: 'sk_canglang_hao', name: '狼嚎', kind: 'buff', power: 0.15, desc: '引群狼呼应，攻势转急' },
    ],
    loot: [
      { material: 'mat_shougu', chance: 0.55, amount: [1, 3] },
      { material: 'mat_lingzhi', chance: 0.3, amount: [1, 2] },
      { stones: { low: [10, 45] }, chance: 0.7 },
    ],
    desc: '独行的苍狼，眼神幽绿，比寻常恶狼更懂配合。',
  },
  {
    id: 'en_shanzei', name: '拦路山贼', tier: 1, minRealm: 2, power: 44,
    base: {hp: 140, atk: 13, def: 7, spd: 10, crit: 0.04},
    skills: [
      { id: 'sk_shanzei_dao', name: '劈山刀', kind: 'damage', power: 1.4, desc: '一柄鬼头刀，当头劈落' },
    ],
    loot: [
      { material: 'mat_xuantie', chance: 0.35, amount: [1, 2] },
      { material: 'mat_lingzhi', chance: 0.3, amount: [1, 2] },
      { stones: { low: [15, 60] }, chance: 0.75 },
    ],
    desc: '占山为王的亡命徒，劫掠散修，身上常带着搜刮来的灵石。',
  },
  {
    id: 'en_sanxiu', name: '落魄散修', tier: 1, minRealm: 3, power: 49,
    base: {hp: 130, atk: 14, def: 7, spd: 13, crit: 0.06},
    skills: [
      { id: 'sk_sanxiu_jian', name: '落魄剑', kind: 'damage', power: 1.3, desc: '剑法散乱，却招招拼命' },
      { id: 'sk_sanxiu_cai', name: '采气', kind: 'drain', power: 1.0, desc: '夺人灵力以自补' },
    ],
    loot: [
      { material: 'mat_lingzhi', chance: 0.4, amount: [1, 3] },
      { material: 'mat_xuantie', chance: 0.25, amount: [1, 1] },
      { stones: { low: [20, 80] }, chance: 0.7 },
    ],
    desc: '灵根不佳、四处碰壁的散修，剑法尚可，心气已衰。',
  },
  {
    id: 'en_duyanfu', name: '毒眼蝠', tier: 1, minRealm: 4, power: 52,
    base: {hp: 100, atk: 15, def: 5, spd: 15, crit: 0.08},
    skills: [
      { id: 'sk_duyanfu_ya', name: '毒牙', kind: 'damage', power: 1.2, desc: '咬中处毒气蔓延' },
      { id: 'sk_duyanfu_wu', name: '毒雾', kind: 'debuff', power: 0.2, desc: '喷吐毒雾，侵蚀护体真元' },
    ],
    loot: [
      { material: 'mat_lingzhi', chance: 0.35, amount: [1, 2] },
      { material: 'mat_shougu', chance: 0.3, amount: [1, 2] },
      { stones: { low: [18, 70] }, chance: 0.65 },
    ],
    desc: '栖于阴湿洞窟的妖蝠，双翼展开有磨盘大小，眼泛幽毒之光。',
  },
  {
    id: 'en_heifengxiong', name: '黑风熊', tier: 1, minRealm: 6, power: 56,
    base: {hp: 150, atk: 13, def: 8, spd: 9, crit: 0.05},
    skills: [
      { id: 'sk_heixiong_zhang', name: '巨掌', kind: 'damage', power: 1.5, desc: '一掌拍下，地裂石碎' },
      { id: 'sk_heixiong_kuang', name: '狂暴', kind: 'buff', power: 0.2, desc: '负痛狂怒，力道倍增' },
    ],
    loot: [
      { material: 'mat_shougu', chance: 0.6, amount: [2, 4] },
      { material: 'mat_xuantie', chance: 0.3, amount: [1, 2] },
      { stones: { low: [25, 90] }, chance: 0.7 },
    ],
    desc: '炼气九层修士也要绕道的山中霸主，一掌能拍碎青石。',
  },

  // ==================================================================
  // tier 2 —— 精英妖兽 / 匪首 / 邪修（筑基期）
  // ==================================================================
  {
    id: 'en_xueyaolang', name: '血妖狼', tier: 2, minRealm: 9, power: 210,
    base: { hp: 950, atk: 82, def: 55, spd: 20, crit: 0.06 },
    skills: [
      { id: 'sk_xueyaolang_zhua', name: '血爪', kind: 'damage', power: 1.35, desc: '爪上血光暴涨，撕裂护体' },
      { id: 'sk_xueyaolang_xi', name: '吸髓', kind: 'drain', power: 1.1, desc: '吸食敌血，伤处愈合' },
    ],
    loot: [
      { material: 'mat_yaoxue', chance: 0.5, amount: [1, 2] },
      { material: 'mat_shougu', chance: 0.4, amount: [2, 4] },
      { stones: { low: [70, 260] }, chance: 0.72 },
    ],
    desc: '饮血而生的妖狼，毛色暗红，越战越狂。',
  },
  {
    id: 'en_chimu_xiongwang', name: '赤目熊王', tier: 2, minRealm: 9, power: 300,
    base: { hp: 1700, atk: 95, def: 92, spd: 16, crit: 0.05 },
    skills: [
      { id: 'sk_chimu_zhang', name: '撼地掌', kind: 'damage', power: 1.5, desc: '巨掌落地，震得敌立足不稳' },
      { id: 'sk_chimu_nu', name: '怒吼', kind: 'buff', power: 0.18, desc: '熊王震怒，皮坚如铁' },
    ],
    loot: [
      { material: 'mat_yaoxue', chance: 0.5, amount: [1, 3] },
      { material: 'mat_shougu', chance: 0.5, amount: [2, 5] },
      { stones: { low: [80, 300] }, chance: 0.72 },
    ],
    desc: '双目赤红的熊类妖王，据山为王，寻常筑基修士不敢招惹。',
  },
  {
    id: 'en_caibu_xiexiu', name: '采补邪修', tier: 2, minRealm: 10, power: 270,
    base: { hp: 1150, atk: 125, def: 60, spd: 24, crit: 0.1 },
    skills: [
      { id: 'sk_caibu_zhua', name: '摄魂爪', kind: 'damage', power: 1.3, desc: '爪风带阴气，直取神魂' },
      { id: 'sk_caibu_bu', name: '采补', kind: 'drain', power: 0.9, desc: '掠夺生机，损人利己' },
      { id: 'sk_caibu_hun', name: '迷魂', kind: 'debuff', power: 0.22, desc: '乱人心神，令人法力涣散' },
    ],
    loot: [
      { material: 'mat_xueshen', chance: 0.45, amount: [1, 2] },
      { material: 'mat_lingzhi', chance: 0.4, amount: [2, 5] },
      { stones: { low: [90, 340] }, chance: 0.75 },
    ],
    desc: '走邪道的筑基修士，以采补之术速成，为正道所不容。',
  },
  {
    id: 'en_hanfei_toumu', name: '悍匪头目', tier: 2, minRealm: 10, power: 305,
    base: { hp: 1500, atk: 118, def: 85, spd: 20, crit: 0.08 },
    skills: [
      { id: 'sk_hanfei_fu', name: '开山斧', kind: 'damage', power: 1.55, desc: '一斧开山，力沉势猛' },
    ],
    loot: [
      { material: 'mat_xuantie', chance: 0.5, amount: [2, 4] },
      { material: 'mat_hanjing', chance: 0.25, amount: [1, 1] },
      { stones: { low: [120, 420] }, chance: 0.75 },
    ],
    desc: '盘踞要道的匪首，手下亡魂无数，一身煞气。',
  },
  {
    id: 'en_lingzhi_yao', name: '灵芝妖', tier: 2, minRealm: 11, power: 270,
    base: { hp: 1300, atk: 90, def: 105, spd: 18, crit: 0.05 },
    skills: [
      { id: 'sk_lingzhi_bian', name: '藤鞭', kind: 'damage', power: 1.25, desc: '根须化鞭，抽打如雨' },
      { id: 'sk_lingzhi_chun', name: '吐纳回春', kind: 'heal', power: 0.15, desc: '汲取地气，伤势自愈' },
    ],
    loot: [
      { material: 'mat_lingzhi', chance: 0.7, amount: [3, 6] },
      { material: 'mat_xueshen', chance: 0.4, amount: [1, 2] },
      { stones: { low: [80, 300] }, chance: 0.7 },
    ],
    desc: '千年灵芝得道成精，通体药香，却极厌恶被当作药材。',
  },

  // ==================================================================
  // tier 3 —— 妖将 / 邪修 / 宗门执法（金丹期）
  // ==================================================================
  {
    id: 'en_xunshan_yaojiang', name: '巡山妖将', tier: 3, minRealm: 12, power: 1560,
    base: { hp: 9500, atk: 520, def: 430, spd: 30, crit: 0.08 },
    skills: [
      { id: 'sk_yaojiang_zhan', name: '裂地斩', kind: 'damage', power: 1.5, desc: '长刀劈地，刀气纵横数丈' },
      { id: 'sk_yaojiang_hu', name: '妖气护体', kind: 'buff', power: 0.2, desc: '妖气凝甲，刀枪难入' },
    ],
    loot: [
      { material: 'mat_yaodan', chance: 0.35, amount: [1, 1] },
      { material: 'mat_yaoxue', chance: 0.6, amount: [2, 4] },
      { stones: { low: [320, 1200] }, chance: 0.75 },
    ],
    desc: '妖王麾下巡山将领，甲胄森然，号令群妖。',
  },
  {
    id: 'en_qiannian_yaowang', name: '千年妖王', tier: 3, minRealm: 12, power: 1750,
    base: {hp: 8000, atk: 620, def: 420, spd: 28, crit: 0.08},
    skills: [
      { id: 'sk_yaowang_nu', name: '妖王怒', kind: 'damage', power: 1.6, desc: '妖气冲霄，一击撼山' },
      { id: 'sk_yaowang_yu', name: '妖丹自愈', kind: 'heal', power: 0.2, desc: '妖丹运转，血肉重生' },
      { id: 'sk_yaowang_ya', name: '威压', kind: 'debuff', power: 0.25, desc: '妖王之威压得敌气机凝滞' },
    ],
    loot: [
      { material: 'mat_yaodan', chance: 0.5, amount: [1, 2] },
      { material: 'mat_yaoxue', chance: 0.6, amount: [3, 6] },
      { stones: { low: [400, 1600] }, chance: 0.78 },
    ],
    desc: '修行千年的老妖，盘踞一方，麾下妖众数以千计。',
  },
  {
    id: 'en_xuemo_xiexiu', name: '血魔邪修', tier: 3, minRealm: 13, power: 1950,
    base: { hp: 11000, atk: 800, def: 390, spd: 36, crit: 0.14 },
    skills: [
      { id: 'sk_xuemo_zhua', name: '血魔爪', kind: 'damage', power: 1.45, desc: '血光凝爪，中者气血逆流' },
      { id: 'sk_xuemo_shi', name: '噬血', kind: 'drain', power: 1.2, desc: '吞噬敌血，反哺自身' },
      { id: 'sk_xuemo_dun', name: '血遁', kind: 'buff', power: 0.25, desc: '化血为遁，身法骤快' },
    ],
    loot: [
      { material: 'mat_yaoxue', chance: 0.65, amount: [3, 6] },
      { material: 'mat_jiuyelian', chance: 0.35, amount: [1, 2] },
      { stones: { low: [450, 1800] }, chance: 0.78 },
    ],
    desc: '堕入血道的金丹修士，以活人精血修炼，凶名远播。',
  },
  {
    id: 'en_zongmen_zhifa', name: '宗门执法使', tier: 3, minRealm: 13, power: 1950,
    base: {hp: 9000, atk: 640, def: 460, spd: 33, crit: 0.08},
    skills: [
      { id: 'sk_zhifa_jian', name: '执法剑印', kind: 'damage', power: 1.5, desc: '剑印一出，如宗门律令加身' },
      { id: 'sk_zhifa_feng', name: '封灵印', kind: 'debuff', power: 0.3, desc: '封印灵力，令敌施法迟滞' },
    ],
    loot: [
      { material: 'mat_jiuyelian', chance: 0.4, amount: [1, 2] },
      { material: 'mat_chiyan', chance: 0.35, amount: [1, 2] },
      { stones: { low: [500, 2000] }, chance: 0.8 },
    ],
    desc: '大宗门培养的执法修士，剑法森严，铁面无私。',
  },
  {
    id: 'en_shihun_guijiang', name: '噬魂鬼将', tier: 3, minRealm: 14, power: 1800,
    base: { hp: 10500, atk: 620, def: 520, spd: 27, crit: 0.08 },
    skills: [
      { id: 'sk_guijiang_shi', name: '噬魂', kind: 'drain', power: 1.3, desc: '吞噬生魂，壮大鬼体' },
      { id: 'sk_guijiang_ku', name: '阴风哭嚎', kind: 'debuff', power: 0.24, desc: '鬼哭之声乱人心神，削减防御' },
      { id: 'sk_guijiang_zhua', name: '鬼爪', kind: 'damage', power: 1.35, desc: '阴气凝爪，直透护体' },
    ],
    loot: [
      { material: 'mat_yaodan', chance: 0.4, amount: [1, 2] },
      { material: 'mat_jiuyelian', chance: 0.3, amount: [1, 2] },
      { stones: { low: [420, 1700] }, chance: 0.75 },
    ],
    desc: '古战场怨气所化的鬼将，甲胄残破，双目空洞却锁魂。',
  },

  // ==================================================================
  // tier 4 —— 妖族尊者 / 魔道护法 / 上古剑灵（元婴期）
  // ==================================================================
  {
    id: 'en_moying_cike', name: '魔影刺客', tier: 4, minRealm: 15, power: 8100,
    base: { hp: 42000, atk: 3400, def: 2200, spd: 50, crit: 0.18 },
    skills: [
      { id: 'sk_moying_xi', name: '影袭', kind: 'damage', power: 1.7, desc: '自阴影中暴起，一击致命' },
      { id: 'sk_moying_ni', name: '隐匿', kind: 'buff', power: 0.25, desc: '身形隐没，下一击必中要害' },
    ],
    loot: [
      { material: 'mat_neidan', chance: 0.3, amount: [1, 1] },
      { material: 'mat_yaodan', chance: 0.5, amount: [2, 4] },
      { stones: { low: [1600, 7000] }, chance: 0.78 },
    ],
    desc: '魔道豢养的刺客，出手如影，从无活口。',
  },
  {
    id: 'en_yaozun', name: '妖族尊者', tier: 4, minRealm: 15, power: 14300,
    base: { hp: 95000, atk: 4300, def: 3900, spd: 44, crit: 0.12 },
    skills: [
      { id: 'sk_yaozun_ji', name: '妖尊击', kind: 'damage', power: 1.55, desc: '妖力凝于一点，破山裂岳' },
      { id: 'sk_yaozun_chun', name: '万妖回春', kind: 'heal', power: 0.18, desc: '聚万妖之气，伤势速愈' },
      { id: 'sk_yaozun_wei', name: '妖威', kind: 'buff', power: 0.22, desc: '妖尊威仪，攻守俱增' },
    ],
    loot: [
      { material: 'mat_neidan', chance: 0.4, amount: [1, 2] },
      { material: 'mat_longdanhua', chance: 0.35, amount: [1, 2] },
      { stones: { low: [2000, 9000] }, chance: 0.8 },
    ],
    desc: '妖族一方至尊，麾下大妖无数，一怒则山岳变色。',
  },
  {
    id: 'en_modao_hufa', name: '魔道护法', tier: 4, minRealm: 16, power: 12800,
    base: { hp: 72000, atk: 5000, def: 3300, spd: 46, crit: 0.15 },
    skills: [
      { id: 'sk_hufa_dao', name: '魔刀', kind: 'damage', power: 1.6, desc: '魔刀过处，生机尽断' },
      { id: 'sk_hufa_shi', name: '魔噬', kind: 'drain', power: 1.35, desc: '吞噬敌之精元，化为己用' },
      { id: 'sk_hufa_yin', name: '魔音', kind: 'debuff', power: 0.28, desc: '魔音入脑，令人神识昏乱' },
    ],
    loot: [
      { material: 'mat_neidan', chance: 0.38, amount: [1, 2] },
      { material: 'mat_yaodan', chance: 0.55, amount: [3, 6] },
      { stones: { low: [2200, 9500] }, chance: 0.8 },
    ],
    desc: '魔道巨擘座下护法，一身魔功深不可测，杀性极重。',
  },
  {
    id: 'en_shihun_laozu', name: '噬魂老祖', tier: 4, minRealm: 16, power: 13700,
    base: { hp: 85000, atk: 4200, def: 4400, spd: 42, crit: 0.1 },
    skills: [
      { id: 'sk_laozu_tun', name: '吞魂大法', kind: 'drain', power: 1.4, desc: '张口一吸，万千生魂入腹' },
      { id: 'sk_laozu_ji', name: '阴魂续命', kind: 'heal', power: 0.22, desc: '以阴魂为引，续命疗伤' },
    ],
    loot: [
      { material: 'mat_neidan', chance: 0.42, amount: [1, 2] },
      { material: 'mat_longdanhua', chance: 0.4, amount: [1, 2] },
      { stones: { low: [2400, 10000] }, chance: 0.8 },
    ],
    desc: '以吞噬生魂续命的老魔，形如枯木，眼中却有万魂沉浮。',
  },
  {
    id: 'en_shanggu_jianling', name: '上古剑灵', tier: 4, minRealm: 17, power: 12600,
    base: { hp: 60000, atk: 6000, def: 3000, spd: 54, crit: 0.2 },
    skills: [
      { id: 'sk_jianling_zhan', name: '剑灵一斩', kind: 'damage', power: 1.85, desc: '剑意化形，一斩断空' },
      { id: 'sk_jianling_yi', name: '剑意', kind: 'buff', power: 0.22, desc: '剑意冲霄，出手更快更准' },
    ],
    loot: [
      { material: 'mat_xingchen', chance: 0.3, amount: [1, 2] },
      { material: 'mat_neidan', chance: 0.4, amount: [1, 2] },
      { stones: { low: [2600, 11000] }, chance: 0.8 },
    ],
    desc: '上古剑修残剑中生出的剑灵，不知年月，只知斩敌。',
  },

  // ==================================================================
  // tier 5 —— 上古凶兽 / 魔道巨擘 / 天外异种（化神以上）
  // ==================================================================
  {
    id: 'en_taotie', name: '上古凶兽·饕餮', tier: 5, minRealm: 18, power: 56200,
    base: { hp: 280000, atk: 16000, def: 13000, spd: 58, crit: 0.15 },
    skills: [
      { id: 'sk_taotie_tun', name: '吞天噬地', kind: 'damage', power: 1.7, desc: '巨口一张，连山岳也吞得下' },
      { id: 'sk_taotie_shi', name: '吞噬', kind: 'drain', power: 1.3, desc: '吞敌入腹，化其力为己力' },
    ],
    loot: [
      { material: 'mat_longlin', chance: 0.3, amount: [1, 2] },
      { material: 'mat_neidan', chance: 0.5, amount: [2, 4] },
      { stones: { low: [8000, 40000] }, chance: 0.82 },
    ],
    desc: '四凶之一，贪食无餍。所过之处，草木尽绝。',
  },
  {
    id: 'en_xuehe_laozu', name: '魔道巨擘·血河老祖', tier: 5, minRealm: 19, power: 72400,
    base: { hp: 360000, atk: 24000, def: 16000, spd: 64, crit: 0.18 },
    skills: [
      { id: 'sk_xuehe_tao', name: '血河滔天', kind: 'drain', power: 1.5, desc: '血河倒卷，所触皆枯' },
      { id: 'sk_xuehe_sheng', name: '血海重生', kind: 'heal', power: 0.25, desc: '血海不干，我身不灭' },
      { id: 'sk_xuehe_zhou', name: '血咒', kind: 'debuff', power: 0.3, desc: '血咒缠身，气血难聚' },
    ],
    loot: [
      { material: 'mat_longlin', chance: 0.35, amount: [1, 2] },
      { material: 'mat_hundun', chance: 0.12, amount: [1, 1] },
      { stones: { low: [10000, 50000] }, chance: 0.82 },
    ],
    desc: '魔道千年巨擘，以血河功法横行，血河不干，其魂不灭。',
  },
  {
    id: 'en_shixing_shou', name: '天外异种·蚀星兽', tier: 5, minRealm: 20, power: 83200,
    base: { hp: 500000, atk: 30000, def: 22000, spd: 70, crit: 0.2 },
    skills: [
      { id: 'sk_shixing_xi', name: '蚀星吐息', kind: 'damage', power: 1.8, desc: '一口吐息，星辰亦被蚀去一角' },
      { id: 'sk_shixing_qin', name: '虚空侵蚀', kind: 'debuff', power: 0.32, desc: '虚空之力侵蚀护体，防御大减' },
    ],
    loot: [
      { material: 'mat_hundun', chance: 0.15, amount: [1, 1] },
      { material: 'mat_longlin', chance: 0.4, amount: [1, 2] },
      { stones: { low: [12000, 60000] }, chance: 0.82 },
    ],
    desc: '自天外降临的异种，形如巨虫，背生星纹，以星辰为食。',
  },
  {
    id: 'en_zulong_canhun', name: '祖龙残魂', tier: 5, minRealm: 21, power: 107200,
    base: { hp: 600000, atk: 40000, def: 32000, spd: 76, crit: 0.22 },
    skills: [
      { id: 'sk_zulong_nu', name: '祖龙怒', kind: 'damage', power: 1.9, desc: '一声龙吟，万灵俯首，威不可挡' },
      { id: 'sk_zulong_wei', name: '龙威', kind: 'buff', power: 0.25, desc: '真龙之威，攻守皆增' },
      { id: 'sk_zulong_ju', name: '残魂聚形', kind: 'heal', power: 0.15, desc: '魂力凝聚，残躯复整' },
    ],
    loot: [
      { material: 'mat_longlin', chance: 0.5, amount: [2, 3] },
      { material: 'mat_hundun', chance: 0.18, amount: [1, 2] },
      { stones: { low: [18000, 80000] }, chance: 0.85 },
    ],
    desc: '上古祖龙陨落后残留的一缕龙魂，虽只残念，仍足以镇杀化神。',
  },
  {
    id: 'en_luohou_cannian', name: '万魔之祖·罗睺残念', tier: 5, minRealm: 23, power: 128900,
    base: { hp: 700000, atk: 50000, def: 38000, spd: 80, crit: 0.25 },
    skills: [
      { id: 'sk_luohou_mie', name: '灭世魔威', kind: 'damage', power: 2.0, desc: '魔威所至，天地失色' },
      { id: 'sk_luohou_shi', name: '万魔噬心', kind: 'drain', power: 1.6, desc: '万魔齐噬，夺其心神精元' },
      { id: 'sk_luohou_bu', name: '魔祖不灭', kind: 'heal', power: 0.2, desc: '魔念不灭，残念亦可重生' },
    ],
    loot: [
      { material: 'mat_hundun', chance: 0.3, amount: [1, 3] },
      { material: 'mat_taisuizhi', chance: 0.4, amount: [1, 2] },
      { stones: { low: [30000, 150000] }, chance: 0.88 },
    ],
    desc: '万魔之祖罗睺的一缕残念，藏于九幽深处，欲借渡劫者之身重临世间。',
  },
];

export function enemyById(id) {
  return ENEMIES.find((e) => e.id === id) || null;
}

/**
 * 返回适合该境界的敌人：minRealm <= realmIndex 的敌人中，
 * 取 minRealm 最接近的最近三档（不足三档则全取）。
 */
export function enemiesByRealm(realmIndex) {
  const pool = ENEMIES.filter((e) => e.minRealm <= realmIndex);
  if (pool.length === 0) return [];
  const bands = [...new Set(pool.map((e) => e.minRealm))].sort((a, b) => b - a).slice(0, 3);
  const bandSet = new Set(bands);
  return ENEMIES.filter((e) => e.minRealm <= realmIndex && bandSet.has(e.minRealm));
}
