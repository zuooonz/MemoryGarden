// 小关卡：第 4 天修闹钟：把数字装回钟面、拨到现在的时间（由 games.js 拆出，09-27）
import { narrate } from './audio.js';
import { NARR } from './narr.js';
import { el, open, closeAfter, close, once, nudge, result, shuffle } from './game-kit.js';

// 画钟（参考 MoCA 画钟：没有成品参照，自己摆数字、放指针；不自动吸附）
export function clockGame(sfx, done, target = { h: 2, m: 30, text: '两点半' }) {
  done = once(done);
  narrate(NARR.clock);
  const g = open(`<div class="gt">修好闹钟：现在是<b>${target.text}</b></div>
    <div class="gs">摔掉了 6 个数字：把它们装回钟面，再拖动指针，拨到现在的时间。</div>
    <div class="clockwrap"><div class="ck-face"><svg viewBox="-110 -110 220 220" id="cSvg">
      <g class="ck-case"><g class="ck-bell" transform="rotate(-32)"><path d="M-30 -118 A30 30 0 0 1 30 -118 Z" class="ck-b"/><line x1="0" y1="-120" x2="0" y2="-104" class="ck-leg"/></g><g class="ck-bell r" transform="rotate(32)">\
<path d="M-30 -118 A30 30 0 0 1 30 -118 Z" class="ck-b"/><line x1="0" y1="-120" x2="0" y2="-104" class="ck-leg"/></g>
        <line x1="-62" y1="84" x2="-78" y2="112" class="ck-leg"/><line x1="62" y1="84" x2="78" y2="112" class="ck-leg"/><circle r="108" class="ck-rim"/></g>
      <circle r="100" class="face"/><g id="hH" class="hand h"><path d="M -3.4 13 Q 0 17 3.4 13 L 3.2 -24 C 10 -28 10.5 -39 0 -52 C -10.5 -39 -10 -28 -3.2 -24 Z"/><circle cy="-36" r="2.6" class="hole"/></g><g id="hM" class="hand \
m"><path d="M -2.6 17 Q 0 21 2.6 17 L 2.9 -4 L 1.8 -54 L 5.4 -58 L 0 -74 L -5.4 -58 L -1.8 -54 L -2.9 -4 Z"/></g><circle r="6" class="pin"/><circle r="2.2" class="pin-dot"/></svg><div class="ck-layer" id="cLayer"></div></div>
      <div class="tray" id="cTray">${Array.from({ length: 12 }, (_, i) => `<span class="num" data-n="${i + 1}">${i + 1}</span>`).join('')}</div></div>
    <div class="row"><span class="gs" id="cMsg"></span><button class="primary" id="cOk">修好了</button></div>`);
  const svg = g.querySelector('#cSvg'), wrap = g.querySelector('.clockwrap');
  const hold = (el) => { held = el; g.querySelectorAll('.num').forEach(x => x.classList.toggle('held', x === held)); wrap.classList.toggle('holding', !!held); };   // 拿着数字时钟面亮一圈：可以放了
  const toSvg = (ev) => { const r = svg.getBoundingClientRect(); return [((ev.clientX - r.left) / r.width) * 220 - 110, ((ev.clientY - r.top) / r.height) * 220 - 110]; };
  const pos = {};
  // 放数字：点一下数字，再点钟面上的位置（也可以直接拖）
  let held = null;
  // 大字号时整个窗口被缩放：屏幕像素要除以缩放比例，才能写回 CSS 位置
  const zk = () => { const w = wrap.getBoundingClientRect().width; return w && wrap.offsetWidth ? w / wrap.offsetWidth : 1; };
  // 放好的数字进钟面上叠的“数字层”，按钟面的百分比定位——托盘里的数字变少、窗口换行，钟面挪了位置，数字也跟着走（09-27 手机上错位）
  const layer = g.querySelector('#cLayer'), tray = g.querySelector('#cTray');
  const placeSvg = (el, x, y) => { pos[el.dataset.n] = [x, y]; layer.appendChild(el); el.classList.add('placed'); el.style.position = 'absolute'; el.style.left = (x + 110) / 220 * 100 + '%'; el.style.top = (y + 110) / 220 * 100 + '%'; };
  const unplace = (el) => { delete pos[el.dataset.n]; el.classList.remove('placed'); el.style.position = ''; el.style.left = el.style.top = ''; tray.appendChild(el); };
  const placeAt = (el, cx, cy, quiet = false) => {
    const sr = svg.getBoundingClientRect();
    const [x, y] = [((cx - sr.left) / sr.width) * 220 - 110, ((cy - sr.top) / sr.height) * 220 - 110];
    if (Math.hypot(x, y) < 108) { placeSvg(el, x, y); if (!quiet) sfx('click'); return true; }
    return false;
  };
  // 摔掉的只有随机 6 个数字（用户 09-27：12 个都要拖太多）；另 6 个还在钟面原位，不能动，也是摆其余数字的参照
  const fallen = new Set(shuffle(Array.from({ length: 12 }, (_, i) => i + 1)).slice(0, 6));
  g.querySelectorAll('.num').forEach(el => {
    const n = +el.dataset.n; if (fallen.has(n)) return;
    const a = n * Math.PI / 6; placeSvg(el, Math.sin(a) * 84, -Math.cos(a) * 84); el.classList.add('fixed');
  });
  g.querySelectorAll('.num').forEach(el => {
    el.onpointerdown = (ev) => {
      if (el.classList.contains('fixed')) return;   // 没掉下来的数字不动
      ev.preventDefault(); ev.stopPropagation();
      const sx = ev.clientX, sy = ev.clientY; let moved = false;
      const move = (e2) => { if (Math.hypot(e2.clientX - sx, e2.clientY - sy) > 6) { moved = true; el.classList.add('drag'); if (el.parentElement !== wrap) wrap.appendChild(el);   // 拖动途中按外框的像素跟手
        const wr = wrap.getBoundingClientRect(); el.style.position = 'absolute'; el.style.left = (e2.clientX - wr.left) / zk() + 'px'; el.style.top = (e2.clientY - wr.top) / zk() + 'px'; } };
      const up = (e3) => {
        window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); el.classList.remove('drag');
        if (moved) { if (!placeAt(el, e3.clientX, e3.clientY)) unplace(el); hold(null); }
        else { hold(held === el ? null : el); sfx('click'); }
      };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    };
  });
  // 拨指针：先选时针／分针，再在钟面上拖
  const ang = { h: 0, m: 0 }; let which = 'h', turned = false;
  // 指针：老式闹钟的样子——时针短、桃心镂空尖，分针细长、小箭头，都带一截尾巴；拖的那根整根变橙
  const setHand = (key) => { g.querySelector(key === 'h' ? '#hH' : '#hM').setAttribute('transform', `rotate(${ang[key] * 180 / Math.PI})`); };   // 指针画成朝上的形状，按角度整体转
  const angDiff = (a, b) => { const d = Math.abs(a - b) % (2 * Math.PI); return Math.min(d, 2 * Math.PI - d); };
  // 按下时拨哪根：角度离手指最近的那根；两根几乎重叠或都离得远，再按远近分（里面时针、外面分针）
  const pickHand = (x, y) => {
    const t = Math.atan2(x, -y), r = Math.hypot(x, y), dh = angDiff(t, ang.h), dm = angDiff(t, ang.m), near = 0.45;
    if (angDiff(ang.h, ang.m) > 0.3 && (dh < near || dm < near)) return dh <= dm ? 'h' : 'm';
    return r < 58 ? 'h' : 'm';   // 时针 52（桃心尖，停在数字圈里面）、分针 73（针尖伸到数字圈边上，和真钟一样）
  };
  svg.onpointerdown = (ev) => {
    ev.preventDefault();
    const [x0, y0] = toSvg(ev), r0 = Math.hypot(x0, y0);
    if (held && r0 > 60) { placeAt(held, ev.clientX, ev.clientY); hold(null); return; }   // 拿着数字：按在外圈（数字该在的地方）才算放下；按里圈照样拨指针
    if (held) hold(null);
    try { svg.setPointerCapture(ev.pointerId); } catch { }
    which = pickHand(x0, y0); svg.classList.add('turning-' + which);
    const upd = (e2) => { const [x, y] = toSvg(e2); if (Math.hypot(x, y) > 8) { ang[which] = Math.atan2(x, -y); setHand(which); } };
    upd(ev); turned = true; svg.onpointermove = upd;
    svg.onpointerup = svg.onpointercancel = () => { svg.onpointermove = null; svg.classList.remove('turning-h', 'turning-m'); sfx('click'); };
  };

  g.querySelector('#cOk').onclick = () => {
    if (g.dataset.closing) return;
    if (![...fallen].some(n => pos[n]) && !turned && nudge(g.querySelector('#cMsg'), '先把数字装回钟面，再拨指针', sfx)) return;
    const deg = (a) => ((a * 180 / Math.PI) + 360) % 360;
    const diff = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
    let good = 0;
    for (let n = 1; n <= 12; n++) { const p = pos[n]; if (!p) continue; const a = deg(Math.atan2(p[0], -p[1])); const r = Math.hypot(...p); if (diff(a, n * 30) <= 20 && r > 40) good++; }
    const handsOk = diff(deg(ang.m), target.m * 6) <= 15 && diff(deg(ang.h), (target.h % 12) * 30 + target.m * 0.5) <= 18;
    const q = good >= 11 && handsOk ? 1 : handsOk ? 0.5 : 0;
    result(g.querySelector('#cMsg'), q, q >= 1 ? '钟走起来了！' : `${good}/12 个数字位置合适；指针${handsOk ? '对了' : '还不对'}。`);
    if (q >= 1) { wrap.classList.add('ringing'); sfx('alarm'); } else sfx('q');   // 修好了：闹钟摇着铃响一阵
    closeAfter(g, 0, 1800, () => { close(); done(q); });
  };
}

