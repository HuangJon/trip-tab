/** Who pays whom, each person's balance, and recording payments. */
import { A, actions, changes, inputs, submits } from './state.js';
import { CURRENCIES, LIMITS } from '../config/app.js';
import { looksBackwards, rateQuestion, storedToTyped, typedToStored } from '../core/rates.js';
import { coveredBy, exactRate, sendFor, venmoLink } from '../core/settle.js';
import { reminderText, wrapUpText } from '../core/messages.js';
import { actor, amAdmin, avatar, canEdit, canWrite, closeSheet, copyText, esc, fmtDate, getMe, openSheet, requireMe, send, sheetHead, textSheet, today, toast, val, who } from './dom.js';
import { fromMinor, money, toMinor } from '../core/money.js';
import { myPayments, needsRate, netBalances, personLedger, spendingBreakdown, tripDebts } from '../core/debts.js';
import { activeMembers, liveEntries, memberName } from '../core/model.js';
import { randomId } from '../core/ids.js';
import { summaryCard } from './trip.js';

const unratedCount = trip => liveEntries(A.entries[trip.id]).filter(e => needsRate(e, trip.currency)).length;

export function debtsFor(trip) {
  return tripDebts(liveEntries(A.entries[trip.id]), trip.currency, trip.simplify !== false);
}

/** A small moment once a trip with real expenses reaches zero. */
function settledHtml(trip) {
  const has = liveEntries(A.entries[trip.id]).length > 0;
  if (!has) return '<div class="empty"><h3>Nothing to settle yet</h3><p class="muted small">Add an expense and this will show who owes whom.</p><button class="btn primary" data-action="add-expense">Add expense</button></div>';
  const shelved = A.device.archived().includes(trip.id);
  return `<div class="empty settled" id="settledUp"><span class="settled-mark" aria-hidden="true">✓</span><h3>Everyone is settled up</h3><p class="muted small">Nobody owes anything on this trip. Nice work.</p>${shelved ? '' : '<button class="btn small" data-action="archive-toggle">Archive this trip</button>'}</div>`;
}

/** Foreign expenses still waiting for a rate. They need one before the group settles up. */
function unratedNotice(trip) {
  const list = liveEntries(A.entries[trip.id]).filter(e => needsRate(e, trip.currency));
  if (!list.length) return '';
  return `<section class="notice stack" id="unrated"><strong>${list.length} expense${list.length > 1 ? 's need' : ' needs'} an exchange rate</strong>
    <span>These aren't in the balances yet, so add the rates before you settle up.</span>
    ${list.map(e => `<div class="row between wrap"><span class="grow wrap-any">${esc(e.desc)} · <span class="amt">${money(e.total, e.currency)}</span></span>${canEdit(trip, e) ? `<button class="btn small" data-action="edit-entry" data-id="${e.id}">Add rate</button>` : `<span class="small">Ask ${esc(memberName(trip, e.createdById))} to add it</span>`}</div>`).join('')}</section>`;
}

/** Someone's payment details with copy buttons. */
function handles(trip, id) {
  const m = trip.members[id] || {};
  const rows = [['Venmo', m.venmo], ['Zelle', m.zelle]].filter(([, v]) => v);
  return rows.map(([label, v]) => `<div class="handle"><span>${esc(memberName(trip, id))}'s ${label}: <strong>${esc(v)}</strong></span><button type="button" class="btn small" data-action="copy-handle" data-value="${esc(v)}">Copy</button></div>`).join('');
}
actions['copy-handle'] = el => copyText(el.dataset.value);

/** What already happened: payments marked as paid, and what each person spent. It stays after settling up. */
function historyHtml(trip) {
  const list = liveEntries(A.entries[trip.id]);
  if (!list.length) return '';
  const paidOff = list.filter(e => e.kind === 'payment').sort((x, y) => (y.date || '').localeCompare(x.date || '') || (y.createdAt || 0) - (x.createdAt || 0));
  const s = spendingBreakdown(list, trip.currency), c = trip.currency;
  const pays = paidOff.length ? `<section class="panel pad stack" id="paymentsMade"><h2>Payments made</h2>${paidOff.map(e => {
    const from = Object.keys(e.paid)[0], to = Object.keys(e.owed)[0];
    return `<button class="row-btn" data-action="open-entry" data-id="${e.id}"><span class="grow"><strong>${esc(who(trip, from))}</strong> paid <strong>${esc(who(trip, to))}</strong><span class="block small muted">${fmtDate(e.date)}</span></span><span class="amt">${money(e.total, e.currency)}</span></button>`;
  }).join('')}</section>` : '';
  const rows = activeMembers(trip).filter(m => s.paid[m.id] || s.share[m.id]).map(m => `<div class="spent-row"><span class="wrap-any">${avatar(trip, m.id)} ${esc(m.name)}</span><span class="amt">${money(s.paid[m.id] || 0, c)}</span><span class="amt">${money(s.share[m.id] || 0, c)}</span></div>`).join('');
  return `${pays}<section class="panel pad stack" id="tripTotals"><div class="row between wrap"><h2>Trip totals</h2><button class="btn small" data-action="share-wrapup">Share wrap-up</button></div><p class="small muted">${money(s.total, c)} spent on this trip.</p><div class="spent-row spent-head"><span>Person</span><span>Paid</span><span>Their share</span></div>${rows}</section>`;
}

export function balancesView(trip) {
  const c = trip.currency, members = activeMembers(trip), me = getMe(trip);
  const net = netBalances(liveEntries(A.entries[trip.id]), c, members.map(m => m.id));
  const max = Math.max(1, ...Object.values(net).map(Math.abs));
  const debts = debtsFor(trip), write = canWrite(trip), admin = amAdmin(trip);
  const mine = me ? myPayments(liveEntries(A.entries[trip.id]), c, me, trip.simplify !== false) : { pays: [], gets: [], others: debts, alsoOwed: [], alsoOwing: [] };
  const names = ids => ids.map(i => esc(memberName(trip, i))).join(' and ');
  const row = (d, kind) => `<div class="debt ${kind}"><div class="debt-who">${avatar(trip, d.from)}<span class="wrap-any"><strong>${esc(who(trip, d.from))}</strong></span><span class="arrow" aria-label="pays">→</span>${avatar(trip, d.to)}<span class="wrap-any"><strong>${esc(who(trip, d.to))}</strong></span></div>
      <div class="debt-end"><span class="amt ${kind === 'pay' ? 'owe' : kind === 'get' ? 'owed' : ''}">${money(d.amount, c)}</span>${write ? `<button class="btn small" data-action="settle" data-from="${d.from}" data-to="${d.to}" data-amt="${d.amount}">${kind === 'pay' ? 'Pay' : kind === 'get' ? 'Mark received' : 'Settle'}</button>` : ''}</div>
      ${d.to !== me ? handles(trip, d.to) : ''}${kind === 'get' && write ? `<div><button class="btn small" data-action="remind" data-from="${d.from}" data-amt="${d.amount}">Send a reminder</button></div>` : ''}</div>`;
  const group = (title, rows, kind, note) => (rows.length ? `<div class="debt-group"><span class="label group-title">${title}</span>${note ? `<p class="small muted group-note">${note}</p>` : ''}<div class="list">${rows.map(d => row(d, kind)).join('')}</div></div>` : '');
  return `${summaryCard(trip)}${unratedNotice(trip)}<section class="panel ticket">
    ${debts.length ? `${group('You pay', mine.pays, 'pay', mine.alsoOwed.length ? `This also covers what you owe ${names(mine.alsoOwed)}.` : '')}
      ${mine.gets.length && me && !trip.members[me]?.venmo && !trip.members[me]?.zelle && write ? `<div class="notice stack tight" id="paymentAsk"><span>People owe you, but they can't see how to pay you yet.</span><div><button class="btn small" data-action="add-payment">Add Venmo or Zelle</button></div></div>` : ''}
      ${group('You receive', mine.gets, 'get', mine.alsoOwing.length ? `This also covers what ${names(mine.alsoOwing)} ${mine.alsoOwing.length > 1 ? 'owe' : 'owes'} you.` : '')}
      ${group(me ? 'Between others' : 'Who pays whom', mine.others, 'other')}
      <div class="tear" aria-hidden="true"></div>` : settledHtml(trip)}
    ${debts.length ? `<div class="pad stack"><div class="row between wrap"><h3>Who pays whom</h3><label class="row small gap8"><input id="simp" type="checkbox" data-action="simplify" ${trip.simplify !== false ? 'checked' : ''} ${admin ? '' : 'disabled'}>Simplify debts</label></div>
    <p class="small muted">${trip.simplify !== false ? 'Combines debts so the group makes the fewest payments. What each person ends up with stays the same.' : 'Shows who owes whom based on each expense.'}</p>
    <div><button class="btn small" data-action="share-summary">Share this summary</button></div></div>` : ''}
  </section>
  <section class="panel pad stack"><h2>Everyone's balance</h2>
    ${members.map(m => {
      const v = net[m.id] || 0, w = (Math.abs(v) / max) * 100;
      return `<button type="button" class="person-row stack tight" data-action="person-ledger" data-id="${m.id}"><div class="row between"><span class="row gap8">${avatar(trip, m.id)}<span>${esc(m.name)}</span>${m.id === me ? '<span class="tag you">you</span>' : ''}</span><span class="amt ${v > 0 ? 'owed' : v < 0 ? 'owe' : 'muted'}">${v > 0 ? '+' : v < 0 ? '−' : ''}${money(Math.abs(v), c)}</span></div>
        <div class="diverge" role="img" aria-label="${esc(m.name)} ${v >= 0 ? 'is owed' : 'owes'} ${money(Math.abs(v), c)}"><div>${v < 0 ? `<i class="bar-owe" style="width:${w}%"></i>` : ''}</div><div>${v > 0 ? `<i class="bar-owed" style="width:${w}%"></i>` : ''}</div></div></button>`;
    }).join('')}
    <p class="tiny muted">Left of center owes money. Right of center is owed money. Tap a person to see why.</p></section>
  ${historyHtml(trip)}`;
}

async function shareText(title, text, note) {
  try {
    if (navigator.share) { await navigator.share({ title, text }); return; }
  } catch (e) { if (e?.name === 'AbortError') return; }
  textSheet(title, text, note);
}
actions.remind = el => {
  const t = A.trips[A.route.tripId], m = t.members[getMe(t)] || {};
  shareText('Send a reminder', reminderText({ tripName: t.name, toName: memberName(t, el.dataset.from), amount: money(+el.dataset.amt, t.currency), venmo: m.venmo, zelle: m.zelle, link: `${location.origin}${location.pathname}#join-${t.id}` }), 'Copy this and send it to them.');
};
actions['share-wrapup'] = () => {
  const t = A.trips[A.route.tripId];
  shareText('Trip wrap-up', wrapUpText(t.name, liveEntries(A.entries[t.id]), t.currency, activeMembers(t)), 'Copy this and paste it into your group chat.');
};
actions.simplify = el => { const t = A.trips[A.route.tripId]; send(A.repo.updateTrip(t.id, { simplify: el.checked }, getMe(t))); };
actions['share-summary'] = () => {
  const t = A.trips[A.route.tripId], debts = debtsFor(t);
  const contact = id => {
    const m = t.members[id] || {};
    const parts = [m.venmo && `Venmo ${m.venmo}`, m.zelle && `Zelle ${m.zelle}`].filter(Boolean);
    return parts.length ? ` (${parts.join(', ')})` : '';
  };
  const text = `${t.name}: who pays whom\n${debts.map(x => `${memberName(t, x.from)} pays ${memberName(t, x.to)} ${money(x.amount, t.currency)}${contact(x.to)}`).join('\n')}`;
  textSheet('Share summary', text, 'Paste it into your group chat as a reminder.');
};
actions['copy-sheet-text'] = () => copyText(document.getElementById('shareTxt').textContent, 'shareTxt');

const METHODS = [['venmo', 'Venmo'], ['zelle', 'Zelle'], ['cash', 'Cash'], ['other', 'Other']];

/** How to pay the person receiving, with everything ready to copy. */
function payHtml(trip, to, sendMinor, currency) {
  const m = trip.members[to] || {}, name = esc(memberName(trip, to));
  const rows = [['Venmo', m.venmo], ['Zelle', m.zelle]].filter(([, v]) => v);
  const details = rows.map(([label, v]) => {
    const open = label === 'Venmo' ? venmoLink(v, sendMinor, currency, trip.name) : '';
    return `<div class="handle"><span>${label}: <strong>${esc(v)}</strong></span><span class="row gap8">${open ? `<a class="btn small primary" id="openVenmo" href="${esc(open)}" target="_blank" rel="noopener noreferrer">Open Venmo</a>` : ''}<button type="button" class="btn small" data-action="copy-handle" data-value="${esc(v)}">Copy</button></span></div>`;
  }).join('');
  const amountRow = sendMinor ? `<div class="handle"><span>Send: <strong class="amt">${money(sendMinor, currency)}</strong></span><button type="button" class="btn small" data-action="copy-handle" data-value="${esc(fromMinor(sendMinor, currency))}">Copy</button></div>` : '';
  return `${amountRow}${details || `<p class="small muted">${name} hasn't added Venmo or Zelle yet. Ask them for the best way to pay, or they can add it under People → Payment.</p>`}`;
}

/** The amount being paid, in whichever currency it's paid in. */
function fxHtml(trip) {
  const pay = A.settle.currency, base = trip.currency;
  if (pay === base) return '';
  const q = rateQuestion(pay, base);
  return `<label class="f"><span>Exchange rate: 1 ${esc(q.one)} = how many ${esc(q.many)}?</span><input id="sRate" class="mono" inputmode="decimal" placeholder="Needed to work out the amount" value="${esc(A.settle.rate)}" data-input="settle-rate"><span id="sRateWarn"></span></label>
    <label class="f"><span>Amount you're sending in ${esc(pay)}</span><input id="sSend" class="amount-input" inputmode="decimal" value="${esc(A.settle.send)}" data-input="settle-send"></label>`;
}
const settleRate = trip => typedToStored(A.settle.rate, A.settle.currency, trip.currency);

/** Keeps the two amounts in step. Whichever one was just edited stays as typed. */
function syncAmounts(trip, edited) {
  const S = A.settle, base = trip.currency, rate = settleRate(trip);
  if (S.currency === base) { S.send = ''; return; }
  if (edited === 'send') {
    const sent = toMinor(S.send, S.currency);
    const box = document.getElementById('sAmt');
    if (rate && sent && box) box.value = fromMinor(coveredBy(sent, S.currency, base, rate), base);
  } else {
    const debt = toMinor(val('sAmt'), base);
    S.send = rate && debt ? fromMinor(sendFor(debt, base, S.currency, rate), S.currency) : '';
    const box = document.getElementById('sSend');
    if (box) box.value = S.send;
  }
}
function drawPay() {
  const trip = A.trips[A.route.tripId], box = document.getElementById('settlePay'), S = A.settle;
  const foreign = S.currency !== trip.currency;
  if (box) box.innerHTML = payHtml(trip, val('sTo'), foreign ? toMinor(S.send, S.currency) : toMinor(val('sAmt'), trip.currency), foreign ? S.currency : trip.currency);
  const warn = document.getElementById('sRateWarn'), rate = settleRate(trip);
  if (warn) warn.innerHTML = foreign && rate && looksBackwards(rate, S.currency, trip.currency) ? '<div class="check bad">This rate looks backwards. Check which way round it is.</div>' : '';
  const label = document.getElementById('sAmtLabel');
  if (label) label.textContent = foreign ? `Debt this covers, in ${trip.currency}` : `Amount in ${trip.currency}`;
}
/** Draws the currency section again after the currency changes. */
function setPayCurrency(trip, currency) {
  const S = A.settle;
  S.currency = currency;
  S.rate = currency === trip.currency ? '' : storedToTyped(trip.rates?.[currency], currency, trip.currency);
  S.backwardsOk = false;
  const box = document.getElementById('settleFx'), picker = document.getElementById('sCur');
  if (picker) picker.value = currency;
  if (box) box.innerHTML = fxHtml(trip);
  syncAmounts(trip);
  const send = document.getElementById('sSend');
  if (send) send.value = S.send;
  drawPay();
}
/** Venmo and Zelle are generally US dollars only, so they suggest dollars unless you've chosen otherwise. */
function suggestCurrency(trip) {
  const S = A.settle;
  if (!S.currencyChosen && ['venmo', 'zelle'].includes(A.settleMethod) && trip.currency !== 'USD' && S.currency !== 'USD') setPayCurrency(trip, 'USD');
}

actions.settle = el => {
  const trip = A.trips[A.route.tripId];
  if (!requireMe(trip)) return;
  const members = activeMembers(trip), debts = debtsFor(trip), me = getMe(trip);
  const d = el.dataset.from ? { from: el.dataset.from, to: el.dataset.to, amount: +el.dataset.amt }
    : debts.find(x => x.from === me) || debts.find(x => x.to === me) || debts[0] || { from: members[0].id, to: (members[1] || members[0]).id, amount: 0 };
  const opts = sel => members.map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  const toHas = trip.members[d.to] || {};
  A.settleMethod = toHas.venmo ? 'venmo' : toHas.zelle ? 'zelle' : 'cash';
  A.settle = { currency: trip.currency, rate: '', send: '', currencyChosen: false, backwardsOk: false };
  openSheet(`<form class="sheet" data-form="settle">${sheetHead('Settle up', '<button class="btn small primary">Mark as paid</button>')}<div class="sheet-body">
    ${unratedCount(trip) ? `<div class="notice">${unratedCount(trip)} expense${unratedCount(trip) > 1 ? 's are' : ' is'} waiting for an exchange rate and not counted yet. These amounts may change once ${unratedCount(trip) > 1 ? 'they have rates' : 'it has a rate'}.</div>` : ''}
    <div class="grid2"><label class="f"><span>Who paid</span><select id="sFrom" data-change="settle-people">${opts(d.from)}</select></label><label class="f"><span>Who received it</span><select id="sTo" data-change="settle-people">${opts(d.to)}</select></label></div>
    <div class="grid-cur"><label class="f"><span>Pay in</span><select id="sCur" data-change="settle-currency">${[...new Set([trip.currency, ...CURRENCIES])].map(c => `<option ${c === trip.currency ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    <label class="f"><span id="sAmtLabel">Amount in ${esc(trip.currency)}</span><input id="sAmt" class="amount-input" inputmode="decimal" required value="${d.amount ? fromMinor(d.amount, trip.currency) : ''}" data-input="settle-amount"></label></div>
    <div class="stack" id="settleFx"></div>
    <section class="stack"><h3>1. Send the money</h3><p class="small muted">Open your payment app and send it. The app can't move money itself.</p><div class="stack tight" id="settlePay">${payHtml(trip, d.to, d.amount, trip.currency)}</div></section>
    <section class="stack"><h3>2. Mark it as paid</h3>
      <div class="seg" role="group" aria-label="How it was paid" id="settleMethods">${METHODS.map(([k, l]) => `<button type="button" data-action="settle-method" data-id="${k}" aria-pressed="${A.settleMethod === k}">${l}</button>`).join('')}</div>
      <label class="f"><span>Date</span><input id="sDate" type="date" required max="${today()}" value="${today()}"></label>
      <label class="f"><span>Note</span><input id="sNote" maxlength="${LIMITS.comment}" placeholder="Optional"></label>
      <button class="btn primary" id="settleSave">Mark as paid</button>
      <p class="tiny muted">Everyone's balances update, and it's added to the expense list and activity. If this was a mistake, you can delete it and record it again.</p></section>
  </div></form>`);
  suggestCurrency(trip);
};
const showMethod = () => document.querySelectorAll('#settleMethods button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === A.settleMethod)));
actions['settle-method'] = el => {
  A.settleMethod = el.dataset.id;
  showMethod();
  suggestCurrency(A.trips[A.route.tripId]);
};
inputs['settle-amount'] = () => { syncAmounts(A.trips[A.route.tripId]); drawPay(); };
inputs['settle-rate'] = el => { A.settle.rate = el.value; A.settle.backwardsOk = false; syncAmounts(A.trips[A.route.tripId]); drawPay(); };
inputs['settle-send'] = el => { A.settle.send = el.value; syncAmounts(A.trips[A.route.tripId], 'send'); drawPay(); };
changes['settle-currency'] = el => {
  A.settle.currencyChosen = true;
  setPayCurrency(A.trips[A.route.tripId], el.value);
};
changes['settle-people'] = () => {
  const trip = A.trips[A.route.tripId], pair = debtsFor(trip).find(x => x.from === val('sFrom') && x.to === val('sTo'));
  const amount = document.getElementById('sAmt');
  if (pair && amount) amount.value = fromMinor(pair.amount, trip.currency);
  const to = trip.members[val('sTo')] || {};
  A.settleMethod = to.venmo ? 'venmo' : to.zelle ? 'zelle' : 'cash';
  showMethod();
  syncAmounts(trip);
  suggestCurrency(trip);
  drawPay();
};
submits.settle = () => {
  const trip = A.trips[A.route.tripId], from = val('sFrom'), to = val('sTo'), debt = toMinor(val('sAmt'), trip.currency), S = A.settle;
  if (from === to) return toast('Choose two different people.');
  if (debt <= 0) return toast('Enter an amount above zero.');
  const date = val('sDate') || today();
  if (date > today()) return toast("Payments can't be dated in the future.");
  const foreign = S.currency !== trip.currency;
  let total = debt, rate = 1, quotedRate;
  if (foreign) {
    quotedRate = settleRate(trip);
    if (!quotedRate) return toast(`Enter the exchange rate for ${S.currency}, so the app knows how much this covers.`);
    if (looksBackwards(quotedRate, S.currency, trip.currency) && !S.backwardsOk) {
      S.backwardsOk = true;
      return toast('This rate looks backwards. Fix it, or tap Mark as paid again to keep it.');
    }
    total = toMinor(S.send, S.currency);
    if (total <= 0) return toast('Enter the amount you sent.');
    rate = exactRate(debt, trip.currency, total, S.currency);
  }
  const id = randomId(), at = Date.now();
  const entry = { id, tripId: trip.id, kind: 'payment', desc: 'Settlement', category: 'other', date, currency: S.currency, rate, ...(foreign ? { quotedRate } : {}), total, paid: { [from]: total }, owed: { [to]: total }, note: val('sNote').trim(), method: A.settleMethod || 'other', comments: {}, createdAt: at, updatedAt: at, createdById: getMe(trip), updatedBy: actor(trip), deleted: false };
  if (foreign && trip.rates?.[S.currency] !== quotedRate) send(A.repo.updateTrip(trip.id, { [`rates.${S.currency}`]: quotedRate }, getMe(trip)));
  closeSheet();
  send(A.repo.saveEntry(trip, entry, { isNew: true, actor: actor(trip), actorId: getMe(trip), label: `marked that ${memberName(trip, from)} paid ${memberName(trip, to)} ${money(total, S.currency)}${foreign ? ` (${money(debt, trip.currency)})` : ''}${({ venmo: ' by Venmo', zelle: ' by Zelle', cash: ' in cash' })[A.settleMethod] || ''}` }), 'A payment');
  toast(`Marked as paid. ${memberName(trip, from)} paid ${memberName(trip, to)} ${money(total, S.currency)}.`);
  return undefined;
};

/** Why someone's balance is what it is, line by line. */
actions['person-ledger'] = el => {
  const trip = A.trips[A.route.tripId], id = el.dataset.id, c = trip.currency;
  const all = liveEntries(A.entries[trip.id]), rows = personLedger(all, c, id), balance = rows.reduce((s, r) => s + r.net, 0);
  const missing = all.filter(e => needsRate(e, c) && (e.paid[id] || e.owed[id])).length;
  const signed = v => `${v > 0 ? '+' : v < 0 ? '−' : ''}${money(Math.abs(v), c)}`;
  const tone = v => (v > 0 ? 'owed' : v < 0 ? 'owe' : 'muted');
  const describe = r => {
    if (r.entry.kind === 'payment') return r.net > 0 ? `Paid ${esc(memberName(trip, Object.keys(r.entry.owed)[0]))}` : `Received from ${esc(memberName(trip, Object.keys(r.entry.paid)[0]))}`;
    const verb = r.entry.kind === 'refund' ? 'Received' : 'Paid';
    return `${verb} ${money(r.handled, c)} · share ${money(r.share, c)}`;
  };
  openSheet(`<div class="sheet">${sheetHead(`${memberName(trip, id)}'s balance`, '', 'Close')}<div class="sheet-body" id="ledger">
    <section class="panel pad stack tight"><span class="label">${balance > 0 ? 'Is owed' : balance < 0 ? 'Owes' : 'Balance'}</span><div class="big ${tone(balance)}">${balance === 0 ? 'Settled up' : money(Math.abs(balance), c)}</div>
    <p class="small muted">Each line shows what they paid minus their share. Added together, the lines make this balance.</p></section>
    ${missing ? `<div class="notice">${missing} expense${missing > 1 ? 's are' : ' is'} left out until ${missing > 1 ? 'they have' : 'it has'} an exchange rate.</div>` : ''}
    ${rows.length ? `<section class="panel"><div class="list">${rows.map(r => `<button class="tap" data-action="open-entry" data-id="${r.entry.id}"><span class="grow"><strong class="block wrap-any">${esc(r.entry.kind === 'payment' ? 'Settlement' : r.entry.desc)}</strong><span class="small muted">${describe(r)}</span><span class="tiny muted block">${fmtDate(r.entry.date)}</span></span><span class="right amt ${tone(r.net)}">${signed(r.net)}</span></button>`).join('')}</div></section>` : '<p class="muted">Nothing here yet.</p>'}
  </div></div>`);
};
