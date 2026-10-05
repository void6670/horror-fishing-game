import * as THREE from 'three';
import { Monster, makeHumanoid } from './Monster.js';
import { audio } from '../engine/Audio.js';
import { rand, chance, clamp, viewAngle } from '../util/math.js';

// The Drowned Fisherman. Revealed in stages: evidence (footsteps) → glimpse → distant sighting →
// approaches only while unobserved → active hunt. Detects by sight (boosted by flashlights) and sound,
// remembers where you were, searches hiding spots it saw you enter. Sometimes just watches, then leaves.
export class Fisherman extends Monster {
  constructor(game, opts = {}) {
    super(game, { name: 'The Drowned Fisherman', sightRange: 34, walkSpeed: 1.5, runSpeed: 3.9, damage: 55, headHeight: 2.35, hearing: 1.1 });
    this.body = makeHumanoid({ height: 2.55, thin: 0.75, color: 0x1f241e, skin: 0x6c7a70, hat: !opts.noHat, coat: true, eyes: 1, armLen: 1.35, hunch: 0.12 });
    this.mesh.add(this.body.root);
    this.mesh.visible = false;
    this.waypoints = opts.waypoints || [];
    this.sightingSpots = opts.sightingSpots || [];
    this.glimpseSpots = opts.glimpseSpots || null;
    this.lakeCenter = opts.lakeCenter || new THREE.Vector3();
    this.schedule = opts.schedule || { evidence: 1, glimpse: 2, sighting: 3, stalk: 4, hunt: 5 };
    this.onHatDrop = opts.onHatDrop;
    this.hatDropped = false;
    this.cool = 0;
    this.drip = 0;
  }

  phaseForHour() {
    const h = this.hour, s = this.schedule;
    if (this.enraged || h >= s.hunt) return 'hunt';
    if (h >= s.stalk) return 'stalk';
    if (h >= s.sighting) return 'sighting';
    if (h >= s.glimpse) return 'glimpse';
    if (h >= s.evidence) return 'evidence';
    return 'dormant';
  }

  show(v) { this.mesh.visible = v; }
  place(x, z, faceP = true) {
    this.pos.set(x, this.level.groundAt(x, z, 50).y, z);
    if (faceP) this.yaw = Math.atan2(this.player.pos.x - x, this.player.pos.z - z);
  }

  update(dt) {
    super.update(dt);
    if (this.game.state !== 'night') return;
    const phase = this.phaseForHour();
    this.cool -= dt;
    const p = this.player;
    switch (phase) {
      case 'dormant': this.show(false); break;
      case 'evidence': this.updateEvidence(dt); break;
      case 'glimpse': this.updateGlimpse(dt); break;
      case 'sighting': this.updateSighting(dt); break;
      case 'stalk': this.updateStalk(dt); break;
      case 'hunt': this.updateHunt(dt); break;
      default: break;
    }
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    const moving = this.speedNow > 0.2;
    this.body.animate(dt, this.speedNow, this.state === 'chase' ? 'reach' : moving ? 'walk' : 'limp');
    // wet footsteps
    if (this.mesh.visible && moving) {
      this.stepT = (this.stepT || 0) - dt * (0.6 + this.speedNow * 0.4);
      if (this.stepT <= 0) { this.stepT = 1; const wet = this.level.waterDepthAt(this.pos.x, this.pos.z) > 0; wet ? audio.wadeStep(this.pos, 0.5) : this.footstep(0.45); }
    }
    void p;
  }

  // 1 AM: footsteps & snapping branches in the trees around you. Never visible.
  updateEvidence(dt) {
    this.show(false);
    if (this.cool <= 0) {
      this.cool = rand(18, 35);
      const p = this.player.pos;
      const a = this.player.yaw + Math.PI + rand(-0.8, 0.8); // behind
      const pos = new THREE.Vector3(p.x - Math.sin(a) * 14, p.y + 1, p.z - Math.cos(a) * 14);
      if (chance(0.5)) audio.branchSnap(pos);
      let n = 0;
      const steps = setInterval(() => { audio.footstep('grass', 0.5, pos); pos.x += rand(-0.6, 0.6); pos.z += rand(-0.6, 0.6); if (++n > 5) clearInterval(steps); }, 650);
      this.player.addFear(0.08);
      this.game.events.emit('evidence');
    }
    void dt;
  }

  // 2 AM: a silhouette between the trees at the edge of vision. Gone when you look straight at it.
  updateGlimpse(dt) {
    this.setState('glimpse');
    if (!this.mesh.visible) {
      if (this.cool > 0) return;
      const p = this.player;
      const side = chance(0.5) ? 1 : -1;
      const a = p.yaw + side * rand(0.55, 0.75);
      const d = rand(18, 32);
      const x = p.pos.x - Math.sin(a) * d, z = p.pos.z - Math.cos(a) * d;
      if (this.level.waterDepthAt(x, z) > 0.3) { this.cool = 2; return; }
      this.place(x, z);
      this.show(true);
      this.visibleT = 0;
      this.lookedT = 0;
    } else {
      this.visibleT += dt;
      this.faceToward(this.player.pos.x, this.player.pos.z, dt, 2);
      const ang = viewAngle(this.game.camera, this.headPos(new THREE.Vector3()));
      if (ang < 0.22) this.lookedT += dt;
      if (this.lookedT > 0.35 || this.visibleT > 9 || this.distToPlayer() < 10) {
        this.show(false);
        this.cool = rand(25, 50);
        if (this.lookedT > 0.35) { this.player.addFear(0.2); audio.sting(0.2); this.game.events.emit('glimpsed'); }
      }
    }
  }

  // 3 AM: standing knee-deep across the lake, watching. If approached, sinks into the water.
  updateSighting(dt) {
    this.setState('sighting');
    if (!this.mesh.visible) {
      if (this.cool > 0) return;
      const spots = this.sightingSpots;
      if (!spots.length) return;
      let best = spots[0], bd = 0;
      for (const s of spots) { const d = Math.hypot(s.x - this.player.pos.x, s.z - this.player.pos.z); if (d > bd && d < 140) { bd = d; best = s; } }
      this.place(best.x, best.z);
      this.show(true);
      this.visibleT = 0;
      this.sinking = 0;
      this.game.events.emit('sighting', this.pos.clone());
    } else {
      this.visibleT += dt;
      this.faceToward(this.player.pos.x, this.player.pos.z, dt, 1);
      if (this.sinking > 0) {
        this.sinking += dt;
        this.pos.y -= dt * 0.8;
        if (this.sinking > 3.5) {
          this.show(false); this.cool = rand(30, 50);
          if (!this.hatDropped && this.onHatDrop) { this.hatDropped = true; this.onHatDrop(new THREE.Vector3(this.pos.x, 0, this.pos.z)); }
        }
      } else if (this.distToPlayer() < 30 || this.visibleT > 45) {
        this.sinking = 0.01; audio.splash(this.pos, 1.2);
      }
    }
  }

  // 4 AM: closer every time you look away. Shining a light on it does not stop it — looking does.
  updateStalk(dt) {
    this.setState('stalk');
    const p = this.player;
    if (!this.mesh.visible) {
      if (this.cool > 0) return;
      const a = p.yaw + Math.PI + rand(-1, 1);
      const x = p.pos.x - Math.sin(a) * 40, z = p.pos.z - Math.cos(a) * 40;
      this.place(x, z);
      this.show(true);
      this.blinkT = 0;
    }
    const seen = this.seenByPlayer(0.9);
    this.faceToward(p.pos.x, p.pos.z, dt, 3);
    if (!seen) {
      this.blinkT += dt;
      if (this.blinkT > 1.2) {
        // jump closer while unobserved
        this.blinkT = 0;
        const d = this.distToPlayer();
        const jump = Math.min(d - 2, rand(4, 7) * this.diff);
        const dir = new THREE.Vector3(p.pos.x - this.pos.x, 0, p.pos.z - this.pos.z).normalize();
        this.pos.addScaledVector(dir, jump);
        this.level.resolve(this.pos, this.radius, this.pos.y);
        this.pos.y = this.level.groundAt(this.pos.x, this.pos.z, this.pos.y + 2).y;
        if (d < 20) audio.wadeStep(this.pos, 0.4);
        if (p.hidden && this.distToPlayer() < 4) { this.searchSpotNow(p.hidden); }
      }
    } else this.blinkT = 0;
    if (this.distToPlayer() < 2.2 && !p.hidden) {
      this.lunge();
    }
    if (p.hidden && this.distToPlayer() > 25) { this.show(false); this.cool = rand(20, 40); }
  }

  lunge() {
    audio.growl(this.pos, 0.9, 1.2, 0.8);
    audio.scream(0.4);
    this.player.forcedLook = { target: this.headPos(new THREE.Vector3()), time: 0.6, speed: 12 };
    this.player.damage(this.damage * this.diff, this.name, 'fisherman');
    this.show(false);
    this.cool = rand(25, 45);
  }

  searchSpotNow(spot) {
    if (this.searchSpot === spot && this.searchedT > 0) return;
    this.searchSpot = spot; this.searchedT = 3;
    audio.knock(spot.pos, 2, 0.5);
    setTimeout(() => {
      if (this.player.hidden === spot && this.searchHideSpot(spot)) { this.player.forceOut(this.name); audio.growl(this.pos, 1, 1, 0.8); }
      else audio.creak(spot.pos, 0.4);
    }, 1800);
  }

  // 5 AM: actively hunting — patrol, investigate, chase, search, sometimes simply watch and leave.
  updateHunt(dt) {
    const p = this.player;
    if (!this.mesh.visible) {
      if (this.cool > 0) return;
      const wp = this.waypoints.length ? this.waypoints[Math.floor(Math.random() * this.waypoints.length)] : { x: p.pos.x + 40, z: p.pos.z };
      this.place(wp.x, wp.z);
      this.show(true);
      this.setState('patrol');
      this.target = null;
    }
    const sees = this.canSeePlayer();
    if (sees) { this.lastKnown = p.pos.clone(); this.lastSeenT = this.game.time.now; }
    const heard = this.hear();
    this.searchedT = Math.max(0, (this.searchedT || 0) - dt);
    switch (this.state) {
      case 'patrol': {
        if (sees) { this.setState(Math.random() < 0.25 && !this.enraged ? 'watch' : 'chase'); audio.growl(this.pos, 1, 1.4, 0.5); break; }
        if (heard) { this.target = heard.event.pos.clone(); this.setState('investigate'); break; }
        if (!this.target || this.moveToward(this.target.x, this.target.z, this.walkSpeed * this.diff, dt) < 1.5) {
          const wp = this.waypoints[Math.floor(Math.random() * this.waypoints.length)] || this.randomPointNear(this.pos.x, this.pos.z, 30);
          this.target = new THREE.Vector3(wp.x, 0, wp.z);
        }
        break;
      }
      case 'watch': { // stands and stares. Knows you're there. Then leaves.
        this.speedNow = 0;
        this.faceToward(p.pos.x, p.pos.z, dt, 2);
        if (this.stateT > 12 || this.distToPlayer() < 12) { if (this.distToPlayer() < 12) this.setState('chase'); else { this.setState('leave'); } }
        break;
      }
      case 'leave': {
        const c = this.lakeCenter;
        this.moveToward(c.x, c.z, this.walkSpeed, dt);
        if (this.level.waterDepthAt(this.pos.x, this.pos.z) > 0.5) this.pos.y -= dt * 0.6;
        if (this.stateT > 12) { this.show(false); this.cool = rand(20, 40); }
        if (sees && this.distToPlayer() < 15) this.setState('chase');
        break;
      }
      case 'investigate': {
        if (sees) { this.setState('chase'); break; }
        if (heard && heard.strength > 0.3) this.target = heard.event.pos.clone();
        if (this.moveToward(this.target.x, this.target.z, this.walkSpeed * 1.4 * this.diff, dt) < 2) this.setState('search');
        break;
      }
      case 'chase': {
        if (sees) {
          this.moveToward(p.pos.x, p.pos.z, this.runSpeed * (0.85 + this.diff * 0.15), dt);
          if (Math.random() < dt * 0.3) audio.growl(this.pos, 1, 1, 0.5);
        } else if (this.lastKnown) {
          if (p.hidden && this.searchSpot === p.hidden && this.distToPlayer() < 3) { this.searchSpotNow(p.hidden); this.setState('search'); break; }
          if (this.moveToward(this.lastKnown.x, this.lastKnown.z, this.runSpeed * 0.8, dt) < 1.5) this.setState('search');
        } else this.setState('search');
        this.tryAttack(dt, 1.6, () => this.grab());
        break;
      }
      case 'search': {
        if (sees) { this.setState('chase'); break; }
        if (heard) { this.target = heard.event.pos.clone(); this.setState('investigate'); break; }
        if (!this.target || this.moveToward(this.target.x, this.target.z, this.walkSpeed, dt) < 1) {
          const c = this.lastKnown || this.pos;
          this.target = this.randomPointNear(c.x, c.z, 10);
          // check nearby hiding spots
          for (const h of this.level.hideSpots) if (h.pos.distanceTo(this.pos) < 4 && Math.random() < 0.5) this.searchSpotNow(h);
        }
        if (this.stateT > 22) { this.lastKnown = null; this.setState(Math.random() < 0.4 ? 'leave' : 'patrol'); }
        break;
      }
      default: this.setState('patrol');
    }
  }

  grab() {
    const p = this.player;
    audio.growl(this.pos, 0.8, 1.5, 0.9);
    if (p.health <= this.damage * this.diff * 0.9 || this.enraged && p.health < 70) {
      this.game.deathSequence({ type: 'drag', monster: this, text: 'It pulled you into the lake.' });
    } else {
      p.damage(this.damage * this.diff * 0.8, this.name, 'fisherman');
      // knock back
      const dir = new THREE.Vector3(p.pos.x - this.pos.x, 0, p.pos.z - this.pos.z).normalize();
      p.pos.addScaledVector(dir, 2.5);
      this.attackCd = 3;
    }
  }

  onPlayerHide(spot) { super.onPlayerHide(spot); }
  threatTo() {
    if (!this.mesh.visible) return this.state === 'evidence' ? 0.1 : 0;
    const d = this.distToPlayer();
    const s = this.state === 'chase' ? 1 : this.state === 'stalk' ? 0.8 : this.state === 'watch' ? 0.6 : 0.4;
    return clamp(s * (1.2 - d / 60), 0, 1);
  }
}
