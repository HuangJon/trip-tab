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
  return isMap(e) && typeof e.id === 'string' && ['expense', 'payment', 'refund'].includes(e.kind)
    && Number.isInteger(e.total) && e.total > 0 && typeof e.currency === 'string'
    && isAmounts(e.paid) && isAmounts(e.owed) && sum(e.paid) === e.total && sum(e.owed) === e.total
    && (e.rate === undefined || e.rate === null || (typeof e.rate === 'number' && e.rate > 0));
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

/**
 * Who handled the money and who it was split among. A refund is stored the other way round: the
 * person who received it "owes" the group and everyone sharing it is credited, so balances, debts
 * and rounding all work without special cases. Use these instead of reading paid and owed directly.
 */
export const handlersOf = e => (e.kind === 'refund' ? e.owed : e.paid);
export const sharesOf = e => (e.kind === 'refund' ? e.paid : e.owed);

/** Trip admins can fix anything. Everyone else can change what they added or handled. The rules enforce the same. */
export const isAdminId = (trip, id) => Boolean(id && trip.admins?.[id]);
export function canEditEntry(trip, e, id) {
  if (!id) return false;
  return isAdminId(trip, id) || e.createdById === id || Boolean(handlersOf(e)[id]);
}

export const memberName = (trip, id) => trip.members[id]?.name ?? 'Former member';
export const liveEntries = entries => Object.values(entries || {}).filter(e => !e.deleted);
export const byNewest = (a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0);
/**
 * The color each person shows in, so nobody on a trip shares one. Whoever is first on the trip keeps
 * theirs and a later duplicate gets the next free color, which also sorts out older trips and two
 * people picking at the same moment. A trip with more people than colors has to repeat some.
 */
export function displayColors(trip, count = 12) {
  const shown = {}, used = new Set();
  for (const [id, m] of Object.entries(trip.members)) shown[id] = m.color || 1;
  const waiting = [];
  for (const m of activeMembers(trip)) {
    if (m.color >= 1 && m.color <= count && !used.has(m.color)) used.add(m.color);
    else waiting.push(m.id);
  }
  for (const id of waiting) {
    for (let i = 1; i <= count; i += 1) {
      if (!used.has(i)) { used.add(i); shown[id] = i; break; }
    }
  }
  return shown;
}

/** Whether a name is on an expense that counts. Deleted ones don't; restoring one brings the name back. */
export function isInUse(entries, id) {
  return Object.values(entries || {}).some(e => !e.deleted && (e.paid?.[id] || e.owed?.[id]));
}
/** Names on this expense that have since been removed from the trip. */
export const removedNames = (trip, e) => [...new Set([...Object.keys(e.paid || {}), ...Object.keys(e.owed || {})])].filter(id => trip.members[id]?.removed);
