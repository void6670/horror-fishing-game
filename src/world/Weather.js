import * as THREE from 'three';
import { audio } from '../engine/Audio.js';
import { damp, rand } from '../util/math.js';

// Dynamic weather: rain, snow (which the dream can make fall upward), marine snow, fog, wind and lightning.
export class Weather {
  constructor(level) {
    this.level = level;
    this.scene = level.scene;
    this.state = { rain: 0, snow: 0, fog: 0.02, wind: 0.3, storm: 0, upward: 0, marine: 0 };
    this.target = { ...this.state };
    this.flash = 0;
    this.nextLightning = rand(6, 14);

    const RN = 2600;
    const rg = new THREE.BufferGeometry();
    this.rainPos = new Float32Array(RN * 6);
    for (let i = 0; i < RN; i++) this._resetDrop(i, true);
    rg.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0x8a9aa8, transparent: true, opacity: 0.35, fog: true }));
    this.rain.frustumCulled = false;
    this.scene.add(this.rain);

    const SN = 3500;
    const sg = new THREE.BufferGeometry();
    this.snowPos = new Float32Array(SN * 3);
    this.snowSeed = new Float32Array(SN);
    for (let i = 0; i < SN; i++) {
      this.snowPos[i * 3] = rand(-25, 25); this.snowPos[i * 3 + 1] = rand(-5, 18); this.snowPos[i * 3 + 2] = rand(-25, 25);
      this.snowSeed[i] = Math.random() * 10;
    }
    sg.setAttribute('position', new THREE.BufferAttribute(this.snowPos, 3));
    this.snowMat = new THREE.PointsMaterial({ color: 0xdfe8f0, size: 0.09, transparent: true, opacity: 0.85, fog: true, depthWrite: false });
    this.snow = new THREE.Points(sg, this.snowMat);
    this.snow.frustumCulled = false;
    this.scene.add(this.snow);
    this.center = new THREE.Vector3();
  }

  _resetDrop(i, initial) {
    const c = this.center || { x: 0, y: 0, z: 0 };
    const x = c.x + rand(-22, 22), z = c.z + rand(-22, 22);
    const y = c.y + (initial ? rand(-4, 16) : rand(12, 18));
    const p = this.rainPos;
    p[i * 6] = x; p[i * 6 + 1] = y; p[i * 6 + 2] = z;
    p[i * 6 + 3] = x + 0.05; p[i * 6 + 4] = y - 0.55; p[i * 6 + 5] = z + 0.03;
  }

  set(cfg, fadeNow = false) {
    Object.assign(this.target, cfg);
    if (fadeNow) Object.assign(this.state, cfg);
  }

  update(dt, camera) {
    const s = this.state, T = this.target;
    for (const k of Object.keys(T)) s[k] = damp(s[k], T[k], 0.4, dt);
    this.center.copy(camera.position);
    if (this.scene.fog) this.scene.fog.density = s.fog;

    // rain
    this.rain.visible = s.rain > 0.02;
    if (this.rain.visible) {
      this.rain.material.opacity = 0.12 + s.rain * 0.3;
      const p = this.rainPos, n = p.length / 6;
      const sp = 19 * dt, wx = s.wind * 3 * dt;
      const active = Math.floor(n * s.rain);
      for (let i = 0; i < n; i++) {
        if (i >= active) { p[i * 6 + 1] = p[i * 6 + 4] = -999; continue; }
        p[i * 6 + 1] -= sp; p[i * 6 + 4] -= sp; p[i * 6] += wx; p[i * 6 + 3] += wx;
        const dx = p[i * 6] - camera.position.x, dz = p[i * 6 + 2] - camera.position.z;
        if (p[i * 6 + 4] < camera.position.y - 6 || Math.abs(dx) > 23 || Math.abs(dz) > 23) this._resetDrop(i, false);
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }
    // snow / marine snow
    const snowAmt = Math.max(s.snow, s.marine);
    this.snow.visible = snowAmt > 0.02;
    if (this.snow.visible) {
      this.snowMat.opacity = 0.3 + snowAmt * 0.6;
      this.snowMat.color.setHex(s.marine > s.snow ? 0x8fa7a0 : 0xdfe8f0);
      this.snowMat.size = s.marine > s.snow ? 0.05 : 0.09;
      const p = this.snowPos, n = p.length / 3;
      const fall = (s.marine > s.snow ? 0.15 : 1.4) * (s.upward > 0.5 ? -1 : 1);
      const t = performance.now() * 0.001;
      const active = Math.floor(n * snowAmt);
      for (let i = 0; i < n; i++) {
        if (i >= active) { p[i * 3 + 1] = -999; continue; }
        if (p[i * 3 + 1] < -900) p[i * 3 + 1] = camera.position.y + rand(-5, 15);
        p[i * 3 + 1] -= fall * dt * (0.7 + (this.snowSeed[i] % 1) * 0.6);
        p[i * 3] += (Math.sin(t + this.snowSeed[i]) * 0.4 + s.wind * 4) * dt;
        p[i * 3 + 2] += Math.cos(t * 0.7 + this.snowSeed[i]) * 0.3 * dt;
        const dx = p[i * 3] - camera.position.x, dy = p[i * 3 + 1] - camera.position.y, dz = p[i * 3 + 2] - camera.position.z;
        if (dx > 25) p[i * 3] -= 50; else if (dx < -25) p[i * 3] += 50;
        if (dz > 25) p[i * 3 + 2] -= 50; else if (dz < -25) p[i * 3 + 2] += 50;
        if (dy < -6) p[i * 3 + 1] += 22; else if (dy > 16) p[i * 3 + 1] -= 22;
      }
      this.snow.geometry.attributes.position.needsUpdate = true;
    }

    // lightning
    if (s.storm > 0.5) {
      this.nextLightning -= dt;
      if (this.nextLightning <= 0) {
        this.strike();
        this.nextLightning = rand(7, 18) / s.storm;
      }
    }
    this.flash = Math.max(0, this.flash - dt * 3.5);
    const f = this.flash > 0 ? this.flash * (0.6 + 0.4 * Math.sin(this.flash * 60)) : 0;
    if (this.level.sky) this.level.sky.uniforms.uFlash.value = f;
    if (this.level.flashLight) this.level.flashLight.intensity = f * 4;
  }

  strike(close = false) {
    this.flash = 1;
    audio.thunder(close ? 0.1 : rand(0.6, 2.5), close ? 1 : 0.7);
  }

  dispose() {
    this.rain.geometry.dispose(); this.snow.geometry.dispose();
  }
}
