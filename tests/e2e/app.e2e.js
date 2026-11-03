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

/* Edit history */
await page.click('.tap:has-text("Hotel")');
await page.click('[data-action=edit-entry]');
await page.fill('#fDesc', 'Hotel wrong');
await page.click('#fSave');
await page.waitForSelector('.tap:has-text("Hotel wrong")');
await page.click('.tap:has-text("Hotel wrong")');
await page.click('[data-action=history-show]');
await page.waitForSelector('[data-action=history-restore]');
const versions = await page.textContent('#historySlot');
assert.match(versions, /Hotel/);
assert.match(versions, /Replaced by Jonathan/);
await page.click('[data-action=history-restore] >> nth=0');
await page.waitForFunction(() => !/Hotel wrong/.test(document.getElementById('entryList').textContent));
await page.click('.tap:has-text("Hotel")');
await page.waitForSelector('.comment:has-text("Nice view")');
await page.click('[data-action=close-sheet]');
check('edit history restores an earlier version and keeps comments');

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

/* Two people editing the same expense */
{
  const other = await context.newPage();
  await other.route(/fonts\./, r => r.abort());
  await other.goto(invite);
  await other.waitForSelector('.tap:has-text("Rental car")');
  await tab(page, 'expenses');
  await page.click('.tap:has-text("Rental car")');
  await page.click('[data-action=edit-entry]');
  await page.fill('#fDesc', 'Rental car (mine)');
  await other.click('.tap:has-text("Rental car")');
  await other.click('[data-action=edit-entry]');
  await other.fill('#fDesc', 'Rental car (theirs)');
  await other.click('#fSave');
  await page.waitForFunction(() => /theirs/.test(document.getElementById('entryList').textContent));
  assert.equal(await page.inputValue('#fDesc'), 'Rental car (mine)', 'a live update leaves the open form alone');
  await page.click('#fSave');
  await page.waitForSelector('[data-action=conflict-mine]');
  const screen = await page.textContent('#dlg');
  assert.match(screen, /changed this expense while you were editing/);
  assert.match(screen, /theirs/); assert.match(screen, /mine/);
  await page.click('[data-action=conflict-back]');
  assert.equal(await page.inputValue('#fDesc'), 'Rental car (mine)', 'Back returns to your edit');
  await page.click('#fSave');
  await page.click('[data-action=conflict-theirs]');
  await page.waitForFunction(() => !document.getElementById('dlg').open);
  assert.match(await text(page), /theirs/);
  await page.click('.tap:has-text("theirs")');
  await page.click('[data-action=history-show]');
  await page.waitForFunction(() => /\(mine\)/.test(document.getElementById('historySlot').textContent), null, { timeout: 5000 });
  await page.click('[data-action=close-sheet]');
  await page.click('.tap:has-text("theirs")');
  await page.click('[data-action=edit-entry]');
  await page.fill('#fDesc', 'Rental car');
  await page.click('#fSave');
  await page.waitForFunction(() => !document.getElementById('dlg').open);
  await other.close();
  check('a conflicting edit asks which to keep; the other version stays in history');
}

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

/* Rights: a friend on another phone */
{
  const dump = await page.evaluate(() => localStorage.getItem('triptab:localdb'));
  const friendPhone = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['clipboard-read', 'clipboard-write'] });
  await friendPhone.addInitScript(d => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('triptab:localdb', d); } }, dump);
  const pal = await openPage(friendPhone, invite);
  await pal.waitForSelector('#joinName');
  const picker = await pal.textContent('#app');
  assert.ok(!/Jonathan/.test(await pal.textContent('.chips')), 'names already claimed are not offered');
  assert.match(picker, /locks it to this phone or browser/);
  await pal.click('[data-action=set-me]:has-text("Mia")');
  await pal.waitForFunction(() => !/Which one is you/.test(document.getElementById('app').textContent));
  await pal.waitForSelector('.tap:has-text("Rental car")');
  await pal.click('.tap:has-text("Rental car")');
  await pal.waitForSelector('#dlg .big');
  assert.equal(await pal.locator('#dlg [data-action=edit-entry]').count(), 0, "can't edit an expense someone else added and paid");
  assert.equal(await pal.locator('#dlg [data-action=delete-entry]').count(), 0);
  assert.match(await pal.textContent('#dlg'), /Only the person who added or paid/);
  assert.equal(await pal.locator('#dlg #cText').count(), 1, 'can still comment');
  await pal.click('[data-action=close-sheet]');
  await pal.click('[data-action=add-expense]');
  await pal.fill('#fDesc', 'Mia lunch');
  await pal.fill('#fAmt', '60');
  await pal.click('#fSave');
  await pal.waitForSelector('.tap:has-text("Mia lunch")');
  await pal.click('.tap:has-text("Mia lunch")');
  assert.equal(await pal.locator('#dlg [data-action=edit-entry]').count(), 1, 'can edit their own');
  await pal.click('[data-action=close-sheet]');
  await tab(pal, 'people');
  const peopleScreen = await pal.textContent('#app');
  assert.match(peopleScreen, /Admin/);
  assert.equal(await pal.locator('[data-action=confirm-delete]').count(), 0);
  assert.equal(await pal.locator('[data-action=confirm-replace]').count(), 0);
  assert.equal(await pal.locator('[data-action=release-claim]').count(), 0);
  assert.equal(await pal.locator('#newMember').count(), 0);
  assert.equal(await pal.locator('[data-action=backup-paste]').count(), 0);
  assert.ok(await pal.locator('input[aria-label="Jonathan\'s name"]').isDisabled());
  assert.ok(!(await pal.locator('input[aria-label="Mia\'s name"]').isDisabled()), 'can rename themselves');
  assert.ok(!(await pal.locator('input[aria-label="Mia\'s Venmo"]').isDisabled()));
  assert.ok(await pal.locator('input[aria-label="Jonathan\'s Venmo"]').isDisabled());

  /* Moving to a new phone */
  await pal.click('section:has(h2:has-text("Moving to a new device")) [data-action=copy-transfer]');
  const code = await pal.evaluate(() => navigator.clipboard.readText());
  assert.match(code, /^TT1\./);
  const dump2 = await pal.evaluate(() => localStorage.getItem('triptab:localdb'));
  const newPhone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await newPhone.addInitScript(d => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('triptab:localdb', d); } }, dump2);
  const moved = await openPage(newPhone, server.url);
  await moved.waitForSelector('#joinLink');
  await moved.fill('#joinLink', 'TT1.garbage');
  await moved.click('form[data-form=join-link] button');
  await moved.waitForFunction(() => /isn't readable/.test(document.getElementById('toast').textContent));
  await moved.fill('#joinLink', code);
  await moved.click('form[data-form=join-link] button');
  await moved.waitForSelector('.tap:has-text("Okinawa")');
  await moved.click('.tap:has-text("Okinawa")');
  await moved.waitForSelector('.tap:has-text("Mia lunch")');
  assert.ok(!/Which one is you/.test(await text(moved)), 'the new phone is already Mia');
  assert.deepEqual(moved.errors, []);
  await newPhone.close();
  assert.deepEqual(pal.errors, []);
  await friendPhone.close();
  check("friends can change only their own things; a transfer code moves them to a new phone");
}

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

/* Credit: who added it and who it's split among */
await tab(page, 'expenses');
await addExpense(page, 'Credit test', '90', async () => {
  await page.selectOption('#fCur', 'TWD');
  await page.uncheck('[id^=sel-] >> nth=2');
});
{
  const row = await page.textContent('.tap:has-text("Credit test")');
  assert.match(row, /Added by You/);
  assert.match(row, /Split among you, Mia Chen/);
  await page.click('.tap:has-text("Credit test")');
  assert.match(await page.textContent('#dlg'), /Added by Jonathan on/);
  await page.click('[data-action=close-sheet]');
  await tab(page, 'activity');
  await page.waitForFunction(() => /added "Credit test".*split among Jonathan, Mia Chen/.test(document.getElementById('app').textContent));
}
check('each expense shows who added it and who it is split among');

/* Name required */
{
  const noName = await context.newPage();
  await noName.route(/fonts\./, r => r.abort());
  await noName.goto(invite);
  const tripKey = `triptab:me:${new URL(invite).hash.slice(6)}`;
  const mine = await noName.evaluate(k => localStorage.getItem(k), tripKey);
  await noName.evaluate(k => localStorage.removeItem(k), tripKey);
  await noName.reload();
  await noName.waitForSelector('#joinName');
  await noName.click('[data-action=add-expense]');
  await noName.waitForFunction(() => /Choose your name/.test(document.getElementById('toast').textContent));
  assert.equal(await noName.evaluate(() => document.getElementById('dlg').open), false);
  await noName.evaluate(([k, v]) => localStorage.setItem(k, v), [tripKey, mine]);
  await noName.close();
  check('adding needs a name, with no account');
}

/* Refunds */
await tab(page, 'balances');
const beforeRefund = await text(page);
await tab(page, 'expenses');
await page.click('[data-action=add-expense]');
await page.click('[data-action=form-kind][data-id=refund]');
await page.fill('#fDesc', 'Deposit back');
await page.fill('#fAmt', '300');
assert.match(await page.textContent('#dlg'), /Received by/);
assert.match(await page.textContent('#dlg'), /Shared by/);
await page.click('#fSave');
await page.waitForSelector('.tap:has-text("Deposit back")');
assert.match(await page.textContent('.tap:has-text("Deposit back")'), /You received NT\$300/);
await tab(page, 'balances');
await page.waitForTimeout(30);
assert.notEqual(await text(page), beforeRefund);
await tab(page, 'expenses');
await page.click('.tap:has-text("Deposit back")');
await page.click('[data-action=edit-entry]');
assert.equal(await page.inputValue('#fAmt'), '300');
assert.match(await page.textContent('#dlg .sheet-head'), /Edit refund/);
await page.click('#fSave');
await page.waitForFunction(() => !document.getElementById('dlg').open);
check('refunds add, change balances and edit correctly');

/* Duplicate */
await page.click('.tap:has-text("Credit test")');
await page.click('[data-action=duplicate-entry]');
assert.equal(await page.inputValue('#fDesc'), 'Credit test');
await page.fill('#fDesc', 'Credit copy');
await page.click('#fSave');
await page.waitForSelector('.tap:has-text("Credit copy")');
assert.match(await page.textContent('.tap:has-text("Credit copy")'), /Split among you, Mia Chen/);
assert.ok(await page.locator('.tap:has-text("Credit test")').count());
check('duplicate makes a new expense and leaves the original');

/* Waiting to sync */
await page.evaluate(() => localStorage.setItem('triptab:test-hang-writes', 'true'));
await addExpense(page, 'Sync test', '40');
await page.waitForSelector('.tap:has-text("Sync test") .tag:has-text("Waiting to sync")');
assert.match(await text(page), /your friends can't see yet/);
await page.evaluate(() => { localStorage.removeItem('triptab:test-hang-writes'); window.dispatchEvent(new Event('online')); });
await page.waitForFunction(() => !/Waiting to sync/.test(document.getElementById('entryList').textContent));
check('unsynced expenses are marked until they reach the database');

/* Offline notice */
await context.setOffline(true);
await page.waitForFunction(() => /You're offline/.test(document.getElementById('app').textContent));
await context.setOffline(false);
await page.waitForFunction(() => !/You're offline/.test(document.getElementById('app').textContent));
check('offline notice comes and goes');

/* Payment details */
await tab(page, 'people');
await page.fill('input[aria-label="Mia Chen\'s Venmo"]', '@mia');
await page.press('input[aria-label="Mia Chen\'s Venmo"]', 'Tab');
await page.fill('input[aria-label="Jonathan\'s Zelle"]', 'j@example.com');
await page.press('input[aria-label="Jonathan\'s Zelle"]', 'Tab');
await tab(page, 'balances');
await page.waitForSelector('.handle');
const handleBtn = page.locator('[data-action=copy-handle]').first();
const handleValue = await handleBtn.getAttribute('data-value');
await handleBtn.click();
assert.equal(await page.evaluate(() => navigator.clipboard.readText()), handleValue);
check('payment details appear beside debts and copy');

/* Archive */
await tab(page, 'people');
await page.click('[data-action=archive-toggle]');
await page.waitForSelector('.home-head');
assert.equal(await page.locator('.tap').count(), 0);
await page.click('[data-action=toggle-archived]');
await page.click('.tap');
await page.waitForSelector('#entryList');
await tab(page, 'people');
await page.click('[data-action=archive-toggle]');
check('archive moves a trip aside and back');

/* A change the server refuses is reported and stays until read */
await page.evaluate(() => { const k = 'triptab:failed-changes'; localStorage.setItem(k, JSON.stringify([{ text: '"Dinner" didn\'t save.', at: 1 }])); });
await page.reload();
await page.waitForSelector('[data-action=failed-dismiss]');
assert.match(await text(page), /"Dinner" didn't save/);
await page.click('[data-action=failed-dismiss]');
await page.waitForFunction(() => !document.querySelector('[data-action=failed-dismiss]'));
check('refused changes stay on screen until dismissed');

/* Admin frees a name */
await tab(page, 'people');
await page.fill('#newMember', 'Kai');
await page.click('form[data-form=add-member] button');
await page.waitForSelector('input[value="Kai"]');
{
  const dump = await page.evaluate(() => localStorage.getItem('triptab:localdb'));
  const kaiPhone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await kaiPhone.addInitScript(d => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('triptab:localdb', d); } }, dump);
  const kai = await openPage(kaiPhone, invite);
  await kai.click('[data-action=set-me]:has-text("Kai")');
  await kai.waitForFunction(() => !/Which one is you/.test(document.getElementById('app').textContent));
  const after = await kai.evaluate(() => localStorage.getItem('triptab:localdb'));
  await kaiPhone.close();
  await page.evaluate(d => { localStorage.setItem('triptab:localdb', d); }, after);
  await page.reload();
  await page.waitForSelector('[data-action=release-claim]');
  assert.match(await text(page), /Locked to a device/);
  const rows = page.locator('.stack:has(input[value="Kai"]) [data-action=release-claim]');
  await rows.click();
  await page.waitForFunction(() => /Name freed/.test(document.getElementById('toast').textContent));
}
check('an admin can free a name for someone who lost their phone');

/* Admin's transfer code reminder */
await tab(page, 'expenses');
await page.waitForSelector('[data-action=copy-transfer]');
await page.click('[data-action=copy-transfer]');
await page.waitForFunction(() => !document.querySelector('[data-action=copy-transfer]'));
check('admins are reminded to save their transfer code');

/* Link reminder and replacing a link */
await tab(page, 'expenses');
await page.waitForSelector('[data-action=copy-link]');
await page.click('[data-action=copy-link]');
await page.waitForFunction(() => !document.querySelector('[data-action=copy-link]'));
assert.match(await page.evaluate(() => navigator.clipboard.readText()), /#join-/);
await tab(page, 'people');
await page.click('[data-action=confirm-replace]');
await page.click('[data-action=confirm-clear]');
await page.click('[data-action=confirm-replace]');
const entriesBefore = await page.evaluate(id => Object.keys(JSON.parse(localStorage.getItem('triptab:localdb'))).filter(k => k.startsWith(`trips/${id}/entries/`) && k.split('/').length === 4).length, new URL(invite).hash.slice(6));
await page.click('[data-action=replace-yes]');
await page.waitForFunction(old => { const l = document.getElementById('inviteLink'); return l && !l.textContent.includes(old); }, new URL(invite).hash);
const newInvite = await page.textContent('#inviteLink');
await tab(page, 'expenses');
await page.waitForSelector('.tap:has-text("Rental car")');
assert.equal(await page.locator('.tap').count() >= 1, true);
const entriesAfter = await page.evaluate(id => Object.keys(JSON.parse(localStorage.getItem('triptab:localdb'))).filter(k => k.startsWith(`trips/${id}/entries/`) && k.split('/').length === 4).length, new URL(newInvite).hash.slice(6));
assert.equal(entriesAfter, entriesBefore);
const oldTab = await context.newPage();
await oldTab.route(/fonts\./, r => r.abort());
await oldTab.goto(invite);
await oldTab.waitForSelector('[data-action=keep-old-link]');
const oldScreen = await text(oldTab);
assert.match(oldScreen, /has a new link/);
assert.ok(!oldScreen.includes(new URL(newInvite).hash.slice(6)), 'the old link never reveals the new one');
await oldTab.close();
check('replacing a link copies the trip and retires the old link');
await page.click('[data-action=home]');
await page.waitForSelector('.home-head');
await page.evaluate(h => { location.hash = h; }, new URL(newInvite).hash);
await page.waitForSelector('#entryList');

/* Delete for everyone, then restore */
await tab(page, 'people');
await page.click('[data-action=confirm-delete]');
await page.click('[data-action=delete-yes]');
await page.waitForSelector('.home-head');
assert.ok(!(await text(page)).includes('Okinawa'));
await page.evaluate(i => { location.hash = i; }, new URL(newInvite).hash);
await page.waitForSelector('[data-action=restore-trip]');
await page.click('[data-action=restore-trip]');
await page.waitForSelector('#entryList');
check('deleted trips can be restored');

/* Pasted invite link (how the home-screen app joins, since links open in Safari) */
await page.click('[data-action=home]');
await page.fill('#joinLink', 'not a link');
await page.click('form[data-form=join-link] button');
await toastSays(/isn't a trip link/);
await page.fill('#joinLink', newInvite);
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
