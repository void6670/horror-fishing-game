import * as THREE from 'three';
import { Level } from '../world/Level.js';
import { Noise2D } from '../util/noise.js';
import { forest, rocks, building, rowboat, note, mat, box, cyl, lanternLight, toWorld } from '../world/Props.js';
import { pickup, closet, table, starterKit } from './common.js';
import { IceThing } from '../monsters/IceThing.js';
import { DE } from '../systems/DreamEvents.js';
import { makeHumanoid } from '../monsters/Monster.js';
import { audio } from '../engine/Audio.js';
import { rand } from '../util/math.js';

function iceTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#9ab4c0'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.15})`; g.beginPath(); g.arc(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 3, 0, 7); g.fill(); }
  g.strokeStyle = 'rgba(235,245,255,0.35)'; g.lineWidth = 1;
  for (let i = 0; i < 40; i++) { let x = Math.random() * 512, y = Math.random() * 512; g.beginPath(); g.moveTo(x, y); for (let s = 0; s < 6; s++) { x += (Math.random() - 0.5) * 80; y += (Math.random() - 0.5) * 80; g.lineTo(x, y); } g.stroke(); }
  for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(20,40,50,${Math.random() * 0.12})`; g.beginPath(); g.arc(Math.random() * 512, Math.random() * 512, 10 + Math.random() * 50, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(18, 18); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildFrozenLake(game) {
  const level = new Level(game, {
    fog: 0.02, fogColor: 0x1a2028, waterLevel: -0.5, bounds: 165,
    skyOpts: { top: 0x04070d, horizon: 0x1c2630, cloud: 0.5, aurora: 0 },
    hemi: 0.45, hemiSky: 0x5a6a80, hemiGround: 0x2a3038, moonIntensity: 0.6, moonColor: 0xb0c4e0,
  });
  level.name = 'frozen';
  level.ambientLight = 0.22; // snow reflects the moon
  const n = new Noise2D(22);
  const R = (x, z) => 100 + n.noise(Math.cos(Math.atan2(z, x)) * 1.2, Math.sin(Math.atan2(z, x)) * 1.2) * 8;
  const inLake = (x, z) => Math.hypot(x, z) < R(x, z) - 0.5;
  const meshHeight = (x, z) => {
    const d = Math.hypot(x, z), r = R(x, z);
    if (d < r) return -6 + (d / r) * 4;
    const s = d - r;
    return 0.3 + s * 0.12 + Math.pow(Math.max(0, s - 20) / 50, 2) * 30 + n.fbm(x * 0.02, z * 0.02, 4) * 6 * Math.min(1, s / 25);
  };
  level.makeTerrain({ size: 380, seg: 190, height: meshHeight, color: (x, z, h) => (h < 0 ? [0.05, 0.07, 0.08] : h > 18 ? [0.55, 0.58, 0.62] : [0.8, 0.83, 0.88]), texKey: 'snow', texBase: [210, 214, 220], repeat: 50 });
  level.heightFn = (x, z) => (inLake(x, z) ? 0 : Math.max(0, meshHeight(x, z)));
  level.surfaceFn = (x, z) => (inLake(x, z) ? 'ice' : 'snow');
  // ice sheet
  const ice = new THREE.Mesh(new THREE.CircleGeometry(115, 64), new THREE.MeshStandardMaterial({ map: iceTexture(), color: 0xb8d0dc, roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.8 }));
  ice.rotation.x = -Math.PI / 2; ice.position.y = 0.0; ice.receiveShadow = true;
  ice.renderOrder = 1;
  level.scene.add(ice);
  // snow drifts on the ice
  const drift = new THREE.Mesh(new THREE.CircleGeometry(1, 16), new THREE.MeshStandardMaterial({ color: 0xe8eef4, roughness: 1, transparent: true, opacity: 0.6 }));
  for (let i = 0; i < 70; i++) { const d = drift.clone(); const a = rand(0, 6.28), r = rand(0, 95); d.position.set(Math.cos(a) * r, 0.01, Math.sin(a) * r); d.rotation.x = -Math.PI / 2; d.scale.set(rand(2, 9), rand(1, 4), 1); d.rotation.z = rand(0, 3); level.scene.add(d); }

  // ---- holes ----
  const holes = [];
  const holeMat = new THREE.MeshStandardMaterial({ color: 0x03070a, roughness: 0.05, metalness: 0.3 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xdfe8ee, roughness: 1 });
  const addHole = (x, z, silent = true) => {
    if (holes.some((h) => Math.hypot(h.x - x, h.z - z) < 1.2)) return null;
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const w = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), holeMat); w.rotation.x = -Math.PI / 2; w.position.y = 0.012; g.add(w);
    const rim = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.85, 20), rimMat); rim.rotation.x = -Math.PI / 2; rim.position.y = 0.02; g.add(rim);
    level.scene.add(g);
    const h = { x, z, g };
    holes.push(h);
    if (!silent) audio.splash(new THREE.Vector3(x, 0, z), 0.4);
    return h;
  };
  level.holes = holes;
  level.isFishable = (x, z) => holes.some((h) => Math.hypot(h.x - x, h.z - z) < 0.9);
  level.waterSurfaceAt = () => -0.12;
  level.castAssist = (pos, dir) => {
    let best = null, bd = 3.8;
    for (const h of holes) { const d = Math.hypot(h.x - pos.x, h.z - pos.z); if (d < bd && ((h.x - pos.x) * dir.x + (h.z - pos.z) * dir.z) > -0.3) { bd = d; best = h; } }
    return best ? new THREE.Vector3(best.x, -0.12, best.z) : null;
  };
  level.lockFightToHole = true;
  level.groundCastMsg = 'The line skitters across the ice. Stand by a hole and cast — or drill a new one.';
  level.fishDepthOverride = (p) => 4 + (1 - Math.min(1, Math.hypot(p.x, p.z) / 100)) * 28;

  // ---- the shanty (safe-ish: heater light, thick ice) ----
  const sh = { x: 0, z: 82 };
  const shanty = building(level, { x: sh.x, z: sh.z, rot: 0, w: 3.2, d: 3.2, h: 2.3, wall: 'wood', roof: 'roof', floorY: 0, noFloor: true, doors: [{ side: 's', at: 0.5, width: 0.9 }], windows: [{ side: 'n', at: 0 }], lit: true });
  addHole(sh.x - 0.4, sh.z - 0.5);
  const heater = new THREE.PointLight(0xff7030, 3, 6, 1.6); heater.position.set(sh.x + 1, 0.5, sh.z - 0.9); level.scene.add(heater);
  box(0.4, 0.6, 0.3, new THREE.MeshStandardMaterial({ color: 0x3a3a3a, emissive: 0x401000, emissiveIntensity: 0.8 }), sh.x + 1.1, 0.3, sh.z - 1.1, level.scene);
  level.addLightSource(new THREE.Vector3(sh.x, 0.8, sh.z), 3.5, heater, { flicker: 0.15 });
  const inShanty = (x, z) => Math.abs(x - sh.x) < 1.7 && Math.abs(z - sh.z) < 1.7;
  level.addHideSpot({ name: 'shanty corner', kind: 'shanty', pos: new THREE.Vector3(sh.x + 1, 1, sh.z + 0.6), view: new THREE.Vector3(sh.x + 1.1, 1.1, sh.z + 1.1), yaw: Math.PI, exit: new THREE.Vector3(sh.x, 0, sh.z + 2.6), searchable: false, safeFromIce: true, lookLimit: 1 });
  pickup(level, { x: sh.x - 1, z: sh.z + 0.8, y: 0, item: 'minnow', qty: 6, label: 'Minnow bucket' });
  note(level, { x: sh.x + 0.4, y: 1.5, z: sh.z - 1.52, rotY: 0, title: 'Scratched into the wall', w: 0.5, h: 0.4, lines: ['14 holes tonight', '15', '16', '23', 'still lowering the lantern', 'still nothing', 'she hated the cold'], opts: { bg: '#6a5a44', fg: '#e8e0d0' }, journal: { id: 'shanty', title: 'Scratched into the shanty wall', text: '14 holes tonight. 15. 16. 23. Still lowering the lantern. Still nothing. She hated the cold.' } });

  // pre-drilled holes across the ice
  for (const [x, z] of [[12, 70], [-14, 64], [25, 40], [-30, 30], [5, 15], [40, -10], [-20, -35], [0, -60]]) addHole(x, z);

  // ---- shore cabin (locked) ----
  const cab = building(level, { x: -118, z: 18, rot: Math.PI / 2, w: 6, d: 5, doors: [{ side: 's', at: 0, width: 1.1, locked: { key: 'key_cabin2', msg: 'Frozen shut and locked. A plaque: PELL.', hint: 'needs a key' } }], windows: [{ side: 'e', at: 0 }], lit: false });
  closet(level, cab, { lx: -2.4, lz: -1.8, rot: Math.PI / 2 });
  const t2 = table(level, cab, { lx: 1, lz: -1.2 });
  pickup(level, { x: t2.x, z: t2.z, y: t2.top, item: 'memento', qty: 2, label: "Mara's hair clips (keepsake bait)" });
  pickup(level, { x: t2.x + 0.3, z: t2.z + 0.2, y: t2.top, item: 'medicine', qty: 1 });
  pickup(level, { ...(() => { const [x, z] = cab.local(-1.5, 1.4); return { x, z }; })(), item: 'medicine', qty: 1, y: cab.baseY });
  note(level, { x: t2.x - 0.3, y: t2.top + 0.01, z: t2.z, standalone: true, title: 'Ice log', w: 0.3, h: 0.36, lines: ['Jan 3 — 14 holes, north half. Lowered the lantern into each.', 'Jan 9 — they called the search. Said spring.', `Jan 12 — ${game.story.name} came out today. Stood on the shore. Didn't come onto the ice. Didn't say anything. Neither did I. I should have.`], journal: { id: 'icelog', title: "Dad's ice log", text: () => `Jan 3 — 14 holes, north half. Lowered the lantern into each.\nJan 9 — they called the search. Said spring.\nJan 12 — ${game.story.name} came out today. Stood on the shore. Didn't come onto the ice. Didn't say anything. Neither did I. I should have.` } });
  lanternLight(level, { x: cab.local(0, 3)[0], y: cab.baseY + 2.2, z: cab.local(0, 3)[1], intensity: 1.5, radius: 4, flicker: 0.3 });

  // ---- snowmobile with its headlight still on ----
  const sm = new THREE.Group(); const smy = level.heightAt(30, 108); sm.position.set(30, smy, 108); sm.rotation.y = 2.6;
  box(0.9, 0.5, 2.2, new THREE.MeshStandardMaterial({ color: 0x8a1a1a, roughness: 0.4, metalness: 0.3 }), 0, 0.5, 0, sm);
  box(0.6, 0.3, 0.8, mat('black'), 0, 0.85, 0.2, sm);
  for (const s of [-0.5, 0.5]) box(0.08, 0.06, 2.4, mat('metal'), s, 0.06, 0, sm);
  const smLight = new THREE.SpotLight(0xfff0d0, 40, 40, 0.45, 0.5, 1.5); smLight.position.set(0, 0.7, -1.1); const smt = new THREE.Object3D(); smt.position.set(0, 0, -10); sm.add(smt); smLight.target = smt; sm.add(smLight);
  level.scene.add(sm);
  level.addBox(30, 108, 0.5, 1.2, -2.6, { y0: smy - 1, y1: smy + 1 });
  pickup(level, { x: 31.5, z: 107, item: 'worm', qty: 4 });
  pickup(level, { x: 28.5, z: 110, item: 'flare', qty: 1 });

  // ---- frozen rowboat & the figure under the ice ----
  const rb = rowboat(level, { x: -35, z: -20, y: -0.25, rot: 1.1 });
  rb.rotation.z = 0.15;
  const frozen = makeHumanoid({ height: 1.75, thin: 0.9, color: 0x2e3a2e, skin: 0x8a9aa0, coat: true });
  frozen.root.rotation.x = -Math.PI / 2; frozen.root.position.set(-31, -0.9, -16.5); frozen.root.rotation.z = 0.5;
  level.scene.add(frozen.root);
  level.addInteractable({ pos: new THREE.Vector3(-31, 0.4, -16.5), radius: 2.2, wide: true, prompt: 'Look down through the ice', onUse: () => { game.player.forcedLook = { target: new THREE.Vector3(-31, -1, -16.5), time: 1.2, speed: 4 }; audio.sting(0.4); game.player.addFear(0.4); game.ui.subtitle('Someone is frozen under the ice, face up, eyes open. They are wearing your coat.', 5); game.story.addJournal({ id: 'frozen', title: 'Under the ice', text: 'A figure frozen face-up beneath the ice beside the old rowboat. Eyes open. Wearing your coat.' }); } });

  // ---- vegetation ----
  forest(level, { count: Math.floor(700 * level.quality.treeDensity), area: 170, seed: 31, accept: (x, z) => { const h = meshHeight(x, z); return h > 1 && h < 22 && Math.hypot(x + 118, z - 18) > 8 && Math.hypot(x - 30, z - 108) > 5; } });
  rocks(level, { count: 120, area: 170, seed: 32, color: 0x8a9098, accept: (x, z) => meshHeight(x, z) > 0.6 });

  // ---- spots & spawn ----
  level.fishingSpots = [{ x: 0, z: 0, r: 35, speed: 0.85, boost: { laketrout: 2.5, relic_tooth: 2, burbot: 1.5 } }];
  level.spawn = { x: sh.x, z: sh.z + 0.6, yaw: Math.PI };

  // ---- drilling ----
  const drillIt = level.addInteractable({
    pos: { x: 0, y: 0, z: 0 }, radius: 2.2, wide: true, hold: game.story.upgrades.auger ? 2 : 3.2,
    prompt: 'Drill a hole (hold E) — loud',
    cond: () => { const p = game.player.pos; return inLake(p.x, p.z) && !inShanty(p.x, p.z) && !holes.some((h) => Math.hypot(h.x - p.x, h.z - p.z) < 3.5) && !game.fishing.busy(); },
    whileHolding: (dt) => { drillIt._n = (drillIt._n || 0) - dt; if (drillIt._n <= 0) { drillIt._n = 0.35; game.noise.emit(game.player.pos, 40, 'drill'); audio.drill(0.4); } game.player.camShake = 0.15; },
    onUse: () => { const p = game.player.pos; const f = game.player.forward(); addHole(p.x + f.x * 1.3, p.z + f.z * 1.3, false); game.ui.toast('Black water wells up in the new hole.'); },
  });
  level.onUpdate(() => { const p = game.player.pos, f = game.player.forward(); drillIt.pos.set(p.x + f.x * 1.2, 0.3, p.z + f.z * 1.2); });

  // ---- monster ----
  const thing = new IceThing(game, { isOnIce: (x, z) => inLake(x, z) && !inShanty(x, z), iceY: 0, start: { x: -40, z: -40 }, onBurst: (p) => addHole(p.x, p.z, false) });
  level.monsters = [thing];
  // relic: a tooth left behind in the ice after its first burst
  let toothPlaced = false;
  level.onUpdate(() => {
    if (!toothPlaced && thing.state === 'rest' && !game.story.relics.has('relic_tooth') && !game.story.caught.has('relic_tooth')) {
      toothPlaced = true;
      const p = thing.crackAt;
      pickup(level, { x: p.x + 1.2, z: p.z + 0.8, y: 0.05, item: 'relic_tooth', model: 'tooth', label: 'the pale tooth', onTake: () => { if (game.inventory.add('relic_tooth', 1)) game.story.caught.add('relic_tooth'); } });
    }
  });

  // ---- dream events ----
  level.dreams = [DE.upwardSnow(), DE.moonJump(), DE.whisper(), DE.nameCall(), DE.silence(), DE.objectBehind('doll'), DE.echoSteps(), childFootprints(holes)];

  // ---- weather & ambience ----
  level.weather.set({ snow: 0.35, fog: 0.018, wind: 0.35 }, true);
  level.ambience = (h) => ({ wind: 0.45 + level.weather.state.wind * 0.4, gale: level.weather.state.snow > 0.8 ? 0.6 : 0, drone: h >= 2 ? 0.15 + (h - 2) * 0.06 : 0, tension: (game.player.threat || 0) > 0.7 ? 0.14 : 0 });
  level.onHour = (h) => {
    if (h === 2) level.weather.set({ snow: 0.6, wind: 0.55, fog: 0.028 });
    if (h === 3) { level.weather.set({ snow: 1, wind: 1, fog: 0.065 }); game.ui.subtitle('The blizzard comes across the lake like a wall.', 4); }
    if (h === 4) level.weather.set({ snow: 0.5, wind: 0.5, fog: 0.03 });
    if (h === 5) { level.weather.set({ snow: 0.3, wind: 0.1, fog: 0.015 }); level.sky.uniforms.uAurora.value = 1; game.ui.subtitle('The wind stops. The sky turns green.', 4); }
  };
  level.onUpdate(() => { if (Math.random() < 0.002) audio.iceCrack(new THREE.Vector3(rand(-80, 80), 0, rand(-80, 80)), 0.35); });
  level.introPath = [
    { pos: new THREE.Vector3(60, 25, -20), look: new THREE.Vector3(0, 0, 40) },
    { pos: new THREE.Vector3(10, 6, 60), look: new THREE.Vector3(0, 1, 82) },
    { pos: new THREE.Vector3(sh.x, 1.7, sh.z + 0.6), look: new THREE.Vector3(sh.x - 0.4, 0, sh.z - 0.5) },
  ];
  level.kit = () => starterKit(game, [['minnow', 2]]);
  void cyl; void toWorld;
  return level;
}

// Small bare footprints appearing next to yours, leading to a hole.
function childFootprints(holes) {
  return {
    id: 'footprints', hours: [2, 6], chance: 0.9,
    run: (game) => {
      const level = game.level, p = game.player;
      const target = holes[Math.floor(Math.random() * holes.length)];
      const mat2 = new THREE.MeshBasicMaterial({ color: 0x4a5a66, transparent: true, opacity: 0.7, depthWrite: false });
      const geo = new THREE.CircleGeometry(0.07, 8); geo.scale(1, 1.8, 1);
      const prints = [];
      const start = new THREE.Vector3(p.pos.x + 1, 0, p.pos.z);
      const dir = new THREE.Vector3(target.x - start.x, 0, target.z - start.z);
      const len = Math.min(60, dir.length()); dir.normalize();
      let i = 0;
      game.ui.subtitle('There are small bare footprints in the frost beside yours.', 4);
      return {
        t: 0,
        update(dt) {
          this.t += dt;
          if (i * 0.7 < len && this.t > i * 0.12) {
            const m = new THREE.Mesh(geo, mat2);
            const side = i % 2 ? 0.12 : -0.12;
            m.position.set(start.x + dir.x * i * 0.7 + dir.z * side, 0.015, start.z + dir.z * i * 0.7 - dir.x * side);
            m.rotation.x = -Math.PI / 2; m.rotation.z = -Math.atan2(dir.x, dir.z);
            level.scene.add(m); prints.push(m); i++;
          }
          return this.t < 90;
        },
        cleanup() { for (const m of prints) level.scene.remove(m); },
      };
    },
  };
}
