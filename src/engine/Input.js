// Keyboard / mouse input with rebindable actions.
// Pointer lock is used when the browser grants it; when it is refused (sandboxed frames, some desktop
// shells) the game falls back to "free mouse" mode: moving the mouse over the window still turns the view,
// and the arrow keys can look around too.

export const ACTIONS = [
  ['forward', 'Move forward', 'KeyW'],
  ['back', 'Move back', 'KeyS'],
  ['left', 'Move left', 'KeyA'],
  ['right', 'Move right', 'KeyD'],
  ['run', 'Run', 'ShiftLeft'],
  ['crouch', 'Crouch (toggle)', 'KeyC'],
  ['interact', 'Interact / hide / keep catch', 'KeyE'],
  ['breath', 'Hold breath (hidden)', 'Space'],
  ['cast', 'Cast / hook / reel', 'Mouse0'],
  ['reelIn', 'Reel in the line', 'Mouse2'],
  ['deeper', 'Line deeper', 'KeyG'],
  ['shallower', 'Line shallower', 'KeyV'],
  ['bait', 'Cycle bait', 'KeyB'],
  ['cut', 'Cut the line', 'KeyX'],
  ['cutCatch', 'Cut catch open / into bait', 'KeyF'],
  ['release', 'Release / throw back catch', 'KeyR'],
  ['stow', 'Stow / draw rod', 'KeyQ'],
  ['watch', 'Check watch', 'KeyT'],
  ['inventory', 'Tackle bag', 'KeyI'],
  ['journal', 'Journal', 'KeyJ'],
  ['boatLights', 'Boat lights', 'KeyL'],
  ['lookLeft', 'Look left', 'ArrowLeft'],
  ['lookRight', 'Look right', 'ArrowRight'],
  ['lookUp', 'Look up', 'ArrowUp'],
  ['lookDown', 'Look down', 'ArrowDown'],
  ['pause', 'Pause', 'KeyP'],
];
export const DEFAULT_BINDINGS = Object.fromEntries(ACTIONS.map(([a, , k]) => [a, k]));
// Extra fixed aliases that always work alongside the binding.
const ALIASES = { inventory: ['Tab'], pause: ['Escape'] };

export function keyLabel(code) {
  if (!code) return '—';
  const map = { Mouse0: 'LMB', Mouse1: 'MMB', Mouse2: 'RMB', Mouse3: 'Mouse 4', Mouse4: 'Mouse 5', Space: 'Space', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'L-Alt', AltRight: 'R-Alt', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Escape: 'Esc', Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace', WheelUp: 'Wheel ↑', WheelDown: 'Wheel ↓' };
  if (map[code]) return map[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.mouse = { dx: 0, dy: 0, wheel: 0, over: false };
    this.locked = false;
    this.fallback = false; // pointer lock refused → free-mouse mode
    this.wantActive = false;
    this.bindings = { ...DEFAULT_BINDINGS };
    this.onUnlock = null;
    this.onCapture = null; // rebinding: receives the next key/button
    const downCode = (code, e) => {
      if (this.onCapture) { const cb = this.onCapture; this.onCapture = null; cb(code); e && e.preventDefault(); return; }
      if (!this.keys.has(code)) this.pressed.add(code);
      this.keys.add(code);
    };
    const upCode = (code) => { if (this.keys.has(code)) this.released.add(code); this.keys.delete(code); };
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') && !this.onCapture) return;
      downCode(e.code, e);
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => upCode(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); });
    const gameTarget = (e) => e.target === canvas || this.locked;
    window.addEventListener('mousedown', (e) => {
      if (this.onCapture) { downCode('Mouse' + e.button, e); return; }
      if (!gameTarget(e) || !this.active) return;
      if (performance.now() - (this.activatedAt || 0) < 300) return; // the click that captured the mouse
      downCode('Mouse' + e.button, e);
    });
    window.addEventListener('mouseup', (e) => upCode('Mouse' + e.button));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mouseenter', () => { this.mouse.over = true; });
    canvas.addEventListener('mouseleave', () => { this.mouse.over = false; });
    window.addEventListener('mousemove', (e) => {
      if (!this.active) return;
      if (!this.locked && !(this.fallback && this.mouse.over)) return;
      this.mouse.dx += e.movementX || 0;
      this.mouse.dy += e.movementY || 0;
    });
    window.addEventListener('wheel', (e) => {
      if (this.onCapture) { this.onCapture(e.deltaY < 0 ? 'WheelUp' : 'WheelDown'); this.onCapture = null; return; }
      if (!this.active) return;
      this.mouse.wheel += Math.sign(e.deltaY);
      const code = e.deltaY < 0 ? 'WheelUp' : 'WheelDown';
      this.pressed.add(code);
    }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === canvas;
      if (this.locked) { this.fallback = false; this.activatedAt = performance.now(); }
      if (was && !this.locked && this.wantActive && this.onUnlock) this.onUnlock();
    });
    document.addEventListener('pointerlockerror', () => { if (this.wantActive) this.fallback = true; });
  }

  get active() { return this.locked || (this.fallback && this.wantActive); }

  lock() {
    if (!this.wantActive) this.activatedAt = performance.now();
    this.wantActive = true;
    if (this.locked) return;
    let p;
    try { p = this.canvas.requestPointerLock(); } catch (e) { this.fallback = true; return; }
    if (p && p.catch) p.catch(() => { if (this.wantActive) this.fallback = true; });
    // Some hosts neither lock nor report an error: fall back after a moment.
    setTimeout(() => { if (this.wantActive && !this.locked) this.fallback = true; }, 600);
  }
  unlock() {
    this.wantActive = false;
    if (this.locked) document.exitPointerLock();
  }

  setBindings(b) { this.bindings = { ...DEFAULT_BINDINGS, ...(b || {}) }; }
  codesFor(action) { return [this.bindings[action], ...(ALIASES[action] || [])].filter(Boolean); }
  label(action) { return keyLabel(this.bindings[action]); }

  // action state (only while the game has control)
  down(action) { return this.active && this.codesFor(action).some((c) => this.keys.has(c)); }
  hit(action) { return this.active && this.codesFor(action).some((c) => this.pressed.has(c)); }
  up(action) { return this.codesFor(action).some((c) => this.released.has(c)); }
  // raw key state (menus, Escape) regardless of control
  rawHit(code) { return this.pressed.has(code); }
  consume(action) { for (const c of this.codesFor(action)) this.pressed.delete(c); }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.mouse.dx = this.mouse.dy = 0;
    this.mouse.wheel = 0;
  }
}
