// 构建：esbuild 打包为单个 HTML（dist/index.html），无外部资源依赖。
import * as esbuild from 'esbuild';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, watchFile, existsSync, readdirSync } from 'node:fs';

// 样式：src/styles/*.css 按文件名顺序原样拼接，放进 index.html 的 <!--STYLES--> 处（顺序即层叠顺序，后面的覆盖前面的）
const styles = () => readdirSync('src/styles').filter(f => f.endsWith('.css')).sort().map(f => readFileSync('src/styles/' + f, 'utf8')).join('').replace(/\n$/, '');
// 标签页图标：public/icons/icon.svg 内嵌成 data URI（单文件也有图标；PNG、ico、manifest 由 deploy.sh 另传）
const icon = () => 'data:image/svg+xml,' + encodeURIComponent(readFileSync('public/icons/icon.svg', 'utf8'));
const page = () => readFileSync('src/index.html', 'utf8').replace('<!--STYLES-->', () => styles()).replace('<!--ICON-->', icon);

const serve = process.argv.includes('--serve');
const opts = {
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify: !serve,
  write: false,
  legalComments: 'none',
  banner: { js: '/*! 爷爷的一周 · code MIT (see LICENSE) | three.js r186, MIT License, Copyright 2010-2026 three.js authors */' },   // 10-21 公开：依赖的版权声明随产物保留
};

// 配音：src/voice/*.ogg（AI 生成，见 Local/tts）打包成 base64，放进 window.__VOICE；没有就不带
function voiceScript() {
  if (!existsSync('src/voice')) return '';
  const map = {};
  for (const f of readdirSync('src/voice')) if (f.endsWith('.ogg')) map[f.replace('.ogg', '')] = readFileSync('src/voice/' + f).toString('base64');
  if (existsSync('src/voice/keys.json')) map.__keys = JSON.parse(readFileSync('src/voice/keys.json', 'utf8'));
  return `<script>window.__VOICE=${JSON.stringify(map)};dispatchEvent(new Event('mg-voice'))</script>`;   // 放在游戏代码之后（10-14 启动测速）：配音占整个页面的七成，浏览器边下边执行，游戏代码先到先跑、标题先出来，配音随后到（mg-voice：设置里补上“有配音”）
}
// 版本信息：构建时间（北京时间）＋代码版本号（git 提交号；构建时有没提交的改动加“未提交”），设置界面最下面显示——用来核对线上是不是最新版（10-07 用户）
function buildInfo() {
  let commit = '', dirty = false;
  try { commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(); dirty = !!execSync('git status --porcelain -- src', { encoding: 'utf8' }).trim(); } catch { }
  const time = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).slice(0, 16);
  return `<script>window.__BUILD=${JSON.stringify({ time, commit, dirty })}</script>`;
}
function inline(js) {
  const html = page();
  return html.replace('<!--APP-->', () => buildInfo() + `<script>${js.replace(/<\/script/g, '<\\/script')}</script>` + voiceScript());
}

if (serve) {
  mkdirSync('dev', { recursive: true });
  const ctx = await esbuild.context({
    ...opts,
    write: true,
    outfile: 'dev/app.js',
    minify: false,
    sourcemap: true,
  });
  const writeHtml = () => writeFileSync('dev/index.html', page().replace('<!--APP-->', '<script src="app.js"></script>'));
  writeHtml();
  watchFile('src/index.html', { interval: 300 }, writeHtml);
  for (const f of readdirSync('src/styles')) watchFile('src/styles/' + f, { interval: 300 }, writeHtml);   // 改样式也自动更新
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: 'dev', port: 5173, host: '127.0.0.1' });
  console.log(`dev server http://127.0.0.1:${port}`);
} else {
  const r = await esbuild.build(opts);
  mkdirSync('dist', { recursive: true });
  const out = inline(r.outputFiles[0].text);
  writeFileSync('dist/index.html', out);
  console.log(`dist/index.html ${(out.length / 1024).toFixed(0)} KB`);
}
