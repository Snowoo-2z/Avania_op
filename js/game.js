// ============================================================
//  AVANIA — Boucle de jeu principale & rendu
// ============================================================

import { TILE, WORLD_W, WORLD_H } from './config.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Camera } from './camera.js';
import { Input } from './input.js';
import { buildTileset, getTileCanvas } from './tileset.js';
import { drawDecor } from './decor.js';
import { drawCharacter } from './character.js';

export class Game {
  constructor(canvas, appearance) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = new World();
    this.player = new Player(this.world.spawn.x, this.world.spawn.y, appearance);
    this.input = new Input();
    this.viewW = window.innerWidth;
    this.viewH = window.innerHeight;
    this.camera = new Camera(this.viewW, this.viewH, WORLD_W * TILE, WORLD_H * TILE);
    this.camera.snapTo(this.player.x, this.player.y);

    this.money = 0; // porte-monnaie (l'économie viendra bientôt !)
    this.otherPlayers = []; // futurs joueurs en ligne
    this.lastTime = performance.now();
    this.tileset = buildTileset();

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
    const dir = this.input.getDirection();
    this.player.update(dir, dt, this.world);
    this.camera.follow(this.player.x, this.player.y, dt);
  }

  // ------------------------------------------------------------
  //  Rendu
  // ------------------------------------------------------------
  render() {
    const ctx = this.ctx;
    const cam = this.camera;
    const zoom = cam.zoom;
    // mise à jour de la vue (gère le redimensionnement de la fenêtre)
    this.viewW = cam.viewW = window.innerWidth;
    this.viewH = cam.viewH = window.innerHeight;
    const W = this.viewW;
    const H = this.viewH;

    ctx.save();
    ctx.clearRect(0, 0, W, H);

    // fond
    ctx.fillStyle = '#4f7d31';
    ctx.fillRect(0, 0, W, H);

    // transformation caméra
    ctx.translate(-cam.x * zoom, -cam.y * zoom);
    ctx.scale(zoom, zoom);

    const viewL = Math.floor(cam.x / TILE) - 1;
    const viewT = Math.floor(cam.y / TILE) - 1;
    const viewR = Math.ceil((cam.x + W / zoom) / TILE) + 1;
    const viewB = Math.ceil((cam.y + H / zoom) / TILE) + 1;

    // 1) tuiles de base
    for (let ty = viewT; ty <= viewB; ty++) {
      for (let tx = viewL; tx <= viewR; tx++) {
        if (tx < 0 || ty < 0 || tx >= WORLD_W || ty >= WORLD_H) continue;
        const key = this.world.grid[this.world.idx(tx, ty)];
        ctx.drawImage(getTileCanvas(key), tx * TILE, ty * TILE);
      }
    }

    // 2) objets triés par profondeur (décor + joueur)
    const drawables = [];
    for (const d of this.world.drawables) {
      if (d.x < (viewL - 2) * TILE || d.x > (viewR + 2) * TILE) continue;
      if (d.y < (viewT - 2) * TILE || d.y > (viewB + 2) * TILE) continue;
      drawables.push({ sortY: d.sortY, draw: () => drawDecor(ctx, d) });
    }
    // joueur local
    drawables.push({
      sortY: this.player.y + 6,
      draw: () => this.drawPlayer(ctx, this.player),
    });
    // futurs autres joueurs
    for (const p of this.otherPlayers) {
      drawables.push({ sortY: p.y + 6, draw: () => this.drawPlayer(ctx, p) });
    }

    drawables.sort((a, b) => a.sortY - b.sortY);
    for (const d of drawables) d.draw();

    ctx.restore();
  }

  drawPlayer(ctx, player) {
    drawCharacter(ctx, player.appearance, player.x, player.y, {
      facing: player.facing,
      walkPhase: player.moving ? player.walkPhase : 0,
      scale: 1,
    });
    // nom au-dessus du personnage
    this.drawNameTag(ctx, player);
  }

  drawNameTag(ctx, player) {
    const name = player.appearance.name;
    ctx.font = 'bold 9px system-ui, sans-serif';
    const w = ctx.measureText(name).width + 8;
    ctx.fillStyle = 'rgba(20,25,20,0.72)';
    ctx.beginPath();
    const bx = player.x - w / 2;
    const by = player.y - 34;
    ctx.roundRect ? ctx.roundRect(bx, by, w, 13, 6) : ctx.rect(bx, by, w, 13);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, player.x, by + 7);
  }
}
