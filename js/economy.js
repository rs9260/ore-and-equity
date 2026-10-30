// The valley economy: ore commodity market, village shares & dividends, loans, market events.
import { mulberry32 } from './noise.js';
import { I, ITEMS, ORE_ITEMS } from './blocks.js';

export const ORE_KEYS = ['coal', 'iron', 'gold', 'diamond'];
export const ORE_INFO = {
  coal: { name: 'Coal', base: 6, impact: 0.004, vol: 0.06, liquidity: 80, item: I.COAL },
  iron: { name: 'Iron', base: 15, impact: 0.008, vol: 0.07, liquidity: 30, item: I.RAW_IRON },
  gold: { name: 'Gold', base: 34, impact: 0.015, vol: 0.09, liquidity: 14, item: I.RAW_GOLD },
  diamond: { name: 'Diamond', base: 120, impact: 0.04, vol: 0.11, liquidity: 5, item: I.DIAMOND },
};

export const VILLAGE_KEYS = ['mining', 'farm', 'port'];
export const VILLAGE_INFO = {
  mining: { name: 'Mining Town', ticker: 'MINE', base: 24, health: 60, vol: 0.04, sd: 4, yield: 0.025, accepts: ['coal', 'iron'], blurb: 'Steady industrial town. Needs coal and iron.' },
  farm: { name: 'Farm Village', ticker: 'FARM', base: 18, health: 68, vol: 0.025, sd: 2.5, yield: 0.03, accepts: ['coal', 'iron'], blurb: 'Calm and reliable, but at the mercy of the weather.' },
  port: { name: 'Trade Port', ticker: 'PORT', base: 40, health: 56, vol: 0.09, sd: 7, yield: 0.02, accepts: ['gold', 'diamond'], blurb: 'Rich and volatile. Wants gold and diamonds.' },
};

export const TOOL_PRICES = {
  [I.STONE_PICK]: 25, [I.IRON_PICK]: 110, [I.DIAMOND_PICK]: 420,
  [I.STONE_SWORD]: 20, [I.IRON_SWORD]: 70, [I.DIAMOND_SWORD]: 280, [I.IRON_ARMOR]: 95, [I.WINGS]: 350,
};

export const LOAN_RATE = 0.04; // per day
export const MIN_PAYMENT = 0.2; // share of the balance due each dawn
const DELIVERY_RATE = 0.9;

const EVENT_TYPES = ['raid', 'cavein', 'drought', 'goldrush'];

export class Economy {
  constructor(seed, hooks) {
    this.r = mulberry32(seed ^ 0x5eed);
    this.h = hooks; // { chat, toast, sound, raid, tip }
    this.cash = 40;
    this.debt = 0;
    this.day = 1;
    this.ores = {};
    for (const k of ORE_KEYS) {
      const o = ORE_INFO[k];
      const p = o.base * (0.9 + this.r() * 0.2);
      this.ores[k] = { price: p, prev: p, open: p, history: [p], recent: 0, mult: 1, multDays: 0, soldToday: 0 };
    }
    this.villages = {};
    for (const k of VILLAGE_KEYS) {
      const v = VILLAGE_INFO[k];
      const price = this.target(k, v.health);
      this.villages[k] = { health: v.health, price, prev: price, history: [price], shares: 0, cost: 0, drought: 0, delivered: 0 };
    }
    this.tx = [];
    this.nwHistory = [];
    this.stats = { oreSales: 0, deliveries: 0, dividends: 0, shareGains: 0, interestPaid: 0, toolSpend: 0, seized: 0, bounties: 0, borrowed: 0 };
    this.scheduleEvents();
    this.noiseT = 0;
  }

  gauss() { return Math.sqrt(-2 * Math.log(this.r() + 1e-9)) * Math.cos(2 * Math.PI * this.r()); }
  target(k, health) { return VILLAGE_INFO[k].base * (0.35 + 1.3 * health / 100); }
  log(text, amount = 0) {
    this.tx.unshift({ day: this.day, text, amount });
    if (this.tx.length > 80) this.tx.pop();
  }

  // ---------- valuation ----------
  oreValue(inv) { let v = 0; for (const k of ORE_KEYS) v += inv.count(ORE_INFO[k].item) * this.ores[k].price; return v; }
  shareValue() { let v = 0; for (const k of VILLAGE_KEYS) v += this.villages[k].shares * this.villages[k].price; return v; }
  netWorth(inv) { return this.cash + this.oreValue(inv) + this.shareValue() - this.debt; }
  change(o) { return o.prev ? (o.price - o.prev) / o.prev : 0; }

  // ---------- ore market ----------
  fundamental(k) {
    const v = this.villages;
    const demand = {
      coal: 0.8 + 0.4 * v.mining.health / 100 + (v.farm.drought ? 0.1 : 0),
      iron: 0.75 + 0.5 * v.mining.health / 100,
      gold: 0.75 + 0.5 * v.port.health / 100,
      diamond: 0.7 + 0.6 * v.port.health / 100,
    }[k];
    return ORE_INFO[k].base * demand * this.ores[k].mult;
  }
  sellQuote(k, n) {
    let p = this.ores[k].price, total = 0;
    for (let i = 0; i < n; i++) { total += p; p *= 1 - ORE_INFO[k].impact; }
    return { total, avg: n ? total / n : 0, end: p };
  }
  sell(k, n, inv) {
    const item = ORE_INFO[k].item;
    n = Math.min(n, inv.count(item));
    if (n <= 0) return null;
    const q = this.sellQuote(k, n);
    const o = this.ores[k];
    inv.remove(item, n);
    o.price = q.end;
    o.soldToday += n;
    o.recent += n;
    this.cash += q.total;
    this.stats.oreSales += q.total;
    this.log(`Sold ${n} ${ORE_INFO[k].name} @ ${q.avg.toFixed(2)}`, q.total);
    return { n, total: q.total, avg: q.avg, prev: o.prev };
  }

  // ---------- village deliveries ----------
  deliveryPrice(vk, k) {
    const bonus = vk === 'farm' && this.villages.farm.drought ? 1.5 : 1;
    return this.ores[k].price * DELIVERY_RATE * bonus;
  }
  healthGain(vk, value) {
    const v = this.villages[vk];
    return (value / (VILLAGE_INFO[vk].base * 0.5)) * Math.max(0.05, 1 - v.health / 115);
  }
  deliver(vk, k, n, inv) {
    const item = ORE_INFO[k].item;
    n = Math.min(n, inv.count(item));
    if (n <= 0) return null;
    const v = this.villages[vk];
    const pay = this.deliveryPrice(vk, k) * n;
    const gain = this.healthGain(vk, this.ores[k].price * n);
    inv.remove(item, n);
    this.cash += pay;
    this.stats.deliveries += pay;
    v.health = Math.min(100, v.health + gain);
    v.delivered += n;
    v.price += (this.target(vk, v.health) - v.price) * 0.3;
    this.log(`Delivered ${n} ${ORE_INFO[k].name} to ${VILLAGE_INFO[vk].name}`, pay);
    return { n, pay, gain };
  }

  // ---------- shares ----------
  askPrice(vk) { return this.villages[vk].price * 1.01; }
  bidPrice(vk) { return this.villages[vk].price * 0.99; }
  buyShares(vk, n) {
    const v = this.villages[vk];
    let cost = 0, p = v.price, bought = 0;
    for (let i = 0; i < n; i++) {
      const c = p * 1.01;
      if (this.cash - cost < c) break;
      cost += c; p *= 1.004; bought++;
    }
    if (!bought) return null;
    this.cash -= cost;
    v.price = p;
    v.shares += bought;
    v.cost += cost;
    this.log(`Bought ${bought} ${VILLAGE_INFO[vk].ticker} shares`, -cost);
    return { n: bought, cost };
  }
  sellShares(vk, n) {
    const v = this.villages[vk];
    n = Math.min(n, v.shares);
    if (n <= 0) return null;
    let got = 0, p = v.price;
    for (let i = 0; i < n; i++) { got += p * 0.99; p *= 0.996; }
    const basis = v.cost * (n / v.shares);
    v.cost -= basis;
    v.shares -= n;
    v.price = p;
    this.cash += got;
    this.stats.shareGains += got - basis;
    this.log(`Sold ${n} ${VILLAGE_INFO[vk].ticker} shares`, got);
    return { n, got, gain: got - basis };
  }

  // ---------- loans ----------
  maxBorrow(inv) { return Math.max(0, 2 * this.netWorth(inv) - this.debt); }
  borrow(amt, inv) {
    amt = Math.min(amt, this.maxBorrow(inv));
    if (amt < 1) return 0;
    amt = Math.floor(amt);
    this.debt += amt; this.cash += amt;
    this.stats.borrowed += amt;
    this.log(`Borrowed from Port Bank`, amt);
    return amt;
  }
  repay(amt) {
    amt = Math.min(amt, this.debt, this.cash);
    if (amt <= 0) return 0;
    this.debt -= amt; this.cash -= amt;
    if (this.debt < 0.01) this.debt = 0;
    this.log('Loan repayment', -amt);
    return amt;
  }
  paymentDue() {
    if (this.debt <= 0) return 0;
    const after = this.debt * (1 + LOAN_RATE);
    return Math.min(after, Math.max(5, after * MIN_PAYMENT));
  }

  buyTool(id, inv) {
    const price = TOOL_PRICES[id];
    if (this.cash < price) return false;
    if (inv.add(id, 1, false)) return false;
    inv.changed();
    this.cash -= price;
    this.stats.toolSpend += price;
    this.log(`Bought ${ITEMS[id].name}`, -price);
    return true;
  }

  // ---------- events ----------
  scheduleEvents() {
    const types = [...EVENT_TYPES].sort(() => this.r() - 0.5);
    const n = this.r() < 0.75 ? 2 : 1;
    this.events = [];
    for (let i = 0; i < n; i++) {
      const day = i === 0 ? 3 + (this.r() * 3 | 0) : 6 + (this.r() * 3 | 0);
      const village = VILLAGE_KEYS[this.r() * 3 | 0];
      this.events.push({ type: types[i], day, frac: 0.25 + this.r() * 0.3, village, rumor: this.r() < 0.6, fired: false, rumored: false });
    }
  }

  rumor(e) {
    const vn = VILLAGE_INFO[e.village].name;
    const text = {
      raid: `Rumor: scratching sounds under ${vn}. Murkmoles may be massing...`,
      cavein: 'Rumor: miners report rumbling in the deep diamond tunnels...',
      drought: 'Rumor: no rain in the forecast for Farm Village...',
      goldrush: 'Rumor: prospectors whisper about a huge new gold strike...',
    }[e.type];
    this.h.chat(`[Gossip] ${text}`, '#c9a0ff');
  }

  fire(e) {
    const v = this.villages, o = this.ores;
    const h = this.h;
    if (e.type === 'raid') {
      const vg = v[e.village], vn = VILLAGE_INFO[e.village].name;
      vg.health = Math.max(5, vg.health - 35);
      vg.price *= 0.55;
      h.chat(`⚠ MARKET NEWS: Murkmoles raided ${vn}! Its health and share price crashed.`, '#ff5555');
      h.raid(e.village);
    } else if (e.type === 'cavein') {
      o.diamond.price *= 1.6; o.diamond.mult = 1.8; o.diamond.multDays = 3;
      h.chat('⚠ MARKET NEWS: A cave-in sealed the deep tunnels. Diamond supply dropped and prices spiked!', '#55ffff');
    } else if (e.type === 'drought') {
      v.farm.health = Math.max(5, v.farm.health - 30); v.farm.price *= 0.65; v.farm.drought = 3;
      v.mining.health -= 6; v.port.health -= 6;
      h.chat('⚠ MARKET NEWS: Drought hits Farm Village! Its shares fell and food costs rise across the valley.', '#ffaa00');
      h.chat('The Farm Quartermaster now pays 1.5x for coal and iron while the drought lasts.', '#ffaa00');
    } else if (e.type === 'goldrush') {
      o.gold.price *= 0.5; o.gold.mult = 0.6; o.gold.multDays = 3;
      h.chat('⚠ MARKET NEWS: Gold rush! New supply floods the market and gold prices crash.', '#ffd84a');
    }
    h.sound('alert', e.type === 'cavein');
    h.tip('event', 'Market events', 'Random events like raids, droughts and gold rushes can suddenly move prices, so spreading your money around lowers your risk.');
    this.log({ raid: `News: raid on ${VILLAGE_INFO[e.village].name}`, cavein: 'News: deep cave-in', drought: 'News: drought', goldrush: 'News: gold rush' }[e.type]);
  }

  // ---------- time ----------
  tick(dt, frac) {
    for (const e of this.events) {
      if (!e.rumored && e.rumor && ((this.day === e.day - 1 && frac > 0.55) || (this.day === e.day && frac > e.frac - 0.2))) { e.rumored = true; this.rumor(e); }
      if (!e.fired && this.day === e.day && frac >= e.frac) { e.fired = true; this.fire(e); }
    }
    // slow intraday recovery of ore prices toward the day's open + small live noise
    this.noiseT += dt;
    for (const k of ORE_KEYS) {
      const o = this.ores[k];
      o.price += (o.open - o.price) * Math.min(1, dt * 0.006);
    }
    if (this.noiseT > 4) {
      this.noiseT = 0;
      for (const k of ORE_KEYS) this.ores[k].price *= Math.exp(this.gauss() * ORE_INFO[k].vol * 0.06);
      for (const k of VILLAGE_KEYS) {
        const v = this.villages[k];
        v.price *= Math.exp(this.gauss() * VILLAGE_INFO[k].vol * 0.08);
        v.price += (this.target(k, v.health) - v.price) * 0.01;
      }
    }
  }

  // Called at each dawn (start of `day`). Returns a summary for the UI.
  dawn(day, inv) {
    this.day = day;
    const out = { dividends: [], divTotal: 0 };
    // villages: health drift, prices, dividends
    for (const k of VILLAGE_KEYS) {
      const v = this.villages[k], info = VILLAGE_INFO[k];
      v.prev = v.price;
      v.health += (55 - v.health) * 0.08 + this.gauss() * info.sd + (k === 'farm' && !v.drought ? 1 : 0);
      if (v.drought) { v.health -= 4; v.drought--; }
      v.health = Math.max(5, Math.min(100, v.health));
      const t = this.target(k, v.health);
      v.price += (t - v.price) * 0.5;
      v.price *= Math.exp(this.gauss() * info.vol);
      v.price = Math.max(1, v.price);
      v.history.push(v.price);
      if (v.shares > 0) {
        const per = v.health >= 30 ? v.price * info.yield * Math.min(1.4, v.health / 70) : 0;
        const amt = per * v.shares;
        if (amt > 0) {
          this.cash += amt;
          this.stats.dividends += amt;
          out.divTotal += amt;
          out.dividends.push({ k, amt, per });
          this.log(`Dividend from ${info.ticker}`, amt);
        } else out.dividends.push({ k, amt: 0, per: 0, skipped: true });
      }
    }
    // ores: overnight repricing
    for (const k of ORE_KEYS) {
      const o = this.ores[k], info = ORE_INFO[k];
      o.prev = o.price;
      if (o.multDays > 0 && --o.multDays === 0) o.mult = 1;
      const pressure = Math.min(0.3, (o.recent / info.liquidity) * 0.15);
      o.price += (this.fundamental(k) * (1 - pressure) - o.price) * 0.5;
      o.price *= Math.exp(this.gauss() * info.vol);
      o.price = Math.max(info.base * 0.2, o.price);
      o.open = o.price;
      o.recent *= 0.5;
      o.soldToday = 0;
      o.history.push(o.price);
    }
    // loan interest and payment
    out.interest = 0; out.paid = 0; out.seized = [];
    if (this.debt > 0) {
      const interest = this.debt * LOAN_RATE;
      this.debt += interest;
      this.stats.interestPaid += interest;
      out.interest = interest;
      const due = Math.min(this.debt, Math.max(5, this.debt * MIN_PAYMENT));
      const paid = Math.min(this.cash, due);
      this.cash -= paid; this.debt -= paid;
      out.paid = paid;
      this.log(`Loan payment (incl. ${interest.toFixed(0)} interest)`, -paid);
      let short = due - paid;
      if (short > 0.5) {
        // Seize items worth the shortfall plus a 25% penalty, most valuable first.
        let need = short * 1.25;
        for (const k of ['diamond', 'gold', 'iron', 'coal']) {
          const item = ORE_ITEMS[k], price = this.ores[k].price;
          while (need > 0 && inv.count(item) > 0) {
            inv.remove(item, 1, false);
            need -= price;
            this.stats.seized += price;
            const last = out.seized.find((s) => s.k === k);
            if (last) last.n++; else out.seized.push({ k, n: 1 });
          }
        }
        for (const k of VILLAGE_KEYS) {
          const v = this.villages[k];
          while (need > 0 && v.shares > 0) {
            const basis = v.cost / v.shares;
            v.cost -= basis; v.shares--;
            need -= v.price;
            this.stats.seized += v.price;
            const last = out.seized.find((s) => s.k === k);
            if (last) last.n++; else out.seized.push({ k, n: 1, share: true });
          }
        }
        inv.changed();
        const covered = Math.min(short, (short * 1.25 - Math.max(0, need)) / 1.25);
        this.debt -= covered;
        short -= covered;
        if (short > 0.5) { this.debt += short * 0.1; out.lateFee = short * 0.1; }
        this.log('Bank seized items for a missed payment');
      }
      if (this.debt < 0.01) this.debt = 0;
    }
    return out;
  }

  sampleNetWorth(t, inv) {
    this.nwHistory.push({ t, nw: this.netWorth(inv), cash: this.cash, debt: this.debt });
  }
}
