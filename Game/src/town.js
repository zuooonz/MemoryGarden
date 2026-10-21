// 程序化小镇：路网图 + 风格化低多边形场景的总装。构件（房子、路灯、树、材质）在 town-parts.js，爷爷家在 town-home.js。
import * as THREE from 'three';
import { GRID_W, GRID_H, SPACING, REMOVED_EDGES, PLACES, OLD_LANDMARKS, NEIGHBORS, nid } from './data.js';
import { rng, canvasTexture } from './util.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, coneGeo, lampM, lampConeM, lampPoolM, winM, winM2, winDim, glassU, GLASS, house, lamp, tree, TREE_ROUGH, swayT } from './town-parts.js';
import { buildHome } from './town-home.js';
export { lampM, lampConeM, lampPoolM, winM, winM2, winDim, glassU, GLASS };   // main.js 从这里拿（傍晚亮灯、玻璃映天色）

export function nodePos(id) {
  const x = id % GRID_W, z = Math.floor(id / GRID_W);
  return new THREE.Vector3((x - (GRID_W - 1) / 2) * SPACING, 0, (z - (GRID_H - 1) / 2) * SPACING);
}
function blockCenter([bx, bz]) {
  return new THREE.Vector3((bx + 0.5 - (GRID_W - 1) / 2) * SPACING, 0, (bz + 0.5 - (GRID_H - 1) / 2) * SPACING);
}

export function buildGraph() {
  const n = GRID_W * GRID_H;
  const removed = new Set(REMOVED_EDGES.map(([a, b]) => {
    const i = nid(...a), j = nid(...b); return i < j ? `${i}-${j}` : `${j}-${i}`;
  }));
  const adj = Array.from({ length: n }, () => []);
  for (let z = 0; z < GRID_H; z++) for (let x = 0; x < GRID_W; x++) {
    const i = nid(x, z);
    for (const [dx, dz] of [[1, 0], [0, 1]]) {
      const x2 = x + dx, z2 = z + dz;
      if (x2 >= GRID_W || z2 >= GRID_H) continue;
      const j = nid(x2, z2);
      if (removed.has(`${i}-${j}`)) continue;
      adj[i].push(j); adj[j].push(i);
    }
  }
  // 全源 BFS 距离
  const dist = [];
  for (let s = 0; s < n; s++) {
    const d = new Array(n).fill(Infinity); d[s] = 0; const q = [s];
    while (q.length) { const u = q.shift(); for (const v of adj[u]) if (d[v] === Infinity) { d[v] = d[u] + 1; q.push(v); } }
    dist.push(d);
  }
  const edges = [];
  adj.forEach((ns, i) => ns.forEach(j => { if (i < j) edges.push([i, j]); }));
  return { n, adj, dist, edges, pos: Array.from({ length: n }, (_, i) => nodePos(i)) };
}

// 晾衣绳（不围篱笆）：两根木杆、一根绳、三件衣服；alongZ：绳子的方向
const clothes = new THREE.Group(); clothes.userData.lines = [];
const produce = new THREE.Group(), produceM = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 });   // 晾着的衣服：不合并、单独一组，晚上和下雨时收走（main.js）
function clothesline(root, x, z, alongZ) {
  const g = new THREE.Group(); g.position.set(x, 0.22, z); if (alongZ) g.rotation.y = Math.PI / 2; g.userData.detail = true; root.add(g);
  const wood = M(0x9a7a56);
  for (const px of [-1.1, 1.1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.6, 0.07), wood); p.position.set(px, 0.8, 0); g.add(p); }
  const rope = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.025, 0.025), M(0xe8e2d4)); rope.position.set(0, 1.55, 0); g.add(rope);
  g.updateMatrixWorld(true);
  const line = { pieces: [], k: clothes.userData.lines.length };   // 收衣服的动画（main.js）：一件一件往上一提、缩小收走
  // 衣服挂点在绳上（几何体往下挪），缩放时从绳子那里收
  [[-0.6, 0xe8b64a], [0, 0x6f9fc8], [0.6, 0xf2ece0]].forEach(([cx, c]) => { const cl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.48, 0.03).translate(0, -0.24, 0), M(c));
    cl.position.copy(g.localToWorld(new THREE.Vector3(cx, 1.53, 0))); cl.rotation.y = g.rotation.y; cl.userData.y0 = cl.position.y; clothes.add(cl); line.pieces.push(cl); });
  clothes.userData.lines.push(line);
}
// 石凳（广场、榕树下）
function bench() {
  const g = new THREE.Group(), st = M(0x9d958a);
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.45), st); top.position.y = 0.48; top.castShadow = true; g.add(top);
  for (const x of [-0.5, 0.5]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.42, 0.38), st); leg.position.set(x, 0.21, 0); g.add(leg); }
  g.userData.detail = true; return g;
}
// 一丛花：绿叶团上几朵小花
function flowerBush(x, z) {
  const g = new THREE.Group(); g.position.set(x, 0.22, z);
  const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 0), M(0x5f9a55)); b.position.y = 0.3; b.scale.y = 0.7; g.add(b);
  [0xe8a0b4, 0xf2d06b, 0xf4eef8].forEach((c, k) => { const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), M(c)); f.position.set((k - 1) * 0.22, 0.6, 0.15); g.add(f); });
  g.userData.detail = true; return g;
}
// 篱笆小院：木篱笆（桩＋两道横杆）围一块菜地。hx、hz：半宽（一个空角 1.45×1.45；半块街区空着时 1.45×3.25）；菜畦顺着长边排；line：拉一根晾衣绳（全镇只一两处）
function yard(root, x, z, hx, hz, line) {
  const g = new THREE.Group(); g.position.set(x, 0.22, z); g.userData.detail = true; root.add(g);
  const wood = M(0x9a7a56);
  for (const [ax, az, len, alongZ] of [[0, -hz, hx * 2, 0], [0, hz, hx * 2, 0], [-hx, 0, hz * 2, 1], [hx, 0, hz * 2, 1]]) {
    for (const yy of [0.28, 0.55]) { const r1 = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.06), wood); r1.position.set(ax, yy, az); if (alongZ) r1.rotation.y = Math.PI / 2; g.add(r1); }
    const n = Math.max(3, Math.round(len / 0.95)); for (let k = 0; k <= n; k++) { const t = -len / 2 + k * (len / n); const p = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.7, 0.09), wood); p.position.set(alongZ ? ax : t, 0.35, alongZ ? t : az); g.add(p); }
  }
  const long = hz > hx, L = (long ? hz : hx) * 2 - 0.9, rows = [-0.6, 0.6];
  for (const o of rows) { const bed = new THREE.Mesh(new THREE.BoxGeometry(long ? 0.8 : L, 0.14, long ? L : 0.8), M(0x7a5c43)); bed.position.set(long ? o : 0, 0.07, long ? 0 : o); g.add(bed);
    const n = Math.max(3, Math.round(L / 0.6)); for (let k = 0; k < n; k++) { const t = -L / 2 + 0.3 + k * ((L - 0.6) / (n - 1)); const v = new THREE.Mesh(new THREE.OctahedronGeometry(0.19, 0), M(k % 2 ? 0x6fae52 : 0x8cc062)); v.position.set(long ? o : t, 0.22, long ? t : o); g.add(v); } }
  if (line) {
    for (const px of [-1.2, 1.2]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.6, 0.07), wood); p.position.set(long ? 0 : px, 0.8, long ? px : -hz + 0.35); g.add(p); }
    const rope = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.025, 0.025), M(0xe8e2d4)); rope.position.set(0, 1.55, long ? 0 : -hz + 0.35); if (long) rope.rotation.y = Math.PI / 2; g.add(rope);
    [[-0.7, 0xe8b64a], [-0.1, 0x6f9fc8], [0.55, 0xf2ece0]].forEach(([c0, c]) => { const cl = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.5, 0.03), M(c)); cl.position.set(long ? 0 : c0, 1.28, long ? c0 : -hz + 0.35); if (long) cl.rotation.y = Math.PI / 2; g.add(cl); });
  }
}
export function buildTown(scene, graph) {
  const r = rng(7);
  const root = new THREE.Group(); root.userData.tag = 'town'; scene.add(root);
  const W = (GRID_W - 1) * SPACING, H = (GRID_H - 1) * SPACING;

  // 地面
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W + 700, H + 700), M(0xa9c98b));   // 铺得够大，外圈交给雾
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; root.add(ground);
  // 画面精修 1（09-27）：外围草地上一片片深浅不同的低多边形草皮（起伏感）；用单独的随机数，不打乱小镇布局
  { const rg = rng(99), patchMs = [0x9fc283, 0xb3cf93, 0xa0c07f, 0xbad49a].map(c => M(c));
    for (let k = 0; k < 70; k++) {
      const a = rg() * Math.PI * 2, d = Math.max(W, H) * 0.62 + rg() * 90, s = 6 + rg() * 14;
      const p = new THREE.Mesh(new THREE.CircleGeometry(s, 5 + Math.floor(rg() * 3)), patchMs[k % patchMs.length]);
      p.rotation.x = -Math.PI / 2; p.rotation.z = rg() * Math.PI; p.position.set(Math.cos(a) * d, 0.02 + k * 0.0004, Math.sin(a) * d * 0.8); p.receiveShadow = true; root.add(p);
    } }
  // 街区：外圈一圈浅色人行道，里面是草地（每块的绿略有不同）——街道有了边，小镇有层次
  const walkM = M(0xdcd5c6, { roughness: 0.83 }), lawnMs = [0xc9d9a2, 0xc2d69a, 0xcfdca8, 0xc5d59e].map(c => M(c));
  for (let bz = 0; bz < GRID_H - 1; bz++) for (let bx = 0; bx < GRID_W - 1; bx++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(SPACING - 3.6, 0.2, SPACING - 3.6), walkM);
    b.position.copy(blockCenter([bx, bz])); b.position.y = 0.1; b.receiveShadow = true; root.add(b);
    const lawn = new THREE.Mesh(new THREE.BoxGeometry(SPACING - 5.4, 0.04, SPACING - 5.4), lawnMs[(bx * 3 + bz * 5) % lawnMs.length]);
    lawn.position.copy(blockCenter([bx, bz])); lawn.position.y = 0.21; lawn.receiveShadow = true; root.add(lawn);
  }

  // 道路
  const roadM = M(0x7d7b85, { roughness: 0.84 }), roadW = 3.2;   // 粗糙度作记号：合并后单独一组，下雨时变深、略反光（main.js wet）   // 比人行道深，路和街区分得清
  for (const [i, j] of graph.edges) {
    const a = graph.pos[i], b = graph.pos[j];
    const len = a.distanceTo(b);
    const geo = new THREE.BoxGeometry(a.x === b.x ? roadW : len, 0.12, a.x === b.x ? len : roadW);
    const m = new THREE.Mesh(geo, roadM); m.position.set((a.x + b.x) / 2, 0.06, (a.z + b.z) / 2);
    m.receiveShadow = true; root.add(m);
    // 中线虚线
    const dashes = Math.floor(len / 2.4);
    for (let k = 1; k < dashes; k++) {
      const t = k / dashes;
      if (Math.min(t, 1 - t) * len < 2.7) continue;   // 离路口中心 2.7 以内不画中线（不伸进斑马线；10-06）
      const d = new THREE.Mesh(new THREE.BoxGeometry(a.x === b.x ? 0.14 : 0.9, 0.02, a.x === b.x ? 0.9 : 0.14), M(0xf2efe6));
      d.position.set(a.x + (b.x - a.x) * t, 0.13, a.z + (b.z - a.z) * t); root.add(d);
    }
  }
  // 路口
  const pickables = [];
  const nodeMeshes = [];
  graph.pos.forEach((p, i) => {
    if (!graph.adj[i].length) return;
    const m = new THREE.Mesh(new THREE.BoxGeometry(roadW, 0.13, roadW), roadM);
    m.position.set(p.x, 0.065, p.z); m.receiveShadow = true; root.add(m);
    const pick = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.3, 16), new THREE.MeshBasicMaterial({ visible: false }));
    pick.position.set(p.x, 0.2, p.z); pick.userData = { kind: 'node', id: i }; root.add(pick); pickables.push(pick);
    // 可放置提示环
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.0, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, 0.16, p.z); root.add(ring);
    nodeMeshes[i] = ring;
  });

  // 斑马线：小学、菜市场、社区中心、家门口的路口（老人、孩子常过马路的地方）
  const zebraM = M(0xf2efe6);
  for (const key of ['school', 'market', 'center', 'home']) {
    const n = nid(...PLACES[key].node), p = graph.pos[n];
    for (const v of graph.adj[n]) {
      const q = graph.pos[v], dx = Math.sign(q.x - p.x), dz = Math.sign(q.z - p.z), off = 2.05;   // 地基（10-06）：斑马线占离路口中心 1.6—2.5，盖住人过街走的那条线（space.WALK 1.9；原来中心 2.6，人贴着斑马线旁边走），也不伸进路口方块
      for (let k = -2; k <= 2; k++) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(dx ? 0.9 : 0.38, 0.02, dx ? 0.38 : 0.9), zebraM);
        s.position.set(p.x + dx * off + (dz ? k * 0.62 : 0), 0.135, p.z + dz * off + (dx ? k * 0.62 : 0)); root.add(s);
      }
    }
  }
  // 路灯（隔一个路口一盏）
  const cones = [], pools = [];
  graph.pos.forEach((p, i) => {
    if (!graph.adj[i].length || (i % 7 + Math.floor(i / 7)) % 2) return;
    const l = lamp(p.x + 2.2, p.z - 2.2); l.rotation.y = Math.PI * 0.75; root.add(l);
    { const c = coneGeo(); c.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI * 0.75).multiply(new THREE.Matrix4().makeTranslation(0.55, 1.55, 0))); c.translate(p.x + 2.2, 0, p.z - 2.2); cones.push(c); }
    // 地上一圈暖光，圆心在灯泡正下方   // 光锥：尖在灯泡、口在地面（各盏合成一个网格，见下）   // 地基（10-05）：原来 2.1，杆子在人行道上；挪到人行道外沿的街角（人走在离路中线 1.95，房子从 2.3 起）
    { const q = new THREE.CircleGeometry(2.6, 20).rotateX(-Math.PI / 2), off = new THREE.Vector3(0.55, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI * 0.75); q.translate(p.x + 2.2 + off.x, 0.24, p.z - 2.2 + off.z); pools.push(q); }
  });
  // 路灯光锥：全部合成一个网格、单独画（顶点色上亮下淡，不进 mergeStatic——那里会删掉顶点色；10-06）
  { const m = new THREE.Mesh(mergeGeometries(cones, false), lampConeM); m.frustumCulled = false; scene.add(m); }
  // 路灯地面光斑（10-13 画面重塑）：和光锥一样合成一个网格；径向渐变贴图，中心亮、边缘淡到没有
  { if (!lampPoolM.map) lampPoolM.map = canvasTexture(64, 64, (x) => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, '#fff'); g.addColorStop(0.5, '#555'); g.addColorStop(1, '#000'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); });
    const m = new THREE.Mesh(mergeGeometries(pools, false), lampPoolM); m.frustumCulled = false; m.renderOrder = 1; scene.add(m); }
  // 特殊地点
  const occupied = new Set();
  const labels = [];
  const placeObjs = {};
  for (const [key, pl] of Object.entries(PLACES)) {
    occupied.add(pl.block.join(','));
    const c = blockCenter(pl.block);
    const g = new THREE.Group(); g.position.copy(c); root.add(g);
    if (key === 'park') {
      const lawn = new THREE.Mesh(new THREE.BoxGeometry(SPACING - 3.8, 0.25, SPACING - 3.8), M(0x8fc47a));
      lawn.position.y = 0.12; lawn.receiveShadow = true; g.add(lawn);
      for (let k = 0; k < 6; k++) { const t = tree(r, 1.2 + r() * 0.4); const a = k / 6 * Math.PI * 2; t.position.set(Math.cos(a) * 3.2, 0, Math.sin(a) * 3.2); if (k === 4 || k === 5) g.add(t); }   // 一圈六棵树只留亭子北边两棵（10-14 用户：树挡住棋亭，镜头老是让来让去）；随机数照取   // 地基（10-05）：一圈树原来半径 3.8，树干在人行道边
      // 棋亭
      // 亭子按人物身高（约 3.5）做：檐口 4.3，人站在里面头不会穿出屋顶
      const roof = new THREE.Mesh(new THREE.ConeGeometry(2.8, 1.5, 6), M(0xb5533c)); roof.position.y = 5.05; roof.castShadow = true; g.add(roof);
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; const p = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 4.3, 5), M(0x8b3a2b)); p.position.set(Math.cos(a) * 2.2, 2.15, Math.sin(a) * 2.2); p.userData.solid = 'post'; g.add(p); }
      const tb = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.8, 8), M(0xd8c3a0)); tb.position.y = 0.5; tb.userData.solid = 'table'; g.add(tb);
    } else if (key === 'market') {
      { const pave = new THREE.Mesh(new THREE.BoxGeometry(SPACING - 5.6, 0.04, SPACING - 5.6), M(0xcbbfa8)); pave.position.y = 0.235; pave.receiveShadow = true; g.add(pave); }   // 摊子下铺一块石板地（10-14：原来直接摆在草地上）
      const colors = [0xd46a4c, 0xe8b64a, 0x5fa36b, 0x4a7fc1];
      for (let k = 0; k < 4; k++) {
        const s = new THREE.Group();
        const tbl = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 1.4), M(0xb99873)); tbl.position.y = 0.45; tbl.userData.solid = 'stall'; s.add(tbl);
        const aw = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.15, 1.9), M(colors[k])); aw.position.y = 2.3; aw.rotation.x = 0.15; aw.castShadow = true; s.add(aw);
        for (const sx of [-1.2, 1.2]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.3, 4), M(0x6b5a48)); p.position.set(sx, 1.15, -0.6); s.add(p); }
        s.position.set(k % 2 ? 2 : -2, 0, k < 2 ? -2 : 2);
        { const geos = []; for (let v = 0; v < 5; v++) { const gg = new THREE.IcosahedronGeometry(0.22, 0).toNonIndexed().translate(-0.9 + v * 0.45, 0, 0.1), col = new THREE.Color([0xe0513a, 0x7cbf4a,
          0xf0c040, 0xe88a3a][v % 4]), n = gg.attributes.position.count; gg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).map((_, i) => [col.r, col.g, col.b][i % 3]), 3)); geos.push(gg); }
          const f = new THREE.Mesh(mergeGeometries(geos), produceM); f.position.set(c.x + s.position.x, 1.05, c.z + s.position.z); f.userData.stall = k; produce.add(f); }   // 摊上的菜：一摊合成一块（一次绘制），单独一组，傍晚一摊一摊收走（main.js）
        s.position.set(k % 2 ? 2 : -2, 0, k < 2 ? -2 : 2); g.add(s);
      }
    } else if (key === 'home') {
      buildHome(g, r);
    } else {
      const big = key === 'center' || key === 'school';
      const h = house(r, big ? 6 : 4.6, big ? 5.5 : 4.2, big ? 4.2 : 3.4, 0xefe6d8, pl.color, { chimney: false, pub: true, dark: key === 'school', swing: key === 'pharmacy' || key === 'post' || key === 'center' });   // 能进去的楼：门会开   // 学校、药店、驿站、社区中心：公共建筑不要烟囱
      g.add(h); g.userData.doorLeaf = h.userData.doorLeaf;   // 会开的门（药店、驿站、社区中心）
      {
        // 招牌（10-14 用户：小学的窗和雨棚、招牌互穿）：宽度不超过两侧窗套；有二楼窗就挂在二楼两扇窗中间，没有就挂在门顶上方留出空隙（贴着门顶会和门连成一块）
        const sw = Math.min(2.6, h.userData.signW), sy = h.userData.upperY ?? h.userData.doorTop + 0.62, sz = (big ? 2.75 : 2.1) + 0.06;
        const sign = new THREE.Mesh(new THREE.BoxGeometry(sw, 0.5, 0.12), M(pl.color)); sign.position.set(0, sy, sz); g.add(sign);
        const face = new THREE.Mesh(new THREE.BoxGeometry(sw - 0.16, 0.34, 0.02), M(new THREE.Color(pl.color).lerp(new THREE.Color(0xffffff), 0.55).getHex())); face.position.set(0, sy, sz + 0.07); g.add(face);   // 招牌面浅一档，像有字的牌子
      }
    }
    // 正门朝向入口路口那一侧；记录门口、路边两个点，走进走出都经过门口
    if (key !== 'home') {
      const np = graph.pos[nid(...pl.node)];
      const side = Math.sign(np.z - c.z) || 1;
      if (key !== 'park' && key !== 'market') g.rotation.y = side > 0 ? 0 : Math.PI;
      const half = key === 'park' || key === 'market' ? 4.2 : (key === 'center' || key === 'school') ? 2.75 : 2.1;
      const doorZ = c.z + side * half;
      g.userData.road = new THREE.Vector3(c.x, 0, np.z);
      g.userData.front = new THREE.Vector3(c.x, 0, np.z - side * 1.3);
      g.userData.door = new THREE.Vector3(c.x, 0, doorZ + side * 0.5);
      // 办事的地方：棋亭、菜市场在露天；小学在校门口等；药店、驿站、社区中心要走进门（09-28：原来都站在门口办事）
      const INDOOR = key === 'pharmacy' || key === 'post' || key === 'center';
      g.userData.spot = key === 'park' ? new THREE.Vector3(c.x - 1.3, 0, c.z) : key === 'market' ? new THREE.Vector3(c.x, 0, c.z + side * 0.2) : INDOOR ? new THREE.Vector3(c.x, 0, c.z + side * (half - 1.3)) : g.userData.door.clone();
      if (INDOOR) { g.userData.indoor = { x: c.x, z: c.z, hw: (key === 'center' ? 6 : 4.6) / 2 - 0.15, hd: half - 0.15 }; g.userData.doorAt = g.userData.door; }   // 楼的占地（他走到这里面就看不见了）
      // 每个门的进出点（正门在前）：路边（那段路的中点）→ 门前 → 里面
      g.userData.gates = [{ road: g.userData.road, front: g.userData.front, spot: g.userData.spot }];
      for (const [n, t2] of pl.gates || []) {
        const p1 = graph.pos[nid(...n)], p2 = graph.pos[nid(...t2)], road = p1.clone().lerp(p2, 0.5);
        const toC = new THREE.Vector3(c.x - road.x, 0, c.z - road.z).normalize();
        g.userData.gates.push({ road, front: road.clone().addScaledVector(toC, 1.3), spot: c.clone().setY(0).addScaledVector(toC, -2.2) });
      }
    }
    placeObjs[key] = g;
    labels.push({ text: pl.name, pos: c.clone().setY(8), cls: 'place', key });   // 10-13 房子加高：标签在屋脊上方
  }

  // 老地标
  const oldObjs = {};
  for (const lm of OLD_LANDMARKS) {
    occupied.add(lm.node.join(','));
    const p = graph.pos[nid(...lm.node)];
    const g = new THREE.Group(); root.add(g);
    if (lm.kind === 'well') { const bc = blockCenter(lm.node); g.position.set(bc.x, 0, bc.z); }   // 水井放在街区正中（原来靠路口，在人行道上，行人会穿过去；用户 09-28）
    else g.position.set(p.x + (lm.kind === 'cinema' ? 3.2 : lm.kind === 'tree' ? 3.2 : 2.6), 0, p.z + (lm.kind === 'cinema' ? 3.2 : lm.kind === 'tree' ? 3.2 : 2.6));   // 地基（10-05）：电影院墙角、老榕树树根台原来压在人行道上，往街区里挪
    if (lm.kind === 'tree') {
      const t = tree(r, 2.1); g.add(t);
      const roots = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.9, 0.35, 8), M(0xb8a484)); roots.position.y = 0.17; roots.userData.solid = 'roots'; g.add(roots);
      // 榕树下一小片石板地、两条石凳（10-14：原来一整块街区只有一棵树）；石板往街区里偏，不压人行道
      { const pave = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 0.05, 18), M(0xcfc3ad)); pave.position.set(0.9, 0.235, 0.9); pave.receiveShadow = true; g.add(pave);
        for (const a of [0.15, 1.42]) { const b = bench(); b.position.set(0.9 + Math.cos(a) * 1.9, 0, 0.9 + Math.sin(a) * 1.9); b.rotation.y = -a + Math.PI / 2; g.add(b); } }   // 树根台（地基 10-05：原来半径 1.6 盖住人行道）
    } else if (lm.kind === 'cinema') {
      const b = new THREE.Mesh(new THREE.BoxGeometry(4.2, 4.8, 3.6), M(0xc85a5a)); b.position.set(1.2, 2.4, 1.2); b.castShadow = true; b.userData.solid = 'cinema'; g.add(b);
      const mar = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1, 0.5), M(0xf3d36b, { emissive: 0x442200 })); mar.position.set(1.2, 4.2, -0.8); g.add(mar);
      g.userData.marquee = mar;
      // 变成手机店后（routes.js renderCinema）：一层整面橱窗、玻璃门；老电影院时：门口两块海报板（10-14：原来变样后只剩一个白盒子）
      { const shop = new THREE.Group(); shop.visible = false; g.add(shop); g.userData.shop = shop;
        const glass = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.2), M(0x7f95a6, { roughness: 0.3, emissive: 0x1c2630 })); glass.position.set(1.2, 1.35, -0.62); glass.rotation.y = Math.PI; shop.add(glass);   // 橱窗：浅一点的灰蓝，看得出是玻璃（深色会像黑洞）
        for (const x of [-0.45, 0.6, 1.8, 2.85]) { const mu = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.3, 0.06), M(0xb8c2cc)); mu.position.set(x, 1.35, -0.64); shop.add(mu); }
        const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.12, 0.08), M(0xb8c2cc)); lintel.position.set(1.2, 2.5, -0.64); shop.add(lintel);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.14, 3.8), M(0x8f9aa6)); cap.position.set(1.2, 4.86, 1.2); shop.add(cap);   // 平屋顶压一道深色檐，不再是一整块白顶
        const deco = new THREE.Group(); g.add(deco); g.userData.deco = deco;
        for (const [x, c] of [[-0.2, 0x3f6f9a], [2.6, 0x8a3f5a]]) { const pb = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.3, 0.06), M(c)); pb.position.set(x, 1.5, -0.64); deco.add(pb);
          const fr = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.4, 0.04), M(0xe6d29a)); fr.position.set(x, 1.5, -0.62); deco.add(fr); }
        const dr = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.2, 0.06), M(0x5a2a26)); dr.position.set(1.2, 1.1, -0.63); deco.add(dr); }
    } else if (lm.kind === 'well') {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1, 0.9, 8), M(0x9aa0a6)); w.position.y = 0.45; w.userData.solid = 'well'; g.add(w);
      const fr = new THREE.Mesh(new THREE.BoxGeometry(2, 0.15, 0.2), M(0x7a5a3c)); fr.position.y = 2; g.add(fr);
      for (const sx of [-0.9, 0.9]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2, 0.15), M(0x7a5a3c)); p.position.set(sx, 1, 0); g.add(p); }
      // 水井小广场（10-14：原来一整块空草地中间一口井）：石板地、两条石凳、四角花丛
      { const pave = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.05, 5.4), M(0xcfc3ad)); pave.position.y = 0.235; pave.receiveShadow = true; g.add(pave);
        for (const sx of [-2.1, 2.1]) { const b = bench(); b.position.set(sx, 0, 0); b.rotation.y = Math.PI / 2; g.add(b); }
        for (const [fx, fz] of [[-2.3, -2.3], [2.3, -2.3], [-2.3, 2.3], [2.3, 2.3]]) g.add(flowerBush(fx, fz)); }
    }
    oldObjs[lm.id] = g;
    labels.push({ text: lm.name, pos: g.position.clone().setY(lm.kind === 'tree' ? 5.8 : 5.8), cls: 'old' });
  }

  // 邻居家
  const neighborObjs = {};
  for (const nb of NEIGHBORS) {
    occupied.add(nb.block.join(','));
    const c = blockCenter(nb.block);
    const h = house(r, 3.8, 3.6, 3, 0xf6e7d2, 0x2f8f83);
    const plaque = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.08), M(0xc98b2e)); plaque.position.set(0.9, h.userData.doorTop + 0.45, 1.85); h.add(plaque);   // 门牌在门顶上方（10-13 门加高后原来 1.9 压在门上）
    const np = graph.pos[nid(...nb.node)];
    // 朝向路口一侧
    const dir = new THREE.Vector3(np.x - c.x, 0, np.z - c.z).normalize();
    h.position.copy(c).addScaledVector(dir, 1.2);   // 地基（10-05）：原来 2.2，斜放的房子墙角伸进人行道；往街区里收 1
    h.lookAt(np.x, 0, np.z);
    root.add(h);
    const pick = new THREE.Mesh(new THREE.BoxGeometry(4.5, 5, 4.5), new THREE.MeshBasicMaterial({ visible: false }));
    pick.position.copy(h.position).setY(2); pick.userData = { kind: 'neighbor', id: nb.id }; root.add(pick); pickables.push(pick);
    neighborObjs[nb.id] = h;
  }
  // 家也可点击
  {
    const c = blockCenter(PLACES.home.block);
    const pick = new THREE.Mesh(new THREE.BoxGeometry(6, 6, 6), new THREE.MeshBasicMaterial({ visible: false }));
    pick.position.copy(c).setY(3); pick.userData = { kind: 'home' }; root.add(pick); pickables.push(pick);
  }

  // 普通街区：小房子与树
  const walls = [0xf1e4cf, 0xe9dcc9, 0xf6ecdd, 0xe4d6c0, 0xf0d9c4];
  const roofs = [0x8c6e5d, 0x6f7f95, 0xa06a55, 0x7d8f6a, 0x9b8a7a];
  // 老榕树和一块住家街区对调（10-14）：榕树从 (2,4) 东南搬到 (1,3) 东南；原来 (1,3) 东南那几栋房子照原样盖到 (2,4) 东南——
  // 随机数仍在原来的次序里取（轮到 1,3 时取、盖到 2,4），小镇其他地方的布局一点不变
  const MOVED = { '1,3': [2, 4] }, VACATED = new Set(['2,4']);
  let lines = 0;   // 晾衣绳已经拉了几处
  const yardPick = (bx, bz) => ['1,3', '3,0'].includes(`${bx},${bz}`);   // 篱笆小院只留两处（10-14 用户：篱笆太多，选“极简”）：老榕树原来那块地（家门口，最下一行）、北边中间（最上一行，原来这里是晾衣绳；用户：两处不要都在最下一行）
  for (let bz = 0; bz < GRID_H - 1; bz++) for (let bx = 0; bx < GRID_W - 1; bx++) {
    const key = `${bx},${bz}`;
    if (VACATED.has(key) || (occupied.has(key) && !MOVED[key])) continue;
    const c = blockCenter(MOVED[key] || [bx, bz]);
    const count = 2 + Math.floor(r() * 3);
    const spots = [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]].sort(() => r() - 0.5).slice(0, count);   // 地基（10-05）：原来 ±2.2，墙压到人行道；往里收 0.2。10-13 再收 0.2（用户：沿人行道走时半边身子进墙）：墙离路中线 ≥2.5，人行线 1.9 加半个身子 0.45 碰不到
    let hasChimney = false;   // 一个街区最多一根烟囱（用户 09-27：太多了）；随机数照取，布局不变
    const kept = spots.slice(0, 3);   // 一块街区最多三栋（10-14 用户：避免四栋挤满）；第四栋的随机数照取、不盖（布局其余不变），空出来的角放别的
    for (const [sx, sz] of spots) {
      const drop = !kept.some(([a, b]) => a === sx && b === sz);
      const h = house(r, 2.6 + r() * 0.8, 2.6 + r() * 0.8, 2.2 + r() * 2.4,   // 地基（10-05）：最宽 3.4（原来 3.8），墙离路中线至少 2.3，街角路灯不压墙；随机数照取，布局不变
                      walls[Math.floor(r() * walls.length)], roofs[Math.floor(r() * roofs.length)], { chimney: !hasChimney, defer: true });
      if (!drop) h.traverse(o => { if (o.userData.chimney) hasChimney = true; });
      h.position.set(c.x + sx, 0, c.z + sz);
      { const k = Math.round(r() * 3);   // 门窗朝外面的街（10-13 用户：原来随机转四个方向之一，中间几片街区不少房子门窗朝着街区里面，街上只看到光墙）；随机数照取，布局不变
        h.rotation.y = k % 2 ? (sx > 0 ? Math.PI / 2 : -Math.PI / 2) : (sz > 0 ? 0 : Math.PI); }   // 角上的房子两面都临街：按原来的随机数选一面
      if (drop) continue;
      // 开窗：挨着同一街区别家房子的那面不开（10-14 用户：注意临近建筑）。邻居在 x 方向 -sx 那边、z 方向 -sz 那边；换算到房子自己的前后左右
      { const ry = h.rotation.y, nx = kept.some(([ox, oz]) => ox === -sx && oz === sz) ? -Math.sign(sx) : 0, nz = kept.some(([ox, oz]) => ox === sx && oz === -sz) ? -Math.sign(sz) : 0;
        const faces = { f: [Math.sin(ry), Math.cos(ry)], b: [-Math.sin(ry), -Math.cos(ry)], r: [Math.cos(ry), -Math.sin(ry)], l: [-Math.cos(ry), Math.sin(ry)] }, open = {};
        for (const [f, [dx, dz]] of Object.entries(faces)) open[f] = !((nx && Math.round(dx) === nx) || (nz && Math.round(dz) === nz));
        h.userData.addWindows(open); }
      root.add(h);
    }
    // 空角怎么放（10-14 用户：一块街区除了房子，可以放树、1/4 篱笆小院、空草地、晾衣绳（不围篱笆）、不同颜色的树，整体平衡）：
    // 原来那棵街区树照旧按随机数种在第一个空角（挑了小院的街区种到下一个空角）；其余空角按街区序号轮着放：一棵颜色不同的树、晾衣绳（全镇两处）、或留空草地
    const empties = [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]].filter(([x, z]) => !kept.some(([sx, sz]) => sx === x && sz === z)), used = new Set();
    const bi = bz * GRID_W + bx;
    if (empties.length && yardPick(bx, bz)) { yard(root, c.x + empties[0][0], c.z + empties[0][1], 1.45, 1.45, false); used.add(0); }   // 1/4 篱笆小院（全镇两处）
    if (r() < 0.8) {
      const t = tree(r, 0.8 + r() * 0.5), jx = (r() - 0.5) * 2, jz = (r() - 0.5) * 2;
      const ti = empties.findIndex((_, k) => !used.has(k));
      if (ti >= 0) { t.position.set(c.x + empties[ti][0] + jx * 0.4, 0, c.z + empties[ti][1] + jz * 0.4); root.add(t); used.add(ti); }
    }
    empties.forEach(([ex, ez], k) => {
      if (used.has(k)) return;
      const pick = (bi * 3 + k) % 4;
      if (pick === 0 || pick === 2) { const v = [0.05, (bi + k) % 3 / 3 + 0.1, 0.5]; const t = tree(() => v.shift() ?? 0.5, 0.75 + ((bi + k) % 3) * 0.15); t.position.set(c.x + ex * 0.9, 0, c.z + ez * 0.9); root.add(t); }   // 秋色的树（黄、橙），和绿树错开
      else if (pick === 1 && lines < 2) { lines++; clothesline(root, c.x + ex, c.z + ez, false); }   // 晾衣绳（不围篱笆）：绳子东西向，衣服正对镜头
      // 其余留空草地
    });
  }
  // 外圈树
  for (let k = 0; k < 60; k++) {
    const a = r() * Math.PI * 2, rad = Math.max(W, H) * 0.62 + r() * 18;
    const t = tree(r, 1 + r() * 0.8); t.position.set(Math.cos(a) * rad * (W / Math.max(W, H)) * 1.05, 0, Math.sin(a) * rad * 0.8);
    { const ax = Math.abs(t.position.x), az = Math.abs(t.position.z), ex = W / 2 + 4, ez = H / 2 + 4;   // 地基（10-05）：椭圆在地图四角离最外圈的路太近，树干压到路边——沿原方向推到离路 4 以外
      if (ax < ex && az < ez) { const k = Math.min(ex / (ax || 1e-6), ez / (az || 1e-6)) * 1.02; t.position.x *= k; t.position.z *= k; } }
    root.add(t);
  }

  // 合并前记下烟囱顶的位置（炊烟用）和树冠位置（落叶用）
  root.updateMatrixWorld(true);
  const chimneys = [], treeTops = [];
  // 地基：实体的实际外形（房子墙体、树干、路灯杆、电影院、水井、菜摊、棋亭、家里的墙），合并前从网格本身算出——检查用的“真实外形”
  // 每个是地面上的凸四边形 corners（世界坐标 x、z），kind 说明是什么；enterable：能进去的楼（只许爷爷进）
  const solids = [];
  root.traverse(o => {
    if (!o.isMesh || !(o.userData.contact || o.userData.solid)) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox, v = new THREE.Vector3();
    const corners = [[bb.min.x, bb.min.z], [bb.max.x, bb.min.z], [bb.max.x, bb.max.z], [bb.min.x, bb.max.z]].map(([x, z]) => { v.set(x, 0, z); o.localToWorld(v); return { x: v.x, z: v.z }; });
    solids.push({ corners, kind: o.userData.solid || (o.userData.contact.round ? 'pole' : 'house'), enterable: !!o.userData.enterable });
  });
  root.traverse(o => {
    if (o.userData.chimney) { const v = new THREE.Vector3(0, o.userData.top ?? 0.5, 0); o.localToWorld(v); chimneys.push(v); }
    if (o.userData.treeTop) { const v = new THREE.Vector3(); o.getWorldPosition(v); treeTops.push(v); }
  });
  // 小细节（篱笆小院、石凳、花丛、自行车、门口花盆）单独合成一组：流畅档整组不画，省三角面（world.js applyGfx）
  const details = new THREE.Group(); details.userData.tag = 'details'; root.add(details);
  { const tagged = []; root.traverse(o => { if (o.userData.detail && o !== details) tagged.push(o); }); root.updateMatrixWorld(true); for (const o of tagged) details.attach(o); }
  const stats = mergeStatic(root, new Set([...pickables, ...nodeMeshes.filter(Boolean)]), [details, oldObjs.cinema, placeObjs.home, ...Object.values(placeObjs).map(g => g.userData.doorLeaf)]);   // 会开的门不合并
  mergeStatic(details, new Set(), []);
  // 没合并的窗（家）也给顶点色，否则玻璃是黑的
  root.traverse(o => { if (o.isMesh && (o.material === winM || o.material === winM2 || o.material === winDim) && !o.geometry.attributes.color) { const n = o.geometry.attributes.position.count,
    gc = new THREE.Color(GLASS); o.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).map((_, k) => [gc.r, gc.g, gc.b][k % 3]), 3)); } });
  // 树冠随风轻摆（画面精修第三轮）：合并后的树冠一组，着色器里按高度摆，全镇一次绘制；越往上摆得越多，各棵步调不同
  root.traverse(o => { if (o.isMesh && o.material?.roughness === TREE_ROUGH) o.material.onBeforeCompile = (sh) => {
    sh.uniforms.uSway = swayT;
    sh.vertexShader = 'uniform float uSway;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float hh = clamp((transformed.y - 1.0) / 2.6, 0.0, 1.0);
      transformed.x += sin(uSway * 1.3 + transformed.x * 0.35 + transformed.z * 0.2) * 0.09 * hh;
      transformed.z += cos(uSway * 1.05 + transformed.z * 0.3 + transformed.x * 0.15) * 0.06 * hh;`);
  }; });
  scene.add(clothes, produce);
  const wet = []; root.traverse(o => { const m = o.material; if (o.isMesh && m?.vertexColors && (m.roughness === 0.84 || m.roughness === 0.83) && !wet.includes(m)) { m.userData.r0 = m.roughness; wet.push(m); } });   // 路面、人行道（合并后的材质）
  return { chimneys, treeTops, solids, root, pickables, nodeMeshes, labels, placeObjs, oldObjs, neighborObjs, blockCenter, stats, details, clothes, produce, wet };
}

// 把静态网格按材质合并，减少绘制调用（手机上尤其重要）
// 接触阴影的柔边贴图：方形（房子）或圆形（树、路灯），中间实、边缘渐隐
function contactTex(round) {
  return canvasTexture(64, 64, (x) => {
    const g = x.createRadialGradient(32, 32, round ? 4 : 14, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(round ? 0.35 : 0.55, 'rgba(255,255,255,.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  });
}
function mergeStatic(root, skip, skipTrees) {
  root.updateMatrixWorld(true);
  const skipSub = new Set();
  for (const t of skipTrees) t?.traverse(o => skipSub.add(o));
  const groups = new Map();
  const victims = [], contacts = [];
  root.traverse(o => {
    if (!o.isMesh || skip.has(o) || skipSub.has(o)) return;
    const m = o.material;
    // 普通不透明、不发光的材质：颜色写进顶点，按“粗糙度＋投影设置”合成少数几个网格（绘制次数从近 200 降到个位数）
    const plain = m !== winM && m !== lampM && !m.transparent && !(m.emissive && m.emissive.getHex()) && !m.map;
    const key = m === winM ? 'win' : m === lampM ? 'lamp' : plain ? `vc|${m.roughness}|${o.castShadow}|${o.receiveShadow}` : `${m.color.getHex()}|${m.roughness}|${m.emissive ? m.emissive.getHex() : 0}|${m.transparent}`;
    let g = groups.get(key);
    if (!g) { g = { mat: plain ? new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: m.roughness, metalness: m.metalness }) : m, geos: [], cast: false, recv: false }; groups.set(key, g); }
    let geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    const shade = geo.attributes.shade;   // 渐变上色的明暗系数（town-parts.shadeY），乘进顶点色
    if (o.userData.contact) contacts.push({ m: o.matrixWorld.clone(), ...o.userData.contact });
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
    geo.applyMatrix4(o.matrixWorld);
    if (plain) { const n = geo.attributes.position.count, c = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const k = shade ? shade.getX(i) : 1; c[i * 3] = m.color.r * k;
      c[i * 3 + 1] = m.color.g * k; c[i * 3 + 2] = m.color.b * k; } geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); }
    // 玻璃按建筑类型着色（town-parts house：住家暖深灰、公共楼冷深灰蓝）
    if (m === winM || m === winM2 || m === winDim) { const n = geo.attributes.position.count, c = new Float32Array(n * 3), gc = new THREE.Color(o.userData.glass ?? GLASS); for (let i = 0; i < n;
      i++) { c[i * 3] = gc.r; c[i * 3 + 1] = gc.g; c[i * 3 + 2] = gc.b; } geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); }
    g.geos.push(geo); g.cast ||= o.castShadow; g.recv ||= o.receiveShadow;
    victims.push(o);
  });
  for (const o of victims) o.parent.remove(o);
  // 接触阴影（画面精修 09-27）：房子、树、路灯脚下一圈柔和的暗影，东西“落地”；全镇合成一个网格、一次绘制
  if (contacts.length) {
    const tex = { box: contactTex(false), round: contactTex(true) }, _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();
    for (const kind of ['box', 'round']) {
      const geos = contacts.filter(c => !!c.round === (kind === 'round')).map(c => {
        c.m.decompose(_p, _q, _s); _e.setFromQuaternion(_q, 'YXZ');
        const g = new THREE.PlaneGeometry(c.w * (c.round ? 1 : 1.45) + 0.8, c.d * (c.round ? 1 : 1.45) + 0.8).rotateX(-Math.PI / 2).rotateY(_e.y);
        return g.translate(_p.x, 0.26, _p.z);
      });
      const merged = geos.length && mergeGeometries(geos, false); if (!merged) continue;
      const mesh = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ map: tex[kind], color: 0x2a3326, transparent: true, opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      mesh.renderOrder = 1; mesh.userData.tag = 'contact'; root.add(mesh);
    }
  }
  let before = victims.length, after = 0;
  for (const g of groups.values()) {
    const merged = mergeGeometries(g.geos, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, g.mat);
    mesh.castShadow = g.cast; mesh.receiveShadow = g.recv;
    root.add(mesh); after++;
  }
  return { before, after };
}
