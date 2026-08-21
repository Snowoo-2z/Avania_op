// ============================================================
//  AVANIA — Point d'entrée
//  1. Écran de création du personnage.
//  2. Monde vide à bâtir : collecte de blocs + inventaire.
// ============================================================

import { Game } from './game.js';
import { openCharacterCreation, HUD, Hotbar } from './ui.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

const hud = new HUD(document.getElementById('hud'));
const hotbar = new Hotbar(document.getElementById('hotbar'), null); // rempli après le lancement

async function boot() {
  // 1. Création du personnage
  const appearance = await openCharacterCreation();

  // 2. Lancement du jeu
  const game = new Game(canvas, appearance);
  game.start();
  hud.show();
  document.getElementById('controls-hint').classList.remove('hidden');

  // 3. Barre rapide branchée sur l'inventaire du jeu
  hotbar.inventory = game.inventory;
  hotbar.build();
  game.inventory.onChange = () => hotbar.update();

  function refreshHUD() {
    hud.update({
      name: appearance.name,
      playerCount: game.otherPlayers.length + 1,
    });
  }
  refreshHUD();
  setInterval(refreshHUD, 500);

  window.__game = game;
}

boot();
