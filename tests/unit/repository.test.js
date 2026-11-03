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
  const entry = { id: 'entry00000000001', tripId: trip.id, kind: 'expense', desc: 'D', category: 'food', date: '2026-01-01', currency: 'TWD', rate: 1, total: 10, paid: { [a]: 10 }, owed: { [b]: 10 }, comments: {}, createdAt: 5, deleted: false };
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
  const rebuilt = await fresh.createFromBackup(parseBackup(JSON.stringify(createBackup(trip, { x: entry }))));
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
