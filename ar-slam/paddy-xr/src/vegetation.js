// vegetation.js — 稻株 + 树 + 稻草人 + 人物 + 小件(浮萍/草丛/石)
// 契约:export function buildVegetation(ctx) 返回 THREE.Group
// 颜色一律取 cfg;随机一律走 ctx.rand(mulberry32 固定种子,确定性)。
import * as THREE from '../vendor/three.module.min.js?v=20261008093700';

// 单株稻苗 = 3 片交叉面片(手工合并,不依赖 BufferGeometryUtils)
function bladeGeometry() {
  const base = new THREE.PlaneGeometry(0.09, 1.0, 1, 2);
  base.translate(0, 0.5, 0); // 根在 y=0
  const pos = [], norm = [], idx = [];
  for (let b = 0; b < 3; b++) {
    const g = base.clone().rotateY((Math.PI / 3) * b);
    const p = g.attributes.position, n = g.attributes.normal, ix = g.index;
    const off = pos.length / 3;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      norm.push(n.getX(i), n.getY(i), n.getZ(i));
    }
    for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + off);
    g.dispose();
  }
  base.dispose();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  geo.setIndex(idx);
  return geo;
}

export function buildVegetation(ctx) {
  const { toon, M, B, C, outline, textTex, rand, cfg } = ctx;
  const g = new THREE.Group();
  const dummy = new THREE.Object3D();
  const S = cfg.sizes;
  // D3(spec-d3 §5):可动件引用,构造时即 rest 姿态,update 只做偏移叠加
  let scGrp = null, fTorso = null, fArmL = null, fArmR = null, fHat = null, flagPivot = null;

  // 接触影:人物/稻草人按 spec 不投影,贴圆形径向渐变假影解决悬浮感
  const contactTex = textTex(128, 128, (c, w, h) => {
    const grad = c.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
    grad.addColorStop(0, 'rgba(20,18,24,0.42)');
    grad.addColorStop(0.6, 'rgba(20,18,24,0.18)');
    grad.addColorStop(1, 'rgba(20,18,24,0)');
    c.fillStyle = grad; c.fillRect(0, 0, w, h);
  });
  const contactMat = new THREE.MeshBasicMaterial({ map: contactTex, transparent: true, depthWrite: false });
  const contactGeo = new THREE.CircleGeometry(0.18, 20).rotateX(-Math.PI / 2);
  function contactShadow(x, y, z, s = 1) {
    const m = new THREE.Mesh(contactGeo, contactMat);
    m.position.set(x, y, z);
    m.scale.set(s, 1, s);
    m.renderOrder = 1;
    g.add(m);
  }

  // ---------- 稻株(InstancedMesh 一次 draw call) ----------
  // 田块网格:origin=西北角,块间留 ridgeW 田埂,株行距按农艺排布,根扎水面
  {
    const P = S.paddy;
    const perRow = 12, rows = 8;
    const total = P.cols * P.rows * perRow * rows; // 6*96=3456 < 6000
    const geo = bladeGeometry();
    const rice = cfg.rice; // D2:{color,heightScale,densityScale}
    const mat = toon(rice.color, { side: THREE.DoubleSide });
    const inst = new THREE.InstancedMesh(geo, mat, total);
    inst.frustumCulled = false;
    const heightScale = rice.heightScale ?? 1;
    const density = Math.min(rice.densityScale ?? 1, 1); // ≥1 按 1.0 处理(spec §2.2)
    let k = 0;
    for (let c = 0; c < P.cols; c++) {
      for (let r = 0; r < P.rows; r++) {
        const bx = P.origin[0] + c * (P.blockW + P.ridgeW);
        const bz = P.origin[1] + r * (P.blockD + P.ridgeW);
        const mx = 0.18, mz = 0.15; // 株距/行距留白(田埂侧不插苗)
        for (let j = 0; j < rows; j++) {
          for (let i = 0; i < perRow; i++) {
            const px = bx + mx + (i / (perRow - 1)) * (P.blockW - mx * 2) + (rand() - 0.5) * 0.1;
            const pz = bz + mz + (j / (rows - 1)) * (P.blockD - mz * 2) + (rand() - 0.5) * 0.08;
            const h = 0.18 + (rand() * 2 - 1) * 0.03; // 株高 0.18 ± 0.03
            dummy.position.set(px, P.waterY, pz);
            dummy.rotation.set((rand() - 0.5) * 0.24, rand() * Math.PI, (rand() - 0.5) * 0.24);
            // 密度抽签:逐株仍消耗一次 rand(8 变体抽签序列逐位一致),未中签写零缩放
            const keep = rand() < density;
            dummy.scale.set(1, keep ? h * heightScale : 0, 1);
            dummy.updateMatrix();
            inst.setMatrixAt(k++, dummy.matrix);
          }
        }
      }
    }
    g.add(inst);
  }

  // ---------- 树 ×17(参照系式层叠平冠:通直细干 + 5~6 层扁锥伞盖,层间留空,逐层收窄) ----------
  // 形态取自参照站 mountain-railway 的 cedar/pine 语言:可见干伸入冠层、水平分层、
  // 宽度随高 (1-t)^0.7 收窄、层间留空透气;扁平化到本场景尺度,几何去索引出硬棱面(r185 flatShading 已废)
  {
    const trunkMat = toon(cfg.trunk);
    const palette = cfg.leafPalette; // D2:每树固定消耗一次 rand 取色(spec §3.2)
    const tierF = [0.88, 1.0, 1.12]; // 明暗抖动档位保留,按树序循环(不再额外抽签)
    const flat = (geo) => { const g2 = geo.toNonIndexed(); g2.computeVertexNormals(); return g2; };
    let treeIdx = 0;
    for (const t of S.trees) {
      const tree = new THREE.Group();
      const leafBase = new THREE.Color(palette[Math.floor(rand() * palette.length)]);
      const leafMat = toon(leafBase.multiplyScalar(tierF[treeIdx++ % 3]));
      const trunk = M(C(0.028 * t.h, 0.05 * t.h, t.h * 0.34, 6), trunkMat, 0, t.h * 0.17, 0); // 干只到首层伞盖心,构造上不可能戳出冠外
      trunk.castShadow = true;
      tree.add(trunk);
      const tiers = 5 + Math.floor(rand() * 2);
      for (let k = 0; k < tiers; k++) {
        const tk = k / (tiers - 1);
        const r = t.h * 0.3 * Math.pow(1 - tk * 0.85, 0.7);
        // 抖动幅度=min(半径一半, 0.04h)——小层小偏,干/层衔接处永不外露
        const off = Math.min(0.5 * r, 0.04 * t.h);
        const pad = M(
          flat(new THREE.ConeGeometry(r, t.h * 0.16, 7)),
          leafMat,
          (rand() - 0.5) * off,
          t.h * (0.34 + tk * 0.52),
          (rand() - 0.5) * off
        );
        pad.rotation.y = rand() * Math.PI;
        pad.castShadow = true;
        tree.add(pad);
      }
      tree.rotation.y = rand() * Math.PI * 2;
      tree.position.set(t.x, 0, t.z);
      g.add(tree);
    }
  }

  // ---------- 稻草人(十字杆 + 斗笠 + 旧衣色块,大件描边) ----------
  {
    const sc = S.scarecrow;
    const grp = new THREE.Group();
    const poleMat = toon(cfg.trunk);
    const clothMat = toon(cfg.scarecrowCloth);
    const strawMat = toon(cfg.farmerHat);
    const pole = M(C(0.02, 0.028, sc.height, 6), poleMat, 0, sc.height / 2, 0);
    pole.castShadow = true;
    const arm = M(C(0.015, 0.015, sc.arm, 6), poleMat, 0, sc.height * 0.72, 0);
    arm.rotation.z = Math.PI / 2;
    const torso = M(B(0.22, 0.3, 0.12), clothMat, 0, sc.height * 0.62, 0);
    outline(torso, 1.04);
    torso.castShadow = true;
    const sleeveL = M(B(0.16, 0.09, 0.09), clothMat, -sc.arm * 0.32, sc.height * 0.72, 0);
    const sleeveR = M(B(0.16, 0.09, 0.09), clothMat, sc.arm * 0.32, sc.height * 0.72, 0);
    sleeveL.rotation.z = 0.15; sleeveR.rotation.z = -0.15; // 破衣袖下垂感
    const head = M(new THREE.SphereGeometry(0.06, 8, 6), strawMat, 0, sc.height * 0.88, 0);
    const hat = M(C(0.005, 0.14, 0.08, 8), strawMat, 0, sc.height * 0.97, 0);
    grp.add(pole, arm, torso, sleeveL, sleeveR, head, hat);
    grp.position.set(sc.position[0], 0, sc.position[1]);
    grp.rotation.y = -0.5; // 侧向默认相机
    g.add(grp);
    scGrp = grp; // D3:整组微晃(rotation.z)
    contactShadow(sc.position[0], S.paddy.waterY + 0.036, sc.position[1], 1.15);
  }

  // ---------- 人物 ×2 ----------
  {
    const P = S.person;
    const headR = P.headR / 2; // spec:头径 0.14
    const skinMat = toon(cfg.houseWall); // 肤色取米白(cfg 内最近色)

    // 田埂农夫(弯腰插秧姿,面向田=南)
    const farmer = new THREE.Group();
    const topMat = toon(cfg.farmerTop);
    const pantsMat = toon(cfg.trunk); // 裤色取 cfg 深木色
    const hatMat = toon(cfg.farmerHat);
    const legL = M(C(0.022, 0.026, 0.16, 6), pantsMat, -0.04, 0.08, 0);
    const legR = M(C(0.022, 0.026, 0.16, 6), pantsMat, 0.04, 0.08, 0);
    const torso = M(C(0.05, 0.062, 0.26, 8), topMat, 0, 0.27, 0.06);
    torso.rotation.x = 0.72; // 弯腰
    const armL = M(C(0.014, 0.014, 0.2, 6), topMat, -0.07, 0.26, 0.13);
    const armR = M(C(0.014, 0.014, 0.2, 6), topMat, 0.07, 0.26, 0.13);
    armL.rotation.x = 1.15; armR.rotation.x = 1.15; // 双手下探向水面
    const head = M(new THREE.SphereGeometry(headR, 8, 6), skinMat, 0, 0.42, 0.16);
    const hat = M(C(0.01, 0.13, 0.06, 8), hatMat, 0, 0.47, 0.17);
    hat.rotation.x = 0.72; // 斗笠随低头前倾
    farmer.add(legL, legR, torso, armL, armR, head, hat);
    fTorso = torso; fArmL = armL; fArmR = armR; fHat = hat; // D3:弯腰 bob
    farmer.position.set(P.farmer[0], 0.02, P.farmer[1]);
    farmer.rotation.y = Math.PI; // 面向田心(北)
    g.add(farmer);
    contactShadow(P.farmer[0], S.paddy.waterY + 0.036, P.farmer[1], 0.9);

    // 站台站长(立姿,制服 + 帽 + 信号旗,面向列车=南)
    const master = new THREE.Group();
    const uniMat = toon(cfg.masterUniform);
    const body = M(C(0.052, 0.068, 0.34, 8), uniMat, 0, 0.17, 0);
    const head2 = M(new THREE.SphereGeometry(headR, 8, 6), skinMat, 0, 0.41, 0);
    const cap = M(C(0.075, 0.082, 0.05, 8), uniMat, 0, 0.475, 0);
    const brim = M(C(0.095, 0.095, 0.012, 8), uniMat, 0, 0.452, 0.01);
    // D3(spec §5):举旗臂+旗装入肩 pivot,动画只写 pivot.rotation.z;
    // pivot 零旋转时世界位姿与 D2 静态逐值相等(armF 中心 (0.08,0.30,0.03),flag 世界 (0.15,0.4,0.03))
    flagPivot = new THREE.Group();
    flagPivot.position.set(0.08, 0.30, 0.03);
    const armF = M(C(0.013, 0.013, 0.17, 6), uniMat, 0, 0, 0);
    armF.rotation.z = -0.9; // 举旗臂
    const flag = M(B(0.11, 0.08, 0.008), toon(cfg.trainBody), 0.07, 0.10, 0);
    flagPivot.add(armF, flag);
    master.add(body, head2, cap, brim, flagPivot);
    master.position.set(P.stationmaster[0], S.station.platform.h, P.stationmaster[1]);
    master.rotation.y = Math.PI * 0.9; // 面向列车停靠侧
    g.add(master);
    contactShadow(P.stationmaster[0], S.station.platform.h + 0.006, P.stationmaster[1], 0.9);
  }

  // ---------- 小件:浮萍 / 田埂草丛 / 石 ----------
  {
    const P = S.paddy;

    // 浮萍 30 片(水面贴片,InstancedMesh)
    const dwGeo = new THREE.CircleGeometry(0.045, 6).rotateX(-Math.PI / 2);
    const dw = new THREE.InstancedMesh(dwGeo, toon(cfg.duckweed, { side: THREE.DoubleSide }), 30);
    dw.frustumCulled = false;
    for (let i = 0; i < 30; i++) {
      const c = Math.floor(rand() * P.cols), r = Math.floor(rand() * P.rows);
      const bx = P.origin[0] + c * (P.blockW + P.ridgeW);
      const bz = P.origin[1] + r * (P.blockD + P.ridgeW);
      dummy.position.set(bx + 0.2 + rand() * (P.blockW - 0.4), P.waterY + 0.034, bz + 0.2 + rand() * (P.blockD - 0.4));
      dummy.rotation.set(0, rand() * Math.PI, 0);
      const s = 0.7 + rand() * 0.7;
      dummy.scale.set(s, 1, s);
      dummy.updateMatrix();
      dw.setMatrixAt(i, dummy.matrix);
    }
    g.add(dw);

    // 草丛 ×20(小锥簇,单件高 0.13~0.21):集中路西与近山山脚——路边 9 + 山脚 8 + 东侧草地 3
    // D2:逐丛抽一次签从 leafPalette 取实例色(白底材质 × instanceColor)
    const tuftGeo = new THREE.ConeGeometry(0.06, 0.16, 5);
    const tuft = new THREE.InstancedMesh(tuftGeo, toon(0xffffff, { flatShading: true }), 20);
    tuft.frustumCulled = false;
    const pts = S.path.points; // 路径折线
    const railAt = x => 5 - x / 4; // 股道中心线 z(x) = 8 - (x+12)/4
    for (let i = 0; i < 20; i++) {
      let px, pz;
      if (i < 9) { // 路边
        const seg = Math.floor(rand() * (pts.length - 1));
        const t = rand();
        px = pts[seg][0] + (pts[seg + 1][0] - pts[seg][0]) * t + (rand() - 0.5) * 1.2;
        pz = pts[seg][1] + (pts[seg + 1][1] - pts[seg][1]) * t + (rand() - 0.5) * 1.2;
      } else if (i < 17) { // 近山山脚(山南侧)
        const m = S.mountainNear.peaks[Math.floor(rand() * S.mountainNear.peaks.length)];
        px = m.x + (rand() - 0.5) * 3;
        pz = m.z + 1 + rand() * 1.5;
      } else { // 东侧草地 x∈[4.5,11] z∈[-2,5.5],避开股道/站台
        for (let tries = 0; tries < 10; tries++) {
          px = 4.5 + rand() * 6.5;
          pz = -2 + rand() * 7.5;
          if (Math.abs(pz - railAt(px)) > 1.3) break;
        }
      }
      dummy.position.set(px, 0.08, pz);
      dummy.rotation.set((rand() - 0.5) * 0.3, rand() * Math.PI, (rand() - 0.5) * 0.3);
      const s = 0.8 + rand() * 0.5;
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      tuft.setMatrixAt(i, dummy.matrix);
      tuft.setColorAt(i, new THREE.Color(cfg.leafPalette[Math.floor(rand() * cfg.leafPalette.length)])); // 固定一次抽签
    }
    g.add(tuft);

    // 石 ×8(压扁多面体,田埂角与路边)
    const stoneGeo = new THREE.DodecahedronGeometry(0.06, 0);
    const stone = new THREE.InstancedMesh(stoneGeo, toon(cfg.rail, { flatShading: true }), 8);
    stone.frustumCulled = false;
    const gridW = P.cols * P.blockW + (P.cols - 1) * P.ridgeW;
    const gridD = P.rows * P.blockD + (P.rows - 1) * P.ridgeW;
    for (let i = 0; i < 8; i++) {
      const onRidge = i < 5;
      const px = onRidge
        ? P.origin[0] + rand() * gridW // 田区南北埂缘
        : pts[0][0] + (rand() - 0.5) * 2; // 路边
      const pz = onRidge
        ? (rand() < 0.5 ? P.origin[1] - P.ridgeW * 0.7 : P.origin[1] + gridD + P.ridgeW * 0.7)
        : pts[0][1] + (rand() - 0.5) * 2;
      dummy.position.set(px, 0.03, pz);
      dummy.rotation.set(rand() * Math.PI, rand() * Math.PI, 0);
      const s = 0.6 + rand() * 1.0;
      dummy.scale.set(s, s * 0.55, s);
      dummy.updateMatrix();
      stone.setMatrixAt(i, dummy.matrix);
    }
    g.add(stone);
  }

  // ---------- D3 人物摆动(spec-d3 §5,rest=现姿势,相位 φ 一律 0) ----------
  g.userData.update = (t) => {
    const wF = Math.sin(2 * Math.PI * 0.55 * t); // 农夫 0.55Hz
    fTorso.rotation.x = 0.72 + 0.055 * wF;
    fArmL.rotation.x = 1.15 + 0.085 * wF;
    fArmR.rotation.x = 1.15 + 0.060 * wF; // 双臂同相,幅度差 0.025 破对称
    fHat.rotation.x = 0.72 + 0.04 * wF;
    flagPivot.rotation.z = 0.22 * Math.sin(2 * Math.PI * 0.9 * t);   // 站长挥旗 0.9Hz
    scGrp.rotation.z = 0.02 * Math.sin(2 * Math.PI * 0.35 * t);      // 稻草人微晃 0.35Hz
  };

  return g;
}
