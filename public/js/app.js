import { get, post, yetkisiz } from './api.js';
import { $, $$, e, icon, toast, debounce, temaUygula, menu } from './ui.js';
import * as dashboard from './pages/dashboard.js';
import * as cariler from './pages/cariler.js';
import * as odeme from './pages/odeme.js';
import * as islemler from './pages/islemler.js';
import * as kasa from './pages/kasa.js';
import * as cekler from './pages/cekler.js';
import * as stok from './pages/stok.js';
import * as fatura from './pages/fatura.js';
import * as raporlar from './pages/raporlar.js';
import * as ayarlar from './pages/ayarlar.js';
import { YENI, aksiyon } from './aksiyon.js';

const ROUTES = [
  [/^\/?$/, dashboard.sayfa, 'home'],
  [/^\/cariler$/, cariler.liste, (q) => (q.tip === 'tedarikci' ? 'tedarikci' : 'musteri')],
  [/^\/cari\/(\d+)$/, cariler.detay, 'cariler'],
  [/^\/odeme$/, odeme.sayfa, 'odeme'],
  [/^\/islemler$/, islemler.liste, 'islemler'],
  [/^\/islem\/(\d+)$/, islemler.detay, 'islemler'],
  [/^\/kasa$/, kasa.liste, 'kasa'],
  [/^\/hesap\/(\d+)$/, kasa.detay, 'kasa'],
  [/^\/cekler$/, cekler.liste, 'cekler'],
  [/^\/cek\/(\d+)$/, cekler.detay, 'cekler'],
  [/^\/urunler$/, stok.liste, 'urunler'],
  [/^\/urun\/(\d+)$/, stok.detay, 'urunler'],
  [/^\/faturalar$/, fatura.liste, (q) => (q.tur === 'alis' ? 'alis' : 'satis')],
  [/^\/fatura\/yeni$/, fatura.form, 'faturalar'],
  [/^\/fatura\/(\d+)$/, fatura.goster, 'faturalar'],
  [/^\/fatura\/(\d+)\/duzenle$/, fatura.form, 'faturalar'],
  [/^\/raporlar$/, raporlar.liste, 'raporlar'],
  [/^\/rapor\/(\w+)$/, raporlar.rapor, 'raporlar'],
  [/^\/ayarlar$/, ayarlar.sayfa, 'ayarlar'],
];

const NAV = [
  ['home', '#/', 'home', 'Güncel Durum'],
  ['sep', 'Satışlar'],
  ['musteri', '#/cariler?tip=musteri', 'users', 'Müşteriler'],
  ['satis', '#/faturalar?tur=satis', 'invoice', 'Satışlar'],
  ['sep', 'Giderler'],
  ['tedarikci', '#/cariler?tip=tedarikci', 'users', 'Tedarikçiler'],
  ['alis', '#/faturalar?tur=alis', 'invoice', 'Alış Faturaları'],
  ['sep', 'Finans'],
  ['kasa', '#/kasa', 'wallet', 'Kasa ve Bankalar'],
  ['cekler', '#/cekler', 'cheque', 'Çek ve Senetler'],
  ['islemler', '#/islemler', 'list', 'Hareketler'],
  ['sep', 'Stok'],
  ['urunler', '#/urunler', 'box', 'Ürünler'],
  ['sep', ''],
  ['raporlar', '#/raporlar', 'chart', 'Raporlar'],
  ['ayarlar', '#/ayarlar', 'settings', 'Ayarlar'],
];

let firmaAdi = '';

temaUygula();

// ---------- Giriş ----------
function girisEkrani(kurulu) {
  $('#app').innerHTML = `<div class="auth"><form class="card" id="auth-form">
    <div class="brand"><div class="logo">₺</div><div>Cari Takip</div></div>
    ${kurulu ? '' : `<label class="f" style="margin-bottom:12px"><span>Firma adı</span><input name="firma_unvan" autocomplete="organization"></label>`}
    <label class="f" style="margin-bottom:12px"><span>Şifre</span>
      <input name="sifre" type="password" autocomplete="${kurulu ? 'current-password' : 'new-password'}" required autofocus></label>
    ${kurulu ? '' : '<label class="f" style="margin-bottom:12px"><span>Şifre tekrar</span><input name="sifre2" type="password" autocomplete="new-password" required></label>'}
    <button class="btn primary block lg" type="submit">Giriş</button>
  </form></div>`;
  $('#auth-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const btn = $('button', f);
    try {
      btn.disabled = true;
      if (kurulu) await post('/auth/giris', { sifre: f.sifre.value });
      else {
        if (f.sifre.value !== f.sifre2.value) throw new Error('Şifreler aynı değil');
        await post('/auth/kurulum', { sifre: f.sifre.value, firma_unvan: f.firma_unvan.value.trim() });
      }
      baslat();
    } catch (err) {
      toast(err.message, 'err');
      btn.disabled = false;
    }
  });
}

yetkisiz(() => girisEkrani(true));

// ---------- Kabuk ----------
function kabuk() {
  $('#app').innerHTML = `<div class="layout">
    <aside class="sidebar" id="sidebar">
      <div class="brand"><div class="logo">₺</div><div>Cari Takip<small>${e(firmaAdi)}</small></div></div>
      <nav class="nav"><a href="#" class="btn green satis-btn" data-aksiyon="satis">${icon('cash')} Satış Yap <span class="kbd">F2</span></a>${NAV.map((n) => (n[0] === 'sep'
        ? `<div class="cap">${e(n[1])}</div>`
        : `<a href="${n[1]}" data-nav="${n[0]}">${icon(n[2])}<span>${e(n[3])}</span></a>`)).join('')}
        <div class="sep"></div>
        <a href="#" data-cikis>${icon('logout')}<span>Çıkış</span></a>
      </nav>
    </aside>
    <div class="main">
      <header class="topbar">
        <button class="btn ghost icon back" id="menu-btn" aria-label="Menü">${icon('menu')}</button>
        <a class="btn ghost icon hidden" id="geri-btn" aria-label="Geri">${icon('back')}</a>
        <div class="title" id="page-title"></div>
        <div class="search-wrap" id="search-wrap">${icon('search')}<input type="search" id="global-search" placeholder="Ara" autocomplete="off"><div class="search-results hidden" id="search-results"></div></div>
        <button class="btn ghost icon mobile-only" id="search-btn" aria-label="Ara">${icon('search')}</button>
        <button class="btn primary desk-only" id="yeni-btn">${icon('plus')} Yeni</button>
      </header>
      <main class="content" id="content"></main>
    </div>
    <nav class="bottom-nav">
      <a href="#/" data-nav="home">${icon('home')}<span>Ana Sayfa</span></a>
      <a href="#/cariler?tip=musteri" data-nav="musteri">${icon('users')}<span>Müşteriler</span></a>
      <button class="fab" id="fab" aria-label="Yeni işlem"><span class="circle">${icon('plus')}</span></button>
      <a href="#/kasa" data-nav="kasa">${icon('wallet')}<span>Kasa</span></a>
      <button id="more-btn">${icon('menu')}<span>Menü</span></button>
    </nav>
  </div>`;

  const sb = $('#sidebar');
  const menuAc = () => {
    sb.classList.add('open');
    const s = document.createElement('div');
    s.className = 'scrim';
    s.addEventListener('click', menuKapat);
    document.body.appendChild(s);
  };
  const menuKapat = () => { sb.classList.remove('open'); $('.scrim')?.remove(); };
  $('#menu-btn').addEventListener('click', menuAc);
  $('#more-btn').addEventListener('click', menuAc);
  sb.addEventListener('click', (ev) => { if (ev.target.closest('a')) menuKapat(); });
  $('[data-cikis]').addEventListener('click', async (ev) => {
    ev.preventDefault();
    await post('/auth/cikis');
    girisEkrani(true);
  });
  const yeniMenu = (ev) => menu('Yeni', YENI.map(([k, i, l]) => [l, i, () => aksiyon(k, {}, yonlendir)]), ev.currentTarget);
  $('#fab').addEventListener('click', yeniMenu);
  $('#yeni-btn').addEventListener('click', yeniMenu);
  $('#search-btn').addEventListener('click', () => {
    $('#search-wrap').classList.toggle('open');
    $('#global-search').focus();
  });
  aramaKur();
}

function aramaKur() {
  const inp = $('#global-search');
  const box = $('#search-results');
  const TIP = { cari: ['user', '#/cari/', 'Cari'], urun: ['box', '#/urun/', 'Ürün'], fatura: ['invoice', '#/fatura/', 'Fatura'], cek: ['cheque', '#/cek/', 'Çek/Senet'] };
  const ara = debounce(async () => {
    const q = inp.value.trim();
    if (q.length < 2) { box.classList.add('hidden'); return; }
    const r = await get('/ara?q=' + encodeURIComponent(q)).catch(() => []);
    box.innerHTML = r.length
      ? `<ul class="list">${r.map((x) => `<li class="click" data-href="${TIP[x.tip][1]}${x.id}"><span class="ico">${icon(TIP[x.tip][0])}</span><div class="grow"><div class="t">${e(x.baslik)}</div><div class="small muted">${TIP[x.tip][2]} · ${e(x.alt)}</div></div></li>`).join('')}</ul>`
      : '<div class="empty">Sonuç bulunamadı</div>';
    box.classList.remove('hidden');
  }, 200);
  inp.addEventListener('input', ara);
  inp.addEventListener('focus', ara);
  inp.addEventListener('blur', () => setTimeout(() => box.classList.add('hidden'), 200));
  box.addEventListener('mousedown', (ev) => {
    const li = ev.target.closest('[data-href]');
    if (!li) return;
    location.hash = li.dataset.href;
    inp.value = '';
    box.classList.add('hidden');
    $('#search-wrap').classList.remove('open');
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'F2' && !document.querySelector('.satis-modal')) {
      ev.preventDefault();
      aksiyon('satis', {}, yonlendir);
    }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') {
      ev.preventDefault();
      $('#search-wrap').classList.add('open');
      inp.focus();
    }
  });
}

// ---------- Yönlendirme ----------
let aktifSayfa = 0;
async function yonlendir(ev) {
  const [yol, sorgu = ''] = location.hash.slice(1).split('?');
  const query = Object.fromEntries(new URLSearchParams(sorgu));
  const content = $('#content');
  if (!content) return;
  // Sayfa değişince açık pencereler kapanır; kayıt sonrası yenilemede açık kalır (ör. art arda satış)
  if (ev instanceof Event) $$('.modal-bg').forEach((m) => m.remove());
  $('#search-wrap')?.classList.remove('open');
  for (const [re, fn, navTanim] of ROUTES) {
    const m = (yol || '/').match(re);
    if (!m) continue;
    const nav = typeof navTanim === 'function' ? navTanim(query) : navTanim;
    $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === nav));
    const no = ++aktifSayfa;
    content.innerHTML = '<div class="spin"></div>';
    baslik('');
    window.scrollTo(0, 0);
    const ctx = {
      el: content, params: m.slice(1), query, baslik,
      guncel: () => no === aktifSayfa,
      yenile: () => yonlendir(),
    };
    try {
      await fn(ctx);
    } catch (err) {
      if (no !== aktifSayfa) return;
      content.innerHTML = `<div class="card empty">${icon('alert')}<div>${e(err.message)}</div><br><a class="btn" href="#/">Ana sayfaya dön</a></div>`;
    }
    return;
  }
  content.innerHTML = '<div class="card empty">Sayfa bulunamadı</div>';
}

/** Sayfa başlığı ve (mobilde) geri butonu */
function baslik(t, geri) {
  $('#page-title').textContent = t;
  document.title = t ? `${t} · Cari Takip` : 'Cari Takip';
  const g = $('#geri-btn');
  const m = $('#menu-btn');
  if (geri) {
    g.href = geri;
    g.classList.remove('hidden');
    m.classList.add('hidden');
  } else {
    g.classList.add('hidden');
    m.classList.remove('hidden');
  }
}

async function baslat() {
  const d = await get('/auth/durum').catch(() => null);
  if (!d) {
    $('#app').innerHTML = '<div class="auth"><div class="card empty">Sunucuya bağlanılamadı. Sayfayı yenileyin.</div></div>';
    return;
  }
  if (!d.girisli) return girisEkrani(d.kurulu);
  firmaAdi = (await get('/ayarlar').catch(() => ({}))).firma_unvan || '';
  kabuk();
  yonlendir();
}

window.addEventListener('hashchange', yonlendir);

// data-aksiyon="tahsilat" gibi düğmeler ilgili pencereyi açar
document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-aksiyon]');
  if (!el) return;
  ev.preventDefault();
  aksiyon(el.dataset.aksiyon, el.dataset, yonlendir);
});
baslat();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
