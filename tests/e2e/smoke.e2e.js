/** The basics, on small, medium and large screens. SMOKE_FILE=<preview.html> runs them on the built preview. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { serve } from './serve.js';
import { addExpense, createTrip, launch, noSideScroll, openPage, signUp, tab, text, check } from './helpers.js';

const VIEWPORTS = [{ width: 320, height: 640, colorScheme: 'light' }, { width: 390, height: 844, colorScheme: 'dark' }, { width: 768, height: 1024, colorScheme: 'light' }];
let root = '.', file = '';
if (process.env.SMOKE_FILE) {
  root = mkdtempSync(join(tmpdir(), 'smoke-'));
  writeFileSync(join(root, 'index.html'), `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>${readFileSync(process.env.SMOKE_FILE, 'utf8')}</body></html>`);
  file = process.env.SMOKE_FILE;
}
const server = await serve(root), browser = await launch();
let total = 0;
for (const v of VIEWPORTS) {
  const label = `${v.width}px ${v.colorScheme}`;
  const context = await browser.newContext({ viewport: { width: v.width, height: v.height }, colorScheme: v.colorScheme });
  const page = await openPage(context, server.url);
  if (file) {
    // The preview opens signed in, so sign out to reach the same starting point.
    await page.waitForSelector('[data-action=auth-signout]');
    await noSideScroll(page, `${label} preview home`);
    await page.click('[data-action=auth-signout]');
  }
  await page.waitForSelector('[data-action=auth-google]');
  await noSideScroll(page, `${label} sign-in`);
  await signUp(page);
  await page.waitForSelector('[data-action=new-trip]');
  await noSideScroll(page, `${label} home`);
  await createTrip(page);
  await noSideScroll(page, `${label} people`);
  await addExpense(page, 'Rental car', '4800');
  assert.ok(await page.isVisible('[data-action=add-expense]'), 'Add expense stays visible');
  for (const name of ['expenses', 'balances', 'insights', 'activity', 'people']) {
    await tab(page, name);
    await page.waitForTimeout(30);
    await noSideScroll(page, `${label} ${name}`);
    assert.ok((await text(page)).length > 20, `${name} shows something`);
    total += 1;
  }
  await tab(page, 'balances');
  assert.match(await text(page), /NT\$3,200/);
  await page.reload();
  await page.waitForSelector('#entryList, .ticket');
  assert.match(await text(page), /NT\$3,200/, 'data survives a reload');
  await tab(page, 'expenses');
  await page.click('.tap:has-text("Rental car")');
  await page.waitForSelector('#dlg .big');
  await noSideScroll(page, `${label} detail`);
  await page.click('[data-action=close-sheet]');
  await page.click('[data-action=add-expense]');
  await noSideScroll(page, `${label} form`);
  for (const mode of ['exact', 'percent', 'shares', 'adjust', 'items']) {
    await page.click(`[data-action=split-mode][data-id=${mode}]`);
    const over = await page.evaluate(() => { const b = document.querySelector('#dlg .sheet-body'); return b.scrollWidth - b.clientWidth; });
    assert.ok(over <= 0, `${label} form ${mode} overflows by ${over}`);
    total += 1;
  }
  assert.deepEqual(page.errors, [], `${label}: JavaScript errors`);
  await context.close();
  check(label);
}
await browser.close();
server.close();
console.log(`Smoke passed${file ? ` on ${file}` : ''} (${total} screen checks)`);
