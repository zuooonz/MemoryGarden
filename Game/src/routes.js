// 路线预览（他今天会怎么走、哪些路口可能犹豫）与他心里的地图（不熟的路口笼着薄雾）、路障、老电影院。依赖由 main.js 通过 initRoutes 注入。
import * as THREE from 'three';
import { canvasTexture, clearGroup, disposeTree } from './util.js';
import { SUPPORTS, NEIGHBORS } from './data.js';

import { graph, town, labelEls, elder } from './world.js';
import { scene, ui, bubblesEl, persist, sim } from './core.js';
import { settings } from './store.js';
;
export let routeGroup;
export let arrowGeo;
let mistTex;
export let mists;
let barriers;

export function initRoutes() {
  // ---------- 路线预览：他会怎么走、哪些路口可能犹豫 ----------
  routeGroup = new THREE.Group(); routeGroup.userData.tag = 'route'; scene.add(routeGroup);
  // 路线用折角箭头（10-13 画面重塑，用户选：原来的大圆点像贴纸、看不出方向）：尖朝 +z，按每段路的方向转
  { const sh = new THREE.Shape(); sh.moveTo(-0.38, -0.2); sh.lineTo(0, 0.18); sh.lineTo(0.38, -0.2); sh.lineTo(0.38, 0); sh.lineTo(0, 0.38); sh.lineTo(-0.38, 0); sh.closePath();
    arrowGeo = new THREE.ShapeGeometry(sh).scale(1.7, 1.7, 1).rotateX(-Math.PI / 2).rotateY(Math.PI); }

  // ---------- 他心里的地图：不熟悉的路口笼着薄雾（艺术表现） ----------
  // 一团一团的云絮（几个软圆叠起来，边缘不规则），比单个光斑更像雾
  mistTex = canvasTexture(128, 128, (x) => {
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const blob = (cx, cy, r, a) => { const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, `rgba(236,238,248,${a})`); g.addColorStop(0.6, `rgba(230,232,246,${a * 0.55})`); g.addColorStop(1, 'rgba(230,232,246,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); };
    blob(64, 64, 58, 0.9);
    for (let k = 0; k < 9; k++) { const a = rnd() * Math.PI * 2, d = 12 + rnd() * 22; blob(64 + Math.cos(a) * d, 64 + Math.sin(a) * d * 0.7, 18 + rnd() * 16, 0.55); }
  });
  const mistSprite = (op = 0) => new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex, transparent: true, opacity: op, depthWrite: false, fog: false }));
  mists = graph.pos.map((p, i) => {
    if (!graph.adj[i].length) return null;
    const sp = mistSprite();
    sp.position.set(p.x, 2.8, p.z); sp.scale.set(MIST_W, MIST_H, 1); sp.renderOrder = 2; scene.add(sp);
    // 旁边两缕，慢慢飘（散开时向外飞走）
    sp.userData.wisps = [0, 1].map(k => { const w = mistSprite(); w.renderOrder = 2; w.userData.ph = i * 1.7 + k * 2.4; w.userData.dir = k ? -1 : 1; scene.add(w); return w; });
    sp.userData.home = sp.position.clone();
    sp.userData.target = 0; sp.userData.puff = 0; sp.userData.flash = 0; return sp;
  });

  barriers = new THREE.Group(); scene.add(barriers);
}
export const riskTags = [];
// 路线颜色按当天第几趟出门取（10-13：原来按第几件事取，两趟常拿到橙和紫；紫在白天发灰、夜里和雾片撞色）：第一趟赭橙、第二趟湖蓝（一暖一冷），备用青绿、芥黄
export const ROUTE_COLORS = [0xe07a4a, 0x3f7fc0, 0x3f9a84, 0xd6a53a];
export const routeColor = (g) => ROUTE_COLORS[Math.max(0, sim.goals.filter(x => x.kind === 'trip').indexOf(g)) % ROUTE_COLORS.length];
const ROAD = new THREE.Color(0x8c8a92);   // 箭头走进雾里时淡向路面色
function tracePath(from, to) {
  const p = [from]; let c = from, prev = null, k = 0;
  while (c !== to && k++ < 40) { const n = sim.correctNext(c, to, prev); if (n == null) break; prev = c; c = n; p.push(c); }
  return p;
}
// 路口序列 → 位置序列，两头按门截：第一段／最后一段就是门那段路时从门口起、到门口止；不是的话从门口先走到路口（和出门、进门一致）
const onDoor = (d, x, y) => d && ((d.a === x && d.b === y) || (d.a === y && d.b === x));
function atDoors(path, d0, d1) {
  const pts = path.map(n => graph.pos[n]);
  if (d1 && pts.length) { if (path.length > 1 && onDoor(d1, path[path.length - 2], path[path.length - 1])) pts[pts.length - 1] = d1.pos; else if (d1.a === path[path.length - 1] || d1.b === path[path.length - 1]) pts.push(d1.pos); }
  if (d0 && pts.length) { if (path.length > 1 && onDoor(d0, path[0], path[1])) pts[0] = d0.pos; else if (d0.a === path[0] || d0.b === path[0]) pts.unshift(d0.pos); }
  return pts;
}
// 收起路线（释放显存）和路口上的问号
export function clearRoutes() { clearGroup(routeGroup, arrowGeo); for (const t of riskTags) t.remove(); riskTags.length = 0; }
// 路线＝他心里打算走的路（10-13 第二轮，用户定按提议做，见 Docs/游戏系统.md“路线提示”）：
// 布置时画每趟去程，放了路标他改走认得的路，旧线淡出、新线从起点一段段画出来；
// 出门后只画正在走的这一程（去程、回程都画），默认淡，点他或电话、犹豫面板打开时亮；他走过的箭头一个个收起；
// 拐错一次：原路线变灰、隔一个画一个，拐错的路口标“✕”；迷路：路线整条淡出（他心里的路断了）；
// 认出路、照你电话里说的走、邻居领了一段：从他所在的路口重画——只有这时才重算
const planned = new Map();   // 这一趟这一程 → { path, target, prog, s, off, offAt }（s：他已走过的路线长度）
let spot = 0;   // 点他：出门后的路线亮几秒
export function spotRoute() { spot = 4; }
const GREY = new THREE.Color(0x9aa0a6);
function newPlan(from, target) {
  const e = sim.e, said = e?.route?.length ? [from, ...e.route] : null;   // 照你电话里说的走：画的就是你说的那几步
  return { path: said || tracePath(from, target), target, prog: 0, s: 0, off: false, offAt: null };
}
// 箭头颜色：走进雾里的那段淡向路面色（雾越浓越淡），像记忆在那儿断了；雾散了，箭头跟着清楚
function recolor(m) {
  const u = m.userData, cc = new THREE.Color();
  u.arrows.forEach((a, i) => {
    let best = -1, bd = 6; graph.pos.forEach((gp, n) => { const dd = Math.hypot(gp.x - a.pos.x, gp.z - a.pos.z); if (dd < bd && mists[n]) { bd = dd; best = n; } });
    const fog = best >= 0 ? Math.min(1, mists[best].userData.target) : 0;
    m.setColorAt(i, u.grey ? GREY : cc.copy(u.col).lerp(ROAD, fog * 0.92));
  });
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
}
function buildRoute(key, raw, off, col, grey, p) {
  const cum = [0]; for (let i = 1; i < raw.length; i++) cum.push(cum[i - 1] + raw[i - 1].distanceTo(raw[i]));
  const arrows = []; let n = 0;
  for (let i = 0; i < raw.length - 1; i++) {
    const len = raw[i].distanceTo(raw[i + 1]), steps = Math.floor(len / 2.1), yaw = Math.atan2(raw[i + 1].x - raw[i].x, raw[i + 1].z - raw[i].z);
    for (let k = 0; k < steps; k++) {
      if (grey && n++ % 2) continue;   // 拐错了：隔一个画一个（虚线）
      const f = (k + 0.5) / steps;
      arrows.push({ pos: raw[i].clone().lerp(raw[i + 1], f).add(off), yaw, s: cum[i] + len * f, k: 0 });
    }
  }
  if (!arrows.length) return null;
  const m = new THREE.InstancedMesh(arrowGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: sim.phase === 'live' ? 0.5 : 0.9, depthWrite: false }), arrows.length);
  m.userData = { key, arrows, raw, cum, col, grey, p, age: 0 };
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < arrows.length; i++) m.setMatrixAt(i, zero);   // 先都收着，updateRoutes 一段段画出来
  recolor(m);
  return m;
}
export function renderRoutes() {
  updateMistTargets();
  for (const t of riskTags) t.remove(); riskTags.length = 0;
  routeGroup.visible = true;
  const want = new Map();   // key → () => 网格
  if (sim.goals) {
    if (sim.phase === 'plan') planned.clear();
    const trips = sim.goals.filter(g => g.kind === 'trip' && (sim.phase === 'plan' ? g.status === 'pending' : g.status === 'active'));
    const risky = new Map(), offTags = [];
    trips.forEach((g, gi) => {
      // 路线和他实际走的一样：到门口就停、从门口出发（门在一段路中间，见 walk.js gateOf）
      const gIdx = sim.goals.indexOf(g), nextG = sim.goals[gIdx + 1], prevTrip = sim.goals.slice(0, gIdx).reverse().find(x => x.kind === 'trip');
      const chainFrom = g.chain && prevTrip ? prevTrip : null;
      const from = chainFrom ? sim.goalNode(chainFrom, sim.homeNode) : sim.homeNode;   // 顺路：从上一处的门出发
      const live = sim.phase !== 'plan' && sim.e.goal === g;
      const tgt = live ? sim.e.target : sim.goalNode(g, from), door = live ? sim.e.gate : sim.gateOf(g, from), home = sim.doors.home;
      const d0 = chainFrom ? sim.gateOf(chainFrom, sim.homeNode) : home;
      // 每一段：[路口序列, 起点的门, 终点的门, 画不画, 出门后的记录]。布置时回程不画（10-13 用户：大多和去程同一条路、方向相反，看着乱），回程上的陌生路口照样标问号
      let legs;
      if (sim.phase === 'plan') legs = [[tracePath(from, tgt), d0, door, true, null], ...(nextG?.chain ? [] : [[tracePath(tgt, sim.homeNode), door, home, false, null]])];
      else {
        const e = sim.e, back = e.leg === 'back', t = e.target ?? tgt, k = gIdx + (back ? ':back' : ':go');
        let p = planned.get(k);
        if (e.lost) legs = [];   // 迷路：他心里的路断了，路线淡出
        else {
          if (!p || p.target !== t) p = newPlan(e.node, t);
          else {
            const at = p.path.indexOf(e.node, p.prog);
            if (at >= 0) { p.prog = at; p.off = false; }   // 还在路线上（或拐错后又绕回来）
            else if (!e.drift) p = newPlan(e.node, t);   // 不在原路线上、也不是拐错：他认出路了／照你说的走／邻居领了一段
            else if (!p.off) { p.off = true; p.offAt = p.path[p.prog]; }   // 拐错了：原路线留着变灰，标出在哪儿偏的
          }
          planned.set(k, p);
          legs = [[p.path, null, back ? home : door, true, p]];
          if (p.off) offTags.push(p.offAt);
        }
      }
      const col = new THREE.Color(routeColor(g)), off = new THREE.Vector3(gi * 0.7 - 0.35, 0.22, gi * 0.7 - 0.35);
      legs.forEach(([path, d0, d1, draw, p]) => {
        const b = path[path.length - 1];
        if (!p?.off) for (const n of p ? path.slice(p.prog) : path) if (!sim.known(n, b) && !sim.helperNear(n)) risky.set(n, (risky.get(n) || 0) + 1);
        if (!draw || path.length < 1) return;
        const grey = !!p?.off, key = `${gIdx}|${sim.phase}|${grey ? 'g' : ''}|${path.join(',')}`;
        want.set(key, () => buildRoute(key, atDoors(path, d0, d1).map(v => v.clone()), off, col, grey, p));
      });
    });
    for (const [n] of risky) {
      const el = document.createElement('div'); el.className = 'risk'; el.textContent = sim.changed?.has(n) ? '!' : sim.nearBlock?.has(n) ? '⚠' : '?';
      el.dataset.n = n; bubblesEl.appendChild(el); riskTags.push(el);
    }
    for (const n of offTags) { const el = document.createElement('div'); el.className = 'risk offr'; el.textContent = '✕'; el.dataset.n = n; bubblesEl.appendChild(el); riskTags.push(el); }   // 在这儿拐错的
  }
  // 路线没变的留着（他走过的箭头接着收），变了的旧线淡出、新线画出来
  for (const m of routeGroup.children) {
    if (m.userData.fade) continue;
    if (want.has(m.userData.key)) { recolor(m); want.delete(m.userData.key); continue; }
    m.userData.fade = true;   // 换掉的旧路线：淡出后释放（updateRoutes）
  }
  for (const make of want.values()) { const m = make(); if (m) routeGroup.add(m); }
}
// 每帧：路线一段段画出来、他走过的箭头收起、亮淡、旧线淡出
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
function walked(u) {   // 他在这条线上走到了哪儿（只往前，偏离路线 3 以上不算）
  const ep = elder.root.position, p = u.p; let best = Infinity, bs = p.s;
  for (let i = 0; i < u.raw.length - 1; i++) {
    if (u.cum[i + 1] < p.s - 0.5 || u.cum[i] > p.s + 6) continue;
    const a = u.raw[i], b = u.raw[i + 1], dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1;
    const f = Math.max(0, Math.min(1, ((ep.x - a.x) * dx + (ep.z - a.z) * dz) / L2)), d = Math.hypot(a.x + dx * f - ep.x, a.z + dz * f - ep.z);
    if (d < best) { best = d; bs = u.cum[i] + Math.sqrt(L2) * f; }
  }
  if (best < 3) p.s = Math.max(p.s, bs);
  if (p.prog > 0) p.s = Math.max(p.s, u.cum[Math.min(u.cum.length - 1, p.prog)] - 1.5);   // 规则层已经到了路线上更前面的路口
}
export function updateRoutes(dt) {
  spot = Math.max(0, spot - dt);
  const live = sim.phase === 'live', bright = !live || spot > 0 || !!sim.moment, ease = Math.min(1, dt * 4);
  for (const m of [...routeGroup.children]) {
    const u = m.userData; if (!u.arrows) continue;
    if (u.fade) { m.material.opacity -= dt * 2.5; if (m.material.opacity <= 0) disposeTree(m, arrowGeo); continue; }
    const to = u.grey ? 0.55 : bright ? 0.9 : 0.5;
    m.material.opacity += (to - m.material.opacity) * ease;
    if (live && u.p && !u.p.off) walked(u);
    const age = (u.age += dt); let dirty = false;
    u.arrows.forEach((a, i) => {
      const shown = Math.min(1, Math.max(0, (age - i * 0.035) / 0.25));   // 一段段画出来
      const passed = live && u.p && !u.p.off && a.s < u.p.s + 0.6;   // 他走过的
      const k = passed ? Math.max(0, a.k - dt * 4) : shown;
      if (Math.abs(k - a.k) < 0.001) return;
      a.k = k; m.setMatrixAt(i, _m.compose(a.pos, _q.setFromAxisAngle(UP, a.yaw), _v.setScalar(k))); dirty = true;
    });
    if (dirty) m.instanceMatrix.needsUpdate = true;
  }
}
// 这个路口他认得了：雾一边变淡、一边向外散开
export const MIST_W = 19, MIST_H = 11;
export function mistPuff(node) { const m = mists?.[node]; if (m && m.material.opacity > 0.05) m.userData.puff = 1; }
export function mistFlash(node) { const m = mists?.[node]; if (m) m.userData.flash = 1; }   // 在这儿拐错了：雾猛地浓一下
// 雾的浓淡＝他在这个路口拐错的可能（sim.risk，和走路的规则是同一个数）：
// 认得／有路标／邻居在旁边＝没有雾；普通陌生路口约 6 成浓，修路、变了样更浓；下雨、他心里慌，雾跟着变浓
export const mistDensity = (p) => p <= 0 ? 0 : 0.55 + 0.45 * Math.min(1, Math.max(0, (p - 0.3) / 0.45));
export function updateMistTargets() {
  mists.forEach((m, i) => {
    if (!m) return;
    let t = 0;
    if (sim.day) {   // 他的地图：雾始终显示
      const r = sim.risk(i); t = mistDensity(r.p) * (r.why === 'goal' ? 0.45 : 1);   // 目的地旁边：往那儿去时认得，布置时画淡雾
      if (sim.phase === 'live') t *= 0.85;   // 白天略淡一点，看得见他
      if (settings.fog === 2) t *= 0.55;   // 设置：雾的浓淡「淡」
    }
    if (m.userData.target > 0.3 && t === 0) m.userData.puff = 1;   // 从有雾变成认得（路标、老照片、邻居、他自己认出来）：都有同一个散开动画
    m.userData.target = t;
  });
}
// 正门在修（goal.doorClosed）：正门前摆一道围栏、两个锥桶，和简介里说的一致
function doorBarrier(place) {
  const u = town.placeObjs[place]?.userData, gt = u?.gates?.[0]; if (!gt) return;
  const g = new THREE.Group(); g.position.copy(gt.front).lerp(gt.road, 0.35);
  g.rotation.y = Math.atan2(gt.road.x - gt.front.x, gt.road.z - gt.front.z);
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.35, 0.12), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xffffff : 0xe8672f, flatShading: true }));
    seg.position.set(-1.2 + i * 0.8, 1.0, 0); g.add(seg);
  }
  for (const lx of [-1.4, 1.4]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 0.5), new THREE.MeshStandardMaterial({ color: 0x555555 })); leg.position.set(lx, 0.55, 0); g.add(leg); }
  for (const cx of [-2.1, 2.1]) { const cone = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 8), new THREE.MeshStandardMaterial({ color: 0xf07a2a, flatShading: true })); cone.position.set(cx, 0.4, 0.4); cone.castShadow = true; g.add(cone); }
  barriers.add(g);
}
export function renderBarriers() {
  clearGroup(barriers);
  for (const g of sim.goals || []) if (g.doorClosed && g.place) doorBarrier(g.place);
  for (const k of sim.blocked || []) {
    const [a, b] = k.split('-').map(Number);
    const pa = graph.pos[a], pb = graph.pos[b];
    const mid = pa.clone().lerp(pb, 0.5);
    const horiz = pa.z === pb.z;
    const g = new THREE.Group(); g.position.copy(mid); if (!horiz) g.rotation.y = Math.PI / 2;
    for (const off of [-1.8, 1.8]) {
      const bar = new THREE.Group(); bar.position.x = off; bar.rotation.y = Math.PI / 2;
      for (let i = 0; i < 4; i++) {
        const seg = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.35, 0.12), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xffffff : 0xe8672f, flatShading: true }));
        seg.position.set(-1.2 + i * 0.8, 1.0, 0); bar.add(seg);
      }
      for (const lx of [-1.4, 1.4]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 0.5), new THREE.MeshStandardMaterial({ color: 0x555555 })); leg.position.set(lx, 0.55, 0); bar.add(leg); }
      g.add(bar);
    }
    for (let i = 0; i < 3; i++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 8), new THREE.MeshStandardMaterial({ color: 0xf07a2a, flatShading: true }));
      cone.position.set(-0.8 + i * 0.8, 0.4, 0.9); cone.castShadow = true; g.add(cone);
    }
    const pile = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9, 0), new THREE.MeshStandardMaterial({ color: 0x9c8466, flatShading: true }));
    pile.scale.y = 0.5; pile.position.set(0, 0.3, -0.4); g.add(pile);
    barriers.add(g);
  }
}

export function renderCinema() {
  const changed = sim.changed && [...sim.changed].length > 0;
  const g = town.oldObjs.cinema; if (!g) return;
  g.userData.marquee.material.color.setHex(changed ? 0x4a7fc1 : 0xf3d36b);
  g.children[0].material.color.setHex(changed ? 0xc9d2da : 0xc85a5a);   // 手机店：浅灰蓝墙＋一层橱窗（town.js），不再是白盒子
  if (g.userData.shop) { g.userData.shop.visible = changed; g.userData.deco.visible = !changed; }
  const lab = labelEls.find(l => l.l.text === '老电影院' || l.l.text === '手机店');
  if (lab) lab.el.textContent = changed ? '手机店（原老电影院）' : '老电影院';
}

// ---------- 路口提示环：选着道具卡时标出能放的路口；他犹豫时，那个路口闪一下（pulseAt） ----------
let pulseNode = null, pulseT = 0;
export function pulseAt(node) { pulseNode = node; pulseT = 2.2; }
export function updateRings(dt) {
  const tsel = ui.selected && SUPPORTS[ui.selected].target;
  const time = performance.now() / 1000;
  town.nodeMeshes.forEach((ring, i) => {
    if (!ring) return;
    let op = 0; ring.material.color.setHex(0xffffff);
    if (tsel === 'node' && !persist.signs.has(i) && i !== sim.homeNode) {
      if (sim.energy >= SUPPORTS.sign.cost) op = 0.45 + Math.sin(time * 4) * 0.2;
    }
    if (tsel === 'neighbor' && NEIGHBORS.some(nb => !persist.neighbors.has(nb.id) && graph.dist[i][sim.neighborNodes.get(nb.id)] <= 1)) { op = 0.55; ring.material.color.setHex(0x2f8f83); }   // 邻居能照看到的路口
    if (tsel === 'changed' && sim.changed.has(i) && !persist.photos.has(i)) op = 0.7 + Math.sin(time * 4) * 0.25;
    ring.material.opacity = op; ring.visible = op > 0.01;   // 不可见的环不画，省绘制次数
  });
  pulseT -= dt;
  // 他在陌生路口犹豫（时机窗口）：从他脚下往外扩两圈细环，和脚下的圈同样子、同色（10-14 用户选 1A；原来是路口一个粗橙色大圆环）
  if (!pulseRing) { pulseRing = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.08, 48), new THREE.MeshBasicMaterial({ color: 0xe07a4a, transparent: true, opacity: 0, depthWrite: false }));
    pulseRing.rotation.x = -Math.PI / 2; pulseRing.renderOrder = 4; pulseRing.visible = false; scene.add(pulseRing); }
  if (pulseT > 0 && pulseT <= 2.2) {
    const k = ((2.2 - pulseT) % 1.1) / 1.1, p = elder.root.position;   // 0→1，敲两下
    pulseRing.visible = true; pulseRing.position.set(p.x, 0.28, p.z); pulseRing.scale.setScalar(1 + k * 1.8); pulseRing.material.opacity = 0.9 * (1 - k);
    const g = sim.e?.goal; pulseRing.material.color.setHex(g?.kind === 'trip' ? routeColor(g) : ROUTE_COLORS[0]);
  } else if (pulseRing.visible) pulseRing.visible = false;
}
let pulseRing = null;
