// ============================================================
//  AVANIA — Inventaire réaliste (piles, 36 cases, durabilité)
//
//  27 cases de stockage + 9 cases de barre rapide, comme dans un
//  inventaire Minecraft. Les matériaux s'empilent, les outils sont
//  des objets séparés avec leur propre durabilité.
// ============================================================

import {
  ITEMS, ALL_ITEMS, ITEM_DEFS, RECIPES,
} from './blocks.js';
import { INVENTORY_SLOTS, HOTBAR_SLOTS } from './config.js';

function cloneStack(stack) {
  return stack ? { ...stack } : null;
}

function itemId(value) {
  return typeof value === 'string' ? value : value && value.id;
}

export class Inventory {
  constructor() {
    // `order` est conservé pour la compatibilité avec l'ancienne API de
    // la barre rapide. Le vrai contenu est maintenant dans `slots`.
    this.order = [...ITEMS];
    this.slotCount = INVENTORY_SLOTS;
    this.hotbarSize = HOTBAR_SLOTS;
    this.hotbarStart = this.slotCount - this.hotbarSize;
    this.slots = new Array(this.slotCount).fill(null);
    this.selected = 0;
    this.craftingGrid = new Array(9).fill(null);
    // Grille 2×2 de l'écran d'inventaire (comme dans Minecraft : on ne
    // peut y fabriquer que des recettes de 2×2 maximum).
    this.craftingGridSmall = new Array(4).fill(null);
    this.cursor = null;
    // État du glisser-répartir (drag 1.8+ de Minecraft) : lorsqu'on
    // maintient le clic et qu'on survole plusieurs cases, la pile du
    // curseur est répartie entre elles au relâchement.
    this.drag = null;

    // Compteur pratique pour le HUD, toujours recalculé depuis les cases.
    this.items = {};
    for (const id of ALL_ITEMS) this.items[id] = 0;
    this._listeners = [];
  }

  // ------------------------------------------------------------
  //  Observateurs & compteurs
  // ------------------------------------------------------------

  subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    this._listeners.push(fn);
    return () => {
      const i = this._listeners.indexOf(fn);
      if (i >= 0) this._listeners.splice(i, 1);
    };
  }

  emit() {
    for (const fn of [...this._listeners]) fn(this);
  }

  _recount() {
    for (const id of ALL_ITEMS) this.items[id] = 0;
    for (const stack of this.slots) {
      if (stack && this.items[stack.id] !== undefined) this.items[stack.id] += stack.count;
    }
  }

  _touch() {
    this._recount();
    this.emit();
  }

  count(item) {
    return this.items[item] || 0;
  }

  has(item, amount = 1) {
    return this.count(item) >= amount;
  }

  get usedSlots() {
    return this.slots.reduce((n, slot) => n + (slot ? 1 : 0), 0);
  }

  get freeSlots() {
    return this.slotCount - this.usedSlots;
  }

  // ------------------------------------------------------------
  //  Cases & piles
  // ------------------------------------------------------------

  getSlot(index) {
    return this.slots[index] ? cloneStack(this.slots[index]) : null;
  }

  getSlotCount() {
    return this.slotCount;
  }

  _insertionOrder() {
    // Les objets ramassés arrivent d'abord dans la barre rapide pour que
    // le joueur puisse les utiliser immédiatement, puis dans le stockage.
    const indexes = [];
    for (let i = this.hotbarStart; i < this.slotCount; i++) indexes.push(i);
    for (let i = 0; i < this.hotbarStart; i++) indexes.push(i);
    return indexes;
  }

  _addInternal(item, amount = 1, metadata = {}) {
    const def = ITEM_DEFS[item];
    if (!def || amount <= 0) return 0;
    let remaining = Math.floor(amount);
    const max = def.maxStack || 64;
    const indexes = this._insertionOrder();

    // Complète d'abord une pile existante.
    if (max > 1) {
      for (const index of indexes) {
        const stack = this.slots[index];
        if (!stack || stack.id !== item || stack.count >= max) continue;
        const add = Math.min(remaining, max - stack.count);
        stack.count += add;
        remaining -= add;
        if (remaining <= 0) return amount;
      }
    }

    // Puis crée autant de piles / cases que nécessaire.
    for (const index of indexes) {
      if (remaining <= 0) break;
      if (this.slots[index]) continue;
      const add = Math.min(remaining, max);
      const stack = { id: item, count: add };
      if (def.type === 'tool') {
        stack.durability = Math.max(1, Math.min(
          def.durability,
          Number.isFinite(metadata.durability) ? metadata.durability : def.durability,
        ));
      }
      this.slots[index] = stack;
      remaining -= add;
    }
    return Math.floor(amount) - remaining;
  }

  // Ajoute le maximum possible et retourne le nombre réellement ajouté.
  add(item, amount = 1, metadata = {}) {
    const added = this._addInternal(item, amount, metadata);
    if (added > 0) this._touch();
    return added;
  }

  canAdd(item, amount = 1) {
    const def = ITEM_DEFS[item];
    if (!def || amount <= 0) return false;
    const max = def.maxStack || 64;
    let capacity = 0;
    for (const stack of this.slots) {
      if (stack && stack.id === item && max > 1) capacity += max - stack.count;
    }
    capacity += this.slots.reduce((n, stack) => n + (stack ? 0 : max), 0);
    return capacity >= amount;
  }

  _removeInternal(item, amount = 1) {
    let remaining = Math.floor(amount);
    for (let i = 0; i < this.slots.length && remaining > 0; i++) {
      const stack = this.slots[i];
      if (!stack || stack.id !== item) continue;
      const take = Math.min(remaining, stack.count);
      stack.count -= take;
      remaining -= take;
      if (stack.count <= 0) this.slots[i] = null;
    }
    return Math.floor(amount) - remaining;
  }

  remove(item, amount = 1) {
    if (amount <= 0 || !this.has(item, amount)) return false;
    this._removeInternal(item, amount);
    this._touch();
    return true;
  }

  takeSlot(index, amount = Infinity) {
    const stack = this.slots[index];
    if (!stack) return null;
    const take = Math.min(stack.count, amount);
    const result = { ...stack, count: take };
    stack.count -= take;
    if (stack.count <= 0) this.slots[index] = null;
    this._touch();
    return result;
  }

  setSlot(index, stack) {
    if (index < 0 || index >= this.slotCount) return false;
    if (stack && !ITEM_DEFS[stack.id]) return false;
    this.slots[index] = stack ? cloneStack(stack) : null;
    this._touch();
    return true;
  }

  // Déplace une case. Une pile de matériau se regroupe automatiquement;
  // deux outils occupent chacun leur case et sont échangés.
  moveSlot(from, to) {
    if (from === to || from < 0 || to < 0 || from >= this.slotCount || to >= this.slotCount) return false;
    const source = this.slots[from];
    if (!source) return false;
    const target = this.slots[to];
    const def = ITEM_DEFS[source.id];
    const max = def.maxStack || 64;

    if (target && target.id === source.id && max > 1) {
      const moved = Math.min(source.count, max - target.count);
      if (moved > 0) {
        target.count += moved;
        source.count -= moved;
        if (source.count <= 0) this.slots[from] = null;
        this._touch();
        return true;
      }
    }

    this.slots[to] = source;
    this.slots[from] = target || null;
    this._touch();
    return true;
  }

  // Shift-clic : transfère une case entre la barre rapide et le stockage.
  transferSlot(index) {
    if (index < 0 || index >= this.slotCount || !this.slots[index]) return false;
    const toHotbar = index < this.hotbarStart;
    const start = toHotbar ? this.hotbarStart : 0;
    const end = toHotbar ? this.slotCount : this.hotbarStart;
    const stack = this.slots[index];
    const def = ITEM_DEFS[stack.id];

    // Regroupe d'abord dans une pile existante de la zone cible.
    if ((def.maxStack || 64) > 1) {
      for (let i = start; i < end; i++) {
        const target = this.slots[i];
        if (target && target.id === stack.id && target.count < def.maxStack) {
          return this.moveSlot(index, i);
        }
      }
    }
    for (let i = start; i < end; i++) {
      if (!this.slots[i]) return this.moveSlot(index, i);
    }
    return false;
  }

  // Double-clic : ramasse dans le curseur toutes les piles du même objet
  // (l'inventaire + la barre rapide), comme dans Minecraft.
  collectItemType(id) {
    const def = ITEM_DEFS[id];
    if (!def || !this.cursor || this.cursor.id !== id) return false;
    const max = def.maxStack || 64;
    if (this.cursor.count >= max) return false;
    for (let i = 0; i < this.slotCount && this.cursor.count < max; i++) {
      const stack = this.slots[i];
      if (!stack || stack.id !== id) continue;
      const take = Math.min(stack.count, max - this.cursor.count);
      stack.count -= take;
      this.cursor.count += take;
      if (stack.count <= 0) this.slots[i] = null;
    }
    this._touch();
    return true;
  }

  // Touche 1..9 : échange la case survolée avec la case correspondante de
  // la barre rapide (comportement exact de Minecraft).
  swapWithHotbar(slotIndex, hotbarIndex) {
    if (hotbarIndex < 0 || hotbarIndex >= this.hotbarSize) return false;
    const hot = this.hotbarStart + hotbarIndex;
    if (slotIndex < 0 || slotIndex >= this.slotCount || slotIndex === hot) return false;
    const a = this.slots[slotIndex];
    const b = this.slots[hot];
    this.slots[slotIndex] = b ? cloneStack(b) : null;
    this.slots[hot] = a ? cloneStack(a) : null;
    this.selected = hotbarIndex;
    this._touch();
    return true;
  }

  // ------------------------------------------------------------
  //  Glisser-répartir (Minecraft 1.8+) : maintien du clic et survol
  //  de plusieurs cases → la pile du curseur est répartie entre elles.
  // ------------------------------------------------------------

  _canPlaceInto(arr, index) {
    if (!this.cursor || this.cursor.count <= 0) return false;
    const max = ITEM_DEFS[this.cursor.id].maxStack || 64;
    const slot = arr[index];
    if (!slot) return true;
    return slot.id === this.cursor.id && slot.count < max;
  }

  // Pose jusqu'à `count` objets du curseur dans la case. Retourne la
  // quantité réellement posée (la case doit être vide ou de même type).
  _placeIntoSlot(arr, index, count) {
    if (!this.cursor || this.cursor.count <= 0 || count <= 0) return 0;
    const def = ITEM_DEFS[this.cursor.id];
    const max = def.maxStack || 64;
    const slot = arr[index];
    let placed = 0;
    if (slot) {
      if (slot.id !== this.cursor.id || slot.count >= max) return 0;
      const add = Math.min(count, max - slot.count);
      slot.count += add;
      placed = add;
    } else {
      const add = Math.min(count, max);
      arr[index] = { ...this.cursor, count: add };
      placed = add;
    }
    this.cursor.count -= placed;
    if (this.cursor.count <= 0) this.cursor = null;
    return placed;
  }

  beginDragDistribute(button = 'left', distribute = false) {
    this.drag = {
      button,
      // Une répartition sur plusieurs cases doit être explicitement
      // demandée (Shift + glisser). Un glisser classique déplace toute la
      // pile vers la première case visée.
      distribute,
      targets: [],
      cursorStart: this.cursor ? this.cursor.count : 0,
    };
  }

  dragDistributeEnter(arr, index) {
    if (!this.drag) return;
    if (this.drag.targets.some((t) => t.arr === arr && t.index === index)) return;
    this.drag.targets.push({ arr, index });
  }

  endDragDistribute() {
    const drag = this.drag;
    this.drag = null;
    if (!drag || !this.cursor) return false;
    const sizeOf = (arr) => (arr === this.craftingGrid ? 9
      : arr === this.craftingGridSmall ? 4
      : this.slotCount);

    if (drag.targets.length === 0) return false;

    // Sans déplacement : simple clic (place tout, échange ou pose une).
    if (drag.targets.length === 1) {
      const t = drag.targets[0];
      this._pointerClick(t.arr, t.index, sizeOf(t.arr), drag.button);
      this._touch();
      return true;
    }

    // Un glisser normal ne répartit jamais la pile, même si le pointeur
    // traverse plusieurs cases. Seul Shift + glisser active cette fonction.
    if (!drag.distribute) {
      // En glisser normal, seule la case sous le curseur au moment du
      // relâchement doit être utilisée. Les anciennes cibles ne sont que
      // des cases traversées pendant le déplacement.
      const target = drag.targets[drag.targets.length - 1];
      if (!target || !this._canPlaceInto(target.arr, target.index)) return false;
      this._pointerClick(target.arr, target.index, sizeOf(target.arr), drag.button);
      this._touch();
      return true;
    }

    // Répartition volontaire : clic droit = un objet par case ; clic gauche
    // = la pile est divisée (ceil) entre les cases compatibles.
    if (drag.button === 'right') {
      for (const t of drag.targets) {
        if (!this.cursor || this.cursor.count <= 0) break;
        this._placeIntoSlot(t.arr, t.index, 1);
      }
    } else {
      let remaining = drag.cursorStart;
      for (let i = 0; i < drag.targets.length && remaining > 0; i++) {
        const t = drag.targets[i];
        const valid = drag.targets.slice(i).filter((tt) => this._canPlaceInto(tt.arr, tt.index));
        if (valid.length === 0) break;
        const share = Math.ceil(remaining / valid.length);
        remaining -= this._placeIntoSlot(t.arr, t.index, share);
      }
    }
    this._touch();
    return true;
  }

  // Vide le curseur et retourne la pile (pour la lâcher au sol, etc.).
  dropCursor() {
    if (!this.cursor) return null;
    const stack = cloneStack(this.cursor);
    this.cursor = null;
    this._touch();
    return stack;
  }

  // ------------------------------------------------------------
  //  Barre rapide
  // ------------------------------------------------------------

  selectedSlotIndex() {
    return this.hotbarStart + this.selected;
  }

  getSelectedStack() {
    return this.getSlot(this.selectedSlotIndex());
  }

  // Accès en lecture seule à la case sélectionnée, sans clonage.
  // Utilisé dans la boucle de jeu (miner / poser) pour éviter d'allouer
  // un objet à chaque frame.
  getSelectedStackRef() {
    return this.slots[this.selectedSlotIndex()];
  }

  getSelected() {
    // Fallback historique : les scripts qui utilisaient l'ancien inventaire
    // peuvent toujours demander un nom d'objet, même sur une case vide.
    const stack = this.getSelectedStack();
    return stack ? stack.id : this.order[this.selected % this.order.length];
  }

  select(index) {
    const size = this.hotbarSize;
    this.selected = ((index % size) + size) % size;
    this.emit();
  }

  cycle(direction) {
    this.select(this.selected + direction);
  }

  // ------------------------------------------------------------
  //  Durabilité des outils
  // ------------------------------------------------------------

  damageSlot(index, amount = 1) {
    const stack = this.slots[index];
    const def = stack && ITEM_DEFS[stack.id];
    if (!stack || !def || def.type !== 'tool') return { used: false, broken: false };
    stack.durability = (Number.isFinite(stack.durability) ? stack.durability : def.durability) - amount;
    if (stack.durability <= 0) {
      this.slots[index] = null;
      this._touch();
      return { used: true, broken: true };
    }
    this._touch();
    return { used: true, broken: false, durability: stack.durability };
  }

  damageSelectedTool(amount = 1) {
    return this.damageSlot(this.selectedSlotIndex(), amount);
  }

  // ------------------------------------------------------------
  //  Tri automatique de l'inventaire
  // ------------------------------------------------------------

  sortInventory() {
    // Ordre de tri : type d'objet puis nom
    const typeOrder = { resource: 0, material: 1, tool: 2, block: 3 };
    const compare = (a, b) => {
      if (!a && !b) return 0;
      if (!a) return 1;
      if (!b) return -1;
      const defA = ITEM_DEFS[a.id];
      const defB = ITEM_DEFS[b.id];
      const typeA = typeOrder[defA?.type] ?? 99;
      const typeB = typeOrder[defB?.type] ?? 99;
      if (typeA !== typeB) return typeA - typeB;
      return (defA?.label || a.id).localeCompare(defB?.label || b.id);
    };

    // Séparer barre rapide et stockage
    const storage = this.slots.slice(0, this.hotbarStart).filter(Boolean);
    const hotbar = this.slots.slice(this.hotbarStart).filter(Boolean);

    // Trier chaque partie
    storage.sort(compare);
    hotbar.sort(compare);

    // Reconstruire les slots
    for (let i = 0; i < this.hotbarStart; i++) {
      this.slots[i] = i < storage.length ? storage[i] : null;
    }
    for (let i = 0; i < this.hotbarSize; i++) {
      this.slots[this.hotbarStart + i] = i < hotbar.length ? hotbar[i] : null;
    }

    this._touch();
    return true;
  }

  // ------------------------------------------------------------
  //  Fabrication directe (API historique)
  // ------------------------------------------------------------

  canCraft(recipe) {
    if (!recipe || !recipe.inputs || !ITEM_DEFS[recipe.out]) return false;
    return Object.entries(recipe.inputs).every(([id, amount]) => this.has(id, amount));
  }

  craft(recipe) {
    if (!this.canCraft(recipe)) return false;

    // Transaction : on ne consomme rien si le résultat ne peut pas entrer.
    const before = this.slots.map(cloneStack);
    for (const [id, amount] of Object.entries(recipe.inputs)) this._removeInternal(id, amount);
    const added = this._addInternal(recipe.out, recipe.outN || 1);
    if (added !== (recipe.outN || 1)) {
      this.slots = before;
      this._recount();
      return false;
    }
    this._touch();
    return true;
  }

  // ------------------------------------------------------------
  //  Grille 3x3 façon Minecraft
  // ------------------------------------------------------------

  _pattern(recipe) {
    return recipe && recipe.pattern && recipe.pattern.length
      ? recipe.pattern
      : [[Object.keys(recipe.inputs || {})[0] || null]];
  }

  _gridIds(grid = this.craftingGrid) {
    return grid.map((cell) => (cell ? itemId(cell) : null));
  }

  _returnGridInternal(arr) {
    let complete = true;
    let changed = false;
    for (let i = 0; i < arr.length; i++) {
      const cell = arr[i];
      if (!cell) continue;
      const added = this._addInternal(cell.id, cell.count, cell);
      if (added > 0) changed = true;
      if (added >= cell.count) arr[i] = null;
      else {
        arr[i] = { ...cell, count: cell.count - added };
        complete = false;
      }
    }
    return { complete, changed };
  }

  returnCursor() {
    if (!this.cursor) return true;
    const added = this._addInternal(this.cursor.id, this.cursor.count, this.cursor);
    if (added >= this.cursor.count) {
      this.cursor = null;
      this._touch();
      return true;
    }
    this.cursor = { ...this.cursor, count: this.cursor.count - added };
    this._touch();
    return false;
  }

  returnCraftingGrid() {
    let changed = false;
    if (this.cursor) {
      const added = this._addInternal(this.cursor.id, this.cursor.count, this.cursor);
      if (added > 0) changed = true;
      if (added >= this.cursor.count) this.cursor = null;
      else this.cursor = { ...this.cursor, count: this.cursor.count - added };
    }
    const result = this._returnGridInternal(this.craftingGrid);
    const resultSmall = this._returnGridInternal(this.craftingGridSmall);
    if (changed || result.changed || resultSmall.changed) this._touch();
    return result.complete && resultSmall.complete && !this.cursor;
  }

  prepareRecipe(recipe) {
    if (!recipe) return false;
    // Rendre d'abord les ingrédients d'une recette précédente permet de
    // changer de recette directement depuis le livre, comme dans Minecraft.
    if (!this.returnCraftingGrid()) return false;
    if (!this.canCraft(recipe)) return false;

    const pattern = this._pattern(recipe);
    const cells = [];
    for (let y = 0; y < pattern.length; y++) {
      for (let x = 0; x < pattern[y].length; x++) {
        const id = pattern[y][x];
        if (id) cells.push({ x, y, id });
      }
    }

    // Le test canCraft ci-dessus garantit que chaque retrait réussit.
    for (const cell of cells) this._removeInternal(cell.id, 1);
    this.craftingGrid.fill(null);
    for (const cell of cells) {
      this.craftingGrid[cell.y * 3 + cell.x] = { id: cell.id, count: 1 };
    }
    this._touch();
    return true;
  }

  // Retourne { recipe, ox, oy } : la recette reconnue et la position du
  // motif dans la grille 3×3 (utile pour consommer un seul jeu d'ingrédients
  // à la fois, comme Minecraft).
  getMatchingRecipeResult(grid = this.craftingGrid) {
    const ids = this._gridIds(grid);

    for (const recipe of RECIPES) {
      const pattern = this._pattern(recipe);
      const h = pattern.length;
      const w = Math.max(...pattern.map((row) => row.length));
      if (w > 3 || h > 3) continue;

      for (let oy = 0; oy <= 3 - h; oy++) {
        for (let ox = 0; ox <= 3 - w; ox++) {
          let matches = true;
          for (let y = 0; y < 3 && matches; y++) {
            for (let x = 0; x < 3; x++) {
              const expected = y >= oy && y < oy + h && x >= ox && x < ox + w
                ? (pattern[y - oy][x - ox] || null)
                : null;
              if (ids[y * 3 + x] !== expected) {
                matches = false;
                break;
              }
            }
          }
          if (matches) return { recipe, ox, oy };
        }
      }
    }
    return null;
  }

  getMatchingRecipe(grid = this.craftingGrid) {
    const match = this.getMatchingRecipeResult(grid);
    return match ? match.recipe : null;
  }

  // Grille 2×2 (écran inventaire) : on complète avec des cases vides pour
  // réutiliser le moteur de correspondance 3×3. Seules les recettes de 2×2
  // ou moins (planches, briques, verre, bâtons…) peuvent y être fabriquées.
  getMatchingRecipeSmall(grid = this.craftingGridSmall) {
    const padded = [
      ...grid.slice(0, 4),
      null, null, null, null, null,
    ];
    const match = this.getMatchingRecipeResult(padded);
    return match ? match.recipe : null;
  }

  clickCraftSmallSlot(index, button = 'left') {
    return this._pointerClick(this.craftingGridSmall, index, 4, button);
  }

  quickMoveFromCraft2(index) {
    const cell = this.craftingGridSmall[index];
    if (!cell) return false;
    const added = this._addInternal(cell.id, cell.count, cell);
    if (added <= 0) return false;
    if (added >= cell.count) this.craftingGridSmall[index] = null;
    else this.craftingGridSmall[index] = { ...cell, count: cell.count - added };
    this._touch();
    return true;
  }

  // Pose le résultat d'une fabrication sur le curseur si possible, sinon
  // dans l'inventaire. Retourne true si tout le résultat a trouvé sa place.
  _addOutput(id, count, toCursor = true) {
    const def = ITEM_DEFS[id];
    if (!def) return false;
    const max = def.maxStack || 64;
    let remaining = count;
    if (toCursor) {
      if (!this.cursor) {
        this.cursor = { id, count: remaining };
        remaining = 0;
      } else if (this.cursor.id === id && this.cursor.count < max) {
        const add = Math.min(remaining, max - this.cursor.count);
        this.cursor.count += add;
        remaining -= add;
      }
    }
    if (remaining > 0) remaining -= this._addInternal(id, remaining);
    return remaining <= 0;
  }

  // Consomme UN exemplaire de chaque ingrédient du motif (comme Minecraft :
  // une case avec plusieurs exemplaires continue d'alimenter la recette).
  craftFromGrid({ toCursor = true } = {}) {
    const match = this.getMatchingRecipeResult();
    if (!match) return false;
    const { recipe, ox, oy } = match;
    const pattern = this._pattern(recipe);
    const beforeGrid = this.craftingGrid.map(cloneStack);
    const beforeSlots = this.slots.map(cloneStack);
    const beforeCursor = this.cursor ? cloneStack(this.cursor) : null;

    for (let y = 0; y < pattern.length; y++) {
      for (let x = 0; x < pattern[y].length; x++) {
        if (!pattern[y][x]) continue;
        const cellIndex = (oy + y) * 3 + (ox + x);
        const cell = this.craftingGrid[cellIndex];
        if (!cell) {
          this.craftingGrid = beforeGrid;
          this.slots = beforeSlots;
          this.cursor = beforeCursor;
          this._recount();
          return false;
        }
        cell.count -= 1;
        if (cell.count <= 0) this.craftingGrid[cellIndex] = null;
      }
    }

    if (!this._addOutput(recipe.out, recipe.outN || 1, toCursor)) {
      this.craftingGrid = beforeGrid;
      this.slots = beforeSlots;
      this.cursor = beforeCursor;
      this._recount();
      return false;
    }
    this._touch();
    return true;
  }

  // Shift-clic sur le résultat : fabrique autant de fois que possible
  // (tant que la recette correspond, qu'il reste des ingrédients et de
  // la place). Retourne le nombre d'objets fabriqués.
  craftFromGridMax({ toCursor = false } = {}) {
    let crafted = 0;
    while (crafted < 64 && this.craftFromGrid({ toCursor })) crafted++;
    return crafted;
  }

  craftFromSmallGrid({ toCursor = true } = {}) {
    const match = this.getMatchingRecipeResult([
      ...this.craftingGridSmall.slice(0, 4),
      null, null, null, null, null,
    ]);
    if (!match) return false;
    const { recipe, ox, oy } = match;
    const pattern = this._pattern(recipe);
    const beforeGrid = this.craftingGridSmall.map(cloneStack);
    const beforeSlots = this.slots.map(cloneStack);
    const beforeCursor = this.cursor ? cloneStack(this.cursor) : null;

    for (let y = 0; y < pattern.length; y++) {
      for (let x = 0; x < pattern[y].length; x++) {
        if (!pattern[y][x]) continue;
        const cellIndex = (oy + y) * 3 + (ox + x);
        if (cellIndex >= 4) {
          this.craftingGridSmall = beforeGrid;
          this.slots = beforeSlots;
          this.cursor = beforeCursor;
          this._recount();
          return false;
        }
        const cell = this.craftingGridSmall[cellIndex];
        if (!cell) {
          this.craftingGridSmall = beforeGrid;
          this.slots = beforeSlots;
          this.cursor = beforeCursor;
          this._recount();
          return false;
        }
        cell.count -= 1;
        if (cell.count <= 0) this.craftingGridSmall[cellIndex] = null;
      }
    }

    if (!this._addOutput(recipe.out, recipe.outN || 1, toCursor)) {
      this.craftingGridSmall = beforeGrid;
      this.slots = beforeSlots;
      this.cursor = beforeCursor;
      this._recount();
      return false;
    }
    this._touch();
    return true;
  }

  craftFromSmallGridMax({ toCursor = false } = {}) {
    let crafted = 0;
    while (crafted < 64 && this.craftFromSmallGrid({ toCursor })) crafted++;
    return crafted;
  }

  // ------------------------------------------------------------
  //  Curseur façon Minecraft (prendre / poser à la main)
  // ------------------------------------------------------------

  getCursor() {
    return this.cursor ? cloneStack(this.cursor) : null;
  }

  _pointerClick(arr, index, size, button = 'left') {
    if (index < 0 || index >= size) return false;
    const right = button === 'right';
    const slot = arr[index];
    const cursor = this.cursor;

    if (!cursor) {
      if (!slot) return false;
      const take = right ? Math.max(1, Math.ceil(slot.count / 2)) : slot.count;
      this.cursor = { ...slot, count: take };
      slot.count -= take;
      if (slot.count <= 0) arr[index] = null;
      this._touch();
      return true;
    }

    const def = ITEM_DEFS[cursor.id];
    const max = def.maxStack || 64;

    if (!slot) {
      const add = Math.min(right ? 1 : cursor.count, max);
      arr[index] = { ...cursor, count: add };
      cursor.count -= add;
      if (cursor.count <= 0) this.cursor = null;
      this._touch();
      return true;
    }

    if (slot.id === cursor.id && max > 1) {
      const add = Math.min(right ? 1 : cursor.count, max - slot.count);
      if (add > 0) {
        slot.count += add;
        cursor.count -= add;
        if (cursor.count <= 0) this.cursor = null;
        this._touch();
        return true;
      }
    }

    if (!right) {
      // Même type mais pile pleine : Minecraft ne fait rien (pas d'échange).
      if (slot.id === cursor.id && max > 1) return false;
      arr[index] = cursor;
      this.cursor = slot;
      this._touch();
      return true;
    }
    return false;
  }

  clickInventorySlot(index, button = 'left') {
    return this._pointerClick(this.slots, index, this.slotCount, button);
  }

  clickCraftSlot(index, button = 'left') {
    return this._pointerClick(this.craftingGrid, index, 9, button);
  }

  quickMoveToCraft(index) {
    const stack = this.slots[index];
    if (!stack) return false;
    const def = ITEM_DEFS[stack.id];
    const max = def.maxStack || 64;
    if (max > 1) {
      for (let i = 0; i < 9 && this.slots[index]; i++) {
        const target = this.craftingGrid[i];
        if (!target || target.id !== stack.id || target.count >= max) continue;
        const add = Math.min(stack.count, max - target.count);
        target.count += add;
        stack.count -= add;
        if (stack.count <= 0) this.slots[index] = null;
      }
    }
    for (let i = 0; i < 9 && this.slots[index]; i++) {
      if (this.craftingGrid[i]) continue;
      this.craftingGrid[i] = this.slots[index];
      this.slots[index] = null;
    }
    this._touch();
    return true;
  }

  quickMoveFromCraft(index) {
    const cell = this.craftingGrid[index];
    if (!cell) return false;
    const added = this._addInternal(cell.id, cell.count, cell);
    if (added <= 0) return false;
    if (added >= cell.count) this.craftingGrid[index] = null;
    else this.craftingGrid[index] = { ...cell, count: cell.count - added };
    this._touch();
    return true;
  }
}
