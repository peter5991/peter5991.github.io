// ar-rig.js — 手持轨道相机:转盘/俯仰/缩放(都是相机位姿变化,沙盘不动)
// 朝向 = lookAt(pos→target) ∘ 陀螺仪增量;软引导 suggest() 在用户操作后让权 4s
import * as THREE from '../../vendor/three.module.js?v=20261012100844';

const DEF = { az: 1.3, el: 0.72, dist: 3.3 }; // 初始机位(东北侧俯视,三块田都进画面)
const LIM = { el: [0.14, 1.35], dist: [0.9, 4.6] };
const SUGGEST_DIST_K = 1.5; // 时间轴近景机位 → AR 手持距离系数
const HEIGHT_K = 0.55; // 轨道高度压缩:轨道半径只取水平距,高度单独缓动(避免 az≈π/2 时退化)

export function createArRig(camera, dom, gyro) {
  const state = {
    az: DEF.az, y: DEF.el * 3, r: DEF.dist,
    target: new THREE.Vector3(-0.25, 0.35, 0.35), // 初始构图偏向 B/C 田之间,让 4 个热点都进画面
    enabled: false,      // 放置后才接收输入
    lastUserT: -1e9,     // 最近一次用户操作(performance.now)
    suggest: null,       // {az, y, r, target} 推荐机位
  };

  // ---- 手势:单指/鼠标 = 转,双指 = 缩放 ----
  const ptrs = new Map();
  let pinchD0 = 0, dist0 = 0, lx = 0, ly = 0;

  dom.addEventListener('pointerdown', (e) => {
    if (!state.enabled) return;
    dom.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.size === 1) { lx = e.clientX; ly = e.clientY; }
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      pinchD0 = Math.hypot(a[0] - b[0], a[1] - b[1]);
      dist0 = state.r;
    }
  });
  dom.addEventListener('pointermove', (e) => {
    if (!state.enabled || !ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    markUser();
    if (ptrs.size === 1) {
      state.az -= (e.clientX - lx) * 0.0052;
      state.y = THREE.MathUtils.clamp(state.y + (e.clientY - ly) * 0.006, 0.35, 3.2);
      lx = e.clientX; ly = e.clientY;
    } else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinchD0 > 0) {
        const f = pinchD0 / d;
        state.r = THREE.MathUtils.clamp(dist0 * f, ...LIM.dist);
      }
    }
  });
  const up = (e) => { ptrs.delete(e.pointerId); };
  dom.addEventListener('pointerup', up);
  dom.addEventListener('pointercancel', up);
  dom.addEventListener('wheel', (e) => {
    if (!state.enabled) return;
    e.preventDefault();
    markUser();
    state.r = THREE.MathUtils.clamp(state.r * (1 + Math.sign(e.deltaY) * 0.09), ...LIM.dist);
  }, { passive: false });

  function markUser() { state.lastUserT = performance.now(); }
  const userHold = () => performance.now() - state.lastUserT < 4000;

  // 讲解侧每帧把 cam.* 换算成推荐机位丢进来(轨道半径取水平距,高度独立)
  function suggest(px, py, pz, tx, ty, tz) {
    const dx = px - tx, dy = py - ty, dz = pz - tz;
    const horiz = Math.hypot(dx, dz) || 0.3; // 近垂直时给最小水平距,防退化
    state.suggest = {
      az: Math.atan2(dx, dz),
      y: Math.max(ty + dy * HEIGHT_K, ty + 0.15),
      r: THREE.MathUtils.clamp(horiz * SUGGEST_DIST_K, 0.6, LIM.dist[1]),
      target: new THREE.Vector3(tx, ty, tz),
    };
  }

  const pos = new THREE.Vector3();

  function update(dt) {
    // 软引导:空闲时缓动到推荐机位;一操作立即让权
    if (state.suggest && !userHold() && state.enabled) {
      const k = 1 - Math.pow(0.02, Math.min(dt, 0.05));
      const s = state.suggest;
      state.az += shortest(s.az - state.az) * k * 0.7; // 转向放慢,避免甩镜
      state.y += (s.y - state.y) * k;
      state.r += (s.r - state.r) * k;
      state.target.lerp(s.target, k);
    }
    pos.set(
      state.target.x + Math.sin(state.az) * state.r,
      state.y,
      state.target.z + Math.cos(state.az) * state.r
    );
    camera.position.copy(pos);
    camera.lookAt(state.target);
    // 陀螺仪增量叠加
    const g = gyro?.delta(dt);
    if (g) camera.quaternion.multiply(g);
  }

  function shortest(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }

  return {
    camera, // info-card 等需要读当前相机位置
    update, suggest, markUser,
    setEnabled(v) { state.enabled = v; },
    get enabled() { return state.enabled; },
    clearSuggest() { state.suggest = null; },
    // 讲解开始时把当前机位“接力”到推荐轨迹起点,避免跳变
    adopt(px, py, pz) {
      const t = state.target;
      const dx = px - t.x, dy = py - t.y, dz = pz - t.z;
      const horiz = Math.hypot(dx, dz) || 0.3;
      state.az = Math.atan2(dx, dz);
      state.y = Math.max(t.y + dy * HEIGHT_K, t.y + 0.15);
      state.r = THREE.MathUtils.clamp(horiz * SUGGEST_DIST_K, 0.6, LIM.dist[1]);
    },
    state,
  };
}
