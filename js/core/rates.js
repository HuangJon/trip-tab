import { decimals } from './money.js';

/**
 * Exchange rates are stored one way: how many units of the trip's currency one unit of the expense's
 * currency buys. People think of them the other way when that number would be tiny: they say
 * "1 USD is 33 TWD", not "1 TWD is 0.03 USD". So the form always asks in the direction that gives a
 * number of 1 or more, and catches a rate that looks backwards.
 *
 * ROUGH_PER_USD is only for choosing that direction and spotting a backwards rate. It never affects an
 * amount, so it doesn't need to be current.
 */
const ROUGH_PER_USD = {
  USD: 1, TWD: 32, JPY: 150, KRW: 1400, EUR: 0.92, GBP: 0.79, HKD: 7.8, SGD: 1.35, THB: 35, VND: 25000,
  CNY: 7.2, AUD: 1.5, CAD: 1.37, MXN: 18, MYR: 4.5, IDR: 16000, PHP: 57, NZD: 1.65, CHF: 0.88,
};

/** Roughly how many `to` one `from` buys, or null for a currency not in the list. */
export function roughRate(from, to) {
  const a = ROUGH_PER_USD[from], b = ROUGH_PER_USD[to];
  return a && b ? b / a : null;
}
/**
 * A ballpark in US dollars while someone types a foreign amount, or '' when there's nothing to show.
 * It uses ROUGH_PER_USD, so it's only ever display text and never goes into an amount.
 */
export function roughUsd(minor, currency) {
  const rate = roughRate(currency, 'USD');
  if (currency === 'USD' || !rate || !(minor > 0)) return '';
  const dollars = (minor / 10 ** decimals(currency)) * rate;
  const small = dollars < 10;
  return new Intl.NumberFormat('en', { style: 'currency', currency: 'USD', minimumFractionDigits: small ? 2 : 0, maximumFractionDigits: small ? 2 : 0 }).format(dollars);
}

/** A rough conversion for overview totals only. Null when a currency isn't in the rough list. */
export function convertRough(minor, from, to) {
  if (from === to) return minor;
  const rate = roughRate(from, to);
  return rate ? Math.round((minor / 10 ** decimals(from)) * rate * 10 ** decimals(to)) : null;
}

/** True when the form should ask "1 trip currency = how many expense currency". */
export const asksInverse = (from, to) => (roughRate(from, to) ?? 1) < 1;

/** The question's two currencies, in the order the form asks. */
export const rateQuestion = (from, to) => (asksInverse(from, to) ? { one: to, many: from } : { one: from, many: to });

const tidy = n => Number(n.toPrecision(6));
/** Turns what someone typed into the stored rate. Returns null for anything that isn't above zero. */
export function typedToStored(typed, from, to) {
  const n = parseFloat(String(typed ?? '').replace(/,/g, ''));
  if (!(n > 0)) return null;
  return asksInverse(from, to) ? 1 / n : n;
}
/** Turns a stored rate into what the form shows. */
export function storedToTyped(rate, from, to) {
  if (!(rate > 0)) return '';
  return String(tidy(asksInverse(from, to) ? 1 / rate : rate));
}
export function rateLabel(rate, from, to) {
  const q = rateQuestion(from, to);
  return `1 ${q.one} = ${storedToTyped(rate, from, to)} ${q.many}`;
}
/** True when a rate is much closer to the upside-down rough rate than to the rough rate itself. */
export function looksBackwards(rate, from, to) {
  const rough = roughRate(from, to);
  if (!rough || !(rate > 0)) return false;
  const spread = Math.abs(Math.log(rough));
  if (spread < Math.log(3)) return false; // similar currencies can't be told apart this way
  return Math.abs(Math.log(rate) + Math.log(rough)) < Math.abs(Math.log(rate) - Math.log(rough));
}
