// HUD, hotbar, chat, toasts, first-time tips, inventory screen and generic modal panel.
import { itemIcon, tileCanvas } from './textures.js';
import { itemName, stackSize } from './blocks.js';
import { RECIPES } from './inventory.js';

const $ = (id) => document.getElementById(id);
export const money = (v, dec = 0) => {
  const neg = v < 0; v = Math.abs(v);
  const s = v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return (neg ? '-$' : '$') + s;
};

function heartCanvas(state) {
  const c = document.createElement('canvas');
  c.width = c.height = 9;
  const g = c.getContext('2d');
  const shape = ['.##...##.', '#########', '#########', '#########', '.#######.', '..#####..', '...###...', '....#....'];
  shape.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch !== '#') return;
    const edge = y === 0 || x === 0 || x === 8 || shape[y - 1]?.[x] !== '#' || row[x - 1] !== '#' || row[x + 1] !== '#' || shape[y + 1]?.[x] !== '#';
    let col = '#2a0a0a';
    if (!edge) {
      const filled = state === 2 || (state === 1 && x < 5);
      col = filled ? (y < 3 && x < 4 ? '#ff9a9a' : '#e01818') : '#3a1414';
    }
    g.fillStyle = col; g.fillRect(x, y + 1, 1, 1);
  }));
  return c.toDataURL();
}
const HEARTS = [heartCanvas(0), heartCanvas(1), heartCanvas(2)];

export class UI {
  constructor(game) {
    this.g = game;
    this.tipQueue = [];
    this.seenTips = {};
    try { this.seenTips = JSON.parse(localStorage.getItem('oe_tips') || '{}'); } catch {}
    this.cursor = null; // item held by the mouse in inventory screens
    this.panelOpen = null;
    this.buildHotbar();
    this.buildHearts();
    const dirt = tileCanvas('dirt');
    if (dirt) document.querySelectorAll('.title-bg').forEach((el) => (el.style.backgroundImage = `url(${dirt.toDataURL()})`));
    $('tip').addEventListener('click', () => this.dismissTip());
    this.cursorEl = document.createElement('div'); this.cursorEl.id = 'cursor-item'; document.body.appendChild(this.cursorEl);
    this.tooltipEl = document.createElement('div'); this.tooltipEl.id = 'tooltip'; this.tooltipEl.className = 'hidden'; document.body.appendChild(this.tooltipEl);
    window.addEventListener('mousemove', (e) => {
      this.cursorEl.style.left = e.clientX + 'px'; this.cursorEl.style.top = e.clientY + 'px';
      this.tooltipEl.style.left = e.clientX + 14 + 'px'; this.tooltipEl.style.top = e.clientY - 28 + 'px';
    });
  }

  // ---------- HUD ----------
  buildHotbar() {
    const hb = $('hotbar');
    hb.innerHTML = '';
    this.hbSlots = [];
    for (let i = 0; i < 9; i++) {
      const d = document.createElement('div');
      d.className = 'hb-slot';
      d.innerHTML = `<span class="hb-key">${i + 1}</span><img alt=""><span class="count"></span>`;
      hb.appendChild(d);
      this.hbSlots.push(d);
    }
  }
  renderHotbar() {
    const inv = this.g.inv;
    for (let i = 0; i < 9; i++) {
      const s = inv.slots[i], el = this.hbSlots[i];
      el.classList.toggle('sel', i === inv.selected);
      const img = el.querySelector('img');
      if (s) { img.src = itemIcon(s.id); img.style.visibility = 'visible'; } else img.style.visibility = 'hidden';
      el.querySelector('.count').textContent = s && s.count > 1 ? s.count : '';
    }
  }
  showHeldName() {
    const id = this.g.inv.held();
    const el = $('held-name');
    el.textContent = id ? itemName(id) : '';
    el.style.opacity = 1;
    clearTimeout(this.heldTimer);
    this.heldTimer = setTimeout(() => (el.style.opacity = 0), 1800);
  }
  buildHearts() {
    this.heartImgs = [];
    const h = $('hearts');
    for (let i = 0; i < 10; i++) { const im = document.createElement('img'); h.appendChild(im); this.heartImgs.push(im); }
    this.lastHp = -1;
  }
  renderHearts(hp) {
    if (hp === this.lastHp) return;
    this.lastHp = hp;
    for (let i = 0; i < 10; i++) {
      const v = hp - i * 2;
      this.heartImgs[i].src = HEARTS[v >= 2 ? 2 : v === 1 ? 1 : 0];
      this.heartImgs[i].style.width = this.heartImgs[i].style.height = '18px';
      this.heartImgs[i].style.imageRendering = 'pixelated';
    }
  }
  stats({ cash, nw, debt, day, days, time, frac, payment }) {
    $('s-cash').textContent = money(cash);
    $('s-nw').textContent = money(nw);
    $('s-nw').className = 'val ' + (nw >= 0 ? 'green' : 'red');
    $('s-day').textContent = `Day ${Math.min(day, days)}/${days}`;
    $('s-time').textContent = time;
    $('daybar-fill').style.width = (frac * 100).toFixed(1) + '%';
    $('s-debt-row').classList.toggle('hidden', debt <= 0.5);
    $('s-debt').textContent = money(debt);
    const banner = $('debt-banner');
    if (debt > 0.5) {
      banner.classList.remove('hidden');
      banner.innerHTML = `Loan payment due at dawn: <b class="gold">${money(payment)}</b>${cash < payment ? '<br><span class="red">Not enough cash! The bank will seize items.</span>' : ''}`;
    } else banner.classList.add('hidden');
  }
  coords(text) { $('coords').innerHTML = text; }
  hint(text) { const h = $('hint'); if (h.textContent !== text) h.textContent = text || ''; }

  chat(html, color = '#fff') {
    const line = document.createElement('div');
    line.className = 'chat-line';
    line.style.color = color;
    line.innerHTML = html;
    const c = $('chat');
    c.appendChild(line);
    while (c.children.length > 7) c.removeChild(c.firstChild);
    setTimeout(() => line.classList.add('fade'), 9000);
    setTimeout(() => line.remove(), 10200);
  }

  toast(title, body, iconId) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `${iconId ? `<img class="t-icon" src="${itemIcon(iconId)}">` : ''}<div class="t-title">${title}</div><div>${body}</div>`;
    $('toasts').appendChild(t);
    setTimeout(() => t.classList.add('out'), 4200);
    setTimeout(() => t.remove(), 4700);
  }

  // First-time one-sentence explainers.
  tip(key, title, body) {
    if (this.seenTips[key] || this.tipQueue.some((t) => t.key === key) || this.currentTip?.key === key) return;
    this.tipQueue.push({ key, title, body });
    if (!this.currentTip) this.nextTip();
  }
  nextTip() {
    const t = this.tipQueue.shift();
    this.currentTip = t || null;
    if (!t) { $('tip').classList.add('hidden'); return; }
    $('tip').querySelector('.tip-title').textContent = '💡 ' + t.title;
    $('tip').querySelector('.tip-body').textContent = t.body;
    $('tip').classList.remove('hidden');
    clearTimeout(this.tipTimer);
    this.tipTimer = setTimeout(() => this.dismissTip(), 11000);
  }
  dismissTip() {
    if (!this.currentTip) return;
    this.seenTips[this.currentTip.key] = 1;
    try { localStorage.setItem('oe_tips', JSON.stringify(this.seenTips)); } catch {}
    this.nextTip();
  }
  resetTips() { this.seenTips = {}; try { localStorage.removeItem('oe_tips'); } catch {} }

  hurtFlash() {
    const o = $('hurt-overlay');
    o.style.transition = 'none'; o.style.opacity = 1;
    requestAnimationFrame(() => { o.style.transition = 'opacity 0.5s'; o.style.opacity = 0; });
  }
  // little bars under the crosshair: swing recovery and wing cooldown (hidden when full)
  meters(attack, wings) {
    for (const [id, v] of [['attack-meter', attack], ['wing-meter', wings]]) {
      const el = $(id);
      el.style.display = v < 1 ? 'block' : 'none';
      el.firstChild.style.width = `${Math.round(v * 100)}%`;
    }
  }
  water(on) { $('water-overlay').style.display = on ? 'block' : 'none'; }
  fade(on) { $('fade').style.opacity = on ? 1 : 0; }

  // ---------- generic panel ----------
  openPanel(kind, render) {
    this.panelOpen = kind;
    this.panelRender = render;
    $('panel').classList.remove('hidden');
    this.refreshPanel();
  }
  refreshPanel() {
    if (!this.panelOpen) return;
    const inner = $('panel-inner');
    const scroll = inner.scrollTop;
    inner.className = 'mc-panel';
    inner.innerHTML = '';
    this.panelRender(inner);
    const x = document.createElement('button');
    x.className = 'close-x'; x.textContent = '✕'; x.title = 'Close (Esc)';
    x.onclick = () => this.g.closePanel();
    inner.appendChild(x);
    inner.scrollTop = scroll;
  }
  closePanel() {
    if (this.cursor) { this.g.inv.add(this.cursor.id, this.cursor.count); this.cursor = null; this.renderCursor(); }
    this.panelOpen = null;
    $('panel').classList.add('hidden');
    this.tooltipEl.classList.add('hidden');
  }

  // ---------- inventory screen ----------
  slotEl(i) {
    const inv = this.g.inv;
    const s = inv.slots[i];
    const d = document.createElement('div');
    d.className = 'slot';
    if (s) d.innerHTML = `<img src="${itemIcon(s.id)}"><span class="count">${s.count > 1 ? s.count : ''}</span>`;
    d.onmousedown = (e) => { e.preventDefault(); this.clickSlot(i, e.button === 2); };
    d.oncontextmenu = (e) => e.preventDefault();
    d.onmouseenter = () => { if (s) { this.tooltipEl.textContent = itemName(s.id); this.tooltipEl.classList.remove('hidden'); } };
    d.onmouseleave = () => this.tooltipEl.classList.add('hidden');
    return d;
  }
  clickSlot(i, right) {
    const inv = this.g.inv;
    const s = inv.slots[i];
    const c = this.cursor;
    if (!c && s) {
      if (right && s.count > 1) { const half = Math.ceil(s.count / 2); this.cursor = { id: s.id, count: half }; s.count -= half; }
      else { this.cursor = s; inv.slots[i] = null; }
    } else if (c && !s) {
      if (right) { inv.slots[i] = { id: c.id, count: 1 }; if (--c.count <= 0) this.cursor = null; }
      else { inv.slots[i] = c; this.cursor = null; }
    } else if (c && s) {
      if (c.id === s.id) {
        const max = stackSize(s.id);
        const k = right ? Math.min(1, max - s.count) : Math.min(c.count, max - s.count);
        s.count += k; c.count -= k;
        if (c.count <= 0) this.cursor = null;
      } else { inv.slots[i] = c; this.cursor = s; }
    }
    this.g.audio.click();
    this.renderCursor();
    inv.changed();
    this.refreshPanel();
  }
  renderCursor() {
    this.cursorEl.innerHTML = this.cursor ? `<img src="${itemIcon(this.cursor.id)}"><span class="count">${this.cursor.count > 1 ? this.cursor.count : ''}</span>` : '';
  }

  renderInventory(el) {
    const inv = this.g.inv;
    const wrap = document.createElement('div');
    wrap.className = 'inv-wrap';
    const left = document.createElement('div');
    left.innerHTML = '<h2>Inventory</h2>';
    const main = document.createElement('div'); main.className = 'grid9';
    for (let i = 9; i < 36; i++) main.appendChild(this.slotEl(i));
    const hot = document.createElement('div'); hot.className = 'grid9'; hot.style.marginTop = '10px';
    for (let i = 0; i < 9; i++) hot.appendChild(this.slotEl(i));
    left.append(main, hot);
    const note = document.createElement('div'); note.className = 'note';
    note.textContent = 'Click to pick up / place. Right-click to split a stack.';
    left.appendChild(note);

    const right = document.createElement('div');
    right.innerHTML = '<h2>Crafting</h2>';
    const list = document.createElement('div'); list.className = 'recipes';
    for (const r of RECIPES) {
      const ok = inv.canCraft(r);
      const row = document.createElement('div');
      row.className = 'recipe' + (ok ? '' : ' no');
      row.innerHTML = r.in.map(([id, n]) => `<img src="${itemIcon(id)}" title="${itemName(id)}">${n}`).join(' + ') +
        `<span class="arrow">→</span><img src="${itemIcon(r.out[0])}">${r.out[1] > 1 ? r.out[1] + '× ' : ''}${itemName(r.out[0])}`;
      if (ok) row.onclick = () => { inv.craft(r); this.g.audio.pop(); this.g.onCrafted?.(r); this.refreshPanel(); };
      list.appendChild(row);
    }
    right.appendChild(list);
    const n2 = document.createElement('div'); n2.className = 'note';
    n2.innerHTML = 'Crafting with ore uses it up, so you can\'t sell it.<br>Better pickaxes unlock deeper ore.';
    right.appendChild(n2);
    wrap.append(left, right);
    el.appendChild(wrap);
  }
}
