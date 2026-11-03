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

  return {
    kind: backend.kind,
    watchTrip: (id, cb, err) => backend.watchDoc(tripPath(id), t => cb(isValidTrip(t) ? migrateTrip(t) : null), err),
    watchEntries: (id, cb, err) => backend.watchCollection(col(id, 'entries'), list => {
      cb(Object.fromEntries(list.filter(isValidEntry).map(e => [e.id, e])));
    }, err),
    watchActivity: (id, cb, err) => backend.watchCollection(col(id, 'activity'), cb, err, { orderBy: 'at', limit: LIMITS.activityShown }),

    createTrip({ name, currency, memberNames, creatorName }) {
      const id = newTripId();
      const members = {};
      memberNames.forEach((n, i) => { members[randomId(10)] = { name: n, color: (i % 8) + 1, order: i }; });
      const trip = { id, schemaVersion: SCHEMA_VERSION, name, currency, members, simplify: true, rates: {}, createdAt: now() };
      const written = backend.set(tripPath(id), trip).then(() => logActivity(trip, `${creatorName || memberNames[0]} created the trip`));
      return { trip, written };
    },
    updateTrip: (id, fields) => backend.update(tripPath(id), fields),
    addMember(trip, name, actor) {
      const id = randomId(10);
      const order = Object.keys(trip.members).length;
      const written = backend.update(tripPath(trip.id), { [`members.${id}`]: { name, color: (order % 8) + 1, order } })
        .then(() => logActivity(trip, `${actor} added ${name} to the trip`));
      return { id, written };
    },
    renameMember: (tripId, id, name) => backend.update(tripPath(tripId), { [`members.${id}.name`]: name }),
    removeMember: (tripId, id) => backend.update(tripPath(tripId), { [`members.${id}.removed`]: true }),
    deleteTrip: (id, at = now()) => backend.update(tripPath(id), { deletedAt: at }),
    restoreTrip: id => backend.update(tripPath(id), { deletedAt: null }),

    /** Writes the whole entry. Comments are excluded from edits so one can't erase a new comment. */
    async saveEntry(trip, entry, { isNew, actor, label }) {
      const path = `${col(trip.id, 'entries')}/${entry.id}`;
      if (isNew) await backend.set(path, entry);
      else { const { comments, createdAt, ...fields } = entry; await backend.update(path, fields); }
      await logActivity(trip, `${actor} ${label}`, entry.id);
    },
    async setEntryDeleted(trip, id, deleted, actor, name) {
      await backend.update(`${col(trip.id, 'entries')}/${id}`, { deleted, updatedAt: now() });
      await logActivity(trip, `${actor} ${deleted ? 'deleted' : 'restored'} ${name}`, id);
    },
    async addComment(trip, entry, by, text) {
      const id = randomId();
      await backend.update(`${col(trip.id, 'entries')}/${entry.id}`, { [`comments.${id}`]: { by, text, at: now() } });
      await logActivity(trip, `${by} commented on "${entry.desc}"`, entry.id);
    },

    saveReceipt(tripId, dataUrl) {
      const id = randomId();
      return { id, written: backend.set(`${col(tripId, 'receipts')}/${id}`, { id, dataUrl, at: now() }) };
    },
    getReceipt: (tripId, id) => backend.get(`${col(tripId, 'receipts')}/${id}`),

    logActivity,

    /** Merges a backup by id: the same id is replaced, new ids are added, nothing is removed. */
    async importBackup(trip, backup) {
      const members = {};
      for (const [id, m] of Object.entries(backup.trip.members)) if (!trip.members[id]) members[`members.${id}`] = m;
      if (Object.keys(members).length) await backend.update(tripPath(trip.id), members);
      for (const e of backup.entries) await backend.set(`${col(trip.id, 'entries')}/${e.id}`, { ...e, tripId: trip.id });
      return backup.entries.length;
    },
    /** Rebuilds a trip that no longer exists in the database from its backup, under its own id. */
    async createFromBackup(backup) {
      const trip = { ...backup.trip, deletedAt: null };
      await backend.set(tripPath(trip.id), trip);
      for (const e of backup.entries) await backend.set(`${col(trip.id, 'entries')}/${e.id}`, e);
      return trip;
    },
    activeMembers,
  };
}
