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
import { buildTileset, shade } from './tileset.js';

const SIZE = 32;
const urlCache = new Map();
const spriteCache = new Map();
let ready = false;

// Palettes d'outils : base + reflet + ombre + fil / métal.
const TOOL_COLORS = {
  wood:  { base: '#c48642', light: '#e8b46a', dark: '#7a4a22', mid: '#a86a32', edge: '#f0d090' },
  stone: { base: '#a4a4ac', light: '#d8d8de', dark: '#5a5a64', mid: '#888890', edge: '#f0f0f4' },
  iron:  { base: '#c6ccd2', light: '#eef2f6', dark: '#676f78', mid: '#96a0a9', edge: '#ffffff' },
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

const TOOL_DRAWERS = {
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
  stick:          (ctx) => drawStick(ctx, TOOL_COLORS.stick),
  rawIron:        (ctx) => drawRawIron(ctx),
  ironIngot:      (ctx) => drawIronIngot(ctx),
  door:           (ctx) => drawDoorIcon(ctx),
  wool:           (ctx) => drawWool(ctx),
  rawBeef:        (ctx) => drawRawBeef(ctx),
  cookedBeef:     (ctx) => drawCookedBeef(ctx),
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
    ctx.strokeStyle = withAlpha(shade(top, 0.78), 0.85);
    ctx.lineWidth = 1;
    for (const y of [7, 11, 14]) {
      ctx.beginPath();
      ctx.moveTo(4, y);
      ctx.lineTo(28, y + 1);
      ctx.stroke();
    }
    ctx.fillStyle = withAlpha('#8a5a2e', 0.7);
    ctx.beginPath(); ctx.arc(12, 10, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(21, 13, 1.2, 0, Math.PI * 2); ctx.fill();
  });
  clipFace(ctx, isoLeft, () => {
    ctx.strokeStyle = withAlpha('#000000', 0.18);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(4, 14); ctx.lineTo(14, 28); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(9, 13); ctx.lineTo(15, 26); ctx.stroke();
  });
  clipFace(ctx, isoRight, () => {
    ctx.strokeStyle = withAlpha('#000000', 0.16);
    ctx.beginPath(); ctx.moveTo(18, 18); ctx.lineTo(28, 14); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(18, 24); ctx.lineTo(27, 20); ctx.stroke();
  });
}

function paintStone(ctx) {
  clipFace(ctx, isoTop, () => {
    ctx.strokeStyle = withAlpha('#000000', 0.18);
    ctx.beginPath();
    ctx.moveTo(8, 9); ctx.lineTo(14, 7); ctx.lineTo(18, 12);
    ctx.moveTo(18, 12); ctx.lineTo(25, 11);
    ctx.stroke();
    ctx.fillStyle = withAlpha('#ffffff', 0.2);
    ctx.fillRect(8, 8, 4, 2);
  });
  clipFace(ctx, isoLeft, () => {
    ctx.strokeStyle = withAlpha('#000000', 0.2);
    ctx.beginPath();
    ctx.moveTo(5, 16); ctx.lineTo(10, 22); ctx.lineTo(8, 26);
    ctx.stroke();
  });
  clipFace(ctx, isoRight, () => {
    ctx.fillStyle = withAlpha('#000000', 0.12);
    ctx.fillRect(20, 20, 5, 3);
    ctx.fillStyle = withAlpha('#ffffff', 0.1);
    ctx.fillRect(22, 14, 4, 2);
  });
}

function paintPlank(ctx) {
  clipFace(ctx, isoTop, () => {
    ctx.strokeStyle = withAlpha('#5a3a1e', 0.55);
    ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(4, 8); ctx.lineTo(28, 10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(4, 13); ctx.lineTo(28, 15); ctx.stroke();
    ctx.fillStyle = '#5a3a1e';
    for (const [x, y] of [[8, 6], [22, 8], [10, 14], [20, 12]]) ctx.fillRect(x, y, 2, 2);
  });
  clipFace(ctx, isoLeft, () => {
    ctx.strokeStyle = withAlpha('#5a3a1e', 0.45);
    ctx.beginPath(); ctx.moveTo(2, 16); ctx.lineTo(16, 23); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(2, 21); ctx.lineTo(16, 28); ctx.stroke();
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
