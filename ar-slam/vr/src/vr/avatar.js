// avatar.js — 几何体小农民:斗笠 + 蓑衣锥体 + 布衣躯干 + 四肢(代码摆臂摆腿)
// 身高按房门高度标定(门高约 0.66 世界单位 → 农民站高 0.52,门留余量)
// 配色取 v4 沙盘调色板(稻草/蓑衣棕、衣蓝、肤色)
import * as THREE from '../../vendor/three.module.js?v=20261015151645';
import { toon, outline } from '../lesson-core/toon.js?v=20261015151645';

export function buildAvatar() {
  const root = new THREE.Group(); // 脚底原点,update 时 root.position.y = 地面 y
  const H = 0.52; // 站高

  const skin = toon('#e8b98a');
  const cloth = toon('#5f7fb0'); // 布衣蓝
  const pants = toon('#4a5468');
  const straw = toon('#d8b96a'); // 斗笠/蓑衣
  const boot = toon('#5a4632');

  // 腿:pivot 在髋部
  const legL = new THREE.Group(), legR = new THREE.Group();
  for (const [leg, side] of [[legL, -1], [legR, 1]]) {
    leg.position.set(side * 0.045, H * 0.46, 0);
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.024, 0.22, 8), pants);
    thigh.position.y = -0.11;
    const calf = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.02, 0.2, 8), boot);
    calf.position.y = -0.32;
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.09), boot);
    foot.position.set(0, -0.43, 0.02);
    leg.add(thigh, calf, foot);
    root.add(leg);
  }

  // 躯干(蓑衣锥筒 + 布衣肩)
  const torso = new THREE.Group();
  torso.position.y = H * 0.46;
  const cape = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.14, 0.2, 10), straw);
  cape.position.y = 0.1;
  outline(cape, 1.05);
  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.12, 10), cloth);
  chest.position.y = 0.24;
  torso.add(cape, chest);
  root.add(torso);

  // 臂:pivot 在肩
  const armL = new THREE.Group(), armR = new THREE.Group();
  for (const [arm, side] of [[armL, -1], [armR, 1]]) {
    arm.position.set(side * 0.075, H * 0.46 + 0.22, 0);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.018, 0.16, 8), cloth);
    upper.position.y = -0.08;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), skin);
    hand.position.y = -0.19;
    arm.add(upper, hand);
    root.add(arm);
  }

  // 头 + 斗笠
  const headG = new THREE.Group();
  headG.position.y = H * 0.46 + 0.32;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), skin);
  outline(head, 1.06);
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.07, 12), straw);
  hat.position.y = 0.05;
  outline(hat, 1.04);
  const hatTie = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.05, 5), straw);
  hatTie.position.y = 0.005;
  headG.add(head, hat, hatTie);
  root.add(headG);

  root.traverse((n) => { if (n.isMesh) { n.castShadow = false; n.frustumCulled = true; } });

  let phase = 0; // 步相
  let facing = 0; // 朝向角(绕 y)

  // move = 归一化移动向量(世界 XZ),speed ∈ [0,1](1 = 跑),dt 秒
  function update(move, speed, groundY, dt) {
    root.position.y = groundY;
    const moving = Math.hypot(move.x, move.z) > 0.01;
    if (moving) {
      const target = Math.atan2(move.x, move.z);
      let d = target - facing;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      facing += d * Math.min(dt * 10, 1);
      phase += dt * (6 + 6 * speed);
    } else {
      phase *= Math.max(1 - dt * 6, 0); // 停步回中
    }
    root.rotation.y = facing;
    const swing = moving ? 0.55 * Math.min(speed + 0.35, 1) : 0;
    legL.rotation.x = Math.sin(phase) * swing;
    legR.rotation.x = -Math.sin(phase) * swing;
    armL.rotation.x = -Math.sin(phase) * swing * 0.8;
    armR.rotation.x = Math.sin(phase) * swing * 0.8;
    torso.rotation.z = Math.sin(phase * 2) * 0.02 * (moving ? 1 : 0);
    root.position.y += moving ? Math.abs(Math.sin(phase)) * 0.012 : 0; // 步伐起伏
  }

  return { root, update, get facing() { return facing; }, height: H };
}
