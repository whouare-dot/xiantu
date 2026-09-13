/**
 * 功法。三大流派（剑修 / 体修 / 法修），每本可逐层参悟。
 *
 * 参悟收益：
 *   cultMult = baseMult + perLevel * (level - 1)     修炼速率倍率
 *   attrs    每层累加的基础属性
 *   affix    流派特效，由 systems/combat.js 解释
 *
 * affix.kind 取值：
 *   extra_strike  概率追加一击（value = 概率）
 *   crit_up       暴击率提升（value = 绝对增量）
 *   lifesteal     吸血（value = 伤害转化比例）
 *   reflect       反伤（value = 反弹比例）
 *   hp_up         气血上限提升（value = 百分比）
 *   mp_regen      每回合灵力恢复（value = 数值）
 *   mp_power      灵力越满伤害越高（value = 最大加成比例）
 *   aoe           伤害溅射（value = 溅射比例）
 *   break_aid     突破成功率加成（value = 绝对增量）
 */

export const PATHS = {
  sword: { id: 'sword', name: '剑修', desc: '以剑入道，锋芒毕露。攻高暴烈，正面破敌', color: '#b22222' },
  body:  { id: 'body',  name: '体修', desc: '炼体为基，肉身成圣。血厚耐战，以伤换伤', color: '#8b6b3d' },
  law:   { id: 'law',   name: '法修',  desc: '参悟天地，术法通玄。灵力绵长，攻守兼备', color: '#2d6b4f' },
};

export const TECHNIQUES = [
  // ==================== 剑修 ====================
  {
    id: 'tech_qingfeng', name: '青锋剑诀', path: 'sword', quality: 'fan',
    price: 120, minRealm: 0, maxLevel: 9,
    baseMult: 1.08, perLevel: 0.02,
    attrs: { atk: 2, spd: 0.5 },
    affix: { kind: 'crit_up', value: 0.01, name: '锋芒', desc: '每层暴击率 +1%' },
    desc: '凡俗剑客的入门剑诀，胜在根基扎实',
    lore: '此诀传自山野樵夫，本无甚玄妙。然大道至简，一剑一世界，樵夫亦能斩妖。',
  },
  {
    id: 'tech_taixu', name: '太虚剑诀', path: 'sword', quality: 'ling',
    price: 1500, minRealm: 8, maxLevel: 9,
    baseMult: 1.25, perLevel: 0.05,
    attrs: { atk: 8, spd: 1, crit: 0.005 },
    affix: { kind: 'extra_strike', value: 0.12, name: '剑影', desc: '12% 概率追加一击' },
    desc: '虚实相生，剑出无痕。太虚一脉的立派之基',
    lore: '剑本无招，招在心中。虚者实之，实者虚之，敌不能测，则剑无不利。',
  },
  {
    id: 'tech_wanjian', name: '万剑归宗', path: 'sword', quality: 'xian',
    price: 42000, minRealm: 14, maxLevel: 9,
    baseMult: 1.6, perLevel: 0.09,
    attrs: { atk: 40, spd: 2, crit: 0.012 },
    affix: { kind: 'extra_strike', value: 0.22, name: '万剑', desc: '22% 概率追加一击' },
    desc: '一念动而万剑生，剑宗镇派绝学',
    lore: '昔年剑尊立于绝顶，言："天下剑，皆我剑。"言毕，万剑齐鸣，山河失色。',
  },
  {
    id: 'tech_zhuxian', name: '诛仙剑典', path: 'sword', quality: 'shen',
    price: 1600000, minRealm: 20, maxLevel: 9,
    baseMult: 2.1, perLevel: 0.16,
    attrs: { atk: 180, spd: 4, crit: 0.02 },
    affix: { kind: 'lifesteal', value: 0.15, name: '剑噬', desc: '造成伤害的 15% 转化为气血' },
    desc: '上古凶典，一剑既出，仙神辟易',
    lore: '此典非为杀仙而作，乃仙人所留。仙人畏之，故封之。封者已逝，典犹在。',
  },

  // ==================== 体修 ====================
  {
    id: 'tech_duanti', name: '锻体诀', path: 'body', quality: 'fan',
    price: 100, minRealm: 0, maxLevel: 9,
    baseMult: 1.05, perLevel: 0.015,
    attrs: { def: 2, hp: 12 },
    affix: { kind: 'hp_up', value: 0.02, name: '淬体', desc: '每层气血上限 +2%' },
    desc: '以药汤淬体，以拳脚锻骨。笨功夫，但管用',
    lore: '师父说：别人打坐一夜，你打桩一夜。十年后，他还在打坐，你已经不怕他打了。',
  },
  {
    id: 'tech_longxiang', name: '龙象般若功', path: 'body', quality: 'ling',
    price: 1800, minRealm: 8, maxLevel: 9,
    baseMult: 1.2, perLevel: 0.045,
    attrs: { atk: 4, def: 9, hp: 45 },
    affix: { kind: 'reflect', value: 0.1, name: '龙象', desc: '反弹 10% 所受伤害' },
    desc: '身具龙象之力，一力降十会',
    lore: '龙象者，水行最有力。修至大成，举手投足皆有龙象相随，山岳可撼。',
  },
  {
    id: 'tech_bumie', name: '不灭金身', path: 'body', quality: 'xian',
    price: 48000, minRealm: 14, maxLevel: 9,
    baseMult: 1.55, perLevel: 0.085,
    attrs: { def: 45, hp: 260 },
    affix: { kind: 'reflect', value: 0.2, name: '金刚', desc: '反弹 20% 所受伤害' },
    desc: '金身不坏，水火不侵。佛门护法之极',
    lore: '身是菩提树，心如明镜台。既已不灭，何惧刀兵？',
  },
  {
    id: 'tech_hundun', name: '混沌战体', path: 'body', quality: 'shen',
    price: 1800000, minRealm: 20, maxLevel: 9,
    baseMult: 2.0, perLevel: 0.15,
    attrs: { atk: 120, def: 200, hp: 1100 },
    affix: { kind: 'reflect', value: 0.3, name: '混沌', desc: '反弹 30% 所受伤害' },
    desc: '以混沌之气淬炼肉身，成就不朽战体',
    lore: '天地未开时，唯混沌而已。以混沌铸身，便是以天地未开之力护体——谁能破之？',
  },

  // ==================== 法修 ====================
  {
    id: 'tech_tuna', name: '吐纳术', path: 'law', quality: 'fan',
    price: 90, minRealm: 0, maxLevel: 9,
    baseMult: 1.1, perLevel: 0.022,
    attrs: { mp: 12, comprehension: 0.5 },
    affix: { kind: 'mp_regen', value: 2, name: '吐纳', desc: '每回合恢复 2 点灵力' },
    desc: '最基础的呼吸法门，却是万法之始',
    lore: '一呼一吸，一吐一纳。凡人日日为之而不自知，修士知之，遂成大道。',
  },
  {
    id: 'tech_wuxing', name: '五行诀', path: 'law', quality: 'fan',
    price: 380, minRealm: 3, maxLevel: 9,
    baseMult: 1.18, perLevel: 0.035,
    attrs: { atk: 3, mp: 18 },
    affix: { kind: 'aoe', value: 0.2, name: '五行', desc: '伤害溅射 20%' },
    desc: '金木水火土，五行轮转，气机不绝',
    lore: '五行相生，故气不竭；五行相克，故法无穷。',
  },
  {
    id: 'tech_taiyi', name: '太乙玄光', path: 'law', quality: 'ling',
    price: 2200, minRealm: 9, maxLevel: 9,
    baseMult: 1.3, perLevel: 0.055,
    attrs: { atk: 9, mp: 40, comprehension: 1 },
    affix: { kind: 'mp_power', value: 0.3, name: '玄光', desc: '灵力越足，伤害最高 +30%' },
    desc: '太乙真传，一道玄光可破万法',
    lore: '光者，天地之正气。凝正气于一束，邪魔外道见之即溃。',
  },
  {
    id: 'tech_jiuzhuan', name: '九转金丹诀', path: 'law', quality: 'xian',
    price: 52000, minRealm: 14, maxLevel: 9,
    baseMult: 1.65, perLevel: 0.095,
    attrs: { atk: 35, mp: 120, comprehension: 2 },
    affix: { kind: 'mp_power', value: 0.5, name: '九转', desc: '灵力越足，伤害最高 +50%' },
    desc: '九转功成，金丹自凝。丹道与法术合流之极',
    lore: '一转一重天，九转登天去。丹成之日，天地同寿。',
  },
  {
    id: 'tech_wuji', name: '混沌无极功', path: 'law', quality: 'sheng',
    price: 3000000, minRealm: 20, maxLevel: 9,
    baseMult: 2.2, perLevel: 0.18,
    attrs: { atk: 150, def: 80, mp: 400, comprehension: 4 },
    affix: { kind: 'break_aid', value: 0.08, name: '无极', desc: '突破成功率 +8%' },
    desc: '混沌未分，无极而生。此法直指大道本源',
    lore: '无极而太极，太极动而生阳。此功不修法力，只修"本源"二字。',
  },
];

export function techById(id) {
  return TECHNIQUES.find((t) => t.id === id) || null;
}

export function techByName(name) {
  return TECHNIQUES.find((t) => t.name === name) || null;
}

export function techsByPath(path) {
  return TECHNIQUES.filter((t) => t.path === path);
}

/** 计算某本功法在指定层数时的完整数值 */
export function techStatsAt(tech, level) {
  const lv = Math.max(1, Math.min(level, tech.maxLevel));
  const n = lv - 1;
  const attrs = {};
  for (const [k, v] of Object.entries(tech.attrs || {})) attrs[k] = v * lv;
  return {
    level: lv,
    cultMult: tech.baseMult + tech.perLevel * n,
    attrs,
    affix: tech.affix ? { ...tech.affix, value: tech.affix.value } : null,
  };
}

/** 参悟到下一层所需修为 */
export function techUpgradeCost(tech, currentLevel) {
  const base = tech.price * 1.6;
  return Math.floor(base * Math.pow(1.75, currentLevel) * 0.35);
}
