// ============================================================
//  AVANIA — Le téléphone : réseau social du village
//
//  Un téléphone pixel art (touche P) avec une application : « Avania
//  Social ». On y crée un compte (pseudo + mot de passe), on se
//  connecte, on publie sur le fil, on aime les publications des autres
//  et on supprime les siennes. Le fil est UNIQUE : tous les joueurs
//  voient les mêmes publications, où qu'ils soient (surface ou grotte).
//
//  Découpage :
//    - SocialClient : les appels HTTP vers /api/social/* (voir
//      social-server.js). Le jeton de session est gardé en localStorage,
//      donc on reste connecté d'une partie à l'autre sur le même
//      navigateur.
//    - PhonePanel   : l'écran du téléphone (accueil, connexion, fil) et
//      rien d'autre — il ne sait ni dessiner le monde, ni parler le
//      protocole temps réel.
//
//  Les nouveautés du fil arrivent en direct par le WebSocket du jeu
//  (message 'social', branché dans js/main.js sur `applySocial`) : pas
//  besoin de rafraîchir pour voir ce que les autres publient.
//
//  Sécurité côté affichage : TOUT texte venant du réseau (pseudo,
//  publication) passe par textContent, jamais par innerHTML — un post ne
//  doit pas pouvoir injecter de balise dans le téléphone.
// ============================================================

import {
  sanitizeSocialHandle, sanitizeSocialPostText, sanitizeSocialPost,
  SOCIAL_HANDLE_MIN, SOCIAL_HANDLE_MAX, SOCIAL_PASSWORD_MIN, SOCIAL_POST_MAX,
} from './net-protocol.js';
import { icon } from './svgicons.js';

const TOKEN_KEY = 'avania.social.token';

function readToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}
function writeToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* stockage indisponible : la session durera le temps de l'onglet */ }
}

// Libellés des refus du serveur, pour que le joueur comprenne au lieu de
// voir un « échec » muet (les raisons viennent de social-server.js).
const REASONS = {
  taken: 'Ce pseudo est déjà pris.',
  'invalid-handle': `Pseudo invalide : ${SOCIAL_HANDLE_MIN} à ${SOCIAL_HANDLE_MAX} caractères (lettres, chiffres, _ et -).`,
  'weak-password': `Mot de passe trop court (${SOCIAL_PASSWORD_MIN} caractères minimum).`,
  invalid: 'Pseudo ou mot de passe incorrect.',
  unauthorized: 'Session expirée : reconnectez-vous.',
  'rate-limited': 'Doucement ! Réessayez dans quelques secondes.',
  'accounts-full': 'Le serveur a atteint son nombre maximal de comptes.',
  'not-found': 'Cette publication a disparu.',
  forbidden: 'Ce n\'est pas votre publication.',
  empty: 'Il faut écrire quelque chose.',
  offline: 'Réseau injoignable.',
};

export function reasonLabel(reason) {
  return REASONS[reason] || 'Ça n\'a pas marché. Réessayez.';
}

// ------------------------------------------------------------
//  Client HTTP du réseau social
// ------------------------------------------------------------
export class SocialClient {
  constructor({ baseUrl = '', token = readToken() } = {}) {
    this.baseUrl = baseUrl;
    this.token = token;
    this.account = null;
  }

  get hasSession() { return Boolean(this.token); }

  async request(path, body = null) {
    if (typeof fetch !== 'function') return { ok: false, reason: 'offline' };
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) headers['X-Avania-Token'] = this.token;
    try {
      const res = await fetch(`${this.baseUrl}/api/social${path}`, {
        method: body ? 'POST' : 'GET',
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      // Session refusée/expirée : on repart de zéro proprement, sinon
      // chaque action suivante échouerait avec le même jeton mort.
      if (data && data.reason === 'unauthorized' && this.token) {
        this.token = '';
        this.account = null;
        writeToken('');
      }
      return data || { ok: false, reason: 'offline' };
    } catch {
      return { ok: false, reason: 'offline' };
    }
  }

  async signup(handle, password) {
    const result = await this.request('/signup', { handle, password });
    if (result.ok) { this.token = result.token; this.account = result.account; writeToken(this.token); }
    return result;
  }

  async login(handle, password) {
    const result = await this.request('/login', { handle, password });
    if (result.ok) { this.token = result.token; this.account = result.account; writeToken(this.token); }
    return result;
  }

  async logout() {
    if (this.token) await this.request('/logout', {});
    this.token = '';
    this.account = null;
    writeToken('');
    return { ok: true };
  }

  // Renvoie le fil (et, si on est connecté, notre compte) — c'est aussi
  // ce qui valide un jeton retrouvé dans localStorage après un rechargement.
  async feed() {
    const result = await this.request('/feed');
    if (result.ok) this.account = result.account || null;
    return result;
  }

  post(text) { return this.request('/post', { text }); }
  like(id) { return this.request('/like', { id }); }
  unlike(id) { return this.request('/unlike', { id }); }
  remove(id) { return this.request('/delete', { id }); }
}

// ------------------------------------------------------------
//  « il y a 3 min » : le fil affiche des heures relatives, plus lisibles
//  que des horodatages bruts (et insensibles au fuseau du joueur).
// ------------------------------------------------------------
export function timeAgo(ts, now = Date.now()) {
  const s = Math.max(0, Math.round((now - Number(ts)) / 1000));
  if (s < 10) return 'à l\'instant';
  if (s < 60) return `il y a ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
}

// ------------------------------------------------------------
//  L'écran du téléphone
// ------------------------------------------------------------
export class PhonePanel {
  constructor(root, options = {}) {
    this.root = root;
    this.client = options.client || new SocialClient();
    this.onOpenChange = options.onOpenChange || (() => {});
    this.isOpen = false;
    this.authMode = 'signup'; // 'signup' | 'login'
    this.posts = [];
    this.busy = false;

    this.el = {
      home: root.querySelector('#phone-home'),
      auth: root.querySelector('#phone-auth'),
      feed: root.querySelector('#phone-feed'),
      title: root.querySelector('#phone-title'),
      clock: root.querySelector('#phone-clock'),
      close: root.querySelector('#phone-close'),
      backdrop: root.querySelector('.panel-backdrop'),
      appSocial: root.querySelector('#phone-app-social'),
      appBadge: root.querySelector('#phone-app-badge'),
      authForm: root.querySelector('#phone-auth-form'),
      authTitle: root.querySelector('#phone-auth-title'),
      authHandle: root.querySelector('#phone-auth-handle'),
      authPass: root.querySelector('#phone-auth-pass'),
      authError: root.querySelector('#phone-auth-error'),
      authSubmit: root.querySelector('#phone-auth-submit'),
      authSwitch: root.querySelector('#phone-auth-switch'),
      socialBack: root.querySelector('#social-back'),
      socialLogout: root.querySelector('#social-logout'),
      socialMe: root.querySelector('#social-me'),
      compose: root.querySelector('#social-compose'),
      composeText: root.querySelector('#social-text'),
      composeCount: root.querySelector('#social-count'),
      publish: root.querySelector('#social-publish'),
      feedList: root.querySelector('#social-feed'),
      feedStatus: root.querySelector('#social-status'),
    };

    this.el.close?.addEventListener('click', () => this.close());
    this.el.backdrop?.addEventListener('click', () => this.close());
    this.el.appSocial?.addEventListener('click', () => this.openSocial());
    this.el.socialBack?.addEventListener('click', () => this.showHome());
    this.el.socialLogout?.addEventListener('click', () => this.logout());
    this.el.authForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submitAuth();
    });
    this.el.authSwitch?.addEventListener('click', () => {
      this.setAuthMode(this.authMode === 'signup' ? 'login' : 'signup');
    });
    this.el.compose?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.publish();
    });
    this.el.composeText?.addEventListener('input', () => this.updateCount());
    this.el.composeText?.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + Entrée publie ; Échap rend la main au jeu.
      if ((e.key || '').toLowerCase() === 'escape') { e.preventDefault(); this.close(); }
      if ((e.key || '') === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.publish(); }
    });

    this.setAuthMode('signup');
    this.updateCount();
  }

  // ------------------------------------------------------------
  //  Ouverture / fermeture
  // ------------------------------------------------------------
  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.root.classList.remove('hidden');
    this.paintClock();
    if (this.client.hasSession) this.openSocial();
    else this.showAuth();
    this.onOpenChange(true);
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.classList.add('hidden');
    this.onOpenChange(false);
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  showHome() {
    this.el.auth?.classList.add('hidden');
    this.el.feed?.classList.add('hidden');
    this.el.home?.classList.remove('hidden');
    this.paintClock();
  }

  showAuth() {
    this.el.feed?.classList.add('hidden');
    this.el.home?.classList.add('hidden');
    this.el.auth?.classList.remove('hidden');
    this.setAuthMode(this.authMode);
    this.focusAuth();
  }

  showFeed() {
    this.el.auth?.classList.add('hidden');
    this.el.home?.classList.add('hidden');
    this.el.feed?.classList.remove('hidden');
    this.paintMe();
    this.refreshFeed();
  }

  focusAuth() {
    // Petit délai : la touche qui vient d'ouvrir le téléphone (P) ne doit
    // pas finir dans le champ.
    setTimeout(() => {
      if (this.isOpen) (this.el.authHandle || this.el.composeText)?.focus();
    }, 60);
  }

  paintClock() {
    if (!this.el.clock) return;
    const d = new Date();
    this.el.clock.textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  // ------------------------------------------------------------
  //  Connexion / création de compte
  // ------------------------------------------------------------
  setAuthMode(mode) {
    this.authMode = mode === 'login' ? 'login' : 'signup';
    const signup = this.authMode === 'signup';
    if (this.el.authTitle) {
      this.el.authTitle.textContent = signup ? 'Créer un compte' : 'Se connecter';
    }
    if (this.el.authSubmit) this.el.authSubmit.textContent = signup ? 'Créer le compte' : 'Se connecter';
    if (this.el.authSwitch) {
      this.el.authSwitch.textContent = signup ? 'J\'ai déjà un compte' : 'Créer un compte';
    }
    if (this.el.authError) this.el.authError.textContent = '';
  }

  async submitAuth() {
    if (this.busy) return;
    const handle = sanitizeSocialHandle(this.el.authHandle?.value || '');
    const password = String(this.el.authPass?.value || '');
    if (handle.length < SOCIAL_HANDLE_MIN) {
      this.authError(`Pseudo trop court (${SOCIAL_HANDLE_MIN} caractères minimum).`);
      return;
    }
    if (password.length < SOCIAL_PASSWORD_MIN) {
      this.authError(`Mot de passe trop court (${SOCIAL_PASSWORD_MIN} caractères minimum).`);
      return;
    }
    this.busy = true;
    if (this.el.authSubmit) this.el.authSubmit.disabled = true;
    const result = this.authMode === 'signup'
      ? await this.client.signup(handle, password)
      : await this.client.login(handle, password);
    this.busy = false;
    if (this.el.authSubmit) this.el.authSubmit.disabled = false;
    if (!result?.ok) {
      this.authError(reasonLabel(result?.reason));
      return;
    }
    if (this.el.authPass) this.el.authPass.value = '';
    this.openSocial();
  }

  authError(message) {
    if (this.el.authError) this.el.authError.textContent = message;
  }

  async logout() {
    await this.client.logout();
    this.posts = [];
    this.renderFeed();
    this.showAuth();
  }

  // ------------------------------------------------------------
  //  Le fil
  // ------------------------------------------------------------
  async openSocial() {
    this.showFeed();
  }

  paintMe() {
    const handle = this.client.account?.handle || '';
    if (this.el.socialMe) this.el.socialMe.textContent = handle ? `@${handle}` : '';
    if (this.el.socialLogout) this.el.socialLogout.classList.toggle('hidden', !handle);
  }

  updateCount() {
    const len = (this.el.composeText?.value || '').length;
    if (this.el.composeCount) this.el.composeCount.textContent = `${len}/${SOCIAL_POST_MAX}`;
    if (this.el.publish) this.el.publish.disabled = len === 0 || this.busy;
  }

  async refreshFeed() {
    const result = await this.client.feed();
    if (!result?.ok) {
      this.feedStatus(reasonLabel(result?.reason));
      return;
    }
    // Un jeton retrouvé dans localStorage peut avoir expiré (le serveur
    // ne garde les sessions qu'en mémoire) : le fil répond quand même,
    // mais sans compte associé. On repasse alors par la connexion plutôt
    // que de laisser le joueur publier pour rien.
    if (this.client.hasSession && !result.account) {
      await this.client.logout();
      this.showAuth();
      return;
    }
    this.posts = Array.isArray(result.posts) ? result.posts.map(sanitizeSocialPost).filter(Boolean) : [];
    this.feedStatus('');
    this.paintMe();
    this.renderFeed();
  }

  feedStatus(message) {
    if (this.el.feedStatus) this.el.feedStatus.textContent = message || '';
  }

  async publish() {
    const text = sanitizeSocialPostText(this.el.composeText?.value || '');
    if (!text || this.busy) return;
    this.busy = true;
    this.updateCount();
    const result = await this.client.post(text);
    this.busy = false;
    this.updateCount();
    if (!result?.ok) {
      this.feedStatus(reasonLabel(result?.reason));
      return;
    }
    if (this.el.composeText) this.el.composeText.value = '';
    this.feedStatus('');
    // Le WebSocket nous renverra aussi ce post (message 'social') :
    // upsertPost le reconnaît par son id et ne le duplique pas.
    this.upsertPost(result.post);
    this.renderFeed();
  }

  async toggleLike(post) {
    if (!post || this.busy) return;
    const mine = post.likedBy.includes(this.client.account?.handle || '');
    const result = mine ? await this.client.unlike(post.id) : await this.client.like(post.id);
    if (!result?.ok) {
      this.feedStatus(reasonLabel(result?.reason));
      return;
    }
    this.upsertPost(result.post);
    this.renderFeed();
  }

  async deletePost(post) {
    if (!post || this.busy) return;
    const result = await this.client.remove(post.id);
    if (!result?.ok) {
      this.feedStatus(reasonLabel(result?.reason));
      return;
    }
    this.posts = this.posts.filter((p) => p.id !== post.id);
    this.feedStatus('');
    this.renderFeed();
  }

  // ------------------------------------------------------------
  //  Mise à jour en direct (poussée par le WebSocket du jeu)
  // ------------------------------------------------------------
  applySocial(payload) {
    if (!payload) return;
    if (payload.event === 'delete') {
      this.posts = this.posts.filter((p) => p.id !== payload.id);
    } else if (payload.post) {
      this.upsertPost(payload.post);
    } else {
      return;
    }
    // La pastille de l'écran d'accueil doit rester juste même téléphone
    // fermé : c'est elle qui dit qu'il se passe quelque chose sur le fil.
    this.paintBadge();
    if (this.isOpen) this.renderFeed();
  }

  // Insère ou remplace une publication, en gardant le fil trié du plus
  // récent au plus ancien (comme le renvoie le serveur).
  upsertPost(post) {
    const clean = sanitizeSocialPost(post);
    if (!clean) return;
    const at = this.posts.findIndex((p) => p.id === clean.id);
    if (at >= 0) this.posts[at] = clean;
    else {
      this.posts.push(clean);
      this.posts.sort((a, b) => b.ts - a.ts);
    }
  }

  // ------------------------------------------------------------
  //  Rendu du fil
  //
  //  Reconstruit la liste à chaque changement : un fil de quelques
  //  dizaines de posts ne mérite pas de DOM virtuel, et c'est le moyen
  //  le plus simple de garantir qu'aucun texte distant n'est jamais
  //  injecté en HTML (tout passe par textContent).
  // ------------------------------------------------------------
  renderFeed() {
    const list = this.el.feedList;
    if (!list) return;
    list.innerHTML = '';
    if (this.posts.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'social-empty';
      empty.textContent = 'Personne n\'a encore publié. Soyez le premier !';
      list.appendChild(empty);
      this.paintBadge();
      return;
    }
    const me = this.client.account?.handle || '';
    for (const post of this.posts) list.appendChild(this.renderPost(post, me));
    this.paintBadge();
  }

  renderPost(post, me) {
    const card = document.createElement('article');
    card.className = 'social-post';
    card.dataset.id = post.id;

    const head = document.createElement('header');
    head.className = 'social-post-head';
    const avatar = document.createElement('span');
    avatar.className = 'social-avatar';
    avatar.textContent = (post.handle || '?').slice(0, 1).toUpperCase();
    avatar.style.background = avatarColor(post.handle);
    const who = document.createElement('span');
    who.className = 'social-post-who';
    who.textContent = `@${post.handle}`;
    if (post.handle === me) who.classList.add('is-me');
    const when = document.createElement('span');
    when.className = 'social-post-when';
    when.textContent = timeAgo(post.ts);
    head.append(avatar, who, when);

    const body = document.createElement('p');
    body.className = 'social-post-text';
    body.textContent = post.text;

    const actions = document.createElement('footer');
    actions.className = 'social-post-actions';
    const like = document.createElement('button');
    like.type = 'button';
    like.className = 'social-like';
    const liked = post.likedBy.includes(me);
    if (liked) like.classList.add('is-liked');
    like.innerHTML = icon('heart');
    const likeCount = document.createElement('span');
    likeCount.textContent = `${post.likes} j'aime`;
    like.append(likeCount);
    like.title = liked ? 'Retirer mon j\'aime' : 'J\'aime';
    like.addEventListener('click', () => this.toggleLike(post));
    actions.appendChild(like);

    if (post.handle === me) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'social-delete';
      del.textContent = 'Supprimer';
      del.addEventListener('click', () => this.deletePost(post));
      actions.appendChild(del);
    }

    card.append(head, body, actions);
    return card;
  }

  // Pastille sur l'icône de l'appli (accueil du téléphone) : le nombre de
  // publications du fil, pour savoir d'un coup d'œil s'il se passe
  // quelque chose sans ouvrir le téléphone.
  paintBadge() {
    const badge = this.el.appBadge;
    if (!badge) return;
    const n = this.posts.length;
    badge.textContent = n > 99 ? '99+' : String(n);
    badge.classList.toggle('hidden', n === 0);
  }
}

// Couleur d'avatar déterministe à partir du pseudo : deux joueurs ne se
// retrouvent jamais avec la même couleur « par hasard », et un même
// pseudo garde sa couleur d'une session à l'autre.
export function avatarColor(handle) {
  const s = String(handle || '?');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return `hsl(${h} 42% 38%)`;
}
