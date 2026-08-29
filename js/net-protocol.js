// ============================================================
//  AVANIA — Protocole réseau partagé (client ET serveur)
//
//  Ce module ne dépend ni du DOM ni de Node : il tourne tel quel dans
//  le navigateur (js/net.js) et dans le serveur (server.js). Une seule
//  implémentation, jamais deux versions à faire évoluer en parallèle.
//
//  Choix de conception (tout est dicté par le budget très serré du
//  plan gratuit Render — 0.1 CPU, 512 Mo, 5 Go/mois) :
//   - les paquets FRÉQUENTS (position) sont BINAIRES et minuscules
//     (6 octets par joueur) — pas de JSON, pas de clés répétées ;
//   - les paquets RARES (arrivée, départ, apparence) restent en JSON,
//     lisible et simple, leur coût est négligeable ;
//   - le serveur ne rediffuse QUE ce qui a changé (delta), jamais un
//     instantané complet à chaque tick — un monde immobile ne coûte
//     aucun octet.
// ============================================================

export const WS_PATH = '/ws';

// Taille du monde (js/config.js : WORLD_W/WORLD_H) dupliquée ici en dur —
// ce module ne doit dépendre de rien d'autre. Sert uniquement à borner
// les coordonnées de tuile reçues du réseau (protection basique, la
// valeur réelle n'a aucune influence sur le protocole lui-même).
export const MAX_WORLD_TILE = 512;

export function validTile(n) {
  return Number.isInteger(n) && n >= 0 && n < MAX_WORLD_TILE;
}

// Un octet suffit très largement : la cible est une vingtaine de
// joueurs simultanés, pas un MMO.
export const MAX_PLAYER_ID = 255;

export const FACINGS = ['down', 'up', 'left', 'right'];
const FACING_INDEX = Object.fromEntries(FACINGS.map((f, i) => [f, i]));

export function facingToCode(facing) {
  return FACING_INDEX[facing] ?? 0;
}
export function codeToFacing(code) {
  return FACINGS[code & 0b11] || 'down';
}

// --- Étiquettes des trames binaires (premier octet) ---
export const BIN_STATE = 0x01; // serveur → clients : positions (delta)
export const BIN_INPUT = 0x02; // client → serveur : ma position

const STATE_ENTRY_BYTES = 6; // id(1) + x(2) + y(2) + flags(1)
const INPUT_BYTES = 6;       // tag(1) + x(2) + y(2) + flags(1)

// `ws` (côté serveur) livre des Buffer qui peuvent pointer dans un
// pool partagé plus grand : il FAUT respecter byteOffset/byteLength,
// jamais réutiliser `.buffer` tel quel. Ce helper marche aussi bien sur
// un ArrayBuffer brut (navigateur) que sur un Buffer/Uint8Array (Node).
function toDataView(src) {
  if (src instanceof DataView) return src;
  if (ArrayBuffer.isView(src)) return new DataView(src.buffer, src.byteOffset, src.byteLength);
  return new DataView(src);
}

function clampU16(n) {
  return Math.max(0, Math.min(65535, n | 0));
}

// entries: [{ id, x, y, facing, moving }] → une seule trame binaire.
export function encodeState(entries) {
  const buf = new ArrayBuffer(2 + entries.length * STATE_ENTRY_BYTES);
  const view = new DataView(buf);
  view.setUint8(0, BIN_STATE);
  view.setUint8(1, entries.length & 0xff);
  let o = 2;
  for (const e of entries) {
    view.setUint8(o, e.id & 0xff); o += 1;
    view.setUint16(o, clampU16(e.x), true); o += 2;
    view.setUint16(o, clampU16(e.y), true); o += 2;
    const flags = (facingToCode(e.facing) & 0b11) | (e.moving ? 0b100 : 0);
    view.setUint8(o, flags); o += 1;
  }
  return buf;
}

export function decodeState(src) {
  const view = toDataView(src);
  if (view.byteLength < 2 || view.getUint8(0) !== BIN_STATE) return null;
  const count = view.getUint8(1);
  const entries = [];
  let o = 2;
  for (let i = 0; i < count; i++) {
    if (o + STATE_ENTRY_BYTES > view.byteLength) break; // trame tronquée : on garde ce qui est valide
    const id = view.getUint8(o); o += 1;
    const x = view.getUint16(o, true); o += 2;
    const y = view.getUint16(o, true); o += 2;
    const flags = view.getUint8(o); o += 1;
    entries.push({ id, x, y, facing: codeToFacing(flags & 0b11), moving: Boolean(flags & 0b100) });
  }
  return entries;
}

// Le client envoie sa propre position ainsi (id implicite : le serveur
// sait déjà qui parle, pas besoin de le répéter).
export function encodeInput(x, y, facing, moving) {
  const buf = new ArrayBuffer(INPUT_BYTES);
  const view = new DataView(buf);
  view.setUint8(0, BIN_INPUT);
  view.setUint16(1, clampU16(x), true);
  view.setUint16(3, clampU16(y), true);
  const flags = (facingToCode(facing) & 0b11) | (moving ? 0b100 : 0);
  view.setUint8(5, flags);
  return buf;
}

export function decodeInput(src) {
  const view = toDataView(src);
  if (view.byteLength < INPUT_BYTES || view.getUint8(0) !== BIN_INPUT) return null;
  const x = view.getUint16(1, true);
  const y = view.getUint16(3, true);
  const flags = view.getUint8(5);
  return { x, y, facing: codeToFacing(flags & 0b11), moving: Boolean(flags & 0b100) };
}

// ------------------------------------------------------------
//  Étape 2 : monde partagé (blocs cassés / posés / portes)
//
//  Ces messages restent en JSON (comme 'hello'/'join'/'zone') : ils
//  sont rares comparés au flot de position (un changement de bloc par
//  action du joueur, jamais par frame), donc leur coût réseau est
//  négligeable même non compacté. Un seul format de « diff » de tuile,
//  partagé par le client (émission) et le serveur (relais + journal
//  de resynchronisation), pour ne jamais avoir deux définitions du
//  même objet à faire évoluer en parallèle.
//
//  Le contenu des coffres, la progression des fours et le troupeau
//  d'animaux sont synchronisés séparément (voir plus bas dans ce
//  fichier) : chacun a un format assez différent pour mériter le sien.
// ------------------------------------------------------------
// Un identifiant de bloc/sol ne dépasse jamais quelques caractères
// (voir js/blocks.js) : on se laisse une marge large sans avoir à
// importer BLOCK_DEFS ici (ce module doit rester sans dépendance).
const MAX_ID_LEN = 24;

function validId(v) {
  return v === null || (typeof v === 'string' && v.length > 0 && v.length <= MAX_ID_LEN);
}

// Valide/nettoie un diff de tuile reçu (réseau) ou construit localement.
// Ne garde QUE les clés reconnues, avec des types corrects — protège le
// serveur d'un client malveillant, et le client d'un message corrompu.
// Un diff est volontairement PARTIEL : seules les clés présentes et
// valides sont retenues, les autres tuiles restent inchangées.
export function sanitizeBlockDiff(src) {
  const out = {};
  if (!src || typeof src !== 'object') return out;
  if (Object.prototype.hasOwnProperty.call(src, 'floor') && validId(src.floor)) out.floor = src.floor;
  if (Object.prototype.hasOwnProperty.call(src, 'blocks') && validId(src.blocks)) out.blocks = src.blocks;
  if (Object.prototype.hasOwnProperty.call(src, 'blocks2') && validId(src.blocks2)) out.blocks2 = src.blocks2;
  if (Object.prototype.hasOwnProperty.call(src, 'door') && (src.door === 0 || src.door === 1)) out.door = src.door;
  return out;
}

// Une zone valide est 'surface' ou 'cave:<profondeur>' (profondeur 1..50 :
// large marge au-dessus de CAVE.maxDepth pour ne pas coupler ce module au
// contenu du jeu). Tout le reste retombe sur 'surface' — ça borne aussi le
// nombre de zones qu'un client malveillant pourrait faire mémoriser au
// serveur (voir net-server.js, journal de blocs par zone).
export function sanitizeZone(zone) {
  const s = typeof zone === 'string' ? zone.slice(0, 24) : 'surface';
  if (s === 'surface') return s;
  const m = /^cave:([0-9]{1,3})$/.exec(s);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 50) return s;
  return 'surface';
}

// ------------------------------------------------------------
//  Étape 3 : coffres partagés
//
//  Un coffre posé (27 cases, voir js/game.js getChestEntry) est
//  synchronisé comme un tout : à chaque changement, le client qui a
//  le panneau ouvert envoie l'INTÉGRALITÉ des 27 cases (pas un diff
//  case par case — un coffre entier tient dans un message JSON de
//  l'ordre du kilo-octet, largement négligeable pour un évènement
//  aussi rare qu'une manipulation d'inventaire). Le format d'une case
//  est volontairement libre (n'importe quel champ d'un ITEM_DEFS peut
//  y transiter — durabilité d'un outil par ex.) : ce module ne
//  connaît PAS blocks.js, il se contente de borner la taille de ce
//  qu'un client peut faire mémoriser au serveur.
// ------------------------------------------------------------
export const MAX_CHEST_SLOTS = 27;
const MAX_STACK_COUNT = 999; // large marge au-dessus des piles réelles (64 max côté jeu)
const MAX_DURABILITY = 100000;

// Valide/nettoie UNE case de coffre (ou null = case vide).
function sanitizeStack(s) {
  if (s === null) return null;
  if (!s || typeof s !== 'object') return null;
  if (!validId(s.id)) return null;
  const count = Math.trunc(s.count);
  if (!Number.isFinite(count) || count < 1 || count > MAX_STACK_COUNT) return null;
  const out = { id: s.id, count };
  if (Object.prototype.hasOwnProperty.call(s, 'durability')) {
    const d = Number(s.durability);
    if (Number.isFinite(d)) out.durability = Math.max(0, Math.min(MAX_DURABILITY, d));
  }
  return out;
}

// Valide/nettoie un tableau de cases de coffre reçu du réseau (ou
// construit localement avant émission) : longueur bornée à
// MAX_CHEST_SLOTS, chaque case sanitizée indépendamment (une case
// invalide devient simplement vide plutôt que de rejeter tout le
// message — un coffre à moitié corrompu reste préférable à un coffre
// qui disparaît).
export function sanitizeChestSlots(src) {
  const out = new Array(MAX_CHEST_SLOTS).fill(null);
  if (!Array.isArray(src)) return out;
  for (let i = 0; i < MAX_CHEST_SLOTS && i < src.length; i++) out[i] = sanitizeStack(src[i]);
  return out;
}

// ------------------------------------------------------------
//  Étape 4 : fours partagés (progression de cuisson)
//
//  Un four posé (voir js/furnace.js makeFurnaceEntry) est synchronisé
//  comme un tout : {input, fuel, output, progress, fuelTime,
//  maxFuelTime}. Contrairement aux coffres (qui ne changent que sur
//  interaction du joueur), la cuisson avance en continu — le débit
//  d'émission est donc géré côté appelant (js/game.js), PAS ici : ce
//  module se contente de valider la forme d'un état reçu/envoyé.
// ------------------------------------------------------------
const MAX_FURNACE_SECONDS = 100000; // large marge au-dessus des recettes réelles (quelques secondes)

// Valide/nettoie un état de four reçu du réseau (ou construit
// localement avant émission). Toujours un objet complet (jamais
// partiel) — un four vide/neuf a des cases nulles et des compteurs à 0.
export function sanitizeFurnaceState(src) {
  const out = { input: null, fuel: null, output: null, progress: 0, fuelTime: 0, maxFuelTime: 0 };
  if (!src || typeof src !== 'object') return out;
  out.input = sanitizeStack(src.input);
  out.fuel = sanitizeStack(src.fuel);
  out.output = sanitizeStack(src.output);
  for (const key of ['progress', 'fuelTime', 'maxFuelTime']) {
    const n = Number(src[key]);
    if (Number.isFinite(n)) out[key] = Math.max(0, Math.min(MAX_FURNACE_SECONDS, n));
  }
  return out;
}

// ------------------------------------------------------------
//  Étape 5 : animaux partagés (moutons, vaches)
//
//  Contrairement aux coffres/fours (un seul propriétaire logique par
//  objet), un troupeau est visible et attaquable par TOUS les joueurs
//  d'une zone en même temps : chaque client continue de simuler
//  localement l'errance de CHAQUE animal (comme en solo, c'est cheap
//  et ça reste fluide), mais on partage trois choses pour que le
//  troupeau reste cohérent d'un joueur à l'autre :
//   - le troupeau lui-même (mêmes bêtes, même endroit de départ, et
//     les réapparitions) : messages 'mobSync' (resynchronisation) et
//     'mobSpawn' (une ou plusieurs bêtes neuves) ;
//   - un correctif de position à basse fréquence, envoyé par UN SEUL
//     client élu « coordinateur » (voir js/net.js isMobCoordinator),
//     pour que deux simulations indépendantes ne dérivent jamais trop
//     l'une de l'autre : message 'mobState' ;
//   - les coups portés (dégâts, mort) : n'importe quel joueur peut
//     taper n'importe quel animal, « dernier coup gagne » — message
//     'mobHit'.
//
//  Ce module reste ignorant de js/mobs/*.js (pas d'énumération des
//  espèces valides) : comme pour un id de coffre, on se contente de
//  borner la taille de ce qu'un client peut faire mémoriser au
//  serveur.
// ------------------------------------------------------------
export const MAX_MOB_ID = 4095; // large marge (un troupeau ne dépasse jamais quelques centaines d'ids, même après beaucoup de réapparitions)
export const MAX_MOBS_PER_MESSAGE = 64; // large marge au-dessus d'un troupeau réel (~17 par défaut)
const MAX_MOB_KIND_LEN = 16;
const MAX_MOB_COORD = MAX_WORLD_TILE * 64; // borne large en pixels (tuile × marge)
const MAX_MOB_HP = 1000;

function sanitizeMobKind(v) {
  return (typeof v === 'string' && v.length > 0 && v.length <= MAX_MOB_KIND_LEN) ? v : null;
}

function sanitizeMobId(v) {
  const n = Math.trunc(v);
  return Number.isFinite(n) && n >= 0 && n <= MAX_MOB_ID ? n : null;
}

function sanitizeMobCoord(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(MAX_MOB_COORD, n)) : 0;
}

function sanitizeMobHp(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(MAX_MOB_HP, n)) : 0;
}

// Un animal complet : troupeau initial, réapparition, ou une entrée
// d'un 'mobSync' de resynchronisation.
export function sanitizeMobInfo(src) {
  if (!src || typeof src !== 'object') return null;
  const id = sanitizeMobId(src.id);
  const kind = sanitizeMobKind(src.kind);
  if (id === null || kind === null) return null;
  return {
    id,
    kind,
    x: sanitizeMobCoord(src.x),
    y: sanitizeMobCoord(src.y),
    hp: sanitizeMobHp(src.hp),
    alive: src.alive !== false,
  };
}

export function sanitizeMobList(src) {
  const out = [];
  if (!Array.isArray(src)) return out;
  for (let i = 0; i < src.length && out.length < MAX_MOBS_PER_MESSAGE; i++) {
    const info = sanitizeMobInfo(src[i]);
    if (info) out.push(info);
  }
  return out;
}

// Un correctif de position (mobState) est plus léger qu'un animal
// complet : juste de quoi recaler doucement une simulation qui aurait
// dérivé, jamais de quoi créer ou ressusciter un animal.
export function sanitizeMobStateEntry(src) {
  if (!src || typeof src !== 'object') return null;
  const id = sanitizeMobId(src.id);
  if (id === null) return null;
  return { id, x: sanitizeMobCoord(src.x), y: sanitizeMobCoord(src.y) };
}

export function sanitizeMobStateList(src) {
  const out = [];
  if (!Array.isArray(src)) return out;
  for (let i = 0; i < src.length && out.length < MAX_MOBS_PER_MESSAGE; i++) {
    const e = sanitizeMobStateEntry(src[i]);
    if (e) out.push(e);
  }
  return out;
}

// Un coup porté à un animal (hp après le coup + mort éventuelle) —
// jamais de quoi créer un animal inconnu du serveur (voir net-server.js
// recordMobHit : un coup sur un id absent du journal est ignoré).
export function sanitizeMobHit(src) {
  if (!src || typeof src !== 'object') return null;
  const id = sanitizeMobId(src.id);
  if (id === null) return null;
  return { id, hp: sanitizeMobHp(src.hp), alive: src.alive !== false };
}

