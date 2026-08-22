// ============================================================
//  AVANIA — Mobs passifs : moutons & vaches
//
//  Les animaux se baladent sur l'herbe, fuient quand on les frappe
//  et lâchent des ressources à la mort (laine, bœuf cru).
//  Le joueur les attaque au clic gauche quand le curseur est sur eux.
// ============================================================

import { TILE } from './config.js';
import { makeCanvas } from './utils.js';

// Les couleurs de rendu vivent dans les palettes pixel-art plus bas
// (SHEEP_PAL / COW_PAL, déclinées en version « coup reçu »).
export const MOB_DEFS = {
  sheep: {
    label: 'Mouton',
    hp: 8,
    speed: 26,
    drops: [{ id: 'wool', min: 1, max: 2 }],
  },
  cow: {
    label: 'Vache',
    hp: 12,
    speed: 20,
    drops: [{ id: 'rawBeef', min: 1, max: 3 }],
  },
};

export class Mob {
  constructor(kind, x, y) {
    const def = MOB_DEFS[kind];
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.hp = def.hp;
    this.speed = def.speed;
    this.dir = { x: 0, y: 0 };
    this.facing = Math.random() < 0.5 ? 'left' : 'right';
    this.walkPhase = Math.random() * 6;
    this.moving = false;
    this.wanderT = Math.random() * 2.5;
    this.fleeT = 0;
    this.alive = true;
    this.hitFlash = 0;
    this.born = Math.random() * 100;
  }
}

// Fait apparaître des animaux sur l'herbe (jamais sur l'eau ou un bloc).
export function spawnMobs(world, counts = { sheep: 10, cow: 7 }) {
  const mobs = [];
  const grass = new Set(['grass', 'grassDark', 'flowers', 'dirt']);
  for (const [kind, count] of Object.entries(counts)) {
    let spawned = 0;
    let tries = 0;
    while (spawned < count && tries < count * 60) {
      tries++;
      const tx = 4 + Math.floor(Math.random() * (world.w - 8));
      const ty = 4 + Math.floor(Math.random() * (world.h - 8));
      const i = world.idx(tx, ty);
      if (!grass.has(world.floor[i])) continue;
      if (world.blocks[i] !== null) continue;
      mobs.push(new Mob(kind, tx * TILE + TILE / 2, ty * TILE + TILE / 2));
      spawned++;
    }
  }
  return mobs;
}

// Errance + fuite. `player` sert uniquement pour la direction de fuite.
export function updateMob(mob, dt, world, player) {
  if (!mob.alive) return;
  mob.hitFlash = Math.max(0, mob.hitFlash - dt);

  if (mob.fleeT > 0) {
    mob.fleeT -= dt;
    const dx = mob.x - player.x;
    const dy = mob.y - player.y;
    const len = Math.hypot(dx, dy) || 1;
    mob.dir.x = dx / len;
    mob.dir.y = dy / len;
    mob.moving = true;
  } else {
    mob.wanderT -= dt;
    if (mob.wanderT <= 0) {
      mob.wanderT = 1.2 + Math.random() * 3.2;
      mob.moving = Math.random() < 0.62;
      if (mob.moving) {
        const a = Math.random() * Math.PI * 2;
        mob.dir.x = Math.cos(a);
        mob.dir.y = Math.sin(a);
      } else {
        mob.dir.x = 0;
        mob.dir.y = 0;
      }
    }
  }

  if (mob.moving && (mob.dir.x !== 0 || mob.dir.y !== 0)) {
    const sp = mob.speed * (mob.fleeT > 0 ? 2.5 : 1);
    const nx = mob.x + mob.dir.x * sp * dt;
    const ny = mob.y + mob.dir.y * sp * dt;
    const tx = Math.floor(nx / TILE);
    const ty = Math.floor(ny / TILE);
    if (world.inBounds(tx, ty) && !world.isSolidTile(tx, ty)) {
      mob.x = nx;
      mob.y = ny;
      mob.walkPhase += sp * dt * 0.12;
      mob.facing = Math.abs(mob.dir.x) > Math.abs(mob.dir.y)
        ? (mob.dir.x > 0 ? 'right' : 'left')
        : (mob.dir.y > 0 ? 'down' : 'up');
    } else {
      mob.moving = false;
      mob.wanderT = 0.3;
    }
  }

  // Reste dans le monde (marge d'une tuile).
  const margin = TILE * 2;
  mob.x = Math.max(margin, Math.min(mob.x, world.w * TILE - margin));
  mob.y = Math.max(margin, Math.min(mob.y, world.h * TILE - margin));
}

// ------------------------------------------------------------
//  Rendu (pixel-art doux, dans l'esprit « voxel » du personnage)
//
//  Chaque animal est pré-rendu dans un sprite hors-écran mis en
//  cache par (espèce × orientation × flash × étape de marche) :
//  la boucle de jeu ne fait que 2 drawImage par animal, quel que
//  soit le niveau de détail du dessin — la richesse du pixel-art
//  est donc gratuite en jeu.
//
//  Principes du design (calqués sur le cube du personnage) :
//   • silhouette = union de formes dessinée deux fois : une passe
//     élargie pour le contour, une passe normale pour le remplissage ;
//   • reflet clair en haut, ombre en bas ;
//   • yeux sombres avec un point de lumière blanc ;
//   • la vue « right » est la vue « left » en miroir, ce qui
//     garantit une symétrie parfaite.
//
//  Vues : « down » = face, « up » = dos, « left/right » = profil.
//  Seuls le balancement vertical (bob) et la position restent
//  calculés en direct à chaque frame.
// ------------------------------------------------------------

// Dimensions du sprite pré-rendu : assez large pour le museau de la
// vache de profil et assez haut pour les cornes de la vue de dos.
const MOB_SPRITE_W = 56;
const MOB_SPRITE_H = 40;
const MOB_SPRITE_AX = 28; // ancre : centre horizontal du corps
const MOB_SPRITE_AY = 36; // ancre : contact au sol (y = 0)

const MOB_KIND_INDEX = { sheep: 0, cow: 1 };
const MOB_FACING_INDEX = { down: 0, left: 1, up: 2, right: 3 };

let mobShadowSprite = null;
const mobSpriteCache = new Map();

const TAU = Math.PI * 2;

// --- mini-boîte à outils pixel-art ---

function px(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function blob(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fill();
}

function rrect(ctx, x, y, w, h, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
  ctx.fill();
}

// Petit œil rond avec son point de lumière (la marque des mignons).
function eye(ctx, x, y, color) {
  px(ctx, x, y, 2, 2, color);
  px(ctx, x, y, 1, 1, 'rgba(255,255,255,0.9)');
}

// --- palettes (normale + « coup reçu » blanchie) ---

const SHEEP_PAL = {
  woolOut: '#b3ab9c', wool: '#f4f1ea', woolSh: '#ddd8cc', woolHi: '#ffffff',
  faceOut: '#43434f', face: '#565663', ear: '#4c4c58',
  leg: '#4a4a55', hoof: '#33333d', eye: '#20202a', nose: '#33333d',
  blush: 'rgba(222,135,135,0.55)',
};
const SHEEP_HIT = {
  woolOut: '#f2c9c9', wool: '#ffffff', woolSh: '#ffe7e7', woolHi: '#ffffff',
  faceOut: '#e8b4b4', face: '#fff0f0', ear: '#ffdada',
  leg: '#ffe4e4', hoof: '#f2c9c9', eye: '#8a3b3b', nose: '#d98a8a',
  blush: 'rgba(255,160,160,0.5)',
};

const COW_PAL = {
  bodyOut: '#54341c', body: '#8a5a3a', bodySh: '#6e4528',
  bodyHi: 'rgba(255,255,255,0.16)', belly: 'rgba(0,0,0,0.10)',
  patch: '#efe5d3', patchSh: '#e0d2ba',
  leg: '#6e4528', hoof: '#3f2c1b',
  hornOut: '#b3a179', horn: '#eadfc6', hornHi: '#ffffff',
  earIn: '#c98f6d', muzzleOut: '#c98a7c', muzzle: '#e8ae9e', nostril: '#7c4438',
  tail: '#6e4528', tuft: '#4a3423',
  eye: '#20202a',
};
const COW_HIT = {
  bodyOut: '#e8b4b4', body: '#ffffff', bodySh: '#ffe2e2',
  bodyHi: 'rgba(255,255,255,0.25)', belly: 'rgba(255,200,200,0.18)',
  patch: '#fff4f4', patchSh: '#fbe4e4',
  leg: '#ffe4e4', hoof: '#e8b4b4',
  hornOut: '#f2d0d0', horn: '#ffffff', hornHi: '#ffffff',
  earIn: '#ffd0d0', muzzleOut: '#f0b8b8', muzzle: '#ffe0e0', nostril: '#b85c5c',
  tail: '#ffe2e2', tuft: '#e8b4b4',
  eye: '#8a3b3b',
};

// Ombre ovale sous l'animal : un sprite partagé (rendu à 2×, soit
// la résolution d'écran du jeu : le blit est net, pixel pour pixel).
function getMobShadowSprite() {
  if (mobShadowSprite) return mobShadowSprite;
  const c = makeCanvas(30 * 2, 10 * 2);
  const sctx = c.getContext('2d');
  sctx.imageSmoothingEnabled = false;
  sctx.fillStyle = 'rgba(0,0,0,0.22)';
  sctx.beginPath();
  sctx.ellipse(15 * 2, 5 * 2, 14 * 2, 4.5 * 2, 0, 0, TAU);
  sctx.fill();
  mobShadowSprite = c;
  return c;
}

// Étape de marche quantifiée : sin(walkPhase) ramené à 7 paliers.
// L'œil ne voit aucune différence (paliers de ~0,5 px sur des
// pattes de 3 px de large), mais cela borne le cache de sprites.
function legStepOf(walkPhase) {
  return Math.max(-3, Math.min(3, Math.round(Math.sin(walkPhase) * 3)));
}

// Quatre pattes à sabots, animées par paires diagonales (0+3 / 1+2),
// ce qui donne une allure de quadrupède bien plus naturelle.
function drawLegs(ctx, centers, top, h, pal, legStep) {
  const lift = (legStep / 3) * 1.6;
  for (let i = 0; i < 4; i++) {
    const group = (i === 0 || i === 3) ? 1 : -1;
    const y = top - Math.max(0, lift * group);
    px(ctx, centers[i] - 1, y, 3, h, pal.leg);
    px(ctx, centers[i] - 1, y + h - 2, 3, 2, pal.hoof);
  }
}

// ------------------------------------------------------------
//  LE MOUTON — une boule de laine à face sombre
// ------------------------------------------------------------

// Puffs de la toison (union de cercles) + rectangle central.
const SHEEP_PUFFS = [
  [-10, -14, 4], [-3, -15, 4], [4, -15, 4], [10, -14, 4], // dos
  [-14, -9, 4], [13, -9, 4],                              // flancs
  [-9, -5, 4], [0, -4, 4], [9, -5, 4],                    // frange basse
];
const SHEEP_CORE = [-14, -15, 27, 10];
// Nuages d'ombre internes qui donnent le volume « moutonneux ».
const SHEEP_SHADE_PUFFS = [[-7, -13, 3], [1, -14, 3], [7, -12, 3], [-12, -7, 3], [5, -7, 3]];

function sheepWool(ctx, pal) {
  const [x, y, w, h] = SHEEP_CORE;
  // passe 1 : contour (formes élargies d'un pixel)
  ctx.fillStyle = pal.woolOut;
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  for (const [bx, by, r] of SHEEP_PUFFS) blob(ctx, bx, by, r + 1, pal.woolOut);
  // passe 2 : remplissage
  ctx.fillStyle = pal.wool;
  ctx.fillRect(x, y, w, h);
  for (const [bx, by, r] of SHEEP_PUFFS) blob(ctx, bx, by, r, pal.wool);
  // volume + étincelles de lumière sur le dessus
  for (const [bx, by, r] of SHEEP_SHADE_PUFFS) blob(ctx, bx, by, r, pal.woolSh);
  // deux minuscules accents de lumière au sommet des crêtes
  px(ctx, -10, -17, 2, 1, pal.woolHi);
  px(ctx, 3, -18, 2, 1, pal.woolHi);
}

// Profil (gauche — la droite est un miroir)
function drawSheepSide(ctx, pal, legStep) {
  drawLegs(ctx, [-9, -3, 3, 9], -7, 7, pal, legStep);
  // queue pompon
  blob(ctx, 14, -10, 3.5, pal.woolOut);
  blob(ctx, 14, -10, 2.5, pal.wool);
  sheepWool(ctx, pal);
  // tête ronde, plongée dans la toison
  blob(ctx, -15, -12, 6, pal.faceOut);
  blob(ctx, -15, -12, 5, pal.face);
  // houppette de laine entre la tête et le corps
  blob(ctx, -9, -16, 3.5, pal.woolOut);
  blob(ctx, -9, -16, 2.5, pal.wool);
  // oreille tombante (petite languette qui descend le long du crâne)
  px(ctx, -11, -19, 4, 3, pal.faceOut);
  px(ctx, -11, -16, 2, 2, pal.faceOut);
  px(ctx, -10, -18, 3, 2, pal.ear);
  px(ctx, -10, -16, 1, 2, pal.ear);
  // œil, naseau, touche de rose
  eye(ctx, -17, -14, pal.eye);
  px(ctx, -18, -9, 2, 1, pal.nose);
  px(ctx, -12, -10, 2, 2, pal.blush);
}

// Face (vers la caméra)
function drawSheepFront(ctx, pal, legStep) {
  drawLegs(ctx, [-9, -3, 3, 9], -7, 7, pal, legStep);
  sheepWool(ctx, pal);
  // oreilles écartées, penchées
  px(ctx, -12, -12, 5, 3, pal.faceOut);
  px(ctx, -11, -11, 4, 2, pal.ear);
  px(ctx, 7, -12, 5, 3, pal.faceOut);
  px(ctx, 7, -11, 4, 2, pal.ear);
  // face ronde
  blob(ctx, 0, -9, 7, pal.faceOut);
  blob(ctx, 0, -9, 6, pal.face);
  // couronne de laine sur le haut de la face
  blob(ctx, -4, -14, 3.5, pal.woolOut); blob(ctx, -4, -14, 2.5, pal.wool);
  blob(ctx, 0, -15, 3.5, pal.woolOut); blob(ctx, 0, -15, 2.5, pal.wool);
  blob(ctx, 4, -14, 3.5, pal.woolOut); blob(ctx, 4, -14, 2.5, pal.wool);
  // yeux, nez, joues rosées
  eye(ctx, -4, -10, pal.eye);
  eye(ctx, 2, -10, pal.eye);
  px(ctx, -1, -5, 2, 2, pal.nose);
  px(ctx, -5, -7, 2, 2, pal.blush);
  px(ctx, 3, -7, 2, 2, pal.blush);
}

// Dos (s'éloigne de la caméra)
function drawSheepBack(ctx, pal, legStep) {
  drawLegs(ctx, [-9, -3, 3, 9], -7, 7, pal, legStep);
  sheepWool(ctx, pal);
  // arrière de la tête + oreilles pendantes
  blob(ctx, 0, -15, 6.5, pal.faceOut);
  blob(ctx, 0, -15, 5.5, pal.face);
  px(ctx, -11, -19, 4, 4, pal.faceOut);
  px(ctx, -10, -18, 2, 3, pal.ear);
  px(ctx, 7, -19, 4, 4, pal.faceOut);
  px(ctx, 8, -18, 2, 3, pal.ear);
  // queue pompon qui dépasse sous la frange
  blob(ctx, 0, -2, 3, pal.woolOut);
  blob(ctx, 0, -2, 2, pal.wool);
}

// ------------------------------------------------------------
//  LA VACHE — robe brune à taches crème, museau rose
// ------------------------------------------------------------

// Taches organiques (unions de rectangles croisés), par vue.
const COW_PATCHES_SIDE = [
  [[-9, -14, 7, 5], [-8, -15, 5, 7], [-10, -13, 9, 3]],
  [[5, -12, 7, 5], [6, -13, 5, 7], [4, -11, 9, 3]],
];
const COW_PATCHES_FRONT = [
  [[-11, -16, 7, 4], [-10, -17, 5, 6]],
  [[4, -15, 7, 4], [6, -16, 4, 6]],
];
const COW_PATCHES_BACK = [
  [[-9, -14, 6, 4], [-8, -15, 4, 6]],
  [[4, -13, 6, 5], [5, -14, 4, 7]],
];

function cowPatches(ctx, pal, groups) {
  for (const g of groups) {
    for (const [x, y, w, h] of g) px(ctx, x, y, w, h, pal.patch);
    // petite ombre en bas de la tache pour l'inscrire dans la robe
    const [fx, fy, fw, fh] = g[0];
    px(ctx, fx, fy + fh - 1, fw, 1, pal.patchSh);
  }
}

function cowHorns(ctx, pal, lx, rx, top) {
  // cornes crème à pointe claire, contours légèrement plus grands
  px(ctx, lx - 1, top - 1, 4, 4, pal.hornOut);
  px(ctx, lx, top, 2, 4, pal.horn);
  px(ctx, lx, top, 1, 1, pal.hornHi);
  px(ctx, rx - 1, top - 1, 4, 4, pal.hornOut);
  px(ctx, rx + 1, top, 2, 4, pal.horn);
  px(ctx, rx + 2, top, 1, 1, pal.hornHi);
}

// Profil (gauche — la droite est un miroir)
function drawCowSide(ctx, pal, legStep) {
  drawLegs(ctx, [-11, -5, 3, 10], -7, 7, pal, legStep);
  // queue fine retombant de la croupe, houppette sombre
  px(ctx, 13, -14, 2, 6, pal.tail);
  px(ctx, 12, -8, 4, 3, pal.tuft);
  // corps
  rrect(ctx, -16, -18, 31, 13, 5, pal.bodyOut);
  rrect(ctx, -15, -17, 29, 11, 4, pal.body);
  cowPatches(ctx, pal, COW_PATCHES_SIDE);
  px(ctx, -13, -16, 26, 1, pal.bodyHi); // reflet du dos
  px(ctx, -13, -8, 26, 2, pal.belly);   // ligne ventrale
  // tête : gros crâne + museau rose qui dépasse vers l'avant-bas
  rrect(ctx, -23, -18, 13, 12, 3, pal.bodyOut);
  rrect(ctx, -22, -17, 11, 10, 3, pal.body);
  px(ctx, -24, -10, 8, 6, pal.muzzleOut);
  px(ctx, -23, -9, 6, 4, pal.muzzle);
  px(ctx, -22, -7, 2, 1, pal.nostril);
  px(ctx, -20, -5, 3, 1, pal.nostril);
  // cornes : la proche pleine, la lointaine un cran plus haute et plus fine
  px(ctx, -21, -22, 4, 4, pal.hornOut);
  px(ctx, -20, -21, 2, 4, pal.horn);
  px(ctx, -20, -22, 1, 1, pal.hornHi);
  px(ctx, -15, -23, 3, 3, pal.hornOut);
  px(ctx, -14, -22, 1, 2, pal.horn);
  px(ctx, -17, -18, 3, 2, pal.bodySh); // touffe de poil entre les cornes
  // oreille sur le coin arrière du crâne
  px(ctx, -11, -16, 4, 3, pal.bodyOut);
  px(ctx, -10, -15, 3, 2, pal.body);
  px(ctx, -9, -14, 1, 1, pal.earIn);
  eye(ctx, -17, -14, pal.eye);
}

// Face (vers la caméra)
function drawCowFront(ctx, pal, legStep) {
  drawLegs(ctx, [-11, -5, 3, 10], -7, 7, pal, legStep);
  // corps en arrière-plan (dos + flancs)
  rrect(ctx, -15, -19, 30, 11, 5, pal.bodyOut);
  rrect(ctx, -14, -18, 28, 9, 4, pal.body);
  cowPatches(ctx, pal, COW_PATCHES_FRONT);
  px(ctx, -12, -17, 24, 1, pal.bodyHi);
  // cornes, oreilles grandes ouvertes, touffe entre les deux
  cowHorns(ctx, pal, -8, 5, -20);
  px(ctx, -13, -17, 5, 4, pal.bodyOut);
  px(ctx, -12, -16, 4, 3, pal.body);
  px(ctx, -11, -15, 2, 1, pal.earIn);
  px(ctx, 8, -17, 5, 4, pal.bodyOut);
  px(ctx, 8, -16, 4, 3, pal.body);
  px(ctx, 9, -15, 2, 1, pal.earIn);
  px(ctx, -2, -19, 4, 2, pal.bodySh); // touffe de poil
  // gros crâne plein cadre
  rrect(ctx, -8, -16, 16, 12, 4, pal.bodyOut);
  rrect(ctx, -7, -15, 14, 10, 3, pal.body);
  // étoile crème sur le front
  px(ctx, -1, -13, 2, 3, pal.patch);
  // museau rose avec deux naseaux
  px(ctx, -6, -8, 12, 5, pal.muzzleOut);
  px(ctx, -5, -7, 10, 3, pal.muzzle);
  px(ctx, -4, -6, 2, 1, pal.nostril);
  px(ctx, 2, -6, 2, 1, pal.nostril);
  eye(ctx, -6, -13, pal.eye);
  eye(ctx, 4, -13, pal.eye);
}

// Dos (s'éloigne de la caméra)
function drawCowBack(ctx, pal, legStep) {
  drawLegs(ctx, [-11, -5, 3, 10], -7, 7, pal, legStep);
  // queue pendant vers la caméra, entre les postérieurs
  px(ctx, -1, -10, 2, 5, pal.tail);
  px(ctx, -2, -5, 4, 3, pal.tuft);
  // croupe
  rrect(ctx, -15, -18, 30, 12, 5, pal.bodyOut);
  rrect(ctx, -14, -17, 28, 10, 4, pal.body);
  cowPatches(ctx, pal, COW_PATCHES_BACK);
  px(ctx, -12, -9, 24, 2, pal.belly);
  // arrière du crâne large, enfoncé entre les épaules
  rrect(ctx, -8, -23, 16, 10, 4, pal.bodyOut);
  rrect(ctx, -7, -22, 14, 8, 3, pal.body);
  px(ctx, -2, -20, 4, 3, pal.patch);   // plaque crème du sommet
  px(ctx, -6, -16, 12, 1, pal.belly);  // ombre de la nuque
  // cornes écartées, oreilles aux coins, touffe de poil
  cowHorns(ctx, pal, -8, 5, -25);
  px(ctx, -13, -22, 5, 4, pal.bodyOut);
  px(ctx, -12, -21, 4, 3, pal.body);
  px(ctx, 8, -22, 5, 4, pal.bodyOut);
  px(ctx, 8, -21, 4, 3, pal.body);
  px(ctx, -2, -24, 4, 2, pal.bodySh); // touffe
}

// Dessine le corps complet du mob, pieds au point (0, 0).
// `legStep` ∈ [-3, 3] : paires de pattes diagonales alternativement levées.
function renderMobBody(ctx, mob, legStep) {
  const flash = mob.hitFlash > 0;
  const isSheep = mob.kind === 'sheep';
  const pal = isSheep ? (flash ? SHEEP_HIT : SHEEP_PAL) : (flash ? COW_HIT : COW_PAL);
  const side = isSheep ? drawSheepSide : drawCowSide;
  const front = isSheep ? drawSheepFront : drawCowFront;
  const back = isSheep ? drawSheepBack : drawCowBack;

  if (mob.facing === 'right') {
    // Miroir horizontal du profil gauche : symétrie garantie.
    ctx.save();
    ctx.scale(-1, 1);
    side(ctx, pal, legStep);
    ctx.restore();
  } else if (mob.facing === 'left') {
    side(ctx, pal, legStep);
  } else if (mob.facing === 'up') {
    back(ctx, pal, legStep);
  } else {
    front(ctx, pal, legStep);
  }
}

// Sprite pré-rendu du mob (cache lazy, clé numérique = zéro
// allocation dans la boucle de jeu).
function getMobSprite(mob) {
  const kindIdx = MOB_KIND_INDEX[mob.kind] || 0;
  const facingIdx = MOB_FACING_INDEX[mob.facing] ?? 0;
  const flash = mob.hitFlash > 0 ? 1 : 0;
  const step = legStepOf(mob.walkPhase);
  const key = (((kindIdx * 4 + facingIdx) * 2 + flash) * 7) + (step + 3);
  const cached = mobSpriteCache.get(key);
  if (cached) return cached;

  const canvas = makeCanvas(MOB_SPRITE_W, MOB_SPRITE_H);
  const sctx = canvas.getContext('2d');
  sctx.imageSmoothingEnabled = false;
  // Le corps est dessiné avec ses coordonnées habituelles, pieds en (0, 0),
  // décalé vers le point d'ancrage du sprite.
  sctx.translate(MOB_SPRITE_AX, MOB_SPRITE_AY);
  renderMobBody(sctx, { ...mob, hitFlash: flash ? 1 : 0 }, step);
  mobSpriteCache.set(key, canvas);
  return canvas;
}

export function drawMob(ctx, mob) {
  // 1) Ombre partagée (sprite pré-rendu une fois pour toutes).
  ctx.drawImage(getMobShadowSprite(), mob.x - 15, mob.y - 1.5, 30, 10);
  // 2) Corps : un seul blit. Le balancement (bob) reste calculé en
  //    direct pour garder une montée/descente parfaitement continue.
  const bobbing = Math.sin(mob.walkPhase * 2) * (mob.moving ? 1.1 : 0.3);
  ctx.drawImage(getMobSprite(mob), mob.x - MOB_SPRITE_AX, mob.y - bobbing - MOB_SPRITE_AY);
}

// ------------------------------------------------------------
//  Utilitaires de combat
// ------------------------------------------------------------

export function mobDrops(mob) {
  const def = MOB_DEFS[mob.kind];
  const drops = [];
  for (const d of def.drops) {
    const n = d.min + Math.floor(Math.random() * (d.max - d.min + 1));
    if (n > 0) drops.push({ id: d.id, count: n });
  }
  return drops;
}
