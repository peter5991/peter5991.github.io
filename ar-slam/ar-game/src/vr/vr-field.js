// vr-field.js — VR 漫游页的田间层:按簇枯黄/倒伏(v4 GLB 是 30 个独立稻簇网格)
// 与原 field-damage.js 不同:不动 GLB 材质,不注入 shader;按簇操作
//   枯黄 = 整簇材质色乘混(vertexColors 照常起作用),毒化 = 叶尖 fade 差,效果更"病害渐进"
//   倒伏 = 整簇绕随机方位倾斜下压(真实冒穿:整丛倒下)
// 虫群/定位圈从原 field-damage.js 移植(换成 v4 坐标)
import * as THREE from '../../vendor/three.module.js?v=20261012103238';
import { toon, mulberry32 } from '../lesson-core/toon.js?v=20261012103238';

const YELLOW = new THREE.Color('#d9b24a');
const BROWN = new THREE.Color('#8b6a3c');

// patches: [[x, z, maxR, delay], ...] 世界坐标(与 lesson JSON 的 field.patches 同格式)
export function buildRiceDamage(root) {
  const clumps = [];
  const box = new THREE.Box3();
  root.traverse((n) => {
    if (!n.isMesh || !n.name.startsWith('Rice_') || !n.geometry.attributes.color) return;
    n.updateMatrixWorld(true);
    box.setFromObject(n);
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const mats = Array.isArray(n.material) ? n.material : [n.material];
    const tinted = mats.map((m) => {
      const t = m.clone();
      t.color = m.color.clone(); // 以 A 线 baseColor 为基底做混色
      return t;
    });
    clumps.push({
      mesh: n,
      origMats: mats,
      tintedMats: Array.isArray(n.material) ? tinted : tinted[0],
      baseColors: mats.map((m) => m.color.clone()),
      cx: c.x, cz: c.z,
      footY: box.min.y,
      leanAxis: Math.atan2(c.z, c.x) + Math.PI / 2, // 倒向大致朝外
      h: Math.max(size.y, 0.2)
    });
  });

  function setSpread(patches, spread) {
    for (const cl of clumps) {
      let dmg = 0;
      for (const p of patches) {
        const r = p[2] * Math.min(Math.max((spread - p[3]) / (1 - p[3]), 0), 1);
        if (r <= 0) continue;
        const d = Math.hypot(cl.cx - p[0], cl.cz - p[1]);
        dmg = Math.max(dmg, 1 - THREE.MathUtils.smoothstep(d, r * 0.45, r));
      }
      // 变色
      const mArr = Array.isArray(cl.tintedMats) ? cl.tintedMats : [cl.tintedMats];
      mArr.forEach((m, i) => {
        m.color.copy(cl.baseColors[i]);
        m.color.lerp(YELLOW, THREE.MathUtils.smoothstep(dmg, 0.02, 0.5));
        m.color.lerp(BROWN, THREE.MathUtils.smoothstep(dmg, 0.55, 0.95));
      });
      // 倒伏:绕簇脚底的水平轴倾斜
      const lodge = THREE.MathUtils.smoothstep(dmg, 0.55, 1.0);
      const s = 1 - 0.35 * lodge;
      const a = lodge * 0.55;
      const q = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(Math.cos(cl.leanAxis), 0, Math.sin(cl.leanAxis)), a);
      cl.mesh.matrixAutoUpdate = false;
      cl.mesh.matrix.compose(
        new THREE.Vector3(cl.cx, cl.footY, cl.cz),
        q,
        new THREE.Vector3(s, s, s)
      );
      // 抵消枢轴:把簇原点移到脚底再转
      cl.mesh.matrix.multiply(new THREE.Matrix4().makeTranslation(-cl.cx, -cl.footY, -cl.cz));
      cl.mesh.matrixWorldNeedsUpdate = true;
    }
    return clumps;
  }
  return { clumps, setSpread };
}

// 田间虫群:飞入(arrive)→ 落在斑块前沿随扩张外推、原地蹦跳;kill = 打药后缩没
export function buildSwarm(patches, waterY, count = 160) {
  const rand = mulberry32(20261001);
  const geo = new THREE.SphereGeometry(0.5, 5, 4).scale(0.018, 0.014, 0.033);
  const inst = new THREE.InstancedMesh(geo, toon('#8a5a2e'), count);
  inst.frustumCulled = false;
  const bugs = [];
  for (let i = 0; i < count; i++) {
    bugs.push({
      p: i < count * 0.5 ? 0 : i < count * 0.78 ? 1 : 2,
      a: rand() * Math.PI * 2,
      u: 0.35 + rand() * 0.7,
      ph: rand(),
      order: rand(),
      from: new THREE.Vector3(-3 + rand() * 1.2, 0.5 + rand() * 0.5, -3 + rand() * 1.2)
    });
  }
  const d = new THREE.Object3D();
  const land = new THREE.Vector3();
  function update(arrive, spread, T, kill = 0) {
    let anyVisible = false;
    bugs.forEach((b, i) => {
      const P = patches[b.p];
      const r = Math.max(P[2] * Math.min(Math.max((spread - P[3]) / (1 - P[3]), 0), 1), 0.2);
      land.set(P[0] + Math.cos(b.a) * r * b.u, waterY + 0.1, P[1] + Math.sin(b.a) * r * b.u);
      const k = Math.min(Math.max(arrive * 1.7 - b.order * 0.7, 0), 1);
      const fly = 1 - k;
      const hop = 0.05 * Math.abs(Math.sin(Math.PI * (T * 0.9 + b.ph))) * k;
      d.position.set(
        land.x + b.from.x * fly + 0.12 * Math.sin(T * 3 + b.ph * 9) * fly,
        land.y + b.from.y * fly + hop,
        land.z + b.from.z * fly
      );
      d.rotation.set(0, b.a + Math.PI / 2, 0);
      const alive = k > 0 ? 1 - Math.min(Math.max(kill * 1.5 - b.order * 0.5, 0), 1) : 0;
      d.scale.setScalar(alive);
      if (alive > 0) anyVisible = true;
      d.updateMatrix();
      inst.setMatrixAt(i, d.matrix);
    });
    inst.visible = anyVisible;
    inst.instanceMatrix.needsUpdate = true;
  }
  update(0, 0, 0);
  return { mesh: inst, update };
}

// 定位圈:标出被看的那一株
export function buildMarker(focus) {
  const mat = new THREE.MeshBasicMaterial({ color: '#ffd84a', transparent: true, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.09, 0.12, 40).rotateX(-Math.PI / 2), mat);
  ring.position.set(focus[0], focus[1] + 0.02, focus[2]);
  ring.renderOrder = 3;
  function update(on, T) {
    ring.visible = on > 0.001;
    mat.opacity = on * (0.65 + 0.35 * Math.sin(T * 5));
    ring.scale.setScalar(on * (1 + 0.18 * Math.sin(T * 5)));
  }
  update(0, 0);
  return { mesh: ring, update };
}
