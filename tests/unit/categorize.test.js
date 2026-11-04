import test from 'node:test'; import assert from 'node:assert/strict';
import { suggestCategory as g } from '../../js/core/categorize.js';

test('suggests from common words', () => {
  for (const [text, cat] of [['Dinner at the night market', 'food'], ['Izakaya', 'food'], ['Rental car', 'transport'], ['Uber to hotel', 'lodging'], ['Taxi to airport', 'transport'], ['Hotel deposit', 'lodging'], ['Airbnb', 'lodging'], ['Flight to Tokyo', 'flights'], ['Aquarium tickets', 'activities'], ['beers', 'drinks'], ['Coffee', 'drinks'], ['Costco run', 'groceries'], ['7-Eleven', 'groceries'], ['Souvenirs', 'shopping'], ['Tip', 'fees'], ['Visa fee', 'fees']]) assert.equal(g(text), cat, text);
});
test('capitals and extra spaces make no difference', () => assert.equal(g('  RENTAL   CAR '), 'transport'));
test('whole English words only', () => {
  assert.equal(g('barber'), null);
  assert.equal(g('Tipperary'), null);
  assert.equal(g('Parkinson'), null);
});
test('Chinese and Japanese work inside a phrase', () => {
  assert.equal(g('今天晚餐'), 'food'); assert.equal(g('高鐵票'), 'transport'); assert.equal(g('住宿費'), 'lodging');
  assert.equal(g('居酒屋'), 'food'); assert.equal(g('タクシー代'), 'transport'); assert.equal(g('機票'), 'flights');
});
test('nothing typed or nothing known gives no suggestion', () => {
  assert.equal(g(''), null); assert.equal(g('   '), null); assert.equal(g('Zxqv'), null); assert.equal(g(undefined), null);
});
test("the group's own history beats keywords, most recent first", () => {
  const past = [{ kind: 'expense', desc: 'Bar Luce', category: 'food', createdAt: 1 }, { kind: 'expense', desc: 'bar luce', category: 'activities', createdAt: 2 }];
  assert.equal(g('Bar Luce', past), 'activities');
  assert.equal(g('Bar', past), 'drinks');
});
test('settlements are not learned from', () => assert.equal(g('Settlement', [{ kind: 'payment', desc: 'Settlement', category: 'other' }]), null));
