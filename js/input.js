// ============================================================
//  AVANIA — Gestion des entrées clavier
//  (ZQSD + flèches + WASD, agréable pour un public FR)
// ============================================================

export class Input {
  constructor() {
    this.keys = new Set();
    this.onKeyDown = (e) => {
      // On n'intercepte pas les champs de saisie (ex: nom du perso)
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) {
        e.preventDefault();
      }
    };
    this.onKeyUp = (e) => {
      this.keys.delete(e.key.toLowerCase());
    };
    this.onBlur = () => this.keys.clear();

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  isDown(...keys) {
    for (const k of keys) if (this.keys.has(k)) return true;
    return false;
  }

  // Retourne un vecteur de déplacement normalisé (-1..1)
  getDirection() {
    let x = 0, y = 0;
    if (this.isDown('z', 'w', 'arrowup')) y -= 1;
    if (this.isDown('s', 'arrowdown')) y += 1;
    if (this.isDown('q', 'a', 'arrowleft')) x -= 1;
    if (this.isDown('d', 'arrowright')) x += 1;
    if (x !== 0 && y !== 0) {
      const inv = 1 / Math.sqrt(2);
      x *= inv; y *= inv;
    }
    return { x, y };
  }
}
