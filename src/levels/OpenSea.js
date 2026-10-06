import * as THREE from 'three';
import { Level } from '../world/Level.js';
import { Water } from '../world/Water.js';
import { mat, box, cyl, rowboat, note } from '../world/Props.js';
import { starterKit } from './common.js';
import { Boat } from '../systems/Boat.js';
import { Leviathan, DrownedSwarm, Watcher } from '../monsters/Sea.js';
import { DE } from '../systems/DreamEvents.js';
import { audio } from '../engine/Audio.js';
import { rand, damp } from '../util/math.js';
import { RADIO_FUTURE, N } from '../story/Text.js';

// Night 3 — a tiny boat in the middle of an endless ocean.
export function buildOpenSea(game) {
  const level = new Level(game, {
    fog: 0.012, fogColor: 0x070b10, waterLevel: 0, bounds: 2000,
    skyOpts: { top: 0x01030a, horizon: 0x0a1018, cloud: 0.45 },
    hemi: 0.3, hemiSky: 0x223040, moonIntensity: 0.5,
  });
  level.name = 'sea';
  level.ambientLight = 0.12;
  level.heightFn = () => -200;
  level.surfaceFn = () => 'wood';
  level.allowDeepWater = true;
  level.baseWaves = 0.45;
  const water = level.addWater(new Water({ size: 900, segments: 180, level: 0, color: 0x061016, deep: 0x010306, waveAmp: 0.45, follow: true }));
  level.isFishable = () => true;
  level.waterSurfaceAt = (x, z) => water.heightAt(x, z);
  level.fishDepthOverride = () => 120;

  const boat = new Boat(game, level, water, { x: 0, z: 0, yaw: 0 });
  level.boat = boat;
  level.onUpdate((dt) => boat.update(dt));
  level.spawn = { x: 0, z: 0, yaw: Math.PI, boat };

  // ---- points of interest on the water ----
  const floaters = [];
  const float = (obj, x, z, bob = 0.2) => { obj.position.set(x, 0, z); level.scene.add(obj); floaters.push({ obj, x, z, bob }); return obj; };
  level.onUpdate(() => { for (const f of floaters) { f.obj.position.y = water.heightAt(f.x, f.z) - f.bob; f.obj.rotation.z = Math.sin(water.time + f.x) * 0.08; } });
  // buoy with bell
  const buoy = new THREE.Group();
  cyl(0.6, 0.8, 1.2, new THREE.MeshStandardMaterial({ color: 0x8a2018, roughness: 0.6 }), 0, 0.3, 0, buoy, 10);
  cyl(0.05, 0.05, 2.2, 'metal', 0, 1.8, 0, buoy, 6);
  const bl = new THREE.PointLight(0xff3020, 3, 25, 1.5); bl.position.y = 3; buoy.add(bl);
  float(buoy, -70, -150, 0.4);
  // the lifeboat with a radio
  const life = rowboat(level, { x: 140, z: -90, rot: 0.4, color: 0xd86a20 });
  floaters.push({ obj: life, x: 140, z: -90, bob: 0.15 });
  const radioPos = new THREE.Vector3(140, 0.8, -90);
  // shipwreck mast
  const mast = new THREE.Group();
  cyl(0.25, 0.35, 16, 'darkwood', 0, 5, 0, mast, 8); const yard = cyl(0.12, 0.12, 9, 'darkwood', 0, 10, 0, mast, 6); yard.rotation.z = Math.PI / 2 - 0.2;
  mast.rotation.z = 0.25; mast.position.set(-160, -3, 70); level.scene.add(mast);
  // the door, floating
  const door = new THREE.Group(); box(1.0, 0.06, 2.1, new THREE.MeshStandardMaterial({ color: 0xd8d4c8 }), 0, 0, 0, door);
  const knob = cyl(0.04, 0.04, 0.06, 'metal', 0.38, 0.05, 0, door, 8); void knob;
  float(door, 60, 110, 0.0);
  // supply crates
  const crates = [];
  for (const [x, z] of [[35, -40], [-50, 45], [90, 60], [-110, -80], [10, 160], [170, 20]]) {
    const c = new THREE.Group(); box(0.8, 0.6, 0.8, mat('wood'), 0, 0, 0, c);
    float(c, x, z, 0.15);
    crates.push({ c, x, z, taken: false });
  }
  // lighthouse light, always on the horizon, never closer
  const lh = new THREE.PointLight(0xfff0c0, 0, 1);
  const lhGlow = new THREE.Mesh(new THREE.SphereGeometry(3, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff4d0, fog: false }));
  level.scene.add(lhGlow, lh);
  level.onUpdate(() => {
    const a = 2.2;
    lhGlow.position.set(boat.pos.x + Math.cos(a) * 700, 18, boat.pos.z + Math.sin(a) * 700);
    lhGlow.visible = Math.sin(game.time.now * 1.2) > 0.6;
  });

  // interactions from the boat (proximity based)
  level.onUpdate(() => {
    for (const cr of crates) {
      if (cr.taken) continue;
      if (Math.hypot(cr.x - boat.pos.x, cr.z - boat.pos.z) < 5 && !cr.it) {
        cr.it = level.addInteractable({ pos: new THREE.Vector3(cr.x, 0.5, cr.z), radius: 6, wide: true, prompt: 'Haul the floating crate aboard', onUse: () => {
          const loot = [['fuel', 1], ['minnow', 6], ['chum', 3], ['medicine', 1], ['flare', 1], ['lure', 2], ['line', 2]];
          const [id, q] = loot[Math.floor(Math.random() * loot.length)];
          if (game.inventory.add(id, q)) { cr.taken = true; level.scene.remove(cr.c); level.removeInteractable(cr.it); audio.splash(cr.c.position, 0.4); }
        } });
      }
    }
  });
  let radioUsed = 0;
  level.addInteractable({ pos: radioPos, radius: 7, wide: true, prompt: 'Listen to the lifeboat radio', onUse: () => {
    radioUsed++;
    audio.radioStatic(3, 0.15);
    const lines = radioUsed === 1 ? [`...Hollow Lake search, day nine. Walt's still out there. Won't come in.`, `The kid? Sleeping in the truck. Hasn't said a word since Saturday.`] : [RADIO_FUTURE()[radioUsed % 4]];
    lines.forEach((l, i) => setTimeout(() => { game.ui.subtitle(`(radio) "${l}"`, 5, 'whisper'); audio.say(l, { pitch: 0.75, rate: 0.95, volume: 0.35 }); }, 1500 + i * 5000));
    if (radioUsed === 1) game.story.addJournal({ id: 'searchradio', title: 'Lifeboat radio', text: `"Hollow Lake search, day nine. Walt's still out there. Won't come in." "The kid? Sleeping in the truck. Hasn't said a word since Saturday."` });
  } });
  note(level, { x: 140.3, y: 0.55, z: -89.6, standalone: true, title: 'Waterproof pouch', w: 0.25, h: 0.3, lines: ['SEARCH GRID — HOLLOW LAKE', 'Sector 4 (north landing): dragged x3. Nothing.', 'Sector 7: boat recovered, empty. Child\'s rod inside.', 'W.P. requests divers again. Denied.'], journal: { id: 'grid', title: 'Search grid', text: 'SEARCH GRID — HOLLOW LAKE. Sector 4 (north landing): dragged x3. Nothing. Sector 7: boat recovered, empty. Child\'s rod inside. W.P. requests divers again. Denied.' } });
  level.onUpdate(() => { const it = level.interactables.find((i) => i.pos === radioPos); void it; radioPos.y = water.heightAt(140, -90) + 0.6; });

  // ---- monsters ----
  const lev = new Leviathan(game, { boat, water });
  const swarm = new DrownedSwarm(game, { boat, water, spawnStart: 1.5, max: 3 });
  const watcher = new Watcher(game, { getAnchor: () => boat.pos, startDist: 280, rate: 5, water });
  level.monsters = [lev, swarm, watcher];
  level.leviathan = lev;
  game.events.on('hooked', () => lev.addAttention(0.05));
  game.events.on('snap', () => lev.addAttention(0.08));

  level.fishingSpots = [{ x: -160, z: 70, r: 30, speed: 0.7, boost: { photo_fish: 3, relic_scale: 2, monkfish: 2 } }, { x: -70, z: -150, r: 25, speed: 0.8, boost: { cod: 2 } }];

  // ---- dream events ----
  level.dreams = [DE.moonJump(), DE.whisper(), DE.nameCall(), DE.silence(), DE.facesInWater(), DE.eclipse(), DE.doppelganger(null), {
    id: 'flatSea', hours: [2, 4.5], chance: 0.7,
    run: (g) => { const prev = water.uniforms.uWaveAmp.value; g.ui.subtitle('The ocean goes perfectly flat. Not a ripple. Not a sound.', 4); audio.silenceAll(0.3); return { t: 0, update(dt) { this.t += dt; water.uniforms.uWaveAmp.value = damp(water.uniforms.uWaveAmp.value, 0, 2, dt); water.uniforms.uStill.value = 1; return this.t < 14; }, cleanup() { water.uniforms.uStill.value = 0; water.uniforms.uWaveAmp.value = prev; audio.setAmbience(level.ambience(g.time.hour), 2); } }; },
  }, {
    id: 'objectsSurface', hours: [1, 6], chance: 0.9, once: false,
    run: (g) => {
      // things float up from below: a shoe, a chair, a doll
      const kinds = ['boot', 'doll', 'can'];
      const k = kinds[Math.floor(Math.random() * kinds.length)];
      const obj = new THREE.Group(); const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.5), new THREE.MeshStandardMaterial({ color: k === 'doll' ? 0xe8c8b0 : 0x2a2420 })); obj.add(m);
      const a = rand(0, 6.28); const x = boat.pos.x + Math.cos(a) * 8, z = boat.pos.z + Math.sin(a) * 8;
      float(obj, x, z, 0.05);
      audio.bubble(new THREE.Vector3(x, 0, z)); audio.bubble(new THREE.Vector3(x, 0, z));
      g.ui.subtitle(k === 'doll' ? "A child's doll bobs up beside the boat." : 'Something bobs up from far below.', 3);
      return null;
    },
  }];

  // ---- weather & ambience ----
  level.weather.set({ fog: 0.01, wind: 0.3 }, true);
  level.ambience = (h) => ({ waves: 0.4 + water.uniforms.uWaveAmp.value * 0.4, wind: 0.3 + level.weather.state.wind * 0.4, rain: level.weather.state.rain * 0.8, gale: level.weather.state.storm > 0.5 ? 0.4 : 0, drone: h >= 2 ? 0.2 : 0.05, tension: lev.attention > 0.6 ? 0.15 : 0 });
  level.onHour = (h) => {
    if (h === 1) watcher.activate();
    if (h === 2) { level.weather.set({ wind: 0.6, rain: 0.3, fog: 0.016 }); level.baseWaves = 0.8; }
    if (h === 4) { level.weather.set({ wind: 1, rain: 1, fog: 0.022, storm: 1 }); level.baseWaves = 1.3; game.ui.subtitle('The storm arrives all at once.', 3); }
    if (h === 5) { level.weather.set({ wind: 0, rain: 0, fog: 0.006, storm: 0 }); level.baseWaves = 0; water.uniforms.uStill.value = 0.8; level.sky.uniforms.uMoonSize.value = 0.09; game.ui.subtitle('5 AM. The sea is flat as a mirror. The moon is enormous. Nothing is moving except you.', 6); }
  };
  level.introPath = [
    { pos: new THREE.Vector3(30, 18, 40), look: new THREE.Vector3(0, 0, 0) },
    { pos: new THREE.Vector3(8, 4, 10), look: new THREE.Vector3(0, 1, 0) },
    { pos: new THREE.Vector3(0, 1.8, 0.5), look: new THREE.Vector3(0, 1.2, 8) },
  ];
  level.kit = () => starterKit(game, [['minnow', 4], ['fuel', 1], ['flare', 1]]);
  level.cleanup = () => { boat.dispose(); };
  void N;
  return level;
}
