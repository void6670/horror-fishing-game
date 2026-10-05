import { CONFIG } from '../config.js';

// 12:00 AM → 6:00 AM. Fires hour callbacks. Moves faster once the dream knows you know.
export class TimeSystem {
  constructor(game) {
    this.game = game;
    this.hour = 0;
    this.now = 0; // real seconds since night start
    this.scale = 1;
    this.paused = false;
    this.lastHour = 0;
    this.listeners = [];
  }
  start(hour = 0) { this.hour = hour; this.lastHour = Math.floor(hour); this.now = 0; this.scale = 1; this.paused = false; }
  onHour(fn) { this.listeners.push(fn); }
  clear() { this.listeners = []; }
  update(dt) {
    this.now += dt;
    if (this.paused) return;
    const sph = this.game.story.settings.secondsPerHour || CONFIG.secondsPerHour;
    this.hour = Math.min(6, this.hour + (dt * this.scale) / sph);
    const h = Math.floor(this.hour);
    if (h > this.lastHour) {
      for (let k = this.lastHour + 1; k <= h; k++) for (const fn of this.listeners) fn(k);
      this.lastHour = h;
    }
  }
}

export class Events {
  constructor() { this.map = new Map(); }
  on(name, fn) { if (!this.map.has(name)) this.map.set(name, []); this.map.get(name).push(fn); return () => this.off(name, fn); }
  off(name, fn) { const l = this.map.get(name); if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); } }
  emit(name, ...args) { const l = this.map.get(name); if (l) for (const fn of [...l]) fn(...args); }
  clearScoped() { this.map = new Map(); }
}
