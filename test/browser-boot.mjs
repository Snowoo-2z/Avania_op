// ============================================================
//  AVANIA — Test d'intégration navigateur
//
//  Démarre réellement js/main.js dans un DOM (jsdom) avec le vrai
//  index.html, puis rejoue la partie qui compte :
//    création du personnage → tutoriel → cinématique du monsieur en
//    costume → argent remis → marche vers la grotte → entrée →
//    descente refusée → marchand → offre /sell → achat → équipement
//    → descente acceptée.
//
//  jsdom ne peint rien : ce n'est pas un test de rendu. C'est un test de
//  câblage — ids du DOM, imports, rappels du moteur, règles métier —
//  exécuté par le vrai code de production, sans double ni réimplémentation.
//
//  Lancement : npm run test:browser
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createCanvas } from '@napi-rs/canvas';
import { TILE } from '../js/config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log('  ✔ ' + msg);
  else { console.error('  ✘ ' + msg); failures++; }
}

// ------------------------------------------------------------
// 1) Environnement navigateur
// ------------------------------------------------------------
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// Console jsdom filtrée : ses « Not implemented » (toDataURL…) sont
// couverts par les shims ci-dessous. Les vraies erreurs du jeu passent.
const jsdomNoise = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (e) => {
  if (/Not implemented/.test(e.message)) { jsdomNoise.push(e.message); return; }
  console.error('  jsdom: ' + (e.stack || e.message));
});
virtualConsole.on('error', (...a) => console.error('  console: ' + a.join(' ')));

const dom = new JSDOM(html, {
  url: 'http://localhost:3000/',
  pretendToBeVisual: true,
  runScripts: 'outside-only',
  virtualConsole,
});
const { window } = dom;

// jsdom ne sait pas rasteriser : on lui donne le vrai canvas 2D de
// @napi-rs/canvas (le même que celui des tests de fumée). Le code du jeu
// fait ctx.drawImage(unAutreCanvas) où cet autre canvas est un
// HTMLCanvasElement de jsdom, que le contexte natif ne reconnaît pas :
// on le dépaquette vers son backend au passage. En navigateur cette
// couche n'existe pas — c'est le prix du headless.
const unwrap = (src) => (src && src._backend ? src._backend : src);

window.HTMLCanvasElement.prototype.getContext = function getContext(kind) {
  if (kind !== '2d') return null;
  if (!this._ctx) {
    this._backend = createCanvas(this._w || this.width || 1, this._h || this.height || 1);
    const native = this._backend.getContext('2d');
    const drawImage = native.drawImage.bind(native);
    native.drawImage = (src, ...args) => drawImage(unwrap(src), ...args);
    const createPattern = native.createPattern.bind(native);
    native.createPattern = (src, ...args) => createPattern(unwrap(src), ...args);
    this._ctx = native;
  }
  return this._ctx;
};
window.HTMLCanvasElement.prototype.toDataURL = function toDataURL(...args) {
  if (!this._ctx) this.getContext('2d');
  return this._backend ? this._backend.toDataURL(...args) : '';
};
// jsdom force 300×150 : le canvas doit honorer la taille demandée.
for (const dim of ['width', 'height']) {
  Object.defineProperty(window.HTMLCanvasElement.prototype, dim, {
    get() { return this[`_${dim}`] || (dim === 'width' ? 300 : 150); },
    set(v) { this[`_${dim}`] = v; if (this._backend) this._backend[dim] = v; },
    configurable: true,
  });
}

// Boucle d'animation pilotée à la main, avec une horloge virtuelle :
// sans ça les dt valent ~0 et rien n'avance jamais.
const rafQueue = [];
let virtualClock = 0;
window.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
window.cancelAnimationFrame = () => {};
window.devicePixelRatio = 1;
window.matchMedia = window.matchMedia || (() => ({
  matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
}));
window.ResizeObserver = window.ResizeObserver
  || class { observe() {} unobserve() {} disconnect() {} };
window.AudioContext = window.AudioContext || class {
  constructor() { this.state = 'suspended'; }
  resume() {} createGain() { return { gain: { value: 1 }, connect() {} }; }
  createOscillator() {
    return { connect() {}, start() {}, stop() {}, frequency: { value: 0 }, type: 'sine' };
  }
  get destination() { return {}; }
  get currentTime() { return 0; }
};

// Certains globaux de Node (navigator, location…) n'ont qu'un accesseur :
// on les redéfinit, et on ignore ceux qui résistent.
// NB : `Event` n'est PAS repris ici, volontairement. Le WebSocket de
// jsdom est lui-même construit sur le WebSocket natif de Node (undici),
// qui construit ses propres évènements avec le `Event` global du
// processus Node. Si on écrase ce global par celui de jsdom, undici se
// retrouve à fabriquer des évènements avec la classe jsdom, que
// dispatchEvent (interne à jsdom, qui attend SON `Event`) rejette avec
// « instance of Event » — un carambolage de « realms ». Ne pas toucher
// au `Event` global évite le problème ; le code du jeu (js/game.js) et
// ce fichier utilisent déjà `window.Event`/`window.KeyboardEvent`
// explicitement partout où c'est nécessaire.
for (const k of ['document', 'localStorage', 'HTMLElement', 'HTMLCanvasElement',
  'Element', 'Node', 'KeyboardEvent', 'MouseEvent', 'getComputedStyle',
  'requestAnimationFrame', 'cancelAnimationFrame', 'devicePixelRatio',
  'matchMedia', 'ResizeObserver', 'AudioContext', 'Image', 'innerWidth',
  'innerHeight', 'navigator', 'location',
  // Le client multijoueur (js/net.js) doit voir EXACTEMENT le
  // WebSocket de jsdom (pas celui, natif, de Node) pour rester dans le
  // même realm que le reste du DOM simulé.
  'WebSocket']) {
  if (window[k] === undefined) continue;
  try {
    Object.defineProperty(globalThis, k, { value: window[k], writable: true, configurable: true });
  } catch { /* global non redéfinissable : on garde celui de Node */ }
}
globalThis.window = window;
globalThis.self = window;

// ------------------------------------------------------------
// 2) Pilote
// ------------------------------------------------------------
const runtimeErrors = [];
window.addEventListener('error', (e) => runtimeErrors.push(e.message || String(e.error)));
// Une exception non attrapée ici est un échec du test, pas un incident de
// jeu : on la montre et on sort. (L'avaler laisserait le processus pendu
// indéfiniment, sans aucun diagnostic.)
process.on('uncaughtException', (e) => {
  console.error('\n❌ exception non attrapée :\n' + (e && e.stack || e));
  process.exit(1);
});
process.on('unhandledRejection', (e) => {
  console.error('\n❌ promesse rejetée :\n' + (e && e.stack || e));
  process.exit(1);
});
// Garde-fou : rien dans ce test ne doit dépasser deux minutes.
const watchdog = setTimeout(() => {
  console.error('\n❌ délai dépassé : le test ne se termine pas tout seul');
  process.exit(1);
}, 120000);
watchdog.unref();

// Une frame : on exécute les rAF en attente avec un pas de temps fixe.
// On rend aussi la main aux temporisateurs (l'écran de chargement en
// utilise) via un vrai setTimeout.
async function frame(dtMs = 1000 / 60) {
  virtualClock += dtMs;
  const batch = rafQueue.splice(0, rafQueue.length);
  for (const cb of batch) {
    try { cb(virtualClock); } catch (err) { runtimeErrors.push(String(err && err.stack || err)); }
  }
  await new Promise((r) => setTimeout(r, 1));
}

async function frames(n, dtMs) {
  for (let i = 0; i < n; i++) await frame(dtMs);
}

// Attend une condition en laissant tourner la boucle de jeu.
async function until(pred, maxFrames = 4000) {
  for (let i = 0; i < maxFrames; i++) {
    if (pred()) return true;
    await frame();
  }
  return pred();
}

const $ = (id) => window.document.getElementById(id);
function press(k) {
  const ev = new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
  window.document.dispatchEvent(ev);
  window.dispatchEvent(ev);
  const up = new window.KeyboardEvent('keyup', { key: k, bubbles: true, cancelable: true });
  window.document.dispatchEvent(up);
  window.dispatchEvent(up);
}
// `press()` envoie l'évènement DEUX fois (sur document puis sur window) :
// pratique pour les actions « maintenu/appuyé » du moteur, mais c'est un
// aller-retour pour une BASCULE (talkie-walkie, téléphone) qui se
// retrouverait exactement dans son état de départ. Pour celles-là, un seul
// évènement — ce que fait un vrai navigateur pour une touche.
function pressOnce(k) {
  const ev = new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
  window.dispatchEvent(ev);
  const up = new window.KeyboardEvent('keyup', { key: k, bubbles: true, cancelable: true });
  window.dispatchEvent(up);
}

// Maintenir une touche : `press()` la relève aussitôt, or accélérer
// suppose de rester appuyé. On n'envoie ici que le keydown, et on
// relève à la main.
function hold(k) {
  const ev = new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
  window.document.dispatchEvent(ev);
  window.dispatchEvent(ev);
}
function release(k) {
  const ev = new window.KeyboardEvent('keyup', { key: k, bubbles: true, cancelable: true });
  window.document.dispatchEvent(ev);
  window.dispatchEvent(ev);
}

function click(el) {
  if (typeof el.onclick === 'function') el.onclick(new window.MouseEvent('click', { bubbles: true }));
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
}

// ------------------------------------------------------------
// 3) Démarrage
// ------------------------------------------------------------
console.log('▶ Démarrage du jeu dans un vrai DOM');
await import('../js/main.js');
await until(() => !!$('char-start'), 200);
assert(!!$('char-start'), 'l\'écran de création du personnage s\'affiche');

$('char-name').value = 'Testeur';
click($('char-start'));
const booted = await until(() => !!window.__game, 3000);
assert(booted, 'js/main.js démarre et publie le jeu');
if (!booted) {
  console.error('\n❌ démarrage impossible : ' + runtimeErrors.join('\n'));
  process.exit(1);
}
assert(runtimeErrors.length === 0, `aucune erreur au démarrage (${runtimeErrors[0] || 'rien'})`);

const game = window.__game;

// La rastérisation logicielle de @napi-rs/canvas retient ~1 Mo par grand
// drawImage et ne les rend jamais : 1200 frames de rendu headless tuent
// le processus. C'est un artefact de la bibliothèque native, pas du jeu
// (voir scripts/frame-bench.mjs). Ce test vérifie le câblage, pas les
// pixels : on coupe donc le rendu pendant les attentes et on ne le
// relance qu'à quelques points de contrôle, où il doit passer sans erreur.
const realRender = game.render.bind(game);
game.render = () => {};
async function renderOnce(where) {
  try {
    realRender();
    assert(true, `rendu ${where} : aucune erreur`);
  } catch (err) {
    assert(false, `rendu ${where} : ${err && err.message}`);
  }
}
await renderOnce('au démarrage');

console.log('\n▶ Interface présente');
for (const id of ['hud', 'hud-right', 'depth-chip',
  'depth-label', 'gear-chip', 'gear-depth', 'interact-prompt', 'interact-key', 'interact-label',
  'dialog', 'dialog-speaker', 'dialog-text', 'dialog-skip', 'merchant-chat', 'mc-log',
  'mc-input', 'mc-form', 'mc-offer', 'mc-offer-buy', 'mc-offer-talk', 'mc-offer-price',
  // Barres de vie et de faim (au-dessus de la barre rapide).
  'health-hud', 'health-fill', 'health-text',
  'hunger-hud', 'hunger-fill', 'hunger-text',
  // Étape 6 : chat (global + talkie-walkie) et téléphone / réseau social.
  'global-chat', 'gchat-log', 'gchat-input', 'gchat-form', 'gchat-channel', 'gchat-channel-label',
  'phone', 'phone-home', 'phone-auth', 'phone-feed', 'phone-auth-handle', 'phone-auth-pass',
  'social-text', 'social-feed', 'social-publish']) {
  assert(!!$(id), `#${id} présent dans index.html`);
}

// L'aide des commandes (le panneau de touches en bas à gauche) a été
// retirée : sa place est prise par la fenêtre du chat global.
assert(!$('controls-hint'), '#controls-hint a bien été supprimé d\'index.html');
// Le compteur d'argent non plus : les écus sont des pièces dans
// l'inventaire (objet `coin`), pas un nombre dans le HUD.
for (const id of ['wallet', 'wallet-amount', 'wallet-delta']) {
  assert(!$(id), `#${id} a disparu du HUD (la monnaie vit dans l'inventaire)`);
}

// Le tutoriel se présente en premier et met le jeu en pause.
const tut = $('tutorial');
if (tut && !tut.classList.contains('hidden') && $('tutorial-start')) {
  click($('tutorial-start'));
  await frames(2);
}

console.log('\n▶ Cinématique d\'arrivée (le monsieur en costume)');
await frames(3);
assert(game.cutscene === true, 'le joueur est bloqué dès le début de la scène');
assert(game.npcs.some((n) => n.kind === 'gentleman'), 'le représentant est entré dans le monde');
assert(!$('dialog').classList.contains('hidden'), 'sa bulle de dialogue est affichée');

// On passe la scène (Échap) puis on le regarde s\'en aller.
press('Escape');
const leftAlone = await until(() => game.cutscene === false, 1200);
assert(leftAlone, 'le monsieur finit par s\'en aller et rend la main au joueur');
assert(!game.npcs.some((n) => n.kind === 'gentleman'), 'il a bien quitté la carte');
assert($('dialog').classList.contains('hidden'), 'sa bulle de dialogue est refermée');

// Le HUD est rafraîchi à 2 Hz : on attend un tick de setInterval.
await new Promise((r) => setTimeout(r, 700));
await frames(4);
await renderOnce('en surface, après l\'intro');
const money = window.__wallet.money;
assert(money === 150, `la somme de bienvenue est dans l'inventaire (${money} écus)`);
const coinStack = game.inventory.slots.find((s) => s && s.id === 'coin');
assert(!!coinStack && coinStack.count === 150,
  `les écus forment une pile d'objets (${coinStack ? coinStack.count : 'aucune'} pièce(s))`);
assert(game.inventory.count('coin') === 150, 'et l\'inventaire les compte');

// --- Et pour le joueur QUI REVIENT ? ---------------------------------------
// La scène est maintenant marquée « vue » dans ce navigateur : elle ne se
// rejouera plus. Or l'argent est une pile d'objets, morte avec l'inventaire :
// si le versement dépendait de la cinématique — c'était le bug — tout joueur
// de retour posait un pied sur l'île avec 0 écu et de quoi n'acheter chez
// aucun marchand. La règle vit donc dans l'économie (grantStartingFunds) et
// js/main.js la paie à l'arrivée quand la scène ne vient pas.
const { IntroSequence } = await import('../js/intro.js');
const purse = window.__wallet;
assert(IntroSequence.alreadySeen() === true, 'la cinématique est marquée « vue » : plus de scène pour ce joueur');
assert(purse.grantStartingFunds() === 0, 'cette arrivée est déjà payée : aucun doublon possible');
purse.reset(); // = un joueur qui arrive : la bourse et l'inventaire repartent de zéro
assert(game.inventory.count('coin') === 0, 'l\'arrivant n\'a pas une pièce en poche avant le versement');
assert(purse.grantStartingFunds() === 150, 'l\'arrivée suivante est payée sans la moindre cinématique');
assert(game.inventory.count('coin') === 150, 'les écus vont dans l\'inventaire, pas dans un compteur');

console.log('\n▶ Barre de vie');
{
  // La barre existe, est visible une fois le jeu lancé, et pleine au départ.
  const healthHud = $('health-hud');
  assert(!!healthHud && !healthHud.classList.contains('hidden'), 'la barre de vie est visible au-dessus de la barre rapide');
  assert($('health-fill').style.width === '100%', `pleine au départ (${$('health-fill').style.width})`);
  assert($('health-text').textContent === '20/20', `avec le compte affiché (« ${$('health-text').textContent} »)`);

  // Un coup (PvP côté serveur, voir applyPlayerAttack) : la barre suit,
  // et sous 25 % elle passe en mode « blessé » (pulsation).
  game.player.hp = 4;
  game.player.lastHurtAt = game.time;
  await frames(4);
  assert($('health-fill').style.width === '20%', `la barre suit les dégâts (${$('health-fill').style.width})`);
  assert($('health-text').textContent === '4/20', `et le compte aussi (« ${$('health-text').textContent} »)`);
  assert(healthHud.classList.contains('is-low'), 'sous 25 % de vie, la classe is-low pulse');

  // La régénération (après 6 s sans dégât, +1,2 PV/s) fait remonter la
  // barre TOUTE SEULE : le HUD est mis à jour à chaque frame.
  game.player.lastHurtAt = game.time - 7;
  const before = parseFloat($('health-fill').style.width);
  await frames(40);
  const after = parseFloat($('health-fill').style.width);
  assert(after > before, `la régénération la fait remonter (${before} % → ${after} %)`);
  // Remise à neuf pour la suite du scénario (descente, achats…).
  game.player.hp = game.player.maxHp;
  game.player.lastHurtAt = -99;
  await frames(3);
  assert($('health-fill').style.width === '100%', 'et revenue pleine une fois soignée');
}

console.log('\n▶ Jauge de faim');
{
  const hungerHud = $('hunger-hud');
  assert(!!hungerHud && !hungerHud.classList.contains('hidden'), 'la jauge de faim est visible au-dessus de la barre de vie');
  assert($('hunger-fill').style.width === '100%', `pleine au départ (${$('hunger-fill').style.width})`);
  assert($('hunger-text').textContent === '20/20', `avec le compte affiché (« ${$('hunger-text').textContent} »)`);

  // La régénération des PV exige un ventre assez plein : à 10/20 (65 %),
  // même loin de tout coup, les PV ne remontent plus.
  game.player.hunger = 10;
  game.player.hp = 15;
  game.player.lastHurtAt = game.time - 7;
  await frames(50);
  assert(game.player.hp === 15, `ventre trop vide : plus aucune régénération (${game.player.hp}/20)`);
  assert(!hungerHud.classList.contains('is-low'), 'à 10/20, la jauge ne pulse pas encore (50 %)');

  // Repu : la régénération repart toute seule.
  game.player.hunger = 18;
  await frames(50);
  assert(game.player.hp > 15, `repu, la régénération reprend (${game.player.hp.toFixed(1)}/20)`);

  // Manger : le pain (+6) remplit la jauge et part de l'inventaire.
  // add() range d'abord dans la barre rapide — on sélectionne la case
  // qui contient VRAIMENT le pain (la case 0 porte les écus ici).
  game.inventory.add('bread', 2);
  const breadSlot = game.inventory.slots.findIndex((s) => s && s.id === 'bread');
  assert(breadSlot >= game.inventory.hotbarStart,
    `le pain est bien dans la barre rapide (case ${breadSlot})`);
  game.inventory.selected = breadSlot - game.inventory.hotbarStart;
  const breadBefore = game.inventory.count('bread');
  game.player.hunger = 8;
  game.eatSelectedFood();
  assert(game.inventory.count('bread') === breadBefore - 1, `le pain est consommé (${game.inventory.count('bread')} restant)`);
  assert(game.player.hunger === 14, `la faim remonte de la valeur « food » du pain (8 → ${game.player.hunger})`);
  await frames(2); // le HUD se met à jour à la frame suivante
  assert($('hunger-text').textContent === '14/20', `et la jauge l'affiche (« ${$('hunger-text').textContent} »)`);

  // Repu à bloc : refus de manger, rien n'est gaspillé.
  game.player.hunger = game.player.maxHunger;
  game.eatSelectedFood();
  assert(game.inventory.count('bread') === breadBefore - 1, 'repu, on ne mange pas : le pain reste dans l\'inventaire');

  // Famine : ventre vide, les PV fondent tout seuls (jusqu'au plancher).
  game.player.hunger = 0;
  game.player.hp = 10;
  game.player.lastHurtAt = -99;
  const starved = await until(() => game.player.hp < 10, 6000);
  assert(starved, 'ventre vide : la famine ronge les PV toute seule');
  assert(game.player.hp >= 1, `mais on ne meurt pas de faim (plancher à 1, ici ${game.player.hp})`);
  assert(hungerHud.classList.contains('is-low'), 'jauge vide : pulsation d\'alerte');

  // Remise à neuf pour la suite du scénario.
  game.player.hunger = game.player.maxHunger;
  game.player.hp = game.player.maxHp;
  game.player.starveT = 0;
  game.player.lastHurtAt = -99;
  await frames(3);
}

console.log('\n▶ PvP : étal protégé, coup visible, butin au sol');
{
  // Une tuile libre à côté du joueur pour poser l'étal de test.
  const ptx = Math.floor(game.player.x / TILE);
  const pty = Math.floor(game.player.y / TILE);
  let stx = null; let sty = null;
  outer:
  for (let r = 2; r <= 4; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const tx = ptx + dx; const ty = pty + dy;
        if (!game.world.inBounds(tx, ty)) continue;
        if (game.world.isSolidTile(tx, ty)) continue;
        if (game.world.blockAt(tx, ty)) continue;
        if (tx === ptx && ty === pty) continue;
        stx = tx; sty = ty; break outer;
      }
    }
  }
  if (stx === null) { // diagnostic temporaire
    let oob = 0, solid = 0, block = 0;
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const tx = ptx + dx, ty = pty + dy;
      if (!game.world.inBounds(tx, ty)) { oob++; continue; }
      if (game.world.isSolidTile(tx, ty)) { solid++; continue; }
      if (game.world.blockAt(tx, ty)) { block++; continue; }
    }
    console.log(`   [debug] joueur=(${game.player.x.toFixed(0)},${game.player.y.toFixed(0)}) tuile=(${ptx},${pty}) oob=${oob} solid=${solid} block=${block} inBounds(${ptx},${pty})=${game.world.inBounds(ptx, pty)} solid?=${game.world.isSolidTile(ptx, pty)} blockAt=${JSON.stringify(game.world.blockAt(ptx, pty))} performanceMode=${game.performanceMode}`);
  }
  assert(stx !== null, `une tuile libre existe près du joueur (${stx},${sty})`);
  const sIdx = game.world.idx(stx, sty);
  game.world.blocks[sIdx] = 'seller1';
  game.reindexPlacedChunk(stx, sty);

  // 1) UN AUTRE joueur a posé l'étal : la pioche n'amorce même pas.
  game.sellerData.set(sIdx, { tier: 1, owner: 999, item: 'wood', stock: 3, price: 5, till: 0 });
  game.targetTx = stx; game.targetTy = sty; game.inReach = true;
  for (let i = 0; i < 600; i++) game.mineTarget(1 / 60);
  assert(game.world.blocks[sIdx] === 'seller1',
    'un passant NE PEUT PAS casser l\'étal d\'un autre');
  assert(game.mining.progress === 0, 'et le minage n\'a même pas commencé');

  // 2) Le propriétaire casse son propre étal. L'identité du joueur local
  //    n'est plus codée en dur (-1) : elle vient du client multijoueur
  //    (js/main.js → `getOwnerId`), alors on la demande au jeu.
  const localOwner = game.uiCallbacks.getOwnerId ? game.uiCallbacks.getOwnerId() : -1;
  game.sellerData.set(sIdx, { tier: 1, owner: localOwner, item: 'wood', stock: 2, price: 5, till: 7 });
  for (let i = 0; i < 1200 && game.world.blocks[sIdx] === 'seller1'; i++) game.mineTarget(1 / 60);
  assert(game.world.blocks[sIdx] !== 'seller1', 'le propriétaire casse son étal');
  assert(game.sellerData.get(sIdx) === undefined, 'l\'état de l\'étal est purgé');

  // 3) Le coup porté à un joueur : swing + étincelles + envoi réseau.
  const rival = {
    id: 42, name: 'Rival', x: game.player.x + 40, y: game.player.y,
    facing: 'left', moving: false, walkPhase: 0, hp: 20, maxHp: 20,
    zone: game.world.id, appearance: {},
  };
  game.otherPlayers.push(rival);
  game.input.mouse.x = (rival.x - game.camera.x) * game.camera.zoom;
  game.input.mouse.y = ((rival.y - 8) - game.camera.y) * game.camera.zoom;
  game.pvpCooldown = 0;
  let sent = null;
  const prevAttack = game.uiCallbacks.onPlayerAttack;
  game.uiCallbacks.onPlayerAttack = (id, dmg) => { sent = { id, dmg }; };
  const partsBefore = game.particles.length;
  const prevPerf = game.performanceMode;
  const prevGfx = game.settings.graphics;
  game.performanceMode = false; // jsdom passe pour un appareil modeste : on force les particules
  game.settings.graphics = 'high';
  const aimed = game.tryAttackPlayer();
  assert(aimed === true && sent && sent.id === 42,
    `le clic sur un joueur déclenche le coup (dégâts ${sent && sent.dmg})`);
  assert(game.pvpSwingT > 0, 'l\'arme balance (enfin une animation)');
  assert(game.particles.length > partsBefore, 'des étincelles giclent sur la victime');
  game.performanceMode = prevPerf;
  game.settings.graphics = prevGfx;

  // 4) La victime SAIT qu'elle encaisse : PV en baisse + voile rouge.
  const hpBefore = game.player.hp;
  game.applyPlayerAttack(42, 3);
  assert(game.player.hp === hpBefore - 3, `les dégâts sont appliqués (${hpBefore} → ${game.player.hp})`);
  assert($('hurt-flash').classList.contains('flash'), 'la victime voit le voile rouge');

  // 5) Mort en PvP : TOUT l'inventaire tombe au sol, partagé au réseau,
  //    puis le vainqueur (ici : nous, en marchant dessus) le ramasse.
  const snapshot = game.inventory.slots.map((s) => (s ? { ...s } : null));
  game.inventory.add('wood', 5);
  const dropsSent = [];
  const takenSent = [];
  const prevDropsSend = game.uiCallbacks.onDropsSend;
  const prevTakenSend = game.uiCallbacks.onDropTakenSend;
  game.uiCallbacks.onDropsSend = (batch) => dropsSent.push(...batch);
  game.uiCallbacks.onDropTakenSend = (netId) => takenSent.push(netId);
  game.player.hp = 2;
  game.applyPlayerAttack(42, 5); // coup fatal
  assert(game.inventory.count('wood') === 0, 'mort : l\'inventaire est vidé');
  const woodDrop = game.droppedItems.find((d) => d.id === 'wood' && d.count === 5);
  assert(!!woodDrop && !!woodDrop.netId, 'le stuff est au sol avec un identifiant réseau');
  await until(() => dropsSent.some((d) => d.netId === woodDrop.netId), 2000);
  assert(dropsSent.some((d) => d.netId === woodDrop.netId),
    'le butin est annoncé aux autres joueurs de la zone');
  assert(game.player.hp === game.player.maxHp, 'respawn : PV rendus');

  // Le « vainqueur » marche sur le butin : ramassage + annonce de retrait.
  game.player.x = woodDrop.x;
  game.player.y = woodDrop.y;
  woodDrop.born = game.time - 10;
  await until(() => game.inventory.count('wood') >= 5, 2000);
  assert(game.inventory.count('wood') === 5, 'le vainqueur ramasse le stuff du vaincu');
  await until(() => takenSent.includes(woodDrop.netId), 2000);
  assert(takenSent.includes(woodDrop.netId), 'et le drop disparaît chez les autres (dropTaken)');

  // 6) Un drop venu du réseau apparaît et se retire chez nous aussi.
  game.applyRemoteDrops(game.world.id,
    [{ netId: 'test-drop-1', item: 'stone', count: 2, x: game.player.x + 4, y: game.player.y, vx: 0, vy: 0 }]);
  assert(game.droppedItems.some((d) => d.netId === 'test-drop-1'),
    'un drop annoncé par un autre apparaît chez nous');
  game.removeRemoteDrop(game.world.id, 'test-drop-1');
  assert(!game.droppedItems.some((d) => d.netId === 'test-drop-1'),
    'et disparaît quand quelqu\'un d\'autre le ramasse');
  game.applyRemoteDrops(game.world.id,
    [{ netId: 'test-drop-2', item: 'objet-inconnu-du-jeu', count: 1, x: game.player.x, y: game.player.y, vx: 0, vy: 0 }]);
  assert(!game.droppedItems.some((d) => d.netId === 'test-drop-2'),
    'un drop d\'objet inconnu du jeu n\'est jamais ajouté (filtre côté jeu)');

  // Remise à neuf : inventaire, PNJ factice, écoutables, sol nettoyé.
  game.droppedItems.length = 0;
  game.inventory.drainAll();
  for (const s of snapshot) if (s) game.inventory.add(s.id, s.count);
  game.otherPlayers = game.otherPlayers.filter((p) => p.id !== 42);
  game.uiCallbacks.onPlayerAttack = prevAttack;
  game.uiCallbacks.onDropsSend = prevDropsSend;
  game.uiCallbacks.onDropTakenSend = prevTakenSend;
  game.player.hp = game.player.maxHp;
  game.player.hunger = game.player.maxHunger;
  game.player.lastHurtAt = -99;
  await frames(2);
}

console.log('\n▶ L\'entrée de la grotte');
// On se place sur le parvis, juste devant l'arche.
game.player.x = 92 * 32 + 16;
game.player.y = 39 * 32 + 16;
game.camera.snapTo(game.player.x, game.player.y);
await frames(8);

// Les deux marchands attendent de part et d'autre de l'entrée.
const maskGuy = game.npcs.find((n) => n.kind === 'merchantMask');
const armorGuy = game.npcs.find((n) => n.kind === 'merchantArmor');
assert(!!maskGuy, 'le marchand de masques est à l\'entrée');
assert(!!armorGuy, 'le marchand de protections est à l\'entrée');
assert(maskGuy && armorGuy && maskGuy.state.id !== armorGuy.state.id,
  'ce sont bien deux marchands distincts');
for (const guy of [maskGuy, armorGuy].filter(Boolean)) {
  const d = Math.hypot(guy.x - game.player.x, guy.y - game.player.y);
  assert(d < 6 * 32, `${guy.name} se tient près de l'entrée (${Math.round(d / 32)} tuiles)`);
}
await renderOnce('au parvis de la grotte');

// La tuile visée est recalculée chaque frame depuis la position souris
// (game.input.mouse). jsdom n'a pas de souris : on écrit cette position
// comme le ferait un vrai mousemove, en repassant par la formule inverse
// du jeu (monde → pixels canvas).
function aimAt(tx, ty) {
  const zoom = game.camera.zoom;
  game.input.mouse.x = (tx * 32 + 16 - game.camera.x) * zoom;
  game.input.mouse.y = (ty * 32 + 16 - game.camera.y) * zoom;
}

// Viser loin : hors de portée, aucune invite ne doit traîner à l'écran.
aimAt(92 - 10, 38);
await frames(3);
assert(game.inReach === false, 'une tuile lointaine est bien hors de portée');
assert($('interact-prompt').classList.contains('hidden'),
  'aucune invite d\'interaction quand rien n\'est visé');

// Le joueur pointe l'arche, à une tuile de lui.
aimAt(92, 38);
await frames(4);
assert(game.interactTarget && game.interactTarget.action === 'enterCave',
  'l\'arche est reconnue comme point de passage');
assert($('interact-label').textContent === 'Entrer dans la grotte',
  `l'invite le dit (« ${$('interact-label').textContent} »)`);
assert($('interact-key').textContent === 'F', `avec la bonne touche (« ${$('interact-key').textContent} »)`);
assert(!$('interact-prompt').classList.contains('hidden'), 'et elle est affichée');

console.log('\n▶ Descente refusée sans équipement');
press('f');
await frames(8);
assert(game.world.kind === 'cave', 'F fait entrer dans la grotte');
assert(game.world.depth === 1, 'on arrive au niveau 1');
assert(game.world.id === 'cave:1', `l'identifiant du monde suit (${game.world.id})`);
await renderOnce('dans la grotte');
await new Promise((r) => setTimeout(r, 700));
await frames(2);
assert(/1/.test($('depth-label').textContent),
  `la profondeur est affichée (« ${$('depth-label').textContent} »)`);
game.descend();
await frames(8);
assert(game.world.depth === 1, 'sans masque ni protection, on ne descend pas');

// On ressort acheter ce qu'il faut.
game.exitCave();
await frames(8);
assert(game.world.kind === 'surface', 'on ressort à la surface');
assert(game.npcs.some((n) => n.kind === 'merchantMask'),
  'les marchands sont toujours au parvis');

// --- Négociation : un achat complet, du texte au débit -------------
async function buyFrom(guy, opts) {
  game.player.x = guy.x;
  game.player.y = guy.y + 40;
  await frames(4);
  game.uiCallbacks.onTalk(guy);
  await frames(4);

  assert(!$('merchant-chat').classList.contains('hidden'), `le comptoir de ${guy.name} s'ouvre`);
  assert($('mc-name').textContent === guy.name, `avec son nom (« ${$('mc-name').textContent} »)`);
  assert($('mc-log').children.length > 0, `${guy.name} dit quelque chose`);

  const spoken = () => $('mc-log').textContent;
  const clean = (where) => {
    const t = spoken();
    assert(!/[*#`~]|\|\s|^\s*[-*]\s/m.test(t), `${where} : aucun markdown`);
    assert(!/\b(IA|I\.A\.|intelligence artificielle|chatbot|prompt|assistant|modèle)\b/i.test(t),
      `${where} : il ne se présente jamais comme une IA`);
    assert(!/^\s*[*_([]/m.test(t), `${where} : aucune didascalie`);
  };
  clean('salutation');

  const ask = async (text) => {
    // La salutation de Gaspard contient déjà une offre : on efface celle
    // qui est en attente avant d'écrire, pour que le passage
    // « caché → visible » ne puisse venir que de la réponse à CE message.
    if (!$('mc-offer').classList.contains('hidden')) {
      click($('mc-offer-talk'));
      await frames(2);
    }
    $('mc-input').value = text;
    $('mc-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    return until(() => !$('mc-offer').classList.contains('hidden'), 400);
  };
  const offerPrice = () => parseInt($('mc-offer-price').textContent.replace(/\D/g, ''), 10);

  // La bourse n'a plus de compteur dans le HUD : on la lit là où elle
  // vit désormais, dans les cases de l'inventaire (via le Wallet).
  const balance = () => window.__wallet.money;

  // --- 1) L'article haut de gamme dépasse la bourse : le bouton doit le
  //        dire au lieu de laisser croire à un achat possible.
  assert(await ask(opts.expensiveAsk), `${guy.name} : une offre /sell s'affiche`);
  clean('négociation');
  const pricey = offerPrice();
  assert(pricey > balance(), `son haut de gamme dépasse la bourse (${pricey} écus)`);
  assert($('mc-offer-buy').disabled === true, 'le bouton acheter est désactivé');
  assert(/manque/.test($('mc-offer-buy').textContent),
    `et il explique pourquoi (« ${$('mc-offer-buy').textContent} »)`);
  const beforeRefused = balance();
  click($('mc-offer-buy'));
  await frames(4);
  assert(balance() === beforeRefused, 'un achat impossible ne débite rien');

  // --- 1b) Refermer puis rouvrir le comptoir fait RÉAPPARAÎTRE l'offre
  //         négociée (le joueur qui revient n'a pas à redemander).
  press('Escape');
  await frames(3);
  assert($('merchant-chat').classList.contains('hidden'), 'Échap referme le comptoir');
  game.uiCallbacks.onTalk(guy);
  await frames(3);
  assert(!$('mc-offer').classList.contains('hidden'),
    'rouvrir le comptoir fait réapparaître les boutons d\'achat');
  assert(offerPrice() === pricey, `au même prix qu'avant de fermer (${offerPrice()} écus)`);

  // --- 2) « Continuer à discuter » referme l'offre sans rien acheter.
  click($('mc-offer-talk'));
  await frames(4);
  assert($('mc-offer').classList.contains('hidden'),
    `« continuer à discuter » referme l'offre (classe : ${$('mc-offer').className})`);

  // --- 3) On achète l'article abordable.
  assert(await ask(opts.cheapAsk), `${guy.name} : il propose aussi l'entrée de gamme`);
  assert(offerPrice() <= balance(), `cet article est abordable (${offerPrice()} écus)`);
  assert($('mc-offer-buy').disabled === false, 'le bouton acheter est actif');
  assert($('mc-offer-name').textContent.length > 0,
    `l'offre est nommée (« ${$('mc-offer-name').textContent} »)`);

  const salesBefore = guy.state.sales.length;
  const paid = offerPrice();
  click($('mc-offer-buy'));
  await frames(6);
  await new Promise((r) => setTimeout(r, 700));
  await frames(2);
  const left = balance();
  assert(left === beforeRefused - paid,
    `l'achat débite exactement le prix (${beforeRefused} − ${paid} = ${left})`);
  assert(guy.state.sales.length === salesBefore + 1, `${guy.name} enregistre sa vente`);
  const lastSale = guy.state.sales[guy.state.sales.length - 1];
  assert(lastSale && lastSale.price === paid, 'au prix réellement payé');
  assert($('mc-offer').classList.contains('hidden'), 'l\'offre est consommée');

  press('Escape');
  await frames(3);
  assert($('merchant-chat').classList.contains('hidden'), 'Échap referme le comptoir');
}

console.log('\n▶ Négociation avec les deux marchands');
await buyFrom(maskGuy, {
  expensiveAsk: 'je prends le masque scelle, le modele etanche',
  cheapAsk: 'un masque de toile, le plus simple',
});
await buyFrom(armorGuy, {
  expensiveAsk: 'il me faut l armure de minage integrale',
  cheapAsk: 'une tenue de cuir pour commencer',
});

console.log('\n▶ Équipement, puis descente');
game.refreshGear();
await frames(4);
assert(game.gear && game.gear.mask, `un masque est équipé (${game.gear && game.gear.mask})`);
assert(game.gear && game.gear.armor, `une protection est équipée (${game.gear && game.gear.armor})`);
assert(game.gear && game.gear.maxDepth >= 2,
  `profondeur atteignable : ${game.gear && game.gear.maxDepth}`);
await new Promise((r) => setTimeout(r, 700));
await frames(2);
assert($('gear-depth').textContent.length > 0,
  `le HUD d'équipement affiche la profondeur autorisée (« ${$('gear-depth').textContent} »)`);

game.enterCave();
await frames(8);
game.descend();
await frames(8);
assert(game.world.depth === 2, 'la descente est acceptée une fois équipé');
await renderOnce('au niveau 2');
await frames(20);

console.log('\n▶ Retour à la surface');
game.ascend();
await frames(8);
assert(game.world.depth === 1, 'on remonte au niveau 1');
game.ascend();
await frames(8);
assert(game.world.kind === 'surface', 'puis on ressort à la surface');
assert(game.npcs.some((n) => n.kind === 'merchantMask'), 'les marchands nous y attendent');
await frames(20);

assert(runtimeErrors.length === 0,
  `aucune erreur pendant toute la partie (${runtimeErrors[0] || 'rien'})`);

console.log('\n▶ Clic droit (poser un bloc / interagir) : jamais un plantage');
// Régression : `interactWithTarget` (l'action du clic droit) portait
// autrefois le même nom que `this.interactTarget`, une PROPRIÉTÉ
// d'instance réécrite à chaque frame par `updateInteractTarget` (l'objet
// PNJ/grotte visé par la touche F, ou `null`). Une propriété d'instance
// masque toujours une méthode de même nom sur le prototype : au moindre
// clic droit, avec `this.interactTarget` valant `null` (le cas courant),
// l'appel `this.interactTarget()` plantait avec « is not a function ».
// On vérifie ici les deux conditions qui garantissent que ça ne peut
// plus se reproduire :
assert(typeof game.interactWithTarget === 'function',
  'la méthode du clic droit existe sous un nom qui ne collisionne pas');
assert(game.interactTarget === null || typeof game.interactTarget === 'object',
  'la propriété du même nom (PNJ/grotte ciblé par F) reste un objet ou null, jamais la méthode elle-même');
game.updateInteractTarget(); // rejoue le cycle qui écrase la propriété, comme en jeu
let rightClickThrew = null;
try { game.interactWithTarget(); } catch (err) { rightClickThrew = err; }
assert(rightClickThrew === null,
  `un clic droit ne plante jamais (${rightClickThrew && rightClickThrew.message})`);

console.log('\n▶ Multijoueur : débit d\'émission réseau d\'un four (étape 4)');
{
  const furnaceEvents = [];
  const prevOnFurnaceChange = game.uiCallbacks.onFurnaceChange;
  game.uiCallbacks.onFurnaceChange = (tx, ty, state) => furnaceEvents.push({ tx, ty, state });

  const entry = game.getFurnaceEntry(50, 51);
  assert(entry._owned === true, 'ouvrir/récupérer un four en fait le propriétaire local (simulation active)');

  // Panneau fermé (entry._localOpen resté false) : dépose un ingrédient
  // et du combustible directement (sans passer par le SlotManager, hors
  // scope de ce test), puis avance le temps par petits pas — un four qui
  // brûle ne doit annoncer qu'un battement toutes les ~2,5 s tant que le
  // panneau n'est pas ouvert, jamais un flot par frame.
  entry.input[0] = { id: 'rawIron', count: 1 };
  entry.fuel[0] = { id: 'wood', count: 1 };
  furnaceEvents.length = 0; // on ignore l'annonce immédiate du changement structurel ci-dessous
  game.updateFurnaces(0.001); // un tick minuscule suffit à détecter le changement structurel
  assert(furnaceEvents.length === 1, 'déposer un ingrédient/combustible annonce immédiatement (changement structurel)');

  furnaceEvents.length = 0;
  for (let i = 0; i < 20; i++) game.updateFurnaces(0.1); // 2 s : sous le seuil d'inactivité (2,5 s)
  assert(furnaceEvents.length === 0,
    `aucune annonce avant le battement d'inactivité tant que rien ne change structurellement (${furnaceEvents.length})`);
  for (let i = 0; i < 10; i++) game.updateFurnaces(0.1); // +1 s : dépasse le seuil de 2,5 s
  assert(furnaceEvents.length >= 1, 'un battement finit par arriver tant que le four brûle, même panneau fermé');

  // Panneau ouvert : le débit devient « live » (toutes les ~0,5 s).
  entry._localOpen = true;
  furnaceEvents.length = 0;
  for (let i = 0; i < 6; i++) game.updateFurnaces(0.1); // 0,6 s : dépasse le seuil live (0,5 s)
  assert(furnaceEvents.length >= 1, 'panneau ouvert : le débit passe en « live » (bien plus fréquent)');

  // Le feu s'éteint : un dernier message est envoyé sans attendre le
  // prochain battement, pour que les observateurs distants voient tout
  // de suite le four s'éteindre.
  entry._localOpen = false;
  entry.fuelTime = 0.05;
  game.updateFurnaces(0.1); // le feu s'éteint pendant ce pas
  const lastEvent = furnaceEvents[furnaceEvents.length - 1];
  assert(lastEvent && lastEvent.state.fuelTime === 0, 'l\'extinction du feu est annoncée immédiatement');

  game.uiCallbacks.onFurnaceChange = prevOnFurnaceChange;
}

console.log('\n▶ Multijoueur : animaux partagés (étape 5)');
{
  // --- Établissement du troupeau (mobSync vide → on propose le nôtre) ---
  const snapshot = game.mobSnapshotForZone();
  assert(Array.isArray(snapshot) && snapshot.length === game.mobs.length,
    'le troupeau local peut être capturé pour être proposé au serveur');
  assert(snapshot.every((m) => typeof m.id === 'number' && typeof m.kind === 'string'),
    'chaque animal du troupeau a un id et une espèce');

  // --- Resynchronisation (un troupeau différent est déjà établi ailleurs) ---
  const remoteMobs = [
    { id: 100, kind: 'sheep', x: 111, y: 222, hp: 8, alive: true },
    { id: 101, kind: 'cow', x: 333, y: 444, hp: 12, alive: true },
  ];
  game.applyMobSync(game.world.id, remoteMobs);
  assert(game.mobs.length === 2, 'applyMobSync remplace le troupeau local par celui reçu');
  assert(game.mobs[0].id === 100 && game.mobs[0].kind === 'sheep', 'avec le bon id et la bonne espèce');
  assert(game.mobs[0].x === 111 && game.mobs[0].y === 222, 'à la bonne position');

  // --- Réapparition (mobSpawn) : ajoute un animal, ignore un id déjà connu ---
  game.applyMobSpawn(game.world.id, [{ id: 102, kind: 'sheep', x: 10, y: 20, hp: 8, alive: true }]);
  assert(game.mobs.length === 3, 'un animal neuf (repop) est ajouté au troupeau');
  game.applyMobSpawn(game.world.id, [{ id: 102, kind: 'sheep', x: 999, y: 999, hp: 8, alive: true }]);
  assert(game.mobs.length === 3, 'un id déjà connu est ignoré (pas de doublon)');

  // --- Correctif de position (mobState) : lissé en douceur, jamais un saut ---
  const sheep = game.mobs.find((m) => m.id === 100);
  const beforeX = sheep.x;
  game.applyMobState(game.world.id, [{ id: 100, x: 900, y: 900 }]);
  assert(sheep.x === beforeX, 'le correctif de position ne déplace pas immédiatement (juste une cible)');
  // Le correctif n'est qu'un « aimant » permanent : l'errance normale de
  // l'animal continue en parallèle (voir updateMob) et peut le faire
  // dériver un peu de sa cible — la tolérance reste large, on vérifie
  // juste une convergence nette, pas une position figée au pixel près.
  for (let i = 0; i < 400; i++) game.updateMobs(0.05); // 20 s de simulation : largement de quoi converger
  const dist = Math.hypot(sheep.x - 900, sheep.y - 900);
  assert(dist < 60,
    `l'animal converge en douceur vers le correctif reçu (${sheep.x.toFixed(1)}, ${sheep.y.toFixed(1)}, distance ${dist.toFixed(1)})`);

  // --- Coup local : diffusé via onMobHit ---
  const hitEvents = [];
  const prevOnMobHit = game.uiCallbacks.onMobHit;
  game.uiCallbacks.onMobHit = (id, hp, alive) => hitEvents.push({ id, hp, alive });
  const cow = game.mobs.find((m) => m.id === 101);
  game.attackMob(cow);
  assert(hitEvents.length === 1 && hitEvents[0].id === 101, 'frapper un animal annonce le coup immédiatement');
  assert(hitEvents[0].hp === cow.hp, 'avec les PV restants après le coup');
  game.uiCallbacks.onMobHit = prevOnMobHit;

  // --- Dégâts selon l'outil : plus le matériau est noble, plus ça tranche ---
  game.applyMobSpawn(game.world.id, [{ id: 200, kind: 'cow', x: 500, y: 500, hp: 100, alive: true }]);
  const target = game.mobs.find((m) => m.id === 200);
  const inv = game.inventory;
  const prevSel = inv.selected;
  const swordSlot = inv.hotbarStart + 8;
  const prevStack = inv.getSlot(swordSlot);
  const equip = (id) => {
    inv.setSlot(swordSlot, { id, count: 1 });
    inv.select(8);
  };
  equip('wooden_sword');
  let before = target.hp;
  game.attackMob(target);
  assert(before - target.hp === 3, `l'épée en bois inflige 3 dégâts (${before} → ${target.hp})`);
  equip('diamond_sword');
  before = target.hp;
  game.attackMob(target);
  assert(before - target.hp === 7, `l'épée en diamant inflige 7 dégâts (${before} → ${target.hp})`);
  equip('diamond_axe');
  before = target.hp;
  game.attackMob(target);
  assert(before - target.hp === 6, `la hache en diamant inflige 6 dégâts (${before} → ${target.hp})`);
  inv.setSlot(swordSlot, prevStack || null);
  inv.select(prevSel);

  console.log('\n▶ Agriculture (boucle de jeu)');
{
  const ptx = Math.floor(game.player.x / 32);
  const pty = Math.floor(game.player.y / 32);
  const idx = game.world.idx(ptx, pty);
  const keepFloor = game.world.floor[idx];
  const keepBlock = game.world.blocks[idx];
  game.world.blocks[idx] = 'wheat0';
  game.world.floor[idx] = 'farmland';
  for (let s = 0; s < 16; s++) game.updateCrops(1); // 16 s simulées
  assert(game.world.blocks[idx] === 'wheat1', `le semis pousse (→ ${game.world.blocks[idx]})`);
  for (let s = 0; s < 46; s++) game.updateCrops(1);
  assert(game.world.blocks[idx] === 'wheat3', `le blé atteint la maturité (${game.world.blocks[idx]})`);
  game.world.blocks[idx] = keepBlock;
  game.world.floor[idx] = keepFloor;

  // Manger donne un bonus temporaire.
  const foodSlot = game.inventory.hotbarStart + 7;
  const keepFood = game.inventory.getSlot(foodSlot);
  game.inventory.setSlot(foodSlot, { id: 'bread', count: 1 });
  game.inventory.select(7);
  game.wellFedT = 0;
  game.player.hunger = 10; // avoir faim : repu, le jeu refuse de gaspiller
  game.eatSelectedFood();
  assert(game.player.hunger === 16, `manger remplit la faim (10 → ${game.player.hunger})`);
  assert(game.wellFedT > 0, 'manger rend bien nourri');
  assert(game.inventory.count('bread') === 0, 'le pain est consommé');
  assert(game.wellFedBoost() === 1.1, 'et le bonus de minage s\'applique');
  game.wellFedT = 0;
  game.inventory.setSlot(foodSlot, keepFood || null);
}

  // --- Coup distant (mobHit) : mort et butin appliqués localement ---
  const dropsBefore = game.droppedItems.length;
  game.applyMobHit(game.world.id, { id: 100, hp: 0, alive: false });
  assert(sheep.alive === false, 'un coup fatal reçu à distance tue bien l\'animal localement');
  assert(game.droppedItems.length > dropsBefore, 'et laisse tomber son butin comme un animal tué localement');

  // --- Coordinateur : seul le premier joueur (id le plus petit) gère la repop/l'état ---
  const stateEvents = [];
  const respawnEvents = [];
  const prevOnMobState = game.uiCallbacks.onMobState;
  const prevOnMobRespawn = game.uiCallbacks.onMobRespawn;
  const prevIsCoordinator = game.uiCallbacks.isMobCoordinator;
  game.uiCallbacks.onMobState = (mobs) => stateEvents.push(mobs);
  game.uiCallbacks.onMobRespawn = (mobs) => respawnEvents.push(mobs);

  game.uiCallbacks.isMobCoordinator = () => false;
  game._mobStateTimer = 999; game._mobRespawnTimer = 999;
  game.updateMobs(0.016);
  assert(stateEvents.length === 0 && respawnEvents.length === 0,
    'un client qui n\'est PAS coordinateur ne diffuse ni correctif ni repop');

  game.uiCallbacks.isMobCoordinator = () => true;
  game._mobStateTimer = 999; game._mobRespawnTimer = 999;
  game.updateMobs(0.016);
  assert(stateEvents.length === 1, 'le coordinateur diffuse un correctif de position');
  assert(respawnEvents.length === 1, 'le coordinateur vérifie aussi la repop à son échéance');

  game.uiCallbacks.onMobState = prevOnMobState;
  game.uiCallbacks.onMobRespawn = prevOnMobRespawn;
  game.uiCallbacks.isMobCoordinator = prevIsCoordinator;
}

console.log('\n▶ Chat : fenêtre toujours visible, canal global / talkie-walkie');
const gchat = window.__globalChat;
assert(!!gchat, 'js/main.js construit la fenêtre de chat');
assert(!$('global-chat').classList.contains('hidden'), 'la fenêtre de chat est visible sans aucune touche à presser');
assert($('global-chat').getAttribute('data-side') === 'left', 'elle est ancrée en bas à gauche par défaut');

// Écrire avec une connexion morte : le message s'affiche quand même (on
// ne perd pas ce qu'on tape) et l'état est signalé. L'état « déconnecté »
// est forcé plutôt que déduit de l'environnement : ce test ne doit pas
// dépendre de ce qui tourne (ou pas) sur le port 3000 à côté de lui.
const mp = window.__multiplayer;
const wasConnected = mp.connected;
mp.connected = false;
$('gchat-input').value = 'Bonjour le village';
gchat.submit();
assert($('gchat-log').textContent.includes('Bonjour le village'), 'le message tapé apparaît dans le journal');
assert($('gchat-log').textContent.includes('vous'), 'et il est marqué comme venant de nous');
assert($('gchat-log').textContent.toLowerCase().includes('hors ligne'),
  'un envoi hors ligne est signalé plutôt que perdu silencieusement');
assert($('gchat-input').value === '', 'le champ est vidé après l\'envoi');
mp.connected = wasConnected;

// Le talkie-walkie se bascule à la touche V (ou au bouton du canal).
pressOnce('v');
assert(gchat.channel === 'proximity', 'la touche V passe le chat en canal de proximité');
assert($('global-chat').classList.contains('is-proximity'), 'la fenêtre prend l\'apparence du talkie-walkie');
assert($('gchat-channel-label').textContent === 'Proximité', 'le bouton du canal annonce « Proximité »');
pressOnce('v');
assert(gchat.channel === 'global', 'la touche V rebascule sur le canal global');

// Un message reçu du réseau (ici simulé, comme le ferait js/net.js) doit
// s'afficher avec son auteur, et une bulle de proximité au-dessus du
// joueur quand c'est le canal du talkie-walkie.
gchat.push({ from: 'Margot', text: 'Salut !', channel: 'global' });
assert($('gchat-log').textContent.includes('Margot'), 'un message distant affiche son auteur');
game.showLocalBubble('Je suis là');
assert(!!game.player._bubble && game.player._bubble.text === 'Je suis là',
  'parler au talkie-walkie affiche une bulle sur notre personnage');
game.showRemoteBubble(4242, 'Personne');
assert(!game.otherPlayers.some((p) => p._bubble), 'une bulle pour un joueur inconnu ne crée rien');
await renderOnce('avec une bulle de talkie-walkie');
game.player._bubble = null;

console.log('\n▶ Téléphone : réseau social (touche P)');
const phone = window.__phone;
assert(!!phone, 'js/main.js construit le téléphone');
assert($('phone').classList.contains('hidden'), 'le téléphone est fermé au démarrage');
pressOnce('p');
assert(!$('phone').classList.contains('hidden'), 'la touche P ouvre le téléphone');
assert(phone.isOpen === true, 'le panneau se dit ouvert');
assert(game.paused === true, 'ouvrir le téléphone met le jeu en pause (on y écrit au clavier)');
assert(!$('phone-auth').classList.contains('hidden'), 'sans compte, l\'écran de connexion s\'affiche');

// Aucune API joignable ici : le refus doit être expliqué, pas silencieux.
$('phone-auth-handle').value = 'Testeur';
$('phone-auth-pass').value = 'motdepasse';
await phone.submitAuth();
assert($('phone-auth-error').textContent.length > 0,
  `un échec de connexion est expliqué au joueur (« ${$('phone-auth-error').textContent} »)`);
assert($('phone-auth').classList.contains('hidden') === false, 'et on reste sur l\'écran de connexion');

// Bascule création de compte <-> connexion.
const authTitle = $('phone-auth-title').textContent;
click($('phone-auth-switch'));
assert($('phone-auth-title').textContent !== authTitle, 'le bouton bascule entre créer un compte et se connecter');

pressOnce('Escape');
assert($('phone').classList.contains('hidden'), 'Échap raccroche le téléphone');
assert(game.paused === false, 'et rend la main au jeu');
await renderOnce('après le téléphone');


console.log('\n▶ Conduire : les voitures de Fortune City');
{
  // On repart pour l'île : Gab attend toujours sur le quai d'Avania.
  game.startCrossing('fortune', null, { from: 'Avania', to: 'Fortune City' });
  assert(await until(() => !game.crossing.running, 900), 'on traverse');
  await frames(3);
  assert(game.world.id === 'fortune', `on est sur Fortune City (${game.world.id})`);

  const cars = game.carsFor(game.world);
  assert(cars.length >= 3, `des voitures sont garées (${cars.length})`);
  const car = cars[0];

  // --- 1) Monter : on marche jusqu'à la voiture et on appuie sur F. ---
  game.player.x = car.x;
  game.player.y = car.y + 34;
  await frames(4);
  assert(game.interactTarget && game.interactTarget.action === 'car',
    'la voiture est proposée à portée de main');
  press('f');
  await frames(4);
  assert(game.driving === car, 'on est au volant');

  // --- 2) Rouler : Z maintenu, la voiture avance. ---
  const x0 = car.x;
  const y0 = car.y;
  hold('z');
  await frames(45);
  release('z');
  assert(Math.hypot(car.x - x0, car.y - y0) > 40,
    `la voiture a roulé (${Math.round(Math.hypot(car.x - x0, car.y - y0))} px)`);
  assert(!game.world.isSolidAt(car.x, car.y), 'et ne s\'est pas encastrée dans un mur');
  await renderOnce('au volant');

  // --- 3) Le joueur est dedans : sa position suit la voiture. ---
  assert(Math.abs(game.player.x - car.x) < 1 && Math.abs(game.player.y - car.y) < 1,
    'le joueur est assis dans la voiture');

  // --- 4) Descendre : F, et on pose le joueur sur une case libre. ---
  press('f');
  await frames(4);
  assert(game.driving === null, 'on est descendu');
  assert(!game.world.isSolidAt(game.player.x, game.player.y),
    'sur une case libre, pas dans un mur');
  assert(Math.hypot(game.player.x - car.x, game.player.y - car.y) > 8,
    'et à côté de la voiture, pas dedans');
  await renderOnce('après être descendu');

  // --- 5) Une voiture ne va pas sur l'eau : le bassin est à l'ouest. ---
  car.x = 21 * 32 + 16;
  car.y = 64 * 32 + 16;
  car.angle = Math.PI;
  car.speed = 0;
  game.enterCar(car);
  hold('z');
  await frames(90);
  release('z');
  assert(game.world.floor[game.world.idx(Math.floor(car.x / 32), Math.floor(car.y / 32))] !== 'water',
    'elle refuse de flotter sur le bassin');
  game.exitCar();
  await frames(2);

  // --- 6) On rentre à Avania : la suite des tests commence sur le port. ---
  game.startCrossing('surface', null, { from: 'Fortune City', to: 'Avania' });
  assert(await until(() => !game.crossing.running, 900), 'le retour traverse aussi');
  await frames(3);
  assert(game.world.id === 'surface', `et on est bien rentré (${game.world.id})`);
}

console.log('\n▶ Le passeur : Gab et la traversée vers Fortune City');
{
  const balance = () => window.__wallet.money;
  const priceOf = () => parseInt($('mc-offer-price').textContent.replace(/\D/g, ''), 10);
  const waitOffer = () => until(() => !$('mc-offer').classList.contains('hidden'), 400);

  // --- 1) Gab attend sur le quai du port (côte est). ---
  assert(game.world.kind === 'surface', 'on part d\'Avania');
  const gab = game.npcs.find((n) => n.kind === 'ferryman');
  assert(!!gab, 'Gab attend sur le quai');
  assert(gab.name === 'Gab' && gab.title === 'Le Passeur',
    `c\'est bien le passeur (« ${gab.name}, ${gab.title} »)`);
  assert(gab.state.destination === 'fortune', 'il mène à Fortune City');

  // --- 2) On lui parle : le tarif est annoncé d'emblée. ---
  game.player.x = gab.x;
  game.player.y = gab.y + 40;
  await frames(4);
  game.uiCallbacks.onTalk(gab);
  await frames(4);
  assert(!$('merchant-chat').classList.contains('hidden'), 'le comptoir s\'ouvre');
  assert($('mc-name').textContent === 'Gab', 'à son nom');
  assert(await waitOffer(), 'il propose la traversée sans qu\'on la demande');
  assert(priceOf() === 20, `au tarif fixe de 20 écus (${priceOf()})`);
  assert(/Payer/.test($('mc-offer-buy').textContent),
    `le bouton propose de payer (« ${$('mc-offer-buy').textContent} »)`);
  // Pas d'aller-retour : l'offre le précise.
  assert(/aller simple/i.test($('mc-offer-desc').textContent),
    `et rappelle que c\'est un aller simple (« ${$('mc-offer-desc').textContent} »)`);

  // --- 3) Le tarif n'est pas négociable. ---
  $('mc-input').value = '10 écus, aller retour, et on est amis ?';
  $('mc-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await waitOffer();
  await frames(2);
  assert(priceOf() === 20, `après marchandage, le prix ne bouge pas (${priceOf()} écus)`);

  // --- 4) On paie : on débarque de l'autre côté. ---
  const before = balance();
  assert($('mc-offer-buy').disabled === false, `la bourse suit (${before} écus)`);
  click($('mc-offer-buy'));
  await frames(4);
  // --- 4b) La traversée est une cinématique : la mer défile, et on ne
  //         débarque qu'à la fin (pas de téléportation sèche). ---
  assert(game.crossing.running === true, 'la traversée commence (cinématique)');
  await renderOnce('pendant la traversée');
  assert(game.world.id === 'surface',
    'on est encore en mer : le débarquement n\'est pas instantané');
  assert(await until(() => !game.crossing.running, 900), 'elle se termine d\'elle-même');
  await frames(2);
  assert(game.world.id === 'fortune', `on débarque sur l\'autre île (${game.world.id})`);
  assert(balance() === before - 20, `la traversée est débitée (${before} → ${balance()})`);
  assert(gab.state.crossings === 1, 'Gab compte sa traversée');
  assert($('merchant-chat').classList.contains('hidden'), 'le comptoir s\'est refermé');
  assert(!game.world.isSolidAt(game.player.x, game.player.y), 'on débarque sur case libre');
  await renderOnce('sur l\'autre rive');

  // --- 5) Fortune City est vide pour l'instant (terrain nu). ---
  assert(!game.world.blocks.some((b) => b === 'tree' || b === 'rock'),
    'aucun arbre ni rocher : le reste de l\'île attend les autres quartiers');
  assert(game.world.floor.includes('quay'), 'et elle a bien son port');
  assert(game.world.floor.includes('sand'), 'avec sa plage');

  // --- 6) Pas d'aller-retour : Gab attend sur la grève, le retour se paie. ---
  const back = game.npcs.find((n) => n.kind === 'ferryman');
  assert(!!back, 'Gab est aussi de l\'autre côté');
  assert(back.state.destination === 'surface', 'et il ramène à Avania');
  game.player.x = back.x;
  game.player.y = back.y + 40;
  await frames(4);
  game.uiCallbacks.onTalk(back);
  await frames(4);
  assert(await waitOffer(), 'il propose le retour');
  assert(priceOf() === 20, `le retour coûte aussi 20 écus (${priceOf()})`);
  const beforeBack = balance();
  click($('mc-offer-buy'));
  await frames(3);
  assert(game.crossing.running === true, 'le retour embarque aussi');
  // On n'est pas prisonnier de la cinématique : une touche et on accoste.
  press('f');
  await frames(3);
  assert(game.crossing.running === false, 'une touche abrège la traversée');
  assert(game.world.id === 'surface', 'et on revient à Avania');
  assert(balance() === beforeBack - 20, 'le retour est débité comme l\'aller');
  pressOnce('Escape');
  await frames(3);
  assert($('merchant-chat').classList.contains('hidden'), 'Échap referme le comptoir');
}

console.log(failures === 0 ? '\n✅ Intégration navigateur OK' : `\n❌ ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
