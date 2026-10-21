// 不开浏览器跑一天，拿到完整事件流（情境系统 S4-1）。自检工具（simsnap、情境检查）共用。
// 用法（命令行）：node tools/storyrun.mjs [第几天 1-7] [玩法 消极|多帮|路标] [种子]  → 打印这一天的事件流
import { buildGraph } from '../src/town.js';
import { Sim } from '../src/sim.js';
import { PLACES, nid } from '../src/data.js';

let graph = null;
const bfs = (a, b) => { const prev = new Map([[a, -1]]), q = [a]; while (q.length) { const v = q.shift(); if (v === b) break; for (const w of graph.adj[v]) if (!prev.has(w)) { prev.set(w, v);
  q.push(w); } } const p = []; for (let v = b; v !== -1 && v !== undefined && prev.has(v); v = prev.get(v)) p.unshift(v); return p; };
// 玩法：每天开始前怎么布置、犹豫时刻怎么选
export const POLICIES = {
  消极: { place: () => { }, pick: (o) => o.includes('letgo') ? 'letgo' : o.includes('wait') ? 'wait' : o[0] },
  多帮: { place: () => { }, pick: (o) => o.includes('tell') ? 'tell' : o.includes('cue') ? 'cue' : o[0] },
  路标: { place: (sim) => {   // 沿家到每个目的地的最短路，在他不熟的路口放路标，精力用完为止
    for (const g of sim.goals) {
      if (!g.place || !PLACES[g.place]) continue; const to = nid(...PLACES[g.place].node);
      for (const n of bfs(sim.homeNode, to)) if (!sim.familiar(n)) sim.place('sign', n);
    }
  }, pick: (o) => o.includes('wait') ? 'wait' : o.includes('cue') ? 'cue' : o[0] },
};
// 跑一天：返回 { sim, score, events }；onStep(sim) 每一步回调（可用来插入玩家操作、检查状态）
export function runDay(dayIdx, { policy = '消极', seed = 1, persist, onStep, dt = 0.05, speed = 4, hooks = {}, pick, onSim, neighbors } = {}) {
  graph ||= buildGraph();
  const pol = POLICIES[policy];
  let score = null;
  const sim = new Sim(graph, persist || { signs: new Set(), photos: new Set(), home: new Set(), neighbors: new Set(neighbors || []) }, {
    end: (s) => { score = s; },
    level: (n, _d, f) => f(n === 'trail' ? { path: [18, 12] } : { q: 1, correct: 3, right: 7, outcome: 'self', caught: 6, total: 6 }),
    minigame: (_k, _m, cb) => cb(1, { stage: 0, hit: 5 }),
    ...hooks,
  });
  onSim?.(sim);
  sim.startDay(dayIdx, seed);
  pol.place(sim);
  sim.begin();
  for (let i = 0; i < 80000 && !score; i++) {
    if (sim.moment && !sim.moment.pending && !sim.moment.event) { sim.choose((pick || pol.pick)(sim.momentOptions().map(x => x.id), sim)); continue; }
    const sp = onStep?.(sim, i);
    sim.update(dt, typeof sp === 'number' ? sp : speed);   // onStep 可返回这一步的倍速（模拟玩家忽快忽慢）
  }
  return { sim, score, events: sim.events };
}
export const getGraph = () => (graph ||= buildGraph());

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const d = +(process.argv[2] || 1) - 1, policy = process.argv[3] || '消极', seed = +(process.argv[4] || 1000 + d);
  const { events } = runDay(d, { policy, seed });
  const hm = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  for (const e of events) if (e.kind !== 'pass') console.log(`${hm(e.t)} ${e.kind.padEnd(11)} ${e.leg || '-'}→${e.target || '-'} ${JSON.stringify(Object.fromEntries(Object.entries(e).filter(([k]) => !['kind',
    'day', 't', 'node', 'leg', 'mode', 'goal', 'task', 'place', 'target', 'rain', 'lost', 'escort', 'prev'].includes(k))))}`);
  const count = {}; for (const e of events) count[e.kind] = (count[e.kind] || 0) + 1;
  console.log('\n共', events.length, '条：', JSON.stringify(count));
}
