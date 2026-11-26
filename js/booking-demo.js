export const DEMO_STORAGE_KEY = 'brennwerk.booking-demo.v1';

export function isBookingDemoLocation(location = globalThis.location) {
  return new URLSearchParams(location.search).get('demo') === 'kalender'
    || location.hostname.endsWith('.github.io');
}

const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const fromIso = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return iso(date) === value ? date : null;
};
const copy = value => JSON.parse(JSON.stringify(value));
function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }

export function createBookingDemo({ today = new Date(), storage = globalThis.localStorage } = {}) {
  const todayIso = iso(today);
  const maxDate = iso(new Date(today.getFullYear() + 2, today.getMonth(), today.getDate()));
  const day = offset => iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset));
  function initial() {
    return {
      version: 1, today: todayIso, mode: 'manual', nextId: 1, generation: `${Date.now()}-${Math.random()}`, cancellations: {},
      bookings: [['1', 3, 5], ['1', 10, 11], ['2', 1, 2], ['2', 8, 9]].map(([trailer, first, last], index) => ({
        id: `DEMO-BLOCK-${index + 1}`, trailer, date_from: day(first), date_to: day(last),
        name: 'Beispielbelegung', email: '', phone: '', note: 'Beispieltermin für die Vorführung',
        status: 'blocked', created_at: today.toISOString(),
      })),
    };
  }
  function write(state) { storage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state)); }
  function read() {
    let state;
    try { state = JSON.parse(storage.getItem(DEMO_STORAGE_KEY)); } catch { /* Start a fresh demonstration. */ }
    if (!state || state.version !== 1 || state.today !== todayIso || !Array.isArray(state.bookings)
        || !['manual', 'automatic'].includes(state.mode) || !Number.isInteger(state.nextId) || typeof state.generation !== 'string') {
      state = initial();
      write(state);
    }
    return state;
  }
  function period(data) {
    if (!['1', '2'].includes(data.trailer)) fail('Ungültiger Anhänger.');
    if (!fromIso(data.date_from) || !fromIso(data.date_to) || data.date_from < todayIso
        || data.date_to < data.date_from || data.date_to > maxDate) {
      fail('Bitte einen gültigen Zeitraum ab heute innerhalb der nächsten zwei Jahre wählen.');
    }
  }
  function ensureFree(state, data) {
    if (state.bookings.some(booking => booking.trailer === data.trailer && booking.status !== 'cancelled'
        && booking.date_from <= data.date_to && booking.date_to >= data.date_from)) {
      fail('Dieser Zeitraum ist bereits belegt. Bitte andere Tage wählen.', 409);
    }
  }
  function request(action, data = {}) {
    const state = read();
    if (action === 'availability') return {
      periods: state.bookings.filter(booking => booking.status !== 'cancelled').map(({ trailer, date_from, date_to }) => ({ trailer, date_from, date_to })),
      mode: state.mode, booking_enabled: true, today: todayIso, max_date: maxDate, demo_generation: state.generation,
    };
    if (action === 'admin') return {
      csrf: 'demo', mode: state.mode,
      bookings: copy(state.bookings).sort((a, b) => a.date_from.localeCompare(b.date_from) || a.created_at.localeCompare(b.created_at)),
      unsent: 0,
    };
    if (action === 'reserve' || action === 'block') {
      period(data);
      ensureFree(state, data);
      if (action === 'reserve' && (!String(data.name || '').trim() || !String(data.phone || '').trim()
          || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email || ''))) {
        fail('Bitte Name, Telefon und eine gültige E-Mail-Adresse angeben.');
      }
      const booking = {
        id: `DEMO-${String(state.nextId++).padStart(4, '0')}`, trailer: data.trailer,
        date_from: data.date_from, date_to: data.date_to,
        name: action === 'block' ? 'Eigene Blockierung' : String(data.name).trim(),
        email: action === 'block' ? '' : String(data.email).trim(),
        phone: action === 'block' ? '' : String(data.phone).trim(), note: String(data.note || '').trim(),
        status: action === 'block' ? 'blocked' : state.mode === 'automatic' ? 'confirmed' : 'pending',
        created_at: new Date().toISOString(),
      };
      let cancellationToken;
      if (action === 'reserve') {
        cancellationToken = Array.from(globalThis.crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
        (state.cancellations ??= {})[booking.id] = cancellationToken;
      }
      state.bookings.push(booking);
      write(state);
      return { id: booking.id, status: booking.status, ...(cancellationToken ? { cancellation_token: cancellationToken } : {}) };
    }
    if (action === 'cancellation-details' || action === 'cancel') {
      const booking = state.bookings.find(booking => booking.id === data.id);
      if (!booking || !booking.email || !data.token || state.cancellations?.[booking.id] !== data.token) {
        fail('Dieser Stornierungslink ist ungültig. In der Demo gilt der Link nur im selben Browser und bis zum nächsten Zurücksetzen.', 404);
      }
      if (action === 'cancellation-details') {
        const { id, trailer, date_from, date_to, status } = booking;
        return { id, trailer, date_from, date_to, status };
      }
      if (!['pending', 'confirmed', 'cancelled'].includes(booking.status)) fail('Diese Reservierung kann nicht zurückgenommen werden.', 409);
      const alreadyCancelled = booking.status === 'cancelled';
      booking.status = 'cancelled';
      write(state);
      return { id: booking.id, status: booking.status, already_cancelled: alreadyCancelled };
    }
    if (action === 'email-document') {
      const booking = state.bookings.find(booking => booking.id === data.id);
      if (!booking || !booking.email) fail('Keine Kundenreservierung gefunden.', 404);
      return { ok: true, sent: false, recipient: booking.email, demo: true };
    }
    if (action === 'settings') {
      if (!['manual', 'automatic'].includes(data.mode)) fail('Ungültiger Modus.');
      state.mode = data.mode;
    } else if (action === 'status') {
      const booking = state.bookings.find(booking => booking.id === data.id);
      if (!booking) fail('Eintrag nicht gefunden.', 404);
      if (!(data.status === 'confirmed' && booking.status === 'pending')
          && !(data.status === 'cancelled' && ['pending', 'confirmed', 'blocked'].includes(booking.status))) {
        fail('Dieser Statuswechsel ist nicht mehr möglich.', 409);
      }
      booking.status = data.status;
    } else if (action === 'retry-mail' || action === 'logout') {
      return { ok: true };
    } else {
      fail('Nicht gefunden.', 404);
    }
    write(state);
    return { ok: true };
  }
  return { request, reset() { write(initial()); } };
}

export function mountDemoBanner({ admin = false, onOpen, onReset }) {
  const banner = document.createElement('aside');
  banner.className = 'booking-demo-banner';
  banner.setAttribute('aria-label', admin ? 'Demo-Verwaltung' : 'Kalender-Demo');
  const text = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = admin ? 'Demo-Verwaltung' : 'Kalender-Demo';
  const description = document.createElement('p');
  description.textContent = admin
    ? 'Hier erscheinen die Testbuchungen aus der Kundensicht. Beide Ansichten im selben Browser öffnen.'
    : 'Zeitraum wählen, Testbuchung absenden und den Eingang in der Verwaltung ansehen.';
  const note = document.createElement('small');
  note.textContent = 'Nur Testdaten verwenden. Keine echten Buchungen und kein E-Mail-Versand. Demo-Daten bleiben in diesem Browser.';
  text.append(title, description, note);
  const actions = document.createElement('div');
  actions.className = 'booking-demo-actions';
  if (onOpen) {
    const open = document.createElement('button');
    open.type = 'button'; open.className = 'btn btn--primary'; open.textContent = 'Kalender öffnen';
    open.addEventListener('click', onOpen); actions.append(open);
  }
  const otherView = document.createElement('a');
  otherView.href = admin ? 'index.html?demo=kalender' : 'admin.html?demo=kalender';
  otherView.className = 'btn'; otherView.target = '_blank'; otherView.rel = 'noopener';
  otherView.textContent = admin ? 'Kundensicht öffnen' : 'Demo-Verwaltung öffnen';
  const reset = document.createElement('button');
  reset.type = 'button'; reset.className = 'btn'; reset.textContent = 'Demo zurücksetzen';
  reset.addEventListener('click', onReset);
  actions.append(otherView, reset); banner.append(text, actions);
  (admin ? document.querySelector('main') : document.getElementById('home')).before(banner);
}
