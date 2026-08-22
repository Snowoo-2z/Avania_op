// ============================================================
//  AVANIA — Le monde (bac à sable)
//  Un terrain plat et vide (aucune construction prédéfinie) :
//  juste de l'herbe, une bordure d'eau, et quelques ressources
//  naturelles (arbres, rochers) à récolter pour construire.
// ============================================================

import { TILE, WORLD_W, WORLD_H } from './config.js';
import { mulberry32 } from './utils.js';
import { BLOCK_DEFS, ITEM_DEFS, DIGGABLE_FLOOR } from './blocks.js';

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
    // État des portes : 0 = fermée (obstacle), 1 = ouverte (praticable)
    this.doorOpen = new Uint8Array(W * H);

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
    // 1) sol : herbe avec variations visuelles (déterministe)
    for (let ty = 0; ty < H; ty++) {
      for (let tx = 0; tx < W; tx++) {
        const r = this.rng();
        if (r < 0.10) this.floor[this.idx(tx, ty)] = 'grassDark';
        else if (r < 0.16) this.floor[this.idx(tx, ty)] = 'flowers';
        else if (r < 0.19) this.floor[this.idx(tx, ty)] = 'dirt';
        // sinon 'grass' (défaut)
      }
    }

    // 2) bordure d'eau tout autour + plage de sable
    for (let ty = 0; ty < H; ty++) {
      for (let tx = 0; tx < W; tx++) {
        const edge = tx < 2 || ty < 2 || tx >= W - 2 || ty >= H - 2;
        if (edge) this.floor[this.idx(tx, ty)] = 'water';
        const shore = tx === 2 || ty === 2 || tx === W - 3 || ty === H - 3;
        if (shore) this.floor[this.idx(tx, ty)] = 'sand';
      }
    }

    // 3) ressources naturelles éparpillées (arbres + rochers + minerai de fer)
    for (let ty = 3; ty < H - 3; ty++) {
      for (let tx = 3; tx < W - 3; tx++) {
        const r = this.rng();
        if (r < 0.030) this.setBlock(tx, ty, 'tree');
        else if (r < 0.050) this.setBlock(tx, ty, 'rock');
        else if (r < 0.0575) this.setBlock(tx, ty, 'ironOre');
      }
    }

    // 4) on garantit quelques ressources près du spawn pour démarrer
    const cx = Math.floor(this.spawn.x / TILE);
    const cy = Math.floor(this.spawn.y / TILE);
    this.setBlock(cx + 3, cy + 2, 'tree');
    this.setBlock(cx - 3, cy + 3, 'tree');
    this.setBlock(cx + 4, cy - 2, 'rock');
    this.setBlock(cx - 4, cy - 3, 'rock');
    this.setBlock(cx - 2, cy + 4, 'rock');
    this.setBlock(cx + 2, cy - 4, 'ironOre');
    this.setBlock(cx - 3, cy - 4, 'ironOre');
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
    if (!b) return false;
    const def = BLOCK_DEFS[b];
    if (!def.solid) return false;
    // Une porte ouverte ne bloque pas le passage.
    if (def.kind === 'door' && this.doorOpen[this.idx(tx, ty)]) return false;
    return true;
  }

  // Ouvre / ferme une porte en (tx,ty). Retourne le nouvel état (true = ouverte).
  toggleDoor(tx, ty) {
    if (!this.inBounds(tx, ty)) return false;
    const i = this.idx(tx, ty);
    if (this.blocks[i] !== 'door') return false;
    this.doorOpen[i] = this.doorOpen[i] ? 0 : 1;
    return this.doorOpen[i] === 1;
  }

  isDoorOpen(tx, ty) {
    if (!this.inBounds(tx, ty)) return false;
    return this.blocks[this.idx(tx, ty)] === 'door' && this.doorOpen[this.idx(tx, ty)] === 1;
  }

  isSolidAt(px, py) {
    return this.isSolidTile(Math.floor(px / TILE), Math.floor(py / TILE));
  }

  // ------------------------------------------------------------------
  //  Interactions (casser / poser)
  // ------------------------------------------------------------------

  // Outil conseillé pour l'action en cours (informatif et utilisé par le
  // joueur pour la vitesse / la durabilité, sans rendre le monde bloquant).
  requiredToolAt(tx, ty) {
    if (!this.inBounds(tx, ty)) return null;
    const i = this.idx(tx, ty);
    const block = this.blocks[i];
    if (block && BLOCK_DEFS[block]) return BLOCK_DEFS[block].requiredTool || null;
    return DIGGABLE_FLOOR[this.floor[i]]?.tool || null;
  }

  // Temps de minage de base, en secondes, avant application de l'efficacité
  // de l'outil. La main reste possible mais nettement moins confortable.
  breakDurationAt(tx, ty) {
    if (!this.inBounds(tx, ty)) return 0;
    const i = this.idx(tx, ty);
    const block = this.blocks[i];
    if (block && BLOCK_DEFS[block]) return BLOCK_DEFS[block].breakTime || 0.8;
    return DIGGABLE_FLOOR[this.floor[i]]?.breakTime || 0;
  }

  // Casse le bloc (ou objet) en (tx,ty). Retourne l'objet récupéré, ou null.
  // Si le sol est creusable (sable, terre), on le récolte aussi.
  breakBlock(tx, ty) {
    if (!this.inBounds(tx, ty)) return null;
    const i = this.idx(tx, ty);
    const b = this.blocks[i];
    if (b) {
      const def = BLOCK_DEFS[b];
      if (!def.breakable) return null;
      this.blocks[i] = null;
      this.doorOpen[i] = 0;
      return def.drop;
    }
    // sol creusable à la pelle
    const dig = DIGGABLE_FLOOR[this.floor[i]];
    if (dig) {
      this.floor[i] = dig.becomes;
      return dig.drop;
    }
    return null;
  }

  // Le sol en (tx,ty) peut-il être creusé (récolté) ?
  isDiggable(tx, ty) {
    if (!this.inBounds(tx, ty)) return false;
    return this.blocks[this.idx(tx, ty)] === null && !!DIGGABLE_FLOOR[this.floor[this.idx(tx, ty)]];
  }

  // Pose un bloc (à partir d'un objet de l'inventaire) en (tx,ty).
  // Retourne true si posé.
  placeBlock(tx, ty, itemId) {
    if (!this.inBounds(tx, ty)) return false;
    // on ne peut pas poser sur l'eau, ni sur un bloc déjà présent
    if (this.floor[this.idx(tx, ty)] === 'water') return false;
    if (this.blocks[this.idx(tx, ty)] !== null) return false;
    const item = ITEM_DEFS[itemId];
    if (!item || !item.place) return false;
    this.blocks[this.idx(tx, ty)] = item.place;
    return true;
  }

  // Récupère la liste des blocs "objets" visibles (arbres, rochers) pour le tri
  objectAt(tx, ty) {
    const b = this.blockAt(tx, ty);
    if (b && BLOCK_DEFS[b].kind === 'object') return b;
    return null;
  }
}
