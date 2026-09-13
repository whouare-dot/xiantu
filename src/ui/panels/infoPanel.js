/**
 * 个人信息页。
 *
 * 玩家在挂机游戏里最常问的三个问题是「我现在多强」「我这些东西哪来的」「我干了些什么」。
 * 这一页就是回答它们的地方：把散落在各个面板里的信息汇总到一处，
 * 并且**把加成来源摊开写清楚**——不能只给一个数字，得让玩家看懂是怎么算出来的。
 *
 * 面板用 createPanel 模式：结构与数值分离。
 *   build()   搭骨架，包含所有列表与统计**行**（行是固定的）
 *   refresh() 只更新数字
 * 统计行用 data-stat 标记、行集合固定，所以杀敌数每秒增长也不会触发重建。
 */

import { state, realm, isMaxRealm, techSlotsFor, stonesToLow } from '../../core/state.js';
import {
  aggregate, calcAtk, calcDef, calcSpd, calcCrit,
  calcComprehension, calcDaoHeart, calcSpiritSense,
  calcLuck, calcLifespan, calcCultSpeed, buildingLevel,
} from '../../systems/cultivation.js';
import { techById, techStatsAt } from '../../data/techniques.js';
import { equipById } from '../../data/equipments.js';
import { qualityOf } from '../../data/qualities.js';
import { fmt, fmtPct, fmtMult } from '../../core/format.js';
import { esc } from '../dom.js';
import { createPanel, setText } from '../panel.js';
import { stanceSummary } from '../../systems/stance.js';
import { rankInfo } from '../../systems/sect.js';
import { sectById } from '../../data/sects.js';
import { activeBeast, beastStats } from '../../systems/beast.js';
import { svg, ICON_REALM } from '../../assets/svg.js';

// 立场/宗门/灵兽的数据一律从各自系统取，本页不自行维护一份副本——
// 曾经这里写死过一张立场表，与真实的立场系统字段名对不上，页面上显示的永远是"散修"。

/** 统计行是固定的，refresh 只改数字 */
const STAT_ROWS = [
  ['breakthroughs', '境界突破'], ['tribulationsPassed', '渡过天劫'],
  ['kills', '战斗胜场'], ['deaths', '战斗败绩'],
  ['encounters', '经历奇遇'], ['pillsMade', '炼成丹药'],
  ['itemsForged', '锻成器物'],
];

function attrBreakdown() {
  const a = aggregate();
  const rows = [];
  const eq = a.lore.find((x) => x.source === '装备');
  if (eq) rows.push({ label: '装备', text: `攻 +${fmt(eq.atk)} · 防 +${fmt(eq.def)} · 血 +${fmt(eq.hp)}` });
  const tech = a.lore.find((x) => x.source === '功法');
  if (tech) rows.push({ label: '功法', text: `攻 +${fmt(tech.atk)} · 防 +${fmt(tech.def)} · 血 +${fmt(tech.hp)}` });
  if (a.techCultBonus > 0) rows.push({ label: '功法修炼加成', text: fmtMult(1 + a.techCultBonus) });
  const cave = buildingLevel('bld_spirit');
  if (cave > 0) rows.push({ label: '洞府聚灵阵', text: `Lv.${cave} · 修炼 ${fmtMult(1 + cave * 0.28)}` });
  const lib = buildingLevel('bld_library');
  if (lib > 0) rows.push({ label: '藏经阁', text: `Lv.${lib} · 悟性 +${lib * 10}` });
  return rows;
}

// ==================== 面板 ====================

export const infoPanel = createPanel({
  id: 'info',

  structure() {
    return [
      state.player.realmIndex,
      state.player.spiritRoot?.id,
      state.player.stance || 'sanxiu',
      state.achievements?.title || '',
      Object.keys(state.techniques.known || {}).join(','),
      (state.techniques.equipped || []).join(','),
      JSON.stringify(state.equipment.equipped),
      state.cave.level,
      aggregate().affixes.map((x) => x.name).join(','),
    ].join('|');
  },

  build(host) {
    const p = state.player;
    const st = stanceSummary();
    const title = state.achievements?.title || null;
    const sources = attrBreakdown();
    const affixes = aggregate().affixes || [];
    const equipped = state.techniques.equipped || [];

    const techHTML = equipped.length
      ? equipped.map((id) => {
          const t = techById(id);
          const k = state.techniques.known?.[id];
          if (!t || !k) return '';
          const s = techStatsAt(t, k.level);
          const q = qualityOf(t.quality);
          return `<div class="list-item"><div class="li-main">
            <div class="li-name">${esc(t.name)}
              <span class="q quality-${q.id}">${q.name}</span>
              <span class="tag tag-gold">第 ${k.level} 重</span></div>
            <div class="li-desc num">修炼 ${fmtMult(s.cultMult)}${s.affix ? ' · ' + esc(s.affix.name) : ''}</div>
          </div></div>`;
        }).join('')
      : `<div class="small muted center">未修任何功法（槽位 ${techSlotsFor(p.realmIndex)}）</div>`;

    const equipHTML = [['weapon', '兵器'], ['armor', '护甲'], ['treasure', '法宝']]
      .map(([slot, label]) => {
        const uid = state.equipment.equipped[slot];
        const inst = state.equipment.owned.find((e) => e.uid === uid);
        const base = inst ? equipById(inst.baseId) : null;
        const q = base ? qualityOf(base.quality) : null;
        return `<div class="info-row"><span class="label">${label}</span>
          <span class="value">${base
            ? `<span class="q quality-${q.id}">${q.name}</span> ${esc(base.name)} Lv.${inst.level}`
            : '<span class="muted">未装备</span>'}</span></div>`;
      }).join('');

    // 宗门：未入宗门时提示入口；已入则显示宗门名与职位
    const mySect = state.sect?.id ? sectById(state.sect.id) : null;
    const ri = rankInfo();
    const sectHTML = mySect
      ? `<span class="tag tag-jade">${esc(mySect.name)}</span> ${esc(ri?.rankName || ri?.name || '弟子')}`
      : '<span class="muted">散修（筑基后可拜师）</span>';

    // 出战灵兽
    let beastHTML = '<span class="muted">未携灵兽</span>';
    try {
      const ab = activeBeast?.();
      if (ab) {
        const bs = beastStats?.(ab);
        beastHTML = `${'★'.repeat(ab.star || 1)} ${esc(ab.name || '')} <span class="muted num">Lv.${ab.level}</span>`;
      }
    } catch { /* 灵兽系统未就绪不影响本页 */ }

    const sourceHTML = (sources.length || affixes.length)
      ? sources.map((r) => `<div class="info-row"><span class="label">${esc(r.label)}</span>
          <span class="value num">${esc(r.text)}</span></div>`).join('')
        + (affixes.length
          ? `<div class="small muted mt-1">词条：${affixes.map((a) =>
              `<span class="tag tag-gold">${esc(a.name)}</span>`).join(' ')}</div>`
          : '')
      : '<div class="small muted center">尚无外物加持，全凭己身</div>';

    host.innerHTML = `
      <div class="panel-title">
        <span style="display:inline-flex;align-items:center;gap:6px;">${svg(ICON_REALM, 18)}道 籍</span>
        <span class="pt-extra">${esc(st.name)}</span>
      </div>

      <div class="center mb-2">
        <div style="font-family:var(--font-display);font-size:1.35em;font-weight:bold;
             color:var(--accent-dark);letter-spacing:4px;">${esc(p.name)}</div>
        <div class="mt-1">
          <span class="realm-badge">${esc(realm().name)}</span>
          ${title ? `<span class="tag tag-gold" style="margin-left:6px;">${esc(title)}</span>` : ''}
        </div>
        <div class="small muted mt-1">${esc(realm().desc)}</div>
      </div>

      <div class="sub-title">根 本</div>
      <div class="info-row"><span class="label">灵根</span>
        <span class="value highlight">${esc(p.spiritRoot?.name ?? '-')} ${fmtMult(p.spiritRoot?.mult ?? 1)}</span></div>
      <div class="info-row"><span class="label">寿元</span><span class="value num" data-f="lifespan"></span></div>
      <div class="info-row"><span class="label">气运</span><span class="value num" data-f="luck"></span></div>
      <div class="info-row"><span class="label">立场</span>
        <span class="value" style="color:${st.color}">${esc(st.name)} · ${esc(st.desc)}</span></div>
      ${st.mods.length ? `<div class="small muted" style="padding:2px 0 4px 8px;">
        ${st.mods.map((m) => `${esc(m.label)} <b style="color:${m.bad ? 'var(--accent)' : 'var(--jade)'}">${esc(m.value)}</b>`).join(' · ')}
      </div>` : `<div class="small muted" style="padding:0 0 4px 8px;">${esc(st.detail)}</div>`}
      <div class="info-row"><span class="label">师承</span>
        <span class="value">${sectHTML}</span></div>
      <div class="info-row"><span class="label">灵兽</span>
        <span class="value">${beastHTML}</span></div>

      <div class="sub-title">六 维</div>
      <div class="grid-2">
        <div class="info-row"><span class="label">攻击</span><span class="value num" data-f="atk"></span></div>
        <div class="info-row"><span class="label">防御</span><span class="value num" data-f="def"></span></div>
        <div class="info-row"><span class="label">身法</span><span class="value num" data-f="spd"></span></div>
        <div class="info-row"><span class="label">暴击</span><span class="value num" data-f="crit"></span></div>
        <div class="info-row"><span class="label">悟性</span><span class="value jade num" data-f="comp"></span></div>
        <div class="info-row"><span class="label">道心</span><span class="value jade num" data-f="dao"></span></div>
        <div class="info-row"><span class="label">神识</span><span class="value jade num" data-f="sense"></span></div>
        <div class="info-row"><span class="label">修炼</span><span class="value highlight num" data-f="speed"></span></div>
      </div>

      <div class="sub-title">加 成 来 源</div>
      <div>${sourceHTML}</div>

      <div class="sub-title">主 修 功 法</div>
      <div>${techHTML}</div>

      <div class="sub-title">身 上 装 束</div>
      <div>${equipHTML}</div>

      <div class="sub-title">修 行 统 计</div>
      <div class="grid-2">
        ${STAT_ROWS.map(([k, label]) =>
          `<div class="info-row"><span class="label">${esc(label)}</span>
            <span class="value num" data-stat="${k}">0</span></div>`).join('')}
        <div class="info-row"><span class="label">洞府等级</span>
          <span class="value num" data-f="caveLevel"></span></div>
        <div class="info-row"><span class="label">所习功法</span>
          <span class="value num" data-f="techCount"></span></div>
        <div class="info-row"><span class="label">所悟丹方</span>
          <span class="value num" data-f="recipeCount"></span></div>
        <div class="info-row"><span class="label">囊中灵石</span>
          <span class="value num" data-f="stones"></span></div>
      </div>
    `;
  },

  refresh(host) {
    setText(host, '[data-f="lifespan"]', fmt(calcLifespan()) + ' 载');
    setText(host, '[data-f="luck"]', fmt(calcLuck()));
    setText(host, '[data-f="atk"]', fmt(calcAtk()));
    setText(host, '[data-f="def"]', fmt(calcDef()));
    setText(host, '[data-f="spd"]', fmt(calcSpd()));
    setText(host, '[data-f="crit"]', fmtPct(calcCrit(), 1));
    setText(host, '[data-f="comp"]', fmt(calcComprehension()));
    setText(host, '[data-f="dao"]', fmt(calcDaoHeart()));
    setText(host, '[data-f="sense"]', fmt(calcSpiritSense()));
    setText(host, '[data-f="speed"]', isMaxRealm() ? '—' : fmt(calcCultSpeed()) + '/息');
    setText(host, '[data-f="caveLevel"]', state.cave.level || 1);
    setText(host, '[data-f="techCount"]', Object.keys(state.techniques.known || {}).length);
    setText(host, '[data-f="recipeCount"]', state.alchemy.knownRecipes?.length || 0);
    setText(host, '[data-f="stones"]', fmt(stonesToLow()));

    // 统计数字是每帧都可能变的，但行结构固定，所以只改数字不重建
    const s = state.stats || {};
    for (const [key] of STAT_ROWS) setText(host, `[data-stat="${key}"]`, s[key] || 0);
  },
});

export function renderInfoPanel(host) {
  infoPanel.render(host);
}

export function resetInfoPanel() {
  infoPanel.reset();
}
