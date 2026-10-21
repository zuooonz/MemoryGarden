// 调试接口 window.__mg：测试工具（regress、uidiff、video）和人工调试用。入口清单与约定见文件末尾；改名或删入口前先查 tools/ 里的用法。
import * as THREE from 'three';
import { FOOD, elderAvatar, food, girlAvatar } from './pictos.js';
import { TRAIL_LABELS, TRAIL_NODES, mapMode, startRouteGuide, startTrail } from './mapops.js';
import { cam, zoomTo, seenFrom, seenFromSlow, sightState, keepInSight } from './camera.js';
import { camera, controls, persist, renderer, run, scene, sim, lineLog } from './core.js';
import { cars, chessFriend, companion, elder, elderRing, graph, helperPeople, kid, nbActs, town, walkers, crowd, space } from './world.js';
import { changeGame, chessGame, clockGame, recallGame, scamCall, stepsGame, talkEvent } from './games.js';
import { modal } from './stage.js';
import { sideClearance, solidOverlaps } from './space.js';
import { playOpening } from './opening.js';
import { mists, routeGroup, riskTags } from './routes.js';
import { nid } from './data.js';
import { setSpeed } from './hud.js';
import { sfx, voiceDebug, audioState, voiceLog, voiceTags, voiceNow, cutLog } from './audio.js';
import { showEnding } from './flow.js';
import { onScreen } from './presence.js';
import { insideHome, homeWorld } from './home.js';
import { visitNav } from './home.js';
import { hikeBack, navDebug } from './actors.js';
import { CAR } from './ambient.js';// 调试接口 window.__mg：测试工具（regress、uidiff、video）和人工调试用。入口清单与约定见文件末尾；改名或删入口前先查 tools/ 里的用法。
;

// 由 main.js 注入的依赖
let frame;

export function initDevtools(d) {
  ({ frame } = d);
  window.__mg = { routeState: () => ({ vis: routeGroup.visible, meshes: routeGroup.children.map(m => ({ key: m.userData.key, grey: !!m.userData.grey, fade: !!m.userData.fade,
    n: m.userData.arrows?.length, shown: m.userData.arrows?.filter(a => a.k > 0.5).length, op: +m.material.opacity.toFixed(2), s: m.userData.p ? +m.userData.p.s.toFixed(1) : null })),
    tags: riskTags.map(t => t.textContent).join('') }), pose: (a) => { for (const p of [elder, kid, companion, chessFriend, ...Object.values(helperPeople).map(h => h.person)]) { p.anim = a; }
    run.poseAnim = a; }, time: (t) => { run.debugT = t ?? undefined; }, opening: () => playOpening(() => {}), space: debugSpace, clearance: () => sideClearance(graph, town.solids),
    overlaps: () => solidOverlaps(town.solids), spaceCheck: () => space.selfCheck(), spacePath: (a, b) => space.path(a, b), mistState: () => mists.map((m, i) => m && { i,
    t: +m.userData.target.toFixed(2), o: +m.material.opacity.toFixed(2), v: m.visible, why: sim.risk(i).why, p: +sim.risk(i).p.toFixed(2) }).filter(Boolean), lineLog, voiceLog, cutLog,
    placeObj: (k) => town.placeObjs[k], homeDoorOut: () => homeWorld('doorOut'), runState: () => ({ speed: run.speed, eff: run.effSpeed, visit: { key: visitNav.key, q: visitNav.queue.length,
    gate: visitNav.gate, leaving: visitNav.leaving } }), walkAudit: (on) => walkAudit(on), walkReport: () => walkReport(), reviewReport: () => reviewReport(), audioState: () => audioState(),
    chessG: () => chessGame(sfx, (r) => { window.__chessRes = r; }), clockG: () => clockGame(sfx, () => { }), park: () => town.placeObjs.park.position, scam: (pact) => scamCall({ pact }, sfx, (r) => {
    window.__scamRes = r; }), kidState: () => ({ pending: run.kidPending, vis: kid.root.visible, mode: sim.e?.mode, taskT: sim.e?.taskT, nav: visitNav.key + ':' + visitNav.queue.length }),
    voices: () => voiceDebug(), proj: (p) => { const v = p.clone().project(camera); return [Math.round((v.x + 1) / 2 * innerWidth), Math.round((1 - v.y) / 2 * innerHeight)]; }, kidRoot: () => kid.root,
    helperRoot: (id) => helperPeople[id]?.person.root, routeGuide: (a, b) => startRouteGuide(a, b, (p) => { window.__routeDone = p; }), trailMap: () => startTrail(() => { }),
    change: () => changeGame(sfx, () => {}, ['西红柿', '鸡蛋', '面条', '小葱', '青菜']), steps: () => stepsGame(sfx, () => {}), talk: () => talkEvent(sfx, () => {}),
    faces: () => modal(`<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center">${['happy','calm','low',
    'think'].map(k => `<div style="width:120px;text-align:center">${elderAvatar('#9dbfae','#f3ece0',
    k)}<br>${k}</div>`).join('')}<div style="width:120px;text-align:center">${girlAvatar()}<br>孙女</div></div>`),
    trailLabel: () => (mapMode?.kind === 'trail' && !mapMode.demoing && mapMode.seq.length < TRAIL_NODES.length) ? TRAIL_LABELS[mapMode.seq.length] : null, recall: () => recallGame({ dish: '西红柿鸡蛋面',
    say: '今天做西红柿鸡蛋面', items: ['西红柿', '鸡蛋', '面条', '小葱'] }, sfx, () => {}), drawStats: () => { const out = {}; scene.traverseVisible(o => {
    if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite) || o.material?.visible === false) return; let p = o, tag = 'other'; while (p) { if (p.userData.tag) { tag = p.userData.tag; break; }
    p = p.parent; } out[tag] = (out[tag] || 0) + 1; }); return out; }, ending: () => showEnding(), nbActs: () => nbActs, look: (p, d = 30) => { cam.follow = false; cam.pan = null; cam.zoom = null;
    controls.target.copy(p); camera.position.copy(p).add(new THREE.Vector3(0, d * 0.75, d * 0.66)); controls.update(); },
    foodSheet: () => modal(`<div class="stall" style="display:grid;grid-template-columns:repeat(8,1fr);gap:6px">${Object.keys(FOOD).map(k => `<div class="food" style="background:#fff;border-radius:4px;padding:4px;text-align:center;font-size:12px">${food(k,
    52)}<br>${k}</div>`).join('')}</div>`), lineup, cars, walkers, walkable: (x, z) => ({ walk: space.isWalkable({ x, z }), stand: space.canStand({ x, z }) }), follow: (d = 22) => { cam.follow = true;
    cam.pan = null; if (Math.abs(camera.position.distanceTo(controls.target) - d) > 1) zoomTo(d); }, lagBy: () => { const o = {}; for (const [k, v] of Object.entries(run.lagBy || {}
    )) o[k] = +v.toFixed(1); return o; }, lagSec: () => +(run.lagSec || 0).toFixed(1), lagReset: () => { run.lagBy = {}; run.lagSec = 0; }, nav: () => navDebug(), spaceNode: (i) => ({ ...space.nodes[i],
    adj: space.adj[i].map(e => [e.to, e.cross]) }), crowdPos: () => crowd.map(p => [+p.root.position.x.toFixed(2), +p.root.position.z.toFixed(2), p.root.visible, p.root.userData.dbg,
    p.root.userData.fq?.slice(0, 2).map(q => [+q.x.toFixed(1), +q.z.toFixed(1)])]), areas: () => space.areas, elderRoot: () => elder.root, elderPos: () => elder.root.position.clone(), frames: (n,
    d = 1 / 30) => { for (let i = 0; i < n; i++) frame(d); }, sim, persist, setSpeed: (s) => setSpeed(s), graph, screenOf: (n) => { const v = graph.pos[n].clone().project(camera);
    return [Math.round((v.x + 1) / 2 * innerWidth), Math.round((1 - v.y) / 2 * innerHeight)]; }, run: (sec) => { for (let i = 0; i < sec * 20 && !sim.moment && sim.phase === 'live';
    i++) sim.update(0.05, 4); return { t: sim.time, moment: sim.moment && sim.moment.kind }; }, shotCam, perfSample, elderPin, setMist: (i, v) => { if (mists[i]) mists[i].userData.target = v; },
    sightTest: (n = 200) => { cam.follow = true; const log = []; for (let i = 0; i < n; i++) { keepInSight(1 / 30, elder.root.position, [town.root], true);
    if (i % 20 === 0) log.push(JSON.stringify(sightState()) + ' 看得见' + seenFrom(camera.position, elder.root.position, [town.root]).toFixed(2)); } return log; }, sight: () => ({ ...sightState(),
    seen: +seenFrom(camera.position, elder.root.position, [town.root]).toFixed(2) }), center: (p, d = 30) => { cam.pan = null; cam.zoom = null;
    const off = camera.position.clone().sub(controls.target).setLength(d); controls.target.set(p.x, 0, p.z); camera.position.copy(controls.target).add(off); controls.update(); }, sightAt: (x, y,
    z) => seenFrom(new THREE.Vector3(x, y, z), elder.root.position, [town.root]), sightCheck, elderSeen: () => { const t0 = performance.now(), v = seenFrom(camera.position, elder.root.position, [town.root]); return { v, ms: +(performance.now() - t0).toFixed(2) }; } };
}
// 3D 画面比对（tools/scenecheck.mjs）：把镜头摆到 p 上方、距离 d（看 yaw 方向）。近景要比玩家能拉到的最近（25）还近，放宽 minDistance（只有测试调用、不再恢复），否则 controls.update 会把镜头推回 25
function shotCam(p, d = 30, yaw = 0) {
  cam.follow = false; cam.pan = null; cam.zoom = null; cam.fly = null;
  controls.minDistance = Math.min(25, d * 0.95);
  controls.target.set(p.x, p.y || 0, p.z);
  camera.position.copy(controls.target).add(new THREE.Vector3(Math.sin(yaw) * d * 0.66, d * 0.75, Math.cos(yaw) * d * 0.66));
  controls.update();
}
// 性能取样（tools/scenecheck.mjs）：连推 n 帧，每帧记绘制次数、三角面数、耗时（毫秒）
// 后期效果一帧会 render 好几次：关掉 info.autoReset、每帧手动清零，才是整帧的总数；耗时用真实时钟（录制工具把 performance.now 换成了虚拟时间），读回 1 个像素等显卡画完，算上 GPU
function perfSample(n = 30) {
  const info = renderer.info, gl = renderer.getContext(), px = new Uint8Array(4), now = window.__rec?.realNow || (() => performance.now()), out = [];
  info.autoReset = false;
  for (let i = 0; i < n; i++) {
    info.reset(); const t0 = now();
    frame(1 / 30); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    out.push([info.render.calls, info.render.triangles, +(now() - t0).toFixed(2)]);
  }
  info.autoReset = true; info.reset();
  return out;
}
// 看得清他（tools/elderlook.mjs）：每次渲染前把爷爷钉在 p（null 解除），look：normal 正常、hide 藏起来（拍他身后的背景）、mask 涂成纯品红（得到他身上的像素）
// 用 scene.onBeforeRender：在人物更新之后、真正画之前生效，同一帧里不会被 actors.js 改回去；脚下的圈一律收起（只量他本人）
let pinMats = null; const pinHid = new Set();
let maskMat = null;   // 透明＋后画（renderOrder）：画在雾片之后，被雾盖住的部分也算他的像素
function elderPin(p, look = 'normal') {
  const meshes = []; elder.root.traverse(o => { if (o.isMesh && o !== elderRing) meshes.push(o); });
  pinMats ||= new Map(meshes.map(o => [o, o.material]));
  for (const o of meshes) { o.material = look === 'mask' ? (maskMat ||= new THREE.MeshBasicMaterial({ color: 0xff00ff, fog: false, transparent: true })) : pinMats.get(o) || o.material; o.renderOrder = look === 'mask' ? 10 : 0; }
  run.debugElder = p && new THREE.Vector3(p.x, 0, p.z);   // 雾片在他身边让开（main.js updateMistHole）按钉住的位置算
  if (!p) { pinMats = null; scene.onBeforeRender = () => {}; elderRing.visible = true; for (const o of pinHid) o.visible = true; pinHid.clear(); return; }
  scene.onBeforeRender = () => {
    elder.root.position.set(p.x, 0, p.z); elder.root.rotation.y = p.ry ?? 0.6; elder.root.visible = look !== 'hide'; elderRing.visible = false;
    for (const o of scene.children) if (o.userData.tag === 'person' && o !== elder.root && o.visible && Math.hypot(o.position.x - p.x, o.position.z - p.z) < 3) { o.visible = false; pinHid.add(o); }   // 路过的行人挡在他身上会让数值忽高忽低：身边 3 以内的人先藏起来
  };
}
// 看得见他（camera.seenFrom 按格子加速）与原来逐个三角形的结果对比：小镇里随机取 n 个人站的位置、各从 6 个方向看，返回不一致的个数与两种的平均耗时
function sightCheck(n = 60) {
  let diff = 0, tf = 0, ts = 0, rnd = 12345; const R = () => (rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff, at = new THREE.Vector3(), eye = new THREE.Vector3(), bad = [];
  for (let i = 0; i < n; i++) {
    const p = graph.pos[Math.floor(R() * graph.pos.length)]; at.set(p.x + (R() - 0.5) * 6, 0, p.z + (R() - 0.5) * 6);
    for (let k = 0; k < 6; k++) {
      const th = R() * Math.PI * 2, ph = 0.35 + R() * 1.1, d = 25 + R() * 50;
      eye.set(at.x + Math.sin(ph) * Math.sin(th) * d, Math.cos(ph) * d, at.z + Math.sin(ph) * Math.cos(th) * d);
      let t0 = performance.now(); const a = seenFrom(eye, at, [town.root]); tf += performance.now() - t0;
      t0 = performance.now(); const b = seenFromSlow(eye, at, [town.root]); ts += performance.now() - t0;
      if (a !== b) { diff++; if (bad.length < 5) bad.push([+at.x.toFixed(1), +at.z.toFixed(1), a, b]); }
    }
  }
  return { n: n * 6, diff, bad, fastMs: +(tf / n / 6).toFixed(3), slowMs: +(ts / n / 6).toFixed(3) };
}
function lineup() {
  const base = graph.pos[nid(3, 5)].clone().add(new THREE.Vector3(0, 0, 3));
  const ppl = [elder, kid, companion, chessFriend, ...Object.values(helperPeople).map(h => h.person)];
  sim.leaveDay(); run.lineupOn = true;   // 站队只用于看造型：停住模拟，免得他们被拉走
  ppl.forEach((p, i) => { p.root.visible = true; p.root.position.copy(base).add(new THREE.Vector3((i - (ppl.length - 1) / 2) * 1.6, 0, 0)); p.root.rotation.y = 0.35; });
  cam.follow = false; cam.pan = null; cam.zoom = null;
  controls.target.copy(base).setY(1.2);
  camera.position.copy(base).add(new THREE.Vector3(0, 2.4, 5.2));
  controls.update();
}

// ---------- 入口约定 ----------
// 测试与视频工具依赖（改动前先改工具）：sim（模拟对象，最常用）、setSpeed、run(秒)、screenOf(路口)、trailLabel、trailMap、routeGuide、
//   recall、clockG、chessG、steps、scam、ending、elderPos、kidState、elderRoot。
// 仅人工调试：audioState（声音系统状态）、lineup（人物站队看造型）、foodSheet、faces、drawStats、voices、look、frames(n) 等；
//   地基与画面（10-06）：space(true) 调试画面、clearance()、overlaps()、spaceCheck()、spacePath(a,b)、time(分钟) 固定画面时间、opening() 直接播开场。
// 3D 画面比对与性能上限（tools/scenecheck.mjs）依赖：time、shotCam、perfSample、crowdPos、kidState、elderPos、cars、sim、setSpeed。
// 看得清他（tools/elderlook.mjs）依赖：elderPin、setMist、mistState、walkable、graph、time、shotCam、sim。

// ---------- 穿模检测：每 0.1 秒看一次所有可见的人是否都在路上、门口进出路线或屋里（tools/walkcheck.mjs 调用） ----------
const segDist = (p, a, b) => { const abx = b.x - a.x, abz = b.z - a.z, t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / (abx * abx + abz * abz || 1))); return Math.hypot(p.x - a.x - abx * t, p.z - a.z - abz * t); };
const lineDist = (p, pts) => { let m = 1e9; for (let i = 1; i < pts.length; i++) m = Math.min(m, segDist(p, pts[i - 1], pts[i])); return pts.length === 1 ? Math.hypot(p.x - pts[0].x, p.z - pts[0].z) : m; };
// 地基（10-05）：能不能站在这里——直接用可行走地图（人行道、斑马线、门口一串点、真能站人的空地）＋家里；不再有“社区中心周围 6.5 内的人群一律放行”这类特例
function walkAllowed(p) { return space.isWalkable(p) || insideHome(p); }
let auditTimer = null; const auditLog = {};
// 试玩审查：冒出来的文字（气泡、邻居的话、消息）与爷爷的折返
const textLog = [], turnLog = [], residueLog = [];
let lastTexts = new Set(), trail = [];
const onRoadPt = (p) => { for (let i = 0; i < graph.adj.length; i++) for (const j of graph.adj[i]) { const a = graph.pos[i], b = graph.pos[j], abx = b.x - a.x, abz = b.z - a.z, t = Math.max(0,
  Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / (abx * abx + abz * abz))); if (Math.hypot(p.x - a.x - abx * t, p.z - a.z - abz * t) < 0.6) return true; } return false; };
let auditTick = 0, hidT = 0, hidAt = null;
const fmt2 = (p) => `@(${p.x.toFixed(1)},${p.z.toFixed(1)})`;
export function walkAudit(on = true) {
  clearInterval(auditTimer); if (!on) return;
  for (const k in auditLog) delete auditLog[k];
  textLog.length = 0; turnLog.length = 0; residueLog.length = 0; const residue = {}; let clickT = null;
  // 关卡里点推进按钮：记下这一刻（声音时钟）；点完 0.5 秒后，点之前就开始的关卡台词还在播＝没停干净
  if (!window.__mgClickHook) { window.__mgClickHook = true; addEventListener('click', (ev) => { if (ev.target.closest?.('#game button.primary, #game .row button:not(#scTap)')) window.__mgClickT = voiceNow().t; }, true); }
  window.__mgClickT = null; lastTexts = new Set(); trail = []; let lastMode = null, leftAt = -1e9, leftTarget = null;
  auditTimer = setInterval(() => {
    // 文字：新出现的才记（同一条一直显示不重复记）
    const now = new Set();
    document.querySelectorAll('#bubbles .bubble, #bubbles .hbubble, #bubbles [class*=bubble], #feed .msg, #feed > *').forEach(el => { if (el.offsetParent && el.textContent.trim()) now.add(el.textContent.trim().slice(0, 60)); });
    for (const t of now) if (!lastTexts.has(t)) textLog.push([Math.round(sim.time || 0), t]);
    lastTexts = now;
    // 残留声音：关卡关了、犹豫面板关了，这一段的话还在播（给 0.5 秒余地）
    { const tags = voiceTags(), open = { game: !document.querySelector('#game')?.classList.contains('hidden') }; open.moment = open.game || !document.querySelector('#moment')?.classList.contains('hidden');   // 犹豫时刻转进它自己的关卡，那句话接着说是对的
      for (const k of ['game', 'moment']) { if (tags.includes(k) && !open[k]) { residue[k] ??= performance.now(); if (performance.now() - residue[k] > 500 && residueLog.length < 10) {
        residueLog.push(`${Math.round(sim.time || 0)}分 ${k === 'game' ? '关卡' : '犹豫时刻'}关了，话还在播`); residue[k] = Infinity; } } else if (residue[k] !== Infinity || !tags.includes(k)) delete residue[k]; } }
    { const vn = voiceNow(), ct = window.__mgClickT; if (ct != null && vn.t - ct > 0.5) { if (vn.playing.some(p => p.tag === 'game' && p.startAt < ct) && residueLog.length < 10) residueLog.push(`${Math.round(sim.time || 0)}分 关卡里点了按钮，上一步的话还在播`); window.__mgClickT = null; } }
    // 刚出门（办完事／从家）：记下时刻；出门几秒内就掉头＝先走过头再折回
    // 只算从门口出发（半路放弃“算了，回家吧”原地掉头不算）（10-07：这句赋值原来写在注释后面没执行，出门折返检查一直没生效）
    const mode = sim.e?.mode; if (mode === 'walk' && ['task', 'home', 'entering'].includes(lastMode)) { const p = sim.e.pos; leftAt = Object.values(sim.gates || {}
      ).flat().some(d => Math.hypot(d.pos.x - p.x, d.pos.z - p.z) < 1.5) ? performance.now() : -1e9; leftTarget = sim.e.target; } lastMode = mode;
    // 折返：画面上的爷爷在路上走，方向突然反过来（点积 < -0.9），记下时刻与位置
    if (elder?.root?.visible && sim.e && ['walk', 'entering', 'task'].includes(sim.e.mode)) {
      const p = elder.root.position; const last = trail[trail.length - 1];
      if (!last || Math.hypot(p.x - last.x, p.z - last.z) > 0.8) {
        trail.push({ x: p.x, z: p.z, t: Math.round(sim.time || 0), m: sim.e.mode });
        if (trail.length > 3) trail.shift();
        if (trail.length === 3) {
          const [a, b, c] = trail, d1x = b.x - a.x, d1z = b.z - a.z, d2x = c.x - b.x, d2z = c.z - b.z;
          const dot = (d1x * d2x + d1z * d2z) / (Math.hypot(d1x, d1z) * Math.hypot(d2x, d2z) || 1);
          if (dot < -0.9) turnLog.push(`${b.t}分 (${b.x.toFixed(1)},${b.z.toFixed(1)}) ${b.m}${sim.e.lost ? ' 迷路中' : ''}${sim.e.goal ? ' \
去' + (sim.e.goal.place || '') : ''}${!sim.e.lost && !sim.e.drift && performance.now() - leftAt < 4000 && sim.e.target === leftTarget && onRoadPt(b) ?   /* 中途改了目的地（如棋友已走、改去菜市场）的回头不算 */ ' 出门折返' : ''}`);   // 只看马路上的掉头（进楼再原路出楼不算）
        }
      }
    }
    const who = { 爷爷: elder, 孙女: kid, 陪同: companion, ...Object.fromEntries(Object.entries(helperPeople).map(([id, h]) => ['邻居' + id, h.person])), ...Object.fromEntries(crowd.map((p, i) => ['人群' + i, p])) };
    for (const [name, pr] of Object.entries(who)) {
      if (!pr?.root?.visible) continue;
      const p = pr.root.position;
      if (walkAllowed(p)) continue;
      const a = auditLog[name] ||= { n: 0, first: null, where: [] };
      a.n++; if (!a.first) a.first = Math.round(sim.time || 0);
      if (a.where.length < 4) a.where.push(`${Math.round(sim.time || 0)}分@(${p.x.toFixed(1)},${p.z.toFixed(1)}) ${sim.e?.mode || ''}`);
    }
    const rec = (key, msg) => { const a = auditLog[key] ||= { n: 0, first: null, where: [] }; a.n++; if (!a.first) a.first = Math.round(sim.time || 0); if (a.where.length < (window.__auditMax || 4)) a.where.push(`${Math.round(sim.time || 0)}分 ${msg}`); };
    const ppl = [...Object.entries(who).filter(([, pr]) => pr?.root?.visible).map(([n, pr]) => [n, pr.root.position]), ...walkers.positions().map(p => ['行人', p])];
    // 车穿人（09-28 用户）：车身范围里有人（上面这些人和路上的行人）
    for (const c of cars.list) {
      const fx = Math.sin(c.g.rotation.y), fz = Math.cos(c.g.rotation.y);
      for (const [nm, q] of ppl) { const dx = q.x - c.g.position.x, dz = q.z - c.g.position.z; if (Math.abs(dx * fx + dz * fz) < 1.0 && Math.abs(dx * fz - dz * fx) < 0.6) rec('车穿人',
        `${nm}${nm === '行人' ? '(' + walkers.debugAt(q) + ')' : ''} 车速${c.v.toFixed(1)} ${c.phase} ${c.a}→${c.b}→${c.next} t${(c.t || 0).toFixed(2)} ${c.why || ''} 车(${c.g.position.x.toFixed(1)},${c.g.position.z.toFixed(1)})@(${q.x.toFixed(1)},${q.z.toFixed(1)})`); }
    }
    // 地基检查（10-05，地基方案第一步）：用小镇合并前从网格算出的实际外形（town.solids），不依赖任何移动代码
    // 进墙：人站进实体里（房子、树干、路灯杆、电影院、水井、菜摊、棋亭、家里的墙）；能进去的楼只许爷爷进
    for (const [nm, q] of ppl) for (const sd of town.solids) {
      const d = insideDepth(q, sd); if (d <= 0.05) continue;
      if (sd.enterable && nm === '爷爷') continue;
      rec('进墙', `${nm}${nm === '行人' ? '(' + walkers.debugAt(q) + ')' : ''} 进了${SOLID_NAME[sd.kind] || sd.kind}${sd.enterable ? '（能进的楼，只许爷爷）' : ''} 深${d.toFixed(2)}@(${q.x.toFixed(1)},${q.z.toFixed(1)})`);
    }
    // 车出路面（09-29 next 分支移植）：车身四个角都要在路面上——路段宽 3.2，路口铺 3.2 见方
    for (const c of cars.list) {
      const fx = Math.sin(c.g.rotation.y), fz = Math.cos(c.g.rotation.y);
      for (const [sf, sl] of [[CAR.hl, CAR.hw], [CAR.hl, -CAR.hw], [-CAR.hl, CAR.hw], [-CAR.hl, -CAR.hw]]) {   // 车身四角（和过路口路线用的同一组尺寸）
        const q = { x: c.g.position.x + fx * sf + fz * sl, z: c.g.position.z + fz * sf - fx * sl };
        if (!onRoadSurface(q, 0.1)) { rec('车出路面', `出去@(${q.x.toFixed(1)},${q.z.toFixed(1)}) ${c.phase || ''} ${c.a}→${c.b}→${c.next} 车(${c.g.position.x.toFixed(1)},${c.g.position.z.toFixed(1)}) 角${c.g.rotation.y.toFixed(2)}`); break; }
      }
      if ((c.still || 0) > 12) rec('车僵住', `@(${c.g.position.x.toFixed(1)},${c.g.position.z.toFixed(1)}) ${c.phase} ${c.why || ''}${c.whyAt ? '(' + c.whyAt + ')' : ''} 附近：${ppl.filter(([,
        q]) => Math.hypot(q.x - c.g.position.x, q.z - c.g.position.z) < 5).map(([nm,
        q]) => nm + (nm === '行人' ? '(' + walkers.debugAt(q).split('|').pop() + ')' : nm === '爷爷' ? '(' + (run.elderWhy || run.elderStep || '') + ')' : '(' + (q.why
          || '') + ')') + `@${q.x.toFixed(1)},${q.z.toFixed(1)}`).join(' ')} 别的车：${cars.list.filter(o => o !== c).map(o => `${o.phase}${o.go ? '已进' : ''}@${o.g.position.x.toFixed(1)},${o.g.position.z.toFixed(1)} ${o.why || ''}${o.whyAt ? '(' + o.whyAt + ')' : ''}`).join('；')}`);
        
    }
    // 路人僵住：不在歇脚却 10 秒没挪窝
    for (const p of walkers.stuck(10)) rec('路人僵住', `@(${p.x.toFixed(1)},${p.z.toFixed(1)}) ${p.why}`);
    motionAudit(who, rec);
    // 看不见他（10-08 画面可读性）：他在外面、镜头跟着他，却大半个身子被房子、树冠、棚顶挡住，停着时连续 4 秒、走路时 6 秒以上（每 0.3 秒量一次，和镜头调整同一口径 camera.seenFrom）
    if ((auditTick = (auditTick + 1) % 3) === 0) {
      const live = sim.phase === 'live' && !sim.moment && elder.root.visible && cam.follow && !document.querySelector('#game:not(.hidden)');
      const v = live ? seenFrom(camera.position, elder.root.position, [town.root]) : 1;
      const fc = run.frameClock || 0, step = Math.max(0, fc - (hidAt ?? fc)); hidAt = fc;   // 按画面实际走过的时间（和镜头同一个钟；无头掉帧时真实时间比它快）
      hidT = v < (window.__hidMax ?? 0.5) ? hidT + (cam.pan || cam.zoom ? 0 : step) : 0;   // 镜头正在平移、推拉（到地方时推近）：不计，等镜头停下再算——和镜头调整同一口径
      // 走路时路过树下一会儿看不见算正常：超过 6 秒才记；停着（办事、犹豫）4 秒就记（镜头 1.5 秒后找角度、约 1 秒转过去，留出余量）
      // 记一次后 30 秒内不重复记
      if (hidT >= (sim.e?.mode === 'walk' && (run.elderV || 0) > 0.5 ? 6 : 4)) { rec('看不见他',
        `${fmt2(elder.root.position)} ${sim.e?.mode || ''}${sim.e?.goal?.task ? '·' + sim.e.goal.task : ''} 看得见${Math.round(v * 3)}/3 镜头${JSON.stringify(sightState())}${run.sightWhy
          ? '（不调：' + run.sightWhy + '）' : ''}${sim.e?.mode === 'home'
          ? ' 镜头中心离家' + controls.target.distanceTo(homeWorld('doorIn')).toFixed(1) + ' 镜头远近' + camera.position.distanceTo(controls.target).toFixed(0) : ''} 跟随${cam.follow ? '开' : '关'}${cam.zoom ? ' 推拉中' : ''}${cam.pan ? ' 平移中' : ''}`);
        hidT = -30; }
    }
    // 人叠人：两个人的中心不到 0.3（各自身体约 0.3 宽）
    for (let i = 0; i < ppl.length; i++) for (let k = i + 1; k < ppl.length; k++) { const [a, p] = ppl[i], [b, q] = ppl[k]; if (Math.hypot(p.x - q.x, p.z - q.z) < 0.3) rec('人叠人',
      `${a}与${b}@(${p.x.toFixed(1)},${p.z.toFixed(1)}) 距${Math.hypot(p.x - q.x,
      p.z - q.z).toFixed(2)} 网${+space.isWalkable(p)}${+space.isWalkable(q)} 站${+space.canStand(p)}${+space.canStand(q)}${b === '行人' ? ' ' + walkers.debugAt(q) : ''}${a === '爷爷' ? ' 爷爷' + (run.elderWhy || run.elderSlow || run.elderStep || '') + ' ' + (sim.e?.mode || '') : ''}`); }
  }, 100);
}
// ---------- 动得对不对（10-06 根治：原来的检查只看“站的位置”，车横着滑、队伍等很久再冲刺、孙女跟不上都放行）----------
// 冲刺：人一次移动超过正常走路速度（3.2×倍速×1.3）的 1.6 倍；车超过最快车速（6×0.7—2 倍）的 1.25 倍
// 横移：人在走（>0.3/秒）而走的方向和脸朝向差 75° 以上，连续 0.3 秒；车侧滑（横向占比 >0.2）
// 掉队：领头的人在走，跟随的人离他比该有的间隔远 4 以上并持续 2 秒；不跟：领头的人 1 秒里走了 1 以上，跟随的人原地没动、又没贴着前面的人
const mot = { prev: new Map(), token: null, t: 0 };
const HUMAN_SP = () => Math.max(3.2, sim.walkRate ? sim.walkRate() : 3.2) * Math.max(1, run.speed || 1, mot.lastSpeed || 1) * 1.3;   // 和画面同一个来源（actors.elderSp）：规则层此刻的速度×倍速×1.3；刚换过倍速按快的算
function motionAudit(who, rec) {
  const now = run.frameClock || 0, dt = mot.t ? now - mot.t : 0; mot.t = now;   // 按画面实际走过的时间（见 main.frame）
  if (mot.t && dt < 1e-4) return;   // 两次检查之间没出新帧
  if (mot.token !== sim.dayToken) { mot.token = sim.dayToken; mot.prev.clear(); }
  if (!(dt > 0.02 && dt < 0.5) || !(run.speed > 0)) { mot.prev.clear(); return; }   // 暂停、切后台：不算
  const fmt = (p) => `@(${p.x.toFixed(1)},${p.z.toFixed(1)})`, T = Math.round(sim.time || 0);
  const lead = elder.root.position, leadPrev = mot.prev.get('爷爷');
  const leadMoved = leadPrev && leadPrev.vis ? Math.hypot(lead.x - leadPrev.x, lead.z - leadPrev.z) : 0;
  mot.leadHist = (mot.leadHist || []).concat([[now, lead.x, lead.z]]).filter(h => now - h[0] <= 1.05);
  const followers = { 陪同: [companion, 1.5], 孙女: [kid, 0.9], ...(run.hiking ? Object.fromEntries(crowd.map((p, i) => ['人群' + i, [p, hikeBack(i)]])) : {}) };
  for (const [name, pr] of Object.entries(who)) {
    const p = pr?.root?.position; if (!p) continue;
    const vis = !!pr.root.visible, last = mot.prev.get(name);
    mot.prev.set(name, { x: p.x, z: p.z, vis, ry: pr.root.rotation.y, hist: ((last?.hist) || []).concat([[now, p.x, p.z]]).filter(h => now - h[0] <= 1.05), side: last?.side || 0, far: last?.far || 0 });
    // 出现、消失、换位置都要经过 presence.js（出入门、淡入淡出、整屏换场），没有按场景的豁免（10-14 用户：瞬移要全局设计协调）：
    // 一天进行中，在镜头里显隐、最近 0.6 秒又没经过 presence 的，报“凭空出现／消失”
    const viaPresence = performance.now() - (pr.root.userData.presenceT || -1e9) < 600;
    if (last && vis !== last.vis && !viaPresence && sim.phase === 'live' && onScreen(p)) rec(vis ? '凭空出现' : '凭空消失', `${name}${fmt(p)} ${sim.e?.mode || ''}`);
    if (!vis || !last?.vis) continue;   // 刚出现、刚消失：位置不连续是正常的（上面已经查过是不是经过 presence）
    const mv = Math.hypot(p.x - last.x, p.z - last.z), v = mv / dt, cur = mot.prev.get(name);
    // 顿挫（10-07 用户：人到路口突然减速、卡顿）：正走着，速度短暂掉到前后一秒中位数的四成以下、半秒内又恢复——真停下来等（等车、等人）会停得更久，不算
    { const sh = (cur.sp = ((last.sp) || []).concat([v]).slice(-10)),
      wh = (cur.wh = ((last.wh) || []).concat([(name === '爷爷' ? (run.elderWhy || run.elderSlow || run.elderStep || '') : (pr.root.userData.why || '')) + (run.ruleStill ? '·规则层停' : '') + '×' + run.speed]).slice(-10));
      if (sh.length === 10) { const med = [...sh].sort((x, y) => x - y)[5], dip = sh.slice(3, 7);
        if (med > 1 && dip.some(x => x < med * 0.4) && sh.slice(0, 3).every(x => x > med * 0.7) && sh.slice(7).every(x => x > med * 0.7) && !wh.slice(2,
          8).some(x => x.includes('规则层停')) && new Set(wh.map(x => x.split('×').pop())).size === 1 && !(name in followers && (() => { const es = mot.prev.get('爷爷')?.sp || []; const em = [...es].sort((x,
          y) => x - y)[Math.floor(es.length / 2)] || 0; return es.length >= 6 && es.some(x => x < em * 0.5); })())) { rec('顿挫', `${name}(${[...new Set(wh.slice(2, 8).map(x => x.replace(/×[\d.]+$/,
          '')))].join('/')}) 速度${dip.map(x => x.toFixed(1)).join('/')}（前后约${med.toFixed(1)}）${fmt(p)} ${sim.e?.mode || ''}`); cur.sp = []; cur.wh = []; } } }
    if (v > HUMAN_SP() * 1.6 && !viaPresence) rec(v > HUMAN_SP() * 6 ? '瞬移' : '冲刺',
      `${name} 速度${v.toFixed(1)}（正常${HUMAN_SP().toFixed(1)}）从${fmt(last)}${fmt(p)} ${sim.e?.mode || ''}${name.startsWith('邻居') ? ' ' + (helperPeople[name.slice(2)]?.state?.phase || (nbActs[name.slice(2)] ? '活动' : '-')) + ' ' + (helperPeople[name.slice(2)]?.dbg || []).join(' ') : ''}`);
    if (v > 0.3) {
      const fx = Math.sin(pr.root.rotation.y), fz = Math.cos(pr.root.rotation.y), dx = (p.x - last.x) / mv, dz = (p.z - last.z) / mv;
      cur.side = fx * dx + fz * dz < Math.cos(75 * Math.PI / 180) ? last.side + dt : 0;
      if (cur.side > 0.3) { rec('横移', `${name} 走向与朝向差${Math.round(Math.acos(Math.max(-1, Math.min(1, fx * dx + fz * dz))) * 180 / Math.PI)}°${fmt(p)}`); cur.side = 0; }
    } else cur.side = 0;
    const f = followers[name];
    if (f && name !== '爷爷' && elder.root.visible && sim.e && sim.e.mode !== 'home') {
      const gap = Math.hypot(p.x - lead.x, p.z - lead.z), leadWalking = leadMoved / dt > 0.5;
      cur.far = leadWalking && gap > f[1] + 4 ? last.far + dt : 0;
      if (cur.far > 2) { rec('掉队', `${name} 离爷爷${gap.toFixed(1)}（该${f[1]}）${fmt(p)} ${sim.e.mode}`); cur.far = 0; }
      const h = cur.hist, lh = mot.leadHist;
      if (h.length > 5 && lh.length > 5 && now - h[0][0] > 0.9) {
        const selfMv = Math.hypot(p.x - h[0][1], p.z - h[0][2]), leadMv = Math.hypot(lead.x - lh[0][1], lead.z - lh[0][2]);
        const packed = [elder, companion, kid, ...crowd].some(o => o !== pr && o.root.visible && Math.hypot(o.root.position.x - p.x, o.root.position.z - p.z) < 0.9);   // 贴着前面的人排队等：不算
        const crossWait = performance.now() - (pr.root.userData.crossWait || -1e9) < 1000;   // 在路边等车过路口：不算
        if (leadMv > 1 && selfMv < 0.05 && gap > f[1] + 1.5 && !packed && !crossWait) { rec('不跟', `${name} 爷爷走了${leadMv.toFixed(1)}他没动 离${gap.toFixed(1)}${fmt(p)} ${pr.root.userData.why || ''}`); cur.hist = [[now, p.x, p.z]]; }
      }
    }
  }
  // 画面卡住：规则层里他在走（或在进门），画面里的他 10 秒没挪窝——人被丢在原地（10-06：斑马线死结、时钟放行后爷爷一直站在路口）
  { const pv = mot.elderStill || { x: lead.x, z: lead.z, t: 0 }; const moved = Math.hypot(lead.x - pv.x, lead.z - pv.z) > 0.05;
    mot.elderStill = moved ? { x: lead.x, z: lead.z, t: 0 } : { ...pv, t: ['walk', 'entering'].includes(sim.e?.mode) && sim.phase === 'live' && !sim.moment && run.effSpeed > 0 ? pv.t + dt : 0 };   // 时钟停着（讲往事、暂停）时站着不算
    if (mot.elderStill.t > 10) { rec('画面卡住', `爷爷画面 10 秒没动${fmt(lead)} 规则层${sim.e?.mode} ${JSON.stringify(navDebug())}`); mot.elderStill.t = 0; } }
  // 互相等：规则层为了等画面（sim.visualLag）连续停住 5 秒以上——画面里的人也没在赶过来，就是卡死了（10-06 健步走：爷爷等队伍、队伍等足迹）
  mot.lagT = (run.lagHeldT || 0) > 0 ? (mot.lagT || 0) + dt : 0;
  if (mot.lagT > 7) { rec('互相等', `爷爷等画面已 ${mot.lagT.toFixed(0)} 秒${fmt(lead)} ${sim.e?.mode || ''} ${run.lagWhy || ''} 画面[${run.elderWhy || ''}/${run.elderSlow || ''}/${run.elderStep || ''}] 队列${JSON.stringify(navDebug?.() || {}).slice(0, 160)}`); mot.lagT = 0; }
  // 路人：顿挫（同上口径；在等车、等人、歇脚的不算——那些会停得更久）
  walkers.positions().forEach((p, i) => {
    const key = '行人' + i, last = mot.prev.get(key), v = last ? Math.hypot(p.x - last.x, p.z - last.z) / dt : 0, sh = (last?.sp || []).concat([v]).slice(-10), wh = (last?.wh || []).concat([walkers.debugAt(p).replace(/歇\S+ /, '') + '×' + run.speed]).slice(-10);
    mot.prev.set(key, { x: p.x, z: p.z, sp: sh, wh });
    if (sh.length === 10) { const med = [...sh].sort((x, y) => x - y)[5], dip = sh.slice(3, 7);
      if (med > 1 && dip.some(x => x < med * 0.4) && sh.slice(0, 3).every(x => x > med * 0.7) && sh.slice(7).every(x => x > med * 0.7) && new Set(wh.map(x => x.split('×').pop())).size === 1) {
        rec('路人顿挫', `${key}(${[...new Set(wh.slice(2, 8).map(x => x.replace(/×[\d.]+$/, '')))].join(' | ')}) 速度${dip.map(x => x.toFixed(1)).join('/')}（前后约${med.toFixed(1)}）${fmt(p)}`); mot.prev.get(key).sp = []; mot.prev.get(key).wh = []; } }
  });
  // 车：冲刺、侧滑
  const spNow = run.speed; setTimeout(() => { mot.lastSpeed = spNow; }, 0);
  cars.list.forEach((c, i) => {
    const key = '车' + i, last = mot.prev.get(key), p = c.g.position, mv0 = last ? Math.hypot(p.x - last.x, p.z - last.z) : 0, v = mv0 / dt;
    mot.prev.set(key, { x: p.x, z: p.z, vis: true, ry: c.g.rotation.y, v, cv: c.v });
    if (!last) return;
    // 急刹、急起步（10-07 用户：车到路口突然停、突然走）：用车自己的车速（c.v，车自己的时间）算加速度——位置差会把“换倍速”误算成急刹；
    // 车的时间 = 真实时间 × sf（main.js lifeDt）；刹车超过 9、起步超过 6（世界单位／秒²）
    { const sf0 = Math.max(0.7, Math.min(run.speed, 2)), a = (c.v - (last.cv ?? c.v)) / (dt * sf0);
      if (a < -9) rec('急刹', `${key} ${(last.cv ?? 0).toFixed(1)}→${c.v.toFixed(1)} ${c.phase || ''} ${c.why || ''}${fmt(p)} 前几帧[${(c.hist || []).join(' ')}] 附近：${[...Object.entries(who).filter(([,
        pr]) => pr?.root?.visible).map(([n, pr]) => [n, pr.root.position, pr.root.userData.why || '']), ...walkers.positions().map(q => ['行人', q, walkers.debugAt(q)])].filter(([,
        q]) => Math.hypot(q.x - p.x, q.z - p.z) < 4).map(([n, q, w]) => `${n}(${w.trim()})@${q.x.toFixed(1)},${q.z.toFixed(1)}`).join(' ')}`);
      else if (a > 6) rec('急起步', `${key} ${(last.cv ?? 0).toFixed(1)}→${c.v.toFixed(1)} ${c.phase || ''}${fmt(p)}`); }
    const mv = mv0; if (mv / dt < 0.3) return;
    const sf = Math.max(0.7, Math.min(Math.max(run.speed, mot.lastSpeed ?? run.speed), 2)), carMax = 6 * sf * 1.25;   // 车按 main.js 的 lifeDt 走：最快 6×(0.7—2 倍)；刚换过倍速按快的算
    if (mv / dt > carMax) rec('冲刺', `${key} 速度${(mv / dt).toFixed(1)}（最快${carMax.toFixed(1)}）${fmt(p)}`);
    const ry = Math.atan2(Math.sin(c.g.rotation.y) + Math.sin(last.ry ?? c.g.rotation.y), Math.cos(c.g.rotation.y) + Math.cos(last.ry ?? c.g.rotation.y));   // 这 0.1 秒里车头的平均朝向（转弯时两头朝向不同，弦和中间的朝向一致）
    const fx = Math.sin(ry), fz = Math.cos(ry), lat = Math.abs(((p.x - last.x) * fz - (p.z - last.z) * fx) / mv);
    const turned = Math.abs(Math.atan2(Math.sin(c.g.rotation.y - (last.ry ?? c.g.rotation.y)), Math.cos(c.g.rotation.y - (last.ry ?? c.g.rotation.y))));
    if (lat > 0.2 && turned < 0.2) rec('横移', `${key} 侧滑${lat.toFixed(2)} ${c.phase || ''}${fmt(p)}`);   // 只在车头几乎没转时判：横移＝车头不转、车身横着挪（用户看到的 S 形）；边走边转弯时取样间隔里车头已转过一截，弦和朝向本来就有差
  });
}
// 调试画面（地基）：__mg.space(true) 在场景里画出实体外形（红；能进的楼橙）和路面（灰），false 收起
let spaceG = null;
function debugSpace(on = true) {
  if (spaceG) { scene.remove(spaceG); spaceG = null; }
  if (!on) return false;
  spaceG = new THREE.Group(); spaceG.userData.tag = 'debugSpace';
  const loop = (pts, color, y) => { const g = new THREE.BufferGeometry().setFromPoints(pts.map(p => new THREE.Vector3(p.x, y, p.z))); spaceG.add(new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color, depthTest: false }))); };
  for (const sd of town.solids) loop(sd.corners, sd.enterable ? 0xff9a2e : 0xff2e2e, 0.4);
  for (let i = 0; i < graph.adj.length; i++) {
    if (!graph.adj[i].length) continue;
    const n = graph.pos[i]; loop([{ x: n.x - 1.6, z: n.z - 1.6 }, { x: n.x + 1.6, z: n.z - 1.6 }, { x: n.x + 1.6, z: n.z + 1.6 }, { x: n.x - 1.6, z: n.z + 1.6 }], 0x8a8a8a, 0.3);
  }
  // 人行网：人行道蓝、过街黄、门口绿
  for (let a = 0; a < space.adj.length; a++) for (const e of space.adj[a]) {
    if (e.to < a) continue; const A = space.nodes[a], B = space.nodes[e.to];
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(A.x, 0.35, A.z), new THREE.Vector3(B.x, 0.35, B.z)]);
    spaceG.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: e.cross != null ? 0xffd23a : (A.kind === 'corner' || A.kind === 'entry') && (B.kind === 'corner' || B.kind === 'entry') ? 0x3a8bff : 0x2ecc71, depthTest: false })));
  }
  spaceG.renderOrder = 999; scene.add(spaceG);
  return town.solids.length;
}
// 地基检查用：点在实体（地面上的凸四边形）里多深（到最近一条边的距离；在外面为负）
const SOLID_NAME = { house: '房子', pole: '树干或路灯杆', stall: '菜摊', post: '棋亭柱子', table: '棋桌', cinema: '老电影院', well: '水井', homeWall: '家里的墙', roots: '老榕树树根台' };
function insideDepth(p, sd) {
  const c = sd.corners; let depth = 1e9, area = 0;
  for (let i = 0; i < 4; i++) { const a = c[i], b = c[(i + 1) % 4]; area += a.x * b.z - b.x * a.z; }   // 四边形自身的走向（顺／逆时针）
  const sign = Math.sign(area) || 1;
  for (let i = 0; i < 4; i++) {
    const a = c[i], b = c[(i + 1) % 4], ex = b.x - a.x, ez = b.z - a.z, len = Math.hypot(ex, ez) || 1;
    const d = (ex * (p.z - a.z) - ez * (p.x - a.x)) / len * sign;   // 到这条边的有向距离，里面为正
    if (d < 0) return d; depth = Math.min(depth, d);
  }
  return depth;
}
// 路面：路段（宽 3.2）或路口方块（3.2 见方）；tol 余量
function onRoadSurface(q, tol = 0) {
  for (let i = 0; i < graph.adj.length; i++) {
    if (!graph.adj[i].length) continue;
    const n = graph.pos[i]; if (Math.abs(q.x - n.x) <= 1.6 + tol && Math.abs(q.z - n.z) <= 1.6 + tol) return true;
    for (const j of graph.adj[i]) if (j > i && segDist(q, graph.pos[i], graph.pos[j]) <= 1.6 + tol) return true;
  }
  return false;
}
export const walkReport = () => JSON.parse(JSON.stringify(auditLog));
export const reviewReport = () => ({ texts: textLog.slice(), turns: turnLog.slice(), residue: residueLog.slice() });
