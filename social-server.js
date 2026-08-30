// ============================================================
//  AVANIA — Le réseau social du téléphone (côté serveur)
//
//  Ce que le joueur voit dans son téléphone (js/phone.js) : créer un
//  compte (pseudo + mot de passe), se connecter, publier sur le fil,
//  aimer les publications des autres, supprimer les siennes. Tout le
//  monde voit le même fil — il est global au serveur, comme le chat
//  global.
//
//  Pourquoi HTTP et pas WebSocket ?
//    Les actions du fil sont des REQUÊTES AVEC RÉPONSE (« crée-moi ce
//    compte et dis-moi si le pseudo est pris », « publie et renvoie-moi
//    le post horodaté »). Le WebSocket du jeu, lui, est un canal de
//    diffusion sans réponse. On garde donc le même découpage que pour
//    les marchands (POST /api/merchant) : HTTP pour la requête/réponse,
//    et le WebSocket UNIQUEMENT pour pousser en direct la nouveauté aux
//    autres joueurs (message 'social', voir `broadcast`).
//
//  Persistance : AUCUNE, volontairement (choix assumé, voir README).
//  Comptes, sessions et publications vivent dans des Map/Array en
//  mémoire : ils disparaissent au redémarrage du serveur, exactement
//  comme les journaux de blocs/coffres/fours de net-server.js. Rien
//  n'est écrit sur le disque — le service reste sans état entre deux
//  déploiements, ce qui tombe bien sur le plan gratuit de Render où le
//  système de fichiers est de toute façon éphémère.
//
//  Sécurité : le mot de passe n'est JAMAIS stocké ni renvoyé en clair
//  (scrypt + sel par compte, comparaison en temps constant), la session
//  est un jeton aléatoire à durée de vie limitée, et chaque endpoint
//  borné par un limiteur de débit par adresse IP.
// ============================================================

import crypto from 'node:crypto';
import {
  sanitizeSocialHandle, sanitizeSocialPassword, sanitizeSocialPostText,
  SOCIAL_HANDLE_MIN, SOCIAL_HANDLE_MAX, SOCIAL_PASSWORD_MIN,
} from './js/net-protocol.js';

// --- Réglages, pensés pour un serveur gratuit à 0.1 CPU ---
const MAX_ACCOUNTS = Number(process.env.AVANIA_SOCIAL_MAX_ACCOUNTS || 500);
const MAX_POSTS = Number(process.env.AVANIA_SOCIAL_MAX_POSTS || 200);
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 jours
// scrypt : N=16384 coûte ~50 ms de CPU. Acceptable pour une création de
// compte (rare), inacceptable si on pouvait en enchaîner des centaines
// par seconde — d'où le limiteur de débit ci-dessous.
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };
// Débit : fenêtre glissante d'une minute, par adresse IP.
const AUTH_WINDOW_MS = 60_000;
const AUTH_MAX_PER_WINDOW = 12;   // créations/connexions
const POST_MAX_PER_WINDOW = 20;   // publications + likes + suppressions

function nowMs() { return Date.now(); }

// Limiteur de débit minimal (compteur + remise à zéro à la fin de la
// fenêtre). Pas de dépendance, pas de structure qui grossit : les
// entrées expirées sont purgées à chaque appel.
class RateLimiter {
  constructor(windowMs = AUTH_WINDOW_MS) {
    this.windowMs = windowMs;
    this.hits = new Map(); // clé -> { count, resetAt }
  }

  _purge(now) {
    if (this.hits.size < 64) return;
    for (const [key, entry] of this.hits) {
      if (entry.resetAt <= now) this.hits.delete(key);
    }
  }

  // Renvoie true si l'action est acceptée (et la compte), false sinon.
  allow(key, max) {
    const now = nowMs();
    this._purge(now);
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (entry.count >= max) return false;
    entry.count += 1;
    return true;
  }
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, SCRYPT.keylen, {
    N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p,
  });
}

// Comparaison en temps constant : évite de laisser deviner un mot de
// passe octet par octet à force de mesures (défense standard, gratuite).
function sameHash(a, b) {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function newToken() {
  return crypto.randomBytes(24).toString('hex');
}

function newPostId() {
  return crypto.randomBytes(9).toString('base64url');
}

// Renvoie la publication telle qu'elle est envoyée au client : jamais de
// champ interne (pas de sel, pas de hachage), et les bornes partagées du
// protocole sont réappliquées en sortie pour qu'un post stocké ne puisse
// jamais sortir « sale » du serveur.
function publicPost(post) {
  return {
    id: post.id,
    handle: post.handle,
    text: post.text,
    ts: post.ts,
    likes: post.likedBy.length,
    likedBy: [...post.likedBy],
  };
}

export function createSocial({ broadcast = () => {}, log = console.log } = {}) {
  /** @type {Map<string, {handle:string, salt:Buffer, hash:Buffer, createdAt:number}>} */
  const accounts = new Map(); // clé = pseudo en minuscules (insensible à la casse)
  /** @type {Map<string, {handle:string, expiresAt:number}>} */
  const sessions = new Map();
  /** @type {Array<object>} publications, plus récente en premier */
  const posts = [];
  /** @type {Map<string, object>} id -> publication (accès direct pour like/delete) */
  const postIndex = new Map();

  const authLimiter = new RateLimiter(AUTH_WINDOW_MS);
  const actionLimiter = new RateLimiter(AUTH_WINDOW_MS);

  function sweepSessions() {
    const now = nowMs();
    for (const [token, s] of sessions) {
      if (s.expiresAt <= now) sessions.delete(token);
    }
  }

  function accountOf(token) {
    if (!token || typeof token !== 'string') return null;
    const session = sessions.get(token);
    if (!session) return null;
    if (session.expiresAt <= nowMs()) {
      sessions.delete(token);
      return null;
    }
    return accounts.get(session.handle.toLowerCase()) || null;
  }

  // ------------------------------------------------------------
  //  Actions (testables sans HTTP : test/chat-social.mjs les appelle
  //  directement, et le routeur ci-dessous ne fait que les exposer)
  // ------------------------------------------------------------

  function signup({ handle, password }) {
    const clean = sanitizeSocialHandle(handle);
    if (!clean || clean.length < SOCIAL_HANDLE_MIN || clean.length > SOCIAL_HANDLE_MAX) {
      return { ok: false, reason: 'invalid-handle' };
    }
    const pass = sanitizeSocialPassword(password);
    if (pass.length < SOCIAL_PASSWORD_MIN) return { ok: false, reason: 'weak-password' };
    const key = clean.toLowerCase();
    if (accounts.has(key)) return { ok: false, reason: 'taken' };
    if (accounts.size >= MAX_ACCOUNTS) return { ok: false, reason: 'accounts-full' };

    const salt = crypto.randomBytes(16);
    const account = { handle: clean, salt, hash: hashPassword(pass, salt), createdAt: nowMs() };
    accounts.set(key, account);
    const token = newToken();
    sessions.set(token, { handle: clean, expiresAt: nowMs() + SESSION_TTL_MS });
    log(`AVANIA social : compte « ${clean} » créé`);
    return { ok: true, token, account: { handle: clean, createdAt: account.createdAt } };
  }

  function login({ handle, password }) {
    sweepSessions();
    const clean = sanitizeSocialHandle(handle);
    if (!clean) return { ok: false, reason: 'invalid' };
    const account = accounts.get(clean.toLowerCase());
    // Même message d'erreur pour « pseudo inconnu » et « mauvais mot de
    // passe » : on ne dit pas à un curieux quels pseudos existent.
    if (!account) return { ok: false, reason: 'invalid' };
    const candidate = hashPassword(sanitizeSocialPassword(password), account.salt);
    if (!sameHash(candidate, account.hash)) return { ok: false, reason: 'invalid' };
    const token = newToken();
    sessions.set(token, { handle: account.handle, expiresAt: nowMs() + SESSION_TTL_MS });
    return { ok: true, token, account: { handle: account.handle, createdAt: account.createdAt } };
  }

  function logout(token) {
    if (token && typeof token === 'string') sessions.delete(token);
    return { ok: true };
  }

  function publish(token, text) {
    const account = accountOf(token);
    if (!account) return { ok: false, reason: 'unauthorized' };
    const clean = sanitizeSocialPostText(text);
    if (!clean) return { ok: false, reason: 'empty' };
    if (!actionLimiter.allow(account.handle, POST_MAX_PER_WINDOW)) {
      return { ok: false, reason: 'rate-limited' };
    }
    const post = {
      id: newPostId(),
      handle: account.handle,
      text: clean,
      ts: nowMs(),
      likedBy: [],
    };
    posts.unshift(post);
    postIndex.set(post.id, post);
    // Fil borné : les plus anciennes publications sont oubliées (un fil
    // infini n'a pas sa place sur un serveur gratuit sans base de données).
    while (posts.length > MAX_POSTS) {
      const dropped = posts.pop();
      postIndex.delete(dropped.id);
    }
    const out = publicPost(post);
    broadcast({ t: 'social', event: 'post', post: out });
    return { ok: true, post: out };
  }

  function setLike(token, id, wanted) {
    const account = accountOf(token);
    if (!account) return { ok: false, reason: 'unauthorized' };
    const post = postIndex.get(typeof id === 'string' ? id : '');
    if (!post) return { ok: false, reason: 'not-found' };
    if (!actionLimiter.allow(account.handle, POST_MAX_PER_WINDOW)) {
      return { ok: false, reason: 'rate-limited' };
    }
    const at = post.likedBy.indexOf(account.handle);
    if (wanted && at < 0) post.likedBy.push(account.handle);
    if (!wanted && at >= 0) post.likedBy.splice(at, 1);
    const out = publicPost(post);
    broadcast({ t: 'social', event: 'like', post: out });
    return { ok: true, post: out };
  }

  function removePost(token, id) {
    const account = accountOf(token);
    if (!account) return { ok: false, reason: 'unauthorized' };
    const post = postIndex.get(typeof id === 'string' ? id : '');
    if (!post) return { ok: false, reason: 'not-found' };
    // Seul son auteur retire une publication (pas de modération ici).
    if (post.handle.toLowerCase() !== account.handle.toLowerCase()) {
      return { ok: false, reason: 'forbidden' };
    }
    postIndex.delete(post.id);
    const at = posts.indexOf(post);
    if (at >= 0) posts.splice(at, 1);
    broadcast({ t: 'social', event: 'delete', id: post.id, by: account.handle });
    return { ok: true, id: post.id };
  }

  function feed(token) {
    sweepSessions();
    const account = accountOf(token);
    return {
      ok: true,
      posts: posts.map(publicPost),
      account: account ? { handle: account.handle, createdAt: account.createdAt } : null,
      stats: { accounts: accounts.size, posts: posts.length },
    };
  }

  // ------------------------------------------------------------
  //  Routeur HTTP (monté par server.js sur /api/social/*)
  // ------------------------------------------------------------
  function readBody(req, limit = 16 * 1024) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > limit) {
          reject(new Error('Corps de requête trop volumineux'));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }

  function sendJson(res, status, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
      'Cache-Control': 'no-store',
    });
    res.end(body);
  }

  // Le jeton de session peut arriver dans l'en-tête X-Avania-Token (le
  // client du jeu fait ça) ou dans le corps/query, au cas où un appel
  // externe n'aurait pas la main sur les en-têtes.
  function tokenFrom(req, body) {
    const header = req.headers?.['x-avania-token'];
    if (typeof header === 'string' && header) return header;
    if (body && typeof body.token === 'string' && body.token) return body.token;
    return '';
  }

  function clientIp(req) {
    // Derrière un reverse proxy (Render, nginx…), remoteAddress est le
    // proxy : TOUS les joueurs partagent alors le même seau du limiteur,
    // et douze connexions toutes joueurs confondues suffisent à se faire
    // jeter (429). On retient le DERNIER maillon de X-Forwarded-For :
    // le PREMIER est écrit par le client lui-même (forgeable à volonté,
    // donc inutile comme clé de limiteur) ; le dernier est celui
    // qu'ajoute le proxy de confiance. Sans proxy, pas d'en-tête → socket.
    const forwarded = req.headers?.['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
      const hops = forwarded.split(',').map((h) => h.trim()).filter(Boolean);
      if (hops.length) return hops[hops.length - 1];
    }
    return req.socket?.remoteAddress || 'inconnue';
  }

  async function handle(pathname, req, res, query = {}) {
    const ip = clientIp(req);

    if (req.method === 'GET') {
      if (pathname === '/api/social/feed') {
        // Le jeton peut arriver dans l'en-tête X-Avania-Token (le client
        // du jeu) OU dans la query (appels externes). Avant, la query
        // seule était lue : le jeton du jeu n'était jamais vu, le fil
        // répondait account:null, et le client se déconnectait aussitôt —
        // « la création de compte ne marche pas », alors qu'elle avait
        // réussi : c'est le fil qui perdait la session.
        const headerToken = tokenFrom(req, null);
        const queryToken = query.get?.('token') || '';
        return sendJson(res, 200, feed(headerToken || queryToken));
      }
      return sendJson(res, 404, { ok: false, reason: 'not-found' });
    }

    if (req.method !== 'POST') {
      return sendJson(res, 405, { ok: false, reason: 'method-not-allowed' });
    }

    let body = {};
    try {
      const raw = await readBody(req);
      body = raw ? JSON.parse(raw) : {};
    } catch (err) {
      return sendJson(res, 400, { ok: false, reason: 'bad-request', detail: err.message });
    }
    if (!body || typeof body !== 'object') body = {};
    const token = tokenFrom(req, body);

    // Création de compte / connexion : coûteux en CPU (scrypt) ET la
    // seule porte d'entrée d'un compte — débit limité par adresse IP.
    if (pathname === '/api/social/signup' || pathname === '/api/social/login') {
      if (!authLimiter.allow(ip, AUTH_MAX_PER_WINDOW)) {
        return sendJson(res, 429, { ok: false, reason: 'rate-limited' });
      }
      const result = pathname === '/api/social/signup'
        ? signup(body)
        : login(body);
      return sendJson(res, result.ok ? 200 : 400, result);
    }

    if (pathname === '/api/social/logout') {
      return sendJson(res, 200, logout(token));
    }
    if (pathname === '/api/social/post') {
      const result = publish(token, body.text);
      return sendJson(res, result.ok ? 200 : 400, result);
    }
    if (pathname === '/api/social/like') {
      const result = setLike(token, body.id, true);
      return sendJson(res, result.ok ? 200 : 400, result);
    }
    if (pathname === '/api/social/unlike') {
      const result = setLike(token, body.id, false);
      return sendJson(res, result.ok ? 200 : 400, result);
    }
    if (pathname === '/api/social/delete') {
      const result = removePost(token, body.id);
      return sendJson(res, result.ok ? 200 : 400, result);
    }

    return sendJson(res, 404, { ok: false, reason: 'not-found' });
  }

  return {
    handle,
    // Exposé pour les tests (et pour d'éventuels scripts) : la logique
    // métier sans passer par la couche HTTP.
    signup, login, logout, publish, like: (t, id) => setLike(t, id, true),
    unlike: (t, id) => setLike(t, id, false), remove: removePost, feed,
    stats: () => ({ accounts: accounts.size, posts: posts.length, sessions: sessions.size }),
  };
}
