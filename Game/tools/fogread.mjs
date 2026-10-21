// 雾的可读性（画面精修的底线：信息优先、美化让路）：第 1 天布置阶段，量“有雾路口”和“清楚路口”的平均亮度差。
// 用法（在 Game/ 下）：node tools/fogread.mjs [--update]——与基准 snapshots/fogread.json 比，亮度差掉超过 10% 就失败。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const here = path.dirname(new URL(import.meta.url).pathname), base = path.join(here, '../snapshots/fogread.json');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-fog-')), png = path.join(tmp, 'plan.png'), steps = path.join(tmp, 'steps.json');
fs.writeFileSync(steps, JSON.stringify([{
  js: "for(let i=0;i<50&&!document.querySelector('#bGo');i++) await new Promise(r=>setTimeout(r,200)); document.querySelector('#bGo').click(); await new Promise(r=>setTimeout(r,1200)); document.querySelector('#bPlan').click(); \
await new Promise(r=>setTimeout(r,4000)); document.querySelectorAll('.hud,#hint,#bubbles,#maplayer').forEach(e=>e.style.visibility='hidden'); const st=__mg.mistState(); const pick=(f)=>st.filter(f).map(m=>__mg.screenOf(m.i)); return {fog: pick(m=>m.t>0.5), clear: pick(m=>m.t===0)}",
  wait: 300, shot: png }]));
const out = await new Promise(res => { let o = ''; const p = spawn('node', [path.join(here, 'shot.mjs'), '1280', '800', steps]); p.stdout.on('data', d => o += d); p.on('close', () => res(o)); });
const line = out.split('\n').find(l => l.startsWith('> {')); if (!line || !fs.existsSync(png)) { console.log('没拿到布置阶段的截图'); process.exit(1); }
const pts = JSON.parse(line.slice(2));
// 读 PNG（RGBA 8 位、无隔行，Chrome 截图就是这种）→ 灰度
const buf = fs.readFileSync(png); let W = buf.readUInt32BE(16), H = buf.readUInt32BE(20), bpp = buf[25] === 6 ? 4 : 3, idat = [];
for (let o = 8; o < buf.length;) { const len = buf.readUInt32BE(o), type = buf.toString('ascii', o + 4, o + 8); if (type === 'IDAT') idat.push(buf.subarray(o + 8, o + 8 + len)); o += 12 + len; }
const raw = zlib.inflateSync(Buffer.concat(idat)), stride = W * bpp, img = Buffer.alloc(H * stride);
for (let y = 0; y < H; y++) {
  const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), prev = y ? img.subarray((y - 1) * stride, y * stride) : null, cur = img.subarray(y * stride, (y + 1) * stride);
  for (let i = 0; i < stride; i++) { const a = i >= bpp ? cur[i - bpp] : 0, b = prev ? prev[i] : 0, c = prev && i >= bpp ? prev[i - bpp] : 0; let v = src[i];
    if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
    cur[i] = v & 255; }
}
const lum = (x, y) => { const i = y * stride + x * bpp; return 0.299 * img[i] + 0.587 * img[i + 1] + 0.114 * img[i + 2]; };
const mean = (list) => { const v = []; for (const [x, y] of list) if (x > 20 && y > 20 && x < W - 20 && y < H - 20) { let s = 0; for (let dy = -12; dy < 12; dy++) for (let dx = -12; dx < 12;
  dx++) s += lum(x + dx, y + dy); v.push(s / 576); } return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; };
const diff = Math.round((mean(pts.fog) - mean(pts.clear)) * 10) / 10;
fs.rmSync(tmp, { recursive: true, force: true });
if (process.argv.includes('--update') || !fs.existsSync(base)) { fs.writeFileSync(base, JSON.stringify({ diff }, null, 1)); console.log(`已记下基准：有雾与清楚路口的亮度差 ${diff}`); process.exit(0); }
const ref = JSON.parse(fs.readFileSync(base, 'utf8')).diff;
if (diff < ref * 0.9) { console.log(`雾不够好认了：有雾与清楚路口的亮度差 ${diff}，基准 ${ref}（掉了 ${Math.round((1 - diff / ref) * 100)}%）`); process.exit(1); }
console.log(`雾依然好认：亮度差 ${diff}（基准 ${ref}）`);
