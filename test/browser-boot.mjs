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
for (const id of ['hud', 'hud-right', 'wallet', 'wallet-amount', 'wallet-delta', 'depth-chip',
  'depth-label', 'gear-chip', 'gear-depth', 'interact-prompt', 'interact-key', 'interact-label',
  'dialog', 'dialog-speaker', 'dialog-text', 'dialog-skip', 'merchant-chat', 'mc-log',
  'mc-input', 'mc-form', 'mc-offer', 'mc-offer-buy', 'mc-offer-talk', 'mc-offer-price']) {
  assert(!!$(id), `#${id} présent dans index.html`);
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
const moneyText = $('wallet-amount').textContent;
const money = parseInt(moneyText.replace(/\D/g, ''), 10);
assert(money === 150, `le portefeuille affiche la somme de bienvenue (« ${moneyText} » → ${money})`);

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

  const balance = () => parseInt($('wallet-amount').textContent.replace(/\D/g, ''), 10);

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

console.log(failures === 0 ? '\n✅ Intégration navigateur OK' : `\n❌ ${failures} échec(s)`);
process.exit(failures === 0 ? 0 : 1);
