// ============================================================
//  AVANIA — Objet tenu en main
//  Quand le joueur sélectionne une case de la barre rapide
//  (touches 1–9 / molette), l'objet apparaît dans sa main :
//  outils brandis en diagonale, blocs en petit cube 3D.
// ============================================================

import { ITEM_DEFS } from './blocks.js';
import { appearanceColors } from './character.js';
import { shade } from './tileset.js';
import { drawItemSprite } from './icons.js';

// Positions locales (cube = 30 px, origine aux pieds).
// z = -1 : l'objet passe derrière le corps (regard vers le haut).
const TOOL_POSES = {
  down:  { x: 13, y: -8,  rot: 0.55,  handX: 8,  handY: -6,  z: 1 },
  up:    { x: -11, y: -21, rot: -0.35, handX: -8, handY: -17, z: -1 },
  left:  { x: -14, y: -12, rot: -1.15, handX: -10, handY: -9, z: 1 },
  right: { x: 14, y: -12, rot: 1.15,  handX: 10, handY: -9,  z: 1 },
};

const BLOCK_POSES = {
  down:  { x: 11, y: -7,  rot: 0.12, handX: 7,  handY: -5,  z: 1 },
  up:    { x: -10, y: -20, rot: -0.1, handX: -7, handY: -16, z: -1 },
  left:  { x: -13, y: -11, rot: -0.2, handX: -9, handY: -8,  z: 1 },
  right: { x: 13, y: -11, rot: 0.2,  handX: 9,  handY: -8,  z: 1 },
};

function voxel(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fillRect(x, y, w, Math.max(1, Math.floor(h * 0.3)));
  ctx.fillRect(x, y, Math.max(1, Math.floor(w * 0.3)), h);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x + w - 1, y, 1, h);
}

// L'objet doit-il être dessiné derrière le cube (regard au nord) ?
export function heldItemIsBehind(facing) {
  return facing === 'up';
}

export function drawHeldItem(ctx, app, itemId, x, y, opts = {}) {
  const def = ITEM_DEFS[itemId];
  if (!def) return;

  const {
    facing = 'down',
    walkPhase = 0,
    scale = 1,
    mining = false,
    swing = 0,
    time = 0,
    pop = 0,
    shadow = true,
  } = opts;

  // Les vrais outils (et le bâton) se tiennent en diagonale ; les matériaux
  // et blocs en petit cube (comme le bloc tenu dans Minecraft).
  const tool = def.type === 'tool' || itemId === 'stick';
  const poses = tool ? TOOL_POSES : BLOCK_POSES;
  const pose = poses[facing] || poses.down;

  const bob = Math.sin(walkPhase) * 1.4;
  const squash = 1 + Math.sin(walkPhase * 2) * 0.04;
  const idle = Math.sin(time * 2.4) * 0.5;
  const walkSwing = Math.sin(walkPhase) * (tool ? 0.16 : 0.08);
  // Balancement de minage : `swing` est un sinus propre (0 au repos, ±1 en
  // plein geste) piloté par la boucle de jeu — plus de vibration parasite.
  const chop = swing * (tool ? 0.92 : 0.4);
  const popScale = 1 + Math.sin(Math.min(1, pop) * Math.PI) * 0.28;

  let rot = pose.rot + walkSwing + chop;
  if (def.toolType === 'sword') rot *= 0.6;

  // Les outils sont légèrement plus grands pour rester bien lisibles en main.
  const size = (tool ? 20 : 13) * popScale;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.translate(0, -bob);
  ctx.scale(1, squash);

  const ix = pose.x;
  // Pendant le minage, l'objet est légèrement poussé vers la cible.
  const iy = pose.y + idle + (mining ? 1.6 : 0);

  // Petite main (voxel de peau) qui "tient" l'objet.
  const colors = appearanceColors(app);
  voxel(ctx, pose.handX, pose.handY + idle * 0.4, 5, 5, colors.skin);
  ctx.strokeStyle = shade(colors.skin, 0.55);
  ctx.lineWidth = 0.8;
  ctx.strokeRect(pose.handX + 0.4, pose.handY + idle * 0.4 + 0.4, 4.2, 4.2);

  if (shadow) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(ix, 1, size * 0.28, size * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  drawItemSprite(ctx, itemId, ix, iy, size, rot);
  ctx.restore();
}
