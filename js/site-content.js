const text = (selector, value) => {
  const node = document.querySelector(selector);
  if (node && typeof value === 'string') node.textContent = value;
};

const phoneHref = value => `tel:${String(value || '').replace(/[^+\d]/g, '')}`;
const whatsappHref = value => `https://wa.me/${String(value || '').replace(/\D/g, '')}?text=${encodeURIComponent('Hallo Michael, ich habe eine Frage: ')}`;

function renderTrailers(trailers) {
  const grid = document.querySelector('.trailer-grid');
  const select = document.getElementById('trailer-select');
  if (!grid || !select || !Array.isArray(trailers) || !trailers.length) return;
  grid.replaceChildren();
  select.replaceChildren(new Option('– bitte wählen –', ''));
  for (const trailer of trailers) {
    const article = document.createElement('article');
    article.className = 'trailer-card';
    const media = document.createElement('div'); media.className = 'trailer-card__img';
    const main = document.createElement('img');
    main.className = 'trailer-card__photo'; main.src = trailer.images[0]; main.alt = trailer.name; main.loading = 'lazy';
    const thumbs = document.createElement('div'); thumbs.className = 'trailer-card__thumbs';
    trailer.images.forEach((url, index) => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = `trailer-card__thumb${index === 0 ? ' is-active' : ''}`;
      button.dataset.src = url; button.dataset.alt = `${trailer.name}, Foto ${index + 1}`; button.setAttribute('aria-label', `Foto ${index + 1} zeigen`);
      const image = document.createElement('img'); image.src = url; image.alt = ''; image.loading = 'lazy';
      button.append(image); thumbs.append(button);
    });
    media.append(main, thumbs);
    const body = document.createElement('div'); body.className = 'trailer-card__body';
    const head = document.createElement('div'); head.className = 'trailer-card__head';
    const title = document.createElement('h3'); title.textContent = trailer.name;
    const price = document.createElement('p'); price.className = 'trailer-card__price';
    const strong = document.createElement('strong'); strong.textContent = `${trailer.price} €`; price.append(strong, ' / Tag');
    head.append(title, price);
    const description = document.createElement('p'); description.className = 'trailer-card__desc'; description.textContent = trailer.description;
    const specs = document.createElement('dl'); specs.className = 'trailer-specs';
    trailer.specs.forEach(spec => {
      const row = document.createElement('div'); const dt = document.createElement('dt'); const dd = document.createElement('dd');
      dt.textContent = spec.label; dd.textContent = spec.value; row.append(dt, dd); specs.append(row);
    });
    const book = document.createElement('button');
    book.type = 'button'; book.className = 'btn btn--primary btn--full'; book.dataset.book = trailer.id; book.textContent = 'Verfügbarkeit prüfen & buchen';
    body.append(head, description, specs, book); article.append(media, body); grid.append(article);
    select.append(new Option(trailer.name, trailer.id));
  }
}

export async function loadSiteContent() {
  try {
    const response = await fetch('api/index.php?action=site', { cache: 'no-store' });
    if (!response.ok) return null;
    const site = await response.json();
    const c = site.content || {};
    window.brennwerkSite = site;
    if (c.page_title && document.body.classList.contains('home-page')) document.title = c.page_title;
    else if (document.querySelector('.legal-page h1') && c.contact_name) document.title = `${document.querySelector('.legal-page h1').textContent} – ${c.contact_name}`;
    const description = document.querySelector('meta[name="description"]');
    if (description && c.meta_description) description.content = c.meta_description;
    const mapping = {
      '#orbit-title': 'home_title', '#trailer-eyebrow': 'trailer_eyebrow', '#trailer-title': 'trailer_title', '#trailer-intro': 'trailer_intro', '#trailer-terms': 'trailer_terms',
      '#wood-eyebrow': 'wood_eyebrow', '#wood-title': 'wood_title', '#wood-intro': 'wood_intro', '#wood-soft-name': 'wood_soft_name', '#wood-soft-species': 'wood_soft_species', '#wood-soft-description': 'wood_soft_description', '#wood-soft-lengths': 'wood_soft_lengths', '#wood-soft-srm': 'wood_soft_srm', '#wood-soft-ster': 'wood_soft_ster',
      '#wood-hard-name': 'wood_hard_name', '#wood-hard-species': 'wood_hard_species', '#wood-hard-description': 'wood_hard_description', '#wood-hard-lengths': 'wood_hard_lengths', '#wood-hard-srm': 'wood_hard_srm', '#wood-hard-ster': 'wood_hard_ster', '#wood-terms': 'wood_terms',
      '#handover-title': 'handover_title', '#handover-text-1': 'handover_text_1', '#handover-text-2': 'handover_text_2', '#handover-note': 'handover_note', '#contact-title': 'contact_title', '#contact-intro': 'contact_intro', '#footer-business': 'business_name', '#footer-description': 'footer_description',
    };
    Object.entries(mapping).forEach(([selector, key]) => text(selector, c[key]));
    ['#wood-soft-srm', '#wood-soft-ster', '#wood-hard-srm', '#wood-hard-ster'].forEach(selector => {
      const node = document.querySelector(selector); if (node && !node.textContent.trim().endsWith('€')) node.textContent += ' €';
    });
    const address = `${c.contact_name}\n${c.contact_street}\n${c.contact_postal} ${c.contact_city}`;
    text('#contact-address', address); const contactAddress = document.getElementById('contact-address'); if (contactAddress) contactAddress.style.whiteSpace = 'pre-line';
    text('#contact-phone', c.contact_phone); text('#contact-email', c.contact_email);
    document.querySelectorAll('[data-site-name]').forEach(node => { node.textContent = c.contact_name; });
    document.querySelectorAll('[data-site-street]').forEach(node => { node.textContent = c.contact_street; });
    document.querySelectorAll('[data-site-location]').forEach(node => { node.textContent = `${c.contact_postal} ${c.contact_city}`; });
    document.querySelectorAll('[data-site-email]').forEach(node => { node.textContent = c.contact_email; if (node.matches('a')) node.href = `mailto:${c.contact_email}`; });
    document.querySelectorAll('[data-site-phone-text]').forEach(node => { node.textContent = c.contact_phone; if (node.matches('a')) node.href = phoneHref(c.contact_phone); });
    text('#topbar-address', `${c.contact_street} · ${c.contact_postal} ${c.contact_city}`); text('#topbar-phone', `Telefon: ${c.contact_phone}`);
    document.querySelectorAll('[data-site-phone], .quick-contact__call').forEach(link => { link.href = phoneHref(c.contact_phone); });
    document.querySelectorAll('[data-site-whatsapp], .quick-contact__wa').forEach(link => { link.href = whatsappHref(c.whatsapp_number); });
    const email = document.getElementById('contact-email'); if (email) email.href = `mailto:${c.contact_email}`;
    renderTrailers(site.trailers);
    const featured = site.trailers?.[0];
    const handoverImage = document.querySelector('.handover__photo img');
    const handoverCaption = document.querySelector('.handover__photo figcaption');
    if (featured?.images?.[0] && handoverImage) { handoverImage.src = featured.images[0]; handoverImage.alt = featured.name; }
    if (featured && handoverCaption) handoverCaption.textContent = featured.name;
    return site;
  } catch { return null; }
}

