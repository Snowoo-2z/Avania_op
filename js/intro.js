// ============================================================
//  AVANIA — Cinématique d'arrivée sur l'île
//
//  Un monsieur en costume-cravate aborde le joueur, lui remet sa
//  somme de départ et lui explique les règles de l'argent, puis
//  repart. Pendant toute la scène, le joueur ne peut pas bouger :
//  c'est la toute première chose qu'il voit du monde.
//
//  La scène est entièrement pilotée ici (aucune dépendance à l'UI
//  en dehors des éléments DOM qu'on lui passe), ce qui la rend
//  testable et skippable à tout moment.
// ============================================================

import { TILE } from './config.js';
import { CURRENCY } from './economy.js';
import { GENTLEMAN_NAME } from './npc/gentleman.js';
import { drawGentleman } from './npc/index.js';

const STORAGE_KEY = 'avania.intro.v1';

// Vitesse de marche du représentant (px/s) : un peu plus lente que le
// joueur, pour une arrivée posée et lisible.
const WALK_SPEED = 78;
// Distance à laquelle il s'arrête pour parler (px monde).
const TALK_DISTANCE = 44;
// Vitesse d'affichage du texte (caractères / seconde).
const TYPE_SPEED = 34;
// Pause entre deux répliques une fois le texte terminé.
const BEAT_PAUSE = 0.35;

// La réplique du représentant, MOT POUR MOT.
//
// Elle est affichée en plusieurs temps pour rester lisible, mais aucun
// caractère n'est réécrit : INTRO_LINES n'est qu'un découpage de cette
// chaîne (test/smoke.mjs vérifie que la recoller redonne exactement
// INTRO_SPEECH). Ne pas « corriger » cette phrase sans changer aussi le
// test : c'est le texte demandé tel quel.
export const INTRO_SPEECH = 'Bonjour et Bienvenue a Avania Monsieu. '
  + 'Voici de l\'argents, ici l\'argent sert de monnaie meme si le troc reste possible. '
  + 'A la fin de cette aventure la personne avec le plus d\'argents gagnera. '
  + 'Bonne chance';

// Découpe après chaque point suivi d'un espace (pas de lookbehind : ça
// doit aussi marcher sur un vieux navigateur).
export const INTRO_LINES = (() => {
  const out = [];
  let start = 0;
  for (let i = 0; i < INTRO_SPEECH.length; i++) {
    if (INTRO_SPEECH[i] !== '.') continue;
    if (i + 1 < INTRO_SPEECH.length && INTRO_SPEECH[i + 1] !== ' ') continue;
    out.push(INTRO_SPEECH.slice(start, i + 1));
    start = i + 2;
    i = start - 1;
  }
  if (start < INTRO_SPEECH.length) out.push(INTRO_SPEECH.slice(start));
  return out;
})();

// Index de la réplique qui déclenche le versement de la somme de départ :
// celle qui annonce l'argent.
export const GRANT_LINE_INDEX = INTRO_LINES.findIndex((line) => /argent/i.test(line));

export const INTRO_STORAGE_KEY = STORAGE_KEY;

export class IntroSequence {
  constructor(game, wallet, elements = {}) {
    this.game = game;
    this.wallet = wallet;
    this.el = {
      root: elements.root || null,
      speaker: elements.speaker || null,
      text: elements.text || null,
      portrait: elements.portrait || null,
      hint: elements.hint || null,
      skip: elements.skip || null,
    };

    this.active = false;
    this.phase = 'idle';   // idle | enter | talk | leave | done
    this.t = 0;
    this.lineIndex = 0;
    this.typed = 0;
    this.beat = 0;
    this.granted = false;
    this.time = 0;

    // Le PNJ est un objet du monde comme un autre : la boucle de jeu
    // le trie en profondeur avec le reste. Scale augmenté pour le rendre plus imposant et élégant.
    this.npc = {
      kind: 'gentleman',
      name: GENTLEMAN_NAME,
      title: 'Représentant de l\'île',
      x: 0,
      y: 0,
      facing: 'right',
      walkPhase: 0,
      moving: false,
      scale: 1.32,
      showHint: false,
      time: 0,
      sortY: 0,
      dy: 5, // DRAW_NPC
    };

    this._onKey = (e) => {
      if (!this.active) return;
      const k = (e.key || '').toLowerCase();
      if (k === 'escape') {
        e.preventDefault();
        this.skip();
      } else if (k === ' ' || k === 'enter') {
        e.preventDefault();
        this.advance();
      }
    };
    this._onClick = () => { if (this.active) this.advance(); };

    if (this.el.skip) this.el.skip.addEventListener('click', (e) => { e.stopPropagation(); this.skip(); });
    if (this.el.root) this.el.root.addEventListener('click', this._onClick);
  }

  // ------------------------------------------------------------
  static alreadySeen() {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
  }

  static markSeen() {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* ignore */ }
  }

  // ------------------------------------------------------------
  start() {
    const player = this.game.player;
    this.active = true;
    this.phase = 'enter';
    this.t = 0;
    this.lineIndex = 0;
    this.typed = 0;
    this.beat = 0;
    this.granted = false;

    // Il arrive de la gauche, hors écran.
    this.npc.x = player.x - 260;
    this.npc.y = player.y + 4;
    this.npc.facing = 'right';
    this.npc.showHint = false;
    this.game.addNpc(this.npc);
    this.game.setCutscene(true);

    window.addEventListener('keydown', this._onKey, true);
    this._openDialog();
    this._setLine(0, true);
  }

  // ------------------------------------------------------------
  //  Interface DOM
  // ------------------------------------------------------------
  _openDialog() {
    const root = this.el.root;
    if (!root) return;
    root.classList.remove('hidden');
    // Petite animation d'apparition : on relance le cycle CSS.
    root.classList.remove('dialog-in');
    void root.offsetWidth;
    root.classList.add('dialog-in');
    if (this.el.speaker) this.el.speaker.textContent = GENTLEMAN_NAME;
    this._paintPortrait();
  }

  _closeDialog() {
    if (this.el.root) this.el.root.classList.add('hidden');
  }

  // Portrait du représentant, rendu une seule fois avec le vrai sprite.
  // Version améliorée : fond dégradé doré, halo lumineux, plus grande échelle
  _paintPortrait() {
    const canvas = this.el.portrait;
    if (!canvas || canvas._painted) return;
    canvas._painted = true;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const W = canvas.width, H = canvas.height;
    // Fond radial élégant
    const bg = ctx.createRadialGradient(W * 0.5, H * 0.35, 4, W * 0.5, H * 0.5, H * 0.9);
    bg.addColorStop(0, '#6b7a8a');
    bg.addColorStop(0.35, '#4a5566');
    bg.addColorStop(0.7, '#3a3f4a');
    bg.addColorStop(1, '#2a2f3a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    // Halo doré subtil derrière
    const halo = ctx.createRadialGradient(W * 0.5, H * 0.6, 2, W * 0.5, H * 0.6, 38);
    halo.addColorStop(0, 'rgba(212,175,55,0.22)');
    halo.addColorStop(0.5, 'rgba(212,175,55,0.06)');
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, H);
    // Le sprite a ses pieds à y = 48 : on le cale en bas du portrait, plus grand et centré
    drawGentleman(ctx, W / 2, H - 4, {
      facing: 'right',
      walkPhase: 0,
      scale: 1.9,
      shadow: true,
    });
    // Petit éclat doré en haut à droite
    ctx.fillStyle = 'rgba(232,201,106,0.18)';
    ctx.beginPath();
    ctx.arc(W * 0.75, H * 0.22, 10, 0, Math.PI * 2);
    ctx.fill();
  }

  _setLine(index, silent = false) {
    this.lineIndex = index;
    this.typed = silent ? 0 : 0;
    this.beat = 0;
    if (this.el.text) this.el.text.textContent = '';
    if (this.el.hint) this.el.hint.classList.remove('ready');
  }

  _currentLine() {
    return INTRO_LINES[this.lineIndex] || '';
  }

  // ------------------------------------------------------------
  //  Progression
  // ------------------------------------------------------------
  advance() {
    if (!this.active) return;
    if (this.phase !== 'talk') return;
    // Texte pas encore entièrement affiché : on l'affiche d'un coup.
    if (this.typed < this._currentLine().length) {
      this.typed = this._currentLine().length;
      this._render();
      return;
    }
    this.nextLine();
  }

  nextLine() {
    // Le versement se fait à la fin de la réplique qui l'annonce.
    if (this.lineIndex === GRANT_LINE_INDEX) this._grant();

    if (this.lineIndex + 1 >= INTRO_LINES.length) {
      this.phase = 'leave';
      this.npc.facing = 'left';
      this._closeDialog();
      return;
    }
    this._setLine(this.lineIndex + 1);
  }

  _grant() {
    if (this.granted || !this.wallet) return;
    this.granted = true;
    // La somme n'est versée qu'une seule fois, même si la cinématique
    // est rejouée : l'argent se gagne, il ne pleut pas.
    if (!this.wallet.hasReceivedGrant()) {
      this.wallet.add(CURRENCY.startingGrant, 'Somme de bienvenue');
      this.wallet.markGrantReceived();
    }
    if (this.game.notify) {
      this.game.notify(`+ ${CURRENCY.startingGrant} ${CURRENCY.plural.toLowerCase()} remis par ${GENTLEMAN_NAME}`);
    }
  }

  // Passe directement à la fin (bouton « Passer » ou Échap).
  skip() {
    if (!this.active) return;
    this._grant();
    this.phase = 'leave';
    this.npc.facing = 'left';
    this._closeDialog();
  }

  finish() {
    this.active = false;
    this.phase = 'done';
    this.game.removeNpc(this.npc);
    this.game.setCutscene(false);
    this._closeDialog();
    window.removeEventListener('keydown', this._onKey, true);
    IntroSequence.markSeen();
    if (typeof this.onFinish === 'function') this.onFinish();
  }

  // ------------------------------------------------------------
  update(dt) {
    if (!this.active) return;
    this.time += dt;
    this.npc.time = this.time;

    const player = this.game.player;
    const targetX = player.x - TALK_DISTANCE;

    if (this.phase === 'enter') {
      this.npc.facing = 'right';
      const dx = targetX - this.npc.x;
      if (Math.abs(dx) <= 3) {
        this.npc.x = targetX;
        this.npc.moving = false;
        this.phase = 'talk';
        this.beat = 0.25;
      } else {
        const step = Math.sign(dx) * WALK_SPEED * dt;
        this.npc.x += Math.abs(step) > Math.abs(dx) ? dx : step;
        this.npc.moving = true;
        this.npc.walkPhase += dt * 10;
      }
      // Le joueur se tourne vers son interlocuteur.
      player.facing = 'left';
    } else if (this.phase === 'talk') {
      this.npc.moving = false;
      player.facing = 'left';
      const full = this._currentLine();
      if (this.typed < full.length) {
        this.typed = Math.min(full.length, this.typed + TYPE_SPEED * dt);
        this._render();
      } else if (this.beat > 0) {
        this.beat -= dt;
      } else if (this.autoAdvance) {
        this.nextLine();
      }
    } else if (this.phase === 'leave') {
      this.npc.facing = 'left';
      this.npc.moving = true;
      this.npc.x -= WALK_SPEED * dt;
      this.npc.walkPhase += dt * 10;
      // Il sort de la vue : la scène se termine.
      if (this.npc.x < player.x - 300) this.finish();
    }

    this.npc.sortY = this.npc.y;
  }

  _render() {
    if (!this.el.text) return;
    const full = this._currentLine();
    const shown = full.slice(0, Math.floor(this.typed));
    if (this.el.text.textContent !== shown) this.el.text.textContent = shown;
    const done = this.typed >= full.length;
    if (this.el.hint) this.el.hint.classList.toggle('ready', done);
  }
}

// Taille d'une tuile : exposée pour que l'appelant puisse placer la scène.
export const INTRO_TILE = TILE;
