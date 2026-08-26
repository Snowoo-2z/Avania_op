// ============================================================
//  AVANIA — Les deux marchands de l'entrée de la grotte
//
//    • Gaspard — marchand de MASQUES (protection respiratoire).
//      Bonimenteur, bavard, il adore parler fabrication.
//    • Aldric  — marchand d'ARMURES de minage (protection intégrale).
//      Bourru, peu de mots, il ne lâche rien sur les prix.
//
//  Chacun a son look, dessiné par-dessus le cube du personnage avec
//  le même vocabulaire voxel que le reste du jeu.
// ============================================================

import { makeNpcRenderer, voxelRect } from './base.js';

// ------------------------------------------------------------
//  Gaspard — le marchand de masques
// ------------------------------------------------------------
export const MASK_MERCHANT_APPEARANCE = {
  name: 'Gaspard',
  skin: 'hale',
  hairStyle: 'boucles',
  hairColor: 'brun',
  eyes: 'noisette',
  shirt: 'kaki',
  pants: 'marron',
  hat: 'none',
  glasses: 'none',
  facialHair: 'bouc',
};

const GASPARD = {
  leather: '#7a5a34',
  leatherLight: '#9a7444',
  leatherDark: '#543c1e',
  brass: '#c9a44a',
  brassDark: '#8a6f2a',
  glass: '#bfe3ea',
  cloth: '#c8452f',
};

function paintMaskMerchant(ctx) {
  // --- Lunettes d'atelier relevées sur le front ---
  ctx.fillStyle = GASPARD.leatherDark;
  ctx.fillRect(-13, -26, 26, 3);           // la sangle
  for (const cx of [-7, 7]) {
    voxelRect(ctx, cx - 4, -27, 8, 7, GASPARD.brass, GASPARD.brass, GASPARD.brassDark);
    ctx.fillStyle = GASPARD.glass;
    ctx.fillRect(cx - 2.6, -25.6, 5.2, 4.2);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(cx - 2.6, -25.6, 5.2, 1.2);
  }

  // --- Foulard autour du cou ---
  ctx.fillStyle = GASPARD.cloth;
  ctx.fillRect(-11, -11.5, 22, 3);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(-11, -9.4, 22, 1);

  // --- Tablier de cuir ---
  voxelRect(ctx, -9, -9, 18, 6, GASPARD.leather, GASPARD.leatherLight, GASPARD.leatherDark);
  ctx.fillStyle = GASPARD.brass;
  ctx.fillRect(-1.2, -7.4, 2.4, 2.4);      // la boucle

  // --- Sacoche de masques, sur la hanche droite ---
  voxelRect(ctx, 12, -12, 10, 9, GASPARD.leather, GASPARD.leatherLight, GASPARD.leatherDark);
  // Un masque dépasse de la sacoche : deux oculaires ronds.
  ctx.fillStyle = '#d8d2c4';
  ctx.beginPath();
  ctx.arc(15, -12.6, 2.4, 0, Math.PI * 2);
  ctx.arc(20, -12.6, 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = GASPARD.glass;
  ctx.beginPath();
  ctx.arc(15, -12.6, 1.3, 0, Math.PI * 2);
  ctx.arc(20, -12.6, 1.3, 0, Math.PI * 2);
  ctx.fill();
}

// ------------------------------------------------------------
//  Aldric — le marchand d'armures
// ------------------------------------------------------------
export const ARMOR_MERCHANT_APPEARANCE = {
  name: 'Aldric',
  skin: 'bronze',
  hairStyle: 'chauve',
  hairColor: 'noir',
  eyes: 'gris',
  shirt: 'bordeaux',
  pants: 'noir',
  hat: 'casque',
  glasses: 'none',
  facialHair: 'barbe',
};

const ALDRIC = {
  steel: '#9aa3ab',
  steelLight: '#d3dade',
  steelDark: '#5d666e',
  rivet: '#e8eef2',
  belt: '#4a3218',
  buckle: '#c9a44a',
};

function paintArmorMerchant(ctx) {
  // --- Plastron d'acier sur le torse ---
  voxelRect(ctx, -11, -10.5, 22, 8, ALDRIC.steel, ALDRIC.steelLight, ALDRIC.steelDark);
  // Nervure centrale + rivets.
  ctx.fillStyle = ALDRIC.steelDark;
  ctx.fillRect(-0.9, -10.5, 1.8, 8);
  ctx.fillStyle = ALDRIC.rivet;
  for (const rx of [-8.5, -5, 5, 8.5]) ctx.fillRect(rx, -9, 1.4, 1.4);

  // --- Spallières (épaules) ---
  voxelRect(ctx, -15, -11, 5, 5, ALDRIC.steel, ALDRIC.steelLight, ALDRIC.steelDark);
  voxelRect(ctx, 10, -11, 5, 5, ALDRIC.steel, ALDRIC.steelLight, ALDRIC.steelDark);

  // --- Ceinturon à grosse boucle ---
  ctx.fillStyle = ALDRIC.belt;
  ctx.fillRect(-11, -3.6, 22, 2.6);
  ctx.fillStyle = ALDRIC.buckle;
  ctx.fillRect(-2.2, -3.9, 4.4, 3.2);

  // --- Gantelet au poing droit ---
  voxelRect(ctx, 13, -8, 6, 6, ALDRIC.steel, ALDRIC.steelLight, ALDRIC.steelDark);
  ctx.fillStyle = ALDRIC.rivet;
  ctx.fillRect(14.4, -6.6, 1.2, 1.2);
  ctx.fillRect(16.4, -6.6, 1.2, 1.2);
}

export const drawMaskMerchant = makeNpcRenderer({
  appearance: MASK_MERCHANT_APPEARANCE,
  paint: paintMaskMerchant,
});

export const drawArmorMerchant = makeNpcRenderer({
  appearance: ARMOR_MERCHANT_APPEARANCE,
  paint: paintArmorMerchant,
});
