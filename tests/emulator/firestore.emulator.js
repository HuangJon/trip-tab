/**
 * Runs the real Firebase backend and rules against the emulators, as several different accounts:
 *   npm run test:rules
 */
import assert from 'node:assert/strict';
import * as app from 'firebase/app';
import * as store from 'firebase/firestore';
import * as authSdk from 'firebase/auth';
import { createFirebaseBackend } from '../../js/data/backend-firebase.js';
import { createRepository } from '../../js/data/repository.js';

let phones = 0;
function phoneSdk() {
  const name = `phone${phones += 1}`;
  return {
    ...app, ...store, ...authSdk,
    initializeApp: config => app.initializeApp(config, name),
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
}
const config = { projectId: 'demo-trip-tab', apiKey: 'x' };
let people = 0;
/** A verified account. The emulator accepts a made-up Google identity, which counts as verified. */
const newPhone = async (email = `person${people += 1}@example.com`) => {
  const backend = await createFirebaseBackend(config, phoneSdk());
  await authSdk.signInWithCredential(backend.firebaseAuth, authSdk.GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, email_verified: true, name: email })));
  return { backend, repo: createRepository(backend), profile: backend.auth.current() };
};
const refused = (p, why) => assert.rejects(p, /permission|PERMISSION/, why);

const admin = await newPhone(), friend = await newPhone(), stranger = await newPhone();
assert.ok(admin.backend.uid()); assert.notEqual(admin.backend.uid(), friend.backend.uid());

/* The admin creates a trip. */
const { trip, written } = admin.repo.createTrip({ name: 'Rules test', currency: 'TWD', memberNames: ['Ana', 'Ben'], profile: admin.profile });
await written;

/* Nobody reads a trip without verifying and joining. */
const unverified = await createFirebaseBackend(config, phoneSdk());
await authSdk.createUserWithEmailAndPassword(unverified.firebaseAuth, 'unverified@example.com', 'password1');
await refused(unverified.get(`trips/${trip.id}`), 'an unverified account gets nothing');
await refused(unverified.set(`trips/${trip.id}/joined/${unverified.uid()}`, { uid: unverified.uid(), tripId: trip.id, displayName: 'x', email: 'x', memberId: null, removed: false, at: 1 }), 'an unverified account cannot join');
await refused(friend.backend.get(`trips/${trip.id}`), 'a verified account has to join first');
await friend.repo.recordJoin(trip.id, friend.profile);
await stranger.repo.recordJoin(trip.id, stranger.profile);
assert.ok(await friend.backend.get(`trips/${trip.id}`));
assert.equal((await admin.backend.list(`trips/${trip.id}/joined`)).length, 3, 'the admin sees everyone, named or not');
await refused(friend.backend.list(`trips/${trip.id}/joined`), 'only admins see the joined list');
await refused(friend.backend.get(`trips/${trip.id}/joined/${admin.backend.uid()}`), "others' emails stay private");
await refused(friend.backend.update(`trips/${trip.id}/joined/${stranger.backend.uid()}`, { removed: true }), "only admins remove people");
const [a, b] = Object.keys(trip.members);
const entryFor = (id, by) => ({ id, tripId: trip.id, kind: 'expense', desc: 'D', category: 'food', date: '2026-01-01', currency: 'TWD', rate: 1, total: 10, paid: { [by]: 10 }, owed: { [a]: 5, [b]: 5 }, note: '', comments: {}, createdAt: 5, updatedAt: 5, updatedBy: 'x', createdById: by, deleted: false });
const save = (phone, e, opts) => phone.repo.saveEntry(trip, e, { actor: 'x', label: 'x', ...opts });

/* Claiming names. */
await refused(stranger.backend.set(`trips/${trip.id}/entries/entry00000000099`, { ...entryFor('entry00000000099', a), updatedById: a }), 'cannot act as a name claimed by another phone');
const benClaim = await friend.repo.claimMember(trip.id, b);
await assert.rejects(stranger.repo.claimMember(trip.id, b), /Taken/);
await assert.rejects(stranger.repo.claimMember(trip.id, a), /Taken/);
await refused(stranger.backend.set(`trips/${trip.id}/claims/${b}`, { tripId: trip.id, memberId: b, uid: stranger.backend.uid(), at: 1, released: false }), 'cannot overwrite a claim');

/* Adding and changing expenses. */
const benEntry = entryFor('entry00000000001', b), anaEntry = entryFor('entry00000000002', a);
await save(friend, benEntry, { isNew: true, actorId: b });
await save(admin, anaEntry, { isNew: true, actorId: a });
await refused(save(friend, { ...entryFor('entry00000000003', a) }, { isNew: true, actorId: a }), "cannot add as someone else");
await refused(save(friend, { ...anaEntry, desc: 'Hacked' }, { isNew: false, previous: anaEntry, actorId: b }), "cannot edit someone else's expense");
await refused(friend.repo.setEntryDeleted(trip, anaEntry.id, true, 'Ben', 'x', b), "cannot delete someone else's expense");
await save(friend, { ...benEntry, desc: 'Fixed', updatedAt: 6 }, { isNew: false, previous: benEntry, actorId: b });
await save(admin, { ...benEntry, desc: 'Admin fixed', updatedAt: 7 }, { isNew: false, previous: benEntry, actorId: a });
await admin.repo.setEntryDeleted(trip, benEntry.id, true, 'Ana', 'x', a);
await admin.repo.setEntryDeleted(trip, benEntry.id, false, 'Ana', 'x', a);
await friend.repo.addComment(trip, anaEntry, 'Ben', 'Hi', b);
await refused(friend.backend.update(`trips/${trip.id}/entries/${anaEntry.id}`, { comments: {}, commentedBy: b }), 'cannot wipe comments');
const saved = (await admin.backend.list(`trips/${trip.id}/entries`)).find(e => e.id === benEntry.id);
assert.equal(saved.desc, 'Admin fixed'); assert.equal(saved.createdById, b); assert.equal(saved.createdAt, 5);
assert.equal((await admin.repo.listRevisions(trip.id, benEntry.id)).length, 2);

/* A refund: the receiver can change it. */
const refund = { ...entryFor('entry00000000004', b), kind: 'refund', paid: { [a]: 5, [b]: 5 }, owed: { [b]: 10 } };
await save(friend, refund, { isNew: true, actorId: b });
await save(friend, { ...refund, desc: 'Refund fixed' }, { isNew: false, previous: refund, actorId: b });

/* Names, payment details and trip settings. */
await friend.repo.renameMember(trip.id, b, 'Benny', b);
await friend.repo.setMemberPayment(trip.id, b, 'venmo', '@ben', b);
await friend.repo.updateTrip(trip.id, { 'rates.JPY': 0.21 }, b);
await refused(friend.repo.renameMember(trip.id, a, 'Hacked', b), "cannot rename someone else");
await refused(friend.repo.setMemberPayment(trip.id, a, 'venmo', '@scam', b), "cannot change someone else's Venmo");
await refused(friend.repo.setAdmin(trip.id, b, friend.backend.uid(), true, b), 'cannot promote yourself');
await refused(friend.repo.updateTrip(trip.id, { name: 'Hacked' }, b), 'only admins rename the trip');
await refused(friend.repo.deleteTrip(trip.id, 1, b), 'only admins delete the trip');
await refused(friend.repo.updateTrip(trip.id, { 'rates.JPY': 1 }, a), 'cannot act as the admin by naming them');
await admin.repo.renameMember(trip.id, b, 'Ben', a);
await admin.repo.updateTrip(trip.id, { simplify: false }, a);
await admin.repo.addMember(trip, 'Chi', 'Ana', a).written;

/* A stranger joins through the link. */
const joined = await stranger.repo.joinAs(trip, 'Rui');
await stranger.repo.renameMember(trip.id, joined.memberId, 'Ruiz', joined.memberId);

/* The same account on a new device keeps its name. */
const benAgain = await newPhone(friend.profile.email);
assert.equal(benAgain.backend.uid(), friend.backend.uid());
await benAgain.repo.renameMember(trip.id, b, 'Ben N', b);

/* An admin frees a name. */
const lost = await newPhone();
await lost.repo.recordJoin(trip.id, lost.profile);
await refused(lost.repo.releaseClaim(trip.id, b, b), 'only admins free names');
await admin.repo.releaseClaim(trip.id, b, a);
await refused(friend.repo.renameMember(trip.id, b, 'Freed', b), 'a freed name stops working');
await lost.repo.claimMember(trip.id, b);
await lost.repo.renameMember(trip.id, b, 'Ben again', b);

/* An admin removes someone who forwarded their way in. */
const joinedList = await admin.backend.list(`trips/${trip.id}/joined`);
const rui = joinedList.find(p => p.uid === stranger.backend.uid());
assert.equal(rui.memberId, joined.memberId);
await admin.repo.removePerson(trip.id, rui, a);
await refused(stranger.backend.get(`trips/${trip.id}`), 'someone removed cannot read the trip');
await refused(stranger.backend.list(`trips/${trip.id}/entries`), 'or its expenses');
await refused(stranger.repo.renameMember(trip.id, joined.memberId, 'Back', joined.memberId), 'or change anything');
await refused(stranger.backend.update(`trips/${trip.id}/joined/${rui.uid}`, { removed: false }), 'or let themselves back in');
await admin.repo.letBackIn(trip.id, rui.uid);
assert.ok(await stranger.backend.get(`trips/${trip.id}`));

/* Your trip list follows your account. */
const myList = await friend.backend.list(`users/${friend.backend.uid()}/trips`);
assert.equal(myList[0].tripId, trip.id);
await refused(stranger.backend.list(`users/${friend.backend.uid()}/trips`), "others' trip lists are private");

/* A second admin. */
await admin.repo.setAdmin(trip.id, b, lost.backend.uid(), true, a);
await lost.repo.updateTrip(trip.id, { name: 'Renamed' }, b);
await admin.repo.setAdmin(trip.id, b, lost.backend.uid(), false, a);
await refused(lost.repo.updateTrip(trip.id, { name: 'Again' }, b), 'removed admins lose access');

/* Receipts. */
const receipt = admin.repo.saveReceipt(trip.id, 'data:image/jpeg;base64,AAAA', a);
await receipt.written;
assert.ok((await friend.repo.getReceipt(trip.id, receipt.id)).dataUrl);

/* Restoring from a backup, deleting and moving a trip. */
const current = await admin.backend.get(`trips/${trip.id}`);
await admin.repo.importBackup(current, { trip: current, entries: [{ ...benEntry, desc: 'From backup', comments: {}, updatedAt: 8 }] }, 'Ana', a);
await refused(lost.repo.importBackup(current, { trip: current, entries: [{ ...anaEntry, desc: 'Bad backup', comments: {}, updatedAt: 9 }] }, 'Ben', b), "a non-admin can't overwrite others through import");
await admin.repo.deleteTrip(trip.id, 1, a);
await admin.repo.restoreTrip(trip.id, a);
const entries = Object.fromEntries((await admin.backend.list(`trips/${trip.id}/entries`)).map(e => [e.id, e]));
const moved = await admin.repo.replaceLink(current, entries, 'Ana', a, admin.profile);
assert.equal((await admin.backend.list(`trips/${moved.trip.id}/entries`)).length, Object.keys(entries).length);
assert.ok((await admin.backend.get(`trips/${trip.id}`)).retiredAt);
await refused(lost.repo.keepOldLink(trip.id, b), 'only admins undo a move');
await admin.repo.keepOldLink(trip.id, a);

/* A rebuilt trip works under a new owner. */
const rebuilt = await lost.repo.createFromBackup({ trip: { ...current, id: 'rebuilttriprebuilttrip01' }, entries: [] }, b, lost.profile);
assert.ok(rebuilt.claim);

/* Things nobody can do. */
const { db } = admin.backend, sdk = store;
const entryPath = `trips/${trip.id}/entries/${anaEntry.id}`;
await refused(sdk.getDocs(sdk.collection(db, 'trips')));
await refused(sdk.getDocs(sdk.collection(db, `trips/${trip.id}/claims`)));
await refused(sdk.getDocs(sdk.collection(db, `trips/${trip.id}/receipts`)));
await refused(sdk.deleteDoc(sdk.doc(db, `trips/${trip.id}`)));
await refused(sdk.deleteDoc(sdk.doc(db, entryPath)));
await refused(admin.backend.set('trips/short', { id: 'short', name: 'x', currency: 'TWD', members: {} }));
await refused(admin.backend.update(`trips/${trip.id}`, { currency: 'USD', changedBy: a }));
await refused(admin.backend.update(entryPath, { createdAt: 99, updatedById: a }));
await refused(admin.backend.update(entryPath, { kind: 'payment', updatedById: a }));
await refused(admin.backend.update(entryPath, { createdById: b, updatedById: a }));
await refused(admin.backend.set(`trips/${trip.id}/entries/entry00000000005`, { ...entryFor('entry00000000005', a), updatedById: a, total: -5 }));
await refused(admin.backend.set(`trips/${trip.id}/entries/entry00000000005`, { ...entryFor('entry00000000005', a), updatedById: a, desc: 'x'.repeat(81) }));
await refused(admin.backend.set(`trips/${trip.id}/entries/entry00000000005`, { ...entryFor('entry00000000005', a), updatedById: a, kind: 'payment', paid: { [a]: 5, [b]: 5 } }));
await refused(admin.backend.set(`trips/${trip.id}/entries/entry00000000005`, { ...entryFor('entry00000000005', a), updatedById: a, rate: 0 }));
await refused(admin.backend.set(`trips/${trip.id}/receipts/receipt000000001`, { dataUrl: 'javascript:alert(1)', byId: a }));
await refused(admin.backend.set('other/thing', { a: 1 }));
const [rev] = await admin.repo.listRevisions(trip.id, benEntry.id);
await refused(admin.backend.update(`trips/${trip.id}/entries/${benEntry.id}/revisions/${rev.id}`, { by: 'Forged' }));

/* A phone that hasn't signed in gets nothing, even with the right link. */
const unsigned = store.initializeFirestore(app.initializeApp(config, 'unsigned'), {});
store.connectFirestoreEmulator(unsigned, '127.0.0.1', 8181);
await refused(store.getDoc(store.doc(unsigned, `trips/${trip.id}`)));

console.log('Emulator checks passed');
process.exit(0);
