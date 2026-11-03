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
test('account details come from the sign-in, including whether the email is verified', async () => {
  const sdk = fakeSdk({ user: { uid: 'u', email: 'a@x.co', displayName: 'A', emailVerified: false } });
  const backend = await createFirebaseBackend(config, sdk);
  assert.deepEqual(backend.auth.current(), { uid: 'u', email: 'a@x.co', displayName: 'A', verified: false });
  assert.equal(backend.uid(), 'u');
});
test('a verified email gets a fresh pass so the database sees it', async () => {
  let tokens = 0;
  const user = { uid: 'u', emailVerified: false, getIdToken: async force => { if (force) tokens += 1; } };
  const sdk = { ...fakeSdk({ user }), reload: async u => { u.emailVerified = true; } };
  const backend = await createFirebaseBackend(config, sdk);
  assert.equal((await backend.auth.refresh()).verified, true);
  assert.equal(tokens, 1);
});
test('an unverified email gets no new pass', async () => {
  let tokens = 0;
  const user = { uid: 'u', emailVerified: false, getIdToken: async () => { tokens += 1; } };
  const sdk = { ...fakeSdk({ user }), reload: async () => {} };
  const backend = await createFirebaseBackend(config, sdk);
  assert.equal((await backend.auth.refresh()).verified, false);
  assert.equal(tokens, 0);
});
test('creating an account sets the name and sends the email', async () => {
  const calls = [];
  const sdk = { ...fakeSdk(),
    createUserWithEmailAndPassword: async (_a, email) => { calls.push(`create:${email}`); return { user: { uid: 'n' } }; },
    updateProfile: async (_u, p) => { calls.push(`name:${p.displayName}`); },
    sendEmailVerification: async () => { calls.push('email'); } };
  const backend = await createFirebaseBackend(config, sdk);
  await backend.auth.signUp('Mia', ' mia@x.co ', 'secret1');
  assert.deepEqual(calls, ['create:mia@x.co', 'name:Mia', 'email']);
});
test('signing out clears the offline copy, even if that fails', async () => {
  const calls = [];
  const sdk = { ...fakeSdk({ user: { uid: 'u' } }), signOut: async () => { calls.push('out'); }, terminate: async () => { calls.push('term'); throw new Error('busy'); }, clearIndexedDbPersistence: async () => { calls.push('clear'); } };
  const backend = await createFirebaseBackend(config, sdk);
  await backend.auth.signOut();
  assert.deepEqual(calls, ['out', 'term']);
});
test('a refusal is passed on', async () => {
  const sdk = fakeSdk({ user: { uid: 'u' } });
  const backend = await createFirebaseBackend(config, sdk);
  let reported = 0;
  backend.watchDoc('trips/a', () => {}, () => { reported += 1; });
  sdk.snaps[0].err({ code: 'permission-denied' });
  assert.equal(reported, 1);
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
