/** The wording of messages people share with their group. Nothing here touches the page. */
import { CATEGORIES } from '../config/app.js';
import { money } from './money.js';
import { spendingBreakdown } from './debts.js';

/** A friendly nudge to someone who still owes you. */
export function reminderText({ tripName, toName, amount, venmo, zelle, link }) {
  const ways = [venmo && `Venmo ${venmo}`, zelle && `Zelle ${zelle}`].filter(Boolean).join(' or ');
  return `Hi ${toName}! Quick reminder from ${tripName}: you owe me ${amount}.${ways ? ` You can pay me on ${ways}.` : ''}${link ? ` Details: ${link}` : ''}`;
}

/** The end-of-trip summary. `people` is [{ id, name }]. */
/** The trip's summary for the group chat, ending with a link to open the trip, review and pay. */
export function wrapUpText(tripName, entries, currency, people, { link = '', final = false } = {}) {
  const s = spendingBreakdown(entries, currency), f = v => money(v, currency);
  const days = Object.keys(s.byDay).length;
  const top = Object.entries(s.byCategory).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${CATEGORIES[k] || 'Other'} ${f(v)}`);
  const who = people.filter(p => s.paid[p.id] || s.share[p.id]).map(p => `${p.name}: paid ${f(s.paid[p.id] || 0)}, share ${f(s.share[p.id] || 0)}`);
  return [`${tripName} wrap-up`, `${f(s.total)} over ${days} day${days === 1 ? '' : 's'}, ${f(Math.round(s.total / Math.max(1, people.length)))} per person`, top.length ? `Top spending: ${top.join(', ')}` : '', '', ...who].filter((l, i) => l || i === 3)
    .concat(link ? ['', final ? 'Expenses are closed, so these numbers are final.' : '', `Review and pay: ${link}`].filter((l, i) => l || i === 0) : [])
    .join('\n');
}
