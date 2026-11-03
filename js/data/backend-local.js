/**
 * The database on this device only, used by the preview and whenever Firebase isn't set up.
 * It behaves like Firestore where the app relies on it: paths, update() with dotted field names,
 * failure when updating a missing document, and live listeners that fire before a write finishes.
 * Other tabs in the same browser see changes too, which is how the end-to-end tests stand in for a friend.
 */
const KEY = 'triptab:localdb';
const UID_KEY = 'triptab:local-uid';

const parentOf = p => p.split('/').slice(0, -1).join('/');
const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

export function setDotted(doc, field, value) {
  const parts = field.split('.');
  let at = doc;
  for (const p of parts.slice(0, -1)) {
    if (!at[p] || typeof at[p] !== 'object') at[p] = {};
    at = at[p];
  }
  at[parts.at(-1)] = value;
}

export function createLocalBackend({ area = globalThis.localStorage, hangWrites = () => false } = {}) {
  let docs = load();
  const docWatchers = new Map(), colWatchers = new Map();

  function load() { try { return JSON.parse(area?.getItem(KEY) || '{}'); } catch { return {}; } }
  /** Picks up what another tab wrote since the last look, so a write never overwrites it. */
  function refresh() {
    try { const raw = area?.getItem(KEY); if (raw) docs = JSON.parse(raw); } catch { /* keep what's in memory */ }
  }
  function persist() { area?.setItem(KEY, JSON.stringify(docs)); }
  const docsIn = col => Object.keys(docs).filter(p => parentOf(p) === col).map(p => docs[p]);
  const add = (map, key, fn) => { if (!map.has(key)) map.set(key, new Set()); map.get(key).add(fn); return () => map.get(key).delete(fn); };

  function emit(path) {
    const col = parentOf(path);
    for (const fn of docWatchers.get(path) || []) fn(clone(docs[path]) ?? null);
    for (const fn of colWatchers.get(col) || []) fn();
  }
  // While writes "hang" (the tests' stand-in for offline), written documents count as waiting to sync.
  const pending = new Set();
  const done = path => {
    if (!hangWrites()) return Promise.resolve();
    pending.add(path);
    emit(path);
    return new Promise(() => {});
  };
  globalThis.addEventListener?.('online', () => {
    const paths = [...pending];
    pending.clear();
    paths.forEach(emit);
  });

  globalThis.addEventListener?.('storage', ev => {
    if (ev.key !== KEY) return;
    const before = docs;
    docs = load();
    for (const p of new Set([...Object.keys(before), ...Object.keys(docs)])) {
      if (JSON.stringify(before[p]) !== JSON.stringify(docs[p])) emit(p);
    }
  });

  return {
    kind: 'local',
    uid() {
      let id = null;
      try { id = area?.getItem(UID_KEY); } catch { /* blocked storage */ }
      if (!id) {
        id = `local${Math.random().toString(36).slice(2, 14)}`;
        try { area?.setItem(UID_KEY, id); } catch { /* blocked storage */ }
      }
      return id;
    },
    set(path, data) {
      refresh();
      docs[path] = clone(data);
      try { persist(); } catch (e) { delete docs[path]; return Promise.reject(e); }
      emit(path);
      return done(path);
    },
    update(path, fields) {
      refresh();
      if (!docs[path]) return Promise.reject(new Error(`No document at ${path}`));
      // Mirrors the rule that taking over a name needs its secret key.
      if (path.includes('/claims/') && 'key' in fields && !docs[path].released && !fields.released && docs[path].key !== fields.key) {
        return Promise.reject(Object.assign(new Error('Wrong key'), { code: 'permission-denied' }));
      }
      const before = docs[path];
      const next = clone(before);
      for (const [f, v] of Object.entries(fields)) setDotted(next, f, clone(v));
      docs[path] = next;
      try { persist(); } catch (e) { docs[path] = before; return Promise.reject(e); }
      emit(path);
      return done(path);
    },
    get(path) { refresh(); return Promise.resolve(clone(docs[path]) ?? null); },
    list(col) { refresh(); return Promise.resolve(clone(docsIn(col))); },
    watchDoc(path, cb) {
      const off = add(docWatchers, path, cb);
      queueMicrotask(() => cb(clone(docs[path]) ?? null));
      return off;
    },
    watchCollection(col, cb, _err, { orderBy, limit } = {}) {
      const send = () => {
        let list = docsIn(col);
        if (orderBy) list = list.sort((a, b) => (b[orderBy] || 0) - (a[orderBy] || 0));
        if (limit) list = list.slice(0, limit);
        cb(clone(list), { pending: [...pending].filter(p => parentOf(p) === col).map(p => p.split('/').at(-1)) });
      };
      const off = add(colWatchers, col, send);
      queueMicrotask(send);
      return off;
    },
  };
}
