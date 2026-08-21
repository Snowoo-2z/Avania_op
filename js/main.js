// ============================================================
//  AVANIA — Point d'entrée
//  1. Affiche l'écran de création de personnage.
//  2. Lance le jeu dans le village.
// ============================================================

import { Game } from './game.js';
import { openCharacterCreation, HUD } from './ui.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// Ajuste le canvas à la taille de la fenêtre (et au pixel ratio)
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

async function boot() {
  // 1. Création du personnage
  const appearance = await openCharacterCreation();

  // 2. Lancement du jeu
  const game = new Game(canvas, appearance);
  game.start();
  hud.show();

  // HUD : nom + monnaie + compteur de joueurs (préparé pour le multijoueur)
  function refreshHUD() {
    hud.update({
      name: appearance.name,
      money: game.money,
      playerCount: game.otherPlayers.length + 1,
    });
  }
  refreshHUD();
  setInterval(refreshHUD, 500);

  // garde une référence pour le débogage
  window.__game = game;
}

boot();
