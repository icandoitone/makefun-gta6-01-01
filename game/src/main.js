// Solmar Bay — game entry point. Wires the city, vehicles, people,
// wanted system, missions and autopilot into one loop, plus the menu,
// pause, busted/wasted and campaign-complete states, the save slot, and
// the window.__solmar handle the playtest harness reads.

import * as THREE from 'three';
import { CITY_HALF, ROAD_COORDS, ECONOMY, MISSIONS, totalPayoutUpTo, dist, nearestRoadPoint } from './config.js';
import { makeRng } from './random.js';
import { Input } from './input.js';
import AudioSys from './audio.js';
import { buildWorld } from './world.js';
import { Car, updatePlayerCar, updateTraffic, spawnTraffic } from './cars.js';
import { Ped, spawnPeds, PlayerFoot, tryShoot } from './people.js';
import { WantedSystem } from './wanted.js';
import { MissionRunner } from './missions.js';
import { Autopilot, angleDiff } from './autopilot.js';
import { Effects } from './effects.js';
import { Hud } from './hud.js';
import { saveGame, loadGame, hasSave } from './save.js';
import { ShotStager } from './shots.js';

const params = new URLSearchParams(location.search);
const SEED = parseInt(params.get('seed') || '1337', 10);
const FAST = params.get('fast') === '1';
const LOW = params.get('low') === '1';
const AUTO = params.get('autopilot') === '1';
const SHOT = params.get('shot') || null;
const START_MISSION = params.get('mission') ? parseInt(params.get('mission'), 10) : null;

const log = [];
function logEvent(msg) {
  log.push(`${new Date().toISOString().slice(11, 19)} ${msg}`);
  if (log.length > 60) log.shift();
}

const solmar = {
  state: 'boot', mission: 0, stage: 0, money: ECONOMY.startMoney,
  x: 0, z: 0, speed: 0, wanted: 0, inCar: false, health: 100,
  shotReady: false, campaignDone: false, missionsDone: 0,
  error: null, fps: 0, log,
};
window.__solmar = solmar;
window.addEventListener('error', (e) => {
  if (!solmar.error) solmar.error = String(e.message || e.error);
});

class Game {
  constructor() {
    this.state = 'menu';
    this.money = ECONOMY.startMoney;
    this.timeScale = FAST ? 3 : 1;
    this.renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game-canvas'), antialias: true });
    this.renderer.setPixelRatio(LOW ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87bfe8);
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
    this.camera.position.set(185, 30, 90);

    const rng = makeRng(SEED);
    this.rng = rng;
    this.world = buildWorld(this.scene, SEED);
    this.colliders = this.world.colliders;
    this.effects = new Effects(this.scene);
    this.hud = new Hud();
    this.wanted = new WantedSystem(this.scene);
    this.autopilot = new Autopilot();
    this.shots = new ShotStager();

    // The player's own car, parked across town from Marco's garage, so
    // mission 1 is a real drive, not a free arrival.
    this.playerCar = new Car(this.scene, 0xd7263d, { player: true, spoiler: true });
    this.playerCar.setPos(37, 37, 0);
    this.inCar = false;

    this.foot = new PlayerFoot(this.scene);
    this.foot.setPos(33, 33, 0);

    // Parked cars the player can take, scattered on roads.
    this.traffic = spawnTraffic(this.scene, LOW ? 12 : 22, rng, { x: 185, z: 37 });
    this.parked = [];
    for (const [px, pz, hd] of [[37, 111, 0], [-37, 111, Math.PI / 2], [111, -111, 0], [-185, -37, Math.PI], [259, 185, -Math.PI / 2], [-111, -37, 0], [37, -111, Math.PI / 2]]) {
      const c = new Car(this.scene, rng.pick([0x3a6ea5, 0xc9a227, 0x5a5a5a, 0x2e7a5a]), { traffic: true });
      c.setPos(px, pz, hd);
      c.parked = true;
      this.traffic.push(c);
      this.parked.push(c);
    }

    this.peds = spawnPeds(this.scene, LOW ? 18 : 38, rng, { x: 185, z: 37 });
    this.rico = null; // mission 3 contact
    this.camYaw = 0;
    this.orbitYaw = 0;
    this.cameraMode = 'chase';
    this._lastDamageAt = -10;
    this._elapsed = 0;
    this._fpsFrames = 0;
    this._fpsTimer = 0;
    this._autoNextMissionAt = -1;
    this._autoPlan = null; // { kind: 'toCar'|'drive'|'walk'|'idle', car? }
    this._missionStarted = false;

    this.missions = new MissionRunner(this.scene, {
      toast: (t) => { this.hud.toast(t); logEvent(t); },
      onPayout: (amount) => {
        this.money += amount;
        this.hud.setMoney(this.money);
        this._save();
      },
      onMissionComplete: (m, total) => {
        solmar.missionsDone += 1;
        this.hud.banner('Mission complete', `${m.title} — total earned $${total.toLocaleString()}`);
        logEvent(`mission ${m.id} complete, total $${total}`);
        if (AUTO) this._autoNextMissionAt = this._elapsed + 1.2;
      },
      onCampaignComplete: () => {
        solmar.campaignDone = true;
        this.state = 'complete';
        this.hud.showOverlay('complete');
        this.hud.banner('Campaign complete', 'All six jobs done. Solmar Bay is yours.');
        logEvent('campaign complete');
        this._save();
      },
      setWanted: (n) => { this.wanted.level = Math.max(this.wanted.level, n); this.wanted.heatTimer = 0; },
      onStage: () => { this._autoPlan = null; this.autopilot.stop(); },
    });

    this._wireButtons();
    Input.attach();
    window.addEventListener('resize', () => this._resize());
    window.addEventListener('keydown', () => AudioSys.resume());
    window.addEventListener('mousedown', () => AudioSys.resume());
    document.getElementById('game-canvas').addEventListener('mousedown', () => AudioSys.resume());

    // Auto-start for playtests and screenshots: skip the menu entirely.
    if (AUTO || SHOT) {
      this.startPlaying(true);
      if (SHOT) this.shots.start(SHOT);
      if (AUTO && START_MISSION !== null) this.startMission(START_MISSION - 1);
      else if (AUTO) this.startMission(0);
    } else {
      this.hud.showOverlay('menu');
      const cont = document.getElementById('btn-continue');
      if (cont) cont.style.display = hasSave() ? '' : 'none';
    }
  }

  _resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  _wireButtons() {
    const on = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', fn);
    };
    on('btn-new', () => { this.startPlaying(false); this.startMission(0); });
    on('btn-continue', () => {
      const s = loadGame();
      this.startPlaying(false);
      if (s) {
        this.money = s.money;
        this.hud.setMoney(this.money);
        if (s.inCar) this.placePlayerCar(s.x, s.z, 0);
        else this.placePlayerFoot(s.x, s.z, 0);
        this.hud.toast(`Welcome back. Mission ${Math.min(s.missionUnlocked + 1, 6)} is open — press M.`);
      }
    });
    on('btn-resume', () => this.togglePause(false));
    on('btn-restart', () => { this.startPlaying(false); this.startMission(0); });
    on('btn-busted', () => this._respawnAfterBusted());
    on('btn-wasted', () => this._respawnAfterWasted());
    on('btn-complete-again', () => { this.startPlaying(false); this.startMission(0); });
  }

  _save() {
    saveGame({
      money: this.money,
      missionUnlocked: this.missions.missionIndex,
      x: this.inCar ? this.playerCar.x : this.foot.x,
      z: this.inCar ? this.playerCar.z : this.foot.z,
      inCar: this.inCar,
      health: this.foot.health,
    });
  }

  startPlaying(skipMenu) {
    this.state = 'playing';
    this.hud.hideOverlays();
    AudioSys.resume();
    AudioSys.engineStart();
    logEvent('game started');
  }

  startMission(i) {
    if (this.missions.startMission(i)) {
      this._missionStarted = true;
      this._autoPlan = null;
      this.autopilot.stop();
    }
  }

  togglePause(force) {
    if (this.state === 'playing' && force !== false) {
      this.state = 'paused';
      this.hud.showOverlay('pause');
    } else if (this.state === 'paused' && force !== true) {
      this.state = 'playing';
      this.hud.hideOverlays();
    }
  }

  placePlayerCar(x, z, heading) {
    this.playerCar.setPos(x, z, heading);
    this.inCar = true;
    this.foot.mesh.visible = false;
    this.foot.setPos(x - 3, z, heading);
  }

  placePlayerFoot(x, z, heading) {
    this.inCar = false;
    this.foot.setPos(x, z, heading);
    this.foot.mesh.visible = true;
  }

  setWanted(n) {
    if (n <= 0) this.wanted.clear();
    else { this.wanted.level = n; this.wanted.heatTimer = 0; }
  }

  setCameraMode(mode) { this.cameraMode = mode; }

  spawnTrafficNear(x, z, n) {
    const more = spawnTraffic(this.scene, n, this.rng, null);
    for (const c of more) {
      const jx = this.rng.pick(ROAD_COORDS);
      c.setPos(x + this.rng.range(-30, 30), z + this.rng.range(-30, 30), this.rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]));
      c.speed = this.rng.range(6, 12);
    }
    this.traffic.push(...more);
  }

  spawnPedsNear(x, z, n) {
    for (let i = 0; i < n; i++) {
      const p = new Ped(this.scene, this.rng, x + this.rng.range(-14, 14), z + this.rng.range(-14, 14));
      this.peds.push(p);
    }
  }

  spawnPoliceNear(x, z, n) {
    for (let i = 0; i < n; i++) this.wanted._spawnPoliceNear(x, z);
  }

  // --- carjacking ----------------------------------------------------------

  _nearestEnterableCar(maxD) {
    let best = null;
    let bestD = maxD;
    const px = this.foot.x;
    const pz = this.foot.z;
    const cands = [...this.traffic, this.playerCar];
    for (const c of cands) {
      if (!c.alive) continue;
      // Any car close enough can be taken, moving or parked — boarding
      // stops it dead, arcade style.
      const d = dist(px, pz, c.x, c.z);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  enterCar(car) {
    car.speed = 0; // boarding stops the car dead
    if (car !== this.playerCar) {
      // Swap: the old player car becomes a parked car; the taken car is ours.
      this.playerCar.isPlayer = false;
      this.playerCar.isTraffic = true;
      this.playerCar.parked = true;
      this.traffic.push(this.playerCar);
      car.isTraffic = false;
      car.isPlayer = true;
      car.parked = false;
      this.playerCar = car;
      this.wanted.addCrime(ECONOMY.carjackWanted, 'carjack');
      this.hud.toast('Car taken — the cops noticed.');
      logEvent('carjacked a car, wanted ' + this.wanted.level);
    }
    this.inCar = true;
    this.foot.mesh.visible = false;
    AudioSys.enterCar();
  }

  exitCar() {
    this.inCar = false;
    const f = this.playerCar.forward();
    this.foot.setPos(this.playerCar.x - f.z * 3, this.playerCar.z + f.x * 3, this.playerCar.heading);
    this.foot.mesh.visible = true;
    this.playerCar.parked = true;
  }

  // --- shooting --------------------------------------------------------------

  _shoot() {
    if (this.foot.shootCooldown > 0 || this.foot.reloadTimer > 0) return;
    if (this.foot.ammo <= 0) {
      this.foot.reloadTimer = 1.6;
      this.hud.toast('Reloading…');
      return;
    }
    this.foot.ammo -= 1;
    this.foot.shootCooldown = 0.28;
    AudioSys.shot();
    const fx = this.foot.x + Math.sin(this.foot.heading) * 1.2;
    const fz = this.foot.z + Math.cos(this.foot.heading) * 1.2;
    this.effects.muzzle(fx, 1.5, fz);
    const hit = tryShoot(this.foot.x, this.foot.z, this.foot.heading, 34, this.peds, [...this.traffic, ...this.wanted.police, this.playerCar]);
    if (hit) {
      if (hit.kind === 'ped') {
        const p = hit.ref;
        p.alive = false;
        p.mesh.rotation.z = Math.PI / 2;
        p.mesh.position.y = 0.3;
        this.wanted.addCrime(ECONOMY.hitPedWanted, 'shooting');
        this.effects.burst(p.x, 1, p.z, 14, 4, 3);
        for (const q of this.peds) if (q.alive && dist(q.x, q.z, p.x, p.z) < 25) q.fleeFrom(p.x, p.z);
      } else if (hit.kind === 'police') {
        hit.ref.speed = 0;
        hit.ref.waitTimer = 4;
        this.wanted.addCrime(ECONOMY.shootWanted, 'shooting police');
        this.effects.burst(hit.ref.x, 1, hit.ref.z, 18, 5, 4);
      } else {
        this.effects.burst(hit.ref.x, 1, hit.ref.z, 10, 4, 3);
      }
    }
  }

  _respawnAfterBusted() {
    this.money = Math.max(0, this.money - 200);
    this.hud.setMoney(this.money);
    this.wanted.clear();
    this.foot.health = 100;
    this.placePlayerCar(185, 37, 0);
    this.state = 'playing';
    this.hud.hideOverlays();
    this.hud.toast('Busted. $200 bail — Marco got you out.');
    logEvent('busted, respawned at garage');
    this._save();
  }

  _respawnAfterWasted() {
    this.money = Math.max(0, this.money - 100);
    this.hud.setMoney(this.money);
    this.wanted.clear();
    this.foot.health = 100;
    this.placePlayerFoot(-111, -111, 0);
    this.state = 'playing';
    this.hud.hideOverlays();
    this.hud.toast('You woke up at the plaza clinic. $100 bill.');
    logEvent('wasted, respawned at plaza');
    this._save();
  }

  // --- autopilot driver ------------------------------------------------------

  _autoTick(dt) {
    const m = this.missions;
    if (!m.active) {
      if (this._autoNextMissionAt > 0 && this._elapsed >= this._autoNextMissionAt) {
        this._autoNextMissionAt = -1;
        if (m.missionIndex < MISSIONS.length) this.startMission(m.missionIndex);
      }
      return;
    }
    const s = m.stage;
    if (!s) return;
    const others = [...this.traffic, ...this.wanted.police];

    if (s.type === 'enter') {
      if (this.inCar) return; // mission runner completes the stage
      const car = this._nearestEnterableCar(60);
      if (!car) return;
      const d = dist(this.foot.x, this.foot.z, car.x, car.z);
      if (d <= 3.5) { this.enterCar(car); return; }
      this.autopilot.start({ x: car.x, z: car.z, radius: 3 }, 'walk');
      const mv = this.autopilot.walkTick(dt, this.foot);
      this.foot.update(dt, mv.moveX, mv.moveZ, this.foot.heading, this.colliders);
      return;
    }

    if (s.type === 'drive' || s.type === 'escape') {
      if (!this.inCar) {
        const car = this._nearestEnterableCar(60);
        if (!car) return;
        const d = dist(this.foot.x, this.foot.z, car.x, car.z);
        if (d <= 3.5) { this.enterCar(car); return; }
        this.autopilot.start({ x: car.x, z: car.z, radius: 3 }, 'walk');
        const mv = this.autopilot.walkTick(dt, this.foot);
        this.foot.update(dt, mv.moveX, mv.moveZ, this.foot.heading, this.colliders);
        return;
      }
      if (this.autopilot.mode !== 'drive' || !this.autopilot.active || this.autopilot.target?.x !== s.x) {
        this.autopilot.start({ x: s.x, z: s.z, radius: s.radius }, 'drive');
      }
      const res = this.autopilot.driveTick(dt, this.playerCar, others);
      if (res.repositioned) logEvent('autopilot repositioned the car to the road');
      const out = updatePlayerCar(this.playerCar, dt, res.throttle, res.steer, this.colliders, others);
      if (out.crashed) this._damage(out.strength * 12);
      return;
    }

    // walk / grab / pickup stages
    const target = { x: s.x, z: s.z, radius: s.radius };
    if (this.inCar) {
      const park = Autopilot.parkPointFor(target);
      const dPark = dist(this.playerCar.x, this.playerCar.z, park.x, park.z);
      if (dPark > 8) {
        if (this.autopilot.mode !== 'drive' || !this.autopilot.active) {
          this.autopilot.start({ x: park.x, z: park.z, radius: 6 }, 'drive');
        }
        const res = this.autopilot.driveTick(dt, this.playerCar, others);
        if (res.repositioned) logEvent('autopilot repositioned the car to the road');
        updatePlayerCar(this.playerCar, dt, res.throttle, res.steer, this.colliders, others);
        return;
      }
      this.exitCar();
      return;
    }
    if (this.autopilot.mode !== 'walk' || !this.autopilot.active) {
      this.autopilot.start(target, 'walk');
    }
    const mv = this.autopilot.walkTick(dt, this.foot);
    this.foot.update(dt, mv.moveX, mv.moveZ, this.foot.heading, this.colliders);
  }

  _damage(amount) {
    this.foot.health -= amount;
    this._lastDamageAt = this._elapsed;
    if (amount > 4) {
      AudioSys.crash(amount / 20);
      this.effects.addShake(0.3);
    }
  }

  // --- main loop ---------------------------------------------------------------

  frame(dt) {
    const scaled = Math.min(dt, 0.1) * this.timeScale;
    this._elapsed += scaled;
    this._fpsFrames += 1;
    this._fpsTimer += dt;
    if (this._fpsTimer >= 1) {
      solmar.fps = this._fpsFrames / this._fpsTimer;
      this._fpsFrames = 0;
      this._fpsTimer = 0;
    }

    if (this.state === 'playing') {
      // Menu keys.
      if (Input.pressed('KeyM')) {
        Input.consume('KeyM');
        if (!this.missions.active && this.missions.missionIndex < MISSIONS.length) {
          this.startMission(this.missions.missionIndex);
        }
      }
      if (Input.pressed('Escape') || Input.pressed('KeyP')) {
        Input.consume('Escape');
        Input.consume('KeyP');
        this.togglePause();
      }

      // Orbit from mouse drag.
      this.orbitYaw += Input.dragX * 0.005;
      this.orbitYaw = Math.max(-1.2, Math.min(1.2, this.orbitYaw));

      // --- player ---------------------------------------------------------
      const others = [...this.traffic, ...this.wanted.police];
      if (AUTO && !SHOT) {
        this._autoTick(scaled);
      } else if (this.inCar) {
        const throttle = Input.axis('KeyS', 'KeyW') + Input.axis('ArrowDown', 'ArrowUp');
        const steer = Input.axis('KeyA', 'KeyD') + Input.axis('ArrowLeft', 'ArrowRight');
        const out = updatePlayerCar(this.playerCar, scaled, throttle, steer, this.colliders, others);
        if (out.crashed) {
          this._damage(out.strength * 14);
          this.effects.burst(this.playerCar.x, 1, this.playerCar.z, 16, 5, 4);
        }
        if (Input.pressed('KeyE')) {
          Input.consume('KeyE');
          if (this.playerCar.speed < 1) this.exitCar();
        }
      } else {
        const moveZ = Input.axis('KeyS', 'KeyW') + Input.axis('ArrowDown', 'ArrowUp');
        const moveX = Input.axis('KeyA', 'KeyD') + Input.axis('ArrowLeft', 'ArrowRight');
        this.foot.update(scaled, moveX, moveZ, this.camYaw, this.colliders);
        if (Input.pressed('KeyE')) {
          Input.consume('KeyE');
          const car = this._nearestEnterableCar(4.5);
          if (car) this.enterCar(car);
          else this.hud.toast('No car close enough.');
        }
        if (Input.pressed('KeyF') || Input.pressed('Mouse0')) {
          Input.consume('KeyF');
          this._shoot();
        }
        this.foot.heading = this.camYaw; // face where the camera looks on foot
      }

      // Mouse click also shoots on foot.
      if (!this.inCar && Input.pressed('Mouse0')) this._shoot();

      // --- world ------------------------------------------------------------
      for (const c of this.traffic) {
        if (c.parked || c === this.playerCar) continue;
        if (c.waitTimer > 0) { c.waitTimer -= scaled; continue; }
        updateTraffic(c, scaled, this.colliders, [...this.traffic, this.playerCar, ...this.wanted.police]);
      }
      for (const p of this.peds) p.update(scaled, this.colliders);

      // Mission 3 contact stands at his corner until collected.
      if (this.missions.missionIndex === 2 && !this.rico && this.missions.active) {
        this.rico = new Ped(this.scene, this.rng, 111, -185);
        this.rico.mesh.material = this.rico.mesh.material;
      }

      const playerPos = this.inCar ? this.playerCar : this.foot;
      const busted = this.wanted.update(scaled, {
        x: playerPos.x, z: playerPos.z,
        speed: this.inCar ? Math.abs(this.playerCar.speed) : 0,
        inCar: this.inCar,
      }, this.colliders, others);

      // Health regen after a calm stretch.
      if (this._elapsed - this._lastDamageAt > 6 && this.foot.health < 100) {
        this.foot.health = Math.min(100, this.foot.health + 2 * scaled);
      }
      if (this.foot.health <= 0) {
        this.state = 'wasted';
        this.hud.showOverlay('wasted');
        logEvent('wasted');
      } else if (busted) {
        this.state = 'busted';
        this.hud.showOverlay('busted');
        logEvent('busted by police');
      }

      this.missions.update(scaled, {
        playerPos: { x: playerPos.x, z: playerPos.z },
        inCar: this.inCar,
        passengerPed: this.rico,
      });
      this.effects.update(scaled);
      if (SHOT) this.shots.tick(scaled, this);

      // --- camera -------------------------------------------------------------
      const target = this.inCar ? this.playerCar : this.foot;
      const desiredYaw = target.heading + this.orbitYaw;
      let dy = angleDiff(desiredYaw, this.camYaw);
      this.camYaw += dy * Math.min(1, scaled * (this.inCar ? 3.5 : 5));
      const fwdX = Math.sin(this.camYaw);
      const fwdZ = Math.cos(this.camYaw);
      let camDist = this.inCar ? 10.5 : 6.5;
      let camH = this.inCar ? 4.4 : 3.1;
      if (this.cameraMode === 'high') { camDist = 34; camH = 34; }
      if (this.cameraMode === 'foot') { camDist = 9.5; camH = 4.4; }
      const shakeX = (Math.random() - 0.5) * this.effects.shake;
      const shakeY = (Math.random() - 0.5) * this.effects.shake;
      this.camera.position.set(
        target.x - fwdX * camDist + shakeX,
        camH + shakeY,
        target.z - fwdZ * camDist,
      );
      this.camera.lookAt(target.x + fwdX * 6, 1.4, target.z + fwdZ * 6);

      // --- audio + HUD ---------------------------------------------------------
      AudioSys.engineSet(this.inCar ? Math.abs(this.playerCar.speed) / 29 : 0, this.inCar);
      this._updateHud();
    }

    solmar.state = this.state;
    solmar.mission = this.missions.missionIndex + 1;
    solmar.stage = this.missions.stageIndex + 1;
    solmar.money = this.money;
    const pp = this.inCar ? this.playerCar : this.foot;
    solmar.x = Math.round(pp.x * 10) / 10;
    solmar.z = Math.round(pp.z * 10) / 10;
    solmar.speed = this.inCar ? Math.round(Math.abs(this.playerCar.speed) * 10) / 10 : 0;
    solmar.wanted = this.wanted.level;
    solmar.inCar = this.inCar;
    solmar.health = Math.round(this.foot.health);
    solmar.shotReady = this.shots.ready;
    Input.endFrame();
  }

  _updateHud() {
    this.hud.setMoney(this.money);
    this.hud.setHealth(this.foot.health);
    this.hud.setAmmo(this.inCar ? null : this.foot.ammo);
    this.hud.setWanted(this.wanted.level);
    const s = this.missions.stage;
    let distText = '';
    if (this.missions.active && s && s.x !== undefined) {
      const pp = this.inCar ? this.playerCar : this.foot;
      distText = `${Math.round(dist(pp.x, pp.z, s.x, s.z))}m`;
    }
    this.hud.setObjective(this.missions.objectiveText(), distText);
    this.hud.setSpeed(this.inCar ? Math.abs(this.playerCar.speed) * 3.6 : 0, this.inCar);
    this.hud.setHint(this.inCar
      ? 'WASD drive · E exit · M mission'
      : 'WASD move · E take car · F shoot · M mission');
    const st = this.missions.stage;
    this.hud.drawMinimap({
      player: {
        x: this.inCar ? this.playerCar.x : this.foot.x,
        z: this.inCar ? this.playerCar.z : this.foot.z,
        heading: this.inCar ? this.playerCar.heading : this.foot.heading,
        inCar: this.inCar,
      },
      beacon: (this.missions.active && st && st.x !== undefined) ? { x: st.x, z: st.z } : null,
      traffic: this.traffic.filter((c) => c !== this.playerCar).slice(0, 40),
      police: this.wanted.police,
    });
  }
}

const game = new Game();
window.__game = game;

let last = performance.now();
function loop(now) {
  const dt = (now - last) / 1000;
  last = now;
  try {
    game.frame(dt);
  } catch (e) {
    if (!solmar.error) solmar.error = String(e && e.message ? e.message : e);
  }
  game.renderer.render(game.scene, game.camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
