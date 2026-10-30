// World saves in IndexedDB. Each world keeps a small "meta" record (for the world list) and a
// "data" record with everything needed to rebuild it: the seed, every block you changed, and the
// player, inventory, economy and items on the ground. Terrain itself is regenerated from the seed.
const DB_NAME = 'ore-equity';
let dbp = null;

function db() {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      d.createObjectStore('meta', { keyPath: 'id' });
      d.createObjectStore('data', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbp = null; reject(req.error); };
  });
  return dbp;
}

async function run(stores, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(stores, mode);
    let out;
    Promise.resolve(fn(tx)).then((v) => (out = v));
    tx.oncomplete = () => resolve(out);
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}
const req = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

export async function listWorlds() {
  const all = await run(['meta'], 'readonly', (tx) => req(tx.objectStore('meta').getAll()));
  return all.sort((a, b) => b.played - a.played);
}

export function loadWorld(id) {
  return run(['data'], 'readonly', (tx) => req(tx.objectStore('data').get(id)));
}

export function saveWorld(meta, data) {
  return run(['meta', 'data'], 'readwrite', (tx) => {
    tx.objectStore('meta').put(meta);
    if (data) tx.objectStore('data').put({ ...data, id: meta.id });
  });
}

export function deleteWorld(id) {
  return run(['meta', 'data'], 'readwrite', (tx) => {
    tx.objectStore('meta').delete(id);
    tx.objectStore('data').delete(id);
  });
}

export function newWorldId() { return `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }

// "12345" is used as-is, any other text is hashed, and an empty box picks a random seed.
export function parseSeed(text) {
  text = text.trim();
  if (!text) return (Math.random() * 1e9) | 0;
  if (/^-?\d{1,9}$/.test(text)) return +text;
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h | 0;
}
