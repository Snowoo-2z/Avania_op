// ============================================================
//  AVANIA — Entité joueur (position, déplacement, collisions)
// ============================================================

import { TILE, PLAYER_SPEED, PLAYER_RADIUS, DEFAULT_APPEARANCE } from './config.js';

export class Player {
  constructor(x, y, appearance = {}) {
    this.x = x;
    this.y = y;
    this.appearance = { ...DEFAULT_APPEARANCE, ...appearance };
    this.facing = 'down';
    this.moving = false;
    this.walkPhase = 0;
    this.sortY = y; // pour le tri de profondeur
  }

  // tente de déplacer le joueur ; gère les collisions avec le monde
  update(dir, dt, world) {
    if (dir.x === 0 && dir.y === 0) {
      this.moving = false;
      return;
    }

    this.moving = true;
    const step = PLAYER_SPEED * dt;

    // Déplacement en X (avec résolution de collision)
    let nx = this.x + dir.x * step;
    if (!this.collides(world, nx, this.y)) this.x = nx;

    // Déplacement en Y
    let ny = this.y + dir.y * step;
    if (!this.collides(world, this.x, ny)) this.y = ny;

    // Orientation
    if (Math.abs(dir.x) > Math.abs(dir.y)) this.facing = dir.x > 0 ? 'right' : 'left';
    else this.facing = dir.y > 0 ? 'down' : 'up';

    this.walkPhase += dt * 11;
    this.sortY = this.y;
  }

  // collision : cercle du joueur contre les tuiles solides
  collides(world, px, py) {
    const r = PLAYER_RADIUS;
    const d = r * 0.7;
    // Évite d'allouer un tableau à chaque frame : important sur petits PC.
    return world.isSolidAt(px, py - r)
      || world.isSolidAt(px, py + r)
      || world.isSolidAt(px - r, py)
      || world.isSolidAt(px + r, py)
      || world.isSolidAt(px - d, py - d)
      || world.isSolidAt(px + d, py - d)
      || world.isSolidAt(px - d, py + d)
      || world.isSolidAt(px + d, py + d);
  }
}
