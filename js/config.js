// ============================================================
//  AVANIA — Configuration globale & constantes
//  Un monde RP en ligne, vue top-down.
// ============================================================

export const TILE = 32; // taille d'une tuile en pixels (monde)

// Taille de la carte (en tuiles)
export const WORLD_W = 128;
export const WORLD_H = 128;

// Vitesse de déplacement du joueur (px / seconde)
export const PLAYER_SPEED = 190;
export const PLAYER_RADIUS = 11; // rayon de collision du joueur

// --- Couleurs globales (palette "village chaleureux") ---
export const COLORS = {
  grass: '#6faf4b',
  grassDark: '#62993f',
  grassLight: '#84c25c',
  path: '#c8a35a',
  pathDark: '#b28c47',
  road: '#9a9a96',
  roadEdge: '#7d7d7a',
  plaza: '#a8a8a2',
  water: '#3d8fd1',
  waterDeep: '#2f76b2',
  sand: '#e7d3a0',
  wood: '#8a5a34',
  woodDark: '#6e4426',
  wall: '#c9b58f',
  wallDark: '#a18a63',
  shadow: 'rgba(20, 30, 20, 0.18)',
};

// --- Options de personnalisation du personnage ---
export const SKIN_TONES = [
  { id: 'clair',   label: 'Clair',   color: '#f7d7b5' },
  { id: 'peche',   label: 'Pêche',   color: '#f1c27d' },
  { id: 'hale',    label: 'Halé',    color: '#d9a066' },
  { id: 'bronze',  label: 'Bronzé',  color: '#b97a45' },
  { id: 'fonce',   label: 'Foncé',   color: '#8c5a2e' },
  { id: 'ebene',   label: 'Ébène',   color: '#5e3b22' },
];

export const HAIR_STYLES = [
  { id: 'chauve',  label: 'Chauve' },
  { id: 'court',   label: 'Court' },
  { id: 'mi-long', label: 'Mi-long' },
  { id: 'long',    label: 'Long' },
  { id: 'mohawk',  label: 'Crête' },
  { id: 'chignon', label: 'Chignon' },
  { id: 'casquette', label: 'Casquette' },
];

export const HAIR_COLORS = [
  { id: 'noir',    label: 'Noir',     color: '#1c1a18' },
  { id: 'brun',    label: 'Brun',     color: '#4a2c1a' },
  { id: 'chatain', label: 'Châtain',  color: '#7a4b28' },
  { id: 'blond',   label: 'Blond',    color: '#d9a441' },
  { id: 'roux',    label: 'Roux',     color: '#a3401f' },
  { id: 'blanc',   label: 'Blanc',    color: '#e8e4da' },
  { id: 'bleu',    label: 'Bleu',     color: '#3b6fd1' },
  { id: 'rose',    label: 'Rose',     color: '#e06aa0' },
  { id: 'vert',    label: 'Vert',     color: '#3f9e5a' },
];

export const EYE_COLORS = [
  { id: 'marron',  label: 'Marron', color: '#3b2b1f' },
  { id: 'noisette',label: 'Noisette', color: '#6a4a2a' },
  { id: 'bleu',    label: 'Bleu',   color: '#3f7fb8' },
  { id: 'vert',    label: 'Vert',   color: '#4e8a4a' },
  { id: 'gris',    label: 'Gris',   color: '#8a8a8a' },
  { id: 'violet',  label: 'Violet', color: '#7a5aa0' },
];

export const SHIRT_COLORS = [
  { id: 'rouge',   label: 'Rouge',   color: '#d9534f' },
  { id: 'orange',  label: 'Orange',  color: '#e8963c' },
  { id: 'jaune',   label: 'Jaune',   color: '#e6c23c' },
  { id: 'vert',    label: 'Vert',    color: '#5cb85c' },
  { id: 'bleu',    label: 'Bleu',    color: '#4a90d9' },
  { id: 'violet',  label: 'Violet',  color: '#8e6bc0' },
  { id: 'blanc',   label: 'Blanc',   color: '#f0f0f0' },
  { id: 'noir',    label: 'Noir',    color: '#3a3a3a' },
  { id: 'rose',    label: 'Rose',    color: '#e07a9a' },
  { id: 'cyan',    label: 'Cyan',    color: '#4fc3c3' },
];

export const PANTS_COLORS = [
  { id: 'jean',    label: 'Jean',    color: '#3a5b8c' },
  { id: 'noir',    label: 'Noir',    color: '#33343a' },
  { id: 'gris',    label: 'Gris',    color: '#6a6f76' },
  { id: 'kaki',    label: 'Kaki',    color: '#7a7a4a' },
  { id: 'marron',  label: 'Marron',  color: '#6a4a2a' },
  { id: 'rouge',   label: 'Rouge',   color: '#b03a3a' },
  { id: 'blanc',   label: 'Blanc',   color: '#e8e8e8' },
];

// Aspect par défaut d'un nouveau personnage
export const DEFAULT_APPEARANCE = {
  name: 'Aventurier',
  skin: 'peche',
  hairStyle: 'court',
  hairColor: 'brun',
  eyes: 'marron',
  shirt: 'rouge',
  pants: 'jean',
};

// Petit répertoire de noms génériques pour l'inspiration
export const NAME_IDEAS = [
  'Léo', 'Maya', 'Noa', 'Jade', 'Hugo', 'Inès', 'Tom', 'Zoé',
  'Nina', 'Max', 'Lina', 'Sacha', 'Romy', 'Ethan', 'Milo', 'Anna',
];
