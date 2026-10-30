// 3D models for items: blocks become small textured cubes, everything else is its
// 16x16 icon extruded into a one-pixel-thick slab of voxels.
import * as THREE from 'three';
import { BLOCKS, isBlockItem } from './blocks.js';
import { tileUV, tileCanvas, itemCanvas } from './textures.js';

let atlas = null, blockMat = null, voxelMat = null;
const geoCache = {};

export function initItemModels(atlasTex) {
  atlas = atlasTex;
  blockMat = new THREE.MeshLambertMaterial({ map: atlas, alphaTest: 0.5 });
  voxelMat = new THREE.MeshLambertMaterial({ vertexColors: true });
}

export function isCubeItem(id) { return isBlockItem(id) && !BLOCKS[id].cross; }

// Unit cube (centred on the origin) with each face mapped to the block's atlas tile.
function cubeGeometry(id) {
  const b = BLOCKS[id];
  const g = new THREE.BoxGeometry(1, 1, 1);
  const uv = g.attributes.uv;
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z (4 vertices each)
  const keys = ['side', 'side', 'top', 'bottom', 'side', 'side'];
  for (let f = 0; f < 6; f++) {
    const [u0, v0, u1, v1] = tileUV(b.faces[keys[f]]);
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) ? u1 : u0, uv.getY(i) ? v1 : v0);
    }
  }
  return g;
}

// Extrude the opaque pixels of a canvas into voxels; only faces next to empty pixels are kept.
function extrudeGeometry(canvas) {
  const W = canvas.width, Hh = canvas.height;
  const d = canvas.getContext('2d').getImageData(0, 0, W, Hh).data;
  const on = (x, y) => x >= 0 && y >= 0 && x < W && y < Hh && d[(y * W + x) * 4 + 3] > 100;
  const pos = [], nor = [], col = [];
  const s = 1 / W, t = 1 / 16; // pixel size, slab thickness
  const quad = (a, b, c, e, n, rgb, shade) => {
    for (const v of [a, b, c, a, c, e]) { pos.push(...v); nor.push(...n); col.push(rgb[0] * shade, rgb[1] * shade, rgb[2] * shade); }
  };
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    if (!on(x, y)) continue;
    const i = (y * W + x) * 4;
    const rgb = [d[i] / 255, d[i + 1] / 255, d[i + 2] / 255];
    const x0 = x * s - 0.5, x1 = x0 + s, y1 = 0.5 - y * s, y0 = y1 - s, z0 = -t / 2, z1 = t / 2;
    quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], rgb, 1);
    quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], rgb, 0.8);
    if (!on(x - 1, y)) quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], rgb, 0.7);
    if (!on(x + 1, y)) quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], rgb, 0.7);
    if (!on(x, y - 1)) quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], rgb, 0.9);
    if (!on(x, y + 1)) quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], rgb, 0.6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

// A fresh mesh for item `id`, about one unit across. Geometry and materials are shared.
export function makeItemMesh(id) {
  const cube = isCubeItem(id);
  if (!geoCache[id]) {
    if (cube) geoCache[id] = cubeGeometry(id);
    else {
      const b = isBlockItem(id) ? BLOCKS[id] : null;
      geoCache[id] = extrudeGeometry(b ? tileCanvas(b.faces.side) : itemCanvas(id));
    }
  }
  const m = new THREE.Mesh(geoCache[id], cube ? blockMat : voxelMat);
  m.userData.cube = cube;
  return m;
}
