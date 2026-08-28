// ============================================================
//  AVANIA — Boucle de jeu, rendu et interactions avec les blocs
// ============================================================

import {
  TILE, WORLD_W, WORLD_H, REACH, PERFORMANCE, PLAYER_RENDER_SCALE, BLOCK_EXTRUDE,
} from './config.js';
import {
  BLOCK_DEFS, ITEM_DEFS, TOOL_TIERS, toolTierIndex, blockMinTierIndex,
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
} from './tileset.js';
import { drawCharacter } from './character.js';
import { drawNpc } from './npc/index.js';
import { getItemSprite } from './icons.js';
import { drawHeldItem, heldItemIsBehind } from './held.js';
import { isLowPowerDevice, makeCanvas } from './utils.js';
import { updateFurnace, makeFurnaceEntry } from './furnace.js';
import { MOB_DEFS, spawnMobs, updateMob, drawMob, mobDrops } from './mobs/index.js';
import { CAVE, canDescendTo } from './cave.js';

const REACH_SQ = REACH * REACH;
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
// Vitesse du balancement de l'outil pendant le minage (rad/s) : un va-et-
// vient complet ≈ 0,66 s, comme le geste de la main dans Minecraft.
const SWING_SPEED = 9.5;
// Durée de vie d'un objet au sol (5 min, comme Minecraft).
const DROP_LIFETIME = 300;
const MAX_DROPS = 240;
// Délai avant de pouvoir ramasser un objet qu'on vient de lâcher (secondes).
// Empêche le ramassage instantané quand Q sert aussi à se déplacer (AZERTY).
const PICKUP_DELAY = 0.6;
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
    this.pickupFullCooldown = 0;
    // Animaux (moutons, vaches) qui se baladent dans le monde.
    this.mobs = spawnMobs(this.world);
    for (const mob of this.mobs) mob.dy = DRAW_MOB;
    this.mobAttackCooldown = 0;
    // Fours posés : contenu + progression (clé numérique = index de tuile,
    // finies les chaînes "tx,ty" allouées dans la boucle de rendu).
    this.furnaceData = new Map();
    // Coffres posés : 27 cases de rangement (clé = index de tuile).
    this.chestData = new Map();
    // Rappels branchés par l'UI (ex. ouvrir le panneau du four / du coffre).
    this.uiCallbacks = {
      openFurnace: null,
      openChest: null,
      onMoney: null,
      onEnterCave: null,
      onExitCave: null,
      onDescend: null,
      onTalk: null,
      onInteractBlocked: null,
      onZoneChange: null,   // branché par le client multijoueur (js/net.js)
      onBlockChange: null,  // idem : (tx, ty, diff) — LE JOUEUR LOCAL a modifié un bloc
      onChestChange: null,  // idem : (tx, ty, slots[27]) — LE JOUEUR LOCAL a modifié un coffre ouvert
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

  // Particules activées ? (réglage utilisateur ; le mode performance réduit
  // déjà leur nombre, on ne fait ici que respecter l'interrupteur.)
  _particlesEnabled() {
    return this.settings ? this.settings.particles !== false : true;
  }

  // Vignette activée ? (réglage utilisateur ; le mode performance la coupe.)
  _vignetteOn() {
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
    // Les fours cuisent en continu, même panneau ouvert (la barre avance).
    this.updateFurnaces(dt);
    if (this.paused) { this.input.endFrame(); return; }

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
    this.player.update(dir, dt, this.world);
    this.camera.follow(this.player.x, this.player.y, dt);
    // Pré-construit par petits lots les chunks qui vont entrer dans la vue :
    // c'est le correctif des saccades au déplacement (plus de rasterisation
    // synchrone de chunk dans la boucle de rendu).
    this.prewarmFloorChunks(PERFORMANCE.CHUNK_PREWARM_BUDGET_MS);
    this.updateDroppedItems(dt);
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
  // ------------------------------------------------------------
  updateFurnaces(dt) {
    if (this.furnaceData.size === 0) return;
    for (const entry of this.furnaceData.values()) {
      updateFurnace(entry, dt);
    }
  }

  getFurnaceEntry(tx, ty) {
    const key = ty * WORLD_W + tx;
    let entry = this.furnaceData.get(key);
    if (!entry) {
      entry = makeFurnaceEntry();
      this.furnaceData.set(key, entry);
    }
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
  // ------------------------------------------------------------
  updateMobs(dt) {
    this.mobAttackCooldown = Math.max(0, this.mobAttackCooldown - dt);
    for (const mob of this.mobs) {
      if (!mob.alive) continue;
      updateMob(mob, dt, this.world, this.player);
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

    // 2) Sinon, un point de passage à portée de main.
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

  handleInteract() {
    const target = this.interactTarget;
    if (!target || this.actionCooldown > 0) return;
    this.actionCooldown = 0.3;

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
      droppedItems: this.droppedItems,
      mobs: this.mobs,
    });
  }

  _restoreDimState(world) {
    const saved = this.dimStates.get(world.id);
    if (saved) {
      this.furnaceData = saved.furnaceData;
      this.chestData = saved.chestData;
      this.droppedItems = saved.droppedItems;
      this.mobs = saved.mobs;
    } else {
      this.furnaceData = new Map();
      this.chestData = new Map();
      this.droppedItems = [];
      // Pas d'animaux sous terre.
      this.mobs = world.kind === 'cave' ? [] : spawnMobs(world);
      for (const mob of this.mobs) mob.dy = DRAW_MOB;
    }
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
    const damage = sword ? 3 : 1;

    mob.hp -= damage;
    mob.hitFlash = 0.18;
    mob.fleeT = 1.7;
    this.spawnHitParticles(mob.x, mob.y);

    if (sword) {
      const result = this.inventory.damageSelectedTool(1);
      if (result.broken) this.notify(`${def.label} s'est cassé.`);
    }

    if (mob.hp <= 0) {
      mob.alive = false;
      this.killMob(mob);
      const label = (MOB_DEFS[mob.kind] && MOB_DEFS[mob.kind].label) || 'Créature';
      this.notify(`${label} tué${mob.kind === 'vache' ? 'e' : ''}.`);
    }
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

  // Fait apparaître un objet au sol à une position donnée.
  spawnDropAt(x, y, id, count = 1, angle = null, speed = 0) {
    const a = angle === null ? Math.random() * Math.PI * 2 : angle;
    const sp = speed || 40 + Math.random() * 40;
    this.droppedItems.push({
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
    });
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
    // Minage / attaque : on maintient l'action « miner » (clic gauche par
    // défaut, mais rebindable). Frappe d'abord les animaux sous le curseur
    // (comme dans Minecraft), sinon mine la tuile.
    if (this.input.down('mine')) {
      if (!this.tryAttackMob(dt)) this.mineTarget(dt);
    } else if (this.mining.progress > 0) {
      this.resetMining();
    }

    // Poser (clic droit par défaut) : un appui suffit, le maintien aussi.
    if (this.input.pressed('place') || this.input.down('place')) this.interactTarget();
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
  interactTarget() {
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
    this.placeSelectedBlock();
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
    this.mining.duration = duration / (speed * this.gearMiningBoost());
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
    this.droppedItems.push({
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
    });
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

  // Même principe pour le contenu d'un coffre (étape 3) : appelé
  // directement quand un coffre est cassé (voir mineTarget) — le
  // ChestPanel appelle lui-même onChestChange pendant qu'il est ouvert
  // (voir js/ui.js), donc cette méthode ne sert qu'aux cas où AUCUN
  // panneau n'est ouvert au moment du changement.
  _announceChestChange(tx, ty, slots) {
    if (this.uiCallbacks.onChestChange) this.uiCallbacks.onChestChange(tx, ty, slots);
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
  //  Rendu
  // ------------------------------------------------------------
  render() {
    this.resizeView();
    const ctx = this.ctx;
    const cam = this.camera;
    const zoom = cam.zoom;
    const W = this.viewW;
    const H = this.viewH;

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

  drawPlacedBlocks(ctx, minTx, minTy, maxTx, maxTy) {
    const blocks = this.world.blocks;
    const doorOpen = this.world.doorOpen;
    for (let ty = minTy; ty <= maxTy; ty++) {
      let i = this.world.idx(minTx, ty);
      for (let tx = minTx; tx <= maxTx; tx++, i++) {
        const block = blocks[i];
        if (!block) continue;
        const def = BLOCK_DEFS[block];
        if (def.kind === 'door') {
          ctx.drawImage(getDoorCanvas(doorOpen[i] === 1), tx * TILE, ty * TILE);
        } else if (block === 'furnace') {
          const entry = this.furnaceData.get(i);
          ctx.drawImage(getFurnaceCanvas(Boolean(entry && entry.fuelTime > 0)), tx * TILE, ty * TILE);
        } else if (def.kind === 'block') {
          ctx.drawImage(getTileCanvas(block), tx * TILE, ty * TILE);
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

          // Couche 1 (base)
          const block = blocks[i];
          if (block) {
            const def = BLOCK_DEFS[block];
            if (def.kind === 'block' || def.kind === 'door') {
              const d = this._takeBlockDrawable();
              d.tx = tx;
              d.ty = ty;
              d.block = block;
              d.kind = def.kind;
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
      } else if (dy === DRAW_PLAYER) {
        this.drawPlayer(ctx, d, d === player);
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

          ctx.save();
          if (isRightDoor) {
            // Effet double porte : on retourne la porte droite horizontalement
            ctx.translate(tx * TILE + TILE / 2, ty * TILE + TILE / 2);
            ctx.scale(-1, 1);
            ctx.translate(-(tx * TILE + TILE / 2), -(ty * TILE + TILE / 2));
          }
          ctx.drawImage(getDoorCanvas(isOpen), tx * TILE, ty * TILE);
          ctx.restore();
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
    if (mining) {
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
    o.shadow = !this.performanceMode;
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
    o.shadow = !this.performanceMode;
    o.pixelDensity = this.camera.zoom;
    drawCharacter(ctx, player.appearance, player.x, player.y, o);

    if (heldId && !behind) {
      drawHeldItem(ctx, player.appearance, heldId, player.x, player.y, this.heldDrawOpts(player));
    }
    this.drawNameTag(ctx, player);
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
}
