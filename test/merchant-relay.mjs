// ============================================================
//  AVANIA — Test du relais marchand (server.js ⇄ Mistral)
//
//  On ne peut pas appeler la vraie API Mistral sans clé. Ce test fait
//  donc tourner le VRAI server.js devant un amont simulé qui répond
//  exactement comme La Plateforme (POST /v1/chat/completions, Bearer,
//  choices[0].message.content) : la requête construite, l'en-tête
//  d'authentification, le modèle, l'analyse de la réponse, le limiteur
//  de débit et le repli sur 429 sont tous exercés pour de vrai.
//
//  Lancement : npm run test:relay
// ============================================================

import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log('  ✔ ' + msg);
  else { console.error('  ✘ ' + msg); failures++; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------
//  Amont simulé : la forme exacte d'une réponse Mistral
// ------------------------------------------------------------
const seen = [];
let upstreamMode = 'ok';
let replyText = 'Tiens, le voilà. /sell mask_cloth 42';

const mock = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    seen.push({
      at: Date.now(),
      url: req.url,
      auth: req.headers.authorization || '',
      contentType: req.headers['content-type'] || '',
      body: body ? JSON.parse(body) : null,
    });
    if (upstreamMode === '429') {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Rate limit reached' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: 'chatcmpl-mock',
      object: 'chat.completion',
      model: 'mistral-small-latest',
      choices: [{
        index: 0,
        message: { role: 'assistant', content: replyText },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 400, completion_tokens: 30, total_tokens: 430 },
    }));
  });
});

await new Promise((r) => mock.listen(0, '127.0.0.1', r));
const mockPort = mock.address().port;
const mockBase = `http://127.0.0.1:${mockPort}/v1`;

// ------------------------------------------------------------
//  Démarrage du vrai serveur
// ------------------------------------------------------------
function startServer(env) {
  const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    cwd: ROOT,
    env: { ...process.env, PORT: '0', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const logs = [];
  child.stdout.on('data', (d) => logs.push(d.toString()));
  child.stderr.on('data', (d) => logs.push(d.toString()));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('démarrage trop long\n' + logs.join(''))), 8000);
    const poll = setInterval(() => {
      const m = logs.join('').match(/http:\/\/0\.0\.0\.0:(\d+)/);
      if (m) {
        clearTimeout(timer);
        clearInterval(poll);
        resolve({ child, port: Number(m[1]), logs: () => logs.join('') });
      }
    }, 50);
  });
}

const post = async (port, payload) => {
  const res = await fetch(`http://127.0.0.1:${port}/api/merchant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { status: res.status, data: await res.json() };
};

const SAMPLE = {
  merchant: 'gaspard',
  system: 'Tu es Gaspard, marchand de masques. Coût de fabrication 20 écus, transport 8 écus.',
  history: [{ role: 'user', content: 'bonjour' }, { role: 'assistant', content: 'Salut l ami !' }],
  message: 'je veux ton meilleur masque',
};

const watchdog = setTimeout(() => {
  console.error('\n❌ délai dépassé');
  process.exit(1);
}, 90000);
watchdog.unref();

try {
  // ----------------------------------------------------------
  console.log('▶ Sans clé : le relais refuse poliment');
  const noKey = await startServer({ MISTRAL_API_KEY: '', AVANIA_AI_API_KEY: '' });
  {
    const r = await post(noKey.port, SAMPLE);
    assert(r.status === 200, `répond 200 (pas ${r.status}) : le jeu ne doit pas planter`);
    assert(r.data.ok === false, 'signale un échec');
    assert(r.data.reason === 'no-provider', `avec la raison « ${r.data.reason} »`);
    assert(/cerveau de négociation local/.test(noKey.logs()),
      'et l\'annonce au démarrage (repli sur le cerveau local)');
  }
  noKey.child.kill();

  // ----------------------------------------------------------
  console.log('\n▶ Avec une clé Mistral : l\'appel part correctement');
  const srv = await startServer({
    MISTRAL_API_KEY: 'msk-test-123',
    AVANIA_AI_BASE_URL: mockBase,
    AVANIA_AI_MODEL: 'mistral-small-latest',
  });
  assert(/Mistral activé/.test(srv.logs()), 'le démarrage annonce Mistral et son modèle');

  const first = await post(srv.port, SAMPLE);
  assert(first.data.ok === true, 'la réplique du modèle est relayée');
  assert(first.data.source === 'cloud', 'et marquée comme venant du cloud');
  assert(first.data.model === 'mistral-small-latest', `modèle annoncé (${first.data.model})`);
  assert(first.data.text === replyText, 'texte transmis intact (commande /sell comprise)');

  const req = seen[0];
  assert(req.url === '/v1/chat/completions', `bon point d'entrée (${req.url})`);
  assert(req.auth === 'Bearer msk-test-123', 'clé envoyée en Bearer à l\'amont uniquement');
  assert(req.contentType.includes('application/json'), 'en JSON');
  assert(req.body.model === 'mistral-small-latest', `modèle demandé (${req.body.model})`);
  assert(req.body.messages[0].role === 'system', 'le rôle du marchand passe en message système');
  assert(req.body.messages[0].content.includes('transport'),
    'avec les ancres économiques (fabrication + transport)');
  assert(req.body.messages.some((m) => m.role === 'user' && m.content === 'je veux ton meilleur masque'),
    'le message du joueur est transmis');
  assert(req.body.messages.filter((m) => m.role === 'assistant').length === 1,
    'l\'historique est repris');
  assert(req.body.max_tokens === 220, 'longueur bornée (220 jetons)');

  // ----------------------------------------------------------
  console.log('\n▶ Débit : la limite gratuite de Mistral est respectée');
  seen.length = 0;
  const t0 = Date.now();
  const parallel = await Promise.all([
    post(srv.port, SAMPLE),
    post(srv.port, SAMPLE),
    post(srv.port, SAMPLE),
  ]);
  assert(parallel.every((r) => r.data.ok === true),
    'trois joueurs qui parlent en même temps obtiennent tous une réponse');
  assert(seen.length === 3, `l'amont a bien vu trois appels (${seen.length})`);
  const gaps = seen.slice(1).map((r, i) => r.at - seen[i].at);
  assert(gaps.every((g) => g >= 1000),
    `espacés d'au moins une seconde (${gaps.join(' ms, ')} ms) — la limite gratuite est ~1 req/s`);
  assert(Date.now() - t0 < 20000, 'sans jamais dépasser le délai du client');

  // ----------------------------------------------------------
  console.log('\n▶ Quota épuisé (429) : on bascule, on n\'insiste pas');
  upstreamMode = '429';
  seen.length = 0;
  await sleep(1200);
  const limited = await post(srv.port, SAMPLE);
  assert(limited.status === 200, 'répond 200 : le jeu doit pouvoir basculer proprement');
  assert(limited.data.ok === false, 'signale un échec');
  assert(limited.data.reason === 'rate-limited', `avec la raison « ${limited.data.reason} »`);
  assert(seen.length === 1, `un seul appel envoyé, pas de retry en boucle (${seen.length})`);

  // ----------------------------------------------------------
  console.log('\n▶ Réponse inexploitable : on ne renvoie pas de vide');
  upstreamMode = 'ok';
  replyText = '   ';
  await sleep(16000);   // laisse passer la pause imposée après le 429
  const empty = await post(srv.port, SAMPLE);
  assert(empty.data.ok === false, 'une réponse blanche est refusée');
  assert(empty.data.reason === 'empty-response', `avec la raison « ${empty.data.reason} »`);

  // ----------------------------------------------------------
  console.log('\n▶ Entrée malformée : 400, pas de plantage');
  const bad = await fetch(`http://127.0.0.1:${srv.port}/api/merchant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{ json invalide',
  });
  assert(bad.status === 400, `répond 400 (${bad.status})`);
  const stillAlive = await post(srv.port, { ...SAMPLE, message: 'toujours là ?' });
  assert(stillAlive.status === 200, 'et le serveur tourne toujours après');

  // ----------------------------------------------------------
  console.log('\n▶ Quota par IP : un seul client ne peut pas tout consommer');
  upstreamMode = 'ok';
  replyText = 'Tiens, le voilà. /sell mask_cloth 42';
  // La clé Mistral est GLOBALE : sans quota par client, un seul script
  // pouvait la vider (proxy LLM gratuit). On redémarre un serveur avec
  // une limite basse pour tester vite.
  const limitedSrv = await startServer({
    MISTRAL_API_KEY: 'msk-test-123',
    AVANIA_AI_BASE_URL: mockBase,
    AVANIA_MERCHANT_RATE: '5',
  });
  {
    const burst = await Promise.all(
      Array.from({ length: 10 }, () => post(limitedSrv.port, SAMPLE)),
    );
    const oks = burst.filter((r) => r.status === 200 && r.data.ok === true).length;
    const throttled = burst.filter((r) => r.status === 429 && r.data.reason === 'rate-limited').length;
    assert(oks === 5, `les 5 premières passent (${oks})`);
    assert(throttled === 5, `les suivantes essuient un 429 (${throttled})`);
    const after = await post(limitedSrv.port, SAMPLE);
    assert(after.status === 429, 'et le quota tient toujours juste après');
  }
  limitedSrv.child.kill();

  srv.child.kill();
} catch (err) {
  console.error('\n❌ ' + (err && err.stack || err));
  failures++;
} finally {
  mock.close();
}

console.log(failures === 0 ? '\n✅ Relais marchand OK' : `\n❌ ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
