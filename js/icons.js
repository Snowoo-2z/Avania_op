// ============================================================
//  AVANIA — Icônes d'objets (sprites voxel, sans emoji)
//  Chaque objet de l'inventaire / du craft reçoit une vraie
//  icône dessinée en code, puis exportée en PNG.
//
//  - Les blocs posables sont de vrais cubes 3/4 (style item
//    Minecraft) : on tient et on range ce qu'on construit.
//  - Les outils (pioche, hache, pelle, épée) et le bâton sont
//    du pixel-art diagonal, avec poignée, fil et reflets.
// ============================================================

import { ALL_ITEMS, ITEM_DEFS, BLOCK_DEFS } from './blocks.js';
import { buildTileset, shade, mcOakPlanks } from './tileset.js';

const SIZE = 32;
const urlCache = new Map();
const spriteCache = new Map();
let ready = false;

// Palettes d'outils : base + reflet + ombre + fil / métal.
const TOOL_COLORS = {
  wood:  { base: '#c48642', light: '#e8b46a', dark: '#7a4a22', mid: '#a86a32', edge: '#f0d090' },
  stone: { base: '#a4a4ac', light: '#d8d8de', dark: '#5a5a64', mid: '#888890', edge: '#f0f0f4' },
  iron:  { base: '#c6ccd2', light: '#eef2f6', dark: '#676f78', mid: '#96a0a9', edge: '#ffffff' },
  diamond: { base: '#59d8e8', light: '#c9f7fc', dark: '#0e5a68', mid: '#2fb9cf', edge: '#eafeff' },
  stick: { base: '#c89a5e', light: '#e8c888', dark: '#6e4426', mid: '#a87a42', edge: '#f2d8a0' },
  wrap:  { base: '#6a3a1e', light: '#8a5a32', dark: '#3a1e10', mid: '#5a2e16', edge: '#a87848' },
};

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function withAlpha(hex, a) {
  if (hex.startsWith('rgb(')) return hex.replace('rgb(', 'rgba(').replace(')', `,${a})`);
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

// Petite brique voxel : remplissage + reflet haut/gauche + ombre bas/droite.
function voxel(ctx, x, y, w, h, c) {
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = c.base;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = c.light;
  ctx.fillRect(x, y, w, Math.max(1, Math.round(h * 0.28)));
  ctx.fillRect(x, y, Math.max(1, Math.round(w * 0.26)), h);
  if (c.edge && w > 3 && h > 3) {
    ctx.fillStyle = withAlpha(c.edge, 0.55);
    ctx.fillRect(x + 1, y + 1, Math.max(1, w - 4), 1);
  }
  ctx.fillStyle = c.dark;
  ctx.fillRect(x, y + h - 2, w, 2);
  ctx.fillRect(x + w - 2, y, 2, h);
}

function px(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function clearCanvas(ctx) {
  ctx.clearRect(0, 0, SIZE, SIZE);
}

// Ombre portée douce, pour que l'icône se détache dans les cases.
function dropShadow(ctx, draw) {
  ctx.save();
  ctx.translate(1, 2);
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = '#000';
  ctx.strokeStyle = '#000';
  draw(true);
  ctx.restore();
  draw(false);
}

// ------------------------------------------------------------
//  Outils — pose diagonale, tête en haut à droite (comme Minecraft)
// ------------------------------------------------------------
function withItemPose(ctx, fn) {
  ctx.save();
  ctx.translate(16, 16);
  ctx.rotate(0.62);
  ctx.translate(-16, -16);
  fn();
  ctx.restore();
}

// Manche nu à la Minecraft : bois strié, pas de lien de cuir.
function drawHandle(ctx, x, y, w, h, wood) {
  voxel(ctx, x, y, w, h, wood);
  ctx.fillStyle = withAlpha(wood.dark, 0.35);
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(x + 1, y + 4 + i * 5, w - 2, 1);
  }
}

function drawPickaxe(ctx, head, handle) {
  withItemPose(ctx, () => {
    drawHandle(ctx, 14, 8, 4, 22, handle);
    // Tête en arche façon Minecraft : barre épaisse + deux dents
    // qui descendent en escalier vers l'intérieur.
    voxel(ctx, 4, 2, 24, 5, head);   // barre du haut
    voxel(ctx, 4, 7, 8, 5, head);    // dent gauche, étage 1
    voxel(ctx, 5, 12, 6, 4, head);   // dent gauche, étage 2 (rentrée)
    voxel(ctx, 20, 7, 8, 5, head);   // dent droite
    voxel(ctx, 21, 12, 6, 4, head);
    // Ombres intérieures qui creusent l'arche
    px(ctx, 11, 9, 1, 7, head.dark);
    px(ctx, 20, 9, 1, 7, head.dark);
    // Tranchants extérieurs lumineux + pointes
    px(ctx, 4, 2, 24, 1, head.edge);
    px(ctx, 4, 7, 1, 5, head.edge);
    px(ctx, 27, 7, 1, 5, head.edge);
    px(ctx, 5, 15, 2, 1, head.edge);
    px(ctx, 25, 15, 2, 1, head.edge);
    // Noix où le manche rejoint la tête
    px(ctx, 13, 5, 6, 3, head.dark);
    px(ctx, 14, 5, 4, 1, head.light);
  });
}

function drawAxe(ctx, head, handle) {
  withItemPose(ctx, () => {
    drawHandle(ctx, 15, 8, 4, 22, handle);
    // Lame étagée façon Minecraft : grande plaque vers la gauche,
    // crochet qui redescend, encoche claire entre lame et manche.
    voxel(ctx, 8, 3, 14, 5, head);   // haut de la lame, contre le manche
    voxel(ctx, 3, 6, 17, 6, head);   // partie large
    voxel(ctx, 3, 12, 7, 5, head);   // crochet
    // Tranchant lumineux tout le long du bord gauche
    px(ctx, 3, 6, 1, 11, head.edge);
    px(ctx, 8, 3, 12, 1, head.edge) ;
    px(ctx, 9, 13, 1, 4, head.dark); // ombre intérieure du crochet
    // Rivet au-dessus du manche
    px(ctx, 15, 6, 4, 2, head.dark);
    px(ctx, 16, 6, 2, 1, head.light);
  });
}

function drawShovel(ctx, head, handle) {
  withItemPose(ctx, () => {
    drawHandle(ctx, 14, 2, 4, 16, handle);
    // Col
    voxel(ctx, 13, 16, 6, 3, head);
    // Pelle évasée (bêche) avec un bord légèrement arrondi
    voxel(ctx, 7, 18, 18, 8, head);
    voxel(ctx, 9, 26, 14, 4, head);
    voxel(ctx, 11, 30, 10, 2, head.dark);
    // Creux de la pelle (l'intérieur)
    px(ctx, 10, 20, 12, 5, head.dark);
    px(ctx, 11, 21, 10, 2, withAlpha(head.light, 0.35));
    // Fil du bord
    px(ctx, 7, 18, 18, 1, head.edge);
    px(ctx, 9, 29, 14, 1, head.edge);
  });
}

function drawSword(ctx, blade, handle) {
  withItemPose(ctx, () => {
    // Lame longue qui s'affine vers la pointe, comme l'épée de Minecraft
    voxel(ctx, 13, 0, 6, 6, blade);
    voxel(ctx, 14, 6, 5, 6, blade);
    voxel(ctx, 14, 12, 4, 8, blade);
    // Pointe
    voxel(ctx, 15, -1, 2, 1, blade);
    px(ctx, 15, -1, 2, 1, blade.edge);
    // Arête centrale brillante
    px(ctx, 14, 1, 1, 18, blade.edge);
    px(ctx, 17, 2, 1, 17, blade.dark);
    // Garde
    voxel(ctx, 8, 20, 16, 3, handle);
    px(ctx, 8, 20, 16, 1, handle.light);
    // Poignée en cuir
    voxel(ctx, 14, 23, 4, 6, TOOL_COLORS.wrap);
    px(ctx, 14, 24, 4, 1, TOOL_COLORS.wrap.light);
    px(ctx, 14, 26, 4, 1, TOOL_COLORS.wrap.light);
    // Pommeau
    voxel(ctx, 13, 28, 6, 3, handle);
    px(ctx, 14, 29, 3, 1, handle.light);
  });
}

function drawStick(ctx, c) {
  ctx.save();
  ctx.translate(SIZE / 2, SIZE / 2);
  ctx.rotate(-Math.PI / 4);
  voxel(ctx, -2, -14, 5, 28, c);
  ctx.fillStyle = withAlpha(c.dark, 0.4);
  for (let i = 0; i < 5; i++) ctx.fillRect(-1, -11 + i * 5, 3, 1);
  // Nœud
  px(ctx, -2, -2, 5, 3, c.mid);
  px(ctx, -1, -1, 2, 1, c.light);
  ctx.restore();
}

// --- Fer brut : pépite massive à facettes (le fer de Minecraft) ---
function drawRawIron(ctx) {
  ctx.save();
  ctx.translate(SIZE / 2, SIZE / 2);
  ctx.rotate(-0.15);
  const NUG = '#d8ae8a', NUG_HI = '#eec9a2', NUG_OUT = '#7a5232', NUG_SH = '#b98a62';
  // forme octogonale (rectangles croisés = coins chanfreinés)
  const octo = (x, y, w, h) => {
    ctx.fillRect(x + 2, y, w - 4, h);
    ctx.fillRect(x, y + 2, w, h - 4);
  };
  // grosse pépite
  ctx.fillStyle = NUG_OUT; octo(-11, -10, 18, 16);
  ctx.fillStyle = NUG; octo(-10, -9, 16, 14);
  ctx.fillStyle = NUG_HI;
  ctx.fillRect(-8, -8, 12, 2);   // facette du dessus
  ctx.fillRect(-9, -6, 2, 8);    // facette gauche
  ctx.fillStyle = '#fbe8d4';
  ctx.fillRect(-6, -6, 3, 2);    // reflet taillé
  ctx.fillStyle = NUG_SH;
  ctx.fillRect(-8, 3, 12, 2);    // facette du bas
  ctx.fillRect(3, -5, 2, 8);     // facette droite
  // petite pépite accolée en bas à droite
  ctx.fillStyle = NUG_OUT; octo(3, 2, 10, 9);
  ctx.fillStyle = NUG; octo(4, 3, 8, 7);
  ctx.fillStyle = NUG_HI; ctx.fillRect(5, 4, 6, 1);
  ctx.fillStyle = '#fbe8d4'; ctx.fillRect(6, 5, 2, 1);
  ctx.restore();
}

// --- Charbon : pépite noire mate aux reflets gris ---
function drawCoal(ctx) {
  ctx.save();
  ctx.translate(SIZE / 2, SIZE / 2);
  const COAL = '#17171c', HI = '#4a4a55', OUT = '#000000';
  ctx.fillStyle = OUT;
  ctx.fillRect(-8, -6, 16, 12);
  ctx.fillRect(-6, -8, 12, 16);
  ctx.fillStyle = COAL;
  ctx.fillRect(-7, -5, 14, 10);
  ctx.fillRect(-5, -7, 10, 14);
  ctx.fillStyle = HI;
  ctx.fillRect(-5, -7, 10, 2);
  ctx.fillRect(-7, -5, 2, 6);
  ctx.fillStyle = '#6a6a78';
  ctx.fillRect(-3, -4, 2, 2);
  ctx.fillRect(2, 1, 2, 1);
  ctx.restore();
}

// --- Torche : manche bois + tête en feu ---
function drawTorchIcon(ctx) {
  ctx.save();
  ctx.translate(SIZE / 2, SIZE / 2);
  // manche
  ctx.fillStyle = '#6a4520';
  ctx.fillRect(-2, -4, 4, 12);
  ctx.fillStyle = '#8a5f30';
  ctx.fillRect(-2, -4, 1.5, 12);
  // ligature
  ctx.fillStyle = '#3c2c12';
  ctx.fillRect(-2.5, -6, 5, 2);
  // flamme
  ctx.fillStyle = '#e8632c';
  ctx.fillRect(-3.5, -12, 7, 6);
  ctx.fillStyle = '#f7a13c';
  ctx.fillRect(-2.5, -11, 5, 5);
  ctx.fillStyle = '#ffd979';
  ctx.fillRect(-1.5, -10, 3, 3);
  ctx.restore();
}

// --- Panneau : planche claire sur poteau ---
function drawSignIcon(ctx) {
  ctx.save();
  ctx.translate(SIZE / 2, SIZE / 2);
  ctx.fillStyle = '#6a4520';
  ctx.fillRect(-1.5, -2, 3, 10);
  ctx.fillStyle = '#5a3818';
  ctx.fillRect(-9, -9, 18, 10);
  ctx.fillStyle = '#d8b878';
  ctx.fillRect(-8, -8, 16, 8);
  ctx.fillStyle = 'rgba(106,69,32,0.5)';
  ctx.fillRect(-6, -6, 12, 1);
  ctx.fillRect(-6, -3, 9, 1);
  ctx.restore();
}

// --- Diamant : gemme taillée bleu-vert, très brillante ---
function drawDiamond(ctx) {
  ctx.save();
  ctx.translate(SIZE / 2, SIZE / 2);
  const GEM = '#4fd6e8', GEM_HI = '#c9f7fc', GEM_MID = '#7ee6f2', GEM_OUT = '#0e5a68';
  // silhouette de gemme (couronne + pointe), en rectangles chanfreinés
  ctx.fillStyle = GEM_OUT;
  ctx.fillRect(-9, -8, 18, 6);      // table
  ctx.fillRect(-11, -4, 22, 5);     // couronne
  ctx.fillRect(-8, 1, 16, 5);       // culasse
  ctx.fillRect(-4, 6, 8, 4);        // pointe
  // remplissage
  ctx.fillStyle = GEM;
  ctx.fillRect(-8, -7, 16, 4);
  ctx.fillRect(-10, -3, 20, 3);
  ctx.fillRect(-7, 1, 14, 4);
  ctx.fillRect(-3, 6, 6, 3);
  // facettes claires
  ctx.fillStyle = GEM_MID;
  ctx.fillRect(-10, -3, 4, 3);
  ctx.fillRect(2, 1, 5, 4);
  ctx.fillStyle = GEM_HI;
  ctx.fillRect(-8, -7, 6, 2);
  ctx.fillRect(-10, -3, 3, 1);
  // éclat taillé
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-6, -6, 2, 2);
  ctx.restore();
}

// --- Houe : manche + lame perpendiculaire, l'outil de la ferme ---
function drawHoe(ctx, head, handle) {
  ctx.save();
  ctx.translate(SIZE / 2, SIZE / 2);
  ctx.rotate(0.5);
  ctx.fillStyle = handle.dark; ctx.fillRect(-2, -12, 4, 24);
  ctx.fillStyle = handle.base; ctx.fillRect(-1, -12, 2, 24);
  ctx.fillStyle = head.dark; ctx.fillRect(-11, -14, 15, 5);
  ctx.fillStyle = head.base; ctx.fillRect(-10, -13, 13, 3);
  ctx.fillStyle = head.light; ctx.fillRect(-10, -13, 13, 1);
  ctx.restore();
}

// --- Graines : petit sachet ouvert qui laisse voir les grains ---
function drawSeeds(ctx) {
  ctx.save();
  ctx.translate(SIZE / 2, SIZE / 2);
  ctx.fillStyle = '#8a6a3c'; ctx.fillRect(-9, -4, 18, 12);
  ctx.fillStyle = '#a8865a'; ctx.fillRect(-9, -4, 18, 3);
  ctx.fillStyle = '#6e4426'; ctx.fillRect(-9, 6, 18, 2);
  // grains qui débordent
  ctx.fillStyle = '#d8c26a';
  ctx.fillRect(-6, -7, 3, 3); ctx.fillRect(0, -8, 3, 3); ctx.fillRect(4, -6, 3, 3);
  ctx.fillStyle = '#e8d47a';
  ctx.fillRect(-5, -6, 1, 1); ctx.fillRect(1, -7, 1, 1);
  ctx.restore();
}

// --- Blé : gerbe dorée liée ---
function drawWheatItem(ctx) {
  ctx.save();
  ctx.translate(SIZE / 2, SIZE / 2);
  for (let s = -1; s <= 1; s++) {
    const x = s * 5;
    ctx.fillStyle = '#c9b45a';
    ctx.fillRect(x - 1, -6, 2, 16);
    ctx.fillStyle = '#e8d47a';
    ctx.fillRect(x - 2, -12, 4, 7);
    ctx.fillStyle = '#d8c26a';
    ctx.fillRect(x - 1, -11, 2, 5);
  }
  ctx.fillStyle = '#a8865a';
  ctx.fillRect(-7, 4, 14, 3); // lien
  ctx.restore();
}

// --- Pain : miche dorée entaillée ---
function drawBread(ctx) {
  ctx.save();
  ctx.translate(SIZE / 2, SIZE / 2);
  ctx.fillStyle = '#8a5a26';
  ctx.fillRect(-11, -4, 22, 10);
  ctx.fillRect(-9, -7, 18, 4);
  ctx.fillStyle = '#c98f4a';
  ctx.fillRect(-10, -6, 20, 10);
  ctx.fillStyle = '#e8b46a';
  ctx.fillRect(-9, -6, 18, 3);
  ctx.fillStyle = '#8a5a26';
  ctx.fillRect(-5, -5, 2, 4); ctx.fillRect(0, -5, 2, 4); ctx.fillRect(5, -5, 2, 4);
  ctx.restore();
}

// --- Lingot de fer : barre arrondie au reflet métallique ---
function drawIronIngot(ctx) {
  ctx.save();
  ctx.translate(SIZE / 2, SIZE / 2);
  ctx.rotate(0.06);
  ctx.fillStyle = '#aeb6be';
  ctx.fillRect(-11, -5, 22, 10);
  ctx.fillStyle = '#c6ccd2';
  ctx.fillRect(-10, -4, 20, 8);
  ctx.fillStyle = '#eef2f6';
  ctx.fillRect(-9, -3, 18, 3);
  // encoche du lingot
  ctx.fillStyle = '#8a939b';
  ctx.fillRect(-2, 2, 5, 3);
  ctx.fillStyle = withAlpha('#000000', 0.2);
  ctx.fillRect(-11, 4, 22, 1);
  ctx.restore();
}

// --- Écus : petite pile de pièces d'or (la monnaie de l'île) ---
// Trois pièces empilées en léger décalage, façon voxel : tranche sombre
// en bas, face claire dessus, reflet en haut à gauche. Le même dessin
// sert d'icône d'inventaire et de sprite au sol (objet lâché).
function drawCoinPile(ctx) {
  const gold = { base: '#e8b53c', light: '#f7d97a', dark: '#96691c', edge: '#fff2c0' };
  ctx.save();
  ctx.translate(SIZE / 2, SIZE / 2);
  // Deux pièces au sol, une posée dessus : pile centrée dans la case.
  const pieces = [
    { x: -12, y: 1 },
    { x: -1, y: 4 },
    { x: -7, y: -9 },
  ];
  for (const p of pieces) {
    // Tranche (épaisseur de la pièce)
    ctx.fillStyle = gold.dark;
    ctx.fillRect(p.x, p.y + 4, 14, 4);
    // Face
    ctx.fillStyle = gold.base;
    ctx.fillRect(p.x, p.y, 14, 5);
    ctx.fillStyle = gold.light;
    ctx.fillRect(p.x, p.y, 14, 2);
    ctx.fillRect(p.x, p.y, 2, 5);
    // Reflet
    ctx.fillStyle = withAlpha(gold.edge, 0.75);
    ctx.fillRect(p.x + 2, p.y + 1, 4, 1);
    // Motif central (l'écusson)
    ctx.fillStyle = withAlpha(gold.dark, 0.55);
    ctx.fillRect(p.x + 5, p.y + 2, 4, 2);
  }
  ctx.restore();
}

// --- Laine : boule blanche duveteuse ---
function drawWool(ctx) {
  ctx.save();
  ctx.translate(SIZE / 2, SIZE / 2);
  const blobs = [
    [-8, -5, 8, 8], [-2, -8, 8, 8], [4, -5, 8, 8],
    [-7, 1, 8, 8], [0, 0, 8, 8], [6, 2, 8, 8], [-2, 6, 8, 8],
  ];
  for (const [x, y, w, h] of blobs) {
    ctx.fillStyle = '#f2f2f2';
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h / 2, w / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = withAlpha('#ffffff', 0.8);
  ctx.beginPath();
  ctx.arc(-3, -3, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = withAlpha('#c9c9c9', 0.5);
  ctx.beginPath();
  ctx.arc(4, 5, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// --- Steak façon Minecraft : dalle arrondie, bord sombre ---
//  (sert de gabarit commun au bœuf cru et au bœuf cuit)
function drawSteak(ctx, rim, base, light, marble) {
  ctx.save();
  ctx.translate(SIZE / 2, SIZE / 2);
  ctx.rotate(-0.3);
  // la dalle : grand rectangle légèrement chanfreiné
  ctx.fillStyle = rim;
  ctx.fillRect(-11, -8, 22, 16);
  ctx.fillRect(-12, -6, 24, 12);
  ctx.fillStyle = base;
  ctx.fillRect(-10, -7, 20, 14);
  ctx.fillRect(-11, -5, 22, 10);
  // nappage lumineux en haut à gauche
  ctx.fillStyle = light;
  ctx.fillRect(-9, -6, 18, 3);
  ctx.fillRect(-10, -3, 2, 6);
  // persillage / jus : deux stries fines en diagonale
  ctx.fillStyle = marble;
  px(ctx, -5, -2, 2, 7, marble);
  px(ctx, 3, -3, 2, 8, marble);
  px(ctx, -4, 5, 1, 2, marble);
  ctx.restore();
}

// --- Bœuf cru : rouge saumon persillé de crème ---
function drawRawBeef(ctx) {
  drawSteak(ctx, '#a84640', '#cd6a62', '#e08a80', '#ecc9b8');
}

// --- Steak cuit : brun rôti au jus ambré ---
function drawCookedBeef(ctx) {
  drawSteak(ctx, '#5e3a1e', '#8a5632', '#a87848', '#c99a5e');
}

// --- Porte : vue de face avec poignée (icône d'objet) ---
function drawDoorIcon(ctx) {
  ctx.save();
  ctx.translate(SIZE / 2, SIZE / 2);
  ctx.scale(0.62, 1.05);
  ctx.fillStyle = shade('#c89a5e', 0.9);
  ctx.fillRect(-14, -13, 28, 26);
  ctx.fillStyle = shade('#c89a5e', 1.12);
  ctx.fillRect(-12, -11, 24, 22);
  ctx.fillStyle = shade('#c89a5e', 0.72);
  ctx.fillRect(-14, -13, 3, 26);
  ctx.fillRect(11, -13, 3, 26);
  ctx.strokeStyle = withAlpha('#5a3a1e', 0.5);
  ctx.lineWidth = 1;
  for (let x = -8; x < 12; x += 6) {
    ctx.beginPath();
    ctx.moveTo(x, -11);
    ctx.lineTo(x, 11);
    ctx.stroke();
  }
  ctx.fillStyle = '#3a3a3e';
  ctx.fillRect(7, -2, 3, 3);
  ctx.fillStyle = withAlpha('#ffffff', 0.3);
  ctx.fillRect(7, -2, 1, 3);
  ctx.strokeStyle = shade('#c89a5e', 0.5);
  ctx.strokeRect(-15, -14, 30, 28);
  ctx.restore();
}

// --- Coffre : vue de face façon chest_front Minecraft — planches de chêne,
// joint « bord du couvercle / corps » et petit fermoir en fer.
function drawChestIcon(ctx) {
  ctx.save();
  ctx.translate(16, 15);
  // Bord sombre de la boîte
  ctx.fillStyle = '#6e5330';
  ctx.fillRect(-12, -10, 24, 20);
  // Bord du couvercle (haut, 6 px) — planches plus claires
  mcOakPlanks(ctx, -11, -9, 22, 6, 1, { tint: 1.05 });
  ctx.fillStyle = withAlpha('#ffffff', 0.08);
  ctx.fillRect(-11, -9, 22, 6);
  // Joint couvercle / corps
  ctx.fillStyle = withAlpha('#4e3818', 0.9);
  ctx.fillRect(-11, -3, 22, 1);
  // Corps : 2 lames de chêne
  mcOakPlanks(ctx, -11, -2, 22, 11, 2, { tint: 0.88 });
  // Fermeture : petit fermoir en fer centré sous le joint
  ctx.fillStyle = '#33343a';
  ctx.fillRect(-2, -1, 4, 4);
  ctx.fillStyle = '#8b8d92';
  ctx.fillRect(-2, -1, 4, 1);
  ctx.fillStyle = '#62646a';
  ctx.fillRect(-2, 0, 1, 2);
  ctx.fillStyle = '#26272c';
  ctx.fillRect(0, 0, 2, 2);
  // Contour sombre
  ctx.strokeStyle = '#4e3818';
  ctx.lineWidth = 1;
  ctx.strokeRect(-11.5, -9.5, 23, 19);
  ctx.restore();
}

// ------------------------------------------------------------
//  Équipement de la grotte : masque respiratoire et armure de minage
// ------------------------------------------------------------

// Brique voxel « une couleur » : éclaircissement et assombrissement
// calculés, contrairement à voxel() qui attend une palette complète.
function gvoxel(ctx, x, y, w, h, color) {
  if (w <= 0 || h <= 0) return;
  const hi = Math.max(1, Math.round(h * 0.22));
  const lo = Math.max(1, Math.round(h * 0.2));
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = shade(color, 1.2);
  ctx.fillRect(x, y, w, hi);
  ctx.fillRect(x, y, Math.max(1, Math.round(w * 0.16)), h);
  ctx.fillStyle = shade(color, 0.7);
  ctx.fillRect(x, y + h - lo, w, lo);
  ctx.fillRect(x + w - Math.max(1, Math.round(w * 0.14)), y, Math.max(1, Math.round(w * 0.14)), h);
}

// Masque : corps arrondi, deux oculaires, lanières. La cartouche de
// filtre distingue les paliers au premier coup d'œil.
function drawMaskIcon(ctx, p) {
  dropShadow(ctx, () => {
    // Lanières
    ctx.fillStyle = p.trim;
    ctx.fillRect(2, 12, 5, 3);
    ctx.fillRect(25, 12, 5, 3);
    ctx.fillRect(3, 19, 4, 3);
    ctx.fillRect(25, 19, 4, 3);

    // Corps du masque
    gvoxel(ctx, 6, 8, 20, 16, p.base);

    // Oculaires
    for (const cx of [11, 21]) {
      ctx.fillStyle = p.dark;
      ctx.fillRect(cx - 4, 11, 8, 8);
      ctx.fillStyle = p.lens;
      ctx.fillRect(cx - 3, 12, 6, 6);
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.fillRect(cx - 3, 12, 6, 2);
      ctx.fillRect(cx - 3, 12, 2, 6);
    }

    // Pont nasal
    ctx.fillStyle = p.dark;
    ctx.fillRect(15, 13, 2, 4);

    if (p.cartridge) {
      // Cartouche de filtre (modèles à filtre et scellé)
      gvoxel(ctx, 12, 20, 8, 7, p.cartridge);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      for (let i = 0; i < 3; i++) ctx.fillRect(13, 21 + i * 2, 6, 1);
    } else {
      // Modèle de toile : simple grille cousue.
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(12, 21, 8, 1);
      ctx.fillRect(12, 23, 8, 1);
    }
  });
}

// Armure de minage : plastron, spallières, ceinturon. Le modèle
// intégrale ajoute un casque à visière.
function drawArmorIcon(ctx, p) {
  dropShadow(ctx, () => {
    if (p.helmet) {
      gvoxel(ctx, 11, 1, 10, 7, p.base);
      ctx.fillStyle = p.dark;
      ctx.fillRect(13, 4, 6, 3);           // la visière
      ctx.fillStyle = 'rgba(180,220,255,0.55)';
      ctx.fillRect(13, 4, 6, 1);
    }

    // Spallières
    gvoxel(ctx, 3, 9, 7, 6, p.base);
    gvoxel(ctx, 22, 9, 7, 6, p.base);

    // Plastron
    gvoxel(ctx, 8, 8, 16, 15, p.base);

    // Nervure centrale + rivets
    ctx.fillStyle = p.dark;
    ctx.fillRect(15, 9, 2, 13);
    ctx.fillStyle = p.trim;
    ctx.fillRect(10, 12, 2, 2);
    ctx.fillRect(20, 12, 2, 2);
    ctx.fillRect(10, 17, 2, 2);
    ctx.fillRect(20, 17, 2, 2);

    // Ceinturon
    ctx.fillStyle = '#4a3218';
    ctx.fillRect(8, 23, 16, 4);
    ctx.fillStyle = p.trim;
    ctx.fillRect(14, 22, 4, 5);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(15, 23, 2, 3);
  });
}

const TOOL_DRAWERS = {
  chest:          (ctx) => drawChestIcon(ctx),
  wooden_pickaxe: (ctx) => drawPickaxe(ctx, TOOL_COLORS.wood, TOOL_COLORS.wood),
  stone_pickaxe:  (ctx) => drawPickaxe(ctx, TOOL_COLORS.stone, TOOL_COLORS.stick),
  iron_pickaxe:   (ctx) => drawPickaxe(ctx, TOOL_COLORS.iron, TOOL_COLORS.stick),
  wooden_axe:     (ctx) => drawAxe(ctx, TOOL_COLORS.wood, TOOL_COLORS.wood),
  stone_axe:      (ctx) => drawAxe(ctx, TOOL_COLORS.stone, TOOL_COLORS.stick),
  iron_axe:       (ctx) => drawAxe(ctx, TOOL_COLORS.iron, TOOL_COLORS.stick),
  wooden_shovel:  (ctx) => drawShovel(ctx, TOOL_COLORS.wood, TOOL_COLORS.wood),
  stone_shovel:   (ctx) => drawShovel(ctx, TOOL_COLORS.stone, TOOL_COLORS.stick),
  iron_shovel:    (ctx) => drawShovel(ctx, TOOL_COLORS.iron, TOOL_COLORS.stick),
  wooden_sword:   (ctx) => drawSword(ctx, TOOL_COLORS.wood, TOOL_COLORS.wood),
  stone_sword:    (ctx) => drawSword(ctx, TOOL_COLORS.stone, TOOL_COLORS.stick),
  iron_sword:     (ctx) => drawSword(ctx, TOOL_COLORS.iron, TOOL_COLORS.stick),
  diamond_pickaxe: (ctx) => drawPickaxe(ctx, TOOL_COLORS.diamond, TOOL_COLORS.stick),
  diamond_axe:     (ctx) => drawAxe(ctx, TOOL_COLORS.diamond, TOOL_COLORS.stick),
  diamond_shovel:  (ctx) => drawShovel(ctx, TOOL_COLORS.diamond, TOOL_COLORS.stick),
  diamond_sword:   (ctx) => drawSword(ctx, TOOL_COLORS.diamond, TOOL_COLORS.stick),
  wooden_hoe:      (ctx) => drawHoe(ctx, TOOL_COLORS.wood, TOOL_COLORS.wood),
  stone_hoe:       (ctx) => drawHoe(ctx, TOOL_COLORS.stone, TOOL_COLORS.stick),
  iron_hoe:        (ctx) => drawHoe(ctx, TOOL_COLORS.iron, TOOL_COLORS.stick),
  diamond_hoe:     (ctx) => drawHoe(ctx, TOOL_COLORS.diamond, TOOL_COLORS.stick),
  seeds:           (ctx) => drawSeeds(ctx),
  wheat:           (ctx) => drawWheatItem(ctx),
  bread:           (ctx) => drawBread(ctx),
  stick:          (ctx) => drawStick(ctx, TOOL_COLORS.stick),
  coin:           (ctx) => drawCoinPile(ctx), // la monnaie (js/economy.js)
  rawIron:        (ctx) => drawRawIron(ctx),
  diamond:        (ctx) => drawDiamond(ctx),
  coal:           (ctx) => drawCoal(ctx),
  torch:          (ctx) => drawTorchIcon(ctx),
  sign:           (ctx) => drawSignIcon(ctx),
  ironIngot:      (ctx) => drawIronIngot(ctx),
  door:           (ctx) => drawDoorIcon(ctx),
  wool:           (ctx) => drawWool(ctx),
  rawBeef:        (ctx) => drawRawBeef(ctx),
  cookedBeef:     (ctx) => drawCookedBeef(ctx),
  // Équipement de la grotte : plus le palier est haut, plus le matériau
  // est noble (toile → acier bleui → laiton ; cuir → acier → acier poli).
  mask_cloth:       (ctx) => drawMaskIcon(ctx, { base: '#cfc7b4', light: '#efe9da', dark: '#8e8878', trim: '#7a5a34', lens: '#bfe3ea', cartridge: null }),
  mask_filter:      (ctx) => drawMaskIcon(ctx, { base: '#8fa3ad', light: '#c4d3da', dark: '#54646e', trim: '#3c4a52', lens: '#dff2f6', cartridge: '#5d666e' }),
  mask_sealed:      (ctx) => drawMaskIcon(ctx, { base: '#d8c46a', light: '#f4e6a8', dark: '#8a7a2e', trim: '#5c4f18', lens: '#eaf6ff', cartridge: '#c9a44a' }),
  armor_leather:    (ctx) => drawArmorIcon(ctx, { base: '#8a5a34', light: '#b07a48', dark: '#54361c', trim: '#c9a44a', helmet: false }),
  armor_reinforced: (ctx) => drawArmorIcon(ctx, { base: '#9aa3ab', light: '#d3dade', dark: '#5d666e', trim: '#c9a44a', helmet: false }),
  armor_full:       (ctx) => drawArmorIcon(ctx, { base: '#d3dade', light: '#f4f7fa', dark: '#7a838c', trim: '#e0c46a', helmet: true }),
};

export function isHeldTool(id) {
  return Boolean(TOOL_DRAWERS[id]);
}

// ------------------------------------------------------------
//  Blocs — cube isométrique 3/4 (icône d'inventaire / main)
// ------------------------------------------------------------
function isoTop(ctx) {
  ctx.beginPath();
  ctx.moveTo(16, 3);
  ctx.lineTo(30, 10);
  ctx.lineTo(16, 17);
  ctx.lineTo(2, 10);
  ctx.closePath();
}

function isoLeft(ctx) {
  ctx.beginPath();
  ctx.moveTo(2, 10);
  ctx.lineTo(16, 17);
  ctx.lineTo(16, 30);
  ctx.lineTo(2, 23);
  ctx.closePath();
}

function isoRight(ctx) {
  ctx.beginPath();
  ctx.moveTo(16, 17);
  ctx.lineTo(30, 10);
  ctx.lineTo(30, 23);
  ctx.lineTo(16, 30);
  ctx.closePath();
}

function fillFace(ctx, path, color) {
  path(ctx);
  ctx.fillStyle = color;
  ctx.fill();
}

function strokeCube(ctx, color) {
  ctx.strokeStyle = shade(color, 0.42);
  ctx.lineWidth = 1;
  isoTop(ctx); ctx.stroke();
  isoLeft(ctx); ctx.stroke();
  isoRight(ctx); ctx.stroke();
}

function clipFace(ctx, path, draw) {
  ctx.save();
  path(ctx);
  ctx.clip();
  draw();
  ctx.restore();
}

function paintWood(ctx, top, left, right) {
  clipFace(ctx, isoTop, () => {
    // Écorce autour d'une coupe claire et cernes asymétriques, comme le bloc.
    ctx.fillStyle = '#633719';
    ctx.beginPath();
    ctx.moveTo(16, 4); ctx.lineTo(28, 10); ctx.lineTo(16, 16); ctx.lineTo(4, 10); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#d6a158';
    ctx.beginPath();
    ctx.moveTo(16, 6); ctx.lineTo(24, 10); ctx.lineTo(16, 14); ctx.lineTo(8, 10); ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#925a29';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(11, 10); ctx.lineTo(15, 7); ctx.lineTo(21, 9);
    ctx.lineTo(20, 12); ctx.lineTo(16, 14); ctx.lineTo(11, 11); ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(14, 10); ctx.lineTo(17, 8); ctx.lineTo(20, 10); ctx.lineTo(17, 12); ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = '#633519';
    ctx.fillRect(16, 9, 2, 2);
    ctx.fillRect(18, 10, 4, 1);
    ctx.fillStyle = withAlpha('#f0ca84', 0.72);
    ctx.fillRect(10, 9, 4, 1);
  });
  const bark = (path, direction) => clipFace(ctx, path, () => {
    ctx.strokeStyle = withAlpha('#4d2815', 0.58);
    ctx.lineWidth = 1.2;
    for (const n of [0, 1, 2, 3]) {
      ctx.beginPath();
      if (direction === 'left') {
        ctx.moveTo(3 + n * 4, 12 + n);
        ctx.lineTo(10 + n * 2, 29);
      } else {
        ctx.moveTo(18 + n * 3, 17);
        ctx.lineTo(18 + n * 3, 29 - n);
      }
      ctx.stroke();
    }
    ctx.fillStyle = withAlpha('#e0a15b', 0.3);
    ctx.fillRect(direction === 'left' ? 6 : 23, 17, 2, 7);
  });
  bark(isoLeft, 'left');
  bark(isoRight, 'right');
}

function paintStone(ctx) {
  const chip = (x, y, w, h) => {
    ctx.fillStyle = withAlpha('#555a60', 0.52);
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = withAlpha('#f0f1ee', 0.38);
    ctx.fillRect(x, y, Math.max(1, w - 1), 1);
  };
  clipFace(ctx, isoTop, () => {
    chip(7, 7, 5, 3);
    chip(18, 7, 6, 3);
    chip(12, 11, 6, 3);
    ctx.strokeStyle = withAlpha('#3f4449', 0.6);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(4, 11); ctx.lineTo(10, 10); ctx.lineTo(14, 13); ctx.lineTo(20, 11); ctx.lineTo(27, 12);
    ctx.moveTo(15, 4); ctx.lineTo(14, 9);
    ctx.stroke();
  });
  clipFace(ctx, isoLeft, () => {
    chip(5, 16, 5, 3);
    chip(9, 22, 5, 3);
    ctx.strokeStyle = withAlpha('#35393e', 0.52);
    ctx.beginPath(); ctx.moveTo(3, 20); ctx.lineTo(9, 23); ctx.lineTo(7, 27); ctx.stroke();
  });
  clipFace(ctx, isoRight, () => {
    chip(21, 16, 5, 3);
    chip(18, 23, 5, 3);
    ctx.strokeStyle = withAlpha('#30343a', 0.48);
    ctx.beginPath(); ctx.moveTo(27, 14); ctx.lineTo(23, 20); ctx.lineTo(28, 22); ctx.stroke();
  });
}

function paintPlank(ctx) {
  const seam = withAlpha('#68401f', 0.78);
  const grain = withAlpha('#8b592c', 0.62);

  clipFace(ctx, isoTop, () => {
    // Lames en quinconce, sans les anciens clous qui évoquaient une caisse.
    ctx.fillStyle = withAlpha('#74431f', 0.1);
    ctx.fillRect(3, 9, 26, 4);
    ctx.strokeStyle = seam;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(4, 9); ctx.lineTo(28, 11); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(5, 13); ctx.lineTo(24, 15); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(15, 4); ctx.lineTo(14, 9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(21, 10); ctx.lineTo(20, 14); ctx.stroke();
    ctx.fillStyle = grain;
    ctx.fillRect(7, 7, 6, 1);
    ctx.fillRect(17, 8, 7, 1);
    ctx.fillRect(10, 11, 6, 1);
    ctx.fillStyle = '#70401e';
    ctx.fillRect(8, 12, 2, 2);
  });

  clipFace(ctx, isoLeft, () => {
    ctx.strokeStyle = seam;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(2, 16); ctx.lineTo(16, 23); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(2, 22); ctx.lineTo(16, 29); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(9, 19); ctx.lineTo(9, 26); ctx.stroke();
    ctx.strokeStyle = grain;
    ctx.beginPath(); ctx.moveTo(4, 18); ctx.lineTo(8, 20); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(10, 25); ctx.lineTo(14, 27); ctx.stroke();
  });

  clipFace(ctx, isoRight, () => {
    ctx.strokeStyle = withAlpha('#4f3019', 0.66);
    ctx.beginPath(); ctx.moveTo(16, 23); ctx.lineTo(30, 16); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(16, 28); ctx.lineTo(30, 21); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(24, 13); ctx.lineTo(24, 25); ctx.stroke();
    ctx.strokeStyle = withAlpha('#dca969', 0.34);
    ctx.beginPath(); ctx.moveTo(18, 20); ctx.lineTo(23, 17); ctx.stroke();
  });
}

function paintBrick(ctx) {
  const mortar = withAlpha('#7a2f26', 0.7);
  clipFace(ctx, isoLeft, () => {
    ctx.strokeStyle = mortar;
    ctx.lineWidth = 1;
    ctx.strokeRect(4, 13, 10, 5);
    ctx.strokeRect(3, 19, 11, 5);
    ctx.strokeRect(5, 25, 9, 4);
  });
  clipFace(ctx, isoRight, () => {
    ctx.strokeStyle = mortar;
    ctx.strokeRect(18, 13, 10, 5);
    ctx.strokeRect(17, 19, 11, 5);
    ctx.strokeRect(18, 25, 9, 4);
  });
  clipFace(ctx, isoTop, () => {
    ctx.strokeStyle = withAlpha('#7a2f26', 0.45);
    ctx.beginPath(); ctx.moveTo(6, 10); ctx.lineTo(26, 10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(16, 5); ctx.lineTo(16, 16); ctx.stroke();
  });
}

function paintGlass(ctx) {
  clipFace(ctx, isoTop, () => {
    ctx.fillStyle = withAlpha('#ffffff', 0.45);
    ctx.beginPath();
    ctx.moveTo(10, 6); ctx.lineTo(16, 5); ctx.lineTo(14, 10); ctx.lineTo(8, 9);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = withAlpha('#ffffff', 0.7);
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(8, 8); ctx.lineTo(13, 12); ctx.stroke();
  });
  clipFace(ctx, isoLeft, () => {
    ctx.fillStyle = withAlpha('#ffffff', 0.18);
    ctx.fillRect(5, 14, 6, 8);
  });
}

function paintSand(ctx) {
  clipFace(ctx, isoTop, () => {
    ctx.fillStyle = withAlpha('#c0a25e', 0.55);
    for (let i = 0; i < 8; i++) ctx.fillRect(6 + ((i * 7) % 18), 7 + ((i * 5) % 8), 2, 1);
    ctx.fillStyle = withAlpha('#f4e6b8', 0.45);
    ctx.fillRect(11, 9, 2, 1);
    ctx.fillRect(20, 12, 2, 1);
  });
}

function paintDirt(ctx) {
  clipFace(ctx, isoTop, () => {
    ctx.fillStyle = withAlpha('#6a4f30', 0.5);
    for (let i = 0; i < 6; i++) ctx.fillRect(7 + ((i * 6) % 16), 7 + ((i * 4) % 8), 3, 2);
    ctx.fillStyle = withAlpha('#a8875c', 0.4);
    ctx.fillRect(12, 10, 2, 2);
  });
}

function paintIronBlock(ctx) {
  clipFace(ctx, isoTop, () => {
    ctx.strokeStyle = withAlpha('#ffffff', 0.5);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(5, 7); ctx.lineTo(15, 4); ctx.lineTo(26, 8);
    ctx.moveTo(7, 12); ctx.lineTo(18, 9);
    ctx.stroke();
    ctx.fillStyle = withAlpha('#7a838c', 0.45);
    ctx.fillRect(11, 12, 5, 3);
  });
  clipFace(ctx, isoLeft, () => {
    ctx.strokeStyle = withAlpha('#ffffff', 0.3);
    ctx.beginPath();
    ctx.moveTo(4, 16); ctx.lineTo(13, 22);
    ctx.stroke();
  });
  clipFace(ctx, isoRight, () => {
    ctx.fillStyle = withAlpha('#000000', 0.14);
    ctx.fillRect(20, 20, 5, 3);
  });
}

function paintIronOre(ctx) {
  // Pépites beige-rosé à facettes, accordées au rocher du monde.
  const NUG = '#d8ae8a', NUG_HI = '#eec9a2', NUG_OUT = '#7a5232';
  const nugget = (x, y, w, h) => {
    ctx.fillStyle = NUG_OUT; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = NUG; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = NUG_HI; ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y, 1, h);
    ctx.fillStyle = '#fbe8d4'; ctx.fillRect(x + 1, y + 1, 1, 1);
  };
  clipFace(ctx, isoTop, () => {
    nugget(7, 6, 5, 4);
    nugget(16, 9, 5, 4);
    nugget(11, 12, 4, 3);
  });
  clipFace(ctx, isoLeft, () => {
    nugget(4, 15, 4, 4);
    nugget(10, 22, 3, 3);
  });
  clipFace(ctx, isoRight, () => {
    nugget(19, 17, 5, 4);
  });
}

function paintFurnace(ctx) {
  clipFace(ctx, isoTop, () => {
    ctx.fillStyle = '#2a2b2e';
    ctx.fillRect(10, 9, 12, 12);
    ctx.fillStyle = '#1d1e21';
    ctx.fillRect(11, 10, 10, 10);
    ctx.fillStyle = '#4e5056';
    ctx.fillRect(6, 5, 2, 2);
    ctx.fillRect(24, 5, 2, 2);
    ctx.fillRect(6, 24, 2, 2);
    ctx.fillRect(24, 24, 2, 2);
  });
  clipFace(ctx, isoLeft, () => {
    ctx.fillStyle = withAlpha('#000000', 0.16);
    ctx.fillRect(4, 18, 4, 4);
  });
  clipFace(ctx, isoRight, () => {
    ctx.fillStyle = withAlpha('#000000', 0.12);
    ctx.fillRect(20, 19, 5, 3);
  });
}

function paintWoolBlock(ctx) {
  clipFace(ctx, isoTop, () => {
    ctx.fillStyle = withAlpha('#ffffff', 0.6);
    for (let i = 0; i < 6; i++) {
      const x = 5 + ((i * 7) % 20);
      const y = 5 + ((i * 5) % 12);
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = withAlpha('#c8c8c8', 0.45);
    for (let i = 0; i < 4; i++) {
      const x = 8 + ((i * 8) % 14);
      const y = 8 + ((i * 6) % 8);
      ctx.beginPath();
      ctx.arc(x, y, 1.7, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

const BLOCK_PAINTERS = {
  wood: paintWood,
  stone: paintStone,
  plank: paintPlank,
  brick: paintBrick,
  glass: paintGlass,
  sandBlock: paintSand,
  dirtBlock: paintDirt,
  ironBlock: paintIronBlock,
  ironOre: paintIronOre,
  furnace: paintFurnace,
  woolBlock: paintWoolBlock,
};

function drawBlockCubeIcon(ctx, blockId) {
  const def = BLOCK_DEFS[blockId];
  if (!def) return;
  const color = def.color;
  const top = shade(color, 1.22);
  const left = shade(color, 0.88);
  const right = shade(color, 0.64);
  const glass = blockId === 'glass';

  ctx.save();
  if (glass) ctx.globalAlpha = 0.78;

  // Ombre au sol de l'icône
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(16, 29, 11, 3.2, 0, 0, Math.PI * 2);
  ctx.fill();

  fillFace(ctx, isoRight, right);
  fillFace(ctx, isoLeft, left);
  fillFace(ctx, isoTop, top);

  const painter = BLOCK_PAINTERS[blockId];
  if (painter) painter(ctx, top, left, right);

  // Reflet sur l'arête nord-ouest
  ctx.strokeStyle = withAlpha('#ffffff', glass ? 0.7 : 0.4);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(16, 4);
  ctx.lineTo(3, 10);
  ctx.stroke();

  strokeCube(ctx, color);
  ctx.restore();
}

function createIconCanvas() {
  const c = document.createElement('canvas');
  c.width = SIZE;
  c.height = SIZE;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return { c, ctx };
}

function renderIcon(id) {
  const def = ITEM_DEFS[id];
  if (!def) return null;
  const { c, ctx } = createIconCanvas();
  clearCanvas(ctx);

  // Les icônes « personnalisées » (outils, lingot, porte…) passent d'abord.
  const drawer = TOOL_DRAWERS[id];
  if (drawer) {
    dropShadow(ctx, () => drawer(ctx));
  } else if (def.place && BLOCK_DEFS[def.place]) {
    drawBlockCubeIcon(ctx, def.place);
  }

  spriteCache.set(id, c);
  return c.toDataURL('image/png');
}

// Construit toutes les icônes une seule fois (idempotent).
export function initIcons() {
  if (ready) return;
  buildTileset();
  for (const id of ALL_ITEMS) {
    const url = renderIcon(id);
    if (url) urlCache.set(id, url);
  }
  ready = true;
}

// URL PNG de l'icône d'un objet, ou null.
export function getItemIconURL(id) {
  return urlCache.get(id) || null;
}

// Canvas (sprite) d'un objet, pour le dessiner dans le monde (au sol / en main).
export function getItemSprite(id) {
  return spriteCache.get(id) || null;
}

// Dessine l'icône d'un objet à une position / taille / rotation données.
export function drawItemSprite(ctx, id, x, y, size = 16, rotation = 0) {
  const sprite = getItemSprite(id);
  if (!sprite) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
  ctx.restore();
}
