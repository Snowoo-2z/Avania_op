// ============================================================
//  AVANIA — Interface : création de personnage + HUD + barre rapide
// ============================================================

import {
  SKIN_TONES, HAIR_STYLES, HAIR_COLORS, EYE_COLORS,
  SHIRT_COLORS, PANTS_COLORS, HATS, GLASSES,
  DEFAULT_APPEARANCE, NAME_IDEAS,
} from './config.js';
import { ITEM_DEFS } from './blocks.js';
import { drawCharacter } from './character.js';
import { pick } from './utils.js';

// ------------------------------------------------------------
//  Écran de création de personnage
// ------------------------------------------------------------
export function openCharacterCreation() {
  return new Promise((resolve) => {
    const overlay = document.getElementById('customization');
    overlay.style.display = 'flex';

    const app = { ...DEFAULT_APPEARANCE };
    let facing = 'down';
    const nameInput = document.getElementById('char-name');
    const preview = document.getElementById('char-preview');
    const pctx = preview.getContext('2d');
    nameInput.value = app.name;

    document.getElementById('name-random').onclick = () => {
      nameInput.value = pick(Math.random, NAME_IDEAS);
    };

    function renderPreview() {
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

      drawCharacter(pctx, app, cx, gy, {
        facing, walkPhase: 0, scale: 3.2,
      });
    }

    function setFacing(f) { facing = f; renderPreview(); }

    const sections = [
      { id: 'skin',       title: 'Peau',            options: SKIN_TONES,   key: 'skin',      swatch: 'color' },
      { id: 'hairstyle',  title: 'Coiffure',        options: HAIR_STYLES,  key: 'hairStyle', swatch: 'text' },
      { id: 'haircolor',  title: 'Couleur cheveux', options: HAIR_COLORS,  key: 'hairColor', swatch: 'color' },
      { id: 'eyes',       title: 'Yeux',            options: EYE_COLORS,   key: 'eyes',      swatch: 'color' },
      { id: 'hat',        title: 'Chapeau',         options: HATS,         key: 'hat',       swatch: 'text' },
      { id: 'glasses',    title: 'Lunettes',        options: GLASSES,      key: 'glasses',   swatch: 'text' },
      { id: 'shirt',      title: 'Haut',            options: SHIRT_COLORS, key: 'shirt',     swatch: 'color' },
      { id: 'pants',      title: 'Pantalon',        options: PANTS_COLORS, key: 'pants',     swatch: 'color' },
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
          renderPreview();
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

    // sélection initiale
    for (const sec of sections) {
      const idx = sec.options.findIndex((o) => o.id === app[sec.key]);
      if (idx >= 0) selectOnly(sec.id, buttonsBySection[sec.id][idx]);
    }

    // rotation automatique
    let autoRotate = true;
    const faces = ['down', 'left', 'up', 'right'];
    let faceIdx = 0;
    const rotTimer = setInterval(() => {
      if (autoRotate) { faceIdx = (faceIdx + 1) % 4; setFacing(faces[faceIdx]); }
    }, 900);

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
      app.shirt = pick(r, SHIRT_COLORS).id;
      app.pants = pick(r, PANTS_COLORS).id;
      for (const sec of sections) {
        const idx = sec.options.findIndex((o) => o.id === app[sec.key]);
        if (idx >= 0) selectOnly(sec.id, buttonsBySection[sec.id][idx]);
      }
      renderPreview();
    };

    document.getElementById('char-start').onclick = () => {
      const name = nameInput.value.trim() || 'Aventurier';
      clearInterval(rotTimer);
      overlay.style.display = 'none';
      resolve({ ...app, name });
    };

    renderPreview();
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
    this.inventory = inventory;
    this.slots = [];
    this.build();
    inventory.onChange = () => this.update();
  }

  build() {
    this.root.innerHTML = '';
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
