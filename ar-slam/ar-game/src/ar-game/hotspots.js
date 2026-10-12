// hotspots.js — 沙盘热点:复用 vr/hotspot 的脉动光圈+「!」/「✓」,卡片热点用「?」
// 每帧按相机距离反缩放,保持屏幕上大小恒定;点击 = 屏幕空间最近点判定(触屏友好)
import * as THREE from '../../vendor/three.module.js?v=20261012103431';
import { textTex } from '../lesson-core/toon.js?v=20261012103431';

const SCREEN_PX = 0.09;   // 热点在世界中的目标屏幕占比(约 90px@1000px 高)
const PICK_R = 44;        // 触屏拾取半径(px)

export function buildHotspots(spots) {
  const items = spots.map((s) => {
    const root = new THREE.Group();
    root.position.set(s.point[0], s.point[1], s.point[2]);

    const isLesson = s.kind === 'lesson';
    const ringMat = new THREE.MeshBasicMaterial({
      color: isLesson ? '#ffd84a' : '#9fd0ff', transparent: true, depthWrite: false,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.21, 40).rotateX(-Math.PI / 2), ringMat);
    ring.position.y = 0.02;
    ring.renderOrder = 3;
    root.add(ring);

    function makeSprite(txt, bg) {
      const tex = textTex(96, 96, (c, w, h) => {
        c.beginPath(); c.arc(w / 2, h / 2, 40, 0, Math.PI * 2);
        c.fillStyle = bg; c.fill();
        c.lineWidth = 5; c.strokeStyle = '#fff'; c.stroke();
        c.fillStyle = '#fff'; c.font = 'bold 52px "Microsoft YaHei", sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(txt, w / 2, h / 2 + 3);
      });
      const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
      const sp = new THREE.Sprite(m);
      sp.scale.setScalar(0.22);
      return sp;
    }
    const mark = makeSprite(s.icon || (isLesson ? '!' : '?'), isLesson ? '#e0a030' : '#5b7d9e');
    const check = makeSprite('✓', '#4e9e52');
    mark.position.y = check.position.y = 0.42;
    root.add(mark, check);
    check.visible = false;

    return { spot: s, root, ring, ringMat, mark, check, done: false, screen: new THREE.Vector3() };
  });

  const v = new THREE.Vector3();
  function update(T, camera, viewH) {
    for (const it of items) {
      // 屏幕恒定大小:按到相机距离反缩放
      const d = camera.position.distanceTo(it.root.position);
      const k = (d * 2 * Math.tan(camera.fov * Math.PI / 360) * SCREEN_PX * 1000) / Math.max(viewH, 1) / 0.44;
      it.root.scale.setScalar(k);
      const pulse = 0.7 + 0.3 * Math.sin(T * 4);
      it.ringMat.opacity = it.done ? 0.25 : pulse * 0.85;
      it.ring.scale.setScalar(it.done ? 0.8 : 1 + 0.15 * Math.sin(T * 4));
      it.mark.visible = !it.done;
      it.check.visible = it.done;
      it.mark.position.y = 0.42 + 0.04 * Math.sin(T * 2.4);
    }
  }

  // 触点(clientX/Y,相对 canvas rect)→ 最近热点(命中返回 item,否则 null)
  function pick(clientX, clientY, camera, rect) {
    let best = null, bestD = PICK_R;
    for (const it of items) {
      v.setFromMatrixPosition(it.root.matrixWorld).project(camera);
      if (v.z > 1) continue; // 相机背后
      const sx = (v.x * 0.5 + 0.5) * rect.width;
      const sy = (-v.y * 0.5 + 0.5) * rect.height;
      const d = Math.hypot(sx - clientX, sy - clientY);
      if (d < bestD) { bestD = d; best = it; }
    }
    return best;
  }

  function setDone(id, v2) {
    const it = items.find((i) => i.spot.id === id);
    if (it) it.done = v2;
  }

  return { items, update, pick, setDone };
}
