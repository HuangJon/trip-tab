/** Prefixed localStorage with JSON. Reads tolerate blocked storage. Writes throw so callers can say "save failed". */
const PREFIX = 'triptab:';

export function createLocalStorage(area = globalThis.localStorage) {
  return {
    get(key, fallback = null) {
      try { const v = area.getItem(PREFIX + key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
    },
    set(key, value) { area.setItem(PREFIX + key, JSON.stringify(value)); },
    trySet(key, value) { try { area.setItem(PREFIX + key, JSON.stringify(value)); return true; } catch { return false; } },
    remove(key) { try { area.removeItem(PREFIX + key); } catch { /* nothing to remove */ } },
  };
}

export function createMemoryStorage() {
  const m = new Map();
  return createLocalStorage({ getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) });
}

/** Asks the browser not to evict this app's data. It may say no; the app works either way. */
export function requestPersistentStorage() {
  try { navigator.storage?.persist?.(); } catch { /* optional */ }
}
