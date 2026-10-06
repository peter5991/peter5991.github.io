// terrain.js — 底座 + 远山/近山 + 田块/田埂/水口 + 田面水镜 + 田埂小路
// 契约:export function buildTerrain(ctx) -> THREE.Group
// ctx = { THREE, toon, M, B, C, outline, textTex, rand, cfg };一切随机走 ctx.rand,一切颜色/尺寸走 cfg
import * as THREE from '../vendor/three.module.min.js?v=20261006134713';

export function buildTerrain(ctx) {
  const { toon, M, B, C, textTex, rand, cfg } = ctx;
  const S = cfg.sizes;
  const oColor = cfg.outline;
  const g = new THREE.Group();

  // ---------- 1. 底座:顶板(草色) + 内收裙边 + 底足 + 南面铭牌 ----------
  const bs = S.base;
  const footH = 0.14;                                    // 底足厚(略下延,裙边相对它内收 → 可收藏底座感)
  const skirtH = bs.height - bs.topSlabH - footH;
  const skirtW = bs.width - bs.skirtInset * 2;

  const topSlab = M(B(bs.width, bs.topSlabH, bs.depth), toon(cfg.baseTop), 0, -bs.topSlabH / 2, 0);
  topSlab.receiveShadow = true;
  g.add(topSlab);
  g.add(M(B(skirtW, skirtH, skirtW), toon(cfg.baseSkirt), 0, -(bs.topSlabH + skirtH / 2), 0));
  g.add(M(B(bs.width, footH, bs.depth), toon(cfg.baseSkirt), 0, -(bs.height - footH / 2), 0));

  // 铭牌:textTex "春·水稻田",贴南面(+)裙边;浅色底深字,低角度相机下也可读
  const plaqueTex = textTex(512, 112, (c, w, h) => {
    c.fillStyle = cfg.houseWall; c.fillRect(0, 0, w, h);
    c.strokeStyle = cfg.baseSkirt; c.lineWidth = 6; c.strokeRect(10, 10, w - 20, h - 20);
    c.fillStyle = cfg.baseSkirt;
    c.font = '600 56px "Hiragino Sans","Noto Sans JP",sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('春·水稻田', w / 2, h / 2 + 3);
  });
  const plaque = new THREE.Mesh(
    new THREE.PlaneGeometry(bs.plaque.w, bs.plaque.h),
    new THREE.MeshBasicMaterial({ map: plaqueTex })
  );
  plaque.position.set(0, -(bs.topSlabH + skirtH / 2), skirtW / 2 + 0.006);
  g.add(plaque);

  // ---------- 2. 远山:低棱锥 flatShading 剪影;近山:错层 Box(与远山剪影语言拉开) ----------
  // 底宽锁定为脊高×0.9~1.1(宽高比≥0.9),相邻峰底边自然重叠连成山脊线
  // r185 起 MeshToonMaterial 无 flatShading(静默无效),改在几何上去索引+重算法线出硬棱面
  // D2 雪:cfg.snow.enabled 时远山峰顶加雪帽锥、近山台顶贴雪片(spec §3.3;同走硬棱几何,不描边)
  const snowOn = !!(cfg.snow && cfg.snow.enabled);
  const snowMat = snowOn ? toon(cfg.snow.color) : null;
  function flat(geo) {
    const g2 = geo.toNonIndexed();
    g2.computeVertexNormals();
    geo.dispose();
    return g2;
  }
  function mountains(peaks, color, oScale, sink) {
    const mat = toon(color);
    for (const p of peaks) {
      const w = p.h * (0.9 + rand() * 0.2);
      const seg = 5 + Math.floor(rand() * 2);            // 5~6 棱硬棱面
      const rotY = rand() * Math.PI;
      const m = M(flat(new THREE.ConeGeometry(w / 2, p.h, seg)), mat, p.x, p.h / 2 - sink, p.z, oScale, oColor);
      m.rotation.y = rotY;
      g.add(m);
      if (snowOn) {
        // 雪帽:同棱数圆锥段,高=峰高×capRatio,底半径=该高度处截面半径(=底半径×capRatio),坐于峰顶
        const capH = p.h * cfg.snow.capRatio;
        // 底半径放宽 6% + 整体上抬 0.015:雪帽锥面整体罩在峰面外侧,消除共面 z-fighting(梳齿纹)
        const capR = (w / 2) * cfg.snow.capRatio * 1.06;
        const cap = M(flat(new THREE.ConeGeometry(capR, capH, seg)), snowMat, p.x, p.h - capH / 2 - sink + 0.015, p.z);
        cap.rotation.y = rotY;
        g.add(cap);
      }
    }
  }
  // 近山:2~3 层错层方棱台(4 棱锥台=方盒语汇),逐层内收,基部沉入雾带
  // 不描边(靠前/近山色差分层),层间错位/旋转抖动收紧,去掉碎块感
  function boxMountains(peaks, wMin, wMax, color, sink) {
    const mat = toon(color);
    for (const p of peaks) {
      const w = wMin + rand() * (wMax - wMin);
      const layers = 2 + Math.floor(rand() * 2);         // 2~3 层
      const frac = layers === 2 ? [0.62, 0.5] : [0.5, 0.36, 0.28];
      let y = -sink;
      let topY = 0, topR = 0, topRot = Math.PI / 4;      // 顶层顶面参数(雪片用)
      for (let i = 0; i < layers; i++) {
        const lh = p.h * frac[i];
        const rb = (w / 2) * 1.05 * (1 - 0.24 * i);
        const geo = flat(new THREE.CylinderGeometry(rb * 0.62, rb, lh, 4));
        const rot = Math.PI / 4 + (rand() - 0.5) * 0.16;
        const m = M(
          geo, mat,
          p.x + (rand() - 0.5) * w * 0.05, y + lh / 2, p.z + (rand() - 0.5) * w * 0.05
        );
        m.rotation.y = rot;
        g.add(m);
        topY = y + lh; topR = rb * 0.62; topRot = rot;
        y += lh * 0.8;                                   // 20% 叠合,避免层间露缝
      }
      if (snowOn) {
        // 台顶雪片:厚 thickness、四边内缩 0.08 的扁盒(4 棱柱旋转 45° 后顶面是边长 r√2 的方)
        const side = topR * Math.SQRT2 - 0.16;
        const slab = M(B(side, cfg.snow.thickness, side), snowMat, p.x, topY + cfg.snow.thickness / 2, p.z);
        slab.rotation.y = topRot;
        g.add(slab);
      }
    }
  }
  mountains(S.mountainFar.peaks, cfg.mountainFar, 1.02, 0.15);
  boxMountains(S.mountainNear.peaks, S.mountainNear.widthMin, S.mountainNear.widthMax, cfg.mountainNear, 0.1);

  // ---------- 3. 田块:水镜 + 田埂网(纵4横3) + 水口×3(南埂2、东埂1) ----------
  const P = S.paddy;
  const WG = S.waterGate;
  const [ox, oz] = P.origin;                             // 田区西北角(田块区,不含外围埂)
  const rw = P.ridgeW, bw = P.blockW, bd = P.blockD;
  const ridgeMat = toon(cfg.ridgeSoil);
  const cx = i => ox + bw / 2 + i * (bw + rw);           // 田块中心 x
  const cz = r => oz + bd / 2 + r * (bd + rw);           // 田块中心 z
  const vx = i => ox - rw / 2 + i * (bw + rw);           // 纵埂中心线 i=0..3
  const hz = j => oz - rw / 2 + j * (bd + rw);           // 横埂中心线 j=0..2
  const gridD = P.rows * bd + (P.rows + 1) * rw;         // 埂网总深(含外围埂)
  const northZ = oz - rw;

  // 田面水镜:Standard 高金属度低粗糙,scene.environment 供天空反射;每块 0/0.03 微小高差
  const WM = cfg.waterMat;
  for (let r = 0; r < P.rows; r++) {
    for (let c = 0; c < P.cols; c++) {
      const lift = rand() < 0.5 ? 0 : 0.03;
      const rough = WM.roughness * (0.9 + rand() * 0.2);
      const wmat = new THREE.MeshStandardMaterial({
        color: cfg.paddyWater, roughness: rough, metalness: WM.metalness,
        envMapIntensity: WM.envMapIntensity
      });
      const h = P.waterY + lift;
      const w = M(B(bw, h, bd), wmat, cx(c), h / 2, cz(r));
      w.receiveShadow = true;
      g.add(w);
    }
  }

  // 水口槽:埂上缺口 + 水色薄条(共用一条水材质)
  const stripMat = new THREE.MeshStandardMaterial({
    color: cfg.paddyWater, roughness: WM.roughness, metalness: WM.metalness,
    envMapIntensity: WM.envMapIntensity
  });
  function ridge(geo, x, z) {
    const m = M(geo, ridgeMat, x, P.ridgeH / 2, z);
    m.receiveShadow = true;
    g.add(m);
  }

  // 纵埂 4 条通长;东埂(i=cols)在北块范围内开 1 个水口
  const gapZ = oz + bd * 0.25 + rand() * bd * 0.5;
  for (let i = 0; i <= P.cols; i++) {
    if (i === P.cols) {
      const z0 = northZ, z1 = northZ + gridD, g0 = gapZ - WG.w / 2, g1 = gapZ + WG.w / 2;
      ridge(B(rw, P.ridgeH, g0 - z0), vx(i), (z0 + g0) / 2);
      ridge(B(rw, P.ridgeH, z1 - g1), vx(i), (g1 + z1) / 2);
      g.add(M(B(rw + 0.06, 0.02, WG.w), stripMat, vx(i), 0.012, gapZ));
    } else {
      ridge(B(rw, P.ridgeH, gridD), vx(i), northZ + gridD / 2);
    }
  }
  // 横埂 3 条 × 每行 3 段;南埂(j=rows)的第 0、2 段各开 1 个水口
  for (let j = 0; j <= P.rows; j++) {
    for (let i = 0; i < P.cols; i++) {
      if (j === P.rows && i !== 1) {
        const gx = cx(i) + (rand() - 0.5) * bw * 0.5;
        const x0 = cx(i) - bw / 2, x1 = cx(i) + bw / 2;
        ridge(B(gx - WG.w / 2 - x0, P.ridgeH, rw), (x0 + gx - WG.w / 2) / 2, hz(j));
        ridge(B(x1 - gx - WG.w / 2, P.ridgeH, rw), (gx + WG.w / 2 + x1) / 2, hz(j));
        g.add(M(B(WG.w, 0.02, rw + 0.06), stripMat, gx, 0.012, hz(j)));
      } else {
        ridge(B(bw, P.ridgeH, rw), cx(i), hz(j));
      }
    }
  }

  // ---------- 4. 田埂小路:3 折线段 + 内部抖动出蜿蜒,土色略浅于田埂 ----------
  const path = S.path;
  const pathColor = new THREE.Color(cfg.ridgeSoil).lerp(new THREE.Color(cfg.houseWall), 0.3);
  const pathMat = toon(pathColor);
  const pts = path.points.map(p => new THREE.Vector2(p[0], p[1]));
  const knots = [pts[0].clone()];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const n = new THREE.Vector2(-(b.y - a.y), b.x - a.x).normalize();
    for (const t of [1 / 3, 2 / 3]) {
      knots.push(a.clone().lerp(b, t).addScaledVector(n, (rand() - 0.5) * 0.24));
    }
    knots.push(b.clone());
  }
  const tk = path.thickness;
  for (let i = 0; i < knots.length - 1; i++) {
    const a = knots[i], bb = knots[i + 1];
    const len = a.distanceTo(bb);
    const seg = M(B(len + path.width * 0.55, tk, path.width), pathMat,
      (a.x + bb.x) / 2, tk / 2 + 0.004, (a.y + bb.y) / 2);
    seg.rotation.y = -Math.atan2(bb.y - a.y, bb.x - a.x);
    seg.receiveShadow = true;
    g.add(seg);
  }
  for (let i = 1; i < knots.length - 1; i++) {
    const d = M(C(path.width / 2, path.width / 2, tk, 12), pathMat, knots[i].x, tk / 2 + 0.004, knots[i].y);
    d.receiveShadow = true;
    g.add(d);
  }

  return g;
}
