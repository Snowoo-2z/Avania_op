// ============================================================
//  AVANIA — Tileset procédural (style "carré"/blocs)
//  Chaque tuile est pré-rendue dans un canvas hors-écran.
//  Les arbres et rochers sont des objets dessinés avec hauteur
//  (triés par profondeur avec le joueur).
// ============================================================

import { TILE } from './config.js';
import { BLOCK_DEFS } from './blocks.js';
import { makeCanvas, mulberry32 } from './utils.js';

const S = TILE;

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// --- Herbe : base verte avec petits brins ---
function drawGrass(ctx, rng) {
  ctx.fillStyle = BLOCK_DEFS.grass.color;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#62993f';
  for (let i = 0; i < 16; i++) {
    ctx.fillRect(rng() * S, rng() * S, 1.5, 3);
  }
  ctx.fillStyle = '#84c25c';
  for (let i = 0; i < 6; i++) {
    ctx.fillRect(rng() * S, rng() * S, 3, 2);
  }
}

// --- Eau : bleu avec vagues ---
function drawWater(ctx, rng) {
  ctx.fillStyle = BLOCK_DEFS.water.color;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#2f76b2';
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.arc(rng() * S, rng() * S, rng() * 3 + 1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) {
    const y = rng() * S;
    ctx.beginPath();
    ctx.moveTo(rng() * S * 0.5, y);
    ctx.quadraticCurveTo(rng() * S * 0.5 + 6, y - 2, rng() * S * 0.5 + 12, y);
    ctx.stroke();
  }
}

// --- Bloc "plein" posé (bois, pierre) : face dessus + côtés ---
function drawBlockTile(ctx, color) {
  const top = shade(color, 1.15);
  const side = shade(color, 0.75);
  const sideDark = shade(color, 0.6);
  // fond
  ctx.fillStyle = side;
  ctx.fillRect(0, 0, S, S);
  // face supérieure
  ctx.fillStyle = top;
  ctx.fillRect(3, 3, S - 6, S - 6);
  // ombre des bords
  ctx.fillStyle = sideDark;
  ctx.fillRect(3, S - 7, S - 6, 4);
  ctx.fillRect(S - 7, 3, 4, S - 6);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(3, 3, S - 6, 3);
  ctx.fillRect(3, 3, 3, S - 6);
  // petits détails (grain)
  ctx.fillStyle = shade(color, 0.9);
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(8 + ((i * 13) % (S - 12)), 8 + ((i * 7) % (S - 12)), 2, 2);
  }
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.min(255, Math.round(r * f));
  g = Math.min(255, Math.round(g * f));
  b = Math.min(255, Math.round(b * f));
  return `rgb(${r},${g},${b})`;
}

const DRAWERS = {
  grass: drawGrass,
  water: drawWater,
  wood:  (c, r) => drawBlockTile(c, BLOCK_DEFS.wood.color),
  stone: (c, r) => drawBlockTile(c, BLOCK_DEFS.stone.color),
};

const cache = {};

export function buildTileset() {
  for (const key of Object.keys(DRAWERS)) {
    const c = makeCanvas(S, S);
    DRAWERS[key](c.getContext('2d'), mulberry32(hashStr(key)));
    cache[key] = c;
  }
  return cache;
}

export function getTileCanvas(key) {
  return cache[key] || cache.grass;
}

// ------------------------------------------------------------
//  Objets (arbres, rochers) — dessinés avec une hauteur,
//  triés par profondeur avec le joueur. Style carré.
// ------------------------------------------------------------

export function drawTreeObject(ctx, x, y) {
  // ombre au sol
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(x - 14, y - 2, 28, 8);
  // tronc (carré)
  ctx.fillStyle = '#6e4426';
  ctx.fillRect(x - 4, y - 14, 8, 16);
  ctx.fillStyle = '#8a5a34';
  ctx.fillRect(x - 4, y - 14, 4, 16);
  // feuillage (cube)
  ctx.fillStyle = '#3e7d2c';
  ctx.fillRect(x - 15, y - 30, 30, 20);
  ctx.fillStyle = '#4f9337';
  ctx.fillRect(x - 11, y - 33, 22, 20);
  ctx.fillStyle = '#63a845';
  ctx.fillRect(x - 6, y - 36, 12, 6);
  // contour feuillage
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x - 15, y - 30, 30, 20);
}

export function drawRockObject(ctx, x, y) {
  // ombre
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(x - 13, y - 2, 26, 8);
  // rocher (cube de pierre)
  ctx.fillStyle = '#7a7a82';
  ctx.fillRect(x - 13, y - 20, 26, 20);
  ctx.fillStyle = '#8d8d94';
  ctx.fillRect(x - 11, y - 24, 22, 18);
  ctx.fillStyle = '#a5a5ac';
  ctx.fillRect(x - 8, y - 27, 16, 6);
  // facettes
  ctx.fillStyle = '#6a6a72';
  ctx.fillRect(x - 13, y - 8, 5, 6);
  ctx.fillRect(x + 8, y - 14, 5, 10);
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x - 13, y - 20, 26, 20);
}
