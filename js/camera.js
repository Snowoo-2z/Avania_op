// ============================================================
//  AVANIA — Caméra (suit le joueur, bornée aux limites du monde)
// ============================================================

import { clamp, lerp } from './utils.js';

export class Camera {
  constructor(viewW, viewH, worldW, worldH) {
    this.viewW = viewW;
    this.viewH = viewH;
    this.worldW = worldW;
    this.worldH = worldH;
    this.x = 0;
    this.y = 0;
    this.zoom = 2; // facteur de zoom du rendu
  }

  // centre la caméra instantanément sur une cible
  snapTo(tx, ty) {
    this.x = clamp(tx - this.viewW / 2 / this.zoom, 0, this.worldW - this.viewW / this.zoom);
    this.y = clamp(ty - this.viewH / 2 / this.zoom, 0, this.worldH - this.viewH / this.zoom);
  }

  // suit en douceur (lerp)
  follow(tx, ty, dt) {
    const tx2 = clamp(tx - this.viewW / 2 / this.zoom, 0, Math.max(0, this.worldW - this.viewW / this.zoom));
    const ty2 = clamp(ty - this.viewH / 2 / this.zoom, 0, Math.max(0, this.worldH - this.viewH / this.zoom));
    const k = 1 - Math.pow(0.0001, dt); // lissage indépendant du framerate
    this.x = lerp(this.x, tx2, k);
    this.y = lerp(this.y, ty2, k);
  }
}
