/**
 * Sends the owner a short note when something breaks: a refused or failed save, or a crash on this
 * device. Each problem goes once per visit, with a cap, so it can't use up the free database limits.
 * A report that can't be sent is dropped, and never causes another report.
 */
import { A } from './state.js';
import { randomId } from '../core/ids.js';
import { errorRecord } from '../core/owner.js';

const MAX_PER_VISIT = 20;
const sent = new Set();

function report(kind, message, tripId = A.route?.tripId || '') {
  try {
    const key = `${kind}:${message}`;
    if (!A.user?.uid || !A.repo?.logError || sent.has(key) || sent.size >= MAX_PER_VISIT) return;
    sent.add(key);
    const where = A.route?.name === 'trip' ? `trip/${A.route.tab}` : A.route?.name || '';
    A.repo.logError(errorRecord({ id: randomId(), kind, message, where, tripId, agent: navigator.userAgent, user: A.user, at: Date.now() })).catch(() => {});
  } catch { /* reporting must never cause a problem of its own */ }
}

export function setUpErrorLog() {
  A.logProblem = report;
  addEventListener('error', ev => report('app-error', ev.message || 'Unknown error'));
  addEventListener('unhandledrejection', ev => report('app-error', ev.reason?.code || ev.reason?.message || 'Unhandled failure'));
}
