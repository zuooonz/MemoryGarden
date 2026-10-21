import * as THREE from 'three';
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const fmt = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;

// 收起临时物体时释放显存（路障、路标、地图连线等每天或每次点按都会重建）：只从场景里移走不释放，几何体和材质会一直占着显存。
// keep：共用的几何体（几个物体用同一个），不释放；贴图都是共用的，不释放；精灵的几何体是 three 全局共用的，不释放。
export function disposeTree(root, keep = null) {
  root.traverse((o) => {
    if (o.geometry && o.geometry !== keep && !o.isSprite) o.geometry.dispose();
    for (const m of [o.material].flat()) m?.dispose();
    if (o.isInstancedMesh) o.dispose();
  });
  root.removeFromParent();
}
export function clearGroup(g, keep = null) { for (const o of [...g.children]) disposeTree(o, keep); }

// 程序画的贴图（雾、日盘月亮、老照片）：画完立刻把像素“烤”下来做贴图。
// 不直接用 CanvasTexture：贴图要等第一次显示才上传显卡，而浏览器在显存紧张时会清空闲置的 2D 画布——上传时已是空白（09-27 雾几乎看不见的原因）。
export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true }); draw(x, w, h);
  const src = x.getImageData(0, 0, w, h).data, px = new Uint8Array(src.length), row = w * 4;
  for (let y = 0; y < h; y++) px.set(src.subarray(y * row, y * row + row), (h - 1 - y) * row);   // 上下翻过来，和 CanvasTexture 的朝向一致
  const t = new THREE.DataTexture(px, w, h, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}

// 游戏内容（菜摊抽的菜、包饺子、关卡里的洗牌）的随机数：每天开始按“第几天、第几次玩”重设种子（flow.startDay）。
// 同一天同一次玩结果固定、重玩会换；和画面帧数无关（10-06：原来用全局 Math.random，前面按时间触发的效果取了多少次会跟着帧数变，截图比对不稳）
let _content = rng(1);
export const contentRand = () => _content();
export function seedContent(n) { _content = rng(n); }
// ---------- 按真实时间走、玩家暂停时一起停的定时器（小关卡里的对白节拍、自动收尾、地图示范）----------
// 暂停时剩余时间冻住，继续后接着计（和关卡里的配音一起停一起走）；hud.setSpeed 里按玩家暂停调 pauseTimers
const ptimers = new Set(); let ptPaused = false;
export function pauseTimeout(fn, ms) {
  const t = { left: Math.max(0, ms || 0), at: 0, id: 0, dead: false };
  t.arm = () => { t.at = performance.now(); t.id = setTimeout(() => { ptimers.delete(t); if (!t.dead) { t.dead = true; fn(); } }, t.left); };
  ptimers.add(t); if (!ptPaused) t.arm();
  return t;
}
export function pauseInterval(fn, ms) {   // 返回的句柄交给 clearPause 停掉
  const h = { dead: false, t: null };
  const tick = () => { if (h.dead) return; h.t = pauseTimeout(tick, ms); fn(); };
  h.t = pauseTimeout(tick, ms);
  return h;
}
export function clearPause(h) { if (!h) return; h.dead = true; if (h.t) clearPause(h.t); if (h.id) clearTimeout(h.id); ptimers.delete(h); }
export function pauseTimers(on) {
  on = !!on; if (on === ptPaused) return; ptPaused = on;
  for (const t of ptimers) { if (on) { clearTimeout(t.id); t.left = Math.max(0, t.left - (performance.now() - t.at)); } else t.arm(); }
}
