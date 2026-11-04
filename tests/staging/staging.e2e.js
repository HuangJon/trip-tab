/**
 * The published staging site, with real Firebase sign-in, rules and database, as two people.
 * Accounts are made already verified, because a script can't open an inbox. Google sign-in, real
 * email delivery and real phones still need a person. Everything it creates is deleted at the end.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { addExpense, check, launch, tab } from '../e2e/helpers.js';

const SITE = process.env.STAGING_URL || 'https://trip-tab-staging.web.app/';
const key = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
assert.equal(key.project_id, 'trip-tab-staging', 'this test must never run against the live project');
initializeApp({ credential: cert(key) });
const auth = getAuth(), db = getFirestore();

const run = randomBytes(4).toString('hex');
const password = randomBytes(18).toString('base64url');
const accounts = [], tripIds = new Set();
async function account(name) {
  const user = await auth.createUser({ email: `${name.toLowerCase()}-${run}@example.com`, password, emailVerified: true, displayName: name });
  accounts.push(user.uid);
  return user;
}
const browser = await launch();
async function person(user) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  page.signIn = async url => {
    await page.goto(url);
    await page.waitForSelector('#authEmail', { timeout: 30000 });
    await page.fill('#authEmail', user.email);
    await page.fill('#authPassword', password);
    await page.click('form[data-form=auth-in] button');
  };
  return page;
}
const noSync = page => page.waitForFunction(() => !/Waiting to sync/.test(document.getElementById('entryList')?.textContent || ''), null, { timeout: 20000 });
const noFailures = async page => assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('triptab:failed-changes') || '[]')), [], 'the database accepted every change');

let host;
let failed = null;
try {
  host = await person(await account('Host'));
  const hostUser = accounts[0];
  await host.signIn(SITE);
  await host.waitForSelector('[data-action=new-trip]', { timeout: 30000 });
  assert.match(await host.textContent('#app'), /Staging/);
  check('a verified account signs in on the real site');

  await host.click('[data-action=new-trip] >> nth=0');
  await host.fill('#ntName', `Staging ${run}`);
  await host.fill('#ntPeople', 'Host\nMia');
  await host.selectOption('#ntCur', 'USD');
  await host.click('form[data-form=new-trip] .btn.primary');
  await host.waitForSelector('[data-action=invite-first]', { timeout: 20000 });
  tripIds.add(/#t-([a-z0-9]+)-/.exec(host.url())[1]);

  await host.click('[data-action=add-expense]');
  await host.fill('#fDesc', 'First expense');
  await host.fill('#fAmt', '90');
  await host.click('#fSave');
  await host.waitForSelector('.tap:has-text("First expense")', { timeout: 15000 });
  await noSync(host);
  check('a new expense appears right away and reaches the database');

  await host.reload();
  await host.waitForSelector('.tap:has-text("First expense")', { timeout: 20000 });
  check('it is still there after a reload');

  await host.click('[data-action=add-expense]');
  await host.fill('#fDesc', 'Taiwan dinner');
  await host.fill('#fAmt', '2800');
  await host.selectOption('#fCur', 'TWD');
  assert.match(await host.textContent('#dlg'), /1 USD = how many TWD/);
  await host.fill('#fRate', '0.03');
  await host.waitForSelector('#fRateWarn .check.bad');
  await host.fill('#fRate', '33');
  assert.match(await host.textContent('#fConv'), /\$84\.85/);
  await host.click('#fSave');
  await host.waitForSelector('.tap:has-text("Taiwan dinner")', { timeout: 15000 });
  await noSync(host);
  assert.match(await host.textContent('.tap:has-text("Taiwan dinner")'), /\$56\.57/);
  check('the reported exchange rate case gives the right amount');

  await host.click('[data-action=add-expense]');
  await host.fill('#fDesc', 'No rate yet');
  await host.fill('#fAmt', '5000');
  await host.selectOption('#fCur', 'JPY');
  await host.fill('#fRate', '');
  await host.click('#fSave');
  await host.waitForSelector('.tap:has-text("No rate yet") .tag.warn', { timeout: 15000 });
  await noSync(host);
  await noFailures(host);
  check('an expense with no exchange rate saves on the published rules');

  await tab(host, 'people');
  const invite = await host.textContent('#inviteLink', { timeout: 15000 });
  const friendUser = await account('Friend');
  const friend = await person(friendUser);
  await friend.signIn(invite);
  await friend.waitForSelector('.chips [data-action=set-me]', { timeout: 30000 });
  assert.ok(!/Host/.test(await friend.textContent('.chips')));
  await host.waitForFunction(e => document.getElementById('app').textContent.includes(e), friendUser.email, { timeout: 20000 });
  assert.match(await host.textContent('#joinedCount'), /hasn't picked a name/);
  check('the admin sees a friend who joined without picking a name');

  await friend.click('[data-action=set-me]:has-text("Mia")');
  await friend.waitForFunction(() => !/Which one is you/.test(document.getElementById('app').textContent), null, { timeout: 20000 });
  await friend.waitForSelector('.tap:has-text("First expense")', { timeout: 20000 });
  await friend.click('.tap:has-text("First expense")');
  await friend.waitForSelector('#dlg .big');
  assert.equal(await friend.locator('#dlg [data-action=edit-entry]').count(), 0);
  await friend.click('[data-action=close-sheet]');
  await addExpense(friend, 'From friend', '30');
  await noSync(friend);
  await noFailures(friend);
  await tab(host, 'expenses');
  await host.waitForSelector('.tap:has-text("From friend")', { timeout: 20000 });
  check("a friend's expense appears live, and they can't edit yours");

  // Go straight at the database, as someone bypassing the app would.
  const tripId = [...tripIds][0];
  const forged = await friend.evaluate(async id => {
    const { getApps } = await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js');
    const { getFirestore: store, doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js');
    try { await updateDoc(doc(store(getApps()[0]), `trips/${id}`), { name: 'Hacked' }); return 'allowed'; } catch (e) { return e.code; }
  }, tripId);
  assert.equal(forged, 'permission-denied');
  check('the published rules refuse a direct attempt to change the trip');

  await host.reload();
  await host.waitForSelector('.tap:has-text("From friend")', { timeout: 20000 });
  assert.deepEqual(host.errors, []);
  assert.deepEqual(friend.errors, []);
  assert.ok(hostUser);
} catch (e) {
  failed = e;
  if (host) await host.screenshot({ path: 'staging-failure.png', fullPage: true }).catch(() => {});
}

/* Clean up, even after a failure. */
for (const id of tripIds) await db.recursiveDelete(db.doc(`trips/${id}`)).catch(e => console.log('Cleanup:', e.message));
for (const uid of accounts) {
  await db.recursiveDelete(db.doc(`users/${uid}`)).catch(e => console.log('Cleanup:', e.message));
  await auth.deleteUser(uid).catch(e => console.log('Cleanup:', e.message));
}
await browser.close();
if (failed) { console.error(failed); process.exit(1); }
console.log('Staging checks passed');
process.exit(0);
