// ============================================================
//  AVANIA — Test du chat (global + proximité) et du réseau social
//
//  Fait tourner le VRAI server.js, y connecte de VRAIS clients (le
//  MultiplayerClient de js/net.js, celui du jeu) et de vraies requêtes
//  HTTP, puis vérifie de bout en bout :
//    - le chat global traverse le serveur sans écho vers son auteur ;
//    - les derniers messages sont rendus à un arrivant (chatHistory) ;
//    - le talkie-walkie ne touche que les joueurs proches de la même
//      zone — et ne les touche plus dès qu'ils s'éloignent ;
//    - le débit de chat est borné (une boucle côté client ne peut pas
//      saturer la bande passante de tout le monde) ;
//    - les textes sont nettoyés (caractères de contrôle, longueur) ;
//    - le réseau social : création de compte, connexion, publication,
//      j'aime, suppression, refus (pseudo pris, mauvais mot de passe,
//      publication d'un autre), et la poussée en direct du fil sur le
//      WebSocket des autres joueurs.
//
//  Lancement : npm run test:chat
// ============================================================

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MultiplayerClient } from '../js/net.js';
import {
  sanitizeChatText, sanitizeChatMessage, sanitizeSocialPost, sanitizeSocialHandle,
  sanitizeSocialPostText, PROXIMITY_PX, MAX_CHAT_LEN,
} from '../js/net-protocol.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log('  ✔ ' + msg);
  else { console.error('  ✘ ' + msg); failures++; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startServer(env) {
  const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    cwd: ROOT,
    env: { ...process.env, PORT: '0', MISTRAL_API_KEY: '', AVANIA_AI_API_KEY: '', ...env },
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

const watchdog = setTimeout(() => {
  console.error('\n❌ délai dépassé (le test ne se termine pas tout seul)');
  process.exit(1);
}, 90_000);
watchdog.unref();

// ------------------------------------------------------------
//  0) Garde-fous du protocole (logique pure, sans réseau)
// ------------------------------------------------------------
console.log('▶ Nettoyage des textes (net-protocol.js)');
assert(sanitizeChatText('  bonjour   le monde ') === 'bonjour le monde', 'les blancs superflus sont rognés');
assert(sanitizeChatText('a\u0000b\u001bc') === 'a b c', 'les caractères de contrôle sont neutralisés');
assert(sanitizeChatText('x'.repeat(500)).length === MAX_CHAT_LEN, `un message est borné à ${MAX_CHAT_LEN} caractères`);
assert(sanitizeChatText(42) === '' && sanitizeChatText(null) === '', 'autre chose qu\'une chaîne → texte vide');
assert(sanitizeChatMessage({ text: '' }) === null, 'un message sans texte est rejeté');
assert(sanitizeChatMessage({ text: 'salut', channel: 'proximity' }).channel === 'proximity',
  'le canal proximité est reconnu');
assert(sanitizeChatMessage({ text: 'salut', channel: 'nimporte quoi' }).channel === 'global',
  'un canal inconnu retombe sur global');
assert(sanitizeSocialHandle('Jean Pierre') === 'Jean_Pierre', 'les espaces d\'un pseudo deviennent des _');
assert(sanitizeSocialHandle('<script>') === '', 'un pseudo qui n\'est pas alphanumérique est refusé');
assert(sanitizeSocialHandle('Léa') === 'Léa', 'un pseudo accentué est accepté (jeu français)');
assert(sanitizeSocialPostText('a'.repeat(600)).length === 280, 'une publication est bornée à 280 caractères');
assert(PROXIMITY_PX === 320, `la portée du talkie-walkie vaut 10 tuiles (${PROXIMITY_PX} px monde)`);

let srv;
try {
  srv = await startServer();
} catch (err) {
  console.error('❌ serveur impossible à démarrer : ' + err.message);
  process.exit(1);
}
const base = `http://127.0.0.1:${srv.port}`;
const url = `ws://127.0.0.1:${srv.port}/ws`;

// ------------------------------------------------------------
//  Outils : un « joueur » = le vrai client du jeu + une position pilotée
// ------------------------------------------------------------
function makePlayer(name, x, y, zone = 'surface') {
  const inbox = [];
  const localPlayer = { x, y, facing: 'down', moving: false };
  const client = new MultiplayerClient({
    url, name, appearance: { name }, zone,
    onChat: (msg) => inbox.push(msg),
    onChatHistory: (msgs) => { player.history = msgs; },
  });
  const player = { name, client, localPlayer, inbox, history: null };
  // La boucle de jeu en tâche de fond, comme dans un vrai onglet : c'est
  // elle qui envoie la position (nécessaire au filtrage de proximité).
  player.loop = setInterval(() => client.update(0.016, localPlayer), 16);
  return player;
}

function stop(player) {
  clearInterval(player.loop);
  player.client.destroy();
}

async function until(pred, maxWaitMs = 4000, stepMs = 20) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (pred()) return true;
    await sleep(stepMs);
  }
  return pred();
}

// Attente d'un message précis dans une boîte de réception.
const hasChat = (player, text, channel) => player.inbox.some(
  (m) => m.text === text && (!channel || m.channel === channel),
);

const players = [];
try {
  // ------------------------------------------------------------
  //  1) Chat global
  // ------------------------------------------------------------
  console.log('\n▶ Chat global');
  const alice = makePlayer('Alice', 1600, 1600);
  const bob = makePlayer('Bob', 1700, 1600);
  players.push(alice, bob);

  assert(await until(() => alice.client.connected && bob.client.connected), 'les deux joueurs sont connectés');

  const sent = alice.client.sendChat('Bonjour tout le monde !', 'global');
  assert(sent === true, 'envoyer un message global renvoie true (message parti)');
  assert(await until(() => hasChat(bob, 'Bonjour tout le monde !', 'global')),
    'Bob reçoit le message global d\'Alice');
  const got = bob.inbox.find((m) => m.text === 'Bonjour tout le monde !');
  assert(got.from === 'Alice', `le message porte le bon auteur (« ${got.from} »)`);
  assert(alice.inbox.length === 0, 'l\'auteur ne reçoit pas son propre message en écho');

  assert(alice.client.sendChat('   ', 'global') === false, 'un message vide n\'est pas envoyé');

  // ------------------------------------------------------------
  //  2) Historique pour un arrivant
  // ------------------------------------------------------------
  console.log('\n▶ Historique du canal global');
  await sleep(450); // débit de chat : un message toutes les 400 ms minimum
  alice.client.sendChat('Deuxième message', 'global');
  assert(await until(() => hasChat(bob, 'Deuxième message')), 'le deuxième message arrive aussi');

  const carol = makePlayer('Carol', 1600, 1700);
  players.push(carol);
  assert(await until(() => carol.client.connected), 'Carol se connecte');
  assert(await until(() => Array.isArray(carol.history) && carol.history.length >= 2),
    'Carol reçoit l\'historique du canal global à la connexion');
  assert(carol.history.some((m) => m.text === 'Bonjour tout le monde !'),
    'l\'historique contient bien le premier message');
  assert(await until(() => hasChat(carol, 'Bonjour tout le monde !')) === false,
    'l\'historique n\'est pas rejoué comme des messages en direct');

  // ------------------------------------------------------------
  //  3) Talkie-walkie (proximité)
  // ------------------------------------------------------------
  console.log('\n▶ Chat de proximité (talkie-walkie)');
  // Bob est à 100 px d'Alice (3 tuiles) : largement dans les 320 px de portée.
  await sleep(450);
  alice.client.sendChat('Tu m\'entends, Bob ?', 'proximity');
  assert(await until(() => hasChat(bob, 'Tu m\'entends, Bob ?', 'proximity')),
    'un joueur proche reçoit le message de proximité');
  assert(await until(() => hasChat(carol, 'Tu m\'entends, Bob ?', 'proximity')),
    'les autres joueurs proches le reçoivent aussi');

  // Bob s'éloigne au-delà de la portée (20 tuiles = 640 px).
  bob.localPlayer.x = alice.localPlayer.x + 640;
  await sleep(200); // le temps que la nouvelle position parvienne au serveur
  await sleep(450);
  alice.client.sendChat('Et maintenant ?', 'proximity');
  await sleep(500);
  assert(hasChat(carol, 'Et maintenant ?', 'proximity'),
    'Carol (toujours proche) entend le deuxième message');
  assert(!hasChat(bob, 'Et maintenant ?'),
    `Bob (à ${640}px) n'entend plus rien au-delà de la portée`);

  // Un joueur dans une autre zone n'entend jamais rien, même « proche »
  // en coordonnées (la grotte réutilise les mêmes tuiles que la surface).
  const dave = makePlayer('Dave', alice.localPlayer.x, alice.localPlayer.y, 'cave:1');
  players.push(dave);
  assert(await until(() => dave.client.connected), 'Dave se connecte dans la grotte');
  await sleep(450);
  alice.client.sendChat('Quelqu\'un en bas ?', 'proximity');
  await sleep(500);
  assert(hasChat(carol, 'Quelqu\'un en bas ?', 'proximity'), 'Carol, en surface, l\'entend');
  assert(!hasChat(dave, 'Quelqu\'un en bas ?'),
    'Dave, dans la grotte aux mêmes coordonnées, ne l\'entend pas');

  // ------------------------------------------------------------
  //  4) Débit de chat borné
  // ------------------------------------------------------------
  console.log('\n▶ Débit de chat');
  for (let i = 0; i < 12; i++) carol.client.sendChat(`Spam ${i}`, 'global');
  await sleep(600);
  const spam = alice.inbox.filter((m) => m.text.startsWith('Spam ')).length;
  assert(spam >= 1 && spam <= 3, `un flot de 12 messages n'en laisse passer que ${spam} (débit borné)`);

  // ------------------------------------------------------------
  //  5) Réseau social du téléphone (HTTP + poussée en direct)
  // ------------------------------------------------------------
  console.log('\n▶ Réseau social : comptes');
  const api = async (route, body, token) => {
    const res = await fetch(`${base}/api/social${route}`, body
      ? {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Avania-Token': token } : {}) },
        body: JSON.stringify(body),
      }
      : { headers: token ? { 'X-Avania-Token': token } : {} });
    return { status: res.status, data: await res.json() };
  };

  const signupAlice = await api('/signup', { handle: 'Alice', password: 'motdepasse' });
  assert(signupAlice.status === 200 && signupAlice.data.ok === true, 'créer un compte renvoie un jeton de session');
  assert(typeof signupAlice.data.token === 'string' && signupAlice.data.token.length >= 32,
    'le jeton de session est un aléa suffisamment long');
  assert(!('password' in signupAlice.data.account), 'le mot de passe n\'est jamais renvoyé au client');

  const dup = await api('/signup', { handle: 'ALICE', password: 'autrechose' });
  assert(dup.data.reason === 'taken', 'un pseudo déjà pris est refusé (insensible à la casse)');
  const short = await api('/signup', { handle: 'Bo', password: 'motdepasse' });
  assert(short.data.reason === 'invalid-handle', 'un pseudo trop court est refusé');
  const weak = await api('/signup', { handle: 'Mallory', password: '12' });
  assert(weak.data.reason === 'weak-password', 'un mot de passe trop court est refusé');

  const signupBob = await api('/signup', { handle: 'Bob', password: 'secretbob' });
  assert(signupBob.data.ok === true, 'un deuxième compte peut être créé');
  const badLogin = await api('/login', { handle: 'Bob', password: 'mauvais' });
  assert(badLogin.data.reason === 'invalid', 'un mauvais mot de passe est refusé');
  const goodLogin = await api('/login', { handle: 'BOB', password: 'secretbob' });
  assert(goodLogin.data.ok === true, 'se reconnecter avec le bon mot de passe fonctionne');

  console.log('\n▶ Réseau social : le fil');
  const tokenA = signupAlice.data.token;
  const tokenB = goodLogin.data.token;

  const noAuth = await api('/post', { text: 'Je squatte' });
  assert(noAuth.data.reason === 'unauthorized', 'publier sans session est refusé');

  // Poussée en direct : Bob (connecté au WebSocket) doit voir passer la
  // nouveauté sans avoir à rafraîchir. L'écouteur est branché AVANT la
  // publication, sinon l'évènement part avant qu'on ne l'écoute.
  const socialEvents = [];
  const prevOnSocial = bob.client.onSocial;
  bob.client.onSocial = (payload) => socialEvents.push(payload);

  const aliceInboxBefore = bob.inbox.length;
  const posted = await api('/post', { text: 'Bienvenue à Avania !' }, tokenA);
  assert(posted.data.ok === true && posted.data.post.handle === 'Alice',
    'publier renvoie la publication horodatée');
  assert(posted.data.post.id.length > 0, 'la publication a un identifiant');

  const feed = await api('/feed');
  assert(feed.data.ok === true && feed.data.posts.length === 1, 'le fil est lisible par tout le monde');
  assert(feed.data.account === null, 'sans jeton, le fil ne révèle aucun compte');

  const liked = await api('/like', { id: posted.data.post.id }, tokenB);
  assert(liked.data.ok === true && liked.data.post.likes === 1, 'aimer une publication incrémente son compteur');
  assert(liked.data.post.likedBy.includes('Bob'), 'et note qui l\'a aimée');
  assert(await until(() => socialEvents.some((e) => e.event === 'post')),
    'les joueurs connectés reçoivent la publication en direct (message \'social\')');
  assert(await until(() => socialEvents.some((e) => e.event === 'like' && e.post.likes === 1)),
    'et le j\'aime en direct aussi');
  bob.client.onSocial = prevOnSocial;

  const second = await api('/post', { text: 'Ma maison est finie' }, tokenB);
  const feed2 = await api('/feed');
  assert(feed2.data.posts.length === 2, 'le fil contient les deux publications');
  assert(feed2.data.posts[0].id === second.data.post.id, 'la plus récente est en tête du fil');

  const steal = await api('/delete', { id: posted.data.post.id }, tokenB);
  assert(steal.data.reason === 'forbidden', 'supprimer la publication d\'un autre est refusé');
  const own = await api('/delete', { id: posted.data.post.id }, tokenA);
  assert(own.data.ok === true, 'supprimer sa propre publication fonctionne');
  const feed3 = await api('/feed');
  assert(feed3.data.posts.length === 1 && feed3.data.posts[0].id === second.data.post.id,
    'la publication supprimée a disparu du fil');

  const unlike = await api('/unlike', { id: second.data.post.id }, tokenB);
  assert(unlike.data.ok === true && unlike.data.post.likes === 0, 'retirer son j\'aime décrémente le compteur');

  const logout = await api('/logout', {}, tokenB);
  assert(logout.data.ok === true, 'se déconnecter invalide la session');
  const afterLogout = await api('/post', { text: 'Encore là ?' }, tokenB);
  assert(afterLogout.data.reason === 'unauthorized', 'un jeton déconnecté ne permet plus de publier');

  const unknown = await api('/nimportequoi');
  assert(unknown.status === 404, 'une route inconnue répond 404');

  // Le client du téléphone (js/phone.js) parle le même protocole : on
  // vérifie qu'un post reçu du réseau est accepté par son garde-fou.
  const clean = sanitizeSocialPost(posted.data.post);
  assert(clean && clean.text === 'Bienvenue à Avania !', 'une publication du serveur passe le garde-fou du client');
  assert(sanitizeSocialPost({ id: 'x', handle: '', text: 'sans auteur' }) === null,
    'une publication sans auteur valide est rejetée côté client');

  assert(aliceInboxBefore >= 0, 'les messages de chat et les évènements sociaux ne se mélangent pas');
} catch (err) {
  console.error('\n❌ exception pendant le test :\n' + (err && err.stack || err));
  failures++;
} finally {
  for (const p of players) stop(p);
  srv.child.kill();
}

console.log(failures === 0 ? '\n✅ Chat + réseau social OK' : `\n❌ ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
