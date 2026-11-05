/** A short, skippable tour: once at first sign-in, offered after 90 days away, and always behind the question mark. */
import { A, actions, render } from './state.js';
import { closeSheet, getMe, openSheet } from './dom.js';
import { goHome, goTrip } from './routes.js';
import { lookPicker } from './look.js';
import { backAfterAWhile } from '../core/platform.js';

const HOME_STEPS = [
  { home: true, at: '.home-actions .btn.primary', title: 'Start a trip', text: 'Create a trip here, or paste an invite link below to join one. Your trips stay in this list.' },
];
const THEME_TEXT = 'Try one now. You can change it any time from this button.';
const TRIP_STEPS = [
  { tab: 'expenses', at: '.add-tab', title: 'Add what you pay for', text: 'Tap Add expense whenever you pay for something. Enter the amount and a description. It splits equally with everyone unless you tap Change.' },
  { tab: 'expenses', at: '[data-action="open-entry"],[data-action="filters-toggle"]', title: 'See every expense', text: 'Each one shows who paid and what you owe or get. Search or filter to find things, and press and hold one for quick actions.' },
  { tab: 'balances', at: '.hero', title: 'Settle up', text: 'Balances shows who pays whom. Pay with Venmo or Zelle, then mark it as paid so everyone can see.' },
  { tab: 'people', sub: 'payment', at: 'input[aria-label*="Venmo"]:not([disabled])', title: 'Add your Venmo or Zelle', text: 'Add your details here so friends can pay you back easily.' },
  { tab: 'people', sub: 'invite', at: '#inviteLink', title: 'Invite friends', text: 'Share this link. Friends sign in, then pick their name.' },
];
const THEME_STEP = { theme: true, tab: 'expenses', at: '.topbar [data-action="edit-avatar"]', title: 'Change your theme', text: THEME_TEXT };
const HOME_THEME_STEP = { theme: true, home: true, at: '[data-action="home-theme"]', title: 'Change your theme', text: THEME_TEXT };

function buildSteps() {
  if (A.route.name === 'trip') return [...TRIP_STEPS.map(s => ({ ...s, trip: A.route.tripId })), { ...THEME_STEP, trip: A.route.tripId }];
  const first = Object.values(A.trips).find(t => !t.deletedAt && !t.retiredAt && getMe(t));
  return first
    ? [...HOME_STEPS, ...TRIP_STEPS.map(s => ({ ...s, trip: first.id })), { ...THEME_STEP, trip: first.id }]
    : [...HOME_STEPS, HOME_THEME_STEP];
}

/** Puts the highlight over the step's target, and the card wherever it doesn't cover it. */
export function placeTour() {
  const layer = document.getElementById('tourLayer');
  if (!layer || !A.tour) return;
  const step = A.tour.steps[A.tour.i], spot = layer.querySelector('.tour-spot'), card = layer.querySelector('.tour-card');
  if (!spot || !card) return; // the screen can draw before this step's card exists
  // Targets are in order of preference: the first one on screen wins.
  const el = step.at.split(',').flatMap(at => [...document.querySelectorAll(at)]).find(n => n.offsetParent !== null);
  if (!el) { spot.hidden = true; card.dataset.place = 'bottom'; return; }
  const before = el.getBoundingClientRect();
  if (before.top < 70 || before.bottom > innerHeight - 90) el.scrollIntoView({ block: 'center' });
  const r = el.getBoundingClientRect(), pad = 6;
  spot.hidden = false;
  Object.assign(spot.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${Math.min(r.height, innerHeight * 0.4) + pad * 2}px` });
  card.dataset.place = r.top + r.height / 2 > innerHeight / 2 ? 'top' : 'bottom';
}

function showStep(i) {
  const { steps } = A.tour, step = steps[i], last = i === steps.length - 1;
  A.tour.i = i;
  if (step.sub) A.peopleTab = step.sub;
  if (step.home) { if (A.route.name !== 'home') goHome(); else render(); } else goTrip(step.trip, step.tab);
  document.getElementById('tourLayer').innerHTML = `<div class="tour-spot" hidden></div>
    <div class="tour-card" id="tour" role="dialog" aria-label="Tutorial" data-place="bottom"><p class="tiny muted">${i + 1} of ${steps.length}</p><h2>${step.title}</h2><p>${step.text}</p>
    ${step.theme ? lookPicker() : ''}
    <div class="tour-nav">${i ? `<button type="button" class="btn" data-action="tour-step" data-id="${i - 1}">Back</button>` : ''}<button type="button" class="btn primary" ${last ? 'data-action="tour-close"' : `data-action="tour-step" data-id="${i + 1}"`}>${last ? 'Get started' : 'Next'}</button></div>
    ${last ? '' : '<button type="button" class="link small" data-action="tour-close" id="tourSkip">Skip: I know what I\'m doing</button>'}</div>`;
  placeTour();
  setTimeout(placeTour, 80); // once the new screen has drawn
}
// Changing the theme or turning the phone moves things, so the highlight follows.
const replace = () => { if (A.tour) setTimeout(placeTour, 60); };
addEventListener('resize', replace);
addEventListener('click', replace);

export function startTour() {
  closeSheet();
  A.tour = { steps: buildSteps(), i: 0, from: A.route.name === 'trip' ? A.route.tab : null };
  let layer = document.getElementById('tourLayer');
  if (!layer) { layer = document.createElement('div'); layer.id = 'tourLayer'; document.body.append(layer); }
  showStep(0);
}
function endTour() {
  document.getElementById('tourLayer')?.remove();
  const { from, steps } = A.tour, wasIn = steps.find(s => s.trip)?.trip;
  A.tour = null;
  if (from && wasIn) goTrip(wasIn, from); else if (wasIn) goTrip(wasIn, 'expenses');
  else render();
}

const HOLD_MS = 500;

/** The small question mark in the top bar. Hovering or holding it says Tutorial, and tapping it starts the tour. */
export const helpButton = () => `<button class="icon-btn help-btn" data-action="tour-start" aria-label="Tutorial" data-tip="Tutorial">?</button>`;

const DAY_MS = 86400000;
let markedAt = 0;

/**
 * Shows the tour the first time someone signs in on this device, and asks whether they'd
 * like it again if they've been away over 90 days. Waits until they've picked their name on a trip.
 */
export function maybeStartTour() {
  const trip = A.route.name === 'trip' ? A.trips[A.route.tripId] : null;
  if (!A.user?.verified || A.route.name === 'owner' || (A.route.name === 'trip' && !(trip && getMe(trip)))) return;
  const now = Date.now();
  if (A.returning === undefined) A.returning = backAfterAWhile(A.device.lastSeen(), now); // before this visit counts
  if (now - markedAt > DAY_MS) { markedAt = now; A.device.markSeen(now); } // a day's accuracy is plenty
  if (A.tour || document.getElementById('dlg').open) return;
  if (!A.device.tourDone()) { A.returning = false; A.device.setTourDone(); setTimeout(startTour); return; }
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
actions['tour-step'] = el => showStep(+el.dataset.id);
actions['tour-close'] = () => endTour();
actions['tour-start'] = () => startTour();
