// 剧情数据一致性检查：不开浏览器，核对 data.js 里每天的设定前后对得上（天气与简介、地点与入口、修路的路段、托带的事、配音文件……），
// 以及源码里有没有“代码被写进了注释”（如 `// 说明 weather: 'rain',` 让字段失效）。
// 用法：node tools/datacheck.mjs（有问题以状态 1 退出）。加新的一天、新地点、新配音后都会自动覆盖到。
import fs from 'node:fs';
import path from 'node:path';
import { buildGraph } from '../src/town.js';
import { DAYS, PLACES, SUPPORTS, FAVORS, MOMENTS, NEIGHBORS, nid } from '../src/data.js';
import { TASK_ARRIVE } from '../src/tasks.js';
import { allNarr, sayable } from '../src/narr.js';
import { LINES, voiceKeyOf, allLineTexts, SCRIPT, SCRIPT_PREFIX } from '../src/lines.js';

const game = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src = (f) => fs.readFileSync(path.join(game, 'src', f), 'utf8');
const bad = [];
const err = (where, msg) => bad.push(`${where}：${msg}`);
// 游戏代码里不读测试用的环境变量（09-28 审查：难度试验留下的 process.env 开关混进了 sim.js）；试验参数放在 tools/ 里
for (const f of fs.readdirSync(new URL('../src/', import.meta.url)).filter(f => f.endsWith('.js'))) if (/process\??\.env/.test(fs.readFileSync(new URL('../src/' + f, import.meta.url), 'utf8'))) err(f, '游戏代码里读了 process.env（试验开关请放在 tools/ 里）');
// 悬停样式只给真鼠标（09-27：手机上点过之后悬停色会“粘”住，残局棋盘的圆圈也因此在截图里时有时无）
for (const f of fs.readdirSync(new URL('../src/styles/', import.meta.url)).filter(f => f.endsWith('.css'))) {
  fs.readFileSync(new URL('../src/styles/' + f, import.meta.url), 'utf8').split('\n').forEach((l, i) => { if (l.includes(':hover') && !l.includes('@media (hover:hover)')) err(`${f}:${i + 1}`, ':hover 要包在 @media (hover:hover) 里'); });
}
const graph = buildGraph();
const edge = (a, b) => graph.adj[nid(...a)]?.includes(nid(...b));
const sim = src('sim.js');
// 规则层认得的事情与关卡（从源码里收集，新加的会自动算进来）
const TASKS = new Set([...Object.keys(TASK_ARRIVE), ...[...sim.matchAll(/case '(\w+)':/g)].map(m => m[1])]);
const LEVELS = new Set([...(sim.match(/ARRIVAL_LEVEL = \[([^\]]*)\]/)?.[1].match(/\w+/g) || [])]);
const WEEK = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];

DAYS.forEach((d, i) => {
  const w = `第 ${i + 1} 天`;
  // 天气：字段存在、取值合法，且与简介里说的雨一致
  if (!['sun', 'rain'].includes(d.weather)) err(w, `weather 应为 'sun' 或 'rain'，现在是 ${JSON.stringify(d.weather)}（是不是被写进了注释？）`);
  if (d.rainFrom && d.weather !== 'rain') err(w, '有 rainFrom 却不是雨天');
  if (d.weather === 'rain' && !d.rainFrom) err(w, '雨天但没写 rainFrom（几点开始下）');
  if (/雨/.test(d.intro) !== (d.weather === 'rain')) err(w, `简介${/雨/.test(d.intro) ? '说有雨' : '没提雨'}，天气却是 ${d.weather}`);
  // 星期：一天接一天
  if (i > 0 && WEEK.indexOf(d.weekday) !== (WEEK.indexOf(DAYS[i - 1].weekday) + 1) % 7) err(w, `星期对不上：前一天 ${DAYS[i - 1].weekday}，这天 ${d.weekday}`);
  if (!d.title?.startsWith(`第${'一二三四五六七八九十'[i]}天`)) err(w, `标题“${d.title}”与天数不符`);
  for (const k of d.unlock || []) if (!SUPPORTS[k]) err(w, `解锁了不存在的支持方式 ${k}`);
  for (const [a, b] of d.blocked || []) if (!edge(a, b)) err(w, `修路的路段 ${a}-${b} 不是一条路`);
  for (const k of d.changed || []) if (!/\w/.test(k)) err(w, `changed 写法不对：${k}`);
  let last = -1;
  for (const g of d.goals) {
    const gw = `${w}·${g.id}`;
    if (g.at < last) err(gw, '时间比上一件事早（目标要按时间排）');
    last = g.at;
    if (g.at >= d.end) err(gw, '开始时间晚于一天结束');
    if (g.until && g.until <= g.at) err(gw, 'until 不晚于开始时间');
    if (!TASKS.has(g.task)) err(gw, `规则层不认识的事情 task=${g.task}（tasks.js 或 sim.js 里没有处理）`);
    if (g.level && !LEVELS.has(g.level)) err(gw, `不认识的到达关卡 level=${g.level}`);
    if (g.pre && !MOMENTS[g.pre]) err(gw, `pre=${g.pre} 不是犹豫时刻`);
    if (g.kind === 'trip') {
      const pl = PLACES[g.place];
      if (!pl) { err(gw, `地点 ${g.place} 不存在`); continue; }
      if ((d.blocked || []).some(([a, b]) => [pl.node, pl.doorTo].every(p => String(p) === String(a) || String(p) === String(b))) && !g.doorClosed && !(pl.gates || []).length) err(gw, `${pl.name}门口那段路在修，又没有别的门`);
    }
    if (g.menu && !(g.menu.items?.length >= 3)) err(gw, '菜单少于 3 样');
    if (g.doorClosed && g.kind === 'trip' && !((PLACES[g.place]?.gates || []).length)) err(gw, `正门在修（doorClosed），可${PLACES[g.place]?.name}没有别的门`);
    if (/正门.*(在修|装修|没修好)/.test(d.intro) !== d.goals.some(x => x.doorClosed)) err(gw, '简介里说不说“正门在修”，和这天有没有 doorClosed 对不上');
  }
});
// 地点：门都是真实的路段
for (const [k, p] of Object.entries(PLACES)) {
  if (p.doorTo && !edge(p.node, p.doorTo)) err(`地点 ${k}`, `门 ${p.node}-${p.doorTo} 不是一条路`);
  for (const [a, b] of p.gates || []) if (!edge(a, b)) err(`地点 ${k}`, `侧门 ${a}-${b} 不是一条路`);
  if (p.doorAt !== undefined && !(p.doorAt > 0 && p.doorAt < 1)) err(`地点 ${k}`, 'doorAt 应在 0 到 1 之间');
}
// 托带的事：那天真有对应的外出，托的邻居存在
for (const [idx, f] of Object.entries(FAVORS)) {
  const d = DAYS[+idx], w = `托带（第 ${+idx + 1} 天）`;
  if (!d) { err(w, '没有这一天'); continue; }
  if (!d.goals.some(g => g.task === f.task)) err(w, `这天没有 ${f.task} 这件事，捎不上`);
  if (!NEIGHBORS.some(n => n.id === f.who)) err(w, `邻居 ${f.who} 不存在`);
}
// 配音：keys.json 指到的文件都在，文件都有人用
const vdir = path.join(game, 'src/voice');
if (fs.existsSync(path.join(vdir, 'keys.json'))) {
  const keys = JSON.parse(fs.readFileSync(path.join(vdir, 'keys.json'), 'utf8'));
  const files = new Set(fs.readdirSync(vdir).filter(f => f.endsWith('.ogg')).map(f => f.slice(0, -4)));
  const used = new Set(Object.values(keys).map(v => v.id));
  for (const id of used) if (!files.has(id)) err('配音', `keys.json 里的 ${id} 没有音频文件`);
  const code = fs.readdirSync(path.join(game, 'src')).filter(f => f.endsWith('.js')).map(src).join('\n');
  // 直接按 id 播放的（mem1、mo_meds、jz_go 这类）：源码里出现 id 本身，或出现“前缀 + 变量”的拼法
  const direct = (id) => code.includes(`'${id}'`) || [...code.matchAll(/'([a-z]+_?)' \+/g)].some(m => id.startsWith(m[1]) && /^[a-z]+_?[a-z0-9]+$/.test(id));
  for (const id of files) if (!used.has(id) && !direct(id)) err('配音', `音频 ${id}.ogg 没有被用到（多余的会打包进页面）`);
  // 改了文字、没重配音：录音念的文字（install.py 写出的 texts.json）要和游戏里现在的文字一致
  const tf = path.join(vdir, 'texts.json');
  if (fs.existsSync(tf)) {
    const said = JSON.parse(fs.readFileSync(tf, 'utf8')), norm = (t) => String(t).replace(/[\s～~！!。.，,、…？?：:；;“”「」—]/g, '');   // 配音稿可以为语气改标点，不能改字
    const same = (id, now, where) => { if (said[id] !== undefined && norm(said[id]) !== norm(now)) err('配音', `${where}改了文字，录音 ${id} 还是旧的：“${String(said[id]).slice(0, 30)}……”（在 Local/tts/lines.json 改文字后重新生成）`); };
    DAYS.forEach((d, i) => { const k = keys[`narr|intro${i}`]; if (k) same(k.id, d.intro, `第 ${i + 1} 天简介`); same(`mem${i + 1}`, d.memory, `第 ${i + 1} 天往事`); for (const a of d.memoryAlt || []) {
      if (!files.has(a.id)) err('配音', `第 ${i + 1} 天另一种结果的往事没有录音（${a.id}）`); same(a.id, a.memory, `第 ${i + 1} 天另一种结果的往事`); } });
    // 按文字查找的台词：录音念的就是这句（允许句末标点不同；带引号的只念引号里的话）
    for (const [key, v] of Object.entries(keys)) { const t0 = key.replace(/^\w+\|/, ''), t = t0.match(/^“([^”]+)”/)?.[1] ?? t0; if (!/^intro\d$/.test(t) && !/^talk\d$/.test(key)) same(v.id, key.startsWith('narr|') ? sayable(t0) : t, `台词“${t0.slice(0, 12)}”`); }
  } else err('配音', '缺 src/voice/texts.json（Local/tts/install.py 会写出）');
  // 朗读提示：提示表（src/narr.js）里每一句都要有配音（设置里打开“朗读提示”时才念，缺了就会有的念有的不念）
  const miss = allNarr().filter(t => !keys['narr|' + t]);
  if (miss.length) err('朗读提示', `${miss.length} 句没有配音，如“${miss[0].slice(0, 20)}……”（node tools/voicelines.mjs，再在 Local/tts 生成）`);
  // 台词表：邻居、老孙、孙女、下棋的老朋友、电影里的话，每一句都要有配音（爷爷的短句按设计只有一部分出声）
  const NBS = NEIGHBORS.map(n => n.id), placeNames = [...Object.values(PLACES).map(p => p.name), '家'];
  const varsOf = (id) => id === 'nb.way' ? placeNames.map(target => ({ target })) : id.startsWith('favor.') ? Object.values(FAVORS) : [{}];
  for (const { id, who, text } of allLineTexts(varsOf)) {
    if (/\{/.test(text)) continue;
    if (who === 'elder') {   // 爷爷：写了配音类别的要有配音、类别一致；没写的不该有（否则会被当成要紧话乱插）
      const want = LINES[id].voice, got = keys[text];
      if (want && !got) err('台词表', `${id}“${text}”写了配音（${want}）却没有录音`);
      else if (want && got.cls !== want) err('台词表', `${id}“${text}”配音类别是 ${got.cls}，表里写的是 ${want}`);
      else if (!want && got && got.cls !== 'step') err('台词表', `${id}“${text}”有录音（${got.cls}），表里没写 voice`);
      continue;
    }
    for (const w of who === 'nb' ? NBS : [who]) if (!keys[voiceKeyOf(w, text)]) err('台词表', `${id}（${w}）“${text}”没有配音`);
  }
  // 关卡剧本（SCRIPT）：每句都要有配音
  { const texts = [];
    const walk = (who, v) => { if (typeof v === 'string') texts.push([who, v]); else if (Array.isArray(v)) v.forEach(x => Array.isArray(x) ? texts.push([x[0], x[1]]) : walk(who, x)); else if (v) Object.values(v).forEach(x => walk(who, x)); };
    for (const [who, v] of Object.entries(SCRIPT)) walk(who, v);
    const menus = DAYS.flatMap(d => d.goals.filter(g => g.menu && g.recall !== false).map(g => g.menu));   // 带菜名的剧本台词只在选菜回忆里说
    for (const [who, t] of texts) {
      const all = t.includes('{dish}') ? menus.filter(m => !m.say).map(m => t.replace('{dish}', m.dish)) : t.includes('{say}') ? menus.filter(m => m.say).map(m => t.replace('{say}', m.say)) : [t];
      for (const x of all) { const k = (SCRIPT_PREFIX[who] ? SCRIPT_PREFIX[who] + '|' : '') + x; if (!keys[k]) err('关卡剧本', `${who}“${x.slice(0, 16)}”没有配音`); }
    } }
  // 不再用的旁白配音
  const narrNow = new Set(allNarr().map(t => 'narr|' + t));
  for (const k of Object.keys(keys)) if (k.startsWith('narr|') && !/^narr\|intro\d+$/.test(k) && !narrNow.has(k)) err('朗读提示', `旁白配音“${k.slice(5, 25)}”已不在提示表里（node tools/voicelines.mjs 会移走）`);
}
// sim 的状态只由 sim 自己改（sim.js、walk.js、moments.js、tasks.js）；别的模块调它的方法（架构.md 第 2 节；09-27 审查补的检查）
for (const f of fs.readdirSync(path.join(game, 'src')).filter(f => f.endsWith('.js') && !['sim.js', 'walk.js', 'tasks.js', 'moments.js'].includes(f))) {
  src(f).split('\n').forEach((line, n) => { const code = line.replace(/\/\/.*$/, ''); if (/\bsim\.(?:e\.)?[a-zA-Z_]+\s*(?:[-+*\/]?=)(?!=)/.test(code)) err(`${f}:${n + 1}`, '直接改了 sim 的状态：改成调用 sim 的方法'); });
}
// 任务图示：每天每件事都要有图标，且画图库里真有这张图（09-27 修闹钟缺图标，只剩底色六边形）
{ const { GOAL_ICON } = await import('../src/icons.js'); const { THING } = await import('../src/pictos.js');
  for (const d of DAYS) for (const g of d.goals) { const ic = /水果/.test(g.label) ? 'apple' : GOAL_ICON[g.task]; if (!ic) err('任务图示', `${d.title} ${g.label}（${g.task}）没有登记图标（icons.js GOAL_ICON）`); else if (!THING[ic]) err('任务图示', `${d.title} ${g.label} 的图标 ${ic} 在 pictos.js THING 里没有`); } }
// 台词表：代码里按编号说的话，编号都要在表里（lines.js）
for (const f of fs.readdirSync(path.join(game, 'src')).filter(f => f.endsWith('.js'))) {
  src(f).split('\n').forEach((line, n) => {
    for (const m of line.matchAll(/(?:(?:sim|this)\.(?:speak|line)\(|helperLine\([^,]+,\s*)'([\w.]+)'(?!\s*\+)/g)) if (!LINES[m[1]]) err(`${f}:${n + 1}`, `台词表里没有“${m[1]}”`);   // 编号前缀＋变量的（'nb.greet.' + id）另由上面的配音检查覆盖
  });
}
// 时间约定（Docs/架构.md“时间系统”）：剧情里一下子过去的时间只经 sim.advance（画面会显示“+N 分钟”）；setSpeed(0) 只表示玩家暂停，只在 hud.js
for (const f of fs.readdirSync(path.join(game, 'src')).filter(f => f.endsWith('.js'))) {
  src(f).split('\n').forEach((line, n) => {
    const code = line.replace(/\/\/.*$/, '');
    if (/\btime\s*\+=/.test(code) && !(f === 'sim.js' && /advance\(min|this\.time \+= dm;/.test(code))) err(`${f}:${n + 1}`, '直接给游戏时间加数：改用 sim.advance(分钟, 原因)，画面才会提示');
    if (/\bplayVoice\(/.test(code) && f !== 'audio.js') err(`${f}:${n + 1}`, '直接调 playVoice：人声都要经声音调度 voice(通道, …)（audio.js），才守得住“同时一个人说、要么马上说要么不说”');
    if (/setSpeed\(0\)/.test(code) && f !== 'hud.js') err(`${f}:${n + 1}`, 'setSpeed(0) 是玩家暂停（声音也会挂起）；剧情停顿用 story.holds，节拍延时用 later()');
  });
}
// 源码：注释里吞掉了代码（中文说明后面跟着 `名字: 值,`）
for (const f of fs.readdirSync(path.join(game, 'src')).filter(f => f.endsWith('.js'))) {
  src(f).split('\n').forEach((line, n) => {
    const c = line.indexOf('//'); if (c < 0 || /['"`]/.test(line.slice(c - 1, c)) || /:\/\//.test(line.slice(c - 1, c + 2))) return;
    // 09-27：被吞的代码后面还跟着别的注释时原来查不出，改为“注释里出现 名字: 值,”就报
    if (line.slice(0, c).trim() && /[一-鿿][^\n]*\s[a-zA-Z_]\w*: (['"[\d]|true|false)[^,\n]*,/.test(line.slice(c))) err(`${f}:${n + 1}`, `注释里像是有代码：${line.slice(c).trim().slice(0, 60)}`);
    // 10-05：注释里吞掉了语句（next 分支上一行末尾的注释吞掉了 `clouds.userData.update(...); fx.update(dt);`，云和光圈都不动了）
    else if (line.slice(0, c).trim() && /[一-鿿][^\n]*\s[a-zA-Z_$][\w$]*(\.[\w$]+)*\([^;\n]*\);/.test(line.slice(c))) err(`${f}:${n + 1}`, `注释里像是吞掉了语句：${line.slice(c).trim().slice(0, 60)}`);
    // 10-06：赋值形式也会被吞（main.js 一行末尾的注释吞掉了 `lampConeM.visible = …;`）
    else if (line.slice(0, c).trim() && /[一-鿿][^\n]*\s[a-zA-Z_$][\w$]*(\.[\w$]+)+\s*=[^=][^;\n]*;/.test(line.slice(c))) err(`${f}:${n + 1}`, `注释里像是吞掉了赋值：${line.slice(c).trim().slice(0, 60)}`);
  });
}
if (bad.length) { console.log(bad.join('\n')); console.log(`\n剧情数据有 ${bad.length} 处对不上`); process.exit(1); }
console.log(`剧情数据一致（${DAYS.length} 天、${Object.keys(PLACES).length} 个地点、配音与注释都查过）`);
