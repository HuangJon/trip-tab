/** Plain logic for the owner page: who counts as the owner, and how problem reports are shaped. */
export const SIMULATED_OWNER = 'owner@example.com';

/**
 * The page only shows when this is true. firestore.rules is what actually protects the data.
 * The stand-in database on a preview or test server has its own pretend owner.
 */
export function isOwnerAccount(user, { ownerUid, simulated = false, preview = false }) {
  if (!user?.verified) return false;
  if (simulated) return preview || user.email === SIMULATED_OWNER;
  return Boolean(ownerUid) && user.uid === ownerUid;
}

/** Keeps a report short and takes out anything that looks like an email address. */
export const cleanMessage = text => String(text ?? '').replace(/[^\s@]+@[^\s@]+/g, '[email]').slice(0, 300);

export function errorRecord({ id, kind, message, where = '', tripId = '', agent = '', user, at }) {
  return {
    id, kind, message: cleanMessage(message), where: String(where).slice(0, 100), tripId: String(tripId || '').slice(0, 40),
    agent: String(agent).slice(0, 200), uid: user.uid, email: user.email || '', at,
  };
}

/** One row per account, from the records of who has opened which trip. */
export function peopleAcrossTrips(trips) {
  const people = new Map();
  for (const t of trips) {
    for (const j of t.joined || []) {
      const p = people.get(j.uid) || { uid: j.uid, email: j.email || '', name: j.displayName || '', first: j.at || 0, trips: [] };
      p.email = p.email || j.email || '';
      p.name = p.name || j.displayName || '';
      if (j.at && (!p.first || j.at < p.first)) p.first = j.at;
      p.trips.push({ id: t.id, name: t.name, removed: j.removed === true, memberName: t.members?.[j.memberId]?.name || '' });
      people.set(j.uid, p);
    }
  }
  return [...people.values()].sort((a, b) => b.first - a.first);
}
