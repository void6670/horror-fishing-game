import * as THREE from 'three';
import { audio } from '../engine/Audio.js';
import { makeHumanoid } from '../monsters/Monster.js';
import { makeAlarmClock, makeCatchModel } from '../fishing/CatchModels.js';
import { rowboat, mat } from '../world/Props.js';
import { rand, chance, pick, inView, viewAngle } from '../util/math.js';
import { WHISPERS, N } from '../story/Text.js';

// The director that bends reality. Events are rare, scheduled by hour, and never repeat too quickly.
export class DreamDirector {
  constructor(game, defs = []) {
    this.game = game;
    this.defs = defs.map((d) => ({ chance: 0.5, once: true, weight: 1, ...d, done: false }));
    this.cool = rand(35, 60);
    this.active = [];
  }
  get hour() { return this.game.time.hour; }
  update(dt) {
    for (const a of [...this.active]) { if (a.update(dt) === false) { a.cleanup && a.cleanup(); this.active.splice(this.active.indexOf(a), 1); } }
    this.cool -= dt;
    if (this.cool > 0) return;
    this.cool = rand(30, 55) / (this.game.lucid ? 1.6 : 1) / (1 + this.hour * 0.08);
    const h = this.hour;
    const elig = this.defs.filter((d) => !d.done && h >= d.hours[0] && h < d.hours[1] && (!d.cond || d.cond()));
    if (!elig.length) return;
    const d = pick(elig);
    if (!chance(d.chance)) return;
    if (d.once) d.done = true;
    this.trigger(d);
  }
  trigger(d) {
    const res = d.run(this.game, this);
    if (res && res.update) this.active.push(res);
    this.game.events.emit('dream-event', d.id);
  }
  // force a specific event by id
  fire(id) { const d = this.defs.find((x) => x.id === id); if (d) { d.done = d.once; this.trigger(d); } }
  dispose() { for (const a of this.active) a.cleanup && a.cleanup(); this.active = []; }
}

// ---------------------------------------------------------------- event library
const tmp = new THREE.Vector3();

export const DE = {
  // The moon jumps across the sky the moment you stop looking at it.
  moonJump: () => ({
    id: 'moonJump', hours: [1, 5], chance: 0.8,
    run: (game) => {
      const sky = game.level.sky; if (!sky) return null;
      let armed = false;
      return {
        t: 0,
        update(dt) {
          this.t += dt;
          const md = sky.moonDir.clone().multiplyScalar(500).add(game.camera.position);
          const looking = inView(game.camera, md, 0.7);
          if (looking) armed = true;
          if (armed && !looking) { sky.setMoonAngles(sky.azimuth + rand(1.4, 2.4), Math.max(0.15, sky.elevation + rand(-0.25, 0.3))); game.player.addFear(0.08); return false; }
          return this.t < 120;
        },
      };
    },
  }),
  // Turn back around and the moon is somewhere else — and red, for a while.
  redMoon: () => ({
    id: 'redMoon', hours: [3, 6], chance: 0.6,
    run: (game) => {
      const sky = game.level.sky; if (!sky) return null;
      const orig = sky.uniforms.uMoonColor.value.clone();
      sky.uniforms.uMoonColor.value.set(0xd03a28);
      game.post.u.uRed.value = 0.35;
      audio.sting(0.2);
      return { t: 0, update(dt) { this.t += dt; return this.t < 40; }, cleanup() { sky.uniforms.uMoonColor.value.copy(orig); game.post.u.uRed.value = 0; } };
    },
  }),
  eclipse: () => ({
    id: 'eclipse', hours: [3, 6], chance: 0.5,
    run: (game) => {
      const sky = game.level.sky; if (!sky) return null;
      return { t: 0, update(dt) { this.t += dt; sky.uniforms.uEclipse.value = Math.min(1, this.t / 8) * (this.t > 50 ? Math.max(0, 1 - (this.t - 50) / 8) : 1); return this.t < 58; }, cleanup() { sky.uniforms.uEclipse.value = 0; } };
    },
  }),
  // A distant light that goes out whenever you look away from it — and comes back somewhere else.
  vanishingLight: (positions) => ({
    id: 'vanishingLight', hours: [0.5, 4], chance: 0.9,
    run: (game) => {
      const level = game.level;
      const light = new THREE.PointLight(0xffb060, 4, 14, 1.6);
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), mat('lampGlow'));
      const g = new THREE.Group(); g.add(light); g.add(glow); level.scene.add(g);
      let i = 0; const place = () => { const p = positions[i % positions.length]; g.position.set(p.x, level.groundAt(p.x, p.z).y + 1.2, p.z); };
      place();
      let seen = false, awayT = 0, moves = 0;
      return {
        update(dt) {
          const looking = inView(game.camera, g.position, 0.85);
          if (looking) { seen = true; awayT = 0; g.visible = true; }
          else if (seen) { awayT += dt; if (awayT > 0.8) { i++; moves++; place(); seen = false; g.visible = moves % 2 === 0; } }
          if (game.player.pos.distanceTo(g.position) < 15) { g.visible = false; return false; }
          return moves < 6;
        },
        cleanup() { level.scene.remove(g); },
      };
    },
  }),
  // Your own silhouette, flashlight and all, standing somewhere else.
  doppelganger: (positions) => ({
    id: 'doppelganger', hours: [2, 6], chance: 0.8,
    run: (game) => {
      const level = game.level;
      const p = positions ? pick(positions) : null;
      const body = makeHumanoid({ height: 1.75, thin: 0.9, color: 0x2e3a2e, skin: 0x9c7a64, coat: true });
      const g = new THREE.Group(); g.add(body.root);
      const torch = new THREE.SpotLight(0xfff1d6, 30, 25, 0.4, 0.6, 1.5); torch.position.set(-0.3, 1.4, 0.3);
      const tg = new THREE.Object3D(); tg.position.set(0, 0, 10); g.add(tg); torch.target = tg; g.add(torch);
      let x, z;
      if (p) { x = p.x; z = p.z; } else { const a = game.player.yaw + rand(-0.4, 0.4); x = game.player.pos.x - Math.sin(a) * 45; z = game.player.pos.z - Math.cos(a) * 45; }
      g.position.set(x, level.groundAt(x, z).y, z);
      g.rotation.y = Math.atan2(game.player.pos.x - x, game.player.pos.z - z) + Math.PI; // facing away
      level.scene.add(g);
      let lookT = 0;
      return {
        t: 0,
        update(dt) {
          this.t += dt;
          body.animate(dt, 0, 'limp');
          if (inView(game.camera, g.position, 0.6)) lookT += dt;
          if (lookT > 1.2 && !this.turned) { this.turned = true; g.rotation.y += Math.PI; audio.whisper(g.position, null, 0.3); game.player.addFear(0.3); }
          if (lookT > 2.5 || game.player.pos.distanceTo(g.position) < 20 || this.t > 90) return false;
          return true;
        },
        cleanup() { level.scene.remove(g); },
      };
    },
  }),
  // Your name, whispered behind you.
  whisper: (count = 3) => ({
    id: 'whisper', hours: [2.5, 6], chance: 0.9, once: false,
    run: (game) => {
      const p = game.player;
      const a = p.yaw + Math.PI + rand(-0.5, 0.5);
      const pos = new THREE.Vector3(p.pos.x - Math.sin(a) * 1.4, p.pos.y + 1.6, p.pos.z - Math.cos(a) * 1.4);
      const line = pick(WHISPERS());
      audio.whisper(pos, line === N() || line.includes(N()) ? line : null, 0.45);
      game.ui.subtitle(`(a whisper, right behind you) "${line}"`, 3, 'whisper');
      p.addFear(0.2);
      void count;
      return null;
    },
  }),
  // Something that wasn't there before, placed right behind you.
  objectBehind: (kind = 'clock') => ({
    id: 'objectBehind_' + kind, hours: [2, 6], chance: 0.8,
    run: (game) => {
      const level = game.level, p = game.player;
      const obj = kind === 'clock' ? makeAlarmClock() : kind === 'chair' ? chairModel() : kind === 'door' ? doorModel() : makeCatchModel({ model: { type: 'item', item: kind } });
      const placeBehind = () => {
        const a = p.yaw + Math.PI;
        const x = p.pos.x - Math.sin(a) * 4, z = p.pos.z - Math.cos(a) * 4;
        obj.position.set(x, level.groundAt(x, z, p.pos.y + 1).y + (kind === 'clock' ? 0.2 : 0), z);
        obj.rotation.y = Math.atan2(p.pos.x - x, p.pos.z - z);
      };
      let state = 'waiting', t = 0;
      return {
        update(dt) {
          t += dt;
          if (state === 'waiting') {
            placeBehind();
            if (!inView(game.camera, obj.position, 1.1)) { level.scene.add(obj); state = 'placed'; if (kind === 'clock') audio.alarm(0.6, { pos: obj.position, vol: 0.15 }); else audio.creak(obj.position, 0.2); }
          } else if (state === 'placed') {
            if (inView(game.camera, obj.position, 0.6)) { state = 'seen'; t = 0; game.player.addFear(0.25); audio.sting(0.15); }
            if (t > 60) return false;
          } else if (state === 'seen') {
            if (!inView(game.camera, obj.position, 1.1) && t > 2) return false;
          }
          return true;
        },
        cleanup() { level.scene.remove(obj); },
      };
    },
  }),
  // A rowboat with a lantern, drifting. It is gone when you get close.
  phantomBoat: (center, radius = 40) => ({
    id: 'phantomBoat', hours: [1, 5], chance: 0.8,
    run: (game) => {
      const level = game.level;
      const a = rand(0, Math.PI * 2);
      const b = rowboat(level, { x: center.x + Math.cos(a) * radius * 0.5, z: center.z + Math.sin(a) * radius * 0.5, rot: rand(0, 6) });
      const l = new THREE.PointLight(0xffc070, 3, 12, 1.6); l.position.set(0, 1.2, 0.8); b.add(l);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), mat('lampGlow')); lamp.position.copy(l.position); b.add(lamp);
      const fig = makeHumanoid({ height: 1.0, thin: 0.7, color: 0xd8b020, skin: 0xd8b8a0, coat: true });
      fig.root.position.set(0, -0.2, -0.6); fig.root.scale.setScalar(0.9); b.add(fig.root);
      return {
        t: 0,
        update(dt) {
          this.t += dt;
          b.rotation.y += dt * 0.02;
          b.position.y = level.waterSurfaceAt(b.position.x, b.position.z) - 0.15 + Math.sin(this.t) * 0.03;
          if (game.player.pos.distanceTo(b.position) < 28 || this.t > 120) { audio.splash(b.position, 0.3); return false; }
          return true;
        },
        cleanup() { level.scene.remove(b); },
      };
    },
  }),
  // The water reflects someone who is not there.
  reflectionFigure: (getPos, opts = {}) => ({
    id: 'reflectionFigure', hours: opts.hours || [3, 6], chance: 0.9,
    run: (game) => {
      const level = game.level;
      const fig = makeHumanoid({ height: opts.child ? 1.2 : 1.8, thin: 0.75, color: opts.child ? 0xd8b020 : 0x101010, skin: 0xd8c0b0, coat: true });
      const g = fig.root;
      g.traverse((o) => o.layers.set(2));
      level.scene.add(g);
      return {
        t: 0,
        update(dt) {
          this.t += dt;
          const p = getPos(game);
          g.position.set(p.x, p.y, p.z);
          g.rotation.y = Math.atan2(game.player.pos.x - p.x, game.player.pos.z - p.z);
          if (this.t > 1 && !this.told) { this.told = true; game.ui.subtitle('Look at the water.', 2, 'whisper'); }
          return this.t < 50;
        },
        cleanup() { level.scene.remove(g); },
      };
    },
  }),
  // Footsteps behind you, in step with yours. They stop when you stop.
  echoSteps: () => ({
    id: 'echoSteps', hours: [1, 5], chance: 0.8,
    run: (game) => {
      const p = game.player;
      let last = p.stepPhase;
      return {
        t: 0,
        update(dt) {
          this.t += dt;
          if (p.stepPhase < last && p.moving > 0.1) {
            const a = p.yaw + Math.PI;
            tmp.set(p.pos.x - Math.sin(a) * 3, p.pos.y, p.pos.z - Math.cos(a) * 3);
            setTimeout(() => audio.footstep(p.surface, 0.3, tmp.clone()), 180);
          }
          last = p.stepPhase;
          return this.t < 25;
        },
      };
    },
  }),
  // Every sound in the world stops. Then comes back.
  silence: () => ({
    id: 'silence', hours: [2, 6], chance: 0.7,
    run: (game) => {
      const prev = {};
      for (const k of Object.keys(audio.loops)) prev[k] = audio.loopLevel(k);
      audio.silenceAll(0.05);
      return { t: 0, update(dt) { this.t += dt; return this.t < 9; }, cleanup() { audio.setAmbience(prev, 3); } };
    },
  }),
  // Snow, falling up.
  upwardSnow: () => ({
    id: 'upwardSnow', hours: [3, 6], chance: 0.8,
    run: (game) => { game.level.weather.set({ upward: 1 }); return { t: 0, update(dt) { this.t += dt; return this.t < 45; }, cleanup() { game.level.weather.set({ upward: 0 }); } }; },
  }),
  // Faces in the water, briefly, even when you are calm.
  facesInWater: () => ({
    id: 'faces', hours: [2, 6], chance: 0.7,
    run: (game) => ({ t: 0, update(dt) { this.t += dt; for (const w of game.level.waters) w.uniforms.uFaces.value = Math.max(w.uniforms.uFaces.value, Math.sin(Math.min(1, this.t / 20) * Math.PI)); return this.t < 20; } }),
  }),
  // Your name, called from far away across the water.
  nameCall: () => ({
    id: 'nameCall', hours: [3, 6], chance: 0.6,
    run: (game) => {
      const p = game.player;
      const a = p.yaw + rand(-2, 2);
      const pos = new THREE.Vector3(p.pos.x - Math.sin(a) * 60, 2, p.pos.z - Math.cos(a) * 60);
      audio.whisper(pos, null, 0.6);
      audio.say(`${N()}!`, { pitch: 1.6, rate: 0.8, volume: 0.25 });
      game.ui.subtitle(`(far away, a child's voice) "${N()}!"`, 3, 'whisper');
      return null;
    },
  }),
};

function chairModel() {
  const g = new THREE.Group();
  const m = mat('wood');
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.05, 0.45), m); seat.position.y = 0.45; g.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.5, 0.05), m); back.position.set(0, 0.72, -0.2); g.add(back);
  for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.45, 0.04), m); l.position.set(x, 0.22, z); g.add(l); }
  return g;
}
function doorModel() {
  const g = new THREE.Group();
  const frame = mat('paint');
  for (const x of [-0.5, 0.5]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.1, 0.12), frame); s.position.set(x, 1.05, 0); g.add(s); }
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.08, 0.12), frame); top.position.y = 2.1; g.add(top);
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.0, 0.04), new THREE.MeshStandardMaterial({ color: 0xd8d4c8 })); leaf.position.set(0, 1.0, 0); g.add(leaf);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), mat('metal')); knob.position.set(0.35, 1.0, 0.04); g.add(knob);
  return g;
}

// ---------------------------------------------------------------- fear hallucinations
// High fear changes what you see and hear. Most of it is harmless. You can never be sure which.
export class Hallucinations {
  constructor(game) {
    this.game = game;
    this.figT = rand(10, 20);
    this.sndT = rand(8, 16);
    this.fig = null;
  }
  update(dt) {
    const g = this.game, p = g.player, f = p.fear;
    for (const w of g.level.waters) w.uniforms.uFaces.value = Math.max(0, (f - 0.5) * 1.6) + (w._facesBoost || 0);
    // shadow figure at the periphery
    this.figT -= dt;
    if (!this.fig && f > 0.42 && this.figT <= 0) {
      this.figT = rand(14, 30) / (0.5 + f);
      const body = makeHumanoid({ height: rand(1.7, 2.5), thin: 0.75, color: 0x020202, skin: 0x020202, coat: true, hat: chance(0.4) });
      const side = chance(0.5) ? 1 : -1;
      const a = p.yaw + side * rand(0.7, 0.95);
      const d = rand(8, 25);
      const x = p.pos.x - Math.sin(a) * d, z = p.pos.z - Math.cos(a) * d;
      body.root.position.set(x, g.level.groundAt(x, z, p.pos.y + 2).y, z);
      body.root.rotation.y = Math.atan2(p.pos.x - x, p.pos.z - z);
      g.level.scene.add(body.root);
      this.fig = { body, t: 0 };
    }
    if (this.fig) {
      this.fig.t += dt;
      const head = this.fig.body.root.position.clone().setY(this.fig.body.root.position.y + 1.6);
      if (viewAngle(g.camera, head) < 0.45 || this.fig.t > 2.5) {
        g.level.scene.remove(this.fig.body.root);
        if (this.fig.t <= 2.5) p.addFear(0.06);
        this.fig = null;
      }
    }
    // phantom sounds
    this.sndT -= dt;
    if (f > 0.55 && this.sndT <= 0) {
      this.sndT = rand(10, 22) / f;
      const a = p.yaw + Math.PI + rand(-1, 1);
      const pos = new THREE.Vector3(p.pos.x - Math.sin(a) * rand(3, 10), p.pos.y + 1, p.pos.z - Math.cos(a) * rand(3, 10));
      const r = Math.random();
      if (r < 0.4) { for (let i = 0; i < 3; i++) setTimeout(() => audio.footstep(p.surface, 0.35, pos), i * 520); }
      else if (r < 0.7) audio.whisper(pos, null, 0.2);
      else if (r < 0.85) audio.branchSnap(pos);
      else audio.knock(pos, 2, 0.3);
    }
    // fear muffles hearing in waves
    if (!p.underwater) audio.setMuffle(f > 0.7 ? 1800 + Math.sin(performance.now() * 0.001) * 1200 : 20000);
  }
  dispose() { if (this.fig) this.game.level.scene.remove(this.fig.body.root); this.fig = null; }
}
