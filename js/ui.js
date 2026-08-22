// ============================================================
//  AVANIA — Interface : création de personnage + HUD + barre rapide
//  + fabrication
// ============================================================

import {
  SKIN_TONES, HAIR_STYLES, HAIR_COLORS, EYE_COLORS,
  SHIRT_COLORS, PANTS_COLORS, HATS, GLASSES, FACIAL_HAIR,
  DEFAULT_APPEARANCE, NAME_IDEAS,
} from './config.js';
import { ITEM_DEFS, RECIPES } from './blocks.js';
import { drawCharacter } from './character.js';
import { getItemIconURL } from './icons.js';
import { SMELT_RECIPES } from './furnace.js';
import { isLowPowerDevice, pick } from './utils.js';

const SAVE_KEY = 'avania.personnage';

function loadSaved() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveAppearance(data) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
}

// ------------------------------------------------------------
//  Écran de création de personnage
// ------------------------------------------------------------
export function openCharacterCreation() {
  return new Promise((resolve) => {
    const overlay = document.getElementById('customization');
    overlay.style.display = 'flex';

    const app = { ...DEFAULT_APPEARANCE };
    const saved = loadSaved();
    if (saved) Object.assign(app, saved);
    const lowPowerPreview = isLowPowerDevice();
    let facing = 'down';
    const nameInput = document.getElementById('char-name');
    const preview = document.getElementById('char-preview');
    const pctx = preview.getContext('2d', { alpha: false, desynchronized: true });
    pctx.imageSmoothingEnabled = false;
    nameInput.value = app.name || '';

    document.getElementById('name-random').onclick = () => {
      nameInput.value = pick(Math.random, NAME_IDEAS);
    };

    function renderPreview(time = 0) {
      const W = preview.width, H = preview.height;
      const cx = W / 2;
      pctx.clearRect(0, 0, W, H);

      // fond dégradé doux
      const bg = pctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#27452f');
      bg.addColorStop(1, '#15241a');
      pctx.fillStyle = bg;
      pctx.fillRect(0, 0, W, H);

      // halo lumineux derrière le perso
      const halo = pctx.createRadialGradient(cx, H / 2 - 10, 8, cx, H / 2 - 10, 90);
      halo.addColorStop(0, 'rgba(255,240,190,0.25)');
      halo.addColorStop(1, 'rgba(255,240,190,0)');
      pctx.fillStyle = halo;
      pctx.fillRect(0, 0, W, H);

      // plateforme (îlot d'herbe)
      const gy = H / 2 + 48;
      const plat = pctx.createRadialGradient(cx, gy, 6, cx, gy, 88);
      plat.addColorStop(0, '#8cc05e');
      plat.addColorStop(0.75, '#6b9c42');
      plat.addColorStop(1, '#4d7a2e');
      pctx.fillStyle = plat;
      pctx.beginPath();
      pctx.ellipse(cx, gy, 88, 28, 0, 0, Math.PI * 2);
      pctx.fill();
      pctx.strokeStyle = 'rgba(0,0,0,0.2)';
      pctx.lineWidth = 2;
      pctx.stroke();

      // respiration douce + clignement
      const breathe = Math.sin(time * 2.2) * 0.8;
      const blink = (time % 3.6) < 0.14;
      drawCharacter(pctx, app, cx, gy, {
        facing, walkPhase: breathe, scale: 3.2, blink,
      });
    }

    function setFacing(f) { facing = f; }

    const sections = [
      { id: 'skin',       title: 'Peau',            options: SKIN_TONES,   key: 'skin',       swatch: 'color' },
      { id: 'hairstyle',  title: 'Coiffure',        options: HAIR_STYLES,  key: 'hairStyle',  swatch: 'text' },
      { id: 'haircolor',  title: 'Couleur cheveux', options: HAIR_COLORS,  key: 'hairColor',  swatch: 'color' },
      { id: 'eyes',       title: 'Yeux',            options: EYE_COLORS,   key: 'eyes',       swatch: 'color' },
      { id: 'hat',        title: 'Chapeau',         options: HATS,         key: 'hat',        swatch: 'text' },
      { id: 'glasses',    title: 'Lunettes',        options: GLASSES,      key: 'glasses',    swatch: 'text' },
      { id: 'facial',     title: 'Barbe',           options: FACIAL_HAIR,  key: 'facialHair', swatch: 'text' },
      { id: 'shirt',      title: 'Haut',            options: SHIRT_COLORS, key: 'shirt',      swatch: 'color' },
      { id: 'pants',      title: 'Pantalon',        options: PANTS_COLORS, key: 'pants',      swatch: 'color' },
    ];

    const container = document.getElementById('char-sections');
    container.innerHTML = '';

    const buttonsBySection = {};
    for (const sec of sections) {
      const wrap = document.createElement('div');
      wrap.className = 'section';

      const label = document.createElement('div');
      label.className = 'section-title';
      label.textContent = sec.title;
      wrap.appendChild(label);

      const row = document.createElement('div');
      row.className = 'swatches';
      const btns = [];

      sec.options.forEach((opt) => {
        const btn = document.createElement('button');
        btn.className = 'swatch';
        btn.title = opt.label;
        if (sec.swatch === 'text') {
          btn.classList.add('swatch-text');
          if (sec.id === 'hairstyle') btn.classList.add('swatch-hair');
          btn.textContent = opt.label.slice(0, 2).toUpperCase();
          btn.setAttribute('aria-label', opt.label);
        } else {
          btn.style.background = opt.color;
        }
        btn.onclick = () => {
          app[sec.key] = opt.id;
          selectOnly(sec.id, btn);
        };
        row.appendChild(btn);
        btns.push(btn);
      });
      buttonsBySection[sec.id] = btns;

      wrap.appendChild(row);
      container.appendChild(wrap);
    }

    function selectOnly(sectionId, btn) {
      buttonsBySection[sectionId].forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    }

    function refreshSelection() {
      for (const sec of sections) {
        const idx = sec.options.findIndex((o) => o.id === app[sec.key]);
        if (idx >= 0) selectOnly(sec.id, buttonsBySection[sec.id][idx]);
      }
    }
    refreshSelection();

    // rotation automatique + respiration
    let autoRotate = true;
    const faces = ['down', 'left', 'up', 'right'];
    let faceIdx = 0;
    const rotTimer = setInterval(() => {
      if (autoRotate) { faceIdx = (faceIdx + 1) % 4; setFacing(faces[faceIdx]); }
    }, 1000);

    let raf = 0;
    let lastPreviewFrame = 0;
    const t0 = performance.now();
    function loop(now) {
      // 30 FPS sur petites configs suffit pour l'aperçu et laisse le CPU respirer.
      if (!lowPowerPreview || now - lastPreviewFrame >= 33) {
        renderPreview((now - t0) / 1000);
        lastPreviewFrame = now;
      }
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    document.querySelectorAll('[data-facing]').forEach((b) => {
      b.onclick = () => { autoRotate = false; setFacing(b.dataset.facing); };
    });

    // bouton surprise
    document.getElementById('char-random').onclick = () => {
      const r = Math.random;
      app.skin = pick(r, SKIN_TONES).id;
      app.hairStyle = pick(r, HAIR_STYLES).id;
      app.hairColor = pick(r, HAIR_COLORS).id;
      app.eyes = pick(r, EYE_COLORS).id;
      app.hat = pick(r, HATS).id;
      app.glasses = pick(r, GLASSES).id;
      app.facialHair = pick(r, FACIAL_HAIR).id;
      app.shirt = pick(r, SHIRT_COLORS).id;
      app.pants = pick(r, PANTS_COLORS).id;
      refreshSelection();
    };

    document.getElementById('char-start').onclick = () => {
      const name = nameInput.value.trim() || 'Aventurier';
      clearInterval(rotTimer);
      cancelAnimationFrame(raf);
      overlay.style.display = 'none';
      const finalApp = { ...app, name };
      saveAppearance(finalApp);
      resolve(finalApp);
    };

    renderPreview(0);
  });
}

// ------------------------------------------------------------
//  HUD (affiché en jeu)
// ------------------------------------------------------------
export class HUD {
  constructor(root) {
    this.el = root;
    this.nameEl = root.querySelector('#hud-name');
    this.playersEl = root.querySelector('#hud-players');
  }

  show() { this.el.classList.remove('hidden'); this.el.style.display = 'flex'; }
  hide() { this.el.classList.add('hidden'); this.el.style.display = 'none'; }

  update({ name, playerCount }) {
    this.nameEl.textContent = name;
    this.playersEl.textContent = playerCount;
  }
}

// ------------------------------------------------------------
//  Barre rapide (9 cases)
// ------------------------------------------------------------
// Applique l'icône PNG d'un objet (ou vide) sur un élément `.slot-icon`.
// L'identifiant de l'objet affiché est mémorisé sur l'élément : si rien
// n'a changé depuis le dernier appel, on ne touche pas au DOM (les mises
// à jour de compteur / durabilité vivent dans des éléments séparés).
// Avant, chaque ramassage recréait jusqu'à neuf <img> dans la barre
// rapide — un va-et-vient DOM inutile plusieurs fois par seconde.
function applyItemIcon(el, id) {
  if (!el) return;
  const wanted = id || null;
  if (el._itemIconId === wanted) return;
  el._itemIconId = wanted;

  const url = id ? getItemIconURL(id) : null;
  const def = id ? ITEM_DEFS[id] : null;
  el.textContent = '';
  el.style.backgroundImage = '';
  el.style.backgroundColor = '';
  if (def) el.style.backgroundColor = def.color || '#888';
  if (url) {
    const img = document.createElement('img');
    img.src = url;
    img.alt = def ? def.label : '';
    img.draggable = false;
    el.appendChild(img);
  }
}

function updateSlotVisual(el, stack, inventory = null, index = -1) {
  const icon = el.querySelector('.slot-icon');
  const count = el.querySelector('.slot-count');
  const durability = el.querySelector('.slot-durability');
  const def = stack && ITEM_DEFS[stack.id];
  el.classList.toggle('occupied', Boolean(stack));
  el.classList.toggle('tool-slot', Boolean(def?.type === 'tool'));

  if (!stack || !def) {
    applyItemIcon(icon, null);
    count.textContent = '';
    durability.style.width = '0%';
    el.setAttribute('aria-label', index >= 0 ? `Case ${index + 1} — vide` : 'Case vide');
    return;
  }

  applyItemIcon(icon, stack.id);
  count.textContent = def.type === 'tool' ? '' : (stack.count > 1 ? stack.count : '');
  if (def.type === 'tool') {
    const max = def.durability || 1;
    const current = Math.max(0, stack.durability ?? max);
    durability.style.width = `${Math.max(0, Math.min(100, current / max * 100))}%`;
    durability.style.background = current / max < 0.25 ? '#e65b4f' : '#7ccf6a';
    el.setAttribute('aria-label', `${def.label} — durabilité ${current}/${max}`);
  } else {
    durability.style.width = '0%';
    el.setAttribute('aria-label', `${def.label} — ${stack.count} en stock`);
  }
}
// ============================================================
//  AVANIA — Cases, barre rapide, inventaire & établi façon Minecraft
//
//  Toute la manipulation des objets passe par SlotManager (js/slots.js) :
//  clic gauche/droit, double-clic, shift-clic, glisser-répartir,
//  touches 1..9, pile flottante et infobulle.
// ============================================================

const CRAFT_BOOK_KEY = 'avania.craft.book';

function loadBookState() {
  try {
    const v = localStorage.getItem(CRAFT_BOOK_KEY);
    if (v === '1' || v === '0') return v === '1';
  } catch { /* ignore */ }
  return false;
}

function saveBookState(open) {
  try { localStorage.setItem(CRAFT_BOOK_KEY, open ? '1' : '0'); } catch { /* ignore */ }
}

function makeSlotElement(kind, index) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'slot';
  el.dataset.slot = index;
  el.innerHTML = '<span class="slot-icon"></span><span class="slot-count"></span><span class="slot-durability"></span>';
  return el;
}

// Bouton « résultat » : clic = fabriquer une fois, maintien = fabriquer en
// continu, shift-clic = fabriquer le maximum possible (comme Minecraft).
function bindOutputButton(btn, craftOnce, craftMax) {
  let timer = null;
  const stop = () => {
    if (timer) { clearInterval(timer); timer = null; }
  };
  btn.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    if (event.shiftKey) { craftMax(); return; }
    if (!craftOnce()) return;
    timer = setInterval(() => {
      if (!craftOnce()) stop();
    }, 120);
  });
  btn.addEventListener('pointerup', stop);
  btn.addEventListener('pointerleave', stop);
  btn.addEventListener('contextmenu', (event) => event.preventDefault());
}

// ------------------------------------------------------------
//  Barre rapide (9 cases, visible en jeu)
// ------------------------------------------------------------
export class Hotbar {
  constructor(root, inventory, slotManager = null) {
    this.root = root;
    this.inventory = null;
    this.slotManager = slotManager;
    this.slots = [];
    if (inventory) this.attach(inventory, slotManager);
  }

  attach(inventory, slotManager = null) {
    if (slotManager) this.slotManager = slotManager;
    this.inventory = inventory;
    this.build();
    inventory.subscribe(() => this.update());
  }

  build() {
    this.root.innerHTML = '';
    this.slots = [];
    for (let i = 0; i < this.inventory.hotbarSize; i++) {
      const index = this.inventory.hotbarStart + i;
      const el = makeSlotElement('hotbar', index);
      el.classList.add('hotbar-slot');
      el.dataset.key = i + 1;
      this.slotManager?.register(el, 'hotbar', index);
      this.root.appendChild(el);
      this.slots.push({ el, index });
    }
    this.update();
  }

  update() {
    this.slots.forEach(({ el, index }, i) => {
      updateSlotVisual(el, this.inventory.getSlot(index), this.inventory, i);
      el.classList.toggle('selected', this.inventory.selected === i);
    });
    // La pile flottante suit aussi les prises directes depuis la barre en jeu.
    this.slotManager?.updateCursor((icon, id) => applyItemIcon(icon, id));
  }
}

// ------------------------------------------------------------
//  Inventaire complet façon Minecraft (touche E) :
//  personnage + fabrication 2×2 à gauche, 27 cases + barre rapide.
// ------------------------------------------------------------
export class InventoryPanel {
  constructor(root, inventory, appearance, slotManager, onVisibilityChange = () => {}) {
    this.root = root;
    this.inventory = inventory;
    this.appearance = appearance || {};
    this.slotManager = slotManager;
    this.onVisibilityChange = onVisibilityChange;
    this.backdrop = root.querySelector('.panel-backdrop');
    this.gridRoot = document.getElementById('inventory-grid');
    this.hotbarRoot = document.getElementById('inventory-hotbar');
    this.craftRoot = document.getElementById('inventory-craft-grid');
    this.outputEl = document.getElementById('inventory-craft-output');
    this.outputIcon = document.getElementById('inventory-craft-output-icon');
    this.outputName = document.getElementById('inventory-craft-output-name');
    this.slots = [];
    this.hotbarSlots = [];
    this.craftSlots = [];
    this.build();
    this.initCharacterPreview();
    inventory.subscribe(() => this.update());
    this.backdrop.addEventListener('pointerdown', () => this.close());
  }

  build() {
    this.craftRoot.innerHTML = '';
    this.craftSlots = [];
    for (let i = 0; i < 4; i++) {
      const el = makeSlotElement('craft2', i);
      el.classList.add('craft-slot');
      this.slotManager.register(el, 'craft2', i);
      this.craftRoot.appendChild(el);
      this.craftSlots.push({ el, index: i });
    }
    bindOutputButton(
      this.outputEl,
      () => this.inventory.craftFromSmallGrid({ toCursor: true }),
      () => {
        const n = this.inventory.craftFromSmallGridMax({ toCursor: false });
        if (n > 0) this.toast(`${n} objet${n > 1 ? 's' : ''} fabriqué${n > 1 ? 's' : ''} !`);
      },
    );

    this.gridRoot.innerHTML = '';
    this.hotbarRoot.innerHTML = '';
    this.slots = [];
    this.hotbarSlots = [];
    for (let index = 0; index < this.inventory.hotbarStart; index++) {
      const el = makeSlotElement('inv', index);
      this.slotManager.register(el, 'inv', index);
      this.gridRoot.appendChild(el);
      this.slots.push({ el, index });
    }
    for (let i = 0; i < this.inventory.hotbarSize; i++) {
      const index = this.inventory.hotbarStart + i;
      const el = makeSlotElement('inv', index);
      this.slotManager.register(el, 'inv', index);
      this.hotbarRoot.appendChild(el);
      this.hotbarSlots.push({ el, index });
    }
    this.update();
  }

  initCharacterPreview() {
    this.charCanvas = document.getElementById('inventory-char');
    const nameEl = document.getElementById('inventory-char-name');
    if (nameEl) nameEl.textContent = this.appearance.name || '';
    this.charActive = false;
    this.charRaf = 0;
  }

  renderCharacter(time = 0) {
    const canvas = this.charCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const gy = H - 26;
    ctx.fillStyle = '#12181c';
    ctx.fillRect(0, 0, W, H);
    const halo = ctx.createRadialGradient(cx, gy - 40, 6, cx, gy - 40, 72);
    halo.addColorStop(0, 'rgba(255,240,190,0.16)');
    halo.addColorStop(1, 'rgba(255,240,190,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, H);
    const plat = ctx.createRadialGradient(cx, gy, 4, cx, gy, 64);
    plat.addColorStop(0, '#8cc05e');
    plat.addColorStop(0.75, '#6b9c42');
    plat.addColorStop(1, '#4d7a2e');
    ctx.fillStyle = plat;
    ctx.beginPath();
    ctx.ellipse(cx, gy, 64, 21, 0, 0, Math.PI * 2);
    ctx.fill();
    const breathe = Math.sin(time * 2.2) * 0.8;
    const blink = (time % 3.6) < 0.14;
    drawCharacter(ctx, this.appearance, cx, gy, {
      facing: 'down', walkPhase: breathe, scale: 2.7, blink,
    });
  }

  startCharacterLoop() {
    if (this.charActive) return;
    this.charActive = true;
    const t0 = performance.now();
    const loop = (now) => {
      if (!this.charActive) return;
      this.renderCharacter((now - t0) / 1000);
      this.charRaf = requestAnimationFrame(loop);
    };
    this.charRaf = requestAnimationFrame(loop);
  }

  stopCharacterLoop() {
    this.charActive = false;
    if (this.charRaf) cancelAnimationFrame(this.charRaf);
    this.charRaf = 0;
  }

  toast(message) {
    const el = document.getElementById('game-toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('visible');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('visible'), 1700);
  }

  update() {
    if (this.root.classList.contains('hidden')) return;
    this.craftSlots.forEach(({ el, index }) => {
      updateSlotVisual(el, this.inventory.craftingGridSmall[index]);
    });
    this.slots.forEach(({ el, index }) => {
      updateSlotVisual(el, this.inventory.getSlot(index), this.inventory, index);
    });
    this.hotbarSlots.forEach(({ el, index }, i) => {
      updateSlotVisual(el, this.inventory.getSlot(index), this.inventory, index);
      el.classList.toggle('selected', this.inventory.selected === i);
    });

    const recipe = this.inventory.getMatchingRecipeSmall();
    const out = recipe && ITEM_DEFS[recipe.out];
    this.outputEl.classList.toggle('ready', Boolean(out));
    this.outputEl.disabled = !out;
    if (out) {
      applyItemIcon(this.outputIcon, out.id);
      this.outputName.textContent = `${out.label} ×${recipe.outN}`;
      this.outputEl.title = `${out.label} ×${recipe.outN}`;
    } else {
      applyItemIcon(this.outputIcon, null);
      this.outputName.textContent = 'Résultat';
      this.outputEl.title = '';
    }
    this.slotManager.updateCursor((icon, id) => applyItemIcon(icon, id));
  }

  open() {
    if (!this.root.classList.contains('hidden')) return;
    this.root.classList.remove('hidden');
    this.startCharacterLoop();
    this.update();
    this.onVisibilityChange(true);
  }

  close() {
    if (this.root.classList.contains('hidden')) return;
    this.inventory.returnCraftingGrid();
    this.root.classList.add('hidden');
    this.stopCharacterLoop();
    this.slotManager.updateCursor((icon, id) => applyItemIcon(icon, id));
    this.onVisibilityChange(false);
  }

  toggle() {
    if (this.root.classList.contains('hidden')) this.open();
    else this.close();
  }

  get isOpen() {
    return !this.root.classList.contains('hidden');
  }
}

// ------------------------------------------------------------
//  Four (clic droit sur un four posé) :
//  entrée + combustible + sortie, flamme & flèche de progression,
//  inventaire du joueur en bas — comme l'interface du four Minecraft.
// ------------------------------------------------------------
export class FurnacePanel {
  constructor(root, inventory, slotManager, game, onVisibilityChange = () => {}) {
    this.root = root;
    this.inventory = inventory;
    this.slotManager = slotManager;
    this.game = game;
    this.onVisibilityChange = onVisibilityChange;
    this.backdrop = root.querySelector('.panel-backdrop');
    this.inputRoot = document.getElementById('furnace-input');
    this.fuelRoot = document.getElementById('furnace-fuel');
    this.outputRoot = document.getElementById('furnace-output');
    this.flameFill = document.getElementById('furnace-flame-fill');
    this.arrowFill = document.getElementById('furnace-arrow-fill');
    this.statusEl = document.getElementById('furnace-status');
    this.invGridRoot = document.getElementById('furnace-inv-grid');
    this.invHotbarRoot = document.getElementById('furnace-inv-hotbar');
    this.key = null;
    this.entry = null;
    this.timer = null;
    this.invSlots = [];
    this.invHotbarSlots = [];
    this.build();
    this.backdrop.addEventListener('pointerdown', () => this.close());
  }

  build() {
    // Les trois cases du four : entrée (haut), combustible (bas), sortie.
    const inputEl = makeSlotElement('furnaceIn', 0);
    inputEl.classList.add('craft-slot', 'furnace-slot');
    this.slotManager.register(inputEl, 'furnaceIn', 0);
    this.inputRoot.appendChild(inputEl);

    const fuelEl = makeSlotElement('furnaceFuel', 0);
    fuelEl.classList.add('craft-slot', 'furnace-slot');
    this.slotManager.register(fuelEl, 'furnaceFuel', 0);
    this.fuelRoot.appendChild(fuelEl);

    const outputEl = makeSlotElement('furnaceOut', 0);
    outputEl.classList.add('craft-slot', 'furnace-slot', 'furnace-output-slot');
    this.slotManager.register(outputEl, 'furnaceOut', 0);
    this.outputRoot.appendChild(outputEl);

    this.invGridRoot.innerHTML = '';
    this.invHotbarRoot.innerHTML = '';
    this.invSlots = [];
    this.invHotbarSlots = [];
    for (let index = 0; index < this.inventory.hotbarStart; index++) {
      const el = makeSlotElement('inv', index);
      this.slotManager.register(el, 'inv', index);
      this.invGridRoot.appendChild(el);
      this.invSlots.push({ el, index });
    }
    for (let i = 0; i < this.inventory.hotbarSize; i++) {
      const index = this.inventory.hotbarStart + i;
      const el = makeSlotElement('inv', index);
      this.slotManager.register(el, 'inv', index);
      this.invHotbarRoot.appendChild(el);
      this.invHotbarSlots.push({ el, index });
    }
  }

  update() {
    if (this.root.classList.contains('hidden') || !this.entry) return;
    const e = this.entry;
    updateSlotVisual(this.inputRoot.querySelector('.mc-slot') || this.inputRoot.firstElementChild, e.input[0]);
    updateSlotVisual(this.fuelRoot.querySelector('.mc-slot') || this.fuelRoot.firstElementChild, e.fuel[0]);
    updateSlotVisual(this.outputRoot.querySelector('.mc-slot') || this.outputRoot.firstElementChild, e.output[0]);

    // Flamme : feu restant / durée totale du combustible.
    if (this.flameFill) {
      const ratio = e.maxFuelTime > 0 ? Math.max(0, Math.min(1, e.fuelTime / e.maxFuelTime)) : 0;
      this.flameFill.style.height = `${ratio * 100}%`;
    }
    // Flèche : progression de la cuisson.
    if (this.arrowFill) {
      const recipe = e.input[0] && SMELT_RECIPES[e.input[0].id];
      const ratio = recipe ? Math.max(0, Math.min(1, e.progress / recipe.time)) : 0;
      this.arrowFill.style.width = `${ratio * 100}%`;
    }
    if (this.statusEl) {
      const recipe = e.input[0] && SMELT_RECIPES[e.input[0].id];
      if (!e.input[0]) this.statusEl.textContent = 'Mets un objet à fondre.';
      else if (!recipe) this.statusEl.textContent = 'Impossible à fondre.';
      else if (!e.fuel[0] && e.fuelTime <= 0) this.statusEl.textContent = 'Ajoute du combustible.';
      else if (e.output[0] && e.output[0].id !== recipe.out) this.statusEl.textContent = 'Vide la sortie.';
      else this.statusEl.textContent = 'Cuisson…';
    }

    this.invSlots.forEach(({ el, index }) => {
      updateSlotVisual(el, this.inventory.getSlot(index), this.inventory, index);
    });
    this.invHotbarSlots.forEach(({ el, index }, i) => {
      updateSlotVisual(el, this.inventory.getSlot(index), this.inventory, index);
      el.classList.toggle('selected', this.inventory.selected === i);
    });
    this.slotManager.updateCursor((icon, id) => applyItemIcon(icon, id));
  }

  open(tx, ty) {
    if (!this.root.classList.contains('hidden')) return;
    this.key = `${tx},${ty}`;
    this.entry = this.game.getFurnaceEntry(tx, ty);
    this.slotManager.furnaceArrays = {
      input: this.entry.input,
      fuel: this.entry.fuel,
      output: this.entry.output,
    };
    this.root.classList.remove('hidden');
    this.update();
    this.timer = setInterval(() => this.update(), 100);
    this.onVisibilityChange(true);
  }

  close() {
    if (this.root.classList.contains('hidden')) return;
    this.root.classList.add('hidden');
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.slotManager.furnaceArrays = null;
    this.slotManager.updateCursor((icon, id) => applyItemIcon(icon, id));
    this.onVisibilityChange(false);
  }

  toggle(tx, ty) {
    if (this.root.classList.contains('hidden')) this.open(tx, ty);
    else this.close();
  }

  get isOpen() {
    return !this.root.classList.contains('hidden');
  }
}

// ------------------------------------------------------------
//  Établi façon Minecraft (touche C) :
//  grille 3×3 + résultat, livre de recettes repliable, inventaire en bas.
// ------------------------------------------------------------
export class Crafting {
  constructor(root, inventory, slotManager, onVisibilityChange = () => {}) {
    this.root = root;
    this.inventory = inventory;
    this.slotManager = slotManager;
    this.onVisibilityChange = onVisibilityChange;
    this.backdrop = root.querySelector('.panel-backdrop');
    this.listRoot = document.getElementById('craft-list');
    this.gridRoot = document.getElementById('craft-grid');
    this.outputEl = document.getElementById('craft-output');
    this.outputIcon = document.getElementById('craft-output-icon');
    this.outputName = document.getElementById('craft-output-name');
    this.statusEl = document.getElementById('craft-status');
    this.recipeCountEl = document.getElementById('craft-recipe-count');
    this.bookToggle = document.getElementById('craft-book-toggle');
    this.paneBook = document.getElementById('craft-pane-book');
    this.searchInput = document.getElementById('craft-search');
    this.invGridRoot = document.getElementById('craft-inv-grid');
    this.invHotbarRoot = document.getElementById('craft-inv-hotbar');
    this.gridSlots = [];
    this.invSlots = [];
    this.invHotbarSlots = [];
    this.cards = [];
    this.search = '';
    this.build();
    inventory.subscribe(() => this.update());
    this.backdrop.addEventListener('pointerdown', () => this.close());
    this.bookToggle.onclick = () => this.toggleBook();
    this.searchInput?.addEventListener('input', () => {
      this.search = this.searchInput.value.toLowerCase();
      this.applySearch();
    });
    // L'établi ouvert autorise le shift-clic « vers la grille ».
    slotManager.canFillCraftGrid = () => this.isOpen;
  }

  build() {
    this.gridRoot.innerHTML = '';
    this.gridSlots = [];
    for (let i = 0; i < 9; i++) {
      const el = makeSlotElement('craft', i);
      el.classList.add('craft-slot');
      this.slotManager.register(el, 'craft', i);
      this.gridRoot.appendChild(el);
      this.gridSlots.push({ el, index: i });
    }
    bindOutputButton(
      this.outputEl,
      () => this.inventory.craftFromGrid({ toCursor: true }),
      () => {
        const n = this.inventory.craftFromGridMax({ toCursor: false });
        if (n > 0) this.setStatus(`${n} objet${n > 1 ? 's' : ''} fabriqué${n > 1 ? 's' : ''} !`, 'success');
      },
    );

    this.invGridRoot.innerHTML = '';
    this.invHotbarRoot.innerHTML = '';
    this.invSlots = [];
    this.invHotbarSlots = [];
    for (let index = 0; index < this.inventory.hotbarStart; index++) {
      const el = makeSlotElement('inv', index);
      this.slotManager.register(el, 'inv', index);
      this.invGridRoot.appendChild(el);
      this.invSlots.push({ el, index });
    }
    for (let i = 0; i < this.inventory.hotbarSize; i++) {
      const index = this.inventory.hotbarStart + i;
      const el = makeSlotElement('inv', index);
      this.slotManager.register(el, 'inv', index);
      this.invHotbarRoot.appendChild(el);
      this.invHotbarSlots.push({ el, index });
    }

    this.buildRecipeList();
  }

  buildRecipeList() {
    this.listRoot.innerHTML = '';
    this.cards = [];
    let category = '';
    for (const recipe of RECIPES) {
      if (recipe.category !== category) {
        category = recipe.category;
        const heading = document.createElement('div');
        heading.className = 'recipe-category';
        heading.textContent = category.charAt(0).toUpperCase() + category.slice(1);
        this.listRoot.appendChild(heading);
      }
      this.listRoot.appendChild(this.buildRecipeCard(recipe));
    }
    this.applySearch();
  }

  buildRecipeCard(recipe) {
    const out = ITEM_DEFS[recipe.out];
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'recipe';

    const icon = document.createElement('span');
    icon.className = 'recipe-icon';
    applyItemIcon(icon, out.id);

    const text = document.createElement('span');
    text.className = 'recipe-text';
    const name = document.createElement('b');
    name.textContent = `${out.label} ×${recipe.outN}`;
    const cost = document.createElement('span');
    cost.className = 'recipe-cost';
    cost.textContent = Object.entries(recipe.inputs)
      .map(([id, n]) => `${n} ${ITEM_DEFS[id].label.toLowerCase()}`)
      .join(' + ');
    text.append(name, cost);

    const state = document.createElement('span');
    state.className = 'recipe-state';

    card.append(icon, text, state);
    card.onclick = () => this.prepareFromBook(recipe);
    this.cards.push({ recipe, card, stateEl: state });
    return card;
  }

  prepareFromBook(recipe) {
    if (this.inventory.prepareRecipe(recipe)) {
      this.setStatus('Ingrédients placés.', 'success');
    } else {
      const missing = Object.entries(recipe.inputs)
        .filter(([id, n]) => this.inventory.count(id) < n)
        .map(([id, n]) => `${ITEM_DEFS[id].label} ×${n - this.inventory.count(id)}`)
        .join(', ');
      this.setStatus(missing
        ? `Il manque : ${missing}.`
        : 'Vide la grille d\'abord.', 'error');
    }
  }

  applySearch() {
    const q = this.search;
    for (const { recipe, card } of this.cards) {
      const label = ITEM_DEFS[recipe.out].label.toLowerCase();
      const id = recipe.id.toLowerCase();
      card.classList.toggle('search-hidden', Boolean(q) && !label.includes(q) && !id.includes(q));
    }
  }

  setStatus(message, kind = '') {
    if (!this.statusEl) return;
    this.statusEl.textContent = message;
    this.statusEl.className = `craft-status ${kind}`;
  }

  update() {
    if (this.root.classList.contains('hidden')) return;
    this.gridSlots.forEach(({ el, index }) => {
      updateSlotVisual(el, this.inventory.craftingGrid[index]);
    });
    this.invSlots.forEach(({ el, index }) => {
      updateSlotVisual(el, this.inventory.getSlot(index), this.inventory, index);
    });
    this.invHotbarSlots.forEach(({ el, index }, i) => {
      updateSlotVisual(el, this.inventory.getSlot(index), this.inventory, index);
      el.classList.toggle('selected', this.inventory.selected === i);
    });

    const recipe = this.inventory.getMatchingRecipe();
    const out = recipe && ITEM_DEFS[recipe.out];
    this.outputEl.classList.toggle('ready', Boolean(out));
    this.outputEl.disabled = !out;
    if (out) {
      applyItemIcon(this.outputIcon, out.id);
      this.outputName.textContent = `${out.label} ×${recipe.outN}`;
      this.outputEl.title = `${out.label} ×${recipe.outN}`;
    } else {
      applyItemIcon(this.outputIcon, null);
      this.outputName.textContent = 'Résultat';
      this.outputEl.title = '';
    }

    for (const { recipe: cardRecipe, card, stateEl } of this.cards) {
      const available = this.inventory.canCraft(cardRecipe);
      card.classList.toggle('recipe-locked', !available);
      stateEl.textContent = available ? '✓' : '🔒';
      card.title = available
        ? ''
        : `Il manque : ${Object.entries(cardRecipe.inputs)
          .filter(([id, n]) => this.inventory.count(id) < n)
          .map(([id, n]) => `${ITEM_DEFS[id].label} ×${n - this.inventory.count(id)}`)
          .join(', ') || 'ingrédients'}`;
    }
    if (this.recipeCountEl) this.recipeCountEl.textContent = `${this.cards.length}`;
    this.slotManager.updateCursor((icon, id) => applyItemIcon(icon, id));
  }

  setBookOpen(open) {
    this.paneBook.classList.toggle('hidden', !open);
    this.bookToggle.classList.toggle('active', open);
    this.root.classList.toggle('book-open', open);
  }

  toggleBook() {
    const open = this.paneBook.classList.contains('hidden');
    this.setBookOpen(open);
    saveBookState(open);
  }

  open() {
    if (!this.root.classList.contains('hidden')) return;
    this.root.classList.remove('hidden');
    this.setBookOpen(loadBookState());
    this.update();
    this.onVisibilityChange(true);
  }

  close() {
    if (this.root.classList.contains('hidden')) return;
    this.inventory.returnCraftingGrid();
    this.root.classList.add('hidden');
    this.slotManager.updateCursor((icon, id) => applyItemIcon(icon, id));
    this.onVisibilityChange(false);
  }

  toggle() {
    if (this.root.classList.contains('hidden')) this.open();
    else this.close();
  }

  get isOpen() {
    return !this.root.classList.contains('hidden');
  }
}
