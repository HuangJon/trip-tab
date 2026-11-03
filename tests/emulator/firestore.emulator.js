/**
 * Runs the real Firebase backend and rules against the Firestore emulator:
 *   npm run test:rules
 */
import assert from 'node:assert/strict';
import * as app from 'firebase/app';
import * as store from 'firebase/firestore';
import * as authSdk from 'firebase/auth';
import { createFirebaseBackend } from '../../js/data/backend-firebase.js';
import { createRepository } from '../../js/data/repository.js';

// The real backend, with the phone-only offline cache swapped for one that works in Node.
const sdk = {
  ...app, ...store, ...authSdk,
  getAuth: a => {
    const auth = authSdk.getAuth(a);
    if (!auth.emulatorConfig) authSdk.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    return auth;
  },
  persistentLocalCache: () => store.memoryLocalCache(),
  persistentMultipleTabManager: () => undefined,
  initializeFirestore: (a, options) => {
    const instance = store.initializeFirestore(a, options);
    store.connectFirestoreEmulator(instance, '127.0.0.1', 8181);
    return instance;
  },
};
const backend = await createFirebaseBackend({ projectId: 'demo-trip-tab', apiKey: 'x' }, sdk);
const { db } = backend;
const repo = createRepository(backend);
const refused = p => assert.rejects(p, /permission|PERMISSION/);

const { trip, written } = repo.createTrip({ name: 'Rules test', currency: 'TWD', memberNames: ['A', 'B'] });
await written;
const [a, b] = Object.keys(trip.members);
const entry = { id: 'entry00000000001', tripId: trip.id, kind: 'expense', desc: 'D', category: 'food', date: '2026-01-01', currency: 'TWD', rate: 1, total: 10, paid: { [a]: 10 }, owed: { [b]: 10 }, note: '', comments: {}, createdAt: 5, updatedAt: 5, updatedBy: 'A', deleted: false };

// What the app does has to be allowed.
await repo.saveEntry(trip, entry, { isNew: true, actor: 'A', label: 'added' });
await repo.addComment(trip, entry, 'B', 'Hi');
await repo.saveEntry(trip, { ...entry, desc: 'Edited', updatedAt: 6 }, { isNew: false, previous: entry, actor: 'A', label: 'edited' });
await repo.setEntryDeleted(trip, entry.id, true, 'A', 'x');
await repo.setEntryDeleted(trip, entry.id, false, 'A', 'x');
await repo.addMember(trip, 'C', 'A').written;
await repo.renameMember(trip.id, a, 'Ana');
await repo.removeMember(trip.id, b);
await repo.updateTrip(trip.id, { 'rates.JPY': 0.21, simplify: false });
const receipt = repo.saveReceipt(trip.id, 'data:image/jpeg;base64,AAAA');
await receipt.written;
assert.ok((await repo.getReceipt(trip.id, receipt.id)).dataUrl);
await repo.deleteTrip(trip.id);
await repo.restoreTrip(trip.id);
const saved = (await backend.list(`trips/${trip.id}/entries`))[0];
assert.equal(saved.desc, 'Edited');
assert.equal(Object.keys(saved.comments).length, 1);
assert.equal(saved.createdAt, 5);
assert.equal((await repo.listRevisions(trip.id, entry.id)).length, 1);
await repo.importBackup(trip, { trip, entries: [{ ...entry, desc: 'From backup', comments: {} }] }, 'A');
assert.equal((await repo.listRevisions(trip.id, entry.id)).length, 2);
assert.equal(Object.keys((await backend.list(`trips/${trip.id}/entries`))[0].comments).length, 1, 'import keeps comments');
const moved = await repo.replaceLink(await backend.get(`trips/${trip.id}`), { [entry.id]: (await backend.list(`trips/${trip.id}/entries`))[0] }, 'A');
assert.equal((await backend.list(`trips/${moved.id}/entries`)).length, 1);
assert.ok((await backend.get(`trips/${trip.id}`)).retiredAt);
await repo.keepOldLink(trip.id);

// What should never happen has to be refused.
await refused(sdk.getDocs(sdk.collection(db, 'trips')));
await refused(sdk.deleteDoc(sdk.doc(db, `trips/${trip.id}`)));
await refused(sdk.deleteDoc(sdk.doc(db, `trips/${trip.id}/entries/${entry.id}`)));
await refused(sdk.getDocs(sdk.collection(db, `trips/${trip.id}/receipts`)));
await refused(backend.set('trips/short', { id: 'short', name: 'x', currency: 'TWD', members: {} }));
await refused(backend.update(`trips/${trip.id}`, { currency: 'USD' }));
await refused(backend.set(`trips/${trip.id}/entries/entry00000000002`, { ...entry, id: 'entry00000000002', total: -5 }));
await refused(backend.set(`trips/${trip.id}/receipts/receipt000000001`, { dataUrl: 'javascript:alert(1)' }));
await refused(backend.set(`other/thing`, { a: 1 }));
const entryPath = `trips/${trip.id}/entries/${entry.id}`;
await refused(backend.update(entryPath, { comments: {} }));
await refused(backend.update(entryPath, { createdAt: 99 }));
await refused(backend.update(entryPath, { kind: 'payment' }));
await refused(backend.set(`trips/${trip.id}/entries/entry00000000003`, { ...entry, id: 'entry00000000003', desc: 'x'.repeat(81) }));
await refused(backend.set(`trips/${trip.id}/entries/entry00000000003`, { ...entry, id: 'entry00000000003', kind: 'payment', paid: { [a]: 5, [b]: 5 } }));
await refused(backend.set(`trips/${trip.id}/entries/entry00000000003`, { ...entry, id: 'entry00000000003', rate: 0 }));
const [rev] = await repo.listRevisions(trip.id, entry.id);
await refused(backend.update(`${entryPath}/revisions/${rev.id}`, { by: 'Forged' }));
await refused(sdk.deleteDoc(sdk.doc(db, `${entryPath}/revisions/${rev.id}`)));

// A phone that hasn't signed in gets nothing, even with the right link.
const stranger = store.initializeFirestore(app.initializeApp({ projectId: 'demo-trip-tab', apiKey: 'x' }, 'stranger'), {});
store.connectFirestoreEmulator(stranger, '127.0.0.1', 8181);
await refused(store.getDoc(store.doc(stranger, `trips/${trip.id}`)));
console.log('Emulator checks passed');
process.exit(0);
