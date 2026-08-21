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

  // --- ressources naturelles (objets à casser) ---
  tree: {
    id: 'tree', label: 'Arbre', kind: 'object', solid: true, breakable: true,
    drop: 'wood', color: '#4f9337', requiredTool: 'axe', breakTime: 0.9,
  },
  rock: {
    id: 'rock', label: 'Rocher', kind: 'object', solid: true, breakable: true,
    drop: 'stone', color: '#8d8d94', requiredTool: 'pickaxe', breakTime: 1.25,
  },

  // --- blocs constructibles (posés puis cassables) ---
  wood:  { id: 'wood',  label: 'Bois',   kind: 'block', solid: true, breakable: true, drop: 'wood',  color: '#b07a3c', requiredTool: 'axe', breakTime: 0.9 },
  stone: { id: 'stone', label: 'Pierre', kind: 'block', solid: true, breakable: true, drop: 'stone', color: '#9a9aa3', requiredTool: 'pickaxe', breakTime: 1.25 },

  // --- blocs fabriqués ---
  plank:  { id: 'plank',  label: 'Planche', kind: 'block', solid: true, breakable: true, drop: 'plank',  color: '#c89a5e', requiredTool: 'axe', breakTime: 0.7 },
  brick:  { id: 'brick',  label: 'Brique',  kind: 'block', solid: true, breakable: true, drop: 'brick',  color: '#b4553f', requiredTool: 'pickaxe', breakTime: 1.05 },
  glass:  { id: 'glass',  label: 'Verre',   kind: 'block', solid: true, breakable: true, drop: 'glass',  color: '#bfe3ea', requiredTool: 'pickaxe', breakTime: 0.6 },

  // --- blocs de terrain (récoltés à la pelle, reposés) ---
  sandBlock: { id: 'sandBlock', label: 'Sable', kind: 'block', solid: true, breakable: true, drop: 'sand', color: '#e2c88a', requiredTool: 'shovel', breakTime: 0.5 },
  dirtBlock: { id: 'dirtBlock', label: 'Terre', kind: 'block', solid: true, breakable: true, drop: 'dirt', color: '#8a6a46', requiredTool: 'shovel', breakTime: 0.45 },
};

// Les objets que le joueur peut posséder. maxStack reprend le principe
// Minecraft : les matériaux s'empilent, un outil occupe sa propre case.
export const ITEM_DEFS = {
  wood:  { id: 'wood',  label: 'Bois brut', color: '#b07a3c', icon: '🪵', type: 'resource', maxStack: 64, place: 'wood' },
  stone: { id: 'stone', label: 'Pierre',    color: '#9a9aa3', icon: '🪨', type: 'resource', maxStack: 64, place: 'stone' },
  sand:  { id: 'sand',  label: 'Sable',     color: '#e2c88a', icon: '▪',  type: 'resource', maxStack: 64, place: 'sandBlock' },
  dirt:  { id: 'dirt',  label: 'Terre',     color: '#8a6a46', icon: '▪',  type: 'resource', maxStack: 64, place: 'dirtBlock' },
  plank: { id: 'plank', label: 'Planches',  color: '#c89a5e', icon: '▤',  type: 'material', maxStack: 64, place: 'plank' },
  brick: { id: 'brick', label: 'Briques',   color: '#b4553f', icon: '▦',  type: 'material', maxStack: 64, place: 'brick' },
  glass: { id: 'glass', label: 'Verre',     color: '#bfe3ea', icon: '◇',  type: 'material', maxStack: 64, place: 'glass' },
  stick: { id: 'stick', label: 'Bâtons',   color: '#c89a5e', icon: '╱',  type: 'material', maxStack: 64 },

  wooden_pickaxe: {
    id: 'wooden_pickaxe', label: 'Pioche en bois', color: '#b07a3c', icon: '⛏', type: 'tool', maxStack: 1,
    toolType: 'pickaxe', durability: 45, efficiency: 1.8,
  },
  stone_pickaxe: {
    id: 'stone_pickaxe', label: 'Pioche en pierre', color: '#9a9aa3', icon: '⛏', type: 'tool', maxStack: 1,
    toolType: 'pickaxe', durability: 110, efficiency: 2.8,
  },
  wooden_axe: {
    id: 'wooden_axe', label: 'Hache en bois', color: '#b07a3c', icon: '🪓', type: 'tool', maxStack: 1,
    toolType: 'axe', durability: 45, efficiency: 1.8,
  },
  stone_axe: {
    id: 'stone_axe', label: 'Hache en pierre', color: '#9a9aa3', icon: '🪓', type: 'tool', maxStack: 1,
    toolType: 'axe', durability: 110, efficiency: 2.8,
  },
  wooden_shovel: {
    id: 'wooden_shovel', label: 'Pelle en bois', color: '#b07a3c', icon: '⚒', type: 'tool', maxStack: 1,
    toolType: 'shovel', durability: 45, efficiency: 2.2,
  },
  stone_shovel: {
    id: 'stone_shovel', label: 'Pelle en pierre', color: '#9a9aa3', icon: '⚒', type: 'tool', maxStack: 1,
    toolType: 'shovel', durability: 110, efficiency: 3.2,
  },
  wooden_sword: {
    id: 'wooden_sword', label: 'Épée en bois', color: '#b07a3c', icon: '⚔', type: 'tool', maxStack: 1,
    toolType: 'sword', durability: 55, efficiency: 1,
  },
  stone_sword: {
    id: 'stone_sword', label: 'Épée en pierre', color: '#9a9aa3', icon: '⚔', type: 'tool', maxStack: 1,
    toolType: 'sword', durability: 130, efficiency: 1,
  },
};

// Cette liste historique alimente l'API simple et reste volontairement
// stable pour les anciennes sauvegardes / extensions. L'inventaire réel,
// lui, connaît tous les ITEM_DEFS ci-dessus.
export const ITEMS = ['wood', 'stone', 'sand', 'dirt', 'plank', 'brick', 'glass'];
export const ALL_ITEMS = Object.keys(ITEM_DEFS);
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
];

// Sols que l'on peut creuser à la pelle (clic gauche) pour récolter.
export const DIGGABLE_FLOOR = {
  sand: { drop: 'sand', becomes: 'dirt', tool: 'shovel', breakTime: 0.5 },
  dirt: { drop: 'dirt', becomes: 'grass', tool: 'shovel', breakTime: 0.45 },
};
