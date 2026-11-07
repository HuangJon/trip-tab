/** Decides whether to suggest installing. Safari can clear a site's data after about a week away; home-screen apps are exempt. */
export function isIos(ua = '', platform = '', touchPoints = 0) {
  return /iPhone|iPad|iPod/.test(ua) || (platform === 'MacIntel' && touchPoints > 1);
}
export function shouldSuggestInstall({ ios, standalone, preview, dismissed }) {
  return ios && !standalone && !preview && !dismissed;
}

/** How close to the left edge a swipe back has to start, in pixels. */
export const EDGE_PX = 24;
/**
 * Whether a finished swipe from the left edge should go back: far enough, or a quick flick,
 * and mostly sideways so a scroll never counts.
 */
export function swipeGoesBack({ startX, dx, dy, width, ms }) {
  if (startX > EDGE_PX || dx <= 0 || Math.abs(dy) > dx * 0.6) return false;
  return dx > width * 0.35 || (dx > 60 && dx / Math.max(ms, 1) > 0.5);
}
