/**
 * Stored data formats. Schema versions:
 *   v1: trips/{id} with a members map; trips/{id}/entries, /activity and /receipts.
 *
 * Every past format keeps a permanent fixture in tests/fixtures. Unknown fields are always kept,
 * so an older copy of the app on a friend's phone never strips data it doesn't understand.
 * Data arrives from other people's phones, so everything is checked before it is used.
 */
import { SCHEMA_VERSION } from '../config/app.js';

const isMap = v => v && typeof v === 'object' && !Array.isArray(v);
const isAmounts = m => isMap(m) && Object.values(m).every(v => Number.isInteger(v) && v >= 0);
const sum = m => Object.values(m).reduce((a, b) => a + b, 0);

export function isValidEntry(e) {
  return isMap(e) && typeof e.id === 'string' && (e.kind === 'expense' || e.kind === 'payment')
    && Number.isInteger(e.total) && e.total > 0 && typeof e.currency === 'string'
    && isAmounts(e.paid) && isAmounts(e.owed) && sum(e.paid) === e.total && sum(e.owed) === e.total;
}

export function isValidTrip(t) {
  return isMap(t) && typeof t.id === 'string' && typeof t.name === 'string' && typeof t.currency === 'string' && isMap(t.members);
}

/** True when a newer copy of the app wrote this trip. This copy then shows it without changing it. */
export const isFromNewerApp = t => (t?.schemaVersion || 1) > SCHEMA_VERSION;

/** Upgrades a stored trip to the current format. Add one step per version; keep every old step. */
export function migrateTrip(trip) {
  return { schemaVersion: 1, ...trip };
}

/** Everyone still on the trip, in the order they joined. */
export const activeMembers = trip => Object.entries(trip.members)
  .map(([id, m]) => ({ id, ...m }))
  .filter(m => !m.removed)
  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

export const memberName = (trip, id) => trip.members[id]?.name ?? 'Former member';
export const liveEntries = entries => Object.values(entries || {}).filter(e => !e.deleted);
export const byNewest = (a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0);
export function isInUse(entries, id) {
  return Object.values(entries || {}).some(e => e.paid?.[id] || e.owed?.[id]);
}
