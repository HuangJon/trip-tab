import test from 'node:test'; import assert from 'node:assert/strict';
import { computeSplit, nonZero } from '../../js/core/split.js';
const ids = ['a', 'b', 'c'], T = 'TWD';
const run = (total, split, c = T) => computeSplit(total, c, split, ids);

test('equal', () => assert.deepEqual(run(100, { mode: 'equal', selected: ids }).owed, { a: 34, b: 33, c: 33 }));
test('equal among some', () => assert.deepEqual(nonZero(run(100, { mode: 'equal', selected: ['b', 'c'] }).owed), { b: 50, c: 50 }));
test('equal needs someone', () => assert.match(run(100, { mode: 'equal', selected: [] }).error, /at least one/));
test('ignores people no longer on the trip', () => assert.deepEqual(run(100, { mode: 'equal', selected: ['a', 'gone'] }).owed, { a: 100 }));
test('needs an amount', () => assert.match(run(0, { mode: 'equal', selected: ids }).error, /above zero/));
test('exact must add up', () => {
  assert.deepEqual(run(100, { mode: 'exact', inputs: { a: '60', b: '40' } }).owed, { a: 60, b: 40 });
  assert.match(run(100, { mode: 'exact', inputs: { a: '60' } }).error, /NT\$60/);
});
test('percent must reach 100 and sum exactly', () => {
  const r = computeSplit(10001, 'USD', { mode: 'percent', inputs: { a: 33.33, b: 33.33, c: 33.34 } }, ids).owed;
  assert.equal(r.a + r.b + r.c, 10001);
  assert.match(run(100, { mode: 'percent', inputs: { a: 50 } }).error, /100%/);
});
test('shares', () => assert.deepEqual(run(1000, { mode: 'shares', inputs: { a: 2, b: 1, c: 1 } }).owed, { a: 500, b: 250, c: 250 }));
test('shares needs one', () => assert.match(run(1000, { mode: 'shares', inputs: {} }).error, /share/));
test('adjust adds extras then splits the rest', () => assert.deepEqual(run(1000, { mode: 'adjust', selected: ids, inputs: { a: '100' } }).owed, { a: 400, b: 300, c: 300 }));
test('adjust allows less', () => assert.deepEqual(run(1000, { mode: 'adjust', selected: ids, inputs: { a: '-100' } }).owed, { a: 267, b: 367, c: 366 }));
test('adjust refuses negative shares and oversize extras', () => {
  assert.match(run(100, { mode: 'adjust', selected: ids, inputs: { a: '-500' } }).error, /negative/);
  assert.match(run(100, { mode: 'adjust', selected: ids, inputs: { a: '500' } }).error, /larger/);
});
test('items share tax and tip by what each ordered', () => {
  const r = run(1100, { mode: 'items', items: [{ name: 'x', amount: '600', people: ['a', 'b'] }, { name: 'y', amount: '400', people: ['c'] }] });
  assert.deepEqual(r.owed, { a: 330, b: 330, c: 440 });
  assert.equal(r.subtotal, 1000);
});
test('items share a discount the same way', () => {
  const r = run(800, { mode: 'items', items: [{ amount: '500', people: ['a'] }, { amount: '500', people: ['b'] }] });
  assert.deepEqual(r.owed, { a: 400, b: 400 });
});
test('items need a price and people', () => {
  assert.match(run(100, { mode: 'items', items: [{ name: 'Beer', amount: '', people: ['a'] }] }).error, /price for Beer/);
  assert.match(run(100, { mode: 'items', items: [{ name: 'Beer', amount: '5', people: [] }] }).error, /who had Beer/);
  assert.match(run(100, { mode: 'items', items: [] }).error, /item/);
});
