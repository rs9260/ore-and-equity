// Items lying in the world: they fall, bob and spin, merge with neighbours, and fly to the player.
import * as THREE from 'three';
import { B, SOLID } from './blocks.js';
import { makeItemMesh } from './items3d.js';

const LIFE = 300; // seconds before an item on the ground disappears
const MAX = 260;

export class Drops {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.mergeT = 0;
  }

  clear() { for (const d of this.list) this.scene.remove(d.root); this.list = []; }

  spawn(id, count, x, y, z, vel = null, { delay = 0.4, death = false } = {}) {
    if (!id || count <= 0) return null;
    if (this.list.length >= MAX) this.remove(this.list[0]);
    const root = new THREE.Group();
    const mesh = makeItemMesh(id);
    mesh.scale.setScalar(mesh.userData.cube ? 0.26 : 0.42);
    root.add(mesh);
    root.position.set(x, y, z);
    this.scene.add(root);
    const d = {
      id, count, root, mesh, pos: new THREE.Vector3(x, y, z),
      vel: vel ? vel.clone() : new THREE.Vector3((Math.random() - 0.5) * 2.4, 3 + Math.random() * 1.5, (Math.random() - 0.5) * 2.4),
      age: 0, delay, death, spin: Math.random() * 6.28,
    };
    this.list.push(d);
    return d;
  }

  remove(d) { this.scene.remove(d.root); this.list.splice(this.list.indexOf(d), 1); }

  // Death drops still lying around (for the compass).
  deathPile() {
    const ds = this.list.filter((d) => d.death);
    if (!ds.length) return null;
    return { x: ds[0].pos.x, z: ds[0].pos.z, n: ds.length };
  }

  update(dt, world, player, inv, hooks) {
    if (dt <= 0) return;
    const solidAt = (x, y, z) => SOLID[world.get(Math.floor(x), Math.floor(y), Math.floor(z))] === 1;
    const center = new THREE.Vector3(player.pos.x, player.pos.y + 0.8, player.pos.z);
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i];
      d.age += dt; d.delay -= dt;
      if (d.age > LIFE) { this.remove(d); continue; }
      const p = d.pos, v = d.vel;
      const here = world.get(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
      if (here === B.LAVA) { hooks.burned?.(d); this.remove(d); continue; }
      const toP = center.clone().sub(p);
      const dist = toP.length();
      if (d.delay <= 0 && dist < 1.9) {
        // pulled in by the player
        if (dist < 0.75) {
          const left = inv.add(d.id, d.count);
          const got = d.count - left;
          if (got > 0) hooks.picked?.(d.id, got);
          if (left <= 0) { this.remove(d); continue; }
          d.count = left; d.delay = 1;
        } else {
          v.copy(toP.normalize().multiplyScalar(9));
          p.addScaledVector(v, dt);
          this.place(d);
          continue;
        }
      }
      // physics
      if (here === B.WATER) { v.y += (1.2 - v.y) * Math.min(1, dt * 3); v.x *= 0.96; v.z *= 0.96; }
      else v.y -= 20 * dt;
      if (solidAt(p.x, p.y, p.z)) { p.y = Math.floor(p.y) + 1.001; v.y = Math.max(0, v.y); } // buried: pop up
      const ny = p.y + v.y * dt;
      if (v.y < 0 && solidAt(p.x, ny - 0.001, p.z)) {
        p.y = Math.floor(ny) + 1;
        v.y = 0; v.x *= Math.pow(0.02, dt); v.z *= Math.pow(0.02, dt);
      } else p.y = ny;
      for (const ax of ['x', 'z']) {
        const old = p[ax];
        p[ax] += v[ax] * dt;
        if (solidAt(p.x, p.y + 0.1, p.z)) { p[ax] = old; v[ax] *= -0.3; }
      }
      if (p.y < -4) { this.remove(d); continue; }
      this.place(d);
    }
    // merge stacks lying close together
    this.mergeT -= dt;
    if (this.mergeT <= 0) {
      this.mergeT = 0.5;
      for (let a = 0; a < this.list.length; a++) for (let b = this.list.length - 1; b > a; b--) {
        const A = this.list[a], Bd = this.list[b];
        if (A.id === Bd.id && A.death === Bd.death && A.pos.distanceToSquared(Bd.pos) < 1.2) { A.count += Bd.count; A.age = Math.min(A.age, Bd.age); this.remove(Bd); }
      }
    }
  }

  place(d) {
    d.spin += 0.03;
    d.root.position.set(d.pos.x, d.pos.y + 0.18 + Math.sin(d.age * 2.6) * 0.06, d.pos.z);
    d.root.rotation.y = d.spin + d.age * 1.4;
    // a second copy hints that the pile holds more than one
    if (d.count > 1 && !d.extra) { d.extra = d.mesh.clone(); d.extra.position.set(0.08, 0.06, 0.06); d.root.add(d.extra); }
    else if (d.count <= 1 && d.extra) { d.root.remove(d.extra); d.extra = null; }
  }
}
