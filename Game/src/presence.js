// 人物出现、消失、换位置的统一入口（10-14 用户：瞬移要全局设计协调，并排查类似问题）。
// 规矩：画面里看得见的人，不能凭空出现、凭空消失、一下子跳到别处。只有这几种合规的方式，都经过这里：
//   door(p, on)        从门里走出来／走进门里（家、楼、邻居家门口；人本来就站在门口）——直接显隐，记一笔
//   appear(p) / vanish(p)  在路上出现／离开（陪同的你赶到、孙女跟上、熟人迎面过来、邻居的活动开始和结束）：0.5 秒淡入淡出；镜头外直接显隐
//   relocate(p, pos)   换位置：两头都在镜头外就直接搬；否则先淡出、搬过去、再淡入
//   sceneCut(fn)       换场：整屏暗下来（0.35 秒），fn 里摆人、摆镜头，再亮起来（一天收尾时把还在外面的他送回家）
// 检查：devtools 的动法检查在一天进行中逐帧看所有人——看得见的人一帧挪得比正常走路快很多（冲刺），或在镜头里显隐，
// 而最近 0.6 秒没经过这里（root.userData.presenceT），就报“瞬移”“凭空出现／消失”，没有按场景的豁免。
import * as THREE from 'three';
import { camera } from './core.js';

const fades = new Map();   // 每个正在淡入淡出的人：当前不透明度 k（0—1）、目标 to（0 或 1）、换下来的原材质 saved、临时副本 clones
const FADE = 0.5;
const _v = new THREE.Vector3();
const stamp = (root, how) => { root.userData.presenceT = performance.now(); root.userData.presenceHow = how; };

// 在不在镜头里（人身体中间那一点投到画面上，留一点边）
export function onScreen(pos) {
  _v.set(pos.x, (pos.y || 0) + 1, pos.z).project(camera);
  return _v.z < 1 && Math.abs(_v.x) < 1.08 && Math.abs(_v.y) < 1.08;
}

function setAlpha(root, k) {
  let f = fades.get(root);
  if (!f) {
    f = { k, to: k, saved: [], clones: [] };
    root.traverse(o => {
      if (!o.isMesh || !o.material || Array.isArray(o.material)) return;
      const m = o.material, c = m.clone();
      c.onBeforeCompile = m.onBeforeCompile; c.userData = m.userData; c.transparent = true; c.userData.baseOpacity = m.opacity;
      f.saved.push([o, m]); f.clones.push(c); o.material = c;
    });
    fades.set(root, f);
  }
  f.k = k;
  for (const c of f.clones) c.opacity = c.userData.baseOpacity * k;
}
function endFade(root) {
  const f = fades.get(root); if (!f) return;
  for (const [o, m] of f.saved) o.material = m;
  for (const c of f.clones) c.dispose();
  fades.delete(root);
}

export function door(p, on) { const r = p.root || p; if (r.visible !== on) { r.visible = on; stamp(r, 'door'); } }
export function appear(p) {
  const r = p.root || p; stamp(r, 'appear');
  if (r.visible && !fades.has(r)) return;
  r.visible = true;
  if (!onScreen(r.position)) { endFade(r); return; }
  setAlpha(r, fades.get(r)?.k ?? 0); fades.get(r).to = 1;
}
export function vanish(p) {
  const r = p.root || p; stamp(r, 'vanish');
  if (!r.visible) { endFade(r); return; }
  if (!onScreen(r.position)) { r.visible = false; endFade(r); return; }
  setAlpha(r, fades.get(r)?.k ?? 1); fades.get(r).to = 0;
}
export const fading = (p) => fades.has(p.root || p);
export const shownNow = (p) => { const r = p.root || p; return r.visible && fades.get(r)?.to !== 0; };   // 看得见、也不在淡出：调用方判断“要不要再显示一次”用
export function relocate(p, pos) {
  const r = p.root || p; stamp(r, 'relocate');
  if (!r.visible) { r.position.set(pos.x, 0, pos.z); return; }
  const go = () => { r.visible = false; r.position.set(pos.x, 0, pos.z); appear(r); };
  if (!onScreen(r.position)) { endFade(r); go(); return; }   // 原处在镜头外：搬过去，新位置在镜头里就淡入
  vanish(r); fades.get(r).then = go;
}
// 换场暗着的时候直接摆人（只在 sceneCut 的 fn 里用）
export function place(p, pos) { const r = p.root || p; endFade(r); r.position.set(pos.x, 0, pos.z); stamp(r, 'cut'); }
// 每帧（main.frame）：推进淡入淡出；淡出完就收起、换回原材质
export function updatePresence(dt) {
  for (const [r, f] of fades) {
    const k = f.k + Math.sign(f.to - f.k) * dt / FADE, done = f.to > f.k ? k >= 1 : k <= 0;
    if (!done) { setAlpha(r, k); r.userData.presenceT = performance.now(); continue; }
    if (f.to === 0) { r.visible = false; }
    const then = f.then; endFade(r); r.userData.presenceT = performance.now();
    then?.();
  }
}

// 换场：整屏暗下来 → fn() → 亮起来。暗着的时候做的事玩家看不到（这是唯一允许“直接搬人”的时机）
let cutEl = null;
export function sceneCut(fn, hold = 0.15) {
  cutEl ||= Object.assign(document.body.appendChild(document.createElement('div')), { id: 'sceneCut' });
  cutEl.classList.add('on');
  setTimeout(() => { try { fn(); } finally { setTimeout(() => cutEl.classList.remove('on'), hold * 1000); } }, 350);
}
