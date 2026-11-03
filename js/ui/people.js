/** People, invite link, trip settings and backups. */
import { A, actions, changes, render, submits } from './state.js';
import { LIMITS } from '../config/app.js';
import { actor, ago, avatar, canWrite, closeSheet, copyText, esc, getMe, openSheet, saveFile, send, sheetHead, toast, val } from './dom.js';
import { activeMembers, isInUse } from '../core/model.js';
import { backupFilename, createBackup, parseBackup } from '../core/backup.js';
import { goHome } from './routes.js';

const inviteUrl = id => `${location.origin}${location.pathname}#join-${id}`;

function backupSection(trip) {
  const last = A.device.lastBackup(trip.id), copies = A.device.snapshots(trip.id);
  const overdue = !last || Date.now() - last > LIMITS.backupNudgeDays * 86400000;
  return `<section class="panel pad stack"><h2>Backups</h2>
    <p class="small ${overdue ? 'nudge' : 'muted'}">${last ? `Last backup from this phone: ${ago(last)}.` : 'No backup from this phone yet.'} Backups include expenses and people, but not receipt photos.</p>
    <div class="row wrap"><button class="btn small" data-action="backup-export">Export file</button><button class="btn small" data-action="backup-import">Import file</button><input id="importFile" type="file" accept=".json,application/json" data-file="import" hidden>
    <button class="btn small" data-action="backup-copy">Copy</button><button class="btn small" data-action="backup-paste">Paste</button></div>
    ${copies.length ? `<div class="stack tight"><span class="flabel">Earlier copies on this phone</span>${copies.map((c, i) => `<div class="row between small"><span>${esc(c.day)} · ${c.backup.entries.length} entries</span><button class="btn small" data-action="restore-copy" data-i="${i}">Restore</button></div>`).join('')}</div>` : ''}
    <p class="tiny muted">Importing and restoring only add or replace entries. They never delete anything.</p></section>`;
}

export function peopleView(trip) {
  const me = getMe(trip), write = canWrite(trip), rates = Object.entries(trip.rates || {}), entries = A.entries[trip.id];
  const members = activeMembers(trip);
  return `<section class="panel pad stack"><h2>Invite friends</h2>
      <p class="small muted">Anyone with this link can see and edit this trip, with no account needed. Share it only with the group.</p>
      <div class="linkbox" id="inviteLink">${esc(inviteUrl(trip.id))}</div>
      <button class="btn primary" data-action="invite">Share invite link</button>
      ${A.preview ? '<p class="tiny muted">In this preview the link only shows what friends will get. It starts working once the app is live.</p>' : ''}</section>
  <section class="panel pad stack"><h2>People on this trip</h2>
    ${members.map(m => `<div class="row">${avatar(trip, m.id)}<input id="mem-${m.id}" aria-label="Name" value="${esc(m.name)}" maxlength="${LIMITS.personName}" data-change="rename" data-id="${m.id}" ${write ? '' : 'disabled'}>
      ${me === m.id ? '<span class="tag you">you</span>' : `<button class="btn small nowrap" data-action="set-me" data-id="${m.id}">This is me</button>`}
      ${write && !isInUse(entries, m.id) && members.length > 1 ? `<button class="x" data-action="remove-member" data-id="${m.id}" aria-label="Remove ${esc(m.name)}">×</button>` : ''}</div>`).join('')}
    ${write ? `<form class="row" data-form="add-member"><input id="newMember" placeholder="Add a name" aria-label="New person's name" required maxlength="${LIMITS.personName}"><button class="btn">Add</button></form>` : ''}
    <p class="tiny muted">People who appear on an expense can't be removed, because the balances would stop adding up.</p></section>
  <section class="panel pad stack"><h2>Trip settings</h2>
    <label class="f"><span>Trip name</span><input id="tripName" value="${esc(trip.name)}" maxlength="${LIMITS.tripName}" data-change="trip-name" ${write ? '' : 'disabled'}></label>
    <div class="row between"><span>Balances are shown in</span><strong class="mono">${esc(trip.currency)}</strong></div>
    <div class="stack tight"><span class="flabel">Saved exchange rates</span>${rates.length ? rates.map(([c, r]) => `<div class="row between small"><span class="mono">1 ${esc(c)}</span><span class="mono">${esc(r)} ${esc(trip.currency)}</span></div>`).join('') : '<p class="small muted">Add an expense in another currency to save a rate.</p>'}</div>
    <div class="row wrap"><button class="btn" data-action="export-csv">Export CSV</button></div></section>
  ${backupSection(trip)}
  <section class="panel pad stack"><h2>Leave or delete</h2>
    ${A.confirm === 'leave' ? `<p class="small">This removes the trip from this phone only. You can come back with the invite link.</p><div class="row wrap"><button class="btn danger" data-action="leave-yes">Remove from this phone</button><button class="btn" data-action="confirm-clear">Keep it</button></div>`
    : A.confirm === 'delete' ? `<p class="small">This hides the trip for everyone. Anyone with the link can restore it.</p><div class="row wrap"><button class="btn danger" data-action="delete-yes">Delete for everyone</button><button class="btn" data-action="confirm-clear">Keep it</button></div>`
    : `<div class="row wrap"><button class="btn" data-action="confirm-leave">Remove from this phone</button>${write ? '<button class="btn danger" data-action="confirm-delete">Delete for everyone</button>' : ''}</div>`}</section>`;
}

/** Shown in place of the trip when it can't be opened. */
export function unavailableView(id) {
  const t = A.trips[id];
  if (t && t.deletedAt) {
    return `<section class="panel empty"><h2>${esc(t.name)} was deleted</h2><p class="muted">Its expenses are still saved. Anyone with the link can bring it back.</p><button class="btn primary" data-action="restore-trip">Restore trip</button><button class="btn" data-action="forget-trip">Remove from this phone</button><button class="link" data-action="home">All trips</button></section>`;
  }
  if (!A.loaded[id]) return '<section class="panel empty"><h2>Opening the trip</h2><p class="muted">If this is your first time opening it, you need a connection.</p><button class="link" data-action="home">All trips</button></section>';
  const copy = A.device.snapshots(id)[0];
  return `<section class="panel empty"><h2>This trip link doesn't work</h2><p class="muted">The trip wasn't found. Ask a friend to send the link again.</p>
    ${copy ? `<button class="btn primary" data-action="rebuild-trip">Rebuild from this phone's copy (${esc(copy.day)})</button>` : ''}
    <button class="btn" data-action="forget-trip">Remove from this phone</button><button class="link" data-action="home">All trips</button></section>`;
}

actions.invite = async () => {
  const t = A.trips[A.route.tripId], url = inviteUrl(t.id);
  try {
    if (navigator.share) { await navigator.share({ title: t.name, text: `Add your expenses for ${t.name}`, url }); return; }
  } catch (e) { if (e?.name === 'AbortError') return; }
  copyText(url, 'inviteLink');
};
actions['remove-member'] = el => { send(A.repo.removeMember(A.route.tripId, el.dataset.id)); };
submits['add-member'] = () => {
  const t = A.trips[A.route.tripId], name = val('newMember').trim().slice(0, LIMITS.personName);
  if (!name) return;
  send(A.repo.addMember(t, name, actor(t)).written);
};
changes.rename = el => { if (el.value.trim()) send(A.repo.renameMember(A.route.tripId, el.dataset.id, el.value.trim().slice(0, LIMITS.personName))); };
changes['trip-name'] = el => { if (el.value.trim()) send(A.repo.updateTrip(A.route.tripId, { name: el.value.trim().slice(0, LIMITS.tripName) })); };

actions['confirm-leave'] = () => { A.confirm = 'leave'; render(); };
actions['confirm-delete'] = () => { A.confirm = 'delete'; render(); };
actions['confirm-clear'] = () => { A.confirm = null; render(); };
const forget = () => { A.device.removeTrip(A.route.tripId); goHome(); };
actions['leave-yes'] = forget;
actions['forget-trip'] = forget;
actions['delete-yes'] = () => {
  const t = A.trips[A.route.tripId];
  send(A.repo.deleteTrip(t.id));
  send(A.repo.logActivity(t, `${actor(t)} deleted the trip`));
  goHome();
  toast('Trip deleted');
};
actions['restore-trip'] = () => { send(A.repo.restoreTrip(A.route.tripId)); toast('Trip restored'); };
actions['rebuild-trip'] = () => {
  const copy = A.device.snapshots(A.route.tripId)[0];
  if (copy) { send(A.repo.createFromBackup(parseBackup(JSON.stringify(copy.backup)))); toast('Trip rebuilt'); }
};

const currentBackup = t => createBackup(t, A.entries[t.id] || {}, A.activity[t.id] || []);
actions['backup-export'] = () => {
  const t = A.trips[A.route.tripId];
  saveFile(backupFilename(t), JSON.stringify(currentBackup(t), null, 1), 'application/json', () => { A.device.markBackup(t.id); render(); });
};
actions['backup-copy'] = async () => {
  const t = A.trips[A.route.tripId], text = JSON.stringify(currentBackup(t));
  if (await copyText(text)) { A.device.markBackup(t.id); render(); }
};
actions['backup-import'] = () => document.getElementById('importFile').click();
actions['backup-paste'] = () => {
  openSheet(`<form class="sheet" data-form="paste-backup">${sheetHead('Paste a backup', '<button class="btn small primary">Add</button>')}<div class="sheet-body"><textarea id="pasteBox" rows="10" required aria-label="Backup text" placeholder="Paste the copied backup here"></textarea><p class="small muted">Entries with the same id are replaced and new ones are added. Nothing is deleted.</p></div></form>`);
};
function applyBackup(text) {
  const t = A.trips[A.route.tripId], parsed = parseBackup(text);
  if (parsed.error) return toast(parsed.error);
  if (parsed.trip.currency !== t.currency) return toast(`This backup is in ${parsed.trip.currency}, but this trip is in ${t.currency}.`);
  closeSheet();
  send(A.repo.importBackup(t, parsed));
  toast(`Added ${parsed.entries.length} entries${parsed.skipped ? `. Skipped ${parsed.skipped} damaged ones` : ''}.`);
  return undefined;
}
submits['paste-backup'] = () => applyBackup(val('pasteBox'));
actions['restore-copy'] = el => {
  const c = A.device.snapshots(A.route.tripId)[+el.dataset.i];
  if (c) applyBackup(JSON.stringify(c.backup));
};
export const importFile = async file => { if (file) applyBackup(await file.text()); };
