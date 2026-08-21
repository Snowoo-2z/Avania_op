// ============================================================
//  AVANIA — Le monde (bac à sable)
//  Un terrain plat et vide (aucune construction prédéfinie) :
//  juste de l'herbe, une bordure d'eau, et quelques ressources
//  naturelles (arbres, rochers) à récolter pour construire.
// ============================================================

import { TILE, WORLD_W, WORLD_H } from './config.js';
import { mulberry32 } from './utils.js';
import { BLOCK_DEFS } from './blocks.js';

const W = WORLD_W;
const H = WORLD_H;

export class World {
  constructor(seed = 20260821) {
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.w = W;
    this.h = H;

    // Couche "sol" (toujours praticable sauf l'eau) : grass / water
    this.floor = new Array(W * H).fill('grass');
    // Couche "blocs" posés dessus : null = vide, sinon id de bloc
    this.blocks = new Array(W * H).fill(null);

    this.spawn = { x: (W / 2) * TILE + TILE / 2, y: (H / 2) * TILE + TILE / 2 };
    this.generate();
  }

  idx(tx, ty) { return ty * W + tx; }
  inBounds(tx, ty) { return tx >= 0 && ty >= 0 && tx < W && ty < H; }

  floorAt(tx, ty) { return this.inBounds(tx, ty) ? this.floor[this.idx(tx, ty)] : 'water'; }
  blockAt(tx, ty) { return this.inBounds(tx, ty) ? this.blocks[this.idx(tx, ty)] : null; }

  // ------------------------------------------------------------------
  //  Génération : terrain vide + ressources naturelles
  // ------------------------------------------------------------------
  generate() {
    // 1) bordure d'eau tout autour (limite du monde)
    for (let ty = 0; ty < H; ty++) {
      for (let tx = 0; tx < W; tx++) {
        const edge = tx < 2 || ty < 2 || tx >= W - 2 || ty >= H - 2;
        if (edge) this.floor[this.idx(tx, ty)] = 'water';
      }
    }

    // 2) ressources naturelles éparpillées (arbres + rochers)
    for (let ty = 3; ty < H - 3; ty++) {
      for (let tx = 3; tx < W - 3; tx++) {
        const r = this.rng();
        if (r < 0.030) this.setBlock(tx, ty, 'tree');
        else if (r < 0.050) this.setBlock(tx, ty, 'rock');
      }
    }

    // 3) on garantit quelques ressources près du spawn pour démarrer
    const cx = Math.floor(this.spawn.x / TILE);
    const cy = Math.floor(this.spawn.y / TILE);
    this.setBlock(cx + 3, cy + 2, 'tree');
    this.setBlock(cx - 3, cy + 3, 'tree');
    this.setBlock(cx + 4, cy - 2, 'rock');
    this.setBlock(cx - 4, cy - 3, 'rock');
    this.setBlock(cx - 2, cy + 4, 'rock');
  }

  setBlock(tx, ty, id) {
    if (!this.inBounds(tx, ty)) return;
    this.blocks[this.idx(tx, ty)] = id;
  }

  // ------------------------------------------------------------------
  //  Collisions
  // ------------------------------------------------------------------
  isSolidTile(tx, ty) {
    if (!this.inBounds(tx, ty)) return true; // hors monde = solide
    if (this.floor[this.idx(tx, ty)] === 'water') return true;
    const b = this.blocks[this.idx(tx, ty)];
    if (b && BLOCK_DEFS[b].solid) return true;
    return false;
  }

  isSolidAt(px, py) {
    return this.isSolidTile(Math.floor(px / TILE), Math.floor(py / TILE));
  }

  // ------------------------------------------------------------------
  //  Interactions (casser / poser)
  // ------------------------------------------------------------------

  // Casse le bloc (ou objet) en (tx,ty). Retourne l'objet récupéré, ou null.
  breakBlock(tx, ty) {
    if (!this.inBounds(tx, ty)) return null;
    const b = this.blocks[this.idx(tx, ty)];
    if (!b) return null;
    const def = BLOCK_DEFS[b];
    if (!def.breakable) return null;
    this.blocks[this.idx(tx, ty)] = null;
    return def.drop;
  }

  // Pose un bloc (à partir d'un objet de l'inventaire) en (tx,ty).
  // Retourne true si posé.
  placeBlock(tx, ty, itemId) {
    if (!this.inBounds(tx, ty)) return false;
    // on ne peut pas poser sur l'eau, ni sur un bloc déjà présent
    if (this.floor[this.idx(tx, ty)] === 'water') return false;
    if (this.blocks[this.idx(tx, ty)] !== null) return false;
    const place = { wood: 'wood', stone: 'stone' }[itemId];
    if (!place) return false;
    this.blocks[this.idx(tx, ty)] = place;
    return true;
  }

  // Récupère la liste des blocs "objets" visibles (arbres, rochers) pour le tri
  objectAt(tx, ty) {
    const b = this.blockAt(tx, ty);
    if (b && BLOCK_DEFS[b].kind === 'object') return b;
    return null;
  }
}
