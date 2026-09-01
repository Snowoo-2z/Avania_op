// ============================================================
//  AVANIA — La traversée (cinématique)
//
//  Entre deux îles, le joueur est SUR le bateau : on ne rend plus le
//  monde mais la mer qui défile, le ferry qui avance, le sillage, et
//  un bandeau de traversée. Le passage de l'autre côté n'a lieu qu'à
//  la fin — le joueur « débarque » vraiment.
//
//  La scène est volontairement entièrement dessinée au canvas (pas de
//  DOM) : elle s'intègre dans la boucle de rendu sans rien avoir à
//  brancher dans index.html, et elle coûte le prix d'un décor.
//
//  Ce module est pur : il ne connaît ni le monde ni le joueur, juste
//  deux noms d'îles et une durée. Testable directement.
// ============================================================

import { getWaterFrame, getObjectSprite, WATER_FRAMES } from './tileset.js';

// Durée d'une traversée (secondes). Assez longue pour lire le bandeau,
// assez courte pour ne pas lasser à la dixième traversée.
export const CROSSING_DURATION = 3.8;
// Fondu au noir en entrée et en sortie (secondes).
const FADE_IN = 0.45;
const FADE_OUT = 0.5;

export class Crossing {
  constructor(options = {}) {
    this.duration = options.duration || CROSSING_DURATION;
    this.running = false;
    this.t = 0;
    this.from = '';
    this.to = '';
    this.onArrive = null;
  }

  // Lance la traversée. `onArrive` est appelé une seule fois, à la fin
  // (ou tout de suite si le joueur passe la cinématique).
  start(from, to, onArrive) {
    this.from = from || '';
    this.to = to || '';
    this.onArrive = onArrive || null;
    this.t = 0;
    this.running = true;
  }

  // Le joueur presse une touche : on accoste tout de suite.
  skip() {
    if (!this.running) return false;
    this.t = this.duration;
    return true;
  }

  // Avance la cinématique. Renvoie true tant qu'elle occupe l'écran.
  update(dt) {
    if (!this.running) return false;
    this.t += dt;
    if (this.t < this.duration) return true;
    this.finish();
    return false;
  }

  finish() {
    if (!this.running) return;
    this.running = false;
    this.t = this.duration;
    const done = this.onArrive;
    this.onArrive = null;
    if (done) done();
  }

  // 0 au départ, 1 à l'arrivée.
  progress() {
    if (!this.duration) return 1;
    return Math.max(0, Math.min(1, this.t / this.duration));
  }

  // ------------------------------------------------------------
  //  Dessin
  // ------------------------------------------------------------
  draw(ctx, W, H) {
    const t = this.t;
    const p = this.progress();

    // --- 1) la mer : des tuiles d'eau qui défilent (le bateau avance) ---
    const frame = Math.floor(t * 6) % WATER_FRAMES;
    const water = getWaterFrame(frame);
    const s = water.width;
    if (s > 0) {
      // Le fond fuit vers l'ouest : c'est le bateau qui avance vers l'est.
      const scrollX = (t * 90) % s;
      const scrollY = (t * 26) % s;
      for (let y = -s; y < H + s; y += s) {
        for (let x = -s; x < W + s; x += s) {
          ctx.drawImage(water, x - scrollX, y + scrollY);
        }
      }
      // Une seconde couche, décalée et plus lente : donne du fond.
      ctx.globalAlpha = 0.18;
      for (let y = -s; y < H + s; y += s * 2) {
        for (let x = -s; x < W + s; x += s * 2) {
          ctx.drawImage(water, (x - scrollX * 0.45) % (W + s * 2) - s, y - scrollY * 0.5);
        }
      }
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = '#2f76b2';
      ctx.fillRect(0, 0, W, H);
    }

    // --- 2) le ferry, cap à l'est (la proue du sprite pointe au nord :
    //        on le fait pivoter d'un quart de tour) ---
    const cx = W * 0.5;
    const cy = H * 0.5;
    const sprite = getObjectSprite('ferry');
    if (sprite) {
      const scale = Math.min(1.15, Math.max(0.62, Math.min(W, H) / 620));
      const bob = Math.sin(t * 2.2) * 3;
      ctx.save();
      ctx.translate(cx, cy + bob);
      ctx.rotate(Math.PI / 2 + Math.sin(t * 1.4) * 0.025);
      ctx.scale(scale, scale);
      ctx.drawImage(sprite.canvas, -sprite.anchorX, -sprite.anchorY,
        sprite.canvas.width, sprite.canvas.height);
      ctx.restore();

      // --- 3) le sillage : il traîne derrière, donc à l'ouest ---
      const wake = sprite.canvas.width * scale * 0.5;
      ctx.save();
      ctx.translate(cx - wake * 0.1, cy + bob);
      for (let i = 0; i < 5; i++) {
        const d = wake * (0.55 + i * 0.32);
        const a = 0.20 - i * 0.032;
        if (a <= 0) break;
        ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(-d, Math.sin(t * 3 - i) * 6, 16 + i * 13, 9 + i * 5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // Les deux filets d'écume des hélices.
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 3;
      for (const dy of [-13, 13]) {
        ctx.beginPath();
        ctx.moveTo(-wake * 0.5, dy);
        for (let i = 1; i <= 6; i++) {
          const x = -wake * 0.5 - i * 26;
          ctx.lineTo(x, dy + Math.sin(t * 5 - i * 0.7) * (3 + i * 1.6) + Math.sign(dy) * i * 1.4);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    // --- 4) les fondus : on embarque, on accoste ---
    if (t < FADE_IN) {
      ctx.fillStyle = `rgba(0,0,0,${(1 - t / FADE_IN).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
    const left = this.duration - t;
    if (left < FADE_OUT) {
      ctx.fillStyle = `rgba(0,0,0,${(1 - Math.max(0, left) / FADE_OUT).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }

    // --- 5) le bandeau de traversée ---
    const title = this.to ? `Cap sur ${this.to}` : 'En mer';
    const sub = this.from ? `Gab largue les amarres — ${this.from} s’éloigne.` : '';
    drawBanner(ctx, W, H, title, sub, p, t);
  }
}

// Bandeau en bas de l'écran : titre, sous-titre et jauge de progression.
function drawBanner(ctx, W, H, title, sub, progress, t) {
  const pad = 14;
  const boxW = Math.min(W - 40, 460);
  const boxH = sub ? 74 : 56;
  const x = (W - boxW) / 2;
  const y = H - boxH - 46;

  ctx.save();
  ctx.fillStyle = 'rgba(12,16,20,0.72)';
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, boxW, boxH, 10);
    ctx.fill();
  } else {
    ctx.fillRect(x, y, boxW, boxH);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 1;
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, boxW, boxH, 10);
    ctx.stroke();
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.fillText(title, W / 2, y + 26);
  if (sub) {
    ctx.fillStyle = 'rgba(226,236,240,0.78)';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(sub, W / 2, y + 45);
  }

  // La jauge : où en est-on de la traversée.
  const gx = x + pad;
  const gw = boxW - pad * 2;
  const gy = y + boxH - 14;
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(gx, gy, gw, 4);
  ctx.fillStyle = '#7fc4e8';
  ctx.fillRect(gx, gy, Math.round(gw * progress), 4);

  // Le rappel « on peut passer » clignote doucement.
  ctx.fillStyle = `rgba(226,236,240,${(0.45 + Math.sin(t * 3) * 0.2).toFixed(3)})`;
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('F ou Échap pour accoster plus vite', W / 2, y + boxH + 18);
  ctx.restore();
}
