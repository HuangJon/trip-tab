/** Where the money went. */
import { A, actions } from './state.js';
import { CATEGORIES } from '../config/app.js';
import { esc, getMe, saveFile } from './dom.js';
import { money } from '../core/money.js';
import { needsRate, spendingBreakdown } from '../core/debts.js';
import { activeMembers, liveEntries } from '../core/model.js';
import { backupFilename, csvFor } from '../core/backup.js';

const bars = (rows, fmt) => {
  const max = Math.max(1, ...rows.map(r => r.v));
  return rows.filter(r => r.v !== 0).map(r => `<div class="bar-row"><span class="n">${esc(r.k)}</span><div class="track"><div class="fill" style="width:${(Math.max(0, r.v) / max) * 100}%"></div></div><span class="amt">${fmt(r.v)}</span></div>`).join('');
};

export function insightsView(trip) {
  const c = trip.currency, f = v => money(v, c), members = activeMembers(trip);
  const s = spendingBreakdown(liveEntries(A.entries[trip.id]), c);
  if (!s.count) return '<section class="panel empty"><h2>Nothing to chart yet</h2><p class="muted">Spending breakdowns appear after the first expense.</p></section>';
  const me = getMe(trip), days = Object.keys(s.byDay).sort();
  const max = Math.max(1, ...members.flatMap(m => [s.paid[m.id] || 0, s.share[m.id] || 0]));
  const unrated = liveEntries(A.entries[trip.id]).filter(e => needsRate(e, c)).length;
  return `${unrated ? `<div class="notice">Leaves out ${unrated} expense${unrated > 1 ? 's' : ''} waiting for an exchange rate.</div>` : ''}<section class="hero"><span class="label">Total trip spending</span><div class="big">${f(s.total)}</div>
    <dl class="stats"><div><dt>Expenses</dt><dd>${s.count} over ${days.length} day${days.length > 1 ? 's' : ''}</dd></div><div><dt>Per person</dt><dd>${f(Math.round(s.total / Math.max(1, members.length)))}</dd></div>${me ? `<div><dt>Your share</dt><dd>${f(s.share[me] || 0)}</dd></div>` : ''}</dl></section>
  <section class="panel pad stack"><h2>By category</h2>${bars(Object.entries(s.byCategory).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ k: CATEGORIES[k] || 'Other', v })), f)}</section>
  <section class="panel pad stack"><h2>Paid compared with share</h2>
    <div class="row small muted"><span class="row gap6"><span class="key"></span>Paid, after refunds</span><span class="row gap6"><span class="key alt"></span>Share</span></div>
    ${members.map(m => `<div class="stack tight"><strong class="small">${esc(m.name)}</strong>
      <div class="bar-row two"><div class="track"><div class="fill" style="width:${(Math.max(0, s.paid[m.id] || 0) / max) * 100}%"></div></div><span class="amt small">${f(s.paid[m.id] || 0)}</span></div>
      <div class="bar-row two"><div class="track"><div class="fill alt" style="width:${(Math.max(0, s.share[m.id] || 0) / max) * 100}%"></div></div><span class="amt small">${f(s.share[m.id] || 0)}</span></div></div>`).join('')}</section>
  <section class="panel pad stack"><h2>By day</h2>${bars(days.map(d => ({ k: new Date(`${d}T12:00:00`).toLocaleDateString('en', { month: 'short', day: 'numeric' }), v: s.byDay[d] })), f)}</section>
  <button class="btn" data-action="export-csv">Export expenses as CSV</button>`;
}

actions['export-csv'] = () => {
  const t = A.trips[A.route.tripId];
  saveFile(backupFilename(t, 'expenses', 'csv'), csvFor(t, A.entries[t.id]), 'text/csv');
};
