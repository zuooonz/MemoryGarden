// 模块装配检查：main.js 里 initXxx({ … }) 按值注入的依赖，必须在调用前就有值、之后也不会被换掉。
// 打包会把顶层 let/const 改成 var，取早了不会报错，只会悄悄拿到 undefined——所以要静态查。
// 另查：循环依赖与分层（Docs/架构.md）。
// 用法：node tools/modcheck.mjs（无问题时输出“模块装配正常”，否则逐条列出并以状态 1 退出）
import fs from 'node:fs';
import path from 'node:path';
const src = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../src');
const main = fs.readFileSync(path.join(src, 'main.js'), 'utf8').split('\n');
const decl = {}, reassigned = new Set(), imps = {}, late = {}, initAt = {};
main.forEach((l, i) => {
  let m = l.match(/^(const|let|function|class)\s+(.*)/);
  if (m) {
    if (m[1] === 'function' || m[1] === 'class') decl[m[2].match(/[\w$]+/)[0]] ??= ['fn', i + 1];
    else for (const x of m[2].matchAll(/(?:^|,\s*)([\w$]+)\s*=/g)) decl[x[1]] ??= [m[1], i + 1];
  }
  m = l.match(/^import \{(.*)\} from '\.\/([\w-]+)\.js';/);
  if (m) for (const n of m[1].split(',')) imps[n.trim()] = m[2];
  m = l.match(/^init(\w+)\(/);
  if (m) initAt[m[1].toLowerCase()] = i + 1;
});
// main.js 里被重新赋值的 let（名字 = …，不含声明本身与属性）
const body = main.join('\n');
for (const [n, [k]] of Object.entries(decl)) if (k === 'let' && new RegExp(`(^|[^\\w.$])${n.replace('$', '\\$')}\\s*[-+*/]?=(?!=)`, 'gm').test(body.replace(/^let .*$/gm, ''))) reassigned.add(n);
for (const f of fs.readdirSync(src).filter(f => f.endsWith('.js'))) {
  const s = fs.readFileSync(path.join(src, f), 'utf8');
  for (const m of s.matchAll(/^export let (\w+);/gm)) late[m[1]] = f.replace('.js', '');
}
const bad = [];
main.forEach((l, i) => {
  const m = l.match(/^(init\w+)\(\{(.*)\}\);/); if (!m) return;
  for (const n of m[2].split(',').map(s => s.trim())) {
    if (decl[n]) {
      const [k, li] = decl[n];
      if (k !== 'fn' && li > i + 1) bad.push(`${m[1]}（第 ${i + 1} 行）：${n} 在第 ${li} 行才声明`);
      if (reassigned.has(n)) bad.push(`${m[1]}（第 ${i + 1} 行）：${n} 是之后会被重新赋值的 let，按值注入会过时——放进 run／ui 这类共享对象`);
    } else if (imps[n]) {
      if (late[n] && (initAt[imps[n]] || 0) > i + 1) bad.push(`${m[1]}（第 ${i + 1} 行）：${n} 来自 ${imps[n]}.js，要到第 ${initAt[imps[n]]} 行初始化后才有值——改成在模块里直接 import`);
    } else bad.push(`${m[1]}（第 ${i + 1} 行）：找不到 ${n} 的声明`);
  }
});
// 分层与循环依赖（见 Docs/架构.md 第 1 节）：只许上层 import 下层；同层可以，但不许成环
const LAYER = { data: 0, narr: 0, lines: 0, util: 0, icons: 0, pictos: 0, store: 0, audio: 0, sim: 1, tasks: 1, walk: 1, moments: 1, core: 2, camera: 2, town: 3, 'town-parts': 3, 'town-home': 3, person: 3, space: 3, mover: 3, presence: 3, ambient: 3, atmos: 3, world: 3,
  postfx: 3, routes: 4, home: 4, mapops: 4, achieve: 4, actors: 4, ui: 5, overlays: 5, hud: 5, stage: 5, 'settings-ui': 5, games: 5, 'game-kit': 5, 'games-market': 5, 'games-post': 5,
    'games-clock': 5, 'games-kitchen': 5, 'games-scam': 5, 'games-talk': 5, 'games-chess': 5, pages: 5, flow: 6, opening: 6, devtools: 7, bridge: 7, main: 7 };
const deps = {};
for (const f of fs.readdirSync(src).filter(f => f.endsWith('.js'))) {
  const mod = f.replace('.js', ''), s = fs.readFileSync(path.join(src, f), 'utf8');
  if (!(mod in LAYER)) bad.push(`${mod}.js 不在分层表里：先在 Docs/架构.md 和本工具的 LAYER 里给它定层`);
  deps[mod] = [...new Set([...s.matchAll(/from '\.\/([\w-]+)\.js'/g)].map(m => m[1]))];
  for (const d of deps[mod]) if (LAYER[d] > LAYER[mod]) bad.push(`分层：${mod}（第 ${LAYER[mod]} 层）import 了上层的 ${d}（第 ${LAYER[d]} 层）`);
}
// 循环：强连通分量
let idx = 0; const I = {}, L = {}, st = [], on = new Set();
const dfs = (v) => {
  I[v] = L[v] = idx++; st.push(v); on.add(v);
  for (const w of deps[v] || []) { if (!(w in I)) { dfs(w); L[v] = Math.min(L[v], L[w]); } else if (on.has(w)) L[v] = Math.min(L[v], I[w]); }
  if (L[v] === I[v]) { const c = []; let w; do { w = st.pop(); on.delete(w); c.push(w); } while (w !== v); if (c.length > 1) bad.push(`循环依赖：${c.sort().join('、')}`); }
};
for (const v of Object.keys(deps)) if (!(v in I)) dfs(v);
// 没用的 import（09-27 审查：拆 main.js 后留下 160 多个）：import 了却一次都没用上的名字。前面是 . 算属性访问、... 展开不算
for (const f of fs.readdirSync(src).filter(f => f.endsWith('.js'))) {
  const s = fs.readFileSync(path.join(src, f), 'utf8');
  for (const m of s.matchAll(/^import \{([^}]*)\} from '[^']+';/gm)) for (const raw of m[1].split(',')) {
    const id = raw.trim().split(/\s+as\s+/).pop(); if (!id) continue;
    let uses = 0; for (const u of s.matchAll(new RegExp('(?<![\\w$])' + id.replace(/\$/g, '\\$') + '(?![\\w$])', 'g'))) { const i = u.index; if (s[i - 1] === '.' && s.slice(i - 3, i) !== '...') continue; uses++; }
    if (uses <= 1) bad.push(`${f}：import 了 ${id} 却没用上`);
  }
  for (const m of s.matchAll(/^import \* as (\w+) from '[^']+';/gm)) if (!s.includes(m[1] + '.')) bad.push(`${f}：import * as ${m[1]} 却没用上`);   // 整包导入（09-27：achieve.js 的 THREE 漏检）
}
// 没人用的导出（09-27 复审：清 import 后露出 2 个旧代码）：别的源码、测试工具里都没提到，本文件里也没用
{ const toolsDir = path.join(src, '../tools'), extra = [...fs.readdirSync(toolsDir).filter(f => f.endsWith('.mjs')).map(f => path.join(toolsDir, f)), ...['video', 'uidiff'].flatMap(d => fs.readdirSync(path.join(toolsDir, d)).filter(f => f.endsWith('.mjs')).map(f => path.join(toolsDir, d, f)))];
  const texts = Object.fromEntries([...fs.readdirSync(src).filter(f => f.endsWith('.js')).map(f => [f, fs.readFileSync(path.join(src, f), 'utf8')]), ...extra.map(f => [f, fs.readFileSync(f, 'utf8')])]);
  for (const [f, s] of Object.entries(texts)) { if (!f.endsWith('.js') || f.includes('/')) continue;
    for (const m of s.matchAll(/export (?:async )?(?:function|const|let|class) ([A-Za-z_]\w*)/g)) {
      const re = new RegExp('\\b' + m[1] + '\\b', 'g'); let n = (s.match(re) || []).length - 1;
      for (const [g, t] of Object.entries(texts)) if (g !== f) n += (t.match(re) || []).length;
      if (!n) bad.push(`${f}：导出的 ${m[1]} 没有任何地方用`);
    } } }
// 文件名一律英文（用户 09-27：项目里除说明文档外统一用英文）：源码、样式、工具、截图基准
{ const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? [path.join(d, e.name), ...walk(path.join(d, e.name))] : [path.join(d, e.name)]);
  for (const d of ['src', 'tools', 'snapshots']) { const root = path.join(src, '..', d); if (fs.existsSync(root)) for (const f of walk(root)) if (/[^\x00-\x7f]/.test(path.relative(root, f))) bad.push(`文件名不是英文：${d}/${path.relative(root, f)}`); } }
if (bad.length) { console.log(bad.join('\n')); process.exit(1); }
console.log('模块装配正常（无循环依赖、符合分层）');
