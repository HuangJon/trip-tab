/** The app owner's view of every trip. It loads only when opened, so it doesn't use up the free limits. */
import { A, actions, render } from './state.js';
import { ownerUid } from '../config/firebase.js';
import { esc, openSheet, sheetHead } from './dom.js';
import { money } from '../core/money.js';
import { handlersOf, memberName, sharesOf } from '../core/model.js';
import { isOwnerAccount, peopleAcrossTrips } from '../core/owner.js';
import { goHome } from './routes.js';

const when = ms => (ms ? new Date(ms).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' }) : 'Unknown');
const shown = (minor, currency) => { try { return money(minor, currency); } catch { return `${minor} ${currency}`; } };

export const amOwner = () => isOwnerAccount(A.user, { ownerUid, simulated: A.repo?.auth?.simulated, preview: A.preview });

async function load() {
  A.owner = { ...(A.owner || { tab: 'trips' }), loading: true, failed: false };
  render();
  try {
    const [trips, errors] = await Promise.all([A.repo.ownerTrips(), A.repo.ownerErrors()]);
    A.owner = { ...A.owner, loading: false, loaded: true, trips, errors };
  } catch (e) {
    console.warn('Owner page', e?.code);
    A.owner = { ...A.owner, loading: false, loaded: true, failed: true };
  }
  render();
}

const tripTag = t => (t.deletedAt ? ' <span class="tag">Deleted</span>' : t.retiredAt ? ' <span class="tag">Old link</span>' : '');
const tripRow = t => {
  const people = Object.values(t.members || {}).filter(m => !m.removed).length, joined = (t.joined || []).filter(j => !j.removed).length;
  return `<button class="tap" data-action="owner-trip" data-id="${esc(t.id)}"><span class="grow"><strong class="block wrap-any">${esc(t.name)}${tripTag(t)}</strong>
    <span class="small muted">${people} names · ${joined} joined · ${t.entryCount} ${t.entryCount === 1 ? 'entry' : 'entries'}</span>
    <span class="tiny muted block wrap-any">Created ${when(t.createdAt)} · Last activity ${when(t.lastActivity?.at)}</span>
    ${t.lastActivity?.text ? `<span class="tiny muted block wrap-any">${esc(t.lastActivity.text)}</span>` : ''}</span></button>`;
};
const personRow = p => `<div class="stack tight owner-row"><strong class="small wrap-any">${esc(p.name || p.email)}</strong><span class="tiny muted wrap-any">${esc(p.email)} · first joined ${when(p.first)}</span>
  <span class="tiny muted wrap-any">${p.trips.map(t => `${esc(t.name)}${t.memberName ? ` as ${esc(t.memberName)}` : ' (no name yet)'}${t.removed ? ' (removed)' : ''}`).join(', ')}</span></div>`;
const errorRow = e => `<div class="stack tight owner-row"><strong class="small wrap-any">${esc(e.message)}</strong><span class="tiny muted wrap-any">${when(e.at)} · ${esc(e.kind)} · ${esc(e.email || e.uid)}${e.where ? ` · ${esc(e.where)}` : ''}</span>
  ${e.tripId ? `<span class="tiny muted wrap-any">Trip ${esc(e.tripId)}</span>` : ''}<span class="tiny muted wrap-any">${esc(e.agent)}</span></div>`;

export function ownerView() {
  if (!A.owner?.loaded && !A.owner?.loading) queueMicrotask(load);
  const o = A.owner || { tab: 'trips', loading: true };
  const trips = o.trips || [], errors = o.errors || [], people = peopleAcrossTrips(trips);
  const entries = trips.reduce((sum, t) => sum + (t.entryCount || 0), 0);
  const seg = [['trips', `Trips (${trips.length})`], ['people', `People (${people.length})`], ['errors', `Problems (${errors.length})`]]
    .map(([k, l]) => `<button data-action="owner-tab" data-id="${k}" aria-pressed="${o.tab === k}">${l}</button>`).join('');
  const body = o.failed ? '<section class="panel empty"><h2>This didn\'t load</h2><p class="muted">Check your connection. If it keeps happening, the database rules may not be published yet.</p></section>'
    : o.loading && !o.loaded ? '<section class="panel empty"><h2>Loading everything</h2><p class="muted">One moment.</p></section>'
    : o.tab === 'people' ? `<section class="panel pad stack" id="ownerPeople">${people.map(personRow).join('') || '<p class="muted">Nobody yet.</p>'}<p class="tiny muted">Comes from who has opened a trip. Someone who signed up and never opened one is only in the Firebase console.</p></section>`
    : o.tab === 'errors' ? `<section class="panel pad stack" id="ownerErrors">${errors.map(errorRow).join('') || '<p class="muted">No problems reported.</p>'}<p class="tiny muted">The latest 100, newest first. Only people on a version with this reporting can send these.</p></section>`
    : `<section class="panel" id="ownerTrips"><div class="list">${trips.map(tripRow).join('') || '<p class="pad muted">No trips yet.</p>'}</div></section>`;
  return `<div class="topbar"><button class="icon-btn" data-action="home" aria-label="Back to all trips">‹</button><h1 class="grow">Owner page</h1><button class="btn small" data-action="owner-refresh">Refresh</button></div>
    <p class="small muted">${trips.length} trips · ${people.length} people · ${entries} entries · ${errors.length} problems. Only your account can see this.</p>
    <div class="seg" role="group" aria-label="Owner page">${seg}</div>${body}`;
}

function entryRow(t, e) {
  const names = ids => Object.keys(ids || {}).map(id => esc(memberName(t, id))).join(', ') || 'Nobody';
  const comments = Object.values(e.comments || {}).sort((a, b) => a.at - b.at);
  return `<div class="stack tight owner-row"><div class="row between"><strong class="small wrap-any">${esc(e.kind === 'payment' ? 'Settlement' : e.desc)}${e.deleted ? ' <span class="tag">Deleted</span>' : ''}</strong><span class="amt small">${esc(shown(e.total, e.currency))}</span></div>
    <span class="tiny muted wrap-any">${esc(e.date)} · ${esc(e.kind)} · ${esc(e.category)} · paid by ${names(handlersOf(e))} · split among ${names(sharesOf(e))}</span>
    ${e.note ? `<span class="tiny wrap-any">${esc(e.note)}</span>` : ''}
    ${comments.map(c => `<span class="tiny wrap-any">${esc(c.by)}: ${esc(c.text)}</span>`).join('')}
    ${e.receipt ? `<div id="ownerReceipt-${esc(e.id)}"><button class="link small" data-action="owner-receipt" data-id="${esc(e.id)}">Show receipt</button></div>` : ''}</div>`;
}

actions['owner-open'] = () => goOwner();
actions['owner-tab'] = el => { A.owner.tab = el.dataset.id; render(); };
actions['owner-refresh'] = () => { load(); };
actions['owner-trip'] = async el => {
  const t = A.owner.trips.find(x => x.id === el.dataset.id);
  if (!t) return;
  const paint = html => { const slot = document.getElementById('ownerDetail'); if (slot) slot.innerHTML = html; };
  A.owner.open = t;
  openSheet(`<div class="sheet">${sheetHead(t.name, '', 'Done')}<div class="sheet-body stack" id="ownerDetail"><p class="muted">Loading.</p></div></div>`);
  try {
    const { entries, activity } = await A.repo.ownerTrip(t.id);
    A.owner.openEntries = entries;
    const sorted = entries.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    paint(`<p class="tiny muted wrap-any">Currency ${esc(t.currency)} · Trip ${esc(t.id)}</p>
      <h2>Names</h2><p class="small wrap-any">${Object.values(t.members || {}).map(m => `${esc(m.name)}${m.removed ? ' (removed)' : m.claimed ? '' : ' (not claimed)'}`).join(', ')}</p>
      <h2>Joined</h2>${(t.joined || []).map(j => `<p class="small wrap-any">${esc(j.displayName || j.email)} · ${esc(j.email)} · ${when(j.at)}${j.removed ? ' · removed' : ''}</p>`).join('') || '<p class="small muted">Nobody.</p>'}
      <h2>Expenses</h2>${sorted.map(e => entryRow(t, e)).join('') || '<p class="small muted">None yet.</p>'}
      <h2>Activity</h2>${activity.map(a => `<p class="tiny wrap-any"><span class="muted">${when(a.at)}</span> ${esc(a.text)}</p>`).join('') || '<p class="small muted">None yet.</p>'}`);
  } catch { paint("<p class=\"muted\">This trip didn't load. Check your connection and try again.</p>"); }
};
actions['owner-receipt'] = async el => {
  const e = A.owner.openEntries?.find(x => x.id === el.dataset.id), slot = document.getElementById(`ownerReceipt-${el.dataset.id}`);
  if (!e || !slot) return;
  try {
    const r = await A.repo.getReceipt(A.owner.open.id, e.receipt);
    if (r?.dataUrl?.startsWith('data:image/jpeg;base64,')) slot.innerHTML = `<img class="receipt" src="${esc(r.dataUrl)}" alt="Receipt">`;
    else slot.textContent = "This receipt photo hasn't finished uploading.";
  } catch { slot.textContent = "The receipt didn't load."; }
};

export function goOwner() {
  if (!amOwner()) { goHome(); return; }
  A.route = { name: 'owner' };
  A.owner = null;
  try { history.pushState(null, '', '#owner'); } catch { /* the address bar is optional */ }
  render();
  scrollTo(0, 0);
}
