/**
 * 天命 —— 每一世出生时随机决定的天资与际遇。
 *
 * 设计意图：轮回如果每世都一样，就只是"重开一次"。
 * 天命让每一世从第一秒起就不同：有的世你天赋异禀，有的世你天生残缺，
 * 而你要做的是**用手里的这副牌打出最好的结果**。
 *
 * 三条硬规则：
 *   1. **负面天命必须带补偿**。纯惩罚只会让玩家想重开，而不是想克服。
 *   2. **高价值天命只在后期出现**。前几世是教学，不该出"万古无一"。
 *   3. **可以保底重掷**。天赋树里有「夺天造化」，让玩家对随机性有对冲手段——
 *      随机性可以让人兴奋，不能让人绝望。
 *
 * 纯数据，无逻辑。
 */

export const FATES = [
  // ==================== 吉 ====================
  {
    id: 'fate_tiandao', name: '天授道体', good: true, weight: 6, minGen: 1,
    desc: '降生之日，云开见星。此身天生亲近大道。',
    effects: [{ kind: 'cultPct', value: 0.25 }],
  },
  {
    id: 'fate_jianxin', name: '剑骨天成', good: true, weight: 8, minGen: 1,
    desc: '握剑的手稳得不像孩子。天生就是吃这碗饭的。',
    effects: [{ kind: 'atkPct', value: 0.20 }, { kind: 'critAdd', value: 0.05 }],
  },
  {
    id: 'fate_fuyuan', name: '福缘深厚', good: true, weight: 8, minGen: 1,
    desc: '你总在恰当的时候，走到恰当的地方。',
    effects: [{ kind: 'luckAdd', value: 12 }],
  },
  {
    id: 'fate_huiyan', name: '慧眼通明', good: true, weight: 8, minGen: 1,
    desc: '别人读三遍的经文，你一遍就记住了。',
    effects: [{ kind: 'comprehensionAdd', value: 6 }],
  },
  {
    id: 'fate_wangu', name: '万古无一', good: true, weight: 2, minGen: 4,
    desc: '这样的天资，一万年里也未必出一个。',
    effects: [{ kind: 'cultPct', value: 0.4 }, { kind: 'breakAdd', value: 0.08 }, { kind: 'luckAdd', value: 8 }],
  },
  {
    id: 'fate_shouyuan', name: '龟息之相', good: true, weight: 7, minGen: 2,
    desc: '你天生气息绵长，寿元比同辈更长。',
    effects: [{ kind: 'lifespanAdd', value: 80 }, { kind: 'hpPct', value: 0.12 }],
  },
  {
    id: 'fate_daoxin', name: '赤子道心', good: true, weight: 7, minGen: 1,
    desc: '心念纯粹，魔念难侵。这条路你走得比谁都稳。',
    effects: [{ kind: 'daoHeartAdd', value: 8 }, { kind: 'tribulationResist', value: 0.08 }],
  },

  // ==================== 凶（必须带补偿）====================
  {
    id: 'fate_jingmai', name: '经脉淤塞', good: false, weight: 8, minGen: 1,
    desc: '经脉天生狭窄，灵气行得比旁人慢。但正因如此，你的根基比谁都扎实。',
    effects: [{ kind: 'cultPct', value: -0.20 }, { kind: 'hpPct', value: 0.15 }, { kind: 'defPct', value: 0.15 }],
  },
  {
    id: 'fate_qiti', name: '弃天之子', good: false, weight: 6, minGen: 2,
    desc: '天道不喜你。你走得步步艰难——但天劫也懒得认真劈你。',
    effects: [{ kind: 'luckAdd', value: -15 }, { kind: 'tribulationResist', value: 0.20 }],
  },
  {
    id: 'fate_duanti', name: '众生之疾', good: false, weight: 7, minGen: 1,
    desc: '出生便带着病根，常年与药石为伴。但你比谁都懂得如何照顾自己。',
    effects: [{ kind: 'hpPct', value: -0.15 }, { kind: 'cultPct', value: 0.12 }, { kind: 'comprehensionAdd', value: 4 }],
  },
  {
    id: 'fate_guchen', name: '孤辰寡宿', good: false, weight: 6, minGen: 2,
    desc: '命里带孤。与人结缘总是浅——但你因此从无所牵挂，走得比谁都快。',
    effects: [{ kind: 'cultPct', value: 0.18 }, { kind: 'bondRate', value: -0.4 }],
  },
  {
    id: 'fate_tanlang', name: '贪狼入命', good: false, weight: 6, minGen: 3,
    desc: '你天生贪心，见宝就想要。这让你总能捞到好处，也总在危险里打转。',
    effects: [{ kind: 'yieldPct', value: 0.30 }, { kind: 'daoHeartAdd', value: -5 }],
  },

  // ==================== 平（无得失，但有趣）====================
  {
    id: 'fate_pingfan', name: '凡骨凡胎', good: true, weight: 14, minGen: 1,
    desc: '没什么特别的。只是个普通人。而普通人，才最懂得什么叫拼命。',
    effects: [],
  },
];

export const FATE_TIER_NOTE = {
  1: '第一世至第三世',
  4: '第四世起才会出现的天命',
};

export function fateById(id) {
  return FATES.find((f) => f.id === id) || null;
}

/** 当前世数能抽到的天命池 */
export function fatesForGen(gen) {
  return FATES.filter((f) => (f.minGen ?? 1) <= gen);
}

/** 该天命是否是"凶" */
export function isBadFate(f) {
  return !!f && f.good === false;
}
