/** The frame around a trip's screens: title, "which one is you", and the people picker. */
import { A, actions, submits, render } from './state.js';
import { LIMITS } from '../config/app.js';
import { ICON, avatar, esc, getMe, send, svg, toast, val } from './dom.js';
import { money } from '../core/money.js';
import { netBalances } from '../core/debts.js';
import { activeMembers, liveEntries } from '../core/model.js';
import { alerts } from './home.js';

export function tripHeader(trip) {
  const me = getMe(trip);
  return `<div class="topbar"><button class="icon-btn" data-action="home" aria-label="Back to all trips">${svg(ICON.back)}</button><h1 class="grow">${esc(trip.name)}</h1></div>
    ${alerts()}
    ${trip.fromNewerApp ? '<div class="notice">A friend is on a newer version of this app. Update yours to make changes. Close and reopen the app to update.</div>' : ''}
    ${me ? '' : `<section class="panel pad stack"><div><h3>Which one is you?</h3><p class="small muted">Expenses you add are credited to this name, and balances show from your side.</p></div>
      <div class="chips">${activeMembers(trip).map(m => `<button class="chip" data-action="set-me" data-id="${m.id}">${avatar(trip, m.id)}${esc(m.name)}</button>`).join('')}</div>
      <form class="row" data-form="join-self"><input id="joinName" aria-label="Your name" placeholder="Not listed? Enter your name" maxlength="${LIMITS.personName}" required><button class="btn">Join</button></form></section>`}`;
}

export function summaryCard(trip) {
  const me = getMe(trip);
  if (!me) return '';
  const v = netBalances(liveEntries(A.entries[trip.id]), trip.currency)[me] || 0;
  return `<section class="panel summary"><span class="label">${v === 0 ? 'Your balance' : v > 0 ? 'You are owed' : 'You owe'}</span>
    <div class="big ${v > 0 ? 'owed' : v < 0 ? 'owe' : ''}">${v === 0 ? 'Settled up' : money(Math.abs(v), trip.currency)}</div>
    ${A.pending[trip.id]?.length ? `<p class="small muted">Includes ${A.pending[trip.id].length} change${A.pending[trip.id].length > 1 ? 's' : ''} your friends can't see yet.</p>` : ''}</section>`;
}

actions['set-me'] = el => { A.device.setMe(A.route.tripId, el.dataset.id); render(); };
submits['join-self'] = () => {
  const trip = A.trips[A.route.tripId];
  const name = val('joinName').trim().slice(0, LIMITS.personName);
  if (!name) return;
  const { id, written } = A.repo.addMember(trip, name, name);
  A.device.setMe(trip.id, id);
  send(written);
  render();
  toast(`Welcome, ${name}`);
};
