// scene-common.js — index.html(网页版)与 ar.html(D4 AR 版)共用的场景装配层
// 抽取自 main.js(D4),纯代码搬移逐语句等价;rest 像素等价由 diff oracle 守护
import * as THREE from '../vendor/three.module.min.js';
import { toon, outline as outlineRaw, M, B, C, textTex, mulberry32 } from './toon.js?v=20261008103654';
import { buildTerrain } from './terrain.js?v=20261008103654';
import { buildArchitecture } from './architecture.js?v=20261008103654';
import { buildVegetation } from './vegetation.js?v=20261008103654';

// URL 参数:?season=&time= 选分支;?anim=off 冻结 rest;?t=<秒> 钉死时钟(优先于 anim=off)
export function parseParams(search) {
  const params = new URLSearchParams(search);
  const season = params.get('season') || 'spring';
  const time = params.get('time') || 'day';
  const tParamRaw = params.get('t');
  const tParam = tParamRaw !== null && isFinite(+tParamRaw) ? +tParamRaw : null;
  const animOn = !(tParam === null && params.get('anim') === 'off');
  return { season, time, tParam, animOn };
}

// 配置:?season=&time= 选分支,查不到回退 spring.day;sizes 顶层共享(D2 spec-d2 §1)
export async function loadCfg(season, time) {
  const res = await fetch('./config/scene.json?v=20261008103654');
  if (!res.ok) throw new Error('config/scene.json 加载失败: HTTP ' + res.status);
  const config = await res.json();
  let variant = config.seasons && config.seasons[season] && config.seasons[season][time];
  let usedSeason = season, usedTime = time;
  if (!variant) {
    console.warn(`[paddy] 未找到 seasons.${season}.${time},回退 spring.day`);
    variant = config.seasons.spring.day;
    usedSeason = 'spring'; usedTime = 'day';
  }
  return { cfg: { ...variant, sizes: config.sizes }, usedSeason, usedTime };
}

// 环境:背景色 + 雾(可选关,AR 透明画布必须关)+ PMREM 渐变环境(水镜 metalness 0.85 无 env 则发黑)
export function applyEnvironment(renderer, scene, cfg, { background = true } = {}) {
  if (background) scene.background = new THREE.Color(cfg.sky);
  scene.fog = new THREE.Fog(cfg.fog.color, cfg.fog.near, cfg.fog.far);
  const cv = document.createElement('canvas');
  cv.width = 4; cv.height = 64;
  const c2 = cv.getContext('2d');
  const grad = c2.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, cfg.sky);
  grad.addColorStop(0.5, cfg.lights.hemi.sky);
  grad.addColorStop(0.58, cfg.baseTop);
  grad.addColorStop(1, cfg.lights.hemi.ground);
  c2.fillStyle = grad; c2.fillRect(0, 0, 4, 64);
  const skyTex = new THREE.CanvasTexture(cv);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const skyScene = new THREE.Scene();
  skyScene.add(new THREE.Mesh(
    new THREE.SphereGeometry(50, 16, 12),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide })
  ));
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(skyScene, 0.04).texture;
  skyTex.dispose(); pmrem.dispose();
}

// 灯光:Hemisphere + 暖阳平行光唯一投影(frustum ±16,改过必须 updateProjectionMatrix)+ 弱 Ambient
export function addLights(scene, cfg) {
  scene.add(new THREE.HemisphereLight(
    cfg.lights.hemi.sky, cfg.lights.hemi.ground, cfg.lights.hemi.intensity
  ));
  const sun = new THREE.DirectionalLight(cfg.lights.sun.color, cfg.lights.sun.intensity);
  sun.position.set(...cfg.lights.sun.position);
  sun.castShadow = true;
  sun.shadow.mapSize.set(cfg.lights.sun.shadowMapSize, cfg.lights.sun.shadowMapSize);
  sun.shadow.camera.left = -16; sun.shadow.camera.right = 16;
  sun.shadow.camera.top = 16; sun.shadow.camera.bottom = -16;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 40;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  sun.shadow.camera.updateProjectionMatrix(); // 改过 frustum 必须重算,否则停留在默认 ±5
  scene.add(sun);
  scene.add(new THREE.AmbientLight(cfg.lights.ambient.color, cfg.lights.ambient.intensity));
  return sun;
}

// 模块装配(契约冻结:返回 THREE.Group;D3:可动模块挂 userData.update(t))
export function buildModules(cfg) {
  const ctx = {
    THREE, toon, M, B, C, textTex,
    outline: (mesh, scale) => outlineRaw(mesh, scale, cfg.outline),
    rand: mulberry32(cfg.seed ?? 20260926),
    cfg
  };
  const modules = [buildTerrain(ctx), buildArchitecture(ctx), buildVegetation(ctx)];
  const updaters = modules.map((m) => m.userData && m.userData.update).filter(Boolean);
  return { modules, updaters };
}
