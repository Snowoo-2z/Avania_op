// ============================================================
//  AVANIA — Le port (côte EST de l'île)
//
//  Un ouvrage de monde, généré une fois pour toutes avec la carte
//  (déterministe : tous les joueurs voient exactement le même port).
//
//  Plan, vu du ciel (tx = est, ty = sud) :
//
//     y=47 ┌───────────── jetée nord (ponton + parapet) ─────────┐
//     y=50 │ ▓▓▓ quai ▓▓▓                                        │
//          │ ▓▓▓(béton)▓▓     D A R S E   (eau)          ⛴ ferry │
//     y=64 │ ▓▓▓▓▓▓▓▓▓▓▓                                        │
//     y=78 │ ▓▓▓ quai ▓▓▓                                        │
//     y=81 └───────────── jetée sud (ponton + parapet) ──────────┘
//          tx=108  tx=111                        tx=125    tx=127
//
//  À l'ouest : la cour de stockage (terre), le hangar en briques et
//  la route qui redescend vers le centre de l'île.
// ============================================================

import { CONTAINER_KINDS } from './blocks.js';

// --- Emprise du port (tuiles, bornes incluses) -------------------
export const PORT = {
  // La darse : le bassin creusé dans la côte, ouvert sur la mer à l'est.
  bay: { x0: 111, y0: 50, x1: 127, y1: 78 },
  // Le quai principal, en béton (3 tuiles de large, praticable).
  quay: { x0: 108, y0: 47, x1: 110, y1: 81 },
  // Les deux jetées qui protègent le bassin (ponton + parapet de pierre).
  moleN: { x0: 111, y0: 47, x1: 125, y1: 49 },
  moleS: { x0: 111, y0: 79, x1: 125, y1: 81 },
  // La cour de stockage, à terre.
  yard: { x0: 104, y0: 50, x1: 107, y1: 78 },
  // Le hangar (murs de briques, vitrages, porte au sud).
  store: { x0: 95, y0: 53, x1: 103, y1: 62 },
  // La route de terre qui relie le port au centre de l'île.
  road: { x0: 72, y0: 64, x1: 107, y1: 65 },
  // Le ferry amarré (tuile d'ancrage : son sprite couvre 3 × 3 tuiles).
  ferry: { tx: 113, ty: 64 },
  // Le phare, à la pointe de la jetée nord.
  lighthouse: { tx: 125, ty: 48 },
};

// Zones nettoyées avant construction (aucun arbre, rocher ni minerai ne
// doit pousser au milieu d'un mur ou dans le bassin).
const CLEAR_PORT = { x0: 93, y0: 43, x1: 127, y1: 85 };
const CLEAR_ROAD = { x0: 70, y0: 62, x1: 107, y1: 67 };

// Panneaux plantés à l'arrivée du port (le texte est semé par js/game.js).
export const PORT_SIGNS = [
  { tx: 101, ty: 66, text: "PORT D'AVANIA" },
  { tx: 109, ty: 66, text: 'QUAI EST' },
  { tx: 100, ty: 63, text: 'HANGAR' },
];

// Parcourt un rectangle inclusif en ignorant ce qui sort de la carte.
function eachTile(world, r, fn) {
  for (let ty = r.y0; ty <= r.y1; ty++) {
    for (let tx = r.x0; tx <= r.x1; tx++) {
      if (!world.inBounds(tx, ty)) continue;
      fn(tx, ty, world.idx(tx, ty));
    }
  }
}

// Teinte d'un conteneur, tirée d'un hash de tuile : stable d'une partie
// à l'autre (donc identique pour tout le monde en multijoueur) sans rien
// avoir à stocker dans la carte.
function containerKindAt(tx, ty) {
  const h = (Math.imul(tx + 7, 374761393) ^ Math.imul(ty + 11, 668265263)) >>> 0;
  return CONTAINER_KINDS[h % CONTAINER_KINDS.length];
}

// ------------------------------------------------------------
//  Construction
// ------------------------------------------------------------
export function buildHarbor(world) {
  clearZone(world);
  carveBay(world);
  buildQuay(world);
  buildMoles(world);
  buildYardAndRoad(world);
  buildWarehouse(world);
  placeFurniture(world);
  return PORT;
}

// 1) On rase les ressources naturelles : le port remplace la forêt.
function clearZone(world) {
  for (const r of [CLEAR_PORT, CLEAR_ROAD]) {
    eachTile(world, r, (tx, ty, i) => {
      world.blocks[i] = null;
      world.blocks2[i] = null;
    });
  }
}

// 2) Le bassin : de l'eau là où la côte est rentrait dans les terres.
function carveBay(world) {
  eachTile(world, PORT.bay, (tx, ty, i) => {
    world.floor[i] = 'water';
  });
}

// 3) Le quai : dalles de béton sur toute la longueur du bassin.
function buildQuay(world) {
  eachTile(world, PORT.quay, (tx, ty, i) => {
    world.floor[i] = 'quay';
  });
}

// 4) Les deux jetées : ponton de bois + parapet de pierre côté large.
//    Elles ferment le bassin au nord et au sud et l'ouvrent à l'est.
function buildMoles(world) {
  eachTile(world, PORT.moleN, (tx, ty, i) => { world.floor[i] = 'dock'; });
  eachTile(world, PORT.moleS, (tx, ty, i) => { world.floor[i] = 'dock'; });
  // Parapets : une rangée de pierres du côté du large (on ne tombe pas).
  for (let tx = PORT.moleN.x0; tx <= PORT.moleN.x1; tx++) world.setBlock(tx, PORT.moleN.y0, 'stone');
  for (let tx = PORT.moleS.x0; tx <= PORT.moleS.x1; tx++) world.setBlock(tx, PORT.moleS.y1, 'stone');
}

// 5) La cour de stockage et la route qui redescend vers le spawn.
function buildYardAndRoad(world) {
  eachTile(world, PORT.yard, (tx, ty, i) => { world.floor[i] = 'dirt'; });
  eachTile(world, PORT.road, (tx, ty, i) => { world.floor[i] = 'dirt'; });
  // petit embranchement de la route vers la porte du hangar
  const i = world.idx(99, 63);
  world.floor[i] = 'dirt';
}

// 6) Le hangar : murs de briques, vitrages, porte au sud, et de quoi
//    démarrer un chantier à l'intérieur (coffres, four, torches).
function buildWarehouse(world) {
  const s = PORT.store;
  eachTile(world, s, (tx, ty, i) => {
    const edge = tx === s.x0 || tx === s.x1 || ty === s.y0 || ty === s.y1;
    world.floor[i] = 'dirt';
    if (edge) world.blocks[i] = 'brick';
  });

  // Porte (au centre du mur sud) et fenêtres sur les quatre faces.
  world.blocks[world.idx(99, s.y1)] = 'door';
  const windows = [
    [97, s.y1], [101, s.y1],   // sud
    [97, s.y0], [101, s.y0],   // nord
    [s.x0, 56], [s.x0, 59],    // ouest
    [s.x1, 56], [s.x1, 59],    // est
  ];
  for (const [tx, ty] of windows) world.blocks[world.idx(tx, ty)] = 'glass';

  // Intérieur : deux coffres de stockage, un four, deux torches.
  world.blocks[world.idx(96, 55)] = 'chest';
  world.blocks[world.idx(102, 55)] = 'chest';
  world.blocks[world.idx(102, 60)] = 'furnace';
  world.blocks[world.idx(96, 58)] = 'torch';
  world.blocks[world.idx(99, 54)] = 'torch';
}

// 7) Le mobilier : ferry, phare, grues, conteneurs et bollards.
function placeFurniture(world) {
  // Le ferry amarré le long du quai, proue au nord.
  world.setBlock(PORT.ferry.tx, PORT.ferry.ty, 'ferry');
  // Le phare, à la pointe de la jetée nord.
  world.setBlock(PORT.lighthouse.tx, PORT.lighthouse.ty, 'lighthouse');

  // Deux grues de quai, face au bassin.
  world.setBlock(110, 56, 'crane');
  world.setBlock(110, 72, 'crane');

  // Conteneurs : deux piles dans la cour, deux sur le quai.
  for (const [tx, ty] of [
    [105, 52], [106, 52], [105, 53],
    [105, 74], [106, 74], [106, 75],
    [108, 58], [108, 70],
  ]) {
    world.setBlock(tx, ty, containerKindAt(tx, ty));
  }

  // Bollards d'amarrage, au bord de l'eau.
  for (const ty of [51, 53, 60, 68, 75, 77]) world.setBlock(110, ty, 'bollard');

  // Signalétique : les blocs sont posés ici, les textes sont semés
  // par js/game.js (seedPortSigns) au démarrage.
  for (const s of PORT_SIGNS) world.setBlock(s.tx, s.ty, 'sign');
}
