// ============================================================
//  AVANIA — Tileset procédural
//  Chaque tuile est dessinée une seule fois dans un canvas hors-écran,
//  puis "blittée" pour un rendu très rapide.
// ============================================================

import { TILE, COLORS } from './config.js';
import { makeCanvas, mulberry32, circle } from './utils.js';

// Définition des types de tuiles : { solid, label }
export const TILE_DEFS = {
  grass:    { solid: false, label: 'Herbe' },
  grass2:   { solid: false, label: 'Herbe' },
  path:     { solid: false, label: 'Chemin' },
  road:     { solid: false, label: 'Route' },
  plaza:    { solid: false, label: 'Place' },
  water:    { solid: true,  label: 'Eau' },
  sand:     { solid: false, label: 'Sable' },
  wall:     { solid: true,  label: 'Mur' },
  door:     { solid: false, label: 'Porte' },
  fence:    { solid: true,  label: 'Barrière' },
  rock:     { solid: true,  label: 'Rocher' },
  flower:   { solid: false, label: 'Fleurs' },
  crop:     { solid: false, label: 'Champ' },
  wood:     { solid: false, label: 'Plancher' },
};

const S = TILE;

// --- Dessine de l'herbe avec de petites brins aléatoires ---
function drawGrass(ctx, rng, base, dark, light) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 14; i++) {
    const x = rng() * S, y = rng() * S;
    ctx.fillStyle = rng() > 0.5 ? dark : light;
    ctx.fillRect(x, y, 1.5, 3);
  }
  // quelques taches plus claires
  ctx.fillStyle = light;
  for (let i = 0; i < 5; i++) {
    ctx.fillRect(rng() * S, rng() * S, 3, 2);
  }
}

// --- Dessine un chemin de terre ---
function drawPath(ctx, rng) {
  ctx.fillStyle = COLORS.path;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = COLORS.pathDark;
  for (let i = 0; i < 12; i++) {
    ctx.beginPath();
    ctx.arc(rng() * S, rng() * S, rng() * 2 + 1, 0, Math.PI * 2);
    ctx.fill();
  }
}

// --- Dessine de la route pavée / place ---
function drawRoad(ctx, rng, base, edge) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, S - 1, S - 1);
  ctx.fillStyle = edge;
  // quelques pavés
  for (let i = 0; i < 4; i++) {
    const x = rng() * S, y = rng() * S;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(x, y, 3, 3);
    ctx.globalAlpha = 1;
  }
}

// --- Dessine l'eau avec de petites vagues ---
function drawWater(ctx, rng) {
  ctx.fillStyle = COLORS.water;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = COLORS.waterDeep;
  for (let i = 0; i < 5; i++) {
    const y = rng() * S;
    ctx.beginPath();
    ctx.arc(rng() * S, y, rng() * 3 + 1, 0, Math.PI * 2);
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

// --- Dessine du sable ---
function drawSand(ctx, rng) {
  ctx.fillStyle = COLORS.sand;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = 'rgba(160,130,80,0.4)';
  for (let i = 0; i < 8; i++) {
    ctx.fillRect(rng() * S, rng() * S, 2, 1.5);
  }
}

// --- Dessine un mur de bâtiment ---
function drawWall(ctx) {
  ctx.fillStyle = COLORS.wall;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = COLORS.wallDark;
  ctx.fillRect(0, 0, S, 3);
  ctx.fillRect(0, S - 3, S, 3);
  ctx.fillRect(0, 0, 3, S);
  ctx.fillRect(S - 3, 0, 3, S);
  // texture brique légère
  ctx.strokeStyle = 'rgba(0,0,0,0.06)';
  ctx.lineWidth = 1;
  for (let y = 6; y < S; y += 8) {
    ctx.beginPath(); ctx.moveTo(4, y); ctx.lineTo(S - 4, y); ctx.stroke();
  }
}

// --- Dessine une porte ---
function drawDoor(ctx) {
  drawWall(ctx);
  ctx.fillStyle = COLORS.woodDark;
  ctx.fillRect(S * 0.2, S * 0.15, S * 0.6, S * 0.7);
  ctx.fillStyle = COLORS.wood;
  ctx.fillRect(S * 0.28, S * 0.22, S * 0.44, S * 0.56);
  ctx.fillStyle = '#e0c060';
  ctx.beginPath(); ctx.arc(S * 0.62, S * 0.5, 2, 0, Math.PI * 2); ctx.fill();
}

// --- Dessine une barrière en bois ---
function drawFence(ctx) {
  drawGrass(ctx, mulberry32(7), COLORS.grass, COLORS.grassDark, COLORS.grassLight);
  ctx.fillStyle = COLORS.wood;
  ctx.fillRect(2, 10, S - 4, 4);
  ctx.fillRect(2, 18, S - 4, 4);
  ctx.fillStyle = COLORS.woodDark;
  for (let x = 4; x < S; x += 7) {
    ctx.fillRect(x, 8, 3, 16);
  }
}

// --- Dessine un rocher ---
function drawRock(ctx, rng) {
  drawGrass(ctx, rng, COLORS.grass, COLORS.grassDark, COLORS.grassLight);
  ctx.fillStyle = '#8d8d8d';
  ctx.beginPath();
  ctx.ellipse(S / 2, S / 2 + 3, 10, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#a5a5a5';
  ctx.beginPath();
  ctx.ellipse(S / 2 - 2, S / 2 + 1, 7, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#bdbdbd';
  ctx.beginPath();
  ctx.ellipse(S / 2 - 3, S / 2 - 1, 3, 2, 0, 0, Math.PI * 2);
  ctx.fill();
}

// --- Dessine des fleurs sur herbe ---
function drawFlower(ctx, rng) {
  drawGrass(ctx, rng, COLORS.grass, COLORS.grassDark, COLORS.grassLight);
  const cols = ['#e05a5a', '#e0b03c', '#d07ad0', '#ffffff', '#5aa0e0'];
  for (let i = 0; i < 3; i++) {
    const x = 6 + rng() * (S - 12), y = 6 + rng() * (S - 12);
    const c = cols[Math.floor(rng() * cols.length)];
    ctx.fillStyle = c;
    ctx.beginPath();
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2;
      ctx.arc(x + Math.cos(a) * 2.5, y + Math.sin(a) * 2.5, 2, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.fillStyle = '#f5d24a';
    ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill();
  }
}

// --- Dessine un champ de culture ---
function drawCrop(ctx, rng) {
  ctx.fillStyle = COLORS.pathDark;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = COLORS.path;
  ctx.fillRect(2, 2, S - 4, S - 4);
  ctx.fillStyle = '#7aaf3c';
  for (let x = 6; x < S - 4; x += 8) {
    ctx.fillRect(x, 6, 3, S - 12);
  }
}

// --- Plancher bois ---
function drawWood(ctx) {
  ctx.fillStyle = COLORS.wood;
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = COLORS.woodDark;
  ctx.lineWidth = 1;
  for (let y = 0; y < S; y += 8) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke();
  }
}

const DRAWERS = {
  grass:  (c, r) => drawGrass(c, r, COLORS.grass, COLORS.grassDark, COLORS.grassLight),
  grass2: (c, r) => drawGrass(c, r, COLORS.grassDark, '#4f7d31', COLORS.grassLight),
  path:   drawPath,
  road:   (c, r) => drawRoad(c, r, COLORS.road, COLORS.roadEdge),
  plaza:  (c, r) => drawRoad(c, r, COLORS.plaza, '#8b8b85'),
  water:  drawWater,
  sand:   drawSand,
  wall:   drawWall,
  door:   drawDoor,
  fence:  drawFence,
  rock:   drawRock,
  flower: drawFlower,
  crop:   drawCrop,
  wood:   drawWood,
};

// Pré-rendu de toutes les tuiles
const cache = {};

export function buildTileset() {
  for (const key of Object.keys(TILE_DEFS)) {
    const c = makeCanvas(S, S);
    const ctx = c.getContext('2d');
    DRAWERS[key](ctx, mulberry32(hashStr(key)));
    cache[key] = c;
  }
  return cache;
}

export function getTileCanvas(key) {
  return cache[key] || cache.grass;
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// --- Dessins "décor" dessinés par-dessus le sol (arbres, fontaine...) ---
// Un arbre : tronc + feuillage (utilisé aussi en tuile plein)
export function drawTreeOverlay(ctx, x, y, rng) {
  // ombre
  ctx.fillStyle = 'rgba(20,30,20,0.15)';
  ctx.beginPath(); ctx.ellipse(x, y + 8, 16, 8, 0, 0, Math.PI * 2); ctx.fill();
  // feuillage (derrière)
  ctx.fillStyle = '#3e7d2c';
  circle(ctx, x, y, 15);
  ctx.fill();
  ctx.fillStyle = '#4f9337';
  circle(ctx, x - 5, y - 4, 12);
  ctx.fill();
  circle(ctx, x + 6, y - 3, 11);
  ctx.fill();
  ctx.fillStyle = '#63a845';
  circle(ctx, x - 1, y - 7, 8);
  ctx.fill();
  ctx.fillStyle = '#7fbf5c';
  circle(ctx, x - 3, y - 9, 4);
  ctx.fill();
}

export function drawBushOverlay(ctx, x, y, rng) {
  ctx.fillStyle = 'rgba(20,30,20,0.12)';
  ctx.beginPath(); ctx.ellipse(x, y + 5, 11, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#4f9337';
  circle(ctx, x, y, 9);
  ctx.fill();
  ctx.fillStyle = '#63a845';
  circle(ctx, x - 3, y - 3, 6);
  ctx.fill();
}
