[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/icandoitone/makefun-gta6-01-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/icandoitone/makefun-gta6-01-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Solmar Bay — an open-world crime game

A complete open-world crime game in the spirit of GTA 6, built with Three.js, running entirely
offline from static files. Explore a sun-soaked 7×7 procedural city on foot and by car, steal
cars, dodge traffic and pedestrians, outrun the police and a helicopter, and finish a six-mission
story campaign — from Marco's first job to the last score at the pier.

## Play

Open `game/index.html` in a desktop browser (serve the `game/` folder with any static server,
for example `python3 -m http.server` inside `game/`). No network request is made; Three.js is
vendored under `game/vendor/`.

| Key | Action |
| --- | --- |
| W A S D | Drive / walk |
| E | Take a car / exit the car |
| F / click | Shoot (on foot) |
| M | Start the next mission |
| Esc / P | Pause |
| Drag mouse | Look around |

## What's in the game

- **A living city** — 7×7 blocks of procedural buildings, roads with lane markings, sidewalks,
  trees, lamps, a plaza, a bank and a pier over the water.
- **Traffic and pedestrians** — cars drive the road grid and brake for jams; pedestrians walk
  the sidewalks and flee from gunfire.
- **Carjacking** — walk up to any slow or parked car and press E to take it.
- **Wanted system** — crimes raise your heat; police cars pursue and ram, a helicopter joins
  at 3 stars, and getting caught means bail. Lay low and the heat decays.
- **Six story missions** — First Wheels, The Package, The Pickup, Harbor Heat, The Vault Job
  and The Last Score, paying $300–$1,000 each ($4,500 for the full campaign).
- **Combat** — hitscan shooting on foot, with ammo, reload, muzzle flash and sparks.
- **HUD** — money, health, ammo, wanted stars, speed, a live minimap and mission objectives.
- **Sound** — fully procedural WebAudio: engine hum, sirens, gunshots, crashes and jingles.
- **Save** — progress is saved to localStorage on every completed mission.

## Structure

- `game/index.html` — page, HUD and import map
- `game/style.css` — HUD and menu styling
- `game/src/config.js` — city grid, economy and the six missions
- `game/src/world.js` — procedural city builder and collision
- `game/src/cars.js` — player car physics, traffic AI, parked cars
- `game/src/people.js` — pedestrians, the player on foot, combat
- `game/src/wanted.js` — wanted level, police pursuit, helicopter
- `game/src/missions.js` — mission state machine and objective beacon
- `game/src/autopilot.js` — the driving/walking autopilot (position-based stuck recovery)
- `game/src/hud.js` — HUD updates and the minimap
- `game/src/effects.js` — particles, muzzle flash, screen shake
- `game/src/audio.js` — procedural WebAudio sounds
- `game/src/save.js` — localStorage save slot
- `game/src/shots.js` — screenshot staging
- `game/src/main.js` — game loop, camera, menus, states
- `game/vendor/three/three.module.min.js` — vendored Three.js
- `main.ts` — entry program: copies `game/` and `screenshots/` and writes `dossier.json`

## License

MIT — see `LICENSE`. All names, characters, places and story are original.
