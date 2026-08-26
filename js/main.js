// ============================================================
//  AVANIA — Point d'entrée
//  1. Écran de création du personnage (chargé en premier,
//     indépendamment du jeu, pour que le bouton « Entrer »
//     marche même si un module plus tardif échoue).
//  2. Monde vide à bâtir : collecte de blocs + inventaire + fabrication.
// ============================================================

import { PERFORMANCE, TILE } from './config.js';
import {
  openCharacterCreation, HUD, WalletHUD, Hotbar, InventoryPanel, Crafting,
  FurnacePanel, ChestPanel,
} from './ui.js';
import { SlotManager } from './slots.js';
import { initIcons } from './icons.js';
import { isLowPowerDevice } from './utils.js';
import { Settings } from './settings.js';
import { mountIcons } from './svgicons.js';
import { bindings, triggerFromKey, triggerFromMouse } from './keys.js';
import { Wallet, CURRENCY } from './economy.js';
import { IntroSequence } from './intro.js';
import { ChatPanel } from './chat.js';
import { ITEM_DEFS } from './blocks.js';
import { MERCHANTS, createMerchantState } from './merchant.js';
import {
  askMerchant, greetMerchant, interpretCommands, resetNegotiation,
} from './merchant-ai.js';
import { drawMaskMerchant, drawArmorMerchant } from './npc/index.js';

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
// Redimensionner le canvas réalloue tout son bitmap : pendant un
// redimensionnement de fenêtre, le navigateur envoie des dizaines
// d'événements « resize » par seconde. On regroupe donc tout sur une
// seule frame (rAF) : une réallocation au lieu de trente.
let resizeScheduled = false;
function scheduleResize() {
  if (resizeScheduled) return;
  resizeScheduled = true;
  requestAnimationFrame(() => {
    resizeScheduled = false;
    resize();
  });
}
window.addEventListener('resize', scheduleResize, { passive: true });
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
  'Astuce : 8 planches → un coffre pour ranger tes affaires.',
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
  let closeTutorial = () => {
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

  // L'arrivée du représentant se joue une seule fois, après le tutoriel :
  // c'est la première chose que le joueur voit du monde.
  //
  // NB : ce lancement est câblé plus bas, une fois `intro` construit.
  // L'appeler ici planterait pour un joueur qui revient (tutoriel déjà
  // vu) : `const intro` est déclaré après, donc encore en zone morte
  // temporelle à ce moment-là.

  // Interactions de cases façon Minecraft, partagées par la barre rapide,
  // l'inventaire et l'établi (pile flottante + infobulle).
  const slotManager = new SlotManager(game.inventory, {
    cursorEl: document.getElementById('cursor-stack'),
    tooltipEl: document.getElementById('slot-tooltip'),
    isPanelOpen: () => Boolean(inventoryPanel?.isOpen || crafting?.isOpen || furnacePanel?.isOpen || chestPanel?.isOpen),
    // Sortir une pile de l'inventaire la fait tomber dans le monde.
    onDropCursor: (stack) => game.spawnDropAtPlayer(stack.id, stack.count),
  });
  slotManager.attach();

  hotbar.attach(game.inventory, slotManager);

  let inventoryPanel;
  let crafting;
  let furnacePanel;
  let chestPanel;
  let merchantChat;
  const syncPause = () => game.setPaused(Boolean(
    inventoryPanel?.isOpen || crafting?.isOpen || furnacePanel?.isOpen
    || chestPanel?.isOpen || merchantChat?.isOpen || settings?.isOpen,
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
  chestPanel = new ChestPanel(
    document.getElementById('chest'),
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
  // Clic droit sur un four / un coffre posé → ouvre son panneau.
  game.uiCallbacks.openFurnace = (tx, ty) => furnacePanel.open(tx, ty);
  game.uiCallbacks.openChest = (tx, ty) => chestPanel.open(tx, ty);

  // ============================================================
  //  Monnaie, arrivée sur l'île, grotte et marchands
  // ============================================================

  const wallet = new Wallet();
  const walletHUD = new WalletHUD(document.getElementById('hud-right'), wallet);
  walletHUD.show();
  walletHUD.setGear(game.gear);

  // --- Les deux marchands. Leur ÉTAT survit aux allées et venues dans
  //     la grotte : ce qu'ils ont vendu, leur humeur et leur patience
  //     sont mémorisés pour toute la partie. ---
  const merchantStates = {
    gaspard: createMerchantState('gaspard', { day: wallet.day, totalPlayers: 1 }),
    aldric: createMerchantState('aldric', { day: wallet.day, totalPlayers: 1 }),
  };
  merchantStates.gaspard.seed = 9137;
  merchantStates.aldric.seed = 4421;

  function makeMerchantNpc(id, spot) {
    const def = MERCHANTS[id];
    return {
      kind: def.kind,
      name: def.name,
      title: def.title,
      x: spot.x,
      y: spot.y,
      facing: spot.facing,
      walkPhase: 0,
      moving: false,
      scale: 1,
      talkable: true,
      showHint: true,
      time: 0,
      sortY: spot.y,
      state: merchantStates[id],
      draw: id === 'gaspard' ? drawMaskMerchant : drawArmorMerchant,
    };
  }

  // Les marchands attendent à l'entrée de la grotte : sur le parvis, de
  // part et d'autre de l'arche, et dans le hall du niveau 1. Chaque monde
  // réserve ses emplacements (world.merchantSpots) ; on ne garde que ceux
  // du monde courant, mais l'état de négociation est partagé — c'est le
  // même homme, qu'on lui parle dehors ou dedans.
  function syncMerchants(world) {
    for (const npc of [...game.npcs]) {
      if (npc.kind === 'merchantMask' || npc.kind === 'merchantArmor') game.removeNpc(npc);
    }
    const spots = (world && world.merchantSpots) || [];
    if (spots[0]) game.addNpc(makeMerchantNpc('gaspard', spots[0]));
    if (spots[1]) game.addNpc(makeMerchantNpc('aldric', spots[1]));
  }

  // --- Comptoir de négociation ---
  merchantChat = new ChatPanel(document.getElementById('merchant-chat'), {
    onOpenChange: () => syncPause(),
    onSend: async (npc, text, history) => askMerchant({
      state: npc.state,
      message: text,
      history,
      defs: ITEM_DEFS,
      now: game.time,
    }),
    onBuy: (npc, offer) => {
      const def = ITEM_DEFS[offer.item] || {};
      if (!game.inventory.canAdd(offer.item, 1)) {
        game.notify('Inventaire plein : faites de la place.');
        return false;
      }
      if (!wallet.spend(offer.price, `Achat : ${def.label || offer.item}`)) {
        game.notify(`Il vous manque ${offer.price - wallet.money} écus.`);
        return false;
      }
      game.inventory.add(offer.item, 1);
      // Le marchand encaisse : sa mémoire de vendeur s'enrichit, ce qui
      // nourrira ses prochaines répliques.
      npc.state.sales.push({ item: offer.item, price: offer.price, day: npc.state.day });
      npc.state.soldCount += 1;
      npc.state.discussing = null;
      npc.state.currentPrice = null;
      npc.state.patienceLeft = Math.min(
        MERCHANTS[npc.state.id].patience, npc.state.patienceLeft + 2,
      );
      game.notify(`${def.label || offer.item} acheté — ${offer.price} écus.`);
      return true;
    },
  });
  merchantChat.nowFn = () => game.time;
  merchantChat.canAfford = (price) => wallet.canAfford(price);
  merchantChat.interpret = (reply, npc) => {
    const parsed = interpretCommands(reply, npc.state, ITEM_DEFS);
    if (parsed.kicked) {
      // Il met le joueur dehors : plus de discussion possible pendant
      // le temps de refroidissement du marchand.
      npc.state.cooldownUntil = game.time + (MERCHANTS[npc.state.id].cooldown || 45);
      npc.state.patienceLeft = 0;
      game.notify(`${npc.name} ne veut plus vous parler.`);
    }
    return parsed;
  };

  function openMerchantChat(npc) {
    const state = npc.state;
    const cooldownLeft = state.cooldownUntil ? state.cooldownUntil - game.time : 0;
    if (cooldownLeft > 0) {
      game.notify(`${npc.name} vous ignore encore ${Math.ceil(cooldownLeft)} s.`);
      return;
    }
    if (state.patienceLeft <= 0) resetNegotiation(state);
    merchantChat.open(npc);
    merchantChat.updateStatus();
    if (!merchantChat.el.log.children.length) {
      const greeting = greetMerchant(state, ITEM_DEFS, game.time);
      if (greeting.text) merchantChat.applyReply(greeting);
    }
    syncPause();
  }

  // --- Rappels du moteur de jeu ---
  game.uiCallbacks.onTalk = (npc) => openMerchantChat(npc);
  game.uiCallbacks.onGearChange = (gear) => walletHUD.setGear(gear);
  game.uiCallbacks.onEnterCave = (world) => {
    syncMerchants(world);
    walletHUD.setDepth(world);
  };
  game.uiCallbacks.onExitCave = (world) => {
    syncMerchants(world);
    walletHUD.setDepth(world);
  };
  game.uiCallbacks.onDescend = (world) => {
    syncMerchants(world);
    walletHUD.setDepth(world);
    if (merchantChat.isOpen) merchantChat.close();
  };
  // Le parvis de la surface a aussi ses marchands : on les place dès le
  // démarrage, sans attendre un aller-retour dans la grotte.
  syncMerchants(game.world);

  // --- Invite d'interaction : suit la cible dans le monde ---
  const promptEl = document.getElementById('interact-prompt');
  const promptLabel = document.getElementById('interact-label');
  const promptKey = document.getElementById('interact-key');
  const interactKeyName = () => {
    const trigger = bindings.interact || 'key:f';
    const key = trigger.split(':')[1] || 'f';
    return key.length === 1 ? key.toUpperCase() : key;
  };
  let lastPromptX = -1;
  let lastPromptY = -1;
  let lastPromptLabel = '';
  function updateInteractPrompt() {
    const target = game.interactTarget;
    if (!target || game.paused || game.cutscene) {
      if (lastPromptLabel !== '') {
        promptEl.classList.add('hidden');
        lastPromptLabel = '';
        lastPromptX = lastPromptY = -1;
      }
      return;
    }
    if (target.label !== lastPromptLabel) {
      lastPromptLabel = target.label;
      promptLabel.textContent = target.label;
      promptKey.textContent = interactKeyName();
      promptEl.classList.remove('hidden');
    }
    const zoom = game.camera.zoom;
    const wx = target.npc ? target.npc.x : (game.targetTx + 0.5) * TILE;
    const wy = target.npc ? target.npc.y - 30 : game.targetTy * TILE;
    const sx = Math.round((wx - game.camera.x) * zoom);
    const sy = Math.round((wy - game.camera.y) * zoom);
    // On ne touche au DOM que si la position a vraiment bougé.
    if (sx !== lastPromptX || sy !== lastPromptY) {
      lastPromptX = sx;
      lastPromptY = sy;
      promptEl.style.left = `${sx}px`;
      promptEl.style.top = `${sy}px`;
    }
  }
  // --- Cinématique d'arrivée : le représentant de l'île ---
  const intro = new IntroSequence(game, wallet, {
    root: document.getElementById('dialog'),
    speaker: document.getElementById('dialog-speaker'),
    text: document.getElementById('dialog-text'),
    portrait: document.getElementById('dialog-portrait'),
    hint: document.getElementById('dialog-hint'),
    skip: document.getElementById('dialog-skip'),
  });
  intro.onFinish = () => {
    syncPause();
    walletHUD.setMoney(wallet.money, 0);
  };

  // La boucle de jeu pilote la scène, puis l'invite d'interaction.
  //
  // intro.update(dt) est indispensable : sans lui le représentant reste
  // figé, finish() n'est jamais atteint et game.cutscene reste vrai pour
  // toujours — le joueur serait gelé défensitivement après la scène.
  // (test/browser-boot.mjs vérifie qu'il finit bien par partir.)
  game.uiCallbacks.onFrameEnd = (dt) => {
    if (intro.active) intro.update(dt);
    updateInteractPrompt();
  };

  // L'arrivée du représentant se joue une seule fois, après le tutoriel :
  // c'est la première chose que le joueur voit du monde.
  if (!IntroSequence.alreadySeen()) {
    if (tutorialSeen) {
      intro.start();
    } else {
      const previousClose = closeTutorial;
      closeTutorial = () => { previousClose(); intro.start(); };
      document.getElementById('tutorial-start').onclick = closeTutorial;
      document.getElementById('tutorial-close').onclick = closeTutorial;
    }
  }


  document.getElementById('inventory-close').onclick = () => inventoryPanel.close();
  document.getElementById('craft-btn').onclick = () => crafting.toggle();
  document.getElementById('craft-close').onclick = () => crafting.close();
  document.getElementById('furnace-close').onclick = () => furnacePanel.close();
  document.getElementById('chest-close').onclick = () => chestPanel.close();
  // Dispatch des actions d'interface (rebindables) : clavier ET souris.
  const handlePanelTrigger = (e, t) => {
    let acted = false;
    if (bindings.inventory === t) {
      e.preventDefault();
      if (furnacePanel.isOpen) furnacePanel.close();
      else if (chestPanel.isOpen) chestPanel.close();
      else inventoryPanel.toggle();
      acted = true;
    } else if (bindings.craft === t) {
      e.preventDefault();
      if (furnacePanel.isOpen) furnacePanel.close();
      else if (chestPanel.isOpen) chestPanel.close();
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
      if (chestPanel.isOpen) chestPanel.close();
      settings.toggle();
      acted = true;
    }
    if (acted) syncPause();
  };
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if ((e.key || '').toLowerCase() === 'escape') {
      if (merchantChat.isOpen) { merchantChat.close(); syncPause(); return; }
      if (settings.isOpen) { settings.close(); syncPause(); return; }
      if (intro.active) { intro.skip(); return; }
      inventoryPanel.close();
      crafting.close();
      furnacePanel.close();
      chestPanel.close();
      if (tutorial.isOpen) closeTutorial();
      syncPause();
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

  // Le HUD est rafraîchi à 2 Hz, mais on n'écrit dans le DOM que lorsque
  // la valeur a changé : deux textContent par demi-seconde suffisent à
  // déclencher un recalcul de style pour rien sur les petites configs.
  let lastHudName = null;
  let lastHudPlayers = null;
  function refreshHUD() {
    const name = appearance.name;
    const playerCount = game.otherPlayers.length + 1;
    if (name !== lastHudName || playerCount !== lastHudPlayers) {
      lastHudName = name;
      lastHudPlayers = playerCount;
      hud.update({ name, playerCount });
    }
    walletHUD.setMoney(wallet.money, 0);
    walletHUD.setDepth(game.world);
  }
  refreshHUD();
  setInterval(refreshHUD, 500);

  window.__game = game;
}

boot().catch((err) => {
  console.error('AVANIA: démarrage', err);
  showBootError(err);
});
