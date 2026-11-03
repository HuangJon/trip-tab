import test from 'node:test'; import assert from 'node:assert/strict';
import { isIos, shouldSuggestInstall } from '../../js/core/platform.js';

test('recognizes iPhones and iPads that report as Macs', () => {
  assert.ok(isIos('Mozilla (iPhone; CPU iPhone OS 18)'));
  assert.ok(isIos('Mozilla (Macintosh)', 'MacIntel', 5));
  assert.ok(!isIos('Mozilla (Macintosh)', 'MacIntel', 0));
  assert.ok(!isIos('Mozilla (Linux; Android)'));
});
test('suggests installing only in iPhone Safari, once dismissed never again', () => {
  const on = { ios: true, standalone: false, preview: false, dismissed: false };
  assert.ok(shouldSuggestInstall(on));
  for (const change of [{ ios: false }, { standalone: true }, { preview: true }, { dismissed: true }]) assert.ok(!shouldSuggestInstall({ ...on, ...change }));
});
