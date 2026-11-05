/**
 * Offline support. Keeps a copy of the app's files on the phone. Trip data is not here: the database
 * keeps its own offline copy. Network first, so updates arrive; saved copy when offline.
 * When you add a file under css/ or js/, add it to APP_FILES (a unit test checks this).
 */
const CACHE = 'triptab-v43';
const APP_FILES = [
  './', './index.html', './manifest.webmanifest',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
  './css/tokens.css', './css/base.css', './css/screens.css', './css/theme.css',
  './js/main.js',
  './js/config/app.js', './js/config/firebase.js',
  './js/core/backup.js', './js/core/categorize.js', './js/core/debts.js', './js/core/filters.js', './js/core/ids.js', './js/core/model.js', './js/core/money.js', './js/core/platform.js', './js/core/rates.js', './js/core/messages.js', './js/core/settle.js', './js/core/split.js',
  './js/data/backend-firebase.js', './js/data/backend-local.js', './js/data/device.js', './js/data/example.js', './js/data/repository.js', './js/data/resilient.js', './js/data/storage.js',
  './js/ui/account.js', './js/ui/activity.js', './js/ui/balances.js', './js/ui/detail.js', './js/ui/dom.js', './js/ui/expense-form.js', './js/ui/expenses.js', './js/ui/home.js', './js/ui/insights.js', './js/ui/people.js', './js/ui/receipt.js', './js/ui/avatars.js', './js/ui/look.js', './js/ui/routes.js', './js/ui/updates.js', './js/ui/row-menu.js', './js/ui/state.js', './js/ui/trip.js',
];
/** The database code and fonts come from Google and have to work offline too. */
const isCdn = url => (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/'))
  || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  const mine = url.origin === self.location.origin;
  if (request.method !== 'GET' || !(mine || isCdn(url))) return; // never touches live database traffic
  const saved = () => caches.match(request, { ignoreSearch: mine }).then(hit => hit || (mine ? caches.match('./index.html') : Response.error()));
  event.respondWith(
    fetch(request)
      .then(response => {
        if (!response.ok && response.type !== 'opaque') return saved().then(hit => hit || response);
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy));
        return response;
      })
      .catch(saved),
  );
});
