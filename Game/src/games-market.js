// 小关卡：第 1 天菜摊：出门前念两遍清单、到菜摊帮他想起来（选菜）、结账算找零（由 games.js 拆出，09-27）
import { MARKET_POOL, MOMENTS } from './data.js';
import { narrate } from './audio.js';
import { NARR } from './narr.js';
import { SCRIPT } from './lines.js';
import { food, vendorFigure } from './pictos.js';
import { speak, open, later, closeAfter, close, once, shuffle, nudge, result } from './game-kit.js';
import { contentRand } from './util.js';

// 延迟回忆（参考 MoCA：先自由回忆，想不起再给线索，最后才给选项）——第 1 天菜摊：
// 0 你自己挑 → 1 你提醒他“想想今天做什么菜” → 2 你告诉他早上说的菜名，他跟摊主说 → 3 摊主按菜名挪出几样 → 装袋，接着结账
const FOOD_ICON = { 西红柿: '🍅', 鸡蛋: '🥚', 面条: '🍜', 小葱: '🌱', 青菜: '🥬', 鲫鱼: '🐟', 生姜: '🫚', 大葱: '🧅', 豆腐: '🧈', 韭菜: '🌿', 猪肉: '🥩', 饺子皮: '🫓', 香油: '🫙', 排骨: '🍖', 冬瓜: '🍈', 香菜: '🌿', 枸杞: '🔴', 橘子: '🍊', 香蕉: '🍌', 苹果: '🍎', 葡萄: '🍇', 梨: '🍐',
  土豆: '🥔', 茄子: '🍆', 黄瓜: '🥒', 胡萝卜: '🥕', 白菜: '🥬', 青椒: '🫑', 牛肉: '🥩', 鸡翅: '🍗', 带鱼: '🐟', 芹菜: '🌿', 蒜苗: '🌱', 木耳: '🍄', 豆芽: '🌱', 南瓜: '🎃', 虾: '🦐', 香菇: '🍄', 菠菜: '🥬', 洋葱: '🧅', 西瓜: '🍉', 桃子: '🍑', 葱油饼: '🥞', 馒头: '🥟' };
// 菜摊行情（元／份）
const PRICE = { 土豆: 4, 茄子: 6, 黄瓜: 5, 胡萝卜: 3, 白菜: 5, 青椒: 6, 牛肉: 35, 鸡翅: 18, 带鱼: 22, 芹菜: 4, 蒜苗: 6, 木耳: 12, 豆芽: 3, 南瓜: 8, 虾: 28, 香菇: 9, 菠菜: 5, 洋葱: 4, 西瓜: 15, 桃子: 10, 葱油饼: 5, 馒头: 2, 西红柿: 6, 鸡蛋: 8, 面条: 5,
  小葱: 2, 青菜: 4, 韭菜: 5, 猪肉: 20, 饺子皮: 6, 香油: 12, 排骨: 30, 冬瓜: 6, 香菜: 3, 枸杞: 15, 橘子: 8, 香蕉: 7, 苹果: 9, 葡萄: 12, 梨: 8 };
export function recallGame(menu, sfx, done) {
  done = once(done);
  const n = menu.items.length;
  const pool = shuffle(MARKET_POOL.filter(x => !menu.items.includes(x)));
  const all = shuffle([...menu.items, ...pool.slice(0, 16 - n)]);
  // 每样标价：清单上的都是 7 元；别的按行情标，另随机挑几样也标 7 元，价格不能当线索
  const price = {};
  for (const x of all) price[x] = menu.items.includes(x) ? 7 : (PRICE[x] ?? 6);
  shuffle(all.filter(x => !menu.items.includes(x))).slice(0, 3 + Math.floor(contentRand() * 2)).forEach(x => price[x] = 7);
  const picked = new Set();
  let stage = 0; // 0 自己想 1 提醒他想菜名 2 告诉他菜名 3 摊主挑出几样
  // 菜摊：遮阳棚、摊主（系围裙、不画五官）、木板上的菜；摊主会搭话，提示也由他说出口（不会透露清单）
  const vendor = vendorFigure();
  const g = open(`
    <div class="gt" id="rT"></div><div class="gs" id="rS"></div>
    <div class="mk-top"><svg class="awning" viewBox="0 0 400 28" preserveAspectRatio="none">${Array.from({ length: 10 }, (_, i) => `<polygon points="${i * 40},0 ${i * 40 + 40},0 ${i * 40 + 40},18 ${i * 40 + 20},28 ${i * 40},18" fill="${i % 2 ? '#f3efe6' : '#d9534f'}"/>`).join('')}</svg>
      <div class="mk-vendor">${vendor}<div class="mk-say" id="rV">来看看，今天的菜都新鲜！</div></div></div>
    <div class="stall">${all.map(x => `<button class="food" data-x="${x}"><i>${food(x, 44)}</i><span>${x}</span><em class="pz">${price[x]} 元</em></button>`).join('')}</div>
    <div class="basket"><span class="bk-l">篮子</span><span id="rB" class="bk-items"></span></div>
    <div class="row"><button class="ghost" id="rHelp">提醒他：想想做什么菜</button><button class="primary" id="rOk">就这些</button></div>`);
  g.classList.add('wide');
  const T = g.querySelector('#rT'), S = g.querySelector('#rS'), B = g.querySelector('#rB'), V = g.querySelector('#rV');
  // 摊主随口应答：有人在说就不说（连点菜时不排长队）；类别提示、收尾那句要说完
  const say = (t, must = false) => { V.textContent = t; V.classList.remove('pop'); void V.offsetWidth; V.classList.add('pop'); return speak(t, { mode: must ? 'queue' : 'skip' }); };
  // 挑菜时摊主的话：第 1 样说一句，之后隔一样说一句；按顺序轮换（不随机，不会连着重复）；篮子里两样以上时偶尔问一句还要什么（对错都问，不泄露清单）
  const LINES = SCRIPT.vendor.pick, V_ = SCRIPT.vendor, E_ = SCRIPT.shop;
  let picks = 0, lineI = 0;
  const pickLine = () => { picks++; if (picks % 2 === 0) return null; if (picked.size >= 2 && picks % 4 === 3) return V_.more; return LINES[lineI++ % LINES.length]; };
  const dish = menu.dish;
  const elder = (t) => speak(t);   // 他说的话：马上说（停掉摊主没说完的闲话）
  const after = (said, fn) => Promise.resolve(said).then(d => later(g, fn, (d || 0) * 1000 + 250));   // 一句说完再接下一句：文字和声音一起出来
  later(g, () => speak(V_.hello, { mode: 'queue' }), 300);   // 他那句“还要买什么来着……”是犹豫时刻的开场（stage.js 已配音），这里只写在标题上
  const HELP = ['提醒他：想想做什么菜', '告诉他早上说的菜名', '还是不确定', ''];
  const stageText = () => {
    const help = g.querySelector('#rHelp'); help.textContent = HELP[stage]; help.classList.toggle('hidden', !HELP[stage]);
    if (stage === 0) { T.innerHTML = `他问：“${MOMENTS.shop.title}”`; S.textContent = NARR.recall0; narrate(NARR.recall0); }
    if (stage === 1) { T.innerHTML = '你：“想想，今天做什么菜？”'; S.textContent = `他：“${E_.think}”`; elder(E_.think); }
    if (stage === 2) { const l = E_.dish.replace('{dish}', dish); T.innerHTML = `他跟摊主说：“${l}”`; S.textContent = NARR.recall2; narrate(NARR.recall2); after(elder(l), () => { if (stage === 2) say(V_.fine, true); }); }
    if (stage === 3) { T.innerHTML = '摊主帮着挑了几样'; S.textContent = NARR.recall3; narrate(NARR.recall3); say(V_.narrow.replace('{dish}', dish), true); narrow(); }
  };
  const drawBasket = () => { B.innerHTML = picked.size ? [...picked].map(x => `<i title="${x}">${food(x, 28)}</i>`).join('') : '<span class="gs">空</span>'; };
  drawBasket();
  g.querySelectorAll('.food').forEach(b => b.onclick = () => {
    if (g.dataset.closing) return;
    const x = b.dataset.x; if (picked.has(x)) picked.delete(x); else picked.add(x);
    b.classList.toggle('on', picked.has(x)); sfx('click'); drawBasket();
    if (!picked.has(x)) say(V_.drop); else { const l = pickLine(); if (l) say(l); }
  });
  // 挑好了：标出对错，摊主装袋——接着就是结账（同一个菜摊），不再说“慢走”
  const finish = () => {
    const hit = [...picked].filter(x => menu.items.includes(x)).length, wrong = picked.size - hit;
    g.querySelectorAll('.food').forEach(b => {
      const x = b.dataset.x, inList = menu.items.includes(x);
      b.classList.remove('gone');
      if (inList) b.classList.add(picked.has(x) ? 'ok' : 'miss'); else if (picked.has(x)) b.classList.add('bad');
    });
    const q = hit === n && wrong === 0 ? 1 : Math.max(0, hit / n - wrong * 0.25);
    sfx(q >= 0.99 ? 'good' : 'q'); const bag = say(V_.bag, true);
    const how = ['自己想起来的', '提醒他想了想菜名', '说出菜名后想起来的', '从摊主挑出的几样里认出来的'][stage];
    const row = g.querySelector('.row'); row.innerHTML = '<span></span>';
    result(row.firstChild, q, q >= 0.99 ? `全对！（${how}）` : `对了 ${hit}/${n} 样${wrong ? `，多拿了 ${wrong} 样` : ''}。绿色是要买的，黄色是漏掉的。`);
    closeAfter(g, bag, 2200, () => { close(); done(q, { hit: Math.max(0, hit - wrong), stage, picked: [...picked] }); });
  };
  g.querySelector('#rOk').onclick = () => {
    if (g.dataset.closing) return;
    if (!picked.size && nudge(S, '篮子还是空的：点菜放进篮子；想不起来，就提醒他', sfx)) return;
    finish();
  };
  g.querySelector('#rHelp').onclick = () => { if (g.dataset.closing || stage >= 3) return; stage++; sfx('click'); stageText(); };
  // 摊主按菜名挪出几样：还没挑中的要买的菜，加上几样别的，凑成 5 样；其余挪开（已放进篮子的不动）
  const narrow = () => {
    const miss = menu.items.filter(x => !picked.has(x));
    const keep = new Set([...miss, ...shuffle(all.filter(x => !menu.items.includes(x) && !picked.has(x))).slice(0, Math.max(0, 5 - miss.length))]);
    g.querySelectorAll('.food').forEach(b => { if (!keep.has(b.dataset.x) && !picked.has(b.dataset.x)) b.classList.add('gone'); });
  };
  stageText();
}

// 出门前他念两遍清单（学习两轮；逐个出现，不常驻）
export function learnList(menu, sfx, done) {
  done = once(done);
  const g = open(`<div class="gt">早饭桌上，他念叨今天要买的菜</div><div class="gs">他念两遍，你记一记。等他到了菜市场，可能会想不起来。</div><div class="say" id="lS"></div><div class="row"><span class="gs" id="lR"></span></div>`);
  const S = g.querySelector('#lS'), R = g.querySelector('#lR');
  const seq = [];
  for (let round = 0; round < 2; round++) { seq.push({ t: round ? '再念一遍——' : `${menu.say || '今天做' + menu.dish}……`, r: round }); menu.items.forEach(x => seq.push({ t: x, r: round, item: true })); }
  let i = 0;
  // 只念两遍（同原题两轮学习），不问“记住了吗”——记没记住，到了菜摊才见分晓
  const step = () => {
    if (i >= seq.length) { S.textContent = '……好，出门买菜去。'; R.innerHTML = '<button class="primary" id="lOk">好</button>'; g.querySelector('#lOk').onclick = () => { sfx('click'); close(); done(); }; return; }
    const it = seq[i++]; S.innerHTML = it.item ? `<b>${it.t}</b>` : it.t; S.className = 'say' + (it.item ? ' item' : '');
    R.textContent = `第 ${it.r + 1} 遍`; if (it.item) sfx('click');
    later(g, step, it.item ? 1100 : 1500);
  };
  step();
}

// 连续减法（参考 MMSE／MoCA 连续减 7：每一步按上一步的答案独立判断）
export function changeGame(sfx, done, items) {
  done = once(done);
  let money = 100, step = 0, answers = [], typed = '';
  const fruits = (items && items.length ? items : ['西红柿', '鸡蛋', '面条', '小葱', '青菜']).slice(0, 10), N = fruits.length;   // 篮子里挑了几样就算几样
  // 同一个菜摊结账：摊主一样一样装袋，你心算还剩多少（不显示实时余额——连续减 7 要自己记住上一步）
  narrate(NARR.change);
  const g = open(`<div class="gt">结账：带了 <b>100</b> 元，每样 <b>7</b> 块</div>
    <div class="gs">摊主一样一样装袋，帮他算算还剩多少。（他会按你说的数去核对找零）</div>
    <div class="mk-top"><svg class="awning" viewBox="0 0 400 28" preserveAspectRatio="none">${Array.from({ length: 10 }, (_, i) => `<polygon points="${i * 40},0 ${i * 40 + 40},0 ${i * 40 + 40},18 ${i * 40 + 20},28 ${i * 40},18" fill="${i % 2 ? '#f3efe6' : '#d9534f'}"/>`).join('')}</svg>
      <div class="mk-vendor">${vendorFigure()}<div class="mk-say" id="cV">一样 7 块，您算算～</div></div></div>
    <div class="ck-row"><div class="ck-bag" id="cBag"><span class="gs">袋子</span></div><div class="ck-next" id="cN"></div></div>
    <div class="say" id="cS">第 1 样：${fruits[0]}，7 块。还剩多少？</div><div class="say big" id="cT">_</div><div class="gs" id="cH"></div>
    <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map(k => `<button data-k="${k}">${k}</button>`).join('')}<button data-k="del">⌫</button><button data-k="ok" class="okk">确定</button></div>`);
  g.classList.add('wide');
  const showNext = () => { const n = g.querySelector('#cN'); n.innerHTML = step < fruits.length ? `${food(fruits[step], 40)}<span>${fruits[step]} · 7 块</span>` : ''; };
  const S = g.querySelector('#cS'), T = g.querySelector('#cT');
  showNext();
  g.querySelectorAll('.keypad button').forEach(b => b.onclick = () => {
    const k = b.dataset.k; sfx('click');
    if (g.dataset.closing) return;
    if (k === 'del') typed = typed.slice(0, -1);
    else if (k === 'ok' && !typed) { g.querySelector('#cH').textContent = '先按数字，再点确定。'; g.querySelector('#cH').classList.remove('nudge'); void g.querySelector('#cH').offsetWidth; g.querySelector('#cH').classList.add('nudge'); sfx('deny'); return; }   // 心算总能报个数：只提醒
    else if (k === 'ok') {
      g.querySelector('#cH').textContent = '';
      const prev = step === 0 ? 100 : answers[step - 1];
      answers.push(+typed); step++; typed = '';
      g.querySelector('#cBag').insertAdjacentHTML('beforeend', `<i title="${fruits[step - 1]}">${food(fruits[step - 1], 30)}</i>`); showNext();
      if (step >= N) {
        let ok = 0; answers.forEach((a, i) => { const p = i === 0 ? 100 : answers[i - 1]; if (a === p - 7) ok++; });
        S.textContent = `算对了 ${ok}/${N} 步：${answers.join(' → ')}`; result(T, ok / N, ok === N ? '找零一分不差 ✓' : '（每一步都按你上一步的数来核对）');
        sfx(ok >= N * 0.8 ? 'good' : 'q');
        g.querySelector('#cV').textContent = SCRIPT.vendor.bye; const bye = speak(SCRIPT.vendor.bye);
        closeAfter(g, bye, 2200, () => { close(); done({ q: ok / N, ok, n: N }); }); return;
      }
      S.textContent = `第 ${step + 1} 样：${fruits[step]}，7 块。还剩多少？`;
    } else if (/\d/.test(k) && typed.length < 3) { typed += k; T.innerHTML = `<span>${typed.slice(0, -1)}<span class="typed-new">${k}</span></span>`; return; }   // 刚输入的那位弹一下
    T.textContent = typed || '_';
  });
}

