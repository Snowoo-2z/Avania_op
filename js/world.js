// ============================================================
//  AVANIA — Le monde (bac à sable)
//  Un terrain plat et vide (aucune construction prédéfinie) :
//  juste de l'herbe, une bordure d'eau, et quelques ressources
//  naturelles (arbres, rochers) à récolter pour construire.
// ============================================================

import { TILE, WORLD_W, WORLD_H } from './config.js';
import { mulberry32 } from './utils.js';
import { BLOCK_DEFS, ITEM_DEFS, DIGGABLE_FLOOR, SOLID_FLOOR, CROPS } from './blocks.js';
import { generateCaveLevel, buildCaveEntrance, CAVE } from './cave.js';
import { buildHarbor } from './harbor.js';
import { buildAnchorage, ISLANDS } from './islands.js';

const W = WORLD_W;
const H = WORLD_H;

export class World {
  constructor(seed = 20260821, options = {}) {
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.w = W;
    this.h = H;
    // 'surface' (une île) ou 'cave' (un niveau souterrain).
    this.kind = options.kind || 'surface';
    this.depth = options.depth || 0;
    // Identifiant stable, utilisé par le jeu pour retrouver l'état
    // (fours, coffres, objets au sol) d'une dimension. Les îles
    // rejointes par le passeur portent leur propre id (voir
    // js/islands.js) : 'surface' reste celle du départ.
    this.id = options.id || (this.kind === 'cave' ? `cave:${this.depth}` : 'surface');
    // Caractéristiques de l'île : une île nommée (js/islands.js) porte
    // ses propres réglages, qu'on peut forcer via `options`.
    const def = ISLANDS[options.id] || null;
    // Île vierge : ni ouvrage (port, entrée de grotte) ni ressource.
    // Sert aux destinations de la traversée tant que la ville n'y est
    // pas construite.
    this.bare = options.bare !== undefined ? !!options.bare : !!(def && def.bare);
    // Mouillage d'une île vierge : une crique et le ferry à l'ancre.
    this.anchorage = options.anchorage || (def ? def.anchorage : null);

    // Couche "sol" (toujours praticable sauf l'eau) : grass / water
    this.floor = new Array(W * H).fill('grass');
    // Couche "blocs" posés dessus : null = vide, sinon id de bloc
    this.blocks = new Array(W * H).fill(null);
    // Deuxième couche de blocs (empilés) pour faire des fenêtres et des murs plus hauts
    this.blocks2 = new Array(W * H).fill(null);
    // État des portes : 0 = fermée (obstacle), 1 = ouverte (praticable)
    this.doorOpen = new Uint8Array(W * H);

    this.spawn = { x: (W / 2) * TILE + TILE / 2, y: (H / 2) * TILE + TILE / 2 };
    // Emplacement de l'entrée de la grotte (surface uniquement).
    this.caveEntrance = null;
    this.generate();
  }

  idx(tx, ty) { return ty * W + tx; }
  inBounds(tx, ty) { return tx >= 0 && ty >= 0 && tx < W && ty < H; }

  floorAt(tx, ty) { return this.inBounds(tx, ty) ? this.floor[this.idx(tx, ty)] : 'water'; }
  blockAt(tx, ty, layer = null) {
    if (!this.inBounds(tx, ty)) return null;
    const i = this.idx(tx, ty);
    if (layer === 2) return this.blocks2 ? this.blocks2[i] : null;
    if (layer === 1) return this.blocks[i];
    // Par défaut, renvoie le bloc du dessus (couche 2) s'il existe, sinon la base (couche 1)
    if (this.blocks2 && this.blocks2[i]) return this.blocks2[i];
    return this.blocks[i];
  }

  // ------------------------------------------------------------------
  //  Génération : terrain vide + ressources naturelles
  // ------------------------------------------------------------------
  generate() {
    // Une grotte est un monde à part entière : galeries creusées dans
    // la roche, pierre et fer uniquement (voir js/cave.js).
    if (this.kind === 'cave') {
      generateCaveLevel(this);
      return;
    }

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

    // 3) ressources naturelles éparpillées (arbres + rochers + minerai de fer).
    //    Une île vierge n'en reçoit aucune : c'est un terrain nu.
    if (!this.bare) {
      for (let ty = 3; ty < H - 3; ty++) {
        for (let tx = 3; tx < W - 3; tx++) {
          const r = this.rng();
          if (r < 0.030) this.setBlock(tx, ty, 'tree');
          else if (r < 0.050) this.setBlock(tx, ty, 'rock');
          // Minerai de fer volontairement RARE (~0,22 % des cases) :
          // chaque filon compte, le fer reste une ressource précieuse.
          else if (r < 0.0522) this.setBlock(tx, ty, 'ironOre');
        }
      }
    }

    // 4) on garantit quelques ressources près du spawn pour démarrer
    //    (pas sur une île vierge).
    if (!this.bare) {
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

    // 5) Le port, sur la côte EST : une darse creusée dans la carte, deux
    //    jetées, un quai, une cour de stockage et le ferry amarré
    //    (voir js/harbor.js).
    //    C'est le seul ouvrage pré-construit de l'île : un point de
    //    ralliement, et le départ des traversées. Les îles vierges
    //    attendent leur ville.
    if (!this.bare) buildHarbor(this);

    // 6) La falaise et l'entrée de la grotte, à un endroit fixe de l'île.
    //    Placée en dernier : elle écrase toute ressource qui se
    //    trouverait là, pour que l'accès reste toujours dégagé.
    //    Aucune grotte sur une île vierge.
    this.caveEntrance = this.bare ? null : buildCaveEntrance(this);

    // 7) Une île vierge a seulement son mouillage : une crique dans la
    //    côte et le ferry qui attend. Pas de quai, pas de port (voir
    //    js/islands.js).
    if (this.anchorage) buildAnchorage(this, this.anchorage);
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
    // Sols bloquants : l'eau à la surface, la roche massive sous terre.
    // La liste est déduite de BLOCK_DEFS (SOLID_FLOOR) : une recherche
    // dans un Set au lieu d'une chaîne de comparaisons.
    if (SOLID_FLOOR.has(this.floor[this.idx(tx, ty)])) return true;
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
    const block = this.blockAt(tx, ty);
    if (block && BLOCK_DEFS[block]) return BLOCK_DEFS[block].requiredTool || null;
    return DIGGABLE_FLOOR[this.floor[this.idx(tx, ty)]]?.tool || null;
  }

  // Temps de minage de base, en secondes, avant application de l'efficacité
  // de l'outil. La main reste possible mais nettement moins confortable.
  breakDurationAt(tx, ty) {
    if (!this.inBounds(tx, ty)) return 0;
    const block = this.blockAt(tx, ty);
    if (block && BLOCK_DEFS[block]) return BLOCK_DEFS[block].breakTime || 0.8;
    return DIGGABLE_FLOOR[this.floor[this.idx(tx, ty)]]?.breakTime || 0;
  }

  // Casse le bloc (ou objet) en (tx,ty). Retourne l'objet récupéré, ou null.
  // Si le sol est creusable (sable, terre), on le récolte aussi.
  breakBlock(tx, ty) {
    if (!this.inBounds(tx, ty)) return null;
    const i = this.idx(tx, ty);
    
    // On casse d'abord le bloc du dessus s'il existe
    if (this.blocks2 && this.blocks2[i]) {
      const b = this.blocks2[i];
      const def = BLOCK_DEFS[b];
      this.blocks2[i] = null;
      return def.drop;
    }

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
    const i = this.idx(tx, ty);
    const item = ITEM_DEFS[itemId];
    if (!item || !item.place) return false;

    // Les cultures ne poussent que sur de la terre labourée : semer dans
    // l'herbe ou le sable n'a aucun sens (et le blé mourrait).
    if (CROPS.includes(item.place) && this.floor[i] !== 'farmland') return false;

    // Empêche de construire directement derrière un mur (une case au-dessus)
    // car le mur en perspective cache cette tuile. Le passage reste libre pour marcher !
    const blockBelow = this.blockAt(tx, ty + 1);
    if (blockBelow) {
      const defBelow = BLOCK_DEFS[blockBelow];
      if (defBelow && defBelow.kind === 'block') {
        return false;
      }
    }

    const baseBlock = this.blocks[i];
    if (baseBlock === null) {
      if (SOLID_FLOOR.has(this.floor[i])) return false;
      this.blocks[i] = item.place;
      return true;
    } else {
      // Un coffre est une boîte complète : on n'empile rien dessus
      // (comme dans Minecraft, un coffre ne supporte pas d'objet posé).
      if (baseBlock === 'chest') return false;
      // Si un bloc existe déjà, on tente de l'empiler en couche 2!
      const baseDef = BLOCK_DEFS[baseBlock];
      if (baseDef && baseDef.kind === 'block' && this.blocks2[i] === null) {
        const placeDef = BLOCK_DEFS[item.place];
        if (placeDef && placeDef.kind === 'block') {
          this.blocks2[i] = item.place;
          return true;
        }
      }
    }
    return false;
  }

  // ------------------------------------------------------------------
  //  Monde partagé (multijoueur, étape 2) : applique un diff reçu du
  //  réseau (voir js/net-protocol.js sanitizeBlockDiff) tel quel, sans
  //  rejouer breakBlock/placeBlock — un diff DÉCRIT l'état final voulu
  //  pour une tuile, il ne mime pas l'action qui y a mené (le drop, les
  //  particules, l'usure d'outil restent de la mise en scène purement
  //  locale, gérée par js/game.js autour de cet appel).
  //  Retourne true si quelque chose a effectivement changé (utile pour
  //  savoir si les index de rendu doivent être reconstruits).
  // ------------------------------------------------------------------
  applyBlockDiff(tx, ty, diff) {
    if (!this.inBounds(tx, ty)) return false;
    const i = this.idx(tx, ty);
    let changed = false;
    if (Object.prototype.hasOwnProperty.call(diff, 'floor') && diff.floor !== this.floor[i]) {
      this.floor[i] = diff.floor;
      changed = true;
    }
    if (Object.prototype.hasOwnProperty.call(diff, 'blocks') && diff.blocks !== this.blocks[i]) {
      this.blocks[i] = diff.blocks;
      if (!diff.blocks) this.doorOpen[i] = 0; // un bloc qui disparaît ferme/efface son état de porte
      changed = true;
    }
    if (Object.prototype.hasOwnProperty.call(diff, 'blocks2') && diff.blocks2 !== this.blocks2[i]) {
      this.blocks2[i] = diff.blocks2;
      changed = true;
    }
    if (Object.prototype.hasOwnProperty.call(diff, 'door')) {
      const wanted = diff.door ? 1 : 0;
      if (this.doorOpen[i] !== wanted) {
        this.doorOpen[i] = wanted;
        changed = true;
      }
    }
    return changed;
  }

  // Récupère la liste des blocs "objets" visibles (arbres, rochers) pour le tri
  objectAt(tx, ty) {
    const b = this.blockAt(tx, ty);
    if (b && BLOCK_DEFS[b].kind === 'object') return b;
    return null;
  }
}
