/** The example trip the preview opens with. Only preview builds use it. */
import { randomId } from '../core/ids.js';

export async function seedExample(repo, device, today, profile) {
  const { trip, written } = repo.createTrip({ name: 'Example: Okinawa (delete me)', currency: 'TWD', memberNames: ['Ana', 'Ben', 'Chi'], profile });
  await written;
  const [a, b, c] = Object.keys(trip.members);
  const names = { [a]: 'Ana', [b]: 'Ben', [c]: 'Chi' };
  const day = n => { const d = new Date(`${today}T12:00:00`); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  const base = { tripId: trip.id, kind: 'expense', rate: 1, note: '', receipt: '', comments: {}, deleted: false, currency: 'TWD' };
  const list = [
    { by: a, desc: 'Rental car', category: 'transport', date: day(3), total: 4800, paid: { [a]: 4800 }, owed: { [a]: 1600, [b]: 1600, [c]: 1600 }, split: { mode: 'equal', selected: [a, b, c], inputs: {}, items: [] } },
    { by: b, desc: 'Izakaya dinner', category: 'food', date: day(2), total: 3100, paid: { [b]: 3100 }, owed: { [a]: 1550, [b]: 775, [c]: 775 }, split: { mode: 'shares', selected: [a, b, c], inputs: { [a]: '2', [b]: '1', [c]: '1' }, items: [] }, note: 'Ana counts as 2 shares' },
    { by: c, desc: 'Aquarium tickets', category: 'activities', date: day(1), currency: 'JPY', rate: 0.21, total: 7500, paid: { [c]: 7500 }, owed: { [a]: 2500, [b]: 2500, [c]: 2500 }, split: { mode: 'equal', selected: [a, b, c], inputs: {}, items: [] } },
  ];
  let i = 0;
  for (const e of list) {
    const at = Date.now() + (i += 1);
    await repo.saveEntry(trip, { ...base, ...(({ by, ...rest }) => rest)(e), id: randomId(), createdById: e.by, createdAt: at, updatedAt: at, updatedBy: names[e.by] }, { isNew: true, actor: names[e.by], actorId: e.by, label: `added "${e.desc}"` });
  }
  await repo.updateTrip(trip.id, { 'rates.JPY': 0.21 });
  await repo.setMemberPayment(trip.id, a, 'venmo', '@ana-example');
  await repo.setMemberPayment(trip.id, b, 'zelle', 'ben@example.com');
  device.addTrip(trip.id);
  device.setMe(trip.id, a);
}
