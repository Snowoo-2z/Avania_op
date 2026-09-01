// ============================================================
//  AVANIA — Gab, le passeur (look marin)
//
//  Il tient la traversée au bout du quai : on lui parle, on paie,
//  et il vous dépose de l'autre côté. Son dessin suit la même
//  fabrique que les autres PNJ (js/npc/base.js) : le cube du
//  personnage est pré-rendu, puis le costume de marin est peint
//  dessus — bachi à pompon, marinière et glène de cordage.
//
//  Repère du dessin : pieds en (0,0), haut du cube à y = -30.
//  (Le repère est miroité automatiquement pour l'orientation
//  gauche : on ne décrit le marin que vu de droite.)
// ============================================================

import { makeNpcRenderer, voxelRect } from './base.js';

// Apparence de Gab. Tous les identifiants existent dans config.js.
export const GAB_APPEARANCE = {
  name: 'Gab',
  skin: 'hale',          // tanné par le grand air
  hairStyle: 'court',
  hairColor: 'chatain',
  eyes: 'marron',
  shirt: 'blanc',        // la marinière (rayures peintes par-dessus)
  pants: 'jean',
  hat: 'bonnet',         // recouvert en bachi de marin
  glasses: 'none',
  facialHair: 'barbe',
};

export const GAB_NAME = 'Gab';

const SAILOR = {
  navy: '#2f4356',
  navyLight: '#3d556b',
  navyDark: '#1d2b38',
  white: '#f2f4f2',
  pompon: '#c8453a',
  pomponDark: '#932f27',
  rope: '#c9a86a',
  ropeLight: '#e0c084',
  ropeDark: '#8f7346',
  brass: '#d8b45c',
};

// Le marin, dans le repère local du personnage (pieds en 0,0).
function paintSailor(ctx) {
  // --- Le bachi : bande marine, calot blanc, pompon rouge ---
  //     (le bonnet de base occupe y ∈ [-42, -31], on le recouvre)
  voxelRect(ctx, -17, -37, 34, 6, SAILOR.navy, SAILOR.navyLight, SAILOR.navyDark);
  voxelRect(ctx, -5, -42, 10, 6, SAILOR.white, '#ffffff', '#d3d7d3');
  // Le pompon, au sommet.
  ctx.fillStyle = SAILOR.pompon;
  ctx.beginPath();
  ctx.arc(0.5, -43.5, 2.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = SAILOR.pomponDark;
  ctx.fillRect(-1, -42.2, 3, 1);
  // La jugulaire : une fine lanière qui descend le long de la joue.
  ctx.strokeStyle = SAILOR.navyDark;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(5, -37);
  ctx.lineTo(7.5, -32);
  ctx.stroke();

  // --- La marinière : la bande « chemise » occupe y ∈ [-10, -4] ---
  ctx.fillStyle = SAILOR.white;
  ctx.fillRect(-15, -10, 30, 6);
  // Deux rayures marine franches : à la taille du jeu (la bande ne fait
  // que six pixels) trois rayures se changeaient en bouillie.
  ctx.fillStyle = SAILOR.navy;
  ctx.fillRect(-15, -9.6, 30, 1.8);
  ctx.fillRect(-15, -6.4, 30, 1.8);
  // Col marin : le V plus sombre du plastron, côté poitrine.
  ctx.fillStyle = SAILOR.navyDark;
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.lineTo(9, -10);
  ctx.lineTo(5.5, -5.8);
  ctx.lineTo(2, -6.6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(242,244,242,0.85)';
  ctx.fillRect(2.2, -9.4, 1, 2.4);   // le liseré blanc du col

  // --- La glène de cordage, tenue du côté droit ---
  const cx = 17;
  ctx.strokeStyle = SAILOR.rope;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.arc(cx, -8.5, 4.6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = SAILOR.ropeLight;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, -9.6, 4.6, Math.PI * 0.9, Math.PI * 1.7);
  ctx.stroke();
  // Le bout qui pend.
  ctx.strokeStyle = SAILOR.ropeDark;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(cx + 4, -5.5);
  ctx.quadraticCurveTo(cx + 6.5, -3.5, cx + 4.5, -1.5);
  ctx.stroke();
  // Mousqueton en laiton (on ne sait jamais, sur un quai).
  ctx.fillStyle = SAILOR.brass;
  ctx.fillRect(cx - 1.4, -5.2, 2.8, 2.8);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(cx - 1.4, -5.2, 2.8, 0.9);
}

// Dessine Gab, pieds au point (x, y).
// opts : { facing, walkPhase, scale, shadow }
export const drawSailor = makeNpcRenderer({
  appearance: GAB_APPEARANCE,
  paint: paintSailor,
});
