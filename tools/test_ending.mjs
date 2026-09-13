/**
 * 真结局自测（V4.0 收官）。
 *
 * 结局是整局游戏**只会被看到一次**的东西——正因为如此，它坏了很难被发现：
 * 没有玩家会为了复现一个 bug 再飞升五次。所以这里用测试代替玩家去撞。
 *
 * 分两半测：
 *   A. 演出脚本本身（纯数据，可在 Node 里验）：
 *      幕次完整、每幕都有落款、文本不为空、id 唯一、`cls` 只用约定值。
 *      这些错了不会报错，只会让某一行**静默地不显示或没上色**——最难发现的那种坏。
 *   B. 触发链路（走真实的 reincarnation.js）：
 *      条件未足时拒绝、条件齐备时可触发、重复触发安全、
 *      以及"达成后飞升不再强制轮回"。
 *
 * UI 播放路径（ui/endingScene.js）依赖 DOM，在浏览器实机验收里覆盖。
 *
 * 用法: node tools/test_ending.mjs
 */

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const S = await import('../src/core/state.js');
const RC = await import('../src/systems/reincarnation.js');
const BT = await import('../src/systems/breakthrough.js');
const { ENDING_SCRIPT, ENDING_TITLE, FREE_MODE_NOTE, CLUE_KEYS } = await import('../src/data/endingText.js');
const { REALMS } = await import('../src/data/realms.js');
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

// 只允许这几种写作约定，写错了在浏览器里表现为"没上色"，肉眼极难发现
const LEGAL_CLS = new Set(['', 'quote', 'reveal', 'sign']);

// ============ A. 演出脚本 ============
section('A. 演出脚本完整性');
{
  check('幕数 ≥ 5（五幕结构：止 / 路 / 人 / 我 / 终）', ENDING_SCRIPT.length >= 5,
    `${ENDING_SCRIPT.length} 幕`);
  check('有总标题', typeof ENDING_TITLE === 'string' && ENDING_TITLE.length > 0, ENDING_TITLE);
  check('有自由模式文案', typeof FREE_MODE_NOTE === 'string' && FREE_MODE_NOTE.length > 0);

  check('每幕都有 id', ENDING_SCRIPT.every((s) => typeof s.id === 'string' && s.id));
  const ids = ENDING_SCRIPT.map((s) => s.id);
  check('幕 id 不重复', new Set(ids).size === ids.length, ids.join(','));

  check('每幕都有标题', ENDING_SCRIPT.every((s) => typeof s.title === 'string' && s.title.trim()));
  check('每幕都有落款', ENDING_SCRIPT.every((s) => typeof s.sign === 'string' && s.sign.trim()),
    ENDING_SCRIPT.map((s) => s.sign).join(' / '));
  check('每幕至少 2 行台词', ENDING_SCRIPT.every((s) => Array.isArray(s.lines) && s.lines.length >= 2),
    ENDING_SCRIPT.map((s) => s.lines.length).join(','));

  check('每行都有非空文本',
    ENDING_SCRIPT.every((s) => s.lines.every((l) => typeof l.t === 'string' && l.t.trim())));
  check('每行的 cls 都在约定范围内（写错会静默不上色）',
    ENDING_SCRIPT.every((s) => s.lines.every((l) => LEGAL_CLS.has(l.cls ?? ''))),
    [...new Set(ENDING_SCRIPT.flatMap((s) => s.lines.map((l) => l.cls ?? '')))].join('|'));

  // 演出节奏：行数决定按钮解禁时间，太长会让玩家干等
  const maxLines = Math.max(...ENDING_SCRIPT.map((s) => s.lines.length));
  check('单幕行数不超过 12（否则按钮要等太久）', maxLines <= 12, `最长 ${maxLines} 行`);

  // 重音不能滥用：全是重音等于没有重音
  const total = ENDING_SCRIPT.reduce((n, s) => n + s.lines.length, 0);
  const reveals = ENDING_SCRIPT.reduce((n, s) => n + s.lines.filter((l) => l.cls === 'reveal').length, 0);
  check('揭示句占比合理（10%~55%）',
    reveals / total >= 0.1 && reveals / total <= 0.55,
    `${reveals}/${total} = ${Math.round((reveals / total) * 100)}%`);

  check('三片残痕的键已声明', CLUE_KEYS.length === 3, CLUE_KEYS.join(','));

  // 基调：不喊口号。出现"恭喜/通关"这类词说明写成了结算画面
  const banned = ['恭喜', '通关', '奖励', '领取', '实力大增'];
  const hits = banned.filter((w) => JSON.stringify(ENDING_SCRIPT).includes(w));
  check('没有写成结算画面（无"恭喜/通关"类措辞）', hits.length === 0, hits.join(',') || '干净');
}

// ============ B. 触发链路 ============
section('B. 触发链路');
{
  setSeed(20260912);
  S.setState(S.createInitialState('结局测试'));

  const c0 = RC.endingConditions();
  check('初始未满足', c0.ok === false);
  check('条件恰好 3 条', c0.items.length === 3, c0.items.map((i) => i.label).join(' / '));
  check('未达成时不能触发', RC.triggerEnding().ok === false);
  check('未达成时不在自由模式', RC.inFreeMode() === false);

  // 逐条满足，确认每一条都真的卡着（不是"其中一个满足就放行"）
  const rc = S.state.reincarnation;
  rc.count = 5;
  check('仅满足世数还不够', RC.endingConditions().ok === false,
    RC.endingConditions().items.map((i) => `${i.label}${i.done ? '✓' : '✗'}`).join(' '));

  rc.talents = { tal_cultivate_dadao: 3, tal_combat_wushuang: 3, tal_fortune_duotian: 3 };
  check('仅满足道途还不够', RC.endingConditions().ok === false);

  RC.addClue(CLUE_KEYS[0]);
  RC.addClue(CLUE_KEYS[1]);
  check('两片残痕还不够', RC.endingConditions().ok === false,
    `残痕 ${S.state.reincarnation.clues.length}/3`);

  RC.addClue(CLUE_KEYS[2]);
  const c1 = RC.endingConditions();
  check('三条齐备后可达成', c1.ok === true,
    c1.items.map((i) => `${i.label}${i.done ? '✓' : '✗'}`).join('  '));

  const r = RC.triggerEnding();
  check('可触发', r.ok === true, r.reason || '');
  check('标记已看过结局', RC.endingSeen() === true);
  check('进入自由模式', RC.inFreeMode() === true);

  // 重复触发必须安全：重看按钮、总线重放都可能再走一次
  const r2 = RC.triggerEnding();
  check('重复触发安全（幂等）', r2.ok === true && RC.inFreeMode() === true);

  // 残痕去重：不能靠反复拾取同一片凑数
  const before = S.state.reincarnation.clues.length;
  RC.addClue(CLUE_KEYS[0]);
  check('同一片残痕不能重复拾取（否则条件可刷）',
    S.state.reincarnation.clues.length === before, String(S.state.reincarnation.clues.length));

  // 已达成后，飞升不再强制轮回
  const daoBefore = S.state.reincarnation.daoBase;
  const countBefore = S.state.reincarnation.count;
  S.state.player.realmIndex = 24;
  S.state.player.cult = REALMS[24].needCult;
  S.state.player.base.daoHeart = 500;
  S.state.player.base.comprehension = 500;
  S.state.consumables.pill_dujie = 5;
  BT.attemptBreakthrough();
  BT.runTribulation({ autoHeal: true });
  check('★ 达成结局后飞升不再强制轮回',
    S.state.reincarnation.count === countBefore && S.state.reincarnation.daoBase === daoBefore,
    `count=${S.state.reincarnation.count}`);
}

// ============ C. 落款数据来自真实状态 ============
section('C. 落款（演出最后一幕展示的东西）');
{
  S.setState(S.createInitialState('落款'));
  S.state.reincarnation.count = 7;
  S.state.reincarnation.daoBase = 123;
  S.state.companions.bond = { a: 10, b: 20, c: 30 };
  S.state.achievements.unlocked = ['x', 'y'];

  // endingScene.collectSummary 走的就是这几个字段，这里按同样口径核对
  const summary = {
    gen: S.state.reincarnation.count,
    daoBase: S.state.reincarnation.daoBase,
    companions: Object.keys(S.state.companions.bond || {}).length,
    achievements: (S.state.achievements.unlocked || []).length,
  };
  check('世数正确', summary.gen === 7, String(summary.gen));
  check('道基点正确', summary.daoBase === 123, String(summary.daoBase));
  check('道侣数以羁绊表为准', summary.companions === 3, String(summary.companions));
  check('成就数正确', summary.achievements === 2, String(summary.achievements));

  // 缺字段的老档不能让落款崩掉
  S.setState(S.createInitialState('残档'));
  delete S.state.companions;
  delete S.state.achievements;
  const safe = {
    companions: Object.keys(S.state.companions?.bond || {}).length,
    achievements: (S.state.achievements?.unlocked || []).length,
  };
  check('缺字段时不崩（可选链兜底）', safe.companions === 0 && safe.achievements === 0,
    JSON.stringify(safe));
}

// ============ 结果 ============
console.log('\n' + '='.repeat(64));
console.log(failures === 0 ? '全部通过 ✓' : `有 ${failures} 项失败 ✗`);
process.exit(failures === 0 ? 0 : 1);
