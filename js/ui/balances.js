/** Who pays whom, each person's balance, and recording payments. */
import { A, actions, submits } from './state.js';
import { LIMITS } from '../config/app.js';
import { avatar, canWrite, closeSheet, copyText, esc, getMe, openSheet, send, sheetHead, textSheet, today, toast, val, who } from './dom.js';
import { fromMinor, money, toMinor } from '../core/money.js';
import { netBalances, pairwise, simplify } from '../core/debts.js';
import { activeMembers, liveEntries, memberName } from '../core/model.js';
import { randomId } from '../core/ids.js';
import { summaryCard } from './trip.js';

export function debtsFor(trip) {
  const list = liveEntries(A.entries[trip.id]);
  return trip.simplify === false ? pairwise(list, trip.currency) : simplify(netBalances(list, trip.currency));
}

export function balancesView(trip) {
  const c = trip.currency, members = activeMembers(trip), me = getMe(trip);
  const net = netBalances(liveEntries(A.entries[trip.id]), c, members.map(m => m.id));
  const max = Math.max(1, ...Object.values(net).map(Math.abs));
  const debts = debtsFor(trip), write = canWrite(trip);
  return `${summaryCard(trip)}<section class="panel ticket">
    <div class="pad stack"><div class="row between wrap"><h2>Who pays whom</h2><label class="row small gap8"><input id="simp" type="checkbox" data-action="simplify" ${trip.simplify !== false ? 'checked' : ''} ${write ? '' : 'disabled'}>Simplify debts</label></div>
    <p class="small muted">${trip.simplify !== false ? 'Combines debts so the group makes the fewest payments. The amount each person ends up with stays the same.' : 'Shows who owes whom based on each expense.'}</p></div>
    <div class="tear" aria-hidden="true"></div>
    ${debts.length ? `<div class="list">${debts.map(d => `<div class="debt">${avatar(trip, d.from)}<span class="names"><strong>${esc(who(trip, d.from))}</strong> ${d.from === me ? 'pay' : 'pays'} <strong>${esc(who(trip, d.to))}</strong><br><span class="amt ${d.from === me ? 'owe' : d.to === me ? 'owed' : ''}">${money(d.amount, c)}</span></span>
      ${write ? `<button class="btn small" data-action="settle" data-from="${d.from}" data-to="${d.to}" data-amt="${d.amount}">Record payment</button>` : ''}</div>`).join('')}</div>
      <div class="tear" aria-hidden="true"></div><div class="pad"><button class="btn small" data-action="share-summary">Share this summary</button></div>`
    : '<div class="empty"><h3>Everyone is settled up</h3><p class="muted small">New expenses will show here.</p></div>'}
  </section>
  <section class="panel pad stack"><h2>Each person's balance</h2>
    ${members.map(m => {
      const v = net[m.id] || 0, w = (Math.abs(v) / max) * 100;
      return `<div class="stack tight"><div class="row between"><span class="row gap8">${avatar(trip, m.id)}<span>${esc(m.name)}</span>${m.id === me ? '<span class="tag you">you</span>' : ''}</span><span class="amt ${v > 0 ? 'owed' : v < 0 ? 'owe' : 'muted'}">${v > 0 ? '+' : v < 0 ? '−' : ''}${money(Math.abs(v), c)}</span></div>
        <div class="diverge" role="img" aria-label="${esc(m.name)} ${v >= 0 ? 'is owed' : 'owes'} ${money(Math.abs(v), c)}"><div>${v < 0 ? `<i class="bar-owe" style="width:${w}%"></i>` : ''}</div><div>${v > 0 ? `<i class="bar-owed" style="width:${w}%"></i>` : ''}</div></div></div>`;
    }).join('')}
    <p class="tiny muted">Left of center owes money. Right of center is owed money.</p></section>`;
}

actions.simplify = el => { send(A.repo.updateTrip(A.route.tripId, { simplify: el.checked })); };
actions['share-summary'] = () => {
  const t = A.trips[A.route.tripId], debts = debtsFor(t);
  const text = `${t.name}: who pays whom\n${debts.map(x => `${memberName(t, x.from)} pays ${memberName(t, x.to)} ${money(x.amount, t.currency)}`).join('\n')}`;
  textSheet('Share summary', text, 'Paste it into your group chat as a reminder.');
};
actions['copy-sheet-text'] = () => copyText(document.getElementById('shareTxt').textContent, 'shareTxt');

actions.settle = el => {
  const trip = A.trips[A.route.tripId], members = activeMembers(trip), debts = debtsFor(trip), me = getMe(trip);
  const d = el.dataset.from ? { from: el.dataset.from, to: el.dataset.to, amount: +el.dataset.amt }
    : debts.find(x => x.from === me || x.to === me) || debts[0] || { from: members[0].id, to: (members[1] || members[0]).id, amount: 0 };
  const opts = sel => members.map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  openSheet(`<form class="sheet" data-form="settle">${sheetHead('Settle up', '<button class="btn small primary">Save</button>')}<div class="sheet-body">
    <p class="small muted">This records a payment you made outside the app, such as cash or a bank transfer. No money moves here.</p>
    <div class="grid2"><label class="f"><span>Who paid</span><select id="sFrom">${opts(d.from)}</select></label><label class="f"><span>Who received it</span><select id="sTo">${opts(d.to)}</select></label></div>
    <label class="f"><span>Amount in ${trip.currency}</span><input id="sAmt" class="amount-input" inputmode="decimal" required value="${d.amount ? fromMinor(d.amount, trip.currency) : ''}"></label>
    <label class="f"><span>Date</span><input id="sDate" type="date" required max="${today()}" value="${today()}"></label>
    <label class="f"><span>Note</span><input id="sNote" maxlength="${LIMITS.comment}" placeholder="Bank transfer"></label>
  </div></form>`);
};
submits.settle = () => {
  const trip = A.trips[A.route.tripId], from = val('sFrom'), to = val('sTo'), total = toMinor(val('sAmt'), trip.currency);
  if (from === to) return toast('Choose two different people.');
  if (total <= 0) return toast('Enter an amount above zero.');
  const date = val('sDate') || today();
  if (date > today()) return toast("Payments can't be dated in the future.");
  const id = randomId(), at = Date.now();
  const entry = { id, tripId: trip.id, kind: 'payment', desc: 'Settlement', category: 'other', date, currency: trip.currency, rate: 1, total, paid: { [from]: total }, owed: { [to]: total }, note: val('sNote').trim(), comments: {}, createdAt: at, updatedAt: at, updatedBy: memberName(trip, from), deleted: false };
  closeSheet();
  send(A.repo.saveEntry(trip, entry, { isNew: true, actor: memberName(trip, from), label: `paid ${memberName(trip, to)} ${money(total, trip.currency)}` }));
  toast('Payment recorded');
  return undefined;
};
