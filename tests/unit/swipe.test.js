import test from 'node:test';
import assert from 'node:assert/strict';
import { swipeGoesBack } from '../../js/core/platform.js';

const swipe = over => swipeGoesBack({ startX: 5, dx: 200, dy: 10, width: 390, ms: 400, ...over });

test('a long swipe from the edge goes back', () => assert.equal(swipe({}), true));
test('a quick short flick goes back', () => assert.equal(swipe({ dx: 80, ms: 100 }), true));
test('a short slow drag does not', () => assert.equal(swipe({ dx: 80, ms: 600 }), false));
test('it has to start at the edge', () => assert.equal(swipe({ startX: 60 }), false));
test('a mostly up-and-down move is a scroll, not a swipe', () => assert.equal(swipe({ dy: 180 }), false));
test('swiping the other way does nothing', () => assert.equal(swipe({ dx: -200 }), false));
