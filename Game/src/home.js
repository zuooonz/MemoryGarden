// 家里：屋内的位置与走动、在家时的动作和表情、桌上摆的支持、灶上的热气；出门去各处的门口路线。依赖由 main.js 通过 initHome 注入。
import { stepAlong } from './mover.js';
import * as THREE from 'three';
import { PLACES, nid } from './data.js';
import { elder, roadPath, space, town } from './world.js';
import { persist, run, scene, sim } from './core.js';
;
export let homeG;

export function initHome() {
  // ---------- 家里 ----------
  homeG = town.placeObjs.home;
}
export const homeNav = { key: null, queue: [], exiting: false };
          // 支持起作用时的短暂演出：{ spot, anim, t, happy }
export function homeWorld(key) { return homeG.position.clone().add(homeG.userData.spots[key]); }
export function insideHome(p) { const l = p.clone().sub(homeG.position); return Math.abs(l.x) < 3.5 && Math.abs(l.z) < 2.9; }
export function routeInHouse(from, to) {
  const q = [];
  if (!insideHome(from)) q.push(...roadPath(from, homeWorld('doorIn')).slice(1, -1), homeWorld('doorIn'));   // 地基（10-05）：走人行网回到家门（不斜穿、不走车道）
  q.push(to); return q;
}
export function moveAlong(q, sp, dt) { return stepAlong(elder, q, sp, dt); }   // 过街：进了路口的车先过   // 过街：进了路口的车先过
const MOMENT_SPOT = { meds: 'table', stove: 'stove', cook: 'table', steps: 'table', scam: 'phone', scamCall: 'phone', weekday: 'calendar' };
export function homeSpotKey() {
  if (sim.moment && MOMENT_SPOT[sim.moment.kind]) return MOMENT_SPOT[sim.moment.kind];
  if (run.homeAction) return run.homeAction.spot;
  const t = sim.time || 480;
  return t < 520 ? 'table' : t > 1000 ? 'stove' : 'sofa';
}
export function homeAnimFor(key) {
  if (run.homeAction && run.homeAction.spot === key) return run.homeAction.anim;
  const mk = sim.moment?.kind;
  if (mk === 'meds') return 'look';
  if (mk === 'stove' || key === 'stove') return mk === 'stove' ? 'phone' : 'cook';
  if (mk === 'cook') return 'cook';
  if (mk === 'scam' || mk === 'scamCall') return 'phone';
  if (mk === 'weekday') return 'look';
  return 'idle';
}
export function homeFaceFor(key) {
  const face = { table: new THREE.Vector3(0.5, 0, 0.2), stove: new THREE.Vector3(-2.5, 0, -2.6), phone: new THREE.Vector3(2.7, 0, -2.6), calendar: new THREE.Vector3(1.6, 0, -3), sofa: new THREE.Vector3(-1.7, 0, 3.2), fridge: new THREE.Vector3(-3, 0, 0.9) }[key];
  return face ? homeG.position.clone().add(face) : null;
}
export function renderHomeProps() {
  const props = homeG.userData.props;
  for (const [k, m] of Object.entries(props)) m.visible = persist.home.has(k);
}
// 冒热气／冒烟
const steam = [];
function puff(pos, color = 0xffffff, n = 1) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false }));
    m.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.2, 0, (Math.random() - 0.5) * 0.2)); scene.add(m);
    steam.push({ m, t: 0 });
  }
}
export function updateSteam(dt) {
  const pot = homeG.userData.pot.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.25, 0));
  const mk = sim.moment?.kind;
  const cooking = sim.phase === 'live' && ((sim.time > 1000 && sim.e.mode === 'home') || mk === 'stove' || mk === 'cook');
  if (cooking && Math.random() < dt * (mk === 'stove' ? 14 : 6)) puff(pot, mk === 'stove' ? 0xcfcfcf : 0xffffff);
  if (run.homeAction?.burnt && Math.random() < dt * 20) puff(pot, 0x444444);
  for (let i = steam.length - 1; i >= 0; i--) {
    const s0 = steam[i]; s0.t += dt; s0.m.position.y += dt * 1.2; s0.m.scale.setScalar(1 + s0.t * 1.5); s0.m.material.opacity = 0.7 * (1 - s0.t / 1.6);
    if (s0.t > 1.6) { scene.remove(s0.m); s0.m.geometry.dispose(); s0.m.material.dispose(); steam.splice(i, 1); }
  }
}

// 到了地方：沿路走到正门，再进去；离开时原路出来
export const visitNav = { key: null, queue: [], leaving: false, gate: 0 };
export function placeKeyAt(e) { const g = e.goal; if (!g) return null; const k = g.wrongPlace ? 'park' : g.place, list = sim.gates[k]; if (list?.length) return list.some(d => e.node === d.a || e.node === d.b) ? k : null; return e.node === nid(...PLACES[k].node) ? k : null; }   // 任一个门那段路两头的路口都算到了
export function visitQueue(key) {   // 地基（10-05）：走人行网接到这个门的门口一串点；进哪个门就走哪个门；接孙女在校门口等
  const u = town.placeObjs[key]?.userData; if (!u?.gates) return [];
  const d = sim.doorFor(sim.e), gi = d && d.key === key ? d.idx : 0, gt = u.gates[gi] || u.gates[0]; visitNav.gate = gi;
  const to = key === 'school' && sim.e?.goal?.task === 'pick' && gi === 0 ? u.door : gt.spot;
  return roadPath(elder.root.position, to).slice(1);
}
export function leaveQueue(key) {   // 从进来的那个门出去，走回门口那段人行线
  const dk = visitNav.gate ? key + visitNav.gate : key, en = space.doors[dk] && space.nodes[space.doors[dk].entry];
  return en ? roadPath(elder.root.position, new THREE.Vector3(en.x, 0, en.z)).slice(1) : [];
}

// 家里的短暂动作（支持起作用、灶上糊了、看老照片）：只由这里写 run.homeAction
export function setHomeAction(a) { run.homeAction = a; }
export function tickHomeAction(dt) { if (run.homeAction) { run.homeAction.t -= dt; if (run.homeAction.t <= 0) run.homeAction = null; } }
