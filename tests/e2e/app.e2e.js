/** Whole flows on a phone-sized screen, on the source version of the app. */
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { serve } from './serve.js';
import { addExpense, check, createTrip, launch, openPage, tab, text } from './helpers.js';

const server = await serve('.'), browser = await launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['clipboard-read', 'clipboard-write'] });
const page = await openPage(context, server.url);
const toastSays = async re => { await page.waitForFunction(s => new RegExp(s).test(document.getElementById('toast').textContent), re.source); };

/* Split ways */
await createTrip(page);
await addExpense(page, 'Rental car', '4800');
await addExpense(page, 'Izakaya', '3100', async () => {
  await page.click('[data-action=split-mode][data-id=shares]');
  await page.fill('[id^=inp-] >> nth=0', '2');
  await page.fill('[id^=inp-] >> nth=1', '1');
  await page.fill('[id^=inp-] >> nth=2', '1');
  await page.selectOption('#fPayer', { index: 1 });
});
await addExpense(page, 'Aquarium', '7500', async () => {
  await page.selectOption('#fCur', 'JPY');
  await page.fill('#fRate', '0.21');
  assert.match(await page.textContent('#fConv'), /NT\$1,575/);
  await page.selectOption('#fCat', 'activities');
  await page.selectOption('#fPayer', { index: 2 });
});
await tab(page, 'balances');
let t = await text(page);
assert.match(t, /You are owed\s*NT\$1,125/);
assert.match(t, /小偉 pays You\s*NT\$1,125/);
assert.match(t, /小偉 pays Mia\s*NT\$200/);
check('splits, currency and simplified debts add up');

await page.uncheck('#simp');
await page.waitForFunction(() => /each expense/.test(document.getElementById('app').textContent));
assert.match(await text(page), /Who pays whom/);
await page.check('#simp');
check('simplify toggle');

/* Typed values survive changing the split */
await tab(page, 'expenses');
await page.click('[data-action=add-expense]');
await page.fill('#fDesc', 'Items test');
await page.fill('#fAmt', '1100');
await page.click('[data-action=split-mode][data-id=items]');
assert.equal(await page.inputValue('#fDesc'), 'Items test', 'description kept');
assert.equal(await page.inputValue('#fAmt'), '1100');
await page.click('[data-action=item-add]');
await page.fill('#it-n-0', 'Beer');
await page.fill('#it-a-0', '1000');
await page.click('[data-action=item-person] >> nth=0');
assert.equal(await page.inputValue('#it-a-0'), '1000', 'price kept after tapping a person');
assert.match(await page.textContent('#splitArea'), /extra of ¥100/);
await page.click('[data-action=split-mode][data-id=items]');
assert.equal(await page.getAttribute('[data-action=split-mode][data-id=items]', 'aria-pressed'), 'true', 'tapping the selected mode keeps it');
assert.equal(await page.inputValue('#it-n-0'), 'Beer');
await page.click('#fSave');
await page.waitForSelector('.tap:has-text("Items test")');
check('typed values survive; by-item split saves');

/* Multiple payers, validation */
await page.click('[data-action=add-expense]');
await page.fill('#fDesc', 'Shared hotel');
await page.fill('#fAmt', '1000');
await page.click('[data-action=toggle-multi]');
await page.fill('[id^=pay-] >> nth=1', '400');
await page.fill('[id^=pay-] >> nth=0', '100');
await page.click('#fSave');
await toastSays(/need to reach/);
await page.fill('[id^=pay-] >> nth=0', '600');
await page.click('#fSave');
await page.waitForSelector('.tap:has-text("Shared hotel")');
assert.match(await page.textContent('.tap:has-text("Shared hotel")'), /2 people paid/);
check('multiple payers must add up');

/* Edit, comment, delete, undo, restore */
await page.click('.tap:has-text("Shared hotel")');
await page.fill('#cText', 'Nice view');
await page.click('form[data-form=comment] button');
await page.waitForSelector('.comment:has-text("Nice view")');
await page.click('[data-action=edit-entry]');
assert.equal(await page.inputValue('#fAmt'), '1000');
await page.fill('#fDesc', 'Hotel');
await page.click('#fSave');
await page.waitForSelector('.tap:has-text("Hotel")');
await page.click('.tap:has-text("Hotel")');
await page.waitForSelector('.comment:has-text("Nice view")');
await page.click('#dlg [data-action=delete-entry]');
await toastSays(/Deleted/);
assert.ok(!(await text(page)).includes('Hotel'));
await page.click('#toast [data-action=undo]');
await page.waitForSelector('.tap:has-text("Hotel")');
await page.click('.tap:has-text("Hotel")');
await page.click('#dlg [data-action=delete-entry]');
await page.waitForFunction(() => !/Hotel/.test(document.getElementById('entryList').textContent));
await tab(page, 'activity');
await page.waitForSelector('[data-action=restore-entry]');
assert.match(await text(page), /deleted "Hotel"/);
await page.click('[data-action=restore-entry]');
await tab(page, 'expenses');
await page.waitForSelector('.tap:has-text("Hotel")');
check('edit keeps comments; delete, undo, restore');

/* Settling */
await tab(page, 'balances');
const before = await text(page);
assert.match(before, /You are owed/);
await page.click('[data-action=settle][data-from] >> nth=0');
await page.click('form[data-form=settle] .btn.primary');
await page.waitForFunction(() => document.getElementById('app').textContent !== '');
await toastSays(/Payment recorded/);
await page.waitForTimeout(50);
assert.notEqual(await text(page), before);
check('recording a payment changes balances');

/* Draft */
await tab(page, 'expenses');
await page.click('[data-action=add-expense]');
await page.fill('#fDesc', 'Half typed');
await page.fill('#fAmt', '55');
await page.reload();
await page.waitForSelector('[data-action=add-expense]');
await page.click('[data-action=add-expense]');
assert.equal(await page.inputValue('#fDesc'), 'Half typed');
await page.click('[data-action=draft-discard]');
assert.equal(await page.inputValue('#fDesc'), 'Half typed', 'one tap does not discard');
await page.click('[data-action=draft-discard]');
assert.equal(await page.inputValue('#fDesc'), '');
await page.click('[data-action=form-cancel]');
check('unsaved expense survives a reload; discard takes two taps');

/* No future dates */
await page.click('[data-action=add-expense]');
await page.fill('#fDesc', 'Future');
await page.fill('#fAmt', '10');
await page.evaluate(() => { const d = document.getElementById('fDate'); d.removeAttribute('max'); d.value = '2099-01-01'; });
await page.click('#fSave');
await toastSays(/future/);
await page.click('[data-action=form-cancel]');
await page.click('[data-action=add-expense]');
await page.click('[data-action=draft-discard]');
await page.click('[data-action=draft-discard]');
await page.click('[data-action=form-cancel]');
check('future dates refused');

/* Receipts */
const pngB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAIAAAACUFjqAAAAEklEQVR4nGP4z8CAB+GTG8HSALfKb5GgAAAAAElFTkSuQmCC';
writeFileSync('/tmp/receipt-test.png', Buffer.from(pngB64, 'base64'));
await page.click('[data-action=add-expense]');
await page.fill('#fDesc', 'With photo');
await page.fill('#fAmt', '10');
await page.setInputFiles('#fPhoto', '/tmp/receipt-test.png');
await page.waitForSelector('.tag.good');
assert.equal(await page.inputValue('#fDesc'), 'With photo');
await page.click('#fSave');
await page.waitForSelector('.tap:has-text("With photo")');
await page.click('.tap:has-text("With photo")');
await page.waitForSelector('img.receipt');
assert.ok(await page.evaluate(() => document.querySelector('img.receipt').src.startsWith('data:image/jpeg')));
await page.click('[data-action=close-sheet]');
check('receipt photo saves and shows');

/* Friend on a second screen: invite link and live update (a second tab shares this browser's database) */
await tab(page, 'people');
const invite = await page.textContent('#inviteLink');
assert.match(invite, /#join-[a-z0-9]{24}$/);
const context2Page = await context.newPage();
context2Page.errors = [];
context2Page.on('pageerror', e => context2Page.errors.push(e.message));
await context2Page.route(/fonts\./, r => r.abort());
await context2Page.goto(invite);
await context2Page.waitForSelector('#entryList');
await tab(page, 'expenses');
await addExpense(page, 'Live from phone one', '300');
await context2Page.waitForSelector('.tap:has-text("Live from phone one")', { timeout: 5000 });
check('invite link opens the trip; new expenses appear live on the other screen');
await context2Page.close();

/* A friend on a fresh device who is not listed can add themselves */
await tab(page, 'people');
const lsDump = await page.evaluate(() => localStorage.getItem('triptab:localdb'));
const fresh = await browser.newContext({ viewport: { width: 390, height: 844 } });
await fresh.addInitScript(d => { if (!localStorage.getItem('triptab:localdb')) localStorage.setItem('triptab:localdb', d); }, lsDump);
const friend = await openPage(fresh, invite);
await friend.waitForSelector('#joinName');
assert.match(await text(friend), /Which one is you/);
await friend.fill('#joinName', 'Rui');
await friend.click('form[data-form=join-self] button');
await friend.waitForFunction(() => !/Which one is you/.test(document.getElementById('app').textContent));
await tab(friend, 'people');
assert.ok(await friend.inputValue('input[value="Rui"]'));
assert.deepEqual(friend.errors, []);
await fresh.close();
check('a friend picks or adds their name');

/* Offline: writes that have not reached the server must not block the screen */
await page.evaluate(() => localStorage.setItem('triptab:test-hang-writes', 'true'));
await addExpense(page, 'Offline dinner', '200');
await toastSays(/Expense added/);
await page.evaluate(() => localStorage.removeItem('triptab:test-hang-writes'));
check('saving works while a write is still waiting on the network');

/* Backups */
await tab(page, 'people');
await page.click('[data-action=backup-copy]');
const copied = await page.evaluate(() => navigator.clipboard.readText());
assert.match(copied, /trip-tab-backup/);
await page.click('[data-action=backup-paste]');
await page.fill('#pasteBox', 'junk');
await page.click('form[data-form=paste-backup] .btn.primary');
await toastSays(/isn't a Trip Tab/);
await page.fill('#pasteBox', copied);
await page.click('form[data-form=paste-backup] .btn.primary');
await toastSays(/Added \d+ entries/);
check('backup copy and paste; junk refused');

/* Removing someone: only when they appear on nothing */
await page.fill('#newMember', 'Temp');
await page.click('form[data-form=add-member] button');
await page.waitForSelector('[aria-label="Remove Temp"]');
await page.click('[aria-label="Remove Temp"]');
await page.waitForFunction(() => !document.querySelector('[aria-label="Remove Temp"]'));
assert.equal(await page.locator('[aria-label="Remove Mia"]').count(), 0);
check('only unused people can be removed');

/* Rename everywhere */
await page.fill('input[value="Mia"]', 'Mia Chen');
await page.press('input[value="Mia"]', 'Tab');
await tab(page, 'balances');
await page.waitForFunction(() => /Mia Chen/.test(document.getElementById('app').textContent));
check('renaming updates everywhere');

/* Escaping */
await addExpense(page, '<img src=x onerror=alert(1)>', '5');
assert.equal(await page.locator('#app img').count(), 0);
check('names and descriptions cannot inject markup');

/* Delete for everyone, then restore */
await tab(page, 'people');
await page.click('[data-action=confirm-delete]');
await page.click('[data-action=delete-yes]');
await page.waitForSelector('.home-head');
assert.ok(!(await text(page)).includes('Okinawa'));
await page.evaluate(i => { location.hash = i; }, new URL(invite).hash);
await page.waitForSelector('[data-action=restore-trip]');
await page.click('[data-action=restore-trip]');
await page.waitForSelector('#entryList');
check('deleted trips can be restored');

/* Pasted invite link (how the home-screen app joins, since links open in Safari) */
await page.click('[data-action=home]');
await page.fill('#joinLink', 'not a link');
await page.click('form[data-form=join-link] button');
await toastSays(/isn't a trip link/);
await page.fill('#joinLink', invite);
await page.click('form[data-form=join-link] button');
await page.waitForSelector('#entryList');
check('joining by pasting a link');

/* Bad link */
await page.evaluate(() => { location.hash = '#join-aaaaaaaaaaaaaaaaaaaaaaaa'; });
await page.waitForFunction(() => /link doesn't work/.test(document.getElementById('app').textContent));
await page.click('[data-action=forget-trip]');
await page.waitForSelector('.home-head');
check('a dead link explains itself');

assert.deepEqual(page.errors, [], 'no JavaScript errors');
await browser.close();
server.close();
console.log('End-to-end passed');
