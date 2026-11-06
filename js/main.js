/** App entry point: picks the database, connects the screens and keeps them live. */
import { appCheckSiteKey, firebaseConfig, FIREBASE_VERSION } from './config/firebase.js';
import { createLocalStorage, requestPersistentStorage } from './data/storage.js';
import { createLocalBackend } from './data/backend-local.js';
import { createFirebaseBackend, loadFirebaseSdk } from './data/backend-firebase.js';
import { createRepository } from './data/repository.js';
import { createDevice } from './data/device.js';
import { resilient } from './data/resilient.js';
import { seedExample } from './data/example.js';
import { createBackup } from './core/backup.js';
import { isAdminId, isFromNewerApp, liveEntries } from './core/model.js';
import { A, actions, changes, inputs, render, setRender, submits } from './ui/state.js';
import { ICON, canWrite, closeSheet, svg, today } from './ui/dom.js';
import { MORE_TABS, readHash } from './ui/routes.js';
import { homeView } from './ui/home.js';
import { tripHeader } from './ui/trip.js';
import { expensesView } from './ui/expenses.js';
import { balancesView } from './ui/balances.js';
import { insightsView } from './ui/insights.js';
import { activityView } from './ui/activity.js';
import { importFile, peopleView, settingsView, unavailableView } from './ui/people.js';
import { attachReceipt } from './ui/expense-form.js';
import { signInView, verifyView } from './ui/account.js';
import { openDetail } from './ui/detail.js';
import { setUpRowMenu } from './ui/row-menu.js';
import { applyLook, setLook } from './ui/look.js';
import { keyboardFit } from './core/platform.js';
import { maybeStartTour, placeTour, setUpHelpButton } from './ui/walkthrough.js';
import { amOwner, ownerView } from './ui/owner.js';
import { setUpErrorLog } from './ui/error-log.js';
import { watchForUpdates } from './ui/updates.js';

const PREVIEW = Boolean(globalThis.__TRIP_TAB_PREVIEW__);
const storage = createLocalStorage();
const VIEWS = { expenses: expensesView, balances: balancesView, insights: insightsView, activity: activityView, people: peopleView, settings: settingsView };

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
  if (!A.user || !A.user.verified) {
    tabs.hidden = true;
    fab.innerHTML = '';
    app.innerHTML = A.user ? verifyView(A.user) : signInView();
    return;
  }
  const trip = A.route.name === 'trip' ? A.trips[A.route.tripId] : null;
  if (A.route.name !== 'trip') {
    tabs.hidden = true;
    fab.innerHTML = '';
    app.innerHTML = A.route.name === 'owner' && amOwner() ? ownerView() : homeView();
  } else if (!trip || trip.deletedAt || trip.retiredAt || A.denied[A.route.tripId]) {
    tabs.hidden = true;
    fab.innerHTML = '';
    app.innerHTML = unavailableView(A.route.tripId);
  } else {
    const tab = A.route.tab;
    const inMore = MORE_TABS.includes(tab);
    const moreNav = inMore ? `<div class="seg" role="group" aria-label="More">${[['insights', 'Insights'], ['activity', 'Activity'], ['settings', 'Settings']].map(([k, l]) => `<button data-action="tab" data-tab="${k}" aria-pressed="${tab === k}">${l}</button>`).join('')}</div>` : '';
    app.innerHTML = tripHeader(trip) + moreNav + VIEWS[tab](trip);
    tabs.hidden = false;
    const item = (k, label, icon, current) => `<button data-action="tab" data-tab="${k}" ${current ? 'aria-current="page"' : ''}>${svg(icon)}${label}</button>`;
    tabs.innerHTML = `<div class="tabs-in">
      ${item('expenses', 'Expenses', ICON.list, tab === 'expenses')}
      ${item('balances', 'Balances', ICON.scale, tab === 'balances')}
      ${canWrite(trip) ? `<button class="add-tab" data-action="add-expense" >${svg(ICON.plus)}<span>Add expense</span></button>` : '<span></span>'}
      ${item('people', 'People', ICON.people, tab === 'people')}
      <button id="moreTab" data-action="tab" data-tab="insights" ${inMore ? 'aria-current="page"' : ''}>${svg(ICON.more)}More</button>
    </div>`;
    fab.innerHTML = '';
  }
  // Point out an expense you just saved, as soon as it's on screen.
  if (A.justSaved) {
    const row = app.querySelector(`[data-action=open-entry][data-id="${A.justSaved}"]`);
    if (row) {
      row.classList.add('fresh');
      if (!A.justSavedShown) {
        A.justSavedShown = true;
        row.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        setTimeout(() => { A.justSaved = null; A.justSavedShown = false; }, 2000);
      }
    }
  }
  maybeStartTour();
  placeTour();
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
  const answered = () => { A.loaded[id] = true; render(); };
  resilient((ok, fail) => A.repo.watchMyJoin(id, joined => {
    ok();
    A.denied[id] = Boolean(joined?.removed);
    if (joined) A.device.setMe(id, joined.memberId || null);
    A.watchJoined(id);
    render();
  }, fail));
  resilient((ok, fail) => A.repo.watchTrip(id, t => {
    ok();
    A.trips[id] = t ? { ...t, fromNewerApp: isFromNewerApp(t) } : null;
    if (t && isAdminId(t, A.device.me(id))) A.watchJoined(id);
    answered();
  }, fail), answered);
  resilient((ok, fail) => A.repo.watchEntries(id, (entries, skipped, pending) => {
    ok();
    A.entries[id] = entries;
    A.skipped[id] = skipped;
    A.pending[id] = pending;
    render();
    if (A.detail && !A.form && A.route.tripId === id && document.getElementById('dlg').open) openDetail(A.detail, { keepTyped: true });
    saveSnapshot(id);
  }, fail));
};
A.watchActivity = id => {
  if (watchingActivity.has(id)) return;
  watchingActivity.add(id);
  resilient((ok, fail) => A.repo.watchActivity(id, list => { ok(); A.activity[id] = list; if (A.route.tab === 'activity') render(); }, fail));
};
const watchingJoined = new Set();
A.watchJoined = id => {
  if (watchingJoined.has(id)) return;
  const t = A.trips[id];
  if (!t || !isAdminId(t, A.device.me(id))) return; // the rules only let admins read this list
  watchingJoined.add(id);
  resilient((ok, fail) => A.repo.watchJoined(id, list => { ok(); A.joined[id] = list; if (A.route.tab === 'people') render(); }, fail));
};
/** Opens a trip from a link. A new account is recorded first, because the rules require that before reading. */
const entered = new Set();
A.enterTrip = async id => {
  A.device.addTrip(id);
  if (entered.has(id)) return;
  entered.add(id);
  try {
    // Offline, a write never finishes, so don't let it hold back a trip that's already on this phone.
    if (!A.myTrips?.includes(id)) await Promise.race([A.repo.recordJoin(id, A.user), new Promise(r => setTimeout(r, 4000))]);
  } catch { /* offline: the cached copy can still open */ }
  A.watchTrip(id);
  A.watchActivity(id);
  render();
};

/* ---------- Events ---------- */
actions.reload = () => location.reload();
actions['set-look'] = el => {
  setLook(el.dataset.id);
  document.querySelectorAll('[data-action="set-look"]').forEach(b => b.setAttribute('aria-pressed', String(b === el)));
};
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
addEventListener('online', () => render());
addEventListener('offline', () => render());
addEventListener('hashchange', () => { readHash(); render(); });

applyLook();
setUpRowMenu();
setUpHelpButton();
setUpKeyboardFit();
setUpClickOutside();
setUpErrorLog();

/* ---------- Start ---------- */
/** The real Firebase code against the local emulators. Only the browser tests reach this. */
async function createEmulatorBackend() {
  const sdk = await loadFirebaseSdk(FIREBASE_VERSION);
  return createFirebaseBackend({ projectId: 'demo-trip-tab', apiKey: 'test', authDomain: 'localhost' }, {
    ...sdk,
    initializeFirestore(app, options) {
      const db = sdk.initializeFirestore(app, options);
      sdk.connectFirestoreEmulator(db, '127.0.0.1', 8181);
      return db;
    },
    getAuth(app) {
      const auth = sdk.getAuth(app);
      if (!auth.emulatorConfig) sdk.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      return auth;
    },
  });
}

async function chooseBackend() {
  const onTestServer = ['localhost', '127.0.0.1'].includes(location.hostname) || location.protocol === 'file:';
  if (onTestServer && storage.get('test-emulator')) return createEmulatorBackend();
  if (firebaseConfig && !PREVIEW && !onTestServer) return createFirebaseBackend(firebaseConfig, await loadFirebaseSdk(FIREBASE_VERSION, { appCheck: Boolean(appCheckSiteKey) }), { appCheckSiteKey });
  return createLocalBackend({ hangWrites: () => storage.get('test-hang-writes', false) });
}

/** Starts live data once, the first time a verified account is present. */
let started = false;
async function startApp() {
  if (started) return;
  started = true;
  // Trips follow the account: this list is what makes them appear on a new device.
  A.repo.watchMyTrips(ids => {
    A.myTrips = ids;
    ids.forEach(id => { A.device.addTrip(id); entered.add(id); A.watchTrip(id); });
    render();
  }, () => {});
  A.device.trips().forEach(id => A.watchTrip(id));
  readHash();
  render();
  setTimeout(render, 50);
}

async function boot() {
  requestPersistentStorage();
  A.preview = PREVIEW;
  A.device = createDevice(storage);
  let backend;
  try {
    backend = await chooseBackend();
    A.repo = createRepository(backend);
  } catch {
    A.status = 'failed';
    render();
    return;
  }
  A.repo.auth = backend.auth;
  if (PREVIEW && !storage.get('seeded')) {
    // The preview opens signed in as the example's first person. Sign out to see the sign-in screens.
    const user = await backend.auth.signUp('Ana', 'ana@example.com', 'preview-only');
    await backend.auth.simulateVerify();
    await seedExample(A.repo, A.device, today(), user);
    storage.trySet('seeded', true);
  }
  // Firebase doesn't announce a newly verified email, so the sign-in screens report it through here too.
  A.onUser = user => {
    const wasVerified = A.user?.verified;
    A.user = user;
    A.status = 'ready';
    if (user?.verified) startApp();
    if (!wasVerified || !user?.verified) render();
  };
  backend.auth.onChange(A.onUser);
  // Coming back from the email app counts as checking the link.
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible' || !A.user || A.user.verified) return;
    try { A.onUser(await backend.auth.refresh()); } catch { /* they can still tap the button */ }
  });
  registerUpdates();
}

/** Clicking outside whatever is open closes it, unless that would lose something typed. */
function setUpClickOutside() {
  const d = document.getElementById('dlg');
  d.addEventListener('click', ev => {
    if (ev.target !== d) return;
    const r = d.getBoundingClientRect();
    if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) return;
    if (A.form) { actions['form-cancel'](); return; } // keeps a draft
    const typed = [...d.querySelectorAll('input,textarea')].some(el => el.value !== el.defaultValue);
    if (!typed) closeSheet();
  });
  document.addEventListener('click', ev => {
    if (!A.showFilters || d.open || !ev.target.isConnected) return; // a click that re-rendered its own button stays open
    if (ev.target.closest('.filters,.filter-tags,#search,[data-action="filters-toggle"],#toast,nav.tabs,.tap')) return;
    A.showFilters = false;
    render();
  });
}

function registerUpdates() {
  if (PREVIEW || !('serviceWorker' in navigator) || location.protocol === 'file:') return;
  watchForUpdates({ sw: navigator.serviceWorker, doc: document, win: window, onUpdate: () => { document.getElementById('updateBanner').hidden = false; } });
}
actions['apply-update'] = () => location.reload();

boot();

/** Keeps a sheet's save button above the on-screen keyboard, and what's being typed in view. */
function setUpKeyboardFit() {
  const view = window.visualViewport;
  if (!view) return;
  const fit = () => {
    const size = keyboardFit(view.height, view.offsetTop, innerHeight), root = document.documentElement.style;
    if (!size) { root.removeProperty('--kb-height'); root.removeProperty('--kb-top'); return; }
    root.setProperty('--kb-height', `${size.height}px`);
    root.setProperty('--kb-top', `${size.top}px`);
    document.activeElement?.closest?.('dialog') && document.activeElement.scrollIntoView({ block: 'nearest' });
  };
  view.addEventListener('resize', fit);
  view.addEventListener('scroll', fit);
}
