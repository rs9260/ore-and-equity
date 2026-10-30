// Wires the economy, villages, NPCs, mobs and in-world market board into the game loop.
import * as THREE from 'three';
import { B, BLOCKS, I, ORE_ITEMS, PICKS, SWORDS, ITEMS } from './blocks.js';
import { itemIcon } from './textures.js';
import { SITES, WX, WZ } from './world.js';
import { buildStructures } from './structures.js';
import { Villager, Mobs, nameTag } from './entities.js';
import { mulberry32 } from './noise.js';
import { Economy, ORE_KEYS, ORE_INFO, VILLAGE_KEYS, VILLAGE_INFO } from './economy.js';
import { isNight, clockString } from './sky.js';
import { money } from './ui.js';
import { openMerchant, openBanker, openQuartermaster, openMarketBoard, openLedger, renderEnd, ratingFor } from './tradeui.js';

const ROLE_TITLES = { merchant: 'Merchant', banker: 'Banker', quartermaster: 'Quartermaster' };
const ROLE_COLORS = { merchant: '#ffd84a', banker: '#5cff5c', quartermaster: '#ffaa44' };
const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];

export function installSession(game, { DAY_SECONDS, GAME_DAYS }) {
  const ui = game.ui;
  const oreImgs = {};
  for (const k of ORE_KEYS) { const im = new Image(); im.src = itemIcon(ORE_INFO[k].item); oreImgs[k] = im; }

  game.afterGenerate = () => { game.npcSpecs = buildStructures(game.world); };

  game.onDisposeWorld = () => {
    for (const v of game.villagers || []) game.scene.remove(v.root);
    for (const s of game.signs || []) game.scene.remove(s.sprite);
    if (game.boardMesh) game.scene.remove(game.boardMesh);
    game.mobs?.clear();
  };

  // ---------- new game ----------
  game.onNewGame = () => {
    const hooks = {
      chat: (t, c) => ui.chat(t, c),
      toast: (a, b, i) => ui.toast(a, b, i),
      tip: (k, t, b) => ui.tip(k, t, b),
      sound: (name, good) => { if (name === 'alert') game.audio.alert(good); },
      raid: (vk) => startRaid(vk),
    };
    game.econ = new Economy(game.world.seed, hooks);
    game.time = 4; // start just after sunrise
    game.lastDay = 1;
    game.lastSale = game.lastDelivery = null;
    game.nextSample = 0;
    game.boardTimer = 0;
    game.spawnTimer = 3;
    game.flyerTimer = 20;
    game.threatTier = 0;
    game.raidMobs = 0;

    // villagers
    game.villagers = game.npcSpecs.map((spec) => {
      const site = SITES[spec.village];
      const sub = spec.village === 'post' ? 'Ore buyer · Pickaxes' : spec.role === 'banker' ? `${VILLAGE_INFO[spec.village].ticker} shares${spec.village === 'port' ? ' · Loans' : ''}` : `Deliveries · ${site.name}`;
      const v = new Villager(spec, { title: ROLE_TITLES[spec.role], color: ROLE_COLORS[spec.role], sub });
      game.scene.add(v.root);
      return v;
    });
    // floating village signs with live share price
    game.signs = [];
    for (const k of VILLAGE_KEYS) makeSign(k);
    makeBoard();
    game.mobs ??= new Mobs(game.scene);
    game.mobs.clear();
    game.econ.sampleNetWorth(0, game.inv);

    setTimeout(() => {
      ui.tip('welcome', 'Welcome!', 'Your goal is to grow your net worth in 10 days, so mine ore, sell it when prices are good, and invest the profits in village shares.');
      ui.tip('board1', 'The market board', 'The board in front of you shows today\'s ore and share prices, so right-click it any time for charts.');
    }, 1200);
    ui.chat('Tip: the Merchant (stall to your right) buys ore. Villages lie in every direction; follow the arrows top-right.', '#aaaaaa');
  };

  // ---------- saving ----------
  game.onSnapshot = () => {
    const { r, h, ...econ } = game.econ; // the RNG and hooks are rebuilt on load
    return { econ, lastDay: game.lastDay, nextSample: game.nextSample, threatTier: game.threatTier, warnedFlyer: !!game.warnedFlyer };
  };
  game.onRestore = (s) => {
    Object.assign(game.econ, structuredClone(s.econ));
    game.econ.r = mulberry32(game.world.seed ^ 0x5eed ^ Math.imul(s.lastDay, 7919) ^ Math.floor(game.time * 1000));
    game.lastDay = s.lastDay;
    game.nextSample = s.nextSample;
    game.threatTier = s.threatTier;
    game.warnedFlyer = s.warnedFlyer;
    for (const k of VILLAGE_KEYS) makeSign(k);
    drawBoard();
  };

  function makeSign(k) {
    const old = game.signs.find((s) => s.k === k);
    if (old) game.scene.remove(old.sprite);
    const v = game.econ.villages[k], info = VILLAGE_INFO[k];
    const ch = game.econ.change(v);
    const sprite = nameTag(info.name, '#ffffff', `${info.ticker} ${money(v.price, 2)} ${ch >= 0 ? '▲' : '▼'} ${(ch * 100).toFixed(1)}%`);
    sprite.scale.multiplyScalar(2.2);
    const s = SITES[k];
    sprite.position.set(s.x + 0.5, s.y + 9.5, s.z + 0.5);
    game.scene.add(sprite);
    game.signs = game.signs.filter((x) => x.k !== k);
    game.signs.push({ k, sprite });
  }

  // ---------- in-world market board ----------
  function makeBoard() {
    const b = SITES.post.board;
    const c = document.createElement('canvas');
    c.width = 500; c.height = 300;
    game.boardCanvas = c;
    game.boardTex = new THREE.CanvasTexture(c);
    game.boardTex.minFilter = THREE.LinearFilter;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(b.w - 0.1, b.h - 0.1), new THREE.MeshBasicMaterial({ map: game.boardTex }));
    m.position.set(b.x + b.w / 2, b.y + b.h / 2, b.z + 1.01);
    game.boardMesh = m;
    game.scene.add(m);
    drawBoard();
  }
  function drawBoard() {
    const c = game.boardCanvas, g = c.getContext('2d'), e = game.econ;
    g.fillStyle = '#1f3a2a'; g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = '#5b3b1b'; g.lineWidth = 10; g.strokeRect(5, 5, c.width - 10, c.height - 10);
    // Minecraftia's glyphs sit well above the baseline, so text is drawn at y + LIFT
    const LIFT = 10;
    g.font = '24px Minecraftia, monospace';
    g.fillStyle = '#ffd84a'; g.textAlign = 'center';
    g.fillText(`VALLEY EXCHANGE · DAY ${Math.min(e.day, GAME_DAYS)}`, c.width / 2, 44 + LIFT);
    g.textAlign = 'left';
    const row = (y, img, name, price, ch) => {
      if (img) { g.imageSmoothingEnabled = false; g.drawImage(img, 26, y - 26, 30, 30); }
      g.font = '20px Minecraftia, monospace';
      y += LIFT;
      g.fillStyle = '#e8f0e8'; g.fillText(name, img ? 66 : 30, y);
      g.textAlign = 'right'; g.fillText(money(price, 2), 330, y);
      g.fillStyle = ch > 0.0005 ? '#5cff5c' : ch < -0.0005 ? '#ff6b6b' : '#cccccc';
      g.fillText(`${ch > 0.0005 ? '▲' : ch < -0.0005 ? '▼' : '■'} ${(ch * 100).toFixed(1)}%`, 470, y);
      g.textAlign = 'left';
    };
    let y = 82;
    for (const k of ORE_KEYS) { row(y, oreImgs[k], ORE_INFO[k].name, e.ores[k].price, e.change(e.ores[k])); y += 32; }
    g.fillStyle = '#5b7b6b'; g.fillRect(24, y - 20, c.width - 48, 2);
    y += 8;
    for (const k of VILLAGE_KEYS) { row(y, null, VILLAGE_INFO[k].ticker + ' shares', e.villages[k].price, e.change(e.villages[k])); y += 30; }
    game.boardTex.needsUpdate = true;
  }
  game.onSale = () => { drawBoard(); };

  // ---------- raids & mobs ----------
  function startRaid(vk) {
    const s = SITES[vk];
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 6;
      const x = Math.floor(s.x + Math.cos(a) * r), z = Math.floor(s.z + Math.sin(a) * r);
      const y = game.world.surfaceY(x, z) + 1;
      const m = game.mobs.spawn(x + 0.5, y, z + 0.5, { raid: vk, home: { x: s.x, z: s.z } });
      m.raidUntil = game.time + DAY_SECONDS * 1.5;
    }
    ui.chat(`Defend ${s.name}! Each Murkmole you knock out restores some village health.`, '#ff9955');
  }

  // Wealth draws creatures: 0 when broke, up to 3 for a fortune.
  function threat() { return Math.max(0, Math.min(3, (game.econ.netWorth(game.inv) - 40) / 450)); }

  function trySpawnMole() {
    const p = game.player.pos, w = game.world;
    const underground = w.height[Math.floor(p.x) + WX * Math.floor(p.z)] > p.y + 4;
    for (let attempt = 0; attempt < 8; attempt++) {
      const a = Math.random() * Math.PI * 2, d = underground ? 8 + Math.random() * 8 : 16 + Math.random() * 10;
      const x = Math.floor(p.x + Math.cos(a) * d), z = Math.floor(p.z + Math.sin(a) * d);
      if (!w.inBounds(x, 1, z)) continue;
      let y;
      if (underground) {
        y = -1;
        for (let yy = Math.floor(p.y) + 3; yy > Math.floor(p.y) - 4; yy--) {
          if (w.get(x, yy, z) === B.AIR && w.get(x, yy + 1, z) === B.AIR && BLOCKS[w.get(x, yy - 1, z)].solid) { y = yy; break; }
        }
        if (y < 0) continue;
      } else {
        y = w.surfaceY(x, z) + 1;
        if (w.get(x, y, z) === B.WATER || w.get(x, y - 1, z) === B.WATER) continue;
        if (Object.values(SITES).some((s) => Math.hypot(s.x - x, s.z - z) < s.r + 2)) continue;
      }
      // light keeps them away: nothing spawns near lanterns
      if (w.blight[x + WX * (z + WZ * y)] >= 7) continue;
      if (w.get(x, y, z) === B.LAVA) continue;
      game.mobs.spawn(x + 0.5, y, z + 0.5);
      return;
    }
  }

  function trySpawnFlyer() {
    const p = game.player.pos, w = game.world;
    for (let attempt = 0; attempt < 6; attempt++) {
      const a = Math.random() * Math.PI * 2, d = 22 + Math.random() * 10;
      const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      if (!w.inBounds(Math.floor(x), 1, Math.floor(z))) continue;
      const y = Math.max(p.y + 10, w.surfaceY(Math.floor(x), Math.floor(z)) + 8);
      game.mobs.spawnFlyer(x, y, z);
      if (!game.warnedFlyer) { game.warnedFlyer = true; ui.chat('A Skimmer is circling overhead. It swoops in to snatch cash!', '#7fe0e8'); ui.tip('skimmer', 'Skimmers', 'Skimmers dive at you and steal cash, so hit one before it flies off to get your money back, or shelter under a roof.'); }
      return;
    }
  }

  const mobHooks = {
    attackPlayer: (m, dir) => {
      game.damage(3, 'mob');
      game.player.vel.x += dir.x * 6; game.player.vel.z += dir.z * 6; game.player.vel.y = 5;
    },
    flyerStrike: (m) => {
      game.damage(2, 'mob');
      const e = game.econ;
      const take = Math.min(25, Math.round(e.cash * 0.06 * 100) / 100);
      if (take >= 1) {
        e.cash -= take; m.loot = take;
        e.log('Stolen by a Skimmer', -take);
        ui.chat(`A Skimmer snatched ${money(take, 2)}! Hit it before it gets away.`, '#ff9955');
      }
    },
    flyerEscaped: (m) => ui.chat(`The Skimmer escaped with ${money(m.loot, 2)}.`, '#ff5555'),
    screech: (v) => game.audio.screech(v),
    growl: (v) => game.audio.growl(v),
    chomp: (v) => game.audio.chomp(v),
    burned: () => game.audio.sizzle(),
  };

  game.tryAttack = () => {
    const eye = game.player.eye();
    let dir = game.player.forward();
    const held = game.inv.held();
    const reach = SWORDS[held]?.reach ?? 3.6;
    const hit = game.mobs.raycast(eye, dir, reach);
    if (!hit) return false;
    const block = game.world.raycast(eye, dir, reach);
    if (block && block.dist < hit.dist) return false;
    // attack cooldown: a fully recovered swing does full damage, spam-clicking barely scratches
    const charge = game.attackCharge();
    game.lastAttack = game.time;
    const full = SWORDS[held]?.damage ?? PICKS[held]?.damage ?? 2;
    const dmg = Math.round(full * (0.2 + 0.8 * charge * charge) * 10) / 10;
    if (charge < 0.9) dir = dir.clone().multiplyScalar(0.3); // weak hits barely knock back
    game.audio.mobHit();
    if (game.mobs.hit(hit.mob, dmg, dir)) {
      const m = hit.mob;
      game.particles.burst(m.pos.x - 0.5, m.pos.y, m.pos.z - 0.5, [90, 70, 110], 18);
      game.particles.burst(m.pos.x - 0.3, m.pos.y + 0.5, m.pos.z - 0.3, [106, 240, 224], 8, 0.6);
      game.mobs.remove(m);
      const flyer = m.kind === 'flyer';
      const bounty = flyer ? 8 : m.raid ? 10 : 6;
      game.econ.cash += bounty;
      game.econ.stats.bounties += bounty;
      game.econ.log(flyer ? 'Skimmer bounty' : 'Murkmole bounty', bounty);
      game.audio.coins();
      if (flyer) {
        if (m.loot) { game.econ.cash += m.loot; game.econ.log('Recovered from a Skimmer', m.loot); }
        ui.chat(`Skimmer downed! Bounty ${money(bounty)}${m.loot ? ` and you got back ${money(m.loot, 2)}` : ''}.`, '#55ff55');
      } else if (m.raid) {
        const v = game.econ.villages[m.raid];
        v.health = Math.min(100, v.health + 3);
        ui.chat(`Murkmole driven off! Bounty ${money(bounty)} · ${VILLAGE_INFO[m.raid].name} health +3`, '#55ff55');
      } else ui.chat(`Murkmole driven off! Bounty ${money(bounty)}`, '#55ff55');
    }
    return true;
  };

  game.blockedByEntity = (x, y, z) => {
    const box = new THREE.Box3(new THREE.Vector3(x, y, z), new THREE.Vector3(x + 1, y + 1, z + 1));
    return game.villagers.some((v) => v.box.intersectsBox(box)) || game.mobs.list.some((m) => m.kind === 'mole' && Math.abs(m.pos.x - x - 0.5) < 0.9 && Math.abs(m.pos.z - z - 0.5) < 0.9 && m.pos.y < y + 1 && m.pos.y + 0.8 > y);
  };

  // ---------- interaction ----------
  function lookedAtVillager(maxDist = 4.5) {
    const eye = game.player.eye(), dir = game.player.forward();
    const ray = new THREE.Ray(eye, dir);
    const tmp = new THREE.Vector3();
    let best = null;
    for (const v of game.villagers) {
      if (ray.intersectBox(v.box, tmp)) {
        const d = tmp.distanceTo(eye);
        if (d < maxDist && (!best || d < best.d)) best = { v, d };
      }
    }
    if (!best) return null;
    const block = game.world.raycast(eye, dir, best.d);
    if (block && block.dist < best.d - 0.05) return null;
    return best.v;
  }

  game.tryInteract = () => {
    const v = lookedAtVillager();
    if (v) {
      v.greet();
      game.audio.click();
      const { role, village } = v.spec;
      if (role === 'merchant') openMerchant(game);
      else if (role === 'banker') openBanker(game, village);
      else openQuartermaster(game, village);
      return true;
    }
    const hit = game.hoverHit;
    if (hit && hit.id === B.MARKET_BOARD) { openMarketBoard(game); return true; }
    return false;
  };

  game.openLedger = () => openLedger(game);

  game.onMined = (drop) => {
    if (drop === B.LOG) ui.tip('craft', 'Crafting', 'Press E to turn logs into planks, which you need for every pickaxe.');
    if (drop === B.COBBLE && game.inv.count(B.COBBLE) >= 3 && game.inv.bestPickTier() < 2) ui.tip('stonepick', 'Upgrade time', 'You have enough cobblestone for a Stone Pickaxe (press E), which can mine iron.');
    if (drop === I.RAW_IRON && game.inv.count(I.RAW_IRON) >= 3 && game.inv.bestPickTier() < 3) ui.tip('ironpick', 'Iron Pickaxe', 'With 3 raw iron, 2 coal and 2 planks you can craft an Iron Pickaxe, which mines gold and diamonds, but the iron you use can\'t be sold.');
    const ore = ITEMS[drop]?.ore;
    if (ore) {
      ui.tip('ore', 'You found ore!', `${ORE_INFO[ore].name} can be sold to the Merchant at the Trading Post, and its price changes every day, so watch the board.`);
      game.econ.stats.mined = (game.econ.stats.mined || 0) + 1;
    }
  };

  game.onCrafted = (r) => {
    if (PICKS[r.out[0]]) { game.audio.levelUp(); ui.toast('New pickaxe!', `${ITEMS[r.out[0]].name} crafted`, r.out[0]); }
  };

  game.onDeath = (dropped) => {
    if (dropped) ui.chat('You dropped everything you were carrying. Go back for it within 5 minutes; the compass shows where.', '#ff5555');
    ui.tip('death', 'Protect your goods', 'Everything you carry drops where you fall, so selling or delivering ore turns it into safe cash.');
  };

  // ---------- dawn ----------
  function dawn(day) {
    const e = game.econ;
    const r = e.dawn(day, game.inv);
    game.audio.alert(true);
    ui.chat(`☀ Day ${day} begins. Markets have repriced.`, '#ffff55');
    if (r.divTotal > 0) {
      const lines = r.dividends.filter((d) => d.amt > 0).map((d) => `${VILLAGE_INFO[d.k].ticker} ${money(d.amt, 2)}`).join(' · ');
      ui.toast('Dividends received', `${money(r.divTotal, 2)} — ${lines}`, I.LEDGER);
      game.audio.coins();
    }
    for (const d of r.dividends) if (d.skipped) ui.chat(`${VILLAGE_INFO[d.k].name} is too unhealthy to pay a dividend today.`, '#ff9955');
    if (r.interest > 0) ui.chat(`Port Bank charged ${money(r.interest, 2)} interest and collected ${money(r.paid, 2)}.`, '#ff9955');
    if (r.seized.length) {
      const what = r.seized.map((s) => `${s.n} ${s.share ? VILLAGE_INFO[s.k].ticker + ' shares' : ORE_INFO[s.k].name}`).join(', ');
      ui.toast('Payment missed!', `The bank seized ${what}.`, I.LEDGER);
      ui.chat(`⚠ Missed loan payment! The bank seized: ${what}.`, '#ff5555');
      game.audio.alert(false);
    }
    for (const k of VILLAGE_KEYS) makeSign(k);
    drawBoard();
    if (day === 2) ui.tip('dawn', 'A new day', 'Every dawn, prices move, shareholders get dividends and loan interest comes due, so check the board for bargains.');
  }

  function endGame() {
    const e = game.econ;
    game.state = 'ended';
    if (game.ui.panelOpen) game.ui.closePanel();
    if (document.pointerLockElement) document.exitPointerLock();
    const nw = e.netWorth(game.inv);
    let unreal = 0;
    for (const k of VILLAGE_KEYS) { const v = e.villages[k]; unreal += v.shares * v.price - v.cost; }
    const s = e.stats;
    const result = {
      nw, rating: ratingFor(nw), stats: s,
      mining: s.oreSales + s.deliveries,
      shareGainsTotal: s.shareGains + unreal,
      investing: s.dividends + s.shareGains + unreal,
      series: [...e.nwHistory.map((p) => p.nw), nw],
    };
    let scores = [];
    try { scores = JSON.parse(localStorage.getItem('oe_scores') || '[]'); } catch {}
    const entry = { nw: Math.round(nw), rating: result.rating, date: new Date().toLocaleDateString() };
    scores.push(entry);
    scores.sort((a, b) => b.nw - a.nw);
    scores = scores.slice(0, 8);
    try { localStorage.setItem('oe_scores', JSON.stringify(scores)); } catch {}
    game.audio.levelUp();
    game.saveNow({ ended: true });
    renderEnd(game, result, scores, scores.indexOf(entry));
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('screen-end').classList.remove('hidden');
  }

  game.showScores = () => {
    let scores = [];
    try { scores = JSON.parse(localStorage.getItem('oe_scores') || '[]'); } catch {}
    document.getElementById('scores-list').innerHTML = scores.length
      ? scores.map((s) => `<li>${money(s.nw)} · ${s.rating} <span class="note">${s.date}</span></li>`).join('')
      : '<li>No games finished yet.</li>';
  };

  // ---------- per-frame ----------
  game.onTick = (dt, frac, hit, active) => {
    const e = game.econ, p = game.player;
    const day = Math.floor(game.time / DAY_SECONDS) + 1;
    if (day > game.lastDay) {
      game.lastDay = day;
      if (day > GAME_DAYS) { endGame(); return; }
      dawn(day);
    }
    if (dt > 0) e.tick(dt, frac);
    // net worth samples every quarter day
    if (game.time >= game.nextSample) { if (game.nextSample > 0) e.sampleNetWorth(game.time, game.inv); game.nextSample += DAY_SECONDS / 4; }

    for (const v of game.villagers) v.update(dt, p.pos);
    const night = isNight(frac);
    if (dt > 0) {
      const th = threat();
      game.mobs.update(dt, game.world, p, mobHooks, { day: !night, dayFlyers: th >= 1.5 });
      for (const m of [...game.mobs.list]) if (m.raid && game.time > m.raidUntil) m.raid = null;
      // Murkmoles roam day and night; the richer you are, the more of them come.
      const tier = Math.floor(th);
      if (tier > game.threatTier) { game.threatTier = tier; ui.chat('Word of your fortune is spreading. More creatures are drawn to you.', '#c9a0ff'); }
      const moles = game.mobs.list.filter((m) => m.kind === 'mole' && !m.raid).length;
      const cap = night ? Math.round(3 + th * 3) : Math.round(1 + th * 1.7);
      game.spawnTimer -= dt;
      if (game.spawnTimer <= 0) {
        game.spawnTimer = (night ? 6 : 15) / (1 + th * 0.8) * (0.7 + Math.random() * 0.6);
        if (moles < cap) trySpawnMole();
      }
      // Skimmers hunt at night, and in daylight too once you're rich
      const flyers = game.mobs.list.filter((m) => m.kind === 'flyer').length;
      game.flyerTimer -= dt;
      if (game.flyerTimer <= 0) {
        game.flyerTimer = 25 / (1 + th) * (0.7 + Math.random() * 0.6);
        if ((night || th >= 1.5) && flyers < 1 + Math.floor(th) && game.lastDay >= 2) trySpawnFlyer();
      }
      if (night) {
        if (!game.warnedNight) { game.warnedNight = true; ui.chat('Night falls. More Murkmoles are surfacing!', '#c9a0ff'); ui.tip('night', 'Staying safe', 'Creatures spawn more at night and as you get richer, so buy or craft a sword and Iron Armor, and place lanterns, since nothing spawns in lantern light.'); }
      } else game.warnedNight = false;
    }

    // buyers hold out their coin pouch when you're holding something they'd buy
    const held = game.inv.held();
    const heldOre = ITEMS[held]?.ore;
    for (const v of game.villagers) {
      let offer = null;
      if (heldOre && Math.hypot(v.root.position.x - p.pos.x, v.root.position.z - p.pos.z) < 8) {
        if (v.spec.role === 'merchant') offer = `Buys ${ORE_INFO[heldOre].name} ${money(e.ores[heldOre].price, 2)}`;
        else if (v.spec.role === 'quartermaster' && VILLAGE_INFO[v.spec.village].accepts.includes(heldOre)) offer = `Takes ${ORE_INFO[heldOre].name} ${money(e.deliveryPrice(v.spec.village, heldOre), 2)}`;
      }
      v.setOffer(offer);
    }

    // board refresh
    game.boardTimer -= dt;
    if (game.boardTimer <= 0) { game.boardTimer = 3; drawBoard(); }

    // hover hints
    if (active) {
      const v = lookedAtVillager();
      if (v) ui.hint(`Right-click to talk to the ${ROLE_TITLES[v.spec.role]}`);
      else if (hit && hit.id === B.MARKET_BOARD) ui.hint('Right-click to view the market');
    }

    // HUD (throttled to avoid layout work every frame)
    const debt = e.debt;
    game.hudT = (game.hudT || 0) - dt;
    if (game.hudT <= 0 || dt === 0) {
      game.hudT = 0.1;
      ui.stats({ cash: e.cash, nw: e.netWorth(game.inv), debt, payment: e.paymentDue(), day: Math.min(day, GAME_DAYS), days: GAME_DAYS, time: clockString(frac), frac });
    }
    if (debt > 0 && e.cash < e.paymentDue() && frac > 0.75) ui.tip('cashshort', 'Payment coming up', 'You don\'t have enough cash for tomorrow\'s loan payment, so sell some ore or shares before dawn or the bank will seize items.');

    // compass toward each site
    game.compassT = (game.compassT || 0) - dt;
    if (game.compassT <= 0) {
      game.compassT = 0.2;
      const fwd = Math.atan2(-Math.sin(p.yaw), -Math.cos(p.yaw));
      const pointer = (name, x, z, cls = 'gold') => {
        const dx = x - p.pos.x, dz = z - p.pos.z;
        const d = Math.hypot(dx, dz);
        let rel = Math.atan2(dx, dz) - fwd;
        rel = Math.atan2(Math.sin(rel), Math.cos(rel));
        const idx = ((Math.round(-rel / (Math.PI / 4)) % 8) + 8) % 8;
        return `${name} <span class="${cls}">${d < 12 ? '●' : ARROWS[idx]}</span> ${Math.round(d)}m`;
      };
      const lines = Object.values(SITES).map((s) => pointer(s.name, s.x + 0.5, s.z + 0.5));
      const pile = game.drops.deathPile();
      if (pile) lines.push(pointer('Your items', pile.x, pile.z, 'red'));
      ui.coords(lines.join('<br>') + `<br><span class="gray">depth y=${Math.floor(p.pos.y)}</span>`);
    }
  };
}
