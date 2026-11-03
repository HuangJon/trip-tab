/**
 * Every read and write of trip data, on top of either backend. Writes change only the fields they
 * mean to, so two friends adding people or commenting at the same moment don't undo each other.
 * Writes return a promise that may stay open while offline: show success right away and only
 * react to a rejection.
 */
import { SCHEMA_VERSION, LIMITS } from '../config/app.js';
import { randomId, tripId as newTripId } from '../core/ids.js';
import { activeMembers, isValidEntry, isValidTrip, migrateTrip } from '../core/model.js';

const tripPath = id => `trips/${id}`;
const col = (id, name) => `trips/${id}/${name}`;

export function createRepository(backend, now = () => Date.now()) {
  const logActivity = (trip, text, entryId = '') => {
    const id = randomId();
    return backend.set(`${col(trip.id, 'activity')}/${id}`, { id, tripId: trip.id, text, entryId, at: now() });
  };

  const fileRevision = (tripId, entry, by) => {
    const id = randomId();
    const { comments, ...kept } = entry;
    return backend.set(`${col(tripId, 'entries')}/${entry.id}/revisions/${id}`, { id, tripId, entryId: entry.id, by, at: now(), entry: kept });
  };
  const sameEntry = (a, b) => {
    const clean = ({ updatedAt, updatedBy, ...rest }) => JSON.stringify(Object.keys(rest).sort().map(k => [k, rest[k]]));
    return clean(a) === clean(b);
  };

  return {
    kind: backend.kind,
    watchTrip: (id, cb, err) => backend.watchDoc(tripPath(id), t => cb(isValidTrip(t) ? migrateTrip(t) : null), err),
    /** Calls back with the readable entries and how many were too damaged to use. */
    watchEntries: (id, cb, err) => backend.watchCollection(col(id, 'entries'), (list, meta) => {
      const good = list.filter(isValidEntry);
      cb(Object.fromEntries(good.map(e => [e.id, e])), list.length - good.length, meta?.pending || []);
    }, err),
    watchActivity: (id, cb, err) => backend.watchCollection(col(id, 'activity'), cb, err, { orderBy: 'at', limit: LIMITS.activityShown }),

    createTrip({ name, currency, memberNames, creatorName }) {
      const id = newTripId();
      const members = {};
      memberNames.forEach((n, i) => { members[randomId(10)] = { name: n, color: (i % 8) + 1, order: i }; });
      const trip = { id, schemaVersion: SCHEMA_VERSION, name, currency, members, simplify: true, rates: {}, createdAt: now() };
      const written = Promise.all([backend.set(tripPath(id), trip), logActivity(trip, `${creatorName || memberNames[0]} created the trip`)]);
      return { trip, written };
    },
    updateTrip: (id, fields) => backend.update(tripPath(id), fields),
    addMember(trip, name, actor) {
      const id = randomId(10);
      const order = Object.keys(trip.members).length;
      const written = Promise.all([
        backend.update(tripPath(trip.id), { [`members.${id}`]: { name, color: (order % 8) + 1, order } }),
        logActivity(trip, `${actor} added ${name} to the trip`),
      ]);
      return { id, written };
    },
    /** One person's Venmo or Zelle details. Each field saves on its own so friends can't overwrite each other. */
    setMemberPayment: (tripId, id, field, value) => backend.update(tripPath(tripId), { [`members.${id}.${field}`]: value }),
    renameMember: (tripId, id, name) => backend.update(tripPath(tripId), { [`members.${id}.name`]: name }),
    removeMember: (tripId, id) => backend.update(tripPath(tripId), { [`members.${id}.removed`]: true }),
    deleteTrip: (id, at = now()) => backend.update(tripPath(id), { deletedAt: at }),
    restoreTrip: id => backend.update(tripPath(id), { deletedAt: null }),

    /**
     * Writes an entry. An edit first files the version it replaces, so any change can be undone.
     * Comments are excluded from edits so one can't erase a new comment.
     * All writes start together: offline, a write doesn't finish until reconnecting, so waiting
     * for one before starting the next would leave the rest unsent if the app was closed.
     */
    saveEntry(trip, entry, { isNew, previous, actor, label }) {
      if (!isValidEntry(entry)) return Promise.reject(new Error('That expense does not add up.'));
      const path = `${col(trip.id, 'entries')}/${entry.id}`;
      const writes = [logActivity(trip, `${actor} ${label}`, entry.id)];
      if (isNew) writes.unshift(backend.set(path, entry));
      else {
        const { comments, createdAt, ...fields } = entry;
        if (previous) writes.unshift(fileRevision(trip.id, previous, actor));
        writes.push(backend.update(path, fields));
      }
      return Promise.all(writes);
    },
    fileVersion: (tripId, entry, by) => fileRevision(tripId, entry, by),
    /** Earlier versions of an entry, newest first. */
    async listRevisions(tripId, entryId) {
      const list = await backend.list(`${col(tripId, 'entries')}/${entryId}/revisions`);
      return list.filter(r => isValidEntry(r.entry)).sort((a, b) => b.at - a.at);
    },
    setEntryDeleted(trip, id, deleted, actor, name) {
      return Promise.all([
        backend.update(`${col(trip.id, 'entries')}/${id}`, { deleted, updatedAt: now(), updatedBy: actor }),
        logActivity(trip, `${actor} ${deleted ? 'deleted' : 'restored'} ${name}`, id),
      ]);
    },
    addComment(trip, entry, by, text) {
      const id = randomId();
      return Promise.all([
        backend.update(`${col(trip.id, 'entries')}/${entry.id}`, { [`comments.${id}`]: { by, text, at: now() } }),
        logActivity(trip, `${by} commented on "${entry.desc}"`, entry.id),
      ]);
    },

    saveReceipt(tripId, dataUrl) {
      const id = randomId();
      return { id, written: backend.set(`${col(tripId, 'receipts')}/${id}`, { id, dataUrl, at: now() }) };
    },
    getReceipt: (tripId, id) => backend.get(`${col(tripId, 'receipts')}/${id}`),

    logActivity,

    /**
     * Merges a backup by id: new ids are added and nothing is removed. A changed entry is replaced,
     * with its current version filed in its history and its comments kept.
     */
    async importBackup(trip, backup, actor = 'Someone') {
      const members = {};
      for (const [id, m] of Object.entries(backup.trip.members)) if (!trip.members[id]) members[`members.${id}`] = m;
      const writes = Object.keys(members).length ? [backend.update(tripPath(trip.id), members)] : [];
      let changed = 0;
      for (const e of backup.entries) {
        const path = `${col(trip.id, 'entries')}/${e.id}`;
        const current = await backend.get(path);
        const next = { ...e, tripId: trip.id };
        if (current) {
          next.comments = { ...(e.comments || {}), ...(current.comments || {}) };
          next.createdAt = current.createdAt;
          if (sameEntry(current, next)) continue;
          writes.push(fileRevision(trip.id, current, actor));
        }
        writes.push(backend.set(path, next));
        changed += 1;
      }
      await Promise.all(writes);
      return changed;
    },
    /** Rebuilds a trip that no longer exists in the database from its backup, under its own id. */
    async createFromBackup(backup) {
      const trip = { ...backup.trip, deletedAt: null };
      await Promise.all([backend.set(tripPath(trip.id), trip), ...backup.entries.map(e => backend.set(`${col(trip.id, 'entries')}/${e.id}`, e))]);
      return trip;
    },
    /**
     * Moves a trip to a new link. Everything is copied first, so a failure leaves the old trip as it
     * was. The old trip then shows as moved, and it deliberately does not record the new address.
     * Needs a connection, because each step has to reach the server before the next.
     */
    async replaceLink(trip, entries, actor) {
      const id = newTripId();
      const { fromNewerApp, ...fields } = trip;
      const copy = { ...fields, id, deletedAt: null, retiredAt: null };
      await backend.set(tripPath(id), copy);
      const list = Object.values(entries);
      const receipts = [...new Set(list.map(e => e.receipt).filter(Boolean))];
      await Promise.all(receipts.map(async r => {
        const doc = await backend.get(`${col(trip.id, 'receipts')}/${r}`);
        if (doc) await backend.set(`${col(id, 'receipts')}/${r}`, doc);
      }));
      await Promise.all(list.map(e => backend.set(`${col(id, 'entries')}/${e.id}`, { ...e, tripId: id })));
      await logActivity(copy, `${actor} replaced the invite link`);
      await backend.update(tripPath(trip.id), { retiredAt: now() });
      return copy;
    },
    keepOldLink: id => backend.update(tripPath(id), { retiredAt: null }),
    activeMembers,
  };
}
