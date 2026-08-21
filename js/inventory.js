// ============================================================
//  AVANIA — Inventaire du joueur (blocs collectés + barre rapide)
//  + fabrication simple (ressources -> blocs).
// ============================================================

import { ITEMS } from './blocks.js';

export class Inventory {
  constructor() {
    this.order = [...ITEMS];
    this.items = {};
    for (const it of this.order) this.items[it] = 0;
    this.selected = 0;
    this._listeners = [];
  }

  // s'abonne aux changements (HUD, barre rapide, fabrication…)
  subscribe(fn) {
    this._listeners.push(fn);
  }

  emit() {
    for (const fn of this._listeners) fn();
  }

  count(item) {
    return this.items[item] || 0;
  }

  add(item, n = 1) {
    if (this.items[item] === undefined) return;
    this.items[item] += n;
    this.emit();
  }

  remove(item, n = 1) {
    if (this.items[item] >= n) {
      this.items[item] -= n;
      this.emit();
      return true;
    }
    return false;
  }

  getSelected() {
    return this.order[this.selected];
  }

  select(i) {
    this.selected = ((i % this.order.length) + this.order.length) % this.order.length;
    this.emit();
  }

  cycle(dir) {
    this.select(this.selected + dir);
  }

  // --- Fabrication ---
  canCraft(recipe) {
    return Object.entries(recipe.inputs).every(([id, n]) => this.items[id] >= n);
  }

  craft(recipe) {
    if (!this.canCraft(recipe)) return false;
    for (const [id, n] of Object.entries(recipe.inputs)) this.items[id] -= n;
    this.items[recipe.out] += recipe.outN;
    this.emit();
    return true;
  }
}
