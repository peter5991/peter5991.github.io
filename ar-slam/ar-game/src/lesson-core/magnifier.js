// magnifier.js — 放大镜气泡:玻璃球 + 镜框/手柄(朝向观者)+ 光锥连到田里那一株
// 球内是放大的稻秆基部特写:水面、分蘖、主角飞虱、若虫群、吸汁粒子。
// 位置每帧跟随被看的那一株。
import * as THREE from '../../vendor/three.module.js?v=20261012104101';
import { toon, outline, textTex } from './toon.js?v=20261012104101';
import { buildPlanthopper } from './planthopper.js?v=20261012104101';

const R = 4.2; // 球半径(世界单位)
const STEM_R = 0.4;
const WATER_Y = -2.6;
const HERO_S = 2.5; // 主角在镜内的体长(世界单位,体坐标体长≈1)

function glassMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uOpen: { value: 0 } },
    vertexShader: `
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uOpen;
      varying vec3 vN; varying vec3 vV;
      void main() {
        float f = pow(1.0 - abs(dot(vN, vV)), 1.4);
        float spec = pow(max(dot(vN, normalize(vec3(-0.45, 0.6, 0.65))), 0.0), 60.0);
        vec3 col = mix(vec3(0.72, 0.88, 1.0), vec3(1.0), f) + spec;
        gl_FragColor = vec4(col, (0.30 + 0.62 * f + 0.8 * spec) * uOpen);
      }`
  });
}

// 弯叶:宽度随长度收窄,沿 yz 平面圆弧外弯
function leafGeometry(len, width, bend) {
  const g = new THREE.PlaneGeometry(1, 1, 1, 10);
  const p = g.attributes.position;
  const rb = len / bend;
  for (let i = 0; i < p.count; i++) {
    const v = p.getY(i) + 0.5;
    const s = v * len;
    p.setXYZ(i, p.getX(i) * width * (1 - 0.85 * v), rb * Math.sin(s / rb), rb * (1 - Math.cos(s / rb)));
  }
  g.computeVertexNormals();
  return g;
}

// 稻秆表面挂点:a = 绕秆方位角(0 = 正对观者),y = 高度
function mountMatrix(a, y, s, lift = 0.11) {
  const n = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
  const fwd = new THREE.Vector3(0, 1, 0);
  const x = new THREE.Vector3().crossVectors(n, fwd);
  const m = new THREE.Matrix4().makeBasis(x, n, fwd);
  m.setPosition(n.clone().multiplyScalar(STEM_R + lift * s).setY(y));
  return m.multiply(new THREE.Matrix4().makeScale(s, s, s));
}

export function buildMagnifier({ camAz, waterColor, scale = 1, debug = false }) {
  const root = new THREE.Group();
  root.scale.setScalar(scale);
  const lens = new THREE.Group(); // 随 open 缩放
  root.add(lens);
  const BASE_SCALE = scale; // root.scale × lens.scale(open) 共同决定最终大小

  const glassMat = glassMaterial();
  const glass = new THREE.Mesh(new THREE.SphereGeometry(R, 40, 28), glassMat);
  glass.renderOrder = 10;
  lens.add(glass);

  // 镜框 + 手柄:每帧朝向相机(农民一眼认出"放大镜")
  const rim = new THREE.Group();
  const brass = toon('#d2a956'), wood = toon('#7b5234');
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.13, 8, 56), brass);
  outline(ring, 1.02);
  rim.add(ring);
  const ha = -Math.PI * 0.27;
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 10), brass);
  collar.position.set(Math.cos(ha) * (R + 0.35), Math.sin(ha) * (R + 0.35), 0);
  collar.rotation.z = ha + Math.PI / 2;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 2.2, 10), wood);
  handle.position.set(Math.cos(ha) * (R + 1.65), Math.sin(ha) * (R + 1.65), 0);
  handle.rotation.z = ha + Math.PI / 2;
  outline(handle, 1.05); outline(collar, 1.05);
  rim.add(collar, handle);
  lens.add(rim);

  // 镜内背景板:挡住球后场景,让标本读得清(随镜框朝向相机,半径按透视补偿贴合镜框)
  const BACK_Z = -R * 0.98;
  const backTex = textTex(256, 256, (c, w, h) => {
    const g = c.createRadialGradient(w * 0.45, h * 0.38, 10, w / 2, h / 2, w / 2);
    g.addColorStop(0, '#fbf8ec'); g.addColorStop(0.7, '#e6eedb'); g.addColorStop(1, '#cfdcc4');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  });
  const backdrop = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshBasicMaterial({ map: backTex }));
  backdrop.position.z = BACK_Z;
  rim.add(backdrop);

  // 球内特写,整体转向观者方位
  const inner = new THREE.Group();
  inner.rotation.y = camAz;
  lens.add(inner);

  const waterMat = toon(waterColor, { transparent: true, opacity: 0.85 });
  const capTheta = Math.acos(WATER_Y / R);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(R * 0.985, 32, 10, 0, Math.PI * 2, capTheta, Math.PI - capTheta), waterMat);
  const lidR = Math.sqrt(R * R - WATER_Y * WATER_Y) * 0.985;
  const lid = new THREE.Mesh(new THREE.CircleGeometry(lidR, 40).rotateX(-Math.PI / 2), toon(waterColor));
  lid.position.y = WATER_Y;
  inner.add(cap, lid);

  // 分蘖 ×3 + 叶
  const green = new THREE.Color('#79ab4c'), sheathG = new THREE.Color('#a7c76a');
  const dead = new THREE.Color('#9a7440'), deadSheath = new THREE.Color('#c6a565');
  const stemMat = toon(green.clone()), sheathMat = toon(sheathG.clone());
  const leafMat = toon(green.clone(), { side: THREE.DoubleSide });
  const leaves = [], tillers = [];
  const TILLERS = [
    { x: 0, z: 0, r: STEM_R, h: 6.4, lean: 0 },
    { x: -0.95, z: -0.7, r: 0.3, h: 5.6, lean: -0.1 },
    { x: 0.9, z: -0.8, r: 0.28, h: 5.2, lean: 0.12 }
  ];
  TILLERS.forEach((t, i) => {
    const tg = new THREE.Group();
    tg.position.set(t.x, WATER_Y - 0.3, t.z);
    tg.rotation.z = t.lean;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(t.r * 0.12, t.r, t.h, 10).translate(0, t.h / 2, 0), stemMat);
    outline(stem, 1.04);
    const sheath = new THREE.Mesh(new THREE.CylinderGeometry(t.r * 1.08, t.r * 1.12, 1.6, 10).translate(0, 1.1, 0), sheathMat);
    tg.add(stem, sheath);
    for (let k = 0; k < 2; k++) {
      const pivot = new THREE.Group();
      pivot.position.y = t.h * (0.62 + 0.18 * k);
      pivot.rotation.y = i * 2.1 + k * Math.PI;
      const leaf = new THREE.Mesh(leafGeometry(2.8 - 0.4 * k, 0.5, 1.2), leafMat);
      pivot.add(leaf);
      leaves.push(pivot);
    }
    inner.add(tg);
    tillers.push({ tg, lean: t.lean, ph: i * 1.3 });
  });

  // ④ 查虫白盘:放在秆基部前方水面(朝观者 = +z),check.tray 控制原地弹出/收起(滑入会穿出镜外)
  const tray = new THREE.Group();
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.5, 0.22, 32), toon('#fbfbf6'));
  outline(dish, 1.03);
  const dishIn = new THREE.Mesh(new THREE.CircleGeometry(1.5, 32).rotateX(-Math.PI / 2), toon('#ffffff'));
  dishIn.position.y = 0.115;
  tray.add(dish, dishIn);
  inner.add(tray);
  tray.position.set(0, WATER_Y + 0.15, 1.9);

  // ④ 喷头 + 药雾:从左上方对准秆基部(真实要点:药要打到稻丛基部)
  const nozzle = new THREE.Group();
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.4, 8).translate(0, 1.2, 0), toon('#5d6b4a'));
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.5, 8).translate(0, -0.15, 0), toon('#c9a43c'));
  outline(pipe, 1.08); outline(head, 1.06);
  nozzle.add(pipe, head);
  nozzle.position.set(-2.3, 0.9, 1.3);
  nozzle.rotation.z = Math.PI * 0.72; // 喷口斜指右下(秆基部)
  inner.add(nozzle);
  const SPRAY_FROM = new THREE.Vector3(-2.05, 0.75, 1.3), SPRAY_TO = new THREE.Vector3(0.1, WATER_Y + 0.6, 0.5);
  const dropMat = toon('#5fb3e6');
  const drops = Array.from({ length: 32 }, (_, i) => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), dropMat);
    m.userData.off = new THREE.Vector3(Math.sin(i * 2.4), Math.cos(i * 3.7) * 0.7, Math.sin(i * 5.1) * 0.8);
    inner.add(m);
    return m;
  });

  // 主角成虫:沿秆螺旋爬升到正面偏右
  const hero = buildPlanthopper();
  hero.matrixAutoUpdate = false;
  inner.add(hero);
  const heroFrom = { a: 2.4, y: WATER_Y + 0.9 }, heroTo = { a: 0.5, y: -0.2 };

  // 若虫 ×10:按序冒出,集中在近水面的秆基部(褐飞虱若虫的真实取食部位)
  const NYMPHS = [
    [-0.6, -1.9], [1.25, -1.7], [-1.35, -1.0], [0.3, -2.25], [1.9, -0.9],
    [-0.9, -0.2], [1.35, 0.1], [-1.95, -1.9], [2.5, -2.0], [-2.4, -0.6]
  ];
  const nymphs = NYMPHS.map(([a, y], i) => {
    const n = buildPlanthopper({ nymph: true });
    n.matrixAutoUpdate = false;
    n.userData.a = a; n.userData.y = y;
    n.userData.s = HERO_S * (0.42 + 0.06 * ((i * 7) % 3));
    inner.add(n);
    return n;
  });

  // 吸汁粒子:秆面 → 口器
  const sapMat = toon('#9be06a');
  const sap = Array.from({ length: 5 }, () => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), sapMat);
    inner.add(m);
    return m;
  });

  // 光锥:球底 → 田里那一株
  const beamMat = new THREE.MeshBasicMaterial({ color: '#fff6d8', transparent: true, opacity: 0.22, depthWrite: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.55, 0.06, 1, 24, 1, true).translate(0, 0.5, 0), beamMat);
  beam.renderOrder = 9;
  root.add(beam);

  const mouth = new THREE.Vector3(), from = new THREE.Vector3();
  const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
  const _p2 = new THREE.Vector3(), _q2 = new THREE.Quaternion();
  // 从挂点矩阵 m 落到 to(位置)+ 姿态 qTo,e∈[0,1] 带抛物线;结果写回 m
  function fallTo(m, to, qTo, e) {
    if (e <= 0) return;
    m.decompose(_p, _q, _s);
    _p.lerp(to, e).y += 1.2 * Math.sin(Math.PI * e) * 0.5;
    _q.slerp(qTo, e);
    m.compose(_p, _q, _s);
  }
  const Q_DEAD = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI * 0.92); // 翻肚
  const UP = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(), bottom = new THREE.Vector3();

  function update(P, T, camera, plantWorld, lift) {
    const open = Math.max(P['bubble.open'], 0);
    root.visible = open > 0.002;
    if (!root.visible) return;
    root.position.copy(plantWorld).add(new THREE.Vector3(0, lift, 0));
    lens.scale.setScalar(open);
    glassMat.uniforms.uOpen.value = Math.min(open, 1);
    rim.quaternion.copy(camera.quaternion);
    const dCam = camera.position.distanceTo(root.position) / Math.max(open * BASE_SCALE, 1e-3); // lens 局部单位(含整体缩放)
    backdrop.scale.setScalar(R * (dCam - BACK_Z) / dCam * 1.002);

    // 光锥
    bottom.copy(root.position).y -= R * open * BASE_SCALE;
    dir.subVectors(bottom, plantWorld);
    const len = dir.length();
    beam.position.copy(plantWorld);
    beam.quaternion.setFromUnitVectors(UP, dir.normalize());
    beam.scale.set(open, len / BASE_SCALE, open); // 局部长度补偿整体缩放,保证世界长度正确
    beamMat.opacity = 0.22 * Math.min(open, 1);

    // 稻株健康度:秆/叶变色 + 叶片下垂
    const h = P['bubble.health'];
    stemMat.color.lerpColors(dead, green, h);
    sheathMat.color.lerpColors(deadSheath, sheathG, h);
    leafMat.color.lerpColors(dead, green, Math.pow(h, 0.7));
    for (const lv of leaves) lv.rotation.x = (1 - h) * 0.9;

    // ④ 拍稻根:分蘖衰减摆动(tap 0→1 闭式)
    const tap = P['check.tap'];
    const shake = tap > 0 && tap < 1 ? 0.14 * Math.sin(tap * Math.PI * 7) * (1 - tap) : 0;
    for (const t of tillers) t.tg.rotation.z = t.lean + shake * (1 + 0.3 * Math.sin(t.ph));
    const tr = P['check.tray'];
    tray.visible = tr > 0.002;
    tray.scale.setScalar(tr);

    // ④ 药雾
    const sp = P['spray.on'];
    nozzle.visible = sp > 0.002;
    nozzle.scale.setScalar(Math.min(sp * 2, 1));
    drops.forEach((d, i) => {
      const f = (T * 1.4 + i / drops.length) % 1;
      d.visible = sp > 0.002;
      d.position.lerpVectors(SPRAY_FROM, SPRAY_TO, f).addScaledVector(d.userData.off, 0.9 * f);
      d.scale.setScalar(sp * (0.6 + 0.8 * f) * Math.sin(Math.PI * Math.min(f * 1.2, 1)));
    });
    const kill = P['spray.kill'];

    // 主角:爬行距离换算步相(脚不打滑)
    const c = P['hero.climb'];
    const a = heroFrom.a + (heroTo.a - heroFrom.a) * c;
    const y = heroFrom.y + (heroTo.y - heroFrom.y) * c;
    hero.matrix.copy(mountMatrix(a, y, HERO_S));
    fallTo(hero.matrix, _p2.set(Math.sin(a) * 1.1 + 0.3, WATER_Y + 0.35, Math.cos(a) * 1.1), Q_DEAD, kill); // 翻肚浮在秆旁水面,留在镜内
    hero.userData.pose({ gait: c * Math.PI * 2 * 5, flap: P['hero.flap'], feed: P['hero.feed'] * (1 - kill) }, T);
    hero.visible = c > 0.001;

    // 若虫:第 i 只在 nymphs 越过 i 时弹出
    const nn = P['bubble.nymphs'];
    nymphs.forEach((n, i) => {
      const k = Math.min(Math.max(nn - i, 0), 1);
      const pop = k <= 0 ? 0 : k + 0.35 * Math.sin(Math.PI * k);
      n.matrix.copy(mountMatrix(n.userData.a, n.userData.y, n.userData.s * pop, 0.07));
      // 拍落进盘:第 i 只错峰下落,落点与大小随盘缩放(盘收起时虫一起带走)
      const drop = Math.min(Math.max(tap * 1.6 - i * 0.06, 0), 1);
      const ang = i * 2.4, rr = (0.35 + 0.9 * ((i * 0.37) % 1)) * tr;
      _p2.set(tray.position.x + Math.cos(ang) * rr, tray.position.y + (0.12 + 0.25 * n.userData.s) * tr, tray.position.z + Math.sin(ang) * rr);
      _q2.setFromAxisAngle(UP, ang);
      fallTo(n.matrix, _p2, _q2, drop);
      if (drop > 0) { const sf = 1 + (tr - 1) * drop; n.matrix.scale(_s.set(sf, sf, sf)); }
      n.visible = k > 0 && !(drop > 0 && tr < 0.002);
      n.userData.pose({ gait: 0, feed: k * (1 - drop), flap: 0 }, T + i * 0.7);
    });

    // 吸汁粒子
    const feed = P['hero.feed'];
    mouth.copy(hero.userData.mouth).applyMatrix4(hero.matrix);
    from.set(Math.sin(a) * STEM_R * 0.6, y - 0.1 * HERO_S, Math.cos(a) * STEM_R * 0.6);
    sap.forEach((s, i) => {
      const f = (T * 0.9 + i / sap.length) % 1;
      s.visible = feed * (1 - kill) > 0.5;
      s.position.lerpVectors(from, mouth, f);
      s.scale.setScalar(Math.sin(Math.PI * f) * feed);
    });
  }

  return { root, update, R,
    // 相机方位可能变化(图卡模式挂锚点,相机会随卡动):更新球内特写朝向
    setCamAz(az) { inner.rotation.y = az; } };
}
