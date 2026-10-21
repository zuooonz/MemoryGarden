// 3D 画面比对与性能上限：改光影、颜色、模型前后，逐天拍几个关键场景（只拍 3D，界面层隐藏），找出画面被改坏（全黑、闪烁、穿帮、夜里看不清）的地方；
// 同时在这些场景里取样每帧的绘制次数、三角面数、帧耗时，超过上限就不通过（改光影最容易让手机变卡）。uidiff 只比界面层、看不到这些。
// 用法（在 Game/ 下）：
//   node tools/scenecheck.mjs shoot <目录> [天，如 1,3]   用 dist/index.html 拍一套：精美、流畅两档 × 7 天（每天 4 个时段的俯视；第 1 天路口的车，第 2、7 天下雨，第 3 天健步走、接孙女）
//   node tools/scenecheck.mjs diff <基准目录> <新目录>      逐张比较，列出不一样的（差异占比、平均亮度变化），并在新目录生成 _diff_*.png（差异处标红）；LV＝灰度差门槛（默认 1），TOL＝允许不同的像素数（默认 0）
//   node tools/scenecheck.mjs perf <目录> [--update]        按 tools/scenecheck/perflimit.json 检查性能；--update 按这次的数值 ×1.25 重定上限（有意加了东西、确认值得时才用）
// 基准放 snapshots/scenebase（不进版本库）：改了画面且确认是想要的样子后，重拍基准。时间、随机数、镜头都固定，同一版本两次拍摄完全一致。
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { record } from './video/record.mjs';

const here = path.dirname(new URL(import.meta.url).pathname);
const [cmd, a, b] = process.argv.slice(2);
const TIERS = [['fine', 3, '精美'], ['fast', 1, '流畅']];   // 设置里的画面档位：3 精美、1 流畅（“标准”介于两者之间，不单拍）
// 960×540、2 倍像素：横屏电脑的取景；2 倍像素让“精美”按 2 倍、“流畅”按 1 倍渲染，两档的像素开销差别量得出来
const VIEW = { w: 960, h: 540, dpr: 2, noHover: true };
const LIMIT = path.join(here, 'scenecheck/perflimit.json'), MARGIN = 1.25;
const LIVE = /_(hike|kid)(\.png)?$/;   // 真玩到那一刻、镜头跟着人走的场景：画面随规则变，不进性能上限（性能只看固定镜头的场景，10-06）
process.setMaxListeners(40);   // record 每拍一天挂一组退出处理（14 次），不是泄漏

if (cmd === 'shoot') {
  const days = (b || '1,2,3,4,5,6,7').split(',').map(Number);
  for (const [tag, gfx] of TIERS) for (const d of days) {
    const out = path.join(a, tag, 'd' + d);
    Object.assign(process.env, { SC_DAY: String(d), SC_GFX: String(gfx) });
    fs.rmSync(out, { recursive: true, force: true });
    const info = await record(path.join(here, 'scenecheck/day.mjs'), out, path.resolve(here, '../dist/index.html'), VIEW);
    if (info.errors.length) console.log(`${tag}/d${d} 页面报错：\n  ` + info.errors.slice(0, 5).join('\n  '));
    for (const f of ['audio.wav', 'save.json', 'info.json']) fs.rmSync(path.join(out, f), { force: true });
  }
  console.log('拍摄完成：', a);
} else if (cmd === 'diff') {
  let bad = 0, n = 0, minor = 0;
  const TOL = +(process.env.TOL || 0), LV = +(process.env.LV || 1);   // 同一版本连拍两次逐像素一致（10-06 核对），默认不留容差；显卡、驱动换了可临时放宽（TOL＝允许不同的像素数）
  for (const [tag] of TIERS) for (const dd of fs.existsSync(path.join(a, tag)) ? fs.readdirSync(path.join(a, tag)).sort() : []) for (const f of fs.readdirSync(path.join(a, tag, dd)).filter(f => f.endsWith('.png') && !f.startsWith('_'))) {
    n++;
    const rel = path.join(tag, dd, f), A = path.join(a, rel), B = path.join(b, rel);
    if (!fs.existsSync(B)) { console.log(`✗ ${rel}：新目录里没有`); bad++; continue; }
    // 逐像素比较（灰度差 > LV 算不同）；尺寸不同直接算不一样
    // LV 默认 1（界面比对用 6）：3D 画面整体调光，大片只差 2—6 级灰度（10-06 试过把正午阳光 2.5 改 2.3，差最多 6 级），门槛高了就看不出来
    const r = spawnSync('ffmpeg', ['-v', 'error', '-i', A, '-i', B, '-filter_complex', '[0][1]blend=all_mode=difference,format=gray', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 1 << 26 });
    let diff = r.status ? -1 : 0, big = 0; if (!r.status) for (const v of r.stdout) { if (v > LV) diff++; if (v > 40) big++; }
    if (diff === 0) continue;
    const live = LIVE.test(f);   // 跟着人走的镜头：规则改了（他走的路、时刻变了）画面就会变，看图确认后更新基准
    if (diff > 0 && diff <= TOL) { minor++; continue; }
    bad++;
    // 平均亮度：一眼看出是整体变暗／变亮（夜里看不清、全黑），还是局部的东西变了（big：差得很明显的像素）
    const lum = (f) => { const o = spawnSync('ffmpeg', ['-v', 'error', '-i', f, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 1 << 26 }).stdout; let s = 0; for (const v of o) s += v; return o.length ? Math.round(s / o.length) : 0; };
    const px = r.stdout.length;
    console.log(`✗ ${rel}${live ? '（跟着人走：规则改了会跟着变，看图确认）' : ''}：${diff < 0 ? '尺寸不同' : `${(diff / px * 100).toFixed(1)}% 的像素不同（明显不同 ${(big / px * 100).toFixed(1)}%），平均亮度 ${lum(A)} → ${lum(B)}`}`);
    spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', A, '-i', B, '-filter_complex',
      `[0][1]blend=all_mode=difference,format=gray,geq=lum='if(gt(lum(X,Y),${LV}),255,0)'[d];[1]format=gray,format=rgb24[g];[d]format=rgb24,colorchannelmixer=rr=1:gg=0:bb=0[r];[g][r]blend=all_mode=lighten`, path.join(b, tag, dd, '_diff_' + f)]);
  }
  if (!n) { console.log('基准目录里没有画面：', a); process.exit(1); }
  console.log((bad ? `${bad}/${n} 张不一样（红色是差异处：${b}/*/*/_diff_*.png）` : `全部 ${n} 张一致`) + (minor ? `（其中 ${minor} 张只差不超过 ${TOL} 个像素，视为一致）` : ''));
  process.exit(bad ? 1 : 0);
} else if (cmd === 'perf') {
  // 汇总：每档、每个场景 30 帧里最多的绘制次数、三角面数、帧耗时中位数；每档各场景中位数的平均、最慢的一个场景（单帧最慢受系统调度影响太大，只打印不设限）
  const now = {};
  for (const [tag, , name] of TIERS) {
    const dir = path.join(a, tag); if (!fs.existsSync(dir)) continue;
    const t = now[tag] = { name, scenes: {}, ms: { avg: 0, slowScene: 0, worstFrame: 0 } }; let sum = 0, cnt = 0;
    for (const dd of fs.readdirSync(dir).sort()) {
      const f = path.join(dir, dd, 'perf.json'); if (!fs.existsSync(f)) continue;
      for (const [sc, frames] of Object.entries(JSON.parse(fs.readFileSync(f, 'utf8')))) {
        if (LIVE.test(sc)) continue;
        const ms = frames.map(x => x[2]), m = [...ms].sort((p, q) => p - q)[ms.length >> 1];   // 取中位数：偶尔一帧被系统调度、另一个浏览器抢走，不该把整个场景算慢
        t.scenes[sc] = { calls: Math.max(...frames.map(x => x[0])), tris: Math.max(...frames.map(x => x[1])), ms: +m.toFixed(2) };
        sum += m; cnt++; t.ms.slowScene = Math.max(t.ms.slowScene, +m.toFixed(2)); t.ms.worstFrame = Math.max(t.ms.worstFrame, ...ms);
      }
    }
    t.ms.avg = +(sum / cnt).toFixed(2);
  }
  if (!Object.keys(now).length) { console.log('目录里没有性能取样：', a); process.exit(1); }
  for (const t of Object.values(now)) {
    const sc = Object.values(t.scenes);
    console.log(`${t.name}：${sc.length} 个场景，绘制 ${Math.min(...sc.map(s => s.calls))}—${Math.max(...sc.map(s => s.calls))} 次/帧，\
三角面 ${(Math.min(...sc.map(s => s.tris)) / 1000).toFixed(0)}k—${(Math.max(...sc.map(s => s.tris)) / 1000).toFixed(0)}k，帧耗时平均 ${t.ms.avg} 毫秒（最慢的场景 ${t.ms.slowScene}，单帧最慢 ${t.ms.worstFrame}）`);
      
  }
  if (process.argv.includes('--update') || !fs.existsSync(LIMIT)) {
    const lim = {};
    // 上限旁边记下定上限时的实测值（now），以后看得出余量还剩多少；每个场景一行，改动时 git diff 好读
    for (const [tag, t] of Object.entries(now)) lim[tag] = { name: t.name, ms: { avg: +(t.ms.avg * MARGIN).toFixed(2), slowScene: +(t.ms.slowScene * MARGIN).toFixed(2), now: t.ms },
      scenes: Object.fromEntries(Object.entries(t.scenes).map(([k, s]) => [k, { calls: Math.ceil(s.calls * MARGIN), tris: Math.ceil(s.tris * MARGIN), now: [s.calls, s.tris, s.ms] }])) };
    fs.writeFileSync(LIMIT, JSON.stringify(lim, null, 1).replace(/\{\n\s+"calls": (\d+),\n\s+"tris": (\d+),\n\s+"now": \[\n\s+(\d+),\n\s+(\d+),\n\s+([\d.]+)\n\s+\]\n\s+\}/g,
      '{ "calls": $1, "tris": $2, "now": [$3, $4, $5] }').replace(/"now": \{\n\s+"avg": ([\d.]+),\n\s+"slowScene": ([\d.]+),\n\s+"worstFrame": ([\d.]+)\n\s+\}/g, '"now": { "avg": $1, "slowScene": $2, "worstFrame": $3 }') + '\n');
    console.log(`已按当前值 ×${MARGIN} 写上限：${path.relative(process.cwd(), LIMIT)}`); process.exit(0);
  }
  const lim = JSON.parse(fs.readFileSync(LIMIT, 'utf8')), over = [], warn = [];
  for (const [tag, t] of Object.entries(now)) {
    const L = lim[tag]; if (!L) { over.push(`${t.name}：上限表里没有这一档`); continue; }
    for (const [sc, s] of Object.entries(t.scenes)) {
      const l = L.scenes[sc]; if (!l) { over.push(`${t.name} ${sc}：上限表里没有这个场景（新加场景后用 --update 重定）`); continue; }
      if (s.calls > l.calls) over.push(`${t.name} ${sc}：绘制 ${s.calls} 次/帧，上限 ${l.calls}`);
      if (s.tris > l.tris) over.push(`${t.name} ${sc}：三角面 ${s.tris}，上限 ${l.tris}`);
    }
    // 帧耗时：同一份代码、同一台机器，不同时间能差约 40%（10-07 实测 main 1.63→2.34 毫秒）——超上限 2 倍才算不通过（真变慢，如 10-07 路人每帧逐点查路线，5.2 毫秒）；1—2 倍只提醒
    for (const [v, l, nm] of [[t.ms.avg, L.ms.avg, '帧耗时平均'], [t.ms.slowScene, L.ms.slowScene, '最慢的场景']]) {
      if (v > l * 2) over.push(`${t.name}：${nm} ${v} 毫秒，超过上限 ${l} 的 2 倍`);
      else if (v > l) warn.push(`${t.name}：${nm} ${v} 毫秒，比上限 ${l} 高（未到 2 倍，可能是机器状态；要确认就在 main 上同时重测对比）`);
    }
  }
  if (warn.length) console.log('提醒：\n  ' + warn.join('\n  '));
  if (over.length) {
    console.log('超过性能上限：\n  ' + over.join('\n  '));
    // 绘制次数、三角面数每次都一样，超了就是真变多了；帧耗时是本机实测，同时有别的浏览器在用显卡也会变慢——只超帧耗时的，先单独重拍一次确认
    if (over.every(o => /毫秒/.test(o))) console.log('（只有帧耗时超了：先确认没有别的无头浏览器在跑，再单独 shoot＋perf 重测一次）');
    process.exit(1);
  }
  console.log('性能都在上限内');
} else console.log('用法：node tools/scenecheck.mjs shoot <目录> [天] | diff <基准目录> <新目录> | perf <目录> [--update]');
