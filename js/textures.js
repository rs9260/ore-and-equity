// Procedural 16x16 pixel-art textures, packed into one atlas. All original art.
import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { BLOCKS, I } from './blocks.js';

const T = 16;
const COLS = 16;
export const ATLAS_PX = 256;

const TILE_NAMES = [
  'grass_top', 'grass_side', 'dirt', 'stone', 'cobble', 'log_side', 'log_top', 'leaves', 'planks', 'sand',
  'gravel', 'bedrock', 'water', 'coal_ore', 'iron_ore', 'gold_ore', 'diamond_ore', 'brick', 'glass',
  'hay_side', 'hay_top', 'cloth_red', 'cloth_blue', 'cloth_white', 'gold_block', 'board_side',
  'farmland_top', 'wheat', 'tallgrass', 'flower_red', 'flower_yellow', 'stone_brick', 'lantern', 'roof', 'lava',
];
export const TILE_INDEX = {};
TILE_NAMES.forEach((n, i) => (TILE_INDEX[n] = i));

// UV rect for a tile, slightly inset to avoid bleeding.
export function tileUV(name) {
  const i = TILE_INDEX[name];
  const cx = i % COLS, cy = Math.floor(i / COLS);
  const e = 0.01 / ATLAS_PX;
  const u0 = (cx * T) / ATLAS_PX + e, u1 = ((cx + 1) * T) / ATLAS_PX - e;
  const v1 = 1 - (cy * T) / ATLAS_PX - e, v0 = 1 - ((cy + 1) * T) / ATLAS_PX + e;
  return [u0, v0, u1, v1];
}

// ---------- pixel helpers ----------
class Px {
  constructor(seed) { this.d = new Uint8ClampedArray(T * T * 4); this.r = mulberry32(seed); }
  set(x, y, c, a = 255) {
    if (x < 0 || y < 0 || x >= T || y >= T) return;
    const i = (y * T + x) * 4;
    this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = a;
  }
  get(x, y) { const i = (y * T + x) * 4; return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]]; }
  fill(base, v = 0.12) {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) this.set(x, y, vary(base, (this.r() - 0.5) * 2 * v));
  }
  speck(col, n, v = 0.08) {
    for (let k = 0; k < n; k++) this.set((this.r() * T) | 0, (this.r() * T) | 0, vary(col, (this.r() - 0.5) * v));
  }
}
const vary = (c, f) => [c[0] * (1 + f), c[1] * (1 + f), c[2] * (1 + f)];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function voronoi(p, n, colorFn, edge) {
  const pts = [];
  for (let k = 0; k < n; k++) pts.push([p.r() * T, p.r() * T, colorFn(k)]);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    let d1 = 1e9, d2 = 1e9, best = null;
    for (const q of pts) for (let ox = -T; ox <= T; ox += T) for (let oy = -T; oy <= T; oy += T) {
      const dx = x + 0.5 - (q[0] + ox), dy = y + 0.5 - (q[1] + oy);
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < d1) { d2 = d1; d1 = d; best = q; } else if (d < d2) d2 = d;
    }
    const c = d2 - d1 < 1.0 ? edge : vary(best[2], (p.r() - 0.5) * 0.12);
    p.set(x, y, c);
  }
}

function ore(p, col, hi, clusters, seedStone = true) {
  if (seedStone) p.fill([125, 125, 125], 0.1);
  for (let c = 0; c < clusters; c++) {
    const cx = 2 + p.r() * 12, cy = 2 + p.r() * 12;
    const n = 3 + ((p.r() * 3) | 0);
    for (let k = 0; k < n; k++) {
      const x = Math.round(cx + (p.r() - 0.5) * 3), y = Math.round(cy + (p.r() - 0.5) * 3);
      p.set(x, y, col);
      if (p.r() < 0.5) p.set(x - 1, y - 1 < 0 ? y : y - 1, hi);
      p.set(x + 1, y + 1, vary(col, -0.35));
    }
  }
}

const PAINTERS = {
  dirt(p) { p.fill([134, 96, 67], 0.14); p.speck([95, 68, 47], 18); p.speck([160, 120, 88], 10); },
  grass_top(p) { p.fill([112, 152, 78], 0.12); p.speck([90, 128, 62], 30); p.speck([132, 170, 96], 12); },
  grass_side(p) {
    PAINTERS.dirt(p);
    for (let x = 0; x < T; x++) {
      const h = 3 + ((p.r() * 3) | 0);
      for (let y = 0; y < h; y++) p.set(x, y, vary([112, 152, 78], (p.r() - 0.5) * 0.22));
    }
  },
  stone(p) {
    p.fill([126, 126, 126], 0.08);
    for (let k = 0; k < 7; k++) {
      const x = (p.r() * T) | 0, y = (p.r() * T) | 0, len = 2 + ((p.r() * 4) | 0);
      for (let i = 0; i < len; i++) p.set(x + i, y, [108, 108, 108]);
    }
    p.speck([145, 145, 145], 12);
  },
  cobble(p) { voronoi(p, 9, () => vary([128, 128, 128], (p.r() - 0.5) * 0.4), [70, 70, 72]); },
  log_side(p) {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const stripe = (x * 7 + ((p.r() * 3) | 0)) % 4 === 0;
      p.set(x, y, vary(stripe ? [70, 54, 32] : [104, 80, 48], (p.r() - 0.5) * 0.15));
    }
  },
  log_top(p) {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      const c = d > 6.6 ? [92, 70, 42] : (Math.floor(d) % 2 ? [176, 142, 88] : [150, 118, 70]);
      p.set(x, y, vary(c, (p.r() - 0.5) * 0.1));
    }
  },
  leaves(p) {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const r = p.r();
      if (r < 0.14) p.set(x, y, [0, 0, 0], 0);
      else p.set(x, y, vary(r < 0.4 ? [44, 102, 32] : [62, 134, 44], (p.r() - 0.5) * 0.2));
    }
  },
  planks(p) {
    for (let y = 0; y < T; y++) {
      const row = y >> 2, seam = (row % 2 ? 4 : 11);
      for (let x = 0; x < T; x++) {
        let c = [164, 132, 80];
        if (y % 4 === 3) c = [110, 86, 50];
        else if (x === seam) c = [124, 98, 58];
        p.set(x, y, vary(c, (p.r() - 0.5) * 0.12));
      }
    }
  },
  sand(p) { p.fill([220, 208, 160], 0.07); p.speck([196, 182, 134], 22); },
  gravel(p) { voronoi(p, 14, (k) => vary(k % 3 ? [128, 122, 118] : [150, 130, 112], (p.r() - 0.5) * 0.3), [92, 88, 86]); },
  bedrock(p) { for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) p.set(x, y, vary([70, 70, 70], (p.r() - 0.5) * 0.9)); },
  water(p) {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const w = Math.sin((x + y * 0.5) * 0.8) > 0.85;
      p.set(x, y, vary(w ? [92, 140, 230] : [48, 92, 200], (p.r() - 0.5) * 0.08), 190);
    }
  },
  coal_ore(p) { ore(p, [34, 34, 36], [70, 70, 74], 4); },
  iron_ore(p) { ore(p, [206, 160, 128], [232, 200, 172], 4); },
  gold_ore(p) { ore(p, [242, 204, 46], [255, 246, 150], 4); },
  diamond_ore(p) { ore(p, [70, 222, 216], [200, 255, 250], 3); },
  brick(p) {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const row = y >> 2, off = row % 2 ? 4 : 0;
      const mortar = y % 4 === 3 || (x + off) % 8 === 7;
      p.set(x, y, mortar ? vary([170, 162, 150], (p.r() - 0.5) * 0.1) : vary([152, 74, 56], (p.r() - 0.5) * 0.2));
    }
  },
  glass(p) {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const edge = x === 0 || y === 0 || x === 15 || y === 15;
      if (edge) p.set(x, y, [206, 232, 240]);
      else p.set(x, y, [0, 0, 0], 0);
    }
    for (let i = 0; i < 4; i++) { p.set(3 + i, 6 - i, [235, 248, 255]); p.set(9 + i, 12 - i, [235, 248, 255]); }
  },
  hay_side(p) {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      let c = (x * 3 + y) % 5 === 0 ? [168, 128, 30] : [204, 170, 52];
      if (y === 4 || y === 11) c = [140, 70, 40];
      p.set(x, y, vary(c, (p.r() - 0.5) * 0.15));
    }
  },
  hay_top(p) {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      p.set(x, y, vary(Math.floor(d) % 3 === 0 ? [176, 136, 36] : [212, 178, 60], (p.r() - 0.5) * 0.15));
    }
  },
  cloth_red(p) { cloth(p, [176, 44, 44]); },
  cloth_blue(p) { cloth(p, [48, 72, 168]); },
  cloth_white(p) { cloth(p, [226, 226, 222]); },
  gold_block(p) {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      let c = [246, 206, 56];
      if (x === 0 || y === 0) c = [255, 244, 150];
      else if (x === 15 || y === 15) c = [190, 140, 30];
      p.set(x, y, vary(c, (p.r() - 0.5) * 0.06));
    }
    for (let i = 2; i < 6; i++) p.set(i, 7 - i, [255, 255, 220]);
  },
  board_side(p) {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      p.set(x, y, vary(y % 4 === 3 ? [52, 36, 22] : [80, 56, 34], (p.r() - 0.5) * 0.12));
    }
  },
  farmland_top(p) {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      p.set(x, y, vary(y % 4 === 0 ? [62, 40, 24] : [96, 64, 40], (p.r() - 0.5) * 0.16));
    }
  },
  wheat(p) {
    clear(p);
    for (let s = 0; s < 6; s++) {
      const x = 1 + s * 2 + ((p.r() * 2) | 0), top = 2 + ((p.r() * 4) | 0);
      for (let y = top; y < T; y++) p.set(x, y, y < top + 4 ? [214, 180, 64] : [120, 150, 50]);
      p.set(x - 1, top + 1, [196, 160, 52]); p.set(x + 1, top + 2, [196, 160, 52]);
    }
  },
  tallgrass(p) {
    clear(p);
    for (let s = 0; s < 7; s++) {
      let x = 1 + ((p.r() * 14) | 0); const top = 4 + ((p.r() * 7) | 0);
      for (let y = T - 1; y >= top; y--) {
        p.set(x, y, vary([100, 142, 72], (p.r() - 0.5) * 0.28));
        if (p.r() < 0.2) x += p.r() < 0.5 ? -1 : 1;
      }
    }
  },
  flower_red(p) { flower(p, [210, 40, 40], [250, 220, 60]); },
  flower_yellow(p) { flower(p, [244, 214, 40], [200, 110, 20]); },
  stone_brick(p) {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const row = y >> 3, off = row % 2 ? 4 : 0;
      const mortar = y % 8 === 7 || (x + off) % 8 === 7;
      p.set(x, y, mortar ? [82, 82, 84] : vary([140, 140, 142], (p.r() - 0.5) * 0.12));
    }
  },
  lantern(p) {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const frame = x < 2 || x > 13 || y < 2 || y > 13 || x === 7 || x === 8 || y === 7;
      const glow = 1 - Math.hypot(x - 7.5, y - 7.5) / 9;
      p.set(x, y, frame ? [52, 48, 46] : mix([230, 140, 40], [255, 236, 150], glow));
    }
  },
  roof(p) {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const row = y >> 2, off = row % 2 ? 2 : 0;
      const edge = y % 4 === 3 || (x + off) % 4 === 3;
      p.set(x, y, vary(edge ? [120, 58, 40] : [176, 88, 56], (p.r() - 0.5) * 0.12));
    }
  },
  lava(p) {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const w = Math.sin(x * 0.9 + Math.sin(y * 0.7) * 2) + Math.sin(y * 0.8 - x * 0.3);
      const c = w > 1.1 ? [255, 226, 90] : w > 0.2 ? [246, 128, 24] : [206, 70, 16];
      p.set(x, y, vary(c, (p.r() - 0.5) * 0.12));
    }
    for (let k = 0; k < 5; k++) { const x = (p.r() * 15) | 0, y = (p.r() * 15) | 0; p.set(x, y, [120, 34, 12]); p.set(x + 1, y, [150, 44, 14]); }
  },
};

function cloth(p, c) {
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) p.set(x, y, vary(c, ((x + y) % 2 ? 0.05 : -0.05) + (p.r() - 0.5) * 0.08));
}
function clear(p) { for (let i = 0; i < p.d.length; i++) p.d[i] = 0; }
function flower(p, petal, center) {
  clear(p);
  for (let y = 8; y < T; y++) p.set(7, y, [70, 140, 44]);
  p.set(6, 12, [70, 140, 44]); p.set(5, 11, [70, 140, 44]); p.set(8, 13, [70, 140, 44]); p.set(9, 12, [70, 140, 44]);
  for (const [dx, dy] of [[0, -2], [-2, 0], [2, 0], [0, 2], [-1, -1], [1, -1], [-1, 1], [1, 1]]) p.set(7 + dx, 5 + dy, petal);
  p.set(7, 5, center);
}

// ---------- atlas ----------
let atlasCanvas = null;
const tileCanvases = {};

export function buildAtlas() {
  atlasCanvas = document.createElement('canvas');
  atlasCanvas.width = atlasCanvas.height = ATLAS_PX;
  const ctx = atlasCanvas.getContext('2d');
  TILE_NAMES.forEach((name, i) => {
    const p = new Px(1000 + i * 7919);
    PAINTERS[name](p);
    const img = new ImageData(p.d, T, T);
    const c = document.createElement('canvas');
    c.width = c.height = T;
    c.getContext('2d').putImageData(img, 0, 0);
    tileCanvases[name] = c;
    ctx.putImageData(img, (i % COLS) * T, Math.floor(i / COLS) * T);
  });
  const tex = new THREE.CanvasTexture(atlasCanvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}

export function tileCanvas(name) { return tileCanvases[name]; }

// Average colour of a block's side texture (for break particles).
export function blockColor(id) {
  const b = BLOCKS[id];
  const c = tileCanvases[b?.faces?.side];
  if (!c) return [128, 128, 128];
  const d = c.getContext('2d').getImageData(0, 0, T, T).data;
  let r = 0, g = 0, bl = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0) { r += d[i]; g += d[i + 1]; bl += d[i + 2]; n++; }
  return n ? [r / n, g / n, bl / n] : [128, 128, 128];
}

// ---------- crack overlay stages ----------
// Ten stages of one fracture that grows over time. A handful of main cracks wander out from
// just off the centre to the edges, side branches split off them, and smaller twigs off those;
// every pixel records when the fracture reaches it, so each stage is the previous one plus more.
// The overlay is drawn with a x2 multiply blend: mid-grey (128) leaves the block as it is,
// dark crack pixels cut into it, and a lighter rim beside each crack makes it look chiselled.
export function buildCrackTextures() {
  const r = mulberry32(4242);
  const time = new Float32Array(T * T).fill(Infinity);
  const mark = (x, y, t) => {
    const i = y * T + x;
    if (t < time[i]) time[i] = t;
  };
  const queue = [];
  // a crack is a random walk with momentum: it keeps its heading but jitters, giving stair-step lines
  const grow = (x, y, ang, t, len, depth) => {
    let px = x + 0.5, py = y + 0.5, lx = x, ly = y;
    for (let n = 0; n < len; n++) {
      ang += (r() - 0.5) * 0.75;
      px += Math.cos(ang) * 0.85; py += Math.sin(ang) * 0.85;
      const ix = Math.floor(px), iy = Math.floor(py);
      if (ix < 0 || iy < 0 || ix >= T || iy >= T) return;
      if (ix === lx && iy === ly) continue;
      // keep lines 4-connected so they read as solid, chunky pixel cracks
      if (ix !== lx && iy !== ly) { const h = r() < 0.5; mark(h ? ix : lx, h ? ly : iy, t + 0.5); }
      t += 1 + r() * 0.5;
      mark(ix, iy, t);
      lx = ix; ly = iy;
      if (depth < 3 && n > 3 && r() < [0.17, 0.12, 0.06][depth]) {
        const side = r() < 0.5 ? 1 : -1;
        queue.push([ix, iy, ang + side * (0.6 + r() * 0.8), t + 2 + r() * 3, [6 + r() * 8, 4 + r() * 5, 2 + r() * 4][depth], depth + 1]);
      }
    }
  };
  const cx = 7, cy = 8;
  mark(cx, cy, 0);
  const mains = 6, base = r() * Math.PI * 2;
  for (let k = 0; k < mains; k++) grow(cx, cy, base + (k / mains) * Math.PI * 2 + (r() - 0.5) * 0.6, 0.5 * k, 22, 0);
  while (queue.length) grow(...queue.shift());

  // chip order for the late-stage shards: a fixed random value per pixel, so chips only ever accumulate
  const chip = Float32Array.from({ length: T * T }, () => r());
  const ts = [...time].filter((v) => v !== Infinity).sort((x, y) => x - y);
  const stages = [];
  for (let st = 0; st < 10; st++) {
    const frac = 0.035 + 0.965 * (st / 9) ** 1.3;
    const limit = ts[Math.min(ts.length - 1, Math.max(0, Math.floor(frac * ts.length) - 1))];
    const on = (x, y) => x >= 0 && y >= 0 && x < T && y < T && time[y * T + x] <= limit;
    const img = new ImageData(T, T);
    const put = (x, y, v) => { const i = (y * T + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; };
    const chipAmt = Math.max(0, st - 5) * 0.09;
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      if (on(x, y)) { put(x, y, 38 + ((x * 5 + y * 3) % 4) * 6); continue; }
      const near = on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1);
      // broken-away flakes next to the cracks in the last few stages
      if (near && chip[y * T + x] < chipAmt) put(x, y, 92);
      // lit rim on the lower-right side of a crack, a shadowed one on the upper-left
      else if (on(x - 1, y) || on(x, y - 1)) put(x, y, 158);
      else if (st >= 5 && (on(x + 1, y) || on(x, y + 1)) && chip[y * T + x] > 0.75) put(x, y, 108);
    }
    const c = document.createElement('canvas');
    c.width = c.height = T;
    c.getContext('2d').putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    stages.push(t);
  }
  return stages;
}

// ---------- inventory icons ----------
const iconCache = {}, canvasCache = {};

// Isometric block icon, drawn from the face textures with classic shading.
function blockIcon(id) {
  const b = BLOCKS[id];
  const S = 32;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  if (b.cross) {
    g.drawImage(tileCanvases[b.faces.side], 0, 0, S, S);
    return c;
  }
  const top = tileCanvases[b.faces.top], side = tileCanvases[b.faces.side];
  const k = S / 32;
  // top face
  g.setTransform(1 * k, 0.5 * k, -1 * k, 0.5 * k, 16 * k, 1 * k);
  g.drawImage(top, 0, 0, 16, 16);
  // left face
  g.setTransform(1 * k, 0.5 * k, 0, 1 * k, 0, 9 * k);
  g.drawImage(side, 0, 0, 16, 16);
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, 16, 16);
  // right face
  g.setTransform(1 * k, -0.5 * k, 0, 1 * k, 16 * k, 17 * k);
  g.drawImage(side, 0, 0, 16, 16);
  g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, 0, 16, 16);
  g.setTransform(1, 0, 0, 1, 0, 0);
  return c;
}

// Vector shape rasterised to hard pixels, then shaded (highlight top-left, outline, shadow).
function pixelShape(draw, base) {
  const c = document.createElement('canvas');
  c.width = c.height = T;
  const g = c.getContext('2d');
  g.fillStyle = g.strokeStyle = '#fff';
  draw(g);
  const d = g.getImageData(0, 0, T, T).data;
  const on = (x, y) => x >= 0 && y >= 0 && x < T && y < T && d[(y * T + x) * 4 + 3] > 110;
  const out = new ImageData(T, T);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    if (!on(x, y)) continue;
    let col = base(x, y);
    if (!on(x + 1, y) || !on(x, y + 1)) col = vary(col, -0.45);
    else if (!on(x - 1, y) || !on(x, y - 1)) col = vary(col, 0.3);
    const i = (y * T + x) * 4;
    out.data[i] = col[0]; out.data[i + 1] = col[1]; out.data[i + 2] = col[2]; out.data[i + 3] = 255;
  }
  const r = document.createElement('canvas');
  r.width = r.height = T;
  r.getContext('2d').putImageData(out, 0, 0);
  return r;
}

const HEAD = {
  [I.WOOD_PICK]: [150, 112, 62], [I.STONE_PICK]: [138, 138, 138],
  [I.IRON_PICK]: [226, 226, 226], [I.DIAMOND_PICK]: [80, 230, 220],
};

function pickIcon(id) {
  const handle = pixelShape((g) => {
    g.lineWidth = 2; g.beginPath(); g.moveTo(1.5, 14.5); g.lineTo(10, 6); g.stroke();
  }, () => [110, 78, 40]);
  const head = pixelShape((g) => {
    g.lineWidth = 2.4; g.lineCap = 'round'; g.beginPath(); g.moveTo(2.5, 4.5); g.quadraticCurveTo(15, 1, 11.5, 13.5); g.stroke();
  }, () => HEAD[id]);
  const c = document.createElement('canvas');
  c.width = c.height = T;
  const g = c.getContext('2d');
  g.drawImage(handle, 0, 0); g.drawImage(head, 0, 0);
  return c;
}

const BLADE = { [I.STONE_SWORD]: [150, 150, 150], [I.IRON_SWORD]: [232, 232, 236], [I.DIAMOND_SWORD]: [90, 236, 226] };

function swordIcon(id) {
  const blade = pixelShape((g) => {
    g.lineWidth = 2.6; g.beginPath(); g.moveTo(5.5, 10.5); g.lineTo(14, 2); g.stroke();
  }, (x, y) => (x - y > 9 ? vary(BLADE[id], 0.25) : BLADE[id]));
  const guard = pixelShape((g) => {
    g.lineWidth = 2; g.beginPath(); g.moveTo(2.5, 8.5); g.lineTo(7.5, 13.5); g.stroke();
  }, () => [92, 64, 36]);
  const grip = pixelShape((g) => {
    g.lineWidth = 2; g.beginPath(); g.moveTo(1.5, 14.5); g.lineTo(5, 11); g.stroke();
  }, () => [120, 84, 44]);
  const c = document.createElement('canvas');
  c.width = c.height = T;
  const g = c.getContext('2d');
  g.drawImage(blade, 0, 0); g.drawImage(grip, 0, 0); g.drawImage(guard, 0, 0);
  return c;
}

function armorIcon() {
  return pixelShape((g) => {
    g.beginPath();
    g.moveTo(1, 3); g.lineTo(5, 1.5); g.lineTo(6.5, 4); g.lineTo(9.5, 4); g.lineTo(11, 1.5); g.lineTo(15, 3);
    g.lineTo(14, 7.5); g.lineTo(12.5, 7.5); g.lineTo(12.5, 14.5); g.lineTo(3.5, 14.5); g.lineTo(3.5, 7.5); g.lineTo(2, 7.5);
    g.closePath(); g.fill();
  }, (x, y) => (y === 8 ? [150, 150, 160] : x < 6 ? [236, 236, 240] : [204, 204, 212]));
}

// Golden Parachute: a pair of gold silk wings on a dark frame
function wingsIcon() {
  return pixelShape((g) => {
    for (const sd of [-1, 1]) {
      g.beginPath();
      g.moveTo(8 + sd * 0.5, 3); g.lineTo(8 + sd * 7.5, 1.5); g.lineTo(8 + sd * 7, 8); g.lineTo(8 + sd * 5, 14.5); g.lineTo(8 + sd * 1.5, 11);
      g.closePath(); g.fill();
    }
  }, (x, y) => (y <= 2 || x === 2 || x === 13 ? [110, 76, 22] : (x + y * 2) % 7 === 0 ? [255, 236, 150] : x < 8 ? [240, 196, 70] : [218, 172, 52]));
}

function lumpIcon(col, seed) {
  const r = mulberry32(seed);
  return pixelShape((g) => {
    g.beginPath();
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 5) {
      const rad = 4.5 + r() * 2;
      g.lineTo(8 + Math.cos(a) * rad, 8.5 + Math.sin(a) * rad);
    }
    g.fill();
  }, (x, y) => vary(col, (r() - 0.5) * 0.3 + ((x + y) % 5 === 0 ? 0.25 : 0)));
}

function diamondIcon() {
  return pixelShape((g) => {
    g.beginPath(); g.moveTo(4, 2.5); g.lineTo(12, 2.5); g.lineTo(15, 6); g.lineTo(8, 14.5); g.lineTo(1, 6); g.closePath(); g.fill();
  }, (x, y) => (y < 6 ? [170, 255, 248] : (x + y) % 4 === 0 ? [210, 255, 255] : [60, 220, 210]));
}

function ledgerIcon() {
  const c = document.createElement('canvas');
  c.width = c.height = T;
  const g = c.getContext('2d');
  g.fillStyle = '#244f2a'; g.fillRect(2, 1, 12, 14);
  g.fillStyle = '#2f7a3a'; g.fillRect(4, 1, 10, 13);
  g.fillStyle = '#f0ead8'; g.fillRect(4, 14, 10, 1);
  g.fillStyle = '#16301a'; g.fillRect(2, 15, 12, 1); g.fillRect(3, 1, 1, 14);
  g.fillStyle = '#f2cf3a';
  // tiny "$"
  [[9, 3], [8, 4], [9, 4], [10, 4], [7, 5], [8, 6], [9, 7], [10, 8], [11, 9], [10, 10], [7, 10], [8, 10], [9, 10], [9, 11], [9, 5], [9, 6], [9, 8], [9, 9]].forEach(([x, y]) => g.fillRect(x, y, 1, 1));
  g.fillStyle = '#c99a1c'; g.fillRect(4, 1, 10, 1);
  return c;
}

export function itemIcon(id) {
  if (iconCache[id]) return iconCache[id];
  let c;
  if (id < 100) c = blockIcon(id);
  else if (HEAD[id]) c = pickIcon(id);
  else if (BLADE[id]) c = swordIcon(id);
  else if (id === I.IRON_ARMOR) c = armorIcon();
  else if (id === I.WINGS) c = wingsIcon();
  else if (id === I.COAL) c = lumpIcon([44, 44, 48], 11);
  else if (id === I.RAW_IRON) c = lumpIcon([206, 158, 124], 12);
  else if (id === I.RAW_GOLD) c = lumpIcon([240, 200, 50], 13);
  else if (id === I.DIAMOND) c = diamondIcon();
  else if (id === I.LEDGER) c = ledgerIcon();
  canvasCache[id] = c;
  iconCache[id] = c.toDataURL();
  return iconCache[id];
}

// The icon's canvas (for building 3D item models).
export function itemCanvas(id) { itemIcon(id); return canvasCache[id]; }
