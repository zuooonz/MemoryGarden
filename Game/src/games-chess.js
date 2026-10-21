// 小关卡：第 7 天象棋比赛：照着棋谱摆残局（由 games.js 拆出，09-27）
import { narrate } from './audio.js';
import { NARR } from './narr.js';
import { SCRIPT } from './lines.js';
import { speak, open, closeAfter, close, once, nudge, result, dragGhost } from './game-kit.js';

// 摆残局（参考认知量表里“照着样子画”：样子一直摆在旁边，自己把每个子放到对的位置）
const CHESS = [
  { k: 'bj', t: '将', red: false, x: 4, y: 0 }, { k: 'bs', t: '士', red: false, x: 4, y: 1 }, { k: 'bz', t: '卒', red: false, x: 6, y: 5 },
  { k: 'rs', t: '帅', red: true, x: 4, y: 9 }, { k: 'rm', t: '马', red: true, x: 2, y: 2 }, { k: 'rp', t: '炮', red: true, x: 4, y: 6 }, { k: 'rc', t: '车', red: true, x: 0, y: 4 },
];
function boardSvg(id, pieces, big) {
  let g = '';
  for (let y = 0; y < 10; y++) g += `<line x1="5" y1="${5 + y * 10}" x2="85" y2="${5 + y * 10}"/>`;
  for (let x = 0; x < 9; x++) {
    if (x === 0 || x === 8) g += `<line x1="${5 + x * 10}" y1="5" x2="${5 + x * 10}" y2="95"/>`;
    else g += `<line x1="${5 + x * 10}" y1="5" x2="${5 + x * 10}" y2="45"/><line x1="${5 + x * 10}" y1="55" x2="${5 + x * 10}" y2="95"/>`;
  }
  g += `<line x1="35" y1="5" x2="55" y2="25"/><line x1="55" y1="5" x2="35" y2="25"/><line x1="35" y1="75" x2="55" y2="95"/><line x1="55" y1="75" x2="35" y2="95"/>`;
  g += `<text x="25" y="51.8" class="river">楚 河</text><text x="65" y="51.8" class="river">汉 界</text>`;
  const ps = pieces.map(p => `<g class="pc ${p.red ? 'red' : 'blk'} ${p.cls || ''}" data-k="${p.k}"><circle cx="${5 + p.x * 10}" cy="${5 + p.y * 10}" r="4.4"/><text x="${5 + p.x * 10}" y="${5 + p.y * 10 + 1.7}">${p.t}</text></g>`).join('');
  // 可摆的棋盘：每个交叉点一块透明点击格，点哪格就是哪格（不靠坐标换算，放大字号也不会偏）
  let hit = '';
  if (big) for (let y = 0; y < 10; y++) for (let x = 0; x < 9; x++) hit += `<circle class="hit" data-x="${x}" data-y="${y}" cx="${5 + x * 10}" cy="${5 + y * 10}" r="5"/>`;   // 圆形点击区，和棋子一样是圆的
  return `<svg viewBox="0 0 90 100" id="${id}" class="board ${big ? 'big' : ''}">${g}${ps}${hit}</svg>`;
}
export function chessGame(sfx, done) {
  done = once(done);
  const placed = {}; let held = null;
  narrate(NARR.chess, { keep: true });   // 旁白先说做法，裁判那句接在后面
  const g = open(`<div class="gk">象棋比赛 · 残局赛</div><div class="gt">裁判发下棋谱：照着棋谱，把棋子摆到棋盘上</div>
    <div class="gs">把棋子拖到棋盘的交叉点上（也可以先点棋子、再点位置）；摆错了，拖走重摆。</div>
    <div class="boards"><div class="refcol"><div><div class="gs">棋谱</div>${boardSvg('cRef', CHESS)}</div><div class="tray2" id="cTray"></div></div><div><div class="gs">棋盘</div><div id="cBoard"></div></div></div>
    <div class="row"><span class="gs" id="cM"></span><button class="primary" id="cDone">摆好了</button></div>`);
  g.classList.add('wide', 'chessg'); speak('referee|' + SCRIPT.referee.start);
  // 拖动（和修闹钟放数字一样）：按住棋子拖到交叉点上松手；从棋盘上拖出去就放回棋盒；没拖动就当作点一下
  let dragged = 0;
  const startDrag = (k, ev, fromBoard) => {
    const c = CHESS.find(q => q.k === k);
    dragGhost(ev, c.t, 'pc ' + (c.red ? 'red' : 'blk'), (at) => {
      dragged = performance.now();
      const cell = at?.closest?.('#cB .hit');
      if (cell) { const x = +cell.dataset.x, y = +cell.dataset.y, here = Object.keys(placed).find(q => q !== k && placed[q][0] === x && placed[q][1] === y); if (here) delete placed[here]; placed[k] = [x, y]; held = null; sfx('place'); }
      else if (fromBoard) { delete placed[k]; sfx('click'); }
      draw();
    });
  };
  const draw = () => {
    const list = Object.entries(placed).map(([k, [x, y]]) => ({ ...CHESS.find(c => c.k === k), x, y }));
    g.querySelector('#cBoard').innerHTML = boardSvg('cB', list, true);
    g.querySelector('#cTray').innerHTML = CHESS.filter(c => !placed[c.k]).map(c => `<button class="pc2 ${c.red ? 'red' : 'blk'} ${held === c.k ? 'held' : ''}" data-k="${c.k}">${c.t}</button>`).join('') || '<span class="gs">棋子都摆上去了</span>';
    g.querySelectorAll('#cTray .pc2').forEach(b => {
      b.onclick = () => { if (performance.now() - dragged < 300) return; held = held === b.dataset.k ? null : b.dataset.k; sfx('click'); draw(); };
      b.onpointerdown = (ev) => startDrag(b.dataset.k, ev, false);
    });
    const svg = g.querySelector('#cB');
    svg.onpointerdown = (ev) => { const cell = ev.target.closest('.hit'); if (!cell) return; const here = Object.keys(placed).find(k => placed[k][0] === +cell.dataset.x && placed[k][1] === +cell.dataset.y); if (here) startDrag(here, ev, true); };
    svg.onclick = (ev) => {
      if (performance.now() - dragged < 300) return;
      const cell = ev.target.closest('.hit'); if (!cell) return;
      const x = +cell.dataset.x, y = +cell.dataset.y;
      const here = Object.keys(placed).find(k => placed[k][0] === x && placed[k][1] === y);
      if (held) { if (here) delete placed[here]; placed[held] = [x, y]; held = here || null; sfx('place'); }
      else if (here) { delete placed[here]; held = here; sfx('click'); }
      draw();
    };
  };
  g.querySelector('#cDone').onclick = () => {
    if (g.dataset.closing) return;
    if (Object.keys(placed).length < CHESS.length && nudge(g.querySelector('#cM'), '还有棋子没摆上去', sfx)) return;
    const right = CHESS.filter(c => placed[c.k] && placed[c.k][0] === c.x && placed[c.k][1] === c.y).length;
    const list = Object.entries(placed).map(([k, [x, y]]) => { const c = CHESS.find(q => q.k === k); return { ...c, x, y, cls: c.x === x && c.y === y ? 'ok' : 'bad' }; });
    g.querySelector('#cBoard').innerHTML = boardSvg('cB', list, true);
    const q = right === CHESS.length ? 1 : right / CHESS.length;
    result(g.querySelector('#cM'), q, q >= 1 ? '一子不差！' : `摆对了 ${right}/${CHESS.length} 个，红圈的位置不对。`);
    sfx(q >= 1 ? 'good' : 'q'); const said = speak('referee|' + (q >= 1 ? SCRIPT.referee.ok : SCRIPT.referee.fix));
    g.querySelector('#cDone').disabled = true;
    closeAfter(g, said, 2200, () => { close(); done({ q, right }); });
  };
  draw();
}
