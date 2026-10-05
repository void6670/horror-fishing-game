import * as THREE from 'three';
import { Monster, makeHumanoid } from './Monster.js';
import { audio } from '../engine/Audio.js';
import { rand, chance, clamp, damp, viewAngle } from '../util/math.js';

// ---------------------------------------------------------------- The Leviathan
// Never fully seen. It responds to ATTENTION: engine noise, deck lights, fights on the line, chum,
// glowing lures. Its presence is shadows, fins, tentacles, bumps, waves and things floating up.
export class Leviathan extends Monster {
  constructor(game, { boat, water }) {
    super(game, { name: 'The Leviathan' });
    this.boat = boat; this.water = water;
    this.attention = 0;
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.scale.set(9, 26, 1);
    this.shadow.renderOrder = 2;
    this.level.scene.add(this.shadow);
    // fin & tentacles
    const dark = new THREE.MeshStandardMaterial({ color: 0x07090a, roughness: 0.3, metalness: 0.3 });
    this.fin = new THREE.Mesh(new THREE.ConeGeometry(2.2, 7, 4), dark);
    this.fin.scale.z = 0.12; this.fin.visible = false;
    this.level.scene.add(this.fin);
    this.tentacles = [];
    for (let i = 0; i < 3; i++) {
      const pts = []; for (let k = 0; k < 8; k++) pts.push(new THREE.Vector3(Math.sin(k * 0.6) * k * 0.3, k * 1.6, 0));
      const t = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.45, 6), dark);
      const geo = t.geometry; const p = geo.attributes.position;
      for (let v = 0; v < p.count; v++) { const y = p.getY(v); const k = 1 - y / 13; p.setX(v, p.getX(v) * (0.3 + k)); p.setZ(v, p.getZ(v) * (0.3 + k)); }
      t.visible = false;
      this.level.scene.add(t); this.tentacles.push(t);
    }
    this.mesh.visible = false;
    this.eventT = 20;
    this.risingT = 0;
    this.angle = 0;
  }

  addAttention(v) { this.attention = clamp(this.attention + v, 0, 1); }

  update(dt) {
    super.update(dt);
    if (this.game.state !== 'night') return;
    const b = this.boat, h = this.hour;
    const f = this.game.fishing;
    // sources of attention
    let a = 0;
    if (b.engineOn) a += 0.006 + Math.abs(b.throttle) * 0.012;
    if (b.lightsOn) a += 0.004;
    if (this.player.flashlight.factor > 0.2 && this.player.camera.getWorldDirection(new THREE.Vector3()).y < -0.3) a += 0.003;
    if (f.state === 'fight') a += 0.012 + f.tension * 0.01;
    if (f.state === 'waiting' && f.bait === 'lure') a += 0.004;
    if (f.state === 'waiting' && f.bait === 'chum') a += 0.008;
    const heard = this.game.noise.heardBy(b.pos, 1, 0, 0.3);
    if (heard && heard.event.type === 'splash') a += 0.01;
    a *= (0.5 + h * 0.18) * this.diff;
    const quiet = !b.engineOn && !b.lightsOn && f.state !== 'fight';
    this.attention = clamp(this.attention + a * dt * 1.6 - (quiet ? 0.02 : 0.004) * dt, 0, 1);
    if (h < 1 && !this.enraged) this.attention = Math.min(this.attention, 0.35);
    // circling shadow under the boat
    this.angle += dt * (0.05 + this.attention * 0.15);
    const r = 40 * (1 - this.attention) + 6;
    const sx = b.pos.x + Math.cos(this.angle) * r, sz = b.pos.z + Math.sin(this.angle) * r;
    this.pos.set(sx, -10, sz);
    this.shadow.position.set(sx, b.pos.y - 0.25 - (1 - this.attention) * 0.3, sz);
    this.shadow.rotation.z = -this.angle;
    const shadowVis = this.attention > 0.25 ? clamp((this.attention - 0.25) * 2, 0, 0.75) : 0;
    this.shadow.material.opacity = damp(this.shadow.material.opacity, shadowVis * (0.6 + 0.4 * Math.sin(this.t * 0.3)), 1, dt);
    // escalating events
    this.eventT -= dt;
    if (this.eventT <= 0) {
      this.eventT = rand(12, 25) * (1.3 - this.attention);
      if (this.attention > 0.92) this.attack();
      else if (this.attention > 0.7) this.raiseTentacle();
      else if (this.attention > 0.5) { b.bump(0.8 + this.attention * 0.4); this.player.addFear(0.25); this.game.events.emit('leviathan-bump'); }
      else if (this.attention > 0.3) { this.showFin(); }
      else if (h >= 1 && chance(0.4)) { audio.growl(new THREE.Vector3(sx, -20, sz), 0.35, 4, 0.4); this.game.ui.subtitle('A sound like a building groaning, very far below.', 4); }
    }
    // fin animation
    if (this.fin.visible) {
      this.finT += dt;
      const k = this.finT / 8;
      this.fin.position.set(b.pos.x + Math.cos(this.angle + 1) * (30 - k * 10), this.water.level - 3.5 + Math.sin(Math.min(1, k) * Math.PI) * 4, b.pos.z + Math.sin(this.angle + 1) * (30 - k * 10));
      this.fin.rotation.y = -this.angle;
      if (this.finT > 8) this.fin.visible = false;
    }
    // tentacles
    if (this.risingT > 0) {
      this.risingT -= dt;
      const k = Math.sin(clamp(1 - this.risingT / 7, 0, 1) * Math.PI);
      this.tentacles.forEach((t, i) => {
        const ang = this.tAng + i * 0.4;
        t.position.set(b.pos.x + Math.cos(ang) * (12 + i * 3), this.water.level - 13 + k * (10 + i), b.pos.z + Math.sin(ang) * (12 + i * 3));
        t.rotation.z = Math.sin(this.t + i) * 0.2; t.rotation.x = Math.cos(this.t * 0.7 + i) * 0.2;
        t.visible = this.risingT > 0;
      });
    }
    this.water.uniforms.uWaveAmp.value = damp(this.water.uniforms.uWaveAmp.value, this.level.baseWaves + this.attention * 0.6, 0.5, dt);
  }

  showFin() { this.fin.visible = true; this.finT = 0; audio.splash(this.fin.position, 2); this.player.addFear(0.2); }
  raiseTentacle() {
    this.risingT = 7; this.tAng = Math.random() * Math.PI * 2;
    audio.splash(this.boat.pos, 3); audio.growl(this.boat.pos, 0.4, 3, 0.7);
    this.player.addFear(0.45);
    this.boat.bump(1.2);
    this.game.ui.subtitle('Something rises out of the water beside the boat. And keeps rising.', 4);
  }
  attack() {
    this.boat.damageHull(30 * this.diff);
    audio.growl(this.boat.pos, 0.3, 2.5, 1);
    this.attention = 0.55;
    this.player.addFear(0.6);
  }
  onLucid() { super.onLucid(); this.attention = Math.max(this.attention, 0.6); }
  threatTo() { return clamp(this.attention * 1.1 - 0.1, 0, 1); }
  dispose() { super.dispose(); this.level.scene.remove(this.shadow, this.fin, ...this.tentacles); }
}

// ---------------------------------------------------------------- The Drowned (boat climbers)
// Small humanoid things that swim to the boat in the dark and climb aboard. Light makes them flinch
// and let go. Shove them off with [E]. Lights keep them away — and draw the Leviathan.
export class DrownedSwarm {
  constructor(game, { boat, water, spawnStart = 1.5, max = 3 }) {
    this.game = game; this.boat = boat; this.water = water;
    this.list = [];
    this.spawnT = 30;
    this.spawnStart = spawnStart;
    this.max = max;
    this.enraged = false;
  }
  get hour() { return this.game.time.hour; }
  spawn() {
    const level = this.game.level;
    const body = makeHumanoid({ height: 1.35, thin: 0.6, color: 0x2a3330, skin: 0x5e6e68, coat: false, eyes: 1, armLen: 1.3, emissiveEyes: 0xa0b8b0 });
    const g = new THREE.Group(); g.add(body.root); level.scene.add(g);
    const a = Math.random() * Math.PI * 2;
    const d = { body, g, state: 'swim', angle: a, dist: rand(25, 35), t: 0, lit: 0, side: Math.random() < 0.5 ? -1 : 1, hp: 1 };
    d.interact = level.addInteractable({ pos: { x: 0, y: 0, z: 0 }, radius: 2.2, wide: true, prompt: 'Shove it overboard', onUse: () => this.shove(d), cond: () => d.state === 'climb' || d.state === 'aboard' });
    this.list.push(d);
    audio.splash(new THREE.Vector3(this.boat.pos.x + Math.cos(a) * d.dist, 0, this.boat.pos.z + Math.sin(a) * d.dist), 0.4);
  }
  shove(d) {
    audio.hit(); audio.splash(this.boat.pos, 0.8);
    d.state = 'fall'; d.t = 0;
    this.game.player.camShake = 0.4;
  }
  remove(d) { this.game.level.scene.remove(d.g); this.game.level.removeInteractable(d.interact); this.list.splice(this.list.indexOf(d), 1); }
  update(dt) {
    if (this.game.state !== 'night') return;
    const b = this.boat, p = this.game.player;
    const h = this.hour;
    this.spawnT -= dt;
    const lightsRepel = b.lightsOn || this.game.flareT > 0 ? 0.35 : 1;
    if ((h >= this.spawnStart || this.enraged) && this.spawnT <= 0 && this.list.length < this.max) {
      this.spawn();
      this.spawnT = rand(25, 50) / ((0.6 + h * 0.15) * lightsRepel * (this.enraged ? 1.5 : 1) * this.game.difficulty);
    }
    for (const d of [...this.list]) {
      d.t += dt;
      const toB = new THREE.Vector3();
      const lit = this.isLit(d);
      d.lit = lit ? d.lit + dt : Math.max(0, d.lit - dt);
      if (d.state === 'swim') {
        d.dist -= dt * (1.2 + h * 0.15) * (b.lightsOn ? 0.5 : 1);
        d.angle += dt * 0.05 * d.side;
        const x = b.pos.x + Math.cos(d.angle) * d.dist, z = b.pos.z + Math.sin(d.angle) * d.dist;
        d.g.position.set(x, this.water.heightAt(x, z) - 1.15, z);
        d.g.rotation.y = Math.atan2(b.pos.x - x, b.pos.z - z);
        d.body.animate(dt, 1.2, 'reach');
        if (this.game.flareT > 0 && d.dist < 15) d.lit += dt;
        if (d.lit > 1.2) { audio.splash(d.g.position, 0.5); this.remove(d); continue; }
        if (b.lightsOn && d.dist < 10 && chance(dt * 0.3)) { audio.splash(d.g.position, 0.4); this.remove(d); continue; }
        if (d.dist < 1.8) { d.state = 'climb'; d.t = 0; audio.bump(b.pos, 0.4); audio.creak(b.pos, 0.4); this.game.player.addFear(0.3); this.game.ui.subtitle('Wet hands on the gunwale.', 3); }
      } else if (d.state === 'climb') {
        // hang on the side, rising
        const side = new THREE.Vector3(Math.cos(d.angle), 0, Math.sin(d.angle));
        const x = b.pos.x + side.x * 1.35, z = b.pos.z + side.z * 1.35;
        d.g.position.set(x, b.pos.y - 1.2 + Math.min(1, d.t / 4) * 1.2, z);
        d.g.rotation.y = Math.atan2(b.pos.x - x, b.pos.z - z);
        d.body.animate(dt, 0.6, 'reach');
        if (d.lit > 1.5) { this.shove(d); continue; }
        if (d.t > 4) { d.state = 'aboard'; d.t = 0; audio.growl(d.g.position, 1.8, 0.8, 0.4); }
      } else if (d.state === 'aboard') {
        const to = new THREE.Vector3(p.pos.x - d.g.position.x, 0, p.pos.z - d.g.position.z);
        const dist = to.length();
        if (dist > 0.9) { to.normalize(); d.g.position.addScaledVector(to, dt * 1.3); }
        d.g.position.y = b.pos.y + 0.05;
        d.g.rotation.y = Math.atan2(to.x, to.z);
        d.body.animate(dt, dist > 0.9 ? 1.2 : 0.3, 'reach');
        d.atk = (d.atk || 1) - dt;
        if (dist < 1.2 && d.atk <= 0) { d.atk = 1.6; p.damage(14 * this.game.difficulty, 'The Drowned', 'drowned'); }
        if (d.lit > 2.2) this.shove(d);
      } else if (d.state === 'fall') {
        d.g.position.y -= dt * 3; d.g.rotation.x += dt * 2;
        if (d.t > 1.2) this.remove(d);
      }
      if (d.interact) d.interact.pos.copy(d.g.position).y += 1;
      void toB;
    }
  }
  isLit(d) {
    const f = this.game.player.flashlight;
    if (f.factor < 0.2) return false;
    const to = d.g.position.clone().add(new THREE.Vector3(0, 1, 0)).sub(f.worldPos);
    const dist = to.length();
    return dist < 25 && to.normalize().dot(f.worldDir) > 0.92;
  }
  threatTo() {
    let t = 0;
    for (const d of this.list) { const dist = d.g.position.distanceTo(this.game.player.pos); t = Math.max(t, d.state === 'aboard' ? 1 : d.state === 'climb' ? 0.7 : clamp(0.4 - dist / 80, 0, 0.4)); }
    return t;
  }
  onLucid() { this.enraged = true; this.max += 2; }
  dispose() { for (const d of [...this.list]) this.remove(d); }
}

// ---------------------------------------------------------------- The Watcher
// A figure standing on the water at the horizon. It never moves while you are looking at it.
export class Watcher extends Monster {
  constructor(game, { getAnchor, startDist = 260, rate = 6, looksLikePlayer = false, water }) {
    super(game, { name: 'The Watcher', headHeight: 1.75 });
    this.getAnchor = getAnchor;
    this.water = water;
    this.dist = startDist; this.startDist = startDist;
    this.rate = rate;
    this.body = makeHumanoid({ height: 1.8, thin: 0.85, color: looksLikePlayer ? 0x2e3a2e : 0x0b0b0b, skin: looksLikePlayer ? 0x9c7a64 : 0x0b0b0b, coat: true, eyes: 1, emissiveEyes: 0xffffff });
    this.mesh.add(this.body.root);
    if (looksLikePlayer) {
      const l = new THREE.SpotLight(0xfff1d6, 25, 30, 0.4, 0.6, 1.5);
      l.position.set(-0.3, 1.4, 0.3);
      const tg = new THREE.Object3D(); tg.position.set(0, 0, 10); this.mesh.add(tg); l.target = tg;
      this.mesh.add(l); this.torch = l;
    }
    this.angle = Math.random() * Math.PI * 2;
    this.active = false;
    this.lookT = 0;
    this.mesh.visible = false;
  }
  activate() { this.active = true; this.mesh.visible = true; this.dist = this.startDist; }
  update(dt) {
    super.update(dt);
    if (!this.active || this.game.state !== 'night') return;
    const a = this.getAnchor();
    const seen = this.seenByPlayer(0.95);
    if (seen) { this.lookT += dt; } else {
      this.lookT = 0;
      this.dist -= dt * this.rate * (0.6 + this.hour * 0.12) * this.diff;
    }
    // small chance it simply moves to the other side while you're not looking
    if (!seen && chance(dt * 0.01)) this.angle += rand(-1.5, 1.5);
    const x = a.x + Math.cos(this.angle) * this.dist, z = a.z + Math.sin(this.angle) * this.dist;
    const y = this.water ? this.water.heightAt(x, z) : this.level.groundAt(x, z).y;
    this.pos.set(x, y, z);
    this.yaw = Math.atan2(a.x - x, a.z - z);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    if (this.dist < 40 && chance(dt * 0.3)) audio.whisper(this.headPos(new THREE.Vector3()), null, 0.25);
    if (this.dist < 6) {
      // it reached you
      audio.scream(0.5);
      this.player.forcedLook = { target: this.headPos(new THREE.Vector3()), time: 0.5, speed: 14 };
      this.player.damage(30 * this.diff, this.name, 'watcher');
      this.player.addFear(0.8);
      this.dist = this.startDist;
      this.angle = Math.random() * Math.PI * 2;
    }
    void viewAngle;
  }
  threatTo() { return this.active ? clamp(1 - this.dist / 120, 0, 1) : 0; }
}
