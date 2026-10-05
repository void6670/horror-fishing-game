import * as THREE from 'three';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const chance = (p) => Math.random() < p;
export const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
export const angleWrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

export function weightedPick(list, weightFn) {
  let total = 0;
  const ws = list.map((x) => { const w = Math.max(0, weightFn(x)); total += w; return w; });
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (let i = 0; i < list.length; i++) { r -= ws[i]; if (r <= 0) return list[i]; }
  return list[list.length - 1];
}

const _v = new THREE.Vector3();
const _f = new THREE.Vector3();
// Is a world point within the camera's view cone (ignores occlusion)?
export function inView(camera, point, margin = 0.85) {
  camera.getWorldDirection(_f);
  _v.copy(point).sub(camera.position);
  const d = _v.length();
  if (d < 0.001) return true;
  _v.divideScalar(d);
  const halfFov = THREE.MathUtils.degToRad(camera.fov * 0.5) * camera.aspect;
  return _v.dot(_f) > Math.cos(Math.min(halfFov, Math.PI * 0.49) * margin);
}
// Angle (radians) between camera forward and a point.
export function viewAngle(camera, point) {
  camera.getWorldDirection(_f);
  _v.copy(point).sub(camera.position).normalize();
  return Math.acos(clamp(_v.dot(_f), -1, 1));
}

export function fmtTime(hour) {
  // hour: 0..6 starting at 12:00 AM
  const h = Math.floor(hour);
  const m = Math.floor((hour - h) * 60);
  const hh = h === 0 ? 12 : h;
  return `${hh}:${String(m).padStart(2, '0')} AM`;
}
