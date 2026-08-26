// ============================================================
//  AVANIA — Personnage CARRE : un vrai CUBE, 100% personnalisable
//  Le personnage est un SEUL carré (un cube) avec un visage,
//  des cheveux et des accessoires dessinés dessus.
//  Chaque élément garde le style "voxel" doux : contour,
//  reflet en haut, ombre en bas.
// ============================================================

import {
  SKIN_TONES, HAIR_STYLES, HAIR_COLORS, EYE_COLORS,
  SHIRT_COLORS, PANTS_COLORS, HATS, GLASSES,
} from './config.js';
import { shade } from './tileset.js';
import { makeCanvas } from './utils.js';

export function resolveColor(list, id) {
  const found = list.find((e) => e.id === id);
  return found ? found.color : (list[0] && list[0].color);
}

export function appearanceColors(app) {
  const shirtId = app.shirt === 'none' ? null : app.shirt;
  const pantsId = app.pants === 'none' ? null : app.pants;
  const skinColor = resolveColor(SKIN_TONES, app.skin);
  return {
    skin: skinColor,
    hair: resolveColor(HAIR_COLORS, app.hairColor),
    eyes: resolveColor(EYE_COLORS, app.eyes),
    // Si 'none', on affiche la peau (torse nu / jambes nues)
    shirt: shirtId ? resolveColor(SHIRT_COLORS, shirtId) : skinColor,
    pants: pantsId ? resolveColor(PANTS_COLORS, pantsId) : skinColor,
    shirtNone: !shirtId,
    pantsNone: !pantsId,
  };
}

function withAlpha(color, a) {
  if (color.startsWith('rgb(')) return color.replace('rgb(', 'rgba(').replace(')', `,${a})`);
  const n = parseInt(color.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

// Dessine un "voxel" (carré ombré + contour + reflet) — pour les chapeaux.
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

// Taille du cube (en unités monde, avant mise à l'échelle)
const CUBE = 30;

// ------------------------------------------------------------
//  Pré-rendu du personnage (gros gain de performance)
//  Le corps du cube est dessiné une seule fois par
//  (apparence × orientation × clignement), puis réutilisé via
//  un simple drawImage à chaque frame. Seuls le rebond (bob),
//  la respiration (squash) et l'ombre restent calculés en direct.
//  Le rendu vectoriel initial (~50 opérations + 3 dégradés par
//  frame) devient un unique blit.
// ------------------------------------------------------------
const SPRITE_W = 64; // largeur en unités monde (marge incluse)
const SPRITE_H = 64;
const SPRITE_ANCHOR_X = 32; // position de l'origine (sol, centre)
const SPRITE_ANCHOR_Y = 48;

const bodyCache = new Map();

function bodyCacheKey(app, facing, blink, detail) {
  return [
    app.skin, app.hairStyle, app.hairColor, app.eyes, app.shirt, app.pants,
    app.hat, app.glasses, app.facialHair, facing, blink ? 1 : 0, detail,
  ].join('|');
}

function getBodySprite(app, facing, blink, detail) {
  const key = bodyCacheKey(app, facing, blink, detail);
  let sprite = bodyCache.get(key);
  if (sprite) return sprite;

  // Garde-fou : le cache ne grossit pas sans borne (l'écran de création
  // peut explorer des centaines de combinaisons d'apparence). On purge
  // tout en dessous du plafond : les quelques sprites utiles en jeu
  // (4 orientations × clignement) sont simplement régénérés à la demande.
  if (bodyCache.size > 256) bodyCache.clear();

  const c = appearanceColors(app);
  const canvas = makeCanvas(SPRITE_W * detail, SPRITE_H * detail);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.translate(SPRITE_ANCHOR_X * detail, SPRITE_ANCHOR_Y * detail);
  ctx.scale(detail, detail);

  const x0 = -CUBE / 2;
  const y0 = -CUBE; // haut du cube, bas = 0 (au sol)

  drawCubeBody(ctx, x0, y0, CUBE, c);
  drawHair(ctx, app, c.hair, x0, y0, CUBE, facing);

  if (facing !== 'up') {
    drawFace(ctx, app, c, x0, y0, CUBE, facing, blink);
    if (app.facialHair && app.facialHair !== 'none') {
      drawFacialHair(ctx, app.facialHair, c.hair, x0, y0, CUBE, facing);
    }
    if (app.glasses && app.glasses !== 'none') {
      drawGlasses(ctx, app.glasses, x0, y0, CUBE, facing);
    }
  }
  if (app.hat && app.hat !== 'none') {
    drawHat(ctx, app, c, x0, y0, CUBE, facing);
  }

  sprite = {
    canvas,
    w: SPRITE_W,
    h: SPRITE_H,
    anchorX: SPRITE_ANCHOR_X,
    anchorY: SPRITE_ANCHOR_Y,
  };
  bodyCache.set(key, sprite);
  return sprite;
}

// Ombre douce du joueur : quand l'appelant connaît la densité de pixels
// (opts.pixelDensity, ex. zoom de la caméra), l'ellipse dégradée est
// pré-rendue une fois à cette résolution puis réutilisée par simple
// blit — plus de radialGradient construit à chaque frame du jeu.
const shadowSpriteCache = new Map();

function getPlayerShadowSprite(pixelDensity) {
  const pd = Math.max(1, Math.round(pixelDensity * 100) / 100);
  let sprite = shadowSpriteCache.get(pd);
  if (sprite) return sprite;

  // Boîte monde de l'ellipse (centre 0,1 — rayons 14 × 6) + 1 px de marge.
  const canvas = makeCanvas(30 * pd, 13 * pd);
  const sctx = canvas.getContext('2d');
  const sg = sctx.createRadialGradient(15 * pd, 7 * pd, 2 * pd, 15 * pd, 7 * pd, 14 * pd);
  sg.addColorStop(0, 'rgba(0,0,0,0.32)');
  sg.addColorStop(1, 'rgba(0,0,0,0)');
  sctx.fillStyle = sg;
  sctx.beginPath();
  sctx.ellipse(15 * pd, 7 * pd, 14 * pd, 6 * pd, 0, 0, Math.PI * 2);
  sctx.fill();
  sprite = canvas;
  shadowSpriteCache.set(pd, sprite);
  return sprite;
}

// Dessine le personnage — un cube unique posé sur (x, y).
// y = point de contact au sol.
export function drawCharacter(ctx, app, x, y, opts = {}) {
  const { facing = 'down', walkPhase = 0, scale = 1, blink = false, shadow = true } = opts;
  // Résolution interne du sprite, calée sur le zoom cible : 1 pour le
  // rendu en jeu (léger sous-échantillonnage), plus haute pour l'aperçu
  // agrandi afin de rester net.
  const detail = opts.detail || Math.max(1, Math.round(scale));
  const bob = Math.sin(walkPhase) * 1.4;
  const squash = 1 + Math.sin(walkPhase * 2) * 0.04;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // Ombre douce au sol. En mode performance, le jeu peut la désactiver
  // pour éviter tout coût supplémentaire par personnage.
  if (shadow) {
    if (opts.pixelDensity) {
      const sprite = getPlayerShadowSprite(opts.pixelDensity);
      ctx.drawImage(sprite, -15, -6, 30, 13);
    } else {
      const sg = ctx.createRadialGradient(0, 1, 2, 0, 1, 14);
      sg.addColorStop(0, 'rgba(0,0,0,0.32)');
      sg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.ellipse(0, 1, 14, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Le cube : on le fait rebondir (bob) et respirer (squash) autour du sol.
  const sprite = getBodySprite(app, facing, blink, detail);
  ctx.save();
  ctx.translate(0, -bob);
  ctx.scale(1, squash);
  ctx.drawImage(sprite.canvas, -sprite.anchorX, -sprite.anchorY, sprite.w, sprite.h);
  ctx.restore();
  ctx.restore();
}

// Le corps : un seul carré (visage en peau + bandes haut/pantalon en bas)
function drawCubeBody(ctx, x0, y0, S, c) {
  const pantsH = 4;
  const shirtH = 6;
  const shirtY = y0 + S - pantsH - shirtH;
  const pantsY = y0 + S - pantsH;

  // base = peau (le visage), avec un léger volume de lumière.
  const skinGradient = ctx.createLinearGradient(x0, y0, x0 + S, y0 + S);
  skinGradient.addColorStop(0, withAlpha(c.skin, 0.98));
  skinGradient.addColorStop(0.55, c.skin);
  skinGradient.addColorStop(1, withAlpha(shade(c.skin, 0.74), 0.94));
  ctx.fillStyle = skinGradient;
  ctx.fillRect(x0, y0, S, S);

  // bande "haut" (chemise), elle aussi légèrement éclairée en haut.
  const shirtGradient = ctx.createLinearGradient(x0, shirtY, x0, shirtY + shirtH);
  shirtGradient.addColorStop(0, shade(c.shirt, 1.12));
  shirtGradient.addColorStop(0.45, c.shirt);
  shirtGradient.addColorStop(1, shade(c.shirt, 0.76));
  ctx.fillStyle = shirtGradient;
  ctx.fillRect(x0, shirtY, S, shirtH);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(x0 + 1, shirtY + 1, S - 2, 1.2);

  // bande "pantalon" (tout en bas), avec une couture centrale discrète.
  const pantsGradient = ctx.createLinearGradient(x0, pantsY, x0 + S, pantsY);
  pantsGradient.addColorStop(0, shade(c.pants, 1.06));
  pantsGradient.addColorStop(0.65, c.pants);
  pantsGradient.addColorStop(1, shade(c.pants, 0.72));
  ctx.fillStyle = pantsGradient;
  ctx.fillRect(x0, pantsY, S, pantsH);
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.fillRect(x0 + S / 2 - 0.6, pantsY + 1, 1.2, pantsH - 1);

  // effet cube 3D : reflet en haut, ombre à droite et en bas
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(x0 + 1, y0 + 1, S - 2, 3);
  ctx.fillStyle = 'rgba(0,0,0,0.13)';
  ctx.fillRect(x0 + S - 3, y0, 3, S);
  ctx.fillRect(x0 + 1, y0 + S - 3, S - 2, 3);

  // contour double : un bord sombre + un pixel de lumière sur la gauche.
  ctx.strokeStyle = shade(c.skin, 0.48);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x0 + 0.5, y0 + 0.5, S - 1, S - 1);
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fillRect(x0 + 1, y0 + 5, 1.2, S - 9);
}

// ---- Cheveux (sur le dessus / les côtés du cube) ----
function drawHair(ctx, app, color, x0, y0, S, facing) {
  const style = app.hairStyle;
  if (style === 'chauve') return;
  const cx = x0 + S / 2;
  ctx.fillStyle = color;

  // base "casquette" de cheveux sur le dessus (sauf crête / chignon)
  if (style !== 'mohawk' && style !== 'chignon') {
    ctx.fillRect(x0 - 2, y0 - 4, S + 4, 5);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x0 - 2, y0 - 4, S + 4, 2);
    ctx.fillStyle = color;
  }

  switch (style) {
    case 'court':
      if (facing === 'down' || facing === 'up') ctx.fillRect(x0, y0, S, 3);
      else if (facing === 'left') ctx.fillRect(x0 - 4, y0, 4, 12);
      else ctx.fillRect(x0 + S, y0, 4, 12);
      break;

    case 'frange':
      // Une mèche irrégulière descend sur le front, plus douce que la coupe courte.
      voxel(ctx, x0 - 2, y0 - 5, S + 4, 6, color, { hlHeight: 2 });
      if (facing === 'down') {
        ctx.fillRect(x0 + 1, y0 + 1, 7, 6);
        ctx.fillRect(x0 + 10, y0 + 1, 6, 4);
        ctx.fillRect(x0 + 19, y0 + 1, 8, 7);
      } else if (facing === 'left') {
        ctx.fillRect(x0 - 4, y0 + 1, 6, 9);
      } else if (facing === 'right') {
        ctx.fillRect(x0 + S - 2, y0 + 1, 6, 9);
      } else {
        ctx.fillRect(x0, y0, S, 8);
      }
      break;

    case 'mi-long':
      ctx.fillRect(x0 - 4, y0 + 1, 4, 10);
      ctx.fillRect(x0 + S, y0 + 1, 4, 10);
      if (facing === 'down') ctx.fillRect(x0, y0, S, 3);
      break;

    case 'boucles':
      // Petites mèches carrées en relief autour de la tête.
      voxel(ctx, x0 - 3, y0 - 7, S + 6, 8, color, { hlHeight: 2 });
      for (const [bx, by] of [[-5, 1], [-4, 7], [S - 1, 1], [S - 2, 7]]) {
        voxel(ctx, x0 + bx, y0 + by, 6, 6, color, { hlHeight: 2 });
      }
      if (facing === 'down') {
        ctx.fillRect(x0 + 1, y0, 7, 5);
        ctx.fillRect(x0 + 11, y0, 7, 4);
        ctx.fillRect(x0 + 21, y0, 7, 5);
      }
      break;

    case 'boucles-longues':
      voxel(ctx, x0 - 3, y0 - 6, S + 6, 7, color, { hlHeight: 2 });
      for (let i = 0; i < 4; i++) {
        voxel(ctx, x0 - 5, y0 + i * 5, 6, 7, color, { hlHeight: 2 });
        voxel(ctx, x0 + S - 1, y0 + i * 5, 6, 7, color, { hlHeight: 2 });
      }
      if (facing === 'up') ctx.fillRect(x0, y0, S, 13);
      else if (facing === 'down') ctx.fillRect(x0, y0, S, 3);
      break;

    case 'long':
      ctx.fillRect(x0 - 4, y0, 4, 15);
      ctx.fillRect(x0 + S, y0, 4, 15);
      if (facing === 'up') ctx.fillRect(x0, y0, S, 13);
      else ctx.fillRect(x0, y0, S, 3);
      break;

    case 'afro':
      ctx.fillRect(x0 - 3, y0 - 7, S + 6, 8);
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(x0 - 3, y0 - 7, S + 6, 3);
      ctx.fillStyle = color;
      ctx.fillRect(x0 - 4, y0 + 1, 4, 9);
      ctx.fillRect(x0 + S, y0 + 1, 4, 9);
      if (facing === 'down') ctx.fillRect(x0, y0, S, 3);
      break;

    case 'degrades':
      voxel(ctx, x0 - 2, y0 - 6, S + 4, 7, color, { hlHeight: 2 });
      ctx.fillStyle = color;
      if (facing === 'down' || facing === 'up') ctx.fillRect(x0, y0, S, 3);
      else if (facing === 'left') ctx.fillRect(x0 - 4, y0, 4, 10);
      else ctx.fillRect(x0 + S, y0, 4, 10);
      break;

    case 'undercut':
      // Dessus dense, côtés plus courts, avec une petite ligne de transition.
      voxel(ctx, x0 - 2, y0 - 6, S + 4, 7, color, { hlHeight: 2 });
      ctx.fillStyle = shade(color, 0.72);
      if (facing === 'left') ctx.fillRect(x0 - 3, y0 + 1, 3, 5);
      else if (facing === 'right') ctx.fillRect(x0 + S, y0 + 1, 3, 5);
      else ctx.fillRect(x0, y0 + 1, S, 2);
      ctx.fillStyle = color;
      if (facing === 'down') ctx.fillRect(x0 + 2, y0, S - 4, 4);
      break;

    case 'raie':
      voxel(ctx, x0 - 2, y0 - 5, S + 4, 6, color, { hlHeight: 2 });
      // Parting line and a swept lock on the chosen side.
      ctx.fillStyle = shade(color, 0.62);
      ctx.fillRect(x0 + 8, y0 - 3, 2, 7);
      ctx.fillStyle = color;
      if (facing === 'down') {
        ctx.fillRect(x0 + 8, y0 + 1, 8, 6);
        ctx.fillRect(x0 + 16, y0 + 1, 10, 4);
      } else if (facing === 'left') {
        ctx.fillRect(x0 - 4, y0 + 1, 5, 8);
      } else if (facing === 'right') {
        ctx.fillRect(x0 + S - 1, y0 + 1, 5, 8);
      } else {
        ctx.fillRect(x0, y0, S, 8);
      }
      break;

    case 'mohawk':
      ctx.fillRect(x0 - 2, y0 - 3, S + 4, 4);
      ctx.fillRect(cx - 4, y0 - 9, 8, 7);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(cx - 4, y0 - 9, 8, 2);
      break;

    case 'chignon':
      ctx.fillRect(x0 - 2, y0 - 3, S + 4, 4);
      voxel(ctx, cx - 5, y0 - 11, 10, 8, color);
      break;

    case 'couettes':
      voxel(ctx, x0 - 2, y0 - 5, S + 4, 6, color, { hlHeight: 2 });
      if (facing === 'up') {
        voxel(ctx, x0 - 8, y0 - 1, 8, 9, color, { hlHeight: 2 });
        voxel(ctx, x0 + S, y0 - 1, 8, 9, color, { hlHeight: 2 });
      } else {
        voxel(ctx, x0 - 7, y0 + 2, 7, 9, color, { hlHeight: 2 });
        voxel(ctx, x0 + S, y0 + 2, 7, 9, color, { hlHeight: 2 });
      }
      if (facing === 'down') ctx.fillRect(x0 + 1, y0, S - 2, 3);
      break;

    case 'queue':
      ctx.fillRect(x0 - 2, y0 - 4, S + 4, 5);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(x0 - 2, y0 - 4, S + 4, 2);
      ctx.fillStyle = color;
      if (facing === 'up') ctx.fillRect(cx - 3, y0 - 13, 6, 10);
      else ctx.fillRect(cx - 3, y0 + 1, 6, 5);
      if (facing === 'down') ctx.fillRect(x0, y0, S, 3);
      break;

    case 'tresses':
      ctx.fillRect(x0 - 2, y0 - 4, S + 4, 5);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(x0 - 2, y0 - 4, S + 4, 2);
      ctx.fillStyle = color;
      ctx.fillRect(x0, y0, S, 3);
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(x0 - 6, y0 + 2 + i * 4, 4, 3);
        ctx.fillRect(x0 + S + 2, y0 + 2 + i * 4, 4, 3);
      }
      break;

    case 'nattes':
      voxel(ctx, x0 - 2, y0 - 5, S + 4, 6, color, { hlHeight: 2 });
      ctx.fillStyle = color;
      ctx.fillRect(x0, y0, S, 3);
      // Alternating voxel segments suggest a braided silhouette.
      for (let i = 0; i < 4; i++) {
        const yy = y0 + 2 + i * 4;
        voxel(ctx, x0 - 6, yy, 4, 4, color, { hlHeight: 1 });
        voxel(ctx, x0 + S + 2, yy + (i % 2), 4, 4, color, { hlHeight: 1 });
      }
      if (facing === 'up') ctx.fillRect(x0, y0, S, 12);
      break;

    case 'casquette':
      ctx.fillRect(x0 - 2, y0 - 4, S + 4, 5);
      if (facing === 'down') ctx.fillRect(x0, y0, S, 3);
      else if (facing === 'up') ctx.fillRect(x0, y0 - 7, S, 4);
      break;
  }
}

// ---- Visage (sur la face avant du cube) ----
function drawFace(ctx, app, c, x0, y0, S, facing, blink = false) {
  let ox = 0;
  if (facing === 'left') ox = -3;
  else if (facing === 'right') ox = 3;

  const eyeY = y0 + 9;
  const lx = x0 + 10; // œil gauche (absolu -5)
  const rx = x0 + 16; // œil droit  (absolu +1)

  // sourcils (couleur des cheveux)
  ctx.fillStyle = c.hair;
  ctx.fillRect(lx + ox, eyeY - 2.5, 4, 1.5);
  ctx.fillRect(rx + ox, eyeY - 2.5, 4, 1.5);

  if (blink) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(lx + ox, eyeY + 1, 4, 1.5);
    ctx.fillRect(rx + ox, eyeY + 1, 4, 1.5);
  } else {
    ctx.fillStyle = c.eyes;
    ctx.fillRect(lx + ox, eyeY, 4, 4);
    ctx.fillRect(rx + ox, eyeY, 4, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(lx + ox, eyeY, 1.8, 1.8);
    ctx.fillRect(rx + ox, eyeY, 1.8, 1.8);
  }

  // Petit nez et ombre sous le regard pour donner du relief au visage.
  ctx.fillStyle = withAlpha(shade(c.skin, 0.72), 0.58);
  ctx.fillRect(x0 + 14 + ox, y0 + 13, 3, 2);
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(x0 + 14 + ox, y0 + 12, 1.2, 1.2);

  // bouche
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.fillRect(x0 + 13 + ox, y0 + 16, 4, 2);

  // joues rosées
  ctx.fillStyle = withAlpha('#f2a6a6', 0.5);
  ctx.fillRect(x0 + 7 + ox, y0 + 12, 3, 3);
  ctx.fillRect(x0 + 20 + ox, y0 + 12, 3, 3);
}

// ---- Pilosité faciale ----
function drawFacialHair(ctx, kind, color, x0, y0, S, facing) {
  let ox = 0;
  if (facing === 'left') ox = -3;
  else if (facing === 'right') ox = 3;
  ctx.fillStyle = color;

  if (kind === 'moustache') {
    // Moustache en guidon, plus fournie et soignée
    ctx.fillRect(x0 + 9 + ox, y0 + 13.5, 5, 2.2);
    ctx.fillRect(x0 + 16 + ox, y0 + 13.5, 5, 2.2);
    ctx.fillStyle = shade(color, 0.75);
    ctx.fillRect(x0 + 9 + ox, y0 + 15, 5, 0.8);
    ctx.fillRect(x0 + 16 + ox, y0 + 15, 5, 0.8);
  } else if (kind === 'bouc') {
    // Bouc d'artisan soigné, avec barbiche pointue et reflets
    ctx.fillRect(x0 + 10 + ox, y0 + 13.8, 4.5, 2.4);
    ctx.fillRect(x0 + 15.5 + ox, y0 + 13.8, 4.5, 2.4);
    ctx.fillRect(x0 + 12 + ox, y0 + 17.5, 6.5, 3.8);
    // Pointe fine
    ctx.fillRect(x0 + 13.5 + ox, y0 + 20.8, 3.5, 1.2);
    ctx.fillStyle = shade(color, 0.7);
    ctx.fillRect(x0 + 10 + ox, y0 + 15.5, 4.5, 0.7);
    ctx.fillRect(x0 + 15.5 + ox, y0 + 15.5, 4.5, 0.7);
    ctx.fillRect(x0 + 12 + ox, y0 + 20, 6.5, 0.8);
  } else if (kind === 'barbe') {
    // Barbe de forgeron fournie, tressée, avec reflets gris
    ctx.fillRect(x0 + 6 + ox, y0 + 11, 4, 10);
    ctx.fillRect(x0 + 20 + ox, y0 + 11, 4, 10);
    ctx.fillRect(x0 + 8 + ox, y0 + 17, 14, 3);
    ctx.fillRect(x0 + 10 + ox, y0 + 20, 10, 3.5);
    // Mèches grisonnantes
    ctx.fillStyle = shade(color, 1.25);
    ctx.fillRect(x0 + 9 + ox, y0 + 18, 2, 3);
    ctx.fillRect(x0 + 19 + ox, y0 + 18, 2, 3);
    // Ombre sous barbe
    ctx.fillStyle = shade(color, 0.6);
    ctx.fillRect(x0 + 10 + ox, y0 + 22.5, 10, 1);
  }
}

// ---- Lunettes ----
function drawGlasses(ctx, kind, x0, y0, S, facing) {
  let ox = 0;
  if (facing === 'left') ox = -3;
  else if (facing === 'right') ox = 3;

  const eyeY = y0 + 9;
  const lens = kind === 'soleil' ? 'rgba(25,25,35,0.9)' : 'rgba(190,230,250,0.45)';
  const frame = '#2a2a2a';
  const goldFrame = '#c9a227';
  const goldLight = '#e6c86a';

  if (kind === 'rondes') {
    // Monture dorée fine, plus élégante
    const isGold = true; // on passe tout en doré pour le côté luxe
    const fCol = isGold ? goldFrame : frame;
    const fLight = goldLight;
    ctx.fillStyle = fCol;
    ctx.beginPath(); ctx.arc(x0 + 12 + ox, eyeY + 2, 3.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x0 + 18 + ox, eyeY + 2, 3.6, 0, Math.PI * 2); ctx.fill();
    // Reflet doré
    ctx.fillStyle = fLight;
    ctx.beginPath(); ctx.arc(x0 + 11.3 + ox, eyeY + 1.2, 0.9, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x0 + 17.3 + ox, eyeY + 1.2, 0.9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = lens;
    ctx.beginPath(); ctx.arc(x0 + 12 + ox, eyeY + 2, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x0 + 18 + ox, eyeY + 2, 2.4, 0, Math.PI * 2); ctx.fill();
    // Pont
    ctx.fillStyle = fCol;
    ctx.fillRect(x0 + 14 + ox, eyeY + 1.2, 2, 1.2);
    // Reflet verre
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.arc(x0 + 11.2 + ox, eyeY + 1.3, 0.7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x0 + 17.2 + ox, eyeY + 1.3, 0.7, 0, Math.PI * 2); ctx.fill();
  } else if (kind === 'demi-lune') {
    ctx.fillStyle = frame;
    ctx.fillRect(x0 + 8 + ox, eyeY + 3, 6, 3);
    ctx.fillRect(x0 + 16 + ox, eyeY + 3, 6, 3);
    ctx.fillStyle = lens;
    ctx.fillRect(x0 + 9 + ox, eyeY + 4, 4, 2);
    ctx.fillRect(x0 + 17 + ox, eyeY + 4, 4, 2);
    ctx.fillStyle = frame;
    ctx.fillRect(x0 + 13 + ox, eyeY + 3, 3, 2);
  } else {
    ctx.fillStyle = frame;
    ctx.fillRect(x0 + 8 + ox, eyeY - 1, 6, 6);
    ctx.fillRect(x0 + 16 + ox, eyeY - 1, 6, 6);
    ctx.fillStyle = lens;
    ctx.fillRect(x0 + 9 + ox, eyeY, 4, 4);
    ctx.fillRect(x0 + 17 + ox, eyeY, 4, 4);
    ctx.fillStyle = frame;
    ctx.fillRect(x0 + 13 + ox, eyeY + 1, 2, 2);
  }
}

// ---- Chapeaux (posés sur le dessus du cube) ----
function drawHat(ctx, app, c, x0, y0, S, facing) {
  const hat = app.hat;
  const cx = x0 + S / 2;

  if (hat === 'casquette') {
    voxel(ctx, x0 - 2, y0 - 7, S + 4, 6, c.shirt);
    ctx.fillStyle = shade(c.shirt, 0.75);
    if (facing === 'down') ctx.fillRect(x0 + 2, y0 - 1, S - 4, 3);
    else if (facing === 'up') ctx.fillRect(x0 + 2, y0 - 10, S - 4, 3);
    else if (facing === 'left') ctx.fillRect(x0 - 6, y0 - 3, 5, 6);
    else ctx.fillRect(x0 + S + 1, y0 - 3, 5, 6);
  } else if (hat === 'bonnet') {
    voxel(ctx, x0 - 2, y0 - 7, S + 4, 6, '#c94f4f');
    voxel(ctx, cx - 5, y0 - 12, 10, 6, '#c94f4f');
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(x0 - 2, y0 - 7, S + 4, 2);
  } else if (hat === 'paille') {
    voxel(ctx, x0 - 4, y0 - 5, S + 8, 4, '#ecd48a');
    voxel(ctx, cx - 6, y0 - 11, 12, 7, '#d9b95f');
    ctx.fillStyle = '#c94f3f';
    ctx.fillRect(cx - 6, y0 - 8, 12, 2);
  } else if (hat === 'casque') {
    // Casque de forgeron / chantier amélioré : acier brossé, rivets, jugulaire cuir, lampe frontale
    // Base casque
    voxel(ctx, x0 - 3, y0 - 9, S + 6, 8, '#d8c040');
    // Calotte supérieure bombée
    voxel(ctx, cx - 6, y0 - 13, 12, 5, '#e6d25a');
    // Reflet acier
    ctx.fillStyle = 'rgba(255,255,255,0.32)';
    ctx.fillRect(cx - 6, y0 - 13, 12, 1.8);
    ctx.fillRect(x0 - 3, y0 - 9, 2, 8);
    // Bande cuir autour
    ctx.fillStyle = '#4a3218';
    ctx.fillRect(x0 - 3, y0 - 3, S + 6, 1.8);
    ctx.fillStyle = '#6b4a2a';
    ctx.fillRect(x0 - 3, y0 - 3, S + 6, 0.6);
    // Rivets latéraux
    ctx.fillStyle = '#a08a3a';
    ctx.beginPath(); ctx.arc(x0 - 1, y0 - 5, 0.7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x0 + S + 1, y0 - 5, 0.7, 0, Math.PI * 2); ctx.fill();
    // Petite lampe frontale pour le mineur
    ctx.fillStyle = '#2a2a2e';
    ctx.fillRect(cx - 2, y0 - 6, 4, 2.5);
    ctx.fillStyle = '#e8eef2';
    ctx.fillRect(cx - 1.5, y0 - 5.5, 3, 1.5);
    ctx.fillStyle = '#a8d8e8';
    ctx.fillRect(cx - 1, y0 - 5.2, 2, 0.8);
  } else if (hat === 'melon') {
    // Melon plus raffiné : bord brillant, calotte bombée, ruban satin
    voxel(ctx, x0 - 3, y0 - 6, S + 6, 5, '#1e1e24');
    voxel(ctx, cx - 6, y0 - 12, 12, 8, '#2c2c34');
    // Ruban noir satiné
    ctx.fillStyle = '#111116';
    ctx.fillRect(cx - 6, y0 - 7, 12, 2.5);
    // Reflet soyeux sur la calotte
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(cx - 6, y0 - 12, 12, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(cx - 6, y0 - 10, 3, 4);
  } else if (hat === 'haut-de-forme') {
    // Haut-de-forme luxueux : noir profond, bord large brillant, ruban bordeaux et boucle dorée
    // Bord
    voxel(ctx, x0 - 4, y0 - 6, S + 8, 5, '#14141a');
    // Reflet sur le bord
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x0 - 4, y0 - 6, S + 8, 1.5);
    // Tube haut
    voxel(ctx, cx - 6, y0 - 20, 12, 15, '#1c1c26');
    // Ombre douce côté
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(cx + 2, y0 - 20, 4, 15);
    // Reflet vertical soyeux
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(cx - 6, y0 - 20, 2.5, 15);
    // Ruban bordeaux autour du tube
    ctx.fillStyle = '#5a1220';
    ctx.fillRect(cx - 6, y0 - 9, 12, 3.2);
    ctx.fillStyle = '#8e1e32';
    ctx.fillRect(cx - 6, y0 - 8.5, 12, 1.6);
    // Boucle dorée sur le côté
    ctx.fillStyle = '#c9a227';
    ctx.fillRect(cx + 3, y0 - 8.8, 1.8, 2.2);
    ctx.fillStyle = '#e6c86a';
    ctx.fillRect(cx + 3, y0 - 8.8, 1.8, 0.7);
  } else if (hat === 'couronne') {
    voxel(ctx, x0 - 2, y0 - 5, S + 4, 4, '#e6c23c');
    for (let i = 0; i < 3; i++) voxel(ctx, cx - 8 + i * 6, y0 - 10, 4, 6, '#f2c14e');
    ctx.fillStyle = '#e03a4e';
    ctx.fillRect(cx - 8, y0 - 5, 4, 2);
    ctx.fillRect(cx + 4, y0 - 5, 4, 2);
  }
}
