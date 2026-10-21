// 未声明名字检查：每个模块里“用到了、但没声明也没 import、也不是浏览器内置”的名字。
// 打包工具会把这种名字当成全局变量，不报错，运行到那一行才出错（挪代码时漏了 import 就是这样）。
// 用法：node tools/undefcheck.mjs（默认查 src/）；有问题以状态 1 退出
import fs from 'node:fs'; import * as acorn from 'acorn'; import * as walk from 'acorn-walk';
import path from 'node:path';
const dir = process.argv[2] || path.resolve(path.dirname(new URL(import.meta.url).pathname), '../src');
let bad = 0;
const G = new Set(Object.getOwnPropertyNames(globalThis).concat(['window','document','navigator','localStorage','performance','requestAnimationFrame','cancelAnimationFrame','getComputedStyle',
  'innerWidth','innerHeight','addEventListener','removeEventListener','dispatchEvent','location','Image','HTMLElement','Element','Node','PointerEvent','MouseEvent','KeyboardEvent','Event',
  'CustomEvent','OffscreenCanvas','AudioContext','OfflineAudioContext','webkitAudioContext','devicePixelRatio','matchMedia','ResizeObserver','DOMParser','screen','alert','atob','btoa','fetch',
  'setTimeout','clearTimeout','setInterval','clearInterval','queueMicrotask','structuredClone','console','arguments','undefined','globalThis','self','history','WebGL2RenderingContext','visualViewport','scrollTo','CSS','crypto','AbortController','Blob','URL','WebSocket']));
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
  const src = fs.readFileSync(dir + '/' + f, 'utf8');
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  // 作用域：每个函数（及模块顶层）自己声明了哪些名字（参数、var/let/const、函数与类名、catch 参数；不含更里层函数里的）
  const scopes = new Map();
  const declIn = (fnNode, set) => {
    const addPat = (p) => walk.fullAncestor(p, (x, _t, a2) => { const pr = a2.at(-2);
      if (x.type === 'Identifier' && !(pr?.type === 'Property' && pr.key === x && !pr.shorthand) && !(pr?.type === 'AssignmentPattern' && pr.right === x) && !(pr?.type === 'MemberExpression' && pr.property === x)) set.add(x.name); });
    if (fnNode.params) fnNode.params.forEach(addPat);
    const visit = (n, top) => {
      if (!n || typeof n.type !== 'string') return;
      if (!top && /Function/.test(n.type)) { if (n.type === 'FunctionDeclaration' && n.id) set.add(n.id.name); return; }   // 里层函数：只记它的名字
      if (n.type === 'VariableDeclarator') addPat(n.id);
      if (n.type === 'ClassDeclaration' && n.id) set.add(n.id.name);
      if (n.type === 'CatchClause' && n.param) addPat(n.param);
      if (n.type === 'ImportSpecifier' || n.type === 'ImportDefaultSpecifier' || n.type === 'ImportNamespaceSpecifier') set.add(n.local.name);
      for (const k of Object.keys(n)) { const v = n[k]; if (k === 'loc' || k === 'start' || k === 'end') continue; if (Array.isArray(v)) v.forEach(c => visit(c, false)); else if (v && typeof v.type === 'string') visit(v, false); }
    };
    const body = fnNode.type === 'Program' ? fnNode.body : (fnNode.body || fnNode);
    if (Array.isArray(body)) body.forEach(c => visit(c, false)); else visit(body, true);   // 模块顶层的 body 是数组
    if (fnNode.type === 'FunctionExpression' && fnNode.id) set.add(fnNode.id.name);   // 具名函数表达式可在自身内部引用
    return set;
  };
  scopes.set(ast, declIn(ast, new Set()));
  walk.full(ast, (n) => { if (/Function/.test(n.type)) scopes.set(n, declIn(n, new Set())); });
  const miss = new Map();
  walk.fullAncestor(ast, (n, _s, anc) => {
    if (n.type !== 'Identifier') return; const p = anc.at(-2); if (!p) return;
    if (p.type === 'MemberExpression' && p.property === n && !p.computed) return;
    if ((p.type === 'Property' || p.type === 'MethodDefinition' || p.type === 'PropertyDefinition') && p.key === n && !p.computed && !p.shorthand) return;
    if (/Import|Export/.test(p.type) || p.type === 'LabeledStatement' || p.type === 'BreakStatement' || p.type === 'ContinueStatement') return;
    if (G.has(n.name)) return;
    for (let i = anc.length - 1; i >= 0; i--) { const sc = scopes.get(anc[i]); if (sc && sc.has(n.name)) return; }   // 从里往外找声明
    miss.set(n.name, (miss.get(n.name) || []).concat(n.loc.start.line));
  });
  if (miss.size) { bad++; console.log(f + '：', [...miss].map(([k, v]) => `${k}@${v.slice(0, 3).join(',')}`).join('  ')); }
}
console.log(bad ? `${bad} 个模块有未声明的名字` : '未声明名字检查通过');
process.exit(bad ? 1 : 0);
