// ============================================================
//  AVANIA — Gestion des entrées (clavier + souris + molette)
//  Toutes les actions passent par les raccourcis personnalisables
//  (js/keys.js). On expose deux primitives :
//    - down(actionId)    : l'action est maintenue (mouvement, minage…)
//    - pressed(actionId) : l'action vient d'être enfoncée CE frame
//                          (edge, consommé une seule fois)
// ============================================================

import { bindings } from './keys.js';

const INV_SQRT2 = 1 / Math.sqrt(2);

export class Input {
  constructor() {
    this.keys = new Set(); // touches actuellement maintenues
    this.keyEdges = new Set(); // touches enfoncées ce frame (edge)
    this._dir = { x: 0, y: 0 };
    this.mouse = {
      x: 0, y: 0,
      leftClicked: false, rightClicked: false, middleClicked: false,
      leftDown: false, rightDown: false, middleDown: false,
      wheel: 0,
    };

    this.onKeyDown = (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      const k = e.key.toLowerCase();
      // Edge : uniquement au vrai passage « relâché -> enfoncé », pas aux
      // répétitions du système (sinon une touche maintenue se déclencherait
      // en boucle sur les actions « appuyé »).
      if (!this.keys.has(k)) this.keyEdges.add(k);
      this.keys.add(k);
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) {
        e.preventDefault();
      }
    };
    this.onKeyUp = (e) => {
      this.keys.delete(e.key.toLowerCase());
    };
    this.onBlur = () => {
      this.keys.clear();
      this.keyEdges.clear();
      this.mouse.leftDown = this.mouse.rightDown = this.mouse.middleDown = false;
    };

    this.onMouseMove = (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    };
    this.onMouseDown = (e) => {
      // Les boutons et les cases de l'interface ne doivent jamais devenir
      // une action de minage dans le canvas derrière eux.
      if (e.target && e.target.tagName !== 'CANVAS') return;
      if (e.button === 0) { this.mouse.leftClicked = true; this.mouse.leftDown = true; }
      else if (e.button === 2) { this.mouse.rightClicked = true; this.mouse.rightDown = true; }
      else if (e.button === 1) { this.mouse.middleClicked = true; this.mouse.middleDown = true; }
    };
    this.onMouseUp = (e) => {
      if (e.button === 0) this.mouse.leftDown = false;
      else if (e.button === 2) this.mouse.rightDown = false;
      else if (e.button === 1) this.mouse.middleDown = false;
    };
    this.onContextMenu = (e) => e.preventDefault();
    this.onWheel = (e) => {
      this.mouse.wheel += e.deltaY > 0 ? 1 : -1;
    };

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('wheel', this.onWheel, { passive: true });
  }

  // Touche brute maintenue ? (utile pour les modificateurs Ctrl/Shift et les
  // flèches qui restent toujours actives en complément du déplacement.)
  isDown(...keys) {
    for (const k of keys) if (this.keys.has(k)) return true;
    return false;
  }

  // Résout un déclencheur -> « maintenu ».
  _downTrigger(trigger) {
    if (!trigger) return false;
    const i = trigger.indexOf(':');
    const type = trigger.slice(0, i);
    const val = trigger.slice(i + 1);
    if (type === 'key') return this.keys.has(val);
    if (type === 'mouse') {
      if (val === '0') return this.mouse.leftDown;
      if (val === '2') return this.mouse.rightDown;
      if (val === '1') return this.mouse.middleDown;
    }
    return false; // wheel : pas de maintien
  }

  // Résout un déclencheur -> « enfoncé ce frame » (consomme l'événement).
  _pressedTrigger(trigger) {
    if (!trigger) return false;
    const i = trigger.indexOf(':');
    const type = trigger.slice(0, i);
    const val = trigger.slice(i + 1);
    if (type === 'key') {
      if (this.keyEdges.has(val)) { this.keyEdges.delete(val); return true; }
      return false;
    }
    if (type === 'mouse') {
      if (val === '0' && this.mouse.leftClicked) { this.mouse.leftClicked = false; return true; }
      if (val === '2' && this.mouse.rightClicked) { this.mouse.rightClicked = false; return true; }
      if (val === '1' && this.mouse.middleClicked) { this.mouse.middleClicked = false; return true; }
      return false;
    }
    if (type === 'wheel') {
      if (val === 'down' && this.mouse.wheel > 0) { this.mouse.wheel--; return true; }
      if (val === 'up' && this.mouse.wheel < 0) { this.mouse.wheel++; return true; }
      return false;
    }
    return false;
  }

  down(actionId) { return this._downTrigger(bindings[actionId]); }
  pressed(actionId) { return this._pressedTrigger(bindings[actionId]); }

  // Fin de frame : on jette les edges non consommés (cliquer sans holder,
  // molette inutilisée…) pour qu'aucun événement ne traverse la frame suivante.
  endFrame() {
    this.keyEdges.clear();
    this.mouse.leftClicked = false;
    this.mouse.rightClicked = false;
    this.mouse.middleClicked = false;
    this.mouse.wheel = 0;
  }

  getDirection() {
    let x = 0, y = 0;
    // Touche liée + flèches toujours actives en secours.
    if (this.down('moveUp') || this.isDown('arrowup')) y -= 1;
    if (this.down('moveDown') || this.isDown('arrowdown')) y += 1;
    if (this.down('moveLeft') || this.isDown('arrowleft')) x -= 1;
    if (this.down('moveRight') || this.isDown('arrowright')) x += 1;
    if (x !== 0 && y !== 0) { x *= INV_SQRT2; y *= INV_SQRT2; }
    this._dir.x = x;
    this._dir.y = y;
    return this._dir;
  }
}
