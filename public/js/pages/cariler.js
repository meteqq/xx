import { get, post, put, del } from '../api.js';
import { e, $, $$, icon, tl, tarih, bakiye, toast, formModal, onayla, menu, tablo, tabloBagla, autocomplete, debounce, qs, indir, bugun } from '../ui.js';
import { CARI_TIP, DOVIZ, CEK_DURUM } from '../sabitler.js';
import { ekstreYazdir } from '../yazdir.js';

// ---------- Cari formu (başka sayfalardan da kullanılır) ----------
export async function cariFormu(cari = null, { unvan, tip, onKaydet } = {}) {
  const yeni = !cari;
  const kod = yeni ? (await get('/cariler/yeni-kod')).kod : cari.kod;
  const alanlar = [
    { name: 'unvan', label: 'Ad / Ünvan', required: true, full: true },
    { name: 'telefon', label: 'Telefon', type: 'tel' },
    { name: 'tip', label: 'Tip', type: 'select', options: Object.entries(CARI_TIP) },
    ...(yeni ? [
      { name: 'acilis_tutar', label: 'Açılış bakiyesi', type: 'money' },
      { name: 'acilis_yon', label: 'Bakiye yönü', type: 'select', options: [['borc', 'Borçlu'], ['alacak', 'Alacaklı']] },
    ] : []),
    { name: 'yetkili', label: 'Yetkili', ek: true },
    { name: 'eposta', label: 'E-posta', type: 'email', ek: true },
    { name: 'telefon2', label: 'Telefon 2', type: 'tel', ek: true },
    { name: 'adres', label: 'Adres', type: 'textarea', full: true, ek: true },
    { name: 'il', label: 'İl', ek: true },
    { name: 'ilce', label: 'İlçe', ek: true },
    { name: 'vergi_dairesi', label: 'Vergi dairesi', ek: true },
    { name: 'vergi_no', label: 'Vergi no', attrs: 'inputmode="numeric"', ek: true },
    { name: 'tc_no', label: 'TC kimlik no', attrs: 'inputmode="numeric" maxlength="11"', ek: true },
    { name: 'iban', label: 'IBAN', ek: true },
    { name: 'kod', label: 'Cari kodu', ek: true },
    { name: 'grup', label: 'Grup', ek: true },
    { name: 'risk_limiti', label: 'Risk limiti', type: 'money', ek: true },
    { name: 'vade_gun', label: 'Vade (gün)', type: 'number', ek: true },
    { name: 'iskonto', label: 'İskonto %', type: 'number', ek: true },
    { name: 'doviz', label: 'Para birimi', type: 'select', options: DOVIZ, ek: true },
    { name: 'notlar', label: 'Not', type: 'textarea', full: true, ek: true },
    ...(yeni ? [] : [{ name: 'aktif', label: 'Aktif', type: 'check', ek: true }]),
  ];
  return formModal({
    title: yeni ? (tip === 'tedarikci' ? 'Yeni Tedarikçi' : 'Yeni Müşteri') : 'Düzenle',
    alanlar,
    degerler: { tip: tip || 'musteri', doviz: 'TRY', vade_gun: 0, iskonto: 0, ...(cari || {}), kod, unvan: cari?.unvan || unvan || '' },
    onSubmit: async (d) => {
      const { acilis_tutar, acilis_yon, ...v } = d;
      v.vade_gun = v.vade_gun || 0;
      v.iskonto = v.iskonto || 0;
      if (yeni) {
        if (acilis_tutar) v.acilis = { tutar: acilis_tutar, yon: acilis_yon };
        const { id } = await post('/cariler', v);
        toast('Cari kaydedildi', 'ok');
        onKaydet ? onKaydet({ id, ...v }) : (location.hash = `#/cari/${id}`);
      } else {
        await put(`/cariler/${cari.id}`, v);
        toast('Cari güncellendi', 'ok');
        onKaydet?.({ ...cari, ...v });
      }
    },
  });
}

/** Cari seçim kutusu (otomatik tamamlama + yeni cari ekleme) */
export function cariSecici(kap, { secili, onSec, tip } = {}) {
  const ac = autocomplete(kap, {
    placeholder: 'Cari ara',
    secili: secili ? cariItem(secili) : null,
    ara: async (q) => (await get('/cariler?' + qs({ q, tip }))).slice(0, 30).map(cariItem),
    onSec,
    yeni: (unvan, sec) => cariFormu(null, { unvan, onKaydet: (c) => sec(cariItem({ ...c, bakiye: 0 })) }),
  });
  return ac;
}
function cariItem(c) {
  return { id: c.id, baslik: c.unvan, alt: [c.kod, c.telefon].filter(Boolean).join(' · '), sag: c.bakiye !== undefined ? bakiye(c.bakiye, c.doviz) : '', veri: c };
}

// ---------- Liste ----------
export async function liste(ctx) {
  const q = ctx.query;
  const tip = q.tip === 'tedarikci' ? 'tedarikci' : 'musteri';
  const baslik = tip === 'tedarikci' ? 'Tedarikçiler' : 'Müşteriler';
  ctx.baslik(baslik);
  ctx.el.innerHTML = `
    <div class="page-h"><h1>${baslik}</h1><div class="actions">
      <button class="btn primary" data-aksiyon="cari-${tip}">${icon('plus')} ${tip === 'tedarikci' ? 'Yeni Tedarikçi' : 'Yeni Müşteri'}</button></div></div>
    <div class="toolbar">
      <input class="grow" type="search" id="q" placeholder="Ara" value="${e(q.q || '')}">
      <select id="filtre"><option value="">Tümü</option><option value="borclu">Borçlular</option><option value="alacakli">Alacaklılar</option><option value="pasif">Pasifler</option></select>
    </div>
    <div class="card" id="liste" style="margin-top:14px"><div class="spin"></div></div>`;
  if (q.durum) $('#filtre').value = q.durum;
  const yukle = async () => {
    const f = $('#filtre').value;
    const rows = await get('/cariler?' + qs({
      q: $('#q').value,
      tip,
      durum: ['borclu', 'alacakli'].includes(f) ? f : '',
      aktif: f === 'pasif' ? '0' : '',
    }));
    if (!ctx.guncel()) return;
    $('#liste').innerHTML = tablo({
      kolonlar: [
        { key: 'unvan', label: 'Ad / Ünvan', main: true },
        { key: 'telefon', label: 'Telefon' },
        { key: 'bakiye', label: 'Bakiye', type: 'bakiye' },
      ],
      satirlar: rows,
    }, { onRow: true, bos: 'Kayıt yok' });
    tabloBagla($('#liste'), rows, (s) => { location.hash = `#/cari/${s.id}`; });
  };
  $('#q').addEventListener('input', debounce(yukle));
  $('#filtre').addEventListener('change', yukle);
  await yukle();
  if (q.yeni) cariFormu(null, { tip });
}

// ---------- Detay ----------
export async function detay(ctx) {
  const id = ctx.params[0];
  const c = await get(`/cariler/${id}`);
  if (!ctx.guncel()) return;
  ctx.baslik(c.unvan, `#/cariler?tip=${c.tip === 'tedarikci' ? 'tedarikci' : 'musteri'}`);
  const tel = (c.telefon || '').replace(/\D/g, '');
  const wa = tel ? (tel.startsWith('90') ? tel : tel.startsWith('0') ? '9' + tel : '90' + tel) : '';
  const riskAsim = c.risk_limiti > 0 && c.bakiye > c.risk_limiti;

  ctx.el.innerHTML = `
    <div class="card"><div class="card-b">
      <div class="balance-hero">
        <div style="min-width:0">
          <div class="muted small">${CARI_TIP[c.tip]}${c.aktif ? '' : ' · Pasif'}</div>
          <h1 style="margin:4px 0 8px">${e(c.unvan)}</h1>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${tel ? `<a class="btn sm" href="tel:${e(c.telefon)}">${icon('phone')} Ara</a>` : ''}
            ${wa ? `<a class="btn sm" target="_blank" rel="noopener" href="https://wa.me/${wa}?text=${encodeURIComponent(`Sayın ${c.unvan}, güncel bakiyeniz ${tl(Math.abs(c.bakiye), c.doviz)} ${c.bakiye > 0 ? 'borç' : 'alacak'} olarak görünmektedir.`)}">${icon('whatsapp')} WhatsApp</a>` : ''}
            ${c.eposta ? `<a class="btn sm" href="mailto:${e(c.eposta)}">${icon('mail')} E-posta</a>` : ''}
          </div>
        </div>
        <div class="right">
          <div class="big ${c.bakiye > 0 ? 'neg' : c.bakiye < 0 ? 'pos' : ''}">${tl(Math.abs(c.bakiye), c.doviz)}</div>
          <div class="small ${c.bakiye > 0 ? 'neg' : 'pos'}" style="font-weight:600">${c.bakiye > 0 ? 'Borçlu' : c.bakiye < 0 ? 'Alacaklı' : ''}${riskAsim ? ' · Risk limiti aşıldı' : ''}</div>
        </div>
      </div>
      <div class="btn-row" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:16px">
        <button class="btn primary" data-aksiyon="tahsilat" data-cari="${c.id}">${icon('in')} Tahsilat Ekle</button>
        <button class="btn" data-aksiyon="odeme" data-cari="${c.id}">${icon('out')} Ödeme Ekle</button>
        <button class="btn" data-aksiyon="fatura-${c.tip === 'tedarikci' ? 'alis' : 'satis'}" data-cari="${c.id}">${icon('invoice')} Fatura</button>
        <button class="btn" id="diger" aria-label="Diğer">${icon('dots')}</button>
      </div>
    </div></div>

    <div class="card" style="margin-top:16px"><div class="card-b">
      <div class="tabs"><a href="#" data-tab="hareket" class="on">Hareketler</a><a href="#" data-tab="fatura">Faturalar</a><a href="#" data-tab="cek">Çek / Senet</a><a href="#" data-tab="bilgi">Bilgiler</a></div>
      <div id="tab"></div>
    </div></div>`;

  const tabs = {
    hareket: () => hareketTab(c),
    fatura: () => faturaTab(c),
    cek: () => cekTab(c),
    bilgi: () => bilgiTab(c),
  };
  $$('[data-tab]').forEach((a) => a.addEventListener('click', (ev) => {
    ev.preventDefault();
    $$('[data-tab]').forEach((x) => x.classList.toggle('on', x === a));
    tabs[a.dataset.tab]();
  }));
  tabs.hareket();

  const dekont = () => formModal({
    title: 'Borç / Alacak Kaydı',
    alanlar: [
      { name: 'yon', label: 'Tür', type: 'select', options: [['borc', 'Borç'], ['alacak', 'Alacak']] },
      { name: 'tutar', label: 'Tutar', type: 'money', required: true },
      { name: 'aciklama', label: 'Açıklama', full: true },
      { name: 'tarih', label: 'Tarih', type: 'date', value: bugun(), ek: true },
      { name: 'vade', label: 'Vade', type: 'date', ek: true },
      { name: 'belge_no', label: 'Belge no', ek: true },
    ],
    onSubmit: async (d) => {
      await post(`/cariler/${c.id}/dekont`, d);
      toast('Kaydedildi', 'ok');
      ctx.yenile();
    },
  });
  const sil = async () => {
    if (!await onayla(`"${c.unvan}" silinsin mi?`, { ok: 'Sil', tehlikeli: true })) return;
    const r = await del(`/cariler/${c.id}`);
    toast(r.pasif ? 'Pasife alındı' : 'Silindi', 'ok');
    location.hash = `#/cariler?tip=${c.tip === 'tedarikci' ? 'tedarikci' : 'musteri'}`;
  };
  $('#diger').addEventListener('click', (ev) => menu('Diğer', [
    [c.tip === 'tedarikci' ? 'Satış faturası' : 'Alış faturası', 'invoice', () => { location.hash = `#/fatura/yeni?tur=${c.tip === 'tedarikci' ? 'satis' : 'alis'}&cari=${c.id}`; }],
    ['Borç / alacak kaydı', 'receipt', dekont],
    ['Düzenle', 'edit', () => cariFormu(c, { onKaydet: () => ctx.yenile() })],
    ['Sil', 'trash', sil, true],
  ], ev.currentTarget));;
}

async function hareketTab(c) {
  const tab = $('#tab');
  tab.innerHTML = `<div class="toolbar" style="margin-bottom:12px;justify-content:flex-end">
      <button class="btn sm" id="pr">${icon('print')} Yazdır</button>
      <button class="btn sm" id="xl">${icon('excel')} Excel</button>
    </div><div id="ekstre"><div class="spin"></div></div>`;
  const rapor = await get('/rapor/ekstre?' + qs({ cari_id: c.id }));
  const satirlar = [...rapor.satirlar].reverse();
  $('#ekstre').innerHTML = tablo({
    ...rapor,
    kolonlar: [
      { key: 'tarih', label: 'Tarih', type: 'date' },
      { key: 'aciklama', label: 'Açıklama', main: true, render: (v, s) => e(v || s.tur) },
      { key: 'borc', label: 'Borç', type: 'money' },
      { key: 'alacak', label: 'Alacak', type: 'money' },
      { key: 'bakiye', label: 'Bakiye', type: 'bakiye' },
    ],
    satirlar,
  }, { onRow: true, bos: 'Hareket yok' });
  tabloBagla($('#ekstre'), satirlar, (s) => {
    if (s.fatura_id) location.hash = `#/fatura/${s.fatura_id}`;
    else if (s.islem_id) location.hash = `#/islem/${s.islem_id}`;
  });
  $('#pr').addEventListener('click', () => ekstreYazdir(rapor));
  $('#xl').addEventListener('click', () => indir('/api/rapor/ekstre/excel?' + qs({ cari_id: c.id })));
}

async function faturaTab(c) {
  const rows = await get(`/faturalar?cari_id=${c.id}`);
  $('#tab').innerHTML = tablo({
    kolonlar: [
      { key: 'tarih', label: 'Tarih', type: 'date' }, { key: 'no', label: 'No', main: true }, { key: 'tur_ad', label: 'Tür' },
      { key: 'vade', label: 'Vade', type: 'date' }, { key: 'genel_toplam', label: 'Toplam', type: 'money' },
    ],
    satirlar: rows,
  }, { onRow: true, bos: 'Kayıt yok' });
  tabloBagla($('#tab'), rows, (s) => { location.hash = `#/fatura/${s.id}`; });
}

async function cekTab(c) {
  const rows = await get(`/cekler?cari_id=${c.id}`);
  $('#tab').innerHTML = tablo({
    kolonlar: [
      { key: 'vade', label: 'Vade', type: 'date' }, { key: 'tur_ad', label: 'Tür' }, { key: 'yon_ad', label: 'Yön' },
      { key: 'no', label: 'No', main: true }, { key: 'banka', label: 'Banka' },
      { key: 'durum', label: 'Durum', render: (v) => `<span class="badge ${CEK_DURUM[v][1]}">${CEK_DURUM[v][0]}</span>` },
      { key: 'tutar', label: 'Tutar', type: 'money' },
    ],
    satirlar: rows,
  }, { onRow: true, bos: 'Kayıt yok' });
  tabloBagla($('#tab'), rows, (s) => { location.hash = `#/cek/${s.id}`; });
}

function bilgiTab(c) {
  const s = (l, v) => (v ? `<dt>${l}</dt><dd>${e(v)}</dd>` : '');
  $('#tab').innerHTML = `<div class="grid g2"><dl class="kv">
      ${s('Yetkili', c.yetkili)}${s('Telefon', c.telefon)}${s('Telefon 2', c.telefon2)}${s('E-posta', c.eposta)}
      ${s('Adres', [c.adres, c.ilce, c.il].filter(Boolean).join(' '))}
    </dl><dl class="kv">
      ${s('Vergi dairesi', c.vergi_dairesi)}${s('Vergi no', c.vergi_no)}${s('TC no', c.tc_no)}${s('IBAN', c.iban)}
      ${s('Risk limiti', c.risk_limiti ? tl(c.risk_limiti, c.doviz) : '')}${s('Vade', c.vade_gun ? c.vade_gun + ' gün' : '')}
      ${s('İskonto', c.iskonto ? '%' + c.iskonto : '')}${s('Para birimi', c.doviz !== 'TRY' ? c.doviz : '')}
      ${s('Not', c.notlar)}
    </dl></div>`;
}
