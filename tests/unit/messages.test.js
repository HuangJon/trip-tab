import test from 'node:test'; import assert from 'node:assert/strict';
import { reminderText, wrapUpText } from '../../js/core/messages.js';
import { venmoLink } from '../../js/core/settle.js';

test('a Venmo link fills in dollars, and leaves other currencies blank', () => {
  assert.equal(venmoLink('@mia-c', 1250, 'USD', 'Okinawa'), 'https://venmo.com/mia-c?txn=pay&amount=12.50&note=Okinawa');
  assert.equal(venmoLink('mia', 1250, 'TWD'), 'https://venmo.com/mia?txn=pay');
  assert.equal(venmoLink('not a handle', 100, 'USD'), '');
  assert.equal(venmoLink('../evil', 100, 'USD'), '');
  assert.equal(venmoLink('', 100, 'USD'), '');
});
test('a reminder says who, how much and how', () => {
  const t = reminderText({ tripName: 'Okinawa', toName: 'Mia', amount: '$12.00', venmo: '@j', zelle: 'j@x.com', link: 'https://x/#join-1' });
  assert.match(t, /Hi Mia!/); assert.match(t, /you owe me \$12\.00/); assert.match(t, /Venmo @j or Zelle j@x\.com/); assert.match(t, /https:\/\/x/);
  assert.ok(!/pay me/.test(reminderText({ tripName: 'T', toName: 'M', amount: '$1.00' })));
});
test('a wrap-up adds up the trip', () => {
  const e = { id: 'e', kind: 'expense', currency: 'USD', rate: 1, category: 'food', date: '2026-01-01', total: 3000, paid: { a: 3000 }, owed: { a: 1500, b: 1500 }, deleted: false };
  const t = wrapUpText('Okinawa', [e], 'USD', [{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Bo' }]);
  assert.match(t, /Okinawa wrap-up/); assert.match(t, /\$30\.00 over 1 day, \$15\.00 per person/); assert.match(t, /Food \$30\.00/); assert.match(t, /Ana: paid \$30\.00, share \$15\.00/);
});

test('a wrap-up ends with a link to review and pay', () => {
  const t = wrapUpText('Okinawa', [], 'USD', [{ id: 'a', name: 'Ana' }], { link: 'https://x.test/#join-abc', final: true });
  assert.match(t, /Expenses are closed, so these numbers are final\.\nReview and pay: https:\/\/x\.test\/#join-abc$/);
  assert.doesNotMatch(wrapUpText('Okinawa', [], 'USD', [], { link: 'https://x.test/' }), /final/);
});
