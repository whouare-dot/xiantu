/**
 * 灵根。决定修炼速率的基础倍率，是开局的最大随机变量。
 * 悲观但可玩：杂灵根也一定能通关，只是慢；天灵根是极低概率的惊喜。
 */

export const SPIRIT_ROOTS = [
  { id: 'tian',  name: '天灵根', mult: 2.5, weight: 2,  color: '#b22222', desc: '万中无一，天资绝世，修炼奇速' },
  { id: 'di',    name: '地灵根', mult: 1.8, weight: 8,  color: '#8b5d7b', desc: '上等灵根，天赋异禀，事半功倍' },
  { id: 'xuan',  name: '玄灵根', mult: 1.3, weight: 25, color: '#2d6b4f', desc: '中等灵根，中规中矩，尚可造就' },
  { id: 'huang', name: '黄灵根', mult: 1.0, weight: 38, color: '#8b6b3d', desc: '下等灵根，勤能补拙，大道可期' },
  { id: 'za',    name: '杂灵根', mult: 0.7, weight: 27, color: '#6b4f2e', desc: '灵根驳杂，修行艰难，唯有苦熬' },
];

export function rootById(id) {
  return SPIRIT_ROOTS.find((r) => r.id === id) || null;
}

export function rootByName(name) {
  return SPIRIT_ROOTS.find((r) => r.name === name) || null;
}
