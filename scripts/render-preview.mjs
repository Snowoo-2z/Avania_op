// ============================================================
//  AVANIA — Rendu d'aperçus (hors navigateur) pour vérification
//  Génère des PNG de la map, du personnage et des blocs.
// ============================================================

import { createCanvas } from '@napi-rs/canvas';

globalThis.document = {
  createElement(tag) {
    if (tag === 'canvas') return createCanvas(1, 1);
    return { style: {}, getContext: () => null, addEventListener: () => {} };
  },
};
globalThis.window = globalThis;

import { World } from '../js/world.js';
import { buildTileset, getTileCanvas, getWaterFrame, drawTreeObject, drawRockObject } from '../js/tileset.js';
import { drawCharacter } from '../js/character.js';
import { BLOCK_DEFS } from '../js/blocks.js';
import { TILE, DEFAULT_APPEARANCE, HAIR_STYLES, HATS, GLASSES, FACIAL_HAIR } from '../js/config.js';
import { writeFileSync, mkdirSync } from 'node:fs';

mkdirSync('preview', { recursive: true });

// ---------- 1. Vue du monde (autour du spawn) ----------
function renderWorld() {
  const world = new World();
  buildTileset();
  const R = 24;
  const px = R * TILE * 2;
  const canvas = createCanvas(px, px);
  const ctx = canvas.getContext('2d');

  const cx = Math.floor(world.spawn.x / TILE);
  const cy = Math.floor(world.spawn.y / TILE);

  for (let ty = cy - R; ty <= cy + R; ty++) {
    for (let tx = cx - R; tx <= cx + R; tx++) {
      if (tx < 0 || ty < 0 || tx >= world.w || ty >= world.h) continue;
      const i = world.idx(tx, ty);
      const floor = world.floor[i];
      ctx.drawImage(floor === 'water' ? getWaterFrame(0) : getTileCanvas(floor), (tx - cx + R) * TILE, (ty - cy + R) * TILE);
      const b = world.blocks[i];
      if (b && BLOCK_DEFS[b].kind === 'block') {
        ctx.drawImage(getTileCanvas(b), (tx - cx + R) * TILE, (ty - cy + R) * TILE);
      }
    }
  }

  const drawables = [];
  for (let ty = cy - R; ty <= cy + R; ty++) {
    for (let tx = cx - R; tx <= cx + R; tx++) {
      const b = world.objectAt(tx, ty);
      if (b) {
        const sx = (tx - cx + R) * TILE + TILE / 2;
        const sy = (ty - cy + R) * TILE + TILE / 2;
        drawables.push({ sortY: sy, draw: () => b === 'tree' ? drawTreeObject(ctx, sx, sy) : drawRockObject(ctx, sx, sy) });
      }
    }
  }
  const pxp = R * TILE + TILE / 2;
  drawables.push({ sortY: pxp, draw: () => drawCharacter(ctx, DEFAULT_APPEARANCE, pxp, pxp, { facing: 'down', scale: 1 }) });
  drawables.sort((a, b) => a.sortY - b.sortY);
  for (const d of drawables) d.draw();

  writeFileSync('preview/monde.png', canvas.toBuffer('image/png'));
  console.log('✔ preview/monde.png');
}

// ---------- 2. Planche du personnage (orientations + toutes les options) ----------
function renderCharacter() {
  const COLS = 5;
  const CW = 165, CH = 165;
  const pad = 20;

  const rows = [
    { title: 'Orientations', items: ['down', 'left', 'up', 'right'], draw: (ctx, it, x, y) => drawCharacter(ctx, DEFAULT_APPEARANCE, x, y - 8, { facing: it, scale: 2.5 }) },
    { title: 'Coiffures', items: HAIR_STYLES, draw: (ctx, it, x, y) => drawCharacter(ctx, { ...DEFAULT_APPEARANCE, hairStyle: it.id }, x, y - 8, { facing: 'down', scale: 2.5 }) },
    { title: 'Chapeaux', items: HATS, draw: (ctx, it, x, y) => drawCharacter(ctx, { ...DEFAULT_APPEARANCE, hat: it.id }, x, y - 8, { facing: 'down', scale: 2.5 }) },
    { title: 'Lunettes', items: GLASSES, draw: (ctx, it, x, y) => drawCharacter(ctx, { ...DEFAULT_APPEARANCE, glasses: it.id }, x, y - 8, { facing: 'down', scale: 2.5 }) },
    { title: 'Barbes', items: FACIAL_HAIR, draw: (ctx, it, x, y) => drawCharacter(ctx, { ...DEFAULT_APPEARANCE, facialHair: it.id }, x, y - 8, { facing: 'down', scale: 2.5 }) },
  ];

  let totalH = 0;
  const layout = rows.map((r) => {
    const nRows = Math.ceil(r.items.length / COLS);
    const h = pad + 24 + nRows * CH + pad;
    const seg = { ...r, y0: totalH, h };
    totalH += h;
    return seg;
  });

  const canvas = createCanvas(pad + COLS * CW + pad, totalH);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1c2a20';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (const seg of layout) {
    const ty = seg.y0 + pad;
    ctx.fillStyle = '#9fb6a5';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(seg.title, pad, ty + 12);

    seg.items.forEach((it, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = pad + col * CW + CW / 2;
      const y = ty + 34 + row * CH + CH / 2;
      seg.draw(ctx, it, x, y);
      ctx.fillStyle = '#9fb6a5';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(typeof it === 'string' ? it : it.label, x, y + 52);
    });
  }

  writeFileSync('preview/personnages.png', canvas.toBuffer('image/png'));
  console.log('✔ preview/personnages.png');
}

// ---------- 3. Planche des blocs ----------
function renderBlocks() {
  buildTileset();
  const keys = ['grass', 'water', 'wood', 'stone', 'plank', 'brick', 'glass', 'sandBlock', 'dirtBlock'];
  const canvas = createCanvas(keys.length * 44, 48);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0e1712';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  keys.forEach((k, i) => ctx.drawImage(getTileCanvas(k), i * 44, 0));
  writeFileSync('preview/blocs.png', canvas.toBuffer('image/png'));
  console.log('✔ preview/blocs.png');
}

renderWorld();
renderCharacter();
renderBlocks();
console.log('✅ Aperçus générés dans /preview');
