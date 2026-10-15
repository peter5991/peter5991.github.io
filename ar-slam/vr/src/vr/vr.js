// vr.js — VR 稻田漫游页主入口:世界 + 小农民 + 输入 + 相机 + 热点 + 讲解模式
import * as THREE from '../../vendor/three.module.js?v=20261015151645';
import { loadWorld } from './world.js?v=20261015151645';
import { buildAvatar } from './avatar.js?v=20261015151645';
import { createInput } from './input.js?v=20261015151645';
import { createCameraRig } from './camera-rig.js?v=20261015151645';
import { buildHotspot } from './hotspot.js?v=20261015151645';
import { buildRiceDamage } from './vr-field.js?v=20261015151645';
import { createLessonMode } from './lesson-mode.js?v=20261015151645';
import { track } from '../analytics.js?v=20261015151645';

const $ = (id) => document.getElementById(id);

const ui = {
  joystick: $('joystick'), knob: $('knob'),
  btnInteract: $('btnInteract'), btnView: $('btnView'),
  caption: $('caption'), prompt: $('prompt'),
  lessonBar: $('lessonBar'), chapters: $('chapters'), time: $('time'),
  btnSkip: $('btnSkip'), btnGate: $('btnGate'), gatePrompt: $('gatePrompt'),
  title: $('titleCard'), day: $('dayCard'), dayNum: $('dayNum'),
  setPlaying(p) { document.body.classList.toggle('playing', p); },

  enterLesson(tl) {
    document.body.classList.add('lesson');
    this.chapters.innerHTML = '';
    for (const c of tl.chapters) {
      const b = document.createElement('button');
      b.textContent = c.no + ' ' + c.name;
      b.dataset.t = c.t;
      this.chapters.appendChild(b);
    }
  },
  exitLesson() {
    document.body.classList.remove('lesson');
    this.caption.classList.remove('on');
    this.day.style.opacity = 0;
    this.title.style.opacity = 0;
  },
  showGate(g) {
    this.gatePrompt.textContent = g.prompt;
    this.btnGate.textContent = g.button;
    this.btnGate.parentElement.classList.add('on');
  },
  hideGate() { this.btnGate.parentElement.classList.remove('on'); },

  _lastCap: null,
  update(T, P, tl) {
    const cap = tl.captionAt(T);
    if (cap !== this._lastCap) {
      this._lastCap = cap;
      this.caption.classList.toggle('on', !!cap);
      if (cap) this.caption.textContent = cap.text;
    }
    this.title.style.opacity = P['ui.title'];
    this.day.style.opacity = P['ui.dayShow'];
    this.dayNum.textContent = Math.round(P['ui.day']);
    this.caption.style.visibility = this.btnGate.parentElement.classList.contains('on') ? 'hidden' : '';
    const fmt = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
    this.time.textContent = fmt(T) + ' / ' + fmt(tl.duration);
    const ch = tl.chapterAt(T);
    this.chapters.querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.t === ch?.t));
  }
};

async function start() {
  const q = new URLSearchParams(location.search);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  $('app').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#8fb4d9');
  scene.fog = new THREE.Fog('#dfe8e2', 14, 30);
  const camera = new THREE.PerspectiveCamera(innerWidth < innerHeight ? 78 : 62, innerWidth / innerHeight, 0.05, 120);

  const world = await loadWorld(scene, './models/paddy-sandbox/paddy-sandbox-v4.quant.glb?v=20261015151645');
  const avatar = buildAvatar();
  scene.add(avatar.root);
  const input = createInput(renderer.domElement, ui);
  const rig = createCameraRig(camera, avatar, world);

  // 田间层(按簇枯黄)——漫游初值:触发簇微黄
  const damage = buildRiceDamage(world.root);
  const lesson = await createLessonMode({ scene, camera, ui, damage, trigger: {} });
  const trigCfg = lesson.tl.trigger;
  const hotspot = buildHotspot(trigCfg);
  scene.add(hotspot.root);
  damage.setSpread(lesson.tl.field.patches, trigCfg.restSpread ?? 0);

  // 出生点:桥东侧岸边,面向岛内(望向田块)
  avatar.root.position.set(3.0, 0, 1.45);
  const gy0 = world.groundAt(3.0, 1.45);
  if (gy0 !== null) avatar.root.position.y = gy0;
  // 初始看向病斑稻簇(触发点),而非固定方位角
  rig.yaw0 = Math.atan2(3.0 - 1.5, 1.45 - 0.18);
  rig.snap(); // 首帧直接钉到正确机位
  avatar.update({ x: 0, z: 0 }, 0, avatar.root.position.y, 0.016);

  ui.chapters.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) lesson.seek(+b.dataset.t);
  });

  let nearSpot = false;
  let frames = 0;
  const clock = new THREE.Clock();

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (lesson.active) {
      lesson.update(dt);
    } else {
      const inp = input.frame(rig.yaw);
      if (inp.toggleView) rig.toggle();
      // 移动
      const speed = inp.run ? 2.6 : 1.4;
      let vx = inp.move.x * inp.mag * speed * dt;
      let vz = inp.move.z * inp.mag * speed * dt;
      let nx = avatar.root.position.x + vx;
      let nz = avatar.root.position.z + vz;
      [nx, nz] = world.collide(nx, nz);
      const gy = world.groundAt(nx, nz);
      if (gy !== null && Math.abs(gy - avatar.root.position.y) < 0.5) {
        avatar.root.position.x = nx; avatar.root.position.z = nz;
      }
      avatar.update(inp.move, inp.run ? 1 : inp.mag > 0 ? 0.5 : 0, world.groundAt(avatar.root.position.x, avatar.root.position.z) ?? avatar.root.position.y, dt);
      rig.update(dt, inp);
      // 热点
      const d = avatar.root.position.distanceTo(hotspot.pos);
      nearSpot = d < hotspot.radius;
      ui.prompt.classList.toggle('on', nearSpot);
      ui.btnInteract.classList.toggle('show', nearSpot);
      if (nearSpot && inp.interact) {
        ui.prompt.classList.remove('on');
        ui.btnInteract.classList.remove('show');
        lesson.start(avatar, world);
      }
    }
    hotspot.update(clock.elapsedTime, camera.quaternion);
    renderer.render(scene, camera);
    if (++frames === 3) {
      document.documentElement.dataset.ready = '1';
      track('vr_boot', { ua: navigator.userAgent.slice(0, 60) });
    }
  });

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.fov = innerWidth < innerHeight ? 78 : 62;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  // 调试:window.__vr
  window.__vr = { scene, camera, avatar, world, lesson, rig, THREE };
  if (q.get('t') !== null && isFinite(+q.get('t'))) {
    lesson.start(avatar, world);
    lesson.seek(+q.get('t'));
  }
}

start().catch((e) => {
  console.error(e);
  $('prompt').textContent = '加载失败: ' + (e.message || e);
  $('prompt').classList.add('on');
});
