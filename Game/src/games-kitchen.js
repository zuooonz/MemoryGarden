// 小关卡：第 5 天包饺子：爷爷只说一遍三个步骤，照着做（由 games.js 拆出，09-27）
import { voiceKey, voice } from './audio.js';
import { SCRIPT } from './lines.js';
import { PICTO, picto, elderFigure, girlFigure, elderAvatar } from './pictos.js';
import { open, later, closeAfter, close, once, result, dragGhost } from './game-kit.js';
import { contentRand } from './util.js';

// 三步命令（参考 MMSE：一次说完、不示范，然后连续完成）
// 三步指令（参考认知量表：只说一遍，照顺序做）。每次从真实的包饺子动作里随机抽三步，
// 同一样东西可能要放到不同地方；东西和位置的摆放顺序也每次打乱，只能靠记，不能靠猜。
// 东西：[名字, 图形]；桌上的位置：[名字, 点击区 x,y,w,h, 放上去的落点 x,y]
const KITCHEN_ITEMS = { flour: ['面粉', 'flour'], pin: ['擀面杖', 'rollpin'], skin: ['面皮', 'skin'], fill: ['馅料', 'fill'], water: ['水碗', 'water'], jiao: ['饺子', 'jiao'] };
const KITCHEN_SPOTS = {
  grandpa: ['爷爷', [160, 30, 120, 132], [196, 116]],
  girl: ['孙女', [410, 44, 100, 122], [432, 124]],
  board: ['案板', [96, 176, 172, 116], [150, 206]],
  plate: ['盘子', [296, 178, 126, 96], [336, 202]],
  tray: ['盖帘', [440, 158, 140, 128], [488, 196]],
};
const KITCHEN_STEPS = [   // 按包饺子的先后排列；每样东西有几种去处
  { k: 'flour', to: { board: '撒点面粉在案板上' } },
  { k: 'pin', to: { grandpa: '把擀面杖递给我', girl: '把擀面杖给孙女' } },
  { k: 'skin', to: { girl: '拿张饺子皮给孙女', grandpa: '递张饺子皮给我', board: '拿张饺子皮铺在案板上' } },
  { k: 'fill', to: { grandpa: '把馅料端到我手边', board: '把馅料放到案板旁边' } },
  { k: 'water', to: { girl: '把那碗水放到孙女手边', grandpa: '把那碗水端给我蘸皮' } },
  { k: 'jiao', to: { tray: '把包好的饺子摆到盖帘上', plate: '把包好的饺子放到盘子里' } },
];
const pickN = (arr, n) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(contentRand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); };
export function stepsGame(sfx, done) {
  done = once(done);
  // 抽三步（保持先后顺序），每步随机一个去处
  const idx = pickN([0, 1, 2, 3, 4, 5], 3).sort((a, b) => a - b);
  const want = idx.map(i => { const st = KITCHEN_STEPS[i], t = pickN(Object.keys(st.to), 1)[0]; return [st.k, t, st.to[t]]; });
  const items = pickN(Object.keys(KITCHEN_ITEMS), 6);
  let repeats = 0, held = null; const done3 = [];
  // 俯视的一张案桌：爷爷和孙女坐在桌边，桌上是案板、盘子、盖帘（和小镇同一种低多边形画法）
  const poly = (pts, f) => `<polygon points="${pts}" fill="${f}"/>`;
  const place = (name, x, y, k) => `<g transform="translate(${x} ${y}) scale(${k})">${PICTO[name]}</g>`;
  const scene = `<svg viewBox="0 0 640 336" class="kt-scene" id="sScene">
    ${poly('0,0 640,0 0,336', '#f1eadb')}${poly('640,0 640,336 0,336', '#ebe2cf')}
    ${elderFigure(220, 52, 1.15)}${girlFigure(460, 70, 1)}
    ${poly('70,112 570,112 610,292 30,292', '#dcb57f')}${poly('320,112 570,112 610,292 320,292', '#cfa66f')}${poly('30,292 610,292 610,306 30,306', '#b8894f')}
    ${poly('190,122 202,116 212,124 204,132', '#edc7a2')}${poly('228,124 238,116 250,122 240,132', '#dcb28b')}
    ${poly('440,134 450,128 458,136 450,142', '#edc7a2')}${poly('466,136 474,128 484,134 476,142', '#dcb28b')}
    ${place('board', 100, 150, 1.6)}${place('plate', 300, 168, 1.2)}${place('tray', 450, 160, 1.25)}
    ${Object.entries(KITCHEN_SPOTS).map(([k, [nm, [x, y, w,
      h]]]) => `<g class="kt-tgt" data-s="${k}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" class="kt-hl"/><g class="kt-got"></g><g class="kt-tag" transform="translate(${x + 8} ${y + h - 22})"><rect \
width="${nm.length * 14 + 14}" height="20" rx="3"/><text x="7" y="14.5">${nm}</text></g></g>`).join('')}
  </svg>`;
  const g = open(`<div class="gk">包饺子 · 爷爷当老师</div>
    <div class="kt-say"><span class="kt-face">${elderAvatar('#e8b64a', '#fff1cf', 'happy')}</span><div class="say" id="sS"></div></div>
    <div class="kitchen" id="sK">${scene}
      <div class="kt-items">${items.map(k => `<button class="tile kt-item" data-k="${k}"><span class="ic">${picto(KITCHEN_ITEMS[k][1], 40)}</span><span class="nm">${KITCHEN_ITEMS[k][0]}</span></button>`).join('')}</div>
      <div class="kt-prog">${[0, 1, 2].map(i => `<i data-i="${i}"></i>`).join('')}</div>
    </div>
    <div class="row"><span class="gs" id="sMsg">把东西拖到桌上要放的地方（也可以先点东西、再点地方）。</span><button class="ghost hidden" id="sRe">请他再说一遍</button></div>`);
  g.classList.add('wide');
  const S = g.querySelector('#sS'), K = g.querySelector('#sK');
  const say = () => {
    const lines = [`先${want[0][2]}，`, `再${want[1][2]}，`, `最后${want[2][2]}。`];
    const stepIds = [`先${want[0][2]}`, `再${want[1][2]}`, `最后${want[2][2]}`].map(voiceKey);
    // 只说一遍（贴近原题：口头说、不示范）；有配音时字幕跟着说一句显示一句，说完收起（静音、听力不好也不会漏；用户 09-27）
    const withVoice = document.body.classList.contains('voice-on') && stepIds.every(Boolean);
    const audio = voice('main', [repeats ? null : voiceKey(SCRIPT.kid.steps), 'jz_intro', ...stepIds.filter(Boolean), 'jz_go'].filter(Boolean), { tag: 'game' });
    K.classList.add('listening');
    const ready = () => { S.textContent = '“好，你来。”'; K.classList.remove('listening'); g.querySelector('#sRe').classList.remove('hidden'); };
    let i = 0;
    const next = (gap = 2600) => { if (i < lines.length) { S.textContent = '“' + lines[i++] + '”'; later(g, () => next(gap), gap); } else ready(); };
    if (withVoice) {   // 配音＝（第一次先有孙女一句）＋“来，听好”＋三步＋“你来”：按段数平分，字幕落在对应那句上
      S.textContent = '（仔细听，他只说一遍）';
      const lead = repeats || !voiceKey(SCRIPT.kid.steps) ? 1 : 2;
      audio.then(d => { if (!d) return next(); const part = d * 1000 / (lead + 4); later(g, () => next(part), lead * part); });   // 声音放不出来就改成看文字
      return;
    }
    next();
  };
  const reset = () => {
    done3.length = 0; held = null;
    g.querySelectorAll('.kt-item').forEach(x => x.classList.remove('used', 'held'));
    g.querySelectorAll('.kt-got').forEach(x => x.innerHTML = ''); K.classList.remove('holding');
    g.querySelectorAll('.kt-prog i').forEach(x => x.className = '');
  };
  const hold = (k) => { held = k; g.querySelectorAll('.kt-item').forEach(x => x.classList.toggle('held', x.dataset.k === held)); K.classList.toggle('holding', !!held); };
  let dragged = 0;
  g.querySelectorAll('.kt-item').forEach(b => {
    b.onclick = () => {
      if (performance.now() - dragged < 300 || K.classList.contains('listening') || b.classList.contains('used')) return;
      hold(held === b.dataset.k ? null : b.dataset.k); sfx('click');
    };
    b.onpointerdown = (ev) => {
      if (K.classList.contains('listening') || b.classList.contains('used') || done3.length >= 3) return;
      const k = b.dataset.k;
      dragGhost(ev, picto(KITCHEN_ITEMS[k][1], 40), 'kt', (at) => { dragged = performance.now(); const t = at?.closest?.('.kt-tgt'); if (t) put(t); else hold(null); }, () => hold(k));   // 拖起来才算拿起；只点一下交给 onclick
    };
  });
  // 放错了：点刚放下的那样东西（它所在的地方）拿回来，重新放；只能拿最后一样——顺序本身就是题目
  const takeBack = () => {
    const [k] = done3.pop(); g.querySelector('.kt-drop.last')?.remove();
    g.querySelector(`.kt-prog i[data-i="${done3.length}"]`).className = '';
    g.querySelector(`.kt-item[data-k="${k}"]`).classList.remove('used');
    const prev = done3.length ? g.querySelectorAll('.kt-drop') : [];
    if (prev.length) prev[prev.length - 1].classList.add('last');
    hold(k); sfx('click'); g.querySelector('#sMsg').textContent = '拿回来了，重新放吧。';
  };
  const put = (b) => {
    if (!held || done3.length >= 3) {
      if (!held && done3.length && done3.length < 3 && done3[done3.length - 1][1] === b.dataset.s) return takeBack();
      if (!held) sfx('deny'); return;
    }
    done3.push([held, b.dataset.s]); sfx('place');
    g.querySelectorAll('.kt-drop.last').forEach(x => x.classList.remove('last'));
    { const [, , [px, py]] = KITCHEN_SPOTS[b.dataset.s], n = b.querySelector('.kt-got').children.length;
      b.querySelector('.kt-got').insertAdjacentHTML('beforeend', `<g class="kt-drop last" transform="translate(${px + n * 26} ${py - n * 6}) scale(.5)">${PICTO[KITCHEN_ITEMS[held][1]]}</g>`); }
    const it = g.querySelector(`.kt-item[data-k="${held}"]`); it.classList.add('used'); hold(null);
    g.querySelector(`.kt-prog i[data-i="${done3.length - 1}"]`).className = 'on';
    if (done3.length === 1) g.querySelector('#sMsg').textContent = '放错了？点刚放下的东西，可以拿回来。';
    if (done3.length === 3) {
      const correct = done3.filter((d, i) => d[0] === want[i][0] && d[1] === want[i][1]).length;
      done3.forEach((d, i) => { g.querySelector(`.kt-prog i[data-i="${i}"]`).className = d[0] === want[i][0] && d[1] === want[i][1] ? 'ok' : 'bad'; });
      result(g.querySelector('#sMsg'), correct / 3, correct === 3 ? `三步都对${repeats ? `（他多说了 ${repeats} 遍）` : ''}！` : `做对了 ${correct}/3 步。`);
      g.querySelector('#sMsg').insertAdjacentHTML('afterend', `<div class="gs kt-said">他说的是：先${want[0][2]}，再${want[1][2]}，最后${want[2][2]}。</div>`);
      S.textContent = correct === 3 ? '“这手艺，没丢！”' : correct === 2 ? '“差一点，我来改改。”' : '“来，我再做一遍给你看。”';
      const said = voice('main', correct === 3 ? ['jz_ok', voiceKey(SCRIPT.kid.stepsOk)] : correct === 2 ? 'jz_mid' : 'jz_redo', { tag: 'game' });
      sfx(correct === 3 ? 'good' : 'q');
      closeAfter(g, said, 2200, () => { close(); done(correct / 3, { repeats, correct }); });
    }
  };
  g.querySelectorAll('.kt-tgt').forEach(b => b.onclick = () => put(b));
  g.querySelector('#sRe').onclick = () => { if (done3.length >= 3) return; repeats++; sfx('click'); reset(); say(); };
  say();
}

