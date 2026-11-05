/** The trip's change history, and expenses that can be brought back. */
import { A } from './state.js';
import { canEdit, esc } from './dom.js';
import { money } from '../core/money.js';

export function activityView(trip) {
  const rows = A.activity[trip.id] || [];
  const removed = Object.values(A.entries[trip.id] || {}).filter(e => e.deleted);
  return `${removed.length ? `<section class="panel pad stack"><h2>Deleted expenses</h2>${removed.map(e => `<div class="row between"><span class="grow small wrap-any">${esc(e.kind === 'payment' ? 'Settlement' : e.desc)} · <span class="amt">${money(e.total, e.currency)}</span></span>${canEdit(trip, e) ? `<button class="btn small" data-action="restore-entry" data-id="${e.id}">Restore</button>` : ''}</div>`).join('')}</section>` : ''}
  ${rows.length ? `<section class="panel"><div class="list">${rows.map(a => `<div class="pad activity"><div class="wrap-any">${esc(a.text)}</div><div class="tiny muted">${new Date(a.at).toLocaleString('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div></div>`).join('')}</div></section>`
  : '<section class="panel empty"><h2>Nothing has happened yet</h2><p class="muted">Every expense added, changed or settled will appear here, so everyone can see what happened.</p></section>'}`;
}
