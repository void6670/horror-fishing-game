import * as THREE from 'three';
import { makeCatchModel } from '../fishing/CatchModels.js';
import { ITEMS } from '../systems/Inventory.js';
import { audio } from '../engine/Audio.js';
import { mat, box } from '../world/Props.js';

// A pickup lying in the world. model: catch-model item name or 'box'.
export function pickup(level, { x, z, y, item, qty = 1, model, label, once = true, onTake }) {
  const gy = y ?? level.groundAt(x, z, 50).y;
  let mesh;
  if (model === 'crate' || !model) {
    mesh = new THREE.Group();
    const color = { worm: 0x5a4a2a, minnow: 0x3a5a6a, battery: 0x2a2a2a, medicine: 0xd8d8d0, line: 0x6a6a5a, fuel: 0x8a2a1a, flare: 0xa02020, bottle: 0x3a6a3a, lure: 0x2a6a4a, chum: 0x6a2a2a }[item] || 0x555555;
    const b = box(0.32, 0.18, 0.22, new THREE.MeshStandardMaterial({ color, roughness: 0.7 }), 0, 0.09, 0, mesh);
    if (item === 'medicine') { const c = box(0.12, 0.02, 0.04, new THREE.MeshBasicMaterial({ color: 0xc02020 }), 0, 0.185, 0, mesh); c.castShadow = false; const c2 = c.clone(); c2.rotation.y = Math.PI / 2; mesh.add(c2); }
    if (item === 'fuel') { b.scale.set(0.8, 1.8, 1.2); }
    if (item === 'bottle') { mesh.clear(); const bt = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.25, 8), new THREE.MeshStandardMaterial({ color: 0x3a6a3a, transparent: true, opacity: 0.7, roughness: 0.1 })); bt.position.y = 0.12; mesh.add(bt); }
  } else mesh = makeCatchModel({ model: { type: 'item', item: model } });
  mesh.position.set(x, gy, z);
  level.scene.add(mesh);
  const name = label || (ITEMS[item] ? ITEMS[item].name : item);
  const it = level.addInteractable({
    pos: { x, y: gy + 0.3, z }, radius: 1.7, prompt: `Take ${name}${qty > 1 ? ' ×' + qty : ''}`,
    onUse: () => {
      if (onTake) { onTake(); level.scene.remove(mesh); level.removeInteractable(it); return; }
      const n = level.game.inventory.add(item, qty);
      if (n > 0) { if (once) { level.scene.remove(mesh); level.removeInteractable(it); } }
    },
  });
  return { mesh, it };
}

// Interior hiding spot (closet, under a bed...) positioned in building-local coordinates.
export function closet(level, b, { lx, lz, rot = 0, name = 'closet', w = 0.9, d = 0.6 }) {
  const g = new THREE.Group();
  const [x, z] = b.local(lx, lz);
  g.position.set(x, b.baseY, z);
  g.rotation.y = b.group.rotation.y + rot;
  box(w, 2.0, 0.05, 'darkwood', 0, 1.0, -d / 2, g); box(0.05, 2.0, d, 'darkwood', -w / 2, 1.0, 0, g); box(0.05, 2.0, d, 'darkwood', w / 2, 1.0, 0, g);
  box(w, 0.05, d, 'darkwood', 0, 2.0, 0, g);
  const door = box(w * 0.48, 1.9, 0.04, 'wood', -w * 0.25, 0.97, d / 2, g); door.rotation.y = 0.5;
  level.scene.add(g);
  const fwd = new THREE.Vector3(Math.sin(g.rotation.y), 0, Math.cos(g.rotation.y));
  const view = new THREE.Vector3(x, b.baseY + 1.5, z);
  return level.addHideSpot({ name, kind: 'closet', pos: view.clone().add(fwd.clone().multiplyScalar(0.6)), view, yaw: g.rotation.y + Math.PI, exit: new THREE.Vector3(x, b.baseY, z).add(fwd.clone().multiplyScalar(1.0)), searchable: true, lookLimit: 0.5 });
}

export function bed(level, b, { lx, lz, rot = 0, hide = true, small = false }) {
  const g = new THREE.Group();
  const [x, z] = b.local(lx, lz);
  g.position.set(x, b.baseY, z); g.rotation.y = b.group.rotation.y + rot;
  const L = small ? 1.6 : 2.0;
  box(0.95, 0.35, L, 'darkwood', 0, 0.25, 0, g);
  box(0.9, 0.12, L - 0.05, new THREE.MeshStandardMaterial({ color: 0x6a6a5e, roughness: 1 }), 0, 0.48, 0, g);
  box(0.6, 0.1, 0.3, new THREE.MeshStandardMaterial({ color: 0xc8c8b8, roughness: 1 }), 0, 0.58, -L / 2 + 0.25, g);
  level.scene.add(g);
  level.addBox(x, z, 0.5, L / 2, -g.rotation.y, { y0: b.baseY - 0.5, y1: b.baseY + 0.6, occlude: false });
  if (hide) {
    const side = new THREE.Vector3(Math.cos(g.rotation.y), 0, -Math.sin(g.rotation.y));
    return level.addHideSpot({ name: 'under the bed', kind: 'bed', pos: new THREE.Vector3(x, b.baseY + 0.6, z).add(side.clone().multiplyScalar(0.8)), view: new THREE.Vector3(x, b.baseY + 0.18, z), yaw: g.rotation.y + Math.PI / 2, exit: new THREE.Vector3(x, b.baseY, z).add(side.clone().multiplyScalar(1.1)), searchable: true, lookLimit: 0.7 });
  }
  return null;
}

export function table(level, b, { lx, lz, rot = 0 }) {
  const g = new THREE.Group();
  const [x, z] = b.local(lx, lz);
  g.position.set(x, b.baseY, z); g.rotation.y = b.group.rotation.y + rot;
  box(1.2, 0.05, 0.7, 'wood', 0, 0.75, 0, g);
  for (const [a, c] of [[-0.55, -0.3], [0.55, -0.3], [-0.55, 0.3], [0.55, 0.3]]) box(0.05, 0.75, 0.05, 'wood', a, 0.375, c, g);
  level.scene.add(g);
  level.addBox(x, z, 0.6, 0.35, -g.rotation.y, { y0: b.baseY - 0.5, y1: b.baseY + 0.8, occlude: false });
  return { group: g, top: b.baseY + 0.78, x, z };
}

// Cabin lantern you can switch on (a safe light).
export function switchableLamp(level, { x, y, z, on = false, label = 'lantern' }) {
  const light = new THREE.PointLight(0xffb868, on ? 3.5 : 0, 9, 1.6);
  light.position.set(x, y, z);
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.2, 8), on ? mat('lampGlow') : new THREE.MeshStandardMaterial({ color: 0x40382a }));
  glass.position.set(x, y, z);
  level.scene.add(light, glass);
  const ls = level.addLightSource(new THREE.Vector3(x, y, z), 6, light, {});
  ls.baseIntensity = 3.5;
  ls.on = on;
  const api = {
    on, light, ls,
    set(v) { api.on = v; level.setLightOn(ls, v); light.intensity = v ? 3.5 : 0; glass.material = v ? mat('lampGlow') : new THREE.MeshStandardMaterial({ color: 0x40382a }); },
  };
  level.addInteractable({ pos: { x, y, z }, radius: 1.8, prompt: () => (api.on ? `Turn off ${label}` : `Light the ${label}`), onUse: () => { api.set(!api.on); audio.click(0.2); level.game.noise.emit(new THREE.Vector3(x, y, z), 3, 'click'); } });
  return api;
}

// Standard starting kit; upgrades add to it.
export function starterKit(game, extra = []) {
  const inv = game.inventory;
  const u = game.story.upgrades;
  inv.reset(6 + (u.vest ? 2 : 0));
  inv.add('worm', u.bait ? 12 : 8, null, true);
  if (u.bait) inv.add('minnow', 4, null, true);
  inv.add('line', 2, null, true);
  if (u.kit) inv.add('medicine', 1, null, true);
  for (const [id, n] of extra) inv.add(id, n, null, true);
}

// Find the shoreline radius at an angle for radial lakes.
export function shoreRadius(level, angle, cx = 0, cz = 0, waterLevel = 0, max = 200) {
  for (let r = 2; r < max; r += 0.5) {
    if (level.heightAt(cx + Math.cos(angle) * r, cz + Math.sin(angle) * r) > waterLevel) return r;
  }
  return max;
}
