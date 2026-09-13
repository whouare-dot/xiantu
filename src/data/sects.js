/**
 * 宗门数据表（V3.0「问宗」）。
 *
 * 纯数据，无逻辑。三个宗门各对应一条功法流派（见 data/techniques.js 的 PATHS）：
 *   tianjian 天剑宗 · sword 剑修 · 攻击与暴击
 *   baicao   百草谷 · law   丹道 · 炼丹与悟性
 *   panyue   磐岳宗 · body  体修 · 气血与防御
 *
 * 宝库里的 ref 一律是项目里真实存在的 id（丹药/材料/装备/丹方图纸/功法/灵兽）。
 * 灵兽蛋的 ref 用 data/beasts.js 的 id（bst_ 前缀），tools/test_sect.mjs 会逐条校验，
 * 因为这里曾经写过 beast_liehuo / beast_bixi 两个不存在的 id —— 兑换扣了贡献，
 * 孵化时却查不到物种，蛋静默消失。改 ref 请顺手跑一遍 test_sect.mjs。
 */

// ==================== 宗门 ====================

export const SECTS = [
  {
    id: 'tianjian',
    name: '天剑宗',
    path: 'sword',
    stance: 'zhengdao',
    color: '#b22222',
    desc_short: '以剑入道，攻伐无双',
    desc: '北境第一剑宗，只问剑心，不问出身。弟子出剑便是杀伐，不留余地。',
    lore: '天剑宗立于北境天剑峰，峰顶一柄上古断剑插云三千年，剑气日夜冲刷山门。'
      + '宗门规矩只有一条：剑在，人在。入门弟子先断俗缘，再以心血养剑；'
      + '剑修一途最是孤绝，出剑越快者，退路越少。',
    // 加入后的常驻加成（sectBonus() 会把它交给 cultivation.js 汇总）
    bonus: { atkPct: 0.12, critAdd: 0.05 },
    // 专属资源简述（UI 展示用）
    special: '剑修功法、攻击向法宝',
  },
  {
    id: 'baicao',
    name: '百草谷',
    path: 'law',
    stance: 'zhengdao',
    color: '#2d6b4f',
    desc_short: '百草济世，丹心问道',
    desc: '南疆丹道圣地，一炉丹药可活一人，一部丹经可活一世。弟子多通药理、善悬壶。',
    lore: '百草谷藏于南疆瘴林最深处，谷中四时草木不凋，传闻是上古药神陨落之地。'
      + '谷中以丹入道，弟子常年在药圃与丹炉之间往返；谷主一脉信奉——'
      + '杀一人易，救一人难，能救人的道才是长久的道。',
    bonus: { alchemyPct: 0.15, comprehensionAdd: 8 },
    special: '稀有丹方、灵草药材',
  },
  {
    id: 'panyue',
    name: '磐岳宗',
    path: 'body',
    stance: 'zhengdao',
    color: '#8b6b3d',
    desc_short: '炼体如山，不坏不摧',
    desc: '西陲体修宗门，以肉身扛天雷。血厚耐战，越是绝境越见真章。',
    lore: '磐岳宗踞守西陲磐岳，山门之前有九万级石阶，入门弟子须负千斤石登顶方可拜师。'
      + '宗门不修法术、不炼飞剑，只炼皮、骨、血、髓四重肉身。'
      + '磐岳之人常说：天塌下来，有个高的顶着——说的就是我们。',
    bonus: { hpPct: 0.15, defPct: 0.12 },
    special: '体修功法、防御向法宝',
  },
];

// ==================== 职位 ====================

/**
 * 职位阶梯。needContribution 是晋升到本级所需的累计贡献。
 * vaultTier 解锁宝库层数，buildingSlots 是可同时拥有的宗门建筑数量（升级不占新位）。
 */
export const SECT_RANKS = [
  { rank: 0, name: '外门弟子', needContribution: 0, salary: { stones: 500 }, vaultTier: 1, buildingSlots: 2 },
  { rank: 1, name: '内门弟子', needContribution: 300, salary: { stones: 2000 }, vaultTier: 2, buildingSlots: 3 },
  { rank: 2, name: '真传弟子', needContribution: 1200, salary: { stones: 8000 }, vaultTier: 3, buildingSlots: 4 },
  { rank: 3, name: '长老', needContribution: 4000, salary: { stones: 30000 }, vaultTier: 4, buildingSlots: 5 },
  { rank: 4, name: '宗主', needContribution: 12000, salary: { stones: 120000 }, vaultTier: 5, buildingSlots: 5 },
];

/**
 * 每日俸禄里的稀有材料（按职位）。
 * SECT_RANKS.salary 只放灵石，材料单独一张小表，避免污染给定的 salary 形状。
 */
export const RANK_SALARY_MATERIALS = [
  [{ id: 'mat_lingzhi', count: 5 }],
  [{ id: 'mat_ziyulan', count: 8 }, { id: 'mat_xueshen', count: 6 }],
  [{ id: 'mat_jiuyelian', count: 6 }, { id: 'mat_yaodan', count: 4 }],
  [{ id: 'mat_longdanhua', count: 4 }, { id: 'mat_neidan', count: 3 }],
  [{ id: 'mat_taisuizhi', count: 3 }, { id: 'mat_hundun', count: 2 }],
];

// ==================== 宗门建筑 ====================

/**
 * 独立于个人洞府的第二套建筑体系。
 * 升级消耗宗门灵石、占用现实时间（绝对时间戳，离线照常推进）。
 * effect.kind 语义：
 *   war_power   每级 +15% 宗门战战力
 *   alchemy     每级 +12% 炼丹成功率/产量
 *   cultivate   每级 +10% 功法参悟速度
 *   beast       每级 +12% 灵兽养成速度
 *   war_defense 每级 +12% 宗门战防御（减免战败贡献损失）
 */
export const SECT_BUILDINGS = [
  {
    id: 'bld_arena', name: '演武场', maxLevel: 9,
    effect: { kind: 'war_power', perLevel: 0.15 },
    cost: { base: 800, growth: 2.3 }, seconds: { base: 180, growth: 1.8 },
    desc: '弟子日夜切磋之地，宗门战出阵顺序与士气皆由此定。',
    reqRank: 0,
  },
  {
    id: 'bld_pagoda', name: '丹塔', maxLevel: 9,
    effect: { kind: 'alchemy', perLevel: 0.12 },
    cost: { base: 900, growth: 2.35 }, seconds: { base: 240, growth: 1.85 },
    desc: '九层丹塔，地火自塔底引上，越高一层丹火越纯。',
    reqRank: 0,
  },
  {
    id: 'bld_pavilion', name: '藏剑阁', maxLevel: 9,
    effect: { kind: 'cultivate', perLevel: 0.10 },
    cost: { base: 1200, growth: 2.4 }, seconds: { base: 300, growth: 1.9 },
    desc: '万卷剑经藏于阁中，参悟功法时事半功倍。',
    reqRank: 1,
  },
  {
    id: 'bld_beastgarden', name: '灵兽园', maxLevel: 9,
    effect: { kind: 'beast', perLevel: 0.12 },
    cost: { base: 1500, growth: 2.45 }, seconds: { base: 360, growth: 1.95 },
    desc: '圈养灵兽、培育兽卵之地，灵气充沛，灵兽成长更快。',
    reqRank: 2,
  },
  {
    id: 'bld_ward', name: '护宗大阵', maxLevel: 9,
    effect: { kind: 'war_defense', perLevel: 0.12 },
    cost: { base: 1350, growth: 2.4 }, seconds: { base: 330, growth: 1.9 },
    desc: '以山门地脉为阵眼，宗门战败时能护住根基，少损贡献。',
    reqRank: 1,
  },
];

// ==================== 宝库 ====================

/**
 * 宗门宝库。按 tier 分层解锁（tier <= 当前职位 vaultTier 才可见/可换）。
 *
 * ⚠ 贡献是稀缺资源：宝库一层的空价（3150）远高于一天正常玩法的贡献产出（上限约 333）。
 *    具体核算见 systems/sect.js 顶部注释。
 *
 * kind 语义：
 *   pill 丹药（amount 个） / material 灵材（amount 份） / stones 灵石（amount 下品）
 *   equip 装备（ref 为装备 id） / recipe 丹方或图纸（ref 为 rc_/fr_ id）
 *   beast_egg 灵兽蛋（ref 为 data/beasts.js 的 id） / technique 功法 / title 称号
 * sect 字段可省略；写了则仅该宗门可见（宗门专属货）。
 */
export const SECT_VAULT = [
  // ---------- tier 1：低阶丹药与材料（外门弟子） ----------
  { id: 'sv_juqi', name: '聚气丹 ×10', tier: 1, cost: 400, kind: 'pill', ref: 'pill_juqi', amount: 10, desc: '最寻常的聚气之物，胜在量大。' },
  { id: 'sv_huiqi', name: '回气丹 ×10', tier: 1, cost: 450, kind: 'pill', ref: 'pill_huiqi', amount: 10, desc: '斗法后回气养元，宗门弟子人手一瓶。' },
  { id: 'sv_lingzhi', name: '灵芝草 ×50', tier: 1, cost: 500, kind: 'material', ref: 'mat_lingzhi', amount: 50, desc: '药圃常备，凝气之基。' },
  { id: 'sv_shougu', name: '兽骨 ×40', tier: 1, cost: 520, kind: 'material', ref: 'mat_shougu', amount: 40, desc: '猎场收拾的妖兽残骨，磨粉入药皆可。' },
  { id: 'sv_liaoshang', name: '疗伤丹 ×5', tier: 1, cost: 600, kind: 'pill', ref: 'pill_liaoshang', amount: 5, desc: '止血生肌，行走在外必备。' },
  { id: 'sv_stones', name: '下品灵石 ×3000', tier: 1, cost: 680, kind: 'stones', ref: null, amount: 3000, desc: '宗门月例折算，换成随身花用的灵石。' },

  // ---------- tier 2：中阶丹药、灵材与灵兽蛋（内门弟子） ----------
  { id: 'sv_ningqi', name: '凝气丹 ×5', tier: 2, cost: 900, kind: 'pill', ref: 'pill_ningqi', amount: 5, desc: '凝练灵气，突破前服用可稳气机。' },
  { id: 'sv_jingxin', name: '静心丹 ×5', tier: 2, cost: 850, kind: 'pill', ref: 'pill_jingxin', amount: 5, desc: '定魄安神，渡劫前静心之选。' },
  { id: 'sv_xueshen', name: '血参 ×30', tier: 2, cost: 950, kind: 'material', ref: 'mat_xueshen', amount: 30, desc: '生于阴湿崖壁，补气血。' },
  { id: 'sv_ziyulan', name: '紫玉兰 ×30', tier: 2, cost: 1000, kind: 'material', ref: 'mat_ziyulan', amount: 30, desc: '花瓣泛紫玉之光，安神定魄。' },
  { id: 'sv_xuantie', name: '玄铁矿 ×40', tier: 2, cost: 900, kind: 'material', ref: 'mat_xuantie', amount: 40, desc: '凡兵之骨，重而坚。' },
  { id: 'sv_zhuji', name: '筑基丹 ×3', tier: 2, cost: 1600, kind: 'pill', ref: 'pill_zhuji', amount: 3, desc: '筑基关口的敲门砖，外门难得一见。' },
  // 修为丹不上坊市（见 data/pills.js 顶部），宗门是它们的主要来源之一
  { id: 'sv_yunling', name: '蕴灵丹 ×5', tier: 2, cost: 1800, kind: 'pill', ref: 'pill_yunling', amount: 5, desc: '药力蕴于经脉三日不散，闭关前服之最宜。' },
  // 灵兽蛋只出**进化链的链首**（赤炎狐 / 玄水龟），高阶形态仍要靠自己养。
  // 星级在破壳时重掷，所以反复买蛋 = 刷一只高资质的链首，这是它的价值所在。
  { id: 'sv_egg_chiyanhu', name: '赤炎狐蛋', tier: 2, cost: 900, kind: 'beast_egg', ref: 'bst_chiyanhu', amount: 1, desc: '狐火一脉的兽卵，破壳即是一头赤瞳小狐。' },
  { id: 'sv_egg_xuanshuigui', name: '玄水龟蛋', tier: 2, cost: 900, kind: 'beast_egg', ref: 'bst_xuanshuigui', amount: 1, desc: '玄水一脉的兽卵，壳上已有浅浅的玄纹。' },

  // ---------- tier 3：丹方图纸与灵材（真传弟子） ----------
  { id: 'sv_rc_jingxin', name: '静心丹丹方', tier: 3, cost: 1800, kind: 'recipe', ref: 'rc_jingxin', amount: 1, desc: '铭刻丹方，此后可自行炼制静心丹。' },
  { id: 'sv_rc_zhuji', name: '筑基丹丹方', tier: 3, cost: 2200, kind: 'recipe', ref: 'rc_zhuji', amount: 1, desc: '筑基丹方，宗门不外传之秘。' },
  { id: 'sv_rc_xisui', name: '洗髓丹丹方', tier: 3, cost: 2400, kind: 'recipe', ref: 'rc_xisui', amount: 1, desc: '洗髓伐骨，脱胎换骨之方。' },
  { id: 'sv_hanjing_bead', name: '寒晶珠', tier: 3, cost: 2800, kind: 'equip', ref: 'eq_hanjing_bead', amount: 1, desc: '触手生寒，内蕴阴气，护身法宝。' },
  { id: 'sv_jiuyelian', name: '九叶莲 ×20', tier: 3, cost: 2200, kind: 'material', ref: 'mat_jiuyelian', amount: 20, desc: '九叶环生，一叶一岁，通经脉。' },
  { id: 'sv_zifu', name: '紫府丹 ×3', tier: 3, cost: 4500, kind: 'pill', ref: 'pill_zifu', amount: 3, desc: '紫府乃元神所居，此丹专养一处。真传弟子方可得。' },

  // ---------- tier 4：高阶丹方与功法（长老） ----------
  { id: 'sv_rc_jiejin', name: '结金丹丹方', tier: 4, cost: 5000, kind: 'recipe', ref: 'rc_jiejin', amount: 1, desc: '金丹大道之方，参悟极难。' },
  { id: 'sv_rc_ningying', name: '凝婴丹丹方', tier: 4, cost: 9000, kind: 'recipe', ref: 'rc_ningying', amount: 1, desc: '元婴之基，宗门镇派丹方之一。' },
  { id: 'sv_guben', name: '固本丹 ×3', tier: 4, cost: 4200, kind: 'pill', ref: 'pill_guben', amount: 3, desc: '固本培元，突破失败亦不伤根本。' },
  { id: 'sv_xuming', name: '续命丹 ×2', tier: 4, cost: 6000, kind: 'pill', ref: 'pill_xuming', amount: 2, desc: '续命一线，寿元将尽者的最后倚仗。' },
  { id: 'sv_zaohua', name: '造化丹 ×2', tier: 4, cost: 14000, kind: 'pill', ref: 'pill_zaohua', amount: 2, desc: '夺天地造化入炉。长老配额有限，非大功不赏。' },
  { id: 'sv_yinyang', name: '阴阳镜', tier: 4, cost: 6400, kind: 'equip', ref: 'eq_yinyang_mirror', amount: 1, desc: '阴阳二气流转，攻守兼备之宝。' },
  { id: 'sv_tech_wanjian', name: '万剑归宗', tier: 4, cost: 8000, kind: 'technique', ref: 'tech_wanjian', amount: 1, desc: '天剑宗不传之剑典，万剑齐发。', sect: 'tianjian' },
  { id: 'sv_tech_bumie', name: '不灭金身', tier: 4, cost: 8000, kind: 'technique', ref: 'tech_bumie', amount: 1, desc: '磐岳宗护体神功，金刚不坏。', sect: 'panyue' },
  { id: 'sv_tech_jiuzhuan', name: '九转金丹诀', tier: 4, cost: 8000, kind: 'technique', ref: 'tech_jiuzhuan', amount: 1, desc: '百草谷丹道心法，九转还丹。', sect: 'baicao' },

  // ---------- tier 5：宗门镇派之宝（宗主） ----------
  { id: 'sv_tech_zhuxian', name: '诛仙剑典', tier: 5, cost: 26000, kind: 'technique', ref: 'tech_zhuxian', amount: 1, desc: '天剑宗镇派剑典，一剑可诛仙。', sect: 'tianjian' },
  { id: 'sv_tech_hundun', name: '混沌战体', tier: 5, cost: 26000, kind: 'technique', ref: 'tech_hundun', amount: 1, desc: '磐岳宗至高体修功法，肉身成圣。', sect: 'panyue' },
  { id: 'sv_tech_wuji', name: '混沌无极功', tier: 5, cost: 26000, kind: 'technique', ref: 'tech_wuji', amount: 1, desc: '百草谷不传之秘，药石与道法同源。', sect: 'baicao' },
  { id: 'sv_zhuxian_sword', name: '诛仙古剑', tier: 5, cost: 30000, kind: 'equip', ref: 'eq_zhuxian_sword', amount: 1, desc: '神品古剑，剑身有诛仙二字，饮血三千年。', sect: 'tianjian' },
  { id: 'sv_hundun_armor', name: '混沌战体铠', tier: 5, cost: 30000, kind: 'equip', ref: 'eq_hundun_armor', amount: 1, desc: '混沌淬炼的战铠，刀枪不入。', sect: 'panyue' },
  { id: 'sv_dayan', name: '大衍丹', tier: 5, cost: 32000, kind: 'pill', ref: 'pill_dayan', amount: 1, desc: '大衍之数五十，其用四十有九。镇派之丹，非宗主不得动用。' },
  { id: 'sv_taichu_seal', name: '太初道印', tier: 5, cost: 32000, kind: 'equip', ref: 'eq_taichu_seal', amount: 1, desc: '太初之气凝成的道印，镇压一方法域。', sect: 'baicao' },
  { id: 'sv_title_sword', name: '称号「剑冢问主」', tier: 5, cost: 40000, kind: 'title', ref: 'title_sect_sword', amount: 1, desc: '宗门战功赫赫者方可问鼎剑冢，全宗敬仰。', sect: 'tianjian' },
  { id: 'sv_title_herb', name: '称号「丹心妙手」', tier: 5, cost: 40000, kind: 'title', ref: 'title_sect_herb', amount: 1, desc: '丹心照人，妙手回春，百草谷至高荣衔。', sect: 'baicao' },
  { id: 'sv_title_rock', name: '称号「磐岳尊者」', tier: 5, cost: 40000, kind: 'title', ref: 'title_sect_rock', amount: 1, desc: '一拳碎山，一掌断流，磐岳宗至高荣衔。', sect: 'panyue' },
];

// ==================== 宗门任务 ====================

/**
 * 宗门任务。每日从池中轮换 5 条（见 systems/sect.js dailyQuests）。
 * kind：donate_material 捐材料 / donate_pill 交丹药 / trial_battle 打试炼。
 * 试炼的 target 是 data/enemies.js 的敌人 id，finishQuest 按战力判定成败。
 *
 * 贡献产出刻意压低：5 条中最高组合仅 290，撑不起宝库一层的 3150。
 */
export const SECT_QUESTS = [
  { id: 'sq_lingzhi', name: '药圃杂役', desc: '宗门药圃缺人打理，采些灵芝草来。', kind: 'donate_material', target: 'mat_lingzhi', need: 20, contribution: 25 },
  { id: 'sq_shougu', name: '猎场收骨', desc: '猎场清扫，收拢妖兽残骨入药库。', kind: 'donate_material', target: 'mat_shougu', need: 15, contribution: 25 },
  { id: 'sq_xuantie', name: '矿脉轮值', desc: '山门矿脉需玄铁矿修缮剑炉。', kind: 'donate_material', target: 'mat_xuantie', need: 15, contribution: 30 },
  { id: 'sq_xueshen', name: '采参崖行', desc: '阴湿崖壁产血参，去采些回来。', kind: 'donate_material', target: 'mat_xueshen', need: 10, contribution: 35 },
  { id: 'sq_ziyulan', name: '兰圃供奉', desc: '长老闭关需紫玉兰安神。', kind: 'donate_material', target: 'mat_ziyulan', need: 10, contribution: 35 },
  { id: 'sq_jiuyelian', name: '莲池秘藏', desc: '秘境九叶莲成熟，宗门急缺。', kind: 'donate_material', target: 'mat_jiuyelian', need: 8, contribution: 55 },
  { id: 'sq_yaodan', name: '妖丹上缴', desc: '丹塔炼制需妖丹为引，猎妖取丹。', kind: 'donate_material', target: 'mat_yaodan', need: 5, contribution: 60 },

  { id: 'sq_pill_juqi', name: '丹药代炼', desc: '外门弟子功课，交十枚聚气丹。', kind: 'donate_pill', target: 'pill_juqi', need: 10, contribution: 30 },
  { id: 'sq_pill_huiqi', name: '行囊补给', desc: '为巡山弟子备些回气丹。', kind: 'donate_pill', target: 'pill_huiqi', need: 8, contribution: 30 },
  { id: 'sq_pill_liaoshang', name: '伤药征集', desc: '猎场多有损伤，交五枚疗伤丹。', kind: 'donate_pill', target: 'pill_liaoshang', need: 5, contribution: 40 },
  { id: 'sq_pill_jingxin', name: '静心供奉', desc: '长老渡劫前需静心丹三枚。', kind: 'donate_pill', target: 'pill_jingxin', need: 3, contribution: 50 },
  { id: 'sq_pill_ningqi', name: '凝气献纳', desc: '宗门大比将近，交凝气丹两枚。', kind: 'donate_pill', target: 'pill_ningqi', need: 2, contribution: 60 },

  { id: 'sq_trial_boar', name: '后山试炼', desc: '清剿后山作乱的山林野猪。', kind: 'trial_battle', target: 'en_yezhu', need: 1, contribution: 35 },
  { id: 'sq_trial_wolf', name: '血妖巡猎', desc: '宗门禁地外有血妖狼出没，前往猎杀。', kind: 'trial_battle', target: 'en_xueyaolang', need: 1, contribution: 55 },
  { id: 'sq_trial_bearking', name: '熊王讨伐', desc: '赤目熊王盘踞山道，长老命你讨之。', kind: 'trial_battle', target: 'en_chimu_xiongwang', need: 1, contribution: 60 },
];

// ==================== 查询函数 ====================

export function sectById(id) {
  return SECTS.find((s) => s.id === id) || null;
}

export function rankOf(rank) {
  const i = Math.max(0, Math.min(SECT_RANKS.length - 1, Math.floor(rank || 0)));
  return SECT_RANKS[i];
}

export function vaultByTier(tier) {
  return SECT_VAULT.filter((v) => v.tier === tier);
}

export function vaultById(id) {
  return SECT_VAULT.find((v) => v.id === id) || null;
}

export function sectBuildingById(id) {
  return SECT_BUILDINGS.find((b) => b.id === id) || null;
}

export function sectQuestById(id) {
  return SECT_QUESTS.find((q) => q.id === id) || null;
}

/** 某层宝库换空的贡献总价（供配平与自测用） */
export function vaultTierCost(tier) {
  return vaultByTier(tier).reduce((a, b) => a + (b.cost || 0), 0);
}
