/**
 * 品阶枚举。凡 → 灵 → 仙 → 神 → 圣，五阶递进。
 * css 字段对应 styles/main.css 里的 .quality-* 类名。
 */

export const QUALITIES = {
  fan:   { id: 'fan',   name: '凡品', css: 'quality-fan',   order: 1, color: '#8b6b3d', affixCount: 0, affixTier: 1 },
  ling:  { id: 'ling',  name: '灵品', css: 'quality-ling',  order: 2, color: '#2d6b4f', affixCount: 1, affixTier: 2 },
  xian:  { id: 'xian',  name: '仙品', css: 'quality-xian',  order: 3, color: '#8b5d7b', affixCount: 2, affixTier: 3 },
  shen:  { id: 'shen',  name: '神品', css: 'quality-shen',  order: 4, color: '#5d4a8b', affixCount: 3, affixTier: 4 },
  sheng: { id: 'sheng', name: '圣品', css: 'quality-sheng', order: 5, color: '#b22222', affixCount: 4, affixTier: 5 },
};

export const QUALITY_ORDER = ['fan', 'ling', 'xian', 'shen', 'sheng'];

export function qualityOf(id) {
  return QUALITIES[id] || QUALITIES.fan;
}

/** 按品阶排序比较，用于背包排序 */
export function compareQuality(a, b) {
  return qualityOf(b).order - qualityOf(a).order;
}

/** 品阶数值倍率：用于按品阶放大装备基础属性 */
export const QUALITY_MULT = { fan: 1.0, ling: 1.6, xian: 2.6, shen: 4.2, sheng: 7.0 };
