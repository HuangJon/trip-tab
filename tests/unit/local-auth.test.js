import test from 'node:test'; import assert from 'node:assert/strict';
import { createLocalBackend } from '../../js/data/backend-local.js';

const area = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) }; };

test('the simulated sign-in needs verifying, and the same email is the same account', async () => {
  const shared = area(), { auth, uid } = createLocalBackend({ area: shared });
  assert.equal(auth.current(), null);
  const made = await auth.signUp('Mia', 'Mia@X.co', 'secret1');
  assert.equal(made.verified, false); assert.equal(made.email, 'mia@x.co');
  await auth.simulateVerify();
  assert.equal(auth.current().verified, true);
  const id = uid();
  await auth.signOut();
  assert.equal(auth.current(), null);
  await assert.rejects(auth.signIn('mia@x.co', 'wrong'), e => e.code === 'auth/invalid-credential');
  assert.equal((await auth.signIn('mia@x.co', 'secret1')).uid, id);
  await assert.rejects(auth.signUp('Other', 'mia@x.co', 'secret2'), e => e.code === 'auth/email-already-in-use');
});
