/** One expense or payment: its details, comments, edit and delete. */
import { A, actions, submits } from './state.js';
import { CATEGORIES, LIMITS } from '../config/app.js';
import { drillFrom, frozen, goBack, actor, amAdmin, avatar, canEdit, canWrite, closeSheet, esc, fmtDate, getMe, openSheet, requireMe, send, sheetHead, toast, val } from './dom.js';
import { money, toMinor } from '../core/money.js';
import { expensePayments, inBase, needsRate, receivedBy } from '../core/debts.js';
import { rateLabel } from '../core/rates.js';
import { handlersOf, memberName, removedNames, sharesOf } from '../core/model.js';
import { duplicateExpense, openExpenseForm } from './expense-form.js';

const rowsOf = (t, e, map) => Object.keys(map).map(i => `<div class="row between">${avatar(t, i)}<span class="grow wrap-any">${esc(memberName(t, i))}</span><span class="amt">${money(map[i], e.currency)}</span></div>`).join('');

function credit(t, e) {
  const when = at => new Date(at).toLocaleDateString('en', { month: 'short', day: 'numeric' });
  const parts = [];
  if (e.createdById) parts.push(`Added by ${esc(memberName(t, e.createdById))}${e.createdAt ? ` on ${when(e.createdAt)}` : ''}`);
  if (e.updatedBy && e.updatedAt !== e.createdAt) parts.push(`Last changed by ${esc(e.updatedBy)} on ${when(e.updatedAt)}`);
  return parts.join(' · ');
}

/** Who pays whom for this one expense, so a split with several payers is plain to read. */
function squares(t, e) {
  const pays = expensePayments(handlersOf(e), sharesOf(e), e.currency);
  if (!pays.length) return '';
  const name = id => (id === getMe(t) ? 'You' : memberName(t, id));
  return `<section class="panel pad stack"><h3>Who pays whom</h3>${pays.map(p => `<div class="row between">${avatar(t, p.from)}<span class="grow wrap-any">${esc(name(p.from))} ${p.from === getMe(t) ? 'pay' : 'pays'} ${esc(name(p.to))}</span><span class="amt">${money(p.amount, e.currency)}</span></div>`).join('')}${Object.entries(receivedBy(pays)).map(([id, v]) => `<div class="row between squares-got">${avatar(t, id)}<span class="grow wrap-any">${esc(name(id))} ${id === getMe(t) ? 'receive' : 'receives'}</span><span class="amt good">${money(v, e.currency)}</span></div>`).join('')}<p class="tiny muted">For this ${e.kind === 'refund' ? 'refund' : 'expense'} alone. Balances adds it up with the rest of the trip.</p></section>`;
}

export function openDetail(id, { keepTyped } = {}) {
  const t = A.trips[A.route.tripId], e = A.entries[t.id]?.[id];
  if (!e) return closeSheet();
  A.detail = id;
  const typed = keepTyped ? val('cText') : '';
  const pay = e.kind === 'payment', refund = e.kind === 'refund', foreign = e.currency !== t.currency, write = canWrite(t), editable = canEdit(t, e);
  const comments = Object.entries(e.comments || {}).map(([cid, c]) => ({ ...c, cid })).filter(c => !c.removed).sort((a, b) => a.at - b.at);
  const items = e.split?.mode === 'items' ? e.split.items || [] : [];
  openSheet(`<div class="sheet">${sheetHead(pay ? 'Payment' : refund ? 'Refund' : 'Expense', editable && !pay && !e.deleted ? `<button type="button" class="btn small" data-action="edit-entry" data-id="${id}">Edit</button>` : '', 'Close')}
  <div class="sheet-body">
    <div class="stack tight"><h1 class="detail-title">${esc(pay ? `${memberName(t, Object.keys(e.paid)[0])} paid ${memberName(t, Object.keys(e.owed)[0])}` : e.desc)}</h1><div class="big">${money(e.total, e.currency)}</div>
    ${foreign ? (needsRate(e, t.currency) ? `<p><span class="tag warn">Needs an exchange rate</span> <span class="small muted">Not in balances yet.</span></p>` : `<p class="small muted mono">≈ ${money(inBase(e, t.currency).total, t.currency)} at ${esc(rateLabel(e.quotedRate || e.rate, e.currency, t.currency))}</p>`) : ''}
    <p class="small muted">${fmtDate(e.date)}${pay ? '' : ` · ${esc(CATEGORIES[e.category] || 'Other')}`}</p></div>
    <p class="small muted wrap-any">${credit(t, e)}</p>
    ${A.pending[t.id]?.includes(id) ? '<p><span class="tag">Waiting to sync</span> <span class="small muted">Friends can\'t see this until your phone is back online.</span></p>' : ''}
    ${pay && e.method ? `<p class="small muted">Paid ${({ venmo: 'by Venmo', zelle: 'by Zelle', cash: 'in cash' })[e.method] || 'another way'}</p>` : ''}
    ${e.note ? `<p class="wrap-any">${esc(e.note)}</p>` : ''}
    ${e.receipt ? '<div id="receiptSlot" class="small muted">Loading the receipt photo…</div>' : ''}
    ${pay ? '' : `<section class="panel pad stack"><h3>${refund ? 'Received by' : 'Paid by'}</h3>${rowsOf(t, e, handlersOf(e))}</section><section class="panel pad stack"><h3>${refund ? 'Shared by' : 'Split among'}</h3>${rowsOf(t, e, sharesOf(e))}</section>${squares(t, e)}`}
    ${items.length ? `<section class="panel pad stack"><h3>Items</h3>${items.map(it => `<div class="row between small"><span class="grow wrap-any">${esc(it.name || 'Item')} <span class="muted">· ${(it.people || []).map(i => esc(memberName(t, i))).join(', ')}</span></span><span class="amt">${money(toMinor(it.amount, e.currency), e.currency)}</span></div>`).join('')}</section>` : ''}
    <section class="stack"><h3>Comments</h3>${comments.map(c => `<div class="comment"><div class="row between"><strong class="small">${esc(c.byId ? memberName(t, c.byId) : c.by)}</strong>${c.byId && c.byId === getMe(t) && !e.deleted ? `<span class="row tight"><button type="button" class="link small" data-action="comment-edit" data-id="${esc(c.cid)}">Edit</button><button type="button" class="link small" data-action="comment-remove" data-id="${esc(c.cid)}">Delete</button></span>` : ''}</div>${A.commentEdit === c.cid ? `<form class="row" data-form="comment-save" data-id="${esc(c.cid)}"><input id="cEdit" aria-label="Edit comment" required maxlength="${LIMITS.comment}" value="${esc(c.text)}"><button class="btn">Save</button></form>` : `${esc(c.text)}${c.editedAt ? ' <span class="tiny muted">(edited)</span>' : ''}`}</div>`).join('') || '<p class="small muted">No comments yet.</p>'}
      ${write && !e.deleted ? `<form class="row" data-form="comment" data-id="${id}"><input id="cText" placeholder="Add a comment" aria-label="Comment" required maxlength="${LIMITS.comment}" value="${esc(typed)}"><button class="btn">Post</button></form>` : ''}</section>
    ${pay ? '' : `<section class="stack"><h3>Edit history</h3><div id="historySlot" class="stack"><button type="button" class="link small" data-action="history-show" data-id="${id}">See earlier versions</button></div></section>`}
    ${write && !pay && !e.deleted && !t.settling ? `<button type="button" class="btn" data-action="duplicate-entry" data-id="${id}">Duplicate</button>` : ''}
    ${editable ? '' : frozen(t, e) ? '<p class="small muted">Expenses are closed while everyone settles up. You can still leave a comment.</p>' : '<p class="small muted">Only the person who added or paid for this, or the trip\'s admin, can change it. You can leave a comment.</p>'}
    ${editable ? (e.deleted ? `<button type="button" class="btn" data-action="restore-entry" data-id="${id}">Restore</button>` : `<button type="button" class="btn danger" data-action="delete-entry" data-id="${id}">Delete ${pay ? 'payment' : refund ? 'refund' : 'expense'}</button>`) : ''}
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
    const write = canEdit(t, A.entries[t.id][id]);
    el.innerHTML = revisions.length ? revisions.map((r, i) => `<div class="panel pad stack tight"><div class="row between wrap"><strong class="wrap-any">${esc(r.entry.desc)}</strong><span class="amt">${money(r.entry.total, r.entry.currency)}</span></div>
      <span class="small muted wrap-any">${r.entry.kind === 'refund' ? 'Received by' : 'Paid by'} ${esc(Object.keys(handlersOf(r.entry)).map(p => memberName(t, p)).join(', '))} · ${esc(Object.entries(sharesOf(r.entry)).map(([p, v]) => `${memberName(t, p)} ${money(v, r.entry.currency)}`).join(', '))}</span>
      <span class="tiny muted">Replaced by ${esc(r.by)}, ${new Date(r.at).toLocaleString('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
      ${write ? `<div><button type="button" class="btn small" data-action="history-restore" data-i="${i}">Restore this version</button></div>` : ''}</div>`).join('')
      : '<p class="small muted">This expense hasn\'t been edited.</p>';
  } catch { const el = slot(); if (el) el.textContent = 'Earlier versions need a connection to load.'; }
}
/**
 * Restoring an expense that includes a removed name puts that name back on the trip, so the balances
 * still add up. Only an admin can do that, so anyone else is asked to get an admin to restore it.
 */
function bringBackNames(t, e) {
  const gone = removedNames(t, e);
  if (!gone.length) return true;
  const names = gone.map(id => memberName(t, id)).join(', ');
  if (!amAdmin(t)) { toast(`This includes ${names}, who was removed from the trip. Ask the trip's admin to restore it.`); return false; }
  send(A.repo.updateTrip(t.id, Object.fromEntries(gone.map(id => [`members.${id}.removed`, false])), getMe(t)), 'Bringing that name back');
  return names;
}
actions['history-show'] = el => loadHistory(A.trips[A.route.tripId], el.dataset.id);
actions['history-restore'] = el => {
  const t = A.trips[A.route.tripId], rev = revisions[+el.dataset.i];
  if (!rev) return;
  const current = A.entries[t.id][rev.entryId], name = actor(t);
  const entry = { ...rev.entry, deleted: false, updatedAt: Date.now(), updatedBy: name };
  if (!bringBackNames(t, entry)) return;
  closeSheet();
  A.historyFor = null;
  send(A.repo.saveEntry(t, entry, { isNew: false, previous: current, actor: name, actorId: getMe(t), label: `restored an earlier version of "${entry.desc}"` }));
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
  const back = deleted || bringBackNames(t, e);
  if (!back) return;
  closeSheet();
  send(A.repo.setEntryDeleted(t, id, deleted, actor(t), name, getMe(t)));
  toast(deleted ? 'Deleted' : typeof back === 'string' ? `Restored. ${back} is back on the trip.` : 'Restored', deleted ? () => setDeleted(id, false) : null);
}
actions['open-entry'] = el => {
  if (document.getElementById('ledger') && A.ledgerFor) { const who = A.ledgerFor; drillFrom(() => actions['person-ledger']({ dataset: { id: who } })); }
  openDetail(el.dataset.id);
};
actions['sheet-back'] = () => goBack();
const drillTo = (el, open) => {
  const t = A.trips[A.route.tripId], id = el.dataset.id;
  if (!requireMe(t)) return;
  if (A.detail === id) drillFrom(() => openDetail(id)); // from the details, not from the press-and-hold menu
  open(t, A.entries[t.id][id]);
};
actions['edit-entry'] = el => drillTo(el, openExpenseForm);
actions['duplicate-entry'] = el => drillTo(el, duplicateExpense);
actions['delete-entry'] = el => { if (requireMe(A.trips[A.route.tripId])) setDeleted(el.dataset.id, true); };
actions['restore-entry'] = el => setDeleted(el.dataset.id, false);
actions['close-sheet'] = () => closeSheet();
actions.undo = () => {
  const u = A.undo;
  document.getElementById('toast').hidden = true;
  A.undo = null;
  u?.();
};
actions['comment-edit'] = el => { A.commentEdit = el.dataset.id; openDetail(A.detail, { keepTyped: true }); document.getElementById('cEdit')?.focus(); };
submits['comment-save'] = form => {
  const t = A.trips[A.route.tripId], e = A.entries[t.id][A.detail], text = val('cEdit').trim();
  A.commentEdit = null;
  if (text && requireMe(t)) send(A.repo.changeComment(t, e, form.dataset.id, { text }, getMe(t)), 'That comment');
  openDetail(A.detail);
};
actions['comment-remove'] = el => {
  const t = A.trips[A.route.tripId], e = A.entries[t.id][A.detail], cid = el.dataset.id;
  if (!requireMe(t)) return;
  send(A.repo.changeComment(t, e, cid, { removed: true }, getMe(t)), 'Deleting that comment');
  toast('Comment deleted', () => send(A.repo.changeComment(t, A.entries[t.id][A.detail] || e, cid, { removed: false }, getMe(t)), 'That comment'));
};
submits.comment = form => {
  const t = A.trips[A.route.tripId], e = A.entries[t.id][form.dataset.id], text = val('cText').trim();
  if (!text || !requireMe(t)) return;
  send(A.repo.addComment(t, e, actor(t), text, getMe(t)));
  document.getElementById('cText').value = '';
};
