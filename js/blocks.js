// ============================================================
//  AVANIA — Définition des blocs & objets du monde
//  Le monde est un bac à sable : on récupère des blocs (bois,
//  pierre…), on les stocke dans un inventaire et on construit.
// ============================================================

// Blocs "placés" (constructibles) + ressources naturelles
// kind:
//   'floor'  -> sol de base (on marche dessus)
//   'block'  -> bloc plein posé dessus (obstacle, cassable)
//   'object' -> ressource naturelle (arbre, rocher) avec hauteur
export const BLOCK_DEFS = {
  // --- sols ---
  grass: { id: 'grass', label: 'Herbe',  kind: 'floor',  solid: false, breakable: false, drop: null,  color: '#6faf4b' },
  water: { id: 'water', label: 'Eau',    kind: 'floor',  solid: true,  breakable: false, drop: null,  color: '#3d8fd1' },

  // --- ressources naturelles (objets à casser) ---
  tree: { id: 'tree', label: 'Arbre',    kind: 'object', solid: true,  breakable: true,  drop: 'wood', color: '#4f9337' },
  rock: { id: 'rock', label: 'Rocher',   kind: 'object', solid: true,  breakable: true,  drop: 'stone', color: '#8d8d94' },

  // --- blocs constructibles (posés puis cassables) ---
  wood:  { id: 'wood',  label: 'Bois',   kind: 'block', solid: true, breakable: true, drop: 'wood',  color: '#a8763e' },
  stone: { id: 'stone', label: 'Pierre', kind: 'block', solid: true, breakable: true, drop: 'stone', color: '#8d8d94' },
};

// Les objets qu'on peut avoir dans l'inventaire
export const ITEM_DEFS = {
  wood:  { id: 'wood',  label: 'Bois',   color: '#a8763e', place: 'wood' },
  stone: { id: 'stone', label: 'Pierre', color: '#8d8d94', place: 'stone' },
};

export const ITEMS = ['wood', 'stone'];
