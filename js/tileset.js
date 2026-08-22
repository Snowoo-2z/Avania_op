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

// --- Bloc posé : cube vu du dessus, STRICTEMENT dans la tuile 32×32.
// Un bois posé doit rester plus petit qu'un arbre : on n'extrude plus
// hors de la case, on suggère juste le volume par le biseau.
function drawBlockTile(ctx, color, texture, opts = {}) {
  const top = shade(color, 1.14);
  const side = shade(color, 0.84);
  const sideDark = shade(color, 0.68);
  const alpha = opts.alpha;
  if (alpha != null) {
    ctx.clearRect(0, 0, S, S);
    ctx.globalAlpha = alpha;
  }

  // Fond / côtés (toute la tuile, pour que les constructions se joignent)
  ctx.fillStyle = side;
  ctx.fillRect(0, 0, S, S);

  // Face supérieure (légèrement inset) = le dessus du cube
  ctx.fillStyle = top;
  ctx.fillRect(2, 2, S - 7, S - 7);

  // Face avant (bande basse, dans la tuile)
  ctx.fillStyle = sideDark;
  ctx.fillRect(2, S - 6, S - 4, 6);
  // Face droite (bande, dans la tuile)
  ctx.fillRect(S - 6, 2, 6, S - 2);

  // Reflet haut-gauche
  ctx.fillStyle = withAlpha('#ffffff', opts.shine ?? 0.26);
  ctx.fillRect(2, 2, S - 8, 2);
  ctx.fillRect(2, 2, 2, S - 8);

  // Texture uniquement sur le dessus
  ctx.save();
  ctx.beginPath();
  ctx.rect(2, 2, S - 8, S - 8);
  ctx.clip();
  texture(ctx, top, sideDark);
  ctx.restore();

  // Contour net pour que les murs restent lisibles
  ctx.strokeStyle = shade(color, 0.48);
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, S - 1, S - 1);

  ctx.globalAlpha = 1;
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

function ironBlockTexture(ctx, top, dark) {
  // Reflets métalliques : fines lignes claires + quelques taches sombres
  ctx.strokeStyle = withAlpha('#ffffff', 0.5);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(7, 9); ctx.lineTo(22, 6);
  ctx.moveTo(8, 15); ctx.lineTo(21, 12);
  ctx.stroke();
  ctx.fillStyle = withAlpha('#8a939b', 0.4);
  ctx.fillRect(18, 18, 4, 3);
  ctx.fillRect(8, 20, 3, 3);
}

// --- Four : pierre grise avec une bouche sombre et des rivets ---
function furnaceTexture(ctx, top, dark) {
  // bouche du foyer
  ctx.fillStyle = '#2a2b2e';
  ctx.fillRect(11, 11, 11, 11);
  ctx.fillStyle = '#1d1e21';
  ctx.fillRect(12, 12, 9, 9);
  // barre du foyer
  ctx.fillStyle = '#3f4146';
  ctx.fillRect(10, 10, 13, 2);
  ctx.fillRect(10, 21, 13, 2);
  ctx.fillStyle = '#4a4c52';
  ctx.fillRect(10, 10, 13, 1);
  // rivets
  ctx.fillStyle = '#4e5056';
  ctx.fillRect(6, 5, 2, 2);
  ctx.fillRect(24, 5, 2, 2);
  ctx.fillRect(6, 24, 2, 2);
  ctx.fillRect(24, 24, 2, 2);
  // reflet
  ctx.fillStyle = withAlpha('#ffffff', 0.14);
  ctx.fillRect(3, 2, S - 8, 1);
}

// --- Laine : boules blanches douces ---
function woolBlockTexture(ctx, top, dark) {
  ctx.fillStyle = withAlpha('#ffffff', 0.5);
  for (let i = 0; i < 7; i++) {
    const x = 4 + ((i * 7) % 22);
    const y = 4 + ((i * 5) % 20);
    ctx.beginPath();
    ctx.arc(x, y, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = withAlpha('#c8c8c8', 0.45);
  for (let i = 0; i < 5; i++) {
    const x = 7 + ((i * 9) % 18);
    const y = 8 + ((i * 7) % 16);
    ctx.beginPath();
    ctx.arc(x, y, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
}

// --- Porte : fermée (vue de face) ou ouverte (à plat sur le sol) ---
function drawDoorClosed(ctx) {
  ctx.fillStyle = shade(BLOCK_DEFS.door.color, 0.9);
  ctx.fillRect(3, 1, S - 6, S - 2);
  ctx.fillStyle = shade(BLOCK_DEFS.door.color, 1.12);
  ctx.fillRect(5, 3, S - 10, S - 6);
  // cadre
  ctx.fillStyle = shade(BLOCK_DEFS.door.color, 0.72);
  ctx.fillRect(3, 1, 3, S - 2);
  ctx.fillRect(S - 6, 1, 3, S - 2);
  // planches verticales
  ctx.strokeStyle = withAlpha('#5a3a1e', 0.45);
  ctx.lineWidth = 1;
  for (let x = 8; x < S - 6; x += 6) {
    ctx.beginPath();
    ctx.moveTo(x, 4);
    ctx.lineTo(x, S - 4);
    ctx.stroke();
  }
  // poignée
  ctx.fillStyle = '#3a3a3e';
  ctx.fillRect(S - 8, S / 2 - 1, 3, 3);
  ctx.fillStyle = withAlpha('#ffffff', 0.3);
  ctx.fillRect(S - 8, S / 2 - 1, 1, 3);
  // contour
  ctx.strokeStyle = shade(BLOCK_DEFS.door.color, 0.5);
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, S - 1, S - 1);
}

function drawDoorOpen(ctx) {
  // Porte ouverte : à plat sur le sol, le long du bord gauche de la tuile
  ctx.fillStyle = shade(BLOCK_DEFS.door.color, 0.95);
  ctx.fillRect(1, 4, S - 8, 10);
  ctx.fillStyle = shade(BLOCK_DEFS.door.color, 1.15);
  ctx.fillRect(2, 5, S - 11, 8);
  ctx.strokeStyle = withAlpha('#5a3a1e', 0.45);
  ctx.lineWidth = 1;
  for (let x = 7; x < S - 10; x += 6) {
    ctx.beginPath();
    ctx.moveTo(x, 5);
    ctx.lineTo(x, 13);
    ctx.stroke();
  }
  // charnières
  ctx.fillStyle = '#3a3a3e';
  ctx.fillRect(3, 6, 3, 2);
  ctx.fillRect(3, 10, 3, 2);
  // ombre portée sous la porte ouverte
  ctx.fillStyle = withAlpha('#000000', 0.12);
  ctx.fillRect(2, 15, S - 9, 2);
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
  glass:     (c) => drawBlockTile(c, BLOCK_DEFS.glass.color, glassTexture, { alpha: 0.78, shine: 0.45 }),
  sandBlock: (c) => drawBlockTile(c, BLOCK_DEFS.sandBlock.color, sandBlockTexture),
  dirtBlock: (c) => drawBlockTile(c, BLOCK_DEFS.dirtBlock.color, dirtBlockTexture),
  ironBlock: (c) => drawBlockTile(c, BLOCK_DEFS.ironBlock.color, ironBlockTexture),
  furnace:   (c) => drawBlockTile(c, BLOCK_DEFS.furnace.color, furnaceTexture),
  woolBlock: (c) => drawBlockTile(c, BLOCK_DEFS.woolBlock.color, woolBlockTexture),
  door:      (c) => drawDoorClosed(c),
  doorOpen:  (c) => drawDoorOpen(c),
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
  // Variante « four allumé » : une lueur orange dans la bouche.
  const lit = makeCanvas(S, S);
  const lctx = lit.getContext('2d');
  lctx.imageSmoothingEnabled = false;
  lctx.drawImage(cache.furnace, 0, 0);
  lctx.fillStyle = '#ff9a3c';
  lctx.fillRect(13, 13, 7, 7);
  lctx.fillStyle = '#ffd28a';
  lctx.fillRect(14, 14, 4, 4);
  lctx.fillStyle = withAlpha('#ff9a3c', 0.28);
  lctx.fillRect(11, 11, 11, 11);
  cache.furnaceLit = lit;
  built = true;
  return cache;
}

// Tuile de four, allumé ou éteint.
export function getFurnaceCanvas(lit) {
  return cache[lit ? 'furnaceLit' : 'furnace'] || cache.furnace;
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

function drawTreeSmallRaw(ctx, x, y, shadow = true) {
  // Ancienne taille « standard » : un vrai petit arbre, pas une pousse.
  if (shadow) softShadow(ctx, x, y + 1, 15, 6);
  voxel(ctx, x - 4, y - 14, 8, 16, '#6e4426');
  ctx.fillStyle = '#8a5a34';
  ctx.fillRect(x - 4, y - 14, 3, 16);
  voxel(ctx, x - 15, y - 31, 30, 21, '#3f7d2c');
  voxel(ctx, x - 11, y - 35, 22, 22, '#4f9337');
  voxel(ctx, x - 6, y - 39, 12, 6, '#63a845');
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(x - 6, y - 39, 12, 3);
}

function drawTreeMediumRaw(ctx, x, y, shadow = true) {
  if (shadow) softShadow(ctx, x, y + 1, 16, 6);
  voxel(ctx, x - 4, y - 16, 8, 18, '#6e4426');
  ctx.fillStyle = '#8a5a34';
  ctx.fillRect(x - 4, y - 16, 3, 18);
  voxel(ctx, x - 16, y - 36, 32, 22, '#3f7d2c');
  voxel(ctx, x - 12, y - 41, 24, 24, '#4f9337');
  voxel(ctx, x - 7, y - 46, 14, 8, '#63a845');
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(x - 7, y - 46, 14, 3);
}

function drawTreeLargeRaw(ctx, x, y, shadow = true) {
  if (shadow) softShadow(ctx, x, y + 2, 22, 8);
  voxel(ctx, x - 6, y - 26, 12, 28, '#5a361c');
  ctx.fillStyle = '#7a4a28';
  ctx.fillRect(x - 6, y - 26, 4, 28);
  ctx.fillStyle = withAlpha('#000000', 0.18);
  ctx.fillRect(x + 3, y - 22, 2, 10);
  voxel(ctx, x - 24, y - 52, 48, 30, '#2f6a24');
  voxel(ctx, x - 19, y - 60, 38, 32, '#3f7d2c');
  voxel(ctx, x - 13, y - 68, 26, 22, '#4f9337');
  voxel(ctx, x - 7, y - 74, 14, 10, '#63a845');
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(x - 7, y - 74, 14, 3);
}

function drawRockObjectRaw(ctx, x, y, shadow = true) {
  if (shadow) softShadow(ctx, x, y + 1, 14, 5);
  voxel(ctx, x - 13, y - 20, 26, 21, '#7a7a82');
  voxel(ctx, x - 11, y - 25, 22, 19, '#8d8d94');
  voxel(ctx, x - 8, y - 29, 16, 6, '#a5a5ac');
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(x - 8, y - 29, 16, 3);
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - 9, y - 12); ctx.lineTo(x - 2, y - 16); ctx.lineTo(x - 5, y - 8);
  ctx.moveTo(x + 4, y - 18); ctx.lineTo(x + 9, y - 12);
  ctx.stroke();
}

// --- Minerai de fer : rocher aux pépites beige-rosé (façon Minecraft) ---
//  Gros pépites taillées avec contour sombre, facette claire et
//  reflet blanc : reconnaissable au premier coup d'œil, contrairement
//  aux anciennes veines de rouille qui se fondaient dans la roche.
function drawIronOreObjectRaw(ctx, x, y, shadow = true) {
  if (shadow) softShadow(ctx, x, y + 1, 14, 5);
  // roche légèrement plus chaude que le rocher ordinaire
  voxel(ctx, x - 12, y - 18, 24, 19, '#82807a');
  voxel(ctx, x - 10, y - 24, 20, 18, '#98968e');
  voxel(ctx, x - 7, y - 27, 14, 5, '#adaba3');
  // pépites de fer brut (la couleur « fer » de Minecraft)
  const NUG = '#d8ae8a', NUG_HI = '#eec9a2', NUG_OUT = '#7a5232', NUG_SH = '#b98a62';
  const nuggets = [
    [x - 8, y - 15, 6, 5], [x + 2, y - 21, 6, 6], [x - 3, y - 25, 4, 4],
    [x + 6, y - 12, 5, 4], [x - 10, y - 8, 4, 4],
  ];
  for (const [nx, ny, nw, nh] of nuggets) {
    ctx.fillStyle = NUG_OUT;
    ctx.fillRect(nx - 1, ny - 1, nw + 2, nh + 2);
    ctx.fillStyle = NUG;
    ctx.fillRect(nx, ny, nw, nh);
    ctx.fillStyle = NUG_HI;
    ctx.fillRect(nx, ny, nw, 1);
    ctx.fillRect(nx, ny, 1, nh);
    ctx.fillStyle = '#fbe8d4'; // reflet taillé
    ctx.fillRect(nx + 1, ny + 1, Math.max(1, nw - 4), 1);
    ctx.fillStyle = NUG_SH;
    ctx.fillRect(nx, ny + nh - 1, nw, 1);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(x - 7, y - 27, 14, 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.16)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - 6, y - 15); ctx.lineTo(x - 1, y - 11); ctx.stroke();
}

function makeObjectSprite(width, height, anchorX, anchorY, draw) {
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  draw(ctx, anchorX, anchorY, true);

  const mask = makeCanvas(width, height);
  const mctx = mask.getContext('2d');
  mctx.imageSmoothingEnabled = false;
  draw(mctx, anchorX, anchorY, false);

  return { canvas, mask, anchorX, anchorY };
}

export const TREE_VARIANTS = ['small', 'medium', 'large'];

// Petits (taille d'avant) partout, moyens rares, grands très rares.
export function treeVariantAt(tx, ty) {
  const h = (Math.imul(tx + 3, 374761393) ^ Math.imul(ty + 7, 668265263)) >>> 0;
  const r = h % 100;
  if (r < 80) return 'small';
  if (r < 95) return 'medium';
  return 'large';
}

export function treeDropCount(variant) {
  if (variant === 'small') return 3;
  if (variant === 'large') return 5;
  return 4;
}

export function treeBreakTime(variant) {
  if (variant === 'large') return 3.4;
  if (variant === 'medium') return 1.45;
  return 0.9;
}

function treeCacheKey(variant) {
  return `tree:${variant || 'small'}`;
}

function buildObjectSprites() {
  objectCache['tree:small'] = makeObjectSprite(44, 52, 22, 42, drawTreeSmallRaw);
  objectCache['tree:medium'] = makeObjectSprite(48, 58, 24, 48, drawTreeMediumRaw);
  objectCache['tree:large'] = makeObjectSprite(72, 88, 36, 76, drawTreeLargeRaw);
  objectCache.tree = objectCache['tree:small'];
  objectCache.rock = makeObjectSprite(40, 40, 20, 32, drawRockObjectRaw);
  objectCache.ironOre = makeObjectSprite(40, 40, 20, 32, drawIronOreObjectRaw);
}

export function getObjectSprite(kind, variant) {
  const key = kind === 'tree' ? treeCacheKey(variant) : kind;
  return objectCache[key] || objectCache[kind] || null;
}

export function getObjectSpriteInfo(kind, variant) {
  const sprite = getObjectSprite(kind, variant);
  if (!sprite) return null;
  return {
    w: sprite.canvas.width,
    h: sprite.canvas.height,
    anchorX: sprite.anchorX,
    anchorY: sprite.anchorY,
  };
}

export function drawTreeObject(ctx, x, y, variant = 'small') {
  const sprite = getObjectSprite('tree', variant);
  if (!sprite) return drawTreeSmallRaw(ctx, x, y);
  ctx.drawImage(sprite.canvas, x - sprite.anchorX, y - sprite.anchorY);
}

export function drawRockObject(ctx, x, y) {
  const sprite = objectCache.rock;
  if (!sprite) return drawRockObjectRaw(ctx, x, y);
  ctx.drawImage(sprite.canvas, x - sprite.anchorX, y - sprite.anchorY);
}

export function drawIronOreObject(ctx, x, y) {
  const sprite = objectCache.ironOre;
  if (!sprite) return drawIronOreObjectRaw(ctx, x, y);
  ctx.drawImage(sprite.canvas, x - sprite.anchorX, y - sprite.anchorY);
}

// Tuile de porte (fermée / ouverte) pré-rendue.
export function getDoorCanvas(open) {
  return cache[open ? 'doorOpen' : 'door'] || cache.door;
}

export function isExtrudedBlock(id) {
  return Boolean(id && BLOCK_DEFS[id] && BLOCK_DEFS[id].kind === 'block');
}

export function drawExtrudedBlock(ctx, id, x, y) {
  const tile = cache[id];
  if (!tile) return;
  ctx.drawImage(tile, x, y);
}
