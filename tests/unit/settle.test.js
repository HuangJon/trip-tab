import test from 'node:test'; import assert from 'node:assert/strict';
import { coveredBy, exactRate, sendFor } from '../../js/core/settle.js';
import { inBase, netBalances } from '../../js/core/debts.js';

test('the amount to send, both ways round', () => {
  assert.equal(sendFor(1125, 'TWD', 'USD', 33), 3409); // $34.09
  assert.equal(coveredBy(3400, 'USD', 'TWD', 33), 1122);
  assert.equal(sendFor(3409, 'USD', 'TWD', 1 / 33), 1125);
});
test('paying the suggested amount clears the debt exactly', () => {
  for (const [debt, base, pay, rate] of [[1125, 'TWD', 'USD', 33], [100, 'TWD', 'USD', 32.7], [4999, 'USD', 'TWD', 1 / 31], [33333, 'JPY', 'USD', 151], [7, 'USD', 'JPY', 1 / 150]]) {
    const send = sendFor(debt, base, pay, rate);
    const payment = { kind: 'payment', currency: pay, rate: exactRate(debt, base, send, pay), total: send, paid: { a: send }, owed: { b: send } };
    assert.equal(inBase(payment, base).total, debt, `${debt} ${base} in ${pay}`);
  }
});
test('random debts always clear to zero', () => {
  for (let i = 0; i < 3000; i += 1) {
    const debt = 1 + Math.floor(Math.random() * 500000), rate = 5 + Math.random() * 60;
    const send = sendFor(debt, 'TWD', 'USD', rate);
    if (send < 1) continue;
    const expense = { kind: 'expense', currency: 'TWD', total: debt, paid: { b: debt }, owed: { a: debt } };
    const payment = { kind: 'payment', currency: 'USD', rate: exactRate(debt, 'TWD', send, 'USD'), total: send, paid: { a: send }, owed: { b: send } };
    assert.deepEqual(netBalances([expense, payment], 'TWD'), { a: 0, b: 0 });
  }
});
test('a part payment leaves the rest', () => {
  const expense = { kind: 'expense', currency: 'TWD', total: 1000, paid: { b: 1000 }, owed: { a: 1000 } };
  const send = 1000; // $10 at 33 covers NT$330
  const covered = coveredBy(send, 'USD', 'TWD', 33);
  const payment = { kind: 'payment', currency: 'USD', rate: exactRate(covered, 'TWD', send, 'USD'), total: send, paid: { a: send }, owed: { b: send } };
  assert.deepEqual(netBalances([expense, payment], 'TWD'), { a: -670, b: 670 });
});
