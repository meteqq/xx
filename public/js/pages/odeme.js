import { get, post, hesaplar } from '../api.js';
import { e, $, $$, icon, tl, tarih, bugun, parseTL, parseNum, sayi, toast, modal } from '../ui.js';
import { ODEME_SEKLI } from '../sabitler.js';
import { cariSecici } from './cariler.js';
import { makbuzYazdir } from '../yazdir.js';

export async function sayfa(ctx) {
  let yon = ctx.query.yon === 'odeme' ? 'odeme' : 'tahsilat';
  ctx.baslik(yon === 'tahsilat' ? 'Tahsilat Al' : 'Ödeme Yap', ctx.query.cari ? `#/cari/${ctx.query.cari}` : '#/');
  const [hs, cari] = await Promise.all([
    hesaplar(true),
    ctx.query.cari ? get(`/cariler/${ctx.query.cari}`) : null,
  ]);
  if (!ctx.guncel()) return;
  let secCari = cari;
  let portfoy = null;

  ctx.el.innerHTML = `
  <div class="card" style="max-width:920px">
    <div class="card-b">
      <div class="seg big" id="yon" style="margin-bottom:16px">
        <button data-y="tahsilat">${icon('in')} Tahsilat (Para Al)</button>
        <button data-y="odeme">${icon('out')} Ödeme (Para Ver)</button>
      </div>
      <div class="form-grid">
        <label class="f full"><span class="req">Cari</span><div id="cari"></div></label>
        <label class="f"><span>Tarih</span><input type="date" id="tarih" value="${bugun()}"></label>
        <label class="f"><span>Makbuz / Belge no</span><input id="belge" placeholder="İsteğe bağlı"></label>
        <label class="f full"><span>Açıklama</span><input id="aciklama" placeholder="İsteğe bağlı"></label>
      </div>
      <div id="cari-info"></div>
      <div class="form-sec" style="margin-top:22px">Ödeme Şekli</div>
      <div id="lines"></div>
      <button class="btn" id="ekle" style="margin-top:12px">${icon('plus')} Başka ödeme şekli ekle</button>
    </div>
    <div class="sticky-save">
      <div style="flex:1"><div class="small muted">Toplam</div><div id="toplam" class="num" style="font-size:1.3rem;font-weight:800">0,00 ₺</div></div>
      <button class="btn primary lg" id="kaydet">${icon('check')} Kaydet</button>
    </div>
  </div>`;

  const yonCiz = () => {
    $$('#yon button').forEach((b) => {
      b.classList.toggle('on', b.dataset.y === yon);
    });
    ctx.baslik(yon === 'tahsilat' ? 'Tahsilat Al' : 'Ödeme Yap', ctx.query.cari ? `#/cari/${ctx.query.cari}` : '#/');
    $('#kaydet').className = `btn lg ${yon === 'tahsilat' ? 'green' : 'red'}`;
    $('#kaydet').innerHTML = `${icon('check')} ${yon === 'tahsilat' ? 'Tahsilatı Kaydet' : 'Ödemeyi Kaydet'}`;
  };
  $$('#yon button').forEach((b) => b.addEventListener('click', () => {
    yon = b.dataset.y;
    yonCiz();
    $$('#lines .pay-line').forEach((l) => alanCiz(l));
  }));

  const cariInfo = () => {
    const c = secCari;
    if (!c) { $('#cari-info').innerHTML = ''; return; }
    const b = c.bakiye || 0;
    $('#cari-info').innerHTML = `<div class="alert ${b > 0 ? 'orange' : 'blue'}" style="margin-top:12px">
      ${icon('user')} <span>Güncel bakiye: <b>${tl(Math.abs(b), c.doviz)} ${b > 0 ? '(Borçlu)' : b < 0 ? '(Alacaklı)' : ''}</b>
      ${b ? `<a href="#" id="tamami" style="margin-left:8px">Tamamını ${yon === 'tahsilat' ? 'tahsil et' : 'öde'}</a>` : ''}</span></div>`;
    $('#tamami')?.addEventListener('click', (ev) => {
      ev.preventDefault();
      const ilk = $('#lines .pay-line [data-f=tutar]');
      if (ilk) { ilk.value = sayi(Math.abs(b)); toplamHesapla(); }
    });
  };
  cariSecici($('#cari'), {
    secili: secCari,
    onSec: async (it) => {
      secCari = it ? await get(`/cariler/${it.id}`) : null;
      cariInfo();
      $$('#lines .pay-line').forEach((l) => alanCiz(l));
    },
  });
  cariInfo();

  // ---------- Ödeme satırları ----------
  const hesapSec = (tipler, secili) => {
    const liste = hs.filter((h) => tipler.includes(h.tip));
    if (!liste.length) return `<div class="alert orange full">Uygun hesap yok. <a href="#/kasa">Kasa & Banka</a> sayfasından ekleyin.</div>`;
    return `<label class="f"><span class="req">Hesap</span><select data-f="hesap_id">${liste.map((h) => `<option value="${h.id}" ${String(h.id) === String(secili) ? 'selected' : ''}>${e(h.ad)}${h.doviz !== 'TRY' ? ' (' + h.doviz + ')' : ''}</option>`).join('')}</select></label>`;
  };

  function satirEkle(sekil = 'nakit') {
    const d = document.createElement('div');
    d.className = 'pay-line';
    d.dataset.sekil = sekil;
    d.innerHTML = `<div class="pay-h"><span data-baslik></span><button class="btn ghost sm rm danger-text" title="Satırı kaldır">${icon('x')} Kaldır</button></div>
      <div class="pay-methods">${Object.entries(ODEME_SEKLI).map(([k, [l, i]]) => `<button type="button" data-s="${k}">${icon(i)}${e(l)}</button>`).join('')}</div>
      <div class="form-grid" data-alanlar style="margin-top:14px"></div>`;
    $('#lines').appendChild(d);
    $$('[data-s]', d).forEach((b) => b.addEventListener('click', () => { d.dataset.sekil = b.dataset.s; alanCiz(d); }));
    $('.rm', d).addEventListener('click', () => {
      if ($$('#lines .pay-line').length === 1) return toast('En az bir ödeme satırı olmalı', 'err');
      d.remove();
      guncelRm();
      toplamHesapla();
    });
    alanCiz(d);
    guncelRm();
  }
  const guncelRm = () => {
    const satirlar = $$('#lines .pay-line');
    satirlar.forEach((l, i) => {
      $('.pay-h', l).classList.toggle('hidden', satirlar.length === 1);
      $('[data-baslik]', l).textContent = `${i + 1}. ödeme`;
    });
  };

  async function alanCiz(d) {
    const s = d.dataset.sekil;
    const tahsilat = yon === 'tahsilat';
    $$('[data-s]', d).forEach((b) => b.classList.toggle('on', b.dataset.s === s));
    const eski = Object.fromEntries($$('[data-f]', d).map((i) => [i.dataset.f, i.value]));
    const tutar = `<label class="f"><span class="req">Tutar</span><input data-f="tutar" class="money" inputmode="decimal" placeholder="0,00" value="${e(eski.tutar || '')}"></label>`;
    const acik = (ph) => `<label class="f full"><span>Not</span><input data-f="aciklama" placeholder="${e(ph)}" value="${e(eski.aciklama || '')}"></label>`;
    let h = '';
    if (s === 'nakit') h = hesapSec(['kasa']) + tutar + acik('İsteğe bağlı');
    else if (s === 'havale') h = hesapSec(['banka']) + tutar + acik('Dekont no, gönderen vb.');
    else if (s === 'kredi_karti') {
      h = (tahsilat ? hesapSec(['pos']) : hesapSec(['kart', 'banka'])) + tutar
        + `<label class="f"><span>Taksit</span><select data-f="taksit">${[1, 2, 3, 4, 5, 6, 9, 12].map((t) => `<option value="${t}">${t === 1 ? 'Tek çekim' : t + ' taksit'}</option>`).join('')}</select></label>`
        + acik('Kart sahibi, provizyon no vb.') + (tahsilat ? '<div class="full small muted" data-pos-info></div>' : '');
    } else if (s === 'cek' || s === 'senet') {
      const cek = s === 'cek';
      const ciroMod = !tahsilat && eski.kaynak === 'ciro';
      h = !tahsilat ? `<label class="f full"><span>Evrak kaynağı</span><select data-f="kaynak">
          <option value="kendi">Kendi ${cek ? 'çekimiz' : 'senedimiz'} (yeni ${cek ? 'çek' : 'senet'} yaz)</option>
          <option value="ciro" ${ciroMod ? 'selected' : ''}>Portföydeki müşteri ${cek ? 'çekini' : 'senedini'} ciro et</option></select></label>` : '';
      if (ciroMod) {
        portfoy = portfoy || await get('/cekler?yon=alinan&durum=portfoy');
        const uygun = portfoy.filter((p) => p.tur === s);
        h += uygun.length ? `<label class="f full"><span class="req">Ciro edilecek evrak</span><select data-f="cek_id">
            <option value="">Seçin...</option>${uygun.map((p) => `<option value="${p.id}" data-t="${p.tutar}">${tarih(p.vade)} · ${e(p.no || '-')} · ${e(p.kesideci || p.cari_unvan || '')} · ${tl(p.tutar)}</option>`).join('')}</select></label>
            <input type="hidden" data-f="tutar" value="">`
          : `<div class="alert orange full">Portföyde ${cek ? 'çek' : 'senet'} yok.</div>`;
      } else {
        h += `<label class="f"><span class="${cek ? 'req' : ''}">${cek ? 'Çek' : 'Senet'} no</span><input data-f="no" value="${e(eski.no || '')}"></label>
          <label class="f"><span class="req">Vade tarihi</span><input type="date" data-f="vade" value="${e(eski.vade || '')}"></label>
          ${tutar}`;
        if (tahsilat) {
          h += cek ? `<label class="f"><span>Banka</span><input data-f="banka" list="bankalar" value="${e(eski.banka || '')}"></label>
              <label class="f"><span>Şube</span><input data-f="sube" value="${e(eski.sube || '')}"></label>
              <label class="f"><span>Hesap no</span><input data-f="hesap_no" value="${e(eski.hesap_no || '')}"></label>
              <label class="f"><span>Keşideci</span><input data-f="kesideci" placeholder="${e(secCari?.unvan || 'Çeki yazan kişi/firma')}" value="${e(eski.kesideci || '')}"></label>`
            : `<label class="f"><span>Borçlu</span><input data-f="kesideci" placeholder="${e(secCari?.unvan || '')}" value="${e(eski.kesideci || '')}"></label>
              <label class="f"><span>Kefil</span><input data-f="kefil" value="${e(eski.kefil || '')}"></label>`;
        } else if (cek) {
          h += `<label class="f"><span>Çekin ait olduğu banka hesabımız</span><select data-f="cek_hesap_id"><option value="">-</option>${hs.filter((x) => x.tip === 'banka').map((x) => `<option value="${x.id}">${e(x.ad)}</option>`).join('')}</select></label>`;
        }
        h += acik('İsteğe bağlı');
      }
    } else if (s === 'mahsup') {
      h = `<label class="f full"><span class="req">Mahsup edilecek karşı cari</span><div data-karsi></div></label>${tutar}
        ${acik('Örn: Borcu X firması üstlendi')}
        <div class="full small muted">${tahsilat ? 'Bu carinin borcu azalır, seçilen karşı cari borçlanır.' : 'Bu cariye olan borcumuz azalır, seçilen karşı cari alacaklanır.'}</div>`;
    } else {
      h = tutar + acik('Örn: Müşteri kartı, hediye çeki, puan, takas...');
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
    $('[data-f=hesap_id]', d)?.addEventListener('change', () => ekBilgi(d));
    $('[data-f=tutar]', d)?.addEventListener('input', () => { toplamHesapla(); ekBilgi(d); });
    ekBilgi(d);
    toplamHesapla();
  }

  function ekBilgi(d) {
    const hid = $('[data-f=hesap_id]', d)?.value;
    const hesap = hs.find((h) => String(h.id) === String(hid));
    const pi = $('[data-pos-info]', d);
    if (pi && hesap) {
      const t = parseTL($('[data-f=tutar]', d)?.value);
      pi.textContent = `Komisyon %${hesap.komisyon}${t ? ` (${tl(Math.round(t * hesap.komisyon / 100))})` : ''} · Valör ${hesap.valor_gun} gün sonra hesaba geçer`;
    }
    const kur = $('[data-kur]', d);
    const cariDoviz = secCari?.doviz || 'TRY';
    if (hesap && hesap.doviz !== cariDoviz) {
      if (!$('[data-f=kur]', d)) {
        kur.innerHTML = `<label class="f" style="max-width:260px"><span>Kur (1 ${cariDoviz} = ? ${hesap.doviz})</span><input data-f="kur" inputmode="decimal" placeholder="Örn: 34,25"></label>`;
      }
    } else kur.innerHTML = '';
  }

  function toplamHesapla() {
    const t = $$('#lines [data-f=tutar]').reduce((a, i) => a + (parseTL(i.value) || 0), 0);
    $('#toplam').textContent = tl(t, secCari?.doviz || 'TRY');
  }

  $('#ekle').addEventListener('click', () => satirEkle('nakit'));
  satirEkle(ctx.query.sekil || 'nakit');
  yonCiz();

  if (!$('#bankalar')) {
    document.body.insertAdjacentHTML('beforeend', `<datalist id="bankalar">${['Ziraat Bankası', 'Halkbank', 'VakıfBank', 'İş Bankası', 'Garanti BBVA', 'Yapı Kredi', 'Akbank', 'QNB', 'DenizBank', 'TEB', 'ING', 'Kuveyt Türk', 'Albaraka', 'Şekerbank', 'Fibabanka', 'HSBC', 'Odeabank', 'Vakıf Katılım', 'Ziraat Katılım', 'Türkiye Finans']
      .map((b) => `<option value="${b}">`).join('')}</datalist>`);
  }

  // ---------- Kaydet ----------
  $('#kaydet').addEventListener('click', async () => {
    if (!secCari) return toast('Lütfen cari seçin', 'err');
    const satirlar = [];
    for (const d of $$('#lines .pay-line')) {
      const v = Object.fromEntries($$('[data-f]', d).map((i) => [i.dataset.f, i.value.trim()]));
      const s = d.dataset.sekil;
      const tutar = parseTL(v.tutar);
      if (!tutar || tutar < 0 || Number.isNaN(tutar)) return toast(`${ODEME_SEKLI[s][0]} için geçerli bir tutar girin`, 'err');
      const satir = { sekil: s, tutar, aciklama: v.aciklama || undefined };
      if (v.hesap_id) satir.hesap_id = Number(v.hesap_id);
      if (v.kur) satir.kur = parseNum(v.kur);
      if (v.taksit && v.taksit !== '1') satir.aciklama = [`${v.taksit} taksit`, v.aciklama].filter(Boolean).join(' - ');
      if (s === 'cek' || s === 'senet') {
        if (v.kaynak === 'ciro') {
          if (!v.cek_id) return toast('Ciro edilecek evrakı seçin', 'err');
          satir.cek_id = Number(v.cek_id);
        } else {
          if (!v.vade) return toast('Vade tarihi girin', 'err');
          if (s === 'cek' && !v.no) return toast('Çek numarası girin', 'err');
          satir.cek = { no: v.no, vade: v.vade, banka: v.banka, sube: v.sube, hesap_no: v.hesap_no, kesideci: v.kesideci, kefil: v.kefil, hesap_id: v.cek_hesap_id ? Number(v.cek_hesap_id) : undefined };
        }
      }
      if (s === 'mahsup') {
        if (!d._karsi) return toast('Mahsup için karşı cari seçin', 'err');
        satir.hedef_cari_id = d._karsi.id;
      }
      satirlar.push(satir);
    }
    const btn = $('#kaydet');
    btn.disabled = true;
    try {
      const { islem_id } = await post('/odeme', {
        yon, cari_id: secCari.id, tarih: $('#tarih').value, belge_no: $('#belge').value.trim(), aciklama: $('#aciklama').value.trim(), satirlar,
      });
      toast(yon === 'tahsilat' ? 'Tahsilat kaydedildi' : 'Ödeme kaydedildi', 'ok');
      sonuc(islem_id);
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      btn.disabled = false;
    }
  });

  function sonuc(islem_id) {
    const m = modal({
      title: 'İşlem Kaydedildi',
      body: `<div style="text-align:center;padding:10px 0"><div class="ico" style="width:60px;height:60px;border-radius:50%;margin:0 auto 12px;display:grid;place-items:center;background:var(--green-soft);color:var(--green)">${icon('check')}</div>
        <b>${e(secCari.unvan)}</b><br><span class="muted">${$('#toplam').textContent} ${yon === 'tahsilat' ? 'tahsil edildi' : 'ödendi'}</span></div>`,
      footer: `<button class="btn" data-a="makbuz">${icon('print')} Makbuz Yazdır</button>
        <a class="btn" href="#/cari/${secCari.id}">Cariye Git</a>
        <button class="btn primary" data-a="yeni">Yeni İşlem</button>`,
    });
    $('[data-a=makbuz]', m.el).addEventListener('click', async () => makbuzYazdir(await get(`/islemler/${islem_id}`)));
    $('[data-a=yeni]', m.el).addEventListener('click', () => { m.close(); ctx.yenile(); });
  }
}
