// 穿模检测：7 天各自动玩一遍（录制工具的虚拟时间，结果可重复），每 0.1 秒检查所有可见的人是否在路上、门口进出路线或屋里。
// 用法（在 Game/ 下）：node tools/walkcheck.mjs [天，如 1,6]；WALK_NB=1 时拜托了全部邻居；有越界以状态 1 退出，并列出谁、几点、在哪
// 走法变体（10-06 补；可以叠加）：
//   WALK_FAIL=1          小关卡全做错
//   WALK_SPEED=1|2|4|mix 快进用几倍速（默认 4）；mix＝每 2—12 秒真的去点一次倍速按钮（1／2／4 随机换，固定种子），查换速那一下
//   WALK_HELP=random     随机帮法：他走路、犹豫、迷路、慌了时随机打电话或陪同，犹豫面板里随机选（等一等、问一句、指路、陪同、放手……），
//                        每天结束列出这天碰到的“时机×帮法”组合；WALK_SEED 换种子（默认 1，同一种子结果可重复）
//   WALK_TRACE=835-850   查问题用：这几分钟里逐段往 stderr 打印状态（不改走法）
//   WALK_WHERE=30        每类问题最多列出几处（默认 4）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { record } from './video/record.mjs';
import { checkLines } from './linerules.mjs';
const here = path.dirname(new URL(import.meta.url).pathname);
const days = (process.argv[2] || '1,2,3,4,5,6,7').split(',').map(Number);
// 构建过期就先重新构建（10-06：曾用旧的 dist 测出“全部通过”，改动其实没被测到）
{ const dist = path.join(here, '../dist/index.html'), src = path.join(here, '../src'); const newest = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((m, f) => Math.max(m, f.isDirectory() ? newest(path.join(d, f.name)) : fs.statSync(path.join(d, f.name)).mtimeMs), 0);
  if (!fs.existsSync(dist) || newest(src) > fs.statSync(dist).mtimeMs) { console.log('源码比构建新：先重新构建'); (await import('node:child_process')).execFileSync('node', [path.join(here, '../build.mjs')], { stdio: 'ignore' }); } }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-walk-'));
const scene = path.join(tmp, 'walk.mjs');
fs.writeFileSync(scene, `import { player } from '${path.join(here, 'video/play.mjs')}';
const D = +process.env.WALK_DAY;
const NB = process.env.WALK_NB === '1';   // 变体：拜托了全部邻居（跑到“邻居出来指路”）
import fs from 'node:fs'; const require_fs = () => fs;
export const meta = { day: D, audioSec: 1000, sr: 8000,   // 声音时钟要走满一整天（开口延迟、残留声音靠它）；检查不需要音质
   save: { day: D - 1, best: [{ stars: 3 }], persist: NB ? { signs: [], photos: [], home: [], neighbors: ['wang', 'li', 'zhao', 'chen'], leaked: false } : null, snap: [] }, settings: { voice: true } };   // 开着配音：顺带查“声音比气泡晚”
// 固定种子的随机数（只给检查自己用，不碰游戏里的 Math.random）
const rng = (seed) => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const SPEED = process.env.WALK_SPEED || '4', HELP = process.env.WALK_HELP === 'random', SEED = +(process.env.WALK_SEED || 1);
export default async (api) => {
  const P = player(api); P.failAll = process.env.WALK_FAIL === '1';   // 变体：小关卡全做错
  const rnd = rng(SEED * 1000 + D);
  if (SPEED === 'mix') {   // 中途换倍速：像玩家一样点顶栏的倍速按钮（会把界面从“静观”叫醒）；按钮看不见时直接设
    let cur = 4;
    P.ffSpeed = async () => { const opts = [1, 2, 4].filter(s => s !== cur); cur = opts[Math.floor(rnd() * opts.length)];
      if (!(await api.click('#spdSeg button[data-s="' + cur + '"]', { move: 0.05, after: 0 }))) await api.js('__mg.setSpeed(' + cur + ')');
      return null; };
    P.ffChunk = () => 2 + rnd() * 10;
  } else P.ffSpeed = +SPEED;
  const help = {};   // 这天碰到的“时机×帮法”组合 → 次数
  if (HELP) {
    P.rounds = 200;
    const mixChunk = P.ffChunk; P.ffChunk = () => Math.min(mixChunk ? mixChunk() : 99, 0.5 + rnd() * 2);   // 每 0.5—2.5 秒看一眼他在干什么
    let callWhen = null;
    // 走路时偶尔才帮（帮早了他就不会迷路、慌了，后面的时机就碰不到）；犹豫、迷路、慌了时多半会帮
    const P_ACT = { 走路: 0.02, 犹豫: 0.5, 迷路: 0.1, 慌了: 0.5 };   // 迷路时帮得慢一点，才碰得到“慌了”
    P.onChunk = async () => {
      const st = await api.js(\`(()=>{const S=__mg.sim,e=S.e||{}; return {live:S.phase==='live', mode:e.mode, lost:!!(e.lost||e.drift), call:S.canCall(), esc:S.canEscort()}})()\`);
      if (!st.live || !(st.call || st.esc)) return;
      const when = st.mode === 'stuck' ? '慌了' : st.lost ? '迷路' : st.mode === 'hesitate' ? '犹豫' : st.mode === 'walk' ? '走路' : null;
      if (!when || rnd() >= P_ACT[when]) return;
      const acts = [st.call && 'call', st.esc && 'escort'].filter(Boolean), a = acts[Math.floor(rnd() * acts.length)];
      if (await api.click(a === 'call' ? '#actCall' : '#actWalk', { move: 0.05, after: 0.1 })) {
        if (a === 'call') callWhen = when; else help[when + '×陪同'] = (help[when + '×陪同'] || 0) + 1;
      }
    };
    const NAME = { lost: { wait: '等一等', cue: '问一句', tell: '指路', walk: '过去陪', letgo: '放手' }, other: { wait: '等一等', cue: '提示', tell: '直接说', letgo: '就这样吧' } };
    P.pickMoment = async (opts, kind) => {
      const m = await api.js('(()=>{const m=__mg.sim.moment; return m && {fromHim:!!m.fromHim, stuck:!!m.stuck}})()') || {};
      const pick = opts[Math.floor(rnd() * opts.length)];
      const nm = NAME[kind === 'lost' ? 'lost' : 'other'][pick] || pick;
      const k = kind !== 'lost' ? '犹豫面板(' + kind + ')×' + nm : m.fromHim ? (m.stuck ? '他慌了打来' : '他打来') + '×' + nm : (callWhen || '?') + '×电话·' + nm;
      help[k] = (help[k] || 0) + 1;
      return pick;
    };
  }
  if (process.env.WALK_TRACE) {   // 查问题用：WALK_TRACE=835-850 在这几分钟里每 0.25 秒（或每段之间）往 stderr 打一行他、跟随的人、时钟停没停（只多读状态，不改走法，结果和不加时一样）
    const [a, b] = process.env.WALK_TRACE.split('-').map(Number), inner = P.onChunk;
    if (!P.ffChunk) P.ffChunk = 0.25;
    P.onChunk = async () => {
      const r = await api.js(\`(()=>{const S=__mg.sim,e=S.e||{}; if (!(S.time>=\${a}&&S.time<=\${b})) return null; const q=(p)=>p?[+p.x.toFixed(1),+p.z.toFixed(1)]:null;
        return {t:+S.time.toFixed(1), mode:e.mode, leg:e.leg, lost:!!e.lost, escort:!!e.escort, rule:q(e.pos), elder:q(__mg.elderPos()), lag:S.visualLag||0, nav:__mg.nav(), eff:+__mg.runState().eff.toFixed(2), sight:__mg.sight(), \
goals:(S.goals||[]).map(g=>g.id+':'+g.status).join(' '), moment:S.moment?.kind||null, crowd:__mg.crowdPos().filter(c=>c[2]).map(c=>[c[0],c[1],c[3]]), kid:(()=>{const k=__mg.kidRoot(); return k.visible?[...q(k.position), \
k.userData.why||'']:null})(), walkers:__mg.walkers.positions().map(q), cars:__mg.cars.list.filter(c=>(c.still||0)>3 || \${process.env.WALK_TRACE_CARS ? 1 : 0}).map(c=>[+c.g.position.x.toFixed(1),+c.g.position.z.toFixed(1),c.phase,\
c.why||'',c.go?'go':'',+(c.v||0).toFixed(1),c.a+'>'+c.b+'>'+c.next])}})()\`);
      if (r) console.error('TRACE ' + JSON.stringify(r));
      if (inner) await inner();
    };
  }
  await P.openDay({ intro: 0.2, cursor: false });
  // 门对齐：画面里每个门的路边点、家门在路上的投影，要和规则层的门位置一致
  console.log('GATES ' + JSON.stringify(await api.js(\`(()=>{const bad=[]; for (const [k,list] of Object.entries(__mg.sim.gates)) list.forEach((d,i)=>{ let p; if (k==='home') { const o=__mg.homeDoorOut(), a=__mg.graph.pos[d.a], \
b=__mg.graph.pos[d.b]; p = a.x===b.x ? {x:a.x, z:o.z} : {x:o.x, z:a.z}; } else { const g=__mg.placeObj(k).userData.gates?.[i]; p = g && g.road; } if (!p || Math.hypot(p.x-d.pos.x, p.z-d.pos.z) > 0.1) bad.push(k+'#'+i); }); return bad})()\`)));
  await api.js('window.__auditMax = ${+process.env.WALK_WHERE || 4}; window.__hidMax = ${+process.env.WALK_HID
    || 0.5}'); await api.js('__mg.walkAudit(true); __mg.lagReset(); __mg.lineLog.on = true; __mg.lineLog.list.length = 0; __mg.voiceLog.on = true; __mg.voiceLog.list.length = 0; __mg.cutLog.on = true; __mg.cutLog.list.length = 0');
  await api.click('#startBtn', { move: 0.05 });
  await P.autoUntil("document.querySelector('#bNext') || document.querySelector('#bEnd')", { max: SPEED === '1' ? 1800 : 900 });
  console.log('END ' + JSON.stringify(await api.js("!!(document.querySelector('#bNext') || document.querySelector('#bEnd'))")));   // 真的玩到了结算（随机帮法、换倍速时 autoUntil 也可能处理不完途中的事）
  console.log('HELP ' + JSON.stringify(help));
  console.log('VT ' + await api.js('Math.round(performance.now() / 1000)'));   // 这天在页面里过了多少秒（虚拟时间，≈真人玩这一天要看多久）
  console.log('WALK ' + JSON.stringify(await api.js('__mg.walkReport()')));
  console.log('LAGMIN ' + JSON.stringify(await api.js('__mg.lagSec()')));
  console.log('LAGBY ' + JSON.stringify(await api.js('__mg.lagBy()')));
  console.log('LINES ' + JSON.stringify(await api.js('__mg.lineLog.list')));
  console.log('TURNS ' + JSON.stringify(await api.js('__mg.reviewReport().turns')));
  console.log('RESIDUE ' + JSON.stringify(await api.js('__mg.reviewReport().residue')));
  console.log('VOICE ' + JSON.stringify(await api.js('__mg.voiceLog.list')));
  console.log('CUT ' + JSON.stringify(await api.js('__mg.cutLog.list')));
  if (process.env.REVIEW_OUT) require_fs().writeFileSync(process.env.REVIEW_OUT + '/day' + D + (NB ? '_nb' : '') + (SPEED !== '4' ? '_x' + SPEED : '') + (HELP ? '_help' : '') + '.json', JSON.stringify(await api.js('__mg.reviewReport()')));
};`);
let bad = 0; const helpAll = {}, t0 = Date.now();
const tag = [process.env.WALK_SPEED && process.env.WALK_SPEED !== '4' && `倍速 ${process.env.WALK_SPEED}`, process.env.WALK_HELP && '随机帮法（种子 ' + (process.env.WALK_SEED || 1) + '）', process.env.WALK_NB === '1' && '拜托全部邻居', process.env.WALK_FAIL === '1' && '小关卡全做错'].filter(Boolean).join('、');
if (tag) console.log('走法：' + tag);
// 单天时限（10-10）：录制本身有总时限（REC_TIMEOUT，默认 1800 秒），检查里一天正常 20—40 秒，卡住时等半小时太久——改成每天 300 秒，超时按失败退出，并先说明卡在哪一天
// （10-08、10-10 出现过三次某一项卡 20—30 分钟，单独重跑都正常，疑似测试浏览器偶发没反应）
process.env.REC_TIMEOUT ||= '300';
for (const d of days) {
  console.error(`walkcheck：开始第 ${d} 天（${new Date().toTimeString().slice(0, 8)}，单天时限 ${process.env.REC_TIMEOUT} 秒）`);
  process.env.WALK_DAY = String(d);
  const lines = []; const orig = console.log; console.log = (...a) => { lines.push(a.join(' ')); };
  let info = null;
  try { info = await record(scene, path.join(tmp, 'd' + d), path.resolve(here, '../dist/index.html'), { w: 1280, h: 800, dpr: 1 }); } catch (e) { lines.push('ERR ' + e.message + (e.errors?.length ? '｜页面报错：' + e.errors.slice(0, 2).join('｜') : '')); if (process.env.DBG) console.error(e.stack); }
  console.log = orig;
  if (info?.errors?.length) { bad++; console.log(`第 ${d} 天：页面报错 ${info.errors.length} 条：${info.errors.slice(0, 3).join('｜').slice(0, 600)}`); }   // 10-05：跑完了也要报（原来只在没跑完时看得到）
  const w = lines.find(l => l.startsWith('WALK ')), err = lines.find(l => l.startsWith('ERR'));
  const gates = JSON.parse((lines.find(l => l.startsWith('GATES ')) || 'GATES []').slice(6));
  if (gates.length) { bad++; console.log(`第 ${d} 天：画面与规则的门位置对不上：${gates.join('、')}`); }
  // 台词合不合场景（时间、去／回、下雨、称呼……）
  const said = JSON.parse((lines.find(l => l.startsWith('LINES ')) || 'LINES []').slice(6));
  const wrong = checkLines(said);
  // 声音比气泡晚：人物说话（短句、往事、犹豫时的自言自语）排在别人后面超过 1 秒才开口；旁白与关卡里的话按设计排队，不算
  const texts = JSON.parse(fs.readFileSync(path.join(here, '../src/voice/texts.json'), 'utf8'));
  const late = JSON.parse((lines.find(l => l.startsWith('VOICE ')) || 'VOICE []').slice(6)).filter(v => v.wait > 1 && !['narr', 'game'].includes(v.tag));
  // DBG=1：列出晚开口前后几句，查是谁挡着
  if (late.length && process.env.DBG) { const all = JSON.parse((lines.find(l => l.startsWith('VOICE ')) || 'VOICE []').slice(6)); for (const v of late) { const k = all.indexOf(all.find(x => x.id === v.id && x.wait === v.wait)); console.error(JSON.stringify(all.slice(Math.max(0, k - 5), k + 3))); } }
  if (late.length) { bad++; console.log(`第 ${d} 天：声音比气泡晚：` + late.map(v => `“${(texts[v.id] || v.id).slice(0, 14)}”晚 ${v.wait} 秒`).join('；')); }
  const back = JSON.parse((lines.find(l => l.startsWith('TURNS ')) || 'TURNS []').slice(6)).filter(t => t.includes('出门折返'));
  const residue = JSON.parse((lines.find(l => l.startsWith('RESIDUE ')) || 'RESIDUE []').slice(8));
  if (residue.length) { bad++; console.log(`第 ${d} 天：残留声音：${residue.join('；')}`); }
  // 话被掐断：关卡自动关闭时，这一步的话还没说完（玩家自己点按钮跳过的不算）
  const cut = JSON.parse((lines.find(l => l.startsWith('CUT ')) || 'CUT []').slice(4)).filter(c => c.why === 'close');
  if (cut.length) { bad++; console.log(`第 ${d} 天：关卡自动关闭掐断了话：` + cut.map(c => `“${(texts[c.id] || c.id || '').slice(0, 14)}”还剩 ${c.left} 秒`).join('；')); }
  if (back.length) { bad++; console.log(`第 ${d} 天：出门先走过头再折回：${back.join('；')}`); }
  if (wrong.length) { bad++; console.log(`第 ${d} 天：台词和场景对不上：\n  ` + wrong.join('\n  ')); }
  if (process.env.LINES_OUT) fs.appendFileSync(process.env.LINES_OUT, said.map(l => JSON.stringify(l)).join('\n') + '\n');
  const rep = w ? JSON.parse(w.slice(5)) : null;
  const names = rep ? Object.keys(rep) : [];
  const ended = (lines.find(l => l.startsWith('END ')) || 'END false').slice(4) === 'true';
  const help = JSON.parse((lines.find(l => l.startsWith('HELP ')) || 'HELP {}').slice(5));
  if (Object.keys(help).length) { for (const [k, n] of Object.entries(help)) helpAll[k] = (helpAll[k] || 0) + n; console.log(`第 ${d} 天帮法：` + Object.entries(help).map(([k, n]) => `${k} ${n}`).join('、')); }
  if (err || !rep || !ended) { bad++; console.log(`第 ${d} 天：没跑完 ${err || (rep ? '（没玩到结算）' : '')}`); if (!rep) continue; }
  const lagMin = +((lines.find(l => l.startsWith('LAGMIN ')) || 'LAGMIN 0').slice(7));   // 时钟为等画面停了多少真实秒
  const lagBy = (lines.find(l => l.startsWith('LAGBY ')) || 'LAGBY {}').slice(6);
  if (lagMin > 30) { bad++; console.log(`第 ${d} 天：时钟为等画面停了 ${lagMin} 秒（上限 30）${lagBy}`); }   // 停得多说明画面常跟不上（不影响结果，但玩起来会顿）
  const vt = +((lines.find(l => l.startsWith('VT ')) || 'VT 0').slice(3));
  // 只提示、不算失败：路人之间跟随、让行时的减速（10-07：路人互相让是正常的，记下来供以后改进；爷爷和跟着他的人的顿挫照样算问题）
  // 爷爷和跟着他的人的顿挫：每天 5 次以内只提示（让车、给前面的人让路、到地方停下挥手都会有一两次），超过才算问题——改动前每天 30—40 次，这个上限拦得住回退
  const TIP = ['路人顿挫', ...(rep?.['顿挫']?.n <= 5 ? ['顿挫'] : [])];
  for (const n of names.filter(n => TIP.includes(n))) console.log(`第 ${d} 天提示：${n} ${rep[n].n} 次（${rep[n].where.slice(0, 2).join('；').slice(0, 300)}）`);
  names.splice(0, names.length, ...names.filter(n => !TIP.includes(n)));
  if (!names.length) { console.log(`第 ${d} 天：没有越界（时钟为等画面停 ${lagMin} 秒；画面里过了 ${vt} 秒）`); continue; }
  bad++;
  console.log(`第 ${d} 天（画面里过了 ${vt} 秒）：` + names.map(n => `${n} ${rep[n].n} 次（${rep[n].where.join('；')}）`).join('\n    '));
}
fs.rmSync(tmp, { recursive: true, force: true });
if (Object.keys(helpAll).length) {
  console.log(`\n${days.length} 天碰到的时机×帮法（${Object.keys(helpAll).length} 种）：` + Object.entries(helpAll).sort().map(([k, n]) => `${k} ${n}`).join('、'));
  // 该有的组合（游戏里给得出的）：你主动帮——四种时机 × 陪同／电话里问一句、指路、过去陪、放手（走得好好的、只是犹豫时电话里没有“过去陪”，慌了时只有过去陪、放手）；他打来的电话
  const want = [];
  for (const w of ['走路', '犹豫', '迷路', '慌了']) for (const h of ['陪同', '电话·问一句', '电话·指路', '电话·过去陪', '电话·放手']) {
    if ((w === '走路' || w === '犹豫') && h === '电话·过去陪') continue; if (w === '慌了' && (h === '电话·问一句' || h === '电话·指路')) continue;
    want.push(w + '×' + h);
  }
  for (const h of ['问一句', '指路', '过去陪', '放手']) want.push('他打来×' + h);
  for (const h of ['过去陪', '放手']) want.push('他慌了打来×' + h);
  const miss = want.filter(k => !helpAll[k]);
  console.log(`主要组合碰到 ${want.length - miss.length}/${want.length}` + (miss.length ? `，没碰到：${miss.join('、')}（换 WALK_SEED 再跑可补）` : ''));
}
console.log(`用时 ${Math.round((Date.now() - t0) / 1000)} 秒`);
console.log(bad ? `\n${bad} 天有问题` : `\n${days.length} 天都没有越界，台词都合场景，人物开口不晚，没有残留声音`);
process.exit(bad ? 1 : 0);
