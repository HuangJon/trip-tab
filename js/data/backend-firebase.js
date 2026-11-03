/**
 * The shared database. The Firebase SDK is passed in, so the app can load it from Google's CDN
 * while tests use the npm package against the emulator.
 *
 * Offline: the SDK keeps a copy on the device and queues writes. A write's promise does not
 * finish until the server has it, so the app never waits on one before moving on.
 */
export async function createFirebaseBackend(config, sdk, { appCheckSiteKey = null, signInWaitMs = 5000 } = {}) {
  const app = sdk.initializeApp(config);
  // App Check has to start before anything talks to the database, or those first requests have no proof.
  if (appCheckSiteKey) {
    sdk.initializeAppCheck(app, { provider: new sdk.ReCaptchaV3Provider(appCheckSiteKey), isTokenAutoRefreshEnabled: true });
  }
  let db;
  try {
    db = sdk.initializeFirestore(app, { localCache: sdk.persistentLocalCache({ tabManager: sdk.persistentMultipleTabManager() }) });
  } catch {
    db = sdk.getFirestore(app); // private browsing and some older phones can't keep the offline copy
  }

  // Invisible sign-in: nobody sees it, and it gives the rules a signed-in phone to check for.
  // A phone that is offline on first launch carries on, and signs in when the connection returns.
  const auth = sdk.getAuth(app);
  const signIn = () => sdk.signInAnonymously(auth).catch(() => {});
  const signedIn = new Promise(resolve => {
    const stop = sdk.onAuthStateChanged(auth, user => {
      if (user) { stop?.(); resolve(user); } else signIn();
    });
  });
  globalThis.addEventListener?.('online', () => { if (!auth.currentUser) signIn(); });
  await Promise.race([signedIn, new Promise(r => setTimeout(r, signInWaitMs))]);

  /** A listener refused before sign-in finished starts again afterwards. Any other error is passed on. */
  function resilient(subscribe, err) {
    let off = () => {}, stopped = false;
    const start = () => {
      off = subscribe(e => {
        if (e?.code === 'permission-denied' && !auth.currentUser) signedIn.then(() => { if (!stopped) start(); });
        else err?.(e);
      });
    };
    start();
    return () => { stopped = true; off(); };
  }

  const data = snap => snap.data();
  return {
    kind: 'firebase',
    db,
    uid: () => auth.currentUser?.uid || '',
    set: (path, value) => sdk.setDoc(sdk.doc(db, path), value),
    update: (path, fields) => sdk.updateDoc(sdk.doc(db, path), fields),
    get: async path => {
      const snap = await sdk.getDoc(sdk.doc(db, path));
      return snap.exists() ? data(snap) : null;
    },
    list: async col => (await sdk.getDocs(sdk.collection(db, col))).docs.map(data),
    watchDoc: (path, cb, err) => resilient(fail => sdk.onSnapshot(sdk.doc(db, path), snap => {
      // A cached "missing" is not proof, because the invite may be brand new on this phone.
      if (!snap.exists() && snap.metadata.fromCache) return;
      cb(snap.exists() ? data(snap) : null);
    }, fail), err),
    watchCollection: (col, cb, err, { orderBy, limit } = {}) => resilient(fail => {
      const parts = [];
      if (orderBy) parts.push(sdk.orderBy(orderBy, 'desc'));
      if (limit) parts.push(sdk.limit(limit));
      // Metadata changes tell the app when a document saved offline has reached the server.
      return sdk.onSnapshot(sdk.query(sdk.collection(db, col), ...parts), { includeMetadataChanges: true }, snap => {
        cb(snap.docs.map(data), { pending: snap.docs.filter(d => d.metadata.hasPendingWrites).map(d => d.id) });
      }, fail);
    }, err),
  };
}

/** Loads the SDK from Google's CDN. The address is built at run time so preview builds never bundle it. */
export async function loadFirebaseSdk(version, { appCheck = false } = {}) {
  const url = name => `https://www.gstatic.com/firebasejs/${version}/firebase-${name}.js`;
  const names = ['app', 'firestore', 'auth', ...(appCheck ? ['app-check'] : [])];
  const parts = await Promise.all(names.map(n => import(/* @vite-ignore */ url(n))));
  return Object.assign({}, ...parts);
}
