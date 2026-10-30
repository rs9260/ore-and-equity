// Voxel world: generation, storage, chunk meshing and raycasting.
import * as THREE from 'three';
import { mulberry32, Simplex } from './noise.js';
import { B, BLOCKS, OPAQUE, SOLID } from './blocks.js';
import { tileUV } from './textures.js';

export const CHUNK = 16;
export const WX = 320, WZ = 288, H = 64;
export const SEA = 20;
export const LAVA_Y = 7; // caves carved at or below this height fill with lava
const CX = WX / CHUNK, CZ = WZ / CHUNK;
// The villages sit in the middle of the map; this shifts the original layout there.
const OX = 64, OZ = 64;
// Block-light emitters and brightness per light level (0..15).
const EMIT = new Uint8Array(256);
const BLIGHT = Array.from({ length: 16 }, (_, l) => (l ? Math.pow(0.84, 15 - l) : 0));

// Village / landmark sites. Terrain is flattened around each.
export const SITES = {
  post: { name: 'Trading Post', x: 96 + OX, z: 92 + OZ, r: 12 },
  mining: { name: 'Mining Town', x: 150 + OX, z: 56 + OZ, r: 15 },
  farm: { name: 'Farm Village', x: 42 + OX, z: 64 + OZ, r: 16 },
  port: { name: 'Trade Port', x: 104 + OX, z: 150 + OZ, r: 15, fixedY: SEA + 2, coast: true },
};
EMIT[B.LANTERN] = 15; EMIT[B.LAVA] = 15;

// ---------- shaders ----------
const VERT = `
attribute vec3 aLight;
varying vec2 vUv; varying vec3 vL; varying vec3 vWorld; varying float vFog;
void main() {
  vUv = uv; vL = aLight;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mv = viewMatrix * wp;
  vFog = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
uniform sampler2D map; uniform float uDay; uniform vec3 uPlayer; uniform float uTorch;
uniform vec3 fogColor; uniform float fogNear; uniform float fogFar; uniform float uOpacity; uniform float uCut;
varying vec2 vUv; varying vec3 vL; varying vec3 vWorld; varying float vFog;
void main() {
  vec4 t = texture2D(map, vUv);
  if (t.a < uCut) discard;
  float sky = vL.y * vL.y * uDay;
  float d = distance(vWorld, uPlayer);
  float torch = uTorch * pow(clamp(1.0 - d / 11.0, 0.0, 1.0), 1.3);
  float warm = max(vL.z, torch);
  float light = max(max(sky, warm), 0.04);
  // lantern, lava and held light is warmer than daylight
  vec3 tint = mix(vec3(1.0), vec3(1.0, 0.84, 0.64), clamp((warm - sky) * 1.6, 0.0, 1.0) * 0.55);
  vec3 c = t.rgb * vL.x * light * tint;
  c = mix(c, fogColor, smoothstep(fogNear, fogFar, vFog));
  gl_FragColor = vec4(c, t.a * uOpacity);
}`;

export function makeMaterials(atlas) {
  const uniforms = () => ({
    map: { value: atlas }, uDay: { value: 1 }, uPlayer: { value: new THREE.Vector3() }, uTorch: { value: 0 },
    fogColor: { value: new THREE.Color(0x9cc8f0) }, fogNear: { value: 50 }, fogFar: { value: 100 },
    uOpacity: { value: 1 }, uCut: { value: 0.5 },
  });
  const solid = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: uniforms() });
  const water = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: uniforms(), transparent: true, depthWrite: false });
  water.uniforms.uOpacity.value = 0.85;
  water.uniforms.uCut.value = 0.01;
  return { solid, water };
}

// Face table: dir, 4 corners, uv per corner. Triangles (0,1,2),(2,1,3).
const FACES = [
  { d: [-1, 0, 0], c: [[0, 1, 0], [0, 0, 0], [0, 1, 1], [0, 0, 1]], uv: [[0, 1], [0, 0], [1, 1], [1, 0]], shade: 0.8, key: 'side' },
  { d: [1, 0, 0], c: [[1, 1, 1], [1, 0, 1], [1, 1, 0], [1, 0, 0]], uv: [[0, 1], [0, 0], [1, 1], [1, 0]], shade: 0.8, key: 'side' },
  { d: [0, -1, 0], c: [[1, 0, 1], [0, 0, 1], [1, 0, 0], [0, 0, 0]], uv: [[1, 0], [0, 0], [1, 1], [0, 1]], shade: 0.5, key: 'bottom' },
  { d: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [0, 1, 0], [1, 1, 0]], uv: [[1, 1], [0, 1], [1, 0], [0, 0]], shade: 1.0, key: 'top' },
  { d: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [1, 1, 0], [0, 1, 0]], uv: [[0, 0], [1, 0], [0, 1], [1, 1]], shade: 0.65, key: 'side' },
  { d: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]], uv: [[0, 0], [1, 0], [0, 1], [1, 1]], shade: 0.65, key: 'side' },
];
const AO_CURVE = [0.45, 0.65, 0.82, 1.0];
const NEIGHBOURS = [[-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]];
const SPREAD1 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const SPREAD2 = [[2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [1, -1], [-1, 1], [-1, -1]];

class MeshBuf {
  constructor() { this.pos = []; this.uv = []; this.light = []; this.idx = []; this.n = 0; }
  quad(p, uv, l, flip) {
    const n = this.n;
    for (let i = 0; i < 4; i++) {
      this.pos.push(p[i][0], p[i][1], p[i][2]);
      this.uv.push(uv[i][0], uv[i][1]);
      this.light.push(l[i][0], l[i][1], l[i][2]);
    }
    if (flip) this.idx.push(n, n + 1, n + 3, n, n + 3, n + 2);
    else this.idx.push(n, n + 1, n + 2, n + 2, n + 1, n + 3);
    this.n += 4;
  }
  geometry() {
    if (!this.n) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aLight', new THREE.Float32BufferAttribute(this.light, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

export class World {
  constructor(seed, scene, materials) {
    this.seed = seed;
    this.scene = scene;
    this.mat = materials;
    this.data = new Uint8Array(WX * WZ * H);
    this.height = new Int16Array(WX * WZ); // highest light-blocking block per column
    this.blight = new Uint8Array(WX * WZ * H); // block light level 0..15 from lanterns and lava
    this.chunks = new Map(); // key -> {solid, water}
    this.dirty = new Set();
    this.noise = new Simplex(mulberry32(seed));
    this.noiseB = new Simplex(mulberry32(seed + 1));
    this.rand = mulberry32(seed + 2);
    this.uvCache = {};
    this.edits = new Map(); // block index -> id for every change made in play (what a save stores)
  }

  idx(x, y, z) { return x + WX * (z + WZ * y); }
  inBounds(x, y, z) { return x >= 0 && z >= 0 && y >= 0 && x < WX && z < WZ && y < H; }
  get(x, y, z) {
    if (y < 0) return B.BEDROCK;
    if (x < 0 || z < 0 || x >= WX || z >= WZ || y >= H) return B.AIR;
    return this.data[x + WX * (z + WZ * y)];
  }
  // Raw write used by generation (no remesh).
  put(x, y, z, id) { if (this.inBounds(x, y, z)) this.data[x + WX * (z + WZ * y)] = id; }

  // ---------- generation ----------
  siteBlend(x, z) {
    // Returns [weight, plateauY] of the strongest nearby site.
    let best = [0, 0];
    for (const s of Object.values(SITES)) {
      if (s.coast && z > s.z + 6) continue; // leave the shoreline natural
      const d = Math.hypot(x - s.x, z - s.z);
      const edge = s.r + 10;
      if (d < edge) {
        const w = d < s.r ? 1 : 1 - smooth((d - s.r) / 10);
        if (w > best[0]) best = [w, s.y];
      }
    }
    return best;
  }

  naturalHeight(x, z) {
    const n = this.noise;
    let h = 27 + n.fbm2(x / 95, z / 95, 4) * 11 + n.fbm2(x / 30 + 50, z / 30, 2) * 3;
    const hills = Math.max(0, n.fbm2(x / 60 + 200, z / 60 - 100, 3));
    h += hills * hills * 26 * Math.min(1, Math.max(0, (160 + OZ - z) / 25));
    // rugged mountains on the outskirts, away from the villages
    const far = smooth((Math.hypot(x - WX / 2, (z - WZ / 2) * 1.2) - 105) / 45);
    if (far > 0) { const m = Math.max(0, n.fbm2(x / 70 + 500, z / 70 - 300, 4)); h += m * m * 70 * far * Math.min(1, Math.max(0, (175 + OZ - z) / 25)); }
    // southern sea
    if (z > 145 + OZ) h -= ((z - 145 - OZ) / 14) ** 2 * 12;
    // soft rim so the edge of the world reads as a coastline
    const edge = Math.min(x, z, WX - 1 - x, WZ - 1 - z);
    if (edge < 8) h -= (8 - edge) * 1.2;
    return h;
  }

  async generate(onProgress) {
    for (const s of Object.values(SITES)) {
      s.y = s.fixedY ?? Math.round(Math.min(34, Math.max(24, this.naturalHeight(s.x, s.z))));
    }
    const total = CX * CZ;
    let done = 0, t0 = performance.now();
    for (let cz = 0; cz < CZ; cz++) for (let cx = 0; cx < CX; cx++) {
      this.generateChunk(cx, cz);
      done++;
      if (performance.now() - t0 > 40) { onProgress?.(done / total * 0.6); await frame(); t0 = performance.now(); }
    }
    this.decorate();
    onProgress?.(0.65);
  }

  // Cave noise is smooth, so it is sampled every 4 blocks and interpolated: far cheaper than per voxel.
  caveFields(cx, cz) {
    const n3 = this.noiseB, G = 4, GX = CHUNK / G + 1, GY = H / G + 1;
    const f = this.caveBuf ??= new Float32Array(5 * GX * GX * GY);
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    for (let gy = 0; gy < GY; gy++) for (let gz = 0; gz < GX; gz++) for (let gx = 0; gx < GX; gx++) {
      const x = x0 + gx * G, y = gy * G, z = z0 + gz * G, i = (gx + GX * (gz + GX * gy)) * 5;
      f[i] = n3.noise3(x / 30, y / 16, z / 30); // narrow winding tunnels (pair)
      f[i + 1] = n3.noise3(x / 30 + 91, y / 16 + 17, z / 30 - 33);
      f[i + 2] = n3.noise3(x / 54 + 300, y / 24, z / 54); // wide tunnels (pair)
      f[i + 3] = n3.noise3(x / 54 - 140, y / 24 + 60, z / 54 + 210);
      f[i + 4] = n3.noise3(x / 44 - 70, y / 18, z / 44 + 40); // big caverns
    }
    return f;
  }

  generateChunk(cx, cz) {
    const n2 = this.noise;
    const f = this.caveFields(cx, cz);
    const G = 4, GX = CHUNK / G + 1;
    const v = [0, 0, 0, 0, 0];
    const sample = (lx, y, lz) => {
      const gx = lx >> 2, gy = y >> 2, gz = lz >> 2, tx = (lx & 3) / G, ty = (y & 3) / G, tz = (lz & 3) / G;
      const i000 = (gx + GX * (gz + GX * gy)) * 5, dX = 5, dZ = GX * 5, dY = GX * GX * 5;
      for (let k = 0; k < 5; k++) {
        const i = i000 + k;
        const c00 = f[i] + (f[i + dX] - f[i]) * tx, c10 = f[i + dY] + (f[i + dY + dX] - f[i + dY]) * tx;
        const c01 = f[i + dZ] + (f[i + dZ + dX] - f[i + dZ]) * tx, c11 = f[i + dY + dZ] + (f[i + dY + dZ + dX] - f[i + dY + dZ]) * tx;
        const c0 = c00 + (c10 - c00) * ty, c1 = c01 + (c11 - c01) * ty;
        v[k] = c0 + (c1 - c0) * tz;
      }
    };
    for (let lz = 0; lz < CHUNK; lz++) for (let lx = 0; lx < CHUNK; lx++) {
      const x = cx * CHUNK + lx, z = cz * CHUNK + lz;
      let h = this.naturalHeight(x, z);
      const [w, py] = this.siteBlend(x, z);
      h = Math.round(h * (1 - w) + py * w);
      h = Math.max(3, Math.min(H - 6, h));
      const beach = h <= SEA + 1;
      const villageCore = w > 0.6;
      // some tunnels are allowed to break the surface as cave mouths
      const mouth = n2.noise2(x / 64 + 700, z / 64 - 300) > 0.5;
      // ravines: long narrow cracks following a ridge line of 2D noise
      const rv = Math.abs(n2.noise2(x / 150 + 40, z / 150 - 90));
      const ravine = !beach && w < 0.01 && rv < 0.024 && n2.noise2(x / 260, z / 260 + 600) > -0.15 ? 1 - rv / 0.024 : 0;
      const rFloor = 5 + (1 - ravine) * 16;
      const canCave = !beach && h > SEA + 1;
      for (let y = 0; y < H; y++) {
        let id = B.AIR;
        if (y === 0) id = B.BEDROCK;
        else if (y === 1 && this.rand() < 0.5) id = B.BEDROCK;
        else if (y < h - 3) id = B.STONE;
        else if (y < h) id = beach ? B.SAND : B.DIRT;
        else if (y === h) id = beach ? (h < SEA ? B.GRAVEL : B.SAND) : B.GRASS;
        else if (y <= SEA) id = B.WATER;
        if (id !== B.AIR && id !== B.WATER && id !== B.BEDROCK && y > 1 && canCave && !(villageCore && y > h - 9)) {
          const depth = h - y;
          let cave = false;
          if (ravine && y >= rFloor && ravine > 0.8 - 0.55 * Math.min(1, (y - rFloor) / Math.max(1, h - rFloor))) cave = true;
          else {
            sample(lx, y, lz);
            const open = mouth ? 1 : smooth(depth / 10);
            const s1 = v[0] * v[0] + v[1] * v[1], s2 = v[2] * v[2] + v[3] * v[3];
            cave = s1 < 0.017 * (0.3 + 0.9 * open)
              || (y < 46 && s2 < 0.011 * (0.25 + 0.95 * open))
              || (depth > 7 && v[4] > 0.5 + ((y - 15) / 16) ** 2 * 0.45);
          }
          if (cave) id = y <= LAVA_Y ? B.LAVA : B.AIR;
        }
        this.data[x + WX * (z + WZ * y)] = id;
      }
    }
    this.placeOres(cx, cz);
  }

  placeOres(cx, cz) {
    const r = this.rand;
    const vein = (id, count, ymin, ymax, smin, smax) => {
      for (let v = 0; v < count; v++) {
        let x = cx * CHUNK + r() * CHUNK | 0, z = cz * CHUNK + r() * CHUNK | 0, y = ymin + (r() * (ymax - ymin)) | 0;
        const size = smin + (r() * (smax - smin + 1) | 0);
        for (let k = 0; k < size; k++) {
          if (this.get(x, y, z) === B.STONE) this.put(x, y, z, id);
          const a = r() * 6 | 0;
          if (a === 0) x++; else if (a === 1) x--; else if (a === 2) y++; else if (a === 3) y--; else if (a === 4) z++; else z--;
        }
      }
    };
    vein(B.COAL_ORE, 14, 6, 46, 5, 9);
    vein(B.IRON_ORE, 10, 3, 32, 3, 6);
    vein(B.GOLD_ORE, 5, 2, 19, 3, 5);
    vein(B.DIAMOND_ORE, r() < 0.55 ? 2 : 1, 2, 11, 2, 4);
  }

  decorate() {
    const r = this.rand;
    for (let z = 2; z < WZ - 2; z++) for (let x = 2; x < WX - 2; x++) {
      const [w] = this.siteBlend(x, z);
      const y = this.surfaceY(x, z);
      if (this.get(x, y, z) !== B.GRASS) continue;
      const roll = r();
      if (w < 0.05 && roll < 0.012) this.tree(x, y + 1, z);
      else if (roll < 0.09 && w < 0.9) this.put(x, y + 1, z, B.TALLGRASS);
      else if (roll < 0.1 && w < 0.9) this.put(x, y + 1, z, r() < 0.5 ? B.FLOWER_RED : B.FLOWER_YELLOW);
    }
  }

  tree(x, y, z) {
    const r = this.rand;
    const hgt = 4 + (r() * 3 | 0);
    for (let dy = hgt - 3; dy <= hgt + 1; dy++) {
      const rad = dy >= hgt ? 1 : 2;
      for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
        if (rad === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2 && r() < 0.6) continue;
        if (this.get(x + dx, y + dy, z + dz) === B.AIR) this.put(x + dx, y + dy, z + dz, B.LEAVES);
      }
    }
    for (let dy = 0; dy < hgt; dy++) this.put(x, y + dy, z, B.LOG);
    this.put(x, y - 1, z, B.DIRT);
  }

  surfaceY(x, z) {
    for (let y = H - 1; y > 0; y--) {
      const id = this.get(x, y, z);
      if (id !== B.AIR && id !== B.WATER && !BLOCKS[id].cross && id !== B.LEAVES) return y;
    }
    return 0;
  }

  // Flood-fill block light out from every emitter.
  computeBlockLight() {
    const L = this.blight, data = this.data;
    L.fill(0);
    const q = this.lightQueue ??= new Int32Array(1 << 21);
    let tail = 0;
    for (let i = 0; i < data.length; i++) { const e = EMIT[data[i]]; if (e) { L[i] = e; q[tail++ & (q.length - 1)] = i; } }
    this.spreadLight(q, 0, tail);
  }
  spreadLight(q, head, tail) {
    const L = this.blight, data = this.data, M = q.length - 1, S = WX * WZ;
    while (head !== tail) {
      const i = q[head++ & M];
      const l = L[i] - 1;
      if (l <= 0) continue;
      const x = i % WX, z = ((i / WX) | 0) % WZ, y = (i / S) | 0;
      const push = (j) => { if (L[j] < l && !OPAQUE[data[j]]) { L[j] = l; q[tail++ & M] = j; } };
      if (x > 0) push(i - 1); if (x < WX - 1) push(i + 1);
      if (z > 0) push(i - WX); if (z < WZ - 1) push(i + WX);
      if (y > 0) push(i - S); if (y < H - 1) push(i + S);
    }
  }
  // Recompute block light in the box an edit at (x,y,z) can influence; returns the chunk range that changed.
  relight(x, y, z) {
    const R = 15, L = this.blight, data = this.data;
    const xa = Math.max(0, x - R), xb = Math.min(WX - 1, x + R), za = Math.max(0, z - R), zb = Math.min(WZ - 1, z + R);
    const ya = Math.max(0, y - R), yb = Math.min(H - 1, y + R);
    const before = this.relightBuf ??= new Uint8Array(31 * 31 * 31);
    let any = false, k = 0;
    for (let yy = ya; yy <= yb; yy++) for (let zz = za; zz <= zb; zz++) for (let xx = xa; xx <= xb; xx++) {
      const i = xx + WX * (zz + WZ * yy);
      before[k++] = L[i]; if (L[i]) any = true; L[i] = 0;
    }
    const q = this.lightQueue ??= new Int32Array(1 << 21);
    const M = q.length - 1;
    let tail = 0;
    for (let yy = ya; yy <= yb; yy++) for (let zz = za; zz <= zb; zz++) for (let xx = xa; xx <= xb; xx++) {
      const i = xx + WX * (zz + WZ * yy);
      const e = EMIT[data[i]];
      if (e) { L[i] = e; q[tail++ & M] = i; any = true; }
      // light flowing in from just outside the box
      if (xx === xa || xx === xb || zz === za || zz === zb || yy === ya || yy === yb) {
        for (const [dx, dy, dz] of NEIGHBOURS) {
          const nx = xx + dx, ny = yy + dy, nz = zz + dz;
          if (nx >= xa && nx <= xb && ny >= ya && ny <= yb && nz >= za && nz <= zb) continue;
          if (!this.inBounds(nx, ny, nz)) continue;
          const j = nx + WX * (nz + WZ * ny);
          if (L[j] > 1) { q[tail++ & M] = j; any = true; }
        }
      }
    }
    if (!any) return null;
    this.spreadLight(q, 0, tail);
    let c0x = Infinity, c1x = -1, c0z = Infinity, c1z = -1;
    k = 0;
    for (let yy = ya; yy <= yb; yy++) for (let zz = za; zz <= zb; zz++) for (let xx = xa; xx <= xb; xx++) {
      if (before[k++] !== L[xx + WX * (zz + WZ * yy)]) {
        c0x = Math.min(c0x, xx - 1); c1x = Math.max(c1x, xx + 1); c0z = Math.min(c0z, zz - 1); c1z = Math.max(c1z, zz + 1);
      }
    }
    if (c1x < 0) return null;
    return [Math.floor(Math.max(0, c0x) / CHUNK), Math.floor(Math.min(WX - 1, c1x) / CHUNK), Math.floor(Math.max(0, c0z) / CHUNK), Math.floor(Math.min(WZ - 1, c1z) / CHUNK)];
  }
  blockLightAt(x, y, z) {
    if (x < 0 || z < 0 || y < 0 || x >= WX || z >= WZ || y >= H) return 0;
    return BLIGHT[this.blight[x + WX * (z + WZ * y)]];
  }

  computeHeights() {
    for (let z = 0; z < WZ; z++) for (let x = 0; x < WX; x++) this.updateHeight(x, z);
  }
  updateHeight(x, z) {
    let y = H - 1;
    for (; y > 0; y--) { const id = this.data[x + WX * (z + WZ * y)]; if (OPAQUE[id] && id !== B.LEAVES) break; }
    this.height[x + WX * z] = y;
  }

  // ---------- editing ----------
  set(x, y, z, id) {
    if (!this.inBounds(x, y, z)) return;
    this.data[this.idx(x, y, z)] = id;
    this.edits.set(this.idx(x, y, z), id);
    this.updateHeight(x, z);
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const lx = x - cx * CHUNK, lz = z - cz * CHUNK;
    // smooth lighting and sideways skylight read a few blocks past a chunk's edge
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if ((dx === -1 && lx > 2) || (dx === 1 && lx < CHUNK - 3)) continue;
      if ((dz === -1 && lz > 2) || (dz === 1 && lz < CHUNK - 3)) continue;
      this.markDirty(cx + dx, cz + dz, true);
    }
    const lit = this.relight(x, y, z);
    if (lit) for (let a = lit[0]; a <= lit[1]; a++) for (let b = lit[2]; b <= lit[3]; b++) this.markDirty(a, b, true);
  }
  markDirty(cx, cz, urgent = false) {
    if (cx < 0 || cz < 0 || cx >= CX || cz >= CZ) return;
    const k = cx + ',' + cz;
    if (urgent) { this.dirty.delete(k); this.urgent ??= new Set(); this.urgent.add(k); }
    else this.dirty.add(k);
  }
  markAllDirty() { for (let cz = 0; cz < CZ; cz++) for (let cx = 0; cx < CX; cx++) this.markDirty(cx, cz); }

  // Rebuild dirty chunks; urgent (edited) ones always, others nearest-first within a budget.
  update(px, pz, budget = 2) {
    if (this.urgent?.size) { for (const k of this.urgent) this.buildChunkKey(k); this.urgent.clear(); }
    if (!this.dirty.size) return;
    const list = [...this.dirty].map((k) => {
      const [cx, cz] = k.split(',').map(Number);
      return [k, (cx * CHUNK + 8 - px) ** 2 + (cz * CHUNK + 8 - pz) ** 2];
    }).sort((a, b) => a[1] - b[1]);
    for (let i = 0; i < Math.min(budget, list.length); i++) { this.dirty.delete(list[i][0]); this.buildChunkKey(list[i][0]); }
  }
  pendingChunks() { return this.dirty.size; }

  buildChunkKey(k) { const [cx, cz] = k.split(',').map(Number); this.buildChunk(cx, cz); }

  uvs(name) { return this.uvCache[name] ??= tileUV(name); }

  colSky(x, y, z) {
    if (x < 0 || z < 0 || x >= WX || z >= WZ) return 1;
    const h = this.height[x + WX * z];
    if (y > h) return 1;
    return Math.max(0, 1 - (h - y + 1) * 0.16);
  }
  // Column skylight plus a cheap approximation of light spreading sideways (under overhangs, into cave mouths).
  skyAt(x, y, z) {
    let s = this.colSky(x, y, z);
    if (s >= 1) return 1;
    for (const [dx, dz] of SPREAD1) s = Math.max(s, this.colSky(x + dx, y, z + dz) * 0.8);
    if (s < 0.6) for (const [dx, dz] of SPREAD2) s = Math.max(s, this.colSky(x + dx, y, z + dz) * 0.6);
    return s;
  }

  buildChunk(cx, cz) {
    const solid = new MeshBuf(), water = new MeshBuf();
    const data = this.data;
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    const op = (x, y, z) => {
      if (y < 0) return 1;
      if (x < 0 || z < 0 || x >= WX || z >= WZ || y >= H) return 0;
      return OPAQUE[data[x + WX * (z + WZ * y)]];
    };
    // skylight is costly (sideways spread), so cache it for this chunk plus a 2-block border
    const SW = CHUNK + 4;
    const skyCache = this.skyCache ??= new Float32Array(SW * SW * H);
    skyCache.fill(-1);
    const sky = (x, y, z) => {
      if (y >= H) return 1;
      if (y < 0) return 0;
      const i = (x - x0 + 2) + SW * ((z - z0 + 2) + SW * y);
      let v = skyCache[i];
      if (v < 0) v = skyCache[i] = this.skyAt(x, y, z);
      return v;
    };
    // Smooth lighting: each vertex averages sky and block light over the open cells touching it in front of the face.
    let vSky = 0, vBlk = 0;
    const vlight = (nx, ny, nz, o1, o2, a, bb) => {
      let s = sky(nx, ny, nz), l = this.blockLightAt(nx, ny, nz), n = 1;
      if (!a) { s += sky(nx + o1[0], ny + o1[1], nz + o1[2]); l += this.blockLightAt(nx + o1[0], ny + o1[1], nz + o1[2]); n++; }
      if (!bb) { s += sky(nx + o2[0], ny + o2[1], nz + o2[2]); l += this.blockLightAt(nx + o2[0], ny + o2[1], nz + o2[2]); n++; }
      const dx = nx + o1[0] + o2[0], dy = ny + o1[1] + o2[1], dz = nz + o1[2] + o2[2];
      if (!(a && bb) && !op(dx, dy, dz)) { s += sky(dx, dy, dz); l += this.blockLightAt(dx, dy, dz); n++; }
      vSky = s / n; vBlk = l / n;
    };
    const P = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]], L = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const o1 = [0, 0, 0], o2 = [0, 0, 0];
    for (let y = 0; y < H; y++) for (let lz = 0; lz < CHUNK; lz++) for (let lx = 0; lx < CHUNK; lx++) {
      const x = x0 + lx, z = z0 + lz;
      const id = data[x + WX * (z + WZ * y)];
      if (id === 0) continue;
      const b = BLOCKS[id];
      if (b.cross) { this.crossQuads(solid, x, y, z, b); continue; }
      if (b.liquid) { this.liquidFaces(id === B.LAVA ? solid : water, x, y, z, id); continue; }
      for (let f = 0; f < 6; f++) {
        const F = FACES[f];
        const nx = x + F.d[0], ny = y + F.d[1], nz = z + F.d[2];
        const nid = this.get(nx, ny, nz);
        if (OPAQUE[nid] || (nid === id && b.transparent)) continue;
        const [u0, v0, u1, v1] = this.uvs(b.faces[F.key]);
        const ao = [0, 0, 0, 0];
        // axis of the normal and the two tangent axes
        const ax = F.d[0] ? 0 : F.d[1] ? 1 : 2;
        const t1 = ax === 0 ? 1 : 0, t2 = ax === 2 ? 1 : 2;
        for (let c = 0; c < 4; c++) {
          const cc = F.c[c];
          o1[0] = o1[1] = o1[2] = o2[0] = o2[1] = o2[2] = 0;
          o1[t1] = cc[t1] ? 1 : -1; o2[t2] = cc[t2] ? 1 : -1;
          const a = op(nx + o1[0], ny + o1[1], nz + o1[2]);
          const bb = op(nx + o2[0], ny + o2[1], nz + o2[2]);
          const cr = op(nx + o1[0] + o2[0], ny + o1[1] + o2[1], nz + o1[2] + o2[2]);
          ao[c] = a && bb ? 0 : 3 - (a + bb + cr);
          vlight(nx, ny, nz, o1, o2, a, bb);
          P[c][0] = x + cc[0]; P[c][1] = y + cc[1]; P[c][2] = z + cc[2];
          L[c][0] = F.shade * AO_CURVE[ao[c]]; L[c][1] = vSky; L[c][2] = b.glow ? 1 : vBlk;
        }
        const uv = F.uv.map(([u, v]) => [u ? u1 : u0, v ? v1 : v0]);
        solid.quad(P, uv, L, ao[0] + ao[3] > ao[1] + ao[2]);
      }
    }
    const k = cx + ',' + cz;
    const old = this.chunks.get(k);
    if (old) for (const m of [old.solid, old.water]) if (m) { this.scene.remove(m); m.geometry.dispose(); }
    const entry = {};
    const gs = solid.geometry(), gw = water.geometry();
    if (gs) { entry.solid = new THREE.Mesh(gs, this.mat.solid); this.scene.add(entry.solid); }
    if (gw) { entry.water = new THREE.Mesh(gw, this.mat.water); entry.water.renderOrder = 1; this.scene.add(entry.water); }
    this.chunks.set(k, entry);
  }

  crossQuads(buf, x, y, z, b) {
    const [u0, v0, u1, v1] = this.uvs(b.faces.side);
    const sky = this.skyAt(x, y, z);
    const l = [0.9, sky, this.blockLightAt(x, y, z)];
    const L = [l, l, l, l];
    const uv = [[u0, v1], [u0, v0], [u1, v1], [u1, v0]];
    const e = 0.15, f = 0.85;
    const quads = [
      [[x + e, y + 1, z + e], [x + e, y, z + e], [x + f, y + 1, z + f], [x + f, y, z + f]],
      [[x + f, y + 1, z + e], [x + f, y, z + e], [x + e, y + 1, z + f], [x + e, y, z + f]],
    ];
    for (const q of quads) {
      buf.quad(q, uv, L, false);
      buf.quad([q[2], q[3], q[0], q[1]], [uv[0], uv[1], uv[2], uv[3]], L, false);
    }
  }

  // Water and lava: a slightly lowered top surface, faces only where they meet air or other blocks.
  liquidFaces(buf, x, y, z, id) {
    const lava = id === B.LAVA;
    const [u0, v0, u1, v1] = this.uvs(lava ? 'lava' : 'water');
    const above = this.get(x, y + 1, z);
    const top = above === id ? 1 : 0.88;
    for (let f = 0; f < 6; f++) {
      const F = FACES[f];
      const nid = this.get(x + F.d[0], y + F.d[1], z + F.d[2]);
      if (nid === id || OPAQUE[nid]) continue;
      if (f === 2 && !lava) continue; // never see water from below in practice
      const sky = this.skyAt(x + F.d[0], y + F.d[1], z + F.d[2]);
      const P = F.c.map((c) => [x + c[0], y + (c[1] ? top : 0), z + c[2]]);
      const bl = this.blockLightAt(x + F.d[0], y + F.d[1], z + F.d[2]);
      const L = [0, 1, 2, 3].map(() => (lava ? [1, 1, 1] : [F.shade, Math.max(sky, 0.6), bl]));
      const uv = F.uv.map(([u, v]) => [u ? u1 : u0, v ? v1 : v0]);
      buf.quad(P, uv, L, false);
    }
  }

  // ---------- queries ----------
  isSolid(x, y, z) { return SOLID[this.get(Math.floor(x), Math.floor(y), Math.floor(z))] === 1; }

  // Voxel DDA raycast. Returns hit block and the face normal, or null.
  raycast(origin, dir, maxDist) {
    let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
    const sx = Math.sign(dir.x), sy = Math.sign(dir.y), sz = Math.sign(dir.z);
    const tdx = Math.abs(1 / dir.x), tdy = Math.abs(1 / dir.y), tdz = Math.abs(1 / dir.z);
    let tmx = sx > 0 ? (x + 1 - origin.x) * tdx : (origin.x - x) * tdx;
    let tmy = sy > 0 ? (y + 1 - origin.y) * tdy : (origin.y - y) * tdy;
    let tmz = sz > 0 ? (z + 1 - origin.z) * tdz : (origin.z - z) * tdz;
    let nx = 0, ny = 0, nz = 0, t = 0;
    while (t <= maxDist) {
      const id = this.get(x, y, z);
      if (id !== B.AIR && id !== B.WATER && id !== B.LAVA) return { x, y, z, nx, ny, nz, id, dist: t };
      if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += tdx; nx = -sx; ny = 0; nz = 0; }
      else if (tmy < tmz) { y += sy; t = tmy; tmy += tdy; nx = 0; ny = -sy; nz = 0; }
      else { z += sz; t = tmz; tmz += tdz; nx = 0; ny = 0; nz = -sz; }
    }
    return null;
  }
}

function smooth(t) { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); }
export function frame() { return new Promise((r) => setTimeout(r, 0)); }
