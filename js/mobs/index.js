// ============================================================
//  AVANIA — Mobs (point d'entrée)
//  Le code d'un animal vit dans son sous-dossier :
//    js/mobs/sheep/sheep.js — définition, palettes, dessin
//    js/mobs/cow/cow.js     — définition, palettes, dessin
//  Le comportement et le rendu partagés sont dans core.js.
// ============================================================

export {
  MOB_DEFS, Mob, spawnMobs, updateMob, drawMob, mobDrops,
  DEFAULT_MOB_COUNTS, findMobSpawnSpot, makeMobFromNetwork,
} from './core.js';
