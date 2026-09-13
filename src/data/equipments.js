/**
 * 装备。三个槽位：weapon（武器）/ armor（护甲）/ treasure（法宝）。
 *
 * 字段约定：
 *   slot     'weapon' | 'armor' | 'treasure'
 *   quality  品阶 id，见 qualities.js（fan/ling/xian/shen/sheng）
 *   tier     1~5，对应炼气 / 筑基 / 金丹 / 元婴 / 化神以上 五个大境界段
 *   minRealm 装备所需最低境界索引（0..25，见 realms.js）
 *   price    坊市售价（下品灵石为单位，100 下品 = 1 中品）
 *   base     基础属性，只写非零项：atk / def / hp / mp / spd
 *
 * 数值锚点（与 tools/out/economy.json 的收入曲线对齐）：
 *   tier1 140~630     tier2 1700~3700   tier3 7300~2.2万
 *   tier4 3.7万~10万   tier5 20万~58万
 * 品阶与 tier 大致对应：t1 凡/灵，t2 灵/仙，t3 灵/仙，t4 仙/神，t5 神/圣。
 *
 * ─────────────────────────── 价格怎么来的 ───────────────────────────
 * 同境界组（minRealm 相同）的三件装备价格本来就大致相等，改价时必须**整组一起动**，
 * 否则坊市里会并排出现"战力相当、价格差十倍"的两件东西。
 *
 * 可锻造的那件由材料成本定：
 *     装备价 = Σ(材料买入价 × 数量) ÷ 基础成功率 × 1.4，再钳进 [材料 ×1.2, 材料 ×2.5]
 * 同组的另外两件按**同一比例**跟随，保持组内相对关系不变。
 * 下界保证不会出现"买成品比买材料便宜"；上界是防刷灵石线（1/SELL_RATE = 2.857）的余量版——
 * 炼器与炼丹一样会把成功率抬到 0.98，所以必须按满成功率卡这条线。
 * 20 张器图的 unlockCost 就等于对应装备价（参悟一次 ≈ 买一件成品），改价时一并改。
 * （tools/test_economy.mjs 的炼器版不变式会挡住越界。）
 *
 * id 一经使用不要改名：forge recipes（recipes.js）与存档都会引用。
 */

export const EQUIPMENTS = [
  // ==================================================================
  // 武器 weapon —— 主攻击
  // ==================================================================
  {
    id: 'eq_qingwen_sword', name: '青纹铁剑', slot: 'weapon', quality: 'fan', tier: 1,
    minRealm: 0, price: 170,
    base: { atk: 8 },
    desc: '凡铁所铸，剑身有青纹如苔。散修入门之器',
    lore: '铸剑的老铁匠说，这剑淬火时井水泛青，是山里的灵气渗了进去。',
  },
  {
    id: 'eq_taomu_blade', name: '桃木法刃', slot: 'weapon', quality: 'fan', tier: 1,
    minRealm: 2, price: 280,
    base: { atk: 7, spd: 1 },
    desc: '百年雷击桃木削成，轻捷辟邪，斩妖有奇效',
    lore: '桃者，五木之精。雷劈而不死，取其木为刃，鬼魅见之退避三舍。',
  },
  {
    id: 'eq_hanxing_dagger', name: '寒星匕', slot: 'weapon', quality: 'ling', tier: 1,
    minRealm: 5, price: 600,
    base: { atk: 16, spd: 2 },
    desc: '匕身嵌寒晶一粒，出鞘时寒芒如星，快而无声',
    lore: '此匕原为刺客之物，后为一散修所得。刺客已死，匕犹在，寒芒未减。',
  },
  {
    id: 'eq_xuantie_spear', name: '玄铁破军枪', slot: 'weapon', quality: 'ling', tier: 2,
    minRealm: 9, price: 1700,
    base: { atk: 85, spd: 1 },
    desc: '玄铁枪身，重逾千斤，一枪破阵，无坚不摧',
    lore: '枪名破军，取"破军星"之意。凡持此枪者，须先有一往无前之心。',
  },
  {
    id: 'eq_liuyun_sword', name: '流云剑', slot: 'weapon', quality: 'xian', tier: 2,
    minRealm: 10, price: 3400,
    base: { atk: 150, spd: 3 },
    desc: '剑走轻灵，如流云出岫，剑势连绵不绝',
    lore: '云无常形，剑无常势。能悟得"流云"二字者，剑法自成一家。',
  },
  {
    id: 'eq_chiyan_blade', name: '赤炎重剑', slot: 'weapon', quality: 'ling', tier: 3,
    minRealm: 12, price: 7300,
    base: { atk: 620 },
    desc: '以赤炎铜锻成，剑身赤红，挥动时隐隐有火气',
    lore: '此剑出炉那日，炉火三日不熄。铸者言：剑中封着一缕地火，慎用。',
  },
  {
    id: 'eq_zixiao_sword', name: '紫霄剑', slot: 'weapon', quality: 'xian', tier: 3,
    minRealm: 13, price: 20000,
    base: { atk: 1050, spd: 5 },
    desc: '剑引紫霄天雷之气，出鞘有雷鸣，斩妖除魔',
    lore: '紫霄者，九天之上雷府也。剑成之时，天降紫雷三道，皆入剑中。',
  },
  {
    id: 'eq_xingchen_saber', name: '星辰斩月刀', slot: 'weapon', quality: 'xian', tier: 4,
    minRealm: 15, price: 37000,
    base: { atk: 4200, spd: 4 },
    desc: '刀身淬星辰砂，刀光如练，可斩月华',
    lore: '昔有刀客登临绝顶，一刀斩落月影。月影散尽，刀上却留下一道星痕。',
  },
  {
    id: 'eq_zhuxian_sword', name: '诛仙古剑', slot: 'weapon', quality: 'shen', tier: 4,
    minRealm: 16, price: 100000,
    base: { atk: 8200, spd: 8 },
    desc: '上古遗剑，剑身斑驳，然锋锐之气逼人，仙神辟易',
    lore: '此剑非为杀仙而铸，乃仙人所遗。仙畏其锋，故封之；封者已逝，剑犹在。',
  },
  {
    id: 'eq_longlin_halberd', name: '龙鳞裂天戟', slot: 'weapon', quality: 'shen', tier: 5,
    minRealm: 18, price: 210000,
    base: { atk: 28000, spd: 6 },
    desc: '戟身覆龙鳞矿，重压如山，一挥可裂长空',
    lore: '龙鳞矿本就难求，此戟更以真龙逆鳞为引。戟成之日，方圆百里百兽伏地。',
  },
  {
    id: 'eq_hundun_axe', name: '混沌开天斧', slot: 'weapon', quality: 'sheng', tier: 5,
    minRealm: 21, price: 340000,
    base: { atk: 62000, spd: 10 },
    desc: '斧刃由混沌石打磨，斧落之处，虚空亦为之开',
    lore: '混沌未分时，天地本是一团。此斧仿开天之意而铸，故名开天。',
  },
  {
    id: 'eq_taichu_sword', name: '太初仙剑', slot: 'weapon', quality: 'sheng', tier: 5,
    minRealm: 24, price: 570000,
    base: { atk: 90000, spd: 15 },
    desc: '太初之剑，剑出无光，唯有一线斩断因果之意',
    lore: '太初者，道之始也。此剑无名，因其先于名而生；见之者，只觉天地一静。',
  },

  // ==================================================================
  // 护甲 armor —— 主防御与气血
  // ==================================================================
  {
    id: 'eq_cloth_robe', name: '粗布道袍', slot: 'armor', quality: 'fan', tier: 1,
    minRealm: 0, price: 140,
    base: { def: 5, hp: 40 },
    desc: '浆洗得发白的粗布道袍，聊胜于无',
    lore: '道在人心，不在衣冠。可若连件像样的袍子都没有，心也难安。',
  },
  {
    id: 'eq_beast_leather', name: '兽皮软甲', slot: 'armor', quality: 'fan', tier: 1,
    minRealm: 2, price: 320,
    base: { def: 9, hp: 90 },
    desc: '妖兽皮革鞣制，轻便耐磨，可挡刀兵',
    lore: '山里猎户的手艺，不讲究好看，只讲究挨得住。',
  },
  {
    id: 'eq_qingmu_shield', name: '青木护心镜', slot: 'armor', quality: 'ling', tier: 1,
    minRealm: 5, price: 570,
    base: { def: 16, hp: 160 },
    desc: '千年青木心一片，护住心脉，妖气难侵',
    lore: '青木生于灵脉之上，千年方成心材。伐木者须以灵酒祭之，否则木朽人亡。',
  },
  {
    id: 'eq_xuantie_armor', name: '玄铁重铠', slot: 'armor', quality: 'ling', tier: 2,
    minRealm: 9, price: 1900,
    base: { def: 70, hp: 700 },
    desc: '玄铁叶甲层层相扣，重甲在身，稳如磐石',
    lore: '着此甲者行动迟缓，然筑基修士有灵力托举，甲重反成镇压之力。',
  },
  {
    id: 'eq_hanjing_robe', name: '寒晶法袍', slot: 'armor', quality: 'xian', tier: 2,
    minRealm: 10, price: 3200,
    base: { def: 130, hp: 1600, mp: 300 },
    desc: '寒晶丝织就，阴气内敛，服之心神清明',
    lore: '寒晶产于极北地脉，常温不化。以此织袍，须在冰窟中行针三月。',
  },
  {
    id: 'eq_chiyan_armor', name: '赤炎战甲', slot: 'armor', quality: 'ling', tier: 3,
    minRealm: 12, price: 10000,
    base: { def: 480, hp: 5500 },
    desc: '赤炎铜甲片，火性内蕴，御敌时甲面泛赤光',
    lore: '甲成之时，铸者以自身精血点化，自此甲随心动，火随甲生。',
  },
  {
    id: 'eq_ziyu_robe', name: '紫玉仙衣', slot: 'armor', quality: 'xian', tier: 3,
    minRealm: 13, price: 18000,
    base: { def: 850, hp: 14000, mp: 2500 },
    desc: '紫玉兰丝与星辰砂同织，衣袂无风自动',
    lore: '仙衣认主，非有缘者着之，如披针毡；有缘者着之，轻若无物。',
  },
  {
    id: 'eq_xingchen_armor', name: '星辰法铠', slot: 'armor', quality: 'xian', tier: 4,
    minRealm: 15, price: 47000,
    base: { def: 3400, hp: 42000 },
    desc: '铠甲嵌星辰砂，星力流转，受损可自愈',
    lore: '星陨之夜，有陨铁落于昆仑。铸甲者守候十年，方得此铠。',
  },
  {
    id: 'eq_longlin_scale', name: '内丹龙鳞甲', slot: 'armor', quality: 'shen', tier: 4,
    minRealm: 16, price: 93000,
    base: { def: 6800, hp: 100000 },
    desc: '龙鳞为面，内丹为心，甲中妖力生生不息',
    lore: '取千年大妖内丹为核，妖魂未散，夜半甲中犹闻低吼。',
  },
  {
    id: 'eq_longlin_armor', name: '龙鳞不灭甲', slot: 'armor', quality: 'shen', tier: 5,
    minRealm: 18, price: 200000,
    base: { def: 26000, hp: 320000 },
    desc: '龙鳞矿千锤百炼，甲成不灭，刀兵难伤',
    lore: '此甲曾历三次天劫而不毁，甲上焦痕，是天雷留下的印章。',
  },
  {
    id: 'eq_hundun_armor', name: '混沌战体铠', slot: 'armor', quality: 'sheng', tier: 5,
    minRealm: 21, price: 310000,
    base: { def: 55000, hp: 900000 },
    desc: '混沌石熔铸成铠，与血肉相融，如生来便有',
    lore: '以混沌铸身者，甲即是身，身即是甲。破甲者，须先破其道。',
  },
  {
    id: 'eq_taichu_robe', name: '太初道袍', slot: 'armor', quality: 'sheng', tier: 5,
    minRealm: 24, price: 520000,
    base: { def: 72000, hp: 1300000, mp: 120000 },
    desc: '太初之气织就，无相无形，随念而变',
    lore: '袍上本无一纹，因道本无相。着之者心中有何，袍上便现何纹。',
  },

  // ==================================================================
  // 法宝 treasure —— 攻守兼备，主灵力与速度
  // ==================================================================
  {
    id: 'eq_tongling_fu', name: '铜铃符', slot: 'treasure', quality: 'fan', tier: 1,
    minRealm: 0, price: 190,
    base: { atk: 3, def: 3, mp: 30 },
    desc: '铜铃一枚，刻简易符箓，摇之凝神，驱小妖',
    lore: '散修防身之物，铃声响处，寻常野鬼不敢近身。',
  },
  {
    id: 'eq_huoyun_bead', name: '火云珠', slot: 'treasure', quality: 'fan', tier: 1,
    minRealm: 2, price: 380,
    base: { atk: 6, def: 4, mp: 60 },
    desc: '珠内封一缕地火，祭出时化火云灼敌',
    lore: '地火难封，封珠者十有九伤。此珠能成，已是侥幸。',
  },
  {
    id: 'eq_qingxin_bell', name: '清心铃', slot: 'treasure', quality: 'ling', tier: 1,
    minRealm: 5, price: 630,
    base: { atk: 8, def: 8, mp: 120, spd: 1 },
    desc: '铃声清越，涤荡心魔，亦能震退近身之敌',
    lore: '心魔由心而生，铃声不能灭之，却能令你记得——你是谁。',
  },
  {
    id: 'eq_hanjing_bead', name: '寒晶珠', slot: 'treasure', quality: 'ling', tier: 2,
    minRealm: 9, price: 2000,
    base: { atk: 30, def: 35, mp: 300, spd: 2 },
    desc: '寒晶打磨成珠，寒气可凝敌手足，亦可护体',
    lore: '珠出冰窟，取珠者须以体温焐之三日，否则血脉冻结。',
  },
  {
    id: 'eq_yinyang_mirror', name: '阴阳镜', slot: 'treasure', quality: 'xian', tier: 2,
    minRealm: 10, price: 3700,
    base: { atk: 60, def: 65, mp: 600, spd: 4 },
    desc: '镜分阴阳两面，阳面照敌，阴面护主，攻守一体',
    lore: '镜本一对，一阴一阳。得其一者，夜半常闻另一面镜中之声。',
  },
  {
    id: 'eq_yaodan_orb', name: '妖丹玄珠', slot: 'treasure', quality: 'ling', tier: 3,
    minRealm: 12, price: 9200,
    base: { atk: 220, def: 200, mp: 2000, spd: 5 },
    desc: '百年妖丹祭炼成珠，妖力澎湃，攻守皆宜',
    lore: '妖丹本是妖族修行之根，炼器者取之，是夺其道，故妖族深恨此法。',
  },
  {
    id: 'eq_jiuyou_flag', name: '九幽幡', slot: 'treasure', quality: 'xian', tier: 3,
    minRealm: 13, price: 22000,
    base: { atk: 420, def: 380, mp: 4000, spd: 8 },
    desc: '幡上绘九幽鬼纹，招阴风、御鬼影，诡谲难测',
    lore: '幡成之日，九幽之下有鬼哭三声。铸者言：它认得回家的路。',
  },
  {
    id: 'eq_xingchen_pagoda', name: '星辰塔', slot: 'treasure', quality: 'xian', tier: 4,
    minRealm: 15, price: 50000,
    base: { atk: 1800, def: 1600, mp: 16000, spd: 10 },
    desc: '七层小塔，层叠星砂，悬于头顶可镇压一方',
    lore: '塔本九层，铸者功亏一篑。言：留两层遗憾，也是道。',
  },
  {
    id: 'eq_neidan_seal', name: '内丹玉印', slot: 'treasure', quality: 'shen', tier: 4,
    minRealm: 16, price: 100000,
    base: { atk: 3400, def: 3000, mp: 32000, spd: 13 },
    desc: '千年内丹嵌于玉印，印落如岳，妖邪辟易',
    lore: '印者，信也。以此印镇妖，是代天行令之意。',
  },
  {
    id: 'eq_longlin_banner', name: '龙鳞幡', slot: 'treasure', quality: 'shen', tier: 5,
    minRealm: 18, price: 230000,
    base: { atk: 14000, def: 12000, mp: 100000, spd: 16 },
    desc: '龙鳞为幡面，真龙之气镇八方，邪魔不敢仰视',
    lore: '幡展时，隐有龙吟。那龙早已陨落，唯余一声不甘的啸。',
  },
  {
    id: 'eq_hundun_cauldron', name: '混沌鼎', slot: 'treasure', quality: 'sheng', tier: 5,
    minRealm: 21, price: 330000,
    base: { atk: 30000, def: 26000, mp: 200000, spd: 20 },
    desc: '混沌石所铸三足鼎，可炼万物，亦可镇山河',
    lore: '鼎者，国之重器。此鼎不炼丹药，炼的是一方天地的气数。',
  },
  {
    id: 'eq_taichu_seal', name: '太初道印', slot: 'treasure', quality: 'sheng', tier: 5,
    minRealm: 24, price: 580000,
    base: { atk: 50000, def: 42000, mp: 320000, spd: 26 },
    desc: '道印无形，印下之处，万法归寂，唯余大道',
    lore: '印上无字。有人问为何，答曰：道不可言，言即失道。',
  },
];

export function equipById(id) {
  return EQUIPMENTS.find((e) => e.id === id) || null;
}

export function equipByName(name) {
  return EQUIPMENTS.find((e) => e.name === name) || null;
}

export function equipsBySlot(slot) {
  return EQUIPMENTS.filter((e) => e.slot === slot);
}

export function equipsByTier(tier) {
  return EQUIPMENTS.filter((e) => e.tier === tier);
}
