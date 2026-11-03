/** The main list: every expense and settlement, newest first. */
import { A, actions, inputs, render } from './state.js';
import { CATEGORIES } from '../config/app.js';
import { ICON, catIcon, esc, fmtDate, getMe, svg, who } from './dom.js';
import { money } from '../core/money.js';
import { inBase } from '../core/debts.js';
import { byNewest, liveEntries, memberName } from '../core/model.js';
import { summaryCard } from './trip.js';

function line(trip, e) {
  const me = getMe(trip);
  const commentCount = Object.keys(e.comments || {}).length;
  if (e.kind === 'payment') {
    const from = Object.keys(e.paid)[0], to = Object.keys(e.owed)[0];
    return `<button class="tap" data-action="open-entry" data-id="${e.id}"><span class="tile pay">${svg(ICON.swap)}</span>
      <span class="grow"><strong class="block">${esc(who(trip, from))} paid ${esc(who(trip, to))}</strong><span class="small muted block">Settlement${e.note ? ` · ${esc(e.note)}` : ''}</span></span>
      <span class="right amt owed">${money(e.total, e.currency)}</span></button>`;
  }
  const payers = Object.keys(e.paid);
  const payer = payers.length > 1 ? `${payers.length} people` : who(trip, payers[0]);
  const b = inBase(e, trip.currency);
  let side = '';
  if (me) {
    const lent = (b.paid[me] || 0) - (b.owed[me] || 0);
    if (lent > 0) side = `<div class="tiny muted">you lent</div><div class="amt owed">${money(lent, trip.currency)}</div>`;
    else if (lent < 0) side = `<div class="tiny muted">you owe</div><div class="amt owe">${money(-lent, trip.currency)}</div>`;
    else side = `<div class="tiny muted">${b.owed[me] ? 'you paid your share' : 'not involved'}</div>`;
  }
  return `<button class="tap" data-action="open-entry" data-id="${e.id}"><span class="tile">${catIcon(e.category)}</span>
    <span class="grow"><strong class="block wrap-any">${esc(e.desc)}</strong><span class="small muted">${esc(payer)} paid ${money(e.total, e.currency)}${e.receipt ? ' · receipt' : ''}${commentCount ? ` · ${commentCount} comment${commentCount > 1 ? 's' : ''}` : ''}</span></span>
    <span class="right">${side}</span></button>`;
}

function matches(trip) {
  const q = A.search.trim().toLowerCase();
  return liveEntries(A.entries[trip.id]).filter(e => {
    if (A.filterCat && (e.kind !== 'expense' || e.category !== A.filterCat)) return false;
    if (!q) return true;
    const people = [...Object.keys(e.paid), ...Object.keys(e.owed)].map(i => memberName(trip, i)).join(' ');
    return `${e.desc || ''} ${e.note || ''} ${people}`.toLowerCase().includes(q);
  }).sort(byNewest);
}

function listHtml(trip) {
  const list = matches(trip);
  if (!list.length) {
    const none = !liveEntries(A.entries[trip.id]).length;
    return `<section class="panel empty"><h2>${none ? 'Nothing on the tab yet' : 'No matches'}</h2><p class="muted">${none ? 'Add the first expense when someone pays for something.' : 'Try another word or clear the category.'}</p></section>`;
  }
  const days = new Map();
  for (const e of list) { if (!days.has(e.date)) days.set(e.date, []); days.get(e.date).push(e); }
  return [...days].map(([d, es]) => `<div class="label date-head">${fmtDate(d)}</div><section class="panel"><div class="list">${es.map(e => line(trip, e)).join('')}</div></section>`).join('');
}

export function expensesView(trip) {
  const all = liveEntries(A.entries[trip.id]);
  const cats = [...new Set(all.filter(e => e.kind === 'expense').map(e => e.category))];
  const damaged = A.skipped[trip.id] || 0;
  return `${A.device.linkUnsaved(trip.id) ? `<section class="notice stack"><span>Keep this trip's link somewhere safe, such as your group chat. If your phone clears this app's storage, the link is how you get back in.</span><button class="btn small" data-action="copy-link">Copy link</button></section>` : ''}
    ${damaged ? `<div class="notice">${damaged} ${damaged > 1 ? 'entries' : 'entry'} couldn't be read and ${damaged > 1 ? 'are' : 'is'} left out of the balances. Update the app, or ask whoever added ${damaged > 1 ? 'them' : 'it'} to add ${damaged > 1 ? 'them' : 'it'} again.</div>` : ''}
    ${summaryCard(trip)}
    ${all.length ? `<div class="stack"><input id="search" type="search" placeholder="Search expenses or people" aria-label="Search expenses" value="${esc(A.search)}" data-input="search">
    ${cats.length > 1 ? `<div class="chips"><button class="chip" data-action="filter-cat" data-id="" aria-pressed="${!A.filterCat}">All</button>${cats.map(c => `<button class="chip" data-action="filter-cat" data-id="${esc(c)}" aria-pressed="${A.filterCat === c}">${esc(CATEGORIES[c] || 'Other')}</button>`).join('')}</div>` : ''}</div>` : ''}
    <div class="stack entries" id="entryList">${listHtml(trip)}</div>`;
}

actions['filter-cat'] = el => { A.filterCat = el.dataset.id; render(); };
inputs.search = el => {
  A.search = el.value;
  const list = document.getElementById('entryList');
  if (list) list.innerHTML = listHtml(A.trips[A.route.tripId]);
};
