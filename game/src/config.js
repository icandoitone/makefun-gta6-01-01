// Solmar Bay — shared constants, city grid math and the story missions.
// The city is a 7x7 grid of blocks separated by roads. Roads run along both
// axes at fixed coordinates; junctions are where a vertical and a horizontal
// road cross. All gameplay positions live on this grid.

export const PITCH = 74; // block (60) + road (14)
export const ROAD_W = 14;
export const BLOCK = 60;
export const GRID_N = 7; // blocks per side
export const ROAD_COORDS = [-259, -185, -111, -37, 37, 111, 185, 259];
export const CITY_HALF = 296;

export const COLORS = {
  sky: 0x87bfe8,
  ground: 0x3d4a3a,
  sidewalk: 0x9aa0a3,
  road: 0x2b2e33,
  lane: 0xf5d90a,
  building: [0xc98d6b, 0x7fa8c9, 0xb5a06a, 0x8f9bb0, 0xd9b8a3, 0x6f8f7a, 0xc9c9c9, 0xa8765e],
  glass: 0x2e4a5e,
  tree: 0x2f6b33,
  trunk: 0x6b4a2f,
  playerCar: 0xd7263d,
  policeCar: 0x1c2733,
  heli: 0x22282e,
};

export const ECONOMY = {
  startMoney: 150,
  carjackWanted: 1,
  hitPedWanted: 1,
  shootWanted: 1,
  heatDecaySeconds: 22,
  maxWanted: 5,
};

// --- grid helpers (plain {x, z} math, no three.js dependency) ---------------

export function nearestRoadCoord(v) {
  let best = ROAD_COORDS[0];
  let bd = Math.abs(v - best);
  for (const c of ROAD_COORDS) {
    const d = Math.abs(v - c);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

// Nearest point on the road network to (x, z). Roads are the lines x = rc
// and z = rc for each road coordinate rc.
export function nearestRoadPoint(x, z) {
  const rx = nearestRoadCoord(x);
  const rz = nearestRoadCoord(z);
  const dx = Math.abs(x - rx);
  const dz = Math.abs(z - rz);
  if (dx <= dz) return { x: rx, z };
  return { x, z: rz };
}

export function nearestJunction(x, z) {
  return { x: nearestRoadCoord(x), z: nearestRoadCoord(z) };
}

export function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

export function dist(ax, az, bx, bz) {
  return Math.sqrt(dist2(ax, az, bx, bz));
}

// Is the point (x, z) on a road (within the drivable half-width)?
export function onRoad(x, z, margin = 2) {
  return Math.abs(x - nearestRoadCoord(x)) <= ROAD_W / 2 + margin
    || Math.abs(z - nearestRoadCoord(z)) <= ROAD_W / 2 + margin;
}

// Next junction to drive through when heading from junction `from` toward
// goal point `goal`. Picks the neighbouring junction that gets closest to
// the goal, so the route always heads toward the goal instead of detouring.
export function nextJunctionToward(from, goal) {
  const cands = [];
  for (const [dx, dz] of [[PITCH, 0], [-PITCH, 0], [0, PITCH], [0, -PITCH]]) {
    const nx = from.x + dx;
    const nz = from.z + dz;
    if (nx < ROAD_COORDS[0] || nx > ROAD_COORDS[ROAD_COORDS.length - 1]) continue;
    if (nz < ROAD_COORDS[0] || nz > ROAD_COORDS[ROAD_COORDS.length - 1]) continue;
    cands.push({ x: nx, z: nz, d: dist(nx, nz, goal.x, goal.z) });
  }
  if (cands.length === 0) return null;
  cands.sort((a, b) => a.d - b.d);
  return { x: cands[0].x, z: cands[0].z };
}

// --- story -----------------------------------------------------------------

export const STORY = {
  city: 'Solmar Bay',
  hero: 'Lucia Vega',
  fixer: 'Marco',
  intro: 'Lucia Vega is back in Solmar Bay, broke and wanted. Marco has work — six jobs, one last score.',
};

// A stage is one objective. Types:
//  drive  — reach a road point by car
//  walk   — reach a point on foot (may be off the road grid)
//  enter  — get into a car (any car, or the nearest one)
//  pickup — reach a person on foot, then they ride with you
//  grab   — reach a point on foot and hold still briefly
//  escape — reach a point while wanted; the stage ends on arrival
//  wait   — hold a position for N seconds
export const MISSIONS = [
  {
    id: 1, title: 'First Wheels', payout: 300,
    brief: 'Marco needs wheels. Take any car on the street and bring it to his garage.',
    stages: [
      { type: 'enter', text: 'Take a car (walk up to one and press E)' },
      { type: 'drive', x: 185, z: 37, radius: 10, text: 'Drive to Marco\u2019s garage' },
    ],
  },
  {
    id: 2, title: 'The Package', payout: 700,
    brief: 'A package is waiting at the plaza. Pick it up on foot, then deliver it across town.',
    stages: [
      { type: 'walk', x: -111, z: -111, radius: 6, text: 'Pick up the package at the plaza' },
      { type: 'drive', x: -185, z: 185, radius: 10, text: 'Deliver the package to the south-west corner' },
    ],
  },
  {
    id: 3, title: 'The Pickup', payout: 700,
    brief: 'Rico is waiting by the north-east blocks. Collect him and get him to the safehouse — the cops will be watching.',
    stages: [
      { type: 'pickup', x: 111, z: -185, radius: 6, text: 'Pick up Rico' },
      { type: 'drive', x: -37, z: 111, radius: 10, text: 'Drive Rico to the safehouse', wanted: 2 },
    ],
  },
  {
    id: 4, title: 'Harbor Heat', payout: 800,
    brief: 'A buyer waits at the harbour. Make the drop, then lose the heat — a helicopter is in the air.',
    stages: [
      { type: 'drive', x: 259, z: -259, radius: 10, text: 'Drive to the harbour buyer' },
      { type: 'escape', x: -259, z: 259, radius: 12, text: 'Lose the cops — reach the far corner', wanted: 3 },
    ],
  },
  {
    id: 5, title: 'The Vault Job', payout: 1000,
    brief: 'The bank on the west side. Get inside on foot, grab the cash, and get out to the safehouse.',
    stages: [
      { type: 'drive', x: -185, z: -37, radius: 10, text: 'Drive to the bank' },
      { type: 'grab', x: -222, z: -37, radius: 5, hold: 2.5, text: 'Get inside and grab the cash' },
      { type: 'drive', x: 37, z: 185, radius: 10, text: 'Escape to the safehouse', wanted: 2 },
    ],
  },
  {
    id: 6, title: 'The Last Score', payout: 1000,
    brief: 'One last score at the pier. Drive to the end of the road, walk the pier, take the case — and vanish.',
    stages: [
      { type: 'drive', x: 259, z: 259, radius: 10, text: 'Drive to the pier road' },
      { type: 'walk', x: 285, z: 285, radius: 6, text: 'Walk the pier and take the case' },
      { type: 'escape', x: 185, z: 37, radius: 10, text: 'Get back to Marco\u2019s garage', wanted: 2 },
    ],
  },
];

export function totalPayoutUpTo(n) {
  let t = 0;
  for (let i = 0; i < n && i < MISSIONS.length; i++) t += MISSIONS[i].payout;
  return t;
}
