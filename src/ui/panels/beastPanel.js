/**
 * 灵兽面板。
 *
 * 子标签：灵兽 / 详情 / 孵化 / 图鉴。
 *
 * ⚠ 严格走 src/ui/panel.js 的 createPanel 模式：
 *   结构 = 子标签、拥有列表（uid/baseId/star/stage/level）、蛋列表、出战 uid  → 变了才重建
 *   数值 = 亲密度、等级/经验、孵化倒计时、技能解锁状态、可进化性              → 每帧只改文字/宽度
 * 特别注意：**亲密度与倒计时绝不能进 structure**，否则面板会每秒重建，
 * 玩家的滚动位置会被弹回顶部、悬停按钮会闪（V2.0 的老 bug，见版本规划 3.1）。
 */

import { state } from '../../core/state.js';
import { ROLE_NAMES, beastById, evolutionChain } from '../../data/beasts.js';
import {
  beastSummary, eggStatus, beastCollection, hatchableSummary, hatchByMaterial,
  setActive, releaseBeast, evolve, canEvolve,
} from '../../systems/beast.js';
import {
  bloodlineSummary, awaken, forget, bloodlines, matName as bloodMatName,
  RESONANCE_CAP, RESONANCE_PER_LINE,
} from '../../systems/bloodline.js';
import { fmt } from '../../core/format.js';
import { esc } from '../dom.js';
import { toast } from '../toast.js';
import { confirmModal } from '../modal.js';
import { createPanel, setText, setWidth, setDisabled, toggleClass, countdownText } from '../panel.js';
import { signature } from '../render.js';
import { forceRender } from '../../core/loop.js';
import { svg, ICON_REALM, ICON_LOCK, ICON_MATERIAL } from '../../assets/svg.js';

/** roster 灵兽 | detail 详情 | eggs 孵化 | blood 血脉 | codex 图鉴 */
let beastTab = 'roster';
/** 详情页正在看的灵兽 uid（null 时自动落到出战或第一只） */
let detailUid = null;

const TAB_LABEL = {
  roster: '灵 兽', detail: '详 情', eggs: '孵 化', blood: '血 脉', codex: '图 鉴',
};
const STAR_CHAR = '★';
const EMPTY_STAR = '☆';

// ==================== 小工具 ====================

/** ★★★☆☆ */
function starText(star, max = 5) {
  const s = Math.max(0, Math.min(max, star | 0));
  return STAR_CHAR.repeat(s) + EMPTY_STAR.repeat(Math.max(0, max - s));
}

function roleTag(role) {
  const name = ROLE_NAMES[role] || '灵兽';
  const cls = role === 'attack' ? 'tag-gold' : role === 'tank' ? 'tag-jade' : 'tag';
  return `<span class="tag ${cls}">${esc(name)}</span>`;
}

function tierTag(tier) {
  return `<span class="tag">${esc(String(tier))} 阶</span>`;
}

function roleCritText(role) {
  return { attack: '高攻高身法，善速杀', tank: '厚血高防，善磨战', support: '续航增益，善持久' }[role] || '';
}

/** 当前该看哪只灵兽：优先 detailUid，否则出战的那只，再否则第一只 */
function resolveDetail(list) {
  if (detailUid != null) {
    const hit = list.find((b) => b.uid === detailUid);
    if (hit) return hit;
  }
  return list.find((b) => b.active) || list[0] || null;
}

// ==================== 面板 ====================

export const beastPanel = createPanel({
  id: 'beast',

  structure() {
    const owned = state.beasts?.owned || [];
    const eggs = state.beasts?.eggs || [];
    // 只有"结构性"的东西：有哪些灵兽、什么形态、几级、谁出战、有哪些蛋
    const ownedKey = owned
      .map((b) => `${b.uid}.${b.baseId}.${b.star}.${b.stage}.${b.level}.${state.beasts.active === b.uid ? 1 : 0}`)
      .join(',');
    const eggKey = eggs.map((e) => `${e.uid}.${e.baseId}`).join(',');
    // 血脉必须进指纹：觉醒只改血脉表、不动拥有的灵兽，
    // 若不进指纹，点完「觉醒」按钮的文案会卡在「觉醒」不变（面板不重建）。
    const bloodKey = Object.entries(bloodlines())
      .map(([id, r]) => `${id}.${r.bestStar || 0}.${r.stage || 0}.${r.gens || 0}.${r.awakened ? 1 : 0}`)
      .join(',');
    return signature(beastTab, detailUid ?? 0, ownedKey, eggKey, owned.length, bloodKey);
  },

  build(host) {
    const list = beastSummary();
    const eggs = eggStatus();
    const detail = resolveDetail(list);

    const tabs = Object.entries(TAB_LABEL).map(([id, label]) => {
      let extra = '';
      if (id === 'roster' && list.length) extra = ` ${list.length}`;
      if (id === 'eggs' && eggs.length) extra = ` ${eggs.length}`;
      return `<button class="btn btn-sm ${beastTab === id ? 'btn-gold' : ''}"
        data-beast-tab="${id}" type="button">${esc(label + extra)}</button>`;
    }).join('');

    let body = '';
    if (beastTab === 'roster') body = rosterView(list);
    else if (beastTab === 'detail') body = detailView(detail);
    else if (beastTab === 'eggs') body = eggView(eggs, hatchableSummary());
    else if (beastTab === 'blood') body = bloodView();
    else body = codexView();

    host.innerHTML = `
      <div class="panel-title">
        <span style="display:inline-flex;align-items:center;gap:6px;">
          ${svg(ICON_REALM, 18)}灵 兽
        </span>
        <span class="pt-extra" data-beast-head></span>
      </div>
      <div class="row mb-2" style="gap:4px;flex-wrap:wrap;">${tabs}</div>
      ${body}
    `;

    host.querySelectorAll('[data-beast-tab]').forEach((b) => {
      b.addEventListener('click', () => {
        if (b.dataset.beastTab === beastTab) return;
        beastTab = b.dataset.beastTab;
        forceRender();
      });
    });
    host.querySelectorAll('[data-beast-active]').forEach((b) => {
      b.addEventListener('click', () => doSetActive(Number(b.dataset.beastActive)));
    });
    host.querySelectorAll('[data-beast-detail]').forEach((b) => {
      b.addEventListener('click', () => {
        detailUid = Number(b.dataset.beastDetail);
        beastTab = 'detail';
        forceRender();
      });
    });
    host.querySelectorAll('[data-beast-release]').forEach((b) => {
      b.addEventListener('click', () => doRelease(Number(b.dataset.beastRelease)));
    });
    host.querySelectorAll('[data-beast-evolve]').forEach((b) => {
      b.addEventListener('click', () => doEvolve(Number(b.dataset.beastEvolve)));
    });
    host.querySelectorAll('[data-beast-hatch]').forEach((b) => {
      b.addEventListener('click', () => doHatch(b.dataset.beastHatch));
    });
    host.querySelectorAll('[data-blood-awaken]').forEach((b) => {
      b.addEventListener('click', () => doAwaken(b.dataset.bloodAwaken));
    });
    host.querySelectorAll('[data-blood-forget]').forEach((b) => {
      b.addEventListener('click', () => doForget(b.dataset.bloodForget));
    });
  },

  refresh(host) {
    const list = beastSummary();
    const byUid = new Map(list.map((b) => [b.uid, b]));

    // ---- 顶部：收集进度 ----
    const col = beastCollection();
    setText(host, '[data-beast-head]', `${col.discovered} / ${col.total} 已收录`);

    // ---- 每只灵兽：等级 / 经验 / 亲密度（只改文字与条宽，不碰 DOM 结构）----
    for (const el of host.querySelectorAll('[data-b-lv]')) {
      const b = byUid.get(Number(el.dataset.bLv));
      if (b) setText(host, el, `Lv.${b.level} / ${b.levelCap}`);
    }
    for (const el of host.querySelectorAll('[data-b-exp]')) {
      const b = byUid.get(Number(el.dataset.bExp));
      if (b) setText(host, el, `修为 ${fmt(b.exp)} / ${fmt(b.expNeed)}`);
    }
    for (const el of host.querySelectorAll('[data-b-inti-text]')) {
      const b = byUid.get(Number(el.dataset.bIntiText));
      if (b) setText(host, el, `亲密 ${b.intimacy} · ${b.intimacyText}`);
    }
    for (const el of host.querySelectorAll('[data-b-inti-bar]')) {
      const b = byUid.get(Number(el.dataset.bIntiBar));
      if (b) setWidth(host, el, b.intimacy);
    }
    // 出战按钮文案（出战状态本身在 structure 里，这里只是保险）
    for (const el of host.querySelectorAll('[data-beast-active]')) {
      const b = byUid.get(Number(el.dataset.beastActive));
      if (b) setText(host, el, b.active ? '召回' : '出战');
    }

    // ---- 详情页：属性数值 + 技能解锁态 ----
    const d = resolveDetail(list);
    if (d) {
      for (const el of host.querySelectorAll('[data-d-stat]')) {
        const key = el.dataset.dStat;
        const v = d.stats?.[key];
        setText(host, el, key === 'crit' ? `${(v * 100).toFixed(1)}%` : fmt(v));
      }
      setText(host, '[data-d-level]', `Lv.${d.level} / ${d.levelCap}`);
      setText(host, '[data-d-inti]', `亲密 ${d.intimacy} · ${d.intimacyText}`);
      setWidth(host, '[data-d-inti-bar]', d.intimacy);
      // 技能解锁态：技能行 always 存在，这里只切锁与文字
      const unlocked = new Set(d.skills.map((s) => s.id));
      for (const el of host.querySelectorAll('[data-d-skill]')) {
        const on = unlocked.has(el.dataset.dSkill);
        toggleClass(host, el, 'locked', !on);
        const st = el.querySelector('[data-d-skill-state]');
        if (st) {
          const text = on ? '已通' : (el.dataset.dSkillLock || '未通');
          if (st.textContent !== text) st.textContent = text;
        }
      }
      // 可进化性（等级/材料会变，但按钮文案只跟 canEvolve 走）
      const ce = canEvolve(d.uid);
      setText(host, '[data-d-evolve-hint]', ce.ok ? '条件已足，可以进化' : ce.reason);
      setDisabled(host, '[data-beast-evolve]', !ce.ok);
      toggleClass(host, '[data-beast-evolve]', 'btn-gold', ce.ok);
    }

    // ---- 孵化倒计时（绝对时间戳，每秒只改文字）----
    const eggMap = new Map(eggStatus().map((e) => [e.uid, e]));
    for (const el of host.querySelectorAll('[data-egg-cd]')) {
      const e = eggMap.get(Number(el.dataset.eggCd));
      if (!e) continue;
      setText(host, el, e.ready ? '即将破壳' : `${countdownText(e.remaining)}后破壳`);
    }

    // ---- 孵化页：取卵按钮的可取性（灵材数量随时在变，只改文案与 disabled）----
    // 物种清单本身是静态的，所以留在 structure 里；这里只刷"此刻够不够料"。
    for (const h of hatchableSummary()) {
      setText(host, `[data-hatch-reason="${h.id}"]`, h.canHatch ? '' : h.reason);
      setDisabled(host, `[data-beast-hatch="${h.id}"]`, !h.canHatch);
    }
  },
});

// ==================== 灵兽列表 ====================

function rosterView(list) {
  if (list.length === 0) {
    return `<div class="list-empty">
      尚无灵兽随行。<br>
      可于秘境探险中捕捉、宗门宝库中兑换，或孵化灵兽蛋。<br>
      <span class="muted small">灵兽资质（★）天生，不可更改——多寻几处，自有良驹。</span>
    </div>`;
  }
  return `<div class="list">${list.map(rosterRow).join('')}</div>`;
}

function rosterRow(b) {
  return `
    <div class="list-item ${b.active ? 'equipped' : ''}">
      <div class="li-main">
        <div class="li-name">
          ${esc(b.name)}
          <span style="color:var(--gold);letter-spacing:1px;">${starText(b.star)}</span>
          ${tierTag(b.tier)}
          ${roleTag(b.role)}
          ${b.active ? '<span class="tag tag-jade">出战</span>' : ''}
          ${b.stage > 0 ? `<span class="tag tag-gold">${b.stage} 阶</span>` : ''}
        </div>
        <div class="li-desc num">
          <span data-b-lv="${b.uid}">Lv.${b.level} / ${b.levelCap}</span>
          <span class="muted"> · </span>
          <span class="muted" data-b-exp="${b.uid}">修为 ${fmt(b.exp)} / ${fmt(b.expNeed)}</span>
        </div>
        <div class="bar" style="margin:4px 0;">
          <div class="bar-fill" data-b-inti-bar="${b.uid}" style="width:0%"></div>
          <div class="bar-text" data-b-inti-text="${b.uid}">亲密 ${b.intimacy}</div>
        </div>
        <div class="li-desc">${esc(b.desc)}</div>
      </div>
      <div class="li-actions" style="flex-direction:column;">
        <button class="btn btn-sm ${b.active ? 'btn-danger' : 'btn-jade'}"
          data-beast-active="${b.uid}" type="button">${b.active ? '召回' : '出战'}</button>
        <button class="btn btn-sm" data-beast-detail="${b.uid}" type="button">详情</button>
        <button class="btn btn-sm" data-beast-release="${b.uid}" type="button">放生</button>
      </div>
    </div>`;
}

// ==================== 详情页 ====================

function detailView(b) {
  if (!b) {
    return '<div class="list-empty">尚无灵兽。先去捕捉或孵化一只吧。</div>';
  }
  const st = b.stats || {};
  const base = beastById(b.baseId);
  const chain = evolutionChain(b.baseId);
  const ce = b.canEvolve;

  const chainHTML = chain.map((c, i) => {
    const here = c.id === b.baseId;
    const reached = chain.findIndex((x) => x.id === b.baseId) >= i;
    const tag = here ? 'tag-gold' : reached ? '' : 'muted';
    return `
      ${i > 0 ? '<span class="muted" style="margin:0 4px;">→</span>' : ''}
      <span class="tag ${tag}" title="${esc(c.desc || '')}">${esc(c.name)}</span>`;
  }).join('');

  const skillsHTML = b.allSkills.map((s) => {
    const on = b.skills.some((x) => x.id === s.id);
    const stageNeed = (s.unlockStage || 0) > (b.stage || 0);
    const intiNeed = (s.unlockIntimacy || 0) > b.intimacy;
    const stateText = on ? '已通'
      : stageNeed ? `需 ${s.unlockStage} 阶进化`
        : intiNeed ? `亲密度 ${s.unlockIntimacy} 解锁` : '未通';
    return `
      <div class="list-item ${on ? '' : 'locked'}" data-d-skill="${esc(s.id)}"
        data-d-skill-lock="${esc(stateText)}">
        <div class="li-main">
          <div class="li-name">
            ${on ? svg(ICON_REALM, 14) : svg(ICON_LOCK, 14)}
            ${esc(s.name)}
            <span class="tag">${esc(skillKindName(s.kind))} ${s.power != null ? esc(String(s.power)) : ''}</span>
          </div>
          <div class="li-desc">${esc(s.desc || '')}</div>
        </div>
        <div class="li-actions">
          <span class="small ${on ? 'tag-jade' : 'muted'} tag" data-d-skill-state>${esc(stateText)}</span>
        </div>
      </div>`;
  }).join('');

  const matIcon = svg(ICON_MATERIAL, 14);

  return `
    <div class="list-item" style="align-items:flex-start;">
      <div class="li-main">
        <div class="li-name">
          ${esc(b.name)}
          <span style="color:var(--gold);letter-spacing:1px;">${starText(b.star)}</span>
          ${tierTag(b.tier)} ${roleTag(b.role)}
          ${b.active ? '<span class="tag tag-jade">出战</span>' : '<span class="tag">待命</span>'}
        </div>
        <div class="li-desc muted">${esc(b.desc)}</div>
        <div class="li-desc" style="font-style:italic;">${esc(b.lore)}</div>
      </div>
    </div>

    <div class="panel-title mt-2" style="font-size:14px;">
      <span>属 性</span>
      <span class="pt-extra" data-d-level>Lv.${b.level} / ${b.levelCap}</span>
    </div>
    <div class="list" style="margin-bottom:8px;">
      <div class="list-item">
        <div class="li-main">
          <div class="li-desc num">
            气血 <b data-d-stat="maxHp">${fmt(st.maxHp)}</b> ·
            攻击 <b data-d-stat="atk">${fmt(st.atk)}</b> ·
            防御 <b data-d-stat="def">${fmt(st.def)}</b>
          </div>
          <div class="li-desc num">
            身法 <b data-d-stat="spd">${fmt(st.spd)}</b> ·
            暴击 <b data-d-stat="crit">${((st.crit || 0) * 100).toFixed(1)}%</b> ·
            暴伤 ×${st.critDmg}
          </div>
          <div class="li-desc muted">${esc(roleCritText(b.role))}｜资质 ${b.star} 星，每星成长 +8%</div>
          <div class="li-desc small num">${multBreakdownHTML(st)}</div>
        </div>
      </div>
    </div>

    <div class="bar" style="margin-bottom:8px;">
      <div class="bar-fill" data-d-inti-bar style="width:0%"></div>
      <div class="bar-text" data-d-inti>亲密 ${b.intimacy} · ${b.intimacyText}</div>
    </div>

    <div class="panel-title mt-2" style="font-size:14px;"><span>进 化 树</span></div>
    <div class="row mb-2" style="flex-wrap:wrap;align-items:center;gap:2px;">${chainHTML}</div>
    <div class="list" style="margin-bottom:8px;">
      <div class="list-item">
        <div class="li-main">
          <div class="li-desc">
            ${ce.toName
              ? `下一形态 <b>${esc(ce.toName)}</b> · 需 ${esc(String(b.evolveLevel))} 级（当前 ${b.level}）`
              : '已至最终形态，再无进境。'}
          </div>
          ${ce.cost && ce.cost.length
            ? `<div class="li-desc num">${matIcon} ${ce.cost.map((c) => `${esc(matName(c.id))}×${c.count}`).join('、')}</div>`
            : ''}
          <div class="li-desc ${ce.ok ? 'tag-jade' : 'muted'}" data-d-evolve-hint>${esc(ce.reason || '条件已足，可以进化')}</div>
        </div>
        <div class="li-actions">
          <button class="btn btn-sm ${ce.ok ? 'btn-gold' : ''}" data-beast-evolve="${b.uid}"
            type="button" ${ce.ok ? '' : 'disabled'}>进 化</button>
        </div>
      </div>
    </div>

    <div class="panel-title mt-2" style="font-size:14px;"><span>神 通</span>
      <span class="pt-extra">${b.skills.length} / ${b.allSkills.length}</span></div>
    <div class="list">${skillsHTML || '<div class="list-empty">此兽暂无神通。</div>'}</div>
  `;
}

/**
 * 灵兽属性的乘算来源。
 *
 * 血脉是 V5.0 新加的乘算，与资质是**相乘**关系（1.02 × 1.15 这类）。
 * 不摊开的话，玩家看到攻击力涨了却完全不知道涨在哪——
 * 尤其血脉加成是跨世累积的，更难自己归因。
 */
function multBreakdownHTML(st) {
  const m = st?.multParts;
  if (!m) return '';
  const pct = (v) => `${v >= 1 ? '+' : ''}${Math.round((v - 1) * 100)}%`;
  const parts = [`资质 ×${m.star.toFixed(2)}（${pct(m.star)}）`];
  if (Math.abs(m.blood - 1) > 1e-9) {
    parts.push(`血脉 ×${m.blood.toFixed(2)}（${pct(m.blood)}）`);
  }
  parts.push(`合计 ×${m.total.toFixed(3)}`);
  return `加成来源：${parts.map(esc).join(' × ')}`;
}

function skillKindName(kind) {
  return { damage: '伤', heal: '疗', buff: '增益', debuff: '削弱', guard: '护主' }[kind] || kind;
}

function matName(id) {
  return {
    mat_shougu: '兽骨', mat_yaoxue: '妖血', mat_yaodan: '妖丹', mat_neidan: '内丹',
    mat_lingzhi: '灵芝草', mat_xueshen: '血参', mat_jiuyelian: '九叶莲',
  }[id] || id;
}

// ==================== 孵化页 ====================

function eggView(eggs, hatchables) {
  // 孵化中的蛋。空态不再写死"去哪弄蛋"—— 下方就是答案，重复一遍反而啰嗦。
  const eggList = eggs.length
    ? `<div class="list">${eggs.map((e) => {
      const base = beastById(e.baseId);
      return `
      <div class="list-item ${e.ready ? '' : 'locked'}">
        <div class="li-main">
          <div class="li-name">
            ${esc(e.name)} 之蛋
            ${tierTag(e.tier)}
            ${base?.eggFrom ? `<span class="tag">${esc(matName(base.eggFrom))} 所化</span>` : ''}
          </div>
          <div class="li-desc num" data-egg-cd="${e.uid}">${e.ready ? '即将破壳' : countdownText(e.remaining) + '后破壳'}</div>
        </div>
        <div class="li-actions">
          <span class="tag ${e.ready ? 'tag-jade' : ''}">${e.ready ? '将出' : '孵化中'}</span>
        </div>
      </div>`;
    }).join('')}</div>`
    : `<div class="list-empty">尚无灵兽蛋。<span class="muted small">蛋用绝对时间计时，关掉游戏也会继续孵化。</span></div>`;

  const hatchRows = hatchables.map((h) => `
      <div class="list-item">
        <div class="li-main">
          <div class="li-name">${esc(h.name)} ${tierTag(h.tier)} ${roleTag(h.role)}</div>
          <div class="li-desc">${esc(h.desc)}</div>
          <div class="li-desc num">
            需 ${esc(matName(h.cost.id))} ×${h.cost.count} · 孵 ${esc(countdownText(h.cost.seconds))}
          </div>
          <div class="li-desc muted small" data-hatch-reason="${esc(h.id)}"></div>
        </div>
        <div class="li-actions">
          <button class="btn btn-sm" data-beast-hatch="${esc(h.id)}" type="button">取 卵</button>
        </div>
      </div>`).join('');

  return `
    <div class="list-item">
      <div class="li-main">
        <div class="li-name">孵 化</div>
        <div class="li-desc muted small">
          备齐灵材即可取卵；破壳时的资质（★）当场重掷，同一种兽反复孵，总能等到好的。<br>
          此处只出<b>进化链的链首</b>与不在链上的独兽，高阶形态仍须自己一步步养上去。
        </div>
      </div>
    </div>
    ${eggList}
    <div class="list">${hatchRows}</div>
  `;
}

// ==================== 血脉 ====================

/**
 * 血脉记忆页。
 *
 * 这一页要回答的问题是「我上一世养的灵兽，到底给我留下了什么」。
 * 所以**不能只列个名字**——每条血脉都必须把它此刻生效的每一条效果摊开写清楚，
 * 玩家才知道值不值得为它再去抓一只同族。
 */
/**
 * 共鸣进度的那句话。
 * 必须按实际情况生成——写死「再有一条即可提升」在已达上限时就是错的，
 * 而玩家恰恰最会在满级时盯着这句话看。
 */
function resonanceHint(b) {
  const maxLines = Math.ceil(RESONANCE_CAP / RESONANCE_PER_LINE);
  const full = Math.round(RESONANCE_CAP * 100);
  const have = b.resonanceLines;
  if (have >= maxLines) return `共鸣已至圆满（${maxLines} 条「相知」以上血脉，+${full}% 封顶）。`;
  return `每条「相知」以上血脉都在供养全局共鸣：现有 ${have} 条，`
    + `再有 ${maxLines - have} 条即可至 +${full}%。`;
}

function bloodView() {
  const b = bloodlineSummary();

  if (b.total === 0) {
    return `<div class="list-empty">
      血脉空白。<br>
      灵兽本体不随轮回带走，但你养过它们的经验会留下。<br>
      <span class="muted small">养过一族灵兽，那一族便会记入血脉；再遇同族时，起点更高。</span>
    </div>`;
  }

  const head = `
    <div class="list-item">
      <div class="li-main">
        <div class="li-name">血 脉 共 鸣</div>
        <div class="li-desc">
          已记血脉 <b>${b.total}</b> 条，其中觉醒 <b class="highlight">${b.awakened}</b> 条。
        </div>
        <div class="li-desc num">
          全局共鸣：全部灵兽属性 <b class="jade">+${Math.round(b.resonance * 100)}%</b>
          <span class="muted">（每条「相知」以上血脉 +2%，上限 +12%）</span>
        </div>
        <div class="li-desc muted small">${resonanceHint(b)}</div>
      </div>
    </div>`;

  const rows = b.list.map((x) => {
    const lvTag = x.level >= 3
      ? '<span class="tag tag-gold">共鸣</span>'
      : x.level >= 2
        ? '<span class="tag tag-jade">相知</span>'
        : '<span class="tag">相识</span>';
    const stars = '★'.repeat(Math.max(1, x.bestStar));
    const ca = x.canAwaken;
    const effects = x.effects.length
      ? `<div class="li-desc num">${x.effects.map((e) =>
          `${esc(e.label)} <b>${esc(e.value)}</b>`).join(' · ')}</div>`
      : '<div class="li-desc muted">尚未产生效果。</div>';

    const awakenHTML = x.awakened
      ? '<span class="tag tag-gold">血脉已醒</span>'
      : ca.ok
        ? `<button class="btn btn-sm btn-gold" data-blood-awaken="${esc(x.baseId)}" type="button">觉 醒</button>`
        : `<button class="btn btn-sm" type="button" disabled>觉 醒</button>`;

    return `
      <div class="list-item ${x.awakened ? 'equipped' : ''}">
        <div class="li-main">
          <div class="li-name">
            ${esc(x.name)} ${lvTag}
            <span style="color:var(--gold);letter-spacing:1px;">${stars}</span>
            ${x.stage > 0 ? `<span class="tag tag-gold">${x.stage} 阶</span>` : ''}
            ${x.owned ? '<span class="tag tag-jade">此世在侧</span>' : ''}
            <span class="tag">相伴 ${x.gens} 世</span>
          </div>
          ${effects}
          ${!x.awakened && !ca.ok && ca.reason
            ? `<div class="li-desc muted small">觉醒条件：${esc(ca.reason)}</div>` : ''}
          ${!x.awakened && ca.ok
            ? `<div class="li-desc num small">觉醒需 ${ca.cost.map((c) =>
                `${esc(bloodMatName(c.id))}×${c.count}`).join('、')}</div>` : ''}
        </div>
        <div class="li-actions" style="flex-direction:column;">
          ${awakenHTML}
          <button class="btn btn-sm" data-blood-forget="${esc(x.baseId)}" type="button">忘 却</button>
        </div>
      </div>`;
  }).join('');

  return `${head}
    <div class="small muted mt-2 mb-1">
      血脉是「中保留」的灵兽那一半：本体不留，记忆留下。
    </div>
    <div class="list">${rows}</div>`;
}

async function doAwaken(baseId) {
  const b = bloodlineSummary().list.find((x) => x.baseId === baseId);
  if (!b) return;
  const ok = await confirmModal(
    '血 脉 觉 醒',
    `以灵材唤醒【${b.name}】的血脉共鸣。觉醒后，此族再临之时全属性大涨——`
    + `但灵兽本体不随轮回带走，这份力量要等下一世才用得上。确定吗？`,
    { okText: '觉 醒' },
  );
  if (!ok) return;
  const r = awaken(baseId);
  if (!r.ok) { toast(r.reason || '无法觉醒', 'bad'); return; }
  toast(`${r.name} 血脉已醒`, 'reward');
  forceRender();
}

async function doForget(baseId) {
  const b = bloodlineSummary().list.find((x) => x.baseId === baseId);
  if (!b) return;
  const warn = b.awakened ? '此血脉**已经觉醒**，忘却后觉醒状态一并失去，且只返还少量灵材。' : '将失去这一族的所有血脉记忆。';
  const ok = await confirmModal(
    '忘 却 血 脉',
    `确定忘却【${b.name}】的血脉吗？${warn}`,
    { danger: true, okText: '忘 却' },
  );
  if (!ok) return;
  const r = forget(baseId);
  if (!r.ok) { toast(r.reason || '无法忘却', 'bad'); return; }
  toast(`已忘却 ${b.name} 的血脉`, 'special');
  forceRender();
}

// ==================== 图鉴 ====================

function codexView() {
  const col = beastCollection();
  const tiers = col.byTier.map((t) => {
    const list = col.list.filter((x) => x.base.tier === t.tier);
    const rows = list.map((x) => {
      const b = x.base;
      if (!x.got) {
        return `
          <div class="list-item locked">
            <div class="li-main">
              <div class="li-name">??? <span class="tag">${esc(String(b.tier))} 阶</span></div>
              <div class="li-desc muted">尚未收录</div>
            </div>
          </div>`;
      }
      return `
        <div class="list-item">
          <div class="li-main">
            <div class="li-name">
              ${esc(b.name)}
              ${tierTag(b.tier)} ${roleTag(b.role)}
              ${b.evolveTo ? `<span class="tag tag-gold">可进化</span>` : ''}
            </div>
            <div class="li-desc">${esc(b.desc)}</div>
            <div class="li-desc muted" style="font-style:italic;">${esc(b.lore)}</div>
          </div>
        </div>`;
    }).join('');
    return `
      <div class="panel-title mt-2" style="font-size:14px;">
        <span>第 ${t.tier} 阶</span>
        <span class="pt-extra">${t.got} / ${t.total}</span>
      </div>
      <div class="list">${rows}</div>`;
  }).join('');
  return `
    <div class="bar mb-2"><div class="bar-fill full" style="width:${(col.discovered / Math.max(1, col.total)) * 100}%"></div></div>
    ${tiers}`;
}

// ==================== 交互 ====================

function doSetActive(uid) {
  const list = beastSummary();
  const me = list.find((b) => b.uid === uid);
  const r = setActive(me && me.active ? null : uid);
  if (!r.ok) { toast(r.reason || '无法出战', 'bad'); return; }
  toast(me && me.active ? `${me.name} 已召回` : `${me?.name || '灵兽'} 随你同行`, 'good');
  forceRender();
}

async function doRelease(uid) {
  const list = beastSummary();
  const me = list.find((b) => b.uid === uid);
  if (!me) return;
  const ok = await confirmModal(
    '放 生',
    `确定放【${me.name}】${starText(me.star)}归山吗？将返还少量灵材，且其资质不可复得。`,
    { danger: true, okText: '放 生' },
  );
  if (!ok) return;
  const r = releaseBeast(uid);
  if (!r.ok) { toast(r.reason || '无法放生', 'bad'); return; }
  toast(`${me.name} 归山去了`, 'special');
  if (detailUid === uid) detailUid = null;
  forceRender();
}

function doHatch(baseId) {
  const r = hatchByMaterial(baseId);
  if (!r.ok) { toast(r.reason || '无法取卵', 'bad'); return; }
  const base = beastById(baseId);
  toast(`得【${base?.name || baseId}】之蛋，${countdownText(r.cost.seconds)}后破壳`, 'special');
  forceRender();
}

function doEvolve(uid) {
  const r = evolve(uid);
  if (!r.ok) { toast(r.reason || '无法进化', 'bad'); return; }
  const g = r.after && r.before
    ? `攻 ${fmt(r.before.atk)} → ${fmt(r.after.atk)}`
    : '';
  toast(`${r.from.name} 蜕变为 ${r.to.name}${g ? '（' + g + '）' : ''}`, 'reward');
  forceRender();
}

// ==================== 入口 ====================

export function renderBeastPanel(host) {
  beastPanel.render(host);
}

export function resetBeastPanel() {
  beastPanel.reset();
  beastTab = 'roster';
  detailUid = null;
}
