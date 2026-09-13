/**
 * 立场系统 —— V3.0 的横切层。
 *
 * 三档立场决定玩家在这个世界里"站在哪一边"，代价与收益必须同时存在，
 * 否则它就只是"换一套加成"而已。
 *
 *   散修  —— 无加成，但也无限制：奇遇不挑你，中立 NPC 都愿交易
 *   正道  —— 加入三大宗门后获得；商店折扣、宗门内容；但魔道奇遇对你更凶险
 *   邪道  —— 主动堕入魔道；修炼与战斗有加成，但渡劫更难、物价更贵、正道内容关闭
 *
 * 本模块只负责"立场是什么、它带来什么修正"。
 * 具体把它应用到各系统，由各系统 import 本模块的纯函数完成——
 * 这样立场规则只有一处定义，不会散落成十几个魔数。
 *
 * 纯逻辑，禁止 DOM。
 */

import { state } from '../core/state.js';
import { emit, EV } from '../core/bus.js';
import { fmt, fmtPct } from '../core/format.js';
import { rand } from '../core/rng.js';
import { noteCultLoss } from '../core/telemetry.js';

/** 叛宗后多久才能再次加入宗门（毫秒） */
export const STANCE_COOLDOWN_MS = 30 * 60 * 1000;

export const STANCES = {
  sanxiu: {
    id: 'sanxiu', name: '散修', color: 'var(--text-muted)',
    desc: '无门无派，独行于天地之间',
    detail: '不受任何势力约束，奇遇不挑立场，中立之辈皆愿与你交易。',
  },
  zhengdao: {
    id: 'zhengdao', name: '正道', color: 'var(--jade)',
    desc: '以正道自持，行侠仗义',
    detail: '宗门庇佑，坊市让利；然魔道中人视你为敌，魔道奇遇凶险倍增。',
  },
  xiedao: {
    id: 'xiedao', name: '邪道', color: 'var(--accent)',
    desc: '不拘善恶，唯求己道',
    detail: '修行与杀伐皆快人一步，但天劫更难、物价更贵，且正道宗门永不收你。',
  },
};

/**
 * 邪道的修正值。集中在这里，改平衡只改这一处。
 *
 * 设计原则：即时收益（修炼/战斗）必须小于延迟代价（天劫/物价/内容关闭），
 * 否则邪道就是"纯赚"，玩家没有真正的取舍。
 */
export const XIEDAO_MODS = {
  cultSpeed: 1.15,          // 修炼速率 +15%
  combatPower: 1.10,        // 战斗属性 +10%
  tribulationDiff: 1.20,    // 天劫难度 +20%（渡劫失败代价本就沉重，这一条是主要代价）
  shopPrice: 1.30,          // 坊市价格 +30%
};

/** 正道的坊市折扣 */
export const ZHENGDAO_SHOP_DISCOUNT = 0.90;

export function currentStanceId() {
  return state.player.stance || 'sanxiu';
}

export function currentStance() {
  return STANCES[currentStanceId()] || STANCES.sanxiu;
}

export function isXiedao() {
  return currentStanceId() === 'xiedao';
}

export function isZhengdao() {
  return currentStanceId() === 'zhengdao';
}

export function isSanxiu() {
  return currentStanceId() === 'sanxiu';
}

// ==================== 各系统要用的修正函数 ====================

/** 修炼速率倍率（邪道 +15%） */
export function cultMult() {
  return isXiedao() ? XIEDAO_MODS.cultSpeed : 1;
}

/** 战斗属性倍率（邪道 +10%） */
export function combatMult() {
  return isXiedao() ? XIEDAO_MODS.combatPower : 1;
}

/** 天劫难度倍率（邪道更难） */
export function tribulationDiffMult() {
  return isXiedao() ? XIEDAO_MODS.tribulationDiff : 1;
}

/** 坊市价格倍率（正道 9 折 / 邪道 1.3 倍） */
export function shopPriceMult() {
  if (isZhengdao()) return ZHENGDAO_SHOP_DISCOUNT;
  if (isXiedao()) return XIEDAO_MODS.shopPrice;
  return 1;
}

/**
 * 奇遇的立场倾向。
 * 返回一个"好事件概率修正"，由 encounter.js 叠加到原有的气运修正上。
 * 正道更容易遇到善缘，邪道更容易招来杀劫——但邪道的好事件收益也更高。
 */
export function encounterGoodBias() {
  if (isZhengdao()) return 0.06;
  if (isXiedao()) return -0.05;   // 魔道多杀劫
  return 0;
}

/** 邪道的事件收益放大（风险与收益并存，否则没人愿意入魔） */
export function encounterRewardMult() {
  return isXiedao() ? 1.20 : 1;
}

// ==================== 立场变更 ====================

/**
 * 叛宗冷却剩余秒数。
 *
 * 注意字段在 state.player 下，**不在 state 根层**。
 * 之前这里读写的是 state.stanceCooldownUntil，而 setStance 写的是
 * state.player.stanceCooldownUntil——同一个文件里两处不一致，
 * 结果是冷却"看起来生效了"（本函数读到自己写的根层值），
 * 但宗门系统读 player 层永远是 0，冷却形同虚设。
 */
export function stanceCooldown() {
  return Math.max(0, ((state.player.stanceCooldownUntil || 0) - Date.now()) / 1000);
}

export function canChangeStance() {
  const cd = stanceCooldown();
  if (cd > 0) return { ok: false, reason: `心绪未定，还需等待 ${Math.ceil(cd / 60)} 分钟` };
  return { ok: true };
}

/**
 * 设置立场。宗门系统在拜入/叛宗时调用它。
 * @param {'sanxiu'|'zhengdao'|'xiedao'} id
 * @param {object} opts { silent, cooldown }
 */
export function setStance(id, { silent = false, cooldown = false } = {}) {
  if (!STANCES[id]) return { ok: false, reason: '未知立场' };
  if (id === currentStanceId()) return { ok: true, changed: false };

  state.player.stance = id;
  if (cooldown) state.player.stanceCooldownUntil = Date.now() + STANCE_COOLDOWN_MS;

  if (!silent) {
    const s = STANCES[id];
    log(`立场已变——你如今是【${s.name}】。${s.detail}`, id === 'xiedao' ? 'event-bad' : 'event-special');
  }
  emit(EV.STANCE_CHANGE, { stance: id });
  return { ok: true, changed: true };
}

/**
 * 堕入魔道。由奇遇的特殊选项调用。
 * 这是不可逆的重大选择，必须给玩家明确的二次确认（由 UI 负责）。
 */
export function fallToDemonic() {
  if (isXiedao()) return { ok: false, reason: '你已在魔道之中' };
  const r = setStance('xiedao', { silent: true });
  if (!r.ok) return r;

  log('═══ 堕 入 魔 道 ═══', 'event-bad');
  log(
    `你放弃了原有的道途。自此修行一日千里，然天劫难度 +${fmtPct(XIEDAO_MODS.tribulationDiff - 1)}、` +
    `物价 +${fmtPct(XIEDAO_MODS.shopPrice - 1)}，正道宗门永不收你。`,
    'event-bad',
  );
  return { ok: true };
}

/** 回到散修（叛宗时调用） */
export function returnToSanxiu({ cooldown = true } = {}) {
  return setStance('sanxiu', { silent: true, cooldown });
}

// ==================== 洗白：渡心魔劫 ====================

/**
 * 洗白的代价参数。集中在这里，改平衡只改这一处。
 *
 * "可洗白但代价重"的实现方式：
 *   - 一场独立的高难判定，**不能用丹药代劫**（丹药是玩家对天劫的常规对冲手段，
 *     若这里也能用，洗白就退化成了"备好丹药点一下"）
 *   - 失败要等很久才能再试，且道心受创
 *   - 每一世只能洗白一次（redeemed 存在 player 下，轮回时重置）——
 *     这不是漏洞，是刻意的：每世给一次回头的机会，真正的门槛是失败后的冷却
 *   - 成功后拿到"劫后余生"——不是奖励，是证明
 */
export const REDEMPTION = {
  /** 基础通过率 */
  baseChance: 0.25,
  /** 道心每超过门槛 1 点，通过率提升 */
  perDaoHeart: 0.012,
  /** 通过率上下限 */
  minChance: 0.10,
  maxChance: 0.85,
  /** 道心门槛（按境界缩放） */
  daoHeartNeed: (realmIndex) => 20 + Math.max(0, realmIndex - 9) * 1.5,
  /** 失败冷却（毫秒）：一天 */
  failCooldownMs: 24 * 60 * 60 * 1000,
  /** 失败时修为损失比例 */
  failCultLoss: 0.5,
  /** 失败时的道心损失 */
  failDaoHeartLoss: 3,
  /** 成功后获得的永久道心加成（"劫后余生"） */
  rewardDaoHeart: 10,
};

/**
 * 当前洗白的通过率（供 UI 展示，玩家应当知道自己在赌什么）。
 *
 * 这里不调 cultivation 的 calcDaoHeart()：stance.js 被 cultivation.js 引用，
 * 反向引用会形成循环。道心的构成很简单（基础 + 永久加成），就地算一次即可——
 * 但**必须与 calcDaoHeart() 的算法一致**，否则界面显示的通过率会与实际不符。
 */
function effectiveDaoHeart() {
  const base = state.player.base?.daoHeart ?? 10;
  const bonus = state.player.attributes?.daoHeart || 0;
  return base + bonus;
}

export function redemptionChance() {
  const need = REDEMPTION.daoHeartNeed(state.player.realmIndex);
  const dao = effectiveDaoHeart();
  const c = REDEMPTION.baseChance + (dao - need) * REDEMPTION.perDaoHeart;
  return Math.max(REDEMPTION.minChance, Math.min(REDEMPTION.maxChance, c));
}

export function redemptionCooldown() {
  return Math.max(0, ((state.player.redemptionCooldownUntil || 0) - Date.now()) / 1000);
}

export function canRedeem() {
  if (!isXiedao()) return { ok: false, reason: '你并未堕入魔道' };
  if (state.player.redeemed) return { ok: false, reason: '此劫一世只渡得一次，且待来世' };
  const cd = redemptionCooldown();
  if (cd > 0) {
    const h = Math.ceil(cd / 3600);
    return { ok: false, reason: `心魔未平，尚需 ${h} 个时辰` };
  }
  return { ok: true, reason: '' };
}

/**
 * 渡心魔劫 —— 洗白。
 *
 * 这是一场**没有丹药可代、没有保底可依**的判定：
 * 成功了就洗掉邪道的一切代价，失败了要付出血本。
 * 之所以要这么重，是因为如果不重，邪道就不再是"一条路"，
 * 而只是一个"先吃红利、回头再洗"的套利窗口。
 */
export function attemptRedemption() {
  const check = canRedeem();
  if (!check.ok) return { ok: false, reason: check.reason };

  const p = redemptionChance();
  const roll = rand();
  const need = REDEMPTION.daoHeartNeed(state.player.realmIndex);

  log('═══ 渡 心 魔 劫 ═══', 'event-tribulation');
  log(
    `你盘膝而坐，将这一身魔念尽数逼入识海。成，则前尘尽洗；败，则万劫不复。` +
    `（道心门槛 ${Math.round(need)}，通过之数约 ${Math.round(p * 100)}%）`,
    'event-tribulation',
  );

  if (roll < p) {
    // 成功
    state.player.stance = 'sanxiu';
    state.player.redeemed = true;
    state.player.attributes = state.player.attributes || {};
    state.player.attributes.daoHeart = (state.player.attributes.daoHeart || 0) + REDEMPTION.rewardDaoHeart;

    log('心魔散尽。你睁开眼，天光很淡，但很久没有这么干净过了。', 'event-breakthrough');
    log(
      `立场已归【散修】，邪道的天劫劣势与物价惩罚尽去。` +
      `道心永久 +${REDEMPTION.rewardDaoHeart}（劫后余生）。`,
      'event-good',
    );
    emit(EV.STANCE_CHANGE, { stance: 'sanxiu', reason: 'redemption' });
    return { ok: true, success: true, chance: p };
  }

  // 失败
  const loss = Math.floor(state.player.cult * REDEMPTION.failCultLoss);
  noteCultLoss('洗白失败', loss);
  state.player.cult = Math.max(0, state.player.cult - loss);
  state.player.base.daoHeart = Math.max(1, state.player.base.daoHeart - REDEMPTION.failDaoHeartLoss);
  state.player.redemptionCooldownUntil = Date.now() + REDEMPTION.failCooldownMs;

  log('心魔未散，反噬而来。你在识海里挣扎了整整一夜。', 'event-bad');
  log(
    `修为损失 ${fmt(loss)}，道心 -${REDEMPTION.failDaoHeartLoss}。` +
    `一日之内，你无法再试——而魔念，只会更深。`,
    'event-bad',
  );
  return { ok: true, success: false, chance: p };
}

/** 洗白状态总览（供 UI） */
export function redemptionSummary() {
  return {
    available: canRedeem(),
    chance: redemptionChance(),
    need: Math.round(REDEMPTION.daoHeartNeed(state.player.realmIndex)),
    cooldown: redemptionCooldown(),
    redeemed: !!state.player.redeemed,
  };
}

// ==================== 展示 ====================

/** 给 UI 用的立场总览 */
export function stanceSummary() {
  const s = currentStance();
  const mods = [];
  if (isXiedao()) {
    mods.push({ label: '修炼速率', value: `×${XIEDAO_MODS.cultSpeed}` });
    mods.push({ label: '战斗属性', value: `×${XIEDAO_MODS.combatPower}` });
    mods.push({ label: '天劫难度', value: `×${XIEDAO_MODS.tribulationDiff}`, bad: true });
    mods.push({ label: '坊市物价', value: `×${XIEDAO_MODS.shopPrice}`, bad: true });
  } else if (isZhengdao()) {
    mods.push({ label: '坊市物价', value: `×${ZHENGDAO_SHOP_DISCOUNT}` });
  }
  return {
    id: s.id, name: s.name, desc: s.desc, detail: s.detail, color: s.color,
    mods,
    cooldown: stanceCooldown(),
    canChange: canChangeStance().ok,
  };
}

// 主循环不需要每帧做什么，但保留接口以便后续加"立场随时间漂移"之类的机制
export function tick() { /* 暂无 */ }

function log(text, cls) {
  emit(EV.LOG, { text, cls, channel: 'system' });
}
