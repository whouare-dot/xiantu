/**
 * 战斗平衡校准工具。
 *
 * 回答的问题：在"境界 + 该境界能拿到的装备"这个前提下，玩家打同级敌人的胜率是多少？
 *
 * 用法:
 *   node tools/balance_combat.mjs            # 只报告
 *   node tools/balance_combat.mjs --scale    # 报告并输出建议的敌人缩放系数
 *   node tools/balance_combat.mjs --apply    # 按建议系数写回 data/enemies.js
 */

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const S = await import('../src/core/state.js');
const E = await import('../src/data/enemies.js');
const EQ = await import('../src/data/equipments.js');
const TECH = await import('../src/data/techniques.js');
const cb = await import('../src/systems/combat.js');
const { setSeed, rand } = await import('../src/core/rng.js');
const fs = await import('node:fs');

const TECH_LEVEL = 5;   // 校准假设：玩家把主修功法参悟到第 5 重（中期水平）

const N = 400;               // 每个组合的模拟场次
const TARGET_LOW = 0.60;     // 同级战斗的目标胜率下限
const TARGET_HIGH = 0.80;    // 目标胜率上限

/** 该境界下"应该已经拿到手"的装备：各槽位里 minRealm <= realm 的最强一件 */
function loadoutFor(realmIndex) {
  const best = {};
  for (const e of EQ.EQUIPMENTS) {
    if (e.minRealm > realmIndex) continue;
    const cur = best[e.slot];
    const score = (x) => (x.base.atk || 0) + (x.base.def || 0) * 1.2 + (x.base.hp || 0) * 0.1;
    if (!cur || score(e) > score(cur)) best[e.slot] = e;
  }
  return best;
}

/**
 * 构造一个"该境界的典型玩家"。
 * 注意：它会重置全局 state，所以必须先建裸装、再建带装备的，
 * 否则后一次调用会把前一次的装备冲掉（winRate 读的是全局 state）。
 */
function makePlayer(realmIndex, { withGear = true, withTech = true } = {}) {
  S.setState(S.createInitialState('校准'));
  const st = S.state;
  st.player.realmIndex = realmIndex;
  st.player.spiritRoot = { id: 'huang', name: '黄灵根', mult: 1.0, desc: '' };

  if (withTech) {
    // 主修槽位内，挑该境界能学到的、品阶最高的功法，参悟到 TECH_LEVEL 重
    const slots = S.techSlotsFor(realmIndex);
    const avail = TECH.TECHNIQUES
      .filter((t) => t.minRealm <= realmIndex)
      .sort((a, b) => (b.baseMult + b.perLevel * 8) - (a.baseMult + a.perLevel * 8));
    const picked = avail.slice(0, slots);
    st.techniques.known = {};
    st.techniques.equipped = [];
    for (const t of picked) {
      st.techniques.known[t.id] = { level: TECH_LEVEL, exp: 0 };
      st.techniques.equipped.push(t.id);
    }
  }

  if (withGear) {
    const gear = loadoutFor(realmIndex);
    // 必须从 nextUid 续号：初始行囊已经占用了 1、2，
    // 若从 1 重发会与它们撞号，equippedInstances() 会解析回初始装备
    let uid = st.equipment.nextUid;
    for (const [slot, e] of Object.entries(gear)) {
      const inst = { uid: uid++, baseId: e.id, quality: e.quality, level: 1, affixes: [] };
      st.equipment.owned.push(inst);
      st.equipment.equipped[slot] = inst.uid;
    }
    st.equipment.nextUid = uid;
  }
  // 满血开战：否则测的是"残血能不能赢"，而不是平衡
  const side = cb.buildPlayerSide();
  st.player.hp = side.maxHp;
  st.player.mp = side.maxMp;
  return cb.buildPlayerSide();
}

/** 覆盖率：如果每个敌人被随机抽中，平均胜率是多少 */
function winRate(player, enemyId, n = N) {
  let w = 0;
  for (let i = 0; i < n; i++) {
    const p = cb.buildPlayerSide();
    const en = cb.buildEnemySide(enemyId);
    if (cb.simulateBattle(p, en).winner === 'player') w++;
  }
  return w / n;
}

setSeed(20260911);

const tiers = [1, 2, 3, 4, 5];
const report = [];
const suggestions = {};

console.log('='.repeat(78));
console.log('战斗平衡校准（玩家 = 该境界最强可得装备，无功法、无丹药）');
console.log('='.repeat(78));

for (const t of tiers) {
  const group = E.ENEMIES.filter((x) => x.tier === t);
  const realmIndex = Math.min(...group.map((x) => x.minRealm));

  // 顺序很重要：先建"最差情况"快照，最后建的那个才是 winRate 读到的状态
  const bare = makePlayer(realmIndex, { withGear: false, withTech: false });
  const bareInfo = { atk: bare.atk, def: bare.def, hp: bare.maxHp, spd: bare.spd, mp: bare.maxMp };
  const withTechOnly = makePlayer(realmIndex, { withGear: false, withTech: true });
  const techInfo = { atk: withTechOnly.atk, def: withTechOnly.def, hp: withTechOnly.maxHp, mp: withTechOnly.maxMp };
  const player = makePlayer(realmIndex, { withGear: true, withTech: true });

  console.log(`\n── tier ${t}  代表境界 ${realmIndex}`);
  console.log(`   玩家(装备+功法): atk=${player.atk} def=${player.def} hp=${player.maxHp} mp=${player.maxMp} spd=${player.spd}`);
  console.log(`   玩家(仅初始)  : atk=${bareInfo.atk} def=${bareInfo.def} hp=${bareInfo.hp} mp=${bareInfo.mp}`);
  console.log(`   玩家(仅功法)  : atk=${techInfo.atk} def=${techInfo.def} hp=${techInfo.hp} mp=${techInfo.mp}`);

  const rates = [];
  for (const e of group) {
    const r = winRate(player, e.id);
    rates.push(r);
    report.push({ tier: t, id: e.id, name: e.name, rate: r });
    const flag = r < TARGET_LOW ? '  ← 过难' : r > TARGET_HIGH ? '  ← 过易' : '';
    console.log(`   ${e.name.padEnd(12)} 胜率 ${(r * 100).toFixed(0).padStart(3)}%${flag}`);
  }

  const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
  console.log(`   平均胜率 ${(avg * 100).toFixed(1)}%`);

  // 建议缩放系数：粗略地按"胜率缺口"线性外推（hp 与 atk 各缩放 sqrt 次，
  // 因为胜率大致与 (玩家DPS/敌人HP) × (玩家HP/敌人DPS) 成正比）
  if (avg < TARGET_LOW || avg > TARGET_HIGH) {
    const target = (TARGET_LOW + TARGET_HIGH) / 2;
    // 胜率≈0.5 时，把"敌人强度"乘 k 会把胜率压到约 1/k 的相对优势
    // 这里用保守迭代：k = clamp(目标/实测 的开方, 0.35, 1.6)
    const ratio = avg > 0.01 ? target / avg : 3;
    const k = Math.max(0.35, Math.min(1.6, Math.sqrt(ratio)));
    suggestions[t] = k;
    console.log(`   → 建议强度系数 ${k.toFixed(3)}（hp 与 atk 同时缩放此值）`);
  } else {
    suggestions[t] = 1;
    console.log(`   → 已在目标区间，无需调整`);
  }
}

console.log('\n' + '='.repeat(78));

if (process.argv.includes('--apply')) {
  const path = new URL('../src/data/enemies.js', import.meta.url);
  let src = fs.readFileSync(path, 'utf8');
  let touched = 0;

  // 逐条重写 tier 对应敌人的 base 数值
  src = src.replace(
    /(\{\s*id:\s*'([^']+)'[\s\S]*?tier:\s*(\d)[\s\S]*?base:\s*\{)([^}]*)(\})/g,
    (m, head, id, tierStr, body, tail) => {
      const t = parseInt(tierStr, 10);
      const k = suggestions[t] ?? 1;
      if (k === 1) return m;
      const newBody = body.replace(
        /(hp|atk|def)\s*:\s*(\d+(?:\.\d+)?)/g,
        (mm, key, val) => {
          const scaled = Math.max(1, Math.round(parseFloat(val) * k));
          return `${key}: ${scaled}`;
        },
      );
      if (newBody !== body) touched++;
      return head + newBody + tail;
    },
  );

  fs.writeFileSync(path, src, 'utf8');
  console.log(`已写回 enemies.js，调整 ${touched} 个敌人。`);
  console.log('注意：power 字段未同步，如需一致请手工核对或扩展本脚本。');
} else {
  console.log('加 --apply 可按上述系数写回 data/enemies.js。');
}

const bad = report.filter((r) => r.rate < TARGET_LOW);
console.log(`\n低于目标胜率(${TARGET_LOW * 100}%)的敌人：${bad.length} / ${report.length}`);
if (bad.length) {
  console.log('  ' + bad.slice(0, 12).map((r) => `t${r.tier}:${r.name}(${(r.rate * 100).toFixed(0)}%)`).join('  '));
}
process.exit(0);
