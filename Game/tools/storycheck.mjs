// 无头情境自检（情境系统 S4-4）：不开浏览器，7 天 × 3 种玩法 × 几个种子，混入随机的玩家操作
// （随时打电话、陪同、乱选犹豫时刻的选项、小关卡随机成败、忽快忽慢），跑完按事件流查三类问题：
//   1 事件先后：时间不倒流、一天首尾、每件事只结束一次、托带的事前后对得上、到家后不再有路上的事、犹豫与关卡成对……
//   2 台词合不合情境：规则层说的话＋邻居招呼与指路，用与浏览器里同一套规则（linerules）核对
//   3 状态没坏：心情、精力不越界，走路时位置在路上，没有 NaN
// 用法：node tools/storycheck.mjs [每种玩法的种子数，默认 4]（在 npm run check 里）
import { runDay, POLICIES, getGraph } from './storyrun.mjs';
import { checkLines } from './linerules.mjs';
import { pickLine } from '../src/lines.js';
import { DAYS, NEIGHBORS, pickMemory } from '../src/data.js';

const N = +(process.argv[2] || 10);
const graph = getGraph();
const segD = (p, a, b) => { const abx = b.x - a.x, abz = b.z - a.z, t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / (abx * abx + abz * abz))); return Math.hypot(p.x - a.x - abx * t, p.z - a.z - abz * t); };
const onRoad = (p) => { for (let i = 0; i < graph.adj.length; i++) for (const j of graph.adj[i]) if (segD(p, graph.pos[i], graph.pos[j]) < 0.05) return true; return false; };
const bad = new Set();
let runs = 0, events = 0, lines = 0;
// 可复现的随机数（每一局一个种子）
const rng = (s) => () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };

for (const policy of Object.keys(POLICIES)) for (let d = 0; d < DAYS.length; d++) for (let k = 0; k < N; k++) {
  const R = rng(9000 + d * 97 + k * 13 + policy.length), where = `${policy}·第${d + 1}天·种子${k}`;
  const said = [];
  const fuzz = k > 0;   // 种子 0 按玩法原样跑；其余混入随机操作
  let t = -1, S = null, enterAt = null, holdAt = null, clock = 0;
  const visualDelay = 0.5 + R() * 7.5;   // 画面上进门、出门要花的真实秒数（随机）
  const { sim, score } = runDay(d, {
    onSim: (s) => { S = s; },
    policy, seed: 1 + k,
    neighbors: k % 2 ? NEIGHBORS.map(n => n.id) : [],   // 一半的局拜托全部邻居（招呼、指路的话才会出现）
    hooks: {
      bubble: (text) => said.push({ ...S.ctx(), who: 'elder', text }),
      ...(fuzz ? { visualHold: true } : {}),   // 模拟画面：进门、出门要等画面走到位
      ...(fuzz ? {
        level: (n, _d, f) => { const q = [0, 0.6, 1][Math.floor(R() * 3)]; f(n === 'trail' ? { path: [18, 12] } : { q, correct: Math.round(q * 3), right: Math.round(q * 7), outcome: q >= 1 ? 'self' : q > 0 ? 'hint' : 'fail', caught: Math.round(q * 6), total: 6 }); },
        minigame: (kind, _m, cb) => {
          if (kind === 'route') { const p = []; let n = S.e.node, prev = S.e.prev; while (n !== S.e.target && p.length < 30) { const nx = S.correctNext(n, S.e.target, prev); p.push(nx); prev = n; n = nx; } return cb(p); }   // 给他指路：交回一条真能走的路（真实界面没画完不能确定）
          const q = R() < 0.5 ? 1 : 0; cb(q, { stage: 0, hit: q ? 5 : Math.floor(R() * 3) });
        },
      } : {}),
    },
    pick: fuzz ? (o) => o[Math.floor(R() * o.length)] : undefined,
    onStep: (sim) => {
      const e = sim.e;
      // 状态没坏
      if (!(sim.mood >= 0 && sim.mood <= 100)) bad.add(`${where}：心情越界 ${sim.mood}`);
      if (!(sim.energy >= 0)) bad.add(`${where}：精力为负 ${sim.energy}`);
      if (!Number.isFinite(sim.time) || !Number.isFinite(e.pos.x) || !Number.isFinite(e.pos.z)) bad.add(`${where}：出现 NaN`);
      if (sim.time < t) bad.add(`${where}：时间倒退 ${t}→${sim.time}`); t = sim.time;
      if (e.mode === 'walk' && !onRoad(e.pos)) bad.add(`${where}：走路时离开道路 ${Math.round(sim.time)}分`);
      // 邻居：他路过打招呼、出来指路时，按台词表挑的话也核对
      if (!fuzz) return;
      // 画面走到位：进门、出门各等 visualDelay 秒（真实时间，每步 0.05 秒）
      clock += 0.05;
      if (e.mode === 'entering') { enterAt ??= clock; if (clock - enterAt > visualDelay) { sim.visualArrived(); enterAt = null; } } else enterAt = null;
      if (e.hold) { holdAt ??= clock; if (clock - holdAt > visualDelay) { e.hold = false; holdAt = null; } } else holdAt = null;
      if (sim.canCall() && R() < 0.0015) sim.call();
      if (sim.canEscort() && R() < 0.0008) sim.escort();
      return [0.5, 1, 2, 4, 6][Math.floor(R() * 5)];   // 忽快忽慢
    },
  });
  runs++;
  const ev = sim.events; events += ev.length;
  // 邻居说的话：在招呼、帮忙的事件上按台词表挑一句（与画面层同一张表、同一份情境）
  const mem = { day: {}, game: {} }, say = (e, id, vars) => { const l = pickLine(id, e, vars, mem); if (l) said.push({ ...e, who: e.who, text: l.text }); };   // 按事件当时的情境挑
  for (const e of ev) {
    if (e.kind === 'greet') say(e, 'nb.greet.' + e.who);
    if (e.kind === 'neighborHelp') { say(e, (e.lost ? 'nb.lost.' : 'nb.greet.') + e.who); say(e, 'nb.way', { target: e.leg === 'back' ? '家' : e.target }); }
  }
  lines += said.length;
  // 1 事件先后
  const kinds = ev.map(e => e.kind);
  const firstReal = ev.find(e => e.kind !== 'player')?.kind;   // 布置道具在一天开始之前
  if (firstReal !== 'dayStart') bad.add(`${where}：第一件事不是 dayStart（${firstReal}）`);
  if (score && kinds[kinds.length - 1] !== 'dayEnd' && !kinds.includes('dayEnd')) bad.add(`${where}：没有 dayEnd`);
  for (let i = 1; i < ev.length; i++) if (ev[i].t < ev[i - 1].t) bad.add(`${where}：事件时间倒退（${ev[i - 1].kind}→${ev[i].kind}）`);
  const ended = {}; for (const e of ev.filter(e => e.kind === 'goalEnd')) { if (ended[e.goalId]) bad.add(`${where}：${e.goalId} 结束了两次`); ended[e.goalId] = true; }
  // 托带：想起／忘了只一次；交东西之前得想起；到家发现忘了之前得忘了；交／发现只一次
  const fav = ev.filter(e => e.kind === 'favor').map(e => e.state);
  const first = fav.find(s => s === 'remember' || s === 'forget');
  if (fav.filter(s => s === 'remember' || s === 'forget').length > 1) bad.add(`${where}：托带的事想了不止一次`);
  if (fav.some(s => s.startsWith('give')) && first !== 'remember') bad.add(`${where}：没想起托带的事却交了东西`);
  if (fav.includes('forgotAtHome') && first !== 'forget') bad.add(`${where}：没忘却在家发现忘了`);
  if (fav.filter(s => s.startsWith('give') || s === 'forgotAtHome').length > 1) bad.add(`${where}：托带的事了结了不止一次`);
  // 到家以后、下次出发之前，不该有路上的事
  let home = false;
  for (const e of ev) {
    if (e.kind === 'home') home = true;
    else if (e.kind === 'depart') home = false;
    else if (home && ['pass', 'hesitate', 'lost', 'found', 'wrongTurn', 'encounter', 'neighborHelp', 'greet', 'late'].includes(e.kind)) { bad.add(`${where}：到家后还发生了 ${e.kind}（${e.t}分）`); break; }
  }
  // 迟到只在路上（到了门口之后不算）
  let there = false;
  for (const e of ev) { if (e.kind === 'depart') there = false; if (e.kind === 'arrive' || e.kind === 'enter') there = true; if (e.kind === 'late' && there) bad.add(`${where}：已到门口还判迟到（${e.t}分）`);
    if (e.kind === 'goalEnd' && there && /没赶上/.test(e.note || '') && e.leg === 'go') bad.add(`${where}：已到门口还判“${e.note}”（${e.t}分）`); if (e.kind === 'goalEnd') there = false; }
  // 刚从一个地方出来（办完事），第一步就拐错＝画面上一出门就走反、到路口再掉头
  let justOut = false;
  for (const e of ev) { if (e.kind === 'goalEnd' && e.mode === 'task') justOut = true; else if (e.kind === 'pass') justOut = false; else if (e.kind === 'wrongTurn' && justOut) {
    bad.add(`${where}：刚出门第一步就拐错（${e.t}分）`); if (process.env.DBG) console.log(ev.filter(x => Math.abs(x.t - e.t) < 40).map(x => x.t + ' ' + x.kind + ' ' + (x.mode || '') + ' ' + (x.choice || x.moment || x.op || '')).join('\n')); justOut = false; } }
  // 犹豫时刻与关卡成对
  const bal = (a, b) => { let n = 0; for (const k of kinds) { if (k === a) n++; if (b.includes(k)) n--; } return n; };
  if (bal('level', ['levelEnd']) !== 0) bad.add(`${where}：关卡开了没关（${bal('level', ['levelEnd'])}）`);
  // 往事里说到的事，当天真的发生了（没取到茶不说寄来的茶；有人陪着去不说自己走来的）
  { const m = pickMemory(d, sim.goals).memory, g = (id) => sim.goals.find(x => x.id === id);
    if (/自己走来/.test(m) && !(g('match')?.status === 'done' && !g('match')?.helped)) bad.add(`${where}：往事说“自己走来的”，可这天${g('match')?.helped ? '有人帮着去' : '没去成'}`);
    if (/坐到棋盘前/.test(m) && g('match')?.status !== 'done') bad.add(`${where}：往事说“坐到棋盘前”，可这天没去成`);
    if (/给我寄一包/.test(m) && g('post') && g('post').status !== 'done') bad.add(`${where}：往事讲老张寄茶，可这天没取到茶`); }
  // 2 台词合不合情境
  for (const w of checkLines(said.map(l => ({ ...l, day: d + 1 })))) bad.add(`${where}：${w}`);
}
if (bad.size) { console.log([...bad].slice(0, 40).join('\n')); console.log(`\n情境自检：${runs} 局里发现 ${bad.size} 处问题`); process.exit(1); }
console.log(`情境自检通过（${runs} 局、${events} 件事、${lines} 句话；含随机玩家操作）`);
