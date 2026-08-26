// ============================================================
//  AVANIA — Les deux marchands de l'entrée de la grotte
//  Refonte visuelle complète : Gaspard & Aldric beaucoup plus beaux
//
//    • Gaspard — artisan masquier, steampunk / apothicaire
//      Jeune, malin, mains d'or. Atelier ambulant.
//    • Aldric  — maître forgeron d'armures, vétéran
//      Carrure d'ours, cuir et acier, peu de mots.
//
//  Chaque marchand a un costume peint par-dessus le cube, avec
//  le même vocabulaire voxel mais beaucoup plus de détails :
//  coutures, reflets, usure, accessoires qui racontent une histoire.
// ============================================================

import { makeNpcRenderer, voxelRect } from './base.js';

// ------------------------------------------------------------
//  Gaspard — le marchand de masques (version luxe)
// ------------------------------------------------------------
export const MASK_MERCHANT_APPEARANCE = {
  name: 'Gaspard',
  skin: 'peche',              // teint plus chaleureux
  hairStyle: 'boucles-longues', // chevelure d'artisan un peu folle mais charmante
  hairColor: 'chatain',       // châtain clair, plus lumineux
  eyes: 'vert',               // vert malicieux
  shirt: 'blanc',             // chemise blanche sous le tablier
  pants: 'kaki',
  hat: 'none',
  glasses: 'none',
  facialHair: 'bouc',         // bouc soigné d'artisan
};

const G = {
  leather: '#6e4a2a',
  leatherMid: '#7e5a36',
  leatherLight: '#9a7450',
  leatherDark: '#4a311c',
  leatherDeep: '#352213',
  brass: '#c9a44a',
  brassLight: '#e6c86a',
  brassDark: '#8a6f2a',
  brassDeep: '#5e4a18',
  glass: '#a8d8e8',
  glassLight: '#d4eef6',
  glassDark: '#6fa8bb',
  cloth: '#b83a3a',
  clothLight: '#d45a4a',
  clothDark: '#7a2424',
  clothPattern: '#e8c9a0',
  shirt: '#fdfcf5',
  shirtShade: '#e8e3d1',
  toolSteel: '#8a929a',
  toolSteelLight: '#c2c9d0',
  maskWhite: '#e8e0d0',
  filterCan: '#5a5a5a',
  stitch: '#8a6a4a',
};

function paintMaskMerchant(ctx) {
  const cx = 0;

  // --- Chemise blanche, manches retroussées ---
  ctx.fillStyle = G.shirt;
  ctx.fillRect(-12, -11, 24, 7.5);
  ctx.fillStyle = G.shirtShade;
  ctx.fillRect(-12, -4.5, 24, 1);
  // Boutons chemise
  ctx.fillStyle = '#d8d0b8';
  ctx.fillRect(-0.6, -9, 1.2, 1.2);
  ctx.fillRect(-0.6, -6.5, 1.2, 1.2);
  // Manches retroussées aux bras (petits revers blancs)
  ctx.fillStyle = G.shirt;
  ctx.fillRect(-15.5, -8.5, 4, 3);
  ctx.fillRect(11.5, -8.5, 4, 3);
  ctx.fillStyle = G.shirtShade;
  ctx.fillRect(-15.5, -6.2, 4, 0.8);
  ctx.fillRect(11.5, -6.2, 4, 0.8);

  // --- Foulard rouge à motifs, noué avec pan qui dépasse ---
  // Base foulard
  ctx.fillStyle = G.cloth;
  ctx.fillRect(-12, -11.8, 24, 4.2);
  // Ombre pli
  ctx.fillStyle = G.clothDark;
  ctx.fillRect(-12, -8.8, 24, 1.2);
  // Lumière
  ctx.fillStyle = G.clothLight;
  ctx.fillRect(-12, -11.8, 24, 1);
  // Petits motifs losanges (façon bandana)
  ctx.fillStyle = G.clothPattern;
  for (let i = -9; i <= 9; i += 5) {
    ctx.beginPath();
    ctx.moveTo(i, -10.5); ctx.lineTo(i + 1.2, -9.5); ctx.lineTo(i, -8.5); ctx.lineTo(i - 1.2, -9.5);
    ctx.closePath(); ctx.fill();
  }
  // Pan qui retombe sur la poitrine (petit triangle)
  ctx.fillStyle = G.cloth;
  ctx.beginPath();
  ctx.moveTo(2, -8); ctx.lineTo(8, -7); ctx.lineTo(5, -3.5); ctx.lineTo(1, -4.5);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = G.clothLight;
  ctx.beginPath();
  ctx.moveTo(2.5, -7.5); ctx.lineTo(6.5, -6.8); ctx.lineTo(5.2, -5); ctx.lineTo(2, -5.5);
  ctx.closePath(); ctx.fill();
  // Franges
  ctx.strokeStyle = G.clothPattern;
  ctx.lineWidth = 0.4;
  for (let f = 0; f < 4; f++) {
    ctx.beginPath();
    ctx.moveTo(3 + f * 1.1, -3.5); ctx.lineTo(3.2 + f * 1.1, -2.2);
    ctx.stroke();
  }

  // --- Tablier de cuir d'artisan, avec poches à outils ---
  // Corps principal
  voxelRect(ctx, -10.5, -9.5, 21, 7.5, G.leather, G.leatherLight, G.leatherDark);
  // Coutures autour
  ctx.strokeStyle = G.stitch;
  ctx.lineWidth = 0.45;
  ctx.setLineDash([1.1, 1.1]);
  ctx.strokeRect(-10, -9, 20, 6.5);
  ctx.setLineDash([]);
  // Poche poitrine avec crayon
  ctx.fillStyle = G.leatherDark;
  ctx.fillRect(-8.5, -8.2, 4.5, 3.2);
  ctx.fillStyle = G.leatherLight;
  ctx.fillRect(-8.5, -8.2, 4.5, 0.6);
  // Crayon qui dépasse
  ctx.fillStyle = '#e6c86a';
  ctx.fillRect(-7, -9.5, 0.9, 3);
  ctx.fillStyle = '#b03030';
  ctx.fillRect(-7, -9.5, 0.9, 0.7);
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(-7, -6.8, 0.9, 0.4);
  // Poche basse avec outils
  ctx.fillStyle = G.leatherDark;
  ctx.fillRect(3, -7.5, 6, 4);
  ctx.fillStyle = G.leatherMid;
  ctx.fillRect(3.3, -7.2, 5.4, 3.4);
  // Petite clé à molette qui dépasse
  ctx.fillStyle = G.toolSteel;
  ctx.fillRect(4.5, -8.8, 1, 3.5);
  ctx.fillStyle = G.toolSteelLight;
  ctx.fillRect(4.5, -8.8, 1, 0.7);
  // Anneau clé
  ctx.strokeStyle = G.toolSteel;
  ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.arc(5, -9.2, 0.8, 0, Math.PI * 2); ctx.stroke();
  // Boucle laiton du tablier (ceinture)
  ctx.fillStyle = G.brassDark;
  ctx.fillRect(-1.5, -6.8, 3, 2.8);
  ctx.fillStyle = G.brass;
  ctx.fillRect(-1.2, -6.5, 2.4, 2.2);
  ctx.fillStyle = G.brassLight;
  ctx.fillRect(-1.2, -6.5, 2.4, 0.6);
  ctx.fillStyle = G.leatherDeep;
  ctx.beginPath(); ctx.arc(0, -5.4, 0.6, 0, Math.PI * 2); ctx.fill();

  // --- Sangle du tablier dans le dos (petits bouts visibles) ---
  ctx.fillStyle = G.leatherDark;
  ctx.fillRect(-12.5, -10.5, 2, 1.2);
  ctx.fillRect(10.5, -10.5, 2, 1.2);

  // --- Gants de cuir sans doigts (mitaines) ---
  ctx.fillStyle = G.leatherMid;
  ctx.fillRect(-15.5, -5.5, 4, 2.8);
  ctx.fillRect(11.5, -5.5, 4, 2.8);
  ctx.fillStyle = G.leatherDark;
  ctx.fillRect(-15.5, -3.5, 4, 0.7);
  ctx.fillRect(11.5, -3.5, 4, 0.7);
  // Renforts
  ctx.fillStyle = G.leatherLight;
  ctx.fillRect(-15.2, -5.2, 3.4, 0.6);
  ctx.fillRect(11.8, -5.2, 3.4, 0.6);

  // --- Sacoche d'artisan sur la hanche droite, ultra détaillée ---
  const sx = 13;
  voxelRect(ctx, sx - 5.5, -13, 12, 10.5, G.leather, G.leatherLight, G.leatherDark);
  // Rabat
  ctx.fillStyle = G.leatherMid;
  ctx.fillRect(sx - 5.5, -13, 12, 3.5);
  ctx.fillStyle = G.leatherLight;
  ctx.fillRect(sx - 5.5, -13, 12, 0.8);
  // Couture rabat
  ctx.strokeStyle = G.stitch;
  ctx.lineWidth = 0.4;
  ctx.setLineDash([0.9, 0.9]);
  ctx.strokeRect(sx - 5, -12.5, 11, 2.5);
  ctx.setLineDash([]);
  // Boucle laiton du rabat
  ctx.fillStyle = G.brassDark;
  ctx.fillRect(sx - 1.2, -11.2, 2.8, 2.4);
  ctx.fillStyle = G.brass;
  ctx.fillRect(sx - 0.9, -10.9, 2.2, 1.8);
  ctx.fillStyle = G.brassLight;
  ctx.fillRect(sx - 0.9, -10.9, 2.2, 0.5);
  // Sangle latérale
  ctx.fillStyle = G.leatherDark;
  ctx.fillRect(sx + 5.8, -11, 1.2, 6);
  // Un masque à gaz qui dépasse : filtre + oculaires
  // Corps masque crème
  ctx.fillStyle = G.maskWhite;
  ctx.beginPath();
  ctx.ellipse(sx + 0.5, -8.5, 5.5, 3.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#d8d0b8';
  ctx.beginPath();
  ctx.ellipse(sx + 0.5, -7, 5.5, 1, 0, 0, Math.PI * 2);
  ctx.fill();
  // Oculaires ronds bleutés
  for (const ox of [-2, 2.5]) {
    ctx.fillStyle = G.leatherDeep;
    ctx.beginPath(); ctx.arc(sx + ox, -8.8, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = G.glass;
    ctx.beginPath(); ctx.arc(sx + ox, -8.8, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = G.glassLight;
    ctx.beginPath(); ctx.arc(sx + ox - 0.4, -9.2, 0.6, 0, Math.PI * 2); ctx.fill();
  }
  // Filtre canette qui pend
  ctx.fillStyle = G.filterCan;
  ctx.fillRect(sx + 0.2, -6.2, 2.2, 2.8);
  ctx.fillStyle = '#6a6a6a';
  ctx.fillRect(sx + 0.2, -6.2, 2.2, 0.6);
  // Grille filtre
  ctx.fillStyle = '#3a3a3a';
  for (let fy = -5.5; fy <= -4; fy += 0.7) {
    ctx.fillRect(sx + 0.3, fy, 2, 0.2);
  }

  // --- Lunettes d'atelier relevées sur le front, version steampunk améliorée ---
  // Sangle cuir épaisse avec couture et boucle
  ctx.fillStyle = G.leatherDark;
  ctx.fillRect(-14, -26.5, 28, 3.5);
  ctx.fillStyle = G.leatherLight;
  ctx.fillRect(-14, -26.5, 28, 0.8);
  // Couture sangle
  ctx.strokeStyle = G.stitch;
  ctx.lineWidth = 0.35;
  ctx.setLineDash([0.8, 0.8]);
  ctx.strokeRect(-13.5, -26, 27, 2.5);
  ctx.setLineDash([]);
  // Boucle côté
  ctx.fillStyle = G.brassDark;
  ctx.fillRect(-14.5, -25.8, 1.8, 2.2);
  ctx.fillStyle = G.brass;
  ctx.fillRect(-14.2, -25.5, 1.2, 1.6);

  for (const gx of [-7.2, 7.2]) {
    // Armature laiton épaisse avec rivets
    ctx.fillStyle = G.brassDeep;
    ctx.fillRect(gx - 5, -28.2, 10, 9);
    voxelRect(ctx, gx - 4.5, -27.5, 9, 7.5, G.brass, G.brassLight, G.brassDark);
    // Rivets d'angle
    ctx.fillStyle = G.brassLight;
    ctx.beginPath(); ctx.arc(gx - 3.8, -26.8, 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(gx + 3.8, -26.8, 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(gx - 3.8, -21.2, 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(gx + 3.8, -21.2, 0.5, 0, Math.PI * 2); ctx.fill();
    // Verre bombé bleuté avec reflet
    ctx.fillStyle = G.glassDark;
    ctx.fillRect(gx - 3.2, -26, 6.4, 5);
    ctx.fillStyle = G.glass;
    ctx.fillRect(gx - 2.8, -25.6, 5.6, 4.2);
    ctx.fillStyle = G.glassLight;
    ctx.fillRect(gx - 2.8, -25.6, 5.6, 1.2);
    ctx.fillRect(gx - 2.8, -25.6, 1, 4.2);
    // Petit éclat blanc
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.arc(gx - 1.2, -24.8, 0.7, 0, Math.PI * 2); ctx.fill();
  }
  // Pont nasal en cuir entre les deux oculaires
  ctx.fillStyle = G.leatherMid;
  ctx.fillRect(-2.2, -25.5, 4.4, 2);
  ctx.fillStyle = G.leatherDark;
  ctx.fillRect(-2.2, -24.2, 4.4, 0.6);

  // --- Badge artisanal "G" sur le tablier ---
  ctx.fillStyle = G.brassDark;
  ctx.beginPath(); ctx.arc(-8.8, -5, 1.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = G.brass;
  ctx.beginPath(); ctx.arc(-8.8, -5, 1.1, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = G.leatherDeep;
  ctx.font = 'bold 1.6px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('G', -8.8, -4.85);
}

// ------------------------------------------------------------
//  Aldric — le marchand d'armures (version vétéran imposant)
// ------------------------------------------------------------
export const ARMOR_MERCHANT_APPEARANCE = {
  name: 'Aldric',
  skin: 'hale',               // plus vivant que bronze
  hairStyle: 'chauve',        // crâne rasé de vétéran
  hairColor: 'gris',          // barbe grisonnante
  eyes: 'bleu-clair',         // regard acier glacial
  shirt: 'noir',              // sous-couche noire
  pants: 'gris',              // pantalon de forgeron
  hat: 'casque',              // casque de forgeron
  glasses: 'none',
  facialHair: 'barbe',        // barbe de forgeron tressée
};

const A = {
  steel: '#8e98a2',
  steelMid: '#9aa3ab',
  steelLight: '#c2c9d0',
  steelBright: '#d8dde2',
  steelDark: '#5d666e',
  steelDeep: '#3a4148',
  steelShadow: '#2a3036',
  rivet: '#e6edf2',
  rivetDark: '#a8b0b8',
  leather: '#3d2816',
  leatherMid: '#5a3d22',
  leatherLight: '#7a5a34',
  belt: '#3d2816',
  beltLight: '#5a3d22',
  buckle: '#c9a44a',
  buckleLight: '#e6c86a',
  buckleDark: '#8a6f2a',
  cape: '#4a1e2e',
  capeLight: '#6a2a42',
  capeDark: '#2e1220',
  fur: '#5a5a5a',
  furLight: '#7a7a7a',
  furDark: '#3a3a3a',
  hammerWood: '#6b4a2a',
  hammerSteel: '#9aa3ab',
  scar: '#8a4a4a',
};

function paintArmorMerchant(ctx) {
  // --- Cape courte bordeaux dans le dos, avec attache dorée ---
  // On la dessine d'abord pour qu'elle passe derrière l'armure
  ctx.fillStyle = A.capeDark;
  ctx.beginPath();
  ctx.moveTo(-12, -10); ctx.lineTo(-14, -2); ctx.lineTo(-11, -1); ctx.lineTo(-9, -9);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = A.cape;
  ctx.beginPath();
  ctx.moveTo(-11.5, -10); ctx.lineTo(-13.5, -2.5); ctx.lineTo(-10.5, -1.5); ctx.lineTo(-8.5, -9);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = A.capeLight;
  ctx.beginPath();
  ctx.moveTo(-11, -10); ctx.lineTo(-12.5, -5); ctx.lineTo(-10, -8);
  ctx.closePath(); ctx.fill();
  // Attache cape côté épaule
  ctx.fillStyle = A.buckleDark;
  ctx.beginPath(); ctx.arc(-10.5, -9.5, 1.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = A.buckle;
  ctx.beginPath(); ctx.arc(-10.5, -9.5, 0.9, 0, Math.PI * 2); ctx.fill();
  // Fourrure sur le bord cape (vétéran du nord)
  ctx.fillStyle = A.furDark;
  ctx.fillRect(-14, -2.8, 3.5, 1.2);
  ctx.fillStyle = A.fur;
  ctx.fillRect(-13.8, -2.6, 3.1, 0.7);

  // --- Sous-couche noire matelassée (gambison) ---
  ctx.fillStyle = '#1e2226';
  ctx.fillRect(-11, -10.5, 22, 8);
  // Couture matelassée losanges
  ctx.strokeStyle = '#2a2f36';
  ctx.lineWidth = 0.35;
  ctx.setLineDash([1, 1]);
  for (let y = -9; y <= -4; y += 2) {
    ctx.beginPath();
    ctx.moveTo(-10, y); ctx.lineTo(-5, y + 1); ctx.lineTo(0, y); ctx.lineTo(5, y + 1); ctx.lineTo(10, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // --- Plastron d'acier lourd, avec arête centrale et emblème marteau ---
  voxelRect(ctx, -12, -11, 24, 9, A.steel, A.steelLight, A.steelDark);
  // Plaques latérales
  ctx.fillStyle = A.steelMid;
  ctx.fillRect(-11.5, -10.5, 10.5, 8);
  ctx.fillRect(1, -10.5, 10.5, 8);
  // Arête centrale brillante (renfort)
  ctx.fillStyle = A.steelDeep;
  ctx.fillRect(-1.2, -11, 2.4, 9);
  ctx.fillStyle = A.steelLight;
  ctx.fillRect(-0.7, -11, 0.7, 9);
  ctx.fillStyle = A.steelBright;
  ctx.fillRect(-0.7, -11, 0.4, 9);
  // Reflet haut sur le plastron
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(-12, -11, 24, 1.5);
  // Ombre basse
  ctx.fillStyle = A.steelShadow;
  ctx.fillRect(-12, -3, 24, 1);

  // Emblème marteau gravé au centre
  ctx.fillStyle = A.steelDeep;
  ctx.fillRect(-1, -8.5, 2, 0.6); // manche
  ctx.fillRect(-1.8, -9.2, 3.6, 1); // tête marteau
  ctx.fillStyle = A.steelDark;
  ctx.fillRect(-1.6, -9, 3.2, 0.5);

  // Rivets - 8 rivets bien placés avec reflet
  const rivetPos = [
    [-10, -9.5], [-5.5, -9.5], [5.5, -9.5], [10, -9.5],
    [-10, -4.2], [-5.5, -4.2], [5.5, -4.2], [10, -4.2],
  ];
  for (const [rx, ry] of rivetPos) {
    ctx.fillStyle = A.rivetDark;
    ctx.beginPath(); ctx.arc(rx, ry, 0.9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = A.rivet;
    ctx.beginPath(); ctx.arc(rx, ry, 0.7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(rx - 0.2, ry - 0.2, 0.25, 0, Math.PI * 2); ctx.fill();
  }

  // Rayures d'usure / éraflures sur l'acier
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(-8, -7); ctx.lineTo(-4, -6.5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(4, -8); ctx.lineTo(8, -7.2); ctx.stroke();

  // --- Spallières (épaulières) à lames, beaucoup plus imposantes ---
  // Épaule gauche
  voxelRect(ctx, -17, -12, 6.5, 6, A.steel, A.steelLight, A.steelDark);
  // Lames supplémentaires
  ctx.fillStyle = A.steelMid;
  ctx.fillRect(-17, -10.5, 6.5, 1.2);
  ctx.fillRect(-17, -8.5, 6.5, 1.2);
  ctx.fillStyle = A.steelLight;
  ctx.fillRect(-17, -10.5, 6.5, 0.4);
  ctx.fillRect(-17, -8.5, 6.5, 0.4);
  // Rivet épaule
  ctx.fillStyle = A.rivet;
  ctx.beginPath(); ctx.arc(-13.8, -9, 0.6, 0, Math.PI * 2); ctx.fill();

  // Épaule droite (plus grosse, côté marteau)
  voxelRect(ctx, 10.5, -12, 6.5, 6, A.steel, A.steelLight, A.steelDark);
  ctx.fillStyle = A.steelMid;
  ctx.fillRect(10.5, -10.5, 6.5, 1.2);
  ctx.fillRect(10.5, -8.5, 6.5, 1.2);
  ctx.fillStyle = A.steelLight;
  ctx.fillRect(10.5, -10.5, 6.5, 0.4);
  ctx.fillRect(10.5, -8.5, 6.5, 0.4);
  ctx.fillStyle = A.rivet;
  ctx.beginPath(); ctx.arc(13.8, -9, 0.6, 0, Math.PI * 2); ctx.fill();

  // --- Ceinturon de forgeron épais, boucle massive + outils ---
  // Ceinture cuir épaisse
  ctx.fillStyle = A.belt;
  ctx.fillRect(-12, -3.8, 24, 3.2);
  ctx.fillStyle = A.beltLight;
  ctx.fillRect(-12, -3.8, 24, 0.8);
  ctx.fillStyle = '#2a1a0e';
  ctx.fillRect(-12, -1.2, 24, 0.6);
  // Couture ceinture
  ctx.strokeStyle = '#7a5a34';
  ctx.lineWidth = 0.35;
  ctx.setLineDash([1, 1]);
  ctx.strokeRect(-11.5, -3.3, 23, 2.2);
  ctx.setLineDash([]);
  // Boucle laiton massive rectangulaire avec chanfrein
  ctx.fillStyle = A.buckleDark;
  ctx.fillRect(-3.2, -4.3, 6.4, 4.2);
  voxelRect(ctx, -2.8, -3.9, 5.6, 3.4, A.buckle, A.buckleLight, A.buckleDark);
  // Ardillon
  ctx.fillStyle = A.buckleDark;
  ctx.fillRect(-0.3, -3.9, 0.6, 3.4);
  // Trou ceinture
  ctx.fillStyle = '#1a1208';
  ctx.beginPath(); ctx.arc(1.5, -2.2, 0.5, 0, Math.PI * 2); ctx.fill();

  // Marteau de forgeron accroché à la ceinture côté droit
  const hx = 8.5;
  // Manche bois
  ctx.fillStyle = A.hammerWood;
  ctx.fillRect(hx, -3.5, 1.4, 5);
  ctx.fillStyle = '#8a6a3a';
  ctx.fillRect(hx, -3.5, 1.4, 0.6);
  // Tête marteau acier
  ctx.fillStyle = A.steelDeep;
  ctx.fillRect(hx - 1.5, 1, 4.4, 2.2);
  voxelRect(ctx, hx - 1.3, 1.2, 4, 1.8, A.hammerSteel, A.steelLight, A.steelDark);
  // Reflet marteau
  ctx.fillStyle = A.steelBright;
  ctx.fillRect(hx - 1.3, 1.2, 4, 0.4);

  // Petite bourse cuir côté gauche
  ctx.fillStyle = A.leather;
  ctx.fillRect(-9.5, -1, 3.5, 3);
  ctx.fillStyle = A.leatherLight;
  ctx.fillRect(-9.5, -1, 3.5, 0.6);
  ctx.fillStyle = A.leatherMid;
  ctx.beginPath(); ctx.arc(-7.8, -0.8, 0.8, 0, Math.PI * 2); ctx.fill();

  // --- Gantelet d'acier articulé, main droite ---
  // Base gant cuir
  ctx.fillStyle = A.leatherMid;
  ctx.fillRect(13.5, -8.5, 5.5, 7);
  // Plaques articulées (3 lames)
  for (let i = 0; i < 3; i++) {
    const gy = -8 + i * 2.1;
    voxelRect(ctx, 13.2, gy, 6.2, 1.8, A.steel, A.steelLight, A.steelDark);
    // Rivets gantelet
    ctx.fillStyle = A.rivet;
    ctx.beginPath(); ctx.arc(14.5, gy + 0.9, 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(18, gy + 0.9, 0.4, 0, Math.PI * 2); ctx.fill();
  }
  // Jointures doigts renforcées
  ctx.fillStyle = A.steelDark;
  ctx.fillRect(13.2, -2.2, 6.2, 1);
  ctx.fillStyle = A.steelLight;
  ctx.fillRect(13.2, -2.2, 6.2, 0.3);

  // --- Brassard cuir clouté bras gauche ---
  ctx.fillStyle = A.leather;
  ctx.fillRect(-16, -7.5, 4.5, 5);
  ctx.fillStyle = A.leatherLight;
  ctx.fillRect(-16, -7.5, 4.5, 0.7);
  // Clous
  ctx.fillStyle = A.buckle;
  for (let cy = -6.5; cy <= -4; cy += 1.2) {
    ctx.beginPath(); ctx.arc(-13.8, cy, 0.5, 0, Math.PI * 2); ctx.fill();
  }

  // --- Cicatrice sur le cube (histoire de vétéran) ---
  // On dessine une petite cicatrice sur la joue gauche (si visible)
  // C'est subtil mais ça raconte une histoire
  ctx.strokeStyle = A.scar;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(-6, -6);
  ctx.lineTo(-5, -4.5);
  ctx.stroke();
}

export const drawMaskMerchant = makeNpcRenderer({
  appearance: MASK_MERCHANT_APPEARANCE,
  paint: paintMaskMerchant,
  detail: 2,
});

export const drawArmorMerchant = makeNpcRenderer({
  appearance: ARMOR_MERCHANT_APPEARANCE,
  paint: paintArmorMerchant,
  detail: 2,
});
