// ============================================================
//  AVANIA — Configuration globale & constantes
//  Un monde RP en ligne, vue top-down, à bâtir soi-même.
// ============================================================

export const TILE = 32; // taille d'une tuile en pixels (monde)

// Taille de la carte (en tuiles)
export const WORLD_W = 128;
export const WORLD_H = 128;

// Vitesse de déplacement du joueur (px / seconde)
export const PLAYER_SPEED = 190;
export const PLAYER_RADIUS = 10; // rayon de collision du joueur

// Distance max (en pixels) pour interagir avec un bloc
export const REACH = TILE * 3;

// --- Options de personnalisation du personnage (carré) ---
export const SKIN_TONES = [
  { id: 'clair',   label: 'Clair',   color: '#f7d7b5' },
  { id: 'peche',   label: 'Pêche',   color: '#f1c27d' },
  { id: 'hale',    label: 'Halé',    color: '#d9a066' },
  { id: 'bronze',  label: 'Bronzé',  color: '#b97a45' },
  { id: 'fonce',   label: 'Foncé',   color: '#8c5a2e' },
  { id: 'ebene',   label: 'Ébène',   color: '#5e3b22' },
];

export const HAIR_STYLES = [
  { id: 'chauve',   label: 'Chauve' },
  { id: 'court',    label: 'Court' },
  { id: 'mi-long',  label: 'Mi-long' },
  { id: 'long',     label: 'Long' },
  { id: 'mohawk',   label: 'Crête' },
  { id: 'chignon',  label: 'Chignon' },
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
  { id: 'marron',  label: 'Marron',   color: '#3b2b1f' },
  { id: 'noisette',label: 'Noisette', color: '#6a4a2a' },
  { id: 'bleu',    label: 'Bleu',     color: '#3f7fb8' },
  { id: 'vert',    label: 'Vert',     color: '#4e8a4a' },
  { id: 'gris',    label: 'Gris',     color: '#8a8a8a' },
  { id: 'violet',  label: 'Violet',   color: '#7a5aa0' },
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

export const HATS = [
  { id: 'none',        label: 'Aucun' },
  { id: 'casquette',   label: 'Casquette' },
  { id: 'bonnet',      label: 'Bonnet' },
  { id: 'haut-de-forme', label: 'Haut-de-forme' },
  { id: 'couronne',    label: 'Couronne' },
];

export const GLASSES = [
  { id: 'none',    label: 'Aucune' },
  { id: 'rondes',  label: 'Rondes' },
  { id: 'carrees', label: 'Carrées' },
  { id: 'soleil',  label: 'Soleil' },
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
  hat: 'none',
  glasses: 'none',
};

// Petit répertoire de noms génériques pour l'inspiration
export const NAME_IDEAS = [
  'Léo', 'Maya', 'Noa', 'Jade', 'Hugo', 'Inès', 'Tom', 'Zoé',
  'Nina', 'Max', 'Lina', 'Sacha', 'Romy', 'Ethan', 'Milo', 'Anna',
];
