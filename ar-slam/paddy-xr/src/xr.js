// xr.js — D5 WebXR 任意平面 AR(装配层与网页版/MindAR 版共用 scene-common.js)
// 路线依据:tech-challenges #10 A1 判定表第 1 行——Reno14 hit-test 工作正常(ARCore 1.56),直接空间放置不走图卡
// 主路径:hit-test(point+plane)→ 绿圈指示 → 点屏放置 → XRAnchor 每帧跟随漂移校正;再点屏换位置
// 借鉴 dmvrg/webxr-ar-suika 三细节:①会话 8s 无命中自动兜底摆位(免操作)②pixelRatio 封顶+单向降级 ③放置 pop-in 动画(零库自实现,不用 GSAP)
// 反面教材已规避:suika 用 three 默认 local-floor 参考空间——本机(OPPO)只支持 local/viewer,显式 'local' 否则黑屏(W2 踩坑)
import * as THREE from '../vendor/three.module.min.js?v=20261006140150';
import { parseParams, loadCfg, applyEnvironment, addLights, buildModules } from './scene-common.js?v=20261006140150';

const SCENE_WIDTH_M = 0.5;        // 桌面放置真实宽度(m)。沿用 W2 尺度假设(MindAR 卡宽 21cm 太小),实测后再调
const AUTO_PLACE_MS = 25000;      // suika 式兜底:会话内无命中超过此时长自动放镜头前方。A1 实测首命中 19.1s,8s 给早了(迭代③)
const FALLBACK_FORWARD_M = 1.2;   // 兜底放置:镜头水平前方距离
const FALLBACK_DROP_M = 1.0;      // 兜底放置:视点下方估测桌面高度
const POP_DURATION = 0.3;         // 放置 pop-in 时长(s)
const DPR_STEPS = [1.5, 1.25, 1.0]; // M3 D8:自适应 DPR 单向降级,永不回升(首档即 suika 式封顶)
const FPS_TARGET = 28;            // 降级触发线(验收线 ≥30,留 2 帧余量)

function easeOutBack(t) { // pop-in 缓动(零库;suika 用 GSAP power2.out,此处带轻微回弹更"放上去"感)
  const c1 = 1.70158, c3 = c1 + 1, u = t - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
}

// D5 迭代①:初始化全链路打点(真机卡"初始化中"排障——最后一行日志即卡点)
function log(msg) {
  console.log('[xr]', msg);
  window.__dbgLog && window.__dbgLog(msg);
}

async function start() {
  log('页面加载完成,开始初始化 three r' + THREE.REVISION);
  const { season, time, tParam, animOn: animOnParam } = parseParams(location.search);
  log(`参数: season=${season} time=${time} anim=${animOnParam ? 'on' : 'off'} t=${tParam}`);
  const { cfg, usedSeason, usedTime } = await loadCfg(season, time);
  log('config/scene.json 加载完成');
  let animOn = animOnParam;

  const btnEnter = document.getElementById('btn-enter');
  const badge = document.getElementById('dbg');

  // ---- 能力检测(Fail Loud;只记录标志,场景装配照常走完——不支持时也能渲非 AR 预览/跑遥测,桌面冒烟可覆盖) ----
  // 迭代①:isSessionSupported 加 5s 超时——OPPO 浏览器有 requestSession 挂起前科(W2),promise 永不 settle 会卡死初始化
  let xrSupported = false;
  if (navigator.xr) {
    const r = await Promise.race([
      navigator.xr.isSessionSupported('immersive-ar').then(v => ({ v }), e => ({ err: String(e) })),
      new Promise(res => setTimeout(() => res({ timeout: true }), 5000))
    ]);
    if (r.timeout) log('⚠ isSessionSupported 5s 无响应(疑浏览器挂起),按不支持处理');
    else if (r.err) log('isSessionSupported 抛错: ' + r.err);
    else xrSupported = r.v === true;
  } else {
    log('navigator.xr 不存在');
  }
  log('immersive-ar 支持: ' + xrSupported);

  // ---- three.js 基本盘 ----
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0); // AR 合成需要透明清屏,否则相机画面被黑底盖住
  let dprStep = 0;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, DPR_STEPS[0])); // suika 式封顶:高 DPR 手机 XR 帧率隐患
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  // 本机(OPPO)不支持 three.js 默认的 local-floor 参考空间(enabledFeatures 只有 local/viewer),
  // 显式降为 local,否则 setSession 内部 requestReferenceSpace 直接抛 NotSupportedError → 黑屏
  renderer.xr.setReferenceSpaceType('local');
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = cfg.exposure ?? 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    document.documentElement.dataset.webgl = '0';
    window.__reportErr && window.__reportErr('WebGL context lost');
  });
  document.body.appendChild(renderer.domElement);
  log('renderer 创建完成 WebGL' + (renderer.getContext() instanceof WebGL2RenderingContext ? 2 : 1));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  applyEnvironment(renderer, scene, cfg, { background: false }); // AR 画布透明;雾距离 30+ 在放置尺度下天然惰性
  log('PMREM 环境贴图完成');

  // ---- 沙盘装配:模块+灯光进 diorama 组(灯光随内容同旋转,保住 D2 验收相对光照),holder 管世界定位/锚定 ----
  const diorama = new THREE.Group();
  const { modules, updaters } = buildModules(cfg);
  for (const m of modules) diorama.add(m);
  addLights(diorama, cfg);
  log('场景模块装配完成(' + modules.length + ' 模块)');
  const bbox = new THREE.Box3().setFromObject(diorama); // 变换前局部包围盒
  const S = SCENE_WIDTH_M / bbox.getSize(new THREE.Vector3()).x;
  log('缩放系数 S=' + S.toFixed(5) + '(场景宽→' + SCENE_WIDTH_M + 'm)');
  diorama.scale.setScalar(S);
  diorama.position.y = -bbox.min.y * S; // 底座裙底贴 y=0,不沉入桌面
  const holder = new THREE.Group();
  holder.add(diorama);
  holder.visible = false;
  scene.add(holder);

  // ---- 放置指示圈(沿用 W2 惯例:绿圈) ----
  const reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.08, 0.1, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x4caf50 })
  );
  reticle.visible = false;
  reticle.matrixAutoUpdate = false;
  scene.add(reticle);

  // ---- XR session 状态 ----
  let xrSession = null;
  let hitTestSource = null;
  let hitTestSourceLocal = null; // 迭代④:对照路
  let localSpace = null;
  let placedAnchor = null;
  let pendingAnchorPos = null; // 迭代④:锚点创建排队到下一个有效 XRFrame(select 事件帧 lastFrame 已失效,真机实锤)
  let placed = false;
  let everHit = false;
  let sessionStartAt = 0;
  let popT = 1; // pop-in 进度(1=完成)

  let entering = false;
  async function enterAR() {
    if (!xrSupported || entering || xrSession) return; // 防重入:双击/连点会直接撞 InvalidStateError
    entering = true;
    btnEnter.disabled = true;
    // 残留会话回收:上一个 session 未正常结束时 getSession() 能拿到,先 end 掉
    const stale = renderer.xr.getSession?.();
    if (stale) { try { await stale.end(); } catch {} }
    // 最小 feature 集(W2 地雷:dom-overlay/plane-detection 曾致 requestSession 在 OPPO 上挂起,先不加)
    try {
      xrSession = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['anchors'],
      });
    } catch (e) {
      log('requestSession 失败: ' + e.name + ': ' + e.message);
      window.__reportErr && window.__reportErr('进入 AR 失败: ' + e.name + ': ' + e.message);
      entering = false;
      btnEnter.disabled = false;
      return;
    }
    log('requestSession 成功 enabledFeatures: ' + [...xrSession.enabledFeatures].join(','));
    await renderer.xr.setSession(xrSession);
    localSpace = await xrSession.requestReferenceSpace('local');
    const viewerSpace = await xrSession.requestReferenceSpace('viewer');
    // entityTypes 默认仅 ['plane'](规范);显式加 'point'——特征点命中对平面检测依赖弱(A1 三路全命中,双保险)
    hitTestSource = await xrSession.requestHitTestSource({ space: viewerSpace, entityTypes: ['point', 'plane'] });
    // 迭代④:对照探测——A1 裸 WebXR 命中、本会话 50s 零命中,配置逐项相同。再开一路 local 空间命中源,
    //  quirky 浏览器实现若只支持其一,日志 5s 打点的 V/L 计数会直接分晓
    try {
      hitTestSourceLocal = await xrSession.requestHitTestSource({ space: localSpace, entityTypes: ['point', 'plane'] });
      log('hitTestSource(viewer+local 双路)就绪');
    } catch (e) {
      log('hitTestSource(local) 请求失败(仅 viewer 路): ' + e.name);
    }
    sessionStartAt = performance.now();
    everHit = false;

    xrSession.addEventListener('select', place);
    xrSession.addEventListener('end', () => {
      xrSession = null;
      hitTestSource = null;
      hitTestSourceLocal = null;
      placedAnchor = null;
      pendingAnchorPos = null;
      entering = false;
      btnEnter.disabled = false;
      document.getElementById('enterwrap').style.display = '';
      document.documentElement.dataset.xr = '0';
    });

    document.getElementById('enterwrap').style.display = 'none';
    document.documentElement.dataset.xr = '1';
    entering = false;
  }
  btnEnter.addEventListener('click', enterAR);

  function place() {
    // 用 rAF 缓存的命中位姿——A1 迭代②地雷:select 事件帧上 getViewerPose 在 OPPO 抛 InvalidStateError
    if (lastHitPose) {
      placeAt(new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(lastHitPose.transform.matrix)), 'hit');
    } else if (lastViewerPose) {
      placeAt(fallbackPosition(lastViewerPose), 'fallback-tap');
    }
  }

  function fallbackPosition(viewerPose) { // suika 式:镜头水平前方固定距离,视点下方估桌面
    const t = viewerPose.transform;
    const camQuat = new THREE.Quaternion(t.orientation.x, t.orientation.y, t.orientation.z, t.orientation.w);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camQuat);
    fwd.y = 0; // 只取水平朝向,沙盘直立
    fwd.normalize();
    const pos = new THREE.Vector3(t.position.x, t.position.y, t.position.z).addScaledVector(fwd, FALLBACK_FORWARD_M);
    pos.y = t.position.y - FALLBACK_DROP_M;
    return pos;
  }

  const anchorMat = new THREE.Matrix4();
  function placeAt(pos, how) {
    holder.position.copy(pos);
    holder.quaternion.identity();
    holder.visible = true;
    placed = true;
    popT = 0; // 触发 pop-in
    holder.scale.setScalar(0.001);
    navigator.vibrate?.(120); // 沿用 B1 惯例:非文字反馈
    window.paddy.xr.placed = how;
    log('已放置(' + how + ') @ ' + pos.x.toFixed(2) + ',' + pos.y.toFixed(2) + ',' + pos.z.toFixed(2));

    // anchors 可用则创建世界锚点,抗 ARCore 漂移校正;重放时先删旧锚。
    // 迭代④:统一排队到下一个 rAF——XRFrame 仅在回调内有效,select 事件帧里直接 createAnchor 必抛(真机实锤)
    if (placedAnchor) { try { placedAnchor.delete(); } catch {} placedAnchor = null; }
    pendingAnchorPos = pos.clone();
    placedPos0 = pos.clone(); // 漂移采样基准(迭代③)
  }

  // ---- 帧循环 ----
  let lastHitPose = null;
  let lastViewerPose = null;
  let lastFrame = null;
  let placedPos0 = null;   // 漂移采样基准(迭代③)
  let lastStatAt = 0;      // 周期打点计时
  const clock = new THREE.Clock();
  let tAnim = tParam ?? 0;
  let frames = 0;
  const dts = [];
  let lowWindows = 0;

  window.paddy = {
    ready: false, drawCalls: 0, triangles: 0, fps: 0, fpsP95: 0, season: usedSeason, time: usedTime,
    anim: { on: animOn, t: 0 },
    xr: { hit: false, placed: false, anchor: false },
    setAnim(on) {
      animOn = !!on;
      if (tParam === null) tAnim = 0;
      window.paddy.anim.on = animOn;
    }
  };
  window.__paddy = { scene, renderer, camera, holder, THREE }; // D5 调试全局

  log('渲染循环启动');
  renderer.setAnimationLoop((time, frame) => {
    lastFrame = frame || null;
    if (frames === 0) log('首个渲染帧到达');
    const dt = Math.min(clock.getDelta(), 0.05);
    if (frame && hitTestSource && localSpace) {
      lastViewerPose = frame.getViewerPose(localSpace); // 每帧缓存,放置用最新位姿(不在事件帧取)
      // 迭代④:排队的锚点在有效帧内创建
      if (pendingAnchorPos) {
        const pos = pendingAnchorPos;
        pendingAnchorPos = null;
        if (xrSession.enabledFeatures.includes('anchors')) {
          const xf = new XRRigidTransform({ x: pos.x, y: pos.y, z: pos.z });
          frame.createAnchor(xf, localSpace)
            .then((a) => { placedAnchor = a; window.paddy.xr.anchor = true; log('锚点已创建'); })
            .catch((e) => { window.paddy.xr.anchor = 'failed(静态放置)'; log('锚点创建失败(静态放置): ' + e.message); });
        }
      }
      const hitsV = frame.getHitTestResults(hitTestSource);
      const hitsL = hitTestSourceLocal ? frame.getHitTestResults(hitTestSourceLocal) : [];
      const hits = hitsV.length ? hitsV : hitsL; // 优先 viewer 路
      if (hits.length > 0) {
        if (!everHit) { // 迭代③:首命中打点+震动(会话内 DOM 不可见,震动=唯一非文字反馈)
          log(`hit-test 首命中 @ ${((performance.now() - sessionStartAt) / 1000).toFixed(1)}s(${hitsV.length ? 'viewer' : 'local'}路,共 ${hits.length} 个)`);
          navigator.vibrate?.(60);
        }
        everHit = true;
        lastHitPose = hits[0].getPose(localSpace);
        window.paddy.xr.hit = true;
        if (lastHitPose) {
          reticle.visible = true;
          reticle.matrix.fromArray(lastHitPose.transform.matrix);
        }
      } else {
        lastHitPose = null;
        reticle.visible = false;
        window.paddy.xr.hit = false;
      }
      // 迭代③:周期打点(5s)——未放置报命中状态,已放置报锚点漂移/视点距离
      // 判读:走开 2~3m 后,锚点Δ≈0=世界锁定正常;锚点Δ≈走动距离=local 空间/锚点头耦合(钉不住的根因)
      const nowMs = performance.now();
      if (nowMs - lastStatAt > 5000 && nowMs - sessionStartAt > 5000) {
        lastStatAt = nowMs;
        const t = ((nowMs - sessionStartAt) / 1000).toFixed(0);
        if (!placed) {
          log(`[${t}s] 找平面中… 命中V/L=${hitsV.length}/${hitsL.length} viewerPose=${lastViewerPose ? 'OK' : 'null'}`);
        } else if (lastViewerPose && placedPos0) {
          const vp = lastViewerPose.transform.position;
          const dV = Math.hypot(vp.x - holder.position.x, vp.y - holder.position.y, vp.z - holder.position.z);
          const drift = holder.position.distanceTo(placedPos0);
          log(`[${t}s] 锚点Δ=${drift.toFixed(2)}m 视点↔模型=${dV.toFixed(2)}m 命中=${window.paddy.xr.hit ? '✓' : '×'}`);
        }
      }
      // suika 式兜底:会话内超 AUTO_PLACE_MS 仍无命中且未放置 → 自动放镜头前方,免用户干等
      if (!placed && !everHit && performance.now() - sessionStartAt > AUTO_PLACE_MS && lastViewerPose) {
        placeAt(fallbackPosition(lastViewerPose), 'auto-fallback');
      }
      // 每帧从锚点取位姿,跟随 ARCore 漂移校正
      if (placed && placedAnchor) {
        const pose = frame.getPose(placedAnchor.anchorSpace, localSpace);
        if (pose) {
          anchorMat.fromArray(pose.transform.matrix);
          holder.position.setFromMatrixPosition(anchorMat);
        }
      }
    }

    // pop-in 动画(suika 细节③,零库自实现)
    if (popT < 1) {
      popT = Math.min(1, popT + dt / POP_DURATION);
      holder.scale.setScalar(Math.max(0.001, easeOutBack(popT)));
    }

    if (animOn && tParam === null) tAnim += dt;
    for (const u of updaters) u(tAnim);
    renderer.render(scene, camera);

    // fps 遥测:滑动窗 120 帧,p95(最差 5%)帧耗时换算 fps(与 ar.js 同款)
    frames++;
    dts.push(dt);
    if (dts.length > 120) dts.shift();
    if (frames % 30 === 0 && dts.length >= 60) {
      const sorted = [...dts].sort((a, b) => b - a);
      const fpsP95 = Math.round(1 / sorted[Math.floor(sorted.length * 0.95)]);
      window.paddy.fpsP95 = fpsP95;
      document.documentElement.dataset.fpsP95 = String(fpsP95);
      // D8 单向降级:连续两窗低于触发线 → DPR 降一档
      if (frames % 120 === 0) {
        if (fpsP95 < FPS_TARGET && dprStep < DPR_STEPS.length - 1) {
          if (++lowWindows >= 2) {
            dprStep++;
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, DPR_STEPS[dprStep]));
            document.documentElement.dataset.dprStep = String(dprStep);
            lowWindows = 0;
          }
        } else lowWindows = 0;
      }
      if (badge) badge.textContent =
        `fps ${window.paddy.fps} | p95 ${fpsP95} | ${window.paddy.xr.hit ? '命中✓' : '找平面'} | ${placed ? '已放置(' + window.paddy.xr.placed + ')' : '未放置'} | dpr ${DPR_STEPS[dprStep]}`;
    }
    window.paddy.drawCalls = renderer.info.render.calls;
    window.paddy.triangles = renderer.info.render.triangles;
    window.paddy.anim.t = +(((tAnim % 23) + 23) % 23).toFixed(2);
    if (dt > 0) window.paddy.fps = Math.round(1 / dt);
    if (frames === 3) {
      window.paddy.ready = true;
      document.documentElement.dataset.ready = '1';
      const el = document.getElementById('loading');
      if (el) el.remove();
      if (!xrSupported) {
        document.documentElement.dataset.noxr = '1';
        window.__reportErr && window.__reportErr('此设备/浏览器不支持 WebXR immersive-ar(可用 ar.html 图卡保底版)');
      } else {
        btnEnter.disabled = false; // 场景就绪才允许进入(模型/灯光已装配)
      }
    }
  });
}

start().catch((e) => {
  console.error(e);
  log('初始化失败: ' + ((e && (e.stack || e.message)) || String(e)));
  window.__reportErr && window.__reportErr('WebXR 初始化失败: ' + ((e && (e.stack || e.message)) || String(e)));
});
