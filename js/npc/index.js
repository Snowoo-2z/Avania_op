// ============================================================
//  AVANIA — PNJ : point d'entrée
//  Le look de chaque PNJ vit dans son fichier ; ce module expose
//  un seul point de dessin (drawNpc) utilisé par la boucle de jeu.
// ============================================================

import { drawGentleman } from './gentleman.js';
import { drawMaskMerchant, drawArmorMerchant } from './merchant-look.js';
import { drawSailor } from './sailor.js';
import { getNpcNameTag, drawSpeechHint } from './base.js';

export {
  drawGentleman, GENTLEMAN_APPEARANCE, GENTLEMAN_NAME,
} from './gentleman.js';
export {
  drawMaskMerchant, drawArmorMerchant,
  MASK_MERCHANT_APPEARANCE, ARMOR_MERCHANT_APPEARANCE,
} from './merchant-look.js';
export { drawSailor, GAB_APPEARANCE, GAB_NAME } from './sailor.js';
export { getNpcNameTag, drawSpeechHint, getNpcShadow } from './base.js';

const RENDERERS = {
  gentleman: drawGentleman,
  merchantMask: drawMaskMerchant,
  merchantArmor: drawArmorMerchant,
  ferryman: drawSailor,
};

// Dessine un PNJ (corps + étiquette de nom + éventuel nuage « … »).
// `npc.time` alimente l'animation du nuage ; `npc.showHint` l'affiche.
export function drawNpc(ctx, npc) {
  const scale = npc.scale || 1;
  const draw = RENDERERS[npc.kind] || drawGentleman;
  draw(ctx, npc.x, npc.y, {
    facing: npc.facing || 'right',
    walkPhase: npc.walkPhase || 0,
    scale,
    shadow: npc.shadow !== false,
  });

  if (npc.name) {
    const tag = getNpcNameTag(npc.name, npc.title || '');
    const headY = npc.y - 34 * scale;
    ctx.drawImage(tag.canvas, npc.x - tag.w / 2, headY - tag.h, tag.w, tag.h);
  }
  if (npc.showHint) {
    drawSpeechHint(ctx, npc.x, npc.y - 30 * scale, scale, npc.time || 0);
  }
}
