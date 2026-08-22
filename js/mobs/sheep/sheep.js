// ============================================================
//  AVANIA — Mouton
//  Tout ce qu'il faut pour être en jeu : définition (stats,
//  butin), palettes (normale + « coup reçu ») et dessin.
//
//  Design volontairement RECTANGULAIRE, façon Minecraft :
//  corps = boîte de laine aux angles francs, tête grise
//  rectangulaire coiffée d'une casquette de laine, yeux blancs
//  carrés à pupille sombre. Toujours dessiné de profil ;
//  le moteur miroite ce dessin pour la marche vers la droite.
// ============================================================

import { px, rrect, drawLegs } from '../render-utils.js';

export const DEF = {
  label: 'Mouton',
  hp: 8,
  speed: 26,
  drops: [{ id: 'wool', min: 1, max: 2 }],
};

export const PAL = {
  woolOut: '#b3ab9c', wool: '#f4f1ea', woolSh: '#ddd8cc', woolHi: '#ffffff',
  faceOut: '#43434f', face: '#565663', ear: '#4c4c58',
  leg: '#4a4a55', hoof: '#33333d', pupil: '#26262a', nose: '#3a3a44',
};
export const HIT = {
  woolOut: '#f2c9c9', wool: '#ffffff', woolSh: '#ffe7e7', woolHi: '#ffffff',
  faceOut: '#e8b4b4', face: '#fff0f0', ear: '#ffdada',
  leg: '#ffe4e4', hoof: '#f2c9c9', pupil: '#8a3b3b', nose: '#d98a8a',
};

// Texture de la toison : quelques carrés d'ombre + de lumière
// parsemant la boîte, façon bloc de laine Minecraft.
const WOOL_SPECKS_SH = [[-9, -13], [-2, -10], [4, -13], [8, -8], [-12, -9]];
const WOOL_SPECKS_HI = [[-12, -15], [6, -15]];

// Profil gauche (la marche vers la droite est un miroir).
export function drawSide(ctx, pal, legStep) {
  drawLegs(ctx, [-9, -3, 3, 9], -7, 7, pal, legStep);

  // queue cubique, à l'arrière
  px(ctx, 13, -10, 3, 4, pal.woolOut);
  px(ctx, 13, -9, 2, 3, pal.wool);

  // corps : la grande boîte de laine rectangulaire
  rrect(ctx, -15, -17, 30, 13, 2, pal.woolOut);
  rrect(ctx, -14, -16, 28, 11, 2, pal.wool);
  for (const [sx, sy] of WOOL_SPECKS_SH) px(ctx, sx, sy, 2, 2, pal.woolSh);
  for (const [sx, sy] of WOOL_SPECKS_HI) px(ctx, sx, sy, 2, 1, pal.woolHi);
  px(ctx, -13, -15, 26, 1, 'rgba(255,255,255,0.30)'); // lumière du dos
  px(ctx, -13, -7, 26, 2, 'rgba(0,0,0,0.10)');        // ligne ventrale

  // tête rectangulaire plongée dans la laine
  rrect(ctx, -23, -16, 12, 11, 1, pal.faceOut);
  rrect(ctx, -22, -15, 11, 10, 1, pal.face);
  // casquette de laine sur le dessus de la tête (la toison
  // recouvre le crâne, comme le mouton de Minecraft)
  rrect(ctx, -23, -19, 13, 6, 1, pal.woolOut);
  rrect(ctx, -22, -18, 12, 5, 1, pal.wool);
  px(ctx, -20, -20, 4, 2, pal.woolOut);
  px(ctx, -19, -20, 3, 1, pal.wool);
  px(ctx, -13, -20, 4, 2, pal.woolOut);
  px(ctx, -12, -20, 3, 1, pal.wool);

  // œil blanc carré à pupille sombre (la signature Minecraft)
  px(ctx, -20, -12, 4, 4, pal.woolHi);
  px(ctx, -19, -11, 2, 2, pal.pupil);

  // naseau + petite bouche
  px(ctx, -22, -8, 2, 1, pal.nose);
  px(ctx, -21, -6, 2, 1, pal.nose);

  // oreille discrète qui dépasse sous la casquette
  px(ctx, -10, -11, 2, 3, pal.ear);
}
