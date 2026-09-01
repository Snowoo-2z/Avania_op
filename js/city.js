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
import { TILE } from './config.js';
import { Car } from './cars.js';

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
  yard: { x0: 23, y0: 50, x1: 25, y1: 78 },
  // La capitainerie : le bureau du port.
  office: { x0: 29, y0: 57, x1: 34, y1: 66 },
  // La tour de contrôle : 3 × 3 de façade vitrée, porte au sud.
  tower: { x0: 30, y0: 50, x1: 32, y1: 52 },

  // --- Voirie -----------------------------------------------------
  // Deux avenues se croisent devant la capitainerie : l'avenue du port
  // (nord-sud, le long du bassin) et l'avenue de la ville (est-ouest,
  // vers les quartiers à venir). Les prochaines rues s'y brancheront.
  roads: {
    port: { x0: 26, y0: 44, x1: 27, y1: 84 },   // avenue du port
    city: { x0: 26, y0: 68, x1: 56, y1: 69 },   // avenue de la ville
    cross: { x0: 30, y0: 68, x1: 31, y1: 69 },  // passage piéton
  },
  // Trottoirs : entre l'avenue et les bâtiments, et de chaque côté de
  // l'avenue de la ville.
  walks: [
    { x0: 28, y0: 44, x1: 28, y1: 67 },
    { x0: 35, y0: 50, x1: 35, y1: 75 },
    { x0: 28, y0: 67, x1: 56, y1: 67 },
    { x0: 28, y0: 70, x1: 56, y1: 70 },
  ],
  // Le parking de la capitainerie, juste au sud de l'avenue.
  parking: { x0: 29, y0: 71, x1: 34, y1: 73 },
  // Voitures stationnées. L'angle est en radians : 0 = cap à l'est,
  // -π/2 = cap au nord (garées en épi, face au trottoir).
  cars: [
    { tx: 30, ty: 72, angle: -Math.PI / 2, model: 'sedan' },
    { tx: 32, ty: 72, angle: -Math.PI / 2, model: 'van' },
    { tx: 34, ty: 72, angle: -Math.PI / 2, model: 'sport' },
    { tx: 21, ty: 60, angle: -Math.PI / 2, model: 'sedan' },
    { tx: 21, ty: 70, angle: Math.PI / 2, model: 'van' },
  ],
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
  buildTower(world);
  buildRoads(world);
  placeFurniture(world);
  return FORTUNE_PORT;
}

// Une porte se place TOUJOURS sur le mur sud : dans cette vue de dessus,
// c'est la seule face qu'on voit vraiment (l'est et l'ouest ne montrent
// qu'un biseau de 6 px). Une porte percée sur le côté passait inaperçue.
function placeDoor(world, r) {
  const tx = Math.floor((r.x0 + r.x1) / 2);
  world.blocks[world.idx(tx, r.y1)] = 'door';
  return tx;
}

// 9) La voirie : deux avenues, leurs trottoirs, un passage piéton et le
//    parking. La ligne discontinue est tracée sur le bord de la tuile,
//    donc deux tuiles accolées la font tomber au milieu de la chaussée ;
//    le carrefour, lui, reste nu (pas de ligne au milieu d'un croisement).
function buildRoads(world) {
  const r = FORTUNE_PORT.roads;
  eachTile(world, r.port, (tx, ty, i) => {
    if (ty >= r.city.y0 && ty <= r.city.y1) return;   // carrefour
    world.floor[i] = tx === r.port.x1 ? 'roadV' : 'road';
  });
  eachTile(world, r.city, (tx, ty, i) => {
    if (tx >= r.port.x0 && tx <= r.port.x1) return;   // carrefour
    world.floor[i] = ty === r.city.y1 ? 'roadH' : 'road';
  });
  eachTile(world, {
    x0: r.port.x0, y0: r.city.y0, x1: r.port.x1, y1: r.city.y1,
  }, (tx, ty, i) => { world.floor[i] = 'road'; });
  eachTile(world, r.cross, (tx, ty, i) => { world.floor[i] = 'roadCross'; });
  for (const w of FORTUNE_PORT.walks) {
    eachTile(world, w, (tx, ty, i) => { world.floor[i] = 'pavement'; });
  }
  eachTile(world, FORTUNE_PORT.parking, (tx, ty, i) => { world.floor[i] = 'road'; });
}

// Les voitures de la ville (js/cars.js) : stationnées là où le plan les
// prévoit, au premier passage. Le joueur les déplace ensuite, et elles
// restent où il les gare jusqu'à la fin de la partie.
export function spawnCityCars(world) {
  if (world.id !== 'fortune') return [];
  return FORTUNE_PORT.cars.map((spec) => new Car({
    x: spec.tx * TILE + TILE / 2,
    y: spec.ty * TILE + TILE / 2,
    angle: spec.angle || 0,
    model: spec.model || 'sedan',
  }));
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

// 6) La capitainerie : murs modernes (les fenêtres sont DANS la façade,
//    voir js/tileset.js), porte côté port, et de quoi tenir le bureau
//    (coffre, four, torches).
function buildOffice(world) {
  const s = FORTUNE_PORT.office;
  eachTile(world, s, (tx, ty, i) => {
    const edge = tx === s.x0 || tx === s.x1 || ty === s.y0 || ty === s.y1;
    world.floor[i] = 'dirt';
    if (edge) world.blocks[i] = 'wallModern';
  });

  // Porte, au centre du mur SUD : c'est la face qu'on voit.
  placeDoor(world, s);

  // Intérieur : un coffre, un four, deux torches.
  world.blocks[world.idx(30, 59)] = 'chest';
  world.blocks[world.idx(33, 64)] = 'furnace';
  world.blocks[world.idx(30, 64)] = 'torch';
  world.blocks[world.idx(33, 59)] = 'torch';
}

// 7) La tour de contrôle : un bloc de façade vitrée, plus haut que la
//    capitainerie (26 px de `rise` contre 14), avec l'escalier derrière
//    la porte et une lampe à l'intérieur.
function buildTower(world) {
  const t = FORTUNE_PORT.tower;
  eachTile(world, t, (tx, ty, i) => {
    const edge = tx === t.x0 || tx === t.x1 || ty === t.y0 || ty === t.y1;
    world.floor[i] = 'dirt';
    if (edge) world.blocks[i] = 'wallGlass';
  });
  placeDoor(world, t);
  world.blocks[world.idx(31, 51)] = 'torch';
}

// 8) Le mobilier : ferry, phare, grues, conteneurs, bollards, panneaux.
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
