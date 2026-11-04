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
