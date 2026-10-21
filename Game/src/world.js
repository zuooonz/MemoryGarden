// 世界：小镇与道路图、天空云、行人车辆、特效、大气；人物（爷爷、陪同、棋友、人群、孙女、邻居）；路标与老照片；雨；画面档位与性能面板。依赖由 main.js 通过 initWorld 注入。
import { setCrossGate } from './mover.js';
import * as THREE from 'three';
import { canvasTexture } from './util.js';
import { createSpace } from './space.js';
import { NEIGHBORS, nid } from './data.js';
import { buildGraph, buildTown } from './town.js';
import { makeAtmos, makeSkyBodies } from './atmos.js';
import { makeSky, makeClouds, makeWalkers, makeCars, makeFx } from './ambient.js';
import { makePerson } from './person.js';
import { settings } from './store.js';
import { renderer, resize, scene, sun, _vp, bubblesEl } from './core.js';
;
export let labelEls;   // 地名标签（页面层）
export let graph;
export let town;
export let space;   // 地基：可行走地图（space.js），小镇建好后建
export let sky;
export let clouds;
export let walkers;
export let cars;
export let fx;
export let atmos;
export let skyBodies;
export let elder;
export let elderRing;
export let companion;
export let chessFriend;
export let kid;
export let signObjs;
export let rainGeo;
let rainPos;
export let rain;
let perfEl;
let perfOn;

export function initWorld() {
  // ---------- 世界 ----------
  graph = buildGraph();
  town = buildTown(scene, graph);
  space = createSpace(graph, town.solids); registerDoors();
  sky = makeSky(scene);
  clouds = makeClouds(scene);
  walkers = makeWalkers(scene, space, 8);
     // 按画面档位只让其中几个上街
  cars = makeCars(scene, graph, 3);
  // 过街让车：所有人一样（mover.js）
  setCrossGate({ onRoad: (p) => space.onRoad(p), want: (i) => cars.wantCross(space.crossings[i]), xing: (i) => !cars.crossingBlocked(space.crossings[i]), at: (p) => {
    const cr = space.crossings.find(c => Math.hypot(c.x - p.x, c.z - p.z) < 1.2); if (cr) cars.wantCross(cr); return !cr || !cars.crossingBlocked(cr); } });
  fx = makeFx(scene);
  atmos = makeAtmos(scene, { chimneys: town.chimneys, treeTops: town.treeTops });
  skyBodies = makeSkyBodies(scene);
     // 标题画面定在傍晚的金色时段

  elder = makePerson({ shirt: 0x6b7c8f, pants: 0x4a4c55, hair: 0xd9d9d9, cane: true, hat: 0x5f6368, scale: 1.1 });   // 09-29 用户：只把爷爷调低（原来 1.3，约 3.6 高，和整栋楼差不多；现约 3.06）；头顶气泡 overlays.js 3.2、说话位置 elderVoicePos 1.9 跟着调
  { const s0 = space.snap({ x: 0, z: 0 }); elder.root.position.set(s0.x, 0, s0.z); }   // 地基（10-06）：标题画面上他站在人行道上（原来停在原点，正好是一段路的中线）
     // 旧夹克、鸭舌帽、拐杖
  scene.add(elder.root);
  // 他脚下的圈（10-14 用户选 A）：一道细环＋脚下一圈很淡的同色光，和箭头路线一样细、一样干净；颜色是第一趟路线的赭橙。
  // 高度 0.27：原来 0.2，比人行道顶、草地还低，走到路边时圈被路沿切掉一截
  elderRing = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.1, 40), new THREE.MeshBasicMaterial({ color: 0xe07a4a, transparent: true, opacity: 0.95, depthWrite: false }));
  elderRing.rotation.x = -Math.PI / 2; elderRing.position.y = 0.27; elderRing.renderOrder = 4; elder.root.add(elderRing);
  { const glow = canvasTexture(64, 64, (x) => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.55, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.15, 24), new THREE.MeshBasicMaterial({ map: glow, color: 0xe07a4a, transparent: true, opacity: 0.35, depthWrite: false }));
    disc.position.z = -0.01; disc.renderOrder = 3; elderRing.add(disc); }   // 光挂在圈上（同一个平面、略低一点）：圈收起时一起收起
  companion = makePerson({ shirt: 0x5d6f82, pants: 0x3a3d45, hair: 0x2b2a33, scale: 1.12 });   // 身高按年龄、性别：中年男 1.12—1.15，老年男 1.1，女 1.02—1.05，孩子 0.62
  companion.root.visible = false; scene.add(companion.root);
  // 棋亭里等他的老朋友
  chessFriend = makePerson({ shirt: 0x6a6e73, pants: 0x3f414b, hair: 0xcfcfcf, hat: 0x3b3b3b, scale: 1.1 });
  { const c = town.placeObjs.park.position; chessFriend.root.position.set(c.x + 1.3, 0, c.z); chessFriend.root.rotation.y = -Math.PI / 2; scene.add(chessFriend.root); }
  { const cols = [0x6a6e73, 0x5b6b7a, 0x7a6250, 0x4a5a6a, 0x8a7a5a];
    for (let i = 0; i < 5; i++) { const p = makePerson({ shirt: cols[i], pants: 0x44464f, hair: i % 2 ? 0xdddddd : 0x777777, hat: i % 3 === 0 ? 0x3b3b3b : null, ...(i === 1 || i === 4 ? {
      hairStyle: 'perm', scale: 1.02 } : { scale: 1.1 }) }); p.root.position.copy(crowdSpot(i)); p.root.visible = false; scene.add(p.root); crowd.push(p); } }
  kid = makePerson({ shirt: 0x3d6aa8, pants: 0x3d6aa8, hair: 0x2b2a33, scale: 0.62, headR: 0.27, hairStyle: 'pigtails', scarf: 0xd33b2c, backpack: 0xd79a3a });
     // 蓝白校服、红领巾、书包
  kid.root.visible = false; scene.add(kid.root);
  for (const nb of NEIGHBORS) {
    // 王阿姨枣红开衫烫卷发；刘师傅蓝工装；赵大爷白背心光脑门；陈老板系围裙
    const look = { wang: { shirt: 0x8c3c48, hair: 0x3a3230, hairStyle: 'perm' }, li: { shirt: 0x3f5f86, hair: 0x2b2a33 }, zhao: { shirt: 0xe6e1d5, hair: 0xcfcfcf, hairStyle: 'bald' }, chen: { shirt: 0x4a4f58, hair: 0x2b2a33, apron: 0x8a8f72 } }[nb.id];
    const p = makePerson({ pants: 0x4b4b55, scale: { wang: 1.02, zhao: 1.1 }[nb.id] || 1.15, ...look });
    p.root.visible = false; scene.add(p.root); helperPeople[nb.id] = { person: p, state: null };
  }
  // 老街坊老孙：路上偶遇时出现（灰蓝夹克、白头发）
  { const p = makePerson({ shirt: 0x5b6b7a, pants: 0x44464f, hair: 0xbdbdbd, scale: 1.1 }); p.root.visible = false; scene.add(p.root); helperPeople.acq = { person: p, state: null }; }

  // 路标模型
  signObjs = new Map();

  // 雨
  rainGeo = new THREE.BufferGeometry();
     // 按画面档位只画其中一部分
  rainPos = new Float32Array(RAIN_N * 6);
  for (let i = 0; i < RAIN_N; i++) {
    const x = (Math.random() - 0.5) * 110, y = Math.random() * 60, z = (Math.random() - 0.5) * 90;
    rainPos.set([x, y, z, x + 0.15, y - 1.2, z], i * 6);
  }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xaabbcc, transparent: true, opacity: 0.5 }));
  rain.visible = false; scene.add(rain);
  // 性能面板（开发用）：地址加 ?perf，或按 F9
  perfEl = document.createElement('div'); perfEl.id = 'perfPanel'; document.body.appendChild(perfEl);
  perfOn = /[?&]perf/.test(location.search);
  addEventListener('keydown', (e) => { if (e.key === 'F9') { perfOn = !perfOn; perfEl.style.display = perfOn ? '' : 'none'; } });
  perfEl.style.display = perfOn ? '' : 'none';
  // 地名标签：最先加进标签层（叠放在最下面，和原来一样）
  labelEls = town.labels.map(l => { const el = document.createElement('div'); el.className = 'tag'; el.textContent = l.text; bubblesEl.appendChild(el); return { el, l }; });
}
export const TITLE_T = 1060;
// 社区中心门口的人群（仅象棋比赛那天）
export const crowd = [];
// 看电影、比赛的人站在社区中心门前的空地上（地基 10-05：原来写死在楼的北边，比赛那天站到了楼后面）；每天开始重新站好
export function crowdSpot(i) {
  const ar = space.areas.find(a => a.key === 'center'), a = 2.95 - (i % 2) * 0.45, l = [-2.8, -1.9, 1.4, 2.1, 2.8][i];   // 让出中间那条进门的路；离人行道（1.9）至少 0.5、离空地两边（半宽 3.35）至少 0.5（10-06：原来 3.2，一迈步就出界）
  return new THREE.Vector3(ar.x + ar.ux * a - ar.uz * l, 0, ar.z + ar.uz * a + ar.ux * l);
}
export const helperPeople = {};
// 邻居的日常：没被拜托时，每天某个时段在自家门口做事（纯画面，不影响玩法）
const NB_ACTS = { zhao: ['taichi', '打太极'], wang: ['cook', '晾衣服'], li: ['look', '修自行车'], chen: ['sweep', '扫地'] };
export const nbActs = {}; // 邻居今天的日常：每天原地清空重排（别的模块拿着同一个对象）
export function planNeighborActs(dayIdx, tries) {
  for (const k in nbActs) delete nbActs[k];
  NEIGHBORS.forEach((nb, i) => {
    const h = Math.abs(Math.sin((dayIdx + 1) * 12.9898 + (i + 1) * 78.233 + tries * 3.7) * 43758.5453) % 1;
    const start = 450 + Math.floor(h * 420), len = 50 + Math.floor(((h * 7) % 1) * 60);
    const door = neighborDoor(nb.id), en = space.nodes[space.doors['nb.' + nb.id].entry];   // 地基（10-05）：站在自家门前、往人行道一点（在门口连线上；原来按房子到路口的 55% 处，房子一挪就出了门前）
    const pos = door.clone().addScaledVector(new THREE.Vector3(en.x - door.x, 0, en.z - door.z).normalize(), 0.6);
    nbActs[nb.id] = { start, end: start + len, anim: NB_ACTS[nb.id][0], pos, greeted: false };
  });
}
export function addSignMesh(node) {
  if (signObjs.has(node)) return;
  const g = new THREE.Group();
  const p = graph.pos[node];
  g.position.set(p.x - 2.3, 0, p.z - 2.3);
  // 路标（10-14 用户选 2A）：方形小石座、木杆、长方形木牌（暖赭色边框、米色牌面），统一一种样子，和门窗的木色、小镇配色是一家；原来是红陶花盆插花、牌子五种颜色轮换
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.35, 0.7), new THREE.MeshStandardMaterial({ color: 0x9d958a, flatShading: true })); base.position.y = 0.175; base.castShadow = true; g.add(base);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.0, 0.16), new THREE.MeshStandardMaterial({ color: 0x7a5a3c, flatShading: true })); post.position.y = 1.85; post.castShadow = true; g.add(post);
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 0.1), new THREE.MeshStandardMaterial({ color: 0xb5533c, flatShading: true })); back.position.set(0.7, 2.8, 0); back.castShadow = true; g.add(back);
  for (const z of [0.06, -0.06]) { const face = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.68, 0.02), new THREE.MeshStandardMaterial({ color: 0xf3e6cc, flatShading: true })); face.position.set(0.7, 2.8, z); g.add(face); }
  g.scale.setScalar(0.01);
  scene.add(g); signObjs.set(node, { g, born: performance.now() });
}

export function addPhotoMesh(node) {
  const key = 'p' + node;
  if (signObjs.has(key)) return;
  const g = new THREE.Group(); const p = graph.pos[node];
  g.position.set(p.x - 2.3, 0, p.z + 2.3);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.2, 0.2), new THREE.MeshStandardMaterial({ color: 0x5a4a3a, flatShading: true }));
  post.position.y = 1.1; g.add(post);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 0.18), new THREE.MeshStandardMaterial({ color: 0x8c6e5d, flatShading: true }));
  frame.position.y = 2.6; frame.castShadow = true; g.add(frame);
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.3), new THREE.MeshBasicMaterial({ map: oldPhotoTex() }));
  pic.position.set(0, 2.6, 0.1); g.add(pic);
  const pic2 = pic.clone(); pic2.rotation.y = Math.PI; pic2.position.z = -0.1; g.add(pic2);
  g.lookAt(p.x, 0, p.z); g.scale.setScalar(0.01);
  scene.add(g); signObjs.set(key, { g, born: performance.now() });
}
let _photoTex = null;
function oldPhotoTex() {
  if (_photoTex) return _photoTex;
  _photoTex = canvasTexture(128, 88, (x) => {
  x.fillStyle = '#d9c7a3'; x.fillRect(0, 0, 128, 88);
  x.fillStyle = '#8a6f4f'; x.fillRect(22, 26, 84, 54);
  x.fillStyle = '#5b4632'; x.fillRect(16, 16, 96, 16);
  x.fillStyle = '#f3e3b6'; x.font = 'bold 12px sans-serif'; x.textAlign = 'center'; x.fillText('人民电影院', 64, 28);
  x.fillStyle = '#3a2d20'; x.fillRect(54, 52, 20, 28);
  x.strokeStyle = '#fff8e8'; x.lineWidth = 6; x.strokeRect(0, 0, 128, 88);
  }); return _photoTex;
}
export const RAIN_N = 2500;

// ---------- 画面档位：1 流畅 / 2 标准 / 3 精美 ----------
// 设置里的「画面」为 auto 时：首次进入在标题画面测几秒帧率定档并记住；游戏中帧率持续偏低自动降一档（不自动升）。
export const GFX = {
  1: { pr: 1, shadow: 0, walkers: 4, rain: 900, blur: false },
  2: { pr: 1.5, shadow: 1024, walkers: 6, rain: 1600, blur: true },
  3: { pr: 2, shadow: 2048, walkers: 8, rain: 2500, blur: true },
};
export let gfxTier = 0;
// 路人多少随时段、天气变（10-14 用户：晚上、下雨街上人少一些）：k＝1 白天、0.5 晚上或下雨；多出来的路人走 presence 淡出（ambient setActive）
let walkerK = 1;
export function walkerDensity(k) { if (k === walkerK) return; walkerK = k; walkers.setActive(Math.round(GFX[gfxTier].walkers * k)); }
export function applyGfx(tier) {
  tier = Math.max(1, Math.min(3, tier)); if (tier === gfxTier) return; gfxTier = tier;
  const g = GFX[tier];
  dynPr.cap = Math.min(window.devicePixelRatio, g.pr); dynPr.ceil = dynPr.cap; dynPr.low = dynPr.good = 0;
  renderer.setPixelRatio(dynPr.cap);
  const shadowOn = g.shadow > 0;
  if (renderer.shadowMap.enabled !== shadowOn || (shadowOn && sun.shadow.mapSize.x !== g.shadow)) {
    renderer.shadowMap.enabled = shadowOn;
    if (shadowOn) { sun.shadow.mapSize.set(g.shadow, g.shadow); sun.shadow.map?.dispose(); sun.shadow.map = null; }
    scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.needsUpdate = true); });
  }
  walkers.setActive(Math.round(g.walkers * walkerK));
  if (town?.details) town.details.visible = tier >= 2;   // 小院、石凳、花盆等小细节：流畅档不画（省三角面）
  atmos.setTier(tier);
  rainGeo.setDrawRange(0, g.rain * 2);
  document.body.classList.toggle('no-blur', !g.blur);
  resize();
}
const gfxAutoKey = 'mg-gfx-auto';
export function autoTier() { try { return +localStorage.getItem(gfxAutoKey) || 0; } catch { return 0; } }
function saveAutoTier(t) { try { localStorage.setItem(gfxAutoKey, String(t)); } catch { } }
// 动态分辨率（10-13 用户：演示用的 Mac 上精美档偶尔卡）：视网膜屏按 2 倍像素画，主要压在显卡上。只在画面设成“自动”时用（10-14 用户：
// Mac 上精美档看着模糊——手动选了档位就照选的清晰度画，不再偷偷降；那次卡顿的主因是出门每帧寻路和找镜头角度，已在 10-14 修掉）。
// 自动档：帧率连续 2 秒低于 45 把像素倍数降 0.25（最低 1，阴影、光晕这些画面效果都不动）；连续 6 秒在 55 以上再升 0.25（原来要 15 秒稳在 57 以上，
// 60 帧的屏幕上很难满足，降下去就升不回来）；刚因为卡降下来的那一级 30 秒内不再升回去（免得升了又卡、来回跳）。每次改动只重设画布大小，不重编着色器。
// 测试截图、录视频时关掉（localStorage mg-dynres=0，tools/shot.mjs、video/record.mjs 设）
const dynPr = { cap: 1, ceil: 1, low: 0, good: 0, ceilT: 0, off: (() => { try { return localStorage.getItem('mg-dynres') === '0'; } catch { return false; } })() };
function dynRes(fps, now) {
  const cur = renderer.getPixelRatio();
  if (settings.gfx !== 'auto') { if (cur !== dynPr.cap) { renderer.setPixelRatio(dynPr.cap); resize(); } return; }   // 手动档：按档位的清晰度（从自动切过来时恢复）
  if (now - dynPr.ceilT > 30000) dynPr.ceil = dynPr.cap;
  dynPr.low = fps < 45 ? dynPr.low + 1 : 0;
  dynPr.good = fps >= 55 ? dynPr.good + 1 : 0;
  let next = cur;
  if (dynPr.low >= 2 && cur > 1) { next = Math.max(1, cur - 0.25); dynPr.ceil = cur - 0.01; dynPr.ceilT = now; }
  else if (dynPr.good >= 6 && cur < dynPr.cap) { const up = Math.min(dynPr.cap, cur + 0.25); if (up <= dynPr.ceil) next = up; }
  if (next !== cur) { dynPr.low = dynPr.good = 0; renderer.setPixelRatio(next); resize(); }
}
// 帧率统计：用于自动定档与性能面板
export const perf = { frames: 0, t0: performance.now(), fps: 60, low: 0, probing: false, probeT: 0 };
export function perfTick(now) {
  perf.frames++;
  const el = now - perf.t0;
  if (el < 1000) return;
  perf.fps = perf.frames * 1000 / el; perf.frames = 0; perf.t0 = now;
  if (!dynPr.off && !document.hidden && !perf.probing && el < 3000) dynRes(perf.fps, now);   // el 很长：刚从后台切回来，这一秒不算
  if (settings.gfx !== 'auto') return;
  if (perf.probing) {   // 首次定档：标题画面测 4 秒
    perf.probeT++;
    if (perf.probeT >= 4) { perf.probing = false; const t = perf.fps >= 50 ? gfxTier : perf.fps >= 34 ? Math.min(gfxTier, 2) : 1; applyGfx(t); saveAutoTier(t); }
    return;
  }
  // 游戏中：连续 8 秒低于 28 帧，降一档（页面在后台时不算）
  if (document.hidden) return;
  perf.low = perf.fps < 28 ? perf.low + 1 : 0;
  if (perf.low >= 8 && gfxTier > 1) { perf.low = 0; applyGfx(gfxTier - 1); saveAutoTier(gfxTier); }
}
export function perfPanel() {
  if (!perfOn) return;
  const r = renderer.info.render;
  perfEl.textContent = `${Math.round(perf.fps)} 帧/秒 · 绘制 ${r.calls} · 面 ${(r.triangles / 1000).toFixed(1)}k · 档位 ${['', '流畅', '标准', '精美'][gfxTier]}${settings.gfx === 'auto' ? '（自动）' : ''} · 像素 ${renderer.getPixelRatio().toFixed(2)}`;
}
// 爷爷说话时声音从哪里发出（头顶上方一点）
export function elderVoicePos() { return _vp.copy(elder.root.position).setY(elder.root.position.y + 1.55); }   // 人物缩到 0.82 倍后跟着降（10-13）

// ---------- 沿路走：从任意点出发，走人行网到任意点（邻居、被接回家、开场里的人都用，不穿房子、不走车道）----------
// 地基（10-05）：原来沿路中线走（和车抢道）；现在走可行走地图的人行线，点上的 xing 表示过街（mover.js 在这里让车）
export function roadPath(from, to) {
  return space.path(from, to).map(p => Object.assign(new THREE.Vector3(p.x, 0, p.z), { xing: p.xing }));
}
// 地基：把每扇门接到人行网上（地点的门、邻居家门、家门）。能进去的楼和家，最后一点在屋里
function registerDoors() {
  for (const [key, g] of Object.entries(town.placeObjs)) {
    const u = g.userData;
    if (key === 'home') { const sp = u.spots; space.addDoor('home', [g.position.clone().add(sp.doorIn)], { kind: 'inside' }); continue; }
    if (!u.gates) continue;
    u.gates.forEach((gt, k) => {
      // 从门那一侧的人行线接进来：路边往街区里 2.6（人行道外沿）→（楼）门前 → 办事的点
      const toC = new THREE.Vector3(g.position.x - gt.road.x, 0, g.position.z - gt.road.z).normalize(), approach = gt.road.clone().addScaledVector(toC, 2.6);
      const open = key === 'park' || key === 'market' || k > 0;   // 露天的地方、后门：不经过楼门
      space.addDoor(k ? key + k : key, open ? [approach, gt.spot] : [approach, u.door, gt.spot], { kind: u.indoor ? 'inside' : 'door' });
    });
  }
  for (const nb of NEIGHBORS) { const d = neighborDoor(nb.id); if (d) space.addDoor('nb.' + nb.id, [d]); }
  // 社区中心门前的空地（看电影、比赛的人站在这里）：从门前路中线往楼走 1.6，到楼前 0.2；左右到楼宽外 0.5
  { const g = town.placeObjs.center, u = g.userData, gt = u.gates[0], toC = new THREE.Vector3(g.position.x - gt.road.x, 0, g.position.z - gt.road.z), dist = toC.length(); toC.normalize();
    space.addArea('center', gt.road.x, gt.road.z, toC.x, toC.z, 1.6, dist - (u.indoor.hd + 0.15) - 0.1, u.indoor.hw + 0.5); }   // 到楼面前 0.1（indoor 比楼面小 0.15）
}
// 邻居家门前（房子斜朝着路口）
export function neighborDoor(id) {
  const h = town.neighborObjs[id], nb = NEIGHBORS.find(n => n.id === id);
  if (!h || !nb) return null;
  const np = graph.pos[nid(...nb.node)], d = new THREE.Vector3(np.x - h.position.x, 0, np.z - h.position.z).normalize();
  return h.position.clone().setY(0).addScaledVector(d, 2.4);
}
