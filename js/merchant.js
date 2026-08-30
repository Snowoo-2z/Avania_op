// ============================================================
//  AVANIA — Les marchands de l'entrée de la grotte
//
//  Deux marchands, deux métiers : les MASQUES (protection
//  respiratoire) et les ARMURES de minage (protection intégrale).
//
//  Le prix d'un article se décompose en deux coûts que le marchand
//  CONNAÎT :
//    • production — tout est assemblé HORS de l'île. Ce coût ne bouge
//      jamais, et le marchand n'a aucun détail sur la fabrication.
//    • transport  — l'acheminement jusqu'à l'île.
//  Sa marge vient s'ajouter par-dessus. C'est ce qui rend la
//  négociation crédible : il y a un plancher réel, et le marchand ne
//  peut pas descendre dessous sans travailler à perte.
//
//  Ce module est pur (aucun DOM) : il est partagé entre le navigateur
//  et le serveur, et testable directement.
// ============================================================

// ------------------------------------------------------------
//  Coûts connus des marchands (en écus)
// ------------------------------------------------------------
export const MERCHANT_GOODS = {
  mask_cloth:      { production: 20,  transport: 8 },
  mask_filter:     { production: 55,  transport: 18 },
  mask_sealed:     { production: 130, transport: 45 },
  armor_leather:   { production: 35,  transport: 12 },
  armor_reinforced:{ production: 90,  transport: 30 },
  armor_full:      { production: 210, transport: 70 },
};

// ------------------------------------------------------------
//  Vocabulaire
//
//  Les libellés officiels ne suffisent pas à reconnaître ce que demande
//  un joueur : personne ne dit « Armure de minage intégrale », tout le
//  monde dit « ta meilleure protection ». Sans ces synonymes, Aldric ne
//  comprend rien et ne propose jamais rien.
//  Les mots sont écrits sans accent : normalize() les retire.
// ------------------------------------------------------------
export const ITEM_TAGS = {
  mask_cloth: ['masque', 'toile', 'poussiere', 'simple', 'premier', 'pas cher'],
  mask_filter: ['masque', 'filtre', 'cartouche', 'moyen', 'intermediaire'],
  mask_sealed: ['masque', 'scelle', 'etanche', 'reserve', 'meilleur', 'meilleure', 'top'],
  armor_leather: ['armure', 'tenue', 'cuir', 'protection', 'minage', 'simple', 'premier'],
  armor_reinforced: ['armure', 'renforcee', 'protection', 'minage', 'moyen', 'intermediaire'],
  armor_full: ['armure', 'integrale', 'entiere', 'protection', 'complete', 'minage',
    'meilleur', 'meilleure', 'top'],
};

// Score de correspondance entre un texte libre et un article.
// 0 = aucun rapport ; plus c'est haut, plus c'est sûr.
//
// Le libellé entier cité tel quel l'emporte sur tout. Sinon on compte les
// mots reconnus : ceux du libellé pèsent double (ce sont les mots du
// marchand), ceux des synonymes pèsent simple. La longueur reconnue
// départage les égalités — sinon « masque » seul renverrait toujours le
// premier masque du catalogue, quel que soit l'adjectif qui suit.
export function itemMatchScore(rawText, itemId, defs = {}) {
  const n = normalize(rawText);
  if (!n) return 0;
  const label = normalize((defs[itemId] && defs[itemId].label) || itemId);
  if (label.length > 4 && n.includes(label)) return 100000;

  let matched = 0;
  let length = 0;
  for (const w of label.split(' ')) {
    if (w.length > 3 && n.includes(w)) { matched += 2; length += w.length; }
  }
  for (const t of ITEM_TAGS[itemId] || []) {
    if (t.length > 3 && n.includes(t)) { matched += 1; length += t.length; }
  }
  return matched * 100 + length;
}

// Coût de revient total : le plancher absolu du marchand.
export function costOf(itemId) {
  const g = MERCHANT_GOODS[itemId];
  return g ? g.production + g.transport : 0;
}

// Prix d'appel conseillé (coût + marge du marchand).
export function suggestedPrice(itemId, margin) {
  const cost = costOf(itemId);
  return Math.max(1, Math.round(cost * (1 + margin)));
}

// ------------------------------------------------------------
//  Les deux marchands
// ------------------------------------------------------------
export const MERCHANTS = {
  gaspard: {
    id: 'gaspard',
    kind: 'merchantMask',
    name: 'Gaspard',
    title: 'Marchand de masques',
    slot: 'mask',
    items: ['mask_cloth', 'mask_filter', 'mask_sealed'],
    margin: 0.5,        // marge d'ouverture
    minMargin: 0.08,    // il ne descend quasiment jamais sous 8 % de marge
    patience: 6,        // messages avant de mettre dehors
    temper: 0.6,        // 0 = flegmatique, 1 = sanguin
    cooldown: 45,       // secondes pendant lesquelles il refuse de parler
    voice: 'bavard et bonimenteur, il adore raconter la fabrication et'
      + ' glisser des compliments, il tutoie vite',
  },
  aldric: {
    id: 'aldric',
    kind: 'merchantArmor',
    name: 'Aldric',
    title: 'Marchand d\'armures',
    slot: 'armor',
    items: ['armor_leather', 'armor_reinforced', 'armor_full'],
    margin: 0.42,
    minMargin: 0.15,    // plus raide que Gaspard
    patience: 4,
    temper: 0.9,
    cooldown: 45,
    voice: 'bourru, phrases courtes, il ne répète pas deux fois et'
      + ' ne justifie jamais un prix',
  },
};

// ------------------------------------------------------------
//  État de négociation d'un marchand (ce que « sait » l'IA)
// ------------------------------------------------------------
export function createMerchantState(id, options = {}) {
  const def = MERCHANTS[id];
  if (!def) throw new Error(`Marchand inconnu : ${id}`);
  return {
    id,
    day: options.day || 1,
    totalPlayers: options.totalPlayers || 1,
    // Dernières ventes : { item, price, day }. Sert à l'IA pour se
    // situer (« le dernier est parti à ce prix-là »).
    sales: options.sales ? [...options.sales] : [],
    soldCount: options.soldCount || 0,
    // Négociation en cours.
    discussing: null,        // id de l'article en discussion
    currentPrice: null,      // dernier prix avancé par le marchand
    patienceLeft: def.patience,
    mood: 1,                 // 1 = content, 0 = excédé
    messages: 0,
    cooldownUntil: 0,
  };
}

// Ce qui est envoyé à l'IA comme « fiche de situation ».
export function merchantBriefing(state, defs) {
  const def = MERCHANTS[state.id];
  const catalog = def.items.map((itemId) => {
    const item = defs[itemId] || {};
    const cost = MERCHANT_GOODS[itemId];
    return {
      id: itemId,
      label: item.label || itemId,
      maxDepth: item.maxDepth || 1,
      production: cost.production,
      transport: cost.transport,
      cost: cost.production + cost.transport,
      suggested: suggestedPrice(itemId, def.margin),
      floor: Math.round((cost.production + cost.transport) * (1 + def.minMargin)),
      description: item.flavor || '',
    };
  });
  return {
    merchant: def.name,
    title: def.title,
    voice: def.voice,
    catalog,
    day: state.day,
    totalPlayers: state.totalPlayers,
    soldCount: state.soldCount,
    recentSales: state.sales.slice(-5).map((s) => ({
      item: (defs[s.item] && defs[s.item].label) || s.item,
      price: s.price,
      day: s.day,
    })),
    discussing: state.discussing,
    currentPrice: state.currentPrice,
    patienceLeft: state.patienceLeft,
  };
}

// ------------------------------------------------------------
//  Commandes du marchand
//
//  Le marchand répond en texte libre (sans markdown, sans décrire ses
//  actions) et peut glisser des commandes sur leur propre ligne :
//    /out [texte]          met le joueur dehors (45 s de refroidissement)
//    /sell <article> <prix> propose l'article à ce prix
// ------------------------------------------------------------
export function parseMerchantReply(raw) {
  const text = String(raw == null ? '' : raw);
  const lines = text.split(/\r?\n/);
  const speech = [];
  const commands = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // La commande peut être SEULE sur sa ligne (cas voulu) mais un modèle
    // la colle souvent en fin de phrase ou derrière un tiret. On la cherche
    // donc n'importe où dans la ligne : ce qui précède reste du discours.
    const cmdIndex = trimmed.search(/\/(?:sell|out)\b/);
    const speechPart = cmdIndex === -1 ? trimmed : trimmed.slice(0, cmdIndex).trim();
    const cmdPart = cmdIndex === -1 ? null : trimmed.slice(cmdIndex).trim();

    if (speechPart) speech.push(speechPart);
    if (!cmdPart) continue;

    const parts = cmdPart.slice(1).split(/\s+/);
    const name = (parts[0] || '').toLowerCase();
    const rest = parts.slice(1).join(' ');
    if (name === 'out') {
      if (rest) speech.push(rest);
      commands.push({ type: 'out' });
    } else if (name === 'sell') {
      const price = extractLastNumber(rest);
      const label = rest.replace(/(\d[\d\s.,]*)$/, '').trim();
      commands.push({ type: 'sell', rawItem: label, price });
    }
    // Toute autre commande est ignorée : le joueur ne doit jamais voir
    // la cuisine interne.
  }

  return { speech: speech.join(' '), commands };
}

// Résout « masque à filtre », « mask_filter » ou « le filtre » en id.
export function resolveItemId(rawItem, itemIds, defs) {
  const norm = normalize(rawItem);
  if (!norm) return null;
  if (itemIds.includes(rawItem)) return rawItem;
  // 1) correspondance exacte sur l'id normalisé
  for (const id of itemIds) if (normalize(id) === norm) return id;
  // 2) le libellé normalisé contient la demande (ou l'inverse)
  let best = null;
  let bestScore = 0;
  for (const id of itemIds) {
    const label = normalize((defs[id] && defs[id].label) || id);
    let score = 0;
    if (label === norm) score = 100;
    else if (label.includes(norm)) score = 60 + norm.length;
    else if (norm.includes(label)) score = 40 + label.length;
    else {
      // mots en commun, synonymes compris
      score = Math.round(itemMatchScore(rawItem, id, defs) / 12);
    }
    if (score > bestScore) { bestScore = score; best = id; }
  }
  return bestScore >= 12 ? best : null;
}

// « 120 », « 120 écus », « cent vingt » -> nombre (ou null).
export function extractLastNumber(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/\u202f|\u00a0/g, ' ');
  const matches = cleaned.match(/(\d[\d\s]*(?:[.,]\d+)?)/g);
  if (!matches || matches.length === 0) return null;
  const last = matches[matches.length - 1].replace(/[^\d.,]/g, '').replace(',', '.');
  const n = Math.round(Number(last));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
