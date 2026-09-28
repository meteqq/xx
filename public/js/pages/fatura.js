import { get, post, put, del } from '../api.js';
import { e, $, $$, icon, tl, sayi, tarih, bugun, gunEkle, parseTL, parseNum, miktar, toast, onayla, menu, modal, tablo, tabloBagla, debounce, qs } from '../ui.js';
import { FATURA_TUR, KDV_ORANLARI } from '../sabitler.js';
import { cariSecici } from './cariler.js';
import { urunFormu } from './stok.js';
import { faturaYazdir, fisYazdir } from '../yazdir.js';
import { ciktiDugmeleri } from '../cikti.js';

export async function liste(ctx) {
  const tur = ctx.query.tur === 'alis' ? 'alis' : 'satis';
  const baslik = tur === 'alis' ? 'Alış Faturaları' : 'Satışlar';
  ctx.baslik(baslik);
  ctx.el.innerHTML = `
    <div class="page-h"><h1>${baslik}</h1><div class="actions">
      ${tur === 'satis' ? `<a class="btn" href="#/rapor/gunsonu">${icon('receipt')} Gün Sonu</a>
        <button class="btn" data-aksiyon="fatura-satis">${icon('invoice')} Fatura</button>
        <button class="btn green" data-aksiyon="satis">${icon('cash')} Satış Yap</button>`
        : `<button class="btn primary" data-aksiyon="fatura-alis">${icon('plus')} Yeni Fatura</button>`}</div></div>
    <div class="toolbar"><input class="grow" type="search" id="q" placeholder="Ara"></div>
    <div class="card" id="liste" style="margin-top:14px"><div class="spin"></div></div>`;
  const yukle = async () => {
    const rows = (await get('/faturalar?' + qs({ q: $('#q').value }))).filter((r) => r.tur.startsWith(tur));
    if (!ctx.guncel()) return;
    $('#liste').innerHTML = tablo({
      kolonlar: [
        { key: 'tarih', label: 'Tarih', type: 'date' },
        { key: 'unvan', label: 'Cari', main: true },
        { key: 'no', label: 'No', render: (v, s) => `${e(v)} <span class="badge ${s.belge_tipi === 'fis' ? 'green' : 'blue'}">${s.tur.endsWith('iade') ? 'İade' : s.belge_tipi === 'fis' ? 'Fiş' : 'Fatura'}</span>` },
        { key: 'genel_toplam', label: 'Tutar', type: 'money' },
      ],
      satirlar: rows,
    }, { onRow: true, bos: 'Kayıt yok' });
    tabloBagla($('#liste'), rows, (s) => { location.hash = `#/fatura/${s.id}`; });
  };
  $('#q').addEventListener('input', debounce(yukle));
  await yukle();
}

export async function goster(ctx) {
  const f = await get(`/faturalar/${ctx.params[0]}`);
  if (!ctx.guncel()) return;
  ctx.baslik(`${f.tur_ad} ${f.no}`, `#/faturalar?tur=${f.tur.startsWith('alis') ? 'alis' : 'satis'}`);
  const tahsil = f.tur === 'satis' || f.tur === 'alis_iade';
  const kdvGrup = {};
  for (const k of f.kalemler) kdvGrup[k.kdv] = (kdvGrup[k.kdv] || 0) + k.kdv_tutar;
  ctx.el.innerHTML = `
    ${f.iptal ? '<div class="alert red" style="margin-bottom:14px">İptal edildi</div>' : ''}
    <div class="page-h"><h1>${e(f.tur_ad)} <span class="muted">${e(f.no)}</span></h1><div class="actions">
      <span id="f-cikti"></span>
      ${f.iptal || f.kaynak === 'netsis' ? '' : `<button class="btn primary" data-aksiyon="${tahsil ? 'tahsilat' : 'odeme'}" data-cari="${f.cari_id}">${icon(tahsil ? 'in' : 'out')} ${tahsil ? 'Tahsilat Ekle' : 'Ödeme Ekle'}</button>
      <button class="btn" id="diger" aria-label="Diğer">${icon('dots')}</button>`}
    </div></div>
    <div class="grid g2">
      <div class="card"><div class="card-b"><dl class="kv">
        <dt>Cari</dt><dd><a href="#/cari/${f.cari_id}"><b>${e(f.unvan)}</b></a></dd>
        ${f.vergi_no || f.tc_no ? `<dt>Vergi D. / No</dt><dd>${e(f.vergi_dairesi || '')} ${e(f.vergi_no || f.tc_no)}</dd>` : ''}
        ${f.adres ? `<dt>Adres</dt><dd>${e(f.adres)} ${e(f.ilce || '')} ${e(f.il || '')}</dd>` : ''}
      </dl></div></div>
      <div class="card"><div class="card-b"><dl class="kv">
        <dt>Fatura no</dt><dd>${e(f.no)}</dd><dt>Tarih</dt><dd>${tarih(f.tarih)}</dd><dt>Vade</dt><dd>${tarih(f.vade)}</dd>
        ${f.aciklama ? `<dt>Açıklama</dt><dd>${e(f.aciklama)}</dd>` : ''}
      </dl></div></div>
    </div>
    <div class="card" style="margin-top:16px">${tablo({
      kolonlar: [
        { key: 'aciklama', label: 'Açıklama', main: true, render: (v, s) => (s.urun_id ? `<a href="#/urun/${s.urun_id}">${e(v)}</a>` : e(v)) },
        { key: 'miktar', label: 'Miktar', render: (v, s) => `${miktar(v)} ${e(s.birim || '')}` },
        { key: 'birim_fiyat', label: 'Birim Fiyat', type: 'money' },
        { key: 'iskonto', label: 'İsk. %', render: (v) => (v ? '%' + v : '') },
        { key: 'kdv', label: 'KDV %', render: (v) => '%' + v },
        { key: 'tutar', label: 'Tutar', type: 'money' },
      ],
      satirlar: f.kalemler,
    })}
    <div class="card-b"><div class="totals">
      <div><span>Ara toplam</span><span class="num">${sayi(f.ara_toplam)}</span></div>
      ${f.iskonto ? `<div><span>İskonto</span><span class="num">-${sayi(f.iskonto)}</span></div>` : ''}
      ${Object.entries(kdvGrup).map(([k, v]) => `<div><span>KDV %${k}</span><span class="num">${sayi(v)}</span></div>`).join('')}
      <div class="g"><span>Genel Toplam</span><span class="num">${tl(f.genel_toplam)}</span></div>
    </div></div></div>`;
  ciktiDugmeleri($('#f-cikti'), {
    pdf: `/api/faturalar/${f.id}/pdf`,
    yazdir: () => (f.belge_tipi === 'fis' ? fisYazdir(f) : faturaYazdir(f)),
    baslik: `${f.tur_ad} ${f.no}`,
    metin: `Sayın ${f.unvan}, ${f.no} numaralı ${f.tur_ad.toLocaleLowerCase('tr-TR')} ektedir. Tutar: ${tl(f.genel_toplam)}.`,
    telefon: f.telefon,
  });
  $('#diger')?.addEventListener('click', (ev) => menu('Diğer', [
    ['Düzenle', 'edit', () => faturaAc({ id: f.id, onKaydet: () => ctx.yenile() })],
    ['İptal et', 'trash', async () => {
      if (!await onayla('Fatura iptal edilsin mi?', { ok: 'İptal Et', tehlikeli: true })) return;
      await del(`/faturalar/${f.id}`);
      toast('İptal edildi', 'ok');
      ctx.yenile();
    }, true],
  ], ev.currentTarget));;
}

/** Faturayı sayfadan ayrılmadan açılır pencerede oluşturur / düzenler. */
export async function faturaAc({ tur = 'satis', cariId, id, onKaydet } = {}) {
  const m = modal({ title: 'Fatura', wide: 'xl', body: '<div class="spin"></div>' });
  m.el.querySelector('.modal').classList.add('fatura-modal');
  await form({
    el: m.body, params: [id], query: { tur, cari: cariId }, modal: m, onKaydet,
    guncel: () => document.body.contains(m.el),
    baslik: (t) => { $('.modal-h h2', m.el).textContent = t; },
  });
  return m;
}

export async function form(ctx) {
  const duzenle = ctx.params[0];
  const f = duzenle ? await get(`/faturalar/${duzenle}`) : null;
  const ilkTur = f?.tur || (FATURA_TUR[ctx.query.tur] ? ctx.query.tur : 'satis');
  let taban = ilkTur.startsWith('alis') ? 'alis' : 'satis';
  let tur = ilkTur;
  const cariId = f?.cari_id || ctx.query.cari;
  let cari = cariId ? await get(`/cariler/${cariId}`) : null;
  const yeniNo = duzenle ? f.no : (await get(`/faturalar/yeni-no?tur=${tur}`)).no;
  if (!ctx.guncel()) return;
  ctx.baslik(duzenle ? `Fatura Düzenle ${f.no}` : 'Yeni Fatura', duzenle ? `#/fatura/${duzenle}` : `#/faturalar?tur=${taban}`);

  ctx.el.innerHTML = `
  <div class="card">
    <div class="card-b">
      ${duzenle ? '' : `<div class="seg" id="tur" style="margin-bottom:16px"><button data-t="satis">Satış</button><button data-t="alis">Alış</button></div>`}
      <div class="form-grid">
        <label class="f full"><span>Cari</span><div id="cari"></div></label>
      </div>
      <div class="lines" id="lines" style="margin-top:12px">
        <div class="line head"><div>Ürün</div><div>Miktar</div><div>Fiyat</div><div>İsk. %</div><div>KDV</div><div class="right">Tutar</div><div></div></div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
        <button class="btn ghost sm" id="ekle">${icon('plus')} Satır ekle</button>
        <button class="btn ghost sm" id="detay-ac">${icon('plus')} Daha fazla</button>
      </div>
      <div class="form-grid hidden" id="detay" style="margin-top:12px">
        <label class="f"><span>Fatura no</span><input id="no" value="${e(yeniNo)}"></label>
        <label class="f"><span>Tarih</span><input type="date" id="tarih" value="${f?.tarih || bugun()}"></label>
        <label class="f"><span>Vade</span><input type="date" id="vade" value="${f?.vade || ''}"></label>
        <label class="f full"><span>Açıklama</span><input id="aciklama" value="${e(f?.aciklama || '')}"></label>
        <label class="check"><input type="checkbox" id="kdvdahil"> Fiyatlar KDV dahil</label>
        ${duzenle ? '' : '<label class="check"><input type="checkbox" id="iade"> İade faturası</label>'}
      </div>
      <div class="totals" id="totals" style="margin-top:16px"></div>
    </div>
    <div class="sticky-save">
      <div style="flex:1" class="mobile-only"><div id="gt-m" class="num" style="font-size:1.2rem;font-weight:800"></div></div>
      ${ctx.modal ? '<button class="btn desk-only-inline" data-close>Vazgeç</button>' : `<a class="btn desk-only-inline" href="${duzenle ? `#/fatura/${duzenle}` : `#/faturalar?tur=${taban}`}">Vazgeç</a>`}
      <button class="btn primary lg" id="kaydet">${icon('check')} Kaydet</button>
    </div>
  </div>`;

  $('#detay-ac').addEventListener('click', (ev) => { $('#detay').classList.remove('hidden'); ev.currentTarget.remove(); });
  const turCiz = () => $$('#tur button').forEach((b) => b.classList.toggle('on', b.dataset.t === taban));
  const turDegisti = async () => {
    tur = $('#iade')?.checked ? `${taban}_iade` : taban;
    turCiz();
    $('#no').value = (await get(`/faturalar/yeni-no?tur=${tur}`)).no;
  };
  $$('#tur button').forEach((b) => b.addEventListener('click', () => { taban = b.dataset.t; turDegisti(); }));
  $('#iade')?.addEventListener('change', turDegisti);
  if (!duzenle && tur.endsWith('_iade')) $('#iade').checked = true;
  turCiz();

  const vadeAyarla = () => {
    if (cari && !$('#vade').dataset.elle) $('#vade').value = gunEkle($('#tarih').value || bugun(), cari.vade_gun || 0);
  };
  $('#vade').addEventListener('change', () => { $('#vade').dataset.elle = '1'; });
  $('#tarih').addEventListener('change', vadeAyarla);
  if (f) $('#vade').dataset.elle = '1';
  cariSecici($('#cari'), {
    secili: cari,
    tip: tur.startsWith('alis') ? 'tedarikci' : 'musteri',
    onSec: async (it) => { cari = it ? await get(`/cariler/${it.id}`) : null; vadeAyarla(); },
  });
  vadeAyarla();

  const alis = () => tur === 'alis' || tur === 'alis_iade';

  function satirEkle(k = {}) {
    const d = document.createElement('div');
    d.className = 'line';
    d.dataset.urun = k.urun_id || '';
    d.innerHTML = `
      <div class="ac"><span class="lbl-m">Ürün</span><input data-f="aciklama" value="${e(k.aciklama || '')}" autocomplete="off"><div class="ac-list hidden"></div></div>
      <div><span class="lbl-m">Miktar</span><input data-f="miktar" inputmode="decimal" value="${k.miktar ?? 1}"><input type="hidden" data-f="birim" value="${e(k.birim || 'Adet')}"></div>
      <div><span class="lbl-m">Fiyat</span><input data-f="birim_fiyat" class="money" inputmode="decimal" placeholder="0,00" value="${k.birim_fiyat !== undefined ? sayi(k.birim_fiyat) : ''}"></div>
      <div><span class="lbl-m">İsk. %</span><input data-f="iskonto" inputmode="decimal" value="${k.iskonto ?? (cari?.iskonto || 0)}"></div>
      <div><span class="lbl-m">KDV</span><select data-f="kdv">${KDV_ORANLARI.map((o) => `<option value="${o}" ${Number(k.kdv ?? 20) === o ? 'selected' : ''}>%${o}</option>`).join('')}</select></div>
      <div class="tot" data-tot>0,00</div>
      <div><button class="btn ghost icon sm danger-text" data-rm title="Kalemi sil">${icon('trash')}</button></div>`;
    $('#lines').appendChild(d);
    const inp = $('[data-f=aciklama]', d);
    const list = $('.ac-list', d);
    let items = [];
    const ara = debounce(async () => {
      const q = inp.value.trim();
      items = q ? (await get('/urunler?' + qs({ q }))).slice(0, 12) : [];
      list.innerHTML = items.map((u, i) => `<div class="ac-item" data-i="${i}"><div><div>${e(u.ad)}</div><div class="s">${e(u.kod || '')} · Stok: ${miktar(u.miktar)} ${e(u.birim)}</div></div><div class="s">${tl(alis() ? u.alis_fiyat : u.satis_fiyat)}</div></div>`).join('')
        + (q ? `<div class="ac-item" data-yeni><div>${icon('plus')} "<b>${e(q)}</b>" ürün olarak kaydet</div></div>` : '');
      list.classList.toggle('hidden', !q);
    }, 200);
    const urunSec = (u) => {
      d.dataset.urun = u.id;
      inp.value = u.ad;
      $('[data-f=birim]', d).value = u.birim || 'Adet';
      $('[data-f=kdv]', d).value = String(u.kdv ?? 20);
      const fiyat = alis() ? u.alis_fiyat : u.satis_fiyat;
      const kdvDahil = $('#kdvdahil').checked;
      $('[data-f=birim_fiyat]', d).value = fiyat ? sayi(kdvDahil ? Math.round(fiyat * (1 + (u.kdv ?? 20) / 100)) : fiyat) : '';
      list.classList.add('hidden');
      hesapla();
      $('[data-f=miktar]', d).select();
    };
    inp.addEventListener('input', () => { d.dataset.urun = ''; ara(); });
    inp.addEventListener('blur', () => setTimeout(() => list.classList.add('hidden'), 150));
    list.addEventListener('mousedown', (ev) => {
      ev.preventDefault();
      const it = ev.target.closest('.ac-item');
      if (!it) return;
      if (it.hasAttribute('data-yeni')) {
        list.classList.add('hidden');
        urunFormu(null, { ad: inp.value.trim(), onKaydet: (u) => urunSec(u) });
      } else urunSec(items[Number(it.dataset.i)]);
    });
    d.addEventListener('input', hesapla);
    d.addEventListener('change', hesapla);
    $('[data-rm]', d).addEventListener('click', () => { d.remove(); hesapla(); });
    hesapla();
    return d;
  }

  function kalemler() {
    const kdvDahil = $('#kdvdahil').checked;
    return $$('#lines .line:not(.head)').map((d) => {
      const v = Object.fromEntries($$('[data-f]', d).map((i) => [i.dataset.f, i.value]));
      const kdv = Number(v.kdv);
      let fiyat = parseTL(v.birim_fiyat) || 0;
      if (kdvDahil) fiyat = Math.round(fiyat / (1 + kdv / 100));
      return {
        el: d, urun_id: d.dataset.urun ? Number(d.dataset.urun) : null, aciklama: v.aciklama.trim(),
        miktar: parseNum(v.miktar), birim: v.birim, birim_fiyat: fiyat, iskonto: parseNum(v.iskonto) || 0, kdv,
      };
    });
  }

  function hesapla() {
    let ara = 0;
    let isk = 0;
    const kdvGrup = {};
    for (const k of kalemler()) {
      const brut = Math.round((k.miktar || 0) * k.birim_fiyat);
      const net = Math.round(brut * (1 - (k.iskonto || 0) / 100));
      const kdv = Math.round(net * k.kdv / 100);
      ara += brut;
      isk += brut - net;
      kdvGrup[k.kdv] = (kdvGrup[k.kdv] || 0) + kdv;
      $('[data-tot]', k.el).textContent = sayi(net);
    }
    const kdvT = Object.values(kdvGrup).reduce((a, b) => a + b, 0);
    const gt = ara - isk + kdvT;
    $('#totals').innerHTML = `<div><span>Ara toplam</span><span class="num">${sayi(ara)}</span></div>
      ${isk ? `<div><span>İskonto</span><span class="num">-${sayi(isk)}</span></div>` : ''}
      ${Object.entries(kdvGrup).filter(([, v]) => v).map(([k, v]) => `<div><span>KDV %${k}</span><span class="num">${sayi(v)}</span></div>`).join('')}
      <div class="g"><span>Genel Toplam</span><span class="num">${tl(gt)}</span></div>`;
    $('#gt-m').textContent = tl(gt);
  }

  $('#kdvdahil').addEventListener('change', hesapla);
  $('#ekle').addEventListener('click', () => $('[data-f=aciklama]', satirEkle()).focus());
  if (f) f.kalemler.forEach((k) => satirEkle(k));
  else satirEkle();

  $('#kaydet').addEventListener('click', async () => {
    if (!cari) return toast('Cari seçin', 'err');
    const liste = kalemler().filter((k) => k.aciklama || k.birim_fiyat);
    if (!liste.length) return toast('En az bir kalem girin', 'err');
    for (const k of liste) {
      if (!k.aciklama) return toast('Kalem açıklaması boş olamaz', 'err');
      if (!(k.miktar > 0)) return toast(`"${k.aciklama}" için miktar girin`, 'err');
    }
    const body = {
      tur, cari_id: cari.id, no: $('#no').value.trim(), tarih: $('#tarih').value, vade: $('#vade').value || undefined,
      aciklama: $('#aciklama').value.trim(), kalemler: liste.map(({ el, ...k }) => k),
    };
    const btn = $('#kaydet');
    btn.disabled = true;
    try {
      const { id } = duzenle ? await put(`/faturalar/${duzenle}`, body) : await post('/faturalar', body);
      if (ctx.modal) {
        ctx.modal.close();
        toast('Fatura kaydedildi', 'ok', { etiket: 'Görüntüle', fn: () => { location.hash = `#/fatura/${id}`; } });
        ctx.onKaydet?.(id);
      } else {
        toast('Fatura kaydedildi', 'ok');
        location.hash = `#/fatura/${id}`;
      }
    } catch (err) {
      toast(err.message, 'err');
      btn.disabled = false;
    }
  });
}
