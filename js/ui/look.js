/** Blue, light or dark, chosen behind your icon. Blue unless someone picks another, and remembered on this device. */
const KEY = 'triptab:look';
const COLORS = { blue: '#edf3f8', light: '#E3DED3', dark: '#1C1B19' };

export function currentLook() {
  try { const v = localStorage.getItem(KEY); return COLORS[v] ? v : 'blue'; } catch { return 'blue'; }
}
export function applyLook(look = currentLook()) {
  document.documentElement.dataset.look = look;
  document.getElementById('themeColor')?.setAttribute('content', COLORS[look]);
}
export function setLook(look) {
  try { localStorage.setItem(KEY, look); } catch { /* this device just won't remember */ }
  applyLook(look);
}
