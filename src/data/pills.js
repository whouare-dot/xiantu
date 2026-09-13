/**
 * 丹药。分四类用途：修炼、恢复、突破、特殊。
 *
 * effect.kind 说明（由 systems/alchemy.js 与 systems/inventory.js 解释）：
 *   cult          立即增加修为。**按当前修炼速率的 seconds 秒产出结算**，不是固定值
 *   restoreHp     立即恢复气血
 *   restoreMp     立即恢复灵力
 *   breakthrough  突破指定境界的必需丹药，bonus = 额外成功率
 *   buff          限时增益，buff = { stat, mult, duration }
 *   attr          永久提升属性，attr = 属性名，value = 数值
 *   rerollRoot    重掷灵根，chance = 成功率
 *   lifespan      增加寿元
 *
 * ─────────────────────────── 修为丹为什么锚定"秒数"而不是固定值 ───────────────────────────
 * 旧版聚气丹固定 +220 修为。炼气一层速率 10/息、需求 900 → 一颗顶 2.4 个境界；
 * 渡劫期速率 250/息、需求 5600 万 → 同一颗只值 0.88 息。两头都不对，且会随境界继续恶化。
 * 改成"当前速率 × seconds 息"之后，一颗丹相对**产能**的贡献恒定，与战斗/奇遇奖励同口径
 * （见 combat.js 的 grantBattleCult 上方注释）。品阶越高 seconds 越大，见 CULT_SECONDS_BY_QUALITY。
 *
 * ─────────────────────────── 价格锚 ───────────────────────────
 * price 一律锚定该丹方材料的**坊市买入价**（材料原价 × BUY_MARKUP），而不是拍脑袋写。
 * 理想值是 `Σ(材料买入价 × 数量) ÷ 基础成功率 × 1.4`，然后**钳进下面这条区间**：
 *
 *     材料买入价 × 1.2  <  丹价  <  材料买入价 × 2.5
 *
 * 下界保证"买丹比买药材还便宜"的倒挂不会出现；上界是防刷灵石线的余量版——
 * 材料的卖出价 = 原价 × SELL_RATE(0.35)，所以丹价一旦超过材料买入价的 1/0.35 ≈ 2.857 倍，
 * 满成功率下"买材料→炼丹→卖丹"就能套利。定在 2.5 是给日后调材料价留 14% 缓冲。
 * （成功率还会被丹房等级与悟性抬到 0.98，所以这条线必须按**满成功率**来卡，不能按基础值。）
 *
 * 含义：自炼永远比买丹便宜，这是炼丹系统存在的意义；但坊市也不会出现倒挂。
 * 旧版价格是逐条手写的，结果低阶丹比药材便宜（聚气丹 40 vs 药材 48），
 * 高阶丹又是药材的 58 倍（渡劫丹 720 万 vs 药材 12.4 万）——同一条曲线上两个方向的破位。
 * **改丹方材料或基础成功率时，请按上面的公式与区间重算这里的价格。**
 * （tools/test_economy.mjs 的「炼制产物出售价 < 材料买入成本」会挡住越界。）
 *
 * ─────────────────────────── 修为丹为何不在坊市出售 ───────────────────────────
 * 五档修为丹都带 noShop: true，坊市的丹药货架与拍卖行都不刷它们。
 * 原因是一条静态价格绕不开的结构性错配：灵石收入从炼气到渡劫涨了约 18000 倍，
 * 而修为速度只涨 25 倍。同一个静态价，在低境界贵得没人买（聚气丹 75 灵石 ≈ 7.5 分钟收入，
 * 只换 1 分钟产出），在高境界又便宜得离谱（大衍丹 12 万 ≈ 0.7 分钟收入，换 81 分钟产出）。
 * 与其让货架上摆着一个两头都不对的价，不如把修为丹定位成"顺手拿到的补给"：
 * 走奇遇掉落（聚气丹）、宗门宝库兑换，或者自己在丹房炼。
 *
 * id 白名单已冻结，奇遇事件库会直接引用，不要改名。
 */

/**
 * 修为丹按品阶分档的产出秒数（凡 → 圣，×3 递增）。
 * 渡劫期一颗圣品丹约合 2.2% 修为，金丹初期约 28%，炼气一层一颗凡品丹约 67%。
 * 注意：境界所需时长从炼气一层 90 息跨到渡劫期 22.4 万息（2500 倍），
 * 所以"锚定秒数"天然表现为早期慷慨、后期克制——这是锚定产能而非锚定境界的必然结果。
 */
export const CULT_SECONDS_BY_QUALITY = {
  fan: 60, ling: 180, xian: 540, shen: 1620, sheng: 4860,
};

export const PILLS = [
  // ---------- 修炼（修为丹，五档齐备） ----------
  {
    id: 'pill_juqi', name: '聚气丹', quality: 'fan', price: 75, minRealm: 0, noShop: true,
    desc: '凝聚天地灵气于丹田，服之修为小进',
    effect: { kind: 'cult', seconds: 60 },
  },
  {
    id: 'pill_yunling', name: '蕴灵丹', quality: 'ling', price: 820, minRealm: 4, noShop: true,
    desc: '药力蕴而不散，三日不绝于经脉',
    effect: { kind: 'cult', seconds: 180 },
  },
  {
    id: 'pill_zifu', name: '紫府丹', quality: 'xian', price: 3800, minRealm: 9, noShop: true,
    desc: '紫府乃元神所居。此丹温养紫府，一夕之功抵旬日苦修',
    effect: { kind: 'cult', seconds: 540 },
  },
  {
    id: 'pill_zaohua', name: '造化丹', quality: 'shen', price: 21000, minRealm: 15, noShop: true,
    desc: '夺天地造化入炉。丹成之日，炉上隐有云气盘桓不散',
    effect: { kind: 'cult', seconds: 1620 },
  },
  {
    id: 'pill_dayan', name: '大衍丹', quality: 'sheng', price: 120000, minRealm: 20, noShop: true,
    desc: '大衍之数五十，其用四十有九。余下那一分，便是此丹',
    effect: { kind: 'cult', seconds: 4860 },
  },

  // ---------- 恢复 ----------
  {
    id: 'pill_huiqi', name: '回气丹', quality: 'fan', price: 110, minRealm: 0,
    desc: '温养经脉，回复灵力',
    effect: { kind: 'restoreMp', pct: 0.5 },
  },
  {
    id: 'pill_liaoshang', name: '疗伤丹', quality: 'ling', price: 230, minRealm: 0,
    desc: '止血生肌，外伤立愈',
    effect: { kind: 'restoreHp', pct: 0.45 },
  },

  // ---------- 特殊 ----------
  {
    id: 'pill_xisui', name: '洗髓丹', quality: 'ling', price: 1300, minRealm: 5,
    desc: '洗经伐髓，有几率重塑灵根。成败在天，服者自担',
    effect: { kind: 'rerollRoot', chance: 0.3 },
  },
  {
    id: 'pill_xuming', name: '续命丹', quality: 'xian', price: 8200, minRealm: 12,
    desc: '夺天地造化，续命一纪。逆天而行，药力有限',
    effect: { kind: 'lifespan', value: 60 },
  },
  {
    id: 'pill_jingxin', name: '静心丹', quality: 'ling', price: 490, minRealm: 3,
    desc: '心境澄明，冲关时不易走火',
    effect: { kind: 'buff', buff: { stat: 'breakthrough', mult: 1.0, add: 0.12, duration: 600 } },
  },
  {
    id: 'pill_ningqi', name: '凝气丹', quality: 'ling', price: 530, minRealm: 4,
    desc: '一日之内灵气不散，修炼事半功倍',
    effect: { kind: 'buff', buff: { stat: 'cult', mult: 1.5, duration: 900 } },
  },
  {
    id: 'pill_tianji', name: '天机丹', quality: 'xian', price: 1600, minRealm: 6,
    desc: '窥一线天机，冥冥中气运加身',
    effect: { kind: 'attr', attr: 'luck', value: 5 },
  },
  {
    id: 'pill_guben', name: '固本丹', quality: 'xian', price: 3300, minRealm: 9,
    desc: '固本培元，道心愈坚，魔念难侵',
    effect: { kind: 'attr', attr: 'daoHeart', value: 5 },
  },

  // ---------- 突破必需 ----------
  {
    id: 'pill_zhuji', name: '筑基丹', quality: 'ling', price: 730, minRealm: 6,
    desc: '筑就道基之引。无此丹者，筑基九死一生',
    effect: { kind: 'breakthrough', forRealm: 9, bonus: 0.05 },
  },
  {
    id: 'pill_jiejin', name: '结金丹', quality: 'xian', price: 7100, minRealm: 10,
    desc: '凝气成液，液结成丹之引。金丹一道，尽在此丹',
    effect: { kind: 'breakthrough', forRealm: 12, bonus: 0.05 },
  },
  {
    id: 'pill_ningying', name: '凝婴丹', quality: 'xian', price: 14000, minRealm: 13,
    desc: '破丹成婴之引。婴成则神通自生',
    effect: { kind: 'breakthrough', forRealm: 15, bonus: 0.05 },
  },
  {
    id: 'pill_huashen', name: '化神丹', quality: 'shen', price: 31000, minRealm: 16,
    desc: '化婴为神之引。神念所至，山河可移',
    effect: { kind: 'breakthrough', forRealm: 18, bonus: 0.05 },
  },
  {
    id: 'pill_powang', name: '破妄丹', quality: 'shen', price: 49000, minRealm: 19,
    desc: '破虚妄，见真我。炼虚之关，唯心可渡',
    effect: { kind: 'breakthrough', forRealm: 21, bonus: 0.06 },
  },
  {
    id: 'pill_tiangang', name: '天罡丹', quality: 'shen', price: 100000, minRealm: 21,
    desc: '引天罡之气入体。合体者，与道合真',
    effect: { kind: 'breakthrough', forRealm: 22, bonus: 0.06 },
  },
  {
    id: 'pill_wudao', name: '悟道丹', quality: 'sheng', price: 160000, minRealm: 22,
    desc: '一丹一悟，一悟一世。大道无形，唯悟者得',
    effect: { kind: 'breakthrough', forRealm: 23, bonus: 0.07 },
  },
  {
    id: 'pill_dujie', name: '渡劫丹', quality: 'sheng', price: 300000, minRealm: 23,
    desc: '以丹药代劫，虽为下策，然活命要紧',
    effect: { kind: 'breakthrough', forRealm: 24, bonus: 0.08 },
  },
];

export function pillById(id) {
  return PILLS.find((p) => p.id === id) || null;
}

export function pillByName(name) {
  return PILLS.find((p) => p.name === name) || null;
}

/** 突破所需丹药：给定境界索引，返回该境界突破需要的丹药（无则 null） */
export function breakthroughPillFor(realmIndex) {
  return PILLS.find((p) => p.effect.kind === 'breakthrough' && p.effect.forRealm === realmIndex) || null;
}
