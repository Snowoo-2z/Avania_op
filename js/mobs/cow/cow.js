// ============================================================
//  AVANIA — Vache
//  Tout ce qu'il faut pour être en jeu : définition (stats,
//  butin), palettes (normale + « coup reçu ») et dessin.
//
//  Design : robe brune à taches crème organiques, gros museau
//  rose à naseaux, cornes crème (la lointaine un cran plus
//  haute), oreille et queue à houppette. Toujours dessinée de
//  profil ; le moteur miroite ce dessin pour la droite.
// ============================================================

import { px, rrect, eye, drawLegs } from '../render-utils.js';

export const DEF = {
  label: 'Vache',
  hp: 12,
  speed: 20,
  drops: [{ id: 'rawBeef', min: 1, max: 3 }],
};

export const PAL = {
  bodyOut: '#54341c', body: '#8a5a3a', bodySh: '#6e4528',
  bodyHi: 'rgba(255,255,255,0.16)', belly: 'rgba(0,0,0,0.10)',
  patch: '#efe5d3', patchSh: '#e0d2ba',
  leg: '#6e4528', hoof: '#3f2c1b',
  hornOut: '#b3a179', horn: '#eadfc6', hornHi: '#ffffff',
  earIn: '#c98f6d', muzzleOut: '#c98a7c', muzzle: '#e8ae9e', nostril: '#7c4438',
  tail: '#6e4528', tuft: '#4a3423',
  eye: '#20202a',
};
export const HIT = {
  bodyOut: '#e8b4b4', body: '#ffffff', bodySh: '#ffe2e2',
  bodyHi: 'rgba(255,255,255,0.25)', belly: 'rgba(255,200,200,0.18)',
  patch: '#fff4f4', patchSh: '#fbe4e4',
  leg: '#ffe4e4', hoof: '#e8b4b4',
  hornOut: '#f2d0d0', horn: '#ffffff', hornHi: '#ffffff',
  earIn: '#ffd0d0', muzzleOut: '#f0b8b8', muzzle: '#ffe0e0', nostril: '#b85c5c',
  tail: '#ffe2e2', tuft: '#e8b4b4',
  eye: '#8a3b3b',
};

// Taches organiques (unions de rectangles croisés).
const PATCHES_SIDE = [
  [[-9, -14, 7, 5], [-8, -15, 5, 7], [-10, -13, 9, 3]],
  [[5, -12, 7, 5], [6, -13, 5, 7], [4, -11, 9, 3]],
];

function patches(ctx, pal) {
  for (const g of PATCHES_SIDE) {
    for (const [x, y, w, h] of g) px(ctx, x, y, w, h, pal.patch);
    // petite ombre en bas de la tache pour l'inscrire dans la robe
    const [fx, fy, fw, fh] = g[0];
    px(ctx, fx, fy + fh - 1, fw, 1, pal.patchSh);
  }
}

// Profil gauche (la marche vers la droite est un miroir).
export function drawSide(ctx, pal, legStep) {
  drawLegs(ctx, [-11, -5, 3, 10], -7, 7, pal, legStep);
  // queue fine retombant de la croupe, houppette sombre
  px(ctx, 13, -14, 2, 6, pal.tail);
  px(ctx, 12, -8, 4, 3, pal.tuft);
  // corps
  rrect(ctx, -16, -18, 31, 13, 5, pal.bodyOut);
  rrect(ctx, -15, -17, 29, 11, 4, pal.body);
  patches(ctx, pal);
  px(ctx, -13, -16, 26, 1, pal.bodyHi); // reflet du dos
  px(ctx, -13, -8, 26, 2, pal.belly);   // ligne ventrale
  // tête : gros crâne + museau rose qui dépasse vers l'avant-bas
  rrect(ctx, -23, -18, 13, 12, 3, pal.bodyOut);
  rrect(ctx, -22, -17, 11, 10, 3, pal.body);
  px(ctx, -24, -10, 8, 6, pal.muzzleOut);
  px(ctx, -23, -9, 6, 4, pal.muzzle);
  px(ctx, -22, -7, 2, 1, pal.nostril);
  px(ctx, -20, -5, 3, 1, pal.nostril);
  // cornes : la proche pleine, la lointaine un cran plus haute et plus fine
  px(ctx, -21, -22, 4, 4, pal.hornOut);
  px(ctx, -20, -21, 2, 4, pal.horn);
  px(ctx, -20, -22, 1, 1, pal.hornHi);
  px(ctx, -15, -23, 3, 3, pal.hornOut);
  px(ctx, -14, -22, 1, 2, pal.horn);
  px(ctx, -17, -18, 3, 2, pal.bodySh); // touffe de poil entre les cornes
  // oreille sur le coin arrière du crâne
  px(ctx, -11, -16, 4, 3, pal.bodyOut);
  px(ctx, -10, -15, 3, 2, pal.body);
  px(ctx, -9, -14, 1, 1, pal.earIn);
  eye(ctx, -17, -14, pal.eye);
}
