/** People, invite link, trip settings and backups. */
import { A, actions, changes, render, submits } from './state.js';
import { LIMITS } from '../config/app.js';
import { actor, ago, amAdmin, avatar, canWrite, closeSheet, copyText, esc, getMe, openSheet, saveFile, send, sheetHead, toast, val } from './dom.js';
import { activeMembers, isAdminId, isInUse } from '../core/model.js';
import { createTransferCode } from '../core/transfer.js';
import { backupFilename, createBackup, parseBackup } from '../core/backup.js';
import { goHome, goTrip } from './routes.js';

const inviteUrl = id => `${location.origin}${location.pathname}#join-${id}`;

function backupSection(trip) {
  const admin = amAdmin(trip), last = A.device.lastBackup(trip.id), copies = A.device.snapshots(trip.id);
  const overdue = !last || Date.now() - last > LIMITS.backupNudgeDays * 86400000;
  return `<section class="panel pad stack"><h2>Backups</h2>
    <p class="small ${overdue ? 'nudge' : 'muted'}">${last ? `Last backup from this phone: ${ago(last)}.` : 'No backup from this phone yet.'} Backups include expenses and people, but not receipt photos.</p>
    <div class="row wrap"><button class="btn small" data-action="backup-export">Export file</button>${admin ? '<button class="btn small" data-action="backup-import">Import file</button><input id="importFile" type="file" accept=".json,application/json" data-file="import" hidden>' : ''}
    <button class="btn small" data-action="backup-copy">Copy</button>${admin ? '<button class="btn small" data-action="backup-paste">Paste</button>' : ''}</div>
    ${copies.length ? `<div class="stack tight"><span class="flabel">Earlier copies on this phone</span>${copies.map((c, i) => `<div class="row between small"><span>${esc(c.day)} · ${c.backup.entries.length} entries</span>${admin ? `<button class="btn small" data-action="restore-copy" data-i="${i}">Restore</button>` : ''}</div>`).join('')}</div>` : ''}
    <p class="tiny muted">${admin ? 'Importing and restoring only add or replace entries. They never delete anything.' : "Only the trip's admin can import or restore."}</p></section>`;
}

export function peopleView(trip) {
  const me = getMe(trip), write = canWrite(trip), admin = amAdmin(trip), rates = Object.entries(trip.rates || {}), entries = A.entries[trip.id];
  const members = activeMembers(trip);
  return `<section class="panel pad stack"><h2>Invite friends</h2>
      <p class="small muted">Anyone with this link can see and edit this trip, with no account needed. Share it only with the group, and keep it somewhere safe. It's how you get back in if your phone clears this app's storage.</p>
      <div class="linkbox" id="inviteLink">${esc(inviteUrl(trip.id))}</div>
      <button class="btn primary" data-action="invite">Share invite link</button>
      ${A.confirm === 'replace' ? `<p class="small">This copies the trip to a new link. The old link will stop opening the trip, so you'll need to send the new one to everyone, and everyone claims their name again. Edit history isn't copied, and the old copy stays stored, so someone with technical skills and the old link could still read it.</p><div class="row wrap"><button class="btn danger" data-action="replace-yes">Replace the link</button><button class="btn" data-action="confirm-clear">Keep this link</button></div>`
      : admin ? '<button class="link small" data-action="confirm-replace">Link shared too widely? Replace it</button>' : ''}
      ${A.preview ? '<p class="tiny muted">In this preview the link only shows what friends will get. It starts working once the app is live.</p>' : ''}</section>
  <section class="panel pad stack"><h2>People on this trip</h2>
    ${members.map(m => {
      const self = me === m.id;
      return `<div class="stack tight"><div class="row">${avatar(trip, m.id)}<input id="mem-${m.id}" aria-label="${esc(m.name)}'s name" value="${esc(m.name)}" maxlength="${LIMITS.personName}" data-change="rename" data-id="${m.id}" ${admin || self ? '' : 'disabled'}>
        ${self ? '<span class="tag you">you</span>' : ''}
        ${admin && !isInUse(entries, m.id) && !m.claimed && members.length > 1 ? `<button class="x" data-action="remove-member" data-id="${m.id}" aria-label="Remove ${esc(m.name)}">×</button>` : ''}</div>
        <div class="person-actions"><span class="tag ${m.claimed ? 'good' : ''}">${m.claimed ? 'Locked to a device' : 'Not claimed yet'}</span>${isAdminId(trip, m.id) ? '<span class="tag you">Admin</span>' : ''}
        ${admin && !self && m.claimed ? `<button class="link small" data-action="release-claim" data-id="${m.id}">Free this name</button>` : ''}
        ${admin && !self && m.claimed ? `<button class="link small" data-action="toggle-admin" data-id="${m.id}">${isAdminId(trip, m.id) ? 'Remove admin' : 'Make admin'}</button>` : ''}</div></div>`;
    }).join('')}
    ${admin ? `<form class="row" data-form="add-member"><input id="newMember" placeholder="Add a name" aria-label="New person's name" required maxlength="${LIMITS.personName}"><button class="btn">Add</button></form>` : ''}
    <p class="tiny muted">A name belongs to the phone or browser that claimed it. Free a name if a friend lost their phone or cleared their browser, so they can claim it again.</p>
    <p class="tiny muted">People who appear on an expense can't be removed, because the balances would stop adding up.</p></section>
  <section class="panel pad stack"><h2>Payment details</h2>
    <p class="small muted">Optional. These appear next to what people owe, with a copy button. Anyone with the trip link can see them, so a Zelle phone number or email is visible to the group.</p>
    ${members.map(m => `<div class="stack tight"><strong class="small wrap-any">${esc(m.name)}</strong><div class="pay-grid"><input id="ven-${m.id}" aria-label="${esc(m.name)}'s Venmo" placeholder="Venmo @name" maxlength="60" value="${esc(m.venmo || '')}" data-change="payment" data-field="venmo" data-id="${m.id}" autocomplete="off" ${admin || me === m.id ? '' : 'disabled'}><input id="zel-${m.id}" aria-label="${esc(m.name)}'s Zelle" placeholder="Zelle phone or email" maxlength="60" value="${esc(m.zelle || '')}" data-change="payment" data-field="zelle" data-id="${m.id}" autocomplete="off" ${admin || me === m.id ? '' : 'disabled'}></div></div>`).join('')}</section>
  <section class="panel pad stack"><h2>Trip settings</h2>
    <label class="f"><span>Trip name</span><input id="tripName" value="${esc(trip.name)}" maxlength="${LIMITS.tripName}" data-change="trip-name" ${admin ? '' : 'disabled'}></label>
    <div class="row between"><span>Balances are shown in</span><strong class="mono">${esc(trip.currency)}</strong></div>
    <div class="stack tight"><span class="flabel">Saved exchange rates</span>${rates.length ? rates.map(([c, r]) => `<div class="row between small"><span class="mono">1 ${esc(c)}</span><span class="mono">${esc(r)} ${esc(trip.currency)}</span></div>`).join('') : '<p class="small muted">Add an expense in another currency to save a rate.</p>'}</div>
    <div class="row wrap"><button class="btn" data-action="export-csv">Export CSV</button></div></section>
  ${me ? `<section class="panel pad stack"><h2>Moving to a new device</h2><p class="small muted">Your transfer code moves all your trips and names to a new phone or browser, or from Safari to the home-screen app. Paste it into the box on the app's first screen. Keep it private: anyone who has it can act as you.</p><button class="btn" data-action="copy-transfer">Copy transfer code</button></section>` : ''}
  ${backupSection(trip)}
  <section class="panel pad stack"><h2>Archive, leave or delete</h2>
    <div class="row wrap"><button class="btn" data-action="archive-toggle">${A.device.archived().includes(trip.id) ? 'Move out of archive' : 'Archive on this phone'}</button></div>
    <p class="tiny muted">Archiving moves the trip into a separate list on this phone. Friends still see it as usual.</p>
    ${A.confirm === 'leave' ? `<p class="small">This removes the trip from this phone only. You can come back with the invite link.</p><div class="row wrap"><button class="btn danger" data-action="leave-yes">Remove from this phone</button><button class="btn" data-action="confirm-clear">Keep it</button></div>`
    : A.confirm === 'delete' ? `<p class="small">This hides the trip for everyone. An admin can restore it.</p><div class="row wrap"><button class="btn danger" data-action="delete-yes">Delete for everyone</button><button class="btn" data-action="confirm-clear">Keep it</button></div>`
    : `<div class="row wrap"><button class="btn" data-action="confirm-leave">Remove from this phone</button>${admin ? '<button class="btn danger" data-action="confirm-delete">Delete for everyone</button>' : ''}</div>`}</section>`;
}

/** Shown in place of the trip when it can't be opened. */
export function unavailableView(id) {
  const t = A.trips[id];
  if (t && t.retiredAt) {
    return `<section class="panel empty"><h2>${esc(t.name)} has a new link</h2><p class="muted">This link was replaced. Ask the group for the new one.</p>${amAdmin(t) ? '<button class="btn" data-action="keep-old-link">Keep using this link</button>' : ''}<button class="btn" data-action="forget-trip">Remove from this phone</button><button class="link" data-action="home">All trips</button></section>`;
  }
  if (t && t.deletedAt) {
    return `<section class="panel empty"><h2>${esc(t.name)} was deleted</h2><p class="muted">Its expenses are still saved. The trip's admin can bring it back.</p>${amAdmin(t) ? '<button class="btn primary" data-action="restore-trip">Restore trip</button>' : ''}<button class="btn" data-action="forget-trip">Remove from this phone</button><button class="link" data-action="home">All trips</button></section>`;
  }
  if (!A.loaded[id]) return '<section class="panel empty"><h2>Opening the trip</h2><p class="muted">If this is your first time opening it, you need a connection.</p><button class="link" data-action="home">All trips</button></section>';
  const copy = A.device.snapshots(id)[0];
  return `<section class="panel empty"><h2>This trip link doesn't work</h2><p class="muted">The trip wasn't found. Ask a friend to send the link again.</p>
    ${copy ? `<button class="btn primary" data-action="rebuild-trip">Rebuild from this phone's copy (${esc(copy.day)})</button>` : ''}
    <button class="btn" data-action="forget-trip">Remove from this phone</button><button class="link" data-action="home">All trips</button></section>`;
}

function linkHandled() {
  A.device.setLinkUnsaved(A.route.tripId, false);
  render();
}
actions.invite = async () => {
  const t = A.trips[A.route.tripId], url = inviteUrl(t.id);
  try {
    if (navigator.share) { await navigator.share({ title: t.name, text: `Add your expenses for ${t.name}`, url }); linkHandled(); return; }
  } catch (e) { if (e?.name === 'AbortError') return; }
  copyText(url, 'inviteLink');
  linkHandled();
};
actions['copy-link'] = () => {
  copyText(inviteUrl(A.route.tripId));
  linkHandled();
};
actions['copy-transfer'] = async () => {
  const code = createTransferCode(A.device.claims());
  await copyText(code);
  A.device.setCodeSaved(true);
  render();
};
actions['release-claim'] = el => {
  const t = A.trips[A.route.tripId];
  send(A.repo.releaseClaim(t.id, el.dataset.id, getMe(t)), 'Freeing that name');
  toast('Name freed. They can claim it again from the trip link.');
};
actions['toggle-admin'] = el => {
  const t = A.trips[A.route.tripId], id = el.dataset.id;
  send(A.repo.setAdmin(t.id, id, !isAdminId(t, id), getMe(t)), 'That change');
};
actions['confirm-replace'] = () => { A.confirm = 'replace'; render(); };
actions['keep-old-link'] = () => { send(A.repo.keepOldLink(A.route.tripId, getMe(A.trips[A.route.tripId]))); toast('This link works again'); };
actions['replace-yes'] = async () => {
  const t = A.trips[A.route.tripId];
  if (navigator.onLine === false) { toast('Replacing the link needs a connection.'); return; }
  const me = A.device.me(t.id), name = actor(t);
  A.confirm = null;
  toast('Moving the trip to a new link…');
  let copy, claim;
  try {
    ({ trip: copy, claim } = await A.repo.replaceLink(t, A.entries[t.id] || {}, name, me));
  } catch {
    render();
    toast("The link wasn't replaced. Nothing changed, so try again.");
    return;
  }
  A.device.addTrip(copy.id);
  if (me) A.device.setMe(copy.id, me);
  if (claim) A.device.setKey(copy.id, claim.key);
  A.device.setCodeSaved(false);
  A.device.setLinkUnsaved(copy.id, true);
  A.device.removeTrip(t.id);
  A.trips[copy.id] = copy;
  A.loaded[copy.id] = true;
  A.watchTrip(copy.id);
  goTrip(copy.id, 'people');
  toast('New link ready. Send it to the group.');
};
actions['remove-member'] = el => { send(A.repo.removeMember(A.route.tripId, el.dataset.id, getMe(A.trips[A.route.tripId]))); };
submits['add-member'] = () => {
  const t = A.trips[A.route.tripId], name = val('newMember').trim().slice(0, LIMITS.personName);
  if (!name) return;
  send(A.repo.addMember(t, name, actor(t), getMe(t)).written);
};
changes.payment = el => { send(A.repo.setMemberPayment(A.route.tripId, el.dataset.id, el.dataset.field, el.value.trim().slice(0, 60), getMe(A.trips[A.route.tripId])), 'A payment detail'); };
actions['archive-toggle'] = () => {
  const id = A.route.tripId, on = !A.device.archived().includes(id);
  A.device.setArchived(id, on);
  if (on) { goHome(); toast('Archived on this phone'); } else render();
};
changes.rename = el => { if (el.value.trim()) send(A.repo.renameMember(A.route.tripId, el.dataset.id, el.value.trim().slice(0, LIMITS.personName), getMe(A.trips[A.route.tripId]))); };
changes['trip-name'] = el => { if (el.value.trim()) send(A.repo.updateTrip(A.route.tripId, { name: el.value.trim().slice(0, LIMITS.tripName) }, getMe(A.trips[A.route.tripId]))); };

actions['confirm-leave'] = () => { A.confirm = 'leave'; render(); };
actions['confirm-delete'] = () => { A.confirm = 'delete'; render(); };
actions['confirm-clear'] = () => { A.confirm = null; render(); };
const forget = () => { A.device.removeTrip(A.route.tripId); goHome(); };
actions['leave-yes'] = forget;
actions['forget-trip'] = forget;
actions['delete-yes'] = () => {
  const t = A.trips[A.route.tripId];
  send(A.repo.deleteTrip(t.id, Date.now(), getMe(t)));
  send(A.repo.logActivity(t, `${actor(t)} deleted the trip`, '', getMe(t)));
  goHome();
  toast('Trip deleted');
};
actions['restore-trip'] = () => { send(A.repo.restoreTrip(A.route.tripId, getMe(A.trips[A.route.tripId]))); toast('Trip restored'); };
actions['rebuild-trip'] = () => {
  const copy = A.device.snapshots(A.route.tripId)[0];
  if (!copy) return;
  const tripId = A.route.tripId, me = A.device.me(tripId) || null;
  A.repo.createFromBackup(parseBackup(JSON.stringify(copy.backup)), me).then(({ claim }) => {
    if (claim) A.device.setKey(tripId, claim.key);
    toast('Trip rebuilt');
  }).catch(() => toast("The trip wasn't rebuilt. Check your connection and try again."));
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
  send(A.repo.importBackup(t, parsed, actor(t), getMe(t)));
  toast(`Added ${parsed.entries.length} entries${parsed.skipped ? `. Skipped ${parsed.skipped} damaged ones` : ''}.`);
  return undefined;
}
submits['paste-backup'] = () => applyBackup(val('pasteBox'));
actions['restore-copy'] = el => {
  const c = A.device.snapshots(A.route.tripId)[+el.dataset.i];
  if (c) applyBackup(JSON.stringify(c.backup));
};
export const importFile = async file => { if (file) applyBackup(await file.text()); };
