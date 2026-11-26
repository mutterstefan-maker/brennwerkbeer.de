const names = { '1': '3-Seitenkipper 3,5 t', '2': 'Planenanhänger 2,7 t' };
const statuses = { pending: 'Reserviert - noch nicht bestätigt', confirmed: 'Bestätigte Buchung', cancelled: 'Storniert' };
const date = value => value.split('-').reverse().join('.');
const dateTime = value => new Date(value).toLocaleString('de-DE', {
  timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

export function printBookingDocument(booking) {
  document.getElementById('booking-print')?.remove();
  const sheet = document.createElement('section');
  sheet.id = 'booking-print';
  sheet.className = 'booking-print';
  const add = (parent, tag, text, className = '') => {
    const node = document.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    parent.append(node);
    return node;
  };
  const header = add(sheet, 'header', '', 'booking-print__header');
  const brand = add(header, 'div', '');
  add(brand, 'strong', 'BRENNWERK BEER');
  add(brand, 'p', 'Anhängerverleih & Brennholz');
  add(header, 'p', 'Michael Beer\nKepserstraße 81\n85356 Freising\n+49 171 2015568', 'booking-print__address');
  add(sheet, 'h1', 'Buchungsübersicht');
  add(sheet, 'p', `Erstellt am ${dateTime(new Date().toISOString())} Uhr`, 'booking-print__date');
  const details = (title, rows) => {
    add(sheet, 'h2', title);
    const list = add(sheet, 'dl', '');
    for (const [label, value] of rows) {
      const row = add(list, 'div', '');
      add(row, 'dt', label);
      add(row, 'dd', value || '-');
    }
  };
  const days = Math.round((Date.parse(booking.date_to) - Date.parse(booking.date_from)) / 86400000) + 1;
  details('Buchung', [
    ['Referenz', booking.id], ['Status', statuses[booking.status] || booking.status], ['Anhänger', names[booking.trailer]],
    ['Mietbeginn', date(booking.date_from)], ['Mietende', date(booking.date_to)],
    ['Mietdauer', `${days} ${days === 1 ? 'Tag' : 'Tage'} (beide Grenztage einschließlich)`],
    ['Eingegangen', `${dateTime(booking.created_at)} Uhr`],
  ]);
  details('Kundendaten', [['Name', booking.name], ['Telefon', booking.phone], ['E-Mail', booking.email]]);
  add(sheet, 'h2', 'Anmerkungen');
  add(sheet, 'p', booking.note || 'Keine Anmerkungen.', 'booking-print__note');
  add(sheet, 'p', booking.status === 'pending'
    ? 'Diese Übersicht dokumentiert deine Reservierung. Die Buchung wird nach Prüfung separat bestätigt.'
    : booking.status === 'cancelled' ? 'Diese Reservierung / Buchung wurde storniert.' : 'Deine Buchung ist bestätigt.', 'booking-print__date');
  add(sheet, 'footer', 'Michael Beer | Kepserstraße 81 | 85356 Freising');
  document.body.append(sheet);
  window.addEventListener('afterprint', () => sheet.remove(), { once: true });
  try { window.print(); } catch (error) { sheet.remove(); throw error; }
}
