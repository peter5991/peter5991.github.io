// architecture.js — 农舍 + 小车站 + 铁轨 + 静态列车(D1 全静态,春+昼)
// 契约:export function buildArchitecture(ctx) → THREE.Group
// 所有颜色/尺寸取自 cfg(config/scene.json seasons.spring.day),随机一律走 ctx.rand
import * as THREE from '../vendor/three.module.min.js?v=20261006132413';

export function buildArchitecture(ctx) {
  const { toon, M, B, C, outline, textTex, rand, cfg } = ctx;
  const S = cfg.sizes;
  const g = new THREE.Group();
  g.name = 'architecture';

  // 材质缓存:同名 cfg 色只建一份 MeshToonMaterial
  const mats = {};
  const mat = (k) => (mats[k] ||= toon(cfg[k]));

  // ---------- D2:夜光与雪(spec §3.3/§3.4;null/disabled 时零开销零分支残留) ----------
  const ng = cfg.nightGlow || null;
  // 门窗纹理材质:夜景同一张 Canvas 纹理同时作 map 与 emissiveMap,透出暖光
  const glowTexMat = (tex) => ng
    ? toon(0xffffff, { map: tex, emissive: new THREE.Color(ng.window), emissiveMap: tex, emissiveIntensity: ng.emissiveIntensity })
    : toon(0xffffff, { map: tex });
  const snowOn = !!(cfg.snow && cfg.snow.enabled);
  const snowMat = snowOn ? toon(cfg.snow.color) : null;
  const snowT = snowOn ? cfg.snow.thickness : 0;
  // 双坡屋面雪板 ×2:顺坡面,四周内缩 0.03;置于屋架局部系(长轴沿 x,脊在 z=0,底 y=baseY)
  function gableSnow(widthAcross, height, length, baseY) {
    const grp = new THREE.Group();
    const ang = Math.atan2(height, widthAcross / 2);
    const slopeLen = Math.hypot(widthAcross / 2, height);
    for (const s of [-1, 1]) {
      const slab = new THREE.Mesh(B(length - 0.06, snowT, slopeLen - 0.06), snowMat);
      slab.rotation.x = s * ang;
      slab.position.set(0, baseY + height / 2 + snowT * 0.5, s * widthAcross / 4);
      grp.add(slab);
    }
    return grp;
  }

  // ---------- 共享 Canvas 纹理 ----------
  const FONT = '"Hiragino Sans","Noto Sans JP",sans-serif';
  // 木框格窗(窗棂分格)
  const winTex = textTex(128, 128, (c, w, h) => {
    c.fillStyle = cfg.trunk; c.fillRect(0, 0, w, h);
    c.fillStyle = cfg.paddyWater; c.fillRect(14, 14, w - 28, h - 28);
    c.fillStyle = cfg.trunk;
    c.fillRect(w / 2 - 4, 14, 8, h - 28);
    c.fillRect(14, h / 2 - 4, w - 28, 8);
  });
  // 木板门
  const doorTex = textTex(96, 144, (c, w, h) => {
    c.fillStyle = cfg.stationWall; c.fillRect(0, 0, w, h);
    c.strokeStyle = cfg.trunk; c.lineWidth = 4;
    for (let x = 0; x <= w; x += 24) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
    c.strokeRect(2, 2, w - 4, h - 4);
    c.fillStyle = cfg.outline;
    c.beginPath(); c.arc(w - 18, h / 2, 6, 0, Math.PI * 2); c.fill();
  });
  // 竖排站牌 "稻香站"
  const signTex = textTex(128, 384, (c, w, h) => {
    c.fillStyle = cfg.houseWall; c.fillRect(0, 0, w, h);
    c.strokeStyle = cfg.stationRoof; c.lineWidth = 10; c.strokeRect(5, 5, w - 10, h - 10);
    c.fillStyle = cfg.outline;
    c.font = `bold 78px ${FONT}`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    '稻香站'.split('').forEach((ch, i) => c.fillText(ch, w / 2, 76 + i * 116));
  });
  // 时刻表牌
  const timeTex = textTex(128, 96, (c, w, h) => {
    c.fillStyle = cfg.houseWall; c.fillRect(0, 0, w, h);
    c.fillStyle = cfg.stationRoof; c.fillRect(0, 0, w, 22);
    c.fillStyle = cfg.houseWall;
    c.font = `bold 14px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('时刻表', w / 2, 11);
    c.strokeStyle = cfg.outline; c.lineWidth = 1.5;
    for (let y = 34; y < h - 6; y += 12) {
      c.beginPath(); c.moveTo(8, y); c.lineTo(w - 8, y); c.stroke();
      c.beginPath(); c.moveTo(12, y - 6); c.lineTo(52, y - 6); c.stroke();
    }
  });
  // 列车车窗带(深色底 + 4 窗格)
  const trainWinTex = textTex(256, 48, (c, w, h) => {
    c.fillStyle = cfg.outline; c.fillRect(0, 0, w, h);
    c.fillStyle = cfg.trainBodyTop;
    for (let i = 0; i < 4; i++) c.fillRect(12 + i * 62, 8, 48, h - 16);
  });

  // ---------- 双坡屋顶(悬挑出檐,Extrude 三角棱柱) ----------
  function gableRoof(widthAcross, height, length, m) {
    const sh = new THREE.Shape();
    sh.moveTo(-widthAcross / 2, 0);
    sh.lineTo(widthAcross / 2, 0);
    sh.lineTo(0, height);
    sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: length, bevelEnabled: false });
    geo.translate(0, 0, -length / 2);
    geo.rotateY(Math.PI / 2); // 挤出轴转到 x(长轴沿 x)
    return new THREE.Mesh(geo, m);
  }

  // ========== 农舍 ==========
  function buildHouse() {
    const H = S.house;
    const [hx, hz] = H.position;
    const house = new THREE.Group();
    house.position.set(hx, 0, hz);

    // 墙体(大件描边)+ 勒脚基座 + 角柱分面
    const walls = M(B(H.w, H.wallH, H.d), mat('houseWall'), 0, H.wallH / 2, 0, 1.03, cfg.outline);
    walls.castShadow = true;
    house.add(walls);
    house.add(M(B(H.w + 0.08, 0.14, H.d + 0.08), mat('ridgeSoil'), 0, 0.07, 0));
    const corner = B(0.08, H.wallH, 0.08);
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      house.add(M(corner, mat('stationWall'), sx * (H.w / 2 - 0.02), H.wallH / 2, sz * (H.d / 2 - 0.02)));

    // 双坡屋顶(出檐 overhang)
    const roof = gableRoof(H.d + H.overhang * 2, H.roofH, H.w + H.overhang * 2, mat('houseRoof'));
    roof.position.y = H.wallH;
    roof.castShadow = true;
    outline(roof, 1.03, cfg.outline);
    house.add(roof);

    // 烟囱(含压顶石),穿过屋顶
    house.add(M(B(0.3, H.roofH + 0.55, 0.3), mat('scarecrowCloth'), 1.0, H.wallH + (H.roofH + 0.55) / 2 - 0.1, -0.4));
    house.add(M(B(0.42, 0.08, 0.42), mat('platform'), 1.0, H.wallH + H.roofH + 0.4, -0.4));

    // 门(南面)+ 窗×3(南 2、东 1);夜景纹理自发光暖光
    const door = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.85), glowTexMat(doorTex));
    door.position.set(-0.8, 0.43, H.d / 2 + 0.011);
    house.add(door);
    const winGeo = new THREE.PlaneGeometry(0.45, 0.45);
    const winMat = glowTexMat(winTex);
    for (const wx of [0.15, 0.95]) {
      const win = new THREE.Mesh(winGeo, winMat);
      win.position.set(wx, 0.58, H.d / 2 + 0.011);
      house.add(win);
    }
    const winE = new THREE.Mesh(winGeo, winMat);
    winE.position.set(H.w / 2 + 0.011, 0.58, 0);
    winE.rotation.y = Math.PI / 2;
    house.add(winE);

    // 门前台阶 2 级
    house.add(M(B(0.7, 0.08, 0.3), mat('platform'), -0.8, 0.04, H.d / 2 + 0.18));
    house.add(M(B(0.6, 0.08, 0.24), mat('platform'), -0.8, 0.12, H.d / 2 + 0.1));
    // 双坡顶积雪(两片薄板顺坡面)
    if (snowOn) house.add(gableSnow(H.d + H.overhang * 2, H.roofH, H.w + H.overhang * 2, H.wallH));
    return house;
  }
  g.add(buildHouse());

  // 夜景点光 ×2(全场仅这两盏,不投影):农舍窗前 + 站房雨棚下,照亮小片地面成"光池"
  if (ng) {
    const hl = new THREE.PointLight(ng.lamp, 0.6, 4, 2);
    hl.position.set(S.house.position[0] + 0.55, 0.85, S.house.position[1] + S.house.d / 2 + 0.35);
    g.add(hl);
  }

  // ---------- 农舍院落小件(世界坐标):篱笆×5、晾衣绳+衣物×3、水桶、锄头 ----------
  const fenceZ = -4.8, fenceX0 = -2.6, seg = 0.6;
  const postGeo = C(0.025, 0.03, 0.38, 6);
  for (let i = 0; i <= 5; i++)
    g.add(M(postGeo, mat('trunk'), fenceX0 + i * seg + (rand() - 0.5) * 0.04, 0.19, fenceZ));
  for (let i = 0; i < 5; i++) {
    const cx = fenceX0 + (i + 0.5) * seg;
    g.add(M(B(seg, 0.03, 0.02), mat('trunk'), cx, 0.28, fenceZ));
    g.add(M(B(seg, 0.03, 0.02), mat('trunk'), cx, 0.14, fenceZ));
  }

  // 晾衣绳(两杆一绳 + 衣物 3 件),置于农舍东侧院落,面向默认相机可见
  const lineX = -2.35;
  g.add(M(C(0.02, 0.025, 0.95, 6), mat('trunk'), lineX, 0.475, -2.9));
  g.add(M(C(0.02, 0.025, 0.95, 6), mat('trunk'), lineX, 0.475, -4.5));
  const rope = M(C(0.008, 0.008, 1.6, 4), mat('outline'), lineX, 0.9, -3.7);
  rope.rotation.x = Math.PI / 2;
  g.add(rope);
  const clothGeo = new THREE.PlaneGeometry(0.16, 0.22);
  ['farmerTop', 'trainBodyTop', 'scarecrowCloth'].forEach((k, i) => {
    const cl = new THREE.Mesh(clothGeo, toon(cfg[k], { side: THREE.DoubleSide }));
    cl.position.set(lineX, 0.78, -4.2 + i * 0.5 + (rand() - 0.5) * 0.06);
    g.add(cl);
  });

  // 水桶 + 墙角锄头
  g.add(M(C(0.09, 0.07, 0.16, 10), mat('rail'), -6.3, 0.08, -2.45));
  const hoe = new THREE.Group();
  const handle = M(C(0.015, 0.015, 0.7, 6), mat('trunk'), 0, 0.35, 0);
  const blade = M(B(0.14, 0.1, 0.02), mat('rail'), 0, 0.05, 0.02);
  hoe.add(handle, blade);
  hoe.position.set(-3.1, 0, -2.06);
  hoe.rotation.x = -0.35;
  g.add(hoe);

  // ========== 小车站 ==========
  // 股道几何提前算出(站台组要与股道平行布置)
  const [x1, z1] = S.rail.from, [x2, z2] = S.rail.to;
  const dx = x2 - x1, dz = z2 - z1;
  const L = Math.hypot(dx, dz);
  const rotY = Math.atan2(-dz, dx);
  const TRACK_CLEAR = 0.62; // 轨心两侧净距(列车半宽 0.375 + 余量),包络内不放任何立杆/台体

  function buildStation() {
    const st = S.station;
    const [sx, sz] = st.position;
    const bw = st.building.w, bd = st.building.d;
    const wallH = st.building.h - 0.35; // 墙高,0.35 留给屋顶,总高 ≈1.4
    const sta = new THREE.Group();

    // 站台组:与股道平行(局部 x 沿轨、z 横向,+z=股道南侧),南沿距轨心 TRACK_CLEAR,
    // 站房放进站台组同旋转、南墙贴站台北沿——小站真实形制(站房平行股道当站台后墙),杜绝轴对齐房与旋转台穿模
    const pf = st.platform;
    const anchorZ = z1 + (sx - x1) * dz / dx; // 站房中心 x 处的轨心 z
    const plat = new THREE.Group();
    plat.position.set(sx, 0, anchorZ);
    plat.rotation.y = rotY;
    sta.add(plat);
    const pfLz = -(TRACK_CLEAR + pf.d / 2);   // 站台中心局部 z(轨道北侧)
    const bldLz = pfLz - pf.d / 2 - bd / 2;   // 站房中心局部 z(南墙与站台北沿平齐)
    const platform = M(B(pf.w, pf.h, pf.d), mat('platform'), 0, pf.h / 2, pfLz);
    platform.receiveShadow = true;
    plat.add(platform);
    // 站台边警示白线(0.04 宽贴条)
    plat.add(M(B(pf.w - 0.2, 0.012, 0.04), mat('trainBodyTop'), 0, pf.h + 0.006, -(TRACK_CLEAR + 0.12)));

    // 站房(大件描边,局部坐标随站台组旋转)
    const walls = M(B(bw, wallH, bd), mat('stationWall'), 0, wallH / 2, bldLz, 1.035, cfg.outline);
    walls.castShadow = true;
    plat.add(walls);
    const roof = gableRoof(bd + 0.3, 0.35, bw + 0.3, mat('stationRoof'));
    roof.position.set(0, wallH, bldLz);
    roof.castShadow = true;
    outline(roof, 1.03, cfg.outline);
    plat.add(roof);

    // 站房门(开向站台,门底=站台面)+ 窗(南 1、东 1);夜景纹理自发光暖光
    const sdoor = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.8), glowTexMat(doorTex));
    sdoor.position.set(-0.5, pf.h + 0.4, bldLz + bd / 2 + 0.011);
    plat.add(sdoor);
    const swinMat = glowTexMat(winTex);
    const swin = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), swinMat);
    swin.position.set(0.45, 0.6, bldLz + bd / 2 + 0.011);
    plat.add(swin);
    const swinE = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), swinMat);
    swinE.position.set(bw / 2 + 0.011, 0.6, bldLz);
    swinE.rotation.y = Math.PI / 2;
    plat.add(swinE);

    // 雨棚 1 片 + 支柱×3(直径 0.05,落站台面,全在轨道包络外)
    const canLz = pfLz - 0.05;
    plat.add(M(B(pf.w - 0.5, 0.06, 0.8), mat('stationRoof'), 0, 1.5, canLz));
    for (const px of [-1.6, 0, 1.6])
      plat.add(M(C(0.025, 0.025, 1.5 - pf.h, 8), mat('stationWall'), px, (1.5 + pf.h) / 2, -(TRACK_CLEAR + 0.25)));
    // 站房屋顶积雪(顺坡面)+ 雨棚下点光(夜)
    if (snowOn) {
      const rs = gableSnow(bd + 0.3, 0.35, bw + 0.3, wallH);
      rs.position.z = bldLz;
      plat.add(rs);
    }
    if (ng) {
      // 灯位降到站台面上方(pf.h+0.35),远离 y=1.5 棚板;光池落在棚前站台地面,棚顶不再被烤出光斑
      const pl = new THREE.PointLight(ng.lamp, 0.7, 2.6, 2);
      pl.position.set(0, pf.h + 0.35, canLz);
      plat.add(pl);
    }

    // 站牌(竖排 textTex,站台西端轨侧,牌面朝向股道/东南相机)
    // 西端远离站房(站房偏站台东侧),轨侧 z 出檐篷包络(檐篷 z∈[pfLz-0.45,pfLz+0.35]),杜绝穿模
    const signX = -(pf.w / 2 - 0.2), signZ = pfLz + pf.d / 2 - 0.16;
    plat.add(M(C(0.03, 0.03, 1.35, 8), mat('outline'), signX, pf.h + 0.675, signZ - 0.05)); // 杆在牌板背后,不外露
    plat.add(M(B(0.4, 1.1, 0.04), mat('stationRoof'), signX, pf.h + 1.05, signZ));
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 1.04), toon(0xffffff, { map: signTex }));
    sign.position.set(signX, pf.h + 1.05, signZ + 0.021);
    plat.add(sign);

    // 长椅(靠站房一侧,面朝股道)
    const benchX = -1.5, benchZ = pfLz - 0.1;
    for (const lx of [-0.38, 0.38])
      plat.add(M(B(0.05, 0.18, 0.24), mat('trunk'), benchX + lx, pf.h + 0.09, benchZ));
    plat.add(M(B(0.9, 0.05, 0.26), mat('trunk'), benchX, pf.h + 0.2, benchZ));
    plat.add(M(B(0.9, 0.24, 0.04), mat('trunk'), benchX, pf.h + 0.38, benchZ - 0.12));

    // 时刻表牌(双柱 + textTex 表格,站房门前站台面上)
    const ttX = -0.3, ttZ = pfLz + 0.12;
    for (const lx of [-0.25, 0.25])
      plat.add(M(C(0.02, 0.02, 0.85, 6), mat('outline'), ttX + lx, pf.h + 0.425, ttZ));
    plat.add(M(B(0.66, 0.5, 0.03), mat('stationWall'), ttX, pf.h + 0.75, ttZ));
    const tt = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.44), toon(0xffffff, { map: timeTex }));
    tt.position.set(ttX, pf.h + 0.75, ttZ + 0.016);
    plat.add(tt);

    // 信号灯(股道南侧对侧,距轨心 >0.6 包络外;放在列车东端以外,避免遮挡车体,杆高 1.1 头 0.12)
    const sigX = sx + 3.6; // ≈4.6,列车东端(≈2.85)以外
    const sigZ = (z1 + (sigX - x1) * dz / dx) + 0.7; // 轨心南侧 0.7,包络外
    sta.add(M(C(0.025, 0.03, 1.1, 8), mat('outline'), sigX, 0.55, sigZ));
    // 灯头组与股道同向,灯片在 -x 面(沿轨回望列车)——出站信号机形制,司机前视可见
    const sigHead = new THREE.Group();
    sigHead.position.set(sigX, 0, sigZ);
    sigHead.rotation.y = rotY;
    sigHead.add(M(B(0.12, 0.24, 0.08), mat('baseSkirt'), 0, 1.16, 0));
    // 灯片放大 1.5 倍(夜景红点需在 800px 截图占 3-4 像素)
    const lampGeo = new THREE.CylinderGeometry(0.048, 0.048, 0.03, 10);
    // 红灯:夜景 emissive 透亮(spec §3.4),signal 用独立 signalIntensity(更强),昼景保持无光红片;独立材质不污染 mat 缓存
    const lampRMat = ng
      ? toon(cfg.trainBody, { emissive: new THREE.Color(ng.signal), emissiveIntensity: ng.signalIntensity ?? ng.emissiveIntensity })
      : mat('trainBody');
    // 红灯头改小盒体(六面 emissive):原薄片沿股道朝来车方向,对东南默认相机是侧棱,夜里红光点不可见
    const lampR = M(B(0.06, 0.08, 0.05), lampRMat, -0.07, 1.21, 0);
    const lampG = M(lampGeo, mat('leaf'), -0.07, 1.09, 0);
    lampG.rotation.z = Math.PI / 2;
    sigHead.add(lampR, lampG);
    sta.add(sigHead);
    return sta;
  }
  g.add(buildStation());

  // ========== 铁轨(斜穿底座,局部系:x 沿轨,z 横向) ==========
  const track = new THREE.Group();
  track.position.set((x1 + x2) / 2, 0, (z1 + z2) / 2);
  track.rotation.y = rotY;
  g.add(track);

  // 道砟条带(宽 1.1 扁条贴地)
  track.add(M(B(L, 0.04, 1.1), mat('sleeper'), 0, 0.02, 0));

  // 枕木 InstancedMesh(间距 0.45,数量由长度推出)
  const sl = S.rail.sleeper;
  const nSleeper = Math.floor(L / sl.spacing) + 1;
  const sleeperIM = new THREE.InstancedMesh(B(sl.d, sl.h, sl.w), mat('sleeper'), nSleeper);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < nSleeper; i++) {
    dummy.position.set(-L / 2 + i * sl.spacing, 0.04 + sl.h / 2, 0);
    dummy.updateMatrix();
    sleeperIM.setMatrixAt(i, dummy.matrix);
  }
  track.add(sleeperIM);

  // 双钢轨(细长 Box,轨距 0.5)
  const rs = S.rail.railSection;
  const railTopY = 0.04 + sl.h + rs; // 轨顶标高
  for (const szz of [-S.rail.gauge / 2, S.rail.gauge / 2])
    track.add(M(B(L, rs, rs), mat('rail'), 0, 0.04 + sl.h + rs / 2, szz));

  // ========== 静态列车(2 节,停在站台旁) ==========
  const T = S.train;
  const tMid = (T.tRange[0] + T.tRange[1]) / 2;
  const train = new THREE.Group();
  train.position.set(x1 + dx * tMid, 0, z1 + dz * tMid);
  train.rotation.y = rotY;
  g.add(train);

  function buildCar(isHead) {
    const car = new THREE.Group();
    const w2 = T.width / 2;
    // 转向架×2 + 底架裙板
    for (const bx of [-0.65, 0.65])
      car.add(M(B(0.55, 0.14, T.width - 0.15), mat('baseSkirt'), bx, 0.07, 0));
    car.add(M(B(T.carLength * 0.92, 0.12, T.width - 0.13), mat('baseSkirt'), 0, 0.09, 0));
    // 车身:腰线以下珊瑚红,以上米白
    const lower = M(B(T.carLength, T.beltlineY, T.width), mat('trainBody'), 0, 0.15 + T.beltlineY / 2, 0, 1.02, cfg.outline);
    const upperH = T.height - 0.15 - T.beltlineY - 0.1; // 0.1 留给弧顶
    const upper = M(B(T.carLength, upperH, T.width), mat('trainBodyTop'), 0, 0.15 + T.beltlineY + upperH / 2, 0, 1.02, cfg.outline);
    lower.castShadow = upper.castShadow = true;
    car.add(lower, upper);
    // 车顶弧面(压扁圆柱)
    const roofGeo = new THREE.CylinderGeometry(w2, w2, T.carLength, 14);
    roofGeo.rotateZ(Math.PI / 2);
    const roofM = new THREE.Mesh(roofGeo, mat('trainRoof'));
    roofM.scale.y = 0.28;
    roofM.position.y = 0.15 + T.beltlineY + upperH;
    roofM.castShadow = true;
    outline(roofM, 1.02, cfg.outline);
    car.add(roofM);
    // 车顶薄雪条(贴弧顶,内缩 0.03)
    if (snowOn)
      car.add(M(B(T.carLength - 0.06, snowT, T.width * 0.6), snowMat, 0, 0.15 + T.beltlineY + upperH + w2 * 0.28 + snowT / 2, 0));
    // 车窗带(textTex 深色底 4 窗格,两侧);夜景窗格透暖光
    const bandY = 0.15 + T.beltlineY + upperH / 2;
    const bandMat = glowTexMat(trainWinTex);
    for (const sd of [-1, 1]) {
      const band = new THREE.Mesh(new THREE.PlaneGeometry(T.carLength * 0.86, upperH * 0.8), bandMat);
      band.position.set(0, bandY, sd * (w2 + 0.006));
      if (sd < 0) band.rotation.y = Math.PI;
      car.add(band);
      // 车门(每侧 1,共 ×2)
      const tdoor = M(B(0.3, 0.58, 0.02), mat('trainBodyTop'), 0.78, 0.44, sd * (w2 + 0.006));
      car.add(tdoor);
    }
    if (isHead) {
      // 车头前窗
      const cab = M(B(0.02, upperH * 0.7, T.width * 0.7), mat('outline'), T.carLength / 2 + 0.006, bandY, 0);
      car.add(cab);
    }
    return car;
  }

  const carOff = (T.carLength + T.gap) / 2;
  const head = buildCar(true);
  head.position.set(carOff, railTopY, 0);
  const tail = buildCar(false);
  tail.position.set(-carOff, railTopY, 0);
  train.add(head, tail);
  // 节间连接风挡
  train.add(M(B(T.gap * 0.8, 0.5, T.width * 0.8), mat('baseSkirt'), 0, railTopY + 0.45, 0));

  // ========== D3 动效(spec-d3):列车单向过线(§2 修订)+ 炊烟(§3)+ 蒸汽(§4) ==========
  // 铁律:全部为绝对时间 t 的纯函数,零 rand 消耗,rest(t=0)= D2 静态
  // §2 修订(2026-09-27 用户裁定):不做尽头折返——驶出地图外消失→间隔 5s→从西端重新驶入,单向西→东
  const LOOP = 23, U_ST = 0.525, U_OUT_W = -0.13, U_OUT_E = 1.13; // 出界位:车尾完全过端点(半长≈0.097u)
  const easeIn = (x) => x * x * x;
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);
  const sstep = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
  // 时序表闭式分段:t=loop 内时间;返回 {u 沿轨参数, east 恒 true(单向过线)}
  // P0 [0,3) 站台停=rest | P1 [3,10) 加速驶离出图 | P2 [10,15) 间隔(图外隐藏) | P3 [15,23) 西端驶入减速进站
  function trainState(t) {
    const tl = ((t % LOOP) + LOOP) % LOOP;
    let u;
    if (tl < 3) u = U_ST;                                              // P0 站台停 3s = rest
    else if (tl < 10) u = U_ST + (U_OUT_E - U_ST) * easeIn((tl - 3) / 7);   // P1 驶离:加速东行出图
    else if (tl < 15) u = U_OUT_E;                                     // P2 间隔 5s(隐藏)
    else u = U_OUT_W + (U_ST - U_OUT_W) * easeOut((tl - 15) / 8);      // P3 西端驶入:减速进站
    return { u, east: true };
  }

  // §3.2/§4:泡体共享几何;InstancedMesh 单 draw call,初始化全零缩放 + 全写 smoke 色(spec §7.5)
  const puffGeo = new THREE.IcosahedronGeometry(1, 0);
  const smokeC = new THREE.Color(cfg.smoke);
  const fogC = new THREE.Color(cfg.fog.color);
  const tmpC = new THREE.Color();
  const animDummy = new THREE.Object3D();
  function makePuffs(n, opacity) {
    const im = new THREE.InstancedMesh(puffGeo,
      new THREE.MeshBasicMaterial({ transparent: true, opacity, depthWrite: false }), n);
    im.frustumCulled = false;
    animDummy.position.set(0, -10, 0);
    animDummy.rotation.set(0, 0, 0);
    animDummy.scale.setScalar(0);
    animDummy.updateMatrix();
    for (let i = 0; i < n; i++) { im.setMatrixAt(i, animDummy.matrix); im.setColorAt(i, smokeC); }
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.instanceColor.setUsage(THREE.DynamicDrawUsage);
    g.add(im);
    return im;
  }
  const smokeIM = makePuffs(8, 0.42);  // §3 炊烟(农舍烟囱发射口 (-3.5, 2.26, -3.9))
  const steamIM = makePuffs(6, 0.5);   // §4 蒸汽(t≡3.0 驶离站台瞬间)
  const SMOKE_P = 3.2, STEAM_LIFE = 1.5, EV = [3.0]; // §4 修订:单向过线后驶离事件每循环仅一次(t≡3)

  g.userData.update = (t) => {
    // 列车:只改 position.xz 与可见性(单向恒朝东;车尾完全过端点即隐藏,§2 修订)
    const st = trainState(t);
    train.position.set(x1 + dx * st.u, 0, z1 + dz * st.u);
    train.rotation.y = rotY;
    train.visible = st.u > -0.10 && st.u < 1.10;

    // 炊烟(§3.2):8 泡交错 birth=i×0.4,age<0 隐藏(t=0 全灭 = rest)
    for (let i = 0; i < 8; i++) {
      const age = t - i * 0.4;
      let s = 0;
      if (age >= 0) {
        const k = (age % SMOKE_P) / SMOKE_P;
        s = (0.05 + 0.20 * (1 - (1 - k) * (1 - k))) * sstep(0, 0.08, k) * (1 - sstep(0.90, 1, k));
        animDummy.position.set(
          -3.5 + 0.32 * k + 0.05 * Math.sin(2 * Math.PI * 2 * k + i * 1.3),
          2.26 + 1.7 * k,
          -3.9 + 0.06 * Math.sin(2 * Math.PI * 1.5 * k + i * 2.1)
        );
        smokeIM.setColorAt(i, tmpC.copy(smokeC).lerp(fogC, sstep(0.55, 1, k)));
      }
      animDummy.scale.setScalar(s);
      animDummy.updateMatrix();
      smokeIM.setMatrixAt(i, animDummy.matrix);
    }
    smokeIM.instanceMatrix.needsUpdate = true;
    smokeIM.instanceColor.needsUpdate = true;

    // 蒸汽(§4):6 实例服务单次驶离事件(窗口 [3,5.25]);发射口随闭式 u(t) 走
    for (let j = 0; j < 6; j++) {
      let s = 0;
      for (const ev of EV) {
        const a = ((t - ev - 0.15 * j) % LOOP + LOOP) % LOOP;
        if (a < STEAM_LIFE) {
          const k = a / STEAM_LIFE;
          const stE = trainState(ev + 0.15 * j);
          const th = stE.east ? rotY : rotY + Math.PI;
          const hx = Math.cos(th), hz = -Math.sin(th); // 车头方向(局部 +x 的世界向)
          const bx = x1 + dx * stE.u, bz = z1 + dz * stE.u;
          s = (0.05 + 0.17 * (1 - (1 - k) * (1 - k))) * sstep(0, 0.06, k) * (1 - sstep(0.85, 1, k));
          animDummy.position.set(
            bx + 2.33 * hx - hx * 0.5 * k,
            0.78 + 1.35 * easeOut(k),
            bz + 2.33 * hz - hz * 0.5 * k + 0.04 * Math.sin(2 * Math.PI * 2 * k + j * 1.1)
          );
          steamIM.setColorAt(j, tmpC.copy(smokeC).lerp(fogC, sstep(0.35, 1, k)));
          break;
        }
      }
      animDummy.scale.setScalar(s);
      animDummy.updateMatrix();
      steamIM.setMatrixAt(j, animDummy.matrix);
    }
    steamIM.instanceMatrix.needsUpdate = true;
    steamIM.instanceColor.needsUpdate = true;
  };

  return g;
}
