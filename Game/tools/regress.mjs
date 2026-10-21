// 7 天乱点回归：每天从早上开始乱点（按钮、小关卡、犹豫时刻、地图），检查是否报错、能否走到结算。
// 用法：node tools/regress.mjs [天数列表，如 1,3,7]    默认 7 天；默认用显卡，最多同时 2 个浏览器。
// 注：第 3 天连线、第 7 天摆棋靠乱点很难答对，可能停在关卡里（done:false 但无报错属正常）。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const days = (process.argv[2] || '1,2,3,4,5,6,7').split(',').map(Number);
const here = path.dirname(new URL(import.meta.url).pathname);
const monkey = `
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const vis=el=>el && el.getClientRects().length && !el.disabled;
window.__errs=[]; addEventListener('error',e=>__errs.push(e.message)); addEventListener('unhandledrejection',e=>__errs.push(String(e.reason)));
for (let i = 0; i < 100 && !document.querySelector('#bGo'); i++) await sleep(100); document.querySelector('#bGo')?.click(); await sleep(300);   // 等标题画面的按钮出来再点
let t0=performance.now(), steps=0, done=false;
while (performance.now()-t0 < 180000) {   // 180 秒（10-06 原 100：地基后爷爷走人行道、过街让车，画面走到门口更久；机器负载重时第 3 天会超时，不是游戏卡住）：__mg.run 只推进规则、不渲染，“进门中”要等 20 分钟兜底，有进门的日子会慢一些
  const modalOpen=!document.querySelector('#modal').classList.contains('hidden');
  if (modalOpen) { if ([...document.querySelectorAll('#bNext,#bEnd')].some(vis)) { done=true; break; } const b=[...document.querySelectorAll('#bPlan,#bSetOk,#bBack,#bRemOk,#modal .primary')].find(vis); if (b) b.click(); }
  else if (__mg.trailLabel()) {   // 健步走连线：按顺序点下一个
    const t = [...document.querySelectorAll('#maplayer .mtag')].find(e => e.textContent === __mg.trailLabel()); if (t) t.click();
    const go = document.querySelector('#tGo'); if (go && vis(go)) go.click();
  }
  else if (document.querySelector('#cB') && !window.__chessDone) {   // 摆残局：照棋谱摆
    window.__chessDone = true;
    const P = { bj: [4, 0], bs: [4, 1], bz: [6, 5], rs: [4, 9], rm: [2, 2], rp: [4, 6], rc: [0, 4] };
    for (const k in P) { document.querySelector('#cTray .pc2[data-k="' + k + '"]')?.click(); await sleep(30); document.querySelector('#cB .hit[data-x="' + P[k][0] + '"][data-y="' + P[k][1] + '"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); await sleep(30); }
    document.querySelector('#cDone')?.click();
  }
  else {
    const go = document.querySelector('#tGo'); if (go && vis(go)) go.click();
    const cands=[...document.querySelectorAll('#game button, #game .chip, #game .food, #game .spot, #game .dot, #game .pc2, #game .kt-tgt, #moment button, #mappanel button, #maplayer .mtag, #dock button, #actions button, #hudR>button, #gp button, #menu button')].filter(vis);
    if (cands.length) { const c=cands[Math.floor(Math.random()*cands.length)]; c.click ? c.click() : c.dispatchEvent(new MouseEvent('click',{bubbles:true})); }
    if (Math.random()<0.02) document.dispatchEvent(new KeyboardEvent('keydown',{key:'h',bubbles:true}));
  }
  if (__mg.sim.phase==='live') __mg.run(0.6);
  steps++; await sleep(30);
}
return {day:__mg.sim.dayIdx+1, done, phase:__mg.sim.phase, t:Math.round(__mg.sim.time), steps, errs:window.__errs, miss:[...(window.__voiceMiss||[])]};`;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-reg-'));
const run = (d) => new Promise(res => {
  const f = path.join(tmp, `d${d}.json`);
  fs.writeFileSync(f, JSON.stringify([
    { js: `localStorage.clear(); localStorage.setItem('mg-save', JSON.stringify({day:${d - 1},best:[],persist:null,snap:[]})); location.reload();`, wait: 2500 },
    { js: monkey },
  ]));
  let out = '';
  const p = spawn('node', [path.join(here, 'shot.mjs'), '1280', '800', f]);
  p.stdout.on('data', b => out += b); p.stderr.on('data', b => out += b);
  const kill = setTimeout(() => p.kill(), 200000);   // 要比页面里乱点的上限（180 秒）长，不然慢的一天会被提前掐掉、报“没有结果”（10-06）
  p.on('close', () => { clearTimeout(kill); const m = out.match(/"day".*\}/); res(m ? m[0] : `day ${d}: 没有结果\n${out.slice(0, 300)}`); });
});
const queue = [...days], results = [];
await Promise.all([0, 1].map(async () => { while (queue.length) { const d = queue.shift(); results[d] = await run(d); console.log(results[d]); } }));
fs.rmSync(tmp, { recursive: true, force: true });
