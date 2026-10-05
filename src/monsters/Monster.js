import * as THREE from 'three';
import { audio } from '../engine/Audio.js';
import { clamp, damp, angleWrap, inView, rand } from '../util/math.js';

// ---------------------------------------------------------------- procedural bodies
export function makeHumanoid({ height = 1.8, thin = 1, color = 0x2a2e28, skin = 0x7a8478, hat = false, coat = true, eyes = 0, armLen = 1, hunch = 0, emissiveEyes = 0xd8e8e0 } = {}) {
  const s = height / 1.8;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const clothMat = new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.6 });
  const mk = (geo, m, x, y, z, parent) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.castShadow = true; parent.add(mesh); return mesh; };
  const hips = new THREE.Group(); hips.position.y = 0.95 * s; body.add(hips);
  const torso = new THREE.Group(); hips.add(torso); torso.rotation.x = hunch;
  mk(new THREE.CylinderGeometry(0.17 * s * thin, 0.15 * s * thin, 0.62 * s, 8), clothMat, 0, 0.31 * s, 0, torso);
  if (coat) mk(new THREE.CylinderGeometry(0.2 * s * thin, 0.26 * s * thin, 0.75 * s, 8, 1, true), clothMat, 0, 0.12 * s, 0, torso).material.side = THREE.DoubleSide;
  const neck = new THREE.Group(); neck.position.y = 0.66 * s; torso.add(neck);
  const head = mk(new THREE.SphereGeometry(0.11 * s, 10, 8), skinMat, 0, 0.12 * s, 0, neck);
  head.scale.set(0.9, 1.15, 0.95);
  if (hat) {
    const hatMat = new THREE.MeshStandardMaterial({ color: 0x3a3a28, roughness: 1 });
    mk(new THREE.CylinderGeometry(0.26 * s, 0.26 * s, 0.02 * s, 14), hatMat, 0, 0.22 * s, 0, neck);
    mk(new THREE.CylinderGeometry(0.11 * s, 0.13 * s, 0.12 * s, 10), hatMat, 0, 0.28 * s, 0, neck);
  }
  const eyeMeshes = [];
  if (eyes) {
    const em = new THREE.MeshBasicMaterial({ color: emissiveEyes });
    for (const sx of [-1, 1]) eyeMeshes.push(mk(new THREE.SphereGeometry(0.012 * s, 6, 4), em, sx * 0.04 * s, 0.14 * s, 0.1 * s, neck));
  }
  const limb = (x, y, len, r, m, parent) => {
    const g = new THREE.Group(); g.position.set(x, y, 0); parent.add(g);
    mk(new THREE.CylinderGeometry(r * 0.8, r, len, 6), m, 0, -len / 2, 0, g);
    return g;
  };
  const armL = limb(-0.22 * s * thin, 0.58 * s, 0.75 * s * armLen, 0.045 * s, clothMat, torso);
  const armR = limb(0.22 * s * thin, 0.58 * s, 0.75 * s * armLen, 0.045 * s, clothMat, torso);
  for (const a of [armL, armR]) mk(new THREE.SphereGeometry(0.05 * s, 6, 4), skinMat, 0, -0.78 * s * armLen, 0, a);
  const legL = limb(-0.09 * s, 0, 0.95 * s, 0.07 * s, clothMat, hips);
  const legR = limb(0.09 * s, 0, 0.95 * s, 0.07 * s, clothMat, hips);
  const parts = { root, body, hips, torso, neck, head, armL, armR, legL, legR, eyes: eyeMeshes };
  let phase = 0;
  const animate = (dt, speed, mode = 'walk') => {
    phase += dt * (1.5 + speed * 1.8);
    const a = Math.min(1, speed / 2) * 0.6;
    legL.rotation.x = Math.sin(phase) * a; legR.rotation.x = -Math.sin(phase) * a;
    if (mode === 'reach') { armL.rotation.x = armR.rotation.x = -1.4 + Math.sin(phase * 2) * 0.1; }
    else if (mode === 'limp') { armL.rotation.x = Math.sin(phase * 0.3) * 0.05; armR.rotation.x = Math.sin(phase * 0.27) * 0.05; armL.rotation.z = -0.05; armR.rotation.z = 0.05; }
    else { armL.rotation.x = -Math.sin(phase) * a * 0.8; armR.rotation.x = Math.sin(phase) * a * 0.8; }
    hips.position.y = 0.95 * s + Math.abs(Math.sin(phase)) * 0.03 * Math.min(1, speed);
  };
  return { ...parts, animate, height };
}

// ---------------------------------------------------------------- base monster
const _v = new THREE.Vector3();

export class Monster {
  constructor(game, opts = {}) {
    this.game = game;
    this.level = game.pendingLevel || game.level;
    this.name = opts.name || 'Something';
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.state = 'dormant';
    this.stateT = 0;
    this.alert = 0; // 0..1 awareness of player
    this.lastKnown = null;
    this.lastSeenT = -999;
    this.radius = opts.radius ?? 0.45;
    this.sightRange = opts.sightRange ?? 30;
    this.hearing = opts.hearing ?? 1;
    this.fov = opts.fov ?? 1.2; // half-angle radians
    this.walkSpeed = opts.walkSpeed ?? 1.4;
    this.runSpeed = opts.runSpeed ?? 3.6;
    this.damage = opts.damage ?? 50;
    this.attackCd = 0;
    this.t = 0;
    this.enraged = false;
    this.mesh = new THREE.Group();
    this.level.scene.add(this.mesh);
    this.headHeight = opts.headHeight ?? 1.7;
    this.speedNow = 0;
  }
  get player() { return this.game.player; }
  get hour() { return this.game.time ? this.game.time.hour : 0; }
  get diff() { return this.game.difficulty * (this.enraged ? 1.35 : 1); }

  setState(s) { if (this.state !== s) { this.prevState = this.state; this.state = s; this.stateT = 0; } }

  headPos(out = _v) { return out.set(this.pos.x, this.pos.y + this.headHeight, this.pos.z); }

  // Sight: range scaled by player's light & stance, darkness and fog; occluders block.
  canSeePlayer() {
    const p = this.player;
    if (p.hidden && !this.sawHide) return false;
    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    let range = this.sightRange;
    if (p.flashlight.factor > 0.2) range *= 1.7;
    if (this.level.lightAt(p.pos) > 0.3) range *= 1.3;
    if (p.crouch) range *= 0.7;
    const fog = this.level.scene.fog ? this.level.scene.fog.density : 0.02;
    range *= clamp(1.4 - fog * 12, 0.35, 1.3);
    if (d > range) return false;
    const ang = Math.abs(angleWrap(Math.atan2(dx, dz) - this.yaw));
    if (ang > this.fov && d > 3) return false;
    if (this.level.segmentBlocked(this.pos.x, this.pos.z, p.pos.x, p.pos.z, 1.5)) return false;
    return true;
  }
  // Flashlight beam pointed at this monster
  litByPlayer() {
    const f = this.player.flashlight;
    if (f.factor < 0.2) return false;
    this.headPos(_v);
    _v.y -= this.headHeight * 0.4;
    const to = _v.clone().sub(f.worldPos);
    const d = to.length();
    if (d > 30) return false;
    return to.normalize().dot(f.worldDir) > 0.93;
  }
  hear() {
    const masking = (this.level.weather.state.rain || 0) * 0.8 + (this.level.weather.state.wind || 0) * 0.2;
    return this.game.noise.heardBy(this.pos, this.hearing * this.diff, masking);
  }
  // Is the player looking at this monster (in view & unoccluded)?
  seenByPlayer(margin = 0.8) {
    const cam = this.game.camera;
    this.headPos(_v);
    _v.y -= this.headHeight * 0.3;
    if (!inView(cam, _v, margin)) return false;
    const d = cam.position.distanceTo(_v);
    const fog = this.level.scene.fog ? this.level.scene.fog.density : 0.02;
    if (d > 2.5 / Math.max(0.004, fog)) return false;
    return !this.level.segmentBlocked(cam.position.x, cam.position.z, this.pos.x, this.pos.z, 1.6);
  }
  distToPlayer() { return Math.hypot(this.player.pos.x - this.pos.x, this.player.pos.z - this.pos.z); }

  faceToward(x, z, dt, rate = 4) {
    const target = Math.atan2(x - this.pos.x, z - this.pos.z);
    this.yaw += angleWrap(target - this.yaw) * Math.min(1, dt * rate);
  }
  moveToward(x, z, speed, dt, { water = false } = {}) {
    const dx = x - this.pos.x, dz = z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) { this.speedNow = damp(this.speedNow, 0, 6, dt); return d; }
    this.faceToward(x, z, dt, 5);
    const step = Math.min(d, speed * dt);
    const prevX = this.pos.x, prevZ = this.pos.z;
    this.pos.x += Math.sin(this.yaw) * step;
    this.pos.z += Math.cos(this.yaw) * step;
    this.level.resolve(this.pos, this.radius, this.pos.y, 2);
    // stuck? sidestep
    const moved = Math.hypot(this.pos.x - prevX, this.pos.z - prevZ);
    if (moved < step * 0.3) {
      this.stuckT = (this.stuckT || 0) + dt;
      if (this.stuckT > 0.4) { this.yaw += (Math.random() < 0.5 ? 1 : -1) * 1.2; this.stuckT = 0; }
    } else this.stuckT = 0;
    if (!water) this.pos.y = this.level.groundAt(this.pos.x, this.pos.z, this.pos.y + 1).y;
    this.speedNow = damp(this.speedNow, moved / Math.max(dt, 1e-4), 8, dt);
    return d;
  }
  randomPointNear(x, z, r, accept) {
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * Math.PI * 2, rr = rand(r * 0.3, r);
      const px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
      if (!accept || accept(px, pz)) return new THREE.Vector3(px, 0, pz);
    }
    return new THREE.Vector3(x, 0, z);
  }

  // Generic contact attack
  tryAttack(dt, reach = 1.5, onHit) {
    this.attackCd -= dt;
    if (this.attackCd > 0 || this.player.dead) return false;
    if (this.distToPlayer() < reach && !this.player.hidden) {
      this.attackCd = 2.2;
      if (onHit) onHit(); else this.player.damage(this.damage * (0.8 + this.diff * 0.2), this.name, this);
      return true;
    }
    return false;
  }

  threatTo() {
    const d = this.distToPlayer();
    if (!this.mesh.visible) return 0;
    const base = { dormant: 0, evidence: 0.1, glimpse: 0.2, sighting: 0.3, stalk: 0.5, watch: 0.4, investigate: 0.45, search: 0.5, chase: 1, hunt: 0.7, attack: 1 }[this.state] ?? 0.2;
    return clamp(base * (1 - d / 80) * 1.3, 0, 1);
  }

  // Called when the player hides; if we saw it happen, we know where they are.
  onPlayerHide(spot) {
    if (this.game.time.now - this.lastSeenT < 2.5 && this.distToPlayer() < 30) { this.sawHide = false; this.searchSpot = spot; this.lastKnown = spot.pos.clone(); }
  }
  // Searching a hiding spot: returns true if the player gets dragged out.
  searchHideSpot(spot) {
    const p = this.player;
    if (p.hidden !== spot) return false;
    const chance = (p.holdingBreath ? 0.2 : 0.65) * (spot.searchable ? 1 : 0.2) * (0.7 + this.diff * 0.3);
    return Math.random() < chance;
  }

  onLucid() { this.enraged = true; }
  update(dt) { this.t += dt; this.stateT += dt; }
  dispose() { this.level.scene.remove(this.mesh); }
  footstep(v = 0.5) { audio.monsterStep(this.pos, v); }
}
