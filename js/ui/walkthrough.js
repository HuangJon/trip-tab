/** A short, skippable tour: once at first sign-in, offered after 90 days away, and always behind the question mark. */
import { A, actions } from './state.js';
import { ICON, closeSheet, getMe, openSheet, svg } from './dom.js';
import { backAfterAWhile } from '../core/platform.js';

const STEPS = [
  ['plus', 'Add what you pay for', 'Tap Add expense whenever you pay for something. Enter the amount and a description. It splits equally with everyone unless you tap Change.'],
  ['list', 'See every expense', 'Expenses shows who paid and what you owe or get on each one. Search or filter to find things, and press and hold one for quick actions.'],
  ['scale', 'Settle up', 'Balances shows who pays whom in the fewest payments. Pay outside the app with Venmo or Zelle, then mark it as paid so everyone sees it.'],
  ['people', 'Add your Venmo or Zelle', 'Under People, the Payment tab holds your details, so friends can pay you back easily. Invite has the link to share.'],
  ['more', 'Make it yours', 'Tap your icon at the top right to choose a theme, a color and a picture. Trip settings are there too.'],
];

function drawStep(i) {
  const [icon, title, text] = STEPS[i], last = i === STEPS.length - 1;
  openSheet(`<div class="tour" id="tour"><div class="tour-icon">${svg(ICON[icon])}</div><p class="tiny muted">${i + 1} of ${STEPS.length}</p><h2>${title}</h2><p>${text}</p>
    <div class="tour-nav">${i ? `<button type="button" class="btn" data-action="tour-step" data-id="${i - 1}">Back</button>` : ''}<button type="button" class="btn primary" ${last ? 'data-action="close-sheet"' : `data-action="tour-step" data-id="${i + 1}"`}>${last ? 'Get started' : 'Next'}</button></div>
    ${last ? '' : '<button type="button" class="link small" data-action="close-sheet" id="tourSkip">Skip: I know what I\'m doing</button>'}</div>`);
  document.getElementById('dlg').classList.add('menu');
}
export function startTour() { drawStep(0); }

const HOLD_MS = 500;

/** The small question mark in the top bar. Hovering or holding it says Tutorial, and tapping it starts the tour. */
export const helpButton = () => `<button class="icon-btn help-btn" data-action="tour-start" aria-label="Tutorial" data-tip="Tutorial">?</button>`;

/**
 * Shows the tour the first time someone signs in on this device, and asks whether they'd
 * like it again if they've been away over 90 days. Waits until they've picked their name on a trip.
 */
export function maybeStartTour() {
  const trip = A.route.name === 'trip' ? A.trips[A.route.tripId] : null;
  if (!A.user?.verified || A.route.name === 'owner' || (A.route.name === 'trip' && !(trip && getMe(trip)))) return;
  const now = Date.now();
  if (A.returning === undefined) A.returning = backAfterAWhile(A.device.lastSeen(), now); // before this visit counts
  A.device.markSeen(now);
  if (document.getElementById('dlg').open) return;
  if (!A.device.tourDone()) { A.returning = false; A.device.setTourDone(); startTour(); return; }
  if (!A.returning) return;
  A.returning = false;
  openSheet(`<div class="tour" id="tourAsk"><h2>Welcome back!</h2><p>It's been a while. Would you like a quick walkthrough?</p><div class="tour-nav"><button type="button" class="btn" data-action="close-sheet">No thanks</button><button type="button" class="btn primary" data-action="tour-start">Show me</button></div></div>`);
  document.getElementById('dlg').classList.add('menu');
}

/** Long press shows the label on a phone, and doesn't also start the tour. */
export function setUpHelpButton() {
  let timer = null, held = false;
  const btnAt = t => t.closest?.('.help-btn');
  const clearTips = () => document.querySelectorAll('.help-btn.show-tip').forEach(b => b.classList.remove('show-tip'));
  document.addEventListener('pointerdown', ev => {
    held = false;
    const b = btnAt(ev.target);
    if (!b || ev.pointerType === 'mouse') return;
    timer = setTimeout(() => { held = true; b.classList.add('show-tip'); setTimeout(clearTips, 1500); }, HOLD_MS);
  });
  for (const e of ['pointerup', 'pointercancel']) document.addEventListener(e, () => clearTimeout(timer));
  document.addEventListener('contextmenu', ev => { if (btnAt(ev.target)) ev.preventDefault(); });
  document.addEventListener('click', ev => {
    if (held && btnAt(ev.target)) { ev.stopPropagation(); ev.preventDefault(); }
    held = false;
  }, true);
}
actions['tour-step'] = el => drawStep(+el.dataset.id);
actions['tour-start'] = () => { closeSheet(); startTour(); };
