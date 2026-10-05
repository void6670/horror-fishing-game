import * as THREE from 'three';
import { CATALOG, CATALOG_BY_ID, catchDesc } from './Catalog.js';
import { makeCatchModel } from './CatchModels.js';
import { audio } from '../engine/Audio.js';
import { CONFIG } from '../config.js';
import { clamp, damp, rand, weightedPick, fmtTime } from '../util/math.js';
import { RELIC_LINES, N } from '../story/Text.js';
import { ITEMS } from '../systems/Inventory.js';

const G = 9.8;

// Cast → wait → nibble → bite → hook → fight (tension, line, direction) → land → inspect.
export class Fishing {
  constructor(game) {
    this.game = game;
    this.state = 'idle';
    this.power = 0;
    this.depthTarget = 3;
    this.bait = 'worm';
    this.rigged = true;
    this.tension = 0;
    this.lineOut = 0;
    this.rodSide = 0;
    this._tip = new THREE.Vector3();
    this.bobberPos = new THREE.Vector3();
    this.bobberVel = new THREE.Vector3();
    this.castDir = new THREE.Vector3();
    this.origin = new THREE.Vector3();
    this.lineDepth = 0;
    this.msg = '';
    this.buildMeshes();
  }

  buildMeshes() {
    const g = new THREE.Group();
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd02018, roughness: 0.4, emissive: 0x300000 }));
    const bot = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.4 }));
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.12, 4), new THREE.MeshStandardMaterial({ color: 0xffee88, emissive: 0x554400 }));
    ant.position.y = 0.08;
    g.add(top, bot, ant);
    this.bobber = g;
    this.lureGlow = new THREE.PointLight(0x9affc8, 0, 6, 2);
    g.add(this.lureGlow);
    const N_PTS = 32;
    this.linePts = new Float32Array(N_PTS * 3);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(this.linePts, 3));
    this.line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xd8d8d0, transparent: true, opacity: 0.55 }));
    this.line.frustumCulled = false;
    const sg = new THREE.BufferGeometry();
    this.subPts = new Float32Array(6);
    sg.setAttribute('position', new THREE.BufferAttribute(this.subPts, 3));
    this.subLine = new THREE.Line(sg, new THREE.LineBasicMaterial({ color: 0x8a9a90, transparent: true, opacity: 0.25 }));
    this.subLine.frustumCulled = false;
    // splash ring
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.28, 24), new THREE.MeshBasicMaterial({ color: 0xbfd0d8, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
  }

  attach(scene) {
    scene.add(this.bobber); scene.add(this.line); scene.add(this.subLine); scene.add(this.ring);
    this.reset();
  }

  reset() {
    this.state = 'idle';
    this.bobber.visible = false; this.line.visible = false; this.subLine.visible = false;
    this.fish = null; this.tension = 0; this.lineOut = 0; this.power = 0;
    this.game.player.vm.castPull = 0; this.game.player.vm.bend = 0;
    this.closeInspect(true);
    const baits = this.game.inventory.baitTypes();
    if (!baits.includes(this.bait)) this.bait = baits[0] || null;
  }

  get stats() {
    const u = this.game.story.upgrades;
    return {
      castMax: 16 + (u.rod ? 8 : 0),
      lineStrength: 1.0 + (u.rod ? 0.15 : 0) + (u.line ? 0.2 : 0),
      reelSpeed: 2.3 * (u.reel ? 1.3 : 1),
      reelTension: u.reel ? 0.8 : 1,
      teethProof: !!u.line,
    };
  }

  busy() { return !['idle', 'unrigged'].includes(this.state); }
  blocksInteract() { return ['charging', 'fight', 'inspect', 'bite'].includes(this.state); }

  abort(msg) {
    if (msg) this.game.ui.toast(msg);
    if (this.state === 'inspect') this.closeInspect(true);
    this.reset();
  }

  cycleBait() {
    const baits = this.game.inventory.baitTypes();
    const opts = [...baits, null];
    const i = opts.indexOf(this.bait);
    this.bait = opts[(i + 1) % opts.length];
    audio.uiClick();
    this.game.ui.toast(this.bait ? `Bait: ${ITEMS[this.bait].name} (${this.game.inventory.count(this.bait)})` : 'Bait: none (bare hook)');
  }

  // ---------------------------------------------------------------- update
  update(dt) {
    const game = this.game, input = game.input, player = game.player, level = game.level;
    if (!level) return;
    const canAct = player.controllable && !player.hidden && player.rodOut && !game.ui.modalOpen;
    player.vm.tipWorld(this._tip);

    if (canAct && input.hit('KeyB') && !['fight', 'inspect'].includes(this.state)) this.cycleBait();
    if (canAct && input.mouse.wheel && ['idle', 'charging', 'waiting'].includes(this.state)) {
      const steps = [1, 2, 3, 5, 8, 12, 20, 35, 60];
      let i = steps.findIndex((s) => s >= this.depthTarget);
      if (i < 0) i = steps.length - 1;
      i = clamp(i + (input.mouse.wheel > 0 ? -1 : 1), 0, steps.length - 1);
      this.depthTarget = steps[i];
      audio.reelClick(0.6);
    }

    switch (this.state) {
      case 'unrigged':
        if (canAct && input.mouse.leftPressed) this.rerig();
        break;
      case 'idle':
        if (canAct && input.mouse.leftPressed && !player.inBoat?.atHelm) { this.state = 'charging'; this.chargeT = 0; }
        break;
      case 'charging': {
        this.chargeT += dt;
        this.power = 0.5 - 0.5 * Math.cos(this.chargeT * 2.6);
        player.vm.castPull = damp(player.vm.castPull, 0.4 + this.power * 0.6, 10, dt);
        if (!input.mouse.left || !canAct) {
          if (canAct) this.cast(); else { this.state = 'idle'; player.vm.castPull = 0; }
        }
        break;
      }
      case 'flight': this.updateFlight(dt); break;
      case 'ground':
        if (canAct && input.mouse.left) this.retrieve(dt, true);
        break;
      case 'waiting': this.updateWaiting(dt, canAct); break;
      case 'bite': this.updateBite(dt, canAct); break;
      case 'fight': this.updateFight(dt, canAct); break;
      case 'inspect': this.updateInspect(dt); break;
      default: break;
    }
    if (canAct && input.mouse.rightPressed && ['waiting', 'ground', 'flight'].includes(this.state)) {
      this.game.ui.toast('You reel in.'); audio.lineZip(0.1); this.reset();
    }
    player.vm.castPull = this.state === 'charging' ? player.vm.castPull : damp(player.vm.castPull, 0, 8, dt);
    if (this.state !== 'fight') { player.vm.bend = damp(player.vm.bend, this.state === 'bite' ? 0.5 : this.state === 'waiting' ? 0.08 : 0, 6, dt); player.vm.bendSide = damp(player.vm.bendSide, 0, 4, dt); player.vm.reelSpin = 0; }
    this.ring.material.opacity = Math.max(0, this.ring.material.opacity - dt * 0.8);
    this.ring.scale.multiplyScalar(1 + dt * 1.5);
    this.updateLine();
    game.ui.fishingHUD(this);
  }

  rerig() {
    const inv = this.game.inventory;
    if (inv.has('line')) { inv.remove('line', 1); this.rigged = true; this.state = 'idle'; this.game.ui.toast('Re-rigged with spare line.'); audio.click(0.2); return; }
    this.state = 'idle';
    this.rigged = true;
    this.game.ui.toast('No spare line. You knot the frayed end around a bent hook. It will hold. Probably.');
    this.improvised = true;
  }

  cast() {
    const game = this.game, player = game.player;
    const s = this.stats;
    player.vm.castPull = 0;
    player.vm.castSwing = 1.4;
    audio.whoosh();
    const dir = new THREE.Vector3();
    game.camera.getWorldDirection(dir);
    const pitch = clamp(dir.y + 0.35, 0.15, 0.9);
    dir.y = 0; dir.normalize();
    this.castDir.copy(dir);
    const speed = 5 + this.power * (s.castMax * 0.62);
    this.bobberPos.copy(this._tip);
    this.bobberVel.copy(dir).multiplyScalar(speed).setY(speed * pitch);
    // ice holes / tight spots: drop the line straight in
    const assist = game.level.castAssist ? game.level.castAssist(player.pos, dir) : null;
    if (assist) {
      const T = 0.6;
      this.bobberVel.set((assist.x - this._tip.x) / T, (assist.y - this._tip.y) / T + 0.5 * G * T, (assist.z - this._tip.z) / T);
      this.castDir.set(assist.x - player.pos.x, 0, assist.z - player.pos.z).normalize();
    }
    this.origin.copy(player.pos);
    this.state = 'flight';
    this.bobber.visible = true; this.line.visible = true;
    this.lineDepth = 0;
    this.impossible = false;
    this.lureGlow.intensity = this.bait === 'lure' ? 1.2 : 0;
    game.noise.emit(player.pos, 4, 'cast');
  }

  updateFlight(dt) {
    const level = this.game.level;
    this.bobberVel.y -= G * dt;
    this.bobberPos.addScaledVector(this.bobberVel, dt);
    this.bobber.position.copy(this.bobberPos);
    const surf = level.waterSurfaceAt(this.bobberPos.x, this.bobberPos.z);
    const ground = level.groundAt(this.bobberPos.x, this.bobberPos.z, this.bobberPos.y).y;
    const blocked = level.castBlocked ? level.castBlocked(this.bobberPos) : false;
    if (this.bobberPos.y <= Math.max(surf, ground) || blocked) {
      const fishable = !blocked && level.isFishable(this.bobberPos.x, this.bobberPos.z) && surf >= ground;
      if (fishable) {
        this.bobberPos.y = surf;
        this.landPos = this.bobberPos.clone();
        this.state = 'waiting';
        this.waitT = 0;
        this.nibbles = Math.floor(rand(1, 4));
        this.nextEvent = this.computeWait() / (this.nibbles + 1);
        this.splashRing(this.bobberPos, 0.7);
        audio.plop(this.bobberPos, 0.45);
        this.game.noise.emit(this.bobberPos, 10, 'splash');
        this.waterDepth = Math.max(0.5, level.waterLevel - level.heightAt(this.bobberPos.x, this.bobberPos.z));
        if (level.fishDepthOverride) this.waterDepth = level.fishDepthOverride(this.bobberPos);
        // the line goes impossibly deep sometimes
        const hour = this.game.time ? this.game.time.hour : 0;
        if (hour >= 2 && Math.random() < 0.06 + (this.game.lucid ? 0.1 : 0)) this.impossible = true;
        this.game.events.emit('cast', this.bobberPos.clone());
      } else {
        this.bobberPos.y = Math.max(ground, surf) + 0.03;
        this.state = 'ground';
        audio.footstep(level.surfaceFn ? level.surfaceFn(this.bobberPos.x, this.bobberPos.z) : 'grass', 0.15, this.bobberPos);
        this.game.ui.toast(level.groundCastMsg || 'Your cast landed short. Hold [LMB] to reel in.');
      }
      this.bobber.position.copy(this.bobberPos);
    }
  }

  computeWait() {
    const baitMult = { worm: 1, minnow: 1.1, lure: 0.85, chum: 0.9, memento: 1.15 }[this.bait] ?? 2.4;
    const spot = this.spotAt(this.bobberPos);
    const hour = this.game.time ? this.game.time.hour : 0;
    return rand(5, 12) * baitMult * (spot ? spot.speed ?? 0.8 : 1) * (1 - hour * 0.04) * (this.game.level.biteSpeed ?? 1);
  }

  spotAt(p) {
    const spots = this.game.level.fishingSpots || [];
    return spots.find((s) => Math.hypot(p.x - s.x, p.z - s.z) < s.r) || null;
  }

  retrieve(dt, ground = false) {
    const player = this.game.player;
    const to = new THREE.Vector3(player.pos.x - this.bobberPos.x, 0, player.pos.z - this.bobberPos.z);
    const d = to.length();
    if (d < 2) { this.reset(); return; }
    to.normalize();
    this.bobberPos.addScaledVector(to, this.stats.reelSpeed * 1.3 * dt);
    const level = this.game.level;
    const surf = level.waterSurfaceAt(this.bobberPos.x, this.bobberPos.z);
    const gy = level.groundAt(this.bobberPos.x, this.bobberPos.z, this.bobberPos.y + 0.5).y;
    this.bobberPos.y = Math.max(surf, gy + 0.03);
    this.bobber.position.copy(this.bobberPos);
    player.vm.reelSpin = 1;
    this.reelClickT = (this.reelClickT || 0) - dt;
    if (this.reelClickT <= 0) { audio.reelClick(0.8); this.reelClickT = 0.06; }
    if (!ground) this.lineDepth = Math.max(0, this.lineDepth - dt * 3);
    this.game.noise.emit(player.pos, 3, 'reel');
  }

  bob(dt, amount = 0) {
    const level = this.game.level;
    const surf = level.waterSurfaceAt(this.bobberPos.x, this.bobberPos.z);
    this.bobberPos.y = surf - amount + Math.sin(performance.now() * 0.003) * 0.01;
    this.bobber.position.copy(this.bobberPos);
    this.bobber.rotation.z = Math.sin(performance.now() * 0.002) * 0.1;
  }

  updateWaiting(dt, canAct) {
    const input = this.game.input;
    const maxDepth = this.impossible ? 999 : this.waterDepth;
    const target = Math.min(this.depthTarget, maxDepth);
    if (this.impossible) {
      this.lineDepth += dt * (this.lineDepth > 60 ? 18 : 4);
      if (!this._impMsg && this.lineDepth > this.waterDepth + 2) { this._impMsg = true; this.game.ui.toast('The line keeps going down. The lake is not this deep.', 'dream'); audio.lineZip(0.15); this.game.player.addFear(0.15); }
    } else if (this.lineDepth < target) this.lineDepth = Math.min(target, this.lineDepth + dt * 1.8);
    else this.lineDepth = Math.max(target, this.lineDepth - dt * 2);
    let dip = 0;
    if (this.nibbleT > 0) { this.nibbleT -= dt; dip = Math.max(0, Math.sin(this.nibbleT * 25)) * 0.03; }
    this.bob(dt, dip);
    if (canAct && input.mouse.leftPressed && this.nibbleT > 0) {
      // struck too early
      if (Math.random() < 0.6) { this.game.ui.toast('Too early. You spooked it.'); this.nextEvent = this.computeWait(); this.nibbles = Math.floor(rand(0, 3)); if (this.bait && !ITEMS[this.bait].reusable && Math.random() < 0.3) this.consumeBait('Your bait was stripped.'); this.nibbleT = 0; return; }
      this.beginBite(true); return;
    }
    if (canAct && input.mouse.left && this.nibbleT <= 0) { this.retrieve(dt); this.nextEvent += dt; return; }
    const depthReady = this.impossible ? this.lineDepth > 40 : this.lineDepth >= target - 0.1;
    if (!depthReady) return;
    this.waitT += dt;
    if (this.waitT >= this.nextEvent) {
      this.waitT = 0;
      if (this.nibbles > 0) {
        this.nibbles--;
        this.nibbleT = 0.5;
        audio.plop(this.bobberPos, 0.15);
        this.splashRing(this.bobberPos, 0.3);
        this.nextEvent = rand(1.2, 3.5);
      } else this.beginBite(false);
    }
  }

  beginBite(immediate) {
    this.catch = this.rollCatch();
    if (!this.catch) { this.nextEvent = this.computeWait(); this.nibbles = 1; return; }
    this.state = 'bite';
    const e = this.catch.entry;
    this.biteWindow = e.kind === 'alarm' ? 2.5 : e.fight.b === 'dead' ? 2.0 : e.fight.b === 'grabber' ? 3 : 0.95 - (this.game.difficulty - 1) * 0.15;
    this.biteT = 0;
    if (immediate) this.biteT = this.biteWindow; // struck on a nibble — hooked directly
    audio.plop(this.bobberPos, e.kind === 'alarm' ? 0.2 : 0.6);
    this.splashRing(this.bobberPos, 1);
    if (e.kind === 'alarm') { this.game.ui.toast('The bobber sinks slowly. Very slowly. Something heavy.', 'dream'); audio.lineZip(0.1); }
    if (immediate) this.hook();
  }

  updateBite(dt, canAct) {
    const input = this.game.input;
    this.biteT += dt;
    const e = this.catch.entry;
    const depth = e.kind === 'alarm' ? Math.min(0.6, this.biteT * 0.25) : 0.12 + Math.sin(this.biteT * 30) * 0.03;
    this.bob(dt, depth);
    this.game.player.vm.bend = 0.4 + Math.sin(this.biteT * 25) * 0.15;
    if (canAct && input.mouse.leftPressed) { this.hook(); return; }
    if (this.biteT > this.biteWindow) {
      this.state = 'waiting';
      this.nextEvent = this.computeWait(); this.nibbles = Math.floor(rand(0, 3)); this.waitT = 0;
      if (this.bait && !ITEMS[this.bait].reusable && Math.random() < 0.7) this.consumeBait('Too slow. The bait is gone.');
      else this.game.ui.toast('Missed it.');
    }
  }

  consumeBait(msg) {
    if (!this.bait) return;
    this.game.inventory.remove(this.bait, 1);
    if (msg) this.game.ui.toast(msg);
    if (!this.game.inventory.has(this.bait)) {
      const next = this.game.inventory.baitTypes()[0] || null;
      this.game.ui.toast(next ? `Out of ${ITEMS[this.bait].name}. Switched to ${ITEMS[next].name}.` : 'Out of bait. Bare hook.', 'warn');
      this.bait = next;
    }
  }

  hook() {
    const e = this.catch.entry;
    if (this.bait && !ITEMS[this.bait].reusable) this.consumeBait();
    this.state = 'fight';
    const kg = this.catch.kg;
    const diff = this.game.difficulty;
    const f = {
      b: e.fight.b, str: clamp(e.fight.str * (0.85 + Math.min(kg, 10) * 0.03) * (0.9 + diff * 0.1), 0.1, 1.1), staMax: e.fight.sta,
      stamina: 1, dir: 0, pull: 0, t: 0, phase: 0, phaseT: rand(0.8, 2), teeth: e.fight.teeth && !this.stats.teethProof,
    };
    this.fish = f;
    this.lineOut = Math.max(4, Math.hypot(this.bobberPos.x - this.game.player.pos.x, this.bobberPos.z - this.game.player.pos.z));
    if (this.game.level.lockFightToHole || this.game.level.verticalFishing) this.lineOut = 4 + Math.min(this.lineDepth, 40) * 0.6;
    this.snapT = 0; this.slackT = 0; this.rodSide = 0; this.grabT = 0; this.wear = 0;
    this.tension = 0.3;
    audio.lineZip(0.25);
    this.game.player.vm.shake = 0.6;
    this.game.noise.emit(this.bobberPos, 14, 'splash');
    if (e.kind === 'grab') { this.game.player.addFear(0.5); audio.sting(0.4); this.game.ui.toast('[X] CUT THE LINE', 'danger'); }
    this.game.events.emit('hooked', this.catch);
  }

  updateFight(dt, canAct) {
    const game = this.game, input = game.input, player = game.player;
    const f = this.fish, e = this.catch.entry, s = this.stats;
    f.t += dt; f.phaseT -= dt;
    // ---- behaviour ----
    let pullTarget = 0.35;
    switch (f.b) {
      case 'steady': pullTarget = 0.4 + Math.sin(f.t * 1.3) * 0.12; if (f.phaseT < 0) { f.dir = rand(-0.6, 0.6); f.phaseT = rand(2, 4); } break;
      case 'darter':
        if (f.phaseT < 0) { f.phase = f.phase ? 0 : 1; f.phaseT = f.phase ? rand(0.5, 1.0) : rand(1, 2.2); if (f.phase) { f.dir = Math.random() < 0.5 ? -1 : 1; audio.lineZip(0.12); } }
        pullTarget = f.phase ? 0.95 : 0.3; break;
      case 'thrasher':
        if (f.phaseT < 0) { f.phase = Math.random() < 0.5 ? 1 : 0; f.phaseT = rand(0.4, 1.3); f.dir = rand(-1, 1); if (f.phase) { this.splashRing(this.fishPos || this.bobberPos, 1.2); audio.splash(this.fishPos || this.bobberPos, 0.6); game.noise.emit(this.bobberPos, 16, 'splash'); } }
        pullTarget = f.phase ? 1.0 : 0.25 + Math.random() * 0.2; break;
      case 'diver': pullTarget = 0.75 + Math.sin(f.t * 0.7) * 0.1; if (f.phaseT < 0) { f.dir = rand(-0.4, 0.4); f.phaseT = rand(3, 5); } break;
      case 'dead': pullTarget = 0.22; f.dir = 0; break;
      case 'heavy': pullTarget = 0.62 + Math.sin(f.t * 0.5) * 0.05; f.dir = Math.sin(f.t * 0.3) * 0.3; break;
      case 'grabber': pullTarget = 1.2; f.dir = Math.sin(f.t * 2) * 0.5; break;
      default: break;
    }
    f.pull = damp(f.pull, pullTarget * f.str * (0.35 + 0.65 * f.stamina), 6, dt);
    // ---- player input ----
    if (canAct) this.rodSide = clamp(this.rodSide + input.mouse.dx * 0.0045, -1, 1);
    this.rodSide = damp(this.rodSide, 0, 0.6, dt);
    const reeling = canAct && input.mouse.left;
    const mismatch = Math.abs(this.rodSide + f.dir) / 2;
    let t = f.pull * (0.55 + mismatch * 0.65) + (reeling ? (0.28 + f.pull * 0.55) * s.reelTension : 0);
    if (e.kind === 'alarm') t = Math.min(t, 0.9);
    this.tension = damp(this.tension, t, 7, dt);
    // ---- line movement ----
    if (reeling) {
      this.lineOut -= s.reelSpeed * dt * (1 - Math.min(0.85, f.pull * 0.65)) * (f.b === 'heavy' ? 0.6 : 1);
      this.reelClickT = (this.reelClickT || 0) - dt;
      if (this.reelClickT <= 0) { audio.reelClick(1); this.reelClickT = 0.05; }
      game.noise.emit(player.pos, 5, 'reel');
    } else if (f.pull > 0.55) {
      this.lineOut += (f.pull - 0.5) * 3.2 * dt;
      if (Math.random() < dt * 6) audio.lineZip(0.06);
    }
    player.vm.reelSpin = reeling ? 1 : f.pull > 0.55 ? -0.6 : 0;
    player.vm.bend = damp(player.vm.bend, clamp(this.tension, 0, 1.3), 10, dt);
    player.vm.bendSide = damp(player.vm.bendSide, f.dir - this.rodSide * 0.5, 5, dt);
    if (this.tension > 0.85) player.vm.shake = Math.max(player.vm.shake, 0.3);
    // ---- stamina ----
    f.stamina = Math.max(0, f.stamina - dt * (0.035 + this.tension * 0.16) * (6 / f.staMax));
    // ---- failure states ----
    const strength = s.lineStrength * (this.improvised ? 0.85 : 1) * (1 - this.wear * 0.4);
    if (this.tension > strength) this.snapT += dt; else this.snapT = Math.max(0, this.snapT - dt * 2);
    if (f.teeth && this.tension > 0.6) this.wear = Math.min(1, this.wear + dt * 0.08);
    if (this.snapT > 0.45 && f.b !== 'grabber') { this.snapLine('SNAP. The line parts with a crack like a gunshot.'); return; }
    if (this.lineOut > 90) { this.snapLine('It took all your line. Gone.'); return; }
    if (['darter', 'thrasher'].includes(f.b) && this.tension < 0.1 && !reeling) this.slackT += dt; else this.slackT = Math.max(0, this.slackT - dt);
    if (this.slackT > 3 && f.stamina > 0.2) { this.game.ui.toast('The line went slack. It threw the hook.'); audio.splash(this.bobberPos, 0.4); this.reset(); return; }
    // grabber: you're being pulled in
    if (f.b === 'grabber') {
      this.grabT += dt;
      const toward = new THREE.Vector3(this.bobberPos.x - player.pos.x, 0, this.bobberPos.z - player.pos.z).normalize();
      if (!player.inBoat) { player.pos.addScaledVector(toward, dt * (0.6 + this.grabT * 0.3)); }
      else player.inBoat.tug?.(toward, dt);
      player.camShake = 0.4;
      if (canAct && input.hit('KeyX')) { this.cutLine(); return; }
      if (this.grabT > 4.5) { this.yanked(); return; }
    } else if (canAct && input.hit('KeyX')) { this.cutLine(); return; }
    // ---- fish position ----
    const lateral = f.dir * Math.min(7, this.lineOut * 0.35);
    const perp = new THREE.Vector3(-this.castDir.z, 0, this.castDir.x);
    const base = player.pos;
    const target = new THREE.Vector3(base.x + this.castDir.x * this.lineOut + perp.x * lateral, 0, base.z + this.castDir.z * this.lineOut + perp.z * lateral);
    if (game.level.lockFightToHole && this.landPos) { target.copy(this.landPos); this.lineOut = Math.max(this.lineOut, 0); }
    this.bobberPos.x = damp(this.bobberPos.x, target.x, 3, dt);
    this.bobberPos.z = damp(this.bobberPos.z, target.z, 3, dt);
    this.fishPos = this.bobberPos;
    const level = game.level;
    // keep fish in water; if it reaches land, it's effectively landed
    const surf = level.waterSurfaceAt(this.bobberPos.x, this.bobberPos.z);
    this.bobber.position.set(this.bobberPos.x, surf - 0.15 - (f.b === 'diver' ? 0.2 : 0), this.bobberPos.z);
    this.bobberPos.y = surf;
    if (this.lineOut <= 2.2 || (!level.isFishable(this.bobberPos.x, this.bobberPos.z) && this.lineOut < 6)) this.land();
  }

  snapLine(msg) {
    audio.snap();
    this.game.ui.toast(msg, 'warn');
    this.game.player.vm.shake = 1;
    this.game.events.emit('snap', this.catch);
    this.reset();
    this.state = 'unrigged';
    this.rigged = false;
    this.improvised = false;
    this.game.ui.toast(this.game.inventory.has('line') ? 'Click to re-rig with spare line.' : 'Click to improvise a new rig.');
  }
  cutLine() {
    audio.snap();
    this.game.ui.toast('You cut the line.');
    this.game.events.emit('cut', this.catch);
    this.reset();
    this.state = 'unrigged';
  }
  yanked() {
    const p = this.game.player;
    audio.splash(this.bobberPos, 1.5);
    this.game.events.emit('yanked', this.catch);
    this.reset();
    this.state = 'unrigged';
    p.damage(40, 'drowned', 'pulled');
    if (!p.dead) this.game.ui.toast('It dragged you to the edge before the line broke. Your rod is soaked. Your hands are shaking.', 'danger');
  }

  splashRing(pos, size = 1) {
    this.ring.position.set(pos.x, this.game.level.waterSurfaceAt(pos.x, pos.z) + 0.02, pos.z);
    this.ring.scale.setScalar(size);
    this.ring.material.opacity = 0.6;
  }

  // ---------------------------------------------------------------- catch selection
  rollCatch() {
    const game = this.game;
    const night = game.nightIndex;
    const hour = game.time ? game.time.hour : 0;
    const ns = game.nightState;
    const story = game.story;
    const bait = this.bait || 'none';
    const depth = this.impossible ? 500 : this.lineDepth;
    const spot = this.spotAt(this.bobberPos);
    // scripted overrides from the level
    const scripted = game.level.scriptedCatch ? game.level.scriptedCatch({ hour, depth, bait, ns, spot }) : null;
    if (scripted) return this.instance(CATALOG_BY_ID[scripted]);
    // alarm clock — probability rises with each hour
    if (!ns.alarmCaught && game.level.allowAlarm !== false) {
      const hi = clamp(Math.floor(hour), 0, 5);
      let p = (story.settings.alarmChanceByHour || CONFIG.alarmChanceByHour)[hi];
      if (depth > 8) p *= 1.25;
      if (bait === 'memento') p *= 1.6;
      p *= game.level.alarmMult ?? 1;
      p += ns.alarmPity || 0;
      if (game.nightmare) p *= game.nightmare.alarmMult;
      if (hour >= 4) ns.alarmPity = (ns.alarmPity || 0) + 0.04;
      if (Math.random() < p) return this.instance(CATALOG_BY_ID.alarm);
    }
    const nightF = (night - 1) / 6;
    const cands = CATALOG.filter((e) => {
      if (e.kind === 'alarm') return false;
      if (!e.nights.includes(night) && !(game.nightmare && e.kind !== 'story' && Math.random() < 0.03)) return false;
      if (hour < e.hours[0] || hour >= e.hours[1]) return false;
      if (depth < e.depth[0] || depth > e.depth[1]) return false;
      if (e.once === 'game' && story.caught.has(e.id)) return false;
      if (e.once === 'night' && ns.caught.has(e.id)) return false;
      if (e.memory && story.memories.has(e.memory)) return false;
      if (e.item && ITEMS[e.item]?.kind === 'relic' && story.relics.has(e.item)) return false;
      return true;
    });
    return this.instance(weightedPick(cands, (e) => {
      let w = e.w;
      if (e.story) w = 3 + ns.catches * 1.6 + (hour - e.hours[0]) * 2.5;
      w *= (e.baits[bait] ?? 1);
      if (e.kind === 'horror') w *= 0.25 + hour / 4 + nightF + (game.lucid ? 0.5 : 0) + game.player.fear * 0.5;
      if (e.kind === 'fish') w *= Math.max(0.25, 1.25 - hour / 8 - nightF * 0.3);
      if (this.impossible && (e.kind === 'fish' || e.kind === 'junk')) w *= 0.05;
      if (spot && spot.boost && spot.boost[e.id]) w *= spot.boost[e.id];
      if (game.nightmare) w *= game.nightmare.weight(e.id);
      return w;
    }));
  }

  instance(entry) {
    if (!entry) return null;
    const kg = rand(entry.kg[0], entry.kg[1]);
    return { entry, kg };
  }

  // ---------------------------------------------------------------- landing & inspection
  land() {
    const game = this.game;
    const c = this.catch;
    const e = c.entry;
    this.state = 'inspect';
    this.bobber.visible = false; this.line.visible = false; this.subLine.visible = false;
    audio.splash(game.player.pos, 0.5);
    game.nightState.catches++;
    game.nightState.caught.add(e.id);
    game.story.stats.catches++;
    if (e.once === 'game') game.story.caught.add(e.id);
    this.model = makeCatchModel(e);
    this.model.rotation.set(0.2, Math.PI / 2, 0);
    if (e.model.type === 'fish') this.model.rotation.y = 0;
    game.player.vm.holdObject(this.model);
    game.player.lookLocked = true;
    this.inspectT = 0;
    this.rotAccum = 0;
    this.changed = false;
    this.inspectDesc = catchDesc(e);
    if (e.fear) game.player.addFear(e.fear);
    game.events.emit('landed', c);
    if (e.kind === 'alarm') { this.alarmSequence(); return; }
    this.showInspect();
    if (e.speaks) setTimeout(() => audio.say(`Five more minutes, Mara. Five more minutes.`, { pitch: 0.85, rate: 0.85, volume: 0.9 }), 600);
    if (e.kind === 'horror') audio.sting(0.25);
    if (e.kind === 'story') audio.motif('clean', 0.12);
  }

  actionsFor(e) {
    const acts = [];
    if (e.vanish) return acts;
    const isFish = e.model.type === 'fish';
    if (e.memory || e.kind === 'story') acts.push({ key: 'E', label: 'Keep (journal)', fn: () => this.keep() });
    else if (e.kind === 'relic') acts.push({ key: 'E', label: 'Take (uses a slot)', fn: () => this.keep() });
    else if (isFish || e.item) acts.push({ key: 'E', label: 'Keep (uses a slot)', fn: () => this.keep() });
    if (isFish && e.kind !== 'story') acts.push({ key: 'C', label: e.contents ? 'Cut it open' : 'Cut into bait', fn: () => this.cut() });
    acts.push({ key: 'R', label: isFish ? 'Release' : 'Throw back', fn: () => this.release() });
    return acts;
  }

  showInspect() {
    const c = this.catch, e = c.entry;
    const kgTxt = e.model.type === 'fish' ? `${c.kg.toFixed(2)} kg` : '';
    this.game.ui.showInspect({ name: this.changed ? e.name.replace('Rainbow Trout', 'Rainbow Trout?') : e.name, desc: this.changed ? e.changedDesc : this.inspectDesc, sub: kgTxt, actions: this.actionsFor(e), kind: e.kind });
  }

  updateInspect(dt) {
    const input = this.game.input, e = this.catch.entry;
    this.inspectT += dt;
    if (this.model) {
      const dx = input.mouse.dx * 0.01, dy = input.mouse.dy * 0.01;
      this.model.rotation.y += dx; this.model.rotation.x = clamp(this.model.rotation.x + dy, -1.2, 1.2);
      this.rotAccum += Math.abs(dx);
      this.model.position.y = Math.sin(this.inspectT * 2) * 0.01;
      if (e.model.type === 'fish' && !e.vanish) this.model.rotation.z = Math.sin(this.inspectT * 9) * 0.06 * Math.max(0, 1 - this.inspectT / 6);
    }
    if (e.vanish && this.inspectT > 1.1 && this.model) {
      this.game.player.vm.clearHeld(); this.model = null;
      audio.whisper(null, null, 0.3);
      this.game.ui.showInspect({ name: 'Nothing.', desc: catchDesc(e), actions: [], kind: 'horror' });
      this.game.player.addFear(0.2);
      setTimeout(() => { if (this.state === 'inspect') this.closeInspect(); }, 3500);
    }
    if (e.changes && !this.changed && this.rotAccum > Math.PI * 1.2) {
      this.changed = true;
      this.game.player.vm.clearHeld();
      this.model = makeCatchModel({ model: e.changedModel });
      this.game.player.vm.holdObject(this.model);
      audio.sting(0.5);
      this.game.player.addFear(0.35);
      this.showInspect();
    }
    if (e.whisper) { this.whT = (this.whT || 0) - dt; if (this.whT <= 0) { audio.whisper(null, this.inspectT < 1 ? N() : null, 0.2); this.whT = 3; } }
    if (this.game.ui.modalOpen) return;
    for (const a of this.actionsFor(e)) if (input.hit('Key' + a.key)) { a.fn(); return; }
  }

  keep() {
    const game = this.game, e = this.catch.entry;
    if (e.memory) { game.story.addMemory(e.memory); this.closeInspect(); return; }
    const id = e.item || `catch:${e.id}`;
    if (!game.inventory.canAdd(id)) { game.ui.toast('No room. Drop something first [I], or let it go.', 'warn'); return; }
    game.inventory.add(id, 1, { kg: this.catch.kg });
    if (e.kind === 'relic' && RELIC_LINES[e.item]) { game.ui.subtitle(RELIC_LINES[e.item], 5); game.events.emit('relic', e.item); }
    this.closeInspect();
  }
  release() {
    audio.splash(this.game.player.pos, 0.35);
    this.game.events.emit('released', this.catch);
    this.closeInspect();
  }
  cut() {
    const game = this.game, e = this.catch.entry;
    audio.splash(null, 0.2);
    if (e.contents) {
      if (e.contents.startsWith('memory:')) {
        const mem = e.contents.slice(7);
        game.player.vm.clearHeld();
        this.model = makeCatchModel({ model: { type: 'item', item: 'photo2' } });
        game.player.vm.holdObject(this.model);
        game.story.addMemory(mem);
        audio.motif('broken', 0.12);
      } else {
        game.inventory.add(e.contents, 1, null);
        game.player.vm.clearHeld();
        this.model = makeCatchModel({ model: { type: 'item', item: 'key' } });
        game.player.vm.holdObject(this.model);
        game.ui.toast('There was a key inside it.');
      }
      game.inventory.add('chum', 1, null, true);
      game.ui.showInspect({ name: 'Inside...', desc: e.contents.startsWith('memory') ? 'A photograph, folded twice, sealed in a sandwich bag. It is dry.' : 'A rusted key on a wire ring. The paper tag is unreadable except for one word: BOATHOUSE.', actions: [{ key: 'E', label: 'Done', fn: () => this.closeInspect() }] });
      this.catch.entry = { ...e, contents: null, desc: 'Gutted.', model: { type: 'item', item: 'none' } };
      return;
    }
    const n = game.inventory.add('chum', 2);
    if (!n) game.ui.toast('No room for the bait.', 'warn');
    game.noise.emit(game.player.pos, 3, 'cut');
    game.smell?.(game.player.pos, 0.6);
    this.closeInspect();
  }
  closeInspect(silent = false) {
    if (this.state !== 'inspect' && !silent) return;
    this.game.player.vm.clearHeld();
    this.model = null;
    this.game.player.lookLocked = false;
    this.game.ui.hideInspect();
    if (!silent) { this.state = this.rigged ? 'idle' : 'unrigged'; }
  }

  // The alarm clock: heavy line, an old brass clock with the exact time, then the bell from the waking world.
  alarmSequence() {
    const game = this.game;
    const hour = game.time.hour;
    const h = Math.floor(hour) === 0 ? 12 : Math.floor(hour);
    const m = Math.floor((hour % 1) * 60);
    this.model.userData.setTime(h, m, game.nightIndex >= 5);
    game.nightState.alarmCaught = true;
    game.story.alarmCaught(game.nightIndex);
    game.ui.showInspect({ name: 'The Alarm Clock', desc: `An old brass wind-up alarm clock, choked with weed. It is still ticking.\n\nIt reads ${fmtTime(hour)}. Exactly now.\n\nThe alarm hand is set to 4:00.`, actions: [], kind: 'alarm' });
    audio.silenceAll(1.5);
    game.player.lookLocked = true;
    setTimeout(() => {
      const hammer = this.model && this.model.userData.hammer;
      let t = 0;
      const shake = setInterval(() => { t++; if (hammer) hammer.rotation.z = t % 2 ? 0.4 : -0.4; if (this.model) this.model.position.x = (Math.random() - 0.5) * 0.01; if (t > 60) clearInterval(shake); }, 50);
      audio.alarm(3.2, { vol: 0.4 });
      game.ui.subtitle('*BRRRRRRRRRING*', 3);
    }, 2200);
    setTimeout(() => {
      this.closeInspect();
      game.triggerLucidity();
    }, 5600);
  }

  // ---------------------------------------------------------------- line rendering
  updateLine() {
    if (!this.line.visible) return;
    const a = this._tip, b = this.bobber.position;
    const p = this.linePts;
    const n = p.length / 3;
    const slack = this.state === 'fight' ? clamp(1 - this.tension, 0, 1) * 0.4 : this.state === 'flight' ? 0.05 : 0.6;
    const dist = a.distanceTo(b);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const sag = Math.sin(t * Math.PI) * slack * Math.min(3, dist * 0.12);
      p[i * 3] = a.x + (b.x - a.x) * t;
      p[i * 3 + 1] = a.y + (b.y - a.y) * t - sag;
      p[i * 3 + 2] = a.z + (b.z - a.z) * t;
    }
    this.line.geometry.attributes.position.needsUpdate = true;
    this.subLine.visible = ['waiting', 'bite'].includes(this.state);
    if (this.subLine.visible) {
      const sp = this.subPts;
      sp[0] = b.x; sp[1] = b.y; sp[2] = b.z;
      sp[3] = b.x; sp[4] = b.y - Math.min(this.lineDepth, 30); sp[5] = b.z;
      this.subLine.geometry.attributes.position.needsUpdate = true;
    }
  }
}
