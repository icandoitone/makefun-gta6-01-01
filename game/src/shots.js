// Screenshot staging: puts the game into a fixed, photogenic state for
// each of the four dossier screenshots, then reports ready. The playtest
// harness takes the actual picture; this file only stages the scene.
//
//  cover   — the player car at a busy junction, traffic and the city
//  foot    — Lucia on foot at the plaza with pedestrians around
//  chase   — a police pursuit at wanted level 2
//  mission — mission 5 in progress at the bank, beacon lit

import { MISSIONS } from './config.js';

export const SHOT_NAMES = ['cover', 'foot', 'chase', 'mission'];

export class ShotStager {
  constructor() {
    this.name = null;
    this.settle = 0;
    this.ready = false;
    this._applied = false;
  }

  start(name) {
    this.name = name;
    this.settle = name === 'chase' ? 2.0 : 2.5; // catch the chase while it is still fast
    this.ready = false;
    this._applied = false;
  }

  // Called every frame while a shot is staged. Applies the setup once,
  // counts down, then flips ready.
  tick(dt, game) {
    if (!this.name || this.ready) return;
    if (!this._applied) {
      this._applied = true;
      this._apply(game);
    }
    this.settle -= dt;
    if (this.settle <= 0) this.ready = true;
  }

  _apply(game) {
    const g = game;
    if (this.name === 'cover') {
      g.placePlayerCar(37, 37, Math.PI / 4);
      g.setWanted(0);
      g.spawnTrafficNear(37, 37, 6);
      g.startMission(0); // live objective + beacon on the minimap
      g.setCameraMode('high');
    } else if (this.name === 'foot') {
      g.placePlayerFoot(-111, -111, Math.PI * 0.75);
      g.setWanted(0);
      g.spawnPedsNear(-111, -111, 10);
      g.startMission(2); // live objective: pick up Rico
      g.setCameraMode('foot');
    } else if (this.name === 'chase') {
      g.placePlayerCar(-37, -37, Math.PI / 2);
      g.playerCar.speed = 24;
      g.setWanted(2);
      g.spawnPoliceNear(-37, -37, 2);
      // One unit ahead-side, closing head-on, and one unit on the tail,
      // so the frame reads as a pursuit from both directions.
      const f = g.playerCar.forward();
      const [p1, p2] = g.wanted.police;
      if (p1) {
        p1.setPos(-37 + f.x * 25 - f.z * 5, -37 + f.z * 25 + f.x * 5, Math.PI / 2 + Math.PI);
        p1.speed = 14;
      }
      if (p2) {
        p2.setPos(-37 - f.x * 25, -37 - f.z * 25, Math.PI / 2);
        p2.speed = 20;
      }
      g.spawnTrafficNear(-37, -37, 4);
      g.startMission(3); // live objective: harbour run
      g.setCameraMode('chase');
    } else if (this.name === 'mission') {
      g.placePlayerCar(-185, -111, 0);
      g.startMission(4); // mission 5, "The Vault Job"
      g.setWanted(1);
      g.setCameraMode('chase');
    }
  }
}

export function shotTitle(name) {
  const m = { cover: 'Solmar Bay — downtown', foot: 'On foot at the plaza', chase: 'Losing the heat', mission: 'The Vault Job' };
  return m[name] || name;
}

export { MISSIONS };
