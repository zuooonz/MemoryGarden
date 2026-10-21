// 检查每天的关卡在最坏情况下（不布置、时刻里总选最消极的选项）是否仍会出现
import { buildGraph } from '../src/town.js';
import { Sim } from '../src/sim.js';
import { DAYS } from '../src/data.js';
const graph = buildGraph();
const expect = { 0: ['change'], 1: ['digitsLearn', 'digitsRecall'], 2: ['trail'], 3: ['clock'], 4: ['steps'], 5: ['scamCall'], 6: ['chess'] };
let bad = 0;
for (let d = 0; d < DAYS.length; d++) {
  let missing = 0; const runs = 200;
  for (let seed = 1; seed <= runs; seed++) {
    const seen = new Set(); let done = false;
    const persist = { signs: new Set(), photos: new Set(), home: new Set(), neighbors: new Set() };
    const sim = new Sim(graph, persist, { end: () => { done = true; }, level: (n, dt, f) => { seen.add(n); f(n === 'trail' ? { path: [18, 12] } : { q: 0, correct: 0, right: 0, outcome: 'fail', caught: 0 }); }, minigame: (k, m, cb) => cb(0, { hit: 0 }) });
    sim.startDay(d, seed); sim.begin();
    for (let i = 0; i < 80000 && !done; i++) {
      if (sim.moment) { const o = sim.momentOptions().map(x => x.id); sim.choose(o.includes('letgo') ? 'letgo' : o.includes('wait') ? 'wait' : o[0]); continue; }
      sim.update(0.05, 4);
    }
    if (!expect[d].every(k => seen.has(k))) missing++;
  }
  if (missing) { bad++; console.log(`第 ${d + 1} 天：最消极的玩法下 ${missing}/${runs} 局没出现该有的小关卡`); }
}
console.log(bad ? `${bad} 天有问题` : `7 天 × 200 局，最消极的玩法下每天的小关卡都会出现`);
process.exit(bad ? 1 : 0);
