// Solmar Bay — the procedural city. A 7x7 grid of blocks, roads between
// them, buildings, trees, lamps, a plaza, a bank and a pier. Movement
// stays on a flat plane: sidewalks and the pier deck are drawn nearly
// flush with the ground (a few centimetres) so nobody clips through them.

import * as THREE from 'three';
import { ROAD_COORDS, PITCH, ROAD_W, BLOCK, COLORS } from './config.js';
import { makeRng } from './random.js';

function windowTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 256);
  g.fillStyle = '#2e4a5e';
  for (let y = 12; y < 244; y += 28) {
    for (let x = 10; x < 118; x += 26) {
      g.fillRect(x, y, 16, 18);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function buildWorld(scene, seed = 1337) {
  const rng = makeRng(seed);
  const colliders = [];
  const winTex = windowTexture();
  const mats = COLORS.building.map((col) => new THREE.MeshLambertMaterial({
    color: col, map: winTex,
  }));

  // Ground.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(640, 640),
    new THREE.MeshLambertMaterial({ color: COLORS.ground }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  scene.add(ground);

  // Water at the south-east corner, under the pier.
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(140, 140),
    new THREE.MeshLambertMaterial({ color: 0x2a6d8f }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(330, -0.02, 330);
  scene.add(water);

  // Roads: dark strips along every road coordinate, with centre dashes.
  const roadMat = new THREE.MeshLambertMaterial({ color: COLORS.road });
  const dashMat = new THREE.MeshBasicMaterial({ color: COLORS.lane });
  for (const c of ROAD_COORDS) {
    for (const horiz of [true, false]) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(592, ROAD_W), roadMat);
      strip.rotation.x = -Math.PI / 2;
      if (!horiz) strip.rotation.z = Math.PI / 2;
      strip.position.set(horiz ? 0 : c, 0.0, horiz ? c : 0);
      scene.add(strip);
    }
    // Dashes along the middle of each road.
    for (let t = -280; t < 280; t += 16) {
      for (const horiz of [true, false]) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.5), dashMat);
        dash.rotation.x = -Math.PI / 2;
        if (!horiz) dash.rotation.z = Math.PI / 2;
        dash.position.set(horiz ? t : c, 0.03, horiz ? c : t);
        scene.add(dash);
      }
    }
  }

  // Sidewalks: light flat slabs over every block, nearly flush (0.02).
  const walkMat = new THREE.MeshLambertMaterial({ color: COLORS.sidewalk });
  const blockCenters = [];
  for (let i = 0; i < 7; i++) blockCenters.push(-222 + i * PITCH);
  for (const bx of blockCenters) {
    for (const bz of blockCenters) {
      const slab = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK, BLOCK), walkMat);
      slab.rotation.x = -Math.PI / 2;
      slab.position.set(bx, 0.02, bz);
      scene.add(slab);
    }
  }

  // Pier deck at the south-east corner (mission 6), nearly flush too.
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6a45 });
  const pier = new THREE.Mesh(new THREE.PlaneGeometry(36, 36), pierMat);
  pier.rotation.x = -Math.PI / 2;
  pier.position.set(277, 0.05, 277);
  scene.add(pier);
  // Pier posts, visual only.
  const postMat = new THREE.MeshLambertMaterial({ color: 0x5e4630 });
  for (const [px, pz] of [[262, 262], [292, 262], [262, 292], [292, 292]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 2.2, 6), postMat);
    post.position.set(px, 0.4, pz);
    scene.add(post);
  }

  // Special open blocks: the plaza (mission 2) and the bank forecourt
  // (mission 5) have no buildings so their targets are always reachable.
  const openBlocks = new Set(['-111,-111', '-222,-37']);

  // Buildings, one to three per block, inset from the road.
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  for (const bx of blockCenters) {
    for (const bz of blockCenters) {
      const key = `${bx},${bz}`;
      if (openBlocks.has(key)) continue;
      const n = rng.int(1, 3);
      for (let k = 0; k < n; k++) {
        const w = rng.range(16, 30);
        const d = rng.range(16, 30);
        const h = rng.range(8, 34) * (Math.abs(bx) < 80 && Math.abs(bz) < 80 ? 1.5 : 1);
        const ox = rng.range(-12, 12);
        const oz = rng.range(-12, 12);
        const cx = bx + ox;
        const cz = bz + oz;
        if (Math.abs(cx - bx) + w / 2 > 28 || Math.abs(cz - bz) + d / 2 > 28) continue;
        const mat = rng.pick(mats);
        const b = new THREE.Mesh(boxGeo, mat);
        b.scale.set(w, h, d);
        b.position.set(cx, h / 2, cz);
        scene.add(b);
        colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
      }
    }
  }

  // The bank: a tall landmark on the north edge of its forecourt block.
  const bank = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0xe8dcc0, map: winTex }));
  bank.scale.set(34, 26, 18);
  bank.position.set(-222, 13, -56);
  scene.add(bank);
  colliders.push({ minX: -239, maxX: -205, minZ: -65, maxZ: -47 });
  // Bank sign: a gold slab above the door.
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(20, 2, 1),
    new THREE.MeshBasicMaterial({ color: 0xd4af37 }),
  );
  sign.position.set(-222, 20, -46.5);
  scene.add(sign);

  // Trees and lamps along block edges (visual only, no colliders, so the
  // autopilot never snags on street furniture).
  const trunkMat = new THREE.MeshLambertMaterial({ color: COLORS.trunk });
  const leafMat = new THREE.MeshLambertMaterial({ color: COLORS.tree });
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x3a3f45 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (const bx of blockCenters) {
    for (const bz of blockCenters) {
      if (rng.chance(0.5)) continue;
      const tx = bx + rng.range(-26, 26);
      const tz = bz + rng.range(-26, 26);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 2.4, 6), trunkMat);
      trunk.position.set(tx, 1.2, tz);
      scene.add(trunk);
      const leaves = new THREE.Mesh(new THREE.ConeGeometry(2.2, 5, 8), leafMat);
      leaves.position.set(tx, 4.6, tz);
      scene.add(leaves);
    }
  }
  for (const c of ROAD_COORDS) {
    for (let t = -240; t <= 240; t += 74) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 6, 6), lampMat);
      pole.position.set(c + 8, 3, t);
      scene.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), bulbMat);
      bulb.position.set(c + 8, 6.1, t);
      scene.add(bulb);
    }
  }

  // Lighting: warm sun + sky fill.
  const sun = new THREE.DirectionalLight(0xfff2d8, 2.4);
  sun.position.set(120, 180, 60);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x4a5548, 1.1));
  scene.fog = new THREE.Fog(COLORS.sky, 320, 620);

  return {
    colliders,
    plaza: { x: -111, z: -111 },
    bank: { x: -222, z: -37 },
    pier: { x: 285, z: 285 },
    garage: { x: 185, z: 37 },
  };
}

// Circle (radius r) vs axis-aligned box push-out. Returns the corrected
// position and the impact normal, or null when there is no overlap.
export function collideCircleBox(px, pz, r, box) {
  const cx = Math.max(box.minX, Math.min(px, box.maxX));
  const cz = Math.max(box.minZ, Math.min(pz, box.maxZ));
  const dx = px - cx;
  const dz = pz - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return null;
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2);
    return { x: cx + (dx / d) * r, z: cz + (dz / d) * r, nx: dx / d, nz: dz / d, depth: r - d };
  }
  // Centre inside the box: push out along the smallest penetration axis.
  const pl = px - box.minX;
  const pr = box.maxX - px;
  const pt = pz - box.minZ;
  const pb = box.maxZ - pz;
  const m = Math.min(pl, pr, pt, pb);
  if (m === pl) return { x: box.minX - r, z: pz, nx: -1, nz: 0, depth: m + r };
  if (m === pr) return { x: box.maxX + r, z: pz, nx: 1, nz: 0, depth: m + r };
  if (m === pt) return { x: px, z: box.minZ - r, nx: 0, nz: -1, depth: m + r };
  return { x: px, z: box.maxZ + r, nx: 0, nz: 1, depth: m + r };
}

export function collideWithWorld(px, pz, r, colliders) {
  let hit = null;
  for (const box of colliders) {
    const res = collideCircleBox(px, pz, r, box);
    if (res) {
      px = res.x;
      pz = res.z;
      hit = res;
    }
  }
  return { x: px, z: pz, hit };
}
