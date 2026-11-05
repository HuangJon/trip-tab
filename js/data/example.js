/** The example trip the preview opens with. Only preview builds use it. */
import { randomId } from '../core/ids.js';

export async function seedExample(repo, device, today, profile) {
  const { trip, written } = repo.createTrip({ name: 'Example: Okinawa (delete me)', currency: 'USD', memberNames: ['Ana', 'Ben', 'Chi'], profile });
  await written;
  const [a, b, c] = Object.keys(trip.members);
  const names = { [a]: 'Ana', [b]: 'Ben', [c]: 'Chi' };
  const day = n => { const d = new Date(`${today}T12:00:00`); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  const base = { tripId: trip.id, kind: 'expense', rate: 1, note: '', receipt: '', comments: {}, deleted: false, currency: 'USD' };
  const list = [
    { by: a, desc: 'Rental car', category: 'transport', date: day(3), total: 15000, paid: { [a]: 15000 }, owed: { [a]: 5000, [b]: 5000, [c]: 5000 }, split: { mode: 'equal', selected: [a, b, c], inputs: {}, items: [] } },
    { by: b, desc: 'Izakaya dinner', category: 'food', date: day(2), total: 9600, paid: { [b]: 9600 }, owed: { [a]: 4800, [b]: 2400, [c]: 2400 }, split: { mode: 'shares', selected: [a, b, c], inputs: { [a]: '2', [b]: '1', [c]: '1' }, items: [] }, note: 'Ana counts as 2 shares' },
    { by: c, desc: 'Aquarium tickets', category: 'activities', date: day(1), currency: 'JPY', rate: 0.0067, total: 7500, paid: { [c]: 7500 }, owed: { [a]: 2500, [b]: 2500, [c]: 2500 }, split: { mode: 'equal', selected: [a, b, c], inputs: {}, items: [] } },
  ];
  let i = 0;
  for (const e of list) {
    const at = Date.now() + (i += 1);
    await repo.saveEntry(trip, { ...base, ...(({ by, ...rest }) => rest)(e), id: randomId(), createdById: e.by, createdAt: at, updatedAt: at, updatedBy: names[e.by] }, { isNew: true, actor: names[e.by], actorId: e.by, label: `added "${e.desc}"` });
  }
  await repo.updateTrip(trip.id, { 'rates.JPY': 0.0067 });
  await repo.setMemberPayment(trip.id, a, 'venmo', '@ana-example');
  await repo.setMemberPayment(trip.id, b, 'zelle', 'ben@example.com');
  device.addTrip(trip.id);
  device.setMe(trip.id, a);
}
