/**
 * 飞升演出文案（V5.0「世业」）。
 *
 * ============ 和结局演出的分工 ============
 *
 * 结局演出（`endingText.js`）是**一次性的**：讲明白"这一切到底是怎么回事"。
 * 飞升演出是**重复的**：玩家每世都会看到它，5 世就 5 次，甚至更多。
 *
 * 这个区别决定了写法完全不同：
 *   - 结局可以铺五幕、可以长篇；飞升**必须短**，否则第三次就成了折磨
 *   - 结局负责"解释"；飞升只负责"送走这一世"
 *   - 结局内容固定；飞升**必须随世数变化**，否则重复感会杀死它
 *
 * 所以这里的做法是：**一场戏，三段口吻**。
 * 按世数选段，让"第 1 次飞升"和"第 5 次飞升"说的话不一样。
 *
 * ============ 字段 ============
 *
 *   minGen / maxGen  适用世数区间（含两端）
 *   opening[]        天门初开的两三行
 *   closing[]        送别这一世的两三行
 *   note             数据行上方的一句小字
 *
 * 行与结局演出同一套写法：{ t, cls }，cls 只取 '' 与 'reveal'。
 */

export const ASCENSION_TITLE = '白 日 飞 升';

/** 按世数取口吻。gen 从 1 起 */
export const ASCENSION_STAGES = [
  {
    id: 'first',
    minGen: 1,
    maxGen: 1,
    note: '第一次走到这里',
    opening: [
      { t: '天门比你想象的要安静。', cls: '' },
      { t: '没有仙乐，没有接引的鹤。只有云在脚下裂开一道缝。', cls: '' },
    ],
    closing: [
      { t: '你回头看了一眼来路——很短，短得像一场梦。', cls: '' },
      { t: '然后你迈了进去。', cls: '' },
      { t: '门后不是仙界。是另一个开始。', cls: 'reveal' },
    ],
  },
  {
    id: 'familiar',
    minGen: 2,
    maxGen: 3,
    note: '又是这道门',
    opening: [
      { t: '又是这道门。你认得它的形状了。', cls: '' },
      { t: '上一次你以为它是终点，这一次你知道它只是一道坎。', cls: '' },
    ],
    closing: [
      { t: '这一次你没有回头。', cls: '' },
      { t: '你记得路上每一块石头，也知道它们下一世还会在原地。', cls: '' },
      { t: '唯一不同的，是你比上次走近它时，更像你自己。', cls: 'reveal' },
    ],
  },
  {
    id: 'near',
    minGen: 4,
    maxGen: 999,
    note: '已经不数第几次了',
    opening: [
      { t: '门还是那道门。你已经不再数这是第几次了。', cls: '' },
      { t: '有些东西在变轻——名字、面孔、哪一世做过哪件事。', cls: '' },
    ],
    closing: [
      { t: '有些东西在变重——你越来越清楚自己在找什么。', cls: '' },
      { t: '你不再问"还要走多久"。', cls: '' },
      { t: '再走几步，就该看见了。', cls: 'reveal' },
    ],
  },
];

/** 按世数取本世的送别口吻 */
export function stageForGen(gen) {
  const g = Math.max(1, Math.floor(gen || 1));
  return ASCENSION_STAGES.find((s) => g >= s.minGen && g <= s.maxGen)
    || ASCENSION_STAGES[ASCENSION_STAGES.length - 1];
}

/** 数据行标签。与 endingText 的落款同一套写法，但这里记的是"刚结束的这一世" */
export const ASCENSION_FIELDS = [
  { key: 'gen', label: '第几世' },
  { key: 'realmName', label: '止步于' },
  { key: 'dutyName', label: '本世之业' },
  { key: 'daoGained', label: '道基所得' },
  { key: 'days', label: '在世' },
];
