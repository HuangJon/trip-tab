/** The screen's shared state and the services every screen uses, filled in by main.js. */
export const A = {
  repo: null, device: null, preview: false,
  status: 'loading',        // loading | ready | failed
  trips: {},                // id -> trip, or null when the link doesn't lead to a trip
  loaded: {},               // id -> true once the first answer has arrived
  entries: {},              // tripId -> {entryId: entry}
  activity: {},             // tripId -> [items]
  route: { name: 'home' },
  search: '', filterCat: '', confirm: null,
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
