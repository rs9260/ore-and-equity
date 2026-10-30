// Inventory: 9 hotbar slots + 27 storage slots, plus simple crafting recipes.
import { B, I, PICKS, stackSize } from './blocks.js';

export const RECIPES = [
  { out: [B.PLANKS, 4], in: [[B.LOG, 1]] },
  { out: [I.WOOD_PICK, 1], in: [[B.PLANKS, 3]] }, // a way back in after losing your tools
  { out: [I.STONE_PICK, 1], in: [[B.COBBLE, 3], [B.PLANKS, 2]] },
  { out: [I.IRON_PICK, 1], in: [[I.RAW_IRON, 3], [I.COAL, 2], [B.PLANKS, 2]] },
  { out: [I.DIAMOND_PICK, 1], in: [[I.DIAMOND, 3], [B.PLANKS, 2]] },
  { out: [I.STONE_SWORD, 1], in: [[B.COBBLE, 2], [B.PLANKS, 1]] },
  { out: [I.IRON_SWORD, 1], in: [[I.RAW_IRON, 2], [I.COAL, 1], [B.PLANKS, 1]] },
  { out: [I.DIAMOND_SWORD, 1], in: [[I.DIAMOND, 2], [B.PLANKS, 1]] },
  { out: [I.IRON_ARMOR, 1], in: [[I.RAW_IRON, 5], [I.COAL, 2]] },
  { out: [B.LANTERN, 2], in: [[I.COAL, 1], [B.PLANKS, 1]] },
  { out: [B.STONE_BRICK, 4], in: [[B.COBBLE, 4]] },
];

export class Inventory {
  constructor() {
    this.slots = new Array(36).fill(null);
    this.selected = 0;
    this.listeners = [];
  }
  onChange(f) { this.listeners.push(f); }
  changed() { this.listeners.forEach((f) => f()); }

  held() { return this.slots[this.selected]?.id ?? 0; }

  add(id, n = 1, notify = true) {
    const max = stackSize(id);
    // fill existing stacks (hotbar first), then empty slots
    for (let pass = 0; pass < 2 && n > 0; pass++) {
      for (let i = 0; i < 36 && n > 0; i++) {
        const s = this.slots[i];
        if (pass === 0 && s && s.id === id && s.count < max) {
          const k = Math.min(n, max - s.count); s.count += k; n -= k;
        } else if (pass === 1 && !s) {
          const k = Math.min(n, max); this.slots[i] = { id, count: k }; n -= k;
        }
      }
    }
    if (notify) this.changed();
    return n; // leftover
  }

  count(id) { let c = 0; for (const s of this.slots) if (s && s.id === id) c += s.count; return c; }

  remove(id, n, notify = true) {
    let removed = 0;
    for (let i = 35; i >= 0 && removed < n; i--) {
      const s = this.slots[i];
      if (!s || s.id !== id) continue;
      const k = Math.min(n - removed, s.count);
      s.count -= k; removed += k;
      if (s.count <= 0) this.slots[i] = null;
    }
    if (notify) this.changed();
    return removed;
  }

  consumeHeld() {
    const s = this.slots[this.selected];
    if (!s) return;
    if (--s.count <= 0) this.slots[this.selected] = null;
    this.changed();
  }

  bestPickTier() {
    let t = 0;
    for (const s of this.slots) if (s && PICKS[s.id]) t = Math.max(t, PICKS[s.id].tier);
    return t;
  }

  canCraft(r) { return r.in.every(([id, n]) => this.count(id) >= n); }
  craft(r) {
    if (!this.canCraft(r)) return false;
    for (const [id, n] of r.in) this.remove(id, n, false);
    this.add(r.out[0], r.out[1], false);
    this.changed();
    return true;
  }
}
