import * as THREE from 'three';

// Every sound the player makes is a gameplay event that monsters can perceive.
export class NoiseSystem {
  constructor() { this.events = []; this.time = 0; }
  // loudness ~ radius in meters at which it's clearly audible (before weather masking)
  emit(pos, loudness, type = 'generic', source = 'player') {
    this.events.push({ pos: new THREE.Vector3(pos.x, pos.y, pos.z), loudness, type, source, t: this.time });
  }
  update(dt) {
    this.time += dt;
    this.events = this.events.filter((e) => this.time - e.t < 0.6);
  }
  // Loudest recent event audible at pos with given hearing multiplier & masking (rain/wind)
  heardBy(pos, hearing = 1, masking = 0, since = 0.25) {
    let best = null, bestScore = 0;
    for (const e of this.events) {
      if (this.time - e.t > since) continue;
      const d = e.pos.distanceTo(pos);
      const radius = e.loudness * hearing * (1 - masking * 0.6);
      if (d < radius) {
        const score = 1 - d / radius;
        if (score > bestScore) { bestScore = score; best = e; }
      }
    }
    return best ? { event: best, strength: bestScore } : null;
  }
  clear() { this.events.length = 0; }
}
