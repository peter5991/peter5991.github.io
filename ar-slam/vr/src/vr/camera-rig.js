// camera-rig.js — 第三人称弹簧臂跟随 + 第一人称;V 切换,0.4s 插值过渡
// 第三人称:镜头在角色斜后上方,drag 改变 yaw/pitch;被房屋挡时缩短臂长
// 第一人称:眼位在角色头,隐藏角色
import * as THREE from '../../vendor/three.module.js?v=20261015151645';

const TPS_DIST = 0.95, TPS_HEIGHT = 0.42, TPS_PITCH0 = 0.18;
const FPS_EYE = 0.5;
const MIN_PITCH = -1.1, MAX_PITCH = 0.9;

export function createCameraRig(camera, avatar, world) {
  let mode = 'tps'; // 'tps' | 'fps'
  let blend = 0;    // 0 = tps, 1 = fps(过渡中)
  let yaw = Math.PI * 0.9, pitch = TPS_PITCH0;
  let yaw0 = null; // 外部可设置出生朝向(首帧生效)
  let posInit = false;
  const pos = new THREE.Vector3(1.6, 1.4, 2.6);
  const lookAt = new THREE.Vector3();
  const ray = new THREE.Raycaster();
  const dir = new THREE.Vector3();

  // 首帧前由外部钉到正确机位(避免从默认位置飞过来)
  function snap() { posInit = false; }

  function toggle() { mode = mode === 'tps' ? 'fps' : 'tps'; }

  function update(dt, input) {
    if (yaw0 !== null) {
      yaw = yaw0; yaw0 = null;
      pitch = TPS_PITCH0;
      const ap = avatar.root.position;
      pos.set(ap.x + Math.sin(yaw) * TPS_DIST, ap.y + FPS_EYE + TPS_HEIGHT * 0.3, ap.z + Math.cos(yaw) * TPS_DIST);
      lookAt.set(ap.x, ap.y + 0.34, ap.z);
      posInit = true;
    }
    yaw += input.look.yaw;
    pitch = THREE.MathUtils.clamp(pitch + input.look.pitch, MIN_PITCH, MAX_PITCH);
    const targetBlend = mode === 'fps' ? 1 : 0;
    blend += (targetBlend - blend) * Math.min(dt * 6, 1);
    avatar.root.visible = blend < 0.85;

    const ap = avatar.root.position;
    const eye = new THREE.Vector3(ap.x, ap.y + FPS_EYE, ap.z);
    // 第三人称目标位:角色后上方
    const back = new THREE.Vector3(
      Math.sin(yaw) * Math.cos(pitch),
      -Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch)
    );
    let dist = TPS_DIST;
    const tpsTarget = eye.clone().addScaledVector(back, dist).add(new THREE.Vector3(0, TPS_HEIGHT * 0.3, 0));
    // 遮挡:从 eye 朝 tpsTarget 打射线,被房屋挡则缩短
    dir.subVectors(tpsTarget, eye);
    const len = dir.length();
    ray.set(eye, dir.normalize());
    ray.far = len;
    const hits = ray.intersectObjects(world.occluders, false);
    if (hits.length) dist = Math.max(hits[0].distance - 0.15, 0.35);
    const tpsPos = eye.clone().addScaledVector(back, dist).add(new THREE.Vector3(0, TPS_HEIGHT * 0.3, 0));
    // 防止镜头穿地
    const gy = world.groundAt(tpsPos.x, tpsPos.z);
    if (gy !== null && tpsPos.y < gy + 0.14) tpsPos.y = gy + 0.14;

    const fpsPos = eye.clone();
    const finalPos = tpsPos.lerp(fpsPos, THREE.MathUtils.smoothstep(blend, 0, 1));
    if (!posInit) { pos.copy(finalPos); posInit = true; }
    pos.lerp(finalPos, Math.min(dt * 14, 1));
    camera.position.copy(pos);

    // 注视点:tps 看角色头前,fps 看视线前方
    const fwd = new THREE.Vector3(
      -Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)
    );
    const tpsLook = new THREE.Vector3(ap.x, ap.y + 0.34, ap.z).addScaledVector(fwd, 0.35);
    const fpsLook = eye.clone().addScaledVector(fwd, 1.4);
    lookAt.lerp(tpsLook.lerp(fpsLook, THREE.MathUtils.smoothstep(blend, 0, 1)), Math.min(dt * 14, 1));
    camera.lookAt(lookAt);
    return yaw;
  }

  return { update, toggle, snap, get yaw() { return yaw; }, get mode() { return mode; }, set yaw0(v) { yaw0 = v; } };
}
