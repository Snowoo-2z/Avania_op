// ============================================================
//  AVANIA — Test de fumée (logique pure, sans navigateur)
//  Vérifie : monde vide, ressources, casser/poser, inventaire.
// ============================================================

import { World } from '../js/world.js';
import { Player } from '../js/player.js';
import { Inventory } from '../js/inventory.js';
import { appearanceColors } from '../js/character.js';
import { TILE, BLOCK_EXTRUDE } from '../js/config.js';
import { BLOCK_DEFS, ITEM_DEFS } from '../js/blocks.js';
import { treeVariantAt, treeDropCount, treeBreakTime, TREE_VARIANTS } from '../js/tileset.js';

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
const floorSet = new Set(w1.floor);
const natural = ['grass', 'grassDark', 'flowers', 'dirt', 'sand', 'water'];
assert([...floorSet].every((f) => natural.includes(f)), 'sol = variantes naturelles uniquement (aucune construction)');

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
assert(w3.placeBlock(sandTx, sandTy, 'brick') === false, 'on ne pose pas sur un bloc occupé');

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
dist.beginDragDistribute('left');
for (let i = 0; i < 3; i++) dist.dragDistributeEnter(dist.slots, i);
assert(dist.endDragDistribute() === true, 'répartition au relâchement');
const shares = dist.slots.slice(0, 3).map((s) => s.count);
assert(shares.join(',') === '22,21,21', `répartition ceil : 22,21,21 (reçu ${shares.join(',')})`);
assert(dist.cursor === null, 'curseur vidé');

const distR = new Inventory();
distR.add('wood', 10);
const dr1 = distR.slots.findIndex((s) => s && s.id === 'wood');
distR.clickInventorySlot(dr1, 'left');
distR.beginDragDistribute('right');
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
assert(TOOL_TIERS.join(',') === 'wood,stone,iron', '3 niveaux d\'outils');
assert(toolTierIndex(ITEM_DEFS.wooden_pickaxe) === 0, 'bois = niveau 0');
assert(toolTierIndex(ITEM_DEFS.stone_pickaxe) === 1, 'pierre = niveau 1');
assert(toolTierIndex(ITEM_DEFS.iron_pickaxe) === 2, 'fer = niveau 2');
assert(blockMinTierIndex('ironOre') === 1, 'le fer demande la pierre');
assert(blockMinTierIndex('rock') === 0, 'la roche ne demande rien de plus');

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
const { MOB_DEFS, spawnMobs, updateMob, mobDrops } = await import('../js/mobs.js');
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
const woolBlockRecipe = RECIPES.find((r) => r.id === 'woolBlock');
const wInv = new Inventory();
wInv.add('wool', 4);
assert(wInv.craft(woolBlockRecipe) === true, '4 laines → 1 bloc de laine');

console.log('▶ Construction 3D');
assert(BLOCK_EXTRUDE >= 0, 'constante d\'extrusion définie');
assert(BLOCK_DEFS.wood.kind === 'block' && BLOCK_DEFS.glass.kind === 'block', 'bois et verre sont des blocs constructibles');

console.log('▶ Couleurs d\'apparence');
const cols = appearanceColors({ skin: 'ebene', hairColor: 'roux', eyes: 'violet', shirt: 'noir', pants: 'jean' });
assert(cols.skin === '#5e3b22', 'peau ébène');
assert(cols.hair === '#a3401f', 'cheveux roux');

console.log(failures === 0 ? '\n✅ Tous les tests passent' : `\n❌ ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
