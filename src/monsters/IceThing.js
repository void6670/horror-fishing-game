import * as THREE from 'three';
import { Monster } from './Monster.js';
import { audio } from '../engine/Audio.js';
import { rand, chance, clamp, damp } from '../util/math.js';

// The Thing Beneath the Ice. Blind. It follows vibration: footsteps, running, drilling, reeling.
// Its shadow drifts under the translucent ice. When it finds you, the ice cracks around your feet
// — you have a moment to move. Every hole it bursts becomes a new place to fish.
export class IceThing extends Monster {
  constructor(game, opts) {
    super(game, { name: 'The Thing Beneath the Ice', hearing: 1.3 });
    this.isOnIce = opts.isOnIce; // (x,z) => bool
    this.onBurst = opts.onBurst; // (pos) => void (create hole)
    this.iceY = opts.iceY ?? 0;
    this.pos.set(opts.start?.x ?? 60, this.iceY - 2.6, opts.start?.z ?? 0);
    // body: a long pale-dark mass with trailing limbs
    const mat = new THREE.MeshStandardMaterial({ color: 0x050708, roughness: 1, transparent: true, opacity: 0.85 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), mat);
    body.scale.set(2.2, 0.7, 6.5);
    this.mesh.add(body);
    this.limbs = [];
    for (let i = 0; i < 8; i++) {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.25, 7, 5), mat);
      l.rotation.x = Math.PI / 2; l.position.set((i % 2 ? 1 : -1) * 1.6, 0, -2 - (i >> 1) * 1.5);
      this.mesh.add(l); this.limbs.push(l);
    }
    // the arm that breaks through
    this.arm = new THREE.Group();
    const armMat = new THREE.MeshStandardMaterial({ color: 0x9aa4a8, roughness: 0.4 });
    for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.12 - i * 0.02, 0.16 - i * 0.02, 1.1, 6), armMat); s.position.y = i * 1.0; s.rotation.z = i * 0.15; this.arm.add(s); }
    for (let i = 0; i < 5; i++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.6, 4), armMat); f.position.set((i - 2) * 0.07, 4.2, 0); f.rotation.z = (i - 2) * 0.25; this.arm.add(f); }
    this.arm.visible = false;
    this.level.scene.add(this.arm);
    // crack decal
    this.crack = new THREE.Mesh(new THREE.CircleGeometry(3, 24), new THREE.MeshBasicMaterial({ map: crackTexture(), transparent: true, depthWrite: false, opacity: 0 }));
    this.crack.rotation.x = -Math.PI / 2;
    this.level.scene.add(this.crack);
    this.target = null;
    this.burstT = 0;
    this.restT = 0;
    this.knockT = rand(20, 40);
    this.mesh.visible = true;
  }

  update(dt) {
    super.update(dt);
    if (this.game.state !== 'night') return;
    const p = this.player;
    const h = this.hour;
    this.restT -= dt;
    this.knockT -= dt;
    const active = h >= 1 || this.enraged;
    const hunting = h >= 3 || this.enraged;
    // perception: vibrations on the ice
    if (active && this.restT <= 0) {
      const heard = this.hear();
      if (heard && this.isOnIce(heard.event.pos.x, heard.event.pos.z)) { this.target = heard.event.pos.clone(); this.alert = Math.min(1, this.alert + heard.strength * 0.5); }
    }
    this.alert = Math.max(0, this.alert - dt * 0.03);
    // movement under ice
    let speed = 2 + this.alert * 3 * this.diff;
    if (this.state === 'cracking') speed = 0;
    if (!this.target || this.restT > 0) {
      if (!this.wander || Math.hypot(this.wander.x - this.pos.x, this.wander.z - this.pos.z) < 3) this.wander = this.randomPointNear(0, 0, 90, (x, z) => this.isOnIce(x, z));
      this.moveUnder(this.wander, 1.5, dt);
    } else if (this.state !== 'cracking') {
      const d = this.moveUnder(this.target, speed, dt);
      if (d < 2.5) {
        const pd = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
        if (hunting && pd < 4 && this.isOnIce(p.pos.x, p.pos.z) && !p.hidden?.safeFromIce) this.startCrack(p.pos.clone());
        else if (h >= 2 && pd < 5 && this.knockT <= 0) { this.knockT = rand(15, 30); audio.knock(new THREE.Vector3(this.pos.x, this.iceY, this.pos.z), 3, 0.8); p.addFear(0.25); this.game.ui.subtitle('Something knocks on the ice beneath your feet.', 3); this.target = null; }
        else this.target = null;
      }
    }
    // ambient presence
    if (active && chance(dt * 0.04)) audio.iceCrack(new THREE.Vector3(this.pos.x, this.iceY, this.pos.z), 0.4);
    if (this.state === 'cracking') this.updateCrack(dt);
    this.mesh.position.set(this.pos.x, this.iceY - 2.6 + Math.sin(this.t) * 0.2, this.pos.z);
    this.mesh.rotation.y = this.yaw;
    this.limbs.forEach((l, i) => { l.rotation.z = Math.sin(this.t * 2 + i) * 0.3; });
    if (this.arm.visible) {
      this.armT += dt;
      this.arm.position.y = this.iceY - 4 + Math.min(1, this.armT * 2) * 3 - Math.max(0, this.armT - 2) * 3;
      if (this.armT > 3) this.arm.visible = false;
    }
  }

  moveUnder(t, speed, dt) {
    const dx = t.x - this.pos.x, dz = t.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.1) {
      this.yaw += ((Math.atan2(dx, dz) - this.yaw + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 1.5);
      const nx = this.pos.x + Math.sin(this.yaw) * speed * dt, nz = this.pos.z + Math.cos(this.yaw) * speed * dt;
      if (this.isOnIce(nx, nz)) { this.pos.x = nx; this.pos.z = nz; } else this.yaw += 0.5;
    }
    return d;
  }

  startCrack(at) {
    this.setState('cracking');
    this.crackAt = at;
    this.crackT = 0;
    this.crack.position.set(at.x, this.iceY + 0.02, at.z);
    this.crack.material.opacity = 0;
    audio.iceCrack(at, 1);
    this.player.addFear(0.4);
    this.game.ui.subtitle('The ice is cracking — MOVE.', 2);
  }

  updateCrack(dt) {
    this.crackT += dt;
    this.crack.material.opacity = Math.min(1, this.crackT / 1.6);
    this.crack.scale.setScalar(0.4 + this.crackT * 0.5);
    if (Math.random() < dt * 8) audio.iceCrack(this.crackAt, 0.5);
    this.player.camShake = 0.3;
    const window = 2.1 / Math.sqrt(this.diff);
    if (this.crackT > window) {
      const p = this.player;
      const d = Math.hypot(p.pos.x - this.crackAt.x, p.pos.z - this.crackAt.z);
      audio.splash(this.crackAt, 2);
      audio.growl(this.crackAt, 0.6, 1.5, 0.9);
      this.arm.position.set(this.crackAt.x, this.iceY - 4, this.crackAt.z);
      this.arm.visible = true; this.armT = 0;
      if (this.onBurst) this.onBurst(this.crackAt.clone());
      if (d < 2.4 && !p.hidden) {
        if (p.health > 60 && !this.enraged) { p.damage(45, this.name, 'ice'); const dir = new THREE.Vector3(p.pos.x - this.crackAt.x, 0, p.pos.z - this.crackAt.z).normalize(); p.pos.addScaledVector(dir, 3); }
        else this.game.deathSequence({ type: 'under', monster: this, text: 'The ice opened. It took you under.' });
      }
      this.crack.material.opacity = 0;
      this.setState('rest');
      this.target = null;
      this.alert = 0;
      this.restT = rand(25, 45) / this.diff;
    }
  }

  threatTo() {
    const d = Math.hypot(this.player.pos.x - this.pos.x, this.player.pos.z - this.pos.z);
    if (this.state === 'cracking') return 1;
    return clamp((this.alert * 0.7 + 0.2) * (1 - d / 40), 0, 1) * (this.hour >= 1 ? 1 : 0.2);
  }
  dispose() { super.dispose(); this.level.scene.remove(this.arm); this.level.scene.remove(this.crack); }
}

function crackTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(230,245,255,0.95)'; g.lineWidth = 2;
  for (let i = 0; i < 14; i++) {
    let x = 128, y = 128; const a0 = (i / 14) * Math.PI * 2;
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 8; s++) { const a = a0 + (Math.random() - 0.5) * 0.8; x += Math.cos(a) * 16; y += Math.sin(a) * 16; g.lineTo(x, y); }
    g.stroke();
  }
  g.strokeStyle = 'rgba(230,245,255,0.6)'; g.lineWidth = 1;
  for (let r = 30; r < 120; r += 25) { g.beginPath(); for (let a = 0; a <= 6.3; a += 0.3) { const rr = r + (Math.random() - 0.5) * 8; g.lineTo(128 + Math.cos(a) * rr, 128 + Math.sin(a) * rr); } g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  return t;
}
export { damp };
