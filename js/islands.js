// ============================================================
//  AVANIA — Les îles
//
//  Avania ('surface') est l'île de départ. Les autres îles se
//  rejoignent par la traversée (voir js/ferryman.js) : chacune est
//  un monde à part entière, généré à la demande puis gardé en
//  mémoire pour toute la partie — ce qu'on y construit, ce qu'on y
//  laisse au sol et dans les coffres survit aux allers-retours.
//
//  Ce module est pur (aucun DOM) : il est partagé par le moteur et
//  par les tests.
// ============================================================

// L'île de départ : celle que génère js/world.js au lancement.
export const HOME_ISLAND = 'surface';

export const ISLANDS = {
  // Fortune City : la ville à venir. Pour l'instant c'est une île
  // VIERGE — même génération de terrain qu'Avania, mais ni ouvrage
  // (pas de port, pas de grotte) ni ressource naturelle : le terrain
  // nu sur lequel la ville sera bâtie.
  fortune: {
    id: 'fortune',
    seed: 20260822,
    name: 'Fortune City',
    bare: true,
    // Elle a une VILLE, générée quartier par quartier (js/city.js).
    // Pour l'instant : le quartier du port et les plages.
    city: true,
  },
};

// Fiche d'une île (l'île de départ n'a pas de fiche : elle existe
// toujours et n'est pas générée à la demande).
export function islandDef(id) {
  return ISLANDS[id] || null;
}

// Toutes les îles connues, île de départ comprise.
export function islandList() {
  return [HOME_ISLAND, ...Object.keys(ISLANDS)];
}

// ------------------------------------------------------------
//  Le mouillage d'une île vierge
//
//  De l'eau dans la côte, du sable autour, et le ferry qui attend.
//  Ce n'est PAS un port : pas de quai, pas de jetée, pas de grue —
//  juste l'endroit où le bateau tient, sur une île qui attend sa ville.
// ------------------------------------------------------------
export function buildAnchorage(world, spec) {
  const { x0, y0, x1, y1, ferry } = spec;

  // La crique (la bordure de carte, à l'ouest, reste de l'eau).
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = Math.max(2, x0); tx <= x1; tx++) {
      if (world.inBounds(tx, ty)) world.floor[world.idx(tx, ty)] = 'water';
    }
  }

  // Le sable : tout le tour de la crique, côté terre.
  const ring = [];
  for (let ty = y0 - 1; ty <= y1 + 1; ty++) ring.push([x1 + 1, ty]);
  for (let tx = Math.max(2, x0 - 1); tx <= x1 + 1; tx++) {
    ring.push([tx, y0 - 1], [tx, y1 + 1]);
  }
  for (const [tx, ty] of ring) {
    if (!world.inBounds(tx, ty)) continue;
    const i = world.idx(tx, ty);
    if (world.floor[i] !== 'water') world.floor[i] = 'sand';
  }

  // Et le ferry, à l'ancre.
  if (ferry) world.setBlock(ferry.tx, ferry.ty, 'ferry');
}
