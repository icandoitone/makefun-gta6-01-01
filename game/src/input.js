// Keyboard + mouse input. Tracks held keys, edge-triggered presses, and
// drag-to-orbit camera movement. No pointer lock — drag works everywhere,
// including headless test browsers.

export const Input = {
  keys: new Set(),
  pressedSet: new Set(),
  dragX: 0,
  dragY: 0,
  dragging: false,
  _lastX: 0,
  _lastY: 0,
  _attached: false,

  attach() {
    if (this._attached) return;
    this._attached = true;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressedSet.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    const canvas = document.getElementById('game-canvas');
    if (canvas) {
      canvas.addEventListener('mousedown', (e) => {
        this.dragging = true;
        this._lastX = e.clientX;
        this._lastY = e.clientY;
      });
      window.addEventListener('mousemove', (e) => {
        if (!this.dragging) return;
        this.dragX += e.clientX - this._lastX;
        this.dragY += e.clientY - this._lastY;
        this._lastX = e.clientX;
        this._lastY = e.clientY;
      });
      window.addEventListener('mouseup', () => { this.dragging = false; });
    }
  },

  down(code) { return this.keys.has(code); },
  axis(neg, pos) { return (this.keys.has(pos) ? 1 : 0) - (this.keys.has(neg) ? 1 : 0); },

  // Edge-triggered: true once per physical press. Call endFrame() every tick.
  pressed(code) { return this.pressedSet.has(code); },
  consume(code) { this.pressedSet.delete(code); },
  endFrame() {
    this.pressedSet.clear();
    this.dragX = 0;
    this.dragY = 0;
  },

  // Test helpers: inject keys without a real keyboard.
  fakeDown(code) { this.keys.add(code); this.pressedSet.add(code); },
  fakeUp(code) { this.keys.delete(code); },
  clearAll() { this.keys.clear(); this.pressedSet.clear(); },
};
