import * as THREE from 'three';
import { Level } from '../world/Level.js';
import { Water } from '../world/Water.js';
import { Noise2D } from '../util/noise.js';
import { building, container, mat, box, cyl, note, lanternLight, toWorld } from '../world/Props.js';
import { pickup, closet, table, starterKit } from './common.js';
import { Dockhand } from '../monsters/Others.js';
import { DE } from '../systems/DreamEvents.js';
import { makeHumanoid } from '../monsters/Monster.js';
import { audio } from '../engine/Audio.js';
import { rand, inView } from '../util/math.js';
import { rustTexture } from '../world/Materials.js';

// Night 4 — a fog-drowned industrial harbor. Blind things that hunt by sound.
export function buildHarbor(game) {
  const level = new Level(game, {
    fog: 0.045, fogColor: 0x10141a, waterLevel: 0, bounds: 130,
    skyOpts: { top: 0x05070a, horizon: 0x161c22, cloud: 0.8, stars: 0.2 },
    hemi: 0.3, hemiSky: 0x303844, moonIntensity: 0.3,
  });
  level.name = 'harbor';
  level.ambientLight = 0.12;
  const n = new Noise2D(44);
  const Q = 1.6; // quay height
  const height = (x, z) => (z > 0 ? Q + n.noise(x * 0.05, z * 0.05) * 0.03 : -6 + n.noise(x * 0.03, z * 0.03) * 1.5);
  level.makeTerrain({ size: 300, seg: 150, height, color: (x, z, h) => (h > 0 ? [0.32, 0.32, 0.31] : [0.08, 0.08, 0.07]), texKey: 'asphalt', texBase: [110, 110, 108], repeat: 70, roughness: 0.85 });
  level.surfaceFn = () => 'grass';
  const water = level.addWater(new Water({ size: 300, level: 0, color: 0x0a0f10, deep: 0x020304 }));
  void water;
  // quay wall
  const wall = box(300, Q + 6, 0.6, mat('concrete'), 0, (Q - 6) / 2, -0.3, level.scene); wall.castShadow = false;

  // ---- piers ----
  const piers = [{ x: -40, len: 40 }, { x: 0, len: 28 }, { x: 45, len: 36 }];
  const pierMat = mat('plank');
  for (const p of piers) {
    const deck = box(4, 0.2, p.len, pierMat, p.x, Q - 0.1, -p.len / 2, level.scene);
    deck.castShadow = false;
    for (let z = 0; z < p.len; z += 4) for (const s of [-1.8, 1.8]) cyl(0.15, 0.18, 9, 'darkwood', p.x + s, Q - 4.5, -z, level.scene, 6);
    level.addPlatform(p.x, -p.len / 2, 2, p.len / 2, 0, Q, 'wood');
  }
  // breakwater to the lighthouse
  const bw = { x: 85, len: 85 };
  box(5, 2.5, bw.len, mat('concrete'), bw.x, Q - 1.25, -bw.len / 2, level.scene);
  level.addPlatform(bw.x, -bw.len / 2, 2.5, bw.len / 2, 0, Q, 'grass');
  const lhx = bw.x, lhz = -bw.len - 3;
  const lhGroup = new THREE.Group(); lhGroup.position.set(lhx, Q, lhz);
  cyl(2.2, 3, 14, new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.8 }), 0, 7, 0, lhGroup, 16);
  cyl(1.6, 1.6, 2, mat('glass'), 0, 15, 0, lhGroup, 12);
  level.scene.add(lhGroup);
  level.addPlatform(lhx, lhz, 4, 4, 0, Q, 'grass');
  level.addCircle(lhx, lhz, 3, { occlude: true });
  const beam = new THREE.SpotLight(0xfff4d0, 120, 160, 0.12, 0.5, 1.2);
  beam.position.set(lhx, Q + 15, lhz);
  const beamT = new THREE.Object3D(); level.scene.add(beamT); beam.target = beamT;
  level.scene.add(beam);
  const beamCone = new THREE.Mesh(new THREE.ConeGeometry(6, 60, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  level.scene.add(beamCone);
  level.onUpdate(() => {
    const a = game.time.now * 0.5;
    beamT.position.set(lhx + Math.cos(a) * 60, 0, lhz + Math.sin(a) * 60);
    beamCone.position.set(lhx + Math.cos(a) * 30, Q + 15, lhz + Math.sin(a) * 30);
    beamCone.lookAt(lhx, Q + 15, lhz); beamCone.rotateX(Math.PI / 2);
  });
  lanternLight(level, { x: lhx + 3, y: Q + 2.5, z: lhz + 3, intensity: 3, radius: 7, flicker: 0.1 });

  // ---- warehouses & office ----
  const w1 = building(level, { x: -45, z: 32, w: 22, d: 14, h: 7, wall: 'rust', roof: 'roof', doors: [{ side: 's', at: -4, width: 4, noDoor: true }, { side: 'e', at: 3, width: 1.2 }], windows: [], floorY: Q });
  const w2 = building(level, { x: 25, z: 36, w: 18, d: 12, h: 7, wall: 'rust', roof: 'roof', doors: [{ side: 's', at: 3, width: 4, noDoor: true }, { side: 'w', at: -2, width: 1.2 }], floorY: Q });
  const office = building(level, { x: 62, z: 14, w: 6, d: 5, h: 3, wall: 'paint', doors: [{ side: 's', at: 1.2, width: 1.1, locked: { key: 'key_office', msg: 'HARBORMASTER — PRIVATE. Locked tight.', hint: 'needs a key' } }], windows: [{ side: 's', at: -1.2 }], floorY: Q, lit: true });
  const ot = table(level, office, { lx: -1, lz: -1.2 });
  level.addInteractable({ pos: new THREE.Vector3(ot.x, ot.top + 0.1, ot.z), radius: 1.8, prompt: 'Read the pinned newspaper clipping', cond: () => !game.story.memories.has('clipping'), onUse: () => game.story.addMemory('clipping') });
  pickup(level, { x: ot.x + 0.4, z: ot.z, y: ot.top, item: 'medicine', qty: 1 });
  closet(level, office, { lx: 2.4, lz: -1.7, rot: -Math.PI / 2, name: 'filing cabinet' });
  lanternLight(level, { x: office.local(0, 0)[0], y: Q + 2.6, z: office.local(0, 0)[1], intensity: 2.5, radius: 4, flicker: 0.35 });
  // warehouse interiors: crates, shelves, a hiding place
  for (const [b, list] of [[w1, [[-6, -3], [-3, 2], [4, -4], [7, 3]]], [w2, [[-5, -2], [2, 3], [5, -3]]]]) {
    for (const [lx, lz] of list) {
      const [x, z] = b.local(lx, lz);
      const s = rand(1.2, 2);
      box(s, s, s, mat('wood'), x, Q + s / 2, z, level.scene);
      level.addBox(x, z, s / 2, s / 2, 0, { y0: Q - 1, y1: Q + s });
    }
  }
  closet(level, w1, { lx: 10.3, lz: -5.5, rot: -Math.PI / 2, name: 'locker' });
  closet(level, w2, { lx: -8.3, lz: -4.5, rot: Math.PI / 2, name: 'locker' });
  {
    const [kx, kz] = w2.local(7.5, -5.2);
    pickup(level, { x: kx, z: kz, y: Q + 1.1, item: 'key_office', model: 'key', label: 'Harbormaster key (on a hook)', onTake: () => { if (game.inventory.add('key_office', 1)) game.story.caught.add('office_key'); } });
  }
  note(level, { x: w1.local(0, -6.9)[0], y: Q + 1.7, z: w1.local(0, -6.9)[1], rotY: 0, title: 'SHIFT BOARD', w: 1.2, h: 0.8, lines: ['NIGHT CREW: DO NOT RUN ON THE DOCKS.', 'Do not drop tools. Do not shout.', 'If you hear clicking: stop. Crouch. Wait.', 'They cannot see. They are always listening.'], opts: { bg: '#2a2e2a', fg: '#d8d8c8' }, journal: { id: 'shift', title: 'Shift board', text: 'NIGHT CREW: DO NOT RUN ON THE DOCKS. Do not drop tools. Do not shout. If you hear clicking: stop. Crouch. Wait. They cannot see. They are always listening.' } });

  // ---- containers ----
  const cols = [0x7a2a1c, 0x1c4a6a, 0x3a5a2a, 0x8a6a1a];
  let ci = 0;
  for (const [x, z, r, open] of [[-12, 12, 0, true], [-8, 12, 0, false], [-4, 12, 0, true], [8, 18, Math.PI / 2, false], [8, 11, Math.PI / 2, true], [-70, 15, 0.1, true], [70, 30, Math.PI / 2, false], [40, 12, 0, true]]) {
    container(level, { x, z, rot: r, color: cols[ci++ % cols.length], open });
  }
  // crane
  const crane = new THREE.Group(); crane.position.set(-20, Q, 3);
  const rust = new THREE.MeshStandardMaterial({ color: 0x8a5a1a, map: rustTexture(), roughness: 0.7, metalness: 0.4 });
  for (const [x, z] of [[-3, -2], [3, -2], [-3, 2], [3, 2]]) box(0.5, 18, 0.5, rust, x, 9, z, crane);
  box(7, 1, 5, rust, 0, 18, 0, crane); box(1.2, 1.2, 32, rust, 0, 19, -8, crane);
  level.scene.add(crane);
  for (const [x, z] of [[-23, 1], [-17, 1], [-23, 5], [-17, 5]]) level.addBox(x, z, 0.3, 0.3, 0);
  // moored boats (hide in the wheelhouse)
  for (const [x, z, flip] of [[-35.5, -18, 1], [50, -22, -1]]) {
    const b = new THREE.Group(); b.position.set(x + flip * 3.4, -0.2, z);
    const hull = box(3, 2, 10, new THREE.MeshStandardMaterial({ color: 0x2a3a40, roughness: 0.7 }), 0, 0, 0, b);
    void hull;
    box(2.4, 2, 3, mat('paint'), 0, 2, -1, b);
    b.rotation.z = flip * 0.06;
    level.scene.add(b);
    level.addBox(x + flip * 3.4, z, 1.5, 5, 0, { y0: -3, y1: 3 });
    level.addHideSpot({ name: 'wheelhouse', kind: 'boat', pos: new THREE.Vector3(x + flip * 1.8, Q + 0.8, z - 1), view: new THREE.Vector3(x + flip * 3.4, Q + 1.2, z - 1), yaw: flip > 0 ? -Math.PI / 2 : Math.PI / 2, exit: new THREE.Vector3(x, Q, z - 1), searchable: true, lookLimit: 0.9 });
  }
  // streetlamps
  for (let x = -70; x <= 70; x += 20) {
    const flick = Math.random() < 0.5 ? 0.6 : 0.05;
    const l = lanternLight(level, { x, y: Q + 4.2, z: 5, intensity: 5, dist: 14, radius: 6, post: false, flicker: flick, color: 0xffc88a });
    cyl(0.08, 0.1, 4.4, 'metal', x, Q + 2, 5, level.scene, 6);
    level.addCircle(x, 5, 0.15, { occlude: false });
    if (Math.random() < 0.3) l.setOn(false);
  }
  // pickups
  for (const [x, z] of [[-30, 8], [10, 6], [35, 22], [-60, 25], [55, 8], [-5, -20], [-40, -30]]) pickup(level, { x, z, y: Q, item: 'bottle', qty: 1 });
  pickup(level, { x: w1.local(-8, 4)[0], z: w1.local(-8, 4)[1], y: Q, item: 'medicine', qty: 1 });
  pickup(level, { x: 2, z: -26, y: Q, item: 'chum', qty: 3, label: 'Bait bucket' });
  pickup(level, { x: -40, z: -38, y: Q, item: 'minnow', qty: 4 });

  // ---- the man in the yellow raincoat, at the end of every pier at once ----
  const men = piers.map((p) => {
    const m = makeHumanoid({ height: 1.8, thin: 1, color: 0xd8b020, skin: 0xa88a70, hat: true, coat: true });
    m.root.position.set(p.x + 0.8, Q, -p.len + 1.2); m.root.rotation.y = Math.PI;
    m.legL.rotation.x = -1.4; m.legR.rotation.x = -1.4; m.hips.position.y = 0.55;
    const rod = cyl(0.01, 0.015, 2.4, 'black', 0.25, 1.4, -0.6, m.root, 4); rod.rotation.x = -1.0;
    level.scene.add(m.root);
    level.addInteractable({ pos: new THREE.Vector3(p.x + 0.8, Q + 1, -p.len + 1.2), radius: 2.2, prompt: 'Talk to the man in the yellow coat', onUse: () => yellowSay() });
    return m;
  });
  let says = 0;
  const yellowSay = () => {
    says++;
    const line = "They're biting tonight. They're always biting tonight.";
    game.ui.subtitle(`"${line}"`, 4);
    audio.say(line, { pitch: 0.7, rate: 0.9, volume: 0.6 });
    if (says === 2) { game.ui.toast('He said it exactly the same way. Every pause. Every breath.', 'dream'); }
    if (says === 1) game.story.addJournal({ id: 'yellow', title: 'The man in the yellow coat', text: `"They're biting tonight. They're always biting tonight." He is at the end of every pier at once. Dad had a coat like that. Dad used to say that.` });
  };
  level.onUpdate(() => { for (const m of men) { const head = m.neck; const wp = m.root.position; head.rotation.y = Math.max(-1.2, Math.min(1.2, Math.atan2(game.player.pos.x - wp.x, game.player.pos.z - wp.z) - m.root.rotation.y)); } void inView; });

  // ---- monsters ----
  const quayPatrol = [new THREE.Vector3(-60, 0, 8), new THREE.Vector3(-20, 0, 8), new THREE.Vector3(20, 0, 8), new THREE.Vector3(60, 0, 8)];
  const pierPatrol = (p) => [new THREE.Vector3(p.x, 0, -2), new THREE.Vector3(p.x, 0, -p.len + 3)];
  const yardPatrol = [new THREE.Vector3(-45, 0, 24), new THREE.Vector3(-45, 0, 34), new THREE.Vector3(-10, 0, 22), new THREE.Vector3(25, 0, 30), new THREE.Vector3(40, 0, 20)];
  level.monsters = [
    new Dockhand(game, { patrol: quayPatrol, emergeHour: 1, waterSpawn: { x: -40, z: -38 } }),
    new Dockhand(game, { patrol: yardPatrol, emergeHour: 2, waterSpawn: { x: 0, z: -26 } }),
    new Dockhand(game, { patrol: pierPatrol(piers[2]).concat(quayPatrol.slice(2)), emergeHour: 3, waterSpawn: { x: 45, z: -34 } }),
    new Dockhand(game, { patrol: quayPatrol.slice().reverse().concat(yardPatrol), emergeHour: 4, waterSpawn: { x: 85, z: -60 } }),
  ];
  level.fishingSpots = [{ x: -40, z: -45, r: 12, boost: { relic_tag: 2, office_key: 1.5 } }, { x: 45, z: -40, r: 12, boost: { eel: 1.5 } }];
  level.spawn = { x: 0, z: -20, yaw: Math.PI };

  // ---- dream events ----
  level.dreams = [DE.whisper(), DE.nameCall(), DE.silence(), DE.echoSteps(), DE.objectBehind('chair'), DE.facesInWater(), DE.vanishingLight([new THREE.Vector3(-90, 0, -20), new THREE.Vector3(110, 0, -30), new THREE.Vector3(-100, 0, 50)])];

  level.weather.set({ fog: 0.045, rain: 0.2, wind: 0.3 }, true);
  level.ambience = (h) => ({ water: 0.35, wind: 0.3, rain: level.weather.state.rain * 0.8, drone: 0.12 + h * 0.03, tension: (game.player.threat || 0) > 0.6 ? 0.14 : 0 });
  level.onHour = (h) => {
    if (h === 1) game.ui.subtitle('Something climbs out of the water at the far pier. It clicks.', 4);
    if (h === 3) level.weather.set({ fog: 0.06, rain: 0.5 });
    if (h === 5) level.weather.set({ fog: 0.035, rain: 0.1 });
  };
  level.introPath = [
    { pos: new THREE.Vector3(80, 25, -60), look: new THREE.Vector3(0, 0, 0) },
    { pos: new THREE.Vector3(10, 5, -35), look: new THREE.Vector3(0, 1.5, -20) },
    { pos: new THREE.Vector3(0, Q + 1.65, -20), look: new THREE.Vector3(0, Q + 1, -5) },
  ];
  level.kit = () => starterKit(game, [['bottle', 1], ['minnow', 2]]);
  void toWorld; void w2;
  return level;
}
