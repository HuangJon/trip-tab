/** Adding and editing an expense. What people type lives in A.form, so nothing they typed is lost on a redraw. */
import { A, actions, changes, inputs, submits } from './state.js';
import { CATEGORIES, CURRENCIES, LIMITS } from '../config/app.js';
import { canSetRate, leftButton, amAdmin, actor, avatar, catIcon, closeSheet, esc, getMe, openSheet, requireMe, send, today, toast } from './dom.js';
import { convert, fromMinor, money, toMinor } from '../core/money.js';
import { needsRate, expensePayments, receivedBy } from '../core/debts.js';
import { SPLIT_MODES, computeSplit, nonZero } from '../core/split.js';
import { activeMembers, handlersOf, memberName, sharesOf } from '../core/model.js';
import { randomId } from '../core/ids.js';
import { looksBackwards, rateQuestion, roughUsd, storedToTyped, typedToStored } from '../core/rates.js';
import { suggestCategory } from '../core/categorize.js';
import { shrinkPhoto } from './receipt.js';
import { goTrip } from './routes.js';

const clone = o => JSON.parse(JSON.stringify(o));
const tripOf = () => A.trips[A.form.tripId];
const ids = t => activeMembers(t).map(m => m.id);

/** Starts a new expense from an old one, dated today, with no receipt photo. */
export function duplicateExpense(trip, entry) {
  openExpenseForm(trip, entry);
  const F = A.form;
  delete F.id;
  delete F.baseUpdatedAt;
  F.date = today();
  F.receipt = '';
  F.isCopy = true;
  drawForm();
}

export function openExpenseForm(trip, entry) {
  const all = ids(trip), me = getMe(trip) || all[0];
  const draft = entry ? null : A.device.draft(trip.id);
  if (entry) {
    const c = entry.currency;
    A.form = {
      tripId: trip.id, id: entry.id, baseUpdatedAt: entry.updatedAt, categoryPicked: true, desc: entry.desc, category: entry.category, date: entry.date, currency: c, rate: c === trip.currency ? '' : storedToTyped(entry.rate, c, trip.currency),
      kind: entry.kind, amount: fromMinor(entry.total, c), payers: Object.fromEntries(Object.entries(handlersOf(entry)).map(([k, v]) => [k, fromMinor(v, c)])),
      multi: Object.keys(handlersOf(entry)).length > 1, payer: Object.keys(handlersOf(entry))[0],
      split: { inputs: {}, items: [], selected: Object.keys(sharesOf(entry)), mode: 'equal', ...clone(entry.split || {}) }, note: entry.note || '', receipt: entry.receipt || '',
    };
  } else if (draft) {
    A.form = { ...draft, tripId: trip.id, isDraft: true };
  } else {
    const currency = trip.defaultCurrency || A.device.lastCurrency(trip.id) || trip.currency;
    const recent = A.device.recent(trip.id);
    const startCategory = CATEGORIES[recent.category] ? recent.category : 'food';
    A.form = { catClosed: true, startCategory, tripId: trip.id, kind: 'expense', desc: '', category: startCategory, date: today(), currency, rate: currency === trip.currency ? '' : storedToTyped(trip.rates?.[currency], currency, trip.currency), amount: '', payers: {}, multi: false, payer: me, split: { mode: 'equal', selected: [...all], inputs: {}, items: [] }, note: '', receipt: '' };
  }
  drawForm();
  if (!entry) document.getElementById('fAmt')?.focus();
}

function collect() {
  const F = A.form;
  const read = (id, key) => { const el = document.getElementById(id); if (el) F[key] = el.value; };
  read('fDesc', 'desc'); read('fCat', 'category'); read('fDate', 'date'); read('fAmt', 'amount'); read('fRate', 'rate'); read('fNote', 'note'); read('fPayer', 'payer');
}
const keepDraft = () => {
  const F = A.form;
  if (F && !F.id) { collect(); if (F.desc || F.amount) A.device.saveDraft(F.tripId, F); else A.device.clearDraft(F.tripId); }
};

/** Once the split and the payments both add up, who pays whom for this expense on its own. */
function squaresUp(t, total, owed) {
  const F = A.form, c = F.currency;
  if (!(total > 0) || !owed) return '';
  const paid = F.multi ? Object.fromEntries(Object.entries(F.payers).map(([i, v]) => [i, toMinor(v, c)]).filter(([, v]) => v > 0)) : { [F.payer]: total };
  if (Object.values(paid).reduce((a, b) => a + b, 0) !== total) return '';
  const name = id => (id === getMe(t) ? 'You' : memberName(t, id));
  const pays = expensePayments(paid, owed, c);
  if (!pays.length) return '';
  return `<div class="panel pad stack tight squares"><span class="flabel">For this ${F.kind === 'refund' ? 'refund' : 'expense'}</span>${pays.map(p => `<div class="row between small"><span>${esc(name(p.from))} ${p.from === getMe(t) ? 'pay' : 'pays'} ${esc(name(p.to))}</span><span class="amt">${money(p.amount, c)}</span></div>`).join('')}${Object.entries(receivedBy(pays)).map(([id, v]) => `<div class="row between small squares-got"><span>${esc(name(id))} ${id === getMe(t) ? 'receive' : 'receives'}</span><span class="amt good">${money(v, c)}</span></div>`).join('')}<span class="tiny muted">Balances adds this up with the rest of the trip.</span></div>`;
}

function splitEditor(t) {
  const F = A.form, S = F.split, mode = S.mode, c = F.currency, total = toMinor(F.amount, c), res = computeSplit(total, c, S, ids(t)), owed = res.owed || {}, people = activeMembers(t);
  const shown = id => (total > 0 && res.owed ? `<span class="res amt muted" data-live="res-${id}">${money(owed[id] || 0, c)}</span>` : `<span class="res" data-live="res-${id}"></span>`);
  let body = '';
  if (mode === 'equal' || mode === 'adjust') {
    body = people.map(p => `<div class="split-row"><input id="sel-${p.id}" type="checkbox" data-action="toggle-person" data-id="${p.id}" ${S.selected.includes(p.id) ? 'checked' : ''} aria-label="Include ${esc(p.name)}">${avatar(t, p.id)}<span class="grow wrap-any">${esc(p.name)}</span>
      ${mode === 'adjust' ? `<input id="inp-${p.id}" inputmode="text" placeholder="+0" aria-label="Extra for ${esc(p.name)}" value="${esc(S.inputs[p.id] || '')}" data-input="split" data-id="${p.id}">` : ''}${shown(p.id)}</div>`).join('');
  } else if (mode === 'items') {
    body = `<div class="stack">${S.items.map((it, x) => `<div class="item"><div class="item-top"><input id="it-n-${x}" placeholder="Item" aria-label="Item name" value="${esc(it.name || '')}" data-input="item-name" data-i="${x}"><input id="it-a-${x}" inputmode="decimal" placeholder="Price" class="mono" aria-label="Item price" value="${esc(it.amount || '')}" data-input="item-price" data-i="${x}"><button type="button" class="x" data-action="item-remove" data-i="${x}" aria-label="Remove item">×</button></div>
      <p class="tiny muted item-who">Who had it?</p><div class="chips">${people.map(p => `<button type="button" class="chip" data-action="item-person" data-i="${x}" data-id="${p.id}" aria-pressed="${(it.people || []).includes(p.id)}">${esc(p.name)}</button>`).join('')}</div></div>`).join('')}
      <button type="button" class="btn" data-action="item-add">Add item</button>
      <div class="stack tight" data-live="items-sum">${res.owed ? `<div class="stack tight small">${people.filter(p => owed[p.id]).map(p => `<div class="row between"><span>${esc(p.name)}</span><span class="amt">${money(owed[p.id], c)}</span></div>`).join('')}</div>
      ${res.subtotal !== total ? `<p class="tiny muted">Items total ${money(res.subtotal, c)}. The ${res.subtotal < total ? 'extra' : 'discount'} of ${money(Math.abs(total - res.subtotal), c)} (tax, tip or discount) is shared in proportion to what each person ordered.</p>` : ''}` : ''}</div></div>`;
  } else {
    body = people.map(p => `<div class="split-row">${avatar(t, p.id)}<span class="grow wrap-any">${esc(p.name)}</span><input id="inp-${p.id}" inputmode="decimal" placeholder="${mode === 'percent' ? '%' : '0'}" aria-label="${esc(p.name)}" value="${esc(S.inputs[p.id] || '')}" data-input="split" data-id="${p.id}">${shown(p.id)}</div>`).join('');
  }
  const help = { exact: 'Enter how much each person owes.', percent: 'Percentages must reach 100.', shares: 'For example, a couple can count as 2 shares.', adjust: 'Add an amount for anyone who had something extra. Use a minus for less. The rest splits evenly.', items: 'List what was on the bill and tap who had each one. Who paid is set in Paid by above.' }[mode];
  return `<div class="seg" role="group" aria-label="How to split">${SPLIT_MODES.map(([k, l]) => `<button type="button" data-action="split-mode" data-id="${k}" aria-pressed="${mode === k}">${l}</button>`).join('')}</div>
    ${help ? `<p class="small muted">${help}</p>` : ''}<div>${body}</div>
    <div data-live="error">${total > 0 && res.error ? `<div class="check bad">${esc(res.error)}</div>` : ''}</div>
    <div data-live="squares">${squaresUp(t, total, res.owed)}</div>`;
}

const paidTotal = t => activeMembers(t).reduce((s, m) => s + toMinor(A.form.payers[m.id], A.form.currency), 0);
const payCheck = t => {
  const F = A.form, total = toMinor(F.amount, F.currency), s = paidTotal(t);
  if (!total) return '';
  return `<div class="check ${s === total ? 'ok' : 'bad'}">${s === total ? `Payments add up to ${money(total, F.currency)}` : `Payments add up to ${money(s, F.currency)}. They need to reach ${money(total, F.currency)}.`}</div>`;
};
function rateNote(t) {
  const F = A.form, r = typedToStored(F.rate, F.currency, t.currency), m = toMinor(F.amount, F.currency);
  return r && m ? `${money(m, F.currency)} ≈ ${money(convert(m, F.currency, t.currency, r), t.currency)}` : "Leave this blank if you don't know it yet. The expense stays out of balances until it has a rate. Use the rate you actually paid.";
}
/** A rough dollar figure under the amount. A USD trip with a rate already shows the real one just below. */
function usdHint(t) {
  const F = A.form;
  if (t.currency === 'USD' && typedToStored(F.rate, F.currency, t.currency)) return '';
  const usd = roughUsd(toMinor(F.amount, F.currency), F.currency);
  return usd ? `Roughly ${usd}` : '';
}

/** Warns right away when a rate looks upside down, showing the amount it would produce. */
function rateWarning(t) {
  const F = A.form, r = typedToStored(F.rate, F.currency, t.currency), m = toMinor(F.amount, F.currency);
  if (!r || !looksBackwards(r, F.currency, t.currency)) return '';
  const q = rateQuestion(F.currency, t.currency);
  return `<div class="check bad stack tight"><span>This rate looks backwards.${m ? ` It would make ${esc(money(m, F.currency))} worth ${esc(money(convert(m, F.currency, t.currency, r), t.currency))}.` : ''} Enter how many ${esc(q.many)} you get for 1 ${esc(q.one)}.</span><div><button type="button" class="btn small" data-action="rate-flip">Flip it</button></div></div>`;
}

const catButtons = F => Object.entries(CATEGORIES).map(([k, label]) => `<button type="button" class="cat-pick" data-action="cat-pick" data-id="${k}" aria-pressed="${F.category === k}"><span class="tile cat-${k}">${catIcon(k)}</span><span>${esc(label)}</span></button>`).join('');
const catRow = F => `<span class="form-row-label">Category${F.suggested ? ' <span class="tiny muted" id="catHint">Suggested</span>' : ''}</span><span class="form-row-value"><span class="tile cat-${esc(F.category)}">${catIcon(F.category)}</span>${esc(CATEGORIES[F.category] || 'Other')}</span>`;
function dateShown(date) {
  if (date === today()) return 'Today';
  const d = new Date(`${date}T12:00:00`);
  return Number.isNaN(+d) ? 'Choose a date' : d.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
}
function drawCats() {
  const F = A.form, picker = document.getElementById('catPicker'), row = document.getElementById('catRow');
  drawDetailsLink();
  if (picker) { picker.innerHTML = catButtons(F); picker.hidden = !!F.catClosed; }
  if (row) { row.innerHTML = catRow(F); row.setAttribute('aria-expanded', String(!F.catClosed)); }
}

/** Names what's been added, so a glance shows it without opening the section. */
function detailsLabel(F) {
  const set = [F.note ? 'Note' : '', F.receipt ? 'Photo' : ''].filter(Boolean).join(' · ');
  return set || 'Add note or photo';
}
function drawDetailsLink() {
  const more = document.getElementById('formDetails');
  if (more) { more.textContent = detailsLabel(A.form); more.setAttribute('aria-expanded', String(!!A.form.showDetails)); }
}

function drawForm() {
  const F = A.form, t = tripOf();
  if (!t) return closeSheet();
  const refund = F.kind === 'refund';
  const people = activeMembers(t), scroll = document.querySelector('#dlg .sheet-body')?.scrollTop || 0;
  openSheet(`<form class="sheet" data-form="expense"><div class="sheet-head">${leftButton('Cancel', 'form-cancel')}<h2>${F.id ? (refund ? 'Edit refund' : 'Edit expense') : refund ? 'Add refund' : F.isCopy ? 'Copy expense' : 'Add expense'}</h2><div class="sheet-right"></div></div>
  <div class="sheet-body">
    ${F.isDraft ? `<div class="notice row between wrap"><span>Picked up your unsaved expense.</span><button type="button" class="btn small" data-action="draft-discard">${F.discardArmed ? 'Tap again to discard' : 'Discard'}</button></div>` : ''}
    <div class="grid-cur"><label class="f"><span>Currency</span><select id="fCur" data-change="form-currency">${[...new Set([t.currency, ...Object.keys(t.rates || {}).sort(), ...CURRENCIES])].map(c => `<option ${c === F.currency ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    <label class="f"><span>Amount</span><input id="fAmt" class="amount-input" inputmode="decimal" required placeholder="0" value="${esc(F.amount)}" data-input="amount"></label></div>
    <span class="conv mono" id="fUsd">${usdHint(t)}</span>
    ${F.currency !== t.currency ? `<label class="f"><span>Exchange rate: 1 ${esc(rateQuestion(F.currency, t.currency).one)} = how many ${esc(rateQuestion(F.currency, t.currency).many)}? <span class="optional">Optional for now</span></span><input id="fRate" class="mono" inputmode="decimal" placeholder="Add it later if you don't know yet" value="${esc(F.rate)}" data-input="rate"><span class="conv mono" id="fConv">${esc(rateNote(t))}</span><span id="fRateWarn">${rateWarning(t)}</span></label>` : ''}
    <label class="f"><span>Description</span><input id="fDesc" required maxlength="${LIMITS.description}" placeholder="${refund ? 'Hotel deposit returned' : 'Dinner at the night market'}" value="${esc(F.desc)}" data-input="desc"></label>
    ${refund ? '<p class="small muted">A refund is for money coming back, such as a deposit or cancelled ticket. Whoever received it will owe the others their share.</p>' : ''}
    <div class="form-rows">
      <button type="button" class="form-row" id="catRow" data-action="cat-row" aria-expanded="${!F.catClosed}">${catRow(F)}</button>
      <div class="cat-grid" id="catPicker" role="group" aria-label="Category" ${F.catClosed ? 'hidden' : ''}>${catButtons(F)}</div>
      ${F.multi ? `<div class="form-row"><span class="form-row-label">${refund ? 'Received by' : 'Paid by'}</span><button type="button" class="link small" data-action="toggle-multi">One person ${refund ? 'received it' : 'paid'}</button></div>
      <div class="form-row-more">${people.map(p => `<div class="split-row">${avatar(t, p.id)}<span class="grow wrap-any">${esc(p.name)}</span><input id="pay-${p.id}" inputmode="decimal" placeholder="0" aria-label="${esc(p.name)} paid" value="${esc(F.payers[p.id] || '')}" data-input="payer" data-id="${p.id}"></div>`).join('')}<div id="payCheck">${payCheck(t)}</div></div>`
    : `<label class="form-row"><span class="form-row-label">${refund ? 'Received by' : 'Paid by'}</span><select id="fPayer" data-change="form-payer">${people.map(p => `<option value="${p.id}" ${F.payer === p.id ? 'selected' : ''}>${esc(p.id === getMe(t) ? `You (${p.name})` : p.name)}</option>`).join('')}<option value="several">More than one person…</option></select></label>`}
      <label class="form-row form-row-date" data-action="date-open"><span class="form-row-label">Date</span><span class="form-row-value" id="fDateShown">${esc(dateShown(F.date))}</span><input id="fDate" type="date" required max="${today()}" value="${esc(F.date)}" data-change="form-detail"></label>
    </div>
    <div class="stack tight"><span class="flabel">${refund ? 'Shared by' : 'Split among'}</span><div class="stack" id="splitArea">${splitEditor(t)}</div></div>
    <button type="button" class="link small form-details" id="formDetails" data-action="form-details" aria-expanded="${!!F.showDetails}">${esc(detailsLabel(F))}</button>
    <div class="stack form-panel" id="formMore" ${F.showDetails ? '' : 'hidden'}>
    <div class="row wrap"><label class="btn" for="fPhoto">${F.receipt ? 'Replace receipt photo' : 'Add a receipt photo'}</label><input id="fPhoto" hidden type="file" accept="image/*" data-file="receipt">${F.receipt ? '<span class="tag good">Receipt attached</span><button type="button" class="link small" data-action="receipt-clear">Remove</button>' : ''}</div>
    <label class="f"><span>Notes</span><textarea id="fNote" maxlength="${LIMITS.note}" placeholder="Optional" data-input="note">${esc(F.note)}</textarea></label>
    ${F.id ? '' : `<button type="button" class="link small form-details" data-action="form-kind" data-id="${refund ? 'expense' : 'refund'}">${refund ? 'Make this a regular expense' : 'This is a refund (money came back)'}</button>`}
    </div>
    ${F.id ? `<button type="button" class="btn danger" data-action="delete-entry" data-id="${F.id}">Delete ${refund ? 'refund' : 'expense'}</button>` : ''}
  </div>
  <div class="sheet-foot"><button class="btn primary form-save" id="fSave">${F.id ? 'Save changes' : refund ? 'Add refund' : 'Add expense'}</button></div></form>`);
  const b = document.querySelector('#dlg .sheet-body');
  if (b) b.scrollTop = scroll;
  if (!F.id && !F.focused && !F.desc) { F.focused = true; document.getElementById('fDesc')?.focus(); }
  return undefined;
}

function refresh() {
  const t = tripOf(), area = document.getElementById('splitArea');
  if (!area) return;
  const active = document.activeElement, id = active?.id, at = active?.selectionStart;
  const next = document.createElement('div');
  next.innerHTML = splitEditor(t);
  const live = [...next.querySelectorAll('[data-live]')];
  // While typing in the split, only the figures around the box change. Rebuilding the box under the
  // keyboard made phones drop or jump the typing.
  const typing = area.contains(active) && active.matches('input:not([type=checkbox])');
  if (typing && live.every(n => area.querySelector(`[data-live="${n.dataset.live}"]`))) {
    for (const n of live) area.querySelector(`[data-live="${n.dataset.live}"]`).replaceWith(n);
  } else area.replaceChildren(...next.childNodes);
  if (id) {
    const n = document.getElementById(id);
    if (n && n !== active) { n.focus(); try { n.setSelectionRange(at, at); } catch { /* not a text box */ } }
  }
  const pc = document.getElementById('payCheck');
  if (pc) pc.innerHTML = payCheck(t);
  const us = document.getElementById('fUsd');
  if (us) us.textContent = usdHint(t);
  drawDetailsLink();
  const cv = document.getElementById('fConv');
  if (cv) cv.textContent = rateNote(t);
  const rw = document.getElementById('fRateWarn');
  if (rw) rw.innerHTML = rateWarning(t);
  keepDraft();
}

inputs.note = el => { A.form.note = el.value; drawDetailsLink(); keepDraft(); };
// Typing suggests a category, until the person picks one themselves.
inputs.desc = el => {
  const F = A.form;
  F.desc = el.value;
  if (!F.categoryPicked) {
    const guess = suggestCategory(el.value, Object.values(A.entries[F.tripId] || {}));
    if (guess) { F.category = guess; F.suggested = true; } else if (F.suggested) { F.category = F.startCategory; F.suggested = false; }
    drawCats();
  }
  keepDraft();
};
actions['cat-pick'] = el => {
  collect();
  // Tapping the chosen one closes the grid. Only a different one counts as choosing.
  const F = A.form;
  if (el.dataset.id === F.category) F.catClosed = true;
  else Object.assign(F, { category: el.dataset.id, categoryPicked: true, suggested: false, catClosed: false });
  drawCats();
  keepDraft();
};
inputs.amount = el => { A.form.amount = el.value; refresh(); };
inputs.rate = el => { A.form.rate = el.value; A.form.backwardsOk = false; refresh(); };
actions['rate-flip'] = () => {
  collect();
  const n = parseFloat(A.form.rate);
  if (n > 0) A.form.rate = String(Number((1 / n).toPrecision(6)));
  drawForm();
};
inputs.split = el => { A.form.split.inputs[el.dataset.id] = el.value; refresh(); };
inputs.payer = el => { A.form.payers[el.dataset.id] = el.value; refresh(); };
inputs['item-name'] = el => { A.form.split.items[+el.dataset.i].name = el.value; keepDraft(); };
inputs['item-price'] = el => { A.form.split.items[+el.dataset.i].amount = el.value; refresh(); };
changes['form-currency'] = el => {
  collect();
  const F = A.form, t = tripOf();
  F.currency = el.value;
  F.rate = el.value === t.currency ? '' : storedToTyped(t.rates?.[el.value], el.value, t.currency);
  F.backwardsOk = false;
  drawForm();
};

actions['add-expense'] = () => {
  const t = A.trips[A.route.tripId];
  if (t.settling) { toast(amAdmin(t) ? 'Expenses are closed. Reopen them on Balances to add one.' : "Expenses are closed while everyone settles up. Ask the trip's admin to reopen them."); return; }
  if (requireMe(t)) openExpenseForm(t);
};
actions['cat-row'] = () => { A.form.catClosed = !A.form.catClosed; drawCats(); };
actions['date-open'] = (el, ev) => {
  const input = el.querySelector('input');
  if (ev?.target === input) return; // the browser's own date box handles clicks on itself
  try { input.showPicker(); } catch { input.focus(); } // some embedded pages block the picker, so typing still works
};
actions['form-details'] = () => {
  A.form.showDetails = !A.form.showDetails;
  document.getElementById('formMore').hidden = !A.form.showDetails;
  drawDetailsLink();
};
changes['form-payer'] = el => {
  if (el.value !== 'several') { A.form.payer = el.value; refresh(); keepDraft(); return; }
  el.value = A.form.payer; // the choice is a way in, not a person
  actions['toggle-multi']();
};
changes['form-detail'] = () => {
  collect();
  document.getElementById('fDateShown').textContent = dateShown(A.form.date);
  drawDetailsLink();
  keepDraft();
};
actions['form-kind'] = el => { collect(); A.form.kind = el.dataset.id; drawForm(); keepDraft(); };
actions['form-cancel'] = () => {
  const hadText = A.form && !A.form.id && (document.getElementById('fDesc')?.value || document.getElementById('fAmt')?.value);
  keepDraft();
  closeSheet();
  if (hadText) toast('Kept as a draft. Add expense picks it up.');
};
actions['draft-discard'] = () => {
  const F = A.form;
  if (!F.discardArmed) { collect(); F.discardArmed = true; drawForm(); return; }
  A.device.clearDraft(F.tripId);
  const t = tripOf();
  closeSheet();
  openExpenseForm(t);
};
actions['split-mode'] = el => {
  collect();
  const F = A.form, mode = el.dataset.id;
  if (mode === F.split.mode) return;
  F.split.inputs = {};
  F.split.mode = mode;
  if ((mode === 'equal' || mode === 'adjust') && !F.split.selected.length) F.split.selected = ids(tripOf());
  drawForm();
  keepDraft();
};
actions['toggle-person'] = el => {
  const S = A.form.split;
  S.selected = el.checked ? [...S.selected, el.dataset.id] : S.selected.filter(x => x !== el.dataset.id);
  refresh();
};
actions['toggle-multi'] = () => {
  collect();
  const F = A.form;
  F.multi = !F.multi;
  if (F.multi && !Object.keys(F.payers).length && F.payer && F.amount) F.payers = { [F.payer]: F.amount };
  drawForm();
};
actions['item-add'] = () => { collect(); A.form.split.items.push({ name: '', amount: '', people: [] }); drawForm(); };
actions['item-remove'] = el => { collect(); A.form.split.items.splice(+el.dataset.i, 1); drawForm(); };
actions['item-person'] = el => {
  const it = A.form.split.items[+el.dataset.i], id = el.dataset.id;
  it.people = (it.people || []).includes(id) ? it.people.filter(x => x !== id) : [...(it.people || []), id];
  refresh();
};
actions['receipt-clear'] = () => { collect(); A.form.receipt = ''; drawForm(); };

export async function attachReceipt(file) {
  if (!file || !A.form) return;
  collect();
  try {
    const dataUrl = await shrinkPhoto(file);
    const { id, written } = A.repo.saveReceipt(A.form.tripId, dataUrl, getMe(A.trips[A.form.tripId]));
    send(written);
    if (A.form) { A.form.receipt = id; A.form.showDetails = true; drawForm(); toast('Receipt attached'); }
  } catch { toast("That image couldn't be opened. Try a JPG or PNG."); }
}

submits.expense = () => {
  collect();
  const F = A.form, t = tripOf(), total = toMinor(F.amount, F.currency), everyone = ids(t);
  if (!F.desc.trim()) return toast('Add a description.');
  if (total <= 0) return toast('Enter an amount above zero.');
  if ((F.date || today()) > today()) return toast("Expenses can't be dated in the future.");
  let rate = 1;
  if (F.currency !== t.currency) {
    rate = F.rate.trim() === '' ? null : typedToStored(F.rate, F.currency, t.currency);
    if (F.rate.trim() !== '' && rate === null) return toast("That exchange rate isn't a number above zero. Fix it, or leave it blank for now.");
    if (rate && looksBackwards(rate, F.currency, t.currency) && !F.backwardsOk) {
      F.backwardsOk = true;
      return toast('This rate looks backwards. Fix it, or tap Save again to keep it.');
    }
  }
  const res = computeSplit(total, F.currency, F.split, everyone);
  if (res.error) return toast(res.error);
  let paid = {};
  if (F.multi) {
    for (const i of everyone) { const v = toMinor(F.payers[i], F.currency); if (v > 0) paid[i] = v; }
    const s = Object.values(paid).reduce((a, b) => a + b, 0);
    if (s !== total) return toast(`Payments add up to ${money(s, F.currency)}. They need to reach ${money(total, F.currency)}.`);
  } else paid = { [F.payer]: total };
  const isNew = !F.id, id = F.id || randomId(), at = Date.now(), name = actor(t);
  const shares = nonZero(res.owed), refund = F.kind === 'refund';
  const entry = { id, tripId: t.id, kind: refund ? 'refund' : 'expense', desc: F.desc.trim(), category: F.category, date: F.date || today(), currency: F.currency, rate, total, paid: refund ? shares : paid, owed: refund ? paid : shares, split: clone(F.split), note: F.note.trim(), receipt: F.receipt || '', updatedAt: at, updatedBy: name, deleted: false };
  if (isNew) { entry.comments = {}; entry.createdAt = at; entry.createdById = getMe(t); }
  const current = isNew ? null : A.entries[t.id]?.[id];
  if (current && current.updatedAt !== F.baseUpdatedAt) return showConflict(t, entry, current);
  commit(t, entry, current);
  return undefined;
};

/** Saves and closes. The version being replaced goes into the expense's history. */
function commit(t, entry, current) {
  const isNew = !current;
  A.device.setLastCurrency(t.id, entry.currency);
  const handlers = Object.keys(handlersOf(entry));
  A.device.setRecent(t.id, { category: entry.category });
  if (isNew) A.device.clearDraft(t.id);
  if (entry.rate && entry.currency !== t.currency && t.rates?.[entry.currency] !== entry.rate && canSetRate(t, entry.currency)) send(A.repo.updateTrip(t.id, { [`rates.${entry.currency}`]: entry.rate }, getMe(t)));
  closeSheet(); // saving finishes the whole drill-down, and the list highlights what changed
  A.justSaved = entry.id;
  A.justSavedShown = false;
  if (A.route.tab !== 'expenses') goTrip(t.id, 'expenses');
  const refund = entry.kind === 'refund';
  const among = Object.keys(sharesOf(entry)).map(i => memberName(t, i)).join(', ');
  const noun = refund ? 'refund ' : '';
  send(A.repo.saveEntry(t, entry, { isNew, previous: current, actor: entry.updatedBy, actorId: getMe(t), label: `${isNew ? 'added' : 'edited'} ${noun}"${entry.desc}" (${money(entry.total, entry.currency)}), split among ${among}`.slice(0, 340) }), `"${entry.desc}"`);
  if (needsRate(entry, t.currency)) toast('Saved. Add its exchange rate to count it in balances.');
  else toast(refund ? (isNew ? 'Refund added' : 'Refund saved') : isNew ? 'Expense added' : 'Expense saved');
}

const versionCard = (t, title, e) => {
  const payers = Object.keys(handlersOf(e)).map(i => memberName(t, i)).join(', ');
  const shares = Object.entries(sharesOf(e)).map(([i, v]) => `${memberName(t, i)} ${money(v, e.currency)}`).join(', ');
  return `<section class="panel pad stack tight"><h3>${esc(title)}</h3><strong class="wrap-any">${esc(e.deleted ? `${e.desc} (deleted)` : e.desc)}</strong><span class="amt">${money(e.total, e.currency)}</span><span class="small muted wrap-any">${e.kind === 'refund' ? 'Received by' : 'Paid by'} ${esc(payers)}</span><span class="small muted wrap-any">${esc(shares)}</span></section>`;
};
function showConflict(t, mine, theirs) {
  A.form.conflict = { mine, theirs };
  openSheet(`<div class="sheet"><div class="sheet-head"><button type="button" class="btn small" data-action="conflict-back">Back</button><h2>Choose a version</h2><div class="sheet-right"></div></div><div class="sheet-body">
    <p>${esc(theirs.updatedBy || 'Someone')} changed this expense while you were editing it. Which version do you want to keep?</p>
    ${versionCard(t, `${theirs.updatedBy || 'Their'} version`.replace(/^(.+) version$/, (m, n) => (n === 'Their' ? 'Their version' : `${n}'s version`)), theirs)}
    ${versionCard(t, 'Your version', mine)}
    <button type="button" class="btn primary" data-action="conflict-mine">Keep my version</button>
    <button type="button" class="btn" data-action="conflict-theirs">Keep their version</button>
    <p class="small muted">The version you don't keep can still be found in the expense's edit history.</p></div></div>`);
}
actions['conflict-back'] = () => { A.form.conflict = null; drawForm(); };
actions['conflict-mine'] = () => {
  const { mine, theirs } = A.form.conflict, t = tripOf();
  commit(t, mine, theirs);
};
actions['conflict-theirs'] = () => {
  const { mine, theirs } = A.form.conflict, t = tripOf();
  closeSheet();
  // Their version stays live. Filing yours lets you find it again if you change your mind.
  send(A.repo.fileVersion(t.id, { ...mine, createdAt: theirs.createdAt }, mine.updatedBy, getMe(t)));
  toast('Kept their version. Yours is in the edit history.');
};
