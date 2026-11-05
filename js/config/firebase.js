/**
 * Your Firebase project's web settings (Firebase console → Project settings → Your apps).
 * These values are safe to publish: they identify the project, and firestore.rules controls access.
 * Previews and local test servers use a stand-in database, so testing never touches real trips.
 */
/** Shows a label on anything that isn't the real app. The staging build replaces this file. */
export const environment = 'live';
/** The account that can open the owner page. firestore.rules holds the same ID, and that's what protects the data. */
export const ownerUid = '80zN7EdZTZOZ8RGVWLmUcMAgetk2';
export const firebaseConfig = {
  apiKey: 'AIzaSyDDscSOw0nIfsoRZIIDmG3m9HeU7l-xXeE',
  authDomain: 'trip-tab-c19f4.firebaseapp.com',
  projectId: 'trip-tab-c19f4',
  storageBucket: 'trip-tab-c19f4.firebasestorage.app',
  messagingSenderId: '767833953250',
  appId: '1:767833953250:web:cc67c4180ea851d4449fbb',
};
/**
 * The public reCAPTCHA v3 site key for App Check, which helps stop scripts from using up the free
 * limits. Also safe to publish. Null leaves App Check off.
 */
export const appCheckSiteKey = null;
/** Exact SDK version, loaded from Google's CDN. */
export const FIREBASE_VERSION = '11.10.0';
