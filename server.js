// ============================================================
//  AVANIA — Serveur (statique + relais des marchands)
//
//  1. Il sert les fichiers du jeu (aucune dépendance).
//  2. Il expose POST /api/merchant, qui relaie un modèle de langage
//     pour la négociation avec les marchands de la grotte.
//
//  La clé d'API ne vit QUE côté serveur : elle n'est jamais envoyée
//  au navigateur. Si aucune clé n'est configurée, l'endpoint répond
//  simplement « pas de fournisseur » et le jeu bascule sur son
//  cerveau de négociation local (js/merchant-brain.js) : tout reste
//  jouable, hors ligne compris.
//
//  Fournisseur : Mistral AI, palier gratuit « Experiment ».
//  L'API est compatible OpenAI (POST /v1/chat/completions, Bearer), donc
//  n'importe quel autre fournisseur compatible fonctionne en changeant
//  AVANIA_AI_BASE_URL et AVANIA_AI_MODEL.
//
//  Configuration (variables d'environnement) :
//    MISTRAL_API_KEY     clé Mistral (console.mistral.ai) — gratuite
//    AVANIA_AI_API_KEY   autre nom accepté pour la même clé
//    AVANIA_AI_BASE_URL  défaut : https://api.mistral.ai/v1
//    AVANIA_AI_MODEL     défaut : mistral-small-latest
// ============================================================

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachMultiplayer } from './net-server.js';
import { createSocial } from './social-server.js';

const PORT = process.env.PORT || 3000;
const ROOT = path.dirname(fileURLToPath(import.meta.url));

const AI = {
  key: process.env.MISTRAL_API_KEY || process.env.AVANIA_AI_API_KEY || '',
  baseUrl: (process.env.AVANIA_AI_BASE_URL || 'https://api.mistral.ai/v1').replace(/\/$/, ''),
  model: process.env.AVANIA_AI_MODEL || 'mistral-small-latest',
};

// ------------------------------------------------------------
//  Limiteur de débit
//
//  Le palier gratuit de Mistral impose une limite GLOBALE d'environ une
//  requête par seconde et par clé, tous modèles confondus. Deux joueurs
//  qui négocient en même temps suffiraient à déclencher un 429.
//
//  On sérialise donc les appels et on espace leurs départs. Mieux vaut
//  faire attendre une seconde que perdre la réplique. Au-delà de
//  MAX_QUEUE_WAIT on rend la main tout de suite : le client a son propre
//  délai (12 s) et bascule sur le cerveau local, donc une file qui
//  s'allonge ne doit jamais se transformer en attente silencieuse.
// ------------------------------------------------------------
const MIN_SPACING_MS = 1100;
const MAX_QUEUE_WAIT_MS = 6000;
// Après un 429, on se calme nettement plus longtemps que l'intervalle
// normal : la fenêtre de quota du palier gratuit est à la minute.
const BACKOFF_AFTER_429_MS = 15000;

let lastCallAt = 0;
let inFlight = 0;
let chain = Promise.resolve();

function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

// Rend 'queue-full' si la file est déjà trop longue pour tenir dans le
// délai du client ; sinon exécute `task` à son tour.
function scheduleAiCall(task) {
  if (inFlight * MIN_SPACING_MS > MAX_QUEUE_WAIT_MS) {
    return Promise.resolve('queue-full');
  }
  inFlight++;
  const run = chain.then(async () => {
    const wait = lastCallAt + MIN_SPACING_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();
    return task();
  });
  // La chaîne ne doit jamais rejeter, sinon tous les appels suivants
  // hériteraient de l'erreur.
  chain = run.then(() => { inFlight--; }, () => { inFlight--; });
  return run;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

// ------------------------------------------------------------
//  POST /api/merchant
// ------------------------------------------------------------
function readBody(req, limit = 64 * 1024) {
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

async function handleMerchant(req, res) {
  if (!AI.key) {
    // Aucun fournisseur configuré : le client utilisera son cerveau local.
    sendJson(res, 200, { ok: false, reason: 'no-provider' });
    return;
  }

  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch (err) {
    sendJson(res, 400, { ok: false, reason: 'bad-request', detail: err.message });
    return;
  }

  const system = typeof payload.system === 'string' ? payload.system : '';
  const message = typeof payload.message === 'string' ? payload.message.slice(0, 500) : '';
  const history = Array.isArray(payload.history)
    ? payload.history
      .filter((m) => m && typeof m.content === 'string'
        && (m.role === 'user' || m.role === 'assistant'))
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 1000) }))
    : [];

  // Un seul appel amont à la fois, espacé d'au moins MIN_SPACING_MS.
  let outcome;
  try {
    outcome = await scheduleAiCall(async () => {
      const upstream = await fetch(`${AI.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${AI.key}`,
        },
        body: JSON.stringify({
          model: AI.model,
          temperature: 0.85,
          max_tokens: 220,
          messages: [
            { role: 'system', content: system },
            ...history,
            { role: 'user', content: message },
          ],
        }),
        signal: AbortSignal.timeout(20000),
      });

      // 429 = quota du palier gratuit atteint. On se met en pause avant
      // de retenter quoi que ce soit, et on laisse le joueur sur le
      // cerveau local plutôt que de le faire attendre.
      if (upstream.status === 429) {
        lastCallAt = Date.now() + BACKOFF_AFTER_429_MS - MIN_SPACING_MS;
        return { kind: 'rate-limited' };
      }

      if (!upstream.ok) {
        const detail = (await upstream.text()).slice(0, 300);
        return { kind: 'upstream-error', status: upstream.status, detail };
      }

      const data = await upstream.json();
      const text = data?.choices?.[0]?.message?.content;
      if (typeof text !== 'string' || !text.trim()) {
        return { kind: 'empty-response' };
      }
      return { kind: 'ok', text: text.slice(0, 2000) };
    });
  } catch (err) {
    console.error('AVANIA: appel IA échoué —', err.message);
    sendJson(res, 200, { ok: false, reason: 'network', detail: err.message });
    return;
  }

  if (outcome === 'queue-full') {
    sendJson(res, 200, { ok: false, reason: 'rate-limited', detail: 'file d\'attente pleine' });
    return;
  }
  if (outcome.kind === 'rate-limited') {
    console.warn('AVANIA: quota Mistral atteint (429) — cerveau local');
    sendJson(res, 200, { ok: false, reason: 'rate-limited', status: 429 });
    return;
  }
  if (outcome.kind === 'upstream-error') {
    console.error(`AVANIA: fournisseur IA ${outcome.status} — ${outcome.detail}`);
    sendJson(res, 200, { ok: false, reason: 'upstream-error', status: outcome.status });
    return;
  }
  if (outcome.kind === 'empty-response') {
    sendJson(res, 200, { ok: false, reason: 'empty-response' });
    return;
  }
  sendJson(res, 200, { ok: true, source: 'cloud', model: AI.model, text: outcome.text });
}

// ------------------------------------------------------------
//  Réseau social du téléphone (étape 6)
//
//  Comptes, sessions et publications vivent EN MÉMOIRE côté serveur
//  (voir social-server.js) : rien n'est écrit sur le disque, tout
//  repart à zéro au redémarrage. Les nouveautés du fil sont poussées en
//  direct aux joueurs connectés via le WebSocket du jeu (la fonction
//  `broadcast` du multijoueur) — d'où la déclaration différée de
//  `multiplayer` ci-dessous, le serveur HTTP étant construit avant lui.
// ------------------------------------------------------------
let multiplayer = null;
const social = createSocial({
  broadcast: (payload) => multiplayer?.broadcast(payload),
});

// ------------------------------------------------------------
//  Fichiers statiques (+ les deux API ci-dessus)
// ------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  let urlPath;
  let query;
  try {
    const full = new URL(req.url, 'http://localhost');
    // decodeURIComponent : comme avant le passage par URL, pour que les
    // noms de fichiers accentués continuent de se servir correctement.
    urlPath = decodeURIComponent(full.pathname);
    query = full.searchParams;
  } catch {
    res.writeHead(400); res.end('400'); return;
  }

  if (urlPath === '/api/merchant') {
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, reason: 'method-not-allowed' });
      return;
    }
    await handleMerchant(req, res);
    return;
  }

  if (urlPath.startsWith('/api/social/')) {
    await social.handle(urlPath, req, res, query);
    return;
  }

  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.normalize(path.join(ROOT, urlPath));
  // sécurité : on reste dans le répertoire racine
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 - Introuvable');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(data);
  });
});

// ------------------------------------------------------------
//  Multijoueur (présence temps réel) : WebSocket sur /ws, greffé sur
//  ce même serveur HTTP — un seul process, un seul port, compatible
//  avec le déploiement Render existant (render.yaml inchangé).
// ------------------------------------------------------------
// (déclarée plus haut avec `let` : le réseau social en a besoin pour
// pousser le fil en direct, mais il est construit avant le serveur HTTP)
multiplayer = attachMultiplayer(server);

server.listen(PORT, '0.0.0.0', () => {
  // Le port réellement obtenu : avec PORT=0 c'est le système qui choisit,
  // et les tests s'appuient sur cette ligne pour le retrouver.
  console.log(`AVANIA — serveur démarré sur http://0.0.0.0:${server.address().port}`);
  console.log(AI.key
    ? `  marchands : Mistral activé (modèle ${AI.model}, ${AI.baseUrl})`
      + ` — débit limité à ~${Math.round(60000 / MIN_SPACING_MS)} appels/min`
    : '  marchands : aucune clé MISTRAL_API_KEY → cerveau de négociation local');
  console.log(`  multijoueur : WebSocket sur /ws (jusqu'à ${process.env.AVANIA_MAX_PLAYERS || 24} joueurs)`);
  console.log('  chat : canal global + talkie-walkie de proximité (relais WebSocket)');
  console.log(`  téléphone : réseau social sur /api/social/* (comptes en mémoire, ${process.env.AVANIA_SOCIAL_MAX_POSTS || 200} publications max)`);
});
