// ============================================================
//  AVANIA — Gab, le passeur
//
//  Il tient la traversée au bout du quai d'Avania : on lui parle,
//  on paie, et il vous dépose de l'autre côté.
//
//  Deux règles qui ne bougent pas, et qu'il répète volontiers :
//    • le prix est FIXE : 20 écus. Il ne marchande pas.
//    • c'est un ALLER SIMPLE : pas d'aller-retour. Chaque traversée
//      se paie — le retour compris. Gab vous attend sur l'autre
//      rive : c'est le même homme, pas son frère.
//
//  Ce module est pur (aucun DOM) : il est partagé par le navigateur
//  et par les tests. Le transport vers le modèle de langage vit
//  dans js/ferryman-ai.js.
// ============================================================

import { islandDef, ISLANDS } from './islands.js';
import { normalize, extractLastNumber } from './merchant.js';

// Prix de la traversée. Fixe : il n'y a rien à négocier.
export const FERRY_PRICE = 20;

// Pseudo-article : la traversée n'est pas un objet de l'inventaire,
// mais le comptoir la présente comme une offre (même bouton, même
// contrôle de bourse).
export const CROSSING_ITEM = 'crossing';

export const FERRYMAN = {
  id: 'gab',
  kind: 'ferryman',
  name: 'Gab',
  title: 'Le Passeur',
  price: FERRY_PRICE,
  // Où il attend, et où l'on débarque, sur chaque rive.
  //   stand   : la tuile où il se tient
  //   landing : la tuile où le joueur apparaît en débarquant
  spots: {
    surface: { stand: { tx: 109, ty: 61 }, landing: { tx: 108, ty: 61 }, facing: 'right' },
    fortune: { stand: { tx: 21, ty: 64 }, landing: { tx: 22, ty: 64 }, facing: 'left' },
  },
  // De l'autre côté : Avania ↔ Fortune City.
  destination: { surface: 'fortune', fortune: 'surface' },
  voice: 'marin taiseux et franc, phrases courtes, il tutoie, quelques '
    + 'images de mer et de cordage ; il annonce son prix une fois et ne '
    + 'le discute jamais',
};

// Là où Gab attend sur une île donnée.
export function ferrySpot(worldId = 'surface') {
  return FERRYMAN.spots[worldId] || FERRYMAN.spots.surface;
}

// Gab tient-il la traversée sur cette île ? (ni dans la grotte, ni
// sur une île où il n'a pas de poste.)
export function ferrymanWaitsHere(worldId) {
  return Object.prototype.hasOwnProperty.call(FERRYMAN.spots, worldId);
}

// L'île qu'il rejoint depuis une rive donnée.
export function ferryDestination(worldId = 'surface') {
  return FERRYMAN.destination[worldId] || 'surface';
}

// Le nom affiché d'une destination ('fortune' → 'Fortune City').
export function islandName(id) {
  if (id === 'surface') return 'Avania';
  const def = islandDef(id);
  return def ? def.name : id;
}

// L'offre du comptoir : une traversée, au prix affiché.
export function crossingOffer(destinationId) {
  return {
    item: CROSSING_ITEM,
    price: FERRY_PRICE,
    label: `Traversée vers ${islandName(destinationId)}`,
    desc: 'Aller simple — pas d’aller-retour',
    payLabel: 'Payer',
  };
}

// ------------------------------------------------------------
//  État de Gab (ce que « sait » l'IA)
// ------------------------------------------------------------
export function createFerryState(options = {}) {
  return {
    id: 'gab',
    day: options.day || 1,
    // D'où l'on parle : détermine la destination de la traversée.
    from: options.from || 'surface',
    destination: ferryDestination(options.from || 'surface'),
    crossings: 0,      // traversées vendues
    earned: 0,         // écus encaissés
    mood: 1,           // 1 = disposé, 0 = excédé
    patience: 6,       // gros mots tolérés avant qu'il vous plante là
    patienceLeft: 6,
    messages: 0,
    cooldownUntil: 0,
  };
}

// Ce qui est envoyé à l'IA comme « fiche de situation ».
export function ferryBriefing(state, options = {}) {
  return {
    ferryman: FERRYMAN.name,
    title: FERRYMAN.title,
    voice: FERRYMAN.voice,
    price: FERRY_PRICE,
    from: islandName(state.from),
    destination: islandName(state.destination),
    destinationNote: islandDef(state.destination) && islandDef(state.destination).bare
      ? 'Pour l’instant il n’y a rien là-bas : du terrain nu, de l’herbe et le vent.'
      : '',
    day: state.day,
    crossings: state.crossings,
    money: Number.isFinite(options.money) ? options.money : null,
    mood: state.mood,
  };
}

// ------------------------------------------------------------
//  Commandes de Gab
//
//  Il répond en texte libre (sans markdown, sans didascalie) et
//  peut glisser une commande sur sa propre ligne :
//    /cross [prix]   propose la traversée (le prix est FIXE : 20)
//    /out            il vous plante là
// ------------------------------------------------------------
export function parseFerryReply(raw, state) {
  const text = String(raw == null ? '' : raw);
  const lines = text.split(/\r?\n/);
  const speech = [];
  let offer = null;
  let kicked = false;

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith('/')) {
      const [cmd, ...args] = t.split(/\s+/);
      const name = (cmd || '').toLowerCase();
      if (name === '/cross' || name === '/traversee' || name === '/traverser') {
        const n = Number(String(args[0] || '').replace(',', '.'));
        // Le prix ne se négocie pas : un modèle qui annonce un autre
        // tarif est ramené au tarif affiché.
        offer = crossingOffer(state ? state.destination : 'fortune');
        if (Number.isFinite(n) && n > 0) offer.price = FERRY_PRICE;
      } else if (name === '/out') {
        kicked = true;
      }
      // Toute commande inconnue est ignorée (elle ne doit jamais
      // apparaître telle quelle dans la bulle).
      continue;
    }
    speech.push(t);
  }

  return { speech: speech.join(' '), offer, kicked };
}

// ------------------------------------------------------------
//  Cerveau local (sans clé d'API, hors ligne, ou serveur absent)
//
//  Gab tient son rôle dans tous les cas : le joueur ne voit pas la
//  différence de protocole, seulement des répliques plus courtes.
// ------------------------------------------------------------
const LEXICON = {
  greeting: ['bonjour', 'bonsoir', 'salut', 'coucou', 'hey', 'hello', 'bonjou'],
  insult: [
    'connard', 'abruti', 'imbecile', 'idiot', 'cretin', 'nul', 'naze', 'ta gueule',
    'degage', 'casse toi', 'merde', 'salaud', 'escroc', 'voleur', 'arnaque',
    'arnaqueur', 'pourri', 'minable', 'tu crains',
  ],
  price: [
    'combien', 'prix', 'tarif', 'ca coute', 'c est combien', 'ca fait combien',
    'ca vaut', 'payant', 'gratuit',
  ],
  discount: [
    'reduction', 'remise', 'rabais', 'moins cher', 'baisser', 'baisse', 'geste',
    'un effort', 'prix d ami', 'marchander', 'negoce', 'negocier', 'cadeau',
  ],
  roundTrip: [
    'aller retour', 'aller-retour', 'retour', 'revenir', 'revien', 'rentrer',
    'ramene', 'r amener', 'revenir', 'et pour revenir', 'repartir',
  ],
  cross: [
    'traverser', 'traversee', 'embarquer', 'embarque', 'partir', 'emmene',
    'emmener', 'bateau', 'ferry', 'l autre rive', 'autre rive', 'l autre cote',
    'autre ile', 'autre cote', 'je veux y aller', 'on y va', 'vas y', 'allez',
    'je paye', 'je prends', 'banco', 'd accord', 'ok', 'conclu', 'largue',
  ],
  where: ['ou', 'qui es', 'qui est', 'quoi', 'ville', 'fortune', 'loin', 'trajet'],
  leave: ['au revoir', 'a bientot', 'je pars', 'laisse tomber', 'oublie', 'ciao', 'bonne journee'],
};

const LINES = {
  greet: [
    'Tiens, un client. Fortune City, c’est vingt écus l’aller simple.',
    'Approche pas trop du bord, le quai est glissant. Tu veux traverser ?',
    'Gab. C’est moi qui tiens la barre. Vingt écus et je te passe l’autre rive.',
  ],
  price: [
    'Vingt écus. Aller simple. Je ne fais pas crédit et je ne marchande pas.',
    'Vingt écus, et c’est le même prix pour tout le monde. Pas d’aller-retour : le retour se paie aussi.',
  ],
  discount: [
    'Le prix est le prix. Vingt écus, ou tu traverses à la nage.',
    'J’ai un bateau à entretenir et du goudron à payer. Vingt écus.',
  ],
  roundTrip: [
    'Pas d’aller-retour chez moi. Tu veux revenir, tu repaies vingt écus sur l’autre rive — j’y serai.',
    'Chaque traversée se paie. L’aller, le retour, c’est le même tarif.',
  ],
  where: [
    'L’autre rive. Fortune City, qu’ils appellent. Pour l’instant c’est de l’herbe, du vent, et pas grand-chose d’autre.',
    'Deux heures de mer si le vent tient. On débarque sur la grève, à l’ouest.',
  ],
  cross: [
    'C’est bon. Vingt écus et je largue les amarres.',
    'Embarque. Pose les vingt écus dans ma main et on appareille.',
  ],
  poor: [
    'Il te manque de la monnaie. Va gagner tes écus et reviens me voir.',
    'Vingt écus, je te dis. Reviens quand ta bourse suit.',
  ],
  accepted: ['Bien. Garde tes affaires, on largue tout de suite.'],
  leave: ['À la bonne heure. Le vent se lève, moi j’attends là.'],
  lowball: ['Répète un peu, mais sans les gros mots.'],
  out: ['Passe ton chemin, alors. J’ai un bateau à préparer.'],
  idle: [
    'Le vent rentre ce soir. Si tu veux traverser, c’est maintenant.',
    'Vingt écus, aller simple. Le reste, tu le découvriras là-bas.',
    'J’ai connu cette mer plus calme. Ça ne m’empêche pas de partir.',
  ],
};

function hasIntent(text, key) {
  const n = ' ' + normalize(text) + ' ';
  for (const word of LEXICON[key]) if (n.includes(word)) return true;
  return false;
}

// Petit générateur déterministe : les répliques varient d'une partie
// à l'autre sans jamais dépendre de Math.random (les tests restent
// reproductibles).
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rng, list) => list[Math.floor(rng() * list.length) % list.length];

// Réplique du passeur (cerveau local). Retourne { text } — le texte
// peut porter une commande, comme celui du modèle.
export function ferryReply(state, briefing, message, options = {}) {
  const rng = makeRng(9139 + state.messages * 7919);
  const text = String(message || '');
  const out = [];
  const insulted = hasIntent(text, 'insult');

  if (insulted) {
    state.patienceLeft = Math.max(0, (state.patienceLeft ?? 6) - 3);
    state.mood = Math.max(0, state.mood - 0.45);
    if (state.patienceLeft <= 0 || state.mood <= 0.1) {
      return { text: `${pick(rng, LINES.out)}\n/out` };
    }
    return { text: pick(rng, LINES.lowball) };
  }

  if (hasIntent(text, 'leave')) return { text: pick(rng, LINES.leave) };

  if (hasIntent(text, 'discount')) {
    out.push(pick(rng, LINES.discount));
    return { text: `${out.join(' ')}\n/cross ${FERRY_PRICE}` };
  }

  if (hasIntent(text, 'roundTrip')) {
    out.push(pick(rng, LINES.roundTrip));
    return { text: `${out.join(' ')}\n/cross ${FERRY_PRICE}` };
  }

  if (hasIntent(text, 'price')) {
    out.push(pick(rng, LINES.price));
    // Assez en poche ? Sinon il le dit, sans proposer la traversée.
    const money = Number.isFinite(briefing.money) ? briefing.money : null;
    if (money !== null && money < FERRY_PRICE) {
      out.push(pick(rng, LINES.poor));
      return { text: out.join(' ') };
    }
    return { text: `${out.join(' ')}\n/cross ${FERRY_PRICE}` };
  }

  if (hasIntent(text, 'where')) {
    out.push(pick(rng, LINES.where));
    return { text: `${out.join(' ')}\n/cross ${FERRY_PRICE}` };
  }

  if (hasIntent(text, 'cross') || hasIntent(text, 'greeting') || state.messages <= 1) {
    const money = Number.isFinite(briefing.money) ? briefing.money : null;
    if (hasIntent(text, 'greeting') || state.messages <= 1) out.push(pick(rng, LINES.greet));
    else out.push(pick(rng, LINES.cross));
    if (money !== null && money < FERRY_PRICE) {
      out.push(pick(rng, LINES.poor));
      return { text: out.join(' ') };
    }
    return { text: `${out.join(' ')}\n/cross ${FERRY_PRICE}` };
  }

  // Le joueur propose un chiffre : il le ramène au tarif.
  const offered = extractLastNumber(text);
  if (offered !== null) {
    out.push(offered < FERRY_PRICE ? pick(rng, LINES.discount) : pick(rng, LINES.price));
    return { text: `${out.join(' ')}\n/cross ${FERRY_PRICE}` };
  }

  out.push(pick(rng, LINES.idle));
  return { text: `${out.join(' ')}\n/cross ${FERRY_PRICE}` };
}

// Accueil du comptoir (cerveau local) : il annonce la traversée
// tout de suite — c'est un tarif affiché, pas une négociation.
export function ferryGreeting(state, briefing) {
  const rng = makeRng(9139);
  const lines = [pick(rng, LINES.greet)];
  const money = Number.isFinite(briefing.money) ? briefing.money : null;
  if (money !== null && money < FERRY_PRICE) {
    lines.push(pick(rng, LINES.poor));
    return { text: lines.join(' ') };
  }
  return { text: `${lines.join(' ')}\n/cross ${FERRY_PRICE}` };
}

// Les îles connues du passeur (sert aux tests et à l'affichage).
export const FERRY_ISLANDS = ISLANDS;
