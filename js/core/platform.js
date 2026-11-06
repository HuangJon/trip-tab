/** Decides whether to suggest installing. Safari can clear a site's data after about a week away; home-screen apps are exempt. */
export function isIos(ua = '', platform = '', touchPoints = 0) {
  return /iPhone|iPad|iPod/.test(ua) || (platform === 'MacIntel' && touchPoints > 1);
}
export function shouldSuggestInstall({ ios, standalone, preview, dismissed }) {
  return ios && !standalone && !preview && !dismissed;
}

