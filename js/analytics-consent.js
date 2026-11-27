// Load Google Analytics only after a current, explicit choice for this property.
export const CONSENT_KEY = 'brennwerk.cookie-consent.v1';
export const CONSENT_VERSION = 1;
export const CONSENT_MAX_AGE = 180 * 24 * 60 * 60 * 1000;
const DENIED = {
  analytics_storage: 'denied', ad_storage: 'denied',
  ad_user_data: 'denied', ad_personalization: 'denied',
};

export function measurementId(value) {
  const id = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return /^G-[A-Z0-9]{4,20}$/.test(id) ? id : '';
}

export function readConsent(storage, id, now = Date.now()) {
  if (!id) return null;
  try {
    const saved = JSON.parse(storage.getItem(CONSENT_KEY));
    const age = now - saved?.updatedAt;
    if (saved?.version === CONSENT_VERSION && saved.measurementId === id
      && typeof saved.analytics === 'boolean' && Number.isFinite(saved.updatedAt)
      && age >= 0 && age < CONSENT_MAX_AGE) return saved;
    storage.removeItem(CONSENT_KEY);
  } catch { /* A missing or inaccessible choice never enables analytics. */ }
  return null;
}

export function publicAnalyticsPage(location) {
  return !/\/(?:admin(?:\.html)?|api)(?:\/|$)/i.test(location.pathname)
    && !new URLSearchParams(location.hash.slice(1)).has('stornierung')
    && new URLSearchParams(location.search).get('demo') !== 'kalender'
    && !location.hostname.endsWith('.github.io');
}

export function clearAnalyticsCookies(doc, location) {
  let existing;
  try { existing = doc.cookie; } catch { return; }
  const names = existing.split(';').map(cookie => cookie.split('=')[0].trim())
    .filter(name => /^_ga(?:_[A-Za-z0-9_]+)?$/.test(name));
  const parts = location.hostname.split('.');
  const domains = [''];
  for (let index = 0; index < parts.length - 1; index++) {
    const domain = parts.slice(index).join('.');
    domains.push(domain, `.${domain}`);
  }
  for (const name of names) {
    for (const domain of domains) {
      try { doc.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${domain ? `; Domain=${domain}` : ''}`; }
      catch { /* Cookie access may also be blocked by browser settings. */ }
    }
  }
}

export function createAnalyticsController({ id: rawId, win = window, doc = document, now = Date.now }) {
  const id = measurementId(rawId);
  let storage;
  try { storage = win.localStorage; } catch { /* A choice can apply to this page only. */ }
  let choice = readConsent(storage, id, now());
  let memoryOnly = false;
  let script = null;
  let loaded = false;
  let active = false;
  let configured = false;
  let measured = false;

  const permitted = () => Boolean(id && choice?.analytics && publicAnalyticsPage(win.location));
  const tag = (...args) => win.gtag(...args);

  function startMeasurement() {
    if (!permitted() || !active || measured) return;
    // Never forward query strings, fragments, customer data or booking links.
    const page = {
      page_location: `${win.location.origin}${win.location.pathname}`,
      page_referrer: '', page_title: doc.title,
    };
    tag('consent', 'update', { ...DENIED, analytics_storage: 'granted' });
    if (!configured) {
      tag('config', id, {
        ...page, send_page_view: false,
        allow_google_signals: false, allow_ad_personalization_signals: false,
        cookie_domain: 'none', cookie_path: '/', cookie_expires: CONSENT_MAX_AGE / 1000,
        cookie_update: false, cookie_flags: 'SameSite=Lax;Secure',
      });
      configured = true;
    }
    tag('event', 'page_view', { ...page, send_to: id });
    measured = true;
  }

  function apply() {
    if (!permitted()) {
      if (id) win[`ga-disable-${id}`] = true;
      if (active && loaded) tag('consent', 'update', { ...DENIED });
      active = false;
      measured = false;
      clearAnalyticsCookies(doc, win.location);
      return;
    }
    win[`ga-disable-${id}`] = false;
    active = true;
    if (loaded) { startMeasurement(); return; }
    if (script) return;
    win.dataLayer = win.dataLayer || [];
    win.gtag = function () { win.dataLayer.push(arguments); };
    tag('consent', 'default', { ...DENIED });
    tag('js', new Date(now()));
    script = doc.createElement('script');
    script.id = 'brennwerk-google-analytics';
    script.async = true;
    script.referrerPolicy = 'strict-origin';
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    script.addEventListener('load', () => {
      loaded = true;
      // A choice may have been withdrawn while the tag was downloading.
      startMeasurement();
    });
    script.addEventListener('error', () => {
      script?.remove(); script = null; active = false;
    });
    doc.head.append(script);
  }

  function sync({ external = false } = {}) {
    if (!memoryOnly || external) {
      choice = readConsent(storage, id, now());
      memoryOnly = false;
    } else if (choice && now() - choice.updatedAt >= CONSENT_MAX_AGE) choice = null;
    apply();
    return choice;
  }

  function choose(analytics) {
    if (!id) return null;
    choice = { version: CONSENT_VERSION, measurementId: id, analytics: analytics === true, updatedAt: now() };
    try { storage.setItem(CONSENT_KEY, JSON.stringify(choice)); memoryOnly = false; }
    catch { memoryOnly = true; }
    apply();
    return choice;
  }

  apply();
  return { id, available: Boolean(id), choose, sync, get choice() { return choice; } };
}
