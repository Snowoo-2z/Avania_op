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
//
//  OÙ VIT L'ARGENT. Deux modes, au choix de l'appelant :
//    - sans `store` : la bourse tient son propre compteur (comportement
//      historique, toujours utilisé par les tests de logique pure) ;
//    - avec un `store` : l'argent est une PILE D'OBJETS dans
//      l'inventaire du joueur (l'objet `coin` de js/blocks.js). Il n'y a
//      plus de compteur interne : `wallet.money` compte les pièces,
//      `add()` en ajoute, `spend()` en retire. L'argent devient un objet
//      comme un autre — il prend une case, on peut le lâcher au sol
//      (touche Q) ou le ranger dans un coffre, donc le perdre ou se le
//      faire voler.
//
//  Conséquence assumée du mode « inventaire » : l'inventaire n'est pas
//  sauvegardé d'une session à l'autre (le monde non plus), donc l'argent
//  non plus. La somme de bienvenue est remise à CHAQUE arrivée sur l'île
//  (voir shouldGrant) au lieu d'une seule fois pour la vie du navigateur.
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
    // Stockage délégué à l'inventaire : { count(), add(n) -> ajouté,
    // remove(n) -> bool }. Null = compteur interne (mode historique).
    this.store = options.store || null;
    this._money = 0;
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
  //  Le solde
  //
  //  Accesseur plutôt que champ : tout le code existant (marchands,
  //  cinématique, tests) lit `wallet.money` et quelques endroits
  //  l'écrivent. En mode « inventaire », lire = compter les pièces,
  //  écrire = ajouter/retirer la différence. Personne n'a à savoir où
  //  l'argent est rangé.
  // ------------------------------------------------------------
  get money() {
    return this.store ? this.store.count() : this._money;
  }

  set money(value) {
    const n = Math.max(0, Math.round(Number(value) || 0));
    if (!this.store) { this._money = n; return; }
    const delta = n - this.store.count();
    if (delta > 0) this.store.add(delta);
    else if (delta < 0) this.store.remove(-delta);
  }

  // ------------------------------------------------------------
  //  Opérations
  // ------------------------------------------------------------
  canAfford(amount) {
    return amount >= 0 && this.money >= amount;
  }

  // Ajoute de l'argent. Retourne le montant réellement ajouté — en mode
  // « inventaire » il peut être INFÉRIEUR à la demande si les cases sont
  // pleines (l'argent est un objet : il lui faut de la place).
  add(amount, reason = '') {
    const n = Math.max(0, Math.round(Number(amount) || 0));
    if (n === 0) return 0;
    const added = this.store ? this.store.add(n) : n;
    if (!this.store) this._money += n;
    if (added <= 0) return 0;
    this.totalEarned += added;
    this._pushHistory(added, reason);
    this.save();
    this._emit(added, reason);
    return added;
  }

  // Dépense de l'argent. Retourne true si la transaction a eu lieu.
  // Aucun découvert possible : c'est la règle d'or de l'économie du jeu.
  spend(amount, reason = '') {
    const n = Math.max(0, Math.round(Number(amount) || 0));
    if (n === 0) return true;
    if (this.money < n) return false;
    if (this.store) this.store.remove(n);
    else this._money -= n;
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
        // En mode « inventaire », l'argent vit dans les cases du joueur :
        // rien à persister ici (et l'inventaire, lui, ne survit pas à la
        // session — c'est le compromis assumé de ce mode).
        money: this.store ? 0 : this._money,
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
      if (!this.store) this._money = Math.max(0, Math.round(data.money));
      this.day = Math.max(1, Math.round(data.day) || 1);
      this.totalEarned = Math.max(0, Math.round(data.totalEarned) || 0);
      this.totalSpent = Math.max(0, Math.round(data.totalSpent) || 0);
      return true;
    } catch {
      return false;
    }
  }

  // La somme de bienvenue doit-elle être versée maintenant ?
  // En mode « inventaire », oui à chaque arrivée sur l'île : l'argent
  // d'une session précédente a disparu avec l'inventaire, refuser la
  // somme laisserait le joueur définitivement sans un sou.
  shouldGrant() {
    return this.store ? true : !this.hasReceivedGrant();
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
    this.money = 0; // retire aussi les pièces de l'inventaire, le cas échéant
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
