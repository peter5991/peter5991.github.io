// placement.js — 放置与长出:扫描(准星跟随画面中心在虚拟桌面 y=0 的落点)
// → 点击放置(相机平移使落点对齐沙盘原点)→ 沙盘 0→1 back 缓动长出 + 接触阴影
import * as THREE from '../../vendor/three.module.js?v=20261011155356';
import { textTex } from '../lesson-core/toon.js?v=20261011155356';

export function createPlacement(scene, camera, root) {
  const DESK_Y = 0; // 虚拟桌面(沙盘底面所在高度)
  root.visible = false;

  // 接触阴影:径向渐变圆片,随沙盘一起长出
  const shadowTex = textTex(256, 256, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(20,14,6,.55)');
    g.addColorStop(0.6, 'rgba(20,14,6,.28)');
    g.addColorStop(1, 'rgba(20,14,6,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  });
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(5.2, 5.2).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
  );
  shadow.position.y = DESK_Y + 0.005;
  shadow.renderOrder = 1;
  shadow.visible = false;
  scene.add(shadow);

  const ray = new THREE.Raycaster();
  const deskPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -DESK_Y);
  const hit = new THREE.Vector3();
  const ndc = new THREE.Vector2();

  // 画面点 → 虚拟桌面交点(扫描态用准星 = 画面中心;点击态用触点)
  function deskPoint(clientX, clientY, rect) {
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1,
            -((clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.ray.intersectPlane(deskPlane, hit) ? hit.clone() : null;
  }

  const GROW = 0.8; // 长出时长(s)
  let growT = -1;

  function place() {
    root.visible = true;
    shadow.visible = true;
    growT = 0;
  }

  function backEase(k) {
    const c = 1.70158;
    return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2);
  }

  function update(dt) {
    if (growT < 0) return;
    growT = Math.min(growT + dt, GROW);
    const s = Math.max(backEase(growT / GROW), 0.001);
    root.scale.setScalar(s);
    shadow.material.opacity = growT / GROW;
    if (growT >= GROW) { root.scale.setScalar(1); growT = -1; }
  }

  return { deskPoint, place, update, get placed() { return root.visible; } };
}
