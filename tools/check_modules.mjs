/**
 * 模块链接检查。
 * node --check 只验语法，不验 import 的命名导出是否真的存在。
 * 这个脚本把 core / systems / data / assets 全部真实 import 一遍，
 * 用来抓跨模块的导出名拼写错误、循环依赖导致的 undefined 等问题。
 */
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

import { readdirSync } from 'node:fs';

const dirs = ['src/core', 'src/systems', 'src/data', 'src/assets'];
let fail = 0, total = 0;

for (const d of dirs) {
  for (const f of readdirSync(d).filter((x) => x.endsWith('.js')).sort()) {
    const path = `../${d}/${f}`;
    total++;
    try {
      const mod = await import(path);
      const names = Object.keys(mod);
      const undef = names.filter((n) => mod[n] === undefined);
      if (undef.length) {
        console.log(`  [警告] ${d}/${f} 导出了 undefined: ${undef.join(', ')}`);
        fail++;
      } else {
        console.log(`  [OK]   ${d}/${f}  (${names.length} 个导出)`);
      }
    } catch (e) {
      console.log(`  [失败] ${d}/${f}`);
      console.log(`         ${e.message.split('\n')[0]}`);
      fail++;
    }
  }
}

console.log(`\n${total} 个模块，${fail} 个有问题`);
process.exit(fail === 0 ? 0 : 1);
