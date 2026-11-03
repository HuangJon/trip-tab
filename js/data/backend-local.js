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

  // Simulated accounts for the preview and tests. Real sign-in only happens through Firebase.
  const listeners = new Set();
  const session = () => { try { return area?.getItem(UID_KEY) || null; } catch { return null; } };
  const uidFor = email => `u${[...email].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7).toString(36)}${email.length}`;
  function current() {
    const id = session();
    if (!id) return null;
    refresh();
    const user = docs[`localusers/${id}`];
    if (!user) return { uid: id, email: `${id}@example.com`, displayName: id, verified: true };
    return { uid: user.uid, email: user.email, displayName: user.displayName, verified: user.verified };
  }
  const notify = () => listeners.forEach(fn => fn(current()));
  async function account(email, displayName, password, verified) {
    const uid = uidFor(email);
    refresh();
    if (!docs[`localusers/${uid}`]) { docs[`localusers/${uid}`] = { uid, email, displayName, password, verified }; persist(); }
    return docs[`localusers/${uid}`];
  }
  function startSession(user) {
    try { area?.setItem(UID_KEY, user.uid); } catch { /* blocked storage */ }
    notify();
    return current();
  }

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
    uid: () => session() || '',
    auth: {
      simulated: true,
      current,
      onChange(fn) { listeners.add(fn); queueMicrotask(() => fn(current())); return () => listeners.delete(fn); },
      async google() { return startSession(await account('you@gmail.example', 'Google User', '', true)); },
      async signUp(name, email, password) {
        const clean = email.trim().toLowerCase();
        refresh();
        if (docs[`localusers/${uidFor(clean)}`]) throw Object.assign(new Error('taken'), { code: 'auth/email-already-in-use' });
        return startSession(await account(clean, name, password, false));
      },
      async signIn(email, password) {
        const clean = email.trim().toLowerCase();
        refresh();
        const user = docs[`localusers/${uidFor(clean)}`];
        if (!user || user.password !== password) throw Object.assign(new Error('bad'), { code: 'auth/invalid-credential' });
        return startSession(user);
      },
      async sendVerification() {},
      async refresh() { refresh(); return current(); },
      async resetPassword() {},
      async signOut() { try { area?.removeItem(UID_KEY); } catch { /* blocked storage */ } notify(); },
      /** Stands in for tapping the link in the verification email. */
      async simulateVerify() {
        const user = current();
        if (user) await this.markVerified(user.uid);
      },
      async markVerified(uid) { docs[`localusers/${uid}`].verified = true; persist(); },
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
      const before = docs[path];
      const next = clone(before);
      for (const [f, v] of Object.entries(fields)) setDotted(next, f, clone(v));
      docs[path] = next;
      try { persist(); } catch (e) { docs[path] = before; return Promise.reject(e); }
      emit(path);
      return done(path);
    },
    remove(path) {
      refresh();
      delete docs[path];
      persist();
      emit(path);
      return Promise.resolve();
    },
    get(path) { refresh(); return Promise.resolve(clone(docs[path]) ?? null); },
    list(col) { refresh(); return Promise.resolve(clone(docsIn(col))); },
    watchDoc(path, cb) {
      const off = add(docWatchers, path, cb);
      queueMicrotask(() => { refresh(); cb(clone(docs[path]) ?? null); });
      return off;
    },
    watchCollection(col, cb, _err, { orderBy, limit } = {}) {
      const send = () => {
        refresh();
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
