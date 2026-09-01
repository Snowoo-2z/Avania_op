// ============================================================
//  AVANIA — Voitures
//
//  Les premières voitures de Fortune City. Une voiture est une entité
//  simple : une position, un cap, une vitesse. On accélère, on freine
//  (et on recule), on braque — et le cap ne tourne qu'en roulant,
//  comme sur une vraie. Elle bute contre les murs et ne va pas
//  flotter sur l'eau.
//
//  Conduite : F pour monter quand on est à côté, F pour descendre.
//  Les touches de déplacement servent à conduire (Z avance, S freine
//  et recule, Q/D braquent) : elles restent donc rebindables.
//
//  Le cap est un angle en radians, 0 = vers l'est. Les sprites sont
//  dessinés cap à l'est puis pivotés : un seul dessin par modèle.
// ============================================================

import { TILE } from './config.js';
import { makeCanvas } from './utils.js';

// --- Physique (arcade, valeurs choisies au volant) -----------------
const ACCEL_BRAKE = 520;  // décélération quand on freine (px/s²)
const DRAG = 1.7;         // frein moteur : on revient au point mort seul
const MAX_REVERSE = 95;   // marche arrière (px/s)
const TURN = 3.0;         // vitesse de braquage (rad/s)
const GRIP = 70;          // vitesse à partir de laquelle on braque à plein
const BUMP = -0.22;       // rebond contre un obstacle (fraction de vitesse)

// --- Modèles -------------------------------------------------------
// `len` / `wid` en pixels : une tuile fait 32 px, donc une berline
// occupe une tuile et demie de long.
export const CAR_MODELS = {
  sedan: {
    id: 'sedan', label: 'berline',
    len: 46, wid: 26, maxSpeed: 230, accel: 330,
    body: '#e9eaec', roof: '#d5d9dd', glass: '#2b4256', trim: '#3b4046',
  },
  van: {
    id: 'van', label: 'fourgon',
    len: 54, wid: 28, maxSpeed: 185, accel: 250,
    body: '#4a7bad', roof: '#e7ebee', glass: '#2b4256', trim: '#33465c',
  },
  sport: {
    id: 'sport', label: 'sportive',
    len: 48, wid: 26, maxSpeed: 310, accel: 430,
    body: '#c7433a', roof: '#23262b', glass: '#22405c', trim: '#2b2f34',
  },
};

// ------------------------------------------------------------
//  Entité
// ------------------------------------------------------------
export class Car {
  constructor({ x, y, angle = 0, model = 'sedan' }) {
    this.model = CAR_MODELS[model] || CAR_MODELS.sedan;
    this.x = x;
    this.y = y;
    this.angle = angle;   // radians, 0 = est
    this.speed = 0;       // px/s, négatif en marche arrière
    // Profondeur de dessin (trié avec les joueurs, les PNJ et les blocs).
    this.sortY = y;
  }

  // Avance la voiture d'une image. `controls` = { throttle, brake, steer }.
  update(dt, world, controls = {}) {
    const m = this.model;
    const throttle = controls.throttle || 0;
    const brake = controls.brake || 0;
    const steer = controls.steer || 0;

    if (throttle) this.speed += m.accel * dt;
    if (brake) this.speed -= ACCEL_BRAKE * dt;
    // Frein moteur. La borne évite qu'une image très longue (à-coup,
    // onglet en arrière-plan) ne fasse repartir la voiture en arrière.
    this.speed -= this.speed * Math.min(1, DRAG * dt);
    if (this.speed > m.maxSpeed) this.speed = m.maxSpeed;
    if (this.speed < -MAX_REVERSE) this.speed = -MAX_REVERSE;
    if (!throttle && !brake && Math.abs(this.speed) < 3) this.speed = 0;

    // On ne braque qu'en roulant : arrêté, le volant ne fait rien. Et on
    // braque à plein seulement au-dessus d'une certaine allure, sinon la
    // voiture pivote sur place comme un char.
    if (steer && Math.abs(this.speed) > 8) {
      const sens = this.speed >= 0 ? 1 : -1;
      const grip = Math.min(1, Math.abs(this.speed) / GRIP);
      this.angle += steer * TURN * dt * sens * (0.45 + 0.55 * grip);
    }

    const nx = this.x + Math.cos(this.angle) * this.speed * dt;
    const ny = this.y + Math.sin(this.angle) * this.speed * dt;
    let bumped = false;
    if (!this.blocked(world, nx, this.y)) this.x = nx;
    else bumped = true;
    if (!this.blocked(world, this.x, ny)) this.y = ny;
    else bumped = true;
    if (bumped) this.speed *= BUMP;

    this.sortY = this.y;
  }

  // La voiture passe-t-elle à cette position ? On teste les quatre coins
  // de sa caisse (et son centre) : un mur, un arbre ou l'eau l'arrêtent.
  blocked(world, x, y) {
    const c = Math.cos(this.angle);
    const s = Math.sin(this.angle);
    const hl = this.model.len / 2 - 5;
    const hw = this.model.wid / 2 - 2;
    for (let i = 0; i < 5; i++) {
      const sx = i === 4 ? 0 : (i & 1 ? hl : -hl);
      const sy = i === 4 ? 0 : (i & 2 ? hw : -hw);
      const px = Math.floor((x + c * sx - s * sy) / TILE);
      const py = Math.floor((y + s * sx + c * sy) / TILE);
      if (!drivable(world, px, py)) return true;
    }
    return false;
  }

  // Le joueur est-il assez près pour monter ?
  near(px, py, dist = 46) {
    const dx = px - this.x;
    const dy = py - this.y;
    return dx * dx + dy * dy <= dist * dist;
  }
}

// Une tuile où une voiture peut rouler : dans la carte, pas solide, et
// pas de l'eau (on ne traverse pas le bassin en voiture).
function drivable(world, tx, ty) {
  if (!world.inBounds(tx, ty)) return false;
  if (world.isSolidTile(tx, ty)) return false;
  return world.floor[world.idx(tx, ty)] !== 'water';
}

// ------------------------------------------------------------
//  Dessin
// ------------------------------------------------------------
const spriteCache = new Map();

// Découpe les coins : le pixel art du jeu n'a pas d'anti-aliasing, donc
// on trace les arrondis à la main plutôt qu'avec arc().
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.lineTo(x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.lineTo(x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.lineTo(x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.closePath();
  ctx.fill();
}

// Une voiture vue du ciel, cap à l'EST : pare-brise à droite.
function buildCarSprite(m) {
  const W = m.len + 12;
  const H = m.wid + 12;
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const L = m.len;
  const B = m.wid;
  const x = (W - L) / 2;
  const y = (H - B) / 2;

  // 1. Ombre portée au sol : elle seule révèle que la voiture est posée.
  ctx.fillStyle = 'rgba(0,0,0,0.26)';
  rr(ctx, x + 3, y + 5, L, B, 6);

  // 2. Roues : quatre pneus qui dépassent de la caisse.
  ctx.fillStyle = '#191b1e';
  for (const wx of [0.16, 0.74]) {
    ctx.fillRect(x + wx * L, y - 3, 10, 4);
    ctx.fillRect(x + wx * L, y + B - 1, 10, 4);
  }

  // 3. Caisse : flanc sombre, puis le dessus plus clair.
  ctx.fillStyle = m.trim;
  rr(ctx, x, y, L, B, 5);
  ctx.fillStyle = m.body;
  rr(ctx, x + 2, y + 2, L - 4, B - 4, 4);

  // 4. Habitacle : pavillon, pare-brise, lunette arrière et vitres.
  const cabY = y + 4;
  const cabH = B - 8;
  ctx.fillStyle = m.glass;
  // Pare-brise (avant, biseauté) et lunette (arrière).
  rr(ctx, x + L * 0.60, cabY, L * 0.16, cabH, 2);
  rr(ctx, x + L * 0.24, cabY, L * 0.10, cabH, 2);
  // Vitres latérales : deux bandes le long de l'habitacle.
  rr(ctx, x + L * 0.34, cabY, L * 0.26, 3, 1);
  rr(ctx, x + L * 0.34, cabY + cabH - 3, L * 0.26, 3, 1);
  // Pavillon entre les deux vitrages.
  ctx.fillStyle = m.roof;
  rr(ctx, x + L * 0.35, cabY + 2, L * 0.24, cabH - 4, 3);

  // 5. Reflets : le toit accroche la lumière du nord-est.
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(x + L * 0.35, cabY + 2, L * 0.24, 2);
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fillRect(x + 2, y + 2, L - 4, 1);

  // 6. Phares (avant) et feux (arrière).
  ctx.fillStyle = '#ffe9b0';
  ctx.fillRect(x + L - 3, y + 3, 3, 4);
  ctx.fillRect(x + L - 3, y + B - 7, 3, 4);
  ctx.fillStyle = '#c8392f';
  ctx.fillRect(x, y + 3, 2, 4);
  ctx.fillRect(x, y + B - 7, 2, 4);

  // 7. Rétroviseurs.
  ctx.fillStyle = m.trim;
  ctx.fillRect(x + L * 0.58, y - 2, 3, 3);
  ctx.fillRect(x + L * 0.58, y + B - 1, 3, 3);

  return canvas;
}

export function carSprite(model) {
  const key = model.id;
  let sprite = spriteCache.get(key);
  if (!sprite) {
    sprite = buildCarSprite(model);
    spriteCache.set(key, sprite);
  }
  return sprite;
}

// Dessine une voiture dans le repère MONDE (la caméra est déjà appliquée).
export function drawCar(ctx, car) {
  const sprite = carSprite(car.model);
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
  ctx.restore();
}

// Réchauffe les sprites (évite une soudaine construction au premier
// affichage d'un modèle).
export function buildCarSprites() {
  for (const id of Object.keys(CAR_MODELS)) carSprite(CAR_MODELS[id]);
}
