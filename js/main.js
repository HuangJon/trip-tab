/** App entry point: picks the database, connects the screens and keeps them live. */
import { firebaseConfig, FIREBASE_VERSION } from './config/firebase.js';
import { createLocalStorage, requestPersistentStorage } from './data/storage.js';
import { createLocalBackend } from './data/backend-local.js';
import { createFirebaseBackend, loadFirebaseSdk } from './data/backend-firebase.js';
import { createRepository } from './data/repository.js';
import { createDevice } from './data/device.js';
import { seedExample } from './data/example.js';
import { createBackup } from './core/backup.js';
import { isFromNewerApp, liveEntries } from './core/model.js';
import { A, actions, changes, inputs, render, setRender, submits } from './ui/state.js';
import { ICON, canWrite, closeSheet, svg, today } from './ui/dom.js';
import { TABS, readHash } from './ui/routes.js';
import { homeView } from './ui/home.js';
import { tripHeader } from './ui/trip.js';
import { expensesView } from './ui/expenses.js';
import { balancesView } from './ui/balances.js';
import { insightsView } from './ui/insights.js';
import { activityView } from './ui/activity.js';
import { importFile, peopleView, unavailableView } from './ui/people.js';
import { attachReceipt } from './ui/expense-form.js';
import { openDetail } from './ui/detail.js';

const PREVIEW = Boolean(globalThis.__TRIP_TAB_PREVIEW__);
const storage = createLocalStorage();
const VIEWS = { expenses: expensesView, balances: balancesView, insights: insightsView, activity: activityView, people: peopleView };
const TAB_LABELS = { expenses: ['Expenses', ICON.list], balances: ['Balances', ICON.scale], insights: ['Insights', ICON.chart], activity: ['Activity', ICON.clock], people: ['People', ICON.people] };

/* ---------- Drawing ---------- */
function draw() {
  const app = document.getElementById('app'), tabs = document.getElementById('tabs'), fab = document.getElementById('fabSlot');
  if (A.status !== 'ready') {
    tabs.hidden = true;
    fab.innerHTML = '';
    if (A.status === 'failed') app.innerHTML = '<div class="panel empty"><h2>The app couldn\'t connect</h2><p class="muted">The first time you open it, you need a connection. Check yours, then try again.</p><button class="btn primary" data-action="reload">Try again</button></div>';
    return;
  }
  // Keep the cursor and typed text in any box on the screen across a live update.
  const active = document.activeElement;
  const typing = active && app.contains(active) && active.tagName === 'INPUT' && active.type !== 'checkbox' ? { id: active.id, value: active.value, at: active.selectionStart } : null;
  const trip = A.route.name === 'trip' ? A.trips[A.route.tripId] : null;
  if (A.route.name !== 'trip') {
    tabs.hidden = true;
    fab.innerHTML = '';
    app.innerHTML = homeView();
  } else if (!trip || trip.deletedAt) {
    tabs.hidden = true;
    fab.innerHTML = '';
    app.innerHTML = unavailableView(A.route.tripId);
  } else {
    const tab = A.route.tab;
    app.innerHTML = tripHeader(trip) + VIEWS[tab](trip);
    tabs.hidden = false;
    tabs.innerHTML = `<div class="tabs-in">${TABS.map(k => `<button data-action="tab" data-tab="${k}" ${tab === k ? 'aria-current="page"' : ''}>${svg(TAB_LABELS[k][1])}${TAB_LABELS[k][0]}</button>`).join('')}</div>`;
    fab.innerHTML = !canWrite(trip) ? '' : tab === 'balances'
      ? `<button class="fab" data-action="settle">${svg(ICON.swap)}Settle up</button>`
      : `<button class="fab" data-action="add-expense">${svg(ICON.plus)}Add expense</button>`;
  }
  if (typing) {
    const n = document.getElementById(typing.id);
    if (n) { n.value = typing.value; n.focus(); try { n.setSelectionRange(typing.at, typing.at); } catch { /* date boxes */ } }
  }
}
setRender(draw);

/* ---------- Live data ---------- */
const watching = new Set(), watchingActivity = new Set();
let snapshotTimer;
function saveSnapshot(id) {
  clearTimeout(snapshotTimer);
  snapshotTimer = setTimeout(() => {
    const t = A.trips[id], entries = A.entries[id];
    if (t && entries && liveEntries(entries).length) A.device.snapshot(id, createBackup(t, entries));
  }, 1500);
}
A.watchTrip = id => {
  if (watching.has(id)) return;
  watching.add(id);
  const off = () => { A.loaded[id] = true; render(); };
  A.repo.watchTrip(id, t => {
    A.trips[id] = t ? { ...t, fromNewerApp: isFromNewerApp(t) } : null;
    off();
  }, off);
  A.repo.watchEntries(id, entries => {
    A.entries[id] = entries;
    render();
    if (A.detail && !A.form && A.route.tripId === id && document.getElementById('dlg').open) openDetail(A.detail, { keepTyped: true });
    saveSnapshot(id);
  }, () => {});
};
A.watchActivity = id => {
  if (watchingActivity.has(id)) return;
  watchingActivity.add(id);
  A.repo.watchActivity(id, list => { A.activity[id] = list; if (A.route.tab === 'activity') render(); }, () => {});
};

/* ---------- Events ---------- */
actions.reload = () => location.reload();
document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-action]');
  if (el) actions[el.dataset.action]?.(el, ev);
});
document.addEventListener('input', ev => { const k = ev.target.dataset?.input; if (k) inputs[k]?.(ev.target); });
document.addEventListener('change', ev => {
  const el = ev.target, file = el.dataset?.file;
  if (file === 'receipt') attachReceipt(el.files?.[0]);
  else if (file === 'import') importFile(el.files?.[0]);
  else if (el.dataset?.change) changes[el.dataset.change]?.(el);
});
document.addEventListener('submit', ev => {
  ev.preventDefault();
  submits[ev.target.dataset.form]?.(ev.target);
});
// The close event arrives late, so a sheet opened right after another must not be closed by it.
const sheetEl = document.getElementById('dlg');
sheetEl.addEventListener('close', () => { if (!sheetEl.open && (A.form || A.detail)) closeSheet(); });
addEventListener('hashchange', () => { readHash(); render(); });

/* ---------- Start ---------- */
async function chooseBackend() {
  if (firebaseConfig && !PREVIEW) return createFirebaseBackend(firebaseConfig, await loadFirebaseSdk(FIREBASE_VERSION));
  return createLocalBackend({ hangWrites: () => storage.get('test-hang-writes', false) });
}

async function boot() {
  requestPersistentStorage();
  A.preview = PREVIEW;
  A.device = createDevice(storage);
  try {
    A.repo = createRepository(await chooseBackend());
  } catch {
    A.status = 'failed';
    render();
    return;
  }
  if (PREVIEW && !storage.get('seeded')) {
    await seedExample(A.repo, A.device, today());
    storage.trySet('seeded', true);
  }
  A.device.trips().forEach(id => A.watchTrip(id));
  readHash();
  A.status = 'ready';
  render();
  // Let the first answers arrive, then draw again. Anything slower updates the screen when it lands.
  setTimeout(render, 50);
  registerUpdates();
}

function registerUpdates() {
  if (PREVIEW || !('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const incoming = reg.installing;
      if (!navigator.serviceWorker.controller) return; // first install: nothing to update
      incoming?.addEventListener('statechange', () => {
        if (incoming.state === 'installed') document.getElementById('updateBanner').hidden = false;
      });
    });
  }).catch(() => {});
}
actions['apply-update'] = () => location.reload();

boot();
