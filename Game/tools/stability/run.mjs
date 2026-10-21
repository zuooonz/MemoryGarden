// 标准稳定性测试（10-14 用户：稳定性是基础，不容让步；建立标准测试流程）。按真实时间跑，模拟手机和演示用的 Mac，四项：
//   boot     启动：限速网络（10Mbps、60ms）+ 手机 CPU 慢 4 倍，标题出现要多久、配音多久到齐
//   rotate   旋转：进第 1 天、他出门走路后，静止 4 秒 + 来回旋转 4 次（手机两指横扫／电脑右键拖），量帧间隔与每帧主线程工作量
//   conflict 抢镜头：暂停后每次拖转 30° 按住 3 秒再松手，转一圈 12 次；按住时被自动视角转走、松手被拽回都算失败
//   week     连玩 7 天：自动玩家（tools/video/play.mjs）把一周玩完，记每天的帧、长帧、换天耗时、页面报错、内存
// 用法：node tools/stability/run.mjs [--only boot,rotate,conflict,week] [--html 某个.html] [--base 某个 git 版本（另外构建它做对照，不判合格）] [--out 目录]
//   不给 --html 就测 dist/index.html（先 npm run build）。结果写进 snapshots/stability/<时间>/（result.json、summary.md），终端打印对照表；
//   有一项不合格以状态 1 退出。用显卡渲染，同时只开一个无头浏览器。一次全跑约 25—35 分钟（week 占大半）；改了每帧逻辑、镜头、走路、加载方式后跑，部署前跑。
// 合格线（LIMITS）是“手机慢 8 倍时也不能卡”的底线，不是目标；数字偏紧时先看是不是测试机忙，再改线（改线写清原因）。
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { launch, stats } from './rt.mjs';
import { player } from '../video/play.mjs';

const game = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const only = (arg('only', 'boot,rotate,conflict,week')).split(',');
const html = path.resolve(arg('html', path.join(game, 'dist/index.html')));
const stamp = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).slice(0, 16).replace(/[ :]/g, '-');
const outDir = path.resolve(arg('out', path.join(game, 'snapshots/stability', stamp)));
fs.mkdirSync(outDir, { recursive: true });

export const LIMITS = {
  bootTitleMs: 1500,      // 手机（CPU 慢 4 倍、10Mbps）标题出现
  bootVoiceMs: 10000,     // 配音到齐
  frameLongMs: 100,       // 测量窗口里不能有超过这么长的帧（手机慢 8 倍、Mac 慢 2 倍）
  workP95Ms: 33,          // 每帧主线程工作量的 95 分位（超过就掉到 30 帧以下）
  conflictMoves: 0,       // 按住时被转走、松手被拽回的次数
  weekDays: 7, weekErrors: 0,
  weekHeapGrow: 1.5,      // 第 7 天结束时的 JS 内存 ÷ 第 1 天结束时
  weekLong250: 20,        // 一周里超过 250ms 的帧（换天、关卡切换的一下）总数
  switchMs: 3000,         // 点“下一天”到当天介绍出现
};
const DEV = { phone: { w: 390, h: 844, dpr: 3, mobile: true }, mac: { w: 1440, h: 900, dpr: 2, mobile: false } };
const pass = `(()=>{const b=document.querySelector('#moment:not(.hidden) button[data-id="tell"]')||document.querySelector('#moment:not(.hidden) button[data-id="cue"]')||document.querySelector('#moment:not(.hidden) button'); if(b) b.click(); return 1})()`;
const log = (...a) => console.log(...a);

// 进第 1 天，等他出门走在路上（途中的犹豫时刻直接帮一把）
async function toWalk(api) {
  await api.click('#bGo'); await api.until(`document.querySelector('#bPlan')`, 60);
  await api.click('#bPlan'); await api.until(`document.querySelector('#startBtn')`, 20); await api.wait(0.5);
  await api.click('#startBtn');
  if (await api.until(`document.querySelector('#lOk')`, 40, { quiet: true })) { await api.wait(0.5); await api.js(`document.querySelector('#lOk').click()`); }
  await api.js(`__mg.setSpeed(4); 1`);
  for (let i = 0; i < 120; i++) { await api.js(pass); if (await api.js(`__mg.sim.e?.mode==='walk' && document.querySelector('#moment').classList.contains('hidden') && document.querySelector('#game').classList.contains('hidden')`)) break; await api.wait(0.5); }
  await api.js(`__mg.setSpeed(1); 1`);
}

async function boot(file) {
  const res = [];
  for (let i = 0; i < 3; i++) {
    const api = await launch({ html: file, ...DEV.phone, cpu: 4, net: { kbps: 10000, lat: 60 } });
    try {
      const title = await api.js(`Math.round(__rt.marks.bGo || -1)`);
      const t0 = await api.js(`performance.now()`); await api.until(`!!window.__VOICE`, 30, { quiet: true });
      res.push({ title, voice: Math.round(await api.js(`performance.now()`)), errors: api.errors.length });
      void t0;
    } finally { api.close(); }
  }
  const med = (k) => res.map(r => r[k]).sort((a, b) => a - b)[1];
  return { runs: res, titleMs: med('title'), voiceMs: med('voice') };
}

async function rotate(file, dev, cpu) {
  const api = await launch({ html: file, ...DEV[dev], cpu });
  const S = (b) => ({ ft: stats(b.ft), wk: stats(b.wk) });
  try {
    await toWalk(api); await api.wait(2);
    await api.ftReset(); await api.wait(4); const idle = S(await api.both());
    const ft = [], wk = [];
    for (let k = 0; k < 4; k++) { await api.js(pass); await api.ftReset(); await api.rotate(k % 2 ? -150 : 150, 3); const b = await api.both(); ft.push(...b.ft); wk.push(...b.wk); await api.wait(1); }
    const rot = S({ ft, wk });
    const long = (await api.evRead()).filter(e => e[0] === 'long' && e[2] > 100 && !/modal|^-|plan\//.test(e[3] || ''));   // 加载、标题、布置界面的长帧不算（启动另测）
    return { dev, cpu, idle, rotate: rot, long: long.slice(0, 20), nLong: long.length, mem: await api.mem(), errors: api.errors.slice(0, 5) };
  } finally { api.close(); }
}

async function conflict(file) {
  const D = DEV.mac, api = await launch({ html: file, ...D, cpu: 1 });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const th = () => api.js(`(()=>{ if (!__mg.sight) return null; const s=__mg.sight(); return {th:s.theta, ph:s.phi, moved:s.moved}})()`);
  const rows = [];
  try {
    await toWalk(api); await api.wait(5); await api.js(pass);
    if (!(await th())) return { skipped: '这个版本没有自动视角' };
    await api.js(`__mg.setSpeed(0); 1`); await api.wait(1);
    const { send } = api, cx = D.w / 2, cy = D.h * 0.55;
    const press = (x, y) => send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'right', buttons: 2, clickCount: 1 });
    const move = (x, y) => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'right', buttons: 2 });
    const release = (x, y) => send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'right', buttons: 0, clickCount: 1 });
    const follow = () => api.js(`document.querySelector('#view').dispatchEvent(new MouseEvent('dblclick', {bubbles:true})); 1`);   // 双击＝重新跟随（游戏自带）
    await follow(); await press(cx, cy); for (let i = 1; i <= 20; i++) { await move(cx, cy - i * 6); await sleep(16); } await release(cx, cy - 120); await sleep(300);   // 先压低镜头，更容易被房子挡住
    for (let k = 0; k < 12; k++) {
      await follow(); await sleep(2500);   // 让自动视角有机会先动
      const dx = D.w / 12; await press(cx, cy);
      for (let i = 1; i <= 30; i++) { await move(cx + dx * i / 30, cy); await sleep(16); }
      await sleep(400);   // 惯性收住
      const held = []; for (let i = 0; i < 12; i++) { await sleep(250); held.push(await th()); }
      await release(cx + dx, cy); await sleep(80); const after = await th();
      const d = (a, b) => Math.abs(Math.atan2(Math.sin(a.th - b.th), Math.cos(a.th - b.th))) + Math.abs(a.ph - b.ph);
      rows.push({ k, autoMovedBefore: held[0].moved, held: +Math.max(...held.map(h => d(h, held[0]))).toFixed(3), release: +d(after, held[held.length - 1]).toFixed(3) });
    }
  } finally { api.close(); }
  return { rows, heldTurned: rows.filter(r => r.held > 0.05).length, snapped: rows.filter(r => r.release > 0.05).length, autoMoved: rows.filter(r => r.autoMovedBefore).length };
}

async function week(file, dev, cpu) {
  const api = await launch({ html: file, ...DEV[dev], cpu, settings: { font: 1, vol: 2, tips: 2, gfx: 'auto', voice: true, narr: false } });
  const P = player(api); P.rounds = 60;
  const out = { dev, cpu, days: [], mem: [] };
  const memNow = async (tag) => { await api.gc(); out.mem.push({ tag, ...(await api.mem()) }); };
  try {
    await memNow('title');
    for (let d = 1; d <= 7; d++) {
      const day = { d }, s0 = Date.now();
      if (d === 1) await api.click('#bGo'); else await api.click('#bNext');
      if (!(await api.until(`document.querySelector('#bPlan')`, 60))) { day.err = '当天介绍没出来'; out.days.push(day); break; }
      day.switchMs = Date.now() - s0;
      await api.ftReset(); await api.evRead();
      await api.wait(0.5); await api.click('#bPlan'); await api.until(`document.querySelector('#startBtn')`, 20);
      await api.wait(0.5); await api.click('#startBtn');
      await api.wait(3); if (await api.js(`__mg.sim.phase==='plan' && !!document.querySelector('#startBtn')`)) { day.startRetry = true; await api.js(`document.querySelector('#startBtn').click()`); }
      const p0 = Date.now();
      try { await P.finishDay(); } catch (e) { day.err = String(e.message).slice(0, 300); }
      day.playSec = Math.round((Date.now() - p0) / 1000);
      const b = await api.both(); day.ft = stats(b.ft); day.wk = stats(b.wk);
      const ev = await api.evRead(); day.long250 = ev.filter(e => e[0] === 'long' && e[2] > 250); day.nLong250 = day.long250.length; day.long250 = day.long250.slice(0, 10);
      day.errors = api.errors.splice(0).slice(0, 5);
      out.days.push(day); log(`  第 ${d} 天`, JSON.stringify({ switchMs: day.switchMs, playSec: day.playSec, fps: day.ft?.fps, p99: day.ft?.p99, long250: day.nLong250, err: day.err || '', errors: day.errors.length }));
      await memNow('day' + d);
      if (day.err) break;
    }
  } finally { api.close(); }
  return out;
}

// 判合格（只判被测版本）
function judge(r) {
  const bad = [];
  if (r.boot) { if (r.boot.titleMs > LIMITS.bootTitleMs) bad.push(`启动：标题 ${r.boot.titleMs}ms > ${LIMITS.bootTitleMs}`); if (r.boot.voiceMs > LIMITS.bootVoiceMs) bad.push(`启动：配音 ${r.boot.voiceMs}ms`); }
  for (const x of r.rotate || []) {
    const tag = `旋转（${x.dev} 慢 ${x.cpu} 倍）`;
    if (x.nLong) bad.push(`${tag}：${x.nLong} 帧超过 ${LIMITS.frameLongMs}ms（${x.long.slice(0, 3).map(e => e[2] + 'ms@' + e[3]).join('、')}）`);
    for (const k of ['idle', 'rotate']) if (x[k].wk.p95 > LIMITS.workP95Ms) bad.push(`${tag}：${k === 'idle' ? '静止' : '旋转'}时每帧工作量 p95 ${x[k].wk.p95}ms`);
    if (x.errors.length) bad.push(`${tag}：页面报错 ${x.errors[0]}`);
  }
  if (r.conflict && !r.conflict.skipped && r.conflict.heldTurned + r.conflict.snapped > LIMITS.conflictMoves) bad.push(`抢镜头：按住时被转走 ${r.conflict.heldTurned} 次、松手被拽回 ${r.conflict.snapped} 次`);
  for (const w of r.week || []) {
    const tag = `连玩（${w.dev} 慢 ${w.cpu} 倍）`, done = w.days.filter(d => !d.err).length;
    if (done < LIMITS.weekDays) bad.push(`${tag}：只玩完 ${done} 天（${w.days.find(d => d.err)?.err || ''}）`);
    const errs = w.days.reduce((s, d) => s + (d.errors?.length || 0), 0); if (errs > LIMITS.weekErrors) bad.push(`${tag}：页面报错 ${errs} 条`);
    const h1 = w.mem.find(m => m.tag === 'day1')?.heapMB, h7 = w.mem.find(m => m.tag === 'day7')?.heapMB; if (h1 && h7 && h7 / h1 > LIMITS.weekHeapGrow) bad.push(`${tag}：内存从 ${h1}MB 涨到 ${h7}MB`);
    const l = w.days.reduce((s, d) => s + (d.nLong250 || 0), 0); if (l > LIMITS.weekLong250) bad.push(`${tag}：超过 250ms 的帧 ${l} 个`);
    for (const d of w.days) if (d.switchMs > LIMITS.switchMs) bad.push(`${tag}：第 ${d.d} 天换天 ${d.switchMs}ms`);
  }
  return bad;
}

function md(name, r) {
  const L = [`## ${name}`, ''];
  if (r.boot) L.push(`- 启动（手机慢 4 倍、10Mbps）：标题 ${r.boot.titleMs}ms，配音到齐 ${r.boot.voiceMs}ms`);
  for (const x of r.rotate || []) L.push(`- 旋转（${x.dev} 慢 ${x.cpu} 倍）：静止 ${x.idle.ft.fps} 帧/秒（工作量 p95 ${x.idle.wk.p95}ms，最长 ${x.idle.ft.max}ms）；旋转 ${x.rotate.ft.fps} 帧/秒（p95 ${x.rotate.wk.p95}ms，最长 ${x.rotate.ft.max}ms）；超过 100ms 的帧 ${x.nLong} 个；内存 ${x.mem.heapMB}MB、绘制 ${x.mem.calls} 次`);
  if (r.conflict) L.push(r.conflict.skipped ? `- 抢镜头：${r.conflict.skipped}` : `- 抢镜头（12 次拖转）：按住时被转走 ${r.conflict.heldTurned} 次，松手被拽回 ${r.conflict.snapped} 次（拖之前自动视角已换过角度的 ${r.conflict.autoMoved} 次）`);
  for (const w of r.week || []) {
    L.push(`- 连玩 7 天（${w.dev} 慢 ${w.cpu} 倍）：`, '', '| 天 | 换天 ms | 玩了 秒 | 帧/秒 | p99 ms | >250ms | 报错 | 结束时内存 MB |', '|---|---|---|---|---|---|---|---|');
    for (const d of w.days) L.push(`| ${d.d} | ${d.switchMs ?? ''} | ${d.playSec ?? ''} | ${d.ft?.fps ?? ''} | ${d.ft?.p99 ?? ''} | ${d.nLong250 ?? ''} | ${(d.errors?.length || 0) + (d.err ? ' 卡住：' + d.err.slice(0, 60) : '')} | ${w.mem.find(m => m.tag === 'day' + d.d)?.heapMB ?? ''} |`);
    L.push('');
  }
  return L.join('\n');
}

async function suite(file, isBase) {
  const r = { html: file, build: (fs.readFileSync(file, 'utf8').match(/__BUILD=(\{[^}]*\})/) || [])[1] || null };
  const save = () => fs.writeFileSync(path.join(outDir, (isBase ? 'base' : 'result') + '.json'), JSON.stringify(r, null, 1));
  if (only.includes('boot')) { log('启动…'); r.boot = await boot(file); save(); }
  if (only.includes('rotate')) { r.rotate = []; for (const [dev, cpu] of [['phone', 4], ['phone', 8], ['mac', 2]]) { log(`旋转 ${dev} 慢 ${cpu} 倍…`); r.rotate.push(await rotate(file, dev, cpu)); save(); } }
  if (only.includes('conflict')) { log('抢镜头…'); r.conflict = await conflict(file); save(); }
  if (only.includes('week')) { r.week = []; for (const [dev, cpu] of [['mac', 2], ['phone', 4]]) { log(`连玩 7 天 ${dev} 慢 ${cpu} 倍…`); r.week.push(await week(file, dev, cpu)); save(); } }
  return r;
}

const base = arg('base');
let baseRes = null;
if (base) {   // 对照版本：git archive 到临时目录构建（不动工作区）
  const dir = fs.mkdtempSync('/tmp/mg-base-');
  execSync(`git -C ${JSON.stringify(path.dirname(game))} archive ${base} Game | tar -x -C ${dir}`);
  fs.symlinkSync(path.join(game, 'node_modules'), path.join(dir, 'Game/node_modules'));
  execSync('node build.mjs', { cwd: path.join(dir, 'Game'), stdio: 'ignore' });
  log(`对照版本 ${base} 已构建`);
  baseRes = await suite(path.join(dir, 'Game/dist/index.html'), true);
}
const res = await suite(html, false);
const bad = judge(res);
const summary = [`# 稳定性测试 ${stamp}`, '', `被测：${res.build}${base ? `；对照：${base}` : ''}`, '', bad.length ? `**不合格 ${bad.length} 项：**\n\n${bad.map(b => '- ' + b).join('\n')}` : '**全部合格**', '', md('被测版本', res), baseRes ? '\n' + md(`对照 ${base}`, baseRes) : ''].join('\n');
fs.writeFileSync(path.join(outDir, 'summary.md'), summary);
log('\n' + summary + `\n\n结果目录：${outDir}`);
process.exit(bad.length ? 1 : 0);
