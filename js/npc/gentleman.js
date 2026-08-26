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
  skin: 'hale',           // teint plus chaleureux et vivant
  hairStyle: 'raie',      // raie sur le côté — gentleman distingué
  hairColor: 'brun',      // brun riche, plus élégant que gris
  eyes: 'bleu',           // yeux bleus perçants
  shirt: 'blanc',
  pants: 'noir',
  hat: 'haut-de-forme',   // haut-de-forme beaucoup plus classe que melon
  glasses: 'rondes',
  facialHair: 'moustache',
};

export const GENTLEMAN_NAME = 'M. Lambert';

const SUIT = {
  jacket: '#1c2436',
  jacketLight: '#2e3a54',
  jacketMid: '#25324a',
  jacketDark: '#121a2a',
  shirt: '#fdfcf5',
  shirtShade: '#e8e3d1',
  shirtCollar: '#ffffff',
  vest: '#2a344c',
  vestLight: '#3b4a68',
  vestDark: '#1e273a',
  tie: '#8e1e32',
  tieDark: '#5a1220',
  tieLight: '#b83a4e',
  tieGold: '#d4a85c',
  pocketSquare: '#d4af37',
  pocketSquareLight: '#e8c96a',
  buttonGold: '#c9a227',
  buttonGoldLight: '#e6c86a',
  buttonGoldDark: '#8a6d1b',
  chainGold: '#d4af37',
  caseBody: '#4e2f1c',
  caseLight: '#6e4328',
  caseMid: '#5a3822',
  caseDark: '#2e1b10',
  caseLock: '#d4af37',
  caseLockLight: '#e8c96a',
  caseStitch: '#7a4a2e',
  cuffWhite: '#fdfcf5',
};

// Le costume, dans le repère local du personnage (pieds en 0,0).
// La bande « chemise » du cube occupe y ∈ [-10, -4] : c'est là que
// viennent le col blanc et la cravate. On refait tout le haut en
// version luxe : gilet, veste satinée, cravate à rayures, pochette,
// boutons dorés, serviette en cuir cousue main.
function paintSuit(ctx) {
  // --- Chemise blanche impeccable, avec ombrage subtil ---
  ctx.fillStyle = SUIT.shirt;
  ctx.fillRect(-7, -10.5, 14, 6.5);
  // Ombre douce sous le col
  ctx.fillStyle = SUIT.shirtShade;
  ctx.fillRect(-7, -5.2, 14, 1.2);
  // Col blanc cassé, deux pointes
  ctx.fillStyle = SUIT.shirtCollar;
  ctx.beginPath();
  ctx.moveTo(-6, -10.5); ctx.lineTo(-1.2, -10.5); ctx.lineTo(-2.8, -7.8); ctx.lineTo(-6.8, -8.6);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(6, -10.5); ctx.lineTo(1.2, -10.5); ctx.lineTo(2.8, -7.8); ctx.lineTo(6.8, -8.6);
  ctx.closePath(); ctx.fill();
  // Liseré du col
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = 0.6;
  ctx.stroke();

  // --- Gilet (waistcoat) gris-bleu, boutonné ---
  ctx.fillStyle = SUIT.vest;
  ctx.fillRect(-7, -10.5, 14, 6.5);
  // Lumière sur le gilet
  ctx.fillStyle = SUIT.vestLight;
  ctx.fillRect(-7, -10.5, 14, 1.2);
  ctx.fillStyle = SUIT.vestDark;
  ctx.fillRect(-7, -5.2, 14, 1.2);
  // Découpe en V pour laisser voir la chemise au centre
  ctx.fillStyle = SUIT.shirt;
  ctx.beginPath();
  ctx.moveTo(-2.2, -10.5); ctx.lineTo(2.2, -10.5); ctx.lineTo(3.2, -4.5); ctx.lineTo(-3.2, -4.5);
  ctx.closePath(); ctx.fill();
  // Petits boutons du gilet
  ctx.fillStyle = SUIT.buttonGoldDark;
  ctx.beginPath(); ctx.arc(-0.8, -7.8, 0.7, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(-0.8, -5.8, 0.7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = SUIT.buttonGoldLight;
  ctx.beginPath(); ctx.arc(-1, -8, 0.35, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(-1, -6, 0.35, 0, Math.PI * 2); ctx.fill();

  // --- Veste : deux revers satinés larges, très chic ---
  // Revers gauche
  ctx.fillStyle = SUIT.jacket;
  ctx.beginPath();
  ctx.moveTo(-15, -10.5); ctx.lineTo(-7, -10.5); ctx.lineTo(-8.5, -7); ctx.lineTo(-11, -4); ctx.lineTo(-15, -4);
  ctx.closePath(); ctx.fill();
  // Revers droit
  ctx.beginPath();
  ctx.moveTo(15, -10.5); ctx.lineTo(7, -10.5); ctx.lineTo(8.5, -7); ctx.lineTo(11, -4); ctx.lineTo(15, -4);
  ctx.closePath(); ctx.fill();
  // Reflet satiné sur les revers (liseré clair)
  ctx.fillStyle = SUIT.jacketLight;
  ctx.beginPath();
  ctx.moveTo(-14.2, -10.2); ctx.lineTo(-7.8, -10.2); ctx.lineTo(-9, -8.2); ctx.lineTo(-13.5, -8.2);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(14.2, -10.2); ctx.lineTo(7.8, -10.2); ctx.lineTo(9, -8.2); ctx.lineTo(13.5, -8.2);
  ctx.closePath(); ctx.fill();
  // Ombre profonde sous les revers
  ctx.fillStyle = SUIT.jacketDark;
  ctx.fillRect(-15, -4.8, 6, 0.9);
  ctx.fillRect(9, -4.8, 6, 0.9);

  // --- Cravate bordeaux à rayures dorées, nœud Windsor ---
  // Nœud
  ctx.fillStyle = SUIT.tieDark;
  ctx.beginPath();
  ctx.moveTo(-2.4, -10.5); ctx.lineTo(2.4, -10.5); ctx.lineTo(1.8, -8.2); ctx.lineTo(-1.8, -8.2);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = SUIT.tie;
  ctx.beginPath();
  ctx.moveTo(-2, -10.2); ctx.lineTo(2, -10.2); ctx.lineTo(1.5, -8.4); ctx.lineTo(-1.5, -8.4);
  ctx.closePath(); ctx.fill();
  // Lame de cravate avec pointe
  ctx.fillStyle = SUIT.tie;
  ctx.beginPath();
  ctx.moveTo(-1.7, -8.2); ctx.lineTo(1.7, -8.2); ctx.lineTo(2.6, -4.8); ctx.lineTo(0, -3.8); ctx.lineTo(-2.6, -4.8);
  ctx.closePath(); ctx.fill();
  // Rayures diagonales dorées sur la cravate
  ctx.strokeStyle = SUIT.tieGold;
  ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(-1.2, -7.8); ctx.lineTo(0.2, -6.4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-0.2, -7.6); ctx.lineTo(1.2, -6.2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0.5, -6.2); ctx.lineTo(1.8, -5); ctx.stroke();
  // Reflet soyeux
  ctx.fillStyle = SUIT.tieLight;
  ctx.fillRect(-0.9, -8, 0.6, 2.8);
  // Épingle à cravate dorée
  ctx.fillStyle = SUIT.chainGold;
  ctx.fillRect(-0.5, -6.2, 1, 0.7);
  ctx.fillStyle = SUIT.buttonGoldLight;
  ctx.beginPath(); ctx.arc(0, -5.85, 0.45, 0, Math.PI * 2); ctx.fill();

  // --- Boutons de veste dorés, bombés ---
  // Bouton haut
  ctx.fillStyle = SUIT.buttonGoldDark;
  ctx.beginPath(); ctx.arc(-8.8, -7.6, 1.1, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = SUIT.buttonGold;
  ctx.beginPath(); ctx.arc(-8.8, -7.6, 0.9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = SUIT.buttonGoldLight;
  ctx.beginPath(); ctx.arc(-9.1, -7.9, 0.4, 0, Math.PI * 2); ctx.fill();
  // Bouton bas
  ctx.fillStyle = SUIT.buttonGoldDark;
  ctx.beginPath(); ctx.arc(-8.8, -5.2, 1.1, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = SUIT.buttonGold;
  ctx.beginPath(); ctx.arc(-8.8, -5.2, 0.9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = SUIT.buttonGoldLight;
  ctx.beginPath(); ctx.arc(-9.1, -5.5, 0.4, 0, Math.PI * 2); ctx.fill();

  // --- Pochette dorée dans la poche poitrine (côté gauche du porteur = droite écran) ---
  ctx.fillStyle = SUIT.pocketSquare;
  ctx.beginPath();
  ctx.moveTo(9.2, -7.2); ctx.lineTo(12.8, -7.2); ctx.lineTo(13.2, -8.4); ctx.lineTo(11.5, -9.2); ctx.lineTo(9.6, -8.6);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = SUIT.pocketSquareLight;
  ctx.beginPath();
  ctx.moveTo(9.6, -8.2); ctx.lineTo(11.2, -8.2); ctx.lineTo(11.6, -8.8); ctx.lineTo(10, -8.8);
  ctx.closePath(); ctx.fill();

  // --- Chaîne de montre gousset dorée, qui dépasse du gilet ---
  ctx.strokeStyle = SUIT.chainGold;
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(3.5, -6.8);
  ctx.quadraticCurveTo(5.5, -5.8, 6.8, -4.6);
  ctx.stroke();
  ctx.fillStyle = SUIT.chainGold;
  ctx.beginPath(); ctx.arc(6.8, -4.6, 0.6, 0, Math.PI * 2); ctx.fill();

  // --- Manchette blanche qui dépasse + bouton de manchette ---
  ctx.fillStyle = SUIT.cuffWhite;
  ctx.fillRect(15, -6.2, 3.2, 2.2);
  ctx.fillStyle = SUIT.buttonGold;
  ctx.fillRect(17.2, -5.6, 1, 1);

  // --- Serviette en cuir de luxe, tenue du côté droit ---
  const cx = 17.5;
  // Corps principal avec ombrage voxel
  voxelRect(ctx, cx - 5.5, -13.5, 12, 9.5, SUIT.caseBody, SUIT.caseLight, SUIT.caseDark);
  // Coutures : pointillés clairs autour
  ctx.strokeStyle = SUIT.caseStitch;
  ctx.lineWidth = 0.45;
  ctx.setLineDash([1, 1.2]);
  ctx.strokeRect(cx - 5, -13, 11, 8.5);
  ctx.setLineDash([]);
  // Fermoir doré rectangulaire avec reflet
  ctx.fillStyle = SUIT.caseDark;
  ctx.fillRect(cx - 1.6, -9.8, 3.2, 2.6);
  ctx.fillStyle = SUIT.caseLock;
  ctx.fillRect(cx - 1.3, -9.5, 2.6, 2);
  ctx.fillStyle = SUIT.caseLockLight;
  ctx.fillRect(cx - 1.3, -9.5, 2.6, 0.6);
  // Petite serrure
  ctx.fillStyle = SUIT.caseDark;
  ctx.beginPath(); ctx.arc(cx, -8.6, 0.5, 0, Math.PI * 2); ctx.fill();
  // Anse en cuir épaisse, avec couture
  ctx.strokeStyle = SUIT.caseDark;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - 2.6, -13.5);
  ctx.quadraticCurveTo(cx - 2.6, -16.2, cx, -16.4);
  ctx.quadraticCurveTo(cx + 2.6, -16.2, cx + 2.6, -13.5);
  ctx.stroke();
  ctx.strokeStyle = SUIT.caseLight;
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(cx - 2.6, -13.5);
  ctx.quadraticCurveTo(cx - 2.6, -16, cx, -16.2);
  ctx.quadraticCurveTo(cx + 2.6, -16, cx + 2.6, -13.5);
  ctx.stroke();
  // Reflet cuir
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(cx - 5.5, -13.5, 12, 1.2);
}

// Dessine le représentant, pieds au point (x, y).
// opts : { facing, walkPhase, scale, shadow }
export const drawGentleman = makeNpcRenderer({
  appearance: GENTLEMAN_APPEARANCE,
  paint: paintSuit,
});
