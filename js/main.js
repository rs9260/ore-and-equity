// Ore & Equity — bootstrap, game loop, input and block interaction.
import * as THREE from 'three';
import { B, BLOCKS, I, PICKS, SWORDS, ARMOR_REDUCTION, TIER_NAMES, breakTime, isBlockItem, itemName } from './blocks.js';
import { buildAtlas, buildCrackTextures, blockColor } from './textures.js';
import { World, makeMaterials, SITES, WX, WZ, frame } from './world.js';
import { Player } from './player.js';
import { Sky, clockString } from './sky.js';
import { Audio } from './audio.js';
import { Inventory } from './inventory.js';
import { UI } from './ui.js';
import { Particles, makeBankerModel, animateBanker } from './entities.js';
import { initItemModels, makeItemMesh } from './items3d.js';
import { Drops } from './drops.js';
import { Hand } from './hand.js';
import { installSession } from './session.js';
import { listWorlds, loadWorld, saveWorld, deleteWorld, newWorldId, parseSeed } from './saves.js';

THREE.ColorManagement.enabled = false;

const $ = (id) => document.getElementById(id);
export const DAY_SECONDS = 90;
export const GAME_DAYS = 10;
const REACH = 5;

class Game {
  constructor() {
    this.canvas = $('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.08, 170);
    this.scene.fog = new THREE.Fog(0x86c1f5, 50, 110);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.55);
    this.scene.add(this.ambient);
    this.sunLight = new THREE.DirectionalLight(0xffffff, 0.6);
    this.sunLight.position.set(0.4, 1, 0.3);
    this.scene.add(this.sunLight);

    this.audio = new Audio();
    this.atlas = buildAtlas();
    initItemModels(this.atlas);
    this.renderer.autoClear = false;
    this.hand = new Hand();
    this.view = 0; // 0 first person, 1 third person behind, 2 third person in front (F5)
    this.banker = makeBankerModel();
    this.banker.root.visible = false;
    this.scene.add(this.banker.root);
    this.drops = new Drops(this.scene);
    this.cracks = buildCrackTextures();
    this.mats = makeMaterials(this.atlas);
    this.inv = new Inventory();
    this.ui = new UI(this);
    this.inv.onChange(() => this.ui.renderHotbar());

    this.state = 'title';
    this.mouse = { left: false, right: false };
    this.mining = null;
    this.hp = 20;
    this.lastHurt = -99;
    this.time = 0;

    this.setupHighlight();
    this.bindInput();
    this.bindMenus();
    window.addEventListener('resize', () => this.resize());
    // autosave every 30 s, and whenever the tab is hidden
    setInterval(() => { if (this.state === 'playing' || this.state === 'paused') this.saveNow(); }, 30000);
    document.addEventListener('visibilitychange', () => { if (document.hidden && (this.state === 'playing' || this.state === 'paused')) this.saveNow(); });
    this.last = performance.now();
    this.renderer.setAnimationLoop(() => this.loop());
    window.game = this;
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.hand.resize();
  }

  setupHighlight() {
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004));
    this.outline = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6 }));
    this.outline.visible = false;
    this.scene.add(this.outline);
    // x2 multiply (dst*src + src*dst): grey 128 is invisible, darker cuts in, lighter brightens
    this.crackMat = new THREE.MeshBasicMaterial({
      map: this.cracks[0], transparent: true, alphaTest: 0.5, depthWrite: false, fog: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.SrcColorFactor,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
    this.crack = new THREE.Mesh(new THREE.BoxGeometry(1.003, 1.003, 1.003), this.crackMat);
    this.crack.visible = false;
    this.scene.add(this.crack);
  }

  // ---------- lifecycle ----------
  // meta: { id, name, seed, created } of the world to play; save: its stored data, or null for a new world
  async startGame(meta, save = null) {
    this.state = 'loading';
    this.audio.init();
    $('screen-title').classList.add('hidden');
    $('screen-worlds').classList.add('hidden');
    $('screen-loading').classList.remove('hidden');
    const prog = (p, text) => { $('progress-fill').style.width = (p * 100).toFixed(0) + '%'; if (text) $('loading-text').textContent = text; };
    prog(0, 'Generating terrain…');
    await frame();

    if (this.world) this.disposeWorld();
    this.world = new World(meta.seed, this.scene, this.mats);
    await this.world.generate((p) => prog(p, p < 0.6 ? 'Generating terrain…' : 'Growing trees…'));
    this.afterGenerate?.();
    // the terrain comes back from the seed; then every block you changed is put back on top
    if (save) {
      prog(0.66, 'Loading your changes…');
      const { idx, ids } = save.edits;
      for (let i = 0; i < idx.length; i++) { this.world.data[idx[i]] = ids[i]; this.world.edits.set(idx[i], ids[i]); }
    }
    this.world.computeHeights();
    this.world.computeBlockLight();
    prog(0.7, 'Building chunks…');
    this.world.markAllDirty();
    const total = this.world.pendingChunks();
    const s = SITES.post;
    while (this.world.pendingChunks()) {
      const t0 = performance.now();
      while (this.world.pendingChunks() && performance.now() - t0 < 40) this.world.update(s.x, s.z, 2);
      prog(0.7 + 0.3 * (1 - this.world.pendingChunks() / total));
      await frame();
    }

    this.sky ??= new Sky(this.scene);
    this.particles ??= new Particles(this.scene);
    this.player = new Player(this.world, this.camera);
    this.player.onStep = (id) => this.audio.step(BLOCKS[id].sound);
    this.player.onLand = (d) => { if (d > 3.6) this.damage(Math.floor(d - 3), 'fall'); };
    this.player.onCrash = (d) => { if (d > 0) this.damage(d, 'crash'); };
    this.lastAttack = -10;
    this.respawn();

    this.drops.clear();
    this.view = 0;
    this.inv = new Inventory();
    this.inv.onChange(() => this.ui.renderHotbar());
    this.inv.add(I.WOOD_PICK, 1, false);
    this.inv.add(I.LEDGER, 1, false);
    this.inv.slots[8] = this.inv.slots[1]; this.inv.slots[1] = null; // ledger in slot 9
    this.inv.changed();
    this.hp = 20;
    this.time = 0;
    this.onNewGame?.();
    this.worldMeta = { id: meta.id, name: meta.name, seed: meta.seed, created: meta.created };
    if (save) this.restore(save);

    $('screen-loading').classList.add('hidden');
    $('hud').classList.remove('hidden');
    this.state = 'playing';
    this.ui.renderHotbar();
    this.ui.showHeldName();
    if (save) this.ui.chat(`Welcome back to ${meta.name}!`, '#ffff55');
    else this.ui.chat('Welcome to the valley! Mine ore, trade it, and invest wisely.', '#ffff55');
    this.saveNow();
    this.lock();
  }

  // ---------- saving ----------
  snapshot() {
    const w = this.world, p = this.player;
    const idx = new Uint32Array(w.edits.size), ids = new Uint8Array(w.edits.size);
    let i = 0;
    for (const [k, v] of w.edits) { idx[i] = k; ids[i++] = v; }
    return {
      v: 1, seed: w.seed, edits: { idx, ids },
      player: { pos: [p.pos.x, p.pos.y, p.pos.z], yaw: p.yaw, pitch: p.pitch },
      hp: this.hp, time: this.time,
      inv: { slots: this.inv.slots.map((s) => s && { id: s.id, count: s.count }), selected: this.inv.selected },
      drops: this.drops.list.map((d) => ({ id: d.id, count: d.count, x: d.pos.x, y: d.pos.y, z: d.pos.z, death: d.death, age: d.age })),
      session: this.onSnapshot?.(),
    };
  }

  restore(s) {
    const p = this.player;
    p.spawn(...s.player.pos);
    p.yaw = s.player.yaw; p.pitch = s.player.pitch;
    this.hp = s.hp;
    this.time = s.time;
    this.inv.slots = s.inv.slots.map((x) => x && { ...x });
    this.inv.selected = s.inv.selected;
    this.inv.changed();
    for (const d of s.drops) {
      const nd = this.drops.spawn(d.id, d.count, d.x, d.y, d.z, new THREE.Vector3(), { delay: 0.5, death: d.death });
      if (nd) nd.age = d.age;
    }
    this.onRestore?.(s.session);
  }

  // ended: the 10 days are over, so the world is kept only as a finished result
  async saveNow({ ended = false } = {}) {
    const m = this.worldMeta;
    if (!m || !this.player) return;
    const meta = {
      ...m, played: Date.now(), ended,
      day: Math.min(GAME_DAYS, Math.floor(this.time / DAY_SECONDS) + 1),
      nw: this.econ ? Math.round(this.econ.netWorth(this.inv)) : 0,
    };
    try {
      await saveWorld(meta, this.snapshot());
      $('save-status').textContent = `World saved at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } catch (err) {
      console.warn('Save failed', err);
      $('save-status').textContent = 'Could not save the world!';
    }
  }

  // ---------- world select ----------
  async showWorlds(autoCreate = true) {
    this.audio.init();
    $('screen-title').classList.add('hidden');
    $('screen-worlds').classList.remove('hidden');
    $('world-create').classList.add('hidden');
    $('world-select').classList.remove('hidden');
    let worlds = [];
    try { worlds = await listWorlds(); } catch (err) { console.warn('Could not read saves', err); }
    if (!worlds.length && autoCreate) { this.showCreate(); return; }
    const list = $('world-list');
    $('btn-world-play').disabled = $('btn-world-del').disabled = true;
    $('btn-world-play').textContent = 'Play selected world';
    const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    list.innerHTML = worlds.map((w) => `<div class="world-row" data-id="${w.id}">
        <div class="w-name">${esc(w.name)}</div>
        <div class="w-info">${w.ended ? `Finished · final net worth $${w.nw.toLocaleString()}` : `Day ${w.day}/${GAME_DAYS} · net worth $${w.nw.toLocaleString()}`}</div>
        <div class="w-info gray">Last played ${new Date(w.played).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} · seed ${w.seed}</div>
      </div>`).join('') || '<div class="w-info">No saved worlds yet.</div>';
    let picked = null;
    const pick = (row) => {
      list.querySelectorAll('.world-row').forEach((r) => r.classList.toggle('sel', r === row));
      picked = worlds.find((w) => w.id === row.dataset.id);
      $('btn-world-play').disabled = picked.ended;
      $('btn-world-del').disabled = false;
      $('btn-world-del').textContent = 'Delete';
    };
    list.querySelectorAll('.world-row').forEach((row) => {
      row.onclick = () => { this.audio.click(); pick(row); };
      row.ondblclick = () => { if (!picked.ended) $('btn-world-play').click(); };
    });
    if (worlds.length) pick(list.firstElementChild);
    $('btn-world-play').onclick = async () => {
      this.audio.click();
      let save = null;
      try { save = await loadWorld(picked.id); } catch (err) { console.warn(err); }
      if (!save) { $('btn-world-play').textContent = 'Save is missing'; return; }
      this.startGame(picked, save);
    };
    // deleting asks for a second click
    $('btn-world-del').onclick = async () => {
      const b = $('btn-world-del');
      if (b.textContent === 'Delete') { b.textContent = `Really delete "${picked.name}"?`; return; }
      await deleteWorld(picked.id);
      this.showWorlds();
    };
  }

  showCreate() {
    $('screen-title').classList.add('hidden');
    $('screen-worlds').classList.remove('hidden');
    $('world-select').classList.add('hidden');
    $('world-create').classList.remove('hidden');
    $('world-name').value = 'New World';
    $('world-seed').value = '';
    $('world-name').focus();
    $('world-name').select();
  }

  createWorld() {
    this.audio.click();
    const name = $('world-name').value.trim() || 'New World';
    this.startGame({ id: newWorldId(), name, seed: parseSeed($('world-seed').value), created: Date.now() });
  }

  respawn() {
    const s = SITES.post.spawn ?? { x: SITES.post.x + 0.5, z: SITES.post.z + 4.5 };
    this.player.spawn(s.x, this.world.surfaceY(Math.floor(s.x), Math.floor(s.z)) + 1.01, s.z);
    this.player.yaw = 0; this.player.pitch = 0;
  }

  disposeWorld() {
    for (const e of this.world.chunks.values()) for (const m of [e.solid, e.water]) if (m) { this.scene.remove(m); m.geometry.dispose(); }
    this.drops.clear();
    this.onDisposeWorld?.();
  }

  lock() {
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => { if (this.state === 'playing' && !this.ui.panelOpen) this.pause(); });
    } catch { /* ignore */ }
  }
  get locked() { return document.pointerLockElement === this.canvas; }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    $('screen-pause').classList.remove('hidden');
    this.saveNow();
    this.mouse.left = this.mouse.right = false;
  }
  resume() {
    $('screen-pause').classList.add('hidden');
    this.state = 'playing';
    this.lock();
  }

  openPanel(kind, render) {
    this.ui.openPanel(kind, render);
    this.mouse.left = this.mouse.right = false;
    this.mining = null;
    if (this.locked) document.exitPointerLock();
  }
  closePanel(relock = true) {
    if (!this.ui.panelOpen) return;
    this.ui.closePanel();
    this.audio.click();
    if (relock && this.state === 'playing') this.lock();
  }

  // ---------- input ----------
  bindInput() {
    // Ctrl sprints, so swallow browser shortcuts like Ctrl+S / Ctrl+D while playing
    // (Ctrl+W can't be blocked; the leave-page prompt below catches it instead).
    window.addEventListener('beforeunload', (e) => {
      if (this.state === 'playing' || this.state === 'paused') { this.saveNow(); e.preventDefault(); e.returnValue = ''; }
    });
    window.addEventListener('keydown', (e) => {
      if (this.state === 'title' || this.state === 'loading' || this.state === 'ended') return;
      if (e.ctrlKey || e.code === 'F5') e.preventDefault();
      if (e.code === 'KeyM') { this.audio.toggleMute(); return; }
      if (this.ui.currentTip && e.code === 'Enter') { this.ui.dismissTip(); return; }
      if (this.state !== 'playing') return;
      if (this.ui.panelOpen) {
        if (e.code === 'Escape' || e.code === 'KeyE' || (e.code === 'KeyL' && this.ui.panelOpen === 'ledger')) { e.preventDefault(); this.closePanel(); }
        return;
      }
      this.player.keys[e.code] = true;
      if (e.code.startsWith('Digit')) {
        const n = +e.code.slice(5);
        if (n >= 1 && n <= 9) { this.inv.selected = n - 1; this.ui.renderHotbar(); this.ui.showHeldName(); }
      }
      if (e.code === 'KeyE') this.openPanel('inventory', (el) => this.ui.renderInventory(el));
      if (e.code === 'KeyL') this.openLedger?.();
      if (e.code === 'KeyQ') this.dropHeld(e.ctrlKey);
      if (e.code === 'F5') this.view = (this.view + 1) % 3;
      if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
      if (e.code === 'Space' && !e.repeat) {
        const p = this.player;
        if (p.gliding) p.endGlide();
        else if (p.tryGlide()) this.audio.wingsOpen();
        else if (p.hasWings && !p.onGround && !p.inWater && p.glideCd > 0) this.ui.hint(`Wings ready in ${p.glideCd.toFixed(1)} s`);
      }
    });
    window.addEventListener('keyup', (e) => { if (this.player) this.player.keys[e.code] = false; });
    window.addEventListener('blur', () => { if (this.player) this.player.keys = {}; this.mouse.left = this.mouse.right = false; });

    document.addEventListener('pointerlockchange', () => {
      if (!this.locked) {
        if (this.player) this.player.keys = {};
        this.mouse.left = this.mouse.right = false;
        if (this.state === 'playing' && !this.ui.panelOpen) this.pause();
      }
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked || this.state !== 'playing') return;
      // Chrome occasionally reports a huge jump right after pointer lock; drop those
      if (Math.abs(e.movementX) > 250 || Math.abs(e.movementY) > 250) return;
      this.player.look(e.movementX, e.movementY, this.sens);
    });
    this.canvas.addEventListener('mousedown', (e) => {
      if (this.state !== 'playing' || this.ui.panelOpen) return;
      if (!this.locked) { this.lock(); return; }
      if (e.button === 0) { this.mouse.left = true; this.attackOrStartMine(); }
      if (e.button === 2) { this.mouse.right = true; this.useItem(); this.nextUse = performance.now() + 260; }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) { this.mouse.left = false; this.mining = null; }
      if (e.button === 2) this.mouse.right = false;
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('wheel', (e) => {
      if (this.state !== 'playing' || this.ui.panelOpen || !this.locked) return;
      this.inv.selected = (this.inv.selected + (e.deltaY > 0 ? 1 : 8)) % 9;
      this.ui.renderHotbar(); this.ui.showHeldName();
    }, { passive: true });
  }

  bindMenus() {
    const muteLabel = () => ['btn-mute-title', 'btn-mute-pause'].forEach((id) => ($(id).textContent = 'Sound: ' + (this.audio.muted ? 'Off' : 'On')));
    muteLabel();
    this.audio.onMute((m) => { muteLabel(); if (this.ui) this.ui.chat(m ? 'Sound muted (M)' : 'Sound on (M)', '#aaa'); });
    $('btn-play').onclick = () => { this.audio.click(); this.showWorlds(); };
    $('btn-world-new').onclick = () => { this.audio.click(); this.showCreate(); };
    $('btn-world-back').onclick = () => { this.audio.click(); $('screen-worlds').classList.add('hidden'); $('screen-title').classList.remove('hidden'); };
    $('btn-create').onclick = () => this.createWorld();
    $('btn-create-cancel').onclick = () => { this.audio.click(); this.showWorlds(false); };
    for (const id of ['world-name', 'world-seed']) $(id).addEventListener('keydown', (e) => { if (e.code === 'Enter') this.createWorld(); });
    $('btn-how').onclick = () => { this.audio.init(); this.audio.click(); $('how').classList.toggle('hidden'); $('scores').classList.add('hidden'); };
    $('btn-how-close').onclick = () => $('how').classList.add('hidden');
    $('btn-scores').onclick = () => { this.audio.init(); this.audio.click(); this.showScores?.(); $('scores').classList.toggle('hidden'); $('how').classList.add('hidden'); };
    $('btn-scores-close').onclick = () => $('scores').classList.add('hidden');
    $('btn-mute-title').onclick = () => { this.audio.init(); this.audio.toggleMute(); };
    $('btn-mute-pause').onclick = () => this.audio.toggleMute();
    const sliders = ['sens-title', 'sens-pause'].map($);
    const setSens = (pct) => {
      this.sens = pct / 100;
      sliders.forEach((s) => { s.value = pct; s.nextElementSibling.textContent = `Mouse sensitivity: ${pct}%`; });
      try { localStorage.setItem('oe_sens', pct); } catch {}
    };
    let saved = 100;
    try { saved = +localStorage.getItem('oe_sens') || 100; } catch {}
    setSens(saved);
    sliders.forEach((s) => (s.oninput = () => setSens(+s.value)));
    $('btn-resume').onclick = () => this.resume();
    $('btn-quit').onclick = () => this.toTitle();
    $('btn-save').onclick = () => { this.audio.click(); this.saveNow(); };
  }

  toTitle() {
    if (this.state === 'playing' || this.state === 'paused') this.saveNow();
    this.state = 'title';
    $('screen-pause').classList.add('hidden');
    $('screen-end').classList.add('hidden');
    $('hud').classList.add('hidden');
    $('screen-title').classList.remove('hidden');
    if (this.locked) document.exitPointerLock();
  }

  // ---------- interaction ----------
  target() {
    if (!this.player) return null;
    return this.world.raycast(this.player.eye(), this.player.forward(), REACH);
  }

  // 0..1: how recovered your swing is since the last hit on a creature
  attackCooldown() {
    const held = this.inv.held();
    return SWORDS[held] ? 0.6 : PICKS[held] ? 0.85 : 0.5;
  }
  attackCharge() { return Math.min(1, (this.time - this.lastAttack) / this.attackCooldown()); }

  attackOrStartMine() {
    this.hand.swing();
    if (this.tryAttack?.()) { this.mouse.left = false; return; }
    this.mining = null;
  }

  updateMining(dt, hit) {
    if (!this.mouse.left || !hit) { this.mining = null; this.crack.visible = false; return; }
    const held = this.inv.held();
    const t = breakTime(hit.id, held);
    const b = BLOCKS[hit.id];
    if (t === Infinity) {
      this.crack.visible = false;
      if (b.hardness === Infinity) this.ui.hint(`${b.name} can't be broken`);
      else {
        this.ui.hint(`Needs ${TIER_NAMES[b.tier]} to mine ${b.name}`);
        this.ui.tip?.('tier' + b.tier, 'Pickaxe tiers', `${b.name} needs ${TIER_NAMES[b.tier]}. Craft one (E) or buy one from the Merchant at the Trading Post.`);
      }
      return;
    }
    const m = this.mining;
    if (!m || m.x !== hit.x || m.y !== hit.y || m.z !== hit.z) {
      this.mining = { x: hit.x, y: hit.y, z: hit.z, p: 0, nextHit: 0 };
      return;
    }
    m.p += dt / t;
    m.nextHit -= dt;
    if (m.nextHit <= 0) { this.audio.hit(b.sound); m.nextHit = 0.24; }
    if (m.p >= 1) {
      this.breakBlock(hit.x, hit.y, hit.z);
      this.mining = null;
      this.crack.visible = false;
      return;
    }
    this.crack.visible = true;
    this.crack.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    this.crackMat.map = this.cracks[Math.min(9, Math.floor(m.p * 10))];
  }

  breakBlock(x, y, z) {
    const w = this.world;
    const id = w.get(x, y, z);
    const b = BLOCKS[id];
    w.set(x, y, z, B.AIR);
    // plants on top pop off with it
    const above = w.get(x, y + 1, z);
    if (BLOCKS[above]?.cross) w.set(x, y + 1, z, B.AIR);
    this.audio.breakBlock(b.sound);
    this.particles.burst(x, y, z, blockColor(id), 14);
    if (b.drop) {
      this.drops.spawn(b.drop, 1, x + 0.5, y + 0.3, z + 0.5, null, { delay: 0.25 });
      this.onMined?.(b.drop, id);
    }
  }

  // Q drops one of the held item (Ctrl+Q the whole stack), thrown forwards.
  dropHeld(all) {
    const s = this.inv.slots[this.inv.selected];
    if (!s) return;
    const n = all ? s.count : 1;
    const id = s.id;
    s.count -= n;
    if (s.count <= 0) this.inv.slots[this.inv.selected] = null;
    this.inv.changed();
    const eye = this.player.eye(), fwd = this.player.forward();
    const vel = fwd.clone().multiplyScalar(5.5); vel.y += 1.6;
    this.drops.spawn(id, n, eye.x + fwd.x * 0.4, eye.y - 0.35, eye.z + fwd.z * 0.4, vel, { delay: 1.5 });
    this.audio.toss();
    this.hand.swing();
  }

  useItem() {
    if (this.tryInteract?.()) return;
    const held = this.inv.held();
    if (held === I.LEDGER) { this.openLedger?.(); return; }
    if (!isBlockItem(held)) return;
    const hit = this.target();
    if (!hit) return;
    const b = BLOCKS[hit.id];
    let x = hit.x + hit.nx, y = hit.y + hit.ny, z = hit.z + hit.nz;
    if (b.cross) { x = hit.x; y = hit.y; z = hit.z; }
    const cur = this.world.get(x, y, z);
    if (cur !== B.AIR && cur !== B.WATER && cur !== B.LAVA && !BLOCKS[cur].cross) return;
    if (!this.world.inBounds(x, y, z)) return;
    const nb = BLOCKS[held];
    if (nb.solid && this.player.overlapsBlock(x, y, z)) return;
    if (this.blockedByEntity?.(x, y, z)) return;
    if (nb.cross && !BLOCKS[this.world.get(x, y - 1, z)]?.solid) return;
    this.world.set(x, y, z, held);
    this.inv.consumeHeld();
    this.audio.place(nb.sound);
    this.hand.swing();
  }

  damage(n, source) {
    if (this.state !== 'playing') return;
    // armor softens hits from creatures as long as it's in your inventory
    if (source === 'mob' && this.inv.count(I.IRON_ARMOR)) n = Math.max(1, Math.round(n * (1 - ARMOR_REDUCTION)));
    this.hp = Math.max(0, this.hp - n);
    this.lastHurt = this.time;
    this.audio.hurt();
    this.ui.hurtFlash();
    if (this.hp <= 0) this.die(source);
  }
  die(source) {
    this.ui.chat({ mob: 'You were knocked out!', lava: 'You fell into lava!', crash: 'You flew into a wall!' }[source] ?? 'You blacked out!', '#ff5555');
    // everything you carry (but the ledger) spills out where you fell
    const p = this.player;
    const at = p.inLava && p.lastSafe ? p.lastSafe : p.pos;
    let dropped = 0;
    for (let i = 0; i < this.inv.slots.length; i++) {
      const s = this.inv.slots[i];
      if (!s || s.id === I.LEDGER) continue;
      const vel = new THREE.Vector3((Math.random() - 0.5) * 4, 3 + Math.random() * 2, (Math.random() - 0.5) * 4);
      this.drops.spawn(s.id, s.count, at.x, at.y + 0.8, at.z, vel, { delay: 2, death: true });
      this.inv.slots[i] = null;
      dropped++;
    }
    this.inv.changed();
    this.onDeath?.(dropped, at);
    this.hp = 20;
    this.respawn();
  }

  // ---------- frame ----------
  loop() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    // the world only runs while you're actually playing: menus, trade screens and the pause screen freeze it
    const running = this.state === 'playing' && !this.ui.panelOpen;
    if (this.state === 'playing' || this.state === 'paused') this.tick(running ? dt : 0);
    if (this.world) {
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
      if (this.view === 0 && this.player && (this.state === 'playing' || this.state === 'paused')) this.hand.render(this.renderer);
    }
  }

  // F5 views: pull the camera back (or round to the front) without passing through blocks.
  placeCamera() {
    const p = this.player;
    this.banker.root.visible = this.view > 0;
    if (this.view === 0) return;
    const eye = p.eye(), fwd = p.forward();
    const dir = this.view === 1 ? fwd.clone().negate() : fwd;
    let d = 4;
    for (let s = 0.3; s <= 4; s += 0.1) {
      const q = eye.clone().addScaledVector(dir, s);
      if (this.world.isSolid(q.x, q.y, q.z)) { d = Math.max(0.3, s - 0.35); break; }
    }
    this.camera.position.copy(eye).addScaledVector(dir, d);
    this.camera.lookAt(eye);
  }

  updateBody(dt) {
    const p = this.player, m = this.banker;
    m.root.position.set(p.pos.x, p.pos.y, p.pos.z);
    m.root.rotation.y = p.yaw + Math.PI;
    this.walkPhase = (this.walkPhase || 0) + (p.speed || 0) * dt * 2.2;
    animateBanker(m, { speed: p.gliding ? 0 : p.speed || 0, phase: this.walkPhase, pitch: p.pitch, swing: this.hand.swingT, sneak: p.sneaking, wings: p.hasWings, gliding: p.gliding });
    // gliding: lie flat along the flight path, pivoting round the middle of the body
    m.root.rotation.order = 'YXZ';
    m.root.rotation.x = p.gliding ? Math.PI / 2 - 0.25 - p.pitch * 0.6 : 0;
    if (p.gliding) {
      const mid = new THREE.Vector3(0, 0.9, 0);
      m.root.position.add(mid.clone().sub(mid.clone().applyEuler(m.root.rotation)));
    }
    const held = this.inv.held();
    if (held !== m.heldId) {
      m.heldId = held;
      m.hand.clear();
      m.holding = !!held && held !== I.LEDGER;
      if (held) {
        const it = makeItemMesh(held);
        it.scale.setScalar(it.userData.cube ? 0.26 : 0.5);
        if (!it.userData.cube) { it.rotation.set(-Math.PI / 2, 0, Math.PI / 4); it.position.set(0, -0.05, 0.12); }
        m.hand.add(it);
      }
    }
  }

  tick(dt) {
    const p = this.player;
    const active = this.state === 'playing' && !this.ui.panelOpen && this.locked;
    if (dt > 0) {
      this.time += dt;
      p.hasWings = this.inv.count(I.WINGS) > 0;
      p.update(dt, active);
    }
    this.ui.meters?.(this.attackCharge(), p.hasWings && !p.gliding && p.glideCd > 0 ? 1 - p.glideCd / 3 : 1);
    this.placeCamera();
    if (dt > 0 && p.inLava) {
      this.lavaT = (this.lavaT || 0) - dt;
      if (this.lavaT <= 0) { this.lavaT = 0.5; this.audio.sizzle(); this.damage(4, 'lava'); }
    }
    $('lava-overlay').style.display = p.headInLava ? 'block' : 'none';
    const frac = (this.time % DAY_SECONDS) / DAY_SECONDS;
    const daylight = this.sky.update(frac, this.camera.position, dt, Math.floor(this.time / DAY_SECONDS) + 1);
    for (const m of [this.mats.solid, this.mats.water]) {
      m.uniforms.uDay.value = daylight;
      m.uniforms.uPlayer.value.copy(this.camera.position);
      m.uniforms.uTorch.value = 0.95;
      m.uniforms.fogColor.value.copy(this.sky.skyColor);
    }
    this.scene.background = this.sky.skyColor;
    this.scene.fog.color.copy(this.sky.skyColor);
    this.sunLight.intensity = 0.15 + 0.5 * daylight;
    this.ambient.intensity = 0.2 + 0.45 * daylight;
    this.audio.setNight(this.sky.night);
    this.ui.water(p.headInWater);

    this.world.update(p.pos.x, p.pos.z, 2);
    this.particles.update(dt, this.world);
    this.drops.update(dt, this.world, p, this.inv, {
      picked: () => this.audio.pop(),
      burned: () => this.audio.sizzle(),
    });
    // held item: first person viewmodel and the third-person body
    this.hand.setItem(this.inv.held());
    if (dt > 0 && this.mouse.left && active && (this.mining || this.hoverHit)) this.hand.swing();
    const e = p.eye();
    const light = Math.max(this.world.skyAt(Math.floor(e.x), Math.floor(e.y), Math.floor(e.z)) * daylight, this.world.blockLightAt(Math.floor(e.x), Math.floor(e.y), Math.floor(e.z)), 0.55);
    this.hand.update(dt, { bob: p.bob * 2, speed: p.onGround ? (p.speed || 0) : 0, light });
    this.updateBody(dt);

    const hit = active ? this.target() : null;
    this.hoverHit = hit;
    if (hit) {
      this.outline.visible = true;
      this.outline.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    } else this.outline.visible = false;
    this.ui.hint('');
    if (dt > 0 && active) this.updateMining(dt, hit);
    else this.crack.visible = false;
    if (active && this.mouse.right && performance.now() > this.nextUse) { this.useItem(); this.nextUse = performance.now() + 230; }

    // regen
    if (dt > 0 && this.hp < 20 && this.time - this.lastHurt > 6) {
      this.regenAcc = (this.regenAcc || 0) + dt;
      if (this.regenAcc > 2.5) { this.hp++; this.regenAcc = 0; }
    }
    this.ui.renderHearts(this.hp);
    this.onTick?.(dt, frac, hit, active);
    if (!this.onTick) {
      this.ui.stats({ cash: 0, nw: 0, debt: 0, payment: 0, day: Math.floor(this.time / DAY_SECONDS) + 1, days: GAME_DAYS, time: clockString(frac), frac });
    }
  }
}

export const game = new Game();
installSession(game, { DAY_SECONDS, GAME_DAYS });
