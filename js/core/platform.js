/** Decides whether to suggest installing. Safari can clear a site's data after about a week away; home-screen apps are exempt. */
export function isIos(ua = '', platform = '', touchPoints = 0) {
  return /iPhone|iPad|iPod/.test(ua) || (platform === 'MacIntel' && touchPoints > 1);
}
export function shouldSuggestInstall({ ios, standalone, preview, dismissed }) {
  return ios && !standalone && !preview && !dismissed;
}


/** While the on-screen keyboard is up, the height a full-screen sheet needs so its bottom edge sits above it. */
export function keyboardFit(viewportHeight, viewportTop, pageHeight) {
  return pageHeight - viewportHeight > 100 ? { height: viewportHeight, top: viewportTop } : null;
}
