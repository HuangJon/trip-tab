// node tools/make-icons.mjs: draws the app icons (a torn ticket on the app's blue).
import { chromium } from 'playwright';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#1f45d0"/>
<path d="M96 150h320a16 16 0 0 1 16 16v50a40 40 0 0 0 0 80v50a16 16 0 0 1-16 16H96a16 16 0 0 1-16-16v-50a40 40 0 0 0 0-80v-50a16 16 0 0 1 16-16z" fill="#f8fbfb"/>
<path d="M322 170v172" stroke="#1f45d0" stroke-width="12" stroke-dasharray="20 18" stroke-linecap="round"/>
<path d="M140 256h110M210 216l40 40-40 40" fill="none" stroke="#10272e" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const b = await chromium.launch();
for (const size of [180, 192, 512]) {
  const p = await b.newPage({ viewport: { width: size, height: size } });
  await p.setContent(`<!doctype html><body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`);
  await p.screenshot({ path: `icons/icon-${size}.png` });
  await p.close();
}
await b.close();
