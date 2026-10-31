import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
// SE-SITE-001: both routes are prerendered, and every local URL works under a project prefix (/speakease/).
for (const [route, lang, hero] of [['index.html', 'vi', 'Gõ ít đi,'], ['en/index.html', 'en', 'Type less,']]) test(`built ${route}: prerendered and portable`, () => {
  const html = readFileSync(resolve(dist, route), 'utf8');
  assert.match(html, new RegExp(`<html lang="${lang}">`));
  assert.doesNotMatch(html, /<!--app-html-->|\/src\/|src="\/site.js"/);
  assert.ok(html.includes(hero));
  assert.match(html, /data-step="write"/);
  const shot = `${route.startsWith('en/') ? '../' : ''}screenshots/${lang}-history.png`;
  assert.ok(html.includes(`src="${shot}"`));
  const png = readFileSync(resolve(dirname(resolve(dist, route)), shot));
  assert.equal(png.readUInt32BE(16), 1760);
  assert.equal(png.readUInt32BE(20), 1240);
  const local = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map(m => m[1]).filter(p => !/^https?:/.test(p));
  for (const path of local) {
    assert.ok(!path.startsWith('/'), `absolute URL breaks project-prefix hosting: ${path}`);
    const target = resolve(dirname(resolve(dist, route)), path);
    assert.ok(target === dist || target.startsWith(`${dist}/`), `asset outside site: ${path}`);
    assert.ok(existsSync(target), `missing built asset or route: ${path}`);
  }
});
test('the runtime ships with its third-party notices', () => {
  const notices = readFileSync(resolve(dist, 'THIRD_PARTY_LICENSES.txt'), 'utf8');
  assert.match(notices, /MIT License/); assert.match(notices, /GreenSock/); assert.match(notices, /gsap.com\/standard-license/);
});
