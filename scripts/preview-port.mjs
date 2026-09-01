// ============================================================
//  AVANIA — Aperçu du port (côte est), hors navigateur
//  Rend la zone du port telle que la verra le joueur : sols,
//  blocs, ouvrages (grues, conteneurs, phare) et le ferry.
//  Sortie : preview/port.png (dossier ignoré par Git).
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
import {
  buildTileset, getTileCanvas, getWaterFrame, getDoorCanvas, getFurnaceCanvas,
  getChestCanvas, drawBlockConnected, drawCaveObject, drawTreeObject,
  drawRockObject, drawIronOreObject, isExtrudedBlock, loadBoatSprite,
  CHEST_TOP_PAD,
} from '../js/tileset.js';
import { BLOCK_DEFS } from '../js/blocks.js';
import { TILE, BLOCK_EXTRUDE } from '../js/config.js';
import { drawSailor } from '../js/npc/sailor.js';
import { getNpcNameTag } from '../js/npc/index.js';
import { ferrySpot } from '../js/ferryman.js';

// Fenêtre rendue (tuiles). Assez large pour le bassin et la cour, avec
// de la marge en haut pour le phare (sprite de 100 px).
const X0 = 88, Y0 = 40, X1 = 127, Y1 = 88;
const W = X1 - X0 + 1;
const H = Y1 - Y0 + 1;

const world = new World();
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
// On le place où le jeu le met (voir js/ferryman.js).
{
  const spot = ferrySpot('surface');
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

drawables.sort((a, b) => a.sortY - b.sortY);
for (const d of drawables) d.run();

mkdirSync('preview', { recursive: true });
writeFileSync('preview/port.png', canvas.toBuffer('image/png'));
console.log(`✔ preview/port.png (${canvas.width}×${canvas.height}, tuiles ${X0},${Y0} → ${X1},${Y1})`);
