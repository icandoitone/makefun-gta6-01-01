// Wanted system: heat level, police pursuit cars, the helicopter, and
// the busted check. Police respawn near the player when they fall too
// far behind, so pressure never quietly dies.

import * as THREE from 'three';
import { ECONOMY, nearestRoadPoint, dist } from './config.js';
import { Car, updatePlayerCar } from './cars.js';
import AudioSys from './audio.js';

export class WantedSystem {
  constructor(scene) {
    this.scene = scene;
    this.level = 0;
    this.heatTimer = 0;
    this.bustedTimer = 0;
    this.police = [];
    this.heli = null;
    this._heliRotor = null;
    this._spawnTimer = 0;
    this._flashTimer = 0;
    this._flashOn = false;
  }

  addCrime(amount, reason) {
    if (amount <= 0) return;
    this.level = Math.min(ECONOMY.maxWanted, this.level + amount);
    this.heatTimer = 0;
  }

  clear() {
    this.level = 0;
    this.heatTimer = 0;
    this.bustedTimer = 0;
    this._despawnAll();
    AudioSys.sirenStop();
  }

  _despawnAll() {
    for (const p of this.police) {
      this.scene.remove(p.mesh);
      p.alive = false;
    }
    this.police = [];
    if (this.heli) {
      this.scene.remove(this.heli);
      this.heli = null;
      this._heliRotor = null;
    }
  }

  _ensureHeli() {
    if (this.heli || this.level < 3) return;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.4, 6),
      new THREE.MeshLambertMaterial({ color: 0x22282e }));
    g.add(body);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 4.5),
      new THREE.MeshLambertMaterial({ color: 0x22282e }));
    tail.position.set(0, 0.2, -4.8);
    g.add(tail);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.12, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x111111 }));
    rotor.position.y = 1.0;
    rotor.name = 'rotor';
    g.add(rotor);
    this._heliRotor = rotor;
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(6, 30, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff6c8, transparent: true, opacity: 0.13, side: THREE.DoubleSide }),
    );
    cone.position.y = -15;
    cone.rotation.x = Math.PI;
    g.add(cone);
    this.heli = g;
    this.scene.add(g);
  }

  _spawnPoliceNear(px, pz) {
    const p = new Car(this.scene, 0x1c2733, { police: true });
    // Appear on a road point 40-70m from the player, behind the direction
    // of travel when possible.
    const rp = nearestRoadPoint(px + (Math.random() - 0.5) * 100, pz + (Math.random() - 0.5) * 100);
    const d = dist(rp.x, rp.z, px, pz);
    if (d < 30) { rp.x += 50; }
    p.setPos(rp.x, rp.z, Math.atan2(px - rp.x, pz - rp.z));
    p.speed = 12;
    this.police.push(p);
    return p;
  }

  update(dt, player, colliders, others) {
    // Decay: no crime for a while and no police close by cools the heat.
    // The helicopter pins the heat while it is in the air.
    if (this.level > 0) {
      this.heatTimer += dt;
      const nearest = this.police.reduce((m, p) => Math.min(m, dist(p.x, p.z, player.x, player.z)), 1e9);
      if (this.heatTimer > ECONOMY.heatDecaySeconds && nearest > 45 && !this.heli) {
        this.level -= 1;
        this.heatTimer = 0;
        if (this.level === 0) this._despawnAll();
      }
    }

    // Keep the right number of pursuit cars on the road.
    const want = this.level > 0 ? Math.min(3, this.level) : 0;
    this._spawnTimer -= dt;
    if (this.police.length < want && this._spawnTimer <= 0) {
      this._spawnPoliceNear(player.x, player.z);
      this._spawnTimer = 2.5;
    }
    // A pursuit car that fell far behind respawns near the player.
    for (const p of this.police) {
      if (dist(p.x, p.z, player.x, player.z) > 170) {
        const rp = nearestRoadPoint(player.x + (Math.random() - 0.5) * 90, player.z + (Math.random() - 0.5) * 90);
        p.setPos(rp.x, rp.z, Math.atan2(player.x - rp.x, player.z - rp.z));
        p.speed = 14;
      }
    }

    // Pursuit: steer straight at the player and ram. Building collision
    // pushes them along walls instead of pinning them.
    for (const p of this.police) {
      const dx = player.x - p.x;
      const dz = player.z - p.z;
      const wantHeading = Math.atan2(dx, dz);
      let dh = wantHeading - p.heading;
      while (dh > Math.PI) dh -= 2 * Math.PI;
      while (dh < -Math.PI) dh += 2 * Math.PI;
      const steer = Math.max(-1, Math.min(1, dh * 2.0));
      const d = Math.hypot(dx, dz);
      const throttle = d > 6 ? 1 : 0.4;
      updatePlayerCar(p, dt, throttle, steer, colliders, others);
      // Light bar flash.
      this._flashTimer += dt;
      if (this._flashTimer > 0.28) {
        this._flashTimer = 0;
        this._flashOn = !this._flashOn;
        const red = p.mesh.getObjectByName('light-red');
        const blue = p.mesh.getObjectByName('light-blue');
        if (red) red.material.color.setHex(this._flashOn ? 0xff2222 : 0x551111);
        if (blue) blue.material.color.setHex(this._flashOn ? 0x111155 : 0x2244ff);
      }
    }

    // Helicopter.
    if (this.level >= 3) this._ensureHeli();
    if (this.heli) {
      if (this.level < 3) {
        this.scene.remove(this.heli);
        this.heli = null;
        this._heliRotor = null;
      } else {
        this.heli.position.x += (player.x - this.heli.position.x) * Math.min(1, dt * 0.9);
        this.heli.position.z += (player.z - this.heli.position.z) * Math.min(1, dt * 0.9);
        this.heli.position.y = 42 + Math.sin(performance.now() * 0.001) * 2;
        if (this._heliRotor) this._heliRotor.rotation.y += dt * 22;
      }
    }

    // Siren follows the wanted level.
    if (this.level > 0) AudioSys.sirenStart();
    else AudioSys.sirenStop();

    // Busted: a police car sits on top of a slow player for a while.
    const playerSlow = Math.abs(player.speed || 0) < 1.5;
    let close = false;
    for (const p of this.police) {
      if (dist(p.x, p.z, player.x, player.z) < (player.inCar ? 7 : 4.5)) { close = true; break; }
    }
    if (this.level > 0 && playerSlow && close) {
      this.bustedTimer += dt;
    } else {
      this.bustedTimer = Math.max(0, this.bustedTimer - dt * 2);
    }
    return this.bustedTimer > 2.5;
  }
}
