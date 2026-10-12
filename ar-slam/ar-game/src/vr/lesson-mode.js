// lesson-mode.js — 讲解模式:锁定输入,镜头接管给时间轴 cam.*;字幕/章节/参与门/跳过/回归
// 复用 lesson-core(magnifier/specimen)+ vr-field(按簇枯黄/虫群/定位圈);埋点走 analytics.track
// 可选参数(默认保持 VR 行为):
//   url          时间轴 JSON(默认相对 ./lessons/vr-planthopper.json?v=20261012103431,部署到子路径也能解析)
//   onCam        传入后不再直驱相机,改为 onCam(P, snapshot) 回调(AR 侧接软引导)
//   trackPrefix  埋点事件前缀(默认 'vr',AR 传 'ar')
//   magScale/specScale  放大镜/标本整体缩放(AR 视距远,可调大)
import * as THREE from '../../vendor/three.module.js?v=20261012103431';
import { loadTimeline } from '../lesson-core/timeline.js?v=20261012103431';
import { buildMagnifier } from '../lesson-core/magnifier.js?v=20261012103431';
import { buildSpecimen } from '../lesson-core/specimen.js?v=20261012103431';
import { buildSwarm, buildMarker } from './vr-field.js?v=20261012103431';
import { track } from '../analytics.js?v=20261012103431';

const BUBBLE_LIFT = 0.8; // 放大镜球心高出稻簇的世界高度(v4 稻簇高 ~0.45,球已缩到 ~0.075 倍)

export async function createLessonMode({ scene, camera, ui, damage, url = './lessons/vr-planthopper.json?v=20261012103431',
  onCam = null, trackPrefix = 'vr', magScale = 0.075, specScale = 0.16, contentFrame = null }) {
  const tl = await loadTimeline(url);
  const trigger = tl.trigger;
  const patches = tl.field.patches;
  const focus = new THREE.Vector3(...tl.focus);
  const specAnchor = new THREE.Vector3(...tl.specimen);

  // contentFrame:内容(放大镜/标本/虫群/定位圈)的父节点。默认挂在 scene(世界坐标,VR/陀螺仪沙盘)。
  // 图卡模式挂进锚点 holder(模型局部坐标,随卡动+缩放)——世界坐标的相机由 contentFrame.matrixWorld 换算。
  const contentParent = contentFrame || scene;
  const camAz = Math.atan2(tl.params['cam.px'] - tl.params['cam.tx'], tl.params['cam.pz'] - tl.params['cam.tz']);
  const mag = buildMagnifier({ camAz, waterColor: '#7fb3d9', scale: magScale });
  const spec = buildSpecimen({ camAz, scale: specScale });
  const ev = (name, data) => track(trackPrefix + '_' + name, data);
  const swarm = buildSwarm(patches, 0.13);
  const marker = buildMarker(tl.focus);
  contentParent.add(mag.root, spec.root, swarm.mesh, marker.mesh);

  const state = {
    active: false,
    T: 0,
    playing: false,
    waiting: null, // 当前等待的 gate
    cleared: new Set(),
    waitStart: 0
  };

  // ---- UI 事件 ----
  ui.btnSkip.addEventListener('click', () => { if (state.active) finish(true); });
  ui.btnGate.addEventListener('click', () => { if (state.waiting) clearGate(state.waiting); });
  addEventListener('keydown', (e) => {
    if (!state.active) return;
    if (e.code === 'Escape') finish(true);
    if (e.code === 'Space') { e.preventDefault(); state.playing = !state.playing; ui.setPlaying(state.playing); }
  });
  // 章节条按钮 → seek(在 createLessonMode 返回后由 main 绑定,此处元素尚未填充)
  // 见 vr.js: lesson.tl 加载后绑定

  function seek(t) {
    state.T = t;
    // 越过视为已通过(严格大于;t 正好等于门时刻不算越过,便于调试停在门前)
    for (const g of tl.gates) if (t > g.t) state.cleared.add(g.id);
    state.waiting = null;
    ui.hideGate();
    state.playing = true;
    ui.setPlaying(true);
  }

  // 调试/验收用:把时钟钉在某时刻(仍走闭式快照),并手动触发该时刻的门
  function pinAt(t) {
    state.T = t;
    state.playing = false;
    ui.setPlaying(false);
    const gate = tl.gates.find((g) => !state.cleared.has(g.id) && Math.abs(g.t - t) < 0.2);
    if (gate) {
      state.waiting = gate;
      state.waitStart = t;
      ui.showGate(gate);
    }
  }

  function clearGate(g) {
    state.cleared.add(g.id);
    ev('gate_done', { id: g.id, waitSec: +(state.T - state.waitStart).toFixed(1) });
    state.waiting = null;
    ui.hideGate();
    state.playing = true;
    ui.setPlaying(true);
  }

  function start(avatar, world) {
    state.active = true;
    state.T = 0;
    state.playing = true;
    state.cleared.clear();
    state.waiting = null;
    // 把角色放到病斑旁的田埂上(画面一侧,和原课"农民站在田边"一致)
    if (avatar && trigger.avatarAt) {
      avatar.root.position.set(trigger.avatarAt[0], 0, trigger.avatarAt[2]);
      const gy = world ? world.groundAt(trigger.avatarAt[0], trigger.avatarAt[2]) : null;
      avatar.root.position.y = gy ?? trigger.avatarAt[1];
      avatar.root.rotation.y = trigger.avatarYaw ?? 0;
      avatar.update({ x: 0, z: 0 }, 0, avatar.root.position.y, 0.016);
    }
    ui.enterLesson(tl);
    ui.setPlaying(true);
    ev('lesson_start', { id: tl.id });
  }

  function finish(skipped) {
    if (skipped) ev('lesson_skip', { T: +state.T.toFixed(1) });
    else ev('lesson_end', { duration: tl.duration });
    state.active = false;
    state.playing = false;
    state.waiting = null;
    ui.hideGate();
    ui.exitLesson();
    // 田块恢复漫游初值
    damage.setSpread(patches, trigger.restSpread ?? 0);
  }

  // 图卡模式:内容挂在锚点 holder(局部坐标)下,而 mag/spec 的 update 需要世界坐标相机做 billboard/特征面。
  // 每帧把世界相机换算进 holder 局部坐标喂给它们,位置/朝向就都对了。
  const _contentCam = new THREE.PerspectiveCamera();
  const _m4 = new THREE.Matrix4();
  const contentCamera = () => {
    if (!contentFrame) return camera;
    contentFrame.updateWorldMatrix(true, false);
    _m4.copy(contentFrame.matrixWorld).invert();
    _contentCam.position.copy(camera.position).applyMatrix4(_m4);
    _contentCam.quaternion.copy(camera.quaternion).premultiply(
      new THREE.Quaternion().setFromRotationMatrix(_m4.extractRotation(new THREE.Matrix4())));
    return _contentCam;
  };

  // 每帧:推进时钟(遇门停住)、按快照驱动画面
  function update(dt) {
    if (!state.active) return;
    if (state.playing) {
      let next = Math.min(state.T + dt, tl.duration);
      const gate = tl.nextGate(next, state.cleared);
      if (gate && next >= gate.t) {
        state.T = gate.t;
        state.waiting = gate;
        state.waitStart = gate.t;
        state.playing = false;
        ui.showGate(gate);
        ui.setPlaying(false);
      } else {
        state.T = next;
        if (state.T >= tl.duration) { finish(false); return; }
      }
    }
    const P = tl.snapshot(state.T);
    // 相机:onCam 传入则交给回调(AR 软引导),否则直驱(VR)
    if (onCam) onCam(P);
    else {
      camera.position.set(P['cam.px'], P['cam.py'], P['cam.pz']);
      camera.lookAt(P['cam.tx'], P['cam.ty'], P['cam.tz']);
    }
    // 画面元素
    damage.setSpread(patches, P['field.spread']);
    swarm.update(P['swarm.arrive'], P['field.spread'], state.T, P['swarm.kill']);
    marker.update(P['marker.on'], state.T);
    const cam = contentCamera();
    mag.update(P, state.T, cam, focus, BUBBLE_LIFT);
    spec.update(P, state.T, cam, specAnchor);
    ui.update(state.T, P, tl);
  }

  return {
    tl, start, finish, update, seek, pinAt, _contentCam,
    // 相机方位可能变化(图卡模式挂锚点):更新放大镜/标本朝向
    setCamAz(az) { mag.setCamAz?.(az); spec.setCamAz?.(az); },
    get active() { return state.active; },
    get waiting() { return state.waiting; },
    get T() { return state.T; }
  };
}
