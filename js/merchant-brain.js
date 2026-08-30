// ============================================================
//  AVANIA — Le cerveau de négociation des marchands
//
//  C'est le repli LOCAL, utilisé quand aucun fournisseur d'IA n'est
//  configuré sur le serveur (et si l'appel réseau échoue). Le jeu
//  reste donc entièrement jouable hors ligne, et le marchand tient
//  son rôle dans les deux cas.
//
//  Règles du rôle :
//    • jamais de markdown, jamais d'astérisques, jamais d'action
//      décrite (« il sourit ») : uniquement ce qu'il dit à voix haute ;
//    • il ne sait PAS comment c'est fabriqué (c'est fait hors de
//      l'île), il connaît en revanche le coût du transport ;
//    • il ne descend jamais sous son prix plancher : en dessous, il
//      travaille à perte ;
//    • il s'agace, et finit par mettre le joueur dehors (/out).
//
//  Ce module est pur : ni DOM, ni réseau. Il est partagé avec le
//  serveur et couvert par les tests.
// ============================================================

import {
  MERCHANTS, MERCHANT_GOODS, costOf, suggestedPrice, normalize, extractLastNumber,
  itemMatchScore,
} from './merchant.js';

// Petit générateur déterministe par marchand : les répliques varient
// d'une partie à l'autre sans jamais dépendre de Math.random (les
// tests restent reproductibles).
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

// ------------------------------------------------------------
//  Reconnaissance d'intention (volontairement large : le joueur écrit
//  comme il parle, avec des fautes et des abréviations)
// ------------------------------------------------------------
const LEXICON = {
  greeting: ['bonjour', 'bonsoir', 'salut', 'coucou', 'hey', 'hello', 'yo ', 'yo!', 'bonjou'],
  insult: [
    'connard', 'abruti', 'imbecile', 'idiot', 'cretin', 'nul', 'naze', 'ta gueule',
    'degage', 'casse toi', 'merde', 'con ', 'salaud', 'escroc', 'voleur', 'arnaque',
    'arnaqueur', 'pourri', 'minable', 'nullos', 't es nul', 'tu crains',
  ],
  catalog: [
    'tu vends quoi', 'qu est ce que tu vends', 't as quoi', 'tu as quoi', 'montre',
    'catalogue', 'quoi comme', 'tes articles', 'tu proposes', 'quoi de beau', 'stock',
    'qu est ce que t as', 't as quoi en',
  ],
  origin: [
    'fabrique', 'fabrication', 'comment c est fait', 'fait ou', 'd ou ca vient',
    'ca vient d ou', 'origine', 'atelier', 'qui fabrique', 'c est fait ou',
    'made in', 'provenance',
  ],
  tooExpensive: [
    'trop cher', 'c est cher', 'cher', 'hors de prix', 'abusif', 'exagere',
    'pourquoi si cher', 'pourquoi ce prix', 'ca vaut pas', 'raison du prix',
  ],
  depth: ['profondeur', 'jusqu ou', 'descendre', 'profond', 'niveau', 'palier'],
  buy: [
    'je le prends', 'je la prends', 'j achete', 'je prends', 'marche conclu', 'conclu',
    'd accord', 'ok ', 'ok!', 'ok.', 'vas y', 'banco', 'je paye', 'affaire conclue',
    'c est bon je', 'je signe',
  ],
  leave: ['au revoir', 'a bientot', 'salut ', 'je pars', 'laisse tomber', 'oubliez', 'oublie', 'ciao', 'bonne journee'],
  discount: ['reduction', 'remise', 'geste', 'un effort', 'moins cher', 'baisser', 'baisse', 'rabais', 'prix d ami', 'cadeau'],
};

function hasIntent(text, key) {
  const n = ' ' + normalize(text) + ' ';
  for (const word of LEXICON[key]) if (n.includes(word)) return true;
  return false;
}

// Le joueur cite-t-il un article du marchand ?
//
// La reconnaissance passe par itemMatchScore (libellé + synonymes) :
// compter seulement la longueur du plus long mot faisait tomber
// « masque à filtre » sur le masque de toile, et « ta meilleure
// protection » ne correspondait à rien du tout chez Aldric.
function mentionedItem(text, itemIds, defs) {
  let best = null;
  let bestScore = 0;
  for (const id of itemIds) {
    const score = itemMatchScore(text, id, defs);
    if (score > bestScore) { bestScore = score; best = id; }
  }
  return best;
}

// ------------------------------------------------------------
//  Banque de répliques
// ------------------------------------------------------------
const LINES = {
  gaspard: {
    greet: [
      'Ah, une nouvelle tête ! Gaspard, pour vous servir. Je m occupe de tout ce qui se respire ici bas.',
      'Bonjour bonjour ! Vous tombez bien, le dernier arrivage vient de passer la falaise.',
      'Salut l ami ! Vous venez pour la grotte, je me trompe ? Ça se voit à la poussière sur vos chaussures.',
    ],
    catalog: [
      'J ai trois modèles. Le masque de toile, pour la poussière des premières galeries. Le masque à filtre, avec sa cartouche, quand la roche commence à chauffer. Et le masque scellé, étanche, avec réserve d air : celui là, vous ne le regretterez pas.',
      'Toile, filtre, ou scellé. C est toute ma gamme. Le premier vous dépanne, le dernier vous sauve la vie.',
    ],
    origin: [
      'La fabrication ? Ça se fait hors de l île, dans un atelier que je ne connais pas. Moi je m occupe de l acheminement, pas de la couture. Je n ai pas le détail de l atelier, désolé.',
      'Tout vient d ailleurs, mon ami. Je ne sais pas qui tient l aiguille là bas, je sais seulement ce que la traversée me coûte.',
    ],
    transport: [
      'Ce que je peux vous dire, c est le transport. Faire venir une caisse jusqu ici, ça se paye, et je le paye avant vous.',
      'Le prix, c est la fabrication plus la traversée. La fabrication, je ne la discute pas. La traversée, je la connais par cœur.',
    ],
    accept: [
      'Tope là ! Vous avez l œil, vous.',
      'Marché conclu. Vous ne le regretterez pas, croyez moi.',
      'Parfait. Je vous emballe ça.',
    ],
    counter: [
      'Vous plaisantez à moitié, je le vois bien. Coupons la poire en deux.',
      'Je peux faire un geste, mais pas un miracle. Voilà mon dernier mot.',
      'Allez, parce que c est vous. Mais c est vraiment le bout.',
    ],
    refuse: [
      'Non. Là vous me demandez de payer pour travailler.',
      'Je ne peux pas, tout simplement. La caisse ne m appartient pas encore que je la dois déjà.',
      'Ce prix là, c est non. Je préfère le garder en vitrine.',
    ],
    lowball: [
      'Vous vous moquez ? On ne va pas y passer la journée.',
      'Écoutez, je suis patient, mais il y a des limites.',
    ],
    out: [
      'Ça suffit, vous me saoulez. Dégagez de mon étal.',
      'C est bon, j ai assez perdu de temps. Dehors.',
      'Allez voir ailleurs, vous me fatiguez. Partez.',
    ],
    depth: [
      'Chaque modèle a sa profondeur. Au delà, l air ne suit plus, et c est vos poumons qui payent la différence.',
      'La profondeur, c est la seule chose qui compte ici bas. Prenez le modèle qui couvre là où vous voulez aller.',
    ],
    idle: [
      'L air est mauvais aujourd hui, vous ne trouvez pas ?',
      'Personne d autre n est passé depuis ce matin. L île est grande, les gens sont rares.',
      'Vous savez qu on compte les jours ici ? Moi oui. Chaque jour, je le note.',
    ],
    sold: [
      'J en ai déjà vendu quelques uns, vous savez. Le dernier est parti hier.',
      'Ça part doucement, mais ça part. Je ne suis pas pressé.',
    ],
  },
  aldric: {
    greet: [
      'Aldric. Armures de minage. Parlez.',
      'Vous voulez une protection ou vous regardez ?',
      'Aldric. Si vous descendez, il vous faut quelque chose sur le dos.',
    ],
    catalog: [
      'Trois modèles. Cuir, renforcée, intégrale. Plus c est bas, plus ça tombe.',
      'Cuir pour les galeries du haut. Renforcée pour le milieu. Intégrale pour le fond. Choisissez.',
    ],
    origin: [
      'Fabriqué hors de l île. Je n ai pas les détails de l atelier. Moi je vends, je ne forge pas.',
      'Pas mon atelier. Je sais ce que ça coûte à faire venir, rien de plus.',
    ],
    transport: [
      'Le transport, je le paye. Voilà pourquoi ce n est pas donné.',
      'Fabrication plus traversée. La traversée, je la connais.',
    ],
    accept: [
      'Bien. Prenez.',
      'Conclu. Bonne descente.',
      'Voilà. Ne la rayez pas.',
    ],
    counter: [
      'Non. Mais je peux descendre là.',
      'Mon dernier prix. Prenez ou laissez.',
      'Un geste. Pas deux.',
    ],
    refuse: [
      'Non.',
      'Impossible. Je perdrais de l argent.',
      'Ce prix n existe pas.',
    ],
    lowball: [
      'Vous perdez votre temps.',
      'Arrêtez.',
    ],
    out: [
      'Dehors. Maintenant.',
      'J en ai assez. Partez.',
      'Vous me faites perdre ma journée. Dehors.',
    ],
    depth: [
      'Chaque armure a sa profondeur. En dessous, la roche gagne.',
      'La profondeur décide. Pas vous.',
    ],
    idle: [
      '...',
      'La roche ne pardonne pas.',
      'Je note les jours. Celui ci est long.',
    ],
    sold: [
      'J en ai vendu. Peu.',
      'Deux cette semaine.',
    ],
  },
};

// ------------------------------------------------------------
//  Comptabilité du message
//
//  Séparée de la rédaction de la réplique : elle doit tourner QUELLE
//  QUE SOIT la source de la réponse (IA distante ou cerveau local),
//  sinon la patience du marchand ne baisserait que dans un cas sur
//  deux. Retourne true si le message était une insulte.
// ------------------------------------------------------------
export function accountMessage(state, message, now = 0) {
  const def = MERCHANTS[state.id];
  const text = String(message || '');
  state.messages += 1;
  state.patienceLeft -= 1;

  const insulted = hasIntent(text, 'insult');
  if (insulted) {
    state.mood = Math.max(0, state.mood - 0.45 * def.temper);
    state.patienceLeft -= 2;
  }
  // Une conversation qui s'étire use aussi la patience, doucement.
  if (state.messages > 8) state.patienceLeft -= 0.5;

  // Une proposition indécente répétée use la patience encore plus vite.
  if (state.lowballs >= 3) state.patienceLeft -= 2;

  return insulted;
}

// Le marchand est-il encore disposé à parler ?
export function isMerchantAvailable(state, now = 0) {
  return state.patienceLeft > 0 && (!state.cooldownUntil || now >= state.cooldownUntil);
}

// ------------------------------------------------------------
//  Réponse du marchand
//
//  state     — état mutable du marchand (article discuté, humeur…)
//  briefing  — fiche de situation (catalogue, coûts, stats du jour)
//  message   — ce que le joueur vient d'écrire
//  defs      — ITEM_DEFS, pour les libellés
//
//  La comptabilité (accountMessage) est censée avoir déjà tourné.
//  Retourne { text } : la réplique, éventuellement suivie d'une
//  commande /sell ou /out sur sa propre ligne.
// ------------------------------------------------------------
export function merchantReply(state, briefing, message, defs = {}) {
  const def = MERCHANTS[state.id];
  const lines = LINES[state.id] || LINES.gaspard;
  const rng = makeRng((state.seed || 12345) + state.messages * 7919);
  const text = String(message || '');
  const label = (id) => (defs[id] && defs[id].label)
    || briefing.catalog.find((c) => c.id === id)?.label || id;

  const push = (out, line) => { out.push(line); };
  const insulted = hasIntent(text, 'insult');

  const out = [];

  // --- 1) il met le joueur dehors ---
  if (state.patienceLeft <= 0 || (insulted && state.mood <= 0.12)) {
    state.patienceLeft = 0;
    return { text: `${pick(rng, lines.out)}\n/out` };
  }

  if (insulted) {
    push(out, pick(rng, lines.lowball));
    return { text: out.join(' ') };
  }

  // --- 2) quel article est en discussion ? ---
  const mentioned = mentionedItem(text, def.items, defs);
  if (mentioned) {
    state.discussing = mentioned;
    state.currentPrice = suggestedPrice(mentioned, def.margin);
    state.lowballs = 0;
  }

  const offer = extractLastNumber(text);
  const wantsBuy = hasIntent(text, 'buy');
  const asksCatalog = hasIntent(text, 'catalog');
  const asksOrigin = hasIntent(text, 'origin');
  const complainsPrice = hasIntent(text, 'tooExpensive');
  const asksDepth = hasIntent(text, 'depth');
  const greets = hasIntent(text, 'greeting');
  const leaves = hasIntent(text, 'leave');
  const asksDiscount = hasIntent(text, 'discount');

  // --- 3) premier contact ---
  if (state.messages === 1 && greets) {
    push(out, pick(rng, lines.greet));
    if (state.id === 'aldric') push(out, pick(rng, lines.catalog));
    return { text: out.join(' ') };
  }

  // --- 5) il s'en va ---
  if (leaves) {
    push(out, state.id === 'aldric' ? 'Au revoir.' : 'À la bonne heure. Revenez quand vous serez décidé.');
    return { text: out.join(' ') };
  }

  // --- 6) questions générales ---
  if (asksOrigin) {
    push(out, pick(rng, lines.origin));
    return { text: out.join(' ') };
  }

  if (asksCatalog && !mentioned) {
    push(out, pick(rng, lines.catalog));
    const cheapest = def.items[0];
    return { text: `${out.join(' ')}\n/sell ${cheapest} ${suggestedPrice(cheapest, def.margin)}` };
  }

  if (complainsPrice && !offer) {
    push(out, pick(rng, lines.transport));
    if (state.currentPrice && state.discussing) {
      return { text: `${out.join(' ')}\n/sell ${state.discussing} ${state.currentPrice}` };
    }
    return { text: out.join(' ') };
  }

  if (asksDepth) {
    push(out, pick(rng, lines.depth));
    if (state.discussing) {
      const item = briefing.catalog.find((c) => c.id === state.discussing);
      if (item) {
        push(out, `${label(state.discussing)} tient jusqu à la profondeur ${item.maxDepth}.`);
      }
    }
    return { text: out.join(' ') };
  }

  // --- 7) le joueur avance un prix ---
  if (offer !== null) {
    if (!state.discussing) {
      push(out, state.id === 'aldric'
        ? 'Lequel ?'
        : 'Volontiers, mais de quel modèle on parle ? J ai trois tailles sous la main.');
      return { text: out.join(' ') };
    }
    const id = state.discussing;
    const base = costOf(id);
    const floor = Math.round(base * (1 + def.minMargin));
    const current = state.currentPrice || suggestedPrice(id, def.margin);

    // Il accepte dès qu'on atteint son prix courant.
    if (offer >= current) {
      push(out, pick(rng, lines.accept));
      return { text: `${out.join(' ')}\n/sell ${id} ${offer}` };
    }

    // Au-dessus du plancher : il contre-propose, en convergent.
    if (offer >= floor) {
      const counter = Math.max(floor, Math.round(offer + (current - offer) * 0.55));
      state.currentPrice = counter;
      push(out, pick(rng, lines.counter));
      if (state.id === 'gaspard' && rng() < 0.4) push(out, `La traversée me coûte déjà ${MERCHANT_GOODS[id].transport} écus.`);
      return { text: `${out.join(' ')}\n/sell ${id} ${counter}` };
    }

    // Sous le plancher mais au-dessus du coût : refus ferme, une seule
    // petite concession possible s'il est de bonne humeur.
    if (offer >= base) {
      if (state.mood > 0.7 && (state.lowballs || 0) === 0) {
        state.currentPrice = floor;
        push(out, pick(rng, lines.counter));
        return { text: `${out.join(' ')}\n/sell ${id} ${floor}` };
      }
      push(out, pick(rng, lines.refuse));
      state.lowballs = (state.lowballs || 0) + 1;
      return { text: out.join(' ') };
    }

    // Sous le coût de revient : il s'agace.
    state.lowballs = (state.lowballs || 0) + 1;
    state.mood = Math.max(0, state.mood - 0.2 * def.temper);
    if (state.lowballs >= 3) state.patienceLeft -= 2;
    push(out, pick(rng, state.lowballs >= 2 ? lines.lowball : lines.refuse));
    return { text: out.join(' ') };
  }

  // --- 8) le joueur accepte le dernier prix proposé ---
  if (wantsBuy) {
    if (!state.discussing || !state.currentPrice) {
      push(out, state.id === 'aldric' ? 'Lequel ?' : 'Dites moi lequel vous voulez et je vous le mets de côté.');
      return { text: out.join(' ') };
    }
    push(out, pick(rng, lines.accept));
    return { text: `${out.join(' ')}\n/sell ${state.discussing} ${state.currentPrice}` };
  }

  // --- 9) il a cité un article : il l'annonce et le propose ---
  if (mentioned) {
    const id = mentioned;
    const item = briefing.catalog.find((c) => c.id === id);
    const intro = state.id === 'aldric'
      ? `${label(id)}. ${item ? `Profondeur ${item.maxDepth}.` : ''}`
      : `Excellent choix, le ${label(id).toLowerCase()}.`
        + (item ? ` Celui là vous emmène jusqu à la profondeur ${item.maxDepth}.` : '');
    push(out, intro);
    if (asksDiscount) push(out, pick(rng, lines.counter));
    return { text: `${out.join(' ')}\n/sell ${id} ${state.currentPrice}` };
  }

  // --- 10) demande de réduction sans article précis ---
  if (asksDiscount) {
    push(out, state.id === 'aldric'
      ? 'Les remises, c est non.'
      : 'Je ne fais pas de remise à l aveugle, mon ami. Dites moi ce que vous voulez et on en reparle.');
    return { text: out.join(' ') };
  }

  // --- 11) petite discussion : il reste dans son rôle ---
  const pool = [];
  pool.push(pick(rng, lines.idle));
  if (state.soldCount > 0) pool.push(pick(rng, lines.sold));
  if (state.day > 1) {
    pool.push(state.id === 'aldric'
      ? `Jour ${state.day} sur l île.`
      : `Voilà ${state.day} jours que je suis sur cette île, et je ne m en lasse pas.`);
  }
  if (state.totalPlayers <= 1) {
    pool.push(state.id === 'aldric'
      ? 'Vous êtes seul sur l île. Autant dire que je ne vends pas beaucoup.'
      : 'Entre nous, vous êtes le premier client que je vois. Alors soignez moi.');
  }
  push(out, pick(rng, pool));
  return { text: out.join(' ') };
}

// Message d'ouverture quand le joueur engage la conversation.
export function merchantGreeting(state, briefing, defs = {}) {
  const def = MERCHANTS[state.id];
  const lines = LINES[state.id] || LINES.gaspard;
  const rng = makeRng((state.seed || 12345) + 31);
  if (state.cooldownUntil && state.now !== undefined && state.now < state.cooldownUntil) {
    return { text: '' };
  }
  // Si une négociation est déjà engagée (le joueur revient), on salue sans
  // re-proposer l'article le moins cher : cela écraserait l'offre en cours
  // que le comptoir fait réapparaître à la réouverture.
  const inNegotiation = !!state.discussing;
  if (state.id === 'aldric' || inNegotiation) {
    return { text: `${pick(rng, lines.greet)} ${pick(rng, lines.catalog)}` };
  }
  const first = def.items[0];
  return {
    text: `${pick(rng, lines.greet)} ${pick(rng, lines.catalog)}`
      + `\n/sell ${first} ${suggestedPrice(first, def.margin)}`,
  };
}
