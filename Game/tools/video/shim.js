// 录视频用的页面注入脚本（在游戏脚本之前运行）：
// 1. 虚拟时间：performance.now／Date.now／requestAnimationFrame／setTimeout／setInterval 都由录制器一帧一帧推进，
//    CSS 动画与过渡也按虚拟时间逐帧定位——不管截一张图多慢，视频都是匀速的。
// 2. 离线声音：游戏的 AudioContext 换成 OfflineAudioContext，每帧渲染 1/fps 秒，声画精确对齐；结束时导出 WAV。
// 3. 随机数固定种子，同一剧本每次录出来一样。
// 4. 可见的光标与点击波纹（录制器移动它，真实输入事件由 CDP 发出）。
(() => {
  const CFG = window.__recCfg || { fps: 30, seed: 7, audioSec: 600, sr: 48000 };
  // ---------- 随机数 ----------
  let s = CFG.seed >>> 0;
  Math.random = () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  // ---------- 时间 ----------
  let now = 0;   // 虚拟毫秒
  const epoch = Date.UTC(2026, 8, 25, 1, 0, 0);
  const realPerf = performance.now.bind(performance);
  performance.now = () => now;
  Date.now = () => epoch + now;
  const RD = Date;
  window.Date = class extends RD { constructor(...a) { if (a.length) super(...a); else super(epoch + now); } static now() { return epoch + now; } };
  let raf = [], rafId = 0, timers = new Map(), timerId = 0;
  window.requestAnimationFrame = (cb) => { raf.push([++rafId, cb]); return rafId; };
  window.cancelAnimationFrame = (id) => { raf = raf.filter(r => r[0] !== id); };
  window.setTimeout = (cb, ms = 0, ...a) => { const id = ++timerId; timers.set(id, { at: now + Math.max(0, +ms || 0), cb, a }); return id; };
  window.setInterval = (cb, ms = 0, ...a) => { const id = ++timerId; ms = Math.max(1, +ms || 0); timers.set(id, { at: now + ms, cb, a, every: ms }); return id; };
  window.clearTimeout = window.clearInterval = (id) => { timers.delete(id); };
  const runTimers = (until) => {
    for (let guard = 0; guard < 10000; guard++) {
      let best = null;
      for (const [id, t] of timers) if (t.at <= until && (!best || t.at < best[1].at || (t.at === best[1].at && id < best[0]))) best = [id, t];
      if (!best) break;
      const [id, t] = best;
      now = Math.max(now, t.at);
      if (t.every) t.at += t.every; else timers.delete(id);
      try { typeof t.cb === 'function' ? t.cb(...t.a) : eval(t.cb); } catch (e) { console.error(e); }
    }
    now = until;
  };
  // CSS 动画／过渡：第一次见到时记下虚拟起点，之后每帧暂停并定位到 (虚拟时间 - 起点)
  const animStart = new WeakMap();
  const syncAnims = () => {
    let list; try { list = document.getAnimations(); } catch { return; }
    for (const a of list) {
      if (!animStart.has(a)) { animStart.set(a, now - (a.currentTime || 0)); }
      try { a.pause(); a.currentTime = (now - animStart.get(a)) * (a.playbackRate || 1); } catch { }
    }
  };
  // ---------- 声音 ----------
  const AC = { ctx: null, t0: 0, rendered: 0, done: null, buf: null };
  const OAC = window.OfflineAudioContext;
  const q = (sec) => Math.round(sec * CFG.sr / 128) * 128 / CFG.sr;
  const rawSuspend = OAC.prototype.suspend, rawResume = OAC.prototype.resume;
  window.AudioContext = window.webkitAudioContext = function () {
    const c = new (class extends OAC { })(2, Math.ceil(CFG.audioSec * CFG.sr), CFG.sr);
    Object.defineProperty(c, 'state', { get: () => 'running' });
    c.resume = () => Promise.resolve(); c.suspend = () => Promise.resolve(); c.close = () => Promise.resolve();
    AC.ctx = c; AC.t0 = now;
    AC.done = new Promise(ok => { c.oncomplete = (e) => { AC.buf = e.renderedBuffer; ok(); }; });
    AC.target = q(1 / CFG.fps);
    AC.wait = rawSuspend.call(c, AC.target);
    OAC.prototype.startRendering.call(c);
    return c;
  };
  const audioStep = async () => {
    const c = AC.ctx; if (!c) return;
    const want = q((now - AC.t0) / 1000);
    if (want <= AC.target) return;
    if (want * CFG.sr >= c.length - 256) return;   // 超出预留长度就不再渲染
    await AC.wait;                                  // 上一段已停住
    AC.target = want;
    AC.wait = rawSuspend.call(c, want);
    rawResume.call(c);
    await AC.wait;
  };
  // ---------- 光标 ----------
  let cur = null, curX = -50, curY = -50;
  const ensureCursor = () => {
    if (cur || !document.body) return;
    cur = document.createElement('div');
    cur.id = '__cursor';
    cur.innerHTML = `<svg width="30" height="35" viewBox="0 0 34 40"><path d="M4 3 L4 31 L11.5 24 L16.5 36 L21.5 34 L16.5 22.5 L27 22.5 Z" fill="#fffaf0" stroke="#2b3440" stroke-width="2.4" stroke-linejoin="round"/></svg>`;
    cur.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35));will-change:transform';
    document.body.appendChild(cur);
  };
  const ripples = [];
  const drawCursor = () => {
    ensureCursor(); if (!cur) return;
    cur.style.transform = `translate(${curX - 5}px,${curY - 4}px)`;
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i], k = (now - r.t) / 450;
      if (k >= 1) { r.el.remove(); ripples.splice(i, 1); continue; }
      const d = 18 + k * 46;
      r.el.style.cssText = `position:fixed;left:${r.x - d / 2}px;top:${r.y - d / 2}px;width:${d}px;height:${d}px;border-radius:50%;border:3px solid rgba(255,190,90,${(1 - k) * 0.95});background:rgba(255,220,150,${(1 - k) * 0.25});z-index:2147483646;pointer-events:none`;
    }
  };
  window.__rec = {
    get now() { return now; },
    // 推进一帧：定时器 → rAF（游戏逻辑与渲染）→ CSS 动画定位 → 声音渲染到当前时刻
    async step(ms) {
      const until = now + ms;
      runTimers(until);
      const cbs = raf; raf = [];
      for (const [, cb] of cbs) { try { cb(now); } catch (e) { console.error(e); } }
      syncAnims(); drawCursor();
      await audioStep();
      return now;
    },
    cursor(x, y) { curX = x; curY = y; drawCursor(); },
    hideCursor(h) { ensureCursor(); if (cur) cur.style.display = h ? 'none' : ''; },
    ripple(x, y) { const el = document.createElement('div'); document.body.appendChild(el); ripples.push({ el, x, y, t: now }); drawCursor(); },
    // 章节字幕（左下角）：text 为空则淡出
    caption(text, sub = '') {
      let el = document.getElementById('__cap');
      if (!el) {
        el = document.createElement('div'); el.id = '__cap';
        el.style.cssText = 'position:fixed;left:28px;bottom:118px;z-index:2147483640;pointer-events:none;max-width:46vw;padding:14px 22px 15px 20px;border-radius:6px;background:rgba(32,40,48,.84);color:#fffaf0;font-weight:600;\
font-size:25px;line-height:1.4;box-shadow:0 4px 0 rgba(0,0,0,.18);border-left:6px solid #e8894f;opacity:0;transform:translateY(10px);transition:opacity .45s ease,transform .45s ease';
          
        document.body.appendChild(el);
      }
      if (text) { el.innerHTML = text + (sub ? `<div style="font-weight:400;font-size:18px;opacity:.82;margin-top:4px">${sub}</div>` : ''); void el.offsetWidth; el.style.opacity = 1; el.style.transform = 'none'; }
      else { el.style.opacity = 0; el.style.transform = 'translateY(10px)'; }
    },
    // 整屏卡片（片头片尾）：html 为空则淡出；dim 为背景压暗程度
    card(html, dim = 0.45) {
      let el = document.getElementById('__card');
      if (!el) {
        el = document.createElement('div'); el.id = '__card';
        el.style.cssText = 'position:fixed;inset:0;z-index:2147483641;pointer-events:none;display:flex;flex-direction:column;justify-content:center;padding:0 7vw;color:#fffaf0;opacity:0;transition:opacity .8s ease';
        document.body.appendChild(el);
      }
      if (html) { el.style.background = `linear-gradient(90deg, rgba(24,30,38,${dim}) 0%, rgba(24,30,38,${dim * 0.55}) 55%, rgba(24,30,38,0) 100%)`; el.innerHTML = html; void el.offsetWidth; el.style.opacity = 1; }
      else el.style.opacity = 0;
    },
    audioInfo() { return { has: !!AC.ctx, t0: AC.t0, target: AC.target, sr: CFG.sr }; },
    // 结束：把剩余部分渲染完，按保留的片段（虚拟毫秒区间）剪出 16 位 WAV，分块取回
    async finishAudio(ranges) {
      const c = AC.ctx; if (!c) return 0;
      await AC.wait; rawResume.call(c); await AC.done;
      const b = AC.buf, sr = CFG.sr, fade = Math.round(sr * 0.012);
      const parts = ranges.map(([a, z]) => [Math.round((a - AC.t0) / 1000 * sr), Math.round((z - AC.t0) / 1000 * sr)]);
      const total = parts.reduce((n, [a, z]) => n + (z - a), 0);
      const out = new Int16Array(total * 2);
      const L = b.getChannelData(0), R = b.getChannelData(1);
      let o = 0;
      for (const [a, z] of parts) {
        const n = z - a;
        for (let i = 0; i < n; i++) {
          const j = a + i, g = Math.min(1, i / fade, (n - i) / fade);
          const l = j >= 0 && j < L.length ? L[j] : 0, r = j >= 0 && j < R.length ? R[j] : 0;
          out[o++] = Math.max(-32768, Math.min(32767, l * g * 32767));
          out[o++] = Math.max(-32768, Math.min(32767, r * g * 32767));
        }
      }
      AC.pcm = new Uint8Array(out.buffer);
      return AC.pcm.length;
    },
    audioChunk(i, size) {
      const u = AC.pcm.subarray(i, i + size); let s = '';
      for (let k = 0; k < u.length; k += 0x8000) s += String.fromCharCode.apply(null, u.subarray(k, k + 0x8000));
      return btoa(s);
    },
    realNow: realPerf,
  };
})();
