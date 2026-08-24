// Aperçu des raccords 2.5D : une planche unique pour juger les coins / empilements.
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
import { TILE } from '../js/config.js';
import { buildTileset, drawBlockConnected, getTileCanvas } from '../js/tileset.js';

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
  for (let ty = oy; ty < oy + th; ty++) {
    for (let tx = ox; tx < ox + tw; tx++) {
      ctx.drawImage(getTileCanvas('grass'), (tx - ox) * TILE, (ty - oy) * TILE);
    }
  }
  const drawables = [];
  for (let ty = oy; ty < oy + th; ty++) {
    for (let tx = ox; tx < ox + tw; tx++) {
      const b1 = world.blockAt(tx, ty, 1);
      const b2 = world.blockAt(tx, ty, 2);
      if (b1) drawables.push({ tx, ty, id: b1, layer: 1, sortY: (ty + 1) * TILE });
      if (b2) drawables.push({ tx, ty, id: b2, layer: 2, sortY: (ty + 1) * TILE });
    }
  }
  drawables.sort((a, b) => a.sortY - b.sortY || a.layer - b.layer);
  ctx.save();
  ctx.translate(-ox * TILE, -oy * TILE);
  for (const d of drawables) drawBlockConnected(ctx, d.id, d.tx, d.ty, world, d.layer);
  ctx.restore();
}

const SCALE = 3;
const COLS = 4;
const CELL_W = 11 * TILE;
const CELL_H = 8 * TILE;
const LABEL_H = 18;
const PAD = 14;
const HEADER = 36;

const materials = ['brick', 'plank', 'wood', 'stone'];
const scenes = [
  {
    name: 'isolé · ligne E-O · colonne N-S',
    ox: 8, oy: 8, tw: 11, th: 7,
    place: (id) => [
      [9, 10, id],
      [11, 10, id], [12, 10, id], [13, 10, id],
      [15, 9, id], [15, 10, id], [15, 11, id],
    ],
  },
  {
    name: 'L droite + L gauche',
    ox: 8, oy: 8, tw: 11, th: 7,
    place: (id) => [
      [9, 9, id], [9, 10, id], [9, 11, id], [10, 11, id], [11, 11, id],
      [15, 9, id], [15, 10, id], [15, 11, id], [14, 11, id], [13, 11, id],
    ],
  },
  {
    name: 'T + U',
    ox: 8, oy: 8, tw: 11, th: 7,
    place: (id) => [
      [10, 9, id], [9, 10, id], [10, 10, id], [11, 10, id],
      [14, 9, id], [16, 9, id], [14, 10, id], [15, 10, id], [16, 10, id],
    ],
  },
  {
    name: 'maison + étage nord',
    ox: 8, oy: 8, tw: 11, th: 7,
    place: (id) => {
      const p = [];
      for (let x = 10; x <= 14; x++) { p.push([x, 9, id]); p.push([x, 12, id]); }
      for (let y = 10; y <= 11; y++) { p.push([10, y, id]); p.push([14, y, id]); }
      for (let x = 10; x <= 14; x++) p.push([x, 9, id, 2]);
      p.push([10, 10, id, 2]);
      p.push([14, 10, id, 2]);
      return p;
    },
  },
  {
    name: 'colonne empilée + mur 2 étages',
    ox: 8, oy: 8, tw: 11, th: 7,
    place: (id) => [
      [10, 10, id], [10, 10, id, 2],
      [12, 11, id], [13, 11, id], [14, 11, id],
      [12, 11, id, 2], [13, 11, id, 2], [14, 11, id, 2],
    ],
  },
];

const rows = scenes.length;
const sheetW = PAD * 2 + COLS * CELL_W + (COLS - 1) * PAD;
const sheetH = HEADER + PAD + rows * (CELL_H + LABEL_H + PAD);
const canvas = createCanvas(sheetW * SCALE, sheetH * SCALE);
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
ctx.scale(SCALE, SCALE);
ctx.fillStyle = '#1a241c';
ctx.fillRect(0, 0, sheetW, sheetH);
ctx.fillStyle = '#e8f0e4';
ctx.font = 'bold 14px sans-serif';
ctx.fillText('AVANIA — raccords 2.5D (dessus, coins, empilements)', PAD, 24);
ctx.font = '11px sans-serif';
ctx.fillStyle = '#9ab7a2';
ctx.fillText('brique   ·   planche   ·   bois (disque)   ·   pierre', PAD + 420, 24);

materials.forEach((mat, col) => {
  ctx.fillStyle = '#c8dcc8';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(mat, PAD + col * (CELL_W + PAD) + CELL_W / 2, HEADER - 2);
  ctx.textAlign = 'left';
});

scenes.forEach((scene, row) => {
  materials.forEach((mat, col) => {
    const x = PAD + col * (CELL_W + PAD);
    const y = HEADER + row * (CELL_H + LABEL_H + PAD);
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#5a8a3a';
    ctx.fillRect(0, 0, CELL_W, CELL_H);
    paintScene(ctx, scene.place(mat), scene.ox, scene.oy, scene.tw, scene.th);
    ctx.restore();
    ctx.fillStyle = '#9ab7a2';
    ctx.font = '9px sans-serif';
    ctx.fillText(scene.name, x, y + CELL_H + 12);
  });
});

writeFileSync('preview/walls.png', canvas.toBuffer('image/png'));
console.log('✔ preview/walls.png');
