// 每天缩略图：7 天各按真实速度（1 倍速）玩一遍，镜头跟着爷爷（__mg.follow），每 2 秒截一帧，拼成一张网格图——部署前人工逐天看“动得对不对”。
// 用法（在 Game/ 下）：node tools/daysheet.mjs <输出目录> [天，如 1,3]
//   输出：<目录>/day1.jpg……day7.jpg（每格左上角标着第几天、钟点、他在干什么），<目录>/index.txt（每格对应的钟点、状态、画面里与规则层里他的位置，按格子顺序）
//   SHEET_KEEP=1 另存原始帧到 <目录>/frames-f<天>/
//   环境变量：SHEET_EVERY 每几秒一帧（默认 2）、SHEET_ZOOM 镜头距离（默认 26，越小越近）、SHEET_COLS 每行几格（默认 8）
// 只截“画面在走”的时候：犹豫面板、小关卡、地图操作开着时不截（这些是界面，归界面截图管），由自动玩家照常处理（答对、先等再提示）。
// 一次只开 1 个无头浏览器、用显卡；整天都录（真实速度一天只有 1.5—5 分钟画面：在家时游戏自己快进），一周约 3.5 分钟。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { record } from './video/record.mjs';
const here = path.dirname(new URL(import.meta.url).pathname);
const out = process.argv[2];
if (!out) { console.log('用法：node tools/daysheet.mjs <输出目录> [天，如 1,3]'); process.exit(2); }
const days = (process.argv[3] || '1,2,3,4,5,6,7').split(',').map(Number);
const EVERY = +(process.env.SHEET_EVERY || 2), ZOOM = +(process.env.SHEET_ZOOM || 26), COLS = +(process.env.SHEET_COLS || 8);
fs.mkdirSync(out, { recursive: true });
// 构建过期就先重新构建（和 walkcheck 一样）
{ const dist = path.join(here, '../dist/index.html'), src = path.join(here, '../src'); const newest = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((m, f) => Math.max(m, f.isDirectory() ? newest(path.join(d, f.name)) : fs.statSync(path.join(d, f.name)).mtimeMs), 0);
  if (!fs.existsSync(dist) || newest(src) > fs.statSync(dist).mtimeMs) { console.log('源码比构建新：先重新构建'); spawnSync('node', [path.join(here, '../build.mjs')], { stdio: 'ignore' }); } }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-sheet-'));
const scene = path.join(tmp, 'sheet.mjs');
fs.writeFileSync(scene, `import fs from 'node:fs';
import { player } from '${path.join(here, 'video/play.mjs')}';
const D = +process.env.SHEET_DAY, DIR = process.env.SHEET_FRAMES;
export const meta = { day: D, audioSec: 1500, sr: 8000, save: { day: D - 1, best: [{ stars: 3 }], persist: null, snap: [] }, settings: { voice: true } };
export default async (api) => {
  const P = player(api);
  await P.openDay({ intro: 0.2, cursor: false });
  // 每格的标签：画进页面左上角再截图（缩小后 HUD 上的钟看不清）
  await api.js(\`(()=>{const d=document.createElement('div'); d.id='__sheetTag'; d.style.cssText='position:fixed;left:10px;top:10px;z-index:99999;padding:4px 14px;border-radius:8px;background:rgba(20,22,30,.72);color:#fff;\
font:700 40px/1.3 sans-serif;pointer-events:none'; document.body.appendChild(d); return 1})()\`);
  await api.click('#startBtn', { move: 0.05 });
  let n = 0; const idx = [];
  const grab = async () => {
    const tag = await api.js(\`(()=>{const S=__mg.sim, e=S.e||{}, t=Math.round(S.time||0), hm=String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0');
      const what = e.mode==='home' ? '在家' : e.leg==='hike' ? '健步走' : e.mode==='task' ? '办事' : e.mode==='stuck' ? '慌了' : e.lost ? '迷路' : e.mode==='hesitate' ? '犹豫' : S.goWhere ? S.goWhere() : (e.mode||'');
      const s = '第'+(S.dayIdx+1)+'天 '+hm+' '+what+(e.escort?' ·陪着':''); document.querySelector('#__sheetTag').textContent=s; const p=__mg.elderPos(); return s+' '+(e.mode||'')+' 画面('+p.x.toFixed(1)+','+p.z.toFixed(1)+') 规则('+(e.pos?e.pos.x.toFixed(1)+','+e.pos.z.toFixed(1):'')+')'})()\`);
    if (!(await api.js(\`__mg.sim.phase==='live'\`))) return;
    // 镜头对准画面里的他：__mg.follow 跟的是缓动的镜头，他常在画面边上；截图前把镜头移到他上方（__mg.center：保留游戏此刻的镜头角度——他被挡时镜头会换角度，缩略图要拍到玩家实际看到的），再走一帧让画面更新。
    // 两次截图之间镜头仍交还给游戏（__mg.follow），关卡、往事照常挪镜头
    await api.js(\`__mg.center(__mg.elderPos(), ${ZOOM})\`); await api.skip(1 / api.FPS);
    if (process.env.SHEET_KEEP) idx.push('  屏幕 爷爷头' + JSON.stringify(await api.js(\`__mg.proj(__mg.elderPos().setY(2.4))\`)) + ' 爷爷脚' + JSON.stringify(await api.js(\`__mg.proj(__mg.elderPos())\`)) + ' 看得见' + JSON.stringify(await api.js(\`__mg.sight().seen\`)));
    const r = await api.cdp('Page.captureScreenshot', { format: 'jpeg', quality: 80, optimizeForSpeed: true });
    fs.writeFileSync(DIR + '/f' + String(++n).padStart(4, '0') + '.jpg', Buffer.from(r.result.data, 'base64'));
    idx.push(n + ' ' + tag);
    await api.js(\`__mg.follow(${ZOOM})\`);
  };
  // 1 倍速分段快进：每 ${EVERY} 秒截一帧；途中的犹豫时刻、小关卡由自动玩家处理（那段时间不截）
  P.ffSpeed = 1; P.ffChunk = ${EVERY}; P.onChunk = grab; P.rounds = 200;
  await P.autoUntil("document.querySelector('#bNext') || document.querySelector('#bEnd')", { max: 1800 });
  fs.writeFileSync(DIR + '/index.txt', idx.join('\\n') + '\\n');
  console.log('END ' + JSON.stringify(await api.js("!!(document.querySelector('#bNext') || document.querySelector('#bEnd'))")));
};`);
const index = [];
let bad = 0; const t0 = Date.now();
for (const d of days) {
  const frames = path.join(tmp, 'f' + d); fs.mkdirSync(frames, { recursive: true });
  process.env.SHEET_DAY = String(d); process.env.SHEET_FRAMES = frames;
  const lines = [], orig = console.log; console.log = (...a) => lines.push(a.join(' '));
  let info = null, err = null; const t1 = Date.now();
  try { info = await record(scene, path.join(tmp, 'r' + d), path.resolve(here, '../dist/index.html'), { w: 1280, h: 720, dpr: 1 }); } catch (e) { err = e.message + (e.errors?.length ? '｜页面报错：' + e.errors.slice(0, 2).join('｜') : ''); }
  console.log = orig;
  const shots = fs.readdirSync(frames).filter(f => f.endsWith('.jpg')).length;
  if (shots) {
    const rows = Math.ceil(shots / COLS);
    const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(frames, 'f%04d.jpg'), '-vf', `scale=480:-2,tile=${COLS}x${rows}:padding=4:color=white`, '-frames:v', '1', '-q:v', '3', path.join(out, `day${d}.jpg`)], { encoding: 'utf8' });
    if (r.status) { bad++; console.log(`第 ${d} 天：拼图失败 ${r.stderr.slice(0, 300)}`); }
  }
  if (fs.existsSync(path.join(frames, 'index.txt'))) index.push(`第 ${d} 天（day${d}.jpg，每行 ${COLS} 格）`, fs.readFileSync(path.join(frames, 'index.txt'), 'utf8'));
  const ended = lines.some(l => l === 'END true');
  if (err || !ended) bad++;
  if (info?.errors?.length) { bad++; console.log(`第 ${d} 天：页面报错 ${info.errors.length} 条：${info.errors.slice(0, 3).join('｜').slice(0, 400)}`); }
  console.log(`第 ${d} 天：${shots} 格 → ${path.join(out, `day${d}.jpg`)}（用时 ${Math.round((Date.now() - t1) / 1000)} 秒）${err ? '｜没跑完：' + err.slice(0, 300) : !ended ? '｜没玩到结算' : ''}`);
}
fs.writeFileSync(path.join(out, 'index.txt'), index.join('\n'));
if (process.env.SHEET_KEEP) for (const d of fs.readdirSync(tmp).filter(x => /^f\d+$/.test(x))) fs.cpSync(path.join(tmp, d), path.join(out, 'frames-' + d), { recursive: true });   // SHEET_KEEP=1：留下原始帧（1280×720）细看
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n共用时 ${Math.round((Date.now() - t0) / 1000)} 秒${bad ? `，${bad} 处有问题` : ''}；逐天看 ${out}/day*.jpg`);
process.exit(bad ? 1 : 0);
