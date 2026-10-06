import * as THREE from 'three';
import { Level } from '../world/Level.js';
import { Water } from '../world/Water.js';
import { Noise2D } from '../util/noise.js';
import { forest, grass, building, rowboat, note, mat, box, cyl, lanternLight } from '../world/Props.js';
import { pickup, closet, table, starterKit } from './common.js';
import { Mire } from '../monsters/Others.js';
import { DE } from '../systems/DreamEvents.js';
import { audio } from '../engine/Audio.js';
import { rand, chance } from '../util/math.js';
import { makeHumanoid } from '../monsters/Monster.js';

// Night 5 — the swamp. Warm black water, rotten boardwalks, something that follows the smell of fish.
export function buildSwamp(game) {
  const level = new Level(game, {
    fog: 0.05, fogColor: 0x0e120c, waterLevel: 0, bounds: 115, maxWade: 1.0,
    skyOpts: { top: 0x040604, horizon: 0x101410, cloud: 0.7, stars: 0.3, moonColor: 0xd8d8a0 },
    hemi: 0.3, hemiSky: 0x2a3420, hemiGround: 0x0a0c06, moonIntensity: 0.35, moonColor: 0xb8c0a0,
  });
  level.name = 'swamp';
  level.ambientLight = 0.1;
  const n = new Noise2D(55);
  const islands = [{ x: 0, z: 0, r: 9 }, { x: 40, z: -30, r: 8 }, { x: -45, z: -50, r: 9 }, { x: -30, z: 25, r: 6 }, { x: 55, z: 40, r: 7 }, { x: -70, z: 10, r: 6 }, { x: 10, z: -70, r: 6 }];
  const channelD = (x, z) => Math.abs(z - 45 - Math.sin(x * 0.05) * 12) ; // a deep channel snaking east-west
  const channel2 = (x, z) => Math.abs(x + 15 - Math.sin(z * 0.06) * 10);
  const height = (x, z) => {
    let h = -0.55 + n.fbm(x * 0.03, z * 0.03, 4) * 0.7;
    for (const is of islands) { const d = Math.hypot(x - is.x, z - is.z); if (d < is.r + 4) h = Math.max(h, 0.5 - Math.max(0, d - is.r * 0.6) * 0.18); }
    const c = Math.min(channelD(x, z), channel2(x, z));
    if (c < 6) h = Math.min(h, -0.6 - (6 - c) * 0.5);
    return h;
  };
  level.makeTerrain({ size: 260, seg: 180, height, color: (x, z, h) => (h > 0 ? [0.14, 0.15, 0.08] : [0.07, 0.07, 0.04]), texKey: 'mud', texBase: [100, 104, 90], repeat: 60 });
  level.surfaceFn = (x, z, h) => (h > 0 ? 'grass' : 'water');
  const water = level.addWater(new Water({ size: 260, level: 0, color: 0x0c100a, deep: 0x020302 }));
  water.uniforms.uReflectivity.value = 0.7;
  water.uniforms.uTint.value.set(0.8, 0.9, 0.7);
  const isWater = (x, z) => height(x, z) < -0.1;
  level.isFishable = (x, z) => height(x, z) < -0.25 && !level.groundAt(x, z, 0.2).platform;

  // ---- boardwalks ----
  const walk = (ax, az, bx, bz, top = 0.45) => {
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz), rot = Math.atan2(dx, dz);
    const g = new THREE.Group(); g.position.set((ax + bx) / 2, 0, (az + bz) / 2); g.rotation.y = rot;
    for (let s = -len / 2; s < len / 2; s += 0.6) {
      if (chance(0.06)) continue; // missing planks
      const p = box(1.6, 0.06, 0.5, mat('plank'), rand(-0.05, 0.05), top - 0.03 + rand(-0.03, 0.02), s, g); p.rotation.y = rand(-0.05, 0.05);
    }
    for (let s = -len / 2; s < len / 2; s += 3) for (const side of [-0.75, 0.75]) cyl(0.06, 0.07, 1.6, 'darkwood', side, top - 0.8, s, g, 5);
    level.scene.add(g);
    level.addPlatform((ax + bx) / 2, (az + bz) / 2, 0.8, len / 2, -rot, top, 'wood');
  };
  walk(0, 0, 40, -30); walk(0, 0, -30, 25); walk(-30, 25, -70, 10); walk(0, 0, -45, -50); walk(40, -30, 10, -70); walk(-30, 25, 55, 40, 0.5);

  // ---- stilt shack (tape) ----
  const sx = 40, sz = -30;
  const shack = building(level, { x: sx, z: sz, rot: 0.3, w: 5, d: 4, h: 2.6, wall: 'darkwood', doors: [{ side: 'w', at: 0, width: 1.0, locked: { key: 'key_shack', msg: 'Swollen shut and locked. Someone lived here. Someone left.', hint: 'needs a key' } }], windows: [{ side: 'e', at: 0 }], floorY: 0.9, lit: false });
  for (const [lx, lz] of [[-2.4, -1.9], [2.4, -1.9], [-2.4, 1.9], [2.4, 1.9]]) { const [x, z] = shack.local(lx, lz); cyl(0.1, 0.12, 2.4, 'darkwood', x, -0.3, z, level.scene, 6); }
  for (let i = 0; i < 3; i++) { const [x, z] = shack.local(-3.0 - i * 0.35, 0); level.addPlatform(x, z, 0.2, 0.5, -0.3, 0.45 + (i === 0 ? 0.3 : 0) - i * 0.0 + (2 - i) * 0.0, 'wood'); }
  { const [x, z] = shack.local(-2.9, 0); level.addPlatform(x, z, 0.35, 0.6, -0.3, 0.7, 'wood'); box(0.7, 0.08, 1.2, mat('plank'), x, 0.68, z, level.scene); }
  const st = table(level, shack, { lx: 1, lz: -1 });
  level.addInteractable({ pos: new THREE.Vector3(st.x, st.top + 0.1, st.z), radius: 1.8, prompt: 'Play the cassette labelled DAD', cond: () => !game.story.memories.has('tape'), onUse: () => { audio.radioStatic(1.5, 0.1); setTimeout(() => game.story.addMemory('tape'), 1200); } });
  pickup(level, { x: st.x + 0.3, z: st.z + 0.2, y: st.top, item: 'medicine', qty: 1 });
  closet(level, shack, { lx: -1.8, lz: -1.4, rot: Math.PI / 2, name: 'wardrobe' });
  const shackLamp = lanternLight(level, { x: shack.local(0, 0)[0], y: 3.1, z: shack.local(0, 0)[1], intensity: 2, radius: 4, flicker: 0.4 });
  shackLamp.setOn(false);
  level.addInteractable({ pos: new THREE.Vector3(shack.local(0, 0)[0], 2.4, shack.local(0, 0)[1]), radius: 2.5, prompt: () => (shackLamp.ls.on ? 'Turn off the lamp' : 'Light the lamp'), onUse: () => shackLamp.setOn(!shackLamp.ls.on) });

  // ---- chapel (a safe, candlelit place) ----
  const chapel = building(level, { x: -45, z: -50, rot: -0.2, w: 6, d: 8, h: 3.4, wall: 'wood', doors: [{ side: 's', at: 0, width: 1.4, noDoor: true }], windows: [{ side: 'e', at: 0 }, { side: 'w', at: 0 }], lit: true });
  for (let i = 0; i < 4; i++) { const [x, z] = chapel.local(0, 1.8 - i * 1.3); box(3, 0.45, 0.4, mat('darkwood'), x, chapel.baseY + 0.22, z, level.scene); }
  const [cx, cz] = chapel.local(0, -3.3);
  box(1.6, 1, 0.6, mat('wood'), cx, chapel.baseY + 0.5, cz, level.scene);
  for (let i = 0; i < 9; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.15, 6), mat('bone')); c.position.set(cx - 0.6 + i * 0.15, chapel.baseY + 1.08, cz + rand(-0.1, 0.1)); level.scene.add(c); }
  const candle = new THREE.PointLight(0xffa850, 3, 9, 1.8); candle.position.set(cx, chapel.baseY + 1.4, cz); level.scene.add(candle);
  level.addLightSource(new THREE.Vector3(cx, chapel.baseY + 1, cz + 2), 6, candle, { flicker: 0.3 });
  note(level, { x: cx, y: chapel.baseY + 1.02, z: cz + 0.2, standalone: true, title: 'Prayer cards', w: 0.3, h: 0.36, lines: ['For Mara.', 'For Mara.', 'For Walt, who would not stop looking.', `For ${game.story.name}, who will not stop sleeping.`], journal: { id: 'prayer', title: 'Prayer cards', text: () => `For Mara. For Mara. For Walt, who would not stop looking. For ${game.story.name}, who will not stop sleeping.` } });

  // ---- the canoe with the dead man (key) ----
  const canoe = rowboat(level, { x: -24, z: 30, rot: 1.2, color: 0x3a2a1a });
  const corpse = makeHumanoid({ height: 1.7, thin: 0.8, color: 0x2a2e20, skin: 0x7a8a70, hat: true });
  corpse.root.rotation.x = -Math.PI / 2 + 0.2; corpse.root.position.set(0, 0.35, 1.0); corpse.armR.rotation.z = 1.2;
  canoe.add(corpse.root);
  pickup(level, { x: -23.5, z: 30.5, y: 0.4, item: 'key_shack', model: 'key', label: 'the key from his hand' });

  // ---- the sunken car, headlights still on ----
  const carX = 20, carZ = 46;
  const carG = new THREE.Group(); carG.position.set(carX, -1.3, carZ); carG.rotation.set(0.2, 1.3, 0.1);
  box(1.8, 1.0, 4.2, new THREE.MeshStandardMaterial({ color: 0x3a4a5a, roughness: 0.6 }), 0, 0.5, 0, carG);
  const hl = new THREE.SpotLight(0xd8e8c0, 25, 18, 0.5, 0.6, 1.5); hl.position.set(0, 0.6, -2.2); const ht = new THREE.Object3D(); ht.position.set(0, 2, -8); carG.add(ht); hl.target = ht; carG.add(hl);
  level.scene.add(carG);

  // ---- vegetation ----
  forest(level, { count: Math.floor(420 * level.quality.treeDensity), area: 110, seed: 51, kind: 'swamp', scale: [0.8, 1.6], accept: (x, z) => { const h = height(x, z); return h > -0.5 && Math.min(channelD(x, z), channel2(x, z)) > 7 && islands.every((is) => Math.hypot(x - is.x, z - is.z) > (is === islands[1] || is === islands[2] ? 9 : 4)); } });
  grass(level, { count: 4000, area: 110, seed: 52, reeds: true, color: 0x2a3018, height: [0.6, 1.8], accept: (x, z) => { const h = height(x, z); return h > -0.5 && h < 0.4; } });
  // lily pads
  const pad = new THREE.Mesh(new THREE.CircleGeometry(0.35, 10, 0.3, Math.PI * 1.8), new THREE.MeshStandardMaterial({ color: 0x1e2e14, roughness: 0.6 }));
  for (let i = 0; i < 250; i++) { const p = pad.clone(); const x = rand(-100, 100), z = rand(-100, 100); if (!isWater(x, z)) continue; p.position.set(x, 0.015, z); p.rotation.x = -Math.PI / 2; p.rotation.z = rand(0, 6); p.scale.setScalar(rand(0.6, 1.4)); level.scene.add(p); }
  // will-o'-wisps: pretty lights over deep water
  const wisps = [];
  for (let i = 0; i < 5; i++) {
    const l = new THREE.PointLight(0x9affc0, 1.2, 6, 2); const m = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), new THREE.MeshBasicMaterial({ color: 0xc8ffe0 })); m.add(l);
    const base = new THREE.Vector3(rand(-80, 80), 0.8, rand(-80, 80)); m.position.copy(base); level.scene.add(m); wisps.push({ m, base, ph: rand(0, 6) });
  }
  level.onUpdate((dt) => { for (const w of wisps) { w.ph += dt * 0.3; w.m.position.set(w.base.x + Math.sin(w.ph) * 4, 0.8 + Math.sin(w.ph * 3) * 0.2, w.base.z + Math.cos(w.ph * 0.7) * 4); } });

  // pickups
  pickup(level, { x: 2, z: 3, item: 'worm', qty: 6, label: 'Bait box' });
  pickup(level, { x: -68, z: 12, item: 'medicine', qty: 1 });
  pickup(level, { x: 55, z: 41, item: 'medicine', qty: 1 });
  pickup(level, { x: 10, z: -69, item: 'minnow', qty: 5 });
  pickup(level, { x: -3, z: -2, item: 'bottle', qty: 2 });

  // ---- monster ----
  const mire = new Mire(game, { isWater, start: { x: 30, z: 60 } });
  level.monsters = [mire];
  level.mire = mire;
  level.fishingSpots = [{ x: carX, z: carZ, r: 12, speed: 0.8, boost: { phone: 3, doll: 2, relic_eye: 2 } }];
  level.spawn = { x: 0, z: 2, yaw: Math.PI };

  level.dreams = [DE.whisper(), DE.nameCall(), DE.facesInWater(), DE.objectBehind('doll'), DE.echoSteps(), DE.silence(), DE.eclipse(), DE.doppelganger(null), DE.reflectionFigure((g) => { const p = g.player.pos; const f = g.player.forward(); return new THREE.Vector3(p.x + f.x * 6, 0, p.z + f.z * 6); }, { hours: [3, 6] })];
  level.weather.set({ fog: 0.05, wind: 0.15 }, true);
  level.ambience = (h) => ({ water: 0.25, swamp: 0.5, crickets: Math.max(0, 0.15 - (game.player.threat || 0) * 0.2), wind: 0.15, rain: level.weather.state.rain * 0.8, drone: 0.12 + h * 0.04, tension: (game.player.threat || 0) > 0.6 ? 0.14 : 0 });
  level.onHour = (h) => {
    if (h === 3) level.weather.set({ rain: 0.6, fog: 0.06 });
    if (h === 4) level.weather.set({ storm: 1, rain: 0.9 });
    if (h === 5) level.weather.set({ storm: 0, rain: 0.2, fog: 0.045 });
  };
  // frogs croak & go silent when it's near
  level.onUpdate(() => { if (chance(0.01) && mire.distToPlayer() > 20) audio._oneTone({ pos: new THREE.Vector3(game.player.pos.x + rand(-30, 30), 0, game.player.pos.z + rand(-30, 30)), type: 'sawtooth', freq: 130, freqEnd: 90, d: 0.25, vol: 0.12 }); });
  level.introPath = [
    { pos: new THREE.Vector3(-40, 14, 50), look: new THREE.Vector3(0, 0, 0) },
    { pos: new THREE.Vector3(-8, 3, 12), look: new THREE.Vector3(0, 0.5, 0) },
    { pos: new THREE.Vector3(0, 2.1, 2), look: new THREE.Vector3(0, 1.5, -6) },
  ];
  level.kit = () => starterKit(game, [['bottle', 1]]);
  return level;
}
