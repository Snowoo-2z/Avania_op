// ============================================================
//  AVANIA — Mobs passifs : moutons & vaches
//
//  Les animaux se baladent sur l'herbe, fuient quand on les frappe
//  et lâchent des ressources à la mort (laine, bœuf cru).
//  Le joueur les attaque au clic gauche quand le curseur est sur eux.
// ============================================================

import { TILE } from './config.js';

function withAlpha(hex, a) {
  if (hex.startsWith('rgb(')) return hex.replace('rgb(', 'rgba(').replace(')', `,${a})`);
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

export const MOB_DEFS = {
  sheep: {
    label: 'Mouton',
    hp: 8,
    speed: 26,
    body: '#f2f2f2',
    bodyDark: '#d0d0d0',
    head: '#ececec',
    face: '#c9c9c9',
    drops: [{ id: 'wool', min: 1, max: 2 }],
  },
  cow: {
    label: 'Vache',
    hp: 12,
    speed: 20,
    body: '#8a5a3a',
    bodyDark: '#6e4528',
    head: '#7a4c2c',
    face: '#5f3a20',
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
//  Rendu (style voxel du jeu)
// ------------------------------------------------------------

function leg(ctx, x, y, w, h, color, phase) {
  const lift = Math.sin(phase) * 1.6;
  ctx.fillStyle = color;
  ctx.fillRect(x, y - Math.max(0, lift), w, h);
}

function drawMobBody(ctx, mob) {
  const def = MOB_DEFS[mob.kind];
  const bobbing = Math.sin(mob.walkPhase * 2) * (mob.moving ? 1.1 : 0.3);
  const x = mob.x;
  const y = mob.y - bobbing;
  const flash = mob.hitFlash > 0;

  // ombre portée
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(x, mob.y + 4, 13, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  const isSheep = mob.kind === 'sheep';
  const bodyW = isSheep ? 24 : 27;
  const bodyH = isSheep ? 14 : 16;
  const bodyY = y - 13;

  // pattes (4, animées)
  const legC = isSheep ? '#c9c9c9' : '#5f3a20';
  const legW = 3;
  for (let i = 0; i < 4; i++) {
    const lx = x - bodyW / 2 + 3 + i * (bodyW - 6) / 3 - legW / 2;
    leg(ctx, lx, y - 6, legW, 7, legC, mob.walkPhase + (i % 2 ? 0 : Math.PI));
  }

  // corps
  let bodyColor = def.body;
  let bodyDark = def.bodyDark;
  if (flash) { bodyColor = '#ffffff'; bodyDark = '#ffe0e0'; }
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.roundRect
    ? (ctx.roundRect(x - bodyW / 2, bodyY, bodyW, bodyH, 5), ctx.fill())
    : (ctx.fillRect(x - bodyW / 2, bodyY, bodyW, bodyH));
  ctx.fillStyle = bodyDark;
  ctx.fillRect(x - bodyW / 2, bodyY + bodyH - 3, bodyW, 3);

  if (isSheep) {
    // mouton : laine en boules sur le dos
    ctx.fillStyle = flash ? '#ffffff' : '#f8f8f8';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(x - bodyW / 2 + 4 + i * 5.5, bodyY - 2, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // vache : taches blanches
    ctx.fillStyle = flash ? '#ffffff' : '#f4f4f4';
    ctx.fillRect(x - bodyW / 2 + 3, bodyY + 2, 7, 4);
    ctx.fillRect(x + 4, bodyY + 4, 6, 4);
  }

  // tête (orientée selon facing)
  const headW = isSheep ? 12 : 13;
  const headH = isSheep ? 10 : 12;
  let hx = x;
  let hy = bodyY - 2;
  if (mob.facing === 'left') hx = x - bodyW / 2 - headW / 2 + 3;
  else if (mob.facing === 'right') hx = x + bodyW / 2 + headW / 2 - 3;
  else if (mob.facing === 'up') hy = bodyY - headH + 1;
  else hy = bodyY + bodyH - headH + 1;

  ctx.fillStyle = flash ? '#ffffff' : def.head;
  ctx.fillRect(hx - headW / 2, hy, headW, headH);
  ctx.fillStyle = flash ? '#ffdada' : def.face;
  ctx.fillRect(hx - headW / 2, hy + headH - 3, headW, 3);

  // yeux (du côté regardé)
  ctx.fillStyle = '#26262a';
  const eyeY = hy + 3;
  if (mob.facing === 'left') {
    ctx.fillRect(hx - headW / 2 + 1, eyeY, 2, 2);
    ctx.fillRect(hx - headW / 2 + 5, eyeY, 2, 2);
  } else if (mob.facing === 'right') {
    ctx.fillRect(hx + headW / 2 - 7, eyeY, 2, 2);
    ctx.fillRect(hx + headW / 2 - 3, eyeY, 2, 2);
  } else {
    ctx.fillRect(hx - 4, eyeY, 2, 2);
    ctx.fillRect(hx + 2, eyeY, 2, 2);
  }

  // cornes pour la vache
  if (!isSheep) {
    ctx.fillStyle = flash ? '#ffffff' : '#d8d2c4';
    const hornY = hy + 1;
    if (mob.facing === 'left' || mob.facing === 'right') {
      ctx.fillRect(hx - headW / 2 + (mob.facing === 'right' ? headW - 3 : 0), hornY, 3, 2);
    } else {
      ctx.fillRect(hx - 6, hornY, 3, 2);
      ctx.fillRect(hx + 3, hornY, 3, 2);
    }
  } else {
    // oreilles du mouton
    ctx.fillStyle = flash ? '#ffffff' : '#d8d8d8';
    ctx.fillRect(hx - headW / 2 - 1, hy + 2, 2, 3);
    ctx.fillRect(hx + headW / 2 - 1, hy + 2, 2, 3);
  }
}

export function drawMob(ctx, mob) {
  drawMobBody(ctx, mob);
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
