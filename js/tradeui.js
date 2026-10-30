// Economy screens: merchant, bankers, quartermasters, market board, ledger, end screen.
import { itemIcon } from './textures.js';
import { I, ITEMS, PICKS, SWORDS, ARMOR_REDUCTION } from './blocks.js';
import { ORE_KEYS, ORE_INFO, VILLAGE_KEYS, VILLAGE_INFO, TOOL_PRICES, LOAN_RATE, MIN_PAYMENT } from './economy.js';
import { money } from './ui.js';

const pct = (x) => (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const arrow = (x) => (x > 0.0005 ? '<span class="up">▲</span>' : x < -0.0005 ? '<span class="down">▼</span>' : '<span class="flat">■</span>');
const cls = (x) => (x > 0.0005 ? 'up' : x < -0.0005 ? 'down' : 'flat');
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };

// Small line chart on a canvas. `values` oldest -> newest.
export function chart(values, w, h, { color, fill = true, labels = false, grid = false, bg = null } = {}) {
  const c = document.createElement('canvas');
  const dpr = 2;
  c.width = w * dpr; c.height = h * dpr;
  c.style.width = w + 'px'; c.style.height = h + 'px';
  c.className = 'mini-chart';
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  if (values.length < 2) values = [values[0] ?? 0, values[0] ?? 0];
  const pad = labels ? 26 : 3;
  let lo = Math.min(...values), hi = Math.max(...values);
  if (hi - lo < 1e-6) { hi += 1; lo -= 1; }
  const span = hi - lo;
  lo -= span * 0.1; hi += span * 0.1;
  const X = (i) => pad + (i / (values.length - 1)) * (w - pad - 3);
  const Y = (v) => 3 + (1 - (v - lo) / (hi - lo)) * (h - 6 - (labels ? 10 : 0));
  const up = values[values.length - 1] >= values[0];
  const col = color || (up ? '#1e9a1e' : '#c02626');
  if (grid) {
    g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 1;
    for (let k = 0; k <= 3; k++) { const y = 3 + k * (h - 16) / 3; g.beginPath(); g.moveTo(pad, y); g.lineTo(w - 3, y); g.stroke(); }
  }
  if (labels) {
    g.fillStyle = '#5a4a30'; g.font = '10px Minecraftia, monospace';
    // +5: Minecraftia draws half an em above the baseline
    g.fillText(money(hi - span * 0.1), 0, 15); g.fillText(money(lo + span * 0.1), 0, h - 9);
  }
  // baseline at first value
  g.strokeStyle = 'rgba(0,0,0,0.25)'; g.setLineDash([3, 3]); g.beginPath();
  g.moveTo(pad, Y(values[0])); g.lineTo(w - 3, Y(values[0])); g.stroke(); g.setLineDash([]);
  g.beginPath();
  values.forEach((v, i) => (i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v))));
  if (fill) {
    g.save(); g.lineTo(X(values.length - 1), h); g.lineTo(X(0), h); g.closePath();
    g.fillStyle = col + '33'; g.fill(); g.restore();
    g.beginPath(); values.forEach((v, i) => (i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v))));
  }
  g.strokeStyle = col; g.lineWidth = 2; g.stroke();
  g.fillStyle = col; g.beginPath(); g.arc(X(values.length - 1), Y(values[values.length - 1]), 2.5, 0, 7); g.fill();
  return c;
}

function healthBar(hp) {
  const col = hp > 66 ? '#3fae3f' : hp > 33 ? '#d9a62a' : '#c83a3a';
  return `<span class="healthbar"><div style="width:${hp.toFixed(0)}%;background:${col}"></div></span> ${hp.toFixed(0)}/100`;
}

function btn(label, onClick, { disabled = false, cls: c = '' } = {}) {
  const b = document.createElement('button');
  b.className = 'mc-btn tiny ' + c;
  b.textContent = label;
  b.disabled = disabled;
  b.onclick = (e) => { e.stopPropagation(); onClick(); };
  return b;
}

// Folder-style tabs: the open tab joins the framed page below it. Returns that page to fill.
function tabs(el, list, cur, onPick) {
  const t = document.createElement('div');
  t.className = 'tabs';
  for (const [k, label, icon] of list) {
    const b = document.createElement('button');
    b.className = 'tab' + (k === cur ? ' on' : '');
    b.innerHTML = `${icon ? `<img src="${itemIcon(icon)}">` : ''}<span>${label}</span>`;
    if (k !== cur) b.onclick = () => onPick(k);
    t.appendChild(b);
  }
  el.appendChild(t);
  const body = document.createElement('div');
  body.className = 'tab-body';
  el.appendChild(body);
  return body;
}

function cashLine(game) {
  const e = game.econ;
  return h(`<div class="cash-line">Cash: <b>${money(e.cash, 2)}</b> &nbsp;·&nbsp; Net worth: <b>${money(e.netWorth(game.inv))}</b>${e.debt > 0 ? ` &nbsp;·&nbsp; Debt: <b class="down">${money(e.debt)}</b>` : ''}</div>`);
}

// ---------- Merchant ----------
export function openMerchant(game, tab = 'sell') {
  const e = game.econ;
  game.ui.tip('market', 'Ore market', 'Ore prices change every dawn, and selling a lot at once pushes the price down, so it can pay to spread your sales out.');
  game.openPanel('merchant', (root) => {
    root.classList.add('trade');
    root.appendChild(h(`<h2>Trading Post · Merchant</h2>`));
    const el = tabs(root, [['sell', 'Sell ore', I.RAW_GOLD], ['tools', 'Buy gear', I.IRON_PICK]], tab, (k) => { tab = k; game.ui.refreshPanel(); });
    el.appendChild(h(`<div class="say"><b>Merchant:</b> “${tab === 'sell' ? 'I buy all the ore you can dig. Prices reset at dawn, and if you flood me with one ore, I pay less for each one.' : 'Better picks reach deeper, richer ore, and a good blade and armor keep you alive at night. Or craft them yourself.'}”</div>`));
    if (tab === 'sell') {
      const t = h(`<table><tr><th>Ore</th><th>You have</th><th>Price</th><th>vs yesterday</th><th>Last days</th><th></th></tr></table>`);
      for (const k of ORE_KEYS) {
        const o = e.ores[k], info = ORE_INFO[k];
        const have = game.inv.count(info.item);
        const ch = e.change(o);
        const tr = document.createElement('tr');
        const allQ = e.sellQuote(k, have);
        tr.innerHTML = `<td><img src="${itemIcon(info.item)}">${info.name}</td><td>${have}</td><td><b>${money(o.price, 2)}</b></td>
          <td class="${cls(ch)}">${arrow(ch)} ${pct(ch)}<div class="chg flat">yday ${money(o.prev, 2)}</div></td><td></td><td></td>`;
        tr.children[4].appendChild(chart([...o.history, o.price], 110, 34));
        const cell = tr.children[5];
        cell.append(btn('Sell 1', () => sell(game, k, 1), { disabled: have < 1 }), ' ',
          btn('Sell 10', () => sell(game, k, 10), { disabled: have < 10 }), ' ',
          btn('Sell all', () => sell(game, k, have), { disabled: have < 1, cls: 'green' }));
        if (have > 1) cell.appendChild(h(`<div class="chg flat">All ≈ ${money(allQ.total)} (avg ${money(allQ.avg, 2)})</div>`));
        t.appendChild(tr);
      }
      el.appendChild(t);
      if (game.lastSale) el.appendChild(h(`<div class="say" style="margin-top:10px">${game.lastSale}</div>`));
    } else {
      const t = h(`<table><tr><th>Item</th><th>What it does</th><th>Price</th><th></th></tr></table>`);
      const what = {
        [I.STONE_PICK]: 'Mines stone, coal and iron', [I.IRON_PICK]: 'Also mines gold and diamonds', [I.DIAMOND_PICK]: 'Mines everything, fastest',
        [I.STONE_SWORD]: `${SWORDS[I.STONE_SWORD].damage} damage`, [I.IRON_SWORD]: `${SWORDS[I.IRON_SWORD].damage} damage, longer reach`, [I.DIAMOND_SWORD]: `${SWORDS[I.DIAMOND_SWORD].damage} damage, longest reach`,
        [I.IRON_ARMOR]: `Takes ${ARMOR_REDUCTION * 100}% off creature hits while carried`,
        [I.WINGS]: 'Space in mid-air to glide; dive for speed, look up to climb',
      };
      const row = (id) => {
        const tr = document.createElement('tr');
        const owned = game.inv.count(id);
        tr.innerHTML = `<td><img src="${itemIcon(id)}">${ITEMS[id].name}${owned ? ` <span class="chg flat">(have ${owned})</span>` : ''}</td><td>${what[id]}</td><td><b>${money(TOOL_PRICES[id])}</b></td><td></td>`;
        tr.children[3].appendChild(btn('Buy', () => {
          if (e.buyTool(id, game.inv)) { game.audio.cashRegister(); game.ui.chat(`Bought ${ITEMS[id].name} for ${money(TOOL_PRICES[id])}.`, '#ffd84a'); }
          else game.audio.click();
          game.ui.refreshPanel();
        }, { disabled: e.cash < TOOL_PRICES[id], cls: 'green' }));
        t.appendChild(tr);
      };
      t.appendChild(h('<tr><td colspan="4" class="group">Pickaxes</td></tr>'));
      [I.STONE_PICK, I.IRON_PICK, I.DIAMOND_PICK].forEach(row);
      t.appendChild(h('<tr><td colspan="4" class="group">Protection</td></tr>'));
      [I.STONE_SWORD, I.IRON_SWORD, I.DIAMOND_SWORD, I.IRON_ARMOR].forEach(row);
      t.appendChild(h('<tr><td colspan="4" class="group">Travel</td></tr>'));
      if (!game.inv.count(I.WINGS)) row(I.WINGS);
      else t.appendChild(h(`<tr><td><img src="${itemIcon(I.WINGS)}">${ITEMS[I.WINGS].name}</td><td>${what[I.WINGS]}</td><td colspan="2"><span class="chg flat">Owned</span></td></tr>`));
      el.appendChild(t);
      el.appendChild(h(`<div class="note">Or craft them (press E). Lanterns also help: creatures never spawn in lantern light.</div>`));
    }
    root.appendChild(cashLine(game));
  });
}

function sell(game, k, n) {
  const r = game.econ.sell(k, n, game.inv);
  if (!r) return;
  const ch = (r.avg - r.prev) / r.prev;
  game.lastSale = `Sold <b>${r.n} ${ORE_INFO[k].name}</b> for <b>${money(r.total, 2)}</b>. You got <b>${money(r.avg, 2)}</b> each vs yesterday's <b>${money(r.prev, 2)}</b> <span class="${cls(ch)}">(${arrow(ch)} ${pct(ch)})</span>.`;
  game.audio.cashRegister();
  game.onSale?.(k, r);
  game.ui.refreshPanel();
}

// ---------- Banker ----------
export function openBanker(game, vk, tab = 'shares') {
  const e = game.econ;
  const info = VILLAGE_INFO[vk];
  game.ui.tip('shares', 'Village shares', 'A share is a small piece of a village: its price follows the village\'s health, and you get paid a dividend every dawn while you hold it.');
  game.openPanel('banker', (root) => {
    const v = e.villages[vk];
    root.classList.add('trade');
    root.appendChild(h(`<h2>${info.name} Bank · Banker</h2>`));
    const list = [['shares', `${info.ticker} shares`, I.LEDGER]];
    if (vk === 'port') list.push(['loans', 'Loans', I.RAW_GOLD]);
    let el = root;
    if (list.length > 1) el = tabs(root, list, tab, (k) => { tab = k; game.ui.refreshPanel(); if (k === 'loans') game.ui.tip('loans', 'Loans & leverage', 'Borrowing lets you invest more than you have, but interest is charged every dawn, and if you can\'t make a payment, the bank takes your stuff.'); });
    if (tab === 'shares') {
      const ch = e.change(v);
      const div = v.health >= 30 ? v.price * info.yield * Math.min(1.4, v.health / 70) : 0;
      el.appendChild(h(`<div class="say"><b>Banker:</b> “${info.blurb} Our dividend depends on the town's health. Deliver ore to the Quartermaster and the whole town prospers.”</div>`));
      const top = h(`<div class="row" style="align-items:flex-start;gap:24px"></div>`);
      const kv = h(`<div class="kv">
        <span>Share price</span><span class="r"><b>${money(v.price, 2)}</b></span>
        <span>vs yesterday</span><span class="r ${cls(ch)}">${arrow(ch)} ${pct(ch)}</span>
        <span>Village health</span><span class="r">${healthBar(v.health)}</span>
        <span>Next dividend</span><span class="r">${div > 0 ? money(div, 2) + ' / share' : '<span class="down">none (health < 30)</span>'}</span>
        <span>Volatility</span><span class="r">${{ mining: 'Medium', farm: 'Low', port: 'High' }[vk]}</span>
      </div>`);
      const chartBox = h('<div><div class="note" style="margin:0 0 2px">Price history</div></div>');
      chartBox.appendChild(chart([...v.history, v.price], 220, 80, { grid: true, labels: true }));
      top.append(kv, chartBox);
      el.appendChild(top);
      const avg = v.shares ? v.cost / v.shares : 0;
      const pl = v.shares * v.price - v.cost;
      el.appendChild(h(`<h3 style="margin-top:12px">Your position</h3>`));
      el.appendChild(h(`<div class="kv">
        <span>Shares held</span><span class="r"><b>${v.shares}</b></span>
        <span>Avg cost</span><span class="r">${v.shares ? money(avg, 2) : '—'}</span>
        <span>Market value</span><span class="r">${money(v.shares * v.price, 2)}</span>
        <span>Unrealised P/L</span><span class="r ${cls(pl)}">${v.shares ? money(pl, 2) : '—'}</span>
      </div>`));
      const ask = e.askPrice(vk);
      const maxBuy = Math.floor(e.cash / (ask * 1.03));
      const row = h('<div class="row" style="margin-top:10px"></div>');
      row.append(
        h(`<span>Buy @ ${money(ask, 2)}:</span>`),
        btn('1', () => trade(game, vk, 1), { disabled: e.cash < ask }), btn('5', () => trade(game, vk, 5), { disabled: e.cash < ask * 5 }),
        btn('10', () => trade(game, vk, 10), { disabled: e.cash < ask * 10 }), btn(`Max (${maxBuy})`, () => trade(game, vk, maxBuy), { disabled: maxBuy < 1, cls: 'green' }),
      );
      const row2 = h('<div class="row" style="margin-top:6px"></div>');
      row2.append(
        h(`<span>Sell @ ${money(e.bidPrice(vk), 2)}:</span>`),
        btn('1', () => trade(game, vk, -1), { disabled: v.shares < 1 }), btn('5', () => trade(game, vk, -5), { disabled: v.shares < 5 }),
        btn('All', () => trade(game, vk, -v.shares), { disabled: v.shares < 1, cls: 'red' }),
      );
      el.append(row, row2);
      el.appendChild(h('<div class="note">Buying pushes the price up a little and selling pushes it down. There\'s a 1% spread on each trade.</div>'));
    } else {
      const due = e.paymentDue();
      const max = e.maxBorrow(game.inv);
      el.appendChild(h(`<div class="say"><b>Banker:</b> “The Port Bank lends up to <b>2× your net worth</b>. Interest is <b>${(LOAN_RATE * 100).toFixed(0)}% a day</b>, and every dawn I collect ${(MIN_PAYMENT * 100).toFixed(0)}% of the balance. Miss a payment and I'll take your ore and shares, plus a 25% penalty.”</div>`));
      el.appendChild(h(`<div class="kv">
        <span>Current debt</span><span class="r ${e.debt > 0 ? 'down' : ''}"><b>${money(e.debt, 2)}</b></span>
        <span>Interest at next dawn</span><span class="r">${money(e.debt * LOAN_RATE, 2)}</span>
        <span>Payment due at dawn</span><span class="r"><b>${money(due, 2)}</b></span>
        <span>Can still borrow</span><span class="r">${money(max)}</span>
        <span>Interest paid so far</span><span class="r">${money(e.stats.interestPaid, 2)}</span>
      </div>`));
      const row = h('<div class="row" style="margin-top:10px"><span>Borrow:</span></div>');
      for (const amt of [50, 200, 500]) row.appendChild(btn(money(amt), () => loan(game, amt), { disabled: max < amt }));
      row.appendChild(btn(`Max (${money(max)})`, () => loan(game, max), { disabled: max < 1, cls: 'red' }));
      const row2 = h('<div class="row" style="margin-top:6px"><span>Repay:</span></div>');
      for (const amt of [50, 200]) row2.appendChild(btn(money(amt), () => repay(game, amt), { disabled: e.debt <= 0 || e.cash < 1 }));
      row2.appendChild(btn('All', () => repay(game, e.debt), { disabled: e.debt <= 0 || e.cash < 1, cls: 'green' }));
      el.append(row, row2);
      el.appendChild(h('<div class="note">Leverage magnifies gains and losses. Unpaid debt is subtracted from your final net worth.</div>'));
    }
    root.appendChild(cashLine(game));
  });
}

function trade(game, vk, n) {
  const e = game.econ;
  const r = n > 0 ? e.buyShares(vk, n) : e.sellShares(vk, -n);
  if (!r) return;
  game.audio.coins();
  const t = VILLAGE_INFO[vk].ticker;
  if (n > 0) game.ui.chat(`Bought ${r.n} ${t} for ${money(r.cost, 2)}.`, '#ffd84a');
  else game.ui.chat(`Sold ${r.n} ${t} for ${money(r.got, 2)} (${r.gain >= 0 ? 'gain' : 'loss'} ${money(r.gain, 2)}).`, r.gain >= 0 ? '#55ff55' : '#ff5555');
  if (n > 0) game.ui.tip('dividend', 'Dividends', 'Every dawn, each village pays you part of its profits for every share you own, and healthier villages pay more.');
  game.ui.refreshPanel();
}
function loan(game, amt) {
  const got = game.econ.borrow(amt, game.inv);
  if (!got) return;
  game.audio.coins();
  game.ui.chat(`Borrowed ${money(got)} from the Port Bank. Interest is charged every dawn.`, '#ff9955');
  game.ui.tip('debt', 'Debt', 'Your debt and the payment due at dawn are shown in the top-left, so keep enough cash on hand to cover them.');
  game.ui.refreshPanel();
}
function repay(game, amt) {
  const p = game.econ.repay(amt);
  if (!p) return;
  game.audio.click();
  game.ui.chat(`Repaid ${money(p, 2)}.`, '#55ff55');
  game.ui.refreshPanel();
}

// ---------- Quartermaster ----------
export function openQuartermaster(game, vk) {
  const e = game.econ;
  const info = VILLAGE_INFO[vk];
  game.ui.tip('deliver', 'Deliveries', 'Selling ore straight to a village pays a bit less than the market, but it doesn\'t push prices down and it makes the village healthier, which helps its share price.');
  game.openPanel('quartermaster', (el) => {
    const v = e.villages[vk];
    el.classList.add('trade');
    el.appendChild(h(`<h2>${info.name} · Quartermaster</h2>`));
    const need = info.accepts.map((k) => ORE_INFO[k].name.toLowerCase()).join(' and ');
    el.appendChild(h(`<div class="say"><b>Quartermaster:</b> “We need ${need}! I pay ${vk === 'farm' && v.drought ? '<b>150%</b>' : '90%'} of market price, and every delivery makes ${info.name} stronger.”</div>`));
    el.appendChild(h(`<div class="kv"><span>Village health</span><span class="r">${healthBar(v.health)}</span><span>${info.ticker} share price</span><span class="r">${money(v.price, 2)}</span><span>Your ${info.ticker} shares</span><span class="r">${v.shares}</span></div>`));
    const t = h(`<table style="margin-top:10px"><tr><th>Ore</th><th>You have</th><th>Pays each</th><th>Health per unit</th><th></th></tr></table>`);
    for (const k of info.accepts) {
      const oi = ORE_INFO[k];
      const have = game.inv.count(oi.item);
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><img src="${itemIcon(oi.item)}">${oi.name}</td><td>${have}</td><td><b>${money(e.deliveryPrice(vk, k), 2)}</b><div class="chg flat">market ${money(e.ores[k].price, 2)}</div></td><td>+${e.healthGain(vk, e.ores[k].price).toFixed(2)}</td><td></td>`;
      tr.children[4].append(btn('Deliver 1', () => deliver(game, vk, k, 1), { disabled: have < 1 }), ' ',
        btn('10', () => deliver(game, vk, k, 10), { disabled: have < 10 }), ' ',
        btn('All', () => deliver(game, vk, k, have), { disabled: have < 1, cls: 'green' }));
      t.appendChild(tr);
    }
    el.appendChild(t);
    if (game.lastDelivery) el.appendChild(h(`<div class="say" style="margin-top:10px">${game.lastDelivery}</div>`));
    el.appendChild(h('<div class="note">Tip: buy a village\'s shares first, then deliver ore to it to push its price up.</div>'));
    el.appendChild(cashLine(game));
  });
}
function deliver(game, vk, k, n) {
  const r = game.econ.deliver(vk, k, n, game.inv);
  if (!r) return;
  game.audio.cashRegister();
  game.lastDelivery = `Delivered <b>${r.n} ${ORE_INFO[k].name}</b> for <b>${money(r.pay, 2)}</b>. ${VILLAGE_INFO[vk].name} health <span class="up">+${r.gain.toFixed(1)}</span>.`;
  game.onSale?.(k, r);
  game.ui.refreshPanel();
}

// ---------- Market board overview ----------
export function openMarketBoard(game) {
  const e = game.econ;
  game.ui.tip('board', 'Market board', 'The board shows today\'s prices: a green arrow means the price went up since yesterday, and red means it went down.');
  game.openPanel('board', (el) => {
    el.classList.add('trade');
    el.appendChild(h(`<h2>Valley Exchange · Day ${Math.min(e.day, 10)}</h2>`));
    const t = h(`<table><tr><th>Ore</th><th>Price</th><th>vs yesterday</th><th>History</th></tr></table>`);
    for (const k of ORE_KEYS) {
      const o = e.ores[k], ch = e.change(o);
      const tr = h(`<tr><td><img src="${itemIcon(ORE_INFO[k].item)}">${ORE_INFO[k].name}</td><td><b>${money(o.price, 2)}</b></td><td class="${cls(ch)}">${arrow(ch)} ${pct(ch)}</td><td></td></tr>`);
      tr.children[3].appendChild(chart([...o.history, o.price], 160, 34));
      t.appendChild(tr);
    }
    el.appendChild(t);
    const t2 = h(`<table style="margin-top:12px"><tr><th>Village share</th><th>Price</th><th>vs yesterday</th><th>Health</th><th>History</th></tr></table>`);
    for (const k of VILLAGE_KEYS) {
      const v = e.villages[k], ch = e.change(v);
      const tr = h(`<tr><td><b>${VILLAGE_INFO[k].ticker}</b> ${VILLAGE_INFO[k].name}</td><td><b>${money(v.price, 2)}</b></td><td class="${cls(ch)}">${arrow(ch)} ${pct(ch)}</td><td>${healthBar(v.health)}</td><td></td></tr>`);
      tr.children[4].appendChild(chart([...v.history, v.price], 120, 34));
      t2.appendChild(tr);
    }
    el.appendChild(t2);
    el.appendChild(h('<div class="note">Sell ore to the Merchant (east stall). Buy shares from each village\'s Banker.</div>'));
  });
}

// ---------- Ledger ----------
export function openLedger(game) {
  const e = game.econ;
  game.ui.tip('ledger', 'Your ledger', 'Net worth is everything you own (cash, ore and shares) minus what you owe, and it\'s the number that decides your final score.');
  game.openPanel('ledger', (el) => {
    el.className = 'ledger mc-panel';
    const inv = game.inv;
    const nw = e.netWorth(inv);
    el.appendChild(h(`<h2>📒 Ledger · Day ${Math.min(e.day, 10)}</h2>`));
    const cols = h('<div class="ledger-cols"></div>');
    const left = document.createElement('div');
    let rows = `<tr><td>Cash</td><td class="r">${money(e.cash, 2)}</td></tr>`;
    for (const k of ORE_KEYS) {
      const n = inv.count(ORE_INFO[k].item);
      if (n) rows += `<tr><td>${n} × ${ORE_INFO[k].name} @ ${money(e.ores[k].price, 2)}</td><td class="r">${money(n * e.ores[k].price, 2)}</td></tr>`;
    }
    for (const k of VILLAGE_KEYS) {
      const v = e.villages[k];
      if (v.shares) rows += `<tr><td>${v.shares} × ${VILLAGE_INFO[k].ticker} @ ${money(v.price, 2)}</td><td class="r">${money(v.shares * v.price, 2)}</td></tr>`;
    }
    if (e.debt > 0) rows += `<tr><td>Loan (Port Bank)</td><td class="r down">-${money(e.debt, 2)}</td></tr>`;
    rows += `<tr><td><b>Net worth</b></td><td class="r"><b>${money(nw, 2)}</b></td></tr>`;
    left.appendChild(h(`<div><h3>Portfolio</h3><table>${rows}</table></div>`));
    // allocation bar
    const parts = [['Cash', Math.max(0, e.cash), '#c9a227'], ['Ore', e.oreValue(inv), '#7a7a7a'], ['Shares', e.shareValue(), '#2f7a3a']];
    const tot = parts.reduce((a, p) => a + p[1], 0) || 1;
    left.appendChild(h(`<div style="display:flex;height:14px;margin:8px 0 2px;border:1px solid #5b3b1b">${parts.map((p) => `<div title="${p[0]}" style="width:${(p[1] / tot * 100).toFixed(1)}%;background:${p[2]}"></div>`).join('')}</div>`));
    left.appendChild(h(`<div class="note">${parts.map((p) => `<span style="color:${p[2]}">■</span> ${p[0]} ${(p[1] / tot * 100).toFixed(0)}%`).join(' &nbsp; ')}</div>`));
    const s = e.stats;
    left.appendChild(h(`<div><h3 style="margin-top:10px">Income so far</h3><table>
      <tr><td>Ore sold at market</td><td class="r">${money(s.oreSales, 2)}</td></tr>
      <tr><td>Ore delivered to villages</td><td class="r">${money(s.deliveries, 2)}</td></tr>
      <tr><td>Dividends</td><td class="r">${money(s.dividends, 2)}</td></tr>
      <tr><td>Realised share gains</td><td class="r ${cls(s.shareGains)}">${money(s.shareGains, 2)}</td></tr>
      <tr><td>Murkmole bounties</td><td class="r">${money(s.bounties, 2)}</td></tr>
      <tr><td>Interest charged</td><td class="r down">-${money(s.interestPaid, 2)}</td></tr>
      <tr><td>Spent on gear</td><td class="r">-${money(s.toolSpend, 2)}</td></tr>
    </table></div>`));
    const right = document.createElement('div');
    right.appendChild(h('<h3>Net worth over time</h3>'));
    const series = [...e.nwHistory.map((p) => p.nw), nw];
    right.appendChild(chart(series, 330, 150, { grid: true, labels: true, bg: '#f7f0dc' }));
    right.appendChild(h(`<div class="note">One point every quarter-day. Started at ${money(e.nwHistory[0]?.nw ?? nw)}.</div>`));
    right.appendChild(h('<h3 style="margin-top:10px">Recent transactions</h3>'));
    right.appendChild(h(`<div class="tx"><table>${e.tx.slice(0, 40).map((t) => `<tr><td>D${t.day}</td><td>${t.text}</td><td class="r ${t.amount > 0 ? 'up' : t.amount < 0 ? 'down' : ''}">${t.amount ? money(t.amount, 2) : ''}</td></tr>`).join('') || '<tr><td>No transactions yet.</td></tr>'}</table></div>`));
    cols.append(left, right);
    el.appendChild(cols);
    el.appendChild(h('<div class="note">Press L or Esc to close.</div>'));
  });
}

// ---------- end screen ----------
export const RATINGS = [
  [0, 'Intern'], [150, 'Analyst'], [400, 'Associate'], [900, 'Vice President'], [1800, 'Director'], [3500, 'Managing Director'],
];
export function ratingFor(nw) { let r = RATINGS[0][1]; for (const [t, name] of RATINGS) if (nw >= t) r = name; return r; }

export function renderEnd(game, result, scores, myIndex) {
  const el = document.getElementById('end-content');
  el.innerHTML = '';
  const s = result.stats;
  const next = RATINGS.find(([t]) => t > result.nw);
  el.appendChild(h(`<div>
    <h2>The market has closed! Day 10 complete.</h2>
    <div class="end-grid">
      <div>
        <div class="note" style="margin:0">Final net worth</div>
        <div class="big-nw">${money(result.nw, 2)}</div>
        <div class="rating">Rating: ${result.rating}</div>
        <div class="note">${next ? `Reach ${money(next[0])} for ${next[1]}.` : 'Top of the valley!'}</div>
        <h3 style="margin-top:12px">Breakdown</h3>
        <table class="trade" style="min-width:0;width:100%"><tbody>
          <tr><td>⛏ Mining income</td><td style="text-align:right"><b>${money(result.mining, 2)}</b></td></tr>
          <tr><td class="note" style="margin:0">  market sales ${money(s.oreSales)} + deliveries ${money(s.deliveries)}</td><td></td></tr>
          <tr><td>📈 Investment income</td><td style="text-align:right" class="${cls(result.investing)}"><b>${money(result.investing, 2)}</b></td></tr>
          <tr><td class="note" style="margin:0">  dividends ${money(s.dividends)} + share gains ${money(result.shareGainsTotal)}</td><td></td></tr>
          <tr><td>🏦 Interest paid</td><td style="text-align:right"${s.interestPaid > 0 ? ' class="down"' : ''}><b>-${money(s.interestPaid, 2)}</b></td></tr>
          <tr><td>⚔ Murkmole bounties</td><td style="text-align:right">${money(s.bounties, 2)}</td></tr>
          <tr><td>🔨 Spent on gear</td><td style="text-align:right">-${money(s.toolSpend, 2)}</td></tr>
          ${s.seized ? `<tr><td>⚠ Seized by the bank</td><td style="text-align:right" class="down">-${money(s.seized, 2)}</td></tr>` : ''}
        </tbody></table>
      </div>
      <div>
        <h3>Net worth over time</h3>
        <div id="end-chart"></div>
        <h3 style="margin-top:12px">High scores</h3>
        <ol class="scores-ol">${scores.map((sc, i) => `<li class="${i === myIndex ? 'me' : ''}">${money(sc.nw)} · ${sc.rating} <span class="note">${sc.date}</span></li>`).join('')}</ol>
      </div>
    </div>
    <div class="row" style="margin-top:14px;justify-content:center">
      <button class="mc-btn" id="btn-again">Play again</button>
      <button class="mc-btn" id="btn-title">Title screen</button>
    </div>
  </div>`));
  document.getElementById('end-chart').appendChild(chart(result.series, 340, 150, { grid: true, labels: true }));
  document.getElementById('btn-again').onclick = () => { document.getElementById('screen-end').classList.add('hidden'); game.showCreate(); };
  document.getElementById('btn-title').onclick = () => game.toTitle();
}
