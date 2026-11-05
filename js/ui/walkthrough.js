/** A short, skippable tour for someone new. It shows once on this device, and can be replayed from your icon. */
import { A, actions } from './state.js';
import { ICON, closeSheet, getMe, openSheet, svg } from './dom.js';

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

const AWAY_MS = 90 * 86400000;
/** True when someone last opened a trip on this device more than about three months ago. */
export const backAfterAWhile = (lastSeen, now) => Boolean(lastSeen) && now - lastSeen > AWAY_MS;

/** Opens the tour for someone who has just joined, or who hasn't been here in about three months. */
export function maybeStartTour(trip) {
  if (!trip || !getMe(trip)) return;
  const now = Date.now();
  // Checked once per visit, before the visit itself counts as being here.
  if (A.returning === undefined) A.returning = backAfterAWhile(A.device.lastSeen(), now);
  A.device.markSeen(now);
  if (document.getElementById('dlg').open) return;
  const isNew = A.device.needsWelcome(trip.id) && !A.device.tourDone();
  A.device.setNeedsWelcome(trip.id, false);
  if (!isNew && !A.returning) return;
  A.returning = false;
  A.device.setTourDone();
  startTour();
}
actions['tour-step'] = el => drawStep(+el.dataset.id);
actions['tour-start'] = () => { closeSheet(); startTour(); };
