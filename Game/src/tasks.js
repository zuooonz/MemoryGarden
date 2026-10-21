// 到了地方办事：每种事一个处理函数（规则层）。sim 到达目的地后按 g.task 查这张表执行；没登记的走 default（办好就算）。
// 加新剧情里的新事情：在这里加一条（参数 sim：模拟对象；g：这件事的目标；e：爷爷的状态），不用改 sim 的主流程。
// 常见写法：e.taskT 在这里待多久（游戏分钟）；sim.finishGoal(g, 'done'|'partial'|'fail', 说明)；sim.say／bubble 消息；sim.addMood(分, 来源)；
// sim.levelEvent(小关卡名, 数据, 结果回调) 打开小关卡；sim.openMoment(种类, g) 打开犹豫时刻。
export const TASK_ARRIVE = {
  shop(sim, g, e) {
    e.taskT = g.level === 'change' ? 3 : 30;   // 第 1 天：选完菜紧接着结账（同一个菜摊）
    if (g.level === 'change') e.pendingChange = true;
    if (g.promo) e.pendingPromo = true;
    if (sim.has('note')) { sim.use('note'); sim.finishGoal(g, 'done', '照着便签买齐了'); sim.say('照着便签，把菜买齐了', 'good'); sim.speak('task.shopNote'); sim.addMood(5, 'support'); }
    else if (g.recall === false) { sim.finishGoal(g, 'done', '买齐了'); sim.say('他在熟悉的摊子上把菜买齐了', 'good'); sim.speak('task.shopDone'); sim.addMood(3, 'fun'); }
    else { sim.openMoment('shop', g); if (sim.moment?.kind === 'shop') sim.choose('cue'); }   // 第 1 天：到了菜摊就进“帮他想起菜单”（小关卡自带分级提示），不再先让你选等／提示／告诉
  },
  chess(sim, g, e) {
    if (g.late) { e.taskT = 40; sim.finishGoal(g, 'partial', '晚到了，只下了半盘'); sim.say('老朋友正收拾棋盒要走，见他来了又坐下：“就下半盘！”', 'q'); }
    else { e.taskT = 70; sim.finishGoal(g, 'done', '和老朋友下了一盘'); sim.say('到了棋亭，老朋友已经摆好了棋', 'good'); }
    sim.speak('task.chess');
    sim.addMood(g.late ? 8 : 15, 'fun'); sim.h.sfx?.('good'); sim.h.happy?.();
  },
  rx(sim, g, e) {
    sim.finishGoal(g, 'done', '办好了'); sim.say('药店的事办好了', 'good'); sim.speak('task.rx');
  },
  post(sim, g, e) {
    if (g.level === 'digits' && g.digits) {
      sim.say('驿站老板问：“取件码多少？”他转头看你', 'q');
      sim.levelEvent('digitsRecall', { digits: g.digits }, (res) => {
        if (res.q >= 0.99) { sim.finishGoal(g, 'done', '报对了取件码'); sim.say('取件码对上了，取到了老张寄来的新茶', 'good'); sim.speak('task.tea'); sim.addMood(10, 'fun'); }
        else { sim.finishGoal(g, 'fail', '取件码记不清，没取到'); sim.say('取件码对不上，手机又没带，只好空手回家', 'bad'); sim.speak('task.teaMiss'); sim.addMood(-6, 'fail'); }
      });
    } else { sim.finishGoal(g, 'done', '办好了'); sim.say('快递取到了', 'good'); sim.speak('task.tea'); sim.addMood(8, 'fun'); }
  },
  talk(sim, g, e) {
    if (g.late) { e.taskT = 30; sim.finishGoal(g, 'partial', '晚到了，只听到后半段'); sim.say('讲座讲到一半，他悄悄在最后一排坐下', 'q'); sim.addMood(3, 'fun'); }
    else { e.taskT = 60; sim.finishGoal(g, 'done', '听完了讲座'); sim.say('他坐在第一排，认真记了笔记', 'good'); sim.addMood(6, 'fun'); }
    sim.levelEvent('trail', {}, (res) => {
      if (res.path && res.path.length) { e.hike = res.path.slice(); e.taskT = 20; sim.say('你们一起连好了健步走的路线', 'good'); }
      sim.addMood(6, 'fun');
    });
  },
  pick(sim, g, e) {
    if (g.late) { e.taskT = 5; sim.finishGoal(g, 'partial', '晚到了，孙女和老师在门口等了好一会儿'); sim.say('老师陪着孙女在校门口等着。孙女跑过来：“爷爷，你怎么才来呀！”', 'q'); sim.addMood(8, 'fun'); }
    else { e.taskT = 5; sim.finishGoal(g, 'done', '接到了孙女'); sim.say('孙女从校门口跑出来：“爷爷！”', 'good'); sim.addMood(15, 'fun'); } sim.h.happy?.(); sim.h.grandchild?.(true);
  },
  movie(sim, g, e) {
    e.taskT = 80; if (g.late) sim.finishGoal(g, 'partial', '晚到了，只赶上后半场'); else sim.finishGoal(g, 'done', sim.time > 1150 ? '赶上了后半场' : '看完了整场电影');
    sim.say(g.late ? '他赶上了后半场，坐在最后一排看得很入神' : '他坐在第一排，电影一开场就笑了：“这片子，我年轻时看过！”', 'good');
    sim.speak('task.movie'); if (sim.has('photo')) { sim.use('photo'); sim.addMood(4, 'support'); sim.say('他想起家里墙上那张照片，就是那年看这部片子时拍的', 'good'); } sim.addMood(g.late ? 8 : 15, 'fun'); sim.h.happy?.();
  },
  choir(sim, g, e) {
    if (g.late) { e.taskT = 30; sim.finishGoal(g, 'partial', '晚到了，只赶上最后一首'); sim.say('排练快结束了，他赶上了最后一首', 'q'); sim.addMood(5, 'fun'); }
    else { e.taskT = 60; sim.finishGoal(g, 'done', '唱完了排练'); sim.say('排练合唱时，他的嗓门最响亮', 'good'); sim.addMood(10, 'fun'); } sim.h.happy?.();
  },
  match(sim, g, e) {
    e.taskT = 90;
    if (g.late) { sim.finishGoal(g, 'partial', '迟到了，参加了补赛'); sim.say('他气喘吁吁地赶到，裁判给他安排了补赛', 'q'); }
    else { sim.finishGoal(g, 'done', '自己走到了比赛现场'); sim.say('他报了到，在棋盘前坐下，腰板挺得笔直', 'good'); } sim.speak('task.match'); sim.addMood(8, 'self'); sim.h.happy?.(); sim.h.sfx?.('good');
    if (g.level === 'chess') sim.levelEvent('chess', {}, (res) => {
      const right = res.auto ? 7 : (res.right ?? 7);
      if (right === 7) { sim.addMood(5, 'fun'); sim.addMood(3, 'self'); sim.say('残局摆得一子不差。他盯着棋盘想了一会儿，一步“马后炮”，赢了！', 'good'); }   // 小关卡只加不扣（09-28）：一子不差多高兴一下；摆得不好也都按下完一盘算，不扣
      else if (right >= 5) { sim.addMood(5, 'fun'); sim.say(`残局摆对了 ${right} 个子，裁判帮着挪好。他下得很投入，最后和了一盘`, 'good'); }
      else { sim.addMood(2, 'fun'); sim.say(`残局只摆对 ${right} 个子，裁判重新摆好。他下得很开心，最后输了一盘，笑着说“下回再来”`, 'q'); }
    });
  },
  default(sim, g, e) {
    sim.finishGoal(g, 'done');
  },
};
