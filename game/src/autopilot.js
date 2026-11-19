// Autopilot: drives the car and walks the player to mission targets so
// the game can be verified end to end, and so the player can ask for a
// lift. The design that proved itself:
//
//  - Stuck is detected from POSITION, not speed: if the car has barely
//    moved over several seconds while throttle was applied, it is stuck.
//    A car pressed against a wall has its speed killed by the impact,
//    so speed alone lies.
//  - Recovery: reverse and turn, then drive forward. After three failed
//    recoveries, reposition the car to the nearest road centre.
//  - If the route runs out but the target is still ahead, drive and
//    steer directly toward the target instead of standing still.
//  - On foot there is no "target moved away" abort: the walker just
//    keeps following.
//  - Route choice always heads toward the goal: pick the junction that
//    gets closest to it, never a detour.
//  - A target that is on foot outside the road grid is never driven to:
//    park at the nearest road point, get out, and walk.

import { nearestRoadPoint, nearestJunction, nextJunctionToward, onRoad, dist } from './config.js';

export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// Pure helper (unit-tested): which point should the car steer at right
// now, given where it is and where it wants to go?
export function chooseWaypoint(carPos, goal) {
  const d = dist(carPos.x, carPos.z, goal.x, goal.z);
  const aligned = Math.abs(carPos.x - goal.x) < 8 || Math.abs(carPos.z - goal.z) < 8;
  if (d <= 12 || aligned) return { x: goal.x, z: goal.z, direct: true };
  const j = nearestJunction(carPos.x, carPos.z);
  const next = nextJunctionToward(j, goal);
  if (!next) return { x: goal.x, z: goal.z, direct: true }; // route ran out: drive at it
  return { x: next.x, z: next.z, direct: false };
}

// Pure helper (unit-tested): stuck means the car barely moved over the
// sampled window while throttle was applied.
export function detectStuck(samples, minMove = 1.5) {
  if (samples.length < 2) return false;
  const first = samples[0];
  const last = samples[samples.length - 1];
  return dist(first.x, first.z, last.x, last.z) < minMove;
}

export class Autopilot {
  constructor() {
    this.active = false;
    this.mode = 'drive'; // 'drive' | 'walk'
    this.target = null; // {x, z, radius}
    this._samples = [];
    this._sampleTimer = 0;
    this._recover = null; // {phase, timer}
    this._recoverFails = 0;
    this._blockTimer = 0;
    this._walkBlockTimer = 0;
    this._walkSidestep = 0;
    this._walkSide = 1;
    this._lastPos = null;
    this._walkSamples = [];
  }

  start(target, mode = 'drive') {
    this.active = true;
    this.mode = mode;
    this.target = target;
    this._samples = [];
    this._recover = null;
    this._recoverFails = 0;
    this._blockTimer = 0;
    this._walkSamples = [];
    this._walkBlockTimer = 0;
  }

  stop() {
    this.active = false;
    this._recover = null;
  }

  get arrived() {
    if (!this.target) return true;
    return false;
  }

  // One driving tick. Returns { throttle, steer, arrived, repositioned }.
  driveTick(dt, car, others) {
    const t = this.target;
    const dGoal = dist(car.x, car.z, t.x, t.z);
    if (dGoal <= t.radius) return { throttle: 0, steer: 0, arrived: true };

    // --- stuck detection from position samples -------------------------
    this._sampleTimer += dt;
    if (this._sampleTimer >= 0.5) {
      this._sampleTimer = 0;
      this._samples.push({ x: car.x, z: car.z });
      if (this._samples.length > 8) this._samples.shift(); // 4 second window
    }

    // --- recovery manoeuvre ---------------------------------------------
    if (this._recover) {
      const r = this._recover;
      r.timer -= dt;
      if (r.timer <= 0) {
        if (r.phase === 'reverse') {
          r.phase = 'forward';
          r.timer = 1.0;
        } else {
          this._recover = null;
          this._samples = [];
        }
      }
      if (r.phase === 'reverse') return { throttle: -0.85, steer: r.steer, arrived: false };
      return { throttle: 0.85, steer: -r.steer, arrived: false };
    }

    if (this._samples.length >= 8 && detectStuck(this._samples)) {
      this._recoverFails += 1;
      if (this._recoverFails > 3) {
        // Give up on this spot: reposition to the nearest road centre.
        const rp = nearestRoadPoint(car.x, car.z);
        car.x = rp.x;
        car.z = rp.z;
        const snap = Math.round(car.heading / (Math.PI / 2)) * (Math.PI / 2);
        car.heading = snap;
        car.speed = 0;
        this._recoverFails = 0;
        this._samples = [];
        return { throttle: 0, steer: 0, arrived: false, repositioned: true };
      }
      this._recover = { phase: 'reverse', timer: 1.2, steer: 0.9 };
      this._samples = [];
      return { throttle: -0.85, steer: 0.9, arrived: false };
    }

    // --- normal driving ---------------------------------------------------
    const wp = chooseWaypoint({ x: car.x, z: car.z }, t);
    const want = Math.atan2(wp.x - car.x, wp.z - car.z);
    const dh = angleDiff(want, car.heading);
    const steer = clamp(dh * 2.2, -1, 1);
    let throttle = Math.abs(dh) > 1.0 ? 0.35 : 1;
    if (wp.direct && dGoal < 40) throttle = Math.min(throttle, 0.5);
    if (wp.direct && dGoal < 25) throttle = Math.min(throttle, 0.4);
    // Brake to a stop at the target instead of overshooting into a wall.
    if (dGoal < 12 && Math.abs(car.speed) > 6) throttle = -0.8;

    // Traffic ahead: brake, but never longer than 3 seconds.
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    let blocked = false;
    for (const o of others) {
      if (!o.alive || o === car) continue;
      const ox = o.x - car.x;
      const oz = o.z - car.z;
      const along = ox * fx + oz * fz;
      const side = Math.abs(ox * fz - oz * fx);
      if (along > 0 && along < 11 && side < 3.2) { blocked = true; break; }
    }
    if (blocked) {
      this._blockTimer += dt;
      if (this._blockTimer <= 3) throttle = -0.5;
    } else {
      this._blockTimer = 0;
    }
    return { throttle, steer, arrived: false };
  }

  // One walking tick. Returns { moveX, moveZ, arrived }.
  // There is deliberately no "target moved away" abort: the walker keeps
  // following whatever the current target is.
  walkTick(dt, foot) {
    const t = this.target;
    const dGoal = dist(foot.x, foot.z, t.x, t.z);
    if (dGoal <= t.radius) return { moveX: 0, moveZ: 0, arrived: true };

    // Blocked while walking: sidestep around the obstacle.
    this._walkBlockTimer += dt;
    if (this._walkBlockTimer >= 0.5) {
      this._walkBlockTimer = 0;
      this._walkSamples.push({ x: foot.x, z: foot.z });
      if (this._walkSamples.length > 6) this._walkSamples.shift(); // 3 second window
    }
    if (this._walkSamples.length >= 6 && detectStuck(this._walkSamples, 0.8)) {
      this._walkSidestep = 1.0;
      this._walkSide *= -1;
      this._walkSamples = [];
    }
    if (this._walkSidestep > 0) {
      this._walkSidestep -= dt;
      return { moveX: this._walkSide, moveZ: 0.4, arrived: false };
    }

    const want = Math.atan2(t.x - foot.x, t.z - foot.z);
    const dh = angleDiff(want, foot.heading);
    // Walk camera-relative: forward is the heading the walker faces.
    const moveZ = 1;
    const moveX = clamp(dh * 1.5, -1, 1);
    return { moveX, moveZ, arrived: false };
  }

  // Where should a car park so its driver can walk to an off-road target?
  static parkPointFor(target) {
    if (onRoad(target.x, target.z, 0)) return { x: target.x, z: target.z };
    return nearestRoadPoint(target.x, target.z);
  }
}
