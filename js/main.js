// ============================================================
//  AVANIA — Point d'entrée
//  1. Écran de création du personnage (chargé en premier,
//     indépendamment du jeu, pour que le bouton « Entrer »
//     marche même si un module plus tardif échoue).
//  2. Monde vide à bâtir : collecte de blocs + inventaire + fabrication.
// ============================================================

import { PERFORMANCE } from './config.js';
import {
  openCharacterCreation, HUD, Hotbar, InventoryPanel, Crafting,
} from './ui.js';
import { initIcons } from './icons.js';
import { isLowPowerDevice } from './utils.js';

function showBootError(err) {
  const el = document.getElementById('boot-error');
  if (!el) return;
  el.textContent = `Avania n'a pas pu démarrer : ${err?.message || err}`;
  el.classList.add('visible');
}

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true })
  || canvas.getContext('2d', { alpha: false })
  || canvas.getContext('2d');
if (!ctx) showBootError(new Error('Canvas 2D indisponible'));
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
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
}
window.addEventListener('resize', resize, { passive: true });
resize();

const hud = new HUD(document.getElementById('hud'));
const hotbar = new Hotbar(document.getElementById('hotbar'), null);

async function boot() {
  // 0. Icônes : on ne bloque jamais l'écran de création si ça échoue.
  try { initIcons(); } catch (err) { console.error('AVANIA: icônes', err); }

  // 1. Création du personnage — toujours en premier.
  const appearance = await openCharacterCreation();

  // 2. Le monde et le tutoriel sont chargés seulement après le bouton
  //    « Entrer », pour qu'une erreur de jeu ne casse plus le créateur.
  const [{ Game }, { Tutorial }] = await Promise.all([
    import('./game.js'),
    import('./tutorial.js'),
  ]);

  const game = new Game(canvas, appearance);
  game.start();
  hud.show();
  document.getElementById('controls-hint').classList.remove('hidden');
  document.getElementById('craft-btn').classList.remove('hidden');

  const tutorial = new Tutorial(appearance);
  const closeTutorial = () => {
    tutorial.hide();
    game.setPaused(false);
  };
  document.getElementById('tutorial-start').onclick = closeTutorial;
  document.getElementById('tutorial-close').onclick = closeTutorial;

  let tutorialSeen = false;
  try { tutorialSeen = localStorage.getItem('avania.tutoriel') === '1'; } catch { /* ignore */ }
  if (!tutorialSeen) {
    tutorial.show();
    game.setPaused(true);
    try { localStorage.setItem('avania.tutoriel', '1'); } catch { /* ignore */ }
  }

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
      if (tutorial.isOpen) closeTutorial();
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

boot().catch((err) => {
  console.error('AVANIA: démarrage', err);
  showBootError(err);
});
