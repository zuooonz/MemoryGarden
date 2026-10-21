// 地图上的操作：健步走连线、电话指路、地图标签与滑动连线。依赖由 main.js 通过 initMapOps 注入。
import * as THREE from 'three';
import { cam, focusOn, zoomTo } from './camera.js';
import { initAudio, sfx, narrate } from './audio.js';
import { NARR } from './narr.js';
import { $, scene, sim } from './core.js';
import { riskTags, routeGroup } from './routes.js';
import { clearGroup, pauseTimeout } from './util.js';
import { graph } from './world.js';
;
let mapGroup;
let swLine;
let arrowGeo;

export function initMapOps() {
  mapGroup = new THREE.Group(); scene.add(mapGroup);
  swLine = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); swLine.setAttribute('class', 'swline'); swLine.style.display = 'none';
  swLine.innerHTML = '<path/><circle r="9"/>'; $('#maplayer').appendChild(swLine);   // 拖动中：从最后连上的圆圈到手指，一条微弯的虚线，线头跟着手指
  $('#maplayer').addEventListener('pointerdown', (ev) => {
    if (ev.target.closest?.('.mtag')) tapDown = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, el: nearestTag(ev) };   // 可能是一次点按：按下这一刻离指针最近的圆圈（地图可能还在缓缓移动，松开时圆圈已经挪开）
    const el = ev.target.closest?.('.mtag') && nearestTag(ev);
    if (!el || !mapMode?.swipe || mapMode.demoing || el !== mapMode.swipe.head()) return;
    ev.preventDefault(); initAudio();
    swipe = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, moved: false, cur: el, tried: new Set() };
    mapMode.swipe.start?.();
  });
  addEventListener('pointermove', (ev) => {
    if (!swipe || ev.pointerId !== swipe.id || !mapMode?.swipe) return;
    if (!swipe.moved && Math.hypot(ev.clientX - swipe.x, ev.clientY - swipe.y) < 8) return;
    swipe.moved = true; drawSwLine(ev.clientX, ev.clientY);
    const hit = tagAt(ev.clientX, ev.clientY);
    if (hit !== swipe.cur) { swipe.cur = hit; if (hit) { mapMode.swipe.enter(hit, swipe.tried); drawSwLine(ev.clientX, ev.clientY); } }
  });
  addEventListener('pointerup', endSwipe, true); addEventListener('pointercancel', endSwipe, true);   // 捕获阶段：松开时指针可能已在 3D 画布上（圆圈按下会缩小），画布的镜头控制会拦住事件

  // 电话指路：从他所在的路口，一步步点出路线（无文字：箭头路径＋可点的下一步路口）
  arrowGeo = (() => { const sh = new THREE.Shape(); sh.moveTo(0, 0.55); sh.lineTo(0.42, -0.25); sh.lineTo(0, -0.05); sh.lineTo(-0.42, -0.25); sh.closePath(); return new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2); })();
}
export let mapMode = null;
function bfsPath(a, b) {
  const prev = new Map([[a, null]]), q = [a];
  while (q.length) { const u = q.shift(); if (u === b) break; for (const v of sim.adj(u)) if (!prev.has(v)) { prev.set(v, u); q.push(v); } }
  const p = []; let c = b; while (c != null) { p.unshift(c); c = prev.get(c); } return p[0] === a ? p : [a, b];
}
// 连上的一段：沿路的一条连续发光带（转角圆润），外面一圈淡光晕；grow：新连上的这段“画出来”（约 0.35 秒）
function drawSeg(nodes, color, opacity = 0.95, grow = false) {
  const pts = nodes.map(n => graph.pos[n].clone().setY(0.35));
  if (pts.length < 2) return;
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.2), segs = Math.max(8, Math.round(curve.getLength() * 1.5));
  const core = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, 0.32, 8, false), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
  const glow = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, 0.75, 8, false), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: opacity * 0.22, depthWrite: false }));
  core.renderOrder = 3; glow.renderOrder = 2; mapGroup.add(glow, core);
  if (!grow) return;
  const total = [core, glow].map(m => m.geometry.index.count), t0 = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / 350);
    [core, glow].forEach((m, i) => m.geometry.setDrawRange(0, Math.floor(total[i] * k / 3) * 3));
    if (k < 1 && core.parent) requestAnimationFrame(step);
  };
  step();
}
export function clearMap() {
  document.body.classList.remove('in-map'); routeGroup.visible = true; for (const t of riskTags) t.style.visibility = '';
  clearGroup(mapGroup, arrowGeo);
  if (mapMode) { mapMode.tags.forEach(t => t.el.remove()); mapMode.pen?.remove(); }
  $('#mappanel').classList.add('hidden'); mapMode = null;
}
function mapTag(node, text, cls, onTap) {
  const el = document.createElement('button'); el.className = 'mtag ' + (cls || ''); el.textContent = text;
  el._tap = onTap;
  el.onclick = (ev) => { ev.stopPropagation(); initAudio(); if (ev.detail === 0) el._tap?.(el); };   // 鼠标、手指的点按在松开时判（endSwipe）；这里只管键盘（回车、空格）
  $('#maplayer').appendChild(el); const t = { el, node }; mapMode.tags.push(t); return t;
}
// 滑动连线（手机习惯）：只有从当前的线头（最后连上的那个圆圈）按下才算滑动，滑过的路口依次连上、滑回上一个就撤销；
// 从别处按下仍是拖动地图，互不冲突。mapMode.swipe = { head: () => 线头元素, enter: (el) => 滑进某个圆圈 }
let swipe = null;
const tagCenter = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: Math.max(r.width, r.height) / 2 }; };
function tagAt(x, y) {
  let best = null, bd = 1e9;
  for (const t of mapMode.tags) { const c = tagCenter(t.el), d = Math.hypot(c.x - x, c.y - y); if (d < Math.max(c.r + 6, 18) && d < bd) { bd = d; best = t.el; } }
  return best;
}
// 点到的是哪个圆圈：按离手指最近的圆圈中心算，不按点中的元素算（09-28：线头为了好按住滑动，点击区往外扩了 12 像素，
// 圆圈挨得近时会盖住旁边的圆圈——点旁边那个却点中线头，线头抖一下、线没连上；电话指路和健步走都是这样）
function nearestTag(ev) { return (ev.clientX || ev.clientY) && mapMode ? tagAt(ev.clientX, ev.clientY) : null; }
function drawSwLine(x, y) {
  const h = mapMode?.swipe?.head(); if (!h) { swLine.style.display = 'none'; return; }
  const c = tagCenter(h), L = $('#maplayer').getBoundingClientRect(), x0 = c.x - L.left, y0 = c.y - L.top, x1 = x - L.left, y1 = y - L.top;
  const mx = (x0 + x1) / 2 - (y1 - y0) * 0.12, my = (y0 + y1) / 2 + (x1 - x0) * 0.12;   // 往一侧微弯
  swLine.style.display = '';
  swLine.querySelector('path').setAttribute('d', `M${x0},${y0} Q${mx},${my} ${x1},${y1}`);
  const ci = swLine.querySelector('circle'); ci.setAttribute('cx', x1); ci.setAttribute('cy', y1);
}
// 松开：滑动就收尾；没怎么动就算一次点按，连“按下时”离指针最近的那个圆圈（09-28：原来靠浏览器的 click——地图镜头还在缓动时
// 圆圈会从手指下滑走，按下时圆圈又缩到 90%，松开时指针已不在圆圈上，浏览器不认这次点击，线就没连上；电话指路和健步走都是这样）
let tapDown = null;
const endSwipe = (ev) => {
  const moved = swipe && ev.pointerId === swipe.id && swipe.moved;
  if (swipe && ev.pointerId === swipe.id) { swipe = null; swLine.style.display = 'none'; }
  const td = tapDown; tapDown = null;
  if (!td || td.id !== ev.pointerId || moved || ev.type !== 'pointerup' || Math.hypot(ev.clientX - td.x, ev.clientY - td.y) > 12 || !mapMode) return;
  const t = td.el; if (!t || !t.isConnected) return;
  initAudio(); t._tap?.(t);
};

function mapPanel(html) { routeGroup.visible = false; for (const t of riskTags) t.style.visibility = 'hidden'; document.body.classList.add('in-map'); const p = $('#mappanel'); p.innerHTML = html; p.classList.remove('hidden'); return p; }

// 健步走路线：数字与汉字各按顺序交替连接（参考 MoCA 交替连线；示范 1→甲→2 后交给玩家）
export const TRAIL_NODES = [33, 32, 25, 24, 17, 18, 11, 12, 19, 26]; // 一圈首尾相连的路口；部分路口旁有多个编号可选，要按规则挑
export const TRAIL_LABELS = ['1', '甲', '2', '乙', '3', '丙', '4', '丁', '5', '戊'];
export function startTrail(done) {
  clearMap(); cam.follow = false;
  const cen = TRAIL_NODES.reduce((a, n) => a.add(graph.pos[n]), new THREE.Vector3()).multiplyScalar(1 / TRAIL_NODES.length);
  focusOn(cen, 0, 0.1, window.innerWidth > 760 ? 82 : 115); zoomTo(window.innerWidth > 760 ? 82 : 115);
  mapMode = { kind: 'trail', tags: [], seq: [], errors: 0 };
  // 和原题一样，只在起点、终点旁写“开始”“结束”，不另标颜色
  const tagOf = TRAIL_NODES.map((n, i) => mapTag(n, TRAIL_LABELS[i], '', (el) => tapTrail(i, el)));
  tagOf[0].el.dataset.cap = '开始'; tagOf[TRAIL_NODES.length - 1].el.dataset.cap = '结束';
  // 示范时画示范的线（橙色），示范完清掉，由你从 1 开始连（蓝色）
  const redraw = () => {
    clearGroup(mapGroup, arrowGeo);
    const seq = mapMode.demoSeq || mapMode.seq, col = mapMode.demoSeq ? 0xffb03a : 0x4a7fc1;
    const grew = seq.length > (mapMode.drawn || 0); mapMode.drawn = seq.length;   // 连上了新的一段：这段画出来
    for (let k = 1; k < seq.length; k++) drawSeg(bfsPath(TRAIL_NODES[seq[k - 1]], TRAIL_NODES[seq[k]]), col, 0.95, grew && k === seq.length - 1);
    tagOf.forEach((t, i) => { t.el.classList.toggle('on', seq.includes(i)); t.el.classList.toggle('demo', !!mapMode.demoSeq && seq.includes(i)); t.el.classList.toggle('head', !mapMode.demoSeq && i === (seq.length ? seq[seq.length - 1] : 0)); });
  };
  // 滑动：从 1（或最后连上的圆圈）按下；滑进下一个就连上；滑回上一个就撤销；滑过连错的圆圈算一次出错（和纸笔连线一样），同一次滑动里同一个只算一次
  mapMode.swipe = {
    head: () => tagOf[mapMode.seq.length ? mapMode.seq[mapMode.seq.length - 1] : 0]?.el,
    start: () => { if (!mapMode.seq.length) tapTrail(0, tagOf[0].el); },
    enter: (el, tried) => {
      const i = tagOf.findIndex(t => t.el === el), seq = mapMode.seq; if (i < 0) return;
      if (i === seq[seq.length - 2] && seq.length > 1) { seq.pop(); redraw(); sfx('click'); return; }
      if (seq.includes(i) || tried.has(i)) return;
      if (i !== seq.length) tried.add(i);
      tapTrail(i, el);
    },
  };
  narrate(NARR.trail);
  const panel = mapPanel(`<div class="mt">社区健步走：连出今天的路线</div>
    <div class="mc" id="tMsg">看示范，然后从 1 开始连：依次点圆圈，或按住滑过去。</div>
    <div class="row"><button class="ghost" id="tDemo">重看示范</button><button class="ghost" id="tUndo">撤销一步</button></div>`);
  const demo = () => {
    if (!mapMode || mapMode.kind !== 'trail') return;   // 地图已关（比如换天）就不再示范
    mapMode.demoSeq = [0]; redraw();
    const pen = mapMode.pen || document.createElement('div'); pen.className = 'pen'; $('#maplayer').appendChild(pen); mapMode.pen = pen;
    const path = [...bfsPath(TRAIL_NODES[0], TRAIL_NODES[1]), ...bfsPath(TRAIL_NODES[1], TRAIL_NODES[2]).slice(1)];
    let k = 0; mapMode.demoing = true;
    const stepPen = () => {
      if (!mapMode || mapMode.kind !== 'trail') return;
      if (k >= path.length) { pauseTimeout(() => { if (mapMode?.kind !== 'trail') return; mapMode.demoSeq = null; redraw(); pen.style.display = 'none'; mapMode.demoing = false; }, 900); return; }
      mapMode.penNode = path[k];
      if (path[k] === TRAIL_NODES[1]) { mapMode.demoSeq = [0, 1]; redraw(); }
      if (path[k] === TRAIL_NODES[2]) { mapMode.demoSeq = [0, 1, 2]; redraw(); }
      k++; pauseTimeout(stepPen, 420);   // 示范的笔：暂停时也停住
    };
    pen.style.display = ''; stepPen();
  };
  const tapTrail = (i, el) => {
    if (mapMode.demoing) return;
    const expect = mapMode.seq.length;
    if (i !== expect) {
      if (mapMode.seq.includes(i)) return;
      mapMode.errors++; el.classList.add('shake'); setTimeout(() => el.classList.remove('shake'), 400); sfx('deny');
      if (mapMode.errors >= 2) panel.querySelector('#tMsg').textContent = '数字和汉字各按自己的顺序，交替连下去。';
      return;
    }
    mapMode.seq.push(i); sfx('click'); redraw();
    if (mapMode.seq.length === TRAIL_NODES.length) {
      sfx('good'); panel.querySelector('#tMsg').textContent = '路线连好了！这类“数字—汉字交替连线”也出现在一些认知评估里，用来看注意力和思路切换；一次游戏说明不了什么。';
      panel.querySelector('.row').innerHTML = '<button class="primary" id="tGo">出发健步走</button>';
      panel.querySelector('#tGo').onclick = () => { sfx('click'); const nodes = TRAIL_NODES.slice(1), errs = mapMode.errors; clearMap(); cam.follow = true; zoomTo(window.innerWidth > 760 ? 52 : 70); done(nodes, errs); };
    }
  };
  panel.querySelector('#tDemo').onclick = () => { sfx('click'); demo(); };
  panel.querySelector('#tUndo').onclick = () => { if (mapMode?.kind === 'trail' && mapMode.seq.length > 0 && !mapMode.demoing) { mapMode.seq.pop(); redraw(); sfx('click'); } };
  pauseTimeout(demo, 900);
}
function drawArrows(nodes, color) {
  const pts = nodes.map(n => graph.pos[n].clone().setY(0.32)), items = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], len = a.distanceTo(b), st = Math.max(2, Math.floor(len / 2.2)), ang = Math.atan2(b.x - a.x, b.z - a.z);
    for (let k = 1; k < st; k++) items.push([a.clone().lerp(b, k / st), ang]);
  }
  if (!items.length) return;
  const im = new THREE.InstancedMesh(arrowGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false }), items.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(1.3, 1, 1.3);
  items.forEach(([p, ang], i) => { q.setFromAxisAngle(up, ang + Math.PI); m.compose(p, q, sc); im.setMatrixAt(i, m); });
  mapGroup.add(im);
}
// 电话里指路一次最多几个路口（09-27 用户：指路只管一小段，陪同才一路送到）
const ROUTE_MAX = 3;
export function startRouteGuide(from, target, done) {
  clearMap(); cam.follow = false;
  focusOn(graph.pos[from].clone().lerp(graph.pos[target], 0.35)); zoomTo(window.innerWidth > 760 ? 70 : 100);
  mapMode = { kind: 'route', tags: [], path: [from] };
  const tagOf = {};
  graph.pos.forEach((p, i) => {
    if (!graph.adj[i].length) return;
    const t = mapTag(i, '', 'r', (el) => tapRoute(i, el)); tagOf[i] = t;
  });
  narrate(NARR.route);
  const panel = mapPanel(`<div class="mt">给他指路</div>
    <div class="mc">电话里最多说 ${ROUTE_MAX} 个路口：点亮起的圆圈，或从橙圈按住滑过去。<span class="lg-star">★</span> 是他认得的地方，停在那儿，后面的路他自己认得；说到有雾的路口，他想象不出来，容易记混。</div>
    <div class="row"><button class="ghost" id="rUndo">撤销</button><button class="primary" id="rGo" disabled>就这么走</button></div>`);
  const refresh = () => {
    clearGroup(mapGroup, arrowGeo);
    const grew = mapMode.path.length > (mapMode.drawn || 0); mapMode.drawn = mapMode.path.length;
    const P = mapMode.path;   // 与健步走连线同一种发光带：走过的部分直接画，最新一段画出来
    if (P.length > 2) drawSeg(P.slice(0, -1), 0xe4774f, 0.9);
    if (P.length > 1) drawSeg(P.slice(-2), 0xe4774f, 0.9, grew);
    drawArrows(mapMode.path, 0xe4774f);
    const last = mapMode.path[mapMode.path.length - 1], nexts = new Set(last === target || mapMode.path.length > ROUTE_MAX ? [] : sim.adj(last).filter(v => !mapMode.path.includes(v)));
    for (const [n, t] of Object.entries(tagOf)) {
      const i = +n;
      const cls = i === from ? 'r me' : i === target ? 'r goal' : nexts.has(i) ? 'r next' : mapMode.path.includes(i) ? 'r on' : 'r dim';
      t.el.className = 'mtag ' + cls + (sim.familiar(i) && i !== from && i !== target ? ' fam' : '') + (i === last && last !== target ? ' head' : '');
      t.el.textContent = i === target ? '' : (sim.familiar(i) && i !== from ? '★' : '');
    }
    panel.querySelector('#rGo').disabled = mapMode.path.length < 2;
  };
  // 滑动：滑进亮起的圆圈就走过去；滑回上一个路口就撤销；滑过其他路口不算错
  mapMode.swipe = {
    head: () => tagOf[mapMode.path[mapMode.path.length - 1]]?.el,
    enter: (el) => {
      const i = +Object.keys(tagOf).find(n => tagOf[n].el === el), p = mapMode.path, last = p[p.length - 1];
      if (p.length > 1 && i === p[p.length - 2]) { p.pop(); refresh(); sfx('click'); return; }
      if (last !== target && sim.adj(last).includes(i) && !p.includes(i)) tapRoute(i, el);
    },
  };
  const tapRoute = (i, el) => {
    const last = mapMode.path[mapMode.path.length - 1];
    if (mapMode.path.length > ROUTE_MAX && last !== target) { panel.querySelector('.mc').innerHTML = `电话里一次只说得清 ${ROUTE_MAX} 个路口，多了他记不住。停在他认得的地方（<span class="lg-star">★</span>）最好。`; }
    if (last === target || !sim.adj(last).includes(i) || mapMode.path.includes(i) || mapMode.path.length > ROUTE_MAX) { el.classList.add('shake'); setTimeout(() => el.classList.remove('shake'), 400); sfx('deny'); return; }
    mapMode.path.push(i); sfx(i === target ? 'good' : 'click'); refresh();
  };
  panel.querySelector('#rUndo').onclick = () => { if (mapMode.path.length > 1) { mapMode.path.pop(); refresh(); sfx('click'); } };
  panel.querySelector('#rGo').onclick = () => { sfx('click'); const p = mapMode.path.slice(1); clearMap(); cam.follow = true; zoomTo(window.innerWidth > 760 ? 52 : 70); done(p); };
  refresh();
}
