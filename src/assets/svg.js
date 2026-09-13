/**
 * 《仙途》水墨 SVG 图形库
 * ------------------------------------------------------------------
 * 用法：
 *   import { svg, ICON_CULTIVATE, SCENE_BREAKTHROUGH } from '../assets/svg.js';
 *
 *   // 1) 图标类（24×24 内层 markup，必须用 svg() 包装尺寸）
 *   el.innerHTML = svg(ICON_CULTIVATE);              // 24px
 *   el.innerHTML = svg(ICON_SWORD, 18, 'ico ico-sword');
 *
 *   // 2) 洞府建筑（48×48 内层 markup —— 用 svg48() 包装）
 *   el.innerHTML = svg48(BLD_HERB_FIELD, 48);
 *   el.innerHTML = svg48(BLD_ALCHEMY_ROOM, 64, 'bld');
 *
 *   // 3) 品阶纹样（24×24 内层 markup，固定配色，可被 CSS 覆盖）
 *   el.innerHTML = svg(FRAME_XIAN, 20, 'quality-xian');
 *
 *   // 4) 大场面插画（常量自带完整 <svg> 标签，直接塞进去即可）
 *   stage.innerHTML = SCENE_BREAKTHROUGH;
 *
 * 约定：
 *   - 图标一律 stroke="currentColor"，随主题变色；颜色由 CSS 的 color 决定。
 *   - 建筑 / 品阶 / 插画用固定配色（宣纸 #f5ead2 · 墨 #2c1810 · 朱砂 #b22222
 *     · 翡翠 #2d6b4f · 赭金 #c4922a · 淡墨 #8b6b3d），亦可用 CSS 规则覆盖，
 *     因为 presentation attribute 的优先级低于任何 CSS 选择器。
 *   - 全部图形由 path / circle / ellipse / line 真实绘制，无 emoji、无文字字符、
 *     无外部资源（符合《架构规范》第 0 节「零外部资源」）。
 *   - 每个图形的元素 id 都带场景前缀，同一页面重复渲染多个插画不会串味。
 */

/* ------------------------------------------------------------------ */
/* 公共属性                                                             */
/* ------------------------------------------------------------------ */

/** 图标基础笔法：只描边、不填充，圆头圆角 */
const INK =
  'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';

/** 建筑基础笔法（颜色由各元素自行指定） */
const BLD_BASE = 'fill="none" stroke-linecap="round" stroke-linejoin="round"';

/* ------------------------------------------------------------------ */
/* 包装器                                                               */
/* ------------------------------------------------------------------ */

/**
 * 把 24×24 的内层 markup 包成一个 <svg>。
 * @param {string} node      图形内层 markup（ICON_* / FRAME_*）
 * @param {number} size      边长 px
 * @param {string} className 额外 class
 */
export function svg(node, size = 24, className = '') {
  const cls = className ? ` class="${className}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24"${cls}>${node}</svg>`;
}

/**
 * 把 48×48 的内层 markup 包成一个 <svg>（洞府建筑专用）。
 * @param {string} node      图形内层 markup（BLD_*）
 * @param {number} size      边长 px
 * @param {string} className 额外 class
 */
export function svg48(node, size = 48, className = '') {
  const cls = className ? ` class="${className}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 48 48"${cls}>${node}</svg>`;
}

/* ================================================================== */
/* 一、图标类 24×24 · currentColor · stroke 为主                        */
/* ================================================================== */

/* 修炼：打坐人形 + 灵气环绕成环 ------------------------------------ */
export const ICON_CULTIVATE = `<g ${INK}>
  <circle cx="12" cy="7.4" r="2.05"/>
  <circle cx="12" cy="4.6" r="1"/>
  <path d="M8.7 13.4 C8.7 11.4 10.1 9.9 12 9.9 C13.9 9.9 15.3 11.4 15.3 13.4"/>
  <path d="M8.7 13.4 C9.2 15 10.4 15.9 12 15.9 C13.6 15.9 14.8 15 15.3 13.4"/>
  <path d="M5.9 17.3 C8.2 15.5 10.2 14.8 12 14.8 C13.8 14.8 15.8 15.5 18.1 17.3"/>
  <path d="M7.5 17.4 C9.1 18.8 14.9 18.8 16.5 17.4" opacity="0.55"/>
  <path d="M4.6 7.4 C6.1 4.4 8.8 2.6 12 2.6 C15.2 2.6 17.9 4.4 19.4 7.4"
        stroke-dasharray="1.7 2.5" opacity="0.8"/>
  <path d="M3.3 10.4 C2.5 13 3.4 16.1 5.7 18.2" stroke-dasharray="1.7 2.5" opacity="0.55"/>
  <path d="M20.7 10.4 C21.5 13 20.6 16.1 18.3 18.2" stroke-dasharray="1.7 2.5" opacity="0.55"/>
  <circle cx="3.7" cy="13.6" r="0.55" fill="currentColor" stroke="none" opacity="0.7"/>
  <circle cx="20.3" cy="13.6" r="0.55" fill="currentColor" stroke="none" opacity="0.7"/>
</g>`;

/* 炼丹：丹炉 + 炉火 ------------------------------------------------ */
export const ICON_ALCHEMY = `<g ${INK}>
  <path d="M4.6 12.4 L19.4 12.4"/>
  <path d="M6.1 12.6 C6.1 16.4 8 19.4 12 19.4 C16 19.4 17.9 16.4 17.9 12.6"/>
  <path d="M7.5 15.7 C9.4 14.9 14.6 14.9 16.5 15.7" opacity="0.5"/>
  <path d="M6.9 19.4 L5.9 21.7"/>
  <path d="M17.1 19.4 L18.1 21.7"/>
  <path d="M12 19.6 L12 21.8"/>
  <path d="M7 12.2 C8.4 9.6 15.6 9.6 17 12.2"/>
  <circle cx="12" cy="8.7" r="1"/>
  <path d="M12 3.4 C13.6 5.6 14.6 6.7 14.6 8.1 A2.6 2.6 0 0 1 9.4 8.1 C9.4 6.7 10.4 5.6 12 3.4 Z"
        fill="currentColor" fill-opacity="0.14" stroke-width="1.3"/>
  <path d="M6.5 9.8 C7.4 10.7 7.7 11.5 7.7 12.4" opacity="0.45"/>
  <path d="M17.5 9.8 C16.6 10.7 16.3 11.5 16.3 12.4" opacity="0.45"/>
  <path d="M6.4 14.5 C4.6 14.5 3.7 16.1 4.9 17.1"/>
  <path d="M17.6 14.5 C19.4 14.5 20.3 16.1 19.1 17.1"/>
</g>`;

/* 炼器：铁砧 + 锤 + 火星 -------------------------------------------- */
export const ICON_FORGE = `<g ${INK}>
  <path d="M3.2 11.9 L14.4 11.9 C15.6 11.9 16.9 12.3 18.5 13.3 C17.3 13.9 16 14.2 14.4 14.2 L3.2 14.2 C2.5 14.2 2.4 13.1 3.2 11.9 Z"/>
  <path d="M8.4 14.2 L8.4 17.3 L15.6 17.3 L15.6 14.2"/>
  <path d="M6.4 17.3 L17.6 17.3 L18.7 19.7 L5.3 19.7 Z"/>
  <path d="M3.4 21.5 L20.6 21.5" opacity="0.45"/>
  <path d="M11.6 11.6 L16.9 6.3"/>
  <path d="M16.3 2.6 L20.4 6.2 L18.7 7.9 L14.6 4.3 Z"/>
  <circle cx="8.2" cy="10.3" r="0.7" fill="currentColor" stroke="none" opacity="0.85"/>
  <circle cx="6.1" cy="8.3" r="0.5" fill="currentColor" stroke="none" opacity="0.6"/>
  <path d="M10.6 9.2 L10.6 9.3" stroke-width="1.8"/>
  <path d="M4.4 6.2 L4.4 8.4 M3.3 7.3 L5.5 7.3" stroke-width="1.2" opacity="0.7"/>
</g>`;

/* 洞府：山体 + 洞口 + 云雾 ------------------------------------------ */
export const ICON_CAVE = `<g ${INK}>
  <path d="M2.4 19.6 C4.2 14.3 6.2 10.3 9 7.3 C9.8 6.4 10.8 6.4 11.6 7.3 C14.7 10.7 17.5 14.9 19.7 19.6 Z"
        fill="currentColor" fill-opacity="0.07" stroke="none"/>
  <path d="M2.4 19.6 C4.2 14.3 6.2 10.3 9 7.3 C9.8 6.4 10.8 6.4 11.6 7.3 C13.4 9.4 14.9 11.7 16.1 14.2"/>
  <path d="M13.4 19.6 C14.9 16.3 16.5 13.9 18.5 12.1 C19.3 11.4 20.2 11.5 20.8 12.3 C21.6 13.5 22 16.2 21.9 19.6"/>
  <path d="M2 19.8 L22 19.8"/>
  <path d="M9.1 19.6 C9.1 16.7 10.4 15.1 12.4 15.1 C14.4 15.1 15.7 16.7 15.7 19.6"
        fill="currentColor" fill-opacity="0.45"/>
  <path d="M3.6 16.5 C5.4 15.7 7 16.9 8.8 16.3" opacity="0.55"/>
  <path d="M15.9 17.5 C17.5 16.9 18.7 17.9 20.5 17.3" opacity="0.55"/>
  <path d="M11.4 10.4 C12.1 9.7 13 9.7 13.7 10.3" opacity="0.4"/>
</g>`;

/* 坊市：屋檐 + 幡旗 ------------------------------------------------- */
export const ICON_SHOP = `<g ${INK}>
  <path d="M2.6 9.4 C5.8 6.2 9.2 4.7 12 4.7 C14.8 4.7 18.2 6.2 21.4 9.4"/>
  <path d="M4.8 10.9 C7.1 8.8 9.6 7.7 12 7.7 C14.4 7.7 16.9 8.8 19.2 10.9" opacity="0.6"/>
  <path d="M5.6 11.5 L18.4 11.5"/>
  <path d="M6.6 11.5 L6.6 19.8"/>
  <path d="M17.4 11.5 L17.4 19.8"/>
  <path d="M4.6 19.8 L19.4 19.8"/>
  <path d="M10.4 19.8 L10.4 15.1 C10.4 13.9 11.1 13.1 12 13.1 C12.9 13.1 13.6 13.9 13.6 15.1 L13.6 19.8"/>
  <path d="M6.9 11.5 L6.9 12.6 L10 12.6 L10 16.9 C9.3 17.6 8.7 16.5 8.1 17 C7.5 17.5 6.9 16.7 6.9 16.3 Z"
        fill="currentColor" fill-opacity="0.13"/>
  <circle cx="8.45" cy="14.6" r="0.75" stroke-width="1.1"/>
  <path d="M8.45 14.2 L8.45 15" stroke-width="1"/>
</g>`;

/* 背包：布袋 --------------------------------------------------------- */
export const ICON_BAG = `<g ${INK}>
  <path d="M6.3 10.4 C6.3 9.1 7.5 8.5 12 8.5 C16.5 8.5 17.7 9.1 17.7 10.4 C18.5 13.6 18.7 16.7 17.1 19.6 C15.7 21.4 8.3 21.4 6.9 19.6 C5.3 16.7 5.5 13.6 6.3 10.4 Z"/>
  <path d="M9.4 8.5 C9.4 6.8 10.5 5.6 12 5.6 C13.5 5.6 14.6 6.8 14.6 8.5"/>
  <path d="M8.4 9.7 C9.6 10.7 14.4 10.7 15.6 9.7"/>
  <path d="M9.5 12.5 C9.3 15 9.5 17.6 10.1 19.7" opacity="0.5"/>
  <path d="M14.5 12.5 C14.7 15 14.5 17.6 13.9 19.7" opacity="0.5"/>
  <path d="M12 13.3 L13.6 15 L12 16.7 L10.4 15 Z" opacity="0.55"/>
</g>`;

/* 剑修：剑 ----------------------------------------------------------- */
export const ICON_SWORD = `<g ${INK}>
  <path d="M12 2.2 C12.9 3.8 13.7 5.3 13.7 6.8 L13.7 14.4 L10.3 14.4 L10.3 6.8 C10.3 5.3 11.1 3.8 12 2.2 Z"/>
  <path d="M12 3.8 L12 14.2" opacity="0.5"/>
  <path d="M7.4 15.6 C9.4 14.8 14.6 14.8 16.6 15.6"/>
  <path d="M10.6 16.5 L10.6 20.6 L13.4 20.6 L13.4 16.5"/>
  <path d="M10.7 18.2 L13.3 18.2" opacity="0.5"/>
  <circle cx="12" cy="21.7" r="1.15"/>
  <path d="M8 15.8 C6.9 17.4 7.1 19.3 8.4 20.5" opacity="0.6"/>
</g>`;

/* 体修：紧握的拳 + 护体真气 ------------------------------------------ */
export const ICON_BODY = `<g ${INK}>
  <path d="M4.2 14 A8.6 8.6 0 0 1 12 3.8 A8.6 8.6 0 0 1 19.8 14"
        stroke-dasharray="1.8 2.6" opacity="0.55"/>
  <path d="M7.4 19.4 L7.4 12.6 C7.4 10.9 8.6 9.7 10.2 9.7 L14.4 9.7 C16.9 9.7 18.7 11.5 18.7 14 L18.7 16.6 C18.7 18.3 17.4 19.4 15.7 19.4 Z"/>
  <path d="M8.7 9.7 C8.7 8.3 9.7 7.3 10.9 7.3 C12.1 7.3 13.1 8.3 13.1 9.7"/>
  <path d="M13.1 9.7 C13.1 8.3 14.1 7.3 15.3 7.3 C16.5 7.3 17.5 8.3 17.5 9.7"/>
  <path d="M7.4 13.9 C5.9 13.5 5 14.3 5 15.4 C5 16.5 6 17.1 7.4 16.8"/>
  <path d="M11.4 12.3 L11.4 14.6" opacity="0.45"/>
  <path d="M14.6 12.4 L14.6 14.4" opacity="0.35"/>
  <path d="M9.8 19.4 L9.8 21.6"/>
  <path d="M15.8 19.5 L15.8 21.6"/>
  <path d="M9 20.4 C10.6 20.9 14.4 20.9 16.2 20.4" opacity="0.5"/>
  <circle cx="2.9" cy="9.4" r="0.55" fill="currentColor" stroke="none" opacity="0.55"/>
  <circle cx="21.1" cy="9.4" r="0.55" fill="currentColor" stroke="none" opacity="0.55"/>
</g>`;

/* 法修：符箓 --------------------------------------------------------- */
export const ICON_LAW = `<g ${INK}>
  <path d="M6.9 3.2 L17.1 3.2 L17.1 20.9 L13.8 19.4 L12 21.2 L10.2 19.4 L6.9 20.9 Z"/>
  <path d="M9.2 5.9 L14.8 5.9"/>
  <path d="M10.3 7.7 C11.1 7.1 12.9 7.1 13.7 7.7"/>
  <circle cx="12" cy="10.7" r="1.5"/>
  <path d="M12 12.2 L12 17.5"/>
  <path d="M9.5 14 C10.8 14.8 13.2 14.8 14.5 14" opacity="0.65"/>
  <path d="M9.8 16.7 C10.9 17.4 13.1 17.4 14.2 16.7" opacity="0.65"/>
  <path d="M8.4 11 C7.6 12.2 7.6 13.6 8.4 14.8" opacity="0.45"/>
</g>`;

/* 丹药：圆丹 + 云纹 -------------------------------------------------- */
export const ICON_PILL = `<g ${INK}>
  <ellipse cx="12" cy="10.8" rx="5.8" ry="4.8"/>
  <path d="M8.8 8.6 C9.6 7.4 10.8 6.8 12 7" opacity="0.5"/>
  <path d="M12.4 13.4 C13.5 13.4 14.3 12.7 14.3 11.8 C14.3 10.9 13.5 10.2 12.5 10.2 C11.6 10.2 10.9 10.8 10.9 11.6" opacity="0.75"/>
  <path d="M4.6 20.8 A3 3 0 0 1 7.6 17.8 A4 4 0 0 1 14.4 17.6 A3.4 3.4 0 0 1 19.4 20.8 Z"
        fill="currentColor" fill-opacity="0.09"/>
  <path d="M12.6 4.6 C13.4 3.4 14.6 3.4 15.3 4.2" opacity="0.4"/>
  <path d="M8.8 5.4 C9.4 4.8 10.2 4.7 10.8 5.1" opacity="0.28"/>
</g>`;

/* 灵材：草药 --------------------------------------------------------- */
export const ICON_MATERIAL = `<g ${INK}>
  <path d="M12 21.4 L12 10.6"/>
  <path d="M12 15.8 C8.8 16.2 6.2 14.2 5.8 11 C9 10.6 11.6 12.6 12 15.8 Z"/>
  <path d="M12 13 C11.6 9.8 13.8 7.2 17 6.8 C17.4 10 15.4 12.6 12 13 Z"/>
  <path d="M12 10.6 C11.2 8 12.6 5.2 15.2 4.2 C15.9 6.8 14.7 9.4 12 10.6 Z"/>
  <path d="M12 21.4 C10.9 21.6 10 22.2 9.4 23.2" opacity="0.6"/>
  <path d="M12 21.4 C13.1 21.6 14 22.2 14.6 23.2" opacity="0.6"/>
  <circle cx="16.6" cy="4.6" r="0.6" fill="currentColor" stroke="none" opacity="0.7"/>
</g>`;

/* 试炼塔：层叠塔身 --------------------------------------------------- */
export const ICON_TOWER = `<g ${INK}>
  <path d="M12 2.6 L12 3.4"/>
  <circle cx="12" cy="4.6" r="1.15"/>
  <path d="M6.8 9.2 C8.4 7.1 10.3 6.2 12 6.2 C13.7 6.2 15.6 7.1 17.2 9.2"/>
  <path d="M9.2 9.2 L14.8 9.2 L14.8 11.5 L9.2 11.5 Z"/>
  <path d="M5.4 14.4 C7.3 12.2 9.4 11.3 12 11.3 C14.6 11.3 16.7 12.2 18.6 14.4"/>
  <path d="M8 14.4 L16 14.4 L16 17.6 L8 17.6"/>
  <path d="M10.4 17.6 L10.4 15.9 C10.4 15.1 11.1 14.6 12 14.6 C12.9 14.6 13.6 15.1 13.6 15.9 L13.6 17.6"/>
  <path d="M3.6 20.8 C6.4 18.4 9 17.5 12 17.5 C15 17.5 17.6 18.4 20.4 20.8"/>
  <path d="M2.8 20.8 L21.2 20.8"/>
</g>`;

/* 天劫：乌云 + 闪电 -------------------------------------------------- */
export const ICON_TRIBULATION = `<g ${INK}>
  <path d="M5.2 15.6 C3.5 15.6 2.4 13.9 3.2 12.4 C2.4 10.5 4 8.6 6 8.9 C6.5 6.7 8.5 5.1 10.8 5.1 C12.8 5.1 14.5 6.3 15.1 8.1 C15.7 7.6 16.6 7.4 17.4 7.7 C19.3 8.2 20.4 10 20 11.9 C21.6 12.5 22.2 14.3 21.2 15.6 C20 16.6 17.6 15.6 5.2 15.6 Z"/>
  <path d="M13.6 15.6 L10.2 19.6 L12.4 19.6 L10.4 23.1 L15.4 18.8 L13.2 18.8 L15.8 15.6 Z"
        fill="currentColor" fill-opacity="0.16" stroke-width="1.3"/>
  <path d="M4.8 17.6 C6 17.1 7 17.6 8.2 17.2" opacity="0.45"/>
  <path d="M17.4 17.4 C18.4 16.9 19.2 17.4 20.2 17" opacity="0.4"/>
  <path d="M6.2 18.6 L5.4 20.6" opacity="0.5"/>
  <path d="M8.6 19.6 L7.9 21.2" opacity="0.4"/>
</g>`;

/* 境界：山峦 + 云 ---------------------------------------------------- */
export const ICON_REALM = `<g ${INK}>
  <path d="M2.2 19.6 C3.8 14.5 5.7 10.7 7.7 8.5 C8.4 7.7 9.2 7.7 9.9 8.5 C12.2 11.3 14.6 14.9 16.6 19.6 Z"
        fill="currentColor" fill-opacity="0.09" stroke="none"/>
  <path d="M2.2 19.6 C3.8 14.5 5.7 10.7 7.7 8.5 C8.4 7.7 9.2 7.7 9.9 8.5 C11.6 10.5 13.2 12.9 14.7 15.6"/>
  <path d="M11.4 19.6 C13.1 15.6 14.9 12.5 16.7 10.7 C17.4 10 18.2 10 18.8 10.7 C19.9 12 20.9 13.7 21.7 15.9 L21.7 19.6"/>
  <path d="M2 19.8 L22 19.8"/>
  <path d="M2.8 14.9 C5.4 14 7.8 15.1 10.4 14.3 C13 13.5 15.4 14.7 18 13.9" opacity="0.5"/>
  <path d="M6.6 17.4 C8.2 16.8 9.6 17.5 11.2 17" opacity="0.35"/>
  <path d="M14.6 17.2 C15.9 16.6 17.1 17.3 18.5 16.8" opacity="0.35"/>
</g>`;

/* 存档：卷轴 --------------------------------------------------------- */
export const ICON_SAVE = `<g ${INK}>
  <path d="M6.6 7 C9 6.4 15 6.4 17.4 7 L17.4 17 C15 17.6 9 17.6 6.6 17 Z"/>
  <path d="M6.6 7 C5.2 7 4.2 8 4.2 9.2 L4.2 14.8 C4.2 16 5.2 17 6.6 17 C7.6 17 8.4 16.2 8.4 15 L8.4 9 C8.4 7.8 7.6 7 6.6 7 Z"/>
  <path d="M17.4 7 C18.8 7 19.8 8 19.8 9.2 L19.8 14.8 C19.8 16 18.8 17 17.4 17 C16.4 17 15.6 16.2 15.6 15 L15.6 9 C15.6 7.8 16.4 7 17.4 7 Z"/>
  <path d="M9.8 10.2 L14.2 10.2" opacity="0.55"/>
  <path d="M9.8 12.6 L14.2 12.6" opacity="0.55"/>
  <path d="M9.8 15 L12.6 15" opacity="0.55"/>
</g>`;

/* 设置：太极 --------------------------------------------------------- */
export const ICON_SETTINGS = `<g ${INK}>
  <circle cx="12" cy="12" r="9"/>
  <path d="M12 3 A4.5 4.5 0 0 1 12 12 A4.5 4.5 0 0 0 12 21"/>
  <circle cx="12" cy="7.5" r="1.35" fill="currentColor" stroke="none"/>
  <circle cx="12" cy="16.5" r="1.35"/>
  <circle cx="12" cy="12" r="10.6" stroke-dasharray="1.5 2.6" opacity="0.3"/>
</g>`;

/* 未解锁：锁 --------------------------------------------------------- */
export const ICON_LOCK = `<g ${INK}>
  <path d="M8.2 10.4 L8.2 7.6 C8.2 5.4 9.9 3.7 12 3.7 C14.1 3.7 15.8 5.4 15.8 7.6 L15.8 10.4"/>
  <path d="M6.4 10.4 L17.6 10.4 C18.4 10.4 19 11 19 11.8 L19 19.6 C19 20.4 18.4 21 17.6 21 L6.4 21 C5.6 21 5 20.4 5 19.6 L5 11.8 C5 11 5.6 10.4 6.4 10.4 Z"/>
  <circle cx="12" cy="15" r="1.45"/>
  <path d="M12 16.4 L12 18.6"/>
</g>`;

/* 提升 / 突破：向上的箭 + 云 ----------------------------------------- */
export const ICON_ARROW_UP = `<g ${INK}>
  <path d="M4.8 9.6 A2.6 2.6 0 0 1 5.8 4.6 A3.6 3.6 0 0 1 12.6 5 A2.9 2.9 0 0 1 16.8 8.3 A2.2 2.2 0 0 1 16.4 9.6 Z"/>
  <path d="M12 21.6 L12 12.8"/>
  <path d="M8.6 16.4 L12 12.4 L15.4 16.4"/>
  <path d="M9.4 19.8 L12 16.9 L14.6 19.8" opacity="0.6"/>
</g>`;

/* ================================================================== */
/* 二、洞府建筑 48×48                                                  */
/* ================================================================== */

/* 聚灵阵：地面法阵 + 汇聚灵气 ---------------------------------------- */
export const BLD_SPIRIT_GATHER = `<g ${BLD_BASE}>
  <ellipse cx="24" cy="38" rx="17.5" ry="6" stroke="#c4922a" stroke-width="1.4" opacity="0.5"/>
  <ellipse cx="24" cy="38" rx="11.5" ry="3.9" stroke="#2d6b4f" stroke-width="1.2"
           stroke-dasharray="2.5 3" opacity="0.85"/>
  <path d="M5.4 36.6 L7.6 39.4" stroke="#c4922a" stroke-width="1.1" opacity="0.45"/>
  <path d="M42.6 36.6 L40.4 39.4" stroke="#c4922a" stroke-width="1.1" opacity="0.45"/>
  <path d="M24 43.4 L24 41.4" stroke="#c4922a" stroke-width="1.1" opacity="0.45"/>
  <path d="M24 35 L15.6 15.4 L32.4 15.4 Z" fill="#2d6b4f" opacity="0.1" stroke="none"/>
  <path d="M24 35 L19.6 15.4 L28.4 15.4 Z" fill="#c4922a" opacity="0.1" stroke="none"/>
  <path d="M24 35 L15.6 15.4 M24 35 L32.4 15.4" stroke="#2d6b4f" stroke-width="1.1" opacity="0.4"/>
  <path d="M20.8 35 C20.4 29.6 21 24.2 22.4 19.4" stroke="#2d6b4f" stroke-width="1.1" opacity="0.5"/>
  <path d="M27.2 35 C27.6 29.6 27 24.2 25.6 19.4" stroke="#2d6b4f" stroke-width="1.1" opacity="0.5"/>
  <path d="M13.2 34.6 C10.8 30.6 13.8 28.2 12 24.2" stroke="#c4922a" stroke-width="1.3" opacity="0.7"/>
  <path d="M34.8 34.6 C37.2 30.6 34.2 28.2 36 24.2" stroke="#c4922a" stroke-width="1.3" opacity="0.7"/>
  <path d="M8.8 32.6 C10 31.6 11.4 31.6 12.4 32.4" stroke="#c4922a" stroke-width="1" opacity="0.45"/>
  <path d="M35.6 32.4 C36.6 31.6 38 31.6 39.2 32.6" stroke="#c4922a" stroke-width="1" opacity="0.45"/>
  <path d="M24 35.6 L25.9 37.2 L24 38.8 L22.1 37.2 Z" fill="#c4922a" stroke="#c4922a" stroke-width="1"/>
  <path d="M24 12.4 L24 15.8" stroke="#2d6b4f" stroke-width="1.5" opacity="0.8"/>
  <circle cx="24" cy="10.6" r="1.8" fill="#c4922a" stroke="none" opacity="0.9"/>
  <circle cx="20" cy="18.6" r="1" fill="#c4922a" stroke="none" opacity="0.65"/>
  <circle cx="28.2" cy="20.4" r="1.1" fill="#c4922a" stroke="none" opacity="0.65"/>
  <circle cx="24" cy="25.6" r="0.8" fill="#2d6b4f" stroke="none" opacity="0.55"/>
  <circle cx="18.8" cy="28.4" r="0.7" fill="#c4922a" stroke="none" opacity="0.5"/>
  <circle cx="29.6" cy="27.6" r="0.7" fill="#c4922a" stroke="none" opacity="0.5"/>
</g>`;

/* 灵田：田垄 + 灵草 -------------------------------------------------- */
export const BLD_HERB_FIELD = `<g ${BLD_BASE}>
  <path d="M6.4 31.4 C13.6 29.4 34.4 29.4 41.6 31.4" stroke="#8b6b3d" stroke-width="1.1" opacity="0.75"/>
  <path d="M5.6 35.4 C13.2 33.2 34.8 33.2 42.4 35.4" stroke="#4a3520" stroke-width="1.4"/>
  <path d="M5.2 39.6 C13.2 37.2 34.8 37.2 42.8 39.6" stroke="#4a3520" stroke-width="1.4"/>
  <path d="M5.8 43.4 C13.6 41.4 34.4 41.4 42.2 43.4" stroke="#8b6b3d" stroke-width="1.1" opacity="0.65"/>
  <path d="M24 35.4 L24 22.6" stroke="#2d6b4f" stroke-width="1.5"/>
  <path d="M24 30.4 C20.6 30.8 17.8 28.8 17.4 25.2 C20.8 24.8 23.6 26.8 24 30.4 Z"
        fill="#2d6b4f" fill-opacity="0.16" stroke="#2d6b4f" stroke-width="1.3"/>
  <path d="M24 27.6 C24.4 24.2 27.2 22.2 30.6 22.6 C30.2 26.2 27.4 28.2 24 27.6 Z"
        fill="#2d6b4f" fill-opacity="0.16" stroke="#2d6b4f" stroke-width="1.3"/>
  <path d="M24 22.6 C23.6 20.4 24.6 18.6 26.4 17.6 C27.2 19.6 26.4 21.6 24 22.6 Z"
        fill="#c4922a" fill-opacity="0.2" stroke="#c4922a" stroke-width="1.2"/>
  <path d="M15 36 L15 27.4" stroke="#2d6b4f" stroke-width="1.3"/>
  <path d="M15 32.6 C12.8 32.8 11 31.4 10.8 29.2 C13 29 14.8 30.4 15 32.6 Z"
        fill="#2d6b4f" fill-opacity="0.14" stroke="#2d6b4f" stroke-width="1.1"/>
  <path d="M15 30.4 C15.2 28.2 17 26.9 19.2 27.1 C19 29.4 17.2 30.7 15 30.4 Z"
        fill="#2d6b4f" fill-opacity="0.14" stroke="#2d6b4f" stroke-width="1.1"/>
  <path d="M33 36 L33 27.4" stroke="#2d6b4f" stroke-width="1.3"/>
  <path d="M33 32.6 C35.2 32.8 37 31.4 37.2 29.2 C35 29 33.2 30.4 33 32.6 Z"
        fill="#2d6b4f" fill-opacity="0.14" stroke="#2d6b4f" stroke-width="1.1"/>
  <path d="M33 30.4 C32.8 28.2 31 26.9 28.8 27.1 C29 29.4 30.8 30.7 33 30.4 Z"
        fill="#2d6b4f" fill-opacity="0.14" stroke="#2d6b4f" stroke-width="1.1"/>
  <path d="M24 14.4 C22.6 13.2 24 11.6 22.6 10.4" stroke="#c4922a" stroke-width="1.2" opacity="0.5"/>
  <circle cx="20.6" cy="19.8" r="1" fill="#c4922a" stroke="none" opacity="0.75"/>
  <circle cx="27.8" cy="25.8" r="0.85" fill="#c4922a" stroke="none" opacity="0.6"/>
  <circle cx="17.6" cy="24.6" r="0.75" fill="#c4922a" stroke="none" opacity="0.55"/>
  <circle cx="30.4" cy="21.4" r="0.9" fill="#c4922a" stroke="none" opacity="0.6"/>
</g>`;

/* 丹房：药架 + 丹炉 -------------------------------------------------- */
export const BLD_ALCHEMY_ROOM = `<g ${BLD_BASE}>
  <path d="M5 16 L5 42" stroke="#4a3520" stroke-width="1.5"/>
  <path d="M19 16 L19 42" stroke="#4a3520" stroke-width="1.5"/>
  <path d="M3.4 24 L20.6 24" stroke="#4a3520" stroke-width="1.3"/>
  <path d="M3.4 34.4 L20.6 34.4" stroke="#4a3520" stroke-width="1.3"/>
  <path d="M7.2 24 L7.2 21.6 C7.2 20.6 8.1 19.9 9.2 19.9 C10.3 19.9 11.2 20.6 11.2 21.6 L11.2 24 Z"
        fill="#2d6b4f" fill-opacity="0.13" stroke="#2d6b4f" stroke-width="1.2"/>
  <path d="M8.6 19.9 L8.6 18.8" stroke="#2d6b4f" stroke-width="1.1"/>
  <path d="M8.1 18.4 L9.9 18.4" stroke="#4a3520" stroke-width="1.1"/>
  <path d="M13.6 24 L13.6 21.6 C13.6 20.6 14.5 19.9 15.6 19.9 C16.7 19.9 17.6 20.6 17.6 21.6 L17.6 24 Z"
        fill="#c4922a" fill-opacity="0.16" stroke="#c4922a" stroke-width="1.2"/>
  <path d="M15 19.9 L15 18.8" stroke="#c4922a" stroke-width="1.1"/>
  <path d="M14.5 18.4 L16.3 18.4" stroke="#4a3520" stroke-width="1.1"/>
  <path d="M8.4 34.4 L8.4 32 C8.4 31 9.3 30.3 10.4 30.3 C11.5 30.3 12.4 31 12.4 32 L12.4 34.4 Z"
        fill="#b22222" fill-opacity="0.14" stroke="#b22222" stroke-width="1.2"/>
  <path d="M9.8 30.3 L9.8 29.2" stroke="#b22222" stroke-width="1.1"/>
  <path d="M9.3 28.8 L11.1 28.8" stroke="#4a3520" stroke-width="1.1"/>
  <ellipse cx="35" cy="25" rx="8.6" ry="2.6" stroke="#4a3520" stroke-width="1.5"/>
  <path d="M26.4 25 C26.4 32.6 29.6 38.4 35 38.4 C40.4 38.4 43.6 32.6 43.6 25" stroke="#4a3520" stroke-width="1.5"/>
  <path d="M27.8 30.6 C31.2 32.1 38.8 32.1 42.2 30.6" stroke="#8b6b3d" stroke-width="1.1" opacity="0.65"/>
  <path d="M30.4 37.7 L29 41.8" stroke="#4a3520" stroke-width="1.4"/>
  <path d="M39.6 37.7 L41 41.8" stroke="#4a3520" stroke-width="1.4"/>
  <path d="M35 38.4 L35 41.8" stroke="#4a3520" stroke-width="1.4"/>
  <path d="M27.4 24.6 C28.6 20.8 31.4 18.6 35 18.6 C38.6 18.6 41.4 20.8 42.6 24.6" stroke="#4a3520" stroke-width="1.5"/>
  <circle cx="35" cy="17.2" r="1.6" stroke="#4a3520" stroke-width="1.3"/>
  <path d="M35 15.2 C36.3 13 35.9 11.4 35 9.9 C34.1 11.4 33.7 13 35 15.2 Z"
        fill="#c4922a" fill-opacity="0.5" stroke="#c4922a" stroke-width="1.1"/>
  <path d="M31.4 14.4 C32.2 13.2 32 12.2 31.4 11.2" stroke="#c4922a" stroke-width="1" opacity="0.5"/>
  <path d="M38.6 14.4 C37.8 13.2 38 12.2 38.6 11.2" stroke="#c4922a" stroke-width="1" opacity="0.5"/>
  <path d="M26.6 27.6 C24.8 27.6 24 29.2 25 30.2" stroke="#4a3520" stroke-width="1.3"/>
  <path d="M43.4 27.6 C45.2 27.6 46 29.2 45 30.2" stroke="#4a3520" stroke-width="1.3"/>
</g>`;

/* 炼器室：炉火 + 铁砧 ------------------------------------------------ */
export const BLD_FORGE_ROOM = `<g ${BLD_BASE}>
  <ellipse cx="14" cy="30.4" rx="6.4" ry="1.7" fill="#b22222" fill-opacity="0.16" stroke="none"/>
  <path d="M7.4 30.6 C7.4 35.4 10.2 38.7 14 38.7 C17.8 38.7 20.6 35.4 20.6 30.6 Z" stroke="#4a3520" stroke-width="1.5"/>
  <path d="M6.2 30.6 L21.8 30.6" stroke="#4a3520" stroke-width="1.5"/>
  <path d="M9.8 38.3 L8.4 42.4" stroke="#4a3520" stroke-width="1.4"/>
  <path d="M18.2 38.3 L19.6 42.4" stroke="#4a3520" stroke-width="1.4"/>
  <path d="M14 38.7 L14 42.4" stroke="#4a3520" stroke-width="1.4"/>
  <path d="M14 29.6 C15.9 26.6 15.4 24.2 14 21.8 C12.6 24.2 12.1 26.6 14 29.6 Z"
        fill="#c4922a" fill-opacity="0.5" stroke="#c4922a" stroke-width="1.2"/>
  <path d="M10.4 29.8 C11.5 27.8 11.2 26.2 10.4 24.6 C9.6 26.2 9.3 27.8 10.4 29.8 Z"
        fill="#c4922a" fill-opacity="0.32" stroke="#c4922a" stroke-width="1.1"/>
  <path d="M17.6 29.8 C18.7 27.8 18.4 26.2 17.6 24.6 C16.8 26.2 16.5 27.8 17.6 29.8 Z"
        fill="#c4922a" fill-opacity="0.32" stroke="#c4922a" stroke-width="1.1"/>
  <path d="M26.6 26.6 L40.6 26.6 C42 26.6 43.4 27.2 44.8 28.4 C43.6 29.4 42.2 29.9 40.6 29.9 L26.6 29.9 C25.7 29.9 25.3 28.3 26.6 26.6 Z"
        stroke="#4a3520" stroke-width="1.5"/>
  <path d="M32 29.9 L32 34.4 L39 34.4 L39 29.9" stroke="#4a3520" stroke-width="1.4"/>
  <path d="M29.4 34.4 L41.6 34.4 L43 39.8 L28 39.8 Z" stroke="#4a3520" stroke-width="1.5"/>
  <path d="M4.4 42.6 L45.4 42.6" stroke="#8b6b3d" stroke-width="1.1" opacity="0.5"/>
  <circle cx="27.8" cy="23.6" r="1" fill="#c4922a" stroke="none" opacity="0.8"/>
  <circle cx="24.4" cy="21.4" r="0.7" fill="#c4922a" stroke="none" opacity="0.6"/>
  <path d="M31 20.8 L31 22.6 M30.1 21.7 L31.9 21.7" stroke="#c4922a" stroke-width="1.1" opacity="0.75"/>
  <circle cx="12.4" cy="20.6" r="0.75" fill="#c4922a" stroke="none" opacity="0.6"/>
  <circle cx="16" cy="18.4" r="0.6" fill="#c4922a" stroke="none" opacity="0.5"/>
</g>`;

/* 藏经阁：楼阁 + 书卷 ------------------------------------------------ */
export const BLD_LIBRARY = `<g ${BLD_BASE}>
  <path d="M24 10.2 L24 7.8" stroke="#c4922a" stroke-width="1.2"/>
  <circle cx="24" cy="6.4" r="1.4" fill="#c4922a" stroke="#c4922a" stroke-width="1"/>
  <path d="M14 14.6 C17.6 10.8 20.6 9.6 24 9.6 C27.4 9.6 30.4 10.8 34 14.6" stroke="#4a3520" stroke-width="1.5"/>
  <path d="M18 15.6 L30 15.6 L30 19.4 L18 19.4 Z" stroke="#4a3520" stroke-width="1.3"/>
  <path d="M10 24.8 C14.4 20.4 19.4 19.2 24 19.2 C28.6 19.2 33.6 20.4 38 24.8" stroke="#4a3520" stroke-width="1.5"/>
  <path d="M15.4 25.8 L32.6 25.8 L32.6 29.8 L15.4 29.8 Z" stroke="#4a3520" stroke-width="1.3"/>
  <path d="M17.6 26.6 L20 26.6 L20 28.6 L17.6 28.6 Z" fill="#c4922a" fill-opacity="0.2" stroke="#c4922a" stroke-width="1"/>
  <path d="M28 26.6 L30.4 26.6 L30.4 28.6 L28 28.6 Z" fill="#c4922a" fill-opacity="0.2" stroke="#c4922a" stroke-width="1"/>
  <path d="M6 35.4 C12.4 30.4 18 29 24 29 C30 29 35.6 30.4 42 35.4" stroke="#4a3520" stroke-width="1.5"/>
  <path d="M12 36.4 L36 36.4 L36 40.8 L12 40.8 Z" stroke="#4a3520" stroke-width="1.4"/>
  <path d="M16 37.4 L19 37.4 L19 39.4 L16 39.4 Z" fill="#2d6b4f" fill-opacity="0.18" stroke="#2d6b4f" stroke-width="1"/>
  <path d="M29 37.4 L32 37.4 L32 39.4 L29 39.4 Z" fill="#2d6b4f" fill-opacity="0.18" stroke="#2d6b4f" stroke-width="1"/>
  <path d="M22 40.8 L22 38.2 C22 37.4 22.8 36.8 24 36.8 C25.2 36.8 26 37.4 26 38.2 L26 40.8"
        stroke="#4a3520" stroke-width="1.2"/>
  <path d="M13.6 41.4 C17.2 40 20.6 40 24 41.4 C27.4 40 30.8 40 34.4 41.4 L34.4 45.6 C30.8 44.2 27.4 44.2 24 45.6 C20.6 44.2 17.2 44.2 13.6 45.6 Z"
        fill="#c4922a" fill-opacity="0.14" stroke="#c4922a" stroke-width="1.3"/>
  <path d="M24 41.4 L24 45.6" stroke="#c4922a" stroke-width="1.2"/>
</g>`;

/* 护山大阵：山体 + 光罩 ---------------------------------------------- */
export const BLD_WARD = `<g ${BLD_BASE}>
  <path d="M6.4 42 C11.4 33 17 25 24 19.4 C31 25 36.6 33 41.6 42 Z"
        fill="#2c1810" fill-opacity="0.17" stroke="#4a3520" stroke-width="1.6"/>
  <path d="M24 19.4 C26.6 23.4 28.6 27.4 30.2 31.6 C31.6 35 32.8 38.4 33.8 42" stroke="#2c1810" stroke-width="1.1" opacity="0.28"/>
  <path d="M15.6 32 C18.4 34.6 20.6 37.6 22.4 41" stroke="#2c1810" stroke-width="1" opacity="0.2"/>
  <path d="M30.6 30.6 C28.8 33.4 27.4 36.4 26.4 39.6" stroke="#2c1810" stroke-width="1" opacity="0.2"/>
  <path d="M22.6 24.6 C23.2 27.4 23 29.4 22.2 31.6" stroke="#2c1810" stroke-width="1" opacity="0.16"/>
  <path d="M20.6 24.4 C21.4 27 21.8 29.2 21.8 31.4" stroke="#faf0dd" stroke-width="1.4" opacity="0.3"/>
  <ellipse cx="24" cy="42" rx="19" ry="4.6" stroke="#c4922a" stroke-width="1.2"
           stroke-dasharray="4 4" opacity="0.55"/>
  <path d="M9 42 C9 25.2 15.6 11.6 24 11.6 C32.4 11.6 39 25.2 39 42"
        stroke="#2d6b4f" stroke-width="1.7" opacity="0.8"/>
  <path d="M12.4 42 C12.4 27.6 17.4 15.6 24 15.6 C30.6 15.6 35.6 27.6 35.6 42"
        stroke="#2d6b4f" stroke-width="1.1" stroke-dasharray="3 4" opacity="0.45"/>
  <path d="M24 10.2 L24 13" stroke="#c4922a" stroke-width="1.3" opacity="0.8"/>
  <circle cx="24" cy="11.4" r="1.2" fill="#c4922a" stroke="none" opacity="0.85"/>
  <circle cx="10.2" cy="30" r="1.15" fill="#c4922a" stroke="none" opacity="0.7"/>
  <circle cx="13.2" cy="20" r="1" fill="#c4922a" stroke="none" opacity="0.6"/>
  <circle cx="37.8" cy="30" r="1.15" fill="#c4922a" stroke="none" opacity="0.7"/>
  <circle cx="34.8" cy="20" r="1" fill="#c4922a" stroke="none" opacity="0.6"/>
  <circle cx="16.4" cy="36.4" r="0.8" fill="#2d6b4f" stroke="none" opacity="0.55"/>
  <circle cx="31.6" cy="36.4" r="0.8" fill="#2d6b4f" stroke="none" opacity="0.55"/>
</g>`;

/* ================================================================== */
/* 三、品阶纹样（24×24 菱形印，凡→圣 逐级华丽）                         */
/* ================================================================== */
/* 固定品阶配色：凡 淡墨 / 灵 翡翠 / 仙 赭金 / 神 朱砂 / 圣 金朱渐变      */

export const FRAME_FAN = `<g fill="none" stroke="#a09070" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 2.6 L21.4 12 L12 21.4 L2.6 12 Z"/>
  <path d="M12 6.4 L17.6 12 L12 17.6 L6.4 12 Z" opacity="0.55"/>
  <circle cx="12" cy="12" r="1.5" fill="#a09070" stroke="none" opacity="0.9"/>
</g>`;

export const FRAME_LING = `<g fill="none" stroke="#2d6b4f" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 2.4 L21.6 12 L12 21.6 L2.4 12 Z"/>
  <path d="M12 2.4 L12 0.9 M21.6 12 L23.1 12 M12 21.6 L12 23.1 M2.4 12 L0.9 12" opacity="0.45"/>
  <path d="M12 6 L18 12 L12 18 L6 12 Z" opacity="0.7"/>
  <path d="M8.8 12.7 C9.6 11.3 11 10.9 12 11.9 C13 10.9 14.4 11.3 15.2 12.7"/>
  <circle cx="12" cy="15.2" r="1" fill="#2d6b4f" stroke="none" opacity="0.85"/>
</g>`;

export const FRAME_XIAN = `<g fill="none" stroke="#c4922a" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 1.8 L22.2 12 L12 22.2 L1.8 12 Z"/>
  <path d="M12 1.8 L12 0.5 M22.2 12 L23.5 12 M12 22.2 L12 23.5 M1.8 12 L0.5 12" opacity="0.5"/>
  <path d="M12 4.8 L19.2 12 L12 19.2 L4.8 12 Z" opacity="0.85"/>
  <path d="M12 8 L16 12 L12 16 L8 12 Z" opacity="0.45"/>
  <path d="M9.6 4.4 C10.2 3 11.4 2.4 12 2.4 M14.4 4.4 C13.8 3 12.6 2.4 12 2.4"/>
  <path d="M9.6 19.6 C10.2 21 11.4 21.6 12 21.6 M14.4 19.6 C13.8 21 12.6 21.6 12 21.6"/>
  <circle cx="12" cy="12" r="1.45" fill="#c4922a" stroke="none"/>
</g>`;

export const FRAME_SHEN = `<g fill="none" stroke="#b22222" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 1.6 L22.4 12 L12 22.4 L1.6 12 Z"/>
  <path d="M12 1.6 L12 0.4 M22.4 12 L23.6 12 M12 22.4 L12 23.6 M1.6 12 L0.4 12" opacity="0.55"/>
  <path d="M12 5 L19 12 L12 19 L5 12 Z" opacity="0.8"/>
  <circle cx="12" cy="12" r="4.6" opacity="0.7"/>
  <path d="M12 7.4 L12 12 L15.6 12 M12 16.6 L12 12 L8.4 12" opacity="0.5"/>
  <path d="M8.6 8.6 C9.6 7.4 10.4 7.4 10.9 8.2 M15.4 8.6 C14.4 7.4 13.6 7.4 13.1 8.2"
        opacity="0.7"/>
  <path d="M8.6 15.4 C9.6 16.6 10.4 16.6 10.9 15.8 M15.4 15.4 C14.4 16.6 13.6 16.6 13.1 15.8"
        opacity="0.7"/>
  <circle cx="12" cy="12" r="1.5" fill="#b22222" stroke="none"/>
</g>`;

export const FRAME_SHENG = `<defs>
  <linearGradient id="xtFrameShengGrad" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#c4922a"/>
    <stop offset="0.55" stop-color="#c4922a"/>
    <stop offset="1" stop-color="#b22222"/>
  </linearGradient>
</defs>
<g fill="none" stroke="url(#xtFrameShengGrad)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 1.4 L22.6 12 L12 22.6 L1.4 12 Z"/>
  <path d="M12 1.4 L12 0.2 M22.6 12 L23.8 12 M12 22.6 L12 23.8 M1.4 12 L0.2 12"/>
  <path d="M12 4.6 L19.4 12 L12 19.4 L4.6 12 Z" opacity="0.85"/>
  <circle cx="12" cy="12" r="5.4" opacity="0.75"/>
  <circle cx="12" cy="12" r="3.4" opacity="0.4"/>
  <path d="M12 12 C10.6 10.6 10.6 9.4 12 8.4 C13.4 9.4 13.4 10.6 12 12 C13.4 13.4 13.4 14.6 12 15.6 C10.6 14.6 10.6 13.4 12 12 Z" opacity="0.9"/>
  <path d="M8.4 8.4 C9.5 7.2 10.4 7.2 10.9 8 M15.6 8.4 C14.5 7.2 13.6 7.2 13.1 8"
        opacity="0.7"/>
  <path d="M8.4 15.6 C9.5 16.8 10.4 16.8 10.9 16 M15.6 15.6 C14.5 16.8 13.6 16.8 13.1 16"
        opacity="0.7"/>
  <circle cx="12" cy="12" r="1.3" fill="#c4922a" stroke="none"/>
</g>`;

/* ================================================================== */
/* 四、大场面插画 400×260（自带完整 <svg>）                             */
/* ================================================================== */

/* 突破：山巅打坐，天光破云而下，灵气成柱 ----------------------------- */
export const SCENE_BREAKTHROUGH = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="260" viewBox="0 0 400 260">
  <rect width="400" height="260" fill="#f5ead2"/>
  <path d="M200 0 L236 0 L288 178 L156 178 Z" fill="#c4922a" opacity="0.1"/>
  <path d="M200 0 L218 0 L248 178 L184 178 Z" fill="#c4922a" opacity="0.12"/>
  <path d="M200 0 L210 0 L224 178 L192 178 Z" fill="#faf0dd" opacity="0.35"/>
  <path d="M0 186 C34 152 58 124 84 148 C108 170 126 158 148 138 C176 112 206 132 232 158 C258 184 300 172 340 186 C360 193 380 190 400 196 L400 260 L0 260 Z" fill="#2c1810" opacity="0.07"/>
  <path d="M104 260 C136 208 172 168 196 128 C200 121 208 121 212 128 C238 168 274 208 306 260 Z" fill="#2c1810" opacity="0.13"/>
  <path d="M104 260 C136 208 172 168 196 128 C200 121 208 121 212 128 C238 168 274 208 306 260" fill="none" stroke="#2c1810" stroke-width="1.6" opacity="0.45"/>
  <path d="M162 218 C174 204 184 190 192 174 M180 236 C190 222 198 208 204 194 M196 250 C202 240 206 230 210 220" fill="none" stroke="#2c1810" stroke-width="1" opacity="0.16"/>
  <path d="M188 212 L152 0 L248 0 L212 212 Z" fill="#c4922a" opacity="0.07"/>
  <path d="M193 212 L172 0 L228 0 L207 212 Z" fill="#2d6b4f" opacity="0.07"/>
  <path d="M196 212 L188 0 L212 0 L204 212 Z" fill="#faf0dd" opacity="0.22"/>
  <path d="M186 204 C184 174 186 148 200 122 M214 204 C216 174 214 148 200 122" fill="none" stroke="#c4922a" stroke-width="1.1" opacity="0.45"/>
  <path d="M192 202 C190 176 192 152 200 128 M208 202 C210 176 208 152 200 128" fill="none" stroke="#2d6b4f" stroke-width="1" opacity="0.35"/>
  <g fill="#2c1810" fill-opacity="0.86">
    <circle cx="200" cy="103.6" r="6.4"/>
    <circle cx="200" cy="95.6" r="2.1"/>
    <path d="M200 110.6 C191.4 110.6 186 117.2 185 126 L215 126 C214 117.2 208.6 110.6 200 110.6 Z"/>
    <path d="M184 126.6 C192.6 121.8 198.8 120.4 200 120.4 C201.2 120.4 207.4 121.8 216 126.6 Z"/>
  </g>
  <path d="M191.4 117 C194.8 121 198.8 123 200 123 M208.6 117 C205.2 121 201.2 123 200 123" fill="none" stroke="#2c1810" stroke-width="2.4" stroke-linecap="round" opacity="0.86"/>
  <path d="M0 214 C40 206 70 216 110 210 C150 204 176 214 216 208 C256 202 286 214 330 208 C360 204 380 210 400 206 L400 260 L0 260 Z" fill="#faf0dd" opacity="0.92"/>
  <path d="M0 214 C40 206 70 216 110 210 C150 204 176 214 216 208 C256 202 286 214 330 208 C360 204 380 210 400 206" fill="none" stroke="#8b6b3d" stroke-width="1.1" opacity="0.45"/>
  <path d="M0 238 C46 230 82 240 126 234 C170 228 206 238 250 232 C294 226 336 236 376 230 C384 229 394 231 400 230 L400 260 L0 260 Z" fill="#f5ead2" opacity="0.85"/>
  <path d="M0 238 C46 230 82 240 126 234 C170 228 206 238 250 232 C294 226 336 236 376 230" fill="none" stroke="#8b6b3d" stroke-width="1" opacity="0.3"/>
  <path d="M84 74 l6 -4 l6 4 M300 56 l5 -3.4 l5 3.4 M124 96 l4.4 -3 l4.4 3" fill="none" stroke="#2c1810" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" opacity="0.35"/>
  <circle cx="86" cy="196" r="2" fill="#2c1810" opacity="0.08"/>
  <circle cx="330" cy="188" r="2.6" fill="#2c1810" opacity="0.07"/>
  <circle cx="140" cy="206" r="1.6" fill="#2c1810" opacity="0.08"/>
  <circle cx="264" cy="200" r="2.2" fill="#2c1810" opacity="0.06"/>
</svg>`;

/* 天劫：乌云压顶，紫电劈落，渺小人影仰首 ----------------------------- */
export const SCENE_TRIBULATION = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="260" viewBox="0 0 400 260">
  <rect width="400" height="260" fill="#f5ead2"/>
  <path d="M-10 150 C-6 116 18 92 50 96 C62 62 100 44 138 52 C168 58 192 80 200 108 C224 90 258 98 272 124 C300 118 322 136 326 162 C348 166 360 178 356 190 C300 182 260 190 210 184 C160 178 120 188 70 182 C30 177 0 184 -10 186 Z" fill="#2c1810" opacity="0.86"/>
  <path d="M-10 116 C4 92 36 80 64 90 C76 66 112 56 142 68 C162 76 176 92 178 112 C150 122 112 116 74 122 C42 127 8 124 -10 130 Z" fill="#2c1810" opacity="0.3"/>
  <path d="M200 140 C212 116 246 106 274 118 C290 104 318 108 330 124 C344 142 344 162 334 176 C306 186 268 178 244 166 C224 158 204 154 200 140 Z" fill="#2c1810" opacity="0.26"/>
  <path d="M-10 168 C40 160 80 170 126 164 C172 158 208 168 254 162 C300 156 340 166 400 160 L400 174 C340 180 300 170 254 176 C208 182 172 172 126 178 C80 184 40 174 -10 182 Z" fill="#2c1810" opacity="0.14"/>
  <path d="M214 148 L176 202 L194 202 L158 254 L216 200 L197 200 L226 148 Z" fill="#7d5bb0" opacity="0.92"/>
  <path d="M214 148 L176 202 L194 202 L158 254 L216 200 L197 200 L226 148 Z" fill="none" stroke="#9b7fc4" stroke-width="8" stroke-linejoin="round" opacity="0.16"/>
  <path d="M204 200 L232 212 M192 200 L166 190 M180 226 L196 242" fill="none" stroke="#7d5bb0" stroke-width="2.2" stroke-linecap="round" opacity="0.6"/>
  <path d="M60 128 L42 162 M92 120 L76 150 M312 116 L330 146 M348 126 L362 154 M28 150 L14 178 M376 148 L388 172" fill="none" stroke="#8b6b3d" stroke-width="1.3" stroke-linecap="round" opacity="0.26"/>
  <path d="M120 190 L106 216 M144 196 L132 220 M262 192 L250 216 M288 198 L278 220 M340 194 L330 216 M46 192 L34 214" fill="none" stroke="#8b6b3d" stroke-width="1.2" stroke-linecap="round" opacity="0.22"/>
  <path d="M-10 240 C30 230 70 238 110 234 C150 230 180 238 210 234 C250 229 300 238 350 232 C370 229 390 233 400 231 L400 260 L-10 260 Z" fill="#2c1810" opacity="0.32"/>
  <path d="M-10 252 C50 246 110 252 170 248 C230 244 290 252 350 248 C370 246 390 249 400 248 L400 260 L-10 260 Z" fill="#2c1810" opacity="0.22"/>
  <path d="M186 236 C186 218 191 208 200 208 C209 208 214 218 214 236" fill="none" stroke="#2d6b4f" stroke-width="1.5" stroke-dasharray="3.5 3.5" opacity="0.55"/>
  <g fill="#2c1810" fill-opacity="0.9">
    <circle cx="198.6" cy="215.4" r="3.5"/>
    <circle cx="197.2" cy="211.6" r="1.3"/>
    <path d="M198.6 219.4 C195.2 219.4 193 222.8 192.6 228.4 L205 228.4 C204.6 222.8 202.2 219.4 198.6 219.4 Z"/>
    <path d="M193.6 221.4 C190.4 223.4 189 226.6 189 230.4 L191.4 230.4 C191.4 227.2 192.4 224.4 194.6 222.6 Z"/>
    <path d="M203.6 221.4 C206.8 223.4 208.2 226.6 208.2 230.4 L205.8 230.4 C205.8 227.2 204.8 224.4 202.6 222.6 Z"/>
    <path d="M194.6 228.4 L193.4 234.6 L196.2 234.6 L197.2 228.4 Z"/>
    <path d="M202.6 228.4 L203.8 234.6 L201 234.6 L200 228.4 Z"/>
  </g>
  <circle cx="150" cy="176" r="1.6" fill="#2c1810" opacity="0.16"/>
  <circle cx="256" cy="182" r="2" fill="#2c1810" opacity="0.14"/>
  <circle cx="106" cy="188" r="1.4" fill="#2c1810" opacity="0.12"/>
  <circle cx="292" cy="192" r="1.2" fill="#2c1810" opacity="0.12"/>
</svg>`;

/* 飞升：云海裂开金门，人影化作流光 ----------------------------------- */
export const SCENE_ASCENSION = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="260" viewBox="0 0 400 260">
  <rect width="400" height="260" fill="#f5ead2"/>
  <path d="M200 130 L64 0 L124 0 Z" fill="#c4922a" opacity="0.08"/>
  <path d="M200 130 L276 0 L336 0 Z" fill="#c4922a" opacity="0.08"/>
  <path d="M200 130 L0 56 L0 106 Z" fill="#c4922a" opacity="0.07"/>
  <path d="M200 130 L400 56 L400 106 Z" fill="#c4922a" opacity="0.07"/>
  <path d="M200 130 L152 0 L176 0 Z" fill="#faf0dd" opacity="0.28"/>
  <path d="M-10 74 A15 15 0 0 1 -3 40 A22 22 0 0 1 33 21 A24 24 0 0 1 74 30 A18 18 0 0 1 96 53 A14 14 0 0 1 91 74 Z" fill="#2c1810" opacity="0.09"/>
  <path d="M410 74 A15 15 0 0 0 403 40 A22 22 0 0 0 367 21 A24 24 0 0 0 326 30 A18 18 0 0 0 304 53 A14 14 0 0 0 309 74 Z" fill="#2c1810" opacity="0.09"/>
  <path d="M-3 40 A22 22 0 0 1 33 21 A24 24 0 0 1 74 30" fill="none" stroke="#faf0dd" stroke-width="3.4" opacity="0.4"/>
  <path d="M403 40 A22 22 0 0 0 367 21 A24 24 0 0 0 326 30" fill="none" stroke="#faf0dd" stroke-width="3.4" opacity="0.4"/>
  <path d="M96 53 A18 18 0 0 0 74 30" fill="none" stroke="#c4922a" stroke-width="1.1" opacity="0.35"/>
  <path d="M81 65 A14 14 0 0 0 91 74" fill="none" stroke="#c4922a" stroke-width="1.1" opacity="0.25"/>
  <path d="M304 53 A18 18 0 0 1 326 30" fill="none" stroke="#c4922a" stroke-width="1.1" opacity="0.35"/>
  <path d="M319 65 A14 14 0 0 1 309 74" fill="none" stroke="#c4922a" stroke-width="1.1" opacity="0.25"/>
  <path d="M108 82 A12 12 0 0 1 116 60 A16 16 0 0 1 142 55 A14 14 0 0 1 158 68 A10 10 0 0 1 158 84 Z" fill="#faf0dd" stroke="#8b6b3d" stroke-width="1" opacity="0.9"/>
  <path d="M292 82 A12 12 0 0 0 284 60 A16 16 0 0 0 258 55 A14 14 0 0 0 242 68 A10 10 0 0 0 242 84 Z" fill="#faf0dd" stroke="#8b6b3d" stroke-width="1" opacity="0.9"/>
  <path d="M124 62 C132 58 142 59 148 64" fill="none" stroke="#c4922a" stroke-width="1" opacity="0.4"/>
  <path d="M276 62 C268 58 258 59 252 64" fill="none" stroke="#c4922a" stroke-width="1" opacity="0.4"/>
  <path d="M176 178 L224 178 L248 234 L152 234 Z" fill="#c4922a" opacity="0.12"/>
  <path d="M168 178 L168 92 C168 66 182 48 200 48 C218 48 232 66 232 92 L232 178 Z" fill="#c4922a" opacity="0.2"/>
  <path d="M178 178 L178 94 C178 73 188 60 200 60 C212 60 222 73 222 94 L222 178 Z" fill="#faf0dd" opacity="0.5"/>
  <path d="M168 178 L168 92 C168 66 182 48 200 48 C218 48 232 66 232 92 L232 178" fill="none" stroke="#c4922a" stroke-width="2"/>
  <path d="M176 178 L176 94 C176 72 187 58 200 58 C213 58 224 72 224 94 L224 178" fill="none" stroke="#c4922a" stroke-width="1.1" opacity="0.5"/>
  <path d="M150 44 L250 44" fill="none" stroke="#c4922a" stroke-width="2.2"/>
  <path d="M138 44 C154 30 174 23 200 23 C226 23 246 30 262 44" fill="none" stroke="#c4922a" stroke-width="2"/>
  <path d="M146 49 C162 37 180 31 200 31 C220 31 238 37 254 49" fill="none" stroke="#c4922a" stroke-width="1" opacity="0.45"/>
  <path d="M138 44 C132 43 129 40 128 36 M262 44 C268 43 271 40 272 36" fill="none" stroke="#c4922a" stroke-width="1.5" stroke-linecap="round" opacity="0.7"/>
  <path d="M200 23 L200 15" fill="none" stroke="#c4922a" stroke-width="1.6" opacity="0.8"/>
  <circle cx="200" cy="12" r="3" fill="#c4922a" opacity="0.75"/>
  <path d="M186 118 C190 112 196 110 200 110 C204 110 210 112 214 118" fill="none" stroke="#c4922a" stroke-width="1.1" opacity="0.5"/>
  <circle cx="184" cy="132" r="3" fill="none" stroke="#c4922a" stroke-width="1.1" opacity="0.5"/>
  <circle cx="216" cy="132" r="3" fill="none" stroke="#c4922a" stroke-width="1.1" opacity="0.5"/>
  <path d="M158 178 L242 178" fill="none" stroke="#c4922a" stroke-width="1.6" opacity="0.85"/>
  <path d="M152 185 L248 185 M146 192 L254 192" fill="none" stroke="#c4922a" stroke-width="1.2" opacity="0.45"/>
  <path d="M-10 212 C30 202 60 214 96 208 C132 202 160 214 196 208 C232 202 262 214 300 208 C336 202 368 212 400 206 L400 260 L-10 260 Z" fill="#faf0dd"/>
  <path d="M-10 212 C30 202 60 214 96 208 C132 202 160 214 196 208 C232 202 262 214 300 208 C336 202 368 212 400 206" fill="none" stroke="#8b6b3d" stroke-width="1.1" opacity="0.4"/>
  <path d="M-10 232 C40 224 80 234 124 228 C168 222 200 234 244 228 C288 222 330 232 372 226 C384 224 394 226 400 225 L400 260 L-10 260 Z" fill="#f5ead2" opacity="0.85"/>
  <path d="M-10 232 C40 224 80 234 124 228 C168 222 200 234 244 228 C288 222 330 232 372 226" fill="none" stroke="#8b6b3d" stroke-width="1" opacity="0.3"/>
  <g fill="#2c1810" fill-opacity="0.55">
    <circle cx="200" cy="180" r="5.4"/>
    <path d="M200 186.6 C195.2 186.6 191.2 191.8 190.2 200.4 L209.8 200.4 C208.8 191.8 204.8 186.6 200 186.6 Z"/>
  </g>
  <path d="M190.4 192 C187.4 195.4 186.2 198.6 186.2 201.4 M209.6 192 C212.6 195.4 213.8 198.6 213.8 201.4" fill="none" stroke="#2c1810" stroke-width="2.2" stroke-linecap="round" opacity="0.52"/>
  <path d="M192.4 202 C190 192 193.6 180 191.6 166 M198 204 C196 190 200 176 197.6 160 M204 204 C206 190 202 176 204.4 158 M209.6 202 C212 192 208 180 210 166" fill="none" stroke="#c4922a" stroke-width="1.4" stroke-linecap="round" opacity="0.7"/>
  <path d="M195.2 206 C193.6 196 196 186 194.8 176 M206.8 206 C208.4 196 206 186 207.2 176" fill="none" stroke="#2d6b4f" stroke-width="1.2" stroke-linecap="round" opacity="0.45"/>
  <circle cx="191.6" cy="158" r="1.8" fill="#c4922a" opacity="0.7"/>
  <circle cx="204.4" cy="150" r="2.2" fill="#c4922a" opacity="0.6"/>
  <circle cx="197.6" cy="140" r="1.4" fill="#c4922a" opacity="0.55"/>
  <circle cx="210" cy="164" r="1.2" fill="#c4922a" opacity="0.6"/>
  <circle cx="188" cy="172" r="1.1" fill="#2d6b4f" opacity="0.5"/>
  <circle cx="212.6" cy="146" r="1" fill="#c4922a" opacity="0.5"/>
</svg>`;

/* 空态：荒山野岭，尚未开辟洞府 --------------------------------------- */
export const SCENE_EMPTY_CAVE = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="260" viewBox="0 0 400 260">
  <rect width="400" height="260" fill="#f5ead2"/>
  <path d="M-10 150 C40 116 80 92 120 120 C150 140 176 132 200 112 C232 86 268 104 300 132 C330 158 366 146 400 154 L400 260 L-10 260 Z" fill="#2c1810" opacity="0.06"/>
  <path d="M-10 186 C40 158 90 138 140 158 C180 174 220 162 260 144 C300 126 350 144 400 170 L400 260 L-10 260 Z" fill="#2c1810" opacity="0.09"/>
  <path d="M212 260 L232 150 C236 126 258 118 282 128 C312 140 330 176 338 260 Z" fill="#2c1810" opacity="0.14"/>
  <path d="M232 150 C236 126 258 118 282 128 C312 140 330 176 338 260" fill="none" stroke="#4a3520" stroke-width="1.5" opacity="0.5"/>
  <path d="M252 156 C258 190 262 222 264 254 M270 150 C276 184 282 220 286 252 M296 160 C304 190 312 224 318 254" fill="none" stroke="#2c1810" stroke-width="1" opacity="0.16"/>
  <path d="M266 260 C266 226 277 206 296 206 C315 206 326 226 326 260" fill="none" stroke="#8b6b3d" stroke-width="1.4" stroke-dasharray="6 6" opacity="0.5"/>
  <path d="M282 260 C282 240 288 228 296 228 C304 228 310 240 310 260" fill="none" stroke="#8b6b3d" stroke-width="1.1" stroke-dasharray="4 5" opacity="0.28"/>
  <path d="M96 260 C100 236 96 214 100 196 C102 186 108 180 112 174" fill="none" stroke="#2c1810" stroke-width="1.6" stroke-linecap="round" opacity="0.6"/>
  <path d="M100 214 C92 206 86 202 78 200 M100 200 C108 192 116 190 125 190 M100 196 C94 188 88 184 80 182" fill="none" stroke="#2c1810" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" opacity="0.55"/>
  <path d="M78 200 C72 198 68 194 66 190 M125 190 C131 188 135 184 137 180 M80 182 C74 179 71 175 70 171" fill="none" stroke="#2c1810" stroke-width="1.1" stroke-linecap="round" opacity="0.4"/>
  <path d="M112 174 C116 168 122 165 128 165 M112 174 C110 168 106 164 101 162" fill="none" stroke="#2c1810" stroke-width="1.1" stroke-linecap="round" opacity="0.45"/>
  <path d="M56 252 C58 244 60 240 62 236 M62 252 C62 244 62 238 60 232 M68 252 C70 245 72 241 75 237" fill="none" stroke="#8b6b3d" stroke-width="1.1" stroke-linecap="round" opacity="0.5"/>
  <path d="M148 246 C150 240 152 236 154 232 M154 246 C154 240 154 235 152 230 M160 246 C162 240 164 236 167 233" fill="none" stroke="#8b6b3d" stroke-width="1.1" stroke-linecap="round" opacity="0.45"/>
  <path d="M336 250 C338 243 340 239 342 235 M342 250 C342 244 342 239 340 234" fill="none" stroke="#8b6b3d" stroke-width="1.1" stroke-linecap="round" opacity="0.5"/>
  <path d="M198 244 C200 238 202 234 204 230 M204 244 C204 238 204 233 202 228" fill="none" stroke="#8b6b3d" stroke-width="1.1" stroke-linecap="round" opacity="0.4"/>
  <path d="M180 260 C216 252 246 248 280 246" fill="none" stroke="#8b6b3d" stroke-width="1.2" stroke-dasharray="3 6" opacity="0.3"/>
  <path d="M-10 200 C40 192 70 202 110 196 C150 190 180 200 220 194 C260 188 300 198 340 192 C360 189 380 194 400 192 L400 204 C380 202 360 206 340 204 C300 210 260 200 220 206 C180 212 150 202 110 208 C70 214 40 204 -10 212 Z" fill="#faf0dd" opacity="0.85"/>
  <path d="M-10 200 C40 192 70 202 110 196 C150 190 180 200 220 194 C260 188 300 198 340 192 C360 189 380 194 400 192" fill="none" stroke="#8b6b3d" stroke-width="1" opacity="0.35"/>
  <path d="M84 74 l5 -3.4 l5 3.4 M310 62 l4.4 -3 l4.4 3" fill="none" stroke="#2c1810" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" opacity="0.32"/>
  <circle cx="60" cy="196" r="1.8" fill="#2c1810" opacity="0.07"/>
  <circle cx="352" cy="204" r="2.2" fill="#2c1810" opacity="0.06"/>
</svg>`;

/* 陨落：残剑插在荒原，落叶 ------------------------------------------- */
export const SCENE_DEATH = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="260" viewBox="0 0 400 260">
  <defs>
    <path id="sdLeaf" d="M0 0 C4.6 -3.6 10.4 -2.8 13 1.8 C10.4 6.4 4.6 7 0 3.4 Z"/>
  </defs>
  <rect width="400" height="260" fill="#f5ead2"/>
  <circle cx="298" cy="74" r="30" fill="#2c1810" opacity="0.05"/>
  <circle cx="298" cy="74" r="30" fill="none" stroke="#2c1810" stroke-width="1" opacity="0.12"/>
  <path d="M56 202 C88 150 150 118 220 128 C292 138 332 176 342 220 C300 242 138 248 56 202 Z" fill="#2c1810" opacity="0.05"/>
  <path d="M-10 178 C60 166 120 176 180 172 C240 168 300 178 360 172 C375 170 390 173 400 171 L400 260 L-10 260 Z" fill="#2c1810" opacity="0.08"/>
  <path d="M-10 178 C60 166 120 176 180 172 C240 168 300 178 360 172" fill="none" stroke="#4a3520" stroke-width="1.2" opacity="0.3"/>
  <path d="M-10 214 C50 206 110 216 170 210 C230 204 290 214 350 208 C370 206 390 209 400 208 L400 260 L-10 260 Z" fill="#2c1810" opacity="0.12"/>
  <path d="M-10 240 C60 234 130 242 200 238 C270 234 330 242 400 238 L400 260 L-10 260 Z" fill="#2c1810" opacity="0.16"/>
  <g transform="rotate(-8 196 222)">
    <path d="M190 222 L190 205 L195 200 L190 195 L190 170 L202 170 L202 222 Z" fill="#2c1810" fill-opacity="0.52" stroke="#2c1810" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M196 172 L196 220" fill="none" stroke="#f5ead2" stroke-width="1.2" opacity="0.32"/>
    <path d="M181 166 C187 169.5 205 169.5 211 166" fill="none" stroke="#2c1810" stroke-width="3" stroke-linecap="round"/>
    <path d="M193 166 L193 142 L199 142 L199 166 Z" fill="#2c1810" fill-opacity="0.64"/>
    <circle cx="196" cy="138.6" r="4.2" fill="#2c1810" fill-opacity="0.7"/>
  </g>
  <path d="M199 146 C214 142 222 155 234 151 C229 161 217 165 202 158 Z" fill="#b22222" opacity="0.34"/>
  <path d="M203 154 C210 161 209 171 202 176" fill="none" stroke="#b22222" stroke-width="1.2" stroke-linecap="round" opacity="0.3"/>
  <path d="M196 222 L181 232 M196 222 L212 234 M196 222 L200 240 M196 222 L170 221 M196 222 L162 230" fill="none" stroke="#2c1810" stroke-width="1.2" stroke-linecap="round" opacity="0.3"/>
  <path d="M230 234 L254 223 L261 232 L246 238 Z" fill="#2c1810" opacity="0.3"/>
  <path d="M244 240 L251 236 L255 241 L247 244 Z" fill="#2c1810" opacity="0.2"/>
  <use href="#sdLeaf" transform="translate(120,148) rotate(24) scale(1.1)" fill="#c4922a" opacity="0.45"/>
  <use href="#sdLeaf" transform="translate(272,120) rotate(-32) scale(0.9)" fill="#b22222" opacity="0.35"/>
  <use href="#sdLeaf" transform="translate(318,196) rotate(56) scale(1.15)" fill="#c4922a" opacity="0.4"/>
  <use href="#sdLeaf" transform="translate(86,214) rotate(-14) scale(1)" fill="#8b6b3d" opacity="0.4"/>
  <use href="#sdLeaf" transform="translate(246,168) rotate(140) scale(0.8)" fill="#b22222" opacity="0.28"/>
  <use href="#sdLeaf" transform="translate(160,236) rotate(38) scale(0.85)" fill="#8b6b3d" opacity="0.32"/>
  <use href="#sdLeaf" transform="translate(344,150) rotate(-64) scale(0.75)" fill="#c4922a" opacity="0.3"/>
  <path d="M60 250 C62 243 64 239 66 235 M66 250 C66 243 66 238 64 233 M72 250 C74 244 76 240 79 237" fill="none" stroke="#8b6b3d" stroke-width="1.1" stroke-linecap="round" opacity="0.45"/>
  <path d="M296 244 C298 238 300 234 302 230 M302 244 C302 238 302 233 300 228 M308 244 C310 238 312 234 315 231" fill="none" stroke="#8b6b3d" stroke-width="1.1" stroke-linecap="round" opacity="0.4"/>
  <path d="M132 244 C134 239 136 235 138 232 M138 244 C138 239 138 235 136 231" fill="none" stroke="#8b6b3d" stroke-width="1" stroke-linecap="round" opacity="0.35"/>
  <path d="M352 232 C354 227 356 224 358 221" fill="none" stroke="#8b6b3d" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
  <circle cx="92" cy="196" r="1.6" fill="#2c1810" opacity="0.07"/>
  <circle cx="330" cy="212" r="2.2" fill="#2c1810" opacity="0.06"/>
</svg>`;
