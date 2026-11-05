/** Light or dark, chosen in Settings. Light unless someone picks dark, and remembered on this device. */
const KEY = 'triptab:look';
const COLORS = { light: '#E3DED3', dark: '#1C1B19' };

export function currentLook() {
  try { return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
}
export function applyLook(look = currentLook()) {
  document.documentElement.dataset.look = look;
  document.getElementById('themeColor')?.setAttribute('content', COLORS[look]);
}
export function setLook(look) {
  try { localStorage.setItem(KEY, look); } catch { /* this device just won't remember */ }
  applyLook(look);
}
