/**
 * The shared database. The Firebase SDK is passed in, so the app can load it from Google's CDN
 * while tests use the npm package against the emulator.
 *
 * Offline: the SDK keeps a copy on the device and queues writes. A write's promise does not
 * finish until the server has it, so the app never waits on one before moving on.
 */
export function createFirebaseBackend(config, sdk) {
  const app = sdk.initializeApp(config);
  let db;
  try {
    db = sdk.initializeFirestore(app, { localCache: sdk.persistentLocalCache({ tabManager: sdk.persistentMultipleTabManager() }) });
  } catch {
    db = sdk.getFirestore(app); // private browsing and some older phones can't keep the offline copy
  }
  const data = snap => snap.data();
  return {
    kind: 'firebase',
    db,
    set: (path, value) => sdk.setDoc(sdk.doc(db, path), value),
    update: (path, fields) => sdk.updateDoc(sdk.doc(db, path), fields),
    get: async path => {
      const snap = await sdk.getDoc(sdk.doc(db, path));
      return snap.exists() ? data(snap) : null;
    },
    list: async col => (await sdk.getDocs(sdk.collection(db, col))).docs.map(data),
    watchDoc: (path, cb, err) => sdk.onSnapshot(sdk.doc(db, path), snap => {
      // A cached "missing" is not proof, because the invite may be brand new on this phone.
      if (!snap.exists() && snap.metadata.fromCache) return;
      cb(snap.exists() ? data(snap) : null);
    }, err),
    watchCollection: (col, cb, err, { orderBy, limit } = {}) => {
      const parts = [];
      if (orderBy) parts.push(sdk.orderBy(orderBy, 'desc'));
      if (limit) parts.push(sdk.limit(limit));
      return sdk.onSnapshot(sdk.query(sdk.collection(db, col), ...parts), snap => cb(snap.docs.map(data)), err);
    },
  };
}

/** Loads the SDK from Google's CDN. The address is built at run time so preview builds never bundle it. */
export async function loadFirebaseSdk(version) {
  const url = name => `https://www.gstatic.com/firebasejs/${version}/firebase-${name}.js`;
  const [app, store] = await Promise.all([import(/* @vite-ignore */ url('app')), import(/* @vite-ignore */ url('firestore'))]);
  return { ...app, ...store };
}
