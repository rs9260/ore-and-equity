// Block and item registry.

export const B = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, COBBLE: 4, LOG: 5, LEAVES: 6, PLANKS: 7, SAND: 8, GRAVEL: 9,
  BEDROCK: 10, WATER: 11, COAL_ORE: 12, IRON_ORE: 13, GOLD_ORE: 14, DIAMOND_ORE: 15, BRICK: 16,
  GLASS: 17, HAY: 18, CLOTH_RED: 19, CLOTH_BLUE: 20, CLOTH_WHITE: 21, GOLD_BLOCK: 22, MARKET_BOARD: 23,
  FARMLAND: 24, WHEAT: 25, TALLGRASS: 26, FLOWER_RED: 27, FLOWER_YELLOW: 28, STONE_BRICK: 29,
  LANTERN: 30, ROOF: 31, LAVA: 32,
};

export const I = {
  WOOD_PICK: 100, STONE_PICK: 101, IRON_PICK: 102, DIAMOND_PICK: 103,
  STONE_SWORD: 104, IRON_SWORD: 105, DIAMOND_SWORD: 106, IRON_ARMOR: 107, WINGS: 108,
  COAL: 110, RAW_IRON: 111, RAW_GOLD: 112, DIAMOND: 113,
  LEDGER: 120,
};

// tier: pickaxe tier required to harvest (0 = hand). tool 'pick' means pickaxes speed it up.
const defs = [
  [B.GRASS, 'Grass Block', { top: 'grass_top', side: 'grass_side', bottom: 'dirt' }, { hardness: 0.6, sound: 'grass', drop: B.DIRT }],
  [B.DIRT, 'Dirt', 'dirt', { hardness: 0.5, sound: 'dirt' }],
  [B.STONE, 'Stone', 'stone', { hardness: 1.5, tier: 1, tool: 'pick', sound: 'stone', drop: B.COBBLE }],
  [B.COBBLE, 'Cobblestone', 'cobble', { hardness: 1.8, tier: 1, tool: 'pick', sound: 'stone' }],
  [B.LOG, 'Log', { top: 'log_top', side: 'log_side', bottom: 'log_top' }, { hardness: 1.3, sound: 'wood', axe: true }],
  [B.LEAVES, 'Leaves', 'leaves', { hardness: 0.2, sound: 'leaves', transparent: true, drop: 0 }],
  [B.PLANKS, 'Planks', 'planks', { hardness: 1.2, sound: 'wood', axe: true }],
  [B.SAND, 'Sand', 'sand', { hardness: 0.5, sound: 'sand' }],
  [B.GRAVEL, 'Gravel', 'gravel', { hardness: 0.6, sound: 'sand' }],
  [B.BEDROCK, 'Bedrock', 'bedrock', { hardness: Infinity, sound: 'stone' }],
  [B.WATER, 'Water', 'water', { hardness: Infinity, liquid: true, transparent: true, solid: false }],
  [B.COAL_ORE, 'Coal Ore', 'coal_ore', { hardness: 2.4, tier: 1, tool: 'pick', sound: 'stone', drop: I.COAL }],
  [B.IRON_ORE, 'Iron Ore', 'iron_ore', { hardness: 2.8, tier: 2, tool: 'pick', sound: 'stone', drop: I.RAW_IRON }],
  [B.GOLD_ORE, 'Gold Ore', 'gold_ore', { hardness: 3.0, tier: 3, tool: 'pick', sound: 'stone', drop: I.RAW_GOLD }],
  [B.DIAMOND_ORE, 'Diamond Ore', 'diamond_ore', { hardness: 3.4, tier: 3, tool: 'pick', sound: 'stone', drop: I.DIAMOND }],
  [B.BRICK, 'Bricks', 'brick', { hardness: 2, tier: 1, tool: 'pick', sound: 'stone' }],
  [B.GLASS, 'Glass', 'glass', { hardness: 0.3, sound: 'glass', transparent: true, drop: 0 }],
  [B.HAY, 'Hay Bale', { top: 'hay_top', side: 'hay_side', bottom: 'hay_top' }, { hardness: 0.5, sound: 'grass' }],
  [B.CLOTH_RED, 'Red Cloth', 'cloth_red', { hardness: 0.6, sound: 'cloth' }],
  [B.CLOTH_BLUE, 'Blue Cloth', 'cloth_blue', { hardness: 0.6, sound: 'cloth' }],
  [B.CLOTH_WHITE, 'White Cloth', 'cloth_white', { hardness: 0.6, sound: 'cloth' }],
  [B.GOLD_BLOCK, 'Gold Block', 'gold_block', { hardness: Infinity, sound: 'stone' }],
  [B.MARKET_BOARD, 'Market Board', { top: 'board_side', side: 'board_side', bottom: 'board_side' }, { hardness: Infinity, sound: 'wood' }],
  [B.FARMLAND, 'Farmland', { top: 'farmland_top', side: 'dirt', bottom: 'dirt' }, { hardness: 0.5, sound: 'dirt', drop: B.DIRT }],
  [B.WHEAT, 'Wheat', 'wheat', { hardness: 0, sound: 'leaves', cross: true, solid: false, transparent: true, drop: 0 }],
  [B.TALLGRASS, 'Tall Grass', 'tallgrass', { hardness: 0, sound: 'leaves', cross: true, solid: false, transparent: true, drop: 0 }],
  [B.FLOWER_RED, 'Red Flower', 'flower_red', { hardness: 0, sound: 'leaves', cross: true, solid: false, transparent: true }],
  [B.FLOWER_YELLOW, 'Yellow Flower', 'flower_yellow', { hardness: 0, sound: 'leaves', cross: true, solid: false, transparent: true }],
  [B.STONE_BRICK, 'Stone Bricks', 'stone_brick', { hardness: 2, tier: 1, tool: 'pick', sound: 'stone' }],
  [B.LANTERN, 'Lantern', 'lantern', { hardness: 0.4, sound: 'glass', glow: true }],
  [B.ROOF, 'Roof Tiles', 'roof', { hardness: 1.2, tier: 1, tool: 'pick', sound: 'stone' }],
  [B.LAVA, 'Lava', 'lava', { hardness: Infinity, liquid: true, solid: false, glow: true }],
];

export const BLOCKS = [];
BLOCKS[0] = { id: 0, name: 'Air', solid: false, transparent: true };
for (const [id, name, tex, o] of defs) {
  const faces = typeof tex === 'string' ? { top: tex, side: tex, bottom: tex } : tex;
  BLOCKS[id] = {
    id, name, faces,
    hardness: o.hardness ?? 1,
    tier: o.tier ?? 0,
    tool: o.tool ?? null,
    axe: !!o.axe,
    sound: o.sound ?? 'stone',
    drop: o.drop ?? id,
    transparent: !!o.transparent,
    solid: o.solid ?? true,
    liquid: !!o.liquid,
    cross: !!o.cross,
    glow: !!o.glow,
  };
}

// Fast lookup tables for meshing/physics.
export const SOLID = new Uint8Array(256);
export const OPAQUE = new Uint8Array(256); // fully hides neighbour faces
for (const b of BLOCKS) {
  if (!b) continue;
  SOLID[b.id] = b.solid ? 1 : 0;
  OPAQUE[b.id] = b.solid && !b.transparent ? 1 : 0;
}

export const PICKS = {
  [I.WOOD_PICK]: { tier: 1, speed: 2.2, damage: 3 },
  [I.STONE_PICK]: { tier: 2, speed: 3.6, damage: 4 },
  [I.IRON_PICK]: { tier: 3, speed: 5.5, damage: 5 },
  [I.DIAMOND_PICK]: { tier: 4, speed: 8.5, damage: 7 },
};

// Swords hit harder and reach a little further than pickaxes.
export const SWORDS = {
  [I.STONE_SWORD]: { damage: 6, reach: 4.2 },
  [I.IRON_SWORD]: { damage: 9, reach: 4.4 },
  [I.DIAMOND_SWORD]: { damage: 13, reach: 4.6 },
};
// Armor works while it's anywhere in your inventory.
export const ARMOR_REDUCTION = 0.4;

export const TIER_NAMES = ['your hand', 'a Wooden Pickaxe', 'a Stone Pickaxe', 'an Iron Pickaxe', 'a Diamond Pickaxe'];

export const ITEMS = {
  [I.WOOD_PICK]: { name: 'Wooden Pickaxe', stack: 1 },
  [I.STONE_PICK]: { name: 'Stone Pickaxe', stack: 1 },
  [I.IRON_PICK]: { name: 'Iron Pickaxe', stack: 1 },
  [I.DIAMOND_PICK]: { name: 'Diamond Pickaxe', stack: 1 },
  [I.STONE_SWORD]: { name: 'Stone Sword', stack: 1 },
  [I.IRON_SWORD]: { name: 'Iron Sword', stack: 1 },
  [I.DIAMOND_SWORD]: { name: 'Diamond Sword', stack: 1 },
  [I.IRON_ARMOR]: { name: 'Iron Armor', stack: 1 },
  [I.WINGS]: { name: 'Golden Parachute', stack: 1 },
  [I.COAL]: { name: 'Coal', stack: 64, ore: 'coal' },
  [I.RAW_IRON]: { name: 'Raw Iron', stack: 64, ore: 'iron' },
  [I.RAW_GOLD]: { name: 'Raw Gold', stack: 64, ore: 'gold' },
  [I.DIAMOND]: { name: 'Diamond', stack: 64, ore: 'diamond' },
  [I.LEDGER]: { name: 'Ledger', stack: 1 },
};

export const ORE_ITEMS = { coal: I.COAL, iron: I.RAW_IRON, gold: I.RAW_GOLD, diamond: I.DIAMOND };

export function isBlockItem(id) { return id > 0 && id < 100 && !!BLOCKS[id]; }
export function itemName(id) { return id < 100 ? BLOCKS[id]?.name ?? '?' : ITEMS[id]?.name ?? '?'; }
export function stackSize(id) { return id < 100 ? 64 : ITEMS[id]?.stack ?? 64; }

// How long (seconds) it takes to break block `id` holding item `held`. Returns Infinity if not harvestable.
export function breakTime(id, held) {
  const b = BLOCKS[id];
  if (!b || b.hardness === Infinity) return Infinity;
  const pick = PICKS[held];
  const tier = pick ? pick.tier : 0;
  if (b.tier > tier) return Infinity;
  let t = b.hardness * 1.5;
  if (pick && b.tool === 'pick') t /= pick.speed;
  else if (pick && b.axe) t /= 1.6;
  return Math.max(t, 0.05);
}
