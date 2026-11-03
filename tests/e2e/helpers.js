import { chromium } from 'playwright';
import assert from 'node:assert/strict';

export const launch = () => chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

/** Blocks outside fonts so tests don't depend on the network, and collects JavaScript errors. */
export async function openPage(context, url) {
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await page.goto(url);
  return page;
}
/** Creates an account in the simulated sign-in and verifies it. */
export async function signUp(page, name = 'Jonathan', email = `${name.toLowerCase().replace(/\s/g, '')}@example.com`) {
  await page.waitForSelector('[data-action=auth-google]');
  await page.click('[data-action=auth-mode][data-id=up]');
  await page.fill('#authName', name);
  await page.fill('#authEmail', email);
  await page.fill('#authPassword', 'password1');
  await page.click('form[data-form=auth-up] button');
  await page.waitForSelector('[data-action=auth-simulate]');
  await page.click('[data-action=auth-simulate]');
}
export async function createTrip(page, name = 'Okinawa', people = 'Jonathan\nMia\n小偉') {
  await page.click('[data-action=new-trip] >> nth=0');
  await page.fill('#ntName', name);
  await page.fill('#ntPeople', people);
  await page.selectOption('#ntCur', 'TWD');
  await page.click('form[data-form=new-trip] .btn.primary');
  await page.waitForSelector('#inviteLink');
}
export async function tab(page, name) { await page.click(`[data-tab=${name}]`); }
export async function addExpense(page, desc, amount, during) {
  await tab(page, 'expenses');
  await page.click('[data-action=add-expense]');
  await page.fill('#fDesc', desc);
  await page.fill('#fAmt', amount);
  if (during) await during();
  await page.click('#fSave');
  await page.waitForSelector(`.tap:has-text("${desc}")`);
}
export async function noSideScroll(page, label) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(over <= 0, `${label}: page scrolls sideways by ${over}px`);
}
export const text = page => page.textContent('#app');
export function check(name) { console.log(`  ok  ${name}`); }
