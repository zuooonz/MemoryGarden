// 每帧更新界面叠加层：时钟、按钮状态、头顶气泡、地名与路口标签、地图操作标签、邻居标签。依赖由 main.js 通过 initOverlays 注入。
import { NEIGHBORS, SUPPORTS } from './data.js';
import { fmt } from './util.js';
import { bubble, helperBubbles, homeTag, renderEnergy, updateMeters, nbTags } from './ui.js';
import { mapMode } from './mapops.js';
import { riskTags } from './routes.js';
import { updateCalm } from './stage.js';
import { $, persist, project, run, ui, sim, timeHeld } from './core.js';
import { elder, graph, helperPeople, kid, town, labelEls } from './world.js';
import { syncTimeButtons } from './hud.js';

let CALL_TIP = null;   // 「电话」按钮原本的说明（没带手机时临时换掉）
;

export function initOverlays() {

}
// ---------- 每帧：界面叠加层（时钟、按钮状态、头顶气泡、地名与路口标签、邻居标签） ----------
export function updateOverlays(dt) {
  // 界面
  if (sim.phase) {
    $('#clock').textContent = fmt(sim.time);
    $('#clock').classList.toggle('hurry', sim.phase === 'live' && !!sim.e?.hurry);   // 赶时间：时钟变琥珀色
    const held = sim.phase === 'live' && timeHeld();   // 关卡、犹豫时刻、讲往事：时钟停着（和玩家暂停的闪烁区分开）
    if ($('#clock').classList.contains('held') !== held) { $('#clock').classList.toggle('held', held); $('#clock').title = held ? '这会儿时间停着，做完再接着走' : ''; }
    $('#dayLabel').textContent = window.innerWidth > 760 ? `第 ${sim.dayIdx + 1} 天 · ${sim.day.weekday}` : sim.day.weekday;
    updateCalm(dt);
    syncTimeButtons();
    updateMeters();
    $('#actCall').disabled = !sim.canCall();
    CALL_TIP ??= $('#actCall').title;
    const tip = sim.e.noPhone ? '他这趟没带手机，打不通；可以「陪同」' : CALL_TIP;
    if ($('#actCall').title !== tip) $('#actCall').title = tip;
    $('#actWalk').disabled = !sim.canEscort();
    if (sim.phase === 'live' && !$('#dock').classList.contains('hidden')) {
      // 实时阶段也可以放剩余支持
      if (run.tickUI++ % 20 === 0) renderEnergy();
    }
  }
  ui.bubbleT -= dt;
  if (bubble) { if (ui.bubbleT <= 0) bubble.style.display = 'none'; else project(elder.root.position, bubble, 2.65); }   // 头顶上方（人物 0.82 倍后，10-13）
  for (const [id, el] of Object.entries(helperBubbles)) {
    el.dataset.t = (+el.dataset.t) - dt;
    const who = id === 'kid' ? kid : helperPeople[id]?.person;
    if (+el.dataset.t <= 0 || !who || !who.root.visible) el.style.display = 'none'; else project(who.root.position, el, (who.scale || 1) * 2.77 + 0.3);   // 按人的身高放气泡
  }
  for (const { el, l } of labelEls) project(l.pos, el);
  for (const el of riskTags) project(graph.pos[+el.dataset.n], el, 1.2);
  if (mapMode) {
    for (const t of mapMode.tags) project(graph.pos[t.node], t.el, 0.5);
    if (mapMode.pen && mapMode.pen.style.display !== 'none' && mapMode.penNode != null) project(graph.pos[mapMode.penNode], mapMode.pen, 0.5);
  }
  const showNb = ui.selected && SUPPORTS[ui.selected].target === 'neighbor';
  for (const nb of NEIGHBORS) {
    const el = nbTags[nb.id];
    // 拜托过的邻居：平时也常驻一个小标签（和路标一样看得见）；选着「拜托邻居」时，每家都显示名字
    const askedNb = persist.neighbors.has(nb.id);
    el.style.display = showNb || (askedNb && sim.phase !== 'summary') ? '' : 'none';
    if (!showNb && askedNb) { const t2 = `✓ ${nb.name}`; if (el.textContent !== t2) el.textContent = t2; el.classList.add('done'); el.classList.remove('idle'); project(town.neighborObjs[nb.id].position, el, 5.2); }
    if (showNb) {
      // 标签只写是谁家（用户 09-27）：帮不帮得上由玩家对照路线和雾自己判断——他迷路时会走到路线以外，“今天用不上”并不准；每家能照看的路口由地上的青绿圈标出（routes.js）
      const asked = persist.neighbors.has(nb.id);
      const txt = asked ? `✓ ${nb.name} · 已拜托` : `${nb.name}家`;
      if (el.textContent !== txt) el.textContent = txt;
      el.classList.toggle('done', asked); el.classList.remove('idle');
      project(town.neighborObjs[nb.id].position, el, 5.2);
    }
  }
  if (homeTag.textContent) project(town.placeObjs.home.position, homeTag, 8.4);

}
