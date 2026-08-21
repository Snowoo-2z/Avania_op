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
import { pick } from './utils.js';

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
    let facing = 'down';
    const nameInput = document.getElementById('char-name');
    const preview = document.getElementById('char-preview');
    const pctx = preview.getContext('2d');
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
    const t0 = performance.now();
    function loop(now) {
      renderPreview((now - t0) / 1000);
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
//  Barre rapide (inventaire)
// ------------------------------------------------------------
export class Hotbar {
  constructor(root, inventory) {
    this.root = root;
    this.inventory = null;
    this.slots = [];
    if (inventory) this.attach(inventory);
  }

  // branche la barre sur un inventaire (appelé une fois le jeu lancé)
  attach(inventory) {
    this.inventory = inventory;
    this.build();
    inventory.subscribe(() => this.update());
  }

  build() {
    this.root.innerHTML = '';
    this.slots = [];
    this.inventory.order.forEach((item, i) => {
      const def = ITEM_DEFS[item];
      const el = document.createElement('div');
      el.className = 'slot';
      el.dataset.key = i + 1;
      el.title = `${def.label} — touche ${i + 1}`;

      const icon = document.createElement('div');
      icon.className = 'slot-icon';
      icon.style.background = def.color;

      const count = document.createElement('div');
      count.className = 'slot-count';

      el.appendChild(icon);
      el.appendChild(count);
      el.onclick = () => this.inventory.select(i);

      this.root.appendChild(el);
      this.slots.push({ el, count, item });
    });
    this.update();
  }

  update() {
    this.slots.forEach((s, i) => {
      s.count.textContent = this.inventory.items[s.item];
      s.el.classList.toggle('selected', this.inventory.selected === i);
    });
  }
}

// ------------------------------------------------------------
//  Fabrication (recettes simples)
// ------------------------------------------------------------
export class Crafting {
  constructor(root, listRoot, inventory) {
    this.root = root;
    this.listRoot = listRoot;
    this.inventory = inventory;
    this.build();
    inventory.subscribe(() => this.update());
  }

  build() {
    this.listRoot.innerHTML = '';
    this.cards = RECIPES.map((recipe) => {
      const out = ITEM_DEFS[recipe.out];
      const cost = Object.entries(recipe.inputs)
        .map(([id, n]) => `${n} ${ITEM_DEFS[id].label.toLowerCase()}`)
        .join(' + ');

      const card = document.createElement('div');
      card.className = 'recipe';

      const outEl = document.createElement('div');
      outEl.className = 'recipe-out';
      const icon = document.createElement('span');
      icon.className = 'recipe-icon';
      icon.style.background = out.color;
      const name = document.createElement('b');
      name.textContent = `${out.label} ×${recipe.outN}`;
      outEl.appendChild(icon);
      outEl.appendChild(name);

      const costEl = document.createElement('div');
      costEl.className = 'recipe-cost';
      costEl.textContent = cost;

      const btn = document.createElement('button');
      btn.className = 'btn btn-primary';
      btn.textContent = 'Fabriquer';
      btn.onclick = () => this.inventory.craft(recipe);

      card.appendChild(outEl);
      card.appendChild(costEl);
      card.appendChild(btn);
      this.listRoot.appendChild(card);
      return { recipe, btn };
    });
    this.update();
  }

  toggle() {
    this.root.classList.toggle('hidden');
  }

  update() {
    for (const { recipe, btn } of this.cards) {
      btn.disabled = !this.inventory.canCraft(recipe);
    }
  }
}
