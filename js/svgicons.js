// ============================================================
//  AVANIA — Icônes SVG « plein pixel art »
//  Remplacent tous les emojis de l'interface par de vraies icônes
//  vectorielles (currentColor, donc elles suivent la couleur du texte).
//
//  Utilisation :
//    - HTML statique :  <span data-icon="gear"></span>  -> mountIcons()
//    - JS dynamique  :  el.innerHTML = icon('lock');
// ============================================================

// wrap() construit le markup <svg> final. IMPORTANT : si l'icône fournit
// de la donnée de path brute (« M12 12c… »), il faut l'envelopper dans un
// <path d="…"> — sinon c'est du texte brut ignoré par le rendu SVG (rien
// ne s'affiche). Si l'icône fournit déjà des éléments (<rect>, <g>…), on
// les utilise tels quels.
const wrap = (inner) => {
  const body = inner.trimStart().startsWith('<')
    ? inner
    : `<path d="${inner}"/>`;
  return `<svg class="ic-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">${body}</svg>`;
};

// Chaque icône est un chemin plein (silhouette), style cohérent avec le
// rendu voxel du jeu.
export const ICONS = {
  user: wrap('M12 12c2.2 0 4-1.8 4-4s-1.8-4-4-4-4 1.8-4 4 1.8 4 4 4zm0 2c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4z'),

  gear: wrap('<path fill-rule="evenodd" d="M22.31 10.00 L22.31 14.00 L19.67 15.18 L20.70 17.87 L17.87 20.70 L15.18 19.67 L14.00 22.31 L10.00 22.31 L8.82 19.67 L6.13 20.70 L3.30 17.87 L4.33 15.18 L1.69 14.00 L1.69 10.00 L4.33 8.82 L3.30 6.13 L6.13 3.30 L8.82 4.33 L10.00 1.69 L14.00 1.69 L15.18 4.33 L17.87 3.30 L20.70 6.13 L19.67 8.82 Z M16.2 12 A4.2 4.2 0 1 0 7.8 12 A4.2 4.2 0 1 0 16.2 12 Z"/>'),

  backpack: wrap('M8 4a3 3 0 016 0v1h1a4 4 0 014 4v9a3 3 0 01-3 3H6a3 3 0 01-3-3V9a4 4 0 014-4h1V4zm1 8a1 1 0 000 2h6a1 1 0 000-2H9z'),

  package: wrap('<rect x="3" y="7" width="18" height="14" rx="1.5"/><path d="M3 7l3-3h12l3 3z"/><rect x="11" y="7" width="2" height="14" fill="rgba(0,0,0,.22)"/>'),

  book: wrap('M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.4.5.4.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.15.5-.4V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5z'),

  fire: wrap('M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z'),

  gamepad: wrap('M21.58 16.09l-1.09-7.66C20.21 6.46 18.52 5 16.53 5H7.47C5.48 5 3.79 6.46 3.51 8.43l-1.09 7.66C2.2 17.63 3.39 19 4.94 19c.68 0 1.32-.27 1.8-.75L9 16h6l2.25 2.25c.48.48 1.13.75 1.8.75 1.56 0 2.75-1.37 2.53-2.91zM11 11H9v2H8v-2H6v-1h2V8h1v2h2v1zm4-1c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm2 3c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z'),

  mouse: wrap('M13 1.07V9h7c0-4.08-3.05-7.44-7-7.93zM4 15c0 4.42 3.58 8 8 8s8-3.58 8-8v-4H4v4zm7-13.93C7.05 1.56 4 4.92 4 9h7V1.07z'),

  bolt: wrap('M11 21h-1l1-7H7.5c-.58 0-.57-.32-.38-.66.19-.34.05-.08.07-.12C8.48 10.94 10.42 7.54 13 3h1l-1 7h3.5c.49 0 .56.33.47.51l-.07.15C12.96 17.55 11 21 11 21z'),

  dice: wrap('<rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="8" cy="8" r="1.6"/><circle cx="16" cy="8" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="8" cy="16" r="1.6"/><circle cx="16" cy="16" r="1.6"/>'),

  lock: wrap('M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM9 8V6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9z'),

  check: wrap('M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z'),

  hammer: wrap('<g transform="rotate(-40 12 12)"><rect x="3" y="8" width="13" height="6" rx="1.3"/><rect x="12" y="11" width="3.2" height="11" rx="1.5"/></g>'),

  arrowRight: wrap('M4 11h12.17l-5.59-5.59L12 4l8 8-8 8-1.41-1.41L16.17 13H4z'),

  close: wrap('<rect x="3.5" y="10.9" width="17" height="2.2" rx="1.1" transform="rotate(45 12 12)"/><rect x="3.5" y="10.9" width="17" height="2.2" rx="1.1" transform="rotate(-45 12 12)"/>'),

  // Pièce de monnaie : disque plein + couronne intérieure + encoche.
  coin: wrap('<circle cx="12" cy="12" r="9.2"/><circle cx="12" cy="12" r="6.4" fill="rgba(0,0,0,.28)"/><path d="M12 7.6l1.5 3 3.3.5-2.4 2.3.6 3.3-3-1.6-3 1.6.6-3.3L7.2 11l3.3-.5z" fill="rgba(255,255,255,.55)"/>'),

  // Entrée de grotte : arche pleine ouvrant sur le noir.
  cave: wrap('M2 21V13c0-5 4.5-9 10-9s10 4 10 9v8h-4v-8c0-3-2.7-5-6-5s-6 2-6 5v8z'),

  // Masque respiratoire.
  mask: wrap('M4 9c0-1.1.9-2 2-2h12c1.1 0 2 .9 2 2v4.5c0 3.6-2.9 6.5-6.5 6.5h-3C6.9 20 4 17.1 4 13.5z"/><circle cx="9" cy="12" r="2" fill="rgba(0,0,0,.4)"/><circle cx="15" cy="12" r="2" fill="rgba(0,0,0,.4)"/>'),

  // Armure / plastron.
  armor: wrap('M12 2l7 3v6.2c0 4.6-3 8.6-7 10.8-4-2.2-7-6.2-7-10.8V5z" /><path d="M12 5.6l3.6 1.5v4.1c0 2.6-1.5 5-3.6 6.4-2.1-1.4-3.6-3.8-3.6-6.4V7.1z" fill="rgba(0,0,0,.28)'),

  chevronUp: wrap('M12 5l9 9-1.4 1.4L12 7.8 4.4 15.4 3 14z'),
  chevronDown: wrap('M12 19l-9-9 1.4-1.4L12 16.2l7.6-7.6L21 10z'),
  chevronLeft: wrap('M5 12l9-9 1.4 1.4L7.8 12l7.6 7.6L14 21z'),
  chevronRight: wrap('M19 12l-9 9-1.4-1.4L16.2 12 8.6 4.4 10 3z'),
};

// Renvoie le markup SVG d'une icône (pour injection en JS).
export function icon(name) {
  return ICONS[name] || '';
}

// Remplit tous les <[data-icon]> du document par l'icône correspondante.
// À appeler une fois le DOM chargé (les modules ES sont différés : OK).
export function mountIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    const name = el.dataset.icon;
    const svg = ICONS[name];
    if (svg) el.innerHTML = svg;
    else el.classList.add('ic-missing');
  });
}
