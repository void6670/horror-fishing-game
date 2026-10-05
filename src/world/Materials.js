import * as THREE from 'three';
import { mulberry32 } from '../util/noise.js';
import { CONFIG } from '../config.js';

// Procedurally painted canvas textures so the game ships with zero image assets.
const cache = new Map();

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function toTex(c, repeat = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function noiseTexture(key = 'ground', base = [128, 128, 128], spread = 40, size = 256, seed = 3) {
  const k = `noise:${key}`;
  if (cache.has(k)) return cache.get(k);
  const c = canvas(size, size), g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const rnd = mulberry32(seed);
  for (let i = 0; i < size * size; i++) {
    const n = (rnd() - 0.5) * spread;
    img.data[i * 4] = base[0] + n; img.data[i * 4 + 1] = base[1] + n; img.data[i * 4 + 2] = base[2] + n; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // blotches
  for (let i = 0; i < 160; i++) {
    g.fillStyle = `rgba(${rnd() < 0.5 ? 0 : 255},${rnd() < 0.5 ? 0 : 255},${rnd() < 0.5 ? 0 : 255},0.03)`;
    g.beginPath(); g.arc(rnd() * size, rnd() * size, 4 + rnd() * 30, 0, Math.PI * 2); g.fill();
  }
  const t = toTex(c);
  cache.set(k, t);
  return t;
}

export function woodTexture(key = 'wood', tint = [92, 70, 52], planks = 6) {
  const k = `wood:${key}`;
  if (cache.has(k)) return cache.get(k);
  const S = 256; const c = canvas(S, S), g = c.getContext('2d');
  const rnd = mulberry32(7);
  for (let p = 0; p < planks; p++) {
    const y0 = (p * S) / planks, hh = S / planks;
    const v = 0.75 + rnd() * 0.35;
    g.fillStyle = `rgb(${tint[0] * v},${tint[1] * v},${tint[2] * v})`;
    g.fillRect(0, y0, S, hh);
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = `rgba(20,12,6,${0.08 + rnd() * 0.12})`;
      g.beginPath(); const yy = y0 + rnd() * hh; g.moveTo(0, yy); g.bezierCurveTo(S * 0.3, yy + rnd() * 4 - 2, S * 0.6, yy + rnd() * 4 - 2, S, yy + rnd() * 3); g.stroke();
    }
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, y0, S, 2);
    g.fillStyle = 'rgba(30,20,10,0.8)';
    g.fillRect(8 + rnd() * 6, y0 + hh / 2 - 2, 3, 3); g.fillRect(S - 14, y0 + hh / 2 - 2, 3, 3);
  }
  const t = toTex(c); cache.set(k, t); return t;
}

export function barkTexture() {
  if (cache.has('bark')) return cache.get('bark');
  const S = 128; const c = canvas(S, S * 2), g = c.getContext('2d');
  g.fillStyle = '#3a2d22'; g.fillRect(0, 0, S, S * 2);
  const rnd = mulberry32(11);
  for (let i = 0; i < 90; i++) {
    g.strokeStyle = `rgba(${rnd() < 0.5 ? 15 : 80},${rnd() < 0.5 ? 10 : 65},${rnd() < 0.5 ? 6 : 50},0.5)`;
    g.lineWidth = 1 + rnd() * 3;
    const x = rnd() * S; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + rnd() * 10 - 5, S * 2); g.stroke();
  }
  const t = toTex(c); cache.set('bark', t); return t;
}

export function rustTexture() {
  if (cache.has('rust')) return cache.get('rust');
  const S = 256; const c = canvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#4a4f52'; g.fillRect(0, 0, S, S);
  const rnd = mulberry32(5);
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(${110 + rnd() * 60},${50 + rnd() * 30},${20 + rnd() * 15},${0.05 + rnd() * 0.2})`;
    g.beginPath(); g.arc(rnd() * S, rnd() * S, 2 + rnd() * 20, 0, Math.PI * 2); g.fill();
  }
  for (let x = 0; x < S; x += 32) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, 0, 3, S); }
  for (let i = 0; i < 30; i++) { g.fillStyle = 'rgba(60,25,10,0.25)'; g.fillRect(rnd() * S, rnd() * S * 0.5, 2 + rnd() * 3, 40 + rnd() * 100); }
  const t = toTex(c); cache.set('rust', t); return t;
}

export function concreteTexture() {
  if (cache.has('concrete')) return cache.get('concrete');
  const t = noiseTexture('concrete', [105, 105, 102], 50, 256, 9); cache.set('concrete', t); return t;
}

export function wallpaperTexture(color = '#5b6a5a', accent = '#46524a') {
  const k = `wall:${color}`;
  if (cache.has(k)) return cache.get(k);
  const S = 128; const c = canvas(S, S), g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, S, S);
  g.fillStyle = accent;
  for (let x = 0; x < S; x += 16) g.fillRect(x, 0, 4, S);
  for (let y = 8; y < S; y += 32) for (let x = 8; x < S; x += 32) { g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill(); }
  const t = toTex(c); cache.set(k, t); return t;
}

// Wraps text into a paper/poster texture.
export function textTexture(lines, opts = {}) {
  const { w = 512, h = 640, bg = '#d8d0b8', fg = '#1a1612', font = 'Georgia, serif', size = 26, title, titleSize = 44, stains = true, align = 'left', image } = opts;
  const c = canvas(w, h), g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  const rnd = mulberry32(lines.join('').length + 3);
  if (stains) for (let i = 0; i < 14; i++) {
    g.fillStyle = `rgba(90,70,40,${0.04 + rnd() * 0.08})`;
    g.beginPath(); g.arc(rnd() * w, rnd() * h, 10 + rnd() * 70, 0, Math.PI * 2); g.fill();
  }
  let y = 40;
  g.fillStyle = fg; g.textAlign = align;
  const x = align === 'center' ? w / 2 : 30;
  if (title) { g.font = `bold ${titleSize}px ${font}`; g.fillText(title, align === 'center' ? w / 2 : 30, y + titleSize * 0.6); y += titleSize + 18; }
  if (image) { image(g, 30, y, w - 60, h * 0.38); y += h * 0.38 + 16; }
  g.font = `${size}px ${font}`;
  for (const line of lines) {
    const words = line.split(' ');
    let cur = '';
    for (const wd of words) {
      const test = cur ? cur + ' ' + wd : wd;
      if (g.measureText(test).width > w - 60) { g.fillText(cur, x, y); y += size * 1.3; cur = wd; } else cur = test;
    }
    g.fillText(cur, x, y); y += size * 1.3 + 4;
  }
  return toTex(c, 1);
}

// Draws a faded "photograph" of a lake scene; variant controls figures.
export function drawPhoto(g, x, y, w, h, variant = 'lake') {
  const grd = g.createLinearGradient(x, y, x, y + h);
  grd.addColorStop(0, variant === 'ice' ? '#9aa6ad' : '#c9a777'); grd.addColorStop(0.55, variant === 'ice' ? '#d9dfe0' : '#8a7a5c'); grd.addColorStop(1, '#3d4a48');
  g.fillStyle = grd; g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(40,50,45,0.85)';
  for (let i = 0; i < 18; i++) { const tx = x + (i / 18) * w; const th = h * (0.25 + ((i * 37) % 10) / 40); g.beginPath(); g.moveTo(tx - 12, y + h * 0.55); g.lineTo(tx, y + h * 0.55 - th); g.lineTo(tx + 12, y + h * 0.55); g.fill(); }
  g.fillStyle = variant === 'ice' ? 'rgba(220,230,235,0.9)' : 'rgba(70,90,95,0.9)'; g.fillRect(x, y + h * 0.58, w, h * 0.42);
  const fig = (fx, fh, hat = false, scratched = false) => {
    g.fillStyle = 'rgba(25,20,18,0.95)';
    g.fillRect(fx - fh * 0.12, y + h * 0.95 - fh, fh * 0.24, fh * 0.75);
    g.beginPath(); g.arc(fx, y + h * 0.95 - fh - fh * 0.08, fh * 0.11, 0, Math.PI * 2); g.fill();
    if (hat) g.fillRect(fx - fh * 0.2, y + h * 0.95 - fh - fh * 0.16, fh * 0.4, fh * 0.05);
    if (scratched) {
      g.strokeStyle = 'rgba(240,235,220,0.95)'; g.lineWidth = 3;
      for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(fx - fh * 0.15 + Math.random() * 4, y + h * 0.95 - fh * 1.25 + i * 3); g.lineTo(fx + fh * 0.15, y + h * 0.95 - fh * 1.05 + Math.random() * 6); g.stroke(); }
    }
  };
  if (variant === 'lake' || variant === 'family') { fig(x + w * 0.3, h * 0.55, true, true); fig(x + w * 0.5, h * 0.42, false, variant === 'family'); fig(x + w * 0.64, h * 0.28, false, false); }
  if (variant === 'ice') { fig(x + w * 0.5, h * 0.3, false, false); }
  if (variant === 'dock') { g.fillStyle = 'rgba(60,45,30,1)'; g.fillRect(x + w * 0.2, y + h * 0.7, w * 0.6, h * 0.05); fig(x + w * 0.45, h * 0.35); fig(x + w * 0.58, h * 0.22); }
  // fade & scratches
  g.fillStyle = 'rgba(255,240,200,0.12)'; g.fillRect(x, y, w, h);
  g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 1;
  for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(x + Math.random() * w, y); g.lineTo(x + Math.random() * w, y + h); g.stroke(); }
}

export function photoTexture(variant = 'lake', caption = '') {
  const k = `photo:${variant}:${caption}`;
  if (cache.has(k)) return cache.get(k);
  const c = canvas(320, 380), g = c.getContext('2d');
  g.fillStyle = '#eee8d8'; g.fillRect(0, 0, 320, 380);
  drawPhoto(g, 18, 18, 284, 284, variant);
  g.fillStyle = '#3a3026'; g.font = 'italic 20px "Brush Script MT", cursive, Georgia'; g.fillText(caption, 26, 345);
  const t = toTex(c); cache.set(k, t); return t;
}

// Analog alarm clock face showing a given time. Returns a canvas texture that can be redrawn.
export function clockFaceTexture() {
  const c = canvas(256, 256);
  const t = toTex(c);
  t.userData = { canvas: c };
  drawClockFace(t, 0, 0);
  return t;
}
export function drawClockFace(tex, hour, minute, cracked = false) {
  const c = tex.userData.canvas, g = c.getContext('2d');
  g.fillStyle = '#efe6cf'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#e8dcbf'; g.beginPath(); g.arc(128, 128, 120, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2a221a'; g.font = 'bold 30px Georgia'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 1; i <= 12; i++) { const a = (i / 12) * Math.PI * 2; g.fillText(String(i), 128 + Math.sin(a) * 92, 128 - Math.cos(a) * 92); }
  const hand = (ang, len, w, col) => { g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.sin(ang) * len, 128 - Math.cos(ang) * len); g.stroke(); };
  const hA = (((hour % 12) + minute / 60) / 12) * Math.PI * 2, mA = (minute / 60) * Math.PI * 2;
  hand(hA, 55, 9, '#1b1510'); hand(mA, 85, 6, '#1b1510');
  hand((4 / 12) * Math.PI * 2, 70, 2, '#a01c14'); // alarm hand - always set to 4:00
  g.fillStyle = '#1b1510'; g.beginPath(); g.arc(128, 128, 8, 0, Math.PI * 2); g.fill();
  if (cracked) { g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2; g.beginPath(); g.moveTo(40, 60); g.lineTo(120, 130); g.lineTo(200, 110); g.moveTo(120, 130); g.lineTo(150, 230); g.stroke(); }
  tex.needsUpdate = true;
}

// Digital clock (bedroom) texture
export function digitalClockTexture(text = '6:00') {
  const c = canvas(256, 96), g = c.getContext('2d');
  g.fillStyle = '#080404'; g.fillRect(0, 0, 256, 96);
  g.fillStyle = '#ff2a1a'; g.font = 'bold 64px "Courier New", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = '#ff2a1a'; g.shadowBlur = 12; g.fillText(text, 128, 50);
  const t = toTex(c); t.userData = { canvas: c }; return t;
}
export function drawDigital(tex, text) {
  const c = tex.userData.canvas, g = c.getContext('2d');
  g.fillStyle = '#080404'; g.fillRect(0, 0, 256, 96);
  g.fillStyle = '#ff2a1a'; g.font = 'bold 64px "Courier New", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = '#ff2a1a'; g.shadowBlur = 12; g.fillText(text, 128, 50);
  tex.needsUpdate = true;
}

// Child's crayon drawing
export function drawingTexture(kind = 'fish') {
  const k = `drawing:${kind}:${CONFIG.playerName}`;
  const NAME = CONFIG.playerName.toUpperCase();
  if (cache.has(k)) return cache.get(k);
  const c = canvas(320, 256), g = c.getContext('2d');
  g.fillStyle = '#f4f1e8'; g.fillRect(0, 0, 320, 256);
  g.lineWidth = 4; g.lineCap = 'round';
  const scrib = (col, pts) => { g.strokeStyle = col; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x + Math.random() * 3, y + Math.random() * 3) : g.moveTo(x, y))); g.stroke(); };
  scrib('#2a5bd6', [[0, 170], [60, 160], [120, 175], [200, 160], [320, 172]]);
  if (kind === 'fish') {
    scrib('#e07a10', [[120, 120], [170, 95], [220, 120], [170, 145], [120, 120], [95, 100], [95, 140], [120, 120]]);
    g.fillStyle = '#000'; g.beginPath(); g.arc(200, 115, 4, 0, 7); g.fill();
    g.fillStyle = '#d22'; g.font = '22px "Comic Sans MS", cursive'; g.fillText('ME + ' + NAME, 20, 40);
  } else if (kind === 'monster') {
    scrib('#111', [[200, 170], [205, 60], [215, 40], [225, 60], [230, 170]]);
    scrib('#111', [[190, 40], [250, 40]]);
    g.fillStyle = '#ff0'; g.beginPath(); g.arc(210, 55, 3, 0, 7); g.arc(222, 55, 3, 0, 7); g.fill();
    g.fillStyle = '#d22'; g.font = '22px "Comic Sans MS", cursive'; g.fillText('THE MAN IN THE LAKE', 20, 40);
  } else if (kind === 'clock') {
    g.strokeStyle = '#111'; g.beginPath(); g.arc(160, 110, 50, 0, 7); g.stroke();
    scrib('#111', [[160, 110], [160, 75]]); scrib('#111', [[160, 110], [185, 125]]);
    g.fillStyle = '#d22'; g.font = '22px "Comic Sans MS", cursive'; g.fillText('WAKE UP ' + NAME, 20, 40);
  }
  const t = toTex(c); cache.set(k, t); return t;
}

export const M = {
  std(color, opts = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...opts }); },
};
