// 台词表（情境系统 S4-2）：游戏里人物在路上、家里说的每一句都在这里——谁说、几种说法、什么情境才合适、气泡样式。
// 什么时候说，由规则决定（sim.speak('编号', 变量)／ui.helperSay 按编号取）；说什么、合不合适，由这张表决定。
// 配音按“说话人前缀|文字”查（爷爷不加前缀），文字一改就要重配（datacheck 会查出）。
// 关卡里按剧本走的台词在下面的 SCRIPT（顺序由关卡定）；讲座正文是科普内容，留在关卡里。
//
// 每条：{ who, voice, say, cls, dur, when }
//   voice：爷爷的短句里出声的那些写配音类别（lost 迷路、found 认出路、hes 犹豫、happy 高兴、self 自己想起、help 有人帮、chess 下棋）——决定倍速下说不说、能不能打断别人（ui.bark）；没写的只显示气泡。邻居等其他人每句都出声
//   say：一句，或几种说法的数组（轮换，相邻两次不重复）；每种说法可写成 { t: 文字, when, once, pri }
//   when：{ from, to（游戏分钟，含 from 不含 to）, leg: 'go'|'back'|'!back', rain: true|false }——不合情境的说法不会被选中；一句都不合适就不说（返回 null）
//   once：'game' 一次游戏里只说一次（如“好久不见”）；pri：同时合适时优先（大的先）
//   文字里的 {名字} 由调用时的变量填（如 {place}、{call}、{item}、{where}）
export const LINES = {
  // ---------- 爷爷：出门、到了、办完事 ----------
  'go.depart':      { who: 'elder', say: '去{place}', cls: '', dur: 2 },
  'go.calendar':    { who: 'elder', say: '今天星期四，听讲座去', cls: 'good' },
  'go.movie':       { who: 'elder', say: '走，看电影去！', cls: 'good', dur: 2.5 },
  'go.movieLate':   { who: 'elder', say: '哎呀，几点了？', cls: 'q', dur: 2.5 },
  'go.hike':        { who: 'elder', say: '跟我来！', cls: 'good', dur: 2.5 },
  'go.hurry':       { who: 'elder', voice: 'hes', say: ['得走快点了。', '快到点了，走快点。'], cls: 'q', dur: 2.5 },
  'go.giveUp':      { who: 'elder', say: '算了，回家吧', cls: 'bad', dur: 3 },
  'go.wrongPlace':  { who: 'elder', say: '今天星期四！讲座！', cls: 'q', dur: 3 },
  'task.shopNote':  { who: 'elder', voice: 'happy', say: '都买齐了', cls: 'good' },
  'task.shopDone':  { who: 'elder', say: '买齐了', cls: 'good' },
  'task.shopSome':  { who: 'elder', say: '差不多了吧', cls: 'q', dur: 2 },
  'task.chess':     { who: 'elder', say: '来来来，杀一盘！', cls: 'good', dur: 3 },
  'task.rx':        { who: 'elder', say: '好了', cls: 'good' },
  'task.tea':       { who: 'elder', voice: 'happy', say: '好，好，回家泡上！', cls: 'good' },
  'task.teaMiss':   { who: 'elder', say: '明天再来吧……', cls: 'q', dur: 2.5 },
  'task.movie':     { who: 'elder', voice: 'happy', say: '开演了，快坐下！', cls: 'good', dur: 3 },
  'task.match':     { who: 'elder', voice: 'happy', say: '我来报到！', cls: 'good', dur: 3 },
  'task.hikeDone':  { who: 'elder', voice: 'happy', say: '走完啦！', cls: 'good', dur: 2.5 },
  'task.kid':       { who: 'elder', voice: 'happy', say: '慢点跑！', cls: 'good', dur: 3 },
  // ---------- 爷爷：家里的事 ----------
  'home.pillbox':   { who: 'elder', say: '今天这格，吃了', cls: 'good' },
  'home.medsTwice': { who: 'elder', say: '又吃了一片', cls: 'bad' },
  'home.stove':     { who: 'elder', say: '哎，锅！', cls: 'good' },
  'home.burnt':     { who: 'elder', say: '我怎么连这个都……', cls: 'bad', dur: 3 },
  'home.song':      { who: 'elder', say: '♪ 哼着年轻时的老调子……', cls: 'good', dur: 3 },
  'home.clock':     { who: 'elder', say: '好，六点十分叫我', cls: 'good', dur: 2.5 },
  'home.phone':     { who: 'elder', say: '喂？', cls: 'q', dur: 2 },
  'home.eggs':      { who: 'elder', say: '白给的鸡蛋！', cls: 'good', dur: 2 },
  // ---------- 爷爷：路上认路 ----------
  'way.found':      { who: 'elder', voice: 'found', say: ['噢，是这儿！', '对了，就是这条路。', '这下认出来了。'], cls: 'good' },
  'way.lost':       { who: 'elder', voice: 'lost', say: ['不对……这是哪儿？', '咦，这条路不对吧？', '走岔了……'], cls: 'bad', dur: 3 },
  'way.hesitate':   { who: 'elder', say: '？', cls: 'q', dur: 1.5 },
  'way.changed':    { who: 'elder', voice: 'hes', say: '电影院呢？', cls: 'q', dur: 2.5 },
  'way.detour':     { who: 'elder', voice: 'hes', say: '修路了？得绕……', cls: 'q', dur: 2.5 },
  'way.stuck':      { who: 'elder', say: '……', cls: 'q', dur: 1.2 },
  'way.oldCinema':  { who: 'elder', voice: 'found', say: '这不就是当年的老电影院嘛！', cls: 'good', dur: 2.5 },
  'way.forgetRoute':{ who: 'elder', voice: 'hes', say: '下一步……往哪来着？', cls: 'q', dur: 2.5 },
  'way.routeStep':  { who: 'elder', say: '到{place}了', cls: 'good', dur: 1.2 },
  'way.askWay':     { who: 'elder', say: '请问，{where}怎么走？', cls: '', dur: 3.5 },
  'way.escort':     { who: 'elder', voice: 'help', say: '你来啦', cls: 'good' },
  // ---------- 爷爷：犹豫时刻 ----------
  'moment.self':    { who: 'elder', voice: 'self', say: ['想起来了', '对，是这样。'], cls: 'good', dur: 2 },
  'moment.told':    { who: 'elder', say: '好，好', cls: 'good', dur: 2 },
  'moment.fail':    { who: 'elder', say: '……', cls: 'q', dur: 2 },
  // ---------- 爷爷：托带的事 ----------
  'favor.remember': { who: 'elder', voice: 'happy', say: '对了，{call}托我带{item}！', cls: 'good', dur: 3, when: { leg: 'go' } },
  'favor.giveOnWay':{ who: 'elder', say: '{call}，你要的{item}！', cls: 'good', dur: 2.5, when: { leg: 'back' } },
  'favor.forgot':   { who: 'elder', voice: 'lost', say: '哎呀，{call}的{item}忘带了……', cls: 'q', dur: 3 },
  // ---------- 爷爷：路上偶遇 ----------
  'meet.askSun':    { who: 'elder', say: '老孙！{where}是往这边吧？', cls: 'good', dur: 3 },
  'meet.chatSun':   { who: 'elder', say: '哟，老孙！身体还硬朗？', cls: 'good', dur: 3 },
  'meet.stall':     { who: 'elder', say: '糖葫芦……小时候最爱吃', cls: '', dur: 3 },
  // ---------- 老孙 ----------
  'sun.guide':      { who: 'acq', say: '走这边！前头不认得再问问。' },
  'sun.chat':       { who: 'acq', say: [{ t: '老李！好久不见～', once: 'game', pri: 1 }, { t: '老李，又碰上啦！' }] },
  // ---------- 孙女 ----------
  'kid.here':       { who: 'kid', say: '爷爷！我在这儿！' },
  // ---------- 邻居：打招呼（按时段、去／回、天气挑；一句都不合适就只挥手）----------
  // 早上问早饭（十点前）；出门问去哪；回家才说“回来啦”；说“天快黑”要在傍晚
  'nb.greet.wang':  { who: 'wang', say: [
    { t: '早啊老李，早饭吃了没？', when: { to: 600, leg: '!back' }, pri: 1 }, { t: '老李，这是上哪儿去呀？', when: { from: 600, to: 900, leg: '!back' }, pri: 1 },
    { t: '出门呀？慢点走～', when: { from: 660, leg: '!back' } }, { t: '回来啦？天快黑了！', when: { from: 1000, leg: 'back' }, pri: 1 }, { t: '下雨了，慢点走！', when: { rain: true }, pri: 2 }] },
  'nb.greet.li':    { who: 'li', say: [
    { t: '老李，出门啊？', when: { to: 600, leg: '!back' }, pri: 1 }, { t: '吃过了吧？', when: { from: 600, to: 900, leg: '!back' }, pri: 1 },
    { t: '路上当心车！', when: { from: 660, leg: '!back' } }, { t: '老李，回来啦？', when: { leg: 'back' }, pri: 1 }, { t: '雨天路滑，当心！', when: { rain: true }, pri: 2 }] },
  'nb.greet.zhao':  { who: 'zhao', say: [
    { t: '老李——出去遛弯儿呀？', when: { to: 600, leg: '!back' }, pri: 1 }, { t: '吃了吗您？', when: { from: 600, to: 900, leg: '!back' }, pri: 1 },
    { t: '慢慢走，不着急～', when: { from: 660, leg: '!back' } }, { t: '回家啦？慢着点～', when: { leg: 'back' }, pri: 1 }, { t: '下雨喽，慢慢走～', when: { rain: true }, pri: 2 }] },
  'nb.greet.chen':  { who: 'chen', say: [
    { t: '李叔，早！吃早饭了没？', when: { to: 600, leg: '!back' }, pri: 1 }, { t: '李叔，吃了吗？', when: { from: 600, to: 900, leg: '!back' }, pri: 1 },
    { t: '回头来店里坐坐！', when: { from: 660, leg: '!back' } }, { t: '李叔，回来啦！', when: { leg: 'back' }, pri: 1 }, { t: '李叔，带伞没？', when: { rain: true }, pri: 2 }] },
  // 邻居：他走岔了（各人口吻）、指方向、道谢
  'nb.lost.wang':   { who: 'wang', say: '哎哟老李，走岔啦？' },
  'nb.lost.li':     { who: 'li', say: '老李，这边不对。' },
  'nb.lost.zhao':   { who: 'zhao', say: '老李啊——走错喽。' },
  'nb.lost.chen':   { who: 'chen', say: '李叔，这边走不通！' },
  'nb.way':         { who: 'nb', say: '往{target}是这边～' },
  'nb.thanks.wang': { who: 'wang', say: '谢谢老李，还记着呢！' },
  'nb.thanks.li':   { who: 'li', say: '谢谢老李，还记着呢！' },
  'nb.thanks.zhao': { who: 'zhao', say: '谢谢老李，还记着呢！' },
  'nb.thanks.chen': { who: 'chen', say: '谢谢李叔，还记着呢！' },   // 陈老板是晚辈，叫“李叔”
  // ---------- 下棋的老朋友、老电影（背景里的话，随机挑）----------
  'bg.friend':      { who: 'friend', say: ['将军！', '这步臭棋！', '哈哈，你这步棋，我早看出来了。', '好棋，好棋！'] },
  'bg.elderChess':  { who: 'elder', voice: 'chess', say: ['看我的！', '嘿，这步妙吧？'] },
  'bg.film':        { who: 'film', say: ['同志们，跟我来！', '乡亲们，好日子就要来啦！', '山那边，就是咱们的家乡。'] },
};

// ---------- 关卡里按剧本走的话（顺序由关卡定；配音按文字查，驿站老板、裁判加前缀）----------
export const SCRIPT = {
  vendor: { hello: '来看看，今天的菜都新鲜！', pick: ['好嘞，给您装上。', '这个好，您眼光准。', '称好了，放篮子里了。', '给您挑好的！'], more: '您还要点别的不？',
    drop: '不要啦？', bye: '拿好，慢走～', fine: '好嘞，您慢慢挑。', narrow: '做{dish}啊？您看看这几样。', bag: '好嘞，给您装袋。' },
  // 第 1 天菜摊上他想不起来买什么：你先提醒他想想做什么菜，还想不起就告诉他早上说的菜名，他再跟摊主说
  // 开场（opening.js）：他在陌生路口犹豫、认出路；刘师傅指路（配音加 li 前缀）
  opening: { hes: '……是往这边吗？', found: '噢，是这儿！' },
  openingLi: { way: '往公园棋亭是这边～' },
  shop: { think: '做什么菜来着……我想想。', dish: '对对！老板，今天做{dish}。' },
  courier: { ask: '取件码多少？', ok: '对上了，是您的快递，拿好！', no: '这个码对不上……您回去看看短信？' },
  referee: { start: '照着棋谱，把棋子摆好。', ok: '摆得一子不差！请开始。', fix: '差了几个子，我帮您挪一挪。' },
  kid: { steps: '爷爷教我包饺子！', stepsOk: '好耶！包好啦！' },
  // 诈骗电话：[谁, 话, 这句露出的破绽…]（fake＝冒充女儿的骗子，me＝爷爷）
  scam: [
    ['fake', '喂，爸！猜猜我是谁？', 'identity'],
    ['me', '嗯……是闺女吧？'],
    ['fake', '对呀爸，是我！我感冒了，嗓子有点哑。', 'identity'],
    ['me', '哎哟，那得多喝水。'],
    ['fake', '手机也摔坏了，这是新号码，旧的先别打了。', 'identity'],
    ['me', '怎么了，声音这么急？'],
    ['fake', '我开车……不小心把人撞伤了。', null],
    ['me', '啊……人怎么样了？你没伤着吧？'],   // 09-28 用户试听后选定（原句句首惊叫念得不像他）
    ['fake', '我没事。可对方说，不马上赔两万块，就要报警！', 'urgent', 'money'],
    ['fake', '这事千万别跟别人说，传出去我工作就没了。', 'secret'],
    ['me', '两万……你别急，爸想办法。'],
    ['fake', '你去银行，给对方这个卡号转账。', 'account'],   // 用“转账”：配音把单独的“转”念成四声
    ['fake', '银行的人要是问，你就说是给亲戚还钱。', 'coach'],
    ['fake', '要是银行人多，手机上转账也行，收到验证码念给我听。', 'code'],
    ['fake', '爸，你最疼我了，快点呀，来不及了！', 'urgent'],
  ],
  scamElder: { pact: '“等等——要钱的事，我们家说好了：先挂了，问问家里。”', panic: '“闺女出事了，我这就去银行……”', doubt: '“可人家说得有鼻子有眼的，我闺女的声音我还能听错？”' },
  daughter: '“爸？我在单位上班呢，好好的！谁说我出事了？”',
};
// 关卡里谁的配音加前缀
export const SCRIPT_PREFIX = { courier: 'courier', referee: 'referee', openingLi: 'li' };

// 配音查找用的前缀（爷爷、孙女不加）；nb 是“哪位邻居说”由调用方给
export const VOICE_PREFIX = { elder: '', kid: '', acq: 'sun', wang: 'wang', li: 'li', zhao: 'zhao', chen: 'chen', friend: 'friend', film: 'film', courier: 'courier', referee: 'referee' };
export const voiceKeyOf = (who, text) => (VOICE_PREFIX[who] ? VOICE_PREFIX[who] + '|' : '') + text;

const fits = (w, ctx) => !w || ((w.from == null || ctx.t >= w.from) && (w.to == null || ctx.t < w.to)
  && (!w.leg || (w.leg === '!back' ? ctx.leg !== 'back' : ctx.leg === w.leg)) && (w.rain == null || !!ctx.rain === w.rain));
const fill = (t, vars) => t.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
// 按编号、情境挑一句（纯函数：不碰画面）。mem：{ day: {}, game: {} }，记着今天说过哪些、这局说过哪些。返回 { who, text, cls, dur } 或 null（不合适就不说）
export const REPEAT_GAP = 60;   // 分钟（游戏时间）：同一个人这么久之内不重复同一句（linerules 检查用同一个数）
export function pickLine(id, ctx = {}, vars = {}, mem = { day: {}, game: {} }) {
  const L = LINES[id]; if (!L) throw new Error('台词表里没有：' + id);
  if (!fits(L.when, ctx)) return null;
  const all = (Array.isArray(L.say) ? L.say : [L.say]).map((s, i) => typeof s === 'string' ? { t: s, i } : { ...s, i });
  // 同一个人一小时内不重复说完全相同的一句（09-28：王阿姨连说两遍“早啊老李”——只有一句合适时，原来会退回去再说一遍）；没别的可换就不开口（画面上照样挥手、指路）
  const last = (mem.day.__said ||= {}), key = (s) => L.who + '|' + fill(s.t, vars);
  const ok = all.filter(s => fits(s.when, ctx) && !(s.once === 'game' && mem.game[id + '#' + s.i]) && !(ctx.t != null && last[key(s)] != null && ctx.t - last[key(s)] < REPEAT_GAP));
  if (!ok.length) return null;
  const said = (mem.day[id] ||= []);
  // 优先：没说过的 > 优先级高的 > 表里靠前的；都说过了就换一句和上一次不同的
  const fresh = ok.filter(s => !said.includes(s.i));
  const pool = (fresh.length ? fresh : ok.filter(s => s.i !== said[said.length - 1])).sort((a, b) => (b.pri || 0) - (a.pri || 0));   // 稳定排序：同优先级按表里顺序，于是依次轮换
  const s = pool[0] || ok[0];
  said.push(s.i); if (s.once === 'game') mem.game[id + '#' + s.i] = true;
  if (ctx.t != null) last[key(s)] = ctx.t;
  return { who: L.who, text: fill(s.t, vars), cls: L.cls ?? '', dur: L.dur ?? 2.5 };
}
// 全部可能说出的句子（配音清单与检查用）；带 {变量} 的由调用方给出可能的取值
export function allLineTexts(varsOf = () => [{}]) {
  const out = [];
  for (const [id, L] of Object.entries(LINES)) for (const s of Array.isArray(L.say) ? L.say : [L.say]) for (const v of varsOf(id)) out.push({ id, who: L.who, text: fill(typeof s === 'string' ? s : s.t, v) });
  return out;
}
