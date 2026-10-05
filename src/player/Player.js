import * as THREE from 'three';
import { Viewmodel } from './Viewmodel.js';
import { audio } from '../engine/Audio.js';
import { CONFIG } from '../config.js';
import { clamp, damp, lerp, viewAngle } from '../util/math.js';

const UP = new THREE.Vector3(0, 1, 0);

// Flashlight: a real shadow-casting spotlight held in the left hand.
class Flashlight {
  constructor(camera) {
    this.light = new THREE.SpotLight(0xfff1d6, 0, 32, 0.42, 0.55, 1.5);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(512, 512);
    this.light.shadow.bias = -0.0005;
    this.light.shadow.camera.near = 0.3;
    this.light.position.set(-0.18, -0.12, -0.2);
    this.target = new THREE.Object3D();
    this.target.position.set(-0.05, -0.2, -6);
    camera.add(this.light); camera.add(this.target);
    this.light.target = this.target;
    this.on = false;
    this.battery = 1;
    this.maxIntensity = 55;
    this.drain = 1 / 420; // ~7 minutes per battery
    this.flicker = 0;
    this.factor = 0;
    this.worldPos = new THREE.Vector3();
    this.worldDir = new THREE.Vector3();
    this.forcedOff = 0;
  }
  toggle() {
    if (this.battery <= 0) { audio.click(0.2); return; }
    this.on = !this.on; audio.click(0.25);
  }
  update(dt, camera) {
    if (this.on) this.battery = Math.max(0, this.battery - this.drain * dt);
    if (this.battery <= 0) this.on = false;
    this.forcedOff = Math.max(0, this.forcedOff - dt);
    let f = this.on && this.forcedOff <= 0 ? 1 : 0;
    if (f && this.battery < 0.15) f *= 0.4 + this.battery * 4 * (Math.random() < 0.08 ? 0.2 : 1);
    if (f && this.flicker > 0) { f *= Math.random() < this.flicker ? 0.05 : 1; this.flicker = Math.max(0, this.flicker - dt * 0.5); }
    this.factor = f;
    this.light.intensity = this.maxIntensity * f;
    this.light.getWorldPosition(this.worldPos);
    camera.getWorldDirection(this.worldDir);
  }
}

export class Player {
  constructor(game) {
    this.game = game;
    this.camera = game.camera;
    this.camera.layers.enable(1);
    this.vm = new Viewmodel(this.camera);
    this.flashlight = new Flashlight(this.camera);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.eye = 1.65;
    this.radius = 0.35;
    this.reset();
  }

  reset() {
    this.health = 100; this.maxHealth = 100;
    this.stamina = 1; this.exhausted = false;
    this.fear = 0; this.fearSpike = 0;
    this.breath = 1; this.holdingBreath = false;
    this.hidden = null;
    this.dead = false;
    this.crouch = false;
    this.inBoat = null;
    this.underwater = false;
    this.frozen = false; // no control (cutscenes, inspecting)
    this.lookLocked = false;
    this.rodOut = true;
    this.stepPhase = 0;
    this.noise = 0;
    this.moving = 0;
    this.surface = 'grass';
    this.wading = 0;
    this.damageFlash = 0;
    this.interactTarget = null;
    this.holdProgress = 0;
    this.lastSeenByMonster = 0;
    this.camShake = 0;
    this.forcedLook = null;
    this.extraSpeed = 1;
    this.flashlight.on = false;
    this.flashlight.battery = 1;
    this.vm.rodTarget = 1;
  }

  spawn(p, yaw = 0) {
    this.pos.set(p.x, p.y ?? 0, p.z);
    const g = this.game.level.groundAt(this.pos.x, this.pos.z, (p.y ?? 0) + 2);
    this.pos.y = g.y;
    this.yaw = yaw; this.pitch = 0;
    this.vel.set(0, 0, 0);
    this.hidden = null;
    this.applyCamera(0);
  }

  get eyePos() { return this.camera.position; }
  forward(out = new THREE.Vector3()) { return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }

  addFear(v) { this.fearSpike = Math.min(1, this.fearSpike + v); }

  damage(amount, source = 'monster', cause = null) {
    if (this.dead || this.game.godMode) return;
    this.health -= amount;
    this.damageFlash = 1;
    this.camShake = 0.6;
    this.addFear(0.3);
    audio.hit();
    if (this.health <= 0) { this.health = 0; this.die(cause || source); }
  }
  heal(v) { this.health = Math.min(this.maxHealth, this.health + v); }

  die(cause) {
    if (this.dead) return;
    this.dead = true;
    this.game.onPlayerDeath(cause);
  }

  // ---------------- hiding ----------------
  enterHide(spot) {
    if (this.hidden) return;
    if (this.game.fishing && this.game.fishing.busy()) this.game.fishing.abort('You reel in hastily.');
    this.hidden = spot;
    this.preHide = this.pos.clone();
    this.yaw = spot.yaw + Math.PI; // look out the opening
    this.pitch = 0;
    this.hideYaw = this.yaw;
    audio.creak(null, 0.2);
    this.game.ui.toast(`Hiding in the ${spot.name}. [E] leave · hold [Space] hold breath`);
    this.game.events.emit('hide', spot);
  }
  exitHide() {
    if (!this.hidden) return;
    const spot = this.hidden;
    this.hidden = null;
    const ex = spot.exit || this.preHide;
    this.pos.set(ex.x, ex.y, ex.z);
    this.pos.y = this.game.level.groundAt(ex.x, ex.z, ex.y + 1).y;
    this.holdingBreath = false;
    audio.creak(null, 0.2);
    this.game.events.emit('unhide', spot);
  }
  forceOut(by) {
    if (!this.hidden) return;
    this.exitHide();
    this.addFear(0.6);
    this.damage(25, 'grab', by);
  }

  // ---------------- main update ----------------
  update(dt) {
    const input = this.game.input;
    const level = this.game.level;
    if (!level) return;
    const controllable = !this.frozen && !this.dead && input.locked && (this.game.state === 'night' || this.game.state === 'day');
    this.controllable = controllable;

    // ---- look ----
    if (controllable && !this.lookLocked) {
      const s = CONFIG.mouseSensitivity * (this.game.fishing?.state === 'fight' ? 0.6 : 1);
      this.yaw -= input.mouse.dx * s;
      this.pitch -= input.mouse.dy * s;
      this.pitch = clamp(this.pitch, -1.45, 1.45);
      if (this.hidden) {
        const lim = this.hidden.lookLimit ?? 1.2;
        let d = this.yaw - this.hideYaw;
        while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
        this.yaw = this.hideYaw + clamp(d, -lim, lim);
        this.pitch = clamp(this.pitch, -0.6, 0.5);
      }
    }
    if (this.forcedLook) {
      const f = this.forcedLook;
      const dx = f.target.x - this.camera.position.x, dz = f.target.z - this.camera.position.z, dy = f.target.y - this.camera.position.y;
      const ty = Math.atan2(-dx, -dz), tp = Math.atan2(dy, Math.hypot(dx, dz));
      let d = ty - this.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * Math.min(1, dt * f.speed);
      this.pitch += (tp - this.pitch) * Math.min(1, dt * f.speed);
      f.time -= dt;
      if (f.time <= 0) this.forcedLook = null;
    }

    // ---- movement ----
    let moveX = 0, moveZ = 0;
    if (controllable && !this.hidden && !this.inBoat?.atHelm) {
      if (input.down('KeyW')) moveZ -= 1;
      if (input.down('KeyS')) moveZ += 1;
      if (input.down('KeyA')) moveX -= 1;
      if (input.down('KeyD')) moveX += 1;
    }
    if (controllable && (input.hit('KeyC') || input.hit('ControlLeft'))) this.crouch = !this.crouch;
    const wantRun = controllable && input.down('ShiftLeft') && moveZ < 0 && !this.crouch && !this.exhausted;
    const fishingSlow = this.game.fishing && this.game.fishing.busy() ? 0.45 : 1;
    let speed = (this.crouch ? 1.4 : wantRun ? 5.4 : 2.7) * fishingSlow * this.extraSpeed;
    if (this.underwater) speed *= 0.55;
    if (this.wading > 0.2) speed *= lerp(1, 0.45, clamp(this.wading / this.game.level.maxWade, 0, 1));
    if (this.surface === 'snow') speed *= 0.85;
    const len = Math.hypot(moveX, moveZ);
    const running = wantRun && len > 0 && fishingSlow === 1;
    if (len > 0) { moveX /= len; moveZ /= len; }
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const wx = moveX * cos + moveZ * sin, wz = -moveX * sin + moveZ * cos;
    const accel = this.underwater ? 3 : this.surface === 'ice' ? 2.5 : 12;
    this.vel.x = damp(this.vel.x, wx * speed, accel, dt);
    this.vel.z = damp(this.vel.z, wz * speed, accel, dt);
    this.moving = clamp(Math.hypot(this.vel.x, this.vel.z) / 2.7, 0, 2);

    // stamina
    if (running) {
      this.stamina -= dt * 0.17;
      if (this.stamina <= 0) { this.stamina = 0; this.exhausted = true; audio.whisper(null, null, 0.15); }
    } else {
      this.stamina = Math.min(1, this.stamina + dt * (this.moving > 0.1 ? 0.08 : 0.15));
      if (this.exhausted && this.stamina > 0.35) this.exhausted = false;
    }

    if (this.inBoat) {
      this.inBoat.updatePassenger(this, dt, this.vel);
    } else if (!this.hidden) {
      const prev = this.pos.clone();
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      level.resolve(this.pos, this.radius, this.pos.y, this.crouch ? 1.0 : 1.7);
      const g = level.groundAt(this.pos.x, this.pos.z, this.pos.y);
      // block deep water (unless the level allows it)
      const depth = level.waterDepthAt(this.pos.x, this.pos.z, g.y);
      if (!g.platform && depth > level.maxWade && !level.allowDeepWater) {
        this.pos.x = prev.x; this.pos.z = prev.z;
        // try sliding
        this.pos.x += this.vel.x * dt;
        const g2 = level.groundAt(this.pos.x, this.pos.z, this.pos.y);
        if (!g2.platform && level.waterDepthAt(this.pos.x, this.pos.z, g2.y) > level.maxWade) this.pos.x = prev.x;
        this.pos.z += this.vel.z * dt;
        const g3 = level.groundAt(this.pos.x, this.pos.z, this.pos.y);
        if (!g3.platform && level.waterDepthAt(this.pos.x, this.pos.z, g3.y) > level.maxWade) this.pos.z = prev.z;
      }
      const gg = level.groundAt(this.pos.x, this.pos.z, this.pos.y);
      // step/fall smoothing
      if (gg.y > this.pos.y) this.pos.y = damp(this.pos.y, gg.y, 25, dt);
      else this.pos.y = damp(this.pos.y, gg.y, 12, dt);
      this.surface = gg.surface;
      this.wading = gg.platform ? 0 : Math.max(0, level.waterDepthAt(this.pos.x, this.pos.z, gg.y));
      if (this.wading > 0.05 && !this.underwater) this.surface = 'water';
      this.onPlatform = gg.platform;
    }

    // ---- footsteps & noise ----
    let noise = 0;
    if (!this.hidden && this.moving > 0.1) {
      this.stepPhase += dt * (running ? 2.6 : this.crouch ? 1.2 : 1.8) * Math.min(1.3, this.moving + 0.3);
      if (this.stepPhase >= 1) {
        this.stepPhase -= 1;
        const vol = running ? 0.38 : this.crouch ? 0.08 : 0.2;
        audio.footstep(this.underwater ? 'seabed' : this.surface, vol);
        const loud = (running ? 22 : this.crouch ? 3 : 9) * (this.surface === 'water' ? 1.8 : this.surface === 'metal' ? 1.5 : this.surface === 'ice' ? 1.3 : 1);
        this.game.noise.emit(this.pos, loud, 'step');
        if (this.surface === 'water' && Math.random() < 0.3) audio.splash(null, 0.15);
      }
      noise = running ? 1 : this.crouch ? 0.1 : 0.4;
    }
    if (this.exhausted && Math.random() < dt * 2) { this.game.noise.emit(this.pos, 7, 'breath'); }
    // breath holding while hidden
    if (this.hidden) {
      const hold = controllable && input.down('Space') && this.breath > 0;
      if (hold) { this.breath = Math.max(0, this.breath - dt * 0.12); if (this.breath === 0) { audio.whisper(null, null, 0.4); this.game.noise.emit(this.pos, 12, 'gasp'); this.addFear(0.2); } }
      else this.breath = Math.min(1, this.breath + dt * 0.18);
      this.holdingBreath = hold;
      if (!hold && Math.random() < dt * 0.4) this.game.noise.emit(this.pos, 2.5 + this.fear * 3, 'breath');
      if (controllable && input.hit('KeyE')) { this.exitHide(); input.pressed.delete('KeyE'); }
    } else { this.holdingBreath = false; this.breath = Math.min(1, this.breath + dt * 0.2); }
    this.noise = noise;
    this.running = running;

    // ---- flashlight ----
    if (controllable && input.hit('KeyF')) { this.flashlight.toggle(); this.game.noise.emit(this.pos, 2, 'click'); }
    if (controllable && input.hit('KeyR')) this.replaceBattery();
    this.flashlight.update(dt, this.camera);
    this.vm.torchRaise = 1;
    if (controllable && input.hit('KeyQ') && !(this.game.fishing && this.game.fishing.busy())) { this.rodOut = !this.rodOut; this.vm.rodTarget = this.rodOut ? 1 : 0; }

    // ---- fear ----
    this.updateFear(dt);

    // ---- interaction ----
    if (controllable) this.updateInteraction(dt);

    this.damageFlash = Math.max(0, this.damageFlash - dt * 1.5);
    this.camShake = Math.max(0, this.camShake - dt * 1.8);
    this.applyCamera(dt);
    this.vm.update(dt, { moving: this.hidden ? 0 : this.moving, running, crouch: this.crouch, hidden: !!this.hidden && !this.hidden.showHands });
  }

  replaceBattery() {
    const inv = this.game.inventory;
    if (this.flashlight.battery > 0.95) { this.game.ui.toast('Battery is still fresh.'); return; }
    if (!inv.has('battery')) { this.game.ui.toast('No spare batteries.', 'warn'); return; }
    inv.remove('battery', 1);
    this.flashlight.battery = 1;
    audio.click(0.3); setTimeout(() => audio.click(0.3), 200);
    this.game.ui.toast('Replaced the batteries.');
  }

  updateFear(dt) {
    const level = this.game.level;
    const g = this.game;
    const hourF = g.time ? g.time.hour / 6 : 0;
    const lightHere = Math.max(level.lightAt(this.pos), this.flashlight.factor * 0.55, level.ambientLight ?? 0.15);
    const darkness = clamp(1 - lightHere, 0, 1);
    let threat = 0;
    for (const m of g.monsters) threat = Math.max(threat, m.threatTo ? m.threatTo(this) : 0);
    this.threat = threat;
    const base = (level.fearBase ?? 0.05) + darkness * (0.18 + hourF * 0.25) + threat * 0.75 + (g.lucid ? 0.15 : 0);
    const target = clamp(base + this.fearSpike, 0, 1);
    const rate = target > this.fear ? 0.35 : 0.08;
    this.fear = damp(this.fear, target, rate * 4, dt);
    if (this.hidden) this.fear = Math.max(this.fear, 0.25);
    this.fearSpike = Math.max(0, this.fearSpike - dt * 0.05);
  }

  updateInteraction(dt) {
    const level = this.game.level;
    const input = this.game.input;
    let best = null, bestScore = Infinity;
    if (!this.hidden && !(this.game.fishing && this.game.fishing.blocksInteract())) {
      for (const it of level.interactables) {
        if (!it.enabled || (it.cond && !it.cond())) continue;
        const d = this.camera.position.distanceTo(it.pos);
        if (d > it.radius + 0.6) continue;
        const ang = viewAngle(this.camera, it.pos);
        if (ang > (it.wide ? 1.0 : 0.6) && d > 0.9) continue;
        const score = d + ang * 3;
        if (score < bestScore) { bestScore = score; best = it; }
      }
    }
    if (best !== this.interactTarget) this.holdProgress = 0;
    this.interactTarget = best;
    if (!best) return;
    if (best.hold > 0) {
      if (input.down('KeyE')) {
        this.holdProgress += dt / best.hold;
        if (best.whileHolding) best.whileHolding(dt);
        if (this.holdProgress >= 1) { this.holdProgress = 0; best.onUse(this); }
      } else this.holdProgress = Math.max(0, this.holdProgress - dt * 2);
    } else if (input.hit('KeyE')) {
      input.pressed.delete('KeyE');
      best.onUse(this);
    }
  }

  applyCamera(dt) {
    const cam = this.camera;
    let eyePos;
    if (this.hidden) {
      eyePos = this.hidden.view;
    } else {
      const eyeH = this.crouch ? 1.0 : this.eye;
      const bob = Math.sin(this.stepPhase * Math.PI * 2) * 0.035 * Math.min(1, this.moving) * (this.running ? 1.6 : 1);
      this._eyeH = damp(this._eyeH ?? eyeH, eyeH, 10, dt || 1);
      eyePos = { x: this.pos.x, y: this.pos.y + this._eyeH + bob - Math.min(this.wading, 0.6) * 0.3, z: this.pos.z };
    }
    cam.position.set(eyePos.x, eyePos.y, eyePos.z);
    let roll = 0;
    if (this.inBoat) roll = this.inBoat.roll || 0;
    if (this.camShake > 0) {
      cam.position.x += (Math.random() - 0.5) * 0.06 * this.camShake;
      cam.position.y += (Math.random() - 0.5) * 0.06 * this.camShake;
    }
    cam.rotation.set(0, 0, 0, 'YXZ');
    cam.rotation.order = 'YXZ';
    cam.rotation.y = this.yaw;
    cam.rotation.x = this.pitch;
    cam.rotation.z = roll + (this.fear > 0.6 ? Math.sin(performance.now() * 0.0008) * 0.01 * this.fear : 0);
    cam.updateMatrixWorld();
  }

  lookingAt(point, maxAngle = 0.35) { return viewAngle(this.camera, point) < maxAngle; }
}
export { UP };
