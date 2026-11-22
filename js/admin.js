'use strict';
import { createBookingDemo, DEMO_STORAGE_KEY, isBookingDemoLocation, mountDemoBanner } from './booking-demo.js?v=20261122-admin-demo';

(() => {
  const bookingDemo = isBookingDemoLocation() ? createBookingDemo() : null;
  const $ = id => document.getElementById(id);
  let csrf = '', bookings = [], month = new Date();
  month = new Date(month.getFullYear(), month.getMonth(), 1);
  const names = { '1': '3-Seitenkipper 3,5 t', '2': 'Planenanhänger 2,7 t' };
  const labels = { pending: 'Reserviert', confirmed: 'Gebucht', blocked: 'Blockiert', cancelled: 'Storniert / aufgehoben' };
  const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const fmt = value => value.split('-').reverse().join('.');
  const message = text => { $('message').textContent = text; };
  async function api(action, body) {
    if (bookingDemo) return bookingDemo.request(action, body);
    if (location.protocol === 'file:') throw new Error('Der Adminbereich benötigt einen PHP-Webserver. Bitte über die Website auf IONOS oder lokal mit „php -S localhost:8080“ öffnen.');
    let response;
    try {
      response = await fetch(`api/index.php?action=${action}`, { credentials: 'same-origin', cache: 'no-store', ...(body ? { method:'POST', headers:{'Content-Type':'application/json','X-CSRF-Token':csrf}, body:JSON.stringify(body) } : {}) });
    } catch (error) {
      throw new Error('Der Buchungsserver ist nicht erreichbar. Bitte Verbindung und Website-Adresse prüfen.');
    }
    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); } catch (error) {
      if (raw.trimStart().startsWith('<?php')) throw new Error('Der Server führt PHP nicht aus. Bitte die Website auf einem PHP-fähigen Server öffnen. VS-Code-Live-Server und GitHub Pages unterstützen das Backend nicht.');
      if (response.status === 404) throw new Error('Die Buchungs-API fehlt (HTTP 404). Bitte den Ordner „api“ zusammen mit der Website hochladen und den Pfad api/index.php prüfen.');
      if (response.status === 403) throw new Error('Der Server sperrt den Zugriff auf die Buchungs-API (HTTP 403). Bitte Zugriffsregeln für api/index.php prüfen.');
      if (response.status >= 500) throw new Error(`PHP-Serverfehler (HTTP ${response.status}). Bitte PHP 8.1 oder neuer aktivieren und das PHP-Fehlerprotokoll prüfen.`);
      throw new Error(`Unter api/index.php liefert der Server keine JSON-Antwort (HTTP ${response.status}). Bitte prüfen, ob die Adresse auf einen PHP-Webserver zeigt und der Ordner „api“ vorhanden ist.`);
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Die Buchungs-API liefert ein unerwartetes Datenformat. Bitte die hochgeladenen Dateien prüfen.');
    if (!response.ok) { if (response.status === 401) { $('workspace').hidden = true; $('login').hidden = false; $('logout').hidden = true; } throw new Error(data.error || 'Anfrage fehlgeschlagen.'); }
    return data;
  }
  function element(tag, text, className) { const el = document.createElement(tag); el.textContent = text; if(className) el.className = className; return el; }
  function render() {
    $('bookings').replaceChildren();
    const filter = $('filter').value;
    const rows = bookings.filter(b => filter === 'active' ? b.status !== 'cancelled' : b.status === filter);
    if (!rows.length) $('bookings').append(element('p','Keine Einträge vorhanden.'));
    for (const b of rows) {
      const card = element('article','','admin-booking');
      card.dataset.bookingId = b.id;
      card.append(element('strong',`${names[b.trailer]} · ${fmt(b.date_from)} – ${fmt(b.date_to)}`),element('span',labels[b.status],`badge ${b.status}`),element('p',`${b.name}${b.email ? ' · '+b.email : ''}${b.phone ? ' · '+b.phone : ''}`));
      if(b.note) card.append(element('p',b.note));
      card.append(element('small',`Referenz: ${b.id}`));
      const actions = element('div','','actions');
      const addAction = (text,status) => { const button = element('button',text,'btn'); button.type='button'; button.onclick=async()=>{ if(status==='cancelled' && !confirm('Diesen Eintrag aufheben und die Tage wieder freigeben?')) return; button.disabled=true; try{await api('status',{id:b.id,status});await refresh();message('Änderung gespeichert.');}catch(e){message(e.message);}finally{button.disabled=false;} }; actions.append(button); };
      if(b.status==='pending') addAction('Buchung bestätigen','confirmed');
      if(b.status!=='cancelled') addAction(b.status==='blocked'?'Blockierung aufheben':b.status==='pending'?'Reservierung ablehnen':'Buchung stornieren','cancelled');
      card.append(actions);$('bookings').append(card);
    }
    $('month').textContent=month.toLocaleDateString('de-DE',{month:'long',year:'numeric'});
    $('calendar').replaceChildren();
    ['Mo','Di','Mi','Do','Fr','Sa','So'].forEach(day=>$('calendar').append(element('strong',day)));
    for(let i=0;i<(month.getDay()+6)%7;i++) $('calendar').append(element('span',''));
    for(let d=1;d<=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();d++) {
      const date=iso(new Date(month.getFullYear(),month.getMonth(),d));
      const b=bookings.find(b=>b.trailer===$('calendar-trailer').value&&b.status!=='cancelled'&&b.date_from<=date&&b.date_to>=date);
      const cell=element('div',String(d),`admin-day ${b?.status||''}`); if(b)cell.append(element('small',labels[b.status]));$('calendar').append(cell);
    }
  }
  async function refresh() {
    const data=await api('admin');csrf=data.csrf;bookings=data.bookings;$('mode').value=data.mode;
    $('workspace').hidden=false;$('login').hidden=true;$('logout').hidden=Boolean(bookingDemo);
    $('mail-status').textContent=bookingDemo ? 'Demo: Reservierungen, Bestätigungen und Stornierungen werden hier vorgeführt. Es werden keine E-Mails versendet.' : data.unsent?`${data.unsent} E-Mail(s) warten auf Versand. Bitte Server-Mailkonfiguration prüfen und Versand erneut versuchen.`:'Alle E-Mails wurden vom Mailserver angenommen. Die Zustellung im Empfängerpostfach bitte bei Einrichtung testen.';
    $('retry-mail').hidden=!data.unsent;render();
  }
  function form(id,action,body,success){$(id).addEventListener('submit',async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;try{const data=await api(action,body());if(data.csrf)csrf=data.csrf;await refresh();message(success);}catch(error){message(error.message);}finally{button.disabled=false;}});}
  form('login','login',()=>({username:$('username').value,password:$('password').value}),'Angemeldet.');
  form('settings','settings',()=>({mode:$('mode').value}),'Einstellung gespeichert. Sie gilt für neue Reservierungen.');
  form('block','block',()=>Object.fromEntries(new FormData($('block'))),'Zeitraum blockiert.');
  $('from').min=$('to').min=iso(new Date());
  $('from').onchange=()=>{$('to').min=$('from').value;if($('to').value<$('from').value)$('to').value=$('from').value;};
  $('filter').onchange=$('calendar-trailer').onchange=render;
  $('prev').onclick=()=>{month=new Date(month.getFullYear(),month.getMonth()-1,1);render();};
  $('next').onclick=()=>{month=new Date(month.getFullYear(),month.getMonth()+1,1);render();};
  $('refresh').onclick=()=>refresh().catch(e=>message(e.message));
  $('retry-mail').onclick=async()=>{ $('retry-mail').disabled=true;try{await api('retry-mail',{});await refresh();}catch(e){message(e.message);}finally{$('retry-mail').disabled=false;} };
  $('logout').onclick=async()=>{try{await api('logout',{});location.reload();}catch(e){message(e.message);}};
  if (bookingDemo) {
    document.title = 'Demo-Verwaltung – Brennwerk Beer';
    document.querySelector('h1').textContent = 'Buchungsverwaltung · Demo';
    document.querySelector('.admin-head a').href = 'index.html?demo=kalender';
    document.querySelector('#settings p').textContent = 'Manuell: Die Testbuchung erscheint als reserviert und kann hier bestätigt werden. Automatisch: Neue Testbuchungen erscheinen sofort als bestätigt. Der Modus gilt nur für neue Testbuchungen.';
    mountDemoBanner({ admin: true, onReset: async () => {
      bookingDemo.reset(); await refresh(); message('Demo zurückgesetzt. Du kannst den Ablauf erneut vorführen.');
    }});
    window.addEventListener('storage', event => {
      if (event.key !== DEMO_STORAGE_KEY) return;
      const previousIds = new Set(bookings.map(booking => booking.id));
      refresh().then(() => message(bookings.some(booking => !previousIds.has(booking.id))
        ? 'Neue Testbuchung eingegangen.' : 'Demo-Verwaltung aktualisiert.')).catch(error => message(error.message));
    });
    window.addEventListener('focus', () => refresh().catch(error => message(error.message)));
  }
  refresh().then(() => {
    if (!bookingDemo) return;
    const selected = new URLSearchParams(location.search).get('booking');
    const card = [...document.querySelectorAll('[data-booking-id]')].find(card => card.dataset.bookingId === selected);
    if (card) { card.classList.add('admin-booking--highlight'); card.scrollIntoView({ block: 'center', behavior: 'instant' }); }
  }).catch(e=>{if(e.message!=='Bitte anmelden.')message(e.message);});
})();
