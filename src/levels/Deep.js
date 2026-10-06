import * as THREE from 'three';
import { Level } from '../world/Level.js';
import { Noise2D } from '../util/noise.js';
import { grass, rocks, tent, car, mat, box, rowboat } from '../world/Props.js';
import { starterKit, pickup } from './common.js';
import { Angler } from '../monsters/Others.js';
import { DE } from '../systems/DreamEvents.js';
import { makeHumanoid } from '../monsters/Monster.js';
import { makeAlarmClock } from '../fishing/CatchModels.js';
import { audio } from '../engine/Audio.js';
import { rand, pick } from '../util/math.js';
import { N } from '../story/Text.js';

// Night 6 — the bottom of the sea. You should not be able to breathe. Dream logic.
export function buildDeep(game) {
  const level = new Level(game, { fog: 0.055, fogColor: 0x021218, bg: 0x010a0e, waterLevel: 500, bounds: 110, sky: false, hemi: 0.5, hemiSky: 0x2a6a70, hemiGround: 0x020606, moonIntensity: 0.25, moonColor: 0x5a9aa0 });
  level.name = 'deep';
  level.auraColor = 0x9ad8d0;
  level.auraIntensity = 45;
  level.ambientLight = 0.1;
  level.allowDeepWater = true;
  level.underwater = true;
  const n = new Noise2D(66);
  const trench = (x, z) => Math.abs(x - Math.sin(z * 0.03) * 10);
  const height = (x, z) => {
    let h = n.fbm(x * 0.02, z * 0.02, 4) * 2.5 + Math.pow(Math.abs(n.noise(x * 0.05, z * 0.05)), 2) * 3;
    const t = trench(x, z);
    if (t < 14) h = Math.min(h, -Math.pow((14 - t) / 14, 0.6) * 70);
    return h;
  };
  level.makeTerrain({ size: 260, seg: 180, height, color: (x, z, h) => (h < -5 ? [0.02, 0.03, 0.04] : [0.18, 0.2, 0.17]), texKey: 'sand', texBase: [150, 150, 130], repeat: 60 });
  level.surfaceFn = () => 'seabed';
  level.moon.position.set(0, 100, 0);
  level.isFishable = (x, z) => height(x, z) < -10;
  level.waterSurfaceAt = (x, z) => (height(x, z) < -10 ? -1.2 : height(x, z));
  level.fishDepthOverride = () => 999;
  level.verticalFishing = true;
  level.groundCastMsg = 'The line settles on the sand. Cast into the trench — down into the dark.';
  // keep the player out of the trench itself
  const origGround = level.groundAt.bind(level);
  level.groundAt = (x, z, y) => { const g = origGround(x, z, y); if (g.y < -3 && !level.fallInto) g.y = -3; return g; };
  level.onUpdate(() => { const p = game.player.pos; if (height(p.x, p.z) < -3) { const s = Math.sign(p.x - Math.sin(p.z * 0.03) * 10) || 1; p.x = Math.sin(p.z * 0.03) * 10 + s * 11; } });

  // light shafts from far above
  const shaftMat = new THREE.MeshBasicMaterial({ color: 0x6ab8c0, transparent: true, opacity: 0.045, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  for (let i = 0; i < 9; i++) { const s = new THREE.Mesh(new THREE.ConeGeometry(rand(3, 7), 80, 12, 1, true), shaftMat); s.position.set(rand(-90, 90), 35, rand(-90, 90)); s.rotation.z = rand(-0.15, 0.15); level.scene.add(s); }
  // the surface far above: it looks like a ceiling
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ color: 0x1a3a40, transparent: true, opacity: 0.5, fog: false }));
  ceil.rotation.x = Math.PI / 2; ceil.position.y = 60; level.scene.add(ceil);
  const fixture = new THREE.Mesh(new THREE.CircleGeometry(2.5, 20), new THREE.MeshBasicMaterial({ color: 0xd8f0e8, fog: false }));
  fixture.rotation.x = Math.PI / 2; fixture.position.set(0, 59.5, 0); level.scene.add(fixture);

  // kelp & rocks
  grass(level, { count: 1800, area: 105, seed: 61, reeds: true, color: 0x1a3a1c, height: [2.5, 8], accept: (x, z) => height(x, z) > -1 && trench(x, z) > 16 });
  rocks(level, { count: 140, area: 105, seed: 62, color: 0x3a4440, scale: [0.6, 3], accept: (x, z) => trench(x, z) > 15 });

  // ---- things from your life, on the sea floor ----
  const bedG = new THREE.Group(); bedG.position.set(18, height(18, 30), 30); bedG.rotation.set(0.1, 0.6, 0.05);
  box(1.1, 0.4, 2.1, mat('darkwood'), 0, 0.25, 0, bedG); box(1.0, 0.15, 2.0, new THREE.MeshStandardMaterial({ color: 0x5a6a6a, roughness: 1 }), 0, 0.5, 0, bedG);
  box(0.5, 0.6, 0.4, mat('darkwood'), 0.9, 0.3, -0.8, bedG);
  const bedClock = makeAlarmClock(); bedClock.position.set(0.9, 0.72, -0.8); bedClock.scale.setScalar(1.4); bedG.add(bedClock); bedClock.userData.setTime(4, 17);
  level.scene.add(bedG);
  level.addBox(18, 30, 0.6, 1.1, -0.6);
  level.addInteractable({ pos: new THREE.Vector3(18, height(18, 30) + 0.8, 30), radius: 2.5, prompt: 'Your bed', onUse: () => { game.ui.subtitle('Your bed. The sheets move in the current. There is a dent in the pillow where your head should be.', 5); game.player.addFear(0.15); } });
  const doorG = new THREE.Group(); doorG.position.set(-22, height(-22, 40), 40); doorG.rotation.y = 0.4;
  for (const x of [-0.5, 0.5]) box(0.08, 2.1, 0.12, mat('paint'), x, 1.05, 0, doorG);
  box(1.08, 0.08, 0.12, mat('paint'), 0, 2.1, 0, doorG);
  level.scene.add(doorG);
  let doorUses = 0;
  level.addInteractable({ pos: new THREE.Vector3(-22, height(-22, 40) + 1.2, 40), radius: 2, prompt: 'Walk through the door frame', onUse: () => {
    doorUses++;
    const spots = [new THREE.Vector3(60, 0, -50), new THREE.Vector3(-60, 0, -70), new THREE.Vector3(30, 0, 80)];
    const s = spots[doorUses % spots.length];
    game.ui.fade(true, 300).then(() => { game.player.spawn(s, game.player.yaw); game.ui.fade(false, 600); });
    audio.whisper(null, null, 0.3);
    if (doorUses === 1) game.ui.subtitle('It leads somewhere else every time.', 3);
  } });
  car(level, { x: -25, z: -30, rot: 2.2, lightsOn: true, color: 0x3a4a5a });
  tent(level, { x: 26, z: -40, rot: 0.3, color: 'tentRed', name: 'tent' });
  rowboat(level, { x: -40, z: 5, y: height(-40, 5) + 0.3, rot: 1 });
  // decoy alarm clocks scattered on the sand
  for (let i = 0; i < 9; i++) {
    const x = rand(-90, 90), z = rand(-90, 90);
    if (height(x, z) < -1) continue;
    const c = makeAlarmClock(); c.position.set(x, height(x, z) + 0.15, z); c.rotation.set(rand(-0.4, 0.4), rand(0, 6), rand(-0.3, 0.3)); c.userData.setTime(Math.floor(rand(1, 12)), Math.floor(rand(0, 59)));
    level.scene.add(c);
    level.addInteractable({ pos: c.position.clone(), radius: 1.5, prompt: 'Pick up the alarm clock', onUse: () => { game.ui.subtitle(pick(['It is not ticking. It is not the right one.', 'Wrong time. Wrong clock.', 'Silent. The one you want is in the trench.', 'Its hands spin backwards when you touch it.']), 3); } });
  }
  // drowned statues that turn to watch
  const statues = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rand(-0.2, 0.2), r = rand(30, 70);
    const x = Math.cos(a) * r + 25, z = Math.sin(a) * r;
    if (height(x, z) < -1) continue;
    const s = makeHumanoid({ height: rand(1.6, 1.9), thin: 0.85, color: 0x1a2a2a, skin: 0x5a7a78, coat: true, hat: i === 3, eyes: 1, emissiveEyes: 0x6ab8b0 });
    s.root.position.set(x, height(x, z), z); s.root.rotation.y = rand(0, 6);
    level.scene.add(s.root); level.addCircle(x, z, 0.35);
    statues.push(s);
  }
  level.onUpdate(() => { for (const s of statues) { const wp = s.root.position; const want = Math.atan2(game.player.pos.x - wp.x, game.player.pos.z - wp.z) - s.root.rotation.y; let d = want; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; s.neck.rotation.y += (Math.max(-1.3, Math.min(1.3, d)) - s.neck.rotation.y) * 0.02; } });
  // bubbles rising from the player's "breath"
  const bubG = new THREE.SphereGeometry(0.03, 6, 4), bubM = new THREE.MeshBasicMaterial({ color: 0xbfe8f0, transparent: true, opacity: 0.6 });
  const bubbles = [];
  level.onUpdate((dt) => {
    if (Math.random() < dt * 1.5) { const b = new THREE.Mesh(bubG, bubM); b.position.copy(game.camera.position).add(new THREE.Vector3(rand(-0.2, 0.2), -0.1, rand(-0.2, 0.2))); level.scene.add(b); bubbles.push(b); }
    for (const b of [...bubbles]) { b.position.y += dt * 1.6; b.position.x += Math.sin(b.position.y * 3) * dt * 0.2; if (b.position.y > game.camera.position.y + 8) { level.scene.remove(b); bubbles.splice(bubbles.indexOf(b), 1); } }
  });
  pickup(level, { x: 4, z: 6, item: 'lure', qty: 3, label: 'Glow lures' });
  pickup(level, { x: -24, z: -27, item: 'medicine', qty: 1 });
  pickup(level, { x: 25, z: -37, item: 'medicine', qty: 1 });

  // ---- monster ----
  level.monsters = [new Angler(game, { start: { x: -60, z: 60 } })];
  level.fishingSpots = [{ x: 0, z: 0, r: 30, speed: 0.8, boost: { watch: 1.5, relic_bulb: 1.5 } }];
  level.spawn = { x: 17, z: 4, yaw: Math.PI / 2 };
  level.dreams = [DE.whisper(), DE.nameCall(), DE.silence(), DE.objectBehind('clock'), DE.echoSteps(), DE.doppelganger(null), {
    id: 'squeeze', hours: [1.5, 6], chance: 0.9, run: (g) => { const l = `${N()}, squeeze my hand if you can hear me.`; g.ui.subtitle(`(from somewhere above) "${l}"`, 5, 'whisper'); audio.say(l, { pitch: 0.85, rate: 0.85, volume: 0.35 }); return null; },
  }, {
    id: 'mom', hours: [3, 6], chance: 0.9, run: (g) => { const l = `Please come back. Please. I can't lose both of you.`; g.ui.subtitle(`(a woman's voice, far above) "${l}"`, 5, 'whisper'); audio.say(l, { pitch: 1.1, rate: 0.8, volume: 0.35 }); return null; },
  }];
  level.weather.set({ marine: 0.8, fog: 0.055 }, true);
  level.ambience = (h) => ({ underwater: 0.9, drone: 0.25 + h * 0.04, tension: (game.player.threat || 0) > 0.6 ? 0.12 : 0 });
  level.monitor = 0.04;
  level.onHour = (h) => {
    if (h === 2) level.monitor = 0.07;
    if (h === 4) { level.monitor = 0.1; level.weather.set({ fog: 0.07 }); }
  };
  level.introPath = [
    { pos: new THREE.Vector3(17, 50, 4), look: new THREE.Vector3(17, 0, 4) },
    { pos: new THREE.Vector3(17, 12, 6), look: new THREE.Vector3(17, 0, 4) },
    { pos: new THREE.Vector3(17, 1.7, 4), look: new THREE.Vector3(0, -2, 4) },
  ];
  level.kit = () => starterKit(game, [['lure', 1]]);
  return level;
}
