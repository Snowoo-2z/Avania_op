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

// --- Terre labourée : sillons réguliers, prête à semer ---
function drawFarmland(ctx, rng) {
  ctx.fillStyle = '#5a3f22';
  ctx.fillRect(0, 0, S, S);
  for (let y = 4; y < S; y += 7) {
    ctx.fillStyle = withAlpha('#3a2812', 0.8);
    ctx.fillRect(0, y, S, 3);
    ctx.fillStyle = withAlpha('#7a5a30', 0.6);
    ctx.fillRect(0, y - 1, S, 1);
  }
  ctx.fillStyle = withAlpha('#8a6a3c', 0.5);
  for (let i = 0; i < 6; i++) ctx.fillRect(rng() * S, rng() * S, 2, 2);
}

// --- Blé : un stade de croissance (0 semis → 3 mûr) ---
function makeWheatRaw(stage) {
  const STALK = ['#7a8a3a', '#9aa83a', '#b8b44a', '#d8c26a'];
  const HEAD = ['#9aa83a', '#b8b44a', '#d8c26a', '#e8d47a'];
  return (ctx, x, y, shadow = true) => {
    if (shadow) softShadow(ctx, x, y + 1, 10, 3);
    const n = 4 + stage;          // de 4 à 7 tiges
    const hgt = 8 + stage * 5;    // de 8 à 23 px de haut
    for (let s = 0; s < n; s++) {
      const sx = x - 8 + Math.round(s * (16 / (n - 1)));
      ctx.fillStyle = STALK[stage];
      ctx.fillRect(sx, y - hgt, 1, hgt);
      ctx.fillRect(sx - 1, y - Math.floor(hgt / 2), 1, 2);
      if (stage >= 2) {
        ctx.fillStyle = HEAD[stage];
        ctx.fillRect(sx - 1, y - hgt - 2, 3, 3);
      }
    }
  };
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

// --- Quai : dalles de béton armé, joints et traces d'usage ---
function drawQuayTile(ctx, rng) {
  ctx.fillStyle = BLOCK_DEFS.quay.color;
  ctx.fillRect(0, 0, S, S);
  // dalles coulées : joints en croix, arête plus claire au nord
  ctx.fillStyle = withAlpha('#7f8380', 0.55);
  ctx.fillRect(0, 15, S, 2);
  ctx.fillRect(15, 0, 2, S);
  ctx.fillStyle = withAlpha('#ffffff', 0.16);
  ctx.fillRect(0, 14, S, 1);
  ctx.fillRect(14, 0, 1, S);
  // grain de ciment
  ctx.fillStyle = withAlpha('#8d918c', 0.45);
  for (let i = 0; i < 18; i++) ctx.fillRect(rng() * S, rng() * S, 1.5, 1.5);
  ctx.fillStyle = withAlpha('#dcdfda', 0.32);
  for (let i = 0; i < 9; i++) ctx.fillRect(rng() * S, rng() * S, 1.5, 1.5);
  // cambouis et traces de pneus
  ctx.fillStyle = withAlpha('#5b5f5a', 0.18);
  for (let i = 0; i < 5; i++) ctx.fillRect(rng() * S, rng() * S, 5, 2);
  // anneaux d'amarrage scellés aux quatre coins
  ctx.fillStyle = withAlpha('#6d7470', 0.55);
  ctx.fillRect(3, 3, 3, 3);
  ctx.fillRect(S - 6, 3, 3, 3);
  ctx.fillRect(3, S - 6, 3, 3);
  ctx.fillRect(S - 6, S - 6, 3, 3);
}

// --- Ponton : lames de bois posées au-dessus de l'eau ---
function drawDockTile(ctx, rng) {
  // Le jour entre deux lames laisse voir l'eau en dessous.
  ctx.fillStyle = '#2b4a63';
  ctx.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 8) {
    ctx.fillStyle = BLOCK_DEFS.dock.color;
    ctx.fillRect(0, y, S, 6);
    ctx.fillStyle = withAlpha('#ffffff', 0.11);
    ctx.fillRect(0, y, S, 1);
    ctx.fillStyle = withAlpha('#000000', 0.24);
    ctx.fillRect(0, y + 5, S, 1);
  }
  // veines du bois
  ctx.strokeStyle = withAlpha('#6b4526', 0.42);
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const y = 2 + Math.floor(rng() * 4) * 8;
    ctx.beginPath();
    ctx.moveTo(rng() * 10, y);
    ctx.lineTo(S, y + (rng() < 0.5 ? 0 : 1));
    ctx.stroke();
  }
  // équerres métalliques de maintien
  ctx.fillStyle = '#8d9398';
  ctx.fillRect(0, 3, S, 2);
  ctx.fillRect(0, 19, S, 2);
  ctx.fillStyle = withAlpha('#000000', 0.26);
  ctx.fillRect(0, 5, S, 1);
  ctx.fillRect(0, 21, S, 1);
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
  const bh = BLOCK_H + (opts.rise || 0);
  if (opts.alpha != null) ctx.clearRect(0, 0, S, bh);
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

// Lames de chêne façon Minecraft : la texture 16×16 d'origine échantillonnée
// grossièrement — 4 lames de teintes légèrement différentes, bord sombre en
// bas de lame, liseré clair en haut, veinage ondulé et extrémités de lames.
// Sert au coffre (dessus, face avant, face est, dessous du couvercle) et à
// son icône d'inventaire.
const MC_OAK_ROWS = ['#b8945f', '#c19d67', '#ae8b55', '#b8945f'];
export function mcOakPlanks(ctx, x, y, w, h, rows, opts = {}) {
  const tint = opts.tint ?? 1;
  const rowH = h / rows;
  for (let r = 0; r < rows; r++) {
    const ry = y + r * rowH;
    ctx.fillStyle = shade(MC_OAK_ROWS[r % 4], tint);
    ctx.fillRect(x, ry, w, Math.ceil(rowH));
    // bord sombre bas de la lame + liseré clair en haut
    ctx.fillStyle = withAlpha('#6e4f27', 0.55);
    ctx.fillRect(x, ry + rowH - 1, w, 1);
    ctx.fillStyle = withAlpha('#d8b87e', 0.32);
    ctx.fillRect(x, ry, w, 1);
    // veinage ondulé (deterministe, façon texture MC)
    ctx.strokeStyle = withAlpha('#7a5a2e', 0.42);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 1, ry + rowH * 0.5);
    for (let xx = x + 1; xx < x + w - 1; xx += 2) {
      const wob = (((xx * 7 + r * 13) % 3) - 1) * 0.6;
      ctx.lineTo(xx + 1, ry + rowH * 0.5 + wob);
    }
    ctx.stroke();
    // extrémité de lame (petit trait vertical, position décalée)
    if (rowH >= 4) {
      ctx.fillStyle = withAlpha('#6e4f27', 0.5);
      const endX = x + 4 + ((r * 11 + Math.round(x)) % Math.max(1, w - 8));
      ctx.fillRect(endX, ry + 1, 1, Math.max(1, rowH - 2));
    }
  }
}

function chestEaseOut(t) { return 1 - Math.pow(1 - t, 3); }



function drawChestTile(ctx, openT = 0) {
  const base = BLOCK_DEFS.chest.color;

  ctx.save();
  ctx.translate(0, CHEST_TOP_PAD); // la boîte tient sur 0..40, marge en haut

  // 1. Fond : toute la tuile, zéro trou d'arrière-plan.
  ctx.fillStyle = shade(base, 0.5);
  ctx.fillRect(0, 0, S, BLOCK_H);

  // 2. Face est (biseau) : planches de chêne MC, 4 lames.
  mcOakPlanks(ctx, 26, 2, 6, 38, 4, { tint: 0.66 });

  // 3. Face avant : planches MC + joint « bord du couvercle / corps » +
  //    le petit fermoir en fer, comme la texture chest_front d'origine.
  mcOakPlanks(ctx, 2, 26, 24, 14, 2, { tint: 0.85 });
  // le bord du couvercle (haut) reçoit un peu plus de lumière
  ctx.fillStyle = withAlpha('#ffffff', 0.07);
  ctx.fillRect(2, 26, 24, 4);
  // joint couvercle / corps
  ctx.fillStyle = withAlpha('#4e3818', 0.9);
  ctx.fillRect(2, 30, 24, 1);
  // fermoir en fer (petit, centré, sous le joint — pas de serrure dorée)
  ctx.fillStyle = '#33343a';
  ctx.fillRect(13, 31, 4, 4);
  ctx.fillStyle = '#8b8d92';
  ctx.fillRect(13, 31, 4, 1);
  ctx.fillStyle = '#62646a';
  ctx.fillRect(13, 32, 1, 2);
  ctx.fillStyle = '#26272c';
  ctx.fillRect(15, 32, 2, 2);

  // 4. Dessus : liseré de la boîte + cavité (révélée par l'ouverture).
  ctx.fillStyle = '#a07c48';
  ctx.fillRect(2, 2, 24, 24);
  // liseré sud (bord de la boîte, face lumière)
  ctx.fillStyle = '#b8945f';
  ctx.fillRect(2, 22, 24, 4);
  // cavité : parois sombres (chest_inside_bottom)
  ctx.fillStyle = '#20110a';
  ctx.fillRect(CHEST_CAV.x, CHEST_CAV.y, CHEST_CAV.w, CHEST_CAV.h);
  // fond de la cavité : planches sombres
  const floorRows = [[15, 2, '#3f2812'], [17, 2, '#4a2f15'], [19, 2, '#442b14'], [21, 1, '#38230f']];
  for (const [fy, fh, fc] of floorRows) {
    ctx.fillStyle = fc;
    ctx.fillRect(CHEST_CAV.x, fy, CHEST_CAV.w, fh);
  }
  // ombres intérieures (nord + ouest)
  ctx.fillStyle = withAlpha('#000000', 0.55);
  ctx.fillRect(CHEST_CAV.x, CHEST_CAV.y, CHEST_CAV.w, 3);
  ctx.fillStyle = withAlpha('#000000', 0.3);
  ctx.fillRect(CHEST_CAV.x, 8, CHEST_CAV.w, 2);
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

  // ombre du couvercle sur l'intérieur (sauf quasi ouvert)
  if (t > 0.03 && t < 0.9) {
    const sy = Math.max(CHEST_CAV.y, Math.ceil(Math.min(yBot, CHEST_CAV.y + CHEST_CAV.h)));
    if (sy < 21) {
      ctx.fillStyle = withAlpha('#000000', 0.3 * (1 - t));
      ctx.fillRect(CHEST_CAV.x, sy, CHEST_CAV.w, Math.min(3, 21 - sy));
    }
  }

  // bande du couvercle : planches de chêne MC (4 lames) qui suivent la
  // projection — quand il pivote vers le sud, c'est le dessous (plus
  // clair) qui est visible.
  ctx.save();
  ctx.beginPath();
  ctx.rect(CHEST_LID_L, yA, CHEST_LID_R - CHEST_LID_L, bandH);
  ctx.clip();
  mcOakPlanks(ctx, CHEST_LID_L, yA, CHEST_LID_R - CHEST_LID_L, bandH, 4,
    { tint: 1.02 + 0.1 * t });
  // joint central du couvercle (les deux moitiés) + liseré clair
  const gapY = Math.round(yTop + dy * 0.5);
  ctx.fillStyle = withAlpha('#3a2812', 0.85);
  ctx.fillRect(CHEST_LID_L, gapY, CHEST_LID_R - CHEST_LID_L, 1);
  ctx.fillStyle = withAlpha('#d8b87e', 0.3);
  ctx.fillRect(CHEST_LID_L, gapY + (dy >= 0 ? 1 : -1), CHEST_LID_R - CHEST_LID_L, 1);
  // arête charnière
  ctx.fillStyle = withAlpha('#150a02', 0.5);
  ctx.fillRect(CHEST_LID_L, Math.round(yTop) - (dy >= 0 ? 0 : 1), CHEST_LID_R - CHEST_LID_L, 1);
  // arête soulevée : trait sombre fin de rebord
  const edgeY = dy >= 0 ? Math.round(yBot) - 1 : Math.round(yBot);
  ctx.fillStyle = withAlpha('#150a02', 0.45);
  ctx.fillRect(CHEST_LID_L, edgeY, CHEST_LID_R - CHEST_LID_L, 1);
  ctx.restore();

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
// ------------------------------------------------------------
//  Portes — rendu vertical, extrudé comme les murs.
//  Fermée : haut vantail à planches, pentures fer et poignée anneau.
//  Ouverte : embrasure sombre + vantail rabattu vu de tranche.
// ------------------------------------------------------------

function drawDoorClosed(ctx) {
  const base = BLOCK_DEFS.door.color;
  const H = BLOCK_H;
  const frame = shade(base, 0.66);
  const plankA = shade(base, 1.02);
  const plankB = shade(base, 0.92);
  const hi = shade(base, 1.3);
  const lo = shade(base, 0.55);

  // Corps du vantail : 4 planches verticales alternées.
  for (let p = 0; p < 4; p++) {
    ctx.fillStyle = p % 2 ? plankB : plankA;
    ctx.fillRect(3 + p * 6.5, 2, 6.5, H - 4);
  }
  // Rainures verticales entre planches.
  ctx.fillStyle = lo;
  for (let p = 1; p < 4; p++) ctx.fillRect(3 + p * 6.5 - 0.5, 2, 1, H - 4);

  // Veines du bois : stries verticales + nœuds discrets.
  ctx.strokeStyle = withAlpha('#6a4520', 0.35);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(6, 6); ctx.lineTo(6.5, 12); ctx.lineTo(6, 18);
  ctx.moveTo(16, 20); ctx.lineTo(15.5, 27); ctx.lineTo(16, 34);
  ctx.moveTo(25, 5); ctx.lineTo(25.5, 11);
  ctx.moveTo(22, 30); ctx.lineTo(22.5, 38);
  ctx.stroke();
  ctx.fillStyle = withAlpha('#5a3818', 0.4);
  ctx.fillRect(9, 9, 2, 2);
  ctx.fillRect(20, 26, 2, 2);

  // Deux pentures horizontales en fer (tiers haut / tiers bas) + rivets.
  for (const hy of [8, H - 14]) {
    ctx.fillStyle = '#33333a';
    ctx.fillRect(2, hy, S - 4, 4);
    ctx.fillStyle = withAlpha('#b8b8c2', 0.45);
    ctx.fillRect(2, hy, S - 4, 1);
    ctx.fillStyle = withAlpha('#000000', 0.35);
    ctx.fillRect(2, hy + 3, S - 4, 1);
    ctx.fillStyle = '#5a5a64';
    for (const rx of [6, 15, 24]) ctx.fillRect(rx, hy + 1.5, 1.5, 1.5);
  }

  // Charnières côté gauche (platines de pivot).
  for (const hy of [7, H - 15]) {
    ctx.fillStyle = '#26262c';
    ctx.fillRect(1, hy, 3, 6);
    ctx.fillStyle = withAlpha('#c8c8d2', 0.4);
    ctx.fillRect(1, hy, 1, 6);
  }

  // Poignée anneau côté droit.
  const hx = S - 9, hy2 = Math.round(H / 2) - 2;
  ctx.fillStyle = '#3c2c12';
  ctx.fillRect(hx, hy2, 4, 4); // platine
  ctx.strokeStyle = '#e8c44e';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(hx + 2, hy2 + 4, 2.4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = withAlpha('#fff8d0', 0.7);
  ctx.fillRect(hx + 0.5, hy2 + 1.5, 1, 1);

  // Lumière : arête haute éclairée, pied dans l'ombre.
  ctx.fillStyle = hi;
  ctx.fillRect(2, 1, S - 4, 2);
  ctx.fillStyle = lo;
  ctx.fillRect(2, H - 3, S - 4, 3);
  // Cadre latéral.
  ctx.fillStyle = frame;
  ctx.fillRect(0, 0, 3, H);
  ctx.fillRect(S - 3, 0, 3, H);
  ctx.fillStyle = withAlpha('#ffffff', 0.14);
  ctx.fillRect(2, 0, 1, H);
  ctx.fillRect(S - 4, 0, 1, H);
  // Contour.
  ctx.strokeStyle = shade(base, 0.4);
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, S - 1, H - 1);
}

function drawDoorOpen(ctx) {
  const base = BLOCK_DEFS.door.color;
  const H = BLOCK_H;
  const frame = shade(base, 0.66);

  // Embrasure sombre (intérieur) : dégradé plus noir vers le fond.
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#100c14');
  g.addColorStop(0.7, '#1c1620');
  g.addColorStop(1, '#2a2130');
  ctx.fillStyle = g;
  ctx.fillRect(3, 2, S - 6, H - 2);

  // Seuil : marche claire au bas de l'embrasure.
  ctx.fillStyle = shade(base, 0.8);
  ctx.fillRect(3, H - 4, S - 6, 4);
  ctx.fillStyle = withAlpha('#ffffff', 0.12);
  ctx.fillRect(3, H - 4, S - 6, 1);

  // Vantail rabattu à gauche, vu presque de tranche.
  ctx.fillStyle = shade(base, 0.95);
  ctx.fillRect(3, 2, 6, H - 4);
  ctx.fillStyle = shade(base, 1.18);
  ctx.fillRect(3, 2, 2, H - 4);   // arête qui accroche la lumière
  ctx.fillStyle = shade(base, 0.6);
  ctx.fillRect(8, 2, 1, H - 4);   // ombre du vantail sur l'embrasure
  // Pentures du vantail rabattu.
  ctx.fillStyle = '#33333a';
  ctx.fillRect(3, 8, 6, 3);
  ctx.fillRect(3, H - 14, 6, 3);
  // Poignée.
  ctx.fillStyle = '#e8c44e';
  ctx.fillRect(7, Math.round(H / 2) - 1, 1.5, 3);

  // Cadre latéral + linteau éclairé.
  ctx.fillStyle = frame;
  ctx.fillRect(0, 0, 3, H);
  ctx.fillRect(S - 3, 0, 3, H);
  ctx.fillRect(0, 0, S, 3);
  ctx.fillStyle = shade(base, 1.25);
  ctx.fillRect(0, 0, S, 1.5);
  ctx.fillStyle = withAlpha('#ffffff', 0.14);
  ctx.fillRect(2, 0, 1, H);
  ctx.fillRect(S - 4, 0, 1, H);
  // Contour.
  ctx.strokeStyle = shade(base, 0.4);
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, S - 1, H - 1);
}

function dirtBlockTexture(ctx, top, dark) {
  ctx.fillStyle = withAlpha('#6a4f30', 0.5);
  for (let i = 0; i < 8; i++) {
    ctx.fillRect(5 + ((i * 11) % 18), 5 + ((i * 9) % 18), 3, 2.5);
  }
}

// ------------------------------------------------------------
//  La grotte — textures
//  Une palette froide et sombre, volontairement distincte de la
//  surface : on doit SENTIR qu'on est passé sous la roche.
// ------------------------------------------------------------

// Sol de galerie : gravier et cailloux, avec de rares éclats brillants.
function caveFloorTexture(ctx, rng) {
  ctx.fillStyle = '#453f4d';
  ctx.fillRect(0, 0, S, S);
  // Plages plus claires / plus sombres pour casser l'uniformité.
  for (let i = 0; i < 16; i++) {
    const x = Math.floor(rng() * (S - 8));
    const y = Math.floor(rng() * (S - 8));
    ctx.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.09)';
    ctx.fillRect(x, y, 4 + Math.floor(rng() * 6), 3 + Math.floor(rng() * 5));
  }
  // Cailloux
  for (let i = 0; i < 11; i++) {
    const x = Math.floor(rng() * (S - 4));
    const y = Math.floor(rng() * (S - 3));
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x, y + 2, 4, 2);
    ctx.fillStyle = '#5b5464';
    ctx.fillRect(x, y, 4, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x, y, 4, 1);
  }
  // Éclats de quartz (rares) : donnent vie au sol sans coûter un pixel.
  for (let i = 0; i < 3; i++) {
    if (rng() > 0.55) continue;
    const x = Math.floor(rng() * (S - 2));
    const y = Math.floor(rng() * (S - 2));
    ctx.fillStyle = 'rgba(180,205,235,0.32)';
    ctx.fillRect(x, y, 2, 2);
  }
  // Joint de dalle discret sur les bords (raccord entre tuiles).
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.fillRect(0, S - 1, S, 1);
  ctx.fillRect(S - 1, 0, 1, S);
}

// Paroi rocheuse massive : la roche qui enserre les galeries.
// Rendue comme un SOL solide (voir caveWall) : des milliers de cases
// gratuites, pas des milliers de cubes 2.5D.
function caveWallTexture(ctx, rng) {
  ctx.fillStyle = '#2b2730';
  ctx.fillRect(0, 0, S, S);
  // Facettes de roche : gros blocs irréguliers, éclairés d'en haut.
  for (let i = 0; i < 7; i++) {
    const w = 8 + Math.floor(rng() * 12);
    const h = 6 + Math.floor(rng() * 10);
    const x = Math.floor(rng() * (S - w));
    const y = Math.floor(rng() * (S - h));
    ctx.fillStyle = '#342f3b';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(x, y, w, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.fillRect(x, y + h - 2, w, 2);
    ctx.fillRect(x + w - 1, y, 1, h);
  }
  // Fissures verticales sombres.
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    const x = Math.floor(rng() * S) + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, Math.floor(rng() * 8));
    ctx.lineTo(x + (rng() - 0.5) * 6, S - Math.floor(rng() * 8));
    ctx.stroke();
  }
}

// Falaise de surface : la roche qui affleure et abrite l'entrée.
function rockFaceTexture(ctx, rng) {
  ctx.fillStyle = '#6a6a72';
  ctx.fillRect(0, 0, S, S);
  // Strates horizontales (roche sédimentaire).
  for (let i = 0; i < 5; i++) {
    const y = Math.floor(rng() * S);
    ctx.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.14)';
    ctx.fillRect(0, y, S, 2 + Math.floor(rng() * 3));
  }
  // Blocs saillants.
  for (let i = 0; i < 6; i++) {
    const w = 6 + Math.floor(rng() * 9);
    const h = 5 + Math.floor(rng() * 8);
    const x = Math.floor(rng() * (S - w));
    const y = Math.floor(rng() * (S - h));
    ctx.fillStyle = '#7d7d85';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(x, y, w, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.24)';
    ctx.fillRect(x, y + h - 2, w, 2);
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 2; i++) {
    const x = Math.floor(rng() * S) + 0.5;
    ctx.moveTo(x, 0);
    ctx.lineTo(x + (rng() - 0.5) * 8, S);
  }
  ctx.stroke();
}

// ------------------------------------------------------------
//  Immeubles modernes (Fortune City)
//
//  Un immeuble n'est pas un cube texturé de plus : ses murs MONTEnt
//  au-dessus de leur tuile (option `rise` de BLOCK_TEXTURES) et chaque
//  face est dessinée pour ce qu'elle est — une élévation vitrée côté
//  sud, un toit-terrasse équipé sur le dessus.
//
//  Repères, utiles pour toucher à tout ça :
//   · les étages ont une période de 16 px (la tuile en fait 32), donc
//     ils se raccordent d'un bloc à l'autre sur toute la hauteur d'un
//     mur, même quand un seul bloc montre son toit ;
//   · le bloc qui montre son toit est le HAUT de l'élévation : son
//     `info.y` vaut FRONT_Y (26), contre 0 pour un bloc en plein mur.
//     C'est là que se dessine la corniche ;
//   · les détails (vitres allumées, balcons, château d'eau ou panneaux
//     solaires) sortent d'un mélange des coordonnées de la tuile : pas
//     de hasard, donc deux clients voient exactement la même ville.
// ------------------------------------------------------------

// Mélange déterministe : mêmes coordonnées → mêmes détails.
function hash2(a, b) {
  let h = Math.imul(a + 1013, 0x27d4eb2d) ^ Math.imul(b + 3571, 0x165667b1);
  h ^= h >>> 15;
  return h >>> 0;
}

// Gravier du toit-terrasse : points fixes (sans hasard, sinon deux
// rendus du même bloc ne seraient pas identiques).
const ROOF_GRIT = [
  [3, 4], [9, 2], [16, 5], [22, 3], [27, 8], [6, 10], [13, 12], [20, 9],
  [25, 14], [11, 17], [18, 16], [4, 15], [28, 18], [15, 20], [24, 21], [8, 7],
];

// Un caisson posé sur le toit : capot clair, flanc à l'ombre, ombre portée.
function roofBox(ctx, x, y, w, h, o) {
  ctx.fillStyle = 'rgba(0,0,0,0.20)';
  ctx.fillRect(x + 1, y + h, w, 2);
  ctx.fillStyle = o.unit;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = withAlpha('#ffffff', 0.32);
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y, 1, h);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(x + w - 1, y + 1, 1, h - 1);
}

// Toit-terrasse : dalle gravillonnée, acrotère mouluré, et les
// équipements — climatisation, plus un ouvrage tiré de la tuile.
function roofTerrace(ctx, info, o) {
  const tx = info.tx || 0;
  const ty = info.ty || 0;
  const r = hash2(tx, ty);

  ctx.fillStyle = o.deck;
  ctx.fillRect(info.x, info.y, info.w, info.h);

  ctx.fillStyle = withAlpha(o.grit, 0.5);
  for (const [gx, gy] of ROOF_GRIT) {
    if (gy < info.h - 1 && gx < info.w - 1) ctx.fillRect(info.x + gx, info.y + gy, 2, 1);
  }

  // Acrotère : arête claire au nord/ouest, ombre portée à l'intérieur.
  ctx.fillStyle = withAlpha('#ffffff', 0.5);
  ctx.fillRect(info.x, info.y, info.w, 2);
  ctx.fillRect(info.x, info.y, 2, info.h);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(info.x + 2, info.y + info.h - 2, info.w - 2, 2);
  ctx.fillRect(info.x + info.w - 2, info.y + 2, 2, info.h - 2);

  if (info.h < 16 || info.w < 18) return;

  // Groupe de climatisation : capot, grille et ombre.
  roofBox(ctx, info.x + 4, info.y + 4, 11, 8, o);
  ctx.fillStyle = o.vent;
  ctx.fillRect(info.x + 6, info.y + 6, 7, 4);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  for (let x = info.x + 7; x < info.x + 12; x += 2) ctx.fillRect(x, info.y + 6, 1, 4);

  // Le second ouvrage change d'une tuile à l'autre : une toiture
  // d'immeuble n'est jamais tout à fait la même.
  const kind = r % 3;
  if (kind === 0) {
    // Château d'eau : fût sombre, couvercle clair.
    const cx = info.x + 19, cy = info.y + 3;
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    ctx.fillRect(cx + 1, cy + 14, 7, 2);
    ctx.fillStyle = o.tank;
    ctx.fillRect(cx, cy, 7, 14);
    ctx.fillStyle = withAlpha('#ffffff', 0.30);
    ctx.fillRect(cx, cy, 7, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(cx + 5, cy + 2, 2, 12);
  } else if (kind === 1) {
    // Gaine de désenfumage.
    roofBox(ctx, info.x + 19, info.y + 6, 7, 7, o);
    ctx.fillStyle = o.vent;
    ctx.fillRect(info.x + 21, info.y + 8, 3, 3);
  } else {
    // Panneaux solaires : deux cadres bleutés, inclinés vers le sud.
    for (let i = 0; i < 2; i++) {
      const px = info.x + 18 + i * 5;
      ctx.fillStyle = o.panel;
      ctx.fillRect(px, info.y + 4, 4, 11);
      ctx.fillStyle = withAlpha('#ffffff', 0.22);
      ctx.fillRect(px, info.y + 4, 4, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      for (let y = info.y + 7; y < info.y + 14; y += 3) ctx.fillRect(px, y, 4, 1);
    }
  }
}

// Une élévation complète : corniche en tête, étages vitrés, soubassement.
// `info.y` vaut FRONT_Y sur le bloc de tête (haut du mur) et 0 ailleurs :
// c'est ce qui place la corniche au bon endroit.
function drawElevation(ctx, info, o) {
  const yTop = info.y;
  const yBot = info.y + info.h;
  const tx = info.tx || 0;
  const ty = info.ty || 0;

  for (let y = 0; y < yBot; y += 16) {
    const floor = y / 16;
    const h = hash2(tx * 31 + floor, ty * 17 + floor * 7);

    // Dalle d'étage.
    if (y + 3 <= yBot) {
      ctx.fillStyle = o.slab;
      ctx.fillRect(info.x, y, info.w, Math.min(3, yBot - y));
    }

    const gy = y + 3;
    const gh = Math.min(9, yBot - gy);
    if (gh > 0) {
      ctx.fillStyle = o.glass;
      ctx.fillRect(info.x, gy, info.w, gh);

      // Une vitre allumée de temps en temps : la ville vit, même de jour.
      if (h % 5 === 0) {
        const pane = (h >>> 3) % 4;
        ctx.fillStyle = o.lit;
        ctx.fillRect(info.x + pane * 8 + 1, gy + 1, 6, Math.max(1, gh - 3));
      }

      // Deux reflets en biais : escalier de 6 px, sans dégradé (ce bloc
      // est redessiné à chaque image, autant rester léger).
      ctx.fillStyle = o.shine;
      for (const off of [2, 17]) {
        ctx.beginPath();
        ctx.moveTo(info.x + off, gy + gh);
        ctx.lineTo(info.x + off + 6, gy + gh);
        ctx.lineTo(info.x + off + 6 + gh, gy);
        ctx.lineTo(info.x + off + gh, gy);
        ctx.closePath();
        ctx.fill();
      }

      // Meneaux verticaux : la trame du mur-rideau.
      ctx.fillStyle = o.mullion;
      for (let x = info.x + 7; x < info.x + info.w; x += 8) ctx.fillRect(x, gy, 1, gh);

      // Balcon, sur un étage sur trois : garde-corps et barreaux.
      if (h % 3 === 0 && gh >= 5) {
        ctx.fillStyle = withAlpha('#ffffff', 0.22);
        ctx.fillRect(info.x, gy + gh - 2, info.w, 1);
        for (let x = info.x + 2; x < info.x + info.w - 1; x += 4) ctx.fillRect(x, gy + gh - 4, 1, 3);
      }
    }

    // Joint creux sous la dalle : l'ombre portée de l'étage.
    if (y + 12 < yBot) {
      ctx.fillStyle = 'rgba(0,0,0,0.24)';
      ctx.fillRect(info.x, y + 12, info.w, 2);
    }
  }

  // Corniche : bandeau saillant, arête claire et ombre dessous.
  if (yTop >= 16) {
    ctx.fillStyle = o.cornice;
    ctx.fillRect(info.x, yTop, info.w, 5);
    ctx.fillStyle = withAlpha('#ffffff', 0.42);
    ctx.fillRect(info.x, yTop, info.w, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.fillRect(info.x, yTop + 5, info.w, 2);
  }

  // Soubassement : le pied du mur, plus sombre, ancre le bâtiment au sol.
  const baseTop = Math.max(yTop, yBot - 7);
  if (yBot - baseTop > 0) {
    ctx.fillStyle = o.plinth;
    ctx.fillRect(info.x, baseTop, info.w, yBot - baseTop);
    ctx.fillStyle = withAlpha('#ffffff', 0.16);
    ctx.fillRect(info.x, baseTop, info.w, 1);
  }
}

// Mur moderne (immeuble de rapport) : béton clair, bandes vitrées bleues.
function modernWallTexture(ctx, face, info) {
  if (face === 'top') {
    roofTerrace(ctx, info, {
      deck: '#c9d1d7', grit: '#8d979f', unit: '#aeb7be', vent: '#6f7a82',
      tank: '#9aa3aa', panel: '#2f4f6d',
    });
    return;
  }
  drawElevation(ctx, info, {
    cornice: '#eef2f4',
    slab: '#e7ecef',
    glass: '#2b4c68',
    shine: 'rgba(198,232,250,0.20)',
    mullion: 'rgba(240,247,251,0.55)',
    lit: 'rgba(255,206,120,0.50)',
    plinth: '#a3aeb5',
  });
  if (face === 'right') {
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    ctx.fillRect(info.x, info.y, info.w, info.h);
  }
}

// Tour vitrée : mur-rideau intégral, reflets froids, trois blocs de haut.
function glassTowerTexture(ctx, face, info) {
  if (face === 'top') {
    roofTerrace(ctx, info, {
      deck: '#5b6874', grit: '#2f3943', unit: '#7a8894', vent: '#3b4650',
      tank: '#6c7883', panel: '#1b3a52',
    });
    return;
  }
  drawElevation(ctx, info, {
    cornice: '#dbe6ee',
    slab: '#cdd9e2',
    glass: '#17364f',
    shine: 'rgba(190,228,250,0.28)',
    mullion: 'rgba(233,244,252,0.72)',
    lit: 'rgba(255,214,140,0.55)',
    plinth: '#39454f',
  });
  if (face === 'right') {
    ctx.fillStyle = 'rgba(0,0,0,0.24)';
    ctx.fillRect(info.x, info.y, info.w, info.h);
  }
}

const DRAWERS = {
  caveFloor: (c, r) => caveFloorTexture(c, r),
  caveWall:  (c, r) => caveWallTexture(c, r),
  rockFace:  (c, r) => rockFaceTexture(c, r),
  grass:     (c, r) => drawGrass(c, r, BLOCK_DEFS.grass.color),
  grassDark: (c, r) => drawGrass(c, r, BLOCK_DEFS.grassDark.color),
  flowers:   (c, r) => drawFlowers(c, r),
  dirt:      (c, r) => drawDirt(c, r),
  farmland:  (c, r) => drawFarmland(c, r),
  sand:      (c, r) => drawSand(c, r),
  quay:      (c, r) => drawQuayTile(c, r),
  dock:      (c, r) => drawDockTile(c, r),
  wood:      (c) => drawBlockTile(c, BLOCK_DEFS.wood.color, woodGrain),
  stone:     (c) => drawBlockTile(c, BLOCK_DEFS.stone.color, stoneTexture),
  plank:     (c) => drawBlockTile(c, BLOCK_DEFS.plank.color, plankTexture),
  brick:     (c) => drawBlockTile(c, BLOCK_DEFS.brick.color, brickTexture),
  glass:     (c) => drawBlockTile(c, BLOCK_DEFS.glass.color, glassTexture, { alpha: 0.78, shine: 0.45 }),
  wallModern: (c) => drawBlockTile(c, BLOCK_DEFS.wallModern.color, modernWallTexture, { rise: 30 }),
  wallGlass:  (c) => drawBlockTile(c, BLOCK_DEFS.wallGlass.color, glassTowerTexture, { rise: 46 }),
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
    const rise = (BLOCK_TEXTURES[key] && BLOCK_TEXTURES[key].opts.rise) || 0;
    const h = (isExtrudedBlock(key) || key === 'door' || key === 'doorOpen')
      ? S + BLOCK_EXTRUDE + rise
      : S;
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
  // Lumière venant du nord-ouest : l'ombre de contact se décale un peu
  // vers le sud-est et s'y étire, pour un ancrage directionnel cohérent.
  const ox = 2, oy = 1.5;
  const g = ctx.createRadialGradient(cx + ox, cy + oy, 2, cx + ox, cy + oy, w);
  g.addColorStop(0, 'rgba(0,0,0,0.32)');
  g.addColorStop(0.7, 'rgba(0,0,0,0.18)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx + ox, cy + oy, w, h, 0, 0, Math.PI * 2);
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

// ------------------------------------------------------------
//  Les ressources de la grotte : pierre et fer, mais avec un look
//  bien à elles (roche froide, arêtes vives, veines lumineuses).
//  On doit reconnaître au premier coup d'œil qu'on est sous terre.
// ------------------------------------------------------------

// Pierre de grotte : amas de roches anguleuses, gris froid violacé,
// avec un léger liseré bleuté sur les arêtes hautes.
function drawCaveStoneObjectRaw(ctx, x, y, shadow = true) {
  if (shadow) softShadow(ctx, x, y + 1, 15, 5);
  // Blocs empilés, de plus en plus clairs vers le haut.
  voxel(ctx, x - 14, y - 16, 28, 17, '#4e485a');
  voxel(ctx, x - 11, y - 24, 22, 18, '#5f586e');
  voxel(ctx, x - 6, y - 30, 13, 8, '#736b82');
  // Arêtes froides : un liseré bleuté sur le dessus, façon cristal.
  ctx.fillStyle = 'rgba(150,175,225,0.35)';
  ctx.fillRect(x - 6, y - 30, 13, 2);
  ctx.fillRect(x - 11, y - 24, 3, 2);
  ctx.fillRect(x + 6, y - 24, 5, 2);
  // Pointe cristalline plantée dans la roche.
  ctx.fillStyle = '#8fa3d8';
  ctx.beginPath();
  ctx.moveTo(x + 1, y - 30);
  ctx.lineTo(x + 5, y - 30);
  ctx.lineTo(x + 3, y - 37);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillRect(x + 2, y - 35, 1, 5);
  // Fissures sombres.
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - 10, y - 10); ctx.lineTo(x - 3, y - 15); ctx.lineTo(x - 6, y - 6);
  ctx.moveTo(x + 5, y - 20); ctx.lineTo(x + 10, y - 13);
  ctx.stroke();
}

// Filon de fer : roche sombre traversée de veines de fer brillantes.
// Beaucoup plus lisible que le minerai de surface — sous terre, c'est
// LA ressource qui compte.
function drawCaveIronObjectRaw(ctx, x, y, shadow = true) {
  if (shadow) softShadow(ctx, x, y + 1, 15, 5);
  voxel(ctx, x - 14, y - 17, 28, 18, '#443f4c');
  voxel(ctx, x - 11, y - 25, 22, 18, '#544e5e');
  voxel(ctx, x - 6, y - 30, 13, 7, '#665f72');

  // Veines de fer : filaments épais aux contours sombres.
  const VEIN = '#d9a06a';
  const VEIN_HI = '#f6d3a4';
  const VEIN_OUT = '#5d3a20';
  const veins = [
    [x - 11, y - 19, 12, 4], [x + 1, y - 24, 10, 4], [x - 7, y - 27, 8, 3],
    [x - 3, y - 12, 11, 4], [x + 6, y - 16, 6, 3],
  ];
  for (const [vx, vy, vw, vh] of veins) {
    ctx.fillStyle = VEIN_OUT;
    ctx.fillRect(vx - 1, vy - 1, vw + 2, vh + 2);
    ctx.fillStyle = VEIN;
    ctx.fillRect(vx, vy, vw, vh);
    ctx.fillStyle = VEIN_HI;
    ctx.fillRect(vx, vy, vw, 1);
  }
  // Pépite centrale taillée, bien visible.
  ctx.fillStyle = VEIN_OUT;
  ctx.fillRect(x - 4, y - 21, 9, 8);
  ctx.fillStyle = VEIN;
  ctx.fillRect(x - 3, y - 20, 7, 6);
  ctx.fillStyle = VEIN_HI;
  ctx.fillRect(x - 3, y - 20, 7, 2);
  ctx.fillStyle = '#fff2dd';
  ctx.fillRect(x - 2, y - 19, 3, 1);

  ctx.fillStyle = 'rgba(150,175,225,0.28)';
  ctx.fillRect(x - 6, y - 30, 13, 2);
}

// Filon de diamant : même roche sombre que le fer, mais piquée de gemmes
// bleu-vert lumineuses. Beaucoup plus rare, réservé à la profondeur 2+.
function drawCaveDiamondObjectRaw(ctx, x, y, shadow = true) {
  if (shadow) softShadow(ctx, x, y + 1, 15, 5);
  voxel(ctx, x - 14, y - 17, 28, 18, '#3f3a47');
  voxel(ctx, x - 11, y - 25, 22, 18, '#4d4759');
  voxel(ctx, x - 6, y - 30, 13, 7, '#5d5670');

  const GEM = '#4fd6e8';
  const GEM_HI = '#b9f4fb';
  const GEM_OUT = '#0e5a68';
  const gems = [
    [x - 10, y - 19, 5, 4], [x + 2, y - 24, 5, 4], [x - 5, y - 27, 4, 3],
    [x - 2, y - 12, 6, 4], [x + 6, y - 16, 4, 3],
  ];
  for (const [gx, gy, gw, gh] of gems) {
    ctx.fillStyle = GEM_OUT;
    ctx.fillRect(gx - 1, gy - 1, gw + 2, gh + 2);
    ctx.fillStyle = GEM;
    ctx.fillRect(gx, gy, gw, gh);
    ctx.fillStyle = GEM_HI;
    ctx.fillRect(gx, gy, gw, 1);
  }
  // Gemme centrale facettée, très brillante.
  ctx.fillStyle = GEM_OUT;
  ctx.fillRect(x - 4, y - 21, 9, 8);
  ctx.fillStyle = GEM;
  ctx.fillRect(x - 3, y - 20, 7, 6);
  ctx.fillStyle = GEM_HI;
  ctx.fillRect(x - 3, y - 20, 7, 2);
  ctx.fillStyle = '#eafeff';
  ctx.fillRect(x - 2, y - 19, 3, 1);

  ctx.fillStyle = 'rgba(120,220,240,0.30)';
  ctx.fillRect(x - 6, y - 30, 13, 2);
}

// Filon de charbon : même roche que les autres filons, piquée de pépites
// noires mates aux rares reflets gris. Le minerai de base, dès le niveau 1.
function drawCaveCoalObjectRaw(ctx, x, y, shadow = true) {
  if (shadow) softShadow(ctx, x, y + 1, 15, 5);
  voxel(ctx, x - 14, y - 17, 28, 18, '#443f4c');
  voxel(ctx, x - 11, y - 25, 22, 18, '#544e5e');
  voxel(ctx, x - 6, y - 30, 13, 7, '#665f72');

  const COAL = '#17171c';
  const COAL_HI = '#4a4a55';
  const COAL_OUT = '#000000';
  const nuggets = [
    [x - 11, y - 19, 6, 4], [x + 2, y - 24, 6, 4], [x - 5, y - 27, 5, 3],
    [x - 2, y - 12, 7, 4], [x + 6, y - 16, 4, 3],
  ];
  for (const [gx, gy, gw, gh] of nuggets) {
    ctx.fillStyle = COAL_OUT;
    ctx.fillRect(gx - 1, gy - 1, gw + 2, gh + 2);
    ctx.fillStyle = COAL;
    ctx.fillRect(gx, gy, gw, gh);
    ctx.fillStyle = COAL_HI;
    ctx.fillRect(gx, gy, gw, 1);
  }
  // Pépite centrale mate, à peine luisante.
  ctx.fillStyle = COAL_OUT;
  ctx.fillRect(x - 4, y - 21, 9, 8);
  ctx.fillStyle = COAL;
  ctx.fillRect(x - 3, y - 20, 7, 6);
  ctx.fillStyle = COAL_HI;
  ctx.fillRect(x - 3, y - 20, 7, 2);
  ctx.fillStyle = '#6a6a78';
  ctx.fillRect(x - 2, y - 19, 2, 1);
}

// Torche posée : manche de bois + tête charbonneuse. La flamme, elle,
// est animée par-dessus à chaque frame (js/game.js) pour vaciller.
function drawTorchRaw(ctx, x, y, shadow = true) {
  if (shadow) softShadow(ctx, x, y + 1, 7, 3);
  // Manche incliné.
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.06);
  ctx.fillStyle = '#6a4520';
  ctx.fillRect(-1.5, -14, 3, 14);
  ctx.fillStyle = '#8a5f30';
  ctx.fillRect(-1.5, -14, 1, 14);
  // Ligature sous la tête.
  ctx.fillStyle = '#3c2c12';
  ctx.fillRect(-2, -16, 4, 2);
  // Tête charbonneuse.
  ctx.fillStyle = '#17171c';
  ctx.fillRect(-2.5, -20, 5, 5);
  ctx.fillStyle = '#4a4a55';
  ctx.fillRect(-2.5, -20, 5, 1);
  ctx.restore();
}

// Panneau de bois posé : poteau + planche claire encadrée, volontairement
// vierge — le texte est dessiné par-dessus à chaque frame (js/game.js).
function drawSignRaw(ctx, x, y, shadow = true) {
  if (shadow) softShadow(ctx, x, y + 1, 8, 3);
  // Poteau.
  ctx.fillStyle = '#6a4520';
  ctx.fillRect(x - 1.5, y - 12, 3, 12);
  ctx.fillStyle = '#8a5f30';
  ctx.fillRect(x - 1.5, y - 12, 1, 12);
  // Planche : cadre sombre + fond clair lisible pour le texte.
  ctx.fillStyle = '#5a3818';
  ctx.fillRect(x - 14, y - 26, 28, 16);
  ctx.fillStyle = '#d8b878';
  ctx.fillRect(x - 13, y - 25, 26, 14);
  // Veines horizontales discrètes.
  ctx.fillStyle = 'rgba(106,69,32,0.25)';
  ctx.fillRect(x - 13, y - 21, 26, 1);
  ctx.fillRect(x - 13, y - 16, 26, 1);
  // Reflet haut.
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(x - 13, y - 25, 26, 1);
  // Clous aux coins.
  ctx.fillStyle = '#3c2c12';
  ctx.fillRect(x - 12, y - 24, 1.5, 1.5);
  ctx.fillRect(x + 10.5, y - 24, 1.5, 1.5);
  ctx.fillRect(x - 12, y - 13, 1.5, 1.5);
  ctx.fillRect(x + 10.5, y - 13, 1.5, 1.5);
}

// Étals de vente (sellers) : comptoir + auvent rayé, déclinés en trois
// niveaux de matériau (bois → fer → diamant). Le contenu et le prix sont
// gérés par le panneau (js/ui.js), le sprite reste décoratif.
function drawSellerRaw(tier) {
  const AWNING = { 1: ['#c89a5e', '#a87940'], 2: ['#9aa3ab', '#6d7880'], 3: ['#4fd6e8', '#2a92a6'] }[tier];
  return (ctx, x, y, shadow = true) => {
    if (shadow) softShadow(ctx, x, y + 1, 14, 4);
    // Pieds du comptoir.
    ctx.fillStyle = '#5a3818';
    ctx.fillRect(x - 12, y - 8, 3, 8);
    ctx.fillRect(x + 9, y - 8, 3, 8);
    // Corps du comptoir.
    ctx.fillStyle = tier === 1 ? '#8a5f30' : tier === 2 ? '#7d8890' : '#2a92a6';
    ctx.fillRect(x - 13, y - 14, 26, 7);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(x - 13, y - 9, 26, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x - 13, y - 14, 26, 1);
    // Marchandise posée : trois petits tas.
    ctx.fillStyle = '#d8c26a';
    ctx.fillRect(x - 10, y - 17, 5, 3);
    ctx.fillStyle = '#b0875f';
    ctx.fillRect(x - 2, y - 17, 5, 3);
    ctx.fillStyle = '#9aa83a';
    ctx.fillRect(x + 6, y - 17, 4, 3);
    // Poteaux de l'auvent.
    ctx.fillStyle = '#5a3818';
    ctx.fillRect(x - 13, y - 30, 2, 16);
    ctx.fillRect(x + 11, y - 30, 2, 16);
    // Auvent rayé, bord festonné.
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = AWNING[i % 2];
      ctx.fillRect(x - 14 + i * 5, y - 30, 5, 6);
      ctx.fillRect(x - 14 + i * 5, y - 24, 3, 2);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(x - 14, y - 30, 30, 1);
    // Écusson de niveau sur le comptoir.
    ctx.fillStyle = tier === 3 ? '#b9f4fb' : tier === 2 ? '#d3dade' : '#e8c44e';
    ctx.fillRect(x - 2, y - 12, 4, 3);
  };
}

// Entrée de la grotte (surface) : arche de roche sombre ouvrant sur
// le noir. Le sprite déborde largement de sa tuile pour qu'on la voie
// de loin — c'est un point de repère du monde.
function drawCaveMouthObjectRaw(ctx, x, y, shadow = true) {
  if (shadow) softShadow(ctx, x, y + 2, 30, 8);

  // Masse rocheuse en arrière-plan.
  voxel(ctx, x - 30, y - 52, 60, 54, '#5c5c64');
  voxel(ctx, x - 26, y - 62, 52, 46, '#6a6a72');
  voxel(ctx, x - 18, y - 70, 36, 14, '#7d7d85');
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(x - 18, y - 70, 36, 3);

  // Ouverture : arche pleine de noir, dégradée vers le bas.
  const mouthW = 30;
  const mouthH = 38;
  const mx = x - mouthW / 2;
  const my = y - mouthH;
  ctx.fillStyle = '#08070c';
  ctx.beginPath();
  ctx.moveTo(mx, y);
  ctx.lineTo(mx, my + 12);
  ctx.quadraticCurveTo(x, my - 6, mx + mouthW, my + 12);
  ctx.lineTo(mx + mouthW, y);
  ctx.closePath();
  ctx.fill();
  // Profondeur : un second voile encore plus noir au fond de l'arche.
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.moveTo(mx + 6, y);
  ctx.lineTo(mx + 6, my + 16);
  ctx.quadraticCurveTo(x, my + 4, mx + mouthW - 6, my + 16);
  ctx.lineTo(mx + mouthW - 6, y);
  ctx.closePath();
  ctx.fill();

  // Lèvre de roche autour de l'ouverture (cadre clair en haut).
  ctx.strokeStyle = '#84848c';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(mx, my + 12);
  ctx.quadraticCurveTo(x, my - 6, mx + mouthW, my + 12);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(mx + 1, my + 15);
  ctx.quadraticCurveTo(x, my - 2, mx + mouthW - 1, my + 15);
  ctx.stroke();

  // Quelques pierres au pied de l'arche.
  voxel(ctx, x - 24, y - 9, 9, 9, '#6a6a72');
  voxel(ctx, x + 16, y - 7, 8, 7, '#5c5c64');
  voxel(ctx, x - 3, y - 5, 7, 5, '#51515a');
}

// Puits descendant : trou noir d'où part une échelle de corde.
function drawCaveLadderDownRaw(ctx, x, y, shadow = true) {
  if (shadow) softShadow(ctx, x, y + 2, 18, 6);
  // Margelle de pierre.
  voxel(ctx, x - 17, y - 12, 34, 13, '#4b4553');
  ctx.fillStyle = '#5d566a';
  ctx.fillRect(x - 17, y - 12, 34, 3);
  // Le trou.
  ctx.fillStyle = '#0a0910';
  ctx.beginPath();
  ctx.ellipse(x, y - 8, 12, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.ellipse(x, y - 7.5, 9, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Échelle de corde qui disparaît dans le noir.
  ctx.strokeStyle = '#a3825a';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x - 5, y - 13); ctx.lineTo(x - 5, y - 3);
  ctx.moveTo(x + 5, y - 13); ctx.lineTo(x + 5, y - 3);
  ctx.stroke();
  ctx.strokeStyle = '#c2a075';
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 3; i++) {
    const ry = y - 12 + i * 3.4;
    ctx.beginPath();
    ctx.moveTo(x - 5, ry);
    ctx.lineTo(x + 5, ry);
    ctx.stroke();
  }
  // Flèche vers le bas (lisibilité immédiate de l'action).
  ctx.fillStyle = '#f2c14e';
  ctx.beginPath();
  ctx.moveTo(x, y - 26);
  ctx.lineTo(x + 5, y - 32);
  ctx.lineTo(x - 5, y - 32);
  ctx.closePath();
  ctx.fill();
}

// Puits remontant : la lumière du jour tombe dans la grotte.
function drawCaveLadderUpRaw(ctx, x, y, shadow = true) {
  if (shadow) softShadow(ctx, x, y + 2, 18, 6);
  voxel(ctx, x - 17, y - 12, 34, 13, '#4b4553');
  ctx.fillStyle = '#5d566a';
  ctx.fillRect(x - 17, y - 12, 34, 3);
  // Puits éclairé : dégradé du bleu pâle vers le sombre.
  ctx.fillStyle = '#22303f';
  ctx.beginPath();
  ctx.ellipse(x, y - 8, 12, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#9fc4dd';
  ctx.beginPath();
  ctx.ellipse(x, y - 9, 7.5, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#dceef8';
  ctx.beginPath();
  ctx.ellipse(x, y - 9.5, 4, 2.2, 0, 0, Math.PI * 2);
  ctx.fill();
  // Échelle.
  ctx.strokeStyle = '#a3825a';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x - 5, y - 14); ctx.lineTo(x - 5, y - 2);
  ctx.moveTo(x + 5, y - 14); ctx.lineTo(x + 5, y - 2);
  ctx.stroke();
  ctx.strokeStyle = '#c2a075';
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 4; i++) {
    const ry = y - 13 + i * 3.4;
    ctx.beginPath();
    ctx.moveTo(x - 5, ry);
    ctx.lineTo(x + 5, ry);
    ctx.stroke();
  }
  // Flèche vers le haut.
  ctx.fillStyle = '#9fd0ff';
  ctx.beginPath();
  ctx.moveTo(x, y - 34);
  ctx.lineTo(x + 5, y - 28);
  ctx.lineTo(x - 5, y - 28);
  ctx.closePath();
  ctx.fill();
}

// ------------------------------------------------------------
//  Le port (côte est) : grue, conteneurs, bollards, phare, ferry.
//  Décor de monde généré par js/harbor.js. Même écriture « voxel »
//  que les arbres et les rochers pour rester cohérent avec le reste.
// ------------------------------------------------------------

// Grue de quai : portique sur rails, flèche tendue au-dessus de l'eau.
function drawCraneRaw(ctx, x, y, shadow = true) {
  const steel = '#6d747b';
  const steelDark = '#4a5158';
  const yellow = '#d8a12c';
  const yellowDark = '#a87a1c';
  if (shadow) softShadow(ctx, x, y + 2, 22, 7);
  // deux boggies sur rails, bandes de sécurité
  voxel(ctx, x - 20, y - 8, 12, 8, steel);
  voxel(ctx, x + 8, y - 8, 12, 8, steel);
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = yellow;
    ctx.fillRect(x - 20 + i * 4, y - 6, 2, 5);
    ctx.fillRect(x + 8 + i * 4, y - 6, 2, 5);
  }
  // montants en treillis
  voxel(ctx, x - 15, y - 44, 5, 36, steel);
  voxel(ctx, x + 10, y - 44, 5, 36, steel);
  ctx.strokeStyle = steelDark;
  ctx.lineWidth = 1.3;
  for (let i = 0; i < 6; i++) {
    const yy = y - 12 - i * 6;
    ctx.beginPath();
    ctx.moveTo(x - 15, yy); ctx.lineTo(x + 15, yy - 6);
    ctx.moveTo(x + 15, yy); ctx.lineTo(x - 15, yy - 6);
    ctx.stroke();
  }
  // poutre de portique + flèche
  voxel(ctx, x - 18, y - 50, 36, 6, yellow);
  voxel(ctx, x - 18, y - 56, 46, 5, yellow);
  ctx.fillStyle = yellowDark;
  ctx.fillRect(x - 18, y - 45, 36, 2);
  ctx.strokeStyle = steelDark;
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(x + 6, y - 56); ctx.lineTo(x - 10, y - 50); ctx.stroke();
  // cabine du grutier
  voxel(ctx, x - 6, y - 44, 11, 10, '#e2e5e1');
  ctx.fillStyle = '#22303a'; ctx.fillRect(x - 5, y - 42, 9, 5);
  ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(x - 5, y - 42, 9, 2);
  // câble et palonnier
  ctx.strokeStyle = '#3a4147';
  ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(x + 18, y - 51); ctx.lineTo(x + 18, y - 30); ctx.stroke();
  voxel(ctx, x + 13, y - 30, 10, 6, '#8d9398');
  // feu de balisage
  ctx.fillStyle = '#e05a3c'; ctx.fillRect(x - 19, y - 58, 3, 3);
}

// Conteneur maritime : tôle ondulée, coins ISO, portes.
function makeContainerRaw(base, light, dark) {
  return (ctx, x, y, shadow = true) => {
    if (shadow) softShadow(ctx, x, y + 1, 15, 5);
    voxel(ctx, x - 15, y - 20, 30, 20, base);      // face avant
    ctx.fillStyle = light;                          // toit
    ctx.fillRect(x - 15, y - 26, 30, 6);
    ctx.fillStyle = withAlpha('#ffffff', 0.18);
    ctx.fillRect(x - 15, y - 26, 30, 2);
    ctx.fillStyle = dark;
    ctx.fillRect(x - 15, y - 21, 30, 1);
    // nervures de tôle
    ctx.fillStyle = withAlpha('#000000', 0.16);
    for (let i = -12; i < 15; i += 5) ctx.fillRect(x + i, y - 19, 2, 15);
    ctx.fillStyle = withAlpha('#ffffff', 0.10);
    for (let i = -11; i < 15; i += 5) ctx.fillRect(x + i, y - 19, 1, 15);
    ctx.fillStyle = withAlpha('#000000', 0.14);
    for (let i = -11; i < 15; i += 4) ctx.fillRect(x + i, y - 25, 1, 4);
    // pièces de coin
    ctx.fillStyle = dark;
    ctx.fillRect(x - 15, y - 26, 3, 3);
    ctx.fillRect(x + 12, y - 26, 3, 3);
    ctx.fillRect(x - 15, y - 4, 3, 4);
    ctx.fillRect(x + 12, y - 4, 3, 4);
    // joint de portes + marquage
    ctx.fillStyle = withAlpha('#000000', 0.28);
    ctx.fillRect(x - 1, y - 19, 2, 16);
    ctx.fillStyle = withAlpha('#ffffff', 0.22);
    ctx.fillRect(x - 11, y - 24, 7, 1);
    ctx.fillRect(x + 4, y - 24, 5, 1);
  };
}

// Bollard d'amarrage : petit, on marche dessus.
function drawBollardRaw(ctx, x, y, shadow = true) {
  if (shadow) softShadow(ctx, x, y + 1, 8, 3);
  ctx.fillStyle = '#4a5158';
  ctx.fillRect(x - 7, y - 5, 14, 5);
  ctx.fillStyle = '#5c6266';
  ctx.fillRect(x - 7, y - 5, 14, 2);
  voxel(ctx, x - 5, y - 13, 10, 9, '#8d9398');   // fût
  voxel(ctx, x - 7, y - 18, 14, 6, '#a2a8ad');   // tête
  ctx.fillStyle = '#6d747b';                      // traversin
  ctx.fillRect(x - 9, y - 20, 18, 3);
  ctx.fillStyle = 'rgba(255,255,255,0.30)';
  ctx.fillRect(x - 6, y - 18, 5, 2);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x - 7, y - 1, 14, 2);
}

// Phare : socle rocheux, tour blanche à bandes rouges, lanterne allumée.
function drawLighthouseRaw(ctx, x, y, shadow = true) {
  if (shadow) softShadow(ctx, x, y + 1, 18, 6);
  const white = '#eceff0';
  const red = '#c0453c';
  // socle
  voxel(ctx, x - 17, y - 12, 34, 14, '#6a6a72');
  ctx.fillStyle = '#7d7d85';
  ctx.fillRect(x - 17, y - 12, 34, 3);
  // fût, en trois tronçons
  voxel(ctx, x - 12, y - 32, 24, 20, white);
  ctx.fillStyle = red; ctx.fillRect(x - 12, y - 26, 24, 6);
  voxel(ctx, x - 10, y - 50, 20, 18, white);
  ctx.fillStyle = red; ctx.fillRect(x - 10, y - 43, 20, 5);
  voxel(ctx, x - 8, y - 64, 16, 14, white);
  // galerie et rambarde
  voxel(ctx, x - 12, y - 70, 24, 6, '#8d9398');
  ctx.fillStyle = '#b6bbbe';
  ctx.fillRect(x - 12, y - 70, 24, 2);
  ctx.fillStyle = '#6d747b';
  for (let i = -10; i <= 10; i += 5) ctx.fillRect(x + i, y - 68, 1, 5);
  // lanterne
  voxel(ctx, x - 7, y - 82, 14, 12, '#2b3a44');
  ctx.fillStyle = '#ffd98a';
  ctx.fillRect(x - 5, y - 80, 10, 8);
  ctx.fillStyle = '#fff3cf';
  ctx.fillRect(x - 4, y - 79, 4, 6);
  // toit
  voxel(ctx, x - 8, y - 88, 16, 6, red);
  // halo lumineux
  ctx.fillStyle = 'rgba(255,214,130,0.16)';
  ctx.beginPath(); ctx.arc(x, y - 76, 17, 0, Math.PI * 2); ctx.fill();
}

// Gabarit du ferry : 5 × 5 tuiles, pour qu'il porte vraiment à côté du quai.
// Le SVG et le repli procédural sont tous les deux rendus à cette taille.
export const BOAT_SPRITE_SIZE = 160;

// Ferry (solution de repli, dessinée en code) : tracé à l'échelle 96 puis
// agrandi au gabarit courant, autour de son point d'ancrage.
function drawFerryFallbackScaled(ctx, x, y, shadow = true) {
  const k = BOAT_SPRITE_SIZE / 96;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.translate(-x, -y);
  drawFerryFallbackRaw(ctx, x, y, shadow);
  ctx.restore();
}

function drawFerryFallbackRaw(ctx, x, y, shadow = true) {
  if (shadow) softShadow(ctx, x, y + 6, 40, 12);
  ctx.fillStyle = '#2b3339';                       // flanc
  ctx.fillRect(x - 36, y - 46, 72, 94);
  ctx.fillStyle = '#e5e8e6';                       // coque
  ctx.fillRect(x - 34, y - 44, 68, 90);
  ctx.strokeStyle = '#1d2328';                     // défense
  ctx.lineWidth = 4;
  ctx.strokeRect(x - 34, y - 44, 68, 90);
  ctx.strokeStyle = 'rgba(47,67,86,0.5)';          // filet marine
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 30, y - 40, 60, 82);
  ctx.fillStyle = '#a9ada8';                       // pont
  ctx.fillRect(x - 28, y - 38, 56, 78);
  ctx.fillStyle = '#c3c7c3';                       // superstructure
  ctx.fillRect(x - 20, y - 22, 40, 48);
  ctx.fillStyle = '#f2f4f2';                       // toit
  ctx.fillRect(x - 21, y - 26, 42, 44);
  ctx.fillStyle = '#22303a';                       // bande vitrée
  ctx.fillRect(x - 17, y + 14, 34, 6);
  ctx.fillStyle = '#e8eae6';                       // radôme
  ctx.fillRect(x - 7, y - 14, 14, 4);
  ctx.fillStyle = '#6d747b';                       // échappement
  ctx.beginPath(); ctx.arc(x + 12, y - 8, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#14181c';
  ctx.beginPath(); ctx.arc(x + 12, y - 8, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#9ea39e';                       // pont arrière
  ctx.fillRect(x - 12, y + 24, 24, 12);
  ctx.fillStyle = '#4a5158';                       // arbres d'hélice
  ctx.fillRect(x - 16, y + 40, 3, 8);
  ctx.fillRect(x + 13, y + 40, 3, 8);
  ctx.fillStyle = '#2f363c';
  ctx.beginPath(); ctx.ellipse(x - 15, y + 50, 6, 2.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + 15, y + 50, 6, 2.5, 0, 0, Math.PI * 2); ctx.fill();
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
  // Ressources de la grotte (même gabarit que leurs équivalents de surface :
  // les fissures de minage déjà pré-rendues continuent de s'appliquer).
  objectCache.caveStone = makeObjectSprite(40, 44, 20, 34, drawCaveStoneObjectRaw);
  objectCache.caveIron = makeObjectSprite(40, 44, 20, 34, drawCaveIronObjectRaw);
  objectCache.caveDiamond = makeObjectSprite(40, 44, 20, 34, drawCaveDiamondObjectRaw);
  objectCache.caveCoal = makeObjectSprite(40, 44, 20, 34, drawCaveCoalObjectRaw);
  objectCache.torch = makeObjectSprite(16, 24, 8, 21, drawTorchRaw);
  objectCache.sign = makeObjectSprite(30, 30, 15, 27, drawSignRaw);
  objectCache.seller1 = makeObjectSprite(32, 34, 16, 31, drawSellerRaw(1));
  objectCache.seller2 = makeObjectSprite(32, 34, 16, 31, drawSellerRaw(2));
  objectCache.seller3 = makeObjectSprite(32, 34, 16, 31, drawSellerRaw(3));
  // Les quatre stades du blé (agriculture), petits et lisibles.
  objectCache.wheat0 = makeObjectSprite(32, 36, 16, 30, makeWheatRaw(0));
  objectCache.wheat1 = makeObjectSprite(32, 36, 16, 30, makeWheatRaw(1));
  objectCache.wheat2 = makeObjectSprite(32, 36, 16, 30, makeWheatRaw(2));
  objectCache.wheat3 = makeObjectSprite(32, 36, 16, 30, makeWheatRaw(3));
  // L'entrée de la grotte déborde largement de sa tuile (point de repère).
  objectCache.caveMouth = makeObjectSprite(76, 88, 38, 80, drawCaveMouthObjectRaw);
  objectCache.caveLadderDown = makeObjectSprite(44, 48, 22, 38, drawCaveLadderDownRaw);
  objectCache.caveLadderUp = makeObjectSprite(44, 48, 22, 38, drawCaveLadderUpRaw);
  // Le port (côte est) : ouvrages générés par js/harbor.js.
  objectCache.crane = makeObjectSprite(60, 82, 26, 70, drawCraneRaw);
  objectCache.containerRed = makeObjectSprite(36, 34, 18, 28,
    makeContainerRaw('#b4473c', '#c75a4d', '#7d2f27'));
  objectCache.containerBlue = makeObjectSprite(36, 34, 18, 28,
    makeContainerRaw('#3f7fa8', '#5794bb', '#2c5a79'));
  objectCache.containerGreen = makeObjectSprite(36, 34, 18, 28,
    makeContainerRaw('#4a7a52', '#5f9166', '#33563a'));
  objectCache.bollard = makeObjectSprite(22, 26, 11, 22, drawBollardRaw);
  objectCache.lighthouse = makeObjectSprite(48, 100, 24, 88, drawLighthouseRaw);
  // Le ferry : repli procédural, remplacé par le SVG dès qu'il est chargé.
  objectCache.ferry = makeObjectSprite(BOAT_SPRITE_SIZE, BOAT_SPRITE_SIZE,
    BOAT_SPRITE_SIZE / 2, BOAT_SPRITE_SIZE / 2, drawFerryFallbackScaled);
}

// ------------------------------------------------------------
//  Sprite du ferry : on préfère le SVG (assets/boat-ferry.svg) au
//  repli procédural. Le chargement est asynchrone et FACULTATIF :
//  en cas d'échec (fichier absent, exécution en Node pour les tests)
//  le repli reste en place et le jeu tourne sans rien changer.
// ------------------------------------------------------------
export function loadBoatSprite(url = 'assets/boat-ferry.svg') {
  return new Promise((resolve) => {
    try {
      if (typeof Image === 'undefined') return resolve(null);
      const img = new Image();
      img.onload = () => {
        try {
          const size = BOAT_SPRITE_SIZE;
          const canvas = makeCanvas(size, size);
          const ctx = canvas.getContext('2d');
          // Le SVG est un vectoriel : on veut un agrandissement lisse, pas
          // le rendu « pixel art » par défaut des autres sprites.
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(img, 0, 0, size, size);
          // Masque (silhouette) : sert aux fissures et à l'overlay de dégâts.
          const mask = makeCanvas(size, size);
          const mctx = mask.getContext('2d');
          mctx.drawImage(canvas, 0, 0);
          mctx.globalCompositeOperation = 'source-in';
          mctx.fillStyle = '#ffffff';
          mctx.fillRect(0, 0, size, size);
          objectCache.ferry = { canvas, mask, anchorX: size / 2, anchorY: size / 2 };
          resolve(objectCache.ferry);
        } catch (err) {
          console.warn('AVANIA: sprite du ferry', err);
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    } catch (err) {
      resolve(null);
    }
  });
}

// Dessine un objet de la grotte (ou tout objet statique simple) par son id.
export function drawCaveObject(ctx, kind, x, y) {
  const sprite = objectCache[kind];
  if (!sprite) return;
  ctx.drawImage(sprite.canvas, x - sprite.anchorX, y - sprite.anchorY);
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
  // Immeubles de Fortune City : `rise` = de combien le sommet du bloc
  // monte au-dessus de sa tuile (voir drawBlockTileConnected).
  wallModern: { texture: modernWallTexture, opts: { rise: 30 } },
  wallGlass:  { texture: glassTowerTexture, opts: { rise: 46 } },
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
  // Hauteur du bloc : un mur d'immeuble (`rise`) dépasse au-dessus de sa
  // tuile — son toit monte, sa façade descend jusqu'au bord sud.
  const H = BLOCK_H + (opts.rise || 0);
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
  const fh = H - fy0;

  // Coordonnées du bloc, transmises aux textures : les détails (vitres
  // allumées, balcons, équipements de toit) se déduisent de la tuile,
  // jamais d'un tirage — tout le monde voit la même ville.
  const blockTx = Math.round(x / S);
  const blockTy = Math.round((y + BLOCK_EXTRUDE + (opts.rise || 0)) / S);

  ctx.save();
  ctx.translate(x, y);
  if (opts.alpha != null) ctx.globalAlpha = opts.alpha;

  // 1. Fond : toute la tuile, zéro trou d'arrière-plan.
  ctx.fillStyle = side;
  ctx.fillRect(0, 0, S, H);

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
    ctx.fillRect(S - RIGHT_FACE_W, rightY0, RIGHT_FACE_W, H - rightY0);
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
    texture(ctx, face, {
      x: px, y: py, w: pw, h: ph, top, side, dark: sideDark, tx: blockTx, ty: blockTy,
    });
    ctx.restore();
  };
  if (showTop) paintFace('top', x0, topY0, fw, topH);
  paintFace('front', x0, fy0, fw, fh);
  if (!rightSame) {
    paintFace('right', S - RIGHT_FACE_W, rightY0, RIGHT_FACE_W, H - rightY0);
  }

  // Ombrage volumétrique (le cube « sort » de l'écran) :
  //  - dessus : léger dégradé diagonal, lumière venant du nord-est ;
  //  - avant : dégradé vertical, plus sombre vers le bas ;
  //  - droite : teinte un peu plus foncée que l'avant (deux plans distincts) ;
  //  - pli ombré à la jonction dessus ↔ avant.
  if (showTop && fw > 0 && topH > 0) {
    const tg = ctx.createLinearGradient(x0, topY0, x1, topBottom);
    tg.addColorStop(0, 'rgba(255,255,255,0.13)');
    tg.addColorStop(0.55, 'rgba(255,255,255,0.02)');
    tg.addColorStop(1, 'rgba(0,0,0,0.10)');
    ctx.fillStyle = tg;
    ctx.fillRect(x0, topY0, fw, topH);
  }
  if (fw > 0 && fh > 0) {
    const fg = ctx.createLinearGradient(0, fy0, 0, H);
    fg.addColorStop(0, 'rgba(255,255,255,0.12)');
    fg.addColorStop(0.3, 'rgba(255,255,255,0)');
    fg.addColorStop(1, 'rgba(0,0,0,0.32)');
    ctx.fillStyle = fg;
    ctx.fillRect(x0, fy0, fw, fh);
    // Occlusion au pied du mur : le cube « pèse » sur le sol.
    if (!(southSame || sittingOn)) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(x0, H - 2, fw, 2);
    }
  }
  if (!rightSame) {
    // Dégradé horizontal sur la face est : l'arête avant accroche la lumière.
    const rg = ctx.createLinearGradient(S - RIGHT_FACE_W, 0, S, 0);
    rg.addColorStop(0, 'rgba(255,255,255,0.05)');
    rg.addColorStop(0.4, 'rgba(0,0,0,0.16)');
    rg.addColorStop(1, 'rgba(0,0,0,0.26)');
    ctx.fillStyle = rg;
    ctx.fillRect(S - RIGHT_FACE_W, rightY0, RIGHT_FACE_W, BLOCK_H - rightY0);
  }
  if (showTop && !southSame && fw > 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.fillRect(x0, topBottom, fw, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(x0, topBottom + 1, fw, 1);
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
    ctx.moveTo(leftSame ? 0 : 0.5, H - 0.5);
    ctx.lineTo(rightSame ? S : S - 0.5, H - 0.5);
  }
  if (!leftSame) {
    ctx.moveTo(0.5, showTop ? 0.5 : 0);
    ctx.lineTo(0.5, mergeDown ? H : H - 0.5);
  }
  if (!rightSame) {
    ctx.moveTo(S - 0.5, showTop ? 0.5 : 0);
    ctx.lineTo(S - 0.5, mergeDown ? H : H - 0.5);
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
    ty * S - BLOCK_EXTRUDE - offset - (cfg.opts.rise || 0),
    BLOCK_DEFS[id].color,
    cfg.texture,
    faces,
    cfg.opts,
  );
}
