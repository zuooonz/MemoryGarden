// 规则 → 画面的对照表：模拟（sim）里发生的每件事，画面、界面、声音怎么响应（core.hooks）。
// 按领域：界面与消息（log bubble goals mood hesitate menu）／小关卡与关卡（minigame level）／人物与场景（hike burnt grandchild neighbor greet escort favorThanks photoLook encounter happy rain）／声音（sfx step）／一天的流程（moment arrive goalDone end）。
import { NARR } from './narr.js';
import { appear, door as atDoor, shownNow, vanish } from './presence.js';
import * as THREE from 'three';
import { showTimeJump } from './hud.js';
import { $, hooks, persist, run, sim, ui, later } from './core.js';
import { DAYS, NEIGHBORS, OLD_LANDMARKS, nid } from './data.js';
import { HOME_USE, supportUsed } from './achieve.js';
import { MEM_AT, MOOD_CAT, eveningScene, tellMemory } from './flow.js';
import { TASKS, save, writeSave } from './store.js';
import { cam, focusOn, zoomTo } from './camera.js';
import { changeGame, chessGame, clockGame, digitsLearn, digitsRecall, learnList, recallGame, scamCall, stepsGame, talkEvent } from './games.js';
import { coachOn, helperLine, hideHint, hint, renderGoals, setDockOpen, showBubble, toast, markHinted } from './ui.js';
import { companion, elder, fx, graph, helperPeople, kid, rain, space, town, roadPath, neighborDoor } from './world.js';
import { stopShort } from './mover.js';
import { homeG, setHomeAction, homeWorld, insideHome } from './home.js';
import { renderRoutes, pulseAt, updateMistTargets, mistPuff, mistFlash } from './routes.js';
import { setRain, sfx } from './audio.js';
import { showMoment } from './stage.js';
import { startRouteGuide, startTrail } from './mapops.js';
import { setKidPending, cheer, placeBehind } from './actors.js';
import { rng } from './util.js';
const sparkRnd = rng(37);   // 纯外观的随机（提示语、闪光）：自己的随机数，不扰动游戏内容

export function initBridge() {
    Object.assign(hooks, {
    log: (entry) => toast(entry),
    bubble: (text, cls, dur) => showBubble(text, cls, dur),
    goals: () => { renderGoals(); renderRoutes(); },
    sfx: (n) => { sfx(n); if (n === 'good' && sim.e && sim.e.mode !== 'home') fx.sparkle(sim.e.pos); },
    step: () => { if (run.speed <= 2) sfx('step'); renderRoutes(); },
    used: (type) => supportUsed(type),
    menu: (menu, hasNote) => {
      // 贴了便签：他照着便签念；没贴：不再显示清单（避免回忆前泄露答案）
      if (hasNote) showBubble(`照着便签：${menu.items.join('、')}`, 'good list mute', 4);   // 出门的短句按设计不配音（和“去{地方}”一样）
      else showBubble('去菜市场买菜', 'mute', 2);
    },
    minigame: (kind, m, cb) => {
      $('#moment').classList.add('hidden');
      const done = (q, info) => {
        if (TASKS[kind]) {
          const hinted = (info?.stage || 0) > 0 || (info?.repeats || 0) > 0;
          recordTask(kind, q >= 0.99 ? (hinted ? 'hint' : 'self') : 'miss', kind === 'recall' ? ['自己想起来', '提醒他想菜名', '告诉他菜名', '靠摊主挑出的几样'][info?.stage || 0] : kind === 'steps' && info?.repeats ? `请他重说了 ${info.repeats} 遍` : '');
        }
        cb(q, info);
      };
      if (kind === 'recall') recallGame(m.goal.menu, sfx, done);
      else if (kind === 'clock') clockGame(sfx, done, { h: 5, m: 10, text: '五点十分' });
      else if (kind === 'steps') stepsGame(sfx, done);
      else if (kind === 'route') startRouteGuide(sim.e.node, sim.e.target, (path) => cb(path));
    },
    level: (name, data, finish) => {
      $('#moment').classList.add('hidden');
      if (name === 'learn') learnList(data.menu, sfx, () => finish({}));
      else if (name === 'digitsLearn') digitsLearn(data.digits, sfx, () => finish({}));
      else if (name === 'digitsRecall') digitsRecall(data.digits, sfx, (r) => { recordTask('digits', r.q >= 1 ? 'self' : 'miss'); finish(r); });
      else if (name === 'scamCall') {
        focusOn(sim.e.mode === 'home' ? homeG.position : sim.e.pos); zoomTo(window.innerWidth > 760 ? 34 : 48);
        scamCall(data, sfx, (r) => { recordTask('vigilance', r.outcome === 'fail' ? 'miss' : r.caught >= 3 ? 'self' : 'hint', `找到 ${r.caught}/${r.total} 种破绽`); finish(r); });
      }
      else if (name === 'steps') { focusOn(homeG.position); zoomTo(window.innerWidth > 760 ? 34 : 48); stepsGame(sfx, (q, info) => { recordTask('steps',
        info.correct === 3 ? (info.repeats ? 'hint' : 'self') : info.correct === 2 ? 'hint' : 'miss', `做对 ${info.correct}/3 步${info.repeats ? `，请他重说了 ${info.repeats} 遍` : ''}`); finish({ q, correct: info.correct, repeats: info.repeats }); }); }
      else if (name === 'clock') { focusOn(homeG.position); zoomTo(window.innerWidth > 760 ? 34 : 48); clockGame(sfx, (q) => { recordTask('clock', q >= 0.99 ? 'self' : 'miss'); finish({ q }); }, data.h != null ? { h: data.h, m: data.m, text: data.text } : undefined); }
      else if (name === 'chess') { focusOn(town.placeObjs.center.position); chessGame(sfx, (r) => { recordTask('chess', r.right === 7 ? 'self' : r.right >= 5 ? 'hint' : 'miss', `摆对 ${r.right}/7 个`); finish(r); }); }
      else if (name === 'change') changeGame(sfx, (r) => { recordTask('change', r.q >= 1 ? 'self' : r.q >= 0.6 ? 'hint' : 'miss', `算对 ${r.ok ?? Math.round(r.q * 5)}/${r.n ?? 5} 步`); finish(r); }, data.items);
      else if (name === 'trail') { focusOn(town.placeObjs.center.position); talkEvent(sfx, () => startTrail((path, errors) => { recordTask('trail', errors ? 'hint' : 'self', errors ? `中途改了 ${errors} 次` : ''); finish({ path }); })); }
      else finish({ q: 1 });
    },
    hike: (on) => { run.hiking = on; },
    visualHold: true,
    burnt: () => { setHomeAction({ spot: 'stove', anim: 'worried', t: 5, burnt: true }); },
    moment: (m) => { showMoment(m); if (m) { hideHint(); cam.follow = true; const atHome = sim.e.mode === 'home', zd = window.innerWidth > 760 ? 34 : 48; focusOn(atHome ? homeG.position : sim.e.pos,
      window.innerWidth > 760 ? 0.22 : 0, window.innerWidth > 760 ? 0 : 0.18, atHome ? zd : null); if (atHome) zoomTo(zd); } },
    hesitate: (node, changed) => {
      pulseAt(node);
      if (sim.canCall()) { const b = $('#actCall'); b?.classList.add('ping'); setTimeout(() => b?.classList.remove('ping'), 2500); }   // 时机窗口：电话按钮亮一下
      if (!run.helpedOnce.askNow && sim.canCall() && !(changed && persistUnlocked('photo') && !persist.home.has('photo'))) { markHinted('askNow'); hint(NARR.askNow, 5); }   // 第一次犹豫：提示可以趁现在问一句
      else if (changed && !run.helpedOnce.changed && persistUnlocked('photo') && !persist.home.has('photo')) {
        markHinted('changed'); hint(NARR.changed, 6);
      } else if (!run.helpedOnce.actions && coachOn() && sim.e && sim.e.mode !== 'home') {
        markHinted('actions'); hint(NARR.stopped, 8);
        document.querySelectorAll('#actions .tile').forEach(e => { e.classList.add('coach'); setTimeout(() => e.classList.remove('coach'), 6000); });
      } else if (!run.helpedOnce.hesitate && persistUnlocked('sign') && sim.energy >= 1) {
        markHinted('hesitate'); setDockOpen(true);
        hint(NARR.hesitateSign, 4.5);
      }
    },
    visualAtHome: () => (!elder.root.visible || insideHome(elder.root.position)) && ![kid, companion].some(p => p.root.visible && ['走', '寻路'].includes(p.root.userData.why)),   // 画面里的他进了家门、跟着的人也走到了（一天收尾前等这一下）
    grandchild: (on) => {
      setKidPending(false);
      if (!on) { vanish(kid); return; }   // 孙女回家了：淡出（presence）
      if (sim.e.goal?.task === 'pick') { setKidPending(true); return; }   // 接孙女：等他走到校门口，孙女再从校园里跑出来
      if (!shownNow(kid)) { if (!kid.root.visible) placeBehind(kid, 0.9); appear(kid); }
    },
    neighbor: (id, node) => startNeighborHelp(id, node),
    mood: (d, cat) => {   // 头像旁闪一下心情变化
      const el = $('#gpDelta'); if (!el) return;
      el.textContent = (d > 0 ? '+' : '−') + Math.abs(d); el.style.color = d > 0 ? 'var(--done)' : 'var(--warn)'; el.title = MOOD_CAT[cat] || '';
      el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); ui.gpKey = '';
    },
    favorThanks: (who, node) => {   // 邻居沿路走过来拿东西：回家路上路过就在那个路口旁，否则到爷爷家门外（不进屋）；走到了才道谢，再沿路回家
      const h = helperPeople[who], door = neighborDoor(who);
      const road = node != null ? graph.pos[node].clone() : sim.doors?.home?.pos;
      if (!h || !door || !road) return;
      const p = h.person, meet = node != null ? road : homeWorld('doorIn');   // 地基（10-05）：都走人行网——到那个路口最近的人行道角上，或家门口（原来最后一步走到路中线上）
      const from = p.root.visible ? p.root.position.clone() : door;   // 看得见的人不瞬移：已经在路上就从当下的位置走过去（10-06）
      if (!p.root.visible) { p.root.position.copy(from); atDoor(p, true); }   // 从自家门里出来（presence）
      const out = roadPath(from, meet), end = out[out.length - 1];
      if (node == null) out.pop();   // 家门口：停在门外，不进屋
      h.state = { phase: 'out', out, back: roadPath(node == null ? out[out.length - 1] : end, door), t: 0, wait: -2, onArrive: () => { helperLine(who, 'nb.thanks.' + who, {}, 3); run.favorBusyUntil = performance.now() + 3500; } };
      run.favorBusyUntil = Infinity; run.favorState = h.state;   // 走到、道完谢之前，规则层先别开始下一件事（见 sim.update 的 favorBusy）
    },
    favorBusy: () => run.favorBusyUntil === Infinity ? Object.values(helperPeople).some(h => h.state === run.favorState) : performance.now() < (run.favorBusyUntil || 0),   // 还在走过来（那一趟没被别的事顶掉），或道谢的话还没说完
    photoLook: () => { showBubble('那会儿，我们常去老电影院看电影。', 'good', 3); setHomeAction({ ...HOME_USE.photo, t: 4 }); },   // 早上在照片前站一会儿
    encounter: (kind, node) => {
      if (kind === 'stall') return;
      const h = helperPeople.acq, p = h.person, e = sim.e;
      const seen = shownNow(p);   // 他还在路上（上回聊完正走开）：从当下的位置走过来，不瞬移（10-07 检查报“冲刺”）
      const at = p.root.position.clone();
      { const s = space.snap(elder.root.position.clone().add(new THREE.Vector3(Math.sin(elder.root.rotation.y), 0, Math.cos(elder.root.rotation.y)).multiplyScalar(-0.9))); p.root.position.set(s.x, 0, s.z); }   // 地基（10-05）：站在他身后一点的人行道上（原来在路中线旁；站前面他聊完往前走会撞上）
      // 聊完沿路走开：往一个不挡他去路的方向，走到下一个路口
      const away = graph.adj[e.node].find(n => n !== e.next && n !== e.prev) ?? graph.adj[e.node][0];
      const spot = p.root.position.clone();
      if (seen && at.distanceTo(spot) > 0.3) { p.root.position.copy(at); h.state = { phase: 'out', out: roadPath(at, spot), back: roadPath(spot, graph.pos[away]), t: 0, wait: -1.5 }; }
      else { h.state = { phase: 'wave', out: [], back: roadPath(p.root.position, graph.pos[away]), t: -1.5 }; appear(p); }   // 迎面碰上：在他身后淡入（presence）
      fx.ring(p.root.position.clone(), 0x3f8f7a);
      helperLine('acq', kind === 'guide' ? 'sun.guide' : 'sun.chat', {}, 3);
    },
    greet: (id, node) => startNeighborHelp(id, node, true),
    escort: (on) => { if (on && !shownNow(companion)) { if (!companion.root.visible) placeBehind(companion, 1.5); appear(companion); } else if (!on) vanish(companion); },   // 你赶到、你先回去：淡入淡出（presence）
    phone: (on) => { },
    rain: (on) => { rain.visible = on; setRain(on); },
    timeJump: (min) => showTimeJump(min),
    fogFlash: (node) => mistFlash(node),   // 在雾里拐错了：那团雾鼓一下，看得出“雾浓的地方真会走错”
    mapChanged: (node) => { updateMistTargets(); mistPuff(node); fx.ring(graph.pos[node].clone(), 0x3f8f7a); if (!run.helpedOnce.learn) { run.helpedOnce.learn = true; hint(NARR.learn, 7); } },   // 他的地图：认出路的路口雾散开（第一次说明一句）
    happy: () => {
      cheer(3);
      if (sim.e.goal?.task === 'match') {
        cam.follow = false; focusOn(town.placeObjs.center.position); zoomTo(38);
        for (let k = 0; k < 5; k++) later(k * 0.45, () => { fx.sparkle(sim.e.pos.clone().add(new THREE.Vector3((sparkRnd() - 0.5) * 6, 0, (sparkRnd() - 0.5) * 6)), [0xffd166, 0xe4774f, 0x4a7fc1, 0x3f8f7a][k % 4]); sfx('good'); });
        later(5, () => { cam.follow = true; zoomTo(window.innerWidth > 760 ? 52 : 70); });
      }
    },
    leaveHome: () => { },
    enterHome: () => { },
    end: (score) => { eveningScene(score); },
    arrive: (node) => { const at = MEM_AT[sim.dayIdx]; if (at?.landmark && node === nid(...OLD_LANDMARKS.find(l => l.id === at.landmark).node)) tellMemory(); },   // 走到老地标所在的路口才当场讲（10-14 用户：原来离它一个路口内就讲，第 1 天他在家门口、小学路口讲起榕树，身边根本没有榕树）；没路过就晚上在家讲
    goalDone: (g) => { const at = MEM_AT[sim.dayIdx]; if (at?.task && at.task === g.task && g.task !== 'pick' && sim.phase === 'live') tellMemory(); },   // 接孙女的往事等两人见面再讲
  });
}
function persistUnlocked(type) { return DAYS.slice(0, sim.dayIdx + 1).some(d => d.unlock.includes(type)); }
// ---------- 小任务记录（只记完成方式，不计分） ----------
function recordTask(key, status, detail = '') {
  save.tasks ||= {};
  const R = { self: 3, hint: 2, miss: 1 }, old = save.tasks[key];   // 「记忆」页留最好的一次（09-27：通关后重玩没做好，不把完成表改差）
  if (old && (R[old.status] || 0) > (R[status] || 0)) return;
  save.tasks[key] = { status, detail, day: sim.dayIdx + 1 };
  writeSave();
}
// ---------- 邻居帮忙动画 ----------
function startNeighborHelp(id, node, greetOnly = false) {
  const h = helperPeople[id], door = neighborDoor(id);
  if (!door) return;
  const from = h.person.root.visible ? h.person.root.position.clone() : door;   // 从自家门口出来；已经在路上（刚帮完正往回走）就从当下的位置走过去，不瞬移（10-06）
  if (!h.person.root.visible) { h.person.root.position.copy(from); atDoor(h.person, true); }   // 从自家门里出来（presence）
  const p = graph.pos[node], to = new THREE.Vector3(p.x + 1.4, 0, p.z + 1.4);
  const out = stopShort(roadPath(from, to), elder.root.visible ? elder.root.position : null, 1.1);   // 到那个路口离他最近的人行道角上；他站在那儿就停在一步开外（10-13）
  h.state = { phase: 'out', out, back: roadPath(out[out.length - 1], door), t: 0 };   // 沿人行网过去、从实际走到的地方回家（原来从路口中心的偏移点回，那里不在人行道上）
  sfx('hello');
  const nb = NEIGHBORS.find(n => n.id === id);
  if (greetOnly) { helperLine(id, 'nb.greet.' + id, {}, 2.5); return; }
  // 指路：看他是出门、回家，还是走岔了
  const e = sim.e, back = e?.leg === 'back', lost = e?.lost || e?.drift;
  helperLine(id, (lost ? 'nb.lost.' : 'nb.greet.') + id, {}, 2);   // 各人各自的说话风格；平时问候按时段、不重复
  later(1.5, () => helperLine(id, 'nb.way', { target: back ? '家' : sim.targetName() }, 2.5));
}
