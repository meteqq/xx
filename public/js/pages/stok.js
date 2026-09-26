import { get, post, put, del } from '../api.js';
import { e, $, icon, tl, miktar, bugun, toast, formModal, onayla, tablo, tabloBagla, debounce, qs } from '../ui.js';
import { BIRIMLER, KDV_ORANLARI } from '../sabitler.js';

export function urunFormu(u = null, { ad, onKaydet } = {}) {
  const yeni = !u;
  return formModal({
    title: yeni ? 'Yeni Ürün / Hizmet' : 'Ürün Düzenle',
    wide: true,
    alanlar: [
      { name: 'ad', label: 'Ürün / hizmet adı', required: true, full: true },
      { name: 'kod', label: 'Stok kodu' },
      { name: 'barkod', label: 'Barkod' },
      { name: 'grup', label: 'Grup / kategori' },
      { name: 'birim', label: 'Birim', type: 'select', options: BIRIMLER.map((b) => [b, b]) },
      { name: 'kdv', label: 'KDV %', type: 'select', options: KDV_ORANLARI.map((k) => [k, '%' + k]) },
      { name: 'alis_fiyat', label: 'Alış fiyatı (KDV hariç)', type: 'money' },
      { name: 'satis_fiyat', label: 'Satış fiyatı (KDV hariç)', type: 'money' },
      { name: 'kritik_stok', label: 'Kritik stok seviyesi', type: 'number' },
      ...(yeni ? [{ name: 'acilis_miktar', label: 'Mevcut stok (açılış)', type: 'number' }] : [{ name: 'aktif', label: 'Aktif', type: 'check' }]),
      { name: 'notlar', label: 'Notlar', type: 'textarea', full: true },
    ],
    degerler: { birim: 'Adet', kdv: 20, kritik_stok: 0, ...(u || {}), ad: u?.ad || ad || '' },
    onSubmit: async (d) => {
      d.kritik_stok = d.kritik_stok || 0;
      if (yeni) {
        const { id } = await post('/urunler', d);
        toast('Ürün kaydedildi', 'ok');
        onKaydet?.({ id, ...d, miktar: d.acilis_miktar || 0 });
      } else {
        await put(`/urunler/${u.id}`, d);
        toast('Ürün güncellendi', 'ok');
        onKaydet?.({ ...u, ...d });
      }
    },
  });
}

export async function liste(ctx) {
  ctx.baslik('Stok / Ürünler');
  ctx.el.innerHTML = `
    <div class="page-h"><h1>Stok / Ürünler</h1><div class="actions">
      <a class="btn" href="#/rapor/stok">${icon('chart')} Stok Raporu</a>
      <button class="btn primary" id="yeni">${icon('plus')} Yeni Ürün</button></div></div>
    <div class="toolbar">
      <input class="grow" type="search" id="q" placeholder="Ürün adı, kod, barkod ara...">
      <select id="durum"><option value="">Tüm ürünler</option><option value="kritik">Kritik stoktakiler</option></select>
    </div>
    <div class="card" id="liste" style="margin-top:14px"><div class="spin"></div></div>`;
  if (ctx.query.durum) $('#durum').value = ctx.query.durum;
  const yukle = async () => {
    const rows = await get('/urunler?' + qs({ q: $('#q').value, durum: $('#durum').value }));
    if (!ctx.guncel()) return;
    $('#liste').innerHTML = tablo({
      kolonlar: [
        { key: 'kod', label: 'Kod' },
        { key: 'ad', label: 'Ürün', main: true },
        { key: 'grup', label: 'Grup' },
        { key: 'satis_fiyat', label: 'Satış Fiyatı', type: 'money' },
        { key: 'kdv', label: 'KDV', render: (v) => '%' + v },
        { key: 'miktar', label: 'Stok', type: 'number', amt: true, render: (v, s) => `<span class="num ${v <= s.kritik_stok && s.kritik_stok > 0 ? 'neg' : ''}">${miktar(v)} ${e(s.birim)}</span>` },
      ],
      satirlar: rows,
    }, { onRow: true, bos: 'Ürün bulunamadı' });
    tabloBagla($('#liste'), rows, (s) => { location.hash = `#/urun/${s.id}`; });
  };
  $('#q').addEventListener('input', debounce(yukle));
  $('#durum').addEventListener('change', yukle);
  $('#yeni').addEventListener('click', () => urunFormu(null, { onKaydet: (u) => { location.hash = `#/urun/${u.id}`; } }));
  await yukle();
}

export async function detay(ctx) {
  const u = await get(`/urunler/${ctx.params[0]}`);
  if (!ctx.guncel()) return;
  ctx.baslik(u.ad, '#/urunler');
  const kritik = u.kritik_stok > 0 && u.miktar <= u.kritik_stok;
  ctx.el.innerHTML = `
    <div class="card"><div class="card-b"><div class="balance-hero">
      <div><div class="muted small">${e([u.kod, u.barkod, u.grup].filter(Boolean).join(' · '))}${u.aktif ? '' : ' · Pasif'}</div><h1 style="margin:4px 0">${e(u.ad)}</h1>
        <div class="small muted">Alış: ${tl(u.alis_fiyat)} · Satış: ${tl(u.satis_fiyat)} · KDV %${u.kdv}</div></div>
      <div class="right"><div class="muted small">Mevcut Stok</div><div class="big ${kritik ? 'neg' : ''}">${miktar(u.miktar)} ${e(u.birim)}</div>
        ${kritik ? '<div class="small neg">Kritik seviyede!</div>' : ''}</div>
    </div>
    <div class="btn-row" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:16px">
      <button class="btn" data-h="giris">${icon('in')} Stok Girişi</button>
      <button class="btn" data-h="cikis">${icon('out')} Stok Çıkışı</button>
      <button class="btn" data-h="sayim">${icon('check')} Sayım Düzelt</button>
      <button class="btn" id="duzenle">${icon('edit')} Düzenle</button>
      <button class="btn ghost danger-text" id="sil">${icon('trash')}</button>
    </div></div></div>
    <div class="card" style="margin-top:16px"><div class="card-h"><h3>Stok Hareketleri</h3></div><div id="hareket"></div></div>`;
  const TUR = { satis: 'Satış', alis: 'Alış', satis_iade: 'Satış İade', alis_iade: 'Alış İade', sayim: 'Sayım', giris: 'Giriş', cikis: 'Çıkış', acilis: 'Açılış' };
  $('#hareket').innerHTML = tablo({
    kolonlar: [
      { key: 'tarih', label: 'Tarih', type: 'date' },
      { key: 'tur', label: 'Tür', render: (v) => TUR[v] || v },
      { key: 'aciklama', label: 'Açıklama', main: true, render: (v, s) => (s.fatura_id ? `<a href="#/fatura/${s.fatura_id}">${e(v)}</a>` : e(v)) },
      { key: 'giris', label: 'Giriş', type: 'number' },
      { key: 'cikis', label: 'Çıkış', type: 'number' },
      { key: 'birim_fiyat', label: 'Birim Fiyat', type: 'money' },
    ],
    satirlar: u.hareketler,
  }, { onRow: true, bos: 'Hareket yok' });
  tabloBagla($('#hareket'), u.hareketler, (s) => { if (s.islem_id) location.hash = `#/islem/${s.islem_id}`; });

  document.querySelectorAll('[data-h]').forEach((b) => b.addEventListener('click', () => {
    const t = b.dataset.h;
    formModal({
      title: { giris: 'Stok Girişi', cikis: 'Stok Çıkışı', sayim: 'Sayım Düzeltmesi' }[t],
      alanlar: [
        { name: 'miktar', label: t === 'sayim' ? `Sayılan miktar (şu an: ${miktar(u.miktar)})` : 'Miktar', type: 'number', required: true },
        { name: 'tarih', label: 'Tarih', type: 'date', value: bugun() },
        { name: 'aciklama', label: 'Açıklama', full: true, placeholder: t === 'cikis' ? 'Fire, numune, kullanım...' : '' },
      ],
      onSubmit: async (d) => { await post(`/urunler/${u.id}/hareket`, { ...d, tur: t }); toast('Kaydedildi', 'ok'); ctx.yenile(); },
    });
  }));
  $('#duzenle').addEventListener('click', () => urunFormu(u, { onKaydet: () => ctx.yenile() }));
  $('#sil').addEventListener('click', async () => {
    if (!await onayla(`"${u.ad}" silinsin mi? Hareketi olan ürünler pasife alınır.`, { ok: 'Sil', tehlikeli: true })) return;
    const r = await del(`/urunler/${u.id}`);
    toast(r.pasif ? 'Ürün pasife alındı' : 'Ürün silindi', 'ok');
    location.hash = '#/urunler';
  });
}

