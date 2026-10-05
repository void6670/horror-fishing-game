import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../util/noise.js';
import { woodTexture, barkTexture, rustTexture, concreteTexture, textTexture, noiseTexture } from './Materials.js';
import { audio } from '../engine/Audio.js';

// Three.js Y-rotation convention: local (lx, lz) -> world.
export const toWorld = (x, z, rot, lx, lz) => [x + lx * Math.cos(rot) + lz * Math.sin(rot), z - lx * Math.sin(rot) + lz * Math.cos(rot)];

export const sharedUniforms = { uTime: { value: 0 }, uSway: { value: 0.15 } };

const MAT = {};
export function mat(name) {
  if (MAT[name]) return MAT[name];
  const S = (o) => new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, ...o });
  const defs = {
    wood: () => S({ map: woodTexture('w1'), color: 0xb0a090 }),
    darkwood: () => S({ map: woodTexture('w2', [60, 46, 36]), color: 0x9a8a7a }),
    plank: () => S({ map: woodTexture('w3', [80, 66, 50], 3), color: 0xa09080 }),
    bark: () => S({ map: barkTexture(), color: 0x998877 }),
    roof: () => S({ color: 0x2a2523, map: noiseTexture('roof', [90, 85, 80], 60) }),
    rust: () => S({ map: rustTexture(), roughness: 0.75, metalness: 0.3 }),
    metal: () => S({ color: 0x55595c, roughness: 0.5, metalness: 0.6 }),
    concrete: () => S({ map: concreteTexture(), color: 0x9a9a98 }),
    rock: () => S({ color: 0x55585a, map: noiseTexture('rock', [120, 120, 118], 90), flatShading: true }),
    pine: () => {
      const m = S({ color: 0x1a2a1c, flatShading: true });
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = sharedUniforms.uTime; sh.uniforms.uSway = sharedUniforms.uSway;
        sh.vertexShader = 'uniform float uTime; uniform float uSway;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.17;
          #else
          float ph = 0.0;
          #endif
          float hgt = max(position.y, 0.0);
          transformed.x += sin(uTime * 1.3 + ph) * uSway * hgt * 0.035;
          transformed.z += cos(uTime * 1.1 + ph * 1.3) * uSway * hgt * 0.025;`);
      };
      return m;
    },
    deadleaf: () => S({ color: 0x1d1a14, flatShading: true }),
    fabric: () => S({ color: 0x3d4a3a, side: THREE.DoubleSide }),
    tentRed: () => S({ color: 0x6a2420, side: THREE.DoubleSide }),
    glass: () => new THREE.MeshStandardMaterial({ color: 0x223040, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.45 }),
    windowLit: () => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffb060, emissiveIntensity: 1.2 }),
    windowDark: () => S({ color: 0x0b0e12, roughness: 0.2 }),
    paint: () => S({ color: 0x6b7470 }),
    snow: () => S({ color: 0xdfe6ee, roughness: 1 }),
    black: () => S({ color: 0x050505 }),
    skin: () => S({ color: 0xb08a72 }),
    bone: () => S({ color: 0xc8c0a8 }),
    flame: () => new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
    emberGlow: () => new THREE.MeshBasicMaterial({ color: 0xff5010 }),
    lampGlow: () => new THREE.MeshBasicMaterial({ color: 0xffd9a0 }),
  };
  MAT[name] = defs[name]();
  return MAT[name];
}
export function clearMatCache() { for (const k of Object.keys(MAT)) delete MAT[k]; }

export function box(w, h, d, material, x = 0, y = 0, z = 0, parent = null, shadows = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof material === 'string' ? mat(material) : material);
  m.position.set(x, y, z);
  if (shadows) { m.castShadow = true; m.receiveShadow = true; }
  if (parent) parent.add(m);
  return m;
}
export function cyl(rt, rb, h, material, x = 0, y = 0, z = 0, parent = null, seg = 10) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), typeof material === 'string' ? mat(material) : material);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}

// ---------------- vegetation ----------------
function pineGeometry(rnd) {
  const parts = [];
  const tiers = 4 + Math.floor(rnd() * 3);
  for (let i = 0; i < tiers; i++) {
    const r = 2.2 * (1 - i / (tiers + 0.5)) + 0.4;
    const g = new THREE.ConeGeometry(r, 2.6, 7, 1);
    g.translate(0, 2.4 + i * 1.55, 0);
    parts.push(g);
  }
  return mergeGeometries(parts);
}
function deadTreeGeometry(rnd, h = 9) {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.12, 0.35, h, 6); trunk.translate(0, h / 2, 0); parts.push(trunk);
  const n = 5 + Math.floor(rnd() * 5);
  for (let i = 0; i < n; i++) {
    const len = 1.5 + rnd() * 3;
    const b = new THREE.CylinderGeometry(0.03, 0.09, len, 4);
    b.translate(0, len / 2, 0);
    b.rotateZ((rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.7));
    b.rotateY(rnd() * Math.PI * 2);
    b.translate(0, h * (0.35 + rnd() * 0.6), 0);
    parts.push(b);
  }
  return mergeGeometries(parts);
}

// Scatter instanced trees. accept(x, z) -> bool. Returns { trunks, crowns, positions }.
export function forest(level, { count = 400, area = 180, accept = () => true, seed = 1, kind = 'pine', scale = [0.8, 1.4], collide = true, cx = 0, cz = 0 }) {
  const rnd = mulberry32(seed);
  const pts = [];
  let tries = 0;
  while (pts.length < count && tries < count * 20) {
    tries++;
    const x = cx + (rnd() * 2 - 1) * area, z = cz + (rnd() * 2 - 1) * area;
    if (!accept(x, z)) continue;
    pts.push([x, z, scale[0] + rnd() * (scale[1] - scale[0]), rnd() * Math.PI * 2]);
  }
  const dummy = new THREE.Object3D();
  const group = new THREE.Group();
  if (kind === 'pine') {
    const trunkG = new THREE.CylinderGeometry(0.12, 0.28, 3, 6); trunkG.translate(0, 1.5, 0);
    const crownG = pineGeometry(rnd);
    const trunks = new THREE.InstancedMesh(trunkG, mat('bark'), pts.length);
    const crowns = new THREE.InstancedMesh(crownG, mat('pine'), pts.length);
    pts.forEach(([x, z, s, r], i) => {
      dummy.position.set(x, level.heightAt(x, z) - 0.2, z); dummy.rotation.set(0, r, 0); dummy.scale.set(s, s * (0.9 + rnd() * 0.3), s);
      dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix); crowns.setMatrixAt(i, dummy.matrix);
      if (collide) level.addCircle(x, z, 0.35 * s, { occlude: true, tag: 'tree' });
    });
    for (const m of [trunks, crowns]) { m.castShadow = true; m.receiveShadow = true; group.add(m); }
  } else {
    const variants = [0, 1, 2].map(() => deadTreeGeometry(rnd, 7 + rnd() * 5));
    const buckets = [[], [], []];
    pts.forEach((p, i) => buckets[i % 3].push(p));
    buckets.forEach((b, vi) => {
      const im = new THREE.InstancedMesh(variants[vi], mat(kind === 'swamp' ? 'deadleaf' : 'bark'), b.length);
      b.forEach(([x, z, s, r], i) => {
        dummy.position.set(x, level.heightAt(x, z) - 0.3, z); dummy.rotation.set((rnd() - 0.5) * 0.15, r, (rnd() - 0.5) * 0.15); dummy.scale.set(s, s, s);
        dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix);
        if (collide) level.addCircle(x, z, 0.3 * s, { occlude: true, tag: 'tree' });
      });
      im.castShadow = true; im.receiveShadow = true; group.add(im);
    });
  }
  level.scene.add(group);
  return { group, positions: pts };
}

export function rocks(level, { count = 80, area = 180, accept = () => true, seed = 2, scale = [0.4, 1.6], collide = true, color }) {
  const rnd = mulberry32(seed);
  const g = new THREE.DodecahedronGeometry(1, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.8 + rnd() * 0.4), p.getY(i) * (0.6 + rnd() * 0.3), p.getZ(i) * (0.8 + rnd() * 0.4));
  g.computeVertexNormals();
  const m = color ? new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true }) : mat('rock');
  const pts = [];
  let tries = 0;
  while (pts.length < count && tries < count * 20) {
    tries++;
    const x = (rnd() * 2 - 1) * area, z = (rnd() * 2 - 1) * area;
    if (accept(x, z)) pts.push([x, z, scale[0] + rnd() * (scale[1] - scale[0])]);
  }
  const im = new THREE.InstancedMesh(g, m, pts.length);
  const d = new THREE.Object3D();
  pts.forEach(([x, z, s], i) => {
    d.position.set(x, level.heightAt(x, z) + s * 0.1, z); d.rotation.set(rnd(), rnd() * 6, rnd()); d.scale.setScalar(s); d.updateMatrix(); im.setMatrixAt(i, d.matrix);
    if (collide && s > 0.7) level.addCircle(x, z, s * 0.8, { occlude: s > 1.1, y1: level.heightAt(x, z) + s * 0.9 });
  });
  im.castShadow = true; im.receiveShadow = true;
  level.scene.add(im);
  return im;
}

// Grass / reeds (no collision). Blades are thin crossed quads.
export function grass(level, { count = 3000, area = 120, accept = () => true, seed = 4, color = 0x2b3a22, height = [0.3, 0.8], reeds = false }) {
  const rnd = mulberry32(seed);
  const blade = new THREE.PlaneGeometry(reeds ? 0.06 : 0.35, 1, 1, 2);
  blade.translate(0, 0.5, 0);
  const b2 = blade.clone(); b2.rotateY(Math.PI / 2);
  const geo = mergeGeometries([blade, b2]);
  const m = new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 1 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = sharedUniforms.uTime; sh.uniforms.uSway = sharedUniforms.uSway;
    sh.vertexShader = 'uniform float uTime; uniform float uSway;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float ph = instanceMatrix[3].x * 0.5 + instanceMatrix[3].z * 0.3;
      transformed.x += sin(uTime * 2.0 + ph) * position.y * (0.08 + uSway * 0.2);`);
  };
  const pts = [];
  let tries = 0;
  while (pts.length < count && tries < count * 10) {
    tries++;
    const x = (rnd() * 2 - 1) * area, z = (rnd() * 2 - 1) * area;
    if (accept(x, z)) pts.push([x, z]);
  }
  const im = new THREE.InstancedMesh(geo, m, pts.length);
  const d = new THREE.Object3D();
  pts.forEach(([x, z], i) => {
    const h = height[0] + rnd() * (height[1] - height[0]);
    d.position.set(x, level.heightAt(x, z), z); d.rotation.set(0, rnd() * 3, 0); d.scale.set(1, h, 1); d.updateMatrix(); im.setMatrixAt(i, d.matrix);
  });
  im.receiveShadow = true;
  level.scene.add(im);
  return im;
}

// ---------------- structures ----------------
// Generic wooden building with door gaps, optional window light, roof, floor platform and colliders.
export function building(level, o) {
  const { x, z, rot = 0, w = 6, d = 5, h = 2.8, wall = 'darkwood', roof = 'roof', floorMat = 'plank', doors = [{ side: 's', at: 0, width: 1.1 }], windows = [], lit = false, floorY, noRoof = false } = o;
  const g = new THREE.Group();
  const baseY = floorY ?? level.heightAt(x, z) + 0.15;
  g.position.set(x, baseY, z);
  g.rotation.y = rot;
  const t = 0.15;
  const sides = {
    s: { len: w, cx: 0, cz: d / 2, horiz: true },
    n: { len: w, cx: 0, cz: -d / 2, horiz: true },
    e: { len: d, cx: w / 2, cz: 0, horiz: false },
    w: { len: d, cx: -w / 2, cz: 0, horiz: false },
  };
  const doorObjs = [];
  for (const [k, s] of Object.entries(sides)) {
    const gaps = doors.filter((dd) => dd.side === k).map((dd) => [dd.at - dd.width / 2, dd.at + dd.width / 2, dd]);
    gaps.sort((a, b) => a[0] - b[0]);
    let cur = -s.len / 2;
    const segs = [];
    for (const [a, b] of gaps) { if (a > cur) segs.push([cur, a]); cur = b; }
    if (cur < s.len / 2) segs.push([cur, s.len / 2]);
    for (const [a, b] of segs) {
      const L = b - a, mid = (a + b) / 2;
      const lx = s.horiz ? s.cx + mid : s.cx, lz = s.horiz ? s.cz : s.cz + mid;
      box(s.horiz ? L : t, h, s.horiz ? t : L, wall, lx, h / 2, lz, g);
      const [wx, wz] = toWorld(x, z, rot, lx, lz);
      level.addBox(wx, wz, (s.horiz ? L : t) / 2, (s.horiz ? t : L) / 2, -rot, { y0: baseY - 0.5, y1: baseY + h });
    }
    for (const [a, b, dd] of gaps) {
      const mid = (a + b) / 2, L = b - a;
      const lx = s.horiz ? s.cx + mid : s.cx, lz = s.horiz ? s.cz : s.cz + mid;
      box(s.horiz ? L : t, h - 2.05, s.horiz ? t : L, wall, lx, 2.05 + (h - 2.05) / 2, lz, g); // lintel
      if (dd.noDoor) continue;
      // hinged door
      const pivot = new THREE.Group();
      const hx = s.horiz ? s.cx + a : s.cx, hz = s.horiz ? s.cz : s.cz + a;
      pivot.position.set(hx, 0, hz);
      const leaf = box(s.horiz ? L : 0.06, 2.0, s.horiz ? 0.06 : L, 'wood', s.horiz ? L / 2 : 0, 1.0, s.horiz ? 0 : L / 2, pivot);
      leaf.material = mat('wood');
      g.add(pivot);
      const [wx, wz] = toWorld(x, z, rot, lx, lz);
      const col = level.addBox(wx, wz, (s.horiz ? L : 0.1) / 2, (s.horiz ? 0.1 : L) / 2, -rot, { y0: baseY - 0.5, y1: baseY + 2 });
      const door = { pivot, col, open: false, locked: dd.locked || null, side: k };
      const [ix, iz] = toWorld(x, z, rot, lx + (s.horiz ? 0 : (k === 'e' ? 0.6 : -0.6)), lz + (s.horiz ? (k === 's' ? 0.6 : -0.6) : 0));
      door.interact = level.addInteractable({
        pos: { x: wx, y: baseY + 1.2, z: wz }, radius: 1.9,
        prompt: () => (door.open ? 'Close door' : door.locked ? `Locked${door.locked.hint ? ' — ' + door.locked.hint : ''}` : 'Open door'),
        onUse: () => {
          if (door.locked) {
            if (level.game.inventory.has(door.locked.key)) { door.locked = null; level.game.ui.toast('Unlocked'); audio.click(0.3); }
            else { audio.knock(null, 1, 0.3); level.game.ui.toast(door.locked.msg || 'It\'s locked.'); return; }
          }
          door.open = !door.open; audio.door(door.open);
          col.enabled = !door.open;
        },
      });
      door.target = 0;
      level.onUpdate((dt) => {
        const tgt = door.open ? (k === 's' || k === 'w' ? -1.6 : 1.6) : 0;
        pivot.rotation.y += (tgt - pivot.rotation.y) * Math.min(1, dt * 5);
      });
      void ix; void iz;
      doorObjs.push(door);
    }
  }
  // windows (as dark/lit panes on walls, not holes)
  for (const wi of windows) {
    const s = sides[wi.side];
    const lx = s.horiz ? s.cx + wi.at : s.cx + (wi.side === 'e' ? 0.08 : -0.08), lz = s.horiz ? s.cz + (wi.side === 's' ? 0.08 : -0.08) : s.cz + wi.at;
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.8), lit ? mat('windowLit') : mat('windowDark'));
    pane.position.set(lx, 1.5, lz);
    pane.rotation.y = wi.side === 's' ? 0 : wi.side === 'n' ? Math.PI : wi.side === 'e' ? Math.PI / 2 : -Math.PI / 2;
    g.add(pane);
    const inner = pane.clone(); inner.rotation.y += Math.PI;
    inner.position.set(s.horiz ? lx : s.cx + (wi.side === 'e' ? -0.08 : 0.08), 1.5, s.horiz ? s.cz + (wi.side === 's' ? -0.08 : 0.08) : lz);
    g.add(inner);
  }
  // floor
  if (!o.noFloor) {
    const floor = box(w, 0.1, d, floorMat, 0, -0.05, 0, g);
    floor.castShadow = false;
    level.addPlatform(x, z, w / 2, d / 2, -rot, baseY, 'wood');
  }
  // roof
  if (!noRoof) {
    const rg = new THREE.ConeGeometry(Math.hypot(w, d) / 2 * 1.08, 1.6, 4, 1);
    rg.rotateY(Math.PI / 4);
    rg.scale(w / Math.hypot(w, d) * 1.414, 1, d / Math.hypot(w, d) * 1.414);
    const rm = new THREE.Mesh(rg, mat(roof));
    rm.position.y = h + 0.8; rm.castShadow = true; rm.receiveShadow = true;
    g.add(rm);
    box(w, 0.08, d, roof, 0, h, 0, g);
  }
  level.scene.add(g);
  return { group: g, doors: doorObjs, baseY, local: (lx, lz) => toWorld(x, z, rot, lx, lz) };
}

export function dock(level, { x, z, rot = 0, length = 14, width = 2.2, top = 0.6, posts = true }) {
  const g = new THREE.Group();
  g.position.set(x, 0, z); g.rotation.y = rot;
  const deck = box(width, 0.12, length, 'plank', 0, top - 0.06, -length / 2, g);
  deck.material = mat('plank');
  if (posts) for (let i = 0; i <= length; i += 3) for (const s of [-1, 1]) cyl(0.09, 0.11, 3.5, 'darkwood', s * (width / 2 - 0.1), top - 1.6, -i, g, 6);
  level.scene.add(g);
  const [cx, cz] = toWorld(x, z, rot, 0, -length / 2);
  level.addPlatform(cx, cz, width / 2, length / 2, -rot, top, 'wood');
  return { group: g, end: toWorld(x, z, rot, 0, -length + 0.8), top };
}

export function rowboat(level, { x, z, rot = 0, y, color = 0x3d4a52, parent }) {
  const g = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color, roughness: 0.8, map: woodTexture('boat', [80, 80, 80], 8) });
  const shape = new THREE.Shape();
  shape.moveTo(-0.7, -1.9); shape.quadraticCurveTo(-0.85, 0, -0.6, 1.4); shape.lineTo(0, 2.1); shape.lineTo(0.6, 1.4); shape.quadraticCurveTo(0.85, 0, 0.7, -1.9); shape.lineTo(-0.7, -1.9);
  const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.55, bevelEnabled: false }), hullMat);
  hull.rotation.x = Math.PI / 2; hull.position.y = 0.55; hull.castShadow = true;
  g.add(hull);
  const inside = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat('darkwood'));
  inside.rotation.x = -Math.PI / 2; inside.position.y = 0.12; inside.scale.set(0.9, 0.9, 1);
  g.add(inside);
  box(1.3, 0.05, 0.3, 'wood', 0, 0.42, 0.3, g); box(1.2, 0.05, 0.3, 'wood', 0, 0.42, -1.1, g);
  g.position.set(x, y ?? level.waterLevel - 0.15, z);
  g.rotation.y = rot;
  (parent || level.scene).add(g);
  return g;
}

export function tent(level, { x, z, rot = 0, color = 'tentRed', hide = true, name = 'tent' }) {
  const g = new THREE.Group();
  const y = level.heightAt(x, z);
  g.position.set(x, y, z); g.rotation.y = rot;
  const geo = new THREE.ConeGeometry(1.5, 1.6, 4, 1, true); geo.rotateY(Math.PI / 4); geo.scale(1, 1, 1.4);
  const m = new THREE.Mesh(geo, mat(color)); m.position.y = 0.8; m.castShadow = true;
  g.add(m);
  const fl = box(2, 0.03, 2.8, 'fabric', 0, 0.02, 0, g); fl.castShadow = false;
  level.scene.add(g);
  level.addBox(x, z, 0.9, 1.3, -rot, { y0: y - 1, y1: y + 1.5, occlude: true });
  let spot = null;
  if (hide) {
    const [ex, ez] = toWorld(x, z, rot, 0, 1.9);
    const [ix, iz] = toWorld(x, z, rot, 0, 0.6);
    spot = level.addHideSpot({ name, kind: 'tent', pos: new THREE.Vector3(ex, y + 1, ez), view: new THREE.Vector3(ix, y + 0.55, iz), yaw: rot, exit: new THREE.Vector3(ex, y, ez), searchable: true, noise: 0.2 });
  }
  return { group: g, spot };
}

export function car(level, { x, z, rot = 0, color = 0x2c3238, lightsOn = false }) {
  const g = new THREE.Group();
  const y = level.heightAt(x, z);
  g.position.set(x, y, z); g.rotation.y = rot;
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.5 });
  box(1.8, 0.7, 4.3, paint, 0, 0.65, 0, g);
  box(1.6, 0.6, 2.2, paint, 0, 1.25, 0.2, g);
  const glass = box(1.62, 0.5, 2.0, mat('glass'), 0, 1.27, 0.2, g); glass.castShadow = false;
  for (const [wx, wz] of [[-0.85, 1.4], [0.85, 1.4], [-0.85, -1.4], [0.85, -1.4]]) {
    const w = cyl(0.34, 0.34, 0.25, 'black', wx, 0.34, wz, g, 12); w.rotation.z = Math.PI / 2;
  }
  const hlMat = new THREE.MeshBasicMaterial({ color: lightsOn ? 0xfff2cc : 0x333333 });
  const hl1 = box(0.3, 0.15, 0.05, hlMat, -0.6, 0.75, -2.16, g, false), hl2 = box(0.3, 0.15, 0.05, hlMat, 0.6, 0.75, -2.16, g, false);
  void hl1; void hl2;
  const spot = new THREE.SpotLight(0xfff0d0, lightsOn ? 60 : 0, 45, 0.5, 0.6, 1.6);
  spot.position.set(0, 0.8, -2.2);
  const tgt = new THREE.Object3D(); tgt.position.set(0, 0.0, -12); g.add(tgt); spot.target = tgt;
  g.add(spot);
  level.scene.add(g);
  level.addBox(x, z, 0.95, 2.2, -rot, { y0: y - 1, y1: y + 1.6 });
  const [ex, ez] = toWorld(x, z, rot, -1.6, 0.2);
  const [ix, iz] = toWorld(x, z, rot, -0.35, 0.3);
  const hide = level.addHideSpot({ name: 'car', kind: 'car', pos: new THREE.Vector3(ex, y + 1, ez), view: new THREE.Vector3(ix, y + 1.15, iz), yaw: rot, exit: new THREE.Vector3(ex, y, ez), searchable: true, noise: 0.1 });
  const ls = level.addLightSource(new THREE.Vector3(...toWorld(x, z, rot, 0, -6)).setY(y + 1), 9, spot, { safe: false });
  const api = {
    group: g, hide, spot, lightSource: ls,
    setLights(on) { spot.intensity = on ? 60 : 0; hlMat.color.setHex(on ? 0xfff2cc : 0x333333); ls.on = on; ls.baseIntensity = 60; },
  };
  return api;
}

export function campfire(level, { x, z, intensity = 6, radius = 9 }) {
  const y = level.heightAt(x, z);
  const g = new THREE.Group(); g.position.set(x, y, z);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const r = box(0.3, 0.2, 0.25, 'rock', Math.cos(a) * 0.6, 0.1, Math.sin(a) * 0.6, g); r.rotation.y = a; }
  for (let i = 0; i < 4; i++) { const l = cyl(0.06, 0.07, 0.9, 'bark', 0, 0.15, 0, g, 5); l.rotation.z = Math.PI / 2; l.rotation.y = (i / 4) * Math.PI; }
  const flames = [];
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.18 - i * 0.03, 0.6 + i * 0.1, 6), mat('flame'));
    f.position.set((i - 1) * 0.1, 0.4, (i % 2) * 0.08); g.add(f); flames.push(f);
  }
  const light = new THREE.PointLight(0xff8a3c, intensity, 14, 1.6);
  light.position.set(0, 0.9, 0);
  g.add(light);
  level.scene.add(g);
  level.addCircle(x, z, 0.7, { occlude: false, y1: y + 0.5 });
  const ls = level.addLightSource(new THREE.Vector3(x, y + 0.5, z), radius, light, { flicker: 0.4 });
  let lit = true;
  level.onUpdate(() => {
    for (const f of flames) { f.visible = lit; f.scale.y = 0.8 + Math.random() * 0.5; f.rotation.y += 0.1; }
  });
  return {
    group: g, light, ls,
    setLit(v) { lit = v; level.setLightOn(ls, v); },
    get lit() { return lit; },
  };
}

export function lanternLight(level, { x, y, z, color = 0xffc070, intensity = 3, dist = 10, radius = 6, flicker = 0.2, post = false, safe = true }) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  if (post) { cyl(0.05, 0.06, 2.2, 'metal', 0, -1.1, 0, g, 6); }
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.22, 8), mat('lampGlow'));
  g.add(glass);
  const light = new THREE.PointLight(color, intensity, dist, 1.8);
  g.add(light);
  level.scene.add(g);
  const ls = level.addLightSource(new THREE.Vector3(x, y, z), radius, light, { flicker, safe });
  return { group: g, light, ls, glass, setOn(v) { level.setLightOn(ls, v); glass.visible = v; } };
}

// A readable note/poster/sign placed in the world.
export function note(level, { x, y, z, rotY = 0, title, lines, opts = {}, w = 0.45, h = 0.56, journal, onRead, double = false, standalone = false }) {
  const tex = textTexture(lines, { title, ...opts });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, side: double ? THREE.DoubleSide : THREE.FrontSide }));
  m.position.set(x, y, z); m.rotation.y = rotY;
  if (standalone) m.rotation.x = -Math.PI / 2;
  level.scene.add(m);
  const it = level.addInteractable({
    pos: { x, y, z }, radius: 1.8, prompt: `Read: ${title || 'note'}`,
    onUse: () => {
      level.game.ui.showDocument({ title, lines, tex });
      if (journal) level.game.story.addJournal(journal);
      if (onRead) onRead();
    },
  });
  return { mesh: m, interact: it };
}

export function gravestone(level, { x, z, rot = 0, text = '', tilt = 0 }) {
  const y = level.heightAt(x, z);
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.set(tilt, rot, tilt * 0.5);
  box(0.6, 0.9, 0.15, 'concrete', 0, 0.45, 0, g);
  const top = cyl(0.3, 0.3, 0.15, 'concrete', 0, 0.9, 0, g, 12); top.rotation.x = Math.PI / 2; top.scale.set(1, 1, 1);
  if (text) {
    const tex = textTexture(text.split('\n'), { w: 256, h: 256, bg: '#7d7d78', fg: '#2a2a28', size: 28, align: 'center', stains: false });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
    p.position.set(0, 0.55, 0.08); g.add(p);
  }
  level.scene.add(g);
  level.addCircle(x, z, 0.4, { occlude: false, y1: y + 1 });
  return g;
}

export function container(level, { x, z, rot = 0, color = 0x7a2a1c, open = true, hide = true }) {
  const y = level.heightAt(x, z);
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rot;
  const m = new THREE.MeshStandardMaterial({ color, map: rustTexture(), roughness: 0.7, metalness: 0.4 });
  const L = 6, W = 2.4, H = 2.6;
  box(W, H, 0.1, m, 0, H / 2, -L / 2, g);
  box(0.1, H, L, m, -W / 2, H / 2, 0, g); box(0.1, H, L, m, W / 2, H / 2, 0, g);
  box(W, 0.1, L, m, 0, H, 0, g); box(W, 0.1, L, m, 0, 0.05, 0, g);
  if (!open) box(W, H, 0.1, m, 0, H / 2, L / 2, g);
  else { const d = box(0.05, H, W / 2, m, W / 2 + W / 4, H / 2, L / 2 + 0.6, g); d.rotation.y = 0.4; }
  level.scene.add(g);
  level.addPlatform(x, z, W / 2, L / 2, -rot, y + 0.1, 'metal');
  for (const [lx, lz, hw, hd] of [[0, -L / 2, W / 2, 0.08], [-W / 2, 0, 0.08, L / 2], [W / 2, 0, 0.08, L / 2]]) {
    const [wx, wz] = toWorld(x, z, rot, lx, lz); level.addBox(wx, wz, hw, hd, -rot, { y0: y - 1, y1: y + H });
  }
  if (!open) { const [wx, wz] = toWorld(x, z, rot, 0, L / 2); level.addBox(wx, wz, W / 2, 0.08, -rot, { y0: y - 1, y1: y + H }); }
  let spot = null;
  if (open && hide) {
    const [ex, ez] = toWorld(x, z, rot, 0, L / 2 + 1.0);
    const [ix, iz] = toWorld(x, z, rot, 0, -L / 2 + 0.8);
    spot = level.addHideSpot({ name: 'container', kind: 'container', pos: new THREE.Vector3(...toWorld(x, z, rot, 0, L / 2 - 0.5)).setY(y + 1), view: new THREE.Vector3(ix, y + 1.0, iz), yaw: rot, exit: new THREE.Vector3(ex, y, ez), searchable: true, noise: 0.3 });
  }
  return { group: g, spot };
}

export function signPost(level, { x, z, rot = 0, text = '' }) {
  const y = level.heightAt(x, z);
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rot;
  cyl(0.06, 0.07, 2, 'darkwood', 0, 1, 0, g, 6);
  const tex = textTexture([text], { w: 512, h: 160, bg: '#4a3a28', fg: '#d8ccb0', size: 48, align: 'center', stains: false });
  const p = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.45, 0.05), [mat('darkwood'), mat('darkwood'), mat('darkwood'), mat('darkwood'), new THREE.MeshStandardMaterial({ map: tex }), new THREE.MeshStandardMaterial({ map: tex })]);
  p.position.y = 1.8; g.add(p);
  level.scene.add(g);
  return g;
}

export function sharedUpdate(dt, fear) {
  sharedUniforms.uTime.value += dt;
  sharedUniforms.uSway.value = 0.12 + fear * 0.9;
}
