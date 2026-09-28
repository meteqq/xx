import { get, del } from '../api.js';
import { e, $, icon, tarih, toast, onayla, tablo, tabloBagla, debounce, qs } from '../ui.js';
import { makbuzYazdir } from '../yazdir.js';
import { ciktiDugmeleri } from '../cikti.js';
import { CEK_DURUM } from '../sabitler.js';

export async function liste(ctx) {
  ctx.baslik('İşlemler');
  ctx.el.innerHTML = `
    <div class="page-h"><h1>İşlemler</h1></div>
    <div class="toolbar">
      <input class="grow" type="search" id="q" placeholder="Ara">
      <select id="tur"><option value="">Tümü</option><option value="tahsilat">Tahsilat</option><option value="odeme">Ödeme</option>
        <option value="fatura">Fatura</option><option value="gider">Masraf</option><option value="cek">Çek / Senet</option></select>
    </div>
    <div class="card" id="liste" style="margin-top:14px"><div class="spin"></div></div>`;
  const yukle = async () => {
    const rows = await get('/islemler?' + qs({ q: $('#q').value, tur: $('#tur').value }));
    if (!ctx.guncel()) return;
    $('#liste').innerHTML = tablo({
      kolonlar: [
        { key: 'tarih', label: 'Tarih', type: 'date' },
        { key: 'tur_ad', label: 'İşlem', render: (v, s) => `<span class="badge ${s.tur === 'tahsilat' ? 'green' : s.tur === 'odeme' || s.tur === 'gider' ? 'red' : 'blue'}">${e(v)}</span>` },
        { key: 'cari_unvan', label: 'Cari / Açıklama', main: true, render: (v, s) => e(v || s.aciklama || '-') },
        { key: 'tutar', label: 'Tutar', type: 'money' },
      ],
      satirlar: rows,
    }, { onRow: true, bos: 'Kayıt yok' });
    tabloBagla($('#liste'), rows, (s) => { location.hash = `#/islem/${s.id}`; });
  };
  $('#q').addEventListener('input', debounce(yukle));
  $('#tur').addEventListener('change', yukle);
  await yukle();
}

export async function detay(ctx) {
  const i = await get(`/islemler/${ctx.params[0]}`);
  if (!ctx.guncel()) return;
  ctx.baslik(`${i.tur_ad} #${i.id}`, '#/islemler');
  const makbuzluk = ['tahsilat', 'odeme'].includes(i.tur);
  ctx.el.innerHTML = `
    <div class="page-h"><h1>${e(i.tur_ad)} <span class="muted">#${i.id}</span></h1><div class="actions">
      ${makbuzluk ? '<span id="m-cikti"></span>' : ''}
      ${i.fatura ? `<a class="btn" href="#/fatura/${i.fatura.id}">${icon('invoice')} Fatura</a>` : ''}
      <button class="btn danger-text" id="iptal">${icon('undo')} Geri Al</button>
    </div></div>
    <div class="card"><div class="card-b"><dl class="kv">
      <dt>Tarih</dt><dd>${tarih(i.tarih)}</dd>
      ${i.belge_no ? `<dt>Belge no</dt><dd>${e(i.belge_no)}</dd>` : ''}
      ${i.aciklama ? `<dt>Açıklama</dt><dd>${e(i.aciklama)}</dd>` : ''}
    </dl></div></div>
    ${i.cari.length ? `<div class="card"><div class="card-h"><h3>Cari Hareketleri</h3></div>${tablo({
      kolonlar: [
        { key: 'unvan', label: 'Cari', main: true, render: (v, s) => `<a href="#/cari/${s.cari_id}">${e(v)}</a>` },
        { key: 'odeme_sekli_ad', label: 'Şekil' }, { key: 'aciklama', label: 'Açıklama' }, { key: 'vade', label: 'Vade', type: 'date' },
        { key: 'borc', label: 'Borç', type: 'money' }, { key: 'alacak', label: 'Alacak', type: 'money' },
      ], satirlar: i.cari,
    })}</div>` : ''}
    ${i.hesap.length ? `<div class="card"><div class="card-h"><h3>Kasa / Banka Hareketleri</h3></div>${tablo({
      kolonlar: [
        { key: 'hesap_ad', label: 'Hesap', main: true, render: (v, s) => `<a href="#/hesap/${s.hesap_id}">${e(v)}</a>` },
        { key: 'aciklama', label: 'Açıklama' }, { key: 'valor', label: 'Valör', type: 'date' },
        { key: 'giris', label: 'Giriş', type: 'money' }, { key: 'cikis', label: 'Çıkış', type: 'money' },
      ], satirlar: i.hesap,
    })}</div>` : ''}
    ${i.cekler.length ? `<div class="card"><div class="card-h"><h3>Çek / Senet</h3></div>${tablo({
      kolonlar: [
        { key: 'no', label: 'No', main: true, render: (v, s) => `<a href="#/cek/${s.id}">${s.tur === 'cek' ? 'Çek' : 'Senet'} ${e(v || '-')}</a>` },
        { key: 'vade', label: 'Vade', type: 'date' }, { key: 'durum', label: 'Durum', render: (v) => CEK_DURUM[v][0] },
        { key: 'tutar', label: 'Tutar', type: 'money' },
      ], satirlar: i.cekler,
    })}</div>` : ''}
    ${i.stok.length ? `<div class="card"><div class="card-h"><h3>Stok Hareketleri</h3></div>${tablo({
      kolonlar: [
        { key: 'ad', label: 'Ürün', main: true }, { key: 'giris', label: 'Giriş', type: 'number' }, { key: 'cikis', label: 'Çıkış', type: 'number' },
      ], satirlar: i.stok,
    })}</div>` : ''}`;

  if (makbuzluk) {
    ciktiDugmeleri($('#m-cikti'), {
      pdf: `/api/islemler/${i.id}/pdf`,
      yazdir: () => makbuzYazdir(i),
      baslik: i.tur === 'tahsilat' ? 'Tahsilat Makbuzu' : 'Ödeme Makbuzu',
      metin: `Sayın ${i.cari[0].unvan}, ${i.tur === 'tahsilat' ? 'tahsilat' : 'ödeme'} makbuzunuz ektedir.`,
    });
  }
  $('#iptal').addEventListener('click', async () => {
    if (!await onayla('İşlem geri alınsın mı?', { ok: 'Geri Al', tehlikeli: true })) return;
    try {
      await del(`/islemler/${i.id}`);
      toast('İşlem geri alındı', 'ok');
      location.replace(i.cari[0] ? `#/cari/${i.cari[0].cari_id}` : '#/islemler');
    } catch (err) {
      toast(err.message, 'err');
    }
  });
}

