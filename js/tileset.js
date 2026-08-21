// ============================================================
//  AVANIA — Tileset procédural (style "voxel" doux)
//  Chaque tuile est pré-rendue dans un canvas hors-écran.
//  L'eau possède plusieurs frames pour une animation douce.
// ============================================================

import { TILE } from './config.js';
import { BLOCK_DEFS } from './blocks.js';
import { makeCanvas, mulberry32 } from './utils.js';

const S = TILE;
export const WATER_FRAMES = 4;

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// --- utilitaires de couleur ---
function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function shade(hex, f) {
  const [r, g, b] = rgb(hex);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}
function withAlpha(hex, a) {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

// --- Herbe : base verte + brins + légère variation ---
function drawGrass(ctx, rng, tint) {
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = withAlpha('#000000', 0.05);
  for (let i = 0; i < 22; i++) {
    const x = rng() * S, y = rng() * S;
    ctx.fillRect(x, y, 1.5, 3);
  }
  // brins clairs
  ctx.fillStyle = withAlpha('#c8e6a0', 0.5);
  for (let i = 0; i < 9; i++) {
    const x = rng() * S, y = rng() * S;
    ctx.fillRect(x, y, 1.5, 3);
  }
  // petits points de lumière
  ctx.fillStyle = withAlpha('#d8f0b0', 0.35);
  for (let i = 0; i < 5; i++) {
    ctx.fillRect(rng() * S, rng() * S, 2, 2);
  }
}

// --- Fleurs : herbe + petites fleurs colorées ---
function drawFlowers(ctx, rng) {
  drawGrass(ctx, rng, BLOCK_DEFS.flowers.color);
  const petals = ['#f2a6a6', '#f2c14e', '#b9a6f2', '#ffffff', '#7ccf8a'];
  for (let i = 0; i < 4; i++) {
    const x = 6 + rng() * (S - 12), y = 6 + rng() * (S - 12);
    const c = petals[Math.floor(rng() * petals.length)];
    ctx.fillStyle = c;
    for (let p = 0; p < 4; p++) {
      const a = (p / 4) * Math.PI * 2 + rng();
      ctx.fillRect(x + Math.cos(a) * 2.5, y + Math.sin(a) * 2.5, 2.5, 2.5);
    }
    ctx.fillStyle = '#f5d24a';
    ctx.fillRect(x - 1, y - 1, 2.5, 2.5);
  }
}

// --- Terre : petites mottes ---
function drawDirt(ctx, rng) {
  ctx.fillStyle = BLOCK_DEFS.dirt.color;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = withAlpha('#6a4f30', 0.5);
  for (let i = 0; i < 14; i++) {
    ctx.fillRect(rng() * S, rng() * S, 3, 2.5);
  }
  ctx.fillStyle = withAlpha('#a8875c', 0.5);
  for (let i = 0; i < 8; i++) {
    ctx.fillRect(rng() * S, rng() * S, 2, 2);
  }
}

// --- Sable : grains ---
function drawSand(ctx, rng) {
  ctx.fillStyle = BLOCK_DEFS.sand.color;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = withAlpha('#c0a25e', 0.5);
  for (let i = 0; i < 12; i++) {
    ctx.fillRect(rng() * S, rng() * S, 2, 1.5);
  }
  ctx.fillStyle = withAlpha('#f4e6b8', 0.5);
  for (let i = 0; i < 6; i++) {
    ctx.fillRect(rng() * S, rng() * S, 2, 1.5);
  }
}

// --- Eau animée : frame selon la phase ---
function drawWater(ctx, rng, phase) {
  ctx.fillStyle = BLOCK_DEFS.water.color;
  ctx.fillRect(0, 0, S, S);
  // profondeur en dégradé doux
  const g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, withAlpha('#2f6f9e', 0.25));
  g.addColorStop(1, withAlpha('#2f6f9e', 0.05));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  // vagues animées
  ctx.strokeStyle = withAlpha('#ffffff', 0.35);
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 3; i++) {
    const y = 6 + i * 9 + phase * 2;
    ctx.beginPath();
    ctx.moveTo(2, y);
    ctx.quadraticCurveTo(10, y - 3, 18, y);
    ctx.quadraticCurveTo(26, y + 3, 30, y);
    ctx.stroke();
  }
  ctx.fillStyle = withAlpha('#8fd0f2', 0.3);
  for (let i = 0; i < 3; i++) {
    const x = 5 + ((i * 11 + phase * 5) % 22);
    ctx.fillRect(x, 8 + i * 8, 4, 1.5);
  }
}

// --- Bloc "plein" (bois, pierre) : face dessus + côtés, aspect voxel ---
function drawBlockTile(ctx, color, texture) {
  const top = shade(color, 1.12);
  const side = shade(color, 0.82);
  const sideDark = shade(color, 0.68);
  // côtés (fond)
  ctx.fillStyle = side;
  ctx.fillRect(0, 0, S, S);
  // face supérieure
  ctx.fillStyle = top;
  ctx.fillRect(3, 3, S - 6, S - 6);
  // ombre basse et droite
  ctx.fillStyle = sideDark;
  ctx.fillRect(3, S - 8, S - 6, 5);
  ctx.fillRect(S - 8, 3, 5, S - 6);
  // reflet haut + gauche
  ctx.fillStyle = withAlpha('#ffffff', 0.28);
  ctx.fillRect(3, 3, S - 6, 3);
  ctx.fillRect(3, 3, 3, S - 6);
  // texture
  texture(ctx, top, sideDark);
}

function woodGrain(ctx, top, dark) {
  ctx.strokeStyle = shade('#b07a3c', 0.8);
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 3; i++) {
    const y = 8 + i * 8;
    ctx.beginPath();
    ctx.moveTo(6, y);
    ctx.lineTo(S - 6, y + (i === 1 ? 1 : -1));
    ctx.stroke();
  }
  // nœuds
  ctx.fillStyle = shade('#8a5a2e', 0.9);
  ctx.beginPath(); ctx.arc(10, 12, 2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(22, 22, 1.5, 0, Math.PI * 2); ctx.fill();
}

function stoneTexture(ctx, top, dark) {
  ctx.strokeStyle = withAlpha('#000000', 0.12);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(6, 14); ctx.lineTo(14, 12); ctx.lineTo(16, 22);
  ctx.moveTo(16, 22); ctx.lineTo(24, 20);
  ctx.stroke();
  ctx.fillStyle = withAlpha('#ffffff', 0.14);
  ctx.fillRect(7, 8, 5, 3);
  ctx.fillStyle = withAlpha('#000000', 0.1);
  ctx.fillRect(18, 18, 4, 3);
}

function plankTexture(ctx, top, dark) {
  ctx.strokeStyle = shade('#8a5a2e', 0.75);
  ctx.lineWidth = 1.1;
  for (let i = 0; i < 2; i++) {
    const y = 9 + i * 7;
    ctx.beginPath();
    ctx.moveTo(6, y); ctx.lineTo(S - 6, y);
    ctx.stroke();
  }
  ctx.fillStyle = shade('#5a3a1e', 0.85);
  for (const [x, y] of [[7, 6], [S - 9, 6], [7, S - 8], [S - 9, S - 8]]) {
    ctx.fillRect(x, y, 2, 2);
  }
}

function brickTexture(ctx, top, dark) {
  ctx.strokeStyle = shade('#7a2f26', 0.7);
  ctx.lineWidth = 1;
  ctx.strokeRect(4, 6, 12, 7);
  ctx.strokeRect(16, 6, 12, 7);
  ctx.strokeRect(10, 14, 12, 7);
  ctx.strokeRect(22, 14, 6, 7);
}

function glassTexture(ctx, top, dark) {
  ctx.strokeStyle = withAlpha('#ffffff', 0.55);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(8, 5); ctx.lineTo(13, 10); ctx.lineTo(8, 15);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(19, 7); ctx.lineTo(24, 12);
  ctx.stroke();
  ctx.fillStyle = withAlpha('#ffffff', 0.35);
  ctx.fillRect(6, 6, 5, 5);
}

function sandBlockTexture(ctx, top, dark) {
  ctx.fillStyle = withAlpha('#c0a25e', 0.5);
  for (let i = 0; i < 10; i++) {
    ctx.fillRect(5 + ((i * 13) % 18), 5 + ((i * 7) % 18), 2, 1.5);
  }
}

function dirtBlockTexture(ctx, top, dark) {
  ctx.fillStyle = withAlpha('#6a4f30', 0.5);
  for (let i = 0; i < 8; i++) {
    ctx.fillRect(5 + ((i * 11) % 18), 5 + ((i * 9) % 18), 3, 2.5);
  }
}

const DRAWERS = {
  grass:     (c, r) => drawGrass(c, r, BLOCK_DEFS.grass.color),
  grassDark: (c, r) => drawGrass(c, r, BLOCK_DEFS.grassDark.color),
  flowers:   (c, r) => drawFlowers(c, r),
  dirt:      (c, r) => drawDirt(c, r),
  sand:      (c, r) => drawSand(c, r),
  wood:      (c) => drawBlockTile(c, BLOCK_DEFS.wood.color, woodGrain),
  stone:     (c) => drawBlockTile(c, BLOCK_DEFS.stone.color, stoneTexture),
  plank:     (c) => drawBlockTile(c, BLOCK_DEFS.plank.color, plankTexture),
  brick:     (c) => drawBlockTile(c, BLOCK_DEFS.brick.color, brickTexture),
  glass:     (c) => drawBlockTile(c, BLOCK_DEFS.glass.color, glassTexture),
  sandBlock: (c) => drawBlockTile(c, BLOCK_DEFS.sandBlock.color, sandBlockTexture),
  dirtBlock: (c) => drawBlockTile(c, BLOCK_DEFS.dirtBlock.color, dirtBlockTexture),
};

const cache = {};
const waterCache = [];
const objectCache = {};
let built = false;

export function buildTileset() {
  if (built) return cache;
  for (const key of Object.keys(DRAWERS)) {
    const c = makeCanvas(S, S);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    DRAWERS[key](ctx, mulberry32(hashStr(key)));
    cache[key] = c;
  }
  // frames d'eau
  for (let f = 0; f < WATER_FRAMES; f++) {
    const c = makeCanvas(S, S);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    drawWater(ctx, mulberry32(hashStr('water' + f)), f);
    waterCache[f] = c;
  }
  buildObjectSprites();
  built = true;
  return cache;
}

export function getTileCanvas(key) {
  return cache[key] || cache.grass;
}

export function getWaterFrame(frame) {
  return waterCache[frame % WATER_FRAMES];
}

// ------------------------------------------------------------
//  Objets (arbres, rochers) — cubiques, avec ombre douce.
// ------------------------------------------------------------

export function softShadow(ctx, cx, cy, w, h) {
  const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, w);
  g.addColorStop(0, 'rgba(0,0,0,0.32)');
  g.addColorStop(0.7, 'rgba(0,0,0,0.18)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy, w, h, 0, 0, Math.PI * 2);
  ctx.fill();
}

function voxel(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = shade(color, 0.72);
  ctx.lineWidth = 1.2;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.fillStyle = withAlpha('#ffffff', 0.22);
  ctx.fillRect(x + 1, y + 1, Math.max(0, w - 2), Math.max(1, h * 0.28));
  ctx.fillStyle = withAlpha('#000000', 0.14);
  ctx.fillRect(x + 1, y + h - 2, Math.max(0, w - 2), Math.min(2, h));
}

function drawTreeObjectRaw(ctx, x, y) {
  softShadow(ctx, x, y + 1, 15, 6);
  // tronc
  voxel(ctx, x - 4, y - 14, 8, 16, '#6e4426');
  ctx.fillStyle = '#8a5a34';
  ctx.fillRect(x - 4, y - 14, 3, 16);
  // feuillage (cube)
  voxel(ctx, x - 15, y - 31, 30, 21, '#3f7d2c');
  voxel(ctx, x - 11, y - 35, 22, 22, '#4f9337');
  voxel(ctx, x - 6, y - 39, 12, 6, '#63a845');
  // reflet sur le dessus du feuillage
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(x - 6, y - 39, 12, 3);
}

function drawRockObjectRaw(ctx, x, y) {
  softShadow(ctx, x, y + 1, 14, 5);
  voxel(ctx, x - 13, y - 20, 26, 21, '#7a7a82');
  voxel(ctx, x - 11, y - 25, 22, 19, '#8d8d94');
  voxel(ctx, x - 8, y - 29, 16, 6, '#a5a5ac');
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(x - 8, y - 29, 16, 3);
  // fissures
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - 9, y - 12); ctx.lineTo(x - 2, y - 16); ctx.lineTo(x - 5, y - 8);
  ctx.moveTo(x + 4, y - 18); ctx.lineTo(x + 9, y - 12);
  ctx.stroke();
}

function makeObjectSprite(width, height, anchorX, anchorY, draw) {
  const c = makeCanvas(width, height);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  draw(ctx, anchorX, anchorY);
  return { canvas: c, anchorX, anchorY };
}

function buildObjectSprites() {
  objectCache.tree = makeObjectSprite(44, 52, 22, 42, drawTreeObjectRaw);
  objectCache.rock = makeObjectSprite(40, 40, 20, 32, drawRockObjectRaw);
}

// Dimensions + ancrage du sprite d'un objet (arbre, rocher). Utile pour
// dessiner les fissures de minage sur TOUT le corps de l'objet.
export function getObjectSpriteInfo(kind) {
  const sprite = objectCache[kind];
  if (!sprite) return null;
  return {
    w: sprite.canvas.width,
    h: sprite.canvas.height,
    anchorX: sprite.anchorX,
    anchorY: sprite.anchorY,
  };
}

export function drawTreeObject(ctx, x, y) {
  const sprite = objectCache.tree;
  if (!sprite) return drawTreeObjectRaw(ctx, x, y);
  ctx.drawImage(sprite.canvas, x - sprite.anchorX, y - sprite.anchorY);
}

export function drawRockObject(ctx, x, y) {
  const sprite = objectCache.rock;
  if (!sprite) return drawRockObjectRaw(ctx, x, y);
  ctx.drawImage(sprite.canvas, x - sprite.anchorX, y - sprite.anchorY);
}
