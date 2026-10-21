// 看得清他（10-10，画面可读性）：傍晚、夜里、雨加浓雾时，爷爷和他身后背景的亮度差——量的是“他本人”，不算脚下的圈。
// 做法（tools/scenecheck/elder.mjs）：布置阶段把他摆到有雾片的街角，镜头按游戏里走路时的远近（电脑 52，近景 34）；每个场景拍三张——
//   A 正常、B 把他藏起来（他身后的背景）、C 把他涂成纯品红（他身上有哪些像素，与光照无关）。
//   亮度差＝他身上每个像素在 A 与 B 里的灰度差的平均（0—255）：人和背景一样暗、或被雾抹平，这个数就小。
// 用法（在 Game/ 下，先 node build.mjs）：node tools/elderlook.mjs [目录]——拍精美、流畅两档 × 第 4 天，逐场景打印亮度差，低于门槛就不通过；
//   不指定目录时用临时目录、都通过就删掉；目录里留下 <档>/<场景>_A/B/C.png 和 _crop_<场景>.png（他附近放大，看图用）。只拍一档：EL_TIERS=fine。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { record } from './video/record.mjs';
import { SCENES } from './scenecheck/elder.mjs';

const here = path.dirname(new URL(import.meta.url).pathname);
const dir = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mg-elder-'));
const TIERS = [['fine', 3, '精美'], ['fast', 1, '流畅']].filter(t => !process.env.EL_TIERS || process.env.EL_TIERS.split(',').includes(t[0]));
const VIEW = { w: 960, h: 540, dpr: 2, noHover: true };   // 与 scenecheck 同一取景
// 门槛（10-10 定）：正午实测 44—48（白天公认看得清）；傍晚原来 22—28 也算看得清——门槛 20，约为正午的四成。
// 10-10 改光前：夜里 4.5—6.2、雨夜 4—8、浓雾在他前面 16—18 都不通过；改后见 Logs/状态.md
const MIN = 20;
process.setMaxListeners(40);

const rgb = (f) => { const r = spawnSync('ffmpeg', ['-v', 'error', '-i', f, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 27 }); if (r.status) throw new Error('读不了 ' + f); return r.stdout; };
const L = (b, i) => 0.299 * b[i] + 0.587 * b[i + 1] + 0.114 * b[i + 2];
const W = VIEW.w * VIEW.dpr;

const res = {}; let bad = [];
for (const [tag, gfx, name] of TIERS) {
  const out = path.join(dir, tag);
  fs.rmSync(out, { recursive: true, force: true });
  Object.assign(process.env, { SC_GFX: String(gfx), EL_DAY: process.env.EL_DAY || '4' });
  const info = await record(path.join(here, 'scenecheck/elder.mjs'), out, path.resolve(here, '../dist/index.html'), VIEW);
  if (info.errors.length) console.log(`${tag} 页面报错：\n  ` + info.errors.slice(0, 5).join('\n  '));
  for (const f of ['audio.wav', 'save.json', 'info.json']) fs.rmSync(path.join(out, f), { force: true });
  res[tag] = {};
  for (const [sc] of SCENES) {
    const A = rgb(path.join(out, sc + '_A.png')), B = rgb(path.join(out, sc + '_B.png')), C = rgb(path.join(out, sc + '_C.png'));
    let n = 0, d = 0, la = 0, lb = 0, x0 = 1e9, y0 = 1e9, x1 = 0, y1 = 0;
    for (let i = 0; i < C.length; i += 3) {
      if (C[i] - C[i + 1] < 90 || C[i + 2] - C[i + 1] < 90) continue;   // 品红（雾片、雨丝盖在前面会冲淡一点，放宽）
      const a = L(A, i), b = L(B, i); n++; d += Math.abs(a - b); la += a; lb += b;
      const p = i / 3, x = p % W, y = (p - x) / W; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    const r = res[tag][sc] = n ? { diff: +(d / n).toFixed(1), elder: Math.round(la / n), back: Math.round(lb / n), px: n } : { diff: 0, px: 0 };
    if (n) {   // 他附近放大一张（4 倍高的方框），看图用
      const h = (y1 - y0) * 4, cx = (x0 + x1) >> 1, cy = (y0 + y1) >> 1, w = Math.round(h * 1.4);
      spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', path.join(out, sc + '_A.png'), '-vf', `crop=${w}:${h}:${Math.max(0, cx - w / 2)}:${Math.max(0, cy - h / 2)},scale=-1:400:flags=neighbor`, path.join(out, `_crop_${sc}.png`)]);
    }
    const ok = r.diff >= MIN;
    if (!ok) bad.push(`${name} ${sc}`);
    console.log(`${ok ? '✓' : '✗'} ${name} ${sc}：亮度差 ${r.diff}（他 ${r.elder}／身后 ${r.back}，${r.px} 像素）`);
  }
}
fs.writeFileSync(path.join(dir, 'elderlook.json'), JSON.stringify(res, null, 1));
console.log(bad.length ? `看不清他（亮度差 < ${MIN}）：${bad.join('、')}` : `都看得清（亮度差 ≥ ${MIN}）`);
if (!process.argv[2] && !bad.length) fs.rmSync(dir, { recursive: true, force: true });   // 没指定目录又都通过：临时图不留
else console.log('图在：', dir);
process.exit(bad.length ? 1 : 0);
