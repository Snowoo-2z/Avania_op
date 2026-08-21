// ============================================================
//  AVANIA — Point d'entrée
//  1. Écran de création du personnage.
//  2. Monde vide à bâtir : collecte de blocs + inventaire + fabrication.
// ============================================================

import { Game } from './game.js';
import { PERFORMANCE } from './config.js';
import {
  openCharacterCreation, HUD, Hotbar, InventoryPanel, Crafting,
} from './ui.js';
import { isLowPowerDevice } from './utils.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
const lowPowerDevice = isLowPowerDevice();
document.documentElement.classList.toggle('low-power', lowPowerDevice);

function targetDpr() {
  const nativeDpr = window.devicePixelRatio || 1;
  const forceLowPower = document.documentElement.classList.contains('low-power');
  const cap = (lowPowerDevice || forceLowPower)
    ? PERFORMANCE.LOW_POWER_MAX_DPR
    : PERFORMANCE.MAX_DPR;
  return Math.min(nativeDpr, cap);
}

function resize() {
  const dpr = targetDpr();
  canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
  canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
}
window.addEventListener('resize', resize, { passive: true });
resize();

const hud = new HUD(document.getElementById('hud'));
const hotbar = new Hotbar(document.getElementById('hotbar'), null); // branché après le lancement

async function boot() {
  // 1. Création du personnage
  const appearance = await openCharacterCreation();

  // 2. Lancement du jeu
  const game = new Game(canvas, appearance);
  game.start();
  hud.show();
  document.getElementById('controls-hint').classList.remove('hidden');
  document.getElementById('inventory-btn').classList.remove('hidden');
  document.getElementById('craft-btn').classList.remove('hidden');

  // 3. Barre rapide, inventaire complet et fabrication branchés sur
  // l'inventaire réel du jeu.
  hotbar.attach(game.inventory);

  let inventoryPanel;
  let crafting;
  const syncPause = () => game.setPaused(Boolean(inventoryPanel?.isOpen || crafting?.isOpen));

  inventoryPanel = new InventoryPanel(
    document.getElementById('inventory-panel'),
    document.getElementById('inventory-grid'),
    document.getElementById('inventory-hotbar'),
    game.inventory,
    (open) => {
      if (open && crafting?.isOpen) crafting.close();
      syncPause();
    },
  );
  crafting = new Crafting(
    document.getElementById('crafting'),
    document.getElementById('craft-list'),
    game.inventory,
    (open) => {
      if (open && inventoryPanel?.isOpen) inventoryPanel.close();
      syncPause();
    },
  );

  document.getElementById('inventory-btn').onclick = () => inventoryPanel.toggle();
  document.getElementById('inventory-close').onclick = () => inventoryPanel.close();
  document.getElementById('craft-btn').onclick = () => crafting.toggle();
  document.getElementById('craft-close').onclick = () => crafting.close();
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const key = e.key.toLowerCase();
    if (key === 'e') {
      e.preventDefault();
      inventoryPanel.toggle();
    } else if (key === 'c') {
      e.preventDefault();
      crafting.toggle();
    } else if (key === 'escape') {
      inventoryPanel.close();
      crafting.close();
    }
  });

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
