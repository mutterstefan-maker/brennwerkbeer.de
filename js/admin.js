'use strict';
import { printBookingDocument } from './booking-document.js?v=20261127-admin-cms';

(() => {
  const $ = id => document.getElementById(id);
  const element = (tag, value = '', className = '') => { const node = document.createElement(tag); node.textContent = value; if (className) node.className = className; return node; };
  const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const fmt = value => value.split('-').reverse().join('.');
  const labels = { pending: 'Reserviert', confirmed: 'Gebucht', blocked: 'Blockiert', cancelled: 'Storniert / aufgehoben' };
  let csrf = '', bookings = [], trailers = [], users = [], currentUser = null, content = {}, editingImages = [];
  let month = new Date(); month = new Date(month.getFullYear(), month.getMonth(), 1);
  const message = (value, error = false) => { $('message').textContent = value; $('message').classList.toggle('is-error', error); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  async function api(action, body) {
    if (location.protocol === 'file:') throw new Error('Der Adminbereich benötigt den Webserver.');
    const options = { credentials: 'same-origin', cache: 'no-store' };
    if (body !== undefined) {
      options.method = 'POST'; options.headers = { 'X-CSRF-Token': csrf };
      if (body instanceof FormData) options.body = body;
      else { options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(body); }
    }
    let response;
    try { response = await fetch(`api/index.php?action=${encodeURIComponent(action)}`, options); }
    catch { throw new Error('Der Verwaltungsserver ist nicht erreichbar.'); }
    const raw = await response.text(); let data;
    try { data = JSON.parse(raw); } catch { throw new Error(`Der Server liefert keine gültige Antwort (HTTP ${response.status}).`); }
    if (!response.ok) {
      if (response.status === 401) { $('workspace').hidden = true; $('login').hidden = false; $('logout').hidden = true; }
      throw new Error(data.error || 'Anfrage fehlgeschlagen.');
    }
    return data;
  }

  function populateTrailerSelects() {
    const calendarValue = $('calendar-trailer').value; $('calendar-trailer').replaceChildren();
    trailers.forEach(item => $('calendar-trailer').append(new Option(`${item.name}${item.active ? '' : ' (ausgeblendet)'}`, item.id)));
    if ([...$('calendar-trailer').options].some(option => option.value === calendarValue)) $('calendar-trailer').value = calendarValue;
    const blockValue = $('trailer').value; $('trailer').replaceChildren();
    trailers.filter(item => item.active).forEach(item => $('trailer').append(new Option(item.name, item.id)));
    if ([...$('trailer').options].some(option => option.value === blockValue)) $('trailer').value = blockValue;
  }

  function renderCalendar() {
    $('month').textContent = month.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    $('calendar').replaceChildren();
    ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].forEach(day => $('calendar').append(element('strong', day)));
    for (let index = 0; index < (month.getDay() + 6) % 7; index++) $('calendar').append(element('span'));
    for (let day = 1; day <= new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate(); day++) {
      const date = iso(new Date(month.getFullYear(), month.getMonth(), day));
      const booking = bookings.find(item => item.trailer === $('calendar-trailer').value && item.status !== 'cancelled' && item.date_from <= date && item.date_to >= date);
      const cell = element('div', String(day), `admin-day ${booking?.status || ''}`);
      if (booking) cell.append(element('small', labels[booking.status]));
      $('calendar').append(cell);
    }
  }

  function renderBookings() {
    $('bookings').replaceChildren();
    const filter = $('filter').value;
    const rows = bookings.filter(item => filter === 'active' ? item.status !== 'cancelled' : item.status === filter);
    if (!rows.length) $('bookings').append(element('p', 'Keine Einträge vorhanden.'));
    for (const booking of rows) {
      const card = element('article', '', 'admin-booking'); card.dataset.bookingId = booking.id;
      card.append(element('strong', `${booking.trailer_name || booking.trailer} · ${fmt(booking.date_from)} – ${fmt(booking.date_to)}`), element('span', labels[booking.status], `badge ${booking.status}`), element('p', `${booking.name}${booking.email ? ` · ${booking.email}` : ''}${booking.phone ? ` · ${booking.phone}` : ''}`));
      if (booking.note) card.append(element('p', booking.note));
      card.append(element('small', `Referenz: ${booking.id}`));
      const actions = element('div', '', 'actions');
      const statusAction = (label, status) => {
        const button = element('button', label, 'btn'); button.type = 'button';
        button.onclick = async () => {
          if (status === 'cancelled' && !confirm('Diesen Eintrag aufheben und die Tage wieder freigeben?')) return;
          button.disabled = true;
          try { await api('status', { id: booking.id, status }); await refresh(); message('Änderung gespeichert.'); }
          catch (error) { message(error.message, true); } finally { button.disabled = false; }
        };
        actions.append(button);
      };
      if (booking.status === 'pending') statusAction('Buchung bestätigen', 'confirmed');
      if (booking.status !== 'cancelled') statusAction(booking.status === 'blocked' ? 'Blockierung aufheben' : booking.status === 'pending' ? 'Reservierung ablehnen' : 'Buchung stornieren', 'cancelled');
      card.append(actions);
      if (booking.email) {
        const documents = element('div', '', 'actions admin-booking__documents');
        const pdf = element('a', 'PDF herunterladen', 'btn'); pdf.href = `api/index.php?action=document&id=${encodeURIComponent(booking.id)}`;
        const print = element('button', 'Drucken', 'btn'); print.type = 'button'; print.onclick = () => printBookingDocument(booking);
        const email = element('button', 'PDF per E-Mail senden', 'btn'); email.type = 'button';
        email.onclick = async () => {
          if (!confirm(`Buchungsübersicht als PDF an ${booking.email} senden?`)) return;
          email.disabled = true;
          try { const data = await api('email-document', { id: booking.id }); await refresh(); message(data.sent ? `PDF an ${data.recipient} zum Versand übergeben.` : `PDF für ${data.recipient} vorgemerkt.`); }
          catch (error) { message(error.message, true); } finally { email.disabled = false; }
        };
        documents.append(pdf, print, email); card.append(documents);
      }
      $('bookings').append(card);
    }
  }

  function renderUsers() {
    $('users').replaceChildren();
    users.forEach(user => {
      const row = element('article', '', 'admin-user');
      const info = element('div'); info.append(element('strong', user.username), element('small', user.id === currentUser?.id ? 'Aktuell angemeldet' : `Angelegt: ${new Date(user.created_at).toLocaleDateString('de-DE')}`));
      const actions = element('div', '', 'actions');
      const edit = element('button', 'Bearbeiten / Passwort ändern', 'btn'); edit.type = 'button'; edit.onclick = () => { $('user-id').value = user.id; $('user-name').value = user.username; $('user-password').value = ''; $('user-password').required = false; $('user-cancel').hidden = false; $('user-name').focus(); };
      actions.append(edit);
      if (user.id !== currentUser?.id) { const remove = element('button', 'Löschen', 'btn btn--danger'); remove.type = 'button'; remove.onclick = async () => { if (!confirm(`Benutzer „${user.username}“ wirklich löschen?`)) return; try { await api('user-delete', { id: user.id }); await refresh(); message('Benutzer gelöscht.'); } catch (error) { message(error.message, true); } }; actions.append(remove); }
      row.append(info, actions); $('users').append(row);
    });
  }

  function fillSiteForm() {
    for (const [key, value] of Object.entries(content)) {
      const control = $('site-form').elements.namedItem(key); if (control) control.value = value;
    }
  }

  function renderTrailerList() {
    $('trailer-list').replaceChildren();
    trailers.forEach(trailer => {
      const row = element('article', '', 'admin-trailer-row');
      const image = document.createElement('img'); image.src = trailer.images[0]; image.alt = '';
      const info = element('div'); info.append(element('strong', trailer.name), element('span', `${trailer.price} € / Tag · ${trailer.active ? 'sichtbar' : 'ausgeblendet'}`));
      const edit = element('button', 'Bearbeiten', 'btn'); edit.type = 'button'; edit.onclick = () => openTrailerEditor(trailer);
      row.append(image, info, edit); $('trailer-list').append(row);
    });
  }

  function specRow(spec = { label: '', value: '' }) {
    const row = element('div', '', 'admin-spec-row');
    const label = document.createElement('input'); label.placeholder = 'Bezeichnung'; label.value = spec.label || '';
    const value = document.createElement('input'); value.placeholder = 'Wert'; value.value = spec.value || '';
    const remove = element('button', 'Entfernen', 'btn btn--danger'); remove.type = 'button'; remove.onclick = () => row.remove();
    row.append(label, value, remove); $('trailer-specs').append(row);
  }

  function renderImages() {
    $('trailer-images').replaceChildren();
    editingImages.forEach((url, index) => {
      const card = element('div', '', 'admin-image'); const image = document.createElement('img'); image.src = url; image.alt = `Foto ${index + 1}`;
      const actions = element('div', '', 'actions');
      const move = (label, direction) => { const button = element('button', label, 'btn'); button.type = 'button'; button.disabled = index + direction < 0 || index + direction >= editingImages.length; button.onclick = () => { const target = index + direction; [editingImages[index], editingImages[target]] = [editingImages[target], editingImages[index]]; renderImages(); }; return button; };
      const remove = element('button', 'Entfernen', 'btn btn--danger'); remove.type = 'button'; remove.onclick = () => { editingImages.splice(index, 1); renderImages(); };
      actions.append(move('←', -1), move('→', 1), remove); card.append(image, actions); $('trailer-images').append(card);
    });
  }

  function openTrailerEditor(trailer = null) {
    $('trailer-form').hidden = false; $('trailer-id').value = trailer?.id || ''; $('trailer-name').value = trailer?.name || ''; $('trailer-price').value = trailer?.price || ''; $('trailer-order').value = trailer?.sort_order ?? trailers.length; $('trailer-description').value = trailer?.description || ''; $('trailer-active').checked = trailer?.active ?? true; $('trailer-editor-title').textContent = trailer ? `„${trailer.name}“ bearbeiten` : 'Neuen Anhänger anlegen'; $('trailer-delete').hidden = !trailer;
    $('trailer-specs').replaceChildren(); (trailer?.specs?.length ? trailer.specs : [{ label: '', value: '' }]).forEach(specRow);
    editingImages = [...(trailer?.images || [])]; renderImages(); $('trailer-form').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  function closeTrailerEditor() { $('trailer-form').hidden = true; editingImages = []; $('trailer-upload').value = ''; }

  function renderAll() { populateTrailerSelects(); renderCalendar(); renderBookings(); renderUsers(); fillSiteForm(); renderTrailerList(); }

  async function refresh() {
    const data = await api('admin'); csrf = data.csrf; bookings = data.bookings; trailers = data.trailers; users = data.users; currentUser = data.current_user; content = data.content; window.brennwerkSite = { content, trailers }; $('mode').value = data.mode;
    $('workspace').hidden = false; $('login').hidden = true; $('logout').hidden = false;
    $('mail-status').textContent = data.unsent ? `${data.unsent} E-Mail(s) warten auf Versand.` : 'Alle E-Mails wurden vom Mailserver angenommen.'; $('retry-mail').hidden = !data.unsent; renderAll();
  }

  function bindForm(id, action, build, success) {
    $(id).addEventListener('submit', async event => { event.preventDefault(); const button = event.submitter; button.disabled = true; try { const data = await api(action, build()); if (data.csrf) csrf = data.csrf; await refresh(); message(success); } catch (error) { message(error.message, true); } finally { button.disabled = false; } });
  }

  document.querySelectorAll('[data-admin-tab]').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('[data-admin-tab]').forEach(tab => tab.classList.toggle('is-active', tab === button)); document.querySelectorAll('[data-admin-panel]').forEach(panel => { panel.hidden = panel.dataset.adminPanel !== button.dataset.adminTab; }); history.replaceState(null, '', `#${button.dataset.adminTab}`); }));
  const initialTab = document.querySelector(`[data-admin-tab="${location.hash.slice(1)}"]`); if (initialTab) initialTab.click();
  document.querySelectorAll('[data-settings-tab]').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('[data-settings-tab]').forEach(tab => tab.classList.toggle('is-active', tab === button));
    document.querySelectorAll('[data-settings-panel]').forEach(panel => { panel.hidden = panel.dataset.settingsPanel !== button.dataset.settingsTab; });
  }));
  document.querySelectorAll('[data-content-tab]').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('[data-content-tab]').forEach(tab => tab.classList.toggle('is-active', tab === button));
    document.querySelectorAll('[data-content-panel]').forEach(panel => { panel.hidden = panel.dataset.contentPanel !== button.dataset.contentTab; });
  }));

  bindForm('login', 'login', () => ({ username: $('username').value, password: $('password').value }), 'Angemeldet.');
  bindForm('settings', 'settings', () => ({ mode: $('mode').value }), 'Einstellung gespeichert.');
  bindForm('block', 'block', () => Object.fromEntries(new FormData($('block'))), 'Zeitraum blockiert.');
  $('site-form').addEventListener('submit', async event => { event.preventDefault(); const button = event.submitter; button.disabled = true; try { await api('site-settings', Object.fromEntries(new FormData(event.currentTarget))); await refresh(); message('Website-Inhalte gespeichert.'); } catch (error) { message(error.message, true); } finally { button.disabled = false; } });
  $('user-form').addEventListener('submit', async event => { event.preventDefault(); const button = event.submitter; button.disabled = true; try { await api('user-save', { id: Number($('user-id').value) || 0, username: $('user-name').value, password: $('user-password').value }); $('user-form').reset(); $('user-id').value = ''; $('user-password').required = true; $('user-cancel').hidden = true; await refresh(); message('Benutzer gespeichert.'); } catch (error) { message(error.message, true); } finally { button.disabled = false; } });
  $('user-cancel').onclick = () => { $('user-form').reset(); $('user-id').value = ''; $('user-password').required = true; $('user-cancel').hidden = true; };

  $('trailer-form').addEventListener('submit', async event => { event.preventDefault(); const specs = [...$('trailer-specs').children].map(row => ({ label: row.children[0].value, value: row.children[1].value })); const button = event.submitter; button.disabled = true; try { await api('trailer-save', { id: $('trailer-id').value, name: $('trailer-name').value, price: $('trailer-price').value, sort_order: $('trailer-order').value, description: $('trailer-description').value, active: $('trailer-active').checked, specs, images: editingImages }); closeTrailerEditor(); await refresh(); message('Anhänger gespeichert.'); } catch (error) { message(error.message, true); } finally { button.disabled = false; } });
  $('trailer-upload').addEventListener('change', async event => { const file = event.target.files[0]; if (!file) return; const data = new FormData(); data.append('image', file); event.target.disabled = true; try { const result = await api('upload-image', data); editingImages.push(result.url); renderImages(); message('Foto hochgeladen. Anhänger noch speichern.'); } catch (error) { message(error.message, true); } finally { event.target.disabled = false; event.target.value = ''; } });
  $('trailer-delete').onclick = async () => { const id = $('trailer-id').value; if (!id || !confirm('Diesen Anhänger wirklich löschen?')) return; try { await api('trailer-delete', { id }); closeTrailerEditor(); await refresh(); message('Anhänger gelöscht.'); } catch (error) { message(error.message, true); } };
  $('trailer-new').onclick = () => openTrailerEditor(); $('trailer-cancel').onclick = closeTrailerEditor; $('spec-add').onclick = () => specRow();

  const today = iso(new Date()); $('from').min = $('to').min = today; $('from').onchange = () => { $('to').min = $('from').value; if ($('to').value < $('from').value) $('to').value = $('from').value; };
  $('filter').onchange = renderBookings; $('calendar-trailer').onchange = renderCalendar; $('prev').onclick = () => { month = new Date(month.getFullYear(), month.getMonth() - 1, 1); renderCalendar(); }; $('next').onclick = () => { month = new Date(month.getFullYear(), month.getMonth() + 1, 1); renderCalendar(); };
  $('refresh').onclick = () => refresh().catch(error => message(error.message, true)); $('retry-mail').onclick = async () => { $('retry-mail').disabled = true; try { await api('retry-mail', {}); await refresh(); message('E-Mail-Versand erneut angestoßen.'); } catch (error) { message(error.message, true); } finally { $('retry-mail').disabled = false; } }; $('logout').onclick = async () => { try { await api('logout', {}); location.reload(); } catch (error) { message(error.message, true); } };

  const themeKey = 'brennwerk.admin-theme.v1';
  function applyTheme(theme) { document.documentElement.dataset.adminTheme = theme; $('theme-toggle').textContent = theme === 'dark' ? 'Tagmodus' : 'Nachtmodus'; }
  let theme; try { theme = localStorage.getItem(themeKey); } catch { theme = null; }
  theme ||= matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; applyTheme(theme);
  $('theme-toggle').onclick = () => { theme = theme === 'dark' ? 'light' : 'dark'; try { localStorage.setItem(themeKey, theme); } catch { /* Theme remains active for this page. */ } applyTheme(theme); };

  $('user-password').required = true;
  refresh().catch(error => { if (error.message !== 'Bitte anmelden.') message(error.message, true); });
})();

