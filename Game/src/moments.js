// 犹豫时刻（由 sim.js 拆出，09-27）：他卡在一件事上时，你怎么帮——等一等、提示、直接告诉、放手；关卡结果、收尾与计分。
// 这些方法挂在 Sim.prototype 上（sim.js 末尾 installMoments），this 就是 Sim，与 sim.js 共用状态。
import { PLACES, MOMENTS } from './data.js';

class Moments {
  // ---------- 犹豫时刻：先少后多的提示 ----------
  openMoment(kind, goal, extra = {}) {
    const def = MOMENTS[kind];
    const m = { kind, goal, def, tried: new Set(), text: def.ctx, ...extra };
    m.atHesitate = kind === 'lost' && !m.stuck && !this.e.lost && !this.e.drift && this.e.mode === 'hesitate';   // 路口时机窗口（10-06 暂定）：他在陌生路口停下来想的时候打过去
    m.fine = kind === 'lost' && !m.stuck && !this.e.lost && !this.e.drift && !m.atHesitate;   // 他走得好好的时你打电话（面板、气泡、配音都按这个判断）
    this.moment = m; this.event('moment', { moment: kind });
    if (!m.fine && !m.atHesitate) this.bubble(def.title, 'q mute', 5);   // 他只是在路口想方向：不说“我有点找不着路了”   // 标题由面板念（mo_ 配音），气泡不再念一遍   // 他走得好好的时你打电话：头顶不冒“我有点找不着路了”
    this.say(def.ctx, 'q');
    this.h.sfx?.('q');
    this.h.moment?.(m);
  }
  // 直接告诉正是时候：先等过、提示过还不行，或者他已经慌得走不动了（电话里迷路：试过一样就算）
  tellTimely(m = this.moment) { return !!m && (m.stuck || (m.tried.has('wait') && m.tried.has('cue')) || (m.tried.size >= 1 && m.kind === 'lost')); }
  momentOptions() {
    const m = this.moment; if (!m || m.event) return [];
    const d = m.def, opts = [];
    if (!m.tried.has('wait') && m.kind !== 'lost') opts.push({ id: 'wait', label: '等一等，让他自己想', self: true });
    if (m.kind === 'lost' && m.stuck) {   // 陪同的专属情境（10-06 暂定）：慌到走不动时，电话里问什么、指什么他都听不进去——只有人过去管用
      opts.push({ id: 'walk', label: '“你别动，我过去陪你。”', self: false });
      opts.push({ id: 'letgo', label: '先不管，让他自己想办法', self: true });
      return opts;
    }
    if (!m.tried.has('cue') && m.atHesitate) opts.push({ id: 'cue', label: '问他：“你看看，认得这儿吗？”', self: true });
    else if (!m.tried.has('cue')) opts.push({ id: 'cue', label: d.cue.label.replace('${dish}', m.goal?.menu?.dish || '').replace('${cue}', m.goal?.menu ? (m.goal.menu.say || '今天要做' + m.goal.menu.dish) : ''), self: true, game: d.cue.game });
    opts.push({ id: 'tell', label: d.tell.label, self: false });
    if (m.kind === 'lost' && (m.stuck || this.e.lost)) opts.push({ id: 'walk', label: '“你别动，我过去陪你。”', self: false });   // 他迷路了、慌了：人在身边最管用
    if (m.kind === 'lost') opts.push({ id: 'letgo', label: m.stuck ? '先不管，让他自己想办法' : '先挂了，让他自己试试', self: true });
    else if (m.tried.size) opts.push({ id: 'letgo', label: '就这样吧', self: true });
    return opts;
  }
  choose(id) {
    const m = this.moment; if (!m || m.pending || m.event) return;
    this.event('choice', { moment: m.kind, choice: id });
    const d = m.def;
    if (id === 'letgo') return this.letGo(m);
    if (id === 'walk') {   // 过去陪他：先挂电话，再像“陪他去”一样陪着走（慌了的时候去陪，算时机对）
      this.event('momentEnd', { moment: m.kind, ok: true, self: false });
      this.moment = null; this.h.moment?.(null);
      this.escort(); return;
    }
    if (id === 'tell') {
      this.helps.tell++;
      // 时机：先等过、提示过还不行，或者他已经慌得走不动了，再直接告诉——正是时候；一上来就告诉，少了他自己想起来的机会
      const timely = this.tellTimely(m);
      if (timely) this.helps.tellTimely++; else { this.helps.tellEarly++; this.addMood(-4, 'donefor'); }
      const shortRoute = m.kind === 'lost' && d.tell.game === 'route';   // 电话里指一小段路：后面他自己走，仍算他自己办的（有记混、再迷路的风险）；陪他去才稳，但算你帮的
      if (m.goal && !shortRoute) this.markHelped(m.goal, timely);
      m.timely = timely;
      m.shortRoute = shortRoute;
      if (d.tell.game && this.h.minigame) {
        m.pending = true;
        const tk = this.dayToken;
        this.h.minigame(d.tell.game, m, (path) => {
          if (this.moment !== m || this.dayToken !== tk) return;
          m.pending = false;
          this.closeMoment(true, d.tell.ok, false);
          const e = this.e; e.route = path && path.length ? path.slice(0, 3) : null; e.guidedAll = false; e.routeFirst = true; e.routePanic = !!m.stuck || this.anxiety >= 0.4;   // 只照你说的那几个路口走（最多 3 个，和 mapops.ROUTE_MAX 一致），后面靠他自己   // guided 不清零：刚出门那一步他本来就认得
          this.redirect();
        });
        return;
      }
      this.closeMoment(true, d.tell.ok, false);
      return;
    }
    m.tried.add(id);
    if (id === 'cue' && d.cue.game) {
      this.helps.cue++;
      m.pending = true;
      const tk = this.dayToken;
      this.h.minigame?.(d.cue.game, m, (q, info) => { if (this.moment === m && this.dayToken === tk) this.gameResult(q, info); });
      return;
    }
    let p = (id === 'wait' ? d.wait.p : d.cue.p) + (this.easy ? 0.15 : 0);
    if (m.kind === 'cook' && this.has('song')) p += id === 'wait' ? 0.3 : 0.15;
    let okText = id === 'wait' ? d.wait.ok : d.cue.ok;
    if (m.kind === 'lost' && id === 'cue') { m.viaCall = true;
      let seen = this.nearestFamiliar(this.e.node, 2);
      p = seen != null ? 0.9 : 0;   // 趁他刚走错时打电话，一问就能认出来（慌到走不动时没有这一项，见 momentOptions）
      if (m.atHesitate) {   // 他正在路口犹豫：问一句“认得这儿吗”，他看看四周多半能自己认出来——这一趟第一次问最灵，问多了他心里烦、也不灵了
        // 认不认得出来，要看紧挨着有没有他认得的东西（相邻路口的地标、路标、熟地方）——四周全是雾，问了也想不起来：布置环境和抓时机问一句互相成全
        const n = (this.e.asks || 0); this.e.asks = n + 1;
        p = (this.nearestFamiliar(this.e.node, 1) != null ? 0.85 : 0.3) * (n === 0 ? 1 : 0.6); seen = this.e.node;
        if (n >= 1) this.addMood(-3, 'donefor');   // 一趟里问第二次以上：他觉得你老盯着他
      }
      { const nm = seen != null ? this.placeName(seen) : ''; okText = nm.endsWith('附近的路口') ? `“我在${nm.replace('附近的路口', '')}附近！”他自己认出了方向。` : okText.replace('${seen}', nm); }
      m.seen = seen;
    }
    this.advance(id === 'wait' ? 8 : 3, id === 'wait' ? '等他自己想' : '提示后他想了想');
    this.helps[id]++;
    if (this.r() < p) this.closeMoment(true, okText, true);
    else {
      this.addMood(-4, 'worry');
      m.text = id === 'wait' ? d.wait.fail : d.cue.fail;
      this.bubble(/^“[^”]{1,14}”$/.test(m.text) ? m.text.slice(1, -1) : '……', 'q', 2.5);   // 气泡是他说的话：只放引号里的短句，旁白叙述（“他拿起药瓶又放下……”）不放
      this.h.sfx?.('q');
      this.h.moment?.(m);
    }
  }
  // 小关卡结果：q 为 0..1 的完成度
  gameResult(q, info = {}) {
    const m = this.moment; if (!m) return;
    m.pending = false;
    const d = m.def;
    this.advance(4, '一起想了想');
    if (m.kind === 'shop') {
      // 选菜关卡自带全部提示层级：挑好了就买篮子里的，不再回到犹豫面板（摊主已经在装袋，接着结账）
      const n = m.goal.menu.items.length, hit = info.hit || 0;
      if (info.picked) m.goal.bought = info.picked.slice();
      if (q >= 0.99) return this.closeMoment(true, d.cue.ok.replace('${hit}', m.goal.menu.items.slice(0, 2).join('、')), true);
      this.event('momentEnd', { moment: 'shop', ok: false, self: true });
      this.moment = null; this.h.moment?.(null);
      if (hit >= Math.ceil(n / 2)) { this.finishGoal(m.goal, 'partial', `想起了 ${hit}/${n} 样`); this.say(`你提醒对了 ${hit} 样，他买了这些`, 'q'); }
      else { this.finishGoal(m.goal, 'partial', hit ? `只想起 ${hit}/${n} 样` : '买的不是清单上的'); this.say(hit ? `只买对了 ${hit} 样，别的回家再说` : '买回来的菜和清单对不上', 'q'); this.addMood(-3, 'worry'); }
      this.speak('task.shopSome');
      return;
    } else if (q >= 0.99) return this.closeMoment(true, d.cue.ok, true);
    this.addMood(-4, 'worry');
    m.text = d.cue.fail;
    this.speak('moment.fail');
    this.h.sfx?.('q');
    this.h.moment?.(m);
  }
  closeMoment(success, text, self) {
    this.event('momentEnd', { moment: this.moment?.kind || null, ok: !!success, self: !!self });
    const m = this.moment; this.moment = null;
    if (success && self && m?.viaCall) { this.helps.callSelf++; this.learnNode(this.e.node); }   // 电话里问他看到了什么，他自己认出了路：这个路口今天算认得
    if (success && self) this.addMood(2, 'self');   // 自己想起来：心里踏实
    this.h.moment?.(null);
    this.say(text, self ? 'good' : 'help');
    this.speak(self ? 'moment.self' : 'moment.told');
    this.h.sfx?.('good');
    const g = m.goal, e = this.e;
    switch (m.kind) {
      case 'meds': this.finishGoal(g, 'done', self ? '自己想起来吃了' : '你提醒后吃了'); break;
      case 'shop': this.finishGoal(g, 'done', self ? '清单上的都想起来了' : '照你念的买齐了'); this.addMood(3, 'fun'); break;
      case 'stove': this.finishGoal(g, 'done', self ? '自己关了火' : '你提醒后关了火'); break;
      case 'cook': this.finishGoal(g, 'done', self ? '和孙女包完了饺子' : '在你提醒下包完了'); this.addMood(12, 'fun'); this.h.happy?.(); break;
      case 'scam': this.finishGoal(g, 'done', self ? '自己识破了' : '你提醒后挂断'); if (!self) this.addMood(-5, 'donefor'); break;
      case 'weekday': this.leave(g, PLACES[g.place]); break;
      case 'leaflet': this.addMood(2, 'fun'); e.afterPromo = false; this.afterTask(); break;
      case 'lost':
        this.anxiety = Math.max(0, this.anxiety - 0.4);
        e.lost = false; e.drift = 0; e.stuckT = 0;
        if (self && m.tried.has('wait') && !m.tried.has('cue')) { this.helps.passerby++; }
        if (!self && m.goal && !m.shortRoute) this.markHelped(m.goal, m.timely);
        e.guided = self ? (m.seen != null ? this.g.dist[e.node][m.seen] : 2) : m.def.tell.game ? (e.guided || 0) : 99;   // 电话里指路：只照你说的那几个路口走（刚出门那一步他本来就认得，保留）
        if (!self) e.guidedAll = true;
        e.mode = 'walk'; this.redirect();
        break;
    }
  }
  letGo(m) {
    this.event('letGo', { moment: m.kind });
    this.moment = null; this.h.moment?.(null);
    const g = m.goal, e = this.e, x = this.r();
    switch (m.kind) {
      case 'meds':
        if (x < 0.4) { this.finishGoal(g, 'fail', '以为吃过了，没吃'); this.say('他觉得应该吃过了，放下了药瓶', 'bad'); }
        else if (x < 0.7) { this.finishGoal(g, 'done', '自己吃了'); this.say('他想了一会儿，吃了药', 'good'); }
        else { this.finishGoal(g, 'fail', '可能重复吃了药'); this.addMood(-8, 'fail'); this.say('他又吃了一次，可能重复服药了', 'bad'); this.speak('home.medsTwice'); }
        break;
      case 'shop': {
        const tot = g.menu?.items.length || 3, n = x < 0.5 ? 1 : 2; this.finishGoal(g, 'partial', `只买了 ${n}/${tot} 样`); this.say(`他只买了 ${n} 样就回家了`, 'q'); break;
      }
      case 'stove': this.finishGoal(g, 'fail', '锅烧干了'); this.addMood(-15, 'fail'); this.h.burnt?.(); this.say('锅烧干了，满屋子糊味。他很懊恼', 'bad'); this.speak('home.burnt'); this.h.sfx?.('bad'); break;
      case 'cook': this.finishGoal(g, 'partial', '饺子包得歪歪扭扭'); this.addMood(4, 'fun'); this.say('饺子包得歪歪扭扭，孙女笑得很开心', 'q'); break;
      case 'scam': this.finishGoal(g, 'fail', '差点去银行转账'); this.addMood(-18, 'fail'); this.say('他拿着存折出了门，幸好银行柜员拦下了', 'bad'); this.h.sfx?.('bad'); break;
      case 'leaflet':
        this.p.leaked = true; this.addMood(1, 'fun');
        this.say('他留下了手机号，拎着一袋“免费”鸡蛋走了', 'q'); this.speak('home.eggs');
        e.afterPromo = false; this.afterTask(); break;
      case 'weekday':
        this.say('他以为是星期六，拿着棋盒去了公园', 'q');
        g.wrongPlace = true;
        this.leave(g, PLACES.park);
        break;
      case 'lost':
        if (m.stuck) { e.mode = 'stuck'; e.stuckT = 0; this.say('你决定先让他自己想办法', 'q'); }
        else if (e.mode === 'phone') e.mode = 'walk';
        break;
    }
  }

  // 回家路上路过托付人家门口：当场把东西交了（不再等回到家、再让邻居跑到家门口来拿）
}

export function installMoments(Sim) {
  for (const [k, d] of Object.entries(Object.getOwnPropertyDescriptors(Moments.prototype))) if (k !== 'constructor') Object.defineProperty(Sim.prototype, k, d);
}
