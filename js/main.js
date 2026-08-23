// ============================================================
//  AVANIA — Point d'entrée
//  1. Écran de création du personnage (chargé en premier,
//     indépendamment du jeu, pour que le bouton « Entrer »
//     marche même si un module plus tardif échoue).
//  2. Monde vide à bâtir : collecte de blocs + inventaire + fabrication.
// ============================================================

import { PERFORMANCE } from './config.js';
import {
  openCharacterCreation, HUD, Hotbar, InventoryPanel, Crafting, FurnacePanel,
} from './ui.js';
import { SlotManager } from './slots.js';
import { initIcons } from './icons.js';
import { isLowPowerDevice } from './utils.js';
import { Settings } from './settings.js';
import { mountIcons } from './svgicons.js';
import { bindings, triggerFromKey, triggerFromMouse } from './keys.js';

// Remplace tous les emojis de l'interface par de vraies icônes SVG.
try { mountIcons(); } catch (err) { console.error('AVANIA: icônes SVG', err); }

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

// --- Écran de chargement animé ---
const loadingScreen    = document.getElementById('loading-screen');
const loadingMessage   = document.getElementById('loading-message');
const loadingBarFill   = document.getElementById('loading-bar-fill');
const loadingHint      = document.querySelector('.loading-hint');

const LOADING_TIPS = [
  'Astuce : casse les arbres pour récolter du bois !',
  'Astuce : fabrique une pioche pour miner la pierre.',
  'Astuce : pose des blocs au clic droit.',
  'Astuce : touche E pour ouvrir l\'inventaire.',
  'Astuce : touche C pour l\'établi de craft.',
  'Astuce : le fer est rare — cherche bien !',
  'Astuce : les moutons donnent de la laine.',
  'Astuce : construis un four pour fondre le fer.',
  'Astuce : touche Q pour lâcher un objet au sol.',
  'Astuce : les portes bloquent le passage une fois fermées.',
];

function showLoading() {
  loadingScreen.classList.remove('hidden', 'fade-out');
  if (loadingHint) {
    loadingHint.textContent = LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)];
  }
}

function setLoadingProgress(pct, msg) {
  if (loadingBarFill) loadingBarFill.style.width = `${Math.min(100, pct)}%`;
  if (loadingMessage && msg) loadingMessage.textContent = msg;
}

function hideLoading() {
  return new Promise((resolve) => {
    setLoadingProgress(100, 'C\'est parti !');
    // Petit délai pour que le 100 % soit visible, puis fade-out.
    setTimeout(() => {
      loadingScreen.classList.add('fade-out');
      loadingScreen.addEventListener('animationend', () => {
        loadingScreen.classList.add('hidden');
        resolve();
      }, { once: true });
      // Filet de sécurité si l'animation ne se déclenche pas.
      setTimeout(() => {
        loadingScreen.classList.add('hidden');
        resolve();
      }, 600);
    }, 250);
  });
}

// Un petit yield pour que le navigateur peigne les changements d'UI.
function yieldFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

async function boot() {
  // 0. Icônes : on ne bloque jamais l'écran de création si ça échoue.
  try { initIcons(); } catch (err) { console.error('AVANIA: icônes', err); }

  // 1. Création du personnage — toujours en premier.
  const appearance = await openCharacterCreation();

  // 2. Affiche l'écran de chargement animé pendant l'initialisation.
  showLoading();
  setLoadingProgress(5, 'Chargement des modules…');
  await yieldFrame();

  // 3. Le monde et le tutoriel sont chargés seulement après le bouton
  //    « Entrer », pour qu'une erreur de jeu ne casse plus le créateur.
  const [{ Game }, { Tutorial }] = await Promise.all([
    import('./game.js'),
    import('./tutorial.js'),
  ]);

  setLoadingProgress(20, 'Préparation des textures…');
  await yieldFrame();

  // Les paramètres sont créés AVANT le Game : le jeu les lit chaque frame
  // (zoom, vignette, particules) et applique aussitôt les changements.
  const settings = new Settings();

  setLoadingProgress(30, 'Génération du monde…');
  await yieldFrame();

  const game = new Game(canvas, appearance, settings);

  setLoadingProgress(75, 'Plantation des arbres…');
  await yieldFrame();

  // Petit temps pour que les chunks finissent de se pré-construire.
  setLoadingProgress(85, 'Préparation de la vue…');
  await yieldFrame();

  setLoadingProgress(95, 'Presque prêt…');
  await yieldFrame();

  // Fait disparaître l'écran de chargement avec un beau fade-out.
  await hideLoading();

  game.start();
  hud.show();
  document.getElementById('controls-hint').classList.remove('hidden');
  document.getElementById('craft-btn').classList.remove('hidden');

  document.getElementById('settings-btn').classList.remove('hidden');
  document.getElementById('settings-btn').onclick = () => {
    settings.toggle();
    syncPause();
  };

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

  // Interactions de cases façon Minecraft, partagées par la barre rapide,
  // l'inventaire et l'établi (pile flottante + infobulle).
  const slotManager = new SlotManager(game.inventory, {
    cursorEl: document.getElementById('cursor-stack'),
    tooltipEl: document.getElementById('slot-tooltip'),
    isPanelOpen: () => Boolean(inventoryPanel?.isOpen || crafting?.isOpen || furnacePanel?.isOpen),
    // Sortir une pile de l'inventaire la fait tomber dans le monde.
    onDropCursor: (stack) => game.spawnDropAtPlayer(stack.id, stack.count),
  });
  slotManager.attach();

  hotbar.attach(game.inventory, slotManager);

  let inventoryPanel;
  let crafting;
  let furnacePanel;
  const syncPause = () => game.setPaused(Boolean(
    inventoryPanel?.isOpen || crafting?.isOpen || furnacePanel?.isOpen || settings?.isOpen,
  ));
  // Fermer les paramètres (croix, fond, Échap) doit aussi dé-pauser le jeu.
  settings.onToggle = syncPause;

  inventoryPanel = new InventoryPanel(
    document.getElementById('inventory-panel'),
    game.inventory,
    appearance,
    slotManager,
    (open) => {
      if (open && crafting?.isOpen) crafting.close();
      syncPause();
    },
  );
  crafting = new Crafting(
    document.getElementById('crafting'),
    game.inventory,
    slotManager,
    (open) => {
      if (open && inventoryPanel?.isOpen) inventoryPanel.close();
      syncPause();
    },
  );
  furnacePanel = new FurnacePanel(
    document.getElementById('furnace'),
    game.inventory,
    slotManager,
    game,
    (open) => {
      if (open) {
        if (inventoryPanel?.isOpen) inventoryPanel.close();
        if (crafting?.isOpen) crafting.close();
      }
      syncPause();
    },
  );
  // Clic droit sur un four posé → ouvre son panneau.
  game.uiCallbacks.openFurnace = (tx, ty) => furnacePanel.open(tx, ty);

  document.getElementById('inventory-close').onclick = () => inventoryPanel.close();
  document.getElementById('craft-btn').onclick = () => crafting.toggle();
  document.getElementById('craft-close').onclick = () => crafting.close();
  document.getElementById('furnace-close').onclick = () => furnacePanel.close();
  // Dispatch des actions d'interface (rebindables) : clavier ET souris.
  const handlePanelTrigger = (e, t) => {
    let acted = false;
    if (bindings.inventory === t) {
      e.preventDefault();
      if (furnacePanel.isOpen) furnacePanel.close();
      else inventoryPanel.toggle();
      acted = true;
    } else if (bindings.craft === t) {
      e.preventDefault();
      if (furnacePanel.isOpen) furnacePanel.close();
      else crafting.toggle();
      acted = true;
    } else if (bindings.sort === t && inventoryPanel.isOpen) {
      e.preventDefault();
      game.inventory.sortInventory();
      inventoryPanel.toast('Inventaire trié !');
    } else if (bindings.settings === t) {
      e.preventDefault();
      if (inventoryPanel.isOpen) inventoryPanel.close();
      if (crafting.isOpen) crafting.close();
      if (furnacePanel.isOpen) furnacePanel.close();
      settings.toggle();
      acted = true;
    }
    if (acted) syncPause();
  };
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if ((e.key || '').toLowerCase() === 'escape') {
      if (settings.isOpen) { settings.close(); syncPause(); }
      else {
        inventoryPanel.close();
        crafting.close();
        furnacePanel.close();
        if (tutorial.isOpen) closeTutorial();
      }
      return;
    }
    const t = triggerFromKey(e);
    if (t) handlePanelTrigger(e, t);
  });
  // Actions d'interface bindées à la souris (ex. Inventaire sur un clic).
  window.addEventListener('mousedown', (e) => {
    if (e.target && e.target.tagName === 'CANVAS') return; // clic de jeu
    const t = triggerFromMouse(e);
    handlePanelTrigger(e, t);
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
