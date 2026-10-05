import * as THREE from 'three';
import { clockFaceTexture, drawClockFace, photoTexture, textTexture } from '../world/Materials.js';
import { CONFIG } from '../config.js';

// Procedural models for everything that can come out of the water.
function fishSkin(base, pattern = 'plain', belly = '#d8d0b0', symbols = null) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, base); grd.addColorStop(0.55, base); grd.addColorStop(1, belly);
  g.fillStyle = grd; g.fillRect(0, 0, 256, 128);
  if (pattern === 'bars') { g.fillStyle = 'rgba(10,20,10,0.45)'; for (let x = 30; x < 230; x += 32) g.fillRect(x, 0, 12, 70); }
  if (pattern === 'spots') { g.fillStyle = 'rgba(240,240,220,0.45)'; for (let i = 0; i < 60; i++) { g.beginPath(); g.arc(Math.random() * 256, Math.random() * 80, 2 + Math.random() * 3, 0, 7); g.fill(); } }
  if (pattern === 'stripe') { g.fillStyle = 'rgba(200,80,120,0.5)'; g.fillRect(0, 55, 256, 14); }
  if (pattern === 'mottled') { for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.3})`; g.beginPath(); g.arc(Math.random() * 256, Math.random() * 128, 3 + Math.random() * 9, 0, 7); g.fill(); } }
  // scales
  g.strokeStyle = 'rgba(255,255,255,0.08)';
  for (let y = 0; y < 128; y += 8) for (let x = (y / 8) % 2 ? 4 : 0; x < 256; x += 8) { g.beginPath(); g.arc(x, y, 5, 0, Math.PI); g.stroke(); }
  if (symbols) {
    g.strokeStyle = 'rgba(120,10,10,0.9)'; g.lineWidth = 3; g.fillStyle = 'rgba(120,10,10,0.9)';
    g.font = 'bold 30px Georgia'; g.textAlign = 'center';
    g.fillText(symbols, 128, 70);
    for (let i = 0; i < 6; i++) { g.beginPath(); const x = 20 + i * 40; g.moveTo(x, 95); g.lineTo(x + 10, 110); g.lineTo(x + 20, 95); g.stroke(); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.1 });
const scleraMat = new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.3 });
const irisMat = new THREE.MeshStandardMaterial({ color: 0x3a6a8a, roughness: 0.2 });
const toothMat = new THREE.MeshStandardMaterial({ color: 0xe8e2cc, roughness: 0.4 });
const gumMat = new THREE.MeshStandardMaterial({ color: 0x8a3a40, roughness: 0.6 });

// desc: { len, color, pattern, belly, fat, teeth:'human'|'fangs'|null, eyes:'human'|'many'|'none'|null, symbols, glow, eel, face }
export function makeFish(desc) {
  const g = new THREE.Group();
  const len = desc.len || 0.35;
  const fat = desc.fat || 0.28;
  const mat = new THREE.MeshStandardMaterial({ map: fishSkin(desc.color || '#5a6a40', desc.pattern, desc.belly, desc.symbols), roughness: 0.35, metalness: 0.15 });
  if (desc.glow) { mat.emissive = new THREE.Color(desc.glow); mat.emissiveIntensity = 0.5; }
  if (desc.translucent) { mat.transparent = true; mat.opacity = 0.55; }
  const bodyGeo = new THREE.SphereGeometry(0.5, 20, 14);
  bodyGeo.scale(desc.eel ? 0.08 : 1, desc.eel ? 0.08 : fat, desc.eel ? 1 : fat * 0.55);
  // taper the tail end
  const p = bodyGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    if (!desc.eel && x < 0) { const k = 1 + x * 1.1; p.setY(i, p.getY(i) * k); p.setZ(i, p.getZ(i) * k); }
  }
  bodyGeo.computeVertexNormals();
  const body = new THREE.Mesh(bodyGeo, mat);
  if (desc.eel) { body.rotation.y = Math.PI / 2; }
  body.scale.setScalar(len);
  g.add(body);
  const finMat = new THREE.MeshStandardMaterial({ color: desc.fin || desc.color || '#4a5030', side: THREE.DoubleSide, roughness: 0.6, transparent: true, opacity: 0.85 });
  if (!desc.eel) {
    const tail = new THREE.Mesh(new THREE.ConeGeometry(fat * 0.5 * len, 0.3 * len, 3), finMat);
    tail.scale.z = 0.15; tail.rotation.z = Math.PI / 2; tail.position.x = -0.6 * len;
    g.add(tail);
    const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.12 * len, 0.18 * len, 3), finMat);
    dorsal.scale.z = 0.1; dorsal.position.set(0.02 * len, fat * 0.5 * len, 0);
    g.add(dorsal);
    if (desc.teeth === 'fangs' || desc.spiky) for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(new THREE.ConeGeometry(0.008 * len * 3, 0.1 * len, 4), finMat); s.position.set((0.2 - i * 0.08) * len, fat * 0.52 * len, 0); g.add(s); }
  }
  const headX = desc.eel ? 0 : 0.38 * len;
  const headZ = desc.eel ? 0.5 * len : 0;
  // eyes
  const side = (fn) => [1, -1].forEach((s) => fn(s));
  if (desc.eyes === 'human') {
    side((s) => {
      const e = new THREE.Group();
      const sc = new THREE.Mesh(new THREE.SphereGeometry(0.06 * len, 12, 10), scleraMat); sc.scale.set(1, 0.7, 0.6); e.add(sc);
      const ir = new THREE.Mesh(new THREE.SphereGeometry(0.03 * len, 10, 8), irisMat); ir.position.z = 0.025 * len; e.add(ir);
      const pu = new THREE.Mesh(new THREE.SphereGeometry(0.015 * len, 8, 6), eyeMat); pu.position.z = 0.04 * len; e.add(pu);
      const lid = new THREE.Mesh(new THREE.SphereGeometry(0.065 * len, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2.6), new THREE.MeshStandardMaterial({ color: 0x9a7a6a })); lid.position.y = 0.005; e.add(lid);
      e.position.set(headX + (desc.eel ? 0 : 0), fat * 0.12 * len, s * fat * 0.25 * len + headZ);
      if (desc.eel) e.position.set(s * 0.04 * len, 0.02 * len, headZ);
      e.rotation.y = s > 0 ? 0 : Math.PI;
      g.add(e);
    });
  } else if (desc.eyes === 'many') {
    for (let i = 0; i < 9; i++) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.02 * len, 8, 6), i % 2 ? scleraMat : eyeMat);
      e.position.set((0.3 - i * 0.07) * len, (Math.random() * 0.1) * len, (i % 2 ? 1 : -1) * fat * 0.26 * len);
      g.add(e);
    }
  } else if (desc.eyes !== 'none') {
    side((s) => {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.035 * len, 10, 8), desc.eyesWrong ? scleraMat : eyeMat);
      e.position.set(headX + 0.02 * len, fat * 0.1 * len, s * fat * 0.25 * len + headZ);
      if (desc.eyesWrong && s < 0) e.position.x = -0.3 * len;
      g.add(e);
    });
  }
  if (desc.teeth === 'human') {
    const mouth = new THREE.Group();
    const gum = new THREE.Mesh(new THREE.BoxGeometry(0.02 * len, 0.05 * len, fat * 0.4 * len), gumMat);
    mouth.add(gum);
    for (let i = 0; i < 8; i++) for (const row of [1, -1]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.02 * len, 0.03 * len, 0.022 * len), toothMat);
      t.position.set(0.01 * len, row * 0.025 * len, (i - 3.5) * 0.026 * len);
      mouth.add(t);
    }
    mouth.position.set(0.5 * len, -0.02 * len, 0);
    if (desc.eel) { mouth.position.set(0, 0, 0.52 * len); mouth.rotation.y = Math.PI / 2; }
    g.add(mouth);
  }
  if (desc.teeth === 'fangs') {
    for (let i = 0; i < 6; i++) {
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.008 * len, 0.08 * len, 4), toothMat);
      t.position.set(0.48 * len, (i % 2 ? -1 : 1) * 0.03 * len, (i - 2.5) * 0.02 * len); t.rotation.z = i % 2 ? 0 : Math.PI;
      g.add(t);
    }
  }
  if (desc.lureBulb) {
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.005 * len, 0.008 * len, 0.3 * len, 4), finMat);
    stalk.position.set(0.45 * len, 0.3 * len, 0); stalk.rotation.z = -0.6; g.add(stalk);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.04 * len, 8, 6), new THREE.MeshBasicMaterial({ color: 0xbfffd0 }));
    bulb.position.set(0.55 * len, 0.42 * len, 0); g.add(bulb);
  }
  if (desc.face) { // a faint human face pressed from inside the flank
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.11 * len, 14, 10), new THREE.MeshStandardMaterial({ color: 0xa08a78, roughness: 0.5 }));
    f.scale.set(0.8, 1, 0.35); f.position.set(0.02 * len, 0, fat * 0.24 * len);
    g.add(f);
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.012 * len, 6, 4), eyeMat); e.position.set(0.02 * len + s * 0.035 * len, 0.03 * len, fat * 0.28 * len); g.add(e); }
    const m = new THREE.Mesh(new THREE.TorusGeometry(0.02 * len, 0.005 * len, 4, 10), eyeMat); m.position.set(0.02 * len, -0.04 * len, fat * 0.28 * len); g.add(m);
  }
  g.userData.len = len;
  return g;
}

export function makeAlarmClock() {
  const g = new THREE.Group();
  const brass = new THREE.MeshStandardMaterial({ color: 0x8a6a2a, roughness: 0.35, metalness: 0.85 });
  const tex = clockFaceTexture();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.045, 28), [brass, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4 }), brass]);
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.07, 24), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, roughness: 0 }));
  glass.position.z = 0.024; g.add(glass);
  for (const s of [-1, 1]) {
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.038, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), brass);
    bell.position.set(s * 0.045, 0.085, 0); bell.rotation.z = -s * 0.5; g.add(bell);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.01, 0.03, 6), brass);
    leg.position.set(s * 0.05, -0.085, 0); leg.rotation.z = s * 0.4; g.add(leg);
  }
  const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.04, 0.006), brass); hammer.position.set(0, 0.095, 0); g.add(hammer);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.004, 6, 12), brass); ring.position.set(0, 0.11, 0); g.add(ring);
  // weed & rust
  const weed = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.004, 4, 20, 2.5), new THREE.MeshStandardMaterial({ color: 0x2a3a1a })); weed.rotation.set(1.2, 0.3, 0); g.add(weed);
  g.userData.face = tex;
  g.userData.hammer = hammer;
  g.userData.setTime = (h, m, cracked) => drawClockFace(tex, h, m, cracked);
  g.scale.setScalar(1.6);
  return g;
}

function simpleItem(kind) {
  const g = new THREE.Group();
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...o });
  switch (kind) {
    case 'boot': {
      const a = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.1), M(0x1e1a14)); a.position.y = 0.06; g.add(a);
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.26), M(0x1e1a14)); b.position.set(0, -0.06, 0.06); g.add(b); break;
    }
    case 'can': { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 12), M(0x6a3020, { metalness: 0.7, roughness: 0.5 })); g.add(c); break; }
    case 'weeds': for (let i = 0; i < 8; i++) { const w = new THREE.Mesh(new THREE.TorusGeometry(0.06 + Math.random() * 0.05, 0.006, 4, 12, 4), M(0x2a3a1a)); w.rotation.set(Math.random() * 3, Math.random() * 3, 0); g.add(w); } break;
    case 'key': {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.006, 6, 12), M(0x6a5a3a, { metalness: 0.8 })); g.add(ring);
      const sh = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.09, 0.006), M(0x6a5a3a, { metalness: 0.8 })); sh.position.y = -0.07; g.add(sh);
      const bit = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.012, 0.006), M(0x6a5a3a, { metalness: 0.8 })); bit.position.set(0.012, -0.1, 0); g.add(bit);
      const tag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.025, 0.002), M(0xc8b890)); tag.position.set(0.04, 0.02, 0); g.add(tag);
      g.scale.setScalar(1.8); break;
    }
    case 'photo': case 'photo2': {
      const tex = photoTexture(kind === 'photo2' ? 'dock' : 'lake', kind === 'photo2' ? `${CONFIG.playerName}'s job: wake us at 4` : 'Hollow Lake');
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.19), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 }));
      g.add(p); break;
    }
    case 'phone': {
      const a = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.015), M(0x2a2a30, { metalness: 0.3 })); a.position.y = -0.045; g.add(a);
      const b = a.clone(); b.position.y = 0.045; b.rotation.x = -0.4; g.add(b);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 0.04), new THREE.MeshBasicMaterial({ color: 0x7ab0ff })); scr.position.set(0, 0.05, 0.009); scr.rotation.x = -0.4; g.add(scr); break;
    }
    case 'mitten': {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), M(0xc23a3a)); m.scale.set(1, 1.4, 0.45); g.add(m);
      const th = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), M(0xc23a3a)); th.position.set(0.055, -0.01, 0); th.scale.set(1, 1.6, 0.6); g.add(th);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 10), M(0xeeeeee)); cuff.position.y = -0.09; cuff.scale.z = 0.5; g.add(cuff); break;
    }
    case 'watch': {
      const face = textTexture(['4:17'], { w: 128, h: 128, bg: '#e8e0c8', fg: '#111', size: 40, align: 'center', stains: false });
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.01, 18), [M(0xaaaaaa, { metalness: 0.9 }), new THREE.MeshStandardMaterial({ map: face }), M(0xaaaaaa)]);
      c.rotation.x = Math.PI / 2; g.add(c);
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.008, 4, 20), M(0xd86aa8)); strap.scale.set(1, 1.3, 1); g.add(strap);
      g.scale.setScalar(1.8); break;
    }
    case 'ribbon': {
      const y = M(0xf0c020, { side: THREE.DoubleSide });
      for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.09, 3), y); l.rotation.z = s * Math.PI / 2; l.position.x = s * 0.045; l.scale.z = 0.2; g.add(l); }
      const t1 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.14, 0.004), y); t1.position.set(-0.02, -0.07, 0); t1.rotation.z = 0.3; g.add(t1);
      const t2 = t1.clone(); t2.position.x = 0.02; t2.rotation.z = -0.3; g.add(t2);
      g.scale.setScalar(1.5); break;
    }
    case 'hat': {
      const c = M(0x4a4a30);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.01, 18), c); g.add(brim);
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.09, 14), c); crown.position.y = 0.05; g.add(crown); break;
    }
    case 'tooth': { const t = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.2, 6), M(0xe8e0c8)); g.add(t); break; }
    case 'scale': { const s = new THREE.Mesh(new THREE.CircleGeometry(0.12, 6), M(0x0a0a10, { metalness: 0.9, roughness: 0.1, side: THREE.DoubleSide })); g.add(s); break; }
    case 'tag': { const t = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.004), M(0xb08a40, { metalness: 0.9, roughness: 0.3 })); g.add(t); break; }
    case 'eye': {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10), new THREE.MeshStandardMaterial({ color: 0xdcd8d0, roughness: 0.2 })); g.add(e);
      const ir = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), new THREE.MeshStandardMaterial({ color: 0x9aa0a0, transparent: true, opacity: 0.8 })); ir.position.z = 0.035; g.add(ir); break;
    }
    case 'bulb': { const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), new THREE.MeshBasicMaterial({ color: 0xc8ffd8 })); g.add(b); const l = new THREE.PointLight(0x9affc0, 0.6, 2); g.add(l); break; }
    case 'doll': {
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 10), M(0xe8c8b0, { roughness: 0.3 })); g.add(h);
      for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.01, 6, 4), M(0x223344)); e.position.set(s * 0.022, 0.01, 0.052); g.add(e); }
      const hair = new THREE.Mesh(new THREE.SphereGeometry(0.063, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M(0xd8a040)); hair.position.y = 0.005; g.add(hair); break;
    }
    case 'hand': {
      const m = M(0x7a8a80, { roughness: 0.4 });
      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.03), m); g.add(palm);
      for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.09, 5), m); f.position.set(-0.033 + i * 0.022, 0.09, 0); f.rotation.x = 0.3; g.add(f); }
      const th = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.06, 5), m); th.position.set(0.055, 0.02, 0); th.rotation.z = -0.8; g.add(th);
      const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8), m); wrist.position.y = -0.1; g.add(wrist); break;
    }
    case 'tape': {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.064, 0.012), M(0x222222)); g.add(b);
      const l = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.03), new THREE.MeshStandardMaterial({ map: textTexture(['DAD'], { w: 128, h: 48, size: 28, bg: '#e8e0c8', stains: false }) })); l.position.z = 0.007; g.add(l); break;
    }
    default: { const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), M(0x555555)); g.add(b); }
  }
  return g;
}

export function makeCatchModel(entry) {
  const m = entry.model || { type: 'fish' };
  if (m.type === 'fish') return makeFish(m);
  if (m.type === 'clock') return makeAlarmClock();
  return simpleItem(m.item);
}
