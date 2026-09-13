/**
 * 丹方与图纸。
 *
 * ALCHEMY_RECIPES：每种丹药一条丹方，pill 字段引用 pills.js 的真实 id。
 * FORGE_RECIPES  ：炼器图纸，equip 字段引用 equipments.js 的真实 id。
 *
 * 字段约定：
 *   minRealm     解锁所需最低境界索引
 *   unlockCost   领悟丹方 / 图纸的灵石花费（下品灵石）
 *   materials    材料消耗，id 引用 materials.js 白名单
 *   seconds      基础炼制 / 锻造耗时（秒），受丹房 / 炼器室速度加成缩减
 *   baseSuccess  基础成功率 0.5~0.9，随品阶升高而降低
 *   minQuality   炼器图纸保底品阶（成品品阶下限）
 */

// ======================================================================
// 丹方 —— 覆盖 pills.js 全部 21 种丹药
//
// ⚠ unlockCost（参悟费）统一锚定为**该丹方产物的坊市价**：
//   参悟一次 ≈ 买一颗成品。玩家面对的选择因此是干净的——
//   要么花一颗丹的钱永久掌握它，要么买一颗用完即止。
//   旧版这些数字是手写的，与丹价脱钩到离谱：渡劫丹丹方 500 万，而丹价只有 30 万。
//   改 pills.js 的价格时，请同步改这里的 unlockCost。
// ======================================================================
export const ALCHEMY_RECIPES = [
  {
    id: 'rc_juqi', pill: 'pill_juqi', name: '聚气丹丹方', minRealm: 0, unlockCost: 75,
    materials: [{ id: 'mat_lingzhi', count: 2 }],
    seconds: 20, baseSuccess: 0.9,
    desc: '以灵芝草温火慢炼，去其苦味，凝气成丹。最基础的丹方。',
  },
  {
    id: 'rc_huiqi', pill: 'pill_huiqi', name: '回气丹丹方', minRealm: 0, unlockCost: 110,
    materials: [{ id: 'mat_lingzhi', count: 3 }],
    seconds: 20, baseSuccess: 0.9,
    desc: '灵芝草配清泉，炼成回气之丹。行走在外，必备之物。',
  },
  {
    id: 'rc_liaoshang', pill: 'pill_liaoshang', name: '疗伤丹丹方', minRealm: 0, unlockCost: 230,
    materials: [{ id: 'mat_lingzhi', count: 2 }, { id: 'mat_xueshen', count: 1 }],
    seconds: 40, baseSuccess: 0.85,
    desc: '灵芝为底，血参为引。止血生肌，外伤立愈。',
  },
  {
    id: 'rc_jingxin', pill: 'pill_jingxin', name: '静心丹丹方', minRealm: 3, unlockCost: 490,
    materials: [{ id: 'mat_ziyulan', count: 2 }, { id: 'mat_lingzhi', count: 2 }],
    seconds: 60, baseSuccess: 0.82,
    desc: '紫玉兰安神定魄，佐以灵芝。冲关之前服之，可免走火。',
  },
  {
    id: 'rc_ningqi', pill: 'pill_ningqi', name: '凝气丹丹方', minRealm: 4, unlockCost: 530,
    materials: [{ id: 'mat_xueshen', count: 2 }, { id: 'mat_ziyulan', count: 1 }],
    seconds: 60, baseSuccess: 0.8,
    desc: '血参补气，紫玉兰敛神。丹成后灵气一日不散。',
  },
  {
    id: 'rc_yunling', pill: 'pill_yunling', name: '蕴灵丹丹方', minRealm: 4, unlockCost: 820,
    materials: [
      { id: 'mat_xueshen', count: 2 },
      { id: 'mat_ziyulan', count: 2 },
      { id: 'mat_lingzhi', count: 2 },
    ],
    seconds: 90, baseSuccess: 0.8,
    desc: '血参为骨，紫玉兰为衣，灵芝为引。药力蕴于经脉，三日不散。',
  },
  {
    id: 'rc_xisui', pill: 'pill_xisui', name: '洗髓丹丹方', minRealm: 5, unlockCost: 1300,
    materials: [
      { id: 'mat_xueshen', count: 3 },
      { id: 'mat_ziyulan', count: 2 },
      { id: 'mat_yaoxue', count: 1 },
    ],
    seconds: 120, baseSuccess: 0.7,
    desc: '以妖血为引，洗经伐髓。成丹不易，重塑灵根更看天命。',
  },
  {
    id: 'rc_tianji', pill: 'pill_tianji', name: '天机丹丹方', minRealm: 6, unlockCost: 1600,
    materials: [{ id: 'mat_jiuyelian', count: 1 }, { id: 'mat_ziyulan', count: 3 }],
    seconds: 150, baseSuccess: 0.68,
    desc: '九叶莲通经脉，紫玉兰定神魂。服之窥一线天机，气运加身。',
  },
  {
    id: 'rc_zhuji', pill: 'pill_zhuji', name: '筑基丹丹方', minRealm: 6, unlockCost: 730,
    materials: [
      { id: 'mat_lingzhi', count: 5 },
      { id: 'mat_xueshen', count: 2 },
      { id: 'mat_shougu', count: 3 },
    ],
    seconds: 180, baseSuccess: 0.75,
    desc: '凡品药材三味，熬炼百日方成一炉。无此丹者，筑基九死一生。',
  },
  {
    id: 'rc_guben', pill: 'pill_guben', name: '固本丹丹方', minRealm: 9, unlockCost: 3300,
    materials: [{ id: 'mat_jiuyelian', count: 2 }, { id: 'mat_yaodan', count: 1 }],
    seconds: 240, baseSuccess: 0.66,
    desc: '九叶莲固本，妖丹培元。道心愈坚，魔念难侵。',
  },
  {
    id: 'rc_zifu', pill: 'pill_zifu', name: '紫府丹丹方', minRealm: 9, unlockCost: 3800,
    materials: [
      { id: 'mat_jiuyelian', count: 2 },
      { id: 'mat_yaodan', count: 1 },
      { id: 'mat_ziyulan', count: 3 },
    ],
    seconds: 240, baseSuccess: 0.7,
    desc: '九叶莲通脉，妖丹聚气。紫府乃元神所居，此丹专养一处。',
  },
  {
    id: 'rc_jiejin', pill: 'pill_jiejin', name: '结金丹丹方', minRealm: 10, unlockCost: 7100,
    materials: [
      { id: 'mat_jiuyelian', count: 3 },
      { id: 'mat_chiyan', count: 2 },
      { id: 'mat_yaodan', count: 1 },
    ],
    seconds: 360, baseSuccess: 0.6,
    desc: '赤炎铜为丹炉内胆，妖丹为药引。凝气成液，液结成丹，尽在此丹。',
  },
  {
    id: 'rc_xuming', pill: 'pill_xuming', name: '续命丹丹方', minRealm: 12, unlockCost: 8200,
    materials: [
      { id: 'mat_jiuyelian', count: 4 },
      { id: 'mat_yaodan', count: 2 },
      { id: 'mat_xueshen', count: 3 },
    ],
    seconds: 420, baseSuccess: 0.58,
    desc: '九叶莲为君，妖丹为臣。夺天地造化，续命一纪，药力有限。',
  },
  {
    id: 'rc_ningying', pill: 'pill_ningying', name: '凝婴丹丹方', minRealm: 13, unlockCost: 14000,
    materials: [
      { id: 'mat_longdanhua', count: 2 },
      { id: 'mat_yaodan', count: 2 },
      { id: 'mat_chiyan', count: 2 },
    ],
    seconds: 600, baseSuccess: 0.55,
    desc: '龙诞花清神，妖丹聚力。破丹成婴之引，婴成则神通自生。',
  },
  {
    id: 'rc_zaohua', pill: 'pill_zaohua', name: '造化丹丹方', minRealm: 15, unlockCost: 21000,
    materials: [
      { id: 'mat_longdanhua', count: 2 },
      { id: 'mat_neidan', count: 1 },
      { id: 'mat_xingchen', count: 1 },
    ],
    seconds: 600, baseSuccess: 0.6,
    desc: '龙诞花清神，内丹聚力，星辰砂承之。丹成之日，炉上隐有云气盘桓不散。',
  },
  {
    id: 'rc_huashen', pill: 'pill_huashen', name: '化神丹丹方', minRealm: 16, unlockCost: 31000,
    materials: [
      { id: 'mat_longdanhua', count: 3 },
      { id: 'mat_xingchen', count: 2 },
      { id: 'mat_neidan', count: 1 },
    ],
    seconds: 900, baseSuccess: 0.52,
    desc: '星辰砂引星力入炉，千年内丹为核。化婴为神，神念所至，山河可移。',
  },
  {
    id: 'rc_powang', pill: 'pill_powang', name: '破妄丹丹方', minRealm: 19, unlockCost: 49000,
    materials: [
      { id: 'mat_xingchen', count: 3 },
      { id: 'mat_neidan', count: 2 },
      { id: 'mat_longdanhua', count: 4 },
    ],
    seconds: 1200, baseSuccess: 0.5,
    desc: '星砂为炉，内丹为心，龙诞花为引。破虚妄，见真我，唯心可渡。',
  },
  {
    id: 'rc_dayan', pill: 'pill_dayan', name: '大衍丹丹方', minRealm: 20, unlockCost: 120000,
    materials: [
      { id: 'mat_taisuizhi', count: 2 },
      { id: 'mat_hundun', count: 1 },
      { id: 'mat_longlin', count: 2 },
    ],
    seconds: 1200, baseSuccess: 0.55,
    desc: '太岁芝生生不息，混沌石一缕未分。大衍之数五十，其用四十有九。',
  },
  {
    id: 'rc_tiangang', pill: 'pill_tiangang', name: '天罡丹丹方', minRealm: 21, unlockCost: 100000,
    materials: [
      { id: 'mat_taisuizhi', count: 2 },
      { id: 'mat_longlin', count: 2 },
      { id: 'mat_neidan', count: 3 },
    ],
    seconds: 1500, baseSuccess: 0.5,
    desc: '太岁芝生生不息，龙鳞矿承天罡之气。引罡气入体，与道合真。',
  },
  {
    id: 'rc_wudao', pill: 'pill_wudao', name: '悟道丹丹方', minRealm: 22, unlockCost: 160000,
    materials: [
      { id: 'mat_taisuizhi', count: 3 },
      { id: 'mat_hundun', count: 1 },
      { id: 'mat_longlin', count: 3 },
    ],
    seconds: 2400, baseSuccess: 0.5,
    desc: '掺入混沌石一缕。一丹一悟，一悟一世，大道无形，唯悟者得。',
  },
  {
    id: 'rc_dujie', pill: 'pill_dujie', name: '渡劫丹丹方', minRealm: 23, unlockCost: 300000,
    materials: [
      { id: 'mat_hundun', count: 3 },
      { id: 'mat_taisuizhi', count: 5 },
      { id: 'mat_longlin', count: 4 },
    ],
    seconds: 3600, baseSuccess: 0.5,
    desc: '混沌石为君，太岁芝为臣，龙鳞矿为佐。以丹药代劫，虽为下策，然活命要紧。',
  },
];

// ======================================================================
// 炼器图纸 —— 20 张，equip 均引用 equipments.js 真实 id
// ======================================================================
export const FORGE_RECIPES = [
  {
    id: 'fr_qingwen_sword', equip: 'eq_qingwen_sword', name: '青纹铁剑图纸', minRealm: 0, unlockCost: 170,
    materials: [{ id: 'mat_xuantie', count: 3 }],
    seconds: 30, baseSuccess: 0.9, minQuality: 'fan',
    desc: '最简易的铸剑之法。玄铁三块，反复锻打即可成器。',
  },
  {
    id: 'fr_cloth_robe', equip: 'eq_cloth_robe', name: '粗布道袍图纸', minRealm: 0, unlockCost: 140,
    materials: [{ id: 'mat_shougu', count: 3 }],
    seconds: 30, baseSuccess: 0.9, minQuality: 'fan',
    desc: '兽骨磨粉入浆，浆洗粗布。虽简陋，却比寻常衣衫耐用。',
  },
  {
    id: 'fr_tongling_fu', equip: 'eq_tongling_fu', name: '铜铃符图纸', minRealm: 0, unlockCost: 190,
    materials: [{ id: 'mat_xuantie', count: 2 }, { id: 'mat_lingzhi', count: 2 }],
    seconds: 40, baseSuccess: 0.88, minQuality: 'fan',
    desc: '玄铁铸铃，灵芝汁描符。散修防身的入门法器。',
  },
  {
    id: 'fr_beast_leather', equip: 'eq_beast_leather', name: '兽皮软甲图纸', minRealm: 2, unlockCost: 320,
    materials: [{ id: 'mat_shougu', count: 5 }, { id: 'mat_lingzhi', count: 2 }],
    seconds: 50, baseSuccess: 0.86, minQuality: 'fan',
    desc: '兽皮鞣制，骨粉填缝。轻便耐磨，猎户惯用的手艺。',
  },
  {
    id: 'fr_hanxing_dagger', equip: 'eq_hanxing_dagger', name: '寒星匕图纸', minRealm: 5, unlockCost: 600,
    materials: [{ id: 'mat_xuantie', count: 5 }, { id: 'mat_hanjing', count: 1 }],
    seconds: 90, baseSuccess: 0.8, minQuality: 'ling',
    desc: '玄铁为体，寒晶为眼。匕成之时须淬寒泉，否则寒芒易散。',
  },
  {
    id: 'fr_xuantie_armor', equip: 'eq_xuantie_armor', name: '玄铁重铠图纸', minRealm: 9, unlockCost: 1900,
    materials: [{ id: 'mat_xuantie', count: 10 }, { id: 'mat_hanjing', count: 4 }],
    seconds: 180, baseSuccess: 0.72, minQuality: 'ling',
    desc: '玄铁叶甲层层相扣。甲重逾千斤，非筑基修士不能着。',
  },
  {
    id: 'fr_xuantie_spear', equip: 'eq_xuantie_spear', name: '玄铁破军枪图纸', minRealm: 9, unlockCost: 1700,
    materials: [
      { id: 'mat_xuantie', count: 8 },
      { id: 'mat_hanjing', count: 3 },
      { id: 'mat_shougu', count: 5 },
    ],
    seconds: 150, baseSuccess: 0.75, minQuality: 'ling',
    desc: '枪身一体锻成，不容有隙。骨粉渗入铁中，可增韧性。',
  },
  {
    id: 'fr_hanjing_bead', equip: 'eq_hanjing_bead', name: '寒晶珠图纸', minRealm: 9, unlockCost: 2000,
    materials: [{ id: 'mat_hanjing', count: 5 }, { id: 'mat_yaoxue', count: 2 }],
    seconds: 150, baseSuccess: 0.75, minQuality: 'ling',
    desc: '寒晶打磨，妖血祭炼。珠成后须以体温温养，方不反噬。',
  },
  {
    id: 'fr_yinyang_mirror', equip: 'eq_yinyang_mirror', name: '阴阳镜图纸', minRealm: 10, unlockCost: 3700,
    materials: [
      { id: 'mat_hanjing', count: 6 },
      { id: 'mat_yaoxue', count: 4 },
      { id: 'mat_xueshen', count: 3 },
    ],
    seconds: 240, baseSuccess: 0.68, minQuality: 'xian',
    desc: '镜分阴阳两面，须同日同炉铸成。稍有偏差，便是一面废镜。',
  },
  {
    id: 'fr_liuyun_sword', equip: 'eq_liuyun_sword', name: '流云剑图纸', minRealm: 10, unlockCost: 3400,
    materials: [
      { id: 'mat_hanjing', count: 6 },
      { id: 'mat_yaoxue', count: 3 },
      { id: 'mat_xuantie', count: 8 },
    ],
    seconds: 240, baseSuccess: 0.68, minQuality: 'xian',
    desc: '剑身取轻，剑意取柔。铸剑时须听风，风停则剑成。',
  },
  {
    id: 'fr_chiyan_armor', equip: 'eq_chiyan_armor', name: '赤炎战甲图纸', minRealm: 12, unlockCost: 10000,
    materials: [{ id: 'mat_chiyan', count: 6 }, { id: 'mat_yaodan', count: 2 }],
    seconds: 420, baseSuccess: 0.62, minQuality: 'ling',
    desc: '赤炎铜甲片，妖丹为核。甲成时以精血点化，自此甲随心动。',
  },
  {
    id: 'fr_yaodan_orb', equip: 'eq_yaodan_orb', name: '妖丹玄珠图纸', minRealm: 12, unlockCost: 9200,
    materials: [{ id: 'mat_yaodan', count: 3 }, { id: 'mat_chiyan', count: 4 }],
    seconds: 400, baseSuccess: 0.63, minQuality: 'ling',
    desc: '取百年妖丹祭炼成珠。妖族深恨此法，故炼器者多不张扬。',
  },
  {
    id: 'fr_chiyan_blade', equip: 'eq_chiyan_blade', name: '赤炎重剑图纸', minRealm: 12, unlockCost: 7300,
    materials: [{ id: 'mat_chiyan', count: 5 }, { id: 'mat_hanjing', count: 5 }],
    seconds: 360, baseSuccess: 0.65, minQuality: 'ling',
    desc: '赤炎铜为骨，寒晶石为心。以寒镇火，火方不燥。',
  },
  {
    id: 'fr_zixiao_sword', equip: 'eq_zixiao_sword', name: '紫霄剑图纸', minRealm: 13, unlockCost: 20000,
    materials: [
      { id: 'mat_chiyan', count: 8 },
      { id: 'mat_yaodan', count: 4 },
      { id: 'mat_jiuyelian', count: 3 },
    ],
    seconds: 720, baseSuccess: 0.58, minQuality: 'xian',
    desc: '铸剑于雷雨之夜，引紫霄天雷入剑。雷不入者，剑不成。',
  },
  {
    id: 'fr_xingchen_armor', equip: 'eq_xingchen_armor', name: '星辰法铠图纸', minRealm: 15, unlockCost: 47000,
    materials: [{ id: 'mat_xingchen', count: 6 }, { id: 'mat_neidan', count: 2 }],
    seconds: 960, baseSuccess: 0.53, minQuality: 'xian',
    desc: '星辰砂嵌甲，千年内丹为心。星力流转，受损可自愈。',
  },
  {
    id: 'fr_xingchen_saber', equip: 'eq_xingchen_saber', name: '星辰斩月刀图纸', minRealm: 15, unlockCost: 37000,
    materials: [{ id: 'mat_xingchen', count: 5 }, { id: 'mat_chiyan', count: 8 }],
    seconds: 900, baseSuccess: 0.55, minQuality: 'xian',
    desc: '刀身淬星辰砂，刀锋映月。铸者须在月圆之夜开刃。',
  },
  {
    id: 'fr_zhuxian_sword', equip: 'eq_zhuxian_sword', name: '诛仙古剑图纸', minRealm: 16, unlockCost: 100000,
    materials: [
      { id: 'mat_neidan', count: 5 },
      { id: 'mat_xingchen', count: 8 },
      { id: 'mat_longdanhua', count: 5 },
    ],
    seconds: 1500, baseSuccess: 0.5, minQuality: 'shen',
    desc: '仿上古遗剑而铸。图纸残缺一角，那一角，恰是最要紧的剑意。',
  },
  {
    id: 'fr_longlin_armor', equip: 'eq_longlin_armor', name: '龙鳞不灭甲图纸', minRealm: 18, unlockCost: 200000,
    materials: [{ id: 'mat_longlin', count: 7 }, { id: 'mat_xingchen', count: 10 }],
    seconds: 2000, baseSuccess: 0.5, minQuality: 'shen',
    desc: '龙鳞矿千锤百炼，星砂渗入鳞隙。甲成不灭，可挡天劫。',
  },
  {
    id: 'fr_hundun_axe', equip: 'eq_hundun_axe', name: '混沌开天斧图纸', minRealm: 21, unlockCost: 340000,
    materials: [{ id: 'mat_hundun', count: 4 }, { id: 'mat_longlin', count: 8 }],
    seconds: 3000, baseSuccess: 0.5, minQuality: 'sheng',
    desc: '斧刃由混沌石打磨。相传此斧铸成之日，炉中传出一声开天辟地的闷响。',
  },
  {
    id: 'fr_taichu_seal', equip: 'eq_taichu_seal', name: '太初道印图纸', minRealm: 24, unlockCost: 580000,
    materials: [
      { id: 'mat_hundun', count: 6 },
      { id: 'mat_taisuizhi', count: 6 },
      { id: 'mat_longlin', count: 10 },
    ],
    seconds: 4200, baseSuccess: 0.5, minQuality: 'sheng',
    desc: '印上无字，因道不可言。铸印者须先忘尽所学，方能落锤。',
  },
];

export function alchemyRecipeById(id) {
  return ALCHEMY_RECIPES.find((r) => r.id === id) || null;
}

export function forgeRecipeById(id) {
  return FORGE_RECIPES.find((r) => r.id === id) || null;
}

/** 该境界可用的丹方（minRealm <= realmIndex） */
export function alchemyRecipesFor(realmIndex) {
  return ALCHEMY_RECIPES.filter((r) => r.minRealm <= realmIndex);
}

/** 该境界可用的炼器图纸（minRealm <= realmIndex） */
export function forgeRecipesFor(realmIndex) {
  return FORGE_RECIPES.filter((r) => r.minRealm <= realmIndex);
}

/** 反查某丹药对应的丹方 */
export function alchemyRecipeByPill(pillId) {
  return ALCHEMY_RECIPES.find((r) => r.pill === pillId) || null;
}

/** 反查某装备对应的图纸 */
export function forgeRecipeByEquip(equipId) {
  return FORGE_RECIPES.find((r) => r.equip === equipId) || null;
}
