import { get, post, put, del, hesaplar, hesapCacheTemizle } from '../api.js';
import { e, $, $$, icon, tl, toast, formModal, onayla, menu, tablo, tabloBagla, qs, ayBasi, bugun } from '../ui.js';
import { HESAP_TIP, DOVIZ } from '../sabitler.js';
import { raporYazdir } from '../yazdir.js';
import { ciktiDugmeleri } from '../cikti.js';

function hesapFormu(h = null, varsayilanTip = 'banka', onKaydet) {
  const yeni = !h;
  const tipSecenek = Object.entries(HESAP_TIP).map(([k, [l]]) => [k, l]);
  const m = formModal({
    title: yeni ? 'Yeni Hesap' : 'Hesap Düzenle',
    alanlar: [
      ...(yeni ? [{ name: 'tip', label: 'Tür', type: 'select', options: tipSecenek }] : []),
      { name: 'ad', label: 'Hesap adı', required: true },
      ...(yeni ? [{ name: 'acilis', label: 'Bakiye', type: 'money' }] : []),
      { name: 'komisyon', label: 'Komisyon %', type: 'number', attrs: 'data-t="pos"' },
      { name: 'valor_gun', label: 'Valör (gün)', type: 'number', attrs: 'data-t="pos"' },
      { name: 'iban', label: 'IBAN', attrs: 'data-t="banka"', ek: true },
      { name: 'banka_adi', label: 'Banka', attrs: 'data-t="banka pos kart"', ek: true },
      { name: 'sube', label: 'Şube', attrs: 'data-t="banka"', ek: true },
      { name: 'hesap_no', label: 'Hesap / Kart no', attrs: 'data-t="banka kart"', ek: true },
      { name: 'doviz', label: 'Para birimi', type: 'select', options: DOVIZ, ek: true },
      { name: 'notlar', label: 'Not', type: 'textarea', full: true, ek: true },
      ...(yeni ? [] : [{ name: 'aktif', label: 'Aktif', type: 'check', ek: true }]),
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
    $$('[data-t]', form).forEach((i) => { i.closest('label').classList.toggle('tip-gizli', !i.dataset.t.split(' ').includes(t)); });
  };
  form.elements.tip?.addEventListener('change', gizle);
  gizle();
}

/** Gelir / gider / virman formu */
export async function hesapIslemFormu(tur, hesapId, onKaydet) {
  const [hs, kategoriler] = await Promise.all([hesaplar(true), get('/hesaplar/kategoriler')]);
  const secenek = hs.map((h) => [h.id, h.ad]);
  const basliklar = { gider: 'Masraf', gelir: 'Para Girişi', virman: 'Virman' };
  formModal({
    title: basliklar[tur],
    alanlar: [
      { name: 'tutar', label: 'Tutar', type: 'money', required: true },
      ...(tur !== 'virman' ? [{ name: 'kategori', label: 'Kategori', attrs: 'list="kategoriler"' }] : []),
      { name: 'hesap_id', label: tur === 'virman' ? 'Nereden' : 'Hesap', type: 'select', options: secenek },
      ...(tur === 'virman' ? [{ name: 'hedef_hesap_id', label: 'Nereye', type: 'select', options: secenek }] : []),
      { name: 'aciklama', label: 'Açıklama', full: true, ek: true },
      { name: 'tarih', label: 'Tarih', type: 'date', value: bugun(), ek: true },
      { name: 'belge_no', label: 'Belge no', ek: true },
      ...(tur === 'virman' ? [{ name: 'kur', label: 'Kur', type: 'number', ek: true }] : []),
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
  const toplam = hs.filter((h) => h.doviz === 'TRY' && h.tip !== 'kart').reduce((a, h) => a + h.bakiye, 0);
  ctx.el.innerHTML = `
    <div class="page-h"><h1>Kasa & Banka</h1><div class="actions">
      <button class="btn" data-islem="gider">${icon('out')} Masraf</button>
      <button class="btn" data-islem="gelir">${icon('in')} Para Girişi</button>
      <button class="btn" data-islem="virman">${icon('transfer')} Virman</button>
      <button class="btn primary" id="yeni">${icon('plus')} Hesap</button>
    </div></div>
    <div class="card">
      <div class="card-h"><h3>Toplam</h3><div class="num" style="font-weight:800;font-size:1.1rem">${tl(toplam)}</div></div>
      <ul class="list">${hs.map((h) => `<li class="click" data-href="#/hesap/${h.id}">
        <span class="ico ${h.tip === 'kasa' ? 'green' : h.tip === 'kart' ? 'red' : ''}">${icon(HESAP_TIP[h.tip][1])}</span>
        <div class="grow"><div class="t">${e(h.ad)}</div><div class="small muted">${HESAP_TIP[h.tip][0]}</div></div>
        <div class="num ${h.bakiye < 0 ? 'neg' : ''}" style="font-weight:700">${tl(h.bakiye, h.doviz)}</div></li>`).join('')}</ul>
    </div>`;
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
      <div class="right"><div class="big ${h.bakiye < 0 ? 'neg' : ''}">${tl(h.bakiye, h.doviz)}</div></div>
    </div>
    <div class="btn-row" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:16px">
      <button class="btn" data-islem="gider">${icon('out')} Masraf</button>
      <button class="btn" data-islem="gelir">${icon('in')} Para Girişi</button>
      <button class="btn" data-islem="virman">${icon('transfer')} Virman</button>
      <button class="btn" id="diger">${icon('dots')} Diğer</button>
    </div></div></div>
    <div class="card" style="margin-top:16px"><div class="card-b">
      <div class="toolbar" style="margin-bottom:12px">
        <input type="date" id="bas" value="${ayBasi()}"><input type="date" id="bit">
        <span class="grow"></span><span id="h-cikti"></span>
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
  const cikti = () => {
    const q = qs({ hesap_id: h.id, bas: $('#bas').value, bit: $('#bit').value });
    ciktiDugmeleri($('#h-cikti'), { pdf: `/api/rapor/hesap/pdf?${q}`, excel: `/api/rapor/hesap/excel?${q}`, yazdir: () => raporYazdir(rapor), baslik: h.ad, kucuk: true });
  };
  cikti();
  $('#bas').addEventListener('change', cikti);
  $('#bit').addEventListener('change', cikti);
  $$('[data-islem]').forEach((b) => b.addEventListener('click', () => hesapIslemFormu(b.dataset.islem, h.id, () => ctx.yenile())));
  $('#diger').addEventListener('click', (ev) => menu('Diğer', [
    ['Düzenle', 'edit', () => hesapFormu(h, h.tip, () => ctx.yenile())],
    ['Sil', 'trash', async () => {
      if (!await onayla(`"${h.ad}" silinsin mi?`, { ok: 'Sil', tehlikeli: true })) return;
      const r = await del(`/hesaplar/${h.id}`);
      hesapCacheTemizle();
      toast(r.pasif ? 'Pasife alındı' : 'Silindi', 'ok');
      location.hash = '#/kasa';
    }, true],
  ], ev.currentTarget));;
  await yukle();
}
