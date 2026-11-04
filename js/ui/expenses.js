/** The main list: every expense and settlement, newest first. */
import { A, actions, changes, inputs, render } from './state.js';
import { CATEGORIES } from '../config/app.js';
import { ICON, avatar, catIcon, esc, fmtDate, getMe, svg, who } from './dom.js';
import { money } from '../core/money.js';
import { inBase, needsRate } from '../core/debts.js';
import { activeMembers, handlersOf, liveEntries, memberName, sharesOf } from '../core/model.js';
import { EMPTY_FILTERS, activeFilterCount, applyFilters, filteredTotal } from '../core/filters.js';
import { summaryCard } from './trip.js';
import { goTrip } from './routes.js';

function line(trip, e) {
  const me = getMe(trip);
  const commentCount = Object.keys(e.comments || {}).length;
  if (e.kind === 'payment') {
    const from = Object.keys(e.paid)[0], to = Object.keys(e.owed)[0];
    return `<button class="tap" data-action="open-entry" data-id="${e.id}"><span class="tile pay">${svg(ICON.swap)}</span>
      <span class="grow"><strong class="block">${esc(who(trip, from))} paid ${esc(who(trip, to))}${waiting(trip, e)}</strong><span class="small muted block">Settlement${({ venmo: ' by Venmo', zelle: ' by Zelle', cash: ' in cash' })[e.method] || ''}${e.createdById ? ` · marked by ${esc(who(trip, e.createdById))}` : ''}${e.note ? ` · ${esc(e.note)}` : ''}</span></span>
      <span class="right"><span class="amt owed block">${money(e.total, e.currency)}</span>${e.currency !== trip.currency ? `<span class="tiny muted block">${money(inBase(e, trip.currency).total, trip.currency)}</span>` : ''}</span></button>`;
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
    if (lent > 0) side = `<div class="tiny muted">you get back</div><div class="amt owed">${money(lent, trip.currency)}</div>`;
    else if (lent < 0) side = `<div class="tiny muted">your share</div><div class="amt owe">${money(-lent, trip.currency)}</div>`;
    else side = `<div class="tiny muted">${b.owed[me] ? 'you covered yours' : 'not involved'}</div>`;
  }
  return `<button class="tap" data-action="open-entry" data-id="${e.id}"><span class="payer-mark ${handlers.length > 1 ? 'many' : ''}">${handlers.slice(0, 2).map(h => avatar(trip, h)).join('')}<span class="tile ${refund ? 'pay' : `cat-${esc(e.category)}`}">${refund ? svg(ICON.swap) : catIcon(e.category)}</span></span>
    <span class="grow"><strong class="block wrap-any">${esc(e.desc)}${refund ? ' <span class="tag good">Refund</span>' : ''}${waiting(trip, e)}</strong><span class="payer-line"><span class="small"><b>${esc(payer)}</b> ${refund ? 'received' : 'paid'} <b>${money(e.total, e.currency)}</b></span></span>
    ${e.receipt || commentCount ? `<span class="tiny muted block">${[e.receipt ? 'Receipt' : '', commentCount ? `${commentCount} comment${commentCount > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ')}</span>` : ''}
    <span class="tiny muted credit">${creditLine(trip, e)}</span></span>
    <span class="right">${side}</span></button>`;
}

/** Everyone sees who added an expense and who shares it, right in the list. */
function creditLine(trip, e) {
  // The database returns names in its own order, so put them back in trip order.
  const order = i => trip.members[i]?.order ?? 999;
  const names = Object.keys(sharesOf(e)).sort((x, y) => order(x) - order(y)).map(i => (i === getMe(trip) ? 'you' : memberName(trip, i)));
  const adder = e.createdById ? who(trip, e.createdById) : e.updatedBy;
  return `${adder ? `Added by ${esc(adder)} · ` : ''}Split among ${esc(names.join(', '))}`;
}
const waiting = (trip, e) => (A.pending[trip.id]?.includes(e.id) ? ' <span class="tag">Waiting to sync</span>' : '');

function listHtml(trip) {
  const all = liveEntries(A.entries[trip.id]);
  const list = applyFilters(all, trip, A.search, A.filters);
  if (!list.length) {
    const none = !all.length;
    return `<section class="panel empty"><h2>${none ? 'Nothing on the tab yet' : 'No matches'}</h2><p class="muted">${none ? 'Add the first expense when someone pays for something, or invite your friends first.' : 'Try another word, or clear the filters.'}</p>${none ? '<button class="btn" data-action="invite-first">Invite friends</button>' : '<button class="btn" data-action="filters-clear">Clear filters</button>'}</section>`;
  }
  const filtered = A.search.trim() || activeFilterCount(A.filters);
  const summary = filtered ? `<p class="small muted" id="filterSummary">${list.length} of ${all.length} · ${money(filteredTotal(list, trip.currency), trip.currency)} total</p>` : '';
  // Sorting by amount cuts across days, so date headings only appear in date order.
  if (A.filters.sort === 'largest' || A.filters.sort === 'smallest') {
    return `${summary}<section class="panel"><div class="list">${list.map(e => line(trip, e)).join('')}</div></section>`;
  }
  const days = new Map();
  for (const e of list) { if (!days.has(e.date)) days.set(e.date, []); days.get(e.date).push(e); }
  return summary + [...days].map(([d, es]) => `<div class="label date-head">${fmtDate(d)}</div><section class="panel"><div class="list">${es.map(e => line(trip, e)).join('')}</div></section>`).join('');
}

function filtersHtml(trip, all) {
  const f = A.filters, cats = [...new Set(all.filter(e => e.kind !== 'payment').map(e => e.category))];
  const option = (value, label, current) => `<option value="${esc(value)}" ${current === value ? 'selected' : ''}>${esc(label)}</option>`;
  return `<section class="panel pad filters" id="filterPanel">
    <div class="grid2">
      <label class="f"><span>Person</span><select id="fltPerson" data-change="filter" data-key="person">${option('', 'Everyone', f.person)}${activeMembers(trip).map(m => option(m.id, m.name, f.person)).join('')}</select></label>
      <label class="f"><span>Type</span><select id="fltType" data-change="filter" data-key="type">${option('', 'All types', f.type)}${cats.map(c => option(c, CATEGORIES[c] || 'Other', f.type)).join('')}${option('kind:refund', 'Refunds', f.type)}${option('kind:payment', 'Settlements', f.type)}</select></label>
      <label class="f"><span>From date</span><input id="fltFrom" type="date" value="${esc(f.from)}" data-change="filter" data-key="from"></label>
      <label class="f"><span>To date</span><input id="fltTo" type="date" value="${esc(f.to)}" data-change="filter" data-key="to"></label>
      <label class="f"><span>Minimum (${esc(trip.currency)})</span><input id="fltMin" inputmode="decimal" placeholder="Any" value="${esc(f.min)}" data-input="filter" data-key="min"></label>
      <label class="f"><span>Maximum (${esc(trip.currency)})</span><input id="fltMax" inputmode="decimal" placeholder="Any" value="${esc(f.max)}" data-input="filter" data-key="max"></label>
    </div>
    <div class="row between wrap"><label class="f sort"><span>Sort by</span><select id="fltSort" data-change="filter" data-key="sort">${option('newest', 'Newest first', f.sort)}${option('oldest', 'Oldest first', f.sort)}${option('largest', 'Largest first', f.sort)}${option('smallest', 'Smallest first', f.sort)}</select></label>
    <button type="button" class="link small" data-action="filters-clear">Clear all</button></div>
  </section>`;
}

const filterButtonLabel = () => {
  const n = activeFilterCount(A.filters);
  return `Filters${n ? ` (${n})` : ''}`;
};

export function expensesView(trip) {
  const all = liveEntries(A.entries[trip.id]);
  const damaged = A.skipped[trip.id] || 0;
  return `${A.device.linkUnsaved(trip.id) ? `<section class="notice stack"><span>Keep this trip's link somewhere safe, such as your group chat. If your phone clears this app's storage, the link is how you get back in.</span><button class="btn small" data-action="copy-link">Copy link</button></section>` : ''}
    ${A.device.needsWelcome(trip.id) && getMe(trip) ? `<section class="panel pad stack welcome" id="welcomeCard"><h3>Here's how this trip works</h3>
      <ul class="plain small"><li>Tap <strong>Add expense</strong> whenever you pay for something, and choose who shares it.</li><li>Balances keeps a running total of who owes whom.</li><li>You can change what you added or paid for. To fix anything else, ask the trip's admin.</li><li>Press and hold an expense for quick actions.</li></ul>
      <div><button class="btn small" data-action="welcome-dismiss">Got it</button></div></section>` : ''}
    ${damaged ? `<div class="notice">${damaged} ${damaged > 1 ? 'entries' : 'entry'} couldn't be read and ${damaged > 1 ? 'are' : 'is'} left out of the balances. Update the app, or ask whoever added ${damaged > 1 ? 'them' : 'it'} to add ${damaged > 1 ? 'them' : 'it'} again.</div>` : ''}
    ${summaryCard(trip)}
    ${all.length ? `<div class="row"><input id="search" class="grow" type="search" placeholder="Search expenses or people" aria-label="Search expenses" value="${esc(A.search)}" data-input="search"><button class="btn ${activeFilterCount(A.filters) ? 'on' : ''}" id="filterToggle" data-action="filters-toggle" aria-expanded="${Boolean(A.showFilters)}">${filterButtonLabel()}</button></div>
    ${A.showFilters ? filtersHtml(trip, all) : ''}` : ''}
    <div class="stack entries" id="entryList">${listHtml(trip)}</div>`;
}

actions['welcome-dismiss'] = () => { A.device.setNeedsWelcome(A.route.tripId, false); render(); };
actions['invite-first'] = () => goTrip(A.route.tripId, 'people');
function refreshList() {
  const trip = A.trips[A.route.tripId], list = document.getElementById('entryList'), toggle = document.getElementById('filterToggle');
  if (list) list.innerHTML = listHtml(trip);
  if (toggle) { toggle.textContent = filterButtonLabel(); toggle.classList.toggle('on', activeFilterCount(A.filters) > 0); }
}
actions['filters-toggle'] = () => { A.showFilters = !A.showFilters; render(); };
actions['filters-clear'] = () => { A.filters = { ...EMPTY_FILTERS }; A.search = ''; render(); };
// Amounts redraw only the list as you type, so the box keeps your cursor.
inputs.filter = el => { A.filters[el.dataset.key] = el.value; refreshList(); };
changes.filter = el => { A.filters[el.dataset.key] = el.value; refreshList(); };
inputs.search = el => { A.search = el.value; refreshList(); };
