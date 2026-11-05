import test from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SIMULATED_OWNER, cleanMessage, errorRecord, isOwnerAccount, peopleAcrossTrips } from '../../js/core/owner.js';
import { ownerUid } from '../../js/config/firebase.js';
import { createLocalBackend } from '../../js/data/backend-local.js';
import { createRepository } from '../../js/data/repository.js';

const memory = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) }; };

test('only the verified owner counts, and an unverified copy of the address does not', () => {
  const live = { ownerUid: 'boss' };
  assert.ok(isOwnerAccount({ uid: 'boss', email: 'boss@example.com', verified: true }, live));
  assert.ok(!isOwnerAccount({ uid: 'boss', email: 'boss@example.com', verified: false }, live));
  assert.ok(!isOwnerAccount({ uid: 'friend', email: 'friend@example.com', verified: true }, live));
  assert.ok(!isOwnerAccount(null, live));
  assert.ok(!isOwnerAccount({ email: SIMULATED_OWNER, verified: true }, live), 'the test owner means nothing on the real database');
  assert.ok(isOwnerAccount({ email: SIMULATED_OWNER, verified: true }, { simulated: true }));
  assert.ok(!isOwnerAccount({ email: 'a@example.com', verified: true }, { simulated: true }));
  assert.ok(isOwnerAccount({ email: 'a@example.com', verified: true }, { simulated: true, preview: true }));
});
test('the app and the rules name the same owner', () => {
  assert.ok(readFileSync('firestore.rules', 'utf8').includes(`request.auth.uid == '${ownerUid}'`));
});
test('problem reports are short and carry no email addresses from the message', () => {
  assert.equal(cleanMessage('failed for ana@example.com now'), 'failed for [email] now');
  const r = errorRecord({ id: 'x', kind: 'app-error', message: 'y'.repeat(999), where: 'w'.repeat(999), agent: 'a'.repeat(999), tripId: null, user: { uid: 'u' }, at: 1 });
  assert.equal(r.message.length, 300); assert.equal(r.where.length, 100); assert.equal(r.agent.length, 200);
  assert.equal(r.tripId, ''); assert.equal(r.email, '');
});
test('people are gathered across trips', () => {
  const people = peopleAcrossTrips([
    { id: 't1', name: 'One', members: { m: { name: 'Mia' } }, joined: [{ uid: 'a', email: 'a@x.io', displayName: 'A', at: 5, memberId: 'm' }] },
    { id: 't2', name: 'Two', members: {}, joined: [{ uid: 'a', email: 'a@x.io', at: 3, removed: true }, { uid: 'b', email: 'b@x.io', at: 9 }] },
  ]);
  assert.deepEqual(people.map(p => p.uid), ['b', 'a']);
  assert.equal(people[1].first, 3);
  assert.deepEqual(people[1].trips.map(t => [t.name, t.memberName, t.removed]), [['One', 'Mia', false], ['Two', '', true]]);
});
test('the overview counts entries and finds the latest activity', async () => {
  const backend = createLocalBackend({ area: memory() });
  await backend.auth.signUp('Ana', 'ana@example.com', 'pw');
  const repo = createRepository(backend);
  const { trip, written } = repo.createTrip({ name: 'T', currency: 'USD', memberNames: ['Ana', 'Ben'], profile: backend.auth.current() });
  await written;
  await backend.set(`trips/${trip.id}/entries/e1`, { id: 'e1', total: 5 });
  await backend.set(`trips/${trip.id}/activity/a1`, { id: 'a1', text: 'old', at: 1 });
  await backend.set(`trips/${trip.id}/activity/a2`, { id: 'a2', text: 'new', at: 9e15 });
  const [t] = await repo.ownerTrips();
  assert.equal(t.entryCount, 1); assert.equal(t.lastActivity.text, 'new');
  assert.deepEqual((await repo.ownerTrip(trip.id)).entries.map(e => e.id), ['e1']);
  await repo.logError({ id: 'r1', at: 1, message: 'm' });
  await repo.logError({ id: 'r2', at: 2, message: 'm' });
  assert.deepEqual((await repo.ownerErrors()).map(e => e.id), ['r2', 'r1']);
});
