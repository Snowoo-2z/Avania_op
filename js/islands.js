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
