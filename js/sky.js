// Day/night cycle: sky colour, fog, sun, moon (with phases), stars and drifting 3D block clouds.
import * as THREE from 'three';
import { mulberry32 } from './noise.js';

export const DAY_FRACTION = 0.64; // portion of the cycle the sun is up (06:00 -> 18:00)

const DAY = new THREE.Color(0x86c1f5), DUSK = new THREE.Color(0xf09a5a), NIGHT = new THREE.Color(0x070a18);
const CLOUD_Y = 74, CELL = 8, GRID = 48, TILE = CELL * GRID, CLOUD_SPEED = 1.6;

function pixelTex(draw, size = 16) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}

// Moon with phase 0..7 (0 = full, 4 = new): a shadow disc slides across the face.
function moonTex(phase) {
  return pixelTex((g) => {
    g.fillStyle = '#d8dce8'; g.fillRect(3, 3, 10, 10);
    g.fillStyle = '#aeb3c4'; g.fillRect(5, 5, 2, 2); g.fillRect(9, 8, 3, 2); g.fillRect(6, 10, 2, 1);
    g.fillStyle = '#f2f4fa'; g.fillRect(3, 3, 10, 1); g.fillRect(3, 3, 1, 10);
    const cover = [0, 3, 5, 8, 10, 8, 5, 3][phase];
    if (cover) { g.fillStyle = 'rgba(10,12,28,0.94)'; g.fillRect(phase <= 4 ? 13 - cover : 3, 3, cover, 10); }
  });
}

// Blobby cloud cells on a wrapping grid, so the tile repeats seamlessly.
function cloudGrid(seed) {
  const r = mulberry32(seed);
  let g = Float32Array.from({ length: GRID * GRID }, () => r());
  for (let pass = 0; pass < 3; pass++) {
    const n = new Float32Array(GRID * GRID);
    for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += g[((y + dy + GRID) % GRID) * GRID + (x + dx + GRID) % GRID];
      n[y * GRID + x] = s / 9;
    }
    g = n;
  }
  const sorted = [...g].sort((a, b) => a - b), cut = sorted[Math.floor(sorted.length * 0.7)];
  return (x, y) => g[((y + GRID) % GRID) * GRID + (x + GRID) % GRID] > cut;
}

function cloudGeometry(on) {
  const pos = [], col = [];
  const T = 4; // thickness
  const quad = (a, b, c, d, shade) => { for (const v of [a, b, c, a, c, d]) { pos.push(...v); col.push(shade, shade, shade); } };
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    if (!on(x, y)) continue;
    const x0 = x * CELL, x1 = x0 + CELL, z0 = y * CELL, z1 = z0 + CELL;
    quad([x0, T, z0], [x0, T, z1], [x1, T, z1], [x1, T, z0], 1);
    quad([x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1], 0.72);
    if (!on(x - 1, y)) quad([x0, 0, z0], [x0, 0, z1], [x0, T, z1], [x0, T, z0], 0.86);
    if (!on(x + 1, y)) quad([x1, 0, z1], [x1, 0, z0], [x1, T, z0], [x1, T, z1], 0.86);
    if (!on(x, y - 1)) quad([x1, 0, z0], [x0, 0, z0], [x0, T, z0], [x1, T, z0], 0.8);
    if (!on(x, y + 1)) quad([x0, 0, z1], [x1, 0, z1], [x1, T, z1], [x0, T, z1], 0.8);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

export class Sky {
  constructor(scene) {
    this.scene = scene;
    const basic = (map, extra = {}) => new THREE.MeshBasicMaterial({ map, transparent: true, fog: false, depthWrite: false, ...extra });
    const sunTex = pixelTex((g) => {
      g.fillStyle = '#ffd94a'; g.fillRect(2, 2, 12, 12);
      g.fillStyle = '#fff3a0'; g.fillRect(4, 4, 8, 8);
      g.fillStyle = '#fffbe0'; g.fillRect(6, 6, 4, 4);
    });
    this.sun = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), basic(sunTex));
    // soft glow around the sun
    const glowC = document.createElement('canvas');
    glowC.width = glowC.height = 64;
    const gg = glowC.getContext('2d');
    const grad = gg.createRadialGradient(32, 32, 4, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,240,180,0.9)'); grad.addColorStop(0.35, 'rgba(255,220,140,0.35)'); grad.addColorStop(1, 'rgba(255,200,120,0)');
    gg.fillStyle = grad; gg.fillRect(0, 0, 64, 64);
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(130, 130), basic(new THREE.CanvasTexture(glowC), { blending: THREE.AdditiveBlending }));
    this.moonTex = Array.from({ length: 8 }, (_, i) => moonTex(i));
    this.moon = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), basic(this.moonTex[0]));
    for (const m of [this.glow, this.sun, this.moon]) { m.renderOrder = -1; m.frustumCulled = false; scene.add(m); }

    const r = mulberry32(7);
    const pts = [];
    for (let i = 0; i < 600; i++) {
      const th = r() * Math.PI * 2, ph = Math.acos(r() * 2 - 1);
      const v = new THREE.Vector3().setFromSphericalCoords(150, ph, th);
      if (v.y > -20) pts.push(v.x, v.y, v.z);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    // 3D clouds: one wrapping tile drawn 3x3 around the camera, sliding east with the wind
    this.cloudMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true, transparent: true, opacity: 0.9, depthWrite: false });
    const cg = cloudGeometry(cloudGrid(99));
    this.clouds = [];
    for (let i = 0; i < 9; i++) { const m = new THREE.Mesh(cg, this.cloudMat); m.renderOrder = 0; scene.add(m); this.clouds.push(m); }
    this.wind = 0;

    this.skyColor = new THREE.Color();
    this.daylight = 1;
  }

  // frac: 0..1 through the day, 0 = dawn (06:00). day: which day it is (moon phase).
  update(frac, camPos, dt, day = 1) {
    let sunEl, angle;
    if (frac < DAY_FRACTION) { angle = (frac / DAY_FRACTION) * Math.PI; sunEl = Math.sin(angle); }
    else { angle = Math.PI + ((frac - DAY_FRACTION) / (1 - DAY_FRACTION)) * Math.PI; sunEl = Math.sin(angle); }
    // rises in the east, sets in the west, arcing a little to the south
    const dir = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0.3).normalize();
    this.sun.position.copy(camPos).addScaledVector(dir, 140);
    this.glow.position.copy(camPos).addScaledVector(dir, 141);
    this.moon.position.copy(camPos).addScaledVector(dir, -140);
    this.sun.lookAt(camPos); this.glow.lookAt(camPos); this.moon.lookAt(camPos);
    this.moon.material.map = this.moonTex[(day - 1) % 8];
    this.stars.position.copy(camPos);
    this.stars.rotation.z = angle;

    // daylight 0.16 (night) .. 1 (noon)
    const up = Math.max(0, sunEl);
    this.daylight = 0.16 + 0.84 * Math.min(1, up * 3.2);
    const night = 1 - Math.min(1, Math.max(0, sunEl + 0.12) * 4);
    const duskAmt = Math.max(0, 1 - Math.abs(sunEl) * 4.5);
    this.skyColor.copy(DAY).lerp(NIGHT, night).lerp(DUSK, duskAmt * 0.55);
    this.starMat.opacity = night;
    this.glow.material.opacity = 0.75 * (1 - night) * (0.6 + duskAmt * 0.6);
    this.cloudMat.color.setRGB(1, 1, 1).lerp(new THREE.Color(0.18, 0.2, 0.3), night).lerp(new THREE.Color(1, 0.8, 0.65), duskAmt * 0.4);

    this.wind = (this.wind + dt * CLOUD_SPEED) % TILE;
    const bx = Math.floor((camPos.x - this.wind) / TILE) * TILE + this.wind, bz = Math.floor(camPos.z / TILE) * TILE;
    let i = 0;
    for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) this.clouds[i++].position.set(bx + ox * TILE, CLOUD_Y, bz + oz * TILE);
    this.night = night;
    return this.daylight;
  }
}

export function clockString(frac) {
  let hours = frac < DAY_FRACTION ? 6 + (frac / DAY_FRACTION) * 12 : 18 + ((frac - DAY_FRACTION) / (1 - DAY_FRACTION)) * 12;
  hours %= 24;
  const h = Math.floor(hours), m = Math.floor((hours - h) * 60 / 10) * 10;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
export function isNight(frac) { return frac > DAY_FRACTION + 0.02 && frac < 0.985; }
