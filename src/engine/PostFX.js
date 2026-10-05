import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

// Single "nightmare lens" pass: grain, vignette, fear distortion, chromatic split, damage, desaturation,
// realization warp, underwater tint and fades. All horror screen-space effects live here.
const HorrorShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uFear: { value: 0 },
    uDamage: { value: 0 },
    uWarp: { value: 0 },
    uDesat: { value: 0.15 },
    uBlack: { value: 0 },
    uWhite: { value: 0 },
    uUnderwater: { value: 0 },
    uRed: { value: 0 },
    uGrain: { value: 0.06 },
    uVignette: { value: 0.55 },
    uAspect: { value: 1 },
    uLetterbox: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uFear, uDamage, uWarp, uDesat, uBlack, uWhite, uUnderwater, uRed, uGrain, uVignette, uAspect, uLetterbox;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r = length(c * vec2(uAspect, 1.0));
      // fear: slow breathing warp at edges
      float breathe = sin(uTime * 1.3) * 0.5 + 0.5;
      uv += c * r * r * uFear * 0.06 * breathe;
      // realization warp: swirl
      float ang = uWarp * 1.2 * (1.0 - smoothstep(0.0, 0.8, r)) * sin(uTime * 0.7);
      mat2 rot = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
      uv = mix(uv, rot * (uv - 0.5) + 0.5, uWarp);
      // underwater ripple
      uv += uUnderwater * 0.004 * vec2(sin(uv.y * 40.0 + uTime * 2.0), cos(uv.x * 35.0 + uTime * 1.7));
      float ca = 0.0015 + uFear * 0.006 + uWarp * 0.01 + uDamage * 0.008;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c * ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * ca).b;
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(lum), clamp(uDesat + uFear * 0.35, 0.0, 1.0));
      // red moon / fear tint
      col = mix(col, col * vec3(1.35, 0.55, 0.5), uRed);
      col = mix(col, col * vec3(0.45, 0.8, 1.0) + vec3(0.0, 0.02, 0.04), uUnderwater);
      // damage pulse
      col = mix(col, vec3(0.35, 0.0, 0.0), uDamage * smoothstep(0.2, 0.9, r) * 0.8);
      // vignette
      float vig = smoothstep(0.95, 0.25, r * (1.0 + uFear * 0.5));
      col *= mix(1.0, vig, uVignette);
      // grain
      float g = hash(uv * vec2(1920.0, 1080.0) + fract(uTime * 13.7)) - 0.5;
      col += g * (uGrain + uFear * 0.08);
      // fades
      col = mix(col, vec3(1.0), uWhite);
      col = mix(col, vec3(0.0), uBlack);
      // letterbox for cinematics
      float lb = uLetterbox * 0.11;
      if (vUv.y < lb || vUv.y > 1.0 - lb) col = vec3(0.0);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class PostFX {
  constructor(renderer, scene, camera) {
    this.composer = new EffectComposer(renderer);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.55, 0.6, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.horror = new ShaderPass(HorrorShader);
    this.composer.addPass(this.horror);
    this.u = this.horror.uniforms;
  }
  setScene(scene, camera) { this.renderPass.scene = scene; this.renderPass.camera = camera; }
  setSize(w, h) { this.composer.setSize(w, h); this.u.uAspect.value = w / h; }
  render(dt) { this.u.uTime.value += dt; this.composer.render(dt); }
}
