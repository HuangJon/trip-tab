import test from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { activeMembers, handlersOf, sharesOf, isFromNewerApp, isInUse, isValidEntry, migrateTrip } from '../../js/core/model.js';
import { backupFilename, createBackup, csvFor, parseBackup } from '../../js/core/backup.js';
import { SCHEMA_VERSION } from '../../js/config/app.js';

const fixtures = readdirSync('tests/fixtures').filter(f => f.startsWith('schema-'));
test('there is a fixture for the current format', () => assert.ok(fixtures.includes(`schema-v${SCHEMA_VERSION}.json`)));
for (const f of fixtures) {
  test(`${f} still loads with nothing lost`, () => {
    const text = readFileSync(`tests/fixtures/${f}`, 'utf8'), raw = JSON.parse(text), p = parseBackup(text);
    assert.equal(p.error, undefined);
    assert.equal(p.entries.length, raw.entries.length);
    assert.equal(p.trip.futureField, 'kept');
  });
}
const parsed = parseBackup(readFileSync('tests/fixtures/schema-v1.json', 'utf8'));
const trip = parsed.trip, entries = Object.fromEntries(parsed.entries.map(e => [e.id, e]));

test('backups round-trip', () => {
  const again = parseBackup(JSON.stringify(createBackup(trip, entries)));
  assert.deepEqual(again.entries, parsed.entries);
  assert.deepEqual(again.trip, trip);
});
test('junk is refused plainly', () => {
  assert.match(parseBackup('nope').error, /isn't a Trip Tab/);
  assert.match(parseBackup('{"a":1}').error, /isn't a Trip Tab/);
  assert.match(parseBackup('{"format":"trip-tab-backup","schemaVersion":99}').error, /newer/);
  assert.match(parseBackup('{"format":"trip-tab-backup"}').error, /missing/);
});
test('damaged entries are skipped and counted', () => {
  const b = createBackup(trip, entries); b.entries.push({ id: 'bad', kind: 'expense', total: 5, currency: 'TWD', paid: { a: 4 }, owed: { a: 5 } });
  const p = parseBackup(JSON.stringify(b));
  assert.equal(p.skipped, 1); assert.equal(p.entries.length, 2);
});
test('entry check catches bad money from another phone', () => {
  const good = parsed.entries[0];
  assert.ok(isValidEntry(good));
  assert.ok(!isValidEntry({ ...good, total: -1 }));
  assert.ok(!isValidEntry({ ...good, paid: { a: 1 } }));
  assert.ok(!isValidEntry({ ...good, owed: { a: 'x' } }));
  assert.ok(!isValidEntry(null));
});
test('removed people stay on old entries but leave the active list', () => {
  assert.deepEqual(activeMembers(trip).map(m => m.name), ['Ana', 'Ben']);
  assert.ok(isInUse(entries, 'aaaaaaaaaa')); assert.ok(!isInUse(entries, 'cccccccccc'));
});
test('newer trips are recognized', () => {
  assert.ok(isFromNewerApp({ schemaVersion: SCHEMA_VERSION + 1 }));
  assert.ok(!isFromNewerApp({ schemaVersion: SCHEMA_VERSION }));
  assert.equal(migrateTrip({ id: 'x' }).schemaVersion, 1);
});
test('filenames are dated and safe', () => {
  assert.equal(backupFilename({ name: 'Okinawa, April!' }, 'backup', 'json', new Date(2026, 3, 5)), 'okinawa-april-backup-2026-04-05.json');
  assert.equal(backupFilename({ name: '台灣 行' }, 'expenses', 'csv', new Date(2026, 3, 5)), '台灣-行-expenses-2026-04-05.csv');
});
test('CSV has every person and blocks spreadsheet formulas', () => {
  const list = { ...entries, x: { ...parsed.entries[0], id: 'x', desc: '=HYPERLINK("bad")' } };
  const csv = csvFor(trip, list);
  assert.ok(csv.includes('"Ana paid"')); assert.ok(csv.includes('"Ben share"'));
  assert.ok(csv.includes(`"'=HYPERLINK(""bad"")"`));
  assert.ok(csv.includes('"Ben paid Ana"'));
});
test('CSV leaves out deleted entries', () => {
  assert.ok(!csvFor(trip, { x: { ...parsed.entries[0], desc: 'Gone', deleted: true } }).includes('Gone'));
});

test('refunds are valid, read the right way round and export as negatives', () => {
  const r = { id: 'r', kind: 'refund', desc: 'Back', category: 'food', date: '2026-01-01', currency: 'TWD', rate: 1, total: 100, paid: { aaaaaaaaaa: 50, bbbbbbbbbb: 50 }, owed: { aaaaaaaaaa: 100 } };
  assert.ok(isValidEntry(r));
  assert.deepEqual(handlersOf(r), { aaaaaaaaaa: 100 });
  assert.deepEqual(sharesOf(r), r.paid);
  const row = csvFor(trip, { r }).split('\n')[1];
  assert.ok(row.includes('"Refund"')); assert.ok(row.includes('"-100"')); assert.ok(row.includes('"-50"'));
});
