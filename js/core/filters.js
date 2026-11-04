/** Finding expenses: pure functions, so the screen only has to draw the result. */
import { inBase, needsRate } from './debts.js';
import { byNewest, memberName } from './model.js';
import { toMinor } from './money.js';

export const EMPTY_FILTERS = { person: '', type: '', from: '', to: '', min: '', max: '', sort: 'newest' };

/** How many filters are on. Sort order isn't a filter, because it never hides anything. */
export const activeFilterCount = f => ['person', 'type', 'from', 'to', 'min', 'max'].filter(k => f[k]).length;

const amountIn = (e, base) => (needsRate(e, base) ? null : inBase(e, base).total);

export function matchesType(e, type) {
  if (!type) return true;
  if (type === 'kind:payment') return e.kind === 'payment';
  if (type === 'kind:refund') return e.kind === 'refund';
  return e.kind !== 'payment' && e.category === type;
}

/**
 * Applies search and filters. "Person" means anyone who paid, received or shared it.
 * Amounts are compared in the trip's currency, so an expense with no exchange rate yet can't
 * match an amount filter. Dates are inclusive.
 */
export function applyFilters(entries, trip, query, f) {
  const q = (query || '').trim().toLowerCase(), base = trip.currency;
  const min = f.min ? toMinor(f.min, base) : null, max = f.max ? toMinor(f.max, base) : null;
  const list = entries.filter(e => {
    if (f.person && !(e.paid[f.person] || e.owed[f.person])) return false;
    if (!matchesType(e, f.type)) return false;
    if (f.from && e.date < f.from) return false;
    if (f.to && e.date > f.to) return false;
    if (min !== null || max !== null) {
      const amount = amountIn(e, base);
      if (amount === null || (min !== null && amount < min) || (max !== null && amount > max)) return false;
    }
    if (!q) return true;
    const people = [...Object.keys(e.paid), ...Object.keys(e.owed)].map(i => memberName(trip, i)).join(' ');
    return `${e.desc || ''} ${e.note || ''} ${people}`.toLowerCase().includes(q);
  });
  const size = e => amountIn(e, base) ?? -1;
  if (f.sort === 'oldest') return list.sort((a, b) => byNewest(b, a));
  if (f.sort === 'largest') return list.sort((a, b) => size(b) - size(a) || byNewest(a, b));
  if (f.sort === 'smallest') return list.sort((a, b) => size(a) - size(b) || byNewest(a, b));
  return list.sort(byNewest);
}

/** The total of what's showing, leaving out settlements and anything with no rate yet. Refunds subtract. */
export function filteredTotal(list, base) {
  return list.reduce((sum, e) => {
    if (e.kind === 'payment' || needsRate(e, base)) return sum;
    return sum + (e.kind === 'refund' ? -1 : 1) * inBase(e, base).total;
  }, 0);
}
