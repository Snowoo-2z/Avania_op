// ============================================================
//  AVANIA — Boucle de jeu, rendu et interactions avec les blocs
// ============================================================

import { TILE, WORLD_W, WORLD_H, REACH } from './config.js';
import { BLOCK_DEFS } from './blocks.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Camera } from './camera.js';
import { Input } from './input.js';
import { Inventory } from './inventory.js';
import { buildTileset, getTileCanvas, getWaterFrame, WATER_FRAMES, drawTreeObject, drawRockObject } from './tileset.js';
import { drawCharacter } from './character.js';

export class Game {
  constructor(canvas, appearance) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
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

    // cible visée par la souris
    this.targetTx = -1;
    this.targetTy = -1;
    this.inReach = false;

    this.running = false;
    this.onFrame = this.onFrame.bind(this);
  }

  start() {
    this.running = true;
    requestAnimationFrame(this.onFrame);
  }

  stop() {
    this.running = false;
  }

  onFrame(now) {
    if (!this.running) return;
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;

    this.update(dt);
    this.render();

    requestAnimationFrame(this.onFrame);
  }

  update(dt) {
    this.time += dt;
    const dir = this.input.getDirection();
    this.player.update(dir, dt, this.world);
    this.camera.follow(this.player.x, this.player.y, dt);

    this.updateTarget();
    this.handleHotbarKeys();
    this.handleClicks();
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

    // portée : distance du joueur au centre de la tuile
    const cx = tx * TILE + TILE / 2;
    const cy = ty * TILE + TILE / 2;
    const dx = cx - this.player.x;
    const dy = cy - this.player.y;
    this.inReach = Math.sqrt(dx * dx + dy * dy) <= REACH && this.world.inBounds(tx, ty);
  }

  // ------------------------------------------------------------
  //  Sélection de la barre rapide (touches 1..9 + molette)
  // ------------------------------------------------------------
  handleHotbarKeys() {
    const n = this.inventory.order.length;
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
  //  Casser (clic gauche) / Poser (clic droit)
  // ------------------------------------------------------------
  handleClicks() {
    if (!this.inReach) return;

    if (this.input.mouse.leftClicked) {
      this.input.mouse.leftClicked = false;
      const drop = this.world.breakBlock(this.targetTx, this.targetTy);
      if (drop) this.inventory.add(drop);
    }

    if (this.input.mouse.rightClicked) {
      this.input.mouse.rightClicked = false;
      const item = this.inventory.getSelected();
      const placed = this.world.placeBlock(this.targetTx, this.targetTy, item);
      if (placed) this.inventory.remove(item);
    }
  }

  // ------------------------------------------------------------
  //  Rendu
  // ------------------------------------------------------------
  render() {
    const ctx = this.ctx;
    const cam = this.camera;
    const zoom = cam.zoom;
    this.viewW = cam.viewW = window.innerWidth;
    this.viewH = cam.viewH = window.innerHeight;
    const W = this.viewW;
    const H = this.viewH;

    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#2f76b2'; // hors-monde (eau)
    ctx.fillRect(0, 0, W, H);

    ctx.translate(-cam.x * zoom, -cam.y * zoom);
    ctx.scale(zoom, zoom);

    const viewL = Math.floor(cam.x / TILE) - 1;
    const viewT = Math.floor(cam.y / TILE) - 1;
    const viewR = Math.ceil((cam.x + W / zoom) / TILE) + 1;
    const viewB = Math.ceil((cam.y + H / zoom) / TILE) + 1;

    // 1) sols + blocs pleins (bois, pierre)
    const waterFrame = Math.floor(this.time * 2.4) % WATER_FRAMES;
    for (let ty = viewT; ty <= viewB; ty++) {
      for (let tx = viewL; tx <= viewR; tx++) {
        if (tx < 0 || ty < 0 || tx >= WORLD_W || ty >= WORLD_H) continue;
        const i = this.world.idx(tx, ty);
        const floor = this.world.floor[i];
        const block = this.world.blocks[i];

        if (floor === 'water') {
          ctx.drawImage(getWaterFrame((waterFrame + tx + ty) % WATER_FRAMES), tx * TILE, ty * TILE);
        } else {
          ctx.drawImage(getTileCanvas(floor), tx * TILE, ty * TILE);
        }
        // bloc plein posé (pas un objet avec hauteur)
        if (block && BLOCK_DEFS[block].kind === 'block') {
          ctx.drawImage(getTileCanvas(block), tx * TILE, ty * TILE);
        }
      }
    }

    // 2) surbrillance de la tuile ciblée
    if (this.inReach && this.world.inBounds(this.targetTx, this.targetTy)) {
      const i = this.world.idx(this.targetTx, this.targetTy);
      const hasBlock = this.world.blocks[i] !== null;
      const onWater = this.world.floor[i] === 'water';
      const diggable = this.world.isDiggable(this.targetTx, this.targetTy);
      const canAct = hasBlock || diggable || !onWater;
      const px = this.targetTx * TILE, py = this.targetTy * TILE;

      // halo animé
      const pulse = 0.5 + Math.sin(this.time * 6) * 0.2;
      ctx.save();
      ctx.strokeStyle = canAct ? `rgba(255,255,255,${0.7 + pulse})` : 'rgba(255,80,80,0.85)';
      ctx.lineWidth = 2.5 / zoom;
      ctx.shadowColor = canAct ? 'rgba(255,255,255,0.6)' : 'rgba(255,80,80,0.6)';
      ctx.shadowBlur = 8;
      ctx.fillStyle = canAct ? 'rgba(255,255,255,0.10)' : 'rgba(255,80,80,0.12)';
      const r = 6;
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(px + 1, py + 1, TILE - 2, TILE - 2, r); ctx.fill(); ctx.stroke(); }
      else { ctx.fillRect(px + 1, py + 1, TILE - 2, TILE - 2); ctx.strokeRect(px + 1, py + 1, TILE - 2, TILE - 2); }
      ctx.restore();
    }

    // 3) objets (arbres, rochers) + joueurs, triés par profondeur
    const drawables = [];
    for (let ty = viewT; ty <= viewB; ty++) {
      for (let tx = viewL; tx <= viewR; tx++) {
        if (tx < 0 || ty < 0 || tx >= WORLD_W || ty >= WORLD_H) continue;
        const b = this.world.objectAt(tx, ty);
        if (b) {
          const cx = tx * TILE + TILE / 2;
          const cy = ty * TILE + TILE / 2;
          const isTree = b === 'tree';
          drawables.push({
            sortY: cy,
            draw: () => isTree ? drawTreeObject(ctx, cx, cy) : drawRockObject(ctx, cx, cy),
          });
        }
      }
    }

    drawables.push({ sortY: this.player.y, draw: () => this.drawPlayer(ctx, this.player) });
    for (const p of this.otherPlayers) {
      drawables.push({ sortY: p.y, draw: () => this.drawPlayer(ctx, p) });
    }

    drawables.sort((a, b) => a.sortY - b.sortY);
    for (const d of drawables) d.draw();

    ctx.restore();

    // 4) vignette d'ambiance (coin légèrement assombris)
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(10,18,12,0.28)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  drawPlayer(ctx, player) {
    drawCharacter(ctx, player.appearance, player.x, player.y, {
      facing: player.facing,
      walkPhase: player.moving ? player.walkPhase : 0,
      scale: 1,
    });
    this.drawNameTag(ctx, player);
  }

  drawNameTag(ctx, player) {
    const name = player.appearance.name;
    ctx.font = 'bold 9px system-ui, sans-serif';
    const w = ctx.measureText(name).width + 8;
    ctx.fillStyle = 'rgba(20,25,20,0.72)';
    const bx = player.x - w / 2;
    const by = player.y - 46;
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(bx, by, w, 13, 6); ctx.fill(); }
    else ctx.fillRect(bx, by, w, 13);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, player.x, by + 7);
  }
}
