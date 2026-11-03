/** All money is stored as whole numbers of a currency's smallest unit, so totals never drift. */
import { ZERO_DECIMAL } from '../config/app.js';

export const decimals = c => (ZERO_DECIMAL.has(c) ? 0 : 2);

/** Reads what someone typed. Returns 0 for anything that is not a number. */
export function toMinor(value, currency) {
  const n = parseFloat(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? Math.round(n * 10 ** decimals(currency)) : 0;
}
export const fromMinor = (minor, currency) => (minor / 10 ** decimals(currency)).toFixed(decimals(currency));

export function money(minor, currency) {
  const d = decimals(currency);
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency, minimumFractionDigits: d, maximumFractionDigits: d }).format(minor / 10 ** d);
  } catch {
    return `${fromMinor(minor, currency)} ${currency}`;
  }
}

/**
 * Splits a whole-number total by weights using the largest remainder, so the parts always add up
 * exactly. Leftover units go to the largest fractions, then to whoever comes first.
 * Example: 100 split by {a:1,b:1,c:1} gives {a:34,b:33,c:33}.
 */
export function allocate(total, weights) {
  const ids = Object.keys(weights);
  const out = Object.fromEntries(ids.map(i => [i, 0]));
  const positive = ids.filter(i => weights[i] > 0);
  const sum = positive.reduce((a, i) => a + weights[i], 0);
  if (sum <= 0 || total <= 0) return out;
  let left = total;
  const parts = positive.map((id, order) => {
    const exact = (total * weights[id]) / sum;
    const whole = Math.floor(exact);
    out[id] = whole;
    left -= whole;
    return { id, frac: exact - whole, order };
  });
  parts.sort((a, b) => b.frac - a.frac || a.order - b.order);
  for (let k = 0; left > 0; k = (k + 1) % parts.length) { out[parts[k].id] += 1; left -= 1; }
  return out;
}

/** Converts an amount using "1 unit of `from` = rate units of `to`". */
export function convert(minor, from, to, rate) {
  if (from === to) return minor;
  return Math.round((minor / 10 ** decimals(from)) * rate * 10 ** decimals(to));
}
