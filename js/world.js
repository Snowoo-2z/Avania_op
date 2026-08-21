// ============================================================
//  AVANIA — Génération du monde (village top-down)
//  Un monde généré de façon déterministe à partir d'une seed :
//  la même seed donne toujours le même village.
// ============================================================

import { TILE, WORLD_W, WORLD_H, COLORS } from './config.js';
import { mulberry32, randInt, pick, clamp } from './utils.js';
import { TILE_DEFS } from './tileset.js';

const W = WORLD_W;
const H = WORLD_H;

// Définition des bâtiments du village
// { name, x, y, w, h, roof, door } (en tuiles, x/y = coin haut-gauche)
const BUILDINGS = [
  { name: 'Mairie',     x: 45, y: 40, w: 13, h: 10, roof: '#b5453c', door: 's' },
  { name: 'Café',       x: 38, y: 47, w: 8,  h: 7,  roof: '#3f7d5a', door: 'e' },
  { name: 'Maison',     x: 33, y: 38, w: 7,  h: 7,  roof: '#4a90d9', door: 's' },
  { name: 'Maison',     x: 33, y: 50, w: 7,  h: 7,  roof: '#e0a03c', door: 'e' },
  { name: 'Grange',     x: 26, y: 51, w: 10, h: 7,  roof: '#8a5a34', door: 's' },

  { name: 'Boutique',   x: 74, y: 42, w: 9,  h: 8,  roof: '#6a4ab0', door: 'w' },
  { name: 'Bricolage',  x: 87, y: 44, w: 10, h: 8,  roof: '#4a6a8a', door: 'w' },
  { name: 'Maison',     x: 76, y: 32, w: 7,  h: 7,  roof: '#5ab06a', door: 's' },
  { name: 'Maison',     x: 88, y: 33, w: 7,  h: 7,  roof: '#d06a5a', door: 's' },

  { name: 'Banque',     x: 42, y: 72, w: 12, h: 9,  roof: '#c9a52a', door: 'n' },
  { name: 'Maison',     x: 35, y: 86, w: 7,  h: 7,  roof: '#5aa0c9', door: 'n' },
  { name: 'Maison',     x: 29, y: 72, w: 7,  h: 7,  roof: '#b06ac9', door: 'e' },

  { name: 'Police',     x: 74, y: 72, w: 12, h: 9,  roof: '#3a5a8c', door: 'n' },
  { name: 'Marché',     x: 87, y: 74, w: 11, h: 9,  roof: '#4f9337', door: 'n' },
  { name: 'Maison',     x: 78, y: 86, w: 7,  h: 7,  roof: '#c96a8c', door: 'n' },
];

export class World {
  constructor(seed = 20260821) {
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.w = W;
    this.h = H;
    this.grid = new Array(W * H).fill('grass');
    this.solid = new Uint8Array(W * H);
    this.drawables = []; // décor trié par profondeur (arbres, toits, fontaine…)
    this.buildings = [];
    this.spawn = { x: 65 * TILE + TILE / 2, y: 70 * TILE + TILE / 2 };
    this.generate();
  }

  idx(tx, ty) { return ty * W + tx; }
  inBounds(tx, ty) { return tx >= 0 && ty >= 0 && tx < W && ty < H; }
  tile(tx, ty) { return this.inBounds(tx, ty) ? this.grid[this.idx(tx, ty)] : 'grass'; }

  set(tx, ty, key) {
    if (!this.inBounds(tx, ty)) return;
    this.grid[this.idx(tx, ty)] = key;
    this.solid[this.idx(tx, ty)] = TILE_DEFS[key].solid ? 1 : 0;
  }

  fillRect(x, y, w, h, key) {
    for (let ty = y; ty < y + h; ty++)
      for (let tx = x; tx < x + w; tx++)
        this.set(tx, ty, key);
  }

  makeSolid(tx, ty) { if (this.inBounds(tx, ty)) this.solid[this.idx(tx, ty)] = 1; }

  isSolidTile(tx, ty) {
    if (!this.inBounds(tx, ty)) return true; // hors du monde = solide
    return this.solid[this.idx(tx, ty)] === 1;
  }

  isSolidAt(px, py) {
    return this.isSolidTile(Math.floor(px / TILE), Math.floor(py / TILE));
  }

  // ------------------------------------------------------------------
  //  Génération complète
  // ------------------------------------------------------------------
  generate() {
    this.genTerrain();
    this.genRiver();
    this.genRoads();
    this.genBuildings();
    this.genFarm();
    this.genDecor();
    this.genForest();
    this.finalizeSolid();
  }

  // Sol de base : herbe avec variations
  genTerrain() {
    for (let ty = 0; ty < H; ty++) {
      for (let tx = 0; tx < W; tx++) {
        const r = this.rng();
        this.grid[this.idx(tx, ty)] = r < 0.2 ? 'grass2' : 'grass';
      }
    }
    // Un lac en haut à droite
    this.fillRect(108, 8, 16, 18, 'water');
    this.fillRect(106, 6, 20, 22, 'sand');
    this.fillRect(108, 8, 16, 18, 'water');
    // Un petit étang en bas à gauche
    this.fillRect(12, 112, 12, 10, 'sand');
    this.fillRect(14, 114, 8, 6, 'water');
  }

  // Rivière qui traverse le sud, avec un pont
  genRiver() {
    const r0 = 100, r1 = 105; // bande de la rivière
    this.fillRect(0, r0, W, r1 - r0 + 1, 'water');
    // berges de sable
    for (let tx = 0; tx < W; tx++) {
      if (tx >= 61 && tx <= 66) continue; // le pont
      this.set(tx, r0 - 1, 'sand');
      this.set(tx, r1 + 1, 'sand');
    }
    // le pont (plancher bois) sur la route verticale
    this.fillRect(61, r0, 6, r1 - r0 + 1, 'wood');
    for (let tx = 61; tx <= 66; tx++) { this.set(tx, r0 - 1, 'wood'); this.set(tx, r1 + 1, 'wood'); }
  }

  // Routes : une croix de pierre au centre + une place
  genRoads() {
    // route verticale
    this.fillRect(61, 0, 6, H, 'road');
    // route horizontale
    this.fillRect(0, 61, W, 6, 'road');
    // la place centrale
    this.fillRect(56, 56, 18, 18, 'plaza');
    // contours de la place (bordures)
    this.fillRect(55, 55, 20, 20, 'plaza');
    this.fillRect(56, 56, 18, 18, 'plaza');
    // chemins de terre vers les bâtiments
    this.genPaths();
  }

  // Petits chemins reliant les portes aux routes
  genPaths() {
    for (const b of BUILDINGS) {
      const d = this.doorTile(b);
      this.pathTo(d.tx, d.ty);
    }
  }

  pathTo(tx, ty) {
    // relie (tx,ty) à la route/place la plus proche en terre battue
    // on trace un chemin droit vers la route horizontale ou verticale
    if (tx <= 60) {
      // on va vers la droite (route verticale)
      for (let x = tx; x <= 60; x++) if (this.tile(x, ty) === 'grass' || this.tile(x, ty) === 'grass2') this.set(x, ty, 'path');
    } else if (tx >= 67) {
      for (let x = tx; x >= 67; x--) if (this.tile(x, ty) === 'grass' || this.tile(x, ty) === 'grass2') this.set(x, ty, 'path');
    } else if (ty <= 60) {
      for (let y = ty; y <= 60; y++) if (this.tile(tx, y) === 'grass' || this.tile(tx, y) === 'grass2') this.set(tx, y, 'path');
    } else {
      for (let y = ty; y >= 67; y--) if (this.tile(tx, y) === 'grass' || this.tile(tx, y) === 'grass2') this.set(tx, y, 'path');
    }
  }

  doorTile(b) {
    let tx = b.x + Math.floor(b.w / 2);
    let ty = b.y + Math.floor(b.h / 2);
    if (b.door === 's') ty = b.y + b.h - 1;
    if (b.door === 'n') ty = b.y;
    if (b.door === 'e') tx = b.x + b.w - 1;
    if (b.door === 'w') tx = b.x;
    return { tx, ty };
  }

  // Placement des bâtiments : murs + porte + toit (décor)
  genBuildings() {
    for (const b of BUILDINGS) {
      this.fillRect(b.x, b.y, b.w, b.h, 'wall');
      const d = this.doorTile(b);
      this.set(d.tx, d.ty, 'door');
      // une marche devant la porte
      if (b.door === 's') this.set(d.tx, d.ty + 1, 'plaza');
      if (b.door === 'n') this.set(d.tx, d.ty - 1, 'plaza');
      if (b.door === 'e') this.set(d.tx + 1, d.ty, 'plaza');
      if (b.door === 'w') this.set(d.tx - 1, d.ty, 'plaza');

      this.buildings.push(b);
      // le toit (décor dessiné au-dessus, trié par profondeur)
      this.drawables.push({
        type: 'roof',
        x: b.x * TILE,
        y: b.y * TILE,
        w: b.w * TILE,
        h: b.h * TILE,
        color: b.roof,
        name: b.name,
        sortY: b.y * TILE,
      });
    }
  }

  // Ferme : champ clôturé + cultures (au sud de la route)
  genFarm() {
    this.fillRect(24, 69, 12, 9, 'crop');
    // clôture périmétrique
    for (let x = 23; x <= 36; x++) { this.set(x, 68, 'fence'); this.set(x, 78, 'fence'); }
    for (let y = 68; y <= 78; y++) { this.set(23, y, 'fence'); this.set(36, y, 'fence'); }
  }

  // Décor ponctuel : fontaine, lampadaires, étals du marché
  genDecor() {
    // fontaine au centre de la place
    this.drawables.push({ type: 'fountain', x: 65 * TILE + 16, y: 65 * TILE + 16, sortY: 66 * TILE });
    this.makeSolid(64, 64); this.makeSolid(64, 65); this.makeSolid(65, 64); this.makeSolid(65, 65);

    // lampadaires aux coins de la place
    const lamps = [[57, 57], [72, 57], [57, 72], [72, 72]];
    for (const [lx, ly] of lamps) {
      this.drawables.push({ type: 'lamp', x: lx * TILE + 16, y: ly * TILE + 16, sortY: ly * TILE + 20 });
      this.makeSolid(lx, ly);
    }

    // étals du marché (au sud de la place)
    for (let i = 0; i < 5; i++) {
      const sx = 56 + i * 4;
      this.drawables.push({
        type: 'stall', x: sx * TILE + 16, y: 76 * TILE + 16, sortY: 76 * TILE + 16,
        color: ['#e05a5a', '#e0a03c', '#5aa0e0', '#5ab06a', '#b06ac9'][i],
      });
      this.makeSolid(sx, 76); this.makeSolid(sx + 1, 76);
    }
  }

  // Arbres, fleurs, buissons, rochers éparpillés + forêts aux bords
  genForest() {
    // forêts sur les bords nord/ouest/est
    this.forestBand(0, 0, W, 5, 0.35);
    this.forestBand(0, 0, 4, H, 0.35);
    this.forestBand(W - 4, 0, 4, H, 0.35);
    this.forestBand(0, H - 3, W, 3, 0.25);

    // éparpillement léger sur toute la carte
    for (let ty = 0; ty < H; ty++) {
      for (let tx = 0; tx < W; tx++) {
        if (this.tile(tx, ty) !== 'grass' && this.tile(tx, ty) !== 'grass2') continue;
        const r = this.rng();
        if (r < 0.012) this.placeTree(tx, ty);
        else if (r < 0.022) this.placeBush(tx, ty);
        else if (r < 0.030) this.set(tx, ty, 'flower');
        else if (r < 0.035) this.set(tx, ty, 'rock');
      }
    }
  }

  forestBand(x0, y0, w, h, density) {
    for (let ty = y0; ty < y0 + h; ty++) {
      for (let tx = x0; tx < x0 + w; tx++) {
        if (this.tile(tx, ty) !== 'grass' && this.tile(tx, ty) !== 'grass2') continue;
        if (this.rng() < density) this.placeTree(tx, ty);
      }
    }
  }

  placeTree(tx, ty) {
    this.makeSolid(tx, ty);
    this.drawables.push({ type: 'tree', x: tx * TILE + 16, y: ty * TILE + 16, sortY: ty * TILE + 16 });
  }

  placeBush(tx, ty) {
    this.makeSolid(tx, ty);
    this.drawables.push({ type: 'bush', x: tx * TILE + 16, y: ty * TILE + 16, sortY: ty * TILE + 20 });
  }

  // Rendu final de la carte de collision (les tuiles solides le restent)
  finalizeSolid() {
    // rien de plus : solid déjà rempli via set/makeSolid
  }
}
