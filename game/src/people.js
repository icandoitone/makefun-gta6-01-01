// People: pedestrians wandering the sidewalks, the player on foot, and
// the simple hitscan combat. Pedestrians walk between random sidewalk
// waypoints and flee from gunfire or a speeding car.

import * as THREE from 'three';
import { ROAD_COORDS, PITCH, CITY_HALF, dist } from './config.js';
import { collideWithWorld } from './world.js';
import { makeRng } from './random.js';

const SHIRT_COLORS = [0xd7263d, 0x3a6ea5, 0x2e7a5a, 0xc9a227, 0x7a3b2e, 0xe8e8e8, 0x4a3a6e, 0x222222];

function makePedMesh(shirtColor) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.42, 1.15, 8),
    new THREE.MeshLambertMaterial({ color: shirtColor }),
  );
  body.position.y = 0.85;
  g.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xd9a986 }),
  );
  head.position.y = 1.65;
  g.add(head);
  const legs = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.55, 0.3),
    new THREE.MeshLambertMaterial({ color: 0x2a2f38 }),
  );
  legs.position.y = 0.28;
  g.add(legs);
  return g;
}

export class Ped {
  constructor(scene, rng, x, z) {
    this.mesh = makePedMesh(rng.pick(SHIRT_COLORS));
    scene.add(this.mesh);
    this.x = x;
    this.z = z;
    this.heading = rng.range(0, Math.PI * 2);
    this.speed = rng.range(1.2, 2.2);
    this.state = 'walk';
    this.target = this._randomWaypoint(rng);
    this.alive = true;
    this.fleeTimer = 0;
    this._rng = rng;
    this.sync();
  }

  _randomWaypoint(rng) {
    // A sidewalk point: just off a road, inside a block edge.
    const bx = rng.pick(ROAD_COORDS.slice(0, 7)) + PITCH / 2;
    const bz = rng.pick(ROAD_COORDS.slice(0, 7)) + PITCH / 2;
    return { x: bx + rng.range(-24, 24), z: bz + rng.range(-24, 24) };
  }

  sync() {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
  }

  fleeFrom(x, z) {
    this.state = 'flee';
    this.fleeTimer = 3;
    const dx = this.x - x;
    const dz = this.z - z;
    const d = Math.hypot(dx, dz) || 1;
    this.target = { x: this.x + (dx / d) * 30, z: this.z + (dz / d) * 30 };
  }

  update(dt, colliders) {
    if (!this.alive) return;
    if (this.state === 'flee') {
      this.fleeTimer -= dt;
      if (this.fleeTimer <= 0) this.state = 'walk';
    }
    const dx = this.target.x - this.x;
    const dz = this.target.z - this.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.5) {
      if (this.state === 'flee') { this.state = 'walk'; }
      this.target = this._randomWaypoint(this._rng);
      return;
    }
    const want = Math.atan2(dx, dz);
    let dh = want - this.heading;
    while (dh > Math.PI) dh -= 2 * Math.PI;
    while (dh < -Math.PI) dh += 2 * Math.PI;
    this.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, dh));
    const sp = this.state === 'flee' ? this.speed * 2.4 : this.speed;
    this.x += Math.sin(this.heading) * sp * dt;
    this.z += Math.cos(this.heading) * sp * dt;
    this.x = Math.max(-CITY_HALF, Math.min(CITY_HALF, this.x));
    this.z = Math.max(-CITY_HALF, Math.min(CITY_HALF, this.z));
    const res = collideWithWorld(this.x, this.z, 0.5, colliders);
    this.x = res.x;
    this.z = res.z;
    this.sync();
  }
}

export function spawnPeds(scene, count, rng, excludeNear) {
  const peds = [];
  for (let i = 0; i < count; i++) {
    const x = rng.range(-250, 250);
    const z = rng.range(-250, 250);
    if (excludeNear && dist(x, z, excludeNear.x, excludeNear.z) < 30) { i--; continue; }
    peds.push(new Ped(scene, rng, x, z));
  }
  return peds;
}

// --- the player on foot -----------------------------------------------------

export class PlayerFoot {
  constructor(scene) {
    this.mesh = makePedMesh(0xd7263d);
    scene.add(this.mesh);
    this.x = 0;
    this.z = 0;
    this.heading = 0;
    this.health = 100;
    this.ammo = 30;
    this.reloadTimer = 0;
    this.shootCooldown = 0;
  }

  setPos(x, z, heading) {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.sync();
  }

  sync() {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
  }

  // moveX: strafe -1..1, moveZ: forward -1..1, both camera-relative.
  update(dt, moveX, moveZ, cameraHeading, colliders) {
    const run = 9.5;
    const walk = 6;
    const speed = (Math.abs(moveX) > 0 || Math.abs(moveZ) > 0) && (moveZ > 0.5) ? run : walk;
    const sin = Math.sin(cameraHeading);
    const cos = Math.cos(cameraHeading);
    const dx = (sin * moveZ + cos * moveX) * speed * dt;
    const dz = (cos * moveZ - sin * moveX) * speed * dt;
    this.x += dx;
    this.z += dz;
    if (dx !== 0 || dz !== 0) this.heading = Math.atan2(dx, dz);
    this.x = Math.max(-CITY_HALF, Math.min(CITY_HALF, this.x));
    this.z = Math.max(-CITY_HALF, Math.min(CITY_HALF, this.z));
    const res = collideWithWorld(this.x, this.z, 0.5, colliders);
    this.x = res.x;
    this.z = res.z;
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this.ammo = 30;
    }
    if (this.shootCooldown > 0) this.shootCooldown -= dt;
    this.sync();
  }
}

// --- combat -----------------------------------------------------------------

// Hitscan shot from (x, z) along heading. Hits the nearest living ped,
// police car or traffic car within range and a narrow cone. Returns the
// victim or null.
export function tryShoot(x, z, heading, range, peds, cars) {
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  let best = null;
  let bestD = range;
  const consider = (tx, tz, obj) => {
    const dx = tx - x;
    const dz = tz - z;
    const d = Math.hypot(dx, dz);
    if (d > bestD || d < 0.5) return;
    const along = (dx * fx + dz * fz) / d;
    if (along < 0.94) return; // outside a ~20 degree cone
    bestD = d;
    best = obj;
  };
  for (const p of peds) if (p.alive) consider(p.x, p.z, { kind: 'ped', ref: p });
  for (const c of cars) {
    if (!c.alive) continue;
    consider(c.x, c.z, { kind: c.isPolice ? 'police' : 'car', ref: c });
  }
  return best;
}

export { makePedMesh };
