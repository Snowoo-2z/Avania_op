// ============================================================
//  AVANIA — Définition des blocs & objets du monde
//  Le monde est un bac à sable : on récupère des blocs (bois,
//  pierre…), on les stocke dans un inventaire et on construit.
// ============================================================

// Blocs "placés" (constructibles) + ressources naturelles + sols
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
  tree: { id: 'tree', label: 'Arbre',  kind: 'object', solid: true, breakable: true, drop: 'wood',  color: '#4f9337' },
  rock: { id: 'rock', label: 'Rocher', kind: 'object', solid: true, breakable: true, drop: 'stone', color: '#8d8d94' },

  // --- blocs constructibles (posés puis cassables) ---
  wood:  { id: 'wood',  label: 'Bois',   kind: 'block', solid: true, breakable: true, drop: 'wood',  color: '#b07a3c' },
  stone: { id: 'stone', label: 'Pierre', kind: 'block', solid: true, breakable: true, drop: 'stone', color: '#9a9aa3' },

  // --- blocs fabriqués ---
  plank:  { id: 'plank',  label: 'Planche', kind: 'block', solid: true, breakable: true, drop: 'plank',  color: '#c89a5e' },
  brick:  { id: 'brick',  label: 'Brique',  kind: 'block', solid: true, breakable: true, drop: 'brick',  color: '#b4553f' },
  glass:  { id: 'glass',  label: 'Verre',   kind: 'block', solid: true, breakable: true, drop: 'glass',  color: '#bfe3ea' },

  // --- blocs de terrain (récoltés à la pelle, reposés) ---
  sandBlock: { id: 'sandBlock', label: 'Sable', kind: 'block', solid: true, breakable: true, drop: 'sand', color: '#e2c88a' },
  dirtBlock: { id: 'dirtBlock', label: 'Terre', kind: 'block', solid: true, breakable: true, drop: 'dirt', color: '#8a6a46' },
};

// Les objets qu'on peut avoir dans l'inventaire
export const ITEM_DEFS = {
  wood:  { id: 'wood',  label: 'Bois',    color: '#b07a3c', place: 'wood' },
  stone: { id: 'stone', label: 'Pierre',  color: '#9a9aa3', place: 'stone' },
  sand:  { id: 'sand',  label: 'Sable',   color: '#e2c88a', place: 'sandBlock' },
  dirt:  { id: 'dirt',  label: 'Terre',   color: '#8a6a46', place: 'dirtBlock' },
  plank: { id: 'plank', label: 'Planche', color: '#c89a5e', place: 'plank' },
  brick: { id: 'brick', label: 'Brique',  color: '#b4553f', place: 'brick' },
  glass: { id: 'glass', label: 'Verre',   color: '#bfe3ea', place: 'glass' },
};

export const ITEMS = ['wood', 'stone', 'sand', 'dirt', 'plank', 'brick', 'glass'];

// --- Recettes de fabrication (simple : ressources -> blocs) ---
export const RECIPES = [
  { id: 'plank', out: 'plank', outN: 2, inputs: { wood: 1 } },
  { id: 'brick', out: 'brick', outN: 2, inputs: { stone: 1 } },
  { id: 'glass', out: 'glass', outN: 1, inputs: { sand: 2 } },
];

// Sols que l'on peut creuser à la pelle (clic gauche) pour récolter
export const DIGGABLE_FLOOR = {
  sand: { drop: 'sand', becomes: 'dirt' },
  dirt: { drop: 'dirt', becomes: 'grass' },
};
