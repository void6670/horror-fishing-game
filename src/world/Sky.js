import * as THREE from 'three';

// Night sky dome: gradient, stars, procedural clouds, a moon that the dream can move, recolor or eclipse.
export class Sky {
  constructor(opts = {}) {
    this.uniforms = {
      uTop: { value: new THREE.Color(opts.top ?? 0x02040a) },
      uHorizon: { value: new THREE.Color(opts.horizon ?? 0x0b1420) },
      uMoonDir: { value: new THREE.Vector3(0.3, 0.45, -0.85).normalize() },
      uMoonColor: { value: new THREE.Color(opts.moonColor ?? 0xdfe6f0) },
      uMoonSize: { value: opts.moonSize ?? 0.035 },
      uMoonVisible: { value: 1 },
      uStars: { value: opts.stars ?? 1 },
      uCloud: { value: opts.cloud ?? 0.3 },
      uTime: { value: 0 },
      uFlash: { value: 0 },
      uEclipse: { value: 0 },
      uAurora: { value: opts.aurora || 0 },
      uFlip: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 uTop, uHorizon, uMoonDir, uMoonColor; uniform float uMoonSize, uMoonVisible, uStars, uCloud, uTime, uFlash, uEclipse, uAurora, uFlip;
        varying vec3 vDir;
        float hash(vec3 p){ p = fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        float hash2(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
        float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(hash2(i),hash2(i+vec2(1,0)),f.x), mix(hash2(i+vec2(0,1)),hash2(i+vec2(1,1)),f.x), f.y); }
        float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<5;i++){ s+=a*vnoise(p); p*=2.03; a*=0.5;} return s; }
        void main(){
          vec3 d = normalize(vDir);
          if (uFlip > 0.5) d.y = -d.y;
          float h = clamp(d.y, -0.2, 1.0);
          vec3 col = mix(uHorizon, uTop, pow(max(h,0.0), 0.55));
          vec3 sp = floor(d * 420.0);
          float st = step(0.9965, hash(sp)) * smoothstep(0.0, 0.25, h);
          st *= 0.6 + 0.4 * sin(uTime * (2.0 + hash(sp+3.0)*4.0) + hash(sp)*30.0);
          col += vec3(st) * uStars * 0.9;
          if (uAurora > 0.0) {
            float a = fbm(vec2(d.x*3.0 + uTime*0.02, d.z*3.0)) * smoothstep(0.1, 0.5, h) * smoothstep(0.9, 0.4, h);
            col += vec3(0.1, 0.6, 0.4) * a * a * uAurora * 1.5;
          }
          vec3 md3 = normalize(uMoonDir);
          float md = dot(d, md3);
          float disc = smoothstep(1.0 - uMoonSize*0.06, 1.0 - uMoonSize*0.05, md);
          vec2 mp = (d.xy - md3.xy) * 40.0;
          float crater = 0.8 + 0.2 * fbm(mp*3.0);
          vec3 moon = uMoonColor * crater * disc;
          float ecl = uEclipse * smoothstep(1.0 - uMoonSize*0.06, 1.0 - uMoonSize*0.05, dot(d, normalize(md3 + vec3(0.006,0.003,0.0))));
          moon = mix(moon, uMoonColor * 0.03, ecl);
          float glow = pow(max(md,0.0), 400.0) * 0.6 + pow(max(md,0.0), 30.0) * 0.12;
          col += (moon * 1.6 + uMoonColor * glow * (1.0 - uEclipse*0.6)) * uMoonVisible;
          vec2 cp = d.xz / max(d.y + 0.15, 0.05) * 0.6 + vec2(uTime * 0.004, uTime*0.002);
          float cl = smoothstep(0.45, 0.85, fbm(cp)) * uCloud * smoothstep(-0.05, 0.25, d.y);
          vec3 cloudCol = mix(uHorizon * 1.2, uMoonColor * 0.12, pow(max(md,0.0), 8.0) * uMoonVisible);
          col = mix(col, cloudCol + uFlash * 0.5, cl);
          col += uFlash * vec3(0.55, 0.6, 0.75) * (0.3 + 0.7 * smoothstep(-0.1, 0.4, d.y));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), mat);
    this.mesh.renderOrder = -10;
    this.mesh.frustumCulled = false;
    this.mesh.layers.enable(2);
    this.azimuth = 0.35; this.elevation = 0.45;
    this.setMoonAngles(this.azimuth, this.elevation);
  }
  setMoonAngles(azimuth, elevation) {
    this.azimuth = azimuth; this.elevation = elevation;
    const ce = Math.cos(elevation);
    this.uniforms.uMoonDir.value.set(Math.sin(azimuth) * ce, Math.sin(elevation), -Math.cos(azimuth) * ce).normalize();
  }
  get moonDir() { return this.uniforms.uMoonDir.value; }
  update(dt, camera) {
    this.uniforms.uTime.value += dt;
    this.mesh.position.copy(camera.position);
  }
}
