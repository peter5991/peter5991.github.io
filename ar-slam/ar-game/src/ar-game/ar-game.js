// ar-game.js — AR 沙盘页主入口:开始页 → 取景(摄像头/静图) → 放置 → 探索 → 讲解/信息卡
// 状态机:start → scanning → placed(长出) → explore ⇄ lesson / infoCard
// 复用:vr/world(沙盘+光照)、vr/lesson-mode(讲解内核,onCam 接软引导)、vr-field(田间层)
import * as THREE from '../../vendor/three.module.js?v=20261015151645';
import { loadWorld } from '../vr/world.js?v=20261015151645';
import { buildRiceDamage } from '../vr/vr-field.js?v=20261015151645';
import { createLessonMode } from '../vr/lesson-mode.js?v=20261015151645';
import { startPassthrough } from './passthrough.js?v=20261015151645';
import { createGyro } from './gyro.js?v=20261015151645';
import { createArRig } from './ar-rig.js?v=20261015151645';
import { createPlacement } from './placement.js?v=20261015151645';
import { buildHotspots } from './hotspots.js?v=20261015151645';
import { createInfoCard } from './info-card.js?v=20261015151645';
import { createCardMode } from './card-mode.js?v=20261015151645';
import { track } from '../analytics.js?v=20261015151645';

const $ = (id) => document.getElementById(id);

const ui = {
  camLayer: $('camLayer'), start: $('start'), btnStart: $('btnStart'), startErr: $('startErr'),
  startDesc: $('startDesc'), modeRow: $('modeRow'),
  cardLayer: $('cardLayer'), cardGuideBig: $('cardGuideBig'), cardGuideSmall: $('cardGuideSmall'),
  btnShowCard: $('btnShowCard'), cardImgWrap: $('cardImgWrap'), btnCardImgClose: $('btnCardImgClose'),
  scanHint: $('scanHint'), exploreHint: $('exploreHint'), btnCenter: $('btnCenter'),
  caption: $('caption'), title: $('titleCard'), day: $('dayCard'), dayNum: $('dayNum'),
  lessonBar: $('lessonBar'), chapters: $('chapters'), time: $('time'),
  btnSkip: $('btnSkip'), btnGate: $('btnGate'), gatePrompt: $('gatePrompt'),
  infoCard: $('infoCard'), cardName: $('cardName'), cardLines: $('cardLines'), btnCardClose: $('btnCardClose'),

  setPlaying() {}, // AR 侧无播放/暂停按钮(保留 Esc/空格键盘语义在 lesson-mode 里)
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
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  ui.camLayer.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  // 背景透明:取景画面由 passthrough 的 video/静图提供;无雾(“透过摄像头看”)
  const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 60);

  const world = await loadWorld(scene, './models/paddy-sandbox/paddy-sandbox-v4.quant.glb?v=20261015151645');
  const damage = buildRiceDamage(world.root);

  const spotsCfg = await (await fetch('./lessons/ar-hotspots.json?v=20261015151645')).json();
  const spots = buildHotspots(spotsCfg.spots);
  for (const it of spots.items) scene.add(it.root);

  const gyro = createGyro();
  const rig = createArRig(camera, renderer.domElement, gyro);
  const place = createPlacement(scene, camera, world.root);
  const card = createInfoCard(ui, rig);
  const cardClock = new THREE.Clock(); // 图卡模式渲染循环用

  // 讲解内核:onCam → 软引导(手持视角,不锁镜头);视距远,放大镜/标本调大
  const lesson = await createLessonMode({
    scene, camera, ui, damage,
    onCam: (P) => rig.suggest(P['cam.px'], P['cam.py'], P['cam.pz'], P['cam.tx'], P['cam.ty'], P['cam.tz']),
    trackPrefix: 'ar', magScale: 0.11, specScale: 0.22,
  });
  const trigCfg = lesson.tl.trigger;
  damage.setSpread(lesson.tl.field.patches, trigCfg.restSpread ?? 0);

  ui.chapters.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) lesson.seek(+b.dataset.t);
  });

  // ---- 状态机 ----
  let mode = 'start'; // start | scanning | explore | lesson(陀螺仪/图卡共用 lesson 壳)
  let trackMode = 'gyro'; // 'gyro' | 'card'  用户选择的追踪模式
  let cardMode = null;    // 懒创建的 MindAR 实例

  const setBody = (cls) => {
    document.body.classList.remove('scanning', 'exploring');
    if (cls) document.body.classList.add(cls);
  };

  // 模式选择(开始页):高亮 + 改引导文案
  ui.modeRow.addEventListener('click', (e) => {
    const b = e.target.closest('.modeBtn');
    if (!b) return;
    trackMode = b.dataset.mode;
    ui.modeRow.querySelectorAll('.modeBtn').forEach((x) => x.classList.toggle('on', x === b));
    ui.startDesc.innerHTML = trackMode === 'card'
      ? '把摄像头对准图卡，沙盘会立在卡片上。<br>没有卡片可点开始后查看。'
      : '把手机对准桌面，点一下放下一座稻田。<br>拖动转一转，点亮点，听老乡讲稻飞虱。';
    ui.btnStart.textContent = trackMode === 'card' ? '打开摄像头扫卡' : '打开摄像头';
    track('ar_mode_pick', { mode: trackMode });
  });
  ui.btnShowCard.addEventListener('click', () => { ui.cardImgWrap.style.display = 'flex'; });
  ui.btnCardImgClose.addEventListener('click', () => { ui.cardImgWrap.style.display = 'none'; });

  ui.btnStart.addEventListener('click', async () => {
    ui.btnStart.disabled = true;
    if (trackMode === 'card') {
      // 图卡模式:MindAR 自己开摄像头,不走 passthrough
      try {
        cardMode = createCardMode({ container: ui.cardLayer, worldSource: world.root, spotsCfg, ui });
        await Promise.all([cardMode.start(), cardMode.loadLesson()]);
        cardMode.damage.setSpread(cardMode.lesson.tl.field.patches, cardMode.lesson.tl.trigger.restSpread ?? 0);
      } catch (err) {
        ui.startErr.textContent = '摄像头/图卡引擎启动失败: ' + ((err && err.message) || err);
        ui.startErr.style.display = 'block';
        ui.btnStart.disabled = false;
        return;
      }
      ui.start.classList.add('hide');
      document.body.classList.add('cardmode');
      mode = 'card';
      // 渲染循环 + 每帧把内容局部相机方位同步给讲解元素(相机会随卡动)
      const r = cardMode.mindar.renderer;
      const cc = cardMode.lesson._contentCam;
      const azv = new THREE.Vector3();
      r.setAnimationLoop(() => {
        const dt2 = Math.min(cardClock.getDelta(), 0.05);
        const el = cardClock.elapsedTime;
        if (mode === 'card-lesson') {
          cardMode.lesson.update(dt2);
          if (!cardMode.lesson.active) {
            mode = 'card';
            document.body.classList.remove('cardlesson');
            cardMode.spots.setDone('planthopper', true);
          }
        } else {
          cardMode.spots.update(cc, el);
        }
        // 内容局部相机方位 → 放大镜/标本朝向
        azv.copy(cc.position).sub(new THREE.Vector3(...cardMode.lesson.tl.focus));
        cardMode.lesson.setCamAz(Math.atan2(azv.x, azv.z));
        r.render(cardMode.mindar.scene, cardMode.mindar.camera);
      });
      track('ar_start', { mode: 'card' });
      return;
    }
    // 陀螺仪模式(原流程)
    await gyro.requestPermission(); // iOS 须在用户手势里;安卓静默通过
    const ps = await startPassthrough(ui.camLayer);
    if (ps.mode === 'image' && ps.error) {
      ui.startErr.textContent = ps.error + '（已切换模拟取景）';
      ui.startErr.style.display = 'block';
      setTimeout(() => { ui.startErr.style.display = 'none'; }, 5000);
    }
    ui.start.classList.add('hide');
    mode = 'scanning';
    setBody('scanning');
    ui.scanHint.textContent = ps.mode === 'camera' ? '对准桌面，点一下放下稻田' : '点一下画面，放下稻田';
    track('ar_start', { passthrough: ps.mode });
  });

  // 图卡模式:点亮点(MindAR canvas 上拾取)
  let cDownAt = 0, cDownXY = [0, 0];
  ui.cardLayer.addEventListener('pointerdown', (e) => {
    cDownAt = performance.now(); cDownXY = [e.clientX, e.clientY];
  });
  ui.cardLayer.addEventListener('pointerup', (e) => {
    if (!cardMode || mode !== 'card') return;
    const moved = Math.hypot(e.clientX - cDownXY[0], e.clientY - cDownXY[1]);
    if (performance.now() - cDownAt > 400 || moved > 14) return;
    const rect = ui.cardLayer.getBoundingClientRect();
    const it = cardMode.spots.pick(e.clientX - rect.left, e.clientY - rect.top, cardMode.mindar.camera, rect);
    if (!it) return;
    if (it.spot.kind === 'lesson') {
      mode = 'card-lesson';
      document.body.classList.add('cardlesson'); // 隐藏“对准图卡”引导
      cardMode.lesson.start(null, null);
      ui.title.querySelector('.t').textContent = it.spot.title;
      ui.title.querySelector('.s').textContent = it.spot.subtitle || cardMode.lesson.tl.subtitle;
    } else {
      card.open(it.spot); // 信息卡(DOM,屏幕空间,复用)
    }
  });

  // 扫描点击 = 放置;探索点击 = 热点拾取
  let downAt = 0, downXY = [0, 0];
  renderer.domElement.addEventListener('pointerdown', (e) => {
    downAt = performance.now(); downXY = [e.clientX, e.clientY];
  });
  renderer.domElement.addEventListener('pointerup', (e) => {
    const moved = Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]);
    if (performance.now() - downAt > 400 || moved > 12) return; // 拖动不算点
    if (mode === 'scanning') {
      mode = 'explore';
      setBody('exploring');
      place.place();
      rig.setEnabled(true);
      ui.exploreHint.classList.add('on');
      setTimeout(() => ui.exploreHint.classList.remove('on'), 6000);
      track('ar_place', {});
    } else if (mode === 'lesson') {
      return; // 讲解中的点击只算“用户操作”(软引导让权),不退出
    } else if (mode === 'explore') {
      const rect = renderer.domElement.getBoundingClientRect();
      const it = spots.pick(e.clientX - rect.left, e.clientY - rect.top, camera, rect);
      if (!it) { card.close(); return; }
      if (it.spot.kind === 'lesson') {
        card.close();
        mode = 'lesson';
        document.body.classList.remove('exploring');
        const P0 = lesson.tl.snapshot(0);
        rig.adopt(P0['cam.px'], P0['cam.py'], P0['cam.pz']);
        lesson.start(null, world);
        ui.title.querySelector('.t').textContent = it.spot.title;
        ui.title.querySelector('.s').textContent = it.spot.subtitle || lesson.tl.subtitle;
      } else {
        card.close(); // 先关上一张(若开着)
        card.open(it.spot);
      }
    }
  });

  ui.btnCenter.addEventListener('click', () => { gyro.recenter(); rig.markUser(); });

  // ---- 主循环 ----
  const clock = new THREE.Clock();
  let frames = 0;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (mode === 'lesson') {
      lesson.update(dt);
      if (!lesson.active) { // 播完/跳过 → 回探索
        mode = 'explore';
        setBody('exploring');
        rig.clearSuggest();
        spots.setDone('planthopper', true);
      }
    } else {
      place.update(dt);
      spots.update(clock.elapsedTime, camera, renderer.domElement.clientHeight);
    }
    rig.update(dt);
    renderer.render(scene, camera);
    if (++frames === 3) {
      document.documentElement.dataset.ready = '1';
      track('ar_boot', { ua: navigator.userAgent.slice(0, 60) });
    }
  });

  function resize() {
    const w = ui.camLayer.clientWidth, h = ui.camLayer.clientHeight;
    camera.aspect = w / h;
    camera.fov = w < h ? 66 : 55;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  addEventListener('resize', resize);
  resize();

  // 调试/截图:window.__ar
  window.__ar = { scene, camera, world, lesson, rig, gyro, place, spots, card, ui, THREE,
    get cardMode() { return cardMode; },
    skipStart() { ui.btnStart.click(); },
    state: () => mode };
  if (q.get('t') !== null && isFinite(+q.get('t'))) {
    // 直达讲解(验收用):跳过开始页与放置
    ui.start.classList.add('hide');
    ui.camLayer.style.backgroundImage = 'url(./ar-game/desk-bg.jpg?v=20261015151645)';
    mode = 'lesson';
    place.place();
    rig.setEnabled(true);
    rig.adopt(lesson.tl.params['cam.px'], lesson.tl.params['cam.py'], lesson.tl.params['cam.pz']);
    lesson.start(null, world);
    lesson.seek(+q.get('t'));
  } else if (q.get('auto') !== null) {
    // 自动走开始+放置(截图链用,无摄像头环境自动回退静图)
    setTimeout(() => ui.btnStart.click(), 100);
    setTimeout(() => {
      if (mode === 'scanning') {
        const r = renderer.domElement.getBoundingClientRect();
        renderer.domElement.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.width / 2, clientY: r.height * 0.55, bubbles: true }));
        renderer.domElement.dispatchEvent(new PointerEvent('pointerup', { clientX: r.width / 2, clientY: r.height * 0.55, bubbles: true }));
      }
    }, 1500);
  }
}

start().catch((e) => {
  console.error(e);
  ui.startErr.textContent = '加载失败: ' + (e.message || e);
  ui.startErr.style.display = 'block';
});
