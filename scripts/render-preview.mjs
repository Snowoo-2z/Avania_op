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
import {
  buildTileset, getTileCanvas, getDoorCanvas, getFurnaceCanvas, getWaterFrame,
  drawTreeObject, drawRockObject, drawIronOreObject,
} from '../js/tileset.js';
import { Mob, drawMob } from '../js/mobs.js';
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
        drawables.push({
          sortY: sy,
          draw: () => {
            if (b === 'tree') drawTreeObject(ctx, sx, sy);
            else if (b === 'rock') drawRockObject(ctx, sx, sy);
            else drawIronOreObject(ctx, sx, sy);
          },
        });
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
    { title: 'Orientations', items: ['down', 'left', 'up', 'right'], draw: (ctx, it, x, y) => drawCharacter(ctx, DEFAULT_APPEARANCE, x, y - 8, { facing: it, scale: 2.2 }) },
    { title: 'Coiffures', items: HAIR_STYLES, draw: (ctx, it, x, y) => drawCharacter(ctx, { ...DEFAULT_APPEARANCE, hairStyle: it.id }, x, y - 8, { facing: 'down', scale: 2.2 }) },
    { title: 'Chapeaux', items: HATS, draw: (ctx, it, x, y) => drawCharacter(ctx, { ...DEFAULT_APPEARANCE, hat: it.id }, x, y - 8, { facing: 'down', scale: 2.2 }) },
    { title: 'Lunettes', items: GLASSES, draw: (ctx, it, x, y) => drawCharacter(ctx, { ...DEFAULT_APPEARANCE, glasses: it.id }, x, y - 8, { facing: 'down', scale: 2.2 }) },
    { title: 'Barbes', items: FACIAL_HAIR, draw: (ctx, it, x, y) => drawCharacter(ctx, { ...DEFAULT_APPEARANCE, facialHair: it.id }, x, y - 8, { facing: 'down', scale: 2.2 }) },
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
      ctx.fillText(typeof it === 'string' ? it : it.label, x, y + 44);
    });
  }

  writeFileSync('preview/personnages.png', canvas.toBuffer('image/png'));
  console.log('✔ preview/personnages.png');
}

// ---------- 3. Planche des blocs ----------
function renderBlocks() {
  buildTileset();
  const keys = ['grass', 'water', 'wood', 'stone', 'plank', 'brick', 'glass', 'sandBlock', 'dirtBlock', 'ironBlock', 'furnace', 'furnaceLit', 'woolBlock', 'door', 'doorOpen'];
  const canvas = createCanvas(keys.length * 44, 48);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0e1712';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  keys.forEach((k, i) => {
    const tile = k === 'door' || k === 'doorOpen' ? getDoorCanvas(k === 'doorOpen')
      : k.startsWith('furnace') ? getFurnaceCanvas(k === 'furnaceLit')
      : getTileCanvas(k);
    ctx.drawImage(tile, i * 44, 0);
  });
  // minerai de fer à côté des blocs
  drawIronOreObject(ctx, keys.length * 44 + 22, 24);
  writeFileSync('preview/blocs.png', canvas.toBuffer('image/png'));
  console.log('✔ preview/blocs.png');
}

// ---------- 4. Mobs (moutons & vaches) ----------
function renderMobs() {
  const canvas = createCanvas(320, 110);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#7cae4e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#6b9c42';
  for (let i = 0; i < 60; i++) ctx.fillRect((i * 37) % 320, (i * 23) % 110, 2, 2);
  const sheep = new Mob('sheep', 60, 60);
  drawMob(ctx, sheep);
  const sheepL = new Mob('sheep', 130, 60);
  sheepL.facing = 'left';
  drawMob(ctx, sheepL);
  drawMob(ctx, new Mob('cow', 220, 60));
  const cowL = new Mob('cow', 285, 60);
  cowL.facing = 'left';
  drawMob(ctx, cowL);
  writeFileSync('preview/mobs.png', canvas.toBuffer('image/png'));
  console.log('✔ preview/mobs.png');
}

renderWorld();
renderCharacter();
renderBlocks();
renderMobs();
console.log('✅ Aperçus générés dans /preview');
