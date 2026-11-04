import test from 'node:test'; import assert from 'node:assert/strict';
import { inBase, needsRate, netBalances, pairwise, simplify, spendingBreakdown } from '../../js/core/debts.js';
const es = [
  { kind: 'expense', category: 'food', date: '2026-01-01', currency: 'TWD', total: 900, paid: { a: 900 }, owed: { a: 300, b: 300, c: 300 } },
  { kind: 'expense', category: 'fun', date: '2026-01-02', currency: 'JPY', rate: 0.21, total: 3333, paid: { b: 3333 }, owed: { a: 1111, b: 1111, c: 1111 } },
  { kind: 'payment', category: 'other', date: '2026-01-03', currency: 'TWD', total: 100, paid: { c: 100 }, owed: { a: 100 } },
];
const applied = (net, debts) => { const r = { ...net }; for (const d of debts) { r[d.from] += d.amount; r[d.to] -= d.amount; } return r; };

test('foreign amounts convert with exact parts', () => {
  const b = inBase(es[1], 'TWD');
  assert.equal(b.total, 700);
  assert.equal(Object.values(b.owed).reduce((x, y) => x + y, 0), 700);
});
test('balances: paying someone back reduces both sides', () => {
  const net = netBalances([{ currency: 'TWD', total: 100, paid: { b: 100 }, owed: { a: 100 } }, { currency: 'TWD', total: 100, paid: { a: 100 }, owed: { b: 100 } }], 'TWD', ['a', 'b']);
  assert.deepEqual(net, { a: 0, b: 0 });
});
test('balances sum to zero and include everyone', () => {
  const net = netBalances(es, 'TWD', ['a', 'b', 'c', 'd']);
  assert.equal(net.d, 0);
  assert.equal(Object.values(net).reduce((x, y) => x + y, 0), 0);
});
test('both settle plans clear every balance', () => {
  const net = netBalances(es, 'TWD');
  for (const plan of [simplify(net), pairwise(es, 'TWD')]) assert.ok(Object.values(applied(net, plan)).every(v => v === 0));
});
test('simplify makes fewer payments for a chain', () => {
  const chain = [{ currency: 'T', total: 10, paid: { b: 10 }, owed: { a: 10 } }, { currency: 'T', total: 10, paid: { c: 10 }, owed: { b: 10 } }];
  assert.deepEqual(simplify(netBalances(chain, 'T')), [{ from: 'a', to: 'c', amount: 10 }]);
  assert.equal(pairwise(chain, 'T').length, 2);
});
test('simplify prefers an exact match', () => {
  assert.equal(simplify({ a: -10, b: -20, c: 20, d: 10 }).length, 2);
});
test('random trips always balance and settle exactly', () => {
  const people = ['a', 'b', 'c', 'd', 'e'];
  for (let k = 0; k < 500; k++) {
    const list = Array.from({ length: 1 + k % 15 }, (_, i) => {
      const total = 1 + Math.floor(Math.random() * 1e5), half = Math.floor(total / 2);
      const p = people[i % 5], q = people[(i * 3 + k) % 5], r = people[(i + 2) % 5];
      const owed = {}; owed[q] = (owed[q] || 0) + half; owed[r] = (owed[r] || 0) + total - half;
      return { currency: i % 2 ? 'JPY' : 'TWD', rate: 0.2 + (k % 7) / 10, total, paid: { [p]: total }, owed };
    });
    const net = netBalances(list, 'TWD');
    assert.equal(Object.values(net).reduce((x, y) => x + y, 0), 0);
    for (const plan of [simplify(net), pairwise(list, 'TWD')]) assert.ok(Object.values(applied(net, plan)).every(v => v === 0));
  }
});
test('breakdown ignores settlements', () => {
  const s = spendingBreakdown(es, 'TWD');
  assert.equal(s.count, 2);
  assert.equal(s.total, 1600);
  assert.equal(s.byCategory.food, 900);
  assert.equal(s.paid.c, undefined);
});

test('a refund gives the sharers credit and the receiver the debt', () => {
  const spent = { kind: 'expense', category: 'lodging', date: '2026-01-01', currency: 'T', total: 300, paid: { a: 300 }, owed: { a: 100, b: 100, c: 100 } };
  const refund = { kind: 'refund', category: 'lodging', date: '2026-01-02', currency: 'T', total: 300, paid: { a: 100, b: 100, c: 100 }, owed: { a: 300 } };
  assert.deepEqual(netBalances([spent, refund], 'T'), { a: 0, b: 0, c: 0 });
  const half = { ...refund, total: 150, paid: { a: 50, b: 50, c: 50 }, owed: { a: 150 } };
  assert.deepEqual(simplify(netBalances([spent, half], 'T')).map(d => d.amount), [50, 50]);
  const s = spendingBreakdown([spent, half], 'T');
  assert.equal(s.total, 150); assert.equal(s.byCategory.lodging, 150); assert.equal(s.count, 1);
  assert.equal(s.paid.a, 150); assert.equal(s.share.b, 50);
});

test('an expense with no rate stays out of every total until it has one', () => {
  const rated = { kind: 'expense', category: 'food', date: '2026-01-01', currency: 'TWD', total: 100, paid: { a: 100 }, owed: { a: 50, b: 50 } };
  const waiting = { kind: 'expense', category: 'fun', date: '2026-01-01', currency: 'JPY', rate: null, total: 5000, paid: { b: 5000 }, owed: { a: 2500, b: 2500 } };
  assert.ok(needsRate(waiting, 'TWD')); assert.ok(!needsRate(rated, 'TWD'));
  assert.ok(!needsRate({ currency: 'TWD' }, 'TWD'), 'the trip currency never needs a rate');
  assert.deepEqual(netBalances([rated, waiting], 'TWD'), { a: 50, b: -50 });
  assert.deepEqual(pairwise([rated, waiting], 'TWD'), [{ from: 'b', to: 'a', amount: 50 }]);
  assert.equal(spendingBreakdown([rated, waiting], 'TWD').total, 100);
  const fixed = netBalances([rated, { ...waiting, rate: 0.2 }], 'TWD');
  assert.deepEqual(fixed, { a: -450, b: 450 });
});
