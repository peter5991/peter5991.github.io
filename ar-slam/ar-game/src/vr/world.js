// world.js — VR 漫游页世界:加载 v4 沙盘 GLB + 光照 + 地面/障碍
// 地面射线目标 = Base(岛体)/Plot(泥与水)/Ridge(田埂)/Bridge(桥面);射线落空 = 岛边,阻止移动
// 障碍 = House/Tree/Scarecrow/StoneLantern/Stone_Rear/Banner 各取一个 XZ 圆(由包围盒生成)
import * as THREE from '../../vendor/three.module.js?v=20261011154851';
import { GLTFLoader } from '../../vendor/GLTFLoader.js?v=20261011154851';

export async function loadWorld(scene, url) {
  const gltf = await new GLTFLoader().loadAsync(url);
  const root = gltf.scene;
  scene.add(root);

  // 光照对齐 v4 Blender 侧:暖主光 (-7,-9,10)→glTF (-7,10,9);两盏冷补光;半球补
  const hemi = new THREE.HemisphereLight(0xb3c9e3, 0x5a6a4a, 0.7);
  const sun = new THREE.DirectionalLight(0xffdbb0, 2.2);
  sun.position.set(-7, 10, 9);
  const fillA = new THREE.DirectionalLight(0xbad9ff, 0.5);
  fillA.position.set(4, 6, -3);
  const fillB = new THREE.DirectionalLight(0xe0f0ff, 0.25);
  fillB.position.set(3, 3, 8);
  scene.add(hemi, sun, fillA, fillB);

  const groundMeshes = [];
  const obstacles = []; // { x, z, r }
  const rice = [];
  const box = new THREE.Box3();
  const OCCLUDERS = []; // 房屋墙体/屋顶:相机遮挡检测用
  const famCollide = [
    [/^Base_/, 'ground'], [/^Plot_/, 'ground'], [/^Ridge_[A-Z]_System/, 'ground'],
    [/^Bridge_Full__Deck/, 'ground'],
    [/^House_Full__Wall|^House_Full__Foundation|^House_Full__Door/, 'house'],
    [/^House_Full__Roof_(Left|Right)/, 'houseRoof'],
    [/^Tree_Full__Branching_Trunk/, 'trunk'],
    [/^Scarecrow_Full__Main_Post/, 'scarecrow'],
    [/^StoneLantern_Full__Foot/, 'lantern'],
    [/^Stone_Rear_Cluster/, 'stone'],
    [/^Banner_Full_(Left|Right)__Mast/, 'banner'],
    [/^Rice_/, 'rice'],
    [/^Water_/, 'water']
  ];
  const famDone = new Set();
  root.traverse((n) => {
    if (!n.isMesh) return;
    for (const [re, kind] of famCollide) {
      if (!re.test(n.name)) continue;
      if (kind === 'ground') { groundMeshes.push(n); break; }
      if (kind === 'rice') { rice.push(n); break; }
      if (kind === 'houseRoof') { OCCLUDERS.push(n); break; }
      if (kind === 'water') break;
      // 障碍:每个族只采一次(族内单件包围盒近似整体,房屋除外单独拼)
      if (kind === 'house') { OCCLUDERS.push(n); }
      box.setFromObject(n);
      const c = box.getCenter(new THREE.Vector3());
      const s = box.getSize(new THREE.Vector3());
      if (kind === 'house') {
        // 房屋墙体逐个收圆,拼成遮挡带
        obstacles.push({ x: c.x, z: c.z, r: Math.max(s.x, s.z) / 2 + 0.06, src: n.name });
      } else if (!famDone.has(kind)) {
        famDone.add(kind);
        obstacles.push({ x: c.x, z: c.z, r: Math.max(s.x, s.z) / 2 * (kind === 'trunk' ? 0.5 : 0.8) + 0.05, src: n.name });
      }
      break;
    }
  });
  root.updateMatrixWorld(true);

  const ray = new THREE.Raycaster();
  const DOWN = new THREE.Vector3(0, -1, 0);
  const org = new THREE.Vector3();

  // groundAt:命中返回世界 y;落空(岛外)返回 null
  function groundAt(x, z) {
    org.set(x, 5, z);
    ray.set(org, DOWN);
    ray.far = 12;
    const hits = ray.intersectObjects(groundMeshes, false);
    return hits.length ? hits[0].point.y : null;
  }

  // 障碍滑动:目标点若撞入任一障碍圆,沿切向滑出(只推 XZ)
  function collide(x, z, radius = 0.16) {
    let nx = x, nz = z;
    for (const o of obstacles) {
      const dx = nx - o.x, dz = nz - o.z;
      const d = Math.hypot(dx, dz), min = o.r + radius;
      if (d < min && d > 1e-6) {
        nx = o.x + (dx / d) * min;
        nz = o.z + (dz / d) * min;
      }
    }
    return [nx, nz];
  }

  return { root, groundMeshes, obstacles, groundAt, collide, rice, occluders: OCCLUDERS, sun };
}
