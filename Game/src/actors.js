// 每帧更新人物：爷爷（在家走动、出门、到了地方、朝向、动作、表情、手里的东西）、陪同的人、棋友、健步走队伍、孙女、邻居。依赖由 main.js 通过 initActors 注入。
import { stepAlong, stepTo, roadClear, markWaiting } from './mover.js';
import { appear, door as atDoor, fading, relocate, shownNow, vanish } from './presence.js';
import { WALK } from './space.js';
import * as THREE from 'three';
import { cam, focusOn, zoomTo } from './camera.js';
import { homeAnimFor, homeFaceFor, homeG, homeNav, homeSpotKey, homeWorld, insideHome, leaveQueue, moveAlong, placeKeyAt, routeInHouse, visitNav, visitQueue } from './home.js';
import { chessFriend, companion, crowd, elder, graph, helperPeople, kid, nbActs, roadPath, space, town, walkers } from './world.js';
import { run, emit, sim, later } from './core.js';
;

let chessSince = 0;   // 爷爷到棋亭坐下的时刻（棋友先招手、再下棋）
export function initActors() {

}
// ---------- 爷爷在画面里走人行道（地基第三步，10-05）----------
// 规则层不动：他仍沿路中线、按“从哪个路口到哪个路口”走（犹豫、迷路、拐错都在规则层）。画面里把规则层的位置换成人行线上的一点去追：
// 一段路的哪一侧（side）在换路段时按“走过去最省事、少过街”选，过街走斑马线；到路口停在角上。
const ew = { seg: null, side: 1, queue: [] };
function segEnds(e) {   // 这一段路两头（按坐标排好，掉头时“哪一侧”不变）；在路口上还没定下一段时只有一个点
  const a = graph.pos[e.node], b = e.next != null && e.next !== e.node ? graph.pos[e.next] : null;
  if (!b) return { key: 'n' + e.node, p: a, q: null };
  return a.x + a.z <= b.x + b.z ? { key: e.node + '-' + e.next, p: a, q: b } : { key: e.next + '-' + e.node, p: b, q: a };
}
function sidePoint(e, side, se = segEnds(e)) {
  if (!se.q) { const p = se.p, ep = elder.root.position; return { x: p.x + Math.sign(ep.x - p.x || 1) * WALK, z: p.z + Math.sign(ep.z - p.z || 1) * WALK }; }   // 在路口上：离他最近的那个角
  const { p, q } = se, dx = q.x - p.x, dz = q.z - p.z, len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len;
  // 规则层在路中线上走 0—len，人行线上只有角点之间 WALK—len-WALK：按比例对上（10-07：原来两头直接夹住，他走过路口中心那段时画面的目标点不动，爷爷走到街角站住、再一下子快走过街——用户看到“到路口突然停顿”）
  const t = WALK + (len - 2 * WALK) * Math.max(0, Math.min(1, ((e.pos.x - p.x) * ux + (e.pos.z - p.z) * uz) / len));
  // 和路人一样稍靠自己的右边（0.18）：迎面错开 0.36，不撞上（路口角上不偏）
  const h = graph.pos[e.next] === q ? 1 : -1, k = t > WALK + 0.3 && t < len - WALK - 0.3 ? 0.18 : 0;
  return { x: p.x + ux * t - uz * side * WALK - uz * h * k, z: p.z + uz * t + ux * side * WALK + ux * h * k };
}
function walkTarget(e) {
  const se = segEnds(e);
  if (se.key !== ew.seg) {   // 换了一段路：两侧都算一下从现在的位置走过去要多远（过街算 4），挑近的
    ew.seg = se.key; const from = elder.root.position; ew.from = { x: from.x, z: from.z };
    let best = null;
    for (const side of se.q ? [1, -1] : [1]) {
      const pts = space.path(from, sidePoint(e, side, se)); let cost = 0;
      for (let k = 1; k < pts.length; k++) cost += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z) + (pts[k].xing != null ? 4 : 0);
      if (!best || cost < best.cost) best = { cost, side, pts };
    }
    ew.side = best.side; ew.queue = best.pts.slice(1, -1);
  }
  return sidePoint(e, ew.side, se);
}

// ---------- 跟随的人沿爷爷画面里的足迹走（地基第三步，10-05）----------
// 原来：健步走队伍直线追前一个人、陪同的你和孙女按固定偏移站——转弯时抄近路穿墙（用户在 09-29 视频里看到健步走队伍穿楼）。
// 现在：记下他在画面里走过的点（新的在前），跟随的人走到足迹上离他 back 远的点；他在楼里、家里的那段足迹不跟，停在门外等。
const trail = []; let trailSeq = 0;   // 足迹点按记下的先后编号（seq 越大越新）
function recordTrail() {
  const p = elder.root.position, out = elder.root.visible && !insideHome(p) && space.canStand(p);   // 只记别人也能站的点：在可走的地方、不碰任何实体（含能进的楼）——原来只排除楼里的框，出门那几步的点在门里，1 倍速下健步走队伍跟着进了楼（10-06 新检查报出）
  if (trail.length && Math.hypot(p.x - trail[0].x, p.z - trail[0].z) > 4) trail.length = 0;   // 一下子跳了（换天、被接回家）：重新记
  if (!trail.length || Math.hypot(p.x - trail[0].x, p.z - trail[0].z) > 0.2) { trail.unshift({ x: p.x, z: p.z, out, seq: ++trailSeq }); if (trail.length > 160) trail.pop(); }
}
function trailPoint(back, strict = false) {   // strict：足迹还没那么长就返回 null（跟随的人先原地等，不挤到同一点）
  let acc = 0, px = elder.root.position.x, pz = elder.root.position.z, last = null;
  for (const t of trail) {
    acc += Math.hypot(t.x - px, t.z - pz); px = t.x; pz = t.z;
    if (t.out) { last = t; if (acc >= back) return t; }
  }
  return strict ? null : last;
}
export function placeBehind(person, back) {   // 刚出现的跟随者：站到他身后的足迹上（没有足迹就站他身边）
  const t = trailPoint(back) || elder.root.position; person.root.position.set(t.x, 0, t.z);
  person.root.userData.seq = t.seq ?? null; person.root.userData.fq = null;   // 从这一点接着沿足迹走
}
// 往 (tx,tz) 走，前面 0.5 以内有人就先等——只让排在自己前面的人（爷爷最前，孙女 0.9、陪同 1.5、队伍按出发远近）：
// 原来谁挡都等，两个人迎面互相让、都不动，健步走整队卡在门口、爷爷又在等队伍（10-06）。排在后面的人挡路由 separate 推开
const rankOf = (o) => o === elder ? 0 : o === kid ? 0.9 : o === companion ? 1.5 : crowd.includes(o) ? hikeBack(crowd.indexOf(o)) : 99;
function blockedAhead(person, tx, tz) {   // 正在过街（踩在路面上）不等，先走完
  const p = person.root.position; if (space.onRoad(p)) return false;
  const dx = tx - p.x, dz = tz - p.z, dl = Math.hypot(dx, dz) || 1, me = rankOf(person);
  return [elder, companion, kid, ...crowd].some(o => { if (o === person || !o.root.visible || rankOf(o) >= me) return false; const qx = o.root.position.x - p.x, qz = o.root.position.z - p.z, f = (qx * dx + qz * dz) / dl; return f > 0 && f < 0.5 && Math.abs(qx * dz - qz * dx) / dl < 0.3; });
}
// 跟随（10-06 根治）：领头的人一动就跟——足迹还不够长时，先走到最早的那段足迹（排在后面的人被前面的人挡住就排队等，见 blockedAhead）；
// 速度只比正常快一点（最多 1.3 倍，越落后越接近上限）；落得太远由 followersBehind 让爷爷等一等，不冲刺去追
const LAG_MAX = 6;   // 画面最多落后规则层这么远（过街等车几秒正常，之后按 1.3 倍追上）；再远规则层才停下等（10-06：原来 2.5 且过街点各算 1.5，一天多等 40—100 分钟）
// 画面里的人走多快：规则层此刻的速度（sim.walkRate：健步走、迷路、下雨、赶时间都算上）×倍速×1.3——从设计上保证画面跟得上，不靠规则层停下来等（10-06：原来写死 3.2×1.3，健步走时规则层更快，画面永远追不上，一天多等几百分钟）
const elderSp = () => Math.max(3.2, sim.walkRate ? sim.walkRate() : 3.2) * Math.max(1, run.speed) * 1.3;
// 面包屑式跟随（10-06 根治）：每个跟随者记着自己已经走到第几个足迹点（ud.seq），只往更新的点走、不回头，走到自己该站的那一点（离他 back）就停。
// 原来每帧找“离自己最近的足迹点”：他的足迹在门口折回、重叠时，最近的点来回跳，孙女在校门口一前一后晃着不走（用户 10-06）
function follow(person, back, dt, sp) {   // 返回是不是在走
  const ud = person.root.userData, p = person.root.position;
  const gap = Math.hypot(p.x - elder.root.position.x, p.z - elder.root.position.z);
  sp *= 1 + Math.min(0.3, Math.max(0, gap - back) * 0.1);
  if (ud.fq?.length) { if (blockedAhead(person, ud.fq[0].x, ud.fq[0].z)) return (ud.why = '前面有人(寻路)', false); ud.why = '寻路'; ud.fv = null; if (stepAlong(person, ud.fq, sp, dt) === 'waiting') { ud.crossWait = performance.now(); return (ud.why = '等车(寻路)', false); } return true; }   // 离得远时先沿人行网走过去
  const onR = space.onRoad(p);   // 站在马路上（过街中）：绝不停下——到位了也先走上人行道（10-06：孙女停在斑马线上，车让她、爷爷等车，互相等）
  if (!onR && gap <= back + 0.5 && !(ud.seq != null && trailPoint(back, true))) return (ud.why = '在他身边', false);   // 就在他身边（还没走出足迹那么长）：站着等，不去追来时的旧足迹
  const t = trailPoint(back, true) || trailTail();
  if (!t) {   // 还没有足迹（他还在楼里、刚出门）：直接沿人行网朝他走过去，不原地等（原来等足迹，他又在等队伍，两边互相等死）
    if (!space.canStand(elder.root.position)) return (ud.why = '等他出来', false);   // 他还在楼里（别人不能进）：在外面等，不寻路走进楼（10-06 1 倍速检查报出）
    ud.fq = roadPath(p, elder.root.position.clone()).slice(1); return true;
  }
  // 接上足迹：刚开始跟、或者走过的那段足迹已经被清掉了——从离自己最近的楼外足迹点接上（只在这时找一次“最近”）
  const oldest = trail.length ? trail[trail.length - 1].seq : 0;
  if (ud.seq == null || ud.seq < oldest - 1 || ud.seq > trailSeq) {
    let best = null, bd = 1e9; for (const q of trail) { if (!q.out || q.seq > t.seq) continue; const dd = Math.hypot(q.x - p.x, q.z - p.z); if (dd < bd) { bd = dd; best = q; } }
    if (!best) return (ud.why = '接不上足迹', false);
    ud.seq = best.seq - 1;
  }
  if (ud.seq >= t.seq && !onR) return (ud.why = '到位', false);   // 已经站到自己的位置了（在马路上时越过自己的位置，走到路边为止）
  let w = null; for (let i = trail.length - 1; i >= 0; i--) { const q = trail[i]; if (q.seq > ud.seq && q.out) { w = q; break; } }   // 下一个更新的楼外足迹点
  if (!w && onR) w = elder.root.position;   // 足迹走完了还在马路上：朝他走（他在路边）
  if (!w) return (ud.why = '没有下一个点', false);
  const d = Math.hypot(w.x - p.x, w.z - p.z);
  if (d > 1.5) { ud.fq = roadPath(p, new THREE.Vector3(w.x, 0, w.z)).slice(1); ud.seq = w.seq; return true; }   // 离足迹远（刚出现、在广场上）：沿人行网走过去，不直线穿房子、草地
  if (blockedAhead(person, w.x, w.z)) return (ud.why = '前面有人', false);
  if (!space.onRoad(p) && !roadClear(w)) { ud.crossWait = performance.now(); markWaiting(p); return (ud.why = '等车', false); }   // 沿足迹要过街：路口里正在过车就在路边等（和爷爷同一条规矩）；crossWait：检查用
  if (onR && (gap < 0.9 || Math.hypot(w.x - elder.root.position.x, w.z - elder.root.position.z) < 0.6)) {   // 在马路上、要去的点被他占着（他站在路口拐角等下一条斑马线）：站到他旁边的人行道上，别堵在斑马线上（10-06：车让她、他等车，互相等）
    let best = null, bd = 1e9; for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2, q = { x: elder.root.position.x + Math.cos(a) * 0.55, z: elder.root.position.z + Math.sin(a) * 0.55 };
      if (!space.canStand(q) || space.onRoad(q)) continue; const dd = Math.hypot(q.x - p.x, q.z - p.z); if (dd < bd) { bd = dd; best = q; } }
    if (best) { ud.why = '走'; stepTo(person, best, sp, dt); return true; }
  }
  // 匀速跟（10-07）：按他此刻的速度走，离自己的位置远了稍快、近了稍慢，速度每秒最多变 0.8 倍——原来全速追上就站住，他一放慢队伍就一走一停
  { const base = sp / 1.3, want = Math.max(base * 0.15, Math.min(sp, (run.elderV || 0) + (gap - back) * 0.6 * base));
    ud.fv = ud.fv == null || !(performance.now() - (ud.mvAt || 0) < 200) ? Math.min(want, Math.max(ud.mv || 0, base * 0.3)) : ud.fv + Math.max(-base * 2 * dt, Math.min(base * 1.5 * dt, want - ud.fv));
    if (onR) ud.fv = Math.max(ud.fv, base * 0.9);   // 在马路上：按正常步子走完
    sp = Math.max(0.05, ud.fv); }
  ud.why = '走'; if (stepTo(person, w, sp, dt) && w.seq != null) ud.seq = w.seq;
  return true;
}
function trailTail() { for (let i = trail.length - 1; i >= 0; i--) if (trail[i].out) return trail[i]; return null; }   // 最早的那个楼外足迹点
// 跟着的人（陪同、孙女、健步走队伍）有人落得太远：爷爷先等一等
function followersBehind() {
  const list = [[companion, 1.5], [kid, 0.9], ...(run.hiking ? crowd.map((p, i) => [p, hikeBack(i)]) : [])];
  const i = list.findIndex(([p, back]) => p.root.visible && Math.hypot(p.root.position.x - elder.root.position.x, p.root.position.z - elder.root.position.z) > back + 3.5);
  return i < 0 ? '' : i === 0 ? '陪同' : i === 1 ? '孙女' : '队伍' + (i - 2);   // 谁掉了队（空＝没有）
}

// 松一口气（10-06 人物表现力）：他刚自己认出路、或刚把一件事办成，停下来缓一口气（约 2 秒；只看画面，不改规则）
let hikeOrder = null;   // 健步走的排队顺序（crowd 编号）；不在健步走时清空
// 调试：画面里的他在追什么、为什么停
export const navDebug = () => ({ q: ew.queue.length, q0: ew.queue[0] && [+ew.queue[0].x.toFixed(2), +ew.queue[0].z.toFixed(2), ew.queue[0].xing], P: ew.lastP && [+ew.lastP.x.toFixed(2),
  +ew.lastP.z.toFixed(2)], why: run.lagWhy, held: +(run.lagHeldT || 0).toFixed(1), wait: +(ew.waitT || 0).toFixed(1) });
export const hikeBack = (i) => 1.6 * ((hikeOrder ? hikeOrder.indexOf(i) : i) + 1);
const relief = { t: 0, seen: 0 };
function watchRelief(dt) {
  relief.t -= dt; const ev = sim.events || [];
  if (ev.length < relief.seen) relief.seen = 0;   // 换了一天
  for (let i = relief.seen; i < ev.length; i++) { const k = ev[i].kind; if (k === 'found' || (k === 'goalEnd' && ev[i].status === 'done')) relief.t = 2; }
  relief.seen = ev.length;
}

// ---------- 每帧：人物 ----------
// 爷爷（在家走动、出门、到了地方、朝向、动作、表情、手里的东西）、陪同的人、棋友、健步走队伍、孙女、邻居
export function updatePeople(dt, e) {
  if (e && run.lastMode === 'home' && e.mode !== 'home' && sim.phase === 'live') zoomTo(window.innerWidth > 760 ? 52 : 70);
  if (e) run.lastMode = e.mode;
  watchRelief(dt * Math.max(1, run.speed));
  if (e) {
    // 走进药店、驿站、社区中心：人在楼里看不见，走出门再出现（楼的占地见 town.js 的 indoor）
    const ep = elder.root.position, inBuilding = Object.values(town.placeObjs).some(g => { const b = g.userData.indoor; return b && Math.abs(ep.x - b.x) < b.hw && Math.abs(ep.z - b.z) < b.hd; });
    atDoor(elder, !inBuilding);   // 进楼、出楼：从门里进出（presence）
    // 能进去的楼：他走到门前一米多，门往里转开；走开就慢慢关上
    for (const g of Object.values(town.placeObjs)) { const L = g.userData.doorLeaf, D = g.userData.doorAt; if (!L || !D) continue;
      const want = Math.hypot(ep.x - D.x, ep.z - D.z) < 1.8 ? 1.35 : 0; L.rotation.y += (want - L.rotation.y) * Math.min(1, dt * 6); }
    const before = elder.root.position.clone();
    const walkSp = 3.2 * Math.max(0.6, Math.min(run.speed, 2));
    let homeAnim = null, walking = false;
    if (e.mode === 'home' && !visitNav.key) {   // 还在药店、社区中心里（比如天黑了被接回家）：先走下面那段，从门口出来
      // 在家：按正在发生的事走到对应位置
      const key = homeSpotKey(), justGot = performance.now() - (homeNav.arrT || 0) < 600;   // 刚走到一个位置：至少站 0.6 秒再去下一处（10-07：到了马上又走，看着像卡了一下）
      if (key !== homeNav.key && !justGot) { homeNav.key = key; homeNav.queue = routeInHouse(elder.root.position, homeWorld(key)); }
      const had = homeNav.queue.length; moveAlong(homeNav.queue, walkSp, dt);
      if (had && !homeNav.queue.length) homeNav.arrT = performance.now();
      if (!homeNav.queue.length) { homeAnim = homeAnimFor(homeNav.key); const f = homeFaceFor(homeNav.key); if (f) elder.face(f, dt); }
    } else if (insideHome(elder.root.position) || homeNav.exiting) {
      // 出门：先从门口走出去
      if (!homeNav.exiting && performance.now() - (homeNav.arrT || 0) < 600) { /* 刚走到屋里的位置：先站一下再出门 */ }
      else if (!homeNav.exiting) { homeNav.exiting = true; const en = space.nodes[space.doors.home.entry]; homeNav.queue = [homeWorld('doorIn'), new THREE.Vector3(en.x, 0, en.z)]; homeNav.key = null; }   // 出门到人行线上，再由 walkTarget 接着走
      run.elderStep = '出家门' + homeNav.queue.length; run.elderWhy = moveAlong(homeNav.queue, elderSp() * 1.08, dt) === 'waiting' ? '等车' : '';
      if (!homeNav.queue.length) homeNav.exiting = false;
    } else {
      homeNav.key = null;
      const atPlace = (e.mode === 'entering' || (e.mode === 'task' && e.after === 'goHome')) && !(e.leg === 'hike');
      const key = atPlace ? placeKeyAt(e) : null;
      if (key && visitNav.key !== key) { visitNav.key = key; visitNav.leaving = false; visitNav.queue = visitQueue(key); }
      if (!key && visitNav.key && !visitNav.leaving) { visitNav.leaving = true; visitNav.queue = leaveQueue(visitNav.key); if (cam.follow) zoomTo(window.innerWidth > 760 ? 52 : 70); }   // 办完出门：镜头拉回
      if (visitNav.queue.length) {
        run.elderStep = (visitNav.leaving ? '出门' : '进门') + visitNav.queue.length; run.elderWhy = moveAlong(visitNav.queue, visitNav.leaving ? elderSp() : walkSp * 0.8, dt) === 'waiting' ? '等车' : '';
        if (!visitNav.queue.length && visitNav.leaving) visitNav.key = null;
      } else if (key) {
        if (e.mode === 'entering') {   // 走到柜台／门口了：镜头推近，这才开始办事
          if (cam.follow) { focusOn(elder.root.position); zoomTo(window.innerWidth > 760 ? 34 : 48); }
          sim.visualArrived();
        }
        if (e.goal?.task === 'chess') elder.face(chessFriend.root.position, dt);
        if (run.kidPending && key === 'school') {   // 他到了校门口：孙女从校园里跑出来，见面后再讲往事
          run.kidPending = false; run.kidHoldUntil = performance.now() + 5000; const u = town.placeObjs.school.userData;
          kid.root.position.copy(u.spot || u.front); atDoor(kid, true); kid.root.userData.seq = null; kid.root.userData.fq = null;
          elder.face(kid.root.position, 1);
          emit('say', 'kid', sim.line('kid.here')?.text, 2.5);
          later(1.6, () => { if (sim.phase === 'live') { sim.speak('task.kid'); later(2.2, () => { if (sim.phase === 'live') emit('tellMemory'); }); } });   // 按剧情节拍计时：玩家暂停时一起停
        }
      } else {   // 沿路走：在人行线上追规则层的位置（见上面 walkTarget）；先走完换边要走的那几步（含过街）
        if (ew.held) { ew.held = false; ew.seg = null; }   // 刚出门走上路：和原来一样，从这一刻的位置重新选边
        const P = walkTarget(e), nx = ew.queue.length ? ew.queue[0] : P; ew.lastP = P;
        // 匀速（10-07 用户：人自然匀速走）：不是“全速追到目标点就站住”，而是按落后多远定速度——落后 2.5 走规则层的速度，多了最多快三成，少了慢下来；速度每秒最多变 0.6 倍，不忽快忽慢
        const sp = (() => { const base = elderSp() / 1.3; let lag = 0, px = elder.root.position.x, pz = elder.root.position.z;
          for (const q of ew.queue.concat([P])) { lag += Math.hypot(q.x - px, q.z - pz); px = q.x; pz = q.z; }
          // 目标点自己走多快（规则层的速度按这段路的比例换到人行线上；他在路口犹豫时是 0）：在它的速度上按差多少加减
          const pv = ew.pPrev && dt > 0 ? Math.min(base * 1.5, Math.hypot(P.x - ew.pPrev.x, P.z - ew.pPrev.z) / dt) : base; ew.pPrev = { x: P.x, z: P.z };
          ew.pv = ew.pv == null ? pv : ew.pv + (pv - ew.pv) * Math.min(1, dt * 4);
          run.ruleStill = pv < base * 0.05;   // 规则层这一下停着（剧情停顿、犹豫、等画面）：检查不把由此来的停顿算“顿挫”
          const want = Math.max(0, Math.min(base * 1.3, ew.pv + (lag - 1.5 * Math.min(1, ew.pv / base)) * 0.5 * base));
          // 想落后的距离随目标点的速度：目标点停着就走到跟前
          ew.v = ew.v == null ? Math.max(want, Math.min(base, elder.root.userData.mv || 0)) : ew.v + Math.max(-base * 2 * dt, Math.min(base * 1.5 * dt, want - ew.v));
          ew.v = Math.min(ew.v, base * 1.3, ew.pv + Math.sqrt(2 * base * 1.2 * lag));   // 倍速调低了：马上跟着慢；目标点停着（他在路口犹豫、到门口）：按能停住的速度慢下来，不走到跟前才一下站住
          if (space.onRoad(elder.root.position)) ew.v = Math.max(ew.v, base * 0.9);   // 在马路上（过街）：按正常步子走完，不在路中间慢慢挪（车在等）
          return Math.max(0.05, ew.v); })();
        // 前面 0.45 以内有路人、邻居：画面里先等一下（最多 4 秒，路人会转身让开），之后再追上规则层的位置
        const ep2 = elder.root.position, ddx = nx.x - ep2.x, ddz = nx.z - ep2.z, ddl = Math.hypot(ddx, ddz) || 1;
        let gapP = 9;
          if (ddl > 0.05 && !space.onRoad(ep2)) for (const q of walkers.positions().concat(Object.values(helperPeople).filter(h => h.person.root.visible).map(h => h.person.root.position))) {
          const qx = q.x - ep2.x, qz = q.z - ep2.z, f = (qx * ddx + qz * ddz) / ddl; if (f > 0 && f < gapP && Math.abs(qx * ddz - qz * ddx) / ddl < 0.3) gapP = f; }
        const someone = gapP < 0.45 + sp * dt;   // 看得远一点＝这一帧要走的距离（4 倍速一帧走约 0.27，原来会一步跨进人身上）
        if (gapP < 1.4 && !someone) { ew.v = Math.min(ew.v, sp * Math.max(0.2, (gapP - 0.45) / 0.95)); run.elderSlow = '前面有人'; } else run.elderSlow = '';   // 前面有人：先慢下来（路人看见他会让开），不走到跟前才一下站住
        ew.waitT = someone ? (ew.waitT || 0) + dt : 0;
        run.elderWhy = '';
        if (someone && ew.waitT < 4) { run.elderWhy = '让路人'; }
        else if (ew.queue.length) { run.elderStep = '换边' + ew.queue.length; if (stepAlong(elder, ew.queue, sp, dt) === 'waiting') run.elderWhy = '等车'; }   // 过街：进了路口的车先过（画面里等一下，之后追上）
        else if (!space.lineClear(elder.root.position, P)) { run.elderStep = '绕'; ew.queue = roadPath(elder.root.position, P).slice(1); }   // 直线过不去（刚从楼里出来、隔着草边）：沿人行网走过去（10-06：原来直线追，健步走时斜穿草边，队伍跟着出界）
        else { run.elderStep = '追' + Math.hypot(P.x - elder.root.position.x, P.z - elder.root.position.z).toFixed(1) ; stepTo(elder, P, sp, dt); }   // 不再“落后多少就快多少”：落后太多由下面的 visualLag 让规则层等
        walking = true;
      }
    }
    // 不在路上（家里、进出门）：回到路上时从当下的位置重新选边。正在出门（e.hold，下面要看他走没走回人行线）时只在挪动 0.25 以上才重选：
    // 10-14 手机卡顿实测——原来出门那几秒每帧都重新寻路两次（一次约 25 毫秒，手机上一两百毫秒），一出门就连着卡，掉帧又让出门走得更久
    if (!walking) { if (!e.hold || !ew.from || Math.hypot(elder.root.position.x - ew.from.x, elder.root.position.z - ew.from.z) > 0.25) ew.seg = null; ew.held = !!e.hold; ew.v = null; ew.pv = null; ew.pPrev = null; run.ruleStill = false; }
    // 画面落后规则层太多（等过街、等让路，或跟着的人掉了队）：规则层先站着等，画面按正常速度赶上——不冲刺
    { const P = walking ? ew.lastP : null, lag = P ? Math.hypot(P.x - elder.root.position.x, P.z - elder.root.position.z) : 0;
      const fb = walking && followersBehind(), want = walking && (lag > LAG_MAX || !!fb);
      run.lagHeldT = want ? (run.lagHeldT || 0) + dt : 0;
      sim.setVisualLag(want && run.lagHeldT < 8);   // 一次最多停 8 秒：再等就放行（检查会报“互相等”），不让整个游戏卡死
      if (want && sim.phase === 'live') run.lagSec = (run.lagSec || 0) + dt;   // 检查用：这一天时钟为等画面停了多少真实秒
      if (want && sim.phase === 'live') { const k = ew.queue.length ? '过街' : fb ? '等' + fb : '落后'; run.lagBy ||= {}; run.lagBy[k] = (run.lagBy[k] || 0) + dt; }   // 检查用：时钟为等画面停的真实秒数，按原因记
      run.lagWhy = walking && (lag > LAG_MAX || fb) ? (lag > LAG_MAX ? `落后${lag.toFixed(1)} 过街点${ew.queue.length}` : '') + (fb ? ' 等' + fb : '') : ''; }   // 检查用：在等什么
    // 走出门之后才放行模拟里的移动（最多等 4 秒）
    if (e.hold) {
      run.holdT += dt;
      const P = walkTarget(e), atNode = !ew.queue.length && Math.hypot(P.x - elder.root.position.x, P.z - elder.root.position.z) < 0.4;   // 走回人行线上了
      // 快走出来了（最后一段、离人行线不到 1.2）就放行：规则层先起步，他接着走不用在门口站一下（10-07 检查报出门“顿挫”）
      const lastLeg = (q) => q.length === 1 && Math.hypot(q[0].x - elder.root.position.x, q[0].z - elder.root.position.z) < 1.2;
      const nearOut = (homeNav.exiting && lastLeg(homeNav.queue)) || (visitNav.leaving && lastLeg(visitNav.queue));
      if (nearOut || (!homeNav.exiting && !(visitNav.leaving && visitNav.queue.length) && atNode) || run.holdT > 6) { sim.releaseHold(); run.holdT = 0; }
    } else run.holdT = 0;
    // 朝向跟着实际移动方向，避免倒退着走
    const mv = elder.root.position.clone().sub(before); mv.y = 0;
    if (dt > 0) run.elderV = (run.elderV || 0) + (Math.min(mv.length() / dt, elderSp() * 1.5) - (run.elderV || 0)) * Math.min(1, dt * 6);   // 他画面里此刻走多快（平滑过）：跟着的人按这个速度走
    const moving = mv.lengthSq() > 1e-6;
    if (moving) elder.face(elder.root.position.clone().add(mv), Math.min(dt * 1.6, 0.2));
    else if (e.next != null && e.mode === 'walk') elder.face(graph.pos[e.next], dt);
    elder.anim = moving && mv.length() > dt * 0.3 ? (e.lost || sim.anxiety > 0.6 ? 'hurry' : 'walk')   // 迷路、心里慌：慌着走
      : homeAnim ? homeAnim
      : relief.t > 0 ? 'relief'
      : e.mode === 'hesitate' ? (e.lost || e.drift ? 'puzzled' : 'look') : e.mode === 'stuck' ? 'worried' : e.mode === 'phone' ? 'phone' : run.happyT > 0 ? 'happy' : e.mode === 'task' && e.goal?.task === 'chess' ? 'chess' : 'idle';
    elder.speed = run.speed ? Math.min(run.speed, 2) * (e.lost ? 0.8 : 1) : 0.6;
    // 表情
    const mk = sim.moment?.kind;
    elder.setExpr(run.happyT > 0 || run.homeAction?.happy ? 'happy'
      : e.mode === 'stuck' || e.lost || (mk && ['lost', 'scam', 'stove'].includes(mk)) ? 'worried'
      : mk || e.mode === 'hesitate' ? 'think'
      : sim.mood < 40 ? 'sad' : sim.mood > 72 ? 'happy' : 'neutral');
    // 手里的东西：跟着当天的事走
    const g0 = e.goal;
    let prop = null;
    if (g0 && e.mode !== 'home') {
      if (g0.task === 'shop' && (g0.status === 'done' || g0.status === 'partial') && e.leg === 'back') prop = 'bag';
      else if ((g0.task === 'chess' || g0.task === 'match' || g0.wrongPlace) && e.leg === 'go') prop = 'chess';
      else if (g0.task === 'post' && e.leg === 'go') prop = 'letter';
    }
    elder.setProp(prop);
    elder.setUmbrella(sim.raining && e.mode !== 'home');
    if (run.speed > 0) elder.update(dt * Math.min(run.speed, 2)); else elder.update(0);
    run.happyT -= dt * run.speed;

    recordTrail();
    if (companion.root.visible) {   // 陪同的你：跟在他身后 1.5（沿足迹）
      if (!companion.root.userData.on) { placeBehind(companion, 1.5); companion.root.userData.on = true; }   // 刚出现：站到他身后的足迹上
      companion.anim = follow(companion, 1.5, dt, elderSp()) ? 'walk' : 'idle';
      companion.update(dt * Math.min(run.speed, 2));
    } else companion.root.userData.on = false;
  }

  // 棋友：爷爷刚到时招手打招呼（约 2 秒），之后一起下棋；原来整盘棋都用“开心”（原地蹦跳），用户 09-28 指出
  const atChess = !!(e && e.goal?.task === 'chess' && e.mode === 'task');
  if (atChess && !chessSince) chessSince = performance.now(); else if (!atChess) chessSince = 0;
  chessFriend.anim = !atChess ? 'idle' : performance.now() - chessSince < 2200 ? 'wave' : 'chess';
  chessFriend.root.visible = !sim.day || sim.day.goals.some(g => g.task === 'chess');
  chessFriend.update(dt);
  if (run.hiking && e) {
    if (!hikeOrder) { trail.length = 0; crowd.forEach(p => { p.root.userData.seq = null; p.root.userData.fq = null; }); }   // 健步走从这儿开始：之前（来的路上）的足迹不跟
    if (!hikeOrder) { const ep = elder.root.position; hikeOrder = crowd.map((p, i) => [i, Math.hypot(p.root.position.x - ep.x, p.root.position.z - ep.z)]).sort((a, b) => a[1] - b[1]).map(x => x[0]); }   // 出发时离他近的排前面（原来按编号排，后排的人要穿过前排、互相挡着等很久）
    crowd.forEach((p, i) => {   // 健步走队伍：沿他的足迹一个跟一个，间隔 1.6
      if (!shownNow(p)) appear(p);
      p.anim = follow(p, hikeBack(i), dt, elderSp()) ? 'walk' : 'idle';
      p.update(dt * Math.max(Math.min(run.speed, 2), 0.6));
    });
  }
  if (!run.hiking) hikeOrder = null;
  const matchDay = sim.day && sim.day.goals.some(g => g.task === 'match' || g.task === 'movie');
  if (!run.hiking) for (const p of crowd) { if (!!matchDay !== shownNow(p)) matchDay ? appear(p) : vanish(p); if (matchDay) {   // 健步走结束、散场：淡出（presence）
    p.anim = e && e.goal?.task === 'match' && e.mode === 'task' ? 'wave' : 'idle'; p.face(e ? e.pos : p.root.position, dt); p.update(dt); } }
  // 包饺子那天，孙女在家里的餐桌旁
  const cookDay = sim.day && sim.day.goals.some(g => g.task === 'cook') && sim.phase === 'live' && sim.time > 960;
  if (cookDay && e && e.mode === 'home') {
    if (!shownNow(kid)) appear(kid);   // 包饺子：她在桌边淡入（presence；原来凭空出现）
    kid.root.position.copy(homeG.position).add(new THREE.Vector3(0.5, 0, -0.75));
    kid.face(homeG.position.clone().add(new THREE.Vector3(0.5, 0, 1)), dt);
    kid.anim = sim.moment?.kind === 'cook' ? 'cook' : (run.happyT > 0 ? 'happy' : 'idle'); kid.update(dt);
  } else if (run.kidPending && e && e.mode !== 'task') { run.kidPending = false; placeBehind(kid, 0.9); appear(kid); }   // 兜底：没走到校门就要走了，直接在身边（淡入）
  if (run.kidPending || performance.now() < run.kidHoldUntil) sim.waitAtLeast(3);   // 等他走到校门口、孙女出来，再往下走
  if (!(cookDay && e && e.mode === 'home') && kid.root.visible && e) {
    if (e.mode === 'home' && insideHome(elder.root.position) && kid.root.userData.why !== '走' && kid.root.userData.why !== '寻路') atDoor(kid, false);   // 画面里他进了家门、她也走到门口了，才跟着进屋（原来规则层一判到家，她就在街上消失）
    const moving = follow(kid, 0.9, dt, elderSp());   // 跟在他身后 0.9（沿足迹；他进校门接人时她从校门口出来）
    kid.anim = moving ? 'walk' : (run.happyT > 0 ? 'happy' : 'idle');
    kid.update(dt * Math.max(Math.min(run.speed, 2), 0.5));
  }

  // 邻居
  for (const [id, h] of Object.entries(helperPeople)) {
    const act = nbActs[id];
    if (!h.state && act) {
      const on = sim.phase === 'live' && sim.time >= act.start && sim.time < act.end;
      // 邻居的活动开始、结束：在活动的地方淡入、淡出；人已经在画面里别处（刚帮完忙）就换位置（presence，不瞬移）
      if (on && !shownNow(h.person) && !fading(h.person)) { h.person.root.position.copy(act.pos); appear(h.person); }
      else if (!on && shownNow(h.person)) vanish(h.person);
      if (on) {
        const d = h.person.root.position.distanceTo(act.pos);
        if (d > 0.3 && !fading(h.person)) relocate(h.person, act.pos); else if (d > 0.01 && d <= 0.3) h.person.root.position.copy(act.pos);
        h.person.anim = act.anim; h.person.update(dt * Math.max(run.speed, 0.5));
        if (!act.greeted && sim.e && sim.e.pos.distanceTo(act.pos) < 4) { act.greeted = true; emit('neighborGreet', id); h.person.face(sim.e.pos, 1); }
      }
      continue;
    }
    if (!h.state) continue;
    // 路径：out（去）→ 在目的地挥手／等候（wave，t 从负数开始＝多等一会儿）→ back（回），都沿路走
    const s = h.state, p = h.person, sp = elderSp() / Math.max(1, run.speed) * Math.max(run.speed, 0.5) * dt;   // 邻居、老孙走路的速度：和爷爷画面同一个来源（规则层速度×1.3），原来写死 6，比规矩快 44%，检查报过冲刺（10-06）
    if (s.phase === 'wave') { s.t += dt; p.anim = 'wave'; p.face(sim.e.pos, dt); if (s.t > 1.8 / Math.max(run.speed, 0.5)) s.phase = 'back'; }
    else {
      const q = s.phase === 'out' ? s.out : s.back;
      while (q.length && p.root.position.distanceTo(q[0]) < 0.15) q.shift();
      if (!q.length) { if (s.phase === 'out') { s.phase = 'wave'; s.t = s.wait || 0; s.onArrive?.(); s.onArrive = null; } else { h === helperPeople.acq ? vanish(p) : atDoor(p, false); h.state = null; } }   // 邻居走到自家门口进屋；老孙走到路口就离开画面（淡出）
      else { p.anim = 'walk'; stepAlong(p, q, sp / Math.max(dt, 1e-6), dt, { face: true, near: 0.15 }); }   // 统一移动入口（mover.js）
    }
    p.update(dt * Math.max(run.speed, 0.5));
    (h.dbg ||= []).push(`${s.phase}${(s.phase === 'out' ? s.out : s.back)?.length ?? ''}@${p.root.position.x.toFixed(1)},${p.root.position.z.toFixed(1)}`); if (h.dbg.length > 8) h.dbg.shift();   // 检查用
  }

}

// 孙女要不要出现、开心动作计时：只由这里写
export function setKidPending(v) { run.kidPending = v; }
export function cheer(sec) { run.happyT = sec; }
