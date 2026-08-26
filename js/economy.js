// ============================================================
//  AVANIA — Économie : la monnaie de l'île
//
//  L'argent est remis au joueur par le représentant de l'île à son
//  arrivée. Il sert à acheter l'équipement (masques, armures de
//  minage) auprès des marchands de la grotte. Le troc reste
//  possible entre joueurs, mais l'argent est l'étalon commun :
//  à la fin de l'aventure, c'est celui qui en a le plus qui gagne.
//
//  Ce module est volontairement SANS DOM ni rendu : il est testable
//  tel quel (test/smoke.mjs) et réutilisable côté serveur quand le
//  multijoueur arrivera.
// ============================================================

// Unité monétaire. Pas de décimales : les prix sont des entiers, ce
// qui évite tous les pièges d'arrondi flottant sur les totaux.
export const CURRENCY = {
  id: 'avania',
  label: 'Écus',
  singular: 'Écu',
  plural: 'Écus',
  // Somme remise par le représentant à l'arrivée sur l'île.
  startingGrant: 150,
};

const STORAGE_KEY = 'avania.economy.v1';

// Formate un montant à la française : 12345 -> « 12 345 ».
// (espace insécable fine U+202F, repli sur l'espace normale)
export function formatMoney(amount) {
  const n = Math.round(Number(amount) || 0);
  const sign = n < 0 ? '−' : '';
  const digits = String(Math.abs(n));
  const sep = '\u202F';
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += sep;
    out += digits[i];
  }
  return sign + out;
}

export class Wallet {
  constructor(options = {}) {
    this.storageKey = options.storageKey || STORAGE_KEY;
    this.allowStorage = options.allowStorage !== false;
    this.money = 0;
    this.day = 1;            // nombre de jours passés sur l'île
    this.totalEarned = 0;
    this.totalSpent = 0;
    this.history = [];       // derniers mouvements (10 max, pour l'UI)
    this._listeners = [];
    this._loaded = false;
    if (this.allowStorage) this.load();
  }

  // ------------------------------------------------------------
  //  Abonnement (le HUD se met à jour tout seul)
  // ------------------------------------------------------------
  subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    this._listeners.push(fn);
    return () => {
      const i = this._listeners.indexOf(fn);
      if (i >= 0) this._listeners.splice(i, 1);
    };
  }

  _emit(delta, reason) {
    for (const fn of [...this._listeners]) {
      try { fn(this, delta, reason); } catch { /* un listener cassé ne bloque pas le jeu */ }
    }
  }

  // ------------------------------------------------------------
  //  Opérations
  // ------------------------------------------------------------
  canAfford(amount) {
    return amount >= 0 && this.money >= amount;
  }

  // Ajoute de l'argent. Retourne le montant réellement ajouté.
  add(amount, reason = '') {
    const n = Math.max(0, Math.round(Number(amount) || 0));
    if (n === 0) return 0;
    this.money += n;
    this.totalEarned += n;
    this._pushHistory(n, reason);
    this.save();
    this._emit(n, reason);
    return n;
  }

  // Dépense de l'argent. Retourne true si la transaction a eu lieu.
  // Aucun découvert possible : c'est la règle d'or de l'économie du jeu.
  spend(amount, reason = '') {
    const n = Math.max(0, Math.round(Number(amount) || 0));
    if (n === 0) return true;
    if (this.money < n) return false;
    this.money -= n;
    this.totalSpent += n;
    this._pushHistory(-n, reason);
    this.save();
    this._emit(-n, reason);
    return true;
  }

  _pushHistory(delta, reason) {
    this.history.push({ delta, reason, day: this.day });
    if (this.history.length > 10) this.history.shift();
  }

  // ------------------------------------------------------------
  //  Temps passé sur l'île (utile aux marchands : plus les jours
  //  passent, plus ils connaissent le joueur et ajustent leurs prix)
  // ------------------------------------------------------------
  advanceDay() {
    this.day += 1;
    this.save();
    this._emit(0, 'jour');
    return this.day;
  }

  // ------------------------------------------------------------
  //  Persistance
  // ------------------------------------------------------------
  save() {
    if (!this.allowStorage) return;
    try {
      localStorage.setItem(this.storageKey, JSON.stringify({
        v: 1,
        money: this.money,
        day: this.day,
        totalEarned: this.totalEarned,
        totalSpent: this.totalSpent,
      }));
    } catch { /* stockage plein ou indisponible : on joue quand même */ }
  }

  load() {
    if (this._loaded || !this.allowStorage) return false;
    this._loaded = true;
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || typeof data.money !== 'number' || !Number.isFinite(data.money)) return false;
      this.money = Math.max(0, Math.round(data.money));
      this.day = Math.max(1, Math.round(data.day) || 1);
      this.totalEarned = Math.max(0, Math.round(data.totalEarned) || 0);
      this.totalSpent = Math.max(0, Math.round(data.totalSpent) || 0);
      return true;
    } catch {
      return false;
    }
  }

  // Le joueur a-t-il déjà reçu sa somme de départ ? (empêche de la
  // redonner à chaque partie — l'argent se gagne, il ne pleut pas)
  hasReceivedGrant() {
    if (!this.allowStorage) return false;
    try {
      return localStorage.getItem(this.storageKey + '.grant') === '1';
    } catch { return false; }
  }

  markGrantReceived() {
    if (!this.allowStorage) return;
    try { localStorage.setItem(this.storageKey + '.grant', '1'); } catch { /* ignore */ }
  }

  reset() {
    this.money = 0;
    this.day = 1;
    this.totalEarned = 0;
    this.totalSpent = 0;
    this.history.length = 0;
    if (this.allowStorage) {
      try {
        localStorage.removeItem(this.storageKey);
        localStorage.removeItem(this.storageKey + '.grant');
      } catch { /* ignore */ }
    }
    this._emit(0, 'reset');
  }
}
