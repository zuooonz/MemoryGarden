// 流程：标题、手册、记忆页、一天的开始（startDay）、场景声、往事、傍晚、结算、一周结局。依赖由 main.js 通过 initFlow 注入。
import { icon } from './icons.js';
import { place, sceneCut } from './presence.js';
import { playOpening, openingSeen, resetOpeningSeen } from './opening.js';
import { NARR, narrFavor } from './narr.js';
import { LINES } from './lines.js';
import * as THREE from 'three';
import { DAYS, FAVORS, SUPPORTS, SUPPORT_SHORT, PLACES, OLD_LANDMARKS, nid, pickMemory, memoryById } from './data.js';
import { thing } from './pictos.js';
import { disposeTree, fmt, seedContent } from './util.js';
import { AUTO_STAR } from './sim.js';
import { initAudio, sfx, stopVoice, voiceBusy, voiceKey, hasVoice, setRain, sceneSound, narrate, voice } from './audio.js';
import { save, settings, writeSave, resetSave, persistToJSON } from './store.js';
import { cam, focusOn, zoomTo } from './camera.js';
import { clearMap } from './mapops.js';
import { autoFoldGp, barkCount, coachOn, coachStep, hideHint, hint, logEntries, renderCards, renderGoals, renderLog, showBubble, updateHomeTag, updateMeters, resetHints, clearSpeech } from './ui.js';
import { $, persist, run, ui, on, sim, story, later, clearLater, camera, controls } from './core.js';
import { ACH, achBadge, achHtml, evalAchievements, weekUsage, familiarCount } from './achieve.js';
import { closeModal, gameView, modal, setWatch, showMoment, titleView, wake } from './stage.js';
import { cars, companion, crowd, crowdSpot, elder, graph, helperPeople, kid, planNeighborActs, rain, space, town, walkers, elderVoicePos, signObjs, addSignMesh } from './world.js';
import { homeG, homeNav, homeWorld, renderHomeProps, setHomeAction, insideHome, visitNav } from './home.js';
import { clearRoutes, renderBarriers, renderCinema, renderRoutes, riskTags, routeGroup, mists } from './routes.js';

import { setSpeed } from './hud.js';
import { showSettings } from './settings-ui.js';
import { showHandbook, showReminder } from './pages.js';
import { setKidPending } from './actors.js';
;

export function initFlow() {
  on('tellMemory', () => tellMemory());   // 接孙女：孙女跑出来后讲往事（每帧人物发来）
  on('toMenu', () => toMenu());   // 一天中途从设置里回主菜单（设置页在下层，用事件通知）

}
// ---------- 流程 ----------
export function showTitle() {
  const reached = Math.min(save.day, DAYS.length - 1);
  const totalStars = save.best.reduce((a, b) => a + (b?.stars || 0), 0);
  const days = DAYS.map((d, i) => {
    const b = save.best[i];
    const open = i <= reached;
    return `<button class="daybtn" data-i="${i}" ${open ? '' : 'disabled'}><b>${i + 1}</b><span>${d.title.split('·')[1] || ''}</span><i>${open ? '★'.repeat(b?.stars || 0) + '☆'.repeat(3 - (b?.stars || 0)) : '未解锁'}</i></button>`;
  }).join('');
  titleView();
  modal(`
    <button class="ghost" id="bSet" title="设置">${icon('gear', 18, 2)}</button><h1>爷爷的一周</h1>
    <p class="sub tagline">买菜、下棋、接孙女，他想自己来</p>
    <p>爷爷在这个小镇住了四十年。最近，他常常记不住刚发生的事：早上吃没吃药、要买什么菜、新修的路怎么走。</p>
    <p>可他还想自己出门、自己买菜、自己去下棋。你是他身边的人：家人、老伴、老街坊都行。这一周，请你帮这个小镇变得<b>更好认、更好记</b>，在他犹豫的时候，给<b>刚刚好</b>的帮助。</p>
    ${!(save.day > 0 || save.best.length) && openingSeen() ? '<p class="sub"><button class="linkbtn" id="bOpen" style="padding-left:0">开场动画</button></p>' : ''}
    ${save.day > 0 || save.best.length ? `<p class="sub">选择一天（已获得 ${totalStars} / ${DAYS.length * 3} 颗星）${openingSeen() ? '<button class="linkbtn" id="bOpen">开场动画</button>' : ''}</p><div class="days">${days}</div>` : ''}
    <div class="row">
      <button class="ghost" id="bBook">手册</button>
      <button class="ghost" id="bRemind">记忆</button>
      ${save.day > 0 ? `<button class="ghost" id="bNew">重置</button><button class="primary" id="bGo">继续</button>` : `<button class="primary" id="bGo">开始</button>`}
    </div>`, 'title');
  const go = () => startDay(reached, reached === save.day ? save.persist : save.snap?.[reached]);
  $('#bGo').onclick = () => { initAudio(); sfx('click'); if (!openingSeen() && save.day === 0 && !save.best.length) playOpening(go); else go(); };   // 第一次开始：先看开场（点了按钮才能出声）
  $('#bOpen')?.addEventListener('click', () => { initAudio(); sfx('click'); playOpening(showTitle); });
  document.querySelectorAll('.daybtn').forEach(b => b.onclick = () => { initAudio(); sfx('click'); const i = +b.dataset.i; startDay(i, i === save.day ? save.persist : save.snap?.[i]); });
  $('#bBook').onclick = () => { initAudio(); sfx('click'); showHandbook(showTitle); };
  $('#bSet').onclick = () => { initAudio(); sfx('click'); showSettings(showTitle); };
  $('#bRemind').onclick = () => { initAudio(); sfx('click'); openReminder(showTitle); };
  if (save.day > 0) $('#bNew').onclick = () => { initAudio(); sfx('click'); confirmReset(); };
}

// 重置：先说清楚会清空什么，再确认（默认按钮是“不重置”）
function confirmReset() {
  modal(`<h2>重置进度？</h2>
    <p>会清空全部进度：每一天的星星、成就、小任务记录，从第 1 天重新玩。</p>
    <div class="row"><button class="ghost" id="bResetOk">重置</button><button class="primary" id="bResetNo">不重置</button></div>`);
  $('#bResetNo').onclick = () => { sfx('click'); showTitle(); };
  $('#bResetOk').onclick = () => { sfx('click'); resetSave(); writeSave(); resetOpeningSeen(); showTitle(); };   // 重置＝从头来过：下次点「开始」再放一遍开场
}

// 一周的弧线（第 4 项，09-27，措辞暂定）：结局开头用他的口吻回应你这一周具体做过的两三件事——他记得
const NB_CALL = { wang: '王大姐', li: '刘师傅', zhao: '老赵', chen: '陈老板' };
function weekEcho(persist) {   // persist：结局那一刻的小镇（重看结局时用通关时存下的）
  const lines = [];
  if (persist.signs.size) {   // 路口叫法：地点或老地标本身、或它旁边的路口（不依赖当天数据）
    const n = [...persist.signs][0], named = [...Object.values(PLACES), ...OLD_LANDMARKS].map(p => [p.name, nid(...p.node)]);
    const hit = named.find(([, id]) => id === n) || named.find(([, id]) => graph.dist[n][id] <= 1);
    lines.push(`${hit ? (hit[1] === n ? hit[0] : hit[0] + '旁边') + '那个路口' : '路口'}的牌子，我现在每次路过都看一眼。`);
  }
  const nb = [...persist.neighbors][0]; if (nb && NB_CALL[nb]) lines.push(`${NB_CALL[nb]}见了我就打招呼，走到那儿心里就踏实。`);
  if (persist.home.has('pact')) lines.push('那个要钱的电话，我先挂了，问了家里。');
  else if (persist.home.has('photo')) lines.push('墙上那张老照片，我天天看一眼。');
  const selfDays = save.best.filter(b => b && b.auto >= AUTO_STAR).length;
  if (selfDays >= 4) lines.push(`这一周，好多事是我自己办成的。`);
  else if (lines.length < 2) lines.push('这一周，有你在，我没那么慌。');
  return `<div class="wk-echo"><h3 class="sm-h">他记得的事</h3>${lines.slice(0, 3).map(l => `<p class="echo">“${l}”</p>`).join('')}</div>`;
}
function weekHtml() {
  const days = save.best.map((b, i) => b && b.mood != null ? { i, ...b } : null).filter(Boolean);
  if (!days.length) return '';
  const avg = (k) => days.reduce((a, d) => a + (d[k] || 0), 0) / days.length;
  const aMood = avg('mood'), aAuto = avg('auto'), aDone = avg('done');
  const W = 280, H = 70, x = (i) => 14 + i * (W - 28) / 6, y = (v) => H - 8 - Math.max(0, v - 30) / 70 * (H - 16);   // 纵轴从 30 起，线能展开
  const line = (k, c) => `<polyline points="${days.map(d => `${x(d.i)},${y(d[k])}`).join(' ')}" fill="none" stroke="${c}" stroke-width="2.5"/>` + days.map(d => `<circle cx="${x(d.i)}" cy="${y(d[k])}" r="3.5" fill="${c}"/>`).join('');
  const chart = `<svg viewBox="0 0 ${W} ${H + 14}" class="wk-chart">${[0, 1, 2, 3, 4, 5, 6].map(i => `<text x="${x(i)}" y="${H + 12}" text-anchor="middle">${DAYS[i].weekday.replace('星期', '周')}</text>`).join('')}${line('auto', '#4a7fc1')}${line('mood', '#3f8f7a')}</svg>`;
  const tot = {}; days.forEach(d => Object.entries(d.helps || {}).forEach(([k, n]) => tot[k] = (tot[k] || 0) + n));
  const text = aAuto >= AUTO_STAR && aMood >= 65 ? '这一周，大多数事都是他自己办成的，日子也过得舒心。他还是会在路口停下来，还是会忘记刚刚的事。可这个小镇认得他，他也认得这个小镇。'
    : aDone >= 70 && aAuto < 50 ? '这一周的事大都办成了，可不少是你替他办的。帮忙的时候多等一等、轻轻提示，他会更有“自己来”的劲头。'
    : aMood < 55 ? '这一周他过得有点累：迷路、着急的时候多了些。多拜托几位邻居、放一首老歌，也许能让他轻松一点。'
    : '爷爷还是会在路口停下来，还是会忘记刚刚的事。但这个小镇，对他来说好认了一些，也多了几个会跟他打招呼的人。';
  return `<h3 class="sm-h">这一周你是怎么帮的</h3><p>${text}</p>
    <div class="wk-box"><div class="wk-leg"><span style="color:#3f8f7a">● 心情 平均 ${Math.round(aMood)}</span><span style="color:#4a7fc1">● 他自己办的 平均 ${Math.round(aAuto)}%</span><span>都办成了 平均 ${Math.round(aDone)}%</span></div>${chart}</div>
    <details class="fold"><summary>每种帮法用了几次</summary>${helpHtml(tot).replace('<h3 class="sm-h">你是怎么帮的</h3>', '')}</details>`;
}
const persistFrom = (j) => ({ signs: new Set(j?.signs || []), photos: new Set(j?.photos || []), home: new Set(j?.home || []), neighbors: new Set(j?.neighbors || []) });
// 「记忆」：通关后多一个「一周总结」按钮（和第 7 天结算页的按钮同名），再看一周的结局（看完「返回」回到「记忆」）
function openReminder(back, backLabel) {
  showReminder(back, backLabel, save.finished && save.endPersist ? { label: '一周总结', go: () => showEnding(() => openReminder(back, backLabel)) } : null);
}
// back：从「记忆」重看时传入——用通关那一刻存下的小镇（路标、邻居……），底部只有「返回」
export function showEnding(back = null) {
  if (!back) sfx('end');
  const P = back ? persistFrom(save.endPersist) : persist, known = back ? save.endKnown ?? 0 : familiarCount().n;
  const totalStars = save.best.reduce((a, b) => a + (b?.stars || 0), 0);
  const mem = DAYS.map((d, i) => { const b = save.best[i]; if (!b) return ''; const m = memoryById(i, b.mem); return `<div class="memory">${m.memory}${hasVoice(m.id) ? `<button class="vbtn" data-v="${m.id}">▶ 听他说</button>` : ''}</div>`; }).join('');   // 显示那天实际讲的那段
  const n = P.signs.size + P.photos.size + P.home.size + P.neighbors.size;
  const wu = Object.entries(weekUsage()).filter(([k]) => SUPPORTS[k]).sort((a, b) => b[1] - a[1]);
  const best = wu[0];
  const usedHtml = wu.length ? `<div class="wk-used">${wu.map(([k, c]) => `<span class="${k === best[0] ? 'top' : ''}">${thing(k, 30)}<b>${SUPPORT_SHORT[k]}</b><i>${c} 次</i></span>`).join('')}</div>
    <p>最管用的是<b>${SUPPORTS[best[0]].name}</b>，帮了他 ${best[1]} 次。${best[0] === 'neighbor' ? '小镇里多了几双看着他的眼睛。' : best[0] === 'sign' ? '清楚的标识，让陌生的路口也能认。' : '把要记的事放在看得见的地方，他就能自己来。'}</p>` : '';
  // 顺序（09-27 重排）：先感受、后数字——他记得的事 → 这一周的小镇（放了什么、哪样最管用）→ 你是怎么帮的（评语、曲线，次数折叠）→ 成就 → 往事
  modal(`
    <h2>一周总结</h2>
    <p class="sub">星期二到星期一，获得 <b>${totalStars}</b> / ${DAYS.length * 3} 颗星</p>
    ${weekEcho(P)}
    <h3 class="sm-h">这一周的小镇</h3>
    <p>你在小镇里放下了 <b>${n}</b> 处道具，拜托了 <b>${P.neighbors.size}</b> 位邻居。现在，他认得的路口有 <b>${known}</b> 个。</p>
    ${usedHtml}
    ${weekHtml()}
    ${achHtml()}
    ${mem ? `<h3 class="sm-h">他讲给你听的往事</h3>${mem}` : '<p class="sub">多拿几颗星，就能听到他讲的往事。</p>'}
    <div class="memo">这是一个游戏原型，不是诊断或训练工具。游戏里的规则是对真实处境的简化；如果你身边有人出现类似变化，请寻求专业医生的评估与建议。</div>
    <div class="row">${back ? '<button class="primary" id="bBackEnd">返回</button>' : '<button class="ghost" id="bTitle">主菜单</button><button class="primary" id="bRem2">记忆</button>'}</div>`);
  if (back) { $('#bBackEnd').onclick = () => { sfx('click'); back(); }; return; }
  $('#bTitle').onclick = () => { sfx('click'); toMenu(); };
  $('#bRem2').onclick = () => { sfx('click'); openReminder(toMenu, '主菜单'); };
}

// 切换天或进入结算时，关掉所有进行中的面板
function closeAllPanels() {
  clearMap(); clearSpeech();
  const g = $('#game'); g.classList.add('hidden'); g.innerHTML = '';
  showMoment(null);
  document.body.classList.remove('in-map', 'in-moment');
  hideHint(); setWatch(false); wake();
}
function startDay(idx, persistJson) {
  closeAllPanels(); gameView();
  idx = Math.min(idx, DAYS.length - 1);
  applyPersist(persistJson);
  run.dayStartPersist = persistToJSON(persist);
  sim.startDay(idx, (save.best[idx]?.tries || 0) + 1);
  seedContent(1000 + idx * 97 + (save.best[idx]?.tries || 0));   // 关卡内容的随机数：按第几天、第几次玩
  planNeighborActs(idx, save.best[idx]?.tries || 0);
  abortMemory(); memTold = false; clearLater(); for (const k in barkCount) delete barkCount[k];
  renderCinema(); renderBarriers(); updateHomeTag(); renderHomeProps();
  homeNav.key = null; homeNav.queue = []; homeNav.exiting = false; setHomeAction(null);
  visitNav.key = null; visitNav.queue = []; visitNav.leaving = false; run.hiking = false;   // 上一局中途回主菜单时他可能正在店里、正在健步走：不清的话，重玩时他出门先往旧地点走、路人队伍一路跟着，时钟为等画面停住（10-15 检查）
  elder.root.position.copy(homeWorld('table'));
  resetHints({ hesitate: false, changed: false, moment: !!save.best[0] });
  showMoment(null); kid.root.visible = false; setKidPending(false);
  rain.visible = false; setRain(false);
  elder.root.visible = true;
  elder.root.position.copy(sim.e.pos);
  companion.root.visible = false;
  for (const h of Object.values(helperPeople)) { h.person.root.visible = false; h.state = null; }
  crowd.forEach((p, i) => p.root.position.copy(crowdSpot(i)));
  walkers.reset(); cars.reset((a, b) => !!sim.blocked?.has(a < b ? `${a}-${b}` : `${b}-${a}`));   // 地基：路人、车每天重新摆，前一天的样子不带过来（用户 09-29）
  $('#feed').innerHTML = '';
  setSpeed(1);
  const d = DAYS[idx];
  const unlocks = d.unlock.map(t => `<div class="memo"><b>${SUPPORTS[t].name}</b>（精力 ${SUPPORTS[t].cost}）　${SUPPORTS[t].tip}</div>`).join('');
  modal(`
    <h2>${d.title}</h2>
    <p>${d.intro}</p>
    <p class="sub">${d.weekday}　·　今天的精力：${d.energy}　·　${d.weather === 'rain' ? '有雨' : '晴'}</p>
    ${CARRY_IN[sim.carryIn] ? `<div class="memo${sim.carryIn === 'spirit' ? ' warm' : ''}">${CARRY_IN[sim.carryIn]}</div>` : ''}
    ${d.fade ? `<div class="memo"><b>他的变化</b>　${d.fadeNote}那里起了薄雾，放路标也只能淡一些。</div>` : ''}
    ${FAVORS[idx] ? `<div class="memo warm"><b>${FAVORS[idx].name}托他</b>　顺路带${FAVORS[idx].item}。他答应了，出门在外，可别忘了。</div>` : ''}
    ${unlocks ? `<p class="sub">新道具：</p>${unlocks}` : ''}
    <div class="row"><button class="primary" id="bPlan">开始布置</button></div>`);
  if (settings.narr) { const id = voiceKey('narr|intro' + idx); if (id) setTimeout(() => { voice('narr', id); if (FAVORS[idx]) narrate(narrFavor(FAVORS[idx]), { keep: true }); }, 400); }   // 简介之后接着念邻居托的事
  $('#bPlan').onclick = () => { sfx('click'); closeModal(); plan(); };
  const plan = () => {
    ['#hudR', '#gp', '#dock'].forEach(s => $(s).classList.remove('hidden')); autoFoldGp();
    $('#dock').classList.remove('live', 'open'); document.body.classList.remove('live-ui'); document.body.classList.add('dock-open');
    logEntries.length = 0; renderLog();
    $('#actions').classList.add('hidden');
    $('#startBtn').classList.remove('hidden');
    renderGoals(); renderCards(); updateHomeTag(); updateMeters(); renderRoutes();
    // 早上闲聊：他先念叨今天的菜单（学习），之后你布置小镇、他出门办事，隔一段时间再到菜摊回忆
    if (coachOn()) coachStep('card', NARR.firstCard, ['#cards .card:not(:disabled)']);
    else hint(NARR.plan, 8);
    if (!cam.fly) { focusOn(window.innerWidth > 760 ? new THREE.Vector3(0, 0, 2) : new THREE.Vector3(-8, 0, 6)); zoomTo(window.innerWidth > 760 ? 100 : 125); }
  };
}

// 你是怎么帮的：帮助从少到多
function helpHtml(h) {
  const items = [['wait', '等一等', 'self'], ['cue', '提示', 'self'], ['tell', '直接告诉', 'you'], ['walk', '陪同', 'you'], ['neighbor', '邻居', 'town'], ['passerby', '街坊路人', 'town']].filter(([k]) => h[k]);
  if (!items.length && !h.call) return '<h3 class="sm-h">你是怎么帮的</h3><p class="sub">今天没有需要帮忙的时刻。</p>';
  const soft = (h.wait || 0) + (h.cue || 0) + (h.callSelf || 0), hard = (h.tellEarly || 0) + (h.walkEarly || 0);
  const word = hard === 0 ? '你给的帮助刚刚好：先等、再提示，他都是自己想起来、自己走到的。'
    : hard > soft ? '直接告诉和陪同多了一些：事办成了，但他少了“自己来”的机会。下次可以先等一等、轻轻提示。'
    : '大多数时候你先等、再提示，只在必要时直接帮了一把。';
  const notes = [
    h.call && `电话 ${h.call} 次${h.callSelf ? `，其中 ${h.callSelf} 次他听你一问，自己认出了路` : ''}。`,
    h.walk && `陪同 ${h.walk} 次：${[h.walkTimely && `${h.walkTimely} 次在他慌了的时候，正是时候`, h.walkEarly && `${h.walkEarly} 次他其实能自己走`].filter(Boolean).join('；')}。`,
    h.tell && `直接告诉 ${h.tell} 次：${[h.tellTimely && `${h.tellTimely} 次是等过、提示过之后`, h.tellEarly && `${h.tellEarly} 次一上来就说了`].filter(Boolean).join('；')}。`,
  ].filter(Boolean);
  return `<h3 class="sm-h">你是怎么帮的</h3><div class="hp-row">${items.map(([k, n,
    c]) => `<span class="hp ${c}"><b>${h[k]}</b>${n}</span>`).join('')}${h.call ? `<span class="hp self"><b>${h.call}</b>电话</span>` : ''}</div><p class="sub">${word}</p>${notes.length ? `<p class="sub">${notes.join('<br>')}</p>` : ''}`;
}
// 他的心情：按七类来源记账
export const MOOD_CAT = { fun: '做喜欢的事', self: '自己做到', support: '道具帮上忙', nb: '邻居招呼', you: '你的电话和陪伴', needed: '被人需要', worry: '着急迷路', donefor: '被替他做', fail: '没办成' };   // 09-28：原来“熟人招呼”一类混了邻居、你、被人需要三件事
function moodHtml(score) {
  const rows = Object.entries(score.moodLog || {}).filter(([, v]) => Math.abs(v) >= 0.5).sort((a, b) => b[1] - a[1]);
  const max = Math.max(10, ...rows.map(([, v]) => Math.abs(v)));
  return `<h3 class="sm-h">他的心情：60 → ${Math.round(score.mood)}</h3><div class="md-bars">${rows.map(([k,
    v]) => `<div class="md-row"><span>${MOOD_CAT[k] || k}</span><i class="${v > 0 ? 'pos' : 'neg'}" style="width:${Math.round(Math.abs(v) / max * 100)}%"></i><b>${v > 0 ? '+' : '−'}${Math.round(Math.abs(v))}</b></div>`).join('') || '<p class="sub">平平稳稳的一天。</p>'}</div>`;
}
// 场景声：下棋时棋子落盘、棋友逗乐、他回一句；放老电影时银幕那边的老片对白和观众掌声
let sceneT = 0, sceneN = 0;
const FRIEND = LINES['bg.friend'].say, FILM = LINES['bg.film'].say, MINE = LINES['bg.elderChess'].say;   // 背景里的话：台词表
export function sceneAudio(dt) {
  const e = sim.e; if (sim.phase !== 'live' || !e || e.mode !== 'task' || run.speed === 0) { sceneT = 0; return; }
  const task = e.goal?.task; if (!['chess', 'match', 'movie'].includes(task)) return;
  sceneT -= dt; if (sceneT > 0) return;
  const pos = (task === 'chess' ? town.placeObjs.park : town.placeObjs.center).position.clone().setY(1.2);
  sceneN++;
  if (task === 'movie') {
    sceneT = 9 + Math.random() * 5;
    const scr = pos.clone().add(new THREE.Vector3(0, 3, -4));
    if (sceneN % 3 === 0) sceneSound('clap', pos);
    else if (settings.voice && !voiceBusy() && run.effSpeed <= 2.2) { const id = voiceKey('film|' + FILM[sceneN % FILM.length]); if (id) voice('chat', id, { pos: scr, duck: false }); }
  } else {
    sceneT = (2.5 + Math.random() * 3) * (run.effSpeed > 2.2 ? 2 : 1);   // 倍速时落子声稀一些
    sceneSound('clack', pos);
    if (sceneN % 4 === 0 && settings.voice && !voiceBusy() && run.effSpeed <= 2.2) {
      const mine = sceneN % 8 === 0, t = mine ? MINE[sceneN % 16 === 0 ? 1 : 0] : FRIEND[(sceneN / 4) % FRIEND.length | 0];
      const id = voiceKey(mine ? t : 'friend|' + t); if (id) voice('chat', id, { pos: mine ? elderVoicePos : pos, duck: false });
    }
  }
}
// 他说话时，声音从头顶的位置发出
// 往事在哪说：和往事里的地方、事情对得上（榕树下、小学门口、电影开场、包完饺子……）
export const MEM_AT = { 0: { landmark: 'banyan', lead: '晚饭后，他说起街口那棵老榕树：' }, 1: { home: true }, 2: { task: 'pick', lead: '晚上看着孙女的小书包，他说起从前在小学门口等闺女：' }, 3: { task: 'movie', lead: '晚上说起那部老电影，他笑了：', leadMiss: '电影没赶上，晚上他又说起那部老电影：' }, 4: { task: 'cook' }, 5: { task: 'scam' }, 6: { task: 'match' } };
let memTold = false;
// 白天讲到一半回主菜单（第一下点画面后界面回来，就能从设置回主菜单）：收掉这段往事的点击监听和计时，不然重玩时第一下点按会把它“讲完”——镜头突然拉近、多记一条 memoryEnd（10-15 检查）
let memAbort = null;
function abortMemory() { memAbort?.(); memAbort = null; }
// 当场讲：时间停下，镜头推近，声音从他那里来，头顶字幕；讲完接着过
export function tellMemory() {
  if (memTold || sim.phase !== 'live' || sim.moment) return;
  if (elder.root.visible && space.onRoad(elder.root.position)) { later(0.5, tellMemory); return; }   // 他正在过马路：等走到路边再讲（讲往事时钟停住，原来他会停在路中间、车都堵着——10-06 随机帮法检查报出）
  memTold = true;
  const pm = pickMemory(sim.dayIdx, sim.goals), id = pm.id, text = pm.memory.replace(/[“”]/g, '');   // 往事与当天结果对得上（data.pickMemory）
  sim.event('memory'); story.holds.add('memory'); document.body.classList.add('evening');   // 剧情停顿：时钟停，声音照常（不能用 setSpeed(0)，那是玩家暂停，会把声音也挂起）
  cam.follow = true; zoomTo(window.innerWidth > 760 ? 30 : 42);
  // 讲的时候界面收起；点一下把界面放回来，再点一下跳过（和晚上讲往事一样可以跳）
  let done = false, cancel = null, taps = 0;
  const finish = () => {
    if (done) return; done = true; memAbort = null; cancel?.(); stopVoice('memory'); sim.event('memoryEnd', { skipped: taps >= 2 });
    ui.bubbleT = 0; document.body.classList.remove('evening'); removeEventListener('pointerdown', tap, true);
    story.holds.delete('memory'); zoomTo(window.innerWidth > 760 ? 52 : 70);
  };
  const tap = (ev) => { if (ev?.target?.closest?.('#hudR, #modal')) return; if (++taps >= 2) finish(); else document.body.classList.remove('evening'); };   // 点暂停／继续、倍速、菜单、设置手册里的按钮不算点画面（10-13：原来按暂停再按继续＝点了两下，往事被跳过、剧情接着走）
  addEventListener('pointerdown', tap, true);
  memAbort = () => { if (done) return; done = true; cancel?.(); removeEventListener('pointerdown', tap, true); document.body.classList.remove('evening'); story.holds.delete('memory'); };
  later(0.9, async () => {
    if (done) return;
    showBubble(text, 'list memo', 30);
    const dur = (settings.voice && hasVoice(id)) ? await voice('main', id, { pos: elderVoicePos, tag: 'memory' }) : 0;   // 往事是主戏：停掉别的声音，气泡和声音同时开始
    if (!done) cancel = later((dur || Math.max(5, text.length * 0.22)) + 1.2, finish);
  });
}
// 一天的结尾：镜头推到家里，灯亮着，他坐着讲这段往事（有配音就讲出来，字幕在头顶），讲完再出结算；点一下可跳过
export let eveningOn = false;
export function eveningScene(score) {
  const pm = pickMemory(sim.dayIdx, sim.goals), id = pm.id, at = MEM_AT[sim.dayIdx] || {};
  const missed = at.task && sim.goals.some(g => g.task === at.task && g.status !== 'done');   // 往事所在的那件事没办成：换一句开场白
  if (memTold) { setTimeout(() => showSummary(score), 900); return; }   // 白天已经在当场讲过了
  memTold = true;
  closeAllPanels(); eveningOn = true; document.body.classList.add('evening');
  // 晚上在家讲往事（10-13 用户：取快递那天回家读故事，又是雨又是雾，什么都看不清）：
  // 镜头从屋前高处往下看进屋里（原来沿用白天的方向和低角度，被街上的房子挡住）；他在家，“他心里的地图”这时不用，雾片收起（第二天照常）；雨天的空气雾在 main.js 按 eveningOn 退远
  mists.forEach(m => { if (m) m.userData.target = 0; });
  // 镜头回到家里：他已经在家，就从当下飞过去；一天收尾时他人还在外面（天黑被接回、时间到了），就整屏暗一下换场——暗着的时候把他放到桌边、镜头直接摆好
  // （10-14 用户：原来镜头开始飞的那一刻他就从街上消失，是瞬移；统一走 presence.sceneCut，见 presence.js）
  { const d = window.innerWidth > 760 ? 26 : 38, to = homeG.position.clone(), toPos = to.clone().add(new THREE.Vector3(0.28, 0.78, 0.56).normalize().multiplyScalar(d));
    cam.pan = null; cam.zoom = null; cam.follow = false;
    if (insideHome(elder.root.position)) cam.fly = { t: 0, fromTgt: controls.target.clone(), toTgt: to, fromPos: camera.position.clone(), toPos };
    else sceneCut(() => {
      visitNav.key = null; visitNav.queue = []; visitNav.leaving = false; homeNav.key = null; homeNav.queue = []; homeNav.exiting = false;
      place(elder, homeWorld('chair')); elder.root.visible = true;
      for (const p of [companion, kid]) if (p.root.visible) { p.root.visible = false; place(p, p.root.position); }   // 跟着的人这一天就散了
      cam.fly = null; controls.target.copy(to); camera.position.copy(toPos); controls.maxPolarAngle = 1.15;
    }); }
  let done = false;
  const finish = () => { if (done) return; done = true; eveningOn = false; ui.bubbleT = 0; document.body.classList.remove('evening'); removeEventListener('pointerdown', skip, true); stopVoice(); showSummary(score); };
  const skip = (ev) => { if (!ev?.target?.closest?.('#hudR, #modal')) finish(); };   // 点顶栏（设置、菜单）不算跳过
  setTimeout(async () => {
    if (done) return;
    const text = pm.memory.replace(/[“”]/g, '');
    showBubble(((missed && at.leadMiss) || at.lead || '') + text, 'list memo', 30);
    const dur = (settings.voice && hasVoice(id)) ? await voice('main', id, { pos: elderVoicePos, tag: 'memory' }) : 0;   // 晚上讲往事：主戏（原来没标签，会被当成闲话打断）
    setTimeout(finish, (dur || Math.max(5, text.length * 0.22)) * 1000 + 1500);
    addEventListener('pointerdown', skip, true);
  }, 1400);
}
// 他的日子（后果跨天）：今天开头说昨天留下了什么，结算时说明天会怎样
const CARRY_IN = {
  worry: '<b>家里不放心</b>　昨天出了点事。今天每趟出门，都由你陪着他去（这些事就不算他自己办的）。',
  lean: '<b>他想让你陪</b>　昨天帮得有点多。今天第一趟出门，他说想让你陪着。',
  spirit: '<b>精神不错</b>　昨天的事都是他自己办成的，今天他心情更好。',
};
const WORRY_WHY = { gaveUp: '他找不着路，放弃回了家', strayed: '他慌了打电话没人管，最后是路人领的路', outLate: '天黑了他还迷着路', lostLong: '他在外面迷路转了很久', scam: '他差点被骗' };
const CARRY_OUT = {
  worry: (why) => `${WORRY_WHY[why] || '今天出了点事'}，家里不放心。明天每趟出门都要有人陪。`,
  lean: () => '今天帮得有点多（陪得早了，或一上来就告诉他）。明天第一趟，他说想让你陪着。',
  spirit: () => '今天的事都是他自己办成的，明天他精神更好。',
};
function showSummary(score) {
  closeAllPanels();
  sfx('end');
  const d = sim.day;
  const tries = (save.best[sim.dayIdx]?.tries || 0) + 1;
  const nStars = Object.values(score.stars).filter(Boolean).length;
  // 每天只留“最好的一次”（09-27 用户选 B）：星多的算好，星一样看办成＋他自己办的＋心情。一周总结的星、曲线、往事、帮法、成就用的每天记录都来自这一次，口径一致
  const rec = { stars: nStars, tries, mood: Math.round(score.mood), auto: score.autonomy, done: Math.round(score.doneRatio * 100), helps: { ...score.helps }, mem: pickMemory(sim.dayIdx, sim.goals).id };   // mem：这天实际讲的那段往事（结局页按它显示）
  const old = save.best[sim.dayIdx], rank = (r) => r.stars * 1000 + (r.done || 0) + (r.auto || 0) + (r.mood || 0);
  const isBest = !old || old.mood == null || rank(rec) >= rank(old);
  save.best[sim.dayIdx] = isBest ? rec : { ...old, tries };
  writeSave();
  let si = 0;
  const newAch = evalAchievements(score, isBest); writeSave();
  const star = (on, name, val, need) => `<div class="star ${on ? 'on pop' : ''}" style="animation-delay:${0.25 + (si++) * 0.35}s"><div class="s">★</div><b>${name}</b><small>${val}　（${need}）</small></div>`;
  const goalsHtml = score.goals.map(g => `<div class="goal ${g.status === 'done' ? 'done' : g.status === 'fail' ? 'fail' : ''}"><span>${g.label}${g.status === 'done' && !g.helped && !g.wrongPlace
    ? ' <em class="selfmark">他自己办的</em>' : g.status === 'done' && g.halfSelf && !g.wrongPlace ? ' <em class="selfmark half">你及时帮了一把</em>' : ''}${g.used ? `<br><small class="gused">${Object.entries(g.used).map(([k,
    n]) => `<i>${thing(k, 18)}${n > 1 ? '×' + n : ''}</i>`).join('')} 帮上了忙</small>` : ''}</span><span class="st">${g.note || ''}</span></div>`).join('');
  const h = score.helps;
  const helpLine = [h.neighbor && `邻居打招呼 ${h.neighbor} 次`, h.wait && `等他自己想 ${h.wait} 次`, h.cue && `轻轻提示 ${h.cue} 次`, h.tell && `直接告诉 ${h.tell} 次`, h.walk && `陪同 ${h.walk} 次`, h.passerby && `他自己问路 ${h.passerby} 次`].filter(Boolean).join('　') || '全程没有需要帮忙的时刻';
  const unlockedMemory = true;
  const last = sim.dayIdx >= DAYS.length - 1;
  modal(`
    <h2>${d.title}</h2>
    <p class="sub">这一天过完了</p>
    <div class="stars">
      ${star(score.stars.done, '都办成了', Math.round(score.doneRatio * 100) + '%', '全部办成')}
      ${star(score.stars.auto, '他自己办的', score.autonomy + '%', '≥ 七成')}
      ${star(score.stars.mood, '心情', Math.round(score.mood), '≥65')}
    </div>
    ${goalsHtml}
    ${score.favor ? `<p class="sub">${score.favor.name}托的${score.favor.item}：${score.favor.got ? '带回去了，人家直夸他记性好' : score.favor.got === false ? '这回忘了。便签也能记下邻居托的事' : '今天没顺路'}</p>` : ''}
    ${!last && CARRY_OUT[persist.carry] ? `<div class="memo${persist.carry === 'spirit' ? ' warm' : ''}"><b>明天</b>　${CARRY_OUT[persist.carry](sim.carryWhy)}</div>` : ''}
    ${newAch.map(id => `<div class="ach">${achBadge(id, true, 30)}<span>新成就：<b>${ACH[id].name}</b>　<span class="sub">${ACH[id].desc}</span></span></div>`).join('')}
    <div class="memo"><b>现实中</b>　${d.tip}</div>
    <details class="fold"><summary>细看这一天：你怎么帮的、心情、时间线</summary>${helpHtml(score.helps)}${moodHtml(score)}<h3 class="sm-h">这一天发生了什么</h3><div class="timeline">${score.log.map(l => `${fmt(l.t)}　${l.msg}`).join('<br>')}</div></details>
    <div class="row">
      <button class="ghost" id="bMenu">主菜单</button><button class="ghost" id="bRetry">重玩</button>
      ${last ? `<button class="primary" id="bEnd">一周总结</button>` : `<button class="primary" id="bNext">下一天</button>`}
    </div>`);
  [0, 1, 2].forEach(i => { if (Object.values(score.stars)[i]) setTimeout(() => sfx('place'), 250 + i * 350); });
  $('#bRetry').onclick = () => { sfx('click'); startDay(sim.dayIdx, run.dayStartPersist); };
  $('#bMenu').onclick = () => { sfx('click'); advance(); toMenu(); };   // 这一天已经结算：先存档，再回主菜单
  const advance = () => {
    save.snap ||= [];
    // 每天的开头存档只在第一次打到这天（或主线往前推进）时记下；重玩只是试一试，不改写已打过的存档，前后始终一致
    if (!save.snap[sim.dayIdx] || sim.dayIdx >= save.day) save.snap[sim.dayIdx] = run.dayStartPersist;
    if (sim.dayIdx + 1 > save.day && sim.dayIdx + 1 < DAYS.length) { save.day = sim.dayIdx + 1; save.persist = persistToJSON(persist); }
    writeSave();
  };
  // 结算一出现就存档：此时刷新，会直接进入下一天
  advance(); if (last) { save.finished = true; if (isBest || !save.endPersist) { save.endPersist = persistToJSON(persist); save.endKnown = familiarCount().n; } writeSave(); }   // 第 7 天最好那一次结束时的小镇：从「记忆」重看一周总结时用
  if (last) $('#bEnd').onclick = () => { sfx('click'); advance(); save.finished = true; writeSave(); showEnding(); };
  else $('#bNext').onclick = () => { sfx('click'); advance(); const i = sim.dayIdx + 1; startDay(i, i === save.day ? save.persist : persistToJSON(persist)); };
  $('#actions').classList.add('hidden');
  clearRoutes();
}

// 读存档：恢复路标、家里的支持、拜托过的邻居
function applyPersist(j) {
  persist.signs = new Set(j?.signs || []); persist.photos = new Set(j?.photos || []); persist.home = new Set(j?.home || []); persist.neighbors = new Set(j?.neighbors || []); persist.leaked = !!j?.leaked; persist.carry = j?.carry || null;
  for (const o of signObjs.values()) disposeTree(o.g); signObjs.clear();
  for (const n of persist.signs) addSignMesh(n);
  if (persist.photos.size) { persist.home.add('photo'); persist.photos.clear(); }   // 旧存档：路口的照片牌改成挂在家里
  for (const o of signObjs.values()) { o.g.scale.setScalar(1); o.born = -1e9; }
  renderCinema();
}

// 回主菜单：收起这一天的界面、路线、雾、气泡和声音，再显示主菜单（结局页、结算页、一天中途从设置里都走这里）
export function toMenu() {
  stopVoice(); abortMemory(); story.holds?.clear?.();
  sim.leaveDay();
  for (const s of ['#gp', '#hudR', '#dock', '#actions', '#moment', '#game', '#mappanel', '#hint']) $(s)?.classList.add('hidden');
  clearMap(); hideHint();
  routeGroup.visible = false; for (const t of riskTags) t.remove(); riskTags.length = 0;
  mists.forEach(m => { if (m) m.userData.target = 0; });
  document.querySelectorAll('#bubbles > *').forEach(el => { el.style.display = 'none'; });
  setSpeed(1);
  showTitle();
}
