// ============================================================
//  AVANIA — Boucle de jeu, rendu et interactions avec les blocs
// ============================================================

import {
  TILE, WORLD_W, WORLD_H, REACH, PERFORMANCE, PLAYER_RENDER_SCALE,
} from './config.js';
import { BLOCK_DEFS, DIGGABLE_FLOOR, ITEM_DEFS } from './blocks.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Camera } from './camera.js';
import { Input } from './input.js';
import { Inventory } from './inventory.js';
import { buildTileset, getTileCanvas, getWaterFrame, drawTreeObject, drawRockObject } from './tileset.js';
import { drawCharacter } from './character.js';
import { isLowPowerDevice, makeCanvas } from './utils.js';

const REACH_SQ = REACH * REACH;
const SORT_BY_Y = (a, b) => a.sortY - b.sortY;

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
    this.lastTime = performance.now();
    this.time = 0;
    this.tileset = buildTileset();

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
    this.resizeView();
    this.time += dt;
    this.actionCooldown = Math.max(0, this.actionCooldown - dt);
    if (this.paused) return;

    const dir = this.input.getDirection();
    this.player.update(dir, dt, this.world);
    this.camera.follow(this.player.x, this.player.y, dt);

    this.updateTarget();
    this.handleHotbarKeys();
    this.handleClicks(dt);
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

    if (holdingLeft) this.mineTarget(dt);
    else if (clickedLeft || this.mining.progress > 0) this.resetMining();

    if (clickedRight || holdingRight) this.placeSelectedBlock();
  }

  mineTarget(dt) {
    if (!this.inReach || !this.world.inBounds(this.targetTx, this.targetTy)) {
      this.resetMining();
      return;
    }

    const duration = this.world.breakDurationAt(this.targetTx, this.targetTy);
    if (duration <= 0) {
      this.resetMining();
      return;
    }

    if (this.mining.tx !== this.targetTx || this.mining.ty !== this.targetTy) {
      this.mining.tx = this.targetTx;
      this.mining.ty = this.targetTy;
      this.mining.progress = 0;
    }

    const selected = this.inventory.getSelectedStack();
    const selectedDef = selected ? ITEM_DEFS[selected.id] : null;
    const requiredTool = this.world.requiredToolAt(this.targetTx, this.targetTy);
    const effectiveTool = selectedDef?.toolType === requiredTool;

    // Une hache / pioche / pelle adaptée accélère réellement le minage.
    // La main reste utilisable, mais demande davantage de temps.
    const speed = effectiveTool
      ? (selectedDef.efficiency || 1)
      : selectedDef?.type === 'tool' ? 0.7 : 0.55;
    this.mining.duration = duration / speed;
    this.mining.progress += dt / this.mining.duration;

    if (this.mining.progress < 1) return;

    const existingBlock = this.world.blockAt(this.targetTx, this.targetTy);
    const possibleDrop = existingBlock
      ? BLOCK_DEFS[existingBlock]?.drop
      : DIGGABLE_FLOOR[this.world.floorAt(this.targetTx, this.targetTy)]?.drop;

    // Ne détruit pas une ressource si toutes les cases sont pleines.
    if (possibleDrop && !this.inventory.canAdd(possibleDrop, 1)) {
      this.notify('Inventaire plein : libère une case avant de récolter.');
      this.resetMining();
      return;
    }

    const i = this.world.idx(this.targetTx, this.targetTy);
    const oldFloor = this.world.floor[i];
    const drop = this.world.breakBlock(this.targetTx, this.targetTy);
    if (drop) {
      this.inventory.add(drop);
      if (selectedDef?.type === 'tool') {
        const result = this.inventory.damageSelectedTool(1);
        if (result.broken) this.notify(`${selectedDef.label} s'est cassé.`);
      }
    }
    if (this.world.floor[i] !== oldFloor) this.invalidateFloorChunk(this.targetTx, this.targetTy);
    this.resetMining();
  }

  placeSelectedBlock() {
    if (this.actionCooldown > 0 || !this.inReach) return;
    const selected = this.inventory.getSelectedStack();
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
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#2f76b2'; // hors-monde (eau)
    ctx.fillRect(0, 0, W, H);

    ctx.translate(-cam.x * zoom, -cam.y * zoom);
    ctx.scale(zoom, zoom);

    const viewL = Math.floor(cam.x / TILE) - 1;
    const viewT = Math.floor(cam.y / TILE) - 1;
    const viewR = Math.ceil((cam.x + W / zoom) / TILE) + 1;
    const viewB = Math.ceil((cam.y + H / zoom) / TILE) + 1;
    const minTx = Math.max(0, viewL);
    const minTy = Math.max(0, viewT);
    const maxTx = Math.min(WORLD_W - 1, viewR);
    const maxTy = Math.min(WORLD_H - 1, viewB);

    // 1) sols par chunks + blocs pleins posés
    this.drawFloorChunks(ctx, viewL, viewT, viewR, viewB);
    this.drawPlacedBlocks(ctx, minTx, minTy, maxTx, maxTy);

    // 2) surbrillance de la tuile ciblée
    this.drawTargetHighlight(ctx, zoom);

    // 3) objets (arbres, rochers) + joueurs, triés par profondeur
    this.drawDepthSorted(ctx, minTx, minTy, maxTx, maxTy);

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
        if (block && BLOCK_DEFS[block].kind === 'block') {
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

    // Barre de progression de minage, lisible sans ajouter d'interface fixe.
    if (
      this.mining.progress > 0
      && this.mining.tx === this.targetTx
      && this.mining.ty === this.targetTy
    ) {
      const progress = Math.min(1, this.mining.progress);
      const barX = px + 4;
      const barY = py + TILE - 6;
      const barW = TILE - 8;
      ctx.save();
      ctx.fillStyle = 'rgba(20,22,24,0.86)';
      ctx.fillRect(barX, barY, barW, 5);
      ctx.fillStyle = progress > 0.7 ? '#f1d36d' : '#d8dadd';
      ctx.fillRect(barX + 1, barY + 1, (barW - 2) * progress, 3);
      ctx.strokeStyle = 'rgba(0,0,0,0.72)';
      ctx.lineWidth = 1 / zoom;
      ctx.strokeRect(barX, barY, barW, 5);
      ctx.restore();
    }
  }

  drawDepthSorted(ctx, minTx, minTy, maxTx, maxTy) {
    const drawables = this.drawables;
    drawables.length = 0;

    for (let ty = minTy; ty <= maxTy; ty++) {
      let i = this.world.idx(minTx, ty);
      for (let tx = minTx; tx <= maxTx; tx++, i++) {
        const b = this.world.blocks[i];
        if (b && BLOCK_DEFS[b].kind === 'object') {
          drawables.push({
            sortY: ty * TILE + TILE / 2,
            kind: b,
            x: tx * TILE + TILE / 2,
            y: ty * TILE + TILE / 2,
          });
        }
      }
    }

    drawables.push({ sortY: this.player.y, kind: 'player', player: this.player });
    for (const p of this.otherPlayers) {
      drawables.push({ sortY: p.y, kind: 'player', player: p });
    }

    drawables.sort(SORT_BY_Y);
    for (let i = 0; i < drawables.length; i++) {
      const d = drawables[i];
      if (d.kind === 'tree') drawTreeObject(ctx, d.x, d.y);
      else if (d.kind === 'rock') drawRockObject(ctx, d.x, d.y);
      else this.drawPlayer(ctx, d.player);
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

  drawPlayer(ctx, player) {
    drawCharacter(ctx, player.appearance, player.x, player.y, {
      facing: player.facing,
      walkPhase: player.moving ? player.walkPhase : 0,
      // Le joueur reste lisible, mais nettement plus petit que l'arbre :
      // une tuile représente désormais un vrai espace autour de lui.
      scale: PLAYER_RENDER_SCALE,
      shadow: !this.performanceMode,
    });
    this.drawNameTag(ctx, player);
  }

  getNameTag(name) {
    const key = name || 'Aventurier';
    const cached = this.nameTagCache.get(key);
    if (cached) return cached;

    const font = 'bold 9px system-ui, sans-serif';
    this.ctx.save();
    this.ctx.font = font;
    const w = Math.ceil(this.ctx.measureText(key).width + 8);
    this.ctx.restore();

    const h = 13;
    const c = makeCanvas(w, h);
    const nctx = c.getContext('2d');
    nctx.font = font;
    nctx.fillStyle = 'rgba(20,25,20,0.72)';
    if (nctx.roundRect) {
      nctx.beginPath();
      nctx.roundRect(0, 0, w, h, 6);
      nctx.fill();
    } else {
      nctx.fillRect(0, 0, w, h);
    }
    nctx.fillStyle = '#fff';
    nctx.textAlign = 'center';
    nctx.textBaseline = 'middle';
    nctx.fillText(key, w / 2, 7);

    const tag = { canvas: c, w, h };
    this.nameTagCache.set(key, tag);
    return tag;
  }

  drawNameTag(ctx, player) {
    const tag = this.getNameTag(player.appearance.name);
    ctx.drawImage(tag.canvas, player.x - tag.w / 2, player.y - 34);
  }
}
