// ============================================================
//  AVANIA — Gestion des entrées (clavier + souris)
//  ZQSD / WASD / flèches pour se déplacer, souris pour
//  viser et casser / poser des blocs.
// ============================================================

export class Input {
  constructor() {
    this.keys = new Set();
    this.mouse = {
      x: 0, y: 0,
      leftClicked: false,
      rightClicked: false,
      leftDown: false,
      rightDown: false,
      wheel: 0,
    };

    this.onKeyDown = (e) => {
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
    this.onBlur = () => {
      this.keys.clear();
      this.mouse.leftDown = false;
      this.mouse.rightDown = false;
    };

    this.onMouseMove = (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    };
    this.onMouseDown = (e) => {
      // Les boutons et les cases de l'interface ne doivent jamais devenir
      // une action de minage dans le canvas derrière eux.
      if (e.target && e.target.tagName !== 'CANVAS') return;
      if (e.button === 0) {
        this.mouse.leftClicked = true;
        this.mouse.leftDown = true;
      }
      if (e.button === 2) {
        this.mouse.rightClicked = true;
        this.mouse.rightDown = true;
      }
    };
    this.onMouseUp = (e) => {
      if (e.button === 0) this.mouse.leftDown = false;
      if (e.button === 2) this.mouse.rightDown = false;
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

  isDown(...keys) {
    for (const k of keys) if (this.keys.has(k)) return true;
    return false;
  }

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
