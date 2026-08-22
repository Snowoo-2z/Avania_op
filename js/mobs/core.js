// ============================================================
//  AVANIA — Mobs : moteur commun
//
//  Comportement (errance, fuite, clamp du monde), apparition,
//  butin et pré-rendu des sprites. Chaque espèce fournit dans
//  son sous-dossier sa définition, ses palettes et le dessin
//  de son profil (fichier sheep/sheep.js, cow/cow.js…).
//
//  Les animaux sont TOUJOURS vus de profil : même en marchant
//  vers le haut ou le bas, ils gardent leur orientation gauche/
//  droite (comme dans Minecraft). La vue « droite » est le
//  profil « gauche » miroité — symétrie garantie.
// ============================================================

import { TILE } from '../config.js';
import { makeCanvas } from '../utils.js';
import { legStepOf } from './render-utils.js';
import * as sheep from './sheep/sheep.js';
import * as cow from './cow/cow.js';

// Registre des espèces : DEF (label/hp/speed/butin), PAL/HIT
// (palettes normale et « coup reçu »), drawSide (dessin du profil).
const MOBS = { sheep, cow };

export const MOB_DEFS = {};
for (const [kind, mod] of Object.entries(MOBS)) MOB_DEFS[kind] = mod.DEF;

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
      // Toujours de profil : on n'oriente que si la marche a une
      // vraie composante horizontale (sinon on conserve le côté).
      if (mob.dir.x > 0.01) mob.facing = 'right';
      else if (mob.dir.x < -0.01) mob.facing = 'left';
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
//  Rendu
//
//  Chaque animal est pré-rendu dans un sprite hors-écran mis en
//  cache par (espèce × côté × flash × étape de marche) : la boucle
//  de jeu ne fait que 2 drawImage par animal, quel que soit le
//  niveau de détail du dessin.
// ------------------------------------------------------------

// Dimensions du sprite pré-rendu : assez large pour le museau de la
// vache de profil et la queue de chaque espèce.
const MOB_SPRITE_W = 56;
const MOB_SPRITE_H = 40;
const MOB_SPRITE_AX = 28; // ancre : centre horizontal du corps
const MOB_SPRITE_AY = 36; // ancre : contact au sol (y = 0)

// Seuls deux côtés existent à l'écran : gauche et droite (miroir).
// Toute autre valeur (historique 'down'/'up') retombe sur 'left'.
const MOB_KIND_INDEX = { sheep: 0, cow: 1 };
const MOB_SIDE_INDEX = { left: 0, right: 1 };

let mobShadowSprite = null;
const mobSpriteCache = new Map();

// Ombre ovale sous l'animal : un sprite partagé (rendu à 2×, soit
// la résolution d'écran du jeu : le blit est net, pixel pour pixel).
function getMobShadowSprite() {
  if (mobShadowSprite) return mobShadowSprite;
  const c = makeCanvas(30 * 2, 10 * 2);
  const sctx = c.getContext('2d');
  sctx.imageSmoothingEnabled = false;
  sctx.fillStyle = 'rgba(0,0,0,0.22)';
  sctx.beginPath();
  sctx.ellipse(15 * 2, 5 * 2, 14 * 2, 4.5 * 2, 0, 0, Math.PI * 2);
  sctx.fill();
  mobShadowSprite = c;
  return c;
}

// Dessine le corps complet du mob, pieds au point (0, 0).
function renderMobBody(ctx, mob, legStep) {
  const mod = MOBS[mob.kind] || sheep;
  const pal = mob.hitFlash > 0 ? mod.HIT : mod.PAL;
  if (mob.facing === 'right') {
    // Miroir horizontal du profil gauche : symétrie garantie.
    ctx.save();
    ctx.scale(-1, 1);
    mod.drawSide(ctx, pal, legStep);
    ctx.restore();
  } else {
    mod.drawSide(ctx, pal, legStep);
  }
}

// Sprite pré-rendu du mob (cache lazy, clé numérique = zéro
// allocation dans la boucle de jeu).
function getMobSprite(mob) {
  const kindIdx = MOB_KIND_INDEX[mob.kind] || 0;
  const sideIdx = MOB_SIDE_INDEX[mob.facing] ?? 0;
  const flash = mob.hitFlash > 0 ? 1 : 0;
  const step = legStepOf(mob.walkPhase);
  const key = (((kindIdx * 2 + sideIdx) * 2 + flash) * 7) + (step + 3);
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
