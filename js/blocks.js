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
};

// Les objets qu'on peut avoir dans l'inventaire
export const ITEM_DEFS = {
  wood:  { id: 'wood',  label: 'Bois',   color: '#b07a3c', place: 'wood' },
  stone: { id: 'stone', label: 'Pierre', color: '#9a9aa3', place: 'stone' },
};

export const ITEMS = ['wood', 'stone'];
