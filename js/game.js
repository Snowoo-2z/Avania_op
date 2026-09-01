// ============================================================
//  AVANIA — Boucle de jeu, rendu et interactions avec les blocs
// ============================================================

import {
  TILE, WORLD_W, WORLD_H, REACH, PERFORMANCE, PLAYER_RENDER_SCALE, BLOCK_EXTRUDE,
} from './config.js';
import {
  BLOCK_DEFS, ITEM_DEFS, TOOL_TIERS, toolTierIndex, blockMinTierIndex, toolDamage,
  CROPS, CROP_MATURE, CROP_GROW_SECONDS, SELLER_TIERS,
} from './blocks.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Camera } from './camera.js';
import { Input } from './input.js';
import { Inventory } from './inventory.js';
import {
  buildTileset, getTileCanvas, getDoorCanvas, getFurnaceCanvas, getWaterFrame,
  getChestFrame, CHEST_TOP_PAD,
  drawTreeObject, drawRockObject, drawIronOreObject, drawCaveObject,
  getObjectSprite, getObjectSpriteInfo, treeVariantAt, treeDropCount,
  treeBreakTime, TREE_VARIANTS, WATER_FRAMES, isExtrudedBlock, drawBlockConnected,
  drawDoorLintel,
} from './tileset.js';
import { drawCharacter } from './character.js';
import { drawNpc } from './npc/index.js';
import { getItemSprite } from './icons.js';
import { drawHeldItem, heldItemIsBehind } from './held.js';
import { isLowPowerDevice, makeCanvas, lerp } from './utils.js';
import { updateFurnace, makeFurnaceEntry } from './furnace.js';
import {
  MOB_DEFS, Mob, spawnMobs, updateMob, drawMob, mobDrops,
  DEFAULT_MOB_COUNTS, findMobSpawnSpot, makeMobFromNetwork,
} from './mobs/index.js';
import { CAVE, canDescendTo } from './cave.js';
import { PORT_SIGNS } from './harbor.js';
import { FORTUNE_SIGNS, spawnCityCars } from './city.js';
import { drawCar } from './cars.js';
import { islandDef, HOME_ISLAND } from './islands.js';
import { Crossing } from './crossing.js';
// Chat de proximité (étape 6) : le nettoyage du texte d'une bulle utilise
// le même garde-fou que le réseau, pour qu'un message affiché au-dessus
// d'un joueur ne puisse jamais contenir de caractère de contrôle.
import { sanitizeChatText,
  MAX_DROPS_PER_MESSAGE,
} from './net-protocol.js';

// Durée d'affichage d'une bulle de talkie-walkie, en secondes de jeu.
const BUBBLE_SECONDS = 6;

// Multijoueur (étape 4, fours) : débit d'émission réseau de la
// progression d'un four possédé localement — voir Game.updateFurnaces
// / _maybeAnnounceFurnace. « Live » tant que quelqu'un a le panneau
// ouvert ICI (l'utilisateur veut voir l'animation bouger en face) ;
// beaucoup plus espacé sinon (le four continue de cuire même fermé,
// mais ça n'intéresse qu'un battement occasionnel pour resynchroniser
// un observateur distant, pas un flot par frame).
const FURNACE_NET_LIVE_S = 0.5;
const FURNACE_NET_IDLE_S = 2.5;

// Multijoueur (étape 5, animaux) : contrairement aux fours, chaque
// client continue de simuler localement l'errance de CHAQUE animal du
// troupeau (fluide, pas cher, et ça permet à un animal de fuir « son »
// joueur même si un autre est en train de le regarder). Trois réglages
// suffisent à garder le troupeau cohérent d'un joueur à l'autre malgré
// ça — voir Game._maybeManageMobsNetwork / updateMobs :
//  - MOB_NET_STATE_S : le « coordinateur » de la zone (voir
//    js/net.js isMobCoordinator, un seul joueur à la fois) diffuse un
//    correctif de position de tout le troupeau à cette fréquence ;
//  - MOB_NET_BLEND_RATE : vitesse à laquelle CHAQUE client recale en
//    douceur sa simulation locale vers le dernier correctif reçu (un
//    léger « aimant » permanent, jamais un saut brutal) ;
//  - MOB_RESPAWN_CHECK_S : à quelle fréquence le coordinateur vérifie
//    si le troupeau s'est dépeuplé (animaux tués) et doit se
//    repeupler — la repop est alors diffusée à tout le monde.
const MOB_NET_STATE_S = 1.5;
const MOB_NET_BLEND_RATE = 1.2;
const MOB_RESPAWN_CHECK_S = 5;

// Forme réseau d'un animal (voir js/net-protocol.js sanitizeMobInfo) :
// utilisée aussi bien pour établir un troupeau initial que pour une
// repop — factorisé pour ne jamais désynchroniser les deux formats.
function mobToNetInfo(mob) {
  return {
    id: mob.id, kind: mob.kind, x: mob.x, y: mob.y, hp: mob.hp, alive: mob.alive,
  };
}

const REACH_SQ = REACH * REACH;
// --- Faim (jauge au-dessus de la barre rapide, à côté de la vie) ---
// Le ventre se vide avec l'activité : ~10 min de marche continue, plus
// vite en minant, presque rien au repos. Trop vide (HUNGER_REGEN_MIN),
// la régénération des PV s'arrête ; à zéro, la famine ronge les PV
// lentement — sans jamais tuer (plancher, voir HUNGER_STARVE_FLOOR).
const HUNGER_DRAIN_IDLE = 0.012;   // par seconde au repos (~28 min de ventre plein à vide)
const HUNGER_DRAIN_MOVE = 0.033;   // par seconde en marchant (~10 min)
const HUNGER_DRAIN_MINE = 0.07;    // supplément pendant un minage en cours
const HUNGER_REGEN_MIN = 13;       // en dessous (65 %), plus de régénération des PV
const HUNGER_STARVE_EVERY = 3;     // ventre vide : 1 PV perdus toutes les 3 s
const HUNGER_STARVE_FLOOR = 1;     // …mais on ne meurt pas de faim
const SORT_BY_Y = (a, b) => {
  const diff = a.sortY - b.sortY;
  if (diff !== 0) return diff;
  // Si le Y est identique (empilement), on dessine la couche basse (1) avant la couche haute (2)
  const layerA = a.layer || 1;
  const layerB = b.layer || 1;
  return layerA - layerB;
};
const MINING_CRACK_STAGES = 9;
// Codes de rendu pour le tri de profondeur (entiers : pas de comparaison
// de chaînes ni d'objets d'enrobage alloués dans la boucle chaude).
const DRAW_OBJECT = 0; // ressource statique (arbre, rocher, minerai)
const DRAW_DROP = 1;   // objet lâché au sol
const DRAW_MOB = 2;    // animal
const DRAW_PLAYER = 3; // joueur
const DRAW_PLACED_BLOCK = 4; // bloc posé (mur, porte, four)
const DRAW_NPC = 5;    // personnage non-joueur (représentant, marchands)
const DRAW_CAR = 6;    // voiture
// Vitesse du balancement de l'outil pendant le minage (rad/s) : un va-et-
// vient complet ≈ 0,66 s, comme le geste de la main dans Minecraft.
const SWING_SPEED = 9.5;
// Durée de vie d'un objet au sol (5 min, comme Minecraft).
const DROP_LIFETIME = 300;
const MAX_DROPS = 240;
// Délai avant de pouvoir ramasser un objet qu'on vient de lâcher (secondes).
// Empêche le ramassage instantané quand Q sert aussi à se déplacer (AZERTY).
const PICKUP_DELAY = 0.6;
// Les objets au sol sont PARTAGÉS en multijoueur : chaque drop reçoit un
// netId unique, annoncé à la zone (pose) et au ramassage (retrait). C'est
// ce qui permet le butin de PvP : l'inventaire du vaincu tombe au sol et
// n'importe qui peut le ramasser. Maximum par message : voir
// sanitizeDropList (js/net-protocol.js).
const DROPS_FLUSH_EVERY = 0.25; // secondes entre deux annonces groupées
// Distance (au carré) à laquelle on peut interpeller un PNJ avec la
// touche d'interaction. Un peu plus large que le minage : parler à
// quelqu'un ne demande pas la même précision que casser un bloc.
const INTERACT_NPC_SQ = 54 * 54;

// Couleurs des particules de casse, par ressource. Des carrés pixelisés
// de la même palette que la ressource, pour un débris cohérent.
const BREAK_PARTICLE_COLORS = {
  tree: ['#4f9337', '#63a845', '#8a5a34', '#6e4426'],
  rock: ['#8d8d94', '#a5a5ac', '#7a7a82', '#96969c'],
  wood: ['#b07a3c', '#c89a5e', '#8a5a2e'],
  stone: ['#9a9aa3', '#8d8d94', '#6a6a72'],
  plank: ['#c89a5e', '#b07a3c', '#8a5a2e'],
  brick: ['#b4553f', '#c96a55', '#8a3f2f'],
  glass: ['#bfe3ea', '#9fd0d8', '#d8f0f4'],
  sand: ['#e2c88a', '#c0a25e', '#f4e6b8'],
  sandBlock: ['#e2c88a', '#c0a25e', '#f4e6b8'],
  dirt: ['#8a6a46', '#6a4f30', '#a8875c'],
  dirtBlock: ['#8a6a46', '#6a4f30', '#a8875c'],
  ironOre: ['#8d8d94', '#b8865b', '#d8a06e', '#a5a5ac'],
  ironBlock: ['#d8dde2', '#aab3bb', '#f4f7fa', '#7a838c'],
  door: ['#c89a5e', '#b07a3c', '#8a5a2e'],
};
const MAX_PARTICLES = 240; // plafond anti-abus (spam de casses)

// Fissures pixelisées pré-rendues une seule fois. En plus d'être plus
// propres que des traits recalculés chaque frame, ces sprites allègent
// le rendu pendant que le joueur maintient le bouton de minage.
// Les coordonnées sont définies dans une grille 32×32 puis mises à
// l'échelle : on peut ainsi couvrir TOUT le corps d'un arbre ou d'un
// rocher (pas seulement le bas de sa tuile).
//
// Le motif imite la texture de casse de Minecraft : de fines fissures
// apparaissent au centre puis se ramifient, et le bloc s'assombrit de
// plus en plus jusqu'à la casse.
const CRACK_SEGMENTS = [
  // Stage 0 : une fissure naissante au centre
  { stage: 0, points: [[16, 16], [13, 12]] },
  // Stage 1 : elle s'allonge vers le haut
  { stage: 1, points: [[13, 12], [11, 8], [8, 5]] },
  // Stage 2 : une branche part vers la droite
  { stage: 2, points: [[16, 16], [20, 19], [24, 21]] },
  // Stage 3 : la branche droite monte et une fissure descend à gauche
  { stage: 3, points: [[24, 21], [27, 18], [30, 17]] },
  { stage: 3, points: [[16, 16], [14, 21], [11, 26]] },
  // Stage 4 : descente complète + branche gauche
  { stage: 4, points: [[11, 26], [9, 30], [7, 33]] },
  { stage: 4, points: [[16, 16], [19, 12], [22, 9]] },
  // Stage 5 : réseau dense sur le haut
  { stage: 5, points: [[22, 9], [26, 7], [29, 4]] },
  { stage: 5, points: [[8, 5], [4, 4]] },
  // Stage 6 : fissures basses + traverses
  { stage: 6, points: [[20, 19], [18, 24], [19, 29]] },
  { stage: 6, points: [[7, 33], [3, 31]] },
  // Stage 7 : ramification générale
  { stage: 7, points: [[13, 12], [9, 10], [5, 9]] },
  { stage: 7, points: [[14, 21], [19, 22], [23, 24]] },
  // Stage 8 : le bloc est prêt à céder — fissures partout
  { stage: 8, points: [[30, 17], [31, 21]] },
  { stage: 8, points: [[24, 21], [23, 26]] },
  { stage: 8, points: [[11, 8], [6, 11]] },
];

function hash32(n) {
  n |= 0;
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  return (n ^ (n >>> 16)) >>> 0;
}

function buildMiningCrackSprites(w = TILE, h = TILE, mask = null) {
  const sx = w / 32;
  const sy = h / 32;
  return Array.from({ length: MINING_CRACK_STAGES }, (_, stage) => {
    const canvas = makeCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    // Voile d'assombrissement : léger au début, presque noir à la fin.
    const veil = 0.06 + (stage / (MINING_CRACK_STAGES - 1)) * 0.34;
    ctx.fillStyle = `rgba(8,9,10,${veil})`;
    ctx.fillRect(0, 0, w, h);

    const lineW = Math.max(1.2, Math.min(2.6, (1.2 + stage * 0.1) * Math.max(sx, sy)));
    ctx.strokeStyle = `rgba(5,6,7,${0.5 + stage * 0.055})`;
    ctx.lineWidth = lineW;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const segment of CRACK_SEGMENTS) {
      if (segment.stage > stage) continue;
      ctx.beginPath();
      segment.points.forEach(([x, y], index) => {
        const px = x * sx;
        const py = y * sy;
        if (index === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    }

    // Petites branches décoratives déterministes pour que le motif ne soit
    // pas trop régulier sur les grands sprites (arbres, rochers).
    const extra = Math.max(0, stage - 3);
    for (let i = 0; i < extra; i++) {
      const seed = hash32(w * 131 + h * 17 + stage * 97 + i * 13);
      const x0 = ((seed & 255) / 255) * w;
      const y0 = (((seed >>> 8) & 255) / 255) * h;
      const ang = ((seed >>> 16) & 255) / 255 * Math.PI * 2;
      const len = (0.12 + ((seed >>> 24) & 255) / 255 * 0.2) * Math.max(w, h);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len);
      ctx.stroke();
    }

    if (mask) {
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(mask, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
    }
    return canvas;
  });
}

function buildDamageOverlay(mask) {
  if (!mask) return null;
  const c = makeCanvas(mask.width, mask.height);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#120e0c';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(mask, 0, 0);
  return c;
}

function isStoneLike(blockId) {
  return blockId === 'rock' || blockId === 'stone' || blockId === 'ironOre';
}

export class Game {
  constructor(canvas, appearance, settings = null) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    this.ctx.imageSmoothingEnabled = false;
    this.world = new World();
    // L'île reste référencée même quand on est sous terre : c'est là
    // qu'on remonte. Les niveaux de la grotte sont générés à la demande
    // puis conservés (la grotte ne change pas entre deux descentes).
    this.surfaceWorld = this.world;
    this.caveLevels = new Map();
    // Les autres îles (rejointes par le passeur) : générées à la
    // demande puis conservées, comme les niveaux de la grotte — ce
    // qu'on y construit survit aux allers-retours.
    this.islands = new Map();
    // La cinématique de traversée (voir js/crossing.js). Inerte hors
    // des traversées : elle ne coûte rien le reste du temps.
    this.crossing = new Crossing();
    // Voitures : une liste par île (seule Fortune City en a pour
    // l'instant), et celle que le joueur conduit, s'il conduit.
    this.cars = new Map();
    this.driving = null;
    this.player = new Player(this.world.spawn.x, this.world.spawn.y, appearance);
    this.input = new Input();
    this.inventory = new Inventory();
    this.settings = settings; // paramètres utilisateur (zoom, vignette, particules…)

    this.viewW = window.innerWidth;
    this.viewH = window.innerHeight;
    this.camera = new Camera(this.viewW, this.viewH, WORLD_W * TILE, WORLD_H * TILE);
    this.camera.snapTo(this.player.x, this.player.y);
    if (settings && settings.zoom) this.camera.zoom = settings.zoom;

    this.player.dy = DRAW_PLAYER; // tag de rendu (tri sans allocation)
    this.otherPlayers = []; // futurs joueurs en ligne
    // Objets posés au sol (ramassables en marchant dessus).
    this.droppedItems = [];
    // Agriculture : âge (en secondes) de chaque pousse de blé, par tuile.
    this.cropAge = new Map();
    // Bonus temporaire après avoir mangé (secondes restantes).
    this.wellFedT = 0;
    // Décalage de caméra (parallaxe) : la caméra « anticipe » légèrement la
    // direction de déplacement pour dégager le champ de vision.
    this.camLeadX = 0;
    this.camLeadY = 0;
    // Cycle jour/nuit (en secondes de jeu pour un tour complet) + canvas
    // hors-écran qui reçoit le voile nocturne percé de lueurs.
    this.dayLength = 240;
    this.nightCanvas = null;
    this.pickupFullCooldown = 0;
    // Animaux (moutons, vaches) qui se baladent dans le monde.
    this.mobs = spawnMobs(this.world);
    for (const mob of this.mobs) mob.dy = DRAW_MOB;
    this.mobAttackCooldown = 0;
    // Multijoueur (étape 5) : prochain id réseau libre pour un animal
    // (repop) — voir _allocMobId/_noteMobId. spawnMobs a déjà consommé
    // les ids 0..N-1 de façon contiguë.
    this._nextMobId = this.mobs.length;
    this._mobStateTimer = 0;
    this._mobRespawnTimer = 0;
    // Fours posés : contenu + progression (clé numérique = index de tuile,
    // finies les chaînes "tx,ty" allouées dans la boucle de rendu).
    this.furnaceData = new Map();
    // Coffres posés : 27 cases de rangement (clé = index de tuile).
    this.chestData = new Map();
    // Panneaux posés : { text, owner } (clé = index de tuile). Seul le
    // joueur dont l'id === owner peut écrire dessus.
    this.signData = new Map();
    // Les panneaux du port font partie du décor : on les sème une fois,
    // sans jamais écraser ce qu'un joueur aurait pu y écrire ensuite.
    this.seedPortSigns();
    // Étals de vente posés : { tier, owner, item, stock, price, till }.
    this.sellerData = new Map();
    // Verrous de vol locaux (clé -> this.time d'expiration) : après un vol
    // raté, on attend avant de retenter (voir SELLER_TIERS).
    this.stealLocks = new Map();
    this.pvpCooldown = 0;
    // Swing de l'arme quand on frappe un joueur (le minage a le sien ;
    // frapper quelqu'un n'affichait AUCUNE animation avant).
    this.pvpSwingT = 0;
    // Drops à annoncer au réseau, groupés (un message pour plusieurs).
    this._pendingDropAnnounce = [];
    this._dropFlushT = 0;
    this._dropSeq = 0;
    // Rappels branchés par l'UI (ex. ouvrir le panneau du four / du coffre).
    this.uiCallbacks = {
      openFurnace: null,
      openChest: null,
      openSign: null,
      onMoney: null,
      onEnterCave: null,
      onExitCave: null,
      onDescend: null,
      onTalk: null,
      onInteractBlocked: null,
      onZoneChange: null,   // branché par le client multijoueur (js/net.js)
      onBlockChange: null,  // idem : (tx, ty, diff) — LE JOUEUR LOCAL a modifié un bloc
      onChestChange: null,  // idem : (tx, ty, slots[27]) — LE JOUEUR LOCAL a modifié un coffre ouvert
      onFurnaceChange: null, // idem : (tx, ty, state) — LE JOUEUR LOCAL a modifié un four ouvert
      // Multijoueur (étape 5, animaux) : voir js/main.js pour le
      // câblage exact et js/net.js pour la forme de chaque message.
      onMobEstablish: null, // (mobs[]) — AUCUN troupeau connu du serveur pour cette zone : on propose le nôtre
      onMobRespawn: null,   // (mobs[]) — le coordinateur propose une repop
      onMobState: null,     // (mobs[{id,x,y}]) — le coordinateur diffuse un correctif de position
      onMobHit: null,       // (id, hp, alive) — LE JOUEUR LOCAL vient de frapper un animal
      isMobCoordinator: null, // () => bool — suis-je le coordinateur de cette zone ? (voir js/net.js)
    };
    // PNJ (représentant de l'île, marchands de la grotte).
    this.npcs = [];
    // PNJ le plus proche avec qui interagir (touche F) : { npc | tile, label }
    this.interactTarget = null;
    // Une cinématique bloque les entrées (arrivée du représentant).
    this.cutscene = false;
    // État conservé par dimension (fours, coffres, objets au sol, mobs) :
    // descendre dans la grotte ne doit rien faire perdre de ce qui se
    // trouve à la surface, et inversement.
    this.dimStates = new Map();
    // Équipement porté (masque + protection de minage).
    this.gear = { mask: null, armor: null, maxDepth: 1 };
    // Le meilleur équipement possédé est équipé automatiquement dès qu'un
    // objet entre ou sort de l'inventaire : acheter un masque suffit.
    this.inventory.subscribe(() => this.refreshGear());
    this.refreshGear();
    // Particules de casse (débris légers, courte durée de vie).
    this.particles = [];
    this.lastTime = performance.now();
    this.time = 0;
    this.tileset = buildTileset();
    this.miningCrackSprites = buildMiningCrackSprites(TILE, TILE);
    // Fissures à la taille exacte des arbres / rochers (couvrent tout le corps).
    this.objectCrackSprites = {};
    const registerObjectCracks = (key, kind, variant) => {
      const sprite = getObjectSprite(kind, variant);
      const info = getObjectSpriteInfo(kind, variant);
      if (!sprite || !info) return;
      this.objectCrackSprites[key] = {
        sprites: buildMiningCrackSprites(info.w, info.h, sprite.mask || sprite.canvas),
        overlay: buildDamageOverlay(sprite.mask || sprite.canvas),
        anchorX: info.anchorX,
        anchorY: info.anchorY,
      };
    };
    for (const variant of TREE_VARIANTS) registerObjectCracks(`tree:${variant}`, 'tree', variant);
    registerObjectCracks('rock', 'rock');
    registerObjectCracks('ironOre', 'ironOre');
    // Ressources de la grotte : mêmes sprites de fissures, à leur taille.
    registerObjectCracks('caveStone', 'caveStone');
    registerObjectCracks('caveIron', 'caveIron');
    // Rendu optimisé : le sol est rendu par chunks statiques au lieu
    // d'être redessiné tuile par tuile à chaque frame. Les objets
    // statiques (arbres, rochers) et les tuiles d'eau sont indexés par
    // chunk spatial : la boucle de rendu ne parcourt que la zone
    // visible au lieu de scanner tout le monde à chaque frame.
    // (Initialisé AVANT rebuildStaticObjects, qui s'appuie dessus.)
    this.chunkTiles = PERFORMANCE.CHUNK_TILES;
    this.floorChunkCache = new Map();
    this.staticObjects = [];
    this.staticObjectMap = new Map();
    this.staticObjectsByChunk = new Map();
    this.waterTilesByChunk = new Map();
    // Blocs POSÉS par le joueur (murs, portes, fours, coffres), indexés par
    // chunk exactement comme les ressources naturelles. Avant, le rendu
    // rescannait toute la fenêtre de tuiles (~640 cases) à chaque frame pour
    // les retrouver ; dans un village construit ça devenait le poste le plus
    // cher du rendu. L'index est reconstruit chunk par chunk à chaque pose /
    // casse (action joueur, jamais par frame).
    this.placedByChunk = new Map();
    this.rebuildStaticObjects();
    // Pré-construit les chunks de sol de la zone de départ (vue + marge)
    // AVANT la première frame : rien à rasteriser à la volée au démarrage.
    this.prewarmFloorChunks(Infinity);
    this.drawables = [];
    // Réserve d'enveloppes réutilisables pour les blocs posés : le tri de
    // profondeur a besoin d'objets {sortY, dy…}, mais en allouer ~200 par
    // frame dans un village construit saturait le ramasse-miettes. On les
    // réutilise d'une frame à l'autre (zéro allocation dans la boucle chaude).
    this.blockDrawables = [];
    this.blockDrawableCount = 0;
    this.nameTagCache = new Map();
    // Bulles du talkie-walkie (chat de proximité) : même principe que les
    // étiquettes de nom — texte pré-rendu en haute résolution, blitté à
    // sa taille logique. Clé = texte + zoom, donc un même message répété
    // ne coûte rien.
    this.bubbleCache = new Map();
    // Sprites pré-rendus : surbrillance de la cible et ombres ovales
    // des objets au sol (clés numériques, aucune allocation par frame).
    this.highlightCache = new Map();
    this.shadowCache = new Map();
    // Grille spatiale réutilisée pour la fusion des piles au sol.
    this.mergeGrid = new Map();
    this.vignetteCanvas = null;
    this.vignetteW = 0;
    this.vignetteH = 0;
    // Fenêtre de chunks préchauffée au passage précédent (voir
    // prewarmFloorChunks : évite de revérifier le cache à chaque frame
    // quand la caméra ne bouge pas).
    this._prewarmRectKey = undefined;

    // Mode performance activé d'office sur les petites configs, puis
    // automatiquement si le coût moyen de rendu devient trop haut.
    this.performanceMode = isLowPowerDevice();
    this.frameCostAvg = 0;
    this.frameSamples = 0;
    if (this.performanceMode && typeof document !== 'undefined') {
      document.documentElement.classList.add('low-power');
    }

    // cible visée par la souris
    this.targetTx = -1;
    this.targetTy = -1;
    this.inReach = false;
    this.actionCooldown = 0;
    this.paused = false;
    this.toastTimer = 0;
    // Progression de minage : le bloc ne disparaît qu'après un maintien
    // du clic gauche. Le bon outil réduit la durée nécessaire.
    this.mining = { tx: -1, ty: -1, progress: 0, duration: 0 };
    // Balancement de l'outil pendant le minage : une phase continue qui
    // démarre au repos (0) et revient doucement au repos quand on arrête.
    this.swingPhase = 0;
    // Petit « pop » quand on change d'objet en main (touches 1–9).
    this.equipPop = 0;
    this.lastHeldId = null;
    this.lastHeldSlot = -1;

    // Vecteur nul réutilisé pendant les cinématiques (zéro allocation).
    this._zeroDir = { x: 0, y: 0 };
    this.running = false;
    this.onFrame = this.onFrame.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    requestAnimationFrame(this.onFrame);
  }

  stop() {
    this.running = false;
  }

  setPaused(value) {
    this.paused = Boolean(value);
    if (this.paused) {
      this.input.mouse.leftClicked = false;
      this.input.mouse.rightClicked = false;
      this.input.mouse.leftDown = false;
      this.input.mouse.rightDown = false;
      this.resetMining();
    }
  }

  resetMining() {
    this.mining.tx = -1;
    this.mining.ty = -1;
    this.mining.progress = 0;
    this.mining.duration = 0;
  }

  notify(message) {
    if (typeof document === 'undefined') return;
    const toast = document.getElementById('game-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => toast.classList.remove('visible'), 2200);
  }

  onFrame(now) {
    if (!this.running) return;

    // Ne consomme pas inutilement le CPU/GPU lorsque l'onglet est caché.
    if (typeof document !== 'undefined' && document.hidden) {
      this.lastTime = now;
      requestAnimationFrame(this.onFrame);
      return;
    }

    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;

    const renderStart = performance.now();
    // Le couvercle du coffre s'anime même quand le jeu est en pause
    // (panneau ouvert), sinon l'ouverture ne se verrait qu'après.
    this.updateChests(dt);
    this.update(dt);
    this.render();
    this.trackPerformance(performance.now() - renderStart);
    // Crochet d'interface, appelé après le rendu de la frame :
    //  - la cinématique d'arrivée y est pilotée (elle a besoin de dt) ;
    //  - l'invite d'interaction y suit la cible, donc après le rendu.
    if (this.uiCallbacks.onFrameEnd) this.uiCallbacks.onFrameEnd(dt);

    requestAnimationFrame(this.onFrame);
  }

  trackPerformance(frameCostMs) {
    if (this.performanceMode) return;
    this.frameSamples++;
    this.frameCostAvg = this.frameCostAvg === 0
      ? frameCostMs
      : this.frameCostAvg * 0.96 + frameCostMs * 0.04;

    if (
      this.frameSamples > PERFORMANCE.ADAPTIVE_SAMPLE_FRAMES
      && this.frameCostAvg > PERFORMANCE.ADAPTIVE_FRAME_COST_MS
    ) {
      this.performanceMode = true;
      if (typeof document !== 'undefined') document.documentElement.classList.add('low-power');
      // window.Event, PAS le global `Event` : dans certains environnements
      // (le test d'intégration navigateur, qui fait cohabiter le jsdom
      // WebSocket avec le WebSocket natif de Node) les deux implémentations
      // d'Event viennent de « realms » différents et ne sont pas
      // interchangeables — dispatchEvent exige celle du même realm que
      // `window`.
      if (typeof window !== 'undefined') window.dispatchEvent(new window.Event('resize'));
      console.info('AVANIA: mode performance activé automatiquement.');
    }
  }

  // Niveau graphiques effectif : le choix de l'utilisateur, mais le mode
  // performance (machine modeste / adaptive) force toujours « low ».
  //  low    : ni ombres portées, ni lueurs, ni vignette (voile de nuit plat) ;
  //  medium : ombres + nuit percée de halos, mais sans lueurs additives ;
  //  high   : tout, y compris la lueur vacillante des feux et la vignette.
  _gfx() {
    if (this.performanceMode) return 'low';
    const g = this.settings ? this.settings.graphics : 'high';
    return g === 'low' || g === 'medium' ? g : 'high';
  }

  // Particules activées ? (réglage utilisateur ; le mode performance réduit
  // déjà leur nombre, et le niveau « low » les coupe entièrement.)
  _particlesEnabled() {
    if (this._gfx() === 'low') return false;
    return this.settings ? this.settings.particles !== false : true;
  }

  // Vignette activée ? (réglage utilisateur ; le mode performance et le
  // niveau « low » la coupent.)
  _vignetteOn() {
    if (this._gfx() === 'low') return false;
    return this.settings ? this.settings.vignette !== false : true;
  }

  // Aim assist activé ? (réglage utilisateur : agrandit la zone de toucher
  // des animaux pour qu'ils soient plus faciles à cibler au clic.)
  _aimAssist() {
    return this.settings ? this.settings.aimAssist !== false : true;
  }

  resizeView() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w === this.viewW && h === this.viewH) return;
    this.viewW = this.camera.viewW = w;
    this.viewH = this.camera.viewH = h;
    this.vignetteCanvas = null;
  }

  update(dt) {
    this.time += dt;
    // Branché par le client multijoueur (js/net.js) : lisse les
    // positions distantes et envoie la position locale, AVANT le rendu
    // de la frame (sinon les joueurs distants auraient une frame de
    // retard visible).
    if (this.uiCallbacks.onNetUpdate) this.uiCallbacks.onNetUpdate(dt, this.player);
    this.actionCooldown = Math.max(0, this.actionCooldown - dt);
    this.pvpCooldown = Math.max(0, this.pvpCooldown - dt);
    this.pvpSwingT = Math.max(0, this.pvpSwingT - dt);
    // Faim : le ventre se vide (marcher et miner creusent davantage).
    const lp = this.player;
    const hungerDrain = (lp.moving ? HUNGER_DRAIN_MOVE : HUNGER_DRAIN_IDLE)
      + (this.mining.progress > 0 ? HUNGER_DRAIN_MINE : 0);
    lp.hunger = Math.max(0, lp.hunger - hungerDrain * dt);
    // Régén PvP : hors de tout coup récent ET assez nourri — à ventre
    // trop vide, le corps ne se répare plus.
    if (lp.hunger >= HUNGER_REGEN_MIN && lp.hp < lp.maxHp && this.time - lp.lastHurtAt > 6) {
      lp.hp = Math.min(lp.maxHp, lp.hp + dt * 1.2);
    }
    // Famine : ventre complètement vide, les PV fondent lentement —
    // jusqu'au plancher (on ne meurt pas de faim, on reste à 1 PV).
    if (lp.hunger <= 0 && lp.hp > HUNGER_STARVE_FLOOR) {
      lp.starveT += dt;
      if (lp.starveT >= HUNGER_STARVE_EVERY) {
        lp.starveT = 0;
        lp.hp = Math.max(HUNGER_STARVE_FLOOR, lp.hp - 1);
        lp.lastHurtAt = this.time;
        this.notify('Tu meurs de faim : trouve quelque chose à manger !');
        if (this.uiCallbacks.onPlayerHp) this.uiCallbacks.onPlayerHp(lp.hp);
      }
    } else if (lp.hunger > 0) {
      lp.starveT = 0;
    }
    // Les fours cuisent en continu, même panneau ouvert (la barre avance).
    this.updateFurnaces(dt);
    // Annonces groupées des drops (spawn) : un seul message pour toutes
    // les piles tombées depuis le dernier lot (butin de mort = d'un coup).
    this._dropFlushT = Math.max(0, this._dropFlushT - dt);
    if (this._dropFlushT <= 0 && this._pendingDropAnnounce.length
      && this.uiCallbacks.onDropsSend) {
      this._dropFlushT = DROPS_FLUSH_EVERY;
      while (this._pendingDropAnnounce.length) {
        const batch = this._pendingDropAnnounce.splice(0, MAX_DROPS_PER_MESSAGE);
        this.uiCallbacks.onDropsSend(batch);
      }
    }
    if (this.paused) { this.input.endFrame(); return; }

    // Traversée en cours : le joueur est SUR le bateau. Le monde, le
    // personnage et la faim n'avancent pas pendant la cinématique.
    if (this.crossing.running) {
      if (this.input.pressed('interact') || this.input.isDown('Escape')) this.crossing.skip();
      this.crossing.update(dt);
      this.input.endFrame();
      return;
    }

    // Le zoom est un réglage utilisateur (panneau Paramètres).
    // On lerp le zoom pour une transition douce au lieu d'un snap brutal.
    // Quand le zoom change, on invalide TOUS les chunks de sol : leur
    // contenu est le même, mais la caméra couvre une surface différente et
    // les chunks hors-cache provoquaient des trous visuels.
    if (this.settings && this.settings.zoom) {
      const targetZoom = this.settings.zoom;
      const prevZoom = this.camera.zoom;
      // Transition smooth : on interpole vers la cible.
      if (Math.abs(prevZoom - targetZoom) > 0.005) {
        const k = 1 - Math.pow(0.00001, dt);
        this.camera.zoom = prevZoom + (targetZoom - prevZoom) * k;
      } else {
        this.camera.zoom = targetZoom;
      }
      // Quand le zoom effectif change notablement, on invalide les caches
      // qui dépendent de la RÉSOLUTION ÉCRAN : surbrillance, étiquettes de
      // nom et vignette.
      //
      // Les chunks de sol, eux, sont rasterisés en PIXELS MONDE puis blittés
      // dans le repère zoomé : leur contenu ne dépend pas du zoom. Les vider
      // à chaque cran de zoom forçait la reconstruction synchrone de tous
      // les chunks visibles (256 drawImage chacun) — un à-coup visible à
      // chaque réglage. On garde le cache et on préchauffe simplement la
      // zone élargie par le dézoom.
      const roundedZoom = Math.round(this.camera.zoom * 4);
      if (this._lastRoundedZoom !== undefined && this._lastRoundedZoom !== roundedZoom) {
        this.highlightCache.clear();
        this.nameTagCache.clear();
        this.vignetteCanvas = null;
        // Un dézoom élargit la surface visible : on préchauffe les chunks
        // qui entrent dans la vue pour éviter tout trou / construction à
        // la volée pendant la transition.
        this.prewarmFloorChunks(8);
      }
      this._lastRoundedZoom = roundedZoom;
    }

    this.updateNpcs(dt);

    // Pendant une cinématique (l'arrivée du représentant), le joueur ne
    // contrôle plus rien : on ignore simplement ses entrées.
    const dir = this.cutscene ? this._zeroDir : this.input.getDirection();
    // Parallaxe : on lisse un léger décalage vers la direction de
    // déplacement, puis on suit ce point (pas exactement le joueur) pour
    // dégager la vue dans le sens du mouvement.
    const LEAD = 46;
    const lk = 1 - Math.pow(0.002, dt);
    if (this.driving) {
      // Au volant : c'est la voiture qui avance, le joueur suit dedans.
      this.updateDriving(dt);
      const lead = LEAD + Math.abs(this.driving.speed) * 0.22;
      this.camLeadX = lerp(this.camLeadX, Math.cos(this.driving.angle) * lead, lk);
      this.camLeadY = lerp(this.camLeadY, Math.sin(this.driving.angle) * lead, lk);
    } else {
      this.player.update(dir, dt, this.world, this.wellFedBoost());
      this.camLeadX = lerp(this.camLeadX, dir.x * LEAD, lk);
      this.camLeadY = lerp(this.camLeadY, dir.y * LEAD, lk);
    }
    this.camera.follow(this.player.x + this.camLeadX, this.player.y + this.camLeadY, dt);
    // Pré-construit par petits lots les chunks qui vont entrer dans la vue :
    // c'est le correctif des saccades au déplacement (plus de rasterisation
    // synchrone de chunk dans la boucle de rendu).
    this.prewarmFloorChunks(PERFORMANCE.CHUNK_PREWARM_BUDGET_MS);
    this.updateDroppedItems(dt);
    if (this.wellFedT > 0) this.wellFedT = Math.max(0, this.wellFedT - dt);
    this.updateCrops(dt);
    this.updateParticles(dt);
    this.updateHeldItem(dt);
    this.updateMobs(dt);

    this.updateTarget();
    this.updateInteractTarget();
    if (!this.cutscene) {
      this.handleHotbarKeys();
      this.handleDropKey();
      if (this.input.pressed('interact')) this.handleInteract();
      this.handleClicks(dt);
    } else {
      this.resetMining();
    }
    // Jette les edges non consommés (clic sans holder, molette inutilisée…).
    this.input.endFrame();
  }

  // ------------------------------------------------------------
  //  Fours : chaque four posé cuit indépendamment (en temps réel).
  //
  //  Multijoueur (étape 4) : un four n'est re-simulé ICI que si CE
  //  client en est le « propriétaire » (entry._owned — voir
  //  applyRemoteFurnaceChange et js/ui.js FurnacePanel). Un four connu
  //  seulement via le réseau (jamais ouvert localement) n'est PAS
  //  re-simulé : son état ne vient QUE des messages reçus, pour éviter
  //  que deux clients fassent chacun avancer indépendamment la même
  //  cuisson et divergent l'un de l'autre. En solo (jamais de réseau),
  //  ce flag est mis à `true` dès la première ouverture du panneau
  //  (voir getFurnaceEntry / FurnacePanel.open) et n'est ensuite plus
  //  jamais remis à `false` : la cuisson continue bien même panneau
  //  fermé, comme avant.
  // ------------------------------------------------------------
  updateFurnaces(dt) {
    if (this.furnaceData.size === 0) return;
    for (const [key, entry] of this.furnaceData) {
      if (!entry._owned) continue;
      updateFurnace(entry, dt);
      this._maybeAnnounceFurnace(key, entry, dt);
    }
  }

  // Débit d'émission réseau d'un four possédé localement : « live »
  // (toutes les FURNACE_NET_LIVE_S) tant que son panneau est ouvert ICI,
  // sinon seulement un battement toutes les FURNACE_NET_IDLE_S tant
  // qu'il brûle encore — et un message immédiat dès qu'un ingrédient/
  // combustible/résultat change ou que le feu s'éteint, pour ne jamais
  // faire attendre un observateur sur un évènement franc.
  _maybeAnnounceFurnace(key, entry, dt) {
    if (!this.uiCallbacks.onFurnaceChange) return;
    const burning = entry.fuelTime > 0;
    const sig = `${entry.input[0]?.id}:${entry.input[0]?.count}|`
      + `${entry.fuel[0]?.id}:${entry.fuel[0]?.count}|`
      + `${entry.output[0]?.id}:${entry.output[0]?.count}`;
    const structuralChange = sig !== entry._lastAnnouncedSig;
    const justStoppedBurning = entry._wasBurning && !burning;
    entry._netTimer = (entry._netTimer || 0) + dt;
    const interval = entry._localOpen ? FURNACE_NET_LIVE_S : FURNACE_NET_IDLE_S;
    const heartbeatDue = entry._netTimer >= interval && (entry._localOpen || burning);
    entry._wasBurning = burning;
    if (!structuralChange && !justStoppedBurning && !heartbeatDue) return;
    entry._lastAnnouncedSig = sig;
    entry._netTimer = 0;
    const tx = key % WORLD_W;
    const ty = Math.floor(key / WORLD_W);
    this._announceFurnaceChange(tx, ty, entry);
  }

  getFurnaceEntry(tx, ty) {
    const key = ty * WORLD_W + tx;
    let entry = this.furnaceData.get(key);
    if (!entry) {
      entry = makeFurnaceEntry();
      this.furnaceData.set(key, entry);
    }
    // Ouvrir le panneau (seul appelant de getFurnaceEntry, voir
    // js/ui.js) rend ce client propriétaire de la simulation de ce
    // four — voir le commentaire au-dessus de updateFurnaces.
    entry._owned = true;
    return entry;
  }

  // Crée/retrouve une entrée de coffre dans UN Map donné (factorisé pour
  // servir aussi bien à `getChestEntry` — le monde affiché — qu'à
  // l'application des mises à jour réseau reçues pour une zone qui
  // n'est pas forcément celle affichée à l'écran, voir chestDataMapForZone).
  _chestEntryIn(map, tx, ty) {
    const key = ty * WORLD_W + tx;
    let entry = map.get(key);
    if (!entry) {
      entry = { slots: new Array(27).fill(null), openT: 0, openTarget: 0 };
      map.set(key, entry);
    }
    return entry;
  }

  // Entrée de stockage d'un coffre posé (27 cases, comme Minecraft) +
  // état d'animation du couvercle (openT : 0 fermé → 1 ouvert).
  getChestEntry(tx, ty) {
    return this._chestEntryIn(this.chestData, tx, ty);
  }

  // Ouvre / ferme le couvercle du coffre posé (l'animation avance dans
  // updateChests, même pendant la pause du panneau).
  setChestOpen(tx, ty, open) {
    const entry = this.chestData.get(ty * WORLD_W + tx);
    if (entry) entry.openTarget = open ? 1 : 0;
  }

  // Avance l'animation du couvercle de chaque coffre ouvert.
  updateChests(dt) {
    for (const entry of this.chestData.values()) {
      const target = entry.openTarget ? 1 : 0;
      if (entry.openT === target) continue;
      const speed = dt / (target ? 0.24 : 0.2);
      entry.openT = target > entry.openT
        ? Math.min(target, entry.openT + speed)
        : Math.max(target, entry.openT - speed);
    }
  }

  // ------------------------------------------------------------
  //  Mobs (moutons, vaches) : errance + fuite quand on les frappe.
  //
  //  Multijoueur (étape 5) : CHAQUE client continue de simuler
  //  localement l'errance de CHAQUE animal (comme en solo — c'est ce
  //  qui garde le mouvement fluide et réactif, un mouton qui fuit LE
  //  joueur qui vient de le frapper). Trois mécanismes gardent le
  //  troupeau cohérent d'un joueur à l'autre sans jamais imposer un
  //  vrai propriétaire par animal :
  //   - _blendMobsTowardNetwork : un léger « aimant » permanent vers
  //     le dernier correctif de position connu (voir applyRemoteMobState)
  //     — jamais un saut brutal, juste une dérive qui ne s'accumule pas ;
  //   - _maybeManageMobsNetwork : SEUL le coordinateur (voir
  //     js/net.js isMobCoordinator) diffuse ce correctif, et gère la
  //     repop — sinon chaque joueur présent enverrait le même message,
  //     multipliant le trafic par le nombre de joueurs pour rien.
  updateMobs(dt) {
    this.mobAttackCooldown = Math.max(0, this.mobAttackCooldown - dt);
    for (const mob of this.mobs) {
      if (!mob.alive) continue;
      updateMob(mob, dt, this.world, this.player);
    }
    this._blendMobsTowardNetwork(dt);
    this._maybeManageMobsNetwork(dt);
  }

  // Recale en douceur chaque animal vers le dernier correctif de
  // position reçu du coordinateur (voir applyRemoteMobState) : sans ça,
  // deux simulations locales indépendantes (même seed d'errance
  // différente) dériveraient lentement l'une de l'autre au fil du
  // temps. `_netTargetX/Y` est effacé après usage par
  // applyRemoteMobState un court instant après réception — voir plus
  // bas, on ne fait ici QUE la mécanique du lissage.
  _blendMobsTowardNetwork(dt) {
    if (!this._mobsById) return;
    const k = 1 - Math.exp(-MOB_NET_BLEND_RATE * dt);
    for (const mob of this.mobs) {
      if (mob._netTargetX === undefined) continue;
      mob.x += (mob._netTargetX - mob.x) * k;
      mob.y += (mob._netTargetY - mob.y) * k;
    }
  }

  // Rôle du coordinateur de la zone actuelle (voir js/net.js
  // isMobCoordinator) : diffuser un correctif de position à basse
  // fréquence et gérer la repop. Ne fait rien si le réseau n'a jamais
  // pu se connecter (best effort, comme le reste du multijoueur).
  _maybeManageMobsNetwork(dt) {
    const cb = this.uiCallbacks;
    if (!cb.isMobCoordinator || !cb.isMobCoordinator()) return;

    this._mobStateTimer = (this._mobStateTimer || 0) + dt;
    if (this._mobStateTimer >= MOB_NET_STATE_S) {
      this._mobStateTimer = 0;
      if (cb.onMobState) {
        const entries = [];
        for (const mob of this.mobs) {
          if (!mob.alive) continue;
          entries.push({ id: mob.id, x: mob.x, y: mob.y });
        }
        if (entries.length > 0) cb.onMobState(entries);
      }
    }

    this._mobRespawnTimer = (this._mobRespawnTimer || 0) + dt;
    if (this._mobRespawnTimer >= MOB_RESPAWN_CHECK_S) {
      this._mobRespawnTimer = 0;
      this._maybeRespawnMobs();
    }
  }

  // Complète discrètement un troupeau dépeuplé (animaux tués) jusqu'à
  // DEFAULT_MOB_COUNTS, un animal à la fois par vérification (repop
  // progressive, jamais une vague soudaine) — et diffuse la nouvelle
  // bête aux autres joueurs de la zone (voir onMobRespawn). N'a d'effet
  // que sur la surface : comme spawnMobs, la grotte reste sans animaux.
  _maybeRespawnMobs() {
    if (this.world.kind === 'cave') return;
    const counts = { sheep: 0, cow: 0 };
    for (const mob of this.mobs) {
      if (mob.alive && Object.prototype.hasOwnProperty.call(counts, mob.kind)) counts[mob.kind] += 1;
    }
    for (const [kind, target] of Object.entries(DEFAULT_MOB_COUNTS)) {
      if (counts[kind] >= target) continue;
      const spot = findMobSpawnSpot(this.world, 60);
      if (!spot) continue;
      const mob = new Mob(kind, spot.x, spot.y, this._allocMobId());
      mob.dy = DRAW_MOB;
      this.mobs.push(mob);
      if (this._mobsById) this._mobsById.set(mob.id, mob);
      if (this.uiCallbacks.onMobRespawn) this.uiCallbacks.onMobRespawn([mobToNetInfo(mob)]);
      return; // un seul animal par vérification : repop progressive
    }
  }

  // id réseau libre pour un nouvel animal (repop) — voir le
  // commentaire sur this._nextMobId dans le constructeur.
  _allocMobId() {
    return this._nextMobId++;
  }

  // ------------------------------------------------------------
  //  Animaux partagés (multijoueur, étape 5)
  // ------------------------------------------------------------

  // Index par id réseau (construit paresseusement) : nécessaire pour
  // retrouver vite un animal précis quand un message réseau arrive
  // (mobState/mobHit), sans reparcourir tout le tableau `mobs` — celui-
  // ci reste la référence utilisée par le rendu et la boucle d'errance.
  _mobIndex() {
    if (!this._mobsById) {
      this._mobsById = new Map();
      for (const mob of this.mobs) this._mobsById.set(mob.id, mob);
    }
    return this._mobsById;
  }

  // Retrouve (sans le créer) le tableau `mobs` d'une zone réseau : celui
  // du monde actif (`this.mobs`), ou celui mis de côté pour un monde
  // déjà visité puis quitté (voir _saveDimState/_restoreDimState) —
  // même principe que chestDataMapForZone/furnaceDataMapForZone.
  mobsArrayForZone(zone) {
    if (this.world && zone === this.world.id) return this.mobs;
    const saved = this.dimStates.get(zone);
    return saved ? saved.mobs : null;
  }

  // Appelé par js/main.js quand le serveur répond qu'AUCUN troupeau
  // n'existe encore pour la zone actuelle (message 'mobSync' avec une
  // liste vide) : ce client est probablement le premier arrivé, il
  // propose son propre troupeau local tel quel — les autres arrivants
  // recevront celui-ci en resynchronisation.
  mobSnapshotForZone() {
    return this.mobs.map(mobToNetInfo);
  }

  // Resynchronisation reçue du serveur pour une zone (arrivée ou
  // changement de zone) : remplace le troupeau connu localement par
  // celui déjà établi par d'autres joueurs, pour que tout le monde
  // voie EXACTEMENT les mêmes bêtes au même endroit. Ignoré
  // silencieusement si la liste reçue est vide (voir js/main.js : dans
  // ce cas c'est à NOUS d'établir le troupeau, via mobSnapshotForZone),
  // ou si cette zone n'a encore jamais été visitée localement (rien à
  // raccrocher — cohérent avec chestDataMapForZone/furnaceDataMapForZone).
  applyMobSync(zone, mobs) {
    if (!Array.isArray(mobs) || mobs.length === 0) return;
    const newMobs = mobs.map((info) => {
      const mob = makeMobFromNetwork(info);
      mob.dy = DRAW_MOB;
      return mob;
    });
    if (this.world && zone === this.world.id) {
      this.mobs = newMobs;
      this._mobsById = null; // reconstruit paresseusement (voir _mobIndex)
    } else {
      const saved = this.dimStates.get(zone);
      if (saved) saved.mobs = newMobs;
    }
    this._nextMobId = Math.max(this._nextMobId || 0, ...mobs.map((m) => m.id + 1));
  }

  // Un ou plusieurs animaux neufs (repop, annoncés par le coordinateur
  // de la zone) : ignore silencieusement un id déjà connu (message reçu
  // en double, ex. après une reconnexion) ou une zone jamais visitée.
  applyMobSpawn(zone, mobs) {
    const arr = this.mobsArrayForZone(zone);
    if (!arr) return;
    const active = this.world && zone === this.world.id;
    const index = active ? this._mobIndex() : null;
    for (const info of mobs) {
      const known = active ? index.has(info.id) : arr.some((m) => m.id === info.id);
      if (known) continue;
      const mob = makeMobFromNetwork(info);
      mob.dy = DRAW_MOB;
      arr.push(mob);
      if (index) index.set(mob.id, mob);
      this._nextMobId = Math.max(this._nextMobId || 0, mob.id + 1);
    }
  }

  // Correctif de position du coordinateur d'une zone : pour la zone
  // AFFICHÉE, on ne déplace rien d'un coup — on pose juste une cible que
  // _blendMobsTowardNetwork rejoindra en douceur à chaque frame (une
  // zone non affichée n'a pas besoin de cette subtilité : rien ne la
  // dessine, autant recaler directement sa position stockée). Un id
  // inconnu localement (rare : animal apparu ailleurs juste avant notre
  // arrivée) est ignoré, le prochain mobSync/mobSpawn le rattrapera.
  applyMobState(zone, entries) {
    const arr = this.mobsArrayForZone(zone);
    if (!arr) return;
    if (this.world && zone === this.world.id) {
      const index = this._mobIndex();
      for (const e of entries) {
        const mob = index.get(e.id);
        if (!mob || !mob.alive) continue;
        mob._netTargetX = e.x;
        mob._netTargetY = e.y;
      }
    } else {
      for (const e of entries) {
        const mob = arr.find((m) => m.id === e.id);
        if (mob && mob.alive) { mob.x = e.x; mob.y = e.y; }
      }
    }
  }

  // Un autre joueur a frappé/tué un animal d'une zone : « dernier coup
  // gagne », on applique tel quel (jamais de recalcul de dégâts ici —
  // voir net-server.js, aucune validation côté serveur non plus). Un
  // animal qui vient de mourir chez un autre joueur doit aussi lâcher
  // son butin ICI, mais SEULEMENT si sa zone est actuellement affichée
  // (killMob dépose des objets au sol/particules dans le monde actif —
  // une zone non affichée se contente de mémoriser hp/alive).
  applyMobHit(zone, info) {
    const arr = this.mobsArrayForZone(zone);
    if (!arr) return;
    const active = this.world && zone === this.world.id;
    const mob = active ? this._mobIndex().get(info.id) : arr.find((m) => m.id === info.id);
    if (!mob) return;
    const wasAlive = mob.alive;
    mob.hp = info.hp;
    mob.alive = info.alive;
    if (!active) return;
    if (wasAlive && !mob.alive) {
      mob.hitFlash = 0.18;
      this.killMob(mob);
    } else if (mob.alive) {
      mob.hitFlash = 0.18;
      mob.fleeT = 1.7;
    }
  }

  // ------------------------------------------------------------
  //  PNJ (représentant de l'île, marchands de la grotte)
  // ------------------------------------------------------------
  addNpc(npc) {
    if (!npc) return null;
    if (npc.dy === undefined) npc.dy = DRAW_NPC;
    if (npc.visible === undefined) npc.visible = true;
    if (npc.scale === undefined) npc.scale = 1;
    if (!this.npcs.includes(npc)) this.npcs.push(npc);
    return npc;
  }

  removeNpc(npc) {
    const i = this.npcs.indexOf(npc);
    if (i >= 0) this.npcs.splice(i, 1);
    if (this.interactTarget && this.interactTarget.npc === npc) this.interactTarget = null;
  }

  updateNpcs(dt) {
    for (const npc of this.npcs) {
      npc.time = this.time;
      if (typeof npc.onUpdate === 'function') npc.onUpdate(npc, dt, this);
    }
  }

  // Une cinématique (arrivée du représentant) fige les entrées du joueur.
  setCutscene(on) {
    this.cutscene = Boolean(on);
    if (this.cutscene) {
      this.input.mouse.leftClicked = false;
      this.input.mouse.rightClicked = false;
      this.input.mouse.leftDown = false;
      this.input.mouse.rightDown = false;
      this.input.keys.clear();
      this.resetMining();
    }
  }

  // ------------------------------------------------------------
  //  Équipement de la grotte (masque + protection de minage)
  //  On équipe automatiquement le MEILLEUR de chaque type possédé :
  //  acheter un masque suffit, aucune manipulation supplémentaire.
  // ------------------------------------------------------------
  refreshGear() {
    const slots = this.inventory.slots;
    let mask = null;
    let armor = null;
    let maskDepth = 0;
    let armorDepth = 0;
    for (let i = 0; i < slots.length; i++) {
      const stack = slots[i];
      if (!stack) continue;
      const def = ITEM_DEFS[stack.id];
      if (!def || def.type !== 'gear') continue;
      const depth = def.maxDepth || 1;
      if (def.gearSlot === 'mask' && depth > maskDepth) { mask = stack.id; maskDepth = depth; }
      else if (def.gearSlot === 'armor' && depth > armorDepth) { armor = stack.id; armorDepth = depth; }
    }
    const changed = mask !== this.gear.mask || armor !== this.gear.armor;
    this.gear.mask = mask;
    this.gear.armor = armor;
    this.gear.maxDepth = Math.min(maskDepth || 1, armorDepth || 1);
    if (changed && typeof this.uiCallbacks.onGearChange === 'function') {
      this.uiCallbacks.onGearChange(this.gear);
    }
    return this.gear;
  }

  // Bonus de vitesse de minage apporté par l'équipement. On prend le
  // meilleur des deux (pas de cumul multiplicatif : ça resterait lisible).
  gearMiningBoost() {
    const m = this.gear.mask ? ITEM_DEFS[this.gear.mask]?.miningBoost || 1 : 1;
    const a = this.gear.armor ? ITEM_DEFS[this.gear.armor]?.miningBoost || 1 : 1;
    return Math.max(m, a);
  }

  // ------------------------------------------------------------
  //  Interaction (touche F) : entrée de grotte, puits, marchands
  // ------------------------------------------------------------
  updateInteractTarget() {
    this.interactTarget = null;
    if (this.cutscene) return;
    // Au volant, une seule chose à faire : descendre.
    if (this.driving) {
      this.interactTarget = {
        car: this.driving, label: 'Descendre de voiture', action: 'exitCar',
      };
      return;
    }

    // 1) Un PNJ tout près passe en premier : c'est l'interaction la
    //    plus probable quand on est debout devant quelqu'un.
    let bestNpc = null;
    let bestDist = INTERACT_NPC_SQ;
    for (const npc of this.npcs) {
      if (!npc.visible || !npc.talkable) continue;
      const dx = npc.x - this.player.x;
      const dy = npc.y - this.player.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < bestDist) {
        bestDist = distSq;
        bestNpc = npc;
      }
    }
    if (bestNpc) {
      this.interactTarget = {
        npc: bestNpc,
        label: `Parler à ${bestNpc.name}`,
        action: 'talk',
      };
      return;
    }

    // 2) Sinon, une voiture à portée de main : on y monte.
    if (!this.driving) {
      const car = this.nearestCar();
      if (car) {
        this.interactTarget = { car, label: `Conduire la ${car.model.label}`, action: 'car' };
        return;
      }
    }

    // 3) Sinon, un point de passage à portée de main.
    const tx = this.targetTx;
    const ty = this.targetTy;
    if (!this.inReach || !this.world.inBounds(tx, ty)) return;
    const block = this.world.blockAt(tx, ty);
    if (block === 'caveMouth') {
      this.interactTarget = { label: 'Entrer dans la grotte', action: 'enterCave' };
    } else if (block === 'caveLadderDown') {
      const next = (this.world.depth || 0) + 1;
      this.interactTarget = { label: `Descendre — profondeur ${next}`, action: 'descend' };
    } else if (block === 'caveLadderUp') {
      const depth = this.world.depth || 0;
      this.interactTarget = depth <= 1
        ? { label: 'Sortir de la grotte', action: 'exitCave' }
        : { label: `Remonter — profondeur ${depth - 1}`, action: 'ascend' };
    }
  }

  // ------------------------------------------------------------
  //  Voitures
  //
  //  Une voiture n'est pas un bloc : c'est une entité qu'on laisse où
  //  on l'a garée (jusqu'à la fin de la partie). Pour l'instant elles
  //  vivent dans la session du joueur : deux joueurs ne se voient pas
  //  conduire — le réseau ne les transporte pas encore.
  // ------------------------------------------------------------

  // Les voitures d'une île, créées à la première demande.
  carsFor(world) {
    let list = this.cars.get(world.id);
    if (list === undefined) {
      list = spawnCityCars(world);
      this.cars.set(world.id, list);
    }
    return list;
  }

  // La voiture la plus proche du joueur, à portée de main.
  nearestCar(maxDist = 52) {
    let best = null;
    let bestDist = maxDist * maxDist;
    for (const car of this.carsFor(this.world)) {
      const dx = car.x - this.player.x;
      const dy = car.y - this.player.y;
      const d = dx * dx + dy * dy;
      if (d < bestDist) { bestDist = d; best = car; }
    }
    return best;
  }

  enterCar(car) {
    if (!car || this.driving === car) return;
    this.driving = car;
    car.speed = 0;
    this.player.x = car.x;
    this.player.y = car.y;
    this.resetMining();
    this.actionCooldown = 0.3;
    this.notify(`Vous conduisez la ${car.model.label} — Z avance, S freine, Q et D braquent.`);
  }

  exitCar() {
    const car = this.driving;
    if (!car) return;
    // On descend À CÔTÉ, jamais dans un mur ni à l'eau.
    const spot = this.freeSpotNear(car.x, car.y);
    this.player.x = spot.x;
    this.player.y = spot.y;
    car.speed = 0;
    this.driving = null;
    this.actionCooldown = 0.35;
  }

  // Une case libre autour d'un point (quatre côtés, puis le point lui-même).
  freeSpotNear(x, y) {
    for (const [ox, oy] of [[30, 0], [-30, 0], [0, 30], [0, -30]]) {
      const nx = x + ox;
      const ny = y + oy;
      const tx = Math.floor(nx / TILE);
      const ty = Math.floor(ny / TILE);
      if (!this.world.inBounds(tx, ty)) continue;
      if (this.world.isSolidTile(tx, ty)) continue;
      if (this.world.floor[this.world.idx(tx, ty)] === 'water') continue;
      return { x: nx, y: ny };
    }
    return { x, y };
  }

  // Conduite : les touches de déplacement servent de pédales et de volant.
  updateDriving(dt) {
    const car = this.driving;
    car.update(dt, this.world, {
      throttle: this.input.down('moveUp') ? 1 : 0,
      brake: this.input.down('moveDown') ? 1 : 0,
      steer: (this.input.down('moveRight') ? 1 : 0) - (this.input.down('moveLeft') ? 1 : 0),
    });
    // Le joueur est assis dedans : sa position suit, pour la caméra, le
    // chat de proximité et tout ce qui se mesure au joueur.
    this.player.x = car.x;
    this.player.y = car.y;
    this.player.moving = Math.abs(car.speed) > 8;
    this.player.facing = Math.abs(Math.cos(car.angle)) > Math.abs(Math.sin(car.angle))
      ? (Math.cos(car.angle) > 0 ? 'right' : 'left')
      : (Math.sin(car.angle) > 0 ? 'down' : 'up');
  }

  handleInteract() {
    const target = this.interactTarget;
    if (!target || this.actionCooldown > 0) return;
    this.actionCooldown = 0.3;

    // Voiture : on monte, ou on descend si on est déjà au volant.
    if (target.action === 'car' && target.car) {
      this.enterCar(target.car);
      return;
    }
    if (target.action === 'exitCar') {
      this.exitCar();
      return;
    }

    if (target.action === 'talk' && target.npc) {
      if (target.npc.cooldownUntil && this.time < target.npc.cooldownUntil) {
        const left = Math.ceil(target.npc.cooldownUntil - this.time);
        this.notify(`${target.npc.name} ne veut plus te voir (${left} s).`);
        return;
      }
      if (this.uiCallbacks.onTalk) this.uiCallbacks.onTalk(target.npc);
      return;
    }
    if (target.action === 'enterCave') { this.enterCave(); return; }
    if (target.action === 'exitCave') { this.exitCave(); return; }
    if (target.action === 'ascend') { this.ascend(); return; }
    if (target.action === 'descend') { this.descend(); return; }
  }

  // ------------------------------------------------------------
  //  Changement de dimension (surface ⇄ grotte)
  // ------------------------------------------------------------

  // Sauvegarde / restaure ce qui vit dans un monde donné. Sans ça,
  // descendre dans la grotte viderait les fours et ferait disparaître
  // les objets posés au sol à la surface.
  _saveDimState() {
    const world = this.world;
    if (!world) return;
    this.dimStates.set(world.id, {
      furnaceData: this.furnaceData,
      chestData: this.chestData,
      signData: this.signData,
      sellerData: this.sellerData,
      droppedItems: this.droppedItems,
      mobs: this.mobs,
    });
  }

  _restoreDimState(world) {
    const saved = this.dimStates.get(world.id);
    if (saved) {
      this.furnaceData = saved.furnaceData;
      this.chestData = saved.chestData;
      this.signData = saved.signData || new Map();
      this.sellerData = saved.sellerData || new Map();
      this.droppedItems = saved.droppedItems;
      this.mobs = saved.mobs;
    } else {
      this.furnaceData = new Map();
      this.chestData = new Map();
      this.signData = new Map();
      this.sellerData = new Map();
      this.droppedItems = [];
      // Pas d'animaux sous terre, ni sur une île vierge.
      this.mobs = (world.kind === 'cave' || world.bare) ? [] : spawnMobs(world);
      for (const mob of this.mobs) mob.dy = DRAW_MOB;
      this._nextMobId = Math.max(this._nextMobId || 0, this.mobs.length);
    }
    // Multijoueur (étape 5) : l'index par id (voir _mobIndex) pointait
    // vers le troupeau de l'ANCIENNE zone — il doit être reconstruit
    // pour la zone qu'on vient de restaurer, sinon un message réseau
    // (mobState/mobHit) arrivant juste après le changement de zone
    // retrouverait les mauvais animaux (ou aucun).
    this._mobsById = null;
  }

  // Bascule sur un autre monde : on échange le monde, on reconstruit
  // tous les index (objets statiques, blocs posés, eau), on vide les
  // caches dépendants de la résolution et on repositionne la caméra.
  switchWorld(world, spawnX, spawnY) {
    this._saveDimState();
    this.world = world;
    this._restoreDimState(world);

    this.floorChunkCache.clear();
    this._prewarmRectKey = undefined;
    this.highlightCache.clear();
    this.vignetteCanvas = null;
    this.particles.length = 0;
    this.resetMining();

    this.rebuildStaticObjects(); // reconstruit aussi l'index des blocs posés
    this.prewarmFloorChunks(Infinity);

    this.player.x = spawnX;
    this.player.y = spawnY;
    this.player.sortY = spawnY;
    this.camera.snapTo(spawnX, spawnY);
    this.updateTarget();
    this.refreshGear();
    // Prévient le client multijoueur : les autres joueurs affichés
    // doivent changer (ex. quitter la liste visible en entrant dans
    // la grotte). world.id vaut 'surface' ou 'cave:<profondeur>'.
    if (this.uiCallbacks.onZoneChange) this.uiCallbacks.onZoneChange(world.id);
  }

  // Niveau souterrain demandé (généré une seule fois, puis réutilisé :
  // la grotte ne change pas entre deux descentes).
  getCaveLevel(depth) {
    let world = this.caveLevels && this.caveLevels.get(depth);
    if (!world) {
      if (!this.caveLevels) this.caveLevels = new Map();
      world = new World(this.world.seed, { kind: 'cave', depth });
      this.caveLevels.set(depth, world);
    }
    return world;
  }

  // Île d'arrivée du passeur (voir js/islands.js). Générée une seule
  // fois puis conservée pour toute la partie.
  getIsland(id) {
    // L'île de départ n'est pas générée à la demande : elle existe
    // depuis le lancement et garde tout ce qu'on y a construit.
    if (id === HOME_ISLAND) return this.surfaceWorld;
    const def = islandDef(id);
    if (!def) return null;
    let world = this.islands && this.islands.get(id);
    if (!world) {
      if (!this.islands) this.islands = new Map();
      // Le reste (île vierge, mouillage) vient de la fiche de l'île.
      world = new World(def.seed, { id: def.id });
      this.islands.set(id, world);
    }
    return world;
  }

  // La traversée (cinématique) : le joueur embarque, la mer défile, et
  // il ne débarque qu'à la fin. Le paiement est fait par l'appelant (le
  // comptoir du passeur) : le moteur ne connaît pas la bourse.
  startCrossing(islandId, landing, names = {}) {
    // On laisse la voiture au garage (ou sur le quai) : la traversée se
    // fait à pied, avec Gab.
    this.driving = null;
    const world = this.getIsland(islandId);
    if (!world) return false;
    const tx = landing && Number.isFinite(landing.tx) ? landing.tx : Math.floor(world.spawn.x / TILE);
    const ty = landing && Number.isFinite(landing.ty) ? landing.ty : Math.floor(world.spawn.y / TILE);
    // On lâche ce qui était en cours : on appareille.
    this.resetMining();
    if (this.uiCallbacks.onCrossingStart) this.uiCallbacks.onCrossingStart();
    this.crossing.start(names.from || '', names.to || '', () => {
      this.switchWorld(world, tx * TILE + TILE / 2, ty * TILE + TILE);
      if (this.uiCallbacks.onCrossingEnd) this.uiCallbacks.onCrossingEnd();
    });
    return true;
  }

  // Débarquement immédiat (sans cinématique) : sert aux tests et aux
  // téléportations de secours.
  crossToIsland(id, landing) {
    const world = this.getIsland(id);
    if (!world) return false;
    const tx = landing && Number.isFinite(landing.tx) ? landing.tx : Math.floor(world.spawn.x / TILE);
    const ty = landing && Number.isFinite(landing.ty) ? landing.ty : Math.floor(world.spawn.y / TILE);
    this.switchWorld(world, tx * TILE + TILE / 2, ty * TILE + TILE);
    return true;
  }

  enterCave() {
    const level = this.getCaveLevel(1);
    // Les marchands attendent dans le hall d'entrée.
    if (this.uiCallbacks.onEnterCave) this.uiCallbacks.onEnterCave(level);
    this.switchWorld(level, level.spawn.x, level.spawn.y);
    this.notify('Tu entres dans la grotte.');
  }

  exitCave() {
    const surface = this.surfaceWorld;
    if (!surface) return;
    const entrance = surface.caveEntrance;
    if (this.uiCallbacks.onExitCave) this.uiCallbacks.onExitCave(surface);
    this.switchWorld(
      surface,
      entrance ? entrance.x : surface.spawn.x,
      entrance ? entrance.y : surface.spawn.y,
    );
    this.notify('Te revoilà à l\'air libre.');
  }

  descend() {
    const current = this.world.depth || 0;
    const next = current + 1;
    if (next > CAVE.maxDepth) {
      this.notify('Le fond de la grotte est atteint.');
      return;
    }
    // Il faut un masque ET une protection de minage assez profonds.
    const check = canDescendTo(next, this.gear, ITEM_DEFS);
    if (!check.ok) {
      const depth = Math.max(1, Math.min(check.maskDepth || 1, check.armorDepth || 1));
      this.notify(
        `Trop dangereux à cette profondeur : il te faut ${check.missing.join(' et ')}`
        + ` (équipement actuel : profondeur ${depth}).`,
      );
      if (this.uiCallbacks.onInteractBlocked) this.uiCallbacks.onInteractBlocked('descend', check);
      return;
    }
    const level = this.getCaveLevel(next);
    if (this.uiCallbacks.onDescend) this.uiCallbacks.onDescend(level);
    this.switchWorld(level, level.spawn.x, level.spawn.y);
    this.notify(`Profondeur ${next}. L'air se fait rare.`);
  }

  ascend() {
    const current = this.world.depth || 0;
    if (current <= 1) { this.exitCave(); return; }
    const level = this.getCaveLevel(current - 1);
    // On réapparaît au puits descendant du niveau du dessus : c'est
    // l'endroit d'où l'on vient, le retour est donc logique.
    const back = level.ladderDown || level.spawn;
    const x = back.tx !== undefined ? back.tx * TILE + TILE / 2 : level.spawn.x;
    const y = back.ty !== undefined ? (back.ty + 1) * TILE + TILE / 2 : level.spawn.y;
    if (this.uiCallbacks.onDescend) this.uiCallbacks.onDescend(level);
    this.switchWorld(level, x, y);
    this.notify(`Profondeur ${current - 1}.`);
  }

  // Téléportation d'alarme (étal niv. 3 volé) : bascule vers la zone de
  // l'étal (surface ou grotte, générée si besoin) puis snap à la tuile.
  teleportToZone(zone, tx, ty) {
    let world;
    if (zone === 'surface') world = this.surfaceWorld;
    else {
      const m = /^cave:(\d+)$/.exec(zone);
      if (!m) return false;
      world = this.getCaveLevel(Number(m[1]));
    }
    const x = tx * TILE + TILE / 2;
    const y = (ty + 1) * TILE + TILE / 2; // juste devant l'étal
    this.switchWorld(world, x, y);
    this.notify('Téléportation vers ton étal !');
    return true;
  }

  // Halo chaud autour du joueur dans la grotte (pré-rendu une fois).
  getCaveGlow() {
    if (this.caveGlowSprite) return this.caveGlowSprite;
    const size = 256;
    const c = makeCanvas(size, size);
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(size / 2, size / 2, 8, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,196,120,0.55)');
    grad.addColorStop(0.35, 'rgba(255,170,90,0.24)');
    grad.addColorStop(0.7, 'rgba(180,120,70,0.07)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    this.caveGlowSprite = c;
    return c;
  }

  // Obscurité souterraine : un voile sombre sur tout l'écran, puis une
  // lumière chaude autour du joueur. Deux opérations plein écran au
  // total — et en mode performance on garde uniquement le voile (un
  // seul fillRect), ce qui reste parfaitement lisible.
  drawCaveDarkness(ctx, W, H) {
    const depth = this.world.depth || 1;
    // Plus on descend, plus c'est noir.
    const veil = Math.min(0.62, 0.34 + depth * 0.035);
    ctx.fillStyle = `rgba(6,5,14,${veil})`;
    ctx.fillRect(0, 0, W, H);

    // Les torches posées éclairent la galerie d'une lueur chaude et
    // vacillante — visible même en mode performance (c'est du repérage).
    const zt = this.camera.zoom;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const torches = this._torchPositions();
    for (let k = 0; k < torches.length; k += 2) {
      const x = (torches[k] - this.camera.x) * zt;
      const y = (torches[k + 1] - this.camera.y) * zt;
      const r = 140 * zt;
      if (x < -r || x > W + r || y < -r || y > H + r) continue;
      const flick = 0.8 + Math.sin(this.time * 8 + k) * 0.2;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255,170,80,${(0.5 * flick).toFixed(3)})`);
      g.addColorStop(1, 'rgba(255,140,50,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    if (this.performanceMode || !this._vignetteOn()) return;

    const zoom = this.camera.zoom;
    const sx = (this.player.x - this.camera.x) * zoom;
    const sy = (this.player.y - this.camera.y) * zoom;
    const r = 200;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(this.getCaveGlow(), sx - r, sy - r, r * 2, r * 2);
    ctx.restore();
  }

  // Quantité de nuit (0 = plein jour, 1 = pleine nuit) déduite du cycle.
  // t : 0 aube, 0.25 midi, 0.5 crépuscule, 0.75 minuit.
  dayNightAmount() {
    const t = (this.time % this.dayLength) / this.dayLength;
    if (t < 0.42) return 0;                       // journée
    if (t < 0.55) return (t - 0.42) / 0.13;       // crépuscule
    if (t < 0.90) return 1;                        // nuit
    return 1 - (t - 0.90) / 0.10;                  // aube
  }

  // Voile nocturne en surface : un bleu profond percé de lueurs chaudes
  // autour du joueur et des fours allumés (canvas hors-écran +
  // destination-out), plus une lueur additive sur les fours.
  drawNight(ctx, W, H) {
    const m = this.dayNightAmount();
    if (m <= 0.02) { this.nightCanvas = null; return; }
    // Niveau Faible : un simple voile plat, sans canvas secondaire.
    if (this._gfx() === 'low') {
      ctx.fillStyle = `rgba(12,16,48,${(m * 0.5).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
      return;
    }
    if (!this.nightCanvas || this.nightCanvas.width !== W || this.nightCanvas.height !== H) {
      this.nightCanvas = makeCanvas(W, H);
    }
    const nctx = this.nightCanvas.getContext('2d');
    nctx.setTransform(1, 0, 0, 1, 0, 0);
    nctx.globalCompositeOperation = 'source-over';
    nctx.clearRect(0, 0, W, H);
    nctx.fillStyle = `rgba(12,16,48,${(m * 0.55).toFixed(3)})`;
    nctx.fillRect(0, 0, W, H);
    // Percer des trous de lumière.
    nctx.globalCompositeOperation = 'destination-out';
    const zoom = this.camera.zoom;
    const sx = (wx) => (wx - this.camera.x) * zoom;
    const sy = (wy) => (wy - this.camera.y) * zoom;
    this._punchLight(nctx, sx(this.player.x), sy(this.player.y - 6), 150 * zoom, 0.72, W, H);
    for (const [idx, e] of this.furnaceData) {
      if (!(e && e.fuelTime > 0)) continue;
      const tx = idx % WORLD_W, ty = (idx / WORLD_W) | 0;
      this._punchLight(nctx, sx(tx * TILE + 16), sy(ty * TILE + 14), 120 * zoom, 0.85, W, H);
    }
    const torches = this._torchPositions();
    for (let k = 0; k < torches.length; k += 2) {
      this._punchLight(nctx, sx(torches[k]), sy(torches[k + 1]), 110 * zoom, 0.85, W, H);
    }
    nctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.nightCanvas, 0, 0);
    // Lueur chaude additive des fours allumés (niveau Élevé uniquement).
    if (this._gfx() !== 'high') return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const [idx, e] of this.furnaceData) {
      if (!(e && e.fuelTime > 0)) continue;
      const tx = idx % WORLD_W, ty = (idx / WORLD_W) | 0;
      const x = sx(tx * TILE + 16), y = sy(ty * TILE + 12);
      const r = 110 * zoom;
      if (x < -r || x > W + r || y < -r || y > H + r) continue;
      // Petit vacillement de flamme pour une lueur vivante.
      const flick = 0.85 + Math.sin(this.time * 7 + idx) * 0.15;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255,170,70,${(0.45 * m * flick).toFixed(3)})`);
      g.addColorStop(1, 'rgba(255,150,60,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Lueur des torches posées, elle aussi vacillante.
    const torchGlow = this._torchPositions();
    for (let k = 0; k < torchGlow.length; k += 2) {
      const x = sx(torchGlow[k]), y = sy(torchGlow[k + 1]);
      const r = 100 * zoom;
      if (x < -r || x > W + r || y < -r || y > H + r) continue;
      const flick = 0.8 + Math.sin(this.time * 8 + k) * 0.2;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255,180,80,${(0.4 * m * flick).toFixed(3)})`);
      g.addColorStop(1, 'rgba(255,150,60,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Troue le voile nocturne d'un dégradé radial (force = opacité effacée).
  _punchLight(nctx, x, y, r, strength, W, H) {
    if (x < -r || x > W + r || y < -r || y > H + r) return;
    const g = nctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(0,0,0,${strength})`);
    g.addColorStop(0.5, `rgba(0,0,0,${(strength * 0.4).toFixed(3)})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    nctx.fillStyle = g;
    nctx.beginPath();
    nctx.arc(x, y, r, 0, Math.PI * 2);
    nctx.fill();
  }

  // ------------------------------------------------------------
  //  PvP entre joueurs
  // ------------------------------------------------------------

  // Joueur distant sous le curseur (à portée), ou null. Le rayon est
  // généreux (14 px) pour rester tolérant, comme l'aim assist des mobs.
  playerUnderCursor() {
    const m = this.input.mouse;
    const zoom = this.camera.zoom;
    const wx = this.camera.x + m.x / zoom;
    const wy = this.camera.y + m.y / zoom;
    let best = null;
    let bestD = 14 * 14;
    for (const p of this.otherPlayers) {
      if (p.hp !== undefined && p.hp <= 0) continue;
      const dx = p.x - wx;
      const dy = (p.y - 8) - wy;
      const d = dx * dx + dy * dy;
      if (d <= bestD + 60) { // léger aim assist
        const ddx = p.x - this.player.x;
        const ddy = p.y - this.player.y;
        if (ddx * ddx + ddy * ddy <= REACH * REACH) { best = p; bestD = d; }
      }
    }
    return best;
  }

  // Attaque un joueur distant sous le curseur. Retourne true si un joueur
  // était visé (pour ne pas miner la tuile derrière lui). La VICTIME
  // applique elle-même les dégâts (elle fait foi sur ses PV).
  tryAttackPlayer() {
    const target = this.playerUnderCursor();
    if (!target) return false;
    if (this.pvpCooldown > 0) return true;
    this.pvpCooldown = 0.5;
    const held = this.inventory.getSelectedStackRef();
    const dmg = held ? toolDamage(ITEM_DEFS[held.id]) : 1;
    // Retour visuel IMMÉDIAT pour l'attaquant : l'outil balance et des
    // étincelles rouges giclent sur la victime. Avant, aucun des deux —
    // impossible de savoir qu'on venait de toucher quelqu'un.
    this.pvpSwingT = 0.28;
    this.spawnHitBurst(target.x, target.y - 10);
    if (this.uiCallbacks.onPlayerAttack) this.uiCallbacks.onPlayerAttack(target.id, dmg);
    return true;
  }

  // Étincelles de coup en coordonnées PIXELS (la victime est entre deux
  // tuiles) : rouge sang, petit nuage bref, un par coup porté.
  spawnHitBurst(x, y) {
    if (!this._particlesEnabled()) return;
    if (this.particles.length > MAX_PARTICLES) return;
    const count = this.performanceMode ? 4 : 8;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 30 + Math.random() * 55;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 40,
        life: 1,
        decay: 2.6 + Math.random() * 1.6,
        size: 1 + Math.random() * 1.6,
        color: Math.random() < 0.7 ? '#d63944' : '#ff8a8a',
      });
    }
  }

  // Voile rouge bref sur tout l'écran : la victime d'un coup SAIT qu'elle
  // vient d'être touchée (l'écran n'a pas besoin de partir en vrille :
  // un flash de 0,45 s suffit, et le mode performance peut l'ignorer).
  hurtFlash() {
    if (typeof document === 'undefined') return;
    const el = document.getElementById('hurt-flash');
    if (!el) return;
    el.classList.remove('flash');
    void el.offsetWidth; // relance l'animation CSS même si elle tournait
    el.classList.add('flash');
  }

  // Un joueur distant m'attaque : j'applique les dégâts moi-même (jamais
  // l'attaquant), je diffuse mes PV, et je gère ma propre mort/respawn.
  applyPlayerAttack(fromId, dmg) {
    const from = this.otherPlayers.find((p) => p.id === fromId);
    if (!from) return;
    const dx = from.x - this.player.x;
    const dy = from.y - this.player.y;
    if (dx * dx + dy * dy > (REACH * 1.6) ** 2) return; // trop loin : coup ignoré
    const p = this.player;
    p.hp = Math.max(0, p.hp - dmg);
    p.lastHurtAt = this.time;
    this.spawnBreakParticles(Math.floor(p.x / TILE), Math.floor(p.y / TILE), 'player');
    this.hurtFlash(); // la victime VOIT qu'elle vient d'être touchée
    if (p.hp <= 0) {
      // Mort en PvP : l'inventaire tombe au sol SUR PLACE — le vainqueur
      // (et n'importe qui d'ailleurs) peut ramasser le butin. Les drops
      // sont partagés à la zone (voir spawnDropAt / _announceDropSpawn).
      this.dropInventoryAt(p.x, p.y);
      // Retour au spawn de surface, PV et faim rendus.
      p.hp = p.maxHp;
      p.hunger = p.maxHunger;
      p.starveT = 0;
      const surface = this.surfaceWorld;
      const sp = surface ? { x: surface.spawn.x, y: surface.spawn.y } : { x: p.x, y: p.y };
      if (this.world !== surface && surface) this.switchWorld(surface, sp.x, sp.y);
      else { p.x = sp.x; p.y = sp.y; this.camera.snapTo(sp.x, sp.y); }
      this.notify('Tu as été tué ! Retour au spawn.');
    }
    if (this.uiCallbacks.onPlayerHp) this.uiCallbacks.onPlayerHp(p.hp);
  }

  // Trouve un mob sous le curseur (dans la portée d'interaction).
  // L'aim assist agrandit le rayon de toucher : un clic « à côté » d'un
  // mouton compte quand même, ce qui rend les animaux beaucoup plus faciles
  // à toucher (réglable dans les paramètres).
  mobUnderCursor() {
    const m = this.input.mouse;
    const zoom = this.camera.zoom;
    const wx = this.camera.x + m.x / zoom;
    const wy = this.camera.y + m.y / zoom;
    const hitR = this._aimAssist() ? 30 : 15;
    const hitRSq = hitR * hitR;
    let best = null;
    let bestDist = Infinity;
    for (const mob of this.mobs) {
      if (!mob.alive) continue;
      const dx = mob.x - wx;
      const dy = mob.y - wy;
      const distSq = dx * dx + dy * dy;
      if (distSq < hitRSq && distSq < bestDist) {
        best = mob;
        bestDist = distSq;
      }
    }
    // Portée : le joueur doit être assez proche du mob.
    if (best) {
      const dx = best.x - this.player.x;
      const dy = best.y - this.player.y;
      if (dx * dx + dy * dy > REACH_SQ) return null;
    }
    return best;
  }

  attackMob(mob) {
    const selected = this.inventory.getSelectedStackRef();
    const def = selected && ITEM_DEFS[selected.id];
    const sword = def?.toolType === 'sword';
    const damage = toolDamage(def);

    mob.hp -= damage;
    mob.hitFlash = 0.18;
    mob.fleeT = 1.7;
    this.spawnHitParticles(mob.x, mob.y);

    // Une lame ou une hache utilisée comme arme s'use à chaque coup.
    if (sword || def?.toolType === 'axe') {
      const result = this.inventory.damageSelectedTool(1);
      if (result.broken) this.notify(`${def.label} s'est cassé.`);
    }

    if (mob.hp <= 0) {
      mob.alive = false;
      this.killMob(mob);
      const label = (MOB_DEFS[mob.kind] && MOB_DEFS[mob.kind].label) || 'Créature';
      this.notify(`${label} tué${mob.kind === 'vache' ? 'e' : ''}.`);
    }
    // Multijoueur (étape 5) : LE JOUEUR LOCAL vient de porter ce coup —
    // diffusé immédiatement (jamais un flot par frame, une frappe est
    // un évènement rare comme casser un bloc). « Dernier coup gagne » :
    // aucune validation, chaque client applique ses propres dégâts.
    if (this.uiCallbacks.onMobHit) this.uiCallbacks.onMobHit(mob.id, mob.hp, mob.alive);
  }

  killMob(mob) {
    const drops = mobDrops(mob);
    for (const d of drops) {
      for (let i = 0; i < d.count; i++) {
        this.spawnDropAt(mob.x, mob.y, d.id, 1);
      }
    }
    this.spawnBreakParticles(Math.floor(mob.x / TILE), Math.floor(mob.y / TILE), mob.kind === 'sheep' ? 'wool' : 'rawBeef');
  }

  spawnHitParticles(x, y) {
    if (!this._particlesEnabled()) return;
    if (this.particles.length > MAX_PARTICLES) return;
    const count = this.performanceMode ? 3 : 5;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 30 + Math.random() * 40;
      this.particles.push({
        x,
        y: y - 10,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 30,
        life: 1,
        decay: 3.4,
        size: 1.4 + Math.random() * 1.6,
        color: '#ff5a4a',
      });
    }
  }

  // ------------------------------------------------------------
  //  Lâcher un objet au sol (touche Q, comme Minecraft)
  //  Q = un seul objet · Ctrl+Q = toute la pile sélectionnée
  // ------------------------------------------------------------
  handleDropKey() {
    if (!this.input.pressed('drop')) return;
    // Ctrl / Shift en complément = toute la pile (convention Minecraft).
    const wholeStack = this.input.isDown('control') || this.input.isDown('shift');
    this.dropSelected(wholeStack ? Infinity : 1);
  }

  dropSelected(count) {
    const idx = this.inventory.selectedSlotIndex();
    const stack = this.inventory.getSlot(idx);
    if (!stack) return;
    const take = Math.min(count, stack.count);
    const dropped = this.inventory.takeSlot(idx, take);
    if (!dropped) return;
    this.spawnDropAtPlayer(dropped.id, dropped.count);
  }

  // Lâche un objet pile au niveau du joueur, avec un élan vers la
  // direction regardée (le joueur « jette » l'objet devant lui).
  spawnDropAtPlayer(id, count) {
    const dirs = {
      down: { x: 0, y: 1 },
      up: { x: 0, y: -1 },
      left: { x: -1, y: 0 },
      right: { x: 1, y: 0 },
    };
    const d = dirs[this.player.facing] || dirs.down;
    const a = Math.atan2(d.y, d.x) + (Math.random() - 0.5) * 0.55;
    // Élan plus fort + offset initial pour que l'objet atterrisse loin du joueur
    const sp = 110 + Math.random() * 50;
    const ox = d.x * 18; // décalage initial dans la direction regardée
    const oy = d.y * 18;
    this.spawnDropAt(this.player.x + ox, this.player.y + oy, id, count, a, sp);
  }

  // Butin de mort : vide TOUT l'inventaire au sol autour de (x, y), en
  // cercle pour que les piles ne s'empilent pas. Les drops reçoivent un
  // netId et sont annoncés : le vainqueur ramasse le stuff du vaincu.
  dropInventoryAt(x, y) {
    const stacks = this.inventory.drainAll();
    if (!stacks.length) return;
    const baseA = Math.random() * Math.PI * 2;
    for (let k = 0; k < stacks.length; k++) {
      const a = baseA + (k / stacks.length) * Math.PI * 2;
      this.spawnDropAt(x, y, stacks[k].id, stacks[k].count, a, 95);
    }
    this.notify('Ton inventaire est tombé là où tu es tombé…');
  }

  // Identifiant réseau unique d'un drop : séquence locale + sel, préfixé
  // par l'id du joueur pour éviter toute collision entre clients.
  _nextDropNetId() {
    this._dropSeq += 1;
    const owner = this.uiCallbacks.getOwnerId ? this.uiCallbacks.getOwnerId() : 0;
    return `${owner || 0}-${this._dropSeq}-${Math.floor(Math.random() * 1679616).toString(36)}`;
  }

  // Met un drop en file d'annonce réseau (envoyé par lots, voir la
  // purge dans update). Les drops REÇUS du réseau ne sont jamais
  // ré-annoncés : le relais s'arrête au premier client.
  _announceDropSpawn(d) {
    if (d.remote || !this.uiCallbacks.onDropsSend || !d.netId) return;
    this._pendingDropAnnounce.push({
      netId: d.netId,
      item: d.id,
      count: d.count,
      x: Math.round(d.x),
      y: Math.round(d.y),
      vx: Math.round(d.vx),
      vy: Math.round(d.vy),
    });
  }

  _announceDropTaken(netId) {
    if (this.uiCallbacks.onDropTakenSend) this.uiCallbacks.onDropTakenSend(netId);
  }

  // Un AUTRE joueur a fait apparaître un objet au sol dans notre zone.
  applyRemoteDrops(zone, drops) {
    if (zone !== this.world.id || !Array.isArray(drops)) return;
    for (const info of drops) {
      // Le protocole ignore le catalogue d'objets (module sans dépendance) :
      // c'est ICI qu'un objet inconnu du jeu est filtré, jamais ajouté.
      if (!ITEM_DEFS[info.item]) continue;
      if (this.droppedItems.some((d) => d.netId === info.netId)) continue;
      this.droppedItems.push({
        id: info.item,
        count: info.count,
        x: info.x,
        y: info.y,
        vx: info.vx,
        vy: info.vy,
        hop: 8,
        hopV: 0,
        sortY: info.y,
        dy: DRAW_DROP,
        born: this.time,
        life: DROP_LIFETIME,
        netId: info.netId,
        remote: true, // jamais ré-annoncé, jamais re-diffusé
      });
    }
    this.limitDrops();
  }

  // Un AUTRE joueur a ramassé (ou vu disparaître) ce drop : on le retire,
  // sinon il resterait au sol pour nous alors qu'il n'existe plus.
  removeRemoteDrop(zone, netId) {
    if (zone !== this.world.id) return;
    const at = this.droppedItems.findIndex((d) => d.netId === netId);
    if (at >= 0) this.droppedItems.splice(at, 1);
  }

  // Fait apparaître un objet au sol à une position donnée.
  spawnDropAt(x, y, id, count = 1, angle = null, speed = 0) {
    const a = angle === null ? Math.random() * Math.PI * 2 : angle;
    const sp = speed || 40 + Math.random() * 40;
    const drop = {
      id,
      count,
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      hop: 8 + Math.random() * 8,
      hopV: 90 + Math.random() * 40,
      sortY: y,
      dy: DRAW_DROP, // tag de rendu (tri sans allocation)
      born: this.time,
      life: DROP_LIFETIME,
      netId: this._nextDropNetId(),
    };
    this.droppedItems.push(drop);
    this._announceDropSpawn(drop);
    this.limitDrops();
  }

  // ------------------------------------------------------------
  //  Ciblage souris -> tuile sous le curseur
  // ------------------------------------------------------------
  updateTarget() {
    const m = this.input.mouse;
    const zoom = this.camera.zoom;
    const wx = this.camera.x + m.x / zoom;
    const wy = this.camera.y + m.y / zoom;
    const tx = Math.floor(wx / TILE);
    const ty = Math.floor(wy / TILE);
    this.targetTx = tx;
    this.targetTy = ty;

    // portée : distance du joueur au centre de la tuile (sans sqrt)
    const cx = tx * TILE + TILE / 2;
    const cy = ty * TILE + TILE / 2;
    const dx = cx - this.player.x;
    const dy = cy - this.player.y;
    this.inReach = (dx * dx + dy * dy) <= REACH_SQ && this.world.inBounds(tx, ty);
  }

  // ------------------------------------------------------------
  //  Sélection de la barre rapide (touches 1..9 + molette)
  // ------------------------------------------------------------
  handleHotbarKeys() {
    const n = this.inventory.hotbarSize;
    for (let i = 0; i < n; i++) {
      if (this.input.pressed('hotbar' + (i + 1))) this.inventory.select(i);
    }
    if (this.input.pressed('cycleForward')) this.inventory.cycle(1);
    else if (this.input.pressed('cycleBackward')) this.inventory.cycle(-1);
  }

  // ------------------------------------------------------------
  //  Casser (maintenir clic gauche) / Poser (clic droit)
  // ------------------------------------------------------------
  handleClicks(dt) {
    if (this.cutscene) { this.resetMining(); return; }
    // Au volant, on garde les mains sur le volant : ni pioche ni pose.
    if (this.driving) { this.resetMining(); return; }
    // Minage / attaque : on maintient l'action « miner » (clic gauche par
    // défaut, mais rebindable). Frappe d'abord les animaux sous le curseur
    // (comme dans Minecraft), sinon mine la tuile.
    if (this.input.down('mine')) {
      // Frappe d'abord les animaux, puis les JOUEURS (PvP), sinon mine.
      if (!this.tryAttackMob(dt) && !this.tryAttackPlayer()) this.mineTarget(dt);
    } else if (this.mining.progress > 0) {
      this.resetMining();
    }

    // Poser (clic droit par défaut) : un appui suffit, le maintien aussi.
    if (this.input.pressed('place') || this.input.down('place')) this.interactWithTarget();
  }

  // Frappe un mob sous le curseur si possible. Retourne true si un mob
  // a été touché (le minage de la tuile est alors consommé).
  tryAttackMob(dt) {
    const mob = this.mobUnderCursor();
    if (!mob) return false;
    if (this.mobAttackCooldown <= 0) {
      this.attackMob(mob);
      this.mobAttackCooldown = 0.38;
    }
    return true;
  }

  // Clic droit : porte (ouvrir/fermer) ou four (ouvrir le panneau), sinon
  // pose le bloc sélectionné (comme dans Minecraft).
  //
  // Nommée `interactWithTarget` (et non `interactTarget`) : ce dernier nom
  // est déjà pris par une PROPRIÉTÉ d'instance (voir updateInteractTarget,
  // réécrite à chaque frame avec l'objet PNJ/grotte visé par la touche F,
  // ou `null`). Une propriété d'instance masque toujours une méthode du
  // même nom sur le prototype : appeler `this.interactTarget()` plantait
  // donc systématiquement au clic droit dès que cette propriété valait
  // `null` (le cas le plus courant) avec `TypeError: ... is not a
  // function`. D'où ce nom distinct, pour ne plus jamais entrer en
  // collision avec `this.interactTarget` (l'objet).
  interactWithTarget() {
    if (this.actionCooldown > 0 || !this.inReach) return;
    const targetBlock = this.world.blockAt(this.targetTx, this.targetTy);
    if (targetBlock === 'door' && !this.isPlayerOnTile(this.targetTx, this.targetTy)) {
      const open = this.world.toggleDoor(this.targetTx, this.targetTy);
      this.actionCooldown = 0.28;
      this.spawnDoorPuff(this.targetTx, this.targetTy, open);
      this._announceBlockChange(this.targetTx, this.targetTy, { door: open ? 1 : 0 });
      return;
    }
    if (targetBlock === 'furnace') {
      if (this.uiCallbacks.openFurnace) {
        this.uiCallbacks.openFurnace(this.targetTx, this.targetTy);
      }
      this.actionCooldown = 0.25;
      return;
    }
    if (targetBlock === 'chest') {
      this.setChestOpen(this.targetTx, this.targetTy, true);
      if (this.uiCallbacks.openChest) {
        this.uiCallbacks.openChest(this.targetTx, this.targetTy);
      }
      this.actionCooldown = 0.25;
      return;
    }
    if (targetBlock && BLOCK_DEFS[targetBlock]?.sellerTier) {
      if (this.uiCallbacks.openSeller) this.uiCallbacks.openSeller(this.targetTx, this.targetTy);
      this.actionCooldown = 0.25;
      return;
    }
    if (targetBlock === 'sign') {
      // Seul le poseur écrit : les autres lisent (et peuvent casser puis
      // reposer pour hériter du panneau).
      const entry = this.signData.get(this.world.idx(this.targetTx, this.targetTy));
      const me = this.uiCallbacks.getOwnerId ? this.uiCallbacks.getOwnerId() : -1;
      if (entry && entry.owner === me) {
        if (this.uiCallbacks.openSign) this.uiCallbacks.openSign(this.targetTx, this.targetTy);
      } else {
        this.notify(entry && entry.text
          ? 'Panneau d\'un autre joueur : casse-le puis repose-le pour écrire.'
          : 'Ce panneau appartient à quelqu\'un d\'autre.');
      }
      this.actionCooldown = 0.25;
      return;
    }

    // Labour : la houe retourne herbe / terre en terre labourée, prête à
    // semer. (Clic droit, comme poser — mais ça transforme le SOL.)
    const held = this.inventory.getSelectedStackRef();
    const heldDef = held && ITEM_DEFS[held.id];
    if (heldDef?.toolType === 'hoe' && !targetBlock) {
      const floor = this.world.floorAt(this.targetTx, this.targetTy);
      if (floor === 'grass' || floor === 'grassDark' || floor === 'dirt') {
        const i = this.world.idx(this.targetTx, this.targetTy);
        this.world.floor[i] = 'farmland';
        this.invalidateFloorChunk(this.targetTx, this.targetTy);
        this.actionCooldown = 0.2;
        this._announceBlockChange(this.targetTx, this.targetTy, { floor: 'farmland' });
        const res = this.inventory.damageSelectedTool(1);
        if (res.broken) this.notify(`${heldDef.label} s'est cassée.`);
        return;
      }
    }

    // Manger : un aliment en main se consomme d'un clic droit (bien nourri
    // = un coup de pouce temporaire au minage et à la marche).
    if (heldDef?.food) {
      this.eatSelectedFood();
      return;
    }

    this.placeSelectedBlock();
  }

  // Consomme l'aliment sélectionné : remplit la faim (la jauge au-dessus
  // de la barre rapide) ET laisse le bonus « bien nourri » existant.
  eatSelectedFood() {
    const idx = this.inventory.selectedSlotIndex();
    const stack = this.inventory.getSlot(idx);
    const def = stack && ITEM_DEFS[stack.id];
    if (!def?.food) return;
    const lp = this.player;
    // Repu : inutile de gaspiller la nourriture (comme dans Minecraft).
    if (lp.hunger >= lp.maxHunger) {
      this.notify('Tu n\'as pas faim pour le moment.');
      this.actionCooldown = 0.25;
      return;
    }
    this.inventory.takeSlot(idx, 1);
    lp.hunger = Math.min(lp.maxHunger, lp.hunger + def.food);
    this.wellFedT = Math.min(120, this.wellFedT + def.food * 10);
    this.actionCooldown = 0.35; // un repas, ça se mâche
    this.notify(`Miam ! ${def.label} : faim ${Math.round(lp.hunger)}/${lp.maxHunger}`
      + `, bien nourri ${Math.round(this.wellFedT)} s.`);
  }

  // Bonus tant que le joueur est bien nourri (mine et marche un peu mieux).
  wellFedBoost() {
    return this.wellFedT > 0 ? 1.1 : 1;
  }

  // Fait pousser le blé autour du joueur : chaque pousse sur terre labourée
  // accumule un âge et passe au stade suivant toutes les CROP_GROW_SECONDS.
  // Le changement de stade est un simple diff de bloc, diffusé comme les
  // autres modifications de tuile (les voisins voient le blé mûrir).
  updateCrops(dt) {
    const world = this.world;
    if (!world) return;
    const ptx = Math.floor(this.player.x / TILE);
    const pty = Math.floor(this.player.y / TILE);
    const R = 8;
    for (let ty = pty - R; ty <= pty + R; ty++) {
      for (let tx = ptx - R; tx <= ptx + R; tx++) {
        if (!world.inBounds(tx, ty)) continue;
        const i = world.idx(tx, ty);
        const block = world.blocks[i];
        if (!block || !CROPS.includes(block)) {
          if (this.cropAge.has(i)) this.cropAge.delete(i);
          continue;
        }
        if (block === CROP_MATURE || world.floor[i] !== 'farmland') continue;
        const age = (this.cropAge.get(i) || 0) + dt;
        if (age >= CROP_GROW_SECONDS) {
          const next = CROPS[CROPS.indexOf(block) + 1];
          world.blocks[i] = next;
          this.cropAge.delete(i);
          this.reindexPlacedChunk(tx, ty);
          this._announceBlockChange(tx, ty, { blocks: next });
        } else {
          this.cropAge.set(i, age);
        }
      }
    }
  }

  // Petite bouffée de particules quand une porte s'ouvre / se ferme.
  spawnDoorPuff(tx, ty, open) {
    if (!this._particlesEnabled()) return;
    if (this.particles.length > MAX_PARTICLES) return;
    const cx = tx * TILE + TILE / 2;
    const cy = ty * TILE + TILE / 2;
    const count = this.performanceMode ? 3 : 5;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 18 + Math.random() * 26;
      this.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 20,
        life: 1,
        decay: 3.2,
        size: 1 + Math.random() * 1.6,
        color: open ? '#c8a36a' : '#9a7a4a',
      });
    }
  }

  mineTarget(dt) {
    if (!this.inReach || !this.world.inBounds(this.targetTx, this.targetTy)) {
      this.resetMining();
      return;
    }

    const existingBlock = this.world.blockAt(this.targetTx, this.targetTy);
    // Étal de vente : seul celui qui l'a POSÉ peut le casser. Un client
    // qui ne peut pas prouver sa propriété (étal en cours de synchro,
    // inconnu, ou posé par un autre) n'amorce même pas le minage — le
    // stock et la cagnotte du vendeur ne peuvent pas être pillés d'un
    // coup de pioche par un passant.
    if (existingBlock && BLOCK_DEFS[existingBlock]?.sellerTier) {
      const entry = this.sellerData.get(this.world.idx(this.targetTx, this.targetTy));
      const me = this.uiCallbacks.getOwnerId ? this.uiCallbacks.getOwnerId() : -1;
      if (!entry || entry.owner !== me) {
        this.resetMining();
        // Message borné : une fois toutes les 2 s, pas à chaque frame.
        if (this.time - (this._sellerWarnAt || -99) > 2) {
          this._sellerWarnAt = this.time;
          this.notify('Cet étal ne vous appartient pas : seul son propriétaire peut le casser.');
        }
        return;
      }
    }
    let duration = this.world.breakDurationAt(this.targetTx, this.targetTy);
    if (existingBlock === 'tree') {
      duration = treeBreakTime(treeVariantAt(this.targetTx, this.targetTy));
    }
    if (duration <= 0) {
      this.resetMining();
      return;
    }

    if (this.mining.tx !== this.targetTx || this.mining.ty !== this.targetTy) {
      this.mining.tx = this.targetTx;
      this.mining.ty = this.targetTy;
      this.mining.progress = 0;
    }

    const selected = this.inventory.getSelectedStackRef();
    const selectedDef = selected ? ITEM_DEFS[selected.id] : null;
    const requiredTool = this.world.requiredToolAt(this.targetTx, this.targetTy);
    const effectiveTool = selectedDef?.toolType === requiredTool;
    // Certains blocs exigent un niveau d'outil minimum (ex. minerai de fer :
    // pioche en pierre ou mieux). Sinon on casse « à la main » : très lent,
    // et rien ne tombe (comme la pierre).
    const tierOk = toolTierIndex(selectedDef) >= blockMinTierIndex(existingBlock);
    const stoneByHand = isStoneLike(existingBlock) && (!effectiveTool || !tierOk);

    // Une hache / pioche / pelle adaptée accélère réellement le minage.
    // La pierre à la main est volontairement pénible (×10) et ne drop rien.
    let speed = effectiveTool
      ? (selectedDef.efficiency || 1)
      : selectedDef?.type === 'tool' ? 0.7 : 0.55;
    if (stoneByHand) speed /= 10;
    // L'équipement de la grotte accélère réellement le minage : c'est
    // la récompense tangible de l'achat chez les marchands.
    this.mining.duration = duration / (speed * this.gearMiningBoost() * this.wellFedBoost());
    this.mining.progress += dt / this.mining.duration;

    if (this.mining.progress < 1) return;

    const i = this.world.idx(this.targetTx, this.targetTy);
    const oldFloor = this.world.floor[i];
    const oldBlock = this.world.blocks[i];
    const oldBlock2 = this.world.blocks2 ? this.world.blocks2[i] : null;
    const drop = this.world.breakBlock(this.targetTx, this.targetTy);
    // Un bloc posé a disparu : on tient l'index de rendu à jour (une seule
    // liste de chunk à reconstruire, jamais un rescan de toute la fenêtre).
    if (this.world.blocks[i] !== oldBlock
      || (this.world.blocks2 && this.world.blocks2[i] !== oldBlock2)) {
      this.reindexPlacedChunk(this.targetTx, this.targetTy);
    }
    // Multijoueur (étape 2) : annonce aux autres joueurs de la même zone
    // ce qui a réellement changé sur cette tuile (jamais l'action brute —
    // le drop/les particules restent une mise en scène purement locale).
    {
      const diff = {};
      if (this.world.floor[i] !== oldFloor) diff.floor = this.world.floor[i];
      if (this.world.blocks[i] !== oldBlock) diff.blocks = this.world.blocks[i];
      if (this.world.blocks2 && this.world.blocks2[i] !== oldBlock2) diff.blocks2 = this.world.blocks2[i];
      if (Object.keys(diff).length > 0) this._announceBlockChange(this.targetTx, this.targetTy, diff);
    }
    // Un coffre cassé rejette son contenu au sol (comme dans Minecraft) :
    // rien ne se perd en démolissant sa maison.
    if (existingBlock === 'chest') {
      const chestEntry = this.chestData.get(i);
      if (chestEntry) {
        this.chestData.delete(i);
        for (const stack of chestEntry.slots) {
          if (stack) this.spawnDrop(this.targetTx, this.targetTy, stack.id, stack.count);
        }
        // Multijoueur (étape 3) : le coffre est cassé, son contenu est
        // parti au sol — on prévient les autres joueurs que ce coffre
        // est désormais vide, sinon le journal du serveur garderait
        // l'ancien contenu et le referait apparaître si quelqu'un pose
        // un nouveau coffre au même endroit plus tard.
        this._announceChestChange(this.targetTx, this.targetTy, new Array(27).fill(null));
      }
    }
    // Même principe pour un four cassé : son ingrédient/combustible/
    // sortie tombent au sol (rien ne se perd), et on prévient les
    // autres joueurs qu'il est désormais vide.
    if (existingBlock === 'furnace') {
      const furnaceEntry = this.furnaceData.get(i);
      if (furnaceEntry) {
        this.furnaceData.delete(i);
        for (const stack of [furnaceEntry.input[0], furnaceEntry.fuel[0], furnaceEntry.output[0]]) {
          if (stack) this.spawnDrop(this.targetTx, this.targetTy, stack.id, stack.count);
        }
        this._announceFurnaceChange(this.targetTx, this.targetTy, makeFurnaceEntry());
      }
    }
    // Panneau cassé : le texte part avec (comme dans Minecraft), et on
    // purge le journal du serveur pour qu'un futur panneau posé ici
    // reparte vierge.
    if (existingBlock === 'sign') {
      if (this.signData.delete(i)) {
        this._announceSignChange(this.targetTx, this.targetTy, null, -1);
      }
    }
    // Étal cassé : le stock invendu et la cagnotte retombent au sol (rien
    // ne se perd), et on purge le journal serveur.
    if (existingBlock && BLOCK_DEFS[existingBlock]?.sellerTier) {
      const entry = this.sellerData.get(i);
      if (entry) {
        this.sellerData.delete(i);
        if (entry.item && entry.stock > 0) {
          this.spawnDrop(this.targetTx, this.targetTy, entry.item, entry.stock);
        }
        if (entry.till > 0) this.spawnDrop(this.targetTx, this.targetTy, 'coin', entry.till);
        this._announceSellerBreak(this.targetTx, this.targetTy);
      }
    }
    if (drop) {
      if (existingBlock && BLOCK_DEFS[existingBlock]?.kind === 'object') {
        this.removeStaticObjectAt(this.targetTx, this.targetTy);
      }
      this.spawnBreakParticles(this.targetTx, this.targetTy, existingBlock || drop);
      if (stoneByHand) {
        if (existingBlock === 'ironOre') {
          this.notify('Pioche en pierre ou fer requise.');
        } else {
          this.notify('Sans pioche, rien à récupérer.');
        }
      } else {
        let dropN = (existingBlock && BLOCK_DEFS[existingBlock]?.dropN) || 1;
        if (existingBlock === 'tree') {
          dropN = treeDropCount(treeVariantAt(this.targetTx, this.targetTy));
        }
        const baseAngle = Math.random() * Math.PI * 2;
        for (let k = 0; k < dropN; k++) {
          const jitter = (Math.random() - 0.5) * 0.45;
          const angle = dropN > 1
            ? baseAngle + (k / dropN) * Math.PI * 2 + jitter
            : null;
          this.spawnDrop(this.targetTx, this.targetTy, drop, 1, angle);
        }
      }
      if (selectedDef?.type === 'tool') {
        const result = this.inventory.damageSelectedTool(1);
        if (result.broken) this.notify(`${selectedDef.label} s'est cassé.`);
      }
    }
    // Récolter du blé mûr rend aussi des graines : la ferme s'auto-entretient.
    if (existingBlock === CROP_MATURE) {
      const extra = 1 + (Math.random() < 0.5 ? 1 : 0);
      for (let k = 0; k < extra; k++) this.spawnDrop(this.targetTx, this.targetTy, 'seeds', 1);
    }
    if (this.world.floor[i] !== oldFloor) this.invalidateFloorChunk(this.targetTx, this.targetTy);
    this.resetMining();
  }

  // ------------------------------------------------------------
  //  Objets au sol (ramassage en marchant dessus)
  // ------------------------------------------------------------
  spawnDrop(tx, ty, id, count = 1, angle = null) {
    const cx = tx * TILE + TILE / 2;
    const cy = ty * TILE + TILE / 2;
    const a = angle === null ? Math.random() * Math.PI * 2 : angle;
    // Départ déjà décalé + élan plus long : les piles ne restent plus
    // superposées au pied de l'arbre.
    const spread = 16 + Math.random() * 12;
    const speed = 78 + Math.random() * 52;
    const x = cx + Math.cos(a) * spread;
    const y = cy + Math.sin(a) * spread;
    const drop = {
      id,
      count,
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      hop: 8 + Math.random() * 10,
      hopV: 90 + Math.random() * 45,
      sortY: y,
      dy: DRAW_DROP, // tag de rendu (tri sans allocation)
      born: this.time,
      life: DROP_LIFETIME,
      netId: this._nextDropNetId(),
    };
    this.droppedItems.push(drop);
    this._announceDropSpawn(drop);
    this.limitDrops();
  }

  // Plafonne le nombre d'objets au sol : si le maximum est dépassé, le plus
  // vieux objet disparaît (léger nuage de fumée pour prévenir le joueur).
  limitDrops() {
    if (this.droppedItems.length <= MAX_DROPS) return;
    const oldest = this.droppedItems.shift();
    this.spawnBreakParticles(Math.floor(oldest.x / TILE), Math.floor(oldest.y / TILE), oldest.id);
  }

  updateDroppedItems(dt) {
    const items = this.droppedItems;
    if (items.length === 0) return;
    this.pickupFullCooldown = Math.max(0, this.pickupFullCooldown - dt);

    const px = this.player.x;
    const py = this.player.y;
    // Rayon de ramassage généreux : il suffit d'être « sur » la tuile
    // de l'objet pour le récupérer, même sans être pile au centre.
    const PICKUP_SQ = 28 * 28;
    const friction = 1 - Math.min(1, dt * 4.2);
    const gravity = 480 * dt;
    const MERGE_SQ = 22 * 22;

    // Grille spatiale (un seau par tuile) pour la fusion des piles :
    // deux piles qui fusionnent sont à moins de 22 px l'une de l'autre,
    // donc toujours dans des tuiles voisines. La recherche de candidats
    // devient O(n) au lieu d'être quadratique — important après un grand
    // défrichage, quand des dizaines de piles jonchent le sol.
    const grid = this.mergeGrid;
    grid.clear();
    let anyGone = false;
    for (let i = 0; i < items.length; i++) {
      const d = items[i];
      d.ord = i; // rang initial : reproduit l'ordre de fusion d'origine
      const key = (((d.y / TILE) | 0) + 1024) * 4096 + (((d.x / TILE) | 0) + 1024);
      const bucket = grid.get(key);
      if (bucket) bucket.push(d);
      else grid.set(key, [d]);
    }

    for (let n = items.length - 1; n >= 0; n--) {
      const d = items[n];

      // léger élan au lâcher, amorti par friction + petit rebond
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vx *= friction;
      d.vy *= friction;
      if (d.hop > 0 || d.hopV !== 0) {
        d.hopV -= gravity;
        d.hop += d.hopV * dt;
        if (d.hop < 0) {
          d.hop = 0;
          d.hopV *= -0.36;
          if (Math.abs(d.hopV) < 22) d.hopV = 0;
        }
      }

      // Disparition après quelques minutes (comme Minecraft).
      d.life -= dt;
      if (d.life <= 0) {
        d.gone = true;
        anyGone = true;
        continue;
      }

      const dx = px - d.x;
      const dy = py - d.y;
      const distSq = dx * dx + dy * dy;

      // Ramassage direct dès qu'on marche dessus.
      // Délai anti-ramassage instantané après un lâcher (Q en AZERTY).
      if (distSq < PICKUP_SQ && (this.time - d.born) >= PICKUP_DELAY) {
        const added = this.inventory.add(d.id, d.count);
        if (added >= d.count) {
          d.gone = true;
          anyGone = true;
          // Partagé : les autres joueurs de la zone doivent voir l'objet
          // disparaître, sinon il resterait ramassable chez eux.
          if (d.netId) this._announceDropTaken(d.netId);
        } else {
          d.count -= added;
          if (added === 0 && this.pickupFullCooldown <= 0) {
            this.notify('Inventaire plein.');
            this.pickupFullCooldown = 1.6;
          }
        }
        continue;
      }

      // Les piles proches de même type fusionnent (une seule pile au sol).
      // On ne teste que les seaux des 9 tuiles voisines (grille spatiale)
      // et l'on choisit, comme dans la version d'origine, la pile valide
      // la plus récente (ord le plus grand, strictement avant n).
      if (d.count < 64 && items.length < MAX_DROPS) {
        const ctx0 = ((d.x / TILE) | 0) + 1024;
        const cty0 = ((d.y / TILE) | 0) + 1024;
        let best = null;
        for (let gy = cty0 - 1; gy <= cty0 + 1; gy++) {
          for (let gx = ctx0 - 1; gx <= ctx0 + 1; gx++) {
            const bucket = grid.get(gy * 4096 + gx);
            if (!bucket) continue;
            for (let m = bucket.length - 1; m >= 0; m--) {
              const other = bucket[m];
              if (other === d || other.gone || other.ord >= n) continue;
              if (best && other.ord <= best.ord) continue;
              if (other.id !== d.id) continue;
              const ox = d.x - other.x;
              const oy = d.y - other.y;
              if (ox * ox + oy * oy > MERGE_SQ) continue;
              if (other.count <= 0) continue;
              best = other;
              break; // le seau est ordonné : le 1er valide est le plus récent
            }
          }
        }
        if (best) {
          const add = Math.min(64 - d.count, best.count);
          if (add > 0) {
            d.count += add;
            best.count -= add;
            if (best.count <= 0) {
              best.gone = true;
              anyGone = true;
            }
          }
        }
      }

      d.sortY = d.y;
    }

    // Compactage final en une passe (les retraits sont différés pour
    // garder des indices stables pendant toute la boucle).
    if (anyGone) {
      let w = 0;
      for (let r = 0; r < items.length; r++) {
        if (!items[r].gone) items[w++] = items[r];
      }
      items.length = w;
    }
  }

  // ------------------------------------------------------------
  //  Particules de casse (débris légers)
  //  Des petits carrés pixelisés projetés autour du bloc cassé,
  //  soumis à la gravité, qui s'estompent rapidement. Coût négligeable :
  //  quelques dizaines d'objets éphémères, un simple fillRect chacun.
  // ------------------------------------------------------------
  spawnBreakParticles(tx, ty, blockId) {
    if (!this._particlesEnabled()) return;
    if (this.particles.length > MAX_PARTICLES) return;
    const colors = BREAK_PARTICLE_COLORS[blockId]
      || [BLOCK_DEFS[blockId]?.color || '#cfcfcf'];
    const cx = tx * TILE + TILE / 2;
    const cy = ty * TILE + TILE / 2;
    const count = this.performanceMode ? 6 : 12;

    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 24 + Math.random() * 46;
      this.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 42,
        life: 1,
        decay: 2.2 + Math.random() * 1.8,
        size: 1 + Math.random() * 1.8,
        color: colors[(Math.random() * colors.length) | 0],
      });
    }
  }

  updateParticles(dt) {
    const particles = this.particles;
    if (particles.length === 0) return;
    const gravity = 260 * dt;

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= p.decay * dt;
      if (p.life <= 0) {
        // suppression O(1) sans allocation (swap-and-pop)
        particles[i] = particles[particles.length - 1];
        particles.pop();
        continue;
      }
      p.vy += gravity;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  drawParticles(ctx) {
    const particles = this.particles;
    const n = particles.length;
    if (n === 0) return;

    for (let i = 0; i < n; i++) {
      const p = particles[i];
      const s = p.size;
      const x = (p.x + 0.5) | 0;
      const y = (p.y + 0.5) | 0;
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.fillRect(x - s, y - s, s * 2, s * 2);
    }
    ctx.globalAlpha = 1;
  }

  placeSelectedBlock() {
    if (this.actionCooldown > 0 || !this.inReach) return;
    const selected = this.inventory.getSelectedStackRef();
    const item = selected?.id;
    if (!item || !ITEM_DEFS[item]?.place) return;
    if (this.isPlayerOnTile(this.targetTx, this.targetTy)) return;

    const i = this.world.idx(this.targetTx, this.targetTy);
    const oldBlock = this.world.blocks[i];
    const oldBlock2 = this.world.blocks2 ? this.world.blocks2[i] : null;
    const placed = this.world.placeBlock(this.targetTx, this.targetTy, item);
    if (placed) {
      this.reindexPlacedChunk(this.targetTx, this.targetTy);
      this.inventory.takeSlot(this.inventory.selectedSlotIndex(), 1);
      this.actionCooldown = 0.16;
      // Multijoueur (étape 2) : le bloc posé (couche 1 ou empilé en
      // couche 2) doit apparaître chez les autres joueurs de la zone.
      const diff = {};
      if (this.world.blocks[i] !== oldBlock) diff.blocks = this.world.blocks[i];
      if (this.world.blocks2 && this.world.blocks2[i] !== oldBlock2) diff.blocks2 = this.world.blocks2[i];
      if (Object.keys(diff).length > 0) this._announceBlockChange(this.targetTx, this.targetTy, diff);
      // Un panneau neuf appartient à celui qui le pose : il sera le seul
      // à pouvoir y écrire. Les autres devront le casser puis le reposer.
      if (item === 'sign') {
        const owner = this.uiCallbacks.getOwnerId ? this.uiCallbacks.getOwnerId() : -1;
        this.signData.set(i, { text: '', owner });
        this._announceSignChange(this.targetTx, this.targetTy, '', owner);
      }
      // Un étal neuf : propriétaire = poseur, stock vide, prix à définir.
      if (ITEM_DEFS[item]?.place?.startsWith('seller')) {
        const entry = this.getSellerEntry(this.targetTx, this.targetTy, true);
        if (this.uiCallbacks.onSellerChange) {
          this.uiCallbacks.onSellerChange(this.targetTx, this.targetTy, entry);
        }
      }
    }
  }

  isPlayerOnTile(tx, ty) {
    return Math.floor(this.player.x / TILE) === tx && Math.floor(this.player.y / TILE) === ty;
  }

  // ------------------------------------------------------------
  //  Monde partagé (multijoueur, étape 2)
  // ------------------------------------------------------------

  // LE JOUEUR LOCAL vient de modifier une tuile (casse, pose, porte) :
  // prévient le client réseau (js/main.js branche ce callback), qui se
  // charge de choisir la bonne zone et le bon débit. Ne fait jamais
  // planter le jeu solo : `onBlockChange` est null tant que js/main.js
  // ne l'a pas branché (ou si le réseau n'a jamais pu se connecter).
  _announceBlockChange(tx, ty, diff) {
    if (this.uiCallbacks.onBlockChange) this.uiCallbacks.onBlockChange(tx, ty, diff);
  }

  // Panneau posé / écrit (text) ou cassé (text === null) : relais réseau.
  _announceSignChange(tx, ty, text, owner) {
    if (this.uiCallbacks.onSignChange) this.uiCallbacks.onSignChange(tx, ty, text, owner);
  }

  // Étal cassé : state null purge le journal serveur.
  _announceSellerBreak(tx, ty) {
    if (this.uiCallbacks.onSellerChange) this.uiCallbacks.onSellerChange(tx, ty, null);
  }

  // Le joueur local écrit sur SON panneau (UI) : met à jour l'état local
  // puis annonce aux autres joueurs de la zone.
  setSignText(tx, ty, text) {
    const i = this.world.idx(tx, ty);
    const entry = this.signData.get(i);
    if (!entry) return;
    entry.text = String(text ?? '').slice(0, 120);
    this._announceSignChange(tx, ty, entry.text, entry.owner);
  }

  // Même principe pour le contenu d'un coffre (étape 3) : appelé
  // directement quand un coffre est cassé (voir mineTarget) — le
  // ChestPanel appelle lui-même onChestChange pendant qu'il est ouvert
  // (voir js/ui.js), donc cette méthode ne sert qu'aux cas où AUCUN
  // panneau n'est ouvert au moment du changement.
  _announceChestChange(tx, ty, slots) {
    if (this.uiCallbacks.onChestChange) this.uiCallbacks.onChestChange(tx, ty, slots);
  }

  // Même principe pour l'état d'un four (étape 4) : appelé directement
  // quand un four est cassé (voir mineTarget) — le FurnacePanel appelle
  // lui-même onFurnaceChange pendant qu'il est ouvert ou tant qu'il
  // brûle (voir js/ui.js), donc cette méthode ne sert qu'aux cas où
  // AUCUN panneau n'est ouvert au moment du changement.
  _announceFurnaceChange(tx, ty, entry) {
    if (this.uiCallbacks.onFurnaceChange) {
      this.uiCallbacks.onFurnaceChange(tx, ty, {
        input: entry.input[0], fuel: entry.fuel[0], output: entry.output[0],
        progress: entry.progress, fuelTime: entry.fuelTime, maxFuelTime: entry.maxFuelTime,
      });
    }
  }

  // Un AUTRE joueur a modifié une tuile de la zone actuelle (appelé par
  // js/main.js quand le client réseau reçoit un message 'block' ou
  // 'worldSync'). On rejoue le diff sur le bon monde SANS refaire la
  // mise en scène locale (pas de drop, pas de particules, pas d'usure
  // d'outil : ce sont des évènements qui appartiennent à celui qui a
  // agi, pas à nous) — seuls les index de rendu doivent suivre.
  //
  // `world` est explicite (pas forcément `this.world`) : une
  // resynchronisation peut arriver pour une zone que le joueur local
  // n'occupe plus activement (ex. un niveau de grotte déjà visité et
  // gardé en mémoire dans `this.caveLevels`), auquel cas on met à jour
  // les données mais on saute la reconstruction des index de rendu
  // (inutile tant qu'on n'y est pas, et potentiellement coûteux).
  applyRemoteBlockDiff(world, tx, ty, diff) {
    if (!world) return;
    // La couche 1 (`blocks`) est celle qui porte les coffres : que le
    // diff casse un coffre existant ou pose un nouveau bloc (forcément
    // vide, un coffre fraîchement posé n'a jamais de contenu), toute
    // ancienne entrée de coffre locale à cette tuile devient obsolète.
    // Fait AVANT le early-return sur `changed` : un diff dont seule
    // cette clé est présente mais dont la valeur est déjà identique
    // (rare) ne doit de toute façon rien nettoyer d'autre.
    if (Object.prototype.hasOwnProperty.call(diff, 'blocks')) {
      const map = this.chestDataMapForZone(world.id);
      if (map) map.delete(world.idx(tx, ty));
      const furnaceMap = this.furnaceDataMapForZone(world.id);
      if (furnaceMap) furnaceMap.delete(world.idx(tx, ty));
      const signMap = this.signDataMapForZone(world.id);
      if (signMap) signMap.delete(world.idx(tx, ty));
      const sellerMap = this.sellerDataMapForZone(world.id);
      if (sellerMap) sellerMap.delete(world.idx(tx, ty));
    }
    if (!world.applyBlockDiff(tx, ty, diff)) return;
    if (world !== this.world) return; // zone pas affichée : rien d'autre à faire pour l'instant
    if (Object.prototype.hasOwnProperty.call(diff, 'blocks')
      || Object.prototype.hasOwnProperty.call(diff, 'blocks2')) {
      // Un arbre/rocher/minerai (kind 'object') cassé à distance doit
      // sortir de l'index des objets statiques — la pose ne concerne
      // elle que des blocs 'block'/'door', jamais des objets naturels
      // (placeBlock ne pose que ce type), donc removeStaticObjectAt
      // suffit : pas besoin d'un rebuildStaticObjects complet.
      if (this.staticObjectMap.has(world.idx(tx, ty))) this.removeStaticObjectAt(tx, ty);
      this.reindexPlacedChunk(tx, ty);
    }
    if (Object.prototype.hasOwnProperty.call(diff, 'floor')) {
      this.invalidateFloorChunk(tx, ty);
    }
  }

  // Retrouve (sans le créer) le monde correspondant à une zone réseau
  // ('surface' ou 'cave:<profondeur>'), pour appliquer un diff distant
  // même si le joueur local ne s'y trouve pas actuellement.
  worldForZone(zone) {
    if (zone === 'surface') return this.surfaceWorld;
    const m = /^cave:(\d+)$/.exec(zone);
    if (!m) return null;
    const depth = Number(m[1]);
    return (this.caveLevels && this.caveLevels.get(depth)) || null;
  }

  // ------------------------------------------------------------
  //  Coffres partagés (multijoueur, étape 3)
  // ------------------------------------------------------------

  // Retrouve (sans le créer) la table `chestData` d'une zone réseau :
  // celle du monde actif (`this.chestData`), ou celle mise de côté pour
  // un monde déjà visité puis quitté (voir _saveDimState/_restoreDimState).
  // Contrairement aux blocs (qui vivent dans World.js), les coffres ne
  // sont donc rattrapables que si le joueur local a DÉJÀ mis les pieds
  // dans cette zone au moins une fois — cohérent avec worldForZone.
  chestDataMapForZone(zone) {
    if (this.world && zone === this.world.id) return this.chestData;
    const saved = this.dimStates.get(zone);
    return saved ? saved.chestData : null;
  }

  // Un AUTRE joueur a rangé/pioché un objet dans un coffre de la zone
  // actuelle. `slots` est un tableau de 27 cases déjà nettoyé par
  // sanitizeChestSlots (voir js/net-protocol.js). On mute l'entrée EN
  // PLACE (jamais en remplaçant le tableau) : si le panneau du coffre
  // est ouvert localement au même instant (deux joueurs dans le même
  // coffre), le SlotManager garde une référence directe vers ce même
  // tableau — le remplacer romprait ce lien sans qu'on le sache.
  applyRemoteChestChange(zone, tx, ty, slots) {
    const map = this.chestDataMapForZone(zone);
    if (!map) return; // zone jamais visitée localement : rien à raccrocher
    const entry = this._chestEntryIn(map, tx, ty);
    for (let i = 0; i < 27; i++) entry.slots[i] = slots[i] || null;
  }

  // ------------------------------------------------------------
  //  Fours partagés (multijoueur, étape 4)
  // ------------------------------------------------------------

  // Même principe que chestDataMapForZone, pour la table `furnaceData`.
  furnaceDataMapForZone(zone) {
    if (this.world && zone === this.world.id) return this.furnaceData;
    const saved = this.dimStates.get(zone);
    return saved ? saved.furnaceData : null;
  }

  // Les trois panneaux du port font partie du décor : on les sème au
  // démarrage, avec owner = -1 (personne ne peut les réécrire — il faut
  // les casser). Un texte déjà enregistré n'est jamais écrasé.
  seedPortSigns() {
    if (this.world.kind !== 'surface') return;
    // Chaque île a sa propre signalétique (port d'Avania / Fortune City).
    const signs = this.world.id === 'fortune' ? FORTUNE_SIGNS : PORT_SIGNS;
    for (const s of signs) {
      if (!this.world.inBounds(s.tx, s.ty)) continue;
      const i = this.world.idx(s.tx, s.ty);
      if (this.world.blocks[i] !== 'sign') continue;
      if (this.signData.has(i)) continue;
      this.signData.set(i, { text: s.text, owner: -1 });
    }
  }

  signDataMapForZone(zone) {
    if (this.world && zone === this.world.id) return this.signData;
    const saved = this.dimStates.get(zone);
    return saved ? (saved.signData || null) : null;
  }

  // Un AUTRE joueur a posé / écrit / cassé un panneau de la zone actuelle.
  // text === null : le panneau n'existe plus (cassé).
  applyRemoteSignChange(zone, tx, ty, text, owner) {
    const map = this.signDataMapForZone(zone);
    if (!map) return; // zone jamais visitée localement : rien à raccrocher
    const key = ty * WORLD_W + tx;
    if (text === null) {
      map.delete(key);
      return;
    }
    map.set(key, { text, owner });
  }

  sellerDataMapForZone(zone) {
    if (this.world && zone === this.world.id) return this.sellerData;
    const saved = this.dimStates.get(zone);
    return saved ? (saved.sellerData || null) : null;
  }

  // Un AUTRE joueur a posé / modifié / cassé un étal de la zone actuelle.
  applyRemoteSellerChange(zone, tx, ty, state) {
    const map = this.sellerDataMapForZone(zone);
    if (!map) return;
    const key = ty * WORLD_W + tx;
    if (state === null) {
      map.delete(key);
    } else {
      state._placeholder = false;
      map.set(key, state);
    }
    this._notifySellerUpdated(tx, ty);
  }

  // Resynchronisation complète des étals d'une zone (connexion/arrivée).
  applySellerSync(zone, sellers) {
    const map = this.sellerDataMapForZone(zone);
    if (!map) return;
    map.clear();
    for (const s of sellers) {
      if (!s || typeof s.tx !== 'number' || typeof s.ty !== 'number') continue;
      if (s.state) s.state._placeholder = false;
      map.set(s.ty * WORLD_W + s.tx, s.state);
    }
  }

  // Le panneau d'étal ouvert se réaffiche tout seul quand l'offre d'un
  // autre joueur arrive (dépôt, prix, achat) : l'acheteur voit l'offre
  // devenir cliquable sans devoir fermer/rouvrir.
  _notifySellerUpdated(tx, ty) {
    const cb = this.uiCallbacks && this.uiCallbacks.onSellerUpdated;
    if (cb) {
      try { cb(tx, ty); } catch { /* un UI cassé ne gèle pas le réseau */ }
    }
  }

  // Entrée locale d'un étal (créée à la pose ou à la première ouverture).
  // create=true => le joueur local vient de POSER le bloc : il en est le
  // propriétaire. En lecture seule (create absent), un étal encore
  // inconnu localement est un étal D'AUTRUI pas encore synchronisé : on
  // renvoie une coquille en lecture seule propriétaire = personne, pour
  // qu'un acheteur ne puisse pas se déclarer propriétaire en l'ouvrant
  // (sinon il voyait les boutons « Déposer / Prix » au lieu de
  // « Acheter » — et pire, il pouvait vider l'étal).
  getSellerEntry(tx, ty, create = false) {
    const i = this.world.idx(tx, ty);
    let entry = this.sellerData.get(i);
    if (!entry) {
      const block = this.world.blocks[i];
      const tier = BLOCK_DEFS[block]?.sellerTier || 1;
      const me = this.uiCallbacks.getOwnerId ? this.uiCallbacks.getOwnerId() : -1;
      entry = {
        tier,
        owner: create ? me : -2,
        item: null, stock: 0, price: 0, till: 0,
        _placeholder: !create,
      };
      // On n'enregistre que les vrais étals (ceux qu'on possède) : la
      // coquille d'autrui ne doit pas polluer le journal local ni être
      // rediffusée comme si on en était le vendeur.
      if (create) this.sellerData.set(i, entry);
    }
    return entry;
  }

  // Modifie un étal local puis annonce l'état complet à la zone.
  updateSeller(tx, ty, mutate) {
    const i = this.world.idx(tx, ty);
    // Un étal inconnu localement (jamais reçu du serveur, pas posé par
    // nous) n'a PAS d'entrée dans le journal : on ne fabrique surtout
    // pas une coquille qu'on diffuserait — elle écraserait l'état réel
    // du vendeur chez tous les joueurs. getSellerEntry(..., create=true)
    // est réservé à la pose par le joueur local.
    const entry = this.sellerData.get(i);
    if (!entry) return null;
    mutate(entry);
    entry.stock = Math.max(0, Math.min(9999, entry.stock | 0));
    entry.price = Math.max(0, Math.min(99999, entry.price | 0));
    entry.till = Math.max(0, Math.min(99999, entry.till | 0));
    if (this.uiCallbacks.onSellerChange) this.uiCallbacks.onSellerChange(tx, ty, entry);
    return entry;
  }

  // Verrous de vol (côté voleur) : « s:owner:idx » = cet étal, « o:owner »
  // = tous les étals de ce propriétaire.
  stealLockUntil(owner, idx) {
    return Math.max(this.stealLocks.get(`s:${owner}:${idx}`) || 0, this.stealLocks.get(`o:${owner}`) || 0);
  }

  applyStealFailure(owner, idx, tier) {
    const cfg = SELLER_TIERS[tier] || SELLER_TIERS[1];
    if (cfg.lockThis) this.stealLocks.set(`s:${owner}:${idx}`, this.time + cfg.lockThis);
    if (cfg.lockAll) this.stealLocks.set(`o:${owner}`, this.time + cfg.lockAll);
  }

  // Résultat du mini-jeu de vol d'un étal (côté voleur).
  //  succès : 1 objet passe dans l'inventaire du voleur, stock -1 ;
  //  échec  : verrous selon le niveau, et le propriétaire est prévenu
  //           (niv. 2) ou alarmé + proposition de téléport (niv. 3).
  reportStealResult(tx, ty, success) {
    const i = this.world.idx(tx, ty);
    const entry = this.sellerData.get(i);
    if (!entry) return;
    const cfg = SELLER_TIERS[entry.tier] || SELLER_TIERS[1];
    if (success) {
      if (!entry.item || entry.stock <= 0) return;
      const added = this.inventory.add(entry.item, 1);
      if (added <= 0) { this.notify('Inventaire plein : rien de volé.'); return; }
      this.updateSeller(tx, ty, (e) => { e.stock -= 1; });
      this.notify(`Vol réussi : +1 ${ITEM_DEFS[entry.item]?.label || entry.item}.`);
      return;
    }
    this.applyStealFailure(entry.owner, i, entry.tier);
    this.notify(cfg.lockAll
      ? `Raté ! Vol impossible chez ce propriétaire pendant ${cfg.lockAll} s.`
      : 'Raté ! 30 s d\'attente sur cet étal.');
    if (cfg.notify && this.uiCallbacks.onNotifySend) {
      this.uiCallbacks.onNotifySend(
        entry.owner,
        cfg.alarm ? 'alarm' : 'theft',
        'Un joueur a tenté de voler un de vos sellers.',
        { zone: this.world.id, tx, ty },
      );
    }
  }

  // Resynchronisation complète des panneaux d'une zone (connexion/arrivée).
  applySignSync(zone, signs) {
    const map = this.signDataMapForZone(zone);
    if (!map) return;
    map.clear();
    for (const s of signs) {
      if (!s || typeof s.tx !== 'number' || typeof s.ty !== 'number') continue;
      map.set(s.ty * WORLD_W + s.tx, { text: String(s.text ?? ''), owner: Number(s.owner) });
    }
  }

  // Un AUTRE joueur a modifié un four de la zone actuelle (contenu, ou
  // juste avancement de la cuisson — voir js/ui.js FurnacePanel pour le
  // rythme d'émission). `state` est déjà nettoyé par
  // sanitizeFurnaceState (voir js/net-protocol.js). On mute l'entrée EN
  // PLACE (jamais en remplaçant les tableaux input/fuel/output) : si le
  // panneau du four est ouvert localement au même instant, le
  // SlotManager garde une référence directe vers ces mêmes tableaux —
  // les remplacer romprait ce lien sans qu'on le sache.
  applyRemoteFurnaceChange(zone, tx, ty, state) {
    const map = this.furnaceDataMapForZone(zone);
    if (!map) return; // zone jamais visitée localement : rien à raccrocher
    const key = ty * WORLD_W + tx;
    let entry = map.get(key);
    if (!entry) {
      entry = makeFurnaceEntry();
      map.set(key, entry);
    }
    entry.input[0] = state.input;
    entry.fuel[0] = state.fuel;
    entry.output[0] = state.output;
    entry.progress = state.progress;
    entry.fuelTime = state.fuelTime;
    entry.maxFuelTime = state.maxFuelTime;
  }

  // ------------------------------------------------------------
  //  Rendu
  // ------------------------------------------------------------
  render() {
    this.resizeView();
    const ctx = this.ctx;
    const cam = this.camera;
    const zoom = cam.zoom;
    const W = this.viewW;
    const H = this.viewH;

    // Cinématique de traversée : elle occupe tout l'écran, le monde
    // n'est pas rendu du tout (le joueur est en mer, pas sur l'île).
    if (this.crossing.running) {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      this.crossing.draw(ctx, W, H);
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    // Fond « océan » hors-monde. Quand la vue est entièrement à
    // l'intérieur du monde (le cas courant), les chunks de sol opaques
    // couvrent déjà chaque pixel de l'écran : on saute alors ce grand
    // remplissage plein écran, ce qui économise environ un tiers du
    // fill-rate à chaque frame. Au bord de la carte, il reste requis.
    const worldPxW = WORLD_W * TILE;
    const worldPxH = WORLD_H * TILE;
    const fullyInside = cam.x >= 1 && cam.y >= 1
      && cam.x + W / zoom <= worldPxW - 1
      && cam.y + H / zoom <= worldPxH - 1;
    if (!fullyInside) {
      ctx.fillStyle = '#2f76b2'; // hors-monde (eau)
      ctx.fillRect(0, 0, W, H);
    }

    ctx.translate(-cam.x * zoom, -cam.y * zoom);
    ctx.scale(zoom, zoom);

    const viewL = Math.floor(cam.x / TILE) - 2;
    const viewT = Math.floor(cam.y / TILE) - 3;
    const viewR = Math.ceil((cam.x + W / zoom) / TILE) + 2;
    const viewB = Math.ceil((cam.y + H / zoom) / TILE) + 1;
    const minTx = Math.max(0, viewL);
    const minTy = Math.max(0, viewT);
    const maxTx = Math.min(WORLD_W - 1, viewR);
    const maxTy = Math.min(WORLD_H - 1, viewB);

    // 1) sols par chunks
    this.drawFloorChunks(ctx, viewL, viewT, viewR, viewB);

    // 1b) ombres portées des blocs posés, sous TOUT le reste (tri inclus)
    this.drawPlacedShadows(ctx, minTx, minTy, maxTx, maxTy);

    // 2) objets (arbres, rochers, blocs posés, portes, fours) + joueurs, triés par profondeur
    this.drawDepthSorted(ctx, minTx, minTy, maxTx, maxTy);

    // 3) surbrillance de la tuile ciblée
    this.drawTargetHighlight(ctx, zoom);

    // 4) fissures de minage par-dessus la ressource ciblée, comme dans Minecraft
    this.drawMiningCracks(ctx);

    // 5) débris de casse par-dessus le tout
    this.drawParticles(ctx);

    ctx.restore();

    // 6) obscurité souterraine (voile + halo autour du joueur)
    if (this.world.kind === 'cave') this.drawCaveDarkness(ctx, W, H);
    // 6b) cycle jour/nuit : voile nocturne percé par le joueur et les fours.
    else this.drawNight(ctx, W, H);

    // 7) vignette d'ambiance. Cachée en mode performance ou si le joueur
    // l'a désactivée dans les paramètres. Pré-rendue sinon.
    if (!this.performanceMode && this._vignetteOn()) {
      ctx.drawImage(this.getVignette(W, H), 0, 0, W, H);
    }
  }

  drawFloorChunks(ctx, viewL, viewT, viewR, viewB) {
    const ct = this.chunkTiles;
    const chunkL = Math.max(0, Math.floor(viewL / ct));
    const chunkT = Math.max(0, Math.floor(viewT / ct));
    const chunkR = Math.min(Math.ceil(WORLD_W / ct) - 1, Math.floor(viewR / ct));
    const chunkB = Math.min(Math.ceil(WORLD_H / ct) - 1, Math.floor(viewB / ct));

    // Surface de l'eau animée : les tuiles d'eau (indexées par chunk)
    // sont redessinées avec la frame courante par-dessus le chunk figé.
    // Hors des berges il n'y a aucune eau : le surcoût est nul.
    const waterFrame = Math.floor(this.time * 2.5) % WATER_FRAMES;
    const waterImg = getWaterFrame(waterFrame);

    for (let cy = chunkT; cy <= chunkB; cy++) {
      for (let cx = chunkL; cx <= chunkR; cx++) {
        const chunk = this.getFloorChunk(cx, cy);
        ctx.drawImage(chunk, cx * ct * TILE, cy * ct * TILE);

        const water = this.waterTilesByChunk.get(cy * 256 + cx);
        if (water) {
          for (let k = 0; k < water.length; k++) {
            const i = water[k];
            ctx.drawImage(waterImg, (i % WORLD_W) * TILE, ((i / WORLD_W) | 0) * TILE);
          }
        }
      }
    }
  }

  floorChunkKey(cx, cy) {
    return cy * 64 + cx; // clé numérique : aucune chaîne par frame
  }

  invalidateFloorChunk(tx, ty) {
    const cx = Math.floor(tx / this.chunkTiles);
    const cy = Math.floor(ty / this.chunkTiles);
    // Reconstruit tout de suite le chunk modifié (creuser un sable/terre) :
    // un seul chunk (~256 drawImage, négligeable) évite une micro-saccade
    // sur la frame qui suit l'action.
    this.floorChunkCache.delete(this.floorChunkKey(cx, cy));
    this.buildFloorChunk(cx, cy);
  }

  // Pré-construit (met en cache) les chunks de sol de la zone autour de la
  // caméra qui ne le sont pas encore, en respectant un budget de temps par
  // frame. C'est LA clé de la fluidité au déplacement : auparavant, chaque
  // chunk était rasterisé à la volée dans drawFloorChunks (16×16 = 256
  // drawImage d'un seul coup), et quand plusieurs chunks entraient ensemble
  // dans la vue en marchant, la frame explosait → saccade.
  //
  // Ici on construit les chunks avec un anneau d'avance, étalé sur plusieurs
  // frames : quand un chunk défile à l'écran, il est en cache depuis
  // longtemps, le rendu ne fait plus qu'un drawImage très léger.
  prewarmFloorChunks(maxMs) {
    const ct = this.chunkTiles;
    const cam = this.camera;
    const zoom = cam.zoom;
    const chunkPx = ct * TILE; // côté d'un chunk en pixels monde
    const margin = 1; // un anneau de chunks construits en avance
    const chunkL = Math.max(0, Math.floor(cam.x / chunkPx) - margin);
    const chunkT = Math.max(0, Math.floor(cam.y / chunkPx) - margin);
    const chunkR = Math.min(Math.ceil(WORLD_W / ct) - 1,
      Math.floor((cam.x + this.viewW / zoom) / chunkPx) + margin);
    const chunkB = Math.min(Math.ceil(WORLD_H / ct) - 1,
      Math.floor((cam.y + this.viewH / zoom) / chunkPx) + margin);

    // Sortie anticipée : si la fenêtre de chunks visée est exactement la
    // même qu'au passage précédent (joueur immobile, zoom inchangé) et que
    // tout était déjà en cache, il n'y a rien à faire. Sans ça, chaque
    // frame immobile payait ~20 recherches dans la Map pour rien.
    const rectKey = chunkT * 1048576 + chunkB * 4096 + chunkL * 64 + chunkR;
    if (maxMs !== Infinity && rectKey === this._prewarmRectKey) return;

    const cache = this.floorChunkCache;
    const deadline = performance.now() + maxMs; // Infinity au démarrage
    for (let cy = chunkT; cy <= chunkB; cy++) {
      const rowBase = cy * 64;
      for (let cx = chunkL; cx <= chunkR; cx++) {
        if (cache.has(rowBase + cx)) continue; // déjà en cache : gratuit
        this.buildFloorChunk(cx, cy);
        // Budget écoulé ? On remettra le reste à la frame suivante : on ne
        // mémorise PAS la fenêtre, sinon le reste ne serait jamais construit.
        if (performance.now() >= deadline) return;
      }
    }
    this._prewarmRectKey = rectKey;
  }

  buildFloorChunk(cx, cy) {
    const key = cy * 64 + cx;
    const ct = this.chunkTiles;
    const startTx = cx * ct;
    const startTy = cy * ct;
    const tilesW = Math.min(ct, WORLD_W - startTx);
    const tilesH = Math.min(ct, WORLD_H - startTy);
    const c = makeCanvas(tilesW * TILE, tilesH * TILE);
    const cctx = c.getContext('2d');
    cctx.imageSmoothingEnabled = false;

    // Le sol est très cohérent (longues plages d'herbe identique) : on
    // mémorise la dernière tuile résolue pour éviter 256 recherches dans
    // le cache du tileset par chunk.
    const floor = this.world.floor;
    const waterImg = getWaterFrame(0);
    let lastFloorId = null;
    let lastImg = null;
    for (let y = 0; y < tilesH; y++) {
      const rowBase = (startTy + y) * WORLD_W + startTx;
      for (let x = 0; x < tilesW; x++) {
        const f = floor[rowBase + x];
        let img;
        if (f === lastFloorId) {
          img = lastImg;
        } else {
          img = f === 'water' ? waterImg : getTileCanvas(f);
          lastFloorId = f;
          lastImg = img;
        }
        cctx.drawImage(img, x * TILE, y * TILE);
      }
    }

    this.floorChunkCache.set(key, c);
    return c;
  }

  getFloorChunk(cx, cy) {
    const key = cy * 64 + cx;
    const cached = this.floorChunkCache.get(key);
    // Les chunks sont normalement déjà en cache (pré-construits). Ce chemin
    // paresseux ne sert quasiment plus que de filet de sécurité.
    return cached || this.buildFloorChunk(cx, cy);
  }

  // Positions monde (px) des torches posées, via l'index spatial des blocs
  // posés : sert à percer le voile de nuit et à éclairer la grotte.
  _torchPositions() {
    const out = [];
    const blocks = this.world.blocks;
    for (const list of this.placedByChunk.values()) {
      for (let k = 0; k < list.length; k++) {
        const i = list[k];
        if (blocks[i] !== 'torch') continue;
        const tx = i % WORLD_W;
        const ty = (i / WORLD_W) | 0;
        out.push(tx * TILE + TILE / 2, ty * TILE + TILE / 2 - 6);
      }
    }
    return out;
  }

  // Torche posée : sprite bois/charbon + flamme animée qui vacille.
  // La phase dépend de la position pour que deux torches ne battent pas
  // la mesure ensemble.
  drawTorch(ctx, tx, ty) {
    const spr = getObjectSprite('torch');
    const bx = tx * TILE + TILE / 2;
    const by = ty * TILE + TILE - 2;
    if (spr) ctx.drawImage(spr.canvas, bx - spr.anchorX, by - spr.anchorY);
    const fx = bx;
    const fy = by - 19;
    const fl = 0.75 + Math.sin(this.time * 9 + tx * 7 + ty * 13) * 0.25;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const r = 9 + 3 * fl;
    const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, r);
    g.addColorStop(0, 'rgba(255,190,90,0.55)');
    g.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(fx, fy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Cœur de flamme.
    ctx.fillStyle = '#e8632c';
    ctx.fillRect(fx - 2, fy - 4 - fl * 2, 4, 6);
    ctx.fillStyle = '#f7a13c';
    ctx.fillRect(fx - 1.5, fy - 3 - fl * 2, 3, 4);
    ctx.fillStyle = '#ffd979';
    ctx.fillRect(fx - 0.5, fy - 2 - fl * 2, 2, 2);
  }

  // Panneau posé : sprite bois + texte du propriétaire, découpé en trois
  // lignes courtes qui tiennent dans la planche.
  drawSign(ctx, tx, ty) {
    const spr = getObjectSprite('sign');
    const bx = tx * TILE + TILE / 2;
    const by = ty * TILE + TILE - 2;
    if (spr) ctx.drawImage(spr.canvas, bx - spr.anchorX, by - spr.anchorY);
    const entry = this.signData.get(this.world.idx(tx, ty));
    const text = entry ? entry.text : '';
    if (!text) return;
    // Zone utile de la planche (voir drawSignRaw dans js/tileset.js).
    const left = bx - 12;
    const top = by - 24;
    ctx.save();
    ctx.font = '4px monospace';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#4a2f14';
    const lines = [];
    for (let k = 0; k < text.length && lines.length < 3; k += 11) {
      lines.push(text.slice(k, k + 11));
    }
    for (let l = 0; l < lines.length; l++) {
      ctx.fillText(lines[l], left, top + l * 4);
    }
    ctx.restore();
  }

  // Étiquette flottante au-dessus d'un étal : l'offre est visible et
  // lisible DANS LE MONDE, sans ouvrir le panneau — un marchand qui a
  // déposé des objets et fixé un prix signale son offre de loin ; un étal
  // vide n'affiche rien (pas de fausse promesse d'achat).
  drawSellerLabel(ctx, tx, ty) {
    const entry = this.sellerData.get(this.world.idx(tx, ty));
    if (!entry || !entry.item || entry.stock <= 0) return;
    const def = ITEM_DEFS[entry.item];
    const label = def ? def.label : String(entry.item);
    // Un prix de 0 = le vendeur n'a rien fixé : on n'annonce pas d'offre.
    const price = entry.price > 0 ? `${entry.price} é` : 'prix ?';
    const cx = tx * TILE + TILE / 2;
    const by = ty * TILE;
    ctx.save();
    ctx.font = 'bold 7px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const nameW = ctx.measureText(label).width;
    const priceW = ctx.measureText(price).width;
    const w = Math.max(nameW, priceW) + 8;
    const h = 17;
    const top = by - 30;
    // Pastille fond foncé + liseré clair, façon étiquette de prix.
    ctx.fillStyle = 'rgba(30,22,10,0.85)';
    ctx.strokeStyle = 'rgba(240,214,150,0.9)';
    ctx.lineWidth = 1;
    const rx = cx - w / 2;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(rx, top, w, h, 3);
    } else {
      ctx.rect(rx, top, w, h);
    }
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f3e2b8';
    ctx.fillText(label.length > 16 ? label.slice(0, 15) + '…' : label, cx, top + 8);
    ctx.fillStyle = entry.price > 0 ? '#ffd36b' : '#c9b489';
    ctx.fillText(price, cx, top + 16);
    // Petit fanion pointant l'étal.
    ctx.fillStyle = 'rgba(30,22,10,0.85)';
    ctx.beginPath();
    ctx.moveTo(cx - 2, top + h);
    ctx.lineTo(cx + 2, top + h);
    ctx.lineTo(cx, top + h + 3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Ombres portées directionnelles (lumière venant du nord-ouest) : chaque
  // bloc solide posé projette une pénombre au sol vers le sud-est. Passe
  // dédiée AVANT le tri en profondeur, pour que toutes les ombres restent
  // sous les sprites (un mur ne vient jamais mordre l'ombre de son voisin).
  drawPlacedShadows(ctx, minTx, minTy, maxTx, maxTy) {
    if (this._gfx() === 'low') return; // niveau Faible : pas d'ombres portées
    const ct = this.chunkTiles;
    const blocks = this.world.blocks;
    const chunkT = Math.floor(minTy / ct);
    const chunkB = Math.floor(maxTy / ct);
    const chunkL = Math.floor(minTx / ct);
    const chunkR = Math.floor(maxTx / ct);
    ctx.fillStyle = 'rgba(8,10,18,0.16)';
    for (let cy = chunkT; cy <= chunkB; cy++) {
      const rowBase = cy * 256;
      for (let cx = chunkL; cx <= chunkR; cx++) {
        const list = this.placedByChunk.get(rowBase + cx);
        if (!list) continue;
        for (let k = 0; k < list.length; k++) {
          const i = list[k];
          const def = BLOCK_DEFS[blocks[i]];
          if (!def || !def.solid) continue;
          const tx = i % WORLD_W;
          const ty = (i / WORLD_W) | 0;
          if (tx < minTx || tx > maxTx || ty < minTy || ty > maxTy) continue;
          // Bande au sud + bande à l'est : l'ombre « tombe » en bas à droite.
          ctx.fillRect(tx * TILE + 3, (ty + 1) * TILE - 3, TILE - 3, 5);
          ctx.fillRect((tx + 1) * TILE - 3, ty * TILE + 4, 5, TILE - 4);
        }
      }
    }
  }

  // Contour de la tuile ciblée : le trait lumineux et son halo (flou)
  // sont pré-rendus une fois en sprite, puis pulsés via globalAlpha.
  // Plus de shadowBlur ni de roundRect recalculés à chaque frame — le
  // résultat est strictement le même dessin, mis en cache.
  getHighlightSprite(canAct, glow, scaleQ) {
    const key = (canAct ? 1 : 0) | (glow ? 2 : 0) | (scaleQ << 2);
    let sprite = this.highlightCache.get(key);
    if (sprite) return sprite;

    const pad = glow ? 12 : 4; // marge englobant le halo (en px écran)
    const size = (TILE - 2) * scaleQ + pad * 2;
    const c = makeCanvas(size, size);
    const hctx = c.getContext('2d');
    hctx.imageSmoothingEnabled = false;
    hctx.strokeStyle = canAct ? 'rgba(255,255,255,1)' : 'rgba(255,80,80,1)';
    hctx.lineWidth = 2.5;
    if (glow) {
      hctx.shadowColor = canAct ? 'rgba(255,255,255,0.55)' : 'rgba(255,80,80,0.55)';
      hctx.shadowBlur = 8;
    }
    const r = 6 * scaleQ;
    if (hctx.roundRect) {
      hctx.beginPath();
      hctx.roundRect(pad, pad, (TILE - 2) * scaleQ, (TILE - 2) * scaleQ, r);
      hctx.stroke();
    } else {
      hctx.strokeRect(pad, pad, (TILE - 2) * scaleQ, (TILE - 2) * scaleQ);
    }
    sprite = { canvas: c, padWorld: pad / scaleQ };
    this.highlightCache.set(key, sprite);
    return sprite;
  }

  drawTargetHighlight(ctx, zoom) {
    if (!this.inReach || !this.world.inBounds(this.targetTx, this.targetTy)) return;

    const i = this.world.idx(this.targetTx, this.targetTy);
    const hasBlock = this.world.blocks[i] !== null;
    const onWater = this.world.floor[i] === 'water';
    const diggable = this.world.isDiggable(this.targetTx, this.targetTy);
    const canAct = hasBlock || diggable || !onWater;
    const px = this.targetTx * TILE;
    const py = this.targetTy * TILE;

    // Remplissage translucide (alpha fixe, comme avant).
    ctx.fillStyle = canAct ? 'rgba(255,255,255,0.10)' : 'rgba(255,80,80,0.12)';
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(px + 1, py + 1, TILE - 2, TILE - 2, 6);
      ctx.fill();
    } else {
      ctx.fillRect(px + 1, py + 1, TILE - 2, TILE - 2);
    }

    // Contour + halo pulsant (sprite pré-rendu à la résolution écran).
    const alpha = this.performanceMode ? 0.82 : 0.72 + Math.sin(this.time * 6) * 0.12;
    const scaleQ = Math.max(1, Math.round(zoom));
    const sprite = this.getHighlightSprite(canAct, !this.performanceMode, scaleQ);
    ctx.save();
    ctx.globalAlpha = canAct ? alpha : 0.85;
    const size = TILE - 2 + sprite.padWorld * 2;
    ctx.drawImage(sprite.canvas, px + 1 - sprite.padWorld, py + 1 - sprite.padWorld, size, size);
    ctx.restore();
  }

  // Animation de fissures inspirée du minage Minecraft. Les stages sont
  // pré-rendus : à l'écran on ne fait qu'un drawImage très léger.
  drawMiningCracks(ctx) {
    if (
      this.mining.progress <= 0
      || this.mining.tx !== this.targetTx
      || this.mining.ty !== this.targetTy
    ) return;

    const stage = Math.min(
      MINING_CRACK_STAGES - 1,
      Math.floor(this.mining.progress * MINING_CRACK_STAGES),
    );

    // Arbre / rocher : on couvre l'ensemble du corps (sprite complet).
    // La clé de fissure est pré-calculée sur l'objet statique (pas de
    // gabarit de chaîne reconstruit à chaque frame de minage).
    const block = this.world.blockAt(this.targetTx, this.targetTy);
    if (block && BLOCK_DEFS[block]?.kind === 'object') {
      const obj = this.staticObjectMap.get(this.targetTy * WORLD_W + this.targetTx);
      const crackKey = obj
        ? obj.crackKey
        : (block === 'tree' ? `tree:${treeVariantAt(this.targetTx, this.targetTy)}` : block);
      const crack = this.objectCrackSprites[crackKey];
      if (crack) {
        const cx = this.targetTx * TILE + TILE / 2;
        const cy = this.targetTy * TILE + TILE / 2;
        const dx = cx - crack.anchorX;
        const dy = cy - crack.anchorY;
        if (crack.overlay) {
          ctx.save();
          ctx.globalAlpha = 0.06 + this.mining.progress * 0.22;
          ctx.drawImage(crack.overlay, dx, dy);
          ctx.restore();
        }
        const sprite = crack.sprites[stage];
        if (sprite) ctx.drawImage(sprite, dx, dy);
        return;
      }
    }

    const px = this.targetTx * TILE;
    const py = this.targetTy * TILE;
    const sprite = this.miningCrackSprites[stage];
    if (sprite) ctx.drawImage(sprite, px, py);
  }

  // Ombre ovale d'un objet au sol, pré-rendue en sprite (cache par
  // taille quantifiée au demi-pixel : invisible à l'œil, et le chemin
  // chaud ne crée plus d'ellipse vectorielle par objet et par frame).
  getDropShadow(rx, ry) {
    const qx = Math.max(1, Math.round(rx * 2)) | 0;
    const qy = Math.max(1, Math.round(ry * 2)) | 0;
    const key = qy * 64 + qx;
    let sprite = this.shadowCache.get(key);
    if (sprite) return sprite;
    if (this.shadowCache.size > 64) this.shadowCache.clear(); // garde-fou

    const S = 2; // rendu à 2× : résolution d'écran du jeu (zoom 2)
    // qx/qy ≈ diamètres monde de l'ellipse (déjà arrondis au demi-pixel).
    const w = qx + 2; // marge d'un pixel de chaque côté
    const h = qy + 2;
    const c = makeCanvas(w * S, h * S);
    const sctx = c.getContext('2d');
    sctx.fillStyle = 'rgba(0,0,0,0.22)';
    sctx.beginPath();
    sctx.ellipse((w / 2) * S, (h / 2) * S, (qx / 2) * S, (qy / 2) * S, 0, 0, Math.PI * 2);
    sctx.fill();
    sprite = { canvas: c, w, h };
    this.shadowCache.set(key, sprite);
    return sprite;
  }

  // Objet posé au sol : ombre douce + sprite qui rebondit légèrement.
  // Un petit "pop" d'apparition adoucit le lâcher.
  drawDrop(ctx, drop) {
    const sprite = getItemSprite(drop.id);
    const base = 0.46;
    const age = this.time - drop.born;
    const pop = Math.min(1, age / 0.16);
    const scale = base * (0.6 + 0.4 * pop);
    const size = 32 * scale;
    const bob = Math.sin(this.time * 4 + drop.x * 0.13) * 1.4;
    const hop = drop.hop || 0;
    const y = drop.y - bob - hop;

    const shadow = this.getDropShadow(size * 0.52, size * 0.2);
    ctx.drawImage(shadow.canvas, drop.x - shadow.w / 2, drop.y + 5 - shadow.h / 2, shadow.w, shadow.h);

    if (sprite) {
      ctx.drawImage(sprite, drop.x - size / 2, y - size / 2, size, size);
    } else {
      // filet de sécurité si le sprite n'est pas prêt
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(drop.x - size / 2, y - size / 2, size, size);
    }
  }

  rebuildStaticObjects() {
    this.staticObjects.length = 0;
    this.staticObjectMap.clear();
    this.staticObjectsByChunk.clear();
    this.waterTilesByChunk.clear();
    const ct = this.chunkTiles;
    const floor = this.world.floor;
    const blocks = this.world.blocks;
    for (let ty = 0; ty < WORLD_H; ty++) {
      const rowBase = ty * WORLD_W;
      const chunkRow = Math.floor(ty / ct) * 256;
      for (let tx = 0; tx < WORLD_W; tx++) {
        const i = rowBase + tx;
        // Index des tuiles d'eau : leur surface est redessinée par-dessus
        // les chunks avec la frame animée courante (vagues vivantes).
        if (floor[i] === 'water') {
          const key = chunkRow + Math.floor(tx / ct);
          let list = this.waterTilesByChunk.get(key);
          if (!list) {
            list = [];
            this.waterTilesByChunk.set(key, list);
          }
          list.push(i);
        }
        const block = blocks[i];
        if (!block || BLOCK_DEFS[block]?.kind !== 'object') continue;
        const drawable = {
          tx,
          ty,
          sortY: ty * TILE + TILE / 2,
          kind: block,
          variant: block === 'tree' ? treeVariantAt(tx, ty) : null,
          crackKey: block === 'tree' ? `tree:${treeVariantAt(tx, ty)}` : block,
          x: tx * TILE + TILE / 2,
          y: ty * TILE + TILE / 2,
          active: true,
          dy: DRAW_OBJECT, // tag de rendu (tri sans allocation)
        };
        this.staticObjects.push(drawable);
        this.staticObjectMap.set(i, drawable);
        const key = chunkRow + Math.floor(tx / ct);
        let list = this.staticObjectsByChunk.get(key);
        if (!list) {
          list = [];
          this.staticObjectsByChunk.set(key, list);
        }
        list.push(drawable);
      }
    }
    // L'index des blocs posés suit le même cycle de vie : on le reconstruit
    // avec les objets statiques (génération du monde, changement de grotte).
    this.rebuildPlacedIndex();
  }

  removeStaticObjectAt(tx, ty) {
    const drawable = this.staticObjectMap.get(ty * WORLD_W + tx);
    if (!drawable) return;
    drawable.active = false;
    this.staticObjectMap.delete(ty * WORLD_W + tx);
  }

  // ------------------------------------------------------------
  //  Index spatial des blocs posés (murs, portes, fours, coffres)
  //  Même principe que les ressources naturelles : une liste par
  //  chunk, pour que le rendu ne parcoure que ce qui est visible.
  // ------------------------------------------------------------

  // Un bloc posé est-il à dessiner par drawDepthSorted ?
  // (Les arbres / rochers / minerais sont des « objects » : ils vivent
  // dans staticObjects, pas ici.)
  _isDrawablePlaced(i) {
    const blocks = this.world.blocks;
    const blocks2 = this.world.blocks2;
    const b1 = blocks[i];
    if (b1) {
      if (CROPS.includes(b1)) return true; // les pousses de blé posées
      if (b1 === 'torch') return true;     // les torches posées
      if (b1 === 'sign') return true;      // les panneaux posés
      if (BLOCK_DEFS[b1]?.sellerTier) return true; // les étals de vente
      const kind = BLOCK_DEFS[b1]?.kind;
      if (kind === 'block' || kind === 'door') return true;
    }
    if (blocks2) {
      const b2 = blocks2[i];
      if (b2) {
        const kind2 = BLOCK_DEFS[b2]?.kind;
        if (kind2 === 'block') return true;
      }
    }
    return false;
  }

  // Reconstruit la liste d'UN chunk (256 cases : coût d'une pose de bloc,
  // donc négligeable, et impossible à désynchroniser).
  reindexPlacedChunk(tx, ty) {
    const ct = this.chunkTiles;
    const cx = Math.floor(tx / ct);
    const cy = Math.floor(ty / ct);
    const key = cy * 256 + cx;
    const startTx = cx * ct;
    const startTy = cy * ct;
    const endTx = Math.min(WORLD_W, startTx + ct);
    const endTy = Math.min(WORLD_H, startTy + ct);
    let list = this.placedByChunk.get(key);
    if (!list) {
      list = [];
      this.placedByChunk.set(key, list);
    }
    list.length = 0;
    for (let y = startTy; y < endTy; y++) {
      const rowBase = y * WORLD_W;
      for (let x = startTx; x < endTx; x++) {
        const i = rowBase + x;
        if (this._isDrawablePlaced(i)) list.push(i);
      }
    }
    if (list.length === 0) this.placedByChunk.delete(key);
  }

  // Index complet (appelé à la génération et à tout changement de monde).
  rebuildPlacedIndex() {
    this.placedByChunk.clear();
    const ct = this.chunkTiles;
    const chunksX = Math.ceil(WORLD_W / ct);
    const chunksY = Math.ceil(WORLD_H / ct);
    for (let cy = 0; cy < chunksY; cy++) {
      for (let cx = 0; cx < chunksX; cx++) {
        const startTx = cx * ct;
        const startTy = cy * ct;
        const endTx = Math.min(WORLD_W, startTx + ct);
        const endTy = Math.min(WORLD_H, startTy + ct);
        let list = null;
        for (let y = startTy; y < endTy; y++) {
          const rowBase = y * WORLD_W;
          for (let x = startTx; x < endTx; x++) {
            const i = rowBase + x;
            if (!this._isDrawablePlaced(i)) continue;
            if (!list) list = [];
            list.push(i);
          }
        }
        if (list) this.placedByChunk.set(cy * 256 + cx, list);
      }
    }
  }

  // Récupère (ou crée) une enveloppe de la réserve pour un bloc posé.
  _takeBlockDrawable() {
    const n = this.blockDrawableCount++;
    let d = this.blockDrawables[n];
    if (!d) {
      d = { dy: DRAW_PLACED_BLOCK, tx: 0, ty: 0, block: null, kind: '', layer: 1, sortY: 0 };
      this.blockDrawables[n] = d;
    }
    return d;
  }

  drawDepthSorted(ctx, minTx, minTy, maxTx, maxTy) {
    const drawables = this.drawables;
    drawables.length = 0;

    // Les ressources naturelles sont statiques et indexées par chunk
    // spatial : on ne collecte que les chunks qui recouvrent l'écran
    // au lieu de rescanner les ~900 ressources du monde à chaque frame.
    const ct = this.chunkTiles;
    const chunkL = Math.floor(minTx / ct);
    const chunkT = Math.floor(minTy / ct);
    const chunkR = Math.floor(maxTx / ct);
    const chunkB = Math.floor(maxTy / ct);
    for (let cy = chunkT; cy <= chunkB; cy++) {
      for (let cx = chunkL; cx <= chunkR; cx++) {
        const list = this.staticObjectsByChunk.get(cy * 256 + cx);
        if (!list) continue;
        for (let k = 0; k < list.length; k++) {
          const object = list[k];
          if (
            object.active
            && object.tx >= minTx && object.tx <= maxTx
            && object.ty >= minTy && object.ty <= maxTy
          ) drawables.push(object);
        }
      }
    }

    // Blocs posés (murs, portes, fours…) : indexés par chunk, comme les
    // ressources naturelles. On ne parcourt que les chunks à l'écran au
    // lieu de rescanner toute la fenêtre de tuiles à chaque frame, et les
    // enveloppes viennent d'une réserve réutilisée (zéro allocation).
    const blocks = this.world.blocks;
    const blocks2 = this.world.blocks2;
    const doorOpen = this.world.doorOpen;
    this.blockDrawableCount = 0;
    for (let cy = chunkT; cy <= chunkB; cy++) {
      const rowBase = cy * 256;
      for (let cx = chunkL; cx <= chunkR; cx++) {
        const list = this.placedByChunk.get(rowBase + cx);
        if (!list) continue;
        for (let k = 0; k < list.length; k++) {
          const i = list[k];
          const tx = i % WORLD_W;
          const ty = (i / WORLD_W) | 0;
          if (tx < minTx || tx > maxTx || ty < minTy || ty > maxTy) continue;
          const sortY = (ty + 1) * TILE; // trié par le bas de sa tuile

          // Couche 1 (base) — les pousses de culture (kind « object » mais
          // posées dans world.blocks) passent aussi par ici pour être vues.
          const block = blocks[i];
          if (block) {
            const def = BLOCK_DEFS[block];
            const isCrop = CROPS.includes(block);
            const isTorch = block === 'torch';
            const isSign = block === 'sign';
            const isSeller = Boolean(def.sellerTier);
            if (def.kind === 'block' || def.kind === 'door' || isCrop || isTorch || isSign || isSeller) {
              const d = this._takeBlockDrawable();
              d.tx = tx;
              d.ty = ty;
              d.block = block;
              d.kind = isCrop ? 'crop' : (isTorch ? 'torch' : (isSign ? 'sign' : (isSeller ? 'seller' : def.kind)));
              d.layer = 1;
              d.sortY = sortY;
              drawables.push(d);
            }
          }
          // Couche 2 (empilé)
          if (blocks2) {
            const block2 = blocks2[i];
            if (block2 && BLOCK_DEFS[block2].kind === 'block') {
              const d2 = this._takeBlockDrawable();
              d2.tx = tx;
              d2.ty = ty;
              d2.block = block2;
              d2.kind = 'block';
              d2.layer = 2;
              d2.sortY = sortY;
              drawables.push(d2);
            }
          }
        }
      }
    }

    // Drops, mobs et joueurs sont poussés tels quels : chacun porte
    // déjà son sortY et son tag de rendu `dy` (entier). Aucune enveloppe
    // { sortY, kind, ... } n'est allouée : zéro pression sur le GC.
    const items = this.droppedItems;
    for (let i = 0; i < items.length; i++) drawables.push(items[i]);

    const mobs = this.mobs;
    for (let i = 0; i < mobs.length; i++) {
      const mob = mobs[i];
      if (!mob.alive) continue;
      mob.sortY = mob.y + 6;
      drawables.push(mob);
    }

    // Voitures : triées avec tout le reste, donc une voiture passe
    // derrière un mur ou un immeuble comme il faut.
    for (const car of this.carsFor(this.world)) {
      if (car === this.driving) continue;   // celle-là est dessinée avec le joueur
      drawables.push({ dy: DRAW_CAR, car, sortY: car.y, layer: 1 });
    }

    const player = this.player;
    player.sortY = player.y;
    drawables.push(player);
    for (const p of this.otherPlayers) {
      p.dy = DRAW_PLAYER;
      p.sortY = p.y;
      drawables.push(p);
    }

    // PNJ : triés en profondeur avec tout le reste, donc un marchand
    // passe correctement derrière un pilier de la grotte.
    const npcs = this.npcs;
    for (let i = 0; i < npcs.length; i++) {
      const npc = npcs[i];
      if (!npc.visible) continue;
      npc.sortY = npc.y;
      drawables.push(npc);
    }

    drawables.sort(SORT_BY_Y);
    for (let i = 0; i < drawables.length; i++) {
      const d = drawables[i];
      const dy = d.dy;
      if (dy === DRAW_OBJECT) {
        const kind = d.kind;
        if (kind === 'tree') drawTreeObject(ctx, d.x, d.y, d.variant || 'medium');
        else if (kind === 'rock') drawRockObject(ctx, d.x, d.y);
        else if (kind === 'ironOre') drawIronOreObject(ctx, d.x, d.y);
        else drawCaveObject(ctx, kind, d.x, d.y); // pierre / fer / arche / puits
      } else if (dy === DRAW_DROP) {
        this.drawDrop(ctx, d);
      } else if (dy === DRAW_MOB) {
        drawMob(ctx, d);
      } else if (dy === DRAW_NPC) {
        drawNpc(ctx, d);
      } else if (dy === DRAW_CAR) {
        drawCar(ctx, d.car);
      } else if (dy === DRAW_PLAYER) {
        // Au volant, on ne dessine pas le joueur : il est dans la voiture.
        if (d === player && this.driving) drawCar(ctx, this.driving);
        else this.drawPlayer(ctx, d, d === player);
      } else if (dy === DRAW_PLACED_BLOCK) {
        const block = d.block;
        const tx = d.tx;
        const ty = d.ty;
        const layer = d.layer || 1;
        if (d.kind === 'door') {
          const idx = this.world.idx(tx, ty);
          const isOpen = doorOpen[idx] === 1;
          const leftIsDoor = this.world.blockAt(tx - 1, ty) === 'door';
          const rightIsDoor = this.world.blockAt(tx + 1, ty) === 'door';
          const isRightDoor = leftIsDoor && !rightIsDoor;

          // Le mur continue au-dessus de l'ouverture (linteau) : sans ça,
          // une porte dans un immeuble haut laissait un trou. Dessiné
          // hors du miroir, lui seul doit se retourner.
          drawDoorLintel(ctx, tx, ty, this.world);
          ctx.save();
          if (isRightDoor) {
            // Effet double porte : on retourne la porte droite horizontalement
            ctx.translate(tx * TILE + TILE / 2, ty * TILE + TILE / 2);
            ctx.scale(-1, 1);
            ctx.translate(-(tx * TILE + TILE / 2), -(ty * TILE + TILE / 2));
          }
          ctx.drawImage(getDoorCanvas(isOpen), tx * TILE, ty * TILE - BLOCK_EXTRUDE);
          ctx.restore();
        } else if (d.kind === 'crop') {
          // Pousse de blé : petit sprite ancré au sol de la tuile.
          const spr = getObjectSprite(block);
          if (spr) {
            ctx.drawImage(spr.canvas,
              tx * TILE + TILE / 2 - spr.anchorX,
              ty * TILE + TILE - 6 - spr.anchorY);
          }
        } else if (d.kind === 'torch') {
          this.drawTorch(ctx, tx, ty);
        } else if (d.kind === 'sign') {
          this.drawSign(ctx, tx, ty);
        } else if (d.kind === 'seller') {
          const spr = getObjectSprite(block);
          if (spr) {
            ctx.drawImage(spr.canvas,
              tx * TILE + TILE / 2 - spr.anchorX,
              ty * TILE + TILE - 2 - spr.anchorY);
          }
          this.drawSellerLabel(ctx, tx, ty);
        } else if (block === 'furnace') {
          const entry = this.furnaceData.get(this.world.idx(tx, ty));
          ctx.drawImage(getFurnaceCanvas(Boolean(entry && entry.fuelTime > 0)), tx * TILE, ty * TILE);
        } else if (block === 'chest') {
          // Boîte complète : frame selon l'avancement d'ouverture du
          // couvercle, pas de raccord auto-tiling. CHEST_TOP_PAD : marge
          // haute de la canvas (couvercle soulevé dépasse de la boîte).
          const entry = this.chestData.get(this.world.idx(tx, ty));
          const offset = (layer === 2) ? 32 : 0;
          ctx.drawImage(
            getChestFrame(entry ? entry.openT : 0),
            tx * TILE, ty * TILE - BLOCK_EXTRUDE - CHEST_TOP_PAD - offset,
          );
        } else {
          if (isExtrudedBlock(block)) {
            // Rendu de connexion intelligente avec biseau et bordures dynamiques
            drawBlockConnected(ctx, block, tx, ty, this.world, layer);
          } else {
            const offset = (layer === 2) ? 32 : 0;
            ctx.drawImage(getTileCanvas(block), tx * TILE, ty * TILE - offset);
          }
        }
      }
    }
  }

  getVignette(W, H) {
    if (this.vignetteCanvas && this.vignetteW === W && this.vignetteH === H) return this.vignetteCanvas;

    const c = makeCanvas(W, H);
    const vctx = c.getContext('2d');
    const vg = vctx.createRadialGradient(
      W / 2, H / 2, Math.min(W, H) * 0.35,
      W / 2, H / 2, Math.max(W, H) * 0.75,
    );
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(10,18,12,0.28)');
    vctx.fillStyle = vg;
    vctx.fillRect(0, 0, W, H);

    this.vignetteCanvas = c;
    this.vignetteW = W;
    this.vignetteH = H;
    return c;
  }

  updateHeldItem(dt) {
    const stack = this.inventory.getSelectedStackRef();
    const id = stack ? stack.id : null;
    const slot = this.inventory.selected;
    if (id !== this.lastHeldId || slot !== this.lastHeldSlot) {
      this.lastHeldId = id;
      this.lastHeldSlot = slot;
      this.equipPop = 1;
    }
    this.equipPop = Math.max(0, this.equipPop - dt * 4.6);

    // Balancement de l'outil : pendant le minage la phase avance (l'outil
    // fait des va-et-vient réguliers) ; dès qu'on arrête, elle revient
    // doucement au repos au lieu de se figer en plein mouvement.
    const mining = this.mining.progress > 0 && this.inReach;
    // Un coup porté (mob ou joueur) déclenche un balancement lui aussi :
    // sans ça, frapper un joueur ne montrait AUCUNE animation.
    const swinging = mining || this.pvpSwingT > 0;
    if (swinging) {
      this.swingPhase += SWING_SPEED * dt;
    } else {
      const rest = Math.round(this.swingPhase / Math.PI) * Math.PI;
      const diff = rest - this.swingPhase;
      const step = SWING_SPEED * dt * 2.2;
      if (Math.abs(diff) <= step) this.swingPhase = rest;
      else this.swingPhase += Math.sign(diff) * step;
    }
  }

  heldDrawOpts(player) {
    // Objet d'options persistant, muté à chaque appel : plus aucune
    // allocation dans la boucle de rendu (c'était 1 à 2 objets/frame).
    const o = this._heldOpts || (this._heldOpts = {
      facing: 'down', walkPhase: 0, scale: PLAYER_RENDER_SCALE,
      mining: false, swing: 0, time: 0, pop: 0, shadow: true,
    });
    o.facing = player.facing;
    o.walkPhase = player.moving ? player.walkPhase : 0;
    o.mining = this.mining.progress > 0;
    // Sinus de la phase : 0 au repos, ±1 en plein balancement.
    o.swing = Math.sin(this.swingPhase);
    o.time = this.time;
    o.pop = this.equipPop;
    o.shadow = this._gfx() !== 'low';
    return o;
  }

  drawPlayer(ctx, player, local = false) {
    const heldId = local ? this.lastHeldId : null;
    const behind = heldId && heldItemIsBehind(player.facing);

    if (behind) {
      drawHeldItem(ctx, player.appearance, heldId, player.x, player.y, this.heldDrawOpts(player));
    }

    // Objet d'options persistant, mutate à chaque appel (zéro allocation).
    const o = this._charOpts || (this._charOpts = {
      facing: 'down', walkPhase: 0, scale: PLAYER_RENDER_SCALE,
      shadow: true, pixelDensity: 2,
    });
    o.facing = player.facing;
    o.walkPhase = player.moving ? player.walkPhase : 0;
    // Le joueur reste lisible, mais nettement plus petit que l'arbre :
    // une tuile représente désormais un vrai espace autour de lui.
    o.shadow = this._gfx() !== 'low';
    o.pixelDensity = this.camera.zoom;
    drawCharacter(ctx, player.appearance, player.x, player.y, o);

    if (heldId && !behind) {
      drawHeldItem(ctx, player.appearance, heldId, player.x, player.y, this.heldDrawOpts(player));
    }
    // Barre de vie (PvP) : visible dès qu'il manque un PV.
    if (player.hp !== undefined && player.hp < (player.maxHp || 20)) {
      const max = player.maxHp || 20;
      const w = 22;
      const x = player.x - w / 2;
      const y = player.y - 30;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(x - 1, y - 1, w + 2, 5);
      ctx.fillStyle = '#5a1616';
      ctx.fillRect(x, y, w, 3);
      ctx.fillStyle = '#e04038';
      ctx.fillRect(x, y, w * Math.max(0, player.hp) / max, 3);
    }
    this.drawNameTag(ctx, player);
    this.drawSpeechBubble(ctx, player);
  }

  getNameTag(name, scale = 1) {
    const label = name || 'Aventurier';
    const key = `${label}@${scale}`; // clé de cache uniquement
    const cached = this.nameTagCache.get(key);
    if (cached) return cached;

    // Le pseudo est rendu en haute résolution (× le zoom de la caméra)
    // puis affiché à sa vraie taille : le texte reste net au lieu d'être
    // agrandi/pixélisé par le zoom.
    const px = Math.max(1, Math.round(scale));
    const font = `bold ${9 * px}px system-ui, sans-serif`;
    this.ctx.save();
    this.ctx.font = font;
    const wPx = Math.ceil(this.ctx.measureText(label).width + 8 * px);
    this.ctx.restore();

    const hPx = 13 * px;
    const c = makeCanvas(wPx, hPx);
    const nctx = c.getContext('2d');
    nctx.font = font;
    nctx.textAlign = 'center';
    nctx.textBaseline = 'middle';
    nctx.fillStyle = 'rgba(20,25,20,0.72)';
    if (nctx.roundRect) {
      nctx.beginPath();
      nctx.roundRect(0, 0, wPx, hPx, 6 * px);
      nctx.fill();
    } else {
      nctx.fillRect(0, 0, wPx, hPx);
    }
    nctx.fillStyle = '#fff';
    nctx.fillText(label, wPx / 2, hPx / 2);

    const tag = { canvas: c, w: wPx / px, h: hPx / px };
    this.nameTagCache.set(key, tag);
    return tag;
  }

  drawNameTag(ctx, player) {
    const scale = Math.max(1, Math.round(this.camera.zoom));
    const tag = this.getNameTag(player.appearance.name, scale);
    // Dessiné à sa taille logique (monde) : le zoom redonne un texte net.
    ctx.drawImage(tag.canvas, player.x - tag.w / 2, player.y - 34, tag.w, tag.h);
  }

  // ------------------------------------------------------------
  //  Bulles du talkie-walkie (chat de proximité, étape 6)
  //
  //  Le message apparaît au-dessus du joueur qui parle — le sien comme
  //  celui des autres — pendant BUBBLE_SECONDS. C'est ce qui rend le
  //  canal de proximité lisible SANS quitter le monde des yeux : la
  //  fenêtre de chat, elle, reste en bas de l'écran.
  // ------------------------------------------------------------
  showBubble(entity, text, seconds = BUBBLE_SECONDS) {
    if (!entity) return;
    // Réglage utilisateur (« Bulles de proximité », panneau Paramètres).
    if (this.settings && this.settings.bubbles === false) return;
    const clean = sanitizeChatText(text);
    if (!clean) return;
    entity._bubble = { text: clean, until: this.time + seconds };
  }

  // Ce que dit LE JOUEUR LOCAL au talkie-walkie : bulle immédiate sur son
  // propre personnage (le serveur ne lui renvoie pas son message en écho).
  showLocalBubble(text) {
    this.showBubble(this.player, text);
  }

  // Même chose pour un joueur distant (repéré par son id réseau).
  showRemoteBubble(id, text) {
    for (const p of this.otherPlayers) {
      if (p.id === id) { this.showBubble(p, text); return true; }
    }
    return false;
  }

  // Rendu du texte pré-rendu, avec retour à la ligne automatique : une
  // bulle trop large déborderait de l'écran et masquerait le décor.
  getSpeechBubble(text, scale = 1) {
    const key = `${text}@${scale}`;
    const cached = this.bubbleCache.get(key);
    if (cached) return cached;
    // Le texte d'une bulle est libre (jusqu'à 200 caractères) : le cache
    // ne doit pas grossir sans borne, on le vide quand il devient gros
    // (une bulle se re-dessine en quelques dizaines de microsecondes).
    if (this.bubbleCache.size > 80) this.bubbleCache.clear();

    const px = Math.max(1, Math.round(scale));
    const pad = 6 * px;
    const maxChars = 26;
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length > maxChars && line) { lines.push(line); line = word; }
      else line = candidate;
    }
    if (line) lines.push(line);

    const font = `bold ${9 * px}px system-ui, sans-serif`;
    this.ctx.save();
    this.ctx.font = font;
    let textW = 0;
    for (const l of lines) textW = Math.max(textW, Math.ceil(this.ctx.measureText(l).width));
    this.ctx.restore();

    const lineH = 11 * px;
    const wPx = textW + pad * 2;
    const tail = 4 * px;
    const hPx = lines.length * lineH + pad * 2 + tail;

    const c = makeCanvas(wPx, hPx);
    const bctx = c.getContext('2d');
    bctx.font = font;
    bctx.textAlign = 'center';
    bctx.textBaseline = 'middle';
    const bodyH = hPx - tail;
    bctx.fillStyle = 'rgba(232,244,228,0.94)';
    if (bctx.roundRect) {
      bctx.beginPath();
      bctx.roundRect(0, 0, wPx, bodyH, 6 * px);
      bctx.fill();
      // Queue de la bulle, pointée vers le joueur.
      bctx.beginPath();
      bctx.moveTo(wPx / 2 - 5 * px, bodyH - 1);
      bctx.lineTo(wPx / 2, hPx);
      bctx.lineTo(wPx / 2 + 5 * px, bodyH - 1);
      bctx.closePath();
      bctx.fill();
    } else {
      bctx.fillRect(0, 0, wPx, bodyH);
    }
    bctx.fillStyle = '#1d2a1f';
    lines.forEach((l, i) => bctx.fillText(l, wPx / 2, pad + lineH * (i + 0.5)));

    const bubble = { canvas: c, w: wPx / px, h: hPx / px };
    this.bubbleCache.set(key, bubble);
    return bubble;
  }

  drawSpeechBubble(ctx, player) {
    const bubble = player._bubble;
    if (!bubble) return;
    // Une bulle expirée est oubliée ici plutôt que dans la boucle de mise
    // à jour : elle n'a aucune raison d'être tracée, et ça évite de
    // parcourir tous les joueurs distants à chaque frame pour rien.
    if (this.time >= bubble.until) { player._bubble = null; return; }
    const scale = Math.max(1, Math.round(this.camera.zoom));
    const art = this.getSpeechBubble(bubble.text, scale);
    // Juste au-dessus de l'étiquette de nom (qui est à -34).
    ctx.drawImage(art.canvas, player.x - art.w / 2, player.y - 34 - art.h - 3, art.w, art.h);
  }
}
