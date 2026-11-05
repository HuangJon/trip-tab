/** Paying a debt in a different currency from the trip's. Balances stay in the trip's currency. */
import { convert, decimals } from './money.js';

/** What to send to cover a debt. `rate` is how much of the trip's currency one unit of the payment buys. */
export const sendFor = (debtMinor, tripCurrency, payCurrency, rate) => convert(debtMinor, tripCurrency, payCurrency, 1 / rate);
/** How much of the debt a payment covers. */
export const coveredBy = (sendMinor, payCurrency, tripCurrency, rate) => convert(sendMinor, payCurrency, tripCurrency, rate);

/**
 * The rate to save with a payment, so it converts to exactly the debt it covers. Sending $34.09 at
 * 33 is worth NT$1,124.97, which would leave NT$0.03 unpaid after rounding. Rounding is fixed here
 * rather than left on someone's balance.
 */
export function exactRate(debtMinor, tripCurrency, sendMinor, payCurrency) {
  return (debtMinor / 10 ** decimals(tripCurrency)) / (sendMinor / 10 ** decimals(payCurrency));
}

/** A link that opens Venmo ready to pay. Venmo only moves dollars, so other currencies leave the amount blank. */
export function venmoLink(handle, minor, currency, note = '') {
  const name = String(handle || '').trim().replace(/^@/, '');
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(name)) return '';
  const params = new URLSearchParams({ txn: 'pay' });
  if (minor > 0 && currency === 'USD') params.set('amount', (minor / 100).toFixed(2));
  if (note) params.set('note', note);
  return `https://venmo.com/${name}?${params}`;
}
