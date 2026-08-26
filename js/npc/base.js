// ============================================================
//  AVANIA — Fabrique de PNJ (personnages non-joueurs)
//
//  Tous les PNJ du jeu (le représentant, les marchands de la grotte)
//  partagent la même technique de rendu que le joueur :
//    1. le cube du personnage est pré-rendu une fois par
//       (orientation × apparence) dans un sprite hors-écran ;
//    2. un dessin « accessoire » (costume, cravate, tablier, casque…)
//       est peint par-dessus, dans le même style voxel ;
//    3. en jeu, on ne fait que deux drawImage (ombre + corps).
//
//  Résultat : un PNJ coûte le même prix qu'un mob, quel que soit le
//  niveau de détail de son dessin.
// ============================================================

import { drawCharacter } from '../character.js';
import { makeCanvas } from '../utils.js';

export const NPC_SPRITE_W = 64;
export const NPC_SPRITE_H = 64;
export const NPC_ANCHOR_X = 32;
export const NPC_ANCHOR_Y = 48;

// Ombre au sol partagée par tous les PNJ.
let sharedShadow = null;
export function getNpcShadow() {
  if (sharedShadow) return sharedShadow;
  const c = makeCanvas(34 * 2, 12 * 2);
  const sctx = c.getContext('2d');
  sctx.imageSmoothingEnabled = false;
  sctx.fillStyle = 'rgba(0,0,0,0.22)';
  sctx.beginPath();
  sctx.ellipse(34, 12, 32, 10, 0, 0, Math.PI * 2);
  sctx.fill();
  sharedShadow = c;
  return c;
}

// Petit carré plein avec reflet haut et ombre basse : la « brique » de
// base du pixel art du jeu (même vocabulaire que js/icons.js).
export function voxelRect(ctx, x, y, w, h, base, light, dark) {
  ctx.fillStyle = base;
  ctx.fillRect(x, y, w, h);
  if (light) {
    ctx.fillStyle = light;
    ctx.fillRect(x, y, w, Math.max(1, Math.round(h * 0.25)));
  }
  if (dark) {
    ctx.fillStyle = dark;
    ctx.fillRect(x, y + h - Math.max(1, Math.round(h * 0.22)), w, Math.max(1, Math.round(h * 0.22)));
  }
}

// ------------------------------------------------------------
//  makeNpcRenderer({ appearance, paint })
//
//  `paint(ctx, facing)` dessine les accessoires dans le repère local
//  du personnage (pieds en 0,0 ; le haut du cube est à y = -30).
//  Le repère est automatiquement miroité pour l'orientation gauche,
//  donc on ne décrit les accessoires QUE pour la vue de droite.
// ------------------------------------------------------------
export function makeNpcRenderer({ appearance, paint, detail = 2 }) {
  const cache = new Map();

  function build(facing) {
    const cached = cache.get(facing);
    if (cached) return cached;

    const canvas = makeCanvas(NPC_SPRITE_W, NPC_SPRITE_H);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    try {
      drawCharacter(ctx, appearance, NPC_ANCHOR_X, NPC_ANCHOR_Y, {
        facing,
        walkPhase: 0,
        scale: 1,
        shadow: false,
        detail,
      });
    } catch (err) {
      console.error('AVANIA: drawCharacter', appearance?.name, err);
    }

    if (paint) {
      try {
        ctx.save();
        ctx.translate(NPC_ANCHOR_X, NPC_ANCHOR_Y);
        if (facing === 'left') ctx.scale(-1, 1);
        paint(ctx, facing);
        ctx.restore();
      } catch (err) {
        console.error('AVANIA: paint marchand', appearance?.name, err);
        try { ctx.restore(); } catch {}
      }
    }

    cache.set(facing, canvas);
    return canvas;
  }

  // Dessine le PNJ, pieds au point (x, y).
  return function draw(ctx, x, y, opts = {}) {
    const { facing = 'right', walkPhase = 0, scale = 1, shadow = true } = opts;
    const bob = Math.sin(walkPhase) * 1.4;
    const squash = 1 + Math.sin(walkPhase * 2) * 0.04;
    const sprite = build(facing === 'left' ? 'left' : 'right');

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    if (shadow) ctx.drawImage(getNpcShadow(), -17, -6, 34, 12);
    ctx.save();
    ctx.translate(0, -bob);
    ctx.scale(1, squash);
    ctx.drawImage(sprite, -NPC_ANCHOR_X, -NPC_ANCHOR_Y, NPC_SPRITE_W, NPC_SPRITE_H);
    ctx.restore();
    ctx.restore();
  };
}

// Étiquette de nom au-dessus du PNJ (rendue une fois, mise en cache).
// Version améliorée : plus grande, bord doré pour marchands, ombre portée
const nameTagCache = new Map();
export function getNpcNameTag(label, sub) {
  const key = `${label}|${sub || ''}`;
  const cached = nameTagCache.get(key);
  if (cached) return cached;

  const isMerchant = /marchand/i.test(sub || '') || /Gaspard|Aldric/.test(label);
  const px = 2; // rendu 2× : texte net au zoom du jeu
  const fontMain = `bold ${10 * px}px system-ui, sans-serif`;
  const fontSub = `bold ${7.5 * px}px system-ui, sans-serif`;
  const measure = makeCanvas(4, 4).getContext('2d');
  measure.font = fontMain;
  let w = measure.measureText(label).width;
  if (sub) {
    measure.font = fontSub;
    w = Math.max(w, measure.measureText(sub).width);
  }
  const wPx = Math.ceil(w + 18 * px);
  const hPx = (sub ? 26 : 16) * px;

  const c = makeCanvas(wPx, hPx);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  // Fond avec dégradé
  const grad = ctx.createLinearGradient(0, 0, 0, hPx);
  if (isMerchant) {
    grad.addColorStop(0, 'rgba(42,38,28,0.92)');
    grad.addColorStop(1, 'rgba(28,24,16,0.92)');
  } else {
    grad.addColorStop(0, 'rgba(24,28,24,0.88)');
    grad.addColorStop(1, 'rgba(16,20,18,0.88)');
  }
  ctx.fillStyle = grad;
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(0, 0, wPx, hPx, 7 * px);
    ctx.fill();
  } else {
    ctx.fillRect(0, 0, wPx, hPx);
  }
  // Bord doré pour marchands, blanc pour autres
  ctx.strokeStyle = isMerchant ? 'rgba(212,175,55,0.65)' : 'rgba(255,255,255,0.18)';
  ctx.lineWidth = isMerchant ? 1.2 * px : 0.8 * px;
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(0.5 * px, 0.5 * px, wPx - px, hPx - px, 6 * px);
    ctx.stroke();
  }
  // Liseré intérieur clair
  ctx.fillStyle = isMerchant ? 'rgba(212,175,55,0.12)' : 'rgba(255,255,255,0.06)';
  ctx.fillRect(1 * px, 1 * px, wPx - 2 * px, 1.2 * px);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = fontMain;
  ctx.fillStyle = isMerchant ? '#ffe8a0' : '#ffffff';
  // Ombre texte
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillText(label, wPx / 2 + 0.6 * px, (sub ? 9 * px : hPx / 2) + 0.6 * px);
  ctx.fillStyle = isMerchant ? '#ffe8a0' : '#ffffff';
  ctx.fillText(label, wPx / 2, sub ? 9 * px : hPx / 2);
  if (sub) {
    ctx.font = fontSub;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillText(sub, wPx / 2 + 0.5 * px, 19 * px + 0.5 * px);
    ctx.fillStyle = isMerchant ? '#c9a44a' : '#d0d0d0';
    ctx.fillText(sub, wPx / 2, 19 * px);
  }

  const tag = { canvas: c, w: wPx / px, h: hPx / px };
  nameTagCache.set(key, tag);
  return tag;
}

// Nuage « … » au-dessus de la tête : signale un PNJ avec qui parler.
// Version améliorée : bulle avec fond, bord, et points animés dorés
export function drawSpeechHint(ctx, x, y, scale = 1, time = 0) {
  const pulse = 0.5 + Math.sin(time * 3.5) * 0.5;
  ctx.save();
  ctx.translate(x, y - 44 * scale);
  ctx.scale(scale, scale);
  // Petite bulle fond
  ctx.fillStyle = 'rgba(28,24,16,0.85)';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(-12, -10, 24, 14, 6);
  else ctx.fillRect(-12, -10, 24, 14);
  ctx.fill();
  ctx.strokeStyle = 'rgba(212,175,55,0.45)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  // Queue bulle
  ctx.fillStyle = 'rgba(28,24,16,0.85)';
  ctx.beginPath();
  ctx.moveTo(-2, 4); ctx.lineTo(0, 8); ctx.lineTo(2, 4);
  ctx.closePath(); ctx.fill();
  // Points animés
  for (let i = 0; i < 3; i++) {
    const off = Math.sin(time * 4 + i * 1.1) * 1.2;
    const r = 1.8;
    const px = -6 + i * 6;
    const py = -3 + off * 0.5;
    ctx.fillStyle = `rgba(255,232,160,${0.6 + pulse * 0.4})`;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
    // Éclat
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(px - 0.5, py - 0.5, 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
