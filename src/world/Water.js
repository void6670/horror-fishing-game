import * as THREE from 'three';

// Sum-of-sines swell shared between the GPU (vertex displacement) and CPU (boat buoyancy).
export const SWELLS = [
  // dirX, dirZ, k (wavenumber), speed, amp
  [0.8, 0.6, 0.06, 0.9, 0.55],
  [-0.4, 0.9, 0.11, 1.3, 0.28],
  [0.95, -0.3, 0.19, 1.9, 0.12],
  [-0.7, -0.7, 0.33, 2.6, 0.05],
];
export function swellHeight(x, z, t, amp) {
  let h = 0;
  for (const [dx, dz, k, s, a] of SWELLS) h += a * Math.sin((dx * x + dz * z) * k + t * s);
  return h * amp;
}

const swellGLSL = `
float swell(vec2 p, float t){
  float h = 0.0;
  ${SWELLS.map(([dx, dz, k, s, a]) => `h += ${a.toFixed(3)} * sin(dot(vec2(${dx.toFixed(3)}, ${dz.toFixed(3)}), p) * ${k.toFixed(3)} + t * ${s.toFixed(3)});`).join('\n  ')}
  return h;
}`;

const _v2 = new THREE.Vector2();
const _dir = new THREE.Vector3();
const _up = new THREE.Vector3();
const _plane = new THREE.Plane();
const _clip = new THREE.Vector4();
const _q = new THREE.Vector4();

// Planar-reflection water with procedural ripples, moon + flashlight speculars, a "still" mode for the
// realization moment, and a faint drowned-faces hallucination layer.
export class Water {
  constructor({ size = 400, segments = 1, level = 0, color = 0x0a1418, deep = 0x020608, waveAmp = 0, follow = false, reflect = true, opacity = 1 } = {}) {
    this.level = level;
    this.follow = follow;
    this.reflect = reflect;
    this.rtScale = 0.5;
    this.rt = new THREE.WebGLRenderTarget(256, 256, { type: THREE.HalfFloatType });
    this.mirrorCam = new THREE.PerspectiveCamera();
    this.textureMatrix = new THREE.Matrix4();
    this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 },
      uLevel: { value: level },
      uWaveAmp: { value: waveAmp },
      uRipple: { value: 1 },
      uStill: { value: 0 },
      uFaces: { value: 0 },
      uReflection: { value: null },
      uTexMatrix: { value: new THREE.Matrix4() },
      uColor: { value: new THREE.Color(color) },
      uDeep: { value: new THREE.Color(deep) },
      uMoonDir: { value: new THREE.Vector3(0.3, 0.45, -0.85).normalize() },
      uMoonColor: { value: new THREE.Color(0xc8d4e6) },
      uFlashPos: { value: new THREE.Vector3() },
      uFlashDir: { value: new THREE.Vector3(0, -1, 0) },
      uFlashOn: { value: 0 },
      uReflectivity: { value: 1 },
      uOpacity: { value: opacity },
      uTint: { value: new THREE.Color(1, 1, 1) },
    }]);
    this.uniforms.uReflection.value = this.rt.texture;
    this.uniforms.uTexMatrix.value = this.textureMatrix;
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      fog: true,
      transparent: opacity < 1,
      vertexShader: /* glsl */`
        uniform float uTime, uWaveAmp, uLevel; uniform mat4 uTexMatrix;
        varying vec3 vWorld; varying vec4 vMirror;
        #include <fog_pars_vertex>
        ${swellGLSL}
        void main(){
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vMirror = uTexMatrix * vec4(wp.x, uLevel, wp.z, 1.0);
          wp.y += uWaveAmp * swell(wp.xz, uTime);
          vWorld = wp.xyz;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */`
        uniform sampler2D uReflection;
        uniform float uTime, uWaveAmp, uRipple, uStill, uFaces, uFlashOn, uReflectivity, uOpacity;
        uniform vec3 uColor, uDeep, uMoonDir, uMoonColor, uFlashPos, uFlashDir, uTint;
        varying vec3 vWorld; varying vec4 vMirror;
        #include <fog_pars_fragment>
        ${swellGLSL}
        float hash2(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
        vec2 rippleGrad(vec2 p, float t){
          vec2 g = vec2(0.0);
          g += vec2(0.8,0.6) * cos(dot(p, vec2(0.8,0.6))*1.7 + t*1.6) * 0.5;
          g += vec2(-0.6,0.8) * cos(dot(p, vec2(-0.6,0.8))*2.9 + t*2.1) * 0.35;
          g += vec2(0.2,-1.0) * cos(dot(p, vec2(0.2,-1.0))*5.3 + t*2.9) * 0.2;
          g += vec2(-0.9,-0.3) * cos(dot(p, vec2(-0.9,-0.3))*9.1 + t*3.7) * 0.12;
          g += vec2(0.5,0.5) * cos(dot(p, vec2(0.7,0.7))*15.0 + t*5.0) * 0.07;
          return g;
        }
        float face(vec2 p){
          vec2 cell = floor(p / 7.0); vec2 f = fract(p / 7.0) - 0.5;
          float r = hash2(cell);
          if (r < 0.6) return 0.0;
          f *= 1.6;
          float eyes = smoothstep(0.07, 0.03, length(f - vec2(-0.12, 0.08))) + smoothstep(0.07, 0.03, length(f - vec2(0.12, 0.08)));
          float mouth = smoothstep(0.03, 0.0, abs(length((f - vec2(0.0, 0.05)) * vec2(1.0, 1.6)) - 0.2)) * step(f.y, -0.02);
          float headShape = smoothstep(0.42, 0.3, length(f * vec2(1.0, 0.8)));
          return headShape * 0.35 - (eyes + mouth) * 0.6 * headShape;
        }
        void main(){
          float amp = uRipple * (1.0 - uStill);
          vec2 g = rippleGrad(vWorld.xz, uTime) * 0.08 * amp;
          float e = 0.5;
          float h0 = swell(vWorld.xz, uTime);
          vec2 sg = vec2(swell(vWorld.xz + vec2(e,0.0), uTime) - h0, swell(vWorld.xz + vec2(0.0,e), uTime) - h0) / e * uWaveAmp;
          vec3 N = normalize(vec3(-(g.x + sg.x), 1.0, -(g.y + sg.y)));
          vec3 V = normalize(cameraPosition - vWorld);
          float fres = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
          vec2 uv = vMirror.xy / vMirror.w + N.xz * 0.04;
          vec3 refl = texture2D(uReflection, uv).rgb * uTint;
          vec3 base = mix(uColor, uDeep, clamp(1.0 - dot(N,V), 0.0, 1.0));
          vec3 col = mix(base, refl, clamp(fres * uReflectivity + 0.25 * uReflectivity, 0.0, 1.0));
          vec3 R = reflect(-normalize(uMoonDir), N);
          col += uMoonColor * pow(max(dot(R, V), 0.0), 180.0) * 1.4 * (1.0 - uStill * 0.5);
          if (uFlashOn > 0.0) {
            vec3 L = uFlashPos - vWorld; float d = length(L); L /= d;
            float cone = smoothstep(0.86, 0.95, dot(-L, normalize(uFlashDir)));
            float att = 1.0 / (1.0 + d * d * 0.02);
            col += vec3(0.05, 0.07, 0.06) * cone * att * 3.0 * uFlashOn;
            vec3 H = normalize(L + V);
            col += vec3(1.0, 0.95, 0.85) * pow(max(dot(N, H), 0.0), 220.0) * cone * att * 4.0 * uFlashOn;
          }
          if (uFaces > 0.0) {
            float f = face(vWorld.xz + vec2(sin(uTime*0.2), cos(uTime*0.17)) * 0.8);
            col += vec3(0.25, 0.3, 0.3) * f * uFaces * (0.6 + 0.4 * sin(uTime * 0.5));
          }
          gl_FragColor = vec4(col, uOpacity);
          #include <fog_fragment>
        }
      `,
    });
    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.y = level;
    this.mesh.frustumCulled = !follow;
    this.mesh.userData.noCollide = true;
    this.size = size;
    this.segments = segments;
  }

  heightAt(x, z) { return this.level + swellHeight(x, z, this.uniforms.uTime.value, this.uniforms.uWaveAmp.value); }
  get time() { return this.uniforms.uTime.value; }

  update(dt, camera, flashlight, moonDir) {
    this.uniforms.uTime.value += dt;
    if (this.follow) {
      const s = this.size / Math.max(1, this.segments);
      this.mesh.position.x = Math.round(camera.position.x / s) * s;
      this.mesh.position.z = Math.round(camera.position.z / s) * s;
    }
    if (flashlight) {
      this.uniforms.uFlashOn.value = flashlight.on ? flashlight.factor : 0;
      this.uniforms.uFlashPos.value.copy(flashlight.worldPos);
      this.uniforms.uFlashDir.value.copy(flashlight.worldDir);
    }
    if (moonDir) this.uniforms.uMoonDir.value.copy(moonDir);
  }

  // Renders the mirrored scene. Layer 2 holds "reflection-only" dream objects that the main camera never sees.
  renderReflection(renderer, scene, camera) {
    if (!this.reflect || !this.mesh.visible) return;
    if (camera.position.y < this.level) return;
    renderer.getDrawingBufferSize(_v2);
    const w = Math.max(128, Math.floor(_v2.x * this.rtScale)), h = Math.max(128, Math.floor(_v2.y * this.rtScale));
    if (this.rt.width !== w || this.rt.height !== h) this.rt.setSize(w, h);
    const mc = this.mirrorCam;
    mc.fov = camera.fov; mc.aspect = camera.aspect; mc.near = camera.near; mc.far = camera.far;
    mc.updateProjectionMatrix();
    const L = this.level;
    mc.position.set(camera.position.x, 2 * L - camera.position.y, camera.position.z);
    camera.getWorldDirection(_dir); _dir.y = -_dir.y;
    _up.set(0, 1, 0).applyQuaternion(camera.quaternion); _up.y = -_up.y;
    mc.up.copy(_up);
    mc.lookAt(mc.position.x + _dir.x, mc.position.y + _dir.y, mc.position.z + _dir.z);
    mc.updateMatrixWorld();
    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(mc.projectionMatrix);
    this.textureMatrix.multiply(mc.matrixWorldInverse);
    _plane.normal.set(0, 1, 0); _plane.constant = -L;
    _plane.applyMatrix4(mc.matrixWorldInverse);
    _clip.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant);
    const pm = mc.projectionMatrix;
    _q.set((Math.sign(_clip.x) + pm.elements[8]) / pm.elements[0], (Math.sign(_clip.y) + pm.elements[9]) / pm.elements[5], -1, (1 + pm.elements[10]) / pm.elements[14]);
    _clip.multiplyScalar(2 / _clip.dot(_q));
    pm.elements[2] = _clip.x; pm.elements[6] = _clip.y; pm.elements[10] = _clip.z + 1; pm.elements[14] = _clip.w;
    mc.layers.mask = (1 << 0) | (1 << 2);
    this.mesh.visible = false;
    const prevRT = renderer.getRenderTarget();
    const auto = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(scene, mc);
    renderer.setRenderTarget(prevRT);
    renderer.shadowMap.autoUpdate = auto;
    this.mesh.visible = true;
  }

  dispose() { this.rt.dispose(); }
}
