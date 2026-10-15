// input.js — 统一输入:桌面键鼠 + 手机虚拟摇杆/按钮 → { move, look, interact, toggleView }
// move:归一化 XZ 意图(相对镜头朝向);look:本帧镜头增量(yaw/pitch)
export function createInput(dom, ui) {
  const st = {
    move: { x: 0, z: 0 },       // 本帧合成(键盘 or 摇杆)
    look: { yaw: 0, pitch: 0 }, // 本帧增量,消费后清零
    run: false,
    interactQueued: false,
    toggleViewQueued: false,
    dragging: false
  };

  // ---- 键盘 ----
  const keys = new Set();
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'KeyE') st.interactQueued = true;
    if (e.code === 'KeyV') st.toggleViewQueued = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));

  // ---- 鼠标拖拽转视角(画布空白处按下)----
  let lastX = 0, lastY = 0, mouseDown = false;
  dom.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') return;
    mouseDown = true; lastX = e.clientX; lastY = e.clientY;
  });
  addEventListener('pointermove', (e) => {
    if (!mouseDown || e.pointerType !== 'mouse') return;
    st.look.yaw -= (e.clientX - lastX) * 0.0042;
    st.look.pitch -= (e.clientY - lastY) * 0.0032;
    lastX = e.clientX; lastY = e.clientY;
  });
  addEventListener('pointerup', () => { mouseDown = false; });

  // ---- 触屏:右半屏拖拽转视角 ----
  const touchLook = { id: -1, x: 0, y: 0 };
  dom.addEventListener('touchstart', (e) => {
    for (const t of e.changedTouches) {
      if (t.clientX > innerWidth * 0.4 && touchLook.id < 0) {
        touchLook.id = t.identifier; touchLook.x = t.clientX; touchLook.y = t.clientY;
      }
    }
  }, { passive: true });
  dom.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== touchLook.id) continue;
      st.look.yaw -= (t.clientX - touchLook.x) * 0.006;
      st.look.pitch -= (t.clientY - touchLook.y) * 0.004;
      touchLook.x = t.clientX; touchLook.y = t.clientY;
    }
  }, { passive: true });
  dom.addEventListener('touchend', (e) => {
    for (const t of e.changedTouches) if (t.identifier === touchLook.id) touchLook.id = -1;
  });

  // ---- 虚拟摇杆 ----
  const joy = ui.joystick, knob = ui.knob;
  const joySt = { id: -1, cx: 0, cy: 0, dx: 0, dy: 0 };
  const JR = 46; // 摇杆半径 px
  function joyStart(e) {
    for (const t of e.changedTouches) {
      if (joySt.id >= 0) continue;
      joySt.id = t.identifier;
      const r = joy.getBoundingClientRect();
      joySt.cx = r.left + r.width / 2; joySt.cy = r.top + r.height / 2;
    }
    e.preventDefault();
  }
  function joyMove(e) {
    for (const t of e.changedTouches) {
      if (t.identifier !== joySt.id) continue;
      let dx = t.clientX - joySt.cx, dy = t.clientY - joySt.cy;
      const d = Math.hypot(dx, dy);
      if (d > JR) { dx *= JR / d; dy *= JR / d; }
      joySt.dx = dx / JR; joySt.dy = dy / JR;
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    }
    e.preventDefault();
  }
  function joyEnd(e) {
    for (const t of e.changedTouches) {
      if (t.identifier !== joySt.id) continue;
      joySt.id = -1; joySt.dx = 0; joySt.dy = 0;
      knob.style.transform = '';
    }
  }
  joy.addEventListener('touchstart', joyStart, { passive: false });
  joy.addEventListener('touchmove', joyMove, { passive: false });
  joy.addEventListener('touchend', joyEnd);
  joy.addEventListener('touchcancel', joyEnd);

  // ---- HUD 按钮 ----
  ui.btnInteract.addEventListener('click', () => { st.interactQueued = true; });
  ui.btnView.addEventListener('click', () => { st.toggleViewQueued = true; });

  const isTouch = 'ontouchstart' in window;
  if (isTouch) document.body.classList.add('touch');

  return {
    frame(camYaw) {
      // 键盘合成本帧移动(相对镜头朝向)
      let fx = 0, fz = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) fz += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) fz -= 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) fx -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) fx += 1;
      st.run = keys.has('ShiftLeft') || keys.has('ShiftRight');
      // 摇杆
      if (joySt.id >= 0) { fx += joySt.dx; fz -= joySt.dy; st.run = Math.hypot(joySt.dx, joySt.dy) > 0.92; }
      const len = Math.hypot(fx, fz);
      if (len > 1) { fx /= len; fz /= len; }
      // 转到世界系(镜头朝向为前)。camera-rig 的实际前向 = (-sin yaw, -cos yaw),
      // 屏幕右向 = (-cos yaw, +sin yaw);此前公式整体反号 → W 后退 / S 前进 / A·D 互换
      const s = Math.sin(camYaw), c = Math.cos(camYaw);
      st.move.x = -fx * c - fz * s;
      st.move.z =  fx * s - fz * c;
      st.mag = Math.min(len, 1);
      const out = {
        move: st.move, mag: st.mag, run: st.run,
        look: { yaw: st.look.yaw, pitch: st.look.pitch },
        interact: st.interactQueued, toggleView: st.toggleViewQueued
      };
      st.look.yaw = 0; st.look.pitch = 0;
      st.interactQueued = false; st.toggleViewQueued = false;
      return out;
    }
  };
}
