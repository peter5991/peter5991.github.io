// ar.js — D4 MindAR 图卡 AR 入口(装配层与网页版共用 scene-common.js)
// 锚定:底座宽 24 单位 = 图卡宽(锚点坐标图宽=1);rotation.x=π/2 把场景 +y 立出卡面、+z(前景稻田)朝卡面底边
// 遥测三件套(M3 D5):window.__paddy 句柄 + dataset 关键指标 + 屏上 debug 角标(手机联调替代 console)
import * as THREE from '../vendor/three.module.min.js';
import { MindARThree } from '../vendor/mindar-image-three.prod.js';
import { parseParams, loadCfg, applyEnvironment, addLights, buildModules } from './scene-common.js?v=20261008144729';

const DPR_STEPS = [1.5, 1.25, 1.0]; // M3 D8:自适应 DPR 单向降级,永不回升
const FPS_TARGET = 28;              // 降级触发线(验收线 ≥30,留 2 帧余量)

// 初始化分阶段打点:#loading 浮在 veil 之上,真机黑屏时最后一条阶段文字=卡点(2026-10-08 真机黑屏排障)
function stage(s) {
  const el = document.getElementById('loading');
  if (el) el.textContent = s;
}

async function start() {
  stage('脚本已加载,读取配置…');
  const { season, time, tParam, animOn: animOnParam } = parseParams(location.search);
  const { cfg, usedSeason, usedTime } = await loadCfg(season, time);
  stage('配置已加载,初始化 MindAR…');
  let animOn = animOnParam;

  // MindARThree 自建 renderer/scene/camera;摄像头视频走 DOM 衬底,WebGL 画布透明叠其上
  const mindarThree = new MindARThree({
    container: document.body,
    imageTargetSrc: './assets/paddy-card.mind',
  });
  const { renderer, scene, camera } = mindarThree;
  let dprStep = 0;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, DPR_STEPS[0]));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = cfg.exposure ?? 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    document.documentElement.dataset.webgl = '0';
    window.__reportErr && window.__reportErr('WebGL context lost');
  });

  applyEnvironment(renderer, scene, cfg, { background: false }); // AR 画布透明;雾距离 30+ 在锚点尺度下天然惰性

  // 模块装配后整体挂锚点;灯光放 diorama 组内——随内容同旋转,保住 D2 验收的相对光照
  stage('装配场景模块…');
  const anchor = mindarThree.addAnchor(0);
  const diorama = new THREE.Group();
  const { modules, updaters } = buildModules(cfg);
  for (const m of modules) diorama.add(m);
  addLights(diorama, cfg);
  const S = 1 / 24;
  const bbox = new THREE.Box3().setFromObject(diorama); // 变换前局部包围盒,min.y=底座裙底
  diorama.scale.setScalar(S);
  diorama.rotation.x = Math.PI / 2;
  diorama.position.z = -bbox.min.y * S; // 裙底贴卡面,不沉入
  anchor.group.add(diorama);

  // 追踪状态计数(E4 oracle:手持 30s 丢失 0 次)
  let trackLost = 0, tracked = false;
  anchor.onTargetFound = () => { tracked = true; document.documentElement.dataset.tracking = '1'; };
  anchor.onTargetLost = () => { tracked = false; trackLost++; document.documentElement.dataset.tracking = '0'; document.documentElement.dataset.trackLost = String(trackLost); };

  // 渲染循环(官方模式:mindar 管追踪,用户驱动 render)+ 动画时钟(spec-d3 §6.3 同款)
  const clock = new THREE.Clock();
  let tAnim = tParam ?? 0;
  let frames = 0;
  const dts = [];
  let lowWindows = 0;
  const badge = document.getElementById('dbg');
  window.paddy = {
    ready: false, drawCalls: 0, triangles: 0, fps: 0, fpsP95: 0, season: usedSeason, time: usedTime,
    anim: { on: animOn, t: 0 },
    setAnim(on) {
      animOn = !!on;
      if (tParam === null) tAnim = 0;
      window.paddy.anim.on = animOn;
    }
  };
  window.__paddy = { scene, renderer, camera, mindar: mindarThree, anchor, THREE }; // D5 调试全局

  // 摄像头启动看门狗:start() 挂起(权限弹窗未出现/摄像头被占用)时不抛错=无声黑屏(2026-10-08 真机实锤)。
  // 只报告不拒绝——若只是慢,成功路径不受影响
  stage('启动摄像头(如出现权限弹窗请允许)…');
  const startWatchdog = setTimeout(() => {
    window.__reportErr && window.__reportErr('摄像头启动 20s 无响应:请检查 ①权限弹窗是否被忽略/永久拒绝(设置-网站设置-摄像头) ②摄像头是否被其他应用占用 ③换个浏览器试');
  }, 20000);
  await mindarThree.start(); // 摄像头权限在此请求;拒绝则抛错走 catch
  clearTimeout(startWatchdog);
  stage('摄像头已启动,渲染中…');

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (animOn && tParam === null) tAnim += dt;
    for (const u of updaters) u(tAnim);
    renderer.render(scene, camera);
    frames++;
    // fps 遥测:滑动窗 120 帧,p95(最差 5%)帧耗时换算 fps
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
        `fps ${window.paddy.fps} | p95 ${fpsP95} | ${tracked ? '追踪✓' : '寻找图卡'} | 丢失 ${trackLost} | dpr ${DPR_STEPS[dprStep]}`;
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
    }
  });
}

start().catch((e) => {
  console.error(e);
  // mind-ar 的 start() 可能以 undefined 拒绝(摄像头缺失/拒绝授权),容错展示
  const why = e ? String((e.stack || e.message) || e) : 'mind-ar 未给出原因(通常是摄像头权限被拒绝或设备无摄像头)';
  window.__reportErr && window.__reportErr('AR 启动失败(请确认已授权摄像头): ' + why);
});
