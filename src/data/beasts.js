/**
 * 灵兽数据表（V3.0「问宗」）。
 *
 * ⚠ 本文件是纯数据，不含任何逻辑，也不得出现 DOM / state 依赖。
 *
 * ─────────────────────────── 字段契约 ───────────────────────────
 *   id          灵兽 id，bst_ 前缀
 *   name        名号（有修仙味，不要占位符）
 *   tier        1~5，与 enemies.js 的 tier 对齐：
 *               1 炼气(0~8) / 2 筑基(9~11) / 3 金丹(12~14) / 4 元婴(15~17) / 5 化神以上(18+)
 *   minRealm    最低可获取境界索引
 *   role        attack 攻伐 | tank 镇守 | support 辅助 —— 决定战斗中定位与亲密度协战效果
 *   base        { hp, atk, def, spd } 一级裸属性
 *   growth      { hp, atk, def, spd } 每级成长（可为小数，结算时取整）
 *   starCap     资质上限 { base, max }：base 为该形态常规资质，max 为该物种可掷出的最高星级。
 *               ⚠ 星级一经诞生即不可更改（"无尽追求"的来源），starCap 只约束
 *               新个体的掷星上限与进化后物种的上限提升。
 *   skills      1~3 个技能，见下方 kind 语义
 *   evolveTo    进化目标 id（null = 最终形态）
 *   evolveLevel 进化所需等级
 *   evolveCost  进化消耗的灵材 [{id, count}]
 *   eggFrom     孵化所需灵材 id（null = 不可孵化，只能捕捉 / 兑换）
 *   desc        一句话简介
 *   lore        志异体小传，纯风味
 *
 * ─────────────────────── 技能 kind 语义 ───────────────────────
 *   damage  按 power 倍率造成伤害
 *   heal    按最大气血的 power 比例回复（自身或队友，交战斗层解释）
 *   buff    按 power 提升攻防等属性
 *   debuff  按 power 削弱敌方属性（战斗层必须封顶，参见 combat.js 的层数上限教训）
 *   guard   护主：替玩家抵挡一次致命伤（power 为可抵挡的次数，默认 1）
 *
 * 技能还带 unlockIntimacy（亲密度门槛）与 unlockStage（进化阶数门槛，默认 0），
 * 两者都由 systems/beast.js 的 beastSkills() 统一门控。
 *
 * ─────────────────────── 三条进化链 ───────────────────────
 *   攻伐·狐火：赤炎狐 → 幽炎狐 → 六尾炎狐 → 九尾天狐
 *   镇守·玄水：玄水龟 → 磐甲灵龟 → 太阴玄龟 → 玄武神龟
 *   辅助·青鸾：灵犀雀 → 青鸾 → 九天玄鸾
 */

export const ROLE_NAMES = {
  attack: '攻伐',
  tank: '镇守',
  support: '辅助',
};

export const BEASTS = [
  // ==================================================================
  // tier 1 —— 炼气期：凡阶灵兽，皆是入门伴当
  // ==================================================================
  {
    id: 'bst_chiyanhu', name: '赤炎狐', tier: 1, minRealm: 0, role: 'attack',
    base: { hp: 78, atk: 10, def: 3, spd: 13 },
    growth: { hp: 4.7, atk: 0.5, def: 0.16, spd: 0.26 },
    starCap: { base: 3, max: 5 },
    skills: [
      { id: 'bsk_fox_zhua', name: '狐火燎原', kind: 'damage', power: 1.35, unlockIntimacy: 0, desc: '尾尖一点赤火，落地即成燎原之势。' },
      { id: 'bsk_fox_yan', name: '赤焰吐息', kind: 'damage', power: 1.6, unlockIntimacy: 40, desc: '张口喷出赤焰，专烧护体真元。' },
    ],
    evolveTo: 'bst_youyanhu', evolveLevel: 20,
    evolveCost: [{ id: 'mat_shougu', count: 20 }],
    eggFrom: 'mat_shougu',
    desc: '火绒尾、赤瞳的小狐，性烈而亲人。',
    lore: '相传赤炎狐生于火山余烬之中，初生时尾尖只有一星火。它认主之后，那点火便会随主人心念明灭。',
  },
  {
    id: 'bst_xuanshuigui', name: '玄水龟', tier: 1, minRealm: 0, role: 'tank',
    base: { hp: 105, atk: 6, def: 6, spd: 9 },
    growth: { hp: 6.3, atk: 0.3, def: 0.3, spd: 0.18 },
    starCap: { base: 3, max: 5 },
    skills: [
      { id: 'bsk_gui_ke', name: '龟甲护主', kind: 'guard', power: 1, unlockIntimacy: 0, desc: '横身挡在主人身前，以甲壳承下致命一击。' },
      { id: 'bsk_gui_shui', name: '玄水箭', kind: 'damage', power: 1.1, unlockIntimacy: 20, desc: '凝水成箭，虽轻却能穿甲。' },
    ],
    evolveTo: 'bst_panjia_linggui', evolveLevel: 20,
    evolveCost: [{ id: 'mat_shougu', count: 20 }],
    eggFrom: 'mat_shougu',
    desc: '背负玄纹的老龟，行动迟缓，壳硬如铁。',
    lore: '玄水龟寿数极长，据说背甲上的纹路会随岁月增生。养龟之人常说：它不争，故无人能胜它。',
  },
  {
    id: 'bst_lingxique', name: '灵犀雀', tier: 1, minRealm: 0, role: 'support',
    base: { hp: 68, atk: 7, def: 3, spd: 14 },
    growth: { hp: 4.1, atk: 0.35, def: 0.15, spd: 0.28 },
    starCap: { base: 3, max: 5 },
    skills: [
      { id: 'bsk_que_ling', name: '灵犀啄', kind: 'damage', power: 1.1, unlockIntimacy: 0, desc: '一啄虽轻，却能点破气机。' },
      { id: 'bsk_que_yu', name: '衔药', kind: 'heal', power: 0.15, unlockIntimacy: 20, desc: '不知从何处衔来灵草，敷在伤处。' },
    ],
    evolveTo: 'bst_qingluan', evolveLevel: 20,
    evolveCost: [{ id: 'mat_shougu', count: 20 }],
    eggFrom: 'mat_shougu',
    desc: '额生一点青羽的灵雀，通人意，善寻药。',
    lore: '灵犀雀不栖高枝，只落在主人肩头。它衔来的草药，往往是主人自己都未曾察觉的旧伤所需。',
  },
  {
    id: 'bst_leiyabao', name: '雷牙豹', tier: 1, minRealm: 2, role: 'attack',
    base: { hp: 72, atk: 11, def: 2, spd: 15 },
    growth: { hp: 4.3, atk: 0.55, def: 0.11, spd: 0.3 },
    starCap: { base: 3, max: 5 },
    skills: [
      { id: 'bsk_bao_ya', name: '雷牙撕', kind: 'damage', power: 1.3, unlockIntimacy: 0, desc: '獠牙带电，撕咬处焦黑一片。' },
      { id: 'bsk_bao_lei', name: '雷走', kind: 'buff', power: 0.15, unlockIntimacy: 35, desc: '踏雷而行，攻势骤急。' },
    ],
    evolveTo: null, evolveLevel: 0,
    evolveCost: [],
    eggFrom: 'mat_shougu',
    desc: '幼豹通体银斑，怒时牙间有细雷游走。',
    lore: '雷牙豹是山雨欲来时最躁动的兽。老猎人说，它不是在怕雷，是在等雷。',
  },
  {
    id: 'bst_shijiaqiu', name: '石甲犰', tier: 1, minRealm: 2, role: 'tank',
    base: { hp: 118, atk: 5, def: 8, spd: 7 },
    growth: { hp: 7.1, atk: 0.25, def: 0.4, spd: 0.14 },
    starCap: { base: 3, max: 3 },
    skills: [
      { id: 'bsk_qiu_dun', name: '蜷甲护主', kind: 'guard', power: 1, unlockIntimacy: 0, desc: '蜷成一团滚到主人脚下，甲缘如盾。' },
      { id: 'bsk_qiu_zhuang', name: '铁躯撞', kind: 'damage', power: 1.15, unlockIntimacy: 25, desc: '以背甲撞敌，力道沉钝。' },
    ],
    evolveTo: null, evolveLevel: 0,
    evolveCost: [],
    eggFrom: 'mat_shougu',
    desc: '背覆灰色石甲的犰狳，天性愚钝，忠心不二。',
    lore: '石甲犰资质有限，终其一生也不过三星。可它护主时从不退半步——这一点，许多天赋绝佳的灵兽都做不到。',
  },
  {
    id: 'bst_qingmulou', name: '青木鹿', tier: 1, minRealm: 3, role: 'support',
    base: { hp: 82, atk: 6, def: 4, spd: 12 },
    growth: { hp: 4.9, atk: 0.3, def: 0.2, spd: 0.24 },
    starCap: { base: 3, max: 5 },
    skills: [
      { id: 'bsk_lu_jiao', name: '木灵角', kind: 'damage', power: 1.05, unlockIntimacy: 0, desc: '以生着藤蔓的鹿角顶撞。' },
      { id: 'bsk_lu_chun', name: '春回', kind: 'heal', power: 0.16, unlockIntimacy: 15, desc: '鹿鸣三声，草木回春，伤痛亦减。' },
    ],
    evolveTo: null, evolveLevel: 0,
    evolveCost: [],
    eggFrom: 'mat_shougu',
    desc: '角上缠青藤的林鹿，走过之处草色转深。',
    lore: '青木鹿不食带露的草，只食被日头晒过一晌的。山中人说，这是它把晨露留给别人的缘故。',
  },

  // ==================================================================
  // tier 2 —— 筑基期：妖丹初凝，已通人言
  // ==================================================================
  {
    id: 'bst_youyanhu', name: '幽炎狐', tier: 2, minRealm: 9, role: 'attack',
    base: { hp: 780, atk: 62, def: 38, spd: 20 },
    growth: { hp: 47, atk: 3.1, def: 1.9, spd: 0.4 },
    starCap: { base: 4, max: 5 },
    skills: [
      { id: 'bsk_fox_youyan', name: '幽炎噬', kind: 'damage', power: 1.5, unlockIntimacy: 0, desc: '幽蓝狐火无温，噬人神魂。' },
      { id: 'bsk_fox_fen', name: '焚心', kind: 'debuff', power: 0.18, unlockIntimacy: 30, desc: '火自心生，乱其气机，销其锐气。' },
    ],
    evolveTo: 'bst_liuwei_yanhu', evolveLevel: 35,
    evolveCost: [{ id: 'mat_yaoxue', count: 15 }],
    eggFrom: 'mat_yaoxue',
    desc: '尾火转幽蓝的炎狐，已能人言。',
    lore: '赤炎狐吞下第一枚妖丹的那夜，尾火由赤转幽。族中老狐说：从今往后，你烧的不是草木，是别人的道行。',
  },
  {
    id: 'bst_panjia_linggui', name: '磐甲灵龟', tier: 2, minRealm: 9, role: 'tank',
    base: { hp: 1080, atk: 42, def: 62, spd: 15 },
    growth: { hp: 65, atk: 2.1, def: 3.1, spd: 0.3 },
    starCap: { base: 4, max: 5 },
    skills: [
      { id: 'bsk_gui_pan', name: '磐甲护主', kind: 'guard', power: 1, unlockIntimacy: 0, desc: '甲化磐石，替主人挡下必死之击。' },
      { id: 'bsk_gui_ya', name: '咬碎', kind: 'damage', power: 1.2, unlockIntimacy: 25, desc: '甲坚而喙利，一口咬碎骨。' },
      { id: 'bsk_gui_ning', name: '凝甲', kind: 'buff', power: 0.2, unlockIntimacy: 50, desc: '甲上玄纹流转，坚不可摧。' },
    ],
    evolveTo: 'bst_taiyin_xuangui', evolveLevel: 38,
    evolveCost: [{ id: 'mat_yaoxue', count: 20 }],
    eggFrom: 'mat_yaoxue',
    desc: '甲纹如磐石纹路的巨龟，卧地即成一座小山。',
    lore: '磐甲灵龟每十年只长一圈甲纹。修士算过：从玄水龟长到磐甲，恰好要走完凡人一生的光阴。',
  },
  {
    id: 'bst_heilinjiao', name: '黑鳞蛟', tier: 2, minRealm: 10, role: 'attack',
    base: { hp: 860, atk: 70, def: 40, spd: 18 },
    growth: { hp: 51, atk: 3.5, def: 2.0, spd: 0.36 },
    starCap: { base: 4, max: 5 },
    skills: [
      { id: 'bsk_jiao_lin', name: '黑鳞爪', kind: 'damage', power: 1.4, unlockIntimacy: 0, desc: '爪覆黑鳞，一抓裂石。' },
      { id: 'bsk_jiao_shui', name: '蛟水漫', kind: 'debuff', power: 0.2, unlockIntimacy: 30, desc: '吐水成涡，缠住敌手手脚。' },
      { id: 'bsk_jiao_tun', name: '吞云', kind: 'damage', power: 1.6, unlockIntimacy: 55, desc: '张口吞云吐雾，声势骇人。' },
    ],
    evolveTo: null, evolveLevel: 0,
    evolveCost: [],
    eggFrom: 'mat_yaoxue',
    desc: '黑鳞覆体、头生短角的幼蛟，尚未化龙。',
    lore: '黑鳞蛟性傲，宁可战死也不肯伏低。养蛟的修士都说：与它相处，先要学会挨它的冷眼。',
  },
  {
    id: 'bst_yusui_lu', name: '玉髓灵鹿', tier: 2, minRealm: 11, role: 'support',
    base: { hp: 700, atk: 44, def: 45, spd: 21 },
    growth: { hp: 42, atk: 2.2, def: 2.3, spd: 0.42 },
    starCap: { base: 3, max: 4 },
    skills: [
      { id: 'bsk_lu_yu', name: '玉髓回春', kind: 'heal', power: 0.2, unlockIntimacy: 0, desc: '鹿角玉髓滴落，伤处立时生肌。' },
      { id: 'bsk_lu_hu', name: '灵鹿庇佑', kind: 'buff', power: 0.18, unlockIntimacy: 25, desc: '灵光笼身，护住主人气机。' },
    ],
    evolveTo: null, evolveLevel: 0,
    evolveCost: [],
    eggFrom: 'mat_yaoxue',
    desc: '角如美玉的林鹿，髓光可疗沉疴。',
    lore: '玉髓灵鹿的角髓百年才凝一滴。它肯为谁滴下，便是把这一百年交了给谁。',
  },

  // ==================================================================
  // tier 3 —— 金丹期：妖将之姿，可敌一城
  // ==================================================================
  {
    id: 'bst_liuwei_yanhu', name: '六尾炎狐', tier: 3, minRealm: 12, role: 'attack',
    base: { hp: 7200, atk: 430, def: 300, spd: 31 },
    growth: { hp: 430, atk: 21.5, def: 15, spd: 0.62 },
    starCap: { base: 4, max: 5 },
    skills: [
      { id: 'bsk_fox_liu', name: '六尾扫', kind: 'damage', power: 1.55, unlockIntimacy: 0, desc: '六尾齐扫，火浪成墙。' },
      { id: 'bsk_fox_lin', name: '业火缠身', kind: 'debuff', power: 0.22, unlockIntimacy: 25, desc: '业火难灭，灼其气海。' },
      { id: 'bsk_fox_liao', name: '狐火疗身', kind: 'heal', power: 0.12, unlockIntimacy: 60, desc: '以火引生，焚尽伤处秽气。' },
    ],
    evolveTo: 'bst_jiuwei_tianhu', evolveLevel: 50,
    evolveCost: [{ id: 'mat_yaodan', count: 10 }],
    eggFrom: 'mat_yaodan',
    desc: '六尾齐张的炎狐，火光照夜如昼。',
    lore: '狐每增一尾，便要忘掉一件前尘。到了六尾，它已记不得自己最初为何要修行——只记得还有一个主人要护。',
  },
  {
    id: 'bst_qingluan', name: '青鸾', tier: 3, minRealm: 12, role: 'support',
    base: { hp: 6800, atk: 340, def: 330, spd: 34 },
    growth: { hp: 410, atk: 17, def: 16.5, spd: 0.68 },
    starCap: { base: 4, max: 5 },
    skills: [
      { id: 'bsk_luan_wu', name: '青鸾起舞', kind: 'buff', power: 0.18, unlockIntimacy: 0, desc: '翩然起舞，主人周身气机通畅。' },
      { id: 'bsk_luan_ming', name: '清鸣愈伤', kind: 'heal', power: 0.2, unlockIntimacy: 25, desc: '一声清鸣，涤荡伤痛。' },
      { id: 'bsk_luan_feng', name: '罡风刃', kind: 'damage', power: 1.3, unlockIntimacy: 45, desc: '羽翼扇动，风成利刃。' },
    ],
    evolveTo: 'bst_jiutian_xuanluan', evolveLevel: 40,
    evolveCost: [{ id: 'mat_yaodan', count: 8 }],
    eggFrom: 'mat_yaodan',
    desc: '青羽长尾的鸾鸟，鸣声可清心涤尘。',
    lore: '青鸾非梧桐不栖，非醴泉不饮。它落在谁肩头，便是把整片山林都看轻了。',
  },
  {
    id: 'bst_zidian_diao', name: '紫电貂', tier: 3, minRealm: 13, role: 'attack',
    base: { hp: 6200, atk: 470, def: 260, spd: 38 },
    growth: { hp: 370, atk: 23.5, def: 13, spd: 0.76 },
    starCap: { base: 4, max: 5 },
    skills: [
      { id: 'bsk_diao_zi', name: '紫电穿', kind: 'damage', power: 1.45, unlockIntimacy: 0, desc: '身化紫电，一穿而过。' },
      { id: 'bsk_diao_lei', name: '电光火石', kind: 'buff', power: 0.2, unlockIntimacy: 30, desc: '毛尖爆起电芒，速度暴涨。' },
    ],
    evolveTo: null, evolveLevel: 0,
    evolveCost: [],
    eggFrom: 'mat_yaodan',
    desc: '通体紫毛的貂，奔行时只见电光不见影。',
    lore: '紫电貂好动，一日不奔跑便会烦躁。若要养它，得先有一座跑得开的山。',
  },
  {
    id: 'bst_bishui_xi', name: '碧水犀', tier: 3, minRealm: 13, role: 'tank',
    base: { hp: 9600, atk: 330, def: 400, spd: 25 },
    growth: { hp: 580, atk: 16.5, def: 20, spd: 0.5 },
    starCap: { base: 4, max: 5 },
    skills: [
      { id: 'bsk_xi_shui', name: '碧水护主', kind: 'guard', power: 1, unlockIntimacy: 0, desc: '引水成幕，替主人挡下致命一击。' },
      { id: 'bsk_xi_chong', name: '蛮犀撞', kind: 'damage', power: 1.3, unlockIntimacy: 20, desc: '低头猛撞，水幕随行。' },
      { id: 'bsk_xi_lin', name: '水幕', kind: 'buff', power: 0.2, unlockIntimacy: 50, desc: '水幕重重，刀剑难透。' },
    ],
    evolveTo: null, evolveLevel: 0,
    evolveCost: [],
    eggFrom: 'mat_yaodan',
    desc: '皮厚如革的碧犀，行于沼泽不带泥。',
    lore: '碧水犀一生只认一处水塘。若塘枯了，它便守在原地不动，直到雨来，或者直到自己倒下。',
  },

  // ==================================================================
  // tier 4 —— 元婴期：上古血脉，一啸动山河
  // ==================================================================
  {
    id: 'bst_jiuwei_tianhu', name: '九尾天狐', tier: 4, minRealm: 15, role: 'attack',
    base: { hp: 32000, atk: 2600, def: 1600, spd: 48 },
    growth: { hp: 1900, atk: 128, def: 80, spd: 0.95 },
    starCap: { base: 5, max: 5 },
    skills: [
      { id: 'bsk_fox_jiu', name: '九尾天炎', kind: 'damage', power: 1.8, unlockIntimacy: 0, desc: '九尾尽张，天火倾落。' },
      { id: 'bsk_fox_huan', name: '幻境惑心', kind: 'debuff', power: 0.25, unlockIntimacy: 30, desc: '一眸成幻，敌不知身在何处。' },
      { id: 'bsk_fox_sheng', name: '九尾庇佑', kind: 'buff', power: 0.2, unlockIntimacy: 55, desc: '九尾环身，护主人于其中。' },
    ],
    evolveTo: null, evolveLevel: 0,
    evolveCost: [],
    eggFrom: 'mat_neidan',
    desc: '九尾如焰的天狐，眸中映着千年月色。',
    lore: '天狐九尾，已近仙途。它若开口，说的都是几百年前的旧事；你若问它为何还留人间，它只会看你一眼，不说话。',
  },
  {
    id: 'bst_taiyin_xuangui', name: '太阴玄龟', tier: 4, minRealm: 15, role: 'tank',
    base: { hp: 52000, atk: 1900, def: 2500, spd: 36 },
    growth: { hp: 3100, atk: 93, def: 125, spd: 0.7 },
    starCap: { base: 5, max: 5 },
    skills: [
      { id: 'bsk_gui_tai', name: '太阴庇佑', kind: 'guard', power: 1, unlockIntimacy: 0, desc: '太阴之力笼身，代主受死。' },
      { id: 'bsk_gui_han', name: '太阴寒潮', kind: 'damage', power: 1.35, unlockIntimacy: 20, desc: '张口吐出太阴寒气，万物冻结。' },
      { id: 'bsk_gui_xi', name: '吐纳回元', kind: 'heal', power: 0.15, unlockIntimacy: 45, desc: '引月华入体，缓缓回复。' },
    ],
    evolveTo: 'bst_xuanwu_shengui', evolveLevel: 55,
    evolveCost: [{ id: 'mat_neidan', count: 6 }],
    eggFrom: 'mat_neidan',
    desc: '甲映月华的巨龟，夜行时通体生寒。',
    lore: '太阴玄龟只在月夜浮水。它背甲上的纹路会随月相盈亏变化，观之可知潮汐，亦可卜吉凶。',
  },
  {
    id: 'bst_baize', name: '白泽', tier: 4, minRealm: 16, role: 'support',
    base: { hp: 28000, atk: 1800, def: 2000, spd: 50 },
    growth: { hp: 1700, atk: 88, def: 100, spd: 1.0 },
    starCap: { base: 5, max: 5 },
    skills: [
      { id: 'bsk_ze_zhi', name: '知万物', kind: 'buff', power: 0.24, unlockIntimacy: 0, desc: '通晓万物情状，指点主人破绽。' },
      { id: 'bsk_ze_you', name: '白泽庇佑', kind: 'guard', power: 1, unlockIntimacy: 40, desc: '祥瑞之气化盾，替主人抵命。' },
      { id: 'bsk_ze_liao', name: '祥瑞疗伤', kind: 'heal', power: 0.22, unlockIntimacy: 20, desc: '口吐祥光，伤处自愈。' },
    ],
    evolveTo: null, evolveLevel: 0,
    evolveCost: [],
    eggFrom: 'mat_neidan',
    desc: '通体雪白、知万物之名的瑞兽。',
    lore: '白泽知天下万物之名，却唯独不肯说自己的寿数。有人问过，它答："知道名字的东西，才会死。"',
  },
  {
    id: 'bst_xueyi_fuwang', name: '血翼蝠王', tier: 4, minRealm: 17, role: 'attack',
    base: { hp: 26000, atk: 3000, def: 1500, spd: 54 },
    growth: { hp: 1550, atk: 148, def: 75, spd: 1.05 },
    starCap: { base: 4, max: 5 },
    skills: [
      { id: 'bsk_fu_xi', name: '血翼吸血', kind: 'damage', power: 1.5, unlockIntimacy: 0, desc: '翼骨如镰，掠过即吸血。' },
      { id: 'bsk_fu_hao', name: '蝠王啸', kind: 'debuff', power: 0.22, unlockIntimacy: 25, desc: '尖啸乱神，令敌手心虚气浮。' },
      { id: 'bsk_fu_ying', name: '血影', kind: 'buff', power: 0.22, unlockIntimacy: 50, desc: '化影而行，快得无从捉摸。' },
    ],
    evolveTo: null, evolveLevel: 0,
    evolveCost: [],
    eggFrom: null,
    desc: '双翼染血如黄昏的蝠王，号令群蝠。',
    lore: '血翼蝠王曾是被逐出师门的邪修所化。至今它仍怕一样东西——旧师门用的那柄剑。',
  },

  // ==================================================================
  // tier 5 —— 化神以上：神兽血脉，与天地同寿
  // ==================================================================
  {
    id: 'bst_xuanwu_shengui', name: '玄武神龟', tier: 5, minRealm: 18, role: 'tank',
    base: { hp: 260000, atk: 9000, def: 12500, spd: 46 },
    growth: { hp: 15500, atk: 450, def: 620, spd: 0.9 },
    starCap: { base: 5, max: 5 },
    skills: [
      { id: 'bsk_gui_xuan', name: '玄武镇岳', kind: 'guard', power: 1, unlockIntimacy: 0, desc: '玄武之躯镇于身前，万法不侵，代主赴死。' },
      { id: 'bsk_gui_zhen', name: '真武法相', kind: 'buff', power: 0.28, unlockIntimacy: 35, desc: '现真武法相，攻守俱增。' },
      { id: 'bsk_gui_ling', name: '灵龟噬海', kind: 'damage', power: 1.5, unlockIntimacy: 20, desc: '张口吞海，水漫四野。' },
    ],
    evolveTo: null, evolveLevel: 0,
    evolveCost: [],
    eggFrom: null,
    desc: '背负河图洛书的玄武，居北方，主水，主死。',
    lore: '玄武不是灵兽，是一方位格。它卧在那里，北方的天便不会塌。养得起它的修士，已不能算修士了。',
  },
  {
    id: 'bst_jiutian_xuanluan', name: '九天玄鸾', tier: 5, minRealm: 19, role: 'support',
    base: { hp: 150000, atk: 11000, def: 8200, spd: 66 },
    growth: { hp: 9000, atk: 545, def: 410, spd: 1.3 },
    starCap: { base: 5, max: 5 },
    skills: [
      { id: 'bsk_luan_jiu', name: '九天清鸣', kind: 'heal', power: 0.25, unlockIntimacy: 0, desc: '一声鸣彻九天，伤者立愈。' },
      { id: 'bsk_luan_xiang', name: '祥瑞加身', kind: 'buff', power: 0.25, unlockIntimacy: 30, desc: '鸾光加身，百邪不侵。' },
      { id: 'bsk_luan_mie', name: '玄鸾天火', kind: 'damage', power: 1.6, unlockIntimacy: 50, desc: '振翅而起，天火随行。' },
    ],
    evolveTo: null, evolveLevel: 0,
    evolveCost: [],
    eggFrom: null,
    desc: '九霄之上的玄鸾，一鸣天下皆春。',
    lore: '玄鸾出，则天下安。它上一次现世是三百年前，那一年，人间没有兵戈。',
  },
  {
    id: 'bst_zhulong_youyi', name: '烛龙幼裔', tier: 5, minRealm: 19, role: 'attack',
    base: { hp: 180000, atk: 15000, def: 8800, spd: 60 },
    growth: { hp: 10800, atk: 745, def: 440, spd: 1.18 },
    starCap: { base: 5, max: 5 },
    skills: [
      { id: 'bsk_zhulong_zhu', name: '烛龙吐焰', kind: 'damage', power: 1.75, unlockIntimacy: 0, desc: '衔烛之龙吐息，焚山煮海。' },
      { id: 'bsk_zhulong_ming', name: '烛照九幽', kind: 'debuff', power: 0.25, unlockIntimacy: 30, desc: '一瞳光明照彻九幽，敌无所遁形。' },
      { id: 'bsk_zhulong_nu', name: '龙怒', kind: 'buff', power: 0.28, unlockIntimacy: 55, desc: '龙怒之时，风云变色。' },
    ],
    evolveTo: null, evolveLevel: 0,
    evolveCost: [],
    eggFrom: null,
    desc: '烛龙血脉的幼裔，睁眼为昼，闭眼为夜。',
    lore: '烛龙幼裔睁眼时，方圆百里的天会亮上半分。它并不懂这意味着什么，只觉得主人笑的时候，自己也想睁着眼。',
  },
  {
    id: 'bst_qilin_ruishou', name: '麒麟瑞兽', tier: 5, minRealm: 20, role: 'support',
    base: { hp: 170000, atk: 12500, def: 9500, spd: 62 },
    growth: { hp: 10200, atk: 620, def: 475, spd: 1.22 },
    starCap: { base: 5, max: 5 },
    skills: [
      { id: 'bsk_qilin_rui', name: '麒麟祥瑞', kind: 'heal', power: 0.25, unlockIntimacy: 0, desc: '足踏祥云，瑞气所至，伤无不愈。' },
      { id: 'bsk_qilin_you', name: '瑞兽护主', kind: 'guard', power: 1, unlockIntimacy: 30, desc: '以身承劫，代主人赴死一次。' },
      { id: 'bsk_qilin_wei', name: '圣威加身', kind: 'buff', power: 0.3, unlockIntimacy: 50, desc: '仁兽之威，攻守兼备，群邪退避。' },
    ],
    evolveTo: null, evolveLevel: 0,
    evolveCost: [],
    eggFrom: null,
    desc: '仁而不杀、足不践草的麒麟瑞兽。',
    lore: '麒麟不履生虫，不折生草。它一生不杀一物，却愿意为主人挡下所有杀招。',
  },
];

// ==================== 技能索引 ====================
/**
 * 按 id 索引的技能表，便于战斗层直接用 id 查表。
 * unlockStage 缺省视为 0（初形即解锁）；进化后 stage 提升，可解锁更高阶技能。
 */
export const BEAST_SKILLS = (() => {
  const map = {};
  for (const b of BEASTS) {
    for (const sk of b.skills || []) {
      map[sk.id] = {
        ...sk,
        beastId: b.id,
        role: b.role,
        unlockStage: sk.unlockStage ?? 0,
        unlockIntimacy: sk.unlockIntimacy ?? 0,
      };
    }
  }
  return map;
})();

// ==================== 访问器 ====================

/** 按 id 取灵兽定义 */
export function beastById(id) {
  return BEASTS.find((b) => b.id === id) || null;
}

/** 取某一 tier 的全部灵兽 */
export function beastsByTier(tier) {
  return BEASTS.filter((b) => b.tier === tier);
}

/** 取某一 role 的全部灵兽 */
export function beastsByRole(role) {
  return BEASTS.filter((b) => b.role === role);
}

/**
 * 可孵化（有蛋来源）的灵兽 —— **只含进化链链首与不在链上的独立物种**。
 *
 * 高阶形态（幽炎狐 / 六尾炎狐 / 九尾天狐 / 磐甲灵龟 / 太阴玄龟 / 青鸾）虽然也带 eggFrom，
 * 但刻意不列为可孵化：它们该靠进化得到，否则三条进化链会被"花灵材直接孵高阶形态"架空。
 * eggFrom 对它们仍保留原意——只作为"这一族用什么材料"的标注（如放生返还口径）。
 * 将来若要开放高阶蛋，改这里，但请一并想清楚进化链还剩什么意义。
 *
 * eggFrom 为 null 的（血翼蝠王 / 玄武神龟 / 九天玄鸾 / 烛龙幼裔 / 麒麟瑞兽）
 * 只能靠秘境捕捉或宗门宝库兑换获得，永远不进孵化池。
 */
export function hatchableBeasts() {
  return BEASTS.filter((b) => !!b.eggFrom && evolutionDepth(b.id) === 0);
}

/**
 * 以灵材孵化的消耗与时长，按灵兽 tier 分档。
 * 材料 id 不写在这里 —— 统一取该物种自己的 eggFrom，避免两处映射打架；
 * 这里只管"要几份、孵多久"。数量与「链首→二阶」的进化消耗（兽骨 ×20）同一量级，
 * 让玩家对养一只灵兽的成本有个稳定感知。seconds 单位是秒，3600 = 1 时辰。
 */
export const HATCH_COST = {
  1: { count: 20, seconds: 3600 },    //  兽骨 ×20，1 时辰
  2: { count: 15, seconds: 7200 },    //  妖血 ×15，2 时辰
  3: { count: 10, seconds: 10800 },   //  妖丹 ×10，3 时辰
  4: { count: 6, seconds: 14400 },    //  内丹 ×6，4 时辰
  5: { count: 6, seconds: 14400 },    //  内丹 ×6，4 时辰
};

/** 该物种的孵化消耗（材料取 eggFrom，数量与时长取 tier 档）；不可孵化返回 null */
export function hatchCostOf(id) {
  const base = beastById(id);
  if (!base || !base.eggFrom) return null;
  const c = HATCH_COST[base.tier] || HATCH_COST[1];
  return { id: base.eggFrom, count: c.count, seconds: c.seconds };
}

/** 该灵兽在进化链上的阶数（链首为 0）。落单的灵兽恒为 0。 */
export function evolutionDepth(id) {
  const chain = evolutionChain(id);
  const i = chain.findIndex((b) => b.id === id);
  return i < 0 ? 0 : i;
}

/** 该灵兽所在进化链的全部形态（含自身，按阶数排序） */
export function evolutionChain(id) {
  let cur = beastById(id);
  if (!cur) return [];
  // 先回溯到链首
  let head = cur;
  const seen = new Set([head.id]);
  for (;;) {
    const prev = BEASTS.find((b) => b.evolveTo === head.id);
    if (!prev || seen.has(prev.id)) break;
    head = prev;
    seen.add(head.id);
  }
  const chain = [];
  cur = head;
  for (;;) {
    if (!cur) break;
    chain.push(cur);
    if (!cur.evolveTo) break;
    const next = beastById(cur.evolveTo);
    if (!next || chain.some((c) => c.id === next.id)) break;
    cur = next;
  }
  return chain;
}
