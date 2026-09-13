/**
 * 破关横幅（V5.0 突破分层）。
 *
 * ============ 为什么不是弹窗 ============
 *
 * 设计支柱写着「里程碑有高潮」，但**大境界一世要走九次**（筑基/金丹/元婴/化神/
 * 炼虚/合体/大乘/渡劫，加飞升）。每一次都弹一个要点掉的窗，九次之后玩家
 * 只会烦——那是把"高潮"做成了"打断"。
 *
 * 所以这里做成**不拦截操作的横幅**：从顶部浮出、两三秒后自行淡去。
 * 挂机玩家不必理它，认真看的人也能看到境界名与那句描述。
 * 真正需要玩家做决定的只有天劫，那条路径仍然走弹窗。
 *
 * 纯展示：不含任何业务规则，层级由 breakthrough.js 判定后传进来。
 */

import { el, esc } from './dom.js';

/** 同时只留一条横幅：连续破关时不叠加成一堵墙 */
let current = null;
let hideTimer = 0;

/**
 * 显示破关横幅。
 * @param {object} info
 * @param {string} info.title    主标题（大境名，如「筑基」）
 * @param {string} info.realm    境界全名（如「筑基初期」）
 * @param {string} [info.desc]   境界描述
 * @param {boolean} [info.major] 是否大境界
 * @param {number} [info.ms]     停留毫秒
 */
export function showRealmBanner({ title, realm, desc = '', major = true, ms = 3400 }) {
  const root = document.getElementById('app');
  if (!root) return;

  // 旧的直接撤掉，不排队——排队会让横幅在破关之后很久才出现，失去即时感
  if (current) {
    current.remove();
    current = null;
  }
  clearTimeout(hideTimer);

  const box = el('div', { class: 'realm-banner' + (major ? ' major' : '') });
  box.innerHTML = `
    <div class="rb-inner">
      <div class="rb-seal">${major ? '境' : '进'}</div>
      <div class="rb-body">
        <div class="rb-title">${esc(title)}</div>
        <div class="rb-sub">${esc(realm)}</div>
        ${desc ? `<div class="rb-desc">${esc(desc)}</div>` : ''}
      </div>
    </div>`;

  root.appendChild(box);
  current = box;

  // 强制一次回流，保证入场动画真的播放（否则同一帧插入+加类会被合并掉）
  void box.offsetWidth;
  box.classList.add('on');

  hideTimer = setTimeout(() => {
    box.classList.remove('on');
    setTimeout(() => {
      box.remove();
      if (current === box) current = null;
    }, 420);
  }, ms);
}

/** 立刻撤下（切标签页等场景用，避免横幅飘在别的页面上） */
export function clearRealmBanner() {
  clearTimeout(hideTimer);
  if (current) {
    current.remove();
    current = null;
  }
}
