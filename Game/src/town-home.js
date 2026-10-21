// 爷爷的家（由 town.js 拆出，09-27）：没有屋顶的剖面小屋，屋里的事都能看见。
import * as THREE from 'three';
import { M, tree, winM } from './town-parts.js';

export function buildHome(g, r) {
  const wallM = M(0xf4e3c8), trimM = M(0xc98f62), floorM = M(0xd9b98c);
  const add = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
  add(new THREE.BoxGeometry(7.2, 0.25, 6.2), floorM, 0, 0.13, 0);
  for (let i = -3; i <= 3; i++) add(new THREE.BoxGeometry(0.04, 0.02, 6.2), M(0xc4a276), i, 0.27, 0);
  add(new THREE.BoxGeometry(7.2, 3.1, 0.25), wallM, 0, 1.55, -3).userData.solid = 'homeWall';           // 后墙
  add(new THREE.BoxGeometry(0.25, 3.1, 6.2), wallM, -3.6, 1.55, 0).userData.solid = 'homeWall';          // 左墙
  add(new THREE.BoxGeometry(0.25, 3.1, 3.4), wallM, 3.6, 1.55, -1.4).userData.solid = 'homeWall';        // 右墙（留门，门洞 z 0.3—2.1）
  add(new THREE.BoxGeometry(0.25, 3.1, 1.0), wallM, 3.6, 1.55, 2.6).userData.solid = 'homeWall';
  add(new THREE.BoxGeometry(0.25, 0.75, 1.8), wallM, 3.6, 2.725, 1.2);         // 门楣（10-13：门 2.35，爷爷连帽子约 2.04，进出门不碰门框）
  add(new THREE.BoxGeometry(7.2, 0.5, 0.25), wallM, 0, 0.5, 3).userData.solid = 'homeWall';             // 前面矮墙
  add(new THREE.BoxGeometry(7.4, 0.18, 0.4), trimM, 0, 3.15, -3);
  add(new THREE.BoxGeometry(0.4, 0.18, 6.4), trimM, -3.6, 3.15, 0);
  add(new THREE.BoxGeometry(0.4, 0.18, 6.4), trimM, 3.6, 3.15, 0);
  // 窗（后墙）
  add(new THREE.BoxGeometry(1.4, 0.9, 0.05), winM, -1.2, 1.8, -2.86);
  // 家具
  const wood = M(0x9c6b43), dark = M(0x5b4632), white = M(0xf2f2ee);
  add(new THREE.CylinderGeometry(0.9, 0.9, 0.08, 16), wood, 0.5, 0.85, 0.2);  // 餐桌
  add(new THREE.CylinderGeometry(0.12, 0.2, 0.75, 8), dark, 0.5, 0.45, 0.2);
  add(new THREE.BoxGeometry(0.55, 0.08, 0.55), wood, 0.5, 0.55, 1.35);       // 椅子
  add(new THREE.BoxGeometry(0.55, 0.6, 0.08), wood, 0.5, 0.85, 1.62);
  add(new THREE.BoxGeometry(1.8, 0.9, 0.8), M(0xe3dccf), -2.5, 0.55, -2.4);  // 灶台
  add(new THREE.BoxGeometry(1.8, 0.06, 0.8), dark, -2.5, 1.02, -2.4);
  const pot = add(new THREE.CylinderGeometry(0.3, 0.26, 0.3, 12), M(0x8a8f99), -2.8, 1.2, -2.4);
  add(new THREE.BoxGeometry(0.8, 1.9, 0.8), white, -3.0, 1.1, 0.9);         // 冰箱
  add(new THREE.BoxGeometry(1.0, 0.8, 0.6), wood, 2.7, 0.55, -2.5);          // 电话柜
  add(new THREE.BoxGeometry(0.35, 0.12, 0.25), M(0xd9534f), 2.7, 1.02, -2.5); // 电话
  add(new THREE.BoxGeometry(1.4, 0.6, 0.9), M(0x7d8f6a), -1.7, 0.55, 1.9);   // 沙发
  add(new THREE.BoxGeometry(1.4, 0.7, 0.25), M(0x6f7f5e), -1.7, 1.0, 2.3);
  add(new THREE.BoxGeometry(1.2, 0.08, 0.35), wood, -0.4, 1.5, -2.8);         // 搁板
  add(new THREE.CylinderGeometry(0.14, 0.14, 0.3, 8), M(0xffffff), 0.25, 1.04, 0.05); // 药瓶
  add(new THREE.CylinderGeometry(0.15, 0.15, 0.06, 8), M(0xd9534f), 0.25, 1.21, 0.05);
  add(new THREE.BoxGeometry(0.6, 0.7, 0.03), M(0xf6ecdd), 1.6, 1.7, -2.85);  // 普通小挂历
  // 大门：合页在门洞一侧，有人进出时才打开
  const doorPivot = new THREE.Group(); doorPivot.position.set(3.72, 0, 0.3); g.add(doorPivot);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.35, 1.8), M(0x9c5b3b)); door.position.set(0, 1.175, 0.9); door.castShadow = true; doorPivot.add(door);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), M(0xe8b64a)); knob.position.set(0.06, 1.05, 1.6); doorPivot.add(knob);
  add(new THREE.BoxGeometry(0.9, 0.08, 1.4), M(0xa3927c), 4.2, 0.04, 1.2);  // 门口踏垫
  // 屋顶：平时盖着，镜头靠近看屋里时淡出
  const roofM = new THREE.MeshStandardMaterial({ color: 0xb5533c, flatShading: true, roughness: 0.8, transparent: true, opacity: 1 });
  const roof = new THREE.Group(); roof.position.y = 3.2; g.add(roof);
  const slope = Math.atan2(1.4, 3.5), len = Math.hypot(1.4, 3.5) + 0.2;
  for (const side of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(7.9, 0.14, len), roofM);
    panel.position.set(0, 0.7, side * 1.7); panel.rotation.x = side * slope; panel.castShadow = true; roof.add(panel);
  }
  const gableGeo = new THREE.BufferGeometry();
  gableGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -3.1, 0, 0, 3.1, 0, 1.4, 0], 3)); gableGeo.computeVertexNormals();
  const gableM = new THREE.MeshStandardMaterial({ color: 0xf4e3c8, flatShading: true, side: THREE.DoubleSide, transparent: true, opacity: 1 });
  for (const x of [-3.6, 3.6]) { const gm = new THREE.Mesh(gableGeo, gableM); gm.position.x = x; roof.add(gm); }
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.2, 0.5), roofM); chimney.position.set(-2, 1.2, -1.2); roof.add(chimney);
  const chimCap = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.14, 0.68), roofM); chimCap.position.set(-2, 1.87, -1.2); roof.add(chimCap);   // 压顶：和城里的烟囱一个样子（用屋顶材质，拉近时一起淡出）
  tree(r, 1);   // 地基（10-05）：家这个街区挤，树干压在人行道上，不再摆进场景；照样生成，随机数不变、别处布局不变

  // 支持的实物（放置后显示）
  const props = {};
  const prop = (name, geo, mat, x, y, z) => { const m = add(geo, mat, x, y, z); m.visible = false; props[name] = m; return m; };
  prop('pillbox', new THREE.BoxGeometry(0.7, 0.1, 0.3), M(0x3f8f7a), 0.85, 0.95, 0.3);
  prop('note', new THREE.BoxGeometry(0.05, 0.5, 0.45), M(0xfff3a8), 3.47, 1.5, -0.3);
  const cal = prop('calendar', new THREE.BoxGeometry(1.0, 1.2, 0.05), M(0xffffff), 1.6, 1.75, -2.82);
  add(new THREE.BoxGeometry(1.0, 0.3, 0.06), M(0xd9534f), 0, 0.45, 0.01, cal);
  prop('stove', new THREE.CylinderGeometry(0.16, 0.16, 0.1, 12), M(0xd9534f), -1.8, 1.1, -2.2);
  const radio = prop('song', new THREE.BoxGeometry(0.5, 0.3, 0.2), M(0x8a6fc1), -0.6, 1.7, -2.8);
  add(new THREE.CylinderGeometry(0.08, 0.08, 0.03, 10), M(0x2b2a33), 0.12, 0, 0.11, radio).rotation.x = Math.PI / 2;
  prop('pact', new THREE.BoxGeometry(0.4, 0.4, 0.03), M(0x9fd3e8), 2.7, 1.5, -2.84);
  const ph = prop('photo', new THREE.BoxGeometry(0.8, 0.6, 0.05), M(0x8c6e5d), 0.5, 1.95, -2.84);   // 老照片：木框
  add(new THREE.BoxGeometry(0.64, 0.44, 0.02), M(0xd8c49c), 0, 0, 0.03, ph);
  // 站位（家里的局部坐标）
  const spots = {
    chair: new THREE.Vector3(0.5, 0, 1.3), table: new THREE.Vector3(0.5, 0, 1.05), stove: new THREE.Vector3(-2.5, 0, -1.6),
    phone: new THREE.Vector3(2.5, 0, -1.7), calendar: new THREE.Vector3(1.6, 0, -2.1), photo: new THREE.Vector3(0.5, 0, -2.1), sofa: new THREE.Vector3(-1.7, 0, 1.3),
    doorIn: new THREE.Vector3(2.8, 0, 1.2), doorOut: new THREE.Vector3(4.6, 0, 1.2), fridge: new THREE.Vector3(-2.2, 0, 0.9),
  };
  g.userData = { props, spots, pot, doorPivot, roof, roofMats: [roofM, gableM] };
}
