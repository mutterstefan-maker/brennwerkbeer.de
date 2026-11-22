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
