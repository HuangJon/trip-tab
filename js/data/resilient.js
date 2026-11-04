/**
 * Keeps a live listener alive through a refusal that is only a matter of timing. A new trip's
 * listeners can reach the database before the record saying you joined it, and a refused listener
 * stops for good, so nothing new would appear until a reload. Trying again a moment later fixes that.
 * Any other error, or a refusal that outlasts the retries, is passed on.
 */
const WAITS_MS = [500, 1500, 3000, 6000, 12000];

export function resilient(subscribe, onFail, waits = WAITS_MS) {
  let off = () => {}, tries = 0, stopped = false, timer;
  const start = () => {
    off = subscribe(() => { tries = 0; }, e => {
      if (e?.code === 'permission-denied' && tries < waits.length && !stopped) {
        timer = setTimeout(start, waits[tries]);
        tries += 1;
      } else onFail?.(e);
    });
  };
  start();
  return () => { stopped = true; clearTimeout(timer); off(); };
}
