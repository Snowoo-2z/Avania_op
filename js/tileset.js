// ============================================================
//  AVANIA — Tileset procédural (style "voxel" doux)
//  Chaque tuile est pré-rendue dans un canvas hors-écran.
//  L'eau possède plusieurs frames pour une animation douce.
// ============================================================

import { TILE, BLOCK_EXTRUDE, BLOCK_SIDE } from './config.js';
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

// Géométrie 2.5D partagée : cube 32×40 (32 de grille + 8 d'extrusion).
// Toutes les faces se rencontrent sur des pixels entiers — aucun trou,
// aucun chevauchement d'1 px entre dessus / avant / droite.
const TOP_INSET_L = 2;       // biseau gauche (pas de face ouest : lumière NE)
const TOP_INSET_T = 2;       // biseau haut du dessus, cube isolé
const RIGHT_FACE_W = 6;      // face est visible (S - 6 = 26)
const FRONT_Y = S - 6;       // 26 : jonction dessus ↔ face avant
const BLOCK_H = S + BLOCK_EXTRUDE; // 40

// --- Bloc posé : cube vu du dessus, avec extrusion 3D pour la profondeur.
// Un bois posé doit avoir du volume et de la hauteur pour former de beaux
// murs de maison 3D qui s'empilent bien.
function drawBlockTile(ctx, color, texture, opts = {}) {
  if (opts.alpha != null) ctx.clearRect(0, 0, S, BLOCK_H);
  drawBlockTileConnected(ctx, 0, 0, color, texture, ISOLATED_FACES, opts);
}

function woodGrain(ctx, face) {
  const barkDark = '#563018';
  const barkMid = '#7a4723';
  const barkLight = '#b97638';

  if (face === 'top') {
    // Une vraie coupe de tronc : bord d'écorce irrégulier, cœur clair et
    // cernes organiques. L'ancien empilement de carrés ressemblait à une
    // cible ; ces contours pixelisés cassent volontairement la symétrie.
    ctx.fillStyle = barkDark;
    ctx.fillRect(4, 5, 21, 19);
    ctx.fillRect(5, 4, 19, 21);
    ctx.fillStyle = '#d6a158';
    ctx.fillRect(6, 7, 17, 15);
    ctx.fillRect(7, 6, 15, 17);
    ctx.fillStyle = withAlpha('#f0c77d', 0.34);
    ctx.fillRect(8, 7, 10, 2);
    ctx.fillRect(7, 9, 2, 8);

    ctx.strokeStyle = '#97602d';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(8, 10); ctx.lineTo(11, 8); ctx.lineTo(18, 8);
    ctx.lineTo(22, 11); ctx.lineTo(21, 18); ctx.lineTo(17, 21);
    ctx.lineTo(11, 20); ctx.lineTo(8, 17); ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(11, 12); ctx.lineTo(14, 10); ctx.lineTo(18, 11);
    ctx.lineTo(20, 14); ctx.lineTo(18, 18); ctx.lineTo(14, 19);
    ctx.lineTo(11, 16); ctx.closePath();
    ctx.stroke();

    // Cœur et fentes radiales du bois sec.
    ctx.fillStyle = '#70401e';
    ctx.fillRect(14, 13, 3, 3);
    ctx.fillRect(17, 15, 4, 1);
    ctx.fillRect(11, 16, 3, 1);
    ctx.fillRect(15, 9, 1, 4);
    ctx.fillStyle = '#efc77c';
    ctx.fillRect(10, 10, 4, 1);
    ctx.fillRect(9, 12, 1, 4);
    return;
  }

  // Écorce en plaques verticales irrégulières sur les chants du bloc.
  // On répète le motif avec des offsets verticaux (0, 16, 32) pour couvrir
  // tout l'espace d'un mur en hauteur sans laisser de vide plat.
  ctx.fillStyle = withAlpha(barkDark, 0.7);
  const plaques = [
    [3, 3, 3, 9], [3, 15, 3, 12], [9, 7, 3, 14], [15, 2, 3, 11],
    [15, 16, 3, 13], [21, 6, 3, 18], [27, 3, 3, 8], [27, 14, 3, 14],
  ];
  for (const [x, y, w, h] of plaques) {
    for (let offset of [0, 16, 32]) {
      ctx.fillRect(x, y + offset, w, h);
    }
  }
  ctx.fillStyle = withAlpha(barkLight, 0.46);
  const lines = [[6, 5, 7], [12, 15, 8], [19, 4, 10], [25, 17, 8], [30, 7, 6]];
  for (const [x, y, h] of lines) {
    for (let offset of [0, 16, 32]) {
      ctx.fillRect(x, y + offset, 1, h);
    }
  }
  ctx.fillStyle = withAlpha('#321b0f', 0.48);
  for (let offset of [0, 16, 32]) {
    ctx.fillRect(27, 11 + offset, 4, 2);
    ctx.fillRect(7, 27 + offset, 5, 2);
    ctx.fillRect(18, 28 + offset, 4, 1);
  }
}

function stoneTexture(ctx, face) {
  // ---------------------------------------------------------------
  //  Cobblestone façon Minecraft : pavés irréguliers gris, joints
  //  sombres, reflets clairs en haut de chaque pavé. Reconnaissable
  //  instantanément comme la « cobblestone » du jeu.
  // ---------------------------------------------------------------
  const jointCol  = withAlpha('#32363a', 0.72);
  const lightHi   = withAlpha('#d0d1ce', 0.52);
  const darkCrack = withAlpha('#26292c', 0.58);

  // Pavés irréguliers : chaque rect est un { x, y, w, h, shade }.
  // Les teintes alternent pour casser la monotonie (clair / moyen / sombre).
  const pavesTop = [
    // rangée haute
    { x: 2,  y: 2,  w: 7,  h: 5,  c: '#8a8b90' },
    { x: 10, y: 2,  w: 6,  h: 6,  c: '#7e7f84' },
    { x: 17, y: 2,  w: 8,  h: 5,  c: '#929396' },
    // rangée milieu-haute
    { x: 2,  y: 8,  w: 5,  h: 6,  c: '#757679' },
    { x: 8,  y: 9,  w: 8,  h: 5,  c: '#999a9e' },
    { x: 17, y: 8,  w: 6,  h: 6,  c: '#838488' },
    // rangée milieu-basse
    { x: 2,  y: 15, w: 8,  h: 5,  c: '#8d8e92' },
    { x: 11, y: 15, w: 5,  h: 6,  c: '#76777b' },
    { x: 17, y: 15, w: 7,  h: 5,  c: '#9c9da0' },
    // rangée basse
    { x: 2,  y: 21, w: 6,  h: 4,  c: '#84858a' },
    { x: 9,  y: 22, w: 7,  h: 4,  c: '#7a7b7f' },
    { x: 17, y: 21, w: 8,  h: 5,  c: '#8f9094' },
    // rangée de raccord N-S : complète le dessus jusqu'au bord de tuile
    // (y = 32) pour que deux dessus voisins fusionnent sans bande plate
    { x: 2,  y: 27, w: 7,  h: 4,  c: '#7e7f84' },
    { x: 11, y: 27, w: 6,  h: 4,  c: '#929396' },
    { x: 18, y: 28, w: 5,  h: 4,  c: '#838488' },
  ];

  const pavesSide = [
    { x: 2,  y: 26, w: 8,  h: 4,  c: '#6e6f73' },
    { x: 11, y: 26, w: 6,  h: 4,  c: '#7a7b7f' },
    { x: 18, y: 26, w: 7,  h: 4,  c: '#6a6b70' },
    { x: 26, y: 2,  w: 5,  h: 6,  c: '#717276' },
    { x: 26, y: 9,  w: 5,  h: 5,  c: '#7f8084' },
    { x: 26, y: 15, w: 5,  h: 5,  c: '#6d6e72' },
    { x: 26, y: 21, w: 5,  h: 4,  c: '#767779' },
  ];

  const paves = face === 'top' ? pavesTop : pavesSide;
  for (const p of paves) {
    // Pavé principal
    ctx.fillStyle = p.c;
    ctx.fillRect(p.x, p.y, p.w, p.h);
    // Reflet clair en haut du pavé (lumière zénithale)
    ctx.fillStyle = lightHi;
    ctx.fillRect(p.x, p.y, p.w, 1);
    ctx.fillRect(p.x, p.y, 1, p.h);
    // Ombre basse du pavé
    ctx.fillStyle = darkCrack;
    ctx.fillRect(p.x, p.y + p.h - 1, p.w, 1);
    ctx.fillRect(p.x + p.w - 1, p.y, 1, p.h);
  }

  if (face === 'top') {
    // Joints sombres irréguliers entre les pavés (façon Minecraft).
    // Pleine largeur pour que deux dessus voisins se raccordent.
    ctx.fillStyle = jointCol;
    ctx.fillRect(0, 7, S, 1);
    ctx.fillRect(0, 14, S, 1);
    ctx.fillRect(0, 20, S, 1);
    ctx.fillRect(0, 26, S, 1); // joint avant la rangée de raccord N-S
    ctx.fillRect(9,  2, 1, 6);
    ctx.fillRect(16, 2, 1, 6);
    ctx.fillRect(7,  8, 1, 6);
    ctx.fillRect(16, 8, 1, 6);
    ctx.fillRect(10, 15, 1, 5);
    ctx.fillRect(16, 15, 1, 6);
    ctx.fillRect(8,  21, 1, 5);
    ctx.fillRect(16, 21, 1, 5);
    ctx.fillRect(13, 27, 1, 4);
    ctx.fillRect(23, 27, 1, 4);

    ctx.fillStyle = withAlpha('#c8c9c6', 0.38);
    ctx.fillRect(5,  4,  2, 1);
    ctx.fillRect(13, 4,  1, 1);
    ctx.fillRect(20, 3,  2, 1);
    ctx.fillRect(4,  11, 2, 1);
    ctx.fillRect(12, 10, 1, 1);
    ctx.fillRect(19, 10, 2, 1);
    ctx.fillRect(6,  17, 1, 1);
    ctx.fillRect(14, 18, 2, 1);
    ctx.fillRect(21, 17, 1, 1);
  } else {
    // Pavés répétés verticalement (période 16) pour couvrir un mur étiré
    // ou un empilement sans plage grise unie.
    const extra = [
      { x: 2,  y: 2,  w: 8, h: 4, c: '#6e6f73' },
      { x: 11, y: 2,  w: 6, h: 4, c: '#7a7b7f' },
      { x: 18, y: 2,  w: 7, h: 4, c: '#6a6b70' },
      { x: 2,  y: 10, w: 7, h: 4, c: '#757679' },
      { x: 10, y: 10, w: 8, h: 4, c: '#6e6f73' },
      { x: 19, y: 10, w: 6, h: 4, c: '#7a7b7f' },
      { x: 2,  y: 18, w: 8, h: 4, c: '#6a6b70' },
      { x: 11, y: 18, w: 6, h: 4, c: '#717276' },
      { x: 18, y: 18, w: 7, h: 4, c: '#767779' },
      { x: 2,  y: 34, w: 8, h: 4, c: '#6e6f73' },
      { x: 11, y: 34, w: 6, h: 4, c: '#7a7b7f' },
      { x: 18, y: 34, w: 7, h: 4, c: '#6a6b70' },
      { x: 2,  y: 42, w: 7, h: 4, c: '#757679' },
      { x: 10, y: 42, w: 8, h: 4, c: '#6e6f73' },
      { x: 19, y: 42, w: 6, h: 4, c: '#7a7b7f' },
    ];
    for (const p of extra) {
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = lightHi;
      ctx.fillRect(p.x, p.y, p.w, 1);
      ctx.fillStyle = darkCrack;
      ctx.fillRect(p.x, p.y + p.h - 1, p.w, 1);
    }
    ctx.fillStyle = jointCol;
    ctx.fillRect(10, 26, 1, 4);
    ctx.fillRect(17, 26, 1, 4);
    ctx.fillRect(10, 10, 1, 4);
    ctx.fillRect(18, 18, 1, 4);
    ctx.fillRect(26, 8, 5, 1);
    ctx.fillRect(26, 14, 5, 1);
    ctx.fillRect(26, 20, 5, 1);
    ctx.fillRect(26, 36, 5, 1);
  }
}

function plankTexture(ctx, face) {
  const seam = withAlpha('#71451f', 0.76);
  const grain = withAlpha('#8f5929', 0.58);
  const highlight = withAlpha('#f6d596', 0.5);

  // Lames de chêne en bandes horizontales. Traits de x = 0 à x = 32
  // (période verticale 8 px) pour que deux blocs voisins fusionnent
  // pile-poil, sans trou de 2 px au raccord.
  if (face === 'top') {
    ctx.fillStyle = withAlpha('#7d491f', 0.1);
    ctx.fillRect(0, 8, S, 8);
    ctx.fillStyle = withAlpha('#f6d99f', 0.13);
    ctx.fillRect(0, 16, S, 8);
  } else {
    ctx.fillStyle = withAlpha('#4e2c17', 0.13);
    for (const y of [8, 24, 40, 56]) ctx.fillRect(0, y, S, 8);
  }

  ctx.strokeStyle = seam;
  ctx.lineWidth = 1;
  for (let y = 8; y <= 64; y += 8) {
    ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(S, y + 0.5); ctx.stroke();
  }

  // Assemblage en quinconce, périodique (8 px) pour un tiling vertical
  // continu y compris à la jonction d'un empilement (y = 40 ≡ y = 8).
  const joints = [
    [16, 0, 8], [9, 8, 16], [20, 16, 24], [13, 24, 32],
    [16, 32, 40], [9, 40, 48], [20, 48, 56], [13, 56, 64],
  ];
  for (const [x, y0, y1] of joints) {
    ctx.beginPath(); ctx.moveTo(x + 0.5, y0); ctx.lineTo(x + 0.5, y1); ctx.stroke();
  }

  // Veines en petits chemins pixelisés répétés avec des offsets verticaux
  ctx.strokeStyle = grain;
  ctx.lineWidth = 1;
  const veinPaths = [
    [[5, 6], [9, 5], [13, 6]],
    [[18, 7], [21, 6], [25, 6]],
    [[3, 13], [6, 12], [10, 13], [14, 12]],
    [[11, 15], [14, 14], [19, 14]],
    [[4, 21], [8, 20], [12, 21]],
    [[15, 23], [19, 22], [24, 23]],
    [[3, 29], [7, 28], [11, 29]],
  ];
  for (const points of veinPaths) {
    for (const offset of [0, 32]) {
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1] + offset);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1] + offset);
      ctx.stroke();
    }
  }

  ctx.fillStyle = highlight;
  ctx.fillRect(4, 3, 9, 1);
  ctx.fillRect(11, 11, 7, 1);
  ctx.fillRect(3, 19, 6, 1);
  ctx.fillRect(11, 35, 7, 1);

  // Nœuds ovales et discrets, intégrés au veinage.
  ctx.fillStyle = '#70401d';
  ctx.fillRect(6, 14, 3, 2);
  ctx.fillRect(21, 20, 3, 2);
  ctx.fillRect(6, 38, 3, 2);
  ctx.fillStyle = '#c48643';
  ctx.fillRect(7, 14, 1, 1);
  ctx.fillRect(22, 20, 1, 1);
  ctx.fillRect(7, 38, 1, 1);
}

function brickTexture(ctx, face) {
  const mortar = withAlpha('#f0b09b', face === 'top' ? 0.52 : 0.3);
  const shadow = withAlpha('#64281f', 0.62);
  ctx.lineWidth = 1;

  // Joints horizontaux pleine largeur, période 8 px : deux briques
  // côte à côte fusionnent sans rupture, et un empilement retombe
  // sur la même phase (y = 40 ≡ y = 8).
  ctx.strokeStyle = shadow;
  for (let y = 8; y <= 64; y += 8) {
    ctx.beginPath(); ctx.moveTo(0, y + 1); ctx.lineTo(S, y + 1); ctx.stroke();
  }
  ctx.strokeStyle = mortar;
  for (let y = 8; y <= 64; y += 8) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke();
  }

  ctx.strokeStyle = shadow;
  const verticalJoints = [
    [10, 0, 8], [23, 0, 8],
    [6, 8, 16], [18, 8, 16],
    [12, 16, 24], [25, 16, 24],
    [6, 24, 32], [18, 24, 32],
    [12, 32, 40], [25, 32, 40],
    [6, 40, 48], [18, 40, 48],
    [12, 48, 56], [25, 48, 56],
    [6, 56, 64], [18, 56, 64],
  ];
  for (const [x, y0, y1] of verticalJoints) {
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
  }

  ctx.fillStyle = withAlpha('#e58a70', 0.42);
  ctx.fillRect(4, 4, 5, 2);
  ctx.fillRect(13, 11, 4, 2);
  ctx.fillRect(19, 18, 5, 2);
  ctx.fillRect(13, 25, 4, 2);
  ctx.fillRect(19, 32, 5, 2);
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

// --- Four : bloc de cobblestone avec une bouche sombre, façon Minecraft ---
// Le four Minecraft a une face supérieure en cobblestone, une face avant
// avec une ouverture sombre entourée de pavés de pierre, et des rivets/
// grille en fer.
function furnaceTexture(ctx, face) {
  if (face === 'top') {
    // Dessus du four = cobblestone ordinaire (même apparence que stone)
    const pavesTop = [
      { x: 2, y: 2, w: 7, h: 5, c: '#7e7f84' },
      { x: 10, y: 2, w: 6, h: 6, c: '#8a8b90' },
      { x: 17, y: 2, w: 8, h: 5, c: '#76777b' },
      { x: 2, y: 8, w: 5, h: 6, c: '#929396' },
      { x: 8, y: 9, w: 8, h: 5, c: '#7a7b7f' },
      { x: 17, y: 8, w: 6, h: 6, c: '#8d8e92' },
      { x: 2, y: 15, w: 8, h: 5, c: '#84858a' },
      { x: 11, y: 15, w: 5, h: 6, c: '#999a9e' },
      { x: 17, y: 15, w: 7, h: 5, c: '#76777b' },
      // rangée de raccord N-S (jusqu'au bord de tuile, y = 32)
      { x: 2, y: 22, w: 8, h: 5, c: '#7a7b7f' },
      { x: 12, y: 23, w: 6, h: 4, c: '#8a8b90' },
      { x: 19, y: 22, w: 5, h: 5, c: '#84858a' },
    ];
    for (const p of pavesTop) {
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = withAlpha('#d0d1ce', 0.38);
      ctx.fillRect(p.x, p.y, p.w, 1);
      ctx.fillStyle = withAlpha('#26292c', 0.42);
      ctx.fillRect(p.x, p.y + p.h - 1, p.w, 1);
    }
    ctx.fillStyle = withAlpha('#32363a', 0.55);
    ctx.fillRect(9, 2, 1, 6);
    ctx.fillRect(16, 2, 1, 6);
    ctx.fillRect(7, 8, 1, 6);
    ctx.fillRect(16, 8, 1, 6);
    ctx.fillRect(10, 15, 1, 5);
    ctx.fillRect(16, 15, 1, 5);
    ctx.fillRect(11, 22, 1, 5);
    ctx.fillRect(18, 22, 1, 5);
    return;
  }

  // Face avant et droite : pavés de cobblestone + bouche du four
  // Fond de pierre
  const pavs = [
    { x: 3, y: 2, w: 7, h: 4, c: '#7e7f84' },
    { x: 11, y: 2, w: 6, h: 3, c: '#8a8b90' },
    { x: 18, y: 2, w: 6, h: 4, c: '#76777b' },
    { x: 3, y: 19, w: 8, h: 4, c: '#84858a' },
    { x: 12, y: 20, w: 6, h: 4, c: '#7a7b7f' },
    { x: 19, y: 19, w: 5, h: 5, c: '#929396' },
  ];
  for (const p of pavs) {
    ctx.fillStyle = p.c;
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = withAlpha('#d0d1ce', 0.32);
    ctx.fillRect(p.x, p.y, p.w, 1);
    ctx.fillStyle = withAlpha('#26292c', 0.38);
    ctx.fillRect(p.x, p.y + p.h - 1, p.w, 1);
  }

  // Bouche du four (cavité sombre)
  ctx.fillStyle = '#1a1b1e';
  ctx.fillRect(9, 7, 14, 11);
  ctx.fillStyle = '#111214';
  ctx.fillRect(10, 8, 12, 9);

  // Grille en fer dans la bouche (barres horizontales)
  ctx.fillStyle = '#4a4c52';
  ctx.fillRect(10, 10, 12, 1);
  ctx.fillRect(10, 13, 12, 1);
  ctx.fillRect(10, 16, 12, 1);
  // Reflets sur les barres
  ctx.fillStyle = withAlpha('#9a9ca2', 0.45);
  ctx.fillRect(11, 10, 8, 1);
  ctx.fillRect(11, 13, 6, 1);

  // Cadre de la bouche (pierre plus sombre)
  ctx.fillStyle = '#3a3c40';
  ctx.fillRect(9, 7, 14, 1);   // haut
  ctx.fillRect(9, 17, 14, 1);  // bas
  ctx.fillRect(9, 7, 1, 11);   // gauche
  ctx.fillRect(22, 7, 1, 11);  // droite
  // Biseau intérieur clair
  ctx.fillStyle = withAlpha('#b0b2b8', 0.3);
  ctx.fillRect(10, 7, 12, 1);
  ctx.fillRect(9, 8, 1, 9);
  // Biseau intérieur sombre
  ctx.fillStyle = withAlpha('#0a0b0d', 0.4);
  ctx.fillRect(10, 17, 12, 1);
  ctx.fillRect(22, 8, 1, 9);

  // Lueur rougeâtre au fond de la bouche (braises éteintes)
  ctx.fillStyle = withAlpha('#5a2010', 0.2);
  ctx.fillRect(12, 14, 8, 3);
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

// --- Coffre : boîte en chêne avec couvercle, charnières et fermoir,
// façon Minecraft. Cube 32×40 comme les autres blocs (lumière NE).
//
// Le couvercle s'ouvre en rotation sur sa charnière nord : 13 frames
// pré-rendues (comme l'eau), de fermé (0) à ouvert (~75°). La canvas fait
// 16 px de marge en haut : l'arête du couvercle soulevée dépasse du dessus
// de la boîte et peut chevaucher la tuile nord (dessinée avant → correct).
export const CHEST_OPEN_FRAMES = 13;
export const CHEST_TOP_PAD = 16; // marge haute (couvercle soulevé)
const CHEST_MAX_ANGLE = (75 * Math.PI) / 180;
const CHEST_LIFT_K = 0.9;    // hauteur écran de l'arête soulevée (facteur 2.5D)
const CHEST_HINGE_Y = 3;     // charnière, au bord nord du dessus
const CHEST_LID_DEPTH = 23;  // profondeur du couvercle (charnière → bord sud)
const CHEST_LID_L = 2;       // bords est/ouest du couvercle
const CHEST_LID_R = 26;
const CHEST_CAV = { x: 5, y: 5, w: 18, h: 17 }; // cavité (intérieur)

function chestEaseOut(t) { return 1 - Math.pow(1 - t, 3); }

// Côté du couvercle (texture + teintes) : `t` = 0 fermé (dessus) à
// 1 ouvert (dessous, plus clair).
function chestLidColors(t) {
  const base = BLOCK_DEFS.chest.color;
  return {
    fill: shade(base, 1.18 + 0.14 * t),
    seam: withAlpha('#241305', 0.5 + 0.2 * t),
    gap: withAlpha('#150a02', 0.8),
    hi: withAlpha('#ffe2ac', 0.22 + 0.16 * t),
    grain: withAlpha('#5e3a1c', 0.32),
  };
}

function drawChestTile(ctx, openT = 0) {
  const base = BLOCK_DEFS.chest.color;
  const side = shade(base, 0.84);
  const sideDark = shade(base, 0.58);
  const iron = '#3d4046';
  const ironHi = '#838a96';
  const gold = '#e0b13c';

  ctx.save();
  ctx.translate(0, CHEST_TOP_PAD); // la boîte tient sur 0..40, marge en haut

  // 1. Fond : toute la tuile, zéro trou d'arrière-plan.
  ctx.fillStyle = sideDark;
  ctx.fillRect(0, 0, S, BLOCK_H);

  // 2. Face est (biseau) : bois sombre, lames horizontales.
  ctx.fillStyle = sideDark;
  ctx.fillRect(26, 2, 6, 38);
  ctx.strokeStyle = withAlpha('#150b03', 0.55);
  ctx.lineWidth = 1;
  for (const y of [9.5, 16.5, 23.5, 33.5]) {
    ctx.beginPath(); ctx.moveTo(26, y); ctx.lineTo(32, y); ctx.stroke();
  }
  ctx.fillStyle = withAlpha('#ffd9a0', 0.1);
  ctx.fillRect(26, 2, 1, 38);

  // 3. Face avant : deux lames + fermoir métallique.
  ctx.fillStyle = side;
  ctx.fillRect(2, 26, 24, 14);
  ctx.strokeStyle = withAlpha('#241305', 0.55);
  ctx.beginPath(); ctx.moveTo(2, 33.5); ctx.lineTo(26, 33.5); ctx.stroke();
  // grain du bois
  ctx.fillStyle = withAlpha('#241305', 0.3);
  ctx.fillRect(5, 28.5, 6, 1); ctx.fillRect(17, 29.5, 5, 1);
  ctx.fillRect(6, 36.5, 5, 1); ctx.fillRect(15, 37.5, 6, 1);
  ctx.fillStyle = withAlpha('#ffd9a0', 0.16);
  ctx.fillRect(4, 27, 8, 1); ctx.fillRect(11, 35, 7, 1);
  // patins de fer en bas (pieds de la boîte)
  ctx.fillStyle = iron;
  ctx.fillRect(3, 37, 4, 2); ctx.fillRect(21, 37, 4, 2);
  // bande de métal verticale (monture du fermoir) + rivets
  ctx.fillStyle = iron;
  ctx.fillRect(13, 26, 3, 14);
  ctx.fillStyle = ironHi;
  ctx.fillRect(13, 26, 1, 14);
  ctx.fillStyle = withAlpha('#111318', 0.6);
  ctx.fillRect(14, 27, 1, 1); ctx.fillRect(14, 38, 1, 1);
  // serrure dorée avec trou
  ctx.fillStyle = gold;
  ctx.fillRect(12, 30, 5, 4);
  ctx.fillStyle = '#ffe9a0';
  ctx.fillRect(12, 30, 5, 1);
  ctx.fillStyle = withAlpha('#000000', 0.35);
  ctx.fillRect(12, 33, 5, 1);
  ctx.fillStyle = '#4a3208';
  ctx.fillRect(14, 31, 1, 2);

  // 4. Dessus : liseré de la boîte + cavité (révélée par l'ouverture).
  ctx.fillStyle = shade(base, 0.96);
  ctx.fillRect(2, 2, 24, 24);
  // liseré sud (bord de la boîte, face lumière)
  ctx.fillStyle = shade(base, 1.1);
  ctx.fillRect(2, 22, 24, 4);
  // cavité
  ctx.fillStyle = '#1c0f07';
  ctx.fillRect(CHEST_CAV.x, CHEST_CAV.y, CHEST_CAV.w, CHEST_CAV.h);
  // fond de la cavité : lames sombres
  ctx.fillStyle = '#38220f';
  ctx.fillRect(CHEST_CAV.x, 15, CHEST_CAV.w, 6);
  ctx.strokeStyle = withAlpha('#120a03', 0.85);
  ctx.beginPath(); ctx.moveTo(10.5, 15); ctx.lineTo(10.5, 21); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(16.5, 15); ctx.lineTo(16.5, 21); ctx.stroke();
  // ombres intérieures (nord + ouest)
  ctx.fillStyle = withAlpha('#000000', 0.5);
  ctx.fillRect(CHEST_CAV.x, CHEST_CAV.y, CHEST_CAV.w, 2);
  ctx.fillStyle = withAlpha('#000000', 0.32);
  ctx.fillRect(CHEST_CAV.x, 7, CHEST_CAV.w, 2);
  ctx.fillRect(CHEST_CAV.x, CHEST_CAV.y, 2, CHEST_CAV.h);
  ctx.fillStyle = withAlpha('#000000', 0.18);
  ctx.fillRect(22, CHEST_CAV.y, 1, CHEST_CAV.h);

  // 5. Couvercle — rotation sur la charnière nord.
  // Projection : un point à la profondeur d (de la charnière) se projette
  // en y = HINGE + d * (cos − sin·K) : linéaire en d. Quand l'arête
  // soulevée passe au-dessus de la charnière à l'écran (ouverture > ~48°),
  // la bande remonte AU-DESSUS de yTop — on dessine avec une hauteur
  // signée (min/abs), jamais une hauteur négative.
  const t = chestEaseOut(Math.max(0, Math.min(1, openT)));
  const ang = CHEST_MAX_ANGLE * t;
  const cos = Math.cos(ang);
  const sin = Math.sin(ang);
  const yTop = CHEST_HINGE_Y;
  const yBot = CHEST_HINGE_Y + CHEST_LID_DEPTH * cos - CHEST_LID_DEPTH * sin * CHEST_LIFT_K;
  const dy = yBot - yTop; // signé : + fermé (bande vers le bas), − ouvert
  const yA = Math.min(yTop, yBot);
  const bandH = Math.max(1, Math.abs(dy));
  const L = chestLidColors(t);

  // ombre du couvercle sur l'intérieur (sauf quasi ouvert)
  if (t > 0.03 && t < 0.9) {
    const sy = Math.max(CHEST_CAV.y, Math.ceil(Math.min(yBot, CHEST_CAV.y + CHEST_CAV.h)));
    if (sy < 21) {
      ctx.fillStyle = withAlpha('#000000', 0.3 * (1 - t));
      ctx.fillRect(CHEST_CAV.x, sy, CHEST_CAV.w, Math.min(3, 21 - sy));
    }
  }

  // bande du couvercle (dessous visible quand il pivote vers le sud)
  ctx.fillStyle = L.fill;
  ctx.fillRect(CHEST_LID_L, yA, CHEST_LID_R - CHEST_LID_L, bandH);
  ctx.save();
  ctx.beginPath();
  ctx.rect(CHEST_LID_L, yA, CHEST_LID_R - CHEST_LID_L, bandH);
  ctx.clip();
  // lames du couvercle (joints proportionnels, projection linéaire)
  ctx.strokeStyle = L.seam;
  ctx.lineWidth = 1;
  for (const f of [0.3, 0.7]) {
    const y = yTop + dy * f + 0.5;
    ctx.beginPath(); ctx.moveTo(CHEST_LID_L, y); ctx.lineTo(CHEST_LID_R, y); ctx.stroke();
  }
  // joint central du couvercle (sombre) + liseré clair
  const gapY = Math.round(yTop + dy * 0.5);
  ctx.fillStyle = L.gap;
  ctx.fillRect(CHEST_LID_L, gapY, CHEST_LID_R - CHEST_LID_L, 1);
  ctx.fillStyle = L.hi;
  ctx.fillRect(CHEST_LID_L, gapY + (dy >= 0 ? 1 : -1), CHEST_LID_R - CHEST_LID_L, 1);
  // grain
  ctx.fillStyle = L.grain;
  ctx.fillRect(5, Math.round(yTop + dy * 0.16), 5, 1);
  ctx.fillRect(16, Math.round(yTop + dy * 0.12), 4, 1);
  ctx.fillRect(8, Math.round(yTop + dy * 0.8), 5, 1);
  ctx.fillRect(19, Math.round(yTop + dy * 0.86), 4, 1);
  // arête charnière
  ctx.fillStyle = withAlpha('#150a02', 0.6);
  ctx.fillRect(CHEST_LID_L, Math.round(yTop) - (dy >= 0 ? 0 : 1), CHEST_LID_R - CHEST_LID_L, 1);
  // arête soulevée : liseré clair de rebord + trait sombre
  const edgeHiY = dy >= 0 ? Math.round(yBot) - 2 : Math.round(yBot);
  const edgeLoY = dy >= 0 ? Math.round(yBot) - 1 : Math.round(yBot) + 1;
  ctx.fillStyle = withAlpha('#ffe2ac', 0.4);
  ctx.fillRect(CHEST_LID_L, edgeHiY, CHEST_LID_R - CHEST_LID_L, 1);
  ctx.fillStyle = withAlpha('#150a02', 0.45);
  ctx.fillRect(CHEST_LID_L, edgeLoY, CHEST_LID_R - CHEST_LID_L, 1);
  ctx.restore();

  // coins de fer du couvercle (visibles quand il est presque à plat)
  if (bandH >= 16) {
    const hingeY = dy >= 0 ? Math.round(yTop) + 1 : Math.round(yTop) - 2;
    const liftedY = dy >= 0 ? Math.round(yBot) - 3 : Math.round(yBot);
    ctx.fillStyle = iron;
    for (const by of [hingeY, liftedY]) {
      for (const bx of [CHEST_LID_L, CHEST_LID_R - 3]) {
        ctx.fillRect(bx, by, 3, 2);
      }
    }
    ctx.fillStyle = withAlpha('#c9ced6', 0.5);
    ctx.fillRect(CHEST_LID_L, hingeY, 1, 2);
    ctx.fillRect(CHEST_LID_R - 3, hingeY, 1, 2);
  }

  // 6. Silhouette de la boîte (le couvercle a son propre rebord).
  ctx.strokeStyle = shade(base, 0.38);
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 1.5, S - 1, BLOCK_H - 2);
  // liseré clair du liseré sud quand le couvercle est ouvert
  if (t > 0.05) {
    ctx.fillStyle = withAlpha('#ffe2ac', 0.25 * Math.min(1, t * 2));
    ctx.fillRect(2, 22, 24, 1);
  }

  ctx.restore();
}

// --- Porte : fermée (vue de face) ou ouverte (à plat sur le sol) ---
// Design magnifique inspiré d'une porte en chêne Minecraft : deux
// panneaux sculptés, cadre massif, charnières en fer forgé, poignée
// dorée avec reflet, grain du bois visible.
function drawDoorClosed(ctx) {
  const base = BLOCK_DEFS.door.color;
  const dark  = shade(base, 0.62);
  const mid   = shade(base, 0.82);
  const light = shade(base, 1.12);
  const hi    = shade(base, 1.28);

  // Fond sombre (vu derrière le cadre, dans les creux)
  ctx.fillStyle = dark;
  ctx.fillRect(2, 0, S - 4, S);

  // Cadre massif en bois sombre — montants et traverse
  ctx.fillStyle = mid;
  ctx.fillRect(2, 0, 4, S);        // montant gauche
  ctx.fillRect(S - 6, 0, 4, S);    // montant droit
  ctx.fillRect(2, 0, S - 4, 3);    // traverse haute
  ctx.fillRect(2, S - 3, S - 4, 3); // traverse basse
  ctx.fillRect(2, 14, S - 4, 3);   // traverse milieu

  // Reflet du cadre (bord intérieur clair)
  ctx.fillStyle = withAlpha('#ffffff', 0.18);
  ctx.fillRect(3, 1, 2, S - 2);
  ctx.fillRect(3, 1, S - 6, 1);

  // --- Panneau haut (entre traverse haute et milieu) ---
  ctx.fillStyle = light;
  ctx.fillRect(7, 4, S - 14, 9);
  // Relief intérieur : biseau clair en haut et sombre en bas
  ctx.fillStyle = hi;
  ctx.fillRect(7, 4, S - 14, 1);
  ctx.fillRect(7, 4, 1, 9);
  ctx.fillStyle = shade(base, 0.72);
  ctx.fillRect(7, 12, S - 14, 1);
  ctx.fillRect(S - 8, 4, 1, 9);

  // --- Panneau bas (entre traverse milieu et basse) ---
  ctx.fillStyle = light;
  ctx.fillRect(7, 18, S - 14, 10);
  ctx.fillStyle = hi;
  ctx.fillRect(7, 18, S - 14, 1);
  ctx.fillRect(7, 18, 1, 10);
  ctx.fillStyle = shade(base, 0.72);
  ctx.fillRect(7, 27, S - 14, 1);
  ctx.fillRect(S - 8, 18, 1, 10);

  // Veines du bois sur les panneaux (pixel art subtil)
  ctx.strokeStyle = withAlpha('#6a4520', 0.32);
  ctx.lineWidth = 1;
  // panneau haut
  ctx.beginPath();
  ctx.moveTo(9, 6); ctx.lineTo(13, 5); ctx.lineTo(18, 6);
  ctx.moveTo(10, 9); ctx.lineTo(15, 8); ctx.lineTo(21, 9);
  ctx.stroke();
  // panneau bas
  ctx.beginPath();
  ctx.moveTo(9, 21); ctx.lineTo(14, 20); ctx.lineTo(19, 21);
  ctx.moveTo(10, 24); ctx.lineTo(16, 23); ctx.lineTo(22, 24);
  ctx.moveTo(9, 26); ctx.lineTo(13, 25.5); ctx.lineTo(18, 26);
  ctx.stroke();

  // Nœuds du bois discrets
  ctx.fillStyle = withAlpha('#5a3818', 0.35);
  ctx.fillRect(12, 7, 2, 2);
  ctx.fillRect(18, 23, 2, 2);
  ctx.fillStyle = withAlpha('#e0b870', 0.28);
  ctx.fillRect(13, 7, 1, 1);
  ctx.fillRect(19, 23, 1, 1);

  // --- Charnières en fer forgé ---
  const hingeX = 3;
  for (const hy of [5, 23]) {
    // Platine
    ctx.fillStyle = '#3e3e44';
    ctx.fillRect(hingeX, hy, 5, 3);
    // Reflet métal
    ctx.fillStyle = withAlpha('#b0b0b8', 0.5);
    ctx.fillRect(hingeX, hy, 5, 1);
    // Pivot rond
    ctx.fillStyle = '#2a2a2e';
    ctx.fillRect(hingeX, hy, 2, 3);
    ctx.fillStyle = withAlpha('#ffffff', 0.22);
    ctx.fillRect(hingeX, hy, 1, 1);
    // Rivet
    ctx.fillStyle = '#55555c';
    ctx.fillRect(hingeX + 3, hy + 1, 1, 1);
  }

  // --- Poignée dorée ---
  const hx = S - 10, hy2 = 14;
  // Platine de la poignée
  ctx.fillStyle = '#4a3a18';
  ctx.fillRect(hx, hy2 + 1, 4, 5);
  ctx.fillStyle = '#c8a23c';
  ctx.fillRect(hx + 1, hy2 + 2, 2, 3);
  // Bouton rond doré
  ctx.fillStyle = '#e8c44e';
  ctx.fillRect(hx, hy2 + 3, 4, 2);
  // Reflet doré
  ctx.fillStyle = withAlpha('#fff8d0', 0.6);
  ctx.fillRect(hx + 1, hy2 + 3, 1, 1);
  // Ombre du bouton
  ctx.fillStyle = withAlpha('#000000', 0.2);
  ctx.fillRect(hx + 1, hy2 + 5, 2, 1);

  // --- Serrure (petit trou sous la poignée) ---
  ctx.fillStyle = '#1a1a1e';
  ctx.fillRect(hx + 1, hy2 + 7, 2, 1);

  // Contour extérieur sombre pour lisibilité
  ctx.strokeStyle = shade(base, 0.42);
  ctx.lineWidth = 1;
  ctx.strokeRect(1.5, 0.5, S - 3, S - 1);
}

function drawDoorOpen(ctx) {
  // Porte ouverte : vue du dessus, la porte est rabattue à plat.
  // On dessine la même porte mais « en perspective raccourcie ».
  const base = BLOCK_DEFS.door.color;
  const dark  = shade(base, 0.65);
  const mid   = shade(base, 0.85);
  const light = shade(base, 1.1);
  const hi    = shade(base, 1.22);

  // Ombre portée sous la porte
  ctx.fillStyle = withAlpha('#000000', 0.14);
  ctx.fillRect(3, 15, S - 10, 3);

  // Corps principal de la porte (rabattue vers le haut de la tuile)
  const dx = 2, dy = 3, dw = S - 8, dh = 11;
  ctx.fillStyle = dark;
  ctx.fillRect(dx, dy, dw, dh);

  // Cadre
  ctx.fillStyle = mid;
  ctx.fillRect(dx, dy, dw, 2);       // haut
  ctx.fillRect(dx, dy + dh - 2, dw, 2); // bas
  ctx.fillRect(dx, dy, 3, dh);       // gauche
  ctx.fillRect(dx + dw - 3, dy, 3, dh); // droite
  ctx.fillRect(dx, dy + 5, dw, 2);   // traverse milieu

  // Panneau haut
  ctx.fillStyle = light;
  ctx.fillRect(dx + 4, dy + 2, dw - 8, 3);
  ctx.fillStyle = hi;
  ctx.fillRect(dx + 4, dy + 2, dw - 8, 1);

  // Panneau bas
  ctx.fillStyle = light;
  ctx.fillRect(dx + 4, dy + 7, dw - 8, 3);
  ctx.fillStyle = hi;
  ctx.fillRect(dx + 4, dy + 7, dw - 8, 1);

  // Veines raccourcies
  ctx.strokeStyle = withAlpha('#6a4520', 0.25);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(dx + 6, dy + 3); ctx.lineTo(dx + 12, dy + 3);
  ctx.moveTo(dx + 7, dy + 9); ctx.lineTo(dx + 14, dy + 8);
  ctx.stroke();

  // Charnières (côté gauche, à plat)
  for (const cy of [dy + 2, dy + 8]) {
    ctx.fillStyle = '#3e3e44';
    ctx.fillRect(dx, cy, 3, 2);
    ctx.fillStyle = withAlpha('#b0b0b8', 0.4);
    ctx.fillRect(dx, cy, 3, 1);
    ctx.fillStyle = '#2a2a2e';
    ctx.fillRect(dx, cy, 2, 2);
  }

  // Poignée dorée (petite, vue du dessus)
  ctx.fillStyle = '#c8a23c';
  ctx.fillRect(dx + dw - 6, dy + 5, 3, 2);
  ctx.fillStyle = '#e8c44e';
  ctx.fillRect(dx + dw - 6, dy + 5, 2, 1);

  // Contour
  ctx.strokeStyle = shade(base, 0.45);
  ctx.lineWidth = 1;
  ctx.strokeRect(dx + 0.5, dy + 0.5, dw - 1, dh - 1);
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
    const h = isExtrudedBlock(key) ? S + BLOCK_EXTRUDE : S;
    const c = makeCanvas(S, h);
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
  // Variante « four allumé » : lueur vive dans la bouche avec dégradé
  // de flamme (rouge → orange → jaune), barres de grille rougeoyantes.
  const H = S + BLOCK_EXTRUDE;
  const lit = makeCanvas(S, H);
  const lctx = lit.getContext('2d');
  lctx.imageSmoothingEnabled = false;
  lctx.drawImage(cache.furnace, 0, 0);
  // Halo de chaleur autour de la bouche
  lctx.fillStyle = withAlpha('#ff6a1c', 0.15);
  lctx.fillRect(8, 6, 16, 13);
  // Fond rougeoyant de la bouche
  lctx.fillStyle = '#3a1508';
  lctx.fillRect(10, 8, 12, 9);
  // Flammes : dégradé du bas (jaune vif) vers le haut (rouge sombre)
  lctx.fillStyle = '#c22a08';
  lctx.fillRect(11, 9, 10, 3);
  lctx.fillStyle = '#e05a1a';
  lctx.fillRect(11, 12, 10, 2);
  lctx.fillStyle = '#ff8a2c';
  lctx.fillRect(12, 14, 8, 2);
  lctx.fillStyle = '#ffc44e';
  lctx.fillRect(13, 15, 6, 1);
  lctx.fillStyle = '#ffe080';
  lctx.fillRect(14, 15, 4, 1);
  // Braises au fond
  lctx.fillStyle = '#ffd060';
  lctx.fillRect(12, 16, 8, 1);
  lctx.fillStyle = '#ff9030';
  lctx.fillRect(11, 16, 2, 1);
  lctx.fillRect(19, 16, 2, 1);
  // Barres de grille (rougeoyantes par le feu)
  lctx.fillStyle = '#8a4428';
  lctx.fillRect(10, 10, 12, 1);
  lctx.fillRect(10, 13, 12, 1);
  // Reflet orange sur les barres
  lctx.fillStyle = withAlpha('#ff9a3c', 0.5);
  lctx.fillRect(11, 10, 8, 1);
  lctx.fillRect(11, 13, 6, 1);
  // Particules d'étincelles (2-3 points jaunes au-dessus)
  lctx.fillStyle = '#ffd060';
  lctx.fillRect(14, 8, 1, 1);
  lctx.fillRect(17, 9, 1, 1);
  lctx.fillRect(12, 9, 1, 1);
  cache.furnaceLit = lit;

  // Coffre : 13 frames d'ouverture du couvercle (comme l'eau). Pas de
  // raccord auto-tiling, comme le four.
  const chestFrames = [];
  for (let f = 0; f < CHEST_OPEN_FRAMES; f++) {
    const c = makeCanvas(S, H + CHEST_TOP_PAD);
    const chctx = c.getContext('2d');
    chctx.imageSmoothingEnabled = false;
    drawChestTile(chctx, f / (CHEST_OPEN_FRAMES - 1));
    chestFrames.push(c);
  }
  cache.chestFrames = chestFrames;

  built = true;
  return cache;
}

// Frame du coffre selon l'avancement d'ouverture (0 = fermé, 1 = ouvert).
export function getChestFrame(openT = 0) {
  const t = Math.max(0, Math.min(1, openT));
  const idx = Math.round(t * (CHEST_OPEN_FRAMES - 1));
  return cache.chestFrames ? cache.chestFrames[idx] : cache.chestFrames?.[0];
}

// Tuile de coffre fermée (tutoriel, aperçus…).
export function getChestCanvas() {
  return cache.chestFrames ? cache.chestFrames[0] : null;
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
  // Petit arbre majestueux, nettement plus grand qu'un simple cube de 40px de haut.
  if (shadow) softShadow(ctx, x, y + 1, 20, 8);
  voxel(ctx, x - 5, y - 22, 10, 24, '#6e4426');
  ctx.fillStyle = '#8a5a34';
  ctx.fillRect(x - 5, y - 22, 3, 24);
  voxel(ctx, x - 22, y - 48, 44, 32, '#3f7d2c');
  voxel(ctx, x - 16, y - 56, 32, 32, '#4f9337');
  voxel(ctx, x - 9, y - 62, 18, 10, '#63a845');
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(x - 9, y - 62, 18, 4);
}

function drawTreeMediumRaw(ctx, x, y, shadow = true) {
  // Arbre moyen, de belle taille et robuste.
  if (shadow) softShadow(ctx, x, y + 1, 28, 10);
  voxel(ctx, x - 7, y - 30, 14, 32, '#6e4426');
  ctx.fillStyle = '#8a5a34';
  ctx.fillRect(x - 7, y - 30, 4, 32);
  voxel(ctx, x - 30, y - 66, 60, 44, '#3f7d2c');
  voxel(ctx, x - 22, y - 78, 44, 44, '#4f9337');
  voxel(ctx, x - 12, y - 86, 24, 14, '#63a845');
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(x - 12, y - 86, 24, 4);
}

function drawTreeLargeRaw(ctx, x, y, shadow = true) {
  // Arbre géant très majestueux.
  if (shadow) softShadow(ctx, x, y + 2, 40, 14);
  voxel(ctx, x - 10, y - 44, 20, 48, '#5a361c');
  ctx.fillStyle = '#7a4a28';
  ctx.fillRect(x - 10, y - 44, 6, 48);
  ctx.fillStyle = withAlpha('#000000', 0.18);
  ctx.fillRect(x + 4, y - 38, 4, 18);
  voxel(ctx, x - 45, y - 96, 90, 60, '#2f6a24');
  voxel(ctx, x - 36, y - 112, 72, 62, '#3f7d2c');
  voxel(ctx, x - 24, y - 126, 48, 42, '#4f9337');
  voxel(ctx, x - 12, y - 136, 24, 18, '#63a845');
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(x - 12, y - 136, 24, 5);
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
  objectCache['tree:small'] = makeObjectSprite(52, 72, 26, 64, drawTreeSmallRaw);
  objectCache['tree:medium'] = makeObjectSprite(68, 98, 34, 88, drawTreeMediumRaw);
  objectCache['tree:large'] = makeObjectSprite(100, 148, 50, 138, drawTreeLargeRaw);
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

// ------------------------------------------------------------
//  Connexion intelligente des blocs (Auto-tiling 3D dynamique)
// ------------------------------------------------------------

const BLOCK_TEXTURES = {
  wood:      { texture: woodGrain, opts: {} },
  stone:     { texture: stoneTexture, opts: {} },
  plank:     { texture: plankTexture, opts: {} },
  brick:     { texture: brickTexture, opts: {} },
  glass:     { texture: glassTexture, opts: { alpha: 0.78, shine: 0.45 } },
  sandBlock: { texture: sandBlockTexture, opts: {} },
  dirtBlock: { texture: dirtBlockTexture, opts: {} },
  ironBlock: { texture: ironBlockTexture, opts: {} },
  furnace:   { texture: furnaceTexture, opts: {} },
  woolBlock: { texture: woolBlockTexture, opts: {} },
};

const ISOLATED_FACES = {
  leftSame: false,
  rightSame: false,
  northSame: false,
  southSame: false,
  covered: false,
  sittingOn: false,
  showTop: true,
};

// Décide quelles faces d'un bloc 2.5D sont visibles / fusionnées.
//
// Chaque cube montre son dessus — c'est une vue top-down, on voit le
// sommet de TOUS les blocs, qu'ils soient en ligne, en colonne, en L
// ou en T. Le dessus n'est caché QUE si un autre bloc est vraiment
// empilé dessus (couche 2) : le socle fusionne alors avec la face
// avant du sommet.
//
// Raccord N-S (même matériau) : le dessus descend jusqu'à la frontière
// de tuile pour fusionner avec le dessus du voisin sud, exactement
// comme un raccord E-O — ni bande de face avant ni trait de séparation
// entre les deux blocs.
export function resolveBlockFaces(world, id, tx, ty, layer = 1) {
  const leftSame = world.blockAt(tx - 1, ty, layer) === id;
  const rightSame = world.blockAt(tx + 1, ty, layer) === id;
  const northSame = world.blockAt(tx, ty - 1, layer) === id;
  const southSame = world.blockAt(tx, ty + 1, layer) === id;
  const covered = layer === 1 && world.blockAt(tx, ty, 2) !== null;
  const sittingOn = layer === 2 && world.blockAt(tx, ty, 1) !== null;
  const showTop = !covered;
  return { leftSame, rightSame, northSame, southSame, covered, sittingOn, showTop };
}

function drawBlockTileConnected(ctx, x, y, color, texture, faces, opts = {}) {
  const top = shade(color, 1.14);
  const side = shade(color, 0.84);
  const sideDark = shade(color, 0.68);
  const {
    leftSame, rightSame, northSame, southSame, sittingOn, showTop,
  } = faces;

  // Largeur du dessus / de l'avant : on mange les biseaux aux raccords E-O
  // pour que deux blocs voisins se touchent pile sur la frontière de tuile.
  const x0 = leftSame ? 0 : TOP_INSET_L;
  const x1 = rightSame ? S : S - RIGHT_FACE_W;
  const fw = x1 - x0;

  // Coin / T avec voisin nord : le dessus démarre à y = 0 (plus de bande
  // de 2 px « side ») pour recouvrir proprement l'extrusion du voisin.
  const topY0 = (showTop && northSame) ? 0 : TOP_INSET_T;

  // Raccord N-S : avec un voisin sud du même matériau, le dessus descend
  // jusqu'à la frontière de tuile (y = 32) au lieu de s'arrêter à y = 26.
  // Les deux dessus se touchent alors pile, exactement comme sur un
  // raccord E-O : plus de bande de « face avant » ni de trait qui
  // cloisonnent les blocs (L, T, colonnes…), la paroi ne montre sa face
  // avant qu'au bord sud du mur. Le voisin sud, dessiné après, recouvre
  // toute l'extrusion restante.
  const topBottom = (showTop && southSame) ? S : FRONT_Y;
  const topH = topBottom - topY0;

  // Face droite : biseau y = 2 seulement pour un cube isolé (pas de voisin N).
  // Aux coins et sur un mur étiré, elle part de y = 0 pour rester continue.
  const rightY0 = (showTop && !northSame) ? TOP_INSET_T : 0;

  const fy0 = showTop ? topBottom : 0;
  const fh = BLOCK_H - fy0;

  ctx.save();
  ctx.translate(x, y);
  if (opts.alpha != null) ctx.globalAlpha = opts.alpha;

  // 1. Fond : toute la tuile 32×40, zéro trou d'arrière-plan.
  ctx.fillStyle = side;
  ctx.fillRect(0, 0, S, BLOCK_H);

  // 2. Face supérieure — uniquement sur les sommets visibles.
  if (showTop && fw > 0 && topH > 0) {
    ctx.fillStyle = top;
    ctx.fillRect(x0, topY0, fw, topH);
  }

  // 3. Face avant. Pleine hauteur si le dessus est caché (mur N-S ou
  //    socle d'un empilement), sinon bande basse y = 26 → 40.
  ctx.fillStyle = sideDark;
  if (fw > 0 && fh > 0) ctx.fillRect(x0, fy0, fw, fh);

  // 4. Face droite (biseau est) : remplie en sideDark, comme l'avant.
  if (!rightSame) {
    ctx.fillRect(S - RIGHT_FACE_W, rightY0, RIGHT_FACE_W, BLOCK_H - rightY0);
  }

  // Reflet haut-gauche : seulement à l'angle extérieur, jamais le long
  // d'un raccord (sinon bande blanche sur tout le mur).
  if (showTop && !leftSame) {
    // Bande horizontale : uniquement si le bord nord du dessus est libre
    // (avec un voisin nord fusionné, elle tomberait pile sur le raccord).
    if (!northSame) {
      ctx.fillStyle = withAlpha('#ffffff', opts.shine ?? 0.26);
      ctx.fillRect(x0, topY0, Math.max(0, fw - 2), 2);
    }
    // Bande verticale le long du biseau ouest (arête libre).
    ctx.fillStyle = withAlpha('#ffffff', opts.shine ?? 0.26);
    ctx.fillRect(x0, topY0, 2, topH);
  }

  const paintFace = (face, px, py, pw, ph) => {
    if (pw <= 0 || ph <= 0) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(px, py, pw, ph);
    ctx.clip();
    texture(ctx, face, { x: px, y: py, w: pw, h: ph, top, side, dark: sideDark });
    ctx.restore();
  };
  if (showTop) paintFace('top', x0, topY0, fw, topH);
  paintFace('front', x0, fy0, fw, fh);
  if (!rightSame) {
    paintFace('right', S - RIGHT_FACE_W, rightY0, RIGHT_FACE_W, BLOCK_H - rightY0);
  }

  // 5. Silhouette : uniquement les arêtes libres, pixels à .5 pour un trait net.
  ctx.strokeStyle = shade(color, 0.48);
  ctx.lineWidth = 1;
  ctx.beginPath();

  // Arête nord du dessus : libre seulement sans voisin nord fusionné —
  // avec un voisin nord, le dessus continue depuis le bloc du haut et un
  // trait au milieu du mur casserait l'effet de raccord.
  if (showTop && !northSame) {
    ctx.moveTo(leftSame ? 0 : 0.5, 0.5);
    ctx.lineTo(rightSame ? S : S - 0.5, 0.5);
  }
  const mergeDown = southSame || sittingOn;
  if (!mergeDown) {
    ctx.moveTo(leftSame ? 0 : 0.5, BLOCK_H - 0.5);
    ctx.lineTo(rightSame ? S : S - 0.5, BLOCK_H - 0.5);
  }
  if (!leftSame) {
    ctx.moveTo(0.5, showTop ? 0.5 : 0);
    ctx.lineTo(0.5, mergeDown ? BLOCK_H : BLOCK_H - 0.5);
  }
  if (!rightSame) {
    ctx.moveTo(S - 0.5, showTop ? 0.5 : 0);
    ctx.lineTo(S - 0.5, mergeDown ? BLOCK_H : BLOCK_H - 0.5);
  }
  ctx.stroke();

  ctx.restore();
}

export function drawBlockConnected(ctx, id, tx, ty, world, layer = 1) {
  const cfg = BLOCK_TEXTURES[id];
  const offset = (layer === 2) ? S : 0;
  if (!cfg) {
    ctx.drawImage(getTileCanvas(id), tx * S, ty * S - BLOCK_EXTRUDE - offset);
    return;
  }

  const faces = resolveBlockFaces(world, id, tx, ty, layer);
  drawBlockTileConnected(
    ctx,
    tx * S,
    ty * S - BLOCK_EXTRUDE - offset,
    BLOCK_DEFS[id].color,
    cfg.texture,
    faces,
    cfg.opts,
  );
}
