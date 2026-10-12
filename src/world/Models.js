import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
// Built in Blender by blender/build_models.py; bundled inline so single-file builds keep working.
import modelsUrl from '../assets/modelsData.js';

// Registry of mesh geometries made in Blender. Everything that uses it falls back to the old
// procedural shapes if a model is missing, so the game still runs without the file.
export const Models = {
  geos: {},
  ready: false,
  async load() {
    try {
      const gltf = await new GLTFLoader().loadAsync(modelsUrl);
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        const g = o.geometry.clone();
        g.applyMatrix4(o.matrixWorld);
        g.computeBoundingBox();
        g.computeBoundingSphere();
        this.geos[o.name] = g;
      });
      this.ready = true;
    } catch (e) {
      console.warn('Models failed to load; using procedural fallbacks.', e);
    }
  },
  geo(name) { return this.geos[name] || null; },
  // A mesh with the named geometry, optionally scaled (sx, sy, sz).
  mesh(name, material, scale) {
    const g = this.geo(name);
    if (!g) return null;
    const m = new THREE.Mesh(g, material);
    if (scale) m.scale.set(...scale);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  },
};
