/**
 * Every read and write of trip data, on top of either backend. Writes change only the fields they
 * mean to, so two friends changing things at the same moment don't undo each other.
 * Writes return a promise that may stay open while offline: show success right away and only
 * react to a rejection. Exceptions are claiming a name and moving a trip, which need a connection.
 *
 * Each write names the person making it (actorId). firestore.rules checks that name is claimed by
 * the signed-in account, so nobody can act as someone else.
 */
import { SCHEMA_VERSION, LIMITS } from '../config/app.js';
import { randomId, tripId as newTripId } from '../core/ids.js';
import { activeMembers, removedNames, isValidEntry, isValidTrip, migrateTrip } from '../core/model.js';

const tripPath = id => `trips/${id}`;
const col = (id, name) => `trips/${id}/${name}`;
const stamp = (actorId, field) => (actorId ? { [field]: actorId } : {});

export function createRepository(backend, now = () => Date.now()) {
  const logActivity = (trip, text, entryId = '', actorId) => {
    const id = randomId();
    return backend.set(`${col(trip.id, 'activity')}/${id}`, { id, tripId: trip.id, text, entryId, at: now(), ...stamp(actorId, 'byId') });
  };
  const fileRevision = (tripId, entry, by, actorId) => {
    const id = randomId();
    const { comments, ...kept } = entry;
    return backend.set(`${col(tripId, 'entries')}/${entry.id}/revisions/${id}`, { id, tripId, entryId: entry.id, by, at: now(), entry: kept, ...stamp(actorId, 'byId') });
  };
  const sameEntry = (a, b) => {
    const clean = ({ updatedAt, updatedBy, updatedById, ...rest }) => JSON.stringify(Object.keys(rest).sort().map(k => [k, rest[k]]));
    return clean(a) === clean(b);
  };
  const claimDoc = (tripId, memberId) => ({ tripId, memberId, uid: backend.uid?.() || '', at: now(), released: false });
  const claimPath = (tripId, memberId) => `${col(tripId, 'claims')}/${memberId}`;
  const joinedPath = (tripId, uid) => `${col(tripId, 'joined')}/${uid}`;
  const mine = tripId => `users/${backend.uid?.() || 'none'}/trips/${tripId}`;
  const joinedDoc = (tripId, profile, memberId = null) => ({
    uid: backend.uid?.() || '', tripId, displayName: profile?.displayName || '', email: profile?.email || '', memberId, removed: false, at: now(),
  });
  const setMyName = (tripId, memberId) => backend.update(joinedPath(tripId, backend.uid?.() || ''), { memberId });

  return {
    kind: backend.kind,
    watchTrip: (id, cb, err) => backend.watchDoc(tripPath(id), t => cb(isValidTrip(t) ? migrateTrip(t) : null), err),
    /** Calls back with the readable entries, how many were too damaged to use, and which are unsynced. */
    watchEntries: (id, cb, err) => backend.watchCollection(col(id, 'entries'), (list, meta) => {
      const good = list.filter(isValidEntry);
      cb(Object.fromEntries(good.map(e => [e.id, e])), list.length - good.length, meta?.pending || []);
    }, err),
    watchActivity: (id, cb, err) => backend.watchCollection(col(id, 'activity'), cb, err, { orderBy: 'at', limit: LIMITS.activityShown }),

    /** The first name listed is the creator, who claims it and becomes the trip's admin. */
    createTrip({ name, currency, memberNames, creatorName, profile }) {
      const id = newTripId();
      const members = {};
      const ids = memberNames.map(() => randomId(10));
      memberNames.forEach((n, i) => { members[ids[i]] = { name: n, color: (i % 8) + 1, order: i, ...(i === 0 ? { claimed: true } : {}) }; });
      const trip = { id, schemaVersion: SCHEMA_VERSION, name, currency, members, admins: { [ids[0]]: true }, adminUids: { [backend.uid?.() || 'none']: true }, changedBy: ids[0], simplify: true, rates: {}, createdAt: now() };
      const claim = claimDoc(id, ids[0]);
      const written = Promise.all([
        backend.set(tripPath(id), trip),
        backend.set(joinedPath(id, backend.uid?.() || 'none'), joinedDoc(id, profile, ids[0])),
        backend.set(mine(id), { tripId: id, at: now() }),
        backend.set(claimPath(id, ids[0]), claim),
        logActivity(trip, `${creatorName || memberNames[0]} created the trip`, '', ids[0]),
      ]);
      return { trip, written, claim };
    },
    updateTrip: (id, fields, actorId) => backend.update(tripPath(id), { ...fields, ...stamp(actorId, 'changedBy') }),

    /** Your own account's list of trips, which follows you to any device. */
    watchMyTrips: (cb, err) => backend.watchCollection(`users/${backend.uid?.() || 'none'}/trips`, list => cb(list.map(t => t.tripId)), err),
    leaveMyList: tripId => backend.remove(mine(tripId)),
    /** Your own place on a trip: which name you hold, and whether an admin removed you. */
    watchMyJoin: (tripId, cb, err) => backend.watchDoc(joinedPath(tripId, backend.uid?.() || 'none'), cb, err),
    /** Admins see everyone who has opened the trip, including people who haven't picked a name. */
    watchJoined: (tripId, cb, err) => backend.watchCollection(col(tripId, 'joined'), cb, err),
    /** Records that this account opened the trip. It must finish before the rules allow reading it. */
    async recordJoin(tripId, profile) {
      const current = await backend.get(joinedPath(tripId, backend.uid?.() || 'none'));
      if (!current) await backend.set(joinedPath(tripId, backend.uid?.() || 'none'), joinedDoc(tripId, profile));
      if (!current?.removed) await backend.set(mine(tripId), { tripId, at: now() });
      return current;
    },
    /** Ties a name to this account. Needs a connection. Rejects with code "taken" if someone else has it. */
    async claimMember(tripId, memberId) {
      const current = await backend.get(claimPath(tripId, memberId));
      if (current && !current.released && current.uid !== backend.uid?.()) throw Object.assign(new Error('Taken'), { code: 'taken' });
      const claim = claimDoc(tripId, memberId);
      if (current?.released) await backend.update(claimPath(tripId, memberId), claim);
      else if (!current) await backend.set(claimPath(tripId, memberId), claim);
      await backend.update(tripPath(tripId), { [`members.${memberId}.claimed`]: true, changedBy: memberId });
      await setMyName(tripId, memberId);
      return claim;
    },
    /** Adds a new person and ties the name to this account. */
    async joinAs(trip, name) {
      const memberId = randomId(10);
      const order = Object.keys(trip.members).length;
      await backend.set(claimPath(trip.id, memberId), claimDoc(trip.id, memberId));
      await backend.update(tripPath(trip.id), { [`members.${memberId}`]: { name, color: (order % 8) + 1, order, claimed: true }, changedBy: memberId });
      await setMyName(trip.id, memberId);
      await logActivity(trip, `${name} joined the trip`, '', memberId);
      return { memberId };
    },
    /** An admin frees a name so someone else can claim it. */
    async releaseClaim(tripId, memberId, actorId) {
      const claim = await backend.get(claimPath(tripId, memberId));
      await Promise.all([
        backend.update(claimPath(tripId, memberId), { uid: '', released: true, releasedBy: actorId }),
        backend.update(tripPath(tripId), { [`members.${memberId}.claimed`]: false, changedBy: actorId }),
        ...(claim?.uid ? [backend.update(joinedPath(tripId, claim.uid), { memberId: null })] : []),
      ]);
    },
    /** Removes someone's access. A name they held is freed; expenses stay. They can be let back in. */
    async removePerson(tripId, person, actorId) {
      await backend.update(joinedPath(tripId, person.uid), { removed: true, memberId: null });
      if (person.memberId) {
        await Promise.all([
          backend.update(claimPath(tripId, person.memberId), { uid: '', released: true, releasedBy: actorId }),
          backend.update(tripPath(tripId), { [`members.${person.memberId}.claimed`]: false, changedBy: actorId }),
        ]);
      }
    },
    letBackIn: (tripId, uid) => backend.update(joinedPath(tripId, uid), { removed: false }),
    /** The uid goes on a list the rules read, because a read can't say which name it's for. */
    setAdmin: (tripId, memberId, uid, on, actorId) => backend.update(tripPath(tripId), { [`admins.${memberId}`]: on, [`adminUids.${uid}`]: on, changedBy: actorId }),

    addMember(trip, name, actor, actorId) {
      const id = randomId(10);
      const order = Object.keys(trip.members).length;
      const written = Promise.all([
        backend.update(tripPath(trip.id), { [`members.${id}`]: { name, color: (order % 8) + 1, order }, ...stamp(actorId, 'changedBy') }),
        logActivity(trip, `${actor} added ${name} to the trip`, '', actorId),
      ]);
      return { id, written };
    },
    /** One person's Venmo or Zelle details. Each field saves on its own so friends can't overwrite each other. */
    setMemberPayment: (tripId, id, field, value, actorId) => backend.update(tripPath(tripId), { [`members.${id}.${field}`]: value, ...stamp(actorId, 'changedBy') }),
    renameMember: (tripId, id, name, actorId) => backend.update(tripPath(tripId), { [`members.${id}.name`]: name, ...stamp(actorId, 'changedBy') }),
    removeMember: (tripId, id, actorId) => backend.update(tripPath(tripId), { [`members.${id}.removed`]: true, ...stamp(actorId, 'changedBy') }),
    deleteTrip: (id, at = now(), actorId) => backend.update(tripPath(id), { deletedAt: at, ...stamp(actorId, 'changedBy') }),
    restoreTrip: (id, actorId) => backend.update(tripPath(id), { deletedAt: null, ...stamp(actorId, 'changedBy') }),

    /**
     * Writes an entry. An edit first files the version it replaces, so any change can be undone.
     * Comments are excluded from edits so one can't erase a new comment.
     * All writes start together: offline, a write doesn't finish until reconnecting, so waiting
     * for one before starting the next would leave the rest unsent if the app was closed.
     */
    saveEntry(trip, entry, { isNew, previous, actor, actorId, label }) {
      const full = { ...entry, ...stamp(actorId, 'updatedById') };
      if (!isValidEntry(full)) return Promise.reject(new Error('That expense does not add up.'));
      const path = `${col(trip.id, 'entries')}/${full.id}`;
      const writes = [logActivity(trip, `${actor} ${label}`, full.id, actorId)];
      if (isNew) writes.unshift(backend.set(path, full));
      else {
        const { comments, createdAt, createdById, ...fields } = full;
        if (previous) writes.unshift(fileRevision(trip.id, previous, actor, actorId));
        writes.push(backend.update(path, fields));
      }
      return Promise.all(writes);
    },
    fileVersion: (tripId, entry, by, actorId) => fileRevision(tripId, entry, by, actorId),
    /** Earlier versions of an entry, newest first. */
    async listRevisions(tripId, entryId) {
      const list = await backend.list(`${col(tripId, 'entries')}/${entryId}/revisions`);
      return list.filter(r => isValidEntry(r.entry)).sort((a, b) => b.at - a.at);
    },
    setEntryDeleted(trip, id, deleted, actor, name, actorId) {
      return Promise.all([
        backend.update(`${col(trip.id, 'entries')}/${id}`, { deleted, updatedAt: now(), updatedBy: actor, ...stamp(actorId, 'updatedById') }),
        logActivity(trip, `${actor} ${deleted ? 'deleted' : 'restored'} ${name}`, id, actorId),
      ]);
    },
    addComment(trip, entry, by, text, actorId) {
      const id = randomId();
      return Promise.all([
        backend.update(`${col(trip.id, 'entries')}/${entry.id}`, { [`comments.${id}`]: { by, text, at: now() }, ...stamp(actorId, 'commentedBy') }),
        logActivity(trip, `${by} commented on "${entry.desc}"`, entry.id, actorId),
      ]);
    },

    saveReceipt(tripId, dataUrl, actorId) {
      const id = randomId();
      return { id, written: backend.set(`${col(tripId, 'receipts')}/${id}`, { id, dataUrl, at: now(), ...stamp(actorId, 'byId') }) };
    },
    getReceipt: (tripId, id) => backend.get(`${col(tripId, 'receipts')}/${id}`),

    logActivity,

    /**
     * Merges a backup by id: new ids are added and nothing is removed. A changed entry is replaced,
     * with its current version filed in its history and its comments kept.
     */
    async importBackup(trip, backup, actor = 'Someone', actorId) {
      const members = {};
      for (const [id, m] of Object.entries(backup.trip.members)) if (!trip.members[id]) members[`members.${id}`] = { ...m, claimed: false };
      // A live expense from the backup can include a name removed since, so that name comes back.
      for (const e of backup.entries) {
        if (!e.deleted) for (const id of removedNames(trip, e)) members[`members.${id}.removed`] = false;
      }
      const writes = Object.keys(members).length ? [backend.update(tripPath(trip.id), { ...members, ...stamp(actorId, 'changedBy') })] : [];
      let changed = 0;
      for (const e of backup.entries) {
        const path = `${col(trip.id, 'entries')}/${e.id}`;
        const current = await backend.get(path);
        const next = { ...e, tripId: trip.id, ...stamp(actorId, 'updatedById') };
        if (current) {
          next.comments = { ...(e.comments || {}), ...(current.comments || {}) };
          next.createdAt = current.createdAt;
          if (current.createdById) next.createdById = current.createdById;
          if (sameEntry(current, next)) continue;
          writes.push(fileRevision(trip.id, current, actor, actorId));
        }
        writes.push(backend.set(path, next));
        changed += 1;
      }
      await Promise.all(writes);
      return changed;
    },
    /**
     * Rebuilds a trip that no longer exists in the database from this phone's copy, under its own id.
     * Whoever rebuilds it becomes its admin, and everyone else claims their name again.
     */
    async createFromBackup(backup, actorId, profile) {
      const members = Object.fromEntries(Object.entries(backup.trip.members).map(([id, m]) => [id, { ...m, claimed: id === actorId }]));
      const trip = { ...backup.trip, members, deletedAt: null, adminUids: { [backend.uid?.() || 'none']: true }, ...(actorId ? { admins: { [actorId]: true }, changedBy: actorId } : {}) };
      await backend.set(tripPath(trip.id), trip);
      await backend.set(joinedPath(trip.id, backend.uid?.() || 'none'), joinedDoc(trip.id, profile, actorId || null));
      await backend.set(mine(trip.id), { tripId: trip.id, at: now() });
      const claim = actorId ? claimDoc(trip.id, actorId) : null;
      if (claim) await backend.set(claimPath(trip.id, actorId), claim);
      await Promise.all(backup.entries.map(e => backend.set(`${col(trip.id, 'entries')}/${e.id}`, { ...e, ...stamp(actorId, 'updatedById') })));
      return { trip, claim };
    },
    /**
     * Moves a trip to a new link. Everything is copied first, so a failure leaves the old trip as it
     * was. The old trip then shows as moved, and it deliberately does not record the new address.
     * Everyone except the admin moving it joins again through the new link and claims their name.
     * Needs a connection, because each step has to reach the server before the next.
     */
    async replaceLink(trip, entries, actor, actorId, profile) {
      const id = newTripId();
      const { fromNewerApp, ...fields } = trip;
      const members = Object.fromEntries(Object.entries(trip.members).map(([mid, m]) => [mid, { ...m, claimed: mid === actorId }]));
      const copy = { ...fields, id, members, deletedAt: null, retiredAt: null, adminUids: { [backend.uid?.() || 'none']: true }, ...(actorId ? { admins: { [actorId]: true }, changedBy: actorId } : {}) };
      await backend.set(tripPath(id), copy);
      await backend.set(joinedPath(id, backend.uid?.() || 'none'), joinedDoc(id, profile, actorId || null));
      await backend.set(mine(id), { tripId: id, at: now() });
      const claim = actorId ? claimDoc(id, actorId) : null;
      if (claim) await backend.set(claimPath(id, actorId), claim);
      const list = Object.values(entries);
      const receipts = [...new Set(list.map(e => e.receipt).filter(Boolean))];
      await Promise.all(receipts.map(async r => {
        const doc = await backend.get(`${col(trip.id, 'receipts')}/${r}`);
        if (doc) await backend.set(`${col(id, 'receipts')}/${r}`, { ...doc, ...stamp(actorId, 'byId') });
      }));
      await Promise.all(list.map(e => backend.set(`${col(id, 'entries')}/${e.id}`, { ...e, tripId: id, ...stamp(actorId, 'updatedById') })));
      await logActivity(copy, `${actor} replaced the invite link`, '', actorId);
      await backend.update(tripPath(trip.id), { retiredAt: now(), ...stamp(actorId, 'changedBy') });
      await backend.remove(mine(trip.id));
      return { trip: copy, claim };
    },
    keepOldLink: (id, actorId) => backend.update(tripPath(id), { retiredAt: null, ...stamp(actorId, 'changedBy') }),
    activeMembers,
  };
}
