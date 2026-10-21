// 开场（P1a，约 30 秒，实时画面）：他沿熟路走——走到不熟的路口，雾升起来、他犹豫——刘师傅在门口喊一声、路口立起路标、那片雾散开，
// 他认出方向接着走——镜头拉远，全镇零星几片雾，一句话点题。不说病名，不恐怖；雾是“他心里的地图”，不是幻觉。
// 首次点「开始」时播放（浏览器要先点一下才能出声），右下角「跳过」；标题画面「看开场」可以重看。
// 播放时由这里直接摆人物、镜头和雾（main.js 这时不跑平常的人物更新）；结束时全部复原。
import { stepAlong, stopShort } from './mover.js';
import * as THREE from 'three';
import { OLD_LANDMARKS, PLACES, nid } from './data.js';
import { NARR } from './narr.js';
import { SCRIPT } from './lines.js';
import { narrate, stopVoice, voice, voiceKey, playTheme, stopTheme } from './audio.js';
import { camera, controls, project, bubblesEl } from './core.js';
import { cam } from './camera.js';
import { elder, graph, helperPeople, neighborDoor, roadPath, addSignMesh, signObjs, fx, space } from './world.js';
import { mists } from './routes.js';
import { disposeTree } from './util.js';
import { closeModal, gamePose } from './stage.js';

export const opening = { on: false, t: 400 };   // t：开场里的钟点（光线用）：从清晨 6:40 起，太阳低、影子长
const SEEN = 'mg-opening-seen';
export function openingSeen() { try { return localStorage.getItem(SEEN) === '1'; } catch { return true; } }
export function resetOpeningSeen() { try { localStorage.removeItem(SEEN); } catch { } }

const WALK1 = [24, 17, 18, 19], FOG_NODE = 19, WALK2 = [12, 11];   // 小学门口 → 老电影院 → 刘师傅家门口的路口（他不熟）→ 往公园棋亭
const SAY = { hes: SCRIPT.opening.hes, li: SCRIPT.openingLi.way, found: SCRIPT.opening.found };   // 台词在台词表（lines.js），配音由剧情数据检查核对
let T = 0, done = null, ov = null, cues = [], walkQ = [], liQ = [], elderAnim = 'walk', liAnim = 'idle', addedSign = false;
const bubbles = {};
const _t = new THREE.Vector3(), _p = new THREE.Vector3();
// 镜头（10-14 用户：环节不变，镜头细致些、不突兀，最后的地图摆正）：
// 三个机位——天际线（和标题画面同一个机位）、跟着他、全镇（＝进游戏时的标准视角，开场结束直接接上）；
// 每个机位用“看哪儿＋多远＋方位角＋仰角”描述，机位之间按时间缓入缓出地混合（不再用逐帧追赶，起步、停下都没有顿挫）；
// 跟拍看的是“他位置的弹簧平滑”，拐弯时镜头不抖。
const ss = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * k * (k * (k * 6 - 15) + 10); };   // 平滑阶梯：两头速度都是 0
const SKY = { tgt: new THREE.Vector3(0, 7, 4), dist: Math.hypot(95, 15, 11), az: Math.atan2(95, 11), el: Math.asin(15 / Math.hypot(95, 15, 11)) };   // 标题画面的机位（stage.js titleView）
const SHOT = { swoop: [1.4, 5.6], wide: [18.4, 25.0] };   // 天际线→跟拍、跟拍→全镇 的过渡起止秒
const focus = { p: new THREE.Vector3(), v: new THREE.Vector3() };
const camA = { tgt: new THREE.Vector3() }, camB = { tgt: new THREE.Vector3() };

// 他平常认得的路口：家门口一圈、各个常去的地方、几十年的老地标（和规则里的 familiar 同一套，开场不依赖当天数据）
function clearNodes() {
  const home = nid(...PLACES.home.node), s = new Set();
  for (let i = 0; i < graph.adj.length; i++) if (graph.dist[i][home] <= 1) s.add(i);
  for (const p of Object.values(PLACES)) s.add(nid(...p.node));
  for (const l of OLD_LANDMARKS) s.add(nid(...l.node));
  WALK1.slice(0, -1).forEach(n => s.add(n));
  return s;
}
function say(who, text, dur = 3) {
  let el = bubbles[who]; if (!el) { el = document.createElement('div'); bubblesEl.appendChild(el); bubbles[who] = el; }
  el.className = 'bubble ' + (who === 'li' ? 'good' : text === SAY.found ? 'good' : 'q'); el.textContent = text; el.dataset.t = dur; el.style.display = '';
  const person = who === 'li' ? helperPeople.li.person : elder, id = voiceKey(who === 'li' ? 'li|' + text : text);
  if (id) voice('main', id, { tag: 'opening', pos: () => _p.copy(person.root.position).setY(2) });
}
const at = (s, fn) => cues.push({ s, fn });

export function playOpening(onDone) {
  done = onDone; opening.on = true; opening.t = 400; T = 0; cues = []; addedSign = false;
  playTheme();   // 配乐按开场的画面节拍写好（audio.js OPENING）
  closeModal(); document.body.classList.remove('at-title'); document.body.classList.add('opening');
  cam.fly = null; cam.pan = null; cam.zoom = null; cam.follow = false; controls.maxPolarAngle = 1.2;
  ov = document.createElement('div'); ov.id = 'opening';
  ov.innerHTML = '<div class="op-cap"><p></p><p></p></div><div class="op-title"><h1>爷爷的一周</h1></div><button id="opSkip" class="ghost">跳过</button><div class="op-fade"></div>';
  document.body.appendChild(ov);
  ov.querySelector('#opSkip').onclick = () => finish();
  requestAnimationFrame(() => ov.classList.add('in'));
  // 人物
  elder.root.visible = true; { const s0 = space.snap(graph.pos[WALK1[0]]); elder.root.position.set(s0.x, 0, s0.z); } elder.setProp(null); elder.setUmbrella(false); elder.setExpr('neutral');   // 地基（10-05）：开场也走人行道（原来沿路中线）
  walkQ = sidewalkVia(elder.root.position, WALK1.slice(1)); elderAnim = 'walk';
  const li = helperPeople.li.person; li.root.visible = false; liQ = [];
  // 雾：一开始全清楚
  mists.forEach(m => { if (m) { m.userData.target = 0; m.material.opacity = 0; } });
  // 镜头：先是清晨的天际线（低角度，看得见朝阳和天空），前 3 秒俯冲进小镇、落到他身后上方
  focus.p.copy(elder.root.position); focus.v.set(0, 0, 0);
  placeCam(0);   // 先停一会儿看天际线和朝阳，再慢慢俯冲到他身后上方

  // 走到第三个路口前，他不熟的地方慢慢起雾：从要到的那个路口起，按远近一圈圈漫开
  const clear = clearNodes();
  at(6.2, () => { const m = mists[FOG_NODE]; if (m) m.userData.target = 0.6; });   // 镜头贴得近：雾薄一点，看得清他在雾里犹豫
  for (let i = 0; i < mists.length; i++) if (mists[i] && !clear.has(i) && i !== FOG_NODE) { const d = graph.dist[FOG_NODE][i]; at(6.6 + d * 0.45, () => { mists[i].userData.target = 0.62 + (i % 3) * 0.06; }); }
  at(9.3, () => { elderAnim = 'look'; elder.setExpr('think'); say('elder', SAY.hes, 3.2); });
  // 刘师傅从家门口出来喊一声
  at(12.4, () => { const door = neighborDoor('li'); li.root.position.copy(door); li.root.visible = true; liQ = stopShort(roadPath(door, elder.root.position), elder.root.position, 1.1); liAnim = 'walk'; });   // 走到他跟前一步开外（10-13：原来要走到路口斜对面那个角，路线正好穿过他站的地方，被推回来、贴着他原地迈腿）
  at(13.6, () => say('li', SAY.li, 3));
  // 路口立起一块路标：这一片的雾散开
  at(15.0, () => { if (!signObjs.has(FOG_NODE)) { addSignMesh(FOG_NODE); addedSign = true; } const m = mists[FOG_NODE]; if (m) { m.userData.target = 0; m.userData.puff = 1; } fx.ring(graph.pos[FOG_NODE].clone(), 0x3f8f7a); });
  at(16.2, () => { elderAnim = 'happy'; elder.setExpr('happy'); say('elder', SAY.found, 2.4); });
  at(18.0, () => { elderAnim = 'walk'; elder.setExpr('neutral'); walkQ = sidewalkVia(elder.root.position, WALK2); liQ = roadPath(li.root.position, neighborDoor('li')); liAnim = 'walk'; });
  // 一句话点题（09-27 用户定维持）
  at(20.6, () => { const c = ov.querySelectorAll('.op-cap p'); c[0].textContent = NARR.opening1; c[0].classList.add('on'); narrate(NARR.opening1); });
  at(23.4, () => { const c = ov.querySelectorAll('.op-cap p'); c[1].textContent = NARR.opening2; c[1].classList.add('on'); narrate(NARR.opening2, { keep: true }); });
  at(27.0, () => { ov.querySelector('.op-cap').classList.add('gone'); ov.querySelector('.op-title').classList.add('on'); });   // 两句字收起，标题大字淡入（配乐这时回到主和弦、最后一声钟）
  at(30.2, () => ov.classList.add('out'));   // 标题和字淡出；镜头已经停在进游戏的视角，画面直接接上（原来先压暗再切，结尾发灰、切得突兀）
  at(31.4, () => finish());
  cues.sort((a, b) => a.s - b.s);
}

// 按路口顺序逐段走人行网（每段停在那个路口离得最近的人行道角上）
function sidewalkVia(from, nodes) {
  const q = []; let p = from.clone();
  for (const n of nodes) { const seg = roadPath(p, graph.pos[n]).slice(1); q.push(...seg); if (seg.length) p = seg[seg.length - 1]; }
  return q;
}
function moveTo(person, q, sp, dt) { return stepAlong(person, q, sp, dt, { face: true, near: 0.12 }) !== 'done'; }   // 统一移动入口（mover.js）

export function openingTick(dt) {
  if (!opening.on) return;
  T += dt; opening.t = 400 + T * 2.2;
  while (cues.length && cues[0].s <= T) cues.shift().fn();
  // 人物
  const walking = moveTo(elder, walkQ, 4, dt);
  elder.anim = walking ? 'walk' : elderAnim === 'walk' ? 'idle' : elderAnim; elder.speed = 0.9; elder.update(dt);
  const li = helperPeople.li.person;
  if (li.root.visible) {
    const w = moveTo(li, liQ, 5, dt); li.anim = w ? 'walk' : liAnim === 'walk' ? 'wave' : liAnim;
    if (!w) li.face(elder.root.position, dt);
    if (!w && T > 18.5) li.root.visible = false;   // 回到家门口：进屋
    li.update(dt);
  }
  // 气泡跟着人
  for (const [who, el] of Object.entries(bubbles)) {
    el.dataset.t = +el.dataset.t - dt;
    const p = who === 'li' ? li : elder;
    if (+el.dataset.t <= 0 || !p.root.visible) el.style.display = 'none'; else project(p.root.position, el, who === 'li' ? 2.4 : 3.0);
  }
  // 镜头
  const w = 2.4; focus.v.addScaledVector(_t.subVectors(elder.root.position, focus.p), w * w * dt).multiplyScalar(Math.max(0, 1 - 2 * w * dt)); focus.p.addScaledVector(focus.v, dt);   // 弹簧平滑（临界阻尼）
  placeCam(T);
}
// 跟拍机位：在他身后上方（约 57° 俯视，街两边的房子挡不住人），随着故事慢慢推近；他犹豫、被指路时再近一点、稍稍绕过去
function followShot(o) {
  o.tgt.copy(focus.p).setY(1.2);
  o.dist = 25 - 4 * ss(4, 18, T) - 3.5 * ss(8.6, 12.4, T) + 2 * ss(16.4, 18.6, T);
  o.az = Math.atan2(6, 12) - 0.22 * ss(4, 17, T); o.el = 1.0 - 0.06 * ss(4, 17, T);
}
// 全镇机位＝进游戏时的标准视角（摆正、朝北俯视）；先稍远，再慢慢落到正好的距离
function wideShot(o) {
  const g = gamePose(), off = _p.subVectors(g.pos, g.tgt);
  o.tgt.copy(g.tgt); o.dist = off.length() * (1.1 - 0.1 * ss(SHOT.wide[0], 29.4, T)); o.az = Math.atan2(off.x, off.z); o.el = Math.asin(off.y / off.length());
}
function blend(a, b, k) {   // 距离按对数混合（远近变化大时速度均匀），方位角走近的一边
  a.tgt.lerp(b.tgt, k); a.dist = Math.exp(Math.log(a.dist) * (1 - k) + Math.log(b.dist) * k);
  let d = b.az - a.az; d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI; a.az += d * k; a.el += (b.el - a.el) * k;
}
function placeCam(t) {
  const kIn = ss(...SHOT.swoop, t), kOut = ss(...SHOT.wide, t);
  if (kIn < 1) { camA.tgt.copy(SKY.tgt); camA.dist = SKY.dist; camA.az = SKY.az; camA.el = SKY.el; if (kIn > 0) { followShot(camB); blend(camA, camB, kIn); } }
  else { followShot(camA); if (kOut > 0) { wideShot(camB); blend(camA, camB, kOut); } }
  controls.target.copy(camA.tgt);
  camera.position.set(Math.sin(camA.az) * Math.cos(camA.el), Math.sin(camA.el), Math.cos(camA.az) * Math.cos(camA.el)).multiplyScalar(camA.dist).add(camA.tgt);
  camera.lookAt(controls.target);
}

function finish() {
  if (!opening.on) return;
  opening.on = false; cues = [];
  try { localStorage.setItem(SEEN, '1'); } catch { }
  stopVoice('opening'); stopVoice('narr'); stopTheme(0.8);
  ov?.remove(); ov = null; document.body.classList.remove('opening');
  for (const el of Object.values(bubbles)) el.style.display = 'none';
  helperPeople.li.person.root.visible = false;
  if (addedSign) { const o = signObjs.get(FOG_NODE); if (o) { disposeTree(o.g); signObjs.delete(FOG_NODE); } }
  mists.forEach(m => { if (m) m.userData.target = 0; });
  controls.maxPolarAngle = 1.45;
  const cb = done; done = null; cb?.();
}
