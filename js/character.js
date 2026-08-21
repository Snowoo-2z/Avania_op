// ============================================================
//  AVANIA — Personnage CARRE, 100% personnalisable (vue top-down)
//  Tête, corps, bras et jambes sont des carrés ; chaque élément
//  de l'apparence (peau, coiffure, yeux, tenue, chapeau, lunettes)
//  modifie le rendu.
// ============================================================

import {
  SKIN_TONES, HAIR_STYLES, HAIR_COLORS, EYE_COLORS,
  SHIRT_COLORS, PANTS_COLORS, HATS, GLASSES,
} from './config.js';

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

function shadeColor(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.min(255, Math.round(r * f));
  g = Math.min(255, Math.round(g * f));
  b = Math.min(255, Math.round(b * f));
  return `rgb(${r},${g},${b})`;
}

// Dessine le personnage centré sur (x, y) — y = point de contact au sol.
export function drawCharacter(ctx, app, x, y, opts = {}) {
  const { facing = 'down', walkPhase = 0, scale = 1 } = opts;
  const c = appearanceColors(app);
  const bob = Math.sin(walkPhase) * 1.2;
  const step = Math.sin(walkPhase) * 3;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // Ombre au sol (carré adouci)
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 11, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // ---- Jambes (pantalon) ----
  ctx.fillStyle = c.pants;
  ctx.fillRect(-9 + step, -7, 8, 7);   // jambe gauche
  ctx.fillRect(1 - step, -7, 8, 7);    // jambe droite
  // ---- Chaussures ----
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(-9 + step, -3, 8, 4);
  ctx.fillRect(1 - step, -3, 8, 4);

  // ---- Corps (haut) ----
  const bodyY = -19 - bob;
  ctx.fillStyle = c.shirt;
  ctx.fillRect(-9, bodyY, 18, 13);
  ctx.strokeStyle = shadeColor(c.shirt, 0.7);
  ctx.lineWidth = 1;
  ctx.strokeRect(-9, bodyY, 18, 13);

  // ---- Bras ----
  const swing = Math.sin(walkPhase) * 2;
  ctx.fillStyle = c.shirt;
  ctx.fillRect(-14 - swing, bodyY + 1, 5, 10); // bras gauche
  ctx.fillRect(9 + swing, bodyY + 1, 5, 10);   // bras droit
  // ---- Mains (peau) ----
  ctx.fillStyle = c.skin;
  ctx.fillRect(-14 - swing, bodyY + 8, 5, 3);
  ctx.fillRect(9 + swing, bodyY + 8, 5, 3);

  // ---- Tête (carré) ----
  const headY = -33 - bob;
  ctx.fillStyle = c.skin;
  ctx.fillRect(-8, headY, 16, 16);
  ctx.strokeStyle = shadeColor(c.skin, 0.75);
  ctx.lineWidth = 1;
  ctx.strokeRect(-8, headY, 16, 16);

  // ---- Cheveux ----
  drawHair(ctx, app, c.hair, headY, facing);

  // ---- Visage (yeux, bouche) selon l'orientation ----
  drawFace(ctx, app, c, headY, facing);

  // ---- Lunettes ----
  if (app.glasses && app.glasses !== 'none') {
    drawGlasses(ctx, app.glasses, headY, facing);
  }

  // ---- Chapeau ----
  if (app.hat && app.hat !== 'none') {
    drawHat(ctx, app, c, headY, facing);
  }

  ctx.restore();
}

function drawHair(ctx, app, hairColor, headY, facing) {
  const style = app.hairStyle;
  ctx.fillStyle = hairColor;
  if (style === 'chauve') return;

  if (style === 'court' || style === 'mi-long' || style === 'long') {
    // calotte carrée sur le dessus de la tête
    ctx.fillRect(-8, headY - 4, 16, 6);
    // frange
    if (facing === 'down') {
      ctx.fillRect(-8, headY, 16, 4);
    } else if (facing === 'left') {
      ctx.fillRect(-10, headY, 4, 16);
    } else if (facing === 'right') {
      ctx.fillRect(6, headY, 4, 16);
    } else if (facing === 'up') {
      ctx.fillRect(-8, headY, 16, 4);
    }
    if (style === 'mi-long') {
      ctx.fillRect(-11, headY + 1, 3, 13);
      ctx.fillRect(8, headY + 1, 3, 13);
    }
    if (style === 'long') {
      ctx.fillRect(-11, headY - 1, 3, 17);
      ctx.fillRect(8, headY - 1, 3, 17);
      ctx.fillRect(-8, headY + 12, 16, 4);
    }
  }

  if (style === 'mohawk') {
    ctx.fillRect(-8, headY - 3, 16, 5);
    ctx.fillRect(-3, headY - 9, 6, 6); // crête
  }

  if (style === 'chignon') {
    ctx.fillRect(-8, headY - 3, 16, 5);
    ctx.fillRect(-5, headY - 10, 10, 7); // chignon
    ctx.fillStyle = shadeColor(hairColor, 0.8);
    ctx.fillRect(-5, headY - 10, 10, 3);
  }

  if (style === 'casquette') {
    ctx.fillRect(-8, headY - 4, 16, 6);
    // visière orientée selon le regard
    if (facing === 'down') ctx.fillRect(-5, headY + 1, 10, 4);
    else if (facing === 'up') ctx.fillRect(-5, headY - 8, 10, 4);
    else if (facing === 'left') ctx.fillRect(-13, headY - 1, 5, 6);
    else ctx.fillRect(8, headY - 1, 5, 6);
  }
}

function drawFace(ctx, app, c, headY, facing) {
  if (facing === 'up') return; // dos de la tête : pas de visage
  ctx.fillStyle = c.eyes;
  let ox = 0, oy = 0;
  if (facing === 'down') { ox = 0; oy = 3; }
  else if (facing === 'left') { ox = -5; oy = 0; }
  else if (facing === 'right') { ox = 5; oy = 0; }

  // deux yeux carrés
  ctx.fillRect(-5 + ox, headY + oy, 3, 3);
  ctx.fillRect(3 + ox, headY + oy, 3, 3);
  // reflet
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(-5 + ox, headY + oy, 1.5, 1.5);
  ctx.fillRect(3 + ox, headY + oy, 1.5, 1.5);

  // bouche
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  if (facing === 'down') ctx.fillRect(-2, headY + 9, 5, 2);
  else ctx.fillRect(ox - 2, headY + 6, 5, 2);
}

function drawGlasses(ctx, kind, headY, facing) {
  if (facing === 'up') return;
  let ox = 0, oy = 0;
  if (facing === 'down') { ox = 0; oy = 3; }
  else if (facing === 'left') { ox = -5; oy = 0; }
  else if (facing === 'right') { ox = 5; oy = 0; }

  const lens = kind === 'soleil' ? 'rgba(30,30,40,0.85)' : 'rgba(180,220,240,0.5)';
  ctx.fillStyle = '#2a2a2a'; // monture
  if (kind === 'rondes') {
    ctx.beginPath();
    ctx.arc(-4 + ox, headY + 1.5 + oy, 3, 0, Math.PI * 2);
    ctx.arc(4 + ox, headY + 1.5 + oy, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = lens;
    ctx.beginPath();
    ctx.arc(-4 + ox, headY + 1.5 + oy, 2, 0, Math.PI * 2);
    ctx.arc(4 + ox, headY + 1.5 + oy, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(-1 + ox, headY + oy, 2, 3);
  } else {
    // carrées ou soleil
    ctx.fillRect(-7 + ox, headY - 1 + oy, 5, 6);
    ctx.fillRect(3 + ox, headY - 1 + oy, 5, 6);
    ctx.fillStyle = lens;
    ctx.fillRect(-6 + ox, headY + oy, 3, 4);
    ctx.fillRect(4 + ox, headY + oy, 3, 4);
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(-1 + ox, headY + 1 + oy, 3, 2);
  }
}

function drawHat(ctx, app, c, headY, facing) {
  const hat = app.hat;
  if (hat === 'casquette') {
    ctx.fillStyle = c.shirt;
    ctx.fillRect(-8, headY - 6, 16, 6);
    ctx.fillStyle = shadeColor(c.shirt, 0.75);
    if (facing === 'down') ctx.fillRect(-6, headY + 0, 12, 3);
    else if (facing === 'up') ctx.fillRect(-6, headY - 9, 12, 3);
    else if (facing === 'left') ctx.fillRect(-12, headY - 2, 4, 6);
    else ctx.fillRect(8, headY - 2, 4, 6);
  } else if (hat === 'bonnet') {
    ctx.fillStyle = '#c94f4f';
    ctx.fillRect(-8, headY - 6, 16, 6);
    ctx.fillRect(-4, headY - 10, 8, 5);
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(-4, headY - 10, 8, 2);
  } else if (hat === 'haut-de-forme') {
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(-8, headY - 5, 16, 4);
    ctx.fillRect(-5, headY - 14, 10, 10);
    ctx.fillStyle = '#444';
    ctx.fillRect(-5, headY - 14, 10, 2);
  } else if (hat === 'couronne') {
    ctx.fillStyle = '#e6c23c';
    ctx.fillRect(-8, headY - 5, 16, 4);
    // pointes de couronne
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(-7 + i * 5, headY - 10, 4, 6);
    }
    ctx.fillStyle = '#fff';
    ctx.fillRect(-7, headY - 5, 4, 2);
    ctx.fillRect(4, headY - 5, 4, 2);
  }
}
