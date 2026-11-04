/** The frame around a trip's screens: title, "which one is you", and the people picker. */
import { A, actions, submits, render } from './state.js';
import { LIMITS } from '../config/app.js';
import { ICON, avatar, esc, getMe, svg, toast, val } from './dom.js';
import { money } from '../core/money.js';
import { needsRate, netBalances } from '../core/debts.js';
import { activeMembers, liveEntries } from '../core/model.js';
import { alerts } from './home.js';

export function tripHeader(trip) {
  const me = getMe(trip);
  return `<div class="topbar"><button class="icon-btn" data-action="home" aria-label="Back to all trips">${svg(ICON.back)}</button><h1 class="grow">${esc(trip.name)}</h1></div>
    ${alerts()}
    ${trip.fromNewerApp ? '<div class="notice">A friend is on a newer version of this app. Update yours to make changes. Close and reopen the app to update.</div>' : ''}
    ${me ? '' : `<section class="panel pad stack"><div><h3>Which one is you?</h3><p class="small muted">Your name is tied to your account, so only you can add expenses as that person. Names already taken aren't shown. If yours is missing, ask the trip's admin to free it.</p></div>
      <div class="chips">${activeMembers(trip).filter(m => !m.claimed).map(m => `<button class="chip" data-action="set-me" data-id="${m.id}">${avatar(trip, m.id)}${esc(m.name)}</button>`).join('')}</div>
      <form class="row" data-form="join-self"><input id="joinName" aria-label="Your name" value="${esc(A.user?.displayName || '')}" placeholder="Not listed? Enter your name" maxlength="${LIMITS.personName}" required><button class="btn">Join</button></form></section>`}`;
}

export function summaryCard(trip) {
  const me = getMe(trip);
  if (!me) return '';
  const list = liveEntries(A.entries[trip.id]);
  const v = netBalances(list, trip.currency)[me] || 0;
  const unrated = list.filter(e => needsRate(e, trip.currency)).length;
  return `<section class="hero ${v > 0 ? 'is-owed' : v < 0 ? 'is-owing' : ''}"><span class="label">${v === 0 ? 'Your balance' : v > 0 ? 'You are owed' : 'You owe'}</span>
    <div class="big">${v === 0 ? 'Settled up' : money(Math.abs(v), trip.currency)}</div>
    ${unrated ? `<p class="small">Leaves out ${unrated} expense${unrated > 1 ? 's' : ''} waiting for an exchange rate.</p>` : ''}
    ${A.pending[trip.id]?.length ? `<p class="small">Includes ${A.pending[trip.id].length} change${A.pending[trip.id].length > 1 ? 's' : ''} your friends can't see yet.</p>` : ''}</section>`;
}

actions['set-me'] = async el => {
  const tripId = A.route.tripId, memberId = el.dataset.id;
  if (navigator.onLine === false) { toast('Claiming your name needs a connection.'); return; }
  el.disabled = true;
  try {
    await A.repo.claimMember(tripId, memberId);
    A.device.setMe(tripId, memberId);
    A.device.setNeedsWelcome(tripId, true);
    render();
    toast(`You're in as ${A.trips[tripId]?.members?.[memberId]?.name || 'yourself'}`);
  } catch (e) {
    el.disabled = false;
    toast(e?.code === 'taken' ? 'Someone just took that name. Ask the trip admin if it should be yours.' : "Your name wasn't saved. Check your connection and try again.");
  }
};
submits['join-self'] = async () => {
  const trip = A.trips[A.route.tripId];
  const name = val('joinName').trim().slice(0, LIMITS.personName);
  if (!name) return;
  if (navigator.onLine === false) { toast('Joining needs a connection.'); return; }
  try {
    const { memberId } = await A.repo.joinAs(trip, name);
    A.device.setMe(trip.id, memberId);
    A.device.setNeedsWelcome(trip.id, true);
    render();
    toast(`Welcome, ${name}`);
  } catch { toast("You weren't added. Check your connection and try again."); }
};
