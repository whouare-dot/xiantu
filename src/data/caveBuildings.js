/**
 * 洞府建筑。共六座，与美术资源一一对应（art 字段）。
 *
 * 字段约定：
 *   maxLevel        最高等级（统一 9 级）
 *   reqCaveLevel    建造 / 升级所需的洞府等级 cave.level（1~9）
 *   unlockRealm     解锁所需最低境界索引（0..25）
 *   effect.kind     效果类型，由 systems/cave.js 解释
 *   cost            { base, growth }：从 currentLevel 升到 currentLevel+1
 *                   花费 = base * growth^currentLevel（下品灵石）
 *   buildSeconds    { base, growth }：升级耗时（秒），离线期间照常推进
 *   autoUnlockLevel 达到该等级解锁对应自动化（仅丹房 / 炼器室）
 *
 * effect.kind 说明：
 *   cult_mult       修炼速率加成，+perLevel*level（加成叠加，非线性放大）
 *   material_yield  每 interval 秒自动产出灵材，数量 = level * perLevel
 *   alchemy_speed   炼丹速度加成，实际耗时 = 基础耗时 / (1 + perLevel*level)
 *   forge_speed     炼器速度加成，同上
 *   comprehension   悟性加成，+perLevel*level（影响参悟与突破）
 *   defense         探险 / 战斗减伤，受伤 = 原值 * (1 - perLevel*level)，上限 45%
 */

export const BUILDINGS = [
  {
    id: 'bld_spirit', name: '聚灵阵', art: 'BLD_SPIRIT_GATHER',
    maxLevel: 9, reqCaveLevel: 0, unlockRealm: 0,
    desc: '汇聚天地灵气，提升修炼速率。洞府之根本，一应修行皆赖于此',
    effect: { kind: 'cult_mult', perLevel: 0.28 },   // 1级 +28%，9级 +252%
    cost: { base: 200, growth: 2.35 },
    buildSeconds: { base: 60, growth: 1.9 },
  },
  {
    id: 'bld_herb', name: '灵田', art: 'BLD_HERB_FIELD',
    maxLevel: 9, reqCaveLevel: 1, unlockRealm: 0,
    desc: '引灵泉灌溉，栽种药草。每隔一段时间自动收获灵材，亦可育种提品',
    effect: { kind: 'material_yield', perLevel: 1, interval: 600 }, // 每 600 秒产 level*1 份
    cost: { base: 150, growth: 2.3 },
    buildSeconds: { base: 45, growth: 1.85 },
  },
  {
    id: 'bld_alchemy', name: '丹房', art: 'BLD_ALCHEMY_ROOM',
    maxLevel: 9, reqCaveLevel: 2, unlockRealm: 3,
    desc: '起炉炼丹之所。提升炼丹速度，五级后解锁自动炼丹',
    effect: { kind: 'alchemy_speed', perLevel: 0.12 },
    cost: { base: 320, growth: 2.4 },
    buildSeconds: { base: 120, growth: 1.88 },
    autoUnlockLevel: 5,
  },
  {
    id: 'bld_forge', name: '炼器室', art: 'BLD_FORGE_ROOM',
    maxLevel: 9, reqCaveLevel: 3, unlockRealm: 6,
    desc: '地火为炉，锤凿为笔。提升炼器速度，五级后解锁自动炼器',
    effect: { kind: 'forge_speed', perLevel: 0.12 },
    cost: { base: 360, growth: 2.4 },
    buildSeconds: { base: 150, growth: 1.9 },
    autoUnlockLevel: 5,
  },
  {
    id: 'bld_library', name: '藏经阁', art: 'BLD_LIBRARY',
    maxLevel: 9, reqCaveLevel: 4, unlockRealm: 9,
    desc: '收纳典籍，静心参悟。提升悟性，影响功法参悟速度与突破成功率',
    effect: { kind: 'comprehension', perLevel: 2 },
    cost: { base: 500, growth: 2.45 },
    buildSeconds: { base: 180, growth: 1.92 },
  },
  {
    id: 'bld_ward', name: '护山大阵', art: 'BLD_WARD',
    maxLevel: 9, reqCaveLevel: 6, unlockRealm: 12,
    desc: '以阵旗引地脉之力护持洞府，减少探险与战斗中所受伤害',
    effect: { kind: 'defense', perLevel: 0.05 },     // 每级减伤 5%，9级 45%
    cost: { base: 800, growth: 2.5 },
    buildSeconds: { base: 240, growth: 1.95 },
  },
];

/** 洞府建筑统一最高等级 */
export const MAX_BUILDING_LEVEL = 9;

export function buildingById(id) {
  return BUILDINGS.find((b) => b.id === id) || null;
}

/**
 * 从 currentLevel 升到 currentLevel+1 的灵石花费（下品灵石为单位）。
 * 公式：base * growth^currentLevel；已满级返回 null。
 */
export function buildingUpgradeCost(bld, currentLevel) {
  if (!bld) return null;
  const lv = Math.max(0, Math.floor(currentLevel || 0));
  if (lv >= bld.maxLevel) return null;
  return Math.floor(bld.cost.base * Math.pow(bld.cost.growth, lv));
}

/**
 * 从 currentLevel 升到 currentLevel+1 的耗时（秒），离线照常推进。
 * 公式：base * growth^currentLevel；已满级返回 null。
 */
export function buildingUpgradeSeconds(bld, currentLevel) {
  if (!bld) return null;
  const lv = Math.max(0, Math.floor(currentLevel || 0));
  if (lv >= bld.maxLevel) return null;
  return Math.floor(bld.buildSeconds.base * Math.pow(bld.buildSeconds.growth, lv));
}
