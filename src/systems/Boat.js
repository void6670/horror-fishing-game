import * as THREE from 'three';
import { audio } from '../engine/Audio.js';
import { clamp, damp, rand } from '../util/math.js';
import { woodTexture } from '../world/Materials.js';
import { mat, box, cyl } from '../world/Props.js';

// A small, vulnerable fishing boat: engine (fuel, stalls, repairs), lights, hull integrity, storage.
// The player walks on its deck in local coordinates while it pitches and rolls on the swell.
export class Boat {
  constructor(game, level, water, { x = 0, z = 0, yaw = 0 } = {}) {
    this.game = game; this.level = level; this.water = water;
    this.pos = new THREE.Vector3(x, 0, z);
    this.yaw = yaw;
    this.speed = 0; this.throttle = 0; this.rudder = 0;
    this.fuel = 0.7; this.engineOn = false; this.stalled = false;
    this.hull = 100;
    this.lightsOn = true;
    this.roll = 0; this.pitch = 0; this.kick = 0; this.kickPitch = 0;
    this.atHelm = false;
    this.deck = { hw: 1.0, hd: 2.9 };
    this.group = new THREE.Group();
    level.scene.add(this.group);
    this.build();
    this.local = new THREE.Vector3(0, 0, 0.5);
    this.noiseT = 0;
    this.interacts = [];
    this.setupInteractions();
  }

  build() {
    const g = this.group;
    const hullMat = new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.7, map: woodTexture('hull', [180, 180, 175], 10) });
    const outline = (k, P) => {
      P.moveTo(-1.2 * k, 3.2 * k); P.quadraticCurveTo(-1.35 * k, 0, -1.15 * k, -3.2 * k); P.lineTo(1.15 * k, -3.2 * k);
      P.quadraticCurveTo(1.35 * k, 0, 1.2 * k, 3.2 * k); P.quadraticCurveTo(0, 4.4 * k, -1.2 * k, 3.2 * k);
      return P;
    };
    const s = outline(1, new THREE.Shape());
    const ring = outline(1, new THREE.Shape());
    ring.holes.push(outline(0.9, new THREE.Path()));
    const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(ring, { depth: 1.1, bevelEnabled: false }), hullMat);
    hull.rotation.x = -Math.PI / 2;
    hull.position.y = -0.6;
    hull.castShadow = true; hull.receiveShadow = true;
    g.add(hull);
    const bottom = new THREE.Mesh(new THREE.ShapeGeometry(s), hullMat);
    bottom.rotation.x = Math.PI / 2; bottom.position.y = -0.6; g.add(bottom);
    const stripe = new THREE.Mesh(new THREE.ExtrudeGeometry(ring, { depth: 0.12, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: 0x7a2a22 }));
    stripe.rotation.x = -Math.PI / 2; stripe.position.y = 0.38; stripe.scale.set(1.005, 1.005, 1); g.add(stripe);
    const deck = new THREE.Mesh(new THREE.ShapeGeometry(s), mat('plank'));
    deck.rotation.x = -Math.PI / 2; deck.position.y = 0.05; deck.scale.set(0.9, 0.9, 1); deck.receiveShadow = true;
    g.add(deck);
    // wheelhouse (open back) near the bow
    const wh = new THREE.Group(); wh.position.set(0, 0.05, -1.4); g.add(wh);
    box(1.9, 1.0, 0.08, hullMat, 0, 0.5, -0.8, wh); box(0.08, 1.0, 1.2, hullMat, -0.95, 0.5, -0.2, wh); box(0.08, 1.0, 1.2, hullMat, 0.95, 0.5, -0.2, wh);
    box(2.0, 0.08, 1.4, hullMat, 0, 1.95, -0.2, wh);
    for (const x of [-0.95, 0.95]) cyl(0.03, 0.03, 0.95, 'metal', x, 1.48, 0.45, wh, 5);
    const glass = box(1.8, 0.85, 0.04, mat('glass'), 0, 1.45, -0.8, wh); glass.castShadow = false;
    // helm & wheel
    box(0.6, 0.9, 0.35, mat('darkwood'), 0, 0.45, -0.55, wh);
    this.wheel = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 16), mat('darkwood'));
    this.wheel.position.set(0, 1.05, -0.36); this.wheel.rotation.x = -0.5; wh.add(this.wheel);
    // engine (outboard) at stern
    const eng = new THREE.Group(); eng.position.set(0, 0.2, 3.3); g.add(eng);
    box(0.45, 0.6, 0.5, new THREE.MeshStandardMaterial({ color: 0x202224, roughness: 0.5, metalness: 0.4 }), 0, 0.35, 0, eng);
    cyl(0.06, 0.06, 1.2, 'metal', 0, -0.5, 0.05, eng, 6);
    this.engineMesh = eng;
    // storage crate
    box(0.8, 0.5, 0.6, mat('wood'), 0.55, 0.3, 1.7, g);
    // tarp hiding spot in bow
    const tarp = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2a4a5a, roughness: 1, side: THREE.DoubleSide }));
    tarp.scale.set(1.0, 0.55, 1.2); tarp.position.set(0, 0.05, -2.75); g.add(tarp);
    // mast light
    cyl(0.04, 0.04, 1.4, 'metal', 0, 2.6, -1.6, g, 6);
    this.lamp = new THREE.PointLight(0xffd8a0, 7, 18, 1.6);
    this.lamp.position.set(0, 3.3, -1.6);
    g.add(this.lamp);
    this.lampGlow = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), mat('lampGlow'));
    this.lampGlow.position.copy(this.lamp.position); g.add(this.lampGlow);
    this.spot = new THREE.SpotLight(0xfff0d8, 30, 50, 0.35, 0.5, 1.4);
    this.spot.position.set(0, 2.0, -2.2);
    const tgt = new THREE.Object3D(); tgt.position.set(0, -1, -20); g.add(tgt); this.spot.target = tgt;
    g.add(this.spot);
    this.lightSource = this.level.addLightSource(new THREE.Vector3(), 7, null, { safe: true });
  }

  setupInteractions() {
    const L = this.level;
    const mk = (lx, ly, lz, def) => { const it = L.addInteractable({ pos: { x: 0, y: 0, z: 0 }, ...def }); it.local = new THREE.Vector3(lx, ly, lz); this.interacts.push(it); return it; };
    mk(0, 1.3, -1.6, { radius: 1.6, prompt: () => (this.atHelm ? 'Leave the helm' : 'Take the helm'), onUse: () => this.toggleHelm(), cond: () => !this.game.fishing.busy() });
    mk(0, 0.7, 3.0, {
      radius: 1.5, hold: 2.5, prompt: () => (this.fuel <= 0 ? (this.game.inventory.has('fuel') ? 'Refuel engine' : 'Out of fuel') : this.stalled ? 'Pull the starter cord (hold E)' : this.engineOn ? 'Engine running' : 'Start engine (hold E)'),
      cond: () => !this.atHelm,
      whileHolding: () => { if (Math.random() < 0.05) audio.creak(null, 0.15); },
      onUse: () => this.useEngine(),
    });
    mk(0.55, 0.8, 1.7, { radius: 1.3, prompt: 'Search storage crate', onUse: (p) => this.openCrate(p) });
    this.hideSpot = L.addHideSpot({ name: 'tarp', kind: 'boat', pos: new THREE.Vector3(), view: new THREE.Vector3(), yaw: 0, searchable: true, lookLimit: 0.8, safeFromIce: true });
    // remove the auto-added hide interactable's fixed position: we update it each frame
    this.hideInteract = L.interactables[L.interactables.length - 1];
    this.hideInteract.local = new THREE.Vector3(0, 0.6, -2.4);
    this.interacts.push(this.hideInteract);
    this.crateUsed = 0;
  }

  openCrate() {
    const inv = this.game.inventory;
    const hour = Math.floor(this.game.time.hour);
    if (this.crateUsed > hour) { this.game.ui.toast('The crate is empty. Maybe later.'); return; }
    this.crateUsed = hour + 2;
    const loot = [['fuel', 1], ['battery', 1], ['minnow', 4], ['line', 1], ['flare', 1]];
    const [id, n] = loot[Math.floor(Math.random() * loot.length)];
    if (!inv.add(id, n)) this.crateUsed = 0;
    audio.creak(null, 0.2);
  }

  useEngine() {
    if (this.fuel <= 0) {
      if (this.game.inventory.has('fuel')) { this.game.inventory.remove('fuel', 1); this.fuel = 1; this.game.ui.toast('Refueled.'); }
      else this.game.ui.toast('No fuel.', 'warn');
      return;
    }
    if (this.engineOn) return;
    audio.creak(null, 0.3);
    if (!this.stalled || Math.random() < 0.65 * (this.game.story.upgrades.boat ? 1.3 : 1)) {
      this.engineOn = true; this.stalled = false;
      this.game.ui.toast('The engine coughs, catches, and rumbles.');
    } else { this.game.ui.toast('It sputters and dies. Try again.'); this.game.noise.emit(this.pos, 18, 'engine'); }
  }

  toggleHelm() {
    this.atHelm = !this.atHelm;
    if (this.atHelm) { this.local.set(0, 0, -1.25); this.game.ui.toast('[W/S] throttle · [A/D] steer · [L] lights · [E] leave helm'); }
  }

  stall(msg = 'The engine chokes and dies.') {
    if (!this.engineOn) return;
    this.engineOn = false; this.stalled = true; this.throttle = 0;
    this.game.ui.toast(msg, 'warn');
  }

  bump(strength = 1) {
    this.kick += (Math.random() < 0.5 ? -1 : 1) * 0.18 * strength;
    this.kickPitch += 0.08 * strength;
    audio.bump(new THREE.Vector3(this.pos.x, this.pos.y - 1.5, this.pos.z), 0.9 * strength);
    this.game.player.camShake = 0.6 * strength;
    if (Math.random() < 0.5 * strength) this.stall('Something hit the hull. The engine died.');
  }
  damageHull(v) {
    this.hull = Math.max(0, this.hull - v);
    this.bump(1.5);
    if (this.hull <= 0) this.game.deathSequence({ type: 'swallow', text: 'The boat broke in half. The sea took you down.' });
    else this.game.ui.toast(`Hull damaged (${Math.round(this.hull)}%)`, 'danger');
  }
  tug(dir, dt) { this.pos.addScaledVector(dir, dt * 0.8); this.kick += dt * 0.1; }

  update(dt) {
    const input = this.game.input;
    const p = this.game.player;
    if (this.atHelm && p.controllable) {
      if (input.down('KeyW')) this.throttle = Math.min(1, this.throttle + dt * 0.6);
      if (input.down('KeyS')) this.throttle = Math.max(-0.3, this.throttle - dt * 0.8);
      this.rudder = (input.down('KeyA') ? 1 : 0) - (input.down('KeyD') ? 1 : 0);
      if (input.hit('KeyE')) { this.toggleHelm(); input.pressed.delete('KeyE'); }
    } else this.rudder = 0;
    if (p.controllable && input.hit('KeyL') && this.game.player.inBoat === this) { this.lightsOn = !this.lightsOn; audio.click(0.3); }
    if (this.fuel <= 0 && this.engineOn) this.stall('Out of fuel.');
    const thrust = this.engineOn ? this.throttle : 0;
    if (this.engineOn) this.fuel = Math.max(0, this.fuel - dt * 0.004 * (0.2 + Math.abs(thrust)));
    this.speed = damp(this.speed, thrust * 7, 0.6, dt);
    this.yaw += this.rudder * dt * 0.5 * clamp(Math.abs(this.speed) / 3, 0.15, 1);
    this.pos.x -= Math.sin(this.yaw) * this.speed * dt;
    this.pos.z -= Math.cos(this.yaw) * this.speed * dt;
    // buoyancy
    const w = this.water;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const hF = w.heightAt(this.pos.x + fx * 2.5, this.pos.z + fz * 2.5), hB = w.heightAt(this.pos.x - fx * 2.5, this.pos.z - fz * 2.5);
    const hL = w.heightAt(this.pos.x - rx * 1.1, this.pos.z - rz * 1.1), hR = w.heightAt(this.pos.x + rx * 1.1, this.pos.z + rz * 1.1);
    this.pos.y = damp(this.pos.y, (hF + hB + hL + hR) / 4 - 0.05, 4, dt);
    this.kick = damp(this.kick, 0, 1.5, dt); this.kickPitch = damp(this.kickPitch, 0, 1.5, dt);
    const targetRoll = Math.atan2(hL - hR, 2.2) * 0.8 + this.kick;
    const targetPitch = Math.atan2(hF - hB, 5) * 0.8 + this.kickPitch;
    this.roll = damp(this.roll, targetRoll, 3, dt);
    this.pitch = damp(this.pitch, targetPitch, 3, dt);
    this.group.position.copy(this.pos);
    this.group.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
    this.group.updateMatrixWorld(true);
    this.wheel.rotation.z = damp(this.wheel.rotation.z, this.rudder * 1.2, 3, dt);
    // engine sound & noise
    audio.engine(this.engineOn ? 0.2 + Math.abs(this.throttle) * 0.8 : 0);
    this.noiseT -= dt;
    if (this.engineOn && this.noiseT <= 0) { this.noiseT = 0.5; this.game.noise.emit(this.pos, 15 + Math.abs(this.throttle) * 30, 'engine'); }
    // lights
    this.lamp.intensity = this.lightsOn ? 7 : 0;
    this.spot.intensity = this.lightsOn && this.engineOn ? 30 : 0;
    this.lampGlow.visible = this.lightsOn;
    this.lightSource.on = this.lightsOn;
    this.lightSource.pos.copy(this.pos).y += 1.5;
    // interactables follow the boat
    for (const it of this.interacts) { it.pos.copy(it.local).applyMatrix4(this.group.matrixWorld); }
    const hv = new THREE.Vector3(0, 0.5, -2.6).applyMatrix4(this.group.matrixWorld);
    this.hideSpot.view.copy(hv); this.hideSpot.pos.copy(hv);
    this.hideSpot.yaw = this.yaw + Math.PI;
    this.hideSpot.exit = new THREE.Vector3(0, 0, -1.9).applyMatrix4(this.group.matrixWorld);
    if (Math.random() < dt * 0.15) audio.creak(this.pos, 0.12);
  }

  // Moves the player in boat-local coordinates; called from Player.update.
  updatePassenger(player, dt, vel) {
    if (this.atHelm) { this.local.x = damp(this.local.x, 0, 8, dt); this.local.z = damp(this.local.z, -1.25, 8, dt); }
    else {
      const c = Math.cos(-this.yaw), s = Math.sin(-this.yaw);
      this.local.x += (vel.x * c - vel.z * s) * dt;
      this.local.z += (vel.x * s + vel.z * c) * dt;
      this.local.x = clamp(this.local.x, -0.8, 0.8);
      this.local.z = clamp(this.local.z, -1.25, 2.6);
    }
    const wp = new THREE.Vector3(this.local.x, 0.08, this.local.z).applyMatrix4(this.group.matrixWorld);
    player.pos.copy(wp);
    player.surface = 'wood';
    player.wading = 0;
    // being thrown about
    if (Math.abs(this.roll) > 0.35 && Math.random() < dt) { player.damage(5, 'boat'); }
  }

  get roll_() { return this.roll; }
  dispose() { this.level.scene.remove(this.group); }
}
