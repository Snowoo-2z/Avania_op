// Aperçu du coffre posé dans le monde (solo, dans un mur, près d'un joueur)
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
import { buildTileset, drawBlockConnected, getChestCanvas, getTileCanvas } from '../js/tileset.js';

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
      ctx.drawImage(getChestCanvas(), d.tx * S, d.ty * S - BLOCK_EXTRUDE - offset);
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
  { name: 'coffre seul', place: () => [[11, 10, 'chest']] },
  { name: 'coffre dans un mur de briques', place: () => [[10, 9, 'brick'], [11, 9, 'brick'], [12, 9, 'brick'], [10, 10, 'brick'], [11, 10, 'chest'], [12, 10, 'brick'], [10, 11, 'brick'], [11, 11, 'brick'], [12, 11, 'brick']] },
  { name: '2 coffres côte à côte', place: () => [[10, 10, 'chest'], [11, 10, 'chest']] },
  { name: 'coffre sur un bloc (couche 2)', place: () => [[11, 10, 'plank'], [11, 10, 'chest', 2]] },
];

const rows = scenes.length;
const canvas = createCanvas((CELL_W + PAD * 2) * SCALE, (rows * (CELL_H + LABEL_H + PAD) + 8) * SCALE);
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

writeFileSync('preview/chest.png', canvas.toBuffer('image/png'));
console.log('✔ preview/chest.png');
