// 静观（不操作时界面变淡、镜头慢转）、犹豫时刻面板、出发、弹窗、标题与游戏视角。依赖由 main.js 通过 initStage 注入。
import { NARR, narrMoment } from './narr.js';
import * as THREE from 'three';
import { cam, focusOn, zoomTo } from './camera.js';
import { initAudio, sfx, startMusic, stopVoice, voiceCls, narrate, voice } from './audio.js';
import { learnList } from './games.js';
import { mapMode } from './mapops.js';
import { bark, bubble, coach, coachStep, hideHint, hint, renderCards, setDockOpen, showBubble, markHinted } from './ui.js';
import { homeG } from './home.js';
import { supportUsed } from './achieve.js';
import { renderRoutes, routeGroup } from './routes.js';

import { icon } from './icons.js';
import { $, camera, controls, hudR, isMobile, persist, run, ui, sim } from './core.js';
import { elderRing, graph, elderVoicePos } from './world.js';
import { rng } from './util.js';
const museRnd = rng(31);   // 纯外观的随机（提示语、闪光）：自己的随机数，不扰动游戏内容
;
let lastInput;
export let idleOn;
export let watchOn;
let museT;
let museShown;
let museLast;

export function initStage() {
  lastInput = performance.now(); idleOn = false; watchOn = false; museT = 4; museShown = false; museLast = '';
  addEventListener('pointerdown', (ev) => { if (watchOn && !$('#hudR').contains(ev.target)) { setWatch(false); ev.stopPropagation(); } wake(); }, true);
  addEventListener('pointermove', wake, true);
  addEventListener('wheel', wake, true);
  addEventListener('keydown', (ev) => {
    if ((ev.key === 'h' || ev.key === 'H') && (sim.phase === 'live' || sim.phase === 'plan') && $('#modal').classList.contains('hidden') && $('#game').classList.contains('hidden')) setWatch(!watchOn);
    else if (ev.key === 'Escape' && watchOn) setWatch(false);
    wake();
  }, true);
  $('#actCall').onclick = () => { initAudio(); sim.call(); };
  $('#actWalk').onclick = () => { initAudio(); sim.escort(); };
  $('#startBtn').onclick = () => {
    initAudio(); sfx('click'); if (coach) coachStep(null);
    ui.selected = null; renderCards();
    $('#startBtn').classList.add('hidden');
    // 早饭桌上：他先念叨今天的菜单（学习）。贴了购物便签就照着便签买，不用记
    const gm = sim.goals.find(x => x.menu && x.recall !== false && !x.learned);
    if (gm && !persist.home.has('note')) {
      gm.learned = true;
      focusOn(homeG.position); zoomTo(window.innerWidth > 760 ? 34 : 48);
      learnList(gm.menu, sfx, beginDay);
    } else {
      beginDay();
      // 贴了便签：不用记，他看着门口的便签念一遍就行
      if (gm) { gm.learned = true; supportUsed('note'); showBubble(`看看便签：${gm.menu.say || '今天做' + gm.menu.dish}，买${gm.menu.items.join('、')}`, 'good list', 5); }
    }
  };
}
// ---------- 静下来看 ----------
// 白天一段时间不操作，界面自动变淡；“只看小镇”则全部收起。镜头慢慢绕着他转，偶尔浮出一句话。
const IDLE_MS = 15000;
export function setWatch(on) {
  watchOn = on; document.body.classList.toggle('watch', on);
  routeGroup.visible = !on; elderRing.visible = !on;   // 玩的时候用的标记，静观时收起
  if (on) { cam.follow = true; hideHint(); museOff(); } else { museOff(); lastInput = performance.now(); }
}
function museOff() { $('#muse').classList.remove('on'); museShown = false; museT = 6; }
export function wake() {
  lastInput = performance.now();
  if (idleOn) { idleOn = false; document.body.classList.remove('idle'); if (!watchOn) museOff(); }
}
// 界面变淡时浮出的感慨句：用户 09-25 认为像“鸡汤”，意义交给他当场讲的往事和小镇本身；默认关闭
const MUSE_ON = false;
const MUSE = {
  any: ['日子，就是一件件小事连起来的。', '他想自己来。这是他的体面。', '慢一点也没关系，路还在，人也还在。', '街上每个人，都在过自己的一天。', '最好的帮忙，是让他觉得是自己做到的。', '等一等，也是一种帮助。', '记不住今天，他还记得很多个从前。', '我们都会老，也都会忘记一些事。', '被人认得，是一种安心。', '一辈子很长，一天也很长。', '他在这条街上，走了四十年。', '有人等他回家吃饭，这就够了。'],
  morning: ['早上的风，和四十年前一样。', '新的一天，他又想自己出门了。', '早点摊的热气，是小镇醒来的样子。'],
  evening: ['天快黑了，窗户一扇扇亮起来。', '忙了一天，谁都想回家。', '今天的事，明天他也许就忘了。今天的好，你会记得。'],
  rain: ['下雨了，路上的人都走得快一些。', '雨天，老榕树底下最热闹。'],
  out: ['他走得不快，但每一步都是自己走的。', '拐角那家店换了招牌，他还记得原来的样子。', '有人冲他点点头，他也点点头。'],
  home: ['他在家里坐一会儿，想一想下午的事。', '屋里的钟，滴答滴答。'],
};
function pickMuse() {
  const t = sim.time || 480, pool = [...MUSE.any];
  if (t < 660) pool.push(...MUSE.morning, ...MUSE.morning);
  if (t >= 1050) pool.push(...MUSE.evening, ...MUSE.evening);
  if (sim.raining) pool.push(...MUSE.rain, ...MUSE.rain);
  pool.push(...(sim.e && sim.e.mode === 'home' ? MUSE.home : MUSE.out));
  let s; do { s = pool[Math.floor(museRnd() * pool.length)]; } while (s === museLast && pool.length > 1);
  return museLast = s;
}
export function updateCalm(dt) {
  const quiet = sim.phase === 'live' && !sim.moment && !mapMode && !ui.selected && run.speed > 0 &&
    $('#game').classList.contains('hidden') && $('#modal').classList.contains('hidden') && !(isMobile() && hudR.classList.contains('open'));
  const busy = !sim.phase || sim.phase === 'summary' || sim.moment || mapMode || !$('#game').classList.contains('hidden') || !$('#modal').classList.contains('hidden');
  if (watchOn && busy) setWatch(false);
  if (!idleOn && quiet && performance.now() - lastInput > IDLE_MS) { idleOn = true; document.body.classList.add('idle'); cam.follow = true; museT = 3; }
  if (idleOn && !quiet) wake();
  if (watchOn && museShown) museOff();   // 静观：只有小镇和时间，不浮出话
  if (MUSE_ON && idleOn && !watchOn) {
    if (bubble && bubble.classList.contains('memo') && ui.bubbleT > 0) { if (museShown) museOff(); return; }   // 讲往事时不浮出别的话
    museT -= dt;
    if (museT <= 0) {
      const m = $('#muse');
      if (museShown) { m.classList.remove('on'); museShown = false; museT = 10; }
      else { m.textContent = pickMuse(); m.classList.add('on'); museShown = true; museT = 9; }
    }
  }
}
export function showMoment(m) {
  const el = $('#moment');
  document.body.classList.toggle('in-moment', !!m);
  if (!m) { if (!el.classList.contains('hidden')) { stopVoice('moment'); stopVoice('narr'); } el.classList.add('hidden'); return; }   // 做了选择，他没说完的那句就停
  el.classList.remove('hidden');
  // 他的自言自语：声音从他站的地方发出；加速太快时不播，免得和画面对不上
  if (voiceCls(m.text) === 'phone') { if (m.voicedText !== m.text) { m.voicedText = m.text; m.voiced = true; bark(m.text); } }   // 电话里的回话
  else if (m.kind === 'lost') m.voiced = true;   // 电话里（他打来、你打过去，不论他走得好、在犹豫、迷了路）：只念电话里的回话，不再先念自言自语“我有点找不着路了”（10-06：回话排在它后面晚 2 秒、面板关了还在念）   // 他走得好好的时你打过去：别让他说“我有点找不着路了”   // 他打来的电话：面板里就是他的原话，不再念一遍“我有点找不着路了”（会排在他刚说的那句后面、晚开口）
  else if (!m.voiced) { m.voiced = true; voice('main', 'mo_' + m.kind, { pos: elderVoicePos, tag: 'moment' }); if (run.helpedOnce.moment) narrate(narrMoment(m.kind), { keep: true }); }   // 他说完，旁白念情形（第一次由下面的操作提示代替）   // 犹豫时刻时间是停住的，总是说
  const opts = sim.momentOptions();
  el.innerHTML = `<div class="mt">${m.kind === 'lost' ? `<span class="mcall">${icon('phone', 15,
    2.2)}${m.fromHim ? '他打来电话' : '电话里'}</span>` : ''}${m.fine ? '他走得好好的' : m.atHesitate ? '他在路口停下来想' : m.def.title}</div><div class="mc">${m.text}${m.kind === 'lost' && m.stuck ? '<small class="mnote">他慌得听不进电话里的话，这时人在身边最管用。</small>' : ''}</div>` +
    opts.map(o => `<button data-id="${o.id}" class="${o.id === 'tell' || o.id === 'walk' ? 'tell' : o.id === 'letgo' ? 'letgo' : ''}">${o.label}<small>${o.id === 'tell' ? (m.kind === 'lost'
      ? '最多说 3 个路口，后面靠他自己 · 仍算他自己办的' : sim.tellTimely(m) ? '一定管用 · 等过、提示过才说，算一半他自己办的' : '一定管用 · 这会儿就说，算你替他做的') : o.id === 'walk' ? '一路陪到，最稳 · 他慌了才去，算一半他自己办的' : o.id === 'letgo' ? '顺其自然' : o.id === 'wait'
      ? '他可能自己想起来' : m.atHesitate ? '旁边有他认得的东西就灵 · 一趟里问多了他会烦' : '他更可能自己想起来'}</small></button>`).join('');
      
  el.querySelectorAll('button').forEach(b => b.onclick = () => { initAudio(); sfx('click'); sim.choose(b.dataset.id); });
  if (!run.helpedOnce.moment) { markHinted('moment'); hint(NARR.moment, 9); el.classList.add('coach'); setTimeout(() => el.classList.remove('coach'), 6000); }
}
function beginDay() {
  sim.begin(); renderRoutes();
  $('#startBtn').classList.add('hidden');
  $('#dock').classList.add('live'); document.body.classList.add('live-ui'); setDockOpen(false);
  $('#cards').parentElement.classList.remove('planning');
  $('#actions').classList.remove('hidden');
  hint(NARR.out, 4);
  cam.follow = true;
  focusOn(graph.pos[sim.homeNode]);
  zoomTo(window.innerWidth > 760 ? 52 : 70);
  startMusic('day');
}

export function modal(html, cls = '') { stopVoice(); $('#sheet').innerHTML = html; $('#sheet').scrollTop = 0; $('#modal').className = 'modal ' + cls; $('#sheet').querySelectorAll('.vbtn').forEach(b => b.onclick = () => { initAudio(); voice('main', b.dataset.v, { tag: 'memory' }); }); }
export function closeModal() { $('#modal').classList.add('hidden'); }
// 标题画面：镜头放低，看得见远处的天际和夕阳，慢慢绕着小镇转
export function titleView() {
  document.body.classList.add('at-title'); cam.fly = null;
  controls.maxPolarAngle = 1.45; cam.pan = null; cam.zoom = null; cam.follow = false;
  controls.target.set(0, 7, 4);
  camera.position.set(95, 22, 15);   // 朝西看，夕阳落在画面右侧（左边是标题卡片）
  controls.update();
}
// 进游戏时看小镇的标准视角（摆正、朝北俯视）：开场最后一个镜头也落在这里，接进游戏不跳
export function gamePose() {
  const tgt = window.innerWidth > 760 ? new THREE.Vector3(0, 0, 2) : new THREE.Vector3(-8, 0, 6);
  return { tgt, pos: tgt.clone().add(new THREE.Vector3(0, 78, 66).normalize().multiplyScalar(window.innerWidth > 760 ? 100 : 125)) };
}
// 从标题的低角度平滑飞到俯视的小镇（结束后再恢复镜头俯仰限制）
export function gameView() {
  document.body.classList.remove('at-title');
  if (controls.maxPolarAngle <= 1.15) return;
  const { tgt: toTgt, pos: toPos } = gamePose();
  cam.fly = { t: 0, fromPos: camera.position.clone(), fromTgt: controls.target.clone(), toPos, toTgt };
}
