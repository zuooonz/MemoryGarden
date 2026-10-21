// 核心：渲染器、场景、镜头与灯光；跨模块共享的状态（persist 今天放下的支持、run 当天运行状态、ui 界面状态）；屏幕投影。
// 其他模块直接 import 这里的东西（拿到的是同一个对象），不再由 main.js 传参注入。
import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { Sim } from './sim.js';

export const $ = (s) => document.querySelector(s);

// ---------- 渲染基础 ----------
export const canvas = $('#view');
export const renderer = (() => {
try { return new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); }   // 有独显的电脑优先用独显
catch (err) {
  document.body.innerHTML = '<div style="max-width:420px;margin:15vh auto;padding:24px;font:18px/1.7 sans-serif;color:#2b2a33;background:#fffaf1;border-radius:16px">这个浏览器暂时显示不了游戏的 3D 画面。<br>请换用最新版的 Chrome、Edge 或 Safari 打开，或在浏览器设置里开启“硬件加速”。</div>';
  throw err;
}
})();
export const lowEnd = /Android|iPhone|iPad/i.test(navigator.userAgent) || (navigator.hardwareConcurrency || 8) <= 4;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowEnd ? 1.5 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

export const scene = new THREE.Scene();
scene.background = null;
scene.fog = new THREE.Fog(0xcfe3e8, 90, 190);

export const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 500);
camera.position.set(0, 78, 70);
export const controls = new MapControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.12;
controls.minDistance = 25; controls.maxDistance = 140;
controls.maxPolarAngle = 1.15; controls.minPolarAngle = 0.35;
controls.screenSpacePanning = false;
controls.target.set(0, 0, 4);

export const hemi = new THREE.HemisphereLight(0xfdf6e8, 0x8aa27a, 1.25); scene.add(hemi);
export const sun = new THREE.DirectionalLight(0xffefd6, 2.2);
sun.castShadow = true; sun.shadow.mapSize.set(lowEnd ? 1024 : 2048, lowEnd ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 220 });
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03; sun.shadow.radius = 2.5;   // 阴影边缘略柔（PCF 取样半径）
scene.add(sun); scene.add(sun.target);

export function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h;
  camera.fov = w < h ? 52 : 38;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize); resize();
// 手机转屏（10-14 用户：横屏转竖屏后按钮都点不动，像坐标没更新）：有的手机浏览器（iOS Safari 等）转屏时先发 resize、尺寸过一会儿才变，
// 页面还可能被顺带滚动或缩放，点到的位置和画出来的位置对不上。转屏后分几次（0.1／0.35／0.8 秒）把页面滚回原点、再按最终尺寸重排一遍（所有 resize 监听都会重算）
let rotT = [];
function afterRotate() {
  rotT.forEach(clearTimeout);
  rotT = [100, 350, 800].map(ms => setTimeout(() => { window.scrollTo(0, 0); document.documentElement.scrollTop = document.body.scrollTop = 0; window.dispatchEvent(new Event('resize')); }, ms));
}
window.addEventListener('orientationchange', afterRotate);
screen.orientation?.addEventListener?.('change', afterRotate);
window.visualViewport?.addEventListener('resize', () => { if (Math.abs(window.visualViewport.scale - 1) > 0.01 || window.scrollY) afterRotate(); });

// ---------- 共享状态 ----------
export const persist = { signs: new Set(), photos: new Set(), home: new Set(), neighbors: new Set() };
export const run = { lineupOn: false, happyT: 0, holdT: 0, lastMode: null, hiking: false, kidHoldUntil: 0, tickUI: 0, effSpeed: 1, dayStartPersist: null, helpedOnce: { hesitate: false }, homeAction: null, speed: 1, kidPending: false };
// 临时向量（多处复用，避免每帧新建）
export const _vp = new THREE.Vector3(), _np = new THREE.Vector3();
// ---------- 时间：三种“停”（全局约定，见 Docs/架构.md“时间系统”） ----------
// 1 玩家暂停：run.speed = 0（暂停键、空格、设置、手册、切到后台）——时钟、世界动画、声音全停，界面显示“暂停”。
// 2 剧情停顿：story.holds（讲往事）——时钟停，声音与世界照常，点一下可跳过；不许借用 setSpeed(0)。
// 3 关卡与犹豫时刻：sim.moment——时钟停，声音与世界照常；做选择花掉的剧情时间用 sim.advance 记，时钟旁显示“+N 分钟”。
// 剧情节拍的延时用 later(秒, fn)：只在玩家没暂停时计时（按下暂停，讲到一半的往事也一起停住）；换一天时 clearLater()。
export const story = { holds: new Set() };
export const timeHeld = () => story.holds.size > 0 || !!sim.moment;
const timers = [];
export function later(sec, fn) { const t = { left: sec, fn, dead: false }; timers.push(t); return () => { t.dead = true; }; }
export function tickLater(dt) {
  if (run.speed === 0 && sim.phase === 'live') return;
  for (const t of timers.slice()) { if (t.dead) continue; t.left -= dt; if (t.left <= 0) { t.dead = true; t.fn(); } }
  for (let i = timers.length - 1; i >= 0; i--) if (timers[i].dead) timers.splice(i, 1);
}
export function clearLater() { for (const t of timers) t.dead = true; timers.length = 0; story.holds.clear(); }
// ---------- 台词记录（测试用）：谁、几点、什么场景说了哪句；tools/linecheck.mjs 按时间、场景、人物、关系核对 ----------
export const lineLog = { on: false, list: [] };
export function logLine(who, text) {
  if (!lineLog.on || !text || !sim?.e) return;
  lineLog.list.push({ ...sim.ctx(), who, text });   // 情境与事件流同一份（sim.ctx）
  if (lineLog.list.length > 5000) lineLog.list.shift();
}
export const ui = { mistOn: true, selected: null, gpKey: '', gpSheet: false, bubbleT: 0 };
// 页面上跟着 3D 位置走的标签都放在这一层（地名、风险「？」、头顶气泡、邻居标签）
export const bubblesEl = $('#bubbles');
export const hudR = $('#hudR'), isMobile = () => window.innerWidth <= 760;

// ---------- 屏幕投影：把世界里的点换算成页面坐标，给头顶标签定位 ----------
export const tmp = new THREE.Vector3();

export function project(v, el, dy = 0) {
  tmp.copy(v); tmp.y += dy; tmp.project(camera);
  if (tmp.z > 1) { el.style.display = 'none'; return; }
  el.style.display = '';
  el.style.left = ((tmp.x + 1) / 2 * window.innerWidth) + 'px';
  el.style.top = ((1 - tmp.y) / 2 * window.innerHeight) + 'px';
}

// ---------- 模拟（一天的规则与爷爷的行为）：main.js 调 createSim 创建，再往 hooks 里填画面、声音等回调 ----------
export const hooks = {};
export let sim = null;
export function createSim(graph) { sim = new Sim(graph, persist, hooks); return sim; }

// ---------- 事件：下层发生了某事、上层要响应时用（下层不直接 import 上层） ----------
// 现有事件：'say'(谁, 话, 秒) 头顶说一句；'neighborGreet'(邻居 id) 邻居打招呼；'tellMemory'() 讲往事
const handlers = {};
export function on(name, fn) { (handlers[name] ||= []).push(fn); }
export function emit(name, ...args) { for (const fn of handlers[name] || []) fn(...args); }
