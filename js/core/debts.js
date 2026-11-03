/** Balances and who-pays-whom. Every result is in the trip's currency, in whole minor units. */
import { allocate, convert } from './money.js';

/** One entry converted to the trip's currency. The parts are re-allocated so they stay exact. */
export function inBase(entry, base) {
  if (entry.currency === base) return { total: entry.total, paid: entry.paid, owed: entry.owed };
  const total = convert(entry.total, entry.currency, base, entry.rate || 1);
  return { total, paid: allocate(total, entry.paid), owed: allocate(total, entry.owed) };
}

/** Positive means the person is owed money; negative means they owe. Always sums to zero. */
export function netBalances(entries, base, memberIds = []) {
  const net = Object.fromEntries(memberIds.map(i => [i, 0]));
  for (const e of entries) {
    const b = inBase(e, base);
    for (const i in b.paid) net[i] = (net[i] || 0) + b.paid[i];
    for (const i in b.owed) net[i] = (net[i] || 0) - b.owed[i];
  }
  return net;
}

/** Fewest-payments plan: exact matches first, then the largest debtor pays the largest creditor. */
export function simplify(net) {
  const creditors = [], debtors = [], out = [];
  for (const i in net) {
    if (net[i] > 0) creditors.push({ id: i, v: net[i] });
    else if (net[i] < 0) debtors.push({ id: i, v: -net[i] });
  }
  for (const d of debtors) {
    const c = creditors.find(x => x.v === d.v);
    if (c) { out.push({ from: d.id, to: c.id, amount: d.v }); c.v = 0; d.v = 0; }
  }
  const largest = list => list.filter(x => x.v > 0).sort((a, b) => b.v - a.v)[0];
  for (;;) {
    const d = largest(debtors), c = largest(creditors);
    if (!d || !c) break;
    const amount = Math.min(d.v, c.v);
    out.push({ from: d.id, to: c.id, amount });
    d.v -= amount;
    c.v -= amount;
  }
  return out;
}

/** Who owes whom expense by expense, with each pair netted against each other. */
export function pairwise(entries, base) {
  const matrix = new Map();
  const add = (a, b, v) => matrix.set(`${a}|${b}`, (matrix.get(`${a}|${b}`) || 0) + v);
  for (const e of entries) {
    const b = inBase(e, base), n = {};
    for (const i in b.paid) n[i] = (n[i] || 0) + b.paid[i];
    for (const i in b.owed) n[i] = (n[i] || 0) - b.owed[i];
    const creditors = [], debtors = [];
    for (const i in n) {
      if (n[i] > 0) creditors.push({ id: i, v: n[i] });
      else if (n[i] < 0) debtors.push({ id: i, v: -n[i] });
    }
    let c = 0;
    for (const d of debtors) {
      while (d.v > 0 && c < creditors.length) {
        const a = Math.min(d.v, creditors[c].v);
        add(d.id, creditors[c].id, a);
        d.v -= a;
        creditors[c].v -= a;
        if (!creditors[c].v) c += 1;
      }
    }
  }
  const out = [], seen = new Set();
  for (const key of matrix.keys()) {
    const [a, b] = key.split('|');
    const pair = [a, b].sort().join('|');
    if (seen.has(pair)) continue;
    seen.add(pair);
    const v = (matrix.get(`${a}|${b}`) || 0) - (matrix.get(`${b}|${a}`) || 0);
    if (v > 0) out.push({ from: a, to: b, amount: v });
    else if (v < 0) out.push({ from: b, to: a, amount: -v });
  }
  return out.sort((x, y) => y.amount - x.amount);
}

export function spendingBreakdown(entries, base) {
  const byCategory = {}, byDay = {}, paid = {}, share = {};
  let total = 0, count = 0;
  for (const e of entries) {
    if (e.kind === 'payment') continue;
    const b = inBase(e, base);
    const refund = e.kind === 'refund', sign = refund ? -1 : 1;
    if (!refund) count += 1;
    total += sign * b.total;
    byCategory[e.category] = (byCategory[e.category] || 0) + sign * b.total;
    byDay[e.date] = (byDay[e.date] || 0) + sign * b.total;
    const handled = refund ? b.owed : b.paid, shares = refund ? b.paid : b.owed;
    for (const i in handled) paid[i] = (paid[i] || 0) + sign * handled[i];
    for (const i in shares) share[i] = (share[i] || 0) + sign * shares[i];
  }
  return { total, count, byCategory, byDay, paid, share };
}
