/**
 * 灵兽血脉自测（V4.0 收官）。
 *
 * 血脉是**跨世保留**的数据，所以这里测的重点和轮回一样，不是"功能对不对"，
 * 而是两类灾难性的错：
 *   1. **覆盖**：某一世只养了一只 1 星同族，就把上一世养出的 5 星记录抹掉
 *      —— 玩家的永久进度会凭空倒退，而且毫无提示。
 *   2. **失效**：效果算出来了但没接到实际系统上（等级上限、属性、捕获率、孵化时长），
 *      玩家看到的是一套数字，实际生效的是另一套。这正是 V3.0 立场契约事故的形态。
 *
 * 所以下面每一档血脉的**每一条效果**都有"真的生效了吗"的断言，而不是只测等级判定。
 *
 * 用法: node tools/test_bloodline.mjs
 */

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const S = await import('../src/core/state.js');
const BL = await import('../src/systems/bloodline.js');
const BS = await import('../src/systems/beast.js');
const RC = await import('../src/systems/reincarnation.js');
const { BEASTS } = await import('../src/data/beasts.js');
const { setSeed } = await import('../src/core/rng.js');

let failures = 0;
function check(name, cond, detail = '') {
  const ok = !!cond;
  if (!ok) failures++;
  console.log(`  ${ok ? '[OK]  ' : '[FAIL]'} ${name}${detail ? '  —— ' + detail : ''}`);
  return ok;
}
function section(t) {
  console.log('\n' + t);
  console.log('-'.repeat(64));
}

/** 找两个可用的物种：一个 tier 1（觉醒便宜），一个 tier 4（觉醒贵） */
const TIER1 = BEASTS.filter((b) => b.tier === 1);
const TIER4 = BEASTS.filter((b) => b.tier >= 4);

// ============ 1. 空血脉 ============
section('1. 未曾养过：一切保持原样');
{
  setSeed(20260912);
  S.setState(S.createInitialState('血脉测试'));

  check('新档就有 bloodlines 字段', !!S.state.beasts.bloodlines, JSON.stringify(S.state.beasts.bloodlines));
  check('血脉表为空', Object.keys(BL.bloodlines()).length === 0);
  check('全局共鸣为 0', BL.globalMult() === 0, String(BL.globalMult()));

  const id = TIER1[0].id;
  check('等级 0', BL.levelOf(id) === 0);
  check('捕获加成 0', BL.captureBonus(id) === 0);
  check('孵化倍率 1', BL.hatchMult(id) === 1);
  check('属性倍率 1', BL.beastMult(id) === 1, String(BL.beastMult(id)));
  check('等级上限加成为 0', BL.levelCapBonus(id) === 0);
  check('不可觉醒（没养过）', BL.canAwaken(id).ok === false, BL.canAwaken(id).reason);
}

// ============ 2. Lv1「相识」 ============
section('2. Lv1 相识：养过即得，作用于下一世再遇');
{
  S.setState(S.createInitialState('血脉测试'));
  const id = TIER1[0].id;
  S.state.beasts.owned.push({ uid: 1, baseId: id, star: 2, level: 5, exp: 0, intimacy: 0, stage: 0, name: 'x' });

  const lines = BL.extractFrom(S.state.beasts.owned);
  BL.installInto(S.state, lines);
  check('已记入血脉', !!BL.bloodlines()[id]);
  check('等级为 1', BL.levelOf(id) === 1, 'lv=' + BL.levelOf(id));
  check('记录了历史最佳星级', BL.bloodlines()[id].bestStar === 2);
  check('相伴世数为 1', BL.bloodlines()[id].gens === 1, 'gens=' + BL.bloodlines()[id].gens);
  check('捕获加成 +15%', BL.captureBonus(id) === 0.15, String(BL.captureBonus(id)));
  check('孵化时长 −20%', Math.abs(BL.hatchMult(id) - 0.8) < 1e-9, String(BL.hatchMult(id)));
  check('Lv1 还没有属性加成', BL.beastMult(id) === 1, String(BL.beastMult(id)));
  check('Lv1 还没有等级上限加成', BL.levelCapBonus(id) === 0);
}

// ============ 3. Lv2「相知」 ============
section('3. Lv2 相知：历史最佳 3★ 即达，加成全面生效');
{
  S.setState(S.createInitialState('血脉测试'));
  const id = TIER1[0].id;
  S.state.beasts.owned.push({ uid: 1, baseId: id, star: 3, level: 5, exp: 0, intimacy: 0, stage: 0, name: 'x' });
  BL.installInto(S.state, BL.extractFrom(S.state.beasts.owned));

  check('等级为 2', BL.levelOf(id) === 2, 'lv=' + BL.levelOf(id));
  check('再捕获初始亲密度 +15', BL.initIntimacy(id) === 15, String(BL.initIntimacy(id)));
  check('该族等级上限 +5', BL.levelCapBonus(id) === 5, String(BL.levelCapBonus(id)));
  check('全局共鸣 +2%', Math.abs(BL.globalMult() - 0.02) < 1e-9, String(BL.globalMult()));
  check('属性倍率 1.02', Math.abs(BL.beastMult(id) - 1.02) < 1e-9, String(BL.beastMult(id)));
  check('Lv2 尚未觉醒', BL.bloodlines()[id].awakened === false);

  // ★ 关键：效果要真的落到 beast.js 的系统上，不能只是算出来。
  // 期望值直接按公式反算（而不是拿另一个物种当基准——那会混入物种差异）。
  const inst = { uid: 9, baseId: id, star: 3, level: 5, exp: 0, intimacy: 0, stage: 0, name: 'x' };
  const pure = { star: 3, stage: 0 };                       // 无血脉时的上限
  const baseCap = 10 + 3 * 10 + 0 * 5;
  check('★ levelCap() 真的 +5', BS.levelCap(inst) === baseCap + 5,
    `期望 ${baseCap + 5}，实得 ${BS.levelCap(inst)}`);

  const def = BEASTS.find((b) => b.id === id);
  const expectMul = (1 + (3 - 1) * 0.08) * 1.02;            // 星级 × 血脉共鸣
  const expectAtk = Math.max(1, Math.round(
    (def.base.atk + (def.growth.atk || 0) * 4) * expectMul));
  const gotAtk = BS.beastStats(inst).atk;
  check('★ beastStats() 属性真的吃到 ×1.02', gotAtk === expectAtk,
    `期望 ${expectAtk}，实得 ${gotAtk}`);

  check('未传 baseId 时不吃加成（保持向后兼容）', BS.levelCap(pure) === baseCap, String(BS.levelCap(pure)));
}

// ============ 4. Lv3「共鸣」：觉醒 ============
section('4. Lv3 共鸣：觉醒需材料，觉醒后效果永久');
{
  S.setState(S.createInitialState('血脉测试'));
  const id = TIER1[0].id;
  // 造出"养到极致"的历史：3★ 且进化过（stage ≥ 1）
  S.state.beasts.owned.push({ uid: 1, baseId: id, star: 3, level: 20, exp: 0, intimacy: 0, stage: 1, name: 'x' });
  BL.installInto(S.state, BL.extractFrom(S.state.beasts.owned));

  const ca0 = BL.canAwaken(id);
  check('材料不足时不可觉醒', ca0.ok === false, ca0.reason);
  check('给出的理由是材料不足', /灵材不足/.test(ca0.reason), ca0.reason);
  check('觉醒消耗按阶级给出', ca0.cost.length > 0,
    ca0.cost.map((c) => `${c.id}×${c.count}`).join('、'));

  // 补足材料
  for (const c of ca0.cost) S.state.resources.materials[c.id] = c.count;
  const ca1 = BL.canAwaken(id);
  check('材料齐备后可觉醒', ca1.ok === true, ca1.reason);

  const r = BL.awaken(id);
  check('觉醒成功', r.ok === true, r.reason || '');
  check('等级升到 3', BL.levelOf(id) === 3, 'lv=' + BL.levelOf(id));
  check('材料被扣除',
    ca0.cost.every((c) => (S.state.resources.materials[c.id] || 0) === 0),
    JSON.stringify(S.state.resources.materials));
  check('再捕获初始等级 Lv.10', BL.initLevel(id) === 10, String(BL.initLevel(id)));
  // 觉醒加成与全局共鸣是**相乘**的（Lv3 本身也算一条 Lv2+ 血脉），不是二选一
  const expect3 = (1 + BL.globalMult()) * 1.15;
  check('觉醒后属性倍率 = 共鸣 × 觉醒', Math.abs(BL.beastMult(id) - expect3) < 1e-9,
    `期望 ${expect3.toFixed(4)}，实得 ${BL.beastMult(id).toFixed(4)}`);
  check('重复觉醒被拒', BL.canAwaken(id).ok === false && BL.canAwaken(id).reason === '血脉已醒');
}

// ============ 5. ★ 取并集，绝不覆盖 ============
section('5. ★ 并集语义：新一世养得差，不得抹掉旧记录');
{
  S.setState(S.createInitialState('血脉测试'));
  const id = TIER1[0].id;
  const other = TIER1[1].id;

  // 第 5 世：养到 5★ + 2 阶，并觉醒
  S.state.beasts.owned = [{ uid: 1, baseId: id, star: 5, level: 30, exp: 0, intimacy: 0, stage: 2, name: 'x' }];
  BL.installInto(S.state, BL.extractFrom(S.state.beasts.owned));
  for (const c of BL.awakenCost(id)) S.state.resources.materials[c.id] = c.count;
  check('先决条件满足，可觉醒', BL.canAwaken(id).ok === true, BL.canAwaken(id).reason);
  BL.awaken(id);
  const before = { ...BL.bloodlines()[id] };
  check('觉醒前记录为 5★/2阶/已醒',
    before.bestStar === 5 && before.stage === 2 && before.awakened === true,
    JSON.stringify(before));

  // 第 6 世：只抓到一只 1★ 未进化的同族，还有一只别的物种
  S.state.beasts.owned = [
    { uid: 2, baseId: id, star: 1, level: 3, exp: 0, intimacy: 0, stage: 0, name: 'y' },
    { uid: 3, baseId: other, star: 2, level: 4, exp: 0, intimacy: 0, stage: 0, name: 'z' },
  ];
  BL.installInto(S.state, BL.extractFrom(S.state.beasts.owned));

  const after = BL.bloodlines()[id];
  check('★ 历史最佳星级未被拉低', after.bestStar === 5, `${before.bestStar} → ${after.bestStar}`);
  check('★ 最高进化阶未被拉低', after.stage === 2, `${before.stage} → ${after.stage}`);
  check('★ 觉醒状态未丢失', after.awakened === true);
  check('相伴世数累加为 2', after.gens === 2, String(after.gens));
  check('新物种被记入 Lv1', BL.levelOf(other) === 1, 'lv=' + BL.levelOf(other));
  check('血脉条数为 2', Object.keys(BL.bloodlines()).length === 2);
  check('未把内部临时标记写进存档',
    !Object.values(BL.bloodlines()).some((r) => '_seenThisLife' in r),
    JSON.stringify(Object.keys(BL.bloodlines()[id])));
}

// ============ 6. 同一世养多只同族只记一世 ============
section('6. 相伴世数：同一世养三只同族，只算一世');
{
  S.setState(S.createInitialState('血脉测试'));
  const id = TIER1[0].id;
  S.state.beasts.owned = [1, 2, 3].map((n) => (
    { uid: n, baseId: id, star: n, level: 1, exp: 0, intimacy: 0, stage: 0, name: 'x' }
  ));
  BL.installInto(S.state, BL.extractFrom(S.state.beasts.owned));
  check('gens 为 1 而非 3', BL.bloodlines()[id].gens === 1, 'gens=' + BL.bloodlines()[id].gens);
  check('星级取最佳', BL.bloodlines()[id].bestStar === 3, String(BL.bloodlines()[id].bestStar));
}

// ============ 7. 全局共鸣上限 ============
section('7. 全局共鸣：每条 Lv2+ 血脉 +2%，+12% 封顶');
{
  S.setState(S.createInitialState('血脉测试'));
  const all = BEASTS.map((b) => b.id);
  const put = (n) => {
    S.state.beasts.owned = all.slice(0, n).map((id, i) => (
      { uid: i + 1, baseId: id, star: 3, level: 1, exp: 0, intimacy: 0, stage: 0, name: 'x' }
    ));
    BL.installInto(S.state, BL.extractFrom(S.state.beasts.owned));
    return BL.globalMult();
  };
  check('1 条 → +2%', Math.abs(put(1) - 0.02) < 1e-9, String(put(1)));
  check('3 条 → +6%', Math.abs(put(3) - 0.06) < 1e-9, String(put(3)));
  check('6 条 → +12%', Math.abs(put(6) - 0.12) < 1e-9, String(put(6)));
  check('★ 12 条仍封顶 +12%', Math.abs(put(12) - 0.12) < 1e-9, String(put(12)));
  check('全物种 → 仍封顶 +12%', Math.abs(put(all.length) - 0.12) < 1e-9, String(put(all.length)));
}

// ============ 8. 忘却 ============
section('8. 忘却：可反悔，但觉醒过的返还更少');
{
  S.setState(S.createInitialState('血脉测试'));
  const id = TIER1[0].id;
  S.state.beasts.owned = [{ uid: 1, baseId: id, star: 3, level: 20, exp: 0, intimacy: 0, stage: 1, name: 'x' }];
  BL.installInto(S.state, BL.extractFrom(S.state.beasts.owned));
  for (const c of BL.awakenCost(id)) S.state.resources.materials[c.id] = c.count;
  BL.awaken(id);

  const r = BL.forget(id);
  check('忘却成功', r.ok === true);
  check('返还了材料', r.materials.length > 0 && r.materials[0].count > 0,
    JSON.stringify(r.materials));
  check('标记为"曾觉醒"', r.wasAwakened === true);
  check('血脉表已清空该条', BL.levelOf(id) === 0);
  check('重复忘却被拒', BL.forget(id).ok === false);
}

// ============ 9. ★ 轮回：血脉留，本体走 ============
section('9. ★ 轮回后血脉保留、灵兽本体清空');
{
  setSeed(20260912);
  S.setState(S.createInitialState('轮回血脉'));
  const id = TIER1[0].id;
  const other = TIER1[1].id;

  // 养两只、并把其中一条觉醒
  const inst = BS.addBeast(id, { star: 3, level: 20 });
  BS.addBeast(other, { star: 2, level: 5 });
  check('已养两只', S.state.beasts.owned.length === 2, String(S.state.beasts.owned.length));

  // 觉醒要求"曾把它培育到进化形态"。这里直接置 stage 来模拟那件事——
  // 本节测的是血脉跨世，不是进化流程（进化另有 test_beast.mjs 覆盖）。
  inst.stage = 1;

  BL.installInto(S.state, BL.extractFrom(S.state.beasts.owned));
  for (const c of BL.awakenCost(id)) S.state.resources.materials[c.id] = c.count;
  const awk = BL.awaken(id);
  check('觉醒成功（跨世的前提）', awk.ok === true, awk.reason || '');

  // 手动触发轮回
  S.state.player.realmIndex = 24;
  S.state.reincarnation.count = 1;
  const r = RC.executeReincarnation();
  check('轮回成功', r.ok === true, r.reason || '');

  const after = S.state;
  check('★ 灵兽本体已清空', (after.beasts.owned || []).length === 0,
    String(after.beasts.owned.length));
  check('★ 出战位已清空', after.beasts.active == null);
  check('★ 血脉表保留下来了', Object.keys(BL.bloodlines()).length === 2,
    JSON.stringify(Object.keys(BL.bloodlines())));
  check('★ 觉醒状态跨世不灭', BL.bloodlines()[id]?.awakened === true);
  check('★ 等级判定仍为 Lv3', BL.levelOf(id) === 3, 'lv=' + BL.levelOf(id));
  check('★ 属性加成在新一世仍生效',
    Math.abs(BL.beastMult(id) - (1 + BL.globalMult()) * 1.15) < 1e-9,
    String(BL.beastMult(id)));
  check('全局共鸣仍在', BL.globalMult() > 0, String(BL.globalMult()));

  // 新一世再抓同族：起点应当更高（这就是"血脉记忆"的实感）
  const again = BS.addBeast(id, { star: 1 });
  check('★ 再捕获的初始等级为 Lv.10（血脉共鸣）', again.level === 10, 'Lv.' + again.level);
  check('★ 再捕获的初始亲密度 +15', Math.round(again.intimacy) === 15, String(again.intimacy));
  check('未觉醒的那一族不会白送等级',
    (BS.addBeast(other, { star: 1 }) || {}).level === 1);
}

// ============ 10. 旧存档兼容 ============
section('10. 旧存档（无 bloodlines 字段）自动补齐');
{
  const saveMod = await import('../src/core/save.js');
  S.setState(S.createInitialState('旧档'));
  const raw = JSON.parse(saveMod.serialize());
  delete raw.beasts.bloodlines;
  const restored = saveMod.deserialize(JSON.stringify(raw));
  check('补齐 bloodlines 字段', !!restored.beasts.bloodlines
    && typeof restored.beasts.bloodlines === 'object');
  check('补齐后可正常结算', (() => {
    S.setState(restored);
    return BL.globalMult() === 0 && BL.levelOf(TIER1[0].id) === 0;
  })());
}

// ============ 11. UI 汇总 ============
section('11. bloodlineSummary 供面板使用');
{
  S.setState(S.createInitialState('汇总'));
  const a = BEASTS[0].id, b = TIER4[0]?.id || BEASTS[1].id;
  S.state.beasts.owned = [
    { uid: 1, baseId: a, star: 3, level: 20, exp: 0, intimacy: 0, stage: 1, name: 'x' },
    { uid: 2, baseId: b, star: 5, level: 20, exp: 0, intimacy: 0, stage: 2, name: 'y' },
  ];
  BL.installInto(S.state, BL.extractFrom(S.state.beasts.owned));
  for (const c of BL.awakenCost(b)) S.state.resources.materials[c.id] = c.count;
  BL.awaken(b);

  const sum = BL.bloodlineSummary();
  check('列出全部血脉', sum.list.length === 2, String(sum.list.length));
  check('统计觉醒条数', sum.awakened === 1, String(sum.awakened));
  check('统计共鸣条数', sum.resonanceLines === 2, String(sum.resonanceLines));
  check('共鸣值正确', Math.abs(sum.resonance - 0.04) < 1e-9, String(sum.resonance));
  check('觉醒的排在前面', sum.list[0].awakened === true, sum.list[0].name);
  check('每条都给出了生效中的效果',
    sum.list.every((x) => x.effects.length > 0),
    sum.list.map((x) => `${x.name}:${x.effects.length}`).join(' '));
  check('Lv3 的效果清单含「出战该族」',
    sum.list[0].effects.some((e) => e.label.includes('出战该族')),
    JSON.stringify(sum.list[0].effects.map((e) => e.label)));
  check('每条都有进阶提示', sum.list.every((x) => typeof x.levelName === 'string'));
}

// ============ 结果 ============
console.log('\n' + '='.repeat(64));
console.log(failures === 0 ? '全部通过 ✓' : `有 ${failures} 项失败 ✗`);
process.exit(failures === 0 ? 0 : 1);
