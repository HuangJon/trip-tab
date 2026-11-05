/** The list of trips on this phone. */
import { A, actions, render, submits } from './state.js';
import { APP_NAME, CURRENCIES, LIMITS } from '../config/app.js';
import { convertRough } from '../core/rates.js';
import { ICON, closeSheet, esc, getMe, openSheet, send, sheetHead, svg, toast, val } from './dom.js';
import { lookPicker } from './look.js';
import { helpButton } from './walkthrough.js';
import { money } from '../core/money.js';
import { netBalances, spendingBreakdown } from '../core/debts.js';
import { activeMembers, liveEntries } from '../core/model.js';
import { environment } from '../config/firebase.js';
import { TRIP_ID_PATTERN } from '../core/ids.js';
import { isIos, shouldSuggestInstall } from '../core/platform.js';
import { goTrip } from './routes.js';
import { amOwner } from './owner.js';

export function modeNotice() {
  if (environment === 'staging') return '<div class="notice">Staging site: test data only. Anything here can be deleted at any time.</div>';
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
    ${suggest ? `<div class="notice note-row" id="installTip"><span>Add this app to your Home Screen: tap Share, then Add to Home Screen. It keeps you signed in, because Safari can clear a site's data if you don't visit for about a week. Sign in on the home-screen app and your trips will be there.</span><button class="btn small" data-action="install-dismiss">Got it</button></div>` : ''}`;
}
actions['home-theme'] = () => openSheet(`<div class="sheet">${sheetHead('Theme', '', 'Done')}<div class="sheet-body stack">${lookPicker()}</div></div>`);
actions['failed-dismiss'] = () => { A.device.clearFailedChanges(); render(); };
actions['install-dismiss'] = () => { A.device.dismissInstallTip(); render(); };

export function homeView() {
  const ids = A.device.trips(), archived = A.device.archived();
  const all = ids.map(id => A.trips[id]).filter(t => t && !t.deletedAt && !t.retiredAt);
  const trips = all.filter(t => !archived.includes(t.id));
  const shelved = all.filter(t => archived.includes(t.id));
  const waiting = ids.filter(id => !A.loaded[id]).length;
  const show = 'USD'; // the home page always totals in dollars
  let overall = 0, rough = false;
  const inShown = (v, c) => {
    const x = convertRough(v, c, show);
    if (x === null) return null;
    if (c !== show) rough = true;
    return x;
  };
  const rowFor = t => {
    const list = liveEntries(A.entries[t.id]);
    const net = netBalances(list, t.currency);
    const me = getMe(t);
    const { total } = spendingBreakdown(list, t.currency);
    const settled = Object.values(net).every(v => v === 0);
    let status;
    if (me) {
      const v = net[me] || 0, shown = inShown(v, t.currency);
      if (shown !== null) overall += shown;
      const amount = shown === null ? money(Math.abs(v), t.currency) : `${t.currency === show ? '' : '≈ '}${money(Math.abs(shown), show)}`;
      status = v === 0 ? '<span class="muted small">Settled up</span>'
        : `<div class="tiny muted">${v > 0 ? 'You get' : 'You owe'}</div><div class="amt ${v > 0 ? 'owed' : 'owe'}">${amount}</div>`;
    } else status = `<span class="muted small">${settled ? 'Settled up' : 'Pick who you are'}</span>`;
    return `<button class="tap" data-action="open-trip" data-id="${t.id}">
      <span class="grow"><strong class="block wrap-any">${esc(t.name)}</strong><span class="small muted">${activeMembers(t).length} ${activeMembers(t).length === 1 ? 'person' : 'people'} · ${money(total, t.currency)} spent</span></span>
      <span class="right">${status}${(A.pending[t.id]?.length) ? '<div class="tag">Waiting to sync</div>' : ''}</span></button>`;
  };
  const rows = trips.map(rowFor).join('');
  const shelvedRows = shelved.map(rowFor).join('');
  const summary = !all.length ? '' : `<section class="hero ${overall > 0 ? 'is-owed' : overall < 0 ? 'is-owing' : ''}" id="homeBalance">
    ${overall === 0 ? '<div class="hero-settled">All settled</div>' : `<div class="hero-say">${overall > 0 ? 'Overall, you get' : 'Overall, you owe'}</div><div class="big">${rough ? '≈ ' : ''}${money(Math.abs(overall), show)}</div>`}
    ${rough ? '<p class="small">Roughly, using estimated exchange rates.</p>' : ''}</section>`;
  return `<header class="home-head"><div class="brand"><span class="mark" aria-hidden="true"></span><div class="stack tight"><h1>${APP_NAME}</h1><p class="muted">Split the costs now. Settle up once you're home.</p></div></div>
    <div class="home-actions">${helpButton()}<button class="icon-btn" data-action="home-theme" aria-label="Theme">${svg(ICON.theme)}</button><button class="btn primary" data-action="new-trip">New trip</button></div></header>
    ${modeNotice()}${alerts()}${summary}
    ${trips.length ? `<section class="panel"><div class="list">${rows}</div></section>`
    : shelved.length ? '' : waiting ? '<section class="panel empty"><h2>Opening your trips</h2><p class="muted">One moment.</p></section>'
    : '<section class="panel empty"><h2>Start your first trip</h2><ol class="how small"><li>Create a trip and add the people going.</li><li>Send your friends the invite link.</li><li>Add expenses as you go, then settle up at the end.</li></ol><button class="btn primary" data-action="new-trip">Create your first trip</button></section>'}
    <form class="row" data-form="join-link"><input id="joinLink" aria-label="Invite link" placeholder="Have an invite? Paste the link" autocomplete="off"><button class="btn">Join</button></form>
    ${shelved.length ? `<button class="link small" data-action="toggle-archived">${A.showArchived ? 'Hide' : 'Show'} archived trips (${shelved.length})</button>${A.showArchived ? `<section class="panel"><div class="list">${shelvedRows}</div></section>` : ''}` : ''}
    <footer class="signed-in small muted"><span>Signed in as ${esc(A.user?.email || A.user?.displayName || '')}</span><span class="row gap8">${amOwner() ? '<button class="link small" data-action="owner-open">Owner page</button>' : ''}<button class="link small" data-action="auth-signout">Sign out</button></span></footer>`;
}


actions['new-trip'] = () => {
  const cur = 'USD';
  openSheet(`<form class="sheet" data-form="new-trip">${sheetHead('New trip', '<button class="btn small primary">Create</button>')}<div class="sheet-body">
    <label class="f"><span>Trip name</span><input id="ntName" required maxlength="${LIMITS.tripName}" placeholder="Okinawa, April"></label>
    <label class="f"><span>Show balances in</span><select id="ntCur">${CURRENCIES.map(c => `<option ${c === cur ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    <label class="f"><span>Who's going? One name per line, starting with you</span><textarea id="ntPeople" rows="5" required placeholder="Jonathan&#10;Mia&#10;Wei">${esc(A.user?.displayName ? `${A.user.displayName}\n` : '')}</textarea></label>
    <p class="small muted">Your own name goes first. You can add more later, and friends can add themselves when they open the link. The currency can't change once the trip starts.</p>
  </div></form>`);
};
submits['new-trip'] = () => {
  const name = val('ntName').trim().slice(0, LIMITS.tripName);
  const people = [...new Set(val('ntPeople').split(/\n|,|、/).map(s => s.trim().slice(0, LIMITS.personName)).filter(Boolean))].slice(0, LIMITS.members);
  if (!name || !people.length) return toast('Enter a trip name and at least one person.');
  const { trip, written } = A.repo.createTrip({ name, currency: val('ntCur'), memberNames: people, profile: A.user });
  closeSheet();
  A.device.addTrip(trip.id);
  const firstId = Object.keys(trip.members)[0];
  A.device.setMe(trip.id, firstId);
  A.device.setLinkUnsaved(trip.id, true);
  A.trips[trip.id] = trip;
  A.loaded[trip.id] = true;
  send(written);
  // Give the join record a moment to arrive first. Offline it won't, so don't wait for long.
  Promise.race([written.catch(() => {}), new Promise(r => setTimeout(r, 2500))]).then(() => A.watchTrip(trip.id));
  goTrip(trip.id, 'expenses');
  toast('Trip created');
  return undefined;
};
submits['join-link'] = () => {
  const m = /#(?:join|t)-([a-z0-9]+)/.exec(val('joinLink').trim());
  if (!m || !TRIP_ID_PATTERN.test(m[1])) return toast("That isn't a trip link. Copy the whole link and try again.");
  A.enterTrip(m[1]);
  goTrip(m[1]);
  return undefined;
};
actions['toggle-archived'] = () => { A.showArchived = !A.showArchived; render(); };
actions['open-trip'] = el => goTrip(el.dataset.id);
