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
//  Outils — pose diagonale (comme un item tenu en main)
// ------------------------------------------------------------
function withItemPose(ctx, fn) {
  ctx.save();
  ctx.translate(16, 17);
  ctx.rotate(-0.62);
  ctx.translate(-16, -16);
  fn();
  ctx.restore();
}

function drawHandle(ctx, x, y, w, h, wood) {
  voxel(ctx, x, y, w, h, wood);
  // Grain du bois
  ctx.fillStyle = withAlpha(wood.dark, 0.35);
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(x + 1, y + 3 + i * 5, w - 2, 1);
  }
  // Lien de cuir à mi-manche
  const wrapY = y + Math.floor(h * 0.42);
  voxel(ctx, x - 1, wrapY, w + 2, 4, TOOL_COLORS.wrap);
  px(ctx, x, wrapY + 1, w, 1, TOOL_COLORS.wrap.light);
}

function drawPickaxe(ctx, head, handle) {
  withItemPose(ctx, () => {
    drawHandle(ctx, 14, 10, 4, 20, handle);
    // Tête en arche : barre + deux dents
    voxel(ctx, 4, 3, 24, 5, head);
    voxel(ctx, 4, 8, 6, 8, head);
    voxel(ctx, 22, 8, 6, 8, head);
    // Pointe des dents
    voxel(ctx, 3, 14, 5, 4, head);
    voxel(ctx, 24, 14, 5, 4, head);
    // Socket / rivet
    px(ctx, 15, 5, 2, 3, head.dark);
    px(ctx, 14, 6, 4, 2, head.light);
    // Fil tranchant
    px(ctx, 4, 3, 24, 1, head.edge);
    px(ctx, 3, 16, 5, 1, head.edge);
    px(ctx, 24, 16, 5, 1, head.edge);
  });
}

function drawAxe(ctx, head, handle) {
  withItemPose(ctx, () => {
    drawHandle(ctx, 16, 10, 4, 20, handle);
    // Lame large à gauche, légèrement évasée
    voxel(ctx, 5, 4, 15, 6, head);
    voxel(ctx, 3, 9, 17, 6, head);
    voxel(ctx, 5, 14, 12, 4, head);
    // Tranchant (bord gauche)
    px(ctx, 3, 9, 1, 6, head.edge);
    px(ctx, 5, 4, 1, 6, head.light);
    // Rivet sur le manche
    px(ctx, 16, 11, 4, 3, head.dark);
    px(ctx, 17, 12, 2, 1, head.light);
  });
}

function drawShovel(ctx, head, handle) {
  withItemPose(ctx, () => {
    drawHandle(ctx, 14, 2, 4, 16, handle);
    // Col
    voxel(ctx, 13, 16, 6, 3, head);
    // Pelle évasée
    voxel(ctx, 8, 18, 16, 7, head);
    voxel(ctx, 10, 25, 12, 4, head);
    // Creux de la pelle (l'intérieur)
    px(ctx, 11, 20, 10, 4, head.dark);
    px(ctx, 12, 21, 8, 2, withAlpha(head.light, 0.35));
    // Fil du bord
    px(ctx, 8, 18, 16, 1, head.edge);
    px(ctx, 10, 28, 12, 1, head.dark);
  });
}

function drawSword(ctx, blade, handle) {
  withItemPose(ctx, () => {
    // Lame longue, arête centrale
    voxel(ctx, 14, 1, 4, 20, blade);
    px(ctx, 15, 2, 1, 18, blade.edge);
    px(ctx, 17, 3, 1, 17, blade.dark);
    // Pointe
    voxel(ctx, 15, 0, 2, 2, blade);
    px(ctx, 15, 0, 2, 1, blade.edge);
    // Garde
    voxel(ctx, 8, 20, 16, 3, handle);
    px(ctx, 8, 20, 16, 1, handle.light);
    // Poignée
    voxel(ctx, 14, 23, 4, 6, TOOL_COLORS.wrap);
    px(ctx, 14, 24, 4, 1, TOOL_COLORS.wrap.light);
    px(ctx, 14, 26, 4, 1, TOOL_COLORS.wrap.light);
    // Pommeau
    voxel(ctx, 13, 28, 6, 3, handle);
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

const TOOL_DRAWERS = {
  wooden_pickaxe: (ctx) => drawPickaxe(ctx, TOOL_COLORS.wood, TOOL_COLORS.wood),
  stone_pickaxe:  (ctx) => drawPickaxe(ctx, TOOL_COLORS.stone, TOOL_COLORS.stick),
  wooden_axe:     (ctx) => drawAxe(ctx, TOOL_COLORS.wood, TOOL_COLORS.wood),
  stone_axe:      (ctx) => drawAxe(ctx, TOOL_COLORS.stone, TOOL_COLORS.stick),
  wooden_shovel:  (ctx) => drawShovel(ctx, TOOL_COLORS.wood, TOOL_COLORS.wood),
  stone_shovel:   (ctx) => drawShovel(ctx, TOOL_COLORS.stone, TOOL_COLORS.stick),
  wooden_sword:   (ctx) => drawSword(ctx, TOOL_COLORS.wood, TOOL_COLORS.wood),
  stone_sword:    (ctx) => drawSword(ctx, TOOL_COLORS.stone, TOOL_COLORS.stick),
  stick:          (ctx) => drawStick(ctx, TOOL_COLORS.stick),
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

const BLOCK_PAINTERS = {
  wood: paintWood,
  stone: paintStone,
  plank: paintPlank,
  brick: paintBrick,
  glass: paintGlass,
  sandBlock: paintSand,
  dirtBlock: paintDirt,
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

  if (def.place && BLOCK_DEFS[def.place]) {
    drawBlockCubeIcon(ctx, def.place);
  } else {
    const drawer = TOOL_DRAWERS[id];
    if (drawer) {
      dropShadow(ctx, (shadow) => {
        if (shadow) {
          ctx.fillStyle = '#000';
          drawer(ctx);
        } else {
          drawer(ctx);
        }
      });
    }
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
