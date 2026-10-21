// 小镇的构件（由 town.js 拆出，09-27）：材质、普通房子（带窗、门、台阶、烟囱、遮阳棚、勒脚、檐口）、路灯、树。
// 注意：house／tree 会从传入的随机数 r 取数——调用顺序就是小镇布局，别在里面多取或少取。
import * as THREE from 'three';
import { canvasTexture } from './util.js';

// 渐变上色（画面精修 09-27）：按高度给顶点一个明暗系数（底部 lo、顶部 hi），合并成顶点色时乘进去——手绘般的上下明暗，不加贴图
export function shadeY(geo, lo, hi) {
  geo.computeBoundingBox(); const b = geo.boundingBox, p = geo.attributes.position, a = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) a[i] = lo + (hi - lo) * ((p.getY(i) - b.min.y) / Math.max(1e-6, b.max.y - b.min.y));
  geo.setAttribute('shade', new THREE.BufferAttribute(a, 1)); return geo;
}
export const TREE_ROUGH = 0.86;   // 树冠材质的记号：合并时自成一组，town.js 给这一组加摆动
export const swayT = { value: 0 };   // 摆动时钟（main.js 每帧加；暂停时不加）
export const M = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, ...opts });
export const lampM = new THREE.MeshStandardMaterial({ color: 0xfff2c8, flatShading: true, emissive: 0xffd27a, emissiveIntensity: 0 });
// 光锥的亮度从灯泡往地面渐渐淡到没有：用一张竖向渐变贴图（叠加混合下黑色＝不加光）。10-06：试过顶点色，在这条渲染流程里整帧画不出来（不报错），改用贴图
export const lampConeM = new THREE.MeshBasicMaterial({ color: 0xffae55, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });   // 路灯往下打的一束暖光（09-29；傍晚随路灯亮，main.js 调）。不受空气雾影响（10-13：受雾时叠加的是雾色，成了白色鬼影）
// 路灯在地上的一圈暖光（10-13 画面重塑）：和光锥一起亮；叠加、不受雾影响，贴图中心亮、边缘淡（town.js 合成一个网格）
export const lampPoolM = new THREE.MeshBasicMaterial({ color: 0xffb866, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, polygonOffset: true, polygonOffsetFactor: -3 });
// 玻璃（10-13 画面重塑，用户选“有厚度的窗洞”）：暖深灰，和米墙、木门一个温度；白天斜着看带一层很淡的天光和一道细高光（glassU，main.js 每帧给天色），
// 天黑后反光关掉、换成屋里的暖灯（emissive）。原来的青灰 0x56747c、偏白反光、屋顶色窗框都试过，用户都不满意
export const GLASS = 0x4a423d;
export const glassU = { uSky: { value: new THREE.Color(0xdfeaf2) }, uDay: { value: 1 } };
function glassCompile(sh) {
  Object.assign(sh.uniforms, glassU);
  sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  sh.fragmentShader = 'uniform vec3 uSky; uniform float uDay; varying vec3 vWP;\n' + sh.fragmentShader.replace('#include <opaque_fragment>',
    // 越斜着看越亮（菲涅尔）；两道斜向细高光按世界坐标画（合并后没有贴图坐标）
    'float fr = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 1.6);\n' +
    'float st = fract((vWP.x + vWP.z) * 0.55 + vWP.y * 0.55); float streak = smoothstep(0.0, 0.05, st) * (1.0 - smoothstep(0.12, 0.17, st)) + 0.6 * smoothstep(0.30, 0.33, st) * (1.0 - smoothstep(0.36, 0.39, st));\n' +
    'outgoingLight = mix(outgoingLight, uSky, clamp(0.03 + fr * 0.14, 0.0, 1.0) * uDay) + uSky * streak * 0.12 * uDay;\n#include <opaque_fragment>');
}
export const winM = new THREE.MeshStandardMaterial({ color: GLASS, roughness: 0.3, flatShading: true, emissive: 0xffc66b, emissiveIntensity: 0 });
export const winM2 = new THREE.MeshStandardMaterial({ color: GLASS, roughness: 0.31, flatShading: true, emissive: 0xffb45a, emissiveIntensity: 0 });   // 另一组窗：晚些亮、暗一些（不是家家同时开灯；main.js 调亮度）
export const winDim = new THREE.MeshStandardMaterial({ color: GLASS, roughness: 0.32, flatShading: true, emissive: 0x000001, emissiveIntensity: 0 });   // 晚上不亮灯的窗（小学：放学后没人；10-14）
for (const m of [winM, winM2, winDim]) { m.onBeforeCompile = glassCompile; m.customProgramCacheKey = () => 'glass'; m.vertexColors = true; }   // 玻璃颜色在顶点色里（按建筑类型），材质色只管明暗（main.js）

// 窗套：一圈凸出墙面的厚边（上沿厚、两侧和下沿薄），只做正面和内外侧面（24 个三角面；背面贴墙看不见，不画）。
// 太阳照着，窗套在玻璃上投下真实的影子，窗户“嵌”进墙里（10-13，原来的薄片窗框、十字窗棂、窗台换成它）
function surroundGeo(ww, wh, depth = 0.1, side = 0.08, top = 0.13, bot = 0.1) {   // 10-14 用户：窗框太宽——侧边 0.15→0.08、上沿 0.2→0.13、凸出 0.16→0.1
  const x0 = -ww / 2 - side, x1 = ww / 2 + side, y0 = -wh / 2 - bot, y1 = wh / 2 + top, ix0 = -ww / 2, ix1 = ww / 2, iy0 = -wh / 2, iy1 = wh / 2, z = depth;
  const q = [];   // 四边形（逆时针，朝外）
  const quad = (a, b, c, d) => q.push(a, b, c, a, c, d);
  // 正面一圈：上、下、左、右四块
  quad([x0, iy1, z], [x1, iy1, z], [x1, y1, z], [x0, y1, z]);
  quad([x0, y0, z], [x1, y0, z], [x1, iy0, z], [x0, iy0, z]);
  quad([x0, iy0, z], [ix0, iy0, z], [ix0, iy1, z], [x0, iy1, z]);
  quad([ix1, iy0, z], [x1, iy0, z], [x1, iy1, z], [ix1, iy1, z]);
  // 外侧面：上、下、左、右
  quad([x0, y1, z], [x1, y1, z], [x1, y1, 0], [x0, y1, 0]);
  quad([x1, y0, z], [x0, y0, z], [x0, y0, 0], [x1, y0, 0]);
  quad([x0, y0, z], [x0, y1, z], [x0, y1, 0], [x0, y0, 0]);
  quad([x1, y1, z], [x1, y0, z], [x1, y0, 0], [x1, y1, 0]);
  // 内侧面（窗洞四壁）：上沿朝下、下沿朝上、左右朝里
  quad([ix1, iy1, z], [ix0, iy1, z], [ix0, iy1, 0], [ix1, iy1, 0]);
  quad([ix0, iy0, z], [ix1, iy0, z], [ix1, iy0, 0], [ix0, iy0, 0]);
  quad([ix0, iy1, z], [ix0, iy0, z], [ix0, iy0, 0], [ix0, iy1, 0]);
  quad([ix1, iy0, z], [ix1, iy1, z], [ix1, iy1, 0], [ix1, iy0, 0]);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(q.flat(), 3)); geo.computeVertexNormals(); return geo;
}

// 人和房子的比例（10-13 用户：人要比门框矮，门窗和房高要协调）：人缩到 0.82 倍（person.js PERSON_K，最高约 2.16），门 2.3—2.45；
// 墙高按原来的高低次序拉到 3.6 以上（h0 是调用处给的原高度，随机数照取、布局不变），屋顶仍按原高度，不变成尖塔
// （10-13 先试过门至少 2.8、人不变：门又高又窄，和房子不协调，用户要求改回）
export const DOOR_MIN = 2.3;
// 门色（10-14 用户：门的颜色可以有差异）：住家四种——栗棕、旧朱红、墨绿、灰蓝，按房子尺寸固定挑（不取随机数）；公共楼取屋顶色压暗（和招牌同色系）
export const DOOR_COLS = [0x7a4e34, 0x8e3f30, 0x445c4c, 0x4f5d6c];
// 玻璃按建筑类型分（10-14）：住家暖深灰（GLASS），公共楼偏冷的深灰蓝，像店面、办公的玻璃；合并网格时写进顶点色（town.js mergeStatic）
export const GLASS_PUB = 0x3f4d58;
// 住家玻璃几种颜色（10-14 用户：窗户颜色可以适当增加）：暖深灰、灰蓝、灰橄榄、灰紫，按房子固定挑；都是压得很暗的颜色，白天看着像玻璃里的暗处
export const GLASS_HOME = [GLASS, 0x3e4a56, 0x44493d, 0x4b4147];
export function house(r, w, d, h0, wall, roof, { chimney = true, swing = false, pub = false, defer = false, dark = false } = {}) {   // defer：先不开窗，等摆好位置、知道邻居在哪再调 g.userData.addWindows(open)   // chimney：公共建筑（学校、药店……）不要烟囱；pub：公共楼（双开门、冷色玻璃、雨棚让给招牌）
  const h = 3.6 + (h0 - 2.2) * 0.8;
  const g = new THREE.Group();
  const body = new THREE.Mesh(shadeY(new THREE.BoxGeometry(w, h, d), 0.8, 1.02), M(wall));   // 墙：墙脚略暗、往上渐亮
  body.userData.contact = { w, d };   // 接触阴影：合并时收集，另做一个柔和的阴影网格（town.js）
  if (swing) body.userData.enterable = true;   // 能进去的楼：地基的实体表里算“屋里”，只许爷爷进（town.js solids）
  body.position.y = h / 2; body.castShadow = body.receiveShadow = true; g.add(body);
  // 画面精修 1：墙脚一圈深色勒脚、墙顶一条檐口线（不取随机数，不改变小镇布局）
  const trim = M(new THREE.Color(wall).multiplyScalar(0.72).getHex());
  const base = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.35, d + 0.08), trim); base.position.y = 0.175; base.receiveShadow = true; g.add(base);
  const eave = new THREE.Mesh(new THREE.BoxGeometry(w + 0.16, 0.14, d + 0.16), trim); eave.position.y = h - 0.09; g.add(eave);   // 顶面低于屋顶底面，不与屋顶挤在一个面上闪烁
  // 四坡屋顶：先把四棱锥在几何体里转正（底面成正方形、四边对着墙），再按房子长宽拉伸——底面是比墙略大的长方形，四角对齐墙角
  // （原来先转 45° 再拉伸，长方形房子的屋顶成了菱形，屋角和墙角对不上）
  const rf = new THREE.Mesh(shadeY(new THREE.ConeGeometry(Math.max(w, d) * 0.78, h0 * 0.55, 4).rotateY(Math.PI / 4), 0.9, 1.08), M(roof));   // 屋顶：檐口略暗、屋脊亮
  rf.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d));
  rf.position.y = h + h0 * 0.27; rf.castShadow = true; g.add(rf);
  // 正面（09-28 统一排布：原来门宽固定为墙宽 20%、只放高了门——窄房子的门又高又窄，勒脚横穿门下沿，窗不看门的大小）
  // 门：宽约为高的一半，装在勒脚外面，台阶与门同宽；一层窗和门的上半部对齐、避开门、不贴墙边；楼上的窗不碰檐口
  // 门宽（10-14 用户：有的门很窄不协调）：住家 1.0—1.2（约门高的一半），公共楼双开门约 1.8
  const dh = Math.min(DOOR_MIN + 0.15, Math.max(DOOR_MIN, h * 0.55)), dw = pub ? Math.min(1.8, w * 0.34) : dh * 0.44, fz = d / 2 + 0.07;   // 10-14 用户：门宽要协调——住家门统一按门高的 0.44（约 1.0—1.08，和真实的 0.9×2.1 米门同比例），不再跟着房子宽窄变（原来 0.88—1.2，窄房子的门显窄）
  // 门不一定居中（10-14 用户）：街区里的住家约三分之二把门挪到一边，另一边开窗；挑法按房子尺寸固定（不取随机数）
  const hs = Math.round(w * 131 + d * 71 + h0 * 37), wwH = Math.min(1.05, w * 0.21), side = hs % 2 ? 1 : -1;
  // 10-14 用户：占 1/4 街区的住家，门在一边、一楼一扇窗在另一边；墙边—门—窗—墙边三段空白一样宽（按一半墙居中会让门显得靠边）；门在左还是在右按房子尺寸挑（不取随机数）
  const wwF = Math.min(1.05, w * 0.21), gap = (w - dw - wwF) / 3;
  const offDoor = defer && !pub && gap >= 0.3, doorX = offDoor ? side * (w / 2 - gap - dw / 2) : 0, winX = offDoor ? -side * (w / 2 - gap - wwF / 2) : 0;
  const door = new THREE.Mesh(new THREE.BoxGeometry(dw, dh, 0.06), M(pub ? new THREE.Color(roof).multiplyScalar(0.55).getHex() : DOOR_COLS[Math.round(w * 13 + d * 7 + h0 * 5) % DOOR_COLS.length]));
  if (swing) { const hole = new THREE.Mesh(new THREE.BoxGeometry(dw, dh, 0.02), M(0x2a2420)); hole.position.set(0, dh / 2, d / 2 + 0.01); g.add(hole); }   // 门洞：门往里开后露出深色的门口，而不是墙（用户 09-28）
  if (swing) { const hinge = new THREE.Group(); hinge.position.set(-dw / 2, 0, fz); door.position.set(dw / 2, dh / 2, 0); hinge.add(door); g.add(hinge); g.userData.doorLeaf = hinge; }   // 能进去的楼：门绕左边门轴向里开（actors.js 转）
  else { door.position.set(doorX, dh / 2, fz); g.add(door); }
  { const ds = new THREE.Mesh(surroundGeo(dw, dh * 2, 0.08, 0.1, 0.14, 0), M(new THREE.Color(wall).multiplyScalar(0.8).getHex())); ds.position.set(doorX, 0, d / 2); g.add(ds); }   // 门套：和窗套同一组线脚（下半截在地面以下，看不见）
  if (pub) { const mid = new THREE.Mesh(new THREE.PlaneGeometry(0.05, dh), M(new THREE.Color(roof).multiplyScalar(0.35).getHex())); mid.position.set(0, 0, 0.035); door.add(mid); }   // 双开门中缝
  const step = new THREE.Mesh(new THREE.BoxGeometry(dw + 0.3, 0.12, 0.4), M(0xbdb4a4)); step.position.set(doorX, 0.06, d / 2 + 0.24); g.add(step);
  // 窗：竖长（10-13：原来 1.0 见方，比高墙小很多，像贴在墙上的小方块）
  const ww = pub ? Math.min(1.35, w * 0.23) : Math.min(1.05, w * 0.21), wh = 1.35, wx = Math.min(w / 2 - 0.2 - ww / 2, Math.max(w * 0.28, dw / 2 + 0.2 + ww / 2));   // 10-13：原来留边 0.3、离门 0.35，普通小房子（宽 2.6—3.4）一扇窗都放不下
  const y0 = Math.max(0.35 + wh / 2 + 0.25, dh - wh / 2 - 0.15);   // 一层窗的中心：窗顶与门顶齐平（略低），不压勒脚
  const surC = new THREE.Color(wall).multiplyScalar(0.8).getHex();   // 窗套：墙色深一档（和勒脚、檐口同一组线脚色）
  // 开窗（10-14 用户：窗太多，选“极简”）：住家只在正面开一两扇；公共楼端正
  // 按房子尺寸挑一种开法（不取随机数，布局不变）；open：哪几面能开窗（town.js 按街区里的邻居算，挨着别家的那面不开）
  const floors = []; for (let k = 0; y0 + k * 2.2 + wh / 2 + 0.2 <= h - 0.3; k++) floors.push(y0 + k * 2.2);
  const fitsFront = wx - ww / 2 >= dw / 2 + 0.15, sideX = d >= ww + 0.8;
  const pW = Math.min(2.0, w / 2 - dw / 2 - 0.55), pX = (w / 2 + dw / 2) / 2;   // 公共楼的宽窗：门边到墙边的正中
  const glassC = pub ? new THREE.Color(GLASS_PUB).lerp(new THREE.Color(roof), 0.18).getHex() : GLASS_HOME[(hs >> 1) % GLASS_HOME.length];   // 公共楼玻璃带一点自家屋顶色
  const addWin = (face, x, y, wW = ww) => {   // face：f 正面、b 背面、l 左、r 右；x：沿墙面的位置（从外面看向右为正）；wW：窗宽
    const rot = { f: 0, b: Math.PI, l: -Math.PI / 2, r: Math.PI / 2 }[face], half = face === 'f' || face === 'b' ? d / 2 : w / 2;
    const n = new THREE.Vector3(Math.sin(rot), 0, Math.cos(rot)), t = new THREE.Vector3(Math.cos(rot), 0, -Math.sin(rot));
    const win = new THREE.Mesh(new THREE.PlaneGeometry(wW, wh), dark ? winDim : (hs + Math.round(x * 3) + Math.round(y)) % 3 === 0 ? winM2 : winM);   // 两组窗错开亮灯
    win.userData.glass = glassC; win.position.copy(n).multiplyScalar(half + 0.03).addScaledVector(t, x).setY(y); win.rotation.y = rot; g.add(win);
    const sur = new THREE.Mesh(surroundGeo(wW, wh), M(surC)); sur.position.copy(n).multiplyScalar(half).addScaledVector(t, x).setY(y); sur.rotation.y = rot; sur.castShadow = sur.receiveShadow = true; g.add(sur);
  };
  g.userData.addWindows = (open = { f: true, b: true, l: true, r: true }) => {
    if (!floors.length) return;
    const top = floors.length - 1;
    if (pub) {   // 公共楼（10-14 用户：数量照旧、合并成大窗）：门两边各一扇宽窗，楼上对齐；背面顶层两扇宽窗；两侧顶层各一扇
      for (const y of floors) for (const sx of [-1, 1]) addWin('f', sx * pX, y, pW);
      if (open.b) for (const sx of [-1, 1]) addWin('b', sx * pX, floors[top], pW);
      for (const f of ['l', 'r']) if (open[f] && sideX && top >= 1) addWin(f, 0, floors[top]);
      return;
    }
    // 住家（10-14 用户：住宅少一些窗；少放门正上方的窗，要放就大小一致、上下对齐）：只在正面开，楼上的窗和一楼的门窗上下对齐
    if (!open.f) return;
    if (offDoor) {   // 门在一边：一楼另一边一扇窗；楼上在那扇窗正上方一扇，四分之一的房子门上方也开一扇（同样大小、上下对齐）
      const wxo = winX;   // 三段空白一样宽
      addWin('f', wxo, floors[0]);
      if (top >= 1) { addWin('f', wxo, floors[top]); if (hs % 4 === 0) addWin('f', doorX, floors[top]); }
    } else if (fitsFront) {   // 门居中：一楼两边各一扇，楼上一半的房子在两扇窗正上方各一扇（门正上方不开）
      for (const sx of [-1, 1]) addWin('f', sx * wx, floors[0]);
      if (top >= 1 && hs % 2 === 0) for (const sx of [-1, 1]) addWin('f', sx * wx, floors[top]);
    }
  };
  if (!defer) g.userData.addWindows();
  g.userData.doorTop = dh; g.userData.signW = Math.max(1.2, 2 * ((pub ? pX - pW / 2 : wx - ww / 2) - 0.08) - 0.3); g.userData.upperY = y0 + 2.2 + wh / 2 + 0.2 <= h - 0.3 ? y0 + 2.2 : null;   // 招牌不压窗（town.js）：宽度限在两侧窗套之间；有二楼窗就挂在二楼两扇窗中间，没有就挂在门顶上方   // 招牌等放在门顶上方（town.js）
  // 烟囱：约一半住家有（这次随机数照取，公共建筑只是不画——小镇布局不变）。按烟囱所在处的坡面高度算，从坡面里伸出约 0.6、顶上一道压顶
  if (r() < 0.5 && chimney) {
    const cx = w * 0.25, cz = -d * 0.15, H = h0 * 0.55, ax = Math.max(w, d) * 0.78 / Math.SQRT2 * (w / Math.max(w, d)), az = Math.max(w, d) * 0.78 / Math.SQRT2 * (d / Math.max(w, d));
    const roofY = h + H * (1 - Math.max(Math.abs(cx) / ax, Math.abs(cz) / az)), len = roofY - h + 0.6;
    const ch = new THREE.Mesh(new THREE.BoxGeometry(0.38, len, 0.38), M(0x9a6a55));
    ch.position.set(cx, h + len / 2, cz); ch.castShadow = true; g.add(ch);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.5), M(0x7a5242)); cap.position.set(cx, h + len + 0.05, cz); cap.castShadow = true; g.add(cap);
    ch.userData.chimney = true; ch.userData.top = len / 2 + 0.1;   // 炊烟从烟囱顶冒出（town.js 记位置）
  }
  if (r() < 0.35) {   // 门头雨棚：只盖门（10-14 用户：小学的雨棚横穿一层窗）；公共楼不要（门顶留给招牌），随机数照取、布局不变
    const aw = new THREE.Mesh(new THREE.BoxGeometry(dw + 0.5, 0.08, 0.6), M([0xd46a4c, 0x4a7fc1, 0x3f8f7a, 0xe8b64a][Math.floor(r() * 4)]));
    aw.position.set(doorX, dh + 0.3, d / 2 + 0.3); aw.rotation.x = 0.25; if (!pub) g.add(aw);   // 门头雨棚在门顶上方（原来固定 1.65，门放高后横穿门）
  }
  return g;
}

// 光锥的形状（尖在上、口朝下；贴图 v 从下 0 到上 1，配合 coneTex 上亮下淡）
export function coneGeo() {
  // 贴图第一次用到才画（不开浏览器的检查也会加载本模块）
  if (!lampConeM.map) { lampConeM.map = canvasTexture(4, 64, (x) => { const g = x.createLinearGradient(0, 0, 0, 64); g.addColorStop(0, '#fff'); g.addColorStop(0.45, '#7a7a7a'); g.addColorStop(1, '#000'); x.fillStyle = g; x.fillRect(0, 0, 4, 64); }); lampConeM.needsUpdate = true; }
  return new THREE.ConeGeometry(1.15, 2.9, 16, 1, true);
}
export function lamp(x, z) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.2, 6), M(0x3d4450)); pole.position.y = 1.6; pole.castShadow = true; pole.userData.contact = { w: 0.7, d: 0.7, round: true }; g.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.06), M(0x3d4450)); arm.position.set(0.28, 3.15, 0); g.add(arm);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), lampM); bulb.position.set(0.55, 3.05, 0); g.add(bulb);
  return g;
}

export function tree(r, s = 1) {
  const g = new THREE.Group();
  const t = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * s, 0.22 * s, 1.2 * s, 5), M(0x7a5a3c)); t.userData.contact = { w: 1.5 * s, d: 1.5 * s, round: true };
  t.position.y = 0.6 * s; t.castShadow = true; g.add(t);
  // 秋天：大多还绿，两成开始泛黄、转橙
  const greens = [0x5e9b5a, 0x6fae62, 0x4f8a55, 0x7fb86a], autumn = [0xc9a24a, 0xd08a3a, 0xb8b04e];
  const col = r() < 0.2 ? autumn[Math.floor(r() * autumn.length)] : greens[Math.floor(r() * greens.length)];
  // 树冠都是圆的（10-13 用户：10-06 加的“每四棵一棵塔形树”不是需求，还把老榕树变成了尖锥，撤回）
  const c = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9 * s, 0), M(col, { roughness: TREE_ROUGH }));   // 树冠单独一组（粗糙度作记号），合并后加随风摆动
  c.position.y = 1.8 * s; c.castShadow = true; c.userData.treeTop = true; g.add(c);
  return g;
}

// 爷爷的家：没有屋顶的剖面小屋，屋里的事都能看见