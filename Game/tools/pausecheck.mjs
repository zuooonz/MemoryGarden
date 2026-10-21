// 暂停检查：不开浏览器。玩家按暂停后，规则层、关卡里的对白节拍、画面里的人都不再往前走（10-13 用户：暂停后爷爷仍在滑行、剧情仍在推进）。
// 用法：node tools/pausecheck.mjs（有问题以状态 1 退出）
// 1 规则层：一天里多处“暂停一会儿”（倍速 0），这期间时钟、他的位置、事件流一点不变
// 2 按真实时间走的定时器（util.pauseTimeout／pauseInterval，关卡与地图示范用）：暂停时不触发，继续后按剩下的时间触发
// 3 代码约定：每帧的人物、车、路人按暂停给 0；暂停时只有顶栏、设置能点；关卡定时器不直接用 setTimeout／setInterval；暂停键同时停这些定时器；讲往事时点顶栏不算跳过
import fs from 'node:fs';
import path from 'node:path';
import { runDay } from './storyrun.mjs';
import { pauseTimeout, pauseInterval, pauseTimers, clearPause } from '../src/util.js';

const src = path.join(path.dirname(new URL(import.meta.url).pathname), '../src');
const read = (f) => fs.readFileSync(path.join(src, f), 'utf8');
const bad = [];
const ok = (cond, msg) => { if (!cond) bad.push(msg); };

// ---- 1 规则层 ----
let seed = 7;
Math.random = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
let windows = 0;
for (const day of [0, 2, 4]) {
  let snap = null;
  runDay(day, { policy: '消极', seed: 1, onStep: (sim, i) => {
    const inPause = i % 150 >= 110;   // 每 150 步里最后 40 步（2 秒真实时间）是暂停
    if (inPause && !snap) snap = { t: sim.time, x: sim.e.pos.x, z: sim.e.pos.z, n: sim.events.length, mode: sim.e.mode };
    if (inPause && snap && !sim.moment) {
      const moved = sim.time !== snap.t || sim.e.pos.x !== snap.x || sim.e.pos.z !== snap.z || sim.events.length !== snap.n || sim.e.mode !== snap.mode;
      if (moved && bad.length < 8) bad.push(`规则层：第 ${day + 1} 天暂停中仍在走（${Math.round(snap.t)} 分 → ${Math.round(sim.time)} 分，事件 ${snap.n} → ${sim.events.length}，${snap.mode} → ${sim.e.mode}）`);
      snap = { t: sim.time, x: sim.e.pos.x, z: sim.e.pos.z, n: sim.events.length, mode: sim.e.mode };
    }
    if (!inPause && snap) { snap = null; windows++; }
    return inPause ? 0 : 4;
  } });
}
ok(windows >= 9, `规则层：暂停窗口太少（${windows}），检查没覆盖到`);

// ---- 2 定时器 ----
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
{
  let fired = 0, ticks = 0;
  const t0 = performance.now(); let firedAt = 0;
  pauseTimeout(() => { fired++; firedAt = performance.now(); }, 200);
  const iv = pauseInterval(() => { ticks++; }, 50);
  await sleep(100); pauseTimers(true);
  const ticksAtPause = ticks;
  await sleep(300);
  ok(fired === 0, '定时器：暂停中触发了（关卡里的话会在暂停时接着往下走）');
  ok(ticks === ticksAtPause, `定时器：暂停中循环定时器还在走（${ticksAtPause} → ${ticks}）`);
  const resumeAt = performance.now(); pauseTimers(false);
  await sleep(250);
  ok(fired === 1, `定时器：继续后没有触发（${fired} 次）`);
  const after = firedAt - resumeAt;
  ok(after > 60 && after < 180, `定时器：继续后应按剩下约 100 毫秒触发，实际 ${Math.round(after)} 毫秒`);
  ok(firedAt - t0 >= 450, '定时器：总用时没有把暂停的时间算进去');
  ok(ticks > ticksAtPause, '定时器：继续后循环定时器没恢复');
  clearPause(iv); const n = ticks; await sleep(120);
  ok(ticks === n, '定时器：clearPause 之后循环定时器还在走');
  const h = pauseTimeout(() => { fired++; }, 30); clearPause(h); await sleep(60);
  ok(fired === 1, '定时器：clearPause 之后单次定时器还触发了');
}

// ---- 3 代码约定 ----
const main = read('main.js'), kit = read('game-kit.js'), hud = read('hud.js'), flow = read('flow.js'), core = read('core.js'), mapops = read('mapops.js');
ok(/updatePeople\(paused \? 0 : dt/.test(main), 'main.js：暂停时人物（爷爷、孙女、邻居）应按 0 更新');
ok(/lifeDt = dt \* \(run\.speed === 0 && sim\.phase === 'live' \? 0/.test(main), 'main.js：暂停时路人与车应按 0 更新');
ok(/if \(run\.speed === 0 && sim\.phase === 'live'\) return;/.test(core), 'core.js：tickLater 暂停时应不计时');
const kitTimers = kit.split('\n').filter(l => /export function (later|every)\b/.test(l));
ok(kitTimers.length === 2 && kitTimers.every(l => !/setTimeout|setInterval/.test(l)), 'game-kit.js：关卡的 later／every 不能直接用 setTimeout／setInterval（暂停时不会停）');
ok(/pauseTimers\(paused\)/.test(hud) && /setPaused\(false\); pauseTimers\(false\)/.test(hud), 'hud.js：暂停／离开当天时应同时停／恢复关卡定时器');
ok((flow.match(/closest\?\.\('#hudR, #modal'\)/g) || []).length >= 2, 'flow.js：讲往事时点暂停、设置等顶栏按钮不能算“点画面跳过”');
ok(!/setTimeout\((stepPen|demo)/.test(mapops), 'mapops.js：地图示范的笔应在暂停时停住');
// 输入：暂停时只留顶栏、目标面板、设置／手册（hud.guardPause）；画面上点选在 main.onTap 里拦
ok(/const PAUSE_OK = '#hudR, #topSheet, #gp, #modal'/.test(hud) && /\['pointerdown', 'pointerup', 'click'/.test(hud) && /guardPause\(\);/.test(hud), 'hud.js：暂停时应拦下顶栏、设置以外的点按（关卡、连线、道具、电话）');
ok(/function onTap\(x, y\) \{\n  initAudio\(\);\n  if \(pausedNow\(\)\)/.test(main), 'main.js：暂停时画面上点地方、点人应不响应');
for (const f of fs.readdirSync(src).filter(f => /^games-.*\.js$/.test(f))) {
  const s = read(f);
  if (/\bset(Timeout|Interval)\(/.test(s)) bad.push(`${f}：关卡里直接用了 setTimeout／setInterval，暂停时不会停——改用 game-kit 的 later／every`);
  if (/\bclear(Timeout|Interval)\(/.test(s)) bad.push(`${f}：later／every 的句柄要用 game-kit 的 stop() 停`);
}

console.log(bad.length ? '暂停检查没通过：\n  ' + bad.join('\n  ') : `暂停检查通过（规则层 ${windows} 段暂停、定时器、代码约定）`);
process.exit(bad.length ? 1 : 0);
