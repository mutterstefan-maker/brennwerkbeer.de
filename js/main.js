// =============================================
// Michael Beer – main.js
// =============================================

import { createBookingDemo, DEMO_STORAGE_KEY, isBookingDemoLocation, mountDemoBanner } from './booking-demo.js?v=20261122-admin-demo';

document.addEventListener('DOMContentLoaded', () => {
  const bookingDemo = isBookingDemoLocation() ? createBookingDemo() : null;
  // ---- Burger menu ----
  const burger = document.getElementById('burger');
  const mobileMenu = document.getElementById('mobileMenu');
  function setMenu(open) {
    if (!open) finishMobileNavigation();
    mobileMenu.classList.toggle('open', open);
    mobileMenu.inert = !open;
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Menü schließen' : 'Menü öffnen');
  }
  burger.addEventListener('click', () => setMenu(!mobileMenu.classList.contains('open')));
  let mobileNavigationTimer;
  function finishMobileNavigation() {
    window.clearTimeout(mobileNavigationTimer);
    mobileMenu.querySelectorAll('.is-playing').forEach(link => link.classList.remove('is-playing'));
  }
  mobileMenu.querySelectorAll('a').forEach(link => link.addEventListener('click', event => {
    finishMobileNavigation();
    if (!link.classList.contains('menu-offer') || window.matchMedia('(prefers-reduced-motion: reduce)').matches || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) { setMenu(false); return; }
    event.preventDefault();
    link.classList.add('is-playing');
    mobileNavigationTimer = window.setTimeout(() => {
      setMenu(false);
      link.classList.remove('is-playing');
      window.location.hash = link.hash;
      const target = document.querySelector(link.hash);
      if (target) { target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true }); }
    }, 650);
  }));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && mobileMenu.classList.contains('open')) { setMenu(false); burger.focus(); }
  });
  const mobileWidth = window.matchMedia('(max-width: 960px)');
  mobileWidth.addEventListener('change', () => setMenu(false));

  // Aktuellen Abschnitt anhand seiner Position unter dem Kopfbereich markieren.
  const navLinks = [...document.querySelectorAll('.nav__links a, .nav__mobile a')];
  const sections = [...document.querySelectorAll('#anhaenger, #holz, #ablauf, #kontakt')];
  const nav = document.getElementById('nav');
  const logoIntro = document.querySelector('.logo-intro');
  const logoWatermark = document.querySelector('.logo-watermark');
  const logoMotion = window.matchMedia('(prefers-reduced-motion: no-preference)');
  let scrollQueued = false;
  function updateSection() {
    const navHeight = nav.getBoundingClientRect().height;
    const offset = navHeight + 64;
    if (logoIntro && logoWatermark && logoMotion.matches) {
      const introBottom = logoIntro.getBoundingClientRect().bottom;
      const distance = Math.max(0, navHeight - introBottom);
      const fade = Math.min(1, distance / 160);
      logoWatermark.style.setProperty('--logo-opacity', fade * 0.16);
      logoWatermark.style.setProperty('--logo-shift', `${24 - Math.min(84, distance * 0.035)}px`);
    }
    let active = '';
    sections.forEach(section => { if (section.getBoundingClientRect().top <= offset) active = section.id; });
    navLinks.forEach(link => {
      if (link.hash === '#' + active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
    scrollQueued = false;
  }
  window.addEventListener('scroll', () => {
    if (!scrollQueued) { scrollQueued = true; requestAnimationFrame(updateSection); }
  }, { passive: true });
  window.addEventListener('resize', updateSection);
  function updateLogoMotion() {
    document.body.classList.toggle('has-logo-watermark', Boolean(logoWatermark && logoMotion.matches));
    updateSection();
  }
  logoMotion.addEventListener('change', updateLogoMotion);
  updateLogoMotion();

  // ---- Buchungskalender ----
  const trailerSelect = document.getElementById('trailer-select');
  const dateFrom      = document.getElementById('date-from');
  const dateTo        = document.getElementById('date-to');
  const summary       = document.getElementById('bookingSummary');
  const summaryText   = document.getElementById('summaryText');
  const calGrid       = document.getElementById('calGrid');
  const calMonth      = document.getElementById('calMonth');
  const calHint       = document.getElementById('calHint');

  const toIso   = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const fromIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const fmt     = s => fromIso(s).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const now        = new Date();
  let todayIso   = toIso(now);
  let firstMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  let maxIso = toIso(new Date(now.getFullYear() + 2, now.getMonth(), now.getDate()));
  let view  = firstMonth;
  let start = null;
  let end   = null;
  let availabilityReady = false;
  let bookingEnabled = false;
  let bookingInProgress = false;
  let availabilityRequest = 0;
  let demoGeneration = null;
  let periods = [];
  const bookingSubmit = document.querySelector('#bookingForm button[type="submit"]');
  bookingSubmit.disabled = true;

  function updateBookingSubmit() {
    bookingSubmit.disabled = !availabilityReady || !bookingEnabled || bookingInProgress;
  }

  async function bookingRequest(action, body) {
    if (bookingDemo) return bookingDemo.request(action, body);
    const response = await fetch(`api/index.php?action=${action}`, {
      cache: 'no-store',
      ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error || 'Anfrage fehlgeschlagen.'), { status: response.status });
    return data;
  }

  async function loadAvailability() {
    const request = ++availabilityRequest;
    availabilityReady = false;
    updateBookingSubmit();
    calGrid.setAttribute('aria-busy', 'true');
    setHint('Verfügbarkeit wird geladen …');
    renderCalendar();
    try {
      const data = await bookingRequest('availability');
      if (request !== availabilityRequest) return false;
      if (!Array.isArray(data.periods)) throw new Error('Ungültige Verfügbarkeitsdaten.');
      if (bookingDemo && demoGeneration && demoGeneration !== data.demo_generation) {
        start = end = null; view = firstMonth;
        document.querySelectorAll('[data-booking-success]').forEach(success => success.remove());
        fillDemoCustomer();
      }
      demoGeneration = data.demo_generation;
      periods = data.periods;
      if (/^\d{4}-\d{2}-\d{2}$/.test(data.today)) {
        todayIso = data.today;
        const today = fromIso(todayIso);
        firstMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        if (view < firstMonth) view = firstMonth;
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(data.max_date)) maxIso = data.max_date;
      bookingEnabled = data.booking_enabled !== false;
      availabilityReady = true;
      updateBookingSubmit();
      document.querySelector('#bookingForm .form-note').textContent = bookingDemo
        ? 'Demo: Deine Testbuchung erscheint in der Demo-Verwaltung. Es entstehen keine echten Buchungen und es werden keine E-Mails versendet.'
        : !bookingEnabled
        ? 'Online-Reservierung momentan nicht verfügbar. Bitte telefonisch reservieren: +49 171 2015568.'
        : data.mode === 'automatic'
        ? 'Nach dem Absenden wird deine Buchung automatisch bestätigt. Du erhältst eine Reservierungs- und eine Buchungsbestätigung per E-Mail.'
        : 'Deine Tage werden sofort reserviert. Du erhältst eine E-Mail zur Reservierung und nach manueller Freigabe eine Buchungsbestätigung.';
      if (start && (start < todayIso || (end || start) > maxIso || !rangeIsFree(start, end || start, bookedDays()))) {
        start = end = null;
        setHint('Der gewählte Zeitraum ist nicht mehr verfügbar. Bitte neu wählen.', true);
      } else {
        setHint(start ? 'Zeitraum gewählt. Zum Ändern einen neuen Starttag anklicken.' : 'Ersten Miettag anklicken, dann den letzten.');
      }
      renderCalendar();
      updateSummary();
      return true;
    } catch (error) {
      if (request !== availabilityRequest) return false;
      availabilityReady = false;
      updateBookingSubmit();
      setHint('Online-Reservierung momentan nicht verfügbar. Bitte telefonisch melden: +49 171 2015568.', true);
      renderCalendar();
      return false;
    } finally {
      if (request === availabilityRequest) calGrid.setAttribute('aria-busy', 'false');
    }
  }

  function bookedDays() {
    const set = new Set();
    periods.filter(entry => entry.trailer === trailerSelect.value).forEach(entry => {
      const a = entry.date_from, b = entry.date_to;
      for (let d = fromIso(a); d <= fromIso(b); d.setDate(d.getDate() + 1)) set.add(toIso(d));
    });
    return set;
  }

  function rangeIsFree(a, b, booked) {
    for (let d = fromIso(a); d <= fromIso(b); d.setDate(d.getDate() + 1)) {
      if (booked.has(toIso(d))) return false;
    }
    return true;
  }

  function setHint(text, isError = false) {
    calHint.textContent = text;
    calHint.classList.toggle('is-error', isError);
  }

  function renderCalendar() {
    if (!calGrid) return;
    const booked = bookedDays();
    calMonth.textContent = view.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    document.querySelector('.calendar__nav[data-dir="-1"]').disabled = view <= firstMonth;
    document.querySelector('.calendar__nav[data-dir="1"]').disabled = toIso(new Date(view.getFullYear(), view.getMonth() + 1, 1)) > maxIso;

    calGrid.innerHTML = '';
    const offset = (view.getDay() + 6) % 7;
    for (let i = 0; i < offset; i++) calGrid.appendChild(document.createElement('span'));

    const last = end || start;
    const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    for (let n = 1; n <= daysInMonth; n++) {
      const iso = toIso(new Date(view.getFullYear(), view.getMonth(), n));
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'calendar__day';
      btn.textContent = n;
      btn.dataset.date = iso;
      btn.setAttribute('aria-label', fmt(iso));

      if (iso < todayIso || iso > maxIso || !availabilityReady || !trailerSelect.value) btn.disabled = true;
      if (booked.has(iso)) {
        btn.disabled = true;
        btn.classList.add('is-booked');
        btn.setAttribute('aria-label', `${fmt(iso)} – belegt`);
      }
      if (iso === todayIso) btn.classList.add('is-today');
      if (iso === start) btn.classList.add('is-start');
      if (iso === last) btn.classList.add('is-end');
      if (start && iso > start && iso < last) btn.classList.add('is-range');
      btn.setAttribute('aria-pressed', String(!!start && iso >= start && iso <= last));
      calGrid.appendChild(btn);
    }
  }

  function updateSummary() {
    const last = end || start;
    dateFrom.value = start || '';
    dateTo.value   = last || '';
    if (!trailerSelect.value || !start) { summary.style.display = 'none'; return; }
    const days  = Math.round((fromIso(last) - fromIso(start)) / 86400000) + 1;
    const name  = trailerSelect.options[trailerSelect.selectedIndex].text;
    const range = start === last ? fmt(start) : `${fmt(start)} – ${fmt(last)}`;
    summaryText.textContent = ` ${name} · ${days} Tag${days > 1 ? 'e' : ''} (${range})`;
    summary.style.display = 'block';
  }

  calGrid?.addEventListener('click', e => {
    const btn = e.target.closest('.calendar__day');
    if (!btn || btn.disabled) return;
    const iso = btn.dataset.date;

    if (!start || end || iso < start) {
      start = iso; end = null;
      setHint('Jetzt den letzten Miettag anklicken – oder denselben Tag für 1 Tag.');
    } else if (!rangeIsFree(start, iso, bookedDays())) {
      setHint('In diesem Zeitraum ist der Anhänger bereits belegt. Bitte anderen Zeitraum wählen.', true);
      return;
    } else {
      end = iso;
      setHint('Zeitraum gewählt. Zum Ändern einfach einen neuen Starttag anklicken.');
    }
    renderCalendar();
    updateSummary();
  });

  document.querySelectorAll('.calendar__nav').forEach(btn => btn.addEventListener('click', () => {
    view = new Date(view.getFullYear(), view.getMonth() + Number(btn.dataset.dir), 1);
    renderCalendar();
  }));

  trailerSelect?.addEventListener('change', () => {
    if (start && !rangeIsFree(start, end || start, bookedDays())) {
      start = end = null;
      setHint('Der gewählte Zeitraum ist für diesen Anhänger belegt. Bitte neu wählen.', true);
    }
    renderCalendar();
    updateSummary();
  });

  renderCalendar();

  // ---- Anhänger-Galerie ----
  document.querySelectorAll('.trailer-card__thumb').forEach(thumb => thumb.addEventListener('click', () => {
    const card  = thumb.closest('.trailer-card');
    const photo = card.querySelector('.trailer-card__photo');
    photo.src = thumb.dataset.src;
    photo.alt = thumb.dataset.alt;
    card.querySelectorAll('.trailer-card__thumb').forEach(t => t.classList.toggle('is-active', t === thumb));
  }));

  // ---- Buchungs- und Bestellfenster ----
  const bookingDialog = document.getElementById('bookingDialog');
  const woodDialog    = document.getElementById('woodDialog');
  const bookingTitle  = document.getElementById('bookingTitle');
  const calTrailer    = document.getElementById('calTrailer');

  document.querySelectorAll('dialog.modal').forEach(dialog => {
    dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
    // Klick auf den abgedunkelten Hintergrund schließt das Fenster
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  });

  function updateTrailerName() {
    const opt  = trailerSelect.options[trailerSelect.selectedIndex];
    const name = trailerSelect.value ? opt.text : 'Anhänger';
    bookingTitle.textContent = `${name} buchen`;
    calTrailer.textContent   = trailerSelect.value ? opt.text : 'den gewählten Anhänger';
  }
  trailerSelect.addEventListener('change', updateTrailerName);

  document.querySelectorAll('[data-book]').forEach(btn => btn.addEventListener('click', () => {
    trailerSelect.value = btn.dataset.book;
    trailerSelect.dispatchEvent(new Event('change'));
    bookingDialog.showModal();
    loadAvailability();
  }));

  // ---- Brennholz: Längen & Preisberechnung ----
  const WOOD = {
    weich: { lengths: ['1 m', '50 cm', '33 cm', '25 cm'], price: { srm: 65, ster: 85 } },
    hart:  { lengths: ['33 cm', '25 cm'],                 price: { srm: 100, ster: 140 } }
  };
  const MAX_SRM      = 8;
  const woodType     = document.getElementById('wood-type');
  const woodLength   = document.getElementById('wood-length');
  const woodUnit     = document.getElementById('wood-unit');
  const woodAmount   = document.getElementById('wood-amount');
  const woodEstimate = document.getElementById('woodEstimate');

  function updateWoodLengths() {
    const wood = WOOD[woodType.value];
    woodLength.innerHTML = wood
      ? wood.lengths.map(l => `<option value="${l}">${l}</option>`).join('')
      : '<option value="">– erst Holzsorte wählen –</option>';
    woodLength.disabled = !wood;
  }

  function updateWoodEstimate() {
    const isSrm = woodUnit.value === 'srm';
    woodAmount.max = isSrm ? MAX_SRM : '';
    const wood = WOOD[woodType.value];
    const qty  = Number(woodAmount.value);
    if (!wood || !(qty > 0)) {
      woodEstimate.textContent = 'Holzsorte und Menge wählen, um den Preis zu sehen.';
      return;
    }
    const unit = isSrm ? 'SRM' : 'Ster';
    const sum  = (qty * wood.price[woodUnit.value]).toLocaleString('de-DE');
    woodEstimate.innerHTML = `Holzpreis: <strong>${sum} €</strong> (${qty.toLocaleString('de-DE')} ${unit}) zzgl. Lieferkosten`;
  }

  woodType?.addEventListener('change', () => { updateWoodLengths(); updateWoodEstimate(); });
  [woodUnit, woodAmount].forEach(el => el?.addEventListener('input', updateWoodEstimate));

  document.querySelectorAll('[data-order]').forEach(btn => btn.addEventListener('click', () => {
    woodType.value = btn.dataset.order;
    woodType.dispatchEvent(new Event('change'));
    woodDialog.showModal();
  }));

  // ---- Form submissions (mailto fallback – später durch Backend ersetzen) ----
  function handleForm(formId, successMsg, validate) {
    const form = document.getElementById(formId);
    if (!form) return;
    form.addEventListener('submit', e => {
      e.preventDefault();
      if (validate && !validate()) return;
      // TODO: Backend-Anfrage einbauen (z.B. fetch POST an /api/booking)
      const data = Object.fromEntries(new FormData(form));
      console.log(`[${formId}] Formular-Daten:`, data);

      // Einfache Success-Anzeige
      form.style.display = 'none';
      const div = document.createElement('div');
      div.className = 'form-success';
      div.style.display = 'block';
      div.innerHTML = `
        <div class="success-icon"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg></div>
        <h4>${successMsg}</h4>
        <p>Du bekommst so schnell wie möglich eine Rückmeldung.</p>
      `;
      form.parentNode.appendChild(div);
    });
  }

  document.getElementById('bookingForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (bookingInProgress) return;
    if (!dateFrom.value || !availabilityReady) {
      setHint('Bitte einen verfügbaren Zeitraum auswählen.', true);
      return;
    }
    if (!bookingEnabled) {
      setHint('Bitte telefonisch reservieren: +49 171 2015568.', true);
      return;
    }
    bookingInProgress = true;
    updateBookingSubmit();
    try {
      const data = await bookingRequest('reserve', Object.fromEntries(new FormData(e.target)));
      const success = document.createElement('div');
      success.className = 'form-success';
      success.dataset.bookingSuccess = 'true';
      success.style.display = 'block';
      success.setAttribute('role', 'status');
      success.textContent = bookingDemo
        ? `${data.status === 'confirmed' ? 'Demo-Buchung bestätigt.' : 'Demo-Reservierung eingegangen.'} Referenz: ${data.id}. Die gewählten Tage sind jetzt im Demo-Kalender belegt.`
        : data.status === 'confirmed'
        ? `Deine Buchung ist bestätigt. Referenz: ${data.id}. Reservierungs- und Buchungsbestätigung werden per E-Mail verschickt.`
        : `Deine Tage sind reserviert. Referenz: ${data.id}. Du erhältst eine E-Mail zur Reservierung und nach Prüfung eine Buchungsbestätigung.`;
      e.target.parentNode.append(success);
      if (bookingDemo) {
        const adminLink = document.createElement('a');
        adminLink.className = 'btn btn--primary';
        adminLink.href = `admin.html?demo=kalender&booking=${encodeURIComponent(data.id)}#bookings`;
        adminLink.target = '_blank'; adminLink.rel = 'noopener';
        adminLink.textContent = 'In der Demo-Verwaltung ansehen';
        success.append(document.createElement('br'), adminLink);
        success.scrollIntoView({ block: 'nearest', behavior: 'instant' });
      }
      const selectedTrailer = trailerSelect.value;
      e.target.reset();
      trailerSelect.value = selectedTrailer;
      start = end = null;
      updateTrailerName();
      updateSummary();
      if (bookingDemo) fillDemoCustomer();
      await loadAvailability();
      setTimeout(() => success.remove(), 30000);
    } catch (error) {
      if (error.status === 409) { start = end = null; updateSummary(); await loadAvailability(); }
      setHint(error.message || 'Reservierung fehlgeschlagen. Bitte telefonisch melden.', true);
    } finally { bookingInProgress = false; updateBookingSubmit(); }
  });
  handleForm('woodForm',    'Holzbestellung eingegangen!');
  handleForm('contactForm', 'Nachricht gesendet!');

  function fillDemoCustomer() {
    document.getElementById('book-name').value = 'Max Mustermann';
    document.getElementById('book-phone').value = '01234 567890';
    document.getElementById('book-email').value = 'demo@example.com';
    document.getElementById('book-note').value = 'Testbuchung für die Vorführung';
  }

  if (bookingDemo) {
    document.title = 'Kalender-Demo – Brennwerk Beer';
    bookingSubmit.textContent = 'Demo-Buchung testen';
    bookingDialog.querySelector('.modal__eyebrow').textContent = 'Kalender-Demo';
    document.querySelector('.footer__links a[href="admin.html"]').href = 'admin.html?demo=kalender';
    const note = document.createElement('p');
    note.className = 'booking-demo-note';
    note.textContent = 'Vorführung: Bitte nur Testdaten verwenden. Die Testbuchung kannst du anschließend im Demo-Adminbereich bestätigen oder stornieren.';
    bookingDialog.querySelector('.modal__body').prepend(note);
    fillDemoCustomer();
    mountDemoBanner({
      onOpen: () => document.querySelector('[data-book="1"]').click(),
      onReset: () => {
        bookingDemo.reset();
        start = end = null; view = firstMonth;
        document.querySelectorAll('[data-booking-success]').forEach(success => success.remove());
        updateSummary(); fillDemoCustomer();
        if (bookingDialog.open) loadAvailability();
      },
    });
    const refreshDemo = () => { if (bookingDialog.open && !bookingInProgress) loadAvailability(); };
    window.addEventListener('storage', event => { if (event.key === DEMO_STORAGE_KEY) refreshDemo(); });
    window.addEventListener('focus', refreshDemo);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshDemo(); });
    if (new URLSearchParams(location.search).get('demo') === 'kalender') document.querySelector('[data-book="1"]').click();
  }

  // ---- Smooth anchor scrolling with nav offset ----
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      const target = document.querySelector(a.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    });
  });
});
