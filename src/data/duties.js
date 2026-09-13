/**
 * 本世功课（V6.0「功课」，V5.0 的「劫数」扩展而来）。
 *
 * ============ 这一池子东西是干什么的 ============
 *
 * V5.0 每世指派 1 条劫数，把"5 世是同一章的 5 次重复"变成了"每世独立一章"。
 * 但它漏掉了一半：**一条劫数扛不起"带新玩家认路"的职责**——
 * 一世只被推着走一个系统，而炼丹、炼器、宗门、道侣、试炼塔这些
 * 玩家可能整局都不会点开。
 *
 * V6.0 分两层：
 *   - **第一世**走固定主线（八幕 20 门必做 + 余课任选 2 项），把玩法挨个推到玩家面前；
 *   - **第 2 世起**每世抽 3 门，保留"每世不同"。
 *
 * ============ 分幕依据：境界段的耗时占比，不是玩法解锁境界 ============
 *
 * 玩法解锁全挤在炼气/筑基（炼丹 3、试炼塔 5、炼器 6、宗门 9），
 * 按它分幕必然把功课全堆在时间占比最小的那一段。
 * 实际耗时分布（tools/out/realms.json，零加成基线 12.11 天）：
 *
 *   炼气 1.7% │ 筑基 3.3% │ 金丹 5.9% │ 元婴 10.8% │ 化神 18.7%
 *   │ 炼虚合体 21.8% │ 大乘 16.4% │ 渡劫 21.4%
 *
 * 渡劫期单独一境就吃掉 21.4%，比炼气+筑基+金丹+元婴+化神加起来还多。
 * 功课必须按这个比例铺开，否则玩家一小时内清空主线，之后 60% 的时长全无引导。
 *
 * ============ 硬约束（违反了会毁掉轮回） ============
 *
 * 1. **必须能在这一世之内做完**。抽到做不了的功课时给改派机会，绝不允许卡死。
 * 2. **不得与立场冲突**。宗门功课**只能在余课池**——`canJoin` 硬拒邪道，
 *    一旦进必做主线，邪道玩家就永远飞升不了（见 docs/架构规范.md §2.1 约束 2）。
 * 3. **进度源必须在轮回时被重置**（或用跨世基线做差）。
 *    所以不做"道侣羁绊"类——`companions.bond` 跨世保留，老兵一开局就自动完成。
 * 4. **"种类"优先于"数量"**。写成"做过 N 次"会被反复刷同一种低级内容冲量。
 *
 * ============ 字段 ============
 *
 *   id        唯一标识
 *   act       所属幕 1..8；0 = 余课池
 *   kind      进度口径，见 docs/架构规范.md §2.1 的进度模型表
 *   target    kind 相关的参数；无参数为 null
 *   need      需要达到的数量（"种类"型即种类数）
 *   firstOnly 仅第一世（进度源跨世保留，老兵做不动）→ 不进后世抽样池
 *   name      四字以内的题名
 *   desc      题面：一句古卷风格的话
 *   hint      指路：告诉玩家该去玩哪个系统
 *
 * 进度一律由 systems/duty.js **从 state 拉取**，本文件不含任何逻辑。
 */

export const DUTY_KINDS = [
  // V5.0 遗留（旧档迁移后仍要能算）
  'combat', 'explore', 'beast', 'cave', 'cultivate',
  // V6.0 新增
  'breakthrough', 'slayKinds', 'encounterKinds', 'pillKinds', 'forgeKinds', 'shopKinds',
  'tower', 'streak', 'equipQuality', 'equipOps', 'companionMeets',
  'codexDelta', 'achDelta', 'sectJoin', 'sectRank', 'recipeCount',
];

export const DUTY_KIND_NAMES = {
  combat: '斩敌', explore: '游历', beast: '御兽', cave: '营造', cultivate: '参悟',
  breakthrough: '破境',
  slayKinds: '斩敌', encounterKinds: '游历', pillKinds: '丹道', forgeKinds: '器道',
  shopKinds: '行商', tower: '试炼', streak: '斗法', equipQuality: '器用',
  equipOps: '器用', companionMeets: '道侣', codexDelta: '图鉴', achDelta: '成就',
  sectJoin: '宗门', sectRank: '宗门', recipeCount: '参悟',
};

/**
 * 八幕。minRealm 是解锁境界索引（realms.js 的 index）。
 * 幕只决定"何时展示"，不阻塞完成——升到门槛就显示，没做完的留在列表里可回头补。
 */
export const ACTS = [
  { act: 1, name: '立身', minRealm: 0,  desc: '先站住。' },
  { act: 2, name: '初涉', minRealm: 9,  desc: '路开始分岔。' },
  { act: 3, name: '砺锋', minRealm: 12, desc: '光有修为不够。' },
  { act: 4, name: '入世', minRealm: 15, desc: '一个人走不到尽头。' },
  { act: 5, name: '深耕', minRealm: 18, desc: '把一件事做到底。' },
  { act: 6, name: '登堂', minRealm: 21, desc: '看看自己走了多远。' },
  { act: 7, name: '极境', minRealm: 23, desc: '再往上，人少了。' },
  { act: 8, name: '证道', minRealm: 24, desc: '最后一程。' },
];

export function actByNumber(act) {
  return ACTS.find((a) => a.act === act) || null;
}

/** 当前境界索引对应的最高已解锁幕号 */
export function actForRealm(realmIndex) {
  let n = 1;
  for (const a of ACTS) if ((realmIndex | 0) >= a.minRealm) n = a.act;
  return n;
}

export const DUTIES = [
  // ==================================================================
  // 幕一 · 立身（炼气 0-8，占总时长 1.7%）
  // ==================================================================
  {
    id: 'duty_break_pojing', act: 1, kind: 'breakthrough', target: null, need: 3,
    name: '破境',
    desc: '路是一阶一阶走的。先走三级。',
    hint: '冲击境界，累计突破三次即可。',
  },
  {
    id: 'duty_beast_jieban', act: 1, kind: 'beast', target: 'count', need: 1,
    name: '结伴',
    desc: '这一世，你身边该有个活物。',
    hint: '捕捉或孵化任意一只灵兽。',
  },

  // ==================================================================
  // 幕二 · 初涉（筑基 9-11，累计 5.0%）
  // ==================================================================
  {
    id: 'duty_tech_rumen', act: 2, kind: 'cultivate', target: 'level', need: 2,
    name: '参悟',
    desc: '一门功法，参到第二重，才算真的开始。',
    hint: '在「功法」页参悟任意功法至第 2 重。',
  },
  {
    id: 'duty_pill_sanzhong', act: 2, kind: 'pillKinds', target: null, need: 3,
    name: '丹道',
    desc: '三张方子，三种火候。同一炉火，炼不出同一味药。',
    hint: '在「炼丹」页炼成三种不同的丹药（早期可悟：聚气丹 / 回气丹 / 疗伤丹）。',
  },

  // ==================================================================
  // 幕三 · 砺锋（金丹 12-14，累计 11.0%）
  // ==================================================================
  {
    id: 'duty_cave_anshen', act: 3, kind: 'cave', target: 'any', need: 5,
    name: '安身',
    desc: '总要有个遮风的地方。这一次，要像个样子。',
    hint: '将洞府中任意一座建筑升到 5 级。',
  },
  {
    id: 'duty_slay_liuzhong', act: 3, kind: 'slayKinds', target: null, need: 6,
    name: '试锋',
    desc: '剑在鞘中久了会锈。这一世，它需见几次血——不同的血。',
    hint: '外出游历或闯试炼塔，击败六种不同的敌人。',
  },
  {
    id: 'duty_tower_ershi', act: 3, kind: 'tower', target: null, need: 20,
    name: '登塔',
    desc: '塔是一层一层爬的。爬到哪里，你自己知道。',
    hint: '在「试炼」页挑战并突破至第 20 层。',
  },

  // ==================================================================
  // 幕四 · 入世（元婴 15-17，累计 21.8%）
  // ==================================================================
  {
    id: 'duty_comp_tongxing', act: 4, kind: 'companionMeets', target: null, need: 1,
    firstOnly: true,
    name: '同行',
    desc: '走得久了，总会遇见同路的人。',
    hint: '在「道侣」页寻访并结识一位道侣。',
  },
  {
    id: 'duty_explore_bajian', act: 4, kind: 'encounterKinds', target: null, need: 8,
    name: '初识',
    desc: '路不在地图上，在别人嘴里。多听八种说法。',
    hint: '静候奇遇，经历八种不同的奇遇。',
  },
  {
    id: 'duty_equip_lingpin', act: 4, kind: 'equipQuality', target: 'ling', need: 1,
    name: '铸灵',
    desc: '一身凡铁，压不住你这一世的修为。',
    hint: '炼器或坊市皆可得——拥有一件灵品及以上品阶的装备。',
  },

  // ==================================================================
  // 幕五 · 深耕（化神 18-20，累计 40.4%）
  // ==================================================================
  {
    id: 'duty_forge_sanzhong', act: 5, kind: 'forgeKinds', target: null, need: 3,
    name: '铸器',
    desc: '三张图纸，三次开炉。同一锤子，打不出同一样东西。',
    hint: '在「炼器」页炼成三件不同的器物（早期图纸：青纹铁剑 / 粗布道袍 / 铜铃符）。',
  },
  {
    id: 'duty_cave_dongtian', act: 5, kind: 'cave', target: 'cave', need: 7,
    name: '洞天',
    desc: '到这一世，你的洞府该有个名字了。',
    hint: '将洞府本身升到 7 级。',
  },
  {
    id: 'duty_tech_simen', act: 5, kind: 'cultivate', target: 'count', need: 4,
    name: '百艺',
    desc: '一条路走到黑，也是一种走法。但先看看别的路。',
    hint: '在「功法」页习得四门功法。',
  },

  // ==================================================================
  // 幕六 · 登堂（炼虚-合体 21-22，累计 62.2%）
  // ==================================================================
  {
    id: 'duty_tower_sishi', act: 6, kind: 'tower', target: null, need: 40,
    name: '登高',
    desc: '上面还有多少层，你从来没数过。',
    hint: '在「试炼」页挑战并突破至第 40 层。',
  },
  {
    id: 'duty_codex_sishi', act: 6, kind: 'codexDelta', target: null, need: 40,
    firstOnly: true,
    name: '集录',
    desc: '见过的，总该记下来。',
    hint: '本世新收录图鉴四十条（图鉴页可见本世进度）。',
  },
  {
    id: 'duty_beast_huaxing', act: 6, kind: 'beast', target: 'stage', need: 1,
    name: '化形',
    desc: '它若能蜕一次，你便知道这些年没白喂。',
    hint: '将任意一只灵兽进化一次（需先养到进化等级并备齐灵材）。',
  },

  // ==================================================================
  // 幕七 · 极境（大乘 23，累计 78.6%）
  // ==================================================================
  {
    id: 'duty_beast_sizhi', act: 7, kind: 'beast', target: 'count', need: 4,
    name: '御灵',
    desc: '有人养兽是为用，有人是为看着。你是哪种。',
    hint: '同时拥有四只灵兽。',
  },
  {
    id: 'duty_tech_tongxuan', act: 7, kind: 'cultivate', target: 'level', need: 5,
    name: '通玄',
    desc: '第五重是个坎。过了它，功法才真正被你拿走。',
    hint: '参悟任意功法至第 5 重。',
  },

  // ==================================================================
  // 幕八 · 证道（渡劫 24，累计 100%）
  // ==================================================================
  {
    id: 'duty_equip_xianpin', act: 8, kind: 'equipQuality', target: 'xian', need: 1,
    name: '铸圣',
    desc: '走到这一步，你身上总该有一件配得上你的东西。',
    hint: '炼器或坊市皆可得——拥有一件仙品及以上品阶的装备。',
  },
  {
    id: 'duty_ach_shier', act: 8, kind: 'achDelta', target: null, need: 12,
    firstOnly: true,
    name: '立名',
    desc: '有些事做过便算了。有些事，天地替你记着。',
    hint: '本世新解锁十二个成就（成就页可见本世进度）。',
  },

  // ==================================================================
  // 余课池（act: 0）—— 任选 2 项，覆盖主线没碰到的玩法
  //
  // ⚠ 宗门两门必须留在这里，绝不能进必做主线：
  //   canJoin 硬拒邪道，设为必做会让邪道玩家永久无法飞升。
  //   它们对邪道只是"灰显 + 指出去路"，不是从列表里消失。
  // ==================================================================
  {
    id: 'duty_sect_baishan', act: 0, kind: 'sectJoin', target: null, need: 1,
    needsStance: true,
    name: '拜山门',
    desc: '一个人走，走得快。一群人走，走得远。',
    hint: '境界达筑基（第九境）后，在「宗门」页拜入任意宗门。',
  },
  {
    id: 'duty_sect_jinzhen', act: 0, kind: 'sectRank', target: null, need: 2,
    needsStance: true,
    name: '晋真传',
    desc: '门前站着的和门里坐着的，是两回事。',
    hint: '积攒宗门贡献，晋升至真传弟子（累计 1200 贡献）。',
  },
  {
    id: 'duty_shop_hangshang', act: 0, kind: 'shopKinds', target: null, need: 3,
    name: '行商',
    desc: '修士也要吃饭。灵石花出去才是灵石。',
    hint: '在「坊市」买入三种不同的物品。',
  },
  {
    id: 'duty_equip_zhaojia', act: 0, kind: 'equipOps', target: null, need: 3,
    name: '着甲',
    desc: '同一身皮囊，换三副甲。',
    hint: '在「背包」页更换装备三次。',
  },
  {
    id: 'duty_streak_lianjie', act: 0, kind: 'streak', target: null, need: 10,
    name: '连捷',
    desc: '赢一次是运气。赢十次，是本事。',
    hint: '连续取胜十场（战败即清零，「试炼」页可见当前连胜）。',
  },
  {
    id: 'duty_recipe_guangji', act: 0, kind: 'recipeCount', target: 'alchemy', need: 6,
    name: '广记',
    desc: '知道的方子越多，手上能出的东西越多。',
    hint: '在「炼丹」页参悟六张丹方。',
  },
  {
    id: 'duty_recipe_cangfeng', act: 0, kind: 'recipeCount', target: 'forge', need: 6,
    name: '藏锋',
    desc: '锋是藏起来的。藏得越深，出鞘时越利。',
    hint: '在「炼器」页参悟六张器图。',
  },
  {
    id: 'duty_cave_moli', act: 0, kind: 'cave', target: 'sum', need: 30,
    name: '磨砺',
    desc: '东一块西一块，也称不上家业。',
    hint: '将洞府所有建筑的等级合计提升到 30 级。',
  },
];

export function dutyById(id) {
  return DUTIES.find((d) => d.id === id) || null;
}

/** 全部必做主线的功课（八幕，20 门） */
export function mainDuties() {
  return DUTIES.filter((d) => d.act > 0);
}

/** 余课池（act: 0） */
export function sideDuties() {
  return DUTIES.filter((d) => d.act === 0);
}

/** 某一幕的功课 */
export function dutiesForAct(act) {
  return DUTIES.filter((d) => d.act === act);
}

/**
 * 第 2 世起的抽样池。
 *
 * 剔除 `firstOnly`（道侣 / 图鉴 / 成就）——它们的进度源跨世保留，
 * 老兵每世开局就已经"认识所有人、收过大半图鉴、解过大半成就"，
 * 这几门只会越来越难做，最后必然卡死。第一世是干净的，所以只放那儿。
 */
export function samplingPool() {
  return DUTIES.filter((d) => !d.firstOnly);
}
