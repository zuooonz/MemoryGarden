// 录一个镜头（clip）：无头 Chrome 加载游戏，按剧本真实操作，逐帧截图 → 视频，离线渲染声音 → WAV，最后合成 clip.mp4。
// 用法：node tools/video/record.mjs <剧本.mjs> <输出目录> [游戏 html，默认 dist/index.html]
// 剧本：export const meta = { day, seed, audioSec, settings }；export default async (api) => { ... }（api 见下方）
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { NO_PROXY_ARGS } from '../chromeflags.mjs';
import { pathToFileURL } from 'node:url';

const here = path.dirname(new URL(import.meta.url).pathname);
export async function record(scriptFile, outDir, htmlFile = path.resolve(here, '../../dist/index.html'), opt = {}) {
  // 默认 1600×900 视口按 1.2 倍渲染 → 1920×1080 画面，界面文字在视频里更清楚
  const W = opt.w || 1600, H = opt.h || 900, DPR = opt.dpr || 1.2, FPS = opt.fps || 30;
  const mod = await import(pathToFileURL(path.resolve(scriptFile)).href + '?t=' + Date.now());
  const meta = { day: 1, seed: 7, audioSec: 400, ...(mod.meta || {}) };
  fs.mkdirSync(outDir, { recursive: true });
  const log = (...a) => console.log(`[${path.basename(scriptFile, '.mjs')}]`, ...a);

  // 静态服务器：只提供这一个 html
  const server = http.createServer((req, res) => {
    if (req.url.split('?')[0] !== '/index.html') { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    fs.createReadStream(htmlFile).pipe(res);
  }).listen(0, '127.0.0.1');
  await new Promise(r => server.on('listening', r));
  const url = `http://127.0.0.1:${server.address().port}/index.html`;

  const port = 9300 + Math.floor(Math.random() * 600);
  const profile = fs.mkdtempSync('/tmp/mg-rec-');
  const gl = process.env.GPU === '0' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'];
  // 以较低优先级运行（NICE=0 关闭）：录制不和前台程序抢 CPU
  const nice = process.env.NICE === '0' ? [] : ['nice', '-n', process.env.NICE || '10'];
    // 联网策略见 chromeflags.mjs：不使用代理网络（不走环境里的 VPN 代理），直连
  const ch = spawn(nice[0] || 'google-chrome', [...nice.slice(1), ...(nice.length ? ['google-chrome'] : []), '--headless=new', `--remote-debugging-port=${port}`, `--window-size=${W},${H}`, ...gl,
    '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars', '--no-first-run', ...NO_PROXY_ARGS, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', detached: true });
// 浏览器单独成一个进程组：本脚本正常结束、出错、被超时强行结束（SIGTERM／Ctrl-C）时，都把整组浏览器进程一起关掉，不留后台孤儿
const killChrome = () => { try { process.kill(-ch.pid, 'SIGKILL'); } catch { } };
process.once('exit', killChrome);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { killChrome(); process.exit(130); });
process.on('uncaughtException', (e) => { console.error(e); killChrome(); process.exit(1); });
process.on('unhandledRejection', (e) => { console.error(e); killChrome(); process.exit(1); });
  // 总时限（REC_TIMEOUT 秒，默认 1800）：页面卡住时按失败退出、关掉浏览器，不让上层检查无限等
  const guard = setTimeout(() => { console.error(`录制超时（${process.env.REC_TIMEOUT || 1800} 秒），按失败退出`); killChrome(); process.exit(3); }, (+process.env.REC_TIMEOUT || 1800) * 1000);

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let tabs; for (let i = 0; i < 60; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(200); } }
  const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0; const pend = {}; const errors = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; }
    if (d.method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(d.params.exceptionDetails).slice(0, 300));
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push(d.params.args.map(a => a.value ?? a.description).join(' ').slice(0, 300));
  };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  const js = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error('页面脚本出错：' + JSON.stringify(r.result.exceptionDetails).slice(0, 400) + '\n' + expr.slice(0, 200));
    return r.result?.result?.value;
  };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: !!opt.mobile });
  if (opt.mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  // noHover：按“没有悬停”的设备显示（悬停样式都包在 @media (hover:hover) 里）——界面截图比对用，免得上一步点在哪、悬停高亮就时有时无（残局棋盘的圆圈）
  if (opt.noHover) await send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }] });

  // 先打开一次写好设置与存档，再注入虚拟时间脚本重新载入
  await send('Page.navigate', { url }); await sleep(1500);
  const settings = { font: 1, vol: 2, tips: 2, gfx: 3, voice: true, narr: false, ...(meta.settings || {}) };
  const save = opt.save || meta.save || { day: meta.day - 1, best: [], persist: null, snap: [] };
  if (save.day !== meta.day - 1) throw new Error(`存档接不上：这段要从第 ${meta.day} 天开始，存档却在第 ${save.day + 1} 天（上一段没有玩到结算？）`);
  await js(`localStorage.clear(); localStorage.setItem('mg-settings', ${JSON.stringify(JSON.stringify(settings))}); localStorage.setItem('mg-save', ${JSON.stringify(JSON.stringify(save))}); ${meta.opening
    ? '' : "localStorage.setItem('mg-opening-seen', '1');"} ${meta.storage ? Object.entries(meta.storage).map(([k,
    v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join('') : ''} 1`);
  const cfg = { fps: FPS, seed: meta.seed, audioSec: meta.audioSec, sr: meta.sr || 48000 };   // 检查用可降采样率（meta.sr）换更长的声音时长
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('mg-dynres', '0') } catch (e) {}\nwindow.__recCfg=${JSON.stringify(cfg)};\n` + fs.readFileSync(path.join(here, 'shim.js'), 'utf8') });
  await send('Page.navigate', { url });
  for (let i = 0; i < 100; i++) { await sleep(200); if (await js(`!!(window.__rec && window.__mg)`).catch(() => false)) break; }

  // 视频编码：截图（JPEG）直接送进 ffmpeg；默认用显卡编码（NVENC，高码率中间片），NVENC=0 改用 CPU 的 libx264
  const enc = process.env.NVENC === '0' ? ['-c:v', 'libx264', '-preset', 'medium', '-crf', '14'] : ['-c:v', 'h264_nvenc', '-preset', 'p6', '-rc', 'vbr', '-cq', '16', '-b:v', '0'];
  // 第一次截图时才启动 ffmpeg（只探路不录像时不产生空文件）
  let ff = null, ffDone = Promise.resolve();
  const startFF = () => {
    ff = spawn(nice[0] || 'ffmpeg', [...nice.slice(1), ...(nice.length ? ['ffmpeg'] : []), '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
      ...enc, '-pix_fmt', 'yuv420p', path.join(outDir, 'video.mp4')], { stdio: ['pipe', 'inherit', 'inherit'] });
    ffDone = new Promise(r => ff.on('close', r));
  };
  const ranges = []; let capturing = false, nFrames = 0;
  const dt = 1000 / FPS;
  const step = async () => js(`__rec.step(${dt})`);
  const shot = async () => {
    const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 94, optimizeForSpeed: true });
    const buf = Buffer.from(r.result.data, 'base64');
    if (!ff) startFF();
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    nFrames++;
  };
  // 一帧：推进虚拟时间；录制中就截图、把声音区间延长到当前时刻
  const frame = async () => {
    const before = await js('__rec.now');
    await step();
    if (capturing) {
      await shot();
      const t = before + dt;
      if (ranges.length && ranges[ranges.length - 1][1] === before) ranges[ranges.length - 1][1] = t; else ranges.push([before, t]);
    }
  };
  let cx = W * 0.62, cy = H * 0.6;
  const ease = k => k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;

  const api = {
    W, H, FPS, js, log, cdp: send, outDir,   // cdp：直接发 DevTools 命令（测试工具用，比如模拟手指点按）；outDir：剧本自己要另存文件时用（scenecheck 存性能取样）
    get frames() { return nFrames; },
    // 录制开关：rec(false) 之后的时间不进视频（快进）
    rec(on = true) { capturing = on; },
    get recording() { return capturing; },
    async wait(sec) { const n = Math.round(sec * FPS); for (let i = 0; i < n; i++) await frame(); },
    // 不录制地快进（可配合游戏倍速）
    async skip(sec) { const was = capturing; capturing = false; const n = Math.round(sec * FPS); for (let i = 0; i < n; i++) await step(); capturing = was; },
    // 一直推进直到页面里的条件成立（每帧检查），max 秒后放弃
    // quiet：分段快进时一段没等到是常事，不打“等待超时”
    async until(cond, max = 60, { rec = true, quiet = false } = {}) {
      const was = capturing; capturing = capturing && rec;
      for (let i = 0; i < max * FPS; i++) { if (await js(`!!(${cond})`)) { capturing = was; return true; } rec ? await frame() : await step(); }
      capturing = was; if (!quiet) log('等待超时：', cond); return false;
    },
    // 元素中心的屏幕坐标（选择器或 JS 表达式返回元素）
    async where(sel, { dx = 0, dy = 0 } = {}) {
      const r = await js(`(()=>{const e=${sel.startsWith('(') || sel.startsWith('document') ? sel : `document.querySelector(${JSON.stringify(sel)})`}; if(!e) return null; const b=e.getBoundingClientRect(); return b.width||b.height ? [b.left+b.width/2, b.top+b.height/2] : null})()`);
      return r && [r[0] + dx, r[1] + dy];
    },
    async moveTo(x, y, sec = 0.45) {
      const n = Math.max(1, Math.round(sec * FPS)), x0 = cx, y0 = cy;
      for (let i = 1; i <= n; i++) {
        const k = ease(i / n); cx = x0 + (x - x0) * k; cy = y0 + (y - y0) * k - Math.sin(k * Math.PI) * Math.min(40, Math.hypot(x - x0, y - y0) * 0.08);
        await js(`__rec.cursor(${cx},${cy})`);
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx, y: cy });
        await frame();
      }
    },
    // 移过去点一下（真实鼠标事件）；target 可以是选择器、坐标 [x,y]
    async click(target, { move = 0.5, after = 0.35, dx = 0, dy = 0 } = {}) {
      const p = Array.isArray(target) ? target : await api.where(target, { dx, dy });
      if (!p) { log('找不到：', target); return false; }
      await api.moveTo(p[0], p[1], move);
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p[0], y: p[1], button: 'left', clickCount: 1 });
      await js(`__rec.ripple(${p[0]},${p[1]})`);
      await frame();
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p[0], y: p[1], button: 'left', clickCount: 1 });
      await api.wait(after);
      return true;
    },
    // 按住拖动：经过的点依次滑过
    async drag(points, { sec = 1, after = 0.3 } = {}) {
      const pts = [];
      for (const t of points) pts.push(Array.isArray(t) ? t : await api.where(t));
      if (pts.some(p => !p)) { log('拖动目标缺失', points); return false; }
      await api.moveTo(pts[0][0], pts[0][1]);
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pts[0][0], y: pts[0][1], button: 'left', clickCount: 1 });
      await js(`__rec.ripple(${pts[0][0]},${pts[0][1]})`);
      const per = Math.max(2, Math.round(sec * FPS / Math.max(1, pts.length - 1)));
      for (let s = 1; s < pts.length; s++) {
        const [x0, y0] = pts[s - 1], [x1, y1] = pts[s];
        for (let i = 1; i <= per; i++) {
          const k = i / per; cx = x0 + (x1 - x0) * k; cy = y0 + (y1 - y0) * k;
          await js(`__rec.cursor(${cx},${cy})`);
          await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx, y: cy, button: 'left', buttons: 1 });
          await frame();
        }
      }
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx, y: cy, button: 'left', clickCount: 1 });
      await api.wait(after);
      return true;
    },
    async key(key, code = key) {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0, text: key.length === 1 ? key : undefined });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code });
    },
    cursor: async (show) => js(`__rec.hideCursor(${!show})`),
    // 章节字幕与整屏卡片（叠在游戏画面上，一起录进视频）
    caption: async (text, sub = '') => js(`__rec.caption(${JSON.stringify(text || '')}, ${JSON.stringify(sub)})`),
    card: async (html, dim) => js(`__rec.card(${JSON.stringify(html || '')}${dim != null ? ', ' + dim : ''})`),
    // 存一张静帧 PNG（封面、宣传图用）
    async still(name) { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(outDir, name + '.png'), Buffer.from(r.result.data, 'base64')); },
  };

  const t0 = Date.now();
  try {
    await api.cursor(false);
    await mod.default(api);
  } catch (e) { e.errors = errors; killChrome(); server.close(); throw e; } finally {   // 出错时带上页面报错，检查工具好说清原因
    if (ff) { ff.stdin.end(); await ffDone; }
  }
  // 存档留给下一段接着用（一周的结局要用到前几天的真实结果）
  fs.writeFileSync(path.join(outDir, 'save.json'), await js(`localStorage.getItem('mg-save') || 'null'`));
  // 声音
  const n = ranges.length ? await js(`__rec.finishAudio(${JSON.stringify(ranges)})`) : 0;
  const pcm = [];
  for (let i = 0; i < n; i += 4 << 20) pcm.push(Buffer.from(await js(`__rec.audioChunk(${i}, ${4 << 20})`), 'base64'));
  const data = Buffer.concat(pcm);
  const hdr = Buffer.alloc(44);
  hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + data.length, 4); hdr.write('WAVEfmt ', 8); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(2, 22);
  hdr.writeUInt32LE(48000, 24); hdr.writeUInt32LE(48000 * 4, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34); hdr.write('data', 36); hdr.writeUInt32LE(data.length, 40);
  fs.writeFileSync(path.join(outDir, 'audio.wav'), Buffer.concat([hdr, data]));
  killChrome(); server.close();
  try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3 }); } catch { }
  // 合成：视频＋声音（声音按视频长度对齐）；一帧都没录（只是探路）就不合成
  if (nFrames) await new Promise((ok, no) => spawn('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(outDir, 'video.mp4'), '-i', path.join(outDir, 'audio.wav'), '-c:v', 'copy', '-c:a', 'aac',
    '-b:a', '192k', '-af', 'apad', '-shortest', path.join(outDir, 'clip.mp4')], { stdio: 'inherit' }).on('close', c => c ? no(new Error('ffmpeg 合成失败')) : ok()));
  // 无声的中间画面合成进 clip.mp4 后就没用了，删掉省空间（每段只留有声的 clip.mp4 与单独的 audio.wav）
  if (nFrames) fs.rmSync(path.join(outDir, 'video.mp4'), { force: true });
  const info = { frames: nFrames, sec: +(nFrames / FPS).toFixed(2), realSec: Math.round((Date.now() - t0) / 1000), errors };
  fs.writeFileSync(path.join(outDir, 'info.json'), JSON.stringify(info, null, 1));
  log(`完成 ${info.sec}s（${nFrames} 帧，用时 ${info.realSec}s）${errors.length ? '，页面报错 ' + errors.length + ' 条' : ''}`);
  clearTimeout(guard);
  return info;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const [script, out, html, saveFile] = process.argv.slice(2);
  await record(script, out, html && path.resolve(html), saveFile ? { save: JSON.parse(fs.readFileSync(saveFile, 'utf8')) } : {});
  process.exit(0);
}
