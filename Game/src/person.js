// 程序化人物：低多边形身体 + 步行／张望／坐下等简单动作。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const M = (c) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.8 });
// 同一组里一起动的零件合成一块（颜色写进顶点），每个人从十几次绘制降到六七次
const VC = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8 });
export function mergeGroup(group, skip = new Set()) {
  const parts = group.children.filter(o => o.isMesh && !skip.has(o) && !o.material.transparent);
  if (parts.length < 2) return;
  const geos = parts.map(o => {
    o.updateMatrix();
    const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone());
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    g.applyMatrix4(o.matrix);
    const n = g.attributes.position.count, c = new Float32Array(n * 3), col = o.material.color;
    for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
  });
  const merged = mergeGeometries(geos, false); if (!merged) return;
  parts.forEach(o => group.remove(o));
  const mesh = new THREE.Mesh(merged, VC); mesh.castShadow = true; group.add(mesh);
}

// 看得清他（10-10）：傍晚、夜里、雨雾里给这个人加一圈轮廓光（侧面朝外的面亮起来，低多边形一面一面地亮，像被灯从背后勾了边）、
// 身上略提亮、少吃一点空气雾。只给这一个人用：材质各自复制一份（共用的顶点色材质不动，别人不受影响），绘制次数不变。
// 返回三个强度（每帧由 main.js 的 updateLighting 按时段、下雨设）：rim 轮廓光、lift 提亮（按衣服本色）、fog 空气雾保留多少（1＝照常）
const RIM_CHUNK = `#include <emissivemap_fragment>
  { float rimF = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
    totalEmissiveRadiance += uRimCol * uRim * rimF * rimF * rimF + diffuseColor.rgb * uLift; }`;
function rimCompile(sh) {
  Object.assign(sh.uniforms, this.userData.rimU);
  sh.fragmentShader = 'uniform vec3 uRimCol; uniform float uRim, uLift, uFogK;\n' + sh.fragmentShader
    .replace('#include <emissivemap_fragment>', RIM_CHUNK)
    .replace('#include <fog_fragment>', '#ifdef USE_FOG\n  float fogF = smoothstep(fogNear, fogFar, vFogDepth) * uFogK;\n  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogF);\n#endif');
}
export function glowRim(root, skip = new Set(), color = 0xffe2b0) {
  const U = { uRim: { value: 0 }, uLift: { value: 0 }, uFogK: { value: 1 }, uRimCol: { value: new THREE.Color(color) } };
  root.traverse(o => {
    if (!o.isMesh || skip.has(o) || !o.material?.isMeshStandardMaterial) return;
    o.material = o.material.clone(); o.material.userData.rimU = U; o.material.onBeforeCompile = rimCompile;   // 同一个函数：着色器程序共用一份
  });
  return { rim: U.uRim, lift: U.uLift, fog: U.uFogK };
}

// 造型（09-25 调整）：约 5 头身；不画五官（学《阿尔托的奥德赛》，情绪靠姿态和气泡）；素色；按人物身份给发型和配件：
// hairStyle: short 短发 / perm 烫卷 / pigtails 小辫 / bald 光脑门；hat：鸭舌帽颜色；scarf 红领巾、apron 围裙、backpack 书包（颜色）
// 人物整体比例（10-13 用户：门放高后和房子不协调，改为把人缩小来避免穿模）：所有人一起乘这个数，彼此身高关系不变。
// 爷爷 1.1 倍连帽子约 2.04，最高的邻居约 2.16，门 2.3 起（town-parts DOOR_MIN）
export const PERSON_K = 0.82;
export function makePerson({ shirt = 0x8a6f5a, pants = 0x4d4f5c, hair = 0xdedede, skin = 0xe9c3a0, scale = 1, cane = false, hat = null, glasses = false,
  headR = 0.22, face = false, hairStyle = 'short', scarf = null, apron = null, backpack = null } = {}) {
  const root = new THREE.Group(); root.userData.tag = 'person';
  const body = new THREE.Group(); root.add(body);
  const s = scale * PERSON_K;

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * s, 0.37 * s, 0.95 * s, 7), M(shirt));
  torso.position.y = 1.35 * s; torso.castShadow = true; body.add(torso);
  const hr = headR * s;
  const headPivot = new THREE.Group(); headPivot.position.y = 1.83 * s + hr * 0.95; body.add(headPivot);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(hr, 1), M(skin)); head.castShadow = true; headPivot.add(head);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(hr * 0.4, hr * 0.45, hr * 0.5, 6), M(skin)); neck.position.y = -hr * 0.95; headPivot.add(neck);
  if (hairStyle === 'bald' || hat) {   // 光脑门，或戴帽子：只露出后脑和两鬓一圈
    // 脸在 +z（phi=π/2），留出前面 0.3π 的缺口
    const ring = new THREE.Mesh(new THREE.SphereGeometry(hr * 1.04, 10, 5, Math.PI * 0.72, Math.PI * 1.56, Math.PI * 0.3, Math.PI * 0.32), M(hair));
    headPivot.add(ring);
  } else {
    const hairM = new THREE.Mesh(new THREE.SphereGeometry(hr * 1.05, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.45), M(hair));
    hairM.position.y = 0.02 * s; hairM.rotation.x = -0.3; headPivot.add(hairM);
    if (hairStyle === 'perm') for (let k = 0; k < 7; k++) {   // 烫卷：一圈小卷
      const a = k / 7 * Math.PI * 2, c = new THREE.Mesh(new THREE.IcosahedronGeometry(hr * 0.32, 0), M(hair));
      c.position.set(Math.sin(a) * hr * 0.85, hr * 0.35, Math.cos(a) * hr * 0.85 - hr * 0.1); headPivot.add(c);
    }
    if (hairStyle === 'pigtails') for (const sx of [-1, 1]) {
      const t = new THREE.Mesh(new THREE.IcosahedronGeometry(hr * 0.32, 0), M(hair)); t.position.set(sx * hr * 1.05, -hr * 0.1, -hr * 0.25); headPivot.add(t);
    }
  }
  // 五官放进一组：默认不显示
  const faceG = new THREE.Group(); faceG.visible = face; headPivot.add(faceG);
  // 眼睛（朝 +z）
  for (const ex of [-0.1, 0.1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.035 * s, 5, 4), M(0x2b2a33));
    e.position.set(ex * s, 0.02 * s, hr * 0.92); faceG.add(e);
  }
  // 表情：眉毛与嘴
  const faceM = M(0x5b3a2a);
  const browL = new THREE.Mesh(new THREE.BoxGeometry(0.1 * s, 0.022 * s, 0.02 * s), M(hair === 0xdedede || hair === 0xe8e8e8 ? 0x9a9a9a : hair));
  const browR = browL.clone();
  browL.position.set(-0.1 * s, 0.11 * s, 0.275 * s); browR.position.set(0.1 * s, 0.11 * s, 0.275 * s);
  faceG.add(browL, browR);
  const mouthSmile = new THREE.Mesh(new THREE.TorusGeometry(0.07 * s, 0.014 * s, 4, 10, Math.PI), faceM);
  mouthSmile.rotation.z = Math.PI; mouthSmile.position.set(0, -0.08 * s, 0.27 * s);
  const mouthFlat = new THREE.Mesh(new THREE.BoxGeometry(0.1 * s, 0.018 * s, 0.02 * s), faceM); mouthFlat.position.set(0, -0.1 * s, 0.275 * s);
  const mouthO = new THREE.Mesh(new THREE.TorusGeometry(0.035 * s, 0.013 * s, 4, 10), faceM); mouthO.position.set(0, -0.1 * s, 0.272 * s);
  const mouthSad = mouthSmile.clone(); mouthSad.rotation.z = 0; mouthSad.position.y = -0.13 * s;
  faceG.add(mouthSmile, mouthFlat, mouthO, mouthSad);
  let expr = 'neutral';
  const setExpr = (e) => {
    expr = e;
    mouthSmile.visible = e === 'happy'; mouthFlat.visible = e === 'neutral' || e === 'think';
    mouthO.visible = e === 'worried'; mouthSad.visible = e === 'sad';
    const tilt = e === 'worried' || e === 'sad' ? 0.35 : e === 'think' ? 0.18 : e === 'happy' ? -0.1 : 0;
    browL.rotation.z = -tilt; browR.rotation.z = tilt;
    browL.position.y = browR.position.y = (e === 'happy' ? 0.125 : 0.11) * s;
  };
  setExpr('neutral');
  if (face && glasses) {
    const gm = M(0x2b2a33);
    for (const ex of [-0.1, 0.1]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.065 * s, 0.012 * s, 4, 10), gm);
      ring.position.set(ex * s, 0.03 * s, hr * 0.95); faceG.add(ring);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.07 * s, 0.015 * s, 0.015 * s), gm); bridge.position.set(0, 0.04 * s, 0.29 * s); headPivot.add(bridge);
  }
  if (hat) {   // 鸭舌帽：扁帽顶＋前帽檐
    const h = new THREE.Mesh(new THREE.CylinderGeometry(hr * 1.02, hr * 1.1, hr * 0.42, 8), M(hat));
    h.position.y = hr * 0.72; h.rotation.x = -0.08; headPivot.add(h);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(hr * 1.3, hr * 0.1, hr * 0.7), M(hat)); brim.position.set(0, hr * 0.45, hr * 1.0); headPivot.add(brim);
  }

  if (scarf) {   // 红领巾：胸前一个倒三角
    const sc = new THREE.Mesh(new THREE.ConeGeometry(0.13 * s, 0.26 * s, 3), M(scarf)); sc.rotation.x = Math.PI; sc.rotation.y = Math.PI / 6;
    sc.position.set(0, 1.66 * s, 0.33 * s); body.add(sc);
  }
  if (apron) {
    const ap = new THREE.Mesh(new THREE.BoxGeometry(0.46 * s, 0.62 * s, 0.04 * s), M(apron)); ap.position.set(0, 1.2 * s, 0.34 * s); ap.rotation.x = 0.07; body.add(ap);
  }
  if (backpack) {
    const bp = new THREE.Mesh(new THREE.BoxGeometry(0.5 * s, 0.6 * s, 0.26 * s), M(backpack)); bp.position.set(0, 1.4 * s, -0.46 * s); body.add(bp);
  }
  const mkLimb = (len, rad, col) => {
    const p = new THREE.Group();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad * 0.85, len, 5), M(col));
    m.position.y = -len / 2; m.castShadow = true; p.add(m); return p;
  };
  const legL = mkLimb(0.85 * s, 0.13 * s, pants); legL.position.set(-0.16 * s, 0.88 * s, 0); body.add(legL);
  const legR = mkLimb(0.85 * s, 0.13 * s, pants); legR.position.set(0.16 * s, 0.88 * s, 0); body.add(legR);
  const armL = mkLimb(0.75 * s, 0.085 * s, shirt); armL.position.set(-0.37 * s, 1.72 * s, 0); body.add(armL);
  const armR = mkLimb(0.75 * s, 0.085 * s, shirt); armR.position.set(0.37 * s, 1.72 * s, 0); body.add(armR);
  for (const a of [armL, armR]) { const hand = new THREE.Mesh(new THREE.IcosahedronGeometry(0.075 * s, 0), M(skin)); hand.position.y = -0.78 * s; a.add(hand); }
  for (const leg of [legL, legR]) {
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.2 * s, 0.12 * s, 0.34 * s), M(0x3a3230));
    shoe.position.set(0, -0.86 * s, 0.06 * s); leg.add(shoe);
  }
  let caneMesh = null;
  if (cane) {
    caneMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.3 * s, 5), M(0x6b4a2f));
    caneMesh.position.set(0, -0.62 * s, 0.12 * s); armR.add(caneMesh);
  }
  // 影子圆片（便于俯视时看清位置）
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.55 * s, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.17; root.add(shadow);

  // 手里拿的东西
  const props = {};
  const mkProp = (name, mesh) => { mesh.visible = false; armL.add(mesh); props[name] = mesh; };
  { const g = new THREE.Group();
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.34 * s, 0.4 * s, 0.2 * s), M(0xe8e0c8)); bag.position.y = -0.95 * s; g.add(bag);
    const veg = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1 * s, 0), M(0xe0513a)); veg.position.set(0.05 * s, -0.72 * s, 0); g.add(veg);
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.05 * s, 0.25 * s, 4), M(0x5fa36b)); leaf.position.set(-0.07 * s, -0.68 * s, 0); g.add(leaf);
    mkProp('bag', g); }
  { const box = new THREE.Mesh(new THREE.BoxGeometry(0.36 * s, 0.1 * s, 0.36 * s), M(0x9c5b3b)); box.position.set(0, -0.8 * s, 0.1 * s); mkProp('chess', box); }
  { const env = new THREE.Mesh(new THREE.BoxGeometry(0.3 * s, 0.2 * s, 0.03 * s), M(0xf6ecdd)); env.position.set(0, -0.8 * s, 0.1 * s); mkProp('letter', env); }
  { const u = new THREE.Group();
    // 伞面罩在头顶正上方、半径 0.55 倍（10-13 用户：伞半个穿墙——原来半径 0.75 又偏到身子一侧 0.3，沿人行道走伸出 1.1，比墙还远）；伞杆从手斜到伞面中心
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.72 * s, 0.38 * s, 8), M(0x4a7fc1)); canopy.position.set(0.3 * s, 2.6 * s, 0); u.add(canopy);   // 10-14 用户：伞太小——半径 0.55→0.72（比肩宽一圈；再大沿人行道走会穿进墙，盖得住人；仍罩在头顶正上方，不偏到一侧）
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.02 * s, 0.02 * s, 1.24 * s, 4), M(0x333333)); stick.position.set(0.15 * s, 1.95 * s, 0); stick.rotation.z = -Math.atan2(0.3, 1.2); u.add(stick);
    u.position.x = -0.3 * s; u.visible = false; body.add(u); props.umbrella = u; }

  // 合并：头部、身体、四肢（手里临时拿的东西、雨伞、五官不合并）
  { const skip = new Set(); for (const pr of Object.values(props)) pr.traverse(o => skip.add(o));
    for (const g of [headPivot, body, legL, legR, armL, armR]) mergeGroup(g, skip); }
  let t = 0;
  const api = {
    setProp(name) { for (const [k, m] of Object.entries(props)) if (k !== 'umbrella') m.visible = k === name; },
    setUmbrella(on) { props.umbrella.visible = on; },
    umbrella: props.umbrella,
    setExpr(e) { if (e !== expr) setExpr(e); },
    root, headPivot, body,
    anim: 'idle', speed: 1, scale: s,
    // 以世界坐标朝向某点
    face(target, dt = 1) {
      const dx = target.x - root.position.x, dz = target.z - root.position.z;
      if (dx * dx + dz * dz < 1e-4) return;
      const want = Math.atan2(dx, dz);
      let d = want - root.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
      root.rotation.y += d * Math.min(1, dt * 10);
    },
    update(dt) {
      t += dt;
      const a = api.anim;
      const stoop = cane ? 0.12 : 0.04;
      body.rotation.x = stoop;
      if (a === 'walk' || a === 'hurry') {   // hurry：慌着走（10-06）——步子快一点、边走边左右张望
        const f = (a === 'hurry' ? 8.5 : 7) * api.speed;
        const sw = Math.sin(t * f) * 0.5;
        legL.rotation.x = sw; legR.rotation.x = -sw;
        armL.rotation.x = -sw * 0.7; armR.rotation.x = cane ? 0.25 + sw * 0.2 : sw * 0.7;
        body.position.y = Math.abs(Math.cos(t * f)) * 0.06 * s;
        body.rotation.z = Math.sin(t * f) * 0.035;                 // 左右重心
        body.rotation.y = Math.sin(t * f) * 0.06;                  // 肩膀微转
        headPivot.rotation.y = a === 'hurry' ? Math.sin(t * 2.6) * 0.55 : headPivot.rotation.y * 0.9;
        headPivot.rotation.x = 0.06 + Math.abs(Math.sin(t * f)) * 0.03;
      } else {
        body.rotation.z *= 0.85; body.rotation.y *= 0.85;
        legL.rotation.x *= 0.85; legR.rotation.x *= 0.85;
        armL.rotation.x *= 0.85; armR.rotation.x = armR.rotation.x * 0.85 + (cane ? 0.25 : 0) * 0.15;
        body.position.y *= 0.8;
        if (a === 'look') {
          headPivot.rotation.y = Math.sin(t * 1.8) * 0.8;
          armL.rotation.z = 0;
        } else if (a === 'worried') {
          headPivot.rotation.y = Math.sin(t * 3.2) * 0.5;
          headPivot.rotation.x = 0.25;
          armL.rotation.x = -0.9 + Math.sin(t * 2) * 0.1;
        } else if (a === 'happy') {
          body.position.y = Math.abs(Math.sin(t * 3.6)) * 0.045 * s;   // 人物表现力（10-06）：含蓄一些——轻轻点动、手微微抬起摆（原来连蹦带挥，用户嫌“蹦蹦跳跳”）
          armL.rotation.z = -0.35 - Math.sin(t * 3.6) * 0.15; armL.rotation.x = -0.25;
          headPivot.rotation.y *= 0.9; headPivot.rotation.x = -0.12;
        } else if (a === 'wave') {
          armL.rotation.z = -2.4 + Math.sin(t * 9) * 0.35;
          headPivot.rotation.y *= 0.9;
        } else if (a === 'eat') {
          armL.rotation.x = -2.2 + Math.sin(t * 2) * 0.15; armL.rotation.z = -0.3;
          headPivot.rotation.x = -0.05;
        } else if (a === 'cook') {
          armL.rotation.x = -1.1 + Math.sin(t * 5) * 0.25; armL.rotation.z = Math.cos(t * 5) * 0.25;
          headPivot.rotation.x = 0.3; headPivot.rotation.y = 0;
        } else if (a === 'taichi') {   // 打太极：两臂慢慢划圈，身子轻转
          armL.rotation.z = -0.7 - Math.sin(t * 1.1) * 0.5; armR.rotation.z = 0.7 + Math.sin(t * 1.1 + 0.6) * 0.5;
          armL.rotation.x = -0.6 + Math.cos(t * 1.1) * 0.4; armR.rotation.x = -0.6 + Math.cos(t * 1.1 + 0.6) * 0.4;
          body.rotation.y = Math.sin(t * 0.55) * 0.45; body.position.y = -Math.abs(Math.sin(t * 0.55)) * 0.06 * s;
        } else if (a === 'sweep') {    // 扫地：弯腰，两手一起前后摆
          body.rotation.x = 0.35; armL.rotation.x = -0.7 + Math.sin(t * 3.5) * 0.45; armR.rotation.x = -0.7 + Math.sin(t * 3.5) * 0.45;
          headPivot.rotation.x = 0.25;
        } else if (a === 'chess') {   // 下棋：身子前倾看棋盘；每隔几秒伸手落一子，偶尔点点头（两人按体型错开节奏，像你一步我一步）
          const ph = (t + s * 3.1) % 5.5, reach = ph < 0.9 ? Math.sin(ph / 0.9 * Math.PI) : 0;
          body.rotation.x = stoop + 0.14;
          armR.rotation.x = -0.45 - reach * 0.9;
          headPivot.rotation.x = 0.3 - (ph > 3 && ph < 3.6 ? Math.sin((ph - 3) / 0.6 * Math.PI) * 0.15 : 0);
          headPivot.rotation.y = Math.sin(t * 0.4 + s) * 0.12;
        } else if (a === 'puzzled') {   // 困惑（10-06 人物表现力）：歪头，一只手抬到头边轻轻挠
          headPivot.rotation.z = 0.28 + Math.sin(t * 1.3) * 0.05; headPivot.rotation.y = Math.sin(t * 0.9) * 0.25;
          armL.rotation.x = -2.75 + Math.sin(t * 6) * 0.08; armL.rotation.z = 0.45;   // 手往上抬、往头那边收（z 为正＝向内）
        } else if (a === 'relief') {    // 松一口气：身子放松挺直，缓缓点两下头
          body.rotation.x = stoop - 0.04; body.position.y = Math.sin(t * 2.2) * 0.02 * s;
          headPivot.rotation.x = Math.max(0, Math.sin(t * 3.4)) * 0.22; headPivot.rotation.y *= 0.9;
        } else if (a === 'phone') {
          armR.rotation.x = -2.4; armR.rotation.z = 0.4;
          headPivot.rotation.x = 0.1; headPivot.rotation.y = Math.sin(t * 0.8) * 0.2;
        } else {
          headPivot.rotation.y *= 0.92; headPivot.rotation.x *= 0.9;
          armL.rotation.z *= 0.85;
          body.position.y = Math.sin(t * 1.6) * 0.012 * s;
        }
        if (a !== 'worried' && a !== 'chess' && a !== 'relief') headPivot.rotation.x *= 0.9;
        if (a !== 'puzzled') headPivot.rotation.z *= 0.88;
        if (a !== 'phone' && a !== 'taichi') armR.rotation.z *= 0.85;
        if (a !== 'happy' && a !== 'wave' && a !== 'look' && a !== 'eat' && a !== 'cook' && a !== 'taichi' && a !== 'puzzled') armL.rotation.z *= 0.85;
        if (a !== 'eat' && a !== 'cook' && a !== 'worried' && a !== 'taichi' && a !== 'sweep' && a !== 'puzzled') armL.rotation.x *= 0.85;
      }
    },
  };
  return api;
}
