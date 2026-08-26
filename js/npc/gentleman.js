// ============================================================
//  AVANIA — Le représentant de l'île (« monsieur en costume-cravate »)
//
//  C'est lui qui accueille le joueur à son arrivée, lui remet sa
//  somme de départ et lui explique les règles de l'argent.
//  Le rendu passe par la fabrique de PNJ (js/npc/base.js) : le cube
//  du personnage est pré-rendu, puis le costume est peint dessus.
// ============================================================

import { makeNpcRenderer, voxelRect } from './base.js';

// Apparence du représentant. Tous les identifiants existent dans
// config.js (SKIN_TONES / HAIR_COLORS / HATS / GLASSES / FACIAL_HAIR).
export const GENTLEMAN_APPEARANCE = {
  name: 'M. Lambert',
  skin: 'clair',
  hairStyle: 'court',
  hairColor: 'gris',
  eyes: 'marron',
  shirt: 'noir',     // la veste du costume
  pants: 'noir',     // le pantalon assorti
  hat: 'melon',      // le chapeau melon du notable
  glasses: 'rondes',
  facialHair: 'moustache',
};

export const GENTLEMAN_NAME = 'M. Lambert';

const SUIT = {
  jacket: '#22242c',
  shirt: '#f2f2ee',
  tie: '#a8232c',
  tieDark: '#7d181f',
  caseBody: '#6b4423',
  caseLight: '#8a5a2e',
  caseDark: '#4a2e16',
  caseLock: '#e0c46a',
};

// Le costume, dans le repère local du personnage (pieds en 0,0).
// La bande « chemise » du cube occupe y ∈ [-10, -4] : c'est là que
// viennent le col blanc et la cravate.
function paintSuit(ctx) {
  // --- Plastron de chemise ---
  ctx.fillStyle = SUIT.shirt;
  ctx.fillRect(-6, -10, 12, 6);

  // --- Revers de veste : deux pans sombres qui encadrent la chemise ---
  ctx.fillStyle = SUIT.jacket;
  ctx.beginPath();
  ctx.moveTo(-15, -10);
  ctx.lineTo(-6, -10);
  ctx.lineTo(-9, -4);
  ctx.lineTo(-15, -4);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(15, -10);
  ctx.lineTo(6, -10);
  ctx.lineTo(9, -4);
  ctx.lineTo(15, -4);
  ctx.closePath();
  ctx.fill();

  // --- Cravate : nœud puis lame qui descend ---
  ctx.fillStyle = SUIT.tieDark;
  ctx.fillRect(-2, -10, 4, 2);            // le nœud
  ctx.fillStyle = SUIT.tie;
  ctx.beginPath();
  ctx.moveTo(-1.6, -8);
  ctx.lineTo(1.6, -8);
  ctx.lineTo(2.4, -4.4);
  ctx.lineTo(0, -3.6);
  ctx.lineTo(-2.4, -4.4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(-0.8, -8, 0.9, 3.4);

  // --- Boutons de veste ---
  ctx.fillStyle = '#c9a44a';
  ctx.fillRect(-7.5, -7.5, 1.4, 1.4);
  ctx.fillRect(-7.5, -5.2, 1.4, 1.4);

  // --- Serviette, tenue du côté droit ---
  const cx = 17;
  voxelRect(ctx, cx - 5, -13, 11, 9, SUIT.caseBody, SUIT.caseLight, SUIT.caseDark);
  ctx.fillStyle = SUIT.caseLock;
  ctx.fillRect(cx - 1, -9.5, 2, 2);
  ctx.strokeStyle = SUIT.caseDark;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(cx - 2, -13);
  ctx.lineTo(cx - 2, -15.6);
  ctx.lineTo(cx + 2, -15.6);
  ctx.lineTo(cx + 2, -13);
  ctx.stroke();
}

// Dessine le représentant, pieds au point (x, y).
// opts : { facing, walkPhase, scale, shadow }
export const drawGentleman = makeNpcRenderer({
  appearance: GENTLEMAN_APPEARANCE,
  paint: paintSuit,
});
