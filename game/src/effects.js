// Small visual effects: crash sparks, muzzle flash and screen shake.
// All particles are one THREE.Points pool reused every frame.

import * as THREE from 'three';

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.max = 240;
    this.positions = new Float32Array(this.max * 3);
    this.velocities = [];
    this.life = new Float32Array(this.max);
    for (let i = 0; i < this.max; i++) {
      this.velocities.push({ x: 0, y: 0, z: 0 });
      this.positions[i * 3 + 1] = -100; // parked below the world
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffc861, size: 0.35, sizeAttenuation: true, transparent: true, opacity: 0.95,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.cursor = 0;
    this.shake = 0;
    this.flash = new THREE.PointLight(0xffe9a8, 0, 18, 1.6);
    scene.add(this.flash);
    this._flashTimer = 0;
  }

  burst(x, y, z, count, spread, up) {
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      this.positions[i * 3] = x;
      this.positions[i * 3 + 1] = y;
      this.positions[i * 3 + 2] = z;
      this.velocities[i] = {
        x: (Math.random() - 0.5) * spread,
        y: Math.random() * (up || 4),
        z: (Math.random() - 0.5) * spread,
      };
      this.life[i] = 0.5 + Math.random() * 0.4;
    }
  }

  muzzle(x, y, z) {
    this.flash.position.set(x, y, z);
    this.flash.intensity = 60;
    this._flashTimer = 0.07;
    this.burst(x, y, z, 6, 3, 2);
  }

  addShake(amount) {
    this.shake = Math.min(1.2, this.shake + amount);
  }

  update(dt) {
    let any = false;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      this.life[i] -= dt;
      const v = this.velocities[i];
      v.y -= 9 * dt;
      this.positions[i * 3] += v.x * dt;
      this.positions[i * 3 + 1] += v.y * dt;
      this.positions[i * 3 + 2] += v.z * dt;
      if (this.life[i] <= 0 || this.positions[i * 3 + 1] < 0) {
        this.life[i] = 0;
        this.positions[i * 3 + 1] = -100;
      }
    }
    if (any) this.points.geometry.attributes.position.needsUpdate = true;
    if (this._flashTimer > 0) {
      this._flashTimer -= dt;
      if (this._flashTimer <= 0) this.flash.intensity = 0;
    }
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 2.2);
  }
}
