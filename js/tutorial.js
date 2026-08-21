// ============================================================
//  AVANIA — Tutoriel illustré
//  Un panneau d'accueil qui explique les bases du jeu avec de
//  petites scènes dessinées en code (réutilise les assets du jeu :
//  arbres, rochers, personnage, icônes d'objets…). Aucun asset
//  externe, cohérent avec le style voxel du jeu.
// ============================================================

import { getItemSprite } from './icons.js';
import { getTileCanvas, drawTreeObject, drawRockObject } from './tileset.js';
import { drawCharacter } from './character.js';

const ILL_W = 168;
const ILL_H = 110;
const SCALE = 2; // rendu 2× pour un affichage net

function newIllustration() {
  const c = document.createElement('canvas');
  c.width = ILL_W * SCALE;
  c.height = ILL_H * SCALE;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.scale(SCALE, SCALE);
  return { c, ctx };
}

// Fond "en jeu" : gazon + léger voile sombre pour faire ressortir les éléments.
function backdrop(ctx) {
  const tile = getTileCanvas('grass');
  for (let y = 0; y < ILL_H; y += 32) {
    for (let x = 0; x < ILL_W; x += 32) {
      ctx.drawImage(tile, x, y);
    }
  }
  ctx.fillStyle = 'rgba(16,28,18,0.18)';
  ctx.fillRect(0, 0, ILL_W, ILL_H);
}

// Touche de clavier stylisée (petit carré 3D).
function drawKey(ctx, x, y, w, h, label) {
  ctx.fillStyle = '#3c4f3c';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(x, y, w, 2);
  ctx.fillRect(x, y, 2, h);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x, y + h - 2, w, 2);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2 + 1);
}

// Curseur de souris (flèche).
function drawCursor(ctx, x, y) {
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + 15);
  ctx.lineTo(x + 4, y + 11);
  ctx.lineTo(x + 8, y + 16);
  ctx.lineTo(x + 10, y + 15);
  ctx.lineTo(x + 6, y + 10);
  ctx.lineTo(x + 11, y + 9);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawItem(ctx, id, x, y, size = 26) {
  const sprite = getItemSprite(id);
  if (sprite) ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
}

function drawShadow(ctx, x, y, w) {
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(x, y, w, w * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();
}

// ------------------------------------------------------------------
//  Illustrations (une par carte)
// ------------------------------------------------------------------

function illMove(ctx, app) {
  backdrop(ctx);
  drawShadow(ctx, 56, 62, 12);
  drawCharacter(ctx, app, 56, 62, { facing: 'down', scale: 1.1 });
  // croix de touches ZQSD
  drawKey(ctx, 116, 22, 24, 22, 'Z');
  drawKey(ctx, 92, 48, 24, 22, 'Q');
  drawKey(ctx, 116, 74, 24, 22, 'S');
  drawKey(ctx, 140, 48, 24, 22, 'D');
  // petites flèches de déplacement
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillText('⇅', 104, 40);
  ctx.fillText('⇄', 104, 66);
}

function illGather(ctx, app) {
  backdrop(ctx);
  drawTreeObject(ctx, 46, 62);
  drawShadow(ctx, 108, 84, 13);
  drawItem(ctx, 'wood', 100, 76, 26);
  drawItem(ctx, 'wood', 118, 82, 26);
  drawCursor(ctx, 130, 34);
  // petit éclat "clic"
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.fillText('clic G', 128, 62);
}

function illPlace(ctx, app) {
  backdrop(ctx);
  // bloc posé
  drawShadow(ctx, 70, 78, 15);
  ctx.drawImage(getTileCanvas('wood'), 54, 46, 32, 32);
  drawCursor(ctx, 96, 32);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.fillText('clic D', 96, 58);
}

function illInventory(ctx, app) {
  backdrop(ctx);
  const slot = 30, gap = 5, x0 = 16, y0 = 30;
  const items = ['wood', 'stone', 'wooden_pickaxe', 'plank', 'stick', 'stone_axe'];
  items.forEach((id, i) => {
    const x = x0 + (i % 3) * (slot + gap);
    const y = y0 + Math.floor(i / 3) * (slot + gap);
    ctx.fillStyle = 'rgba(28,40,28,0.92)';
    ctx.fillRect(x, y, slot, slot);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.5, y + 0.5, slot - 1, slot - 1);
    drawItem(ctx, id, x + slot / 2, y + slot / 2, 22);
  });
  // surbrillance de la case sélectionnée
  const sx = x0, sy = y0;
  ctx.strokeStyle = '#f2c14e';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(sx - 2, sy - 2, slot + 4, slot + 4);
}

function illCraft(ctx, app) {
  backdrop(ctx);
  // ingrédients -> outil
  drawItem(ctx, 'plank', 34, 60, 26);
  drawItem(ctx, 'stick', 64, 60, 26);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('→', 92, 64);
  drawShadow(ctx, 126, 72, 13);
  drawItem(ctx, 'wooden_pickaxe', 126, 60, 34);
}

function illBuild(ctx, app) {
  backdrop(ctx);
  // petite maison en blocs
  drawShadow(ctx, 84, 92, 44);
  ctx.drawImage(getTileCanvas('plank'), 52, 60, 32, 32);
  ctx.drawImage(getTileCanvas('plank'), 84, 60, 32, 32);
  ctx.drawImage(getTileCanvas('wood'), 52, 28, 32, 32);
  ctx.drawImage(getTileCanvas('wood'), 84, 28, 32, 32);
  ctx.drawImage(getTileCanvas('glass'), 60, 60, 16, 16); // fenêtre
  ctx.drawImage(getTileCanvas('brick'), 82, 60, 12, 20); // porte
  ctx.drawImage(getTileCanvas('wood'), 44, 8, 80, 24); // toit
  // personnage à côté
  drawCharacter(ctx, app, 132, 88, { facing: 'left', scale: 1.1 });
}

const CARDS = [
  {
    title: 'Te déplacer',
    text: 'Utilise ZQSD (ou les flèches) pour te promener dans le monde.',
    draw: illMove,
  },
  {
    title: 'Récolter',
    text: 'Maintiens le clic gauche sur un arbre ou un rocher pour le casser et récupérer ses ressources.',
    draw: illGather,
  },
  {
    title: 'Poser des blocs',
    text: 'Clic droit pour poser le bloc sélectionné dans ta barre rapide.',
    draw: illPlace,
  },
  {
    title: 'Ton inventaire',
    text: 'Touche E pour ouvrir ton sac : 36 cases, glisse-dépose ou shift-clic pour ranger.',
    draw: illInventory,
  },
  {
    title: 'Fabriquer',
    text: 'Touche C pour ouvrir l\'établi et transformer tes matériaux en outils (pioche, hache…).',
    draw: illCraft,
  },
  {
    title: 'Construire',
    text: 'Récupère du bois et de la pierre, puis bâtis ta propre maison. Le monde t\'appartient !',
    draw: illBuild,
  },
];

export class Tutorial {
  constructor(appearance) {
    this.appearance = appearance;
    this.build();
  }

  build() {
    this.root = document.createElement('div');
    this.root.className = 'tutorial-backdrop hidden';
    this.root.id = 'tutorial';

    const panel = document.createElement('div');
    panel.className = 'tutorial-panel';

    // En-tête
    const header = document.createElement('header');
    header.className = 'tutorial-header';
    header.innerHTML = `
      <div class="tutorial-brand">
        <div class="tutorial-logo">◼</div>
        <div>
          <span class="panel-eyebrow">AVANIA // GUIDE</span>
          <h2>Bienvenue dans le village</h2>
        </div>
      </div>
      <button id="tutorial-close" class="craft-close" title="Fermer">✕</button>
    `;
    panel.appendChild(header);

    const intro = document.createElement('p');
    intro.className = 'tutorial-intro';
    intro.textContent = 'Un monde vide t\'attend. Récupère des ressources, fabrique tes outils, et construis tout ce que tu imagines. Voici l\'essentiel pour bien démarrer :';
    panel.appendChild(intro);

    // Grille de cartes
    const grid = document.createElement('div');
    grid.className = 'tutorial-grid';
    for (const card of CARDS) {
      const el = document.createElement('article');
      el.className = 'tutorial-card';

      const { c, ctx } = newIllustration();
      card.draw(ctx, this.appearance);
      c.style.width = ILL_W + 'px';
      c.style.height = ILL_H + 'px';

      const figure = document.createElement('div');
      figure.className = 'tutorial-figure';
      figure.appendChild(c);

      const body = document.createElement('div');
      body.className = 'tutorial-body';
      body.innerHTML = `<h3>${card.title}</h3><p>${card.text}</p>`;

      el.append(figure, body);
      grid.appendChild(el);
    }
    panel.appendChild(grid);

    // Pied de page
    const footer = document.createElement('footer');
    footer.className = 'tutorial-footer';
    footer.innerHTML = `
      <button id="tutorial-start" class="btn btn-primary">C'est parti ! 🚀</button>
    `;
    panel.appendChild(footer);

    this.root.appendChild(panel);
    document.body.appendChild(this.root);

    document.getElementById('tutorial-close').onclick = () => this.hide();
    document.getElementById('tutorial-start').onclick = () => this.hide();
  }

  show() {
    this.root.classList.remove('hidden');
  }

  hide() {
    this.root.classList.add('hidden');
  }

  get isOpen() {
    return !this.root.classList.contains('hidden');
  }
}
