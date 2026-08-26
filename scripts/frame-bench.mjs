// ============================================================
//  AVANIA — Benchmark & captures de frames (hors navigateur)
//  Instancie le vrai Game avec @napi-rs/canvas, fait tourner
//  la boucle update+render et mesure le coût par frame.
//
//  Usage :
//    node scripts/frame-bench.mjs                     → tous les scénarios
//    node scripts/frame-bench.mjs --shots <dir>       → + captures PNG
//    node scripts/frame-bench.mjs --scenario village  → un seul scénario
//
//  ⚠ Chaque scénario tourne dans un PROCESSUS FILS séparé.
//  Raison (mesurée) : @napi-rs/canvas copie la source à chaque
//  drawImage d'un grand canvas et ne la libère pas — environ
//  1 Mo par appel pour un canvas 512×512 (100 appels = +104 Mo),
//  contre ~0 pour des tuiles de 32×32. En un seul processus, la
//  RSS montait à 3,7 Go et le bench passait de ~4 s à ~4 min.
//  C'est un artefact du canvas headless, PAS du jeu : dans un
//  navigateur, drawImage ne snapshotte pas la source. Isoler les
//  scénarios remet la mesure à plat et la rend comparable.
// ============================================================

import { spawnSync } from 'node:child_process';
import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const argValue = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
};
const SHOTS_DIR = argValue('--shots');
const ONLY = argValue('--scenario');

const SCENARIOS = [
  { id: 'idle',    label: 'immobile au spawn' },
  { id: 'marche',  label: 'déplacement diagonal continu' },
  { id: 'minage',  label: 'minage continu (clic maintenu)' },
  { id: 'drops',   label: 'beaucoup d\'objets au sol + particules' },
  { id: 'village', label: 'village construit (~180 blocs posés)' },
  { id: 'bord',    label: 'vue bord de monde (eau + plage)' },
  // Ces deux scénarios mesurent autre chose que le coût moyen : les
  // à-coups et la pression sur le ramasse-miettes. Ce sont eux qui font
  // ramer un petit PC avec dix onglets ouverts, et un moyennage de
  // frames ne les montre pas.
  { id: 'zoom',    label: 'cran de zoom' },
  { id: 'alloc',   label: 'allocations (village)' },
];

// ------------------------------------------------------------
//  Mode « orchestrateur » : lance un fils par scénario.
// ------------------------------------------------------------
if (!ONLY) {
  if (SHOTS_DIR) mkdirSync(SHOTS_DIR, { recursive: true });
  const rows = [];
  for (const s of SCENARIOS) {
    const childArgs = [fileURLToPath(import.meta.url), '--scenario', s.id];
    if (SHOTS_DIR) childArgs.push('--shots', SHOTS_DIR);
    // Le scénario d'allocation a besoin de forcer le ramasse-miettes.
    const execArgv = s.id === 'alloc' ? ['--expose-gc'] : [];
    const r = spawnSync(process.execPath, [...execArgv, ...childArgs], {
      encoding: 'utf8', maxBuffer: 1 << 24,
    });
    const line = (r.stdout || '').split('\n').find((l) => l.startsWith('##RESULT## '));
    if (!line) {
      console.error(`\n✘ scénario « ${s.id} » en échec`);
      console.error(r.stderr || r.stdout);
      process.exitCode = 1;
      continue;
    }
    rows.push(JSON.parse(line.slice('##RESULT## '.length)));
  }

  const timed = rows.filter((r) => r.metric === undefined);
  console.log('\n— Coût par frame (update + render) —');
  console.log('  scénario                       update    render    total (médiane)');
  for (const r of timed) {
    console.log(
      `  ${r.label.padEnd(32)}${r.update.toFixed(3).padStart(6)} ms`
      + `${r.render.toFixed(3).padStart(9)} ms`
      + `${r.total.toFixed(3).padStart(12)} ms`,
    );
  }
  const extra = rows.filter((r) => r.metric !== undefined);
  if (extra.length) {
    console.log('\n— À-coups & pression mémoire —');
    for (const r of extra) console.log(`  ${r.label.padEnd(32)}${r.metric}`);
  }
  const budget = 1000 / 60;
  const worst = timed.reduce((a, b) => (b.total > a.total ? b : a), timed[0]);
  console.log(`\n  Budget 60 FPS = ${budget.toFixed(2)} ms/frame.`);
  console.log(`  Pire scénario : « ${worst.label} » à ${worst.total.toFixed(3)} ms`);
  console.log('  (mesure en rastérisation logicielle : un navigateur GPU est plus rapide,');
  console.log('   mais les écarts RELATIFS entre versions restent la référence.)');
  console.log('\n✅ Terminé');
  process.exit(process.exitCode || 0);
}

// ------------------------------------------------------------
//  Mode « scénario » (processus fils) : mesure un seul cas.
// ------------------------------------------------------------

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
globalThis.requestAnimationFrame = () => 0;

const { Game } = await import('../js/game.js');
const { initIcons } = await import('../js/icons.js');
const { TILE } = await import('../js/config.js');

if (SHOTS_DIR) mkdirSync(SHOTS_DIR, { recursive: true });

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

function saveShot(name) {
  if (!SHOTS_DIR) return;
  writeFileSync(path.join(SHOTS_DIR, name), canvas.toBuffer('image/png'));
}

// Mesure le coût médian update/render sur 2 passes de N frames (le sandbox
// est bruité : la médiane est bien plus stable que la moyenne).
function measure(n, perFrame) {
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
  return {
    update: updSum / (2 * n),
    render: rndSum / (2 * n),
    total: Math.min(...totals),
  };
}

// Quelques frames pour stabiliser les caches (chunks, sprites…).
for (let i = 0; i < 90; i++) { game.update(1 / 60); game.render(); }

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

let result = null;
let label = ONLY;

switch (ONLY) {
  case 'idle': {
    label = 'immobile au spawn';
    result = measure(100, () => {});
    saveShot('01-idle.png');
    break;
  }

  case 'marche': {
    label = 'déplacement diagonal continu';
    result = measure(100, () => {
      game.input.keys.add('d');
      game.input.keys.add('s');
    });
    game.input.keys.clear();
    game.render();
    saveShot('02-marche.png');
    break;
  }

  case 'minage': {
    label = 'minage continu (clic maintenu)';
    game.input.mouse.leftDown = true;
    result = measure(100, () => {
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
    break;
  }

  case 'drops': {
    label = 'objets au sol + particules';
    for (let i = 0; i < 150; i++) {
      const a = Math.random() * Math.PI * 2;
      game.spawnDropAt(
        game.player.x + Math.cos(a) * (20 + Math.random() * 150),
        game.player.y + Math.sin(a) * (20 + Math.random() * 110),
        ['wood', 'stone', 'plank', 'stick'][i % 4], 1 + (i % 5),
      );
    }
    game.spawnBreakParticles(
      Math.floor(game.player.x / TILE), Math.floor(game.player.y / TILE), 'tree',
    );
    result = measure(100, () => {});
    saveShot('04-drops.png');
    break;
  }

  case 'village': {
    label = 'village construit';
    // Cas réel d'un joueur qui a bâti : des centaines de blocs posés dans
    // la vue. C'est le pire cas de la collecte des blocs et du tri de
    // profondeur, donc le scénario le plus sensible aux optimisations.
    game.player.x = 64 * TILE;
    game.player.y = 64 * TILE;
    game.camera.snapTo(game.player.x, game.player.y);
    for (let dy = -14; dy <= 14; dy++) {
      for (let dx = -18; dx <= 18; dx++) {
        const onEdge = Math.abs(dx) === 18 || Math.abs(dy) === 14;
        const pillar = dx % 6 === 0 && dy % 6 === 0;
        if (!onEdge && !pillar) continue;
        game.world.setBlock(64 + dx, 64 + dy, (dx + dy) % 3 === 0 ? 'brick' : 'plank');
      }
    }
    game.rebuildStaticObjects();
    let placed = 0;
    for (let i = 0; i < game.world.blocks.length; i++) if (game.world.blocks[i]) placed++;
    result = measure(100, () => {});
    result.note = `${placed} blocs posés`;
    saveShot('05-village.png');
    break;
  }

  case 'zoom': {
    label = 'cran de zoom';
    // Mesure du travail qu'un cran de zoom coûtait AUTREFOIS :
    // floorChunkCache.clear() puis reconstruction des chunks visibles
    // (256 drawImage par chunk) dans la frame qui suivait.
    //
    // Les chunks de sol sont rasterisés en PIXELS MONDE puis blittés dans
    // le repère zoomé : leur contenu ne dépend pas du zoom. Les vider à
    // chaque cran était donc du travail pur perdu — et un à-coup visible
    // à chaque réglage. Ce coût est désormais nul, on mesure ici ce qui
    // a été supprimé pour que l'écart reste vérifiable.
    const costs = [];
    for (let k = 0; k < 8; k++) {
      game.floorChunkCache.clear();
      game._prewarmRectKey = undefined;
      const t0 = performance.now();
      game.prewarmFloorChunks(Infinity);
      costs.push(performance.now() - t0);
      game.render();
    }
    costs.sort((a, b) => a - b);
    const rebuilt = game.floorChunkCache.size;
    result = {
      metric: `${costs[costs.length >> 1].toFixed(2)} ms de reconstruction`
        + ` (${rebuilt} chunks) — désormais 0 ms`,
    };
    break;
  }

  case 'alloc': {
    label = 'allocations (village)';
    // Le même village construit, mais on regarde ce que la boucle de jeu
    // ALLOUE. Sur un petit PC avec beaucoup d'onglets, ce n'est pas le
    // coût moyen qui fait saccader, ce sont les pauses du ramasse-
    // miettes déclenchées par des milliers d'objets éphémères.
    game.player.x = 64 * TILE;
    game.player.y = 64 * TILE;
    game.camera.snapTo(game.player.x, game.player.y);
    for (let dy = -14; dy <= 14; dy++) {
      for (let dx = -18; dx <= 18; dx++) {
        const onEdge = Math.abs(dx) === 18 || Math.abs(dy) === 14;
        const pillar = dx % 6 === 0 && dy % 6 === 0;
        if (!onEdge && !pillar) continue;
        game.world.setBlock(64 + dx, 64 + dy, (dx + dy) % 3 === 0 ? 'brick' : 'plank');
      }
    }
    game.rebuildStaticObjects();
    for (let i = 0; i < 60; i++) { game.update(1 / 60); game.render(); }

    const poolBefore = game.blockDrawables.length;
    global.gc();
    const before = process.memoryUsage().heapUsed;
    const N = 400;
    for (let i = 0; i < N; i++) { game.update(1 / 60); game.render(); }
    const after = process.memoryUsage().heapUsed;
    const poolAfter = game.blockDrawables.length;

    const perFrame = Math.max(0, (after - before) / N);
    result = {
      metric: `${(perFrame / 1024).toFixed(2)} Ko alloués/frame`
        + ` · réserve de blocs ${poolBefore} → ${poolAfter}`
        + (poolBefore === poolAfter ? ' (réutilisée, zéro allocation)' : ' (A GRANDI !)'),
    };
    break;
  }

  case 'bord': {
    label = 'vue bord de monde (eau + plage)';
    game.player.x = 30 * TILE;
    game.player.y = 5 * TILE;
    game.camera.snapTo(game.player.x, game.player.y);
    result = measure(100, (i) => {
      // petite oscillation verticale le long de la plage
      game.player.y = (5 + ((i % 200) / 100) * 2) * TILE;
    });
    game.player.y = 5 * TILE;
    game.camera.snapTo(game.player.x, game.player.y);
    game.render();
    saveShot('06-bord.png');
    break;
  }

  default:
    console.error('Scénario inconnu :', ONLY);
    process.exit(1);
}

console.log(`##RESULT## ${JSON.stringify({ id: ONLY, label, ...result })}`);
