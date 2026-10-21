// 地基：统一移动入口——画面里所有会动的人都经这里一步一步走（Docs/地基方案.md 第三步）。
// 路点来自可行走地图（space.path／world.roadPath）：点上的 xing 不为 null，表示走到这一点要过街（交通规则在这里把关）。
// （不叫 cross：three.js 的三维向量自带 cross 方法，会被当成“要过街”——10-05 因此卡死过一次）
import * as THREE from 'three';

const _d = new THREE.Vector3();
// 动法（10-06 根治“越改问题越多”）：画面里的人只经这里挪位置，三条规矩对所有人一样——
//   1. 起步有加速（从站着到 sp 约 0.3 秒），不一下子窜出去；停下来几帧没走，速度归零
//   2. 只按调用者给的 sp 走，不许“落后多少就快多少”：要追就让被追的人等（见 actors 的 visualLag）
//   3. 默认朝向要去的方向（不横着挪）
// 检查：devtools 的“冲刺”“横移”“掉队”“不跟”
const ACCEL = 3.5;   // 每秒加到 sp 的几倍（按 sp 等比，倍速下一样快起步）
export function stepTo(person, target, sp, dt, face = true) {
  const p = person.root.position, d = _d.set(target.x - p.x, 0, target.z - p.z), len = d.length(), ud = person.root.userData;
  const now = performance.now(); if (!(now - (ud.mvAt || 0) < 200)) ud.mv = 0; ud.mvAt = now;   // 上次走是 0.2 秒以前：重新起步
  ud.mv = Math.min(sp, (ud.mv || 0) + sp * ACCEL * dt);
  const step = ud.mv * dt;
  if (face && len > 1e-4) person.face(target, dt);   // 转身很快（约 0.1 秒）；不做“先转身再走”——朝向还有别处在管时会互相拉住、人卡在原地（10-06 试过）
  if (len <= step || len < 1e-4) { p.x = target.x; p.z = target.z; return true; }
  p.addScaledVector(d, step / len); return false;
}
// 沿一串路点走（走到的点从队列里拿掉）。gate(点)：要过街时问一下，返回 false 就在路边等。
// 返回 'done'（没有路点了）、'waiting'（在等过街）、'moving'
// 过街让车（10-06 统一）：所有人沿人行网走都经过 stepAlong，要过街时默认问一下“这条斑马线上方有没有进了路口的车”——
// 原来只有爷爷问，邻居、队伍过街不让车（检查报过“车穿人”）。由 world 建好车以后设进来；也给沿足迹走的人用（roadClear）
let crossGate = null;
export function setCrossGate(g) { crossGate = g; }
export function roadClear(pt) { return !crossGate || crossGate.at(pt); }   // （at 里也会告诉车有人在等）   // 往 pt 走会不会踩进正在过车的路口
// 默认的过街问法：路口里正在过车就等；同时告诉车“有人在等着过”，后面的车先停在停车线前让人（不然一辆接一辆，人一直过不去）
const askCross = (pt) => { if (!crossGate) return true; crossGate.want?.(pt.xing); return crossGate.xing(pt.xing); };
export function stepAlong(person, q, sp, dt, { gate = askCross, face = true, near = 0.05 } = {}) {
  // 已经站在马路上的人：先走完，绝不在路中间等车（车会等路面上的人，人再等车就互相等死，10-06）
  while (q.length && Math.hypot(q[0].x - person.root.position.x, q[0].z - person.root.position.z) < near) q.shift();
  if (!q.length) return 'done';
  if (pushedBack(person, q, dt)) { q.length = 0; return 'done'; }
  if (gate && q[0].xing != null && !q[0].started && !crossGate?.onRoad?.(person.root.position) && !gate(q[0])) { person.root.userData.alAt = 0; return 'waiting'; }
  if (q[0].xing != null) { q[0].started = true; markCrossing(person.root.position, q[0]); }   // 已经上了斑马线就走完，不在路中间停
  const P = person.root.position, x0 = P.x, z0 = P.z, ud = person.root.userData;
  ud.alAt = performance.now(); ud.alX = x0; ud.alZ = z0; ud.alStep = (ud.mv || sp) * dt;   // 记下这一步从哪起、该走多远（pushedBack 下一帧对照）
  if (stepTo(person, q[0], sp, dt, face)) {
    q.shift();
    // 这一帧该走的还没走完：接着往下一个路点走（10-07 用户：人到路口一顿一顿——原来一帧最多走到下一个路点，剩下的距离丢了，路点密的地方走走停停）
    let left = (person.root.userData.mv || sp) * dt - Math.hypot(P.x - x0, P.z - z0);
    for (let k = 0; k < 6 && left > 1e-4 && q.length; k++) {
      if (gate && q[0].xing != null && !q[0].started && !crossGate?.onRoad?.(P) && !gate(q[0])) break;   // 要过街的点：照旧先问让行
      if (q[0].xing != null) { q[0].started = true; markCrossing(P, q[0]); }
      const dx = q[0].x - P.x, dz = q[0].z - P.z, l = Math.hypot(dx, dz);
      if (l <= left) { P.x = q[0].x; P.z = q[0].z; left -= l; q.shift(); }
      else { P.x += dx / l * left; P.z += dz / l * left; if (face) person.face(q[0], dt); left = 0; }
    }
  }
  return 'moving';
}

// 挤不过去就算到了（10-13 用户：开场刘师傅贴着爷爷原地迈腿）：终点被别人占着时，每帧往前迈一步、又被 separate 推回来，
// 人一直在原地走。规矩对所有沿路走的人一样：上一帧迈出的步子几乎全被推回去、连续 0.35 秒，且离终点不到 1.5，就停在当下。
const STUCK_T = 0.35, STUCK_NEAR = 1.5;
function pushedBack(person, q, dt) {
  const ud = person.root.userData, P = person.root.position;
  if (!(performance.now() - (ud.alAt || 0) < 200) || !ud.alStep) { ud.stuck = 0; return false; }   // 上一帧没在走：不算
  ud.stuck = Math.hypot(P.x - ud.alX, P.z - ud.alZ) < ud.alStep * 0.25 ? (ud.stuck || 0) + dt : 0;
  if (ud.stuck < STUCK_T) return false;
  let left = Math.hypot(q[0].x - P.x, q[0].z - P.z);
  for (let i = 1; i < q.length && left < STUCK_NEAR; i++) left += Math.hypot(q[i].x - q[i - 1].x, q[i].z - q[i - 1].z);
  if (left >= STUCK_NEAR) return false;
  ud.stuck = 0; ud.mv = 0; return true;
}
// 走到某人跟前：路线第一次走进离他 gap 的地方就截断（迎面说话的人停在一步开外，不走到他站的街角上和他挤在一起，也不从他身上穿过去走到对面）
export function stopShort(q, who, gap = 1.0) {
  if (!who || !q.length) return q;
  for (let i = 0; i < q.length; i++) {
    if (Math.hypot(q[i].x - who.x, q[i].z - who.z) >= gap) continue;
    if (i === 0) return q.slice(0, 1);
    if (q[i].xing != null) return q.slice(0, i);   // 这一段是过街：停在路这边，不停在马路中间
    const a = q[i - 1], b = q[i], dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz);
    let lo = 0, hi = 1; for (let k = 0; k < 14; k++) { const m = (lo + hi) / 2; if (Math.hypot(a.x + dx * m - who.x, a.z + dz * m - who.z) >= gap) lo = m; else hi = m; }   // 二分出这一段上恰好离他 gap 的点
    const end = b.clone ? b.clone() : { ...b }; end.x = a.x + dx * lo; end.z = a.z + dz * lo; end.xing = null;
    return L < 1e-4 ? q.slice(0, i) : [...q.slice(0, i), end];
  }
  return q;
}

// 人与人不重叠（地基 10-05）：每帧最后，把离得太近（< MIN）的两个人往分开的方向推——统一做，不逐对补特例。
// fixed 里的人（爷爷：画面跟着规则层走）不推，只推别人。推之前先看新位置能不能站（在可走的地方、不在任何实体里，space.canStand）：
// 不能就只推一半，再不能就不推——怎么推都不会把人推进墙或推出人行网。本来就不在网上的（屋里、广场外）不参与。
const MIN = 0.36;
// 在路边等着过街的人（这一帧标记，见 markWaiting）：推开时不把他推上马路——不然车停下让他、他又在等车，互相等（10-06）；其他人照常可推
const waiting = new WeakSet(), crossingNow = new WeakMap();
// 已经决定过街、正在过的人（这一帧标记）：脚还在路沿上也算在斑马线上——车据此不进路口（10-07：只按“在路面上”算，迈出第一步那一下车会开进来，人车撞上）
// to：正在往哪走（过的是哪条斑马线）——车据此只把“正在过这条斑马线”的人多算进路沿那一截（10-07：过旁边那条斑马线的人走到共用的街角，被算成踩上了车要开出去的斑马线，车急刹）
export function markCrossing(pos, to) { const l = to ? Math.hypot(to.x - pos.x, to.z - pos.z) : 0; crossingNow.set(pos, l > 1e-3 ? { x: (to.x - pos.x) / l, z: (to.z - pos.z) / l } : null); setTimeout(() => crossingNow.delete(pos), 300); }
export const isCrossing = (pos) => crossingNow.has(pos);
export const crossingDir = (pos) => crossingNow.get(pos) || null;
export function markWaiting(pos) { waiting.add(pos); setTimeout(() => waiting.delete(pos), 300); }
export function separate(people, fixed, space) {
  const on = people.map(p => space.isWalkable(p));
  // 先试偏 30° 推（10-13）：正对着走进一个站着的人时，正向推回去等于原地迈腿；带一点侧向，人就从旁边绕过去。推不动再试正推、±45°、±90°
  const tryMove = (p, dx, dz) => {
    for (const a of [0.5, 0, -0.5, 0.8, -0.8, 1.57, -1.57]) for (const k of [1, 0.5]) {
      const c = Math.cos(a), s = Math.sin(a), q = { x: p.x + (dx * c - dz * s) * k, z: p.z + (dx * s + dz * c) * k };
      if (space.canStand(q) && !(waiting.has(p) && space.onRoad(q) && !space.onRoad(p))) { p.x = q.x; p.z = q.z; return; }
    }
  };
  for (let it = 0; it < 3; it++) for (let i = 0; i < people.length; i++) for (let k = i + 1; k < people.length; k++) {   // 做 3 轮：三个人挤在一起时，推开后一对可能又把前一对推近
    const a = people[i], b = people[k]; if (!on[i] || !on[k]) continue;
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz); if (d >= MIN) continue;
    const ux = d > 1e-4 ? dx / d : 1, uz = d > 1e-4 ? dz / d : 0, push = MIN - d, fa = fixed.has(a), fb = fixed.has(b);
    if (fa && fb) continue;
    const ka = fa ? 0 : fb ? 1 : 0.5, kb = fb ? 0 : fa ? 1 : 0.5;
    if (ka) tryMove(a, -ux * push * ka, -uz * push * ka);
    if (kb) tryMove(b, ux * push * kb, uz * push * kb);
  }
}
