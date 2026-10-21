// 整周难度模拟（难度统筹用）：几种典型玩家从第 1 天玩到第 7 天，道具跨天保留（和真实游戏一样），小关卡按真人大致成功率随机。
// 用法（在 Game/ 下）：node tools/weekbalance.mjs [局数=60] [--levels-ok] [--json 输出文件]
// 输出每种玩家每天：三星率、三颗星各自的达成率（都办成／他自己办的／心情）、平均心情、迷路率、晚到（部分）率、没赶上率。
import fs from 'node:fs';
import { buildGraph } from '../src/town.js';
import { Sim } from '../src/sim.js';
import { DAYS, PLACES, nid } from '../src/data.js';

const graph = buildGraph();
// 试验杠杆（不改游戏代码，只在模拟里试）：--energy 3,3,3,2,2,2,2 每天精力；--signmiss 0.25 有路标的路口仍有这个比例当陌生（会犹豫、可能拐错）
const arg = (k) => process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null;
if (arg('--energy')) arg('--energy').split(',').forEach((v, i) => { if (DAYS[i]) DAYS[i].energy = +v; });
const SIGN_MISS = +(arg('--signmiss') || 0);
// --pscale 1.3：陌生路口拐错概率整体乘这个数；--until 7:match:+30,6:choir:+20：某天某件事的截止时间往后挪（分钟）；--at 7:match:-30：出发时间提前
const PSCALE = +(arg('--pscale') || 1);
if (PSCALE !== 1) { const o = Sim.prototype.wrongP; Sim.prototype.wrongP = function (n) { return Math.min(0.95, o.call(this, n) * PSCALE); }; }
for (const [flag, key] of [['--until', 'until'], ['--at', 'at']]) if (arg(flag)) for (const spec of arg(flag).split(',')) { const [d, id, dv] = spec.split(':'); const g = DAYS[+d - 1].goals.find(x => x.id === id); if (g) g[key] += +dv; }
if (SIGN_MISS) { const orig = Sim.prototype.known; Sim.prototype.known = function (node, target) { const k = orig.call(this, node, target);
  if (k === 'sign' && !this.p.home.has('__') && rnd() < SIGN_MISS) { const saved = this.p.signs; this.p = { ...this.p, signs: new Set() }; const k2 = orig.call(this, node, target); this.p = { ...this.p, signs: saved }; return k2; } return k; }; }
const RUNS = +(process.argv[2] || 60);
// --without call|walk|sign|neighbor|home：“缺了谁不行”检查——把某一种帮法从所有玩家手里拿掉
const WITHOUT = arg('--without');
const LEVEL_OK = process.argv.includes('--levels-ok') ? 1 : 0.75;   // --levels-ok：小关卡一律做对（只看走路与雾的难度）
const jsonOut = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
const bfs = (a, b) => { const prev = new Map([[a, -1]]), q = [a]; while (q.length) { const v = q.shift(); if (v === b) break; for (const w of graph.adj[v]) if (!prev.has(w)) { prev.set(w, v);
  q.push(w); } } const p = []; for (let n = b; n !== -1 && n !== undefined; n = prev.get(n)) p.unshift(n); return p; };
let seedR = 1; const rnd = () => { seedR = (seedR * 16807) % 2147483647; return seedR / 2147483647; };

// 小关卡：真人大致 75% 全对、其余做对一半
const levelResult = (name) => {
  const ok = rnd() < LEVEL_OK;
  if (name === 'trail') return { path: [18, 12] };
  if (name === 'scamCall') return { q: ok ? 1 : 0.5, outcome: ok ? 'self' : 'told', caught: ok ? 4 : 2, total: 6 };
  return { q: ok ? 1 : 0.5, correct: ok ? 3 : 2, right: ok ? 7 : 4, ok: ok ? 5 : 3, n: 5 };
};
const TODAY_ITEM = { meds: 'pillbox', scam: 'pact', cook: 'song' };
const PLAYERS = {
  什么都不做: { place: () => { }, pick: (o) => o.includes('letgo') ? 'letgo' : o.includes('wait') ? 'wait' : o[0], call: false },
  耐心引导: { place: () => { }, pick: (o) => ['wait', 'cue', 'walk', 'tell'].find(x => o.includes(x)) || o[0], call: true },   // 他慌了打来电话：过去陪他
  合理地帮: {
    place: (sim, d) => {
      // 当天用得上的家里道具（诈骗那天约定、星期几那天日历、老地方变样那天老照片……），再把剩下的精力给路线上最容易走错的路口放路标
      const want = [];
      for (const g of sim.goals) { if (TODAY_ITEM[g.task]) want.push(TODAY_ITEM[g.task]); if (g.pre === 'weekday') want.push('calendar'); }
      if (d.changed?.length) want.push('photo');
      for (const t of want) if (sim.canPlace?.(t)) sim.place(t);
      if (process.env.NB) for (const n of ['wang', 'li', 'zhao', 'chen']) sim.place('neighbor', n);   // NB=1：先拜托邻居，再放路标（看“老街坊”拿不拿得到）
      const risky = new Map();
      for (const g of sim.goals) if (g.place && PLACES[g.place]) for (const n of bfs(sim.homeNode, nid(...PLACES[g.place].node))) { const p = sim.risk(n).p; if (p > 0) risky.set(n, p); }
      for (const [n] of [...risky].sort((a, b) => b[1] - a[1])) sim.place('sign', n);
    },
    pick: (o) => ['wait', 'cue', 'walk', 'tell'].find(x => o.includes(x)) || o[0], call: true,   // 他慌了打来电话：过去陪他
  },
  只接他打来的: {   // 4 倍速不盯着看：不主动打电话；他慌了打来时，过去陪他（--without walk 时只能电话里指路）
    place: (sim) => { for (const g of sim.goals) { const t = TODAY_ITEM[g.task] || (g.pre === 'weekday' && 'calendar'); if (t && sim.canPlace?.(t)) sim.place(t); } },
    pick: (o) => (process.env.PICK ? process.env.PICK.split(',') : ['wait', 'cue', 'walk', 'tell']).find(x => o.includes(x)) || o[0], call: false,   // PICK=tell 或 walk：比较只指路／只陪同
  },
  放一两样就不管: {   // 用户 09-27 试玩：只放当天用得上的一两样家里道具，然后 4 倍速不管（犹豫时刻让他自己想）
    place: (sim) => { for (const g of sim.goals) { const t = TODAY_ITEM[g.task] || (g.pre === 'weekday' && 'calendar'); if (t && sim.canPlace?.(t)) sim.place(t); } },
    pick: (o) => o.includes('wait') ? 'wait' : o.includes('letgo') ? 'letgo' : o[0], call: false,
  },
  事事替他做: { place: () => { }, pick: (o) => o.includes('tell') ? 'tell' : o[0], call: true, escort: true },
  看时机问一句: {   // 10-06 路口时机窗口：只放当天用得上的家里道具；他在陌生路口犹豫时打电话问一句（每个路口一次，ASKS=n 限每趟最多问几次）；迷路先问，不行就去陪
    place: (sim) => { for (const g of sim.goals) { const t = TODAY_ITEM[g.task] || (g.pre === 'weekday' && 'calendar'); if (t && sim.canPlace?.(t)) sim.place(t); } },
    pick: (o) => ['wait', 'cue', 'walk', 'tell'].find(x => o.includes(x)) || o[0], call: true, atHesitate: true,
  },
};

function runWeek(pl, seed) {
  const persist = { signs: new Set(), photos: new Set(), home: new Set(), neighbors: new Set() };
  const days = [];
  for (let d = 0; d < DAYS.length; d++) {
    let score = null;
    const sim = new Sim(graph, persist, {
      end: (s) => { score = s; },
      level: (n, _d, f) => f(levelResult(n)),
      minigame: (k, _m, cb) => { if (k === 'route') return cb(bfs(sim.e.node, sim.e.target).slice(1));   // 电话里指路：照最短路说（游戏里最多照走 3 个路口）
        const ok = rnd() < LEVEL_OK; cb(ok ? 1 : 0.5, { stage: ok ? 0 : 2, hit: ok ? 5 : 3, picked: [] }); },
    });
    sim.startDay(d, seed * 10 + d);
    if (WITHOUT === 'sign' || WITHOUT === 'neighbor' || WITHOUT === 'home') { const o = sim.place.bind(sim); sim.place = (t, n) => (WITHOUT === 'home' ? ['sign', 'neighbor'].includes(t) : t !== WITHOUT) && o(t, n); }
    pl.place(sim, DAYS[d]);
    sim.begin();
    let calledLost = false, hesAt = null;
    for (let i = 0; i < 80000 && !score; i++) {
      if (sim.moment && !sim.moment.pending && !sim.moment.event) { sim.choose(pl.pick(sim.momentOptions().map(x => x.id).filter(x => !(WITHOUT === 'walk' && x === 'walk') && !(WITHOUT === 'call' && sim.moment.kind === 'lost' && x === 'cue')))); continue; }
      const e = sim.e;
      if (pl.escort && WITHOUT !== 'walk' && sim.canEscort() && e.leg === 'go') sim.escort();
      if (pl.call && WITHOUT !== 'call' && (e.lost || e.mode === 'stuck') && !calledLost && sim.canCall()) { calledLost = true; sim.call(); continue; }
      if (pl.atHesitate && WITHOUT !== 'call' && e.mode === 'hesitate' && !e.lost && !e.drift && hesAt !== e.node + ':' + sim.time.toFixed(0).slice(0, -1) && (e.asks || 0) < (+process.env.ASKS || 9) && sim.canCall()) { hesAt = e.node + ':' + sim.time.toFixed(0).slice(0, -1); sim.call(); continue; }
      if (!e.lost && e.mode !== 'stuck') calledLost = false;
      sim.update(0.05, 4);
    }
    const ev = sim.events || [];
    if (DETAIL && sim.favor) { const k = `D${d + 1} ~favor:${sim.favor.got}`; DETAIL[k] = (DETAIL[k] || 0) + 1; }
    if (DETAIL) { const k = `D${d + 1} ~carry:${persist.carry}${persist.carry === 'worry' ? '/' + sim.carryWhy : ''}`; DETAIL[k] = (DETAIL[k] || 0) + 1; }
    if (DETAIL) for (const g of sim.goals) { const k = `D${d + 1} ${g.id}:${g.status}`; DETAIL[k] = (DETAIL[k] || 0) + 1; }
    days.push({ used: DAYS[d].energy - sim.energy, callSelf: sim.helps.callSelf || 0, nb: sim.used?.neighbor || 0, carry: persist.carry, stars: score.stars, mood: score.mood, done: score.doneRatio, self: score.autonomy,
      lost: ev.some(x => x.kind === 'lost'), late: sim.goals.some(g => g.status === 'partial' && g.late), miss: sim.goals.some(g => g.status === 'fail' && /没赶上/.test(g.note || '')) });
  }
  return days;
}

const DETAIL_FOR = arg('--detail');   // --detail 耐心引导：打印这种玩家每天每件事的结局分布
let DETAIL = null; const DIST = {};
const out = {};
for (const [name, pl] of Object.entries(PLAYERS)) {
  const agg = DAYS.map(() => ({ s3: 0, sd: 0, sa: 0, sm: 0, mood: 0, lost: 0, late: 0, miss: 0 }));
  const ach = { 刚刚好: 0, 先问一句: 0, 老街坊: 0, 放心的一周: 0, 圆满的一周: 0 };   // 5 个成就：一周能拿到的比例
  DETAIL = DETAIL_FOR === name ? {} : null;
  for (let r = 1; r <= RUNS; r++) {
    seedR = r * 7919;
    const wk = runWeek(pl, r);
    const three = (x) => x.stars.done && x.stars.auto && x.stars.mood;
    ach.刚刚好 += wk.reduce((a, x) => a + x.used, 0) <= 7 && wk.reduce((a, x) => a + x.stars.done + x.stars.auto + x.stars.mood, 0) >= 18; ach.先问一句 += wk.reduce((a, x) => a + x.callSelf, 0) >= 3; ach.老街坊 += wk.reduce((a, x) => a + x.nb, 0) >= 5;
    ach.放心的一周 += !wk.some(x => x.carry === 'worry' || x.carry === 'lean');
    const E = wk.reduce((a, x) => a + x.used, 0), St = wk.reduce((a, x) => a + x.stars.done + x.stars.auto + x.stars.mood, 0); (DIST[name] ||= []).push(E + ':' + St); ach.圆满的一周 += wk.every(three);
    wk.forEach((x, d) => { const a = agg[d]; a.s3 += x.stars.done && x.stars.auto && x.stars.mood; a.sd += x.stars.done; a.sa += x.stars.auto; a.sm += x.stars.mood; a.mood += x.mood; a.lost += x.lost; a.late += x.late; a.miss += x.miss; });
  }
  const pc = (v) => Math.round(v / RUNS * 100);
  out[name] = agg.map(a => ({ 三星: pc(a.s3), 都办成: pc(a.sd), 自己办: pc(a.sa), 心情星: pc(a.sm), 心情: Math.round(a.mood / RUNS), 迷路: pc(a.lost), 晚到: pc(a.late), 没赶上: pc(a.miss) }));
  console.log(`\n${name}（${RUNS} 周）`);
  console.log('天  三星 都办成 自己办 心情星 心情 迷路 晚到 没赶上');
  console.log('成就（一周拿到的比例）：' + Object.entries(ach).map(([k, v]) => `${k} ${pc(v)}%`).join('  '));
  if (DETAIL) console.log(Object.entries(DETAIL).sort().map(([k, v]) => `${k} ${Math.round(v / RUNS * 100)}%`).join('  '));
  out[name].forEach((x, d) => console.log(`D${d + 1}  ${String(x.三星).padStart(3)}% ${String(x.都办成).padStart(4)}% ${String(x.自己办).padStart(4)}% ${String(x.心情星).padStart(4)}%  ${String(x.心情).padStart(3)} ${String(x.迷路).padStart(3)}% ${String(x.晚到).padStart(3)}% ${String(x.没赶上).padStart(3)}%`));
}
if (process.env.DIST) for (const [n, arr] of Object.entries(DIST)) { const e = arr.map(x => +x.split(':')[0]).sort((a, b) => a - b), st = arr.map(x => +x.split(':')[1]).sort((a, b) => a - b), q = (a,
  p) => a[Math.floor(a.length * p)]; console.log(`${n} 精力 中位 ${q(e, .5)}（${q(e, .1)}–${q(e, .9)}）  星 中位 ${q(st, .5)}（${q(st, .1)}–${q(st, .9)}）`); }
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(out, null, 1));
