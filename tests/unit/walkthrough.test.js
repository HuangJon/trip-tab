import test from 'node:test'; import assert from 'node:assert/strict';
import { backAfterAWhile } from '../../js/core/platform.js';
const DAY = 86400000;
test('the walkthrough is offered after more than 90 days away', () => {
  assert.equal(backAfterAWhile(null, 1000), false);
  assert.equal(backAfterAWhile(1000, 1000 + 90 * DAY), false);
  assert.equal(backAfterAWhile(1000, 1000 + 91 * DAY), true);
});
