/**
 * In the home-screen app, iPhone gives no back swipe, so a swipe from the left edge
 * slides the screen away and goes back, like the back arrow. Safari has its own, so this stays out of its way.
 */
import { A, actions } from './state.js';
import { EDGE_PX, swipeGoesBack } from '../core/platform.js';

const installed = () => globalThis.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
// Only from a trip, and never over a form, menu or the tutorial, so nothing half-typed is lost.
const allowed = () => A.route.name === 'trip' && !document.getElementById('dlg')?.open && !A.tour;

export function setUpSwipeBack() {
  if (!installed() && !globalThis.__TRIP_TAB_PREVIEW__) return; // the preview has it too, so it can be tried
  const app = document.getElementById('app');
  let swipe = null;
  const slide = (x, animate) => {
    app.style.transition = animate ? 'transform .2s ease' : 'none';
    app.style.transform = x ? `translateX(${x}px)` : '';
  };
  document.addEventListener('touchstart', ev => {
    const t = ev.touches[0];
    swipe = ev.touches.length === 1 && t.clientX <= EDGE_PX && allowed() ? { x: t.clientX, y: t.clientY, at: Date.now(), dx: 0, dy: 0, sideways: null } : null;
  }, { passive: true });
  document.addEventListener('touchmove', ev => {
    if (!swipe) return;
    const t = ev.touches[0];
    swipe.dx = t.clientX - swipe.x;
    swipe.dy = t.clientY - swipe.y;
    if (swipe.sideways === null && Math.hypot(swipe.dx, swipe.dy) > 8) swipe.sideways = Math.abs(swipe.dx) > Math.abs(swipe.dy);
    if (!swipe.sideways) return;
    ev.preventDefault();
    slide(Math.max(0, swipe.dx), false);
  }, { passive: false });
  const finish = () => {
    if (!swipe) return;
    const done = swipe.sideways && swipeGoesBack({ startX: swipe.x, dx: swipe.dx, dy: swipe.dy, width: innerWidth, ms: Date.now() - swipe.at });
    swipe = null;
    if (!done) { slide(0, true); return; }
    slide(innerWidth, true);
    setTimeout(() => { slide(0, false); actions.back(); }, 200);
  };
  document.addEventListener('touchend', finish);
  document.addEventListener('touchcancel', () => { if (swipe) { swipe = null; slide(0, true); } });
}
