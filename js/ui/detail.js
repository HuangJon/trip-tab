/** One expense or payment: its details, comments, edit and delete. */
import { A, actions, submits } from './state.js';
import { CATEGORIES, LIMITS } from '../config/app.js';
import { actor, avatar, canWrite, closeSheet, esc, fmtDate, openSheet, send, sheetHead, toast, val } from './dom.js';
import { money, toMinor } from '../core/money.js';
import { inBase } from '../core/debts.js';
import { memberName } from '../core/model.js';
import { openExpenseForm } from './expense-form.js';

const rowsOf = (t, e, map) => Object.keys(map).map(i => `<div class="row between">${avatar(t, i)}<span class="grow wrap-any">${esc(memberName(t, i))}</span><span class="amt">${money(map[i], e.currency)}</span></div>`).join('');

export function openDetail(id, { keepTyped } = {}) {
  const t = A.trips[A.route.tripId], e = A.entries[t.id]?.[id];
  if (!e) return closeSheet();
  A.detail = id;
  const typed = keepTyped ? val('cText') : '';
  const pay = e.kind === 'payment', foreign = e.currency !== t.currency, write = canWrite(t);
  const comments = Object.values(e.comments || {}).sort((a, b) => a.at - b.at);
  const items = e.split?.mode === 'items' ? e.split.items || [] : [];
  openSheet(`<div class="sheet">${sheetHead(pay ? 'Payment' : 'Expense', write && !pay && !e.deleted ? `<button type="button" class="btn small" data-action="edit-entry" data-id="${id}">Edit</button>` : '', 'Close')}
  <div class="sheet-body">
    <div class="stack tight"><h1 class="detail-title">${esc(pay ? `${memberName(t, Object.keys(e.paid)[0])} paid ${memberName(t, Object.keys(e.owed)[0])}` : e.desc)}</h1><div class="big">${money(e.total, e.currency)}</div>
    ${foreign ? `<p class="small muted mono">≈ ${money(inBase(e, t.currency).total, t.currency)} at ${esc(e.rate)}</p>` : ''}
    <p class="small muted">${fmtDate(e.date)}${pay ? '' : ` · ${esc(CATEGORIES[e.category] || 'Other')}`}</p></div>
    ${e.note ? `<p class="wrap-any">${esc(e.note)}</p>` : ''}
    ${e.receipt ? '<div id="receiptSlot" class="small muted">Loading the receipt photo…</div>' : ''}
    ${pay ? '' : `<section class="panel pad stack"><h3>Paid by</h3>${rowsOf(t, e, e.paid)}</section><section class="panel pad stack"><h3>Split between</h3>${rowsOf(t, e, e.owed)}</section>`}
    ${items.length ? `<section class="panel pad stack"><h3>Items</h3>${items.map(it => `<div class="row between small"><span class="grow wrap-any">${esc(it.name || 'Item')} <span class="muted">· ${(it.people || []).map(i => esc(memberName(t, i))).join(', ')}</span></span><span class="amt">${money(toMinor(it.amount, e.currency), e.currency)}</span></div>`).join('')}</section>` : ''}
    <section class="stack"><h3>Comments</h3>${comments.map(c => `<div class="comment"><strong class="small">${esc(c.by)}</strong><br>${esc(c.text)}</div>`).join('') || '<p class="small muted">No comments yet.</p>'}
      ${write && !e.deleted ? `<form class="row" data-form="comment" data-id="${id}"><input id="cText" placeholder="Add a comment" aria-label="Comment" required maxlength="${LIMITS.comment}" value="${esc(typed)}"><button class="btn">Post</button></form>` : ''}</section>
    ${pay ? '' : `<section class="stack"><h3>Edit history</h3><div id="historySlot" class="stack"><button type="button" class="link small" data-action="history-show" data-id="${id}">See earlier versions</button></div></section>`}
    ${write ? (e.deleted ? `<button type="button" class="btn" data-action="restore-entry" data-id="${id}">Restore</button>` : `<button type="button" class="btn danger" data-action="delete-entry" data-id="${id}">Delete ${pay ? 'payment' : 'expense'}</button>`) : ''}
  </div></div>`);
  if (e.receipt) loadReceipt(t.id, e);
  if (A.historyFor === id) loadHistory(t, id);
  else A.historyFor = null;
  return undefined;
}

let revisions = [];
async function loadHistory(t, id) {
  A.historyFor = id;
  const slot = () => document.getElementById('historySlot');
  try {
    revisions = await A.repo.listRevisions(t.id, id);
    const el = slot();
    if (!el) return;
    const write = canWrite(t);
    el.innerHTML = revisions.length ? revisions.map((r, i) => `<div class="panel pad stack tight"><div class="row between wrap"><strong class="wrap-any">${esc(r.entry.desc)}</strong><span class="amt">${money(r.entry.total, r.entry.currency)}</span></div>
      <span class="small muted wrap-any">Paid by ${esc(Object.keys(r.entry.paid).map(p => memberName(t, p)).join(', '))} · ${esc(Object.entries(r.entry.owed).map(([p, v]) => `${memberName(t, p)} ${money(v, r.entry.currency)}`).join(', '))}</span>
      <span class="tiny muted">Replaced by ${esc(r.by)}, ${new Date(r.at).toLocaleString('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
      ${write ? `<div><button type="button" class="btn small" data-action="history-restore" data-i="${i}">Restore this version</button></div>` : ''}</div>`).join('')
      : '<p class="small muted">This expense hasn\'t been edited.</p>';
  } catch { const el = slot(); if (el) el.textContent = 'Earlier versions need a connection to load.'; }
}
actions['history-show'] = el => loadHistory(A.trips[A.route.tripId], el.dataset.id);
actions['history-restore'] = el => {
  const t = A.trips[A.route.tripId], rev = revisions[+el.dataset.i];
  if (!rev) return;
  const current = A.entries[t.id][rev.entryId], name = actor(t);
  const entry = { ...rev.entry, deleted: false, updatedAt: Date.now(), updatedBy: name };
  closeSheet();
  A.historyFor = null;
  send(A.repo.saveEntry(t, entry, { isNew: false, previous: current, actor: name, label: `restored an earlier version of "${entry.desc}"` }));
  toast('Earlier version restored');
};

async function loadReceipt(tripId, e) {
  const slot = () => document.getElementById('receiptSlot');
  try {
    const r = await A.repo.getReceipt(tripId, e.receipt);
    const el = slot();
    if (!el) return;
    if (r?.dataUrl?.startsWith('data:image/jpeg;base64,')) {
      el.innerHTML = `<img class="receipt" src="${esc(r.dataUrl)}" alt="Receipt for ${esc(e.desc)}">`;
    } else el.textContent = "This receipt photo hasn't finished uploading.";
  } catch { const el = slot(); if (el) el.textContent = 'The receipt photo needs a connection to load.'; }
}

function setDeleted(id, deleted) {
  const t = A.trips[A.route.tripId], e = A.entries[t.id][id];
  const name = e.kind === 'payment' ? 'a settlement' : `"${e.desc}"`;
  closeSheet();
  send(A.repo.setEntryDeleted(t, id, deleted, actor(t), name));
  toast(deleted ? 'Deleted' : 'Restored', deleted ? () => setDeleted(id, false) : null);
}
actions['open-entry'] = el => openDetail(el.dataset.id);
actions['edit-entry'] = el => { const t = A.trips[A.route.tripId]; openExpenseForm(t, A.entries[t.id][el.dataset.id]); };
actions['delete-entry'] = el => setDeleted(el.dataset.id, true);
actions['restore-entry'] = el => setDeleted(el.dataset.id, false);
actions['close-sheet'] = () => closeSheet();
actions.undo = () => {
  const u = A.undo;
  document.getElementById('toast').hidden = true;
  A.undo = null;
  u?.();
};
submits.comment = form => {
  const t = A.trips[A.route.tripId], e = A.entries[t.id][form.dataset.id], text = val('cText').trim();
  if (!text) return;
  send(A.repo.addComment(t, e, actor(t), text));
  document.getElementById('cText').value = '';
};
