// ============================================================
//  AVANIA — Aperçu du port et des îles, hors navigateur
//  Rend la zone telle que la verra le joueur : sols, blocs, ouvrages
//  (grues, conteneurs, phare), le ferry et le passeur.
//    npm run preview:port            → preview/port.png (Avania)
//    npm run preview:island          → preview/fortune.png (Fortune City)
//  Sorties dans preview/ (dossier ignoré par Git).
// ============================================================

import { createCanvas, Image } from '@napi-rs/canvas';
import { writeFileSync, mkdirSync } from 'node:fs';

// Les modules du jeu créent leurs canvas via document.createElement et
// chargent le sprite du ferry via `new Image()` : on fournit les deux.
globalThis.Image = Image;
globalThis.document = {
  createElement(tag) {
    if (tag === 'canvas') return createCanvas(1, 1);
    return { style: {}, getContext: () => null, addEventListener: () => {} };
  },
};
globalThis.window = globalThis;

import { World } from '../js/world.js';
import { spawnCityCars } from '../js/city.js';
import { drawCar } from '../js/cars.js';
import {
  buildTileset, getTileCanvas, getWaterFrame, getDoorCanvas, getFurnaceCanvas,
  drawDoorLintel,
  getChestCanvas, drawBlockConnected, drawCaveObject, drawTreeObject,
  drawRockObject, drawIronOreObject, isExtrudedBlock, loadBoatSprite,
  CHEST_TOP_PAD,
} from '../js/tileset.js';
import { BLOCK_DEFS } from '../js/blocks.js';
import { TILE, BLOCK_EXTRUDE } from '../js/config.js';
import { drawSailor } from '../js/npc/sailor.js';
import { getNpcNameTag } from '../js/npc/index.js';
import { ferrySpot, ferrymanWaitsHere } from '../js/ferryman.js';
import { ISLANDS } from '../js/islands.js';

// Fenêtres rendues (tuiles), par vue.
const VIEWS = {
  // Le port d'Avania : bassin, cour, phare, ferry.
  port: { x0: 88, y0: 40, x1: 127, y1: 88, file: 'preview/port.png' },
  // L'île d'arrivée : la côte ouest, avec le mouillage et Gab.
  fortune: { x0: 0, y0: 42, x1: 42, y1: 90, file: 'preview/fortune.png' },
};
const viewName = process.argv[2] || 'port';
const view = VIEWS[viewName];
if (!view) {
  console.error(`Vue inconnue : « ${viewName} » (attendu : ${Object.keys(VIEWS).join(' | ')})`);
  process.exit(1);
}
const { x0: X0, y0: Y0, x1: X1, y1: Y1 } = view;
const W = X1 - X0 + 1;
const H = Y1 - Y0 + 1;

const world = viewName === 'fortune'
  ? new World(ISLANDS.fortune.seed, { id: 'fortune' })
  : new World();
buildTileset();
await loadBoatSprite('assets/boat-ferry.svg');

const canvas = createCanvas(W * TILE, H * TILE);
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
// Tout est dessiné en coordonnées monde (comme dans le jeu, où la caméra
// translate le contexte) : on décale juste de l'origine de la fenêtre.
ctx.translate(-X0 * TILE, -Y0 * TILE);

// 1) les sols
for (let ty = Y0; ty <= Y1; ty++) {
  for (let tx = X0; tx <= X1; tx++) {
    const f = world.floor[world.idx(tx, ty)];
    ctx.drawImage(f === 'water' ? getWaterFrame(0) : getTileCanvas(f), tx * TILE, ty * TILE);
  }
}

// 2) les blocs posés (couche 1 puis couche 2)
for (let layer of [1, 2]) {
  for (let ty = Y0 - 2; ty <= Y1; ty++) {
    for (let tx = X0; tx <= X1; tx++) {
      if (!world.inBounds(tx, ty)) continue;
      const b = world.blockAt(tx, ty, layer);
      if (!b || !BLOCK_DEFS[b]) continue;
      const def = BLOCK_DEFS[b];
      const oy = layer === 2 ? -TILE : 0;
      // NB : coffre, four et porte ont kind === 'block' mais ne se
      // dessinent pas comme un bloc ordinaire (même ordre que js/game.js).
      if (b === 'chest') {
        ctx.drawImage(getChestCanvas(), tx * TILE,
          ty * TILE - BLOCK_EXTRUDE - CHEST_TOP_PAD + oy);
      } else if (b === 'furnace') {
        ctx.drawImage(getFurnaceCanvas(false), tx * TILE, ty * TILE + oy);
      } else if (def.kind === 'door') {
        // Comme dans le jeu : le mur continue au-dessus de l'ouverture.
        drawDoorLintel(ctx, tx, ty, world);
        ctx.drawImage(getDoorCanvas(false), tx * TILE, ty * TILE - BLOCK_EXTRUDE);
      } else if (def.kind === 'block') {
        if (isExtrudedBlock(b)) drawBlockConnected(ctx, b, tx, ty, world, layer);
        else ctx.drawImage(getTileCanvas(b), tx * TILE, ty * TILE + oy);
      }
    }
  }
}

// 3) les objets, triés du nord au sud (même ordre que le jeu)
const drawables = [];
for (let ty = Y0 - 4; ty <= Y1; ty++) {
  for (let tx = X0; tx <= X1; tx++) {
    const obj = world.objectAt(tx, ty);
    if (!obj) continue;
    const sx = tx * TILE + TILE / 2;
    const sy = ty * TILE + TILE / 2;
    drawables.push({
      sortY: sy,
      run() {
        if (obj === 'tree') drawTreeObject(ctx, sx, sy);
        else if (obj === 'rock') drawRockObject(ctx, sx, sy);
        else if (obj === 'ironOre') drawIronOreObject(ctx, sx, sy);
        else drawCaveObject(ctx, obj, sx, sy);
      },
    });
  }
}
// Le passeur : un PNJ, pas un bloc — il n'est donc pas dans la carte.
// On le place où le jeu le met, s'il tient cette rive (js/ferryman.js).
if (ferrymanWaitsHere(world.id)) {
  const spot = ferrySpot(world.id);
  const sx = spot.stand.tx * TILE + TILE / 2;
  const sy = spot.stand.ty * TILE + TILE;
  drawables.push({
    sortY: sy,
    run() {
      drawSailor(ctx, sx, sy, { facing: spot.facing, walkPhase: 0, scale: 1, shadow: true });
      const tag = getNpcNameTag('Gab', 'Le Passeur');
      ctx.drawImage(tag.canvas, sx - tag.w / 2, sy - 34 - tag.h, tag.w, tag.h);
    },
  });
}

// Les voitures : comme le joueur, elles ne sont pas dans la carte.
for (const car of spawnCityCars(world)) {
  drawables.push({ sortY: car.y, run() { drawCar(ctx, car); } });
}

drawables.sort((a, b) => a.sortY - b.sortY);
for (const d of drawables) d.run();

mkdirSync('preview', { recursive: true });
writeFileSync(view.file, canvas.toBuffer('image/png'));
console.log(`✔ ${view.file} (${canvas.width}×${canvas.height}, tuiles ${X0},${Y0} → ${X1},${Y1})`);
