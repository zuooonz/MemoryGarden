// 无头 Chrome 测试／截图：加载 dist/index.html，按步骤执行脚本、截图。
// 用法：node tools/shot.mjs <宽> <高> <步骤.json>
// 步骤：[{ "js": "页面里执行的 async 代码，可 return 值", "wait": 毫秒, "shot": "输出.png" }, ...]
// 本工具自带静态服务器，不依赖开发服务器；需要本机装有 google-chrome。
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { NO_PROXY_ARGS } from './chromeflags.mjs';

const [w = 1280, h = 800, stepsFile] = process.argv.slice(2);
const dist = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../dist');
const server = http.createServer((req, res) => {
  const f = path.join(dist, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
  if (!f.startsWith(dist) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(0, '127.0.0.1');
await new Promise(r => server.on('listening', r));
const url = `http://127.0.0.1:${server.address().port}/index.html`;

const port = 9300 + Math.floor(Math.random() * 600);
const profile = fs.mkdtempSync('/tmp/mg-chrome-');
// 默认用显卡渲染（GPU=0 时退回软件渲染，全靠 CPU，很慢、很吵）
const gl = process.env.GPU === '0' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : (process.env.GPU_FLAGS || '--ignore-gpu-blocklist --use-angle=vulkan --enable-features=Vulkan').split(' ');
// 联网策略见 chromeflags.mjs：不使用代理网络（不走环境里的 VPN 代理），直连
const ch = spawn('google-chrome', ['--headless=new', `--remote-debugging-port=${port}`, `--window-size=${w},${h}`, ...gl, '--no-first-run', ...NO_PROXY_ARGS, '--autoplay-policy=no-user-gesture-required', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', detached: true });
// 浏览器单独成一个进程组：本脚本正常结束、出错、被超时强行结束（SIGTERM／Ctrl-C）时，都把整组浏览器进程一起关掉，不留后台孤儿
const killChrome = () => { try { process.kill(-ch.pid, 'SIGKILL'); } catch { } };
process.on('exit', killChrome);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { killChrome(); process.exit(130); });
process.on('uncaughtException', (e) => { console.error(e); killChrome(); process.exit(1); });
process.on('unhandledRejection', (e) => { console.error(e); killChrome(); process.exit(1); });
// 总时限（SHOT_TIMEOUT 秒，默认 300）：页面卡住、浏览器失去响应时按失败退出，不让上层检查无限等
setTimeout(() => { console.error(`截图超时（${process.env.SHOT_TIMEOUT || 300} 秒），按失败退出`); killChrome(); process.exit(3); }, (+process.env.SHOT_TIMEOUT || 300) * 1000);

const sleep = ms => new Promise(r => setTimeout(r, ms));
let tabs; for (let i = 0; i < 60; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(200); } }
const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pend = {};
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; }
  if (d.method === 'Runtime.exceptionThrown') console.log('EXC', JSON.stringify(d.params.exceptionDetails).slice(0, 400));
};
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable');
// 无头窗口最窄只有 500 像素：手机尺寸（宽 < 760 或高 < 500）用设备模拟，得到真实的视口大小
if (+w < 760 || +h < 500) await send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: 1, mobile: true });
// 模拟低配机器（10-13 查演示用 Mac 卡顿）：CPU_THROTTLE=4 让 CPU 慢 4 倍；DPR=2 模拟视网膜屏
if (process.env.CPU_THROTTLE) await send('Emulation.setCPUThrottlingRate', { rate: +process.env.CPU_THROTTLE });
if (process.env.DPR) await send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: +process.env.DPR, mobile: false });
// 测试默认跳过开场（首次点「开始」会先播约 30 秒开场）；要测开场本身：OPENING=1
await send('Page.enable');
if (!process.env.OPENING) await send('Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.setItem('mg-opening-seen', '1') } catch (e) {}" });
// 检查要每次画面一样大：关掉动态分辨率（机器忙时帧率低会自动降像素，截图尺寸就变了）；DYNRES=1 时保留（测它本身）
if (!process.env.DYNRES) await send('Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.setItem('mg-dynres', '0') } catch (e) {}" });
await send('Page.navigate', { url });
await sleep(2500);
const steps = JSON.parse(fs.readFileSync(stepsFile, 'utf8'));
for (const s of steps) {
  if (s.js) {
    const r = await send('Runtime.evaluate', { expression: `(async()=>{${s.js}})()`, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) console.log('ERR', JSON.stringify(r.result.exceptionDetails).slice(0, 400));
    else if (r.result?.result?.value !== undefined) console.log('>', JSON.stringify(r.result.result.value));
  }
  if (s.wait) await sleep(s.wait);
  // clip: [x, y, 宽, 高, 放大倍数]，只截一块并放大
  if (s.shot) { const r = await send('Page.captureScreenshot', s.clip ? { format: 'png', clip: { x: s.clip[0], y: s.clip[1], width: s.clip[2], height: s.clip[3], scale: s.clip[4] || 2 } } : {
    format: 'png' }); fs.writeFileSync(s.shot, Buffer.from(r.result.data, 'base64')); console.log('shot', s.shot); }
}
killChrome(); server.close();
try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3 }); } catch { }
process.exit(0);
