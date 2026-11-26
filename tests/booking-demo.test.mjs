import assert from 'node:assert/strict';
import test from 'node:test';
import { createBookingDemo, isBookingDemoLocation } from '../js/booking-demo.js';

function setup() {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const options = { storage, today: new Date(2026, 10, 22) };
  return { customer: createBookingDemo(options), admin: createBookingDemo(options) };
}
const booking = {
  trailer: '1', date_from: '2026-11-22', date_to: '2026-11-23',
  name: 'Max Mustermann', email: 'demo@example.com', phone: '0123456789', note: 'Vorführung',
};

test('Die Demo ist explizit oder auf GitHub Pages aktiv, der PHP-Webspace bleibt im Echtbetrieb', () => {
  assert.equal(isBookingDemoLocation({ search: '?demo=kalender', hostname: 'localhost' }), true);
  assert.equal(isBookingDemoLocation({ search: '', hostname: 'mutterstefan-maker.github.io' }), true);
  assert.equal(isBookingDemoLocation({ search: '', hostname: 'brennwerkbeer.de' }), false);
});

test('Kundenreservierung erscheint mit Kontaktdaten im getrennten Admin und sperrt den Zeitraum', () => {
  const { customer, admin } = setup();
  const reserved = customer.request('reserve', booking);
  const entry = admin.request('admin').bookings.find(row => row.id === reserved.id);
  assert.equal(entry.status, 'pending');
  assert.equal(entry.name, booking.name);
  assert.equal(entry.email, booking.email);
  assert.deepEqual(customer.request('availability').periods.find(row => row.date_from === booking.date_from), {
    trailer: '1', date_from: booking.date_from, date_to: booking.date_to,
  });
  assert.throws(() => customer.request('reserve', { ...booking, date_from: booking.date_to }), { status: 409 });
  assert.equal(customer.request('reserve', { ...booking, trailer: '2', date_to: booking.date_from }).status, 'pending');
});

test('Admin kann bestätigen, stornieren und freigegebene Tage erneut blockieren', () => {
  const { customer, admin } = setup();
  const reserved = customer.request('reserve', booking);
  admin.request('status', { id: reserved.id, status: 'confirmed' });
  assert.equal(admin.request('admin').bookings.find(row => row.id === reserved.id).status, 'confirmed');
  admin.request('status', { id: reserved.id, status: 'cancelled' });
  assert.equal(customer.request('availability').periods.some(row => row.date_from === booking.date_from), false);
  assert.equal(admin.request('block', booking).status, 'blocked');
  assert.throws(() => customer.request('reserve', booking), { status: 409 });
});

test('Automatische Bestätigung gilt nur für neue Testbuchungen; Reset entfernt Testdaten', () => {
  const { customer, admin } = setup();
  const pending = customer.request('reserve', booking);
  admin.request('settings', { mode: 'automatic' });
  assert.equal(admin.request('admin').bookings.find(row => row.id === pending.id).status, 'pending');
  assert.equal(customer.request('reserve', { ...booking, trailer: '2', date_to: booking.date_from }).status, 'confirmed');
  admin.reset();
  assert.equal(customer.request('availability').mode, 'manual');
  assert.equal(admin.request('admin').bookings.every(row => row.status === 'blocked' && row.email === ''), true);
  assert.equal(customer.request('reserve', booking).status, 'pending');
});

test('Ungültige Daten, Beispielbelegungen und unzulässige Statuswechsel werden abgefangen', () => {
  const { customer, admin } = setup();
  assert.throws(() => customer.request('reserve', { ...booking, date_from: '2026-11-21' }), { status: 400 });
  assert.throws(() => customer.request('reserve', { ...booking, date_to: '2026-11-31' }), { status: 400 });
  assert.throws(() => customer.request('reserve', { ...booking, date_to: '2026-11-26' }), { status: 409 });
  assert.throws(() => admin.request('status', { id: 'DEMO-BLOCK-1', status: 'confirmed' }), { status: 409 });
});

test('Kunden können Reservierungen und bestätigte Buchungen mit ihrem persönlichen Link zurücknehmen', () => {
  for (const mode of ['manual', 'automatic']) {
    const { customer, admin } = setup();
    admin.request('settings', { mode });
    const reserved = customer.request('reserve', booking);
    assert.match(reserved.cancellation_token, /^[a-f0-9]{64}$/);
    const credentials = { id: reserved.id, token: reserved.cancellation_token };
    assert.deepEqual(customer.request('cancellation-details', credentials), {
      id: reserved.id, trailer: booking.trailer, date_from: booking.date_from, date_to: booking.date_to, status: reserved.status,
    });
    assert.equal(customer.request('availability').periods.some(row => row.date_from === booking.date_from), true);
    assert.equal('cancellation_token' in admin.request('admin').bookings.find(row => row.id === reserved.id), false);
    assert.throws(() => customer.request('cancel', { id: reserved.id }), { status: 404 });
    assert.throws(() => customer.request('cancel', { ...credentials, token: '0'.repeat(64) }), { status: 404 });
    assert.equal(admin.request('admin').bookings.find(row => row.id === reserved.id).status, reserved.status);
    assert.deepEqual(customer.request('cancel', credentials), { id: reserved.id, status: 'cancelled', already_cancelled: false });
    assert.equal(admin.request('admin').bookings.find(row => row.id === reserved.id).status, 'cancelled');
    assert.equal(customer.request('availability').periods.some(row => row.date_from === booking.date_from), false);
    const replacement = customer.request('reserve', booking);
    assert.deepEqual(customer.request('cancel', credentials), { id: reserved.id, status: 'cancelled', already_cancelled: true });
    assert.equal(admin.request('admin').bookings.find(row => row.id === replacement.id).status, replacement.status);
  }
});

test('Stornierungslinks gelten nur für die eigene Reservierung und überstehen die Admin-Bestätigung', () => {
  const { customer, admin } = setup();
  const first = customer.request('reserve', booking);
  const second = customer.request('reserve', { ...booking, trailer: '2', date_to: booking.date_from });
  assert.notEqual(first.cancellation_token, second.cancellation_token);
  const credentials = { id: first.id, token: first.cancellation_token };
  assert.throws(() => customer.request('cancellation-details', { ...credentials, id: second.id }), { status: 404 });
  assert.throws(() => customer.request('cancel', { ...credentials, id: 'DEMO-BLOCK-1' }), { status: 404 });
  admin.request('status', { id: first.id, status: 'confirmed' });
  assert.equal(customer.request('cancellation-details', credentials).status, 'confirmed');
  assert.equal(customer.request('cancel', credentials).status, 'cancelled');
  customer.reset();
  const replacement = customer.request('reserve', booking);
  assert.equal(replacement.id, first.id);
  assert.notEqual(replacement.cancellation_token, first.cancellation_token);
  assert.throws(() => customer.request('cancel', credentials), { status: 404 });
});

test('PDF-Mailversand bleibt in der Demo eine Vorführung ohne Statusänderung', () => {
  const { customer, admin } = setup();
  const reserved = customer.request('reserve', booking);
  assert.deepEqual(admin.request('email-document', { id: reserved.id, recipient: 'someone-else@example.com' }), {
    ok: true, sent: false, recipient: booking.email, demo: true,
  });
  assert.equal(admin.request('admin').bookings.find(row => row.id === reserved.id).status, 'pending');
  assert.throws(() => admin.request('email-document', { id: 'DEMO-BLOCK-1' }), { status: 404 });
});
