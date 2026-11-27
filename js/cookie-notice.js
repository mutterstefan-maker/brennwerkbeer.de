import { CONSENT_KEY, CONSENT_MAX_AGE, createAnalyticsController } from './analytics-consent.js?v=20261127-ga4';

const NOTICE_KEY = 'brennwerk.cookie-notice.v1';
const NOTICE_VERSION = 1;

function isAcknowledged() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(NOTICE_KEY));
    const age = Date.now() - saved?.acknowledgedAt;
    return saved?.version === NOTICE_VERSION && Number.isFinite(saved.acknowledgedAt)
      && age >= 0 && age < CONSENT_MAX_AGE;
  } catch { return false; }
}

async function analyticsConfiguration() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(new URL('./analytics-config.json', import.meta.url), {
      cache: 'no-store', credentials: 'same-origin', signal: controller.signal,
    });
    return response.ok ? await response.json() : {};
  } catch { return {}; }
  finally { clearTimeout(timeout); }
}

async function init() {
  const config = await analyticsConfiguration();
  const analytics = createAnalyticsController({ id: config?.measurementId });
  const optional = analytics.available;
  document.querySelectorAll('[data-analytics-status]').forEach(element => {
    element.textContent = optional
      ? 'Google Analytics steht als freiwillige Statistikfunktion zur Verfügung. Ohne deine Einwilligung wird der Dienst nicht geladen.'
      : 'Google Analytics ist derzeit nicht aktiviert. Es werden keine Statistikdaten an Google übertragen.';
  });

  const notice = document.createElement('section');
  notice.className = 'cookie-notice';
  notice.id = 'cookie-notice';
  notice.hidden = true;
  notice.setAttribute('role', 'region');
  notice.setAttribute('aria-labelledby', 'cookie-notice-title');
  notice.innerHTML = `
    <h2 id="cookie-notice-title" tabindex="-1">Cookies &amp; Datenschutz</h2>
    <p>${optional
    ? 'Mit deiner Zustimmung nutzen wir Google Analytics (Google Ireland Limited), um die Nutzung unserer Website auszuwerten. Dabei können Daten in die USA übermittelt werden. Du kannst Statistik-Cookies ablehnen und die Website trotzdem vollständig nutzen.'
    : 'Wir verwenden nur technisch notwendige Funktionen. Sie ermöglichen den sicheren Betrieb der Website und speichern deine Auswahl zu diesem Hinweis.'}</p>
    <details class="cookie-notice__details">
      <summary>${optional ? 'Auswahl anpassen' : 'Mehr Informationen'}</summary>
      <div class="cookie-notice__detail-body">
        <strong>Notwendig · immer aktiv</strong>
        <p>Speichert deine Cookie-Auswahl und ermöglicht die Anmeldung im geschützten Verwaltungsbereich. Dafür ist keine Einwilligung erforderlich.</p>
        ${optional ? `<label class="cookie-notice__category">
          <input type="checkbox" data-analytics-choice>
          <span><strong>Statistik mit Google Analytics</strong><span>Hilft uns zu verstehen, welche Seiten besucht werden. Freiwillig und standardmäßig ausgeschaltet.</span></span>
        </label>
        <p>Du kannst deine Einwilligung jederzeit über „Cookie-Einstellungen“ im Seitenfuß ändern oder widerrufen.</p>`
    : '<p>Es werden keine Statistik- oder Werbe-Cookies eingesetzt. Einzelheiten findest du in der Datenschutzerklärung.</p>'}
      </div>
    </details>
    <div class="cookie-notice__bottom">
      <nav class="cookie-notice__links" aria-label="Datenschutzinformationen">
        <a href="datenschutz.html#cookies">Datenschutz</a><a href="impressum.html">Impressum</a>
      </nav>
      <div class="cookie-notice__actions${optional ? '' : ' cookie-notice__actions--single'}">
        ${optional ? `<button type="button" data-cookie-action="reject">Alle ablehnen</button>
        <button type="button" data-cookie-action="save">Auswahl speichern</button>
        <button type="button" data-cookie-action="accept">Alle akzeptieren</button>`
    : '<button type="button" data-cookie-action="close">Hinweis schließen</button>'}
      </div>
    </div>`;

  const spacer = document.createElement('div');
  spacer.className = 'cookie-notice-spacer';
  spacer.setAttribute('aria-hidden', 'true');
  spacer.hidden = true;
  document.body.append(spacer, notice);
  const details = notice.querySelector('details');
  const title = notice.querySelector('h2');
  const checkbox = notice.querySelector('[data-analytics-choice]');
  let returnFocus = null;
  let expiryTimer;
  let closedForPage = false;

  function updateSpace() { spacer.style.height = `${notice.offsetHeight + 32}px`; }
  function showNotice(expanded = false) {
    details.open = expanded;
    if (checkbox) checkbox.checked = analytics.choice?.analytics === true;
    notice.hidden = false; spacer.hidden = false; updateSpace();
  }
  function hideNotice() {
    const hadFocus = notice.contains(document.activeElement);
    notice.hidden = true; spacer.hidden = true;
    if (hadFocus) returnFocus?.focus({ preventScroll: true });
    returnFocus = null;
  }
  function scheduleExpiry() {
    clearTimeout(expiryTimer);
    if (analytics.choice) expiryTimer = setTimeout(refresh,
      Math.min(2_147_483_647, Math.max(1, analytics.choice.updatedAt + CONSENT_MAX_AGE - Date.now())));
  }
  function refresh(external = false) {
    analytics.sync({ external: external === true });
    scheduleExpiry();
    if (optional ? !analytics.choice : !closedForPage && !isAcknowledged()) showNotice();
    else hideNotice();
  }

  notice.querySelectorAll('[data-cookie-action]').forEach(button => {
    button.addEventListener('click', () => {
      const action = button.dataset.cookieAction;
      if (optional) analytics.choose(action === 'accept' || (action === 'save' && checkbox.checked));
      else {
        closedForPage = true;
        try { window.localStorage.setItem(NOTICE_KEY, JSON.stringify({ version: NOTICE_VERSION, acknowledgedAt: Date.now() })); }
        catch { /* Dismiss for this page if storage is unavailable. */ }
      }
      scheduleExpiry(); hideNotice();
    });
  });
  document.querySelectorAll('[data-cookie-settings]').forEach(link => {
    link.textContent = optional ? 'Cookie-Einstellungen' : 'Cookie-Informationen';
    link.setAttribute('aria-controls', notice.id);
    link.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
      event.preventDefault(); returnFocus = link; showNotice(true); title.focus({ preventScroll: true });
    });
  });
  details.addEventListener('toggle', updateSpace);
  window.addEventListener('resize', updateSpace);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(updateSpace).observe(notice);
  window.addEventListener('storage', event => {
    if (event.key === CONSENT_KEY || event.key === NOTICE_KEY || event.key === null) refresh(true);
  });
  window.addEventListener('pageshow', event => { if (event.persisted) refresh(); });
  window.addEventListener('focus', () => {
    analytics.sync(); scheduleExpiry();
    if (optional && !analytics.choice) showNotice();
  });
  window.addEventListener('hashchange', () => analytics.sync());
  refresh();
}

init();
