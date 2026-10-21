// 测试浏览器代理检查：tools/ 里凡是启动 Chrome 的地方，都必须带上 chromeflags.mjs 的 NO_PROXY_ARGS（不使用代理网络，直连）。
// 原因（10-07）：环境里设了 HTTPS_PROXY（Clash），Chrome 会照单使用；新建的临时配置目录里，Chrome 运行约 1.5 分钟后会开始下载
// 75—158MB 的模型、组件，曾把 VPN 流量累计跑到几十 GB。测试页面全在本机 127.0.0.1，用不上代理。
// 确需走代理或另有写法的地方：在启动语句上一行写 `// browsercheck: allow-proxy 原因`。
// 用法：node tools/browsercheck.mjs（无问题输出“测试浏览器代理检查正常”，否则逐条列出并以状态 1 退出）
//   自带“故意写错能报出”的自测，每次运行先过自测再扫描。
import fs from 'node:fs';
import path from 'node:path';

const NEED = 'NO_PROXY_ARGS';
const LAUNCH = /['"`](google-chrome|chromium|chromium-browser)['"`]/;

// 返回一个文件里“启动了 Chrome 却没带 NO_PROXY_ARGS”的行号
export function scan(text) {
  const lines = text.split('\n'), bad = [];
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith('//') || !LAUNCH.test(lines[i])) continue;
    if (/browsercheck:\s*allow-proxy/.test(lines[i - 1] || '')) continue;
    let stmt = lines[i];                                   // 一条语句：从这行到以分号结尾的行（最多 6 行）
    for (let j = i; j < Math.min(i + 6, lines.length) && !/;\s*(\/\/.*)?$/.test(lines[j].trimEnd()); j++) stmt += '\n' + lines[j + 1];
    if (!stmt.includes(NEED)) bad.push(i + 1);
  }
  return bad;
}

// 自测：故意写错的必须被报出，写对的、有豁免的不能误报
const BAD = "const p = spawn('google-chrome', ['--headless=new', '--no-first-run'], {});";
const GOOD = "const p = spawn('google-chrome', ['--headless=new', ...NO_PROXY_ARGS], {});";
const GOOD_MULTI = "const r = spawnSync('google-chrome', ['--headless=new',\n  ...NO_PROXY_ARGS, 'x'], {});";
const ALLOWED = "// browsercheck: allow-proxy 需要走代理\nspawn('google-chrome', ['--headless=new'], {});";
if (scan(BAD).length !== 1 || scan(GOOD).length || scan(GOOD_MULTI).length || scan(ALLOWED).length) {
  console.log('✗ 浏览器检查自测没通过：规则本身坏了'); process.exit(1);
}

const tools = path.dirname(new URL(import.meta.url).pathname);
let n = 0;
// NO_PROXY_ARGS 本身不能被悄悄改弱，也不能被改成“指定一个代理”
const flags = fs.readFileSync(path.join(tools, 'chromeflags.mjs'), 'utf8').split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
if (!flags.includes('--no-proxy-server')) { console.log('✗ tools/chromeflags.mjs 的 NO_PROXY_ARGS 缺了 --no-proxy-server'); n++; }
if (/--proxy-server/.test(flags)) { console.log('✗ tools/chromeflags.mjs 的 NO_PROXY_ARGS 里出现了 --proxy-server（应为不使用代理）'); n++; }
const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); } else if (/\.(mjs|js|sh)$/.test(e.name) && p !== new URL(import.meta.url).pathname) files.push(p); } })(tools);
for (const f of files) for (const line of scan(fs.readFileSync(f, 'utf8'))) { console.log(`✗ ${path.relative(path.dirname(tools), f)}:${line} 启动 Chrome 没带 ${NEED}（会走环境里的 VPN 代理，见 chromeflags.mjs 开头）`); n++; }
console.log(n ? `共 ${n} 处` : '测试浏览器代理检查正常');
process.exit(n ? 1 : 0);
