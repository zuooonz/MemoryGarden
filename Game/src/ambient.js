import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
// 小镇的日常生气：天空、云、行人、车辆、光效。纯表现，不影响规则。
import * as THREE from 'three';
import { appear, vanish } from './presence.js';
import { makePerson, mergeGroup } from './person.js';
import { stepTo, markWaiting, markCrossing, isCrossing, crossingDir } from './mover.js';
import { ROAD_HALF } from './space.js';   // 路面半宽：车判断斑马线上有没有人，和人判断自己在不在马路上用同一条线
import { rng } from './util.js';
// 路人、车、云用自己的随机数（10-06）：原来用全局 Math.random，它们每帧走得快慢不同，就会改变游戏内容（菜摊抽的菜、钟面数字）取到的随机数，界面截图比对因此不稳定
const arnd = rng(2026);

export function makeSky(scene) {
  const geo = new THREE.SphereGeometry(400, 24, 12);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x7fb4d9) }, bottom: { value: new THREE.Color(0xf4e9d4) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(vP.y*1.6+0.15,0.0,1.0); gl_FragColor = vec4(mix(bottom, top, h),1.0); }',
  });
  const sky = new THREE.Mesh(geo, mat); scene.add(sky);
  return sky;
}

export function makeClouds(scene) {
  const g = new THREE.Group(); scene.add(g);
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 1, transparent: true, opacity: 0.92 });
  for (let i = 0; i < 9; i++) {
    const c = new THREE.Group();
    const n = 3 + Math.floor(arnd() * 3);
    for (let k = 0; k < n; k++) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(2 + arnd() * 2, 0), m);
      b.position.set(k * 2.6 - n * 1.3, arnd() * 1.2, arnd() * 2);
      b.scale.y = 0.6; c.add(b);
    }
    const ang = arnd() * Math.PI * 2, rad = 150 + arnd() * 60;   // 挪高挪远：标题画面低镜头时留在天边，不会糊在眼前
    c.position.set(Math.cos(ang) * rad, 34 + arnd() * 14, Math.sin(ang) * rad * 0.8); c.scale.setScalar(1.6);
    c.userData.v = 0.6 + arnd() * 0.8;
    g.add(c);
  }
  g.userData.update = (dt) => { g.rotation.y += dt * 0.004; };
  return g;
}

// 在人行网上随机闲逛的行人（地基 10-05：原来沿路中线外 1.8 走，会擦到墙、和车抢道；现在走可行走地图的人行线，过街先看车）
export function makeWalkers(scene, space, count = 7) {
  const cols = [0x5b6b7a, 0x7a5a4a, 0x6b7a5a, 0x8a7a5a, 0x4a5a6a, 0x8a6a5a, 0x6a4a4a, 0x9a8f80];   // 素色
  const walkable = (id) => space.nodes[id].kind === 'corner' || space.nodes[id].kind === 'entry';   // 只在人行线上逛，不进门
  const corners = space.nodes.map((n, i) => i).filter(i => space.nodes[i].kind === 'corner');
  const list = [];
  for (let i = 0; i < count; i++) {
    const p = makePerson({ shirt: cols[i % cols.length], pants: 0x44464f, hair: [0x2b2a33, 0x2b2a33, 0x9a9a9a][i % 3], hairStyle: i % 5 === 2 ? 'perm' : 'short', scale: (i % 5 === 2 ? 1.05 : 1.12) + (arnd() - 0.5) * 0.06 });
    const u = corners[Math.floor(arnd() * corners.length)], nb = space.adj[u].filter(e => walkable(e.to));
    p.root.position.set(space.nodes[u].x, 0, space.nodes[u].z);
    scene.add(p.root);
    list.push({ p, u, v: nb[Math.floor(arnd() * nb.length)].to, speed: 1.6 + arnd() * 0.8, pause: arnd() * 3, blockT: 0 });
  }
  const tmp = new THREE.Vector3();
  const KEEP = 0.18;   // 在人行线上稍靠自己的右边，迎面的人错开 0.36
  return {
    // 下雨撑伞（10-14 用户：路人也要撑）：伞面换成几种素色，不全是爷爷那把蓝伞；只在变化时设一次
    setRain(on) { if (on === this._rain) return; this._rain = on; list.forEach((w, i) => { const u = w.p.umbrella; if (u) { if (on && !u.userData.recolored) {
      u.children[0].material = u.children[0].material.clone(); u.children[0].material.color.setHex([0x8a3f30, 0x445c4c, 0x2f3540, 0xb8893a][i % 4]); u.userData.recolored = true; } } w.p.setUmbrella(on); }); },
    setActive(n) { list.forEach((w, i) => { const off = i >= n; if (off !== w.off) { w.off = off; off ? vanish(w.p) : appear(w.p); } }); },   // 画面档位中途降档：多出来的路人淡出，不凭空消失（presence）
    // 每天开始：重新摆
    reset() { for (const w of list) { w.u = corners[Math.floor(arnd() * corners.length)]; const nb = space.adj[w.u].filter(e => walkable(e.to)); w.v = nb[Math.floor(arnd() * nb.length)].to;
      w.p.root.position.set(space.nodes[w.u].x, 0, space.nodes[w.u].z); w.blockT = 0; w.turns = 0; w.crossing = false; w.still = 0; } },
    positions: () => list.filter(w => !w.off).map(w => w.p.root.position),
    // 检查用：这个路人在干什么
    debugAt: (p) => { const w = list.find(x => !x.off && x.p.root.position === p); if (!w) return ''; const seen = [...(w.seen || [])].join('+'); w.seen = null;
      const ce = space.adj[w.u]?.find(e => e.to === w.v)?.cross;
      return `${(w.tlog || []).join(' ')} | ${w.u}→${w.v}${ce != null ? '(斑马线' + ce + ')' : ''}${space.onRoad(p) ? '(路面)' : ''} 歇${(w.pause || 0).toFixed(1)} ${w.why || ''}${w.crossing ? ' 过街中' : ''}${seen ? ' [' + seen + ']' : ''}`; },
    stuck: (sec) => list.filter(w => !w.off && (w.still || 0) > sec).map(w => Object.assign(w.p.root.position.clone(), { why: `${w.why || ''} ${w.u}→${w.v} 堵${w.blockT.toFixed(1)}` })),   // 检查用：不在歇脚却 sec 秒没挪窝的路人
    // cars：车的列表（过街前看车）；others：路上别的人的位置（前面有人就等，不叠在一起）
    update(dt, blocked = () => false, cars = [], others = [], elderAt = null) {
      const all = others.concat(list.filter(w => !w.off).map(w => w.p.root.position));
      for (const w of list) {
        if (w.off) continue;
        const pos = w.p.root.position;
        const saw = (k) => (w.seen ||= new Set()).add(k);   // 检查用：两次检查之间出过什么事（让人、等车、歇脚、到路口）
        const turn = (k) => { (w.tlog ||= []).push(`${k}${w.u}→${w.v}@${pos.x.toFixed(1)},${pos.z.toFixed(1)}`); if (w.tlog.length > 5) w.tlog.shift(); };   // 检查用：最近几次换方向的原因和位置
        w.still = w.pause <= 0 && w.last && pos.distanceTo(w.last) < 0.01 ? (w.still || 0) + dt : 0;   // 检查用：卡住多久
        (w.last ||= new THREE.Vector3()).copy(pos);
        // 让爷爷：他走到跟前（0.55 以内）就往离他远的那一头走开，不站在他要走的地方（他的画面跟着规则层走，不会一直等）
        let yielding = false;
        // 只在真挡着他时让（10-07：原来擦肩而过 0.55 以内也算，各靠右错开着走过去的路人会突然掉头）：他在自己正前方、横向不到 0.3
        const fwd = w.keepT ? { x: w.keepT.x - pos.x, z: w.keepT.z - pos.z } : null, fl = fwd ? Math.hypot(fwd.x, fwd.z) || 1 : 1;
        const inWay = elderAt && fwd && (() => { const qx = elderAt.x - pos.x, qz = elderAt.z - pos.z, f = (qx * fwd.x + qz * fwd.z) / fl; return f > -0.1 && Math.abs(qx * fwd.z - qz * fwd.x) / fl < 0.3; })();
        const dE = elderAt ? Math.hypot(elderAt.x - pos.x, elderAt.z - pos.z) : 9;
        if (dE < 0.55 && (inWay || !fwd || dE < 0.35)) {   // 贴得太近（他从后面、侧面走上来）也让
          const du = Math.hypot(space.nodes[w.u].x - elderAt.x, space.nodes[w.u].z - elderAt.z), dv = Math.hypot(space.nodes[w.v].x - elderAt.x, space.nodes[w.v].z - elderAt.z);
          // 先往自己右边让一步（这一段的目标线右移 0.35，那条线能站得下才行），让不开再掉头往远的那头走
          const midSeg = Math.min(Math.hypot(pos.x - space.nodes[w.u].x, pos.z - space.nodes[w.u].z), Math.hypot(pos.x - space.nodes[w.v].x, pos.z - space.nodes[w.v].z)) > 2.5;   // 只在路段中间让：路口角上让一步会站进转弯车扫过的地方
          const side = midSeg && fwd && !w.dodged && (() => { const T = { x: w.keepT.x - fwd.z / fl * 0.35, z: w.keepT.z + fwd.x / fl * 0.35 }, S = { x: pos.x - fwd.z / fl * 0.35, z: pos.z + fwd.x / fl * 0.35 };
            return space.canStand(S) && space.canStand(T) && !space.onRoad(S) && !space.onRoad(T) && space.lineClear(S, T) ? T : null; })();
          if (side) { w.keepT.set(side.x, 0, side.z); w.dodged = true; turn('侧让'); }
          else if (du > dv) { const t = w.u; w.u = w.v; w.v = t; turn('让'); w.crossing = space.onRoad(pos); }   // 已经在马路上掉头：还算过街中，走完，不在路中间停下等车
          w.pause = 0; yielding = true;
        }
        if (w.pause > 0 && all.some(q => q !== pos && Math.hypot(q.x - pos.x, q.z - pos.z) < 0.5)) w.pause = 0;   // 歇脚时有人走到跟前：不歇了，接着走（别让人撞上来叠在一起）
        if (yielding) saw('让爷爷');
        if (w.pause > 0) { saw('歇'); w.pause -= dt; w.p.anim = 'idle'; w.p.update(dt); continue; }
        const A = space.nodes[w.u], B = space.nodes[w.v], ex = B.x - A.x, ez = B.z - A.z, el = Math.hypot(ex, ez) || 1;
        // 这一段的目标：那一头、偏自己右边一点。每段路只算一次（10-07：原来每帧沿线逐点查能不能站，帧耗时从 1.0 涨到 2.9 毫秒，性能检查报出）
        if (w.keepKey !== w.u + '>' + w.v) {
          w.keepKey = w.u + '>' + w.v; w.dodged = false; w.keepBack = false; tmp.set(B.x - ez / el * KEEP, 0, B.z + ex / el * KEEP);
          const P0 = w.p.root.position, clear = (T) => { const n = Math.max(2, Math.ceil(Math.hypot(T.x - P0.x, T.z - P0.z) / 0.2)); for (let k = 1; k <= n; k++) if (!space.canStand({ x: P0.x + (T.x - P0.x) * k / n, z: P0.z + (T.z - P0.z) * k / n })) return false; return true; };   // 沿线每 0.2 查一次
          if (!clear(tmp)) {   // 偏开的那条线擦到路灯杆、树干：这一段不偏；从偏开的位置直走也擦，就先回到人行线上（A→B 线上离自己最近的点）——人行线离实体都留出身体宽（10-07 换倍速检查报出擦杆）
            if (clear(B)) tmp.set(B.x, 0, B.z);
            else { const t = Math.max(0, Math.min(1, ((P0.x - A.x) * ex + (P0.z - A.z) * ez) / (el * el))); tmp.set(A.x + ex * t, 0, A.z + ez * t); if (Math.hypot(tmp.x - P0.x, tmp.z - P0.z) < 0.05) tmp.set(B.x, 0, B.z); else w.keepBack = true; }   // 已经在人行线上：沿线走到那一头
          }
          (w.keepT ||= new THREE.Vector3()).copy(tmp);
        } else tmp.copy(w.keepT);
        const edge = space.adj[w.u].find(e => e.to === w.v);
        // 要等：过街时车在斑马线附近；或前面 0.7 以内有人（同方向、偏差不到 0.35）
        const dx = tmp.x - pos.x, dz = tmp.z - pos.z, dl = Math.hypot(dx, dz) || 1;
        const carNear = edge?.cross != null && !w.crossing && !space.onRoad(pos) && (cars.wantCross(space.crossings[edge.cross]), cars.crossingBlocked(space.crossings[edge.cross]));   // 路人等着过街：也告诉车（行人优先）
        // 前面同一条线上的人：离得近就跟着慢下来（10-07：原来 0.7 以内一下站住、让开了又一下走——跟车一样按间距定速度），0.45 以内才站住
        let gap = 9; for (const q of all) { if (q === pos) continue; const qx = q.x - pos.x, qz = q.z - pos.z, f = (qx * dx + qz * dz) / dl; if (f > 0 && f < gap && Math.abs(qx * dz - qz * dx) / dl < 0.3) gap = f; }
        const someoneAhead = gap < 0.45, follow = w.crossing || yielding ? 1 : Math.max(0.15, Math.min(1, (gap - 0.45) / 0.8));
        if (carNear || (someoneAhead && !yielding && !w.crossing)) {   // 已经上了斑马线就不为人停下（先走完，靠近了由分离约束推开），免得车、人、人三方互相等
          w.why = carNear ? '等车' : '前面有人'; saw(w.why); w.p.anim = 'idle'; w.blockT += dt; if (carNear) markWaiting(w.p.root.position);
          if (w.blockT > 3) { const t = w.u; w.u = w.v; w.v = t; turn('堵'); w.blockT = 0; w.crossing = false; w.turns = (w.turns || 0) + 1; }   // 被堵 3 秒：转身往回走（用户 09-29）
          if (w.turns >= 2) {   // 转了身还是被堵（夹在两个站着的人中间）：从离大家远的街角重新出现（只在背景路人身上用）
            const far = corners.filter(c => all.every(q => Math.hypot(space.nodes[c].x - q.x, space.nodes[c].z - q.z) > 15));
            if (far.length) { w.u = far[Math.floor(arnd() * far.length)]; const nb2 = space.adj[w.u].filter(e => walkable(e.to)); w.v = nb2[0].to; turn('瞬移'); pos.set(space.nodes[w.u].x, 0, space.nodes[w.u].z); w.turns = 0; w.still = 0; }
          }
          w.p.update(dt); continue;
        }
        w.blockT = 0; w.turns = 0; w.why = ''; if (edge?.cross != null && !w.crossing) { w.crossing = true; turn('过街'); }   // 上了斑马线就走完
        if (w.crossing) markCrossing(pos, tmp);   // 正在过街：告诉车（路沿上也算）
        w.p.anim = 'walk';
        // 快到路口：先想好下一段往哪走（到了再随机挑，原来走到路沿才发现要过街、有车，一下站住）；下一段要过街、路口正在过车，就提前慢下来
        let slow = follow; { const toB = Math.hypot(tmp.x - pos.x, tmp.z - pos.z);
          if (toB < 2.5 && !w.crossing) {
            if (w.nx == null) { const nb = space.adj[w.v].filter(e => walkable(e.to) && e.to !== w.u), all2 = space.adj[w.v].filter(e => walkable(e.to)), pk = nb.length ? nb : all2; w.nx = pk[Math.floor(arnd() * pk.length)].to; }
            const ne = space.adj[w.v].find(e => e.to === w.nx);
            if (ne?.cross != null && edge?.cross == null && cars.crossingBlocked(space.crossings[ne.cross])) { cars.wantCross(space.crossings[ne.cross]); slow = Math.min(slow, Math.max(0.2, toB / 2.5)); saw('看车'); }
          } }
        if (follow < 1) saw('跟人');
        const arrived = stepTo(w.p, tmp, w.speed * slow, dt, true);
        // 走到的只是“先回到人行线上”的点：这一段还没走完，下一帧从这里重新算（10-07：原来当成到了路口，从 8 格外就开始“过街”，在那里看的车况）
        if (arrived && w.keepBack) { w.keepKey = null; saw('回线'); }
        else if (arrived) {
          w.crossing = false; saw('到' + w.v);
          const nb = space.adj[w.v].filter(e => walkable(e.to) && e.to !== w.u), all2 = space.adj[w.v].filter(e => walkable(e.to));
          const pick = (nb.length ? nb : all2); w.u = w.v; w.v = w.nx != null && pick.some(e => e.to === w.nx) ? w.nx : pick[Math.floor(arnd() * pick.length)].to; w.nx = null; turn('到');
          if (arnd() < 0.15) w.pause = 1 + arnd() * 3;
        }
        w.p.update(dt);
      }
    },
  };
}

// 几辆慢慢开的小车（地基第四步，10-05：完整交通规则，见 Docs/地基方案.md）
// 车只走自己的车道（离路中线 0.8）；到路口前停在停车线（车头在斑马线外）；路口空着、进出两条斑马线上没人，才占住路口：
// 开到路口中心 → 原地转向（车身转动半径 1.59 ≤ 路面半宽 1.6）→ 开出到下一段车道。在停车线等 5 秒还进不去就换个方向。
const LANE = 0.8, STOP = 3.7, CROSS_AT = 1.9;
const ACC = 2.2, BRAKE = 3.5, HARD = 8;   // 车：起步加速、平常刹车、紧急刹车（世界单位／秒²，车自己的时间）
// 车身（缩放后）半长、半宽：过路口的转弯路线按它算过，四个角都留在路面上（10-06，见 crossPath）；检查（devtools 车出路面）用同一组数
export const CAR = { scale: 0.9, hl: 1.26, hw: 0.68 };
const segD = (p, a, b) => { const abx = b.x - a.x, abz = b.z - a.z, t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / (abx * abx + abz * abz || 1))); return Math.hypot(p.x - a.x - abx * t, p.z - a.z - abz * t); };
export const carLightM = new THREE.MeshBasicMaterial({ color: 0xffe2a0 });
let _clg; function carLightGeo() { if (_clg) return _clg; const a = new THREE.BoxGeometry(0.28, 0.16, 0.06).translate(-0.48, 0.66, 1.42), b = new THREE.BoxGeometry(0.28, 0.16, 0.06).translate(0.48, 0.66, 1.42); return _clg = mergeGeometries([a, b]); }
export function makeCars(scene, graph, count = 3) {
  const cols = [0xe4774f, 0x4a7fc1, 0xf0c040, 0x3f8f7a];
  const list = [], hold = new Map(), wantAt = new Map();   // hold：路口编号 → 占着它的车；wantAt：路口编号 → 最近一次有人在路边等着过街的时刻
  for (let i = 0; i < count; i++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.7, 2.8), new THREE.MeshStandardMaterial({ color: cols[i % cols.length], flatShading: true }));
    body.position.y = 0.6; body.castShadow = true; g.add(body);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.55, 1.4), new THREE.MeshStandardMaterial({ color: 0xdfe8ee, flatShading: true }));
    cab.position.set(0, 1.2, -0.2); g.add(cab);
    for (const [x, z] of [[-0.7, 0.9], [0.7, 0.9], [-0.7, -0.9], [0.7, -0.9]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 8), new THREE.MeshStandardMaterial({ color: 0x2b2a33 }));
      w.rotation.z = Math.PI / 2; w.position.set(x, 0.3, z); g.add(w);
    }
    mergeGroup(g);   // 车身、车厢、轮子合成一块
    { const lights = new THREE.Mesh(carLightGeo(), carLightM); lights.visible = false; g.add(lights); g.userData.lights = lights; }   // 车灯（10-14）：车头两个小暖点，天黑后亮（main.js 调）；一辆车一个网格，不加光源
    g.scale.setScalar(CAR.scale);
    g.userData.tag = 'car'; scene.add(g);
    list.push({ g, speed: 4 + arnd() * 2, v: 0 });
  }
  const dirOf = (a, b) => { const A = graph.pos[a], B = graph.pos[b], l = A.distanceTo(B) || 1; return { x: (B.x - A.x) / l, z: (B.z - A.z) / l }; };
  const lanePt = (n, d, s) => ({ x: graph.pos[n].x + d.x * s - d.z * LANE, z: graph.pos[n].z + d.z * s + d.x * LANE });   // 离路口 n 沿 d 走 s、靠右 0.8
  // 斑马线：路口 n 朝 d 那条臂上（离路口中心 1.9），有人正在上面
  // 正在过的是这条（走向和斑马线同向）
  const crossBusy = (n, d, people) => people.some(p => { const dx = p.x - graph.pos[n].x, dz = p.z - graph.pos[n].z, along = dx * d.x + dz * d.z, across = dx * d.z - dz * d.x; const cd = crossingDir(p), onThis = isCrossing(p) && (!cd || Math.abs(cd.x * d.x + cd.z * d.z) < 0.5);
    return Math.abs(along - CROSS_AT) < 0.75 && Math.abs(across) < (onThis ? ROAD_HALF + 0.6 : ROAD_HALF); });   // 正在过街的人（已经迈出去）在路沿上也算   // 和 space.onRoad 同一条线（路面半宽 1.6）：原来 1.7，站在路边等车的人被算成在斑马线上，车等人、人等车（10-07）   // 只算真踩在路面上的（路面半宽 1.6）：站在拐角等的人不算，否则车等人、人等车会卡死
  function place(c, blocked) {
    const edges = graph.edges.filter(([a, b]) => !blocked(a, b)), [a, b] = edges[Math.floor(arnd() * edges.length)];
    let [p, q] = arnd() < 0.5 ? [a, b] : [b, a]; if (!ahead(p, q).length) [p, q] = [q, p];   // 朝着走得出去的方向摆
    const d = dirOf(p, q), len = graph.pos[p].distanceTo(graph.pos[q]);
    const pt = lanePt(p, d, STOP + arnd() * (len - 2 * STOP));
    Object.assign(c, { a: p, b: q, n: null, next: null, go: false, path: null, phase: 'drive', wait: 0, still: 0, v: 0 }); c.g.position.set(pt.x, 0, pt.z); c.g.rotation.y = Math.atan2(d.x, d.z);
  }
  // 下一段：不掉头（3.2 宽的路上掉头一定压出路面，路网也没有死胡同）；也不开进只能掉头出来的路（修路堵住的）
  const ahead = (from, at) => graph.adj[at].filter(v => v !== from && !blockedNow(at, v));
  let blockedNow = () => false;
  function nextNode(c) {
    const opts = ahead(c.a, c.b).filter(v => ahead(c.b, v).length);
    return opts.length ? opts[Math.floor(arnd() * opts.length)] : null;
  }
  // 过路口的路线（10-06 根治 S 形横移）：三次贝塞尔，从本车道停车线开到下一段车道的停车线外，车头始终顺着路线。
  // 控制点长度离线搜过（车身四角全程在路面上、余量最大）：直行＝一条直线不离开车道；右转 3.1；左转 3.8
  function crossPath(c) {
    const pb = graph.pos[c.b], din = dirOf(c.a, c.b), out = dirOf(c.b, c.next), dot = din.x * out.x + din.z * out.z, cr = din.x * out.z - din.z * out.x;
    const P0 = { x: pb.x - din.x * STOP - din.z * LANE, z: pb.z - din.z * STOP + din.x * LANE }, P3 = lanePt(c.b, out, STOP);
    const k = dot > 0.9 ? STOP * 2 / 3 : cr < 0 ? 3.1 : 3.8;   // 靠右行：往右拐（cr<0）弯小，往左拐弯大
    return [P0, { x: P0.x + din.x * k, z: P0.z + din.z * k }, { x: P3.x - out.x * k, z: P3.z - out.z * k }, P3];
  }
  const bez = (P, t) => { const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t; return { x: a * P[0].x + b * P[1].x + c * P[2].x + d * P[3].x, z: a * P[0].z + b * P[1].z + c * P[2].z + d * P[3].z }; };
  const bezD = (P, t) => { const u = 1 - t, a = 3 * u * u, b = 6 * u * t, c = 3 * t * t; return { x: a * (P[1].x - P[0].x) + b * (P[2].x - P[1].x) + c * (P[3].x - P[2].x), z: a * (P[1].z - P[0].z) + b * (P[2].z - P[1].z) + c * (P[3].z - P[2].z) }; };
  let lightsOn = false;
  return {
    setLights(on) { if (on === lightsOn) return; lightsOn = on; list.forEach(c => { c.g.userData.lights.visible = on; }); },
    list,
    reset(blocked = () => false) { blockedNow = blocked; hold.clear(); wantAt.clear(); for (const c of list) place(c, blocked); },   // 每天开始：重新摆
    // 这条斑马线上方有已经进了路口的车（开进、转向、开出）：人先等它过去（停在停车线上的车让人，人不用等）
    // 有人在路边等着过这条斑马线（行人优先，10-06）：记下时刻，0.5 秒内还在等的，停车线前的车先不进路口
    wantCross(cr) { if (cr) wantAt.set(cr.node, performance.now()); },
    // 这条斑马线被车占着：进了路口的车，或已经决定开过去、正开向停车线的车（c.go）——按路线算：车要经过的出口那条一直占着，
    // 进口那条车身压着或贴着时占着（10-07：车改成到路口不停直接开过去，人要提前让）
    crossingBlocked(cr) {
      const pn = graph.pos[cr.node], l = Math.hypot(cr.x - pn.x, cr.z - pn.z) || 1, ax = (cr.x - pn.x) / l, az = (cr.z - pn.z) / l;   // 这条斑马线在路口的哪条臂上
      return list.some(c => { if (c.b !== cr.node || c.next == null || !(c.phase === 'in' || c.go)) return false;
        const back = dirOf(c.b, c.a), out = dirOf(c.b, c.next), on = (d) => d.x * ax + d.z * az > 0.9;
        const near = Math.hypot(c.g.position.x - cr.x, c.g.position.z - cr.z) < CAR.hl + 1.2;   // 车身（半长 1.26）还压着或贴着这条斑马线
        return on(out) || near || (c.phase !== 'in' && on(back)); });   // 开向停车线、决定要过的车：进口那条也占着（它马上要开过来）
    },
    // people：路上所有人的位置
    update(dt, blocked = () => false, people = []) {
      blockedNow = blocked;
      for (const c of list) {
        if (c.a == null) place(c, blocked);
        const d = dirOf(c.a, c.b), fx = Math.sin(c.g.rotation.y), fz = Math.cos(c.g.rotation.y), P = c.g.position;
        // 挡车的人：只算真站在路面上的（人行道上、路边等着的人车道碰不到——车身四角全程在路面内）；返回车头前方最近的距离（找不到为 Infinity）
        const onRoadNear = (p) => [c.a, c.b, c.next].some(n => n != null && Math.abs(p.x - graph.pos[n].x) <= ROAD_HALF && Math.abs(p.z - graph.pos[n].z) <= ROAD_HALF) || [[c.a, c.b], [c.b, c.next]].some(([u, w]) => u != null && w != null && segD(p, graph.pos[u], graph.pos[w]) <= ROAD_HALF);
        let personGap = Infinity, carGap = Infinity;
        // 车身半宽＋人身半宽
        for (const p of people) { if (!onRoadNear(p)) continue; const dx = p.x - P.x, dz = p.z - P.z, f = dx * fx + dz * fz; if (f > -1.5 && f < 10 && Math.abs(dx * fz - dz * fx) < 0.9 && f < personGap) { personGap = f; c.whyAt = `人${p.x.toFixed(1)},${p.z.toFixed(1)} 前${f.toFixed(1)}`; } }
        // 前车：同方向（车头夹角 60° 以内）、同一条车道——转弯时车头扫过别的路口停车线上等着的车不算
        for (const o of list) { if (o === c) continue; const dx = o.g.position.x - P.x, dz = o.g.position.z - P.z, f = dx * fx + dz * fz; if (f > 0 && f < 12 && Math.abs(dx * fz - dz * fx) < 0.7 && Math.sin(o.g.rotation.y) * fx + Math.cos(o.g.rotation.y) * fz > 0.5) carGap = Math.min(carGap, f); }
        // 开车（10-07 用户：到路口没人就正常开过去、有人也别突然停）：速度有加速、刹车上限；按“刹得住的距离”算此刻最多开多快
        const stopIn = (g) => Math.sqrt(2 * BRAKE * 0.75 * Math.max(0, g));   // 在 g 以内平稳停下，现在最快能开多快（按刹车能力的四分之三算：留余量跟得上这条曲线，停车线前不会最后一下急停）
        let vT = c.speed;
        vT = Math.min(vT, stopIn(personGap - 2.0), stopIn(carGap - 3.4));
        c.why = personGap < 6 ? '前面有人' : carGap < 7 ? '前面有车' : '';
        (c.hist ||= []).push(`${c.phase}${c.go ? '占' : ''}${(c.v || 0).toFixed(1)}`); if (c.hist.length > 10) c.hist.shift();   // 检查用：最近几帧
        if (c.phase === 'drive' || c.phase === 'wait') {
          if (c.next == null || blocked(c.b, c.next)) { c.next = nextNode(c); if (c.go) { c.go = false; hold.delete(c.b); } }
          const sd = Math.max(0, (graph.pos[c.b].x - d.x * STOP - d.z * LANE - P.x) * d.x + (graph.pos[c.b].z - d.z * STOP + d.x * LANE - P.z) * d.z);   // 到停车线还有多远（本车道）
          const out = c.next != null ? dirOf(c.b, c.next) : null, back = { x: -d.x, z: -d.z };
          const clear = () => c.next != null && (!hold.has(c.b) || hold.get(c.b) === c) && !crossBusy(c.b, back, people) && !crossBusy(c.b, out, people);
          const peopleWaiting = performance.now() - (wantAt.get(c.b) ?? -1e9) < 500;   // 有人在路边等着过这个路口：没决定要过的车先让
          // 快到路口（刹车距离＋4 以内）就先决定：能过就占住路口，按转弯速度开过去、不停；不能就平稳停在停车线
          // 只有排在最前（自己到停车线之间没有车）才占路口；占了以后前面又有车（别的车拐进来排在前面）就放开——10-07 混合倍速检查报出：后车先占了路口、前车等路口、后车等前车，互相等了 80 秒
          const firstInLine = carGap > sd + 0.5;
          if (c.go && !firstInLine) { c.go = false; if (hold.get(c.b) === c) hold.delete(c.b); }
          if (!c.go && firstInLine && sd < c.v * c.v / (2 * BRAKE) + 4 && clear() && !peopleWaiting) { c.go = true; hold.set(c.b, c); c.turnV = turnSpeed(c); }
          if (c.go && !clear() && sd > c.v * c.v / (2 * BRAKE) + 0.3) { c.go = false; if (hold.get(c.b) === c) hold.delete(c.b); }   // 决定要过以后有人走上斑马线：还刹得住就改为停下让
          vT = Math.min(vT, c.go ? Math.sqrt(c.turnV * c.turnV + 2 * BRAKE * sd) : stopIn(sd - 0.02));
          if (!c.go) c.why ||= sd < 0.1 ? (c.next == null ? '前面都堵了' : hold.has(c.b) ? '路口有车' : peopleWaiting ? '让人过街' : '斑马线有人') : '';
          accel(c, vT, dt);
          const step = c.v * dt;
          if (c.go && step >= sd) { P.x += d.x * sd; P.z += d.z * sd; c.phase = 'in'; c.path = crossPath(c); c.t = 0; c.go = false; advance(c, step - sd); }
          else if (!c.go && step >= sd) { P.x += d.x * sd; P.z += d.z * sd; c.v = 0; if (c.phase !== 'wait') { c.phase = 'wait'; c.wait = 0; } }
          else { P.x += d.x * step; P.z += d.z * step; if (step > 0.001 && c.phase === 'wait') c.phase = 'drive'; }
          if (c.phase === 'wait') { c.wait += dt; if (c.wait > 5 && !c.go) { c.next = nextNode(c); c.wait = 0; } }   // 等太久：换个方向
        } else if (c.phase === 'in') {   // 过路口：沿 crossPath 按转弯速度开；出口斑马线上有人、前面有人或车：按距离平稳减速
          const out = dirOf(c.b, c.next), ex = graph.pos[c.b].x + out.x * CROSS_AT, ez = graph.pos[c.b].z + out.z * CROSS_AT;
          if (crossBusy(c.b, out, people)) { vT = Math.min(vT, stopIn(Math.hypot(ex - P.x, ez - P.z) - CAR.hl - 0.9)); c.why = '出口斑马线有人'; }
          vT = Math.min(vT, c.turnV || 3);
          accel(c, vT, dt); advance(c, c.v * dt);
        }
        if (c.phase === 'drive' || c.phase === 'wait') { const d2 = dirOf(c.a, c.b); c.g.rotation.y = Math.atan2(d2.x, d2.z); }   // 在车道上：车头朝路的方向
        c.still = c.v < 0.05 && c.phase !== 'wait' ? (c.still || 0) + dt : 0;   // 检查用：在路上（不是停车线）停了多久
      }
    },
  };
  // 加速、刹车：平常刹车 BRAKE；要停的距离突然不够（人、车冒出来）才用更大的力度 HARD——不会一下子停死
  function accel(c, vT, dt) {
    if (vT >= c.v) c.v = Math.min(vT, c.v + ACC * dt);
    else c.v = Math.max(vT, c.v - (c.v - vT > 1.2 ? HARD : BRAKE) * dt);
  }
  // 沿过路口的路线往前开 s（按弧长，分小步），开完进下一段车道，车速带过去
  function advance(c, s) {
    if (c.phase !== 'in') return;
    for (let k = 0; k < 8 && c.t < 1; k++) { const dv = bezD(c.path, c.t), dl = Math.hypot(dv.x, dv.z) || 1; c.t = Math.min(1, c.t + s / 8 / dl); }
    const p = bez(c.path, c.t), tv = bezD(c.path, Math.min(c.t, 0.999));
    c.g.position.x = p.x; c.g.position.z = p.z; c.g.rotation.y = Math.atan2(tv.x, tv.z);
    if (c.t >= 1) { if (hold.get(c.b) === c) hold.delete(c.b); c.a = c.b; c.b = c.next; c.next = null; c.phase = 'drive'; c.path = null; }
  }
  // 过路口的速度：直行基本不减速；右转弯小、慢一些；左转弯大、略快
  function turnSpeed(c) {
    const din = dirOf(c.a, c.b), out = dirOf(c.b, c.next), dot = din.x * out.x + din.z * out.z, cr = din.x * out.z - din.z * out.x;
    return dot > 0.9 ? c.speed * 0.9 : cr < 0 ? 2.6 : 3.2;
  }
}

// 放置／认出路时的光圈与星星
export function makeFx(scene) {
  const items = [];
  return {
    ring(pos, color = 0xe4774f) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.6, 1.0, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2; m.position.copy(pos).setY(0.3); scene.add(m);
      items.push({ m, t: 0, life: 0.8, kind: 'ring' });
    },
    sparkle(pos, color = 0xffd166) {
      for (let i = 0; i < 10; i++) {
        const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), new THREE.MeshBasicMaterial({ color, transparent: true }));
        m.position.copy(pos).setY(pos.y + 2.4);
        const a = i / 10 * Math.PI * 2;
        m.userData.v = new THREE.Vector3(Math.cos(a) * 2.2, 3 + arnd() * 2, Math.sin(a) * 2.2);
        scene.add(m); items.push({ m, t: 0, life: 0.9, kind: 'spark' });
      }
    },
    update(dt) {
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i]; it.t += dt; const k = it.t / it.life;
        if (it.kind === 'ring') { it.m.scale.setScalar(1 + k * 4); it.m.material.opacity = 0.9 * (1 - k); }
        else { it.m.position.addScaledVector(it.m.userData.v, dt); it.m.userData.v.y -= 9 * dt; it.m.rotation.y += dt * 6; it.m.material.opacity = 1 - k; }
        if (k >= 1) { scene.remove(it.m); it.m.geometry.dispose(); it.m.material.dispose(); items.splice(i, 1); }
      }
    },
  };
}
