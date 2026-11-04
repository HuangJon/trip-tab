import test from 'node:test'; import assert from 'node:assert/strict';
import { asksInverse, looksBackwards, rateLabel, rateQuestion, storedToTyped, typedToStored } from '../../js/core/rates.js';
import { convert } from '../../js/core/money.js';

test('the form asks in the direction that gives a number of 1 or more', () => {
  assert.deepEqual(rateQuestion('TWD', 'USD'), { one: 'USD', many: 'TWD' });
  assert.deepEqual(rateQuestion('USD', 'TWD'), { one: 'USD', many: 'TWD' });
  assert.deepEqual(rateQuestion('JPY', 'TWD'), { one: 'TWD', many: 'JPY' });
  assert.ok(!asksInverse('USD', 'TWD')); assert.ok(asksInverse('TWD', 'USD'));
});
test("typing 33 for a TWD expense on a USD trip gives the right amount (the reported bug)", () => {
  const rate = typedToStored('33', 'TWD', 'USD');
  assert.equal(convert(2800, 'TWD', 'USD', rate), 8485); // $84.85
  assert.equal(storedToTyped(rate, 'TWD', 'USD'), '33');
});
test('a USD expense on a TWD trip is stored directly', () => {
  assert.equal(typedToStored('33', 'USD', 'TWD'), 33);
  assert.equal(convert(1000, 'USD', 'TWD', 33), 330);
});
test('typed values round-trip without ugly decimals', () => {
  for (const [v, a, b] of [['4.76', 'JPY', 'TWD'], ['32.5', 'TWD', 'USD'], ['1.08', 'EUR', 'USD'], ['1400', 'KRW', 'USD']]) {
    assert.equal(storedToTyped(typedToStored(v, a, b), a, b), v);
  }
});
test('junk and blanks give nothing', () => {
  for (const v of ['', 'abc', '0', '-3', undefined]) assert.equal(typedToStored(v, 'TWD', 'USD'), null);
  assert.equal(storedToTyped(null, 'TWD', 'USD'), '');
});
test('commas are fine', () => assert.equal(storedToTyped(typedToStored('1,400', 'KRW', 'USD'), 'KRW', 'USD'), '1400'));
test('backwards rates are caught', () => {
  assert.ok(looksBackwards(33, 'TWD', 'USD'), 'the exact reported mistake');
  assert.ok(!looksBackwards(1 / 33, 'TWD', 'USD'));
  assert.ok(looksBackwards(0.03, 'USD', 'TWD'));
  assert.ok(!looksBackwards(33, 'USD', 'TWD'));
  assert.ok(!looksBackwards(45, 'USD', 'TWD'), 'a rate that drifted is still fine');
});
test("similar currencies, and ones not listed, are never flagged", () => {
  assert.ok(!looksBackwards(0.9, 'USD', 'EUR')); assert.ok(!looksBackwards(1.1, 'USD', 'EUR'));
  assert.ok(!looksBackwards(99, 'XXX', 'USD'));
});
test('labels read naturally', () => {
  assert.equal(rateLabel(1 / 33, 'TWD', 'USD'), '1 USD = 33 TWD');
  assert.equal(rateLabel(33, 'USD', 'TWD'), '1 USD = 33 TWD');
});
