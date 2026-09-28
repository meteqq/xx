import { get, hesaplar } from '../api.js';
import { e, $, $$, icon, tablo, tabloBagla, qs, indir, ayBasi, yilBasi, bugun, toast } from '../ui.js';
import { CEK_DURUM, FATURA_TUR } from '../sabitler.js';
import { cariSecici } from './cariler.js';
import { raporYazdir, ekstreYazdir } from '../yazdir.js';

const tarihler = (bas) => [
  { name: 'bas', label: 'Başlangıç', type: 'date', value: bas },
  { name: 'bit', label: 'Bitiş', type: 'date', value: bugun() },
];

const RAPORLAR = {
  ekstre: { ad: 'Cari Hesap Ekstresi', aciklama: 'Bir carinin tarih aralığındaki tüm hareketleri, devir ve bakiye', icon: 'user', filtre: [{ name: 'cari_id', label: 'Cari', type: 'cari' }, ...tarihler(yilBasi())] },
  bakiye: { ad: 'Cari Bakiye Listesi', aciklama: 'Tüm carilerin borç, alacak ve bakiyeleri', icon: 'users', filtre: [
    { name: 'tip', label: 'Tip', type: 'select', options: [['', 'Tümü'], ['musteri', 'Müşteriler'], ['tedarikci', 'Tedarikçiler']] },
    { name: 'durum', label: 'Bakiye', type: 'select', options: [['bakiyeli', 'Bakiyesi olanlar'], ['', 'Tümü'], ['borclu', 'Borçlular'], ['alacakli', 'Alacaklılar']] },
    { name: 'bit', label: 'Tarih itibarıyla', type: 'date', value: bugun() },
  ] },
  yaslandirma: { ad: 'Alacak Yaşlandırma', aciklama: 'Açık alacakların vadesine göre gün gruplarına dağılımı', icon: 'clock', filtre: [{ name: 'bit', label: 'Tarih itibarıyla', type: 'date', value: bugun() }] },
  kasa: { ad: 'Kasa / Banka Bakiyeleri', aciklama: 'Tüm hesapların güncel bakiyeleri', icon: 'wallet', filtre: [] },
  hesap: { ad: 'Kasa / Banka Defteri', aciklama: 'Seçilen hesabın giriş-çıkış hareketleri', icon: 'bank', filtre: [{ name: 'hesap_id', label: 'Hesap', type: 'hesap' }, ...tarihler(ayBasi())] },
  cek: { ad: 'Çek / Senet Raporu', aciklama: 'Vadeye göre portföy, verilen evraklar ve durumları', icon: 'cheque', filtre: [
    { name: 'yon', label: 'Yön', type: 'select', options: [['', 'Tümü'], ['alinan', 'Alınan'], ['verilen', 'Verilen']] },
    { name: 'tur', label: 'Tür', type: 'select', options: [['', 'Çek + Senet'], ['cek', 'Çek'], ['senet', 'Senet']] },
    { name: 'durum', label: 'Durum', type: 'select', options: [['acik', 'Açık'], ['', 'Tümü'], ...Object.entries(CEK_DURUM).map(([k, [l]]) => [k, l])] },
    { name: 'bas', label: 'Vade başlangıç', type: 'date' }, { name: 'bit', label: 'Vade bitiş', type: 'date' },
  ] },
  fatura: { ad: 'Satış / Alış Özeti', aciklama: 'Cari bazında fatura toplamları ve KDV', icon: 'invoice', filtre: [
    { name: 'tur', label: 'Tür', type: 'select', options: Object.entries(FATURA_TUR) }, ...tarihler(ayBasi()),
  ] },
  urun: { ad: 'Ürün Satış Raporu', aciklama: 'Ürün/hizmet bazında satılan miktar ve tutar', icon: 'box', filtre: tarihler(ayBasi()) },
  stok: { ad: 'Stok Durum Raporu', aciklama: 'Mevcut stok miktarları ve stok değeri', icon: 'box', filtre: [
    { name: 'durum', label: 'Durum', type: 'select', options: [['', 'Tümü'], ['kritik', 'Kritik stok']] },
  ] },
  gelirgider: { ad: 'Gelir / Gider Raporu', aciklama: 'Kategori bazında masraflar ve gelirler', icon: 'chart', filtre: tarihler(ayBasi()) },
};

export async function liste(ctx) {
  ctx.baslik('Raporlar');
  ctx.el.innerHTML = `<div class="page-h"><h1>Raporlar</h1></div>
    <div class="grid g3">${Object.entries(RAPORLAR).map(([k, r]) => `<a class="card card-b" href="#/rapor/${k}" style="color:inherit;text-decoration:none;display:flex;gap:14px;align-items:flex-start">
      <span class="ico" style="width:42px;height:42px;border-radius:10px;display:grid;place-items:center;background:var(--primary-soft);color:var(--primary);flex:none">${icon(r.icon)}</span>
      <h3 style="align-self:center">${e(r.ad)}</h3></a>`).join('')}</div>`;
}

export async function rapor(ctx) {
  const ad = ctx.params[0];
  const tanim = RAPORLAR[ad];
  if (!tanim) throw new Error('Rapor bulunamadı');
  ctx.baslik(tanim.ad, '#/raporlar');
  const hs = tanim.filtre.some((f) => f.type === 'hesap') ? await hesaplar(true) : [];
  const q = ctx.query;
  const deger = (f) => q[f.name] ?? f.value ?? '';

  ctx.el.innerHTML = `
    <div class="page-h"><h1>${e(tanim.ad)}</h1><div class="actions">
      <button class="btn" id="pr">${icon('print')} Yazdır</button>
      <button class="btn" id="xl">${icon('excel')} Excel</button></div></div>
    ${tanim.filtre.length ? `<div class="card"><div class="card-b"><div class="form-grid" id="filtre">${tanim.filtre.map((f) => {
      if (f.type === 'cari') return `<label class="f" style="grid-column:span 2"><span>${f.label}</span><div id="f-cari"></div></label>`;
      if (f.type === 'hesap') return `<label class="f"><span>${f.label}</span><select name="hesap_id">${hs.map((h) => `<option value="${h.id}" ${String(h.id) === String(q.hesap_id) ? 'selected' : ''}>${e(h.ad)}</option>`).join('')}</select></label>`;
      if (f.type === 'select') return `<label class="f"><span>${f.label}</span><select name="${f.name}">${f.options.map(([k, l]) => `<option value="${k}" ${String(k) === String(deger(f)) ? 'selected' : ''}>${e(l)}</option>`).join('')}</select></label>`;
      return `<label class="f"><span>${f.label}</span><input type="${f.type}" name="${f.name}" value="${e(deger(f))}"></label>`;
    }).join('')}</div></div></div>` : ''}
    <div class="card" id="sonuc" style="margin-top:16px"></div>`;

  let cariId = q.cari_id || '';
  if (tanim.filtre.some((f) => f.type === 'cari')) {
    const secili = cariId ? await get(`/cariler/${cariId}`) : null;
    cariSecici($('#f-cari'), { secili, onSec: (it) => { cariId = it?.id || ''; yukle(); } });
  }
  const params = () => {
    const p = Object.fromEntries($$('#filtre [name]').map((i) => [i.name, i.value]));
    if (cariId) p.cari_id = cariId;
    return qs(p);
  };
  let son = null;
  async function yukle() {
    if (tanim.filtre.some((f) => f.type === 'cari') && !cariId) {
      $('#sonuc').innerHTML = '';
      son = null;
      return;
    }
    $('#sonuc').innerHTML = '<div class="spin"></div>';
    try {
      son = await get(`/rapor/${ad}?${params()}`);
    } catch (err) {
      $('#sonuc').innerHTML = `<div class="empty">${e(err.message)}</div>`;
      return;
    }
    if (!ctx.guncel()) return;
    const kol = son.kolonlar.map((k) => (k.key === 'aciklama' ? { ...k, main: true } : k));
    $('#sonuc').innerHTML = tablo({ ...son, kolonlar: kol }, { onRow: true, bos: 'Kayıt yok' });
    tabloBagla($('#sonuc'), son.satirlar, (s) => {
      if (ad === 'ekstre') { if (s.fatura_id) location.hash = `#/fatura/${s.fatura_id}`; else if (s.islem_id) location.hash = `#/islem/${s.islem_id}`; }
      else if (['bakiye', 'yaslandirma', 'fatura'].includes(ad)) location.hash = `#/cari/${s.id}`;
      else if (ad === 'cek') location.hash = `#/cek/${s.id}`;
      else if (ad === 'kasa') location.hash = `#/hesap/${s.id}`;
      else if (ad === 'stok') location.hash = `#/urun/${s.id}`;
      else if (ad === 'hesap' && s.islem_id) location.hash = `#/islem/${s.islem_id}`;
    });
  }
  $$('#filtre [name]').forEach((i) => i.addEventListener('change', yukle));
  $('#pr').addEventListener('click', () => {
    if (!son) return toast('Önce raporu oluşturun', 'err');
    (ad === 'ekstre' ? ekstreYazdir : raporYazdir)(son);
  });
  $('#xl').addEventListener('click', () => {
    if (!son) return toast('Önce raporu oluşturun', 'err');
    indir(`/api/rapor/${ad}/excel?${params()}`);
  });
  await yukle();
}
