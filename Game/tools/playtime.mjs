// 估算真人游玩时长：包含自动快进、每个犹豫时刻 8 秒阅读、每天布置 40 秒与结算 25 秒
import { buildGraph } from '../src/town.js';
import { Sim } from '../src/sim.js';
import { DAYS } from '../src/data.js';
const graph = buildGraph();
const speedFor = (d) => (process.argv[2] ? +process.argv[2] : d === 0 ? 1 : 2);
let total = 0;
for (let d = 0; d < DAYS.length; d++) {
  let secs = 0, runs = 20;
  for (let seed = 1; seed <= runs; seed++) {
    const persist = { signs: new Set([24, 11]), photos: new Set(), home: new Set(['pillbox']), neighbors: new Set(['wang']) };
    let done = false; const sim = new Sim(graph, persist, { end: () => { done = true; }, minigame: (k, m, cb) => cb(1, { hit: 4 }) });
    sim.startDay(d, seed); sim.begin();
    let t = 40 + 25;
    for (let i = 0; i < 100000 && !done; i++) {
      if (sim.moment) { t += 8; const o = sim.momentOptions().map(x => x.id); sim.choose(['cue', 'tell'].find(x => o.includes(x))); continue; }
      const e = sim.e, nextG = sim.goals.find(g => g.status === 'pending');
      let ff = 1;
      if (e.mode === 'home' && (!nextG || nextG.at - sim.time > 12)) ff = 6;
      else if (e.mode === 'task' && e.after === 'goHome' && e.taskT > 8) ff = 4;
      sim.update(0.05, speedFor(d) * ff); t += 0.05;
    }
    secs += t;
  }
  const avg = secs / runs; total += avg;
  console.log(`D${d + 1} ${(avg / 60).toFixed(1)} min`);
}
// 规则模拟里没有的部分（按一轮真人试玩估的秒数，09-27 补）：开场、每天简介、小关卡、讲往事、结局
const EXTRA = { 开场: 30, 每天简介: 7 * 15, 小关卡: 60 + 50 + 30 + 40 + 60 + 70 + 60 + 120 + 70, 讲往事: 7 * 30, 结局与记忆页: 90 };
const extra = Object.values(EXTRA).reduce((a, b) => a + b, 0);
console.log(`走路与布置 ${(total / 60).toFixed(1)} min；另加 ${Object.entries(EXTRA).map(([k, v]) => `${k} ${Math.round(v / 6) / 10}`).join('、')} min`);
console.log(`total ${((total + extra) / 60).toFixed(1)} min`);
