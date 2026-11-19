// Vehicles: the player's car, traffic and police. Arcade physics —
// acceleration, braking, steering that tightens at low speed — plus
// circle-vs-box building collision and car-vs-car bumps.

import * as THREE from 'three';
import { ROAD_COORDS, PITCH, CITY_HALF, nearestJunction, nextJunctionToward, dist } from './config.js';
import { collideWithWorld } from './world.js';
import { makeRng } from './random.js';

export const CAR_RADIUS = 1.9;

function makeCarMesh(color, opts = {}) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x18242e });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.7, 4.2), bodyMat);
  body.position.y = 0.55;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.0), glassMat);
  cabin.position.set(0, 1.15, -0.2);
  g.add(cabin);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const wheelGeo = new THREE.BoxGeometry(0.35, 0.7, 0.7);
  for (const [wx, wz] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(wx, 0.35, wz);
    g.add(w);
  }
  // Headlights.
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
  for (const lx of [-0.6, 0.6]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), lightMat);
    l.position.set(lx, 0.6, 2.12);
    g.add(l);
  }
  if (opts.police) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.22, 0.5),
      new THREE.MeshLambertMaterial({ color: 0xdddddd }));
    bar.position.set(0, 1.55, -0.2);
    g.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.24, 0.52),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.set(-0.32, 1.55, -0.2);
    red.name = 'light-red';
    g.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.24, 0.52),
      new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    blue.position.set(0.32, 1.55, -0.2);
    blue.name = 'light-blue';
    g.add(blue);
  }
  if (opts.spoiler) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.1, 0.45), bodyMat);
    sp.position.set(0, 1.05, -2.0);
    g.add(sp);
  }
  return g;
}

export class Car {
  constructor(scene, color, opts = {}) {
    this.mesh = makeCarMesh(color, opts);
    scene.add(this.mesh);
    this.x = 0;
    this.z = 0;
    this.heading = 0;
    this.speed = 0;
    this.steer = 0;
    this.isPlayer = !!opts.player;
    this.isPolice = !!opts.police;
    this.isTraffic = !!opts.traffic;
    this.alive = true;
    this.target = null; // traffic: current junction target {x,z}
    this.waitTimer = 0;
    this.flashTimer = 0;
  }

  setPos(x, z, heading) {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.speed = 0;
    this.sync();
  }

  sync() {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
  }

  forward() {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  }
}

// Player car physics. throttle: -1..1 (negative = brake/reverse),
// steer: -1..1. Returns events: { crashed, strength }.
export function updatePlayerCar(car, dt, throttle, steer, colliders, others) {
  const MAX_FWD = 29;
  const MAX_REV = 9;
  const ACCEL = 15;
  const BRAKE = 34;
  const DRAG = 0.35;
  const prevSpeed = car.speed;

  if (throttle > 0) car.speed += ACCEL * throttle * dt;
  else if (throttle < 0) {
    if (car.speed > 0.5) car.speed += BRAKE * throttle * dt;
    else car.speed += ACCEL * 0.6 * throttle * dt;
  }
  car.speed -= car.speed * DRAG * dt;
  if (car.speed > MAX_FWD) car.speed = MAX_FWD;
  if (car.speed < -MAX_REV) car.speed = -MAX_REV;
  if (Math.abs(car.speed) < 0.05 && throttle === 0) car.speed = 0;

  // Steering tightens at low speed, relaxes at high speed.
  const steerAuthority = 0.62 * (1 - Math.min(1, Math.abs(car.speed) / MAX_FWD) * 0.55);
  car.heading += steer * steerAuthority * (car.speed / 6) * dt * (car.speed >= 0 ? 1 : -1);
  car.steer = steer;

  const f = car.forward();
  car.x += f.x * car.speed * dt;
  car.z += f.z * car.speed * dt;

  // City bounds.
  car.x = Math.max(-CITY_HALF, Math.min(CITY_HALF, car.x));
  car.z = Math.max(-CITY_HALF, Math.min(CITY_HALF, car.z));

  // Buildings.
  let crashed = false;
  let strength = 0;
  const res = collideWithWorld(car.x, car.z, CAR_RADIUS, colliders);
  if (res.hit) {
    const impact = Math.abs(prevSpeed);
    if (impact > 7) { crashed = true; strength = impact / MAX_FWD; }
    car.x = res.x;
    car.z = res.z;
    // Kill the speed component into the wall.
    const dot = f.x * res.hit.nx + f.z * res.hit.nz;
    if (dot < 0) car.speed *= 0.45;
  }

  // Other cars: soft bump.
  for (const o of others) {
    if (!o.alive || o === car) continue;
    const dx = car.x - o.x;
    const dz = car.z - o.z;
    const d2 = dx * dx + dz * dz;
    const min = CAR_RADIUS * 2;
    if (d2 < min * min && d2 > 1e-6) {
      const d = Math.sqrt(d2);
      const push = (min - d) / 2;
      car.x += (dx / d) * push;
      car.z += (dz / d) * push;
      if (Math.abs(prevSpeed) > 6) { crashed = true; strength = Math.max(strength, 0.4); }
      car.speed *= 0.85;
    }
  }

  car.sync();
  return { crashed, strength };
}

// Traffic: each car drives the road graph toward a junction target, then
// picks a new one. Brakes for a car ahead; if blocked too long it drives
// through instead of waiting forever.
export function updateTraffic(car, dt, colliders, others) {
  if (!car.target) {
    const j = nearestJunction(car.x, car.z);
    car.target = nextJunctionToward(j, { x: car.x + (Math.random() - 0.5) * 200, z: car.z + (Math.random() - 0.5) * 200 })
      || { x: car.x, z: car.z };
  }
  const dx = car.target.x - car.x;
  const dz = car.target.z - car.z;
  const d = Math.hypot(dx, dz);
  if (d < 5) {
    const j = nearestJunction(car.x, car.z);
    const goal = { x: car.x + (Math.random() - 0.5) * 300, z: car.z + (Math.random() - 0.5) * 300 };
    car.target = nextJunctionToward(j, goal) || car.target;
    return;
  }
  const wantHeading = Math.atan2(dx, dz);
  let dh = wantHeading - car.heading;
  while (dh > Math.PI) dh -= 2 * Math.PI;
  while (dh < -Math.PI) dh += 2 * Math.PI;
  const steer = Math.max(-1, Math.min(1, dh * 1.6));

  // Car ahead? Brake, but never longer than 3 seconds.
  let blocked = false;
  const f = car.forward();
  for (const o of others) {
    if (!o.alive || o === car) continue;
    const ox = o.x - car.x;
    const oz = o.z - car.z;
    const along = ox * f.x + oz * f.z;
    const side = Math.abs(ox * f.z - oz * f.x);
    if (along > 0 && along < 11 && side < 3.2) { blocked = true; break; }
  }
  if (blocked) {
    car.waitTimer += dt;
    if (car.waitTimer > 3) blocked = false; // drive through the jam
  } else {
    car.waitTimer = 0;
  }

  const cruise = 11 + (car.cruiseOffset || 0);
  const throttle = blocked ? -0.6 : (car.speed < cruise ? 0.8 : 0);
  updatePlayerCar(car, dt, throttle, steer, colliders, others);
}

export function spawnTraffic(scene, count, rng, excludeNear) {
  const colors = [0x3a6ea5, 0xc9a227, 0x5a5a5a, 0x7a3b2e, 0x2e7a5a, 0x8a8a8a, 0x4a3a6e];
  const cars = [];
  for (let i = 0; i < count; i++) {
    const car = new Car(scene, rng.pick(colors), { traffic: true });
    car.cruiseOffset = rng.range(-2, 3);
    // Start on a random junction, facing along a road.
    const jx = rng.pick(ROAD_COORDS);
    const jz = rng.pick(ROAD_COORDS);
    if (excludeNear && dist(jx, jz, excludeNear.x, excludeNear.z) < 40) { i--; continue; }
    car.setPos(jx, jz, rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]));
    car.speed = rng.range(6, 10);
    const j = nearestJunction(car.x, car.z);
    car.target = nextJunctionToward(j, { x: car.x + rng.range(-200, 200), z: car.z + rng.range(-200, 200) });
    cars.push(car);
  }
  return cars;
}

export { makeCarMesh };
