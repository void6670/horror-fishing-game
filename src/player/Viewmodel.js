import * as THREE from 'three';
import { damp } from '../util/math.js';

const VM_LAYER = 1;

function setLayer(obj, layer) { obj.traverse((o) => { o.layers.set(layer); }); }

// First-person hands, fishing rod (with a bendable blank) and flashlight. Lives on layer 1 so water
// reflections and monsters' "eyes" never see it.
export class Viewmodel {
  constructor(camera) {
    this.camera = camera;
    this.root = new THREE.Group();
    camera.add(this.root);
    const skin = new THREE.MeshStandardMaterial({ color: 0x5a463a, roughness: 0.9 });
    const sleeve = new THREE.MeshStandardMaterial({ color: 0x2e3a2e, roughness: 0.95 });
    const cork = new THREE.MeshStandardMaterial({ color: 0x5a442e, roughness: 1 });
    const blank = new THREE.MeshStandardMaterial({ color: 0x1c1a18, roughness: 0.4, metalness: 0.2 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x777b80, roughness: 0.35, metalness: 0.8 });

    // ---- right arm + rod ----
    this.right = new THREE.Group();
    this.right.position.set(0.24, -0.26, -0.42);
    this.root.add(this.right);
    const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.42, 8), sleeve);
    armR.rotation.x = Math.PI / 2.4; armR.position.set(0.04, -0.06, 0.2);
    this.right.add(armR);
    const handR = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), skin);
    handR.scale.set(1, 0.8, 1.3);
    this.right.add(handR);
    this.rod = new THREE.Group();
    this.right.add(this.rod);
    this.rod.rotation.x = 0.55; // tip raised
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.3, 8), cork);
    handle.rotation.x = Math.PI / 2; handle.position.z = 0.02;
    this.rod.add(handle);
    this.reel = new THREE.Group();
    this.reel.position.set(0, -0.05, -0.08);
    const reelBody = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.035, 14), metal);
    reelBody.rotation.z = Math.PI / 2;
    this.reel.add(reelBody);
    this.reelHandle = new THREE.Group();
    this.reelHandle.position.x = -0.025;
    const crank = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.05, 0.008), metal);
    crank.position.y = 0.025; this.reelHandle.add(crank);
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.02, 6), cork);
    knob.rotation.z = Math.PI / 2; knob.position.set(-0.01, 0.05, 0); this.reelHandle.add(knob);
    this.reel.add(this.reelHandle);
    this.rod.add(this.reel);
    // segmented blank for bending
    this.segments = [];
    let parent = this.rod;
    const N = 7, L = 0.27;
    for (let i = 0; i < N; i++) {
      const joint = new THREE.Group();
      joint.position.z = i === 0 ? -0.13 : -L;
      parent.add(joint);
      const r0 = 0.012 * (1 - i / N) + 0.002, r1 = 0.012 * (1 - (i + 1) / N) + 0.002;
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, L, 6), blank);
      seg.rotation.x = Math.PI / 2; seg.position.z = -L / 2;
      joint.add(seg);
      if (i % 2 === 1) { const guide = new THREE.Mesh(new THREE.TorusGeometry(0.01, 0.002, 4, 8), metal); guide.position.set(0, -0.012, -L * 0.8); joint.add(guide); }
      this.segments.push(joint);
      parent = joint;
    }
    this.tip = new THREE.Object3D();
    this.tip.position.z = -L;
    parent.add(this.tip);

    // ---- left arm + flashlight ----
    this.left = new THREE.Group();
    this.left.position.set(-0.26, -0.28, -0.45);
    this.root.add(this.left);
    const armL = armR.clone(); armL.position.set(-0.04, -0.06, 0.2);
    this.left.add(armL);
    const handL = handR.clone();
    this.left.add(handL);
    this.torch = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.02, 0.2, 10), new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.5, metalness: 0.4 }));
    body.rotation.x = Math.PI / 2;
    this.torch.add(body);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.024, 0.05, 12), metal);
    head.rotation.x = Math.PI / 2; head.position.z = -0.12;
    this.torch.add(head);
    this.lens = new THREE.Mesh(new THREE.CircleGeometry(0.028, 12), new THREE.MeshBasicMaterial({ color: 0xfff0cc }));
    this.lens.position.z = -0.146; this.lens.rotation.y = Math.PI;
    this.lens.rotation.set(0, 0, 0);
    this.lens.lookAt(0, 0, -1);
    this.torch.add(this.lens);
    this.torch.position.set(0.0, 0.02, -0.06);
    this.left.add(this.torch);

    // held object anchor (inspecting catches, items)
    this.holdAnchor = new THREE.Group();
    this.holdAnchor.position.set(0, 0.02, -0.5);
    this.root.add(this.holdAnchor);
    this.holdLight = new THREE.PointLight(0xfff0dc, 0, 1.6, 1.5);
    this.holdLight.position.set(0.1, 0.25, -0.2);
    this.root.add(this.holdLight);

    setLayer(this.root, VM_LAYER);
    this.root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; } });

    this.t = 0;
    this.bobAmt = 0;
    this.castPull = 0; // 0..1 wind-up
    this.castSwing = 0;
    this.bend = 0; this.bendSide = 0;
    this.rodOut = 1; // 0 stowed, 1 out
    this.rodTarget = 1;
    this.torchRaise = 1;
    this.reelSpin = 0;
    this.shake = 0;
  }

  setVisible(v) { this.root.visible = v; }
  holdObject(obj) {
    this.clearHeld();
    if (!obj) return;
    setLayer(obj, VM_LAYER);
    obj.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
    this.holdAnchor.add(obj);
    this.held = obj;
    this.holdLight.intensity = 1.2;
  }
  clearHeld() { if (this.held) { this.holdAnchor.remove(this.held); this.held = null; } this.holdLight.intensity = 0; }

  tipWorld(target) { this.root.updateWorldMatrix(true, true); return this.tip.getWorldPosition(target); }

  update(dt, { moving = 0, running = false, crouch = false, hidden = false, swimming = false } = {}) {
    this.t += dt * (running ? 1.8 : 1);
    this.bobAmt = damp(this.bobAmt, moving * (running ? 1.6 : 1), 6, dt);
    const bx = Math.sin(this.t * 7) * 0.012 * this.bobAmt, by = Math.abs(Math.cos(this.t * 7)) * 0.016 * this.bobAmt;
    const idle = Math.sin(this.t * 1.3) * 0.003;
    this.rodOut = damp(this.rodOut, this.rodTarget, 6, dt);
    this.right.position.set(0.24 + bx, -0.26 - by + idle - (1 - this.rodOut) * 0.45, -0.42);
    this.left.position.set(-0.26 - bx, -0.28 - by * 0.8 - idle - (1 - this.torchRaise) * 0.4, -0.45);
    // casting: pull back then whip forward
    this.castSwing = damp(this.castSwing, 0, 5, dt);
    const back = this.castPull * 1.1 - this.castSwing * 0.9;
    this.rod.rotation.x = 0.55 + back + this.bend * 0.25;
    this.rod.rotation.y = -this.bendSide * 0.25;
    // bend distribution: more at tip
    this.segments.forEach((s, i) => {
      const w = (i + 1) / this.segments.length;
      s.rotation.x = -this.bend * 0.14 * w * w * 2 - this.castSwing * 0.05 * w;
      s.rotation.y = this.bendSide * this.bend * 0.08 * w;
    });
    this.reelHandle.rotation.x += this.reelSpin * dt * 20;
    this.right.visible = this.rodOut > 0.08;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2);
      this.root.position.set((Math.random() - 0.5) * 0.01 * this.shake, (Math.random() - 0.5) * 0.01 * this.shake, 0);
    } else this.root.position.set(0, 0, 0);
    this.root.visible = !hidden;
    this.left.visible = false; // no flashlight: the near-field light does its job
    void crouch; void swimming;
  }
}
