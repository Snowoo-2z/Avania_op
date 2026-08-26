// ============================================================
//  AVANIA — Le comptoir de négociation
//
//  Le joueur s'approche d'un marchand, appuie sur la touche
//  d'interaction, et lui parle par écrit. Le marchand répond en
//  restant dans son rôle (voir js/merchant-ai.js) et peut faire une
//  proposition chiffrée : le joueur accepte, ou continue à discuter.
//
//  Ce module ne gère QUE l'affichage et la saisie : la logique de
//  négoce vit dans merchant.js / merchant-brain.js / merchant-ai.js.
// ============================================================

import { ITEM_DEFS } from './blocks.js';
import { getItemSprite } from './icons.js';
import { icon } from './svgicons.js';

const TYPING_DOTS = '…';

export class ChatPanel {
  constructor(root, options = {}) {
    this.root = root;
    this.isOpen = false;
    this.merchant = null;      // le PNJ (avec .state)
    this.onBuy = options.onBuy || (() => {});
    this.onSend = options.onSend || (() => Promise.resolve({ text: '', source: 'local' }));
    this.onOpenChange = options.onOpenChange || (() => {});
    this.pendingOffer = null;
    this.busy = false;
    this.history = [];
    this._timers = [];

    this.el = {
      portrait: root.querySelector('#mc-portrait'),
      name: root.querySelector('#mc-name'),
      title: root.querySelector('#mc-title'),
      mood: root.querySelector('#mc-mood'),
      log: root.querySelector('#mc-log'),
      offer: root.querySelector('#mc-offer'),
      offerIcon: root.querySelector('#mc-offer-icon'),
      offerName: root.querySelector('#mc-offer-name'),
      offerDesc: root.querySelector('#mc-offer-desc'),
      offerPrice: root.querySelector('#mc-offer-price'),
      offerBuy: root.querySelector('#mc-offer-buy'),
      offerTalk: root.querySelector('#mc-offer-talk'),
      form: root.querySelector('#mc-form'),
      input: root.querySelector('#mc-input'),
      send: root.querySelector('#mc-send'),
      close: root.querySelector('#mc-close'),
      hint: root.querySelector('#mc-hint'),
      backdrop: root.querySelector('.panel-backdrop'),
    };

    if (this.el.form) {
      this.el.form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.submit();
      });
    }
    if (this.el.offerBuy) {
      this.el.offerBuy.addEventListener('click', () => this.acceptOffer());
    }
    if (this.el.offerTalk) {
      this.el.offerTalk.addEventListener('click', () => {
        this.pendingOffer = null;
        this.renderOffer();
        this.focusInput();
      });
    }
    if (this.el.close) this.el.close.addEventListener('click', () => this.close());
    if (this.el.backdrop) this.el.backdrop.addEventListener('click', () => this.close());
  }

  // ------------------------------------------------------------
  open(merchant) {
    this.merchant = merchant;
    this.pendingOffer = null;
    this.history = [];
    this.isOpen = true;
    this.root.classList.remove('hidden');

    if (this.el.name) this.el.name.textContent = merchant.name || 'Marchand';
    if (this.el.title) this.el.title.textContent = merchant.title || '';
    if (this.el.log) this.el.log.innerHTML = '';
    this.renderOffer();
    this.paintPortrait(merchant);
    this.updateStatus();
    this.onOpenChange(true);
    this.focusInput();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.merchant = null;
    this.pendingOffer = null;
    this.root.classList.add('hidden');
    for (const t of this._timers) clearTimeout(t);
    this._timers.length = 0;
    this.onOpenChange(false);
  }

  focusInput() {
    // Un petit délai : si l'ouverture vient d'un appui sur F, on ne veut
    // pas que la touche se retrouve dans le champ.
    const t = setTimeout(() => {
      if (this.isOpen && this.el.input) this.el.input.focus();
    }, 60);
    this._timers.push(t);
  }

  // ------------------------------------------------------------
  //  Portrait : le vrai sprite du marchand, rendu une fois.
  // ------------------------------------------------------------
  paintPortrait(merchant) {
    const canvas = this.el.portrait;
    if (!canvas || typeof merchant.draw !== 'function') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    merchant.draw(ctx, canvas.width / 2, canvas.height - 4, {
      facing: 'right',
      walkPhase: 0,
      scale: 1.05,
      shadow: false,
    });
  }

  // ------------------------------------------------------------
  //  Journal de la conversation
  // ------------------------------------------------------------
  addMessage(from, text) {
    if (!text) return;
    const log = this.el.log;
    if (!log) return;
    const bubble = document.createElement('div');
    bubble.className = `mc-msg mc-msg--${from}`;
    const body = document.createElement('p');
    body.textContent = text;
    bubble.appendChild(body);
    log.appendChild(bubble);
    // On garde le journal court : 40 bulles maximum.
    while (log.children.length > 40) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
    this.history.push({ from, text });
  }

  // Les trois petits points pendant que le marchand « réfléchit ».
  showTyping() {
    const log = this.el.log;
    if (!log) return null;
    const bubble = document.createElement('div');
    bubble.className = 'mc-msg mc-msg--merchant mc-msg--typing';
    bubble.textContent = TYPING_DOTS;
    log.appendChild(bubble);
    log.scrollTop = log.scrollHeight;
    return bubble;
  }

  updateStatus() {
    const state = this.merchant && this.merchant.state;
    if (!this.el.mood || !state) return;
    const now = this._now();
    if (state.cooldownUntil && now < state.cooldownUntil) {
      const left = Math.ceil(state.cooldownUntil - now);
      this.el.mood.textContent = `Ne veut plus vous parler (${left} s)`;
      this.el.mood.className = 'mc-mood mc-mood--angry';
      return;
    }
    const patience = Math.max(0, Math.round(state.patienceLeft));
    if (patience <= 1) {
      this.el.mood.textContent = 'Il perd patience';
      this.el.mood.className = 'mc-mood mc-mood--angry';
    } else if (state.mood < 0.55) {
      this.el.mood.textContent = 'Il fronce les sourcils';
      this.el.mood.className = 'mc-mood mc-mood--warn';
    } else {
      this.el.mood.textContent = 'Il vous écoute';
      this.el.mood.className = 'mc-mood mc-mood--ok';
    }
  }

  _now() {
    return typeof this.nowFn === 'function' ? this.nowFn() : 0;
  }

  // ------------------------------------------------------------
  //  Envoi
  // ------------------------------------------------------------
  async submit() {
    const input = this.el.input;
    if (!input || this.busy || !this.merchant) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    this.addMessage('player', text);
    await this.respond(text);
  }

  // Fait répondre le marchand (IA distante ou cerveau local).
  async respond(playerText) {
    if (!this.merchant) return;
    this.busy = true;
    if (this.el.send) this.el.send.disabled = true;
    const typing = this.showTyping();

    let reply = { text: '', source: 'local' };
    try {
      reply = await this.onSend(this.merchant, playerText, this.history) || reply;
    } catch (err) {
      console.error('AVANIA: marchand', err);
      reply = { text: 'Pardon, vous pouvez répéter ?', source: 'local' };
    }

    if (typing && typing.parentNode) typing.parentNode.removeChild(typing);

    // Le marchand peut avoir mis le joueur dehors pendant l'appel.
    if (this.merchant) {
      this.applyReply(reply);
      this.updateStatus();
    }

    this.busy = false;
    if (this.el.send) this.el.send.disabled = false;
    this.focusInput();
  }

  // Interprète la réponse : réplique + éventuelle proposition chiffrée.
  applyReply(reply) {
    const parsed = typeof this.interpret === 'function'
      ? this.interpret(reply, this.merchant)
      : { speech: reply.text, offer: null, kicked: false };

    if (parsed.speech) this.addMessage('merchant', parsed.speech);

    if (parsed.offer) {
      this.pendingOffer = parsed.offer;
      this.renderOffer();
    }
    if (parsed.kicked && this.merchant) {
      this.startCooldown();
    }
  }

  // ------------------------------------------------------------
  //  Proposition d'achat
  // ------------------------------------------------------------
  renderOffer() {
    const box = this.el.offer;
    if (!box) return;
    const offer = this.pendingOffer;
    if (!offer) {
      box.classList.add('hidden');
      return;
    }
    const def = ITEM_DEFS[offer.item] || {};
    box.classList.remove('hidden');
    if (this.el.offerName) this.el.offerName.textContent = def.label || offer.item;
    if (this.el.offerDesc) {
      this.el.offerDesc.textContent = def.maxDepth
        ? `Profondeur max ${def.maxDepth} · ${def.flavor || ''}`
        : (def.flavor || '');
    }
    if (this.el.offerPrice) this.el.offerPrice.textContent = `${offer.price}`;

    // Icône de l'objet (sprite du jeu, pas d'emoji).
    if (this.el.offerIcon) {
      const sprite = getItemSprite(offer.item);
      this.el.offerIcon.innerHTML = '';
      if (sprite) {
        const img = document.createElement('img');
        img.src = sprite.toDataURL('image/png');
        img.alt = '';
        img.width = 34;
        img.height = 34;
        this.el.offerIcon.appendChild(img);
      } else {
        this.el.offerIcon.innerHTML = icon('package');
      }
    }

    // Le bouton d'achat précise tout de suite si la bourse suit.
    if (this.el.offerBuy) {
      const affordable = typeof this.canAfford === 'function'
        ? this.canAfford(offer.price)
        : true;
      this.el.offerBuy.disabled = !affordable;
      this.el.offerBuy.textContent = affordable
        ? `Acheter — ${offer.price} écus`
        : `Il vous manque de l'argent (${offer.price} écus)`;
    }
  }

  acceptOffer() {
    const offer = this.pendingOffer;
    if (!offer || !this.merchant) return;
    const done = this.onBuy(this.merchant, offer);
    if (done === false) return; // achat refusé (bourse vide…)
    this.pendingOffer = null;
    this.renderOffer();
    // Le marchand encaisse : il redevient disponible pour la suite.
    this.addMessage('merchant', this.merchant.state.id === 'aldric'
      ? 'Voilà. Bonne descente.'
      : 'Parfait, merci bien ! Revenez me voir si vous manquez de quelque chose.');
    this.focusInput();
  }

  // ------------------------------------------------------------
  //  Refus de discuter (le marchand a mis le joueur dehors)
  // ------------------------------------------------------------
  startCooldown() {
    const merchant = this.merchant;
    this.addMessage('merchant', '');
    if (this.el.input) this.el.input.disabled = true;
    if (this.el.send) this.el.send.disabled = true;
    if (this.el.hint) {
      this.el.hint.textContent = `${merchant.name} ne veut plus vous parler pour le moment.`;
      this.el.hint.classList.add('mc-hint--blocked');
    }
    this.updateStatus();
    const t = setTimeout(() => this.close(), 2600);
    this._timers.push(t);
  }

  // Le marchand redevient-il fréquentable ?
  releaseCooldown() {
    if (this.el.input) this.el.input.disabled = false;
    if (this.el.hint) this.el.hint.classList.remove('mc-hint--blocked');
    this.updateStatus();
  }
}
