// ============================================================
//  AVANIA — Test de fumée (logique pure, sans navigateur)
//  Vérifie : monde vide, ressources, casser/poser, inventaire.
// ============================================================

import { World } from '../js/world.js';
import { Player } from '../js/player.js';
import { Inventory } from '../js/inventory.js';
import { appearanceColors } from '../js/character.js';
import { TILE } from '../js/config.js';

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log('  ✔ ' + msg);
  else { console.error('  ✘ ' + msg); failures++; }
}

console.log('▶ Monde (bac à sable, vide)');
const w1 = new World(20260821);
const w2 = new World(20260821);

assert(w1.floor.length === 128 * 128, 'grille 128x128 remplie');
assert(w1.floor.join('') === w2.floor.join(''), 'même seed → même monde');
assert(w1.blocks.join('|') === w2.blocks.join('|'), 'ressources identiques (déterministe)');

// aucune construction : uniquement de l'herbe et de l'eau (bordure)
const floorSet = new Set(w1.floor);
assert([...floorSet].every((f) => f === 'grass' || f === 'water'), 'sol = herbe + eau uniquement (aucune construction)');

// le spawn est praticable
assert(!w1.isSolidAt(w1.spawn.x, w1.spawn.y), 'le spawn est sur une case libre');

// bordure d'eau solide
assert(w1.floor[w1.idx(0, 0)] === 'water', 'coin du monde = eau');
assert(w1.isSolidTile(0, 0), 'le bord du monde est solide');

// des ressources naturelles sont présentes
const hasTrees = w1.blocks.some((b) => b === 'tree');
const hasRocks = w1.blocks.some((b) => b === 'rock');
assert(hasTrees && hasRocks, 'arbres et rochers présents pour récolter');

console.log('▶ Casser / Poser des blocs');
// trouve un arbre
const treeIdx = w1.blocks.indexOf('tree');
const ttx = treeIdx % 128, tty = Math.floor(treeIdx / 128);
const drop = w1.breakBlock(ttx, tty);
assert(drop === 'wood', 'casser un arbre donne du bois');
assert(w1.blocks[treeIdx] === null, 'le bloc cassé devient vide');

// poser un bloc de bois sur une case d'herbe vide
const ok = w1.placeBlock(ttx, tty, 'wood');
assert(ok === true, 'poser du bois réussit');
assert(w1.blocks[treeIdx] === 'wood', 'le bois est bien posé');
assert(w1.isSolidTile(ttx, tty), 'le bois posé est un obstacle');

// on ne peut pas poser sur l'eau
assert(w1.placeBlock(0, 0, 'wood') === false, 'impossible de poser sur l\'eau');

console.log('▶ Inventaire');
const inv = new Inventory();
assert(inv.items.wood === 0 && inv.items.stone === 0, 'inventaire vide au départ');
inv.add('wood', 3);
assert(inv.items.wood === 3, 'ajout de 3 bois');
inv.remove('wood', 1);
assert(inv.items.wood === 2, 'retrait de 1 bois');
inv.cycle(1);
assert(inv.getSelected() === 'stone', 'molette → sélection suivante');

console.log('▶ Couleurs d\'apparence');
const cols = appearanceColors({ skin: 'ebene', hairColor: 'roux', eyes: 'violet', shirt: 'noir', pants: 'jean' });
assert(cols.skin === '#5e3b22', 'peau ébène');
assert(cols.hair === '#a3401f', 'cheveux roux');

console.log(failures === 0 ? '\n✅ Tous les tests passent' : `\n❌ ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
