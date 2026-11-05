import { EMPTY_FILTERS } from '../core/filters.js';

/** The screen's shared state and the services every screen uses, filled in by main.js. */
export const A = {
  repo: null, device: null, preview: false,
  status: 'loading',        // loading | ready | failed
  trips: {},                // id -> trip, or null when the link doesn't lead to a trip
  loaded: {},               // id -> true once the first answer has arrived
  entries: {},              // tripId -> {entryId: entry}
  joined: {},               // tripId -> everyone who has opened the trip (admins only)
  denied: {},               // tripId -> true when an admin removed this account
  user: null,
  pending: {},              // tripId -> entry ids still waiting to sync
  skipped: {},              // tripId -> entries too damaged to show
  activity: {},             // tripId -> [items]
  route: { name: 'home' },
  search: '', filters: { ...EMPTY_FILTERS }, showFilters: false, peopleTab: 'people', confirm: null,
  form: null, detail: null, undo: null,
};
let renderFn = () => {};
export const setRender = fn => { renderFn = fn; };
export const render = () => renderFn();

/** Handlers for data-action buttons, registered by each screen. */
export const actions = {};
export const inputs = {};
export const changes = {};
export const submits = {};
