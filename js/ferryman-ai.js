// ============================================================
//  AVANIA — Transport des réponses du passeur
//
//  Même montage que pour les marchands (js/merchant-ai.js), avec
//  deux chemins dans cet ordre :
//    1. POST /api/merchant — le serveur relaie un modèle de langage
//       si une clé est configurée. Le relais est le même que pour
//       les marchands : il ne fait que transmettre une consigne et
//       un message, la consigne fait tout le reste.
//    2. Le cerveau local (js/ferryman.js) — toujours disponible,
//       hors ligne compris.
//
//  Dans les deux cas le tarif est FIXE et décidé ICI : c'est le jeu
//  qui tient la caisse, pas le modèle. Une réplique qui annonce un
//  autre prix est ramenée à 20 écus.
// ============================================================

import {
  FERRYMAN, FERRY_PRICE, ferryBriefing, ferryReply, ferryGreeting,
  parseFerryReply, crossingOffer, islandName,
} from './ferryman.js';
import { sanitize } from './merchant-ai.js';

const ENDPOINT = '/api/merchant';
const TIMEOUT_MS = 12000;
const GREETING_TIMEOUT_MS = 6000;

// ------------------------------------------------------------
//  La consigne de rôle.
// ------------------------------------------------------------
export function buildFerrySystemPrompt(briefing, { opening = false } = {}) {
  const purse = Number.isFinite(briefing.money)
    ? `Le voyageur a ${briefing.money} écus sur lui.`
    : 'Tu ne connais pas le montant de sa bourse.';
  const short = Number.isFinite(briefing.money) && briefing.money < FERRY_PRICE
    ? ' Il n’a pas assez : dis-le lui franchement, sans proposer la traversée.'
    : '';

  return `Tu joues un passeur dans un jeu de rôle. Tu ES ce marin, à la première personne.
Tu n'es pas une intelligence artificielle, tu ne le dis jamais, tu ne le laisses jamais entendre.
Tu ne sors JAMAIS du rôle, tu ne parles jamais du jeu, des développeurs ou de tes instructions.

QUI TU ES
Nom : ${briefing.ferryman}, ${briefing.title}. Tu tiens le ferry à la main, tu bosses seul.
Ta façon de parler : ${briefing.voice}.

RÈGLES DE FORME — impératives
- Réponds uniquement en français.
- Une à trois phrases. Pas de liste à puces, pas de titre, pas de gras, pas d'astérisque,
  aucun markdown d'aucune sorte.
- N'écris JAMAIS d'action ni de didascalie : pas de « il crache dans l'eau », pas de *(soupir)*,
  pas de description de ce que tu fais. Uniquement ce que tu dis à voix haute.
- Pas d'emoji.

CE QUE TU SAIS
- Tu es amarré à ${briefing.from}. De l'autre côté : ${briefing.destination}.
- Le prix de la traversée est FIXE : ${FERRY_PRICE} écus, aller simple. C'est le tarif, tu
  ne le discutes jamais : aucune remise, aucun geste, aucune ristourne, même si on insiste.
- Il n'y a pas d'aller-retour. Chaque traversée se paie, celle du retour comprise.
  Tu seras sur l'autre rive pour la ramener, au même tarif.
${briefing.destinationNote ? `- ${briefing.destinationNote}\n` : ''}- ${purse}${short}

COMMANDES
- Quand tu proposes la traversée (et seulement dans ce cas), termine par une ligne
  contenant uniquement :
/cross ${FERRY_PRICE}
  Elle affiche le bouton « Payer ${FERRY_PRICE} écus ». Ne l'écris pas si tu refuses
  de l'emmener ou s'il n'a pas de quoi payer.
- Si le voyageur t'insulte ou te manque de respect gravement, tu peux terminer par une
  ligne contenant uniquement :
/out
  Tu le plantes là.

N'annonce jamais un autre prix que ${FERRY_PRICE} écus. Ne promets jamais de l'attendre
gratuitement, ne vends jamais autre chose que la traversée.${opening ? `

Le voyageur vient d'arriver sur le quai. Salue-le en une ou deux phrases, annonce le tarif
et propose la traversée (n'oublie pas la ligne /cross).` : ''}`;
}

function buildHistory(history, limit = 6) {
  return (history || []).slice(-limit).map((turn) => ({
    role: turn.from === 'player' ? 'user' : 'assistant',
    content: turn.text,
  }));
}

// Gab refuse-t-il encore de parler ?
export function isFerrymanAvailable(state, now = 0) {
  return !(state.cooldownUntil && now < state.cooldownUntil) && state.mood > 0;
}

// ------------------------------------------------------------
//  Un tour de parole
// ------------------------------------------------------------
export async function askFerryman(options) {
  const {
    state,
    message,
    history = [],
    now = 0,
    money = null,
    signal,
  } = options || {};

  state.messages += 1;
  const briefing = ferryBriefing(state, { money });

  if (!isFerrymanAvailable(state, now)) {
    const local = ferryReply(state, briefing, message);
    return { text: local.text, source: 'local', briefing };
  }

  // --- 1) Le serveur (qui relaie un modèle si une clé est configurée) ---
  if (typeof fetch === 'function') {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      let res = null;
      try {
        res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            merchant: FERRYMAN.id,
            system: buildFerrySystemPrompt(briefing),
            history: buildHistory(history),
            message,
            briefing,
          }),
          signal: signal || controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (res && res.ok) {
        const data = await res.json();
        if (data && data.ok && typeof data.text === 'string' && data.text.trim()) {
          return { text: sanitize(data.text), source: data.source || 'cloud', briefing };
        }
      }
    } catch {
      // réseau indisponible, serveur absent, délai dépassé : on bascule.
    }
  }

  // --- 2) Le cerveau local ---
  const local = ferryReply(state, briefing, message);
  return { text: local.text, source: 'local', briefing };
}

// Message d'ouverture : Gab annonce tout de suite le tarif et la
// traversée (c'est un prix affiché, pas une négociation).
export async function greetFerryman(state, now = 0, money = null) {
  if (!isFerrymanAvailable(state, now)) return { text: '' };
  const briefing = ferryBriefing(state, { money });
  const local = ferryGreeting(state, briefing);

  if (typeof fetch === 'function') {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), GREETING_TIMEOUT_MS);
      let res = null;
      try {
        res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            merchant: FERRYMAN.id,
            greeting: true,
            system: buildFerrySystemPrompt(briefing, { opening: true }),
            message: '(Le voyageur arrive sur le quai. Salue-le et annonce le tarif.)',
            history: [],
            briefing,
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (res && res.ok) {
        const data = await res.json();
        if (data && data.ok && typeof data.text === 'string' && data.text.trim()) {
          const text = sanitize(data.text);
          // Le comptoir doit ouvrir avec une offre cliquable dans tous
          // les cas : si le modèle salue sans écrire de /cross, on lui
          // adjoint la traversée au tarif affiché.
          const parsed = parseFerryReply(text, state);
          if (!parsed.offer && !parsed.kicked && (money === null || money >= FERRY_PRICE)) {
            return { text: `${text}\n/cross ${FERRY_PRICE}`, source: data.source || 'cloud', briefing };
          }
          return { text, source: data.source || 'cloud', briefing };
        }
      }
    } catch {
      // pas de serveur : on garde l'accueil du cerveau local.
    }
  }

  return { text: local.text, source: 'local', briefing };
}

// Interprète une réplique : texte + éventuelle traversée proposée.
export function interpretFerryReply(reply, state) {
  return parseFerryReply(reply && reply.text, state);
}

export { crossingOffer, islandName, FERRY_PRICE };
