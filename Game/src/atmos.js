// 画面氛围（参考《阿尔托的奥德赛》）：落叶、炊烟、鸟群。全部用实例化网格，每类只占一次绘制。
import * as THREE from 'three';
import { canvasTexture, rng } from './util.js';

const frnd = rng(77);   // 自己的随机数（10-06）：这里的效果随时间取随机数，用全局 Math.random 会改变游戏内容（菜摊、关卡）取到的随机数，截图比对就不稳

const hash = (n) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };

export function makeAtmos(scene, { chimneys = [], treeTops = [] } = {}) {
  const dummy = new THREE.Object3D(), col = new THREE.Color();

  // 落叶：小三角，黄橙赭，从树冠附近飘下，随风打转
  const LEAF_MAX = 60;
  const leafGeo = new THREE.BufferGeometry();
  leafGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.22, 0, 0.08, 0.06, 0, 0.24, 0, 0, 0, 0.06, 0, 0.24, 0.22, 0, 0.08], 3));
  leafGeo.computeVertexNormals();
  const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), LEAF_MAX);
  leaves.frustumCulled = false; scene.add(leaves);
  const leafCols = [0xd9a441, 0xd08a3a, 0xb86a35, 0xc9b04e];
  const L = [];
  for (let i = 0; i < LEAF_MAX; i++) { leaves.setColorAt(i, col.setHex(leafCols[i % 4])); L.push({ p: new THREE.Vector3(), t: -frnd() * 6, life: 0, seed: frnd() * 100 }); }
  const spawnLeaf = (l, center) => {
    const near = treeTops.filter(v => Math.abs(v.x - center.x) < 45 && Math.abs(v.z - center.z) < 35);
    const src = near.length ? near[Math.floor(frnd() * near.length)] : center;
    l.p.set(src.x + (frnd() - 0.5) * 1.6, (src.y || 2) + 0.4, src.z + (frnd() - 0.5) * 1.6);
    l.t = 0; l.life = 5 + frnd() * 4; l.seed = frnd() * 100;
  };

  // 炊烟：烟囱冒出的小方块，上升、变大、变淡（饭点）
  const SMOKE_MAX = 70;
  const smoke = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshLambertMaterial({ color: 0xe8e4dc, transparent: true, opacity: 0.7, depthWrite: false }), SMOKE_MAX);
  smoke.frustumCulled = false; scene.add(smoke);
  const S = Array.from({ length: SMOKE_MAX }, () => ({ p: new THREE.Vector3(), t: 1, life: 1, from: 0 }));
  const smokeHouses = chimneys.filter((_, i) => hash(i) < 0.6);   // 六成人家在做饭
  let smokeAcc = 0, smokeIdx = 0;

  // 鸟群：几只“人”字形小鸟，隔一阵从天上掠过
  const birdGeo = new THREE.BufferGeometry();
  birdGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.15, -0.55, 0.12, -0.1, 0, 0, -0.1, 0, 0, 0.15, 0, 0, -0.1, 0.55, 0.12, -0.1], 3));
  birdGeo.computeVertexNormals();
  const BIRD_N = 7;
  const birds = new THREE.InstancedMesh(birdGeo, new THREE.MeshBasicMaterial({ color: 0x3a3a44, side: THREE.DoubleSide }), BIRD_N);
  birds.frustumCulled = false; scene.add(birds);
  const flock = { on: false, wait: 8, t: 0, from: new THREE.Vector3(), dir: new THREE.Vector3(), n: 5 };

  let leafN = LEAF_MAX, smokeN = SMOKE_MAX, birdsOn = true;
  return {
    setTier(tier) { leafN = [0, 18, 40, 60][tier]; smokeN = [0, 30, 55, 70][tier]; birdsOn = tier >= 2; },
    update(dt, time, raining, center, wind = 1) {
      // 落叶（雨天少一些、落得快）
      const n = raining ? Math.floor(leafN * 0.4) : leafN;
      for (let i = 0; i < LEAF_MAX; i++) {
        const l = L[i];
        if (i >= n) { dummy.position.set(0, -50, 0); dummy.updateMatrix(); leaves.setMatrixAt(i, dummy.matrix); continue; }
        l.t += dt;
        if (l.t < 0) { dummy.position.set(0, -50, 0); dummy.updateMatrix(); leaves.setMatrixAt(i, dummy.matrix); continue; }
        if (l.life === 0 || l.t > l.life || l.p.y < 0.15) spawnLeaf(l, center);
        const k = l.seed + l.t;
        l.p.x += (Math.sin(k * 1.7) * 0.6 + 0.8 * wind) * dt;
        l.p.z += Math.cos(k * 1.3) * 0.5 * dt;
        l.p.y -= (raining ? 1.4 : 0.55 + Math.sin(k * 2.1) * 0.25) * dt;
        dummy.position.copy(l.p);
        dummy.rotation.set(Math.sin(k * 3) * 1.2, k * 2, Math.cos(k * 2.6) * 1.2);
        const fade = Math.min(1, l.t * 2, (l.life - l.t) * 1.5);
        dummy.scale.setScalar(Math.max(0.01, fade));
        dummy.updateMatrix(); leaves.setMatrixAt(i, dummy.matrix);
      }
      leaves.instanceMatrix.needsUpdate = true;

      // 炊烟：早 6:30—8:00、午 11:00—12:30、晚 17:00—19:00
      const meal = (time > 390 && time < 480) || (time > 660 && time < 750) || (time > 1020 && time < 1140);
      if (meal && smokeHouses.length && smokeN) {
        smokeAcc += dt * smokeHouses.length * 0.35;
        while (smokeAcc > 1) {
          smokeAcc--;
          const s = S[smokeIdx]; smokeIdx = (smokeIdx + 1) % smokeN;
          const src = smokeHouses[Math.floor(frnd() * smokeHouses.length)];
          s.p.copy(src).add(new THREE.Vector3((frnd() - 0.5) * 0.2, 0, (frnd() - 0.5) * 0.2)); s.t = 0; s.life = 3 + frnd() * 2;
        }
      }
      for (let i = 0; i < SMOKE_MAX; i++) {
        const s = S[i]; s.t += dt;
        if (i >= smokeN || s.t > s.life) { dummy.position.set(0, -50, 0); dummy.scale.setScalar(0.01); }
        else {
          s.p.y += dt * 0.9; s.p.x += dt * 0.35 * wind;
          const u = s.t / s.life;
          dummy.position.copy(s.p); dummy.rotation.set(u * 2, u * 3, 0);
          dummy.scale.setScalar(0.5 + u * 1.6 * (1 - u * 0.6));
        }
        dummy.updateMatrix(); smoke.setMatrixAt(i, dummy.matrix);
      }
      smoke.instanceMatrix.needsUpdate = true;
      smoke.material.opacity = raining ? 0.35 : 0.6;

      // 鸟群：白天、不下雨时，每隔 20—40 秒掠过一次
      if (!flock.on) {
        flock.wait -= dt;
        if (flock.wait < 0 && birdsOn && !raining && time > 400 && time < 1110) {
          const a = frnd() * Math.PI * 2;
          flock.dir.set(Math.cos(a), 0, Math.sin(a));
          flock.from.copy(center).addScaledVector(flock.dir, -55).setY(18 + frnd() * 6);
          flock.on = true; flock.t = 0; flock.n = 4 + Math.floor(frnd() * 4);
        }
      }
      for (let i = 0; i < BIRD_N; i++) {
        if (!flock.on || i >= flock.n) { dummy.position.set(0, -50, 0); dummy.scale.setScalar(0.01); dummy.updateMatrix(); birds.setMatrixAt(i, dummy.matrix); continue; }
        const row = Math.ceil(i / 2), side = i % 2 ? 1 : -1;   // 人字队形
        const px = -flock.dir.z * side * row * 1.4, pz = flock.dir.x * side * row * 1.4;
        dummy.position.copy(flock.from).addScaledVector(flock.dir, flock.t * 9 - row * 1.3).add(new THREE.Vector3(px, Math.sin(flock.t * 2 + i) * 0.3, pz));
        dummy.rotation.set(0, Math.atan2(flock.dir.x, flock.dir.z), 0);
        const flap = 0.6 + Math.abs(Math.sin(flock.t * 9 + i * 0.7)) * 0.7;
        dummy.scale.set(1.3, flap * 1.3, 1.3);
        dummy.updateMatrix(); birds.setMatrixAt(i, dummy.matrix);
      }
      if (flock.on) { flock.t += dt; if (flock.t > 13) { flock.on = false; flock.wait = 20 + frnd() * 20; } }
      birds.instanceMatrix.needsUpdate = true;
    },
  };
}

// 天上的日盘、月亮和星星：只在镜头放低、能看见天际时才看得到（标题画面、静观）
export function makeSkyBodies(scene) {
  const glowTex = (inner, outer) => canvasTexture(128, 128, (x) => {
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, inner); g.addColorStop(0.22, inner); g.addColorStop(0.26, outer); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  });
  const mk = (tex, size) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false })); s.scale.setScalar(size); s.renderOrder = -1; scene.add(s); return s; };
  const sunS = mk(glowTex('rgba(255,250,235,1)', 'rgba(255,220,170,.45)'), 120);
  const moonS = mk(glowTex('rgba(240,244,255,1)', 'rgba(190,205,255,.25)'), 60);
  // 星星
  const N = 420, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const a = frnd() * Math.PI * 2, e = 0.06 + frnd() * 0.9;
    pos.set([Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)], i * 3);
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xfff8e8, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  stars.renderOrder = -1; scene.add(stars);
  const dir = new THREE.Vector3();
  return {
    // k：6:00→19:00 的进度；night：0—1
    update(camera, k, night, sunColor) {
      const elev = THREE.MathUtils.degToRad(2 + 26 * Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, k))), 2));
      dir.set(Math.cos(Math.PI * k), 0, -0.45).normalize();
      dir.multiplyScalar(Math.cos(elev)).setY(Math.sin(elev));
      sunS.position.copy(camera.position).addScaledVector(dir, 300);
      sunS.material.color.copy(sunColor); sunS.material.opacity = 1 - night;
      sunS.visible = night < 0.98;
      dir.set(-0.5, 0, -0.8).normalize().multiplyScalar(Math.cos(0.35)).setY(Math.sin(0.35));
      moonS.position.copy(camera.position).addScaledVector(dir, 300);
      moonS.material.opacity = night; moonS.visible = night > 0.02;
      stars.position.copy(camera.position); stars.scale.setScalar(320);
      stars.material.opacity = night * 0.9; stars.visible = night > 0.02;
    },
  };
}
