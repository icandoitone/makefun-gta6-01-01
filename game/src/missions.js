// Story missions: a small state machine. Each mission is a list of
// stages; the runner watches the player's position and advances stages,
// pays out on completion, and drives the objective beacon.

import * as THREE from 'three';
import { MISSIONS, totalPayoutUpTo, dist } from './config.js';
import AudioSys from './audio.js';

function makeBeacon() {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.1, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd23d, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 30;
  g.add(beam);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(3.2, 0.35, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd23d }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.35;
  g.add(ring);
  return g;
}

export class MissionRunner {
  constructor(scene, hooks) {
    this.scene = scene;
    this.hooks = hooks; // { toast, onPayout, onMissionComplete, onCampaignComplete, setWanted, onStage }
    this.missionIndex = 0;
    this.stageIndex = 0;
    this.active = false;
    this.holdTimer = 0;
    this.beacon = makeBeacon();
    this.beacon.visible = false;
    scene.add(this.beacon);
    this.passenger = null; // ped riding along (mission 3)
    this._pulse = 0;
  }

  get mission() {
    return MISSIONS[this.missionIndex] || null;
  }

  get stage() {
    const m = this.mission;
    return m ? m.stages[this.stageIndex] || null : null;
  }

  get finished() {
    return this.missionIndex >= MISSIONS.length;
  }

  startMission(i) {
    if (i < 0 || i >= MISSIONS.length) return false;
    this.missionIndex = i;
    this.stageIndex = 0;
    this.active = true;
    this.holdTimer = 0;
    this._applyStageSideEffects();
    this.hooks.toast(`Mission ${MISSIONS[i].id}: ${MISSIONS[i].title} — ${MISSIONS[i].brief}`);
    this.hooks.onStage && this.hooks.onStage(this.mission, this.stage);
    return true;
  }

  _applyStageSideEffects() {
    const s = this.stage;
    if (s && s.wanted) this.hooks.setWanted(s.wanted);
  }

  _moveBeacon() {
    const s = this.stage;
    if (!s || !this.active) { this.beacon.visible = false; return; }
    this.beacon.visible = true;
    const pos = s.type === 'enter' ? null : { x: s.x, z: s.z };
    if (pos) {
      this.beacon.position.set(pos.x, 0, pos.z);
      this._pulse += 0.05;
      const sc = 1 + Math.sin(this._pulse * 2) * 0.12;
      this.beacon.scale.set(sc, 1, sc);
    } else {
      this.beacon.visible = false;
    }
  }

  objectiveText() {
    if (!this.active || !this.stage) return this.finished ? 'Campaign complete!' : 'No active mission — press M to start one.';
    const m = this.mission;
    return `M${m.id} ${m.title}: ${this.stage.text}`;
  }

  // game: { playerPos {x,z}, inCar, car, foot, dt, peds, passengerPed }
  update(dt, game) {
    this._moveBeacon();
    if (!this.active || !this.stage) return;
    const s = this.stage;
    const px = game.playerPos.x;
    const pz = game.playerPos.z;
    let done = false;

    if (s.type === 'enter') {
      done = game.inCar;
    } else if (s.type === 'drive' || s.type === 'escape') {
      done = dist(px, pz, s.x, s.z) <= s.radius;
    } else if (s.type === 'walk' || s.type === 'pickup') {
      done = !game.inCar && dist(px, pz, s.x, s.z) <= s.radius;
    } else if (s.type === 'grab') {
      if (!game.inCar && dist(px, pz, s.x, s.z) <= s.radius) {
        this.holdTimer += dt;
        if (this.holdTimer >= (s.hold || 2)) done = true;
      } else {
        this.holdTimer = 0;
      }
    } else if (s.type === 'wait') {
      this.holdTimer += dt;
      if (this.holdTimer >= (s.hold || 3)) done = true;
    }

    if (done) this._advance(game);
  }

  _advance(game) {
    const m = this.mission;
    const s = this.stage;
    this.holdTimer = 0;
    AudioSys.pickup();
    if (s.type === 'pickup' && game.passengerPed) {
      this.passenger = game.passengerPed;
      game.passengerPed.alive = false;
      game.passengerPed.mesh.visible = false;
      this.hooks.toast('Rico is in the car. Get him to the safehouse.');
    }
    this.stageIndex += 1;
    if (this.stageIndex >= m.stages.length) {
      // Mission complete.
      this.hooks.onPayout(m.payout);
      AudioSys.jingle();
      this.hooks.toast(`Mission complete: ${m.title} — +$${m.payout.toLocaleString()}`);
      this.hooks.onMissionComplete(m, totalPayoutUpTo(this.missionIndex + 1));
      this.missionIndex += 1;
      this.stageIndex = 0;
      this.active = false;
      this.beacon.visible = false;
      if (this.missionIndex >= MISSIONS.length) {
        this.hooks.onCampaignComplete();
      } else {
        // Next mission waits for the player (or the autopilot) to start it.
        this.hooks.toast(`Next: ${MISSIONS[this.missionIndex].title}. Press M to start.`);
      }
      return;
    }
    this._applyStageSideEffects();
    this.hooks.onStage && this.hooks.onStage(m, this.stage);
  }
}
