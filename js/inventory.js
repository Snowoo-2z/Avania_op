// ============================================================
//  AVANIA — Inventaire du joueur (blocs collectés + barre rapide)
// ============================================================

import { ITEMS } from './blocks.js';

export class Inventory {
  constructor() {
    this.order = [...ITEMS];
    this.items = {};
    for (const it of this.order) this.items[it] = 0;
    this.selected = 0;
    // rappel optionnel (mis à jour de l'UI)
    this.onChange = null;
  }

  add(item, n = 1) {
    if (this.items[item] === undefined) return;
    this.items[item] += n;
    if (this.onChange) this.onChange();
  }

  remove(item, n = 1) {
    if (this.items[item] >= n) {
      this.items[item] -= n;
      if (this.onChange) this.onChange();
      return true;
    }
    return false;
  }

  getSelected() {
    return this.order[this.selected];
  }

  select(i) {
    this.selected = ((i % this.order.length) + this.order.length) % this.order.length;
    if (this.onChange) this.onChange();
  }

  cycle(dir) {
    this.select(this.selected + dir);
  }
}
