// ============================================================
//  AVANIA — Test de fumée (logique pure, sans navigateur)
//  Vérifie la génération du monde et les collisions.
// ============================================================

import { World } from '../js/world.js';
import { Player } from '../js/player.js';
import { appearanceColors } from '../js/character.js';
import { TILE } from '../js/config.js';

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log('  ✔ ' + msg);
  else { console.error('  ✘ ' + msg); failures++; }
}

console.log('▶ Génération du monde (seed déterministe)');
const w1 = new World(20260821);
const w2 = new World(20260821);

assert(w1.grid.length === 128 * 128, 'grille 128x128 remplie');
assert(w1.grid.join('') === w2.grid.join(''), 'même seed → même carte');

// point de spawn doit être praticable (non solide)
assert(!w1.isSolidAt(w1.spawn.x, w1.spawn.y), 'le spawn est sur une case libre');

// présence de bâtiments
assert(w1.buildings.length >= 10, 'au moins 10 bâtiments placés');
const names = w1.buildings.map((b) => b.name);
for (const n of ['Mairie', 'Banque', 'Police', 'Marché']) {
  assert(names.includes(n), `bâtiment présent : ${n}`);
}

// les portes sont des tuiles "door"
const police = w1.buildings.find((b) => b.name === 'Police');
const d = w1.doorTile(police);
assert(w1.tile(d.tx, d.ty) === 'door', 'la porte de la police est une tuile porte');

// un mur est solide
assert(w1.isSolidTile(police.x, police.y), 'le coin du bâtiment est solide');

// l'eau est solide, la route ne l'est pas
assert(w1.isSolidTile(20, 102), 'la rivière est solide');
assert(!w1.isSolidTile(61, 50), 'la route est praticable');
// le pont traverse la rivière (non solide)
assert(!w1.isSolidTile(63, 102), 'le pont traverse la rivière (praticable)');

console.log('▶ Collisions du joueur');
const p = new Player(w1.spawn.x, w1.spawn.y, {});
// se déplacer vers un mur doit être bloqué (même rangée que le bâtiment)
const wallX = police.x * TILE; // bord ouest du bâtiment
const p2 = new Player(wallX - TILE, (police.y + 2) * TILE + TILE / 2, {});
p2.update({ x: 1, y: 0 }, 0.5, w1);
assert(p2.x === wallX - TILE, 'le joueur est bloqué par un mur');

console.log('▶ Résolution des couleurs d\'apparence');
const cols = appearanceColors({ skin: 'ebene', hairColor: 'roux', eyes: 'violet', shirt: 'noir', pants: 'jean' });
assert(cols.skin === '#5e3b22', 'peau ébène');
assert(cols.hair === '#a3401f', 'cheveux roux');
assert(cols.eyes === '#7a5aa0', 'yeux violets');

console.log(failures === 0 ? '\n✅ Tous les tests passent' : `\n❌ ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
