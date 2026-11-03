/** Transfer codes carry a person's trips and names to a new phone. Treat one like a password. */
const PREFIX = 'TT1.';

export function createTransferCode(claims) {
  return PREFIX + btoa(JSON.stringify(claims.map(c => [c.tripId, c.memberId, c.key])));
}
export const looksLikeTransferCode = text => String(text).trim().startsWith(PREFIX);

/** Returns a list of {tripId, memberId, key}, or null for anything unreadable. */
export function parseTransferCode(text) {
  try {
    const list = JSON.parse(atob(String(text).trim().slice(PREFIX.length)));
    if (!Array.isArray(list) || !list.length) return null;
    const ok = /^[a-z0-9]{10,40}$/;
    if (!list.every(c => Array.isArray(c) && c.length === 3 && c.every(v => typeof v === 'string' && ok.test(v)))) return null;
    return list.map(([tripId, memberId, key]) => ({ tripId, memberId, key }));
  } catch { return null; }
}
