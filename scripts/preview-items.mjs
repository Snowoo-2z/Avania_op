// ============================================================
//  AVANIA — Planche d'aperçu des icônes d'objets (hors navigateur)
//  Toute la table d'items × zoom, façon inventaire Minecraft.
// ============================================================

import { createCanvas } from '@napi-rs/canvas';

globalThis.document = {
  createElement(tag) {
    if (tag === 'canvas') return createCanvas(1, 1);
    return { style: {}, getContext: () => null, addEventListener: () => {} };
  },
};
globalThis.window = globalThis;

import { ALL_ITEMS, ITEM_DEFS } from '../js/blocks.js';
import { initIcons, getItemSprite } from '../js/icons.js';
import { writeFileSync, mkdirSync } from 'node:fs';

mkdirSync('preview', { recursive: true });

initIcons();

const CELL = 52;             // case d'inventaire (icône 32 + marge)
const COLS = 8;
const Z = 1;                 // la cellule affiche l'icône en taille réelle
const rows = Math.ceil(ALL_ITEMS.length / COLS);
const canvas = createCanvas(20 + COLS * CELL, 40 + rows * CELL);
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

ctx.fillStyle = '#16100b';
ctx.fillRect(0, 0, canvas.width, canvas.height);
ctx.fillStyle = '#c6c6c6';
ctx.font = 'bold 14px sans-serif';
ctx.fillText('Objets — taille réelle (×1)', 14, 22);

ALL_ITEMS.forEach((id, i) => {
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const x = 14 + col * CELL;
  const y = 34 + row * CELL;
  // case d'inventaire sombre (style Minecraft)
  ctx.fillStyle = '#8b8b8b';
  ctx.fillRect(x, y, CELL - 6, CELL - 6);
  ctx.fillStyle = '#373737';
  ctx.fillRect(x + 1, y + 1, CELL - 8, CELL - 8);
  ctx.fillStyle = '#ffffff22';
  ctx.fillRect(x + 1, y + 1, CELL - 8, 2);
  // icône 32 px centrée
  const sprite = getItemSprite(id);
  if (sprite) ctx.drawImage(sprite, x + 7, y + 7);
  ctx.fillStyle = '#9a9a9a';
  ctx.font = '8px sans-serif';
  ctx.fillText(ITEM_DEFS[id]?.label?.slice(0, 9) || id, x + 2, y + CELL - 4);
});

writeFileSync('preview/items.png', canvas.toBuffer('image/png'));
console.log('✔ preview/items.png');

// Gros plan ×3 sur les objets retravaillés : outils, fer, viande…
const FOCUS = [
  'wooden_pickaxe', 'stone_pickaxe', 'iron_pickaxe',
  'wooden_axe', 'stone_axe', 'iron_axe',
  'wooden_shovel', 'stone_shovel', 'iron_shovel',
  'wooden_sword', 'stone_sword', 'iron_sword',
  'stick', 'rawIron', 'ironIngot', 'ironOre',
  'rawBeef', 'cookedBeef', 'wool', 'glassBlock',
];
const FZ = 3;
const FCELL = 32 * FZ + 14;
const fcols = 7;
const focus = FOCUS.filter((id) => getItemSprite(id));
const frows = Math.ceil(focus.length / fcols);
const fc = createCanvas(16 + fcols * FCELL, 34 + frows * FCELL);
const fctx = fc.getContext('2d');
fctx.imageSmoothingEnabled = false;
fctx.fillStyle = '#16100b';
fctx.fillRect(0, 0, fc.width, fc.height);
fctx.fillStyle = '#c6c6c6';
fctx.font = 'bold 14px sans-serif';
fctx.fillText('Gros plan ×3 — objets retravaillés', 12, 22);
focus.forEach((id, i) => {
  const x = 12 + (i % fcols) * FCELL;
  const y = 30 + Math.floor(i / fcols) * FCELL;
  fctx.fillStyle = '#373737';
  fctx.fillRect(x, y, FCELL - 8, FCELL - 8);
  const sprite = getItemSprite(id);
  fctx.drawImage(sprite, x + 4, y + 4, 32 * FZ, 32 * FZ);
  fctx.fillStyle = '#9a9a9a';
  fctx.font = '9px sans-serif';
  fctx.fillText(id, x + 2, y + FCELL - 2);
});
writeFileSync('preview/items-gros-plan.png', fc.toBuffer('image/png'));
console.log('✔ preview/items-gros-plan.png');
