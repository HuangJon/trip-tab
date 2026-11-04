/** The main list: every expense and settlement, newest first. */
import { A, actions, inputs, render } from './state.js';
import { CATEGORIES } from '../config/app.js';
import { ICON, catIcon, esc, fmtDate, getMe, svg, who } from './dom.js';
import { money } from '../core/money.js';
import { inBase, needsRate } from '../core/debts.js';
import { byNewest, handlersOf, liveEntries, memberName, sharesOf } from '../core/model.js';
import { summaryCard } from './trip.js';
import { goTrip } from './routes.js';

function line(trip, e) {
  const me = getMe(trip);
  const commentCount = Object.keys(e.comments || {}).length;
  if (e.kind === 'payment') {
    const from = Object.keys(e.paid)[0], to = Object.keys(e.owed)[0];
    return `<button class="tap" data-action="open-entry" data-id="${e.id}"><span class="tile pay">${svg(ICON.swap)}</span>
      <span class="grow"><strong class="block">${esc(who(trip, from))} paid ${esc(who(trip, to))}${waiting(trip, e)}</strong><span class="small muted block">Settlement${e.createdById ? ` · recorded by ${esc(who(trip, e.createdById))}` : ''}${e.note ? ` · ${esc(e.note)}` : ''}</span></span>
      <span class="right amt owed">${money(e.total, e.currency)}</span></button>`;
  }
  const refund = e.kind === 'refund';
  const handlers = Object.keys(handlersOf(e));
  const payer = handlers.length > 1 ? `${handlers.length} people` : who(trip, handlers[0]);
  const missing = needsRate(e, trip.currency);
  const b = missing ? { paid: {}, owed: {} } : inBase(e, trip.currency);
  let side = '';
  if (missing) side = '<span class="tag warn">Needs rate</span>';
  else if (me) {
    const lent = (b.paid[me] || 0) - (b.owed[me] || 0);
    if (lent > 0) side = `<div class="tiny muted">${refund ? 'you get back' : 'you lent'}</div><div class="amt owed">${money(lent, trip.currency)}</div>`;
    else if (lent < 0) side = `<div class="tiny muted">you owe</div><div class="amt owe">${money(-lent, trip.currency)}</div>`;
    else side = `<div class="tiny muted">${b.owed[me] ? 'you paid your share' : 'not involved'}</div>`;
  }
  return `<button class="tap" data-action="open-entry" data-id="${e.id}"><span class="tile ${refund ? 'pay' : `cat-${esc(e.category)}`}">${refund ? svg(ICON.swap) : catIcon(e.category)}</span>
    <span class="grow"><strong class="block wrap-any">${esc(e.desc)}${refund ? ' <span class="tag good">Refund</span>' : ''}${waiting(trip, e)}</strong><span class="small muted">${esc(payer)} ${refund ? 'received' : 'paid'} ${money(e.total, e.currency)}${e.receipt ? ' · receipt' : ''}${commentCount ? ` · ${commentCount} comment${commentCount > 1 ? 's' : ''}` : ''}</span>
    <span class="tiny muted credit">${creditLine(trip, e)}</span></span>
    <span class="right">${side}</span></button>`;
}

/** Everyone sees who added an expense and who shares it, right in the list. */
function creditLine(trip, e) {
  const names = Object.keys(sharesOf(e)).map(i => (i === getMe(trip) ? 'you' : memberName(trip, i)));
  const adder = e.createdById ? who(trip, e.createdById) : e.updatedBy;
  return `${adder ? `Added by ${esc(adder)} · ` : ''}Split among ${esc(names.join(', '))}`;
}
const waiting = (trip, e) => (A.pending[trip.id]?.includes(e.id) ? ' <span class="tag">Waiting to sync</span>' : '');

function matches(trip) {
  const q = A.search.trim().toLowerCase();
  return liveEntries(A.entries[trip.id]).filter(e => {
    if (A.filterCat && (e.kind === 'payment' || e.category !== A.filterCat)) return false;
    if (!q) return true;
    const people = [...Object.keys(e.paid), ...Object.keys(e.owed)].map(i => memberName(trip, i)).join(' ');
    return `${e.desc || ''} ${e.note || ''} ${people}`.toLowerCase().includes(q);
  }).sort(byNewest);
}

function listHtml(trip) {
  const list = matches(trip);
  if (!list.length) {
    const none = !liveEntries(A.entries[trip.id]).length;
    return `<section class="panel empty"><h2>${none ? 'Nothing on the tab yet' : 'No matches'}</h2><p class="muted">${none ? 'Add the first expense when someone pays for something, or invite your friends first.' : 'Try another word or clear the category.'}</p>${none ? '<button class="btn" data-action="invite-first">Invite friends</button>' : ''}</section>`;
  }
  const days = new Map();
  for (const e of list) { if (!days.has(e.date)) days.set(e.date, []); days.get(e.date).push(e); }
  return [...days].map(([d, es]) => `<div class="label date-head">${fmtDate(d)}</div><section class="panel"><div class="list">${es.map(e => line(trip, e)).join('')}</div></section>`).join('');
}

export function expensesView(trip) {
  const all = liveEntries(A.entries[trip.id]);
  const cats = [...new Set(all.filter(e => e.kind !== 'payment').map(e => e.category))];
  const damaged = A.skipped[trip.id] || 0;
  return `${A.device.linkUnsaved(trip.id) ? `<section class="notice stack"><span>Keep this trip's link somewhere safe, such as your group chat. If your phone clears this app's storage, the link is how you get back in.</span><button class="btn small" data-action="copy-link">Copy link</button></section>` : ''}
    ${damaged ? `<div class="notice">${damaged} ${damaged > 1 ? 'entries' : 'entry'} couldn't be read and ${damaged > 1 ? 'are' : 'is'} left out of the balances. Update the app, or ask whoever added ${damaged > 1 ? 'them' : 'it'} to add ${damaged > 1 ? 'them' : 'it'} again.</div>` : ''}
    ${summaryCard(trip)}
    ${all.length ? `<div class="stack"><input id="search" type="search" placeholder="Search expenses or people" aria-label="Search expenses" value="${esc(A.search)}" data-input="search">
    ${cats.length > 1 ? `<div class="chips"><button class="chip" data-action="filter-cat" data-id="" aria-pressed="${!A.filterCat}">All</button>${cats.map(c => `<button class="chip" data-action="filter-cat" data-id="${esc(c)}" aria-pressed="${A.filterCat === c}">${esc(CATEGORIES[c] || 'Other')}</button>`).join('')}</div>` : ''}</div>` : ''}
    <div class="stack entries" id="entryList">${listHtml(trip)}</div>`;
}

actions['invite-first'] = () => goTrip(A.route.tripId, 'people');
actions['filter-cat'] = el => { A.filterCat = el.dataset.id; render(); };
inputs.search = el => {
  A.search = el.value;
  const list = document.getElementById('entryList');
  if (list) list.innerHTML = listHtml(A.trips[A.route.tripId]);
};
