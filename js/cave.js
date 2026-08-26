// ============================================================
//  AVANIA — La grotte
//
//  Deux choses vivent ici :
//    1. buildCaveEntrance() — la falaise et son arche sombre, posées
//       à un endroit FIXE de l'île. C'est le point de repère du monde.
//    2. generateCaveLevel() — la génération d'un niveau souterrain :
//       galeries creusées dans la roche, pierre et fer uniquement,
//       de plus en plus profond (et de plus en plus riche).
//
//  Tout est déterministe (seed + profondeur) : deux joueurs descendent
//  exactement dans la même grotte, ce qui sera indispensable quand le
//  multijoueur arrivera.
//
//  Choix de performance important : la roche qui enserre les galeries
//  est un SOL solide (caveWall), pas un bloc posé. Des milliers de
//  cases rendues gratuitement par les chunks de sol, au lieu de
//  milliers de cubes 2.5D à trier et à raccorder.
// ============================================================

import { TILE } from './config.js';
import { mulberry32 } from './utils.js';

export const CAVE = {
  // Position de la falaise sur l'île (en tuiles). Fixe et mémorisable :
  // « la grotte est au nord-est du spawn ».
  entrance: { tx: 92, ty: 38 },
  // Nombre de niveaux atteignables.
  maxDepth: 8,
  // Marge non creusée autour de la carte souterraine.
  margin: 12,
  // Densité des ressources selon la profondeur (plus on descend, plus
  // c'est riche — c'est la récompense du risque).
  stoneDensity: (depth) => 0.030 + Math.min(depth, 6) * 0.006,
  ironDensity: (depth) => 0.010 + Math.min(depth, 6) * 0.006,
};

// ------------------------------------------------------------
//  La falaise et son entrée, à la surface
// ------------------------------------------------------------
//
//   ██ ██ ██ ██ ██ ██ ██        <- falaise (sol solide « rockFace »)
//   ██ ██ ██ ▓▓▓▓ ██ ██ ██      <- l'arche sombre (objet caveMouth)
//        ·  ·  ·  ·  ·          <- le replat dégagé devant
//              ↑
//         le joueur arrive par le sud et appuie sur la touche
//         d'interaction face à l'arche.
export function buildCaveEntrance(world) {
  const { tx, ty } = CAVE.entrance;
  if (!world.inBounds(tx, ty)) return null;

  // On dégage d'abord la zone (herbe partout, aucun bloc) pour que
  // l'entrée soit toujours praticable, quelle que soit la génération.
  for (let y = ty - 7; y <= ty + 3; y++) {
    for (let x = tx - 6; x <= tx + 6; x++) {
      if (!world.inBounds(x, y)) continue;
      const i = world.idx(x, y);
      world.blocks[i] = null;
      world.blocks2[i] = null;
      world.floor[i] = 'grass';
    }
  }

  // La masse rocheuse, au nord.
  for (let y = ty - 7; y <= ty - 1; y++) {
    for (let x = tx - 6; x <= tx + 6; x++) {
      if (!world.inBounds(x, y)) continue;
      // Bords adoucis : la falaise n'est pas un rectangle parfait.
      const edge = Math.abs(x - tx) >= 5 && y <= ty - 5;
      world.floor[world.idx(x, y)] = edge ? 'rockFace' : 'rockFace';
    }
  }

  // L'arche : un objet sombre, solide, non cassable.
  world.setBlock(tx, ty, 'caveMouth');

  // Le replat devant l'entrée (terre battue) + deux rochers décoratifs.
  for (let y = ty + 1; y <= ty + 2; y++) {
    for (let x = tx - 3; x <= tx + 3; x++) {
      if (world.inBounds(x, y)) world.floor[world.idx(x, y)] = 'dirt';
    }
  }
  world.setBlock(tx - 4, ty - 1, 'rock');
  world.setBlock(tx + 4, ty - 1, 'rock');
  world.setBlock(tx - 5, ty + 1, 'tree');
  world.setBlock(tx + 5, ty + 1, 'tree');

  // Les deux marchands tiennent boutique sur le parvis, de part et
  // d'autre de l'arche, tournés vers le joueur. Ils sont là avant même
  // qu'on entre : c'est devant la grotte qu'on s'équipe.
  world.merchantSpots = [
    { x: (tx - 3) * TILE + TILE / 2, y: (ty + 2) * TILE + TILE / 2, facing: 'right' },
    { x: (tx + 3) * TILE + TILE / 2, y: (ty + 2) * TILE + TILE / 2, facing: 'left' },
  ];

  return {
    tx,
    ty,
    // Là où le joueur se tient pour entrer (juste devant l'arche).
    standTx: tx,
    standTy: ty + 1,
    x: tx * TILE + TILE / 2,
    y: (ty + 1) * TILE + TILE / 2,
  };
}

// ------------------------------------------------------------
//  Génération d'un niveau souterrain
// ------------------------------------------------------------

// Voisinage 8 cases, sans allocation : indices précalculés.
const NB = [-1, 0, 1];

function countWalls(open, w, h, x, y) {
  let walls = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      // Hors zone = mur (les bords se referment tout seuls).
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) { walls++; continue; }
      if (!open[ny * w + nx]) walls++;
    }
  }
  return walls;
}

export function generateCaveLevel(world) {
  const w = world.w;
  const h = world.h;
  const depth = Math.max(1, world.depth);
  const floor = world.floor;
  const blocks = world.blocks;
  const rng = mulberry32((world.seed ^ Math.imul(depth, 2654435761)) >>> 0);

  // --- 1) tout est plein ---
  floor.fill('caveWall');

  const M = CAVE.margin;
  const open = new Uint8Array(w * h);

  // --- 2) le niveau 1 est un VASTE HALL : c'est là qu'attendent les
  //        marchands, il faut que ce soit lisible immédiatement. ---
  const entranceTx = CAVE.entrance.tx;
  const hallCy = M + 8;
  if (depth === 1) {
    const halfW = 15;
    const halfH = 9;
    for (let y = hallCy - halfH; y <= hallCy + halfH; y++) {
      for (let x = entranceTx - halfW; x <= entranceTx + halfW; x++) {
        if (x <= M || y <= M || x >= w - M || y >= h - M) continue;
        // Coins arrondis.
        const dx = Math.abs(x - entranceTx) / halfW;
        const dy = Math.abs(y - hallCy) / halfH;
        if (dx * dx + dy * dy > 1.08) continue;
        open[y * w + x] = 1;
      }
    }
    // Quelques piliers pour donner du volume au hall.
    for (let py = hallCy - 5; py <= hallCy + 5; py += 5) {
      for (let px = entranceTx - 10; px <= entranceTx + 10; px += 5) {
        for (let y = py; y < py + 2; y++) {
          for (let x = px; x < px + 2; x++) open[y * w + x] = 0;
        }
      }
    }
    // Un couloir qui part vers le sud : la suite de la grotte.
    for (let y = hallCy; y < h - M - 4; y++) {
      const cx = entranceTx + Math.round(Math.sin(y * 0.22) * 4);
      for (let x = cx - 2; x <= cx + 2; x++) open[y * w + x] = 1;
    }
    // Et une petite salle au bout du couloir.
    const endY = h - M - 10;
    for (let y = endY - 5; y <= endY + 5; y++) {
      for (let x = entranceTx - 8; x <= entranceTx + 8; x++) {
        if (x <= M || y <= M || x >= w - M || y >= h - M) continue;
        open[y * w + x] = 1;
      }
    }
  } else {
    // --- 2b) niveaux suivants : bruit + automate cellulaire ---
    for (let y = M; y < h - M; y++) {
      for (let x = M; x < w - M; x++) {
        open[y * w + x] = rng() < 0.46 ? 1 : 0;
      }
    }
    for (let pass = 0; pass < 4; pass++) {
      const next = new Uint8Array(open);
      for (let y = M; y < h - M; y++) {
        for (let x = M; x < w - M; x++) {
          const i = y * w + x;
          const walls = countWalls(open, w, h, x, y);
          // Règle classique : 5 voisins murs ou plus → on referme,
          // 3 ou moins → on ouvre. Le reste ne bouge pas.
          next[i] = walls >= 5 ? 0 : walls <= 3 ? 1 : open[i];
        }
      }
      open.set(next);
    }
    // Le couloir d'arrivée, pour que l'entrée soit toujours reliée.
    for (let y = M + 2; y < h - M - 6; y++) {
      const cx = entranceTx + Math.round(Math.sin(y * 0.19 + depth) * 6);
      for (let x = cx - 2; x <= cx + 2; x++) {
        if (x > M && x < w - M) open[y * w + x] = 1;
      }
    }
  }

  // --- 3) salle d'arrivée (toujours la même, sous la bouche d'entrée) ---
  const arriveY = M + 3;
  for (let y = arriveY - 2; y <= arriveY + 4; y++) {
    for (let x = entranceTx - 4; x <= entranceTx + 4; x++) {
      if (x > M && y > M && x < w - M && y < h - M) open[y * w + x] = 1;
    }
  }

  // --- 4) on ne garde que ce qui est réellement atteignable depuis
  //        l'arrivée : aucune poche isolée, aucune zone morte.
  //
  //  Parcours en LARGEUR (file FIFO) et pas en profondeur : `dist` doit
  //  être la vraie distance à l'arrivée pour que le puits descendant
  //  tombe au fond de la grotte. En DFS, un long serpent peut revenir
  //  se terminer juste à côté du départ — le puits « du fond » se
  //  retrouvait alors à deux cases de l'entrée.
  //
  //  La file est un Int32Array pré-alloué : zéro allocation, et pas de
  //  shift() (qui est O(n)) sur un tableau JS. ---
  const reach = new Uint8Array(w * h);
  const dist = new Int32Array(w * h).fill(-1);
  const queue = new Int32Array(w * h);
  let qHead = 0;
  let qTail = 0;
  const startI = arriveY * w + entranceTx;
  reach[startI] = 1;
  dist[startI] = 0;
  queue[qTail++] = startI;

  let farthest = startI;
  let farthestDist = 0;
  while (qHead < qTail) {
    const i = queue[qHead++];
    const x = i % w;
    const y = (i / w) | 0;
    const base = dist[i] + 1;
    // 9 combinaisons (dont le centre, ignoré) : les 8 voisins.
    for (let k = 0; k < 9; k++) {
      const dx = NB[k % 3];
      const dy = NB[(k / 3) | 0];
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (!open[ni] || reach[ni]) continue;
      reach[ni] = 1;
      dist[ni] = base;
      if (base > farthestDist) {
        farthestDist = base;
        farthest = ni;
      }
      queue[qTail++] = ni;
    }
  }

  // --- 5) écriture du sol ---
  for (let i = 0; i < w * h; i++) {
    if (reach[i]) {
      floor[i] = 'caveFloor';
      blocks[i] = null;
    } else {
      floor[i] = 'caveWall';
      blocks[i] = null;
    }
  }

  // --- 6) les ressources : pierre et fer, rien d'autre ---
  const stoneP = CAVE.stoneDensity(depth);
  const ironP = CAVE.ironDensity(depth);
  for (let y = M; y < h - M; y++) {
    for (let x = M; x < w - M; x++) {
      const i = y * w + x;
      if (!reach[i]) continue;
      // Jamais juste devant l'arrivée ni sur les puits.
      if (Math.abs(x - entranceTx) <= 3 && Math.abs(y - arriveY) <= 3) continue;
      const r = rng();
      if (r < ironP) blocks[i] = 'caveIron';
      else if (r < ironP + stoneP) blocks[i] = 'caveStone';
    }
  }

  // --- 7) les puits : remontée près de l'arrivée, descente au point
  //        le plus éloigné (donc toujours « au fond », où que ce soit) ---
  const upI = arriveY * w + entranceTx - 4;
  const downI = farthest;
  blocks[upI] = 'caveLadderUp';
  blocks[downI] = 'caveLadderDown';
  // On dégage autour des puits pour qu'ils soient toujours accessibles.
  for (const pi of [upI, downI]) {
    const px = pi % w;
    const py = (pi / w) | 0;
    for (let y = py - 1; y <= py + 1; y++) {
      for (let x = px - 1; x <= px + 1; x++) {
        const j = y * w + x;
        if (reach[j] && !(x === px && y === py)) blocks[j] = null;
      }
    }
  }

  world.spawn = {
    x: entranceTx * TILE + TILE / 2,
    y: (arriveY + 2) * TILE + TILE / 2,
  };
  world.ladderUp = { tx: (upI % w), ty: ((upI / w) | 0) };
  world.ladderDown = { tx: (downI % w), ty: ((downI / w) | 0) };
  world.depth = depth;
  world.farthestDistance = farthestDist;

  // Emplacements des marchands (niveau 1 uniquement) : de part et
  // d'autre de l'arrivée, face au joueur.
  if (depth === 1) {
    world.merchantSpots = [
      { x: (entranceTx - 6) * TILE + TILE / 2, y: (arriveY + 4) * TILE + TILE / 2, facing: 'right' },
      { x: (entranceTx + 6) * TILE + TILE / 2, y: (arriveY + 4) * TILE + TILE / 2, facing: 'left' },
    ];
  } else {
    world.merchantSpots = [];
  }
}

// ------------------------------------------------------------
//  Profondeur : ce qu'il faut pour descendre
// ------------------------------------------------------------

// Profondeur maximale atteignable avec un masque / une armure donnés.
export function maxDepthFor(itemId, defs) {
  const def = itemId && defs ? defs[itemId] : null;
  return def && def.maxDepth ? def.maxDepth : 1;
}

// Le joueur peut-il descendre à la profondeur `depth` ?
// Il faut que le MASQUE et l'ARMURE couvrent tous les deux la cible :
// plus on s'enfonce, plus l'air est rare et plus ça tombe.
export function canDescendTo(depth, gear, defs) {
  if (depth <= 1) return { ok: true };
  const maskDepth = maxDepthFor(gear.mask, defs);
  const armorDepth = maxDepthFor(gear.armor, defs);
  if (maskDepth >= depth && armorDepth >= depth) return { ok: true };
  const missing = [];
  if (maskDepth < depth) missing.push('un masque');
  if (armorDepth < depth) missing.push('une protection de minage');
  return { ok: false, missing, maskDepth, armorDepth };
}
