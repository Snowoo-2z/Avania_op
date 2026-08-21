// ============================================================
//  AVANIA — Rendu du personnage (personnalisable, vue top-down)
//  Le personnage est dessiné en code : chaque paramètre de
//  l'apparence (peau, cheveux, yeux, tenue…) modifie le rendu.
// ============================================================

import { SKIN_TONES, HAIR_STYLES, HAIR_COLORS, EYE_COLORS, SHIRT_COLORS, PANTS_COLORS } from './config.js';
import { roundedRect, circle } from './utils.js';

// Résout une couleur à partir de son id
export function resolveColor(list, id) {
  const found = list.find((e) => e.id === id);
  return found ? found.color : list[0].color;
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

// Dessine le personnage centré sur (x, y) — y = point de contact au sol.
// opts : { facing ('up'|'down'|'left'|'right'), walkPhase (0..2π), scale }
export function drawCharacter(ctx, app, x, y, opts = {}) {
  const { facing = 'down', walkPhase = 0, scale = 1 } = opts;
  const c = appearanceColors(app);
  const bob = Math.sin(walkPhase) * 1.2;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // Ombre au sol
  ctx.fillStyle = 'rgba(20,30,20,0.28)';
  ctx.beginPath();
  ctx.ellipse(0, 2, 11, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // ---- Jambes / chaussures ----
  const step = Math.sin(walkPhase) * 3;
  ctx.fillStyle = c.pants;
  // jambe gauche / droite
  ctx.beginPath(); ctx.ellipse(-4 + step, -4 - bob * 0.2, 3.5, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(4 - step, -4 - bob * 0.2, 3.5, 3, 0, 0, Math.PI * 2); ctx.fill();
  // chaussures
  ctx.fillStyle = '#3a3a3a';
  ctx.beginPath(); ctx.ellipse(-4 + step, -2, 3.5, 2.4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(4 - step, -2, 3.5, 2.4, 0, 0, Math.PI * 2); ctx.fill();

  // ---- Corps (t-shirt) ----
  const bodyY = -14 - bob * 0.3;
  ctx.fillStyle = c.shirt;
  roundedRect(ctx, -8, bodyY - 8, 16, 16, 6);
  ctx.fill();
  // contour
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 1.2;
  roundedRect(ctx, -8, bodyY - 8, 16, 16, 6);
  ctx.stroke();
  // bras
  const armSwing = Math.sin(walkPhase) * 2;
  ctx.fillStyle = c.shirt;
  circle(ctx, -9 - armSwing, bodyY - 3, 3.2); ctx.fill();
  circle(ctx, 9 + armSwing, bodyY - 3, 3.2); ctx.fill();
  // mains (peau)
  ctx.fillStyle = c.skin;
  circle(ctx, -9 - armSwing, bodyY - 4, 2); ctx.fill();
  circle(ctx, 9 + armSwing, bodyY - 4, 2); ctx.fill();

  // ---- Tête ----
  const headY = bodyY - 15;
  ctx.fillStyle = c.skin;
  circle(ctx, 0, headY, 9.5); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 1.2;
  circle(ctx, 0, headY, 9.5); ctx.stroke();

  // ---- Cheveux ----
  drawHair(ctx, app, c.hair, headY, facing);

  // ---- Yeux (position selon l'orientation) ----
  drawEyes(ctx, c.eyes, headY, facing);

  ctx.restore();
}

function drawHair(ctx, app, hairColor, headY, facing) {
  ctx.fillStyle = hairColor;
  const style = app.hairStyle;

  if (style === 'chauve') return;

  if (style === 'court' || style === 'mi-long' || style === 'long') {
    // calotte de cheveux qui recouvre le dessus de la tête
    ctx.beginPath();
    ctx.arc(0, headY - 1, 9.5, Math.PI, Math.PI * 2); // moitié supérieure
    ctx.quadraticCurveTo(9.5, headY + 1, 0, headY + 2);
    ctx.closePath();
    ctx.fill();
    // frange selon l'orientation
    if (facing === 'down') {
      ctx.beginPath();
      ctx.arc(0, headY - 1, 9, Math.PI * 0.1, Math.PI * 0.9);
      ctx.quadraticCurveTo(0, headY - 4, -9, headY - 1);
      ctx.closePath();
      ctx.fill();
    }
    if (style === 'mi-long') {
      // mèches sur les côtés
      ctx.beginPath(); ctx.ellipse(-9, headY, 3, 5, 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(9, headY, 3, 5, -0.3, 0, Math.PI * 2); ctx.fill();
    }
    if (style === 'long') {
      // chevelure tombante derrière
      ctx.beginPath();
      ctx.ellipse(-8, headY + 4, 3, 7, 0.2, 0, Math.PI * 2);
      ctx.ellipse(8, headY + 4, 3, 7, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-9, headY - 2, 18, 6);
    }
  }

  if (style === 'mohawk') {
    ctx.beginPath();
    ctx.arc(0, headY - 1, 9, Math.PI, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    // crête
    ctx.fillStyle = hairColor;
    ctx.beginPath();
    ctx.moveTo(-2.5, headY - 8);
    ctx.lineTo(0, headY - 16);
    ctx.lineTo(2.5, headY - 8);
    ctx.closePath();
    ctx.fill();
  }

  if (style === 'chignon') {
    ctx.beginPath();
    ctx.arc(0, headY - 1, 9, Math.PI, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    // chignon
    ctx.fillStyle = hairColor;
    ctx.beginPath();
    ctx.arc(0, headY - 9, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, headY - 9, 4.5, 0, Math.PI * 2); ctx.stroke();
  }

  if (style === 'casquette') {
    // casquette de baseball
    ctx.fillStyle = hairColor;
    ctx.beginPath();
    ctx.arc(0, headY - 2, 9.5, Math.PI, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    // visière orientée selon le regard
    ctx.fillStyle = hairColor;
    const dirX = facing === 'left' ? -1 : facing === 'right' ? 1 : 0;
    const dirY = facing === 'up' ? -1 : facing === 'down' ? 1 : 0;
    if (dirX !== 0) {
      ctx.beginPath();
      ctx.ellipse(dirX * 12, headY - 2, 6, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (dirY === 1) {
      ctx.beginPath();
      ctx.ellipse(0, headY + 6, 6, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.ellipse(0, headY - 10, 5, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawEyes(ctx, eyeColor, headY, facing) {
  if (facing === 'up') return; // on voit le dos de la tête
  ctx.fillStyle = eyeColor;
  let ox = 0, oy = 0;
  if (facing === 'down') { ox = 0; oy = 2; }
  else if (facing === 'left') { ox = -4; oy = 0; }
  else if (facing === 'right') { ox = 4; oy = 0; }

  // deux yeux
  circle(ctx, -3 + ox, headY + oy, 1.4); ctx.fill();
  circle(ctx, 3 + ox, headY + oy, 1.4); ctx.fill();
  // reflet
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  circle(ctx, -3 + ox + 0.4, headY + oy - 0.4, 0.5); ctx.fill();
  circle(ctx, 3 + ox + 0.4, headY + oy - 0.4, 0.5); ctx.fill();
}
