// 稳定性测试的浏览器外壳（10-14）：按真实时间运行（不是录视频的虚拟时间），加载一个游戏 html，可模拟手机（触屏、3 倍屏）、CPU 降速、限速网络（gzip 传输，和线上一样）。
// api 与 tools/video/record.mjs 同形（wait、until、click、drag、js……），所以 tools/video/play.mjs 的“自动玩家”可以直接拿来连玩；另加：
//   帧间隔 ft（rAF 时间戳之差）、每帧主线程工作量 wk（rAF 开始到这一轮任务结束）、长帧与像素倍数变化的时间线 ev、内存（CDP 指标 + three 的 renderer.info）、
//   两指／右键旋转 rotate。three 的 renderer、scene 经 __THREE_DEVTOOLS__ 钩子拿到，游戏代码不用为测试开口子（基线版本也能测）。
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { NO_PROXY_ARGS } from '../chromeflags.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
export async function launch({ html, w = 1440, h = 900, dpr = 2, mobile = false, cpu = 1, settings = null, save = null, dynres = !process.env.NODYN, net = null }) {
  const gz = zlib.gzipSync(fs.readFileSync(html));
  const server = http.createServer((req, res) => {
    if (req.url.split('?')[0] !== '/index.html') { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-encoding': 'gzip', 'cache-control': 'no-store' }); res.end(gz);
  }).listen(0, '127.0.0.1');
  await new Promise(r => server.on('listening', r));
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  const port = 9300 + Math.floor(Math.random() * 600);
  const profile = fs.mkdtempSync('/tmp/mg-rt-');
  // 联网策略见 chromeflags.mjs：不使用代理网络，直连；显卡渲染（vulkan）
  const ch = spawn('google-chrome', ['--headless=new', `--remote-debugging-port=${port}`, `--window-size=${Math.max(w, 800)},${Math.max(h, 600)}`, '--ignore-gpu-blocklist', '--use-angle=vulkan',
    '--enable-features=Vulkan', '--enable-precise-memory-info', '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars', '--no-first-run', ...NO_PROXY_ARGS, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', detached: true });
  const kill = () => { try { process.kill(-ch.pid, 'SIGKILL'); } catch { } };
  process.once('exit', kill);
  let tabs; for (let i = 0; i < 60; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(200); } }
  const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0; const pend = {}; const errors = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; }
    if (d.method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(d.params.exceptionDetails).slice(0, 300));
  };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  const js = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error('页面脚本出错：' + JSON.stringify(r.result.exceptionDetails).slice(0, 400) + '\n' + expr.slice(0, 200));
    return r.result?.result?.value;
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Performance.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile });
  if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  if (cpu > 1) await send('Emulation.setCPUThrottlingRate', { rate: cpu });
  if (net) { await send('Network.enable'); await send('Network.emulateNetworkConditions', { offline: false, latency: net.lat, downloadThroughput: net.kbps * 1024 / 8, uploadThroughput: 1e6 }); }
  // 先开一次写设置／存档
  await send('Page.navigate', { url }); await sleep(1500);
  await js(`localStorage.clear(); localStorage.setItem('mg-opening-seen','1'); ${dynres ? '' : "localStorage.setItem('mg-dynres','0');"} ${settings
    ? `localStorage.setItem('mg-settings', ${JSON.stringify(JSON.stringify(settings))});` : ''} ${save ? `localStorage.setItem('mg-save', ${JSON.stringify(JSON.stringify(save))});` : ''} 1`);
    
  // 帧计时 + 拿到 three 的 renderer
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__THREE_DEVTOOLS__ = new EventTarget(); window.__rt = { ft: [], wk: [], ev: [], marks: {}, renderer: null, pr: 0 };
    { const mc = new MessageChannel(); let s0 = 0; mc.port1.onmessage = () => __rt.wk.push(performance.now() - s0); __rt.tick = () => { s0 = performance.now(); mc.port2.postMessage(0); }; }
    __THREE_DEVTOOLS__.addEventListener('observe', (e) => { if (e.detail && e.detail.isWebGLRenderer) __rt.renderer = e.detail; if (e.detail && e.detail.isScene) __rt.scene = e.detail; });
    (function loop(){ let last = 0; const f = (t) => { if (last) { __rt.ft.push(t - last); if (t - last > 50) { let st = ''; try { const S = __mg.sim; st = (S.phase||'-') + '/' + (S.e?.mode||'-') + '/' + Math.round(S.time||0) + \
'/x' + (__mg.runState?.().eff?.toFixed?.(1) ?? '') + (document.querySelector('#game:not(.hidden)') ? '/game' : '') + (document.querySelector('#modal:not(.hidden)') ? '/modal' : ''); } catch (e) {} __rt.ev.push(['long', \
Math.round(t), Math.round(t - last), st]); } } last = t; __rt.tick(); const pr = __rt.renderer && __rt.renderer.getPixelRatio(); if (pr && pr !== __rt.pr) { __rt.ev.push(['pr', Math.round(t), pr]); __rt.pr = pr; } requestAnimationFrame(f); }; requestAnimationFrame(f); })();
    __rt.mark = (k) => { __rt.marks[k] ??= performance.now(); };
    new MutationObserver(() => { if (document.querySelector('#bGo')) __rt.mark('bGo'); }).observe(document, { subtree: true, childList: true });
  ` });
  const t0 = Date.now();
  await send('Page.navigate', { url });
  for (let i = 0; i < 300; i++) { await sleep(100); if (await js(`!!(window.__mg && document.querySelector('#bGo'))`).catch(() => false)) break; }
  const loadMs = Date.now() - t0;

  let cx = w / 2, cy = h / 2;
  const api = {
    W: w, H: h, FPS: 30, js, send, errors, loadMs, log: (...a) => console.log('  ', ...a),
    rec() { }, get recording() { return false; },
    async wait(sec) { await sleep(sec * 1000); },
    async skip(sec) { await sleep(sec * 1000); },
    async until(cond, max = 60, { quiet = false } = {}) {
      const end = Date.now() + max * 1000;
      while (Date.now() < end) { if (await js(`!!(${cond})`).catch(() => false)) return true; await sleep(100); }
      if (!quiet) api.log('等待超时：', cond); return false;
    },
    async where(sel, { dx = 0, dy = 0 } = {}) {
      const r = await js(`(()=>{const e=${sel.startsWith('(') || sel.startsWith('document') ? sel : `document.querySelector(${JSON.stringify(sel)})`}; if(!e) return null; const b=e.getBoundingClientRect(); return b.width||b.height ? [b.left+b.width/2, b.top+b.height/2] : null})()`);
      return r && [r[0] + dx, r[1] + dy];
    },
    async moveTo(x, y) { cx = x; cy = y; await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); },
    async click(target, { after = 0.35, dx = 0, dy = 0 } = {}) {
      const p = Array.isArray(target) ? target : await api.where(target, { dx, dy });
      if (!p) { api.log('找不到：', target); return false; }
      if (mobile) {
        await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p[0], y: p[1] }] });
        await sleep(40); await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        await api.moveTo(p[0], p[1]);
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p[0], y: p[1], button: 'left', clickCount: 1 });
        await sleep(30);
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p[0], y: p[1], button: 'left', clickCount: 1 });
      }
      await sleep(after * 1000); return true;
    },
    async drag(points, { sec = 1, after = 0.3 } = {}) {
      const pts = []; for (const t of points) pts.push(Array.isArray(t) ? t : await api.where(t));
      if (pts.some(p => !p)) return false;
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pts[0][0], y: pts[0][1], button: 'left', clickCount: 1 });
      const per = Math.max(2, Math.round(sec * 30 / Math.max(1, pts.length - 1)));
      for (let s = 1; s < pts.length; s++) for (let i = 1; i <= per; i++) {
        const k = i / per; cx = pts[s - 1][0] + (pts[s][0] - pts[s - 1][0]) * k; cy = pts[s - 1][1] + (pts[s][1] - pts[s - 1][1]) * k;
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx, y: cy, button: 'left', buttons: 1 }); await sleep(33);
      }
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx, y: cy, button: 'left', clickCount: 1 });
      await sleep(after * 1000); return true;
    },
    async key() { }, cursor: async () => { }, caption: async () => { }, card: async () => { }, still: async () => { },
    // 帧时间：清空、读出
    async ftReset() { await js(`__rt.ft.length = 0; __rt.wk.length = 0; 1`); },
    async evRead() { return js(`__rt.ev.splice(0)`); },
    async wkRead() { return js(`__rt.wk.splice(0)`); },
    async ftRead() { return js(`__rt.ft.splice(0)`); },
    async both() { return js(`({ft:__rt.ft.splice(0), wk:__rt.wk.splice(0)})`); },
    async mem() {
      const m = await send('Performance.getMetrics'); const g = {}; for (const x of m.result.metrics) g[x.name] = x.value;
      const r = await js(`(()=>{const r=__rt.renderer; if(!r) return null; const i=r.info; return {geo:i.memory.geometries, tex:i.memory.textures, prog:i.programs?.length, pr:r.getPixelRatio(), calls:i.render.calls}})()`);
      return { heapMB: +(g.JSHeapUsedSize / 1048576).toFixed(1), heapTotMB: +(g.JSHeapTotalSize / 1048576).toFixed(1), nodes: g.Nodes, listeners: g.JSEventListeners, ...r };
    },
    async gc() { await send('HeapProfiler.collectGarbage'); },
    // 两指旋转（手机）／右键拖（电脑）：绕画面中心转 deg 度，用 sec 秒
    async rotate(deg = 180, sec = 3) {
      const n = Math.round(sec * 60), cx0 = w / 2, cy0 = h * 0.55, R = Math.min(w, h) * 0.22;
      if (mobile) {
        // MapControls 的两指＝推拉＋旋转：两指一起横向移动＝绕着转（不是拧）。来回横扫，总共转 deg 对应的距离
        const span = w * 0.5, tp = (x) => [{ x, y: cy0 - 60, id: 0 }, { x, y: cy0 + 60, id: 1 }];
        const xs = (i) => { const u = (i / n) * Math.abs(deg) / 75; const f = u % 2; const tri = f < 1 ? f : 2 - f; return w * 0.25 + span * (deg > 0 ? tri : 1 - tri); };
        await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(xs(0)) });
        for (let i = 1; i <= n; i++) { await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(xs(i)) }); await sleep(1000 / 60); }
        await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        // MapControls：右键拖动＝旋转；横向拖 w 像素约转 360°
        const dx = w * deg / 360;
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx0, y: cy0, button: 'right', buttons: 2, clickCount: 1 });
        for (let i = 1; i <= n; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx0 + dx * i / n, y: cy0, button: 'right', buttons: 2 }); await sleep(1000 / 60); }
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx0 + dx, y: cy0, button: 'right', buttons: 0, clickCount: 1 });
      }
    },
    close() { kill(); server.close(); try { fs.rmSync(profile, { recursive: true, force: true }); } catch { } },
  };
  return api;
}

export function stats(ft) {
  if (!ft.length) return null;
  const s = [...ft].sort((a, b) => a - b), q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  const tot = ft.reduce((a, b) => a + b, 0);
  return { n: ft.length, fps: +(ft.length * 1000 / tot).toFixed(1), p50: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), p99: +q(0.99).toFixed(1), max: +s[s.length - 1].toFixed(1), over50: ft.filter(x => x > 50).length, over100: ft.filter(x => x > 100).length };
}
