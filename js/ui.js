// ============================================================
//  AVANIA — Interface : création de personnage + HUD
// ============================================================

import {
  SKIN_TONES, HAIR_STYLES, HAIR_COLORS, EYE_COLORS,
  SHIRT_COLORS, PANTS_COLORS, DEFAULT_APPEARANCE, NAME_IDEAS,
} from './config.js';
import { drawCharacter } from './character.js';
import { pick } from './utils.js';

// ------------------------------------------------------------
//  Écran de création de personnage
//  Retourne une Promise résolue avec l'apparence choisie.
// ------------------------------------------------------------
export function openCharacterCreation() {
  return new Promise((resolve) => {
    const overlay = document.getElementById('customization');
    overlay.style.display = 'flex';

    // état d'aperçu
    const app = { ...DEFAULT_APPEARANCE };
    let facing = 'down';
    const nameInput = document.getElementById('char-name');
    const preview = document.getElementById('char-preview');
    const pctx = preview.getContext('2d');
    nameInput.value = app.name;

    // bouton nom aléatoire
    document.getElementById('name-random').onclick = () => {
      nameInput.value = pick(Math.random, NAME_IDEAS);
    };

    function renderPreview() {
      pctx.clearRect(0, 0, preview.width, preview.height);
      // petit plateau d'herbe
      pctx.fillStyle = '#6faf4b';
      pctx.beginPath();
      pctx.ellipse(preview.width / 2, preview.height / 2 + 24, 70, 22, 0, 0, Math.PI * 2);
      pctx.fill();
      drawCharacter(pctx, app, preview.width / 2, preview.height / 2 + 26, {
        facing, walkPhase: 0, scale: 3,
      });
    }

    function setFacing(f) { facing = f; renderPreview(); }

    // construction des sections de choix
    const sections = [
      { id: 'skin',      title: 'Peau',           options: SKIN_TONES,   key: 'skin' },
      { id: 'hairstyle', title: 'Coiffure',       options: HAIR_STYLES,   key: 'hairStyle' },
      { id: 'haircolor', title: 'Couleur cheveux', options: HAIR_COLORS,  key: 'hairColor' },
      { id: 'eyes',      title: 'Yeux',           options: EYE_COLORS,    key: 'eyes' },
      { id: 'shirt',     title: 'Haut',           options: SHIRT_COLORS,  key: 'shirt' },
      { id: 'pants',     title: 'Pantalon',       options: PANTS_COLORS,  key: 'pants' },
    ];

    const container = document.getElementById('char-sections');
    container.innerHTML = '';

    const selected = {}; // sectionId -> element sélectionné
    for (const sec of sections) {
      const wrap = document.createElement('div');
      wrap.className = 'section';

      const label = document.createElement('div');
      label.className = 'section-title';
      label.textContent = sec.title;
      wrap.appendChild(label);

      const row = document.createElement('div');
      row.className = 'swatches';

      sec.options.forEach((opt) => {
        const btn = document.createElement('button');
        btn.className = 'swatch';
        btn.title = opt.label;

        if (sec.id === 'hairstyle') {
          // icône texte pour les coiffures
          btn.classList.add('swatch-text');
          btn.textContent = opt.label.charAt(0).toUpperCase();
        } else {
          btn.style.background = opt.color;
        }
        btn.onclick = () => {
          app[sec.key] = opt.id;
          // mise en évidence
          if (selected[sec.id]) selected[sec.id].classList.remove('active');
          btn.classList.add('active');
          selected[sec.id] = btn;
          renderPreview();
        };
        row.appendChild(btn);
        if (opt.id === app[sec.key]) { btn.classList.add('active'); selected[sec.id] = btn; }
      });

      wrap.appendChild(row);
      container.appendChild(wrap);
    }

    // rotation automatique douce de l'aperçu
    let autoRotate = true;
    const faces = ['down', 'left', 'up', 'right'];
    let faceIdx = 0;
    const rotTimer = setInterval(() => {
      if (autoRotate) { faceIdx = (faceIdx + 1) % 4; setFacing(faces[faceIdx]); }
    }, 900);

    // boutons d'orientation
    const dirBtns = document.querySelectorAll('[data-facing]');
    dirBtns.forEach((b) => {
      b.onclick = () => { autoRotate = false; setFacing(b.dataset.facing); };
    });

    // bouton surprise (aléatoire)
    document.getElementById('char-random').onclick = () => {
      const rng = Math.random;
      app.skin = pick(rng, SKIN_TONES).id;
      app.hairStyle = pick(rng, HAIR_STYLES).id;
      app.hairColor = pick(rng, HAIR_COLORS).id;
      app.eyes = pick(rng, EYE_COLORS).id;
      app.shirt = pick(rng, SHIRT_COLORS).id;
      app.pants = pick(rng, PANTS_COLORS).id;
      // re-sélectionner visuellement
      refreshSelection();
      renderPreview();
    };

    function refreshSelection() {
      const opts = { skin: SKIN_TONES, hairstyle: HAIR_STYLES, haircolor: HAIR_COLORS, eyes: EYE_COLORS, shirt: SHIRT_COLORS, pants: PANTS_COLORS };
      for (const [sid, list] of Object.entries(opts)) {
        const key = { skin: 'skin', hairstyle: 'hairStyle', haircolor: 'hairColor', eyes: 'eyes', shirt: 'shirt', pants: 'pants' }[sid];
        const idx = list.findIndex((o) => o.id === app[key]);
        const buttons = container.querySelectorAll('.section')[Object.keys(opts).indexOf(sid)].querySelectorAll('.swatch');
        buttons.forEach((b, i) => b.classList.toggle('active', i === idx));
      }
    }

    // validation
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
    this.moneyEl = root.querySelector('#hud-money');
    this.playersEl = root.querySelector('#hud-players');
  }

  show() { this.el.style.display = 'flex'; }
  hide() { this.el.style.display = 'none'; }

  update({ name, money, playerCount }) {
    this.nameEl.textContent = name;
    this.moneyEl.textContent = money.toLocaleString('fr-FR');
    this.playersEl.textContent = playerCount;
  }
}
