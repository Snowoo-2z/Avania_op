// Aperçu du coffre : texture, scènes du monde + strip d'animation du
// couvercle (les 13 frames).
import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync, mkdirSync } from 'node:fs';

globalThis.document = {
  createElement(tag) {
    if (tag === 'canvas') return createCanvas(1, 1);
    return { style: {}, getContext: () => null, addEventListener: () => {} };
  },
};
globalThis.window = globalThis;

import { World } from '../js/world.js';
import { TILE, BLOCK_EXTRUDE } from '../js/config.js';
import {
  buildTileset, drawBlockConnected, getChestFrame, CHEST_OPEN_FRAMES,
  CHEST_TOP_PAD, getTileCanvas,
} from '../js/tileset.js';

mkdirSync('preview', { recursive: true });
buildTileset();

function makeWorld(placements) {
  const w = new World(1);
  w.blocks.fill(null);
  w.blocks2.fill(null);
  for (const [tx, ty, id, layer = 1] of placements) {
    if (layer === 2) w.blocks2[w.idx(tx, ty)] = id;
    else w.setBlock(tx, ty, id);
  }
  return w;
}

function paintScene(ctx, placements, ox, oy, tw, th) {
  const world = makeWorld(placements);
  for (let ty = oy; ty < oy + th; ty++)
    for (let tx = ox; tx < ox + tw; tx++) {
      ctx.drawImage(getTileCanvas('grass'), (tx - ox) * TILE, (ty - oy) * TILE);
    }
  const drawables = [];
  for (let ty = oy; ty < oy + th; ty++)
    for (let tx = ox; tx < ox + tw; tx++) {
      const b1 = world.blockAt(tx, ty, 1);
      const b2 = world.blockAt(tx, ty, 2);
      if (b1) drawables.push({ tx, ty, id: b1, layer: 1, sortY: (ty + 1) * TILE });
      if (b2) drawables.push({ tx, ty, id: b2, layer: 2, sortY: (ty + 1) * TILE });
    }
  drawables.sort((a, b) => a.sortY - b.sortY || a.layer - b.layer);
  ctx.save();
  ctx.translate(-ox * TILE, -oy * TILE);
  for (const d of drawables) {
    if (d.id === 'chest') {
      const offset = (d.layer === 2) ? S : 0;
      ctx.drawImage(getChestFrame(0), d.tx * S, d.ty * S - BLOCK_EXTRUDE - CHEST_TOP_PAD - offset);
    } else {
      drawBlockConnected(ctx, d.id, d.tx, d.ty, world, d.layer);
    }
  }
  ctx.restore();
}

const S = TILE;
const SCALE = 5;
const CELL_W = 9 * TILE, CELL_H = 7 * TILE, LABEL_H = 24, PAD = 12;

const scenes = [
  { name: 'coffre fermé (nouvelle texture)', place: () => [[11, 10, 'chest']] },
  { name: 'coffre dans un mur de briques', place: () => [[10, 9, 'brick'], [11, 9, 'brick'], [12, 9, 'brick'], [10, 10, 'brick'], [11, 10, 'chest'], [12, 10, 'brick'], [10, 11, 'brick'], [11, 11, 'brick'], [12, 11, 'brick']] },
  { name: '2 coffres côte à côte', place: () => [[10, 10, 'chest'], [11, 10, 'chest']] },
  { name: 'coffre sur un bloc (couche 2)', place: () => [[11, 10, 'plank'], [11, 10, 'chest', 2]] },
];

// Sheet 1 : scènes du monde
const rows = scenes.length;
const w1 = (CELL_W + PAD * 2) * SCALE;
const h1 = (rows * (CELL_H + LABEL_H + PAD) + 8) * SCALE;
const canvas = createCanvas(w1, h1);
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
ctx.scale(SCALE, SCALE);
ctx.fillStyle = '#1a241c';
ctx.fillRect(0, 0, CELL_W + PAD * 2, rows * (CELL_H + LABEL_H + PAD) + 8);

scenes.forEach((scene, row) => {
  const y = 6 + row * (CELL_H + LABEL_H + PAD);
  const x = PAD;
  ctx.save();
  ctx.translate(x, y);
  paintScene(ctx, scene.place(), 7, 7, 9, 7);
  ctx.restore();
  ctx.fillStyle = '#e8f0e4';
  ctx.font = 'bold 10px sans-serif';
  ctx.fillText(scene.name, x, y + CELL_H + 15);
});

// Sheet 2 : strip d'animation du couvercle (13 frames sur fond de gazon)
const stripN = CHEST_OPEN_FRAMES;
const stripW = (stripN * S + PAD * 2) * SCALE;
const stripH = (6 * S + 40) * SCALE;
const c2 = createCanvas(stripW, stripH);
const sctx = c2.getContext('2d');
sctx.imageSmoothingEnabled = false;
sctx.scale(SCALE, SCALE);
sctx.fillStyle = '#1a241c';
sctx.fillRect(0, 0, stripN * S + PAD * 2, 6 * S + 40);
const grass = getTileCanvas('grass');
for (let y = 0; y < 6 * S; y += S)
  for (let x = 0; x < stripN * S; x += S)
    sctx.drawImage(grass, PAD + x, 0);
for (let f = 0; f < stripN; f++) {
  // La frame a CHEST_TOP_PAD px de marge en haut : on cale la boîte pour
  // que son sol (bas de tuile) tombe sur la 4e ligne de gazon.
  const groundY = 3 * S; // écran y du sol du coffre
  sctx.drawImage(getChestFrame(f / (stripN - 1)), PAD + f * S, groundY - (S + BLOCK_EXTRUDE) - CHEST_TOP_PAD);
}
sctx.fillStyle = '#e8f0e4';
sctx.font = 'bold 10px sans-serif';
sctx.fillText('Animation d’ouverture du couvercle (13 frames, ~75°)', PAD, 6 * S + 16);
sctx.font = '9px sans-serif';
sctx.fillStyle = '#9ab7a2';
sctx.fillText('fermé', PAD, 6 * S + 30);
sctx.textAlign = 'right';
sctx.fillText('ouvert', PAD + (stripN - 1) * S + S, 6 * S + 30);
sctx.textAlign = 'left';

writeFileSync('preview/chest.png', canvas.toBuffer('image/png'));
writeFileSync('preview/chest-anim.png', c2.toBuffer('image/png'));
console.log('✔ preview/chest.png + preview/chest-anim.png');
