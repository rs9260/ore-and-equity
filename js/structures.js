// Builds the Trading Post and the three villages into the world. Returns NPC spawn info.
import { B, BLOCKS } from './blocks.js';
import { SITES } from './world.js';
import { mulberry32 } from './noise.js';

function fill(w, x0, y0, z0, x1, y1, z1, id) {
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
    for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++)
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) w.put(x, y, z, id);
}

// Clear plants/leaves/trees over the area and level it to a solid floor.
function clearArea(w, cx, cz, r, y, floor, maxZ = Infinity) {
  for (let z = cz - r; z <= Math.min(cz + r, maxZ); z++) for (let x = cx - r; x <= cx + r; x++) {
    if (Math.hypot(x - cx, z - cz) > r + 0.5) continue;
    for (let yy = y + 1; yy < y + 16; yy++) w.put(x, yy, z, B.AIR);
    if (floor) w.put(x, y, z, floor);
    for (let yy = y - 1; yy > y - 4; yy--) if (!BLOCKS[w.get(x, yy, z)].solid) w.put(x, yy, z, B.DIRT);
  }
}

function house(w, { x, z, y, wd, d, h = 4, wall, corner, roof, floor = B.PLANKS, door = 's' }) {
  const x0 = x, x1 = x + wd - 1, z0 = z, z1 = z + d - 1;
  fill(w, x0, y, z0, x1, y, z1, floor);
  for (let yy = y + 1; yy <= y + h; yy++) for (let zz = z0; zz <= z1; zz++) for (let xx = x0; xx <= x1; xx++) {
    const edgeX = xx === x0 || xx === x1, edgeZ = zz === z0 || zz === z1;
    if (edgeX && edgeZ) w.put(xx, yy, zz, corner);
    else if (edgeX || edgeZ) {
      const win = yy === y + 2 && ((edgeX && (zz - z0) % 2 === 1) || (edgeZ && (xx - x0) % 2 === 1));
      w.put(xx, yy, zz, win ? B.GLASS : wall);
    } else w.put(xx, yy, zz, B.AIR);
  }
  // door
  const mx = Math.floor((x0 + x1) / 2), mz = Math.floor((z0 + z1) / 2);
  const dpos = { s: [mx, z1], n: [mx, z0], e: [x1, mz], w: [x0, mz] }[door];
  w.put(dpos[0], y + 1, dpos[1], B.AIR); w.put(dpos[0], y + 2, dpos[1], B.AIR);
  // stepped roof
  for (let k = 0; ; k++) {
    const a0 = x0 - 1 + k, a1 = x1 + 1 - k, b0 = z0 - 1 + k, b1 = z1 + 1 - k;
    if (a0 > a1 || b0 > b1) break;
    fill(w, a0, y + h + 1 + k, b0, a1, y + h + 1 + k, b1, roof);
  }
  w.put(mx, y + h, mz, B.LANTERN);
  return { door: dpos };
}

function lanternPost(w, x, y, z) {
  fill(w, x, y + 1, z, x, y + 3, z, B.LOG);
  w.put(x, y + 4, z, B.LANTERN);
}

function banner(w, x, y, z, cloth) {
  fill(w, x, y + 1, z, x, y + 6, z, B.LOG);
  fill(w, x + 1, y + 4, z, x + 1, y + 6, z, cloth);
  fill(w, x + 2, y + 4, z, x + 2, y + 6, z, cloth);
}

export function buildStructures(w) {
  const npcs = [];
  const r = mulberry32(w.seed + 77);

  // ---------- Trading Post ----------
  {
    const s = SITES.post, cx = s.x, cz = s.z, y = s.y;
    clearArea(w, cx, cz, 11, y, B.GRASS);
    clearArea(w, cx, cz, 8, y, B.STONE_BRICK);
    // market board wall facing +z
    fill(w, cx - 2, y + 1, cz - 5, cx + 2, y + 3, cz - 5, B.MARKET_BOARD);
    fill(w, cx - 3, y + 1, cz - 5, cx - 3, y + 4, cz - 5, B.LOG);
    fill(w, cx + 3, y + 1, cz - 5, cx + 3, y + 4, cz - 5, B.LOG);
    fill(w, cx - 3, y + 4, cz - 5, cx + 3, y + 4, cz - 5, B.PLANKS);
    w.put(cx - 3, y + 5, cz - 5, B.LANTERN); w.put(cx + 3, y + 5, cz - 5, B.LANTERN);
    s.board = { x: cx - 2, y: y + 1, z: cz - 5, w: 5, h: 3 };
    // merchant stall (east side)
    const sx = cx + 5;
    for (const [px, pz] of [[sx, cz - 2], [sx + 4, cz - 2], [sx, cz + 2], [sx + 4, cz + 2]]) fill(w, px, y + 1, pz, px, y + 3, pz, B.LOG);
    for (let z = cz - 3; z <= cz + 3; z++) for (let x = sx - 1; x <= sx + 5; x++) w.put(x, y + 4, z, (x + z) % 2 ? B.CLOTH_RED : B.CLOTH_WHITE);
    fill(w, sx, y + 1, cz - 1, sx, y + 1, cz + 1, B.PLANKS);
    w.put(sx + 3, y + 1, cz - 1, B.HAY);
    w.put(sx + 3, y + 1, cz + 1, B.HAY);
    npcs.push({ role: 'merchant', village: 'post', x: sx + 2.5, y: y + 1, z: cz + 0.5, yaw: -Math.PI / 2 });
    // tool shed (west)
    house(w, { x: cx - 9, z: cz - 3, y, wd: 5, d: 6, h: 3, wall: B.PLANKS, corner: B.LOG, roof: B.ROOF, door: 'e' });
    lanternPost(w, cx - 6, y, cz + 6); lanternPost(w, cx + 6, y, cz + 6);
    s.spawn = { x: cx + 0.5, y: y + 1, z: cz + 4.5 };
  }

  // ---------- Mining Town ----------
  {
    const s = SITES.mining, cx = s.x, cz = s.z, y = s.y;
    clearArea(w, cx, cz, 14, y, B.GRASS);
    clearArea(w, cx, cz, 4, y, B.GRAVEL);
    banner(w, cx, y, cz, B.CLOTH_RED);
    const bank = house(w, { x: cx - 11, z: cz - 10, y, wd: 7, d: 6, wall: B.COBBLE, corner: B.STONE_BRICK, roof: B.ROOF, floor: B.STONE_BRICK, door: 's' });
    house(w, { x: cx + 3, z: cz - 11, y, wd: 6, d: 6, wall: B.COBBLE, corner: B.LOG, roof: B.ROOF, door: 's' });
    house(w, { x: cx - 12, z: cz + 3, y, wd: 6, d: 7, wall: B.COBBLE, corner: B.LOG, roof: B.ROOF, door: 'e' });
    npcs.push({ role: 'banker', village: 'mining', x: bank.door[0] + 0.5, y: y + 1, z: bank.door[1] + 1.5, yaw: 0 });
    // spiral mine shaft
    const mx = cx + 6, mz = cz + 6;
    const ring = [];
    for (let i = -3; i < 3; i++) ring.push([i, -3]);
    for (let i = -3; i < 3; i++) ring.push([3, i]);
    for (let i = 3; i > -3; i--) ring.push([i, 3]);
    for (let i = 3; i > -3; i--) ring.push([-3, i]);
    fill(w, mx - 4, y, mz - 4, mx + 4, y, mz + 4, B.STONE_BRICK);
    fill(w, mx - 2, y, mz - 2, mx + 2, y, mz + 2, B.STONE_BRICK);
    let step = 0, fy = y;
    while (fy > 9) { // stay above the lava level
      const [ox, oz] = ring[step % ring.length];
      const x = mx + ox, z = mz + oz;
      fill(w, x, fy + 1, z, x, fy + 3, z, B.AIR);
      if (!BLOCKS[w.get(x, fy, z)].solid) w.put(x, fy, z, B.COBBLE);
      if (step % 5 === 2) {
        const lx = x + Math.sign(ox) * (Math.abs(ox) === 3 ? 1 : 0), lz = z + Math.sign(oz) * (Math.abs(oz) === 3 ? 1 : 0);
        if (lx !== x || lz !== z) w.put(lx, fy + 2, lz, B.LANTERN);
      }
      step++; fy--;
    }
    // bottom galleries with rich walls
    const [bx, bz] = ring[(step - 1) % ring.length];
    const gx = mx + bx, gz = mz + bz, gy = fy + 1;
    const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    for (const [dx, dz] of dirs) {
      const len = 14 + (r() * 8 | 0);
      for (let i = 1; i <= len; i++) {
        const x = gx + dx * i, z = gz + dz * i;
        fill(w, x, gy, z, x, gy + 1, z, B.AIR);
        if (!BLOCKS[w.get(x, gy - 1, z)].solid) w.put(x, gy - 1, z, B.COBBLE);
        if (i % 7 === 0) w.put(x + dz, gy + 1, z + dx, B.LANTERN);
        for (const [ax, ay, az] of [[dz, 0, dx], [-dz, 0, -dx], [dz, 1, dx], [-dz, 1, -dx], [0, 2, 0]]) {
          const px = x + ax, py = gy + ay, pz = z + az;
          if (w.get(px, py, pz) !== B.STONE) continue;
          const q = r();
          if (q < 0.03) w.put(px, py, pz, B.DIAMOND_ORE);
          else if (q < 0.09) w.put(px, py, pz, B.GOLD_ORE);
          else if (q < 0.2) w.put(px, py, pz, B.IRON_ORE);
          else if (q < 0.3) w.put(px, py, pz, B.COAL_ORE);
        }
      }
    }
    lanternPost(w, mx - 5, y, mz - 5);
    npcs.push({ role: 'quartermaster', village: 'mining', x: mx - 5.5, y: y + 1, z: mz - 1.5, yaw: Math.PI / 2 });
    s.mine = { x: mx, z: mz };
  }

  // ---------- Farm Village ----------
  {
    const s = SITES.farm, cx = s.x, cz = s.z, y = s.y;
    clearArea(w, cx, cz, 15, y, B.GRASS);
    banner(w, cx, y, cz, B.CLOTH_WHITE);
    const bank = house(w, { x: cx - 4, z: cz - 12, y, wd: 7, d: 6, wall: B.PLANKS, corner: B.LOG, roof: B.ROOF, door: 's' });
    house(w, { x: cx - 13, z: cz - 6, y, wd: 6, d: 6, wall: B.PLANKS, corner: B.LOG, roof: B.HAY, door: 'e' });
    house(w, { x: cx + 7, z: cz - 9, y, wd: 6, d: 6, wall: B.PLANKS, corner: B.LOG, roof: B.HAY, door: 'w' });
    npcs.push({ role: 'banker', village: 'farm', x: bank.door[0] + 0.5, y: y + 1, z: bank.door[1] + 1.5, yaw: 0 });
    // fields with irrigation
    for (const [fx, fz] of [[cx - 12, cz + 3], [cx + 2, cz + 3]]) {
      for (let z = fz; z < fz + 9; z++) for (let x = fx; x < fx + 9; x++) {
        if (z === fz + 4) { w.put(x, y, z, B.WATER); continue; }
        w.put(x, y, z, B.FARMLAND);
        w.put(x, y + 1, z, B.WHEAT);
      }
    }
    fill(w, cx + 9, y + 1, cz - 1, cx + 11, y + 1, cz, B.HAY);
    w.put(cx + 10, y + 2, cz - 1, B.HAY);
    lanternPost(w, cx - 2, y, cz + 1);
    npcs.push({ role: 'quartermaster', village: 'farm', x: cx + 0.5, y: y + 1, z: cz + 1.5, yaw: Math.PI });
  }

  // ---------- Trade Port ----------
  {
    const s = SITES.port, cx = s.x, cz = s.z, y = s.y;
    clearArea(w, cx, cz, 14, y, B.GRASS, cz + 6);
    clearArea(w, cx, cz, 6, y, B.STONE_BRICK);
    banner(w, cx, y, cz, B.CLOTH_BLUE);
    // grand bank
    const bank = house(w, { x: cx - 5, z: cz - 13, y, wd: 9, d: 7, h: 5, wall: B.STONE_BRICK, corner: B.GOLD_BLOCK, roof: B.ROOF, floor: B.STONE_BRICK, door: 's' });
    house(w, { x: cx + 6, z: cz - 9, y, wd: 6, d: 6, wall: B.BRICK, corner: B.STONE_BRICK, roof: B.ROOF, door: 'w' });
    house(w, { x: cx - 13, z: cz - 7, y, wd: 6, d: 6, wall: B.BRICK, corner: B.STONE_BRICK, roof: B.ROOF, door: 'e' });
    npcs.push({ role: 'banker', village: 'port', x: bank.door[0] + 0.5, y: y + 1, z: bank.door[1] + 1.5, yaw: 0 });
    // awnings
    for (let x = cx + 6; x <= cx + 11; x++) w.put(x, y + 3, cz - 2, B.CLOTH_BLUE);
    // dock out over the water
    const dz0 = cz + 6;
    for (let z = dz0; z < dz0 + 18; z++) for (let x = cx - 1; x <= cx + 1; x++) {
      w.put(x, y, z, B.PLANKS);
      for (let yy = y + 1; yy < y + 6; yy++) w.put(x, yy, z, B.AIR);
      if ((x === cx - 1 || x === cx + 1) && (z - dz0) % 5 === 0) for (let yy = y - 1; yy > 2 && !BLOCKS[w.get(x, yy, z)].solid; yy--) w.put(x, yy, z, B.LOG);
    }
    lanternPost(w, cx - 2, y, dz0 + 17); lanternPost(w, cx + 2, y, dz0 + 17);
    lanternPost(w, cx - 5, y, cz + 4); lanternPost(w, cx + 5, y, cz + 4);
    npcs.push({ role: 'quartermaster', village: 'port', x: cx + 0.5, y: y + 1, z: dz0 + 2.5, yaw: Math.PI });
  }

  return npcs;
}
