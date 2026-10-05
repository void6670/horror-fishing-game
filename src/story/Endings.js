import * as THREE from 'three';
import { Level } from '../world/Level.js';
import { Water } from '../world/Water.js';
import { box, cyl, dock, rowboat, forest, mat } from '../world/Props.js';
import { makeHumanoid } from '../monsters/Monster.js';
import { makeAlarmClock } from '../fishing/CatchModels.js';
import { buildRealWorld } from '../levels/RealWorld.js';
import { buildHollowLake } from '../levels/HollowLake.js';
import { N } from './Text.js';

// Small scenes for the endings. Each returns { level, shots: [{pos, look, dur, lines}], text, ambience, monitor }.
function hospital(game) {
  const level = new Level(game, { fog: 0.01, fogColor: 0xd8dcd8, bg: 0xdfe4e0, sky: false, hemi: 1.1, hemiSky: 0xf0f4f0, hemiGround: 0x8a8a84, moonIntensity: 0.6, moonColor: 0xfff0d8, shadows: false });
  level.heightFn = () => 0;
  const white = new THREE.MeshStandardMaterial({ color: 0xdcdcd4, roughness: 0.9 });
  box(10, 0.1, 10, new THREE.MeshStandardMaterial({ color: 0xb8bcb4, roughness: 0.6 }), 0, -0.05, 0, level.scene);
  box(10, 3, 0.1, white, 0, 1.5, -4, level.scene); box(0.1, 3, 10, white, -4, 1.5, 0, level.scene); box(0.1, 3, 10, white, 4, 1.5, 0, level.scene);
  box(10, 0.1, 10, white, 0, 3, 0, level.scene);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.4), new THREE.MeshBasicMaterial({ color: 0xffe8c8 })); win.position.set(3.94, 1.7, -1); win.rotation.y = -Math.PI / 2; level.scene.add(win);
  const sun = new THREE.PointLight(0xffd8a0, 8, 12, 1.4); sun.position.set(3.2, 1.8, -1); level.scene.add(sun);
  // bed (camera lies in it)
  box(1.1, 0.6, 2.2, new THREE.MeshStandardMaterial({ color: 0xa8b0b0, metalness: 0.4, roughness: 0.4 }), 0, 0.3, 0, level.scene);
  box(1.0, 0.15, 2.1, new THREE.MeshStandardMaterial({ color: 0xf0f0ec }), 0, 0.68, 0, level.scene);
  // monitor
  const mon = new THREE.Group(); mon.position.set(-1.2, 1.4, -0.8);
  box(0.5, 0.4, 0.2, mat('black'), 0, 0, 0, mon);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.3), new THREE.MeshBasicMaterial({ color: 0x103018 })); scr.position.z = 0.11; mon.add(scr);
  const blip = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.05), new THREE.MeshBasicMaterial({ color: 0x60ff80 })); blip.position.z = 0.115; mon.add(blip);
  mon.rotation.y = 0.6; level.scene.add(mon);
  level.onUpdate(() => { const t = performance.now() * 0.001; blip.position.x = ((t * 0.3) % 1) * 0.36 - 0.18; blip.position.y = Math.max(0, Math.sin(t * 6.3) ** 20) * 0.1; });
  // mother in the chair, asleep, holding your hand
  const mom = makeHumanoid({ height: 1.65, thin: 0.9, color: 0x6a5a7a, skin: 0xc8a890, coat: true });
  mom.root.position.set(1.7, 0, 0.1); mom.root.rotation.y = -Math.PI / 2; mom.hips.position.y = 0.55; mom.legL.rotation.x = -1.5; mom.legR.rotation.x = -1.5; mom.neck.rotation.x = 0.5; mom.armR.rotation.x = -1.2;
  level.scene.add(mom.root);
  box(0.5, 0.45, 0.5, new THREE.MeshStandardMaterial({ color: 0x4a5a6a }), 1.1, 0.22, 0.3, level.scene);
  const clock = makeAlarmClock(); clock.position.set(-0.8, 0.8, -1.3); clock.scale.setScalar(1.3); clock.userData.setTime(4, 17); level.scene.add(clock);
  return level;
}

function dawnLake(game, { boat = false } = {}) {
  const level = new Level(game, { fog: 0.008, fogColor: 0xc8a888, skyOpts: { top: 0x4a6a9a, horizon: 0xf0b888, stars: 0, cloud: 0.4, moonColor: 0xfff0d0, moonSize: 0.05 }, hemi: 0.9, hemiSky: 0xd8c8b8, moonIntensity: 1.4, moonColor: 0xffd0a0 });
  level.sky.setMoonAngles(1.2, 0.06);
  const h = (x, z) => { const d = Math.hypot(x, z); return d < 60 ? -0.5 - (60 - d) * 0.1 : 0.3 + (d - 60) * 0.05; };
  level.makeTerrain({ size: 300, seg: 100, height: h, color: (x, z, y) => (y < 0 ? [0.2, 0.18, 0.12] : [0.2, 0.26, 0.14]) });
  const water = level.addWater(new Water({ size: 300, level: 0, color: 0x3a4a5a, deep: 0x1a2a3a }));
  water.uniforms.uStill.value = 0.6;
  dock(level, { x: 0, z: 62, length: 16, top: 0.75 });
  forest(level, { count: 300, area: 140, seed: 9, accept: (x, z) => Math.hypot(x, z) > 70 });
  const clock = makeAlarmClock(); clock.position.set(0.3, 0.85, 47.5); clock.scale.setScalar(1.8); clock.userData.setTime(4, 0); level.scene.add(clock);
  if (boat) {
    const b = rowboat(level, { x: 0, z: 20, rot: 0.3 });
    const mara = makeHumanoid({ height: 1.15, thin: 0.75, color: 0xd8b020, skin: 0xe0c0a8, coat: true });
    mara.root.position.set(0, 0, -0.9); mara.hips.position.y = 0.4; mara.legL.rotation.x = mara.legR.rotation.x = -1.4; b.add(mara.root);
    const you = makeHumanoid({ height: 1.75, thin: 0.9, color: 0x2e3a2e, skin: 0x9c7a64, coat: true });
    you.root.position.set(0, 0, 0.8); you.root.rotation.y = Math.PI; you.hips.position.y = 0.45; you.legL.rotation.x = you.legR.rotation.x = -1.4; b.add(you.root);
    const rod = cyl(0.01, 0.015, 2.2, 'black', 0.2, 1.2, -1.6, b, 4); rod.rotation.x = 1.0;
  }
  return level;
}

export function buildEnding(game, id) {
  const name = N();
  switch (id) {
    case 'truth': {
      const level = hospital(game);
      return {
        level, monitor: 0.15, ambience: { hum: 0.2 },
        shots: [
          { pos: [0, 1.0, 0.7], look: [0, 2.9, -0.4], dur: 7, lines: ['The alarm is still ringing.', 'It is not an alarm. It is a heart monitor.'] },
          { pos: [0, 1.15, 0.6], look: [1.0, 0.9, 0.3], dur: 8, lines: ['Your mother is asleep in the chair, holding your hand.', 'You squeeze.', 'She wakes up.'] },
          { scene: () => dawnLake(game), pos: [0, 1.8, 66], look: [0, 0.6, 46], dur: 10, lines: ['In the spring, you drive to Hollow Lake.', 'You set the brass clock on the end of the dock. Four o\'clock.', 'When it rings, you let it ring.'] },
        ],
        text: `It wasn't the alarm. It was never the alarm.\n\nYou were seventeen, and you were asleep, and she was nine, and she was brave, and your father didn't tie the boat.\n\nIt was nobody's job to carry all of it.\n\nYou carry it differently now. You put some of it down.\n\nThank you for fishing, ${name}.`,
      };
    }
    case 'wake': {
      const level = hospital(game);
      return {
        level, monitor: 0.15, ambience: { hum: 0.2 },
        shots: [
          { pos: [0, 1.0, 0.7], look: [0, 2.9, -0.4], dur: 7, lines: ['White ceiling. A steady beep.', 'St. Agnes.'] },
          { pos: [0, 1.15, 0.6], look: [1.0, 0.9, 0.3], dur: 8, lines: ['Your mother is holding your hand.', '"You came back," she says. "You came back."'] },
        ],
        text: `You were in the water for a long time. You are awake now.\n\nYou don't remember all of it. Some of it stayed down there — in the ice, in the harbor fog, at the bottom of the sea.\n\nSome nights you still hear a clock ticking under the bed.\n\n(Recover all seven memories to learn the whole truth.)`,
      };
    }
    case 'false': {
      const level = buildRealWorld(game, 1, { variant: 'false' });
      return {
        level, ambience: { hum: 0.2 }, reel: true,
        shots: [
          { pos: [level.wakeCam.pos.x, 0.95, level.wakeCam.pos.z], look: [level.wakeCam.look.x, 2.6, level.wakeCam.look.z], dur: 6, lines: ['6:00 AM. Your own bed.', 'Sunlight. No water anywhere.'] },
          { pos: [level.wakeCam.pos.x, 1.1, level.wakeCam.pos.z], look: [-5.6, 0.75, -5.2], dur: 7, lines: ['The brass clock is on the nightstand.', 'It reads 4:17.', 'It\'s over. It\'s over.'] },
        ],
        text: `Click.\n\nClick. Click. Click.\n\nSomewhere in the house, someone is reeling in a line.\n\n(You woke up too early. Find more of what the water is holding.)`,
      };
    }
    case 'trapped': {
      const level = buildHollowLake(game, false);
      const Rs = level.spawn.z;
      return {
        level, ambience: { water: 0.4, crickets: 0.25, wind: 0.2 },
        shots: [
          { pos: [1.5, 1.7, Rs], look: [0, 1, Rs - 20], dur: 7, lines: ['12:00 AM.', 'Hollow Lake.'] },
          { pos: [1.5, 1.7, Rs], look: [-0.5, 0.3, Rs - 6], dur: 7, lines: ['You haven\'t been here in fourteen years.', 'The fish are biting.'] },
        ],
        text: `Five more minutes.\n\nFive more minutes.\n\nFive more minutes.\n\n(You turned it off again.)`,
      };
    }
    case 'monster': {
      const level = buildHollowLake(game, false);
      const Rs = level.spawn.z;
      const kid = makeHumanoid({ height: 1.3, thin: 0.8, color: 0x3a5a8a, skin: 0xd8b8a0, coat: true });
      kid.root.position.set(0, 0.75, Rs - 10); kid.root.rotation.y = Math.PI; level.scene.add(kid.root);
      const l = new THREE.PointLight(0xffc080, 3, 8, 1.6); l.position.set(0.6, 1.5, Rs - 10); level.scene.add(l);
      return {
        level, ambience: { water: 0.3, wind: 0.3, drone: 0.3 },
        shots: [
          { pos: [-28, 2.6, Rs + 12], look: [0, 1, Rs - 10], dur: 7, lines: ['Someone is fishing off the dock.', 'They are young. They are alone. It is very late.'] },
          { pos: [-20, 2.6, Rs + 6], look: [0, 1, Rs - 10], dur: 8, lines: ['You step out from between the trees.', 'Water runs out of your sleeves. The hat is heavy and cold.', 'You only want to warn them.'] },
        ],
        text: `The waders fit. The hat fits.\n\nSomeone has to keep looking. Someone has to watch the water.\n\nYou will watch it forever.`,
      };
    }
    case 'boat': {
      const level = dawnLake(game, { boat: true });
      return {
        level, ambience: { water: 0.3, wind: 0.1 },
        shots: [
          { pos: [6, 3, 30], look: [0, 0.6, 20], dur: 8, lines: ['The water holds you up all the way out.', 'She has saved you a seat.'] },
          { pos: [1.5, 1.4, 22], look: [0, 0.9, 19], dur: 8, lines: ['"You\'re up," Mara says. "Finally."', 'She hands you the rod.'] },
        ],
        text: `At St. Agnes, a monitor goes quiet at 4:17 in the morning.\n\nOn the other shore of Hollow Lake, two people in a rowboat are waiting for the big one. It is never cold there, and no one is ever asleep.`,
      };
    }
    default: return null;
  }
}
