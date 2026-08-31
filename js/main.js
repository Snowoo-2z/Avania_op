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
  FurnacePanel, ChestPanel, SignEditor, SellerPanel, StealGame, playAlarm,
  HealthHUD, HungerHUD,
} from './ui.js';
import { SlotManager } from './slots.js';
import { initIcons } from './icons.js';
import { isLowPowerDevice } from './utils.js';
import { Settings } from './settings.js';
import { mountIcons } from './svgicons.js';
import { bindings, triggerFromKey, triggerFromMouse } from './keys.js';
import { Wallet, CURRENCY } from './economy.js';
// L'objet « pièce » qui matérialise la monnaie dans l'inventaire.
import { MONEY_ITEM } from './blocks.js';
import { IntroSequence } from './intro.js';
import { ChatPanel } from './chat.js';
// Communication (multijoueur) : la fenêtre de chat (canal global +
// talkie-walkie) et le téléphone avec son réseau social.
import { GlobalChat } from './chat-global.js';
import { PhonePanel, SocialClient } from './phone.js';
import { CHAT_PROXIMITY } from './net-protocol.js';
import { ITEM_DEFS } from './blocks.js';
import { MERCHANTS, createMerchantState } from './merchant.js';
import {
  askMerchant, greetMerchant, interpretCommands, resetNegotiation,
} from './merchant-ai.js';
import { drawMaskMerchant, drawArmorMerchant } from './npc/index.js';
import { MultiplayerClient } from './net.js';

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
// Barre de vie : au-dessus de la barre rapide, mise à jour à chaque frame
// (voir le rappel onFrameEnd plus bas) — les PV régénèrent en continu.
const healthHUD = new HealthHUD(document.getElementById('health-hud'));
// Jauge de faim : empilée au-dessus de la barre de vie, même mécanique.
const hungerHUD = new HungerHUD(document.getElementById('hunger-hud'), {
  fillId: 'hunger-fill',
  textId: 'hunger-text',
});

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

  // Sprite du ferry : le SVG du port remplace le repli procédural dès
  // qu'il est chargé. Facultatif — en cas d'échec le jeu garde le repli.
  try {
    const { loadBoatSprite } = await import('./tileset.js');
    await loadBoatSprite();
  } catch (err) {
    console.warn('AVANIA: sprite du ferry indisponible', err);
  }

  // Déclarés AVANT le client réseau : il peut recevoir un message
  // ('chatHistory', 'social') pendant les `await` du démarrage, donc
  // avant que les objets d'interface soient construits. Une déclaration
  // plus bas les laisserait en zone morte temporelle à ce moment-là.
  let globalChat;
  let phonePanel;

  // --- Multijoueur (présence temps réel) ---
  // « Best effort » : si le serveur ne répond pas (hors ligne, en
  // train de se réveiller sur Render...), le jeu continue en solo.
  // Le tableau `players` du client réseau change de référence à chaque
  // arrivée/départ (voir _rebuildPlayers) : on le republie sur
  // game.otherPlayers à chaque frame plutôt qu'une seule fois au démarrage.
  const multiplayer = new MultiplayerClient({
    name: appearance.name,
    appearance,
    zone: game.world.id,
    // Étape 2 (monde partagé) : un autre joueur a modifié une tuile
    // (message 'block') ou on vient de rejoindre une zone déjà
    // modifiée par d'autres (message 'worldSync', une rafale de
    // diffs). Dans les deux cas on retrouve le bon World.js par son
    // id de zone (peut être un niveau de grotte qu'on n'occupe pas
    // activement : applyRemoteBlockDiff se charge de ne toucher les
    // index de rendu que si c'est la zone affichée à l'écran).
    onBlockChange: (zone, tx, ty, diff) => {
      game.applyRemoteBlockDiff(game.worldForZone(zone), tx, ty, diff);
    },
    onWorldSync: (zone, diffs) => {
      const world = game.worldForZone(zone);
      if (!world) return; // zone jamais visitée localement : rien à appliquer pour l'instant
      for (const d of diffs) game.applyRemoteBlockDiff(world, d.tx, d.ty, d.diff);
    },
    // Étape 3 (coffres partagés) : même logique, mais un coffre entier
    // remplace l'ancien plutôt qu'un diff partiel (voir js/game.js
    // applyRemoteChestChange et js/net-protocol.js sanitizeChestSlots).
    onChestChange: (zone, tx, ty, slots) => {
      game.applyRemoteChestChange(zone, tx, ty, slots);
    },
    onChestSync: (zone, chests) => {
      for (const c of chests) game.applyRemoteChestChange(zone, c.tx, c.ty, c.slots);
    },
    // Étape 4 (fours partagés) : même logique que les coffres, avec un
    // état de four complet (voir js/game.js applyRemoteFurnaceChange et
    // js/net-protocol.js sanitizeFurnaceState).
    onFurnaceChange: (zone, tx, ty, state) => {
      game.applyRemoteFurnaceChange(zone, tx, ty, state);
    },
    onFurnaceSync: (zone, furnaces) => {
      for (const f of furnaces) game.applyRemoteFurnaceChange(zone, f.tx, f.ty, f.state);
    },
    // Panneaux partagés : texte + propriétaire, posés/écrits/cassés ailleurs.
    onSignChange: (zone, tx, ty, text, owner) => {
      game.applyRemoteSignChange(zone, tx, ty, text, owner);
    },
    onSignSync: (zone, signs) => game.applySignSync(zone, signs),
    // Étals partagés : état complet (stock/prix/cagnotte) ou null = cassé.
    onSellerChange: (zone, tx, ty, state) => {
      game.applyRemoteSellerChange(zone, tx, ty, state);
    },
    onSellerSync: (zone, sellers) => game.applySellerSync(zone, sellers),
    // Objets au sol partagés (butin de PvP, lâcher volontaire).
    onDropSpawn: (zone, drops) => game.applyRemoteDrops(zone, drops),
    onDropTaken: (zone, netId) => game.removeRemoteDrop(zone, netId),
    // Message ciblé : tentative de vol (toast) ou alarme (téléport proposé).
    onNotify: (payload) => handleSellerNotify(payload),
    // PvP : coup reçu → j'applique ; PV distants → barre de vie.
    onPlayerAttack: (from, dmg) => game.applyPlayerAttack(from, dmg),
    onPlayerHp: (id, hp) => {
      const r = multiplayer.players.find((p) => p.id === id);
      if (r) { r.hp = hp; r.maxHp = 20; }
    },
    // Étape 5 (animaux partagés) : un troupeau connu (mobSync) peut
    // être vide — c'est le signal que ce client est probablement le
    // premier à visiter cette zone : il propose alors son propre
    // troupeau local (voir game.mobSnapshotForZone) pour que les
    // arrivants suivants héritent des mêmes bêtes.
    onMobSync: (zone, mobs) => {
      if (mobs.length === 0) {
        if (game.world.id === zone) multiplayer.sendMobSync(game.mobSnapshotForZone());
        return;
      }
      game.applyMobSync(zone, mobs);
    },
    onMobSpawn: (zone, mobs) => game.applyMobSpawn(zone, mobs),
    onMobState: (zone, mobs) => game.applyMobState(zone, mobs),
    onMobHit: (zone, mob) => game.applyMobHit(zone, mob),
    // Étape 6 (chat + réseau social) : voir les branchements plus bas
    // (globalChat / phonePanel sont construits après le client réseau).
    onChat: (msg) => {
      if (!globalChat) return;
      globalChat.push(msg);
      // Un message de proximité s'affiche aussi en bulle au-dessus de
      // celui qui parle : c'est ce qui le rend lisible sans quitter le
      // monde des yeux (réglable dans Paramètres → Communication).
      if (msg.channel === CHAT_PROXIMITY) game.showRemoteBubble(msg.id, msg.text);
    },
    onChatHistory: (messages) => {
      if (!globalChat) return;
      for (const msg of messages) globalChat.push(msg);
    },
    // Le fil du téléphone a bougé (quelqu'un a publié, aimé ou supprimé).
    onSocial: (payload) => phonePanel?.applySocial(payload),
  });
  game.otherPlayers = multiplayer.players;
  game.uiCallbacks.onZoneChange = (zone) => multiplayer.setZone(zone);
  game.uiCallbacks.onNetUpdate = (dt, localPlayer) => {
    multiplayer.update(dt, localPlayer);
    game.otherPlayers = multiplayer.players;
  };
  // LE JOUEUR LOCAL a cassé/posé un bloc ou basculé une porte : diffuse
  // aux autres joueurs de sa zone actuelle (best effort, comme le reste
  // du réseau — ne bloque jamais le jeu solo si la connexion est down).
  game.uiCallbacks.onBlockChange = (tx, ty, diff) => multiplayer.sendBlockChange(tx, ty, diff);
  // LE JOUEUR LOCAL a rangé/pioché un objet dans un coffre ouvert.
  game.uiCallbacks.onChestChange = (tx, ty, slots) => multiplayer.sendChestChange(tx, ty, slots);
  // LE JOUEUR LOCAL possède un four qui vient de changer (contenu, ou
  // battement périodique de cuisson — voir Game._maybeAnnounceFurnace).
  game.uiCallbacks.onFurnaceChange = (tx, ty, state) => multiplayer.sendFurnaceChange(tx, ty, state);
  // Étape 5 (animaux) : LE JOUEUR LOCAL vient de frapper un animal, et
  // le coordinateur de la zone (voir js/net.js isMobCoordinator) diffuse
  // périodiquement un correctif de position / gère la repop — voir
  // Game._maybeManageMobsNetwork pour le détail des deux rôles.
  game.uiCallbacks.onMobHit = (id, hp, alive) => multiplayer.sendMobHit(id, hp, alive);
  game.uiCallbacks.onMobRespawn = (mobs) => multiplayer.sendMobSpawn(mobs);
  game.uiCallbacks.onMobState = (mobs) => multiplayer.sendMobState(mobs);
  game.uiCallbacks.isMobCoordinator = () => multiplayer.isMobCoordinator();
  window.__multiplayer = multiplayer;

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
  healthHUD.show();
  hungerHUD.show();
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
  let signEditor;
  let sellerPanel;
  let stealGame;
  let merchantChat;
  // Le téléphone met le jeu en pause (comme les autres panneaux) : on y
  // écrit au clavier, donc le personnage ne doit pas partir se promener
  // pendant ce temps. Le CHAT, lui, ne pause jamais — on discute en
  // marchant, c'est tout l'intérêt du canal global.
  const syncPause = () => game.setPaused(Boolean(
    inventoryPanel?.isOpen || crafting?.isOpen || furnacePanel?.isOpen
    || chestPanel?.isOpen || signEditor?.isOpen || sellerPanel?.isOpen
    || merchantChat?.isOpen || settings?.isOpen || phonePanel?.isOpen,
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

  // Panneaux : seul le propriétaire écrit (le jeu vérifie entry.owner).
  signEditor = new SignEditor(
    document.getElementById('sign-edit'),
    game,
    () => syncPause(),
  );
  game.uiCallbacks.openSign = (tx, ty) => signEditor.open(tx, ty);
  // Identité locale pour la propriété des panneaux (-1 tant que non
  // connecté : en solo, on est toujours « soi-même »).
  game.uiCallbacks.getOwnerId = () => multiplayer.localId;
  // Diffusion des poses/écritures/casses de panneaux de la zone.
  game.uiCallbacks.onSignChange = (tx, ty, text, owner) => multiplayer.sendSignChange(tx, ty, text, owner);
  // Diffusion des changements d'étals (stock, prix, cagnotte, casse).
  game.uiCallbacks.onSellerChange = (tx, ty, state) => multiplayer.sendSellerChange(tx, ty, state);
  // L'offre d'un autre joueur vient d'arriver pendant que le panneau de
  // l'étal est ouvert : on réaffiche pour faire apparaître le bouton
  // d'achat sans fermer/rouvrir.
  game.uiCallbacks.onSellerUpdated = (tx, ty) => {
    if (sellerPanel && sellerPanel.isOpen && sellerPanel.tx === tx && sellerPanel.ty === ty) {
      sellerPanel.render();
    }
  };
  // Message ciblé vers le propriétaire d'un étal (tentative de vol/alarme).
  game.uiCallbacks.onNotifySend = (to, kind, text, extra) => multiplayer.sendNotify(to, kind, text, extra);
  // PvP : je déclare un coup porté (la victime applique) + j'annonce mes PV.
  game.uiCallbacks.onPlayerAttack = (id, dmg) => multiplayer.sendPlayerAttack(id, dmg);
  game.uiCallbacks.onPlayerHp = (hp) => multiplayer.sendPlayerHp(Math.round(hp));
  // Drops partagés : l'annonce (spawn) part groupée, le ramassage aussi.
  game.uiCallbacks.onDropsSend = (drops) => multiplayer.sendDrops(drops);
  game.uiCallbacks.onDropTakenSend = (netId) => multiplayer.sendDropTaken(netId);

  // ============================================================
  //  Communication : chat (global + proximité) et téléphone
  // ============================================================

  // Fenêtre de chat toujours visible. `onSend` renvoie true si le
  // message est réellement parti sur le réseau : la fenêtre l'affiche
  // dans tous les cas (en solo, on se parle à soi-même plutôt que de
  // voir son texte disparaître), mais sait alors qu'il faut le signaler.
  globalChat = new GlobalChat(document.getElementById('global-chat'), {
    onSend: (text, channel) => {
      const sent = multiplayer.sendChat(text, channel);
      // Notre propre message au talkie-walkie apparaît en bulle au-dessus
      // de notre personnage : le serveur ne nous le renvoie pas en écho.
      if (sent && channel === CHAT_PROXIMITY) game.showLocalBubble(text);
      return sent;
    },
  });
  // Emplacement de la fenêtre (Paramètres → Communication).
  const applyChatSide = (side) => {
    document.getElementById('global-chat')?.setAttribute('data-side', side === 'right' ? 'right' : 'left');
  };
  settings.onChatSide = applyChatSide;
  applyChatSide(settings.chatSide);

  // Téléphone : réseau social du village (comptes + publications partagés
  // par tous les joueurs, en direct via le WebSocket du jeu).
  const socialClient = new SocialClient();
  phonePanel = new PhonePanel(document.getElementById('phone'), {
    client: socialClient,
    onOpenChange: () => syncPause(),
  });
  window.__globalChat = globalChat;
  window.__phone = phonePanel;

  // ============================================================
  //  Monnaie, arrivée sur l'île, grotte et marchands
  // ============================================================

  // La monnaie vit DANS l'inventaire : une pile de pièces (l'objet
  // `coin` de js/blocks.js), le nombre affiché sur la case EST la somme.
  // Plus de compteur dans le HUD — la bourse se regarde comme le reste
  // du butin, et elle peut se lâcher au sol ou se ranger dans un coffre.
  const moneyStore = {
    count: () => game.inventory.count(MONEY_ITEM),
    // add renvoie le montant réellement entré (l'inventaire peut être
    // plein : l'argent est un objet, il lui faut une case).
    add: (n) => game.inventory.add(MONEY_ITEM, n),
    remove: (n) => game.inventory.remove(MONEY_ITEM, n),
  };
  const wallet = new Wallet({ store: moneyStore });
  window.__wallet = wallet;

  // ------------------------------------------------------------
  //  La somme de bienvenue est une RÈGLE D'ARRIVÉE, pas un accessoire de
  //  la cinématique. Le représentant ne se montre qu'une fois par
  //  navigateur (drapeau localStorage `avania.intro.v1`), alors que son
  //  argent, lui, est une pile d'objets dans l'inventaire — donc effacée à
  //  chaque session. Sans ce filet, un joueur qui revient prend le spawn
  //  avec 0 écu et de quoi n'acheter chez aucun marchand.
  //
  //  `grantStartingFunds()` (js/economy.js) est idempotente par arrivée :
  //  quand la scène doit se jouer, c'est elle qui paie et cet appel ne
  //  double jamais la somme. En revanche la mort NE re-paie pas — un
  //  respawn conserve l'inventaire, donc les pièces avec.
  // ------------------------------------------------------------
  function grantAtArrival() {
    const added = wallet.grantStartingFunds();
    if (added > 0 && game.notify) {
      game.notify(`Somme de bienvenue : + ${added} ${CURRENCY.plural.toLowerCase()} dans l'inventaire.`);
    }
    return added;
  }

  const walletHUD = new WalletHUD(document.getElementById('hud-right'));
  walletHUD.show();
  walletHUD.setGear(game.gear);

  // Étals de vente : achat, vol (mini-jeu) et gestion propriétaire.
  stealGame = new StealGame(document.getElementById('steal-game'));
  sellerPanel = new SellerPanel(
    document.getElementById('seller'), game, wallet, stealGame, () => syncPause(),
  );
  game.uiCallbacks.openSeller = (tx, ty) => sellerPanel.open(tx, ty);

  // Alarme d'étal niv. 3 : bannière + téléportation chez le propriétaire.
  let alarmTarget = null;
  const alarmBanner = document.getElementById('alarm-banner');
  const showAlarm = (payload) => {
    alarmTarget = { zone: payload.zone || 'surface', tx: payload.tx || 0, ty: payload.ty || 0 };
    document.getElementById('alarm-text').textContent = payload.text || 'Alarme !';
    alarmBanner.classList.remove('hidden');
    playAlarm();
  };
  document.getElementById('alarm-go')?.addEventListener('click', () => {
    if (alarmTarget) game.teleportToZone(alarmTarget.zone, alarmTarget.tx, alarmTarget.ty);
    alarmBanner.classList.add('hidden');
  });
  document.getElementById('alarm-ignore')?.addEventListener('click', () => {
    alarmBanner.classList.add('hidden');
  });
  function handleSellerNotify(payload) {
    if (payload.kind === 'alarm') { showAlarm(payload); return; }
    game.notify(payload.text || 'Quelque chose s\'est passé.');
  }

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
      // L'accueil (et l'offre d'ouverture) vient de l'IA quand elle est
      // configurée : greetMerchant est async, les petits points tiennent
      // la place le temps de la réplique.
      merchantChat.playGreeting(greetMerchant(state, ITEM_DEFS, game.time));
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
    // Filet : la scène appelle elle-même Wallet.grantStartingFunds() à la
    // réplique qui tend l'argent. Si quelque chose l'en a empêchée (scène
    // interrompue avant cette réplique), on solde la dette à la sortie de
    // la cinématique — la méthode ne paie qu'une fois par arrivée.
    grantAtArrival();
    // Pas de compteur d'argent à rafraîchir : la somme remise par le
    // représentant est déjà visible dans la barre rapide (pile de pièces).
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
    // Barres de vie et de faim : la régénération et le drainage sont
    // continus, on suit chaque frame. Les HUD ignorent les frames où la
    // valeur affichée n'a pas changé.
    healthHUD.setHp(game.player.hp, game.player.maxHp);
    hungerHUD.setHp(game.player.hunger, game.player.maxHunger);
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
  } else {
    // Le joueur a déjà rencontré le représentant dans ce navigateur : la
    // scène ne se rejoue PAS, mais la somme de bienvenue lui est quand même
    // due à cette arrivée (l'argent de la session précédente est parti avec
    // l'inventaire). C'est ici qu'il récupère ses 150 écus au spawn.
    grantAtArrival();
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
    } else if (bindings.phone === t) {
      // Téléphone (réseau social) : un seul panneau à la fois.
      e.preventDefault();
      if (!phonePanel.isOpen) {
        if (inventoryPanel.isOpen) inventoryPanel.close();
        if (crafting.isOpen) crafting.close();
        if (furnacePanel.isOpen) furnacePanel.close();
        if (chestPanel.isOpen) chestPanel.close();
        if (merchantChat.isOpen) merchantChat.close();
      }
      phonePanel.toggle();
      acted = true;
    } else if (bindings.proximityChat === t) {
      // Talkie-walkie : bascule le canal de la fenêtre de chat entre
      // « global » et « proximité ». On ne l'ouvre pas de force : le
      // joueur qui parle dans sa barbe ne doit pas se faire voler le
      // clavier (la fenêtre est de toute façon toujours visible).
      e.preventDefault();
      globalChat.toggleChannel();
      acted = true;
    }
    if (acted) syncPause();
  };
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if ((e.key || '').toLowerCase() === 'escape') {
      if (phonePanel.isOpen) { phonePanel.close(); syncPause(); return; }
      if (merchantChat.isOpen) { merchantChat.close(); syncPause(); return; }
      if (settings.isOpen) { settings.close(); syncPause(); return; }
      if (intro.active) { intro.skip(); return; }
      inventoryPanel.close();
      crafting.close();
      furnacePanel.close();
      chestPanel.close();
      signEditor.close();
      sellerPanel.close();
      stealGame.cancel();
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
    walletHUD.setDepth(game.world);
    // La fenêtre de chat indique l'état du serveur : hors ligne, les
    // messages restent locaux (elle le dit plutôt que de les perdre).
    globalChat.setOnline(multiplayer.connected);
  }
  refreshHUD();
  setInterval(refreshHUD, 500);

  window.__game = game;
}

boot().catch((err) => {
  console.error('AVANIA: démarrage', err);
  showBootError(err);
});
