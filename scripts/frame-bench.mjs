// ============================================================
//  AVANIA — Benchmark & captures de frames (hors navigateur)
//  Instancie le vrai Game avec @napi-rs/canvas, fait tourner
//  la boucle update+render et mesure le coût par frame.
//
//  Usage :
//    node scripts/frame-bench.mjs            → mesures
//    node scripts/frame-bench.mjs --shots <dir> → mesures + PNG
// ============================================================

import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

// --- RNG déterministe pour des captures reproductibles ---
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
Math.random = mulberry32(1337);

// --- Stub minimal de l'environnement navigateur ---
globalThis.document = {
  hidden: false,
  createElement(tag) {
    if (tag === 'canvas') return createCanvas(1, 1);
    return { style: {}, getContext: () => null, addEventListener: () => {} };
  },
  getElementById: () => null,
  documentElement: { classList: { add() {}, remove() {}, toggle() {}, contains: () => false } },
};
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
globalThis.innerWidth = 960;
globalThis.innerHeight = 540;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.dispatchEvent = () => true;

const { Game } = await import('../js/game.js');
const { initIcons } = await import('../js/icons.js');
const { TILE } = await import('../js/config.js');

const args = process.argv.slice(2);
const shotsDir = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
if (shotsDir) mkdirSync(shotsDir, { recursive: true });

initIcons();

const canvas = createCanvas(960, 540);
const game = new Game(canvas, {
  name: 'Bench', skin: 'peche', hairStyle: 'court', hairColor: 'brun',
  eyes: 'marron', shirt: 'rouge', pants: 'jean', hat: 'none',
  glasses: 'none', facialHair: 'none',
});

// Accessoire : une pioche en main pour le rendu "held item".
game.inventory.setSlot(game.inventory.hotbarStart, { id: 'stone_pickaxe', count: 1 });
game.inventory.select(0);
// Le reste de la barre est rempli pour un rendu réaliste des drops au sol.
game.inventory.setSlot(game.inventory.hotbarStart + 1, { id: 'wood', count: 37 });
game.inventory.setSlot(game.inventory.hotbarStart + 2, { id: 'plank', count: 12 });
game.inventory.setSlot(game.inventory.hotbarStart + 3, { id: 'iron_sword', count: 1 });

function mem() {
  return `mem ${(process.memoryUsage().rss / 1048576) | 0} MB`;
}

function saveShot(name) {
  if (!shotsDir) return;
  writeFileSync(path.join(shotsDir, name), canvas.toBuffer('image/png'));
  console.log('  📸 ' + name);
}

// Mesure le coût médian update/render sur 2 passes de N frames (le sandbox
// est bruité : la médiane est bien plus stable que la moyenne).
function measure(label, n, perFrame) {
  const totals = [];
  let updSum = 0;
  let rndSum = 0;
  for (let pass = 0; pass < 2; pass++) {
    let upd = 0;
    let rnd = 0;
    for (let i = 0; i < n; i++) {
      perFrame(i);
      const t0 = performance.now();
      game.update(1 / 60);
      const t1 = performance.now();
      game.render();
      const t2 = performance.now();
      upd += t1 - t0;
      rnd += t2 - t1;
    }
    totals.push((upd + rnd) / n);
    updSum += upd;
    rndSum += rnd;
  }
  const median = totals[0];
  console.log(`  ${label.padEnd(30)} update ${(updSum / (2 * n)).toFixed(3)} ms  render ${(rndSum / (2 * n)).toFixed(3)} ms  meilleure passe ${median.toFixed(3)} ms  [${mem()}]`);
  return median;
}

// Quelques frames pour stabiliser les caches (chunks, sprites…).
for (let i = 0; i < 90; i++) { game.update(1 / 60); game.render(); }
saveShot('01-idle.png');

console.log('\n— Scénario 1 : immobile au spawn —');
measure('idle', 100, () => {});

console.log('— Scénario 2 : déplacement diagonal continu —');
measure('marche', 100, () => {
  game.input.keys.add('d');
  game.input.keys.add('s');
});
game.input.keys.clear();
saveShot('02-marche.png');

console.log('— Scénario 3 : minage continu (clic gauche maintenu) —');
// Cherche un bloc minable proche et le vise en permanence.
function aimAtNearestBlock() {
  const zoom = game.camera.zoom;
  const ptx = Math.floor(game.player.x / TILE);
  const pty = Math.floor(game.player.y / TILE);
  for (let r = 1; r <= 3; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const b = game.world.blockAt(ptx + dx, pty + dy);
        if (b === 'tree' || b === 'rock' || b === 'ironOre') {
          game.input.mouse.x = ((ptx + dx + 0.5) * TILE - game.camera.x) * zoom;
          game.input.mouse.y = ((pty + dy + 0.5) * TILE - game.camera.y) * zoom;
          return true;
        }
      }
    }
  }
  return false;
}
game.input.mouse.leftDown = true;
measure('minage', 100, () => {
  if (game.mining.progress === 0) aimAtNearestBlock();
});

// Positionne des fissures visibles pour la capture (sans casser le bloc).
if (aimAtNearestBlock()) {
  game.update(1 / 60);
  game.mining.progress = 0.62;
  game.mining.duration = 1;
  game.render();
  game.render();
}
saveShot('03-minage.png');
game.input.mouse.leftDown = false;
game.resetMining();
game.update(1 / 60);

console.log('— Scénario 4 : beaucoup d\'objets au sol + particules —');
for (let i = 0; i < 150; i++) {
  const a = Math.random() * Math.PI * 2;
  game.spawnDropAt(
    game.player.x + Math.cos(a) * (20 + Math.random() * 150),
    game.player.y + Math.sin(a) * (20 + Math.random() * 110),
    ['wood', 'stone', 'plank', 'stick'][i % 4], 1 + (i % 5),
  );
}
game.spawnBreakParticles(Math.floor(game.player.x / TILE), Math.floor(game.player.y / TILE), 'tree');
measure('drops + particules', 100, () => {});
saveShot('04-drops.png');

console.log('— Scénario 5 : vue bord de monde (eau + plage) —');
game.player.x = 30 * TILE;
game.player.y = 5 * TILE;
game.camera.snapTo(game.player.x, game.player.y);
measure('bord de carte', 100, (i) => {
  // petite oscillation verticale le long de la plage
  game.player.y = (5 + ((i % 200) / 100) * 2) * TILE;
});
// Capture bien calée sur le bord (eau visible en haut de l'écran).
game.player.y = 5 * TILE;
game.camera.snapTo(game.player.x, game.player.y);
game.render();
saveShot('05-bord.png');

// Petit récap des caches.
console.log('\n— Caches —');
console.log('  objets statiques indexés :', game.staticObjects.length);
console.log('  chunks de sol en cache   :', game.floorChunkCache.size);
console.log('\n✅ Terminé');
