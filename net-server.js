// ============================================================
//  AVANIA — Serveur multijoueur (présence + monde partagé + coffres)
//
//  Étape 1 : chaque joueur voit les autres se déplacer en direct.
//  Étape 2 : les blocs cassés/posés et les portes sont partagés entre
//  les joueurs d'une même zone (surface, ou grotte à une profondeur
//  donnée).
//  Étape 3 : le contenu des coffres posés est partagé de la même façon
//  (voir chestJournal) — plusieurs joueurs peuvent ranger/piocher dans
//  le même coffre.
//  Étape 4 : la progression des fours (ingrédient, combustible,
//  sortie, cuisson en cours) est partagée de la même façon (voir
//  furnaceJournal) — plusieurs joueurs voient le même four cuire.
//  Étape 5 : le troupeau (moutons, vaches) est lui aussi partagé (voir
//  mobJournal) — mêmes bêtes au même endroit pour tout le monde, coups
//  et morts vus par tous ; seul le détail frame par frame de l'errance
//  (dead reckoning) reste calculé localement par chaque client.
//  Étape 6 : le chat (global + talkie-walkie de proximité, voir
//  `chatHistory` et le handler du message 'chat') et la diffusion en
//  direct du fil du réseau social (message 'social', émis par
//  social-server.js à travers la fonction `broadcast` retournée ici).
//  Le monde reste néanmoins « bête » côté serveur : PAS de World.js
//  ici, PAS de validation des règles du jeu — juste un relais + un
//  journal mémoire par zone pour resynchroniser les arrivants (voir le
//  commentaire au-dessus de `worldJournal`).
//
//  Tout ça en restant dans le budget très serré du plan gratuit Render
//  (0.1 CPU, 512 Mo, 5 Go de bande passante par mois) :
//
//   - tick serveur à 12,5 Hz (BROADCAST_INTERVAL_MS) — largement
//     suffisant pour du déplacement top-down, le client interpole ;
//   - trame de position BINAIRE (6 octets/joueur, voir net-protocol.js)
//     au lieu de JSON — un JSON équivalent pèserait ~15-20× plus lourd ;
//   - AUCUNE diffusion si rien n'a bougé (silence = zéro octet) ;
//   - les messages de bloc (rares : une action = un message, jamais un
//     flot par frame) restent en JSON compact, diffusés uniquement aux
//     joueurs de la MÊME zone, jamais à tout le monde ;
//   - un plafond dur de connexions (MAX_PLAYERS) : au-delà, le serveur
//     refuse proprement plutôt que de dégrader tout le monde ;
//   - un compteur approximatif d'octets sortants avec un seuil de
//     sécurité, pour ne jamais dépasser le quota mensuel gratuit sans
//     le savoir (voir README pour le réglage).
// ============================================================

import { WebSocketServer } from 'ws';
import {
  WS_PATH, MAX_PLAYER_ID, encodeState, decodeInput,
  sanitizeBlockDiff, sanitizeZone, validTile, sanitizeChestSlots,
  sanitizeFurnaceState, sanitizeMobList, sanitizeMobInfo,
  sanitizeMobStateList, sanitizeMobHit, sanitizeSignState, sanitizeSellerState,
  sanitizeChatText, sanitizeChatChannel, CHAT_GLOBAL, CHAT_PROXIMITY,
  PROXIMITY_PX, MAX_CHAT_HISTORY, sanitizeDropList,
} from './js/net-protocol.js';

// --- Réglages, pensés pour Render free ---
const MAX_PLAYERS = Number(process.env.AVANIA_MAX_PLAYERS || 24);
const BROADCAST_HZ = Number(process.env.AVANIA_TICK_HZ || 12.5);
const BROADCAST_INTERVAL_MS = Math.round(1000 / BROADCAST_HZ);
// Quota de messages JSON par connexion et par seconde (voir le handler
// 'message' : seau à jetons, rafale comprise).
const JSON_RATE_PER_SEC = 30;
const JSON_BURST = JSON_RATE_PER_SEC * 2;
// Nom + apparence : mis à jour rarement, en JSON (simple, coût négligeable).
const MAX_NAME_LEN = 20;

// Garde-fou de bande passante : le plan gratuit Render donne 5 Go/mois
// PARTAGÉS entre tout le workspace. On se laisse une marge large (ce
// service n'est pas seul à consommer le quota) et on coupe les
// nouvelles connexions si on l'approche, plutôt que de risquer une
// suspension du service en pleine partie.
const MONTHLY_BUDGET_BYTES = Number(process.env.AVANIA_MONTHLY_BYTES_BUDGET || 3 * 1024 * 1024 * 1024); // 3 Go par défaut (marge sous les 5 Go)
let bytesSentThisMonth = 0;
let budgetMonthKey = monthKey();

function monthKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
}
function checkMonthRollover() {
  const key = monthKey();
  if (key !== budgetMonthKey) {
    budgetMonthKey = key;
    bytesSentThisMonth = 0;
  }
}
function budgetExhausted() {
  checkMonthRollover();
  return bytesSentThisMonth >= MONTHLY_BUDGET_BYTES;
}

function sanitizeName(name) {
  const s = String(name || 'Aventurier').slice(0, MAX_NAME_LEN);
  return s.trim() || 'Aventurier';
}

// --- Monde partagé (étape 2) : journal des blocs modifiés par zone ---
//
// Le serveur reste un simple RELAIS + MÉMOIRE, jamais une autorité qui
// rejoue les règles du jeu (pas de World.js côté serveur) : on retient
// juste « en (tx,ty) de telle zone, la tuile ressemble maintenant à
// ceci », rediffusé tel quel aux autres clients de la même zone, et
// renvoyé en bloc à qui rejoint cette zone (resynchronisation).
// Compromis assumé (voir README) : un client qui rate un message reste
// désynchronisé jusqu'à son prochain changement de zone (aller-retour
// grotte/surface) — c'est acceptable pour un jeu entre amis, pas pour
// un monde persistant à fort trafic.
const MAX_ZONES = 64; // une zone = surface + jusqu'à CAVE.maxDepth niveaux, large marge
const MAX_TILES_PER_ZONE = 20000; // ~ le quart d'une carte 128×128 modifiée : très large pour un usage normal
/** @type {Map<string, Map<number, {tx:number, ty:number, diff:object}>>} */
const worldJournal = new Map();

function zoneJournal(zone) {
  let j = worldJournal.get(zone);
  if (!j) {
    if (worldJournal.size >= MAX_ZONES) {
      // Zone la plus ancienne évincée (FIFO) : mieux vaut désynchroniser
      // une zone rarement visitée que de laisser grossir la mémoire sans
      // borne sur un serveur qui tourne des jours d'affilée.
      const oldest = worldJournal.keys().next().value;
      if (oldest !== undefined) worldJournal.delete(oldest);
    }
    j = new Map();
    worldJournal.set(zone, j);
  }
  return j;
}

// Simple borne fixe (pas besoin d'importer js/config.js ici) pour un
// hash de coordonnées stable — assez large pour toutes les tailles de
// carte plausibles de ce jeu.
const MAX_WORLD_TILE_STRIDE = 4096;

function recordBlockDiff(zone, tx, ty, diff) {
  const j = zoneJournal(zone);
  const key = ty * MAX_WORLD_TILE_STRIDE + tx;
  let entry = j.get(key);
  if (!entry) {
    if (j.size >= MAX_TILES_PER_ZONE) return; // zone déjà très modifiée : on arrête d'enregistrer, sans planter
    entry = { tx, ty, diff: {} };
    j.set(key, entry);
  }
  Object.assign(entry.diff, diff);
}

// --- Coffres partagés (étape 3) : même principe que worldJournal, mais
// un coffre se remplace ENTIÈREMENT à chaque message (27 cases envoyées
// d'un bloc, voir js/net-protocol.js sanitizeChestSlots) — pas de fusion
// champ par champ comme pour les diffs de bloc. Journal séparé pour ne
// pas mélanger deux formats différents dans la même structure.
const MAX_CHESTS_PER_ZONE = 2000; // très large pour un usage normal (un coffre est un investissement de ressources)
/** @type {Map<string, Map<number, {tx:number, ty:number, slots:Array}>>} */
const chestJournal = new Map();

function zoneChestJournal(zone) {
  let j = chestJournal.get(zone);
  if (!j) {
    if (chestJournal.size >= MAX_ZONES) {
      const oldest = chestJournal.keys().next().value;
      if (oldest !== undefined) chestJournal.delete(oldest);
    }
    j = new Map();
    chestJournal.set(zone, j);
  }
  return j;
}

function recordChestSlots(zone, tx, ty, slots) {
  const j = zoneChestJournal(zone);
  const key = ty * MAX_WORLD_TILE_STRIDE + tx;
  if (!j.has(key) && j.size >= MAX_CHESTS_PER_ZONE) return; // zone déjà pleine de coffres : on arrête d'enregistrer, sans planter
  j.set(key, { tx, ty, slots });
}

// --- Fours partagés (étape 4) : même principe que chestJournal, mais
// un four vide de son contenu redevient une entrée « neutre » que l'on
// retire du journal (pas la peine de traîner indéfiniment un four
// éteint et vide dans la mémoire du serveur — recordFurnaceState s'en
// charge, voir plus bas).
const MAX_FURNACES_PER_ZONE = 2000;
/** @type {Map<string, Map<number, {tx:number, ty:number, state:object}>>} */
const furnaceJournal = new Map();

function zoneFurnaceJournal(zone) {
  let j = furnaceJournal.get(zone);
  if (!j) {
    if (furnaceJournal.size >= MAX_ZONES) {
      const oldest = furnaceJournal.keys().next().value;
      if (oldest !== undefined) furnaceJournal.delete(oldest);
    }
    j = new Map();
    furnaceJournal.set(zone, j);
  }
  return j;
}

// --- Animaux partagés (étape 5) : contrairement aux coffres/fours (un
// objet = un état), un troupeau est une COLLECTION d'animaux (clé =
// id numérique de l'animal, pas une coordonnée de tuile). Le serveur
// ne fait toujours AUCUNE simulation : il retient juste le dernier état
// connu de chaque animal (position, vie), pour resynchroniser un
// arrivant, exactement comme les autres journaux.
const MAX_MOBS_PER_ZONE = 500; // large marge au-dessus d'un troupeau réel (défaut ~17, même après beaucoup de réapparitions)
/** @type {Map<string, Map<number, object>>} */
const mobJournal = new Map();

function zoneMobJournal(zone) {
  let j = mobJournal.get(zone);
  if (!j) {
    if (mobJournal.size >= MAX_ZONES) {
      const oldest = mobJournal.keys().next().value;
      if (oldest !== undefined) mobJournal.delete(oldest);
    }
    j = new Map();
    mobJournal.set(zone, j);
  }
  return j;
}

function recordMobInfo(zone, info) {
  const j = zoneMobJournal(zone);
  if (!j.has(info.id) && j.size >= MAX_MOBS_PER_ZONE) return; // zone déjà pleine d'animaux : on arrête d'enregistrer, sans planter
  j.set(info.id, {
    id: info.id, kind: info.kind, x: info.x, y: info.y, hp: info.hp, alive: info.alive,
  });
}

function isEmptyFurnaceState(state) {
  return !state.input && !state.fuel && !state.output && state.progress === 0 && state.fuelTime === 0;
}

function recordFurnaceState(zone, tx, ty, state) {
  const j = zoneFurnaceJournal(zone);
  const key = ty * MAX_WORLD_TILE_STRIDE + tx;
  if (isEmptyFurnaceState(state)) {
    // Four vide et éteint : rien à resynchroniser, autant libérer la
    // mémoire plutôt que de garder une entrée neutre pour toujours.
    j.delete(key);
    return;
  }
  if (!j.has(key) && j.size >= MAX_FURNACES_PER_ZONE) return; // zone déjà pleine de fours : on arrête d'enregistrer, sans planter
  j.set(key, { tx, ty, state });
}

// --- Panneaux partagés : texte + propriétaire par tuile, même principe
//     que chestJournal / furnaceJournal. text === null purge l'entrée
//     (panneau cassé). ---
const signJournal = new Map();
const MAX_SIGNS_PER_ZONE = 500;

function zoneSignJournal(zone) {
  let j = signJournal.get(zone);
  if (!j) {
    if (signJournal.size >= MAX_ZONES) {
      const oldest = signJournal.keys().next().value;
      if (oldest !== undefined) signJournal.delete(oldest);
    }
    j = new Map();
    signJournal.set(zone, j);
  }
  return j;
}

function recordSignState(zone, tx, ty, text, owner) {
  const j = zoneSignJournal(zone);
  const key = ty * MAX_WORLD_TILE_STRIDE + tx;
  if (text === null) {
    // Panneau cassé : plus rien à resynchroniser.
    j.delete(key);
    return;
  }
  if (!j.has(key) && j.size >= MAX_SIGNS_PER_ZONE) return; // zone pleine : on arrête d'enregistrer, sans planter
  j.set(key, { tx, ty, text, owner });
}

// --- Sellers partagés : état complet d'un étal (stock, prix, cagnotte,
//     propriétaire), même principe que chestJournal. ---
const sellerJournal = new Map();
const MAX_SELLERS_PER_ZONE = 500;

function zoneSellerJournal(zone) {
  let j = sellerJournal.get(zone);
  if (!j) {
    if (sellerJournal.size >= MAX_ZONES) {
      const oldest = sellerJournal.keys().next().value;
      if (oldest !== undefined) sellerJournal.delete(oldest);
    }
    j = new Map();
    sellerJournal.set(zone, j);
  }
  return j;
}

function recordSellerState(zone, tx, ty, state) {
  const j = zoneSellerJournal(zone);
  const key = ty * MAX_WORLD_TILE_STRIDE + tx;
  if (state === null) {
    // Étal cassé : plus rien à resynchroniser.
    j.delete(key);
    return;
  }
  if (!j.has(key) && j.size >= MAX_SELLERS_PER_ZONE) return;
  j.set(key, { tx, ty, state });
}

function sanitizeAppearance(app) {
  // On ne fait AUCUNE hypothèse sur les valeurs valides ici (elles
  // vivent dans js/config.js, côté rendu) : on se contente de brider
  // la taille du JSON reçu pour ne jamais laisser un client envoyer
  // un objet géant.
  if (!app || typeof app !== 'object') return {};
  const out = {};
  let count = 0;
  for (const [k, v] of Object.entries(app)) {
    if (count >= 16) break; // pas plus de champs que ce que le jeu utilise réellement
    if (typeof v !== 'string' || v.length > 40) continue;
    out[k] = v;
    count += 1;
  }
  return out;
}

export function attachMultiplayer(server, { log = console.log, warn = console.warn } = {}) {
  // 4 Ko : large marge au-dessus d'un message de coffre complet (27
  // cases avec durabilité, ~1,5 Ko en JSON — voir sanitizeChestSlots),
  // tout en restant un plafond bas qui protège des abus (position et
  // changements de bloc pèsent chacun quelques dizaines d'octets).
  const wss = new WebSocketServer({ server, path: WS_PATH, maxPayload: 4096 });

  // id numérique (0..255) réutilisé dès qu'un joueur part : reste
  // compact dans la trame binaire même après beaucoup de rotations.
  const freeIds = [];
  let nextId = 0;
  function allocId() {
    if (freeIds.length) return freeIds.pop();
    if (nextId > MAX_PLAYER_ID) return -1; // plafond dur du protocole (1 octet)
    return nextId++;
  }
  function releaseId(id) { freeIds.push(id); }

  /** @type {Map<number, {ws:WebSocket, x:number, y:number, facing:string, moving:boolean, name:string, appearance:object, lastMoveAt:number}>} */
  const players = new Map();

  function playerCount() { return players.size; }

  function broadcastRaw(buf, exceptWs = null) {
    let size = 0;
    for (const p of players.values()) {
      if (p.ws === exceptWs) continue;
      if (p.ws.readyState !== p.ws.OPEN) continue;
      p.ws.send(buf);
      size += buf.byteLength || buf.length || 0;
    }
    bytesSentThisMonth += size;
  }

  function sendJson(ws, payload) {
    if (ws.readyState !== ws.OPEN) return;
    const s = JSON.stringify(payload);
    ws.send(s);
    bytesSentThisMonth += Buffer.byteLength(s);
  }

  function broadcastJson(payload, exceptWs = null) {
    const s = JSON.stringify(payload);
    let size = 0;
    for (const p of players.values()) {
      if (p.ws === exceptWs) continue;
      if (p.ws.readyState !== p.ws.OPEN) continue;
      p.ws.send(s);
      size += Buffer.byteLength(s);
    }
    bytesSentThisMonth += size;
  }

  // Comme broadcastJson, mais limité aux joueurs de la zone donnée — un
  // bloc cassé dans la grotte niveau 3 n'a aucune raison de traverser le
  // réseau vers un joueur qui est à la surface.
  function broadcastToZone(zone, payload, exceptWs = null) {
    const s = JSON.stringify(payload);
    let size = 0;
    for (const p of players.values()) {
      if (p.ws === exceptWs) continue;
      if (p.zone !== zone) continue;
      if (p.ws.readyState !== p.ws.OPEN) continue;
      p.ws.send(s);
      size += Buffer.byteLength(s);
    }
    bytesSentThisMonth += size;
  }

  // Envoie à UN client tout le journal connu d'une zone en un seul
  // message (rare : à la connexion, ou à chaque changement de zone).
  // Un journal vide (zone jamais modifiée) ne coûte que quelques
  // octets ({"t":"worldSync","zone":"surface","diffs":[]}).
  function sendWorldSync(ws, zone) {
    const j = worldJournal.get(zone);
    const diffs = j ? [...j.values()] : [];
    sendJson(ws, { t: 'worldSync', zone, diffs });
  }

  // Idem, pour le contenu des coffres connus de la zone (message séparé
  // pour ne pas mélanger deux formats — voir chestJournal). Peut peser
  // plusieurs Ko si beaucoup de coffres existent déjà dans la zone,
  // mais reste un message rare (connexion / changement de zone).
  function sendChestSync(ws, zone) {
    const j = chestJournal.get(zone);
    const chests = j ? [...j.values()] : [];
    sendJson(ws, { t: 'chestSync', zone, chests });
  }

  // Idem, pour la progression des fours connus de la zone (étape 4).
  function sendFurnaceSync(ws, zone) {
    const j = furnaceJournal.get(zone);
    const furnaces = j ? [...j.values()] : [];
    sendJson(ws, { t: 'furnaceSync', zone, furnaces });
  }

  // Idem, pour les panneaux connus de la zone (texte + propriétaire).
  function sendSignSync(ws, zone) {
    const j = signJournal.get(zone);
    const signs = j ? [...j.values()] : [];
    sendJson(ws, { t: 'signSync', zone, signs });
  }

  // Idem, pour les étals de vente connus de la zone.
  function sendSellerSync(ws, zone) {
    const j = sellerJournal.get(zone);
    const sellers = j ? [...j.values()] : [];
    sendJson(ws, { t: 'sellerSync', zone, sellers });
  }

  // Idem, pour le troupeau connu de la zone (étape 5). Un tableau VIDE
  // signifie « personne ne m'a encore dit ce qu'il y avait ici » : le
  // client qui reçoit ça sait qu'il est (probablement) le premier de
  // la zone, et doit établir le troupeau lui-même (voir js/net.js et
  // le handler du message 'mobSync' plus bas).
  function sendMobSync(ws, zone) {
    const j = mobJournal.get(zone);
    const mobs = j ? [...j.values()] : [];
    sendJson(ws, { t: 'mobSync', zone, mobs });
  }

  // ------------------------------------------------------------
  //  Chat (étape 6)
  //
  //  Deux canaux, un seul relais :
  //   - GLOBAL : retransmis à tous les joueurs connectés, quelle que
  //     soit leur zone (on discute aussi bien depuis la grotte). Les
  //     MAX_CHAT_HISTORY derniers messages sont gardés en mémoire et
  //     renvoyés à chaque arrivant, pour qu'on ne débarque pas au
  //     milieu d'une conversation muette.
  //   - PROXIMITÉ (talkie-walkie) : retransmis uniquement aux joueurs
  //     de la MÊME zone situés à moins de PROXIMITY_TILES tuiles. Le
  //     calcul se fait ICI, à partir des positions que le serveur
  //     reçoit déjà à chaque tick : un client ne peut donc pas
  //     s'inventer une portée qu'il n'a pas.
  //
  //  Dans les deux cas le message n'est PAS renvoyé à son auteur
  //  (comme pour les blocs/coffres) : le client l'affiche immédiatement
  //  en local, ce qui évite l'aller-retour visible à l'envoi.
  // ------------------------------------------------------------
  const CHAT_MIN_INTERVAL_MS = 400;      // au plus un message toutes les 400 ms
  const CHAT_BURST_MAX = 6;              // …et au plus 6 par fenêtre
  const CHAT_BURST_WINDOW_MS = 10_000;
  /** @type {Array<object>} derniers messages GLOBAUX, plus ancien en premier */
  const chatHistory = [];

  // Débit de chat d'un joueur : renvoie true s'il peut parler maintenant.
  // Sans ça, une boucle `for` côté client suffirait à saturer la bande
  // passante de tout le monde — le reste du protocole est borné par la
  // fréquence des ticks, le chat ne l'est pas.
  function chatAllowed(player) {
    const now = Date.now();
    if (now - (player.lastChatAt || 0) < CHAT_MIN_INTERVAL_MS) return false;
    if (!player.chatBurstAt || now - player.chatBurstAt > CHAT_BURST_WINDOW_MS) {
      player.chatBurstAt = now;
      player.chatBurst = 0;
    }
    if (player.chatBurst >= CHAT_BURST_MAX) return false;
    player.chatBurst += 1;
    player.lastChatAt = now;
    return true;
  }

  function pushChatHistory(message) {
    chatHistory.push(message);
    while (chatHistory.length > MAX_CHAT_HISTORY) chatHistory.shift();
  }

  // Distance de Manhattan plutôt qu'euclidienne : les deux se valent pour
  // un rayon de quelques tuiles, et celle-ci évite deux multiplications
  // et une racine par joueur testé (appelé à chaque message de proximité).
  // Les positions reçues sont en PIXELS monde (voir net-protocol.js,
  // PROXIMITY_PX) — comparer des pixels à un nombre de tuiles donnerait
  // une portée de quelques centimètres.
  function withinProximity(a, b) {
    return Math.abs(a.x - b.x) <= PROXIMITY_PX
      && Math.abs(a.y - b.y) <= PROXIMITY_PX;
  }

  function relayChat(player, rawText, rawChannel) {
    const channel = rawChannel === CHAT_PROXIMITY ? CHAT_PROXIMITY : CHAT_GLOBAL;
    const message = {
      t: 'chat',
      id: player.id,
      from: player.name,
      text: rawText,
      channel,
      ts: Date.now(),
    };
    if (channel === CHAT_GLOBAL) {
      pushChatHistory(message);
      broadcastJson(message, player.ws);
      return;
    }
    // Proximité : même zone + distance. L'auteur est exclu (il s'affiche
    // déjà lui-même), d'où le `continue` sur son propre ws.
    const s = JSON.stringify(message);
    const size = Buffer.byteLength(s);
    for (const other of players.values()) {
      if (other.ws === player.ws) continue;
      if (other.zone !== player.zone) continue;
      if (other.ws.readyState !== other.ws.OPEN) continue;
      if (!withinProximity(player, other)) continue;
      other.ws.send(s);
      bytesSentThisMonth += size;
    }
  }

  // Poussé aux joueurs connectés par le réseau social du téléphone
  // (social-server.js) : une publication, un like ou une suppression que
  // quelqu'un vient de faire, pour rafraîchir le fil en direct. Renvoyé
  // à TOUT LE MONDE y compris l'auteur — contrairement au chat, l'auteur
  // n'a pas besoin d'afficher son post lui-même avant la réponse HTTP,
  // il l'obtient justement de cette réponse (voir js/phone.js).
  function broadcast(payload) {
    broadcastJson(payload);
  }

  wss.on('connection', (ws, req) => {
    if (budgetExhausted()) {
      warn('AVANIA multi : quota de bande passante mensuel atteint — connexion refusée');
      ws.close(1013, 'quota'); // 1013 = Try Again Later
      return;
    }
    if (playerCount() >= MAX_PLAYERS) {
      ws.close(1013, 'full');
      return;
    }
    const id = allocId();
    if (id < 0) {
      ws.close(1013, 'full');
      return;
    }

    const player = {
      ws, id, x: 0, y: 0, facing: 'down', moving: false, zone: 'surface', hp: 20,
      name: 'Aventurier', appearance: {}, lastMoveAt: Date.now(),
      // Débit de chat (étape 6) : voir chatAllowed.
      lastChatAt: 0, chatBurst: 0, chatBurstAt: 0,
    };
    players.set(id, player);
    log(`AVANIA multi : joueur #${id} connecté (${playerCount()}/${MAX_PLAYERS})`);

    // 1. On donne au nouvel arrivant son id + la liste des autres.
    //    On envoie TOUT le monde (même une autre zone) : c'est un
    //    message rare, et le client sait déjà filtrer par zone.
    //    On resynchronise aussi tout de suite le monde de SA zone de
    //    départ (surface, quasi toujours) : sans ça, un joueur qui
    //    rejoint verrait les arbres/rochers déjà coupés par les autres.
    sendJson(ws, {
      t: 'welcome',
      id,
      players: [...players.values()]
        .filter((p) => p.id !== id)
        .map((p) => ({
          id: p.id, name: p.name, appearance: p.appearance, x: p.x, y: p.y, zone: p.zone,
        })),
    });
    sendWorldSync(ws, player.zone);
    sendChestSync(ws, player.zone);
    sendFurnaceSync(ws, player.zone);
    sendSignSync(ws, player.zone);
    sendSellerSync(ws, player.zone);
    sendMobSync(ws, player.zone);
    // Étape 6 (chat) : les derniers messages du canal global, pour que
    // l'arrivant voie la conversation en cours au lieu d'un chat vide.
    // Message rare (une fois par connexion), donc on ne le filtre pas.
    if (chatHistory.length > 0) {
      sendJson(ws, { t: 'chatHistory', messages: chatHistory });
    }

    // 2. On annonce le nouvel arrivant à tout le monde (apparence
    //    encore vide : elle arrive dans le prochain message 'hello').
    broadcastJson({
      t: 'join', id, name: player.name, appearance: player.appearance, zone: player.zone,
    }, ws);

    ws.on('message', (data, isBinary) => {
      if (budgetExhausted()) return; // on arrête de traiter, sans fermer brutalement en cours de session
      if (isBinary) {
        const input = decodeInput(data);
        if (!input) return;
        player.x = input.x;
        player.y = input.y;
        player.facing = input.facing;
        player.moving = input.moving;
        player.lastMoveAt = Date.now();
        return;
      }
      // Quota de messages JSON par connexion : chaque message est
      // rediffusé à N joueurs (amplification ×N), et les rares ('block',
      // 'chest'…) le sont par design. Sans quota, un script de 50
      // lignes saturait la bande passante de tout le monde et le CPU
      // du plan gratuit. Un seau à jetons simple : 30 messages/s,
      // rafale de 60 — très au-dessus de tout usage réel du jeu (un
      // clic = un message). Au-delà : ignoré, pas de déconnexion.
      const nowMs = Date.now();
      if (nowMs - (player.jsonWinAt || 0) >= 1000) {
        player.jsonWinAt = nowMs;
        player.jsonBudget = JSON_BURST;
      }
      if ((player.jsonBudget || 0) <= 0) return;
      player.jsonBudget -= 1;
      // Messages JSON, rares : identité (nom + apparence).
      let msg;
      try { msg = JSON.parse(data.toString('utf8')); } catch { return; }
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'hello') {
        player.name = sanitizeName(msg.name);
        player.appearance = sanitizeAppearance(msg.appearance);
        broadcastJson({ t: 'appearance', id, name: player.name, appearance: player.appearance }, ws);
        return;
      }
      if (msg.t === 'zone') {
        const zone = sanitizeZone(msg.zone);
        if (zone === player.zone) return;
        player.zone = zone;
        // On force la retransmission de la position au prochain tick,
        // même si elle n'a pas bougé : un joueur qui change de zone doit
        // réapparaître immédiatement pour ceux qui partagent sa nouvelle
        // zone (sinon il resterait invisible jusqu'au prochain mouvement).
        lastSentPositions.delete(id);
        broadcastJson({ t: 'zone', id, zone }, ws);
        // Rejoindre une zone = potentiellement des blocs déjà modifiés
        // par d'autres joueurs avant son arrivée : resynchronisation.
        sendWorldSync(ws, zone);
        sendChestSync(ws, zone);
        sendFurnaceSync(ws, zone);
        sendSignSync(ws, zone);
        sendSellerSync(ws, zone);
        sendMobSync(ws, zone);
        return;
      }
      // Étape 6 : un joueur parle. Le canal 'global' traverse tout le
      // serveur, le canal 'proximity' (talkie-walkie) ne touche que les
      // joueurs proches de la même zone — voir relayChat ci-dessus.
      // Un texte vide ou trop bavard (débit, voir chatAllowed) est
      // simplement ignoré : on ne ferme pas la connexion pour ça.
      if (msg.t === 'chat') {
        const text = sanitizeChatText(msg.text);
        if (!text) return;
        if (!chatAllowed(player)) return;
        relayChat(player, text, sanitizeChatChannel(msg.channel));
        return;
      }
      // Un joueur a cassé/posé un bloc ou basculé une porte : on note
      // le nouvel état dans le journal de SA zone et on rediffuse aux
      // autres joueurs qui la partagent déjà (le serveur ne valide PAS
      // la légalité du coup — voir le commentaire au-dessus de
      // worldJournal — il fait confiance au client, comme pour la
      // position ; un abus reste local à une session entre amis).
      if (msg.t === 'block') {
        const tx = Math.trunc(msg.tx);
        const ty = Math.trunc(msg.ty);
        if (!validTile(tx) || !validTile(ty)) return;
        const diff = sanitizeBlockDiff(msg.diff);
        if (Object.keys(diff).length === 0) return;
        recordBlockDiff(player.zone, tx, ty, diff);
        broadcastToZone(player.zone, { t: 'block', tx, ty, diff }, ws);
        return;
      }
      // Un joueur a modifié le contenu d'un coffre ouvert (ranger/sortir
      // un objet) : le message porte les 27 cases au complet (pas un
      // diff — voir js/net-protocol.js) ; même logique de confiance que
      // pour les blocs (voir plus haut).
      if (msg.t === 'chest') {
        const tx = Math.trunc(msg.tx);
        const ty = Math.trunc(msg.ty);
        if (!validTile(tx) || !validTile(ty)) return;
        const slots = sanitizeChestSlots(msg.slots);
        recordChestSlots(player.zone, tx, ty, slots);
        broadcastToZone(player.zone, { t: 'chest', tx, ty, slots }, ws);
        return;
      }
      // Un joueur a modifié un four (ranger/sortir un ingrédient ou du
      // combustible, ou juste une mise à jour périodique de la
      // progression pendant qu'il brûle — voir js/game.js pour le
      // rythme d'émission côté client) : même logique de confiance et
      // de journal que pour les coffres.
      if (msg.t === 'furnace') {
        const tx = Math.trunc(msg.tx);
        const ty = Math.trunc(msg.ty);
        if (!validTile(tx) || !validTile(ty)) return;
        const state = sanitizeFurnaceState(msg.state);
        recordFurnaceState(player.zone, tx, ty, state);
        broadcastToZone(player.zone, { t: 'furnace', tx, ty, state }, ws);
        return;
      }
      // Un joueur pose / écrit / casse un panneau : texte + propriétaire
      // sont journalisés par zone (resync des arrivants) et rediffusés.
      if (msg.t === 'sign') {
        const tx = Math.trunc(msg.tx);
        const ty = Math.trunc(msg.ty);
        if (!validTile(tx) || !validTile(ty)) return;
        const s = sanitizeSignState(msg);
        recordSignState(player.zone, tx, ty, s.text, s.owner);
        broadcastToZone(player.zone, { t: 'sign', tx, ty, text: s.text, owner: s.owner }, ws);
        return;
      }
      // Un étal de vente change (stock, prix, cagnotte, pose, casse) :
      // journalisé par zone et rediffusé aux voisins.
      if (msg.t === 'seller') {
        const tx = Math.trunc(msg.tx);
        const ty = Math.trunc(msg.ty);
        if (!validTile(tx) || !validTile(ty)) return;
        if (msg.state === null) {
          recordSellerState(player.zone, tx, ty, null);
          broadcastToZone(player.zone, { t: 'seller', tx, ty, state: null }, ws);
          return;
        }
        const state = sanitizeSellerState(msg.state);
        recordSellerState(player.zone, tx, ty, state);
        broadcastToZone(player.zone, { t: 'seller', tx, ty, state }, ws);
        return;
      }
      // Message ciblé (tentative de vol, alarme…) : relayé UNIQUEMENT au
      // joueur dont l'id est visé, jamais au reste de la zone.
      if (msg.t === 'notify') {
        const to = Math.trunc(Number(msg.to));
        const target = players.get(to);
        if (!target || target.ws.readyState !== target.ws.OPEN) return;
        const payload = { t: 'notify', kind: String(msg.kind || '').slice(0, 16), text: String(msg.text || '').slice(0, 140) };
        if (typeof msg.zone === 'string') payload.zone = sanitizeZone(msg.zone);
        if (Number.isFinite(Number(msg.tx))) payload.tx = Math.trunc(Number(msg.tx));
        if (Number.isFinite(Number(msg.ty))) payload.ty = Math.trunc(Number(msg.ty));
        sendJson(target.ws, payload);
        return;
      }
      // PvP : l'attaquant déclare un coup ; seule la VICTIME le reçoit et
      // applique elle-même les dégâts (elle reste autoritaire sur ses PV).
      if (msg.t === 'pattack') {
        const to = Math.trunc(Number(msg.id));
        const target = players.get(to);
        if (!target || target.ws.readyState !== target.ws.OPEN) return;
        if (target.zone !== player.zone) return; // pas de coup à travers les mondes
        const dmg = Math.max(1, Math.min(20, Math.trunc(Number(msg.dmg) || 1)));
        sendJson(target.ws, { t: 'pattack', from: id, dmg });
        return;
      }
      // PvP : un joueur annonce ses PV après un coup (ou sa mort/respawn).
      if (msg.t === 'php') {
        const hp = Math.max(0, Math.min(20, Math.trunc(Number(msg.hp) || 0)));
        player.hp = hp;
        broadcastToZone(player.zone, { t: 'php', id, hp }, ws);
        return;
      }
      // Un joueur (le premier arrivé dans une zone vide de troupeau,
      // voir js/net.js) établit le troupeau initial : le serveur
      // n'accepte cette « prise de possession » que si son journal est
      // encore vide pour cette zone — sinon un troupeau existe déjà et
      // ce message est ignoré (évite qu'un rechargement de page double
      // le troupeau en écrivant par-dessus un troupeau déjà partagé).
      if (msg.t === 'mobSync') {
        const j = zoneMobJournal(player.zone);
        if (j.size > 0) return; // troupeau déjà établi par quelqu'un d'autre : on ignore
        const mobs = sanitizeMobList(msg.mobs);
        for (const info of mobs) recordMobInfo(player.zone, info);
        broadcastToZone(player.zone, { t: 'mobSync', zone: player.zone, mobs }, ws);
        return;
      }
      // Un ou plusieurs animaux réapparaissent (repop, voir
      // js/game.js _maybeRespawnMobs) : n'importe quel client peut en
      // proposer (même logique de confiance que pour un bloc cassé).
      if (msg.t === 'mobSpawn') {
        const mobs = sanitizeMobList(msg.mobs);
        if (mobs.length === 0) return;
        for (const info of mobs) recordMobInfo(player.zone, info);
        broadcastToZone(player.zone, { t: 'mobSpawn', zone: player.zone, mobs }, ws);
        return;
      }
      // Correctif de position à basse fréquence, envoyé par le
      // coordinateur de la zone (voir js/net.js isMobCoordinator) :
      // recale doucement les simulations distantes sans jamais créer
      // ni ressusciter un animal (voir recordMobInfo : un id inconnu
      // n'est pas enregistré ici, contrairement à mobSpawn/mobSync).
      if (msg.t === 'mobState') {
        const entries = sanitizeMobStateList(msg.mobs);
        if (entries.length === 0) return;
        const j = zoneMobJournal(player.zone);
        for (const e of entries) {
          const known = j.get(e.id);
          if (known) { known.x = e.x; known.y = e.y; }
        }
        broadcastToZone(player.zone, { t: 'mobState', zone: player.zone, mobs: entries }, ws);
        return;
      }
      // Un joueur a frappé un animal (dégâts ou mise à mort) : « dernier
      // coup gagne », comme annoncé — pas de vrai propriétaire, chaque
      // client applique ses propres dégâts et diffuse le résultat.
      if (msg.t === 'mobHit') {
        const hit = sanitizeMobHit(msg.mob);
        if (!hit) return;
        const j = zoneMobJournal(player.zone);
        const known = j.get(hit.id);
        if (known) { known.hp = hit.hp; known.alive = hit.alive; }
        broadcastToZone(player.zone, { t: 'mobHit', zone: player.zone, mob: hit }, ws);
        return;
      }
      // Objets au sol partagés (butin de PvP, lâcher volontaire) : relais
      // pur à la zone, SANS journal — un drop est transitoire (quelques
      // minutes), le ramassage (« dropTaken ») le retire chez tout le
      // monde. Le quota JSON par connexion borne déjà le spam.
      if (msg.t === 'drop') {
        const drops = sanitizeDropList(msg.drops);
        if (drops.length === 0) return;
        broadcastToZone(player.zone, { t: 'drop', zone: player.zone, drops }, ws);
        return;
      }
      if (msg.t === 'dropTaken') {
        const netId = typeof msg.netId === 'string' ? msg.netId.slice(0, 32) : '';
        if (!netId) return;
        broadcastToZone(player.zone, { t: 'dropTaken', zone: player.zone, netId }, ws);
        return;
      }
    });

    ws.on('close', () => {
      players.delete(id);
      releaseId(id);
      lastSentPositions.delete(id); // pas de signature périmée réutilisée avec un id recyclé
      broadcastJson({ t: 'leave', id });
      log(`AVANIA multi : joueur #${id} déconnecté (${playerCount()}/${MAX_PLAYERS})`);
    });

    ws.on('error', () => { /* 'close' suit toujours 'error' : rien à dupliquer ici */ });
  });

  // --- Tick de diffusion des positions ---
  // On ne construit une trame QUE si un joueur a bougé depuis le
  // dernier tick, et on ne diffuse qu'aux clients concernés (tous,
  // ici — mais la vérification évite le travail quand le monde est
  // désert ou totalement immobile).
  let lastSentPositions = new Map(); // id -> "x,y,facing,moving" pour ne renvoyer que ce qui a changé
  const tickTimer = setInterval(() => {
    if (players.size === 0) return;
    if (budgetExhausted()) return;

    const changed = [];
    for (const p of players.values()) {
      const sig = `${p.x}|${p.y}|${p.facing}|${p.moving ? 1 : 0}`;
      if (lastSentPositions.get(p.id) !== sig) {
        lastSentPositions.set(p.id, sig);
        changed.push(p);
      }
    }
    if (changed.length === 0) return; // monde immobile : zéro octet envoyé

    const buf = encodeState(changed);
    broadcastRaw(buf);
  }, BROADCAST_INTERVAL_MS);
  tickTimer.unref?.();

  // Nettoyage des joueurs fantômes (connexion coupée sans handshake de
  // fermeture propre) : évite une fuite lente de mémoire/CPU sur un
  // service qui tourne plusieurs heures d'affilée.
  const STALE_MS = 60_000;
  const janitor = setInterval(() => {
    const now = Date.now();
    for (const [id, p] of players) {
      if (p.ws.readyState !== p.ws.OPEN && p.ws.readyState !== p.ws.CONNECTING) {
        players.delete(id);
        releaseId(id);
        lastSentPositions.delete(id);
        continue;
      }
      // ping natif du protocole WS : détecte les connexions mortes
      // (câble coupé, onglet tué) sans attendre un TCP timeout long.
      if (now - (p.lastPingAt || 0) > STALE_MS) {
        p.lastPingAt = now;
        try { p.ws.ping(); } catch { /* déjà fermé */ }
      }
    }
  }, 20_000);
  janitor.unref?.();

  return {
    playerCount,
    bytesSentThisMonth: () => bytesSentThisMonth,
    // Utilisé par le réseau social du téléphone (social-server.js, monté
    // dans server.js) pour pousser les nouveautés du fil à tous les
    // joueurs connectés.
    broadcast,
    close: () => { clearInterval(tickTimer); clearInterval(janitor); wss.close(); },
  };
}
