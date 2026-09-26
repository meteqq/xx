import { get, post, put, hesaplar } from '../api.js';
import { e, $, $$, icon, tl, tarih, bugun, toast, formModal, modal, tablo, tabloBagla, debounce, qs, indir } from '../ui.js';
import { CEK_DURUM } from '../sabitler.js';
import { cariSecici } from './cariler.js';
import { raporYazdir } from '../yazdir.js';

const durumBadge = (d) => `<span class="badge ${CEK_DURUM[d][1]}">${CEK_DURUM[d][0]}</span>`;

export async function liste(ctx) {
  ctx.baslik('Çek / Senet');
  const q = ctx.query;
  const yon = q.yon ?? 'alinan';
  ctx.el.innerHTML = `
    <div class="page-h"><h1>Çek / Senet</h1><div class="actions">
      <a class="btn green" href="#/odeme?yon=tahsilat&sekil=cek">${icon('in')} Müşteriden Çek/Senet Al</a>
      <a class="btn red" href="#/odeme?yon=odeme&sekil=cek">${icon('out')} Çek/Senet Ver</a>
    </div></div>
    <div class="tabs">
      <a href="#/cekler?yon=alinan" class="${yon === 'alinan' ? 'on' : ''}">Alınan (Müşteri)</a>
      <a href="#/cekler?yon=verilen" class="${yon === 'verilen' ? 'on' : ''}">Verilen (Kendi)</a>
      <a href="#/cekler?yon=" class="${yon === '' ? 'on' : ''}">Tümü</a>
    </div>
    <div class="grid g4" id="ozet"></div>
    <div class="toolbar" style="margin-top:16px">
      <input class="grow" type="search" id="q" placeholder="No, keşideci, banka, cari ara...">
      <select id="tur"><option value="">Çek + Senet</option><option value="cek">Sadece çek</option><option value="senet">Sadece senet</option></select>
      <select id="durum"><option value="acik">Açık (vadesi beklenen)</option><option value="">Tüm durumlar</option>
        ${Object.entries(CEK_DURUM).map(([k, [l]]) => `<option value="${k}">${l}</option>`).join('')}</select>
      <input type="date" id="bas" title="Vade başlangıç"><input type="date" id="bit" title="Vade bitiş">
      <button class="btn" id="pr">${icon('print')}</button>
      <button class="btn" id="xl">${icon('excel')}</button>
    </div>
    <div class="card" id="liste" style="margin-top:14px"><div class="spin"></div></div>`;
  if (q.durum !== undefined) $('#durum').value = q.durum;
  const params = () => qs({ yon, q: $('#q').value, tur: $('#tur').value, durum: $('#durum').value, bas: $('#bas').value, bit: $('#bit').value });
  const yukle = async () => {
    const rows = await get('/cekler?' + params());
    if (!ctx.guncel()) return;
    const t = bugun();
    const gecmis = rows.filter((r) => ['portfoy', 'tahsilde', 'verildi'].includes(r.durum) && r.vade < t);
    const hafta = rows.filter((r) => ['portfoy', 'tahsilde', 'verildi'].includes(r.durum) && r.vade >= t && r.kalan_gun <= 7);
    const top = (l) => l.reduce((a, r) => a + r.tutar, 0);
    $('#ozet').innerHTML = `
      <div class="card stat"><span class="lbl">Listelenen</span><span class="val">${tl(top(rows))}</span><span class="sub">${rows.length} evrak</span></div>
      <div class="card stat"><span class="lbl">Vadesi Geçmiş</span><span class="val ${gecmis.length ? 'neg' : ''}">${tl(top(gecmis))}</span><span class="sub">${gecmis.length} evrak</span></div>
      <div class="card stat"><span class="lbl">7 Gün İçinde</span><span class="val">${tl(top(hafta))}</span><span class="sub">${hafta.length} evrak</span></div>
      <div class="card stat"><span class="lbl">Ortalama Vade</span><span class="val">${rows.length ? Math.round(rows.reduce((a, r) => a + r.kalan_gun * r.tutar, 0) / Math.max(1, top(rows))) : 0} gün</span><span class="sub">Tutar ağırlıklı</span></div>`;
    $('#liste').innerHTML = tablo({
      kolonlar: [
        { key: 'vade', label: 'Vade', render: (v, s) => `${tarih(v)}${['portfoy', 'tahsilde', 'verildi'].includes(s.durum) ? `<div class="small ${s.kalan_gun < 0 ? 'neg' : 'muted'}">${s.kalan_gun < 0 ? `${-s.kalan_gun} gün geçti` : s.kalan_gun === 0 ? 'Bugün' : `${s.kalan_gun} gün kaldı`}</div>` : ''}` },
        { key: 'tur_ad', label: 'Tür', render: (v, s) => `${v} <span class="muted small">${s.yon_ad}</span>` },
        { key: 'no', label: 'No' },
        { key: 'kesideci', label: 'Keşideci / Cari', main: true, render: (v, s) => `${e(v || s.cari_unvan || '-')}${s.kesideci && s.cari_unvan && s.kesideci !== s.cari_unvan ? `<div class="small muted">${e(s.cari_unvan)}</div>` : ''}` },
        { key: 'banka', label: 'Banka' },
        { key: 'durum', label: 'Durum', render: (v, s) => durumBadge(v) + (s.ciro_unvan ? `<div class="small muted">→ ${e(s.ciro_unvan)}</div>` : s.hesap_ad && v === 'tahsilde' ? `<div class="small muted">${e(s.hesap_ad)}</div>` : '') },
        { key: 'tutar', label: 'Tutar', type: 'money' },
      ],
      satirlar: rows,
      toplam: rows.length ? { tutar: top(rows) } : null,
    }, { onRow: true, bos: 'Evrak bulunamadı' });
    tabloBagla($('#liste'), rows, (s) => { location.hash = `#/cek/${s.id}`; });
  };
  $('#q').addEventListener('input', debounce(yukle));
  ['tur', 'durum', 'bas', 'bit'].forEach((id) => $('#' + id).addEventListener('change', yukle));
  $('#pr').addEventListener('click', async () => raporYazdir(await get('/rapor/cek?' + params())));
  $('#xl').addEventListener('click', () => indir('/api/rapor/cek/excel?' + params()));
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
      <button class="btn ghost" id="duzenle">${icon('edit')} Bilgileri Düzenle</button></div>` : `<div style="margin-top:16px"><button class="btn ghost" id="duzenle">${icon('edit')} Bilgileri Düzenle</button></div>`}
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
        <div class="card-b small muted" style="border-top:1px solid var(--border)">Hatalı bir işlemi geri almak için geçmişteki satıra tıklayıp "İşlemi Geri Al" deyin.</div>
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
    { name: 'aciklama', label: 'Açıklama', full: true },
  ];
  const gonder = async (d) => {
    await post(`/cekler/${c.id}/islem`, { islem: a, ...d });
    toast('İşlem kaydedildi', 'ok');
    ctx.yenile();
  };
  const bilgiler = {
    tahsile_ver: 'Evrak seçtiğiniz bankaya tahsile verilir. Tahsil edildiğinde "Tahsil Edildi" ile bankaya giriş yapılır.',
    tahsil: 'Evrak tutarı seçtiğiniz kasa/banka hesabına giriş olarak işlenir.',
    iade: 'Evrak müşteriye geri verilir ve müşteri carisi tekrar borçlandırılır.',
    karsiliksiz: c.durum === 'ciro' ? 'Ciro edilen tedarikçiye olan borcumuz geri gelir ve müşteri carisi borçlandırılır.' : 'Müşteri carisi evrak tutarı kadar tekrar borçlandırılır.',
    portfoye_al: 'Evrak bankadan geri alınıp portföye döner.',
    ode: 'Evrak tutarı seçtiğiniz hesaptan çıkış olarak işlenir.',
    geri_al: 'Tedarikçi evrakı iade etti; tedarikçiye olan borcumuz geri gelir.',
  };
  if (a === 'ciro') {
    let secilen = null;
    const m = modal({
      title: 'Ciro Et',
      body: `<div class="form-grid"><label class="f full"><span class="req">Ciro edilecek cari</span><div id="ciro-cari"></div></label>
        <label class="f"><span>Tarih</span><input type="date" id="ciro-tarih" value="${bugun()}"></label>
        <label class="f full"><span>Açıklama</span><input id="ciro-acik"></label>
        <div class="full small muted">Cari ${tl(c.tutar)} tutarında ödeme yapılmış gibi borçlandırılır (bize olan alacağı azalır).</div></div>`,
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
  alanlar.push(...ortak, { type: 'html', full: true, html: `<div class="alert blue">${e(bilgiler[a] || '')}</div>` });
  formModal({ title: AKSIYON[a][0], alanlar, degerler: { hesap_id: c.hesap_id }, kaydet: 'Onayla', onSubmit: gonder });
}
