// card-mode.js — 图卡模式:MindAR 扫卡 → 沙盘(克隆)锚定在卡面上,定位来自图卡,不依赖世界追踪
// 与陀螺仪模式解耦:MindAR 用自己的 renderer/scene/camera + 摄像头,挂在 #cardLayer;
// 沙盘克隆一份挂到锚点(原沙盘在陀螺仪场景里,不能同时做两个父级的子节点)。
// 单 THREE 实例:vite 的 mindar-three-shim 插件保证 mind-ar 与业务代码同一个 three。
import * as THREE from '../../vendor/three.module.js?v=20261015151645';
import { MindARThree } from '../../vendor/mindar-image-three.prod.js?v=20261015151645';
import { buildRiceDamage } from '../vr/vr-field.js?v=20261015151645';
import { createLessonMode } from '../vr/lesson-mode.js?v=20261015151645';
import { textTex } from '../lesson-core/toon.js?v=20261015151645';
import { track } from '../analytics.js?v=20261015151645';

const PICK_R = 46; // 热点屏幕拾取半径(px)

// 归一化:沙盘包围盒宽 → 图卡宽 = 1 个单位(MindAR 锚点坐标系),与 src/ar.js?v=20261015151645 同口径
function normalizeToCard(model) {
  const bbox = new THREE.Box3().setFromObject(model);
  const size = bbox.getSize(new THREE.Vector3());
  model.scale.setScalar(1 / size.x);
  const nb = new THREE.Box3().setFromObject(model);
  const center = nb.getCenter(new THREE.Vector3());
  model.position.sub(center);
  model.position.y -= nb.min.y - center.y; // 底面贴卡平面
}

// 卡面热点:!/? sprite,每帧按内容局部相机 billboard + 反缩放(屏幕恒定)
function buildCardSpots(spotsCfg, holder) {
  function makeSprite(txt, bg) {
    const tex = textTex(96, 96, (c, w, h) => {
      c.beginPath(); c.arc(w / 2, h / 2, 40, 0, Math.PI * 2);
      c.fillStyle = bg; c.fill();
      c.lineWidth = 5; c.strokeStyle = '#fff'; c.stroke();
      c.fillStyle = '#fff'; c.font = 'bold 52px "Microsoft YaHei", sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(txt, w / 2, h / 2 + 3);
    });
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    return s;
  }
  const items = spotsCfg.spots.map((s) => {
    const isLesson = s.kind === 'lesson';
    const mark = makeSprite(s.icon || (isLesson ? '!' : '?'), isLesson ? '#e0a030' : '#5b7d9e');
    const check = makeSprite('✓', '#4e9e52');
    const g = new THREE.Group();
    g.position.set(s.point[0], s.point[1] + 0.3, s.point[2]); // 悬在簇上方(模型局部)
    g.add(mark, check);
    check.visible = false;
    holder.add(g);
    return { spot: s, group: g, mark, check, done: false };
  });
  const v = new THREE.Vector3();
  return {
    items,
    // contentCam: 内容局部坐标相机(lesson-mode 换算)
    update(contentCam, T) {
      for (const it of items) {
        const d = contentCam.position.distanceTo(it.group.position);
        const s = d * 0.22; // 屏幕恒定:按局部距离反缩放
        it.group.scale.setScalar(s);
        it.group.quaternion.copy(contentCam.quaternion);
        it.mark.visible = !it.done;
        it.check.visible = it.done;
        it.group.position.y = it.spot.point[1] + 0.3 + 0.03 * Math.sin(T * 2.4);
      }
    },
    // 屏幕点 → 最近热点(世界坐标投影)
    pick(clientX, clientY, worldCam, rect) {
      let best = null, bestD = PICK_R;
      for (const it of items) {
        it.group.getWorldPosition(v).project(worldCam);
        if (v.z > 1) continue;
        const sx = (v.x * 0.5 + 0.5) * rect.width, sy = (-v.y * 0.5 + 0.5) * rect.height;
        const d = Math.hypot(sx - clientX, sy - clientY);
        if (d < bestD) { bestD = d; best = it; }
      }
      return best;
    },
    setDone(id, v2) { const it = items.find((i) => i.spot.id === id); if (it) it.done = v2; },
  };
}

export function createCardMode({ container, worldSource, spotsCfg, ui }) {
  const mindar = new MindARThree({
    container,
    imageTargetSrc: './ar-card/planthopper-card-v1-gray.mind',
    missTolerance: 30, // 丢卡容忍帧数(0.5s@60fps),与 src/ar.js?v=20261015151645 一致
  });
  const { renderer, scene } = mindar;

  scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x8a7a5a, 1.0));
  const sun = new THREE.DirectionalLight(0xffe3b8, 1.8);
  sun.position.set(5, 8, 3);
  scene.add(sun);

  // 克隆沙盘挂到锚点;MindAR 卡面为 XY、法线 +Z → R_x(+90°) 把模型 +Y 转到 +Z 立在卡上
  const model = worldSource.clone(true);
  normalizeToCard(model);
  const holder = new THREE.Group(); // 内容局部坐标系 = 模型原始单位
  holder.rotation.x = Math.PI / 2;
  holder.add(model);

  const anchor = mindar.addAnchor(0);
  anchor.group.add(holder);

  const damage = buildRiceDamage(model);
  const spots = buildCardSpots(spotsCfg, holder);

  let lesson = null;
  async function loadLesson() {
    lesson = await createLessonMode({
      scene: holder, camera: mindar.camera, ui, damage,
      contentFrame: holder, onCam: () => {}, trackPrefix: 'arc',
      magScale: 0.13, specScale: 0.26,
    });
    return lesson;
  }

  let locked = false;
  anchor.onTargetFound = () => {
    locked = true;
    ui.cardGuideBig.textContent = '✅ 已锁定';
    ui.cardGuideSmall.textContent = '点沙盘上的亮点上课';
    navigator.vibrate?.(120);
    track('ar_card_lock', { on: 1 });
  };
  anchor.onTargetLost = () => {
    locked = false;
    // 讲解中(cardlesson)不弹引导,避免盖字幕;由 ar-game 的 cardlesson class 控制显隐
    ui.cardGuideBig.textContent = '对准图卡…';
    ui.cardGuideSmall.textContent = '沙盘会出现在卡片上';
    track('ar_card_lock', { on: 0 });
  };

  let running = false;
  async function start() {
    try {
      await mindar.start(); // mind-ar 把 getUserMedia 错误吞成 undefined(src/ar.js?v=20261015151645 有同款处理)
    } catch (err) {
      stopCamera(); // 失败也要放掉摄像头,否则一直占着
      throw err;
    }
    running = true;
    track('ar_cardmode_start', {});
  }
  function stopCamera() {
    try { mindar.stop(); } catch { /* 未启动时忽略 */ }
    try { mindar.video?.srcObject?.getTracks?.().forEach((t) => t.stop()); } catch { /* 兜底 */ }
  }
  function stop() {
    if (!running) { stopCamera(); return; }
    renderer.setAnimationLoop(null);
    stopCamera();
    running = false;
  }

  return {
    start, stop, anchor, mindar, model, holder, damage, spots,
    loadLesson, get lesson() { return lesson; },
    get locked() { return locked; }, get running() { return running; },
  };
}
