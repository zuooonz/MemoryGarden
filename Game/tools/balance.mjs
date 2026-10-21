// 无头平衡测试：布置策略 × 时刻策略，统计每天结果分布（不含主动电话／陪同）
import { buildGraph } from '../src/town.js';
import { Sim } from '../src/sim.js';

const graph = buildGraph();
const strategies = JSON.parse(process.argv[2] || '{"none":{}}');
const dayIdx = +(process.argv[3] || 0);
const policy = (process.argv[4] || 'wait,cue,tell').split(',');
for (const [name, st] of Object.entries(strategies)) {
  const agg = { stars: [0, 0, 0], all3: 0, done: 0, self: 0, mood: 0, lost: 0, stuck: 0, moments: 0, n: 300 };
  for (let seed = 1; seed <= agg.n; seed++) {
    const persist = { signs: new Set(st.signs || []), photos: new Set(st.photos || []), home: new Set(st.home || []), neighbors: new Set(st.neighbors || []) };
    let score = null;
    const sim = new Sim(graph, persist, { end: (s) => { score = s; }, level: (n, dt, f) => f(n === 'trail' ? { path: [18, 12] } : { q: 1, correct: 3, right: 7, outcome: 'self', caught: 4 }), minigame: (k, m, cb) => cb(Math.random() < 0.6 ? 1 : 0.5, { hit: 2 }) });
    sim.startDay(dayIdx, seed); sim.begin();
    for (let i = 0; i < 40000 && !score; i++) {
      if (sim.moment) {
        agg.moments++;
        const opts = sim.momentOptions().map(o => o.id);
        const pick = policy.find(p => opts.includes(p)) || 'letgo';
        sim.choose(pick);
        continue;
      }
      sim.update(0.05, 4);
    }
    if (!score) { console.log('no end', name, seed); continue; }
    agg.done += score.doneRatio; agg.self += score.autonomy; agg.mood += score.mood;
    const s3 = score.stars; agg.stars[0] += s3.done; agg.stars[1] += s3.auto; agg.stars[2] += s3.mood; agg.all3 += s3.done && s3.auto && s3.mood;
    agg.lost += score.log.some(l => l.msg.includes('迷路')); agg.stuck += score.log.some(l => l.msg.includes('停了下来'));
  }
  const n = agg.n, pc = x => (x / n * 100).toFixed(0) + '%';
  console.log(name.padEnd(12), `done ${pc(agg.done)} self ${(agg.self / n).toFixed(0)} mood ${(agg.mood / n).toFixed(0)} | ★ ${agg.stars.map(pc).join(' ')} 3★ ${pc(agg.all3)} | lost ${pc(agg.lost)} stuck ${pc(agg.stuck)} mom ${(agg.moments / n).toFixed(1)}`);
}
