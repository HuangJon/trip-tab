import test from 'node:test'; import assert from 'node:assert/strict';
import { EMPTY_FILTERS, activeFilterCount, applyFilters, filterTags, filteredTotal, moreFiltersInUse } from '../../js/core/filters.js';

const trip = { currency: 'USD', members: { a: { name: 'Ana' }, b: { name: 'Ben' }, c: { name: 'Chi' } } };
const e = (id, over) => ({ id, kind: 'expense', category: 'food', currency: 'USD', rate: 1, total: 1000, date: '2026-01-01', createdAt: 1, desc: id, paid: { a: 1000 }, owed: { a: 500, b: 500 }, ...over });
const list = [
  e('dinner', { total: 5000, paid: { a: 5000 }, owed: { a: 2500, b: 2500 }, date: '2026-01-01' }),
  e('taxi', { category: 'transport', total: 2000, paid: { b: 2000 }, owed: { b: 1000, c: 1000 }, date: '2026-01-03' }),
  e('refund', { kind: 'refund', total: 500, paid: { a: 250, b: 250 }, owed: { a: 500 }, date: '2026-01-04' }),
  e('settle', { kind: 'payment', category: 'other', total: 300, paid: { c: 300 }, owed: { a: 300 }, date: '2026-01-05' }),
  e('yen', { currency: 'JPY', rate: null, total: 9000, paid: { c: 9000 }, owed: { c: 9000 }, date: '2026-01-02' }),
];
const ids = f => applyFilters(list, trip, f.q || '', { ...EMPTY_FILTERS, ...f }).map(x => x.id);

test('newest first by default', () => assert.deepEqual(ids({}), ['settle', 'refund', 'taxi', 'yen', 'dinner']));
test('oldest first', () => assert.equal(ids({ sort: 'oldest' })[0], 'dinner'));
test('by person includes anyone who paid or shared', () => {
  assert.deepEqual(ids({ person: 'c' }), ['settle', 'taxi', 'yen']);
  assert.deepEqual(ids({ person: 'b' }), ['refund', 'taxi', 'dinner']);
});
test('by type', () => {
  assert.deepEqual(ids({ type: 'transport' }), ['taxi']);
  assert.deepEqual(ids({ type: 'kind:refund' }), ['refund']);
  assert.deepEqual(ids({ type: 'kind:payment' }), ['settle']);
  assert.ok(!ids({ type: 'other' }).includes('settle'), 'settlements are not a category');
});
test('dates include both ends', () => {
  assert.deepEqual(ids({ from: '2026-01-03', to: '2026-01-04' }), ['refund', 'taxi']);
  assert.deepEqual(ids({ to: '2026-01-01' }), ['dinner']);
});
test('amounts include both ends, in the trip currency', () => {
  assert.deepEqual(ids({ min: '20', max: '50' }), ['taxi', 'dinner']);
  assert.deepEqual(ids({ max: '3' }), ['settle']);
  assert.deepEqual(ids({ min: '4.50', max: '5' }), ['refund']);
});
test('an expense with no rate can\'t match an amount filter', () => assert.ok(!ids({ min: '0.01' }).includes('yen')));
test('foreign amounts are converted first', () => {
  const y = [e('rated', { currency: 'JPY', rate: 0.01, total: 10000, paid: { a: 10000 }, owed: { a: 10000 } })];
  assert.equal(applyFilters(y, trip, '', { ...EMPTY_FILTERS, min: '99', max: '101' }).length, 1);
});
test('largest and smallest sort by converted size', () => {
  assert.equal(ids({ sort: 'largest' })[0], 'dinner');
  assert.equal(ids({ sort: 'smallest' })[0], 'yen', 'no rate sorts lowest');
});
test('filters and search combine', () => {
  assert.deepEqual(ids({ person: 'b', q: 'tax' }), ['taxi']);
  assert.deepEqual(ids({ q: 'CHI', type: 'food' }), ['yen']);
  assert.deepEqual(ids({ q: 'nothing' }), []);
});
test('the total leaves out settlements and unrated, and subtracts refunds', () => assert.equal(filteredTotal(list, 'USD'), 6500));
test('counts filters on, not the sort', () => {
  assert.equal(activeFilterCount(EMPTY_FILTERS), 0);
  assert.equal(activeFilterCount({ ...EMPTY_FILTERS, sort: 'largest' }), 0);
  assert.equal(activeFilterCount({ ...EMPTY_FILTERS, person: 'a', min: '1' }), 2);
});

test('paid by finds only who handled the money, and works with involved', () => {
  for (const e of list) {
    const got = applyFilters(list, trip, '', { ...EMPTY_FILTERS, payer: 'b' }).some(x => x.id === e.id);
    const handled = e.kind === 'refund' ? Boolean(e.owed.b) : Boolean(e.paid.b);
    assert.equal(got, handled, e.id);
  }
  const both = applyFilters(list, trip, '', { ...EMPTY_FILTERS, payer: 'a', person: 'b' });
  for (const e of both) assert.ok((e.kind === 'refund' ? e.owed.a : e.paid.a) && (e.paid.b || e.owed.b));
  assert.equal(activeFilterCount({ ...EMPTY_FILTERS, payer: 'a' }), 1);
});

test('active filters become removable tags, and sort is not one', () => {
  const words = { nameOf: id => ({ a: 'Ana', b: 'Ben' })[id], typeName: t => t, money: v => `$${v}` };
  assert.deepEqual(filterTags(EMPTY_FILTERS, '  ', words), []);
  assert.deepEqual(filterTags({ ...EMPTY_FILTERS, sort: 'largest' }, '', words), []);
  assert.deepEqual(filterTags({ ...EMPTY_FILTERS, payer: 'b', person: 'a', min: '5' }, 'uber', words).map(t => [t.key, t.label]), [
    ['search', 'Search: uber'], ['payer', 'Paid by Ben'], ['person', 'Involved: Ana'], ['min', 'At least $5'],
  ]);
});
test('the extra filters stay open while one is in use', () => {
  assert.equal(moreFiltersInUse(EMPTY_FILTERS), false);
  assert.equal(moreFiltersInUse({ ...EMPTY_FILTERS, payer: 'a' }), false);
  assert.equal(moreFiltersInUse({ ...EMPTY_FILTERS, min: '1' }), true);
  assert.equal(moreFiltersInUse({ ...EMPTY_FILTERS, sort: 'oldest' }), true);
});
