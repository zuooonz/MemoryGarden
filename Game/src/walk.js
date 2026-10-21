// 行走与认路（规则层，Sim 的一部分）：他认得哪些路口、每到一个路口怎么选下一步、沿路走、门口算到、路上的偶遇与邻居招呼。
// 这些方法挂在 Sim.prototype 上（sim.js 末尾 installWalk），this 就是 Sim；与 sim.js 共用状态（this.e、this.g、this.p、this.day……）。
// 改认路规则、加新的行走状态、做“他的地图”都在这里；一天的流程、目标、犹豫时刻、计分在 sim.js。
import * as THREE from 'three';
import { PLACES, NEIGHBORS, GRID_W, nid } from './data.js';
import { clamp } from './util.js';

const WALK = 3.0;                 // 世界单位 / 真实秒（1×）
export const FADE_P = 0.28;       // 病程变化：原来熟的路口起的淡雾（拐错概率，比陌生路口 0.45 低）
export const FADE_SIGN_P = 0.12;  // 起了淡雾的路口放了路标：他也会看漏，只剩薄雾（道具不能一放了之；邻居在旁边、今天认出过才完全不错）

class Walk {
  oldKnown(node) { return this.oldNodes.has(node) && (!this.changed.has(node) || this.has('photo')); }   // 家里挂着老照片：变了样的老地方也认得
  known(node, target) {
    if (this.dayKnown?.has(node)) return 'day';   // 今天认出过的路口（他的地图：当天记得，第二天又生疏）
    if (this.oldKnown(node)) return 'old';
    if (this.faded?.has(node)) return null;   // 病程变化：原来熟的路口起了淡雾——地点门口、离家近不再算认得；这里的路标他也会看漏，只剩薄雾（见 wrongP）；老地标、邻居、今天认出的照样管用
    if (this.p.signs.has(node)) return 'sign';
    if (this.placeNodes.has(node)) return 'place';
    if (target != null && this.g.dist[node][target] <= 1) return 'near';
    if (this.g.dist[node][this.homeNode] <= 1) return 'home';
    return null;
  }
  adj(node) { return this.blocked.size ? this.g.adj[node].filter(v => !this.blocked.has(this.edgeKey(node, v))) : this.g.adj[node]; }
  // 他偏好走“认得的路”：经过熟悉路口的代价更低
  familiar(node) { return this.dayKnown?.has(node) || this.oldKnown(node) || (!this.faded?.has(node) && (this.p.signs.has(node) || this.placeNodes.has(node) || this.g.dist[node][this.homeNode] <= 1)); }
  // 今天要去的地方旁边的路口：往那儿去时远远看见楼就认得（规则 known 的 'near'），路过去别处时不算——布置时画成淡雾
  nearToday(node) { return (this.goals || []).some(g => g.place && PLACES[g.place] && this.g.dist[node][nid(...PLACES[g.place].node)] <= 1); }
  // 他的地图（规则与雾共用这一个数）：独自走到这个路口，拐错方向的可能。0＝不会错（认得、路标、邻居在旁边）
  // 陌生路口：先犹豫一下，再以这个概率拐错；变了样、修路更高；下雨、心里慌再高；“轻松”难度打六折
  wrongP(node) {
    const changed = this.changed.has(node), detour = this.nearBlock.has(node), fade = !changed && !detour && this.faded?.has(node);
    // 难度统筹（09-27，暂定，见 Docs/游戏系统.md）：陌生路口 0.45、修路 0.65、变了样 0.78（原 0.35／0.5／0.6）——有路标、邻居的路口不受影响，放不放道具的差别更明显
    // 病程变化（10-06 暂定）：原来熟的路口起淡雾 0.28
    return ((changed ? 0.78 : detour ? 0.65 : fade ? (this.p.signs.has(node) ? FADE_SIGN_P : FADE_P) : 0.45) + (this.raining ? 0.15 : 0) + this.anxiety * 0.2) * (this.easy ? 0.6 : 1);
  }
  // 白天按眼下这一趟的目的地算，和他实际怎么走完全一致；早上布置时还没出门，“目的地旁边”记作 goal（只在往那儿去时认得）
  risk(node) {
    const live = this.phase === 'live', tgt = live ? this.e?.target : null;
    if (this.known(node, tgt)) return { p: 0, why: 'known' };
    if (this.helperNear(node)) return { p: 0, why: 'helper' };   // 拜托过的邻居就在旁边：一到这儿就出来指路
    const p = this.wrongP(node);
    if (!live && this.nearToday(node)) return { p, why: 'goal' };
    return { p, why: this.changed.has(node) ? 'changed' : this.nearBlock.has(node) ? 'detour' : this.faded?.has(node) ? 'fade' : 'plain' };
  }
  routeDist(target) {
    if (this._rd.has(target)) return this._rd.get(target);
    const n = this.g.n, d = new Array(n).fill(Infinity), done = new Array(n).fill(false);
    d[target] = 0;
    for (let k = 0; k < n; k++) {
      let u = -1; for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || d[i] < d[u])) u = i;
      if (u < 0 || d[u] === Infinity) break; done[u] = true;
      for (const v of this.adj(u)) {
        const c = d[u] + (this.familiar(v) || v === target ? 1 : 1.8);
        if (c < d[v]) d[v] = c;
      }
    }
    this._rd.set(target, d); return d;
  }
  correctNext(node, target, prev) {
    const d = this.routeDist(target);
    let best = null, bv = Infinity;
    for (const v of this.adj(node)) {
      let val = d[v];
      if (prev != null) {
        const W = GRID_W, straight = v % W - node % W === node % W - prev % W && Math.floor(v / W) - Math.floor(node / W) === Math.floor(node / W) - Math.floor(prev / W);
        if (straight) val -= 0.01;
      }
      if (val < bv) { bv = val; best = v; }
    }
    return best;
  }
  wrongNext(node, target, prev) {
    const c = this.correctNext(node, target, prev);
    let opts = this.adj(node).filter(v => v !== c && v !== prev);
    if (!opts.length) opts = this.adj(node).filter(v => v !== c);
    if (!opts.length) return c;
    return opts[Math.floor(this.r() * opts.length)];
  }
  placeName(node) {
    for (const pl of Object.values(PLACES)) if (nid(...pl.node) === node) return pl.name;
    const o = this.oldNodes.get(node); if (o) return this.changed.has(node) ? '手机店' : o.name;
    let best = null, bd = 9;
    for (const pl of Object.values(PLACES)) { const d = this.g.dist[node][nid(...pl.node)]; if (d < bd) { bd = d; best = pl.name; } }
    return best ? `${best}附近的路口` : '一个路口';
  }
  // 他要去的地方叫什么：去办事就是那个地方（走侧门时 target 是入口路口，也叫地方的名字）；回家、没目标是“家”
  targetName() {
    const e = this.e;
    if (e.leg === 'back' || e.target == null) return '家';
    if (e.leg === 'go' && e.goal?.place) return PLACES[e.goal.wrongPlace ? 'park' : e.goal.place].name;
    return this.placeName(e.target);
  }
  goWhere() { return this.targetName() === '家' ? '回家' : '去' + this.targetName(); }   // 说话用：“回家”／“去菜市场”
  askPasserby() {   // 他鼓起勇气向路人问路（第二次打电话也没人管）：家里知道了会不放心
    const e = this.e;
    this._strayed = true;
    this.helps.passerby++;
    this.event('askWay'); this.say('他鼓起勇气，向路人问了路', 'good');
    this.speak('way.askWay', { where: this.goWhere() });
    e.lost = false; e.drift = 0; e.guided = 2; this.anxiety = 0.4; e.mode = 'walk'; e.calledBack = false;
    e.next = this.correctNext(e.node, e.target, e.prev);
  }
  nearBusy(node) { return ['market', 'park', 'school'].some(k => this.g.dist[node][nid(...PLACES[k].node)] <= 1); }   // 人多的地方（菜市场、公园、小学门口）：迷路时有路人会来问
  nearestFamiliar(node, maxD) {
    let best = null, bd = Infinity;
    for (let i = 0; i < this.g.n; i++) {
      if (!(this.oldKnown(i) || ((this.p.signs.has(i) || this.placeNodes.has(i)) && !this.faded?.has(i)))) continue;
      const d = this.g.dist[node][i]; if (d <= maxD && d < bd) { bd = d; best = i; }
    }
    return best;
  }
  updateElder(dt, dm, dtReal) {
    const e = this.e;
    switch (e.mode) {
      case 'home': return;
      case 'entering':
        e.enterT += dtReal;
        if (e.enterT > 10) this.visualArrived();   // 画面没报到位：真实时间 10 秒兜底（按真实时间算——倍速再快，画面里的人最多 2 倍速走，按游戏时间算会提前兜底）
        return;
      case 'task':
        e.taskT -= dm;
        if (e.taskT <= 0) this.afterTask();
        return;
      case 'hesitate':
        e.wait -= dm;
        if (this.p.signs.has(e.node) || (this.changed.has(e.node) && this.has('photo'))) e.wait = 0;
        if (e.wait <= 0) { e.mode = 'walk'; e.next = this.decideNext(true); }
        return;
      case 'stuck':
        this.lostMin += dm;
        e.stuckT += dm;
        // 走不动了、你又没管（09-27 难度：不再“等一小时必有路人”）：去的路上就放弃回家；回家路上或有小关卡的事，他再给你打一次电话，还没人管才找路人问
        if (e.stuckT > 25) {
          const g = e.leg === 'go' ? e.goal : null;
          if (g && !g.level && !g.menu && g.status !== 'done') {   // 买菜（找零）、有小关卡的事不放弃
            this._gaveUp = true; this.event('giveUp', { goalId: g.id });
            this.finishGoal(g, 'fail', '找不着路，放弃了，自己慢慢回了家');
            this.say('他在路口转了半天，决定不去了，慢慢往家走', 'bad'); this.speak('go.giveUp'); this.h.sfx?.('bad');
            this.addMood(-10, 'fail'); this.anxiety = 0.5;
            e.lost = false; e.drift = 0; e.guidedAll = true; e.mode = 'walk';
            if (!this.goChain()) { e.leg = 'back'; e.target = this.homeNode; }
            e.next = this.correctNext(e.node, e.target, e.prev);
          } else if (!e.calledBack) { e.calledBack = true; e.stuckT = 0; this.call(true); return; }   // 回家的路上、或要去做小关卡：他再给你打一次电话；还没人管，就找路人问（下面）
          else this.askPasserby();
          return;
        }
        return;
      case 'walk': {
        if (e.lost && !e.escort) this.lostMin += dm;   // 这一天他在外面迷路转了多久（他的日子：转得太久，家里就不放心）
        if (e.hold) { e.holdT = (e.holdT || 0) + dm; if (e.holdT < 15) return; e.hold = false; }   // 画面上的人还在屋里／门口，先等他走出来（最多等 15 分钟）
        if (e.next == null) { e.next = this.decideNext(); if (e.next == null) return; }
        const sp = this.walkRate() * dt;
        // 只沿路走：当前位置不在“当前路口 → 下一个路口”这段路上（比如站在门口时改了方向），先回到当前路口再走——任何原因都不会斜穿
        {
          const A = this.g.pos[e.node], N = this.g.pos[e.next];
          const abx = N.x - A.x, abz = N.z - A.z, t = Math.max(0, Math.min(1, ((e.pos.x - A.x) * abx + (e.pos.z - A.z) * abz) / (abx * abx + abz * abz || 1)));
          if (Math.hypot(e.pos.x - A.x - abx * t, e.pos.z - A.z - abz * t) > 0.05) {
            const vb = new THREE.Vector3().subVectors(A, e.pos), db = vb.length();
            if (db <= sp) e.pos.copy(A); else e.pos.addScaledVector(vb, sp / db);
            return;
          }
        }
        // 快到目的地、而且正走在它门口这段路上：走到门口就算到了，不再走过头去路口
        const dr = e.next === e.target ? this.doorFor(e) : null;
        const onDoorEdge = dr && ((e.node === dr.a && e.next === dr.b) || (e.node === dr.b && e.next === dr.a));
        const to = onDoorEdge ? dr.pos : this.g.pos[e.next];
        const v = new THREE.Vector3().subVectors(to, e.pos);
        const d = v.length();
        if (d <= sp) { e.pos.copy(to); this.arrive(e.next); }
        else e.pos.addScaledVector(v, sp / d);
      }
    }
  }
  // 这一趟要去的地方的门（回家＝家的门；健步走等没有门）
  doorFor(e) {
    if (e.leg === 'back') return this.doors.home || null;
    if (e.leg !== 'go' || !e.goal) return null;
    return e.gate ?? this.gateOf(e.goal);
  }
  // 一件事走哪扇门：开着的门里挑离出发点最近的（按他实际会走的路算，修路也算上）；这天正门在修（goal.doorClosed）就不走正门。
  // 出发时算一次存进 e.gate；路线预览按同样的出发点算，所以画的和走的一致
  gateOf(goal, from = this.e?.node ?? this.homeNode) {
    if (!goal?.place) return null;
    const wrong = !!goal.wrongPlace, list = (this.gates[wrong ? 'park' : goal.place] || []).filter((d, i) => !(i === 0 && goal.doorClosed && !wrong));
    if (list.length <= 1) return list[0] || null;
    const far = (d) => Math.min(this.routeDist(d.a)[from], this.routeDist(d.b)[from]);
    return list.reduce((b, d) => far(d) < far(b) ? d : b);
  }
  // 这件事要走到的路口：选中的那扇门两头里离出发点近的一头
  goalNode(goal, from = this.e?.node ?? this.homeNode) {
    const d = this.gateOf(goal, from);
    if (!d) return nid(...PLACES[goal.wrongPlace ? 'park' : goal.place].node);
    return this.routeDist(d.a)[from] <= this.routeDist(d.b)[from] ? d.a : d.b;
  }
  arrive(node) {
    const e = this.e;
    e.prev = e.node; e.node = node; e.next = null;
    this.event('pass'); this.h.step?.(); this.h.arrive?.(node);
    if (node === e.target) return this.reachTarget();
    if (this.deliverOnWay(node)) return;
    if (this.maybeEncounter(node)) return;
    e.next = this.decideNext();
  }
  // 路上的偶遇：随机但可复现（按第几天、第几次玩）；每天最多两次；快到约定时间不触发，不影响小关卡
  maybeEncounter(node) {
    const e = this.e;
    if (e.escort || e.guidedAll || (e.route && e.route.length) || e.leg === 'hike' || this.moment) return false;
    this._enc ||= 0;
    if (this._enc >= 2 || this.r() > 0.07) return false;
    if (e.leg === 'go' && e.goal && e.goal.at - this.time < 15) return false;
    this._enc++;
    const kind = (e.lost || e.drift) && this.nearBusy(node) && this.r() < 0.6 ? 'guide' : this.r() < 0.6 ? 'chat' : 'stall';
    if (kind === 'guide') {
      e.lost = false; e.drift = 0; e.guided = 2; this.helps.passerby++; this.anxiety = Math.max(0, this.anxiety - 0.3);
      this.say('碰到老街坊老孙，顺口给他指了路', 'good'); this.speak('meet.askSun', { where: this.goWhere() });
      e.after = 'resume'; e.taskT = 2;
    } else if (kind === 'chat') {
      this.addMood(5, 'nb'); this.say('碰到老街坊老孙，站着聊了几句', 'good'); this.speak('meet.chatSun');
      e.after = 'resumeWalk'; e.taskT = 4;
    } else {
      this.addMood(2, 'fun'); this.say('路边有卖糖葫芦的，他停下来看了看', ''); this.speak('meet.stall');
      e.after = 'resumeWalk'; e.taskT = 3;
    }
    e.mode = 'task';
    this.event('encounter', { encounter: kind }); this.h.encounter?.(kind, node);
    return true;
  }
  // 他此刻在规则层里走多快（世界单位／游戏里的 1 秒，再乘倍速就是真实每秒）：迷路慢、下雨慢、健步走快、赶时间急。画面的速度从这里算（actors.elderSp），保证画面跟得上
  walkRate() { const e = this.e; return WALK * (e?.lost ? 0.8 : 1) * (this.raining ? 0.9 : 1) * (e?.leg === 'hike' ? 1.5 : 1) * (e?.hurry ? 1.15 : 1); }
  // 走在两个路口之间时改变方向：先回到刚才的路口，避免斜着穿过街区
  redirect() {
    const e = this.e;
    if (e.pos.distanceTo(this.g.pos[e.node]) > 0.3 && e.next != null && e.next !== e.node) e.next = e.node;
    else e.next = this.decideNext(true);
  }
  // 在路口决定下一步：爷爷认知规则的核心
  decideNext(afterHesitate = false) {
    const e = this.e, node = e.node, target = e.target;
    if (e.escort || e.guidedAll) return this.correctNext(node, target, e.prev);
    // 按电话里指的路走：认得的路口稳，陌生路口可能记不住下一步
    if (e.route && e.route.length) {
      const nx = e.route.shift();
      if (!this.adj(node).includes(nx)) { e.route = null; }
      else {
        const first = e.routeFirst; e.routeFirst = false;   // 你说的第一步他当然记得
        // 按他的地图指路（10-06 暂定）：你说的下一个路口他认得（没雾：地标、路标、熟路口）就照着走得稳；说到有雾的地方他想象不出来，容易记混
        const forgetP = this.familiar(nx) || nx === e.target ? 0.05 : (e.routePanic ? 0.7 : 0.45);
        if (!first && !(e.guided > 0) && this.r() < forgetP) {   // 刚从门里出来那一步（guided）他认得，不会记不清；慌了的时候电话里指的路更容易记混（这时人在身边最管用）
          e.route = null; this.event('forgetRoute'); this.say(`走到${this.placeName(node)}，他记不清下一步了`, 'q'); this.speak('way.forgetRoute');
        } else {
          { const nm = this.placeName(node); if (this.familiar(node) && !nm.endsWith('附近的路口')) this.speak('way.routeStep', { place: nm }); }   // 照着指的路走：到了有名字的地方才说“到某某了”
          e.lost = false; e.drift = 0; if (e.guided > 0) e.guided--;
          return nx;
        }
      }
    }
    if (e.guided > 0) { e.guided--; return this.correctNext(node, target, e.prev); }
    const k = this.known(node, target);

    if (k) {
      if (k === 'sign') this.use('sign');
      else if (k === 'old' && this.changed.has(node) && this.has('photo')) this.use('photo');
      if (e.lost || e.drift) {
        const why = k === 'sign' ? '看到路标' : k === 'old' ? `看到${this.oldNodes.get(node).name}` : '看到熟悉的地方';
        this.event('found', { why }); this.learnNode(node); this.say(`${why}，认出了路`, 'good');
        this.speak('way.found');
        this.h.sfx?.('good');
        this.anxiety = Math.max(0, this.anxiety - 0.25);
      } else if (k === 'old' && this.changed.has(node) && this.has('photo') && !afterHesitate) {
        this.speak('way.oldCinema');
      }
      e.lost = false; e.drift = 0;
      this.greet(node);
      return this.correctNext(node, target, e.prev);
    }

    // 变了样的老地方、修路的路口：比普通路口更困惑
    const changed = this.changed.has(node);
    const detour = this.nearBlock.has(node);

    // 邻居帮忙
    // 拜托过的邻居：路口旁边会指路；他迷路时，两个路口以内也会看见、过来领一段
    const near1 = this.helperNear(node), helper = near1 || (e.lost ? this.helperNear(node, 2) : null);
    if (helper && (e.lost || e.drift || changed || detour || !afterHesitate)) {
      const nb = NEIGHBORS.find(n => n.id === helper);
      this.helps.neighbor++; this.use('neighbor');
      this.anxiety = Math.max(0, this.anxiety - 0.3);
      e.lost = false; e.drift = 0; e.guided = 1;
      this.say(near1 ? `${nb.name}出门打了个招呼，顺口指了路` : `${nb.name}远远看见他在转圈，走过来领了一段`, 'good');
      this.event('neighborHelp', { who: helper, near: !!near1 }); this.learnNode(node); this.h.neighbor?.(helper, node);
      e.mode = 'task'; e.taskT = 4; e.after = 'resume';
      return null;
    }

    if (e.lost) {
      this.anxiety = clamp(this.anxiety + (this.nearBusy(node) ? 0.22 : 0.14), 0, 1);   // 人多的地方（菜市场、公园、小学门口）迷路慌得更快——这时人在身边最管用（陪同的专属情境，10-06 暂定）
      if (this.anxiety >= 1) {
        e.mode = 'stuck'; e.stuckT = 0; this.event('stuck');
        this.say('他停了下来，不知道该往哪走', 'bad');
        this.h.sfx?.('bad');
        this.call(true);   // 慌了、走不动了：他给你打电话
        return null;
      }
      this.speak('way.stuck');
      return this.r() < 0.45 ? this.correctNext(node, target, e.prev) : this.wrongNext(node, target, e.prev);
    }

    if (e.drift) {
      e.drift++;
      if (e.drift >= 3) {
        e.lost = true; this.event('lost');
        this.anxiety = clamp(this.anxiety + 0.2, 0, 1);
        this.say(`走到${this.placeName(node)}，发现不对劲，迷路了`, 'bad');
        this.speak('way.lost');
        this.h.sfx?.('bad');
        const nx = this.r() < 0.45 ? this.correctNext(node, target, e.prev) : this.wrongNext(node, target, e.prev);
        // 他一发现走错了，先给你打电话（每趟去、每趟回各一次；09-27 难度：4 倍速不盯着看也会被叫到，但怎么帮要你判断）
        const leg = e.leg + ':' + (e.goal?.id || '');
        if (e.hisCallLeg !== leg && this.canCall()) { e.hisCallLeg = leg; e.next = nx; this.call(true); }
        return nx;
      }
      return this.wrongNext(node, target, e.prev);
    }

    if (!afterHesitate) {
      e.mode = 'hesitate'; e.trouble = true; e.wait = (this.raining ? 6 : 4) + (changed || detour ? 4 : 0);   // trouble：在陌生路口犹豫、琢磨路，也算分了心（邻居托的事就容易忘）
      this.speak(changed ? 'way.changed' : detour ? 'way.detour' : 'way.hesitate');
      if (detour && !this._toldDetour) { this._toldDetour = true; this.say('前面在修路，他得绕一条不熟悉的路', 'q'); }
      this.h.sfx?.('q');
      this.event('hesitate', { changed: !!changed, detour: !!detour }); this.h.hesitate?.(node, changed);
      return null;
    }
    const p = this.wrongP(node);   // 和雾的浓淡是同一个数
    if (this.r() < p) {
      e.drift = 1;
      this.event('wrongTurn'); this.say(`在${this.placeName(node)}拐错了方向`, 'q'); this.h.fogFlash?.(node);
      return this.wrongNext(node, target, e.prev);
    }
    return this.correctNext(node, target, e.prev);
  }
  // 拜托过的邻居，路过时会打个招呼（每位每天一次）
  greet(node) {
    const id = this.helperNear(node);
    if (!id) return;
    this._greeted ||= new Set();
    if (this._greeted.has(id + this.dayIdx)) return;
    this._greeted.add(id + this.dayIdx);
    this.addMood(3, 'nb');
    this.event('greet', { who: id }); this.h.greet?.(id, node);
  }
  helperNear(node, r = 1) {
    for (const id of this.p.neighbors) if (this.g.dist[node][this.neighborNodes.get(id)] <= r) return id;
    return null;
  }
}

export function installWalk(Sim) {
  for (const [k, d] of Object.entries(Object.getOwnPropertyDescriptors(Walk.prototype))) if (k !== 'constructor') Object.defineProperty(Sim.prototype, k, d);
}
