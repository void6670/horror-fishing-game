import * as THREE from 'three';
import { Monster, makeHumanoid } from './Monster.js';
import { audio } from '../engine/Audio.js';
import { rand, chance, clamp, damp } from '../util/math.js';

// ---------------------------------------------------------------- The Dockhands (harbor pack)
// Eyeless, hunched things that hunt by sound alone. Flashlights mean nothing to them.
// They pause to listen, clicking. Crouch-walk. Throw bottles. Do not run.
export class Dockhand extends Monster {
  constructor(game, { patrol = [], emergeHour = 1, waterSpawn }) {
    super(game, { name: 'Dockhand', hearing: 1.25, walkSpeed: 1.2, runSpeed: 4.6, damage: 30, headHeight: 1.0, radius: 0.4 });
    this.body = makeHumanoid({ height: 1.9, thin: 0.55, color: 0x2c2620, skin: 0x8a8070, coat: false, eyes: 0, armLen: 1.5, hunch: 1.0 });
    this.body.head.scale.set(0.8, 1.5, 0.8);
    // mouth slit
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.02), new THREE.MeshBasicMaterial({ color: 0x220000 }));
    mouth.position.set(0, 0.06, 0.1); this.body.neck.add(mouth);
    this.mesh.add(this.body.root);
    this.patrol = patrol;
    this.emergeHour = emergeHour;
    this.waterSpawn = waterSpawn;
    this.mesh.visible = false;
    this.pi = Math.floor(Math.random() * Math.max(1, patrol.length));
    this.clickT = rand(2, 6);
  }
  update(dt) {
    super.update(dt);
    if (this.game.state !== 'night') return;
    const p = this.player;
    if (!this.mesh.visible) {
      if (this.hour < this.emergeHour && !this.enraged) return;
      const s = this.waterSpawn || this.patrol[this.pi] || { x: 0, z: 0 };
      this.pos.set(s.x, this.level.groundAt(s.x, s.z).y, s.z);
      this.mesh.visible = true; this.setState('patrol');
      audio.splash(this.pos, 0.8);
      this.game.events.emit('dockhand-emerge');
    }
    this.clickT -= dt;
    if (this.clickT <= 0) { this.clickT = rand(3, 7); audio.clicks(this.headPos(new THREE.Vector3()), this.state === 'chase' ? 10 : 5); }
    const heard = this.hear();
    const d = this.distToPlayer();
    // touch: bumping into you counts as hearing you
    const touching = d < 1.6 && !p.hidden;
    switch (this.state) {
      case 'patrol': {
        if (touching || (heard && heard.strength > 0.15)) { this.target = touching ? p.pos.clone() : heard.event.pos.clone(); this.setState(touching || heard.strength > 0.55 ? 'chase' : 'investigate'); audio.shriek(this.pos, 0.3); break; }
        const wp = this.patrol[this.pi] || this.pos;
        if (this.moveToward(wp.x, wp.z, this.walkSpeed * this.diff, dt) < 1.2) { this.pi = (this.pi + 1) % Math.max(1, this.patrol.length); this.setState('listen'); }
        break;
      }
      case 'listen': {
        this.speedNow = damp(this.speedNow, 0, 6, dt);
        if (heard) { this.target = heard.event.pos.clone(); this.setState(heard.strength > 0.5 ? 'chase' : 'investigate'); break; }
        if (this.stateT > rand(2, 4)) this.setState('patrol');
        break;
      }
      case 'investigate': {
        if (heard) this.target = heard.event.pos.clone();
        if (touching) { this.setState('chase'); break; }
        if (this.moveToward(this.target.x, this.target.z, this.walkSpeed * 2 * this.diff, dt) < 1.2) {
          // sniff the hiding spot if the player is right there
          if (p.hidden && p.hidden.pos.distanceTo(this.pos) < 3 && !p.holdingBreath && chance(0.5)) { p.forceOut(this.name); this.setState('chase'); break; }
          this.setState('listen');
        }
        break;
      }
      case 'chase': {
        if (heard) this.target = heard.event.pos.clone();
        if (touching) this.target = p.pos.clone();
        const dd = this.moveToward(this.target.x, this.target.z, this.runSpeed * (0.8 + this.diff * 0.2), dt);
        this.tryAttack(dt, 1.4, () => { audio.shriek(this.pos, 0.5); p.damage(this.damage * this.diff, this.name, 'dockhand'); });
        if (dd < 1 && !touching) this.setState('listen');
        if (this.stateT > 12) this.setState('listen');
        break;
      }
      default: this.setState('patrol');
    }
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    this.body.animate(dt, this.speedNow * 1.3, this.state === 'chase' ? 'reach' : 'walk');
    this.body.torso.rotation.x = 1.0 + Math.sin(this.t * 3) * 0.05;
    if (this.speedNow > 0.3) { this.stepT = (this.stepT || 0) - dt * this.speedNow; if (this.stepT <= 0) { this.stepT = 0.8; audio.footstep(this.level.surfaceFn ? this.level.surfaceFn(this.pos.x, this.pos.z) : 'wood', 0.35, this.pos); } }
  }
  threatTo() {
    if (!this.mesh.visible) return 0;
    const d = this.distToPlayer();
    return clamp((this.state === 'chase' ? 1 : 0.55) * (1 - d / 35), 0, 1);
  }
}

// ---------------------------------------------------------------- The Mire (swamp)
// Lives under the water and is almost never seen: a wake, bubbles, two eyes. It follows SMELL
// (fish and chum you carry, your blood) and SPLASHES. It cannot leave the water.
export class Mire extends Monster {
  constructor(game, { isWater, start }) {
    super(game, { name: 'The Mire', hearing: 1.1 });
    this.isWater = isWater;
    this.pos.set(start.x, 0, start.z);
    this.mesh.visible = true;
    const dark = new THREE.MeshStandardMaterial({ color: 0x0c0e08, roughness: 0.4 });
    this.hump = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), dark);
    this.hump.scale.set(0.9, 0.35, 1.8);
    this.mesh.add(this.hump);
    this.eyes = [];
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0xc8c070 })); e.position.set(s * 0.22, 0.2, 1.3); this.mesh.add(e); this.eyes.push(e); }
    this.wake = new THREE.Mesh(new THREE.RingGeometry(0.6, 1.4, 20, 1, Math.PI * 0.15, Math.PI * 0.7), new THREE.MeshBasicMaterial({ color: 0x9aa890, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }));
    this.wake.rotation.x = -Math.PI / 2;
    this.level.scene.add(this.wake);
    this.surface = 0;
    this.smellT = 0;
    this.bubbleT = 2;
    this.busy = 0;
    this.bait = null;
  }
  // smell intensity of the player 0..1
  playerScent() {
    const inv = this.game.inventory;
    let s = 0;
    for (const sl of inv.slots) { if (sl.id.startsWith('catch:')) s += 0.18; if (sl.id === 'chum') s += 0.08 * sl.qty; }
    if (this.player.health < 70) s += (70 - this.player.health) / 100;
    return clamp(s, 0, 1);
  }
  throwBait(pos) { this.bait = pos.clone(); this.busy = 0; audio.splash(pos, 0.5); }
  update(dt) {
    super.update(dt);
    if (this.game.state !== 'night') return;
    const p = this.player;
    const h = this.hour;
    const active = h >= 0.5 || this.enraged;
    this.busy -= dt;
    let target = null, speed = 1.2;
    const scent = this.playerScent();
    const heard = this.hear();
    if (this.bait) { target = this.bait; speed = 3; if (Math.hypot(this.bait.x - this.pos.x, this.bait.z - this.pos.z) < 1) { audio.splash(this.pos, 1); this.bait = null; this.busy = 20; } }
    else if (active && this.busy <= 0) {
      if (heard && heard.event.type !== 'reel') { this.target = heard.event.pos.clone(); this.alert = Math.min(1, this.alert + heard.strength * 0.6); }
      if (scent > 0.05 && this.distToPlayer() < 15 + scent * 50) { this.alert = Math.min(1, this.alert + scent * dt * 0.4); this.target = p.pos.clone(); }
      target = this.target;
      speed = 1.5 + this.alert * 3.2 * this.diff;
    }
    this.alert = Math.max(0, this.alert - dt * 0.02);
    if (!target) { if (!this.wander || Math.hypot(this.wander.x - this.pos.x, this.wander.z - this.pos.z) < 2) this.wander = this.randomPointNear(this.pos.x, this.pos.z, 25, (x, z) => this.isWater(x, z)); target = this.wander; }
    // move only through water
    const dx = target.x - this.pos.x, dz = target.z - this.pos.z, d = Math.hypot(dx, dz);
    if (d > 0.5) {
      this.yaw += ((Math.atan2(dx, dz) - this.yaw + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 2);
      const nx = this.pos.x + Math.sin(this.yaw) * speed * dt, nz = this.pos.z + Math.cos(this.yaw) * speed * dt;
      if (this.isWater(nx, nz)) { this.pos.x = nx; this.pos.z = nz; this.speedNow = speed; } else { this.yaw += 0.6; this.speedNow = 0; if (target === this.target) this.target = null; }
    } else { this.speedNow = 0; if (target === this.target) this.target = null; }
    const wl = this.level.waterLevel;
    const pd = this.distToPlayer();
    // surfacing: only when close and agitated
    const wantSurface = this.alert > 0.6 && pd < 18 ? 1 : 0;
    this.surface = damp(this.surface, wantSurface, 1, dt);
    this.pos.y = wl - 0.55 + this.surface * 0.45;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    this.eyes.forEach((e) => { e.visible = this.surface > 0.6; });
    this.wake.position.set(this.pos.x, wl + 0.02, this.pos.z);
    this.wake.rotation.z = -this.yaw - Math.PI / 2;
    this.wake.material.opacity = clamp(this.speedNow / 4, 0, 0.35);
    this.bubbleT -= dt;
    if (this.bubbleT <= 0) { this.bubbleT = rand(1, 4) / (0.5 + this.alert); audio.bubble(new THREE.Vector3(this.pos.x, wl, this.pos.z)); }
    if (this.speedNow > 1 && chance(dt * 1.5)) audio.wadeStep(new THREE.Vector3(this.pos.x, wl, this.pos.z), 0.3);
    // attacks
    this.attackCd -= dt;
    if (this.attackCd <= 0 && !p.hidden && pd < 2.4 && this.alert > 0.3) {
      if (p.wading > 0.1) {
        this.attackCd = 4;
        if (p.health < 55 || this.enraged) this.game.deathSequence({ type: 'drag', monster: this, text: 'It pulled you under the warm water.' });
        else { p.damage(45 * this.diff, this.name, 'mire'); audio.growl(this.pos, 0.7, 1.5, 0.8); }
      } else if (this.alert > 0.75 && pd < 2.0) {
        this.attackCd = 6;
        audio.splash(this.pos, 1.5); audio.growl(this.pos, 0.8, 1, 0.7);
        p.damage(25 * this.diff, this.name, 'mire');
        this.game.ui.subtitle('It lunged out of the water at the edge of the boards.', 3);
      }
    }
  }
  threatTo() { const d = this.distToPlayer(); return clamp((0.2 + this.alert * 0.8) * (1 - d / 30), 0, 1); }
  dispose() { super.dispose(); this.level.scene.remove(this.wake); }
}

// ---------------------------------------------------------------- The Angler (the deep)
// A warm, swaying light in the black — like every safe lantern you have stood under.
// It drifts toward flashlights. Walk up to the light and it closes its mouth.
export class Angler extends Monster {
  constructor(game, { start }) {
    super(game, { name: 'The Angler', hearing: 0.8 });
    this.pos.set(start.x, start.y ?? 0, start.z);
    this.lure = new THREE.PointLight(0xffb060, 6, 22, 1.5);
    this.bulb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffd090 }));
    this.mesh.add(this.lure); this.mesh.add(this.bulb);
    // enormous jaw, mostly invisible in darkness
    const dark = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.5 });
    this.jaw = new THREE.Group();
    const head = new THREE.Mesh(new THREE.SphereGeometry(4.5, 16, 12), dark);
    head.scale.set(1.2, 0.8, 1); this.jaw.add(head);
    const tooth = new THREE.MeshStandardMaterial({ color: 0xd8d0c0, roughness: 0.3 });
    for (let i = 0; i < 18; i++) { const t = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1.4, 5), tooth); const a = (i / 18) * Math.PI - Math.PI / 2; t.position.set(Math.sin(a) * 3.6, i % 2 ? 0.9 : -0.9, 3.6 + Math.cos(a) * 0.5); t.rotation.x = i % 2 ? Math.PI : 0; this.jaw.add(t); }
    this.jaw.position.set(0, -2.5, -5.5);
    this.mesh.add(this.jaw);
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, 6, 5), dark); stalk.position.set(0, -0.5, -2.6); stalk.rotation.x = 0.8; this.mesh.add(stalk);
    this.mesh.visible = true;
    this.snapT = 0;
    this.drift = new THREE.Vector3();
  }
  update(dt) {
    super.update(dt);
    if (this.game.state !== 'night') return;
    const p = this.player;
    const lit = p.flashlight.factor > 0.2;
    const pd = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    let tx, tz, speed;
    const heard = this.hear();
    if (lit && pd < 60) { tx = p.pos.x; tz = p.pos.z; speed = (0.6 + this.hour * 0.2) * this.diff; this.alert = Math.min(1, this.alert + dt * 0.2); }
    else if (heard) { tx = heard.event.pos.x; tz = heard.event.pos.z; speed = 1.1; }
    else {
      if (!this.wanderTo || Math.hypot(this.wanderTo.x - this.pos.x, this.wanderTo.z - this.pos.z) < 3) this.wanderTo = this.randomPointNear(p.pos.x, p.pos.z, 45);
      tx = this.wanderTo.x; tz = this.wanderTo.z; speed = 0.8;
      this.alert = Math.max(0, this.alert - dt * 0.05);
    }
    // the light keeps a little distance: it wants you to come to it
    if (pd < 9 && !lit) speed = 0.15;
    const dx = tx - this.pos.x, dz = tz - this.pos.z, d = Math.hypot(dx, dz);
    if (d > 1) { this.yaw = Math.atan2(dx, dz); this.pos.x += (dx / d) * speed * dt; this.pos.z += (dz / d) * speed * dt; }
    const ground = this.level.heightAt(this.pos.x, this.pos.z);
    this.pos.y = ground + 3.2 + Math.sin(this.t * 0.8) * 0.4;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    this.lure.intensity = 5 + Math.sin(this.t * 2.3) * 1.5;
    // strike
    if (this.snapT > 0) {
      this.snapT -= dt;
      this.jaw.position.z = -5.5 + Math.sin((1 - this.snapT) * Math.PI) * 5;
    }
    // telegraph: the light flares and the water hums before the jaws close
    if (pd < 7 && !p.hidden && this.snapT <= 0 && !this.windup) { this.windup = 1.1; audio.growl(this.pos, 0.4, 1.2, 0.6); this.player.addFear(0.4); }
    if (this.windup) { this.windup -= dt; this.lure.intensity = 14; if (this.windup > 0) return; this.windup = 0; }
    if (pd < 4.5 && !p.hidden && this.snapT <= 0) {
      this.snapT = 1;
      audio.growl(this.pos, 0.5, 1, 1); audio.hit();
      if (p.health <= 50 || this.enraged) this.game.deathSequence({ type: 'swallow', monster: this, text: 'The light was a mouth.' });
      else { p.damage(50, this.name, 'angler'); const back = new THREE.Vector3(p.pos.x - this.pos.x, 0, p.pos.z - this.pos.z).normalize(); p.pos.addScaledVector(back, 5); this.pos.addScaledVector(back, -8); }
    }
  }
  threatTo() { const d = this.distToPlayer(); return clamp((0.3 + this.alert * 0.6) * (1 - d / 40), 0, 1); }
}
