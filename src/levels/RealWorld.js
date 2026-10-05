import * as THREE from 'three';
import { Level } from '../world/Level.js';
import { Water } from '../world/Water.js';
import { mat, box, cyl, note, rowboat } from '../world/Props.js';
import { wallpaperTexture, woodTexture, noiseTexture, digitalClockTexture, drawDigital, photoTexture, textTexture, drawPhoto } from '../world/Materials.js';
import { makeAlarmClock } from '../fishing/CatchModels.js';
import { makeHumanoid } from '../monsters/Monster.js';
import { audio } from '../engine/Audio.js';
import { DAY_TEXT, UPGRADES, N } from '../story/Text.js';
import { rand, pick } from '../util/math.js';

const H = 2.6;

// The waking world. Safe at first. Then the water starts getting in.
export function buildRealWorld(game, day, opts = {}) {
  const variant = opts.variant || 'day'; // 'day' | 'false' (false awakening ending)
  const level = new Level(game, {
    fog: 0.01, fogColor: 0x8a929a, bg: 0x9aa4ac, waterLevel: -5, bounds: 60, maxWade: 2,
    skyOpts: { top: 0x5a6a7a, horizon: 0xb8b4a8, stars: 0, cloud: 0.8, moonColor: 0x000000 },
    hemi: 0.75, hemiSky: 0xb8c4cc, hemiGround: 0x4a4038, moonIntensity: 0.9, moonColor: 0xffe0c0,
  });
  level.name = 'house';
  level.ambientLight = 0.6;
  level.fearBase = day >= 5 ? 0.1 : 0;
  level.sky.uniforms.uMoonVisible.value = 0;
  level.sky.setMoonAngles(-0.8, 0.25); // sun direction for shadows
  level.moon.shadow.camera.left = -25; level.moon.shadow.camera.right = 25; level.moon.shadow.camera.top = 25; level.moon.shadow.camera.bottom = -25;
  level.heightFn = () => 0;
  level.surfaceFn = (x, z) => (z > 18 ? 'grass' : 'wood');
  const hallLen = day === 5 ? 34 : 12; // the hallway is longer than it should be
  const S = hallLen; // living room starts at z = hallLen/2 + ...
  const hz0 = -6, hz1 = hz0 + hallLen; // hallway z range
  const lz0 = hz1, lz1 = lz0 + 8; // living room
  // ground outside
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x3a4a2a, map: noiseTexture('lawn', [110, 130, 90], 50), roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true; level.scene.add(ground);
  ground.material.map.repeat.set(40, 40);

  const wallMat = new THREE.MeshStandardMaterial({ map: wallpaperTexture(day >= 4 ? '#55605a' : '#6a7a6c', day >= 4 ? '#4a524a' : '#5a6a5c'), roughness: 0.95 });
  wallMat.map.repeat.set(3, 1);
  const extMat = new THREE.MeshStandardMaterial({ color: 0x8a8478, map: woodTexture('siding', [150, 145, 135], 12), roughness: 0.9 });
  const floorWood = new THREE.MeshStandardMaterial({ map: woodTexture('floor', [110, 84, 60], 10), roughness: 0.8 });
  floorWood.map.repeat.set(3, 3);
  const carpet = new THREE.MeshStandardMaterial({ color: 0x4a4a5a, map: noiseTexture('carpet', [120, 120, 130], 30), roughness: 1 });
  const tile = new THREE.MeshStandardMaterial({ color: 0xc8c8c0, map: noiseTexture('tile', [200, 200, 195], 20), roughness: 0.5 });
  const concrete = mat('concrete');

  // wall helper: axis-aligned, with gaps [[a,b],...] along its length
  const wall = (x1, z1, x2, z2, gaps = [], m = wallMat, h = H) => {
    const horiz = z1 === z2;
    const a0 = horiz ? Math.min(x1, x2) : Math.min(z1, z2), a1 = horiz ? Math.max(x1, x2) : Math.max(z1, z2);
    let cur = a0;
    const segs = [];
    for (const [g0, g1] of gaps.sort((p, q) => p[0] - q[0])) { if (g0 > cur) segs.push([cur, g0]); cur = g1; }
    if (cur < a1) segs.push([cur, a1]);
    for (const [s0, s1] of segs) {
      const len = s1 - s0, mid = (s0 + s1) / 2;
      const x = horiz ? mid : x1, z = horiz ? z1 : mid;
      const b = box(horiz ? len : 0.12, h, horiz ? 0.12 : len, m, x, h / 2, z, level.scene);
      b.castShadow = true;
      level.addBox(x, z, (horiz ? len : 0.12) / 2, (horiz ? 0.12 : len) / 2, 0, { y0: -1, y1: h });
    }
    for (const [g0, g1] of gaps) { // lintel
      const mid = (g0 + g1) / 2;
      box(horiz ? g1 - g0 : 0.12, h - 2.1, horiz ? 0.12 : g1 - g0, m, horiz ? mid : x1, 2.1 + (h - 2.1) / 2, horiz ? z1 : mid, level.scene);
    }
  };
  const floor = (x0, z0, x1, z1, m) => { const f = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), m); f.rotation.x = -Math.PI / 2; f.position.set((x0 + x1) / 2, 0.005, (z0 + z1) / 2); f.receiveShadow = true; level.scene.add(f); };
  const ceiling = (x0, z0, x1, z1) => { const c = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshStandardMaterial({ color: 0xc8c4b8, roughness: 1 })); c.rotation.x = Math.PI / 2; c.position.set((x0 + x1) / 2, H, (z0 + z1) / 2); level.scene.add(c); };
  const lamp = (x, z, intensity = 4, color = 0xffe2b8) => { const l = new THREE.PointLight(color, intensity, 9, 1.5); l.position.set(x, H - 0.3, z); level.scene.add(l); const s = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff0d8 })); s.position.copy(l.position); level.scene.add(s); level.addLightSource(l.position.clone().setY(1), 5, l); return l; };
  const windowPane = (x, z, rotY, w = 1.2, h = 1.0) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: variant === 'false' ? 0xfff0d0 : day >= 6 ? 0x203038 : 0xc8d4dc })); p.position.set(x, 1.5, z); p.rotation.y = rotY; level.scene.add(p); return p; };

  // ---- bedroom: x[-6,-1] z[-6,0] ----
  floor(-6, -6, -1, 0, carpet); ceiling(-6, -6, -1, 0);
  wall(-6, -6, -1, -6); wall(-6, 0, -1, 0); wall(-6, -6, -6, 0);
  windowPane(-5.93, -3.3, Math.PI / 2, 1.3, 1.1);
  lamp(-3.5, -3, 3);
  // bed
  const bedPos = new THREE.Vector3(-4.7, 0, -1.4);
  box(1.5, 0.45, 2.1, mat('darkwood'), bedPos.x, 0.22, bedPos.z - 1.0, level.scene);
  box(1.4, 0.18, 2.0, new THREE.MeshStandardMaterial({ color: 0x6a7a8a, roughness: 1 }), bedPos.x, 0.54, bedPos.z - 1.0, level.scene);
  box(0.9, 0.12, 0.35, new THREE.MeshStandardMaterial({ color: 0xe0dcd0, roughness: 1 }), bedPos.x, 0.68, bedPos.z - 1.85, level.scene);
  level.addBox(bedPos.x, bedPos.z - 1.0, 0.75, 1.05, 0, { y0: -1, y1: 0.7, occlude: false });
  // nightstand + clocks
  box(0.5, 0.6, 0.45, mat('darkwood'), -5.7, 0.3, -5.2, level.scene);
  level.addBox(-5.7, -5.2, 0.25, 0.25);
  const dTex = digitalClockTexture('6:00');
  const dClock = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.09, 0.08), [mat('black'), mat('black'), mat('black'), mat('black'), new THREE.MeshBasicMaterial({ map: dTex }), mat('black')]);
  dClock.position.set(-5.75, 0.65, -5.05); dClock.rotation.y = Math.PI / 2 + 0.3; level.scene.add(dClock);
  const brass = makeAlarmClock();
  brass.position.set(-5.6, 0.72, -5.35); brass.rotation.y = Math.PI / 2 + 0.5; brass.scale.setScalar(1.5);
  if (day < 6) level.scene.add(brass);
  brass.userData.setTime(day >= 2 ? 4 : 4, day >= 2 ? 17 : 0);
  const D = DAY_TEXT[Math.min(6, day)] || DAY_TEXT[1];
  level.addInteractable({ pos: new THREE.Vector3(-5.6, 0.8, -5.3), radius: 1.6, prompt: day < 6 ? 'The brass alarm clock' : 'Where the clock was', onUse: () => { game.ui.subtitle(D.clock, 5); if (day >= 2 && day < 6) { brass.userData.setTime(4, 17); audio.click(0.2); } } });
  // dresser with face-down photo
  box(1.2, 0.9, 0.5, mat('wood'), -1.6, 0.45, -5.6, level.scene);
  level.addBox(-1.6, -5.6, 0.6, 0.25);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.02, 0.3), mat('darkwood'));
  frame.position.set(-1.6, 0.92, -5.5); level.scene.add(frame);
  let flipped = false;
  level.addInteractable({ pos: frame.position, radius: 1.6, prompt: () => (flipped ? 'The photograph' : 'Turn over the photo frame'), onUse: () => {
    if (!flipped) {
      flipped = true;
      frame.rotation.x = -1.3; frame.position.y = 1.02;
      const ph = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.25), new THREE.MeshStandardMaterial({ map: photoTexture('lake', 'opening day') })); ph.position.set(0, -0.012, 0); ph.rotation.x = Math.PI / 2; frame.add(ph);
    }
    game.ui.showDocument({ title: 'A framed photograph', text: day >= 4 ? `The same photograph from the boathouse in your dream. The same three people on the same dock.\n\nIn this one, nobody has scratched out your father's face. He's laughing. Mara is holding up a perch the size of her hand.\n\nIt was real. All of it was real.` : `Three people on a dock. You put this face-down years ago, and you don't remember why.\n\nYour father is laughing. Mara is holding up a perch the size of her hand.` });
    game.story.addJournal({ id: 'framed', title: 'The framed photograph', text: 'Three people on the Hollow Lake dock. Dad laughing. Mara holding up a tiny perch. Real.' });
  } });
  // bedroom wardrobe hiding spot (for unease; nothing hunts you here... usually)
  box(1.2, 2.1, 0.6, mat('darkwood'), -3.2, 1.05, -5.6, level.scene);
  level.addBox(-3.2, -5.6, 0.6, 0.3);
  // bed: sleep
  let slept = false;
  level.addInteractable({ pos: new THREE.Vector3(bedPos.x, 0.8, bedPos.z - 0.7), radius: 1.8, wide: true, prompt: () => (day >= 6 ? 'You can\'t sleep. Not here.' : game.dayState.upgraded ? 'Go to sleep' : 'Go to sleep (you haven\'t been to the garage)'), onUse: () => {
    if (variant === 'false') return;
    if (day >= 6) { game.ui.subtitle('The front door. It wants you to use the front door.', 4); return; }
    if (!game.dayState.upgraded && !slept) { slept = true; game.ui.subtitle('Dad\'s gear is in the garage. You might need something tonight. (Press again to sleep anyway.)', 4); return; }
    game.sleep();
  } });

  // ---- hallway: x[-1,1] z[hz0,hz1] ----
  floor(-1, hz0, 1, hz1, floorWood); ceiling(-1, hz0, 1, hz1);
  wall(-1, hz0, -1, hz1, [[-1.6, -0.4]]); // bedroom door gap at z -1.6..-0.4 (bedroom spans to z 0) -> adjust: bedroom wall x=-1 spans z[-6,0]
  wall(1, hz0, 1, hz1, [[-4.6, -3.4]]);
  wall(-1, hz0, 1, hz0);
  for (let z = hz0 + 2; z < hz1; z += 5) lamp(0, z, day === 5 ? 1.2 : 2.2);
  // family pictures along the hall (more of them the longer the hall is)
  for (let z = hz0 + 1.5; z < hz1 - 1; z += 2.4) {
    const t = textTexture([''], { w: 128, h: 160, bg: '#d8d0b8', stains: false, image: (g, x, y, w, h) => drawPhoto(g, 8, 8, 112, 140, pick(['lake', 'dock', 'family', 'ice'])) });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.5), new THREE.MeshStandardMaterial({ map: t })); p.position.set(0.93, 1.5, z); p.rotation.y = -Math.PI / 2; level.scene.add(p);
  }
  // bathroom: x[1,4] z[-6,-2]
  floor(1, -6, 4, -2, tile); ceiling(1, -6, 4, -2);
  wall(1, -6, 4, -6); wall(1, -2, 4, -2); wall(4, -6, 4, -2);
  lamp(2.5, -4, 2);
  box(0.6, 0.85, 0.45, new THREE.MeshStandardMaterial({ color: 0xe8e8e0, roughness: 0.3 }), 3.6, 0.42, -4.8, level.scene);
  const mirrorTex = textTexture(day >= 2 ? ['W A K E   U P'] : [''], { w: 256, h: 256, bg: '#9aa8ac', fg: 'rgba(240,240,240,0.7)', size: 30, align: 'center', stains: false });
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.8), new THREE.MeshStandardMaterial({ map: mirrorTex, roughness: 0.1, metalness: 0.4 }));
  mirror.position.set(3.93, 1.55, -4.8); mirror.rotation.y = -Math.PI / 2; level.scene.add(mirror);
  level.addInteractable({ pos: mirror.position, radius: 1.7, prompt: 'Look in the mirror', onUse: () => game.ui.subtitle(day >= 2 ? 'Someone has written in the fog on the mirror, from the inside of the glass: WAKE UP.' : 'You look tired. Your lips are blue. You wash your face. The water smells like the lake.', 5) });

  // ---- living room / kitchen: x[-6,6] z[lz0,lz1] ----
  floor(-6, lz0, 6, lz1, floorWood); ceiling(-6, lz0, 6, lz1);
  wall(-6, lz0, -1, lz0); wall(1, lz0, 6, lz0);
  wall(-6, lz0, -6, lz1); wall(6, lz0, 6, lz1, [[lz0 + 3.4, lz0 + 4.6]]);
  wall(-6, lz1, 6, lz1, [[2.4, 3.6]], extMat);
  windowPane(-3, lz1 - 0.07, Math.PI, 1.6, 1.1);
  lamp(-2.5, lz0 + 4, 3.5); lamp(3, lz0 + 4, 3);
  // fridge
  box(0.8, 1.8, 0.7, new THREE.MeshStandardMaterial({ color: 0xd8d8d0, roughness: 0.4 }), -5.5, 0.9, lz0 + 1, level.scene);
  level.addBox(-5.5, lz0 + 1, 0.4, 0.35);
  if (day >= 3) {
    const fp = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.26), new THREE.MeshStandardMaterial({ map: photoTexture('ice', '') }));
    fp.position.set(-5.09, 1.3, lz0 + 1); fp.rotation.y = Math.PI / 2; level.scene.add(fp);
    level.addInteractable({ pos: fp.position, radius: 1.6, prompt: 'The photo on the fridge', onUse: () => { game.ui.showDocument({ title: 'Photograph on the refrigerator', text: DAY_TEXT[3].fridge }); game.story.addJournal({ id: 'fridge', title: 'Photo on the fridge', text: DAY_TEXT[3].fridge }); } });
  }
  // kitchen counter
  box(3, 0.9, 0.65, mat('wood'), -3.5, 0.45, lz0 + 0.4, level.scene);
  level.addBox(-3.5, lz0 + 0.4, 1.5, 0.33);
  // phone on the wall
  const phone = box(0.18, 0.28, 0.08, new THREE.MeshStandardMaterial({ color: 0xd8c8a8, roughness: 0.5 }), -5.9, 1.4, lz0 + 3, level.scene);
  let calls = 0;
  level.addInteractable({ pos: phone.position, radius: 1.6, prompt: () => (game.dayState.ringing ? 'Answer the phone' : 'The phone'), onUse: () => {
    if (game.dayState.ringing) {
      game.dayState.ringing = false; calls++;
      const lines = D.call();
      lines.forEach((l, i) => setTimeout(() => { game.ui.subtitle(`"${l}"`, 5.5); audio.say(l, { pitch: 0.85, rate: 0.9, volume: 0.6 }); }, 600 + i * 6000));
      setTimeout(() => { audio.radioStatic(1.5, 0.1); game.ui.subtitle('The line goes dead. The phone cord is not plugged into anything.', 4); }, 600 + lines.length * 6000);
      game.story.addJournal({ id: 'call', title: 'The phone call', text: lines.join('\n') });
      return;
    }
    game.ui.subtitle(D.phone, 4);
  } });
  // computer desk
  box(1.4, 0.75, 0.7, mat('darkwood'), 4.8, 0.37, lz0 + 1, level.scene);
  level.addBox(4.8, lz0 + 1, 0.7, 0.35);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.4), new THREE.MeshBasicMaterial({ color: day >= 6 ? 0xd8e0d8 : 0x6a8aa8 }));
  scr.position.set(4.8, 1.05, lz0 + 0.8); level.scene.add(scr);
  box(0.62, 0.42, 0.05, mat('black'), 4.8, 1.05, lz0 + 0.77, level.scene);
  level.addInteractable({ pos: scr.position, radius: 1.8, prompt: 'Use the computer', onUse: () => { game.ui.showDocument({ title: 'Computer', text: D.computer().join('\n') }); audio.click(0.2); game.story.addJournal({ id: 'computer' + day, title: `Computer (day ${day})`, text: D.computer().join('\n') }); } });
  // TV & couch
  box(2.2, 0.8, 0.9, new THREE.MeshStandardMaterial({ color: 0x4a3a32, roughness: 1 }), 0, 0.4, lz1 - 2, level.scene);
  level.addBox(0, lz1 - 2, 1.1, 0.45);
  const tv = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.7), new THREE.MeshBasicMaterial({ color: 0x223040 }));
  tv.position.set(0, 1.1, lz0 + 0.15); level.scene.add(tv);
  box(1.2, 0.8, 0.12, mat('black'), 0, 1.1, lz0 + 0.08, level.scene);
  level.onUpdate(() => { const v = 0.15 + Math.random() * 0.12; tv.material.color.setRGB(v, v * (day >= 6 ? 1.2 : 1), v * 1.1); });
  level.addInteractable({ pos: tv.position, radius: 2.5, prompt: 'The TV', onUse: () => game.ui.subtitle(day >= 6 ? 'Static. Under the static: a lake at night, filmed from the middle of the water. Someone is standing on the dock.' : 'Static. You don\'t remember leaving it on.', 4) });
  // front door
  const fdOpen = { v: false };
  const fdCol = level.addBox(3, lz1, 0.6, 0.08, 0);
  const fdLeaf = box(1.2, 2.1, 0.06, mat('wood'), 3, 1.05, lz1, level.scene);
  level.addInteractable({ pos: new THREE.Vector3(3, 1.2, lz1 - 0.3), radius: 1.6, prompt: () => (day >= 6 ? 'Open the front door' : fdOpen.v ? 'Close the front door' : 'Open the front door'), onUse: () => {
    if (day >= 6) { game.beginFinalNight(); return; }
    fdOpen.v = !fdOpen.v; fdCol.enabled = !fdOpen.v; fdLeaf.position.x = fdOpen.v ? 2.45 : 3; fdLeaf.rotation.y = fdOpen.v ? Math.PI / 2 : 0; audio.door(fdOpen.v);
  } });

  // ---- garage: x[6,12] z[lz0,lz1] ----
  const gfloor = new THREE.Mesh(new THREE.PlaneGeometry(6, 8), concrete); gfloor.rotation.x = -Math.PI / 2; gfloor.position.set(9, 0.006, lz0 + 4); level.scene.add(gfloor);
  ceiling(6, lz0, 12, lz1);
  wall(6, lz0, 12, lz0, [], extMat); wall(12, lz0, 12, lz1, [], extMat); wall(6, lz1, 12, lz1, [], extMat);
  lamp(9, lz0 + 4, 3, 0xe8f0ff);
  box(2.4, 0.9, 0.8, mat('wood'), 9, 0.45, lz0 + 0.6, level.scene);
  level.addBox(9, lz0 + 0.6, 1.2, 0.4);
  for (let i = 0; i < 5; i++) { const r = cyl(0.012, 0.02, 2.2, 'black', 11.85, 1.3, lz0 + 1.5 + i * 0.4, level.scene, 5); r.rotation.x = 0.1; }
  const hat = new THREE.Group(); const hm = new THREE.MeshStandardMaterial({ color: 0x4a4a30 }); const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.01, 16), hm); hat.add(brim); const cr = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.1, 12), hm); cr.position.y = 0.05; hat.add(cr); hat.position.set(11.8, 1.9, lz0 + 4); hat.rotation.z = Math.PI / 2; level.scene.add(hat);
  level.addInteractable({ pos: new THREE.Vector3(9, 1.1, lz0 + 0.8), radius: 2, prompt: () => (game.dayState.upgraded ? 'Dad\'s workbench (you took what you need)' : "Dad's workbench — take something for tonight"), onUse: async () => {
    if (game.dayState.upgraded) { game.ui.subtitle('His tools are still where he left them. Everything has a place. Everything except you.', 4); return; }
    const owned = game.story.upgrades;
    const pool = Object.keys(UPGRADES).filter((k) => !owned[k]);
    const ctx = { 1: ['auger', 'boots'], 2: ['boat', 'torch'], 3: ['boots', 'line'], 4: ['kit', 'reel'], 5: ['torch', 'kit'] }[day] || [];
    const opts = [];
    for (const c of ctx) if (pool.includes(c) && opts.length < 1) opts.push(c);
    while (opts.length < 3 && pool.length > opts.length) { const c = pick(pool); if (!opts.includes(c)) opts.push(c); }
    if (!opts.length) { game.ui.subtitle('There is nothing left here you haven\'t already taken.', 3); game.dayState.upgraded = true; return; }
    const id = await game.ui.upgradePicker(opts, UPGRADES);
    game.story.upgrades[id] = true;
    game.dayState.upgraded = true;
    game.ui.toast(`Took: ${UPGRADES[id].name}`);
  } });
  if (day >= 6) { const rb = rowboat(level, { x: 9, z: lz0 + 4.5, y: 0.05, rot: 0.1 }); void rb; level.addInteractable({ pos: new THREE.Vector3(9, 0.8, lz0 + 4.5), radius: 2.5, prompt: 'The rowboat', onUse: () => game.ui.subtitle('Dad\'s rowboat. It is soaking wet. There is lake weed caught on the oarlock. There is a child\'s fishing rod inside.', 5) }); }
  // hat on the wall
  level.addInteractable({ pos: hat.position, radius: 1.6, prompt: "Dad's fishing hat", onUse: () => game.ui.subtitle(game.story.relics.has('relic_hat') ? 'The hook on the wall is empty. You know where the hat is.' : 'His hat. W.P. stitched in the band. It smells like lake water. It shouldn\'t. It has been on this hook for fourteen years.', 5) });

  // ---- outside: porch, lawn, street ----
  box(4, 0.15, 2, mat('plank'), 3, 0.07, lz1 + 1.1, level.scene);
  // exterior walls for the house footprint (west and north)
  const road = new THREE.Mesh(new THREE.PlaneGeometry(200, 8), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.9 }));
  road.rotation.x = -Math.PI / 2; road.position.set(0, 0.01, lz1 + 14); level.scene.add(road);
  for (let x = -40; x <= 40; x += 16) {
    if (Math.abs(x) < 8) continue;
    const hh = new THREE.Group(); hh.position.set(x, 0, lz1 + 30);
    box(9, 4, 7, new THREE.MeshStandardMaterial({ color: 0x6a6a64 + Math.floor(rand(0, 4)) * 0x050505, roughness: 0.9 }), 0, 2, 0, hh);
    const roofG = new THREE.ConeGeometry(6.4, 2.5, 4); roofG.rotateY(Math.PI / 4); const rf = new THREE.Mesh(roofG, mat('roof')); rf.position.y = 5.2; rf.scale.set(1, 1, 0.8); hh.add(rf);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1), new THREE.MeshBasicMaterial({ color: 0x1a2028 })); win.position.set(-2, 2, -3.52); win.rotation.y = Math.PI; hh.add(win);
    level.scene.add(hh); level.addBox(x, lz1 + 30, 4.5, 3.5);
  }
  for (const x of [-20, 0, 20]) { cyl(0.08, 0.1, 5, 'metal', x, 2.5, lz1 + 9.5, level.scene, 6); }
  level.bounds = 45;
  // exterior shell walls (outside faces)
  wall(-6.1, -6.1, -6.1, lz1 + 0.05, [], extMat, H + 0.2);
  wall(-6.1, -6.1, 12.1, -6.1, [], extMat, H + 0.2);
  wall(12.1, -6.1, 12.1, lz0, [], extMat, H + 0.2);
  // roof
  const roof = new THREE.Mesh(new THREE.BoxGeometry(18.4, 0.2, lz1 + 6.4), mat('roof')); roof.position.set(3, H + 0.1, (lz1 - 6) / 2); level.scene.add(roof);

  // ---- the water is getting in ----
  if (day === 4) {
    // dripping from the hallway ceiling, a trail toward the bedroom
    const drops = [];
    const dg = new THREE.SphereGeometry(0.02, 6, 4), dm = new THREE.MeshStandardMaterial({ color: 0x9ab0c0, roughness: 0, transparent: true, opacity: 0.8 });
    const points = [[0, 4], [0, 1.5], [-0.3, -0.8], [-1.6, -1], [-3, -1.6], [-4.4, -2.2]];
    const puddles = points.slice(0, 3).map(([x, z]) => { const p = new THREE.Mesh(new THREE.CircleGeometry(0.25, 12), new THREE.MeshStandardMaterial({ color: 0x5a6a70, roughness: 0, metalness: 0.4, transparent: true, opacity: 0.6 })); p.rotation.x = -Math.PI / 2; p.position.set(x, 0.01, z); level.scene.add(p); return p; });
    let dryShown = false;
    level.onUpdate((dt) => {
      if (Math.random() < dt * 3) { const [x, z] = pick(points.slice(0, 3)); const d = new THREE.Mesh(dg, dm); d.position.set(x + rand(-0.1, 0.1), H - 0.05, z + rand(-0.1, 0.1)); level.scene.add(d); drops.push(d); }
      for (const d of [...drops]) { d.position.y -= dt * 5; if (d.position.y < 0.02) { level.scene.remove(d); drops.splice(drops.indexOf(d), 1); if (game.player.pos.distanceTo(d.position) < 8) audio.plop(d.position, 0.08); } }
      if (!dryShown && game.player.pos.x < -1.5 && game.player.pos.z < 0) { dryShown = true; game.ui.subtitle('The drips lead here. The bedroom floor is completely dry. The ceiling is dry. Your hair is wet.', 6); game.player.addFear(0.2); for (const p of puddles) level.scene.remove(p); }
    });
  }
  if (day === 5) {
    level.onUpdate(() => { if (!game.dayState.callStarted && game.player.pos.z > hz0 + 6) { game.dayState.callStarted = true; game.dayState.ringing = true; audio.phoneRing(5); } });
    level.onUpdate(() => { if (game.dayState.ringing && Math.random() < 0.003) audio.phoneRing(1); });
  }
  if (day >= 6) {
    const flood = level.addWater(new Water({ size: 40, level: 0.14, color: 0x1a2428, deep: 0x0a1014 }));
    flood.mesh.position.set(3, 0.14, 4);
    level.monitor = 0.12;
    level.surfaceFn = () => 'water';
  }
  if (variant === 'false') {
    level.ambientLight = 0.8;
  }

  level.ambience = () => ({ hum: 0.35, wind: day >= 5 ? 0.1 : 0.05, water: day >= 6 ? 0.3 : 0, drone: day >= 5 ? 0.08 : 0 });
  level.spawn = { x: bedPos.x + 1.1, z: bedPos.z - 0.6, yaw: Math.PI / 2 };
  level.wakeCam = { pos: new THREE.Vector3(bedPos.x, 0.95, bedPos.z - 1.7), look: new THREE.Vector3(bedPos.x, H, bedPos.z - 1.2), look2: new THREE.Vector3(-5.6, 0.75, -5.2) };
  level.digital = { tex: dTex, set: (t) => drawDigital(dTex, t) };
  level.brass = brass;
  level.hallLen = hallLen;
  void S; void N;
  return level;
}
