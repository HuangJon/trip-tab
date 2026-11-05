/** Whole flows on a phone-sized screen, on the source version of the app. */
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { serve } from './serve.js';
import { addExpense, check, createTrip, launch, openPage, signUp, tab, text } from './helpers.js';

const server = await serve('.'), browser = await launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['clipboard-read', 'clipboard-write'] });
const page = await openPage(context, server.url);
const toastSays = async re => { await page.waitForFunction(s => new RegExp(s).test(document.getElementById('toast').textContent), re.source); };

/* Sign-in */
await page.waitForSelector('[data-action=auth-google]');
assert.equal(await page.locator('[data-action=new-trip]').count(), 0, 'nothing shows before signing in');
await page.fill('#authEmail', 'nobody@example.com');
await page.fill('#authPassword', 'wrong-password');
await page.click('form[data-form=auth-in] button');
await toastSays(/don't match/);
await page.click('[data-action=auth-mode][data-id=up]');
await page.fill('#authName', 'Jonathan');
assert.equal(await page.inputValue('#authEmail'), 'nobody@example.com', 'switching keeps the typed email');
await page.fill('#authEmail', 'jonathan@example.com');
await page.fill('#authPassword', 'password1');
await page.click('form[data-form=auth-up] button');
await page.waitForSelector('[data-action=auth-check]');
assert.match(await text(page), /Check your email/);
await page.click('[data-action=auth-check]');
await toastSays(/isn't verified yet/);
assert.equal(await page.locator('[data-action=new-trip]').count(), 0, 'an unverified account stays out');
await page.reload();
await page.waitForSelector('[data-action=auth-check]');
await page.click('[data-action=auth-simulate]');
await page.waitForSelector('[data-action=new-trip]');
check('sign-in is required, and an unverified email stays out');

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
  assert.match(await page.textContent('#dlg'), /1 TWD = how many JPY/);
  await page.fill('#fRate', '5');
  assert.match(await page.textContent('#fConv'), /NT\$1,500/);
  await page.click('[data-action=cat-pick][data-id=activities]');
  await page.selectOption('#fPayer', { index: 2 });
});
await tab(page, 'balances');
let t = await text(page);
assert.match(t, /You get\s*NT\$1,150/);
assert.match(t, /小偉\s*→[^N]*You\s*NT\$1,150/);
assert.match(t, /小偉\s*→[^N]*Mia\s*NT\$225/);
check('splits, currency and simplified debts add up');

await page.uncheck('#simp');
await page.waitForFunction(() => /each expense/.test(document.getElementById('app').textContent));
assert.match(await text(page), /Who pays whom/);
assert.match(await text(page), /You receive/);
assert.match(await text(page), /Between others/);
assert.equal(await page.locator('.debt.get [data-action=settle]').first().textContent(), 'Mark received');
await page.check('#simp');
check('simplify toggle');

/* A backwards rate gets caught */
await tab(page, 'expenses');
await page.click('[data-action=add-expense]');
await page.fill('#fDesc', 'Backwards rate');
await page.fill('#fAmt', '100');
await page.selectOption('#fCur', 'USD');
assert.match(await page.textContent('#dlg'), /1 USD = how many TWD/);
await page.fill('#fRate', '0.03');
await page.waitForSelector('#fRateWarn .check.bad');
assert.match(await page.textContent('#fRateWarn'), /looks backwards/);
await page.click('#fSave');
await toastSays(/looks backwards/);
assert.equal(await page.evaluate(() => document.getElementById('dlg').open), true, 'the first Save stops');
await page.click('[data-action=rate-flip]');
assert.equal(await page.inputValue('#fRate'), '33.3333');
assert.equal(await page.locator('#fRateWarn .check.bad').count(), 0);
assert.equal(await page.inputValue('#fDesc'), 'Backwards rate', 'flipping keeps what was typed');
await page.click('[data-action=form-cancel]');
await page.click('[data-action=add-expense]');
await page.click('[data-action=draft-discard]');
await page.click('[data-action=draft-discard]');
await page.click('[data-action=form-cancel]');
await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('triptab:currency:')) localStorage.removeItem(k); });
check('a backwards exchange rate is caught and can be flipped');

/* An exchange rate can wait */
await tab(page, 'balances');
const beforeUnrated = await page.textContent('.hero');
await tab(page, 'expenses');
await page.click('[data-action=add-expense]');
await page.fill('#fDesc', 'Taxi no rate');
await page.fill('#fAmt', '3000');
await page.selectOption('#fCur', 'KRW');
await page.fill('#fRate', 'abc');
await page.click('#fSave');
await toastSays(/isn't a number/);
await page.fill('#fRate', '');
await page.click('#fSave');
await page.waitForSelector('.tap:has-text("Taxi no rate") .tag.warn');
await tab(page, 'balances');
await page.waitForSelector('#unrated');
assert.match(await page.textContent('#unrated'), /1 expense needs an exchange rate/);
assert.match(await page.textContent('.hero'), /Leaves out 1 expense/);
assert.ok((await page.textContent('.hero')).startsWith(beforeUnrated.trim().slice(0, 12)), 'the balance is unchanged');
await page.click('[data-action=settle] >> nth=0');
assert.match(await page.textContent('#dlg'), /waiting for an exchange rate/);
await page.click('[data-action=close-sheet]');
await page.click('#unrated [data-action=edit-entry]');
await page.fill('#fRate', '42');
await page.click('#fSave');
await page.waitForFunction(() => !document.getElementById('unrated'));
assert.ok(!/Leaves out/.test(await page.textContent('.hero')));
check('an expense can wait for its exchange rate, and is counted once it has one');
await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('triptab:currency:')) localStorage.removeItem(k); });
await tab(page, 'expenses');

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
assert.match(await page.textContent('#splitArea'), /extra of NT\$100/);
await page.click('[data-action=split-mode][data-id=items]');
assert.equal(await page.getAttribute('[data-action=split-mode][data-id=items]', 'aria-pressed'), 'true', 'tapping the selected mode keeps it');
assert.equal(await page.inputValue('#it-n-0'), 'Beer');
await page.click('#fSave');
await page.waitForSelector('.tap:has-text("Items test")');
check('typed values survive; by-item split saves');

/* Why someone owes what they owe */
await tab(page, 'balances');
const shownBalance = await page.locator('.person-row:has-text("Jonathan") .amt').textContent();
await page.click('.person-row:has-text("Jonathan")');
await page.waitForSelector('#ledger');
assert.match(await page.textContent('#ledger'), /Rental car/);
assert.match(await page.textContent('#ledger'), /Paid NT\$4,800 · share NT\$1,600/);
assert.ok(shownBalance.replace(/[+−]/, '').length > 0 && (await page.locator('#ledger .big').textContent()).includes(shownBalance.replace(/[+−]/, '')), 'the total matches the balance');
await page.click('#ledger .tap:has-text("Rental car")');
await page.waitForSelector('#dlg [data-action=close-sheet]');
assert.match(await page.textContent('#dlg .detail-title'), /Rental car/);
await page.click('[data-action=close-sheet]');
check('tapping a person explains their balance');

/* Category suggestions */
await tab(page, 'expenses');
await page.click('[data-action=add-expense]');
const pressed = () => page.getAttribute('.cat-pick[aria-pressed="true"]', 'data-id');
const startingCategory = await pressed();
await page.fill('#fDesc', 'Taxi to the station');
assert.equal(await pressed(), 'transport');
assert.match(await page.textContent('#catHint'), /Suggested/);
await page.fill('#fDesc', 'Beers');
assert.equal(await pressed(), 'drinks');
assert.equal(await page.inputValue('#fDesc'), 'Beers', 'typing keeps the text');
assert.equal(await page.evaluate(() => document.activeElement.id), 'fDesc', 'typing keeps the cursor');
await page.fill('#fDesc', 'Zxqv');
assert.equal(await pressed(), startingCategory, 'with nothing to go on, it returns to the last category');
await page.click('.cat-pick[data-id=shopping]');
await page.fill('#fDesc', 'Hotel');
assert.equal(await pressed(), 'shopping', 'your own choice is never overridden');
await page.click('[data-action=form-cancel]');
await page.click('[data-action=add-expense]');
await page.click('[data-action=draft-discard]');
await page.click('[data-action=draft-discard]');
await page.click('[data-action=form-cancel]');
check('categories are easy to tap, and suggested as you type');

/* Shorter form with recent defaults */
await tab(page, 'expenses');
await page.click('[data-action=add-expense]');
assert.equal(await page.isVisible('#fDate'), false, 'details start tucked away');
assert.match(await page.textContent('.more-toggle'), /Today/);
assert.equal(await page.locator('#fPayer option:checked').textContent(), '小偉', 'the last payer is suggested');
await page.fill('#fDesc', 'Kept typing');
await page.click('[data-action=form-more]');
assert.equal(await page.isVisible('#fDate'), true);
assert.equal(await page.inputValue('#fDesc'), 'Kept typing');
await page.click('[data-action=form-cancel]');
await page.click('[data-action=add-expense]');
await page.click('[data-action=draft-discard]');
await page.click('[data-action=draft-discard]');
await page.click('[data-action=form-cancel]');
check('details are tucked away, and recent choices are suggested');

/* Feedback and navigation */
await page.click('[data-action=add-expense]');
assert.equal(await page.evaluate(() => document.activeElement.id), 'fDesc', 'a new expense starts in the description');
await page.fill('#fDesc', 'Fresh row');
await page.fill('#fAmt', '20');
await page.click('#fSave');
await page.waitForSelector('.tap.fresh:has-text("Fresh row")');
await page.goBack();
await page.waitForSelector('.home-head');
await page.goForward();
await page.waitForSelector('#entryList');
check('saving highlights the new row; the phone back button returns to your trips');

/* Multiple payers, validation */
await page.click('[data-action=add-expense]');
await page.fill('#fDesc', 'Shared hotel');
await page.fill('#fAmt', '1000');
await page.click('[data-action=toggle-multi]');
await page.fill('[id^=pay-] >> nth=2', '');
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
assert.match(before, /You receive/);
await page.click('[data-action=settle][data-from] >> nth=0');
await page.click('form[data-form=settle] .btn.primary');
await page.waitForFunction(() => document.getElementById('app').textContent !== '');
await toastSays(/Marked as paid/);
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
await page.click('[data-action=form-more]');
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
await tab(page, 'invite');
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
await friend.waitForSelector('[data-action=auth-google]');
assert.match(await text(friend), /Sign in to join this trip/);
assert.ok(!(await text(friend)).includes('Okinawa'), 'the trip stays hidden until sign-in');
await signUp(friend, 'Rui');
await friend.waitForSelector('#joinName');
assert.match(await text(friend), /Which one is you/);
assert.equal(await friend.inputValue('#joinName'), 'Rui', 'your account name is suggested');
await friend.fill('#joinName', 'Rui');
await friend.click('form[data-form=join-self] button');
await friend.waitForFunction(() => !/Which one is you/.test(document.getElementById('app').textContent));
await tab(friend, 'people');
await friend.waitForSelector('input[value="Rui"]', { timeout: 8000 }).catch(async e => {
  console.log('Friend sees:', friend.url(), (await text(friend)).slice(0, 700));
  throw e;
});
assert.deepEqual(friend.errors, []);
await fresh.close();
check('a friend picks or adds their name');

/* Rights: a friend on another phone */
{
  const dump = await page.evaluate(() => localStorage.getItem('triptab:localdb'));
  const friendPhone = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['clipboard-read', 'clipboard-write'] });
  await friendPhone.addInitScript(d => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('triptab:localdb', d); } }, dump);
  const pal = await openPage(friendPhone, invite);
  await signUp(pal, 'Mia');
  await pal.waitForSelector('#joinName');
  const picker = await pal.textContent('#app');
  assert.ok(!/Jonathan/.test(await pal.textContent('.chips')), 'names already claimed are not offered');
  assert.match(picker, /tied to your account/);
  await pal.click('[data-action=set-me]:has-text("Mia")');
  await pal.waitForFunction(() => !/Which one is you/.test(document.getElementById('app').textContent));
  await pal.waitForSelector('#welcomeCard');
  await pal.click('[data-action=welcome-dismiss]');
  await pal.waitForFunction(() => !document.getElementById('welcomeCard'));
  await pal.reload();
  await pal.waitForSelector('.tap:has-text("Rental car")');
  assert.equal(await pal.locator('#welcomeCard').count(), 0, 'the welcome appears once');
  await pal.click('.tap:has-text("Rental car")', { button: 'right' });
  await pal.waitForSelector('#rowMenu');
  assert.equal(await pal.locator('#rowMenu [data-action=edit-entry]').count(), 0, "the menu won't offer to edit someone else's expense");
  assert.equal(await pal.locator('#rowMenu [data-action=delete-entry]').count(), 0);
  await pal.click('#rowMenu [data-action=close-sheet]');
  await pal.waitForFunction(() => !document.getElementById('dlg').open);
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
  await tab(pal, 'settings');
  assert.equal(await pal.locator('[data-action=confirm-delete]').count(), 0);
  assert.equal(await pal.locator('[data-action=backup-paste]').count(), 0);
  await tab(pal, 'people');
  assert.equal(await pal.locator('[data-action=confirm-replace]').count(), 0);
  assert.equal(await pal.locator('[data-action=release-claim]').count(), 0);
  assert.equal(await pal.locator('#newMember').count(), 0);
  assert.ok(await pal.locator('input[aria-label="Jonathan\'s name"]').isDisabled());
  assert.ok(!(await pal.locator('input[aria-label="Mia\'s name"]').isDisabled()), 'can rename themselves');
  await tab(pal, 'payment');
  assert.ok(!(await pal.locator('input[aria-label="Mia\'s Venmo"]').isDisabled()));
  assert.ok(await pal.locator('input[aria-label="Jonathan\'s Venmo"]').isDisabled());
  await tab(pal, 'people');

  /* The same account on a new device */
  const dump2 = await pal.evaluate(() => localStorage.getItem('triptab:localdb'));
  const newPhone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await newPhone.addInitScript(d => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('triptab:localdb', d); } }, dump2);
  const moved = await openPage(newPhone, server.url);
  await moved.waitForSelector('#authEmail');
  await moved.fill('#authEmail', 'mia@example.com');
  await moved.fill('#authPassword', 'password1');
  await moved.click('form[data-form=auth-in] button');
  await moved.waitForSelector('.tap:has-text("Okinawa")');
  await moved.click('.tap:has-text("Okinawa")');
  await moved.waitForSelector('.tap:has-text("Mia lunch")');
  await moved.waitForFunction(() => !/Which one is you/.test(document.getElementById('app').textContent));
  assert.deepEqual(moved.errors, []);
  await newPhone.close();
  assert.deepEqual(pal.errors, []);
  await friendPhone.close();
  check("friends can change only their own things; their account brings their name and trips to a new device");
}

/* Offline: writes that have not reached the server must not block the screen */
await page.evaluate(() => localStorage.setItem('triptab:test-hang-writes', 'true'));
await addExpense(page, 'Offline dinner', '200');
await toastSays(/Expense added/);
await page.evaluate(() => localStorage.removeItem('triptab:test-hang-writes'));
check('saving works while a write is still waiting on the network');

/* Backups */
await tab(page, 'settings');
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
await tab(page, 'people');
await page.fill('#newMember', 'Temp');
await page.click('form[data-form=add-member] button');
await page.waitForSelector('[aria-label="Remove Temp"]');
await page.click('[aria-label="Remove Temp"]');
await page.waitForFunction(() => !document.querySelector('[aria-label="Remove Temp"]'));
assert.equal(await page.locator('[aria-label="Remove Mia"]').count(), 0);
/* A name only on a deleted expense can go, and restoring the expense brings it back */
await page.fill('#newMember', 'Ghost');
await page.click('form[data-form=add-member] button');
await page.waitForSelector('[aria-label="Remove Ghost"]');
await page.click('[data-action=add-expense]');
await page.fill('#fDesc', 'Ghost lunch');
await page.fill('#fAmt', '40');
await page.click('#fSave');
await tab(page, 'people');
await page.waitForSelector('input[value="Ghost"]');
assert.equal(await page.locator('[aria-label="Remove Ghost"]').count(), 0);
assert.match(await page.textContent('.stack:has(> .row input[value="Ghost"])'), /On 1 entry/);
await tab(page, 'expenses');
await page.click('.tap:has-text("Ghost lunch")', { button: 'right' });
await page.click('#rowMenu [data-action=delete-entry]');
await tab(page, 'people');
await page.click('[aria-label="Remove Ghost"]');
await page.waitForFunction(() => !document.querySelector('input[value="Ghost"]'));
await tab(page, 'activity');
await page.click('[data-action=open-entry]:has-text("Ghost lunch"), .row:has-text("Ghost lunch") [data-action=restore-entry]');
if (await page.locator('#dlg [data-action=restore-entry]').count()) await page.click('#dlg [data-action=restore-entry]');
await page.waitForFunction(() => /Ghost is back on the trip/.test(document.getElementById('toast').textContent));
await tab(page, 'people');
await page.waitForSelector('input[value="Ghost"]');
await tab(page, 'expenses');
await page.click('.tap:has-text("Ghost lunch")', { button: 'right' });
await page.click('#rowMenu [data-action=delete-entry]');
await tab(page, 'people');
await page.click('[aria-label="Remove Ghost"]');
await page.waitForFunction(() => !document.querySelector('input[value="Ghost"]'));
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
  await page.click('.tap:has-text("Credit test")');
  assert.match(await page.textContent('#dlg'), /Added by Jonathan on/);
  await page.click('[data-action=close-sheet]');
  await tab(page, 'activity');
  await page.waitForFunction(() => /added "Credit test".*split among Jonathan, Mia Chen/.test(document.getElementById('app').textContent));
}
check('each expense shows who added it and who it is split among');

/* Name required, and the joined list counts people without one */
{
  const dump = await page.evaluate(() => localStorage.getItem('triptab:localdb'));
  const quiet = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await quiet.addInitScript(d => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('triptab:localdb', d); } }, dump);
  const noName = await openPage(quiet, invite);
  await signUp(noName, 'Quiet Person', 'quiet@example.com');
  await noName.waitForSelector('#joinName');
  await noName.click('[data-action=add-expense]');
  await noName.waitForFunction(() => /Choose your name/.test(document.getElementById('toast').textContent));
  assert.equal(await noName.evaluate(() => document.getElementById('dlg').open), false);
  await tab(noName, 'people');
  await noName.waitForFunction(() => /names claimed/.test(document.getElementById('app').textContent));
  assert.ok(!(await text(noName)).includes('jonathan@example.com'), "other people's emails stay hidden");
  const joinedDump = await noName.evaluate(() => localStorage.getItem('triptab:localdb'));
  await quiet.close();
  await page.evaluate(d => { localStorage.setItem('triptab:localdb', d); }, joinedDump);
  await page.reload();
  await tab(page, 'people');
  await page.waitForFunction(() => /hasn't picked a name/.test(document.getElementById('app').textContent));
  const joinedText = await page.textContent('section:has(#joinedCount)');
  assert.match(joinedText, /quiet@example\.com/);
  assert.match(joinedText, /Quiet Person/);
  assert.match(await page.textContent('#joinedCount'), /1 hasn't picked a name/);
  /* Removing someone takes two taps and can be undone */
  const removeBtn = page.locator('.joined-row:has-text("quiet@example.com") [data-action=remove-person]');
  await removeBtn.click();
  assert.match(await removeBtn.textContent(), /Tap again/);
  await removeBtn.click();
  await page.waitForSelector('[data-action=let-back-in]');
  assert.match(await page.textContent('#joinedCount'), /Everyone has picked a name/);
  const removedDump = await page.evaluate(() => localStorage.getItem('triptab:localdb'));
  const back = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await back.addInitScript(d => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('triptab:localdb', d); } }, removedDump);
  const gone = await openPage(back, invite);
  await gone.waitForSelector('#authEmail');
  await gone.fill('#authEmail', 'quiet@example.com');
  await gone.fill('#authPassword', 'password1');
  await gone.click('form[data-form=auth-in] button');
  await gone.waitForFunction(() => /can't open this trip/.test(document.getElementById('app').textContent));
  assert.ok(!(await text(gone)).includes('Rental car'));
  await back.close();
  await page.click('[data-action=let-back-in]');
  await page.waitForFunction(() => /1 hasn't picked a name/.test(document.getElementById('joinedCount').textContent));
  check('admins see everyone who joined, named or not, and can remove them or let them back in');
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
await page.selectOption('#fPayer', { index: 0 });
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

/* Filters */
await tab(page, 'expenses');
await page.click('[data-action=filters-toggle]');
await page.waitForSelector('#filterPanel');
const everything = await page.locator('.tap').count();
await page.selectOption('#fltPerson', { label: '小偉' });
await page.waitForSelector('#filterSummary');
assert.ok(await page.locator('.tap').count() < everything);
assert.match(await page.textContent('#filterToggle'), /Filters \(1\)/);
await tab(page, 'balances');
await tab(page, 'expenses');
assert.match(await page.textContent('#filterToggle'), /Filters \(1\)/, 'filters stay while moving between tabs');
await page.selectOption('#fltPerson', { label: 'Everyone' });
await page.selectOption('#fltType', 'kind:refund');
assert.equal(await page.locator('.tap').count(), 1);
assert.match(await page.textContent('.tap'), /Deposit back/);
await page.selectOption('#fltType', '');
await page.fill('#fltMin', '4000');
assert.equal(await page.inputValue('#fltMin'), '4000');
assert.equal(await page.evaluate(() => document.activeElement.id), 'fltMin', 'typing keeps the cursor in the box');
assert.equal(await page.locator('.tap').count(), 1);
await page.fill('#fltMax', '1');
assert.match(await page.textContent('#entryList'), /No matches/);
await page.click('#entryList [data-action=filters-clear]');
assert.equal(await page.locator('.tap').count(), everything);
await page.selectOption('#fltSort', 'largest');
assert.equal(await page.locator('.date-head').count(), 0);
assert.match(await page.locator('.tap').first().textContent(), /Rental car/);
await page.fill('#fltFrom', '2099-01-01');
assert.match(await page.textContent('#entryList'), /No matches/);
await page.click('#filterPanel [data-action=filters-clear]');
await page.click('[data-action=filters-toggle]');
check('filter by person, type, date and amount, and sort');

/* A rough dollar figure while typing a foreign amount */
await tab(page, 'expenses');
await page.click('[data-action=add-expense]');
await page.selectOption('#fCur', 'THB');
await page.fill('#fAmt', '3500');
await page.waitForFunction(() => /Roughly \$100/.test(document.getElementById('fUsd').textContent));
await page.fill('#fAmt', '');
await page.waitForFunction(() => document.getElementById('fUsd').textContent === '');
await page.click('[data-action=form-cancel]');
await page.waitForFunction(() => !document.getElementById('dlg').open);
check('typing a foreign amount shows roughly how much it is in dollars');

/* Setting an exchange rate in settings */
await tab(page, 'settings');
await page.selectOption('#newRateCur', 'GBP');
await page.waitForFunction(() => document.querySelector('#newRateCur').value === 'GBP');
await page.fill('#newRate', '1.3');
await page.click('form[data-form=add-rate] button');
await page.waitForSelector('#savedRate-GBP');
await page.fill('#savedRate-GBP', '1.25');
await page.locator('#savedRate-GBP').blur();
await tab(page, 'expenses');
await page.click('[data-action=add-expense]');
await page.selectOption('#fCur', 'GBP');
await page.fill('#fAmt', '');
await page.waitForFunction(() => document.getElementById('fRate')?.value);
const gbpRate = await page.inputValue('#fRate');
await page.click('[data-action=form-cancel]');
await page.waitForFunction(() => !document.getElementById('dlg').open);
assert.ok(['1.25', '0.8'].includes(gbpRate), gbpRate);
check('an exchange rate set in settings fills in on new expenses');

/* Color and picture */
await page.click('.topbar [data-action=edit-avatar]');
await page.click('#avatarBody [data-action=pick-pic][data-id="fox"]');
await page.click('#avatarBody [data-action=pick-color][data-id="12"]');
assert.equal(await page.getAttribute('#avatarBody [data-action=pick-color][data-id="12"]', 'aria-pressed'), 'true');
assert.equal(await page.locator('#avatarBody .ava-preview .ava.pic svg').count(), 1);
await page.click('[data-action=close-sheet]');
await page.waitForSelector('.topbar .ava.pic svg');
assert.equal(await page.locator('.tap.payer-strip').first().evaluate(el => el.style.getPropertyValue('--payer').startsWith('var(--')), true);
await page.click('.topbar [data-action=edit-avatar]');
assert.ok(await page.locator('.color-pick[disabled]').count() >= 1, "other people's colors can't be picked");
await page.click('[data-action=close-sheet]');
check('you can pick your own color and picture');

/* Asking for payment details */
await tab(page, 'expenses');
{
  const nudge = page.locator('#paymentNudge');
  if (await nudge.count()) {
    await page.click('#paymentNudge [data-action=add-payment]');
    await page.waitForSelector('input[aria-label="Jonathan\'s Venmo"]');
    assert.ok(await page.locator('[data-action=people-tab][data-id=payment][aria-pressed=true]').count());
    await tab(page, 'expenses');
    await page.click('#paymentNudge [data-action=payment-nudge-dismiss]');
    await page.waitForFunction(() => !document.getElementById('paymentNudge'));
  }
}
check('the app asks for a Venmo or Zelle, once on the expenses screen');

/* Light by default, dark if chosen, remembered */
assert.equal(await page.evaluate(() => document.documentElement.dataset.look), 'light');
await page.click('.topbar [data-action=edit-avatar]');
await page.click('[data-action=set-look][data-id=dark]');
assert.equal(await page.evaluate(() => document.documentElement.dataset.look), 'dark');
await page.reload();
await page.waitForSelector('.topbar [data-action=edit-avatar]');
assert.equal(await page.evaluate(() => document.documentElement.dataset.look), 'dark');
await page.click('.topbar [data-action=edit-avatar]');
await page.click('[data-action=set-look][data-id=light]');
await page.click('[data-action=open-settings]');
await page.waitForSelector('#tripName');
check('light is the default, and dark can be chosen and is remembered');

/* Home shows USD by default, and can show another currency */
await page.click('[data-action=home]');
await page.waitForSelector('#homeCur');
assert.equal(await page.inputValue('#homeCur'), 'USD');
assert.match(await page.textContent('#homeBalance'), /\$/);
await page.selectOption('#homeCur', 'EUR');
await page.waitForFunction(() => /€/.test(document.getElementById('homeBalance').textContent));
await page.selectOption('#homeCur', 'USD');
await page.click('.tap >> nth=0');
await page.waitForSelector('[data-tab=expenses]');
check('home shows balances in USD, with an option to switch');

/* Clicking outside closes what's open */
await tab(page, 'expenses');
await page.setViewportSize({ width: 1000, height: 800 });
await page.click('.tap:has-text("Credit test")', { button: 'right' });
await page.waitForSelector('#rowMenu');
await page.mouse.click(5, 5);
await page.waitForFunction(() => !document.getElementById('dlg').open);
await page.click('[data-action=add-expense]');
await page.fill('#fDesc', 'Kept by clicking away');
await page.mouse.click(5, 400);
await page.waitForFunction(() => !document.getElementById('dlg').open);
await page.click('[data-action=add-expense]');
assert.equal(await page.inputValue('#fDesc'), 'Kept by clicking away');
await page.fill('#fDesc', '');
await page.click('[data-action=form-cancel]');
await page.waitForFunction(() => !document.getElementById('dlg').open);
await page.click('[data-action=filters-toggle]');
await page.waitForSelector('.filters');
await page.click('.date-head >> nth=0');
await page.waitForFunction(() => !document.querySelector('.filters'));
await page.setViewportSize({ width: 390, height: 844 });
check('clicking outside closes menus, forms and filters, keeping what was typed');

/* Quick actions: right-click and long press */
await tab(page, 'expenses');
await page.click('.tap:has-text("Credit test")', { button: 'right' });
await page.waitForSelector('#rowMenu');
assert.match(await page.textContent('#rowMenu'), /Edit expense/);
await page.click('#rowMenu [data-action=edit-entry]');
assert.equal(await page.inputValue('#fDesc'), 'Credit test');
await page.click('[data-action=form-cancel]');
const holdRow = async (ms, moveBy = 0) => page.evaluate(async ([wait, move]) => {
  const row = [...document.querySelectorAll('.tap')].find(r => /Credit test/.test(r.textContent));
  const at = { bubbles: true, pointerType: 'touch', clientX: 50, clientY: 50 };
  row.dispatchEvent(new PointerEvent('pointerdown', at));
  if (move) row.dispatchEvent(new PointerEvent('pointermove', { ...at, clientY: 50 + move }));
  await new Promise(r => setTimeout(r, wait));
  row.dispatchEvent(new PointerEvent('pointerup', at));
  row.click();
}, [ms, moveBy]);
await holdRow(650);
await page.waitForSelector('#rowMenu');
assert.equal(await page.locator('#dlg .detail-title').count(), 0, 'lifting your finger does not also open the expense');
await page.click('#rowMenu [data-action=close-sheet]');
await page.waitForFunction(() => !document.getElementById('dlg').open);
await holdRow(650, 40);
await page.waitForSelector('#dlg .detail-title');
assert.equal(await page.locator('#rowMenu').count(), 0, 'scrolling never opens the menu');
await page.click('[data-action=close-sheet]');
await holdRow(50);
await page.waitForSelector('#dlg .detail-title');
await page.click('[data-action=close-sheet]');
await page.click('.tap:has-text("Credit test")', { button: 'right' });
await page.click('#rowMenu [data-action=delete-entry]');
await toastSays(/Deleted/);
await page.click('#toast [data-action=undo]');
await page.waitForSelector('.tap:has-text("Credit test")');
check('long press and right-click offer quick actions; a quick tap and scrolling still behave');

/* Duplicate */
await page.click('.tap:has-text("Credit test")');
await page.click('[data-action=duplicate-entry]');
assert.equal(await page.inputValue('#fDesc'), 'Credit test');
await page.fill('#fDesc', 'Credit copy');
await page.click('#fSave');
await page.waitForSelector('.tap:has-text("Credit copy")');
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
await tab(page, 'payment');
await page.fill('input[aria-label="Mia Chen\'s Venmo"]', '@mia');
await page.press('input[aria-label="Mia Chen\'s Venmo"]', 'Tab');
await page.fill('input[aria-label="Jonathan\'s Zelle"]', 'j@example.com');
await page.press('input[aria-label="Jonathan\'s Zelle"]', 'Tab');
await tab(page, 'balances');
await page.waitForSelector('.debt .handle');
const handleBtn = page.locator('[data-action=copy-handle]').first();
const handleValue = await handleBtn.getAttribute('data-value');
await handleBtn.click();
assert.equal(await page.evaluate(() => navigator.clipboard.readText()), handleValue);
/* Settling up with those details */
await page.click('[data-action=settle][data-from] >> nth=0');
await page.waitForSelector('#settlePay');
await page.selectOption('#sTo', { label: 'Mia Chen' });
assert.match(await page.textContent('#settlePay'), /Venmo: @mia/);
assert.equal(await page.getAttribute('#settleMethods [data-id=venmo]', 'aria-pressed'), 'true', 'it picks the method they accept');
await page.selectOption('#sTo', { label: 'Jonathan' });
await page.selectOption('#sFrom', { label: 'Mia Chen' });
assert.match(await page.textContent('#settlePay'), /Zelle: j@example\.com/);
assert.equal(await page.getAttribute('#settleMethods [data-id=zelle]', 'aria-pressed'), 'true');
assert.equal(await page.inputValue('#sCur'), 'USD', 'Zelle suggests dollars');
await page.fill('#sAmt', '330');
await page.fill('#sRate', '0.03');
await page.waitForSelector('#sRateWarn .check.bad');
await page.fill('#sRate', '33');
assert.equal(await page.inputValue('#sSend'), '10.00');
assert.match(await page.textContent('#settlePay'), /Send: \$10\.00/);
await page.fill('#sSend', '20');
assert.equal(await page.inputValue('#sAmt'), '660', 'changing what you send changes what it covers');
await page.selectOption('#sCur', 'TWD');
await page.click('[data-action=settle-method][data-id=zelle]');
assert.equal(await page.inputValue('#sCur'), 'TWD', 'your own choice of currency stays');
await page.fill('#sAmt', '12');
assert.match(await page.textContent('#settlePay'), /NT\$12/);
await page.click('[data-action=settle-method][data-id=cash]');
await page.click('#settleSave');
await toastSays(/Marked as paid/);
await tab(page, 'expenses');
await page.waitForSelector('.tap:has-text("Settlement in cash")');
const cashRows = await page.locator('.tap:has-text("Settlement in cash")').count();
await page.locator('.tap:has-text("Settlement in cash")').first().click();
assert.match(await page.textContent('#dlg'), /Paid in cash/);
await page.click('#dlg [data-action=delete-entry]');
await page.waitForFunction(n => document.querySelectorAll('#entryList .tap').length && [...document.querySelectorAll('#entryList .tap')].filter(r => /Settlement in cash/.test(r.textContent)).length === n - 1, cashRows);
check('payment details appear beside debts and copy; settling up shows them and marks it paid');

/* Paying in another currency clears the debt exactly */
await tab(page, 'balances');
await page.click('[data-action=settle][data-from] >> nth=0');
await page.waitForSelector('#settlePay');
await page.selectOption('#sCur', 'USD');
await page.fill('#sRate', '33');
const owedBefore = await page.inputValue('#sAmt');
await page.click('#settleSave');
await toastSays(/Marked as paid/);
await page.waitForFunction(v => ![...document.querySelectorAll('.debt .amt')].some(a => a.textContent.includes(Number(v).toLocaleString('en'))), owedBefore);
await tab(page, 'expenses');
const usdRow = page.locator('.tap:has-text("Settlement")').filter({ hasText: '$' }).first();
assert.match(await usdRow.textContent(), new RegExp(`NT\\$${Number(owedBefore).toLocaleString('en')}`), 'both amounts show');
await usdRow.click();
assert.match(await page.textContent('#dlg'), /at 1 USD = 33 TWD/);
await page.click('[data-action=close-sheet]');
check('paying in another currency clears the debt exactly');

/* Archive */
await tab(page, 'settings');
await page.click('[data-action=archive-toggle]');
await page.waitForSelector('.home-head');
assert.equal(await page.locator('.tap').count(), 0);
await page.click('[data-action=toggle-archived]');
await page.click('.tap');
await page.waitForSelector('#entryList');
await tab(page, 'settings');
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
  await signUp(kai, 'Kai');
  await kai.click('[data-action=set-me]:has-text("Kai")');
  await kai.waitForFunction(() => !/Which one is you/.test(document.getElementById('app').textContent));
  const after = await kai.evaluate(() => localStorage.getItem('triptab:localdb'));
  await kaiPhone.close();
  await page.evaluate(d => { localStorage.setItem('triptab:localdb', d); }, after);
  await page.reload();
  await page.waitForSelector('[data-action=release-claim]');
  assert.match(await text(page), /Claimed/);
  const rows = page.locator('.stack:has(input[value="Kai"]) [data-action=release-claim]');
  await rows.click();
  await page.waitForFunction(() => /Name freed/.test(document.getElementById('toast').textContent));
}
check('an admin can free a name for someone who lost their phone');

/* Link reminder and replacing a link */
await tab(page, 'expenses');
await page.waitForSelector('[data-action=copy-link]');
await page.click('[data-action=copy-link]');
await page.waitForFunction(() => !document.querySelector('[data-action=copy-link]'));
assert.match(await page.evaluate(() => navigator.clipboard.readText()), /#join-/);
await tab(page, 'invite');
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
await tab(page, 'settings');
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

/* Settling everything */
await page.click('[data-action=home]');
await page.waitForSelector('.home-head');
await page.click('[data-action=new-trip] >> nth=0');
await page.fill('#ntName', 'Quick trip');
await page.fill('#ntPeople', 'Jonathan\nPat');
await page.selectOption('#ntCur', 'USD');
await page.click('form[data-form=new-trip] .btn.primary');
await page.waitForSelector('[data-action=invite-first]');
await addExpense(page, 'Lunch', '20');
await tab(page, 'balances');
await page.click('[data-action=settle] >> nth=0');
await page.click('form[data-form=settle] .btn.primary');
await page.waitForSelector('#settledUp');
assert.match(await page.textContent('#settledUp'), /Everyone is settled up/);
assert.match(await page.textContent('#tripTotals'), /Their share/);
assert.ok(await page.locator('#paymentsMade .row-btn').count() >= 1, 'payments stay visible after settling up');
await page.click('#settledUp [data-action=archive-toggle]');
await page.waitForSelector('.home-head');
await page.click('[data-action=toggle-archived]');
assert.match(await text(page), /Quick trip/);
check('a settled trip says so, and offers to archive');

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
