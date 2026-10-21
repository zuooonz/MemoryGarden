// 入口：场景、镜头、输入、界面与流程。
import { separate } from './mover.js';
import { updatePresence } from './presence.js';
import { NARR, narrNeighborTap, narrNeighborAsked } from './narr.js';
import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { winM, winM2, winDim, lampM, lampConeM, lampPoolM, glassU } from './town.js';
import { SUPPORTS, NEIGHBORS } from './data.js';
import { clamp, lerp } from './util.js';
import { initAudio, sfx, ambience, setListener, voiceTick } from './audio.js';
import { settings } from './store.js';
import { cam, stepPan, stepFlyZoom, keepInSight, releaseSight } from './camera.js';
import { initMapOps } from './mapops.js';
import { initUi, coachDone, coachStep, hideHint, hint, renderCards } from './ui.js';
import { opening, openingTick } from './opening.js';
import { renderFrame } from './postfx.js';
import { swayT } from './town-parts.js';
import { initFlow, eveningOn, sceneAudio, showTitle } from './flow.js';
import { initHome, homeG, homeWorld, insideHome, updateSteam, tickHomeAction } from './home.js';
import { initAchieve, useChips } from './achieve.js';
import { initRoutes, mists, MIST_W, MIST_H, renderRoutes, spotRoute, updateMistTargets, updateRings, updateRoutes, routeColor, ROUTE_COLORS } from './routes.js';
import { initStage, idleOn, watchOn } from './stage.js';
import { initActors, updatePeople } from './actors.js';
import { initOverlays, updateOverlays } from './overlays.js';
import { gfxTier, initWorld, RAIN_N, TITLE_T, addPhotoMesh, addSignMesh, applyGfx, walkerDensity, atmos, autoTier, cars, chessFriend, clouds, companion, crowd, elder, elderRing, fx, graph,
  helperPeople, kid, perf, perfPanel, perfTick, rain, rainGeo, signObjs, sky, skyBodies, town, walkers , space } from './world.js';
import { $, canvas, renderer, lowEnd, scene, camera, controls, hemi, sun, persist, run, ui, tmp, project, createSim, story, tickLater } from './core.js';
import { initSettingsUi, applySettings } from './settings-ui.js';
import { initHud, followCam, setFollowCam, pausedNow, pauseNudge } from './hud.js';
import { initDevtools } from './devtools.js';
import { glowRim } from './person.js';
import { initBridge } from './bridge.js';

initWorld();
// ---------- 状态 ----------

const sim = createSim(graph);
// 模拟的回调：画面、声音、界面怎么响应模拟里发生的事
initBridge();
// 调试：人物站队（对比人物造型用）
initDevtools({ frame });   // 调试接口要能手动推进帧（frame 是 main 的函数，不会变）

initSettingsUi();

initRoutes();
initUi();
initHud();

initStage();
// ---------- 输入 ----------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let downAt = null;
canvas.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY, t: performance.now() }; });
// 手指／鼠标按在画面上拖的这段时间，镜头归玩家：跟随、自动换角度都让开（camera.js keepInSight）
controls.addEventListener('start', () => { cam.drag = true; });
controls.addEventListener('end', () => { cam.drag = false; });
canvas.addEventListener('pointerup', (e) => {
  if (!downAt) return;
  const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
  downAt = null;
  if (moved > 8) { releaseSight(); cam.follow = false; if (followCam) setFollowCam(false); return; }
  onTap(e.clientX, e.clientY);
});
function onTap(x, y) {
  initAudio();
  if (pausedNow()) { pauseNudge(); return; }   // 暂停时画面上点地方、点人不响应（拖动镜头照常）
  ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  if (!ui.selected && sim.phase === 'live') {   // 点他：他打算走的路亮几秒（出门后路线默认淡）
    const v = elder.root.position.clone().setY(elder.root.position.y + 1).project(camera);
    if (Math.hypot((v.x + 1) / 2 * window.innerWidth - x, (1 - v.y) / 2 * window.innerHeight - y) < 70) spotRoute();
  }
  const hits = ray.intersectObjects(town.pickables, false);
  if (!hits.length) return;
  const u = hits[0].object.userData;
  if (!ui.selected) {
    if (u.kind === 'home') hint(NARR.homeTap);
    else if (u.kind === 'neighbor') { const nb = NEIGHBORS.find(n => n.id === u.id); hint(narrNeighborTap(nb, persist.neighbors.has(u.id))); }
    return;
  }
  const s = SUPPORTS[ui.selected];
  let ok = false;
  if (s.target === 'node' || s.target === 'changed') {
    const node = u.kind === 'node' ? u.id : null;
    if (node != null && sim.canPlace(ui.selected, node)) { sim.place(ui.selected, node); s.target === 'node' ? addSignMesh(node) : addPhotoMesh(node); ok = true; }
  } else if (s.target === 'neighbor' && u.kind === 'neighbor') {
    if (sim.canPlace(ui.selected, u.id)) { sim.place(ui.selected, u.id); ok = true; const nb = NEIGHBORS.find(n => n.id === u.id); hint(narrNeighborAsked(nb)); }
  }
  if (ok) {
    renderRoutes(); sfx('place'); fx.ring(hits[0].object.position.clone(), 0xe4774f);
    coachDone('place', () => coachStep('go', NARR.readyGo, ['#startBtn']));
    if (sim.energy < s.cost) { ui.selected = null; hideHint(); }
    renderCards();
  }
  else sfx('deny');
}
// shift：让目标出现在画面偏左（右侧有面板时）

initAchieve();
initHome();
// ---------- 地图上的操作：健步走连线、电话指路 ----------

initMapOps();

// ---------- 主循环 ----------
const clock = new THREE.Clock();

// 一个时段一种色调（参考《阿尔托的奥德赛》）：清晨薄荷冷、上午明亮、正午暖白、午后暖、黄昏粉橙、傍晚紫、夜里深蓝
// 画面精修 1（09-27）：白天环境光略降、阳光略升——受光面与背光面分得开，画面不发平
// 冷暖分光（10-13 画面重塑，参考《鹈鹕骑单车》）：白天天光偏淡蓝（阴影偏冷）、阳光略暖略强；19:00 去掉墙面的脏粉（天光偏蓝紫）
const TOD = [
  [360, { low: 0xdcebe4, high: 0x9cc3d6, hs: 0xe3f0ea, hg: 0x8aa293, sc: 0xffe3c2, si: 1.4, hi: 1.15, vig: 0.2 }],
  [480, { low: 0xeef0e2, high: 0x8fbfdc, hs: 0xdde8f2, hg: 0x8aa27a, sc: 0xffeccc, si: 2.6, hi: 1.02, vig: 0.16 }],
  [720, { low: 0xf4ecd8, high: 0x7fb4d9, hs: 0xe2ebf4, hg: 0x8fa77c, sc: 0xffeed2, si: 2.8, hi: 0.95, vig: 0.14 }],   // 光影精修（10-06）：环境光略降，房子、地面多一点明暗
  [930, { low: 0xf5e2c2, high: 0x86aed0, hs: 0xe4e4f0, hg: 0x95a078, sc: 0xffdcaa, si: 2.75, hi: 0.92, vig: 0.16 }],   // 下午：太阳略强、环境光略降（原来偏平，影子几乎看不出）
  [1050, { low: 0xf0c4a6, high: 0x8479b0, hs: 0xc8c4e4, hg: 0x8a9488, sc: 0xffbe88, si: 1.9, hi: 1.0, vig: 0.24 }],
  [1140, { low: 0x7a7ea8, high: 0x363f72, hs: 0x9ea6cc, hg: 0x464c62, sc: 0xff9a6a, si: 0.5, hi: 0.85, vig: 0.34 }],
  [1200, { low: 0x3a4060, high: 0x1c2340, hs: 0x6a7090, hg: 0x2a2d40, sc: 0x8090c0, si: 0.25, hi: 0.7, vig: 0.42 }],
];
const RAIN_TOD = { low: 0xa9b8b8, high: 0x7d8c94, hs: 0xc8d4d4, hg: 0x6f7c78 };
const _ca = new THREE.Color(), _cb = new THREE.Color();
const mixHex = (a, b, k, out) => out.setHex(a).lerp(_cb.setHex(b), k);
let rainMix = 0, vigLast = -1, eveK = 0;
let mistClock = 0;
const mistTint = new THREE.Color(0xffffff);   // 薄雾跟着时段变色，夜里压暗
// 看得清他（10-10，tools/elderlook.mjs）：傍晚、夜里、雨里爷爷的轮廓光与提亮（person.js glowRim），以及雾片在他身边让开一小圈
const elderGlow = glowRim(elder.root, new Set([elderRing]));
const holeU = { value: new THREE.Vector3() }, _hp = new THREE.Vector3(), _hb = new THREE.Vector2();
function mistHole(mat) {   // 雾片着色器：离他越近越淡（椭圆，竖着长一些），最淡留三成半，边缘慢慢过渡——他身边的雾还在，只是不把人整个盖住
  mat.onBeforeCompile = (sh) => { sh.uniforms.uHole = holeU; sh.fragmentShader = 'uniform vec3 uHole;\n' + sh.fragmentShader.replace('#include <opaque_fragment>',
    'if (uHole.z > 0.0) diffuseColor.a *= mix(0.35, 1.0, smoothstep(uHole.z * 0.3, uHole.z, length((gl_FragCoord.xy - uHole.xy) * vec2(1.0, 0.7))));\n#include <opaque_fragment>'); };
  mat.customProgramCacheKey = () => 'mistHole'; mat.needsUpdate = true; mat.userData.hole = true;
}
function updateMistHole() {   // 他在画面上的位置与身高（画布像素）：脚到头顶约 3.1
  const p = run.debugElder || (sim.phase === 'live' && elder.root.visible ? elder.root.position : null);   // run.debugElder：调试接口 elderPin 把他钉在别处时
  if (!p) { holeU.value.z = 0; return; }
  renderer.getDrawingBufferSize(_hb);
  _hp.set(p.x, 1.25, p.z).project(camera); const cx = (_hp.x + 1) / 2 * _hb.x, cy = (_hp.y + 1) / 2 * _hb.y;
  _hp.set(p.x, 2.55, p.z).project(camera); const top = (_hp.y + 1) / 2 * _hb.y;
  holeU.value.set(cx, cy, Math.max(12, Math.abs(top - cy) * 2.6));
}
const vigEl = document.createElement('div'); vigEl.id = 'vignette'; document.body.prepend(vigEl);
// 随时段、天气变的小细节（10-14 用户：都要慢慢变、有先后，不能突然没了）。每帧只改已有物体的数值，不新建对象
let clothesT = 0, rainFor = 0, produceT = 0;
const _lt = { dt: 0, last: performance.now() };
function envDetails(t, lightsK) {
  const now = performance.now(), dt = Math.min(0.1, (now - _lt.last) / 1000); _lt.last = now;
  rainFor = sim.raining ? rainFor + dt * Math.max(run.effSpeed || 0, 0.3) : 0;
  // 晒衣服：早上 8:00 后挂出；17:30 前后收；下雨一会儿（约 12 秒）后收；收的时候一件件往上一提、缩小收走，两处晾衣绳错开
  if (town.clothes) {
    town.clothes.visible = gfxTier >= 2;
    for (const line of town.clothes.userData.lines) {
      const off = line.k * 12, out = !sim.raining || rainFor < 12;
      const want = out && t >= 480 + off && t < 1050 + off ? 0 : 1;   // 0 晾着，1 收了
      line.p ??= want; line.p += Math.sign(want - line.p) * Math.min(Math.abs(want - line.p), dt / 2.4);
      line.pieces.forEach((cl, i) => { const a = clamp(line.p * 3 - i, 0, 1), e = a * a;   // 从左到右一件件收
        cl.visible = a < 0.999; cl.scale.set(1 - e * 0.85, 1 - e, 1); cl.position.y = cl.userData.y0 + Math.sin(a * Math.PI) * 0.18; });
    }
  }
  // 菜市场：18:00 起一摊一摊收菜（菜缩小收走），第二天一早摆出来
  if (town.produce) {
    const want = t >= 1080 ? 1 : 0; produceT += Math.sign(want - produceT) * Math.min(Math.abs(want - produceT), dt / 6);
    town.produce.visible = produceT < 0.999;
    if (town.produce.visible) town.produce.children.forEach(f => { const a = clamp(produceT * 4 - f.userData.stall, 0, 1); f.scale.setScalar(1 - a); f.visible = a < 0.999; });
  }
  cars.setLights(lightsK > 0.35);   // 车灯：天色暗了才亮
  walkers.setRain(sim.raining && rainFor > 1.5);   // 路人撑伞：雨下了一会儿再撑
  walkerDensity(t > 1110 || rainMix > 0.6 ? 0.5 : 1);   // 晚上、下雨时街上人少一半
  { const mar = town.oldObjs.cinema?.userData.marquee; if (mar) mar.material.emissiveIntensity = 1 + lightsK * 3; }   // 电影院招牌：傍晚以后更亮
  for (const m of town.wet || []) { m.color.setScalar(1 - rainMix * 0.18); m.roughness = lerp(m.userData.r0, 0.4, rainMix); }   // 雨天路面、人行道变深、略反光
}
function updateLighting() {
  const t = run.debugT ?? (opening.on ? opening.t : !sim.phase ? TITLE_T : (sim.time ?? 480));   // run.debugT：调试接口 __mg.time() 固定画面时间（看傍晚、夜景用）
  const k = clamp((t - 360) / (1140 - 360), 0, 1);           // 6:00→19:00
  const ang = lerp(-1.2, 1.2, k);
  // 阴影跟着镜头：只覆盖看得见的一片（拉近时范围小、同样格数更精细，阴影边不再一格一格起毛刺）；中心按格子对齐，移动镜头时阴影边不闪
  { const dist = camera.position.distanceTo(controls.target), half = clamp(dist * 0.75, 26, 70), sc = sun.shadow.camera;
    const cell = (half * 2) / sun.shadow.mapSize.x, cx = Math.round(controls.target.x / cell) * cell, cz = Math.round(controls.target.z / cell) * cell;
    sun.target.position.set(cx, 0, cz);
    sun.position.set(cx + Math.sin(ang) * 80, Math.cos(ang) * 58 + 10, cz + 40);   // 太阳略低（原来 70）：影子长一点，有层次
    if (sc.right !== half) { sc.left = sc.bottom = -half; sc.right = sc.top = half; sc.updateProjectionMatrix(); } }
  // 在关键时刻之间插值
  let i = 0; while (i < TOD.length - 2 && t > TOD[i + 1][0]) i++;
  const [ta, A] = TOD[i], [tb, B] = TOD[i + 1];
  const u = clamp((t - ta) / (tb - ta), 0, 1);
  rainMix += ((sim.raining ? 1 : 0) - rainMix) * 0.02;         // 下雨慢慢压色
  const low = mixHex(A.low, B.low, u, new THREE.Color()).lerp(_ca.setHex(RAIN_TOD.low), rainMix * 0.7);
  const high = mixHex(A.high, B.high, u, new THREE.Color()).lerp(_ca.setHex(RAIN_TOD.high), rainMix * 0.75);
  sky.material.uniforms.bottom.value.copy(low); sky.material.uniforms.top.value.copy(high);
  scene.fog.color.copy(low);
  mistTint.copy(low).lerp(_ca.setHex(0xffffff), 0.45).multiplyScalar(lerp(1, 0.42, clamp((t - 1100) / 100, 0, 1)));
  // 雾片只取亮度、不取色相（10-13 画面重塑：原来跟着天色变，傍晚发粉、19 点发紫光）——纸白，傍晚起渐渐转月光冷灰；亮度和原来一样，读雾的明暗差不变
  { const lum = (c) => c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722, L = lum(mistTint); _cb.setHex(0xf4f2ec).lerp(_ca.setHex(0xc4cde0), clamp((t - 1000) / 160, 0, 1)); mistTint.copy(_cb).multiplyScalar(L / lum(_cb)); }
  mixHex(A.hs, B.hs, u, hemi.color).lerp(_ca.setHex(RAIN_TOD.hs), rainMix * 0.6);
  mixHex(A.hg, B.hg, u, hemi.groundColor).lerp(_ca.setHex(RAIN_TOD.hg), rainMix * 0.6);
  hemi.intensity = lerp(A.hi, B.hi, u) * (1 - rainMix * 0.15);
  mixHex(A.sc, B.sc, u, sun.color);
  sun.intensity = lerp(A.si, B.si, u) * (1 - rainMix * 0.55);
  // 亮灯（10-13 画面重塑）：窗、灯泡、光锥、地面光斑都只看一个“暗度”——下雨天色暗，相当于晚 45 分钟（灯早亮一点）；不再“下雨就全天加亮”（原来雨天中午路灯、窗都亮着）
  const tl = t + rainMix * 45, lightsK = clamp((tl - 1020) / 90, 0, 1);
  winM.emissiveIntensity = lightsK * 0.9;
  lampM.emissiveIntensity = clamp((tl - 1040) / 60, 0, 1) * 1.6;
  lampConeM.opacity = clamp((tl - 1050) / 60, 0, 1) * 0.4; lampConeM.visible = lampConeM.opacity > 0.005;   // 路灯的光锥：淡淡一束、上亮下淡（town-parts coneGeo），夜里读雾照旧
  lampPoolM.opacity = lampConeM.opacity * 1.3; lampPoolM.visible = lampConeM.visible;   // 地上一圈暖光
  winM2.emissiveIntensity = clamp((tl - 1070) / 70, 0, 1) * 0.7 * (1 - clamp((t - 1250) / 40, 0, 1));   // 另一组窗晚些亮、暗一些；20:50 以后陆续熄灯（10-14：夜深了，一部分人家睡了）
  // 玻璃：白天带一层很淡的天光（town-parts glassCompile），天黑后反光关掉、玻璃压暗，只剩屋里的暖灯
  winM.color.setScalar(1 - lightsK * 0.6); winM2.color.copy(winM.color); winDim.color.copy(winM.color); winDim.emissive.setHex(0x26324a); winDim.emissiveIntensity = lightsK * 0.55;   // 不亮灯的窗（小学）：夜里映一点冷的天光，不是黑洞   // 玻璃本身的颜色在顶点色里（按建筑类型），这里只压暗
  glassU.uSky.value.copy(high).lerp(low, 0.5); glassU.uDay.value = 1 - lightsK;
  rain.material.color.copy(low).lerp(_ca.setHex(0xffffff), 0.25);   // 雨丝跟着天色（原来固定浅蓝灰，夜里比环境还亮）
  envDetails(t, lightsK);
  // 雾跟着镜头远近：小镇外圈淡进雾里；雨天雾更近
  const d = typeof followCam !== 'undefined' && followCam ? 55 : camera.position.distanceTo(controls.target);   // 跟随视角镜头很近，雾用固定距离
  // 晚上在家讲往事（eveningOn）：雨天的空气雾退到和晴天差不多（10-13 用户：雨加雾什么都看不清）；雨丝、压暗的色调照旧，看得出下过雨
  eveK += ((eveningOn ? 1 : 0) - eveK) * 0.04;
  const fogRain = rainMix * (1 - 0.85 * eveK);
  scene.fog.near = d * lerp(1.15, 0.95, fogRain); scene.fog.far = d * lerp(2.6, 2.1, fogRain);   // 雨天空气雾只略微拉近（10-13 画面重塑：原来 0.75／1.6，天色、空气雾、雾片三层灰叠在一起，整屏发灰）   // 画面精修 1：晴天把空气雾往后推，小镇不再整体发白
  // 四周暗角：夜里、雨天更重
  const vig = Math.round((lerp(A.vig, B.vig, u) + rainMix * 0.1) * 100) / 100;
  if (vig !== vigLast) { vigLast = vig; vigEl.style.setProperty('--vig', vig); }
  skyBodies.update(camera, k, clamp((t - 1130) / 60, 0, 1), sun.color);
  // 看得清他：16:30 起轮廓光渐强、身上略提亮（夜里他和背景差不多一样暗）；下雨时轮廓光再加一点、空气雾在他身上少一半
  const nightK = clamp((t - 990) / 180, 0, 1);
  elderGlow.rim.value = nightK * 0.55 + rainMix * 0.5; elderGlow.lift.value = nightK * 0.2; elderGlow.fog.value = 1 - rainMix * 0.5;
}

function tick() { frame(); requestAnimationFrame(tick); }
initActors();
// ---------- 每帧：镜头跟随 ----------
function updateCamera(dt, e) {
  // 镜头
  if (stepPan(dt)) {
  } else if (cam.follow && !cam.drag && sim.phase === 'live' && e && !sim.moment && (e.mode !== 'home' || controls.target.distanceTo(homeG.position) > 8)) {
    // 跟着他本人（进校门、进店时也在画面中间）；在家时镜头移到家上方（10-08：原来回家后镜头停在门外 16 处，屋顶不变淡，他在屋里看不见）
    const delta = tmp.copy(e.mode === 'home' ? homeG.position : elder.root.visible ? elder.root.position : e.pos).sub(controls.target); delta.y = 0;
    delta.multiplyScalar(Math.min(1, dt * 1.2));
    controls.target.add(delta); camera.position.add(delta);
  }
  if (followCam) {
    if ((sim.phase !== 'live' && sim.phase !== 'plan') || sim.moment || !elder.root.visible) setFollowCam(false);
    else {
      // 在家：跟在身后会被墙挡住，改为从斜上方看进屋里（屋顶靠近时自动淡出），镜头跟着他在屋里走
      const home = insideHome(elder.root.position);
      const fy = elder.root.rotation.y, fwd = tmp.set(Math.sin(fy), 0, Math.cos(fy));
      const wantT = home ? elder.root.position.clone().setY(1.2) : elder.root.position.clone().addScaledVector(fwd, 5).setY(1.4);
      const wantP = home ? elder.root.position.clone().add(new THREE.Vector3(0, 9, 7)) : elder.root.position.clone().addScaledVector(fwd, -8).setY(4.6);
      const k = Math.min(1, dt * 2.2);
      controls.target.lerp(wantT, k); camera.position.lerp(wantP, k);
      cam.pan = null; cam.zoom = null;
    }
  }
  stepFlyZoom(dt);
  run.sightWhy = !followCam ? !e ? '无e' : e.mode === 'home' ? '在家' : !elder.root.visible ? '不可见' : sim.moment ? '弹窗' : '' : '跟随视角';   // 检查用
  keepInSight(dt, elder.root.position, [town.root], cam.follow && !run.sightWhy && sim.phase === 'live', e?.mode === 'walk' && (run.elderV || 0) > 0.5);
  if (idleOn || watchOn) {
    const off = camera.position.clone().sub(controls.target);
    off.applyAxisAngle(new THREE.Vector3(0, 1, 0), dt * 0.03);
    camera.position.copy(controls.target).add(off);
  }
  if (!sim.phase) {
    const off = camera.position.clone().sub(controls.target);
    off.applyAxisAngle(new THREE.Vector3(0, 1, 0), dt * 0.02);   // 标题画面：很慢地转
    camera.position.copy(controls.target).add(off);
  }
}

initOverlays();

function frame(forceDt) {
  const dt = forceDt ?? Math.min(clock.getDelta(), 0.05);
  run.frameClock = (run.frameClock || 0) + dt;   // 检查用：画面实际走过的时间（每帧步长有上限，掉帧时比真实时间慢——检查按这个算速度，不误报“顿挫”）
  if (run.lineupOn) { for (const p of [elder, kid, companion, chessFriend, ...Object.values(helperPeople).map(h => h.person)]) { p.anim = run.poseAnim || 'idle'; p.update(dt); } controls.update(); renderer.render(scene, camera); return; }
  // 空档自动快进：他在家等下一件事，或在做一件很长的事
  let ff = 1;
  if (sim.phase === 'live' && !sim.moment && !story.holds.size && sim.e) {
    const e0 = sim.e;
    const nextG = sim.goals.find(g => g.status === 'pending');
    if (e0.mode === 'home' && (!nextG || nextG.at - sim.time > 12)) ff = 6;
    else if (e0.mode === 'task' && e0.after === 'goHome' && e0.taskT > 8 && !sim.moment) ff = 4;
    else if (e0.leg === 'hike') ff = 1.2;   // 健步走：一队人走，不能快得像跑
    // 记着菜单、还没到菜市场时，空档快进放慢一些，让记忆间隔不至于太短
    if (sim.goals.some(g => g.menu && g.recall !== false && g.learned && (g.status === 'pending' || g.status === 'active'))) ff = 1;
  }
  $('#clock').classList.toggle('ff', ff > 1 && run.speed > 0);
  // 实际速度：自动快进只把速度“提到”某个值，不再和玩家的倍速相乘（原来 4 倍 × 6 倍 = 24 倍）；
  // 静观、界面变淡时时间慢下来（最多 2 倍）；速度变化平滑过渡
  let want = run.speed === 0 || story.holds.size ? 0 : Math.max(run.speed, ff);   // 剧情停顿（讲往事）：时钟停，世界与声音照常
  if ((idleOn || watchOn) && want > 2) want = 2;
  // 路口时机窗口（10-06 暂定）：他在陌生路口停下来想、电话打得通时，时间放慢到 1 倍——倍速再快也来得及打个电话问一句（给老人玩，不逼人）
  { const e1 = sim.e; if (sim.phase === 'live' && e1?.mode === 'hesitate' && !e1.lost && !e1.drift && sim.canCall() && want > 1) { want = 1; run.effSpeed = Math.min(run.effSpeed, 1); } }
  run.effSpeed = want === 0 ? 0 : run.effSpeed + (want - run.effSpeed) * Math.min(1, dt * 2.5);
  tickLater(dt);
  sim.update(dt, run.effSpeed);
  ambience(dt, sim.time || 480, sim.raining, (sim.phase === 'live' && run.speed > 0) || sim.phase === 'plan' || eveningOn, controls.target, town.placeObjs.market?.position);
  const frozen = run.speed === 0 && sim.phase === 'live';   // 暂停：落叶、炊烟、鸟群、云也停住
  swayT.value += frozen ? 0 : dt * Math.min(Math.max(run.speed || 0.35, 0.35), 2);   // 树冠摆动：暂停时停
  atmos.update(frozen ? 0 : dt * Math.max(0.35, Math.min(run.speed || 0.35, 2)), sim.time || 480, sim.raining, controls.target);

  // 爷爷
  const e = sim.e;
  const paused = run.speed === 0 && sim.phase === 'live';   // 玩家暂停：画面里的人一步也不挪（10-13 用户：暂停后爷爷还在滑、邻居还在走——原来人物按“至少 0.6 倍”的速度照走，只是动作停了）
  if (opening.on) openingTick(dt); else updatePeople(paused ? 0 : dt, e);   // 开场：人物由 opening.js 摆
  const lifeDt = dt * (run.speed === 0 && sim.phase === 'live' ? 0 : Math.max(0.7, Math.min(run.speed, 2)));
  const isBlocked = (a, b) => !!sim.blocked?.has(a < b ? `${a}-${b}` : `${b}-${a}`);
  const people = [elder.root, companion.root, kid.root, ...crowd.map(p => p.root), ...Object.values(helperPeople).map(h => h.person.root)].filter(r => r.visible).map(r => r.position);   // 路上的人（不含路人）
  walkers.update(lifeDt, isBlocked, cars, people, elder.root.visible ? elder.root.position : null);
  // 车让人：路上的行人、爷爷、陪同的人、孙女、出门打招呼的邻居
  const onRoad = walkers.positions().concat(people);
  separate(onRoad, new Set([elder.root.position]), space);   // 人与人不重叠：推开离得太近的（不推爷爷，推完仍在人行网上）   // 路上所有人（09-28 补上健步走的队伍）
  cars.update(lifeDt, isBlocked, onRoad); clouds.userData.update(frozen ? 0 : dt); fx.update(dt);
  sky.position.copy(camera.position);
  // 听者＝镜头：位置、朝向；镜头远近决定空旷感；静观时环境声略大
  camera.getWorldDirection(_fwd); _up.set(0, 1, 0).applyQuaternion(camera.quaternion);
  sceneAudio(dt);
  setListener(camera.position, _fwd, _up, camera.position.distanceTo(controls.target), idleOn || watchOn || eveningOn); voiceTick();

  // 他的地图：雾跟着规则走（下雨、他慌了会变浓），每半秒按 sim.risk 重算一次
  if ((mistClock += dt) > 0.5 && sim.phase === 'live') { mistClock = 0; updateMistTargets(); }
  { const T = performance.now() / 1000, here = sim.phase === 'live' ? sim.e?.node : -1;
    updateMistHole();
    mists.forEach((m, i) => { if (!m) return;
      if (!m.material.userData.hole) { mistHole(m.material); m.userData.wisps.forEach(w => mistHole(w.material)); }
      const u = m.userData, want = Math.min(1, u.target * (i === here ? 0.55 : 1) + u.flash * 0.35);   // 他站着的路口淡一些，看得见人
      m.material.opacity += (want - m.material.opacity) * Math.min(1, dt * (u.puff > 0 ? 4 : 2.2)); m.visible = m.material.opacity > 0.01; m.material.color.copy(mistTint);
      u.flash = Math.max(0, u.flash - dt * 0.6);
      const k = (u.puff > 0 ? 1 + (1 - u.puff) * 0.9 : 1) * (1 + u.flash * 0.15);   // 散开：向外涨开；拐错：鼓一下
      if (u.puff > 0) u.puff = Math.max(0, u.puff - dt * 0.8);
      m.scale.set(MIST_W * k, MIST_H * k, 1);
      u.wisps.forEach((w, j) => { const ph = w.userData.ph + T * 0.25, fly = u.puff > 0 ? (1 - u.puff) * 9 : 0;
        w.position.set(u.home.x + (Math.sin(ph) * 2.2 + w.userData.dir * (3.2 + fly)), u.home.y + 0.4 + Math.sin(ph * 1.3) * 0.3, u.home.z + Math.cos(ph * 0.8) * 1.6 + fly * 0.4 * w.userData.dir);
        w.scale.set(MIST_W * 0.62 * k, MIST_H * 0.62 * k, 1); w.material.opacity = m.material.opacity * 0.7; w.visible = m.visible; w.material.color.copy(mistTint); });
    }); }

  updateSteam(dt);
  // 家：镜头靠近时屋顶淡出；有人经过门口时开门
  {
    const u = homeG.userData;
    const near = camera.position.distanceTo(controls.target) < 58 && controls.target.distanceTo(homeG.position) < 16;
    const want = near ? 0 : 1;
    for (const m of u.roofMats) { m.opacity += (want - m.opacity) * Math.min(1, dt * 5); m.depthWrite = m.opacity > 0.95; }
    u.roof.visible = u.roofMats[0].opacity > 0.03;
    const doorPt = homeWorld('doorIn').lerp(homeWorld('doorOut'), 0.5);
    const passing = elder.root.position.distanceTo(doorPt) < 2.4 || (kid.root.visible && kid.root.position.distanceTo(doorPt) < 2.4);
    const ang = passing ? -1.5 : 0;
    u.doorPivot.rotation.y += (ang - u.doorPivot.rotation.y) * Math.min(1, dt * 6);
  }
  tickHomeAction(dt);
  for (let i = useChips.length - 1; i >= 0; i--) {
    const c = useChips[i], age = (performance.now() - c._born) / 1000;
    if (age > 2.2) { c.remove(); useChips.splice(i, 1); continue; }
    project(elder.root.position, c, 4.6 + age * 1.2 + i * 0.9);
    c.style.opacity = age < 1.6 ? 1 : 1 - (age - 1.6) / 0.6;
  }

  // 路标生长
  for (const o of signObjs.values()) {
    const a = (performance.now() - o.born) / 400;
    if (a < 1.2) o.g.scale.setScalar(Math.min(1, 1 - Math.pow(1 - Math.min(a, 1), 3) + Math.sin(Math.min(a, 1) * Math.PI) * 0.15));
  }
  updateRings(dt); updateRoutes(dt); updatePresence(dt);   // 人物淡入淡出（presence.js）
  { const g = sim.e?.goal, col = g?.kind === 'trip' ? routeColor(g) : ROUTE_COLORS[0];   // 脚下的圈和当前这一趟路线同色（10-14 用户）：第一趟赭橙、第二趟湖蓝；在家、没出门时用第一趟的颜色
    if (elderRing.material.color.getHex() !== col) { elderRing.material.color.setHex(col); elderRing.children[0]?.material.color.setHex(col); } }

  // 雨
  if (rain.visible) {
    const arr = rainGeo.attributes.position.array;
    for (let i = 0; i < RAIN_N; i++) {
      let y = arr[i * 6 + 1] - dt * 40;
      if (y < 0) y += 60;
      arr[i * 6 + 1] = y; arr[i * 6 + 4] = y - 1.2;
    }
    rainGeo.attributes.position.needsUpdate = true;
  }

  updateCamera(dt, e);
  controls.update();
  updateLighting();

  // 帧率统计、自动定档、动态分辨率放在画之前（10-13 用户：标题背景闪白）：它们会改画布大小，改大小会清空画布——
  // 原来放在画完之后，这一帧交出去的就是空画布（露出页面底色，一闪白）；先改再画，这一帧画的就是新大小
  perfTick(performance.now());
  updateOverlays(dt);
  renderFrame(opening.on || eveningOn || document.body.classList.contains('at-title'), gfxTier, eveningOn);   // eveningOn：只在一天结束、镜头回家讲往事时（白天在往事发生的地方当场讲也会挂 evening 标记，那时是白天，不能开强光晕）   // 后期只在开场、标题画面、晚上讲往事（都不读雾；静观是细看小镇的，保持清楚）
  perfPanel();
}

const _fwd = new THREE.Vector3(), _up = new THREE.Vector3();

// 「视角」按钮；双击画面让镜头回到他身上
canvas.addEventListener('dblclick', () => { cam.follow = true; });

// 出错时只给中文提示，英文原文留在控制台；声音、浏览器插件、窗口尺寸之类不影响游戏的报错不打扰玩家
let errShown = 0;
function showErr(msg, file) {
  console.error(msg);
  const m = String(msg || '');
  if (/audio|decode|resume|suspend|play\(|NotAllowed|NotSupported|AbortError|ResizeObserver|Script error/i.test(m)) return;
  if (file && !file.startsWith(location.origin) && !file.startsWith('blob:')) return;
  const now = performance.now(); if (now - errShown < 30000) return; errShown = now;
  try { hint(NARR.error, 8); } catch { }
}
window.addEventListener('unhandledrejection', (ev) => showErr(ev.reason?.stack || ev.reason?.message || ev.reason));
window.addEventListener('error', (ev) => showErr(ev.error?.stack || ev.message, ev.filename));
// 首次进入：先按设备粗估一档，再在标题画面实测 4 秒校正
if (settings.gfx === 'auto' && !autoTier()) { applyGfx(lowEnd ? 2 : 3); perf.probing = true; }
// 流程模块的依赖（成就表、家等）在上面都声明好了，这里再注入
initFlow();
applySettings();
showTitle();
requestAnimationFrame(tick);
