/** Hash addresses: #t-<id>-<tab> for a screen, #join-<id> for an invite link. */
import { A, render, actions } from './state.js';
import { TRIP_ID_PATTERN } from '../core/ids.js';
import { EMPTY_FILTERS } from '../core/filters.js';

export const TABS = ['expenses', 'balances', 'insights', 'activity', 'people'];

function setHash(h, addToHistory) {
  try {
    if (location.hash === h) return;
    history[addToHistory ? 'pushState' : 'replaceState'](null, '', h || location.pathname + location.search);
  } catch { /* the address bar is optional */ }
}
export function goHome() {
  A.route = { name: 'home' };
  A.search = ''; A.filters = { ...EMPTY_FILTERS }; A.showFilters = false; A.confirm = null;
  setHash('');
  render();
  scrollTo(0, 0);
}
export function goTrip(id, tab = 'expenses') {
  // Opening a trip adds a history step, so the phone's back button returns to the list of trips.
  const fromHome = A.route.name !== 'trip';
  const sameTrip = !fromHome && A.route.tripId === id;
  A.route = { name: 'trip', tripId: id, tab };
  A.confirm = null;
  // Filters stay while you move between tabs on a trip, and reset on a different one.
  if (!sameTrip) { A.search = ''; A.filters = { ...EMPTY_FILTERS }; A.showFilters = false; }
  setHash(`#t-${id}-${tab}`, fromHome);
  A.watchActivity?.(id);
  A.watchJoined?.(id);
  render();
  scrollTo(0, 0);
}
/** Reads the address on load. An invite link adds the trip to this phone's list. */
export function readHash() {
  const h = location.hash || '';
  const join = /^#join-([a-z0-9]+)$/.exec(h);
  if (join && TRIP_ID_PATTERN.test(join[1])) {
    A.enterTrip?.(join[1]);
    goTrip(join[1]);
    return;
  }
  const m = /^#t-([a-z0-9]+)-([a-z]+)$/.exec(h);
  if (m && TRIP_ID_PATTERN.test(m[1]) && TABS.includes(m[2])) {
    A.route = { name: 'trip', tripId: m[1], tab: m[2] };
    A.enterTrip?.(m[1]);
    A.watchActivity?.(m[1]);
  } else A.route = { name: 'home' };
}
actions.home = () => goHome();
actions.tab = el => goTrip(A.route.tripId, el.dataset.tab);
