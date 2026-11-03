import test from 'node:test'; import assert from 'node:assert/strict';
import { createFirebaseBackend } from '../../js/data/backend-firebase.js';

/** A stand-in for the Firebase SDK that records the order of calls. */
function fakeSdk({ user = null, signInWorks = true } = {}) {
  const calls = [], authListeners = [];
  const auth = { currentUser: user };
  const setUser = u => { auth.currentUser = u; authListeners.splice(0).forEach(fn => fn(u)); };
  const snaps = [];
  return {
    calls, auth, setUser, snaps,
    initializeApp: () => { calls.push('app'); return {}; },
    ReCaptchaV3Provider: class { constructor(k) { this.key = k; } },
    initializeAppCheck: (_a, o) => { calls.push(`appcheck:${o.provider.key}:${o.isTokenAutoRefreshEnabled}`); },
    initializeFirestore: () => { calls.push('firestore'); return {}; },
    persistentLocalCache: () => ({}), persistentMultipleTabManager: () => ({}),
    getFirestore: () => ({}),
    getAuth: () => { calls.push('auth'); return auth; },
    onAuthStateChanged: (_a, fn) => { authListeners.push(fn); queueMicrotask(() => fn(auth.currentUser)); return () => {}; },
    signInAnonymously: async () => { calls.push('signin'); if (!signInWorks) throw new Error('offline'); setUser({ uid: 'u' }); },
    doc: (_d, p) => p, collection: (_d, p) => p, query: (c, ...x) => ({ c, x }), orderBy: f => f, limit: n => n,
    onSnapshot: (ref, a, b, c) => { const [next, err] = typeof a === 'function' ? [a, b] : [b, c]; const s = { ref, next, err, off: false }; snaps.push(s); return () => { s.off = true; }; },
  };
}
const config = { projectId: 'x' };

test('App Check starts before the database', async () => {
  const sdk = fakeSdk({ user: { uid: 'u' } });
  await createFirebaseBackend(config, sdk, { appCheckSiteKey: 'KEY' });
  assert.deepEqual(sdk.calls.slice(0, 3), ['app', 'appcheck:KEY:true', 'firestore']);
});
test('App Check stays off with no key', async () => {
  const sdk = fakeSdk({ user: { uid: 'u' } });
  await createFirebaseBackend(config, sdk);
  assert.ok(!sdk.calls.some(c => c.startsWith('appcheck')));
});
test('a new phone signs in invisibly and waits for it', async () => {
  const sdk = fakeSdk();
  await createFirebaseBackend(config, sdk);
  assert.ok(sdk.calls.includes('signin'));
  assert.equal(sdk.auth.currentUser.uid, 'u');
});
test('a returning phone reuses its sign-in', async () => {
  const sdk = fakeSdk({ user: { uid: 'saved' } });
  await createFirebaseBackend(config, sdk);
  assert.ok(!sdk.calls.includes('signin'));
});
test('offline at launch: the app still starts', async () => {
  const sdk = fakeSdk({ signInWorks: false });
  const backend = await createFirebaseBackend(config, sdk, { signInWaitMs: 10 });
  assert.equal(backend.kind, 'firebase');
});
test('a listener refused before sign-in restarts afterwards', async () => {
  const sdk = fakeSdk({ signInWorks: false });
  const backend = await createFirebaseBackend(config, sdk, { signInWaitMs: 10 });
  let reported = 0;
  backend.watchCollection('trips/a/entries', () => {}, () => { reported += 1; });
  sdk.snaps[0].err({ code: 'permission-denied' });
  assert.equal(sdk.snaps.length, 1);
  sdk.setUser({ uid: 'u' });
  await new Promise(r => setTimeout(r, 5));
  assert.equal(sdk.snaps.length, 2);
  assert.equal(reported, 0);
});
test('a refusal while signed in is reported', async () => {
  const sdk = fakeSdk({ user: { uid: 'u' } });
  const backend = await createFirebaseBackend(config, sdk);
  let reported = 0;
  backend.watchDoc('trips/a', () => {}, () => { reported += 1; });
  sdk.snaps[0].err({ code: 'permission-denied' });
  assert.equal(reported, 1);
  assert.equal(sdk.snaps.length, 1);
});
test('unsubscribing stops a pending restart', async () => {
  const sdk = fakeSdk({ signInWorks: false });
  const backend = await createFirebaseBackend(config, sdk, { signInWaitMs: 10 });
  const off = backend.watchDoc('trips/a', () => {}, () => {});
  sdk.snaps[0].err({ code: 'permission-denied' });
  off();
  sdk.setUser({ uid: 'u' });
  await new Promise(r => setTimeout(r, 5));
  assert.equal(sdk.snaps.length, 1);
});
test('a cached missing trip is not treated as gone', async () => {
  const sdk = fakeSdk({ user: { uid: 'u' } });
  const backend = await createFirebaseBackend(config, sdk);
  const seen = [];
  backend.watchDoc('trips/a', d => seen.push(d), () => {});
  sdk.snaps[0].next({ exists: () => false, metadata: { fromCache: true } });
  assert.deepEqual(seen, []);
  sdk.snaps[0].next({ exists: () => false, metadata: { fromCache: false } });
  assert.deepEqual(seen, [null]);
});
test('collections report which documents are still waiting to sync', async () => {
  const sdk = fakeSdk({ user: { uid: 'u' } });
  const backend = await createFirebaseBackend(config, sdk);
  let got;
  backend.watchCollection('trips/a/entries', (list, meta) => { got = { list, meta }; }, () => {});
  const doc = (id, waiting) => ({ id, data: () => ({ id }), metadata: { hasPendingWrites: waiting } });
  sdk.snaps[0].next({ docs: [doc('e1', true), doc('e2', false)] });
  assert.deepEqual(got.meta.pending, ['e1']);
  assert.equal(got.list.length, 2);
});
