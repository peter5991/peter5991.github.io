// hotspot.js — 病斑触发点:脉动光圈 + 漂浮「!」→ 学完后对勾;进入半径显示交互提示
import * as THREE from '../../vendor/three.module.js?v=20261015151645';
import { textTex } from '../lesson-core/toon.js?v=20261015151645';

export function buildHotspot(cfg) {
  const root = new THREE.Group();
  root.position.set(cfg.point[0], cfg.point[1], cfg.point[2]);

  // 地面光圈(脉动)
  const ringMat = new THREE.MeshBasicMaterial({ color: '#ffd84a', transparent: true, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.21, 40).rotateX(-Math.PI / 2), ringMat);
  ring.position.y = 0.03;
  ring.renderOrder = 3;
  root.add(ring);

  // 漂浮标记:「!」(未学)/「✓」(已学),canvas 纹理面向相机
  function makeSprite(txt, bg) {
    const tex = textTex(96, 96, (c, w, h) => {
      c.beginPath(); c.arc(w / 2, h / 2, 40, 0, Math.PI * 2);
      c.fillStyle = bg; c.fill();
      c.lineWidth = 5; c.strokeStyle = '#fff'; c.stroke();
      c.fillStyle = '#fff'; c.font = 'bold 56px "Microsoft YaHei", sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(txt, w / 2, h / 2 + 3);
    });
    const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    const s = new THREE.Sprite(m);
    s.scale.setScalar(0.22);
    return s;
  }
  const bang = makeSprite('!', '#e0a030');
  const check = makeSprite('✓', '#4e9e52');
  bang.position.y = check.position.y = 0.42;
  root.add(bang, check);
  check.visible = false;

  let done = false;
  function update(T, camQuat) {
    const pulse = 0.7 + 0.3 * Math.sin(T * 4);
    ringMat.opacity = done ? 0.25 : pulse * 0.85;
    ring.scale.setScalar(done ? 0.8 : 1 + 0.15 * Math.sin(T * 4));
    bang.visible = !done;
    check.visible = done;
    bang.position.y = 0.42 + 0.04 * Math.sin(T * 2.4);
  }

  return {
    root, update,
    pos: new THREE.Vector3(cfg.point[0], cfg.point[1], cfg.point[2]),
    radius: cfg.radius,
    setDone(v) { done = v; }
  };
}
