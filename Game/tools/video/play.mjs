// 录视频用的“玩家”：认出当前界面（犹豫时刻、各个小关卡、弹窗、地图连线），用可见光标真实操作，答对。
// 剧本里调用：const P = player(api)；await P.go()、await P.solve()、await P.until(...)
// 每个小关卡的做法都依据 src/games-*.js（各关一个文件）与 main.js 的界面：界面改了，这里对应改。

// 包饺子：他说的话 → [东西, 放到哪]（与 games-kitchen.js KITCHEN_STEPS 一致）
const KITCHEN = {
  '撒点面粉在案板上': ['flour', 'board'], '把擀面杖递给我': ['pin', 'grandpa'], '把擀面杖给孙女': ['pin', 'girl'],
  '拿张饺子皮给孙女': ['skin', 'girl'], '递张饺子皮给我': ['skin', 'grandpa'], '拿张饺子皮铺在案板上': ['skin', 'board'],
  '把馅料端到我手边': ['fill', 'grandpa'], '把馅料放到案板旁边': ['fill', 'board'],
  '那碗水放到孙女手边': ['water', 'girl'], '那碗水端给我蘸皮': ['water', 'grandpa'],
  '包好的饺子摆到盖帘上': ['jiao', 'tray'], '包好的饺子先放盘子里': ['jiao', 'plate'],
};
// 诈骗电话里骗子说的话 → 是不是破绽（与 lines.js SCRIPT.scam 一致）
const SCAM_FLAG = ['猜猜我是谁', '嗓子有点哑', '新号码', '马上赔两万', '千万别跟别人说', '卡号转账', '给亲戚还钱', '验证码', '来不及了'];
const CN_NUM = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const CHESS = { bj: [4, 0], bs: [4, 1], bz: [6, 5], rs: [4, 9], rm: [2, 2], rp: [4, 6], rc: [0, 4] };

export function player(api) {
  const { js, log } = api;
  const vis = (sel) => js(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); return !!(e && e.getClientRects().length && !e.disabled && getComputedStyle(e).visibility!=='hidden')})()`);
  // 当前界面是什么
  const screen = () => js(`(()=>{
    const v=(s)=>{const e=document.querySelector(s); return !!(e && e.getClientRects().length && !e.disabled)};
    const S=__mg.sim, gm=!document.querySelector('#game').classList.contains('hidden') && !document.querySelector('#game').dataset.closing;   // closing：这关做完了，正等话说完再关
    let game=null;
    if (gm) game = v('#lS')?'learn': v('#rOk')?'recall': (v('#dOpen')||v('#dEnd')||document.querySelector('#dM'))?'digitsLearn': v('#dT')?'digitsRecall': document.querySelector('#cSvg')?'clock': \
document.querySelector('#sScene')?'steps': document.querySelector('#cT')?'change': (document.querySelector('#scL')||document.querySelector('#scEnd'))?'scam': v('#gNext')?'talk': document.querySelector('#cBoard')?'chess': 'other';
    const mp = !!document.querySelector('#mappanel') && getComputedStyle(document.querySelector('#mappanel')).display!=='none' && document.querySelector('#mappanel').getClientRects().length;
    const map = mp ? (document.querySelector('#rGo')?'route': document.querySelector('#tMsg')||document.querySelector('#tGo')?'trail':null) : null;
    const modal=!document.querySelector('#modal').classList.contains('hidden');
    const btns=modal?[...document.querySelectorAll('#modal button')].filter(b=>b.getClientRects().length&&!b.disabled&&b.id).map(b=>b.id):[];
    const mom=!document.querySelector('#moment').classList.contains('hidden') ? [...document.querySelectorAll('#moment button')].map(b=>b.dataset.id) : null;
    return {phase:S.phase, t:Math.round(S.time), day:S.dayIdx+1, game, map, modal, btns, moment:mom, kind:S.moment&&S.moment.kind, plan: v('#startBtn')};
  })()`);
  const P = {
    failAll: false,   // 自动试玩也走“做错”的分支（检查失败时的台词、关卡收尾）：每个小关卡故意做错
    // 快进的变体（walkcheck 用；不设就是原来的“一口气 4 倍速”）：
    //   ffSpeed：快进时的倍速，数字或每段调用一次的函数；ffChunk：分段快进，每段多少秒（数字或函数）；
    //   onChunk：每段之间调用一次（换倍速、随机帮一把）；pickMoment(选项, 情形)：犹豫时刻自己挑，返回选项 id
    ffSpeed: 4, ffChunk: null, onChunk: null, pickMoment: null,
    rounds: 30,   // autoUntil 最多处理几次途中的事（随机帮法会多开很多次犹豫面板）
    screen, vis,
    // 等界面出现某种状态（每帧检查），同时录像
    async until(cond, max = 120, opt) { return api.until(cond, max, opt); },
    // 看着（录像），光标偶尔轻轻挪一下，界面不进入“静观”淡出
    async watch(sec, drift = true) {
      const n = Math.ceil(sec / 4);
      for (let i = 0; i < n; i++) { await api.wait(Math.min(4, sec - i * 4)); if (drift && i < n - 1) await api.js(`dispatchEvent(new PointerEvent('pointermove'))`); }
    },
    // 快进（不录像）直到条件成立；期间游戏用 4 倍速
    async ffUntil(cond, max = 600) {
      const val = (v) => typeof v === 'function' ? v() : v;
      let left = max, ok = false;
      for (;;) {
        const sp = await val(P.ffSpeed); if (sp) await js(`__mg.setSpeed(${sp})`);   // 函数可以自己换倍速（比如真的去点倍速按钮），返回空就不再设
        const seg = P.ffChunk ? Math.min(left, val(P.ffChunk)) : left;
        ok = await api.until(cond, seg, { rec: false, quiet: true });
        left -= seg;
        if (ok || left <= 0) break;
        if (P.onChunk) { await P.onChunk(); if (await js(`!!(${cond})`)) { ok = true; break; } }   // 这一下帮了忙（打了电话），犹豫面板就开了
      }
      if (!ok) log('等待超时：', cond);
      await js(`__mg.setSpeed(1)`);
      return ok;
    },
    // 快进到条件成立；途中遇到的犹豫时刻、小关卡、地图操作都在镜头外处理（不录）
    async autoUntil(cond, { max = 400, prefer } = {}) {
      // P.memory = { caption, sub }：途中他讲往事（界面收起、镜头推近）时恢复录像，讲完再快进
      const mem = P.memory ? ` || (document.body.classList.contains('evening') && __mg.sim.phase==='live')` : '';
      const busy = `!document.querySelector('#moment').classList.contains('hidden') || !document.querySelector('#game').classList.contains('hidden') || !!(document.querySelector('#mappanel') && document.querySelector('#mappanel').getClientRects().length)${mem}`;
      const was = api.recording; api.rec(false);
      for (let k = 0; k < (P.rounds || 30); k++) {
        // 等不到就直接报错停下（不要在后台空转）
        // 带上当时的状态，下次偶发时能看出卡在哪
        if (!(await P.ffUntil(`(${cond}) || ${busy}`, max))) {
          const st = await js(`(()=>{const S=__mg.sim; return {t:Math.round(S.time), phase:S.phase, mode:S.e?.mode, node:S.e?.node, target:S.e?.target, lost:!!S.e?.lost, goals:(S.goals||[]).map(g=>g.id+':'+g.status).join(' '), \
moment:S.moment?.kind||null, opening:document.body.classList.contains('opening'), modal:!document.querySelector('#modal').classList.contains('hidden')}})()`);
          throw new Error('快进等不到：' + cond + '｜当时：' + JSON.stringify(st)); }
        if (await js(`!!(${cond})`)) { api.rec(was); return true; }
        if (P.memory && await js(`document.body.classList.contains('evening')`)) {
          api.rec(was);
          await api.caption(P.memory.caption, P.memory.sub || '');
          await api.until(`!document.body.classList.contains('evening')`, 90);
          await api.caption(null); await api.wait(0.8);
          P.memory = null; api.rec(false); continue;
        }
        const s = await screen();
        if (process.env.DBG) log('autoUntil 第', k, '轮', JSON.stringify(s).slice(0, 300));
        if (s.moment) await P.moment(prefer);
        else if (!(await P.solve())) await api.skip(0.5);   // 没事可做（关卡正在收尾、等他把话说完）：让时间走半秒再看，别原地空转 30 轮
      }
      api.rec(was); log('autoUntil 没等到', cond); return false;
    },
    // 选一张道具卡（按卡上的名字），再点地图上的目标（选择器或坐标）；返回是否放下
    async place(name, target, opt = {}) {
      const card = `(()=>[...document.querySelectorAll('#cards .card')].find(b=>!b.disabled && b.querySelector('.nm')?.textContent===${JSON.stringify(name)}))()`;
      if (!(await api.where(card))) { log('没有这张卡', name); return false; }
      await api.click(card, { move: 0.5, after: 0.4 });
      if (target) await api.click(target, { move: 0.6, after: opt.after ?? 0.8 });
      return true;
    },
    // 把路标放到所有「？」路口（精力够的话）
    async signAll(max = 3) {
      for (let i = 0; i < max; i++) {
        const risk = await api.where('#bubbles .risk');
        if (!risk) break;
        if (!(await P.place('路标', risk))) break;
      }
    },
    // 镜头外把这一天玩完、停在结算（存档由游戏在结算时写好，下一段接着玩下一天）
    async finishDay() {
      api.rec(false); P.memory = null;
      await P.autoUntil(`document.querySelector('#bNext') || document.querySelector('#bEnd')`);
    },
    // 从标题画面进入当天：点“继续” → 看当天介绍 → 开始布置
    async openDay({ intro = 3, cursor = true } = {}) {
      await api.cursor(cursor);
      await api.until(`document.querySelector('#bGo')`, 10);
      await api.wait(0.6); await api.click('#bGo');
      await api.until(`document.querySelector('#bPlan')`, 60);   // 第一次开始会先放约 30 秒开场
      await api.wait(intro); await api.click('#bPlan'); await api.wait(0.8);
    },
    async menuItems() { return js(`(__mg.sim.goals.find(g=>g.menu)||{}).menu?.items || []`); },
    // 解开当前的小关卡／地图操作；返回做了什么
    async solve(opt = {}) {
      const s = await screen();
      if (s.game) return P.game(s.game, opt);
      if (s.map === 'route') return P.route(opt);
      if (s.map === 'trail') return P.trail(opt);
      return null;
    },
    async game(kind, opt = {}) {
      log('小关卡', kind);
      const fail = opt.fail ?? P.failAll; if (fail) opt = { ...opt, fail: true };
      if (kind === 'learn') { await api.until(`document.querySelector('#lOk')`, 40); await api.wait(0.6); await api.click('#lOk'); }
      else if (kind === 'recall') {
        let items = opt.items || await P.menuItems(); if (fail) items = items.slice(0, 1);   // 做错：只想起一样
        await api.wait(opt.think ?? 1.2);
        if (fail) for (let k = 0; k < 3; k++) { await api.click('#rHelp', { move: 0.4, after: 1.6 }); }   // 做错：三层提醒都用上（想菜名→说菜名→摊主挑几样），还是只拿一样
        for (const x of items) await api.click(`#game .food[data-x="${x}"]`, { move: 0.45, after: 0.35 });
        await api.wait(0.4); await api.click('#rOk'); await api.wait(2.4);
      }
      else if (kind === 'change') {
        await api.wait(opt.think ?? 1);
        let m = 100;
        for (let i = 0; i < 10 && !(await js(`/^算对了/.test(document.querySelector('#cS')?.textContent || '') || !!document.querySelector('#game')?.dataset.closing`)); i++) {
          m -= fail ? 6 : 7;   // 做错：每次减 6
          for (const d of String(m)) await api.click(`#game .keypad button[data-k="${d}"]`, { move: 0.3, after: 0.12 });
          await api.click(`#game .keypad button[data-k="ok"]`, { move: 0.3, after: 0.5 });
        }
        await api.wait(2.5);
      }
      else if (kind === 'digitsLearn') {
        await api.wait(0.8); await api.click('#dOpen', { after: 0.2 });
        const code = await js(`document.querySelector('#dM b')?.textContent`); P.code = code; log('取件码', code);
        await api.until(`document.querySelector('#dEnd')`, 10); await api.wait(1.2); await api.click('#dEnd');
      }
      else if (kind === 'digitsRecall') {
        const code = P.code || await js(`(__mg.sim.day.levels||[]).find?.(l=>l.digits)?.digits?.join('')`);
        await api.wait(1.6);
        for (const d of (fail ? [...String(code)].reverse().join('') : String(code))) await api.click(`#game .keypad button[data-k="${d}"]`, { move: 0.35, after: 0.2 });   // 做错：倒着输
        await api.click(`#game .keypad button[data-k="ok"]`); await api.wait(2.2);
      }
      else if (kind === 'clock') await P.clock(opt);
      else if (kind === 'steps') await P.steps(opt);
      else if (kind === 'scam') await P.scam(opt);
      else if (kind === 'talk') { while (await vis('#gNext')) { await api.wait(opt.page ?? 3.5); await api.click('#gNext'); } }
      else if (kind === 'chess') await P.chess(opt);
      else { log('不认识的小关卡'); return null; }
      return kind;
    },
    async clock(opt = {}) {
      const title = await js(`document.querySelector('#game .gt b')?.textContent || ''`);
      // 两点半／五点十分……
      const mh = title.match(/^(.)点(半|(.+)分)?/); const h = CN_NUM[mh?.[1]] || 2; const m = mh?.[2] === '半' ? 30 : mh?.[3] ? (mh[3].length === 1 ? CN_NUM[mh[3]] : mh[3] === '十' ? 10 : 10 * (CN_NUM[mh[3][0]] || 1) + (CN_NUM[mh[3][1]] || 0)) : 0;
      log('闹钟', title, h, m);
      const box = await js(`(()=>{const r=document.querySelector('#cSvg').getBoundingClientRect(); return [r.left,r.top,r.width,r.height]})()`);
      const at = (x, y) => [box[0] + (x + 110) / 220 * box[2], box[1] + (y + 110) / 220 * box[3]];
      const polar = (deg, r) => at(Math.sin(deg * Math.PI / 180) * r, -Math.cos(deg * Math.PI / 180) * r);
      await api.wait(1.2);
      if (opt.fail) {   // 做错：数字不摆，只把时针拨到错的钟点就说修好了（什么都不做按“修好了”只会被提醒，不算交）
        await api.drag([polar(200, 26), polar(215, 32), polar(230, 38)], { sec: 0.6, after: 0.3 });
        await api.click('#cOk'); await api.wait(2.2); return;
      }
      const order = opt.order || [12, 3, 6, 9, 1, 2, 4, 5, 7, 8, 10, 11];
      for (const n of order) {
        if (await js(`document.querySelector('#game .num[data-n="${n}"]').classList.contains('fixed')`)) continue;   // 没摔掉的数字本来就在钟面上
        const from = await api.where(`#game .num[data-n="${n}"]`);
        await api.drag([from, polar(n * 30, 84)], { sec: 0.35, after: 0.1 });
      }
      await api.wait(0.5);
      // 时针：从中心附近拖；分针：从外圈拖
      const ha = (h % 12) * 30 + m * 0.5, ma = m * 6;
      // 起点都要避开钟面上的数字（数字在半径 84 一圈，按下数字会把数字拖走）：时针在半径 30 内，分针在半径 60—66 之间
      await api.drag([polar(ha + 40, 26), polar(ha + 20, 32), polar(ha, 38)], { sec: 0.7, after: 0.3 });
      await api.drag([polar(ma - 50, 62), polar(ma - 25, 64), polar(ma, 66)], { sec: 0.7, after: 0.5 });
      await api.click('#cOk'); await api.wait(2.2);
    },
    async steps(opt = {}) {
      // 需要设置“提示文字：多”，他说的三句会显示成文字
      const said = [];
      for (let i = 0; i < 40 * api.FPS && !(await vis('#sRe')); i++) {
        const t = await js(`document.querySelector('#sS')?.textContent || ''`);
        for (const k of Object.keys(KITCHEN)) if (t.includes(k) && !said.includes(k)) said.push(k);
        await api.wait(1 / api.FPS);
      }
      log('包饺子', said.join(' / '));
      await api.wait(0.6);
      for (const k of (opt.fail ? said.slice(0, 3).reverse() : said.slice(0, 3))) {   // 做错：顺序倒过来
        const [item, spot] = KITCHEN[k];
        await api.click(`#game .kt-item[data-k="${item}"]`, { move: 0.45, after: 0.3 });
        await api.click(`#game .kt-tgt[data-s="${spot}"] .kt-hl`, { move: 0.5, after: 0.5 });
      }
      await api.wait(2.6);
    },
    async scam(opt = {}) {
      let last = '';
      // 电话进行中：听到破绽就点“不对劲！”
      for (let i = 0; i < 120 * api.FPS; i++) {
        const st = await js(`(()=>{const L=document.querySelector('#scL'); return {t:L?.textContent||'', me:L?.classList.contains('me'), tapped:!!L?.dataset.tapped, tap:!!document.querySelector('#scTap:not([disabled])'), \
R:[...document.querySelectorAll('#scR button, #game .row button')].map(b=>b.id)}})()`);
          
        if (!st.tap && st.R.some(id => ['scA', 'scB', 'scV', 'scOk', 'scEnd', 'scN'].includes(id))) break;
        if (!opt.fail && st.tap && !st.me && !st.tapped && st.t !== last && SCAM_FLAG.some(k => st.t.includes(k))) {   // 做错：一个破绽都不点
          last = st.t; await api.wait(opt.react ?? 0.9);
          await api.click('#scTap', { move: 0.35, after: 0.1 });
        }
        await api.wait(1 / api.FPS);
      }
      // 之后：讲破绽让他自己判断 → 打给女儿本人核实 → 反诈卡片
      for (let k = 0; k < 40; k++) {
        const ids = await js(`[...document.querySelectorAll('#game button')].filter(b=>b.getClientRects().length).map(b=>b.id)`);
        const pick = (opt.fail ? ['scB', 'scOk', 'scEnd', 'scA', 'scV'] : ['scA', 'scV', 'scOk', 'scEnd', 'scB']).find(id => ids.includes(id));   // 做错：先让他自己处理
        if (!pick) { if (!(await js(`!document.querySelector('#game').classList.contains('hidden')`))) break; await api.wait(0.5); continue; }
        await opt.onStep?.(pick);
        await api.wait(pick === 'scEnd' ? (opt.card ?? 6) : 1.4);
        if (!(await api.where('#' + pick))) continue;   // 等待期间界面换了，重新看
        await api.click('#' + pick); await api.wait(1);
        if (pick === 'scEnd') break;
      }
    },
    async chess(opt = {}) {
      await api.wait(1.5);
      for (const [k, [x, y0]] of Object.entries(CHESS)) {
        const y = opt.fail ? (y0 + 1) % 10 : y0;   // 做错：每个子都往下错一行（棋子没摆完按“摆好了”只会被提醒，不算交）
        const from = await api.where(`#cTray .pc2[data-k="${k}"]`);
        const to = await api.where(`#cB .hit[data-x="${x}"][data-y="${y}"]`);
        await api.drag([from, to], { sec: 0.5, after: 0.25 });
      }
      await api.wait(0.6); await api.click('#cDone'); await api.wait(2.5);
    },
    // 电话指路：按最短路（优先走他认得的★路口）一格一格点
    async route(opt = {}) {
      const path = await js(`(()=>{const S=__mg.sim, from=S.e.node, to=S.e.target; const prev={[from]:-1}, q=[from];
        while(q.length){const a=q.shift(); if(a===to) break; for(const b of S.adj(a)) if(!(b in prev)){prev[b]=a; q.push(b);}}
        const p=[]; for(let n=to; n!==from && n!==undefined && n!==-1; n=prev[n]) p.unshift(n); return p;})()`);
      log('指路', path.join('→'));
      await api.wait(1.2);
      const pts = [await js(`__mg.screenOf(__mg.sim.e.node)`)];
      const steps = path.slice(0, 3);   // 电话里一次最多说 3 个路口（mapops ROUTE_MAX）
      for (const n of steps) pts.push(await js(`__mg.screenOf(${n})`));
      if (opt.swipe !== false) await api.drag(pts, { sec: 0.45 * steps.length, after: 0.5 });
      else for (const p of pts.slice(1)) await api.click(p, { after: 0.25 });
      await api.click('#rGo'); await api.wait(1);
    },
    // 健步走连线：等示范结束，从 1 起按住滑过去
    async trail(opt = {}) {
      // 示范开始前 trailLabel 也是 '1'：要等示范放完、起点亮起“线头”
      await api.until(`document.querySelector('#maplayer .mtag.head') && __mg.trailLabel()==='1'`, 30);
      await api.wait(0.8);
      const labels = ['1', '甲', '2', '乙', '3', '丙', '4', '丁', '5', '戊'];
      const pts = [];
      for (const l of labels) pts.push(await js(`(()=>{const e=[...document.querySelectorAll('#maplayer .mtag')].find(e=>e.textContent===${JSON.stringify(l)}); if(!e) return null; const b=e.getBoundingClientRect(); return [b.left+b.width/2,b.top+b.height/2]})()`));
      if (opt.swipe === false || pts.some(p => !p)) { for (const l of labels) await api.click(`(()=>[...document.querySelectorAll('#maplayer .mtag')].find(e=>e.textContent===${JSON.stringify(l)}))()`, { after: 0.2 }); }
      else await api.drag(pts, { sec: 4.5, after: 0.6 });
      await api.until(`document.querySelector('#tGo')`, 5);
      await api.wait(1.5); await api.click('#tGo'); await api.wait(1);
    },
    // 犹豫时刻：按给定顺序选（默认先等一等，还不行就提示）
    async moment(prefer = ['wait', 'cue', 'tell']) {
      const opts = await js(`[...document.querySelectorAll('#moment button')].map(b=>b.dataset.id)`);
      const pick = (P.pickMoment && await P.pickMoment(opts, await js(`__mg.sim.moment?.kind`))) || prefer.find(p => opts.includes(p)) || opts[0];
      log('犹豫时刻', await js(`__mg.sim.moment?.kind`), '→', pick);
      await api.click(`#moment button[data-id="${pick}"]`, { move: 0.6, after: 0.4 });
      return pick;
    },
  };
  return P;
}
