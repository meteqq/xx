import { get, post, put, del } from '../api.js';
import { e, $, $$, icon, tl, tarih, bakiye, toast, formModal, onayla, tablo, tabloBagla, autocomplete, debounce, qs, indir, yilBasi, bugun } from '../ui.js';
import { CARI_TIP, DOVIZ, CEK_DURUM } from '../sabitler.js';
import { ekstreYazdir } from '../yazdir.js';

// ---------- Cari formu (başka sayfalardan da kullanılır) ----------
export async function cariFormu(cari = null, { unvan, onKaydet } = {}) {
  const yeni = !cari;
  const kod = yeni ? (await get('/cariler/yeni-kod')).kod : cari.kod;
  const alanlar = [
    { name: 'unvan', label: 'Ünvan / Ad Soyad', required: true, full: true },
    { name: 'tip', label: 'Cari tipi', type: 'select', options: Object.entries(CARI_TIP) },
    { name: 'kod', label: 'Cari kodu' },
    { name: 'grup', label: 'Grup', placeholder: 'Örn: Bayi, Perakende' },
    { type: 'section', label: 'İletişim' },
    { name: 'yetkili', label: 'Yetkili kişi' },
    { name: 'telefon', label: 'Telefon', type: 'tel' },
    { name: 'telefon2', label: 'Telefon 2', type: 'tel' },
    { name: 'eposta', label: 'E-posta', type: 'email' },
    { name: 'adres', label: 'Adres', type: 'textarea', full: true },
    { name: 'il', label: 'İl' },
    { name: 'ilce', label: 'İlçe' },
    { type: 'section', label: 'Vergi & Banka' },
    { name: 'vergi_dairesi', label: 'Vergi dairesi' },
    { name: 'vergi_no', label: 'Vergi no', attrs: 'inputmode="numeric"' },
    { name: 'tc_no', label: 'TC kimlik no', attrs: 'inputmode="numeric" maxlength="11"' },
    { name: 'iban', label: 'IBAN' },
    { type: 'section', label: 'Ticari Koşullar' },
    { name: 'risk_limiti', label: 'Risk limiti (0 = sınırsız)', type: 'money' },
    { name: 'vade_gun', label: 'Vade (gün)', type: 'number' },
    { name: 'iskonto', label: 'Varsayılan iskonto %', type: 'number' },
    { name: 'doviz', label: 'Para birimi', type: 'select', options: DOVIZ },
    ...(yeni ? [
      { type: 'section', label: 'Açılış Bakiyesi (varsa)' },
      { name: 'acilis_tutar', label: 'Tutar', type: 'money' },
      { name: 'acilis_yon', label: 'Yön', type: 'select', options: [['borc', 'Borçlu (bize borcu var)'], ['alacak', 'Alacaklı (bizim borcumuz var)']] },
    ] : [{ name: 'aktif', label: 'Aktif', type: 'check' }]),
    { name: 'notlar', label: 'Notlar', type: 'textarea', full: true },
  ];
  return formModal({
    title: yeni ? 'Yeni Cari' : 'Cari Düzenle',
    wide: true,
    alanlar,
    degerler: { tip: 'musteri', doviz: 'TRY', vade_gun: 0, iskonto: 0, ...(cari || {}), kod, unvan: cari?.unvan || unvan || '' },
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
    placeholder: 'Cari adı, kodu veya telefonu ile arayın...',
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
  ctx.baslik('Cariler');
  const q = ctx.query;
  ctx.el.innerHTML = `
    <div class="page-h"><h1>Cariler</h1><div class="actions">
      <a class="btn" href="#/rapor/bakiye">${icon('chart')} Bakiye Listesi</a>
      <button class="btn primary" id="yeni">${icon('plus')} Yeni Cari</button></div></div>
    <div class="toolbar">
      <input class="grow" type="search" id="q" placeholder="Ünvan, kod, telefon, vergi no ara..." value="${e(q.q || '')}">
      <select id="tip"><option value="">Tüm tipler</option><option value="musteri">Müşteriler</option><option value="tedarikci">Tedarikçiler</option></select>
      <select id="durum"><option value="">Tüm bakiyeler</option><option value="borclu">Borçlu olanlar</option><option value="alacakli">Alacaklı olanlar</option><option value="risk">Risk limiti aşanlar</option></select>
      <select id="aktif"><option value="">Aktif</option><option value="0">Pasif</option><option value="hepsi">Tümü</option></select>
    </div>
    <div class="card" id="liste" style="margin-top:14px"><div class="spin"></div></div>`;
  if (q.durum) $('#durum').value = q.durum;
  const yukle = async () => {
    const rows = await get('/cariler?' + qs({ q: $('#q').value, tip: $('#tip').value, durum: $('#durum').value, aktif: $('#aktif').value }));
    if (!ctx.guncel()) return;
    const toplam = rows.reduce((a, r) => a + (r.doviz === 'TRY' ? r.bakiye : 0), 0);
    const r = {
      kolonlar: [
        { key: 'kod', label: 'Kod' },
        { key: 'unvan', label: 'Ünvan', main: true, render: (v, s) => `${e(v)}${s.aktif ? '' : ' <span class="badge">Pasif</span>'}` },
        { key: 'tip', label: 'Tip', render: (v) => CARI_TIP[v] },
        { key: 'telefon', label: 'Telefon' },
        { key: 'il', label: 'İl' },
        { key: 'son_islem', label: 'Son İşlem', type: 'date' },
        { key: 'bakiye', label: 'Bakiye', type: 'bakiye' },
      ],
      satirlar: rows,
      toplam: rows.length ? { bakiye: toplam } : null,
    };
    $('#liste').innerHTML = `<div class="card-h"><span class="muted small">${rows.length} cari</span></div>` + tablo(r, { onRow: true, bos: 'Cari bulunamadı. "Yeni Cari" ile ekleyebilirsiniz.' });
    tabloBagla($('#liste'), rows, (s) => { location.hash = `#/cari/${s.id}`; });
  };
  $('#q').addEventListener('input', debounce(yukle));
  ['tip', 'durum', 'aktif'].forEach((id) => $('#' + id).addEventListener('change', yukle));
  $('#yeni').addEventListener('click', () => cariFormu());
  await yukle();
  if (q.yeni) cariFormu();
}

// ---------- Detay ----------
export async function detay(ctx) {
  const id = ctx.params[0];
  const c = await get(`/cariler/${id}`);
  if (!ctx.guncel()) return;
  ctx.baslik(c.unvan, '#/cariler');
  const tel = (c.telefon || '').replace(/\D/g, '');
  const wa = tel ? (tel.startsWith('90') ? tel : tel.startsWith('0') ? '9' + tel : '90' + tel) : '';
  const riskAsim = c.risk_limiti > 0 && c.bakiye > c.risk_limiti;

  ctx.el.innerHTML = `
    <div class="card"><div class="card-b">
      <div class="balance-hero">
        <div style="min-width:0">
          <div class="muted small">${e(c.kod || '')} · ${CARI_TIP[c.tip]}${c.grup ? ' · ' + e(c.grup) : ''}${c.aktif ? '' : ' · <span class="badge">Pasif</span>'}</div>
          <h1 style="margin:4px 0 8px">${e(c.unvan)}</h1>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${tel ? `<a class="btn sm" href="tel:${e(c.telefon)}">${icon('phone')} Ara</a>` : ''}
            ${wa ? `<a class="btn sm" target="_blank" rel="noopener" href="https://wa.me/${wa}?text=${encodeURIComponent(`Sayın ${c.unvan}, güncel bakiyeniz ${tl(Math.abs(c.bakiye), c.doviz)} ${c.bakiye > 0 ? 'borç' : 'alacak'} olarak görünmektedir.`)}">${icon('whatsapp')} WhatsApp</a>` : ''}
            ${c.eposta ? `<a class="btn sm" href="mailto:${e(c.eposta)}">${icon('mail')} E-posta</a>` : ''}
          </div>
        </div>
        <div class="right">
          <div class="muted small">Güncel Bakiye</div>
          <div class="big ${c.bakiye > 0 ? 'neg' : c.bakiye < 0 ? 'pos' : ''}">${tl(Math.abs(c.bakiye), c.doviz)}</div>
          <div class="small ${c.bakiye > 0 ? 'neg' : 'pos'}" style="font-weight:600">${c.bakiye > 0 ? 'Borçlu — bize borcu var' : c.bakiye < 0 ? 'Alacaklı — bizim borcumuz var' : 'Hesap kapalı'}</div>
        </div>
      </div>
      ${riskAsim ? `<div class="alert red" style="margin-top:12px">${icon('alert')} Risk limiti aşıldı! Limit: ${tl(c.risk_limiti, c.doviz)}</div>` : ''}
      <div class="btn-row" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:16px">
        <a class="btn green" href="#/odeme?yon=tahsilat&cari=${c.id}">${icon('in')} Tahsilat Al</a>
        <a class="btn red" href="#/odeme?yon=odeme&cari=${c.id}">${icon('out')} Ödeme Yap</a>
        <a class="btn" href="#/fatura/yeni?tur=satis&cari=${c.id}">${icon('invoice')} Satış Faturası</a>
        <a class="btn" href="#/fatura/yeni?tur=alis&cari=${c.id}">${icon('invoice')} Alış Faturası</a>
        <button class="btn" id="dekont">${icon('receipt')} Borç/Alacak Dekontu</button>
        <button class="btn" id="duzenle">${icon('edit')} Düzenle</button>
        <button class="btn ghost danger-text" id="sil">${icon('trash')}</button>
      </div>
    </div></div>

    <div class="grid g4" style="margin-top:16px">
      <div class="card stat"><span class="lbl">Toplam Borç</span><span class="val">${tl(c.borc, c.doviz)}</span></div>
      <div class="card stat"><span class="lbl">Toplam Alacak</span><span class="val">${tl(c.alacak, c.doviz)}</span></div>
      <div class="card stat"><span class="lbl">Açık Çek/Senet</span><span class="val">${tl(c.cekler.tutar, c.doviz)}</span><span class="sub">${c.cekler.adet} adet</span></div>
      <div class="card stat"><span class="lbl">Son Tahsilat</span><span class="val">${c.son_tahsilat ? tl(c.son_tahsilat.alacak, c.doviz) : '-'}</span><span class="sub">${c.son_tahsilat ? tarih(c.son_tahsilat.tarih) : ''}</span></div>
    </div>

    <div class="card" style="margin-top:16px"><div class="card-b">
      <div class="tabs"><a href="#" data-tab="hareket" class="on">Hesap Hareketleri</a><a href="#" data-tab="fatura">Faturalar</a><a href="#" data-tab="cek">Çek / Senet</a><a href="#" data-tab="bilgi">Cari Bilgileri</a></div>
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

  $('#duzenle').addEventListener('click', () => cariFormu(c, { onKaydet: () => ctx.yenile() }));
  $('#sil').addEventListener('click', async () => {
    if (!await onayla(`"${c.unvan}" silinsin mi? Hareketi olan cariler silinmez, pasife alınır.`, { ok: 'Sil', tehlikeli: true })) return;
    const r = await del(`/cariler/${c.id}`);
    toast(r.pasif ? 'Cari hareketleri olduğu için pasife alındı' : 'Cari silindi', 'ok');
    location.hash = '#/cariler';
  });
  $('#dekont').addEventListener('click', () => formModal({
    title: 'Borç / Alacak Dekontu',
    alanlar: [
      { name: 'yon', label: 'İşlem', type: 'select', full: true, options: [['borc', 'Cariyi BORÇLANDIR (bakiye artar)'], ['alacak', 'Cariyi ALACAKLANDIR (bakiye azalır)']] },
      { name: 'tutar', label: 'Tutar', type: 'money', required: true },
      { name: 'tarih', label: 'Tarih', type: 'date', value: bugun() },
      { name: 'vade', label: 'Vade', type: 'date' },
      { name: 'belge_no', label: 'Belge no' },
      { name: 'aciklama', label: 'Açıklama', full: true, placeholder: 'Örn: Kur farkı, fiyat farkı, devir...' },
    ],
    onSubmit: async (d) => {
      await post(`/cariler/${c.id}/dekont`, d);
      toast('Dekont kaydedildi', 'ok');
      ctx.yenile();
    },
  }));
}

async function hareketTab(c) {
  const tab = $('#tab');
  tab.innerHTML = `<div class="toolbar" style="margin-bottom:12px">
      <input type="date" id="bas" value="${yilBasi()}"> <input type="date" id="bit" value="">
      <span class="grow"></span>
      <button class="btn sm" id="pr">${icon('print')} Ekstre Yazdır / PDF</button>
      <button class="btn sm" id="xl">${icon('excel')} Excel</button>
    </div><div id="ekstre"><div class="spin"></div></div>`;
  let rapor;
  const yukle = async () => {
    rapor = await get('/rapor/ekstre?' + qs({ cari_id: c.id, bas: $('#bas').value, bit: $('#bit').value }));
    const satirlar = [...rapor.satirlar].reverse();
    const kol = rapor.kolonlar.map((k) => (k.key === 'aciklama' ? { ...k, main: true, render: (v, s) => `${e(v || s.tur)}${s.odeme_sekli ? ` <span class="badge">${e(s.odeme_sekli)}</span>` : ''}` } : k.key === 'tur' ? { ...k, label: 'İşlem' } : k));
    $('#ekstre').innerHTML = tablo({ ...rapor, kolonlar: kol, satirlar }, { onRow: true, bos: 'Bu tarih aralığında hareket yok' });
    tabloBagla($('#ekstre'), satirlar, (s) => {
      if (s.fatura_id) location.hash = `#/fatura/${s.fatura_id}`;
      else if (s.islem_id) location.hash = `#/islem/${s.islem_id}`;
    });
  };
  $('#bas').addEventListener('change', yukle);
  $('#bit').addEventListener('change', yukle);
  $('#pr').addEventListener('click', () => ekstreYazdir(rapor));
  $('#xl').addEventListener('click', () => indir('/api/rapor/ekstre/excel?' + qs({ cari_id: c.id, bas: $('#bas').value, bit: $('#bit').value })));
  await yukle();
}

async function faturaTab(c) {
  const rows = await get(`/faturalar?cari_id=${c.id}`);
  $('#tab').innerHTML = tablo({
    kolonlar: [
      { key: 'tarih', label: 'Tarih', type: 'date' }, { key: 'no', label: 'No', main: true }, { key: 'tur_ad', label: 'Tür' },
      { key: 'vade', label: 'Vade', type: 'date' }, { key: 'genel_toplam', label: 'Toplam', type: 'money' },
    ],
    satirlar: rows,
  }, { onRow: true, bos: 'Fatura yok' });
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
  }, { onRow: true, bos: 'Çek / senet yok' });
  tabloBagla($('#tab'), rows, (s) => { location.hash = `#/cek/${s.id}`; });
}

function bilgiTab(c) {
  const s = (l, v) => (v ? `<dt>${l}</dt><dd>${e(v)}</dd>` : '');
  $('#tab').innerHTML = `<div class="grid g2"><dl class="kv">
      ${s('Yetkili', c.yetkili)}${s('Telefon', c.telefon)}${s('Telefon 2', c.telefon2)}${s('E-posta', c.eposta)}
      ${s('Adres', [c.adres, c.ilce, c.il].filter(Boolean).join(' '))}
    </dl><dl class="kv">
      ${s('Vergi dairesi', c.vergi_dairesi)}${s('Vergi no', c.vergi_no)}${s('TC no', c.tc_no)}${s('IBAN', c.iban)}
      <dt>Risk limiti</dt><dd>${c.risk_limiti ? tl(c.risk_limiti, c.doviz) : 'Sınırsız'}</dd>
      <dt>Vade</dt><dd>${c.vade_gun} gün</dd>${c.iskonto ? `<dt>İskonto</dt><dd>%${c.iskonto}</dd>` : ''}
      <dt>Para birimi</dt><dd>${c.doviz}</dd>
    </dl></div>${c.notlar ? `<div class="alert blue" style="margin-top:14px">${e(c.notlar)}</div>` : ''}`;
}
