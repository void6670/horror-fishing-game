import * as THREE from 'three';
import { Sky } from './Sky.js';
import { Weather } from './Weather.js';
import { noiseTexture } from './Materials.js';
import { QUALITY, CONFIG } from '../config.js';

const CELL = 8;

// Base class for every playable space (nightmares and the real-world house).
// Holds the scene, collision world, interactables, hiding spots, light sources and fishing water.
export class Level {
  constructor(game, opts = {}) {
    this.game = game;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(opts.bg ?? 0x000000);
    this.scene.fog = new THREE.FogExp2(opts.fogColor ?? 0x0a0f14, opts.fog ?? 0.02);
    this.colliders = [];
    this.grid = new Map();
    this.platforms = [];
    this.interactables = [];
    this.hideSpots = [];
    this.lightSources = [];
    this.waters = [];
    this.updaters = [];
    this.waterLevel = opts.waterLevel ?? 0;
    this.maxWade = opts.maxWade ?? 0.9;
    this.bounds = opts.bounds ?? 190;
    this.surfaceFn = null;
    this.heightFn = () => 0;
    this.time = 0;
    this.quality = QUALITY[CONFIG.quality] || QUALITY.high;

    if (opts.sky !== false) {
      this.sky = new Sky(opts.skyOpts || {});
      this.scene.add(this.sky.mesh);
    }
    // lights
    this.hemi = new THREE.HemisphereLight(opts.hemiSky ?? 0x2a3848, opts.hemiGround ?? 0x0a0c0a, opts.hemi ?? 0.35);
    this.scene.add(this.hemi);
    this.moon = new THREE.DirectionalLight(opts.moonColor ?? 0x9fb4d0, opts.moonIntensity ?? 0.55);
    this.moon.castShadow = opts.shadows !== false;
    const sm = this.quality.shadowMap;
    this.moon.shadow.mapSize.set(sm, sm);
    const sc = this.moon.shadow.camera;
    sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 260;
    this.moon.shadow.bias = -0.0008;
    this.moon.shadow.normalBias = 0.04;
    this.scene.add(this.moon);
    this.scene.add(this.moon.target);
    this.flashLight = new THREE.DirectionalLight(0xc8d8ff, 0);
    this.flashLight.position.set(10, 50, 20);
    this.scene.add(this.flashLight);
    this.weather = new Weather(this);
  }

  // ---------------- terrain ----------------
  makeTerrain({ size = 400, seg = 200, height, color, texKey = 'ground', texBase = [128, 128, 128], repeat = 60, roughness = 0.95 }) {
    this.heightFn = height;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = height(x, z);
      pos.setY(i, h);
      const c = color(x, z, h);
      cols[i * 3] = c[0]; cols[i * 3 + 1] = c[1]; cols[i * 3 + 2] = c[2];
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    const tex = noiseTexture(texKey, texBase, 70);
    tex.repeat.set(repeat, repeat);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, roughness, metalness: 0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.terrain = mesh;
    return mesh;
  }

  heightAt(x, z) { return this.heightFn(x, z); }

  // ---------------- collision ----------------
  _cellsFor(x, z, r) {
    const out = [];
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
    const z0 = Math.floor((z - r) / CELL), z1 = Math.floor((z + r) / CELL);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) out.push(i + ',' + j);
    return out;
  }
  _register(c, r) {
    for (const k of this._cellsFor(c.x, c.z, r)) {
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k).push(c);
    }
    this.colliders.push(c);
    return c;
  }
  addCircle(x, z, r, opts = {}) {
    return this._register({ type: 'c', x, z, r, y0: opts.y0 ?? -50, y1: opts.y1 ?? 50, occlude: opts.occlude ?? r > 0.25, enabled: true, tag: opts.tag }, r);
  }
  addBox(x, z, hw, hd, rot = 0, opts = {}) {
    const c = { type: 'b', x, z, hw, hd, rot, cos: Math.cos(rot), sin: Math.sin(rot), y0: opts.y0 ?? -50, y1: opts.y1 ?? 50, occlude: opts.occlude ?? true, enabled: true, tag: opts.tag };
    return this._register(c, Math.hypot(hw, hd));
  }
  addPlatform(x, z, hw, hd, rot, top, surface = 'wood') {
    const p = { x, z, hw, hd, rot, cos: Math.cos(rot), sin: Math.sin(rot), top, surface, enabled: true };
    this.platforms.push(p);
    return p;
  }
  _local(c, px, pz) {
    const dx = px - c.x, dz = pz - c.z;
    return [dx * c.cos + dz * c.sin, -dx * c.sin + dz * c.cos];
  }
  nearbyColliders(x, z, r = 1) {
    const set = new Set();
    for (const k of this._cellsFor(x, z, r)) { const l = this.grid.get(k); if (l) for (const c of l) set.add(c); }
    return set;
  }
  // Push a circle (feet at y, height h) out of colliders. Mutates pos.
  resolve(pos, radius, y = pos.y, h = 1.7) {
    for (let iter = 0; iter < 2; iter++) {
      for (const c of this.nearbyColliders(pos.x, pos.z, radius + 1)) {
        if (!c.enabled || y + h < c.y0 || y > c.y1) continue;
        if (c.type === 'c') {
          const dx = pos.x - c.x, dz = pos.z - c.z;
          const d = Math.hypot(dx, dz), m = radius + c.r;
          if (d < m && d > 1e-5) { pos.x = c.x + (dx / d) * m; pos.z = c.z + (dz / d) * m; }
        } else {
          let [lx, lz] = this._local(c, pos.x, pos.z);
          const cx = Math.max(-c.hw, Math.min(c.hw, lx)), cz = Math.max(-c.hd, Math.min(c.hd, lz));
          let dx = lx - cx, dz = lz - cz;
          let d = Math.hypot(dx, dz);
          if (d < radius) {
            if (d < 1e-5) { // inside: push along shallowest axis
              const px = c.hw - Math.abs(lx), pz = c.hd - Math.abs(lz);
              if (px < pz) lx = Math.sign(lx || 1) * (c.hw + radius); else lz = Math.sign(lz || 1) * (c.hd + radius);
            } else { lx = cx + (dx / d) * radius; lz = cz + (dz / d) * radius; }
            pos.x = c.x + lx * c.cos - lz * c.sin;
            pos.z = c.z + lx * c.sin + lz * c.cos;
          }
        }
      }
    }
    // world bounds
    const b = this.bounds;
    pos.x = Math.max(-b, Math.min(b, pos.x));
    pos.z = Math.max(-b, Math.min(b, pos.z));
    return pos;
  }
  // Line-of-sight test across occluding colliders (2D, with height filter at eye level).
  segmentBlocked(ax, az, bx, bz, y = 1.5) {
    const len = Math.hypot(bx - ax, bz - az);
    const steps = Math.ceil(len / 1.5);
    const seen = new Set();
    for (let s = 0; s <= steps; s++) {
      const t = s / Math.max(1, steps);
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      for (const k of this._cellsFor(x, z, 0.1)) {
        const l = this.grid.get(k); if (!l) continue;
        for (const c of l) {
          if (!c.enabled || !c.occlude || seen.has(c) || y < c.y0 || y > c.y1) continue;
          if (this._pointIn(c, x, z, 0)) { seen.add(c); return true; }
        }
      }
    }
    return false;
  }
  _pointIn(c, x, z, pad = 0) {
    if (c.type === 'c') return Math.hypot(x - c.x, z - c.z) < c.r + pad;
    const [lx, lz] = this._local(c, x, z);
    return Math.abs(lx) < c.hw + pad && Math.abs(lz) < c.hd + pad;
  }
  // Ground height & surface under (x, z) for an entity whose feet are at y.
  groundAt(x, z, y = 1000) {
    let gy = this.heightAt(x, z);
    let surface = this.surfaceFn ? this.surfaceFn(x, z, gy) : 'grass';
    let platform = null;
    for (const p of this.platforms) {
      if (!p.enabled) continue;
      const [lx, lz] = this._local(p, x, z);
      if (Math.abs(lx) <= p.hw && Math.abs(lz) <= p.hd && p.top <= y + 0.55 && p.top > gy) { gy = p.top; surface = p.surface; platform = p; }
    }
    return { y: gy, surface, platform };
  }
  waterDepthAt(x, z, groundY) {
    const g = groundY ?? this.heightAt(x, z);
    return this.waterLevel - g;
  }
  // Can a fishing line enter the water here? Levels override (ice holes etc).
  isFishable(x, z) {
    if (this.groundAt(x, z, this.waterLevel + 0.2).platform) return false;
    return this.heightAt(x, z) < this.waterLevel - 0.25;
  }
  waterSurfaceAt(x, z) { return this.waters[0] ? this.waters[0].heightAt(x, z) : this.waterLevel; }

  // ---------------- gameplay registries ----------------
  addInteractable(def) {
    const it = { radius: 1.6, enabled: true, hold: 0, ...def };
    if (!(it.pos instanceof THREE.Vector3)) it.pos = new THREE.Vector3(it.pos.x, it.pos.y, it.pos.z);
    this.interactables.push(it);
    return it;
  }
  removeInteractable(it) { const i = this.interactables.indexOf(it); if (i >= 0) this.interactables.splice(i, 1); }
  addHideSpot(def) {
    const h = { kind: 'cabin', searchable: true, ...def };
    this.hideSpots.push(h);
    this.addInteractable({ pos: def.pos, radius: def.radius ?? 1.6, prompt: def.prompt || `Hide (${h.name || h.kind})`, onUse: () => this.game.player.enterHide(h), cond: () => !this.game.player.hidden });
    return h;
  }
  addLightSource(pos, radius, light = null, opts = {}) {
    const s = { pos: pos.clone ? pos.clone() : new THREE.Vector3(pos.x, pos.y, pos.z), radius, light, on: true, baseIntensity: light ? light.intensity : 0, flicker: opts.flicker || 0, safe: opts.safe ?? true };
    this.lightSources.push(s);
    return s;
  }
  setLightOn(s, on) { s.on = on; if (s.light) s.light.intensity = on ? s.baseIntensity : 0; }
  addWater(w) { this.waters.push(w); this.scene.add(w.mesh); return w; }
  onUpdate(fn) { this.updaters.push(fn); }

  // brightness of nearby "safe" light (0..1) at a point
  lightAt(p) {
    let best = 0;
    for (const s of this.lightSources) {
      if (!s.on) continue;
      const d = p.distanceTo(s.pos);
      if (d < s.radius) best = Math.max(best, 1 - d / s.radius);
    }
    return best;
  }

  update(dt, camera, player) {
    this.time += dt;
    if (this.sky) this.sky.update(dt, camera);
    this.weather.update(dt, camera);
    // keep moon shadow centered on player
    if (this.sky) {
      const md = this.sky.moonDir;
      this.moon.position.set(camera.position.x + md.x * 120, Math.max(10, md.y * 120) + camera.position.y, camera.position.z + md.z * 120);
      this.moon.target.position.set(camera.position.x, camera.position.y, camera.position.z);
    }
    for (const w of this.waters) w.update(dt, camera, player ? player.flashlight : null, this.sky ? this.sky.moonDir : null);
    for (const s of this.lightSources) {
      if (s.on && s.flicker && s.light) s.light.intensity = s.baseIntensity * (1 - s.flicker * 0.5 + Math.random() * s.flicker * 0.5);
    }
    for (const fn of this.updaters) fn(dt);
  }

  renderReflections(renderer, camera) {
    for (const w of this.waters) {
      w.rtScale = this.quality.reflectionScale;
      w.renderReflection(renderer, this.scene, camera);
    }
  }

  dispose() {
    this.weather.dispose();
    for (const w of this.waters) w.dispose();
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) m.dispose();
      }
    });
  }
}
