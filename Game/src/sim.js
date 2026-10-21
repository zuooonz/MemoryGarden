// 一天的模拟：一天的流程、目标、犹豫时刻、玩家介入与计分。与渲染解耦，通过回调通知表现层。
// 行走与认路（每到路口怎么选、沿路走、门口算到、偶遇）在 walk.js，犹豫时刻（等一等／提示／告诉／放手）在 moments.js，都挂到 Sim 上。
import { TASK_ARRIVE } from './tasks.js';
import { PLACES, OLD_LANDMARKS, NEIGHBORS, DAYS, SUPPORTS, nid, FAVORS } from './data.js';
import { clamp, rng } from './util.js';
import { pickLine, REPEAT_GAP, LINES } from './lines.js';
import { installWalk } from './walk.js';
import { installMoments } from './moments.js';

export const MIN_PER_SEC = 3;     // 1× 速度下每真实秒经过的游戏分钟

// 约好的事过了时间还能赶上一部分的宽限（分钟）：棋友多等一会儿、电影还有后半场、孙女有老师陪着等、讲座与排练还没散
export const LATE_GRACE = { chess: 30, movie: 30, pick: 30, talk: 30, choir: 30 };
export const AUTO_STAR = 70;   // “他自己办的”星：自己办的比例（及时帮一把的事算一半）≥ 七成（10-06 暂定，原三分之二）
export const LOST_WORRY = 45;   // 一天里在外面迷路转了这么多分钟，家里就不放心（他的日子，09-27 暂定）
export class Sim {
  constructor(graph, persist, hooks) {
    this.g = graph;
    this.p = persist;          // 跨天保留：{ signs, photos, home, neighbors }（均为 Set）、leaked、carry（昨天留给今天的，见 carryOut）
    this.h = hooks;
    this.homeNode = nid(...PLACES.home.node);
    this.oldNodes = new Map(OLD_LANDMARKS.map(l => [nid(...l.node), l]));
    this.neighborNodes = new Map(NEIGHBORS.map(n => [n.id, nid(...n.node)]));
    this.placeNodes = new Set(Object.values(PLACES).map(p => nid(...p.node)));
    // 门：每个地点的门在 node—doorTo 这段路的中点（见 data.js PLACES）
    this.doors = {}; this.gates = {};   // doors[地点]＝正门；gates[地点]＝全部门（正门在前）
    for (const [k, p] of Object.entries(PLACES)) {
      if (!p.doorTo) continue;
      const list = [[p.node, p.doorTo, p.doorAt], ...(p.gates || [])].map(([n, t, at], idx) => {
        const a = nid(...n), b = nid(...t);
        return graph.adj[a].includes(b) ? { key: k, idx, a, b, pos: graph.pos[a].clone().lerp(graph.pos[b], at ?? 0.5) } : null;   // 数据写错（两个路口不相邻）就不用这个门
      });
      if (list[0]) this.doors[k] = list[0];
      this.gates[k] = list.filter(Boolean);
    }
  }

  startDay(dayIdx, seed = 1) {
    this.lineMem = { day: {}, game: (this.lineMem?.game || {}) };   // 台词：今天说过哪些（每天清）、这局说过哪些（跨天）
    this.events = [];
    const d = DAYS[dayIdx];
    this.day = d; this.dayIdx = dayIdx;
    this.r = rng(seed * 97 + dayIdx * 13 + 5);
    this.time = d.goals[0].at - 20;
    this.energy = d.energy + (this.easy ? 1 : 0);
    this.phase = 'plan';
    this.goals = d.goals.map(g => ({ ...g, status: 'pending', note: '', helped: false }));
    // 家里不放心（worry）：今天每趟出门都有人陪；他想让你陪（lean）：第一趟有人陪
    if (this.p.carry === 'worry') for (const g of this.goals) { if (g.kind === 'trip') g.accompany = 'worry'; }
    else if (this.p.carry === 'lean') { const g = this.goals.find(x => x.kind === 'trip'); if (g) g.accompany = 'lean'; }
    this.mood = 60; this.anxiety = 0; this.moodLog = {};
    // 他的日子（后果跨天，09-27）：昨天的结果影响今天——出了事或帮得太多，家里不放心，第一趟出门要有人陪；顺顺利利，今天精神好
    this._homeWait = 0; this.carryIn = this.p.carry || null; this._gaveUp = false; this._outLate = false; this.lostMin = 0; this._accMood = false; this._strayed = false;
    if (this.carryIn === 'spirit') this.mood = 64;
    this.log = [];
    this.helps = { cue: 0, tell: 0, walk: 0, neighbor: 0, passerby: 0, wait: 0, call: 0, callSelf: 0, walkTimely: 0, walkEarly: 0, tellTimely: 0, tellEarly: 0 };
    this.used = {};
    this.raining = false;
    // 变了样的老地标（从出现那天起一直存在）
    this.changed = new Set(DAYS.slice(0, dayIdx + 1).flatMap(x => x.changed || []).map(id => nid(...OLD_LANDMARKS.find(l => l.id === id).node)));
    // 病程变化（10-06 暂定）：后几天，原来熟的路口起淡雾（从出现那天起一直在；按天定好，和玩家做得好不好无关）
    this.faded = new Set(DAYS.slice(0, dayIdx + 1).flatMap(x => x.fade || []).map(n => nid(...n)));
    this.e = {
      mode: 'home', node: this.homeNode, next: null, prev: null,
      pos: this.g.pos[this.homeNode].clone(), target: null, goal: null, leg: null,
      drift: 0, lost: false, wait: 0, guided: 0, escort: false, noPhone: false, stuckT: 0, taskT: 0, after: null,
    };
    if (this.doors.home) this.e.pos.copy(this.doors.home.pos);   // 一天从家门口（门那段路的中点）开始：往哪边走就直接从门口出发
    this.moment = null; this._enc = 0;
    this.favor = FAVORS[dayIdx] ? { ...FAVORS[dayIdx], got: null, closed: false } : null;
    this.ended = false;
    this.dayToken = (this.dayToken || 0) + 1;
    this._rd = new Map();
    this.dayKnown = new Set();   // 他的地图：今天认出过的路口（第二天清空——近事记不牢；路标、照片、邻居另算，一直有效）
    this._greeted = new Set(); this._toldDetour = false;
    const key = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
    this.edgeKey = key;
    this.blocked = new Set((d.blocked || []).map(([a, b]) => key(nid(...a), nid(...b))));
    this.nearBlock = new Set();
    for (const k of this.blocked) k.split('-').forEach(x => this.nearBlock.add(+x));
    // 便签是当天写的：每天要重新放
    this.p.home.delete('note'); this.p.home.delete('song');   // 便签、老歌只管当天
  }

  // ---------- 支持放置 ----------
  // 这一样要花多少精力（10-13 删掉“往事路标”：原来往事里的老地方一带第一块路标不花精力）
  costOf(type) { return SUPPORTS[type]?.cost ?? 99; }
  canPlace(type, target) {
    const s = SUPPORTS[type];
    if (!s || this.energy < this.costOf(type, target) || this.phase === 'summary') return false;
    if (s.target === 'node') return typeof target === 'number' && !this.p.signs.has(target) && target !== this.homeNode;   // 老照片改挂家里后，变了样的老地方路口也能放路标
    if (s.target === 'changed') return typeof target === 'number' && this.changed.has(target) && !this.p.photos.has(target);
    if (s.target === 'home') return !this.p.home.has(s.slot);
    if (s.target === 'neighbor') return !this.p.neighbors.has(target);
    return false;
  }
  place(type, target) {
    if (!this.canPlace(type, target)) return false;
    const s = SUPPORTS[type], cost = this.costOf(type, target);
    this.energy -= cost;
    if (s.target === 'node') this.p.signs.add(target);
    else if (s.target === 'changed') this.p.photos.add(target);
    else if (s.target === 'home') this.p.home.add(s.slot);
    else this.p.neighbors.add(target);
    this._rd.clear();
    this.event('player', { op: 'place', support: type, at: target ?? null });
    this.say(`放置了「${s.name}」`);
    return true;
  }

  begin() {
    this.phase = 'live'; this.event('dayStart'); this.say(`${this.day.weekday}，新的一天开始了`);
    if (this.has('photo')) { this.addMood(3, 'support'); this.say('出门前，他看了一会儿墙上的老照片', 'good'); this.h.photoLook?.(); }   // 怀旧：心里踏实
  }

  // 某个支持发挥了作用
  use(type) {
    this.used[type] = (this.used[type] || 0) + 1;
    if (type !== 'song') this.addMood(1, 'support');
    const g = this.moment?.goal || this.e.goal || this.activeGoal();
    if (g) { g.used ||= {}; g.used[type] = (g.used[type] || 0) + 1; }
    this.h.used?.(type);
  }

  // ---------- 工具 ----------
  // 心情记账：七类来源——做喜欢的事 fun、自己做到 self、支持帮上忙 support、熟人招呼 meet、着急迷路 worry、被替他做 donefor、没办成 fail
  addMood(d, cat, silent = false) {
    if (cat === 'fun' && d > 0) d *= 0.3;   // 喜欢的事只按三成加：不让当天安排好的开心事盖住一整天，心情主要看你怎么帮（09-28，原来一半）
    const before = this.mood;
    this.mood = clamp(this.mood + d, 0, 100);
    const real = this.mood - before;
    this.moodLog[cat] = (this.moodLog[cat] || 0) + real;
    if (!silent && Math.abs(real) >= 1) this.h.mood?.(Math.round(real), cat);
  }
  say(msg, kind = '') { const entry = { t: this.time, msg, kind }; this.log.push(entry); this.h.log?.(entry); }
  // ---------- 事件流（情境系统 S4-1）：每件事一条，带完整情境；台词、声音、画面反应、自检都从这里取 ----------
  // 事件种类见 Docs/架构.md“事件流”。只记录，不改变规则结果（不用随机数、不改状态）。
  ctx() {
    const e = this.e;
    return { day: this.dayIdx + 1, t: Math.round(this.time), node: e.node, leg: e.leg || null, mode: e.mode, goal: e.goal?.id || null, task: e.goal?.task || null,
      place: e.goal?.place || null, target: e.target != null ? this.targetName() : null, rain: !!this.raining, lost: !!e.lost, escort: !!e.escort };
  }
  event(kind, data = {}) {
    const ev = { kind, ...this.ctx(), ...data, prev: this.events.length ? this.events[this.events.length - 1].kind : null };
    this.events.push(ev); this.h.event?.(ev);
    return ev;
  }
  // 他在这个路口认出了路：今天剩下的时间里算他认得（雾散开）
  learnNode(node) {
    if (node == null || this.familiar(node)) return;   // 已经认得（路标、老地方、离家近、今天认出过）就不重复记
    this.dayKnown.add(node); this._rd.clear();
    this.event('learn', { at: node }); this.h.mapChanged?.(node);
  }
  // 剧情里一下子过去的时间（等他想、提示、一起做小关卡、晚出门）：只从这里加，画面在时钟旁显示“+N 分钟”；平时走的时间在 update 里
  advance(min, why = '') { this.time += min; this.event('timeJump', { min, why }); this.h.timeJump?.(min, why); }
  // 人物说一句：说什么由台词表（lines.js）按情境挑（几种说法轮换、不合情境就不说）；什么时候说由这里的规则定
  speak(id, vars = {}) { const l = pickLine(id, this.ctx(), vars, this.lineMem); if (l) this.bubble(l.text, (l.cls || '') + (LINES[id].voice ? '' : ' mute'), l.dur); return l; }   // 台词表里没标配音类别的话按设计不念（mute：不找录音、不记“缺配音”）
  line(id, vars = {}) { return pickLine(id, this.ctx(), vars, this.lineMem); }   // 只取一句不显示（邻居、老孙这些由画面层说）
  bubble(text, cls = '', dur = 2.5) {   // 他头顶的一句话：和台词一样，一小时内不重复同一句（09-28：他打来电话时，每次都冒“我……有点找不着路了”）
    if (/[一-鿿]/.test(text)) { const said = (this.lineMem.day.__said ||= {}), k = 'elder|' + text; if (said[k] != null && this.time - said[k] < REPEAT_GAP) return; said[k] = this.time; }
    this.h.bubble?.(text, cls, dur);
  }
  has(slot) { return this.p.home.has(slot); }


  // ---------- 目标 ----------
  activeGoal() { return this.goals.find(g => g.status === 'active'); }
  finishGoal(g, status, note = '') { this.event('goalEnd', { goalId: g.id, status, note }); if (status !== 'fail') setTimeout(() => this.h.goalDone?.(g), 0);
    if (status === 'done' && !g.helped && !g.wrongPlace && g.kind === 'trip') this.addMood(5, 'self'); g.status = status; g.note = (g.late && status !== 'fail' && !note.includes('迟到') ? '晚到了，' : '') + (g.wentWrong ? '先去错了公园，' : '') + note; this.h.goals?.(); }
  startGoal(g) {
    g.status = 'active';
    this.h.goals?.();
    if (g.kind === 'home') return this.homeTask(g);
    if (g.pre === 'weekday' && !g.preDone) {
      g.preDone = true;
      if (this.has('calendar')) { this.use('calendar'); this.say('他看了眼大字日历：“星期四，讲座。”', 'good'); this.speak('go.calendar'); }
      else return this.openMoment('weekday', g);
    }
    this.leave(g, PLACES[g.place]);
  }
  leave(g, pl) {
    const e = this.e;
    // 当天第一次出门时，他念叨今天的菜单（学习）；之后隔着别的事，到菜市场再回忆
    const gm = this.goals.find(x => x.menu && x.recall !== false && !x.learned && (x.status === 'pending' || x.status === 'active'));
    if (gm && !this.has('note') && this.h.level) {
      gm.learned = true;
      return this.levelEvent('learn', { menu: gm.menu }, () => this.leave(g, pl));
    }
    // 看电影：下午修好的闹钟六点十分响；没修好就看电视看过了头
    if (g.task === 'movie' && !g.clocked) {
      g.clocked = true;
      const ck = this.goals.find(x => x.task === 'clock');
      if (ck && ck.status === 'done') { this.say('六点十分，闹钟“叮铃铃”响了，他放下遥控器，准时出门', 'good'); this.speak('go.movie'); }
      else if (ck) { this.advance(30, '看电视看过了头'); g.late = true; this.say('闹钟没修好，他看电视看过了头，晚出门半小时', 'q'); this.speak('go.movieLate'); }
    }
    if (g.level === 'digits' && !g.digits) {
      const d = []; while (d.length < 5) { const x = 1 + Math.floor(this.r() * 9); if (x !== d[d.length - 1]) d.push(x); }
      g.digits = d;
      this.say('出门前，手机收到驿站的短信：快递到了', 'q');
      this.h.sfx?.('phone');
      return this.levelEvent('digitsLearn', { digits: d }, () => { this.e.noPhone = true; this.leave(g, pl); });   // 看完短信把手机放在桌上：这一趟打不了电话
    }
    e.goal = g; e.gate = this.gateOf(g, e.node); e.target = this.goalNode(g, e.node); e.leg = 'go'; this.event('depart', { gate: e.gate ? [e.gate.a, e.gate.b] : null }); e.hold = !!this.h.visualHold; e.holdT = 0;   // 出发时定下走哪扇门（行走、进出门、路线预览都用它）
    e.mode = 'walk'; e.prev = null; e.drift = 0; e.lost = false; e.calledBack = false; e.routePanic = false; e.trouble = false; e.asks = 0;   // asks：这一趟在路口问过他几次
    e.next = this.correctNext(e.node, e.target, null);
    this.say(`出门，去${pl.name}`);
    if (g.accompany && !e.escort) {   // 昨天的结果：这一趟你陪他去（不是你选的，不算“陪早了”，但这件事不算他自己办的）
      e.escort = true; this.markHelped(g); this.event('accompany', { why: g.accompany });
      this.say(g.accompany === 'worry' ? '家里不放心，这一趟你陪他去。他嘟囔：“我又不是找不着……”' : '他说想让你陪着去：“你跟着，我心里有底。”', 'help'); this.h.escort?.(true);
      if (!this._accMood) { this._accMood = true; this.addMood(g.accompany === 'worry' ? -6 : -3, 'donefor'); }   // 只在第一趟不高兴一次   // 被当成需要人看着：心里不是滋味
    }
    if (g.menu && !g.wrongPlace) {
      this.say(this.has('note') ? `他照着便签：${g.menu.say || '今天要做' + g.menu.dish}` : '他出门去买菜');
      this.h.menu?.(g.menu, this.has('note'));
    } else this.speak('go.depart', { place: pl.name });
  }
  homeTask(g) {
    switch (g.task) {
      case 'meds':
        if (this.has('pillbox')) { this.use('pillbox'); this.finishGoal(g, 'done', '看药盒吃了今天那格'); this.say('看了看药盒，吃了今天那一格', 'good'); this.speak('home.pillbox'); this.h.sfx?.('good'); }
        else this.openMoment('meds', g);
        break;
      case 'stove':
        this.say('他开火做饭，这时电话响了，是老朋友打来的');
        if (this.has('stove')) {
          this.use('stove');
          this.finishGoal(g, 'done', '提醒铃响，关了火');
          this.say('灶台提醒响了，他挂了电话去关火', 'good'); this.speak('home.stove'); this.h.sfx?.('good'); this.addMood(5, 'support');
        } else this.openMoment('stove', g);
        break;
      case 'cook':
        if (this.has('song')) { this.use('song'); this.say('收音机里放着那首老歌，他一边哼一边揉面', 'good'); this.speak('home.song'); this.addMood(10, 'support'); }
        this.say('孙女来了，爷爷系上围裙：“今天我当老师。”', 'good');
        this.levelEvent('steps', {}, (res) => {
          const c = res.auto ? 3 : (res.correct ?? 3);
          g.stepsCorrect = c;
          if (c === 3) { this.finishGoal(g, 'done', '三步都学会了，一起包完了饺子'); this.say('你照着他教的做得一步不差。他很得意：“这手艺，没丢！”', 'good'); this.addMood(14, 'fun'); this.h.happy?.(); }
          else if (c === 2) { this.finishGoal(g, 'done', `学对 2 步，一起包完了饺子`); this.say('有一步你弄错了，他笑着纠正过来，饺子包得很顺', 'good'); this.addMood(10, 'fun'); this.h.happy?.(); }
          else { this.say('步骤乱了，他耐心地又示范了一遍。包到一半，他自己也停住了……', 'q'); this.openMoment('cook', g); }
        });
        break;
      case 'clock':
        this.say('午后，他翻出摔坏的闹钟：数字掉了，指针也停了', 'q');
        this.levelEvent('clock', { h: 2, m: 30, text: '两点半' }, (res) => {
          if (res.q >= 0.99) { this.finishGoal(g, 'done', '闹钟修好了'); this.say('闹钟走起来了。他又把闹铃定在六点十分', 'good'); this.speak('home.clock'); this.addMood(4, 'self'); }
          else { this.finishGoal(g, 'partial', '闹钟没修好'); this.say('闹钟还是不走。他想：“到点了我自己看着点吧。”', 'q'); }
        });
        break;
      case 'scam': {
        this.h.sfx?.('phone');
        const pact = this.has('pact');
        this.say('电话响了，是个陌生号码', 'q');
        this.speak('home.phone');
        this.levelEvent('scamCall', { pact, leaked: !!this.p.leaked }, (res) => {
          if (res.auto) res = { outcome: pact ? 'self' : 'told', caught: 0 };
          if (pact) this.use('pact');
          if (res.outcome === 'self') { this.finishGoal(g, 'done', pact ? '想起约定，挂断核实' : '听你讲完破绽，自己识破'); this.say('他挂了电话，打给闺女核实——是骗子', 'good'); this.addMood(4, 'self'); }
          else if (res.outcome === 'told') { this.markHelped(g, true); this.finishGoal(g, 'done', '你提醒后挂断核实'); this.say('你告诉他这是骗子，他挂了电话', 'help'); this.addMood(-2, 'donefor'); }
          else { this.finishGoal(g, 'fail', '差点转账，被银行柜员拦下'); this.addMood(-18, 'fail'); this.say('他拿着存折去了银行，幸好柜员拦下了', 'bad'); }
        });
        break;
      }
      default: this.finishGoal(g, 'done');
    }
  }

  // ---- 给画面层用的几个口子（sim 的状态只由 sim 自己改；别的模块调这些方法）----
  leaveDay() { this.phase = null; this.moment = null; }   // 回主菜单：这一天不再推进
  setEasy(v) { this.easy = !!v; }   // 设置里的“轻松”
  releaseHold() { if (this.e) this.e.hold = false; }
  setVisualLag(v) { this.visualLag = !!v; }   // 画面上的人落后规则层太多（等过街、等让路、队伍跟不上）：这一天的时钟先停住等他，画面不冲刺去追（10-06）   // 画面上人已走到位（出门、离开地点），规则层可以接着走
  waitAtLeast(min) { if (this.e?.mode === 'task') this.e.taskT = Math.max(this.e.taskT, min); }   // 画面还在演（如孙女正跑出来），办事至少再等这么久

  // 关卡事件：暂停模拟，交给表现层；完成后回调
  levelEvent(name, data, onDone) {
    const ev = { kind: name, event: true, def: { title: name } }, token = this.dayToken;
    this.moment = ev; this.event('level', { level: name });
    // 只接受属于当前这一天、当前这个事件的回调
    const finish = (res) => { if (this.moment !== ev || this.dayToken !== token) return; this.moment = null; this.event('levelEnd', { level: name, q: res?.q ?? null }); onDone(res || {}); this.h.goals?.(); };
    if (this.h.level) this.h.level(name, data, finish); else finish({ q: 1, auto: true });
  }

  deliverOnWay(node) {
    const e = this.e, f = this.favor;
    if (e.leg !== 'back' || !f || f.got !== true || f.closed || node !== this.neighborNodes.get(f.who)) return false;
    f.closed = true; this.addMood(6, 'needed'); this.event('favor', { state: 'giveOnWay', who: f.who });
    this.say(`路过${f.name}家，顺手把${f.item}交给了${f.name}`, 'good'); this.speak('favor.giveOnWay', f);
    this.h.favorThanks?.(f.who, node);
    e.mode = 'task'; e.taskT = 3; e.after = 'resumeWalk';
    return true;
  }
  // ---------- 玩家主动介入 ----------
  canCall() {
    const e = this.e;
    return this.phase === 'live' && !this.moment && ['walk', 'hesitate', 'stuck'].includes(e.mode) && !e.escort && !e.noPhone;
  }
  canEscort() {
    const e = this.e;
    return this.phase === 'live' && !this.moment && ['walk', 'hesitate', 'stuck'].includes(e.mode) && !e.escort && e.target != null;
  }
  // fromHim：他慌了、走不动了，给你打来的（不算你打的电话）
  call(fromHim = false) {
    if (!this.canCall()) return;
    if (fromHim) { this.event('hisCall'); this.h.sfx?.('phone'); }
    else { this.event('player', { op: 'call' }); this.h.sfx?.('phone'); this.helps.call++; }
    if (this.e.lost || this.e.mode === 'stuck' || this.anxiety > 0.2) { this.anxiety = Math.max(0, this.anxiety - 0.3); this.addMood(2, 'you'); }   // 听到你的声音，他安心了些
    const stuck = this.e.mode === 'stuck';
    this.openMoment('lost', this.e.leg === 'go' ? this.e.goal : null, { stuck, fromHim });
    if (fromHim) { this.moment.text = stuck ? '“喂……我不知道这是哪儿了，转了好几圈……”' : '“喂？我……好像走错了，这是哪儿啊？”'; this.h.moment?.(this.moment); }
    if (!stuck && !fromHim) { this.moment.text = this.e.lost || this.e.drift ? '“喂？我……好像走得不太对。”' : this.moment.atHesitate ? '“喂？……这个路口，往哪边来着？”' : `“喂？我在${this.goWhere()}的路上呢。”`; this.h.moment?.(this.moment); }
  }
  escort() {
    if (!this.canEscort()) return;
    this.event('player', { op: 'escort' });
    this.helps.walk++;
    const e = this.e;
    // 时机：他迷路、慌了的时候陪上去是安心；他本来走得好好的，陪着走就成了“你当我不行了？”
    const timely = e.lost || e.mode === 'stuck' || this.anxiety >= 0.5;
    if (timely) { this.helps.walkTimely++; this.addMood(3, 'you'); }
    else { this.helps.walkEarly++; this.addMood(-5, 'donefor'); }
    if (e.leg === 'go' && e.goal) this.markHelped(e.goal, timely);
    e.escort = true; e.lost = false; e.drift = 0; this.anxiety = Math.max(0, this.anxiety - 0.6);
    if (e.mode === 'stuck' || e.mode === 'hesitate') { e.mode = 'walk'; e.next = null; }
    this.say('你赶过去，陪他一起走', 'help');
    this.speak('way.escort');
    this.h.escort?.(true);
  }

  // 他自己办的比例：你替他做的不算；他迷路、慌了，或者等过提示过还不行，你才出手（正是时候）——算一半（10-06 暂定：两件事的天，一件及时帮一把还能拿星）
  selfRatio() {
    const val = { done: 1, partial: 0.5 };
    return this.goals.reduce((s, g) => s + (g.wrongPlace ? 0 : g.helped ? (g.halfSelf ? 0.5 : 0) : 1) * (val[g.status] || 0), 0) / this.goals.length;
  }
  // 记一件事被你帮了：timely＝正是时候（算一半他自己办的）；同一件事里有一次不是时候，就整件算你帮的
  markHelped(g, timely = false) {
    if (!g) return;
    g.halfSelf = !!timely && (!g.helped || !!g.halfSelf);
    g.helped = true;
  }

  // ---------- 主循环 ----------
  update(dtReal, speed) {
    if (this.phase !== 'live' || this.ended || this.moment) return;
    // 事都办完、规则层已经到家，画面里的他和跟着的人还在往家走：时钟也停着等（最多 20 秒），收尾的钟点和模拟一致
    if (this.e?.mode === 'home' && this.h.visualAtHome && !this.h.visualAtHome() && this.goals.every(g => g.status !== 'pending' && g.status !== 'active')) { this._homeWait = (this._homeWait || 0) + (speed > 0 ? dtReal : 0); if (this._homeWait < 20) return; }   // 暂停时不算等了多久
    if (this.visualLag) return;   // 画面上的人还没跟上（等过街、跟随的人还在赶）：这一下时钟也停——画面的等待不占游戏时间，真实游戏和模拟结果一致（10-06；只有画面层会设）
    const dt = dtReal * speed;
    const dm = dt * MIN_PER_SEC;
    this.time += dm;
    const e = this.e;

    if (this.day.rainFrom && !this.raining && this.time >= this.day.rainFrom) {
      this.raining = true; this.event('rain'); this.say('下起雨来，街道看起来都差不多了'); this.h.rain?.(true);
    }
    if (e.mode === 'home' && !this.activeGoal()) {
      const g = this.goals.find(g => g.status === 'pending' && this.time >= g.at);
      if (g && this.h.favorBusy?.() && (this._favorWait = (this._favorWait || 0) + dtReal) < 15) return;   // 邻居正过来拿托带的东西、道谢还没说完：时钟先停着等，下一件事（如驿站短信）别和“谢谢老李”叠在一起（10-13 试玩反馈；最多等 15 秒）
      this._favorWait = 0;
      if (g) { this.startGoal(g); if (this.moment) return; }
    }
    // 陌生来电打到他手机上：在外面也会接到
    const call = this.goals.find(g => g.task === 'scam' && g.status === 'pending' && this.time >= g.at);
    if (call && e.mode !== 'home' && (e.mode === 'walk' || e.mode === 'task' || e.mode === 'hesitate')) {
      call.status = 'active'; this.h.goals?.(); this.event('phoneRing'); this.say('他的手机响了', 'q'); this.homeTask(call); if (this.moment) return;
    }
    const ag = this.activeGoal(), onWay = ['walk', 'hesitate', 'stuck'].includes(e.mode);   // 还在路上（到了门口进门、在里头办事都不算）
    // 赶时间：离约定只剩 30 分钟他还在路上——走得急一点（快约 15%），说一句；画面上时钟变琥珀色
    // 约好的事晚到分档（时间节奏 P2t，暂定）：过了约定时间 LATE_GRACE 分钟以内赶到＝办成一部分（棋下半盘、电影后半场……），再晚才算没赶上
    const grace = ag && LATE_GRACE[ag.task] || 0;
    const hurry = !!(ag && ag.kind === 'trip' && e.leg === 'go' && onWay && ag.until && this.time > ag.until - 30 && this.time <= ag.until + grace);
    if (hurry && !e.hurry) { this.event('hurry', { goalId: ag.id }); this.speak('go.hurry'); }
    e.hurry = hurry;
    if (ag && ag.task === 'match' && e.leg === 'go' && onWay && this.time > ag.until && !ag.late) {
      ag.late = true; this.event('late', { goalId: ag.id }); this.say('比赛已经开始了，他还在路上。裁判说：来了就给补赛', 'q');
    }
    const ARRIVAL_LEVEL = ['digits', 'trail', 'change', 'chess'];
    if (ag && ag.kind === 'trip' && ARRIVAL_LEVEL.includes(ag.level) && ag.task !== 'match' && e.leg === 'go' && onWay && ag.until && this.time > ag.until && !ag.late) {
      ag.late = true; this.event('late', { goalId: ag.id }); this.addMood(-4, 'worry'); this.say(`有点晚了，他还在去${PLACES[ag.place].name}的路上`, 'q');
    }
    if (grace && ag.kind === 'trip' && e.leg === 'go' && onWay && this.time > ag.until && !ag.late) {
      ag.late = true; this.event('late', { goalId: ag.id }); this.addMood(-3, 'worry'); this.say(`约好的时间过了，他还在去${PLACES[ag.place].name}的路上，快点还来得及`, 'q');
    }
    // 没赶上：只在他还在路上时判（已经到了门口正在进门、或在里头办事，就不算晚——原来进门时到了时限会被判没赶上、瞬移回家）
    if (ag && ag.kind === 'trip' && ag.task !== 'match' && !ARRIVAL_LEVEL.includes(ag.level) && e.leg === 'go' && onWay && ag.until && this.time > ag.until + grace) {
      const what = { movie: '电影已经放完了', chess: '棋友已经走了', pick: '孙女等不到人，被老师送回了家', talk: '讲座已经结束了', match: '比赛已经开始，错过了报到', choir: '排练已经结束了' }[ag.task] || '已经太晚了';
      this.finishGoal(ag, 'fail', `没赶上：${what}`);
      this.say(`${what}。他只好往家走`, 'bad');
      this.speak('go.giveUp');
      this.addMood(-10, 'fail');
      e.escort && (e.escort = false, this.h.escort?.(false));
      if (!this.goChain()) { e.leg = 'back'; e.target = this.homeNode; }
    }

    if (e.lost || e.mode === 'stuck' || this.anxiety >= 0.5) e.trouble = true;   // 这一趟出过状况（每次出门清零，见 leave；路口犹豫在 walk.js 记）：人一慌、一分心就容易忘事
    if (this.anxiety > 0) this.addMood(-this.anxiety * dm * 0.12, 'worry', true);   // 迷路时越着急，心情越往下走
    if (e.mode !== 'stuck' && !e.lost) this.anxiety = Math.max(0, this.anxiety - dm * 0.004);

    this.updateElder(dt, dm, dtReal);

    const allDone = this.goals.every(g => g.status !== 'pending' && g.status !== 'active');
    // 当天的关卡还没做完时，这一天顺延（最多 4 小时），保证关卡不会被跳过
    const levelPending = this.goals.some(g => (g.level || g.task === 'cook' || g.task === 'scam' || g.task === 'clock') && (g.status === 'pending' || g.status === 'active'));
    // 兜底：天黑后关卡还没做，你赶过去陪他走（记作你帮的忙）
    if (levelPending && this.time >= this.day.end + 30 && !e.escort && ['walk', 'hesitate', 'stuck'].includes(e.mode) && !this.moment) {
      const g = e.goal || this.activeGoal(); if (g && e.leg === 'go') this.markHelped(g);
      e.escort = true; e.lost = false; e.drift = 0; this.anxiety = 0;
      if (e.mode !== 'walk') { e.mode = 'walk'; e.next = null; }
      this.say('天黑了，你赶过去陪他一起走', 'help'); this.h.escort?.(true);
    }
    // 画面里的他也进了家门才收尾（10-06：原来规则层一到家就结束，画面里他和孙女还在街上，孙女当街消失）
    if ((allDone && e.mode === 'home' && (!this.h.visualAtHome || this.h.visualAtHome())) || (this.time >= this.day.end && (!levelPending || this.time >= this.day.end + 240))) this.endDay();
  }




  // 画面上的人已走到门口／柜台前：接着办事（触发小关卡等）
  visualArrived() {
    const e = this.e;
    if (!e || e.mode !== 'entering') return;
    e._entered = true; this.reachTarget(); e._entered = false;
  }
  reachTarget() {
    const e = this.e;
    // 到了就在门口：从路口那边过来（没走门那段路）时，画面上他走进门，规则层的位置也放到门口——出门时从门口出发、往哪走直接走，不先回路口再折回
    const dr = this.doorFor(e); if (dr) e.pos.copy(dr.pos);
    if (!e._entered) this.event(e.leg === 'back' ? 'home' : e.leg === 'hike' ? 'hikePoint' : 'arrive');   // 进门流程会再调一次，只记第一次
    if (e.escort) { e.escort = false; this.h.escort?.(false); }
    e.guidedAll = false;
    if (e.leg === 'back') {
      e.mode = 'home'; e.target = null; e.leg = null; e.goal = null; e.noPhone = false;
      this.say('回到了家');
      const f = this.favor;
      if (f && f.got !== null && !f.closed) {   // 回到家：把东西送过去，或者发现忘了
        f.closed = true; this.event('favor', { state: f.got ? 'giveAtHome' : 'forgotAtHome', who: f.who });
        if (f.got) { this.addMood(6, 'needed'); this.say(`把${f.item}给${f.name}送了过去。${f.name}直夸他记性好`, 'good'); this.h.favorThanks?.(f.who); }
        else { this.addMood(-2, 'fail'); this.say(`到了家才想起来，${f.name}托带的${f.item}忘了`, 'q'); this.speak('favor.forgot', f); }
      }
      return;
    }
    if (e.leg === 'go' && this.favor && this.favor.got === null && e.goal?.task === this.favor.task) {   // 到了地方：想不想得起邻居托的事
      const f = this.favor, note = this.has('note');
      f.got = note || !(e.trouble || e.goal.late);   // 想不想得起邻居托的事（09-28 用户同意：不再 55% 随机）——这一趟顺顺当当就想得起；犹豫过、迷过路、慌过、晚到了就忘了；贴了便签一定记得
      this.event('favor', { state: f.got ? 'remember' : 'forget', who: f.who, note });
      if (f.got) { if (note) this.use('note'); this.speak('favor.remember', f); this.say(note ? `看了眼便签，顺手给${f.name}带上了${f.item}` : `他想起来${f.name}托带的${f.item}，顺手买上了`, 'good'); }
    }
    if (e.leg === 'hike') {
      if (e.hike && e.hike.length) { e.target = e.hike.shift(); e.mode = 'walk'; e.guidedAll = true; e.next = this.correctNext(e.node, e.target, e.prev); return; }
      e.guidedAll = false; this.h.hike?.(false);
      this.addMood(8, 'fun'); this.say('健步走一圈下来，他走得满头是汗，很开心', 'good'); this.speak('task.hikeDone'); this.h.happy?.();
      e.leg = 'back'; e.target = this.homeNode; e.mode = 'walk'; e.next = this.correctNext(e.node, e.target, e.prev);
      if (this.goChain()) return;
      return;
    }
    // 进门：画面上的人还在从路口往门口、柜台走——先停在“进门中”，等画面报告到位（visualArrived）再办事；最多等 20 分钟（游戏内）兜底
    // 只在画面确实会走进去时等（目标路口在门那段路上；像第 6 天菜市场后门这种别处的入口，到了就办）
    const drIn = this.doorFor(e);
    if (this.h.visualHold && e.leg === 'go' && !e._entered && (!drIn || e.node === drIn.a || e.node === drIn.b)) { e.mode = 'entering'; e.enterT = 0; this.event('enter'); return; }
    const g = e.goal;
    e.mode = 'task'; e.after = 'goHome'; e.taskT = 15;
    if (g.wrongPlace) {
      g.wrongPlace = false; g.wentWrong = true; this.addMood(-4, 'worry');
      this.say('公园里没有人下棋。他愣了一下：“今天星期四！讲座！”赶紧往社区中心走', 'q');
      this.speak('go.wrongPlace');
      e.mode = 'walk'; this.leave(g, PLACES[g.place]);
      return;
    }
    (TASK_ARRIVE[g.task] || TASK_ARRIVE.default)(this, g, e);   // 各种事怎么办：见 tasks.js
  }
  afterTask() {
    const e = this.e;
    e.hold = !!this.h.visualHold; e.holdT = 0;
    if (e.after === 'resume') { e.mode = 'walk'; e.next = this.correctNext(e.node, e.target, e.prev); return; }
    if (e.after === 'resumeWalk') { e.mode = 'walk'; e.next = this.decideNext(true); return; }   // 偶遇之后照常自己判断方向
    if (e.pendingPromo) {
      e.pendingPromo = false; e.afterPromo = true;
      return this.openMoment('leaflet', null);
    }
    if (e.pendingChange && e.goal?.bought && !e.goal.bought.length) e.pendingChange = false;   // 什么都没买：不用结账
    if (e.pendingChange) {
      e.pendingChange = false;
      this.say('付钱的时候，他让你帮着算找零', 'q');
      return this.levelEvent('change', { items: e.goal?.bought?.length ? e.goal.bought : e.goal?.menu?.items }, (res) => {   // 篮子里挑了什么就结什么
        e.changeDone = true;
        if (res.q >= 0.99) { this.addMood(3, 'self'); this.say('每一笔找零都对上了', 'good'); }   // 小关卡只加不扣（09-28 用户定）：做得好他高兴一下，做得不好不扣——不拿玩家的认知表现惩罚他
        else if (res.q >= 0.6) this.say('大部分找零算对了', 'q');
        else this.say('找零没算清，摊主帮着又点了一遍', 'q');
        this.afterTask();
      });
    }
    // 健步走：沿玩家连出的路线走一圈
    if (e.hike && e.hike.length) {
      e.mode = 'walk'; e.leg = 'hike'; e.target = e.hike.shift(); e.prev = null; e.guidedAll = true;
      this.say('健步走出发！他走在最前面', 'good'); this.speak('go.hike'); this.h.hike?.(true);
      e.next = this.correctNext(e.node, e.target, null);
      return;
    }
    e.guided = Math.max(e.guided || 0, 1);   // 刚从这儿出来：门口往哪边走他认得（原来后门两头不算熟悉，一出门就可能走反、到路口再掉头）
    if (this.goChain()) return;
    e.mode = 'walk'; e.leg = 'back'; e.target = this.homeNode; e.prev = null; e.drift = 0; e.lost = false;
    e.next = this.decideNext();
  }
  // 顺路：下一件事如果标了 chain，就不回家，直接去
  goChain() {
    const g = this.goals.find(x => x.status === 'pending');
    if (!g || !g.chain || g.kind !== 'trip') return false;
    g.status = 'active'; this.h.goals?.();
    this.say(`顺路去${PLACES[g.place].name}`);
    this.leave(g, PLACES[g.place]);
    return true;
  }

  endDay() {
    if (!this.ended) this.event('dayEnd');
    { const f = this.favor; if (f && f.got && !f.closed) { f.closed = true; this.event('favor', { state: 'giveAtNight', who: f.who }); this.addMood(6, 'needed'); this.say(`晚上把${f.item}给${f.name}送了过去`, 'good'); this.h.favorThanks?.(f.who); } }
    if (this.ended) return;
    this.ended = true; this.phase = 'summary';
    for (const g of this.goals) if (g.status === 'pending' || g.status === 'active') { g.status = 'fail'; g.note ||= '没来得及'; }
    if (this.e.mode !== 'home') { this._outLate = this.e.lost || this.e.mode === 'stuck' || this.lostMin >= 10; this.addMood(-10, 'worry'); this.say('天快黑了，他还在外面。你出门把他接回了家', 'bad'); this.e.mode = 'home'; }   // 只是回家路上晚了点不算“出事”；天黑还迷着路才让家里不放心
    this.h.grandchild?.(false);
    this.p.carry = this.carryOut();
    this.h.end?.(this.score());
  }
  // 这一天留给明天的：worry 出了事（在外面迷路转了太久、走丢后放弃、天黑还在外面、被骗）→ 家里不放心；lean 帮得太多（陪早了、一上来就告诉，或几乎都是替他做）→ 他更依赖你；spirit 顺顺利利都自己办成 → 精神好
  carryOut() {
    const h = this.helps, self = this.selfRatio(), all = this.goals.every(g => g.status === 'done');
    this.carryWhy = this._gaveUp ? 'gaveUp' : this._strayed ? 'strayed' : this._outLate ? 'outLate' : this.lostMin >= LOST_WORRY ? 'lostLong' : 'scam';   // 为什么（结算页、模拟用）
    if (this._gaveUp || this._strayed || this._outLate || this.lostMin >= LOST_WORRY || this.goals.some(g => g.task === 'scam' && g.status === 'fail')) return 'worry';
    if (h.walkEarly > 0 || h.tellEarly >= 2 || (self < 0.34 && h.tell + h.walk >= 2)) return 'lean';
    if (all && self * 100 >= AUTO_STAR) return 'spirit';   // 和“他自己办的”星同一条线
    return null;
  }
  score() {
    const val = { done: 1, partial: 0.5, fail: 0 };
    const doneRatio = this.goals.reduce((s, g) => s + (val[g.status] ?? 0), 0) / this.goals.length;
    const self = Math.round(this.selfRatio() * 100);
    const mood = Math.round(clamp(this.mood, 0, 100));
    return {
      doneRatio, autonomy: self, mood, moodLog: { ...this.moodLog }, favor: this.favor ? { ...this.favor } : null,
      stars: { done: doneRatio >= 0.99, auto: self >= AUTO_STAR, mood: mood >= 65 },
      goals: this.goals, log: this.log, helps: this.helps,
    };
  }
}
installWalk(Sim);
installMoments(Sim);
