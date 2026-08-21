// ============================================================
//  AVANIA — Rendu du décor (arbres, toits, fontaine, étals…)
//  Chaque décor est trié avec le joueur selon sa profondeur (y),
//  pour un rendu top-down naturel.
// ============================================================

import { TILE } from './config.js';
import { roundedRect, circle } from './utils.js';
import { drawTreeOverlay, drawBushOverlay } from './tileset.js';

// Dessine un décor dans le contexte monde (translation déjà appliquée)
export function drawDecor(ctx, item) {
  switch (item.type) {
    case 'tree':     drawTree(ctx, item); break;
    case 'bush':     drawBushOverlay(ctx, item.x, item.y, null); break;
    case 'fountain': drawFountain(ctx, item); break;
    case 'lamp':     drawLamp(ctx, item); break;
    case 'stall':    drawStall(ctx, item); break;
    case 'roof':     drawRoof(ctx, item); break;
  }
}

function drawTree(ctx, item) {
  drawTreeOverlay(ctx, item.x, item.y, null);
}

function drawFountain(ctx, item) {
  const { x, y } = item;
  // ombre
  ctx.fillStyle = 'rgba(20,30,20,0.15)';
  ctx.beginPath(); ctx.ellipse(x, y + 14, 22, 10, 0, 0, Math.PI * 2); ctx.fill();
  // bassin extérieur
  ctx.fillStyle = '#8b8b85';
  circle(ctx, x, y, 20); ctx.fill();
  ctx.fillStyle = '#a3a39c';
  circle(ctx, x, y, 18); ctx.fill();
  // eau
  ctx.fillStyle = '#4aa3d8';
  circle(ctx, x, y, 14); ctx.fill();
  ctx.fillStyle = '#63b7e5';
  circle(ctx, x - 3, y - 3, 8); ctx.fill();
  // jet d'eau central
  ctx.fillStyle = '#9aa0a6';
  circle(ctx, x, y, 5); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1.5;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(x, y - 4);
    ctx.quadraticCurveTo(x + i * 6, y - 12, x + i * 8, y - 16);
    ctx.stroke();
  }
}

function drawLamp(ctx, item) {
  const { x, y } = item;
  ctx.fillStyle = 'rgba(20,30,20,0.15)';
  ctx.beginPath(); ctx.ellipse(x, y + 10, 7, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(x - 2, y - 10, 4, 20);
  ctx.fillStyle = '#555';
  ctx.fillRect(x - 4, y - 2, 8, 3);
  ctx.fillStyle = '#ffd76a';
  ctx.beginPath(); ctx.arc(x, y - 12, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,215,106,0.25)';
  ctx.beginPath(); ctx.arc(x, y - 12, 9, 0, Math.PI * 2); ctx.fill();
}

function drawStall(ctx, item) {
  const { x, y, color } = item;
  // ombre
  ctx.fillStyle = 'rgba(20,30,20,0.12)';
  ctx.beginPath(); ctx.ellipse(x, y + 12, 20, 9, 0, 0, Math.PI * 2); ctx.fill();
  // comptoir (table)
  ctx.fillStyle = '#8a5a34';
  ctx.fillRect(x - 18, y - 4, 36, 14);
  ctx.fillStyle = '#6e4426';
  ctx.fillRect(x - 18, y + 6, 36, 4);
  // étagère de produits
  ctx.fillStyle = '#f0e0c0';
  ctx.fillRect(x - 14, y - 6, 28, 4);
  const goods = ['#e05a5a', '#5ab06a', '#e0a03c', '#5aa0e0', '#b06ac9'];
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = goods[i];
    circle(ctx, x - 12 + i * 6, y - 4, 2.5); ctx.fill();
  }
  // auvent rayé
  const stripe = 8;
  for (let sx = -18; sx < 18; sx += stripe) {
    ctx.fillStyle = (Math.floor((sx + 18) / stripe) % 2 === 0) ? color : '#f4f0e6';
    ctx.fillRect(x + sx, y - 22, stripe, 18);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(x - 18, y - 22, 36, 2);
  // poteaux
  ctx.fillStyle = '#6e4426';
  ctx.fillRect(x - 17, y - 22, 3, 18);
  ctx.fillRect(x + 14, y - 22, 3, 18);
}

function drawRoof(ctx, item) {
  const { x, y, w, h, color, name } = item;
  const overhang = 6;
  // ombre portée du toit sur le sol
  ctx.fillStyle = 'rgba(20,30,20,0.20)';
  ctx.fillRect(x + overhang, y + h + 2, w - overhang, 8);

  // façade (mur visible sous le toit, côté sud)
  ctx.fillStyle = '#c9b58f';
  ctx.fillRect(x + overhang, y + h - 4, w - overhang * 2, 8);
  ctx.fillStyle = '#a18a63';
  ctx.fillRect(x + overhang, y + h + 2, w - overhang * 2, 2);

  // corps du toit
  ctx.fillStyle = color;
  roundedRect(ctx, x, y, w, h + 4, 6);
  ctx.fill();
  // bordure
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 2;
  roundedRect(ctx, x, y, w, h + 4, 6);
  ctx.stroke();
  // reflet
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  roundedRect(ctx, x + 4, y + 4, w - 8, (h + 4) * 0.4, 4);
  ctx.fill();
  // lignes de tuiles
  ctx.strokeStyle = 'rgba(0,0,0,0.10)';
  ctx.lineWidth = 1;
  for (let ry = y + 8; ry < y + h; ry += 8) {
    ctx.beginPath(); ctx.moveTo(x + 3, ry); ctx.lineTo(x + w - 3, ry); ctx.stroke();
  }
  // cheminée
  ctx.fillStyle = '#7d5a3a';
  ctx.fillRect(x + w - 16, y + 6, 8, 10);
  ctx.fillStyle = '#5a3f28';
  ctx.fillRect(x + w - 17, y + 4, 10, 4);

  // nom du bâtiment sur le toit (si le toit est assez grand)
  if (name && w >= TILE * 4) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, x + w / 2, y + h / 2);
    ctx.restore();
  }
}
