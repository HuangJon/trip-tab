/**
 * Long-press an expense on a phone, or right-click it on a computer, for quick actions. It only
 * offers what this person may do. Everything here can still be done by opening the expense, so
 * nobody has to discover this to use the app.
 */
import { A } from './state.js';
import { canEdit, esc, openSheet } from './dom.js';
import { money } from '../core/money.js';

const HOLD_MS = 500, MOVE_LIMIT = 10;
const rowAt = target => target.closest?.('.tap[data-action="open-entry"]');

export function openRowMenu(id) {
  const trip = A.trips[A.route.tripId], e = A.entries[trip?.id]?.[id];
  if (!e) return;
  const editable = canEdit(trip, e), pay = e.kind === 'payment';
  const noun = pay ? 'payment' : e.kind === 'refund' ? 'refund' : 'expense';
  const item = (action, label, extra = '') => `<button type="button" class="menu-item ${extra}" data-action="${action}" data-id="${esc(id)}">${label}</button>`;
  openSheet(`<div class="menu-sheet" id="rowMenu"><div class="menu-title"><strong class="wrap-any">${esc(pay ? 'Settlement' : e.desc)}</strong><span class="amt small">${money(e.total, e.currency)}</span></div>
    ${item('open-entry', 'View details')}
    ${editable && !pay ? item('edit-entry', `Edit ${noun}`) : ''}
    ${!pay ? item('duplicate-entry', 'Duplicate') : ''}
    ${editable ? item('delete-entry', `Delete ${noun}`, 'danger-item') : ''}
    ${editable ? '' : '<p class="tiny muted menu-note">Only the person who added or paid for this, or the trip\'s admin, can change it.</p>'}
    <button type="button" class="menu-item cancel-item" data-action="close-sheet">Cancel</button></div>`);
  document.getElementById('dlg').classList.add('menu');
}

export function setUpRowMenu() {
  let timer = null, startX = 0, startY = 0, fired = false;
  const stop = () => { clearTimeout(timer); timer = null; };
  document.addEventListener('pointerdown', ev => {
    fired = false;
    const row = rowAt(ev.target);
    if (!row || ev.pointerType === 'mouse') return;
    startX = ev.clientX;
    startY = ev.clientY;
    stop();
    timer = setTimeout(() => {
      fired = true;
      try { navigator.vibrate?.(10); } catch { /* optional */ }
      openRowMenu(row.dataset.id);
    }, HOLD_MS);
  });
  document.addEventListener('pointermove', ev => {
    if (timer && Math.hypot(ev.clientX - startX, ev.clientY - startY) > MOVE_LIMIT) stop();
  });
  document.addEventListener('pointerup', stop);
  document.addEventListener('pointercancel', stop); // the browser took over to scroll
  // Android also reports a long press as a right-click, so skip it if the menu is already open.
  document.addEventListener('contextmenu', ev => {
    const row = rowAt(ev.target);
    if (!row) return;
    ev.preventDefault();
    stop();
    if (!document.getElementById('dlg').open) { fired = ev.pointerType !== 'mouse' && fired; openRowMenu(row.dataset.id); }
  });
  // Lifting your finger after a long press shouldn't also open the expense.
  document.addEventListener('click', ev => {
    if (fired && rowAt(ev.target)) { ev.stopPropagation(); ev.preventDefault(); }
    fired = false;
  }, true);
}
