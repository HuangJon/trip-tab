import test from 'node:test'; import assert from 'node:assert/strict';
import { createLocalBackend } from '../../js/data/backend-local.js';
import { createRepository } from '../../js/data/repository.js';
import { createDevice } from '../../js/data/device.js';
import { createMemoryStorage } from '../../js/data/storage.js';
import { createBackup, parseBackup } from '../../js/core/backup.js';
import { TRIP_ID_PATTERN } from '../../js/core/ids.js';

const area = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const setup = async () => {
  const backend = createLocalBackend({ area: area() }), repo = createRepository(backend);
  const { trip, written } = repo.createTrip({ name: 'T', currency: 'TWD', memberNames: ['A', 'B'] });
  await written;
  const [a, b] = Object.keys(trip.members);
  const entry = { id: 'entry00000000001', tripId: trip.id, kind: 'expense', desc: 'D', category: 'food', date: '2026-01-01', currency: 'TWD', rate: 1, total: 10, paid: { [a]: 10 }, owed: { [b]: 10 }, comments: {}, createdAt: 5, updatedAt: 5, deleted: false };
  return { backend, repo, trip, a, b, entry };
};
const entriesOf = async (backend, id) => backend.list(`trips/${id}/entries`);

test('trip ids are long and match the rules', async () => {
  const { trip } = await setup();
  assert.ok(TRIP_ID_PATTERN.test(trip.id)); assert.equal(trip.id.length, 24);
});
test('two friends adding people at once both stay', async () => {
  const { backend, repo, trip } = await setup();
  await Promise.all([repo.addMember(trip, 'C', 'A').written, repo.addMember(trip, 'D', 'A').written]);
  const t = await backend.get(`trips/${trip.id}`);
  assert.deepEqual(Object.values(t.members).map(m => m.name).sort(), ['A', 'B', 'C', 'D']);
});
test('removing a person keeps their record', async () => {
  const { backend, repo, trip, b } = await setup();
  await repo.removeMember(trip.id, b);
  const t = await backend.get(`trips/${trip.id}`);
  assert.equal(t.members[b].removed, true); assert.equal(t.members[b].name, 'B');
});
test('editing an expense never erases a comment added meanwhile', async () => {
  const { backend, repo, trip, entry } = await setup();
  await repo.saveEntry(trip, entry, { isNew: true, actor: 'A', label: 'added' });
  await repo.addComment(trip, entry, 'B', 'Hi');
  await repo.saveEntry(trip, { ...entry, desc: 'New', comments: {} }, { isNew: false, actor: 'A', label: 'edited' });
  const [saved] = await entriesOf(backend, trip.id);
  assert.equal(saved.desc, 'New');
  assert.deepEqual(Object.values(saved.comments).map(c => c.text), ['Hi']);
  assert.equal(saved.createdAt, 5);
});
test('editing replaces who owes, leaving nobody behind', async () => {
  const { backend, repo, trip, entry, a, b } = await setup();
  await repo.saveEntry(trip, entry, { isNew: true, actor: 'A', label: 'added' });
  await repo.saveEntry(trip, { ...entry, owed: { [a]: 10 } }, { isNew: false, actor: 'A', label: 'edited' });
  const [saved] = await entriesOf(backend, trip.id);
  assert.equal(saved.owed[b], undefined);
});
test('deleting an expense marks it and can be undone', async () => {
  const { backend, repo, trip, entry } = await setup();
  await repo.saveEntry(trip, entry, { isNew: true, actor: 'A', label: 'added' });
  await repo.setEntryDeleted(trip, entry.id, true, 'A', 'x');
  assert.equal((await entriesOf(backend, trip.id))[0].deleted, true);
  await repo.setEntryDeleted(trip, entry.id, false, 'A', 'x');
  assert.equal((await entriesOf(backend, trip.id))[0].deleted, false);
});
test('deleting a trip keeps its data and restoring brings it back', async () => {
  const { backend, repo, trip } = await setup();
  await repo.deleteTrip(trip.id, 99);
  assert.equal((await backend.get(`trips/${trip.id}`)).deletedAt, 99);
  await repo.restoreTrip(trip.id);
  assert.equal((await backend.get(`trips/${trip.id}`)).deletedAt, null);
});
test('watchers skip damaged entries from another phone', async () => {
  const { backend, repo, trip, entry } = await setup();
  await backend.set(`trips/${trip.id}/entries/bad`, { id: 'bad', kind: 'expense', total: -5 });
  await repo.saveEntry(trip, entry, { isNew: true, actor: 'A', label: 'added' });
  const got = await new Promise(r => repo.watchEntries(trip.id, r));
  assert.deepEqual(Object.keys(got), [entry.id]);
});
test('a missing trip reads as null', async () => {
  const { repo } = await setup();
  assert.equal(await new Promise(r => repo.watchTrip('nope', r)), null);
});
test('import merges by id and deletes nothing', async () => {
  const { backend, repo, trip, entry } = await setup();
  await repo.saveEntry(trip, entry, { isNew: true, actor: 'A', label: 'added' });
  await repo.saveEntry(trip, { ...entry, id: 'entry00000000002', desc: 'Only here' }, { isNew: true, actor: 'A', label: 'added' });
  const backup = parseBackup(JSON.stringify(createBackup({ ...trip, members: { ...trip.members, zzz: { name: 'Z', order: 9 } } }, { x: { ...entry, desc: 'From backup' } })));
  await repo.importBackup(trip, backup);
  const list = await entriesOf(backend, trip.id);
  assert.deepEqual(list.map(e => e.desc).sort(), ['From backup', 'Only here']);
  assert.equal((await backend.get(`trips/${trip.id}`)).members.zzz.name, 'Z');
});
test('a trip can be rebuilt from a copy', async () => {
  const { backend, repo, trip, entry } = await setup();
  const fresh = createRepository(createLocalBackend({ area: area() }));
  const { trip: rebuilt } = await fresh.createFromBackup(parseBackup(JSON.stringify(createBackup(trip, { x: entry }))));
  assert.equal(rebuilt.id, trip.id);
  assert.ok(backend);
});
test('updating a missing document fails like Firestore', async () => {
  const backend = createLocalBackend({ area: area() });
  await assert.rejects(backend.update('trips/none', { a: 1 }));
});
test('device keeps one safety copy a day, three at most', () => {
  let t = Date.UTC(2026, 0, 1);
  const d = createDevice(createMemoryStorage(), () => t);
  for (let i = 0; i < 5; i++) { d.snapshot('x', { n: i }); d.snapshot('x', { n: i + 0.5 }); t += 86400000; }
  const list = d.snapshots('x');
  assert.equal(list.length, 3);
  assert.equal(list[0].backup.n, 4.5);
});
test('device remembers trips, who you are and drafts', () => {
  const d = createDevice(createMemoryStorage());
  d.addTrip('a'); d.addTrip('a'); d.addTrip('b');
  assert.deepEqual(d.trips(), ['b', 'a']);
  d.removeTrip('a'); assert.deepEqual(d.trips(), ['b']);
  d.setMe('b', 'm'); assert.equal(d.me('b'), 'm');
  d.saveDraft('b', { desc: 'x' }); assert.equal(d.draft('b').desc, 'x');
  d.clearDraft('b'); assert.equal(d.draft('b'), null);
});

test('editing files the old version, and it can be listed', async () => {
  const { repo, trip, entry } = await setup();
  await repo.saveEntry(trip, entry, { isNew: true, actor: 'A', label: 'added' });
  await repo.saveEntry(trip, { ...entry, desc: 'Second' }, { isNew: false, previous: entry, actor: 'A', label: 'edited' });
  const [rev] = await repo.listRevisions(trip.id, entry.id);
  assert.equal(rev.entry.desc, 'D'); assert.equal(rev.by, 'A'); assert.equal(rev.entry.comments, undefined);
});
test('a save that does not add up is refused before writing', async () => {
  const { backend, repo, trip, entry } = await setup();
  await assert.rejects(repo.saveEntry(trip, { ...entry, total: 99 }, { isNew: true, actor: 'A', label: 'added' }));
  assert.equal((await entriesOf(backend, trip.id)).length, 0);
});
test('offline: every write starts even though none can finish', async () => {
  let hang = false;
  const backend = createLocalBackend({ area: area(), hangWrites: () => hang }), repo = createRepository(backend);
  const { trip, written } = repo.createTrip({ name: 'T', currency: 'TWD', memberNames: ['A', 'B'] });
  await written;
  const [a, b] = Object.keys(trip.members);
  const entry = { id: 'entry00000000001', tripId: trip.id, kind: 'expense', desc: 'D', category: 'food', date: '2026-01-01', currency: 'TWD', rate: 1, total: 10, paid: { [a]: 10 }, owed: { [b]: 10 }, comments: {}, createdAt: 5, updatedAt: 5, deleted: false };
  await repo.saveEntry(trip, entry, { isNew: true, actor: 'A', label: 'added' });
  hang = true;
  const activityBefore = (await backend.list(`trips/${trip.id}/activity`)).length;
  repo.saveEntry(trip, { ...entry, desc: 'New' }, { isNew: false, previous: entry, actor: 'A', label: 'edited' });
  repo.addComment(trip, entry, 'B', 'Hi');
  repo.setEntryDeleted(trip, entry.id, true, 'A', 'x');
  repo.addMember(trip, 'C', 'A');
  const [saved] = await entriesOf(backend, trip.id);
  assert.equal(saved.desc, 'New'); assert.equal(saved.deleted, true); assert.equal(Object.keys(saved.comments).length, 1);
  assert.equal((await repo.listRevisions(trip.id, entry.id)).length, 1);
  assert.equal((await backend.list(`trips/${trip.id}/activity`)).length, activityBefore + 4);
  assert.equal(Object.keys((await backend.get(`trips/${trip.id}`)).members).length, 3);
});
test('damaged entries are counted, not silently dropped', async () => {
  const { backend, repo, trip } = await setup();
  await backend.set(`trips/${trip.id}/entries/bad`, { id: 'bad', kind: 'expense', total: -5 });
  const skipped = await new Promise(r => repo.watchEntries(trip.id, (_e, n) => r(n)));
  assert.equal(skipped, 1);
});
test('import keeps new comments, files what it replaces and skips what is unchanged', async () => {
  const { backend, repo, trip, entry } = await setup();
  await repo.saveEntry(trip, entry, { isNew: true, actor: 'A', label: 'added' });
  await repo.addComment(trip, entry, 'B', 'Keep me');
  const [saved] = await entriesOf(backend, trip.id);
  assert.equal(await repo.importBackup(trip, { trip, entries: [saved] }, 'A'), 0);
  assert.equal((await repo.listRevisions(trip.id, entry.id)).length, 0);
  assert.equal(await repo.importBackup(trip, { trip, entries: [{ ...entry, desc: 'Old', comments: {} }] }, 'A'), 1);
  const [after] = await entriesOf(backend, trip.id);
  assert.equal(after.desc, 'Old');
  assert.deepEqual(Object.values(after.comments).map(c => c.text), ['Keep me']);
  assert.equal((await repo.listRevisions(trip.id, entry.id))[0].entry.desc, 'D');
});
test('replacing a link copies everything and the old trip keeps no pointer to the new one', async () => {
  const { backend, repo, trip, entry } = await setup();
  const r = repo.saveReceipt(trip.id, 'data:image/jpeg;base64,AA'); await r.written;
  const withPhoto = { ...entry, receipt: r.id };
  await repo.saveEntry(trip, withPhoto, { isNew: true, actor: 'A', label: 'added' });
  const { trip: moved } = await repo.replaceLink(trip, { [entry.id]: withPhoto }, 'A');
  assert.notEqual(moved.id, trip.id);
  const [copied] = await entriesOf(backend, moved.id);
  assert.equal(copied.tripId, moved.id);
  assert.ok(await repo.getReceipt(moved.id, r.id));
  const old = await backend.get(`trips/${trip.id}`);
  assert.ok(old.retiredAt);
  assert.ok(!JSON.stringify(old).includes(moved.id));
  await repo.keepOldLink(trip.id);
  assert.equal((await backend.get(`trips/${trip.id}`)).retiredAt, null);
});
test('a failed move leaves the old trip working', async () => {
  const inner = createLocalBackend({ area: area() }), repo0 = createRepository(inner);
  const { trip, written } = repo0.createTrip({ name: 'T', currency: 'TWD', memberNames: ['A'] });
  await written;
  const failing = { ...inner, set: p => (p.includes('/activity/') ? Promise.reject(new Error('down')) : inner.set(p, {})) };
  await assert.rejects(createRepository(failing).replaceLink(trip, {}, 'A'));
  assert.equal((await inner.get(`trips/${trip.id}`)).retiredAt, undefined);
});

test('payment details save per field without touching anything else', async () => {
  const { backend, repo, trip, a } = await setup();
  await repo.setMemberPayment(trip.id, a, 'venmo', '@ana');
  await repo.setMemberPayment(trip.id, a, 'zelle', 'ana@x.co');
  const m = (await backend.get(`trips/${trip.id}`)).members[a];
  assert.deepEqual([m.name, m.venmo, m.zelle], ['A', '@ana', 'ana@x.co']);
});
test('entries waiting to sync are reported until they arrive', async () => {
  let hang = true;
  const listeners = [];
  const realAdd = globalThis.addEventListener;
  globalThis.addEventListener = (n, f) => { if (n === 'online') listeners.push(f); };
  const backend = createLocalBackend({ area: area(), hangWrites: () => hang });
  globalThis.addEventListener = realAdd;
  backend.set('trips/t/entries/e1', { id: 'e1' });
  const seen = [];
  backend.watchCollection('trips/t/entries', (_l, meta) => seen.push(meta.pending));
  await new Promise(r => setTimeout(r, 1));
  assert.deepEqual(seen.at(-1), ['e1']);
  hang = false;
  listeners.forEach(f => f());
  assert.deepEqual(seen.at(-1), []);
});
test('archiving stays on this phone; refused changes are remembered until dismissed', () => {
  const d = createDevice(createMemoryStorage());
  d.setArchived('a', true); assert.deepEqual(d.archived(), ['a']);
  d.setArchived('a', false); assert.deepEqual(d.archived(), []);
  d.addFailedChange('x'); assert.equal(d.failedChanges()[0].text, 'x');
  d.clearFailedChanges(); assert.deepEqual(d.failedChanges(), []);
});

test('the creator claims the first name and becomes admin', async () => {
  const { backend, trip, a, b } = await setup();
  const t = await backend.get(`trips/${trip.id}`);
  assert.deepEqual(t.admins, { [a]: true });
  assert.equal(t.members[a].claimed, true); assert.equal(t.members[b].claimed, undefined);
  const claim = await backend.get(`trips/${trip.id}/claims/${a}`);
  assert.equal(claim.uid, backend.uid());
});
function twoPhones() {
  const shared = area();
  const phone = name => {
    const backend = createLocalBackend({ area: { getItem: k => (k.endsWith('local-uid') ? name : shared.getItem(k)), setItem: (k, v) => { if (!k.endsWith('local-uid')) shared.setItem(k, v); } } });
    return { backend, repo: createRepository(backend) };
  };
  return phone;
}
test('a name can only be claimed once', async () => {
  const phone = twoPhones(), one = phone('one'), two = phone('two');
  const { trip, written } = one.repo.createTrip({ name: 'T', currency: 'TWD', memberNames: ['A', 'B'] });
  await written;
  const [a, b] = Object.keys(trip.members);
  await assert.rejects(two.repo.claimMember(trip.id, a), e => e.code === 'taken');
  await two.repo.recordJoin(trip.id, {});
  await two.repo.claimMember(trip.id, b);
  assert.equal((await phone('two').backend.get(`trips/${trip.id}`)).members[b].claimed, true);
});
test('a freed name can be claimed fresh, and whoever held it loses it', async () => {
  const phone = twoPhones(), one = phone('one'), three = phone('three');
  const { trip, written } = one.repo.createTrip({ name: 'T', currency: 'TWD', memberNames: ['A', 'B'] });
  await written;
  const [a, b] = Object.keys(trip.members);
  await three.repo.recordJoin(trip.id, { displayName: 'Three', email: '3@x.co' });
  await three.repo.claimMember(trip.id, b);
  assert.equal((await three.backend.get(`trips/${trip.id}/joined/three`)).memberId, b);
  await one.repo.releaseClaim(trip.id, b, a);
  assert.equal((await one.backend.get(`trips/${trip.id}`)).members[b].claimed, false);
  assert.equal((await one.backend.get(`trips/${trip.id}/joined/three`)).memberId, null);
  const four = phone('four');
  await four.repo.recordJoin(trip.id, {});
  assert.equal((await four.repo.claimMember(trip.id, b)).uid, 'four');
});
test('opening a trip records who joined, even before they pick a name', async () => {
  const phone = twoPhones(), one = phone('one'), two = phone('two');
  const { trip, written } = one.repo.createTrip({ name: 'T', currency: 'TWD', memberNames: ['A'], profile: { displayName: 'A', email: 'a@x.co' } });
  await written;
  await two.repo.recordJoin(trip.id, { displayName: 'Rui', email: 'rui@x.co' });
  const list = await new Promise(r => one.repo.watchJoined(trip.id, r));
  assert.deepEqual(list.map(p => [p.email, Boolean(p.memberId)]).sort(), [['a@x.co', true], ['rui@x.co', false]]);
  assert.deepEqual(await new Promise(r => two.repo.watchMyTrips(r)), [trip.id]);
});
test('joining again keeps your name', async () => {
  const phone = twoPhones(), one = phone('one'), two = phone('two');
  const { trip, written } = one.repo.createTrip({ name: 'T', currency: 'TWD', memberNames: ['A', 'B'] });
  await written;
  const b = Object.keys(trip.members)[1];
  await two.repo.recordJoin(trip.id, {});
  await two.repo.claimMember(trip.id, b);
  await phone('two').repo.recordJoin(trip.id, {});
  assert.equal((await two.backend.get(`trips/${trip.id}/joined/two`)).memberId, b);
});
test('removing someone frees their name and can be undone', async () => {
  const phone = twoPhones(), one = phone('one'), two = phone('two');
  const { trip, written } = one.repo.createTrip({ name: 'T', currency: 'TWD', memberNames: ['A', 'B'] });
  await written;
  const [a, b] = Object.keys(trip.members);
  await two.repo.recordJoin(trip.id, {});
  await two.repo.claimMember(trip.id, b);
  const person = await one.backend.get(`trips/${trip.id}/joined/two`);
  await one.repo.removePerson(trip.id, person, a);
  const after = await one.backend.get(`trips/${trip.id}/joined/two`);
  assert.equal(after.removed, true); assert.equal(after.memberId, null);
  assert.equal((await one.backend.get(`trips/${trip.id}`)).members[b].claimed, false);
  assert.equal((await one.backend.get(`trips/${trip.id}/claims/${b}`)).released, true);
  await one.repo.letBackIn(trip.id, 'two');
  assert.equal((await one.backend.get(`trips/${trip.id}/joined/two`)).removed, false);
});
test('a removed person joining again stays removed', async () => {
  const phone = twoPhones(), one = phone('one'), two = phone('two');
  const { trip, written } = one.repo.createTrip({ name: 'T', currency: 'TWD', memberNames: ['A'] });
  await written;
  await two.repo.recordJoin(trip.id, {});
  await one.repo.removePerson(trip.id, await one.backend.get(`trips/${trip.id}/joined/two`), Object.keys(trip.members)[0]);
  await two.repo.leaveMyList(trip.id);
  await two.repo.recordJoin(trip.id, {});
  assert.equal((await two.backend.get(`trips/${trip.id}/joined/two`)).removed, true);
  assert.deepEqual(await new Promise(r => two.repo.watchMyTrips(r)), []);
});
test('joining adds the person and locks their name', async () => {
  const phone = twoPhones(), one = phone('one'), two = phone('two');
  const { trip, written } = one.repo.createTrip({ name: 'T', currency: 'TWD', memberNames: ['A'] });
  await written;
  await two.repo.recordJoin(trip.id, {});
  const { memberId } = await two.repo.joinAs(trip, 'Rui');
  const t = await two.backend.get(`trips/${trip.id}`);
  assert.equal(t.members[memberId].name, 'Rui'); assert.equal(t.members[memberId].claimed, true);
  assert.equal((await two.backend.get(`trips/${trip.id}/claims/${memberId}`)).uid, 'two');
  assert.equal((await two.backend.get(`trips/${trip.id}/joined/two`)).memberId, memberId);
});
test('writes name the person making them', async () => {
  const { backend, repo, trip, entry, a } = await setup();
  await repo.saveEntry(trip, entry, { isNew: true, actor: 'A', actorId: a, label: 'added' });
  const [saved] = await entriesOf(backend, trip.id);
  assert.equal(saved.updatedById, a);
  const log = await backend.list(`trips/${trip.id}/activity`);
  assert.ok(log.some(x => x.byId === a));
  await repo.renameMember(trip.id, a, 'New', a);
  assert.equal((await backend.get(`trips/${trip.id}`)).changedBy, a);
});
test('edits never change who added an expense', async () => {
  const { backend, repo, trip, entry, a, b } = await setup();
  await repo.saveEntry(trip, { ...entry, createdById: a }, { isNew: true, actor: 'A', actorId: a, label: 'added' });
  await repo.saveEntry(trip, { ...entry, createdById: b, desc: 'E' }, { isNew: false, previous: entry, actor: 'B', actorId: b, label: 'edited' });
  assert.equal((await entriesOf(backend, trip.id))[0].createdById, a);
});
test('moving a link keeps only the mover as admin; others claim again', async () => {
  const { backend, repo, trip, a, b } = await setup();
  const { trip: moved, claim } = await repo.replaceLink(trip, {}, 'A', a);
  const t = await backend.get(`trips/${moved.id}`);
  assert.deepEqual(t.admins, { [a]: true });
  assert.equal(t.members[a].claimed, true); assert.equal(t.members[b].claimed, false);
  assert.equal(claim.memberId, a);
});

test('recent choices and the one-time welcome are remembered per trip', () => {
  const d = createDevice(createMemoryStorage());
  assert.deepEqual(d.recent('a'), {});
  d.setRecent('a', { category: 'food', payer: 'm' });
  assert.equal(d.recent('a').payer, 'm'); assert.deepEqual(d.recent('b'), {});
  assert.equal(d.needsWelcome('a'), false);
  d.setNeedsWelcome('a', true); assert.equal(d.needsWelcome('a'), true);
  d.setNeedsWelcome('a', false); assert.equal(d.needsWelcome('a'), false);
});
