// Ortak arayüz yardımcıları: biçimlendirme, ikonlar, modal, bildirim, tablo, otomatik tamamlama.

export const e = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const SEMBOL = { TRY: '₺', USD: '$', EUR: '€', GBP: '£' };
const nf = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Kuruş → "1.234,56 ₺" */
export function tl(kurus, doviz = 'TRY') {
  return `${nf.format((Number(kurus) || 0) / 100)} ${SEMBOL[doviz] || doviz}`;
}
/** Kuruş → "1.234,56" (para birimi olmadan) */
export const sayi = (kurus) => nf.format((Number(kurus) || 0) / 100);
export const miktar = (m) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 }).format(Number(m) || 0);

/** Cari bakiyesi: pozitif = cari borçlu (B), negatif = cari alacaklı (A) */
export function bakiye(kurus, doviz = 'TRY') {
  const k = Number(kurus) || 0;
  if (!k) return `<span class="num muted">${tl(0, doviz)}</span>`;
  return `<span class="num ${k > 0 ? 'neg' : 'pos'}" title="${k > 0 ? 'Borçlu (bize borcu var)' : 'Alacaklı (bizim borcumuz var)'}">${tl(Math.abs(k), doviz)} ${k > 0 ? '(B)' : '(A)'}</span>`;
}

/** "1.234,56" / "1234.56" / "1234" → kuruş */
export function parseTL(v) {
  if (typeof v === 'number') return Math.round(v * 100);
  let s = String(v ?? '').trim().replace(/[₺$€£\s]/g, '');
  if (!s) return 0;
  const virgul = s.includes(',');
  const nokta = s.includes('.');
  if (virgul && nokta) s = s.replace(/\./g, '').replace(',', '.');
  else if (virgul) s = s.replace(',', '.');
  else if (nokta && !(s.split('.').length === 2 && /\.\d{1,2}$/.test(s))) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}
export const parseNum = (v) => Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'));

export const bugun = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const tarih = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('.') : '');
export function gunEkle(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const ayBasi = () => bugun().slice(0, 8) + '01';
export const yilBasi = () => bugun().slice(0, 5) + '01-01';

export function debounce(fn, ms = 250) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// ---------- İkonlar ----------
const P = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14.8c1.9.7 3.1 2.5 3.5 5.2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.2-6 8-6s7 2 8 6"/>',
  wallet: '<rect x="2.5" y="6" width="19" height="14" rx="2"/><path d="M2.5 10h19"/><path d="M6 3.5h12"/><circle cx="16.5" cy="15" r="1.2"/>',
  bank: '<path d="M3 10h18L12 4z"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8"/><path d="M3 21h18"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 9.5v5M18 9.5v5"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 15h4"/>',
  transfer: '<path d="M4 8h14l-3.5-3.5"/><path d="M20 16H6l3.5 3.5"/>',
  cheque: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 14h7"/><path d="M6 10.5h3"/><path d="m15 14 4-4"/>',
  note: '<path d="M6 2.5h9l4 4V21.5H6z"/><path d="M15 2.5v4h4"/><path d="M9 11h6M9 15h6M9 18h3"/>',
  swap: '<path d="M7 4v16"/><path d="m3 8 4-4 4 4"/><path d="M17 20V4"/><path d="m21 16-4 4-4-4"/>',
  dots: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  box: '<path d="m3 7.5 9-4.5 9 4.5v9L12 21l-9-4.5z"/><path d="m3 7.5 9 4.5 9-4.5"/><path d="M12 12v9"/>',
  invoice: '<path d="M5 2.5h14v19l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 7.5h6M9 11h6M9 14.5h4"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15v3M11.5 10v8M16 12v6M20.5 6v12"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  back: '<path d="M15 18 9 12l6-6"/>',
  chev: '<path d="m9 18 6-6-6-6"/>',
  print: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
  excel: '<path d="M14 2.5H6v19h12V6.5z"/><path d="M14 2.5v4h4"/><path d="m9 11 5 6M14 11l-5 6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  phone: '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2"/>',
  whatsapp: '<path d="M3.5 20.5 5 16a8.5 8.5 0 1 1 3 3z"/><path d="M9 9.5c.3 2.2 2.3 4.2 4.5 4.5l1-1.2 2 1-.5 1.5c-3.5.5-8-4-7.5-7.5L10 7.3l1 2z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  in: '<path d="M12 4v12"/><path d="m6 10 6 6 6-6"/><path d="M4 20h16"/>',
  out: '<path d="M12 20V8"/><path d="m6 14 6-6 6 6"/><path d="M4 4h16"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17.5v.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  logout: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/>',
  download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
  upload: '<path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M5 21h14"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
  pdf: '<path d="M14 2.5H6v19h12V6.5z"/><path d="M14 2.5v4h4"/><path d="M9 13h1.5a1.5 1.5 0 0 1 0 3H9v-5M14 11v5M14 11h2M14 13.5h1.5"/>',
  receipt: '<path d="M6 2.5h12v19l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5z"/><path d="M9 7h6M9 11h6M9 15h3"/>',
};
export const icon = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[n] || ''}</svg>`;

// ---------- Bildirim ----------
export function toast(msg, tip = '', aksiyon = null) {
  const el = document.createElement('div');
  el.className = `toast ${tip}`;
  el.textContent = msg;
  if (aksiyon) {
    const b = document.createElement('button');
    b.className = 'toast-btn';
    b.textContent = aksiyon.etiket;
    b.addEventListener('click', () => { el.remove(); aksiyon.fn(); });
    el.appendChild(b);
  }
  $('#toast-root').appendChild(el);
  setTimeout(() => el.remove(), aksiyon ? 7000 : tip === 'err' ? 5000 : 2800);
}

/** Düğmeyi işlem sürerken kilitler ve içinde dönen daire gösterir. Geri döndürülen fonksiyon eski haline getirir. */
export function bekle(btn) {
  if (!btn) return () => {};
  btn.disabled = true;
  btn.classList.add('bekliyor');
  return () => { btn.disabled = false; btn.classList.remove('bekliyor'); };
}

// ---------- Modal ----------
let modalSira = 0;
let geriBekleniyor = false; // pencere kapatılınca yapılan history.back() henüz tamamlanmadı
let bekleyenler = [];
window.addEventListener('popstate', (ev) => {
  if (geriBekleniyor) {
    geriBekleniyor = false;
    bekleyenler.splice(0).forEach((fn) => fn());
    return;
  }
  const durum = ev.state?.modal || 0;
  const acik = [...document.querySelectorAll('#modal-root > .modal-bg')].filter((m) => Number(m.dataset.m) > durum);
  acik.reverse().forEach((m) => m._close?.(true));
  // Artık açık olmayan pencerelere ait kayıtlar atlanır
  if (durum && !document.querySelector(`#modal-root > .modal-bg[data-m="${durum}"]`)) {
    if (acik.length) geriBekleniyor = true;
    history.back();
  }
});
const gecmiseEkle = (fn) => (geriBekleniyor ? bekleyenler.push(fn) : fn());

export function modal({ title, body = '', footer = '', wide = false, onClose } = {}) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal ${wide === 'xl' ? 'wide xl' : wide ? 'wide' : ''}" role="dialog" aria-modal="true">
    <div class="modal-h"><h2>${e(title)}</h2><button class="btn ghost icon" data-close aria-label="Kapat">${icon('x')}</button></div>
    <div class="modal-b">${body}</div>
    ${footer ? `<div class="modal-f">${footer}</div>` : ''}
  </div>`;
  // Telefonun geri tuşu pencereyi kapatsın diye her pencere geçmişe bir kayıt ekler
  const id = ++modalSira;
  bg.dataset.m = id;
  const close = (geriTusu = false) => {
    if (!bg.isConnected) return;
    bg.remove();
    // Kapatınca pencerenin geçmiş kaydı geri alınır; hemen ardından başka sayfaya geçildiyse dokunulmaz
    if (!geriTusu) {
      setTimeout(() => {
        if (history.state?.modal === id && !geriBekleniyor) { geriBekleniyor = true; history.back(); }
      }, 0);
    }
    document.removeEventListener('keydown', esc);
    onClose?.();
  };
  bg._close = close;
  const esc = (ev) => { if (ev.key === 'Escape' && $('#modal-root').lastElementChild === bg) close(); };
  bg.addEventListener('mousedown', (ev) => { if (ev.target === bg) close(); });
  bg.addEventListener('click', (ev) => { if (ev.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', esc);
  $('#modal-root').appendChild(bg);
  gecmiseEkle(() => { if (bg.isConnected) history.pushState({ ...(history.state || {}), modal: id }, ''); });
  const first = bg.querySelector('.modal-b input:not([type=hidden]):not([readonly]), .modal-b select, .modal-b textarea');
  if (first && window.matchMedia('(min-width: 900px)').matches) setTimeout(() => first.focus(), 30);
  return { el: bg, body: $('.modal-b', bg), close };
}

/**
 * Seçenek menüsü: [[etiket, ikon, fn, tehlikeli?]].
 * Masaüstünde düğmenin altında açılır liste, telefonda alttan açılan pencere olarak gösterilir.
 */
export function menu(baslik, secenekler, anchor) {
  document.querySelector('.dropdown')?.remove();
  if (anchor && window.matchMedia('(min-width: 900px)').matches) {
    const r = anchor.getBoundingClientRect();
    const dd = document.createElement('div');
    dd.className = 'dropdown';
    dd.innerHTML = secenekler.map(([l, i, , t], n) => `<button data-n="${n}" class="${t ? 'neg' : ''}">${icon(i)}${e(l)}</button>`).join('');
    document.body.appendChild(dd);
    const w = dd.offsetWidth;
    dd.style.top = `${r.bottom + window.scrollY + 4}px`;
    dd.style.left = `${Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)) + window.scrollX}px`;
    const kapat = (ev) => {
      if (ev && (dd.contains(ev.target) || anchor.contains(ev.target))) return;
      dd.remove();
      document.removeEventListener('mousedown', kapat);
    };
    setTimeout(() => document.addEventListener('mousedown', kapat));
    $$('[data-n]', dd).forEach((b) => b.addEventListener('click', () => { kapat(); secenekler[Number(b.dataset.n)][2](); }));
    return;
  }
  const m = modal({
    title: baslik,
    body: `<ul class="list">${secenekler.map(([l, i, , t], n) => `<li class="click ${t ? 'neg' : ''}" data-n="${n}">${icon(i)}<div class="grow">${e(l)}</div></li>`).join('')}</ul>`,
  });
  m.body.style.padding = '0';
  $$('[data-n]', m.el).forEach((li) => li.addEventListener('click', () => { m.close(); secenekler[Number(li.dataset.n)][2](); }));
}

export function onayla(mesaj, { baslik = 'Onay', ok = 'Evet', tehlikeli = false } = {}) {
  return new Promise((resolve) => {
    let sonuc = false;
    const m = modal({
      title: baslik,
      body: `<p style="margin:0">${e(mesaj)}</p>`,
      footer: `<button class="btn" data-close>Vazgeç</button><button class="btn ${tehlikeli ? 'red' : 'primary'}" data-ok>${e(ok)}</button>`,
      onClose: () => resolve(sonuc),
    });
    $('[data-ok]', m.el).addEventListener('click', () => { sonuc = true; m.close(); });
  });
}

/**
 * Form modalı. alanlar: [{ name, label, type, options, required, full, value, placeholder, sec }]
 * onSubmit(data) Promise döner; hata fırlatırsa modal açık kalır.
 */
export function formModal({ title, alanlar, degerler = {}, kaydet = 'Kaydet', wide = false, onSubmit, onMount }) {
  const m = modal({
    title, wide,
    body: `<form class="form-grid" novalidate>${alanlar.map((a) => alanHtml(a, degerler)).join('')}
      ${alanlar.some((a) => a.ek) ? `<button type="button" class="btn ghost sm full" data-daha style="justify-self:start">${icon('plus')} Daha fazla</button>` : ''}
      <button type="submit" hidden></button></form>`,
    footer: `<button class="btn" data-close>Vazgeç</button><button class="btn primary" data-save>${e(kaydet)}</button>`,
  });
  const form = $('form', m.el);
  $('[data-daha]', form)?.addEventListener('click', (ev) => {
    $$('.ek', form).forEach((x) => x.classList.remove('hidden'));
    ev.currentTarget.remove();
  });
  const gonder = async (ev) => {
    ev?.preventDefault();
    const data = formOku(form, alanlar);
    for (const a of alanlar) {
      if (a.required && (data[a.name] === '' || data[a.name] === null || data[a.name] === undefined || Number.isNaN(data[a.name]))) {
        toast(`${a.label} gerekli`, 'err');
        form.elements[a.name]?.focus();
        return;
      }
    }
    const btn = $('[data-save]', m.el);
    const bitti = bekle(btn);
    try {
      await onSubmit(data, m);
      m.close();
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      bitti();
    }
  };
  form.addEventListener('submit', gonder);
  $('[data-save]', m.el).addEventListener('click', gonder);
  onMount?.(form, m);
  return m;
}

export function alanHtml(a, degerler = {}) {
  if (a.type === 'section') return '';
  const v = degerler[a.name] ?? a.value ?? '';
  const req = a.required ? 'class="req"' : '';
  const ek = a.ek ? ' ek hidden' : '';
  const cls = (a.full ? 'f full' : 'f') + ek;
  const ph = a.placeholder ? `placeholder="${e(a.placeholder)}"` : '';
  let input;
  switch (a.type) {
    case 'select':
      input = `<select name="${a.name}">${a.options.map(([k, l]) => `<option value="${e(k)}" ${String(k) === String(v) ? 'selected' : ''}>${e(l)}</option>`).join('')}</select>`;
      break;
    case 'textarea':
      input = `<textarea name="${a.name}" ${ph}>${e(v)}</textarea>`;
      break;
    case 'money':
      input = `<input name="${a.name}" class="money" inputmode="decimal" autocomplete="off" value="${v === '' ? '' : e(sayi(v))}" ${ph || 'placeholder="0,00"'}>`;
      break;
    case 'check':
      return `<label class="check ${a.full ? 'full' : ''}${ek}"><input type="checkbox" name="${a.name}" ${v ? 'checked' : ''}> ${e(a.label)}</label>`;
    case 'html':
      return `<div class="${a.full ? 'full' : ''}${ek}">${a.html}</div>`;
    default:
      input = `<input name="${a.name}" type="${a.type || 'text'}" value="${e(v)}" ${ph} ${a.type === 'number' ? 'inputmode="decimal" step="any"' : ''} ${a.attrs || ''}>`;
  }
  return `<label class="${cls}"><span ${req}>${e(a.label)}</span>${input}</label>`;
}

export function formOku(form, alanlar) {
  const d = {};
  for (const a of alanlar) {
    if (!a.name || a.type === 'section' || a.type === 'html') continue;
    const el = form.elements[a.name];
    if (!el) continue;
    if (a.type === 'check') d[a.name] = el.checked;
    else if (a.type === 'money') d[a.name] = el.value.trim() === '' ? (a.required ? '' : 0) : parseTL(el.value);
    else if (a.type === 'number') d[a.name] = el.value.trim() === '' ? '' : parseNum(el.value);
    else d[a.name] = el.value.trim();
  }
  return d;
}

// Para alanlarını odaktan çıkınca biçimlendir
document.addEventListener('focusout', (ev) => {
  const el = ev.target;
  if (el.matches?.('input.money') && el.value.trim()) {
    const k = parseTL(el.value);
    if (!Number.isNaN(k)) el.value = sayi(k);
  }
});

// ---------- Tablo ----------
/**
 * Rapor yapısından tablo üretir. Mobilde kart görünümüne dönüşür.
 * onRow: satır tıklanınca çağrılır (index ile).
 */
export function tablo(r, { onRow, bos = 'Kayıt bulunamadı', ekKolon } = {}) {
  const kol = r.kolonlar;
  const mainIdx = kol.findIndex((k) => k.main) >= 0 ? kol.findIndex((k) => k.main) : kol.findIndex((k) => !k.type && !['kod', 'tarih'].includes(k.key));
  let amtIdx = kol.findIndex((k) => k.amt);
  if (amtIdx < 0) amtIdx = kol.map((k) => k.type === 'money' || k.type === 'bakiye').lastIndexOf(true);
  const hucre = (k, v, row) => {
    if (k.render) return k.render(v, row);
    switch (k.type) {
      case 'money': return v === undefined || v === null || v === '' ? '' : `<span class="num">${sayi(v)}</span>`;
      case 'bakiye': return bakiye(v, row?.doviz);
      case 'date': return tarih(v);
      case 'number': return v === undefined || v === null || v === '' ? '' : `<span class="num">${miktar(v)}</span>`;
      default: return e(v);
    }
  };
  const sag = (k) => ['money', 'bakiye', 'number'].includes(k.type);
  const td = (k, i, v, row) => {
    const html = hucre(k, v, row);
    const bos = v === null || v === undefined || v === '' || html === '' || (k.type === 'money' && v === 0 && i !== amtIdx);
    const cls = [sag(k) ? 'r' : '', i === mainIdx ? 'main-col' : '', i === amtIdx ? 'amt-col' : '', bos ? 'empty-m' : ''].join(' ');
    return `<td class="${cls}" data-l="${e(k.label)}">${html}</td>`;
  };
  if (!r.satirlar.length) return `<div class="empty">${icon('list')}<div>${e(bos)}</div></div>`;
  return `<div class="tbl-wrap"><table class="tbl cards">
    <thead><tr>${kol.map((k) => `<th class="${sag(k) ? 'r' : ''}">${e(k.label)}</th>`).join('')}${ekKolon ? '<th></th>' : ''}</tr></thead>
    <tbody>${r.satirlar.map((s, idx) => `<tr class="${onRow ? 'click' : ''} ${idx >= SAYFA ? 'fazla' : ''}" data-i="${idx}">${kol.map((k, i) => td(k, i, s[k.key], s)).join('')}${ekKolon ? `<td class="act r">${ekKolon(s)}</td>` : ''}</tr>`).join('')}</tbody>
    ${r.toplam ? `<tfoot><tr>${kol.map((k, i) => {
      const v = r.toplam[k.key];
      if (i === 0 && v === undefined) return '<td>TOPLAM</td>';
      return `<td class="${sag(k) ? 'r' : ''} ${i === amtIdx ? 'amt-col' : ''}" ${v !== undefined && v !== '' ? `data-l="${e(k.label)}"` : ''}>${v === undefined ? '' : hucre(k, v)}</td>`;
    }).join('')}${ekKolon ? '<td></td>' : ''}</tr></tfoot>` : ''}
  </table>${r.satirlar.length > SAYFA ? `<button type="button" class="btn ghost block daha-fazla" data-daha>Daha fazla göster (${r.satirlar.length - SAYFA})</button>` : ''}</div>`;
}

// Uzun listelerde ilk SAYFA satır gösterilir; "Daha fazla göster" sıradakileri açar
const SAYFA = 200;
document.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-daha]');
  if (!b) return;
  const gizli = [...b.parentElement.querySelectorAll('tbody tr.fazla')];
  gizli.slice(0, SAYFA).forEach((tr) => tr.classList.remove('fazla'));
  const kalan = gizli.length - SAYFA;
  if (kalan > 0) b.textContent = `Daha fazla göster (${kalan})`;
  else b.remove();
});

export function tabloBagla(root, satirlar, onRow) {
  root.querySelectorAll('tr.click').forEach((tr) => {
    tr.addEventListener('click', (ev) => {
      if (ev.target.closest('a, button')) return;
      onRow(satirlar[Number(tr.dataset.i)], ev);
    });
  });
}

// ---------- Otomatik tamamlama ----------
/**
 * Bir kapsayıcıyı arama yapılabilir seçim kutusuna çevirir.
 * ara(q) → Promise<[{ id, baslik, alt, sag, veri }]>
 */
export function autocomplete(kap, { ara, placeholder = 'Ara...', secili = null, onSec, yeni }) {
  let sec = secili;
  const ciz = () => {
    if (sec) {
      kap.innerHTML = `<div class="ac-sel"><div class="grow"><div class="t">${e(sec.baslik)}</div><div class="small muted">${e(sec.alt || '')}${sec.sag ? ` · ${sec.sag}` : ''}</div></div>
        <button type="button" class="btn sm ghost" data-deg>Değiştir</button></div>`;
      $('[data-deg]', kap).addEventListener('click', () => { sec = null; ciz(); onSec?.(null); $('input', kap)?.focus(); });
      return;
    }
    kap.innerHTML = `<div class="ac"><input type="search" placeholder="${e(placeholder)}" autocomplete="off"><div class="ac-list hidden"></div></div>`;
    const inp = $('input', kap);
    const list = $('.ac-list', kap);
    let items = [];
    let aktif = 0;
    const goster = () => {
      const html = items.map((it, i) => `<div class="ac-item ${i === aktif ? 'on' : ''}" data-i="${i}"><div><div>${e(it.baslik)}</div>${it.alt ? `<div class="s">${e(it.alt)}</div>` : ''}</div>${it.sag ? `<div class="s">${it.sag}</div>` : ''}</div>`).join('');
      const yeniHtml = yeni && inp.value.trim() ? `<div class="ac-item" data-yeni><div>${icon('plus')} "<b>${e(inp.value.trim())}</b>" ekle</div></div>` : '';
      list.innerHTML = html + yeniHtml || '<div class="ac-item s">Sonuç yok</div>';
      list.classList.toggle('hidden', !html && !yeniHtml && !inp.value);
    };
    const secim = (it) => { sec = it; ciz(); onSec?.(it); };
    let sira = 0;
    const calis = debounce(async () => {
      const no = ++sira;
      const q = inp.value.trim();
      const sonuc = await ara(q);
      if (no !== sira || q !== inp.value.trim()) return; // eski aramanın sonucu
      items = sonuc;
      aktif = 0;
      goster();
    }, 180);
    inp.addEventListener('input', () => { items = []; list.classList.add('hidden'); calis(); });
    inp.addEventListener('focus', calis);
    inp.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowDown') { aktif = Math.min(items.length - 1, aktif + 1); goster(); ev.preventDefault(); }
      if (ev.key === 'ArrowUp') { aktif = Math.max(0, aktif - 1); goster(); ev.preventDefault(); }
      if (ev.key === 'Enter') { ev.preventDefault(); if (items[aktif]) secim(items[aktif]); }
      if (ev.key === 'Escape') list.classList.add('hidden');
    });
    list.addEventListener('mousedown', (ev) => {
      ev.preventDefault();
      const it = ev.target.closest('.ac-item');
      if (!it) return;
      if (it.hasAttribute('data-yeni')) {
        yeni(inp.value.trim(), secim);
        return;
      }
      if (it.dataset.i !== undefined) secim(items[Number(it.dataset.i)]);
    });
    inp.addEventListener('blur', () => setTimeout(() => list.classList.add('hidden'), 150));
  };
  ciz();
  return { deger: () => sec, ayarla: (v) => { sec = v; ciz(); } };
}

// ---------- Yazdırma ----------
export function yazdir(html) {
  const el = $('#print-area');
  el.innerHTML = `<div class="pr">${html}</div>`;
  setTimeout(() => {
    window.print();
  }, 50);
}

export function indir(url) {
  const a = document.createElement('a');
  a.href = url;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();

// ---------- Tema ----------
export function temaUygula() {
  let t = null;
  try { t = localStorage.getItem('tema'); } catch { /* yok */ }
  if (t) document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
export function temaDegistir() {
  const koyu = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === 'dark'
    : window.matchMedia('(prefers-color-scheme: dark)').matches;
  try { localStorage.setItem('tema', koyu ? 'light' : 'dark'); } catch { /* yok */ }
  temaUygula();
}

// ---------- Dokunma efekti ----------
document.addEventListener('pointerdown', (ev) => {
  const el = ev.target.closest('.btn, .pay-methods button, .dropdown button, .cmd');
  if (!el || el.disabled) return;
  const r = el.getBoundingClientRect();
  const boyut = Math.max(r.width, r.height);
  const d = document.createElement('span');
  d.className = 'ripple';
  d.style.cssText = `width:${boyut}px;height:${boyut}px;left:${ev.clientX - r.left - boyut / 2}px;top:${ev.clientY - r.top - boyut / 2}px`;
  el.appendChild(d);
  setTimeout(() => d.remove(), 600);
});
