// 设置组合检查：屏幕尺寸 × 字号（3 档）× 提示文字（3 档），在各种界面状态下查“文字被截断、元素出框、两块重叠、窗口横向溢出”。
// 用法：node tools/settingscheck.mjs [尺寸列表]   默认 1440x900,1024x768,390x844,360x740
// 输出：每个问题列出在哪些组合出现（f=字号档，t=提示档）。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SIZES = (process.argv[2] || '1440x900,1024x768,390x844,360x740').split(',');
const here = path.dirname(new URL(import.meta.url).pathname);
const probe = (font, tips) => `
const sleep=ms=>new Promise(r=>setTimeout(r,ms)); const bad=new Set();
const vis=e=>e&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&+getComputedStyle(e).opacity>0.05;
const name=e=>e.id?'#'+e.id:(e.className&&typeof e.className==='string'?'.'+e.className.trim().split(/\\s+/)[0]:e.tagName.toLowerCase())+(e.textContent.trim()?'「'+e.textContent.trim().slice(0,8)+'」':'');
// 容器里：每个可见子元素都在容器框内；文字不被截断
function inside(root, where){
  if(!vis(root)) return; const R=root.getBoundingClientRect(), scrollY=root.scrollHeight>root.clientHeight+2&&/auto|scroll/.test(getComputedStyle(root).overflowY);   // 可上下滚动的容器：只查左右出框
  if(R.left<-1||R.top<-1||R.right>innerWidth+1||R.bottom>innerHeight+1) bad.add(where+' '+name(root)+' 出屏');
  for(const e of root.querySelectorAll('*')){
    if(!vis(e)||e.closest('svg')&&e.tagName!=='svg') continue;
    const r=e.getBoundingClientRect(); if(r.width<2||r.height<2) continue;
    if(r.left<R.left-1.5||r.right>R.right+1.5||(!scrollY&&(r.top<R.top-1.5||r.bottom>R.bottom+1.5))) bad.add(where+' '+name(e)+' 出框');
    const c=getComputedStyle(e); if(e.children.length===0&&e.textContent.trim()&&(c.overflow==='hidden'||c.textOverflow==='ellipsis'||c.whiteSpace==='nowrap')&&(e.scrollWidth>e.clientWidth+1||e.scrollHeight>e.clientHeight+2)&&e.clientWidth>0) bad.add(where+' '+name(e)+' 文字截断');
  }
}
const overlap=(a,b)=>{ if(!vis(a)||!vis(b)) return false; const p=a.getBoundingClientRect(), q=b.getBoundingClientRect(); return p.left<q.right-1&&q.left<p.right-1&&p.top<q.bottom-1&&q.top<p.bottom-1; };
const top=(w)=>{ inside(document.querySelector('#gp'),w); inside(document.querySelector('#hudR'),w); inside(document.querySelector('#topSheet'),w); inside(document.querySelector('#dock'),w);
  if(overlap(document.querySelector('#gp'),document.querySelector('#hudR'))) bad.add(w+' 左上与右上重叠');
  if(overlap(document.querySelector('#topSheet'),document.querySelector('#hudR'))) bad.add(w+' 下方卡片与右上重叠');
  const b=[...document.querySelectorAll('#gpStats span')].map(e=>e.getBoundingClientRect()); if(b.length===2&&(Math.abs(b[0].width-b[1].width)>1||Math.abs(b[0].height-b[1].height)>1||b.some(r=>r.height>b[0].width*0.6))) bad.add(w+' 左上两个胶囊不一致'); };
const until=async(f,ms=8000)=>{ for(let i=0;i<ms/50&&!f();i++) await sleep(50); };   // 等到界面出来再点（固定等待在机器忙时会点空）
await until(()=>document.querySelector('#bGo')); document.querySelector('#bGo').click(); await until(()=>document.querySelector('#bPlan')); document.querySelector('#bPlan')?.click(); await until(()=>document.querySelector('#gpHead')&&document.querySelector('#cards .card')); await sleep(700);
top('早上'); document.querySelector('#gpHead').click(); await sleep(250); top('点左上'); document.querySelector('#menuBtn').click(); await sleep(250); top('点菜单'); document.querySelector('#gpHead').click(); await sleep(250); top('再点左上');
const dock=document.querySelector('#dock'); dock.classList.add('live'); document.querySelector('#startBtn').style.display='none'; document.querySelector('#actions')?.classList.remove('hidden'); await sleep(250); top('白天收起');
document.querySelector('#bagBtn').click(); await sleep(250); top('白天打开道具箱'); if(overlap(document.querySelector('#dock'),document.querySelector('#hudR'))) bad.add('白天 道具箱与右上重叠');
dock.classList.remove('live','open'); document.querySelector('#startBtn').style.display='';
// 窗口：不横向溢出、按钮在框内
const sheet=async(w,fn)=>{ fn(); await sleep(400); const s=document.querySelector('#sheet'); if(s.scrollWidth>s.clientWidth+1) bad.add(w+' 横向溢出'); inside(s,w); document.querySelector('#modal').classList.add('hidden'); };
await sheet('手册',()=>document.querySelector('#bookBtn').click());
await sheet('设置',()=>document.querySelector('#gearBtn').click());
for(const [w,fn] of [['修闹钟',()=>__mg.clockG()],['摆棋',()=>__mg.chessG()],['菜摊',()=>__mg.recall()]]){ fn(); await sleep(400); const g=document.querySelector('#game'); if(g.scrollWidth>g.clientWidth+1) bad.add(w+' 横向溢出'); inside(g,w); g.classList.add('hidden'); }
return [...bad];`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-set-'));
const run = (sz, font, tips) => new Promise(res => {
  const [w, h] = sz.split('x'); const f = path.join(tmp, `${sz}-${font}-${tips}.json`);
  fs.writeFileSync(f, JSON.stringify([
    { js: `localStorage.setItem('mg-settings', JSON.stringify({font:${font},easy:false,vol:2,tips:${tips},gfx:2,voice:true,narr:false})); location.reload();`, wait: 2500 },
    { js: probe(font, tips) }]));
  let out = ''; const p = spawn('node', [path.join(here, 'shot.mjs'), w, h, f]);
  p.stdout.on('data', b => out += b); p.stderr.on('data', b => out += b);
  p.on('close', () => { const m = out.match(/^> (.*)$/m); res(m ? JSON.parse(m[1]) : ['没有结果 ' + out.slice(0, 150)]); });
});
const jobs = []; for (const sz of SIZES) for (const font of [1, 2, 3]) for (const tips of [1, 2, 3]) jobs.push([sz, font, tips]);
const issues = new Map(); let done = 0;
await Promise.all([0, 1].map(async () => { while (jobs.length) { const [sz, f, t] = jobs.shift(); for (const b of await run(sz, f, t)) { const k = sz + ' ' + b; if (!issues.has(k)) issues.set(k, []); issues.get(k).push(`f${f}t${t}`); } process.stderr.write(`\r${++done}`); } }));
fs.rmSync(tmp, { recursive: true, force: true });
console.log('');
if (!issues.size) console.log('全部组合没有发现问题');
for (const [k, v] of [...issues].sort()) console.log(`${k}  [${v.length === 9 ? '所有设置' : v.join(' ')}]`);
