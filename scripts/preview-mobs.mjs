// ============================================================
//  AVANIA — Planche d'aperçu des mobs (hors navigateur)
//  Mouton & vache × 4 orientations × marche/flash, au zoom du
//  jeu (×2) et en gros plan (×4) pour inspecter le pixel-art.
// ============================================================

import { createCanvas } from '@napi-rs/canvas';

globalThis.document = {
  createElement(tag) {
    if (tag === 'canvas') return createCanvas(1, 1);
    return { style: {}, getContext: () => null, addEventListener: () => {} };
  },
};
globalThis.window = globalThis;

import { Mob, drawMob, MOB_DEFS } from '../js/mobs.js';
import { buildTileset, getTileCanvas, getWaterFrame, drawTreeObject } from '../js/tileset.js';
import { drawCharacter } from '../js/character.js';
import { World } from '../js/world.js';
import { TILE, DEFAULT_APPEARANCE } from '../js/config.js';
import { writeFileSync, mkdirSync } from 'node:fs';

mkdirSync('preview', { recursive: true });

const KINDS = ['sheep', 'cow'];
const FACINGS = ['down', 'left', 'up', 'right'];
// Étapes de marche représentatives : repos, descente, montée.
const STEPS = [
  { label: 'repos', phase: 0, moving: false },
  { label: 'marche A', phase: Math.PI / 2, moving: true },
  { label: 'marche B', phase: -Math.PI / 2, moving: true },
];

const CELL_W = 92;
const CELL_H = 84;
const LABEL_H = 16;
const ZOOM = 2; // zoom caméra du jeu

function makeMob(kind, facing, step, flash) {
  const m = new Mob(kind, 0, 0);
  m.facing = facing;
  m.walkPhase = step.phase;
  m.moving = step.moving;
  m.hitFlash = flash ? 1 : 0;
  return m;
}

function renderSheet() {
  const cols = FACINGS.length * STEPS.length + 1; // + colonne flash
  const rows = KINDS.length;
  const canvas = createCanvas(140 + cols * CELL_W, 40 + rows * (CELL_H + LABEL_H));
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // Fond prairie (deux verts en damier léger, comme en jeu)
  ctx.fillStyle = '#79b150';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(0,0,0,0.05)';
  for (let y = 0; y < canvas.height; y += 8) {
    for (let x = 0; x < canvas.width; x += 8) {
      if (((x + y) / 8) % 2 === 0) ctx.fillRect(x, y, 8, 8);
    }
  }

  ctx.textAlign = 'left';
  ctx.fillStyle = '#20301c';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText('Planche des mobs — zoom ×2 (rendu en jeu)', 12, 22);

  KINDS.forEach((kind, r) => {
    const yBase = 48 + r * (CELL_H + LABEL_H);
    ctx.fillStyle = '#20301c';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(MOB_DEFS[kind].label, 14, yBase + CELL_H / 2);

    let col = 0;
    for (const facing of FACINGS) {
      for (const step of STEPS) {
        const x = 140 + col * CELL_W + CELL_W / 2;
        const y = yBase + CELL_H - 16;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(ZOOM, ZOOM);
        drawMob(ctx, makeMob(kind, facing, step, false));
        ctx.restore();
        ctx.fillStyle = 'rgba(32,48,28,0.75)';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${facing} · ${step.label}`, x, y + 10);
        ctx.textAlign = 'left';
        col++;
      }
    }
    // Dernière colonne : flash de dégât
    const x = 140 + col * CELL_W + CELL_W / 2;
    const y = yBase + CELL_H - 16;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(ZOOM, ZOOM);
    drawMob(ctx, makeMob(kind, 'down', STEPS[0], true));
    ctx.restore();
    ctx.fillStyle = 'rgba(32,48,28,0.75)';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('coup reçu', x, y + 10);
    ctx.textAlign = 'left';
  });

  writeFileSync('preview/mobs-planche.png', canvas.toBuffer('image/png'));
  console.log('✔ preview/mobs-planche.png');
}

// Gros plan ×4 sur les 4 orientations, idéal pour sculpter le pixel-art.
function renderCloseup() {
  const Z = 4;
  const cols = FACINGS.length;
  const rows = KINDS.length;
  const canvas = createCanvas(90 + cols * 150, 30 + rows * 130);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#79b150';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  KINDS.forEach((kind, r) => {
    const yBase = 40 + r * 130;
    ctx.fillStyle = '#20301c';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(MOB_DEFS[kind].label, 10, yBase + 55);
    FACINGS.forEach((facing, c) => {
      const x = 100 + c * 150 + 60;
      const y = yBase + 100;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(Z, Z);
      drawMob(ctx, makeMob(kind, facing, STEPS[0], false));
      ctx.restore();
      ctx.fillStyle = 'rgba(32,48,28,0.8)';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(facing, x, y + 12);
      ctx.textAlign = 'left';
    });
  });

  writeFileSync('preview/mobs-gros-plan.png', canvas.toBuffer('image/png'));
  console.log('✔ preview/mobs-gros-plan.png');
}

// Vraie scène de jeu : le monde généré, quelques animaux posés près
// du joueur, rendus au zoom caméra — le verdict « in-game ».
function renderScene() {
  const world = new World();
  buildTileset();
  const Z = 2;
  const W = 22, H = 12; // tuiles
  const canvas = createCanvas(W * TILE * Z, H * TILE * Z);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const cx = Math.floor(world.spawn.x / TILE) - 8;
  const cy = Math.floor(world.spawn.y / TILE) - 5;

  ctx.save();
  ctx.scale(Z, Z);

    // sol (sans les objets, on place nos propres arbrisseaux)
    for (let ty = 0; ty < H; ty++) {
      for (let tx = 0; tx < W; tx++) {
        const gx = cx + tx, gy = cy + ty;
        const floor = world.inBounds(gx, gy) ? world.floor[world.idx(gx, gy)] : 'water';
        const sprite = floor === 'water' ? getWaterFrame(0) : getTileCanvas(floor);
        ctx.drawImage(sprite, tx * TILE, ty * TILE, TILE, TILE);
      }
    }

    // quelques arbres en toile de fond (positions fixes, zone herbeuse)
    const trees = [[1, 1], [18, 2], [3, 9], [19, 9]];
    for (const [tx, ty] of trees) {
      drawTreeObject(ctx, (tx + 0.5) * TILE, (ty + 0.5) * TILE, 'large');
    }

    // le joueur au centre, entouré d'animaux dans toutes les poses
    const actors = [];
    const put = (kind, tx, ty, facing, phase = 0, moving = false) => {
      const m = new Mob(kind, (tx + 0.5) * TILE, (ty + 0.5) * TILE);
      m.facing = facing;
      m.walkPhase = phase;
      m.moving = moving;
      actors.push(m);
    };
    put('sheep', 4, 3, 'right', Math.PI / 3, true);
    put('cow', 9, 2, 'left', -Math.PI / 3, true);
    put('sheep', 14, 4, 'down');
    put('cow', 17, 6, 'down', Math.PI / 2, true);
    put('sheep', 7, 7, 'left');
    put('cow', 12, 9, 'up', -Math.PI / 2, true);
    put('sheep', 2, 6, 'up');

    actors.push({
      x: 10.5 * TILE, y: 5.5 * TILE, isPlayer: true,
    });
    actors.sort((a, b) => a.y - b.y);
    for (const a of actors) {
      if (a.isPlayer) drawCharacter(ctx, DEFAULT_APPEARANCE, a.x, a.y, { facing: 'down', scale: 1, shadow: true, pixelDensity: Z });
      else drawMob(ctx, a);
    }
    ctx.restore();

  writeFileSync('preview/mobs-scene.png', canvas.toBuffer('image/png'));
  console.log('✔ preview/mobs-scene.png');
}

renderSheet();
renderCloseup();
renderScene();
console.log('✅ Planches de mobs générées dans /preview');
