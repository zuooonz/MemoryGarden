// 镜头：平移、缩放、从标题飞入的过渡；跟随他本人与“跟随视角”仍在 main.js（要用到人物与流程状态）。
import * as THREE from 'three';

import { camera, controls } from './core.js';
// pan：平移过渡；zoom：推拉过渡；fly：标题 → 小镇的飞入；follow：镜头自动跟着爷爷；drag：玩家手指／鼠标正按在画面上拖（main.js 按 controls 的 start／end 设）
export const cam = { pan: null, zoom: null, fly: null, follow: true, drag: false };
const lerp = (a, b, k) => a + (b - a) * k;

// 把镜头平移到 p（shift／shiftUp：让目标偏到画面一侧，给弹窗留位置）
export function focusOn(p, shift = 0, shiftUp = 0, distOverride = null) {
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize();
  const back = new THREE.Vector3().subVectors(camera.position, controls.target).setY(0).normalize();
  const dist = distOverride ?? camera.position.distanceTo(controls.target);
  const goal = p.clone().addScaledVector(right, shift * dist * 0.8).addScaledVector(back, shiftUp * dist * 0.8);
  const d = new THREE.Vector3().subVectors(goal, controls.target);
  d.y = 0; cam.pan = { from: controls.target.clone(), to: controls.target.clone().add(d), t: 0 };
}

export function zoomTo(dist) {
  const off = camera.position.clone().sub(controls.target);
  cam.zoom = { from: off.length(), to: dist, t: 0, dir: off.normalize() };
}

// 平移过渡：返回 true 表示这一帧在过渡中（跟随要让路）
export function stepPan(dt) {
  const t = cam.pan; if (!t) return false;
  t.t = Math.min(1, t.t + dt * 1.5);
  const k = 1 - Math.pow(1 - t.t, 3);
  const delta = t.from.clone().lerp(t.to, k).sub(controls.target);
  controls.target.add(delta); camera.position.add(delta);
  if (t.t >= 1) cam.pan = null;
  return true;
}
export function stepFlyZoom(dt) {
  const f = cam.fly;
  if (f) {
    f.t = Math.min(1, f.t + dt / 2.6);
    const k = f.t < 0.5 ? 4 * f.t ** 3 : 1 - Math.pow(-2 * f.t + 2, 3) / 2;
    controls.target.lerpVectors(f.fromTgt, f.toTgt, k);
    camera.position.lerpVectors(f.fromPos, f.toPos, k);
    if (f.t >= 1) { cam.fly = null; controls.maxPolarAngle = 1.15; }
  }
  const z = cam.zoom;
  if (z) {
    z.t = Math.min(1, z.t + dt * 1.2);
    const k = 1 - Math.pow(1 - z.t, 3);
    camera.position.copy(controls.target).addScaledVector(z.dir, lerp(z.from, z.to, k));
    if (z.t >= 1) cam.zoom = null;
  }
}

// 看不看得见他（10-08 画面可读性）：从镜头往他身上三个高度各连一条线，数没被挡住的有几条（0—1）。
// 挡的只算看得见、不透明的东西（房子、树冠、亭子顶、菜摊棚；淡出的屋顶、雾片不算）。镜头调整和检查（devtools 看不见他）共用这一个口径
const ray = new THREE.Raycaster(), _p = new THREE.Vector3(), _d = new THREE.Vector3(), _hit = new THREE.Vector3();
const shown = (o) => { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; };
const solid = (m) => { const ms = Array.isArray(m) ? m : [m]; return ms.some(x => x && x.visible !== false && !(x.transparent && x.opacity < 0.9)); };
// 10-14 手机卡顿：小镇的房子、树冠合并成几个大网格（最大 7000 多个三角形），射线要逐个三角形试，一次 seenFrom 约 2 毫秒（手机上 8—11 毫秒），
// 找角度时一帧试好几次就卡一下。大网格按地面 4×4 的格子把三角形分好（建一次；网格挪了才重建），射线只试经过的格子里的三角形，结果与逐个试相同
const CELL = 4, BIG = 400, grids = new WeakMap(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
function gridOf(mesh) {
  let g = grids.get(mesh);
  if (g && (g.moving || g.mat.equals(mesh.matrixWorld))) return g;
  if (g) { g.moving = true; return g; }   // 建好以后又挪过（开门、晃动的东西）：以后都按普通网格逐个试，不再反复重建
  const pos = mesh.geometry.attributes.position, idx = mesh.geometry.index, n = (idx ? idx.count : pos.count) / 3, tri = new Float32Array(n * 9), cells = new Map();
  for (let i = 0; i < n; i++) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let k = 0; k < 3; k++) {
      _a.fromBufferAttribute(pos, idx ? idx.getX(i * 3 + k) : i * 3 + k).applyMatrix4(mesh.matrixWorld); _a.toArray(tri, i * 9 + k * 3);
      x0 = Math.min(x0, _a.x); x1 = Math.max(x1, _a.x); z0 = Math.min(z0, _a.z); z1 = Math.max(z1, _a.z);
    }
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
      const key = cx * 65536 + cz; let l = cells.get(key); if (!l) cells.set(key, l = []); l.push(i);
    }
  }
  g = { tri, cells, mat: mesh.matrixWorld.clone(), seen: new Uint32Array(n), stamp: 0 }; grids.set(mesh, g);
  return g;
}
// 射线（ray，长 far）有没有碰到这个大网格：沿地面逐格走（Amanatides–Woo），每个三角形只试一次
function gridHit(mesh, far) {
  const g = gridOf(mesh), o = ray.ray.origin, d = ray.ray.direction, cull = !Array.isArray(mesh.material) && mesh.material.side === THREE.FrontSide;
  if (++g.stamp === 0xffffffff) { g.seen.fill(0); g.stamp = 1; }
  let cx = Math.floor(o.x / CELL), cz = Math.floor(o.z / CELL);
  const ex = Math.floor((o.x + d.x * far) / CELL), ez = Math.floor((o.z + d.z * far) / CELL);
  const sx = Math.sign(d.x), sz = Math.sign(d.z);
  const tdx = sx ? CELL / Math.abs(d.x) : Infinity, tdz = sz ? CELL / Math.abs(d.z) : Infinity;
  let tx = sx ? ((sx > 0 ? cx + 1 : cx) * CELL - o.x) / d.x : Infinity, tz = sz ? ((sz > 0 ? cz + 1 : cz) * CELL - o.z) / d.z : Infinity;
  for (let step = 0; step < 4096; step++) {
    const l = g.cells.get(cx * 65536 + cz);
    if (l) for (const i of l) {
      if (g.seen[i] === g.stamp) continue; g.seen[i] = g.stamp;
      const b = i * 9; _a.fromArray(g.tri, b); _b.fromArray(g.tri, b + 3); _c.fromArray(g.tri, b + 6);
      if (ray.ray.intersectTriangle(_a, _b, _c, cull, _hit) && _hit.distanceTo(o) <= far) return true;
    }
    if (cx === ex && cz === ez) break;
    if (tx < tz) { cx += sx; tx += tdx; } else { cz += sz; tz += tdz; }
  }
  return false;
}
// 挡得住视线的网格（看得见、不透明）：大网格走格子，小的照常逐个试
function blocked(roots, far) {
  let hit = false;
  const visit = (o) => {
    if (hit || !o.visible) return;
    if (o.isMesh && solid(o.material) && o.layers.test(ray.layers)) {
      const g = o.geometry, n = (g.index ? g.index.count : g.attributes.position?.count || 0) / 3;
      if (n > BIG && !o.isInstancedMesh && !o.isSkinnedMesh && !o.morphTargetInfluences && !gridOf(o).moving) hit = gridHit(o, far);
      else { _hits.length = 0; o.raycast(ray, _hits); hit = _hits.length > 0; }
      if (hit) return;
    }
    for (const c of o.children) visit(c);
  };
  for (const r of roots) if (shown(r)) visit(r);
  return hit;
}
const _hits = [];
export function seenFrom(eye, at, roots, hs = [0.5, 1.0, 1.5]) {
  let ok = 0;
  for (const h of hs) {
    _p.set(at.x, h, at.z); _d.subVectors(_p, eye); const dist = _d.length(); _d.divideScalar(dist);
    ray.set(eye, _d); ray.far = dist - 0.35; ray.near = 0;
    if (!blocked(roots, ray.far)) ok++;
  }
  return ok / hs.length;
}
// 原来的逐个三角形版本：只给检查对照（devtools sightCheck：两种算法结果一致、快了多少）
export function seenFromSlow(eye, at, roots, hs = [0.5, 1.0, 1.5]) {
  let ok = 0;
  for (const h of hs) {
    _p.set(at.x, h, at.z); _d.subVectors(_p, eye); const dist = _d.length(); _d.divideScalar(dist);
    ray.set(eye, _d); ray.far = dist - 0.35;
    if (!ray.intersectObjects(roots, true).some(x => x.object.isMesh && shown(x.object) && solid(x.object.material))) ok++;
  }
  return ok / hs.length;
}

// 他被挡住时换个角度看（10-08 用户定：调镜头，不淡化亭子、棚顶）：跟着他走的镜头，大半个身子被挡 1.5 秒以上（走路时路边的树、房子一晃而过不算），
// 就绕着他找一个看得见的角度——先只把镜头放低（不转方向，地图朝向不变，指路时东南西北不乱），不够再左右转一点；他走出来、原来的角度又看得见了，慢慢转回去。
// 玩家自己拖过镜头（cam.follow 关了）、正在平移／推拉／飞入时不动
const sph = new THREE.Spherical(), _off = new THREE.Vector3(), _eye = new THREE.Vector3();
// 候选角度：放低／抬高（弧度；贴着高房子走时要抬高、从上面越过屋顶看）× 左右转（弧度；站在房子背面屋檐下时只有从侧面、后面看得见，最多转约 125°，代价最高、最后才试）；代价＝转向算两倍（地图朝向尽量不变）
const TRY = [];
for (const dp of [0, 0.12, -0.12, 0.25, -0.25, 0.4, -0.35]) for (const dth of [0, 0.25, -0.25, 0.5, -0.5, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6, 2.2, -2.2]) if (dp || dth) TRY.push([dp, dth, Math.abs(dp) + 2 * Math.abs(dth)]);
TRY.sort((a, b) => a[2] - b[2]);
const view = { blockedT: 0, checkT: 0, goal: null, base: null, search: null };
export function keepInSight(dt, at, roots, on, walking = false) {
  const WAIT = walking ? 4 : 1.5;   // 走路时路过树下、房边只是一会儿：连续挡 4 秒才动镜头（10-08：原来 1.5 秒，走在行道树下镜头转来转去）
  if (cam.drag) return;   // 玩家正按着拖：找角度、转镜头都停住（10-14：原来按住时会被自动转走）；松手时拖动过就 releaseSight，只是点一下就接着原来的
  if (!cam.follow) { resetSight(); return; }   // 交出镜头（打开指路地图等）：转回原来的东南西北
  view.skip = !on ? '不该管' : cam.pan ? '平移' : cam.zoom ? '推拉' : cam.fly ? '飞入' : '';   // 检查用
  if (!on) { view.search = null; return; }   // 暂时不该管（弹窗、他进楼）：计时暂停，不清零
  if (cam.pan || cam.zoom || cam.fly) return;   // 镜头正在平移／推拉：先等它做完（计时不清零，推拉完接着算）
  _off.subVectors(camera.position, controls.target);
  if (view.search) {   // 分几帧找（每帧试 4 个，免得一帧里算太多卡一下）
    const S = view.search;
    for (let n = 0; n < 4 && S.i < TRY.length; n++, S.i++) {
      const [dp, dth] = TRY[S.i];
      sph.set(_off.length(), Math.max(controls.minPolarAngle, Math.min(controls.maxPolarAngle, S.s0.phi + dp)), S.s0.theta + dth); _eye.setFromSpherical(sph).add(controls.target);
      const v = seenFrom(_eye, at, roots);
      if (v > S.bestV) { S.bestV = v; S.best = new THREE.Vector3().setFromSpherical(sph); }
      if (v >= 1) { S.i = TRY.length; break; }   // 按代价从小到大试，第一个完全看得见的就是改动最小的
    }
    if (S.i >= TRY.length) { if (S.best) { view.base = S.base; view.goal = S.best; view.goalT = 0; } view.search = null; }
  } else if (!view.returning && (view.checkT -= dt) <= 0) {   // 正在转回原方向：先转完再说
    view.checkT = 0.25;
    if (view.base) {   // 换过角度：原来的角度又看得见了，就回去
      sph.setFromVector3(view.base); sph.radius = _off.length(); _eye.setFromSpherical(sph).add(controls.target);
      view.clearT = seenFrom(_eye, at, roots) >= 1 ? (view.clearT || 0) + 0.25 : 0;
      if (view.clearT >= 1.5) { view.clearT = 0; view.goal = new THREE.Vector3().setFromSpherical(sph); view.goalT = 0; view.returning = true; }   // 转回去：转完才清掉原方向（中途被打断——一天结束、打开地图——交出镜头时照样恢复）   // 原来的角度连续 1.5 秒都看得见才转回去（路边树、房子一晃而过不来回转）
      else if (seenFrom(camera.position, at, roots) < 0.67) view.blockedT += 0.25;   // 换过的角度也被挡了（他走动了）：再找一次
      if (view.blockedT >= WAIT) { view.blockedT = 0; view.search = { i: 0, s0: new THREE.Spherical().setFromVector3(view.base), base: view.base, best: null, bestV: seenFrom(camera.position, at, roots) }; }
    } else {
      const v0 = seenFrom(camera.position, at, roots);
      view.blockedT = v0 < 0.67 ? view.blockedT + 0.25 : 0;
      if (view.blockedT >= WAIT) { view.blockedT = 0; view.search = { i: 0, s0: new THREE.Spherical().setFromVector3(_off), base: view.base || _off.clone(), best: null, bestV: v0 }; }
    }
  }
  if (view.goal) {   // 慢慢转过去（约 1 秒），保持玩家当前的远近
    const a = new THREE.Spherical().setFromVector3(_off), b = new THREE.Spherical().setFromVector3(view.goal), k = 1 - Math.exp(-dt * 3);
    let dth = b.theta - a.theta; dth = Math.atan2(Math.sin(dth), Math.cos(dth));
    a.phi += (b.phi - a.phi) * k; a.theta += dth * k;
    camera.position.setFromSpherical(a).add(controls.target);
    view.goalT = (view.goalT || 0) + dt;
    if ((Math.abs(b.phi - a.phi) < 0.005 && Math.abs(dth) < 0.005) || view.goalT > 2.5) {
      if (view.returning) { sph.setFromVector3(view.base); sph.radius = _off.length(); camera.position.setFromSpherical(sph).add(controls.target); view.base = null; view.returning = false; }   // 转回完成（或到时）：正好落在原方向
      view.goal = null; view.goalT = 0;
      // 转完了还被挡（转的时候他挪了位置，比如走进亭子坐下）：马上重新找，不再等
      if (view.base && seenFrom(camera.position, at, roots) < 0.67) view.search = { i: 0, s0: new THREE.Spherical().setFromVector3(view.base), base: view.base, best: null, bestV: 0 };
    }   // 到了，或转了 2.5 秒（别的东西也在挪镜头）就停
  }
}
export const sightState = () => { const a = new THREE.Spherical().setFromVector3(_off.subVectors(camera.position, controls.target)); return { skip: view.skip, moved: !!view.base, turning: !!view.goal,
  searching: !!view.search, blockedT: +view.blockedT.toFixed(2), clearT: +(view.clearT || 0).toFixed(2), phi: +a.phi.toFixed(2), theta: +a.theta.toFixed(2), dist: +a.radius.toFixed(1) }; };
// 玩家自己拖过镜头：他拖到哪就停在哪，忘掉换角度前的方向（10-14：原来松手那一下镜头被拽回自动换角度前的方向，玩家刚转的白转了）
export function releaseSight() { view.base = null; view.goal = null; view.returning = false; view.blockedT = 0; view.clearT = 0; view.search = null; }
// 交出镜头时（打开指路地图等关掉了自动跟随）：先把为看见他转过的方向恢复成原来的——地图、指路要保持一贯的东南西北（10-08 界面截图比对发现指路地图跟着转了）
export function resetSight() {
  if (view.base) {
    const dir = view.base.clone().normalize(), len = camera.position.distanceTo(controls.target);
    camera.position.copy(controls.target).addScaledVector(dir, len);
    if (cam.zoom) cam.zoom.dir = dir.clone();   // 正在推拉：按原来的方向推
  }
  view.goal = null; view.base = null; view.returning = false; view.blockedT = 0; view.clearT = 0; view.search = null;
}
