// 规则层结果快照：不开浏览器，固定随机种子，7 天 × 几种玩法跑完，记下每天的星级、心情、办成情况，与基准对比。
// 用法（在 Game/ 下）：
//   node tools/simsnap.mjs            与基准 tools/simsnap.json 对比；有变化就逐条列出并以状态 1 退出
//   node tools/simsnap.mjs --update   有意改了规则、确认变化合理后，更新基准
// 用来发现“规则或数值被改错”——回归测试只保证能走完一天，不校验结果。
import fs from 'node:fs';
import path from 'node:path';
import { runDay, POLICIES, getGraph } from './storyrun.mjs';
import { DAYS } from '../src/data.js';

const here = path.dirname(new URL(import.meta.url).pathname);
const file = path.join(here, 'simsnap.json');
// 固定 Math.random（规则层个别地方用到）
let seed = 12345;
Math.random = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const graph = getGraph();
// 另查：行走时位置始终在道路上（不斜穿街区）
const segD = (p, a, b) => { const abx = b.x - a.x, abz = b.z - a.z, t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / (abx * abx + abz * abz))); return Math.hypot(p.x - a.x - abx * t, p.z - a.z - abz * t); };
const onRoad = (p) => { for (let i = 0; i < graph.adj.length; i++) for (const j of graph.adj[i]) if (segD(p, graph.pos[i], graph.pos[j]) < 0.05) return true; return false; };
const offRoad = [];
const round = (x) => typeof x === 'number' ? Math.round(x * 10) / 10 : x;
const result = {};
for (const pname of Object.keys(POLICIES)) {
  for (let d = 0; d < DAYS.length; d++) {
    seed = 1000 + d;
    const { sim, score } = runDay(d, { policy: pname, seed: 1, onStep: (sim) => { if (sim.e.mode === 'walk' && !onRoad(sim.e.pos) && offRoad.length < 5) offRoad.push(`${pname}·第${d + 1}天 ${Math.round(sim.time)}分 (${sim.e.pos.x.toFixed(1)},${sim.e.pos.z.toFixed(1)})`); } });
    const s = score || {};
    result[`${pname}·第${d + 1}天`] = score ? {
      星: Object.values(s.stars || {}).filter(Boolean).length, 心情: round(s.mood), 办成: round(s.doneRatio), 自己: s.autonomy,
      帮助: s.helps ? Object.fromEntries(Object.entries(s.helps).filter(([, v]) => v)) : {},
      目标: (s.goals || []).map(g => `${g.id || g.task}:${g.status}${g.helped ? '·帮' : ''}`).join(' '),
    } : { 没走完: true, 时间: Math.round(sim.time) };
  }
}
if (offRoad.length) { console.log('行走时离开了道路（斜穿街区）：\n  ' + offRoad.join('\n  ')); process.exit(1); }
if (process.argv.includes('--update') || !fs.existsSync(file)) {
  fs.writeFileSync(file, JSON.stringify(result, null, 1));
  console.log(`已写入基准 ${path.relative(process.cwd(), file)}（${Object.keys(result).length} 组）`);
  process.exit(0);
}
const base = JSON.parse(fs.readFileSync(file, 'utf8'));
const diffs = [];
for (const k of new Set([...Object.keys(base), ...Object.keys(result)])) {
  const a = JSON.stringify(base[k]), b = JSON.stringify(result[k]);
  if (a !== b) diffs.push(`${k}\n  基准：${a}\n  现在：${b}`);
}
if (diffs.length) { console.log(diffs.join('\n')); console.log(`\n规则结果有 ${diffs.length} 组变化。若是有意改的规则，确认合理后用 --update 更新基准。`); process.exit(1); }
console.log(`规则结果与基准一致（${Object.keys(result).length} 组）`);
