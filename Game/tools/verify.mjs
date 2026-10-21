// 一键验证：依次跑所有检查，最后汇总。npm run check 只跑不开浏览器的几项（几秒）；npm run verify 全跑。
// 同时最多 2 个无头浏览器（GPU 上限）；卡住的截图／录制会按各自的总时限失败退出，不会无限等。
// 用法：node tools/verify.mjs [--quick] [--serial] [--full]（--serial：全部一项项跑，排查互相干扰时用；
//   --full：再加长检查——穿模的 1 倍速、2 倍速、中途换倍速、随机帮法，以及每天缩略图（每项单跑 2—3.5 分钟，分在两路里，估计总共多 5—10 分钟；部署前或改了动法时跑：npm run verify -- --full）
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const game = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const quick = process.argv.includes('--quick'), serial = process.argv.includes('--serial'), full = process.argv.includes('--full');
const shots = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-uidiff-')), scene = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-scene-'));
const FAST = [
  ['构建', 'node', ['build.mjs'], (o) => /dist\/index\.html/.test(o)],
  ['模块装配（循环、分层）', 'node', ['tools/modcheck.mjs'], null],
  ['测试浏览器不重复下载', 'node', ['tools/browsercheck.mjs'], null],
  ['未声明名字', 'node', ['tools/undefcheck.mjs'], null],
  ['注释吞代码', 'node', ['tools/commentcheck.mjs'], null],
  ['规则结果快照', 'node', ['tools/simsnap.mjs'], null],
  ['存档升级', 'node', ['tools/savecheck.mjs'], null],
  ['暂停（规则层、关卡定时器、人物都停）', 'node', ['tools/pausecheck.mjs'], null],
  ['剧情数据一致', 'node', ['tools/datacheck.mjs'], null],
  ['情境自检（210 局）', 'node', ['tools/storycheck.mjs'], null],
  ['小关卡必出（最消极玩法）', 'node', ['tools/levelcheck.mjs'], null],
];
// 开浏览器的检查：回归、排版、设置组合各自已同时开 2 个浏览器（GPU 上限），只能一项项跑；
// 穿模检测与界面截图各只开 1 个，这两路同时跑（截图必须在像素比对之前）；3D 画面与性能接在穿模那一路后面，和界面截图那一路错开，总共仍最多 2 个浏览器。
const SERIAL = [
  ['7 天回归', 'node', ['tools/regress.mjs'], (o) => (o.match(/"done":true/g) || []).length === 7 && !/"errs":\["/.test(o)],
  ['排版（10 尺寸）', 'node', ['tools/layoutcheck.mjs'], (o) => /全部一致/.test(o)],
  ['设置组合（36 种）', 'node', ['tools/settingscheck.mjs'], (o) => /没有发现问题/.test(o)],
  ['雾依然好认（画面改动不削弱雾）', 'node', ['tools/fogread.mjs'], null],
  ['看得清他（傍晚、夜里、雨雾里他和背景的亮度差）', 'node', ['tools/elderlook.mjs'], null],
];
const LANES = [
  [['穿模与台词（7 天）', 'node', ['tools/walkcheck.mjs'], null], ['穿模与台词（拜托全部邻居）', 'node', ['tools/walkcheck.mjs'], null, { WALK_NB: '1' }], ['穿模与台词（小关卡全做错）', 'node', ['tools/walkcheck.mjs'], null, { WALK_FAIL: '1' }],
    ['3D 画面拍摄（2 档 × 7 天）', 'node', ['tools/scenecheck.mjs', 'shoot', scene], null],
    ['3D 画面比对', 'node', ['tools/scenecheck.mjs', 'diff', path.join(game, 'snapshots/scenebase'), scene], null],
    ['性能上限（绘制、三角面、帧耗时）', 'node', ['tools/scenecheck.mjs', 'perf', scene], null]],
  [
    ['界面截图', 'node', ['tools/uidiff.mjs', 'shoot', shots], null],
    ['界面像素比对', 'node', ['tools/uidiff.mjs', 'diff', path.join(game, 'snapshots/uibase'), shots], null],
  ],
];
// 长检查（--full）：接在两路后面，两路用时大致拉平；缩略图留在临时目录给人看，不删
const sheets = path.join(os.tmpdir(), 'mg-daysheet-' + new Date().toISOString().slice(0, 16).replace(/[-:T]/g, ''));
if (full) {
  LANES[0].push(['穿模（1 倍速）', 'node', ['tools/walkcheck.mjs'], null, { WALK_SPEED: '1' }], ['穿模（随机帮法）', 'node', ['tools/walkcheck.mjs'], null, { WALK_HELP: 'random', WALK_SEED: '2' }]);
  LANES[1].push(['穿模（2 倍速）', 'node', ['tools/walkcheck.mjs'], null, { WALK_SPEED: '2' }], ['穿模（中途换倍速）', 'node', ['tools/walkcheck.mjs'], null, { WALK_SPEED: 'mix' }], ['每天缩略图（人工看）', 'node', ['tools/daysheet.mjs', sheets], null]);
}
const rows = new Map();
const run = ([name, cmd, args, ok, env]) => new Promise((resolve) => {
  const t0 = Date.now(), p = spawn(cmd, args, { cwd: game, env: { ...process.env, ...env } });
  let out = '';
  p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
  p.on('close', (code) => {
    const pass = code === 0 && (!ok || ok(out));
    const last = out.trim().split('\n').filter(Boolean).pop() || '';
    rows.set(name, [pass ? '✓' : '✗', name, `${Math.round((Date.now() - t0) / 1000)} 秒`, pass ? last.slice(0, 80) : out.trim().split('\n').slice(-6).join('\n    ')]);
    console.log(`${pass ? '✓' : '✗'} ${name}`);
    resolve(pass);
  });
});
const t0 = Date.now();
let built = true;
for (const s of FAST) { const ok = await run(s); if (!ok && s[0] === '构建') { built = false; break; } }
if (built && !quick) {
  for (const s of SERIAL) await run(s);
  if (serial) for (const s of LANES.flat()) await run(s);
  else await Promise.all(LANES.map(async (lane) => { for (const s of lane) await run(s); }));
}
fs.rmSync(shots, { recursive: true, force: true }); fs.rmSync(scene, { recursive: true, force: true });
// 残留浏览器检查
const left = spawnSync('bash', ['-c', "ps -eo args | awk '$1 ~ /^\\/opt\\/google\\/chrome\\/chrome$/ && /--headless=new/ && !/--type=/' | wc -l"], { encoding: 'utf8' }).stdout.trim();
const order = [...FAST, ...SERIAL, ...LANES.flat()].map(s => s[0]).filter(n => rows.has(n));
console.log('\n' + order.map(n => rows.get(n)).map(r => `${r[0]} ${r[1]}（${r[2]}）  ${r[3]}`).join('\n'));
console.log(`残留无头浏览器：${left}　总用时 ${Math.round((Date.now() - t0) / 1000)} 秒`);
if (rows.has('每天缩略图（人工看）')) console.log(`每天缩略图：${sheets}/day1.jpg……day7.jpg（部署前逐天看一遍）`);
const bad = order.filter(n => rows.get(n)[0] === '✗').length;
console.log(bad ? `\n${bad} 项没通过` : '\n全部通过');
process.exit(bad ? 1 : 0);
