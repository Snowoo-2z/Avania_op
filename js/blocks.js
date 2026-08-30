// ============================================================
//  AVANIA — Définition des blocs, objets & recettes
//  Les blocs sont posables dans le monde. Les objets vivent dans
//  l'inventaire, avec des piles et une durabilité pour les outils.
// ============================================================

// Blocs "placés" + ressources naturelles + sols.
// kind:
//   'floor'  -> sol de base (on marche dessus)
//   'block'  -> bloc plein posé dessus (obstacle, cassable)
//   'object' -> ressource naturelle (arbre, rocher) avec hauteur
export const BLOCK_DEFS = {
  // --- sols (variantes purement visuelles + eau) ---
  grass:     { id: 'grass',     label: 'Herbe',   kind: 'floor',  solid: false, breakable: false, drop: null,   color: '#7cae4e' },
  grassDark: { id: 'grassDark', label: 'Herbe',   kind: 'floor',  solid: false, breakable: false, drop: null,   color: '#6b9c42' },
  flowers:   { id: 'flowers',   label: 'Fleurs',  kind: 'floor',  solid: false, breakable: false, drop: null,   color: '#7cae4e' },
  dirt:      { id: 'dirt',      label: 'Terre',   kind: 'floor',  solid: false, breakable: false, drop: null,   color: '#8a6a46' },
  sand:      { id: 'sand',      label: 'Sable',   kind: 'floor',  solid: false, breakable: false, drop: null,   color: '#e2c88a' },
  water:     { id: 'water',     label: 'Eau',     kind: 'floor',  solid: true,  breakable: false, drop: null,   color: '#4a9fd8' },

  // --- sols de la grotte (dimension souterraine) ---
  // caveFloor : le sol praticable. caveWall : la roche massive qui
  // enserre les galeries — c'est un SOL solide (comme l'eau), pas un
  // bloc posé : des milliers de cases rendues par les chunks de sol,
  // donc gratuites, au lieu de milliers de cubes 2.5D.
  caveFloor: { id: 'caveFloor', label: 'Sol de grotte', kind: 'floor', solid: false, breakable: false, drop: null, color: '#4a4550' },
  caveWall:  { id: 'caveWall',  label: 'Roche',         kind: 'floor', solid: true,  breakable: false, drop: null, color: '#2b2730' },
  // La falaise qui affleure à la surface et abrite l'entrée de la grotte.
  rockFace:  { id: 'rockFace',  label: 'Falaise',       kind: 'floor', solid: true,  breakable: false, drop: null, color: '#6a6a72' },

  // --- ressources naturelles (objets à casser) ---
  tree: {
    id: 'tree', label: 'Arbre', kind: 'object', solid: true, breakable: true,
    drop: 'wood', dropN: 3, color: '#4f9337', requiredTool: 'axe', breakTime: 0.9,
  },
  rock: {
    id: 'rock', label: 'Rocher', kind: 'object', solid: true, breakable: true,
    drop: 'stone', color: '#8d8d94', requiredTool: 'pickaxe', breakTime: 2.2,
  },

  // --- blocs constructibles (posés puis cassables) ---
  wood:  { id: 'wood',  label: 'Bois',   kind: 'block', solid: true, breakable: true, drop: 'wood',  color: '#b07a3c', requiredTool: 'axe', breakTime: 0.9 },
  stone: { id: 'stone', label: 'Pierre', kind: 'block', solid: true, breakable: true, drop: 'stone', color: '#9a9aa3', requiredTool: 'pickaxe', breakTime: 2.2 },

  // --- blocs fabriqués ---
  plank:  { id: 'plank',  label: 'Planche', kind: 'block', solid: true, breakable: true, drop: 'plank',  color: '#c89a5e', requiredTool: 'axe', breakTime: 0.7 },
  brick:  { id: 'brick',  label: 'Brique',  kind: 'block', solid: true, breakable: true, drop: 'brick',  color: '#b4553f', requiredTool: 'pickaxe', breakTime: 1.05 },
  glass:  { id: 'glass',  label: 'Verre',   kind: 'block', solid: true, breakable: true, drop: 'glass',  color: '#bfe3ea', requiredTool: 'pickaxe', breakTime: 0.6 },

  // --- blocs de terrain (récoltés à la pelle, reposés) ---
  sandBlock: { id: 'sandBlock', label: 'Sable', kind: 'block', solid: true, breakable: true, drop: 'sand', color: '#e2c88a', requiredTool: 'shovel', breakTime: 0.5 },
  dirtBlock: { id: 'dirtBlock', label: 'Terre', kind: 'block', solid: true, breakable: true, drop: 'dirt', color: '#8a6a46', requiredTool: 'shovel', breakTime: 0.45 },

  // --- minerai de fer (ressource rare, pioche en pierre minimum) ---
  ironOre: {
    id: 'ironOre', label: 'Minerai de fer', kind: 'object', solid: true, breakable: true,
    drop: 'rawIron', dropN: 1, color: '#a08d80', requiredTool: 'pickaxe', minTier: 'stone', breakTime: 3.0,
  },

  // --- bloc de fer (compacte 9 lingots, posable) ---
  ironBlock: {
    id: 'ironBlock', label: 'Bloc de fer', kind: 'block', solid: true, breakable: true,
    drop: 'ironBlock', color: '#d8dde2', requiredTool: 'pickaxe', breakTime: 1.4,
  },

  // --- porte (s'ouvre / se ferme au clic droit) ---
  door: {
    id: 'door', label: 'Porte', kind: 'door', solid: true, breakable: true,
    drop: 'door', color: '#c89a5e', requiredTool: null, breakTime: 0.5,
  },

  // --- four (fond les minerais, cuit la viande) ---
  furnace: {
    id: 'furnace', label: 'Four', kind: 'block', solid: true, breakable: true,
    drop: 'furnace', color: '#5d5d62', requiredTool: 'pickaxe', breakTime: 2.0,
  },

  // --- coffre (rangement : clic droit pour ouvrir) ---
  chest: {
    id: 'chest', label: 'Coffre', kind: 'block', solid: true, breakable: true,
    drop: 'chest', color: '#8a5a2e', requiredTool: null, breakTime: 0.5,
  },

  // --- bloc de laine (4 laines → 1 bloc, comme Minecraft) ---
  woolBlock: {
    id: 'woolBlock', label: 'Bloc de laine', kind: 'block', solid: true, breakable: true,
    drop: 'woolBlock', color: '#e8e8e8', requiredTool: null, breakTime: 0.5,
  },

  // ------------------------------------------------------------
  //  La grotte : ses ressources et ses points de passage.
  //  Rien d'autre que de la pierre et du fer pour l'instant, mais
  //  avec un look bien à eux (voir js/tileset.js).
  // ------------------------------------------------------------
  caveStone: {
    id: 'caveStone', label: 'Pierre de grotte', kind: 'object', solid: true, breakable: true,
    drop: 'stone', dropN: 2, color: '#5f5a68', requiredTool: 'pickaxe', breakTime: 2.0,
  },
  caveIron: {
    id: 'caveIron', label: 'Filon de fer', kind: 'object', solid: true, breakable: true,
    drop: 'rawIron', dropN: 1, color: '#7a6a62', requiredTool: 'pickaxe', minTier: 'stone', breakTime: 3.2,
  },
  // Le diamant : beaucoup plus rare que le fer, et absent du niveau 1 —
  // il faut descendre à la profondeur 2 ou plus pour en croiser (js/cave.js).
  caveDiamond: {
    id: 'caveDiamond', label: 'Filon de diamant', kind: 'object', solid: true, breakable: true,
    drop: 'diamond', dropN: 1, color: '#3fbcd4', requiredTool: 'pickaxe', minTier: 'stone', breakTime: 4.0,
  },
  // L'entrée de la grotte, à la surface : un arche sombre. On y entre
  // avec la touche d'interaction — elle ne se casse pas.
  caveMouth: {
    id: 'caveMouth', label: 'Entrée de la grotte', kind: 'object', solid: true, breakable: false,
    drop: null, color: '#141018', requiredTool: null, breakTime: 0,
  },
  // Les puits qui relient les niveaux entre eux.
  caveLadderDown: {
    id: 'caveLadderDown', label: 'Puits descendant', kind: 'object', solid: true, breakable: false,
    drop: null, color: '#2a2430', requiredTool: null, breakTime: 0,
  },
  caveLadderUp: {
    id: 'caveLadderUp', label: 'Puits remontant', kind: 'object', solid: true, breakable: false,
    drop: null, color: '#3a3440', requiredTool: null, breakTime: 0,
  },
};

// Sols qui bloquent le passage. Déduit de BLOCK_DEFS une bonne fois :
// la collision ne fait plus de comparaison de chaînes en cascade.
export const SOLID_FLOOR = (() => {
  const set = new Set();
  for (const def of Object.values(BLOCK_DEFS)) {
    if (def.kind === 'floor' && def.solid) set.add(def.id);
  }
  return set;
})();

// Les objets que le joueur peut posséder. maxStack reprend le principe
// Minecraft : les matériaux s'empilent, un outil occupe sa propre case.
export const ITEM_DEFS = {
  wood:  { id: 'wood',  label: 'Bois brut', color: '#b07a3c', icon: 'wood', type: 'resource', maxStack: 64, place: 'wood' },
  stone: { id: 'stone', label: 'Pierre',    color: '#9a9aa3', icon: 'rock', type: 'resource', maxStack: 64, place: 'stone' },
  sand:  { id: 'sand',  label: 'Sable',     color: '#e2c88a', icon: '▪',  type: 'resource', maxStack: 64, place: 'sandBlock' },
  dirt:  { id: 'dirt',  label: 'Terre',     color: '#8a6a46', icon: '▪',  type: 'resource', maxStack: 64, place: 'dirtBlock' },
  rawIron: { id: 'rawIron', label: 'Fer brut', color: '#b0875f', type: 'resource', maxStack: 64 },
  diamond: { id: 'diamond', label: 'Diamant', color: '#59d8e8', type: 'resource', maxStack: 64 },
  ironIngot: { id: 'ironIngot', label: 'Lingot de fer', color: '#dfe4e8', type: 'material', maxStack: 64 },
  ironBlock: { id: 'ironBlock', label: 'Bloc de fer', color: '#d8dde2', type: 'material', maxStack: 64, place: 'ironBlock' },
  door: { id: 'door', label: 'Porte en bois', color: '#c89a5e', type: 'material', maxStack: 64, place: 'door' },
  furnace: { id: 'furnace', label: 'Four', color: '#5d5d62', type: 'material', maxStack: 64, place: 'furnace' },
  chest: { id: 'chest', label: 'Coffre', color: '#8a5a2e', type: 'material', maxStack: 64, place: 'chest' },
  wool: { id: 'wool', label: 'Laine', color: '#e8e8e8', type: 'resource', maxStack: 64 },
  woolBlock: { id: 'woolBlock', label: 'Bloc de laine', color: '#e8e8e8', type: 'material', maxStack: 64, place: 'woolBlock' },
  rawBeef: { id: 'rawBeef', label: 'Bœuf cru', color: '#c0504a', type: 'resource', maxStack: 64 },
  cookedBeef: { id: 'cookedBeef', label: 'Steak cuit', color: '#a4683c', type: 'resource', maxStack: 64 },
  plank: { id: 'plank', label: 'Planches',  color: '#c89a5e', icon: '▤',  type: 'material', maxStack: 64, place: 'plank' },
  brick: { id: 'brick', label: 'Briques',   color: '#b4553f', icon: '▦',  type: 'material', maxStack: 64, place: 'brick' },
  glass: { id: 'glass', label: 'Verre',     color: '#bfe3ea', icon: '◇',  type: 'material', maxStack: 64, place: 'glass' },
  stick: { id: 'stick', label: 'Bâtons',   color: '#c89a5e', icon: '╱',  type: 'material', maxStack: 64 },

  // La monnaie de l'île (js/economy.js). Les écus vivent DANS
  // l'inventaire, comme n'importe quel objet : une seule case, et le
  // nombre affiché est la somme. D'où un maxStack très au-dessus des 64
  // habituels — sinon 150 écus prendraient trois cases (64 + 64 + 22) et
  // il faudrait faire l'addition à la main pour connaître sa bourse.
  // Niposable, ni craftable, ni mangeable : pas de `place`, type dédié.
  coin: { id: 'coin', label: 'Écus', color: '#f2c14e', icon: 'coin', type: 'currency', maxStack: 999 },

  wooden_pickaxe: {
    id: 'wooden_pickaxe', label: 'Pioche en bois', color: '#b07a3c', icon: 'pickaxe', type: 'tool', maxStack: 1,
    toolType: 'pickaxe', tier: 'wood', durability: 45, efficiency: 1.8,
  },
  stone_pickaxe: {
    id: 'stone_pickaxe', label: 'Pioche en pierre', color: '#9a9aa3', icon: 'pickaxe', type: 'tool', maxStack: 1,
    toolType: 'pickaxe', tier: 'stone', durability: 110, efficiency: 2.8,
  },
  iron_pickaxe: {
    id: 'iron_pickaxe', label: 'Pioche en fer', color: '#d8dde2', icon: 'pickaxe', type: 'tool', maxStack: 1,
    toolType: 'pickaxe', tier: 'iron', durability: 250, efficiency: 5,
  },
  wooden_axe: {
    id: 'wooden_axe', label: 'Hache en bois', color: '#b07a3c', icon: 'axe', type: 'tool', maxStack: 1,
    toolType: 'axe', tier: 'wood', durability: 45, efficiency: 1.8,
  },
  stone_axe: {
    id: 'stone_axe', label: 'Hache en pierre', color: '#9a9aa3', icon: 'axe', type: 'tool', maxStack: 1,
    toolType: 'axe', tier: 'stone', durability: 110, efficiency: 2.8,
  },
  iron_axe: {
    id: 'iron_axe', label: 'Hache en fer', color: '#d8dde2', icon: 'axe', type: 'tool', maxStack: 1,
    toolType: 'axe', tier: 'iron', durability: 250, efficiency: 5,
  },
  wooden_shovel: {
    id: 'wooden_shovel', label: 'Pelle en bois', color: '#b07a3c', icon: 'shovel', type: 'tool', maxStack: 1,
    toolType: 'shovel', tier: 'wood', durability: 45, efficiency: 2.2,
  },
  stone_shovel: {
    id: 'stone_shovel', label: 'Pelle en pierre', color: '#9a9aa3', icon: 'shovel', type: 'tool', maxStack: 1,
    toolType: 'shovel', tier: 'stone', durability: 110, efficiency: 3.2,
  },
  iron_shovel: {
    id: 'iron_shovel', label: 'Pelle en fer', color: '#d8dde2', icon: 'shovel', type: 'tool', maxStack: 1,
    toolType: 'shovel', tier: 'iron', durability: 250, efficiency: 5,
  },
  wooden_sword: {
    id: 'wooden_sword', label: 'Épée en bois', color: '#b07a3c', icon: 'sword', type: 'tool', maxStack: 1,
    toolType: 'sword', tier: 'wood', durability: 55, efficiency: 1,
  },
  stone_sword: {
    id: 'stone_sword', label: 'Épée en pierre', color: '#9a9aa3', icon: 'sword', type: 'tool', maxStack: 1,
    toolType: 'sword', tier: 'stone', durability: 130, efficiency: 1,
  },
  iron_sword: {
    id: 'iron_sword', label: 'Épée en fer', color: '#d8dde2', icon: 'sword', type: 'tool', maxStack: 1,
    toolType: 'sword', tier: 'iron', durability: 250, efficiency: 1,
  },

  // ------------------------------------------------------------
  //  Équipement de la grotte (vendu par les marchands, jamais crafté)
  //
  //  Deux emplacements : le MASQUE (protection respiratoire) et
  //  l'ARMURE de minage (protection intégrale). Pour descendre à une
  //  profondeur donnée, il faut que les DEUX couvrent cette
  //  profondeur : plus on s'enfonce, plus l'air est rare et plus les
  //  éboulements sont violents.
  //
  //  miningBoost : bonus de vitesse de minage (le matériel adapté
  //  travaille mieux). maxDepth : profondeur maximale atteignable.
  // ------------------------------------------------------------
  mask_cloth: {
    id: 'mask_cloth', label: 'Masque de toile', color: '#cfc7b4', icon: 'mask',
    type: 'gear', gearSlot: 'mask', maxStack: 1, maxDepth: 2, miningBoost: 1.05,
    flavor: 'Un tissu épais, deux lanières. Filtre la poussière, pas grand-chose de plus.',
  },
  mask_filter: {
    id: 'mask_filter', label: 'Masque à filtre', color: '#8fa3ad', icon: 'mask',
    type: 'gear', gearSlot: 'mask', maxStack: 1, maxDepth: 4, miningBoost: 1.12,
    flavor: 'Cartouche interchangeable. L\'air reste respirable quand la roche chauffe.',
  },
  mask_sealed: {
    id: 'mask_sealed', label: 'Masque scellé', color: '#d8c46a', icon: 'mask',
    type: 'gear', gearSlot: 'mask', maxStack: 1, maxDepth: 99, miningBoost: 1.2,
    flavor: 'Joints étanches, réserve d\'air au dos. On descend sans compter.',
  },
  armor_leather: {
    id: 'armor_leather', label: 'Tenue de minage', color: '#8a5a34', icon: 'armor',
    type: 'gear', gearSlot: 'armor', maxStack: 1, maxDepth: 2, miningBoost: 1.05,
    flavor: 'Cuir huilé et genouillères. Ça encaisse les éclats.',
  },
  armor_reinforced: {
    id: 'armor_reinforced', label: 'Armure de minage renforcée', color: '#9aa3ab', icon: 'armor',
    type: 'gear', gearSlot: 'armor', maxStack: 1, maxDepth: 4, miningBoost: 1.12,
    flavor: 'Plaques d\'acier rivetées sur du cuir durci.',
  },
  armor_full: {
    id: 'armor_full', label: 'Armure de minage intégrale', color: '#d3dade', icon: 'armor',
    type: 'gear', gearSlot: 'armor', maxStack: 1, maxDepth: 99, miningBoost: 1.22,
    flavor: 'Protection complète, casque inclus. On traverse un éboulement.',
  },
};

// Emplacements d'équipement de la grotte.
export const GEAR_SLOTS = ['mask', 'armor'];

// L'équipement est-il utilisable ? Un objet « gear » s'équipe en le
// sélectionnant dans la barre rapide (pas d'interface dédiée : le jeu
// reste jouable au clavier comme à la souris).
export function isGear(itemId) {
  const def = ITEM_DEFS[itemId];
  return Boolean(def && def.type === 'gear');
}

// Ordre des niveaux d'outils. Un bloc avec `minTier` exige un outil d'au
// moins ce niveau (ex. le minerai de fer demande une pioche en pierre+).
export const TOOL_TIERS = ['wood', 'stone', 'iron'];

export function toolTierIndex(def) {
  return def && def.tier ? TOOL_TIERS.indexOf(def.tier) : 0;
}

export function blockMinTierIndex(blockId) {
  const def = blockId && BLOCK_DEFS[blockId];
  return def && def.minTier ? TOOL_TIERS.indexOf(def.minTier) : 0;
}

// Cette liste historique alimente l'API simple et reste volontairement
// stable pour les anciennes sauvegardes / extensions. L'inventaire réel,
// lui, connaît tous les ITEM_DEFS ci-dessus.
export const ITEMS = ['wood', 'stone', 'sand', 'dirt', 'plank', 'brick', 'glass'];
export const ALL_ITEMS = Object.keys(ITEM_DEFS);

// L'objet qui matérialise la monnaie dans l'inventaire (js/economy.js).
// Exporté pour que personne n'ait à écrire la chaîne 'coin' en dur.
export const MONEY_ITEM = 'coin';
export const HOTBAR_DEFAULTS = [...ITEMS, null, null];

// --- Recettes : ressources -> matériaux / outils ---
// pattern est la forme affichée dans la grille 3x3 façon Minecraft.
// inputs sert aussi à l'API craft(recipe), pratique pour les scripts.
export const RECIPES = [
  {
    id: 'plank', label: 'Planches', out: 'plank', outN: 2,
    inputs: { wood: 1 }, pattern: [['wood']], category: 'construction',
  },
  {
    id: 'brick', label: 'Briques', out: 'brick', outN: 2,
    inputs: { stone: 1 }, pattern: [['stone']], category: 'construction',
  },
  {
    id: 'glass', label: 'Verre', out: 'glass', outN: 1,
    inputs: { sand: 2 }, pattern: [['sand', 'sand']], category: 'construction',
  },
  {
    id: 'stick', label: 'Bâtons', out: 'stick', outN: 4,
    inputs: { plank: 2 }, pattern: [['plank'], ['plank']], category: 'matériaux',
  },
  {
    id: 'wooden_pickaxe', label: 'Pioche en bois', out: 'wooden_pickaxe', outN: 1,
    inputs: { plank: 3, stick: 2 }, pattern: [['plank', 'plank', 'plank'], [null, 'stick', null], [null, 'stick', null]], category: 'outils',
  },
  {
    id: 'stone_pickaxe', label: 'Pioche en pierre', out: 'stone_pickaxe', outN: 1,
    inputs: { stone: 3, stick: 2 }, pattern: [['stone', 'stone', 'stone'], [null, 'stick', null], [null, 'stick', null]], category: 'outils',
  },
  {
    id: 'wooden_axe', label: 'Hache en bois', out: 'wooden_axe', outN: 1,
    inputs: { plank: 3, stick: 2 }, pattern: [['plank', 'plank', null], ['plank', 'stick', null], [null, 'stick', null]], category: 'outils',
  },
  {
    id: 'stone_axe', label: 'Hache en pierre', out: 'stone_axe', outN: 1,
    inputs: { stone: 3, stick: 2 }, pattern: [['stone', 'stone', null], ['stone', 'stick', null], [null, 'stick', null]], category: 'outils',
  },
  {
    id: 'wooden_shovel', label: 'Pelle en bois', out: 'wooden_shovel', outN: 1,
    inputs: { plank: 1, stick: 2 }, pattern: [['plank'], ['stick'], ['stick']], category: 'outils',
  },
  {
    id: 'stone_shovel', label: 'Pelle en pierre', out: 'stone_shovel', outN: 1,
    inputs: { stone: 1, stick: 2 }, pattern: [['stone'], ['stick'], ['stick']], category: 'outils',
  },
  {
    id: 'wooden_sword', label: 'Épée en bois', out: 'wooden_sword', outN: 1,
    inputs: { plank: 2, stick: 1 }, pattern: [['plank'], ['plank'], ['stick']], category: 'outils',
  },
  {
    id: 'stone_sword', label: 'Épée en pierre', out: 'stone_sword', outN: 1,
    inputs: { stone: 2, stick: 1 }, pattern: [['stone'], ['stone'], ['stick']], category: 'outils',
  },
  {
    id: 'ironIngot', label: 'Lingot de fer', out: 'ironIngot', outN: 1,
    inputs: { rawIron: 1 }, pattern: [['rawIron']], category: 'matériaux',
  },
  {
    id: 'iron_pickaxe', label: 'Pioche en fer', out: 'iron_pickaxe', outN: 1,
    inputs: { ironIngot: 3, stick: 2 }, pattern: [['ironIngot', 'ironIngot', 'ironIngot'], [null, 'stick', null], [null, 'stick', null]], category: 'outils',
  },
  {
    id: 'iron_axe', label: 'Hache en fer', out: 'iron_axe', outN: 1,
    inputs: { ironIngot: 3, stick: 2 }, pattern: [['ironIngot', 'ironIngot', null], ['ironIngot', 'stick', null], [null, 'stick', null]], category: 'outils',
  },
  {
    id: 'iron_shovel', label: 'Pelle en fer', out: 'iron_shovel', outN: 1,
    inputs: { ironIngot: 1, stick: 2 }, pattern: [['ironIngot'], ['stick'], ['stick']], category: 'outils',
  },
  {
    id: 'iron_sword', label: 'Épée en fer', out: 'iron_sword', outN: 1,
    inputs: { ironIngot: 2, stick: 1 }, pattern: [['ironIngot'], ['ironIngot'], ['stick']], category: 'outils',
  },
  {
    id: 'ironBlock', label: 'Bloc de fer', out: 'ironBlock', outN: 1,
    inputs: { ironIngot: 9 }, pattern: [['ironIngot', 'ironIngot', 'ironIngot'], ['ironIngot', 'ironIngot', 'ironIngot'], ['ironIngot', 'ironIngot', 'ironIngot']], category: 'construction',
  },
  {
    id: 'door', label: 'Porte en bois', out: 'door', outN: 3,
    inputs: { plank: 6 }, pattern: [['plank', 'plank'], ['plank', 'plank'], ['plank', 'plank']], category: 'construction',
  },
  {
    id: 'furnace', label: 'Four', out: 'furnace', outN: 1,
    inputs: { stone: 8 }, pattern: [['stone', 'stone', 'stone'], ['stone', null, 'stone'], ['stone', 'stone', 'stone']], category: 'construction',
  },
  {
    id: 'woolBlock', label: 'Bloc de laine', out: 'woolBlock', outN: 1,
    inputs: { wool: 4 }, pattern: [['wool', 'wool'], ['wool', 'wool']], category: 'construction',
  },
  {
    id: 'chest', label: 'Coffre', out: 'chest', outN: 1,
    inputs: { plank: 8 }, pattern: [['plank', 'plank', 'plank'], ['plank', null, 'plank'], ['plank', 'plank', 'plank']], category: 'construction',
  },
];

// Sols que l'on peut creuser à la pelle (clic gauche) pour récolter.
export const DIGGABLE_FLOOR = {
  sand: { drop: 'sand', becomes: 'dirt', tool: 'shovel', breakTime: 0.5 },
  dirt: { drop: 'dirt', becomes: 'grass', tool: 'shovel', breakTime: 0.45 },
};
