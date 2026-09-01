// ============================================================
//  AVANIA — Paramètres : curseur custom pixel art + raccourcis
//  Toutes les valeurs sont appliquées au jeu (le Game lit cet objet
//  chaque frame) et persistées dans localStorage.
// ============================================================

import {
  KEY_ACTIONS, bindings, saveBindings, resetBindings,
  formatTrigger, actionUsingTrigger,
  triggerFromKey, triggerFromMouse, triggerFromWheel,
} from './keys.js';
import { isLowPowerDevice } from './utils.js';

const SAVE_KEY = 'avania.settings';

function loadSettings() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveSettings(s) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

// --- Curseur pixel art pré-rendu en canvas ---
function drawCrosshair(ctx, s) {
  const c = s / 2;
  const t = Math.max(2, s / 8);
  ctx.strokeStyle = '#000';
  ctx.lineWidth = t + 2;
  ctx.beginPath();
  ctx.moveTo(c, s * 0.12); ctx.lineTo(c, s - s * 0.12);
  ctx.moveTo(s * 0.12, c); ctx.lineTo(s - s * 0.12, c);
  ctx.stroke();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = t;
  ctx.beginPath();
  ctx.moveTo(c, s * 0.12); ctx.lineTo(c, s - s * 0.12);
  ctx.moveTo(s * 0.12, c); ctx.lineTo(s - s * 0.12, c);
  ctx.stroke();
  ctx.fillStyle = '#7ccf6a';
  ctx.fillRect(c - t * 0.6, c - t * 0.6, t * 1.2, t * 1.2);
}

function drawDot(ctx, s) {
  const c = s / 2;
  const r = s / 5;
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(c, c, r + 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#7ccf6a';
  ctx.beginPath(); ctx.arc(c, c, r * 0.45, 0, Math.PI * 2); ctx.fill();
}

function drawSword(ctx, s) {
  const c = s / 2;
  ctx.save();
  ctx.translate(c, c);
  ctx.rotate(-Math.PI / 4);
  const u = s / 32; // unité relative (le motif est dessiné pour 32px)
  // Lame
  ctx.fillStyle = '#000'; ctx.fillRect(-2.5 * u, -c + 3 * u, 5 * u, c - 3 * u);
  ctx.fillStyle = '#c6ccd2'; ctx.fillRect(-1.5 * u, -c + 4 * u, 3 * u, c - 6 * u);
  ctx.fillStyle = '#eef2f6'; ctx.fillRect(-0.5 * u, -c + 5 * u, 1 * u, c - 8 * u);
  // Garde
  ctx.fillStyle = '#000'; ctx.fillRect(-5 * u, 1 * u, 10 * u, 4 * u);
  ctx.fillStyle = '#f2c14e'; ctx.fillRect(-4 * u, 2 * u, 8 * u, 2 * u);
  // Poignée
  ctx.fillStyle = '#6a3a1e'; ctx.fillRect(-1.5 * u, 5 * u, 3 * u, 5 * u);
  ctx.restore();
}

function drawPickaxe(ctx, s) {
  const c = s / 2;
  ctx.save();
  ctx.translate(c, c);
  ctx.rotate(-Math.PI / 4);
  const u = s / 32;
  ctx.fillStyle = '#000'; ctx.fillRect(-1.5 * u, -2 * u, 3 * u, c);
  ctx.fillStyle = '#c89a5e'; ctx.fillRect(-1 * u, -1 * u, 2 * u, c - 2 * u);
  ctx.fillStyle = '#000'; ctx.fillRect(-8 * u, -c + 3 * u, 16 * u, 5 * u);
  ctx.fillStyle = '#a4a4ac'; ctx.fillRect(-7 * u, -c + 4 * u, 14 * u, 3 * u);
  ctx.fillStyle = '#d8d8de'; ctx.fillRect(-6 * u, -c + 4 * u, 12 * u, 1 * u);
  ctx.fillStyle = '#888890'; ctx.fillRect(-7 * u, -c + 7 * u, 4 * u, 3 * u);
  ctx.fillRect(3 * u, -c + 7 * u, 4 * u, 3 * u);
  ctx.restore();
}

function drawHand(ctx, s) {
  const c = s / 2;
  ctx.save();
  ctx.translate(c, c);
  const u = s / 32;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.moveTo(-3 * u, -c + 4 * u); ctx.lineTo(-3 * u, -2 * u); ctx.lineTo(-6 * u, -2 * u);
  ctx.lineTo(-6 * u, 4 * u); ctx.lineTo(-3 * u, 4 * u); ctx.lineTo(-3 * u, 2 * u);
  ctx.lineTo(3 * u, 2 * u); ctx.lineTo(3 * u, 4 * u); ctx.lineTo(6 * u, 4 * u);
  ctx.lineTo(6 * u, -2 * u); ctx.lineTo(3 * u, -2 * u); ctx.lineTo(3 * u, -c + 4 * u);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#f7d7b5';
  ctx.beginPath();
  ctx.moveTo(-2 * u, -c + 5 * u); ctx.lineTo(-2 * u, -1 * u); ctx.lineTo(-5 * u, -1 * u);
  ctx.lineTo(-5 * u, 3 * u); ctx.lineTo(-2 * u, 3 * u); ctx.lineTo(2 * u, 3 * u);
  ctx.lineTo(5 * u, 3 * u); ctx.lineTo(5 * u, -1 * u); ctx.lineTo(2 * u, -1 * u);
  ctx.lineTo(2 * u, -c + 5 * u);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

const CURSOR_DRAWERS = {
  crosshair: drawCrosshair,
  dot: drawDot,
  sword: drawSword,
  pickaxe: drawPickaxe,
  hand: drawHand,
};

// --- Module principal ---
export class Settings {
  constructor() {
    const saved = loadSettings() || {};
    this.cursorStyle = saved.cursorStyle ?? 'crosshair';
    this.cursorSize = saved.cursorSize ?? 24;
    this.zoom = saved.zoom ?? 2;
    this.vignette = saved.vignette ?? true;
    this.particles = saved.particles ?? true;
    this.aimAssist = saved.aimAssist ?? true;
    // Conduite : 100 = volant d'origine. En dessous les roues braquent
    // moins (la voiture tire droit, facile à tenir) ; au-dessus elle est
    // vive mais demande du doigté.
    this.driveSens = Number.isFinite(saved.driveSens)
      ? Math.max(40, Math.min(180, saved.driveSens))
      : 100;
    // Communication (multijoueur) : côté de l'écran où vit la fenêtre du
    // chat global ('left' | 'right'), et affichage ou non des bulles du
    // talkie-walkie au-dessus des joueurs.
    this.chatSide = saved.chatSide === 'right' ? 'right' : 'left';
    this.bubbles = saved.bubbles ?? true;
    // Niveau graphiques : 'low' | 'medium' | 'high'. Par défaut, élevé,
    // sauf machine modeste détectée automatiquement.
    this.graphics = ['low', 'medium', 'high'].includes(saved.graphics)
      ? saved.graphics
      : (isLowPowerDevice() ? 'low' : 'high');

    this.cursorCanvas = document.getElementById('custom-cursor');
    this.cursorCtx = this.cursorCanvas?.getContext('2d');
    this.panel = document.getElementById('settings-panel');
    this.btn = document.getElementById('settings-btn');

    // Appelé à chaque ouverture/fermeture (main.js s'en sert pour (dé)pauser).
    this.onToggle = null;
    // Appelé quand l'emplacement du chat change (et une fois au démarrage).
    this.onChatSide = null;
    this._rebind = null; // rebind en cours : { actionId, btn, cleanup }

    this._renderCursorPreviews();
    this._renderCursor();
    this._bindUI();
    this._buildKeybinds();
  }

  _save() {
    saveSettings({
      cursorStyle: this.cursorStyle,
      cursorSize: this.cursorSize,
      zoom: this.zoom,
      vignette: this.vignette,
      particles: this.particles,
      aimAssist: this.aimAssist,
      driveSens: this.driveSens,
      chatSide: this.chatSide,
      bubbles: this.bubbles,
      graphics: this.graphics,
    });
  }

  // Trois boutons « Faible / Moyen / Élevé » pour la qualité graphique.
  _bindGraphics() {
    const btns = document.querySelectorAll('#graphics-levels .graphics-btn');
    if (!btns.length) return;
    const paint = () => btns.forEach((b) => b.classList.toggle('active', b.dataset.level === this.graphics));
    paint();
    btns.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.graphics = btn.dataset.level;
        paint();
        this._save();
      });
    });
  }

  // Dessine le curseur À LA TAILLE CHOISIE (avant, la taille fixe de 32px
  // rendait le réglage « Taille du curseur » totalement inerte).
  _renderCursor() {
    const c = this.cursorCanvas;
    if (!c) return;
    const size = Math.max(8, Math.min(64, this.cursorSize || 24));
    c.width = size;
    c.height = size;
    const ctx = this.cursorCtx;
    ctx.clearRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = false;
    const drawer = CURSOR_DRAWERS[this.cursorStyle] || drawCrosshair;
    drawer(ctx, size);
    const url = c.toDataURL('image/png');
    const hotspot = Math.round(size / 2);
    document.body.style.cursor = `url(${url}) ${hotspot} ${hotspot}, crosshair`;
  }

  // Remplace les symboles des boutons de style par un vrai aperçu du curseur.
  _renderCursorPreviews() {
    document.querySelectorAll('.cursor-style-btn').forEach((btn) => {
      const style = btn.dataset.cursor;
      const drawer = CURSOR_DRAWERS[style] || drawCrosshair;
      const s = 28;
      const cv = document.createElement('canvas');
      cv.width = s; cv.height = s;
      const cx = cv.getContext('2d');
      cx.imageSmoothingEnabled = false;
      drawer(cx, s);
      btn.textContent = '';
      const img = document.createElement('img');
      img.src = cv.toDataURL('image/png');
      img.className = 'cursor-preview-img';
      img.alt = style;
      btn.appendChild(img);
    });
  }

  _bindUI() {
    document.getElementById('settings-close')?.addEventListener('click', () => this.close());
    this.panel?.querySelector('.panel-backdrop')?.addEventListener('click', () => this.close());

    // Style du curseur
    const styleBtns = document.querySelectorAll('.cursor-style-btn');
    styleBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.cursor === this.cursorStyle);
      btn.addEventListener('click', () => {
        styleBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.cursorStyle = btn.dataset.cursor;
        this._renderCursor();
        this._save();
      });
    });

    // Taille du curseur
    const sizeRange = document.getElementById('cursor-size-range');
    const sizeVal = document.getElementById('cursor-size-value');
    if (sizeRange) {
      sizeRange.value = this.cursorSize;
      sizeVal.textContent = `${this.cursorSize}px`;
      sizeRange.addEventListener('input', () => {
        this.cursorSize = Number(sizeRange.value);
        sizeVal.textContent = `${this.cursorSize}px`;
        this._renderCursor();
        this._save();
      });
    }

    // Zoom
    const sensRange = document.getElementById('drive-sens-range');
    const sensVal = document.getElementById('drive-sens-value');
    if (sensRange) {
      sensRange.value = this.driveSens;
      sensVal.textContent = `${this.driveSens} %`;
      sensRange.addEventListener('input', () => {
        this.driveSens = Number(sensRange.value);
        sensVal.textContent = `${this.driveSens} %`;
        this._save();
      });
    }

    const zoomRange = document.getElementById('zoom-range');
    const zoomVal = document.getElementById('zoom-value');
    if (zoomRange) {
      zoomRange.value = this.zoom;
      zoomVal.textContent = `${this.zoom}×`;
      zoomRange.addEventListener('input', () => {
        this.zoom = Number(zoomRange.value);
        zoomVal.textContent = `${this.zoom}×`;
        this._save();
      });
    }

    // Toggles
    this._bindToggle('toggle-vignette', 'vignette');
    this._bindToggle('toggle-particles', 'particles');
    this._bindToggle('toggle-aimassist', 'aimAssist');
    this._bindToggle('toggle-bubbles', 'bubbles');

    // Emplacement de la fenêtre du chat global (gauche / droite)
    this._bindChatSide();

    // Niveau de qualité graphique (faible / moyen / élevé)
    this._bindGraphics();

    // Bouton « Réinitialiser les touches »
    document.getElementById('keybinds-reset')?.addEventListener('click', () => {
      resetBindings();
      this._buildKeybinds();
    });
  }

  // Deux boutons « Bas à gauche / Bas à droite » pour la fenêtre du chat :
  // le chat global n'a pas de touche (on clique dedans), donc son
  // emplacement doit rester confortable pour chacun.
  _bindChatSide() {
    const btns = document.querySelectorAll('#chat-side .chat-side-btn');
    if (!btns.length) return;
    const paint = () => btns.forEach((b) => b.classList.toggle('active', b.dataset.side === this.chatSide));
    paint();
    btns.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.chatSide = btn.dataset.side === 'right' ? 'right' : 'left';
        paint();
        this._save();
        this.onChatSide?.(this.chatSide);
      });
    });
    // Appliqué une fois au démarrage (js/main.js branche le rappel avant).
    this.onChatSide?.(this.chatSide);
  }

  _bindToggle(btnId, key) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.classList.toggle('active', this[key]);
    btn.setAttribute('aria-pressed', String(this[key]));
    btn.addEventListener('click', () => {
      this[key] = !this[key];
      btn.classList.toggle('active', this[key]);
      btn.setAttribute('aria-pressed', String(this[key]));
      this._save();
    });
  }

  // ------------------------------------------------------------
  //  Raccourcis personnalisables : construction de l'UI + rebind
  // ------------------------------------------------------------
  _buildKeybinds() {
    const container = document.getElementById('keybinds');
    if (!container) return;
    container.innerHTML = '';
    const groups = {};
    for (const a of KEY_ACTIONS) (groups[a.group] ||= []).push(a);
    for (const [groupName, actions] of Object.entries(groups)) {
      const sec = document.createElement('div');
      sec.className = 'keybind-group';
      const title = document.createElement('div');
      title.className = 'keybind-group-title';
      title.textContent = groupName;
      sec.appendChild(title);
      for (const a of actions) {
        const row = document.createElement('div');
        row.className = 'keybind-row';
        const label = document.createElement('span');
        label.className = 'keybind-label';
        label.textContent = a.label;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'keybind-key';
        btn.dataset.action = a.id;
        btn.textContent = formatTrigger(bindings[a.id]);
        btn.addEventListener('click', () => this._startRebind(a.id, btn));
        row.appendChild(label);
        row.appendChild(btn);
        sec.appendChild(row);
      }
      container.appendChild(sec);
    }
  }

  _refreshKeybindBtn(actionId) {
    const btn = this.panel.querySelector(`.keybind-key[data-action="${actionId}"]`);
    if (btn && !btn.classList.contains('listening')) {
      btn.textContent = formatTrigger(bindings[actionId]);
    }
  }

  _startRebind(actionId, btn) {
    this._cancelRebind();
    this._rebind = { actionId, btn, cleanup: null };
    btn.classList.add('listening');
    btn.textContent = 'Appuyez…';

    const onKey = (e) => {
      if ((e.key || '').toLowerCase() === 'escape') { e.preventDefault(); this._cancelRebind(); return; }
      const t = triggerFromKey(e);
      if (!t) return; // modificateur seul : on attend une vraie touche
      e.preventDefault(); e.stopPropagation();
      this._assign(actionId, t);
    };
    const onMouse = (e) => {
      e.preventDefault(); e.stopPropagation();
      this._assign(actionId, triggerFromMouse(e));
    };
    const onWheel = (e) => {
      e.preventDefault(); e.stopPropagation();
      this._assign(actionId, triggerFromWheel(e));
    };
    // Phase de capture : on intercepte l'entrée AVANT le jeu (Input/main).
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('mousedown', onMouse, true);
    window.addEventListener('wheel', onWheel, { capture: true, passive: false });
    this._rebind.cleanup = () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousedown', onMouse, true);
      window.removeEventListener('wheel', onWheel, { capture: true, passive: false });
    };
  }

  _cancelRebind() {
    if (!this._rebind) return;
    const { btn, actionId, cleanup } = this._rebind;
    cleanup?.();
    btn.classList.remove('listening');
    btn.textContent = formatTrigger(bindings[actionId]);
    this._rebind = null;
  }

  // Assigne un déclencheur à une action. En cas de conflit avec une autre
  // action, on ÉCHANGE les déclencheurs (aucune action ne se retrouve sans
  // touche) — comportement classique des jeux.
  _assign(actionId, trigger) {
    const old = bindings[actionId];
    const other = actionUsingTrigger(trigger, actionId);
    if (other) bindings[other] = old;
    bindings[actionId] = trigger;
    saveBindings();
    this._cancelRebind();
    this._refreshKeybindBtn(actionId);
    if (other) this._refreshKeybindBtn(other);
  }

  open() {
    if (!this.panel) return;
    this.panel.classList.remove('hidden');
    this.onToggle?.();
  }

  close() {
    if (!this.panel) return;
    this._cancelRebind();
    this.panel.classList.add('hidden');
    this.onToggle?.();
  }

  toggle() {
    if (this.panel?.classList.contains('hidden')) this.open();
    else this.close();
  }

  get isOpen() {
    return this.panel && !this.panel.classList.contains('hidden');
  }
}
