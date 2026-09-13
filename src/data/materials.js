/**
 * 灵材。炼丹与炼器的原料，主要来自灵田产出、探险拾取与战斗掉落。
 * tier 1~5 对应采集/掉落所处的大境界段。
 * id 白名单已冻结，奇遇事件库（encounters.js）会直接引用，不要改名。
 */

export const MATERIALS = [
  // ---- 草药 ----
  { id: 'mat_lingzhi',    name: '灵芝草', kind: 'herb', tier: 1, price: 12,   desc: '常见药草，气味清苦，凝气之基' },
  { id: 'mat_xueshen',    name: '血参',   kind: 'herb', tier: 2, price: 45,   desc: '根须如血，生于阴湿崖壁，补气血' },
  { id: 'mat_ziyulan',    name: '紫玉兰', kind: 'herb', tier: 2, price: 60,   desc: '花瓣泛紫玉之光，安神定魄' },
  { id: 'mat_jiuyelian',  name: '九叶莲', kind: 'herb', tier: 3, price: 220,  desc: '九叶环生，一叶一岁，通经脉' },
  { id: 'mat_longdanhua', name: '龙诞花', kind: 'herb', tier: 4, price: 900,  desc: '生于龙气残留之地，服之神清' },
  { id: 'mat_taisuizhi',  name: '太岁芝', kind: 'herb', tier: 5, price: 3600, desc: '千年太岁所化，血肉重生之效' },

  // ---- 矿石 ----
  { id: 'mat_xuantie',    name: '玄铁矿', kind: 'ore', tier: 1, price: 18,   desc: '凡兵之骨，重而坚' },
  { id: 'mat_hanjing',    name: '寒晶石', kind: 'ore', tier: 2, price: 80,   desc: '触手生寒，内蕴阴气' },
  { id: 'mat_chiyan',     name: '赤炎铜', kind: 'ore', tier: 3, price: 260,  desc: '赤如炎火，锻器不熔' },
  { id: 'mat_xingchen',   name: '星辰砂', kind: 'ore', tier: 4, price: 1100, desc: '星陨所化，砂粒有光' },
  { id: 'mat_longlin',    name: '龙鳞矿', kind: 'ore', tier: 5, price: 4200, desc: '似鳞似矿，坚不可摧' },
  { id: 'mat_hundun',     name: '混沌石', kind: 'ore', tier: 5, price: 9000, desc: '混沌未分时的一点余烬' },

  // ---- 妖兽material ----
  { id: 'mat_shougu',     name: '兽骨',   kind: 'beast', tier: 1, price: 15,  desc: '妖兽残骨，可磨粉入药' },
  { id: 'mat_yaoxue',     name: '妖血',   kind: 'beast', tier: 2, price: 70,  desc: '妖力未散的血液，炼体佳品' },
  { id: 'mat_yaodan',     name: '妖丹',   kind: 'beast', tier: 3, price: 340, desc: '妖兽内丹，凝聚毕生修为' },
  { id: 'mat_neidan',     name: '内丹',   kind: 'beast', tier: 4, price: 1500, desc: '千年大妖的内丹，灵气磅礴' },
];

export const MATERIAL_KIND = {
  herb:  '草药',
  ore:   '矿石',
  beast: '兽材',
};

export function materialById(id) {
  return MATERIALS.find((m) => m.id === id) || null;
}

export function materialsByTier(tier) {
  return MATERIALS.filter((m) => m.tier === tier);
}
