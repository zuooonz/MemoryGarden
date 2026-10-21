// 地基：可行走地图——“哪里能走”的唯一来源（Docs/地基方案.md）。
// 从小镇生成结果建出：路面（路段宽 3.2、路口 3.2 见方）、实体外形（town.solids，合并网格前从网格算出）。
// 第二步先做“量”：每段路两侧，从路面边往外到最近的实体有多宽——人能不能走、走在离路中线多远，都由它定。

export const ROAD_HALF = 1.6;   // 路面半宽（town.js roadW 3.2）

// 点到实体（凸四边形）的距离；在里面为 0
function distToSolid(p, sd) {
  const c = sd.corners; let inside = true, best = 1e9, area = 0;
  for (let i = 0; i < 4; i++) { const a = c[i], b = c[(i + 1) % 4]; area += a.x * b.z - b.x * a.z; }
  const sign = Math.sign(area) || 1;
  for (let i = 0; i < 4; i++) {
    const a = c[i], b = c[(i + 1) % 4], ex = b.x - a.x, ez = b.z - a.z, l2 = ex * ex + ez * ez || 1;
    if ((ex * (p.z - a.z) - ez * (p.x - a.x)) * sign < 0) inside = false;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.z - a.z) * ez) / l2));
    best = Math.min(best, Math.hypot(p.x - a.x - ex * t, p.z - a.z - ez * t));
  }
  return inside ? 0 : best;
}
export function nearestSolid(p, solids, skip = () => false) {
  let best = 1e9, which = null;
  for (const sd of solids) { if (skip(sd)) continue; const d = distToSolid(p, sd); if (d < best) { best = d; which = sd; } }
  return { d: best, sd: which };
}

// 每段路每一侧：沿路每 0.5 取一点（不含两头路口方块），从路面边（1.6）往外，第一次离实体不到 body 的地方＝这一侧的通行宽度上限
export function sideClearance(graph, solids, { body = 0.15, step = 0.5, far = 3.2 } = {}) {
  const out = [];
  for (let i = 0; i < graph.adj.length; i++) for (const j of graph.adj[i]) {
    if (j < i) continue;
    const a = graph.pos[i], b = graph.pos[j], dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len;
    for (const side of [1, -1]) {
      const nx = -uz * side, nz = ux * side;   // 这一侧的外法线
      let min = far, at = null, what = null;
      for (let s = ROAD_HALF + 0.2; s <= len - ROAD_HALF - 0.2; s += step) {
        for (let o = ROAD_HALF; o <= far; o += 0.05) {
          const p = { x: a.x + ux * s + nx * o, z: a.z + uz * s + nz * o };
          const ns = nearestSolid(p, solids);
          if (ns.d < body) { if (o < min) { min = o; at = p; what = ns.sd.kind; } break; }
        }
      }
      out.push({ i, j, side, clear: +min.toFixed(2), at, what });
    }
  }
  return out;
}

// 实体互相重叠（分离轴）：如路灯杆插进房子。树干在自己的树根台里、家里的墙在墙角相接，不算
const SAME_THING = (a, b) => (a.kind === 'roots' && b.kind === 'pole') || (b.kind === 'roots' && a.kind === 'pole') || (a.kind === 'homeWall' && b.kind === 'homeWall');
function overlapDepth(A, B) {
  let depth = 1e9;
  for (const P of [A, B]) for (let i = 0; i < 4; i++) {
    const a = P[i], b = P[(i + 1) % 4], nx = -(b.z - a.z), nz = b.x - a.x, l = Math.hypot(nx, nz) || 1;
    const pa = A.map(p => (p.x * nx + p.z * nz) / l), pb = B.map(p => (p.x * nx + p.z * nz) / l);
    const o = Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb));
    if (o <= 0) return 0; depth = Math.min(depth, o);
  }
  return depth;
}
export function solidOverlaps(solids, tol = 0.02) {
  const out = [];
  for (let i = 0; i < solids.length; i++) for (let k = i + 1; k < solids.length; k++) {
    const a = solids[i], b = solids[k]; if (SAME_THING(a, b)) continue;
    const d = overlapDepth(a.corners, b.corners); if (d > tol) out.push({ a: a.kind, b: b.kind, d: +d.toFixed(2), at: a.corners[0] });
  }
  return out;
}

// ---------- 可行走地图：人行网（第二步续，10-05；设计见 Docs/地基方案.md） ----------
export const WALK = 1.9;   // 人行线离路中线（车道外沿 1.55，房子墙 ≥2.3）
// 一个路口的四个角：q0 (+x,+z)、q1 (-x,+z)、q2 (-x,-z)、q3 (+x,-z)；相邻两角之间隔着哪一条“臂”
const QS = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
const ARM_BETWEEN = [[0, 1], [-1, 0], [0, -1], [1, 0]];   // q0→q1 跨 +z 臂，q1→q2 跨 -x 臂，q2→q3 跨 -z 臂，q3→q0 跨 +x 臂

export function createSpace(graph, solids) {
  const nodes = [], adj = [], crossings = [];   // nodes: {x, z, kind}；adj[i]: [{to, len, cross}]（cross：过街区域编号）
  const add = (x, z, kind) => { nodes.push({ x, z, kind }); adj.push([]); return nodes.length - 1; };
  const link = (a, b, cross = null) => { const len = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z); adj[a].push({ to: b, len, cross }); adj[b].push({ to: a, len, cross }); };
  const unlink = (a, b) => { adj[a] = adj[a].filter(e => e.to !== b); adj[b] = adj[b].filter(e => e.to !== a); };
  const hasArm = (i, dx, dz) => graph.adj[i].some(j => Math.sign(graph.pos[j].x - graph.pos[i].x) === dx && Math.sign(graph.pos[j].z - graph.pos[i].z) === dz);
  // 角点
  const corner = [];
  graph.pos.forEach((p, i) => { if (graph.adj[i].length) corner[i] = QS.map(([sx, sz]) => add(p.x + sx * WALK, p.z + sz * WALK, 'corner')); });
  // 路口周围：相邻两角相连；中间有路＝过街（区域：路面上那一段，供让行用）
  graph.pos.forEach((p, i) => {
    if (!corner[i]) return;
    for (let q = 0; q < 4; q++) {
      const [dx, dz] = ARM_BETWEEN[q], a = corner[i][q], b = corner[i][(q + 1) % 4];
      if (hasArm(i, dx, dz)) {
        const cx = p.x + dx * WALK, cz = p.z + dz * WALK;   // 过街的中点（斑马线位置）
        crossings.push({ id: crossings.length, node: i, x: cx, z: cz, along: dx ? 'z' : 'x', a, b });   // along：人过街时沿哪个方向走
        link(a, b, crossings.length - 1);
      } else link(a, b);
    }
  });
  // 人行道：同一侧相邻路口的角点（i 在西／南、j 在东／北）
  for (const [p, r] of graph.edges) {
    const [i, j] = graph.pos[p].x + graph.pos[p].z <= graph.pos[r].x + graph.pos[r].z ? [p, r] : [r, p];
    if (graph.pos[j].x > graph.pos[i].x) { link(corner[i][0], corner[j][1]); link(corner[i][3], corner[j][2]); }   // 东西向：北侧 q0—q1，南侧 q3—q2
    else { link(corner[i][0], corner[j][3]); link(corner[i][1], corner[j][2]); }                                      // 南北向：东侧 q0—q3，西侧 q1—q2
  }
  // 门口接入：从人行线上最近的一点接到门口一串点（门前 → 门 → 里面）；返回人行线上的那一点
  // reach：只要从 p 能直线走过去（一路都在可走的地方）的路段——站在空地边上的人，最近的人行道可能隔着一道草边（10-06 健步走队伍因此出界）
  function nearestEdge(p, skipCross = true, reach = false) {
    let best = null; const cand = reach ? [] : null;
    for (let a = 0; a < adj.length; a++) for (const e of adj[a]) {
      if (e.to < a || (skipCross && e.cross != null)) continue;
      const A = nodes[a], B = nodes[e.to], ex = B.x - A.x, ez = B.z - A.z, l2 = ex * ex + ez * ez || 1;
      const t = Math.max(0, Math.min(1, ((p.x - A.x) * ex + (p.z - A.z) * ez) / l2)), x = A.x + ex * t, z = A.z + ez * t, d = Math.hypot(p.x - x, p.z - z);
      if (cand) cand.push({ a, b: e.to, t, x, z, d, cross: e.cross });
      else if (!best || d < best.d) best = { a, b: e.to, t, x, z, d, cross: e.cross };
    }
    if (!reach) return best;
    // reach：由近到远找第一段能直线走到的（结果和原来逐段比较一样：最近的那段、同样近取先遇到的）。10-14：原来每段更近的都先查一遍能不能直线走到，寻路一次约 25 毫秒
    cand.sort((u, v) => u.d - v.d);
    for (const c of cand) if (c.d < 0.3 || lineClear(p, c)) return c;
    return nearestEdge(p, skipCross, false);
  }
  function splitAt(ne, kind) {
    if (ne.t < 0.02) return ne.a; if (ne.t > 0.98) return ne.b;
    const m = add(ne.x, ne.z, kind); unlink(ne.a, ne.b); link(ne.a, m, ne.cross); link(m, ne.b, ne.cross); return m;
  }
  const doors = {};   // key → { entry: 人行线上的点, chain: [节点…]（最后一个是里面） }
  function addDoor(key, points, opts = {}) {
    const ne = nearestEdge(points[0]); const entry = splitAt(ne, 'entry');
    let prev = entry; const chain = [];
    points.forEach((p, k) => { const n = add(p.x, p.z, k === points.length - 1 ? (opts.kind || 'door') : 'door'); link(prev, n); chain.push(n); prev = n; });   // 只有最后一点可能在屋里
    doors[key] = { entry, chain };
    return doors[key];
  }
  // 寻路：任意两点 → 人行网上的折线（最少走的路；过街多算一点，能不过就不过）
  const CROSS_COST = 4;
  function path(from, to) {
    const tmp = [];
    const snap = (p) => { const ne = nearestEdge(p, true, true); const m = add(ne.x, ne.z, 'tmp'); tmp.push(m); link(m, ne.a, ne.cross); link(m, ne.b, ne.cross); return m; };
    const s = snap(from), t = snap(to);
    const dist = new Map([[s, 0]]), prev = new Map(), done = new Set(), q = [[0, s]];
    while (q.length) {
      q.sort((x, y) => x[0] - y[0]); const [d, u] = q.shift(); if (done.has(u)) continue; done.add(u); if (u === t) break;
      for (const e of adj[u]) { const nd = d + e.len + (e.cross != null ? CROSS_COST : 0); if (nd < (dist.get(e.to) ?? 1e9)) { dist.set(e.to, nd); prev.set(e.to, u); q.push([nd, e.to]); } }
    }
    const ids = []; for (let v = t; v !== undefined; v = prev.get(v)) ids.unshift(v);
    const pts = ids.map((id, k) => ({ x: nodes[id].x, z: nodes[id].z, xing: k ? (adj[ids[k - 1]].find(e => e.to === id)?.cross ?? null) : null }));   // xing：走到这一点要过街（过街编号）。不叫 cross：三维向量自带 cross 方法
    for (const m of tmp.reverse()) { for (const e of adj[m]) adj[e.to] = adj[e.to].filter(x => x.to !== m); adj[m] = []; }   // 收掉临时点（编号留着不复用，避免错乱）
    const end = pts[pts.length - 1], off = Math.hypot(to.x - end.x, to.z - end.z);
    return [{ x: from.x, z: from.z, xing: null }, ...pts, ...(off < 0.4 ? [{ x: to.x, z: to.z, xing: null }] : [])];   // 终点不在人行网上（如路口中心）：停在网上最近的一点，不走出去（0.4 与 isWalkable 的 0.45 配套）
  }
  // 自检：人行网的每一段离实体都留出身体宽（能进的楼、家：门口一串点允许进去）
  function selfCheck(body = 0.15) {
    const bad = [];
    for (let a = 0; a < adj.length; a++) for (const e of adj[a]) {
      if (e.to < a) continue;
      const A = nodes[a], B = nodes[e.to], len = Math.hypot(B.x - A.x, B.z - A.z), n = Math.max(1, Math.ceil(len / 0.3));
      if (A.kind === 'inside' || B.kind === 'inside') continue;   // 门到里面那一段（屋里另查）
      for (let k = 0; k <= n; k++) {
        const p = { x: A.x + (B.x - A.x) * k / n, z: A.z + (B.z - A.z) * k / n }, ns = nearestSolid(p, solids, sd => sd.enterable);
        if (ns.d < body) { bad.push({ at: p, what: ns.sd.kind, d: +ns.d.toFixed(2), kinds: A.kind + '-' + B.kind }); break; }
      }
    }
    // 连通：从第一个角点能走到所有点
    const seen = new Set([0]), st = [0]; while (st.length) { const u = st.pop(); for (const e of adj[u]) if (!seen.has(e.to)) { seen.add(e.to); st.push(e.to); } }
    const lonely = nodes.map((n, i) => i).filter(i => adj[i].length && !seen.has(i));
    return { bad, lonely, nodes: nodes.length, crossings: crossings.length };
  }
  // 真能站人的空地（如社区中心门前看电影、比赛的地方）：沿 (ux,uz) 从 (x,z) 走 a0—a1、左右各 w
  const areas = [];
  function addArea(key, x, z, ux, uz, a0, a1, w) { areas.push({ key, x, z, ux, uz, a0, a1, w }); }
  // 能不能站在这里：离人行网（人行道、斑马线、门口一串点）tol 以内，或在空地里
  function isWalkable(p, tol = 0.45) {
    for (const ar of areas) { const dx = p.x - ar.x, dz = p.z - ar.z, a = dx * ar.ux + dz * ar.uz, l = Math.abs(dx * ar.uz - dz * ar.ux); if (a >= ar.a0 && a <= ar.a1 && l <= ar.w) return true; }
    const ne = nearestEdge(p, false); return ne && ne.d <= tol;
  }
  // 在路面上（路段宽 3.2 或路口 3.2 见方）：人在这里（过街时）不该停下等人
  const segD = (p, a, b) => { const ex = b.x - a.x, ez = b.z - a.z, t = Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.z - a.z) * ez) / (ex * ex + ez * ez || 1))); return Math.hypot(p.x - a.x - ex * t, p.z - a.z - ez * t); };
  const onRoad = (p) => graph.edges.some(([i, j]) => segD(p, graph.pos[i], graph.pos[j]) < ROAD_HALF) || graph.pos.some((n, i) => graph.adj[i].length && Math.abs(p.x - n.x) < ROAD_HALF && Math.abs(p.z - n.z) < ROAD_HALF);
  const canStand = (p, body = 0.15) => isWalkable(p) && nearestSolid(p, solids).d > body;   // 能站：在可走的地方、不碰任何实体（含能进的楼）
  const snap = (p) => { const ne = nearestEdge(p, true); return { x: ne.x, z: ne.z }; };   // 人行网（人行道）上离 p 最近的一点
  // 从 a 直线走到 b，一路都在可走的地方（每 0.1 取一点）
  function lineClear(a, b) { const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.1); for (let k = 1; k < n; k++) if (!isWalkable({ x: a.x + (b.x - a.x) * k / n, z: a.z + (b.z - a.z) * k / n })) return false; return true; }
  return { nodes, adj, crossings, doors, areas, addDoor, addArea, isWalkable, canStand, onRoad, path, selfCheck, nearestEdge, snap, lineClear };
}
