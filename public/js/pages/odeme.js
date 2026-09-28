import { get, post, hesaplar } from '../api.js';
import { e, $, $$, icon, tl, tarih, bugun, parseTL, parseNum, toast, modal } from '../ui.js';
import { ODEME_SEKLI } from '../sabitler.js';
import { cariSecici } from './cariler.js';
import { makbuzYazdir } from '../yazdir.js';

const BANKALAR = ['Ziraat Bankası', 'Halkbank', 'VakıfBank', 'İş Bankası', 'Garanti BBVA', 'Yapı Kredi', 'Akbank', 'QNB',
  'DenizBank', 'TEB', 'ING', 'Kuveyt Türk', 'Albaraka', 'Şekerbank', 'Fibabanka', 'HSBC', 'Odeabank', 'Vakıf Katılım',
  'Ziraat Katılım', 'Türkiye Finans'];

export async function sayfa(ctx) {
  let yon = ctx.query.yon === 'odeme' ? 'odeme' : 'tahsilat';
  const geri = ctx.query.cari ? `#/cari/${ctx.query.cari}` : '#/';
  const [hs, cari] = await Promise.all([
    hesaplar(true),
    ctx.query.cari ? get(`/cariler/${ctx.query.cari}`) : null,
  ]);
  if (!ctx.guncel()) return;
  let secCari = cari;
  let portfoy = null;

  ctx.el.innerHTML = `
  <div class="card" style="max-width:820px">
    <div class="card-b">
      <div class="seg big" id="yon" style="margin-bottom:16px">
        <button data-y="tahsilat">${icon('in')} Tahsilat</button>
        <button data-y="odeme">${icon('out')} Ödeme</button>
      </div>
      <label class="f"><span>Cari</span><div id="cari"></div></label>
      <div id="lines" style="margin-top:16px"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
        <button class="btn ghost sm" id="ekle">${icon('plus')} Ödeme şekli ekle</button>
        <button class="btn ghost sm" id="detay-ac">${icon('plus')} Tarih / açıklama</button>
      </div>
      <div class="form-grid hidden" id="detay" style="margin-top:12px">
        <label class="f"><span>Tarih</span><input type="date" id="tarih" value="${bugun()}"></label>
        <label class="f"><span>Belge no</span><input id="belge"></label>
        <label class="f full"><span>Açıklama</span><input id="aciklama"></label>
      </div>
    </div>
    <div class="sticky-save">
      <div style="flex:1"><div id="toplam" class="num" style="font-size:1.3rem;font-weight:800">0,00 ₺</div></div>
      <button class="btn lg" id="kaydet">${icon('check')} Kaydet</button>
    </div>
  </div>
  <datalist id="bankalar">${BANKALAR.map((b) => `<option value="${b}">`).join('')}</datalist>`;

  $('#detay-ac').addEventListener('click', (ev) => { $('#detay').classList.remove('hidden'); ev.currentTarget.remove(); });

  const yonCiz = () => {
    $$('#yon button').forEach((b) => b.classList.toggle('on', b.dataset.y === yon));
    ctx.baslik(yon === 'tahsilat' ? 'Tahsilat' : 'Ödeme', geri);
    $('#kaydet').className = `btn lg ${yon === 'tahsilat' ? 'green' : 'red'}`;
  };
  $$('#yon button').forEach((b) => b.addEventListener('click', () => {
    yon = b.dataset.y;
    yonCiz();
    $$('#lines .pay-line').forEach((l) => alanCiz(l));
  }));

  cariSecici($('#cari'), {
    secili: secCari,
    onSec: async (it) => { secCari = it ? await get(`/cariler/${it.id}`) : null; },
  });

  // ---------- Ödeme satırları ----------
  /** Uygun tek hesap varsa seçim kutusu göstermez. */
  const hesapSec = (tipler) => {
    const liste = hs.filter((h) => tipler.includes(h.tip));
    if (!liste.length) return '<div class="full neg small">Hesap yok · <a href="#/kasa">Hesap ekle</a></div>';
    if (liste.length === 1) return `<input type="hidden" data-f="hesap_id" value="${liste[0].id}">`;
    return `<label class="f"><span>Hesap</span><select data-f="hesap_id">${liste.map((h) => `<option value="${h.id}">${e(h.ad)}</option>`).join('')}</select></label>`;
  };

  function satirEkle(sekil = 'nakit') {
    const d = document.createElement('div');
    d.className = 'pay-line';
    d.dataset.sekil = sekil;
    d.innerHTML = `<div class="pay-h"><span></span><button class="btn ghost sm rm danger-text" aria-label="Kaldır">${icon('x')}</button></div>
      <div class="pay-methods">${Object.entries(ODEME_SEKLI).map(([k, [l, i]]) => `<button type="button" data-s="${k}">${icon(i)}${e(l)}</button>`).join('')}</div>
      <div class="form-grid" data-alanlar style="margin-top:14px"></div>`;
    $('#lines').appendChild(d);
    $$('[data-s]', d).forEach((b) => b.addEventListener('click', () => { d.dataset.sekil = b.dataset.s; alanCiz(d); }));
    $('.rm', d).addEventListener('click', () => { d.remove(); guncelRm(); toplamHesapla(); });
    alanCiz(d);
    guncelRm();
    return d;
  }
  const guncelRm = () => {
    const satirlar = $$('#lines .pay-line');
    satirlar.forEach((l) => $('.pay-h', l).classList.toggle('hidden', satirlar.length === 1));
  };

  async function alanCiz(d) {
    const s = d.dataset.sekil;
    const tahsilat = yon === 'tahsilat';
    $$('[data-s]', d).forEach((b) => b.classList.toggle('on', b.dataset.s === s));
    const eski = Object.fromEntries($$('[data-f]', d).map((i) => [i.dataset.f, i.value]));
    const deger = (k) => e(eski[k] || '');
    const tutar = `<label class="f"><span>Tutar</span><input data-f="tutar" class="money" inputmode="decimal" placeholder="0,00" value="${deger('tutar')}"></label>`;
    let h = '';
    if (s === 'nakit') h = hesapSec(['kasa']) + tutar;
    else if (s === 'havale') h = hesapSec(['banka']) + tutar;
    else if (s === 'kredi_karti') {
      h = hesapSec(tahsilat ? ['pos'] : ['kart', 'banka']) + tutar
        + `<label class="f"><span>Taksit</span><select data-f="taksit">${[1, 2, 3, 4, 5, 6, 9, 12].map((t) => `<option value="${t}" ${String(t) === eski.taksit ? 'selected' : ''}>${t === 1 ? 'Tek çekim' : t + ' taksit'}</option>`).join('')}</select></label>`;
    } else if (s === 'cek' || s === 'senet') {
      const cek = s === 'cek';
      const ciroMod = !tahsilat && eski.kaynak === 'ciro';
      if (!tahsilat) {
        h = `<label class="f full"><span>${cek ? 'Çek' : 'Senet'}</span><select data-f="kaynak">
          <option value="kendi">Yeni ${cek ? 'çek' : 'senet'}</option>
          <option value="ciro" ${ciroMod ? 'selected' : ''}>Portföyden ciro</option></select></label>`;
      }
      if (ciroMod) {
        portfoy = portfoy || await get('/cekler?yon=alinan&durum=portfoy');
        const uygun = portfoy.filter((p) => p.tur === s);
        h += uygun.length
          ? `<label class="f full"><span>Evrak</span><select data-f="cek_id"><option value=""></option>${uygun.map((p) => `<option value="${p.id}" data-t="${p.tutar}">${tarih(p.vade)} · ${e(p.no || '-')} · ${e(p.kesideci || p.cari_unvan || '')} · ${tl(p.tutar)}</option>`).join('')}</select></label>
            <input type="hidden" data-f="tutar" value="">`
          : `<div class="full muted small">Portföyde ${cek ? 'çek' : 'senet'} yok</div>`;
      } else {
        h += `${tutar}<label class="f"><span>Vade</span><input type="date" data-f="vade" value="${deger('vade')}"></label>
          <label class="f"><span>${cek ? 'Çek' : 'Senet'} no</span><input data-f="no" value="${deger('no')}"></label>
          ${tahsilat && cek ? `<label class="f"><span>Banka</span><input data-f="banka" list="bankalar" value="${deger('banka')}"></label>` : ''}`;
      }
    } else if (s === 'mahsup') {
      h = `<label class="f full"><span>Karşı cari</span><div data-karsi></div></label>${tutar}`;
    } else {
      h = `${tutar}<label class="f"><span>Açıklama</span><input data-f="aciklama" value="${deger('aciklama')}"></label>`;
    }
    h += '<div class="full" data-kur></div>';
    $('[data-alanlar]', d).innerHTML = h;

    if (s === 'mahsup') {
      d._karsi = null;
      cariSecici($('[data-karsi]', d), { onSec: (it) => { d._karsi = it; } });
    }
    const cekSel = $('[data-f=cek_id]', d);
    cekSel?.addEventListener('change', () => {
      $('[data-f=tutar]', d).value = cekSel.selectedOptions[0]?.dataset.t || '';
      toplamHesapla();
    });
    $('[data-f=kaynak]', d)?.addEventListener('change', () => alanCiz(d));
    $('[data-f=hesap_id]', d)?.addEventListener('change', () => kurAlani(d));
    $('[data-f=tutar]', d)?.addEventListener('input', toplamHesapla);
    kurAlani(d);
    toplamHesapla();
  }

  /** Hesabın para birimi carininkinden farklıysa kur sorar. */
  function kurAlani(d) {
    const hesap = hs.find((h) => String(h.id) === String($('[data-f=hesap_id]', d)?.value));
    const kur = $('[data-kur]', d);
    const cariDoviz = secCari?.doviz || 'TRY';
    if (hesap && hesap.doviz !== cariDoviz) {
      if (!$('[data-f=kur]', d)) kur.innerHTML = `<label class="f" style="max-width:220px"><span>Kur (${cariDoviz} → ${hesap.doviz})</span><input data-f="kur" inputmode="decimal"></label>`;
    } else kur.innerHTML = '';
  }

  function toplamHesapla() {
    const t = $$('#lines [data-f=tutar]').reduce((a, i) => a + (parseTL(i.value) || 0), 0);
    $('#toplam').textContent = tl(t, secCari?.doviz || 'TRY');
  }

  $('#ekle').addEventListener('click', () => $('[data-f=tutar]', satirEkle('nakit'))?.focus());
  satirEkle(ctx.query.sekil || 'nakit');
  yonCiz();

  // ---------- Kaydet ----------
  $('#kaydet').addEventListener('click', async () => {
    if (!secCari) return toast('Cari seçin', 'err');
    const satirlar = [];
    for (const d of $$('#lines .pay-line')) {
      const v = Object.fromEntries($$('[data-f]', d).map((i) => [i.dataset.f, i.value.trim()]));
      const s = d.dataset.sekil;
      const tutar = parseTL(v.tutar);
      if (!tutar || tutar < 0 || Number.isNaN(tutar)) return toast('Tutar girin', 'err');
      const satir = { sekil: s, tutar, aciklama: v.aciklama || undefined };
      if (v.hesap_id) satir.hesap_id = Number(v.hesap_id);
      if (v.kur) satir.kur = parseNum(v.kur);
      if (v.taksit && v.taksit !== '1') satir.aciklama = `${v.taksit} taksit`;
      if (s === 'cek' || s === 'senet') {
        if (v.kaynak === 'ciro') {
          if (!v.cek_id) return toast('Evrak seçin', 'err');
          satir.cek_id = Number(v.cek_id);
        } else {
          if (!v.vade) return toast('Vade girin', 'err');
          if (s === 'cek' && !v.no) return toast('Çek no girin', 'err');
          satir.cek = { no: v.no, vade: v.vade, banka: v.banka };
        }
      }
      if (s === 'mahsup') {
        if (!d._karsi) return toast('Karşı cari seçin', 'err');
        satir.hedef_cari_id = d._karsi.id;
      }
      satirlar.push(satir);
    }
    if (!satirlar.length) return toast('Ödeme şekli ekleyin', 'err');
    const btn = $('#kaydet');
    btn.disabled = true;
    try {
      const { islem_id } = await post('/odeme', {
        yon, cari_id: secCari.id, tarih: $('#tarih').value, belge_no: $('#belge').value.trim(), aciklama: $('#aciklama').value.trim(), satirlar,
      });
      sonuc(islem_id);
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      btn.disabled = false;
    }
  });

  function sonuc(islem_id) {
    const m = modal({
      title: 'Kaydedildi',
      body: `<div style="text-align:center;padding:6px 0"><b>${e(secCari.unvan)}</b><div class="num" style="font-size:1.4rem;font-weight:800;margin-top:6px">${$('#toplam').textContent}</div></div>`,
      footer: `<button class="btn" data-a="makbuz">${icon('print')} Makbuz</button><button class="btn primary" data-a="tamam">Tamam</button>`,
    });
    $('[data-a=makbuz]', m.el).addEventListener('click', async () => makbuzYazdir(await get(`/islemler/${islem_id}`)));
    $('[data-a=tamam]', m.el).addEventListener('click', () => {
      m.close();
      if (ctx.query.cari) location.hash = geri;
      else ctx.yenile();
    });
  }
}
