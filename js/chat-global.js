// ============================================================
//  AVANIA — Chat : canal global (toujours visible) + talkie-walkie
//
//  Deux canaux, UNE seule fenêtre (pas de panneau à ouvrir/fermer) :
//    - GLOBAL     : tout le serveur, quelle que soit la zone. C'est le
//                   mode par défaut ; on clique dans le champ, on écrit,
//                   Entrée. Aucune touche à apprendre.
//    - PROXIMITÉ  : le talkie-walkie (touche V, ou le bouton du canal).
//                   Le message ne part qu'aux joueurs proches — le
//                   filtrage est fait par le SERVEUR (net-server.js
//                   relayChat), pas ici : un client ne peut donc pas
//                   tricher sur sa portée. Ces messages s'affichent
//                   aussi en bulle au-dessus des joueurs (js/game.js
//                   showBubble), ce qui les rend lisibles sans regarder
//                   la fenêtre.
//
//  La fenêtre est volontairement discrète : dernier messages visibles,
//  puis estompés après quelques secondes (on ne joue pas dans du texte),
//  et opaque tant qu'on écrit ou qu'on la survole.
//
//  Ce module ne connaît PAS le réseau : il appelle `onSend(text,
//  channel)` (branché sur js/net.js par js/main.js) et affiche ce qu'on
//  lui donne via `push()`. En solo / hors ligne, il affiche les
//  messages localement et signale l'état de la connexion.
// ============================================================

import { CHAT_GLOBAL, CHAT_PROXIMITY } from './net-protocol.js';

// Nombre de messages gardés dans le DOM (au-delà, les plus anciens sont
// retirés : une longue session ne doit pas gonfler la page).
const MAX_LINES = 60;
// Au bout de ce délai, un message passe en « ancien » : estompé, pour
// que la fenêtre ne masque pas le jeu. Un nouveau message remet tout le
// monde au premier plan (on lit toujours le fil du bas vers le haut).
const FRESH_MS = 12_000;
const AGE_CHECK_MS = 2_000;

export class GlobalChat {
  constructor(root, options = {}) {
    this.root = root;
    this.onSend = options.onSend || (() => false);
    this.onOpenChange = options.onOpenChange || (() => {});
    this.channel = CHAT_GLOBAL;
    this.online = false;
    this.typing = false;
    this.offlineHintShown = false; // l'avertissement « hors ligne » n'est dit qu'une fois
    this._ageTimer = null;

    this.el = {
      log: root.querySelector('#gchat-log'),
      form: root.querySelector('#gchat-form'),
      input: root.querySelector('#gchat-input'),
      channelBtn: root.querySelector('#gchat-channel'),
      channelLabel: root.querySelector('#gchat-channel-label'),
      status: root.querySelector('#gchat-status'),
    };

    if (this.el.form) {
      this.el.form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.submit();
      });
    }
    if (this.el.channelBtn) {
      this.el.channelBtn.addEventListener('click', () => this.toggleChannel());
    }
    if (this.el.input) {
      this.el.input.addEventListener('focus', () => {
        this.typing = true;
        this.root.classList.add('is-active');
        this.onOpenChange(true);
      });
      this.el.input.addEventListener('blur', () => {
        this.typing = false;
        this.root.classList.remove('is-active');
        this.onOpenChange(false);
      });
      // Échap dans le champ : on rend la main au jeu (sinon la touche
      // reste « coincée » dans l'entrée et le joueur ne peut plus fuir).
      this.el.input.addEventListener('keydown', (e) => {
        if ((e.key || '').toLowerCase() === 'escape') {
          e.preventDefault();
          this.el.input.blur();
        }
      });
    }

    this._startAging();
    this.paintChannel();
  }

  // ------------------------------------------------------------
  //  Canaux
  // ------------------------------------------------------------
  setChannel(channel) {
    this.channel = channel === CHAT_PROXIMITY ? CHAT_PROXIMITY : CHAT_GLOBAL;
    this.paintChannel();
  }

  // Bascule global <-> proximité. Appelé par la touche du talkie-walkie
  // (js/keys.js : 'proximityChat') ET par le bouton de la fenêtre : les
  // deux doivent rester d'accord, d'où un seul point d'entrée.
  toggleChannel() {
    this.setChannel(this.channel === CHAT_PROXIMITY ? CHAT_GLOBAL : CHAT_PROXIMITY);
  }

  paintChannel() {
    const proximity = this.channel === CHAT_PROXIMITY;
    this.root.classList.toggle('is-proximity', proximity);
    if (this.el.channelLabel) {
      this.el.channelLabel.textContent = proximity ? 'Proximité' : 'Global';
    }
    if (this.el.channelBtn) {
      this.el.channelBtn.setAttribute(
        'title',
        proximity
          ? 'Talkie-walkie : seuls les joueurs proches vous entendent (V pour rebasculer)'
          : 'Canal global : tout le serveur vous lit (V pour le talkie-walkie)',
      );
      this.el.channelBtn.setAttribute('aria-pressed', String(proximity));
    }
    if (this.el.input) {
      this.el.input.placeholder = proximity
        ? 'Parler aux joueurs proches…'
        : 'Cliquez pour écrire…';
    }
  }

  // ------------------------------------------------------------
  //  État de la connexion (best effort, comme le reste du réseau)
  // ------------------------------------------------------------
  setOnline(online) {
    const next = Boolean(online);
    if (next === this.online) return;
    this.online = next;
    this.root.classList.toggle('is-offline', !next);
    if (this.el.status) {
      this.el.status.textContent = next ? '' : 'hors ligne';
      this.el.status.title = next ? '' : 'Serveur injoignable : vos messages restent locaux.';
    }
  }

  // ------------------------------------------------------------
  //  Affichage
  // ------------------------------------------------------------
  // Ajoute une ligne au journal. `msg` : { from, text, channel, self,
  // system }. Tout est écrit en textContent : jamais d'innerHTML avec du
  // texte venant du réseau (un pseudo ou un message ne doit pas pouvoir
  // injecter de balise).
  push(msg) {
    const log = this.el.log;
    if (!log || !msg) return;
    const text = String(msg.text || '').trim();
    if (!text) return;

    const line = document.createElement('div');
    line.className = 'gchat-msg';
    if (msg.system) line.classList.add('gchat-msg--system');
    if (msg.self) line.classList.add('gchat-msg--self');
    if (msg.channel === CHAT_PROXIMITY) line.classList.add('gchat-msg--proximity');
    line.dataset.at = String(Date.now());

    if (!msg.system) {
      const who = document.createElement('span');
      who.className = 'gchat-who';
      who.textContent = msg.self ? 'vous' : (msg.from || 'Aventurier');
      line.appendChild(who);
    }
    const body = document.createElement('span');
    body.className = 'gchat-text';
    body.textContent = text;
    line.appendChild(body);

    log.appendChild(line);
    while (log.children.length > MAX_LINES) log.removeChild(log.firstChild);
    // Un nouveau message remet tout le fil au premier plan : on vient de
    // le regarder, il n'y a pas de raison de l'estomper tout de suite.
    this._refreshAging();
    log.scrollTop = log.scrollHeight;
  }

  // Ligne « système » (état de la connexion, astuce…), sans auteur.
  system(text) {
    this.push({ text, system: true });
  }

  // ------------------------------------------------------------
  //  Envoi
  // ------------------------------------------------------------
  submit() {
    const input = this.el.input;
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    // onSend renvoie true si le message est réellement parti sur le
    // réseau. En solo/hors ligne il reste affiché localement (et on le
    // dit), plutôt que de disparaître silencieusement.
    const sent = this.onSend(text, this.channel) === true;
    this.push({ from: '', text, channel: this.channel, self: true });
    if (!sent && !this.offlineHintShown) {
      this.offlineHintShown = true;
      this.system('Hors ligne : vos messages ne partent pas.');
    }
    if (sent) this.offlineHintShown = false;
    input.focus();
  }

  focusInput() {
    if (this.el.input) this.el.input.focus();
  }

  // ------------------------------------------------------------
  //  Estompage des anciens messages
  // ------------------------------------------------------------
  _startAging() {
    this._ageTimer = setInterval(() => this._refreshAging(), AGE_CHECK_MS);
    // Un onglet fermé ne doit pas rester accroché à ce minuteur.
    this._ageTimer.unref?.();
  }

  _refreshAging() {
    const log = this.el.log;
    if (!log) return;
    const now = Date.now();
    for (const line of log.children) {
      const at = Number(line.dataset.at || now);
      line.classList.toggle('is-old', now - at > FRESH_MS);
    }
  }

  destroy() {
    if (this._ageTimer) clearInterval(this._ageTimer);
  }
}
