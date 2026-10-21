// 看得清他（10-10）：由 tools/elderlook.mjs 调用。布置阶段把爷爷摆到街角、镜头按游戏里走路时的远近（电脑 52）对着他，
// 按几个时段与天气各拍三张：A 正常画面、B 把他藏起来（他身后的背景）、C 把他涂成纯品红（得到他身上的像素位置，不受光照影响）。
// EL_DAY＝第几天、SC_GFX＝画面档位；场景表见 SCENES（与 tools/elderlook.mjs 共用名字）。
import fs from 'node:fs';
import path from 'node:path';

const DAY = +(process.env.EL_DAY || 4), GFX = +(process.env.SC_GFX || 3);
export const meta = { day: DAY, audioSec: 20, sr: 8000, save: { day: DAY - 1, best: [], persist: null, snap: [] }, settings: { voice: false, gfx: GFX } };
// [名字, 画面时间（分钟）, 下雨, 他站的路口起浓雾, 镜头距离, 站在路口靠镜头一侧（false：远侧，被雾片挡在后面）]
export const SCENES = [
  ['noon', 720, false, false, 52, true],
  ['dusk', 1080, false, false, 52, true],
  ['night', 1230, false, false, 52, true],
  ['nightNear', 1230, false, false, 34, true],
  ['rainFog', 900, true, true, 52, true],
  ['rainFogBack', 900, true, true, 52, false],   // 雾片在他前面：最容易“只剩淡影”
  ['rainNight', 1200, true, true, 52, false],
];

export default async (api) => {
  const out = {};
  const hideUi = (on) => api.js(`(()=>{let s=document.getElementById('__el'); if(${on}){ if(!s){s=document.createElement('style');s.id='__el';document.head.appendChild(s);} s.textContent='body>*:not(#view):not(#vignette){visibility:hidden!important}'; } else s?.remove(); return 1})()`);
  await api.skip(9.5);
  await api.js(`document.querySelector('#bGo').click()`);
  if (!(await api.until(`document.querySelector('#bPlan')`, 30, { rec: false }))) throw new Error('等不到当天介绍');
  await api.js(`document.querySelector('#bPlan').click()`); await api.skip(4);
  // 选一个有雾片的三岔以上路口，他站在路口斜角的人行道上（能站人的点）：靠镜头一侧（z 大）与远侧各一个
  const spots = await api.js(`(()=>{const g=__mg.graph, ids=__mg.mistState().map(m=>m.i); for(const i of ids){ if(g.adj[i].length<3) continue; const p=g.pos[i]; for(const dx of [2,-2]) if(__mg.walkable(p.x+dx,p.z+2).stand && \
__mg.walkable(p.x+dx,p.z-2).stand) return {front:{i, x:p.x+dx, z:p.z+2}, back:{i, x:p.x+dx, z:p.z-2}}; } return null})()`);
    
  if (!spots) throw new Error('找不到有雾片的路口');
  for (const [nm, t, rain, fog, dist, front] of SCENES) {
    const spot = front ? spots.front : spots.back;
    const pin = (look) => api.js(`__mg.elderPin(${JSON.stringify(spot)}, '${look}'); 1`);   // 每次渲染前把他钉在这里（布置阶段他本不在街上；只改画面，不动规则）
    // 他站的路口：浓雾或无雾——布置阶段不按规则重算雾，手动设；浓雾按游戏里他所在路口的样子设 0.55（main.js：他站着的路口雾淡到 0.55）
    await api.js(`__mg.time(${t}); __mg.sim.raining=${rain}; __mg.sim.h.rain(${rain}); __mg.setMist(${spot.i}, ${fog ? 0.55 : 0}); __mg.shotCam({x:${spot.x},y:1.2,z:${spot.z}}, ${dist}); 1`);
    await pin('normal');
    await api.skip(rain ? 5 : 2.5);   // 雨的压色、雾、灯光渐变走完
    await hideUi(true);
    for (const [look, tag] of [['normal', 'A'], ['hide', 'B'], ['mask', 'C']]) { await pin(look); await api.skip(1 / 30); await api.still(`${nm}_${tag}`); }
    await pin('normal'); await hideUi(false);
    out[nm] = await api.js(`__mg.mistState().find(m=>m.i===${spot.i})`);
    api.log(nm);
  }
  await api.js(`__mg.elderPin(null); __mg.setMist(${spots.front.i}, 0); 1`);
  await api.js(`__mg.sim.raining=false; __mg.sim.h.rain(false); __mg.time(null); 1`);
  fs.writeFileSync(path.join(api.outDir, 'scenes.json'), JSON.stringify({ spots, mist: out }));
};
