/**
 * Every read and write of trip data, on top of either backend. Writes change only the fields they
 * mean to, so two friends changing things at the same moment don't undo each other.
 * Writes return a promise that may stay open while offline: show success right away and only
 * react to a rejection. Exceptions are claiming a name and moving a trip, which need a connection.
 *
 * Each write names the person making it (actorId). firestore.rules checks that name is claimed by
 * this phone, so nobody can act as someone else.
 */
import { SCHEMA_VERSION, LIMITS } from '../config/app.js';
import { randomId, tripId as newTripId } from '../core/ids.js';
import { activeMembers, isValidEntry, isValidTrip, migrateTrip } from '../core/model.js';

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
  const claimDoc = (tripId, memberId) => ({ tripId, memberId, uid: backend.uid?.() || '', key: randomId(24), at: now(), released: false });
  const claimPath = (tripId, memberId) => `${col(tripId, 'claims')}/${memberId}`;

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
    createTrip({ name, currency, memberNames, creatorName }) {
      const id = newTripId();
      const members = {};
      const ids = memberNames.map(() => randomId(10));
      memberNames.forEach((n, i) => { members[ids[i]] = { name: n, color: (i % 8) + 1, order: i, ...(i === 0 ? { claimed: true } : {}) }; });
      const trip = { id, schemaVersion: SCHEMA_VERSION, name, currency, members, admins: { [ids[0]]: true }, changedBy: ids[0], simplify: true, rates: {}, createdAt: now() };
      const claim = claimDoc(id, ids[0]);
      const written = Promise.all([
        backend.set(tripPath(id), trip),
        backend.set(claimPath(id, ids[0]), claim),
        logActivity(trip, `${creatorName || memberNames[0]} created the trip`, '', ids[0]),
      ]);
      return { trip, written, claim };
    },
    updateTrip: (id, fields, actorId) => backend.update(tripPath(id), { ...fields, ...stamp(actorId, 'changedBy') }),

    /** Locks a name to this phone. Needs a connection. Rejects with code "taken" if someone else has it. */
    async claimMember(tripId, memberId) {
      let current;
      try { current = await backend.get(claimPath(tripId, memberId)); } catch (e) {
        if (e?.code === 'permission-denied') throw Object.assign(new Error('Taken'), { code: 'taken' });
        throw e;
      }
      if (current && !current.released && current.uid !== backend.uid?.()) throw Object.assign(new Error('Taken'), { code: 'taken' });
      const claim = current && !current.released ? current : claimDoc(tripId, memberId);
      if (current?.released) await backend.update(claimPath(tripId, memberId), claim);
      else if (!current) await backend.set(claimPath(tripId, memberId), claim);
      await backend.update(tripPath(tripId), { [`members.${memberId}.claimed`]: true, changedBy: memberId });
      return claim;
    },
    /** Adds a new person and locks the name to this phone. */
    async joinAs(trip, name) {
      const memberId = randomId(10);
      const claim = claimDoc(trip.id, memberId);
      const order = Object.keys(trip.members).length;
      await backend.set(claimPath(trip.id, memberId), claim);
      await backend.update(tripPath(trip.id), { [`members.${memberId}`]: { name, color: (order % 8) + 1, order, claimed: true }, changedBy: memberId });
      await logActivity(trip, `${name} joined the trip`, '', memberId);
      return { memberId, claim };
    },
    /** Moves a claimed name to this phone. The old phone stops being able to act as that person. */
    transferClaim: (tripId, memberId, key) => backend.update(claimPath(tripId, memberId), { uid: backend.uid?.() || '', key }),
    /** An admin frees a name so its owner can claim it again from a new phone. */
    releaseClaim(tripId, memberId, actorId) {
      return Promise.all([
        backend.update(claimPath(tripId, memberId), { uid: '', key: '', released: true, releasedBy: actorId }),
        backend.update(tripPath(tripId), { [`members.${memberId}.claimed`]: false, changedBy: actorId }),
      ]);
    },
    setAdmin: (tripId, memberId, on, actorId) => backend.update(tripPath(tripId), { [`admins.${memberId}`]: on, changedBy: actorId }),

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
    async createFromBackup(backup, actorId) {
      const members = Object.fromEntries(Object.entries(backup.trip.members).map(([id, m]) => [id, { ...m, claimed: id === actorId }]));
      const trip = { ...backup.trip, members, deletedAt: null, ...(actorId ? { admins: { [actorId]: true }, changedBy: actorId } : {}) };
      await backend.set(tripPath(trip.id), trip);
      const claim = actorId ? claimDoc(trip.id, actorId) : null;
      if (claim) await backend.set(claimPath(trip.id, actorId), claim);
      await Promise.all(backup.entries.map(e => backend.set(`${col(trip.id, 'entries')}/${e.id}`, { ...e, ...stamp(actorId, 'updatedById') })));
      return { trip, claim };
    },
    /**
     * Moves a trip to a new link. Everything is copied first, so a failure leaves the old trip as it
     * was. The old trip then shows as moved, and it deliberately does not record the new address.
     * Everyone except the admin moving it claims their name again on the new link.
     * Needs a connection, because each step has to reach the server before the next.
     */
    async replaceLink(trip, entries, actor, actorId) {
      const id = newTripId();
      const { fromNewerApp, ...fields } = trip;
      const members = Object.fromEntries(Object.entries(trip.members).map(([mid, m]) => [mid, { ...m, claimed: mid === actorId }]));
      const copy = { ...fields, id, members, deletedAt: null, retiredAt: null, ...(actorId ? { admins: { [actorId]: true }, changedBy: actorId } : {}) };
      await backend.set(tripPath(id), copy);
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
      return { trip: copy, claim };
    },
    keepOldLink: (id, actorId) => backend.update(tripPath(id), { retiredAt: null, ...stamp(actorId, 'changedBy') }),
    activeMembers,
  };
}
