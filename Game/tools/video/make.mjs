// 一条命令生成提交／宣传视频：按顺序录 scenes/ 里的各段（存档一段接一段，结局用的是这一周真实的结果），
// 再转场拼接、统一响度、按体积上限压缩，输出到 release/。
//
// 用法（在 Game/ 下）：
//   node tools/video/make.mjs                                   录制 dist/index.html，输出 release/爷爷的一周_<日期>.mp4
//   node tools/video/make.mjs --html release/xxx.html           录制指定版本；视频与素材按 html 同名
//   node tools/video/make.mjs --html ... --reuse                已录好的段落不重录，只重新拼接（改了字幕以外的剪辑参数时用）
//   node tools/video/make.mjs --html ... --only 3_day3,6_day6   只重录这几段（其余沿用已有素材）
//   --max-mb 190   视频体积上限（赛事上传限 200 MiB）
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { record } from './record.mjs';

const here = path.dirname(new URL(import.meta.url).pathname);
const game = path.resolve(here, '../..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const html = path.resolve(game, opt('html', 'dist/index.html'));
const today = new Date().toLocaleDateString('sv-SE');   // 本地日期 YYYY-MM-DD（不用 UTC，免得晚上差一天）
const base = opt('name', path.basename(html) === 'index.html' ? `爷爷的一周_${today}` : path.basename(html, '.html'));
const outDir = path.resolve(game, opt('out', 'release'));
const work = path.join(outDir, base + '_视频素材');
const maxMB = +opt('max-mb', 190);
const reuse = !!opt('reuse', false);
const only = opt('only', '') ? String(opt('only')).split(',') : null;
const XF = 0.6;   // 段与段之间的转场（秒）

const sh = (cmd, a) => new Promise((ok, no) => { const p = spawn(cmd, a, { stdio: ['ignore', 'inherit', 'inherit'] }); p.on('close', c => c ? no(new Error(cmd + ' 失败 ' + c)) : ok()); });
const probe = (f) => new Promise(ok => { let o = ''; const p = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]); p.stdout.on('data', b => o += b); p.on('close', () => ok(+o)); });

fs.mkdirSync(work, { recursive: true });
const scenes = fs.readdirSync(path.join(here, 'scenes')).filter(f => /^\d+_.+\.mjs$/.test(f)).sort();
console.log(`版本：${path.relative(game, html)}\n输出：${path.relative(game, outDir)}/${base}.mp4\n段落：${scenes.join(' ')}`);

// 1. 录制（顺序进行：下一段从上一段结束时的存档接着玩）
let save = null;
for (const f of scenes) {
  const name = f.replace('.mjs', ''), dir = path.join(work, name);
  const have = fs.existsSync(path.join(dir, 'clip.mp4'));
  const redo = only ? only.includes(name) : !(reuse && have);
  if (redo) {
    fs.rmSync(dir, { recursive: true, force: true });
    const info = await record(path.join(here, 'scenes', f), dir, html, save ? { save } : {});
    if (info.errors.length) console.log(`  ⚠ ${name} 页面报错：\n  ` + info.errors.join('\n  '));
  } else console.log(`[${name}] 沿用已录素材`);
  try { save = JSON.parse(fs.readFileSync(path.join(dir, 'save.json'), 'utf8')); } catch { save = null; }
}

// 2. 拼接：视频交叉淡化、声音交叉淡入淡出
const clips = scenes.map(f => path.join(work, f.replace('.mjs', ''), 'clip.mp4'));
const durs = []; for (const c of clips) durs.push(await probe(c));
let vf = '', af = '', vPrev = '[0:v]', aPrev = '[0:a]', off = 0;
for (let i = 1; i < clips.length; i++) {
  off += durs[i - 1] - XF;
  vf += `${vPrev}[${i}:v]xfade=transition=fade:duration=${XF}:offset=${off.toFixed(3)}[v${i}];`;
  af += `${aPrev}[${i}:a]acrossfade=d=${XF}[a${i}];`;
  vPrev = `[v${i}]`; aPrev = `[a${i}]`;
}
const total = durs.reduce((a, b) => a + b, 0) - XF * (clips.length - 1);
// 片头淡入、片尾淡出；响度统一到 -16 LUFS（网络视频常用）
const graph = `${vf}${vPrev}fade=t=in:d=0.6,fade=t=out:st=${(total - 1.2).toFixed(2)}:d=1.2,format=yuv420p[vo];${af}${aPrev}afade=t=in:d=0.4,afade=t=out:st=${(total - 1.2).toFixed(2)}:d=1.2,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[ao]`;
const mezz = path.join(work, '_拼接.mkv');
await sh('ffmpeg', ['-y', '-loglevel', 'error', ...clips.flatMap(c => ['-i', c]), '-filter_complex', graph, '-map', '[vo]', '-map', '[ao]', '-c:v', 'h264_nvenc', '-preset', 'p6', '-rc', 'vbr', '-cq', '14', '-b:v', '0', '-c:a', 'pcm_s16le', mezz]);

// 3. 成片：两遍编码，按体积上限算码率（上限 12 Mbps）
const aK = 192, vK = Math.min(12000, Math.floor(maxMB * 8 * 1024 * 0.97 / total - aK));
const final = path.join(outDir, base + '.mp4');
const pass = path.join(work, '_pass');
await sh('ffmpeg', ['-y', '-loglevel', 'error', '-i', mezz, '-c:v', 'libx264', '-preset', 'slow', '-b:v', vK + 'k', '-pass', '1', '-passlogfile', pass, '-an', '-f', 'mp4', '/dev/null']);
await sh('ffmpeg', ['-y', '-loglevel', 'error', '-i', mezz, '-c:v', 'libx264', '-preset', 'slow', '-b:v', vK + 'k', '-pass', '2', '-passlogfile', pass, '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', aK + 'k', '-movflags', '+faststart', final]);
for (const f of fs.readdirSync(work)) if (f.startsWith('_pass')) fs.rmSync(path.join(work, f));

// 4. 封面：片头片名那一刻
await sh('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '4', '-i', final, '-frames:v', '1', path.join(outDir, base + '_封面.png')]);
const mb = fs.statSync(final).size / 1048576;
console.log(`\n完成：${path.relative(game, final)}  ${Math.floor(total / 60)} 分 ${Math.round(total % 60)} 秒，${mb.toFixed(1)} MiB（视频 ${vK} kbps）\n素材（各段视频、声音、静帧、存档）：${path.relative(game, work)}/`);
