// ============================================================
//  AVANIA — Interactions de cases façon Minecraft
//
//  Un seul gestionnaire partagé par la barre rapide, l'inventaire
//  et l'établi. Il reproduit les réflexes du jeu de référence :
//
//    • clic gauche ......... prendre toute la pile / poser toute la pile
//    • clic droit .......... prendre la moitié / poser un seul objet
//    • double-clic ......... ramasser toutes les piles du même objet
//    • shift-clic .......... déplacement rapide (sac <-> barre, grille)
//    • maintenir + survoler . répartir la pile entre les cases
//    • touches 1..9 ........ échanger la case survolée avec la barre
//
//  Une pile flottante suit la souris et une infobulle décrit l'objet,
//  exactement comme dans Minecraft.
// ============================================================

import { ITEM_DEFS } from './blocks.js';
import { SMELT_RECIPES, FUEL } from './furnace.js';

const DOUBLE_CLICK_MS = 320;
const TOOLTIP_TYPES = { resource: 'Ressource', material: 'Matériau', tool: 'Outil', block: 'Bloc' };

export class SlotManager {
  constructor(inventory, opts = {}) {
    this.inventory = inventory;
    this.cursorEl = opts.cursorEl || null;
    this.tooltipEl = opts.tooltipEl || null;
    // L'établi (grille 3×3) permet le shift-clic « vers la grille » :
    // l'inventaire (écran E) se limite à sac <-> barre rapide.
    this.canFillCraftGrid = opts.canFillCraftGrid || (() => false);
    // Les touches 1..9 n'échangent avec la barre rapide que lorsqu'un
    // panneau est ouvert (en jeu, elles sélectionnent simplement la case).
    this.isPanelOpen = opts.isPanelOpen || (() => false);
    // Relâcher une pile hors de toute case → la jeter dans le monde.
    this.onDropCursor = opts.onDropCursor || null;
    // Cases du four ouvert : { input: [..], fuel: [..], output: [..] }
    // (tableaux de longueur 1), définies par le panneau du four.
    this.furnaceArrays = null;
    // Cases du coffre ouvert : tableau de 27 piles, défini par le panneau
    // du coffre (null quand aucun coffre n'est ouvert).
    this.chestSlots = null;

    this.dragging = false;
    this.hovered = null;
    this.lastClickAt = 0;
    this.lastClickEl = null;

    this._boundMove = (event) => this.onMove(event);
    // Conserver l'événement : onUp doit savoir si le relâchement a eu lieu
    // sur une case ou sur le décor. L'ancienne closure jetait l'événement,
    // ce qui faisait considérer chaque relâchement comme « hors inventaire ».
    this._boundUp = (event) => this.onUp(event);
    this._boundKey = (event) => this.onKey(event);
  }

  // ------------------------------------------------------------
  //  Cases & tableaux
  // ------------------------------------------------------------

  arrFor(kind) {
    const inv = this.inventory;
    if (kind === 'craft') return inv.craftingGrid;
    if (kind === 'craft2') return inv.craftingGridSmall;
    if (kind === 'furnaceIn') return this.furnaceArrays ? this.furnaceArrays.input : null;
    if (kind === 'furnaceFuel') return this.furnaceArrays ? this.furnaceArrays.fuel : null;
    if (kind === 'furnaceOut') return this.furnaceArrays ? this.furnaceArrays.output : null;
    if (kind === 'chest') return this.chestSlots;
    return inv.slots;
  }

  sizeFor(kind) {
    if (kind === 'furnaceIn' || kind === 'furnaceFuel' || kind === 'furnaceOut') return 1;
    if (kind === 'craft') return 9;
    if (kind === 'craft2') return 4;
    if (kind === 'chest') return 27;
    return this.inventory.slotCount;
  }

  register(el, kind, index) {
    const manager = this;
    el.classList.add('mc-slot');
    el.dataset.slotKind = kind;
    el.dataset.slotIndex = index;

    el.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 && event.button !== 2) return;
      if (event.button === 2) event.preventDefault();
      // Ne pas utiliser setPointerCapture ici : le pointerenter des cases
      // suivantes est nécessaire au glisser-répartir. Le gestionnaire global
      // pointermove/pointerup continue de suivre le geste hors de la case.
      manager.handleDown(el, kind, index, event);
    });

    el.addEventListener('pointerenter', () => {
      manager.hovered = { kind, index, el };
      if (manager.dragging) {
        manager.inventory.dragDistributeEnter(manager.arrFor(kind), index);
        el.classList.add('drag-target');
      } else {
        manager.showTooltip(kind, index);
      }
    });

    el.addEventListener('pointerleave', () => {
      if (manager.hovered && manager.hovered.el === el) manager.hovered = null;
      if (manager.dragging) el.classList.remove('drag-target');
      manager.hideTooltip();
    });

    el.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  attach() {
    window.addEventListener('pointermove', this._boundMove, { passive: true });
    window.addEventListener('pointerup', this._boundUp);
    window.addEventListener('keydown', this._boundKey);
  }

  detach() {
    window.removeEventListener('pointermove', this._boundMove);
    window.removeEventListener('pointerup', this._boundUp);
    window.removeEventListener('keydown', this._boundKey);
  }

  // ------------------------------------------------------------
  //  Événements
  // ------------------------------------------------------------

  handleDown(el, kind, index, event) {
    const inv = this.inventory;
    const arr = this.arrFor(kind);
    const size = this.sizeFor(kind);
    if (!arr) return;
    const right = event.button === 2;
    const now = performance.now();
    const stack = arr[index];

    // En jeu (aucun panneau ouvert), cliquer la barre rapide sélectionne
    // simplement la case — comme dans Minecraft, on n'attrape un objet
    // que depuis un écran ouvert.
    if (kind === 'hotbar' && !this.isPanelOpen()) {
      inv.select(index - inv.hotbarStart);
      return;
    }

    // Shift-clic : déplacement rapide.
    if (event.shiftKey && !right) {
      this.lastClickEl = null;
      if (kind === 'craft') inv.quickMoveFromCraft(index);
      else if (kind === 'craft2') inv.quickMoveFromCraft2(index);
      else if (kind === 'furnaceIn' || kind === 'furnaceFuel' || kind === 'furnaceOut') {
        this.quickMoveFurnaceToInventory(kind, index);
      } else if (kind === 'chest') {
        this.quickMoveChestToInventory(index);
      } else if (this.canFillCraftGrid() && inv.quickMoveToCraft(index) && !inv.slots[index]) {
        // déplacé vers la grille de l'établi
      } else if (this.chestSlots && this.quickMoveInventoryToChest(index)) {
        // déplacé vers le coffre ouvert
      } else if (this.furnaceArrays && this.quickMoveInventoryToFurnace(index)) {
        // déplacé vers le four (entrée ou combustible)
      } else {
        inv.transferSlot(index);
      }
      return;
    }

    // Double-clic : ramasser toutes les piles du même objet
    // (coffre ouvert inclus, comme dans Minecraft).
    if (!right && this.lastClickEl === el && now - this.lastClickAt < DOUBLE_CLICK_MS) {
      if (inv.cursor) inv.collectItemType(inv.cursor.id, this.chestSlots ? [this.chestSlots] : []);
      this.lastClickEl = null;
      this.lastClickAt = 0;
      return;
    }
    this.lastClickAt = now;
    this.lastClickEl = el;

    if (!inv.cursor) {
      if (!stack) return;
      // Prendre la pile (entière à gauche, moitié à droite), puis on peut
      // la répartir en maintenant le bouton et en survolant d'autres cases.
      inv._pointerClick(arr, index, size, right ? 'right' : 'left');
      if (inv.cursor) {
        // La case de départ ne fait pas partie des cibles. Sinon, un clic
        // droit qui prend la moitié la reposait immédiatement au relâchement
        // (et donnait l'impression d'une division aléatoire). Les cases
        // traversées après le départ restent enregistrées par pointerenter.
        inv.beginDragDistribute(right ? 'right' : 'left', event.shiftKey);
        this.dragging = true;
      }
    } else {
      // Le curseur est déjà chargé : on démarre le placement. La
      // répartition multi-cases est volontaire et nécessite Shift, afin
      // qu'un déplacement normal ne divise jamais une pile par accident.
      inv.beginDragDistribute(right ? 'right' : 'left', event.shiftKey);
      inv.dragDistributeEnter(arr, index);
      this.dragging = true;
      el.classList.add('drag-source');
    }
  }

  onUp(event) {
    if (!this.dragging) return;
    this.dragging = false;
    document.querySelectorAll('.mc-slot.drag-source, .mc-slot.drag-target').forEach((el) => {
      el.classList.remove('drag-source', 'drag-target');
    });
    // Avec pointer capture, event.target peut rester la case de départ même
    // si le pointeur est sorti du panneau. La position réelle est donc la
    // source de vérité au relâchement.
    const releaseEl = event && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)
      ? document.elementFromPoint(event.clientX, event.clientY)
      : event && event.target;
    const releaseOutside = !(releaseEl
      && typeof releaseEl.closest === 'function'
      && releaseEl.closest('.mc-slot, .craft-output'));
    this.inventory.endDragDistribute();
    // Relâcher hors de toute case (sur le décor) jette la pile du curseur
    // au sol, comme quand on sort un objet de l'inventaire dans Minecraft.
    if (releaseOutside) {
      const dropped = this.inventory.dropCursor();
      if (dropped && this.onDropCursor) this.onDropCursor(dropped);
    }
    this.hideTooltip();
  }

  onMove(event) {
    this.positionFloating(event.clientX, event.clientY);
  }

  onKey(event) {
    if (!this.hovered || !this.isPanelOpen()) return;
    const { kind, index } = this.hovered;
    if ((kind !== 'inv' && kind !== 'hotbar') || index == null) return;
    const n = Number(event.key);
    if (Number.isInteger(n) && n >= 1 && n <= this.inventory.hotbarSize) {
      this.inventory.swapWithHotbar(index, n - 1);
      event.preventDefault();
    }
  }

  // ------------------------------------------------------------
  //  Déplacements rapides liés au four
  // ------------------------------------------------------------

  quickMoveFurnaceToInventory(kind, index) {
    const arr = this.arrFor(kind);
    if (!arr) return;
    const stack = arr[index];
    if (!stack) return;
    const added = this.inventory.add(stack.id, stack.count, stack);
    if (added >= stack.count) arr[index] = null;
    else stack.count -= added;
  }

  // Shift-clic dans une case du coffre : la pile part vers l'inventaire
  // (complète les piles existantes, puis les cases libres).
  quickMoveChestToInventory(index) {
    const arr = this.chestSlots;
    if (!arr) return;
    const stack = arr[index];
    if (!stack) return;
    const added = this.inventory.add(stack.id, stack.count, stack);
    if (added >= stack.count) arr[index] = null;
    else stack.count -= added;
  }

  // Shift-clic dans l'inventaire : la pile part vers le coffre ouvert
  // (première pile de même type, puis première case libre).
  quickMoveInventoryToChest(index) {
    const stack = this.inventory.slots[index];
    if (!stack || !this.chestSlots) return false;
    const chest = this.chestSlots;
    const def = ITEM_DEFS[stack.id];
    const max = def.maxStack || 64;

    if (max > 1) {
      for (let i = 0; i < chest.length && stack && stack.count > 0; i++) {
        const target = chest[i];
        if (!target || target.id !== stack.id || target.count >= max) continue;
        const add = Math.min(stack.count, max - target.count);
        target.count += add;
        stack.count -= add;
        if (stack.count <= 0) this.inventory.slots[index] = null;
      }
    }
    for (let i = 0; i < chest.length && stack && stack.count > 0; i++) {
      if (chest[i]) continue;
      chest[i] = { ...stack };
      this.inventory.slots[index] = null;
    }
    this.inventory._touch();
    return true;
  }

  // Shift-clic d'un objet du sac : entrée du four si ça se fond, sinon
  // combustible, sinon rien.
  quickMoveInventoryToFurnace(index) {
    const stack = this.inventory.slots[index];
    if (!stack || !this.furnaceArrays) return false;
    if (SMELT_RECIPES[stack.id] && this._pushToFurnaceSlot(this.furnaceArrays.input, stack)) return true;
    if (FUEL[stack.id] != null && this._pushToFurnaceSlot(this.furnaceArrays.fuel, stack)) return true;
    return false;
  }

  _pushToFurnaceSlot(slotArr, stack) {
    const target = slotArr[0];
    if (target) {
      if (target.id !== stack.id || target.count >= 64) return false;
      const add = Math.min(stack.count, 64 - target.count);
      target.count += add;
      stack.count -= add;
      return true;
    }
    slotArr[0] = { ...stack };
    const idx = this.inventory.slots.indexOf(stack);
    if (idx >= 0) this.inventory.slots[idx] = null;
    return true;
  }

  // ------------------------------------------------------------
  //  Pile flottante (curseur)
  // ------------------------------------------------------------

  updateCursor(renderIcon) {
    const el = this.cursorEl;
    if (!el) return;
    const cursor = this.inventory.getCursor();
    if (!cursor) {
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    const icon = el.querySelector('.slot-icon');
    const count = el.querySelector('.slot-count');
    if (renderIcon) renderIcon(icon, cursor.id);
    count.textContent = cursor.count > 1 ? cursor.count : '';
  }

  positionFloating(x, y) {
    if (this.cursorEl && !this.cursorEl.classList.contains('hidden')) {
      this.cursorEl.style.left = `${x + 12}px`;
      this.cursorEl.style.top = `${y + 10}px`;
    }
    if (this.tooltipEl && !this.tooltipEl.classList.contains('hidden')) {
      const w = this.tooltipEl.offsetWidth || 150;
      const h = this.tooltipEl.offsetHeight || 40;
      const pad = 14;
      this.tooltipEl.style.left = `${Math.min(x + 18, window.innerWidth - w - pad)}px`;
      this.tooltipEl.style.top = `${Math.min(y + 22, window.innerHeight - h - pad)}px`;
    }
  }

  // ------------------------------------------------------------
  //  Infobulle façon Minecraft
  // ------------------------------------------------------------

  showTooltip(kind, index) {
    const inv = this.inventory;
    const el = this.tooltipEl;
    if (!el) return;
    const stack = this.arrFor(kind)[index];
    const def = stack && ITEM_DEFS[stack.id];
    if (!def) {
      this.hideTooltip();
      return;
    }
    el.innerHTML = '';
    const name = document.createElement('div');
    name.className = 'tt-name';
    name.textContent = def.label;
    el.appendChild(name);

    if (def.type === 'tool') {
      const max = def.durability || 1;
      const current = Math.max(0, stack.durability ?? max);
      const line = document.createElement('div');
      line.className = 'tt-line';
      line.textContent = `${TOOLTIP_TYPES[def.type] || def.type} · durabilité ${current}/${max}`;
      el.appendChild(line);
    } else {
      const line = document.createElement('div');
      line.className = 'tt-line';
      line.textContent = `${TOOLTIP_TYPES[def.type] || def.type} · ×${stack.count}`;
      el.appendChild(line);
    }
    el.classList.remove('hidden');
  }

  hideTooltip() {
    if (this.tooltipEl) this.tooltipEl.classList.add('hidden');
  }
}
