// ============================================================
//  AVANIA — Boucle de jeu, rendu et interactions avec les blocs
// ============================================================

import {
  TILE, WORLD_W, WORLD_H, REACH, PERFORMANCE, PLAYER_RENDER_SCALE,
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
  drawTreeObject, drawRockObject, drawIronOreObject,
  getObjectSprite, getObjectSpriteInfo, treeVariantAt, treeDropCount,
  treeBreakTime, TREE_VARIANTS,
} from './tileset.js';
import { drawCharacter } from './character.js';
import { getItemSprite } from './icons.js';
import { drawHeldItem, heldItemIsBehind } from './held.js';
import { isLowPowerDevice, makeCanvas } from './utils.js';
import { updateFurnace, makeFurnaceEntry } from './furnace.js';
import { MOB_DEFS, spawnMobs, updateMob, drawMob, mobDrops } from './mobs.js';

const REACH_SQ = REACH * REACH;
const SORT_BY_Y = (a, b) => a.sortY - b.sortY;
const MINING_CRACK_STAGES = 9;
// Vitesse du balancement de l'outil pendant le minage (rad/s) : un va-et-
// vient complet ≈ 0,66 s, comme le geste de la main dans Minecraft.
const SWING_SPEED = 9.5;
// Durée de vie d'un objet au sol (5 min, comme Minecraft).
const DROP_LIFETIME = 300;
const MAX_DROPS = 240;

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
  constructor(canvas, appearance) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    this.ctx.imageSmoothingEnabled = false;
    this.world = new World();
    this.player = new Player(this.world.spawn.x, this.world.spawn.y, appearance);
    this.input = new Input();
    this.inventory = new Inventory();

    this.viewW = window.innerWidth;
    this.viewH = window.innerHeight;
    this.camera = new Camera(this.viewW, this.viewH, WORLD_W * TILE, WORLD_H * TILE);
    this.camera.snapTo(this.player.x, this.player.y);

    this.otherPlayers = []; // futurs joueurs en ligne
    // Objets posés au sol (ramassables en marchant dessus).
    this.droppedItems = [];
    this.pickupFullCooldown = 0;
    // Animaux (moutons, vaches) qui se baladent dans le monde.
    this.mobs = spawnMobs(this.world);
    this.mobAttackCooldown = 0;
    // Fours posés : contenu + progression (clé "tx,ty").
    this.furnaceData = new Map();
    // Rappels branchés par l'UI (ex. ouvrir le panneau du four).
    this.uiCallbacks = { openFurnace: null };
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
    this.staticObjects = [];
    this.staticObjectMap = new Map();
    this.rebuildStaticObjects();

    // Rendu optimisé : le sol est rendu par chunks statiques au lieu
    // d'être redessiné tuile par tuile à chaque frame.
    this.chunkTiles = PERFORMANCE.CHUNK_TILES;
    this.floorChunkCache = new Map();
    this.drawables = [];
    this.nameTagCache = new Map();
    this.vignetteCanvas = null;
    this.vignetteW = 0;
    this.vignetteH = 0;

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
    this.update(dt);
    this.render();
    this.trackPerformance(performance.now() - renderStart);

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
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('resize'));
      console.info('AVANIA: mode performance activé automatiquement.');
    }
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
    this.actionCooldown = Math.max(0, this.actionCooldown - dt);
    // Les fours cuisent en continu, même panneau ouvert (la barre avance).
    this.updateFurnaces(dt);
    if (this.paused) return;

    const dir = this.input.getDirection();
    this.player.update(dir, dt, this.world);
    this.camera.follow(this.player.x, this.player.y, dt);
    this.updateDroppedItems(dt);
    this.updateParticles(dt);
    this.updateHeldItem(dt);
    this.updateMobs(dt);

    this.updateTarget();
    this.handleHotbarKeys();
    this.handleDropKey();
    this.handleClicks(dt);
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
    const key = `${tx},${ty}`;
    let entry = this.furnaceData.get(key);
    if (!entry) {
      entry = makeFurnaceEntry();
      this.furnaceData.set(key, entry);
    }
    return entry;
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

  // Trouve un mob sous le curseur (dans la portée d'interaction).
  mobUnderCursor() {
    const m = this.input.mouse;
    const zoom = this.camera.zoom;
    const wx = this.camera.x + m.x / zoom;
    const wy = this.camera.y + m.y / zoom;
    let best = null;
    let bestDist = Infinity;
    for (const mob of this.mobs) {
      if (!mob.alive) continue;
      const dx = mob.x - wx;
      const dy = mob.y - wy;
      const distSq = dx * dx + dy * dy;
      if (distSq < 15 * 15 && distSq < bestDist) {
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
    if (!this.input.isDown('q')) return;
    this.input.keys.delete('q');
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
    const sp = 72 + Math.random() * 46;
    this.spawnDropAt(this.player.x, this.player.y, id, count, a, sp);
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
      if (this.input.isDown(String(i + 1))) {
        this.input.keys.delete(String(i + 1));
        this.inventory.select(i);
      }
    }
    if (this.input.mouse.wheel !== 0) {
      this.inventory.cycle(this.input.mouse.wheel);
      this.input.mouse.wheel = 0;
    }
  }

  // ------------------------------------------------------------
  //  Casser (maintenir clic gauche) / Poser (clic droit)
  // ------------------------------------------------------------
  handleClicks(dt) {
    const clickedLeft = this.input.mouse.leftClicked;
    const clickedRight = this.input.mouse.rightClicked;
    const holdingLeft = this.input.mouse.leftDown;
    const holdingRight = this.input.mouse.rightDown;

    // Les clics ponctuels sont consommés ici. Pour miner, le joueur doit
    // garder le bouton gauche enfoncé : le bloc se fissure progressivement.
    this.input.mouse.leftClicked = false;
    this.input.mouse.rightClicked = false;

    if (holdingLeft) {
      // Le clic gauche frappe d'abord les animaux sous le curseur
      // (comme dans Minecraft), sinon il mine la tuile.
      if (!this.tryAttackMob(dt)) this.mineTarget(dt);
    } else if (clickedLeft || this.mining.progress > 0) {
      this.resetMining();
    }

    if (clickedRight || holdingRight) this.interactTarget();
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
      return;
    }
    if (targetBlock === 'furnace') {
      if (this.uiCallbacks.openFurnace) {
        this.uiCallbacks.openFurnace(this.targetTx, this.targetTy);
      }
      this.actionCooldown = 0.25;
      return;
    }
    this.placeSelectedBlock();
  }

  // Petite bouffée de particules quand une porte s'ouvre / se ferme.
  spawnDoorPuff(tx, ty, open) {
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
    this.mining.duration = duration / speed;
    this.mining.progress += dt / this.mining.duration;

    if (this.mining.progress < 1) return;

    const i = this.world.idx(this.targetTx, this.targetTy);
    const oldFloor = this.world.floor[i];
    const drop = this.world.breakBlock(this.targetTx, this.targetTy);
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
    if (this.droppedItems.length === 0) return;
    this.pickupFullCooldown = Math.max(0, this.pickupFullCooldown - dt);

    const px = this.player.x;
    const py = this.player.y;
    // Rayon de ramassage généreux : il suffit d'être « sur » la tuile
    // de l'objet pour le récupérer, même sans être pile au centre.
    const PICKUP_SQ = 28 * 28;
    const friction = 1 - Math.min(1, dt * 4.2);
    const gravity = 480 * dt;
    const MERGE_SQ = 22 * 22;

    for (let n = this.droppedItems.length - 1; n >= 0; n--) {
      const d = this.droppedItems[n];

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
        this.droppedItems.splice(n, 1);
        continue;
      }

      const dx = px - d.x;
      const dy = py - d.y;
      const distSq = dx * dx + dy * dy;

      // Ramassage direct dès qu'on marche dessus.
      if (distSq < PICKUP_SQ) {
        const added = this.inventory.add(d.id, d.count);
        if (added >= d.count) {
          this.droppedItems.splice(n, 1);
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
      if (d.count < 64 && this.droppedItems.length < MAX_DROPS) {
        for (let m = n - 1; m >= 0; m--) {
          const other = this.droppedItems[m];
          if (!other || other.id !== d.id) continue;
          const ox = d.x - other.x;
          const oy = d.y - other.y;
          if (ox * ox + oy * oy > MERGE_SQ) continue;
          const add = Math.min(64 - d.count, other.count);
          if (add <= 0) continue;
          d.count += add;
          other.count -= add;
          if (other.count <= 0) this.droppedItems.splice(m, 1);
          break;
        }
      }

      d.sortY = d.y;
    }
  }

  // ------------------------------------------------------------
  //  Particules de casse (débris légers)
  //  Des petits carrés pixelisés projetés autour du bloc cassé,
  //  soumis à la gravité, qui s'estompent rapidement. Coût négligeable :
  //  quelques dizaines d'objets éphémères, un simple fillRect chacun.
  // ------------------------------------------------------------
  spawnBreakParticles(tx, ty, blockId) {
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

    const placed = this.world.placeBlock(this.targetTx, this.targetTy, item);
    if (placed) {
      this.inventory.takeSlot(this.inventory.selectedSlotIndex(), 1);
      this.actionCooldown = 0.16;
    }
  }

  isPlayerOnTile(tx, ty) {
    return Math.floor(this.player.x / TILE) === tx && Math.floor(this.player.y / TILE) === ty;
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
    // Le fond couvre tout le canvas : inutile d'appeler clearRect en plus
    // (une opération plein-écran de moins par frame).
    ctx.fillStyle = '#2f76b2'; // hors-monde (eau)
    ctx.fillRect(0, 0, W, H);

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

    // 1) sols par chunks + blocs posés (une tuile = un bloc, plus petit qu'un arbre)
    this.drawFloorChunks(ctx, viewL, viewT, viewR, viewB);
    this.drawPlacedBlocks(ctx, minTx, minTy, maxTx, maxTy);

    // 2) objets (arbres, rochers) + joueurs, triés par profondeur
    this.drawDepthSorted(ctx, minTx, minTy, maxTx, maxTy);

    // 3) surbrillance de la tuile ciblée
    this.drawTargetHighlight(ctx, zoom);

    // 4) fissures de minage par-dessus la ressource ciblée, comme dans Minecraft
    this.drawMiningCracks(ctx);

    // 5) débris de casse par-dessus le tout
    this.drawParticles(ctx);

    ctx.restore();

    // 4) vignette d'ambiance. Elle est cachée en mode performance et
    // pré-rendue sinon, pour éviter un radialGradient à chaque frame.
    if (!this.performanceMode) {
      ctx.drawImage(this.getVignette(W, H), 0, 0, W, H);
    }
  }

  drawFloorChunks(ctx, viewL, viewT, viewR, viewB) {
    const ct = this.chunkTiles;
    const chunkL = Math.max(0, Math.floor(viewL / ct));
    const chunkT = Math.max(0, Math.floor(viewT / ct));
    const chunkR = Math.min(Math.ceil(WORLD_W / ct) - 1, Math.floor(viewR / ct));
    const chunkB = Math.min(Math.ceil(WORLD_H / ct) - 1, Math.floor(viewB / ct));

    for (let cy = chunkT; cy <= chunkB; cy++) {
      for (let cx = chunkL; cx <= chunkR; cx++) {
        const chunk = this.getFloorChunk(cx, cy);
        ctx.drawImage(chunk, cx * ct * TILE, cy * ct * TILE);
      }
    }
  }

  floorChunkKey(cx, cy) {
    return `${cx},${cy}`;
  }

  invalidateFloorChunk(tx, ty) {
    const cx = Math.floor(tx / this.chunkTiles);
    const cy = Math.floor(ty / this.chunkTiles);
    this.floorChunkCache.delete(this.floorChunkKey(cx, cy));
  }

  getFloorChunk(cx, cy) {
    const key = this.floorChunkKey(cx, cy);
    const cached = this.floorChunkCache.get(key);
    if (cached) return cached;

    const ct = this.chunkTiles;
    const startTx = cx * ct;
    const startTy = cy * ct;
    const tilesW = Math.min(ct, WORLD_W - startTx);
    const tilesH = Math.min(ct, WORLD_H - startTy);
    const c = makeCanvas(tilesW * TILE, tilesH * TILE);
    const cctx = c.getContext('2d');
    cctx.imageSmoothingEnabled = false;

    for (let y = 0; y < tilesH; y++) {
      for (let x = 0; x < tilesW; x++) {
        const tx = startTx + x;
        const ty = startTy + y;
        const floor = this.world.floor[this.world.idx(tx, ty)];
        const img = floor === 'water' ? getWaterFrame(0) : getTileCanvas(floor);
        cctx.drawImage(img, x * TILE, y * TILE);
      }
    }

    this.floorChunkCache.set(key, c);
    return c;
  }

  drawPlacedBlocks(ctx, minTx, minTy, maxTx, maxTy) {
    for (let ty = minTy; ty <= maxTy; ty++) {
      let i = this.world.idx(minTx, ty);
      for (let tx = minTx; tx <= maxTx; tx++, i++) {
        const block = this.world.blocks[i];
        if (!block) continue;
        const def = BLOCK_DEFS[block];
        if (def.kind === 'door') {
          ctx.drawImage(getDoorCanvas(this.world.doorOpen[i] === 1), tx * TILE, ty * TILE);
        } else if (block === 'furnace') {
          const entry = this.furnaceData.get(`${tx},${ty}`);
          ctx.drawImage(getFurnaceCanvas(Boolean(entry && entry.fuelTime > 0)), tx * TILE, ty * TILE);
        } else if (def.kind === 'block') {
          ctx.drawImage(getTileCanvas(block), tx * TILE, ty * TILE);
        }
      }
    }
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

    const alpha = this.performanceMode ? 0.82 : 0.72 + Math.sin(this.time * 6) * 0.12;
    ctx.save();
    ctx.strokeStyle = canAct ? `rgba(255,255,255,${alpha})` : 'rgba(255,80,80,0.85)';
    ctx.lineWidth = 2.5 / zoom;
    if (!this.performanceMode) {
      ctx.shadowColor = canAct ? 'rgba(255,255,255,0.55)' : 'rgba(255,80,80,0.55)';
      ctx.shadowBlur = 8;
    }
    ctx.fillStyle = canAct ? 'rgba(255,255,255,0.10)' : 'rgba(255,80,80,0.12)';
    const r = 6;
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(px + 1, py + 1, TILE - 2, TILE - 2, r);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(px + 1, py + 1, TILE - 2, TILE - 2);
      ctx.strokeRect(px + 1, py + 1, TILE - 2, TILE - 2);
    }
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
    const block = this.world.blockAt(this.targetTx, this.targetTy);
    if (block && BLOCK_DEFS[block]?.kind === 'object') {
      const crackKey = block === 'tree'
        ? `tree:${treeVariantAt(this.targetTx, this.targetTy)}`
        : block;
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

    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(drop.x, drop.y + 5, size * 0.52, size * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();

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
    for (let ty = 0; ty < WORLD_H; ty++) {
      for (let tx = 0; tx < WORLD_W; tx++) {
        const block = this.world.blockAt(tx, ty);
        if (!block || BLOCK_DEFS[block]?.kind !== 'object') continue;
        const drawable = {
          tx,
          ty,
          sortY: ty * TILE + TILE / 2,
          kind: block,
          variant: block === 'tree' ? treeVariantAt(tx, ty) : null,
          x: tx * TILE + TILE / 2,
          y: ty * TILE + TILE / 2,
          active: true,
        };
        this.staticObjects.push(drawable);
        this.staticObjectMap.set(`${tx},${ty}`, drawable);
      }
    }
  }

  removeStaticObjectAt(tx, ty) {
    const drawable = this.staticObjectMap.get(`${tx},${ty}`);
    if (!drawable) return;
    drawable.active = false;
    this.staticObjectMap.delete(`${tx},${ty}`);
  }

  drawDepthSorted(ctx, minTx, minTy, maxTx, maxTy) {
    const drawables = this.drawables;
    drawables.length = 0;

    // Les ressources naturelles sont statiques : on les indexe une fois,
    // puis on ne parcourt que cette petite liste au lieu de rescanner toute
    // la grille visible à chaque frame.
    for (const object of this.staticObjects) {
      if (
        object.active
        && object.tx >= minTx && object.tx <= maxTx
        && object.ty >= minTy && object.ty <= maxTy
      ) drawables.push(object);
    }

    for (const drop of this.droppedItems) {
      drawables.push({ sortY: drop.sortY, kind: 'drop', drop });
    }

    for (const mob of this.mobs) {
      if (mob.alive) drawables.push({ sortY: mob.y + 6, kind: 'mob', mob });
    }

    drawables.push({ sortY: this.player.y, kind: 'player', player: this.player, local: true });
    for (const p of this.otherPlayers) {
      drawables.push({ sortY: p.y, kind: 'player', player: p, local: false });
    }

    drawables.sort(SORT_BY_Y);
    for (let i = 0; i < drawables.length; i++) {
      const d = drawables[i];
      if (d.kind === 'tree') drawTreeObject(ctx, d.x, d.y, d.variant || 'medium');
      else if (d.kind === 'rock') drawRockObject(ctx, d.x, d.y);
      else if (d.kind === 'ironOre') drawIronOreObject(ctx, d.x, d.y);
      else if (d.kind === 'drop') this.drawDrop(ctx, d.drop);
      else if (d.kind === 'mob') drawMob(ctx, d.mob);
      else this.drawPlayer(ctx, d.player, d.local);
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
    return {
      facing: player.facing,
      walkPhase: player.moving ? player.walkPhase : 0,
      scale: PLAYER_RENDER_SCALE,
      mining: this.mining.progress > 0,
      // Sinus de la phase : 0 au repos, ±1 en plein balancement.
      swing: Math.sin(this.swingPhase),
      time: this.time,
      pop: this.equipPop,
      shadow: !this.performanceMode,
    };
  }

  drawPlayer(ctx, player, local = false) {
    const heldId = local ? this.lastHeldId : null;
    const walkPhase = player.moving ? player.walkPhase : 0;
    const behind = heldId && heldItemIsBehind(player.facing);

    if (behind) {
      drawHeldItem(ctx, player.appearance, heldId, player.x, player.y, this.heldDrawOpts(player));
    }

    drawCharacter(ctx, player.appearance, player.x, player.y, {
      facing: player.facing,
      walkPhase,
      // Le joueur reste lisible, mais nettement plus petit que l'arbre :
      // une tuile représente désormais un vrai espace autour de lui.
      scale: PLAYER_RENDER_SCALE,
      shadow: !this.performanceMode,
    });

    if (heldId && !behind) {
      drawHeldItem(ctx, player.appearance, heldId, player.x, player.y, this.heldDrawOpts(player));
    }
    this.drawNameTag(ctx, player);
  }

  getNameTag(name, scale = 1) {
    const key = `${name || 'Aventurier'}@${scale}`;
    const cached = this.nameTagCache.get(key);
    if (cached) return cached;

    // Le pseudo est rendu en haute résolution (× le zoom de la caméra)
    // puis affiché à sa vraie taille : le texte reste net au lieu d'être
    // agrandi/pixélisé par le zoom.
    const px = Math.max(1, Math.round(scale));
    const font = `bold ${9 * px}px system-ui, sans-serif`;
    this.ctx.save();
    this.ctx.font = font;
    const wPx = Math.ceil(this.ctx.measureText(key).width + 8 * px);
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
    nctx.fillText(key, wPx / 2, hPx / 2);

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
