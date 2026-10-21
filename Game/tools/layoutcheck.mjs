// 排版检查：在一组屏幕尺寸 × 界面状态下，检查“应该一致的地方是否一致”，不靠肉眼。
// 用法：node tools/layoutcheck.mjs            （默认 10 种尺寸；最多同时 2 个浏览器）
// 检查项（对应 Docs/界面与交互规范.md「对齐与适配」）：
//   边距：左上、右上、白天道具箱贴边距离相同（宽屏 14，窄屏 8）；左上与右上顶边对齐
//   同态同高：顶部两块同为展开或同为折叠时一样高；右上块展开高度不随左边折叠变化
//   同宽：宽屏下右上块展开、收起同宽，并与左上、白天收起的道具箱同宽（272）
//   不出界：浮层都在屏幕内；小关卡（修闹钟、摆棋、菜摊）一屏放下不用滚动（矮屏允许滚动，但按钮一直看得见）
//   宽度：右上块展开、收起同宽（手机上菜单在框里排成两行，框不变宽）
//   按钮：行动按钮（.primary/.ghost）不矮于 44
//   左上两个胶囊（办成、自己）展开、折叠时都同宽、不折行
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SIZES = (process.argv[2] || '1920x1080,1440x900,1280x800,1024x768,768x1024,430x932,390x844,360x740,844x390,667x375').split(',');
const here = path.dirname(new URL(import.meta.url).pathname);
const probe = `
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const R=s=>{const e=typeof s==='string'?document.querySelector(s):s; if(!e||!e.getClientRects().length) return null; const r=e.getBoundingClientRect(); return {l:Math.round(r.left),t:Math.round(r.top),w:Math.round(r.width),\
h:Math.round(r.height),r:Math.round(innerWidth-r.right),b:Math.round(innerHeight-r.bottom)}};
const bad=[]; const W=innerWidth, H=innerHeight, wide=W>760&&H>500, G=W>760?14:8, short=H<=500;   // 边距按宽度；折叠按宽或高
const near=(a,b,tol=1)=>Math.abs(a-b)<=tol;
const chk=(ok,msg)=>{ if(!ok) bad.push(msg); };
const until=async(f,ms=8000)=>{ for(let i=0;i<ms/50&&!f();i++) await sleep(50); };   // 等到界面出来再点（固定等待在机器忙时会点空）
await until(()=>document.querySelector('#bGo')); document.querySelector('#bGo').click(); await until(()=>document.querySelector('#bPlan')); document.querySelector('#bPlan')?.click(); await until(()=>document.querySelector('#gpHead')&&document.querySelector('#cards .card')); await sleep(600);
const gp=()=>R('#gp'), hud=()=>R('#hudR');
const tog=async(s)=>{ document.querySelector(s).click(); await sleep(250); };
const gpOpen=()=>!document.querySelector('#gp').classList.contains('collapsed'), hudOpen=()=>document.querySelector('#hudR').classList.contains('open');
// 四种折叠组合
const states=[]; for(let i=0;i<4;i++){ states.push({gp:gpOpen(),hud:hudOpen(),g:gp(),h:hud()}); if(i%2===0) await tog('#gpHead'); else await tog('#menuBtn'); }
const badges=async()=>{ const b=[...document.querySelectorAll('#gpStats span')].map(e=>e.getBoundingClientRect()); chk(b.length===2&&near(b[0].width,b[1].width)&&b.every(r=>r.height<=24),'左上两个胶囊不同宽或折行 '+b.map(r=>Math.round(r.width)+'x'+Math.round(r.height)).join('/')); };
const tips0=[...document.body.classList].find(c=>/^tips-/.test(c));
for(const t of ['tips-1','tips-2','tips-3']){ document.body.classList.remove('tips-1','tips-2','tips-3'); document.body.classList.add(t); for(let i=0;i<2;i++){ await sleep(100); await badges(); await tog('#gpHead'); } }   // 三档提示文字 × 展开／折叠
document.body.classList.remove('tips-1','tips-2','tips-3'); if(tips0) document.body.classList.add(tips0);
for(const s of states){
  chk(near(s.g.l,G),'左上边距 '+s.g.l+'≠'+G); chk(near(s.h.r,G),'右上边距 '+s.h.r+'≠'+G); chk(near(s.g.t,s.h.t),'顶边不齐 '+s.g.t+'/'+s.h.t);
  if(s.gp===s.hud) chk(near(s.g.h,s.h.h,2),'同态不同高（左'+(s.gp?'开':'折')+'右'+(s.hud?'开':'折')+'） '+s.g.h+'/'+s.h.h);
}
const hudOpenH=states.filter(s=>s.hud).map(s=>s.h.h); if(wide) chk(hudOpenH.every(h=>near(h,hudOpenH[0],2)),'右上展开高度随左边变化 '+hudOpenH.join('/'));
{ const ws=states.map(s=>s.h.w); chk(ws.every(w=>near(w,ws[0])),'右上块宽度随折叠变化 '+ws.join('/')); }
if(wide) chk(near(states[0].h.w,states[0].g.w),'右上块与左上不同宽 '+states[0].h.w+'/'+states[0].g.w);
// 白天收起的道具箱
const dock=document.querySelector('#dock'); dock.classList.add('live'); document.querySelector('#startBtn').style.display='none'; document.querySelector('#actions')?.classList.remove('hidden'); await sleep(250);
const d=R('#dock'); chk(near(d.l,G),'道具箱左边距 '+d.l+'≠'+G); chk(near(d.b,G,8)||d.b>=0,'道具箱出界'); if(wide) chk(near(d.w,R('#gp').w),'道具箱与左上不同宽 '+d.w+'/'+R('#gp').w);
dock.classList.remove('live'); document.querySelector('#startBtn').style.display='';
// 浮层都在屏幕内
for(const s of ['#gp','#hudR','#dock']){ const r=R(s); if(r) chk(r.l>=0&&r.t>=0&&r.r>=0&&r.b>=0, s+' 出界 '+JSON.stringify(r)); }
// 小关卡：一屏放下；行动按钮高度
for(const [name,fn] of [['修闹钟',()=>__mg.clockG()],['摆棋',()=>__mg.chessG()],['菜摊',()=>__mg.recall()]]){
  fn(); await sleep(350); const g=document.querySelector('#game');
  if(!short) chk(g.scrollHeight<=g.clientHeight+2, name+' 要滚动 '+g.scrollHeight+'>'+g.clientHeight);
  { const btn=[...g.querySelectorAll('.row:last-child .primary')].pop(); if(btn){ const br=btn.getBoundingClientRect(), gr2=g.getBoundingClientRect(); chk(br.bottom<=gr2.bottom+1&&br.top>=gr2.top, name+' 按钮看不见'); } }   // 矮屏允许滚动，但按钮固定在底部
  for(const b of g.querySelectorAll('.primary,.ghost')) if(b.getClientRects().length){ const h=b.getBoundingClientRect().height; chk(h>=44,name+' 按钮矮 '+b.textContent.trim()+' '+Math.round(h)); }
  const gr=R(g); chk(gr.l>=0&&gr.r>=0&&gr.t>=0&&gr.b>=0, name+' 出界');
  g.classList.add('hidden');
}
return {size:W+'x'+H, bad};`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-lay-'));
const run = (sz) => new Promise(res => {
  const [w, h] = sz.split('x'); const f = path.join(tmp, sz + '.json');
  fs.writeFileSync(f, JSON.stringify([{ js: probe }]));
  let out = ''; const p = spawn('node', [path.join(here, 'shot.mjs'), w, h, f]);
  p.stdout.on('data', b => out += b); p.stderr.on('data', b => out += b);
  p.on('close', () => { const m = out.match(/^> (.*)$/m); res(m ? JSON.parse(m[1]) : { size: sz, bad: ['没有结果：' + out.slice(0, 200)] }); });
});
const queue = [...SIZES]; let fails = 0;
await Promise.all([0, 1].map(async () => { while (queue.length) { const r = await run(queue.shift()); fails += r.bad.length; console.log(r.bad.length ? `✗ ${r.size}\n  - ${r.bad.join('\n  - ')}` : `✓ ${r.size}`); } }));
fs.rmSync(tmp, { recursive: true, force: true });
console.log(fails ? `共 ${fails} 处不一致` : '全部一致');
