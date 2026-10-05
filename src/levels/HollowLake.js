import * as THREE from 'three';
import { Level } from '../world/Level.js';
import { Water } from '../world/Water.js';
import { Noise2D } from '../util/noise.js';
import { forest, rocks, grass, building, dock, rowboat, tent, car, campfire, note, gravestone, signPost, mat, box, lanternLight } from '../world/Props.js';
import { pickup, closet, bed, table, switchableLamp, starterKit, shoreRadius } from './common.js';
import { Fisherman } from '../monsters/Fisherman.js';
import { Watcher } from '../monsters/Sea.js';
import { DE } from '../systems/DreamEvents.js';
import { makeAlarmClock } from '../fishing/CatchModels.js';
import { audio } from '../engine/Audio.js';
import { drawingTexture, photoTexture } from '../world/Materials.js';
import { RADIO_FUTURE, N } from '../story/Text.js';
import { rand } from '../util/math.js';

// Night 1 — The Forest Lake. Night 7 — the same lake, where it began, and everything is wrong.
export function buildHollowLake(game, final = false) {
  const level = new Level(game, {
    fog: final ? 0.022 : 0.016, fogColor: final ? 0x120808 : 0x0a1016, waterLevel: 0, bounds: 175,
    skyOpts: final ? { top: 0x060203, horizon: 0x1a0806, moonColor: 0xd85a40, cloud: 0.15, moonSize: 0.05 } : { top: 0x02050c, horizon: 0x0c1622, cloud: 0.35 },
    hemi: final ? 0.28 : 0.32, hemiSky: final ? 0x3a2020 : 0x2a3848, moonIntensity: final ? 0.45 : 0.55, moonColor: final ? 0xc07060 : 0x9fb4d0,
  });
  level.name = final ? 'final' : 'forest';
  level.ambientLight = final ? 0.12 : 0.16;
  const n = new Noise2D(final ? 1 : 1);
  const island = { x: 45, z: -45 };
  const bar = [[48, -48], [70, -70]];
  const segDist = (x, z, [a, b]) => { const dx = b[0] - a[0], dz = b[1] - a[1]; const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz))); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); };
  const height = (x, z) => {
    const d = Math.hypot(x, z);
    const ang = Math.atan2(z, x);
    const R = 62 + n.noise(Math.cos(ang) * 1.3, Math.sin(ang) * 1.3) * 9;
    const s = d - R;
    let h;
    if (s > 0) h = 0.3 + Math.min(7, s * 0.06) + n.fbm(x * 0.02, z * 0.02, 3) * 3 * Math.min(1, s / 30);
    else { const k = -s; h = 0.3 - Math.min(9.5, k * 0.17 + Math.pow(k, 1.35) * 0.02); }
    const di = Math.hypot(x - island.x, z - island.z);
    if (di < 11) h = Math.max(h, 0.7 - di * di * 0.009);
    const sb = segDist(x, z, bar);
    if (sb < 3) h = Math.max(h, -0.55 - sb * 0.05);
    return h;
  };
  level.makeTerrain({
    size: 420, seg: 210, height,
    color: (x, z, h) => {
      if (h < -0.2) return [0.16, 0.15, 0.12];
      if (h < 0.6) return final ? [0.2, 0.16, 0.13] : [0.28, 0.25, 0.19];
      const v = n.noise(x * 0.05, z * 0.05) * 0.04;
      return final ? [0.13 + v, 0.11, 0.09] : [0.11 + v, 0.15 + v, 0.09];
    },
    texKey: 'forestground', texBase: [140, 140, 130],
  });
  level.surfaceFn = (x, z, h) => (h < 0.6 ? 'sand' : 'grass');
  const water = level.addWater(new Water({ size: 420, level: 0, color: final ? 0x120a08 : 0x0a1418, deep: 0x020406 }));
  if (final) water.uniforms.uStill.value = 0.7;
  level.lakeWater = water;

  // ---- shore landmarks ----
  const Rs = shoreRadius(level, Math.PI / 2), Re = shoreRadius(level, 0), Rw = shoreRadius(level, Math.PI), Rn = shoreRadius(level, -Math.PI / 2);
  const dockInfo = dock(level, { x: 0, z: Rs + 3, rot: 0, length: 16, top: 0.75 });
  const carApi = car(level, { x: -3, z: Rs + 15, rot: 0.15, lightsOn: false });
  const fire = campfire(level, { x: 5, z: Rs + 9 });
  if (final) fire.setLit(false);
  // ranger board
  signPost(level, { x: 10, z: Rs + 18, rot: -0.4, text: final ? 'HOLLOW LAKE — CLOSED' : 'HOLLOW LAKE' });
  const board = new THREE.Group(); board.position.set(14, level.heightAt(14, Rs + 14), Rs + 14); board.rotation.y = -0.6;
  box(2.2, 1.4, 0.08, 'darkwood', 0, 1.5, 0, board); box(0.1, 2.2, 0.1, 'darkwood', -1, 1.1, 0, board); box(0.1, 2.2, 0.1, 'darkwood', 1, 1.1, 0, board);
  level.scene.add(board);
  const bx = (lx) => [14 + Math.cos(-0.6) * lx, Rs + 14 - Math.sin(-0.6) * lx];
  const [p1x, p1z] = bx(-0.5);
  let posterReads = 0;
  note(level, {
    x: p1x, y: board.position.y + 1.5, z: p1z + 0.06, rotY: -0.6, title: 'MISSING', w: 0.6, h: 0.8,
    lines: final ? ['MARA PELL, AGE 9', 'LAST SEEN 4:00 A.M.', `BY ${N().toUpperCase()}`, 'WHO WAS ASLEEP'] : ['MARA PELL, AGE 9', 'Last seen at Hollow Lake, north shore campsite.', 'Yellow raincoat. Yellow hair ribbon.', 'Call the Sheriff\'s office. Any time. Please.'],
    opts: { bg: '#e8e4d0', titleSize: 64, align: 'center', image: (g, x, y, w, h) => { g.fillStyle = '#8a8270'; g.fillRect(x + w * 0.25, y, w * 0.5, h); g.fillStyle = '#e8e4d0'; for (let i = 0; i < 30; i++) g.fillRect(x + w * 0.25 + Math.random() * w * 0.5, y + Math.random() * h * 0.6, 8, 3); } },
    onRead: () => {
      posterReads++;
      if (posterReads === 2 && !final) { game.ui.subtitle('Wasn\'t the photo torn before? It isn\'t now. She is smiling.', 4); game.player.addFear(0.1); }
    },
    journal: final ? null : { id: 'poster', title: 'Missing poster', text: 'MARA PELL, AGE 9. Last seen at Hollow Lake, north shore campsite. Yellow raincoat. Yellow hair ribbon. The photo has been torn away.' },
  });
  const [p2x, p2z] = bx(0.55);
  note(level, { x: p2x, y: board.position.y + 1.55, z: p2z + 0.06, rotY: -0.6, title: 'NOTICE', w: 0.55, h: 0.7, lines: ['NO NIGHT FISHING', 'Lake closed sunset to sunrise by order of the County.', 'Ice unsafe in winter. Strong undertow at the north landing.', 'Remember: someone is always watching the water.'], opts: { bg: '#d8d0a8' } });

  // East: fishing cabin
  const cabin = building(level, { x: Re + 14, z: -4, rot: 0, w: 6, d: 5, doors: [{ side: 'w', at: 0.6, width: 1.1 }], windows: [{ side: 'w', at: -1.4 }, { side: 'n', at: 0 }], lit: !final });
  closet(level, cabin, { lx: 2.4, lz: -1.8, rot: -Math.PI / 2 });
  bed(level, cabin, { lx: 1.6, lz: 1.2, rot: 0 });
  const tbl = table(level, cabin, { lx: -1, lz: -1.4 });
  const cabinLamp = switchableLamp(level, { x: tbl.x, y: tbl.top + 0.12, z: tbl.z, on: !final, label: 'cabin lamp' });
  void cabinLamp;
  pickup(level, { x: tbl.x + 0.3, z: tbl.z + 0.1, y: tbl.top, item: 'medicine', qty: 1 });
  pickup(level, { x: Re + 11.5, z: -2, item: 'minnow', qty: 6, label: 'Minnow bucket' });
  note(level, { x: tbl.x - 0.3, y: tbl.top + 0.01, z: tbl.z, standalone: true, title: 'Fishing log', w: 0.3, h: 0.36,
    lines: final ? ['Oct 14. Same night. Always the same night.', 'I set the clock for four.', 'I always set the clock for four.'] : ['Oct 12 — perch off the dock, 6. Bass x2.', 'Oct 13 — took the kids out. Mara caught her first. Wouldn\'t stop talking about "the big one."', `Oct 14 — camping on the north shore. ${N()} is on alarm duty. 4 AM sharp. Big one's mine.`],
    journal: { id: 'log' + (final ? 'f' : ''), title: final ? 'Fishing log (again)' : "Dad's fishing log", text: final ? 'Oct 14. Same night. Always the same night. I set the clock for four.' : `Oct 12 — perch off the dock, 6. Bass x2.\nOct 13 — took the kids out. Mara caught her first. Wouldn't stop talking about "the big one."\nOct 14 — camping on the north shore. ${N()} is on alarm duty. 4 AM sharp. Big one's mine.` } });

  // West: boathouse (locked; key is inside a fish)
  const bh = building(level, { x: -(Rw + 8), z: 10, rot: 0, w: 7, d: 6, h: 3.2, wall: 'darkwood', doors: [{ side: 'e', at: 0, width: 1.2, locked: final ? null : { key: 'key_boathouse', msg: 'Padlocked. The sign says BOATHOUSE. The lock looks like it has been underwater.', hint: 'needs a key' } }], windows: [{ side: 'n', at: 0 }] });
  rowboat(level, { x: -(Rw + 8), z: 10.5, y: bh.baseY + 0.05, rot: Math.PI / 2 });
  closet(level, bh, { lx: -2.9, lz: -2.2, rot: Math.PI / 2, name: 'tool locker' });
  pickup(level, { x: -(Rw + 6), z: 8, item: 'line', qty: 2 });
  pickup(level, { x: -(Rw + 10), z: 12, item: 'lure', qty: 2 });
  {
    // the photograph on the wall
    const ph = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.38), new THREE.MeshStandardMaterial({ map: photoTexture(final ? 'family' : 'lake', 'opening day') }));
    const [wx, wz] = bh.local(-3.4, 0.5);
    ph.position.set(wx + 0.05, bh.baseY + 1.6, wz); ph.rotation.y = Math.PI / 2;
    level.scene.add(ph);
    level.addInteractable({ pos: ph.position, radius: 1.8, prompt: 'Look at the photograph', onUse: () => game.story.addMemory('three_on_dock'), cond: () => !game.story.memories.has('three_on_dock') });
  }

  // North: the old campsite (where it happened)
  const camp = { x: 4, z: -(Rn + 12) };
  const tnt = tent(level, { x: camp.x, z: camp.z, rot: Math.PI, color: final ? 'tentRed' : 'fabric', name: 'old tent' });
  void tnt;
  const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.42, 0.55, 10), mat('bark'));
  stump.position.set(camp.x + 2.4, level.heightAt(camp.x + 2.4, camp.z + 1.6) + 0.27, camp.z + 1.6); stump.castShadow = true;
  level.scene.add(stump);
  level.addCircle(stump.position.x, stump.position.z, 0.4, { occlude: false, y1: stump.position.y + 0.3 });
  const deadLantern = lanternLight(level, { x: camp.x - 1.6, y: level.heightAt(camp.x - 1.6, camp.z + 1.4) + 0.12, z: camp.z + 1.4, intensity: 2.5, radius: 5 });
  deadLantern.setOn(false);
  // crayon drawing
  const drawing = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.32), new THREE.MeshStandardMaterial({ map: drawingTexture(final ? 'clock' : 'fish'), side: THREE.DoubleSide }));
  drawing.rotation.x = -Math.PI / 2; drawing.rotation.z = 0.4;
  drawing.position.set(camp.x + 0.6, level.heightAt(camp.x + 0.6, camp.z + 2.2) + 0.03, camp.z + 2.2);
  level.scene.add(drawing);
  level.addInteractable({ pos: drawing.position, radius: 1.6, prompt: "Pick up the child's drawing", onUse: () => { game.ui.showDocument({ title: "A child's drawing", text: final ? `A clock. Hands at four. "WAKE UP ${N().toUpperCase()}" in red crayon, pressed so hard it tore the paper.` : `An orange fish, a blue wave, and in red crayon: "ME + ${N().toUpperCase()}". The crayon is still waxy. It was drawn recently.` }); game.story.addJournal({ id: 'drawing' + (final ? 'f' : ''), title: "A child's drawing", text: final ? `WAKE UP ${N().toUpperCase()}` : `An orange fish. "ME + ${N().toUpperCase()}".` }); } });
  // two sleeping bags (one small)
  for (const [ox, sc, col] of [[-0.4, 1, 0x3a4a6a], [0.45, 0.7, 0xd8b020]]) {
    const sb = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.4 * sc, 4, 8), new THREE.MeshStandardMaterial({ color: col, roughness: 1 }));
    sb.rotation.x = Math.PI / 2; sb.position.set(camp.x + ox, level.heightAt(camp.x, camp.z) + 0.18, camp.z - 0.1);
    level.scene.add(sb);
  }

  // NE: the small cemetery in the woods (secret area)
  const cem = { x: 72, z: -92 };
  gravestone(level, { x: cem.x, z: cem.z, text: 'WALTER PELL\n1961 – 2012\n"Gone fishing"', tilt: 0.05 });
  gravestone(level, { x: cem.x + 2, z: cem.z + 0.3, text: final ? 'MARA PELL\n2002 – 2011\n"Five more minutes"' : 'MARA PELL\n2002 – 2011\n"Our little fisher"', tilt: -0.04 });
  gravestone(level, { x: cem.x - 2.5, z: cem.z + 1.5, text: '', tilt: 0.2 });
  gravestone(level, { x: cem.x + 4.5, z: cem.z - 1, text: '', tilt: -0.15 });
  level.addInteractable({ pos: new THREE.Vector3(cem.x + 1, level.heightAt(cem.x, cem.z) + 0.8, cem.z + 0.6), radius: 2.5, prompt: 'Read the gravestones', onUse: () => { game.ui.showDocument({ title: 'Two gravestones, side by side', text: final ? `WALTER PELL, 1961 – 2012. "Gone fishing."\n\nMARA PELL, 2002 – 2011. "Five more minutes."\n\nSomeone has left a brass alarm clock on Mara's grave. It reads 4:17.` : `WALTER PELL, 1961 – 2012. "Gone fishing."\n\nMARA PELL, 2002 – 2011. "Our little fisher."\n\nYou don't remember walking here. You knew exactly where it was.` }); game.story.addJournal({ id: 'graves', title: 'The cemetery in the woods', text: 'Walter Pell, 1961 – 2012. Mara Pell, 2002 – 2011. Side by side in the woods above Hollow Lake.' }); game.player.addFear(0.1); } });
  if (final) { const c = makeAlarmClock(); c.position.set(cem.x + 2, level.heightAt(cem.x + 2, cem.z + 0.6) + 0.12, cem.z + 0.6); level.scene.add(c); c.userData.setTime(4, 17); }
  lanternLight(level, { x: cem.x + 1, y: level.heightAt(cem.x + 1, cem.z + 1) + 0.15, z: cem.z + 1.2, intensity: 1.2, radius: 3, color: 0xff9050, flicker: 0.5 });

  // scattered supplies
  pickup(level, { x: 3, z: Rs + 4, item: 'worm', qty: 6, label: 'Bait box' });
  pickup(level, { x: island.x + 1, z: island.z + 2, item: 'lure', qty: 1, label: 'Tackle box' });
  pickup(level, { x: camp.x - 2.5, z: camp.z - 2, item: 'battery', qty: 1 });
  pickup(level, { x: -40, z: Rs + 25, item: 'battery', qty: 1 });
  pickup(level, { x: 40, z: Rs + 12, item: 'worm', qty: 4, label: 'Bait box' });
  // glovebox
  let glove = false;
  level.addInteractable({ pos: new THREE.Vector3(carApi.group.position.x + 0.9, carApi.group.position.y + 1, carApi.group.position.z - 0.8), radius: 1.5, prompt: 'Open the glovebox', cond: () => !glove, onUse: () => { glove = true; game.inventory.add('battery', 2); game.ui.toast('Under the batteries: a hospital parking stub. St. Agnes. Dated this week.'); game.story.addJournal({ id: 'stub', title: 'Parking stub', text: 'St. Agnes Hospital — visitor parking. Dated this week. You have not been to a hospital.' }); } });
  // car radio: conversations that haven't happened yet
  let radioOn = false, radioIdx = 0;
  level.addInteractable({
    pos: new THREE.Vector3(carApi.group.position.x - 0.2, carApi.group.position.y + 1.2, carApi.group.position.z - 0.5), radius: 2.2, prompt: () => (radioOn ? 'Turn off the radio' : 'Turn on the car radio'),
    onUse: () => {
      radioOn = !radioOn;
      if (!radioOn) { audio.stopSpeech(); return; }
      audio.radioStatic(2.5, 0.12);
      const lines = RADIO_FUTURE();
      const line = lines[radioIdx % lines.length]; radioIdx++;
      setTimeout(() => { if (!radioOn) return; game.ui.subtitle(`(the radio, through static) "${line}"`, 5, 'whisper'); audio.say(line, { pitch: 0.8, rate: 0.9, volume: 0.4 }); audio.radioStatic(4, 0.06); }, 1800);
      setTimeout(() => { radioOn = false; }, 9000);
      if (radioIdx === 1) game.story.addJournal({ id: 'radio', title: 'The car radio', text: 'A voice through the static, talking to you by name. A doctor. A hospital called St. Agnes. "You were in the water a very long time."' });
      game.noise.emit(carApi.group.position, 12, 'radio');
    },
  });
  // car headlights toggle (a light you can make — and be seen by)
  let lightsOn = false;
  level.addInteractable({ pos: new THREE.Vector3(carApi.group.position.x - 0.9, carApi.group.position.y + 1, carApi.group.position.z - 1.6), radius: 1.6, prompt: () => (lightsOn ? 'Switch off headlights' : 'Switch on headlights'), onUse: () => { lightsOn = !lightsOn; carApi.setLights(lightsOn); audio.click(0.3); } });

  // ---- vegetation ----
  const q = level.quality;
  const notNear = (x, z, pts, r) => pts.every(([px, pz]) => Math.hypot(x - px, z - pz) > r);
  const clear = [[0, Rs + 10], [Re + 14, -4], [-(Rw + 8), 10], [camp.x, camp.z], [cem.x, cem.z], [14, Rs + 14]];
  forest(level, { count: Math.floor(1100 * q.treeDensity), area: 200, seed: 7, kind: final ? 'dead' : 'pine', accept: (x, z) => height(x, z) > 1.1 && notNear(x, z, clear, 9) && Math.hypot(x, z) > 72 });
  forest(level, { count: 18, area: 12, cx: island.x, cz: island.z, seed: 9, kind: final ? 'dead' : 'pine', scale: [0.5, 0.9], accept: (x, z) => height(x, z) > 0.4 });
  rocks(level, { count: 160, area: 190, seed: 3, accept: (x, z) => height(x, z) > 0.2 && notNear(x, z, clear, 6) });
  if (q.grass) grass(level, { count: 5000, area: 120, seed: 5, color: final ? 0x2a2018 : 0x26341e, accept: (x, z) => { const h = height(x, z); return h > 0.35 && h < 4 && notNear(x, z, clear, 3); } });
  grass(level, { count: 1500, area: 85, seed: 6, reeds: true, color: 0x3a3a22, height: [0.8, 1.6], accept: (x, z) => { const h = height(x, z); return h > -0.6 && h < 0.4; } });

  // ---- fishing spots ----
  level.fishingSpots = [
    { x: island.x, z: island.z, r: 16, speed: 0.75, boost: { pike: 2, bloated_pike: 1.5, relic_hat: 3, catfish: 1.5 } },
    { x: 0, z: Rs - 14, r: 10, speed: 0.9 },
  ];
  level.scriptedCatch = ({ ns }) => (!final && ns.catches === 0 && !game.story.caught.has('first_perch') ? (game.story.caught.add('first_perch'), 'perch') : null);
  level.alarmMult = final ? 2.2 : 1;
  level.spawn = { x: 1.5, z: Rs + 6, yaw: 0 };
  level.campfire = fire;

  // ---- monsters ----
  const ring = [];
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; const r = shoreRadius(level, a) + 9; ring.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)); }
  const sightings = [];
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; const r = shoreRadius(level, a) - 2.5; sightings.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)); }
  const fisherman = new Fisherman(game, {
    waypoints: ring, sightingSpots: sightings, lakeCenter: new THREE.Vector3(0, 0, 0), noHat: game.story.relics.has('relic_hat'),
    schedule: final ? { evidence: 0, glimpse: 0.6, sighting: 1.5, stalk: 2.5, hunt: 4.5 } : { evidence: 1, glimpse: 2, sighting: 3, stalk: 4, hunt: 5 },
    onHatDrop: (p) => { if (!game.story.relics.has('relic_hat') && !game.story.caught.has('relic_hat')) { const sx = p.x * 1.08, sz = p.z * 1.08; pickup(level, { x: sx, z: sz, item: 'relic_hat', model: 'hat', label: 'the waterlogged hat', onTake: () => { if (game.inventory.add('relic_hat', 1, null)) { game.story.caught.add('relic_hat'); game.ui.subtitle('It is still warm from his head.', 4); } } }); } },
  });
  level.monsters = [fisherman];
  level.fisherman = fisherman;
  if (final) {
    level.watcher = new Watcher(game, { getAnchor: () => game.player.pos, startDist: 140, rate: 3, looksLikePlayer: true, water });
    level.monsters.push(level.watcher);
  }

  // ---- dream events ----
  const farShore = sightings;
  level.dreams = [
    DE.moonJump(), DE.vanishingLight(farShore.slice(0, 6)), DE.phantomBoat({ x: 0, z: 0 }, 40), DE.whisper(), DE.echoSteps(),
    DE.doppelganger(farShore.map((p) => new THREE.Vector3(p.x * 1.1, 0, p.z * 1.1))), DE.objectBehind('clock'), DE.nameCall(),
    DE.reflectionFigure((g) => { const p = g.player.pos; const right = new THREE.Vector3(Math.cos(g.player.yaw), 0, -Math.sin(g.player.yaw)); return new THREE.Vector3(p.x + right.x * 1.2, p.y, p.z + right.z * 1.2); }, { child: true, hours: [3.5, 6] }),
  ];
  if (final) level.dreams.push(DE.redMoon(), DE.eclipse(), DE.silence(), DE.facesInWater());

  // ---- weather & ambience per hour ----
  level.weather.set({ fog: final ? 0.022 : 0.012, wind: 0.25, rain: 0 }, true);
  level.ambience = (h) => ({
    wind: 0.25 + h * 0.04, water: 0.35, crickets: final ? 0 : Math.max(0, 0.22 - (game.player.threat || 0) * 0.3 - (h >= 4 ? 0.12 : 0)),
    drone: final ? 0.35 : h >= 3 ? 0.18 + (h - 3) * 0.08 : 0, tension: (game.player.threat || 0) > 0.6 ? 0.12 : 0, rain: level.weather.state.rain * 0.8,
  });
  level.onHour = (h) => {
    if (h === 2) level.weather.set({ fog: final ? 0.03 : 0.022 });
    if (h === 3) { level.weather.set({ fog: final ? 0.035 : 0.035, wind: 0.4 }); if (!final) fire.setLit(Math.random() < 0.5 ? false : fire.lit); }
    if (h === 5) level.weather.set({ rain: final ? 0 : 0.45, fog: 0.04 });
    if (final && h === 4) level.finalTentAlarm();
    if (final && h === 2 && level.watcher) level.watcher.activate();
  };
  // moon moves "incorrectly": on Night 1 it slowly rises in the west
  level.onUpdate((dt) => { if (level.sky && !final) level.sky.setMoonAngles(level.sky.azimuth + dt * 0.0006, level.sky.elevation); });
  level.introPath = [
    { pos: new THREE.Vector3(-60, 14, -40), look: new THREE.Vector3(0, 0, 20) },
    { pos: new THREE.Vector3(-10, 6, Rs - 20), look: new THREE.Vector3(0, 1, Rs + 6) },
    { pos: new THREE.Vector3(1.5, 1.7, Rs + 7), look: new THREE.Vector3(0, 1.2, Rs - 8) },
  ];
  level.kit = () => starterKit(game, final ? [['memento', 2], ['minnow', 4]] : []);

  // ---- final night specifics ----
  if (final) setupFinal(game, level, { camp, stump, water, deadLantern });
  void rand;
  return level;
}

function setupFinal(game, level, { camp, stump, water, deadLantern }) {
  // the brass clock on the stump, set for 4:00
  const clock = makeAlarmClock();
  clock.position.set(stump.position.x, stump.position.y + 0.42, stump.position.z);
  clock.rotation.y = 0.6;
  level.scene.add(clock);
  clock.userData.setTime(12, 0);
  level.onUpdate(() => { const h = game.time.hour; clock.userData.setTime(Math.floor(h) || 12, Math.floor((h % 1) * 60)); });
  // the rowboat drifting in the middle of the lake
  const boat = rowboat(level, { x: 0, z: 0, rot: 0.8 });
  const lamp = new THREE.PointLight(0xffd070, 2.5, 10, 1.6); lamp.position.set(0, 1.0, 0.6); boat.add(lamp);
  const lampGlow = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe0a0 })); lampGlow.position.copy(lamp.position); boat.add(lampGlow);
  level.onUpdate(() => { boat.position.y = -0.15 + Math.sin(game.time.now * 0.5) * 0.02; boat.rotation.y += 0.0005; });
  level.finalBoat = boat;
  let ringing = false, ringT = 0, touched = false;
  level.finalTentAlarm = () => {
    ringing = true; ringT = 0;
    deadLantern.setOn(true);
    game.ui.subtitle('Across the lake, at the old campsite, an alarm clock starts ringing.', 5);
    audio.say(`${N()}. ${N()}, it's four. Come on.`, { pitch: 1.7, rate: 0.85, volume: 0.35 });
  };
  level.addInteractable({
    pos: clock.position, radius: 1.6, prompt: () => (ringing ? 'Turn it off' : 'The brass alarm clock'), cond: () => true,
    onUse: () => {
      if (!ringing) { game.ui.subtitle('It is set for 4:00. It is always set for 4:00.', 3); return; }
      touched = true; ringing = false;
      game.story.flags.turnedOffTent = true;
      audio.silenceAll(0.05);
      game.ui.subtitle('Click.', 2);
      setTimeout(() => game.finishGame('off'), 2500);
    },
  });
  level.onUpdate((dt) => {
    if (!ringing) return;
    ringT += dt;
    if (Math.floor(ringT * 1.2) !== Math.floor((ringT - dt) * 1.2)) audio.alarm(0.8, { pos: clock.position, vol: 0.5 });
    clock.rotation.z = Math.sin(ringT * 60) * 0.05;
    if (ringT > 60 && !touched) {
      ringing = false;
      game.story.flags.letTentRing = true;
      game.ui.subtitle('The ringing stops on its own. You let it ring this time.', 5);
      audio.motif('clean', 0.15);
      level.forceRibbon = true;
    }
  });
  level.scriptedCatch = () => (level.forceRibbon && !game.story.memories.has('ribbon') ? (level.forceRibbon = false, 'ribbon') : null);
  // walking on water to the rowboat (secret) once the alarm is caught
  level.enableWaterWalk = () => {
    level.allowDeepWater = true;
    level.addPlatform(0, 0, 70, 70, 0, 0.02, 'water');
    water.uniforms.uStill.value = 1;
    level.addInteractable({ pos: new THREE.Vector3(0, 0.8, 0), radius: 2.5, wide: true, prompt: 'Sit down in the boat with her', onUse: () => game.finishGame('boat'), cond: () => game.story.memories.has('ribbon') });
  };
  level.camp = camp;
}
