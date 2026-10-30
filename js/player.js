// First-person player: input, physics, collisions.
import * as THREE from 'three';
import { B, BLOCKS, SOLID } from './blocks.js';
import { WX, WZ, H } from './world.js';

const HW = 0.3, HEIGHT = 1.8, EYE = 1.62, SNEAK_HEIGHT = 1.5, SNEAK_EYE = 1.3;
const GRAVITY = 28, JUMP = 8.6, WALK = 4.4, SPRINT = 6.0, SNEAK = 1.4;
const GLIDE_COOLDOWN = 3; // seconds after landing before the wings can open again
const LOOK_RATE = 0.00138;

export class Player {
  constructor(world, camera) {
    this.world = world;
    this.camera = camera;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.onGround = false;
    this.inWater = false; this.headInWater = false;
    this.keys = {};
    this.eyeOffset = 0; // smooths auto step-up
    this.fallStart = null;
    this.stepDist = 0;
    this.onStep = null; // (blockIdUnderFeet) => void
    this.onLand = null; // (fallDistance) => void
    this.bob = 0;
    this.h = HEIGHT; this.eyeH = EYE;
    this.sneaking = false;
    this.hasWings = false; this.gliding = false; this.glideCd = 0; this.glideSpeed = 0;
    this.onCrash = null; // (damage) => void, flying into a wall
  }

  spawn(x, y, z) { this.pos.set(x, y, z); this.vel.set(0, 0, 0); this.fallStart = null; }

  // sens is a multiplier on the base turn rate (radians per mouse pixel)
  look(dx, dy, sens = 1) {
    this.yaw -= dx * LOOK_RATE * sens;
    this.pitch -= dy * LOOK_RATE * sens;
    this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
  }

  forward() { return new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)); }
  eye() { return new THREE.Vector3(this.pos.x, this.pos.y + this.eyeH - this.eyeOffset, this.pos.z); }

  collides(p, h = this.h) {
    const x0 = Math.floor(p.x - HW), x1 = Math.floor(p.x + HW);
    const y0 = Math.floor(p.y), y1 = Math.floor(p.y + h);
    const z0 = Math.floor(p.z - HW), z1 = Math.floor(p.z + HW);
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      if (x < 0 || z < 0 || x >= WX || z >= WZ) return true; // world border
      if (SOLID[this.world.get(x, y, z)]) return true;
    }
    return false;
  }

  // Does the box at the given feet position overlap a block's cell?
  overlapsBlock(bx, by, bz) {
    const p = this.pos;
    return bx + 1 > p.x - HW && bx < p.x + HW && by + 1 > p.y && by < p.y + this.h && bz + 1 > p.z - HW && bz < p.z + HW;
  }

  moveAxis(axis, amt) {
    const p = this.pos;
    p[axis] += amt;
    if (!this.collides(p)) return false;
    const eps = 0.001;
    if (axis === 'y') {
      p.y = amt > 0 ? Math.floor(p.y + this.h) - this.h - eps : Math.floor(p.y) + 1 + eps;
    } else {
      p[axis] = amt > 0 ? Math.floor(p[axis] + HW) - HW - eps : Math.floor(p[axis] - HW) + 1 + HW + eps;
    }
    if (this.collides(p)) p[axis] -= amt; // fallback: undo
    return true;
  }

  // Space in mid-air with the Golden Parachute opens the wings.
  tryGlide() {
    if (!this.hasWings || this.gliding || this.onGround || this.inWater || this.glideCd > 0) return false;
    this.gliding = true;
    this.sneaking = false;
    this.glideSpeed = Math.max(7, Math.hypot(this.vel.x, this.vel.z));
    this.fallStart = null;
    return true;
  }
  endGlide(cooldown = GLIDE_COOLDOWN) {
    if (!this.gliding) return;
    this.gliding = false;
    this.glideCd = cooldown; // short after a crash so you can catch yourself
  }

  update(dt, active) {
    const k = this.keys;
    const w = this.world;
    // crouch: lower, slower, and you can't walk off ledges; stays down under a low ceiling
    if (active && (k.ShiftLeft || k.ShiftRight) && !this.gliding) this.sneaking = true;
    else if (this.sneaking && !this.collides(this.pos, HEIGHT)) this.sneaking = false;
    this.h = this.sneaking ? SNEAK_HEIGHT : HEIGHT;
    this.eyeH += ((this.sneaking ? SNEAK_EYE : EYE) - this.eyeH) * Math.min(1, dt * 14);
    this.glideCd = Math.max(0, this.glideCd - dt);
    const feetId = w.get(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.2), Math.floor(this.pos.z));
    const headId = w.get(Math.floor(this.pos.x), Math.floor(this.pos.y + this.eyeH), Math.floor(this.pos.z));
    this.inLava = feetId === B.LAVA || headId === B.LAVA;
    this.inWater = feetId === B.WATER || headId === B.WATER || this.inLava;
    this.headInWater = headId === B.WATER;
    this.headInLava = headId === B.LAVA;

    let fx = 0, fz = 0;
    if (active) {
      if (k.KeyW) fz -= 1; if (k.KeyS) fz += 1;
      if (k.KeyA) fx -= 1; if (k.KeyD) fx += 1;
    }
    const len = Math.hypot(fx, fz) || 1;
    fx /= len; fz /= len;
    // Ctrl starts a sprint that lasts as long as you keep moving forward
    if (active && fz < 0 && (k.ControlLeft || k.ControlRight)) this.sprinting = true;
    if (!active || fz >= 0 || this.inWater || this.sneaking) this.sprinting = false;
    const sprint = this.sprinting;
    let speed = sprint ? SPRINT : this.sneaking ? SNEAK : WALK;
    if (this.inWater) speed *= this.inLava ? 0.3 : 0.55;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const wx = (fx * cos + fz * sin) * speed, wz = (-fx * sin + fz * cos) * speed;
    const accel = this.onGround ? 14 : this.inWater ? 6 : 4;
    if (this.gliding && (this.inWater || !this.hasWings)) this.endGlide();
    if (this.gliding) {
      // gliding: dive to pick up speed, pull up to trade it for height; always sinking a little
      const f = this.forward();
      this.glideSpeed += (-Math.sin(this.pitch) * 16 - 0.5) * dt;
      this.glideSpeed = Math.max(3.5, Math.min(28, this.glideSpeed));
      const target = f.multiplyScalar(this.glideSpeed);
      target.y -= 1.3 + Math.max(0, 8 - this.glideSpeed) * 0.5; // slower means sinking faster
      this.vel.lerp(target, Math.min(1, dt * 2.5));
      this.fallStart = null;
    } else {
      this.vel.x += (wx - this.vel.x) * Math.min(1, accel * dt);
      this.vel.z += (wz - this.vel.z) * Math.min(1, accel * dt);
    }

    if (this.gliding) {
      // handled above
    } else if (this.inWater) {
      this.vel.y -= GRAVITY * 0.25 * dt;
      this.vel.y = Math.max(this.vel.y, -3);
      if (active && k.Space) this.vel.y = Math.min(this.vel.y + (this.inLava ? 12 : 18) * dt, this.inLava ? 2 : 3.2);
      this.fallStart = null;
    } else {
      this.vel.y -= GRAVITY * dt;
      this.vel.y = Math.max(this.vel.y, -40);
      if (active && k.Space && this.onGround) { this.vel.y = JUMP; this.onGround = false; }
    }

    // integrate with substeps
    const steps = Math.ceil(Math.max(Math.abs(this.vel.x), Math.abs(this.vel.y), Math.abs(this.vel.z)) * dt / 0.35) || 1;
    const sdt = dt / steps;
    let landed = false, hitWall = false;
    for (let s = 0; s < steps; s++) {
      const wasGround = this.onGround;
      if (this.moveAxis('y', this.vel.y * sdt)) {
        if (this.vel.y < 0) landed = true;
        this.vel.y = 0;
      }
      for (const ax of ['x', 'z']) {
        const amt = this.vel[ax] * sdt;
        if (!amt) continue;
        const before = this.pos[ax];
        // crouching: refuse a step that would leave nothing under your feet
        if (this.sneaking && this.onGround) {
          const t = this.pos.clone(); t[ax] += amt; t.y -= 0.6;
          if (!this.collides(t, 0.5)) { this.vel[ax] = 0; continue; }
        }
        const fast = this.gliding ? Math.hypot(this.vel.x, this.vel.z) : 0;
        if (this.moveAxis(ax, amt)) {
          if (this.gliding && fast > 11) { this.onCrash?.(Math.round((fast - 9) * 0.6)); this.endGlide(0.5); }
          // auto step-up onto 1-block ledges
          if (wasGround || landed) {
            const test = this.pos.clone(); test[ax] = before + amt; test.y += 1.01;
            const up = this.pos.clone(); up.y += 1.01;
            if (!this.collides(up) && !this.collides(test)) {
              this.pos.copy(test);
              this.eyeOffset = Math.min(1, this.eyeOffset + 1);
              continue;
            }
          }
          hitWall = true;
          this.vel[ax] = 0;
        }
      }
    }
    // ground check
    const below = this.pos.clone(); below.y -= 0.05;
    this.onGround = this.vel.y <= 0 && this.collides(below);
    if (this.onGround) this.endGlide();
    if (this.onGround && !this.inLava) this.lastSafe = this.pos.clone();

    if (!this.onGround && !this.inWater) {
      if (this.fallStart === null) this.fallStart = this.pos.y;
      this.fallStart = Math.max(this.fallStart, this.pos.y);
    } else if (this.fallStart !== null) {
      const dist = this.fallStart - this.pos.y;
      this.fallStart = null;
      if (this.onGround) this.onLand?.(dist);
    }

    if (this.pos.y < -10) { this.pos.y = H; this.vel.set(0, 0, 0); }

    // footsteps
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && hs > 0.5) {
      this.stepDist += hs * dt;
      this.bob += hs * dt * 1.8;
      if (this.stepDist > (sprint ? 2.1 : 1.7)) {
        this.stepDist = 0;
        const id = w.get(Math.floor(this.pos.x), Math.floor(this.pos.y - 0.1), Math.floor(this.pos.z));
        if (id) this.onStep?.(id);
      }
    }

    this.eyeOffset = Math.max(0, this.eyeOffset - dt * 9);
    const bobY = this.onGround ? Math.abs(Math.sin(this.bob * 2)) * 0.05 * Math.min(1, hs / 4) : 0;
    this.camera.position.set(this.pos.x, this.pos.y + this.eyeH - this.eyeOffset + bobY, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    const fov = this.gliding ? 75 + Math.min(22, this.glideSpeed * 0.8) : sprint && hs > 4 ? 82 : 75;
    this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 8);
    this.speed = hs;
    this.camera.updateProjectionMatrix();
    return { hitWall };
  }

  standingOn() { return this.world.get(Math.floor(this.pos.x), Math.floor(this.pos.y - 0.1), Math.floor(this.pos.z)); }
}
