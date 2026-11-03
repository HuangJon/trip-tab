/** Turns the split form's inputs into what each person owes. Returns {owed} or {error}. */
import { allocate, money, toMinor } from './money.js';

const even = ids => Object.fromEntries(ids.map(i => [i, 1]));

export const SPLIT_MODES = [
  ['equal', 'Equally'], ['exact', 'Amounts'], ['percent', 'Percent'], ['shares', 'Shares'], ['adjust', 'Adjust'], ['items', 'By item'],
];

export function computeSplit(total, currency, split, memberIds) {
  const inputs = split.inputs || {};
  const selected = (split.selected || []).filter(i => memberIds.includes(i));
  if (!(total > 0)) return { error: 'Enter an amount above zero.' };

  switch (split.mode) {
    case 'equal':
      if (!selected.length) return { error: 'Choose at least one person to split with.' };
      return { owed: allocate(total, even(selected)) };
    case 'exact': {
      const owed = {};
      let sum = 0;
      for (const i of memberIds) { const v = toMinor(inputs[i], currency); if (v > 0) { owed[i] = v; sum += v; } }
      if (sum !== total) return { error: `Amounts add up to ${money(sum, currency)}. They need to reach ${money(total, currency)}.` };
      return { owed };
    }
    case 'percent': {
      const weights = {};
      let sum = 0;
      for (const i of memberIds) { const v = parseFloat(inputs[i]) || 0; if (v > 0) { weights[i] = v; sum += v; } }
      if (Math.abs(sum - 100) > 0.001) return { error: `Percentages add up to ${+sum.toFixed(3)}%. They need to reach 100%.` };
      return { owed: allocate(total, weights) };
    }
    case 'shares': {
      const weights = {};
      for (const i of memberIds) { const v = parseFloat(inputs[i]) || 0; if (v > 0) weights[i] = v; }
      if (!Object.keys(weights).length) return { error: 'Give at least one person a share.' };
      return { owed: allocate(total, weights) };
    }
    case 'adjust': {
      if (!selected.length) return { error: 'Choose at least one person to split with.' };
      const adj = Object.fromEntries(selected.map(i => [i, toMinor(inputs[i], currency)]));
      const extra = Object.values(adj).reduce((a, b) => a + b, 0);
      if (extra > total) return { error: 'Adjustments are larger than the total.' };
      const base = allocate(total - extra, even(selected));
      const owed = {};
      for (const i of selected) {
        owed[i] = base[i] + adj[i];
        if (owed[i] < 0) return { error: 'An adjustment leaves someone with a negative share.' };
      }
      return { owed };
    }
    case 'items': {
      const items = split.items || [];
      if (!items.length) return { error: 'Add at least one item.' };
      const ordered = {};
      let subtotal = 0;
      for (const item of items) {
        const price = toMinor(item.amount, currency);
        const people = (item.people || []).filter(i => memberIds.includes(i));
        if (price <= 0) return { error: `Enter a price for ${item.name || 'each item'}.` };
        if (!people.length) return { error: `Choose who had ${item.name || 'each item'}.` };
        const each = allocate(price, even(people));
        for (const p of people) ordered[p] = (ordered[p] || 0) + each[p];
        subtotal += price;
      }
      // Tax, tip or a discount is the gap between the items and the total; sharing the total by
      // what each person ordered spreads that gap proportionally.
      return { owed: allocate(total, ordered), subtotal };
    }
    default:
      return { error: 'Choose a way to split.' };
  }
}

/** Removes zero shares so they never show as "owes nothing" rows. */
export const nonZero = map => Object.fromEntries(Object.entries(map).filter(([, v]) => v > 0));
