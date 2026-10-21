// 界面：头顶气泡与短句、消息条与记录、新手引导、左上爷爷块（心情、时间线）、顶部布局、道具卡与道具箱。依赖由 main.js 通过 initUi 注入。
import { DAYS, FAVORS, NEIGHBORS, SUPPORTS, SUPPORT_SHORT } from './data.js';
import { icon, GOAL_ICON } from './icons.js';
import { elderHead, thing } from './pictos.js';
import { clamp, fmt } from './util.js';
import { initAudio, sfx, voiceCls, voiceKey, narrate, voice, voiceWouldPlay } from './audio.js';
import { NARR, narrCard, narrPlaced } from './narr.js';
import { save, settings } from './store.js';
import { $, _np, run, persist, ui, bubblesEl, on, sim, logLine } from './core.js';
import { routeColor } from './routes.js';

import { fx, helperPeople, kid, town, elderVoicePos } from './world.js';
import { renderHomeProps } from './home.js';

export let homeTag;
let DAILY;
export let topSheet;

// 邻居家的小标签（选“拜托邻居”时显示是谁家，拜托过的常驻 ✓）
export const nbTags = {};
export function initUi() {
  // 下层（每帧人物）发来的事件
  on('say', (who, text, sec) => helperSay(who, text, sec));
  on('neighborGreet', (id) => helperLine(id, 'nb.greet.' + id, {}, 2));
  // ---------- 界面 ----------
  homeTag = document.createElement('div'); homeTag.className = 'tag'; homeTag.style.background = 'rgba(63,143,122,.9)'; homeTag.style.color = '#fff'; bubblesEl.appendChild(homeTag);
  DAILY = new Set(['note', 'song']);
  $('#gpHead').style.position = 'relative'; $('#gpHead').insertAdjacentHTML('beforeend', '<span id="gpDelta"></span>');
  // 手机顶部（手风琴）：爷爷条、时间条固定一行、永远不变；点开哪个，它的内容就在这一行下面整宽展开，同时只开一个，提示条接在下面
  topSheet = document.createElement('div'); topSheet.id = 'topSheet'; topSheet.className = 'glass hidden'; $('#leftCol').insertBefore(topSheet, $('#hint'));
  window.addEventListener('resize', () => layoutTop());
  $('#gpHead').onclick = () => {
    sfx('click');
    if (phoneTop()) { ui.gpSheet = !ui.gpSheet; if (ui.gpSheet) $('#hudR').classList.remove('open'); layoutTop(); return; }
    $('#gp').classList.toggle('collapsed');
  };
  $('#gpHead').addEventListener('click', () => setTimeout(syncTop, 0));
  window.addEventListener('resize', syncTop);
  window.addEventListener('resize', fitTop);

  // 记录：手机上在下方卡片里，两处一起切换
  $('#gpMore').onclick = () => { const on = $('#gp').classList.toggle('log'); topSheet.classList.toggle('log', on); $('#gpMore span').textContent = on ? '收起' : '记录'; renderLog(); sfx('click'); };
  $('#bagBtn').onclick = () => { if (!$('#dock').classList.contains('live')) return; initAudio(); sfx('click'); setDockOpen(!$('#dock').classList.contains('open')); };
  for (const nb of NEIGHBORS) { const el = document.createElement('div'); el.className = 'tag nbtag'; el.textContent = nb.name + '家'; el.style.display = 'none'; document.querySelector('#bubbles').appendChild(el); nbTags[nb.id] = el; }   // 放在最后：叠放顺序和原来一样（在地名等标签之上）
}
export let bubble = null;
// ---------- 他说的短句：哪些出声、怎么控制频率 ----------
// 只配他自己说、有情绪转折的短句；电话里的话贴耳朵（不做空间化）；普通“？”不配。
// 规则：同时只说一句；两句至少隔 8 秒（迷路、电话、往事可以打断）；4 倍速以上只留迷路和电话；同一句一天最多两次。
const BARK_PRI = { lost: 3, phone: 3, found: 2, hes: 2, happy: 1, help: 1, self: 1 };
let barkLast = -1e9;
 export const barkCount = {};
export function bark(text) {
  const id = voiceKey(text), cls = voiceCls(text); if (!id || !settings.voice) return false;
  const pri = BARK_PRI[cls] || 0, now = performance.now();
  if (!pri) return false;
  // 倍速分档：迷路、电话一直说；找到路、特殊路口的犹豫 4 倍以下；开心话等陪衬 2 倍以下
  if (pri < 3 && run.effSpeed > (pri >= 2 ? 4.2 : 2.2)) return false;
  if ((barkCount[text] || 0) >= 2) return false;
  if (now - barkLast < 8000 && pri < 3) return false;
  const ch = pri >= 3 ? 'urgent' : 'chat';   // 迷路、电话：要紧话；其他：闲话（声音调度见 audio.voice）
  if (!voiceWouldPlay(ch)) return false;       // 不出声：只留气泡
  barkCount[text] = (barkCount[text] || 0) + 1; barkLast = now;
  voice(ch, id, cls === 'phone' ? {} : { pos: elderVoicePos });
  return true;
}
// 说出声的话就不再显示字幕（画面干净）；没出声的（没有录音、被跳过、关了配音、提示文字选“多”）照常显示
const quietSubs = () => settings.voice && settings.tips !== 3;

export function showBubble(text, cls, dur = 2.5) {
  logLine('elder', text);
  if (!/memo|mute/.test(cls || '') && bark(text) && quietSubs()) { if (bubble) bubble.style.display = 'none'; return; }
  if (!bubble) { bubble = document.createElement('div'); bubblesEl.appendChild(bubble); }
  bubble.className = 'bubble ' + (cls || ''); bubble.textContent = text; ui.bubbleT = dur; bubble.style.display = '';
}
export const helperBubbles = {};
// 收起所有人头上的话（爷爷、邻居、老孙、孙女）：新的一天开始、回主菜单时调用——气泡倒计时按游戏时间走，
// 结算页、布置时时间停着，不收就会一直挂着（09-28：前一天晚上讲的往事，第二天他还顶着出门）
export function clearSpeech() {
  ui.bubbleT = 0; if (bubble) bubble.style.display = 'none';
  for (const el of Object.values(helperBubbles)) { el.dataset.t = 0; el.style.display = 'none'; }
}
// 邻居、老孙、孙女按台词表（lines.js）的编号说一句：挑哪句由情境定（时段、去／回、天气、说过没有），一句都不合适就只挥手不说话
export function helperLine(id, lineId, vars = {}, dur) { const l = sim.line(lineId, vars); if (l) helperSay(id, l.text, dur ?? l.dur); return l; }
const NPC_VOICE = { wang: 'wang', li: 'li', zhao: 'zhao', chen: 'chen', acq: 'sun', kid: '' };
export function helperSay(id, text, dur = 2.5) {
  // 他们说的话从他们站的地方发出（和爷爷的短句共用频率规则）
  logLine(id, text);
  const who = id === 'kid' ? kid : helperPeople[id]?.person, pre = NPC_VOICE[id];
  if (who && pre != null && settings.voice && run.effSpeed <= 2.2) {   // 邻居、老孙、孙女这类陪衬：2 倍以下才出声
 const key = pre ? pre + '|' + text : text, vid = voiceKey(key); if (vid && voiceWouldPlay('chat')) { voice('chat', vid, { pos: () => _np.copy(who.root.position).setY(who.root.position.y + 2) }); if (quietSubs()) return; } }
  let el = helperBubbles[id];
  if (!el) { el = document.createElement('div'); bubblesEl.appendChild(el); helperBubbles[id] = el; }
  el.className = 'bubble good'; el.textContent = text; el.dataset.t = dur; el.style.display = '';
}

let hintTimer = null;
export function hint(text, secs = 3.5) {
  narrate(text);   // 朗读提示：新的提示换掉上一条
  const el = $('#hint'); el.className = 'msg guide'; el.innerHTML = `<span class="mi">${icon('bulb', 15, 2.2)}</span><span class="mt"></span>`; el.querySelector('.mt').textContent = text; el.style.opacity = 1;
  document.body.classList.add('hinting');
  clearTimeout(hintTimer); if (secs) hintTimer = setTimeout(hideHint, secs * 1000);
}
export function hideHint() { $('#hint').style.opacity = 0; document.body.classList.remove('hinting'); }
// ---------- 第 1 天新手引导：一步一提示，高亮要点的地方；随时可以不照做 ----------
export let coach = null; // 当前步骤名；null 表示不在引导中
export function coachOn() { return sim.dayIdx === 0 && !save.best[0]; }
export function coachStep(step, text, targets = []) {
  if (!coachOn()) return;
  document.querySelectorAll('.coach').forEach(e => e.classList.remove('coach'));
  coach = step;
  if (!step) { hideHint(); return; }
  targets.forEach(sel => document.querySelectorAll(sel).forEach(e => e.classList.add('coach')));
  hint(text, 0);
}
export function coachDone(step, next) { if (coach === step) next ? next() : coachStep(null); }
// 字幕：只留最新的一两条；更早的在爷爷那块“最近发生”里
export const logEntries = [];
const MSG_ICON = { good: 'check', bad: 'alert', help: 'heart', note: 'bulb', q: 'dot' };
export function toast(entry) {
  if (!entry.msg || sim.phase !== 'live') return;
  if (voiceCls(entry.msg) === 'phone') bark(entry.msg);
  logEntries.unshift(entry); if (logEntries.length > 12) logEntries.pop();
  renderLog();
  const el = document.createElement('div'); el.className = 'msg ' + (entry.kind || '');
  el.innerHTML = `<span class="mi">${icon(MSG_ICON[entry.kind] || 'dot', 14, 2.4)}</span><span class="mt"><b>${fmt(entry.t)}</b>${entry.msg}</span>`;
  const feed = $('#feed'); feed.prepend(el);
  const keep = settings.tips === 3 ? 3 : 1;
  while (feed.children.length > keep) feed.lastChild.remove();
  setTimeout(() => el.remove(), 8000);
}
export function renderLog() {
  $('#gpLog').innerHTML = logEntries.map(e => `<div><b>${fmt(e.t)}</b>${e.msg}</div>`).join('') || '还没有事发生';
}

// ---------- 爷爷：表情＝心情，图标时间线＝今天的事 ----------
const GOAL_SHORT = { meds: '吃药', chess: '下棋', shop: '买菜', rx: '药店', post: '快递', talk: '讲座', pick: '接人', movie: '电影', cook: '饺子', choir: '合唱', scam: '来电', match: '比赛' }; // 只管当天的道具
function goalIcon(g) { return thing(/水果/.test(g.label) ? 'apple' : GOAL_ICON[g.task], 22); }
function goalShort(g) { return /水果/.test(g.label) ? '水果' : /馅/.test(g.label) ? '买馅' : GOAL_SHORT[g.task] || g.label; }

export function renderGoals() {
  ui.gpKey = '';
  const act = sim.goals.find(g => g.status === 'active'), next = sim.goals.find(g => g.status === 'pending');
  $('#gpTitle').textContent = sim.day.title.split('·').pop().trim();
  requestAnimationFrame(() => { fitTop(); syncTop(); });
  $('#gpSub').textContent = `${sim.day.weekday} · 第 ${sim.dayIdx + 1} 天`;
  $('#gpLine').innerHTML = sim.goals.map((g, i) => {
    // 和地图上这段路线同色；在家里的事用墨色
    const c = g.kind === 'trip' ? '#' + routeColor(g).toString(16).padStart(6, '0') : '#5b5866';
    const now = g === act || (!act && g === next);
    const helped = g.helped || g.wrongPlace;
    return `<div class="tl ${g.status} ${now ? 'now' : ''} ${helped ? 'helped' : ''}" style="--c:${c}" title="${fmt(g.at)} ${g.label}${g.status === 'done' ? (helped ? '（你帮着办成）' : '（他自己办成）')
      : ''}"><span class="tic">${goalIcon(g)}</span><span class="tm">${fmt(g.at)}</span><span class="tn">${goalShort(g)}</span></div>`;
      
  }).join('');
  $('#gpNow').textContent = act ? '正在：' + act.label : next ? '接下来：' + next.label : '今天的事都办完了';
  updateMeters();
} // 手机上爷爷条是否展开（手机上 #gp 本身一直是折叠样子）
export const phoneTop = () => window.innerWidth <= 760;
export function layoutTop() {
  const gp = $('#gp'), body = $('#gpBody'), menu = $('#menu'), hudOpen = $('#hudR').classList.contains('open');
  if (phoneTop()) {
    gp.classList.add('collapsed'); gp.classList.toggle('sheet-on', ui.gpSheet);
    const want = ui.gpSheet ? body : hudOpen ? menu : null;
    for (const el of [body, menu]) if (el !== want && el.parentNode === topSheet) (el === body ? gp : $('#hudR')).appendChild(el);
    if (want && want.parentNode !== topSheet) topSheet.appendChild(want);
    topSheet.classList.toggle('hidden', !want); topSheet.dataset.kind = want === body ? 'gp' : 'menu';
  } else {
    gp.classList.remove('sheet-on');
    if (body.parentNode !== gp) gp.appendChild(body);
    if (menu.parentNode !== $('#hudR')) $('#hudR').appendChild(menu);
    topSheet.classList.add('hidden');
  }
}
// 顶部两块的默认状态（每天开始时定一次）：桌面都展开、同高；手机都折叠成一行、同高。当天手动开合就按玩家的来
export function autoFoldGp() {
  const m = window.innerWidth <= 760 || window.innerHeight <= 500;   // 手机竖屏、手机横屏（矮）都折叠
  $('#gp').classList.toggle('collapsed', m); $('#hudR').classList.toggle('open', !m); ui.gpSheet = false;
  layoutTop(); fitTop(); syncTop();
}
// 桌面：两块都展开时，时间块和爷爷块一样高
let topH = 0;
// 顶部两块的高度（桌面、手机同一规则）：两块都展开时一样高（取两者较高的）；右上展开时高度固定为这个值，不随左边折叠而变
export function syncTop() {
  const h = $('#hudR'), gp = $('#gp'); if (!h) return;
  h.style.minHeight = gp.style.minHeight = '';
  if (!h.classList.contains('open') || phoneTop()) return;   // 手机：展开内容在下面的整宽卡片里，顶部两条不用对高
  const z = h.getBoundingClientRect().width / (h.offsetWidth || 1) || 1;
  const hh = h.getBoundingClientRect().height / z;
  if (!gp.classList.contains('collapsed')) { topH = Math.max(gp.getBoundingClientRect().height / z, hh); gp.style.minHeight = topH + 'px'; }
  h.style.minHeight = Math.max(topH, hh) + 'px';
}
// 手机：按时间框实际占的宽度，给爷爷块留出剩下的空间（字号设置会缩放整块，要换算回去）
function fitTop() {
  const gp = $('#gp');
  if (window.innerWidth > 760) { gp.style.width = ''; return; }
  const r = $('#hudR').getBoundingClientRect(), col = $('#leftCol'), z = col.getBoundingClientRect().width / (col.offsetWidth || 1) || 1;
  gp.style.width = Math.max(140, (window.innerWidth - r.width - 24) / z) + 'px';
}
export function updateMeters() {
  const n = sim.goals.length, done = sim.goals.filter(g => g.status === 'done').length;
  const self = sim.goals.filter(g => g.status === 'done' && !g.helped && !g.wrongPlace).length;
  const mood = clamp(sim.mood, 0, 100);
  // 表情：想事（犹豫时刻）＞着急（迷路、慌了）＞心情三档；“开心”的线和心情那颗星一样是 65
  const kind = sim.moment ? 'think' : (sim.e?.lost || sim.e?.mode === 'stuck' || sim.anxiety >= 0.4) ? 'worry' : mood >= 65 ? 'happy' : mood >= 45 ? 'calm' : 'low';
  const key = `${done}/${n}/${self}/${kind}/${settings.tips}`;
  if (key === ui.gpKey) return; ui.gpKey = key;
  $('#gpFace').innerHTML = elderHead(kind);
  $('#gpFace').title = { happy: '心情很好', calm: '心情还行', low: '有点低落', think: '正在想事', worry: '着急了' }[kind] + `（心情 ${Math.round(mood)}，一天结束时 ≥65 得一颗星）`;
  $('#gpStats').innerHTML = `<span class="ok" title="今天的事办成了几件（谁帮忙都算）">${icon('check', 13, 2.4)}<em>办成</em>${done}/${n}</span><span class="self" title="其中他自己办成的（你替他做的不算）">${icon('hand', 13, 2.4)}<em>自己</em>${self}/${n}</span>`;
}

export function renderEnergy() {
  const el = $('#energy .num');
  el.innerHTML = `${sim.energy}<small>/${sim.day.energy}</small>`; el.classList.toggle('zero', sim.energy <= 0);
  $('#energy').title = `今天的精力：还剩 ${sim.energy}，共 ${sim.day.energy}`;
}
export function renderCards() {
  const wrap = $('#cards'); wrap.innerHTML = '';
  const unlocked = DAYS.slice(0, sim.dayIdx + 1).flatMap(d => d.unlock);
  // 当天用不上、之前也没放过的家用道具不显示，免得白花精力
  const g = sim.goals;
  const useful = {
    note: g.some(x => x.menu && x.recall !== false) || !!FAVORS[sim.dayIdx],   // 邻居托的事也能记在便签上
    pillbox: g.some(x => x.task === 'meds'),
    calendar: g.some(x => x.pre === 'weekday'),
    pact: g.some(x => x.task === 'scam'),
    song: g.some(x => x.task === 'cook'),
  };
  for (const type of unlocked) {
    const s = SUPPORTS[type];
    if (s.slot && (useful[type] === false || persist.home.has(s.slot))) continue;   // 用不上或已放好的家用道具不显示
    if (type === 'neighbor' && NEIGHBORS.every(n => persist.neighbors.has(n.id))) continue;   // 邻居都拜托过了
    const b = document.createElement('button'); b.className = 'card tile' + (ui.selected === type ? ' sel' : '') + (DAILY.has(type) ? ' today' : '');
    b.title = `${s.name}（精力 ${s.cost} · ${DAILY.has(type) ? '只管今天' : '一直有效'}）${s.tip}`;
    b.disabled = sim.energy < s.cost;
    b.innerHTML = `<div class="ic">${thing(type, 34)}<span class="cost">-${s.cost}</span></div><div class="nm">${SUPPORT_SHORT[type]}</div><div class="cs">${DAILY.has(type) ? '只管今天' : '一直有效'}</div>` + (DAYS[sim.dayIdx].unlock.includes(type) ? '<span class="new">新</span>' : '');
    b.onclick = (ev) => { ev.stopPropagation(); initAudio(); selectCard(type); };
    wrap.appendChild(b);
  }
  renderEnergy();
}
function selectCard(type) {
  const s = SUPPORTS[type];
  if (s.target === 'home') {
    // 家里的支持直接放置
    if (sim.place(type)) { sfx('place'); fx.ring(town.placeObjs.home.position.clone(), 0x3f8f7a); hint(narrPlaced(type)); if (coach === 'card' || coach === 'place') setTimeout(() => { if (sim.phase === 'plan' && coach) coachStep('go', NARR.readyGo, ['#startBtn']); }, 1800); }
    else sfx('deny');
    ui.selected = null; renderCards(); updateHomeTag(); renderHomeProps(); return;
  }
  ui.selected = ui.selected === type ? null : type;
  sfx('click');
  if (ui.selected && coach === 'card') { coachStep('place', s.target === 'node' ? NARR.placeSign : s.target === 'neighbor' ? NARR.placeNeighbor : NARR.placeElse, ['#bubbles .risk']); return renderCards(); }
  if (ui.selected) hint(narrCard(type), 0);
  else hideHint();
  renderCards();
}
export function updateHomeTag() {
  const items = [...persist.home].map(slot => Object.values(SUPPORTS).find(s => s.slot === slot)?.name).filter(Boolean);
  homeTag.textContent = items.length ? '家里：' + items.join('、') : '';
  homeTag.style.display = items.length ? '' : 'none';
}
// 道具箱：白天收成一个小包，点开再用
export function setDockOpen(on) {
  $('#dock').classList.toggle('open', on);
  document.body.classList.toggle('dock-open', on || !$('#dock').classList.contains('live'));
  if (!on && ui.selected) { ui.selected = null; hideHint(); renderCards(); }
}

// 一次性提示（某类提示一天只出一次）：只由这里写 run.helpedOnce；读取可以直接看 run.helpedOnce.xxx
export function markHinted(key) { run.helpedOnce[key] = true; }
export function resetHints(init) { run.helpedOnce = { ...init }; }
