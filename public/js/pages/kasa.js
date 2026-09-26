import { get, post, put, del, hesaplar, hesapCacheTemizle } from '../api.js';
import { e, $, $$, icon, tl, toast, formModal, onayla, tablo, tabloBagla, qs, indir, ayBasi, bugun } from '../ui.js';
import { HESAP_TIP, DOVIZ } from '../sabitler.js';
import { raporYazdir } from '../yazdir.js';

function hesapFormu(h = null, varsayilanTip = 'banka', onKaydet) {
  const yeni = !h;
  const tipSecenek = Object.entries(HESAP_TIP).map(([k, [l]]) => [k, l]);
  const m = formModal({
    title: yeni ? 'Yeni Hesap' : 'Hesap Düzenle',
    alanlar: [
      ...(yeni ? [{ name: 'tip', label: 'Hesap türü', type: 'select', options: tipSecenek, full: true }] : []),
      { name: 'ad', label: 'Hesap adı', required: true, full: true, placeholder: 'Örn: Ziraat TL Hesabı, Dükkan Kasası' },
      { name: 'banka_adi', label: 'Banka', attrs: 'data-t="banka pos kart"' },
      { name: 'sube', label: 'Şube', attrs: 'data-t="banka"' },
      { name: 'hesap_no', label: 'Hesap / Kart no', attrs: 'data-t="banka kart"' },
      { name: 'iban', label: 'IBAN', attrs: 'data-t="banka"' },
      { name: 'komisyon', label: 'POS komisyon oranı %', type: 'number', attrs: 'data-t="pos"' },
      { name: 'valor_gun', label: 'Valör / bloke günü', type: 'number', attrs: 'data-t="pos"' },
      { name: 'doviz', label: 'Para birimi', type: 'select', options: DOVIZ },
      ...(yeni ? [{ name: 'acilis', label: 'Açılış bakiyesi', type: 'money' }] : [{ name: 'aktif', label: 'Aktif', type: 'check' }]),
      { name: 'notlar', label: 'Notlar', type: 'textarea', full: true },
    ],
    degerler: { tip: varsayilanTip, doviz: 'TRY', komisyon: 0, valor_gun: 0, ...(h || {}) },
    onSubmit: async (d) => {
      d.komisyon = d.komisyon || 0;
      d.valor_gun = d.valor_gun || 0;
      if (yeni) await post('/hesaplar', d);
      else await put(`/hesaplar/${h.id}`, d);
      hesapCacheTemizle();
      toast('Hesap kaydedildi', 'ok');
      onKaydet?.();
    },
  });
  const form = $('form', m.el);
  const gizle = () => {
    const t = form.elements.tip?.value || h.tip;
    $$('[data-t]', form).forEach((i) => { i.closest('label').classList.toggle('hidden', !i.dataset.t.split(' ').includes(t)); });
  };
  form.elements.tip?.addEventListener('change', gizle);
  gizle();
}

/** Gelir / gider / virman formu */
export async function hesapIslemFormu(tur, hesapId, onKaydet) {
  const [hs, kategoriler] = await Promise.all([hesaplar(true), get('/hesaplar/kategoriler')]);
  const secenek = hs.map((h) => [h.id, `${h.ad} (${tl(h.bakiye, h.doviz)})`]);
  const basliklar = { gider: 'Masraf / Gider Gir', gelir: 'Gelir Gir', virman: 'Hesaplar Arası Virman' };
  formModal({
    title: basliklar[tur],
    alanlar: [
      { name: 'hesap_id', label: tur === 'virman' ? 'Çıkan hesap' : tur === 'gider' ? 'Ödendiği hesap' : 'Girdiği hesap', type: 'select', options: secenek, full: true },
      ...(tur === 'virman' ? [{ name: 'hedef_hesap_id', label: 'Giren hesap', type: 'select', options: secenek, full: true }] : []),
      { name: 'tutar', label: 'Tutar', type: 'money', required: true },
      { name: 'tarih', label: 'Tarih', type: 'date', value: bugun() },
      ...(tur !== 'virman' ? [{ name: 'kategori', label: 'Kategori', attrs: 'list="kategoriler"', placeholder: 'Kira, elektrik, maaş...' }] : [{ name: 'kur', label: 'Kur (farklı dövizse)', type: 'number' }]),
      { name: 'belge_no', label: 'Belge no' },
      { name: 'aciklama', label: 'Açıklama', full: true },
      { type: 'html', html: `<datalist id="kategoriler">${kategoriler.map((k) => `<option value="${e(k)}">`).join('')}</datalist>` },
    ],
    degerler: { hesap_id: hesapId || hs[0]?.id, hedef_hesap_id: hs.find((h) => String(h.id) !== String(hesapId || hs[0]?.id))?.id },
    onSubmit: async (d) => {
      await post('/hesaplar/islem', { ...d, tur, kur: d.kur || undefined });
      hesapCacheTemizle();
      toast('Kaydedildi', 'ok');
      onKaydet?.();
    },
  });
}

export async function liste(ctx) {
  ctx.baslik('Kasa & Banka');
  const hs = await hesaplar(true);
  if (!ctx.guncel()) return;
  const grup = (tip) => hs.filter((h) => h.tip === tip);
  const toplam = (liste) => liste.filter((h) => h.doviz === 'TRY').reduce((a, h) => a + h.bakiye, 0);
  ctx.el.innerHTML = `
    <div class="page-h"><h1>Kasa & Banka</h1><div class="actions">
      <button class="btn" data-islem="gelir">${icon('in')} Gelir</button>
      <button class="btn" data-islem="gider">${icon('out')} Masraf / Gider</button>
      <button class="btn" data-islem="virman">${icon('transfer')} Virman</button>
      <button class="btn primary" id="yeni">${icon('plus')} Yeni Hesap</button>
    </div></div>
    <div class="grid g4">${Object.entries(HESAP_TIP).map(([k, [l, i]]) => `<div class="card stat"><span class="lbl">${icon(i)} ${l}</span><span class="val ${toplam(grup(k)) < 0 ? 'neg' : ''}">${tl(toplam(grup(k)))}</span><span class="sub">${grup(k).length} hesap</span></div>`).join('')}</div>
    ${Object.entries(HESAP_TIP).map(([k, [l, i]]) => grup(k).length ? `<div class="card" style="margin-top:16px"><div class="card-h"><h3>${l}</h3></div>
      <ul class="list">${grup(k).map((h) => `<li class="click" data-href="#/hesap/${h.id}">
        <span class="ico ${k === 'kasa' ? 'green' : k === 'kart' ? 'red' : ''}">${icon(i)}</span>
        <div class="grow"><div class="t">${e(h.ad)}</div><div class="small muted">${e([h.banka_adi, h.iban, k === 'pos' ? `%${h.komisyon} komisyon · ${h.valor_gun} gün valör` : ''].filter(Boolean).join(' · '))}</div></div>
        <div class="right"><div class="num ${h.bakiye < 0 ? 'neg' : ''}" style="font-weight:700">${tl(h.bakiye, h.doviz)}</div>
        ${h.bloke ? `<div class="small muted">Blokede: ${tl(h.bloke, h.doviz)}</div>` : ''}</div></li>`).join('')}</ul></div>` : '').join('')}`;
  ctx.el.querySelectorAll('[data-href]').forEach((li) => li.addEventListener('click', () => { location.hash = li.dataset.href; }));
  $('#yeni').addEventListener('click', () => hesapFormu(null, 'banka', () => ctx.yenile()));
  $$('[data-islem]').forEach((b) => b.addEventListener('click', () => hesapIslemFormu(b.dataset.islem, null, () => ctx.yenile())));
  if (ctx.query.islem) hesapIslemFormu(ctx.query.islem, null, () => { location.hash = '#/kasa'; });
}

export async function detay(ctx) {
  const h = await get(`/hesaplar/${ctx.params[0]}`);
  if (!ctx.guncel()) return;
  ctx.baslik(h.ad, '#/kasa');
  ctx.el.innerHTML = `
    <div class="card"><div class="card-b"><div class="balance-hero">
      <div><div class="muted small">${HESAP_TIP[h.tip][0]}${h.banka_adi ? ' · ' + e(h.banka_adi) : ''}${h.aktif ? '' : ' · Pasif'}</div>
        <h1 style="margin:4px 0">${e(h.ad)}</h1><div class="small muted">${e(h.iban || h.hesap_no || '')}</div></div>
      <div class="right"><div class="muted small">Bakiye</div><div class="big ${h.bakiye < 0 ? 'neg' : ''}">${tl(h.bakiye, h.doviz)}</div></div>
    </div>
    <div class="btn-row" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:16px">
      <button class="btn" data-islem="gelir">${icon('in')} Gelir / Para Girişi</button>
      <button class="btn" data-islem="gider">${icon('out')} Masraf / Para Çıkışı</button>
      <button class="btn" data-islem="virman">${icon('transfer')} Virman</button>
      <button class="btn" id="duzenle">${icon('edit')} Düzenle</button>
      <button class="btn ghost danger-text" id="sil">${icon('trash')}</button>
    </div></div></div>
    <div class="card" style="margin-top:16px"><div class="card-b">
      <div class="toolbar" style="margin-bottom:12px">
        <input type="date" id="bas" value="${ayBasi()}"><input type="date" id="bit">
        <span class="grow"></span>
        <button class="btn sm" id="pr">${icon('print')} Yazdır</button>
        <button class="btn sm" id="xl">${icon('excel')} Excel</button>
      </div>
      <div id="defter"><div class="spin"></div></div>
    </div></div>`;
  let rapor;
  const yukle = async () => {
    rapor = await get('/rapor/hesap?' + qs({ hesap_id: h.id, bas: $('#bas').value, bit: $('#bit').value }));
    const satirlar = [...rapor.satirlar].reverse();
    const kol = rapor.kolonlar.map((k) => (k.key === 'aciklama' ? { ...k, main: true } : k));
    $('#defter').innerHTML = tablo({ ...rapor, kolonlar: kol, satirlar }, { onRow: true, bos: 'Bu tarih aralığında hareket yok' });
    tabloBagla($('#defter'), satirlar, (s) => { if (s.islem_id) location.hash = `#/islem/${s.islem_id}`; });
  };
  $('#bas').addEventListener('change', yukle);
  $('#bit').addEventListener('change', yukle);
  $('#pr').addEventListener('click', () => raporYazdir(rapor));
  $('#xl').addEventListener('click', () => indir('/api/rapor/hesap/excel?' + qs({ hesap_id: h.id, bas: $('#bas').value, bit: $('#bit').value })));
  $$('[data-islem]').forEach((b) => b.addEventListener('click', () => hesapIslemFormu(b.dataset.islem, h.id, () => ctx.yenile())));
  $('#duzenle').addEventListener('click', () => hesapFormu(h, h.tip, () => ctx.yenile()));
  $('#sil').addEventListener('click', async () => {
    if (!await onayla(`"${h.ad}" silinsin mi? Hareketi olan hesaplar pasife alınır.`, { ok: 'Sil', tehlikeli: true })) return;
    const r = await del(`/hesaplar/${h.id}`);
    hesapCacheTemizle();
    toast(r.pasif ? 'Hesap pasife alındı' : 'Hesap silindi', 'ok');
    location.hash = '#/kasa';
  });
  await yukle();
}
