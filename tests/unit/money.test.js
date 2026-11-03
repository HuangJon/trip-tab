import test from 'node:test'; import assert from 'node:assert/strict';
import { allocate, convert, fromMinor, money, toMinor } from '../../js/core/money.js';
const sum = o => Object.values(o).reduce((a, b) => a + b, 0);

test('reads typed amounts per currency', () => {
  assert.equal(toMinor('12.34', 'USD'), 1234);
  assert.equal(toMinor('1,200', 'TWD'), 1200);
  assert.equal(toMinor('19.99', 'USD'), 1999); // would be 1998.99 without rounding
  assert.equal(toMinor('abc', 'USD'), 0);
  assert.equal(toMinor(undefined, 'USD'), 0);
  assert.equal(fromMinor(1234, 'USD'), '12.34');
  assert.equal(fromMinor(1200, 'TWD'), '1200');
});
test('formats money', () => {
  assert.equal(money(123456, 'USD'), '$1,234.56');
  assert.equal(money(1200, 'TWD'), 'NT$1,200');
});
test('allocate hands the leftover to the first people', () => assert.deepEqual(allocate(100, { a: 1, b: 1, c: 1 }), { a: 34, b: 33, c: 33 }));
test('allocate gives zero weights nothing', () => assert.deepEqual(allocate(10, { a: 0, b: 1 }), { a: 0, b: 10 }));
test('allocate with no weight gives nothing', () => assert.deepEqual(allocate(10, { a: 0 }), { a: 0 }));
test('allocate always sums exactly (random weights)', () => {
  for (let k = 0; k < 5000; k++) {
    const total = 1 + Math.floor(Math.random() * 1e7), w = {};
    for (let j = 0; j < 1 + k % 12; j++) w[`p${j}`] = Math.random() * 100;
    assert.equal(sum(allocate(total, w)), total);
  }
});
test('convert uses the rate and each currency\'s decimals', () => {
  assert.equal(convert(7500, 'JPY', 'TWD', 0.21), 1575);
  assert.equal(convert(1000, 'USD', 'TWD', 32), 320);
  assert.equal(convert(500, 'TWD', 'TWD', 99), 500);
});
