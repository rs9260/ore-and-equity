// First-person view of the held item (or the banker's bare arm), drawn on top of the world
// with its own camera so it never clips into walls. Swing, equip and walk-bob animations.
import * as THREE from 'three';
import { makeItemMesh } from './items3d.js';
import { PICKS, SWORDS } from './blocks.js';

const BASE = new THREE.Vector3(0.56, -0.58, -0.95);
const SWING_TIME = 0.28;

function sleeveTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d');
  g.fillStyle = '#1d2740'; g.fillRect(0, 0, 16, 16);
  g.fillStyle = '#3a4668'; for (let x = 1; x < 16; x += 4) g.fillRect(x, 0, 1, 16);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  return t;
}

export class Hand {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 10);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.sun = new THREE.DirectionalLight(0xffffff, 0.7);
    this.sun.position.set(-0.4, 1, 0.7);
    this.scene.add(this.ambient, this.sun);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    // bare arm: pinstriped sleeve, shirt cuff, hand
    this.arm = new THREE.Group();
    const add = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); this.arm.add(m); };
    add(0.24, 0.24, 0.7, new THREE.MeshLambertMaterial({ map: sleeveTex() }), 0, 0, 0.12);
    add(0.25, 0.25, 0.06, new THREE.MeshLambertMaterial({ color: 0xf2f2ee }), 0, 0, -0.25);
    add(0.2, 0.2, 0.16, new THREE.MeshLambertMaterial({ color: 0xe2b48c }), 0, 0, -0.36);
    this.arm.rotation.set(0.35, -0.15, 0.1);
    this.arm.position.set(0.08, -0.08, 0.05);
    this.itemId = -1;
    this.item = null;
    this.swingT = 0;
    this.equip = 0;
  }

  resize() { this.camera.aspect = window.innerWidth / window.innerHeight; this.camera.updateProjectionMatrix(); }

  setItem(id) {
    if (id === this.itemId) return;
    this.itemId = id;
    this.equip = 1;
    if (this.item) this.root.remove(this.item);
    if (!id) { this.item = this.arm; this.root.add(this.arm); return; }
    const pivot = new THREE.Group();
    const m = makeItemMesh(id);
    if (m.userData.cube) {
      m.scale.setScalar(0.4);
      m.rotation.set(0.12, Math.PI / 4 + 0.15, 0);
      m.position.set(-0.04, 0.02, 0);
    } else if (PICKS[id] || SWORDS[id]) {
      // tools: handle bottom-right, head up and towards the screen centre
      m.scale.setScalar(0.85);
      m.rotation.set(0, Math.PI - 0.55, 0.12);
      m.position.set(-0.08, 0.22, 0);
    } else {
      m.scale.setScalar(0.5);
      m.rotation.set(0, Math.PI - 0.5, 0);
      m.position.set(-0.04, 0.06, 0);
    }
    pivot.add(m);
    this.item = pivot;
    this.root.add(pivot);
  }

  // Start a swing; restarting partway through keeps repeated actions snappy.
  swing() { if (this.swingT === 0 || this.swingT > 0.55) this.swingT = 0.001; }

  update(dt, { bob, speed, light }) {
    if (this.swingT > 0) { this.swingT += dt / SWING_TIME; if (this.swingT >= 1) this.swingT = 0; }
    this.equip = Math.max(0, this.equip - dt * 5);
    const t = this.swingT;
    const s1 = Math.sin(t * Math.PI), s2 = Math.sin(Math.sqrt(t) * Math.PI);
    const walk = Math.min(1, speed / 4);
    const bx = Math.sin(bob) * 0.025 * walk, by = -Math.abs(Math.cos(bob)) * 0.03 * walk;
    this.root.position.set(
      BASE.x - 0.32 * s2 + bx,
      BASE.y + 0.16 * Math.sin(Math.sqrt(t) * Math.PI * 2) - this.equip * 0.6 + by,
      BASE.z - 0.28 * s1,
    );
    this.root.rotation.set(-0.95 * s1, 0.55 * s2, -0.25 * s1);
    this.ambient.intensity = 0.25 + 0.5 * light;
    this.sun.intensity = 0.2 + 0.55 * light;
  }

  render(renderer) {
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
  }
}
