
import { $, canvas, controls, hudR, isMobile, run, sim, ui } from './core.js';
import { cam, zoomTo } from './camera.js';
import { closeModal, setWatch } from './stage.js';
import { layoutTop, phoneTop, syncTop, topSheet } from './ui.js';
import { icon } from './icons.js';
import { pauseTimers } from './util.js';
import { initAudio, setBackground, setMusicRate, setPaused, sfx } from './audio.js';

import { showSettings } from './settings-ui.js';
import { showHandbook } from './pages.js';
// 顶栏：时间、暂停与倍速、菜单（视角、静观、手册、设置）、跟身后的视角、切到后台自动暂停。

let menuEl;

export function initHud() {
  // 界面图标
  document.querySelectorAll('[data-i]').forEach(el => el.insertAdjacentHTML('afterbegin', icon(el.dataset.i, el.classList.contains('ic') ? 22 : el.id === 'gpMore' ? 14 : 20, 2)));
  $('#menuBtn').innerHTML = icon('menu', 20, 2.2);
  // 电脑：空格键暂停／继续
  addEventListener('keydown', (e) => {
    if (e.code === 'Space' && sim.phase === 'live' && $('#modal').classList.contains('hidden') && $('#game').classList.contains('hidden') && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) { e.preventDefault(); setSpeed(run.speed === 0 ? lastSpeed : 0); } });
  // 切到别的应用／标签页：连声音一起停（画面本来就不再刷新）
  // 并自动暂停：回来时停在暂停，点“继续”再走（这一下点按也让手机浏览器重新出声）
  document.addEventListener('visibilitychange', () => {
    setBackground(document.hidden);
    if (document.hidden && sim.phase === 'live' && run.speed > 0) setSpeed(0);
  });
  guardPause();
  $('#pauseBtn').onclick = () => { initAudio(); sfx('click'); setSpeed(run.speed === 0 ? lastSpeed : 0); };
  $('#speedBtn').onclick = () => { initAudio(); sfx('click'); setSpeed({ 1: 2, 2: 4, 4: 1 }[lastSpeed] || 1); };
  document.querySelectorAll('#spdSeg button').forEach(b => b.onclick = () => { initAudio(); sfx('click'); setSpeed(+b.dataset.s); });
  menuEl = $('#menu');
  $('#menuBtn').onclick = (ev) => { ev.stopPropagation(); initAudio(); sfx('click'); hudR.classList.toggle('open'); if (phoneTop() && hudR.classList.contains('open')) ui.gpSheet = false; layoutTop(); syncTop(); };
  document.addEventListener('pointerdown', (ev) => { if (isMobile() && hudR.classList.contains('open') && !hudR.contains(ev.target) && !topSheet.contains(ev.target)) closeMenuMobile(); });
  $('#gearBtn').onclick = () => { initAudio(); sfx('click'); pausedModal((b) => showSettings(b, sim.phase === 'live' || sim.phase === 'plan')); };
  $('#bookBtn').onclick = () => { initAudio(); sfx('click'); pausedModal(showHandbook); };
  $('#followBtn').onclick = () => { initAudio(); sfx('click'); closeMenuMobile(); setFollowCam(!followCam); };
  $('#watchBtn').onclick = () => { initAudio(); sfx('click'); closeMenuMobile(); setWatch(true); };
}
// ---------- 时间与速度 ----------
// 玩家暂停＝整局停住：时钟、人物、关卡里的对白节拍都停（见 setSpeed），也不接受推进游戏的操作（10-13 用户：暂停时还能连线、点“下一步”）。
// 暂停时能点的只有：顶栏（继续、倍速、菜单）、目标面板、设置／手册；拖动、缩放镜头照常（只是看，不推进）。
// 其余点按（关卡、犹豫面板、地图连线、道具、电话、画面上点地方）一律拦下，暂停键闪一下并提示“点继续”。
const PAUSE_OK = '#hudR, #topSheet, #gp, #modal';
export const pausedNow = () => run.speed === 0 && sim.phase === 'live';
let tipT = 0;
export function pauseNudge() {
  const b = $('#pauseBtn'); b.classList.remove('nudge'); void b.offsetWidth; b.classList.add('nudge');
  let tip = $('#pauseTip'); if (!tip) { tip = document.createElement('div'); tip.id = 'pauseTip'; document.body.appendChild(tip); }
  tip.textContent = '已暂停：点右上角 ▶ 继续'; tip.classList.add('on'); clearTimeout(tipT); tipT = setTimeout(() => tip.classList.remove('on'), 1800);   // 纯界面的淡出
}
function guardPause() {
  const blocked = (ev) => pausedNow() && ev.target instanceof Element && !ev.target.closest(PAUSE_OK);
  const stop = (ev) => { ev.stopImmediatePropagation(); ev.preventDefault(); };
  for (const type of ['pointerdown', 'pointerup', 'click', 'dblclick', 'touchstart', 'touchend', 'contextmenu']) addEventListener(type, (ev) => {
    if (!blocked(ev) || ev.target === canvas) return;   // 画面本身：拖动、缩放镜头照常；点选在 main.onTap 里拦
    stop(ev); if (type === 'pointerdown') pauseNudge();
  }, { capture: true, passive: false });
  addEventListener('keydown', (ev) => { if (ev.code !== 'Space' && blocked(ev) && ev.target !== document.body && ev.target !== canvas) stop(ev); }, true);   // 关卡里用键盘选（回车）也拦；空格留给暂停／继续
}
let lastSpeed = 1;
export function setSpeed(s) {
  if (sim.phase === 'live' && sim.events && s !== run.speed) sim.event('player', { op: s === 0 ? 'pause' : run.speed === 0 ? 'resume' : 'speed', speed: s });
  run.speed = s; if (s > 0) lastSpeed = s;
  setMusicRate(s >= 4 ? 1.6 : s >= 2 ? 1.3 : 1);
  $('#pauseBtn').classList.toggle('on', s === 0); $('#pauseBtn').innerHTML = icon(s === 0 ? 'play' : 'pause', 18, 2.4);
  const paused = s === 0 && sim.phase === 'live'; document.body.classList.toggle('paused', paused); setPaused(paused); pauseTimers(paused);   // 关卡里的对白节拍、地图示范也一起停
  $('#speedBtn').textContent = lastSpeed + '×';
  document.querySelectorAll('#spdSeg button').forEach(b => b.classList.toggle('on', +b.dataset.s === lastSpeed));
}
// 剧情里一下子过去的时间（等他想、提示、一起做关卡）：时钟下方冒出“+N 分钟”再淡出——关卡里时钟是停的，关掉后跳到这里，不让人以为时间偷偷走了
export function showTimeJump(min) {
  let el = $('#clockJump');
  if (!el) { el = document.createElement('span'); el.id = 'clockJump'; $('#hudRow').appendChild(el); }
  el.textContent = `+${Math.round(min)} 分钟`; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
}
// 早上布置时时间不走：暂停、速度按钮变灰（在每帧里按阶段切换）
export function syncTimeButtons() { const live = sim.phase === 'live'; $('#pauseBtn').disabled = !live; $('#speedBtn').disabled = !live;
  document.querySelectorAll('#spdSeg button').forEach(b => b.disabled = !live); if (!live && document.body.classList.contains('paused')) { document.body.classList.remove('paused'); setPaused(false); pauseTimers(false); } }
const closeMenuMobile = () => { if (isMobile()) hudR.classList.remove('open'); layoutTop(); syncTop(); };
function pausedModal(show) { closeMenuMobile(); const prev = run.speed; setSpeed(0); show(() => { closeModal(); setSpeed(prev || lastSpeed); }); }
// 跟随视角（第一人称评估的原型）：镜头放低，跟在他身后几步远，随他转向
export let followCam = false;
export function setFollowCam(on) {   // 早上在家也能跟随
  followCam = on && (sim.phase === 'live' || sim.phase === 'plan');; controls.maxPolarAngle = followCam ? 1.42 : 1.15; controls.minDistance = followCam ? 5 : 25;
  $('#followBtn').classList.toggle('on', followCam);
  cam.follow = !followCam;
  if (!followCam && (sim.phase === 'live' || sim.phase === 'plan')) zoomTo(window.innerWidth > 760 ? 52 : 70);
}
