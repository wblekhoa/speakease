import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { App, cardIndex, dragTarget } from '../src/App.jsx';
import { content } from '../src/content.js';
import { startAnalytics, GA_ID } from '../src/analytics.js';
import { resolveRelease, fetchRelease, fallback } from '../src/release.js';
import { createStory, demoState, keyboardIndex, progressIndex, stepTargets } from '../src/story.js';

// SE-SITE-002: the one action is the newest arm64 .dmg, from a trusted URL only.
const asset = (overrides = {}) => ({ name: 'SpeakEase-1.2.3-arm64.dmg', size: 21728350,
  browser_download_url: 'https://github.com/wblekhoa/speakease/releases/download/v1.2.3/SpeakEase-1.2.3-arm64.dmg', ...overrides });
const release = overrides => ({ tag_name: 'v1.2.3', assets: [{ name: 'latest.json', size: 882, browser_download_url: 'https://github.com/wblekhoa/speakease/releases/download/v1.2.3/latest.json' }, asset()], ...overrides });
test('trusted stable arm64 release resolves to its .dmg', () => {
  const resolved = resolveRelease(release());
  assert.equal(resolved.version, '1.2.3');
  assert.equal(resolved.dmg.name, 'SpeakEase-1.2.3-arm64.dmg');
});
for (const [label, value] of Object.entries({ absent: null, draft: release({ draft: true }), prerelease: release({ prerelease: true }), noVersion: release({ tag_name: '' }), malformedVersion: release({ tag_name: {} }), noAssets: release({ assets: null }), onlyZip: release({ assets: [asset({ name: 'SpeakEase-1.2.3-arm64.zip' })] }) })) {
  test(`release fallback: ${label}`, () => assert.equal(resolveRelease(value), null));
}
for (const [label, patch] of Object.entries({ foreign: { browser_download_url: 'https://evil.example/a.dmg' }, wrongRepo: { browser_download_url: 'https://github.com/wblekhoa/readease/releases/download/v1/a-arm64.dmg' }, http: { browser_download_url: 'http://github.com/wblekhoa/speakease/releases/download/a-arm64.dmg' }, credentials: { browser_download_url: 'https://user:pass!@github.com/wblekhoa/speakease/releases/download/a-arm64.dmg' }, intel: { name: 'SpeakEase-1.2.3-x64.dmg' }, badSize: { size: -1 }, infiniteSize: { size: Infinity }, badUrl: { browser_download_url: 'broken' } })) {
  test(`reject unsafe asset: ${label}`, () => assert.equal(resolveRelease(release({ assets: [asset(patch)] })), null));
}
test('network, HTTP and JSON failures keep the fallback', async () => {
  for (const request of [async () => { throw Error('offline'); }, async () => ({ ok: false }), async () => ({ ok: true, json: async () => { throw Error('invalid'); } })]) assert.equal(await fetchRelease(undefined, request), null);
  assert.equal(fallback, 'https://github.com/wblekhoa/speakease/releases/latest');
});
test('request carries the abort signal and asks this repository', async () => {
  const controller = new AbortController();
  const result = await fetchRelease(controller.signal, async (url, options) => {
    assert.equal(options.signal, controller.signal);
    assert.equal(url, 'https://api.github.com/repos/wblekhoa/speakease/releases/latest');
    return { ok: true, json: async () => release() };
  });
  assert.equal(result.version, '1.2.3');
});

// SE-SITE-003: the demo's three steps by scroll, by keys, or by tabs alone.
test('keyboard wraps, Home/End jump, other keys do not intercept', () => {
  assert.equal(keyboardIndex('ArrowLeft', 0), 2);
  assert.equal(keyboardIndex('ArrowRight', 2), 0);
  assert.equal(keyboardIndex('Home', 2), 0);
  assert.equal(keyboardIndex('End', 0), 2);
  assert.equal(keyboardIndex('Tab', 0), undefined);
});
test('scroll progress splits into three equal steps, clamped at the ends', () => {
  assert.deepEqual([-.1, 0, .2, .23, .5, .59, .6, .9, 1, 1.2].map(progressIndex), [0, 0, 0, 1, 1, 1, 2, 2, 2, 2]);
});
// No pill until the first press; the second press transcribes; the keys move with the scroll.
test('timeline: idle → ⌥ then Space pop the pill → listen → second chord → written', () => {
  const at = p => { const s = demoState(p); return [s.phase, ...['altShow', 'alt', 'spaceShow', 'space', 'typed'].map(k => +s[k].toFixed(2))]; };
  // [phase, ⌥ shown, ⌥ pressed, Space shown, Space pressed, sentence typed]
  assert.deepEqual(at(0), ['idle', 0, 0, 0, 0, 0]);
  assert.deepEqual(at(.05), ['idle', 1, .42, 0, 0, 0]);
  assert.deepEqual(at(.1), ['idle', 1, 1, .8, 0, 0]);
  assert.deepEqual(at(1 / 6), ['rec', 1, 1, 1, 1, 0]);
  assert.deepEqual(at(.2), ['rec', 1, 1, 1, .37, 0]);
  assert.deepEqual(at(stepTargets[0]), ['rec', 1, 1, 1, 1, 0]);
  assert.deepEqual(at(stepTargets[1]), ['rec', 0, 0, 0, 0, 0]);
  assert.deepEqual(at(.7), ['work', 1, 1, 1, 1, 0]);
  assert.deepEqual(at(.9), ['work', 0, 0, 0, 0, .77]);
  assert.deepEqual(at(stepTargets[2]), ['done', 0, 0, 0, 0, 1]);
  assert.deepEqual(at(1.5), at(1));
});
function harness({ reduced = false, tall = false } = {}) {
  const handlers = new Map();
  const selections = [], pins = [], triggers = [], classes = new Set(), properties = new Map();
  const vars = new Map();
  const stage = { getBoundingClientRect: () => ({ height: tall ? 2000 : 700 }), contains: el => el === stage.child, child: {}, dataset: {},
    style: { setProperty: (k, v) => vars.set(k, v), removeProperty: k => vars.delete(k) } };
  const document = { activeElement: null };
  const section = { ownerDocument: document, querySelector: () => stage, getBoundingClientRect: () => ({ top: 100 }),
    classList: { toggle(k, on) { on ? classes.add(k) : classes.delete(k); }, remove: k => classes.delete(k) },
    style: { setProperty: (k, v) => properties.set(k, v), removeProperty: k => properties.delete(k) } };
  const media = { matches: !reduced, addEventListener: (k, fn) => handlers.set(`media:${k}`, fn), removeEventListener: k => handlers.delete(`media:${k}`) };
  const win = { innerHeight: 1000, scrollY: 0, getComputedStyle: () => ({ paddingTop: '0px' }), matchMedia: () => media,
    addEventListener: (k, fn) => handlers.set(k, fn), removeEventListener: k => handlers.delete(k), scrollTo: value => { win.lastScroll = value; } };
  const ScrollTrigger = { create(options) { const trigger = { options, progress: 0, killed: false, kill() { this.killed = true; } }; triggers.push(trigger); return trigger; } };
  const story = createStory(section, { ScrollTrigger, onSelect: i => selections.push(i), onPinned: p => pins.push(p), win });
  return { story, win, document, stage, vars, media, handlers, selections, pins, triggers, classes, properties };
}
test('scroll walks press → listen → write and back; a tab click scrolls to its step', () => {
  const h = harness();
  const trigger = h.triggers[0];
  assert.deepEqual(h.pins, [true]);
  assert.equal(trigger.options.start(), 76);
  assert.equal(trigger.options.end(), 76 + 550 * 3);
  for (const progress of [.5, .9, .5, 0]) trigger.options.onUpdate({ progress });
  assert.deepEqual(h.selections, [0, 1, 2, 1, 0]);
  h.story.navigate(2);
  assert.deepEqual(h.win.lastScroll, { top: 76 + 550 * 3 * .999, behavior: 'instant' });
  h.story.navigate(0);
  assert.deepEqual(h.win.lastScroll, { top: 76 + 550 * 3 * stepTargets[0], behavior: 'instant' });
  h.story.destroy();
});
for (const mode of ['reduced', 'tall']) test(`${mode} view keeps tabs, does not pin and shows the result`, () => {
  const h = harness({ [mode]: true });
  assert.equal(h.triggers.length, 0);
  assert.equal(h.classes.size, 0);
  assert.deepEqual(h.pins, [false]);
  assert.equal(h.stage.dataset.phase, 'done');
  h.story.navigate(1);
  assert.deepEqual(h.selections, [1]);
  assert.equal(h.win.lastScroll, undefined);
  assert.equal(h.stage.dataset.phase, 'rec');
  h.story.destroy();
});
test('scroll does not move the step while a tab inside the stage has focus', () => {
  const h = harness(); h.document.activeElement = h.stage.child;
  h.triggers[0].options.onUpdate({ progress: 1 });
  assert.deepEqual(h.selections, [0]);
  h.story.destroy();
});
test('resize and preference changes recreate only the owned trigger; destroy removes every listener', () => {
  const h = harness();
  h.handlers.get('resize')();
  assert.equal(h.triggers[0].killed, true);
  h.media.matches = false; h.handlers.get('media:change')();
  assert.equal(h.triggers[1].killed, true);
  assert.equal(h.classes.size, 0);
  h.media.matches = true; h.handlers.get('media:change')();
  h.story.destroy();
  assert.equal(h.triggers.at(-1).killed, true);
  assert.equal(h.handlers.size, 0);
  assert.equal(h.properties.size, 0);
  assert.equal(h.vars.size, 0);
  assert.equal(h.stage.dataset.phase, undefined);
});

// SE-SITE-007: no ID, localhost or Do Not Track → nothing loads, nothing is sent.
test('analytics stays off without an ID, on localhost and under Do Not Track', () => {
  assert.equal(GA_ID, '');
  const appended = [];
  const win = host => ({ location: { hostname: host }, navigator: { doNotTrack: null }, document: { head: { append: s => appended.push(s) }, createElement: () => ({}), addEventListener() {}, documentElement: { lang: 'vi' } } });
  assert.equal(startAnalytics('', win('wblekhoa.github.io')), false);
  assert.equal(startAnalytics('G-TEST', win('localhost')), false);
  const dnt = win('wblekhoa.github.io'); dnt.navigator.doNotTrack = '1';
  assert.equal(startAnalytics('G-TEST', dnt), false);
  assert.equal(appended.length, 0);
  assert.equal(startAnalytics('G-TEST', win('wblekhoa.github.io')), true);
  assert.equal(appended.length, 1);
});

// SE-SITE-001, 004, 005, 008: both routes, the owner's sections, released features only.
const UNRELEASED = /phụ đề|subtitle|cuộc họp|meeting|setapp|llama|qwen|sắp có|coming soon/i;
for (const locale of ['vi', 'en']) test(`${locale}: SSR carries every section, one action and no unreleased promise`, () => {
  const html = renderToString(<App locale={locale} />);
  const c = content[locale];
  assert.equal((html.match(/<h1 /g) || []).length, 1);
  assert.ok(html.includes(c.hero[1]));
  for (const id of ['demo', 'features', 'compare', 'install', 'faq', c.downloadId]) assert.match(html, new RegExp(`id="${id}"`));
  // One action, twice (hero and closing): the newest .dmg, else the newest release's page.
  assert.equal((html.match(/data-download=/g) || []).length, 2);
  assert.equal((html.match(new RegExp(`class="button" href="${fallback}"`, 'g')) || []).length, 2);
  // Without JavaScript the demo shows the result and plain steps, not inert tabs.
  assert.match(html, /data-step="write"/);
  assert.doesNotMatch(html, /role="tablist"/);
  assert.equal((html.match(/class="typed"/g) || []).length, c.spoken.split(' ').length);
  assert.equal((html.match(/class="way-card"/g) || []).length, 4);
  assert.equal((html.match(/<tbody>.*<\/tbody>/)[0].match(/<tr>/g) || []).length, c.rows.length);
  assert.equal((html.match(/<details>/g) || []).length, c.faq.length);
  assert.equal(c.installItems.length, 3);
  // The caveats the owner's sections must carry: AI needs Apple Intelligence or a key; personal use only.
  assert.ok(html.includes(c.aiNeeds));
  assert.match(html, /PolyForm Noncommercial/);
  // One title per card: no eyebrow or description stacks (owner's ReadEase rule).
  assert.doesNotMatch(html, /eyebrow|way-type|class="label"/);
  assert.doesNotMatch(JSON.stringify(c), UNRELEASED);
  assert.match(html, /<header[\s\S]*class="nav-github" href="https:\/\/github\.com\/wblekhoa\/speakease"[\s\S]*<\/header>/);
  assert.match(html, /<header[\s\S]*class="theme-toggle"[\s\S]*<\/header>/);
  const shots = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map(m => m[1]).filter(src => src.includes('screenshots/'));
  assert.deepEqual(shots, [`${locale === 'en' ? '../' : ''}screenshots/${locale}-history.png`]);
});
test('both locales say the same things', () => {
  const shape = value => Array.isArray(value) ? value.map(shape) : typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v)])) : typeof value;
  assert.deepEqual(shape(content.en), shape(content.vi));
  assert.deepEqual(content.en.rows.map(r => r[1]), content.vi.rows.map(r => r[1]));
});
test('pages keep the theme before paint; CSS takes colours from the app palette and loops nothing', () => {
  for (const page of ['../index.html', '../en/index.html']) {
    assert.match(readFileSync(new URL(page, import.meta.url), 'utf8'), /localStorage\.getItem\("speakease-site-theme"\)/);
  }
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /@import "\.\.\/src\/styles\/theme\.css";/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i, 'no colour literal outside theme.css');
  assert.doesNotMatch(css, /gradient\(/, 'flat surfaces only (owner)');
  assert.doesNotMatch(css, /infinite/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /\.nav-shell \{ position: sticky/);
});

test('card scroller: the track end selects the last card even when several cards fit', () => {
  // 1280 px: four 520 px cards, 24 px gaps, the track can scroll about 1.6 strides
  assert.equal(cardIndex(0, 872, 544, 4), 0);
  assert.equal(cardIndex(544, 872, 544, 4), 1);
  assert.equal(cardIndex(872, 872, 544, 4), 3);
  assert.equal(cardIndex(871, 872, 544, 4), 3);
  // phones: one card per view, every card reachable by stride
  assert.equal(cardIndex(2 * 339, 3 * 339, 339, 4), 2);
  assert.equal(cardIndex(3 * 339, 3 * 339, 339, 4), 3);
});

test('card scroller: a mouse drag lands on a card edge, or the track end', () => {
  // stride 544, max 1016 (1280 px)
  assert.equal(dragTarget(0, 50, 1016, 544), 0);       // under 15%: back
  assert.equal(dragTarget(0, 120, 1016, 544), 544);    // past 15%: next card
  assert.equal(dragTarget(544, 470, 1016, 544), 544);  // 74 px back is under 15%: stays
  assert.equal(dragTarget(544, 440, 1016, 544), 0);    // 104 px back: previous card
  assert.equal(dragTarget(544, 900, 1016, 544), 1016); // beyond the last stop: the end
  assert.equal(dragTarget(0, -40, 1016, 544), 0);
});
