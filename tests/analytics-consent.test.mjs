import assert from 'node:assert/strict';
import test from 'node:test';
import { CONSENT_KEY, CONSENT_VERSION, CONSENT_MAX_AGE, createAnalyticsController, measurementId } from '../js/analytics-consent.js';

const ID = 'G-TEST123456';
const START = Date.now();
const saved = (analytics, overrides = {}) => ({ version: CONSENT_VERSION, measurementId: ID, analytics, updatedAt: START, ...overrides });

function browser({ id = ID, record, url = 'https://brennwerkbeer.de/', blocked = false } = {}) {
  let clock = START;
  const values = new Map(record ? [[CONSENT_KEY, JSON.stringify(record)]] : []);
  const cookies = new Map();
  const scripts = [];
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const win = { location: new URL(url), get localStorage() { if (blocked) throw Error('blocked'); return storage; } };
  const doc = {
    title: 'Brennwerk Beer', head: { append: script => scripts.push(script) },
    createElement: () => ({ events: {}, addEventListener(name, handler) { this.events[name] = handler; }, remove() { this.removed = true; } }),
    get cookie() { return [...cookies].map(([name, value]) => `${name}=${value}`).join('; '); },
    set cookie(value) { if (value.includes('Max-Age=0')) cookies.delete(value.split('=')[0]); },
  };
  const analytics = createAnalyticsController({ id, win, doc, now: () => clock });
  const commands = () => (win.dataLayer || []).map(command => Array.from(command));
  return { analytics, win, values, cookies, scripts, commands, advance: milliseconds => { clock += milliseconds; } };
}

test('No tag is requested without a configured ID or a current explicit analytics choice', () => {
  for (const id of ['', 'G-<script>', 'UA-123-1']) {
    const page = browser({ id, record: saved(true) });
    assert.equal(page.analytics.available, false);
    page.analytics.choose(true);
    assert.equal(page.scripts.length, 0);
  }
  const page = browser();
  page.values.set('brennwerk.cookie-notice.v1', JSON.stringify({ version: 1, acknowledgedAt: START }));
  page.analytics.sync();
  assert.equal(page.analytics.choice, null);
  assert.equal(page.scripts.length, 0);
  page.analytics.choose(false);
  assert.equal(page.scripts.length, 0);
  assert.equal(JSON.parse(page.values.get(CONSENT_KEY)).analytics, false);
  assert.equal(measurementId(' g-test123456 '), ID);
});

test('A grant loads exactly one tag and sends only a sanitized page view after it loads', () => {
  const page = browser({ url: 'https://brennwerkbeer.de/index.html?reference=private#kontakt' });
  page.analytics.choose(true);
  assert.equal(page.scripts.length, 1);
  assert.equal(page.scripts[0].src, `https://www.googletagmanager.com/gtag/js?id=${ID}`);
  assert.equal(page.commands().some(command => command[0] === 'config'), false);
  page.scripts[0].events.load();
  page.analytics.sync();
  const config = page.commands().find(command => command[0] === 'config')[2];
  assert.equal(config.page_location, 'https://brennwerkbeer.de/index.html');
  assert.equal(config.page_referrer, '');
  assert.equal(config.allow_google_signals, false);
  assert.equal(config.allow_ad_personalization_signals, false);
  assert.equal(config.cookie_expires, CONSENT_MAX_AGE / 1000);
  assert.equal(config.cookie_update, false);
  assert.equal(config.send_page_view, false);
  assert.equal(page.commands().filter(command => command[0] === 'event').length, 1);
  for (const command of page.commands().filter(command => command[0] === 'consent')) {
    assert.equal(command[2].ad_storage, 'denied');
    assert.equal(command[2].ad_user_data, 'denied');
    assert.equal(command[2].ad_personalization, 'denied');
  }
});

test('Withdrawal disables measurement and removes analytics cookies while preserving required cookies', () => {
  const page = browser({ record: saved(true) });
  page.scripts[0].events.load();
  page.cookies.set('_ga', 'analytics'); page.cookies.set('_ga_TEST123456', 'analytics');
  page.cookies.set('beer_admin', 'required-session');
  page.analytics.choose(false);
  assert.equal(page.win[`ga-disable-${ID}`], true);
  assert.deepEqual([...page.cookies.keys()], ['beer_admin']);
  assert.equal(JSON.parse(page.values.get(CONSENT_KEY)).analytics, false);
  assert.equal(page.commands().at(-1)[2].analytics_storage, 'denied');
});

test('Withdrawal while the tag downloads cannot initialize analytics afterwards', () => {
  const page = browser();
  page.analytics.choose(true);
  page.analytics.choose(false);
  page.scripts[0].events.load();
  assert.equal(page.commands().some(command => ['config', 'event'].includes(command[0])), false);
  assert.equal(page.win[`ga-disable-${ID}`], true);
});

test('Expired, corrupt, future-dated and differently scoped choices never enable analytics', () => {
  for (const record of [saved(true, { updatedAt: START - CONSENT_MAX_AGE }), saved(true, { updatedAt: START + 1 }),
    saved(true, { version: 0 }), saved(true, { measurementId: 'G-OTHER12345' }), saved('yes')]) {
    const page = browser({ record });
    assert.equal(page.scripts.length, 0);
    assert.equal(page.analytics.choice, null);
  }
  const page = browser();
  page.values.set(CONSENT_KEY, '{broken'); page.analytics.sync();
  assert.equal(page.scripts.length, 0);
});

test('An expiry or withdrawal in another tab stops an already granted measurement', () => {
  const page = browser({ record: saved(true) });
  page.scripts[0].events.load();
  page.advance(CONSENT_MAX_AGE);
  page.analytics.sync();
  assert.equal(page.analytics.choice, null);
  assert.equal(page.win[`ga-disable-${ID}`], true);
  page.analytics.choose(true);
  page.values.set(CONSENT_KEY, JSON.stringify(saved(false, { updatedAt: START + CONSENT_MAX_AGE })));
  page.analytics.sync({ external: true });
  assert.equal(page.analytics.choice.analytics, false);
  assert.equal(page.win[`ga-disable-${ID}`], true);
});

test('Admin pages and personal cancellation links never load the tag even after a prior grant', () => {
  for (const url of ['https://brennwerkbeer.de/admin.html', 'https://brennwerkbeer.de/api/index.php',
    'https://brennwerkbeer.de/#stornierung=private-token', 'https://mutterstefan-maker.github.io/brennwerkbeer.de/']) {
    assert.equal(browser({ url, record: saved(true) }).scripts.length, 0);
  }
});

test('Blocked browser storage works without a crash and requires a new choice on the next page', () => {
  const page = browser({ blocked: true });
  assert.equal(page.scripts.length, 0);
  page.analytics.choose(true); page.analytics.sync();
  assert.equal(page.scripts.length, 1);
  assert.equal(page.analytics.choice.analytics, true);
  assert.equal(browser({ blocked: true }).scripts.length, 0);
  page.analytics.choose(false);
  assert.equal(page.win[`ga-disable-${ID}`], true);
});
