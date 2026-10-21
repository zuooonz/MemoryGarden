// 小关卡：第 2 天取快递：短信只看一眼、到驿站凭记忆报取件码（由 games.js 拆出，09-27）
import { narrate } from './audio.js';
import { NARR } from './narr.js';
import { SCRIPT } from './lines.js';
import { speak, open, later, closeAfter, close, once, nudge, result } from './game-kit.js';

// 正序数字广度（参考 MoCA：约每秒一个，听完再按原顺序说出；这里改为逐个显示后消失）
export function digitsLearn(digits, sfx, done) {
  done = once(done);
  // 驿站发来短信：看一眼，几秒后熄屏；手机留在家里
  const g = open(`<div class="phone" id="dP"><div class="ph-who">手机</div><div class="ph-name" id="dN">1 条新短信</div><div class="sms hidden" id="dM"></div><div class="bar hidden" id="dB"><i></i></div></div>
    <div class="say" id="dS">手机“叮”了一声。</div>
    <div class="row" id="dR"><button class="primary" id="dOpen">看一眼短信</button></div>`);
  const S = g.querySelector('#dS'), M = g.querySelector('#dM'), R = g.querySelector('#dR'), B = g.querySelector('#dB');
  sfx('phone');
  g.querySelector('#dOpen').onclick = () => {
    sfx('click'); g.querySelector('#dN').textContent = '【幸福里驿站】';
    M.innerHTML = `您的快递已到站，取件码 <b>${digits.join('')}</b>，请凭码取件。`; M.classList.remove('hidden'); B.classList.remove('hidden');
    S.textContent = '取件码只看这一眼，记住它。'; R.innerHTML = '';
    B.firstElementChild.style.animation = 'shrink 5s linear forwards';
    later(g, () => {
      M.classList.add('hidden'); B.classList.add('hidden'); g.querySelector('#dN').textContent = '（熄屏）';
      S.textContent = '他把手机往桌上一放，揣上钥匙出了门，手机没带。';
      R.innerHTML = '<button class="primary" id="dEnd">好</button>'; g.querySelector('#dEnd').onclick = () => { sfx('click'); close(); done(); };
    }, 5000);
  };
}
export function digitsRecall(digits, sfx, done) {
  done = once(done);
  let typed = [], sent = false;   // 点过“写好了”就锁住。不能记在 #game 的 dataset 上：open() 不清它，同一页面再进这一关时“写好了”会一直按不动（10-15 手机上发现）
  const g = open(`<div class="gt">驿站老板：“${SCRIPT.courier.ask}”</div><div class="gs" id="dH">手机没带，只能靠记。按短信里的顺序输入。</div>
    <div class="say big" id="dT">_ _ _ _ _</div>
    <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => `<button data-k="${k}">${k}</button>`).join('')}<button data-k="del">⌫</button><button data-k="ok" class="okk">写好了</button></div>`);
  const T = g.querySelector('#dT'); speak('courier|' + SCRIPT.courier.ask); narrate(NARR.digits, { keep: true });
  let fresh = -1;   // 刚输入的那一位：弹一下（按键反馈）
  const draw = () => { T.innerHTML = '<span>' + Array.from({ length: digits.length }, (_, i) => i === fresh ? `<span class="typed-new">${typed[i]}</span>` : (typed[i] ?? '_')).join(' ') + '</span>'; fresh = -1; };   // 包成一整块：.say 是 grid，散的文字和数字会各占一行
  g.querySelectorAll('.keypad button').forEach(b => b.onclick = () => {
    const k = b.dataset.k; sfx('click');
    if (k === 'del') typed.pop();
    else if (k === 'ok') {
      if (sent) return;
      if (!typed.length && nudge(g.querySelector('#dH'), '先按几个数字，想起几位按几位', sfx)) return;
      sent = true;
      const q = typed.join('') === digits.join('') ? 1 : 0;
      result(T, q, q ? '取件码对上了 ✓' : `取件码不对（是 ${digits.join('')}）`); sfx(q ? 'good' : 'q'); const said = speak('courier|' + (q ? SCRIPT.courier.ok : SCRIPT.courier.no));
      closeAfter(g, said, 1700, () => { close(); done({ q }); }); return;
    } else if (typed.length < digits.length) { typed.push(+k); fresh = typed.length - 1; }
    draw();
  });
  draw();
}

