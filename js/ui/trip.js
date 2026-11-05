/** The frame around a trip's screens: title, "which one is you", and the people picker. */
import { A, actions, submits, render } from './state.js';
import { LIMITS } from '../config/app.js';
import { ICON, avatar, canWrite, esc, getMe, svg, toast, val } from './dom.js';
import { money } from '../core/money.js';
import { myPayments, needsRate } from '../core/debts.js';
import { activeMembers, liveEntries, memberName } from '../core/model.js';
import { alerts } from './home.js';
import { joinSteps } from './account.js';
import { helpButton } from './walkthrough.js';

export function tripHeader(trip) {
  const me = getMe(trip);
  return `<div class="topbar"><button class="icon-btn" data-action="back" aria-label="Back">${svg(ICON.back)}</button><button class="icon-btn" data-action="home" aria-label="All trips">${svg(ICON.home)}</button><h1 class="grow" title="${esc(trip.name)}">${esc(trip.name)}</h1>${helpButton()}${getMe(trip) ? `<button class="ava-btn" data-action="edit-avatar" data-id="${getMe(trip)}" aria-label="Your settings" data-tip="Your settings">${avatar(trip, getMe(trip))}<span class="ava-caret" aria-hidden="true"></span></button>` : ''}</div>
    ${alerts()}
    ${trip.fromNewerApp ? '<div class="notice">A friend is on a newer version of this app. Update yours to make changes. Close and reopen the app to update.</div>' : ''}
    ${me ? '' : `<section class="panel pad stack">${joinSteps(3)}<div><h3>Which one is you?</h3><p class="small muted">Your name is tied to your account, so only you can add expenses as that person. Names already taken aren't shown. If yours is missing, ask the trip's admin to free it.</p></div>
      <div class="chips">${activeMembers(trip).filter(m => !m.claimed).map(m => `<button class="chip" data-action="set-me" data-id="${m.id}">${avatar(trip, m.id)}${esc(m.name)}</button>`).join('')}</div>
      <form class="row" data-form="join-self"><input id="joinName" aria-label="Your name" value="${esc(A.user?.displayName || '')}" placeholder="Not listed? Enter your name" maxlength="${LIMITS.personName}" required><button class="btn">Join</button></form></section>`}`;
}

/** Answers "what do I do, and how much?" before anything else. */
export function summaryCard(trip) {
  const me = getMe(trip);
  if (!me) return '';
  const c = trip.currency, list = liveEntries(A.entries[trip.id]);
  const { pays, gets } = myPayments(list, c, me, trip.simplify !== false);
  const unrated = list.filter(e => needsRate(e, c)).length, waiting = A.pending[trip.id]?.length;
  const sum = rows => rows.reduce((s, d) => s + d.amount, 0);
  const write = canWrite(trip);
  const payButton = d => (write ? `<button class="hero-btn" data-action="settle" data-from="${d.from}" data-to="${d.to}" data-amt="${d.amount}">Pay ${esc(memberName(trip, d.to))}</button>` : '');
  const name = id => esc(memberName(trip, id));
  let main;
  if (pays.length === 1 && !gets.length) {
    main = `<div class="hero-say">You owe ${name(pays[0].to)}</div><div class="hero-row"><div class="big">${money(pays[0].amount, c)}</div>${payButton(pays[0])}</div>`;
  } else if (pays.length) {
    main = `<div class="hero-say">You owe</div><div class="big">${money(sum(pays), c)}</div>
      ${pays.map(d => `<div class="hero-line"><span class="wrap-any">${name(d.to)}</span><span class="amt">${money(d.amount, c)}</span>${payButton(d)}</div>`).join('')}`;
  }
  const receive = gets.length ? `<div class="hero-say">You get</div><div class="big">${money(sum(gets), c)}</div>
    ${gets.map(d => `<div class="hero-line"><span class="wrap-any">${name(d.from)} pays you</span><span class="amt">${money(d.amount, c)}</span></div>`).join('')}` : '';
  const settled = !pays.length && !gets.length ? (list.length ? `<div class="hero-settled">${svg(ICON.check)}You're all settled</div>` : `<div class="hero-settled">Nothing yet</div>`) : '';
  const tone = pays.length ? 'is-owing' : gets.length ? 'is-owed' : '';
  return `<section class="hero ${tone}">${main || ''}${receive}${settled}
    ${unrated ? `<p class="small">Leaves out ${unrated} expense${unrated > 1 ? 's' : ''} waiting for an exchange rate.</p>` : ''}
    ${waiting ? `<p class="small">Includes ${waiting} change${waiting > 1 ? 's' : ''} your friends can't see yet.</p>` : ''}</section>`;
}

actions['set-me'] = async el => {
  const tripId = A.route.tripId, memberId = el.dataset.id;
  if (navigator.onLine === false) { toast('Claiming your name needs a connection.'); return; }
  el.disabled = true;
  try {
    await A.repo.claimMember(tripId, memberId);
    A.device.setMe(tripId, memberId);
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
    render();
    toast(`Welcome, ${name}`);
  } catch { toast("You weren't added. Check your connection and try again."); }
};
