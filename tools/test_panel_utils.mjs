/**
 * 面板工具（ui/panel.js 的 setText / setWidth / toggleClass / setDisabled）自测。
 *
 * 为什么要给这四个小函数单独写一整套测试：
 * 它们是**每个面板每秒都在调用**的写入口，一旦出错就不是"某个数字不刷新"，
 * 而是"改错了对象"。真实事故：setText 一度把面板容器本身当成了目标节点，
 * `textContent` 一赋值把整页骨架冲掉——**11 个面板集体白屏**，
 * 而且不报错、不抛异常，只是静静地什么都不显示。
 *
 * 所以这里锁死的核心不变量是：**三参形态绝不能碰 host 本身**。
 *
 * 用法: node tools/test_panel_utils.mjs
 */

// ==================== 极简 DOM 桩 ====================
// panel.js 只用到这几个 API，手写一个够用的假 DOM 比引入 jsdom 更合适
// （本项目零依赖，测试工具也不该破例）。

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

class FakeClassList {
  constructor(node) { this.node = node; }
  get set() { return new Set(String(this.node.className || '').split(/\s+/).filter(Boolean)); }
  contains(c) { return this.set.has(c); }
  toggle(c, on) {
    const s = this.set;
    const want = on === undefined ? !s.has(c) : !!on;
    if (want) s.add(c); else s.delete(c);
    this.node.className = [...s].join(' ');
    return want;
  }
}

class FakeNode {
  constructor(tag = 'div') {
    this.nodeType = ELEMENT_NODE;
    this.tagName = String(tag).toUpperCase();
    this.childNodes = [];
    this.attrs = {};
    this.dataset = {};
    this.className = '';
    this.id = '';
    this.style = {};
    this.disabled = false;
    this.classList = new FakeClassList(this);
  }

  get children() { return this.childNodes.filter((n) => n.nodeType === ELEMENT_NODE); }
  get firstChild() { return this.childNodes[0] || null; }

  appendChild(n) { this.childNodes.push(n); n.parentNode = this; return n; }
  replaceChildren() { this.childNodes = []; }

  get textContent() {
    return this.childNodes.map((n) => (n.nodeType === TEXT_NODE ? n.nodeValue : n.textContent)).join('');
  }
  set textContent(v) {
    this.childNodes = [];
    if (v !== '') this.appendChild(textNode(v));
  }

  /** 只支持本项目实际用到的四种选择器：#id / [attr="v"] / .class / tag */
  querySelector(sel) {
    const list = this.querySelectorAll(sel);
    return list.length ? list[0] : null;
  }

  querySelectorAll(sel) {
    // 必须像真 DOM 一样**对非法选择器抛错**，否则 query() 的 catch 分支永远走不到，
    // "中文提示被当成选择器"这类事故就测不出来了。
    if (!isValidSelector(sel)) {
      throw new Error(`'${sel}' is not a valid selector.`);
    }
    const out = [];
    const walk = (n) => {
      for (const c of n.childNodes) {
        if (c.nodeType !== ELEMENT_NODE) continue;
        if (matches(c, sel)) out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }
}

function textNode(v) {
  return { nodeType: TEXT_NODE, nodeValue: String(v), parentNode: null };
}

/** 只认这四种写法，其余一律视为非法（与真 DOM 的行为对齐） */
function isValidSelector(sel) {
  if (typeof sel !== 'string' || sel === '') return false;
  if (/^\[[\w-]+(?:="[^"]*")?\]$/.test(sel)) return true;
  if (/^#[A-Za-z_][\w-]*$/.test(sel)) return true;
  if (/^\.[A-Za-z_][\w-]*$/.test(sel)) return true;
  // 标签名必须是 ASCII —— 中文提示不能被当成标签名悄悄放过
  return /^[A-Za-z][\w-]*$/.test(sel);
}

function matches(n, sel) {
  const m = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(sel);
  if (m) {
    const [, name, val] = m;
    // data-* 属性在真 DOM 里走 dataset 无前缀访问
    const key = name.startsWith('data-') ? name.slice(5) : name;
    const got = n.dataset[key] ?? n.attrs[name];
    return val === undefined ? got !== undefined : String(got) === val;
  }
  if (sel.startsWith('#')) return n.id === sel.slice(1);
  if (sel.startsWith('.')) return n.classList.contains(sel.slice(1));
  return n.tagName === sel.toUpperCase();
}

globalThis.Node = { TEXT_NODE, ELEMENT_NODE };
globalThis.document = {
  createTextNode: (v) => textNode(v),
  createElement: (t) => new FakeNode(t),
};

const { setText, setWidth, toggleClass, setDisabled } = await import('../src/ui/panel.js');

// ==================== 断言 ====================
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
function span(f, valueText = '') {
  const s = new FakeNode('span');
  s.dataset.f = f;
  if (valueText) s.appendChild(textNode(valueText));
  return s;
}

// ==================== 1. 三参 · 选择器形态 ====================
section('1. setText(host, selector, value)：最常用的一路');
{
  const host = new FakeNode();
  const atk = span('atk', '0');
  host.appendChild(new FakeNode('div'));
  host.appendChild(atk);
  const before = host.childNodes.length;

  setText(host, '[data-f="atk"]', 58);
  check('目标节点被更新', atk.textContent === '58', atk.textContent);
  check('★ host 骨架原封不动（这是当年集体白屏的根因）',
    host.childNodes.length === before, `子节点 ${before} → ${host.childNodes.length}`);
  check('host 自身文本没有被写脏', !host.textContent.includes('[data-f'), host.textContent.slice(0, 40));
}

// ==================== 2. 双参 · 值形态 ====================
section('2. setText(element, value)：调用方已拿到节点');
{
  const el = new FakeNode('span');
  setText(el, '条件已足');
  check('直接写入元素', el.textContent === '条件已足', el.textContent);
  setText(el, '条件已足');
  check('重复写同值不产生新节点', el.childNodes.length === 1, '子节点数 ' + el.childNodes.length);

  const empty = new FakeNode('span');
  setText(empty, '');
  check('写空串不留下空文本节点', empty.childNodes.length === 0);

  // 防御：首参不是元素时应当「什么都不做」，而不是拿别的节点顶替
  const host = new FakeNode();
  host.appendChild(span('x', '原值'));
  setText('someId', '值');
  check('首参为字符串时安全跳过', host.textContent === '原值', host.textContent);
}

// ==================== 3. 三参 · 节点形态 ====================
section('3. setText(host, element, value)：行内复用已查好的节点');
{
  const host = new FakeNode();
  const row = new FakeNode('div');
  const lv = span('beast-level', 'Lv.1');
  row.appendChild(lv);
  host.appendChild(row);

  setText(host, lv, 'Lv.9 / Lv.20');
  check('第二参是节点时直接用它', lv.textContent === 'Lv.9 / Lv.20', lv.textContent);
  check('host 骨架未被改动', host.children.length === 1, '元素子节点 ' + host.children.length);
}

// ==================== 4. 非法选择器必须被兜住 ====================
section('4. 非法选择器：只跳过，不许中断渲染');
{
  const host = new FakeNode();
  const keep = span('keep', '还在');
  host.appendChild(keep);
  const warnings = [];
  const origWarn = console.warn;
  console.warn = (...a) => warnings.push(a.join(' '));

  let threw = false;
  try {
    // 中文提示被误当成选择器的真实事故现场（天赋面板）
    setText(host, '道基点不足（还差 2）', '');
  } catch { threw = true; }
  console.warn = origWarn;

  check('三参形态 · 不抛异常', !threw);
  check('三参形态 · host 未被破坏', host.children.length === 1 && keep.textContent === '还在');
  check('三参形态 · 有告警留痕', warnings.some((w) => w.includes('非法的选择器')), warnings.join('|'));

  // 双参形态：中文是**值**不是选择器，必须正常写入
  const reason = new FakeNode('span');
  setText(reason, '道基点不足（还差 2）');
  check('双参形态 · 中文当值正常写入', reason.textContent === '道基点不足（还差 2）', reason.textContent);
}

// ==================== 5. 另外三个工具的同款形态 ====================
section('5. setWidth / toggleClass / setDisabled 的三种形态');
{
  const host = new FakeNode();
  const bar = new FakeNode('div');
  bar.dataset.bar = 'x';
  const btn = new FakeNode('button');
  const row = new FakeNode('div');
  row.className = 'muted';
  host.appendChild(bar); host.appendChild(btn); host.appendChild(row);
  const before = host.childNodes.length;

  setWidth(host, '[data-bar="x"]', 40);
  check('setWidth 选择器形态', bar.style.width === '40%', bar.style.width);
  setWidth(host, bar, 250);
  check('setWidth 节点形态且越界夹取', bar.style.width === '100%', bar.style.width);
  setWidth(bar, -5);
  check('setWidth 值形态且下限夹取', bar.style.width === '0%', bar.style.width);

  setDisabled(host, '[data-bar="x"]', true);
  setDisabled(host, btn, true);
  check('setDisabled 两种形态都生效', bar.disabled === true && btn.disabled === true);
  setDisabled(btn, false);
  check('setDisabled 值形态', btn.disabled === false);

  toggleClass(host, '[data-bar="x"]', 'active', true);
  toggleClass(host, row, 'muted', false);
  check('toggleClass 选择器形态', bar.classList.contains('active'));
  check('toggleClass 节点形态', !row.classList.contains('muted'));

  check('★ 三条工具都没有碰 host 骨架',
    host.childNodes.length === before, `子节点 ${before} → ${host.childNodes.length}`);
}

// ==================== 6. 面板容器不被写脏（回归护栏） ====================
section('6. 回归护栏：任意调用组合都不得清空 host');
{
  const host = new FakeNode();
  for (let i = 0; i < 5; i++) {
    const s = span('f' + i, '0');
    host.appendChild(s);
  }
  const origWarn = console.warn;
  console.warn = () => {};
  setText(host, '[data-f="f0"]', 1);
  setText(host, '[data-f="f1"]', 2);
  setWidth(host, '[data-f="f2"]', 33);
  toggleClass(host, '[data-f="f3"]', 'lit', true);
  setDisabled(host, '[data-f="f4"]', true);
  setText(host, '一段不该出现的中文', '');
  console.warn = origWarn;

  check('5 个目标节点全部保留', host.children.length === 5, '元素子节点 ' + host.children.length);
  check('各节点保住自己的文本',
    host.children[0].textContent === '1' && host.children[1].textContent === '2',
    host.children.map((c) => c.textContent).join(','));
}

// ==================== 结果 ====================
console.log('\n' + '='.repeat(64));
console.log(failures === 0 ? '全部通过 ✓' : `有 ${failures} 项失败 ✗`);
process.exit(failures === 0 ? 0 : 1);
