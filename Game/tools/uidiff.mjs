// 界面像素比对：改样式（CSS）前后，逐个界面状态截图对比，找出意外的变化。
// 用法（在 Game/ 下）：
//   node tools/uidiff.mjs shoot <目录>            用 dist/index.html 截一套（电脑 1600×900、手机 390×844×2 两种）
//   node tools/uidiff.mjs diff <基准目录> <新目录>  逐张比较，列出不一样的，并在新目录生成 _diff_*.png（差异处标红）
// 截图时隐藏 3D 画面（只比界面层），时间与随机数固定，同一版本两次截图完全一致。
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { record } from './video/record.mjs';

const here = path.dirname(new URL(import.meta.url).pathname);
const [cmd, a, b] = process.argv.slice(2);
// 电脑、手机竖屏、手机横屏；再加“特大字号＋提示文字多”的电脑版与手机版（env 传给 states.mjs）
const SIZES = [['desk', { w: 1600, h: 900, dpr: 1 }], ['phone', { w: 390, h: 844, dpr: 2, mobile: true }], ['land', { w: 844, h: 390, dpr: 2, mobile: true }], ['big', { w: 1280, h: 800, dpr: 1, env: {
  UI_FONT: '3', UI_TIPS: '3' } }], ['phonebig', { w: 390, h: 844, dpr: 2, mobile: true, env: { UI_FONT: '3', UI_TIPS: '3' } }]];

if (cmd === 'shoot') {
  for (const [tag, opt] of SIZES) {
    const out = path.join(a, tag);
    Object.assign(process.env, { UI_FONT: '1', UI_TIPS: '2' }, opt.env || {});
    // 偶发：快进等不到某个界面（09-27 起在完整检查里出现过一次，单跑复现不了）——同一尺寸重试一次，并明说“重试后通过”，不悄悄吞掉
    for (let tryN = 1; ; tryN++) {
      fs.rmSync(out, { recursive: true, force: true });
      try { await record(path.join(here, 'uidiff/states.mjs'), out, path.resolve(here, '../dist/index.html'), { ...opt, noHover: true }); if (tryN > 1) console.log(`（${tag}：第 1 次快进超时，重试后通过——超时时的游戏状态见上面“快进等不到”那行）`); break; }
      catch (e) { if (tryN >= 2) throw e; console.log(`${tag}：${e.message}；重试一次`); }
    }
    for (const f of ['audio.wav', 'save.json', 'info.json']) fs.rmSync(path.join(out, f), { force: true });
  }
  console.log('截图完成：', a);
} else if (cmd === 'diff') {
  let bad = 0, n = 0, minor = 0;
  for (const [tag] of SIZES.filter(([t]) => fs.existsSync(path.join(a, t)))) for (const f of fs.readdirSync(path.join(a, tag)).filter(f => f.endsWith('.png') && !f.startsWith('_'))) {
    n++;
    const A = path.join(a, tag, f), B = path.join(b, tag, f);
    if (!fs.existsSync(B)) { console.log(`✗ ${tag}/${f}：新目录里没有`); bad++; continue; }
    // 逐像素比较（灰度差 > 6 算不同）；尺寸不同直接算不一样
    const r = spawnSync('ffmpeg', ['-v', 'error', '-i', A, '-i', B, '-filter_complex', '[0][1]blend=all_mode=difference,format=gray', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 1 << 26 });
    let diff = r.status ? -1 : 0; if (!r.status) for (const v of r.stdout) if (v > 6) diff++;
    if (diff === 0) continue;
    // 容差：同一版本两次截图，左上头像的表情偶尔差十几个像素（残余的实时异步让心情差一点）；样式改错通常是大片移位
    if (diff > 0 && diff <= +(process.env.TOL || 60)) { minor++; continue; }
    bad++;
    console.log(`✗ ${tag}/${f}：${diff < 0 ? '尺寸不同' : diff + ' 个像素不同'}`);
    spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', A, '-i', B, '-filter_complex',
      "[0][1]blend=all_mode=difference,format=gray,geq=lum='if(gt(lum(X,Y),6),255,0)'[d];[1]format=gray,format=rgb24[g];[d]format=rgb24,colorchannelmixer=rr=1:gg=0:bb=0[r];[g][r]blend=all_mode=lighten", path.join(b, tag, '_diff_' + f)]);
  }
  console.log((bad ? `${bad}/${n} 张不一样（红色是差异处：${b}/*/_diff_*.png）` : `全部 ${n} 张一致`) + (minor ? `（其中 ${minor} 张只差不超过 ${process.env.TOL || 60} 个像素，视为一致）` : ''));
  process.exit(bad ? 1 : 0);
} else console.log('用法：node tools/uidiff.mjs shoot <目录> | diff <基准目录> <新目录>');
