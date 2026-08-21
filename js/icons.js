// ============================================================
//  AVANIA — Icônes d'objets (vrais sprites, sans emoji)
//  Chaque objet de l'inventaire / du craft reçoit une vraie
//  icône dessinée en code (style voxel cohérent avec le jeu),
//  puis exportée en image PNG pour un rendu net dans l'UI.
//
//  - Les blocs posables réutilisent leur tuile en jeu (32 px),
//    pour un affichage « ce que tu poses est ce que tu vois ».
//  - Les outils (pioche, hache, pelle, épée) et le bâton sont
//    dessinés en pixel-art dédié.
// ============================================================

import { ALL_ITEMS, ITEM_DEFS } from './blocks.js';
import { buildTileset, getTileCanvas } from './tileset.js';

const SIZE = 32;
const urlCache = new Map();
const spriteCache = new Map();
let ready = false;

// Palettes d'outils : base + reflet clair + ombre sombre (style voxel).
const TOOL_COLORS = {
  wood:  { base: '#b07a3c', light: '#d9a066', dark: '#6e4426' },
  stone: { base: '#9a9aa3', light: '#c7c7ce', dark: '#6a6a72' },
  stick: { base: '#c89a5e', light: '#e0b47e', dark: '#8a5a2e' },
};

// Petite brique "voxel" : remplissage + reflet en haut/gauche + ombre
// en bas/droite, comme les tuiles du monde.
function voxel(ctx, x, y, w, h, c) {
  ctx.fillStyle = c.base;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = c.light;
  ctx.fillRect(x, y, w, Math.max(1, Math.round(h * 0.28)));
  ctx.fillRect(x, y, Math.max(1, Math.round(w * 0.28)), h);
  ctx.fillStyle = c.dark;
  ctx.fillRect(x, y + h - 2, w, 2);
  ctx.fillRect(x + w - 2, y, 2, h);
}

function clearCanvas(ctx) {
  ctx.clearRect(0, 0, SIZE, SIZE);
}

// ------------------------------------------------------------
//  Outils — silhouettes simples et lisibles, poignée verticale.
// ------------------------------------------------------------
function drawPickaxe(ctx, head, handle) {
  // tête en arche (∩) au-dessus, manche au centre
  voxel(ctx, 5, 3, 22, 4, head);
  voxel(ctx, 5, 7, 5, 8, head);
  voxel(ctx, 22, 7, 5, 8, head);
  voxel(ctx, 14, 7, 4, 23, handle);
}

function drawAxe(ctx, head, handle) {
  // lame qui dépasse à gauche du manche
  voxel(ctx, 6, 6, 13, 5, head);
  voxel(ctx, 4, 11, 15, 5, head);
  voxel(ctx, 17, 13, 4, 17, handle);
}

function drawShovel(ctx, head, handle) {
  // pelle : lame évasée en bas du manche
  voxel(ctx, 14, 2, 4, 14, handle);
  voxel(ctx, 8, 16, 16, 8, head);
  voxel(ctx, 11, 24, 10, 5, head);
  voxel(ctx, 14, 29, 4, 2, head);
}

function drawSword(ctx, blade, handle) {
  // lame fine, garde, poignée
  voxel(ctx, 14, 2, 4, 22, blade);
  voxel(ctx, 8, 24, 16, 3, handle);
  voxel(ctx, 14, 27, 4, 4, handle);
}

function drawStick(ctx, c) {
  // bâton en diagonale
  ctx.save();
  ctx.translate(SIZE / 2, SIZE / 2);
  ctx.rotate(-Math.PI / 4);
  voxel(ctx, -2, -14, 4, 28, c);
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

  // Bloc posable -> on réutilise la tuile en jeu (rendu fidèle).
  if (def.place && getTileCanvas(def.place)) {
    ctx.drawImage(getTileCanvas(def.place), 0, 0, SIZE, SIZE);
  } else {
    // Outil / bâton -> sprite dédié (fond transparent).
    const drawer = TOOL_DRAWERS[id];
    if (drawer) drawer(ctx);
  }

  // On garde aussi le canvas brut : il sert à dessiner les objets
  // posés au sol (ramassage), sans repasser par un PNG.
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

// Canvas (sprite) d'un objet, pour le dessiner dans le monde (au sol).
export function getItemSprite(id) {
  return spriteCache.get(id) || null;
}
