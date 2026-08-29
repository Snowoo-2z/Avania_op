// ============================================================
//  AVANIA — Test bout-en-bout du client multijoueur (js/net.js)
//
//  Contrairement à test/multiplayer.mjs (qui parle le protocole à la
//  main), ce test utilise le VRAI MultiplayerClient tel qu'utilisé par
//  js/main.js, contre un VRAI server.js. Node 22 expose un `WebSocket`
//  natif, donc ce module tourne sans DOM ni jsdom — seul `window`
//  (utilisé pour deviner l'URL par défaut) est absent, et on le
//  contourne en passant une URL explicite, comme le ferait un client
//  réel connecté à un serveur distant.
//
//  Scénario : deux « joueurs » (Alice, Bob) se connectent, bougent,
//  doivent se voir l'un l'autre avec la bonne position lissée ; Bob
//  descend dans la grotte (changement de zone) et doit disparaître de
//  la liste d'Alice sans qu'elle ne plante.
//
//  Lancement : npm run test:multiplayer:client
// ============================================================

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MultiplayerClient } from '../js/net.js';

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
        resolve({ child, port: Number(m[1]) });
      }
    }, 50);
  });
}

// Dans le vrai jeu, chaque navigateur appelle multiplayer.update(dt, ...)
// à CHAQUE frame de sa propre boucle (voir js/main.js, onNetUpdate) :
// c'est ce qui lisse les positions distantes ET envoie la position
// locale. Ce test simule donc les deux boucles de jeu en tâche de fond
// pendant chaque attente, exactement comme le ferait un vrai onglet.
function driveLoop(client, localPlayer, stepMs = 16) {
  return setInterval(() => client.update(stepMs / 1000, localPlayer), stepMs);
}

async function until(pred, maxWaitMs = 3000, stepMs = 20) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (pred()) return true;
    await sleep(stepMs);
  }
  return pred();
}

const watchdog = setTimeout(() => {
  console.error('\n❌ délai dépassé (le test ne se termine pas tout seul)');
  process.exit(1);
}, 60000);
watchdog.unref();

let srv;
let alice;
let bob;
let aliceLoop;
let bobLoop;
try {
  srv = await startServer({});
  const wsUrl = `ws://127.0.0.1:${srv.port}/ws`;

  console.log('▶ Deux joueurs se connectent et se voient');
  alice = new MultiplayerClient({ url: wsUrl, name: 'Alice', appearance: { skin: 'peche' }, zone: 'surface' });
  bob = new MultiplayerClient({ url: wsUrl, name: 'Bob', appearance: { skin: 'hale' }, zone: 'surface' });

  // Simule les deux boucles de jeu (60 fps) qui tournent en continu,
  // du début à la fin du scénario — comme deux onglets ouverts.
  const aliceLocalPlayer = { x: 0, y: 0, facing: 'down', moving: false };
  const bobLocalPlayer = { x: 0, y: 0, facing: 'down', moving: false };
  aliceLoop = driveLoop(alice, aliceLocalPlayer);
  bobLoop = driveLoop(bob, bobLocalPlayer);

  assert(await until(() => alice.connected && bob.connected), 'les deux clients se connectent');
  assert(await until(() => alice.players.length === 1 && bob.players.length === 1),
    'chacun voit l\'autre dans sa liste de joueurs');

  const aliceSeesBob = () => alice.players.find((p) => p.name === 'Bob');
  assert(await until(() => Boolean(aliceSeesBob())), 'Alice identifie bien Bob par son nom');
  assert(aliceSeesBob().appearance.skin === 'hale', 'et récupère son apparence');

  console.log('\n▶ Le mouvement est transmis puis lissé côté distant');
  bobLocalPlayer.x = 320; bobLocalPlayer.y = 480; bobLocalPlayer.facing = 'left'; bobLocalPlayer.moving = true;

  const reachedTarget = await until(() => {
    const seen = aliceSeesBob();
    return seen && Math.abs(seen.x - 320) < 2 && Math.abs(seen.y - 480) < 2;
  }, 3000);
  assert(reachedTarget, `Alice voit Bob converger vers sa vraie position (${aliceSeesBob().x.toFixed(1)}, ${aliceSeesBob().y.toFixed(1)})`);
  assert(aliceSeesBob().facing === 'left', 'orientation distante correcte');

  console.log('\n▶ Changement de zone (Bob entre dans la grotte)');
  bob.setZone('cave:1');
  assert(await until(() => alice.players.length === 0), 'Bob disparaît de la liste d\'Alice (zones différentes)');
  assert(bob.players.length === 0, 'et Bob, de son côté, ne voit plus personne (Alice est restée en surface)');

  bob.setZone('surface');
  assert(await until(() => alice.players.length === 1), 'Bob réapparaît en revenant à la surface');

  console.log('\n▶ Monde partagé : un bloc cassé par Bob est reçu par Alice');
  const aliceBlockChanges = [];
  alice.onBlockChange = (zone, tx, ty, diff) => aliceBlockChanges.push({ zone, tx, ty, diff });
  bob.sendBlockChange(7, 9, { blocks: null, floor: 'dirt' });
  assert(await until(() => aliceBlockChanges.length === 1), 'Alice reçoit le changement de bloc de Bob');
  const change = aliceBlockChanges[0];
  assert(change.tx === 7 && change.ty === 9, `coordonnées reçues intactes (${change.tx},${change.ty})`);
  assert(change.diff.blocks === null && change.diff.floor === 'dirt', 'diff reçu intact');

  console.log('\n▶ Monde partagé : resynchronisation à la connexion d\'un nouveau client');
  const carol = new MultiplayerClient({ url: wsUrl, name: 'Carol', appearance: {}, zone: 'surface' });
  const carolLocalPlayer = { x: 0, y: 0, facing: 'down', moving: false };
  const carolLoop = driveLoop(carol, carolLocalPlayer);
  const carolWorldSyncs = [];
  carol.onWorldSync = (zone, diffs) => carolWorldSyncs.push({ zone, diffs });
  try {
    assert(await until(() => carolWorldSyncs.length > 0), 'Carol reçoit une resynchronisation en se connectant');
    const sync = carolWorldSyncs[0];
    assert(sync.zone === 'surface', `pour la bonne zone (${sync.zone})`);
    const found = sync.diffs.find((d) => d.tx === 7 && d.ty === 9);
    assert(Boolean(found), 'le bloc cassé par Bob plus tôt y figure déjà');
  } finally {
    clearInterval(carolLoop);
    carol.destroy();
  }

  console.log('\n▶ Coffres partagés : le contenu rangé par Bob est reçu par Alice');
  const aliceChestChanges = [];
  alice.onChestChange = (zone, tx, ty, slots) => aliceChestChanges.push({ zone, tx, ty, slots });
  const bobChestSlots = new Array(27).fill(null);
  bobChestSlots[3] = { id: 'ironIngot', count: 5 };
  bob.sendChestChange(15, 16, bobChestSlots);
  assert(await until(() => aliceChestChanges.length === 1), 'Alice reçoit le changement de coffre de Bob');
  const chestChange = aliceChestChanges[0];
  assert(chestChange.tx === 15 && chestChange.ty === 16, `coordonnées reçues intactes (${chestChange.tx},${chestChange.ty})`);
  assert(chestChange.slots.length === 27, 'les 27 cases sont reçues');
  assert(chestChange.slots[3]?.id === 'ironIngot' && chestChange.slots[3]?.count === 5, 'contenu reçu intact');

  console.log('\n▶ Coffres partagés : resynchronisation à la connexion d\'un nouveau client');
  const dave = new MultiplayerClient({ url: wsUrl, name: 'Dave', appearance: {}, zone: 'surface' });
  const daveLocalPlayer = { x: 0, y: 0, facing: 'down', moving: false };
  const daveLoop = driveLoop(dave, daveLocalPlayer);
  const daveChestSyncs = [];
  dave.onChestSync = (zone, chests) => daveChestSyncs.push({ zone, chests });
  try {
    assert(await until(() => daveChestSyncs.length > 0), 'Dave reçoit une resynchronisation des coffres en se connectant');
    const chestSync = daveChestSyncs[0];
    assert(chestSync.zone === 'surface', `pour la bonne zone (${chestSync.zone})`);
    const foundChest = chestSync.chests.find((c) => c.tx === 15 && c.ty === 16);
    assert(Boolean(foundChest), 'le coffre rempli par Bob plus tôt y figure déjà');
    assert(foundChest && foundChest.slots[3]?.id === 'ironIngot', 'avec son contenu intact');
  } finally {
    clearInterval(daveLoop);
    dave.destroy();
  }

  console.log('\n▶ Fours partagés : l\'état géré par Bob est reçu par Alice');
  const aliceFurnaceChanges = [];
  alice.onFurnaceChange = (zone, tx, ty, state) => aliceFurnaceChanges.push({ zone, tx, ty, state });
  const bobFurnaceState = {
    input: { id: 'rawIron', count: 2 }, fuel: { id: 'wood', count: 1 }, output: null,
    progress: 3.5, fuelTime: 12, maxFuelTime: 15,
  };
  bob.sendFurnaceChange(25, 26, bobFurnaceState);
  assert(await until(() => aliceFurnaceChanges.length === 1), 'Alice reçoit le changement de four de Bob');
  const furnaceChange = aliceFurnaceChanges[0];
  assert(furnaceChange.tx === 25 && furnaceChange.ty === 26, `coordonnées reçues intactes (${furnaceChange.tx},${furnaceChange.ty})`);
  assert(furnaceChange.state.input?.id === 'rawIron' && furnaceChange.state.input?.count === 2, 'ingrédient reçu intact');
  assert(furnaceChange.state.progress === 3.5 && furnaceChange.state.fuelTime === 12, 'progression/feu reçus intacts');

  console.log('\n▶ Fours partagés : resynchronisation à la connexion d\'un nouveau client');
  const erin = new MultiplayerClient({ url: wsUrl, name: 'Erin', appearance: {}, zone: 'surface' });
  const erinLocalPlayer = { x: 0, y: 0, facing: 'down', moving: false };
  const erinLoop = driveLoop(erin, erinLocalPlayer);
  const erinFurnaceSyncs = [];
  erin.onFurnaceSync = (zone, furnaces) => erinFurnaceSyncs.push({ zone, furnaces });
  try {
    assert(await until(() => erinFurnaceSyncs.length > 0), 'Erin reçoit une resynchronisation des fours en se connectant');
    const furnaceSync = erinFurnaceSyncs[0];
    assert(furnaceSync.zone === 'surface', `pour la bonne zone (${furnaceSync.zone})`);
    const foundFurnace = furnaceSync.furnaces.find((f) => f.tx === 25 && f.ty === 26);
    assert(Boolean(foundFurnace), 'le four géré par Bob plus tôt y figure déjà');
    assert(foundFurnace && foundFurnace.state.input?.id === 'rawIron', 'avec son contenu intact');
  } finally {
    clearInterval(erinLoop);
    erin.destroy();
  }

  console.log('\n▶ Animaux partagés : Bob établit le troupeau, Alice le reçoit');
  const aliceMobSyncs = [];
  alice.onMobSync = (zone, mobs) => aliceMobSyncs.push({ zone, mobs });
  const troupeau = [
    { id: 0, kind: 'sheep', x: 100, y: 150, hp: 8, alive: true },
    { id: 1, kind: 'cow', x: 200, y: 250, hp: 12, alive: true },
  ];
  // Alice a reçu un mobSync vide dès sa connexion (personne n'avait
  // encore établi de troupeau) : Bob l'établit maintenant.
  bob.sendMobSync(troupeau);
  assert(await until(() => aliceMobSyncs.some((s) => s.mobs.length === 2)),
    'Alice reçoit le troupeau établi par Bob');
  const established = aliceMobSyncs.find((s) => s.mobs.length === 2);
  assert(established.mobs[0].kind === 'sheep' && established.mobs[1].kind === 'cow',
    'avec les bonnes espèces et le bon ordre');

  console.log('\n▶ Animaux partagés : réapparition (repop) reçue par Alice');
  const aliceMobSpawns = [];
  alice.onMobSpawn = (zone, mobs) => aliceMobSpawns.push({ zone, mobs });
  bob.sendMobSpawn([{ id: 2, kind: 'sheep', x: 60, y: 70, hp: 8, alive: true }]);
  assert(await until(() => aliceMobSpawns.length === 1), 'Alice reçoit la nouvelle bête');
  assert(aliceMobSpawns[0].mobs[0].id === 2, 'avec le bon id');

  console.log('\n▶ Animaux partagés : correctif de position (coordinateur) reçu par Alice');
  const aliceMobStates = [];
  alice.onMobState = (zone, mobs) => aliceMobStates.push({ zone, mobs });
  bob.sendMobState([{ id: 0, x: 321, y: 654 }]);
  assert(await until(() => aliceMobStates.length === 1), 'Alice reçoit le correctif de position');
  assert(aliceMobStates[0].mobs[0].x === 321 && aliceMobStates[0].mobs[0].y === 654, 'coordonnées reçues intactes');

  console.log('\n▶ Animaux partagés : un coup porté par Bob est reçu par Alice');
  const aliceMobHits = [];
  alice.onMobHit = (zone, mob) => aliceMobHits.push({ zone, mob });
  bob.sendMobHit(1, 0, false);
  assert(await until(() => aliceMobHits.length === 1), 'Alice reçoit le coup porté par Bob');
  assert(aliceMobHits[0].mob.id === 1 && aliceMobHits[0].mob.alive === false, 'la mort est transmise intacte');

  console.log('\n▶ Animaux partagés : resynchronisation à la connexion d\'un nouveau client');
  const felix = new MultiplayerClient({ url: wsUrl, name: 'Felix', appearance: {}, zone: 'surface' });
  const felixLocalPlayer = { x: 0, y: 0, facing: 'down', moving: false };
  const felixLoop = driveLoop(felix, felixLocalPlayer);
  const felixMobSyncs = [];
  felix.onMobSync = (zone, mobs) => felixMobSyncs.push({ zone, mobs });
  try {
    assert(await until(() => felixMobSyncs.some((s) => s.mobs.length > 0)),
      'Felix reçoit le troupeau existant en se connectant');
    const sync = felixMobSyncs.find((s) => s.mobs.length > 0);
    assert(sync.zone === 'surface', `pour la bonne zone (${sync.zone})`);
    const cow = sync.mobs.find((m) => m.id === 1);
    assert(Boolean(cow), 'y compris la vache tuée plus tôt');
    assert(cow && cow.alive === false, 'avec son état de mort à jour');
  } finally {
    clearInterval(felixLoop);
    felix.destroy();
  }

  console.log('\n▶ Déconnexion propre');
  bob.destroy();
  assert(await until(() => alice.players.length === 0), 'Alice voit Bob partir');

  console.log(failures === 0 ? '\n✅ Client multijoueur OK' : `\n❌ ${failures} échec(s)`);
} catch (err) {
  console.error('\n❌ erreur inattendue :', err.stack || err);
  failures++;
} finally {
  clearInterval(aliceLoop);
  clearInterval(bobLoop);
  if (alice) alice.destroy();
  if (bob) bob.destroy();
  if (srv) srv.child.kill();
}
process.exit(failures === 0 ? 0 : 1);
