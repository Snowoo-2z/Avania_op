// ============================================================
//  AVANIA — Test de fumée (logique pure, sans navigateur)
//  Vérifie : monde vide, ressources, casser/poser, inventaire.
// ============================================================

import { World } from '../js/world.js';
import { Player } from '../js/player.js';
import { Inventory } from '../js/inventory.js';
import { appearanceColors } from '../js/character.js';
import { TILE, BLOCK_EXTRUDE } from '../js/config.js';
import { BLOCK_DEFS, ITEM_DEFS, CONTAINER_KINDS } from '../js/blocks.js';
import { treeVariantAt, treeDropCount, treeBreakTime, TREE_VARIANTS, resolveBlockFaces } from '../js/tileset.js';
import {
  FERRY_PRICE, FERRYMAN, createFerryState, crossingOffer, parseFerryReply,
  ferrymanWaitsHere, ferrySpot,
} from '../js/ferryman.js';
import { ISLANDS } from '../js/islands.js';
import { FORTUNE_PORT, spawnCityCars } from '../js/city.js';
import { Car, CAR_MODELS } from '../js/cars.js';
import { Crossing, CROSSING_DURATION } from '../js/crossing.js';

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

// aucune construction : uniquement des sols naturels (herbe, terre, fleurs, sable, eau)
// + la falaise qui abrite l'entrée de la grotte (relief naturel, pas une
// construction de joueur).
const floorSet = new Set(w1.floor);
const natural = ['grass', 'grassDark', 'flowers', 'dirt', 'sand', 'water', 'rockFace'];
// Les ouvrages du port (côte est) : quai bétonné et pontons de bois.
// Comme la falaise, ils font partie du monde — pas d'une construction de
// joueur (voir js/harbor.js).
const portFloors = ['quay', 'dock'];
assert([...floorSet].every((f) => natural.includes(f) || portFloors.includes(f)),
  'sol = variantes naturelles + falaise + port (aucune construction)');

// le spawn est praticable
assert(!w1.isSolidAt(w1.spawn.x, w1.spawn.y), 'le spawn est sur une case libre');

// bordure d'eau solide
assert(w1.floor[w1.idx(0, 0)] === 'water', 'coin du monde = eau');
assert(w1.isSolidTile(0, 0), 'le bord du monde est solide');

// des ressources naturelles sont présentes
const hasTrees = w1.blocks.some((b) => b === 'tree');
const hasRocks = w1.blocks.some((b) => b === 'rock');
assert(hasTrees && hasRocks, 'arbres et rochers présents pour récolter');

console.log('▶ Le port (côte est)');
assert(w1.floor[w1.idx(113, 70)] === 'water', 'la darse est creusée dans la côte');
assert(w1.floor[w1.idx(109, 64)] === 'quay', 'le quai est bétonné');
assert(!w1.isSolidTile(109, 64), 'on marche sur le quai');
assert(w1.floor[w1.idx(116, 48)] === 'dock', 'la jetée nord est un ponton');
assert(!w1.isSolidTile(116, 48), 'on marche sur la jetée');
assert(w1.isSolidTile(116, 47), 'le parapet de pierre arrête la chute');
assert(w1.blockAt(113, 64) === 'ferry', 'le ferry est amarré au quai');
assert(w1.isSolidTile(113, 64), 'on ne traverse pas le ferry');
assert(w1.blockAt(125, 48) === 'lighthouse', 'le phare veille à la pointe');
assert(w1.blockAt(110, 56) === 'crane', 'une grue est en place sur le quai');
assert(w1.blockAt(110, 51) === 'bollard', 'les bollards bordent le quai');
assert(!w1.isSolidTile(110, 51), 'on marche sur un bollard');
assert(w1.floor[w1.idx(105, 60)] === 'dirt', 'la cour de stockage est en terre');
assert(CONTAINER_KINDS.includes(w1.blockAt(105, 52)), 'les conteneurs sont empilés dans la cour');

console.log('▶ Le passeur (Gab)');
// Tarif : fixe, aller simple. Rien à négocier.
assert(FERRY_PRICE === 20, 'la traversée coûte 20 écus');
const gab = createFerryState({ from: 'surface' });
assert(gab.destination === 'fortune', 'depuis Avania, Gab mène à Fortune City');
const gabOffer = crossingOffer('fortune');
assert(gabOffer.price === 20 && gabOffer.payLabel === 'Payer',
  'le tarif est affiché, sans négociation');
assert(/aller simple/i.test(gabOffer.desc), 'et précisé aller simple');

// Le modèle n'a pas la main sur la caisse : un prix annoncé est ramené
// au tarif (c'est le jeu qui encaisse).
const cheated = parseFerryReply('Allez, 5 écus et on part.\n/cross 5', gab);
assert(cheated.offer && cheated.offer.price === 20,
  'un prix inventé par le modèle est ramené à 20 écus');
assert(cheated.speech === 'Allez, 5 écus et on part.', 'seul le texte du modèle est gardé');
const out = parseFerryReply('Passe ton chemin.\n/out', gab);
assert(out.kicked === true && !out.offer, '/out met fin à la conversation');

// Pas d'aller-retour : de l'autre rive, la traversée repart.
const gabBack = createFerryState({ from: 'fortune' });
assert(gabBack.destination === 'surface', 'depuis Fortune City, il ramène à Avania');
assert(ferrymanWaitsHere('surface') && ferrymanWaitsHere('fortune'),
  'Gab tient les deux rives');
assert(!ferrymanWaitsHere('cave:1'), 'il ne descend pas dans la grotte');
const spot = ferrySpot('surface');
assert(w1.floor[w1.idx(spot.stand.tx, spot.stand.ty)] === 'quay',
  'sur Avania il attend sur le quai');

// L'île d'arrivée : vierge, en attendant la ville.
const fortuneDef = ISLANDS.fortune;
const wFortune = new World(fortuneDef.seed, { id: 'fortune', bare: true });
assert(wFortune.id === 'fortune', 'l’île porte son identifiant de zone');
assert(!wFortune.blocks.some((b) => b === 'tree' || b === 'rock' || b === 'ironOre'),
  'aucune ressource naturelle : terrain nu');
// Et elle a son port : bassin, quai, jetées, grues, phare.
assert(wFortune.floor[wFortune.idx(21, 64)] === 'quay', 'Fortune City a son quai');
assert(!wFortune.isSolidTile(21, 64), 'on y marche');
assert(wFortune.floor[wFortune.idx(10, 64)] === 'water', 'devant, le bassin');
assert(wFortune.floor[wFortune.idx(10, 48)] === 'dock', 'la jetée nord est un ponton');
assert(wFortune.isSolidTile(10, 47), 'avec son parapet de pierre');
assert(wFortune.floor[wFortune.idx(19, 48)] === 'dock', 'la jetée rejoint le quai');
assert(wFortune.blockAt(18, 64) === 'ferry', 'le ferry y est amarré, à flot');
assert(wFortune.floor[wFortune.idx(18, 64)] === 'water', 'dans le bassin, pas sur le quai');
assert(wFortune.blockAt(3, 48) === 'lighthouse', 'un phare marque l’entrée du port');
assert(wFortune.blockAt(30, 57) === 'wallModern', 'la capitainerie est debout, en façade moderne');
assert(wFortune.blockAt(30, 50) === 'wallGlass', 'et la tour de contrôle en façade vitrée');
assert(wFortune.blockAt(31, 52) === 'door', 'avec sa porte au sud');
assert(wFortune.blockAt(31, 66) === 'door', 'la capitainerie ouvre aussi au sud');
const fortuneSpot = ferrySpot('fortune');
assert(wFortune.floor[wFortune.idx(fortuneSpot.stand.tx, fortuneSpot.stand.ty)] === 'quay',
  'Gab attend sur le quai');
assert(!wFortune.isSolidTile(fortuneSpot.landing.tx, fortuneSpot.landing.ty),
  'et on débarque sur une case libre');
// Les plages bordent la côte, de part et d'autre du port.
assert(wFortune.floor[wFortune.idx(3, 30)] === 'sand', 'plage au nord du port');
assert(wFortune.floor[wFortune.idx(3, 100)] === 'sand', 'plage au sud du port');
// Le reste de l'île attend les autres quartiers.
assert(!wFortune.blocks.some((b) => b === 'tree' || b === 'rock'), 'toujours aucun arbre ni rocher');

// Une île sans port garde la possibilité d'un simple mouillage.
const wCove = new World(4242, {
  id: 'cove',
  bare: true,
  anchorage: { x0: 2, y0: 60, x1: 5, y1: 68, ferry: { tx: 3, ty: 64 } },
});
assert(wCove.floor[wCove.idx(3, 64)] === 'water', 'une crique peut être creusée');
assert(wCove.blockAt(3, 64) === 'ferry', 'le ferry y est à l’ancre');
assert(wCove.floor[wCove.idx(6, 64)] === 'sand', 'avec du sable autour');
assert(wFortune.caveEntrance === null, 'aucune entrée de grotte');
assert(!wFortune.isSolidTile(64, 64), 'on y marche (herbe)');
assert(wFortune.floor[wFortune.idx(0, 0)] === 'water', 'et elle a bien son rivage');
// L'île de départ, elle, garde son port.
assert(w1.floor[w1.idx(109, 64)] === 'quay', 'Avania garde son quai');

console.log('▶ La traversée (cinématique)');
const trip = new Crossing({ duration: 1 });
let arrived = 0;
trip.start('Avania', 'Fortune City', () => { arrived += 1; });
assert(trip.running === true, 'elle démarre');
assert(trip.progress() === 0, 'à zéro au départ');
assert(trip.update(0.4) === true, 'elle occupe l’écran pendant la traversée');
assert(arrived === 0, 'on ne débarque pas avant la fin');
assert(trip.progress() > 0.3 && trip.progress() < 0.5,
  `la progression avance (${trip.progress().toFixed(2)})`);
assert(trip.update(0.7) === false, 'elle se termine d’elle-même');
assert(arrived === 1, 'le débarquement n’a lieu qu’une fois');
assert(trip.update(1) === false, 'et plus rien ensuite');

// Le joueur n'est pas prisonnier de la cinématique.
const quick = new Crossing({ duration: 5 });
let quickArrived = 0;
quick.start('Avania', 'Fortune City', () => { quickArrived += 1; });
assert(quick.skip() === true, 'on peut abréger la traversée');
assert(quick.update(0.016) === false, 'l’arrivée est alors immédiate');
assert(quickArrived === 1, 'et on débarque quand même');
assert(CROSSING_DURATION >= 2 && CROSSING_DURATION <= 6,
  `une durée raisonnable (${CROSSING_DURATION} s)`);

console.log('▶ Les routes et les voitures');
const fort = (tx, ty) => wFortune.floor[wFortune.idx(tx, ty)];
assert(fort(26, 60) === 'road' && fort(27, 60) === 'roadV',
  "l\'avenue du port est bitumée, avec sa ligne au milieu");
assert(fort(40, 68) === 'road' && fort(40, 69) === 'roadH',
  "l\'avenue de la ville file vers l\'est");
assert(fort(26, 68) === 'road' && fort(27, 69) === 'road',
  'le carrefour reste nu : pas de ligne au milieu');
assert(fort(30, 68) === 'roadCross', 'un passage piéton traverse l\'avenue');
assert(fort(28, 60) === 'pavement', 'un trottoir borde l\'avenue');
assert(fort(30, 72) === 'road', 'le parking de la capitainerie est bitumé');
assert(fort(21, 60) === 'quay', 'le quai, lui, n\'a pas été bitumé');

const cityCars = spawnCityCars(wFortune);
assert(cityCars.length === FORTUNE_PORT.cars.length, 'les voitures sont stationnées');
assert(cityCars.every((c) => CAR_MODELS[c.model.id]), 'avec un modèle connu');
assert(cityCars.every((c) => !wFortune.isSolidTile(
  Math.floor(c.x / 32), Math.floor(c.y / 32))), 'et jamais garées dans un mur');
assert(spawnCityCars(wCove).length === 0, 'une île sans ville n\'a pas de voiture');

// Le comportement, sur une route dégagée.
const roadCar = new Car({ x: 27 * 32 + 16, y: 30 * 32 + 16, angle: 0, model: 'sedan' });
const roadStart = roadCar.x;
for (let i = 0; i < 30; i++) roadCar.update(1 / 60, wFortune, { throttle: 1 });
assert(roadCar.speed > 40, 'on accélère');
assert(roadCar.x > roadStart, 'et la voiture avance');
for (let i = 0; i < 30; i++) roadCar.update(1 / 60, wFortune, { brake: 1 });
assert(roadCar.speed < 40, 'on freine');
// À l'arrêt, braquer ne fait rien : pas de pivot sur place.
const still = new Car({ x: 27 * 32 + 16, y: 30 * 32 + 16, angle: 0, model: 'van' });
for (let i = 0; i < 24; i++) still.update(1 / 60, wFortune, { steer: 1 });
assert(still.angle === 0, 'arrêtée, la voiture ne pivote pas sur place');
for (let i = 0; i < 24; i++) still.update(1 / 60, wFortune, { throttle: 1 });
for (let i = 0; i < 24; i++) still.update(1 / 60, wFortune, { throttle: 1, steer: 1 });
assert(still.angle !== 0, 'en roulant, elle braque');
// Le volant est progressif : on ne braque pas d'un coup, et il revient
// au centre tout seul quand on le lâche.
const volant = new Car({ x: 40 * 32, y: 30 * 32, angle: 0 });
volant.speed = 120; volant.vx = 120;
volant.update(1 / 60, wFortune, { steer: 1 });
assert(volant.wheel > 0 && volant.wheel < 0.1, 'le volant tourne progressivement');
for (let i = 0; i < 30; i++) volant.update(1 / 60, wFortune, { steer: 1, throttle: 1 });
const braque = volant.wheel;
assert(braque > 0.1, 'et finit par braquer franchement');
for (let i = 0; i < 90; i++) volant.update(1 / 60, wFortune, {});
assert(Math.abs(volant.wheel) < Math.abs(braque) * 0.2, 'puis revient au centre tout seul');

// À pleine allure, la direction se durcit : pas de tête-à-queue.
const spin = new Car({ x: 40 * 32, y: 30 * 32, angle: 0, model: 'sport' });
for (let i = 0; i < 240; i++) spin.update(1 / 60, wFortune, { throttle: 1 });
assert(spin.speed > 250, `la sportive atteint son allure (${Math.round(spin.speed)} px/s)`);
const avant = spin.angle;
for (let i = 0; i < 60; i++) spin.update(1 / 60, wFortune, { throttle: 1, steer: 1 });
const tourne = Math.abs(spin.angle - avant);
assert(tourne > 0.25, `elle tourne quand même (${tourne.toFixed(2)} rad en 1 s)`);
assert(tourne < 1.8, `sans partir en tête-à-queue (${tourne.toFixed(2)} rad en 1 s)`);

// La sensibilité des paramètres : douce, elle tire droit ; vive, elle mord.
const tourneAvec = (sens) => {
  const c = new Car({ x: 40 * 32, y: 30 * 32, angle: 0 });
  for (let i = 0; i < 60; i++) c.update(1 / 60, wFortune, { throttle: 1 });
  const a = c.angle;
  for (let i = 0; i < 60; i++) c.update(1 / 60, wFortune, { throttle: 1, steer: 1, sensitivity: sens });
  return Math.abs(c.angle - a);
};
const doux = tourneAvec(0.4);
const vif = tourneAvec(1.8);
assert(doux < vif * 0.6,
  `une direction douce tourne bien moins qu'une vive (${doux.toFixed(2)} vs ${vif.toFixed(2)} rad)`);

// Un mur l'arrête : la capitainerie est juste à l'est de l'avenue.
const wallCar = new Car({ x: 29 * 32 + 16, y: 60 * 32 + 16, angle: 0, model: 'sport' });
const startX = wallCar.x;
for (let i = 0; i < 40; i++) wallCar.update(1 / 60, wFortune, { throttle: 1 });
assert(wallCar.x < 30 * 32 + 16, 'elle ne traverse pas la capitainerie');
assert(wallCar.x >= startX, 'et elle ne recule pas à travers le mur');
// L'eau non plus : le bassin est juste à l'ouest.
const seaCar = new Car({ x: 21 * 32 + 16, y: 64 * 32 + 16, angle: Math.PI, model: 'sedan' });
for (let i = 0; i < 60; i++) seaCar.update(1 / 60, wFortune, { throttle: 1 });
assert(wFortune.floor[wFortune.idx(Math.floor(seaCar.x / 32), Math.floor(seaCar.y / 32))] !== 'water',
  'elle ne va pas flotter sur le bassin');

console.log('▶ Casser / Poser des blocs');
// trouve un arbre
const treeIdx = w1.blocks.indexOf('tree');
const ttx = treeIdx % 128, tty = Math.floor(treeIdx / 128);
const drop = w1.breakBlock(ttx, tty);
assert(drop === 'wood', 'casser un arbre donne du bois');
assert(BLOCK_DEFS.tree.dropN === 3, 'un arbre lâche 3 bois');
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
assert(inv.order.length === 7, '7 types de blocs dans la barre rapide');

console.log('▶ Fabrication');
const { RECIPES } = await import('../js/blocks.js');
const plank = RECIPES.find((r) => r.id === 'plank');
const glass = RECIPES.find((r) => r.id === 'glass');
assert(inv.canCraft(plank), '2 bois suffisent pour fabriquer des planches');
assert(inv.craft(plank) === true, 'fabrication de planches réussit');
assert(inv.count('plank') === 2, '1 bois → 2 planches');
assert(inv.count('wood') === 1, 'le bois a été consommé');
inv.add('sand', 3);
assert(inv.canCraft(glass) && inv.craft(glass), '2 sable → 1 verre');
assert(inv.count('glass') === 1, 'verre fabriqué');

console.log('▶ Récolte du terrain (pelle)');
const w3 = new World(20260821);
// trouve une case de sable creusable
let sandTx = -1, sandTy = -1;
for (let ty = 2; ty < w3.h - 2 && sandTx < 0; ty++) {
  for (let tx = 2; tx < w3.w - 2; tx++) {
    if (w3.floor[w3.idx(tx, ty)] === 'sand') { sandTx = tx; sandTy = ty; break; }
  }
}
assert(sandTx >= 0, 'une case de sable existe sur la plage');
const sdrop = w3.breakBlock(sandTx, sandTy);
assert(sdrop === 'sand', 'creuser le sable donne du sable');
assert(w3.floor[w3.idx(sandTx, sandTy)] === 'dirt', 'le sable creusé devient de la terre');
const ddrop = w3.breakBlock(sandTx, sandTy);
assert(ddrop === 'dirt', 'creuser la terre donne de la terre');
assert(w3.floor[w3.idx(sandTx, sandTy)] === 'grass', 'la terre creusée devient de l\'herbe');

// poser les nouveaux blocs
assert(w3.placeBlock(sandTx, sandTy, 'plank') === true, 'poser des planches réussit');
assert(w3.blocks[w3.idx(sandTx, sandTy)] === 'plank', 'les planches sont posées');
assert(w3.placeBlock(sandTx, sandTy, 'brick') === true, 'poser des briques sur les planches (empilement) réussit');
assert(w3.placeBlock(sandTx, sandTy, 'stone') === false, 'impossible d\'empiler plus de 2 blocs');

console.log('▶ Arbres de tailles variées');
assert(TREE_VARIANTS.join(',') === 'small,medium,large', '3 tailles d\'arbres');
assert(treeVariantAt(4, 7) === treeVariantAt(4, 7), 'taille déterministe pour une case');
const sizes = new Set([treeVariantAt(1, 1), treeVariantAt(2, 5), treeVariantAt(8, 3), treeVariantAt(11, 9), treeVariantAt(20, 14), treeVariantAt(33, 6)]);
assert(sizes.size >= 2, 'plusieurs tailles apparaissent dans le monde');
assert(treeDropCount('small') === 3 && treeDropCount('medium') === 4 && treeDropCount('large') === 5, 'plus l\'arbre est grand, plus il donne de bois');
assert(treeBreakTime('large') > treeBreakTime('medium') && treeBreakTime('medium') > treeBreakTime('small'), 'un grand arbre se casse plus lentement');

console.log('▶ Pose manuelle sur l\'établi');
const bench = new Inventory();
bench.add('wood', 4);
const woodSlot = bench.slots.findIndex((s) => s && s.id === 'wood');
assert(woodSlot >= 0, 'le bois est dans une case');
assert(bench.clickInventorySlot(woodSlot, 'left') && bench.cursor?.id === 'wood', 'clic = prendre dans le curseur');
assert(bench.clickCraftSlot(0, 'left') && bench.craftingGrid[0]?.id === 'wood', 'clic grille = poser');
assert(bench.cursor === null, 'le curseur se vide après avoir tout posé');
bench.add('plank', 2);
const plankSlot = bench.slots.findIndex((s) => s && s.id === 'plank');
bench.clickInventorySlot(plankSlot, 'left');
bench.clickCraftSlot(0, 'right');
assert(bench.craftingGrid[0]?.id === 'wood', 'clic droit ne remplace pas un autre objet');

const sticks = new Inventory();
sticks.add('plank', 2);
const pSlot = sticks.slots.findIndex((s) => s && s.id === 'plank');
sticks.clickInventorySlot(pSlot, 'left');
sticks.clickCraftSlot(0, 'right');
sticks.clickCraftSlot(3, 'right');
const match = sticks.getMatchingRecipe();
assert(match && match.id === 'stick', '2 planches en colonne = bâtons');

console.log('▶ Grille 2×2 de l\'écran inventaire');
const small = new Inventory();
small.add('wood', 4);
const wSlot = small.slots.findIndex((s) => s && s.id === 'wood');
assert(small.clickInventorySlot(wSlot, 'left') && small.cursor?.id === 'wood', 'prendre du bois dans le curseur');
assert(small.clickCraftSmallSlot(0, 'left') && small.craftingGridSmall[0]?.id === 'wood', 'poser dans la grille 2×2');
assert(small.getMatchingRecipeSmall()?.id === 'plank', '1 bois → planches (recette 1×1)');
assert(small.craftFromSmallGrid() === true, 'fabriquer depuis la grille 2×2');
assert(small.cursor?.id === 'plank' && small.cursor.count === 2, 'le résultat 2× va sur le curseur');
assert(small.craftingGridSmall[0]?.count === 3, 'un seul bois consommé (il en reste 3)');
assert(small.getMatchingRecipeSmall()?.id === 'plank', 'la recette reste disponible tant qu\'il reste du bois');
assert(small.returnCraftingGrid() === true, 'rendre la grille au sac');
assert(small.count('wood') === 3, 'les 3 bois restants reviennent');

console.log('▶ Les outils (3×3) ne rentrent pas dans la grille 2×2');
const small2 = new Inventory();
small2.setSlot(0, { id: 'plank', count: 1 });
small2.setSlot(1, { id: 'plank', count: 1 });
small2.setSlot(2, { id: 'stick', count: 1 });
small2.clickInventorySlot(0, 'left');
small2.clickCraftSmallSlot(0, 'left');
small2.clickInventorySlot(1, 'left');
small2.clickCraftSmallSlot(1, 'left');
small2.clickInventorySlot(2, 'left');
small2.clickCraftSmallSlot(3, 'left');
assert(small2.craftingGridSmall.map((c) => (c ? c.id : 'null')).join(',') === 'plank,plank,null,stick', 'motif incomplet posé en 2×2');
assert(small2.getMatchingRecipeSmall() === null, 'pas de recette valable en 2×2');

console.log('▶ Consommation d\'un seul ingrédient par fabrication');
const repeat = new Inventory();
repeat.add('wood', 8);
const w2x = repeat.slots.findIndex((s) => s && s.id === 'wood');
repeat.clickInventorySlot(w2x, 'left');
repeat.clickCraftSlot(0, 'left');
assert(repeat.craftingGrid[0]?.count === 8, 'une pile de 8 bois dans la grille');
assert(repeat.craftFromGrid() === true, 'première fabrication');
assert(repeat.craftingGrid[0]?.count === 7, 'un seul bois consommé (pas toute la pile)');
assert(repeat.getMatchingRecipe()?.id === 'plank', 'la recette reste valable');
assert(repeat.craftFromGrid() === true && repeat.cursor?.count === 4, 'deuxième fabrication possible');
assert(repeat.craftingGrid[0]?.count === 6, '6 bois restent après 2 fabrications');

console.log('▶ Double-clic : ramasser toutes les piles du même objet');
const collect = new Inventory();
collect.setSlot(0, { id: 'wood', count: 5 });
collect.setSlot(1, { id: 'stone', count: 3 });
collect.setSlot(2, { id: 'wood', count: 6 });
const c1 = collect.slots.findIndex((s) => s && s.id === 'wood');
collect.clickInventorySlot(c1, 'left');
assert(collect.cursor?.count === 5, 'première pile dans le curseur');
assert(collect.collectItemType('wood') === true, 'double-clic : ramasser les autres piles');
assert(collect.cursor.count === 11, 'curseur = 5 + 6 bois');
assert(collect.count('wood') === 0, 'plus aucun bois dans les cases');
assert(collect.count('stone') === 3, 'la pierre n\'est pas touchée');

console.log('▶ Touches 1..9 : échange avec la barre rapide');
const swap = new Inventory();
swap.setSlot(3, { id: 'wood', count: 3 });
assert(swap.swapWithHotbar(3, 0) === true, 'échange case sac ↔ barre rapide');
assert(swap.slots[swap.hotbarStart]?.id === 'wood', 'le bois est dans la barre rapide');
assert(swap.slots[3] === null, 'la case du sac est vide');

console.log('▶ Glisser-répartir (drag 1.8+)');
const dist = new Inventory();
dist.add('wood', 64);
const d1 = dist.slots.findIndex((s) => s && s.id === 'wood');
dist.clickInventorySlot(d1, 'left');
assert(dist.cursor?.count === 64, '64 bois dans le curseur');
dist.beginDragDistribute('left', true);
for (let i = 0; i < 3; i++) dist.dragDistributeEnter(dist.slots, i);
assert(dist.endDragDistribute() === true, 'répartition au relâchement');
const shares = dist.slots.slice(0, 3).map((s) => s ? s.count : 0);
assert(shares.join(',') === '22,21,21', `répartition ceil : 22,21,21 (reçu ${shares.join(',')})`);
assert(dist.cursor === null, 'curseur vidé');

const distR = new Inventory();
distR.add('wood', 10);
const dr1 = distR.slots.findIndex((s) => s && s.id === 'wood');
distR.clickInventorySlot(dr1, 'left');
distR.beginDragDistribute('right', true);
for (let i = 0; i < 3; i++) distR.dragDistributeEnter(distR.slots, i);
distR.endDragDistribute();
assert(distR.slots[0].count === 1 && distR.slots[1].count === 1 && distR.slots[2].count === 1, 'clic droit glissé = 1 par case');
assert(distR.cursor.count === 7, 'le reste reste sur le curseur');

const distMix = new Inventory();
distMix.add('wood', 10);
distMix.add('stone', 3);
const dm1 = distMix.slots.findIndex((s) => s && s.id === 'wood');
const dm2 = distMix.slots.findIndex((s) => s && s.id === 'stone');
distMix.clickInventorySlot(dm1, 'left');
distMix.beginDragDistribute('left');
distMix.dragDistributeEnter(distMix.slots, dm2);
distMix.dragDistributeEnter(distMix.slots, 5);
distMix.endDragDistribute();
assert(distMix.slots[5]?.id === 'wood' && distMix.slots[5].count === 10, 'les cases incompatibles sont ignorées dans la répartition');
assert(distMix.slots[dm2].count === 3 && distMix.slots[dm2].id === 'stone', 'la case occupée par un autre objet est intacte');

console.log('▶ Retour de la grille 2×2 à la fermeture');
const back = new Inventory();
back.setSlot(0, { id: 'plank', count: 2 });
back.clickInventorySlot(0, 'left');
back.clickCraftSmallSlot(0, 'left');
assert(back.craftingGridSmall[0]?.count === 2, '2 planches dans une case de la grille 2×2');
assert(back.returnCraftingGrid() === true, 'fermer l\'écran rend la grille 2×2 au sac');
assert(back.count('plank') === 2, 'les planches sont revenues');

console.log('▶ Fabrication maximale (shift-clic sur le résultat)');
const maxc = new Inventory();
maxc.setSlot(0, { id: 'wood', count: 10 });
maxc.clickInventorySlot(0, 'left');
maxc.clickCraftSlot(0, 'left');
const crafted = maxc.craftFromGridMax({ toCursor: false });
assert(crafted === 10, `10 fabrications possibles (reçu ${crafted})`);
assert(maxc.count('plank') === 20, '20 planches fabriquées');
assert(maxc.craftingGrid[0] === null, 'la grille est vide à la fin');
assert(maxc.cursor === null, 'rien sur le curseur');

console.log('▶ Portes');
const wdoor = new World(20260821);
const doorTx = 30, doorTy = 30;
assert(wdoor.placeBlock(doorTx, doorTy, 'door') === true, 'poser une porte réussit');
assert(wdoor.blocks[wdoor.idx(doorTx, doorTy)] === 'door', 'la porte est bien posée');
assert(wdoor.isSolidTile(doorTx, doorTy) === true, 'porte fermée = obstacle');
assert(wdoor.toggleDoor(doorTx, doorTy) === true, 's\'ouvre au clic droit');
assert(wdoor.isSolidTile(doorTx, doorTy) === false, 'porte ouverte = praticable');
assert(wdoor.toggleDoor(doorTx, doorTy) === false, 'se referme au clic droit');
assert(wdoor.isSolidTile(doorTx, doorTy) === true, 'refermée = obstacle à nouveau');
const doorDrop = wdoor.breakBlock(doorTx, doorTy);
assert(doorDrop === 'door', 'casser une porte rend une porte');
assert(wdoor.isDoorOpen(doorTx, doorTy) === false, 'l\'état de la porte est réinitialisé');
assert(wdoor.placeBlock(0, 0, 'door') === false, 'on ne pose pas une porte sur l\'eau');

console.log('▶ Le fer');
const wiron = new World(20260821);
const ironIdx = wiron.blocks.indexOf('ironOre');
assert(ironIdx >= 0, 'du minerai de fer existe dans le monde');
const iox = ironIdx % 128, ioy = Math.floor(ironIdx / 128);
assert(wiron.breakBlock(iox, ioy) === 'rawIron', 'casser du minerai donne du fer brut');
assert(BLOCK_DEFS.ironOre.minTier === 'stone', 'le fer exige une pioche en pierre ou mieux');

const ironInv = new Inventory();
ironInv.add('rawIron', 3);
const ingotRecipe = RECIPES.find((r) => r.id === 'ironIngot');
assert(ironInv.craft(ingotRecipe) === true, '1 fer brut → 1 lingot');
assert(ironInv.count('ironIngot') === 1, 'lingot fabriqué');
const blockRecipe = RECIPES.find((r) => r.id === 'ironBlock');
ironInv.add('ironIngot', 8);
assert(ironInv.craft(blockRecipe) === true, '9 lingots → 1 bloc de fer');
assert(ironInv.count('ironBlock') === 1, 'bloc de fer fabriqué');
const ironPick = RECIPES.find((r) => r.id === 'iron_pickaxe');
ironInv.add('ironIngot', 3);
ironInv.add('stick', 2);
assert(ironInv.craft(ironPick) === true, 'pioche en fer fabriquée');
assert(ITEM_DEFS.iron_pickaxe.durability === 250, 'la pioche en fer est bien plus durable');

console.log('▶ Niveaux d\'outils');
const { TOOL_TIERS, toolTierIndex, blockMinTierIndex } = await import('../js/blocks.js');
assert(TOOL_TIERS.join(',') === 'wood,stone,iron,diamond', '4 niveaux d\'outils');
assert(toolTierIndex(ITEM_DEFS.wooden_pickaxe) === 0, 'bois = niveau 0');
assert(toolTierIndex(ITEM_DEFS.stone_pickaxe) === 1, 'pierre = niveau 1');
assert(toolTierIndex(ITEM_DEFS.iron_pickaxe) === 2, 'fer = niveau 2');
assert(toolTierIndex(ITEM_DEFS.diamond_pickaxe) === 3, 'diamant = niveau 3 (le sommet)');
assert(blockMinTierIndex('ironOre') === 1, 'le fer demande la pierre');
assert(blockMinTierIndex('rock') === 0, 'la roche ne demande rien de plus');

// Les outils en diamant : mêmes formes que le fer, en mieux.
for (const t of ['pickaxe', 'axe', 'shovel', 'sword']) {
  const id = `diamond_${t}`;
  const def = ITEM_DEFS[id];
  assert(def, `l'outil ${id} existe`);
  assert(def.tier === 'diamond' && def.toolType === t, `${id} : bon palier et bon type`);
  assert(def.durability > ITEM_DEFS[`iron_${t}`].durability, `${id} tient plus longtemps que le fer`);
  const recipe = RECIPES.find((r) => r.id === id);
  assert(recipe && recipe.inputs.diamond, `${id} se crafte avec des gemmes`);
}
assert(ITEM_DEFS.diamond_pickaxe.efficiency > ITEM_DEFS.iron_pickaxe.efficiency,
  'la pioche en diamant mine plus vite que celle en fer');

// Dégâts : plus le matériau de l'épée est noble, plus elle tranche.
const { toolDamage } = await import('../js/blocks.js');
assert(toolDamage(null) === 1, 'mains nues : 1 dégât');
assert(toolDamage(ITEM_DEFS.wood) === 1, 'un matériau ne frappe pas');
assert(toolDamage(ITEM_DEFS.wooden_sword) === 3, 'épée bois : 3');
assert(toolDamage(ITEM_DEFS.stone_sword) === 4, 'épée pierre : 4');
assert(toolDamage(ITEM_DEFS.iron_sword) === 5, 'épée fer : 5');
assert(toolDamage(ITEM_DEFS.diamond_sword) === 7, 'épée diamant : 7 (le maximum)');
assert(toolDamage(ITEM_DEFS.wooden_axe) === 2, 'hache bois : 2 (plus que les mains nues)');
assert(toolDamage(ITEM_DEFS.iron_axe) === 4, 'hache fer : 4');
assert(toolDamage(ITEM_DEFS.diamond_axe) === 6, 'hache diamant : 6');
assert(toolDamage(ITEM_DEFS.diamond_pickaxe) === 1, 'une pioche, même en diamant, frappe à 1');
// Craft bout en bout : 3 gemmes + 2 bâtons → pioche en diamant.
const dInv = new Inventory();
dInv.add('diamond', 3);
dInv.add('stick', 2);
assert(dInv.craft(RECIPES.find((r) => r.id === 'diamond_pickaxe')) === true, '3 diamants + 2 bâtons → pioche');
assert(dInv.count('diamond_pickaxe') === 1, 'la pioche en diamant est fabriquée');
assert(dInv.count('diamond') === 0 && dInv.count('stick') === 0, 'les ingrédients sont consommés');

console.log('▶ Agriculture');
const { CROPS, CROP_MATURE, DIGGABLE_FLOOR } = await import('../js/blocks.js');
assert(CROPS.join(',') === 'wheat0,wheat1,wheat2,wheat3', '4 stades de blé');
assert(CROP_MATURE === 'wheat3', 'le stade mûr est le dernier');
assert(DIGGABLE_FLOOR.flowers?.drop === 'seeds', 'faucher les fleurs donne des graines');
assert(DIGGABLE_FLOOR.farmland, 'la terre labourée se retransforme en terre');
assert(ITEM_DEFS.seeds.place === 'wheat0', 'les graines se sèment');
assert(ITEM_DEFS.bread.food > 0 && ITEM_DEFS.cookedBeef.food > 0, 'pain et steak nourrissent');
assert(toolDamage(ITEM_DEFS.diamond_hoe) === 1, 'la houe n\'est pas une arme');
assert(RECIPES.some((r) => r.id === 'bread' && r.inputs.wheat === 3), '3 blés → 1 pain');
for (const t of ['wooden_hoe', 'stone_hoe', 'iron_hoe', 'diamond_hoe']) {
  assert(ITEM_DEFS[t]?.toolType === 'hoe', `${t} est une houe`);
  assert(RECIPES.some((r) => r.id === t), `${t} se crafte`);
}
// On ne sème QUE sur de la terre labourée.
const farmWorld = new World(20260821);
const fx = 40, fy = 40;
const fi = farmWorld.idx(fx, fy);
farmWorld.blocks[fi] = null;
farmWorld.floor[fi] = 'grass';
assert(farmWorld.placeBlock(fx, fy, 'seeds') === false, 'impossible de semer dans l\'herbe');
farmWorld.floor[fi] = 'farmland';
assert(farmWorld.placeBlock(fx, fy, 'seeds') === true, 'mais oui sur terre labourée');
assert(farmWorld.blocks[fi] === 'wheat0', 'le semis apparaît');
assert(BLOCK_DEFS.wheat0.solid === false, 'le blé ne bloque pas le passage');

console.log('▶ Porte craftable');
const doorRecipe = RECIPES.find((r) => r.id === 'door');
const doorInv = new Inventory();
doorInv.add('plank', 6);
assert(doorInv.craft(doorRecipe) === true, '6 planches → 3 portes');
assert(doorInv.count('door') === 3, '3 portes fabriquées');

console.log('▶ Lâcher d\'objets (Q)');
const dropInv = new Inventory();
dropInv.setSlot(dropInv.hotbarStart + 0, { id: 'wood', count: 5 });
assert(dropInv.takeSlot(dropInv.selectedSlotIndex(), 1).count === 1, 'Q lâche 1 objet de la case sélectionnée');
assert(dropInv.getSelectedStack().count === 4, 'il reste 4 bois dans la case');
assert(dropInv.takeSlot(dropInv.selectedSlotIndex(), 99).count === 4, 'Ctrl+Q lâche toute la pile');
assert(dropInv.getSelectedStack() === null, 'la case est vide après Ctrl+Q');
const cursorDrop = new Inventory();
cursorDrop.setSlot(2, { id: 'plank', count: 7 });
cursorDrop.clickInventorySlot(2, 'left');
const thrown = cursorDrop.dropCursor();
assert(thrown && thrown.id === 'plank' && thrown.count === 7, 'dropCursor rend la pile du curseur');
assert(cursorDrop.cursor === null, 'le curseur est vidé après le lâcher');

console.log('▶ Four : recettes et combustibles');
const { SMELT_RECIPES, FUEL, makeFurnaceEntry, updateFurnace, smeltRecipe, isFuel } = await import('../js/furnace.js');
assert(smeltRecipe('rawIron')?.out === 'ironIngot', 'le fer brut se fond en lingot');
assert(smeltRecipe('sand')?.out === 'glass', 'le sable se fond en verre');
assert(smeltRecipe('rawBeef')?.out === 'cookedBeef', 'le bœuf cru se cuit');
assert(smeltRecipe('wood') === null, 'le bois ne se fond pas');
assert(isFuel('wood') && isFuel('plank') && isFuel('stick'), 'bois, planches et bâtons brûlent');
assert(FUEL.wood === 15 && FUEL.stick === 5, 'durées de combustion cohérentes');

console.log('▶ Four : cuisson complète');
const furnace = makeFurnaceEntry();
furnace.input[0] = { id: 'rawIron', count: 1 };
furnace.fuel[0] = { id: 'wood', count: 1 };
for (let i = 0; i < 80; i++) updateFurnace(furnace, 0.1); // 8 s
assert(furnace.output[0]?.id === 'ironIngot' && furnace.output[0].count === 1, '1 fer brut → 1 lingot');
assert(furnace.input[0] === null, 'l\'entrée est vide');
assert(furnace.fuel[0] === null, 'le bois a été consommé');
assert(furnace.fuelTime > 0, 'le feu continue de brûler après la cuisson');

console.log('▶ Four : empilement et manque de combustible');
const f2 = makeFurnaceEntry();
f2.input[0] = { id: 'rawIron', count: 3 };
f2.fuel[0] = { id: 'wood', count: 1 }; // 15 s → 1 lingot + début du 2e
for (let i = 0; i < 160; i++) updateFurnace(f2, 0.1); // 16 s
assert(f2.output[0]?.count === 1, '1 seul lingot avec un seul bois');
assert(f2.input[0].count === 2, 'il reste 2 fers bruts');
assert(f2.fuelTime === 0, 'le feu s\'est éteint');
assert(Math.abs(f2.progress - 7) < 0.5, `la 2e cuisson est en cours (${f2.progress.toFixed(1)}/8 s)`);
f2.fuel[0] = { id: 'stick', count: 2 };
for (let i = 0; i < 100; i++) updateFurnace(f2, 0.1); // 10 s
assert(f2.output[0].count === 3, 'les 3 lingots sont fondus avec un complément de bâtons');
assert(f2.input[0] === null, 'entrée vide à la fin');

console.log('▶ Four : sortie occupée par un autre objet');
const f3 = makeFurnaceEntry();
f3.input[0] = { id: 'rawIron', count: 1 };
f3.fuel[0] = { id: 'plank', count: 1 };
f3.output[0] = { id: 'glass', count: 1 };
for (let i = 0; i < 100; i++) updateFurnace(f3, 0.1);
assert(f3.output[0].id === 'glass', 'la sortie reste bloquée');
assert(f3.input[0]?.count === 1, 'rien n\'a été fondu');
assert(f3.fuel[0]?.count === 1, 'le combustible n\'a pas été consommé');

console.log('▶ Four : cuisson de la viande et du sable');
const f4 = makeFurnaceEntry();
f4.input[0] = { id: 'rawBeef', count: 1 };
f4.fuel[0] = { id: 'stick', count: 2 };
for (let i = 0; i < 100; i++) updateFurnace(f4, 0.1);
assert(f4.output[0]?.id === 'cookedBeef', 'le steak est cuit');
const f5 = makeFurnaceEntry();
f5.input[0] = { id: 'sand', count: 2 };
f5.fuel[0] = { id: 'wood', count: 1 };
for (let i = 0; i < 160; i++) updateFurnace(f5, 0.1);
assert(f5.output[0]?.count === 2, '2 sables → 2 verres');

console.log('▶ Mobs : moutons & vaches');
const { MOB_DEFS, spawnMobs, updateMob, mobDrops } = await import('../js/mobs/index.js');
assert(MOB_DEFS.sheep && MOB_DEFS.cow, 'mouton et vache définis');
const wmob = new World(20260821);
const mobs = spawnMobs(wmob, { sheep: 6, cow: 4 });
assert(mobs.length === 10, `10 animaux apparaissent (reçu ${mobs.length})`);
const onGrass = mobs.every((m) => {
  const tx = Math.floor(m.x / TILE);
  const ty = Math.floor(m.y / TILE);
  return ['grass', 'grassDark', 'flowers', 'dirt'].includes(wmob.floor[wmob.idx(tx, ty)]) && !wmob.isSolidTile(tx, ty);
});
assert(onGrass, 'les animaux sont sur l\'herbe, jamais sur l\'eau ou un bloc');
const sheepDrops = mobDrops({ kind: 'sheep' });
const cowDrops = mobDrops({ kind: 'cow' });
assert(sheepDrops.some((d) => d.id === 'wool' && d.count >= 1), 'le mouton lâche de la laine');
assert(cowDrops.some((d) => d.id === 'rawBeef' && d.count >= 1), 'la vache lâche du bœuf cru');
const fakePlayer = { x: 0, y: 0 };
for (let i = 0; i < 300; i++) mobs.forEach((m) => updateMob(m, 0.1, wmob, fakePlayer));
assert(mobs.every((m) => Math.abs(m.x) < wmob.w * TILE && Math.abs(m.y) < wmob.h * TILE), 'les animaux restent dans le monde');

console.log('▶ Four craftable');
const furnaceRecipe = RECIPES.find((r) => r.id === 'furnace');
const fInv = new Inventory();
fInv.add('stone', 8);
assert(fInv.craft(furnaceRecipe) === true, '8 pierres → 1 four');
assert(fInv.count('furnace') === 1, 'le four est fabriqué');

console.log('▶ Coffre (rangement)');
const chestRecipe = RECIPES.find((r) => r.id === 'chest');
const cInv = new Inventory();
cInv.add('plank', 8);
assert(cInv.craft(chestRecipe) === true, '8 planches → 1 coffre');
assert(cInv.count('chest') === 1, 'le coffre est fabriqué');
// pose sur une case forcée libre
const wchest = new World(20260821);
wchest.setBlock(30, 30, null);
assert(wchest.placeBlock(30, 30, 'chest') === true, 'coffre posé sur l\'herbe');
assert(wchest.blocks[wchest.idx(30, 30)] === 'chest', 'le coffre est dans le monde');
assert(wchest.isSolidTile(30, 30), 'le coffre est un obstacle');
assert(wchest.placeBlock(30, 30, 'chest') === false, 'on n\'empile pas sur un coffre');
assert(wchest.placeBlock(30, 30, 'plank') === false, 'on ne pose rien sur un coffre');
const chestDrop = wchest.breakBlock(30, 30);
assert(chestDrop === 'chest', 'casser un coffre le donne en drop');
// Double-clic : collecte l'inventaire ET les cases du coffre ouvert
const chestSlots = new Array(27).fill(null);
chestSlots[0] = { id: 'plank', count: 5 };
chestSlots[3] = { id: 'plank', count: 3 };
cInv.slots[2] = { id: 'plank', count: 4 };
cInv.cursor = { id: 'plank', count: 1 };
cInv.collectItemType('plank', [chestSlots]);
assert(cInv.cursor.count === 13, 'double-clic : tout le bois est ramassé (sac + coffre)');
assert(chestSlots[0] === null && chestSlots[3] === null && cInv.slots[2] === null, 'cases vidées');
const woolBlockRecipe = RECIPES.find((r) => r.id === 'woolBlock');
const wInv = new Inventory();
wInv.add('wool', 4);
assert(wInv.craft(woolBlockRecipe) === true, '4 laines → 1 bloc de laine');

console.log('▶ Construction 3D');
assert(BLOCK_EXTRUDE >= 0, 'constante d\'extrusion définie');
assert(BLOCK_DEFS.wood.kind === 'block' && BLOCK_DEFS.glass.kind === 'block', 'bois et verre sont des blocs constructibles');

console.log('▶ Faces 2.5D : coins, murs, empilements');
const wfaces = new World(20260821);
// On pose via setBlock (placeBlock refuse derrière un mur en perspective).
const CX = 40, CY = 40;
const put = (tx, ty, id, layer = 1) => {
  if (layer === 2) wfaces.blocks2[wfaces.idx(tx, ty)] = id;
  else wfaces.setBlock(tx, ty, id);
};
const facesAt = (tx, ty, id = 'brick', layer = 1) => resolveBlockFaces(wfaces, id, tx, ty, layer);

// Maison rectangulaire 4×3
//   (40,40) (41,40) (42,40) (43,40)
//   (40,41)                 (43,41)
//   (40,42) (41,42) (42,42) (43,42)
for (let x = 0; x < 4; x++) { put(CX + x, CY, 'brick'); put(CX + x, CY + 2, 'brick'); }
put(CX, CY + 1, 'brick');
put(CX + 3, CY + 1, 'brick');

const nw = facesAt(CX, CY);
const ne = facesAt(CX + 3, CY);
const sw = facesAt(CX, CY + 2);
const se = facesAt(CX + 3, CY + 2);
const northMid = facesAt(CX + 1, CY);
const southMid = facesAt(CX + 1, CY + 2);
const westMid = facesAt(CX, CY + 1);
const eastMid = facesAt(CX + 3, CY + 1);

assert(nw.showTop && ne.showTop, 'coins nord : dessus visible');
assert(sw.showTop && se.showTop, 'coins sud : dessus visible');
assert(northMid.showTop && southMid.showTop, 'murs E-O : dessus visible sur toute la longueur');
assert(westMid.showTop && eastMid.showTop, 'segments N-S : chaque cube garde son dessus');
assert(sw.northSame && sw.rightSame && !sw.leftSame, 'coin SO : voisin nord + est');
assert(se.northSame && se.leftSame && !se.rightSame, 'coin SE : voisin nord + ouest');

// Colonne verticale de 3 + virage à droite
put(50, 50, 'plank');
put(50, 51, 'plank');
put(50, 52, 'plank');
put(51, 52, 'plank');
put(52, 52, 'plank');
assert(facesAt(50, 50, 'plank').showTop, 'premier bloc du mur vertical : dessus');
assert(facesAt(50, 51, 'plank').showTop, 'bloc ajouté en dessous : dessus aussi');
assert(facesAt(50, 52, 'plank').showTop, 'encore en dessous : dessus aussi');
assert(facesAt(51, 52, 'plank').showTop && facesAt(52, 52, 'plank').showTop, 'bras horizontal du L : dessus continu');

// Virage à gauche (miroir)
put(60, 50, 'plank');
put(60, 51, 'plank');
put(59, 51, 'plank');
assert(facesAt(60, 51, 'plank').showTop, 'coin L (virage à gauche) : dessus visible aussi');

// T-junction
put(70, 50, 'brick');
put(69, 51, 'brick');
put(70, 51, 'brick');
put(71, 51, 'brick');
assert(facesAt(70, 51).showTop, 'jonction en T : dessus visible');

// Empilement
put(80, 50, 'wood');
put(80, 50, 'wood', 2);
const base = facesAt(80, 50, 'wood', 1);
const cap = facesAt(80, 50, 'wood', 2);
assert(base.covered && !base.showTop, 'couche 1 empilée : dessus caché (fusion avec le bloc du dessus)');
assert(!cap.covered && cap.sittingOn && cap.showTop, 'couche 2 : dessus net, posée sur la couche 1');

// Empilement mixte (brique sur bois) : on cache quand même
put(81, 50, 'wood');
put(81, 50, 'brick', 2);
assert(!facesAt(81, 50, 'wood', 1).showTop, 'empilement mixte : le socle cache son dessus');
assert(facesAt(81, 50, 'brick', 2).showTop, 'empilement mixte : le sommet garde son dessus');

// Types différents côte à côte : pas de fusion
put(90, 50, 'wood');
put(91, 50, 'brick');
assert(!facesAt(90, 50, 'wood').rightSame, 'bois à côté de brique : pas de raccord');
assert(facesAt(90, 50, 'wood').showTop && facesAt(91, 50, 'brick').showTop, 'matériaux distincts : chacun garde son dessus');

console.log('▶ Couleurs d\'apparence');
const cols = appearanceColors({ skin: 'ebene', hairColor: 'roux', eyes: 'violet', shirt: 'noir', pants: 'jean' });
assert(cols.skin === '#5e3b22', 'peau ébène');
assert(cols.hair === '#a3401f', 'cheveux roux');

// ============================================================
//  MONNAIE
// ============================================================
console.log('▶ Monnaie');
const { Wallet, formatMoney, CURRENCY } = await import('../js/economy.js');
assert(formatMoney(0) === '0', 'format : 0');
assert(formatMoney(1234) === '1\u202F234', 'format : 1234 → 1 234 (espace fine)');
assert(formatMoney(1234567) === '1\u202F234\u202F567', 'format : 1234567');
assert(formatMoney(-42) === '−42', 'format : négatif');

const purse = new Wallet({ allowStorage: false });
assert(purse.money === 0, 'bourse vide au départ');
assert(CURRENCY.startingGrant > 0, 'une somme de bienvenue est prévue');
purse.add(CURRENCY.startingGrant, 'test');
assert(purse.money === CURRENCY.startingGrant, 'la somme de bienvenue est versée');
assert(purse.canAfford(CURRENCY.startingGrant), 'on peut dépenser exactement sa bourse');
assert(!purse.canAfford(CURRENCY.startingGrant + 1), 'pas de découvert possible (vérification)');
assert(purse.spend(40, 'achat') === true, 'dépense acceptée');
assert(purse.money === CURRENCY.startingGrant - 40, 'le montant est bien débité');
assert(purse.spend(CURRENCY.startingGrant, 'trop cher') === false, 'dépense refusée si insuffisante');
assert(purse.money === CURRENCY.startingGrant - 40, 'un refus ne débite rien');
assert(purse.totalSpent === 40 && purse.totalEarned === CURRENCY.startingGrant, 'totaux suivis');
assert(purse.history.length === 2, 'les mouvements sont journalisés');
purse.advanceDay();
assert(purse.day === 2, 'les jours passés sur l\'île sont comptés');

// --- La monnaie rangée DANS l'inventaire (objet `coin`) ---
// Le Wallet n'a alors plus de compteur : lire le solde = compter les
// pièces, ajouter = remplir une case, dépenser = retirer des pièces.
console.log('▶ Monnaie rangée dans l\'inventaire');
const { MONEY_ITEM } = await import('../js/blocks.js'); // ITEM_DEFS est déjà importé plus haut
assert(!!ITEM_DEFS[MONEY_ITEM], 'la monnaie est un objet de l\'inventaire');
assert(!ITEM_DEFS[MONEY_ITEM].place, 'elle n\'est pas posable dans le monde');
assert(ITEM_DEFS[MONEY_ITEM].maxStack >= CURRENCY.startingGrant,
  'la somme de bienvenue tient sur UNE seule case (pas trois piles de 64)');

const purseInv = new Inventory();
const store = {
  count: () => purseInv.count(MONEY_ITEM),
  add: (n) => purseInv.add(MONEY_ITEM, n),
  remove: (n) => purseInv.remove(MONEY_ITEM, n),
};
const bag = new Wallet({ allowStorage: false, store });
assert(bag.money === 0, 'pas une pièce en poche au départ');
assert(bag.add(CURRENCY.startingGrant, 'bienvenue') === CURRENCY.startingGrant,
  'la somme de bienvenue entre dans l\'inventaire');
assert(bag.money === CURRENCY.startingGrant, 'le solde se lit depuis les cases');
assert(purseInv.count(MONEY_ITEM) === CURRENCY.startingGrant, 'ce sont bien des pièces empilées');
assert(purseInv.slots.filter((s) => s && s.id === MONEY_ITEM).length === 1,
  'et elles tiennent sur une seule case');
assert(bag.spend(40, 'achat') === true, 'payer retire des pièces');
assert(purseInv.count(MONEY_ITEM) === CURRENCY.startingGrant - 40,
  'l\'inventaire reflète la dépense');
assert(bag.spend(CURRENCY.startingGrant, 'trop cher') === false, 'pas de découvert possible');
assert(purseInv.count(MONEY_ITEM) === CURRENCY.startingGrant - 40, 'un refus ne retire rien');
assert(bag.shouldGrant() === true,
  'la somme de bienvenue est remise à chaque session (l\'argent ne survit pas à l\'inventaire)');

// Inventaire plein : l'argent est un objet, il peut manquer de la place.
const fullBagInv = new Inventory();
for (let i = 0; i < fullBagInv.slotCount; i++) fullBagInv.slots[i] = { id: 'wood', count: 1 };
const fullBag = new Wallet({
  allowStorage: false,
  store: {
    count: () => fullBagInv.count(MONEY_ITEM),
    add: (n) => fullBagInv.add(MONEY_ITEM, n),
    remove: (n) => fullBagInv.remove(MONEY_ITEM, n),
  },
});
assert(fullBag.add(50, 'trop tard') === 0, 'un inventaire plein ne peut pas recevoir d\'écus');
assert(fullBag.money === 0, 'et le solde reste à zéro plutôt que d\'inventer de l\'argent');

// --- LE VERSEMENT D'ARRIVÉE : une règle, pas un lot de consolation ---
// Le versement était autrefois un effet de bord de la cinématique du
// représentant, qui ne se joue qu'UNE fois par navigateur. Résultat : le
// joueur de retour spawnait avec 0 écu — la somme doit donc être payée à
// chaque arrivée par `grantStartingFunds()`, qui tient le verrou.
console.log('▶ Somme de bienvenue : une paie par arrivée, jamais deux');
bag.reset();                                   // un joueur qui arrive : bourse et cases vides
assert(bag.grantStartingFunds() === CURRENCY.startingGrant,
  'l\'arrivée verse la somme de bienvenue');
assert(purseInv.count(MONEY_ITEM) === CURRENCY.startingGrant,
  'la somme entre bien dans les cases de l\'inventaire');
assert(bag.grantStartingFunds() === 0,
  'la même arrivée ne repaie pas (cinématique + filet du point d\'entrée)');
assert(purseInv.count(MONEY_ITEM) === CURRENCY.startingGrant,
  'et la case ne déborde pas d\'un second versement');
assert(bag.totalEarned === CURRENCY.startingGrant,
  'les totaux ne comptent qu\'un seul versement');

// Le cas qui cassait : une nouvelle bourse (nouvelle arrivée) sur un
// inventaire reparti de zéro, avec la cinématique déjà vue derrière elle.
purseInv.remove(MONEY_ITEM, CURRENCY.startingGrant);
const nextArrival = new Wallet({ allowStorage: false, store });
assert(nextArrival.grantStartingFunds() === CURRENCY.startingGrant,
  'à l\'arrivée suivante, l\'inventaire vide est de nouveau doté');
assert(purseInv.slots.filter((s) => s && s.id === MONEY_ITEM).length === 1,
  'toujours sur une seule case');

// Pas d'argent inventé : si aucune case n'est libre, la somme n'entre pas.
assert(fullBag.grantStartingFunds() === 0,
  'inventaire plein au spawn : rien n\'est versé plutôt que d\'être perdu');
assert(fullBag.money === 0, 'et le solde ne s\'invente pas');

// Mode compteur (sans inventaire, les tests de logique pure) : la somme
// reste unique pour la vie du navigateur, comme avant.
const counterPurse = new Wallet({ allowStorage: false });
assert(counterPurse.grantStartingFunds() === CURRENCY.startingGrant,
  'le mode compteur reçoit aussi sa somme de bienvenue');
assert(counterPurse.grantStartingFunds() === 0,
  'et ne la reçoit pas deux fois dans la même partie');

// ============================================================
//  LA GROTTE
// ============================================================
console.log('▶ Entrée de la grotte (surface)');
const { CAVE, canDescendTo } = await import('../js/cave.js');
const surface = new World(20260821);
const mouth = surface.caveEntrance;
assert(mouth && surface.inBounds(mouth.tx, mouth.ty), 'une entrée de grotte est placée sur l\'île');
assert(surface.blockAt(mouth.tx, mouth.ty) === 'caveMouth', 'l\'arche sombre est posée');
assert(surface.isSolidTile(mouth.tx, mouth.ty), 'l\'arche est solide (on ne la traverse pas)');
assert(BLOCK_DEFS.caveMouth.breakable === false, 'l\'arche ne se casse pas');
assert(!surface.isSolidTile(mouth.standTx, mouth.standTy), 'la case devant l\'arche est praticable');
assert(surface.floorAt(mouth.tx, mouth.ty - 3) === 'rockFace', 'la falaise est bien là');
assert(surface.isSolidTile(mouth.tx, mouth.ty - 3), 'la falaise bloque le passage');

console.log('▶ Génération des niveaux souterrains');
for (const depth of [1, 2, 3, 5, CAVE.maxDepth]) {
  const cave = new World(20260821, { kind: 'cave', depth });
  const caveFloor = cave.floor.filter((f) => f === 'caveFloor').length;
  assert(caveFloor > 200, `prof. ${depth} : des galeries sont creusées (${caveFloor} cases)`);
  assert(!cave.isSolidAt(cave.spawn.x, cave.spawn.y), `prof. ${depth} : l'arrivée est praticable`);
  assert(cave.blockAt(cave.ladderDown.tx, cave.ladderDown.ty) === 'caveLadderDown',
    `prof. ${depth} : un puits descendant existe`);
  assert(cave.blockAt(cave.ladderUp.tx, cave.ladderUp.ty) === 'caveLadderUp',
    `prof. ${depth} : un puits remontant existe`);
  // Le puits descendant doit être au FOND, pas à côté de l'arrivée.
  const distDown = Math.abs(cave.ladderDown.ty - cave.spawn.y / TILE)
    + Math.abs(cave.ladderDown.tx - cave.spawn.x / TILE);
  assert(distDown > 12, `prof. ${depth} : le puits descendant est loin de l'arrivée (${distDown} cases)`);
  // Pierre, fer, charbon et (dès la prof. 2) diamant uniquement, comme demandé.
  const kinds = new Set(cave.blocks.filter(Boolean));
  const allowed = new Set(['caveStone', 'caveIron', 'caveCoal', 'caveDiamond', 'caveLadderDown', 'caveLadderUp']);
  assert([...kinds].every((k) => allowed.has(k)), `prof. ${depth} : uniquement pierre, fer, charbon, diamant et puits`);
  assert(kinds.has('caveStone') && kinds.has('caveIron'), `prof. ${depth} : de la pierre ET du fer`);
  assert(kinds.has('caveCoal'), `prof. ${depth} : du charbon dès le niveau 1`);
  if (depth === 1) {
    assert(!kinds.has('caveDiamond'), 'prof. 1 : aucun diamant en surface de la grotte');
  }
  // Déterminisme : deux joueurs descendent dans la même grotte.
  const twin = new World(20260821, { kind: 'cave', depth });
  assert(twin.floor.join('') === cave.floor.join('') && twin.blocks.join('|') === cave.blocks.join('|'),
    `prof. ${depth} : génération déterministe`);
}

// Plus on descend, plus c'est riche (la récompense du risque).
const ironAt = (d) => new World(20260821, { kind: 'cave', depth: d }).blocks.filter((b) => b === 'caveIron').length;
assert(ironAt(CAVE.maxDepth) > ironAt(1), 'le fer est plus abondant au fond qu\'à l\'entrée');

// Le diamant : absent du niveau 1, présent en profondeur, bien plus rare
// que le fer.
const diamondAt = (d) => new World(20260821, { kind: 'cave', depth: d }).blocks.filter((b) => b === 'caveDiamond').length;
assert(diamondAt(1) === 0, 'aucun diamant au niveau 1');
assert(diamondAt(2) > 0, `le diamant apparaît dès la profondeur 2 (${diamondAt(2)} filons)`);
assert(diamondAt(CAVE.maxDepth) > 0, `et au fond (${diamondAt(CAVE.maxDepth)} filons)`);
assert(diamondAt(CAVE.maxDepth) < ironAt(CAVE.maxDepth),
  `le diamant reste bien plus rare que le fer (${diamondAt(CAVE.maxDepth)} < ${ironAt(CAVE.maxDepth)})`);

// Le filon de diamant se mine à la pioche et lâche un diamant.
assert(BLOCK_DEFS.caveDiamond.breakable === true, 'le filon de diamant se casse');
assert(BLOCK_DEFS.caveDiamond.requiredTool === 'pickaxe', 'à la pioche');
assert(BLOCK_DEFS.caveDiamond.drop === 'diamond', 'et il lâche un diamant');
assert(ITEM_DEFS.diamond, 'le diamant existe comme objet d\'inventaire');
assert(new World(20260821, { kind: 'cave', depth: 1 }).merchantSpots.length === 2,
  'les deux marchands ont leur emplacement au niveau 1');
assert(new World(20260821, { kind: 'cave', depth: 3 }).merchantSpots.length === 0,
  'pas de marchand au niveau 3');

console.log('▶ Conditions de descente');
assert(canDescendTo(1, { mask: null, armor: null }, ITEM_DEFS).ok, 'le niveau 1 est accessible sans équipement');
const blocked = canDescendTo(2, { mask: null, armor: null }, ITEM_DEFS);
assert(!blocked.ok, 'sans équipement, on ne descend pas au niveau 2');
assert(blocked.missing.length === 2, 'les deux manques sont signalés (masque + protection)');
assert(canDescendTo(2, { mask: 'mask_cloth', armor: 'armor_leather' }, ITEM_DEFS).ok,
  'masque de toile + tenue de cuir → niveau 2');
assert(!canDescendTo(3, { mask: 'mask_cloth', armor: 'armor_leather' }, ITEM_DEFS).ok,
  'mais pas le niveau 3');
assert(!canDescendTo(3, { mask: 'mask_filter', armor: 'armor_leather' }, ITEM_DEFS).ok,
  'un bon masque ne suffit pas sans l\'armure assortie');
assert(canDescendTo(4, { mask: 'mask_filter', armor: 'armor_reinforced' }, ITEM_DEFS).ok,
  'filtre + renforcée → niveau 4');
assert(canDescendTo(CAVE.maxDepth, { mask: 'mask_sealed', armor: 'armor_full' }, ITEM_DEFS).ok,
  'équipement intégral → le fond de la grotte');

// ============================================================
//  MARCHANDS & NÉGOCIATION
// ============================================================
console.log('▶ Marchands : catalogue et coûts');
const merchantMod = await import('../js/merchant.js');
const {
  MERCHANTS, MERCHANT_GOODS, costOf, suggestedPrice, createMerchantState,
  merchantBriefing, parseMerchantReply, resolveItemId, extractLastNumber,
} = merchantMod;
const {
  accountMessage, merchantReply, merchantGreeting, isMerchantAvailable,
} = await import('../js/merchant-brain.js');
const { sanitize, interpretCommands, greetMerchant, buildSystemPrompt } =
  await import('../js/merchant-ai.js');

assert(Object.keys(MERCHANTS).length === 2, 'deux marchands');
const gaspard = MERCHANTS.gaspard;
const aldric = MERCHANTS.aldric;
assert(gaspard.slot === 'mask' && aldric.slot === 'armor', 'un marchand de masques, un marchand d\'armures');
for (const id of Object.keys(MERCHANT_GOODS)) {
  assert(MERCHANT_GOODS[id].production > 0 && MERCHANT_GOODS[id].transport > 0,
    `${id} : coût de production ET de transport définis`);
  assert(suggestedPrice(id, gaspard.margin) > costOf(id), `${id} : prix d'appel au-dessus du coût`);
  assert(ITEM_DEFS[id] && ITEM_DEFS[id].type === 'gear', `${id} : existe comme équipement`);
}
assert(ITEM_DEFS.mask_cloth.maxDepth < ITEM_DEFS.mask_sealed.maxDepth,
  'les paliers de masque donnent des profondeurs croissantes');
assert(ITEM_DEFS.armor_leather.maxDepth < ITEM_DEFS.armor_full.maxDepth,
  'les paliers d\'armure donnent des profondeurs croissantes');

const briefing = merchantBriefing(createMerchantState('gaspard', { day: 3, totalPlayers: 1 }), ITEM_DEFS);
assert(briefing.catalog.length === gaspard.items.length, 'le briefing liste tout le catalogue');
assert(briefing.catalog.every((c) => c.floor > c.cost), 'le prix plancher est au-dessus du coût');
assert(briefing.day === 3 && briefing.totalPlayers === 1, 'le briefing porte les stats du jour');

console.log('▶ Commandes du marchand');
const parsed = parseMerchantReply('Bonjour !\n/sell mask_filter 95\nAu plaisir.');
assert(parsed.commands.length === 1, 'une commande détectée');
assert(parsed.commands[0].type === 'sell', 'c\'est un /sell');
assert(parsed.commands[0].price === 95, 'le prix est extrait');
assert(!parsed.speech.includes('/sell'), 'la commande ne fuit pas dans la réplique');
assert(parsed.speech.includes('Bonjour'), 'le texte est conservé');
const kicked = parseMerchantReply('Dégage.\n/out');
assert(kicked.commands[0].type === 'out', '/out détecté');
assert(kicked.speech === 'Dégage.', 'la dernière réplique avant /out est conservée');
assert(parseMerchantReply('Rien de spécial ici.').commands.length === 0, 'pas de commande parasite');
assert(parseMerchantReply('/bidule 12').commands.length === 0, 'une commande inconnue est ignorée');

assert(extractLastNumber('je te propose 120 écus') === 120, 'extraction d\'un prix');
assert(extractLastNumber('100 ou 110 ?') === 110, 'on retient le dernier nombre');
assert(extractLastNumber('pas de chiffre') === null, 'aucun nombre → null');
assert(resolveItemId('masque à filtre', gaspard.items, ITEM_DEFS) === 'mask_filter',
  'résolution fuzzy : « masque à filtre »');
assert(resolveItemId('mask_sealed', gaspard.items, ITEM_DEFS) === 'mask_sealed', 'résolution par id exact');
assert(resolveItemId('le scellé', gaspard.items, ITEM_DEFS) === 'mask_sealed', 'résolution partielle');
assert(resolveItemId('armure', gaspard.items, ITEM_DEFS) === null,
  'un article hors catalogue ne résout pas chez le marchand de masques');

console.log('▶ Négociation (le marchand tient son rôle)');
function talk(state, message) {
  accountMessage(state, message);
  return merchantReply(state, merchantBriefing(state, ITEM_DEFS), message, ITEM_DEFS);
}
function plainText(text) {
  return text.split('\n').filter((l) => !l.trim().startsWith('/')).join(' ');
}
// Aucune trace de markdown ni de didascalie dans une réplique de marchand.
function assertInCharacter(text, label) {
  const speech = plainText(text);
  assert(!/[*_~`#>]/.test(speech), `${label} : aucun markdown`);
  assert(!/^\s*\(/m.test(speech), `${label} : aucune didascalie`);
  assert(speech.length > 0, `${label} : il dit quelque chose`);
}

let m = createMerchantState('gaspard', { day: 2, totalPlayers: 1 });
m.seed = 9137;
let r = talk(m, 'Bonjour !');
assertInCharacter(r.text, 'salutation');
r = talk(m, 'Tu vends quoi ?');
assert(r.text.includes('/sell'), 'il propose un article chiffré');
assertInCharacter(r.text, 'catalogue');
r = talk(m, 'Comment c\'est fabriqué ?');
assertInCharacter(r.text, 'question sur la fabrication');
assert(/hors de l|ailleurs|pas les détails|atelier/i.test(plainText(r.text)),
  'il avoue ne pas connaître la fabrication (faite hors de l\'île)');

m = createMerchantState('gaspard', { day: 1, totalPlayers: 1 });
m.seed = 9137;
talk(m, 'Bonjour');
r = talk(m, 'Je veux le masque à filtre');
const firstOffer = parseMerchantReply(r.text).commands[0];
assert(firstOffer && firstOffer.type === 'sell', 'il annonce le masque à filtre');
assert(firstOffer.price === suggestedPrice('mask_filter', gaspard.margin), 'au prix d\'appel');

// Marchandage : une offre basse est refusée, jamais sous le plancher.
const floorPrice = Math.round(costOf('mask_filter') * (1 + gaspard.minMargin));
let refused = 0;
let accepted = null;
for (let i = 0; i < 12 && !accepted; i++) {
  const rr = talk(m, `Je t'en donne ${Math.max(5, floorPrice - 20 + i * 4)}.`);
  const cmds = parseMerchantReply(rr.text).commands;
  const sell = cmds.find((c) => c.type === 'sell');
  if (sell) assert(sell.price >= floorPrice, `contre-proposition ${sell.price} ≥ plancher ${floorPrice}`);
  if (cmds.some((c) => c.type === 'out')) break;
  if (floorPrice - 20 + i * 4 >= (m.currentPrice || 0)) accepted = sell;
  else refused++;
}
assert(refused > 0, 'il refuse au moins une offre trop basse');

// Une offre au-dessus de son prix est acceptée telle quelle.
m = createMerchantState('gaspard', { day: 1, totalPlayers: 1 });
m.seed = 9137;
talk(m, 'Bonjour');
talk(m, 'Le masque à filtre, il me le faut');
const his = m.currentPrice;
r = talk(m, `OK je le prends à ${his + 10}.`);
const deal = parseMerchantReply(r.text).commands.find((c) => c.type === 'sell');
assert(deal && deal.price === his + 10, 'une offre au-dessus du prix est acceptée telle quelle');
assertInCharacter(r.text, 'acceptation');

// « C'est combien ? » sur l'article en discussion : le marchand REPROPOSE
// son offre (sinon le bouton d'achat disparaissait quand on parlait prix).
m = createMerchantState('gaspard', { day: 1, totalPlayers: 1 });
m.seed = 9137;
talk(m, 'Bonjour');
talk(m, 'Je veux le masque à filtre');
r = talk(m, 'Elle est à combien ?');
let priceAskSell = parseMerchantReply(r.text).commands.find((c) => c.type === 'sell');
assert(priceAskSell && priceAskSell.type === 'sell',
  '« c\'est combien ? » fait (re)sortir une proposition chiffrée');
assert(priceAskSell.price === m.currentPrice, 'au prix courant du marchand');

// Une offre indécente essuie un refus, mais le marchand garde sa
// proposition en table : le bouton d'achat ne disparaît pas sous
// prétexte qu'il a refusé le prix DU JOUEUR.
r = talk(m, 'Je t\'en donne 5 écus, ça marche ?');
let refuseSell = parseMerchantReply(r.text).commands.find((c) => c.type === 'sell');
assert(refuseSell, 'même un refus de marchander laisse l\'offre affichée');
assert(refuseSell.price >= Math.round(costOf('mask_filter') * (1 + gaspard.minMargin)),
  'et le prix affiché ne descend jamais sous le plancher');

// BUG : un accord se concluait en /out quand ce message épuisait la
// dernière patience. « D'accord je prends » doit honorer l'affaire.
m = createMerchantState('aldric', { day: 1, totalPlayers: 1 });
m.seed = 4421;
talk(m, 'Bonjour');
talk(m, 'Je veux l\'armure intégrale');
// Plus qu'une unité de patience : le message d'accord va l'épuiser,
// et c'est justement lui qui doit conclure (pas mettre dehors).
m.patienceLeft = 1;
r = talk(m, 'D\'accord je prends');
const accords = parseMerchantReply(r.text).commands;
assert(accords.some((c) => c.type === 'sell'),
  '« d\'accord je prends » conclut la vente (jamais /out) même à court de patience');
assert(!accords.some((c) => c.type === 'out'),
  'un client qui accepte l\'offre n\'est jamais mis à la porte');

// Un joueur odieux finit dehors.
m = createMerchantState('aldric', { day: 1, totalPlayers: 1 });
m.seed = 4421;
let outAt = -1;
for (let i = 0; i < 10; i++) {
  const rr = talk(m, "T'es qu'un escroc, ton stuff est pourri.");
  if (parseMerchantReply(rr.text).commands.some((c) => c.type === 'out')) { outAt = i; break; }
}
assert(outAt >= 0, 'à force d\'insultes, Aldric met le joueur dehors (/out)');
assert(outAt <= 5, `et il ne se laisse pas faire longtemps (au message ${outAt + 1})`);
assert(!isMerchantAvailable(m), 'il n\'est plus disponible ensuite');
assert(MERCHANTS.aldric.cooldown === 45, 'le refroidissement est bien de 45 secondes');

// BUG (retour joueur) : « quand on parle à Aldric, il met jamais d'achat ».
// 1) L'ouverture du comptoir DOIT poser une proposition sur la table,
//    comme Gaspard — le cas spécial Aldric l'en empêchait.
m = createMerchantState('aldric', { day: 1, totalPlayers: 1 });
m.seed = 4421;
r = merchantGreeting(m, merchantBriefing(m, ITEM_DEFS), ITEM_DEFS);
assert(parseMerchantReply(r.text).commands.some((c) => c.type === 'sell'),
  'Aldric propose un article dès l\'ouverture du comptoir');
// 2) Une conversation d'achat ordinaire doit conclure, jamais finir dehors.
m = createMerchantState('aldric', { day: 1, totalPlayers: 1 });
m.seed = 4421;
let kickedDuringSale = false;
let offeredDuringSale = false;
for (const line of ['bonjour', 'tu vends quoi ?', 'la moins chère',
  'c\'est combien ?', 'ok je la prends']) {
  r = talk(m, line);
  const cmds = parseMerchantReply(r.text).commands;
  if (cmds.some((c) => c.type === 'sell')) offeredDuringSale = true;
  if (cmds.some((c) => c.type === 'out')) { kickedDuringSale = true; break; }
}
assert(!kickedDuringSale, 'un client qui discute puis accepte n\'est jamais mis dehors');
assert(offeredDuringSale, 'et une proposition chiffrée est bien passée sur la table');
// 3) Les questions d'information n'usent pas la patience : on ne peut
//    plus être jeté dehors pour avoir demandé combien ça coûte.
m = createMerchantState('aldric', { day: 1, totalPlayers: 1 });
const patienceBefore = m.patienceLeft;
for (const q of ['bonjour', 'tu vends quoi', 'c\'est fait où ?',
  'jusqu\'où ça tient ?', 'c\'est combien ?']) talk(m, q);
assert(m.patienceLeft === patienceBefore,
  'poser des questions (prix, catalogue, origine) n\'use pas la patience');
// 4) « C'est combien ? » sans article nommé propose quand même l'entrée
//    de gamme — avant, la réponse n'affichait rien de cliquable.
m = createMerchantState('aldric', { day: 1, totalPlayers: 1 });
m.seed = 4421;
r = talk(m, 'c\'est combien ?');
const entryOffer = parseMerchantReply(r.text).commands.find((c) => c.type === 'sell');
assert(entryOffer && entryOffer.price === suggestedPrice('armor_leather', aldric.margin),
  '« c\'est combien ? » sans article → l\'entrée de gamme est proposée');
assert(m.discussing === 'armor_leather' && m.currentPrice === entryOffer.price,
  'et la négociation est armée sur cet article');
// 5) « je prends la renforcée » conclut sur la RENFORCÉE, pas sur
//    l'article resté en discussion du message précédent.
m = createMerchantState('aldric', { day: 1, totalPlayers: 1 });
m.seed = 4421;
talk(m, 'c\'est combien ?');               // table : entrée de gamme
r = talk(m, 'je prends la renforcée');
const switched = parseMerchantReply(r.text).commands.find((c) => c.type === 'sell');
assert(switched && switched.rawItem !== '' && m.discussing === 'armor_reinforced',
  '« je prends la renforcée » bascule la vente sur la renforcée');

console.log('\n▶ L\'accueil du comptoir passe par l\'IA (repli local sinon)');
{
  const savedFetch = globalThis.fetch;
  try {
    // a) Sans serveur IA : l'accueil local porte l'offre d'ouverture et
    //    n'use aucune patience (il ne passe PAS par accountMessage).
    globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
    m = createMerchantState('aldric', { day: 1, totalPlayers: 1 });
    let gr = await greetMerchant(m, ITEM_DEFS, 0);
    assert(gr.source === 'local', 'sans serveur IA, l\'accueil vient du cerveau local');
    assert(parseMerchantReply(gr.text).commands.some((c) => c.type === 'sell'),
      'l\'accueil local ouvre avec une offre /sell');
    assert(m.patienceLeft === MERCHANTS.aldric.patience,
      'l\'accueil n\'use aucune patience');

    // b) L'IA est configurée : sa réplique d'ouverture est utilisée, la
    //    consigne d'ouverture est dans la requête, et si elle salue sans
    //    /sell l'offre d'ouverture est adjointe à sa réplique.
    let seenBody = null;
    globalThis.fetch = async (url, opts) => {
      seenBody = JSON.parse(opts.body);
      return {
        ok: true,
        json: async () => ({
          ok: true, source: 'cloud',
          text: 'Aldric. Approchez. La cuir tient jusqu à la profondeur 12.',
        }),
      };
    };
    m = createMerchantState('aldric', { day: 1, totalPlayers: 1 });
    gr = await greetMerchant(m, ITEM_DEFS, 0);
    assert(gr.source === 'cloud', 'l\'accueil vient de l\'IA quand elle est configurée');
    assert(seenBody && seenBody.greeting === true
      && seenBody.system.includes('OUVERTURE'),
      'la requête d\'accueil porte la consigne d\'ouverture');
    let sellCmd = parseMerchantReply(gr.text).commands.find((c) => c.type === 'sell');
    assert(sellCmd && sellCmd.rawItem === 'armor_leather'
      && sellCmd.price === suggestedPrice('armor_leather', aldric.margin),
      'l\'IA qui salue sans /sell reçoit quand même l\'offre d\'ouverture');

    // c) L'IA propose elle-même : son /sell passe tel quel, on n'y touche pas.
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        ok: true, source: 'cloud',
        text: 'La renforcée, pour le milieu. /sell armor_reinforced 170',
      }),
    });
    m = createMerchantState('aldric', { day: 1, totalPlayers: 1 });
    gr = await greetMerchant(m, ITEM_DEFS, 0);
    const cmdsAi = parseMerchantReply(gr.text).commands;
    assert(cmdsAi.length === 1 && cmdsAi[0].type === 'sell'
      && cmdsAi[0].rawItem === 'armor_reinforced' && cmdsAi[0].price === 170,
      'l\'offre d\'ouverture de l\'IA passe telle quelle');

    // d) Et la consigne d'ouverture n'existe que pour l'accueil.
    assert(!buildSystemPrompt(merchantBriefing(m, ITEM_DEFS)).includes('OUVERTURE'),
      'la consigne d\'ouverture n\'envahit pas les tours de parole');
  } finally {
    if (savedFetch === undefined) delete globalThis.fetch; else globalThis.fetch = savedFetch;
  }
}


console.log('\n▶ Le monsieur en costume');
const { IntroSequence, INTRO_LINES, INTRO_SPEECH, GRANT_LINE_INDEX, INTRO_STORAGE_KEY } =
  await import('../js/intro.js');
{
  // La phrase demandée, caractère pour caractère.
  const expected = 'Bonjour et Bienvenue a Avania Monsieu. '
    + 'Voici de l\'argents, ici l\'argent sert de monnaie meme si le troc reste possible. '
    + 'A la fin de cette aventure la personne avec le plus d\'argents gagnera. '
    + 'Bonne chance';
  assert(INTRO_SPEECH === expected, 'la réplique est exactement celle demandée');
  assert(INTRO_LINES.join(' ') === INTRO_SPEECH, 'le découpage en répliques ne modifie aucun caractère');
  assert(INTRO_LINES.length === 4, `4 temps de parole (${INTRO_LINES.length})`);
  assert(/Voici de l'argents/.test(INTRO_LINES[GRANT_LINE_INDEX]),
    'l\'argent est remis sur la réplique qui l\'annonce');
  assert(GRANT_LINE_INDEX === 1, 'et non sur la salutation');
  assert(INTRO_STORAGE_KEY === 'avania.intro.v1', 'l\'intro est mémorisée sous sa clé');

  // --- Harnais sans navigateur -------------------------------------------
  const store = new Map();
  const savedWindow = globalThis.window;
  const savedLS = globalThis.localStorage;
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  };
  try {
    const makeGame = () => {
      const g = {
        player: { x: 64 * TILE, y: 64 * TILE, facing: 'right' },
        npcs: [],
        cutscene: false,
        cutsceneCalls: [],
        notes: [],
        addNpc(n) { g.npcs.push(n); },
        removeNpc(n) { const i = g.npcs.indexOf(n); if (i >= 0) g.npcs.splice(i, 1); },
        setCutscene(v) { g.cutscene = v; g.cutsceneCalls.push(v); },
        notify(t) { g.notes.push(t); },
      };
      return g;
    };

    // 1) Déroulé complet.
    const game = makeGame();
    // Bourse avec stockage (bouchonné ci-dessus) : c'est là que vit le
    // drapeau « somme déjà versée ».
    const purse = new Wallet();
    assert(!IntroSequence.alreadySeen(), 'l\'intro n\'a jamais été vue');
    const intro = new IntroSequence(game, purse);
    intro.start();
    assert(game.cutscene === true, 'le joueur est bloqué dès le début de la scène');
    assert(game.npcs.length === 1, 'le représentant entre en scène');
    assert(intro.npc.x < game.player.x, 'il arrive de la gauche, hors de portée');

    // Il marche jusqu'au joueur.
    let guard = 0;
    while (intro.phase === 'enter' && guard++ < 2000) intro.update(1 / 60);
    assert(intro.phase === 'talk', 'il s\'arrête pour parler');
    assert(Math.abs(intro.npc.x - (game.player.x - 44)) < 1, 'à distance de conversation');

    // On lui fait dire toute sa phrase.
    guard = 0;
    while (intro.phase === 'talk' && guard++ < 5000) {
      intro.typed = intro._currentLine().length;   // texte instantané
      intro.advance();
    }
    assert(intro.phase === 'leave', 'puis il s\'en va');
    assert(game.cutscene === true, 'et le joueur reste bloqué pendant son départ');
    assert(purse.money === CURRENCY.startingGrant, 'la somme de bienvenue a été remise');
    assert(game.notes.length === 1, 'le versement est annoncé au joueur');

    guard = 0;
    while (intro.active && guard++ < 5000) intro.update(1 / 60);
    assert(!intro.active, 'la scène se termine');
    assert(game.cutscene === false, 'le joueur retrouve le contrôle une fois le monsieur parti');
    assert(game.npcs.length === 0, 'le représentant a quitté la carte');
    assert(game.cutsceneCalls.join(',') === 'true,false', 'aucun état intermédiaire parasite');
    assert(IntroSequence.alreadySeen(), 'l\'intro ne sera pas rejouée');

    // 2) Rejouer la scène ne redonne pas d'argent.
    const game2 = makeGame();
    const replay = new IntroSequence(game2, purse);
    replay.start();
    replay.skip();
    assert(purse.money === CURRENCY.startingGrant, 'la somme n\'est versée qu\'une seule fois');
    let g2 = 0;
    while (replay.active && g2++ < 5000) replay.update(1 / 60);
    assert(game2.cutscene === false, 'un skip libère aussi le joueur');

    // 3) Sauter la scène dès le début ne bloque personne.
    const game3 = makeGame();
    const purse3 = new Wallet();
    const skipped = new IntroSequence(game3, purse3);
    skipped.start();
    skipped.skip();
    assert(purse3.money === CURRENCY.startingGrant, 'l\'argent est quand même remis si on passe la scène');
    let g3 = 0;
    while (skipped.active && g3++ < 5000) skipped.update(1 / 60);
    assert(game3.cutscene === false && game3.npcs.length === 0,
      'aucun blocage ni PNJ fantôme après un skip');
  } finally {
    if (savedWindow === undefined) delete globalThis.window; else globalThis.window = savedWindow;
    if (savedLS === undefined) delete globalThis.localStorage; else globalThis.localStorage = savedLS;
  }
}


console.log('\n▶ Non-régressions (bugs trouvés par le test navigateur)');
{
  // 1) sanitize() ne doit pas manger les identifiants des commandes.
  //    « /sell mask_cloth 42 » devenait « /sell maskcloth 42 » : le
  //    souligné partait avec le markdown, l'offre n'arrivait jamais.
  const { sanitize, interpretCommands } = await import('../js/merchant-ai.js');
  const cleaned = sanitize('Tiens, le voilà. **Prends-le.**\n/sell mask_cloth 42');
  assert(cleaned.includes('/sell mask_cloth 42'),
    'sanitize préserve la commande /sell intacte');
  assert(!/[*_#`>~]/.test(cleaned.split('\n')[0]), 'et nettoie bien le markdown de la prose');
  assert(sanitize('rien à signaler').includes('rien à signaler'), 'la prose ordinaire passe');
  assert(sanitize('*soupir* bonjour\n/out').endsWith('/out'), '/out survit aussi');

  const st = createMerchantState('gaspard', { day: 1, totalPlayers: 1 });
  const afterSanitize = interpretCommands({ text: cleaned }, st, ITEM_DEFS);
  assert(afterSanitize.offer && afterSanitize.offer.item === 'mask_cloth',
    'une réponse nettoyée produit toujours une offre exploitable');
  assert(afterSanitize.offer.price === 42, 'au bon prix');

  // 1b) Un modèle colle parfois /sell en fin de phrase ou derrière un
  //     tiret, pas en début de ligne : l'offre devait quand même sortir.
  const inline = parseMerchantReply('C\'est à prendre ou à laisser. /sell mask_filter 120');
  assert(inline.commands.length === 1 && inline.commands[0].type === 'sell'
    && inline.commands[0].price === 120,
    'un /sell en cours de ligne est détecté');
  assert(inline.speech.includes('prendre ou à laisser'), 'et la prose reste');
  const dashed = parseMerchantReply('- /sell mask_filter 120');
  assert(dashed.commands.length === 1, 'un /sell précédé d\'un tiret est détecté');

  // 1c) Repli IA : une annonce de prix SANS commande /sell (source cloud)
  //     doit quand même produire les boutons d'achat.
  const stAi = createMerchantState('gaspard', { day: 1, totalPlayers: 1 });
  const prose = interpretCommands(
    { text: 'Le masque à filtre, je te le laisse à 120 écus.', source: 'cloud' },
    stAi, ITEM_DEFS);
  assert(prose.offer && prose.offer.item === 'mask_filter' && prose.offer.price === 120,
    'l\'IA qui annonce un prix en prose fait apparaître l\'offre');
  // Mais le cerveau local, qui émet toujours /sell, ne déclenche pas ce repli.
  const stLocal = createMerchantState('gaspard', { day: 1, totalPlayers: 1 });
  const local = interpretCommands(
    { text: 'La traversée me coûte déjà 18 écus.', source: 'local' },
    stLocal, ITEM_DEFS);
  assert(local.offer === null, 'le repli prose est réservé au mode IA');

  // 2) Le vocabulaire du joueur, pas seulement les libellés du marchand.
  //    « ta meilleure protection » ne correspondait à rien chez Aldric
  //    (« Tenue / Armure de minage ») : il ne proposait jamais rien.
  const { itemMatchScore } = await import('../js/merchant.js');
  const armors = MERCHANTS.aldric.items;
  const bestArmor = (t) => armors
    .map((id) => [id, itemMatchScore(t, id, ITEM_DEFS)])
    .sort((a, b) => b[1] - a[1])[0];
  assert(bestArmor('il me faut ta meilleure protection')[0] === 'armor_full',
    '« ta meilleure protection » → l\'armure intégrale');
  assert(bestArmor('une protection entiere de minage')[0] === 'armor_full',
    '« protection entière de minage » → l\'armure intégrale');
  assert(bestArmor('une tenue de cuir')[0] === 'armor_leather',
    '« tenue de cuir » → la tenue de cuir');
  const masks = MERCHANTS.gaspard.items;
  const bestMask = (t) => masks
    .map((id) => [id, itemMatchScore(t, id, ITEM_DEFS)])
    .sort((a, b) => b[1] - a[1])[0];
  assert(bestMask('le masque à filtre')[0] === 'mask_filter',
    '« masque à filtre » → le masque à filtre (pas le premier du catalogue)');
  assert(bestMask('ton meilleur masque')[0] === 'mask_sealed',
    '« ton meilleur masque » → le haut de gamme');
  assert(bestMask('un masque de toile')[0] === 'mask_cloth',
    '« masque de toile » → l\'entrée de gamme');
  assert(itemMatchScore('je vends des patates', 'mask_cloth', ITEM_DEFS) === 0,
    'un propos hors catalogue ne correspond à rien');

  // 2b) Objets au sol partagés (butin de PvP) : netId + objet valide
  //     exigés, compteurs et vitesses bornés, liste plafonnée.
  const { sanitizeDropInfo, sanitizeDropList } = await import('../js/net-protocol.js');
  const okDrop = sanitizeDropInfo({ netId: '3-7-abc', item: 'wood', count: 3, x: 100, y: 200, vx: -50, vy: 9999 });
  assert(okDrop && okDrop.netId === '3-7-abc' && okDrop.count === 3 && okDrop.vy === 600,
    'un drop valide passe (vitesse bornée)');
  assert(sanitizeDropInfo({ netId: '', item: 'wood', count: 1 }) === null,
    'un drop sans netId est refusé');
  assert(sanitizeDropInfo({ netId: 'x', item: 'objet-inconnu-du-jeu', count: 1 }) !== null,
    'le protocole reste ignorant du catalogue (le filtre vit côté jeu)');
  assert(sanitizeDropInfo({ netId: 'x', item: 42, count: 1 }) === null
    && sanitizeDropInfo({ netId: 'x'.repeat(64), item: 'wood', count: 1 }) === null,
    'un drop sans objet texte ou au netId trop long est refusé');
  assert(sanitizeDropList(Array.from({ length: 30 }, (_, i) => ({
    netId: `n${i}`, item: 'wood', count: 1,
  }))).length === 16, 'une rafale de drops est plafonnée par message');

  // 3) Les marchands attendent sur le parvis, pas seulement sous terre.
  //    world.merchantSpots n'était renseigné que pour la grotte : à la
  //    surface, personne ne venait jamais.
  const surface = new World(20260821);
  assert(Array.isArray(surface.merchantSpots) && surface.merchantSpots.length === 2,
    'la surface réserve deux emplacements de marchand');
  const cave1 = new World(20260821, { kind: 'cave', depth: 1 });
  assert(cave1.merchantSpots.length === 2, 'le hall du niveau 1 aussi');
  assert(new World(20260821, { kind: 'cave', depth: 4 }).merchantSpots.length === 0,
    'mais pas les niveaux profonds');
  const standX = CAVE.entrance.tx * TILE + 16;
  const standY = (CAVE.entrance.ty + 1) * TILE + 16;
  for (const spot of surface.merchantSpots) {
    const d = Math.hypot(spot.x - standX, spot.y - standY);
    assert(d < 6 * TILE, `un marchand se tient près de l'arche (${Math.round(d / TILE)} tuiles)`);
    assert(d > TILE, 'mais pas sur le joueur');
    assert(spot.facing === 'left' || spot.facing === 'right', 'et il regarde vers l\'entrée');
  }
}


console.log('\n▶ Réplique venue de Mistral (bout en bout côté client)');
{
  // Ce que renvoie réellement le relais quand une clé Mistral est
  // configurée : de la prose parfois markdown, et la commande sur sa
  // propre ligne. C'est le chemin « cloud » de askMerchant.
  const { sanitize, interpretCommands } = await import('../js/merchant-ai.js');
  const mistralReply = '**Bien sûr que je peux te le faire !**\n'
    + '*Il sourit en essuyant le masque.*\n'
    + 'Le masque scellé, étanche, réserve d\'air comprise. Fabriqué hors de\n'
    + 'l\'île, et la traversée me coûte cher — mais pour toi, 263 écus.\n'
    + '/sell mask_sealed 263';
  const cleaned = sanitize(mistralReply);
  assert(!/[*_#`>~]/.test(cleaned.split('\n').slice(0, -1).join('\n')),
    'le markdown de la prose est retiré');
  assert(!/Il sourit/.test(cleaned), 'la didascalie *entre astérisques* est retirée');
  assert(/Bien sûr que je peux te le faire/.test(cleaned),
    'mais le **gras** d\'insistance garde ses mots');
  assert(/263 écus/.test(cleaned), 'la réplique reste intacte et lisible');
  assert(cleaned.includes('/sell mask_sealed 263'), 'la commande survit au nettoyage');

  const st = createMerchantState('gaspard', { day: 4, totalPlayers: 1 });
  const parsed = interpretCommands({ text: cleaned }, st, ITEM_DEFS);
  assert(parsed.offer && parsed.offer.item === 'mask_sealed',
    'l\'offre est reconnue (article)');
  assert(parsed.offer.price === 263, 'et chiffrée (au-dessus du plancher, donc non écrêtée)');
  assert(!parsed.speech.includes('/sell'), 'la commande ne s\'affiche pas au joueur');
  assert(!/\b(IA|intelligence artificielle)\b/i.test(parsed.speech),
    'rien ne trahit un modèle derrière le marchand');
  // Le prix ne peut pas passer sous le plancher du marchand, même si le
  // modèle propose n'importe quoi.
  const { MERCHANTS, merchantBriefing } = await import('../js/merchant.js');
  const floor = merchantBriefing(st, ITEM_DEFS).catalog
    .find((c) => c.id === 'mask_sealed').floor;
  const absurd = interpretCommands({ text: 'Tiens.\n/sell mask_sealed 3' }, st, ITEM_DEFS);
  assert(absurd.offer.price >= floor,
    `un prix absurde du modèle est ramené au plancher (${absurd.offer.price} ≥ ${floor})`);
  assert(MERCHANTS.gaspard.cooldown === 45, 'le /out garde ses 45 secondes');
}

console.log(failures === 0 ? '\n✅ Tous les tests passent' : `\n❌ ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
