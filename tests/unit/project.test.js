import test from 'node:test'; import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = d => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const sw = readFileSync('sw.js', 'utf8');
test('the service worker lists every js and css file', () => {
  for (const f of [...walk('js'), ...walk('css')]) assert.ok(sw.includes(`'./${f.replace(/\\/g, '/')}'`), `${f} is missing from APP_FILES`);
});
test('every file the service worker lists exists', () => {
  for (const [, f] of sw.matchAll(/'\.\/([^']+\.[a-z]+)'/g)) assert.ok(existsSync(f), `${f} does not exist`);
});
test('every data-action in the screens has a handler', () => {
  const src = walk('js').filter(f => f.includes('ui') || f.endsWith('main.js')).map(f => readFileSync(f, 'utf8')).join('\n') + readFileSync('index.html', 'utf8');
  const used = new Set([...src.matchAll(/data-action="([a-z-]+)"/g)].map(m => m[1]));
  for (const a of used) assert.ok(src.includes(`actions['${a}']`) || src.includes(`actions.${a} `), `no handler for ${a}`);
});
test('rules never let anyone list trips or remove expenses', () => {
  const rules = readFileSync('firestore.rules', 'utf8');
  assert.match(rules, /match \/trips\/\{tripId\} \{[\s\S]*?allow list: if false/);
  assert.match(rules, /match \/entries\/\{id\} \{[\s\S]*?allow delete: if false/);
});
test('the Firebase SDK provides everything the backend calls', async () => {
  const src = readFileSync('js/data/backend-firebase.js', 'utf8');
  const sdk = { ...(await import('firebase/app')), ...(await import('firebase/firestore')) };
  const used = new Set([...src.matchAll(/sdk\.([a-zA-Z]+)/g)].map(m => m[1]));
  assert.ok(used.size >= 10);
  for (const name of used) assert.equal(typeof sdk[name], 'function', `firebase has no ${name}`);
});
test('the pinned SDK matches the app', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.ok(readFileSync('js/config/firebase.js', 'utf8').includes(`'${pkg.devDependencies.firebase}'`));
});
