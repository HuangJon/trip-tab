/** Backup files and CSV export. Pure text in, pure data out. */
import { SCHEMA_VERSION } from '../config/app.js';
import { fromMinor } from './money.js';
import { inBase } from './debts.js';
import { activeMembers, byNewest, isValidEntry, isValidTrip, liveEntries, memberName, migrateTrip } from './model.js';
import { CATEGORIES } from '../config/app.js';

const FORMAT = 'trip-tab-backup';

export function createBackup(trip, entries, activity = []) {
  return { format: FORMAT, schemaVersion: SCHEMA_VERSION, createdAt: new Date().toISOString(), trip, entries: Object.values(entries), activity };
}

/** Returns {trip, entries, activity} or {error} with a plain explanation. */
export function parseBackup(text) {
  let data;
  try { data = JSON.parse(String(text).replace(/^﻿/, '')); } catch { return { error: "That isn't a Trip Tab backup. It isn't readable as a backup file." }; }
  if (!data || data.format !== FORMAT) return { error: "That isn't a Trip Tab backup." };
  if ((data.schemaVersion || 1) > SCHEMA_VERSION) return { error: 'This backup came from a newer version. Update the app, then try again.' };
  if (!isValidTrip(data.trip)) return { error: 'This backup is missing its trip details.' };
  const raw = Array.isArray(data.entries) ? data.entries : [];
  const entries = raw.filter(isValidEntry);
  return { trip: migrateTrip(data.trip), entries, activity: Array.isArray(data.activity) ? data.activity : [], skipped: raw.length - entries.length };
}

/** A receipt's date-stamped backup filename, safe on every phone. */
export function backupFilename(trip, kind = 'backup', ext = 'json', now = new Date()) {
  const slug = trip.name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'trip';
  return `${slug}-${kind}-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.${ext}`;
}

export function csvFor(trip, entries) {
  const q = s => {
    let v = String(s ?? '');
    if (/^[=+\-@\t\r]/.test(v) && Number.isNaN(Number(v))) v = `'${v}`; // stops spreadsheets running a typed-in formula
    return `"${v.replace(/"/g, '""')}"`;
  };
  const base = trip.currency;
  const everyone = activeMembers(trip);
  const rows = [['Date', 'Type', 'Description', 'Category', 'Amount', 'Currency', 'Rate', `Amount in ${base}`, ...everyone.flatMap(m => [`${m.name} paid`, `${m.name} share`])]];
  for (const e of liveEntries(entries).sort(byNewest).reverse()) {
    const b = inBase(e, base);
    const pay = e.kind === 'payment', refund = e.kind === 'refund';
    const sign = refund ? -1 : 1, handled = refund ? b.owed : b.paid, shares = refund ? b.paid : b.owed;
    rows.push([
      e.date, pay ? 'Settlement' : refund ? 'Refund' : 'Expense',
      pay ? `${memberName(trip, Object.keys(e.paid)[0])} paid ${memberName(trip, Object.keys(e.owed)[0])}` : e.desc,
      pay ? '' : CATEGORIES[e.category] || 'Other', fromMinor(sign * e.total, e.currency), e.currency, e.rate ?? 1, fromMinor(sign * b.total, base),
      ...everyone.flatMap(m => [fromMinor(sign * (handled[m.id] || 0), base), fromMinor(sign * (shares[m.id] || 0), base)]),
    ]);
  }
  return `﻿${rows.map(r => r.map(q).join(',')).join('\n')}`;
}
