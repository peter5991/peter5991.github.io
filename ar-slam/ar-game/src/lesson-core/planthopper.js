// planthopper.js — 程序化褐飞虱(低多边形卡通),零模型资产
// 体坐标:+z = 头向, +y = 背向, 体长 ≈ 1;左右件统一 scale.x = side 镜像,
// 镜像后绕 y/z 轴的转角需乘 side,绕 x 轴不变。
// 姿态全部由 pose({ gait, flap, feed, stand }, T) 闭式写入,rest 姿态 = 全参数 0。
import * as THREE from '../../vendor/three.module.js?v=20261011155356';
import { toon, outline, textTex } from './toon.js?v=20261011155356';

const flat = (g) => { const n = g.toNonIndexed(); n.computeVertexNormals(); return n; };

function blob(mat, sx, sy, sz, x, y, z, seg = [8, 6]) {
  const m = new THREE.Mesh(flat(new THREE.SphereGeometry(0.5, seg[0], seg[1])), mat);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  return m;
}

// 沿 +x 伸出的肢段(原点 = 关节)
function seg(len, r0, r1, mat) {
  const g = new THREE.Group();
  const c = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 5), mat);
  c.rotation.z = -Math.PI / 2;
  c.position.x = len / 2;
  g.add(c);
  return g;
}

let wingTex = null;
function getWingTex() {
  if (wingTex) return wingTex;
  // 前翅:半透明琥珀 + 纵脉 + 翅脉颗粒,u∈[0,0.22]→x 外展,v∈[0,1]→翅长
  wingTex = textTex(64, 256, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(214,176,112,0.85)');
    g.addColorStop(1, 'rgba(236,214,170,0.55)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(92,60,30,0.85)'; c.lineWidth = 2.2;
    for (const x0 of [0.18, 0.45, 0.72]) {
      c.beginPath(); c.moveTo(w * x0, 0);
      c.quadraticCurveTo(w * (x0 + 0.08), h * 0.5, w * (x0 + 0.02), h * 0.97); c.stroke();
    }
    c.fillStyle = 'rgba(80,50,26,0.9)';
    for (let i = 0; i < 14; i++) c.fillRect(w * (0.2 + 0.5 * ((i * 37) % 11) / 11), h * (0.08 + i * 0.06), 2, 2);
  });
  wingTex.repeat.set(1 / 0.22, 1);
  return wingTex;
}

function wingGeometry() {
  // 形状在 xy 平面(x 外展、y 沿翅长),rotateX(-π/2) 后翅长指向 -z(体后)
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(0.12, 0.04, 0.21, 0.4, 0.19, 0.86);
  s.bezierCurveTo(0.17, 1.0, 0.05, 1.02, 0.0, 0.92);
  s.lineTo(0, 0);
  return new THREE.ShapeGeometry(s, 8).rotateX(-Math.PI / 2);
}

export function buildPlanthopper({ nymph = false } = {}) {
  const C = nymph
    ? { head: '#ecdcaa', thorax: '#f1e3b8', abdomen: '#e2cc92', eye: '#9b3a26', leg: '#e6d4a2' }
    : { head: '#c99a52', thorax: '#dcb56a', abdomen: '#5e3d22', eye: '#7a2618', leg: '#c8a265' };
  const mHead = toon(C.head), mThorax = toon(C.thorax), mAbd = toon(C.abdomen);
  const mEye = toon(C.eye), mLeg = toon(C.leg);
  const OUT = 0x2e2a33;

  const root = new THREE.Group();
  const body = new THREE.Group(); // 呼吸起伏挂在 body 上
  root.add(body);

  // 腹部:成虫被翅覆盖、末端露出;若虫胖短且有节纹感
  const abd = nymph
    ? blob(mAbd, 0.34, 0.26, 0.56, 0, -0.01, -0.14)
    : blob(mAbd, 0.3, 0.22, 0.62, 0, -0.03, -0.12);
  outline(abd, 1.06, OUT);
  body.add(abd);
  const thorax = blob(mThorax, 0.3, 0.2, 0.3, 0, 0.03, 0.2);
  outline(thorax, 1.06, OUT);
  body.add(thorax);

  // 头 = 颈部 pivot(取食时低头)
  const head = new THREE.Group();
  head.position.set(0, 0.02, 0.32);
  body.add(head);
  const skull = blob(mHead, 0.24, 0.16, 0.16, 0, 0, 0.06);
  outline(skull, 1.07, OUT);
  head.add(skull);
  // 头顶纵脊(褐飞虱识别点之一:头顶与前胸背板的浅色纵脊)
  const keel = blob(toon('#f3dfa6'), 0.05, 0.06, 0.3, 0, 0.09, 0.0, [5, 4]);
  head.add(keel);
  for (const side of [-1, 1]) {
    const eye = blob(mEye, 0.1, 0.11, 0.1, side * 0.12, 0.01, 0.05, [7, 5]);
    outline(eye, 1.08, OUT);
    head.add(eye);
    // 触角:粗短两节 + 细芒
    const ant = seg(0.07, 0.024, 0.02, mHead);
    ant.position.set(side * 0.09, 0.02, 0.11);
    ant.scale.x = side;
    ant.rotation.y = -side * 0.95;
    ant.rotation.z = -side * -0.35;
    const arista = seg(0.12, 0.006, 0.004, toon('#4a3020'));
    arista.position.x = 0.07;
    arista.rotation.z = 0.3;
    ant.add(arista);
    head.add(ant);
    head.userData['ant' + side] = ant;
  }
  // 口针(取食时伸出,扎向稻秆 = -y)
  const stylet = new THREE.Mesh(new THREE.ConeGeometry(0.018, 1, 5).translate(0, -0.5, 0), toon('#3d2818'));
  stylet.position.set(0, -0.07, 0.12);
  stylet.rotation.x = -0.35;
  stylet.scale.y = 0.001;
  head.add(stylet);

  // 前翅(成虫长翅型):屋脊状合拢,超过腹末
  const wings = [];
  if (!nymph) {
    const geo = wingGeometry();
    const mat = toon(0xffffff, { map: getWingTex(), transparent: true, side: THREE.DoubleSide, depthWrite: false });
    for (const side of [-1, 1]) {
      const hinge = new THREE.Group();
      hinge.position.set(side * 0.05, 0.13, 0.27);
      hinge.scale.x = side;
      const w = new THREE.Mesh(geo, mat);
      w.renderOrder = 2;
      hinge.add(w);
      body.add(hinge);
      wings.push({ hinge, side });
    }
  } else {
    // 若虫:翅芽小片
    for (const side of [-1, 1]) {
      const pad = blob(mThorax, 0.12, 0.05, 0.22, side * 0.12, 0.08, 0.06, [6, 4]);
      pad.rotation.z = -side * 0.4;
      body.add(pad);
    }
  }

  // 足 ×3 对:前/中足短,后足长且胫节带距(褐飞虱科特征:后胫节端部可动大距)
  const legs = [], spurs = {};
  const LEGS = [
    { z: 0.3, yaw: -0.75, fem: 0.2, tib: 0.2 },
    { z: 0.2, yaw: -0.05, fem: 0.2, tib: 0.22 },
    { z: 0.1, yaw: 0.85, fem: 0.28, tib: 0.42, spur: true }
  ];
  LEGS.forEach((L, i) => {
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.1, -0.06, L.z);
      hip.scale.x = side;
      const fem = seg(L.fem, 0.026, 0.02, mLeg);
      hip.add(fem);
      const knee = new THREE.Group();
      knee.position.x = L.fem;
      fem.add(knee);
      const tib = seg(L.tib, 0.018, 0.013, mLeg);
      knee.add(tib);
      if (L.spur) {
        const spur = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.13, 4), toon('#f0dca0'));
        spur.position.set(L.tib, -0.02, 0);
        spur.rotation.z = Math.PI * 0.75;
        tib.add(spur);
        spurs[side] = spur;
      }
      body.add(hip);
      // 三角步态分组:左前/右中/左后 = 0 相,其余 = π
      const group = (i % 2 === 0) === (side < 0) ? 0 : Math.PI;
      legs.push({ hip, fem, tib, side, yaw: L.yaw, group, hind: !!L.spur });
    }
  });

  // 姿态(闭式):gait = 累计步相(由爬行距离换算,脚不打滑);flap/feed ∈ [0,1]
  // stand = 平台站姿(标本台):股节抬平外展、胫节斜撑,替代攀秆时的下探抓握
  function pose({ gait = 0, flap = 0, feed = 0, stand = 0 } = {}, T = 0) {
    for (const L of legs) {
      const ph = gait + L.group;
      L.hip.rotation.y = L.side * (L.yaw + 0.32 * Math.sin(ph));
      L.fem.rotation.z = -(0.5 - 0.35 * Math.max(0, Math.cos(ph))) * (1 - stand) + 0.3 * stand; // 子级在镜像系内,无需乘 side;抬腿 = 少下压
      L.tib.rotation.z = (L.hind ? -1.35 : -1.15) * (1 - stand) + (L.hind ? -0.95 : -1.25) * stand;
    }
    body.position.y = 0.012 * Math.sin(T * 2.2) + 0.015 * Math.abs(Math.sin(gait));
    abd.scale.y = (nymph ? 0.26 : 0.22) * (1 + 0.04 * Math.sin(T * 2.2));
    head.rotation.x = 0.28 * feed;
    stylet.scale.y = 0.001 + 0.22 * feed;
    for (const s of [-1, 1]) head.userData['ant' + s].rotation.x = 0.12 * Math.sin(T * 6.5 + s);
    const beat = flap * (0.7 + 0.45 * Math.sin(2 * Math.PI * 13 * T));
    for (const { hinge, side } of wings) {
      hinge.rotation.z = -side * (0.5 - 1.5 * beat);
      hinge.rotation.y = side * 0.07 - side * 0.85 * beat;
    }
  }
  pose();
  root.userData.pose = pose;
  root.userData.spurs = spurs; // 识别特征锚点(标本台高亮用)
  root.userData.mouth = new THREE.Vector3(0, -0.12, 0.5); // 体坐标,吸汁粒子终点
  return root;
}
