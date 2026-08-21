// ============================================================
//  AVANIA — Configuration globale & constantes
//  Un monde RP en ligne, vue top-down, à bâtir soi-même.
// ============================================================

export const TILE = 32; // taille d'une tuile en pixels (monde)

// Taille de la carte (en tuiles)
export const WORLD_W = 128;
export const WORLD_H = 128;

// --- Budget rendu / compatibilité PC modestes ---
// Ces valeurs gardent le jeu fluide sur les machines peu puissantes :
// on limite les pixels réellement rendus et on regroupe le sol en chunks.
export const PERFORMANCE = {
  CHUNK_TILES: 16,
  MAX_DPR: 1.5,
  LOW_POWER_MAX_DPR: 1,
  LOW_POWER_CORES: 4,
  LOW_POWER_MEMORY_GB: 4,
  ADAPTIVE_SAMPLE_FRAMES: 90,
  ADAPTIVE_FRAME_COST_MS: 24,
};

// Vitesse de déplacement du joueur (px / seconde)
export const PLAYER_SPEED = 190;
// Le cube est volontairement plus petit que les arbres et les rochers :
// il occupe environ 2/3 d'une tuile, comme un personnage Minecraft.
export const PLAYER_RADIUS = 7;
export const PLAYER_RENDER_SCALE = 0.72;

// Inventaire façon Minecraft : 27 cases de stockage + 9 cases de barre rapide.
export const INVENTORY_SLOTS = 36;
export const HOTBAR_SLOTS = 9;

// Distance max (en pixels) pour interagir avec un bloc
export const REACH = TILE * 3;

// --- Palette générale (ambiance chaleureuse) ---
export const PALETTE = {
  uiBg: '#0f1a13',
  uiPanel: '#16261c',
  uiPanel2: '#1e3025',
  uiBorder: '#2c4634',
  uiAccent: '#7ccf6a',
  uiAccent2: '#f2c14e',
  uiText: '#eef6ee',
  uiMuted: '#9ab7a2',
  grass: '#7cae4e',
  grassDark: '#6b9c42',
  grassLight: '#8cc05e',
  water: '#4a9fd8',
  waterDeep: '#3a86c0',
  sky: '#2f76b2',
};

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
  { id: 'chauve',          label: 'Chauve' },
  { id: 'court',           label: 'Court' },
  { id: 'frange',          label: 'Frange' },
  { id: 'mi-long',         label: 'Mi-long' },
  { id: 'long',            label: 'Long' },
  { id: 'boucles',         label: 'Boucles' },
  { id: 'boucles-longues', label: 'Boucles longues' },
  { id: 'afro',            label: 'Afro' },
  { id: 'degrades',        label: 'Dégradé' },
  { id: 'undercut',        label: 'Undercut' },
  { id: 'raie',            label: 'Raie côté' },
  { id: 'mohawk',          label: 'Crête' },
  { id: 'chignon',         label: 'Chignon' },
  { id: 'couettes',        label: 'Couettes' },
  { id: 'queue',           label: 'Queue' },
  { id: 'tresses',         label: 'Tresses' },
  { id: 'nattes',          label: 'Nattes' },
  { id: 'casquette',       label: 'Casquette' },
];

export const HAIR_COLORS = [
  { id: 'noir',    label: 'Noir',     color: '#1c1a18' },
  { id: 'brun',    label: 'Brun',     color: '#4a2c1a' },
  { id: 'chatain', label: 'Châtain',  color: '#7a4b28' },
  { id: 'blond',   label: 'Blond',    color: '#d9a441' },
  { id: 'roux',    label: 'Roux',     color: '#a3401f' },
  { id: 'blanc',   label: 'Blanc',    color: '#e8e4da' },
  { id: 'gris',    label: 'Gris',     color: '#9a9aa0' },
  { id: 'bleu',    label: 'Bleu',     color: '#3b6fd1' },
  { id: 'rose',    label: 'Rose',     color: '#e06aa0' },
  { id: 'vert',    label: 'Vert',     color: '#3f9e5a' },
];

export const EYE_COLORS = [
  { id: 'marron',   label: 'Marron',   color: '#3b2b1f' },
  { id: 'noisette', label: 'Noisette', color: '#6a4a2a' },
  { id: 'bleu',     label: 'Bleu',     color: '#3f7fb8' },
  { id: 'bleu-clair', label: 'Bleu clair', color: '#6fb8e8' },
  { id: 'vert',     label: 'Vert',     color: '#4e8a4a' },
  { id: 'gris',     label: 'Gris',     color: '#8a8a8a' },
  { id: 'violet',   label: 'Violet',   color: '#7a5aa0' },
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
  { id: 'kaki',    label: 'Kaki',    color: '#8a8a4a' },
  { id: 'bordeaux', label: 'Bordeaux', color: '#7a2f3f' },
];

export const PANTS_COLORS = [
  { id: 'jean',    label: 'Jean',    color: '#3a5b8c' },
  { id: 'noir',    label: 'Noir',    color: '#33343a' },
  { id: 'gris',    label: 'Gris',    color: '#6a6f76' },
  { id: 'kaki',    label: 'Kaki',    color: '#7a7a4a' },
  { id: 'marron',  label: 'Marron',  color: '#6a4a2a' },
  { id: 'rouge',   label: 'Rouge',   color: '#b03a3a' },
  { id: 'blanc',   label: 'Blanc',   color: '#e8e8e8' },
  { id: 'vert',    label: 'Vert',    color: '#4a6a3a' },
  { id: 'bordeaux', label: 'Bordeaux', color: '#6a2a3a' },
];

export const HATS = [
  { id: 'none',          label: 'Aucun' },
  { id: 'casquette',     label: 'Casquette' },
  { id: 'bonnet',        label: 'Bonnet' },
  { id: 'paille',        label: 'Paille' },
  { id: 'casque',        label: 'Casque' },
  { id: 'haut-de-forme', label: 'Haut-de-forme' },
  { id: 'melon',         label: 'Melon' },
  { id: 'couronne',      label: 'Couronne' },
];

export const GLASSES = [
  { id: 'none',       label: 'Aucune' },
  { id: 'rondes',     label: 'Rondes' },
  { id: 'carrees',    label: 'Carrées' },
  { id: 'demi-lune',  label: 'Demi-lune' },
  { id: 'soleil',     label: 'Soleil' },
];

export const FACIAL_HAIR = [
  { id: 'none',      label: 'Aucune' },
  { id: 'moustache', label: 'Moustache' },
  { id: 'bouc',      label: 'Bouc' },
  { id: 'barbe',     label: 'Barbe' },
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
  facialHair: 'none',
};

// Petit répertoire de noms génériques pour l'inspiration
export const NAME_IDEAS = [
  'Léo', 'Maya', 'Noa', 'Jade', 'Hugo', 'Inès', 'Tom', 'Zoé',
  'Nina', 'Max', 'Lina', 'Sacha', 'Romy', 'Ethan', 'Milo', 'Anna',
];
