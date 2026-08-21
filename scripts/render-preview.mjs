// ============================================================
//  AVANIA — Rendu d'aperçus (hors navigateur) pour vérification
//  Génère des PNG de la map, du personnage et du tileset.
//  Usage : node scripts/render-preview.mjs
// ============================================================

import { createCanvas } from '@napi-rs/canvas';

// --- Stub minimal du DOM pour les modules de rendu ---
globalThis.document = {
  createElement(tag) {
    if (tag === 'canvas') return createCanvas(1, 1);
    return { style: {}, getContext: () => null, addEventListener: () => {} };
  },
};
globalThis.window = globalThis;

import { World } from '../js/world.js';
import { buildTileset, getTileCanvas } from '../js/tileset.js';
import { drawDecor } from '../js/decor.js';
import { drawCharacter } from '../js/character.js';
import { TILE, DEFAULT_APPEARANCE, HAIR_STYLES } from '../js/config.js';
import { writeFileSync, mkdirSync } from 'node:fs';

mkdirSync('preview', { recursive: true });

// ---------- 1. Vue du village (autour du spawn) ----------
function renderVillage() {
  const world = new World();
  buildTileset();
  const R = 30; // rayon en tuiles autour du spawn
  const px = R * TILE * 2;
  const canvas = createCanvas(px, px);
  const ctx = canvas.getContext('2d');

  const cx = Math.floor(world.spawn.x / TILE);
  const cy = Math.floor(world.spawn.y / TILE);

  // tuiles de base
  for (let ty = cy - R; ty <= cy + R; ty++) {
    for (let tx = cx - R; tx <= cx + R; tx++) {
      if (tx < 0 || ty < 0 || tx >= world.w || ty >= world.h) continue;
      ctx.drawImage(getTileCanvas(world.grid[world.idx(tx, ty)]), (tx - cx + R) * TILE, (ty - cy + R) * TILE);
    }
  }

  // décor trié
  const drawables = world.drawables
    .filter((d) => d.x >= (cx - R) * TILE && d.x <= (cx + R) * TILE && d.y >= (cy - R) * TILE && d.y <= (cy + R) * TILE)
    .map((d) => ({ sortY: d.sortY, draw: () => drawDecor(ctx, d) }));
  // un personnage témoin au centre
  const px2 = (R) * TILE + TILE / 2;
  drawables.push({
    sortY: px2,
    draw: () => drawCharacter(ctx, DEFAULT_APPEARANCE, px2, px2 + 10, { facing: 'down', scale: 1 }),
  });
  drawables.sort((a, b) => a.sortY - b.sortY);
  for (const d of drawables) d.draw();

  writeFileSync('preview/village.png', canvas.toBuffer('image/png'));
  console.log('✔ preview/village.png');
}

// ---------- 2. Planche du personnage (4 orientations + coiffures) ----------
function renderCharacter() {
  const canvas = createCanvas(760, 640);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1c2a20';
  ctx.fillRect(0, 0, 760, 640);

  const faces = ['down', 'left', 'up', 'right'];
  faces.forEach((f, i) => {
    drawCharacter(ctx, DEFAULT_APPEARANCE, 100 + i * 140, 180, { facing: f, scale: 2.2 });
  });
  ctx.fillStyle = '#9fb6a5';
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'center';
  faces.forEach((f, i) => ctx.fillText(f, 100 + i * 140, 210));

  HAIR_STYLES.forEach((h, i) => {
    const x = 60 + (i % 4) * 180;
    const y = 330 + Math.floor(i / 4) * 180;
    const app = { ...DEFAULT_APPEARANCE, hairStyle: h.id };
    drawCharacter(ctx, app, x, y, { facing: 'down', scale: 2.4 });
    ctx.fillStyle = '#9fb6a5';
    ctx.font = '13px sans-serif';
    ctx.fillText(h.label, x, y + 46);
  });

  writeFileSync('preview/personnages.png', canvas.toBuffer('image/png'));
  console.log('✔ preview/personnages.png');
}

// ---------- 3. Planche du tileset ----------
function renderTileset() {
  buildTileset();
  const keys = ['grass', 'grass2', 'path', 'road', 'plaza', 'water', 'sand', 'wall', 'door', 'fence', 'rock', 'flower', 'crop', 'wood'];
  const canvas = createCanvas(14 * 40, 44);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0e1712';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  keys.forEach((k, i) => {
    ctx.drawImage(getTileCanvas(k), i * 40, 0);
  });
  writeFileSync('preview/tileset.png', canvas.toBuffer('image/png'));
  console.log('✔ preview/tileset.png');
}

renderVillage();
renderCharacter();
renderTileset();
console.log('✅ Aperçus générés dans /preview');
