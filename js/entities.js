// Particles, villagers, the player's banker model, Murkmoles and Skimmers.
import * as THREE from 'three';
import { B, SOLID } from './blocks.js';
import { mulberry32 } from './noise.js';

export class Particles {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.geo = new THREE.BoxGeometry(0.11, 0.11, 0.11);
  }
  burst(x, y, z, rgb, n = 12, spread = 1) {
    for (let i = 0; i < n; i++) {
      const col = new THREE.Color(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255).multiplyScalar(0.75 + Math.random() * 0.4);
      const m = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ color: col }));
      m.position.set(x + Math.random() * spread, y + Math.random() * spread, z + Math.random() * spread);
      const v = new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 3 + 1, (Math.random() - 0.5) * 3);
      this.scene.add(m);
      this.list.push({ m, v, life: 0.5 + Math.random() * 0.4 });
    }
  }
  update(dt, world) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      p.v.y -= 14 * dt;
      p.m.position.addScaledVector(p.v, dt);
      if (world.isSolid(p.m.position.x, p.m.position.y, p.m.position.z)) { p.v.multiplyScalar(0.2); p.m.position.y = Math.floor(p.m.position.y) + 1.05; }
      if (p.life <= 0) { this.scene.remove(p.m); p.m.material.dispose(); this.list.splice(i, 1); }
    }
  }
}

// ---------- helpers ----------
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), c);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}
function noisyTex(base, seed, v = 0.18) {
  const r = mulberry32(seed);
  const c = new THREE.Color(base);
  return canvasTex(8, 8, (g) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const f = 1 + (r() - 0.5) * 2 * v;
      g.fillStyle = `rgb(${c.r * 255 * f | 0},${c.g * 255 * f | 0},${c.b * 255 * f | 0})`;
      g.fillRect(x, y, 1, 1);
    }
  });
}
const lambert = (color, map) => new THREE.MeshLambertMaterial({ color: map ? 0xffffff : color, map });
function box(w, h, d, mat, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  parent?.add(m);
  return m;
}

export function nameTag(text, color = '#ffffff', sub = '') {
  const font = 'Minecraftia, monospace';
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  g.font = `28px ${font}`;
  const w1 = g.measureText(text).width;
  g.font = `20px ${font}`;
  const w2 = sub ? g.measureText(sub).width : 0;
  c.width = Math.ceil(Math.max(w1, w2) + 20);
  c.height = sub ? 66 : 40;
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.fillRect(0, 0, c.width, c.height);
  // Minecraftia's ink runs from 0.5em to 1.5em above the alphabetic baseline,
  // so each line's baseline sits 1.5em below where its ink should start
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.font = `28px ${font}`;
  g.fillStyle = '#3f3f3f'; g.fillText(text, c.width / 2 + 2, 6 + 42 + 2);
  g.fillStyle = color; g.fillText(text, c.width / 2, 6 + 42);
  if (sub) { g.font = `20px ${font}`; g.fillStyle = '#d0d0d0'; g.fillText(sub, c.width / 2, 38 + 30); }
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.LinearFilter;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(c.width / 80, c.height / 80, 1);
  s.renderOrder = 2;
  return s;
}

// ---------- villagers ----------
const ROLES = {
  merchant: { title: 'Merchant', robe: 0x7a4f2a, trim: 0xd9b36c, pants: 0x3b2a1a, hat: 'cap', hatColor: 0x3f7f3f, skin: '#d9a77a', beard: '#5b3a1a' },
  banker: { title: 'Banker', robe: 0x22305a, trim: 0xe8c547, pants: 0x1a1a24, hat: 'top', hatColor: 0x161616, skin: '#e6b994', beard: '#cfcfcf' },
  quartermaster: { title: 'Quartermaster', robe: 0xc8661e, trim: 0x5a3a1a, pants: 0x3a3a46, hat: 'hard', hatColor: 0xf2c230, skin: '#b07a52', beard: null },
};

function faceTex(style) {
  return canvasTex(8, 8, (g) => {
    g.fillStyle = style.skin; g.fillRect(0, 0, 8, 8);
    g.fillStyle = '#ffffff'; g.fillRect(1, 3, 2, 1); g.fillRect(5, 3, 2, 1);
    g.fillStyle = '#2a2a4a'; g.fillRect(2, 3, 1, 1); g.fillRect(5, 3, 1, 1);
    g.fillStyle = 'rgba(60,30,10,0.8)'; g.fillRect(1, 2, 2, 1); g.fillRect(5, 2, 2, 1);
    if (style.beard) { g.fillStyle = style.beard; g.fillRect(2, 5, 4, 1); g.fillRect(1, 6, 2, 1); g.fillRect(5, 6, 2, 1); }
    else { g.fillStyle = '#7a3a2a'; g.fillRect(3, 6, 2, 1); }
    g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(3, 4, 2, 1);
  });
}

export class Villager {
  constructor(spec, label) {
    this.spec = spec;
    const st = ROLES[spec.role];
    this.style = st;
    const root = this.root = new THREE.Group();
    const skin = new THREE.MeshLambertMaterial({ color: new THREE.Color(st.skin) });
    const robe = lambert(st.robe, noisyTex(st.robe, spec.x * 13 + spec.z, 0.1));
    const trim = lambert(st.trim);
    const pants = lambert(st.pants);
    this.legL = box(0.24, 0.7, 0.26, pants, -0.14, 0.35, 0, root);
    this.legR = box(0.24, 0.7, 0.26, pants, 0.14, 0.35, 0, root);
    box(0.6, 0.78, 0.38, robe, 0, 1.09, 0, root);
    box(0.62, 0.08, 0.4, trim, 0, 0.82, 0, root); // belt
    box(0.1, 0.6, 0.02, trim, 0, 1.1, 0.2, root); // placket
    this.armL = new THREE.Group(); this.armL.position.set(-0.4, 1.42, 0); root.add(this.armL);
    this.armR = new THREE.Group(); this.armR.position.set(0.4, 1.42, 0); root.add(this.armR);
    box(0.18, 0.66, 0.22, robe, 0, -0.32, 0, this.armL);
    box(0.18, 0.66, 0.22, robe, 0, -0.32, 0, this.armR);
    box(0.16, 0.1, 0.2, skin, 0, -0.68, 0, this.armR);
    // coin pouch, shown when the player holds something this villager buys
    this.pouch = new THREE.Group();
    this.pouch.position.set(0, -0.78, 0.04);
    const sack = lambert(0x7a5230), coin = new THREE.MeshLambertMaterial({ color: 0xf2c94a, emissive: 0x3a2a00 });
    box(0.26, 0.22, 0.24, sack, 0, -0.02, 0, this.pouch);
    box(0.14, 0.06, 0.14, lambert(0x5a3a1e), 0, 0.11, 0, this.pouch);
    [[-0.06, 0.18, 0.02], [0.05, 0.2, -0.03], [0.01, 0.24, 0.04]].forEach(([x, y, z]) => box(0.12, 0.03, 0.12, coin, x, y, z, this.pouch));
    this.pouch.visible = false;
    this.armR.add(this.pouch);
    this.offerAmt = 0;
    const head = this.head = new THREE.Group();
    head.position.set(0, 1.48, 0);
    root.add(head);
    const faceMat = new THREE.MeshLambertMaterial({ map: faceTex(st) });
    const hm = [skin, skin, skin, skin, faceMat, skin];
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), hm);
    h.position.y = 0.25; head.add(h);
    const hatMat = lambert(st.hatColor);
    if (st.hat === 'top') {
      box(0.66, 0.05, 0.66, hatMat, 0, 0.52, 0, head);
      box(0.42, 0.42, 0.42, hatMat, 0, 0.75, 0, head);
      box(0.43, 0.07, 0.43, trim, 0, 0.6, 0, head);
    } else if (st.hat === 'cap') {
      box(0.54, 0.14, 0.54, hatMat, 0, 0.55, 0, head);
      box(0.34, 0.04, 0.22, hatMat, 0, 0.5, 0.36, head);
    } else {
      box(0.56, 0.2, 0.56, hatMat, 0, 0.58, 0, head);
      box(0.66, 0.04, 0.66, hatMat, 0, 0.49, 0, head);
      box(0.12, 0.08, 0.06, new THREE.MeshBasicMaterial({ color: 0xfff6b0 }), 0, 0.6, 0.29, head);
    }
    const tag = nameTag(label.title, label.color, label.sub);
    tag.position.y = 2.55;
    root.add(tag);
    root.position.set(spec.x, spec.y, spec.z);
    root.rotation.y = spec.yaw ?? 0;
    this.baseYaw = root.rotation.y;
    this.t = Math.random() * 10;
    this.box = new THREE.Box3(new THREE.Vector3(spec.x - 0.4, spec.y, spec.z - 0.4), new THREE.Vector3(spec.x + 0.4, spec.y + 2.1, spec.z + 0.4));
  }
  update(dt, playerPos) {
    this.t += dt;
    const dx = playerPos.x - this.root.position.x, dz = playerPos.z - this.root.position.z;
    const d = Math.hypot(dx, dz);
    let target = this.baseYaw;
    if (d < 7) target = Math.atan2(dx, dz);
    let diff = target - this.root.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.root.rotation.y += diff * Math.min(1, dt * 4);
    const wave = this.waveT > 0 ? Math.sin(this.waveT * 14) * 0.5 - 2.2 : 0;
    if (this.waveT > 0) this.waveT -= dt;
    this.offerAmt += ((this.offer ? 1 : 0) - this.offerAmt) * Math.min(1, dt * 7);
    this.pouch.visible = this.offerAmt > 0.3;
    if (this.tag) this.tag.visible = this.offerAmt > 0.6;
    const hold = -1.3 * this.offerAmt + Math.sin(this.t * 3) * 0.04 * this.offerAmt;
    this.armR.rotation.x = wave || (this.offerAmt > 0.01 ? hold : Math.sin(this.t * 1.3) * 0.06);
    this.armL.rotation.x = -Math.sin(this.t * 1.3) * 0.06;
    this.head.rotation.x = d < 7 ? -0.1 : Math.sin(this.t * 0.7) * 0.05;
    this.root.position.y = this.spec.y + Math.abs(Math.sin(this.t * 1.1)) * 0.01;
  }
  greet() { this.waveT = 0.6; }
  // Hold out the coin pouch with a price tag (text) or put it away (null).
  setOffer(text) {
    this.offer = !!text;
    if (!text || text === this.tagText) return;
    if (this.tag) { this.root.remove(this.tag); this.tag.material.map.dispose(); }
    this.tagText = text;
    this.tag = nameTag(text, '#ffd84a');
    this.tag.scale.multiplyScalar(0.7);
    this.tag.position.set(0.45, 1.95, 0.8);
    this.tag.visible = false;
    this.root.add(this.tag);
  }
}

// ---------- the player: a Wall Street banker ----------
function suitTex(base, stripe, seed) {
  const r = mulberry32(seed);
  return canvasTex(16, 16, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, 16, 16);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (r() < 0.12) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x, y, 1, 1); }
    g.fillStyle = stripe;
    for (let x = 1; x < 16; x += 4) g.fillRect(x, 0, 1, 16);
  });
}
function bankerFace() {
  return canvasTex(8, 8, (g) => {
    g.fillStyle = '#e2b48c'; g.fillRect(0, 0, 8, 8);
    g.fillStyle = '#2a1a10'; g.fillRect(0, 0, 8, 2); g.fillRect(0, 2, 1, 2); g.fillRect(7, 2, 1, 2); // slicked-back hair, sideburns
    g.fillStyle = '#3a2416'; g.fillRect(1, 3, 2, 1); g.fillRect(5, 3, 2, 1); // brows
    g.fillStyle = '#ffffff'; g.fillRect(1, 4, 2, 1); g.fillRect(5, 4, 2, 1);
    g.fillStyle = '#1f3a5a'; g.fillRect(2, 4, 1, 1); g.fillRect(5, 4, 1, 1);
    g.fillStyle = '#c99872'; g.fillRect(3, 5, 2, 1); // nose shadow
    g.fillStyle = '#8a4a3a'; g.fillRect(2, 6, 4, 1); // confident grin
    g.fillStyle = '#ffffff'; g.fillRect(3, 6, 2, 1);
  });
}
function hairTex() {
  return canvasTex(8, 8, (g) => {
    g.fillStyle = '#2a1a10'; g.fillRect(0, 0, 8, 8);
    g.fillStyle = '#3e2818'; for (let x = 0; x < 8; x += 2) g.fillRect(x, 0, 1, 8); // combed lines
  });
}
function hairSideTex() {
  return canvasTex(8, 8, (g) => {
    g.fillStyle = '#e2b48c'; g.fillRect(0, 0, 8, 8);
    g.fillStyle = '#2a1a10'; g.fillRect(0, 0, 8, 3); g.fillRect(0, 3, 3, 2);
    g.fillStyle = '#c99872'; g.fillRect(4, 4, 2, 2); // ear
  });
}

export function makeBankerModel() {
  const root = new THREE.Group();
  const suit = lambert(0, suitTex('#1d2740', '#3a4668', 31));
  const trousers = lambert(0, suitTex('#1a2238', '#323e5c', 32));
  const shirt = lambert(0xf2f2ee), tie = lambert(0xb0202a), shoe = lambert(0x141414), gold = new THREE.MeshLambertMaterial({ color: 0xe8c34a, emissive: 0x2a1c00 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xe2b48c });
  const legs = [-0.13, 0.13].map((x) => {
    const g = new THREE.Group(); g.position.set(x, 0.75, 0); root.add(g);
    box(0.25, 0.68, 0.26, trousers, 0, -0.37, 0, g);
    box(0.26, 0.1, 0.32, shoe, 0, -0.7, 0.03, g);
    return g;
  });
  const torso = new THREE.Group(); torso.position.y = 0.75; root.add(torso);
  box(0.52, 0.72, 0.28, suit, 0, 0.36, 0, torso);
  box(0.16, 0.5, 0.02, shirt, 0, 0.47, 0.145, torso); // shirt front
  box(0.07, 0.36, 0.025, tie, 0, 0.44, 0.155, torso);
  box(0.1, 0.06, 0.03, tie, 0, 0.66, 0.155, torso); // knot
  box(0.08, 0.05, 0.02, shirt, 0.16, 0.58, 0.145, torso); // pocket square
  box(0.54, 0.05, 0.3, lambert(0x101010), 0, 0.02, 0, torso); // belt
  box(0.06, 0.05, 0.02, gold, 0, 0.02, 0.16, torso);
  const arm = (side) => {
    const g = new THREE.Group(); g.position.set(side * 0.36, 1.4, 0); root.add(g);
    box(0.2, 0.62, 0.24, suit, 0, -0.29, 0, g);
    box(0.21, 0.06, 0.25, shirt, 0, -0.62, 0, g); // cuff
    box(0.17, 0.12, 0.2, skin, 0, -0.71, 0, g);
    return g;
  };
  const armL = arm(-1), armR = arm(1);
  box(0.03, 0.04, 0.02, gold, 0, -0.62, 0.13, armL); // watch
  const head = new THREE.Group(); head.position.y = 1.47; root.add(head);
  const face = new THREE.MeshLambertMaterial({ map: bankerFace() }), side = new THREE.MeshLambertMaterial({ map: hairSideTex() }), hair = new THREE.MeshLambertMaterial({ map: hairTex() });
  const h = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), [side, side, hair, skin, face, hair]);
  h.position.y = 0.25; head.add(h);
  // held item sits in the right hand
  const hand = new THREE.Group(); hand.position.set(0, -0.74, 0.12); armR.add(hand);
  // Golden Parachute: two gold-silk wings on the back, hidden until bought
  const silk = new THREE.MeshLambertMaterial({ color: 0xe8c34a, emissive: 0x2a1c00, side: THREE.DoubleSide });
  const rib = lambert(0x6b4a12);
  const wings = new THREE.Group(); wings.position.set(0, 0.62, -0.16); torso.add(wings);
  const wingParts = [-1, 1].map((sd) => {
    const g = new THREE.Group(); g.position.x = sd * 0.08; wings.add(g);
    box(0.62, 0.9, 0.025, silk, sd * 0.31, -0.42, 0, g);
    box(0.36, 0.5, 0.026, silk, sd * 0.5, -0.95, 0, g);
    box(0.66, 0.04, 0.04, rib, sd * 0.33, 0.02, 0, g);
    box(0.04, 1.2, 0.035, rib, sd * 0.6, -0.58, 0, g);
    return g;
  });
  wings.visible = false;
  return { root, legs, armL, armR, head, hand, torso, wings, wingParts };
}

// Walk cycle, head pitch and arm swing for the banker model.
export function animateBanker(m, { speed, phase, pitch, swing, sneak, wings = false, gliding = false }) {
  const a = Math.sin(phase) * Math.min(1, speed / 4) * 0.7;
  m.legs[0].rotation.x = a; m.legs[1].rotation.x = -a;
  m.armL.rotation.x = -a * 0.8;
  const s = Math.sin(Math.min(1, swing) * Math.PI);
  m.armR.rotation.x = a * 0.8 - (m.holding ? 0.35 : 0) - s * 1.3;
  m.armR.rotation.z = s * 0.2;
  m.head.rotation.x = -pitch * 0.8;
  m.torso.rotation.x = sneak ? 0.3 : 0;
  m.head.position.y = sneak ? 1.38 : 1.47;
  m.head.position.z = sneak ? 0.12 : 0;
  m.wings.visible = wings;
  // folded flat along the back, or spread out sideways while gliding
  m.wingParts.forEach((g, i) => {
    const sd = i ? 1 : -1;
    const open = gliding ? 1 : 0;
    g.rotation.z += ((open ? sd * 1.2 : sd * 0.15) - g.rotation.z) * 0.25;
    g.rotation.y += ((open ? -sd * 0.25 : -sd * 0.9) - g.rotation.y) * 0.25;
  });
  if (gliding) { m.armL.rotation.z = -0.9; m.armR.rotation.z = 0.9; m.legs[0].rotation.x = m.legs[1].rotation.x = 0.2; }
  else m.armL.rotation.z = 0;
}

// ---------- Murkmole: a burrowing, crystal-backed night creature ----------
const MOB_HW = 0.42, MOB_H = 0.8;

function makeMoleModel() {
  const root = new THREE.Group();
  const fur = lambert(0, noisyTex(0x4a3f5c, 5, 0.25));
  const belly = lambert(0x6e6080);
  const claw = lambert(0xe2d9c4);
  const snout = lambert(0xe08aa8);
  const eye = new THREE.MeshBasicMaterial({ color: 0xffe23a });
  const crystal = new THREE.MeshBasicMaterial({ color: 0x6af0e0 });
  const body = new THREE.Group(); root.add(body);
  box(0.84, 0.56, 1.0, fur, 0, 0.5, 0, body);
  box(0.7, 0.12, 0.8, belly, 0, 0.22, 0.02, body);
  box(0.62, 0.46, 0.34, fur, 0, 0.48, 0.62, body); // head
  box(0.26, 0.2, 0.22, snout, 0, 0.42, 0.86, body);
  box(0.08, 0.06, 0.04, new THREE.MeshBasicMaterial({ color: 0x401020 }), 0, 0.46, 0.98, body);
  box(0.12, 0.08, 0.04, eye, -0.18, 0.6, 0.8, body);
  box(0.12, 0.08, 0.04, eye, 0.18, 0.6, 0.8, body);
  box(0.12, 0.12, 0.08, fur, -0.26, 0.76, 0.58, body); // ears
  box(0.12, 0.12, 0.08, fur, 0.26, 0.76, 0.58, body);
  // crystal shards along the back
  [[0, 0.86, 0.15, 0.16, 0.3], [-0.2, 0.82, -0.12, 0.12, 0.22], [0.2, 0.84, -0.05, 0.12, 0.25], [0, 0.85, -0.35, 0.14, 0.26]].forEach(([x, y, z, s, h]) => {
    const c = box(s, h, s, crystal, x, y, z, body); c.rotation.z = x * 1.5; c.rotation.x = -0.3;
  });
  // hinged lower jaw with two rows of teeth that snap shut on a bite
  const tooth = new THREE.MeshLambertMaterial({ color: 0xfaf6e8, emissive: 0x222018 });
  const gum = new THREE.MeshBasicMaterial({ color: 0x5a1020 });
  for (let i = 0; i < 7; i++) box(0.055, i % 2 ? 0.1 : 0.15, 0.05, tooth, -0.21 + i * 0.07, i % 2 ? 0.27 : 0.245, 0.99, body); // upper fangs
  for (const x of [-0.25, 0.25]) box(0.05, 0.12, 0.05, tooth, x, 0.26, 0.86, body);
  box(0.5, 0.02, 0.32, gum, 0, 0.318, 0.84, body); // roof of the mouth
  const jaw = new THREE.Group(); jaw.position.set(0, 0.31, 0.66); body.add(jaw);
  box(0.54, 0.1, 0.42, fur, 0, -0.07, 0.21, jaw);
  box(0.46, 0.02, 0.38, gum, 0, -0.01, 0.2, jaw);
  for (let i = 0; i < 7; i++) box(0.055, i % 2 ? 0.14 : 0.1, 0.05, tooth, -0.21 + i * 0.07, i % 2 ? 0.06 : 0.04, 0.39, jaw);
  for (const x of [-0.23, 0.23]) for (const z of [0.16, 0.27]) box(0.05, 0.1, 0.05, tooth, x, 0.04, z, jaw);
  // shovel claws
  const clawL = box(0.3, 0.08, 0.34, claw, -0.34, 0.2, 0.78, root);
  const clawR = box(0.3, 0.08, 0.34, claw, 0.34, 0.2, 0.78, root);
  const legs = [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]].map(([x, z]) => box(0.2, 0.26, 0.2, fur, x, 0.13, z, root));
  return { root, body, jaw, clawL, clawR, legs, mats: [fur, belly] };
}

function entCollides(world, p) {
  const x0 = Math.floor(p.x - MOB_HW), x1 = Math.floor(p.x + MOB_HW);
  const y0 = Math.floor(p.y), y1 = Math.floor(p.y + MOB_H);
  const z0 = Math.floor(p.z - MOB_HW), z1 = Math.floor(p.z + MOB_HW);
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (SOLID[world.get(x, y, z)]) return true;
  return false;
}

// ---------- Skimmer: a flying coin-thief ----------
function makeSkimmerModel() {
  const root = new THREE.Group();
  const hide = lambert(0, noisyTex(0x1f4a52, 9, 0.2));
  const wingMat = new THREE.MeshLambertMaterial({ color: 0x2b6a72, side: THREE.DoubleSide });
  const gold = new THREE.MeshBasicMaterial({ color: 0xffcf3a });
  const body = new THREE.Group(); root.add(body);
  box(0.36, 0.26, 0.7, hide, 0, 0, 0, body);
  box(0.3, 0.24, 0.26, hide, 0, 0.04, 0.42, body); // head
  box(0.1, 0.08, 0.16, lambert(0xd9a43a), 0, 0, 0.6, body); // hooked beak
  box(0.08, 0.06, 0.04, gold, -0.1, 0.1, 0.55, body);
  box(0.08, 0.06, 0.04, gold, 0.1, 0.1, 0.55, body);
  box(0.12, 0.08, 0.5, hide, 0, 0, -0.55, body); // tail
  box(0.22, 0.03, 0.14, gold, 0, 0, -0.82, body); // coin-tipped tail fin
  // gold coin spots along the back
  [[-0.08, 0.14, 0.1], [0.08, 0.14, -0.1]].forEach(([x, y, z]) => box(0.08, 0.02, 0.08, gold, x, y, z, body));
  const wing = (side) => {
    const g = new THREE.Group(); g.position.set(side * 0.18, 0.05, 0.05); body.add(g);
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.03, 0.5), wingMat);
    w.position.x = side * 0.42; g.add(w);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.03, 0.3), wingMat);
    tip.position.set(side * 0.95, 0, -0.08); g.add(tip);
    return g;
  };
  return { root, body, wingL: wing(-1), wingR: wing(1), mats: [hide] };
}

export class Mobs {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
  }
  clear() { for (const m of this.list) this.scene.remove(m.model.root); this.list = []; }

  spawn(x, y, z, opts = {}) {
    const model = makeMoleModel();
    model.root.position.set(x, y - 0.9, z);
    this.scene.add(model.root);
    const m = {
      kind: 'mole', model, pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(), hp: 22, emerge: 0.9, yaw: Math.random() * 6.28,
      raid: opts.raid || null, home: opts.home || null, attackCd: 0, flash: 0, wanderT: 0, onGround: false, growlT: 2 + Math.random() * 4, burrow: 0, anim: 0,
    };
    this.list.push(m);
    return m;
  }

  spawnFlyer(x, y, z) {
    const model = makeSkimmerModel();
    model.root.position.set(x, y, z);
    this.scene.add(model.root);
    const m = {
      kind: 'flyer', model, pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(), hp: 10, state: 'circle', stateT: 4 + Math.random() * 3,
      orbit: Math.random() * 6.28, attackCd: 0, flash: 0, loot: 0, burrow: 0, anim: Math.random() * 6, screechT: 3 + Math.random() * 4,
    };
    this.list.push(m);
    return m;
  }

  // Ray hit test against mobs; returns {mob, dist} or null.
  raycast(origin, dir, maxDist) {
    const ray = new THREE.Ray(origin, dir);
    let best = null;
    const tmp = new THREE.Vector3();
    for (const m of this.list) {
      if (m.burrow > 0 || m.emerge > 0) continue;
      const fly = m.kind === 'flyer';
      const b = fly
        ? new THREE.Box3(new THREE.Vector3(m.pos.x - 0.7, m.pos.y - 0.3, m.pos.z - 0.7), new THREE.Vector3(m.pos.x + 0.7, m.pos.y + 0.35, m.pos.z + 0.7))
        : new THREE.Box3(new THREE.Vector3(m.pos.x - 0.5, m.pos.y, m.pos.z - 0.5), new THREE.Vector3(m.pos.x + 0.5, m.pos.y + 1, m.pos.z + 0.5));
      if (ray.intersectBox(b, tmp)) {
        const d = tmp.distanceTo(origin);
        if (d <= maxDist && (!best || d < best.dist)) best = { mob: m, dist: d };
      }
    }
    return best;
  }

  hit(m, dmg, dir) {
    m.hp -= dmg;
    m.flash = 0.25;
    m.vel.x += dir.x * 7; m.vel.z += dir.z * 7; m.vel.y = 5;
    if (m.kind === 'flyer') { m.state = 'flee'; m.stateT = 1.2; }
    return m.hp <= 0;
  }

  remove(m) { this.scene.remove(m.model.root); this.list.splice(this.list.indexOf(m), 1); }

  update(dt, world, player, hooks, env) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const m = this.list[i];
      const mod = m.model;
      if (m.kind === 'flyer') { this.updateFlyer(m, dt, world, player, hooks, env); continue; }
      // emerge from / sink into the ground
      if (m.emerge > 0) { m.emerge -= dt; mod.root.position.set(m.pos.x, m.pos.y - Math.max(0, m.emerge), m.pos.z); continue; }
      // wild moles roam day and night, but dig back down once far from the player
      if (!m.raid && m.burrow === 0 && Math.hypot(player.pos.x - m.pos.x, player.pos.z - m.pos.z) > 64) m.burrow = 1.2;
      if (m.burrow > 0) {
        m.burrow -= dt;
        mod.root.position.y -= dt * 0.8;
        mod.root.rotation.y += dt * 6;
        if (m.burrow <= 0) this.remove(m);
        continue;
      }
      const toP = new THREE.Vector3(player.pos.x - m.pos.x, 0, player.pos.z - m.pos.z);
      const dist = toP.length();
      const chase = dist < 18 && Math.abs(player.pos.y - m.pos.y) < 8;
      let wx = 0, wz = 0, speed = 0;
      if (m.detour > 0) {
        m.detour -= dt;
        wx = Math.sin(m.detourYaw); wz = Math.cos(m.detourYaw); speed = 2.2;
      } else if (chase) { toP.normalize(); wx = toP.x; wz = toP.z; speed = 2.9; }
      else {
        m.wanderT -= dt;
        if (m.wanderT <= 0) {
          m.wanderT = 2 + Math.random() * 3;
          if (m.home && Math.hypot(m.home.x - m.pos.x, m.home.z - m.pos.z) > 8) m.yaw = Math.atan2(m.home.x - m.pos.x, m.home.z - m.pos.z);
          else m.yaw = Math.random() * Math.PI * 2;
          m.idle = Math.random() < 0.3;
        }
        if (!m.idle) { wx = Math.sin(m.yaw); wz = Math.cos(m.yaw); speed = 1.3; }
      }
      m.vel.x += (wx * speed - m.vel.x) * Math.min(1, dt * 6);
      m.vel.z += (wz * speed - m.vel.z) * Math.min(1, dt * 6);
      m.vel.y -= 26 * dt;
      // move with axis collisions and auto step
      const p = m.pos;
      p.y += m.vel.y * dt;
      if (entCollides(world, p)) { p.y = m.vel.y < 0 ? Math.floor(p.y) + 1 : p.y - m.vel.y * dt; m.onGround = m.vel.y < 0; m.vel.y = 0; }
      else m.onGround = false;
      const ox = p.x, oz = p.z;
      for (const ax of ['x', 'z']) {
        const d = m.vel[ax] * dt;
        p[ax] += d;
        if (entCollides(world, p)) {
          p[ax] -= d;
          if (m.onGround) m.vel.y = 7.5; // hop up ledges
        }
      }
      if (p.y < -5) { this.remove(m); continue; }
      if (world.get(Math.floor(p.x), Math.floor(p.y + 0.3), Math.floor(p.z)) === B.LAVA) { hooks.burned?.(m); this.remove(m); continue; }
      // stuck against an obstacle: sidestep for a moment
      if (speed > 0 && Math.hypot(p.x - ox, p.z - oz) / dt < speed * 0.3) {
        m.stuckT = (m.stuckT || 0) + dt;
        if (m.stuckT > 0.8) {
          m.stuckT = 0;
          m.detour = 1.2 + Math.random();
          m.detourYaw = Math.atan2(wx, wz) + (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
        }
      } else m.stuckT = 0;
      if (wx || wz) {
        const ty = Math.atan2(m.vel.x, m.vel.z);
        let diff = Math.atan2(Math.sin(ty - mod.root.rotation.y), Math.cos(ty - mod.root.rotation.y));
        mod.root.rotation.y += diff * Math.min(1, dt * 8);
      }
      m.anim += Math.hypot(m.vel.x, m.vel.z) * dt * 3;
      mod.legs.forEach((l, k) => (l.position.y = 0.13 + Math.max(0, Math.sin(m.anim + k * Math.PI / 2)) * 0.08));
      mod.clawL.rotation.x = Math.sin(m.anim * 1.3) * 0.4;
      mod.clawR.rotation.x = -Math.sin(m.anim * 1.3) * 0.4;
      mod.body.position.y = Math.abs(Math.sin(m.anim)) * 0.04;
      // jaws: frantic snapping during a bite, hungry chattering when close, shut otherwise
      m.chatter = (m.chatter || 0) + dt;
      if (m.biteT > 0) {
        m.biteT -= dt;
        const k = Math.max(0, m.biteT) / 0.7;
        mod.jaw.rotation.x = 0.08 + 1.0 * Math.abs(Math.sin(m.biteT * 36));
        mod.body.position.z = Math.sin(k * Math.PI) * 0.28;
        mod.body.rotation.z = Math.sin(m.biteT * 48) * 0.14 * k;
        mod.body.rotation.x = -Math.sin(k * Math.PI) * 0.18;
      } else {
        const want = chase && dist < 4 ? 0.25 * Math.abs(Math.sin(m.chatter * 17)) : 0.02;
        mod.jaw.rotation.x += (want - mod.jaw.rotation.x) * Math.min(1, dt * 20);
        mod.body.position.z *= 0.8; mod.body.rotation.z *= 0.8; mod.body.rotation.x *= 0.8;
      }
      mod.root.position.copy(p);
      // damage flash
      if (m.flash > 0) m.flash -= dt;
      mod.mats.forEach((mt) => mt.emissive?.setRGB(m.flash > 0 ? 0.6 : 0, 0, 0));
      // attack
      m.attackCd -= dt;
      if (dist < 1.25 && Math.abs(player.pos.y - p.y) < 1.6 && m.attackCd <= 0) {
        m.attackCd = 1.1;
        m.biteT = 0.7;
        hooks.attackPlayer(m, toP);
        hooks.chomp?.(1);
        mod.clawL.rotation.x = mod.clawR.rotation.x = -1;
      }
      m.growlT -= dt;
      if (m.growlT <= 0) { m.growlT = 4 + Math.random() * 5; if (dist < 16) hooks.growl(1 - dist / 16); }
    }
  }

  updateFlyer(m, dt, world, player, hooks, env) {
    const mod = m.model, p = m.pos;
    const eye = new THREE.Vector3(player.pos.x, player.pos.y + 1.2, player.pos.z);
    const ground = world.surfaceY(Math.floor(p.x), Math.floor(p.z));
    // the player is only reachable from the air when the sky above them is open
    const exposed = world.surfaceY(Math.floor(player.pos.x), Math.floor(player.pos.z)) <= player.pos.y + 0.5;
    if (env.day && !env.dayFlyers && m.state !== 'leave') { m.state = 'leave'; m.stateT = 8; }
    m.stateT -= dt;
    let target, speed;
    if (m.state === 'circle') {
      m.orbit += dt * 0.9;
      target = new THREE.Vector3(eye.x + Math.cos(m.orbit) * 8, Math.max(eye.y + 6, ground + 4), eye.z + Math.sin(m.orbit) * 8);
      speed = 6;
      if (m.stateT <= 0 && exposed && m.attackCd <= 0) { m.state = 'dive'; m.stateT = 3; hooks.screech?.(1); }
      else if (m.stateT <= 0) m.stateT = 2;
    } else if (m.state === 'dive') {
      target = eye; speed = 10.5;
      if (p.distanceTo(eye) < 1.1) {
        hooks.flyerStrike(m);
        m.attackCd = 4; m.state = 'flee'; m.stateT = m.loot > 0 ? 7 : 2.5;
      } else if (m.stateT <= 0 || !exposed) { m.state = 'circle'; m.stateT = 3 + Math.random() * 3; }
    } else if (m.state === 'flee') {
      // climb away; a thief carrying loot escapes for good if not caught
      const away = new THREE.Vector3(p.x - eye.x, 0, p.z - eye.z).normalize();
      target = new THREE.Vector3(p.x + away.x * 10, Math.max(eye.y + 12, ground + 10), p.z + away.z * 10);
      speed = 7.5;
      if (m.stateT <= 0) {
        if (m.loot > 0) { hooks.flyerEscaped?.(m); this.remove(m); return; }
        m.state = 'circle'; m.stateT = 4 + Math.random() * 3;
      }
    } else { // leave at daybreak
      target = new THREE.Vector3(p.x + 1, p.y + 30, p.z); speed = 8;
      if (m.stateT <= 0) { this.remove(m); return; }
    }
    m.attackCd -= dt;
    const want = target.clone().sub(p);
    const dist = want.length();
    if (dist > 0.01) want.multiplyScalar(Math.min(speed, dist * 3) / dist);
    m.vel.lerp(want, Math.min(1, dt * 2.5));
    const next = p.clone().addScaledVector(m.vel, dt);
    if (SOLID[world.get(Math.floor(next.x), Math.floor(next.y), Math.floor(next.z))]) { m.vel.y = 6; m.vel.x *= -0.4; m.vel.z *= -0.4; if (m.state === 'dive') { m.state = 'circle'; m.stateT = 2; } }
    else p.copy(next);
    // looks and flaps
    m.anim += dt * (m.state === 'dive' ? 6 : 11);
    const flap = m.state === 'dive' ? 0.15 : Math.sin(m.anim) * 0.7;
    mod.wingL.rotation.z = -flap; mod.wingR.rotation.z = flap;
    const yaw = Math.atan2(m.vel.x, m.vel.z);
    let d = Math.atan2(Math.sin(yaw - mod.root.rotation.y), Math.cos(yaw - mod.root.rotation.y));
    mod.root.rotation.y += d * Math.min(1, dt * 6);
    mod.body.rotation.x = -Math.max(-0.8, Math.min(0.8, m.vel.y * 0.08));
    mod.root.position.copy(p);
    if (m.flash > 0) m.flash -= dt;
    mod.mats.forEach((mt) => mt.emissive?.setRGB(m.flash > 0 ? 0.6 : 0, 0, 0));
    m.screechT -= dt;
    if (m.screechT <= 0) { m.screechT = 5 + Math.random() * 6; const pd = p.distanceTo(eye); if (pd < 24) hooks.screech?.(1 - pd / 24); }
  }
}
