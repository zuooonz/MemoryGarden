// 小关卡共用的小工具（由 games.js 拆出，09-27）：开关面板、只属于本关的定时器、说完再关、没做就交先提醒、结果条、拖动。
// 每个关卡文件（games-*.js）从这里取；关卡对外统一经 games.js 导出。
import { voiceKey, stopVoice, voice } from './audio.js';
import { sim } from './core.js';
import { contentRand, pauseTimeout, pauseInterval, clearPause } from './util.js';
// 小关卡里的话都带 'game' 标记：新的一句（非“有人在说就不说”的陪衬）会停掉上一句没说完的；翻页、换画面也停
export const speak = (text, opts = {}) => { const id = voiceKey(text); return id ? voice('main', id, { ...opts, tag: 'game', soft: opts.mode === 'skip' }) : Promise.resolve(0); };   // 关卡里的人物：声音调度的 main 通道（audio.voice）

export const el = () => document.querySelector('#game');
let TOK = 0;
export function open(html) { stopVoice('game'); const g = el(); g.className = ''; delete g.dataset.closing; g.innerHTML = html; g.dataset.tok = String(++TOK); g.classList.remove('hidden'); return g; }
// 只在面板仍属于本关卡时才执行的定时器（被替换或关闭后自动失效）
// 玩家按暂停时这些定时器一起停（10-13 用户：暂停后关卡里的对白照样往下走）；停掉用 stop(句柄)
export function later(g, fn, ms) { const t = g.dataset.tok; return pauseTimeout(() => { if (g.dataset.tok === t && !g.classList.contains('hidden')) fn(); }, ms); }
export function every(g, fn, ms) { const t = g.dataset.tok; const h = pauseInterval(() => { if (g.dataset.tok !== t || g.classList.contains('hidden')) { clearPause(h); return; } fn(); }, ms); return h; }
export const stop = clearPause;
// 说完再关：关卡自动关闭时，等这一步的话说完（不短于 minMs）——原来按固定时间关，失败时那句往往更长，会被掐断
export function closeAfter(g, said, minMs, fn) { g.dataset.closing = '1'; Promise.resolve(said).then((d) => later(g, fn, Math.max(minMs, (d || 0) * 1000 + 400))); }   // closing：做完了，只等话说完（自动试玩据此不再重做）
export function close() { stopVoice('narr', 'close'); stopVoice('game', 'close'); el().classList.add('hidden'); el().innerHTML = ''; }   // 关卡结束：这一关里没说完的话、没念完的做法说明都停
// 点“往下走”的主按钮（确认、下一页、知道了……）：先停掉这一步还在说的话，再进下一步（捕获阶段，先于按钮自己的处理——下一步新说的话不受影响）
// “不对劲！”只是标记破绽，不打断对方说话
addEventListener('click', (ev) => { const b = ev.target.closest?.('#game button.primary, #game .row button:not(#scTap), #game .opts button'); if (b) { stopVoice('game', 'button'); stopVoice('narr',
  'button'); if (sim.phase === 'live' && sim.events) sim.event('player', { op: 'button', label: b.textContent.trim().slice(0, 12) }); } }, true);
// 每个小关卡的结束回调只执行一次（防止重复点击导致流程重复推进）
export const once = (f) => { let used = false; return (...a) => { if (used) return; used = true; f(...a); }; };
// ---- 同类操作一个手感（Docs/界面与交互规范.md）----
// 还没做就按“完成”：第一次说明缺什么、抖一下，不算交；再按一次就照现在的样子交（真不会也有出口，不会卡住）
// 用法：if (!ready && nudge(提示行, 话, sfx)) return;
export function nudge(box, msg, sfx) {
  if (box.dataset.nudged) return false;
  box.dataset.nudged = '1'; box.textContent = msg + '（再按一次就这样交）'; box.classList.remove('nudge'); void box.offsetWidth; box.classList.add('nudge'); sfx('deny'); return true;
}
// 结果：同一种样子（全对／部分／没对上），放在关卡底部那一行
export function result(box, q, html) { box.classList.remove('nudge', 'good', 'mid', 'bad'); box.classList.add('gres', q >= 0.99 ? 'good' : q > 0 ? 'mid' : 'bad'); box.innerHTML = html; }
// 拖动：按住拿起，松手放下；没拖出 6 像素就当作点一下（交给 onclick）。drop(落点下的元素, 事件) 返回是否放成
export function dragGhost(ev, html, cls, drop, start) {
  const sx = ev.clientX, sy = ev.clientY; let ghost = null;
  const move = (e) => {
    if (!ghost && Math.hypot(e.clientX - sx, e.clientY - sy) < 6) return;
    if (!ghost) { ghost = document.createElement('div'); ghost.className = 'dragghost ' + cls; ghost.innerHTML = html; document.body.appendChild(ghost); start?.(); }
    ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px';
  };
  const up = (e) => {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
    if (!ghost) return;
    ghost.remove(); drop(document.elementFromPoint(e.clientX, e.clientY), e);
  };
  addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
}
export const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(contentRand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

