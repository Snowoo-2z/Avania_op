// ============================================================
//  AVANIA — Paramètres, curseur custom pixel art & sensibilité
// ============================================================

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
const CURSOR_SIZE = 32;

function drawCrosshair(ctx, s) {
  const c = s / 2;
  const t = Math.max(2, s / 8);
  // Croix avec contour sombre
  ctx.strokeStyle = '#000';
  ctx.lineWidth = t + 2;
  ctx.beginPath();
  ctx.moveTo(c, 4); ctx.lineTo(c, s - 4);
  ctx.moveTo(4, c); ctx.lineTo(s - 4, c);
  ctx.stroke();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = t;
  ctx.beginPath();
  ctx.moveTo(c, 4); ctx.lineTo(c, s - 4);
  ctx.moveTo(4, c); ctx.lineTo(s - 4, c);
  ctx.stroke();
  // Point central
  ctx.fillStyle = '#7ccf6a';
  ctx.fillRect(c - 1.5, c - 1.5, 3, 3);
}

function drawDot(ctx, s) {
  const c = s / 2;
  const r = s / 5;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(c, c, r + 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#7ccf6a';
  ctx.beginPath();
  ctx.arc(c, c, r * 0.45, 0, Math.PI * 2);
  ctx.fill();
}

function drawSword(ctx, s) {
  const c = s / 2;
  ctx.save();
  ctx.translate(c, c);
  ctx.rotate(-Math.PI / 4);
  // Lame
  ctx.fillStyle = '#000';
  ctx.fillRect(-2.5, -c + 3, 5, c - 3);
  ctx.fillStyle = '#c6ccd2';
  ctx.fillRect(-1.5, -c + 4, 3, c - 6);
  ctx.fillStyle = '#eef2f6';
  ctx.fillRect(-0.5, -c + 5, 1, c - 8);
  // Garde
  ctx.fillStyle = '#000';
  ctx.fillRect(-5, 1, 10, 4);
  ctx.fillStyle = '#f2c14e';
  ctx.fillRect(-4, 2, 8, 2);
  // Poignée
  ctx.fillStyle = '#6a3a1e';
  ctx.fillRect(-1.5, 5, 3, 5);
  ctx.restore();
}

function drawPickaxe(ctx, s) {
  const c = s / 2;
  ctx.save();
  ctx.translate(c, c);
  ctx.rotate(-Math.PI / 4);
  // Manche
  ctx.fillStyle = '#000';
  ctx.fillRect(-1.5, -2, 3, c);
  ctx.fillStyle = '#c89a5e';
  ctx.fillRect(-1, -1, 2, c - 2);
  // Tête
  ctx.fillStyle = '#000';
  ctx.fillRect(-8, -c + 3, 16, 5);
  ctx.fillStyle = '#a4a4ac';
  ctx.fillRect(-7, -c + 4, 14, 3);
  ctx.fillStyle = '#d8d8de';
  ctx.fillRect(-6, -c + 4, 12, 1);
  // Dents
  ctx.fillStyle = '#888890';
  ctx.fillRect(-7, -c + 7, 4, 3);
  ctx.fillRect(3, -c + 7, 4, 3);
  ctx.restore();
}

function drawHand(ctx, s) {
  const c = s / 2;
  ctx.save();
  ctx.translate(c, c);
  // Contour
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.moveTo(-3, -c + 4);
  ctx.lineTo(-3, -2);
  ctx.lineTo(-6, -2);
  ctx.lineTo(-6, 4);
  ctx.lineTo(-3, 4);
  ctx.lineTo(-3, 2);
  ctx.lineTo(3, 2);
  ctx.lineTo(3, 4);
  ctx.lineTo(6, 4);
  ctx.lineTo(6, -2);
  ctx.lineTo(3, -2);
  ctx.lineTo(3, -c + 4);
  ctx.closePath();
  ctx.fill();
  // Remplissage
  ctx.fillStyle = '#f7d7b5';
  ctx.beginPath();
  ctx.moveTo(-2, -c + 5);
  ctx.lineTo(-2, -1);
  ctx.lineTo(-5, -1);
  ctx.lineTo(-5, 3);
  ctx.lineTo(-2, 3);
  ctx.lineTo(-2, 3);
  ctx.lineTo(2, 3);
  ctx.lineTo(2, 3);
  ctx.lineTo(5, 3);
  ctx.lineTo(5, -1);
  ctx.lineTo(2, -1);
  ctx.lineTo(2, -c + 5);
  ctx.closePath();
  ctx.fill();
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
    this.sensitivity = saved.sensitivity ?? 100;
    this.cursorStyle = saved.cursorStyle ?? 'crosshair';
    this.cursorSize = saved.cursorSize ?? 24;
    this.zoom = saved.zoom ?? 2;
    this.vignette = saved.vignette ?? true;
    this.particles = saved.particles ?? true;

    this.cursorCanvas = document.getElementById('custom-cursor');
    this.cursorCtx = this.cursorCanvas?.getContext('2d');
    this.panel = document.getElementById('settings-panel');
    this.btn = document.getElementById('settings-btn');

    this._renderCursor();
    this._bindUI();
  }

  _save() {
    saveSettings({
      sensitivity: this.sensitivity,
      cursorStyle: this.cursorStyle,
      cursorSize: this.cursorSize,
      zoom: this.zoom,
      vignette: this.vignette,
      particles: this.particles,
    });
  }

  _renderCursor() {
    const c = this.cursorCanvas;
    if (!c) return;
    const ctx = this.cursorCtx;
    ctx.clearRect(0, 0, CURSOR_SIZE, CURSOR_SIZE);
    ctx.imageSmoothingEnabled = false;
    const drawer = CURSOR_DRAWERS[this.cursorStyle] || drawCrosshair;
    drawer(ctx, CURSOR_SIZE);
    // Appliquer comme curseur CSS via data URL
    const url = c.toDataURL('image/png');
    const hotspot = CURSOR_SIZE / 2;
    document.body.style.cursor = `url(${url}) ${hotspot} ${hotspot}, crosshair`;
  }

  _bindUI() {
    // Fermer
    document.getElementById('settings-close')?.addEventListener('click', () => this.close());
    this.panel?.querySelector('.panel-backdrop')?.addEventListener('click', () => this.close());

    // Sensibilité
    const sensRange = document.getElementById('sensitivity-range');
    const sensVal = document.getElementById('sensitivity-value');
    if (sensRange) {
      sensRange.value = this.sensitivity;
      sensVal.textContent = `${this.sensitivity}%`;
      sensRange.addEventListener('input', () => {
        this.sensitivity = Number(sensRange.value);
        sensVal.textContent = `${this.sensitivity}%`;
        this._save();
      });
    }

    // Style curseur
    const styleBtns = document.querySelectorAll('.cursor-style-btn');
    styleBtns.forEach(btn => {
      if (btn.dataset.cursor === this.cursorStyle) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
      btn.addEventListener('click', () => {
        styleBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.cursorStyle = btn.dataset.cursor;
        this._renderCursor();
        this._save();
      });
    });

    // Taille curseur
    const sizeRange = document.getElementById('cursor-size-range');
    const sizeVal = document.getElementById('cursor-size-value');
    if (sizeRange) {
      sizeRange.value = this.cursorSize;
      sizeVal.textContent = `${this.cursorSize}px`;
      sizeRange.addEventListener('input', () => {
        this.cursorSize = Number(sizeRange.value);
        sizeVal.textContent = `${this.cursorSize}px`;
        this._save();
      });
    }

    // Zoom
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

  open() {
    if (!this.panel) return;
    this.panel.classList.remove('hidden');
  }

  close() {
    if (!this.panel) return;
    this.panel.classList.add('hidden');
  }

  toggle() {
    if (this.panel?.classList.contains('hidden')) this.open();
    else this.close();
  }

  get isOpen() {
    return this.panel && !this.panel.classList.contains('hidden');
  }
}
