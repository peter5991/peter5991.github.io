// gyro.js — deviceorientation 3DoF 视角增量(不做追踪,只转朝向)
// 公式同 three DeviceOrientationControls:euler(ZXY alpha,beta,gamma) → 四元数,
// 再乘 screen-orientation 修正与 -90° X 轴修正(竖屏持机,屏幕朝人)
// delta() = recenter 基准的逆 × 当前姿态(低通后),交给 ar-rig 叠在轨道朝向上
import * as THREE from '../../vendor/three.module.js?v=20261011154851';
import { track } from '../analytics.js?v=20261011154851';

const D2R = Math.PI / 180;
const zee = new THREE.Vector3(0, 0, 1);
const euler = new THREE.Euler();
const q0 = new THREE.Quaternion(); // -90° X 修正
q0.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
const q1 = new THREE.Quaternion(); // 屏幕方向修正

export function createGyro() {
  const raw = new THREE.Quaternion();
  const smooth = new THREE.Quaternion();
  const baseInv = new THREE.Quaternion(); // recenter 基准的逆
  const delta = new THREE.Quaternion();
  const state = { active: false, hasBase: false, lastT: 0 };

  function onOrient(e) {
    if (e.alpha === null && e.beta === null && e.gamma === null) return;
    euler.set(e.beta * D2R, e.alpha * D2R, -e.gamma * D2R, 'YXZ');
    raw.setFromEuler(euler);
    raw.multiply(q1.setFromAxisAngle(zee, -(screen.orientation?.angle ?? 0) * D2R));
    raw.multiply(q0);
    if (!state.active) {
      smooth.copy(raw);
      state.active = true;
      baseInv.copy(raw).invert();
      state.hasBase = true;
      track('ar_gyro', { on: 1 });
    }
    state.lastT = performance.now();
  }

  // 必须在用户手势里调(iOS);安卓无此 API 则静默跳过
  async function requestPermission() {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' &&
          typeof DeviceOrientationEvent.requestPermission === 'function') {
        const r = await DeviceOrientationEvent.requestPermission();
        if (r !== 'granted') return false;
      }
      addEventListener('deviceorientation', onOrient, true);
      return true;
    } catch { return false; }
  }

  return {
    requestPermission,
    // 每帧取增量(带低通);8 秒无数据视为不可用
    delta(dt) {
      if (!state.active || performance.now() - state.lastT > 8000) return null;
      smooth.slerp(raw, 1 - Math.pow(0.002, Math.min(dt, 0.05)));
      return delta.copy(baseInv).multiply(smooth);
    },
    // 以当前姿态为基准(“回正”)
    recenter() {
      if (!state.active) return;
      baseInv.copy(smooth).invert();
    },
    get active() { return state.active && performance.now() - state.lastT < 8000; },
  };
}
