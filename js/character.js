// ============================================================
//  AVANIA — Personnage CARRE, 100% personnalisable (vue top-down)
//  Chaque élément est un "voxel" doux : couleur + contour +
//  reflet haut + ombre basse, pour un rendu 3D mignon et lisible.
// ============================================================

import {
  SKIN_TONES, HAIR_STYLES, HAIR_COLORS, EYE_COLORS,
  SHIRT_COLORS, PANTS_COLORS, HATS, GLASSES,
} from './config.js';
import { shade } from './tileset.js';

export function resolveColor(list, id) {
  const found = list.find((e) => e.id === id);
  return found ? found.color : (list[0] && list[0].color);
}

export function appearanceColors(app) {
  return {
    skin: resolveColor(SKIN_TONES, app.skin),
    hair: resolveColor(HAIR_COLORS, app.hairColor),
    eyes: resolveColor(EYE_COLORS, app.eyes),
    shirt: resolveColor(SHIRT_COLORS, app.shirt),
    pants: resolveColor(PANTS_COLORS, app.pants),
  };
}

function withAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

// Dessine un "voxel" (carré ombré + contour + reflet)
function voxel(ctx, x, y, w, h, color, o = {}) {
  const { outline = true, hl = true, sh = true, hlHeight } = o;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  if (outline) {
    ctx.strokeStyle = shade(color, 0.72);
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }
  if (hl) {
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(x + 1, y + 1, Math.max(0, w - 2), Math.max(1, hlHeight || Math.floor(h * 0.3)));
  }
  if (sh) {
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    ctx.fillRect(x + 1, y + h - 2, Math.max(0, w - 2), Math.min(2, h));
  }
}

// Dessine le personnage centré sur (x, y) — y = point de contact au sol.
export function drawCharacter(ctx, app, x, y, opts = {}) {
  const { facing = 'down', walkPhase = 0, scale = 1, blink = false } = opts;
  const c = appearanceColors(app);
  const bob = Math.sin(walkPhase) * 1.3;
  const step = Math.sin(walkPhase) * 3;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // Ombre douce au sol
  const sg = ctx.createRadialGradient(0, 1, 2, 0, 1, 11);
  sg.addColorStop(0, 'rgba(0,0,0,0.30)');
  sg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.ellipse(0, 1, 11, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // ---- Jambes (pantalon) ----
  voxel(ctx, -9 + step, -7, 8, 8, c.pants);
  voxel(ctx, 1 - step, -7, 8, 8, c.pants);
  // ---- Chaussures ----
  voxel(ctx, -9 + step, -4, 8, 4, '#3a3a3a', { hl: false });
  voxel(ctx, 1 - step, -4, 8, 4, '#3a3a3a', { hl: false });

  // ---- Corps (haut) ----
  const bodyY = -21 - bob;
  voxel(ctx, -9, bodyY, 18, 14, c.shirt);
  // détail : liseré bas de chemise
  ctx.fillStyle = shade(c.shirt, 0.85);
  ctx.fillRect(-9, bodyY + 12, 18, 2);

  // ---- Bras ----
  const swing = Math.sin(walkPhase) * 2.5;
  voxel(ctx, -14 - swing, bodyY + 2, 5, 10, c.shirt);
  voxel(ctx, 9 + swing, bodyY + 2, 5, 10, c.shirt);
  // ---- Mains (peau) ----
  voxel(ctx, -14 - swing, bodyY + 9, 5, 3, c.skin, { outline: false });

  voxel(ctx, 9 + swing, bodyY + 9, 5, 3, c.skin, { outline: false });

  // ---- Tête (carré) ----
  const headY = -37 - bob;
  voxel(ctx, -8, headY, 16, 16, c.skin);

  // ---- Cheveux ----
  drawHair(ctx, app, c.hair, headY, facing);

  // ---- Visage selon l'orientation ----
  drawFace(ctx, app, c, headY, facing, blink);

  // ---- Pilosité faciale (barbe / moustache / bouc) ----
  if (app.facialHair && app.facialHair !== 'none') drawFacialHair(ctx, app.facialHair, c.hair, headY, facing);

  // ---- Lunettes ----
  if (app.glasses && app.glasses !== 'none') drawGlasses(ctx, app.glasses, headY, facing);

  // ---- Chapeau ----
  if (app.hat && app.hat !== 'none') drawHat(ctx, app, c, headY, facing);

  ctx.restore();
}

function drawHair(ctx, app, hairColor, headY, facing) {
  const style = app.hairStyle;
  if (style === 'chauve') return;
  ctx.fillStyle = hairColor;
  ctx.strokeStyle = shade(hairColor, 0.72);
  ctx.lineWidth = 1.1;

  if (style === 'court' || style === 'mi-long' || style === 'long') {
    // dessus de tête
    ctx.fillRect(-8, headY - 4, 16, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(-8, headY - 4, 16, 2);
    ctx.fillStyle = hairColor;
    // frange selon l'orientation
    if (facing === 'down') ctx.fillRect(-8, headY + 1, 16, 4);
    else if (facing === 'left') ctx.fillRect(-11, headY + 1, 4, 14);
    else if (facing === 'right') ctx.fillRect(7, headY + 1, 4, 14);
    else ctx.fillRect(-8, headY + 1, 16, 4);

    if (style === 'mi-long') {
      ctx.fillRect(-11, headY + 2, 3, 12);
      ctx.fillRect(8, headY + 2, 3, 12);
    }
    if (style === 'long') {
      ctx.fillRect(-11, headY - 1, 3, 16);
      ctx.fillRect(8, headY - 1, 3, 16);
      ctx.fillRect(-8, headY + 13, 16, 4);
    }
  }

  if (style === 'mohawk') {
    ctx.fillRect(-8, headY - 3, 16, 5);
    ctx.fillRect(-3, headY - 9, 6, 7);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(-3, headY - 9, 6, 2);
  }

  if (style === 'chignon') {
    ctx.fillRect(-8, headY - 3, 16, 5);
    voxel(ctx, -5, headY - 11, 10, 8, hairColor);
  }

  if (style === 'casquette') {
    ctx.fillRect(-8, headY - 4, 16, 6);
    if (facing === 'down') ctx.fillRect(-5, headY + 1, 10, 4);
    else if (facing === 'up') ctx.fillRect(-5, headY - 8, 10, 4);
    else if (facing === 'left') ctx.fillRect(-13, headY - 1, 5, 6);
    else ctx.fillRect(8, headY - 1, 5, 6);
  }

  if (style === 'afro') {
    // grosse couronne de cheveux autour de la tête
    ctx.fillRect(-9, headY - 8, 18, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(-9, headY - 8, 18, 3);
    ctx.fillStyle = hairColor;
    ctx.fillRect(-11, headY - 3, 3, 13);
    ctx.fillRect(8, headY - 3, 3, 13);
    ctx.fillRect(-9, headY + 11, 18, 4);
    if (facing === 'down') ctx.fillRect(-9, headY + 1, 3, 4);
  }

  if (style === 'degrades') {
    // côtés rasés, dessus volumineux
    ctx.fillRect(-8, headY - 6, 16, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(-8, headY - 6, 16, 2);
    ctx.fillStyle = hairColor;
    if (facing === 'down') ctx.fillRect(-7, headY + 1, 14, 4);
    else if (facing === 'left') ctx.fillRect(-11, headY + 1, 4, 14);
    else if (facing === 'right') ctx.fillRect(7, headY + 1, 4, 14);
    else ctx.fillRect(-8, headY + 1, 16, 4);
  }

  if (style === 'queue') {
    // cheveux attachés en queue de cheval (visible de dos)
    ctx.fillRect(-8, headY - 4, 16, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(-8, headY - 4, 16, 2);
    ctx.fillStyle = hairColor;
    if (facing === 'down') ctx.fillRect(-8, headY + 1, 16, 3);
    else if (facing === 'left') ctx.fillRect(-11, headY + 1, 4, 13);
    else if (facing === 'right') ctx.fillRect(7, headY + 1, 4, 13);
    if (facing === 'up') ctx.fillRect(-4, headY - 13, 8, 11);
    else ctx.fillRect(-3, headY + 12, 6, 4);
  }

  if (style === 'tresses') {
    // tresses longues de part et d'autre
    ctx.fillRect(-8, headY - 4, 16, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(-8, headY - 4, 16, 2);
    ctx.fillStyle = hairColor;
    ctx.fillRect(-8, headY + 1, 16, 3);
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(-12, headY + 1 + i * 4, 4, 3);
      ctx.fillRect(8, headY + 1 + i * 4, 4, 3);
    }
  }
}

function drawFace(ctx, app, c, headY, facing, blink = false) {
  if (facing === 'up') return; // dos de la tête
  let ox = 0, oy = 0;
  if (facing === 'down') { ox = 0; oy = 4; }
  else if (facing === 'left') { ox = -5; oy = 0; }
  else if (facing === 'right') { ox = 5; oy = 0; }

  // sourcils (couleur des cheveux)
  ctx.fillStyle = c.hair;
  ctx.fillRect(-5 + ox, headY + oy - 1.5, 3.5, 1.5);
  ctx.fillRect(3 + ox, headY + oy - 1.5, 3.5, 1.5);

  if (blink) {
    // yeux fermés (clignement)
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(-5 + ox, headY + oy + 1, 3.5, 1.5);
    ctx.fillRect(3 + ox, headY + oy + 1, 3.5, 1.5);
  } else {
    // yeux carrés + reflet
    ctx.fillStyle = c.eyes;
    ctx.fillRect(-5 + ox, headY + oy, 3.5, 3.5);
    ctx.fillRect(3 + ox, headY + oy, 3.5, 3.5);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(-5 + ox, headY + oy, 1.5, 1.5);
    ctx.fillRect(3 + ox, headY + oy, 1.5, 1.5);
  }

  // bouche
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  if (facing === 'down') ctx.fillRect(-2, headY + 10, 5, 2);
  else ctx.fillRect(ox - 2, headY + 7, 5, 2);

  // joues rosées
  ctx.fillStyle = withAlpha('#f2a6a6', 0.5);
  if (facing === 'down') {
    ctx.fillRect(-8, headY + 6, 3, 3);
    ctx.fillRect(6, headY + 6, 3, 3);
  }
}

function drawFacialHair(ctx, kind, hairColor, headY, facing) {
  if (facing === 'up') return;
  let ox = 0;
  if (facing === 'left') ox = -5;
  else if (facing === 'right') ox = 5;

  ctx.fillStyle = hairColor;

  if (kind === 'moustache') {
    ctx.fillRect(-4 + ox, headY + 8, 4, 2);
    ctx.fillRect(1 + ox, headY + 8, 4, 2);
  } else if (kind === 'bouc') {
    ctx.fillRect(-3 + ox, headY + 8, 3, 2); // moustache fine
    ctx.fillRect(1 + ox, headY + 8, 3, 2);
    ctx.fillRect(-3 + ox, headY + 11, 7, 4); // menton
  } else if (kind === 'barbe') {
    ctx.fillRect(-7 + ox, headY + 6, 3, 9);
    ctx.fillRect(5 + ox, headY + 6, 3, 9);
    ctx.fillRect(-6 + ox, headY + 10, 13, 2);
    ctx.fillRect(-4 + ox, headY + 11, 9, 4);
  }
}

function drawGlasses(ctx, kind, headY, facing) {
  if (facing === 'up') return;
  let ox = 0, oy = 0;
  if (facing === 'down') { ox = 0; oy = 4; }
  else if (facing === 'left') { ox = -5; oy = 0; }
  else if (facing === 'right') { ox = 5; oy = 0; }

  const lens = kind === 'soleil' ? 'rgba(25,25,35,0.9)' : 'rgba(190,230,250,0.45)';
  const frame = '#2a2a2a';

  if (kind === 'rondes') {
    ctx.fillStyle = frame;
    ctx.beginPath();
    ctx.arc(-4 + ox, headY + 2 + oy, 3.2, 0, Math.PI * 2);
    ctx.arc(4 + ox, headY + 2 + oy, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = lens;
    ctx.beginPath();
    ctx.arc(-4 + ox, headY + 2 + oy, 2.1, 0, Math.PI * 2);
    ctx.arc(4 + ox, headY + 2 + oy, 2.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = frame;
    ctx.fillRect(-1 + ox, headY + 1 + oy, 2, 3);
  } else if (kind === 'demi-lune') {
    ctx.fillStyle = frame;
    ctx.fillRect(-7 + ox, headY + 3 + oy, 5, 3);
    ctx.fillRect(3 + ox, headY + 3 + oy, 5, 3);
    ctx.fillStyle = lens;
    ctx.fillRect(-6 + ox, headY + 4 + oy, 3, 2);
    ctx.fillRect(4 + ox, headY + 4 + oy, 3, 2);
    ctx.fillStyle = frame;
    ctx.fillRect(-1 + ox, headY + 3 + oy, 2, 3);
  } else {
    ctx.fillStyle = frame;
    ctx.fillRect(-7 + ox, headY + oy, 5, 6);
    ctx.fillRect(3 + ox, headY + oy, 5, 6);
    ctx.fillStyle = lens;
    ctx.fillRect(-6 + ox, headY + 1 + oy, 3, 4);
    ctx.fillRect(4 + ox, headY + 1 + oy, 3, 4);
    ctx.fillStyle = frame;
    ctx.fillRect(-1 + ox, headY + 2 + oy, 3, 2);
  }
}

function drawHat(ctx, app, c, headY, facing) {
  const hat = app.hat;
  if (hat === 'casquette') {
    voxel(ctx, -8, headY - 6, 16, 6, c.shirt);
    ctx.fillStyle = shade(c.shirt, 0.75);
    if (facing === 'down') ctx.fillRect(-6, headY, 12, 3);
    else if (facing === 'up') ctx.fillRect(-6, headY - 9, 12, 3);
    else if (facing === 'left') ctx.fillRect(-12, headY - 2, 4, 6);
    else ctx.fillRect(8, headY - 2, 4, 6);
  } else if (hat === 'bonnet') {
    voxel(ctx, -8, headY - 6, 16, 6, '#c94f4f');
    voxel(ctx, -4, headY - 11, 8, 6, '#c94f4f');
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(-8, headY - 6, 16, 2);
  } else if (hat === 'paille') {
    voxel(ctx, -9, headY - 5, 18, 4, '#ecd48a');
    voxel(ctx, -6, headY - 10, 12, 6, '#d9b95f');
    ctx.fillStyle = '#c94f3f';
    ctx.fillRect(-6, headY - 7, 12, 2);
  } else if (hat === 'casque') {
    voxel(ctx, -8, headY - 7, 16, 6, '#f2c14e');
    voxel(ctx, -5, headY - 10, 10, 3, '#f2c14e');
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(-6, headY - 9, 12, 2);
  } else if (hat === 'melon') {
    voxel(ctx, -8, headY - 5, 16, 4, '#2a2a2a');
    voxel(ctx, -5, headY - 11, 10, 7, '#3a3a3a');
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(-5, headY - 11, 10, 2);
  } else if (hat === 'haut-de-forme') {
    voxel(ctx, -8, headY - 5, 16, 4, '#2a2a2a');
    voxel(ctx, -5, headY - 15, 10, 11, '#3a3a3a');
    ctx.fillStyle = '#c94040';
    ctx.fillRect(-5, headY - 8, 10, 2);
  } else if (hat === 'couronne') {
    voxel(ctx, -8, headY - 5, 16, 4, '#e6c23c');
    for (let i = 0; i < 3; i++) {
      voxel(ctx, -7 + i * 5, headY - 10, 4, 6, '#f2c14e');
    }
    ctx.fillStyle = '#e03a4e';
    ctx.fillRect(-7, headY - 5, 4, 2);
    ctx.fillRect(4, headY - 5, 4, 2);
  }
}
