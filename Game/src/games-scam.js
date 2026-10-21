// 小关卡：第 6 天陌生来电：听出冒充女儿的破绽、帮他判断、打给女儿本人核实（由 games.js 拆出，09-27）
import { voiceKey } from './audio.js';
import { SCRIPT } from './lines.js';
import { speak, open, later, every, stop, close, once } from './game-kit.js';

// 反诈章节：完整来电 → 找破绽（参考 MoCA 警觉：只对特定信息做反应）→ 帮他判断 → 打电话核实 → 反诈小卡片
const FLAGS = {
  identity: { name: '冒充身份', why: '“猜猜我是谁”是等你自己说出名字，骗子再顺着认下；“嗓子哑了”“换了新号”是为了掩盖声音不对。' },
  urgent:   { name: '制造紧急', why: '“马上”“来不及了”——越催，越不给你思考和核实的时间。' },
  secret:   { name: '要求保密', why: '“千万别跟别人说”——骗子最怕你找家人商量。' },
  account:  { name: '陌生账户', why: '钱转进不认识的人的卡号，就追不回来了。' },
  coach:    { name: '教你说谎', why: '教你对银行柜员撒谎，是为了绕过银行的劝阻。' },
  code:     { name: '索要验证码', why: '验证码就是钱的钥匙，任何人要都不能给。' },
};
// 冒充女儿（孙女还在上小学，没有手机）
// 一问一答：[说话人（fake 骗子／me 爷爷）, 台词, 破绽类别, 提到钱]；爷爷的回话让对话合理，也示范骗子怎么顺着他的话“认下”身份
const SCAM_LINES = SCRIPT.scam;   // 剧本在台词表（lines.js）
export function scamCall(opts, sfx, done) {
  done = once(done);
  const caught = new Set(); let falses = 0;
  const g = open(`<div class="gk">陌生号码来电</div><div class="gt" id="scT">电话响了……</div>
    <div class="gs" id="scS">爷爷接起电话，按了免提。</div>
    <div class="sc-phone"><span class="sc-av">?</span><div><b>陌生号码</b><small id="scNo">来电</small></div></div>
    <div class="sc-hist" id="scH"></div>
    <div class="call" id="scL">叮铃铃——</div>
    <div class="flags" id="scF"></div>
    <div class="row" id="scR"><span class="gs" id="scC"></span><button class="primary big" id="scTap" disabled>不对劲！</button></div>`);
  const L = g.querySelector('#scL'), F = g.querySelector('#scF'), R = g.querySelector('#scR'), H = g.querySelector('#scH');
  // 对话记录：说过的话都留在上面（区域限高、可滚动），老年玩家不用硬记前一句，也能往回翻；点过“不对劲”的那句带着标记
  // 全部留着，可以往回翻；新的一句自动滚到底
  const pushHist = () => { if (i < 0) return; const d = document.createElement('div');
    d.className = 'h' + (L.classList.contains('me') ? ' me' : '') + (L.classList.contains('hit') ? ' hit' : L.classList.contains('miss') ? ' miss' : ''); d.textContent = L.textContent; H.appendChild(d); H.scrollTop = H.scrollHeight; };
  let secs = 0; const clockT = () => { const n = g.querySelector('#scNo'); if (n) n.textContent = `通话中 ${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`; };
  sfx('phone'); later(g, () => sfx('phone'), 700);
  let i = -1, cur = null, timer = null, stopAt = opts.pact ? SCAM_LINES.findIndex(l => l[3] === 'money') + 1 : SCAM_LINES.length;   // 有约定：一提到钱他就停
  const drawFlags = () => { F.innerHTML = [...caught].map(k => `<span>${FLAGS[k].name}</span>`).join(''); };
  // 有配音时：说完一句再说下一句（按真实语速）；没有配音就每 2.6 秒一句
  const voiced = !!voiceKey(SCAM_LINES[0][1]);
  const next = () => {
    pushHist();
    i++;
    if (i >= stopAt) { stop(timer); return opts.pact ? pactStop() : decide(); }
    const line = SCAM_LINES[i], me = line[0] === 'me';
    if (me) { L.textContent = '爷爷：' + line[1]; L.className = 'call me'; }   // 他的回话：不算可疑的话，点“不对劲”仍算骗子上一句
    else { cur = line; L.textContent = line[1]; L.className = 'call'; L.dataset.tapped = ''; }
    if (voiced) speak(line[1]).then(d => { if (d) later(g, next, d * 1000 + 900); else later(g, next, 2600); });
  };
  g.querySelector('#scTap').onclick = () => {
    if (!cur || L.dataset.tapped) return; L.dataset.tapped = '1';
    if (cur[2]) { caught.add(cur[2]); L.classList.add('hit'); sfx('good'); drawFlags(); }
    else { falses++; L.classList.add('miss'); sfx('deny'); }
    g.querySelector('#scC').textContent = `找到 ${caught.size} 种破绽${falses ? ` · 误点 ${falses}` : ''}`;
  };
  later(g, () => {
    g.querySelector('#scT').textContent = '听到可疑的话，就点「不对劲！」';
    g.querySelector('#scS').textContent = '冒充身份、催你快、让你保密、要你转账、要验证码……都算。';
    g.querySelector('#scTap').disabled = false; next(); if (!voiced) timer = every(g, next, 2600);
    const ct = every(g, () => { if (i >= stopAt) { stop(ct); const n = g.querySelector('#scNo'); if (n) n.textContent = '通话结束'; return; } secs++; clockT(); }, 1000); clockT();
  }, 1500);

  // 有家人约定：听到要钱，他自己停下来
  const pactStop = () => {
    L.textContent = SCRIPT.scamElder.pact; speak(SCRIPT.scamElder.pact); L.className = 'call hit';
    g.querySelector('#scT').textContent = '他想起了你们的约定';
    R.innerHTML = '<button class="primary" id="scV">他打给你，一起打给他闺女核实</button>';
    g.querySelector('#scV').onclick = () => { sfx('click'); verify('self'); };
  };
  // 没有约定：由你帮他判断（先少后多）
  let triedPersuade = false;
  const decide = () => {
    L.textContent = SCRIPT.scamElder.panic; speak(SCRIPT.scamElder.panic); L.className = 'call';
    g.querySelector('#scT').textContent = '他有点慌。你怎么帮他？';
    g.querySelector('#scS').textContent = caught.size ? `你找到了 ${caught.size} 种破绽。` : '你没怎么找到破绽。';
    R.innerHTML = `${triedPersuade ? '' : '<button class="primary" id="scA">把破绽讲给他，让他自己判断<small>算他自己识破</small></button>'}
      <button class="ghost" id="scB">直接告诉他：这是骗子，挂掉！<small>一定有用 · 不算他自己识破</small></button>
      <button class="ghost" id="scC2">先让他自己处理</button>`;
    g.querySelector('#scA')?.addEventListener('click', () => {
      sfx('click'); triedPersuade = true;
      if (caught.size >= 3) { L.textContent = `“${[...caught].slice(0, 3).map(k => FLAGS[k].name).join('、')}……你这么一说，是不太对劲。”他挂了电话。`; L.className = 'call hit'; later(g, () => verify('self'), 1800); }
      else { L.textContent = SCRIPT.scamElder.doubt; speak(SCRIPT.scamElder.doubt); L.className = 'call miss'; sfx('q'); later(g, decide, 2200); }
    });
    g.querySelector('#scB').onclick = () => { sfx('click'); L.textContent = '他半信半疑地挂了电话。'; later(g, () => verify('told'), 1400); };
    g.querySelector('#scC2').onclick = () => {
      sfx('bad'); g.querySelector('#scT').textContent = '他拿着存折出了门……';
      L.textContent = '银行柜员问：“大爷，这钱是转给谁的？”他支支吾吾，柜员察觉不对，帮他报了警。钱保住了，他却吓得不轻。';
      R.innerHTML = '<button class="primary" id="scN">唉……</button>'; g.querySelector('#scN').onclick = () => lesson('fail');
    };
  };
  // 打电话给女儿本人核实
  const verify = (outcome) => {
    g.querySelector('#scT').textContent = '打给闺女本人（用原来的号码）';
    g.querySelector('#scS').textContent = '';
    L.textContent = '嘟……嘟……'; L.className = 'call'; sfx('phone');
    R.innerHTML = '';
    later(g, () => {
      L.textContent = SCRIPT.daughter; speak(SCRIPT.daughter); L.className = 'call hit'; sfx('good');
      R.innerHTML = '<button class="primary" id="scOk">原来是骗子！</button>'; g.querySelector('#scOk').onclick = () => { sfx('click'); lesson(outcome); };
    }, 1800);
  };
  // 反诈小卡片
  const lesson = (outcome) => {
    const rows = Object.entries(FLAGS).map(([k, f]) => `<div class="lrow ${caught.has(k) ? 'got' : ''}"><b>${caught.has(k) ? '✓' : '○'} ${f.name}</b><span>${f.why}</span></div>`).join('');
    g.innerHTML = `<div class="gk">反诈小卡片</div><div class="gt">这通电话里藏着 ${Object.keys(FLAGS).length} 种破绽，你找到了 ${caught.size} 种</div>
      <div class="lesson">${rows}</div>
      ${voiced ? '<div class="memo"><b>你听出来了吗？</b>　那个“闺女”嗓子哑、说话急、一直催。骗子常说“感冒了、换号了”来掩盖声音不对；现在还有人用 AI 模仿亲人的声音——<b>声音像不像都要核实</b>：挂断后，打给本人原来的号码。</div>' : ''}
      ${opts.leaked ? '<div class="memo warm">骗子怎么知道爷爷的号码？可能就是那天在菜市场门口，为了“免费鸡蛋”留下的。</div>' : ''}
      <div class="memo"><b>三不一多</b>　未知链接不点击，陌生来电不轻信，个人信息不透露，转账汇款多核实。<br>
      接到可疑电话：<b>先挂断，再打给家人本人核实</b>；拿不准可拨打反诈专线 <b>96110</b> 咨询，受骗了立即拨打 <b>110</b> 报警。也可以帮家里老人装上“国家反诈中心”App。</div>
      <div class="row"><button class="primary" id="scEnd">知道了</button></div>`;
    g.querySelector('#scEnd').onclick = () => { sfx('click'); close(); done({ outcome, caught: caught.size, total: Object.keys(FLAGS).length, q: outcome === 'fail' ? 0 : caught.size >= 3 ? 1 : 0.5 }); };
  };
}

