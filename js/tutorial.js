// ============================================================
//  AVANIA — Tutoriel illustré
//  Un panneau d'accueil qui explique les bases du jeu avec de
//  petites scènes dessinées en code (réutilise les assets du jeu :
//  arbres, rochers, personnage, icônes d'objets…). Aucun asset
//  externe, cohérent avec le style voxel du jeu.
// ============================================================

import { getItemSprite } from './icons.js';
import { getTileCanvas, getFurnaceCanvas, drawTreeObject, drawRockObject } from './tileset.js';
import { drawCharacter } from './character.js';
import { drawHeldItem } from './held.js';
import { Mob, drawMob } from './mobs.js';

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
  drawHeldItem(ctx, app, 'wooden_axe', 56, 62, { facing: 'down', scale: 1.1, time: 0.4 });
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
  drawTreeObject(ctx, 40, 64);
  drawShadow(ctx, 88, 86, 8);
  drawShadow(ctx, 112, 72, 8);
  drawShadow(ctx, 128, 90, 8);
  drawItem(ctx, 'wood', 88, 78, 22);
  drawItem(ctx, 'wood', 112, 64, 22);
  drawItem(ctx, 'wood', 128, 82, 22);
  drawCursor(ctx, 136, 30);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.fillText('clic G', 132, 58);
}

function illPlace(ctx, app) {
  backdrop(ctx);
  drawShadow(ctx, 70, 82, 15);
  ctx.drawImage(getTileCanvas('wood'), 54, 50, 32, 32);
  drawCharacter(ctx, app, 118, 88, { facing: 'left', scale: 1.05 });
  drawHeldItem(ctx, app, 'wood', 118, 88, { facing: 'left', scale: 1.05 });
  drawCursor(ctx, 92, 28);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.fillText('clic D', 96, 54);
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
  drawShadow(ctx, 84, 92, 40);
  ctx.drawImage(getTileCanvas('plank'), 52, 60, 32, 32);
  ctx.drawImage(getTileCanvas('plank'), 84, 60, 32, 32);
  ctx.drawImage(getTileCanvas('wood'), 52, 28, 32, 32);
  ctx.drawImage(getTileCanvas('wood'), 84, 28, 32, 32);
  ctx.drawImage(getTileCanvas('glass'), 60, 60, 16, 16);
  ctx.drawImage(getTileCanvas('brick'), 82, 60, 12, 20);
  drawCharacter(ctx, app, 132, 88, { facing: 'left', scale: 1.05 });
  drawHeldItem(ctx, app, 'plank', 132, 88, { facing: 'left', scale: 1.05 });
}

function illMobs(ctx, app) {
  backdrop(ctx);
  const sheep = new Mob('sheep', 52, 68);
  sheep.facing = 'left';
  drawMob(ctx, sheep);
  drawMob(ctx, new Mob('cow', 118, 70));
  // petit couteau / épée en main du personnage
  drawCharacter(ctx, app, 60, 26, { facing: 'down', scale: 0.9 });
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillText('clic G', 66, 52);
}

function illFurnace(ctx, app) {
  backdrop(ctx);
  ctx.drawImage(getFurnaceCanvas(true), 40, 52, 32, 32);
  drawShadow(ctx, 40 + 16, 52 + 34, 12);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('→', 88, 68);
  drawItem(ctx, 'ironIngot', 122, 62, 28);
  drawItem(ctx, 'rawIron', 24, 30, 24);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = 'bold 10px system-ui, sans-serif';
  ctx.fillText('clic D', 44, 88);
}

const CARDS = [
  {
    title: 'Te déplacer',
    text: 'ZQSD ou flèches.',
    draw: illMove,
  },
  {
    title: 'Récolter',
    text: 'Clic gauche maintenu sur un arbre ou un rocher.',
    draw: illGather,
  },
  {
    title: 'Poser des blocs',
    text: 'Clic droit pose le bloc sélectionné.',
    draw: illPlace,
  },
  {
    title: 'Lâcher des objets',
    text: 'Q jette un objet, Ctrl+Q toute la pile.',
    draw: illGather,
  },
  {
    title: 'Ton inventaire',
    text: 'E ouvre le sac : clic, double-clic, shift-clic, glisser.',
    draw: illInventory,
  },
  {
    title: 'Fabriquer',
    text: 'C ouvre l\'établi. Choisis une recette puis fabrique.',
    draw: illCraft,
  },
  {
    title: 'Construire',
    text: 'Bois et pierre pour bâtir ta maison.',
    draw: illBuild,
  },
  {
    title: 'Les animaux',
    text: 'Moutons et vaches : clic gauche pour laine et bœuf.',
    draw: illMobs,
  },
  {
    title: 'Le four',
    text: '8 pierres → four. Fonds minerai et sable, cuit la viande.',
    draw: illFurnace,
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
          <h2>Bienvenue</h2>
        </div>
      </div>
      <button id="tutorial-close" class="craft-close" title="Fermer">✕</button>
    `;
    panel.appendChild(header);

    const intro = document.createElement('p');
    intro.className = 'tutorial-intro';
    intro.textContent = 'Récupère des ressources, fabrique tes outils, construis. L\'essentiel pour démarrer :';
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
      <button id="tutorial-start" class="btn btn-primary">C'est parti !</button>
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
