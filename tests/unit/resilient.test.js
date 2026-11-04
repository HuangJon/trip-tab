import test from 'node:test'; import assert from 'node:assert/strict';
import { resilient } from '../../js/data/resilient.js';

const wait = ms => new Promise(r => setTimeout(r, ms));
const denied = { code: 'permission-denied' };

test('a refused listener tries again and then works', async () => {
  const fails = [];
  let starts = 0;
  resilient((_ok, fail) => { starts += 1; if (starts === 1) fail(denied); return () => {}; }, e => fails.push(e), [1, 1]);
  await wait(10);
  assert.equal(starts, 2);
  assert.deepEqual(fails, []);
});
test('a lasting refusal is reported once the retries run out', async () => {
  const fails = [];
  let starts = 0;
  resilient((_ok, fail) => { starts += 1; fail(denied); return () => {}; }, e => fails.push(e), [1, 1]);
  await wait(15);
  assert.equal(starts, 3);
  assert.deepEqual(fails, [denied]);
});
test('other errors are reported right away', () => {
  const fails = [];
  resilient((_ok, fail) => { fail({ code: 'unavailable' }); return () => {}; }, e => fails.push(e.code));
  assert.deepEqual(fails, ['unavailable']);
});
test('data resets the retries', async () => {
  let starts = 0;
  const callbacks = [];
  resilient((ok, fail) => { starts += 1; callbacks.push({ ok, fail }); return () => {}; }, () => assert.fail('should keep trying'), [1]);
  callbacks[0].fail(denied);
  await wait(5);
  callbacks[1].ok();
  callbacks[1].fail(denied);
  await wait(5);
  assert.equal(starts, 3);
});
test('stopping cancels a pending retry', async () => {
  let starts = 0, stopped = 0;
  const off = resilient((_ok, fail) => { starts += 1; fail(denied); return () => { stopped += 1; }; }, null, [5]);
  off();
  await wait(15);
  assert.equal(starts, 1);
  assert.equal(stopped, 1);
});
