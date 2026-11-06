import test from 'node:test';
import assert from 'node:assert/strict';
import { keyboardFit } from '../../js/core/platform.js';

test('a sheet only shrinks for the keyboard, not for small browser bars', () => {
  assert.equal(keyboardFit(800, 0, 844), null);
  assert.deepEqual(keyboardFit(500, 12, 844), { height: 500, top: 12 });
});
