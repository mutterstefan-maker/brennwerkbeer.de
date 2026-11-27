import { isBookingDemoLocation } from './booking-demo.js?v=20261126-admin-documents';

// Shared notice for the website's exclusively necessary cookies and storage.
const STORAGE_KEY = 'brennwerk.cookie-notice.v1';
const VERSION = 1;
const MAX_AGE = 180 * 24 * 60 * 60 * 1000;
const showDemoDetails = isBookingDemoLocation();

function isAcknowledged() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    const age = Date.now() - saved?.acknowledgedAt;
    if (saved?.version === VERSION && Number.isFinite(saved.acknowledgedAt) && age >= 0 && age < MAX_AGE) return true;
    window.localStorage.removeItem(STORAGE_KEY);
  } catch { /* The notice also works when browser storage is unavailable. */ }
  return false;
}

const notice = document.createElement('section');
notice.className = 'cookie-notice';
notice.id = 'cookie-notice';
notice.hidden = true;
notice.setAttribute('role', 'region');
notice.setAttribute('aria-labelledby', 'cookie-notice-title');
notice.innerHTML = `
  <h2 id="cookie-notice-title" tabindex="-1">Cookies &amp; Datenschutz</h2>
  <p>Wir verwenden ausschließlich technisch notwendige Cookies für den Betrieb der Website und die Buchungsverwaltung. Es gibt keine Tracking- oder Werbe-Cookies.</p>
  <details class="cookie-notice__details">
    <summary>Cookie-Details anzeigen</summary>
    <div class="cookie-notice__detail-body">
      <p><strong>Technisch notwendig · immer aktiv</strong><br>Diese Funktionen benötigen wir für den sicheren Betrieb. Sie erfordern keine Einwilligung.</p>
      <dl>
        <div><dt>beer_admin · Sitzungscookie</dt><dd>Verwaltet die Sitzung der Buchungsverwaltung. Wird bei Anfragen an die Buchungs-API gesetzt und beim Ende der Browsersitzung gelöscht.</dd></div>
        <div><dt>brennwerk.cookie-notice.v1 · lokaler Browserspeicher</dt><dd>Merkt sich nach „Verstanden“ die Bestätigung dieses Hinweises. Nach 180 Tagen wird sie beim nächsten Seitenaufruf verworfen und der Hinweis erneut angezeigt.</dd></div>
        ${showDemoDetails ? '<div><dt>brennwerk.booking-demo.v1 · nur im Demo-Modus</dt><dd>Speichert Beispielbuchungen für die Kalender-Demo in deinem Browser. Die Demo startet an einem neuen Tag frisch; über „Demo zurücksetzen“ kannst du die Testdaten zurücksetzen.</dd></div>' : ''}
      </dl>
      <p>Wir verwenden keine optionalen Cookies, Analyse- oder Marketingdienste. Deine Cookie-Einstellungen kannst du jederzeit über den Link im Seitenfuß erneut öffnen.</p>
    </div>
  </details>
  <div class="cookie-notice__bottom">
    <nav class="cookie-notice__links" aria-label="Datenschutzinformationen">
      <a href="datenschutz.html#cookies">Datenschutz</a>
      <a href="impressum.html">Impressum</a>
    </nav>
    <button type="button" class="cookie-notice__confirm">Verstanden</button>
  </div>
`;

// Reserve scroll space so the fixed notice never makes the page footer unreachable.
const spacer = document.createElement('div');
spacer.className = 'cookie-notice-spacer';
spacer.setAttribute('aria-hidden', 'true');
spacer.hidden = true;
document.body.append(spacer, notice);

const details = notice.querySelector('details');
const title = notice.querySelector('h2');
let returnFocus = null;

function updateSpace() {
  spacer.style.height = `${notice.offsetHeight + 32}px`;
}

function showNotice(expanded = false) {
  details.open = expanded;
  notice.hidden = false;
  spacer.hidden = false;
  updateSpace();
}

function hideNotice() {
  const hadFocus = notice.contains(document.activeElement);
  notice.hidden = true;
  spacer.hidden = true;
  if (hadFocus) returnFocus?.focus({ preventScroll: true });
  returnFocus = null;
}

notice.querySelector('button').addEventListener('click', () => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, acknowledgedAt: Date.now() }));
  } catch { /* Without storage, dismiss for this page visit only. */ }
  hideNotice();
});

document.querySelectorAll('[data-cookie-settings]').forEach(link => {
  link.setAttribute('aria-controls', notice.id);
  link.addEventListener('click', event => {
    // Preserve opening the privacy-page fallback in a new tab.
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    returnFocus = link;
    showNotice(true);
    title.focus({ preventScroll: true });
  });
});

details.addEventListener('toggle', updateSpace);
window.addEventListener('resize', updateSpace);
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(updateSpace).observe(notice);
window.addEventListener('storage', event => {
  if (event.key === STORAGE_KEY || event.key === null) {
    if (isAcknowledged()) hideNotice();
    else showNotice();
  }
});
window.addEventListener('pageshow', event => {
  if (event.persisted) {
    if (isAcknowledged()) hideNotice();
    else showNotice();
  }
});

if (!isAcknowledged()) showNotice();
