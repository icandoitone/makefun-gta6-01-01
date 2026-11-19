// Solmar Bay — entry program for the make.fun gta6-01 bounty.
// Copies the game and its screenshots into the output directory and
// writes the dossier the kit library builds from them. Standard library
// only; deterministic, so both grader runs write identical bytes.
//
// Revision 2: validates the inputs before copying (both directories must
// exist, screenshots must hold 3-4 images) and prints a short summary of
// what was written, so a broken entry fails loudly here instead of
// silently producing a bad dossier.

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const REPO = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.MAKEFUN_OUTPUT_DIR || '/output';

const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 48 * 1024 * 1024,
  game_path_max_bytes: 1000,
};

function fail(message) {
  console.error(`main.ts: ${message}`);
  process.exit(1);
}

function countFiles(dir) {
  let n = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) n += countFiles(join(dir, entry.name));
    else if (entry.isFile()) n += 1;
  }
  return n;
}

function main() {
  const gameDir = join(REPO, 'game');
  const shotsDir = join(REPO, 'screenshots');
  if (!existsSync(gameDir)) fail('game/ is missing from the repository');
  if (!existsSync(join(gameDir, 'index.html'))) fail('game/index.html is missing');
  if (!existsSync(shotsDir)) fail('screenshots/ is missing from the repository');
  const shots = readdirSync(shotsDir).filter((f) => !f.startsWith('.'));
  if (shots.length < 3 || shots.length > 4) {
    fail(`screenshots/ holds ${shots.length} images, expected 3 or 4`);
  }

  mkdirSync(OUT, { recursive: true });
  for (const name of ['game', 'screenshots']) {
    const dest = join(OUT, name);
    rmSync(dest, { recursive: true, force: true });
    cpSync(join(REPO, name), dest, { recursive: true });
  }
  const dossier = buildDossier(OUT, CAPS);
  const dossierPath = join(OUT, 'dossier.json');
  writeFileSync(dossierPath, dossier);
  console.log(
    `solmar-bay: ${countFiles(gameDir)} game files, ${shots.length} screenshots, ` +
    `dossier.json ${statSync(dossierPath).size} bytes`,
  );
}

main();
