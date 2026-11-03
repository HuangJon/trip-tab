/** What only this phone remembers: its trip list, who you are, unsaved expenses and safety copies. */
import { LIMITS } from '../config/app.js';

export function createDevice(storage, now = () => Date.now()) {
  const snapKey = t => `snapshots:${t}`;
  return {
    trips: () => storage.get('trips', []),
    addTrip(id) { const l = storage.get('trips', []); if (!l.includes(id)) storage.trySet('trips', [id, ...l]); },
    removeTrip(id) { storage.trySet('trips', storage.get('trips', []).filter(x => x !== id)); },

    me: tripId => storage.get(`me:${tripId}`),
    setMe: (tripId, memberId) => storage.trySet(`me:${tripId}`, memberId),
    /** The secret that lets this person move their name to a new phone. */
    key: tripId => storage.get(`key:${tripId}`),
    setKey: (tripId, key) => storage.trySet(`key:${tripId}`, key),
    claims() {
      return storage.get('trips', []).map(tripId => ({ tripId, memberId: storage.get(`me:${tripId}`), key: storage.get(`key:${tripId}`) })).filter(c => c.memberId && c.key);
    },
    codeSaved: () => storage.get('transfer-code-saved', false),
    setCodeSaved: value => storage.trySet('transfer-code-saved', value),

    lastCurrency: tripId => storage.get(`currency:${tripId}`),
    setLastCurrency: (tripId, c) => storage.trySet(`currency:${tripId}`, c),

    draft: tripId => storage.get(`draft:${tripId}`),
    saveDraft: (tripId, form) => storage.trySet(`draft:${tripId}`, form),
    clearDraft: tripId => storage.remove(`draft:${tripId}`),

    /** Trips whose creator hasn't copied or shared the link yet. */
    linkUnsaved: tripId => storage.get(`link-unsaved:${tripId}`, false),
    setLinkUnsaved: (tripId, value) => (value ? storage.trySet(`link-unsaved:${tripId}`, true) : storage.remove(`link-unsaved:${tripId}`)),

    /** Archiving only tidies this phone's list. Friends keep seeing the trip as usual. */
    archived: () => storage.get('archived', []),
    setArchived(id, on) {
      const rest = storage.get('archived', []).filter(x => x !== id);
      storage.trySet('archived', on ? [id, ...rest] : rest);
    },
    installTipDismissed: () => storage.get('install-tip-dismissed', false),
    dismissInstallTip: () => storage.trySet('install-tip-dismissed', true),

    /** Changes the server refused, kept until someone has read them. */
    failedChanges: () => storage.get('failed-changes', []),
    addFailedChange(text) { storage.trySet('failed-changes', [{ text, at: now() }, ...storage.get('failed-changes', [])].slice(0, 5)); },
    clearFailedChanges: () => storage.remove('failed-changes'),

    lastBackup: tripId => storage.get(`backup-at:${tripId}`),
    markBackup: tripId => storage.trySet(`backup-at:${tripId}`, now()),

    /** Keeps one copy per day, newest first, and at most three. A full phone just skips the copy. */
    snapshot(tripId, backup) {
      const day = new Date(now()).toISOString().slice(0, 10);
      const list = storage.get(snapKey(tripId), []);
      if (list[0]?.day === day) list.shift();
      list.unshift({ day, at: now(), backup });
      return storage.trySet(snapKey(tripId), list.slice(0, LIMITS.snapshotsKept));
    },
    snapshots: tripId => storage.get(snapKey(tripId), []),
  };
}
