/**
 * The real app in a real browser against the Firebase emulators, as two people. This covers the
 * timing between the app and the database, which the stand-in database can't.
 */
import assert from 'node:assert/strict';
import { serve } from '../e2e/serve.js';
import { addExpense, check, createTrip, launch, signUp, tab, text } from '../e2e/helpers.js';

const OOB = 'http://127.0.0.1:9099/emulator/v1/projects/demo-trip-tab/oobCodes';
const server = await serve('.'), browser = await launch();

async function person() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => localStorage.setItem('triptab:test-emulator', 'true'));
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  return page;
}
/** Signs up and "taps" the real verification link the emulator would have emailed. */
async function verifiedSignUp(page, url, name) {
  const email = `${name.toLowerCase()}@example.com`;
  await page.goto(url);
  await page.waitForSelector('[data-action=auth-google]');
  await page.click('[data-action=auth-mode][data-id=up]');
  await page.fill('#authName', name);
  await page.fill('#authEmail', email);
  await page.fill('#authPassword', 'password1');
  await page.click('form[data-form=auth-up] button');
  await page.waitForSelector('[data-action=auth-check]');
  await page.click('[data-action=auth-check]');
  await page.waitForFunction(() => /isn't verified yet/.test(document.getElementById('toast').textContent));
  let link;
  for (let i = 0; i < 20 && !link; i += 1) {
    const { oobCodes } = await (await fetch(OOB)).json();
    link = oobCodes?.find(c => c.email === email && c.requestType === 'VERIFY_EMAIL')?.oobLink;
    if (!link) await new Promise(r => setTimeout(r, 250));
  }
  assert.ok(link, 'the verification email was sent');
  assert.ok((await fetch(link)).ok);
  await page.click('[data-action=auth-check]');
}

const host = await person();
await verifiedSignUp(host, server.url, 'Host');
await host.waitForSelector('[data-action=new-trip]');
check('email sign-up and verification');

await createTrip(host, 'Emulator trip', 'Host\nMia');
await tab(host, 'expenses');
await host.click('[data-action=add-expense]');
await host.fill('#fDesc', 'First expense');
await host.fill('#fAmt', '500');
await host.selectOption('#fCur', 'TWD').catch(() => {});
await host.click('#fSave');
// The bug this test exists for: on a new trip the list stayed empty until a reload.
await host.waitForSelector('.tap:has-text("First expense")', { timeout: 10000 });
check('a new expense appears without reloading');
await host.waitForFunction(() => !/Waiting to sync/.test(document.getElementById('entryList').textContent), null, { timeout: 15000 });
check('it finishes syncing');
await host.waitForTimeout(8000);
await addExpense(host, 'Second expense', '300');
await host.waitForFunction(() => !/Waiting to sync/.test(document.getElementById('entryList').textContent), null, { timeout: 15000 });
check('the list is still live a while later');
await host.reload();
await host.waitForSelector('.tap:has-text("Second expense")', { timeout: 15000 });
check('expenses survive a reload');

await tab(host, 'people');
const invite = await host.textContent('#inviteLink', { timeout: 15000 });
const friend = await person();
await verifiedSignUp(friend, invite, 'Friend');
await friend.waitForSelector('#joinName', { timeout: 15000 });
await friend.waitForSelector('.chips [data-action=set-me]');
assert.ok(!/Host/.test(await friend.textContent('.chips')), 'claimed names are hidden');
await tab(host, 'people');
await host.waitForFunction(() => /friend@example\.com/.test(document.getElementById('app').textContent), null, { timeout: 15000 });
assert.match(await host.textContent('#joinedCount'), /hasn't picked a name/);
check('the admin sees a friend who joined without picking a name');

await friend.click('[data-action=set-me]:has-text("Mia")');
await friend.waitForFunction(() => !/Which one is you/.test(document.getElementById('app').textContent), null, { timeout: 15000 });
await friend.waitForSelector('.tap:has-text("First expense")', { timeout: 15000 });
await addExpense(friend, 'From friend', '100');
await tab(host, 'expenses');
await host.waitForSelector('.tap:has-text("From friend")', { timeout: 15000 });
check('expenses from a friend appear live');

await friend.click('.tap:has-text("First expense")');
await friend.waitForSelector('#dlg .big');
assert.equal(await friend.locator('#dlg [data-action=edit-entry]').count(), 0);
await friend.click('[data-action=close-sheet]');
await host.click('[data-action=add-expense]');
await host.fill('#fDesc', 'No rate yet');
await host.fill('#fAmt', '2000');
await host.selectOption('#fCur', 'JPY');
await host.click('#fSave');
await host.waitForSelector('.tap:has-text("No rate yet") .tag.warn', { timeout: 10000 });
await host.waitForFunction(() => !/Waiting to sync/.test(document.getElementById('entryList').textContent), null, { timeout: 15000 });
assert.deepEqual(await host.evaluate(() => JSON.parse(localStorage.getItem('triptab:failed-changes') || '[]')), [], 'the rules accepted a missing rate');
check('an expense with no exchange rate saves');

assert.ok(!/can't open this trip/.test(await text(host)));
assert.deepEqual(host.errors, []);
assert.deepEqual(friend.errors, []);
await browser.close();
server.close();
console.log('Browser emulator checks passed');
process.exit(0);
