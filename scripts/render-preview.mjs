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
import { buildTileset, getTileCanvas, drawTreeObject, drawRockObject } from '../js/tileset.js';
import { drawCharacter } from '../js/character.js';
import { BLOCK_DEFS } from '../js/blocks.js';
import { TILE, DEFAULT_APPEARANCE, HAIR_STYLES } from '../js/config.js';
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
      ctx.drawImage(getTileCanvas(world.floor[i]), (tx - cx + R) * TILE, (ty - cy + R) * TILE);
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

// ---------- 2. Planche du personnage (4 orientations + coiffures) ----------
function renderCharacter() {
  const canvas = createCanvas(760, 640);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1c2a20';
  ctx.fillRect(0, 0, 760, 640);

  const faces = ['down', 'left', 'up', 'right'];
  faces.forEach((f, i) => drawCharacter(ctx, DEFAULT_APPEARANCE, 100 + i * 140, 180, { facing: f, scale: 2.4 }));
  ctx.fillStyle = '#9fb6a5';
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'center';
  faces.forEach((f, i) => ctx.fillText(f, 100 + i * 140, 210));

  HAIR_STYLES.forEach((h, i) => {
    const x = 60 + (i % 4) * 180;
    const y = 330 + Math.floor(i / 4) * 180;
    drawCharacter(ctx, { ...DEFAULT_APPEARANCE, hairStyle: h.id }, x, y, { facing: 'down', scale: 2.6 });
    ctx.fillStyle = '#9fb6a5';
    ctx.font = '13px sans-serif';
    ctx.fillText(h.label, x, y + 46);
  });

  writeFileSync('preview/personnages.png', canvas.toBuffer('image/png'));
  console.log('✔ preview/personnages.png');
}

// ---------- 3. Planche des blocs ----------
function renderBlocks() {
  buildTileset();
  const keys = ['grass', 'water', 'wood', 'stone'];
  const canvas = createCanvas(4 * 44, 48);
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
