import test from 'node:test'; import assert from 'node:assert/strict';
import { canEditEntry, isAdminId } from '../../js/core/model.js';
import { createTransferCode, looksLikeTransferCode, parseTransferCode } from '../../js/core/transfer.js';

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
test('transfer codes round-trip and refuse junk', () => {
  const claims = [{ tripId: 'a'.repeat(24), memberId: 'b'.repeat(10), key: 'c'.repeat(24) }];
  const code = createTransferCode(claims);
  assert.ok(looksLikeTransferCode(code)); assert.ok(looksLikeTransferCode(`  ${code} `));
  assert.ok(!looksLikeTransferCode('https://x/#join-abc'));
  assert.deepEqual(parseTransferCode(` ${code} `), claims);
  for (const bad of ['TT1.notbase64!', 'TT1.', `TT1.${btoa('{}')}`, `TT1.${btoa('[["x","y","z"]]')}`, `TT1.${btoa('[["<script>aaaaaaaa","bbbbbbbbbb","cccccccccc"]]')}`]) assert.equal(parseTransferCode(bad), null);
});
