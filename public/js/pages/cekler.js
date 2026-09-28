import { get, post, put, hesaplar } from '../api.js';
import { e, $, $$, icon, tl, tarih, bugun, toast, formModal, modal, tablo, tabloBagla, debounce, qs } from '../ui.js';
import { CEK_DURUM } from '../sabitler.js';
import { cariSecici } from './cariler.js';

const durumBadge = (d) => `<span class="badge ${CEK_DURUM[d][1]}">${CEK_DURUM[d][0]}</span>`;

export async function liste(ctx) {
  ctx.baslik('Çek / Senet');
  const q = ctx.query;
  const yon = q.yon ?? 'alinan';
  ctx.el.innerHTML = `
    <div class="page-h"><h1>Çek / Senet</h1><div class="actions">
      <a class="btn green" href="#/odeme?yon=tahsilat&sekil=cek">${icon('in')} Al</a>
      <a class="btn red" href="#/odeme?yon=odeme&sekil=cek">${icon('out')} Ver</a>
    </div></div>
    <div class="tabs">
      <a href="#/cekler?yon=alinan" class="${yon === 'alinan' ? 'on' : ''}">Alınan</a>
      <a href="#/cekler?yon=verilen" class="${yon === 'verilen' ? 'on' : ''}">Verilen</a>
      <a href="#/cekler?yon=" class="${yon === '' ? 'on' : ''}">Tümü</a>
    </div>
    <div class="toolbar">
      <input class="grow" type="search" id="q" placeholder="Ara">
      <select id="durum"><option value="acik">Bekleyenler</option><option value="">Tümü</option>
        ${Object.entries(CEK_DURUM).map(([k, [l]]) => `<option value="${k}">${l}</option>`).join('')}</select>
    </div>
    <div class="card" id="liste" style="margin-top:14px"><div class="spin"></div></div>`;
  if (q.durum !== undefined) $('#durum').value = q.durum;
  const yukle = async () => {
    const rows = await get('/cekler?' + qs({ yon, q: $('#q').value, durum: $('#durum').value }));
    if (!ctx.guncel()) return;
    const bekleyen = (r) => ['portfoy', 'tahsilde', 'verildi'].includes(r.durum);
    $('#liste').innerHTML = tablo({
      kolonlar: [
        { key: 'vade', label: 'Vade', render: (v, s) => `<span class="${bekleyen(s) && s.kalan_gun < 0 ? 'neg' : ''}">${tarih(v)}</span>` },
        { key: 'kesideci', label: 'Kimden / Kime', main: true, render: (v, s) => e(s.cari_unvan || v || '-') },
        { key: 'no', label: 'No', render: (v, s) => `${s.tur_ad} ${e(v || '')}` },
        { key: 'durum', label: 'Durum', render: (v) => durumBadge(v) },
        { key: 'tutar', label: 'Tutar', type: 'money' },
      ],
      satirlar: rows,
      toplam: rows.length ? { tutar: rows.reduce((a, r) => a + r.tutar, 0) } : null,
    }, { onRow: true, bos: 'Kayıt yok' });
    tabloBagla($('#liste'), rows, (s) => { location.hash = `#/cek/${s.id}`; });
  };
  $('#q').addEventListener('input', debounce(yukle));
  $('#durum').addEventListener('change', yukle);
  await yukle();
}

// Evrak durumuna göre yapılabilecek işlemler
const AKSIYONLAR = {
  alinan: {
    portfoy: ['tahsile_ver', 'tahsil', 'ciro', 'iade', 'karsiliksiz'],
    tahsilde: ['tahsil', 'portfoye_al', 'karsiliksiz'],
    ciro: ['karsiliksiz'],
  },
  verilen: { verildi: ['ode', 'geri_al'] },
};
const AKSIYON = {
  tahsile_ver: ['Bankaya Tahsile Ver', 'bank', ''],
  tahsil: ['Tahsil Edildi', 'check', 'green'],
  ciro: ['Ciro Et (Tedarikçiye Ver)', 'transfer', ''],
  iade: ['Müşteriye İade Et', 'undo', ''],
  karsiliksiz: ['Karşılıksız / Protestolu', 'alert', 'danger-text'],
  portfoye_al: ['Portföye Geri Al', 'undo', ''],
  ode: ['Ödendi', 'check', 'green'],
  geri_al: ['Tedarikçiden Geri Alındı', 'undo', ''],
};

export async function detay(ctx) {
  const c = await get(`/cekler/${ctx.params[0]}`);
  if (!ctx.guncel()) return;
  const ad = c.tur === 'cek' ? 'Çek' : 'Senet';
  ctx.baslik(`${ad} ${c.no || ''}`, '#/cekler');
  const kalan = Math.round((Date.parse(c.vade) - Date.parse(bugun())) / 864e5);
  const aksiyonlar = AKSIYONLAR[c.yon][c.durum] || [];
  ctx.el.innerHTML = `
    <div class="card"><div class="card-b"><div class="balance-hero">
      <div><div class="muted small">${c.yon === 'alinan' ? 'Alınan' : 'Verilen'} ${ad.toLocaleLowerCase('tr-TR')} · ${durumBadge(c.durum)}</div>
        <h1 style="margin:6px 0">${ad} No: ${e(c.no || '-')}</h1>
        <div class="small muted">Vade: <b>${tarih(c.vade)}</b> ${['portfoy', 'tahsilde', 'verildi'].includes(c.durum) ? `(${kalan < 0 ? `<span class="neg">${-kalan} gün geçti</span>` : kalan === 0 ? 'bugün' : kalan + ' gün kaldı'})` : ''}</div></div>
      <div class="right"><div class="muted small">Tutar</div><div class="big">${tl(c.tutar, c.doviz)}</div></div>
    </div>
    ${aksiyonlar.length ? `<div class="btn-row" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:16px">${aksiyonlar.map((a) => `<button class="btn ${AKSIYON[a][2]}" data-a="${a}">${icon(AKSIYON[a][1])} ${AKSIYON[a][0]}</button>`).join('')}
      <button class="btn ghost" id="duzenle">${icon('edit')} Düzenle</button></div>` : `<div style="margin-top:16px"><button class="btn ghost" id="duzenle">${icon('edit')} Düzenle</button></div>`}
    </div></div>
    <div class="grid g2" style="margin-top:16px">
      <div class="card"><div class="card-h"><h3>Evrak Bilgileri</h3></div><div class="card-b"><dl class="kv">
        <dt>${c.yon === 'alinan' ? 'Alındığı cari' : 'Verildiği cari'}</dt><dd>${c.cari_id ? `<a href="#/cari/${c.cari_id}">${e(c.cari_unvan)}</a>` : '-'}</dd>
        ${c.ciro_unvan ? `<dt>Ciro edilen</dt><dd><a href="#/cari/${c.ciro_cari_id}">${e(c.ciro_unvan)}</a></dd>` : ''}
        <dt>${c.tur === 'cek' ? 'Keşideci' : 'Borçlu'}</dt><dd>${e(c.kesideci || '-')}</dd>
        ${c.kefil ? `<dt>Kefil</dt><dd>${e(c.kefil)}</dd>` : ''}
        ${c.banka ? `<dt>Banka / Şube</dt><dd>${e(c.banka)} ${e(c.sube || '')}</dd>` : ''}
        ${c.hesap_no ? `<dt>Hesap no</dt><dd>${e(c.hesap_no)}</dd>` : ''}
        ${c.hesap_ad ? `<dt>İlgili hesabımız</dt><dd><a href="#/hesap/${c.hesap_id}">${e(c.hesap_ad)}</a></dd>` : ''}
        <dt>Düzenleme</dt><dd>${tarih(c.duzenleme)}</dd>
        ${c.aciklama ? `<dt>Açıklama</dt><dd>${e(c.aciklama)}</dd>` : ''}
      </dl></div></div>
      <div class="card"><div class="card-h"><h3>Hareket Geçmişi</h3></div>
        <ul class="list">${c.hareketler.map((h) => `<li class="click" data-href="#/islem/${h.islem_id}"><span class="ico">${icon('clock')}</span>
          <div class="grow"><div class="t">${e(h.yeni_durum_ad)}</div><div class="small muted">${e(h.aciklama || '')}</div></div>
          <div class="small muted">${tarih(h.tarih)}</div></li>`).join('')}</ul>
      </div>
    </div>`;
  $$('[data-href]').forEach((li) => li.addEventListener('click', () => { location.hash = li.dataset.href; }));
  $$('[data-a]').forEach((b) => b.addEventListener('click', () => aksiyon(b.dataset.a, c, ctx)));
  $('#duzenle').addEventListener('click', () => formModal({
    title: `${ad} Bilgilerini Düzenle`,
    alanlar: [
      { name: 'no', label: `${ad} no` }, { name: 'vade', label: 'Vade', type: 'date', required: true },
      { name: 'banka', label: 'Banka' }, { name: 'sube', label: 'Şube' }, { name: 'hesap_no', label: 'Hesap no' },
      { name: 'kesideci', label: c.tur === 'cek' ? 'Keşideci' : 'Borçlu' }, { name: 'kefil', label: 'Kefil' },
      { name: 'aciklama', label: 'Açıklama', full: true },
    ],
    degerler: c,
    onSubmit: async (d) => { await put(`/cekler/${c.id}`, d); toast('Güncellendi', 'ok'); ctx.yenile(); },
  }));
}

async function aksiyon(a, c, ctx) {
  const hs = await hesaplar(true);
  const hesapOps = (tipler) => hs.filter((h) => tipler.includes(h.tip)).map((h) => [h.id, h.ad]);
  const ortak = [
    { name: 'tarih', label: 'İşlem tarihi', type: 'date', value: a === 'tahsil' || a === 'ode' ? (c.vade < bugun() ? c.vade : bugun()) : bugun() },
    { name: 'aciklama', label: 'Açıklama', full: true, ek: true },
  ];
  const gonder = async (d) => {
    await post(`/cekler/${c.id}/islem`, { islem: a, ...d });
    toast('İşlem kaydedildi', 'ok');
    ctx.yenile();
  };

  if (a === 'ciro') {
    let secilen = null;
    const m = modal({
      title: 'Ciro Et',
      body: `<div class="form-grid"><label class="f full"><span>Cari</span><div id="ciro-cari"></div></label>
        <label class="f"><span>Tarih</span><input type="date" id="ciro-tarih" value="${bugun()}"></label>
        <label class="f full"><span>Açıklama</span><input id="ciro-acik"></label></div>`,
      footer: `<button class="btn" data-close>Vazgeç</button><button class="btn primary" id="ciro-ok">Ciro Et</button>`,
    });
    cariSecici($('#ciro-cari', m.el), { onSec: (it) => { secilen = it; }, tip: 'tedarikci' });
    $('#ciro-ok', m.el).addEventListener('click', async () => {
      if (!secilen) return toast('Cari seçin', 'err');
      try {
        await gonder({ cari_id: secilen.id, tarih: $('#ciro-tarih', m.el).value, aciklama: $('#ciro-acik', m.el).value });
        m.close();
      } catch (err) { toast(err.message, 'err'); }
    });
    return;
  }
  const alanlar = [];
  if (a === 'tahsile_ver') alanlar.push({ name: 'hesap_id', label: 'Banka hesabı', type: 'select', options: hesapOps(['banka']), full: true });
  if (a === 'tahsil' || a === 'ode') alanlar.push({ name: 'hesap_id', label: a === 'tahsil' ? 'Tahsil edildiği hesap' : 'Ödendiği hesap', type: 'select', options: hesapOps(['kasa', 'banka']), full: true });
  alanlar.push(...ortak);
  formModal({ title: AKSIYON[a][0], alanlar, degerler: { hesap_id: c.hesap_id }, kaydet: 'Onayla', onSubmit: gonder });
}
