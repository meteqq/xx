import { get, post, put, del } from '../api.js';
import { e, $, icon, tl, miktar, bugun, toast, formModal, onayla, menu, tablo, tabloBagla, debounce, qs } from '../ui.js';
import { BIRIMLER, KDV_ORANLARI } from '../sabitler.js';

export function urunFormu(u = null, { ad, onKaydet } = {}) {
  const yeni = !u;
  return formModal({
    title: yeni ? 'Yeni Ürün' : 'Ürün Düzenle',
    alanlar: [
      { name: 'ad', label: 'Ürün adı', required: true, full: true },
      { name: 'satis_fiyat', label: 'Satış fiyatı', type: 'money' },
      { name: 'kdv', label: 'KDV', type: 'select', options: KDV_ORANLARI.map((k) => [k, '%' + k]) },
      { name: 'birim', label: 'Birim', type: 'select', options: BIRIMLER.map((b) => [b, b]) },
      ...(yeni ? [{ name: 'acilis_miktar', label: 'Stok', type: 'number' }] : []),
      { name: 'alis_fiyat', label: 'Alış fiyatı', type: 'money', ek: true },
      { name: 'kod', label: 'Kod', ek: true },
      { name: 'barkod', label: 'Barkod', ek: true },
      { name: 'grup', label: 'Grup', ek: true },
      { name: 'kritik_stok', label: 'Kritik stok', type: 'number', ek: true },
      { name: 'notlar', label: 'Not', type: 'textarea', full: true, ek: true },
      ...(yeni ? [] : [{ name: 'aktif', label: 'Aktif', type: 'check', ek: true }]),
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
      <button class="btn primary" id="yeni">${icon('plus')} Yeni Ürün</button></div></div>
    <div class="toolbar">
      <input class="grow" type="search" id="q" placeholder="Ara">
      <select id="durum"><option value="">Tümü</option><option value="kritik">Azalanlar</option></select>
    </div>
    <div class="card" id="liste" style="margin-top:14px"><div class="spin"></div></div>`;
  if (ctx.query.durum) $('#durum').value = ctx.query.durum;
  const yukle = async () => {
    const rows = await get('/urunler?' + qs({ q: $('#q').value, durum: $('#durum').value }));
    if (!ctx.guncel()) return;
    $('#liste').innerHTML = tablo({
      kolonlar: [
        { key: 'ad', label: 'Ürün', main: true },
        { key: 'satis_fiyat', label: 'Fiyat', type: 'money' },
        { key: 'miktar', label: 'Stok', type: 'number', amt: true, render: (v, s) => `<span class="num ${v <= s.kritik_stok && s.kritik_stok > 0 ? 'neg' : ''}">${miktar(v)} ${e(s.birim)}</span>` },
      ],
      satirlar: rows,
    }, { onRow: true, bos: 'Kayıt yok' });
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
      <div class="right"><div class="big ${kritik ? 'neg' : ''}">${miktar(u.miktar)} ${e(u.birim)}</div>
</div>
    </div>
    <div class="btn-row" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:16px">
      <button class="btn" data-h="giris">${icon('in')} Giriş</button>
      <button class="btn" data-h="cikis">${icon('out')} Çıkış</button>
      <button class="btn" data-h="sayim">${icon('check')} Sayım</button>
      <button class="btn" id="diger">${icon('dots')} Diğer</button>
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
  }, { onRow: true, bos: 'Kayıt yok' });
  tabloBagla($('#hareket'), u.hareketler, (s) => { if (s.islem_id) location.hash = `#/islem/${s.islem_id}`; });

  document.querySelectorAll('[data-h]').forEach((b) => b.addEventListener('click', () => {
    const t = b.dataset.h;
    formModal({
      title: { giris: 'Stok Girişi', cikis: 'Stok Çıkışı', sayim: 'Sayım' }[t],
      alanlar: [
        { name: 'miktar', label: t === 'sayim' ? 'Sayılan miktar' : 'Miktar', type: 'number', required: true },
        { name: 'aciklama', label: 'Açıklama', full: true, ek: true },
        { name: 'tarih', label: 'Tarih', type: 'date', value: bugun(), ek: true },
      ],
      onSubmit: async (d) => { await post(`/urunler/${u.id}/hareket`, { ...d, tur: t }); toast('Kaydedildi', 'ok'); ctx.yenile(); },
    });
  }));
  $('#diger').addEventListener('click', (ev) => menu('Diğer', [
    ['Düzenle', 'edit', () => urunFormu(u, { onKaydet: () => ctx.yenile() })],
    ['Sil', 'trash', async () => {
      if (!await onayla(`"${u.ad}" silinsin mi?`, { ok: 'Sil', tehlikeli: true })) return;
      const r = await del(`/urunler/${u.id}`);
      toast(r.pasif ? 'Pasife alındı' : 'Silindi', 'ok');
      location.hash = '#/urunler';
    }, true],
  ], ev.currentTarget));;
}

