# Ore & Equity

A first-person voxel survival game where **the economy is the game**. Dig ore, sell it on a market whose prices move every day, invest the profits in village shares, take on leverage at the bank, and ride out market shocks, all inside a blocky valley. A full run is 10 in-game days (about 15 minutes).

Everything is original and generated in your browser: the pixel textures are painted onto a canvas at load time, and every sound and the ambient music are synthesized with the Web Audio API. There are no image or audio files.

## How to play

You start at the **Trading Post** with a wooden pickaxe, $40, and a ledger. Your score is your **net worth** when day 10 ends:

> net worth = cash + value of ore you're carrying + value of your shares − debt

| What | Where | Why |
|---|---|---|
| **Mine** coal, iron, gold, diamonds | Anywhere underground; the Mining Town's spiral mine is rich | Deeper ore is rarer and worth more. Better pickaxes unlock it. |
| **Sell ore** | Merchant, Trading Post stall | Prices reset at dawn. Selling a lot at once pushes the price down. |
| **Market board** | Wall at the Trading Post | Live prices, green/red arrows. Right-click it for charts. |
| **Buy/sell shares** | Banker in each village | Share price follows village health. Dividends are paid every dawn. |
| **Deliver ore** | Quartermaster in each village | Pays 90% of market with no price impact, and raises village health. Buy shares first, then deliver! |
| **Borrow** | Banker, Trade Port | Up to 2× net worth, 4% interest/day, 20% of the balance due every dawn. Miss a payment and the bank seizes ore or shares. |

**Villages**
- **Mining Town (MINE)**: wants coal and iron. Medium volatility.
- **Farm Village (FARM)**: steady, with the best dividend, but droughts hit it hard.
- **Trade Port (PORT)**: wants gold and diamonds. Rich and very volatile.

**Market events.** One or two per game, sometimes preceded by gossip in chat: Murkmole raids (a village's health and share price crash), deep cave-ins (diamond prices spike), droughts, and gold rushes (gold prices crash).

**Creatures.** *Murkmoles* are tough, crystal-backed burrowers that roam day and night (most at night). *Skimmers* are flying thieves that dive at you and snatch cash; hit one before it gets away to get the money back. The richer you get, the more of both come for you. Protect yourself with a **sword**, **Iron Armor** (cuts creature damage by 40% while carried) and **lanterns** (nothing spawns in lantern light). Weapons need a moment to recover between swings (the bar under the crosshair): a full swing does full damage, spam-clicking barely scratches. Murkmoles close in with gnashing teeth. If you're knocked out, everything you carry drops where you fell, and the compass points back to it for 5 minutes.

**Golden Parachute.** $350 wings from the Merchant. Press Space in mid-air to open them and glide: dive to pick up speed, look up to trade it for height. Flying fast into a wall hurts. After landing the wings need 3 seconds before they open again.

**Worlds and saving.** Play opens a world list. Create a new world (with an optional seed), or pick one to carry on where you left off. Worlds save to your browser every 30 seconds, and whenever you pause or quit. A save stores the seed plus every block you changed, so it stays small. Finished worlds stay in the list with their final net worth.

**Caves** run deep: winding tunnels, big caverns, ravines, and lava lakes near the bottom of the world. Mined blocks drop as items you walk over to pick up.

**Pickaxe tiers.** Wood → Stone → Iron → Diamond. Craft them with **E** or buy them (plus swords and armor) from the Merchant.
- Stone pickaxe: 3 cobblestone + 2 planks. Mines iron.
- Iron pickaxe: 3 raw iron + 2 coal + 2 planks. Mines gold and diamonds.
- Diamond pickaxe: 3 diamonds + 2 planks. Fastest.

At the end you get a rating from *Intern* to *Managing Director*, a breakdown of mining income, investment income and interest paid, and a local high-score table.

## Controls

| Key | Action |
|---|---|
| W A S D | Move |
| Mouse | Look (click the game to capture the mouse; sensitivity slider on the title and pause screens) |
| Space | Jump / swim up / open or close the wings in mid-air |
| Ctrl | Sprint (tap while moving forward) |
| Shift | Crouch (slower, and you won't walk off edges) |
| Left click (hold) | Break block / attack |
| Right click | Place block / talk to villager / read market board |
| 1–9, mouse wheel | Select hotbar slot |
| E | Inventory & crafting |
| Q | Drop held item (Ctrl+Q drops the stack) |
| F5 | First person / third person behind / third person front |
| L | Ledger (portfolio, net-worth chart, transactions) |
| M | Mute / unmute |
| Esc | Pause / close a screen |

## Running locally

On Windows, double-click **`play.bat`**. It starts a local server and opens the game; close its window to stop.

Otherwise: it's a static site, but browsers block ES modules on `file://`, so serve the folder:

```bash
python -m http.server 8000
```

Then open http://localhost:8000. Desktop Chrome is recommended.

## Tech

- [Three.js](https://threejs.org/) r160, loaded as an ES module from jsDelivr via an import map. No build step.
- 320×288×64 world in 16×16 chunks. Each chunk has one merged mesh with hidden-face culling, per-vertex ambient occlusion and smooth lighting (skylight plus flood-filled light from lanterns and lava), drawn with a small custom shader.
- Font: [Minecraftia](https://www.dafont.com/minecraftia.font) by Andrew Tyler, bundled in `fonts/`. It is free for personal use; commercial use needs a license from the author.

```
index.html        page shell, HUD and menu markup, import map
fonts/            Minecraftia pixel font
css/style.css     classic block-game UI styling
js/main.js        game loop, input, mining/placing
js/world.js       terrain, caves, ores, chunk meshing, raycasting
js/structures.js  Trading Post and village builders
js/player.js      first-person physics, crouching, gliding
js/sky.js         day/night, sun, moon, stars, clouds
js/textures.js    procedural pixel art and icons
js/audio.js       synthesized sound effects and ambient music
js/inventory.js   inventory and crafting recipes
js/entities.js    villagers, the player's banker model, Murkmoles, Skimmers, particles
js/items3d.js     3D item models (block cubes, extruded icons)
js/drops.js       items lying in the world
js/hand.js        first-person held item and swing animation
js/economy.js     markets, shares, dividends, loans, events
js/tradeui.js     merchant, banker, quartermaster, ledger, end screens
js/session.js     wires the economy and NPCs into the game
js/saves.js       world saves in IndexedDB
```
