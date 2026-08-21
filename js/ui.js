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
          btn.textContent = opt.label.charAt(0).toUpperCase();
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

  show() { this.el.style.display = 'flex'; }
  hide() { this.el.style.display = 'none'; }

  update({ name, playerCount }) {
    this.nameEl.textContent = name;
    this.playersEl.textContent = playerCount;
  }
}

// ------------------------------------------------------------
//  Barre rapide (9 cases)
// ------------------------------------------------------------
function updateSlotVisual(el, stack, inventory = null, index = -1) {
  const icon = el.querySelector('.slot-icon');
  const count = el.querySelector('.slot-count');
  const durability = el.querySelector('.slot-durability');
  const def = stack && ITEM_DEFS[stack.id];
  el.classList.toggle('occupied', Boolean(stack));
  el.classList.toggle('tool-slot', Boolean(def?.type === 'tool'));

  if (!stack || !def) {
    icon.textContent = '';
    icon.style.background = 'transparent';
    count.textContent = '';
    durability.style.width = '0%';
    el.title = index >= 0 ? `Case ${index + 1} — vide` : 'Case vide';
    return;
  }

  icon.textContent = def.icon || '';
  icon.style.background = def.color;
  count.textContent = def.type === 'tool' ? '' : (stack.count > 1 ? stack.count : '');
  if (def.type === 'tool') {
    const max = def.durability || 1;
    const current = Math.max(0, stack.durability ?? max);
    durability.style.width = `${Math.max(0, Math.min(100, current / max * 100))}%`;
    durability.style.background = current / max < 0.25 ? '#e65b4f' : '#7ccf6a';
    el.title = `${def.label} — durabilité ${current}/${max}`;
  } else {
    durability.style.width = '0%';
    el.title = `${def.label} — ${stack.count} en stock`;
  }
}

function makeInventorySlot(index, clickHandler, dragHandler) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'slot inventory-slot';
  el.dataset.slot = index;
  el.draggable = true;
  const icon = document.createElement('span');
  icon.className = 'slot-icon';
  const count = document.createElement('span');
  count.className = 'slot-count';
  const durability = document.createElement('span');
  durability.className = 'slot-durability';
  el.append(icon, count, durability);
  el.onclick = clickHandler;
  el.ondragstart = (event) => {
    event.dataTransfer?.setData('text/plain', String(index));
    event.dataTransfer?.setData('application/x-avania-slot', String(index));
    el.classList.add('dragging');
  };
  el.ondragend = () => el.classList.remove('dragging');
  el.ondragover = (event) => event.preventDefault();
  el.ondrop = (event) => {
    event.preventDefault();
    const from = Number(event.dataTransfer?.getData('application/x-avania-slot')
      || event.dataTransfer?.getData('text/plain'));
    if (Number.isInteger(from)) dragHandler(from, index);
  };
  return el;
}

export class Hotbar {
  constructor(root, inventory) {
    this.root = root;
    this.inventory = null;
    this.slots = [];
    if (inventory) this.attach(inventory);
  }

  attach(inventory) {
    this.inventory = inventory;
    this.build();
    inventory.subscribe(() => this.update());
  }

  build() {
    this.root.innerHTML = '';
    this.slots = [];
    for (let i = 0; i < this.inventory.hotbarSize; i++) {
      const index = this.inventory.hotbarStart + i;
      const el = makeInventorySlot(
        index,
        () => this.inventory.select(i),
        (from, to) => this.inventory.moveSlot(from, to),
      );
      el.classList.add('hotbar-slot');
      el.dataset.key = i + 1;
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
  }
}

// ------------------------------------------------------------
//  Inventaire complet : 27 cases + barre rapide
// ------------------------------------------------------------
export class InventoryPanel {
  constructor(root, gridRoot, hotbarRoot, inventory, onVisibilityChange = () => {}) {
    this.root = root;
    this.gridRoot = gridRoot;
    this.hotbarRoot = hotbarRoot;
    this.inventory = inventory;
    this.onVisibilityChange = onVisibilityChange;
    this.slots = [];
    this.focused = null;
    this.build();
    inventory.subscribe(() => this.update());
  }

  build() {
    this.gridRoot.innerHTML = '';
    this.hotbarRoot.innerHTML = '';
    this.slots = [];

    for (let index = 0; index < this.inventory.hotbarStart; index++) {
      this.appendSlot(this.gridRoot, index, 'storage-slot');
    }
    for (let i = 0; i < this.inventory.hotbarSize; i++) {
      this.appendSlot(this.hotbarRoot, this.inventory.hotbarStart + i, 'bag-hotbar-slot');
    }
    this.update();
  }

  appendSlot(parent, index, extraClass) {
    const el = makeInventorySlot(
      index,
      (event) => this.handleClick(index, event),
      (from, to) => {
        this.focused = null;
        this.inventory.moveSlot(from, to);
      },
    );
    el.classList.add(extraClass);
    parent.appendChild(el);
    this.slots.push({ el, index });
  }

  handleClick(index, event) {
    if (event.shiftKey) {
      this.focused = null;
      this.inventory.transferSlot(index);
      return;
    }

    if (index >= this.inventory.hotbarStart) {
      this.inventory.select(index - this.inventory.hotbarStart);
      this.focused = null;
      return;
    }

    // Deux clics sur deux cases déplacent ou regroupent une pile. Le
    // glisser-déposer est aussi disponible pour un déplacement direct.
    if (this.focused === null) {
      this.focused = index;
    } else if (this.focused === index) {
      this.focused = null;
    } else {
      this.inventory.moveSlot(this.focused, index);
      this.focused = null;
    }
    this.update();
  }

  update() {
    this.slots.forEach(({ el, index }) => {
      updateSlotVisual(el, this.inventory.getSlot(index), this.inventory, index);
      el.classList.toggle('focused', this.focused === index);
      if (index >= this.inventory.hotbarStart) {
        el.classList.toggle('selected', this.inventory.selected === index - this.inventory.hotbarStart);
      }
    });

    const used = document.getElementById('inventory-used');
    const capacity = document.getElementById('inventory-capacity');
    if (used) used.textContent = this.inventory.usedSlots;
    if (capacity) capacity.textContent = this.inventory.slotCount;

    const detailIcon = document.getElementById('inventory-detail-icon');
    const detailName = document.getElementById('inventory-detail-name');
    const detailText = document.getElementById('inventory-detail-text');
    const selected = this.inventory.getSelectedStack();
    const def = selected && ITEM_DEFS[selected.id];
    if (detailIcon) {
      detailIcon.textContent = def?.icon || '＋';
      detailIcon.style.background = def?.color || 'rgba(255,255,255,0.06)';
    }
    if (detailName) detailName.textContent = def ? def.label : 'Case sélectionnée vide';
    if (detailText) {
      if (!def) detailText.textContent = 'Choisis une case de la barre rapide ou déplace une pile par glisser-déposer.';
      else if (def.type === 'tool') detailText.textContent = `Outil ${def.toolType} · durabilité ${selected.durability}/${def.durability}`;
      else detailText.textContent = `${selected.count} objet${selected.count > 1 ? 's' : ''} · pile max ${def.maxStack || 64}`;
    }
  }

  open() {
    if (!this.root.classList.contains('hidden')) return;
    this.root.classList.remove('hidden');
    this.onVisibilityChange(true);
  }

  close() {
    if (this.root.classList.contains('hidden')) return;
    this.focused = null;
    this.root.classList.add('hidden');
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
//  Fabrication : grille 3x3 + livre de recettes
// ------------------------------------------------------------
export class Crafting {
  constructor(root, listRoot, inventory, onVisibilityChange = () => {}) {
    this.root = root;
    this.listRoot = listRoot;
    this.inventory = inventory;
    this.onVisibilityChange = onVisibilityChange;
    this.gridRoot = document.getElementById('craft-grid');
    this.outputEl = document.getElementById('craft-output');
    this.outputIcon = document.getElementById('craft-output-icon');
    this.outputName = document.getElementById('craft-output-name');
    this.statusEl = document.getElementById('craft-status');
    this.gridSlots = [];
    this.cards = [];
    this.build();
    inventory.subscribe(() => this.update());
  }

  build() {
    this.gridRoot.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const el = document.createElement('div');
      el.className = 'craft-slot';
      el.innerHTML = '<span class="slot-icon"></span><span class="slot-count"></span><span class="slot-durability"></span>';
      this.gridRoot.appendChild(el);
      this.gridSlots.push(el);
    }
    this.outputEl.onclick = () => {
      if (this.inventory.craftFromGrid()) this.setStatus('Objet fabriqué !', 'success');
      else this.setStatus('La recette ou la place disponible ne convient pas.', 'error');
    };

    this.listRoot.innerHTML = '';
    let category = '';
    for (const recipe of RECIPES) {
      if (recipe.category !== category) {
        category = recipe.category;
        const heading = document.createElement('div');
        heading.className = 'recipe-category';
        heading.textContent = category.charAt(0).toUpperCase() + category.slice(1);
        this.listRoot.appendChild(heading);
      }

      const out = ITEM_DEFS[recipe.out];
      const card = document.createElement('div');
      card.className = 'recipe';

      const outEl = document.createElement('div');
      outEl.className = 'recipe-out';
      const icon = document.createElement('span');
      icon.className = 'recipe-icon';
      icon.textContent = out.icon || '';
      icon.style.background = out.color;
      const name = document.createElement('b');
      name.textContent = `${out.label} ×${recipe.outN}`;
      outEl.append(icon, name);

      const costEl = document.createElement('div');
      costEl.className = 'recipe-cost';
      costEl.textContent = Object.entries(recipe.inputs)
        .map(([id, n]) => `${n} ${ITEM_DEFS[id].label.toLowerCase()}`)
        .join(' + ');

      const btn = document.createElement('button');
      btn.className = 'btn btn-primary';
      btn.textContent = 'Préparer';
      btn.onclick = () => {
        if (this.inventory.prepareRecipe(recipe)) this.setStatus('Ingrédients placés dans la grille.', 'success');
        else this.setStatus('Il manque des ingrédients ou une case est occupée.', 'error');
      };

      card.append(outEl, costEl, btn);
      this.listRoot.appendChild(card);
      this.cards.push({ recipe, btn });
    }
    this.update();
  }

  setStatus(message, kind = '') {
    if (!this.statusEl) return;
    this.statusEl.textContent = message;
    this.statusEl.className = `craft-status ${kind}`;
  }

  update() {
    this.gridSlots.forEach((el, i) => {
      updateSlotVisual(el, this.inventory.craftingGrid[i]);
    });

    const recipe = this.inventory.getMatchingRecipe();
    const out = recipe && ITEM_DEFS[recipe.out];
    this.outputEl.classList.toggle('ready', Boolean(out));
    this.outputEl.disabled = !out;
    if (out) {
      this.outputIcon.textContent = out.icon || '';
      this.outputIcon.style.background = out.color;
      this.outputName.textContent = `${out.label} ×${recipe.outN}`;
      this.outputEl.title = `Récupérer ${out.label}`;
    } else {
      this.outputIcon.textContent = '?';
      this.outputIcon.style.background = 'rgba(255,255,255,0.06)';
      this.outputName.textContent = 'Résultat';
      this.outputEl.title = 'Prépare une recette pour voir le résultat';
    }

    for (const { recipe: cardRecipe, btn } of this.cards) {
      btn.disabled = !this.inventory.canCraft(cardRecipe);
    }
  }

  open() {
    if (!this.root.classList.contains('hidden')) return;
    this.root.classList.remove('hidden');
    this.onVisibilityChange(true);
  }

  close() {
    if (this.root.classList.contains('hidden')) return;
    this.inventory.returnCraftingGrid();
    this.root.classList.add('hidden');
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
