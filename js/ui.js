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
import { formatMoney } from './economy.js';
import { drawCharacter } from './character.js';
import { getItemIconURL } from './icons.js';
import { SMELT_RECIPES } from './furnace.js';
import { isLowPowerDevice, pick } from './utils.js';
import { icon } from './svgicons.js';

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
//  Bourse + état de la grotte (haut droite)
//
//  Comme pour le reste du HUD, on n'écrit dans le DOM que lorsque la
//  valeur a vraiment changé : sinon chaque frame déclencherait un
//  recalcul de style pour rien.
// ------------------------------------------------------------
export class WalletHUD {
  constructor(root, wallet) {
    this.root = root;
    this.el = {
      amount: root.querySelector('#wallet-amount'),
      delta: root.querySelector('#wallet-delta'),
      wallet: root.querySelector('#wallet'),
      depthChip: root.querySelector('#depth-chip'),
      depthLabel: root.querySelector('#depth-label'),
      gearChip: root.querySelector('#gear-chip'),
      gearDepth: root.querySelector('#gear-depth'),
      slots: root.querySelectorAll('#gear-chip .gear-slot'),
    };
    this.lastAmount = null;
    this.lastDepth = null;
    this.lastGear = null;
    this._bumpTimer = null;
    this._deltaTimer = null;

    if (wallet) {
      wallet.subscribe((w, delta) => this.setMoney(w.money, delta));
      this.setMoney(wallet.money, 0);
    }
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }

  setMoney(amount, delta = 0) {
    const value = Math.round(amount || 0);
    if (value !== this.lastAmount) {
      this.lastAmount = value;
      if (this.el.amount) {
        this.el.amount.textContent = formatMoney(value);
        // Petit « bump » à chaque changement : le joueur voit sa bourse vivre.
        this.el.amount.classList.remove('bump');
        void this.el.amount.offsetWidth;
        this.el.amount.classList.add('bump');
        clearTimeout(this._bumpTimer);
        this._bumpTimer = setTimeout(() => this.el.amount.classList.remove('bump'), 180);
      }
    }
    if (delta && this.el.delta) {
      const gain = delta > 0;
      this.el.delta.textContent = `${gain ? '+' : '−'}${formatMoney(Math.abs(delta))}`;
      this.el.delta.className = `wallet-delta ${gain ? 'gain' : 'loss'}`;
      void this.el.delta.offsetWidth;
      this.el.delta.classList.add('show');
      clearTimeout(this._deltaTimer);
      this._deltaTimer = setTimeout(() => this.el.delta.classList.remove('show'), 1500);
    }
  }

  // Surface ou profondeur de grotte.
  setDepth(world) {
    const underground = Boolean(world && world.kind === 'cave');
    const depth = underground ? (world.depth || 1) : 0;
    if (depth === this.lastDepth) return;
    this.lastDepth = depth;
    if (this.el.depthLabel) {
      this.el.depthLabel.textContent = underground ? `Profondeur ${depth}` : 'Surface';
    }
    if (this.el.depthChip) this.el.depthChip.classList.toggle('underground', underground);
    if (this.el.gearChip) this.el.gearChip.classList.toggle('hidden', !underground);
  }

  // Équipement porté : les deux emplacements s'allument quand ils sont couverts.
  setGear(gear) {
    const key = `${gear.mask || '-'}|${gear.armor || '-'}|${gear.maxDepth || 1}`;
    if (key === this.lastGear) return;
    this.lastGear = key;
    if (this.el.slots[0]) this.el.slots[0].classList.toggle('equipped', Boolean(gear.mask));
    if (this.el.slots[1]) this.el.slots[1].classList.toggle('equipped', Boolean(gear.armor));
    if (this.el.gearDepth) {
      this.el.gearDepth.textContent = `prof. ${gear.maxDepth || 1}`;
    }
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
    this.capacityEl = document.getElementById('inventory-capacity');
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
      () => {
        const result = this.inventory.craftFromSmallGrid({ toCursor: true });
        if (result) {
          this.outputEl.classList.add('just-crafted');
          setTimeout(() => this.outputEl.classList.remove('just-crafted'), 300);
        }
        return result;
      },
      () => {
        const n = this.inventory.craftFromSmallGridMax({ toCursor: false });
        if (n > 0) {
          this.toast(`${n} objet${n > 1 ? 's' : ''} fabriqué${n > 1 ? 's' : ''} !`, 'success');
          this.outputEl.classList.add('just-crafted');
          setTimeout(() => this.outputEl.classList.remove('just-crafted'), 300);
        }
      },
    );

    // Bouton de tri
    const sortBtn = document.getElementById('inventory-sort');
    if (sortBtn) {
      sortBtn.onclick = () => {
        this.inventory.sortInventory();
        this.toast('Inventaire trié !');
      };
    }

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

  toast(message, type = '') {
    const el = document.getElementById('game-toast');
    if (!el) return;
    el.textContent = message;
    el.className = 'game-toast visible' + (type ? ` ${type}` : '');
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

    // Mettre à jour le compteur de capacité
    if (this.capacityEl) {
      const used = this.inventory.usedSlots;
      const total = this.inventory.slotCount;
      this.capacityEl.textContent = `${used}/${total} cases utilisées`;
    }

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
    this.fuelTimerEl = document.getElementById('furnace-fuel-timer');
    this.flameWrap = root.querySelector('.furnace-flame');
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
    const burning = e.fuelTime > 0;
    if (this.flameFill) {
      const ratio = e.maxFuelTime > 0 ? Math.max(0, Math.min(1, e.fuelTime / e.maxFuelTime)) : 0;
      this.flameFill.style.height = `${ratio * 100}%`;
    }
    // Classe « actif » sur la flamme pour l'animation CSS.
    if (this.flameWrap) {
      this.flameWrap.classList.toggle('burning', burning);
    }
    // Timer : secondes restantes de combustible.
    if (this.fuelTimerEl) {
      if (burning) {
        this.fuelTimerEl.textContent = `${Math.ceil(e.fuelTime)}s`;
        this.fuelTimerEl.classList.remove('empty');
      } else {
        this.fuelTimerEl.textContent = '';
        this.fuelTimerEl.classList.add('empty');
      }
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
      else if (!recipe) this.statusEl.textContent = 'Cet objet ne peut pas être fondu.';
      else if (!e.fuel[0] && e.fuelTime <= 0) this.statusEl.textContent = 'Ajoute du combustible.';
      else if (e.output[0] && e.output[0].count >= 64) this.statusEl.textContent = 'Sortie pleine !';
      else if (e.output[0] && e.output[0].id !== recipe.out) this.statusEl.textContent = 'Vide la sortie.';
      else if (burning) this.statusEl.textContent = 'Cuisson en cours…';
      else this.statusEl.textContent = 'En attente de combustible…';
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
//  Coffre (clic droit sur un coffre posé) : 27 cases de rangement
//  + inventaire du joueur en bas — comme l'interface du coffre Minecraft.
// ------------------------------------------------------------
export class ChestPanel {
  constructor(root, inventory, slotManager, game, onVisibilityChange = () => {}) {
    this.root = root;
    this.inventory = inventory;
    this.slotManager = slotManager;
    this.game = game;
    this.onVisibilityChange = onVisibilityChange;
    this.backdrop = root.querySelector('.panel-backdrop');
    this.gridRoot = document.getElementById('chest-grid');
    this.invGridRoot = document.getElementById('chest-inv-grid');
    this.invHotbarRoot = document.getElementById('chest-inv-hotbar');
    this.key = null;
    this.tx = null;
    this.ty = null;
    this.entry = null;
    this.timer = null;
    this.chestSlotEls = [];
    this.invSlots = [];
    this.invHotbarSlots = [];
    this.build();
    this.backdrop.addEventListener('pointerdown', () => this.close());
  }

  build() {
    // Les 27 cases du coffre (3 rangées × 9, comme dans Minecraft).
    this.gridRoot.innerHTML = '';
    this.chestSlotEls = [];
    for (let index = 0; index < 27; index++) {
      const el = makeSlotElement('chest', index);
      el.classList.add('craft-slot');
      this.slotManager.register(el, 'chest', index);
      this.gridRoot.appendChild(el);
      this.chestSlotEls.push({ el, index });
    }

    // Inventaire du joueur (27 cases + barre rapide).
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
    const slots = this.entry.slots;
    this.chestSlotEls.forEach(({ el, index }) => {
      updateSlotVisual(el, slots[index], this.inventory, index);
    });
    this.invSlots.forEach(({ el, index }) => {
      updateSlotVisual(el, this.inventory.getSlot(index), this.inventory, index);
    });
    this.invHotbarSlots.forEach(({ el, index }, i) => {
      updateSlotVisual(el, this.inventory.getSlot(index), this.inventory, index);
      el.classList.toggle('selected', this.inventory.selected === i);
    });
    this.slotManager.updateCursor((icon, id) => applyItemIcon(icon, id));
    // Multijoueur (étape 3) : le coffre est partagé, donc on diffuse dès
    // qu'on détecte que SON contenu a changé depuis le dernier passage
    // (par nous, ou par un autre joueur qui a le même coffre ouvert —
    // dans ce cas on ne fait que rediffuser ce qu'on vient de recevoir,
    // ce qui est sans conséquence : le serveur ne fait que remplacer sa
    // copie par une copie identique). Comparaison JSON simple : un
    // coffre entier tient dans quelques centaines d'octets, et ce
    // contrôle ne tourne que pendant qu'un coffre est ouvert (150 ms).
    const sig = JSON.stringify(slots);
    if (sig !== this._lastSentSig) {
      this._lastSentSig = sig;
      if (this.game.uiCallbacks.onChestChange) {
        this.game.uiCallbacks.onChestChange(this.tx, this.ty, slots);
      }
    }
  }

  open(tx, ty) {
    if (!this.root.classList.contains('hidden')) return;
    this.key = `${tx},${ty}`;
    this.tx = tx;
    this.ty = ty;
    this.entry = this.game.getChestEntry(tx, ty);
    this.slotManager.chestSlots = this.entry.slots;
    this._lastSentSig = JSON.stringify(this.entry.slots); // état déjà connu du serveur : pas de renvoi inutile à l'ouverture
    this.root.classList.remove('hidden');
    this.update();
    // Rafraîchissement léger : le contenu change uniquement quand le
    // joueur manipule les cases (le timer couvre aussi l'inventaire).
    this.timer = setInterval(() => this.update(), 150);
    this.onVisibilityChange(true);
  }

  close() {
    if (this.root.classList.contains('hidden')) return;
    // Le couvercle se referme dans le monde (animation dans updateChests).
    if (this.game && this.tx != null) this.game.setChestOpen(this.tx, this.ty, false);
    // Fermer en tenant une pile (Échap, fond…) : la pile revient dans
    // l'inventaire, comme dans Minecraft — rien ne se perd.
    this.inventory.returnCursor();
    this.root.classList.add('hidden');
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.slotManager.chestSlots = null;
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
      () => {
        const result = this.inventory.craftFromGrid({ toCursor: true });
        if (result) {
          this.outputEl.classList.add('just-crafted');
          setTimeout(() => this.outputEl.classList.remove('just-crafted'), 300);
        }
        return result;
      },
      () => {
        const n = this.inventory.craftFromGridMax({ toCursor: false });
        if (n > 0) {
          this.setStatus(`${n} objet${n > 1 ? 's' : ''} fabriqué${n > 1 ? 's' : ''} !`, 'success');
          this.outputEl.classList.add('just-crafted');
          setTimeout(() => this.outputEl.classList.remove('just-crafted'), 300);
        }
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

    // Créer les onglets de catégorie
    const categories = [...new Set(RECIPES.map(r => r.category))];
    const tabsContainer = document.createElement('div');
    tabsContainer.className = 'recipe-tabs';
    
    const allTab = document.createElement('button');
    allTab.className = 'recipe-tab active';
    allTab.textContent = 'Tout';
    allTab.onclick = () => this.filterByCategory(null, allTab);
    tabsContainer.appendChild(allTab);

    for (const cat of categories) {
      const tab = document.createElement('button');
      tab.className = 'recipe-tab';
      tab.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
      tab.onclick = () => this.filterByCategory(cat, tab);
      tabsContainer.appendChild(tab);
    }
    this.listRoot.appendChild(tabsContainer);

    // Créer les cartes de recettes
    for (const recipe of RECIPES) {
      if (recipe.category !== category) {
        category = recipe.category;
        const heading = document.createElement('div');
        heading.className = 'recipe-category';
        heading.dataset.category = category;
        heading.textContent = category.charAt(0).toUpperCase() + category.slice(1);
        this.listRoot.appendChild(heading);
      }
      this.listRoot.appendChild(this.buildRecipeCard(recipe));
    }
    this.applySearch();
  }

  filterByCategory(category, activeTab) {
    // Mettre à jour les onglets actifs
    this.listRoot.querySelectorAll('.recipe-tab').forEach(tab => tab.classList.remove('active'));
    activeTab.classList.add('active');

    // Filtrer les recettes
    this.listRoot.querySelectorAll('.recipe-category').forEach(heading => {
      heading.style.display = (!category || heading.dataset.category === category) ? '' : 'none';
    });
    this.cards.forEach(({ recipe, card }) => {
      const show = !category || recipe.category === category;
      card.style.display = show ? '' : 'none';
    });
  }

  buildRecipeCard(recipe) {
    const out = ITEM_DEFS[recipe.out];
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'recipe';
    card.dataset.recipeId = recipe.id;

    const icon = document.createElement('span');
    icon.className = 'recipe-icon';
    applyItemIcon(icon, out.id);

    const text = document.createElement('span');
    text.className = 'recipe-text';
    const name = document.createElement('b');
    name.textContent = `${out.label} ×${recipe.outN}`;
    const cost = document.createElement('span');
    cost.className = 'recipe-cost';
    
    // Afficher les compteurs possédé/requis pour chaque ingrédient
    const costParts = Object.entries(recipe.inputs).map(([id, n]) => {
      const have = this.inventory.count(id);
      const label = ITEM_DEFS[id].label.toLowerCase();
      const span = document.createElement('span');
      span.className = 'recipe-ingredient';
      span.innerHTML = `<span class="recipe-have ${have >= n ? 'enough' : ''}">${have}</span>/<span class="recipe-need">${n}</span> ${label}`;
      return span;
    });
    cost.append(...costParts);
    text.append(name, cost);

    const state = document.createElement('span');
    state.className = 'recipe-state';

    // Barre de progression (combien d'ingrédients on possède)
    const totalNeeded = Object.values(recipe.inputs).reduce((a, b) => a + b, 0);
    const totalHave = Object.entries(recipe.inputs)
      .reduce((sum, [id, n]) => sum + Math.min(this.inventory.count(id), n), 0);
    const progressWrap = document.createElement('div');
    progressWrap.className = 'recipe-progress';
    const progressBar = document.createElement('div');
    progressBar.className = 'recipe-progress-bar';
    const progressFill = document.createElement('div');
    progressFill.className = 'recipe-progress-fill';
    progressFill.style.width = `${totalNeeded > 0 ? (totalHave / totalNeeded * 100) : 0}%`;
    progressBar.appendChild(progressFill);
    const progressText = document.createElement('span');
    progressText.className = 'recipe-progress-text';
    progressText.textContent = `${Math.round(totalHave / totalNeeded * 100)}%`;
    progressText.dataset.progress = 'true';
    progressWrap.append(progressBar, progressText);
    text.appendChild(progressWrap);

    card.append(icon, text, state);
    card.title = 'Clic = placer dans la grille | Clic droit = craft rapide';
    card.onclick = () => this.prepareFromBook(recipe);
    card.oncontextmenu = (e) => {
      e.preventDefault();
      this.quickCraftFromBook(recipe);
    };
    this.cards.push({ recipe, card, stateEl: state, progressFill, progressText });
    return card;
  }

  quickCraftFromBook(recipe) {
    // Essayer de remplir la grille et craft directement
    if (this.inventory.prepareRecipe(recipe)) {
      // Tenter de crafter immédiatement
      const result = this.inventory.craftFromGrid({ toCursor: true });
      if (result) {
        this.setStatus(`${ITEM_DEFS[recipe.out].label} ×${recipe.outN} fabriqué !`, 'success');
      } else {
        this.setStatus('Ingrédients placés. Cliquez sur le résultat.', 'success');
      }
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

  prepareFromBook(recipe) {
    if (this.inventory.prepareRecipe(recipe)) {
      this.setStatus('Ingrédients placés. Cliquez sur le résultat pour crafter.', 'success');
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
      // Rechercher aussi dans les ingrédients
      const ingredients = Object.keys(recipe.inputs).map(i => ITEM_DEFS[i]?.label?.toLowerCase() || i).join(' ');
      const matches = !q || label.includes(q) || id.includes(q) || ingredients.includes(q);
      card.classList.toggle('search-hidden', !matches);
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

    for (const { recipe: cardRecipe, card, stateEl, progressFill, progressText } of this.cards) {
      const available = this.inventory.canCraft(cardRecipe);
      card.classList.toggle('recipe-locked', !available);
      stateEl.innerHTML = available ? icon('check') : icon('lock');
      
      // Mettre à jour les compteurs d'ingrédients
      const ingredients = card.querySelectorAll('.recipe-ingredient');
      const inputs = Object.entries(cardRecipe.inputs);
      ingredients.forEach((el, i) => {
        if (i < inputs.length) {
          const [id, n] = inputs[i];
          const have = this.inventory.count(id);
          const haveEl = el.querySelector('.recipe-have');
          if (haveEl) {
            haveEl.textContent = have;
            haveEl.className = `recipe-have ${have >= n ? 'enough' : ''}`;
          }
        }
      });

      // Mettre à jour la barre de progression
      if (progressFill && progressText) {
        const totalNeeded = Object.values(cardRecipe.inputs).reduce((a, b) => a + b, 0);
        const totalHave = Object.entries(cardRecipe.inputs)
          .reduce((sum, [id, n]) => sum + Math.min(this.inventory.count(id), n), 0);
        const pct = totalNeeded > 0 ? (totalHave / totalNeeded * 100) : 0;
        progressFill.style.width = `${pct}%`;
        progressText.textContent = `${Math.round(pct)}%`;
      }
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
