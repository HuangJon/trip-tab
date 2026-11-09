/** Small shared helpers for building and updating the page. */
import { A, render } from './state.js';
import { canEditEntry, displayColors, isAdminId, memberName } from '../core/model.js';
import { AVATAR_COLORS } from '../config/app.js';
import { avatarArt } from './avatars.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const svg = paths => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
export const val = id => document.getElementById(id)?.value ?? '';

export const ICON = {
  home: '<path d="M4 11l8-7 8 7M6.500 9.500V20h11V9.500M10 20v-5.500h4V20"/>', theme: '<circle cx="12" cy="12" r="8.500"/><path d="M12 3.500a8.500 8.500 0 0 1 0 17z" fill="currentColor"/>', gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.600 5.600l2.100 2.100M16.300 16.300l2.100 2.100M18.400 5.600l-2.100 2.100M7.700 16.300l-2.100 2.100"/>', check: '<path d="M5 12.500l4.500 4.500L19 7.500"/>', plus: '<path d="M12 5v14M5 12h14"/>', back: '<path d="M15 5l-7 7 7 7"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  scale: '<path d="M12 3v18M7 21h10M4 7h16M6.5 7L3 14a3.5 3.5 0 0 0 7 0zM17.500 7L14 14a3.500 3.500 0 0 0 7 0z"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  more: '<circle cx="5" cy="12" r="1.400"/><circle cx="12" cy="12" r="1.400"/><circle cx="19" cy="12" r="1.400"/>',
  people: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-3.800 3.500-5.500 7-5.500s6.200 1.700 7 5.500"/>', swap: '<path d="M4 8h14l-4-4M20 16H6l4 4"/>',
};
export const CAT_ICON = {
  food: '<path d="M7 3v8a2 2 0 0 0 2 2v8M5 3v5M9 3v5M17 3c-2 1-3 4-3 7 0 2 1 3 3 3v8"/>',
  drinks: '<path d="M6 3h12l-1.500 8a4.500 4.500 0 0 1-9 0zM12 15.500V21M8 21h8"/>',
  lodging: '<path d="M3 19V6M3 15h18v4M21 15v-3a3 3 0 0 0-3-3h-7v6"/><circle cx="7" cy="11" r="1.600"/>',
  transport: '<rect x="5" y="3.500" width="14" height="14" rx="3"/><path d="M5 11h14M8 21l1.500-3.500M16 21l-1.500-3.500"/>',
  flights: '<path d="M3 13l18-8-6 16-3-6zM12 15l9-10"/>',
  activities: '<path d="M4 8h16v3a2 2 0 0 0 0 3v3H4v-3a2 2 0 0 0 0-3zM14 8v9"/>',
  groceries: '<path d="M3 4h2l2.500 12h11l2-8H6.500"/><circle cx="9" cy="20" r="1.300"/><circle cx="17" cy="20" r="1.300"/>',
  shopping: '<path d="M5 8h14l1 13H4zM9 8V6a3 3 0 0 1 6 0v2"/>',
  fees: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.500"/>',
  other: '<circle cx="6" cy="12" r="1.300"/><circle cx="12" cy="12" r="1.300"/><circle cx="18" cy="12" r="1.300"/>',
};
export const catIcon = c => svg(CAT_ICON[c] || CAT_ICON.other);

export function avatar(trip, id, large) {
  const name = memberName(trip, id);
  const m = trip.members[id];
  const color = m ? `var(--m${displayColors(trip, AVATAR_COLORS)[id]})` : 'var(--muted)';
  const pic = avatarArt(m?.pic);
  return `<span class="ava ${large ? 'lg' : ''} ${pic ? 'pic' : ''}" style="background:${color}" aria-hidden="true">${pic || esc([...name][0] || '?').toUpperCase()}</span>`;
}

export const getMe = trip => {
  const m = A.device.me(trip.id);
  return m && trip.members[m] && !trip.members[m].removed ? m : null;
};
export const who = (trip, id) => (id && id === getMe(trip) ? 'You' : memberName(trip, id));
export const actor = trip => { const m = getMe(trip); return m ? memberName(trip, m) : 'Someone'; };
export const canWrite = trip => !trip.fromNewerApp;
export const amAdmin = trip => canWrite(trip) && isAdminId(trip, getMe(trip));
export const canEdit = (trip, e) => canWrite(trip) && canEditEntry(trip, e, getMe(trip));

export const fmtDate = d => {
  const x = new Date(`${d}T12:00:00`);
  return Number.isNaN(+x) ? esc(d) : x.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const ago = at => {
  const days = Math.floor((Date.now() - at) / 86400000);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
};

/* ---------- Sheets and messages ---------- */
const sheet = () => document.getElementById('dlg');
const toastEl = () => document.getElementById('toast');
const parkToast = () => { const t = toastEl(); if (t.parentElement !== document.body) document.body.appendChild(t); };

export function openSheet(html) {
  const d = sheet();
  parkToast();
  d.classList.remove('menu');
  d.innerHTML = html;
  if (!d.open) d.showModal();
}
export function closeSheet() {
  const d = sheet();
  A.form = null;
  A.detail = null;
  parkToast();
  if (d.open) d.close();
  d.innerHTML = '';
}
/** Anyone on a trip can add a rate for a new currency; only an admin can change one already set. */
export const canSetRate = (trip, currency) => amAdmin(trip) || !(trip.rates || {})[currency];
export const sheetHead = (title, right = '', left = 'Cancel') => `<div class="sheet-head"><button type="button" class="btn small" data-action="close-sheet">${left}</button><h2>${esc(title)}</h2><div class="sheet-right">${right}</div></div>`;

let toastTimer;
export function toast(message, undo) {
  const el = toastEl(), d = sheet();
  el.innerHTML = `<span>${esc(message)}</span>${undo ? '<button type="button" data-action="undo">Undo</button>' : ''}`;
  el.hidden = false;
  A.undo = undo || null;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; A.undo = null; }, undo ? 7000 : 3500);
  if (d.open) d.appendChild(el); else parkToast();
}

/** Runs a write without waiting. Offline writes stay open until reconnecting, so only failure is reported. */
export function send(promise, label = 'A change') {
  promise.catch(e => {
    let why = "That change didn't save. Check your connection and try again.";
    if (e?.code === 'permission-denied') why = "That change was refused. Check that you're on the latest version.";
    else if (e?.name === 'QuotaExceededError') why = 'This device is out of storage for the preview. Remove a photo or trip.';
    else if (e?.code === 'resource-exhausted') why = 'The free database limit is used up for now. Changes will work again after it resets.';
    toast(why);
    A.logProblem?.('failed-save', `${label}: ${e?.code || e?.name || 'unknown'}`);
    A.device.addFailedChange(`${label} didn't save. ${why}`);
    render();
  });
}
/** Actions need a name to credit. People pick theirs on the trip, with no account. */
export function requireMe(trip) {
  if (getMe(trip)) return true;
  closeSheet();
  scrollTo(0, 0);
  toast('Choose your name at the top first, so friends can see who did this.');
  return false;
}

export async function copyText(text, fallbackId) {
  try { await navigator.clipboard.writeText(text); toast('Copied'); return true; } catch {
    const el = fallbackId && document.getElementById(fallbackId);
    if (el) {
      const r = document.createRange();
      r.selectNodeContents(el);
      const s = getSelection();
      s.removeAllRanges();
      s.addRange(r);
    }
    toast('Text selected. Copy it from your menu.');
    return false;
  }
}

export function textSheet(title, text, note = '') {
  openSheet(`<div class="sheet">${sheetHead(title, '', 'Close')}<div class="sheet-body">
    <pre class="share" id="shareTxt">${esc(text)}</pre>
    <button type="button" class="btn primary" data-action="copy-sheet-text">Copy text</button>
    ${note ? `<p class="small muted">${esc(note)}</p>` : ''}</div></div>`);
}

/** Saves through the share sheet where available, or a download. Falls back to text to copy. */
export async function saveFile(filename, text, type, onSaved) {
  try {
    const file = new File([text], filename, { type });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file] });
      onSaved?.();
      return;
    }
  } catch (e) {
    if (e?.name === 'AbortError') return;
  }
  if (!A.preview) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    onSaved?.();
    toast(`Saved ${filename}`);
    return;
  }
  textSheet(filename, text, 'File saving is off in this preview. Copy the text instead.');
}
