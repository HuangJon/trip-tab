/**
 * Replaces js/config/firebase.js when the test branch is published to staging.
 * These settings are safe to publish, like the live ones. This project only ever holds test data.
 */
export const firebaseConfig = {
  apiKey: 'AIzaSyBU-Wqdkp5xfj_m0lNGTtvkjn4-DbylbdM',
  authDomain: 'trip-tab-staging.firebaseapp.com',
  projectId: 'trip-tab-staging',
  storageBucket: 'trip-tab-staging.firebasestorage.app',
  messagingSenderId: '125804062578',
  appId: '1:125804062578:web:c0a19c9922b81792035feb',
};
export const environment = 'staging';
/** A test owner. The staging publish swaps this address into firestore.rules too. */
export const ownerUid = 'stagingOwnerTestAccount01';
export const appCheckSiteKey = null;
export const FIREBASE_VERSION = '11.10.0';
