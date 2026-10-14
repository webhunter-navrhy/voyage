/* VOYAGE – hlavička, menu, kompas roku, filtr expedic, archiv podle data, průvodci, formuláře */
(() => {
  'use strict';
  document.documentElement.classList.add('js');
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const dnes = new Date(); dnes.setHours(0, 0, 0, 0);
  const d = (iso) => { const [y, m, dd] = iso.split('-').map(Number); return new Date(y, m - 1, dd); };

  /* hlavička: na úvodu průhledná nad fotkou, po odscrollování plná */
  const hl = $('[data-hlavicka]');
  if (hl && document.body.classList.contains('uvod')) {
    const hero = $('.hero');
    const upd = () => hl.classList.toggle('plna', window.scrollY > (hero ? hero.offsetHeight - 90 : 40));
    upd(); window.addEventListener('scroll', upd, { passive: true });
  }

  /* menu na mobilu */
  const burger = $('[data-burger]'), menu = $('#menu');
  if (burger && menu) {
    const set = (o) => { burger.setAttribute('aria-expanded', o); menu.classList.toggle('otevrene', o); document.body.classList.toggle('menu-otevrene', o); };
    burger.addEventListener('click', () => set(burger.getAttribute('aria-expanded') !== 'true'));
    menu.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
  }

  /* proběhlé expedice se přesunou do archivu samy (podle data „do“), i bez nového buildu */
  const archivSeznam = $('[data-archiv-seznam]');
  $$('.karty [data-karta]').forEach((k) => {
    if (d(k.dataset.do) >= dnes) return;
    if (archivSeznam && !archivSeznam.querySelector(`a[href="${k.querySelector('a').getAttribute('href')}"]`)) {
      const a = k.querySelector('a');
      const li = document.createElement('li');
      li.innerHTML = `<a href="${a.getAttribute('href')}"><span class="archiv-termin"></span><span class="archiv-nazev"></span><span class="archiv-lokace"></span></a>`;
      li.querySelector('.archiv-termin').textContent = k.querySelector('.karta-termin')?.textContent || '';
      li.querySelector('.archiv-nazev').textContent = k.querySelector('h3')?.textContent || '';
      li.querySelector('.archiv-lokace').textContent = k.querySelector('.karta-meta')?.textContent || '';
      archivSeznam.prepend(li);
      const p = $('[data-archiv-pocet]'); if (p) p.textContent = `(${archivSeznam.children.length})`;
    }
    k.remove();
  });
  $$('[data-vyber-expedice] option').forEach((o) => { if (o.dataset.do && d(o.dataset.do) < dnes) o.remove(); });
  const exp = $('[data-expedice]');
  if (exp && d(exp.dataset.do) < dnes) $('[data-probehla]')?.removeAttribute('hidden');

  /* filtr kategorií (+ ?kategorie= z patičky) */
  const karty = $('[data-karty]');
  if (karty) {
    const prazdno = $('[data-prazdno]');
    const filtruj = (kat) => {
      let n = 0;
      $$('[data-karta]', karty).forEach((k) => { const ok = !kat || k.dataset.kat === kat; k.hidden = !ok; if (ok) n++; });
      $$('.filtr-btn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filtr === kat)));
      if (prazdno) prazdno.hidden = n > 0;
    };
    /* na úvodu jen nejbližších 6 výprav, zbytek za tlačítkem (při filtru vše) */
    const LIMIT = 6, vic = $('[data-vic]');
    const omez = () => {
      const k = $$('[data-karta]', karty);
      k.forEach((x, i) => { x.hidden = i >= LIMIT; });
      if (vic) { vic.hidden = k.length <= LIMIT; $('[data-vic-pocet]', vic).textContent = `(${k.length})`; }
    };
    $('[data-vic-btn]')?.addEventListener('click', () => { $$('[data-karta]', karty).forEach((x) => { x.hidden = false; }); vic.hidden = true; });
    $$('[data-filtr]').forEach((b) => b.addEventListener('click', () => { if (vic) vic.hidden = true; if (b.dataset.filtr) filtruj(b.dataset.filtr); else { filtruj(''); omez(); } }));
    omez();
    const q = new URLSearchParams(location.search).get('kategorie');
    if (q) { if (vic) vic.hidden = true; filtruj(q); }
  }

  /* data expedic pro kompas a pás nejbližšího odjezdu */
  const jsonEl = $('[data-expedice-json]');
  const vse = jsonEl ? JSON.parse(jsonEl.textContent) : [];
  const aktualni = vse.filter((e) => d(e.do) >= dnes).sort((a, b) => a.od.localeCompare(b.od));
  const nejblizsi = aktualni.find((e) => d(e.od) >= dnes) || aktualni[0];

  const pas = $('[data-odjezd]');
  if (pas && nejblizsi) {
    pas.href = nejblizsi.url;
    pas.querySelector('[data-o="nazev"]').textContent = nejblizsi.nazev;
    pas.querySelector('[data-o="termin"]').textContent = nejblizsi.termin;
    pas.querySelector('[data-o="mista"]').textContent = nejblizsi.mista;
  } else if (pas) pas.remove();

  /* karta výpravy vedle kompasu */
  const panel = $('[data-vyprava]');
  let aktivniSlug = null;
  const ukaz = (e) => {
    if (!panel || !e || e.slug === aktivniSlug) return;
    aktivniSlug = e.slug;
    $$('.kr-oblouk').forEach((o) => o.classList.toggle('aktivni', o.dataset.slug === e.slug));
    $$('.kr-seznam button').forEach((o) => o.setAttribute('aria-pressed', String(o.dataset.slug === e.slug)));
    const v = (k) => panel.querySelector(`[data-v="${k}"]`);
    panel.classList.add('meni');
    setTimeout(() => {
      v('foto').src = e.foto; v('kat').textContent = e.kat; v('lokace').textContent = e.lokace; v('nazev').textContent = e.nazev;
      v('termin').textContent = e.termin; v('trasa').textContent = e.trasa; v('skupina').textContent = e.skupina;
      v('mista').textContent = e.mista; v('cena').textContent = e.cena; v('odkaz').href = e.url; v('odkaz2').href = e.url;
      panel.classList.remove('meni');
    }, 140);
  };

  /* KOMPAS ROKU – 12 měsíců od začátku tohoto měsíce, expedice jako oblouky v drahách */
  const svg = $('[data-kompas-svg]');
  if (svg && aktualni.length) {
    const NS = 'http://www.w3.org/2000/svg';
    const el = (tag, at = {}, rodic = svg) => { const x = document.createElementNS(NS, tag); for (const k in at) x.setAttribute(k, at[k]); rodic.appendChild(x); return x; };
    const start = new Date(dnes.getFullYear(), dnes.getMonth(), 1);
    const konec = new Date(dnes.getFullYear() + 1, dnes.getMonth(), 1);
    const span = konec - start;
    const uhel = (dt) => Math.max(0, Math.min(1, (dt - start) / span)) * 360;
    const bod = (r, a) => { const rad = (a * Math.PI) / 180; return [r * Math.sin(rad), -r * Math.cos(rad)]; };
    const oblouk = (r, a1, a2) => { const [x1, y1] = bod(r, a1), [x2, y2] = bod(r, a2); return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 ${a2 - a1 > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`; };
    const MES = ['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro'];
    const R_VNEJ = 250, DRAHY = [222, 196, 170, 144];
    const mobil = matchMedia('(max-width: 1060px)').matches; /* na mobilu ovládají kalendář pilulky pod kompasem */

    el('circle', { r: R_VNEJ, class: 'kr-kruh' });
    el('circle', { r: 126, class: 'kr-kruh kr-kruh-in' });
    DRAHY.forEach((r) => el('circle', { r, class: 'kr-draha' }));
    for (let i = 0; i < 12; i++) {
      const m = new Date(start.getFullYear(), start.getMonth() + i, 1);
      const a = uhel(m), stred = uhel(new Date(m.getFullYear(), m.getMonth(), 15));
      const [x1, y1] = bod(R_VNEJ - 8, a), [x2, y2] = bod(R_VNEJ + 8, a);
      el('line', { x1, y1, x2, y2, class: 'kr-tick kr-tick-mesic' });
      for (let t = 1; t < 4; t++) { const at = uhel(new Date(m.getFullYear(), m.getMonth(), 1 + t * 7.6)); const [a1, b1] = bod(R_VNEJ - 3, at), [a2, b2] = bod(R_VNEJ + 3, at); el('line', { x1: a1, y1: b1, x2: a2, y2: b2, class: 'kr-tick' }); }
      const [tx, ty] = bod(R_VNEJ + 24, stred);
      const txt = el('text', { x: tx.toFixed(1), y: (ty + 4).toFixed(1), 'text-anchor': 'middle', class: 'kr-mesic' });
      txt.textContent = MES[m.getMonth()] + (m.getMonth() === 0 || i === 0 ? ' ’' + String(m.getFullYear()).slice(2) : '');
    }
    /* dnešek */
    const ad = uhel(dnes);
    { const [x1, y1] = bod(126, ad), [x2, y2] = bod(R_VNEJ, ad); el('line', { x1, y1, x2, y2, class: 'kr-ted' }); const [cx, cy] = bod(R_VNEJ, ad); el('circle', { cx, cy, r: 4, class: 'kr-ted', fill: 'currentColor' }).style.fill = 'var(--zlata-ink)'; }

    /* dráhy: první volná dráha, kde předchozí expedice skončila aspoň 3 dny před začátkem */
    const konce = [];
    const zobrazene = aktualni.filter((e) => d(e.od) < konec);
    zobrazene.forEach((e) => {
      const od = d(e.od), dok = d(e.do);
      let lane = konce.findIndex((k) => k < od - 3 * 864e5);
      if (lane === -1) lane = konce.length < DRAHY.length ? konce.length : konce.indexOf(Math.min(...konce));
      konce[lane] = +dok;
      const r = DRAHY[lane];
      let a1 = uhel(od), a2 = uhel(new Date(dok.getFullYear(), dok.getMonth(), dok.getDate() + 1));
      if (a2 - a1 < 3.5) { const s = (a1 + a2) / 2; a1 = s - 1.75; a2 = s + 1.75; }
      const g = mobil
        ? el('g', { class: 'kr-oblouk kr-dekor' + (e.volna <= 2 ? ' malo' : ''), 'data-slug': e.slug, 'aria-hidden': 'true' })
        : el('a', { href: e.url, class: 'kr-oblouk' + (e.volna <= 2 ? ' malo' : ''), 'data-slug': e.slug, 'aria-label': `${e.nazev}, ${e.termin}` });
      if (!mobil) el('title', {}, g).textContent = `${e.nazev} · ${e.termin}`;
      const p = oblouk(r, a1, a2);
      el('path', { d: p, class: 'kr-hit' }, g);
      el('path', { d: p, class: 'kr-car' }, g);
      g.addEventListener('mouseenter', () => ukaz(e));
      g.addEventListener('focus', () => ukaz(e));
      g.addEventListener('click', (ev) => { if (matchMedia('(hover: none)').matches && aktivniSlug !== e.slug) { ev.preventDefault(); ukaz(e); panel?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } });
    });
    /* růžice z loga uprostřed */
    const ruz = $('.logo .kompas');
    if (ruz) { const c = ruz.cloneNode(true); c.setAttribute('x', -62); c.setAttribute('y', -84); c.setAttribute('width', 124); c.setAttribute('height', 124); c.classList.add('kr-ruzice'); svg.appendChild(c); }
    const t1 = el('text', { x: 0, y: 70, class: 'kr-stred-text' });
    t1.textContent = `${zobrazene.length} ${zobrazene.length >= 5 ? 'expedic' : zobrazene.length >= 2 ? 'expedice' : 'expedice'}`;
    const t2 = el('text', { x: 0, y: 92, class: 'kr-stred-mala' });
    t2.textContent = 'příštích 12 měsíců';
    const sez = document.createElement('ol'); sez.className = 'kr-seznam'; sez.setAttribute('role', 'list');
    zobrazene.forEach((e) => {
      const li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button'; b.dataset.slug = e.slug;
      b.innerHTML = '<span></span><b></b>'; b.firstChild.textContent = e.termin; b.lastChild.textContent = e.nazev.split(':')[0];
      b.addEventListener('click', () => { ukaz(e); panel?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
      li.appendChild(b); sez.appendChild(li);
    });
    svg.parentNode.after(sez);
    if (nejblizsi) { ukaz(nejblizsi); }
  }

  /* průvodci – posun pásu */
  const pasP = $('[data-pas]');
  $$('[data-posun]').forEach((b) => b.addEventListener('click', () => {
    if (!pasP) return; const k = pasP.querySelector('.pruvodce'); const w = k ? k.getBoundingClientRect().width + 24 : 300;
    pasP.scrollBy({ left: +b.dataset.posun * w * (window.innerWidth > 900 ? 2 : 1), behavior: 'smooth' });
  }));
  /* dialogy průvodců */
  $$('[data-dialog]').forEach((b) => b.addEventListener('click', () => { const dl = document.getElementById(b.dataset.dialog); if (dl?.showModal) dl.showModal(); }));
  $$('dialog').forEach((dl) => {
    dl.addEventListener('click', (e) => { if (e.target === dl || e.target.closest('[data-zavrit]')) dl.close(); });
  });
  /* lightbox galerie */
  const lb = $('[data-lightbox-dialog]');
  $$('[data-lightbox]').forEach((a) => a.addEventListener('click', (e) => {
    if (!lb?.showModal) return; e.preventDefault();
    const img = $('[data-lightbox-img]', lb); img.src = a.getAttribute('href'); img.alt = a.querySelector('img')?.alt || ''; lb.showModal();
  }));

  /* formuláře přihlášky → webhunter-admin (uloží se do administrace) */
  $$('[data-formular]').forEach((f) => {
    const t0 = Date.now();
    const stav = $('.formular-stav', f);
    const zprava = (txt, cls) => { stav.textContent = txt; stav.className = 'formular-stav ' + (cls || ''); };
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const jm = f.elements['Jméno'], em = f.elements['E-mail'], tel = f.elements['Telefon'], sou = f.elements.souhlas;
      [jm, em, tel].forEach((x) => x.classList.remove('chyba'));
      if (!jm.value.trim()) { jm.classList.add('chyba'); jm.focus(); return zprava('Vyplň prosím jméno.', 'err'); }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em.value.trim())) { em.classList.add('chyba'); em.focus(); return zprava('Zkontroluj prosím e-mail.', 'err'); }
      if (tel.value.trim() && !/^[+\d][\d\s/().-]{5,24}$/.test(tel.value.trim())) { tel.classList.add('chyba'); tel.focus(); return zprava('Telefon nevypadá správně.', 'err'); }
      if (!sou.checked) { sou.focus(); return zprava('Potvrď prosím souhlas se zpracováním údajů.', 'err'); }
      const sel = f.elements.Expedice, opt = sel.options[sel.selectedIndex];
      const fields = { 'Jméno': jm.value.trim(), 'E-mail': em.value.trim(), 'Telefon': tel.value.trim(), 'Počet osob': f.elements['Počet osob'].value, 'Datum a expedice': opt.value ? (opt.dataset.kratce || opt.dataset.nazev) : 'Jiný dotaz', 'Expedice': opt.value ? opt.dataset.nazev : 'Jiný dotaz / privátní cesta', 'Zpráva': f.elements['Zpráva'].value.trim() };
      if (f.dataset.demo === '1' || !f.dataset.endpoint) return zprava('Ukázka: v návrhu se nic neodesílá.', 'ok');
      const btn = f.querySelector('button[type="submit"]'); btn.disabled = true; zprava('Odesílám…');
      try {
        const r = await fetch(f.dataset.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          type: 'poptavka', fields, listing: opt.value ? { id: opt.value, title: opt.dataset.nazev, url: opt.dataset.url || '' } : null,
          page: location.href, hp: f.elements._hp.value, ms: Date.now() - t0, lang: 'cs' }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.ok) throw new Error(j.error || 'Odeslání se nepovedlo.');
        f.reset(); zprava('Díky! Přihláška dorazila, ozveme se ti co nejdřív.', 'ok');
      } catch (er) { zprava(er.message + ' Zkus to prosím znovu, nebo nám napiš e-mail.', 'err'); }
      finally { btn.disabled = false; }
    });
  });
})();
