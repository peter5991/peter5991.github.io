// specimen.js — ③ 辨认用的标本台:木圆台 + 放大成虫 + 米粒比例尺 + 特征高亮环
// 高亮 = 时间轴闸门 × 角度可见度(特征所在面朝向相机才亮)。
import * as THREE from '../../vendor/three.module.js?v=20261012103044';
import { toon, outline, textTex } from './toon.js?v=20261012103044';
import { buildPlanthopper } from './planthopper.js?v=20261012103044';

const BUG_S = 6; // 标本体长(世界单位)
const DISK_R = 4.6;

// 特征锚点(体坐标,体长≈1;或 part = 挂在实际部件上)+ 该特征所在面的法线;gate = 时间轴参数名
const FEATURES = [
  { gate: 'spec.fWing', at: [0.12, 0.12, -0.55], n: [1, 0.3, 0], r: 0.2 }, // 屋脊状前翅超过腹末
  { gate: 'spec.fSpur', part: 'spur', at: [0, 0, 0], n: [1, 0, -0.3], r: 0.13 }, // 后胫节端部可动大距(右后足)
  { gate: 'spec.fHead', at: [0, 0.1, 0.42], n: [0, 0.4, 1], r: 0.16 } // 头顶浅色纵脊 + 红褐复眼
];

export function buildSpecimen({ camAz, scale = 1 }) {
  const root = new THREE.Group();
  root.scale.setScalar(scale);
  const turn = new THREE.Group(); // 转台:rotation.y = camAz + spec.turn,turn=0 时头朝观者
  root.add(turn);

  const disk = new THREE.Mesh(new THREE.CylinderGeometry(DISK_R, DISK_R * 1.04, 0.6, 40), toon('#a9794a'));
  disk.position.y = -0.3;
  outline(disk, 1.02);
  const felt = new THREE.Mesh(new THREE.CylinderGeometry(DISK_R * 0.92, DISK_R * 0.92, 0.04, 40), toon('#4f6b4c')); // 深绿绒布衬底,虫与米粒都要和它拉开对比
  felt.position.y = 0.02;
  turn.add(disk, felt);

  const bug = buildPlanthopper();
  bug.scale.setScalar(BUG_S);
  bug.userData.pose({ stand: 1 });
  bug.updateMatrixWorld();
  bug.position.y = -new THREE.Box3().setFromObject(bug).min.y + 0.04; // 最低足尖着台
  turn.add(bug);

  // 米粒比例尺:与虫等长;挂 root 不随转台转,放台面前沿、长轴平行屏幕(侧视下与虫并排可比)
  const GRAIN = new THREE.Vector3(0.38, 0.34, 1.0).multiplyScalar(BUG_S * 0.95);
  // 纵向棱纹纹理:极点转到长轴(z),u = 绕长轴一圈,竖线即纵棱
  const ridgeTex = textTex(128, 64, (c, w, h) => {
    c.fillStyle = '#f6ecc8'; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(176,150,96,0.75)'; c.lineWidth = 2;
    for (let i = 0; i < 8; i++) { c.beginPath(); c.moveTo((i + 0.5) * w / 8, 0); c.lineTo((i + 0.5) * w / 8, h); c.stroke(); }
  });
  const grain = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 10).rotateX(Math.PI / 2), toon(0xffffff, { map: ridgeTex }));
  grain.rotation.y = camAz + Math.PI / 2;
  outline(grain, 1.05);
  const germ = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), toon('#d9bf7c')); // 胚芽缺口:米粒的标志
  germ.scale.set(0.2, 0.26, 0.1);
  germ.position.set(0.16, 0.1, 0.44);
  grain.add(germ);
  root.add(grain);

  // 高亮环:挂 root(不随转台转),每帧追特征世界坐标并朝向相机
  const rings = FEATURES.map((f) => {
    const mat = new THREE.MeshBasicMaterial({ color: '#ffd84a', transparent: true, depthTest: false, depthWrite: false });
    const m = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 40), mat);
    m.renderOrder = 20;
    root.add(m);
    return { f, m, mat, at: new THREE.Vector3(...f.at), n: new THREE.Vector3(...f.n).normalize() };
  });

  const wp = new THREE.Vector3(), wn = new THREE.Vector3(), toCam = new THREE.Vector3();

  let liveCamAz = camAz; // 相机方位可能变化(图卡模式挂锚点)
  function update(P, T, camera, anchor) {
    const open = P['spec.open'];
    root.visible = open > 0.002;
    if (!root.visible) return;
    root.position.copy(anchor);
    root.scale.setScalar(open);
    turn.rotation.y = liveCamAz + P['spec.turn'];
    bug.userData.pose({ stand: 1 }, T);
    const g = P['spec.grain'];
    grain.visible = g > 0.002;
    grain.scale.copy(GRAIN).multiplyScalar(g);
    grain.position.set(Math.sin(liveCamAz) * DISK_R * 0.8, GRAIN.y * 0.5 * g, Math.cos(liveCamAz) * DISK_R * 0.8);
    root.updateMatrixWorld();

    const pulse = 0.75 + 0.25 * Math.sin(T * 6);
    for (const r of rings) {
      wp.copy(r.at).applyMatrix4(r.f.part ? bug.userData.spurs[1].matrixWorld : bug.matrixWorld);
      wn.copy(r.n).transformDirection(bug.matrixWorld);
      // camera 由 lesson-mode 换算进 root 的局部坐标系(图卡模式),与 wp 同一坐标系
      toCam.subVectors(camera.position, wp).normalize();
      const face = THREE.MathUtils.smoothstep(wn.dot(toCam), 0.25, 0.65);
      const k = P[r.f.gate] * face;
      r.m.visible = k > 0.01;
      r.m.position.copy(root.worldToLocal(wp.clone()));
      r.m.quaternion.copy(camera.quaternion);
      r.m.scale.setScalar(r.f.r * BUG_S * (0.9 + 0.15 * pulse) * k);
      r.mat.opacity = k * pulse;
    }
  }

  return { root, update, setCamAz(az) { liveCamAz = az; } };
}
