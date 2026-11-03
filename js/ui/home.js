/** The list of trips on this phone. */
import { A, actions, render, submits } from './state.js';
import { APP_NAME, CURRENCIES, LIMITS, ZONE_CURRENCY } from '../config/app.js';
import { closeSheet, esc, getMe, openSheet, send, sheetHead, toast, val } from './dom.js';
import { money } from '../core/money.js';
import { netBalances, spendingBreakdown } from '../core/debts.js';
import { activeMembers, liveEntries } from '../core/model.js';
import { TRIP_ID_PATTERN } from '../core/ids.js';
import { isIos, shouldSuggestInstall } from '../core/platform.js';
import { goTrip } from './routes.js';

export function modeNotice() {
  if (A.preview) return '<div class="notice">Preview: everything is saved in this browser only. The real app shares trips through their invite links.</div>';
  if (A.repo?.kind === 'local') return '<div class="notice">Saving on this device only. Trips can be shared once the online database is connected.</div>';
  return '';
}

/** Offline state, refused changes and the install suggestion. Shown on every trip screen and at home. */
export function alerts() {
  const failed = A.device.failedChanges();
  const standalone = globalThis.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
  const suggest = shouldSuggestInstall({ ios: isIos(navigator.userAgent, navigator.platform, navigator.maxTouchPoints), standalone, preview: A.preview, dismissed: A.device.installTipDismissed() });
  return `${navigator.onLine === false ? '<div class="notice">You\'re offline. New expenses stay on this phone, marked "Waiting to sync", until you reconnect.</div>' : ''}
    ${failed.length ? `<div class="notice note-row bad-note"><span>${failed.map(f => esc(f.text)).join('<br>')}</span><button class="btn small" data-action="failed-dismiss">Dismiss</button></div>` : ''}
    ${suggest ? `<div class="notice note-row" id="installTip"><span>Add this app to your Home Screen: tap Share, then Add to Home Screen. Safari can clear a site's data if you don't visit for about a week. Copy your trip link first, and paste it into the app's first screen.</span><button class="btn small" data-action="install-dismiss">Got it</button></div>` : ''}`;
}
actions['failed-dismiss'] = () => { A.device.clearFailedChanges(); render(); };
actions['install-dismiss'] = () => { A.device.dismissInstallTip(); render(); };

export function homeView() {
  const ids = A.device.trips(), archived = A.device.archived();
  const all = ids.map(id => A.trips[id]).filter(t => t && !t.deletedAt && !t.retiredAt);
  const trips = all.filter(t => !archived.includes(t.id));
  const shelved = all.filter(t => archived.includes(t.id));
  const waiting = ids.filter(id => !A.loaded[id]).length;
  const totals = {};
  const rowFor = t => {
    const list = liveEntries(A.entries[t.id]);
    const net = netBalances(list, t.currency);
    const me = getMe(t);
    const { total } = spendingBreakdown(list, t.currency);
    const settled = Object.values(net).every(v => v === 0);
    let status;
    if (me) {
      const v = net[me] || 0;
      totals[t.currency] = (totals[t.currency] || 0) + v;
      status = v === 0 ? '<span class="muted small">Settled up</span>'
        : v > 0 ? `<div class="tiny muted">you are owed</div><div class="amt owed">${money(v, t.currency)}</div>`
        : `<div class="tiny muted">you owe</div><div class="amt owe">${money(-v, t.currency)}</div>`;
    } else status = `<span class="muted small">${settled ? 'Settled up' : 'Pick who you are'}</span>`;
    return `<button class="tap" data-action="open-trip" data-id="${t.id}">
      <span class="grow"><strong class="block wrap-any">${esc(t.name)}</strong><span class="small muted">${activeMembers(t).length} people · ${money(total, t.currency)} spent</span></span>
      <span class="right">${status}${(A.pending[t.id]?.length) ? '<div class="tag">Waiting to sync</div>' : ''}</span></button>`;
  };
  const rows = trips.map(rowFor).join('');
  const shelvedRows = shelved.map(rowFor).join('');
  const sums = Object.entries(totals).filter(([, v]) => v !== 0);
  const summary = !all.length ? '' : `<section class="panel summary"><span class="label">Your overall balance</span>
    ${sums.length ? sums.map(([c, v]) => `<div class="big ${v > 0 ? 'owed' : 'owe'}">${v > 0 ? '+' : '−'}${money(Math.abs(v), c)}</div>`).join('') : '<div class="big">All square</div>'}
    <p class="small muted">Counts the trips where you've chosen your name.</p></section>`;
  return `<div class="airmail" aria-hidden="true"></div>
    <header class="home-head"><div class="stack tight"><h1>${APP_NAME}</h1><p class="muted">Split the costs now. Settle up once you're home.</p></div>
    <button class="btn primary" data-action="new-trip">New trip</button></header>
    ${modeNotice()}${alerts()}${summary}
    ${trips.length ? `<section class="panel"><div class="list">${rows}</div></section>`
    : shelved.length ? '' : waiting ? '<section class="panel empty"><h2>Opening your trips</h2><p class="muted">One moment.</p></section>'
    : '<section class="panel empty"><h2>No trips yet</h2><p class="muted">Create a trip and send friends the link. They can add expenses without an account.</p><button class="btn primary" data-action="new-trip">Create your first trip</button></section>'}
    <form class="row" data-form="join-link"><input id="joinLink" aria-label="Invite link" placeholder="Have an invite? Paste the link" autocomplete="off"><button class="btn">Join</button></form>
    ${shelved.length ? `<button class="link small" data-action="toggle-archived">${A.showArchived ? 'Hide' : 'Show'} archived trips (${shelved.length})</button>${A.showArchived ? `<section class="panel"><div class="list">${shelvedRows}</div></section>` : ''}` : ''}`;
}

function defaultCurrency() {
  try { return ZONE_CURRENCY[Intl.DateTimeFormat().resolvedOptions().timeZone] || 'USD'; } catch { return 'USD'; }
}

actions['new-trip'] = () => {
  const cur = defaultCurrency();
  openSheet(`<form class="sheet" data-form="new-trip">${sheetHead('New trip', '<button class="btn small primary">Create</button>')}<div class="sheet-body">
    <label class="f"><span>Trip name</span><input id="ntName" required maxlength="${LIMITS.tripName}" placeholder="Okinawa, April"></label>
    <label class="f"><span>Show balances in</span><select id="ntCur">${CURRENCIES.map(c => `<option ${c === cur ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    <label class="f"><span>Who's going? One name per line, starting with you</span><textarea id="ntPeople" rows="5" required placeholder="Jonathan&#10;Mia&#10;Wei"></textarea></label>
    <p class="small muted">You can add more people later, and friends can add themselves when they open the link. The currency can't change once the trip starts.</p>
  </div></form>`);
};
submits['new-trip'] = () => {
  const name = val('ntName').trim().slice(0, LIMITS.tripName);
  const people = [...new Set(val('ntPeople').split(/\n|,|、/).map(s => s.trim().slice(0, LIMITS.personName)).filter(Boolean))].slice(0, LIMITS.members);
  if (!name || !people.length) return toast('Enter a trip name and at least one person.');
  const { trip, written } = A.repo.createTrip({ name, currency: val('ntCur'), memberNames: people });
  closeSheet();
  A.device.addTrip(trip.id);
  const firstId = Object.keys(trip.members)[0];
  A.device.setMe(trip.id, firstId);
  A.device.setLinkUnsaved(trip.id, true);
  A.trips[trip.id] = trip;
  A.loaded[trip.id] = true;
  A.watchTrip(trip.id);
  send(written);
  goTrip(trip.id, 'people');
  toast('Trip created. Send friends the invite link.');
  return undefined;
};
submits['join-link'] = () => {
  const m = /#(?:join|t)-([a-z0-9]+)/.exec(val('joinLink').trim());
  if (!m || !TRIP_ID_PATTERN.test(m[1])) return toast("That isn't a trip link. Copy the whole link and try again.");
  A.device.addTrip(m[1]);
  A.watchTrip(m[1]);
  goTrip(m[1]);
  return undefined;
};
actions['toggle-archived'] = () => { A.showArchived = !A.showArchived; render(); };
actions['open-trip'] = el => goTrip(el.dataset.id);
