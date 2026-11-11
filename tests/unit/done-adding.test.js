import test from 'node:test';
import assert from 'node:assert/strict';
import { doneAdding } from '../../js/core/model.js';

const trip = members => ({ members });

test('only names someone signed in as count', () => {
  const r = doneAdding(trip({ a: { name: 'Ana', claimed: true, done: true }, b: { name: 'Ben' }, c: { name: 'Chi', claimed: true } }));
  assert.equal(r.people.length, 2);
  assert.equal(r.done.length, 1);
  assert.equal(r.all, false);
});
test('everyone done once every signed-in name says so', () => {
  assert.equal(doneAdding(trip({ a: { claimed: true, done: true }, c: { claimed: true, done: true }, x: { claimed: true, done: false, removed: true } })).all, true);
});
test('a trip nobody has joined is never done', () => assert.equal(doneAdding(trip({ a: { name: 'Ana' } })).all, false));
