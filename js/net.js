// ============================================================
//  AVANIA — Client multijoueur (présence + monde partagé + coffres + fours)
//
//  Ce module est volontairement autonome et « best effort » : si la
//  connexion échoue ou tombe, le jeu continue normalement en solo
//  (même philosophie que le cerveau de négociation local pour les
//  marchands — jamais bloquant, jamais un plantage).
//
//  Ce qu'il synchronise : position, orientation, état de marche et
//  apparence des AUTRES joueurs (étape 1), la forme du monde — blocs
//  cassés/posés, portes (étape 2) —, le contenu des coffres posés
//  (étape 3), et la progression des fours (étape 4). Seuls les mobs
//  restent locaux à chaque client.
//
//  Filtrage par « zone » : un joueur dans la grotte au niveau 3 ne
//  doit pas apparaître fantôme à la surface (les coordonnées de tuile
//  sont réutilisées d'une dimension à l'autre). Le client annonce son
//  `world.id` (ex. 'surface', 'cave:3') à chaque changement — un
//  message rare, donc un coût réseau négligeable — et n'affiche que
//  les joueurs partageant la même zone.
// ============================================================

import {
  WS_PATH, encodeInput, decodeState, sanitizeBlockDiff, sanitizeChestSlots,
  sanitizeFurnaceState,
} from './net-protocol.js';

// Cadence d'envoi de la position locale : inutile d'aller plus vite
// que le tick serveur, ça ne ferait que gonfler la bande passante
// montante pour rien (le rendu, lui, reste à 60 fps grâce au lissage).
const SEND_INTERVAL_MS = 80; // ~12,5 Hz, aligné sur le tick serveur par défaut
// Vitesse de lissage des positions distantes (plus haut = plus réactif,
// plus bas = plus fluide mais plus « en retard »).
const LERP_RATE = 12;

function defaultUrl() {
  if (typeof window === 'undefined' || !window.location) return null;
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}${WS_PATH}`;
}

export class MultiplayerClient {
  constructor({
    url = defaultUrl(), name = 'Aventurier', appearance = {}, zone = 'surface',
    // Étape 2 (monde partagé) : rappels branchés par js/main.js pour
    // appliquer au vrai World.js du jeu ce que le réseau annonce. Ce
    // module ne connaît RIEN de World.js — il ne fait que relayer.
    onBlockChange = null, // (zone, tx, ty, diff) — un bloc distant a changé
    onWorldSync = null,   // (zone, diffs[]) — resynchronisation reçue (connexion / changement de zone)
    // Étape 3 (coffres partagés) : mêmes principes, format différent
    // (un coffre entier plutôt qu'un diff — voir sendChestChange).
    onChestChange = null, // (zone, tx, ty, slots[27]) — un coffre distant a été modifié
    onChestSync = null,   // (zone, chests[]) — resynchronisation des coffres connus de la zone
    // Étape 4 (fours partagés) : même principe, un état de four complet.
    onFurnaceChange = null, // (zone, tx, ty, state) — un four distant a changé (contenu ou cuisson)
    onFurnaceSync = null,   // (zone, furnaces[]) — resynchronisation des fours connus de la zone
  } = {}) {
    this.url = url;
    this.ws = null;
    this.connected = false;
    this.localId = -1;
    this.zone = zone;
    this.name = name;
    this.appearance = appearance;
    this.onBlockChange = onBlockChange;
    this.onWorldSync = onWorldSync;
    this.onChestChange = onChestChange;
    this.onChestSync = onChestSync;
    this.onFurnaceChange = onFurnaceChange;
    this.onFurnaceSync = onFurnaceSync;
    // id distant → état rendu (forme compatible avec drawPlayer : x, y,
    // facing, moving, walkPhase, appearance).
    this.remote = new Map();
    // Tableau stable (même référence tant qu'aucun join/leave n'arrive)
    // pour éviter d'allouer un nouveau tableau à chaque frame de rendu.
    this.players = [];
    this._sendTimer = 0;
    this._lastSentSig = '';
    this._reconnectDelay = 1500;
    this._reconnectTimer = null;
    this._closedByUser = false;
    if (this.url) this._connect();
  }

  _connect() {
    if (!this.url || typeof WebSocket === 'undefined') return;
    let ws;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this._scheduleReconnect();
      return;
    }
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    ws.addEventListener('open', () => {
      this.connected = true;
      this._reconnectDelay = 1500;
      this._sendHello();
      this._sendZone(this.zone, true);
    });

    ws.addEventListener('message', (ev) => {
      if (typeof ev.data === 'string') {
        this._onJson(ev.data);
      } else {
        this._onBinary(ev.data);
      }
    });

    const onGone = () => {
      this.connected = false;
      if (this.ws === ws) this.ws = null;
      this.remote.clear();
      this._rebuildPlayers();
      if (!this._closedByUser) this._scheduleReconnect();
    };
    ws.addEventListener('close', onGone);
    ws.addEventListener('error', onGone);
  }

  _scheduleReconnect() {
    if (this._closedByUser || this._reconnectTimer) return;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this._connect();
    }, this._reconnectDelay);
    // Backoff simple : évite de marteler un serveur endormi (spin-down
    // Render) ou hors service, plafonné à 20 s.
    this._reconnectDelay = Math.min(20000, Math.round(this._reconnectDelay * 1.6));
  }

  _sendHello() {
    if (!this.connected) return;
    this.ws.send(JSON.stringify({ t: 'hello', name: this.name, appearance: this.appearance }));
  }

  setIdentity(name, appearance) {
    this.name = name;
    this.appearance = appearance;
    this._sendHello();
  }

  _sendZone(zone, force = false) {
    this.zone = zone;
    if (!this.connected) return;
    if (!force && this._lastSentZone === zone) return;
    this._lastSentZone = zone;
    this.ws.send(JSON.stringify({ t: 'zone', zone }));
  }

  // À appeler quand le joueur change de dimension (surface ↔ grotte).
  setZone(zone) {
    if (zone === this.zone) return;
    this._sendZone(zone);
    // Un changement de zone locale rend tous les distants actuellement
    // affichés potentiellement obsolètes : le prochain message JSON
    // 'zone' venant d'eux les repositionnera dans la bonne liste.
    this._rebuildPlayers();
  }

  _onJson(text) {
    let msg;
    try { msg = JSON.parse(text); } catch { return; }
    if (!msg || typeof msg !== 'object') return;

    if (msg.t === 'welcome') {
      this.localId = msg.id;
      this.remote.clear();
      for (const p of msg.players || []) {
        this.remote.set(p.id, this._makeRemote(p.id, p));
      }
      this._rebuildPlayers();
      return;
    }
    if (msg.t === 'join') {
      this.remote.set(msg.id, this._makeRemote(msg.id, msg));
      this._rebuildPlayers();
      return;
    }
    if (msg.t === 'leave') {
      this.remote.delete(msg.id);
      this._rebuildPlayers();
      return;
    }
    if (msg.t === 'appearance') {
      const r = this.remote.get(msg.id);
      if (r) {
        r.name = msg.name;
        r.appearance = { ...r.appearance, ...msg.appearance, name: msg.name };
      }
      return;
    }
    if (msg.t === 'zone') {
      const r = this.remote.get(msg.id);
      if (r) {
        r.zone = msg.zone;
        this._rebuildPlayers();
      }
      return;
    }
    // Un autre joueur a cassé/posé un bloc ou basculé une porte dans
    // NOTRE zone actuelle (le serveur ne diffuse qu'aux joueurs de la
    // même zone, mais on revérifie ici : un message peut arriver juste
    // après un changement de zone local, avant que le serveur ne le
    // sache encore).
    if (msg.t === 'block') {
      if (typeof msg.tx !== 'number' || typeof msg.ty !== 'number') return;
      const diff = sanitizeBlockDiff(msg.diff);
      if (Object.keys(diff).length === 0) return;
      if (this.onBlockChange) this.onBlockChange(this.zone, msg.tx, msg.ty, diff);
      return;
    }
    // Resynchronisation complète d'une zone (reçue à la connexion et à
    // chaque changement de zone) : une rafale de diffs déjà connus du
    // serveur pour cette zone.
    if (msg.t === 'worldSync') {
      if (!Array.isArray(msg.diffs)) return;
      if (this.onWorldSync) this.onWorldSync(msg.zone, msg.diffs);
      return;
    }
    // Un autre joueur a modifié le contenu d'un coffre ouvert (rangé ou
    // pioché un objet) dans notre zone actuelle.
    if (msg.t === 'chest') {
      if (typeof msg.tx !== 'number' || typeof msg.ty !== 'number') return;
      const slots = sanitizeChestSlots(msg.slots);
      if (this.onChestChange) this.onChestChange(this.zone, msg.tx, msg.ty, slots);
      return;
    }
    // Resynchronisation des coffres connus d'une zone (connexion / arrivée).
    if (msg.t === 'chestSync') {
      if (!Array.isArray(msg.chests)) return;
      if (this.onChestSync) this.onChestSync(msg.zone, msg.chests);
      return;
    }
    // Un autre joueur a modifié un four (contenu ou juste avancement de
    // la cuisson — voir js/game.js pour le rythme d'émission) dans
    // notre zone actuelle.
    if (msg.t === 'furnace') {
      if (typeof msg.tx !== 'number' || typeof msg.ty !== 'number') return;
      const state = sanitizeFurnaceState(msg.state);
      if (this.onFurnaceChange) this.onFurnaceChange(this.zone, msg.tx, msg.ty, state);
      return;
    }
    // Resynchronisation des fours connus d'une zone (connexion / arrivée).
    if (msg.t === 'furnaceSync') {
      if (!Array.isArray(msg.furnaces)) return;
      if (this.onFurnaceSync) this.onFurnaceSync(msg.zone, msg.furnaces);
      return;
    }
  }

  // À appeler par le jeu quand LE JOUEUR LOCAL casse/pose un bloc ou
  // bascule une porte : diffuse le changement aux autres joueurs de sa
  // zone actuelle. Message rare (une action de joueur, jamais un flot
  // par frame) : pas besoin de le compacter en binaire.
  sendBlockChange(tx, ty, diff) {
    if (!this.connected) return;
    const clean = sanitizeBlockDiff(diff);
    if (Object.keys(clean).length === 0) return;
    this.ws.send(JSON.stringify({ t: 'block', tx, ty, diff: clean }));
  }

  // À appeler par le jeu quand LE JOUEUR LOCAL modifie le contenu d'un
  // coffre ouvert : envoie l'INTÉGRALITÉ des 27 cases (voir
  // js/net-protocol.js). Pas de débit limité comme pour la position :
  // un joueur qui manipule vite son coffre ne génère qu'un message par
  // clic/glisser, jamais par frame.
  sendChestChange(tx, ty, slots) {
    if (!this.connected) return;
    this.ws.send(JSON.stringify({ t: 'chest', tx, ty, slots: sanitizeChestSlots(slots) }));
  }

  // À appeler par le jeu quand LE JOUEUR LOCAL modifie un four (dépose
  // un ingrédient/combustible, récupère la sortie), ou périodiquement
  // tant qu'il brûle (voir js/game.js pour le rythme — ce module ne
  // fait qu'envoyer ce qu'on lui donne, sans throttle de son cru).
  sendFurnaceChange(tx, ty, state) {
    if (!this.connected) return;
    this.ws.send(JSON.stringify({ t: 'furnace', tx, ty, state: sanitizeFurnaceState(state) }));
  }

  _onBinary(data) {
    const entries = decodeState(data);
    if (!entries) return;
    for (const e of entries) {
      const r = this.remote.get(e.id);
      if (!r) continue; // arrivé avant le 'join' correspondant (rare) : on ignore, le prochain tick corrigera
      r.targetX = e.x;
      r.targetY = e.y;
      r.facing = e.facing;
      r.moving = e.moving;
      // Première fois qu'on voit ce joueur bouger : on se cale
      // directement sur sa position, pas de glissade depuis (0,0).
      if (!r._seen) {
        r.x = e.x; r.y = e.y; r._seen = true;
      }
    }
  }

  _makeRemote(id, info) {
    return {
      id,
      x: info.x || 0,
      y: info.y || 0,
      targetX: info.x || 0,
      targetY: info.y || 0,
      facing: 'down',
      moving: false,
      walkPhase: 0,
      zone: info.zone || 'surface',
      name: info.name || 'Aventurier',
      appearance: { ...(info.appearance || {}), name: info.name || 'Aventurier' },
      _seen: Boolean(info.x || info.y),
    };
  }

  // Reconstruit le tableau exposé au moteur de rendu, filtré à la
  // zone locale — jamais de joueur fantôme d'une autre dimension.
  _rebuildPlayers() {
    const out = [];
    for (const r of this.remote.values()) {
      if (r.zone === this.zone) out.push(r);
    }
    this.players = out;
  }

  // Appelé chaque frame par la boucle de jeu : lisse les positions
  // distantes et envoie (au débit limité) la position locale.
  update(dt, localPlayer) {
    // Lissage des joueurs distants (dead reckoning minimal : lerp
    // simple vers la dernière position connue, aucune extrapolation).
    const k = 1 - Math.exp(-LERP_RATE * dt);
    for (const r of this.remote.values()) {
      if (r.zone !== this.zone) continue;
      r.x += (r.targetX - r.x) * k;
      r.y += (r.targetY - r.y) * k;
      if (r.moving) r.walkPhase += dt * 11;
    }

    if (!this.connected || !localPlayer) return;
    this._sendTimer += dt * 1000;
    if (this._sendTimer < SEND_INTERVAL_MS) return;
    this._sendTimer = 0;

    const x = Math.round(localPlayer.x);
    const y = Math.round(localPlayer.y);
    const sig = `${x}|${y}|${localPlayer.facing}|${localPlayer.moving ? 1 : 0}`;
    if (sig === this._lastSentSig) return; // rien de nouveau : zéro octet envoyé
    this._lastSentSig = sig;
    this.ws.send(encodeInput(x, y, localPlayer.facing, localPlayer.moving));
  }

  get playerCount() {
    // +1 pour soi-même : c'est ce que le HUD affiche déjà ailleurs.
    return this.remote.size;
  }

  destroy() {
    this._closedByUser = true;
    if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
    if (this.ws) { try { this.ws.close(); } catch { /* déjà fermé */ } }
  }
}
