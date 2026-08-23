// ============================================================
//  AVANIA — Raccourcis clavier / souris PERSONNALISABLES (rebind)
//  Toutes les actions du jeu sont liées à un « déclencheur » que le
//  joueur peut rebind dans les paramètres.
//
//  Format d'un déclencheur (trigger) :
//    'key:<touche>'   ex. 'key:z', 'key:e', 'key: ' (espace)
//    'mouse:<btn>'    ex. 'mouse:0' (gauche), 'mouse:2' (droit), 'mouse:1' (milieu)
//    'wheel:<sens>'   ex. 'wheel:up', 'wheel:down'
// ============================================================

const SAVE_KEY = 'avania.keys.v1';

// Définition des actions rebindables : id, libellé, déclencheur par défaut,
// et groupe d'affichage dans le panneau de paramètres.
export const KEY_ACTIONS = [
  // Déplacement
  { id: 'moveUp', label: 'Se déplacer (haut)', trigger: 'key:z', group: 'Déplacement' },
  { id: 'moveDown', label: 'Se déplacer (bas)', trigger: 'key:s', group: 'Déplacement' },
  { id: 'moveLeft', label: 'Se déplacer (gauche)', trigger: 'key:q', group: 'Déplacement' },
  { id: 'moveRight', label: 'Se déplacer (droite)', trigger: 'key:d', group: 'Déplacement' },

  // Souris
  { id: 'mine', label: 'Miner / Attaquer', trigger: 'mouse:0', group: 'Souris' },
  { id: 'place', label: 'Poser un bloc', trigger: 'mouse:2', group: 'Souris' },
  { id: 'cycleForward', label: 'Objet suivant (barre rapide)', trigger: 'wheel:down', group: 'Souris' },
  { id: 'cycleBackward', label: 'Objet précédent (barre rapide)', trigger: 'wheel:up', group: 'Souris' },

  // Barre rapide
  { id: 'hotbar1', label: 'Emplacement 1', trigger: 'key:1', group: 'Barre rapide' },
  { id: 'hotbar2', label: 'Emplacement 2', trigger: 'key:2', group: 'Barre rapide' },
  { id: 'hotbar3', label: 'Emplacement 3', trigger: 'key:3', group: 'Barre rapide' },
  { id: 'hotbar4', label: 'Emplacement 4', trigger: 'key:4', group: 'Barre rapide' },
  { id: 'hotbar5', label: 'Emplacement 5', trigger: 'key:5', group: 'Barre rapide' },
  { id: 'hotbar6', label: 'Emplacement 6', trigger: 'key:6', group: 'Barre rapide' },
  { id: 'hotbar7', label: 'Emplacement 7', trigger: 'key:7', group: 'Barre rapide' },
  { id: 'hotbar8', label: 'Emplacement 8', trigger: 'key:8', group: 'Barre rapide' },
  { id: 'hotbar9', label: 'Emplacement 9', trigger: 'key:9', group: 'Barre rapide' },

  // Interface
  { id: 'inventory', label: 'Inventaire', trigger: 'key:e', group: 'Interface' },
  { id: 'craft', label: 'Établi (fabrication)', trigger: 'key:c', group: 'Interface' },
  { id: 'sort', label: "Trier l'inventaire", trigger: 'key:r', group: 'Interface' },
  { id: 'drop', label: 'Lâcher un objet', trigger: 'key:q', group: 'Interface' },
  { id: 'settings', label: 'Ouvrir les paramètres', trigger: 'key:o', group: 'Interface' },
];

// Cartographie partagée et MUTABLE actionId -> déclencheur.
// Tout le monde (Input, Game, main) lit cet objet : un rebind se propage
// donc instantanément au jeu, sans rien recharger.
export const bindings = {};

function loadBindings() {
  for (const a of KEY_ACTIONS) bindings[a.id] = a.trigger;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      for (const a of KEY_ACTIONS) {
        if (typeof saved[a.id] === 'string' && saved[a.id]) bindings[a.id] = saved[a.id];
      }
    }
  } catch { /* stockage indisponible : on garde les défauts */ }
}
loadBindings();

export function saveBindings() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(bindings)); } catch { /* ignore */ }
}

export function resetBindings() {
  for (const a of KEY_ACTIONS) bindings[a.id] = a.trigger;
  saveBindings();
}

// Une autre action utilise-t-elle déjà ce déclencheur ? (gestion des conflits)
export function actionUsingTrigger(trigger, exceptId) {
  for (const a of KEY_ACTIONS) {
    if (a.id !== exceptId && bindings[a.id] === trigger) return a.id;
  }
  return null;
}

// Libellés lisibles pour les touches spéciales.
const KEY_LABELS = {
  ' ': 'Espace',
  arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→',
  control: 'Ctrl', shift: 'Shift', alt: 'Alt', meta: 'Meta',
  tab: 'Tab', enter: 'Entrée', escape: 'Échap', backspace: '⌫',
};

// Affichage lisible d'un déclencheur (boutons du panneau de paramètres).
export function formatTrigger(trigger) {
  if (!trigger) return '—';
  const idx = trigger.indexOf(':');
  const type = idx >= 0 ? trigger.slice(0, idx) : '';
  const val = idx >= 0 ? trigger.slice(idx + 1) : trigger;
  if (type === 'mouse') {
    if (val === '0') return 'Clic G';
    if (val === '2') return 'Clic D';
    if (val === '1') return 'Clic Milieu';
    return 'Souris';
  }
  if (type === 'wheel') return val === 'up' ? 'Molette ▲' : 'Molette ▼';
  if (type === 'key') {
    if (KEY_LABELS[val]) return KEY_LABELS[val];
    return val.length === 1 ? val.toUpperCase() : val;
  }
  return trigger;
}

// --- Conversion d'un événement natif en déclencheur (pour la saisie de rebind) ---
const MODIFIERS = new Set(['control', 'shift', 'alt', 'meta']);

export function triggerFromKey(e) {
  const k = (e.key || '').toLowerCase();
  if (!k || MODIFIERS.has(k)) return null; // modificateur seul : ignoré
  return 'key:' + k;
}

export function triggerFromMouse(e) {
  return 'mouse:' + e.button;
}

export function triggerFromWheel(e) {
  return (e.deltaY || 0) > 0 ? 'wheel:down' : 'wheel:up';
}
