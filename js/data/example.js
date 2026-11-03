/** The example trip the preview opens with. Only preview builds use it. */
import { randomId } from '../core/ids.js';

export async function seedExample(repo, device, today) {
  const { trip, written } = repo.createTrip({ name: 'Example: Okinawa (delete me)', currency: 'TWD', memberNames: ['Ana', 'Ben', 'Chi'] });
  await written;
  const [a, b, c] = Object.keys(trip.members);
  const day = n => { const d = new Date(`${today}T12:00:00`); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  const base = { tripId: trip.id, kind: 'expense', rate: 1, note: '', receipt: '', comments: {}, deleted: false, currency: 'TWD' };
  const list = [
    { desc: 'Rental car', category: 'transport', date: day(3), total: 4800, paid: { [a]: 4800 }, owed: { [a]: 1600, [b]: 1600, [c]: 1600 }, split: { mode: 'equal', selected: [a, b, c], inputs: {}, items: [] } },
    { desc: 'Izakaya dinner', category: 'food', date: day(2), total: 3100, paid: { [b]: 3100 }, owed: { [a]: 1550, [b]: 775, [c]: 775 }, split: { mode: 'shares', selected: [a, b, c], inputs: { [a]: '2', [b]: '1', [c]: '1' }, items: [] }, note: 'Ana counts as 2 shares' },
    { desc: 'Aquarium tickets', category: 'activities', date: day(1), currency: 'JPY', rate: 0.21, total: 7500, paid: { [c]: 7500 }, owed: { [a]: 2500, [b]: 2500, [c]: 2500 }, split: { mode: 'equal', selected: [a, b, c], inputs: {}, items: [] } },
  ];
  let i = 0;
  for (const e of list) {
    const at = Date.now() + (i += 1);
    await repo.saveEntry(trip, { ...base, ...e, id: randomId(), createdAt: at, updatedAt: at }, { isNew: true, actor: 'Ana', label: `added "${e.desc}"` });
  }
  await repo.updateTrip(trip.id, { 'rates.JPY': 0.21 });
  device.addTrip(trip.id);
  device.setMe(trip.id, a);
}
