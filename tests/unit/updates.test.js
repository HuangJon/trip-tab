import test from 'node:test'; import assert from 'node:assert/strict';
import { watchForUpdates } from '../../js/ui/updates.js';

function setup(controller = {}) {
  const on = {}, listen = { addEventListener: (k, f) => { on[k] = f; }, setInterval: f => { on.timer = f; } };
  const reg = { ...listen, updates: 0, update() { this.updates += 1; return Promise.resolve(); } };
  const state = { time: 0, banners: 0 };
  const doc = { visibilityState: 'visible', addEventListener: listen.addEventListener };
  return { on, reg, state, doc, opts: { sw: { controller, register: async () => reg }, doc, win: listen, now: () => state.time, onUpdate: () => { state.banners += 1; } } };
}

test('coming back to the screen checks for a new version, at most once a minute', async () => {
  const t = setup();
  await watchForUpdates(t.opts);
  t.state.time = 30000; t.on.visibilitychange();
  assert.equal(t.reg.updates, 0);
  t.state.time = 61000; t.on.visibilitychange();
  assert.equal(t.reg.updates, 1);
  t.state.time = 62000; t.on.visibilitychange();
  assert.equal(t.reg.updates, 1);
});
test('a tab left open keeps checking', async () => {
  const t = setup();
  await watchForUpdates(t.opts);
  t.state.time = 900000; t.on.timer();
  assert.equal(t.reg.updates, 1);
});
test('going to the background and being offline do no harm', async () => {
  const t = setup();
  t.reg.update = () => Promise.reject(new Error('offline'));
  await watchForUpdates(t.opts);
  t.state.time = 61000; t.doc.visibilityState = 'hidden'; t.on.visibilitychange();
  t.doc.visibilityState = 'visible'; t.on.online();
  await new Promise(r => setTimeout(r));
});
test('the banner appears when a new version is ready, but not on the first install', async () => {
  for (const [controller, banners] of [[{}, 1], [null, 0]]) {
    const t = setup(controller), worker = { state: 'installing', addEventListener: (k, f) => { worker.change = f; } };
    await watchForUpdates(t.opts);
    t.reg.installing = worker;
    t.on.updatefound();
    worker.state = 'installed';
    worker.change?.();
    assert.equal(t.state.banners, banners);
  }
});
