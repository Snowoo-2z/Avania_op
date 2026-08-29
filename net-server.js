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
//  Le monde reste néanmoins « bête » côté serveur : PAS de World.js
//  ici, PAS de validation des règles du jeu — juste un relais + un
//  journal mémoire par zone pour resynchroniser les arrivants (voir le
//  commentaire au-dessus de `worldJournal`). Seuls les mobs restent
//  locaux à chaque client.
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
  sanitizeFurnaceState,
} from './js/net-protocol.js';

// --- Réglages, pensés pour Render free ---
const MAX_PLAYERS = Number(process.env.AVANIA_MAX_PLAYERS || 24);
const BROADCAST_HZ = Number(process.env.AVANIA_TICK_HZ || 12.5);
const BROADCAST_INTERVAL_MS = Math.round(1000 / BROADCAST_HZ);
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
      ws, id, x: 0, y: 0, facing: 'down', moving: false, zone: 'surface',
      name: 'Aventurier', appearance: {}, lastMoveAt: Date.now(),
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
      }
    });

    ws.on('close', () => {
      players.delete(id);
      releaseId(id);
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
    close: () => { clearInterval(tickTimer); clearInterval(janitor); wss.close(); },
  };
}
