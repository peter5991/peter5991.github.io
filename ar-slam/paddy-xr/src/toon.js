// toon.js — 三渲二基础配方(toon-diorama recipe §2.1~2.5)
import * as THREE from '../vendor/three.module.min.js?v=20261008090944';

// 4 档灰阶渐变图,NearestFilter 硬切分
const gradData = new Uint8Array([
  70, 70, 70, 255,
  150, 150, 150, 255,
  220, 220, 220, 255,
  255, 255, 255, 255
]);
export const gradMap = new THREE.DataTexture(gradData, 4, 1, THREE.RGBAFormat);
gradMap.needsUpdate = true;
gradMap.minFilter = gradMap.magFilter = THREE.NearestFilter;

export function toon(color, opts = {}) {
  return new THREE.MeshToonMaterial(Object.assign({ color, gradientMap: gradMap }, opts));
}

// 反向外壳描边;color 由调用方传入(cfg.outline),默认深紫黑
export function outline(mesh, scale = 1.045, color = 0x2e2a33) {
  const o = new THREE.Mesh(
    mesh.geometry,
    new THREE.MeshBasicMaterial({ color, side: THREE.BackSide })
  );
  o.scale.setScalar(scale);
  mesh.add(o);
  return o;
}

// 速记 helper
export function M(geo, mat, x = 0, y = 0, z = 0, oScale = 0, oColor) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (oScale) outline(m, oScale, oColor);
  return m;
}
export function B(w, h, d) { return new THREE.BoxGeometry(w, h, d); }
export function C(rt, rb, h, seg = 16) { return new THREE.CylinderGeometry(rt, rb, h, seg); }

// Canvas 纹理(铭牌/站牌/门窗等细节)
export function textTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 确定性随机:固定种子 → 每次刷新场景完全一致
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
