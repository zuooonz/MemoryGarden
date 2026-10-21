// 3D 画面比对与性能取样用的“一天”：用录制工具的虚拟时间与固定种子，把某一天走到几个关键场景，隐藏界面层后只拍 3D 画面，并在每个场景取样性能。
// 由 tools/scenecheck.mjs 调用（SC_DAY＝第几天、SC_GFX＝画面档位 3 精美／1 流畅）；每个场景存一张 <名字>.png，性能写进 perf.json。
import fs from 'node:fs';
import path from 'node:path';
import { player } from '../video/play.mjs';

const DAY = +(process.env.SC_DAY || 1), GFX = +(process.env.SC_GFX || 3);
export const meta = { day: DAY, audioSec: 20, sr: 8000, save: { day: DAY - 1, best: [], persist: null, snap: [] }, settings: { voice: false, gfx: GFX } };   // 关配音：配音解码是真实异步，会让剧情时序有几帧偏差；声音用不上，只留很短的离线缓冲
// 俯视的四个时段（分钟）：清晨、白天、傍晚、夜里——用 __mg.time 固定画面时间（只改光影，不动规则）
const TIMES = [['1morning', 390], ['2noon', 720], ['3dusk', 1080], ['4night', 1230]];
const CENTER = { x: 0, z: 2 }, OVER = 100;   // 和游戏布置阶段的俯视一样（flow.js：电脑上看 (0,0,2)、距离 100）

export default async (api) => {
  const P = player(api), perf = {};
  // 只拍 3D：界面层全部隐藏（保留画布与四周暗角——暗角也是“夜里看不看得清”的一部分）；拍完恢复，免得影响后面的流程
  const hideUi = (on) => api.js(`(()=>{let s=document.getElementById('__sc'); if(${on}){ if(!s){s=document.createElement('style');s.id='__sc';document.head.appendChild(s);} s.textContent='body>*:not(#view):not(#vignette){visibility:hidden!important}'; } else s?.remove(); return 1})()`);
  // 摆镜头 → 走 1 帧让画面按新镜头画一遍 → 截图 → 取样 30 帧性能（取样会推进世界，所以放在截图之后）
  const shoot = async (name, camJs, settle = 0) => {
    if (settle) await api.skip(settle);
    await api.js(`${camJs}; 1`); await api.skip(1 / 30);
    await hideUi(true); await api.still(name); await hideUi(false);
    perf[name] = await api.js(`__mg.perfSample(30)`);
    api.log(name);
  };
  const over = (d = OVER, c = CENTER) => `__mg.shotCam(${JSON.stringify(c)}, ${d})`;

  await api.skip(9.5);   // 标题画面：等开场镜头（飞入）走完再操作
  await api.js(`document.querySelector('#bGo').click()`);
  if (!(await api.until(`document.querySelector('#bPlan')`, 30, { rec: false }))) throw new Error('等不到当天介绍');
  await api.js(`document.querySelector('#bPlan').click()`); await api.skip(4);   // 镜头从标题飞到俯视（约 2.6 秒）＋拉远
  // 布置阶段：四个时段的俯视（这一天的修路、改了样子的地方、雾都在画面里）
  for (const [nm, t] of TIMES) { await api.js(`__mg.time(${t})`); await shoot(`d${DAY}_${nm}`, over(), 2); }   // 2 秒：雾、灯光的渐变走完
  // 雨：布置阶段直接把雨打开、固定时刻与镜头（10-06：原来真玩到下雨、镜头跟着他——规则一改他走到别处，这张图和性能都跟着变，检查天天误报）
  if (DAY === 2 || DAY === 7) { await api.js(`__mg.time(900); __mg.sim.raining = true; __mg.sim.h.rain(true)`); await shoot(`d${DAY}_rain`, over(60), 4); await api.js(`__mg.sim.raining = false; __mg.sim.h.rain(false)`); }   // 4 秒：雨的压色渐变走一段
  await api.js(`__mg.time(null)`);
  if (DAY === 1) {
    // 一个路口有车经过：等某辆车开到路口（连着 3 条以上路、没起雾的路口）中心附近，镜头顺着路看过去
    const near = `(()=>{const g=__mg.graph, fog=new Set(__mg.mistState().filter(m=>m.t>0).map(m=>m.i)); for(const c of __mg.cars.list){const p=c.g.position; for(let i=0;i<g.adj.length;i++){ if(g.adj[i].length>=3 && !fog.has(i) && \
Math.hypot(g.pos[i].x-p.x,g.pos[i].z-p.z)<1.2) return {x:g.pos[i].x,z:g.pos[i].z}; }} return null})()`;
      
    if (!(await api.until(`${near}`, 60, { rec: false }))) throw new Error('60 秒里没有车开到没起雾的路口');
    await shoot(`d${DAY}_car`, `__mg.shotCam(${near}, 18)`);
  }
  if (DAY === 3) {
    // 要真玩到当天的那个时刻：开始一天，镜头外自动操作（犹豫时刻、小关卡都按“答对”处理）
    await api.js(`document.querySelector('#startBtn').click()`); await api.skip(0.5);
  }
  if (DAY === 3) {
    // 健步走：队伍走起来以后，镜头对着队伍的中心
    await P.autoUntil(`__mg.sim.e?.leg==='hike'`, { max: 900 });
    await api.skip(4);
    await shoot(`d${DAY}_hike`, `(()=>{const v=__mg.crowdPos().filter(p=>p[2]); const e=__mg.elderPos(); const n=v.length+1; __mg.shotCam({x:(v.reduce((a,p)=>a+p[0],0)+e.x)/n, z:(v.reduce((a,p)=>a+p[1],0)+e.z)/n}, 16, 0.4)})()`);
    // 接孙女：孙女跑出来、跟着他往家走
    await P.autoUntil(`__mg.kidState().vis && __mg.sim.e?.mode==='walk'`, { max: 900 });
    await api.skip(3);
    await shoot(`d${DAY}_kid`, `__mg.shotCam(__mg.elderPos(), 12, -0.5)`);
  }
  fs.writeFileSync(path.join(api.outDir, 'perf.json'), JSON.stringify(perf));
};
