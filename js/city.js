// ============================================================
//  AVANIA — Fortune City
//
//  La ville se construit quartier par quartier, comme l'île : tout
//  est généré avec le monde (déterministe — tous les joueurs voient
//  exactement la même ville) et passe par les blocs du jeu.
//
//  État des lieux : le QUARTIER DU PORT (côte ouest), avec sa plage
//  de part et d'autre. Les gratte-ciel et les rues viendront ensuite.
//
//  Plan, vu du ciel (tx = est, ty = sud) :
//
//     y=47 ┌───────────── jetée nord (ponton + parapet) ─────────┐
//     y=50 │ ~~~~~~~ B A S S I N (eau) ~~~~~~~  ⛴ ferry         │
//          │ ~~~~~~~                     ~~~~~~   ▓▓▓ quai ▓▓▓   │
//     y=78 │ ~~~~~~~                     ~~~~~~   ▓▓▓(béton)▓▓   │
//     y=81 └───────────── jetée sud (ponton + parapet) ──────────┘
//          tx=2  (mer)            tx=17   tx=20  tx=22  tx=26
//                                            (cour)  (capitainerie)
// ============================================================

import { CONTAINER_KINDS } from './blocks.js';

// --- Emprise du quartier du port (tuiles, bornes incluses) -------
export const FORTUNE_PORT = {
  // Le bassin : ouvert sur la mer, qui borde la carte à l'ouest.
  bay: { x0: 2, y0: 50, x1: 19, y1: 78 },
  // Le quai principal, en béton (3 tuiles, praticable).
  quay: { x0: 20, y0: 47, x1: 22, y1: 81 },
  // Les deux jetées qui abritent le bassin (ponton + parapet).
  moleN: { x0: 2, y0: 47, x1: 19, y1: 49 },
  moleS: { x0: 2, y0: 79, x1: 19, y1: 81 },
  // La cour de stockage, derrière le quai.
  yard: { x0: 23, y0: 50, x1: 26, y1: 78 },
  // La capitainerie : le bureau du port.
  office: { x0: 28, y0: 57, x1: 33, y1: 66 },
  // Les plages, au nord et au sud du port.
  beachN: { x0: 2, y0: 18, x1: 5, y1: 46 },
  beachS: { x0: 2, y0: 82, x1: 5, y1: 112 },
  // Le ferry amarré au quai (sprite 3 × 3 tuiles de large, 5 × 5 de gabarit).
  ferry: { tx: 18, ty: 64 },
  // Le phare, à la pointe de la jetée nord : il marque l'entrée.
  lighthouse: { tx: 3, ty: 48 },
};

// Panneaux plantés sur le quai (le texte est semé par js/game.js).
export const FORTUNE_SIGNS = [
  { tx: 21, ty: 66, text: 'FORTUNE CITY' },
  { tx: 21, ty: 62, text: 'PORT OUEST' },
];

// ------------------------------------------------------------
//  Construction
// ------------------------------------------------------------
export function buildFortuneCity(world) {
  buildBeaches(world);
  carveBay(world);
  buildQuay(world);
  buildMoles(world);
  buildYard(world);
  buildOffice(world);
  placeFurniture(world);
  return FORTUNE_PORT;
}

// Parcourt un rectangle inclusif en ignorant ce qui sort de la carte.
function eachTile(world, r, fn) {
  for (let ty = r.y0; ty <= r.y1; ty++) {
    for (let tx = r.x0; tx <= r.x1; tx++) {
      if (!world.inBounds(tx, ty)) continue;
      fn(tx, ty, world.idx(tx, ty));
    }
  }
}

// Teinte d'un conteneur, tirée d'un hash de tuile : stable d'une
// partie à l'autre (donc identique pour tout le monde) sans rien
// avoir à stocker dans la carte.
function containerKindAt(tx, ty) {
  const h = (Math.imul(tx + 13, 374761393) ^ Math.imul(ty + 5, 668265263)) >>> 0;
  return CONTAINER_KINDS[h % CONTAINER_KINDS.length];
}

// 1) Les plages : du sable le long de la côte, de part et d'autre du port.
function buildBeaches(world) {
  for (const b of [FORTUNE_PORT.beachN, FORTUNE_PORT.beachS]) {
    eachTile(world, b, (tx, ty, i) => {
      if (world.floor[i] !== 'water') world.floor[i] = 'sand';
    });
  }
}

// 2) Le bassin : de l'eau là où la côte rentre dans les terres.
function carveBay(world) {
  eachTile(world, FORTUNE_PORT.bay, (tx, ty, i) => {
    world.floor[i] = 'water';
  });
}

// 3) Le quai : dalles de béton sur toute la longueur du bassin.
function buildQuay(world) {
  eachTile(world, FORTUNE_PORT.quay, (tx, ty, i) => {
    world.floor[i] = 'quay';
  });
}

// 4) Les deux jetées : ponton de bois, et parapet de pierre du côté
//    du large (on ne tombe pas).
function buildMoles(world) {
  eachTile(world, FORTUNE_PORT.moleN, (tx, ty, i) => { world.floor[i] = 'dock'; });
  eachTile(world, FORTUNE_PORT.moleS, (tx, ty, i) => { world.floor[i] = 'dock'; });
  for (let tx = FORTUNE_PORT.moleN.x0; tx <= FORTUNE_PORT.moleN.x1; tx++) {
    world.setBlock(tx, FORTUNE_PORT.moleN.y0, 'stone');
  }
  for (let tx = FORTUNE_PORT.moleS.x0; tx <= FORTUNE_PORT.moleS.x1; tx++) {
    world.setBlock(tx, FORTUNE_PORT.moleS.y1, 'stone');
  }
}

// 5) La cour de stockage : terre battue derrière le quai.
function buildYard(world) {
  eachTile(world, FORTUNE_PORT.yard, (tx, ty, i) => { world.floor[i] = 'dirt'; });
}

// 6) La capitainerie : murs de briques, porte côté port, vitrages,
//    et de quoi tenir le bureau (coffre, four, torches).
function buildOffice(world) {
  const s = FORTUNE_PORT.office;
  eachTile(world, s, (tx, ty, i) => {
    const edge = tx === s.x0 || tx === s.x1 || ty === s.y0 || ty === s.y1;
    world.floor[i] = 'dirt';
    if (edge) world.blocks[i] = 'brick';
  });

  // Porte (au centre du mur ouest, face au bassin) et fenêtres.
  world.blocks[world.idx(s.x0, 61)] = 'door';
  const windows = [
    [s.x1, 59], [s.x1, 63],   // est
    [30, s.y0], [31, s.y0],   // nord
    [30, s.y1], [31, s.y1],   // sud
  ];
  for (const [tx, ty] of windows) world.blocks[world.idx(tx, ty)] = 'glass';

  // Intérieur : un coffre, un four, deux torches.
  world.blocks[world.idx(29, 59)] = 'chest';
  world.blocks[world.idx(32, 64)] = 'furnace';
  world.blocks[world.idx(29, 64)] = 'torch';
  world.blocks[world.idx(32, 59)] = 'torch';
}

// 7) Le mobilier : ferry, phare, grues, conteneurs, bollards, panneaux.
function placeFurniture(world) {
  // Le ferry amarré le long du quai, proue au nord.
  world.setBlock(FORTUNE_PORT.ferry.tx, FORTUNE_PORT.ferry.ty, 'ferry');
  // Le phare, à la pointe de la jetée nord.
  world.setBlock(FORTUNE_PORT.lighthouse.tx, FORTUNE_PORT.lighthouse.ty, 'lighthouse');

  // Deux grues de quai, face au bassin.
  world.setBlock(20, 56, 'crane');
  world.setBlock(20, 72, 'crane');

  // Conteneurs : deux piles dans la cour, deux sur le quai.
  for (const [tx, ty] of [
    [24, 52], [25, 52], [24, 53],
    [24, 74], [25, 74], [25, 75],
    [22, 58], [22, 70],
  ]) {
    world.setBlock(tx, ty, containerKindAt(tx, ty));
  }

  // Bollards d'amarrage, au bord de l'eau.
  for (const ty of [51, 53, 60, 68, 75, 77]) world.setBlock(20, ty, 'bollard');

  // Signalétique : les blocs sont posés ici, les textes sont semés
  // par js/game.js (seedPortSigns) au démarrage.
  for (const s of FORTUNE_SIGNS) world.setBlock(s.tx, s.ty, 'sign');
}
