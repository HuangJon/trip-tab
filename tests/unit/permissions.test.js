import test from 'node:test'; import assert from 'node:assert/strict';
import { canEditEntry, isAdminId } from '../../js/core/model.js';

const trip = { admins: { boss: true } };
const e = { kind: 'expense', createdById: 'adder', paid: { payer: 10 }, owed: { friend: 10 } };

test('who can change an expense', () => {
  assert.ok(canEditEntry(trip, e, 'boss'));
  assert.ok(canEditEntry(trip, e, 'adder'));
  assert.ok(canEditEntry(trip, e, 'payer'));
  assert.ok(!canEditEntry(trip, e, 'friend'));
  assert.ok(!canEditEntry(trip, e, null));
});
test('on a refund, the person who received it can change it', () => {
  const r = { kind: 'refund', paid: { friend: 10 }, owed: { receiver: 10 } };
  assert.ok(canEditEntry(trip, r, 'receiver'));
  assert.ok(!canEditEntry(trip, r, 'friend'));
});
test('admin checks', () => {
  assert.ok(isAdminId(trip, 'boss')); assert.ok(!isAdminId(trip, 'x')); assert.ok(!isAdminId({}, 'boss')); assert.ok(!isAdminId(trip, null));
});
