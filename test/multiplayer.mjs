// ============================================================
//  AVANIA — Test du serveur multijoueur (net-server.js)
//
//  Fait tourner le VRAI serveur (server.js), y connecte de vrais
//  clients WebSocket (le paquet `ws`), et vérifie le protocole de
//  bout en bout : accueil, annonce des autres joueurs, diffusion des
//  positions en binaire, départ propre, et le plafond de connexions.
//
//  Lancement : npm run test:multiplayer
// ============================================================

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { encodeInput, decodeState, WS_PATH } from '../js/net-protocol.js';

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

function connect(port) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${WS_PATH}`);
    ws.binaryType = 'nodebuffer';
    const timer = setTimeout(() => reject(new Error('connexion WS trop longue')), 4000);
    ws.once('open', () => { clearTimeout(timer); resolve(ws); });
    ws.once('error', reject);
  });
}

function waitForJson(ws, predicate, maxWaitMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout attente message JSON')), maxWaitMs);
    function onMessage(data, isBinary) {
      if (isBinary) return;
      let msg;
      try { msg = JSON.parse(data.toString('utf8')); } catch { return; }
      if (predicate(msg)) {
        clearTimeout(timer);
        ws.off('message', onMessage);
        resolve(msg);
      }
    }
    ws.on('message', onMessage);
  });
}

function waitForBinary(ws, maxWaitMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout attente trame binaire')), maxWaitMs);
    function onMessage(data, isBinary) {
      if (!isBinary) return;
      clearTimeout(timer);
      ws.off('message', onMessage);
      resolve(data);
    }
    ws.on('message', onMessage);
  });
}

const watchdog = setTimeout(() => {
  console.error('\n❌ délai dépassé (le test ne se termine pas tout seul)');
  process.exit(1);
}, 60000);
watchdog.unref();

let srv;
try {
  console.log('▶ Accueil et annonce d\'un nouvel arrivant');
  srv = await startServer({ AVANIA_MAX_PLAYERS: '3', AVANIA_TICK_HZ: '20' });
  await sleep(50); // laisse le temps à la dernière ligne de log (console.log après listen) d'arriver
  assert(/multijoueur : WebSocket/.test(srv.logs()), 'le démarrage annonce le multijoueur');

  const alice = await connect(srv.port);
  const welcomeAlice = await waitForJson(alice, (m) => m.t === 'welcome');
  assert(typeof welcomeAlice.id === 'number', `Alice reçoit un id (${welcomeAlice.id})`);
  assert(Array.isArray(welcomeAlice.players) && welcomeAlice.players.length === 0,
    'Alice est seule au départ');

  const bob = await connect(srv.port);
  const joinSeenByAlice = waitForJson(alice, (m) => m.t === 'join');
  const welcomeBob = await waitForJson(bob, (m) => m.t === 'welcome');
  assert(welcomeBob.id !== welcomeAlice.id, 'Bob reçoit un id différent d\'Alice');
  assert(welcomeBob.players.some((p) => p.id === welcomeAlice.id), 'Bob voit Alice dans la liste d\'accueil');
  const joinMsg = await joinSeenByAlice;
  assert(joinMsg.id === welcomeBob.id, 'Alice est notifiée de l\'arrivée de Bob');

  console.log('\n▶ Identité (nom + apparence)');
  bob.send(JSON.stringify({ t: 'hello', name: 'Bobby', appearance: { skin: 'peche', hairStyle: 'court' } }));
  const appearanceMsg = await waitForJson(alice, (m) => m.t === 'appearance' && m.id === welcomeBob.id);
  assert(appearanceMsg.name === 'Bobby', `le nom de Bob est propagé (${appearanceMsg.name})`);
  assert(appearanceMsg.appearance.skin === 'peche', 'son apparence aussi');

  console.log('\n▶ Diffusion des positions (trame binaire compacte)');
  bob.send(encodeInput(400, 250, 'right', true));
  const stateBuf = await waitForBinary(alice);
  const entries = decodeState(stateBuf);
  assert(Array.isArray(entries) && entries.length >= 1, 'Alice reçoit une trame de positions');
  const bobEntry = entries.find((e) => e.id === welcomeBob.id);
  assert(Boolean(bobEntry), 'la position de Bob y figure');
  assert(bobEntry && bobEntry.x === 400 && bobEntry.y === 250, `coordonnées transmises intactes (${bobEntry && bobEntry.x},${bobEntry && bobEntry.y})`);
  assert(bobEntry && bobEntry.facing === 'right', `orientation transmise (${bobEntry && bobEntry.facing})`);
  assert(bobEntry && bobEntry.moving === true, 'état de mouvement transmis');

  console.log('\n▶ Silence quand rien ne bouge (économie de bande passante)');
  let extraFrame = false;
  const onExtra = (data, isBinary) => { if (isBinary) extraFrame = true; };
  alice.on('message', onExtra);
  await sleep(300); // largement plus qu'un tick (50 ms à 20 Hz)
  alice.off('message', onExtra);
  assert(!extraFrame, 'aucune trame renvoyée si aucune position n\'a changé depuis la dernière');

  console.log('\n▶ Départ propre');
  const leaveSeenByAlice = waitForJson(alice, (m) => m.t === 'leave' && m.id === welcomeBob.id);
  bob.close();
  const leaveMsg = await leaveSeenByAlice;
  assert(leaveMsg.id === welcomeBob.id, 'Alice est notifiée du départ de Bob');

  console.log('\n▶ Zones (surface / grotte) : un joueur change de dimension');
  const zoraine = await connect(srv.port);
  const zoraineWelcome = await waitForJson(zoraine, (m) => m.t === 'welcome');
  const zoneSeenByAlice = waitForJson(alice, (m) => m.t === 'zone' && m.id === zoraineWelcome.id);
  zoraine.send(JSON.stringify({ t: 'zone', zone: 'cave:2' }));
  const zoneMsg = await zoneSeenByAlice;
  assert(zoneMsg.zone === 'cave:2', `le changement de zone est propagé (${zoneMsg.zone})`);
  zoraine.close();

  // MAX_PLAYERS vaut 3 pour ce test, et Alice reste connectée jusqu'à la
  // toute fin (elle sert au test de plafond) : on ne garde donc jamais
  // plus de 2 connexions supplémentaires ouvertes à la fois ci-dessous.
  console.log('\n▶ Monde partagé : un bloc cassé/posé est diffusé à la zone');
  const finn = await connect(srv.port);
  const finnWelcome = await waitForJson(finn, (m) => m.t === 'welcome');
  const finnId = finnWelcome.id;
  const grace = await connect(srv.port);
  await waitForJson(grace, (m) => m.t === 'welcome');
  // Les deux restent à 'surface' par défaut : ils partagent la zone.
  const blockSeenByFinn = waitForJson(finn, (m) => m.t === 'block');
  grace.send(JSON.stringify({ t: 'block', tx: 12, ty: 34, diff: { blocks: null } }));
  const blockMsg = await blockSeenByFinn;
  assert(blockMsg.tx === 12 && blockMsg.ty === 34, `coordonnées transmises (${blockMsg.tx},${blockMsg.ty})`);
  assert(blockMsg.diff.blocks === null, 'le diff (bloc cassé → null) est transmis intact');
  // On attend la confirmation serveur du départ (pas juste l'appel close()
  // côté client, qui est asynchrone) avant d'ouvrir une nouvelle connexion :
  // sinon la place n'est pas encore libérée et Helen se fait refuser (cap = 3).
  const graceLeftSeenByFinn = waitForJson(finn, (m) => m.t === 'leave');
  grace.close();
  await graceLeftSeenByFinn;

  console.log('\n▶ Monde partagé : resynchronisation à l\'arrivée dans une zone déjà modifiée');
  const helen = await connect(srv.port);
  const syncMsg = await waitForJson(helen, (m) => m.t === 'worldSync' && m.zone === 'surface');
  assert(Array.isArray(syncMsg.diffs), 'la resynchronisation contient un tableau de diffs');
  const found = syncMsg.diffs.find((d) => d.tx === 12 && d.ty === 34);
  assert(Boolean(found), 'le bloc cassé plus tôt par Grace y figure');
  assert(found && found.diff.blocks === null, 'avec le bon diff (bloc cassé → null)');
  const helenLeftSeenByFinn = waitForJson(finn, (m) => m.t === 'leave');
  helen.close(); // libère une place avant d'ouvrir Ivan
  await helenLeftSeenByFinn;

  console.log('\n▶ Monde partagé : diffs filtrés par zone (pas de fuite entre zones)');
  const ivan = await connect(srv.port);
  await waitForJson(ivan, (m) => m.t === 'welcome');
  ivan.send(JSON.stringify({ t: 'zone', zone: 'cave:1' }));
  await sleep(100); // laisse le temps au serveur de traiter le changement de zone
  let leaked = false;
  const onLeak = (data, isBinary) => {
    if (isBinary) return;
    let msg;
    try { msg = JSON.parse(data.toString('utf8')); } catch { return; }
    if (msg.t === 'block') leaked = true;
  };
  ivan.on('message', onLeak);
  finn.send(JSON.stringify({ t: 'block', tx: 5, ty: 5, diff: { floor: 'dirt' } })); // finn est resté 'surface'
  await sleep(200);
  ivan.off('message', onLeak);
  assert(!leaked, 'un joueur dans une autre zone ne reçoit pas les diffs de bloc');
  ivan.close();

  console.log('\n▶ Monde partagé : diff invalide/malformé ignoré sans planter');
  finn.send(JSON.stringify({ t: 'block', tx: 'nope', ty: 5, diff: { floor: 'dirt' } }));
  finn.send(JSON.stringify({ t: 'block', tx: 5, ty: 5, diff: {} }));
  await sleep(150);
  assert(srv.child.exitCode === null, 'le serveur tourne toujours après des messages malformés');

  console.log('\n▶ Coffres partagés : le contenu d\'un coffre est diffusé à la zone');
  const gus = await connect(srv.port);
  await waitForJson(gus, (m) => m.t === 'welcome'); // finn + gus = 2, sous le cap de 3
  const chestSlots = new Array(27).fill(null);
  chestSlots[0] = { id: 'iron_pickaxe', count: 1, durability: 200 };
  chestSlots[5] = { id: 'stone', count: 42 };
  const chestSeenByFinn = waitForJson(finn, (m) => m.t === 'chest');
  gus.send(JSON.stringify({ t: 'chest', tx: 20, ty: 21, slots: chestSlots }));
  const chestMsg = await chestSeenByFinn;
  assert(chestMsg.tx === 20 && chestMsg.ty === 21, `coordonnées transmises (${chestMsg.tx},${chestMsg.ty})`);
  assert(Array.isArray(chestMsg.slots) && chestMsg.slots.length === 27, 'les 27 cases sont transmises');
  assert(chestMsg.slots[0] && chestMsg.slots[0].id === 'iron_pickaxe' && chestMsg.slots[0].durability === 200,
    'la première case (avec durabilité) est transmise intacte');
  assert(chestMsg.slots[5] && chestMsg.slots[5].id === 'stone' && chestMsg.slots[5].count === 42,
    'la case suivante aussi');
  assert(chestMsg.slots[1] === null, 'les cases vides restent nulles');

  console.log('\n▶ Coffres partagés : resynchronisation à l\'arrivée dans une zone déjà modifiée');
  const gusLeftSeenByFinn = waitForJson(finn, (m) => m.t === 'leave');
  gus.close(); // libère une place avant d'ouvrir Hank
  await gusLeftSeenByFinn;
  const hank = await connect(srv.port);
  const chestSyncMsg = await waitForJson(hank, (m) => m.t === 'chestSync' && m.zone === 'surface');
  assert(Array.isArray(chestSyncMsg.chests), 'la resynchronisation contient un tableau de coffres');
  const foundChest = chestSyncMsg.chests.find((c) => c.tx === 20 && c.ty === 21);
  assert(Boolean(foundChest), 'le coffre rempli plus tôt par Gus y figure');
  assert(foundChest && foundChest.slots[0]?.id === 'iron_pickaxe', 'avec son contenu intact');
  hank.close();

  console.log('\n▶ Coffres partagés : contenu invalide nettoyé, jamais un plantage');
  finn.send(JSON.stringify({ t: 'chest', tx: 22, ty: 22, slots: 'nimportequoi' }));
  finn.send(JSON.stringify({ t: 'chest', tx: 'nope', ty: 22, slots: [] }));
  finn.send(JSON.stringify({
    t: 'chest', tx: 23, ty: 23,
    slots: [{ id: 'stone', count: 999999 }, { id: 'x'.repeat(999), count: 1 }, null],
  }));
  await sleep(150);
  assert(srv.child.exitCode === null, 'le serveur tourne toujours après des messages de coffre malformés');

  console.log('\n▶ Fours partagés : l\'état d\'un four est diffusé à la zone');
  const ivy = await connect(srv.port);
  await waitForJson(ivy, (m) => m.t === 'welcome'); // finn + ivy = 2, sous le cap de 3
  const furnaceState = {
    input: { id: 'rawIron', count: 3 }, fuel: { id: 'wood', count: 1 }, output: null,
    progress: 4.2, fuelTime: 9.5, maxFuelTime: 15,
  };
  const furnaceSeenByFinn = waitForJson(finn, (m) => m.t === 'furnace');
  ivy.send(JSON.stringify({ t: 'furnace', tx: 30, ty: 31, state: furnaceState }));
  const furnaceMsg = await furnaceSeenByFinn;
  assert(furnaceMsg.tx === 30 && furnaceMsg.ty === 31, `coordonnées transmises (${furnaceMsg.tx},${furnaceMsg.ty})`);
  assert(furnaceMsg.state.input?.id === 'rawIron' && furnaceMsg.state.input?.count === 3, 'ingrédient transmis intact');
  assert(furnaceMsg.state.fuel?.id === 'wood', 'combustible transmis intact');
  assert(furnaceMsg.state.output === null, 'sortie vide transmise telle quelle');
  assert(furnaceMsg.state.progress === 4.2 && furnaceMsg.state.fuelTime === 9.5, 'progression/feu transmis intacts');

  console.log('\n▶ Fours partagés : resynchronisation à l\'arrivée dans une zone déjà modifiée');
  const ivyLeftSeenByFinn = waitForJson(finn, (m) => m.t === 'leave');
  ivy.close(); // libère une place avant d'ouvrir Jack
  await ivyLeftSeenByFinn;
  const jack = await connect(srv.port);
  const furnaceSyncMsg = await waitForJson(jack, (m) => m.t === 'furnaceSync' && m.zone === 'surface');
  assert(Array.isArray(furnaceSyncMsg.furnaces), 'la resynchronisation contient un tableau de fours');
  const foundFurnace = furnaceSyncMsg.furnaces.find((f) => f.tx === 30 && f.ty === 31);
  assert(Boolean(foundFurnace), 'le four rempli plus tôt par Ivy y figure');
  assert(foundFurnace && foundFurnace.state.input?.id === 'rawIron', 'avec son contenu intact');
  // Même remarque que pour grace/helen plus haut : on attend la confirmation
  // serveur du départ avant d'ouvrir Kate, sinon la place n'est pas encore
  // libérée (close() est asynchrone) et Kate se fait refuser (cap = 3).
  const jackLeftSeenByFinn = waitForJson(finn, (m) => m.t === 'leave');
  jack.close();
  await jackLeftSeenByFinn;

  console.log('\n▶ Fours partagés : un four vidé et éteint sort du journal (pas de fuite mémoire)');
  finn.send(JSON.stringify({
    t: 'furnace', tx: 30, ty: 31,
    state: { input: null, fuel: null, output: null, progress: 0, fuelTime: 0, maxFuelTime: 0 },
  }));
  await sleep(150);
  const kate = await connect(srv.port);
  const furnaceSyncMsg2 = await waitForJson(kate, (m) => m.t === 'furnaceSync' && m.zone === 'surface');
  const stillThere = furnaceSyncMsg2.furnaces.find((f) => f.tx === 30 && f.ty === 31);
  assert(!stillThere, 'le four vide et éteint ne réapparaît pas dans la resynchronisation');
  kate.close();

  console.log('\n▶ Fours partagés : état invalide nettoyé, jamais un plantage');
  finn.send(JSON.stringify({ t: 'furnace', tx: 32, ty: 32, state: 'nimportequoi' }));
  finn.send(JSON.stringify({ t: 'furnace', tx: 'nope', ty: 32, state: {} }));
  finn.send(JSON.stringify({
    t: 'furnace', tx: 33, ty: 33,
    state: { input: { id: 'x'.repeat(999), count: 1 }, fuel: null, output: null, progress: -5, fuelTime: 'nope', maxFuelTime: 15 },
  }));
  await sleep(150);
  assert(srv.child.exitCode === null, 'le serveur tourne toujours après des messages de four malformés');

  // Même remarque que plus haut (grace/helen, jack/kate) : on attend la
  // confirmation serveur du départ avant d'ouvrir Carol, sinon la place
  // n'est pas encore libérée (close() est asynchrone) et le test de
  // plafond ci-dessous compte une connexion de trop.
  const finnLeftSeenByAlice = waitForJson(alice, (m) => m.t === 'leave' && m.id === finnId);
  finn.close();
  await finnLeftSeenByAlice;

  console.log('\n▶ Plafond de connexions (MAX_PLAYERS)');
  const carol = await connect(srv.port);
  await waitForJson(carol, (m) => m.t === 'welcome');
  const dave = await connect(srv.port); // alice + carol + dave = 3 = MAX_PLAYERS déjà atteint (alice, carol, dave)
  // Alice + Carol + Dave = 3 (max). Un 4e doit être refusé.
  const eve = new WebSocket(`ws://127.0.0.1:${srv.port}${WS_PATH}`);
  const refused = await new Promise((resolve) => {
    eve.once('close', (code) => resolve(code));
    eve.once('open', () => {
      // s'il ouvre quand même, on laisse une chance au message 'welcome'
      // puis on considère que ce n'est pas un refus.
      setTimeout(() => resolve(null), 1500);
    });
  });
  assert(refused === 1013, `un 4e joueur est refusé proprement (code ${refused})`);

  alice.close(); carol.close(); dave.close();
  console.log(failures === 0 ? '\n✅ Multijoueur OK' : `\n❌ ${failures} échec(s)`);
} catch (err) {
  console.error('\n❌ erreur inattendue :', err.stack || err);
  failures++;
} finally {
  if (srv) srv.child.kill();
}
process.exit(failures === 0 ? 0 : 1);
